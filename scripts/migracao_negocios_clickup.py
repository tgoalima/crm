#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Migração dos Negócios do ClickUp (lista 901326185457) para a tabela
`negocios` no Supabase (supabase/migrations/20260817b_negocios.sql),
incluindo o estágio do funil de vendas (custom field "Estágio da Venda").

Objetivo: eliminar a dependência do ClickUp nas leituras de
resumo_forecast/negocios_fechados/historico_cliente do MCP, e servir de base
para a SPA passar a ser a fonte de verdade do estágio (escrevendo pro
ClickUp em vez de só ler de lá).

Resolução de conta_id: reaproveita a mesma técnica de
scripts/migracao_contas_contatos_clickup.py — um GET por Conta (não por
Negócio), lendo linked_tasks e classificando cada ID vinculado usando os
conjuntos de IDs de Negócios/Contatos já carregados via listagem paginada
(barata). ~443 chamadas ao ClickUp, throttle de 0.65s (~5 min).

Idempotente: upsert via on_conflict=clickup_negocio_id.

Uso:
  python3 scripts/migracao_negocios_clickup.py --dry-run   (padrão, não grava nada)
  python3 scripts/migracao_negocios_clickup.py --live      (grava de fato)
  python3 scripts/migracao_negocios_clickup.py --live --limit 10   (teste com poucas contas)
"""

import argparse
import json
import os
import time
from collections import Counter

import requests
from dotenv import load_dotenv

load_dotenv()

CLICKUP_TOKEN = os.getenv('CLICKUP_TOKEN')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not CLICKUP_TOKEN:
    raise SystemExit('CLICKUP_TOKEN não definido no .env')
if not SUPABASE_KEY:
    raise SystemExit('SUPABASE_SERVICE_ROLE_KEY não definida no .env')

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

CF_ESTAGIO_VENDA = 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63'
CF_DEAL_VALUE = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4'

# Mesma ordem/IDs confirmados ao vivo e já usados em
# supabase/functions/mcp-brain/clickup.ts (resolveEstagioNome)
ESTAGIO_OPTIONS = [
    ('3c4bcf81-91d3-40e7-97ae-a67b6bccea0c', 'Registro'),
    ('1cc9d0c7-cbee-45ff-8bbe-ac4a29ec9f46', 'Qualificação'),
    ('5366c82c-2317-4978-8f4d-b41cb953be35', 'Proposta'),
    ('97c5f286-e054-4351-b368-25977e8c429d', 'Desenvolvimento'),
    ('4863ea9f-ccd7-4b49-9aa5-685ee479e091', 'Negociação'),
    ('22e91843-d067-4358-8238-6e619fc66653', 'Termo de aceite'),
    ('c59ad408-ae8e-45d7-804f-eb9e6cd2935b', 'Ganho'),
    ('7520c5bc-95a4-47aa-8b12-0711f5bc9bfe', 'Perdido'),
    ('c231299c-44f8-4f5e-ad8e-58f7b8e01213', 'Congelado'),
]
ESTAGIO_ID_TO_NOME = dict(ESTAGIO_OPTIONS)
ESTAGIO_INDEX_TO_NOME = [nome for _, nome in ESTAGIO_OPTIONS]


def resolve_estagio_nome(raw_value):
    if raw_value is None:
        return None
    val = raw_value[0] if isinstance(raw_value, list) else raw_value
    val_str = str(val)
    if val_str in ESTAGIO_ID_TO_NOME:
        return ESTAGIO_ID_TO_NOME[val_str]
    try:
        idx = int(val_str)
        if 0 <= idx < len(ESTAGIO_INDEX_TO_NOME):
            return ESTAGIO_INDEX_TO_NOME[idx]
    except ValueError:
        pass
    return None


def clickup_api_request(endpoint, retries=3):
    url = f"https://api.clickup.com/api/v2/{endpoint.lstrip('/')}"
    headers = {'Authorization': CLICKUP_TOKEN}
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            time.sleep(0.65)
            if resp.status_code == 429:
                wait_time = (attempt + 1) * 3
                print(f"  [Rate Limit 429] Aguardando {wait_time}s...")
                time.sleep(wait_time)
                continue
            if not resp.ok:
                print(f"  [HTTP {resp.status_code}] Erro em {endpoint}: {resp.text[:300]}")
                return None
            return resp.json() if resp.content else {}
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
        return resp.json() if resp.content else []
    except requests.RequestException as ex:
        print(f"  [Supabase Exceção] em {table}: {ex}")
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
    linked = task_detail.get('linked_tasks') or []
    ids = []
    for l in linked:
        other = l.get('link_id') if l.get('task_id') == own_id else l.get('task_id')
        if other:
            ids.append(other)
    return ids


def cf_value(task, field_id):
    for f in task.get('custom_fields', []):
        if f.get('id') == field_id:
            return f.get('value')
    return None


def main():
    parser = argparse.ArgumentParser(description='Migração de Negócios (com estágio) do ClickUp para o Supabase')
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--limit', type=int, default=None, help='Limita quantas Contas processar na resolução de vínculos (teste)')
    args = parser.parse_args()
    dry_run = not args.live

    print(f"=== MIGRAÇÃO NEGÓCIOS ({'DRY-RUN' if dry_run else 'LIVE'}) ===\n")

    print('[1/4] Carregando Negócios, Contas e Contatos do ClickUp...')
    negocios_tasks = fetch_all_tasks(NEGOCIOS_LIST_ID, 'Negócios')
    contas_tasks = fetch_all_tasks(CONTAS_LIST_ID, 'Contas')
    contatos_tasks = fetch_all_tasks(CONTATOS_LIST_ID, 'Contatos')
    contato_ids = {t['id'] for t in contatos_tasks}
    negocio_ids = {t['id'] for t in negocios_tasks}

    if args.limit:
        contas_tasks = contas_tasks[:args.limit]
        print(f"  -> Limitado a {len(contas_tasks)} Contas para resolução de vínculos.")

    print('\n[2/4] Carregando mapa clickup_account_id -> id (Supabase)...')
    contas_supabase = supabase_request('contas', params='?select=id,clickup_account_id&limit=1000') or []
    conta_id_por_clickup_id = {c['clickup_account_id']: c['id'] for c in contas_supabase}
    print(f"  -> {len(conta_id_por_clickup_id)} contas carregadas.")

    print(f"\n[3/4] Resolvendo vínculos Conta<->Negócio para {len(contas_tasks)} Contas...")
    negocio_para_conta_clickup_id = {}
    for idx, t in enumerate(contas_tasks, 1):
        detail = clickup_api_request(f"task/{t['id']}")
        if not detail:
            continue
        for lid in get_linked_task_ids(detail, t['id']):
            if lid in negocio_ids:
                negocio_para_conta_clickup_id[lid] = t['id']
        if idx % 50 == 0:
            print(f"  ... {idx}/{len(contas_tasks)} contas processadas")
    print(f"  -> {len(negocio_para_conta_clickup_id)} negócios com conta resolvida.")

    print(f"\n[4/4] {'Simulando' if dry_run else 'Gravando'} upsert de {len(negocios_tasks)} Negócios...")
    payload = []
    estagio_counter = Counter()
    for t in negocios_tasks:
        estagio = resolve_estagio_nome(cf_value(t, CF_ESTAGIO_VENDA))
        estagio_counter[estagio or '(sem estágio)'] += 1
        valor_raw = cf_value(t, CF_DEAL_VALUE)
        conta_clickup_id = negocio_para_conta_clickup_id.get(t['id'])
        payload.append({
            'clickup_negocio_id': t['id'],
            'nome': t.get('name') or '',
            'conta_id': conta_id_por_clickup_id.get(conta_clickup_id) if conta_clickup_id else None,
            'estagio': estagio,
            'valor_clickup_fallback': float(valor_raw) if valor_raw not in (None, '') else None,
        })

    if dry_run:
        print(f"  [DRY-RUN] Gravaria {len(payload)} negócios. Exemplo: {json.dumps(payload[0], ensure_ascii=False)[:300] if payload else '(nenhum)'}")
    else:
        CHUNK = 200
        gravados = 0
        for i in range(0, len(payload), CHUNK):
            chunk = payload[i:i + CHUNK]
            result = supabase_request('negocios', method='POST', data=chunk, params='?on_conflict=clickup_negocio_id', upsert=True)
            if result:
                gravados += len(result)
        print(f"  -> {gravados} negócios upsertados.")

    print('\n=== RESUMO ===')
    print(f"Negócios processados: {len(negocios_tasks)}")
    print(f"Vínculos Conta<->Negócio resolvidos: {len(negocio_para_conta_clickup_id)}")
    print('\nDistribuição de estágio:')
    for estagio, count in estagio_counter.most_common():
        print(f"  {estagio}: {count}")

    if dry_run:
        print('\n(Modo DRY-RUN — nada foi gravado. Rode com --live para executar de fato.)')


if __name__ == '__main__':
    main()
