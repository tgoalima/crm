#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Migração de Contas e Contatos do ClickUp para o Supabase (tabelas `contas` e
`contatos`, criadas em supabase/migrations/20260817_contas_contatos.sql).

Objetivo: trazer as ~443 Contas e ~327 Contatos das listas do ClickUp
(901326185461 / 901326185456) para o Supabase, e popular `propostas.conta_id`
pros negócios existentes — hoje essas entidades só existem no ClickUp,
resolvidas em tempo real em cada consulta do MCP (gargalo de latência já
documentado em docs/resumo.md).

Estratégia de custo de API: em vez de buscar linked_tasks tarefa a tarefa
pra cada Negócio/Contato (centenas de chamadas), buscamos os IDs de todos os
Negócios e Contatos uma vez (paginado, barato), e então buscamos linked_tasks
só do lado das Contas (uma chamada por conta, ~443 no total) — daí
classificamos cada ID vinculado como negócio ou contato usando os conjuntos
de IDs já carregados. Throttle de 0.65s por chamada (mesmo padrão de
scripts/migracao_agendor_perdidos.py) pra respeitar o rate limit do ClickUp
(~100 req/min).

Idempotente: upsert via `on_conflict` nas colunas UNIQUE
(`clickup_account_id` / `clickup_contact_id`).

Uso:
  python3 scripts/migracao_contas_contatos_clickup.py --dry-run   (padrão, não grava nada)
  python3 scripts/migracao_contas_contatos_clickup.py --live      (grava de fato)
  python3 scripts/migracao_contas_contatos_clickup.py --live --limit 10   (teste com poucas contas)
"""

import argparse
import json
import os
import re
import time
import unicodedata
from collections import Counter
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv()

CLICKUP_TOKEN = os.getenv('CLICKUP_TOKEN')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not CLICKUP_TOKEN:
    raise SystemExit('CLICKUP_TOKEN não definido no .env')
if not SUPABASE_KEY:
    raise SystemExit('SUPABASE_SERVICE_ROLE_KEY não definida no .env — necessária para escrita (RLS bloqueia a anon pra upsert em massa).')

SUPA_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}
SUPA_HEADERS_UPSERT = {**SUPA_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation'}

CONTAS_LIST_ID = '901326185461'
CONTATOS_LIST_ID = '901326185456'
NEGOCIOS_LIST_ID = '901326185457'

# Custom fields confirmados ao vivo via GET /list/{id}/field em 17/08/2026
CF_CONTA = {
    'agendor_id': 'Agendor ID',
    'razao_social': 'Razão social',
    'cnpj': 'CNPJ',
    'email': 'E-mail',
    'telefone': 'Telefone',
    'cep': 'CEP',
    'rua': 'Rua',
    'cidade': 'Cidade',
    'estado': 'Estado',
    'industry': 'Industry',
    'account_tier': 'Account Tier',
    'billing_cycle': 'Billing Cycle',
}
CF_CONTATO = {
    'email': 'Email',
    'cargo': 'Cargo',
    'celular': 'Celular',
    'whatsapp': 'WhatsApp',
    'champion': 'Champion',
}


def clickup_api_request(endpoint, method='GET', data=None, retries=3):
    url = f"https://api.clickup.com/api/v2/{endpoint.lstrip('/')}"
    headers = {'Authorization': CLICKUP_TOKEN, 'Content-Type': 'application/json'}

    for attempt in range(retries):
        try:
            resp = requests.request(method, url, headers=headers, json=data, timeout=30)
            time.sleep(0.65)  # throttle seguro (~100 req/min)
            if resp.status_code == 429:
                wait_time = (attempt + 1) * 3
                print(f"  [Rate Limit 429] Aguardando {wait_time}s...")
                time.sleep(wait_time)
                continue
            if not resp.ok:
                print(f"  [HTTP {resp.status_code}] Erro em {endpoint}: {resp.text[:300]}")
                return None
            if not resp.content:
                return {}
            return resp.json()
        except requests.RequestException as ex:
            print(f"  [Exceção] em {endpoint}: {ex}")
            time.sleep(1)
    return None


def supabase_request(table, method='GET', data=None, params='', upsert=False):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    headers = SUPA_HEADERS_UPSERT if upsert else SUPA_HEADERS
    try:
        resp = requests.request(method, url, headers=headers, json=data, timeout=30)
        if not resp.ok:
            print(f"  [Supabase HTTP {resp.status_code}] em {table}: {resp.text[:300]}")
            return None
        if not resp.content:
            return []
        return resp.json()
    except requests.RequestException as ex:
        print(f"  [Supabase Exceção] em {table}: {ex}")
        return None


def backup_current_state():
    print('=== Backup do estado atual ===')
    os.makedirs('backups', exist_ok=True)
    snapshot = {}
    for table in ['contas', 'contatos']:
        snapshot[table] = supabase_request(table, params='?select=*&limit=5000') or []
    snapshot['propostas_conta_id'] = supabase_request(
        'propostas', params='?select=id,clickup_negocio_id,conta_id&conta_id=not.is.null&limit=5000'
    ) or []
    path = 'backups/pre_migracao_contas_contatos.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f"  Backup salvo em {path} ({sum(len(v) for v in snapshot.values())} registros)")


def cf_value(task, field_name):
    for f in task.get('custom_fields', []):
        if f.get('name') == field_name:
            val = f.get('value')
            if val is None or val == '':
                return None
            return val
    return None


def fetch_all_tasks(list_id, label):
    tasks = []
    page = 0
    while True:
        res = clickup_api_request(f"list/{list_id}/task?include_closed=true&page={page}")
        if not res or not res.get('tasks'):
            break
        tasks.extend(res['tasks'])
        page += 1
    print(f"  -> {len(tasks)} {label} carregados.")
    return tasks


def get_linked_task_ids(task_detail, own_id):
    """Mesma lógica de desambiguação task_id/link_id do MCP (clickup.ts):
    o campo que representa 'a outra ponta' do link varia por registro."""
    linked = task_detail.get('linked_tasks') or []
    ids = []
    for l in linked:
        other = l.get('link_id') if l.get('task_id') == own_id else l.get('task_id')
        if not other and l.get('task_id') != own_id:
            other = l.get('task_id')
        if other:
            ids.append(other)
    return ids


def main():
    parser = argparse.ArgumentParser(description='Migração de Contas/Contatos do ClickUp para o Supabase')
    parser.add_argument('--live', action='store_true', help='Executa de fato (grava). Sem essa flag, roda em modo dry-run.')
    parser.add_argument('--limit', type=int, default=None, help='Limita a quantidade de Contas processadas para resolução de vínculos (teste)')
    args = parser.parse_args()
    dry_run = not args.live

    print(f"=== MIGRAÇÃO CONTAS/CONTATOS ({'DRY-RUN — nada será gravado' if dry_run else 'LIVE'}) ===\n")

    if not dry_run:
        backup_current_state()

    print('\n[1/5] Carregando Contas, Contatos e Negócios do ClickUp (listagem, sem custo extra de linked_tasks ainda)...')
    contas_tasks = fetch_all_tasks(CONTAS_LIST_ID, 'Contas')
    contatos_tasks = fetch_all_tasks(CONTATOS_LIST_ID, 'Contatos')
    negocios_tasks = fetch_all_tasks(NEGOCIOS_LIST_ID, 'Negócios')

    negocio_ids = {t['id'] for t in negocios_tasks}
    contato_ids = {t['id'] for t in contatos_tasks}

    if args.limit:
        contas_tasks = contas_tasks[:args.limit]
        print(f"  -> Limitado a {len(contas_tasks)} Contas para este teste.")

    # 2. Upsert de Contas (dados já vêm completos na listagem, sem chamada extra)
    print(f"\n[2/5] {'Simulando' if dry_run else 'Gravando'} upsert de {len(contas_tasks)} Contas...")
    contas_payload = []
    for t in contas_tasks:
        assignees = t.get('assignees') or []
        resp = assignees[0] if assignees else {}
        contas_payload.append({
            'clickup_account_id': t['id'],
            'nome': t.get('name') or '',
            'agendor_id': cf_value(t, CF_CONTA['agendor_id']),
            'razao_social': cf_value(t, CF_CONTA['razao_social']),
            'cnpj': cf_value(t, CF_CONTA['cnpj']),
            'email': cf_value(t, CF_CONTA['email']),
            'telefone': cf_value(t, CF_CONTA['telefone']),
            'cep': cf_value(t, CF_CONTA['cep']),
            'rua': cf_value(t, CF_CONTA['rua']),
            'cidade': cf_value(t, CF_CONTA['cidade']),
            'estado': cf_value(t, CF_CONTA['estado']),
            'industry': cf_value(t, CF_CONTA['industry']),
            'account_tier': cf_value(t, CF_CONTA['account_tier']),
            'billing_cycle': cf_value(t, CF_CONTA['billing_cycle']),
            'status': (t.get('status') or {}).get('status'),
            'responsavel_nome': resp.get('username'),
            'responsavel_clickup_id': str(resp.get('id')) if resp.get('id') else None,
        })

    conta_id_por_clickup_id = {}
    if dry_run:
        print(f"  [DRY-RUN] Gravaria {len(contas_payload)} contas. Exemplo: {json.dumps(contas_payload[0], ensure_ascii=False)[:300] if contas_payload else '(nenhuma)'}")
    else:
        CHUNK = 200
        for i in range(0, len(contas_payload), CHUNK):
            chunk = contas_payload[i:i + CHUNK]
            result = supabase_request(
                'contas', method='POST', data=chunk,
                params='?on_conflict=clickup_account_id', upsert=True,
            )
            if result:
                for row in result:
                    conta_id_por_clickup_id[row['clickup_account_id']] = row['id']
        print(f"  -> {len(conta_id_por_clickup_id)} contas upsertadas.")

    # 3. Upsert de Contatos (conta_id resolvido depois, no passo 4, via linked_tasks da Conta)
    print(f"\n[3/5] {'Simulando' if dry_run else 'Gravando'} upsert de {len(contatos_tasks)} Contatos...")
    contatos_payload = []
    for t in contatos_tasks:
        champion_val = cf_value(t, CF_CONTATO['champion'])
        contatos_payload.append({
            'clickup_contact_id': t['id'],
            'nome': t.get('name') or '',
            'email': cf_value(t, CF_CONTATO['email']),
            'cargo': cf_value(t, CF_CONTATO['cargo']),
            'celular': cf_value(t, CF_CONTATO['celular']),
            'whatsapp': cf_value(t, CF_CONTATO['whatsapp']),
            'champion': bool(champion_val) if champion_val is not None else False,
        })

    if dry_run:
        print(f"  [DRY-RUN] Gravaria {len(contatos_payload)} contatos. Exemplo: {json.dumps(contatos_payload[0], ensure_ascii=False)[:300] if contatos_payload else '(nenhum)'}")
    else:
        CHUNK = 200
        for i in range(0, len(contatos_payload), CHUNK):
            chunk = contatos_payload[i:i + CHUNK]
            supabase_request(
                'contatos', method='POST', data=chunk,
                params='?on_conflict=clickup_contact_id', upsert=True,
            )
        print(f"  -> {len(contatos_payload)} contatos upsertados.")

    # 4. Resolver vínculos Conta<->Negócio e Conta<->Contato via linked_tasks
    #    (um GET por Conta — é o lado mais barato, ver docstring do módulo)
    print(f"\n[4/5] Resolvendo vínculos (linked_tasks) para {len(contas_tasks)} Contas...")
    negocio_para_conta = {}
    contato_para_conta = {}
    vinculos_negocio_count = 0
    vinculos_contato_count = 0

    for idx, t in enumerate(contas_tasks, 1):
        conta_clickup_id = t['id']
        detail = clickup_api_request(f"task/{conta_clickup_id}")
        if not detail:
            continue
        linked_ids = get_linked_task_ids(detail, conta_clickup_id)
        for lid in linked_ids:
            if lid in negocio_ids:
                negocio_para_conta[lid] = conta_clickup_id
                vinculos_negocio_count += 1
            elif lid in contato_ids:
                contato_para_conta[lid] = conta_clickup_id
                vinculos_contato_count += 1
        if idx % 50 == 0:
            print(f"  ... {idx}/{len(contas_tasks)} contas processadas")

    print(f"  -> {vinculos_negocio_count} vínculos Conta<->Negócio, {vinculos_contato_count} vínculos Conta<->Contato encontrados.")

    # 5. Gravar conta_id em propostas (via clickup_negocio_id) e em contatos
    print(f"\n[5/5] {'Simulando' if dry_run else 'Gravando'} conta_id em propostas e contatos...")
    if dry_run:
        print(f"  [DRY-RUN] Atualizaria conta_id em propostas para até {len(negocio_para_conta)} negócios distintos.")
        print(f"  [DRY-RUN] Atualizaria conta_id em até {len(contato_para_conta)} contatos.")
    else:
        propostas_atualizadas = 0
        for negocio_id, conta_clickup_id in negocio_para_conta.items():
            conta_uuid = conta_id_por_clickup_id.get(conta_clickup_id)
            if not conta_uuid:
                continue
            result = supabase_request(
                'propostas', method='PATCH', data={'conta_id': conta_uuid},
                params=f'?clickup_negocio_id=eq.{negocio_id}',
            )
            if result:
                propostas_atualizadas += len(result)
        print(f"  -> {propostas_atualizadas} propostas atualizadas com conta_id.")

        contatos_atualizados = 0
        for contato_clickup_id, conta_clickup_id in contato_para_conta.items():
            conta_uuid = conta_id_por_clickup_id.get(conta_clickup_id)
            if not conta_uuid:
                continue
            result = supabase_request(
                'contatos', method='PATCH', data={'conta_id': conta_uuid},
                params=f'?clickup_contact_id=eq.{contato_clickup_id}',
            )
            if result:
                contatos_atualizados += len(result)
        print(f"  -> {contatos_atualizados} contatos atualizados com conta_id.")

    print('\n=== RESUMO DA EXECUÇÃO ===')
    print(f"Contas processadas: {len(contas_tasks)}")
    print(f"Contatos processados: {len(contatos_tasks)}")
    print(f"Vínculos Conta<->Negócio encontrados: {vinculos_negocio_count}")
    print(f"Vínculos Conta<->Contato encontrados: {vinculos_contato_count}")

    status_counter = Counter((t.get('status') or {}).get('status') for t in contas_tasks)
    print('\nDistribuição de status das Contas:')
    for status, count in status_counter.most_common():
        print(f"  {status}: {count}")

    print('\n=== PROCESSO CONCLUÍDO ===')
    if dry_run:
        print('\n(Modo DRY-RUN — nada foi gravado. Rode com --live para executar de fato.)')


if __name__ == '__main__':
    main()
