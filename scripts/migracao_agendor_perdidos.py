#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Migração dos negócios PERDIDOS do Agendor para ClickUp + Supabase.

Espelha scripts/migracao_agendor.py (recuperado do histórico do git em
ee7e7f7, commit onde foi originalmente removido), que fez a mesma coisa
para os 438 negócios GANHOS: cria uma tarefa por negócio na lista
"Negócios" do ClickUp, vincula à conta já existente na lista "Contas",
e grava a proposta correspondente no Supabase.

Fonte de dados: cache/agendor_all_deals_fresh.json (não existe planilha
exportada de perdidos — o JSON já tem tudo, incluindo lossReason/lostAt).

Idempotente: usa o custom field "Agendor Deal ID" no ClickUp para
detectar negócios já migrados e não duplicar.

Uso:
  python3 scripts/migracao_agendor_perdidos.py --dry-run   (padrão, não grava nada)
  python3 scripts/migracao_agendor_perdidos.py --live      (grava de fato)
  python3 scripts/migracao_agendor_perdidos.py --live --limit 10   (teste com poucos)
"""

import argparse
import csv
import json
import os
import re
import time
import unicodedata
from collections import Counter, defaultdict
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
    raise SystemExit('SUPABASE_SERVICE_ROLE_KEY não definida no .env — necessária para escrita (RLS bloqueia a anon).')

SUPA_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

NEGOCIOS_LIST_ID = '901326185457'
CONTAS_LIST_ID = '901326185461'
CUSTOM_ITEM_ID_NEGOCIO = 1004

# Custom fields do ClickUp (confirmados ao vivo via GET /list/{id}/field em 2026-08-14)
CF_DEAL_VALUE = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4'
CF_ESTAGIO_VENDA = 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63'
OPT_ESTAGIO_PERDIDO = '7520c5bc-95a4-47aa-8b12-0711f5bc9bfe'
CF_AGENDOR_DEAL_ID = '94d84531-94e7-4f7c-b982-0ab8d9d87b2d'
CF_TIPO_OPORTUNIDADE = '5d384245-0640-4621-a2dd-98370f7efa82'
CF_CRM_ITEM_TYPE = 'bc39138f-fe02-4480-9c08-f1a8a4eefd5d'
OPT_CRM_ITEM_NEGOCIO = 'cd6922b0-34f4-45e3-853a-cba995a2591c'
CF_ENVIAR_AGENDOR = 'c4b20a7f-1244-40f5-b7c6-73e31608845d'
OPT_ENVIAR_ENVIADO = '089ccab9-4078-4ee9-8185-850ea40db940'
# Não usamos CF_DATA_GANHO ("Data de ganho (item)") aqui — não faz sentido para perdidos
# e não existe campo equivalente "Data de Perda" no ClickUp hoje.
# Não usamos CF_NUM_PROPOSTA — a maioria dos negócios perdidos nunca chegou a gerar proposta formal.

TIPO_OPORTUNIDADE_MAP = {
    'PROJETO': 'fa509e92-7528-4a8b-a9bc-11f2f5da3350',
    'GARANTIAS': '52b4285a-1e92-4ecb-b8b9-7a2348461882',
    'GARANTIA': '52b4285a-1e92-4ecb-b8b9-7a2348461882',
    'SERVIÇOS': '2e351ad7-2af5-4532-be83-fe24423a1994',
    'SERVICOS': '2e351ad7-2af5-4532-be83-fe24423a1994',
    'SSU': '62c6d78c-fa67-44d8-b594-66ed63264df1',
    'VOLUMES': '62f161bc-b78b-46b7-a73b-1d8faa1a1246',
    'VOLUME': '62f161bc-b78b-46b7-a73b-1d8faa1a1246',
    'UPGRADE': 'e55ef41f-51e6-436e-bb53-79ff688960c7',
}

# Sem dado equivalente na fonte JSON pros negócios perdidos -> sempre PROJETO
TIPO_OPORTUNIDADE_DEFAULT = 'PROJETO'

ADAPTACOES_NOMES = {
    'MICROSOFT': 'LICENCIAMENTO MICROSOFT',
    'ORACLE': 'LICENÇA ORACLE STD2',
    'PARK PLACE - GARANTIA': 'SUPORTE POS  GARANTIA',
    'CARDSTUDIO2.0 - PROFISSIONAL': 'CARDSTUDIO2.0 - Profissional',
    'CLOUD': 'CLOUD',
    'TAPE': 'BACKUP EM FITA DELL EMC',
}

# Regras de classificação de motivo_perda a partir da descrição do Agendor
# (aplicadas em ordem — a primeira que bater vence)
MOTIVO_KEYWORD_RULES = [
    ('Perdido para Concorrência', [
        'outro parceiro', 'outro fornecedor', 'outra revenda', 'outro revendedor',
        'direto com a', 'direto à', 'concorrente', 'concorrência', 'parceiro direto',
        'fechou com',
    ]),
    ('Falta de Verba/Budget', [
        'orçamento', 'orcamento', 'budget', 'verba', 'aprovação', 'aprovacao',
        'não aprovado', 'nao aprovado', 'sem aprovação', 'sem aprovacao',
    ]),
    ('Preço Alto', [
        'preço', 'preco', 'valor', 'caro',
    ]),
    ('Prazo de Entrega', [
        'prazo', 'entrega', 'atraso',
    ]),
    ('Projeto Cancelado pelo Cliente', [
        'não vamos seguir', 'nao vamos seguir', 'não vai mais', 'nao vai mais',
        'não irá evoluir', 'nao ira evoluir', 'desistiu', 'recurso interno', 'cancelad',
    ]),
]


def normalize_name(s):
    if not s:
        return ''
    s = s.lower().strip()
    # remove acentos (Agendor e ClickUp divergem bastante em acentuação para o mesmo nome de conta)
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[\.\/\-\,\(\)\[\]]', ' ', s)
    s = re.sub(r'\b(ltda|s\/a|sa|s\.a\.|eireli|me|epp|inc|comercial|industrial)\b', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def resolve_distribuidor_id(prod_nome, categoria, ano, dist_map):
    """Reaproveitado verbatim de migracao_agendor.py (mesma lógica usada nos ganhos)."""
    p = (prod_nome or '').upper().strip()
    c = (categoria or '').upper().strip()

    if 'SSU' in p or 'SUPRIMATICA' in p or 'SUPRIMÁTICA' in p or 'SUPRIMATICA' in c or 'SUPRIMÁTICA' in c:
        return dist_map.get('suprimatica')
    if 'PARK PLACE' in p or 'PARK PLACE' in c or 'POS  GARANTIA' in p:
        return dist_map.get('park place')
    if 'OTG' in p or 'OTG' in c:
        return dist_map.get('otg')
    if '4SERVER' in p or '4SERVERS' in c or 'LEGACY' in p or 'LEGACY' in c or 'BROKER' in c:
        return dist_map.get('4server')
    if 'UPGRADE' in p or ('VMWARE' in p and 'OEM' not in p and ano >= 2025):
        return dist_map.get('td synnex')
    return dist_map.get('ingram micro')


MOTIVO_FALLBACK_POR_CATEGORIA = {
    # Quando a descrição não bate com nenhuma palavra-chave, usa a própria
    # categoria do Agendor como sinal secundário (só pros casos inambíguos —
    # "Desistência" e "Produto/Serviço" ficam em "Outros" por serem heterogêneos
    # demais, conforme análise das descrições reais).
    'preço': 'Preço Alto',
    'prazo': 'Prazo de Entrega',
}


def classify_motivo_perda(reason_name, description):
    desc_low = (description or '').lower()
    for categoria_spa, keywords in MOTIVO_KEYWORD_RULES:
        if any(kw in desc_low for kw in keywords):
            base = categoria_spa
            break
    else:
        base = MOTIVO_FALLBACK_POR_CATEGORIA.get((reason_name or '').strip().lower(), 'Outros')

    reason_name = (reason_name or '').strip() or 'Motivo não informado'
    desc_clean = (description or '').strip()
    if desc_clean:
        return f"{base} (Agendor: {reason_name} — {desc_clean[:200]})"
    return f"{base} (Agendor: {reason_name})"


def clickup_api_request(endpoint, method='GET', data=None, retries=3):
    url = f"https://api.clickup.com/api/v2/{endpoint.lstrip('/')}"
    headers = {'Authorization': CLICKUP_TOKEN, 'Content-Type': 'application/json'}

    for attempt in range(retries):
        try:
            resp = requests.request(method, url, headers=headers, json=data, timeout=30)
            time.sleep(0.65)  # throttle seguro
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


def supabase_request(table, method='GET', data=None, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    try:
        resp = requests.request(method, url, headers=SUPA_HEADERS, json=data, timeout=30)
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
    for table in ['propostas', 'itens_proposta']:
        snapshot[table] = supabase_request(table, params='?select=*&limit=5000') or []
    path = 'backups/pre_migracao_perdidos.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f"  Backup salvo em {path} ({sum(len(v) for v in snapshot.values())} registros)")


def load_contas_map():
    print(f"Carregando Contas da lista ClickUp ({CONTAS_LIST_ID})...")
    contas_map = {}
    page = 0
    while True:
        res = clickup_api_request(f"list/{CONTAS_LIST_ID}/task?include_closed=true&page={page}")
        if not res or not res.get('tasks'):
            break
        for c in res['tasks']:
            contas_map[normalize_name(c['name'].strip())] = c['id']
        page += 1
    print(f"  -> {len(contas_map)} contas carregadas e indexadas.")
    return contas_map


def load_existing_negocios_map():
    print(f"Carregando idempotência de Negócios já migrados ({NEGOCIOS_LIST_ID})...")
    existing = {}
    page = 0
    while True:
        res = clickup_api_request(f"list/{NEGOCIOS_LIST_ID}/task?include_closed=true&page={page}")
        if not res or not res.get('tasks'):
            break
        for t in res['tasks']:
            for cf in t.get('custom_fields', []):
                if cf.get('id') == CF_AGENDOR_DEAL_ID and cf.get('value'):
                    existing[str(cf['value']).strip()] = t['id']
        page += 1
    print(f"  -> {len(existing)} negócios já registrados no ClickUp (Agendor Deal ID preenchido).")
    return existing


def match_conta(empresa, contas_map):
    norm_empresa = normalize_name(empresa)
    if not norm_empresa:
        return None
    conta_id = contas_map.get(norm_empresa)
    if conta_id:
        return conta_id
    for norm_cname, cid in contas_map.items():
        if norm_cname and (norm_cname in norm_empresa or norm_empresa in norm_cname):
            return cid
    return None


def main():
    parser = argparse.ArgumentParser(description='Migração dos negócios perdidos do Agendor para ClickUp + Supabase')
    parser.add_argument('--live', action='store_true', help='Executa de fato (grava). Sem essa flag, roda em modo dry-run.')
    parser.add_argument('--limit', type=int, default=None, help='Limita a quantidade de negócios processados (teste)')
    args = parser.parse_args()
    dry_run = not args.live

    print(f"=== MIGRAÇÃO DE NEGÓCIOS PERDIDOS ({'DRY-RUN — nada será gravado' if dry_run else 'LIVE'}) ===\n")

    if not dry_run:
        backup_current_state()

    # 1. Catálogo e distribuidores
    print('\n[1/6] Carregando Catálogo e Distribuidores do Supabase...')
    supa_prods = supabase_request('produtos', params='?select=*&limit=1000') or []
    supa_distribs = supabase_request('distribuidores', params='?select=*') or []
    dist_map = {d['nome'].lower(): d['id'] for d in supa_distribs}
    prod_map = {}
    for p in supa_prods:
        norm_key = p['nome'].strip().upper().replace(' ', '').replace('_', '').replace('-', '')
        prod_map[norm_key] = p['id']
    print(f"  -> {len(supa_prods)} produtos e {len(supa_distribs)} distribuidores carregados.")

    # 2. Contas do ClickUp
    print('\n[2/6] Contas do ClickUp')
    contas_map = load_contas_map()

    # 3. Idempotência
    print('\n[3/6] Idempotência (negócios já migrados)')
    existing_deals_map = load_existing_negocios_map()

    # 4. Fonte de dados
    print('\n[4/6] Lendo cache/agendor_all_deals_fresh.json...')
    with open('cache/agendor_all_deals_fresh.json', encoding='utf-8') as f:
        all_deals = json.load(f)

    def _funil(d):
        stage = d.get('dealStage') or {}
        return (stage.get('funnel') or {}).get('name') or ''

    # Só "Funil de Vendas" — é o mesmo escopo do relatório nativo do Agendor e
    # do que os 438 negócios GANHOS já migrados usam (confirmado: contagem de
    # Ganho no Funil de Vendas bate exatamente 438). Outros funis, como
    # "Registro de Oportunidades", são registros de lead sem valor real
    # (100% R$0) e não entram na métrica comercial de negócios perdidos.
    lost_deals = [
        d for d in all_deals
        if (d.get('dealStatus') or {}).get('name') == 'Perdido' and _funil(d) == 'Funil de Vendas'
    ]
    print(f"  -> {len(lost_deals)} negócios perdidos encontrados (Funil de Vendas).")
    if args.limit:
        lost_deals = lost_deals[:args.limit]
        print(f"  -> Limitado a {len(lost_deals)} para este teste.")

    # 5. Processamento
    print(f"\n[5/6] Processando {len(lost_deals)} negócios perdidos...")

    created_count = 0
    reused_count = 0
    conta_linked_count = 0
    conta_missing_count = 0
    itens_gravados_count = 0
    propostas_existentes_count = 0
    propostas_a_criar_count = 0
    motivo_counter = Counter()
    relatorio_adaptacoes = []
    contas_sem_match = []
    propostas_sem_itens = []

    for idx, deal in enumerate(lost_deals, 1):
        ag_id = str(deal.get('id'))
        titulo = deal.get('title') or f'Negócio {ag_id}'
        org = deal.get('organization') or {}
        empresa = (org.get('name') or '').strip()
        valor = float(deal.get('value') or 0.0)
        owner = deal.get('owner') or {}
        responsavel = (owner.get('name') or 'Vendedor CRM').strip()

        # endTime ("Data de conclusão"), não lostAt — confirmado batendo exatamente com os
        # relatórios nativos do Agendor por ano (2023/2024/2025). lostAt reflete quando o
        # registro foi formalmente fechado no Agendor, que pode ser muito depois do negócio
        # ter morrido de fato (ex: uma limpeza em massa em ago/2026 fechou dezenas de deals
        # antigos de 2023-2024, o que inflaria o ano errado se usássemos lostAt aqui).
        end_time = deal.get('endTime') or deal.get('lostAt') or ''
        data_fechamento_iso = end_time[:10] if end_time else datetime.now().strftime('%Y-%m-%d')
        ano_fechamento = int(data_fechamento_iso[:4])

        loss_reason = deal.get('lossReason') or {}
        motivo_perda = classify_motivo_perda(loss_reason.get('name'), loss_reason.get('description'))
        motivo_counter[motivo_perda.split(' (Agendor:')[0]] += 1

        products_entities = deal.get('products_entities') or []

        print(f"\n[{idx}/{len(lost_deals)}] Negócio {ag_id}: {titulo[:60]} (R$ {valor:,.2f})")

        conta_id = match_conta(empresa, contas_map)
        if conta_id:
            conta_linked_count += 1
            print(f"  [CONTA VINCULADA] {empresa} -> ClickUp Conta ID: {conta_id}")
        else:
            conta_missing_count += 1
            print(f"  [CONTA SEM MATCH] {empresa!r} registrada para quarentena.")
            contas_sem_match.append({'deal_id': ag_id, 'titulo': titulo, 'empresa': empresa, 'valor': valor})

        clickup_task_id = existing_deals_map.get(ag_id)

        if not clickup_task_id:
            custom_fields_payload = [
                {'id': CF_DEAL_VALUE, 'value': valor},
                {'id': CF_ESTAGIO_VENDA, 'value': OPT_ESTAGIO_PERDIDO},
                {'id': CF_AGENDOR_DEAL_ID, 'value': ag_id},
                {'id': CF_TIPO_OPORTUNIDADE, 'value': TIPO_OPORTUNIDADE_MAP[TIPO_OPORTUNIDADE_DEFAULT]},
                {'id': CF_CRM_ITEM_TYPE, 'value': OPT_CRM_ITEM_NEGOCIO},
                {'id': CF_ENVIAR_AGENDOR, 'value': OPT_ENVIAR_ENVIADO},
            ]
            task_payload = {
                'name': titulo,
                'status': 'perdido/cancelado',
                'custom_item_id': CUSTOM_ITEM_ID_NEGOCIO,
                'tags': ['migracao-agendor-perdidos'],
                'custom_fields': custom_fields_payload,
            }

            if dry_run:
                print(f"  [DRY-RUN] Criaria tarefa no ClickUp (Estágio=Perdido, status=perdido/cancelado)")
                created_count += 1
                clickup_task_id = f"DRYRUN-{ag_id}"
            else:
                created_task = clickup_api_request(f"list/{NEGOCIOS_LIST_ID}/task", method='POST', data=task_payload)
                if not created_task or not created_task.get('id'):
                    print(f"  [ERRO] Falha ao criar task no ClickUp para o deal {ag_id}. Pulando.")
                    continue
                clickup_task_id = created_task['id']
                existing_deals_map[ag_id] = clickup_task_id
                created_count += 1
                print(f"  [CLICKUP CRIADO] Task ID: {clickup_task_id}")
                if conta_id:
                    clickup_api_request(f"task/{clickup_task_id}/link/{conta_id}", method='POST')
        else:
            reused_count += 1
            print(f"  [CLICKUP EXISTENTE] Task ID: {clickup_task_id} reaproveitada.")

        # Proposta no Supabase — checagem (GET, leitura) roda mesmo em dry-run, só a escrita é que é condicional
        is_fake_dryrun_id = str(clickup_task_id).startswith('DRYRUN-')
        existing_props = [] if is_fake_dryrun_id else (supabase_request('propostas', params=f"?clickup_negocio_id=eq.{clickup_task_id}") or [])

        if dry_run:
            if existing_props:
                propostas_existentes_count += 1
                print(f"  [DRY-RUN] Proposta já existe (ID {existing_props[0]['id']}) — não seria recriada.")
            else:
                propostas_a_criar_count += 1
                print(f"  [DRY-RUN] Gravaria proposta: situacao=Perdido, motivo_perda={motivo_perda[:60]}..., "
                      f"total_proposta={valor:.2f}, data_fechamento={data_fechamento_iso}, criado_por={responsavel}")
                if products_entities:
                    print(f"  [DRY-RUN] Gravaria {len(products_entities)} itens de proposta.")
            continue

        supa_proposta_id = None
        proposta_is_new = False

        if existing_props:
            supa_proposta_id = existing_props[0]['id']
            print(f"  [SUPABASE PROPOSTA EXISTENTE] ID: {supa_proposta_id}")
        else:
            prop_payload = {
                'clickup_negocio_id': clickup_task_id,
                'versao': 'vA',
                'situacao': 'Perdido',
                'motivo_perda': motivo_perda,
                'total_proposta': valor,
                'data_fechamento': data_fechamento_iso,
                'criado_por': responsavel,
                'cenario': TIPO_OPORTUNIDADE_DEFAULT,
                # Desde 18/08/2026 existe um trigger AFTER INSERT em propostas
                # (sync_proposta_tecnica_clickup_insert, ver migrations/20260818k_usuarios_clickup.sql)
                # que cria uma subtask "Enviar Proposta vX" no ClickUp sempre que
                # clickup_proposta_tecnica_id vem NULL. Pré-preenchendo com um
                # marcador aqui, a Edge Function vê o campo já setado e não cria
                # a subtask — evita ruído no ClickUp para negócios já mortos.
                'clickup_proposta_tecnica_id': f'HISTORICO-PERDIDO-AGENDOR-{ag_id}',
            }
            inserted_prop = supabase_request('propostas', method='POST', data=prop_payload)
            if inserted_prop:
                supa_proposta_id = inserted_prop[0]['id']
                proposta_is_new = True
                print(f"  [SUPABASE PROPOSTA CRIADA] ID: {supa_proposta_id}")

        if not supa_proposta_id:
            print(f"  [ERRO PROPOSTA] Não foi possível gravar proposta para {clickup_task_id}.")
            continue

        if proposta_is_new and products_entities:
            itens_deal_count = 0
            for ep in products_entities:
                prod_raw = (ep.get('name') or '').strip()
                if not prod_raw:
                    continue
                categoria = (ep.get('category') or '').strip()
                prod_adapted = ADAPTACOES_NOMES.get(prod_raw.upper(), prod_raw)
                norm_item_key = prod_adapted.upper().replace(' ', '').replace('_', '').replace('-', '')
                produto_uuid = prod_map.get(norm_item_key)

                if not produto_uuid:
                    produto_uuid = supa_prods[0]['id'] if supa_prods else None
                    relatorio_adaptacoes.append({
                        'deal_id': ag_id, 'titulo': titulo, 'produto_original': prod_raw,
                        'produto_mapeado': supa_prods[0]['nome'] if supa_prods else '(nenhum)',
                    })
                elif prod_raw.upper() in ADAPTACOES_NOMES:
                    relatorio_adaptacoes.append({
                        'deal_id': ag_id, 'titulo': titulo, 'produto_original': prod_raw,
                        'produto_mapeado': prod_adapted,
                    })

                distribuidor_uuid = resolve_distribuidor_id(prod_adapted, categoria, ano_fechamento, dist_map)

                qty = ep.get('quantity') or 1
                qty_int = int(round(qty)) if qty and qty > 0 else 1
                total_val = ep.get('totalValue', 0.0) or 0.0
                preco_unit = round(total_val / qty_int, 2) if qty_int else round(total_val, 2)

                item_payload = {
                    'proposta_id': supa_proposta_id,
                    'produto_id': produto_uuid,
                    'distribuidor_id': distribuidor_uuid,
                    'quantidade': qty_int,
                    'preco_unitario': preco_unit,
                }
                if supabase_request('itens_proposta', method='POST', data=item_payload):
                    itens_deal_count += 1
                    itens_gravados_count += 1

            print(f"  [ITENS GRAVADOS] {itens_deal_count} de {len(products_entities)} produtos.")
            if itens_deal_count == 0:
                propostas_sem_itens.append({'deal_id': ag_id, 'titulo': titulo, 'valor': valor})

    # 6. Relatórios
    print('\n[6/6] Gerando relatórios de auditoria...')
    os.makedirs('docs', exist_ok=True)
    os.makedirs('reports', exist_ok=True)

    with open('docs/relatorio_auditoria_perdidos.md', 'w', encoding='utf-8') as f:
        f.write('# Relatório de Auditoria — Migração de Negócios Perdidos\n\n')
        f.write(f"> Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M:%S')} "
                f"({'DRY-RUN' if dry_run else 'LIVE'}) para validação manual.\n\n")
        f.write('## Produtos adaptados/sem match no catálogo\n\n')
        f.write('| Agendor Deal ID | Título | Produto Original | Produto Mapeado |\n')
        f.write('|---|---|---|---|\n')
        for item in relatorio_adaptacoes:
            f.write(f"| {item['deal_id']} | {item['titulo']} | {item['produto_original']} | {item['produto_mapeado']} |\n")

    with open('reports/contas_sem_match_perdidos.csv', 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['Agendor Deal ID', 'Titulo', 'Empresa', 'Valor'])
        for c in contas_sem_match:
            w.writerow([c['deal_id'], c['titulo'], c['empresa'], c['valor']])

    with open('reports/propostas_sem_itens_perdidos.csv', 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['Agendor Deal ID', 'Titulo', 'Valor'])
        for p in propostas_sem_itens:
            w.writerow([p['deal_id'], p['titulo'], p['valor']])

    print('\n=== RESUMO DA EXECUÇÃO ===')
    print(f"Negócios processados: {len(lost_deals)}")
    print(f"Tarefas criadas no ClickUp: {created_count}")
    print(f"Tarefas já existentes (reaproveitadas): {reused_count}")
    print(f"Contas vinculadas: {conta_linked_count}")
    print(f"Contas sem match: {conta_missing_count} (ver reports/contas_sem_match_perdidos.csv)")
    if dry_run:
        print(f"Propostas já existentes no Supabase (não seriam recriadas): {propostas_existentes_count}")
        print(f"Propostas que seriam criadas no Supabase: {propostas_a_criar_count}")
    else:
        print(f"Itens de proposta gravados: {itens_gravados_count}")
        print(f"Propostas sem itens: {len(propostas_sem_itens)} (ver reports/propostas_sem_itens_perdidos.csv)")
    print('\nDistribuição de motivo_perda classificado:')
    for motivo, count in motivo_counter.most_common():
        print(f"  {motivo}: {count}")
    print('\n=== PROCESSO CONCLUÍDO ===')
    if dry_run:
        print('\n(Modo DRY-RUN — nada foi gravado. Rode com --live para executar de fato.)')


if __name__ == '__main__':
    main()
