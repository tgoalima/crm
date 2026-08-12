#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Correção dos bugs de fabricante/distribuidor encontrados na auditoria
(scripts/auditoria_fabricante_distribuidor.py). Faz backup do estado atual
antes de qualquer escrita. Escopo:

  1. Cria distribuidor "Legacy TI" (não existia).
  2. Corrige 7 produtos com fabricante corrompido/inconsistente no catálogo.
  3. Renomeia produto "SUPORTE POS  GARANTIA" -> "PARK PLACE - GARANTIA".
  4. Remove produto fantasma "Task Name" (0 referências).
  5. Corrige itens_proposta.distribuidor_id para VMware Open (pré-fev/2025),
     Park Place, Legacy TI (pré-25/fev/2025) e OTG.
"""

import os
import json
import csv
from collections import defaultdict
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
if not SUPABASE_KEY:
    raise SystemExit('SUPABASE_SERVICE_ROLE_KEY não definida no .env — necessária para escrita (RLS bloqueia a anon).')
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

VMWARE_CUTOFF = '2025-02-01'
LEGACY_4SERVER_CUTOFF = '2025-02-25'

CATALOG_FIXES = {
    # nome_produto_exato: novo_fabricante
    'LEGACY TI': 'LEGACY TI',
    'FUJITSU': 'FUJITSU',
    'UPGRADE SERVIDOR': '4SERVERS',
    'UPGRADE STORAGE': '4SERVERS',
    'SWITCH ARUBA': 'ARUBA',
    'LTO BACKUP LENOVO': 'LENOVO',
    'CLOUD AZURE': 'MICROSOFT',
}


def norm(s):
    return (s or '').strip().upper().replace('  ', ' ')


def backup_current_state():
    print('=== 1. Backup do estado atual ===')
    os.makedirs('backups', exist_ok=True)
    ts = 'pre_correcao_fabricante_distribuidor'
    snapshot = {}
    for table in ['distribuidores', 'produtos', 'propostas', 'itens_proposta']:
        r = requests.get(f'{SUPABASE_URL}/rest/v1/{table}?select=*&limit=5000', headers=HEADERS)
        snapshot[table] = r.json()
    path = f'backups/{ts}.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f'  Backup salvo em {path} ({sum(len(v) for v in snapshot.values())} registros)')
    return snapshot


def ensure_legacy_ti_distribuidor(dist_by_name_lower):
    print('\n=== 2. Distribuidor "Legacy TI" ===')
    if 'legacy ti' in dist_by_name_lower:
        print('  Já existe, nada a fazer.')
        return dist_by_name_lower['legacy ti']
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/distribuidores', headers=HEADERS,
        json={'nome': 'Legacy TI'}
    )
    r.raise_for_status()
    new_id = r.json()[0]['id']
    print(f'  Criado com id={new_id}')
    return new_id


def fix_catalog(prod_rows):
    print('\n=== 3. Corrigindo catálogo de produtos ===')
    by_name = {p['nome'].strip(): p for p in prod_rows}
    for nome, fabricante_correto in CATALOG_FIXES.items():
        p = by_name.get(nome)
        if not p:
            print(f'  [AVISO] produto "{nome}" não encontrado, pulei.')
            continue
        if norm(p['fabricante']) == norm(fabricante_correto):
            print(f'  {nome}: já correto.')
            continue
        r = requests.patch(
            f'{SUPABASE_URL}/rest/v1/produtos?id=eq.{p["id"]}', headers=HEADERS,
            json={'fabricante': fabricante_correto}
        )
        r.raise_for_status()
        print(f'  {nome}: fabricante "{p["fabricante"]}" -> "{fabricante_correto}"')

    # Renomeia SUPORTE POS GARANTIA -> PARK PLACE - GARANTIA
    pp = by_name.get('SUPORTE POS  GARANTIA') or by_name.get('SUPORTE POS GARANTIA')
    if pp:
        r = requests.patch(
            f'{SUPABASE_URL}/rest/v1/produtos?id=eq.{pp["id"]}', headers=HEADERS,
            json={'nome': 'PARK PLACE - GARANTIA', 'fabricante': 'PARK PLACE'}
        )
        r.raise_for_status()
        print(f'  Renomeado: "{pp["nome"]}" -> "PARK PLACE - GARANTIA" (fabricante PARK PLACE)')
    else:
        print('  [AVISO] produto "SUPORTE POS GARANTIA" não encontrado.')

    # Remove produto fantasma "Task Name"
    ghost = by_name.get('Task Name')
    if ghost:
        check = requests.get(
            f'{SUPABASE_URL}/rest/v1/itens_proposta?select=id&produto_id=eq.{ghost["id"]}', headers=HEADERS
        ).json()
        if check:
            print(f'  [AVISO] "Task Name" tem {len(check)} itens vinculados, NÃO removido (requer revisão manual).')
        else:
            r = requests.delete(f'{SUPABASE_URL}/rest/v1/produtos?id=eq.{ghost["id"]}', headers=HEADERS)
            r.raise_for_status()
            print('  Produto fantasma "Task Name" removido (0 referências).')


def distribuidor_esperado(categoria, end_time):
    cat = norm(categoria)
    data = (end_time or '')[:10]
    if cat == 'PARK PLACE':
        return 'Park Place'
    if cat == 'OTG':
        return 'OTG'
    if cat in ('SUPRIMÁTICA SERVIÇOS', 'SUPRIMATICA SERVIÇOS'):
        return 'Suprimatica'
    if cat == 'VMWARE':
        return 'TD Synnex' if data >= VMWARE_CUTOFF else 'Ingram Micro'
    if cat in ('LEGACY TI', '4SERVERS'):
        return 'Legacy TI' if data < LEGACY_4SERVER_CUTOFF else '4Server'
    return 'Ingram Micro'


def fix_itens_distribuidor(prod_rows, dist_by_name_lower):
    print('\n=== 4. Corrigindo distribuidor_id em itens_proposta ===')
    with open('cache/agendor_won_deals.json', encoding='utf-8') as f:
        agendor_deals = json.load(f)
    with open('cache/clickup_agendor_map.json', encoding='utf-8') as f:
        maps = json.load(f)
    agendor_to_clickup = maps['agendor_to_clickup']

    won = [
        d for d in agendor_deals
        if d['dealStatus']['name'] == 'Ganho'
        and '2023-01-01' <= (d.get('endTime') or '')[:10] <= '2026-12-31'
    ]
    won_by_id = {str(d['id']): d for d in won}
    matched_codes = [c for c in won_by_id if c in agendor_to_clickup]

    prop_rows = requests.get(
        f'{SUPABASE_URL}/rest/v1/propostas?select=id,clickup_negocio_id,situacao&limit=2000', headers=HEADERS
    ).json()
    props_by_clickup = defaultdict(list)
    for p in prop_rows:
        props_by_clickup[p['clickup_negocio_id']].append(p)

    item_rows = requests.get(
        f'{SUPABASE_URL}/rest/v1/itens_proposta?select=id,proposta_id,produto_id,distribuidor_id&limit=5000',
        headers=HEADERS
    ).json()
    items_by_proposta = defaultdict(list)
    for it in item_rows:
        items_by_proposta[it['proposta_id']].append(it)

    prod_by_id = {p['id']: p for p in prod_rows}

    updates = 0
    skipped_ambiguous = []

    for code in matched_codes:
        deal = won_by_id[code]
        clickup_id = agendor_to_clickup[code]
        end_time = deal.get('endTime') or ''
        expected_products = deal.get('products_entities') or []
        # só nos importa aqui categorias com regra especial (as demais já default Ingram
        # e não sofreram o bug sistêmico identificado na auditoria)
        relevant = [p for p in expected_products if norm(p['category']) in
                    ('PARK PLACE', 'OTG', 'VMWARE', 'LEGACY TI', '4SERVERS')]
        if not relevant:
            continue

        propostas = props_by_clickup.get(clickup_id, [])
        selecionada = next((p for p in propostas if p['situacao'] == 'Selecionada'), None)
        prop = selecionada or (propostas[0] if propostas else None)
        if not prop:
            continue

        actual_items = items_by_proposta.get(prop['id'], [])
        actual_by_name = defaultdict(list)
        for it in actual_items:
            pinfo = prod_by_id.get(it['produto_id'], {})
            actual_by_name[norm(pinfo.get('nome'))].append(it)

        for ep in relevant:
            key = norm(ep['name'])
            candidates = actual_by_name.get(key)
            if not candidates:
                alt = next((k for k in actual_by_name if k in key or key in k), None)
                candidates = actual_by_name.get(alt, []) if alt else []
            if not candidates:
                continue
            if len(candidates) > 1:
                skipped_ambiguous.append((code, deal.get('title'), key, len(candidates)))

            dist_nome = distribuidor_esperado(ep['category'], end_time)
            dist_id = dist_by_name_lower.get(dist_nome.lower())
            if not dist_id:
                print(f'  [ERRO] distribuidor "{dist_nome}" não encontrado no Supabase.')
                continue

            for it in candidates:
                if it['distribuidor_id'] != dist_id:
                    r = requests.patch(
                        f'{SUPABASE_URL}/rest/v1/itens_proposta?id=eq.{it["id"]}', headers=HEADERS,
                        json={'distribuidor_id': dist_id}
                    )
                    r.raise_for_status()
                    updates += 1

    print(f'  {updates} itens_proposta.distribuidor_id corrigidos.')
    if skipped_ambiguous:
        print(f'  {len(skipped_ambiguous)} casos com múltiplos itens do mesmo nome no mesmo negócio (todos os candidatos foram corrigidos igualmente, mas revise se a quantidade/valor bate):')
        for code, title, key, n in skipped_ambiguous[:15]:
            print(f'    - {title} ({code}) produto={key} x{n}')


def main():
    backup_current_state()

    dist_rows = requests.get(f'{SUPABASE_URL}/rest/v1/distribuidores?select=*', headers=HEADERS).json()
    dist_by_name_lower = {d['nome'].lower().strip(): d['id'] for d in dist_rows}

    legacy_id = ensure_legacy_ti_distribuidor(dist_by_name_lower)
    dist_by_name_lower['legacy ti'] = legacy_id

    prod_rows = requests.get(f'{SUPABASE_URL}/rest/v1/produtos?select=*&limit=1000', headers=HEADERS).json()
    fix_catalog(prod_rows)

    # recarrega produtos (nomes/fabricantes podem ter mudado)
    prod_rows = requests.get(f'{SUPABASE_URL}/rest/v1/produtos?select=*&limit=1000', headers=HEADERS).json()
    fix_itens_distribuidor(prod_rows, dist_by_name_lower)

    print('\n=== CONCLUÍDO ===')


if __name__ == '__main__':
    main()
