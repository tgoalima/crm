#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auditoria SOMENTE-LEITURA dos negócios ATIVOS (Em andamento, não congelados)
no Funil de Vendas do Agendor, comparando contra o Supabase. Mesma lógica de
scripts/auditoria_fabricante_distribuidor.py, mas para o forecast, não para
os negócios ganhos.
"""

import json
import csv
from collections import defaultdict, Counter

import requests
import os
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
HEADERS = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}

VMWARE_CUTOFF = '2025-02-01'
LEGACY_4SERVER_CUTOFF = '2025-02-25'


def norm(s):
    return (s or '').strip().upper().replace('  ', ' ')


def distribuidor_esperado(categoria, ref_date):
    cat = norm(categoria)
    data = (ref_date or '')[:10]
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


def main():
    with open('cache/agendor_all_deals_fresh.json', encoding='utf-8') as f:
        agendor_deals = json.load(f)
    with open('cache/clickup_agendor_map.json', encoding='utf-8') as f:
        maps = json.load(f)
    a2c = maps['agendor_to_clickup']

    active = [
        d for d in agendor_deals
        if d['dealStatus']['name'] == 'Em andamento'
        and d['dealStage']['funnel']['name'] == 'Funil de Vendas'
        and not d.get('frozen')
    ]
    matched = [d for d in active if str(d['id']) in a2c]
    print(f'Negócios ativos (não congelados) no Funil de Vendas: {len(active)}')
    print(f'Com mapeamento ClickUp: {len(matched)}')

    dist_rows = requests.get(f'{SUPABASE_URL}/rest/v1/distribuidores?select=*', headers=HEADERS).json()
    dist_by_id = {d['id']: d['nome'] for d in dist_rows}

    prod_rows = requests.get(f'{SUPABASE_URL}/rest/v1/produtos?select=*&limit=1000', headers=HEADERS).json()
    prod_by_id = {p['id']: p for p in prod_rows}

    prop_rows = requests.get(
        f'{SUPABASE_URL}/rest/v1/propostas?select=id,clickup_negocio_id,situacao,total_proposta&limit=2000',
        headers=HEADERS
    ).json()
    props_by_clickup = defaultdict(list)
    for p in prop_rows:
        props_by_clickup[p['clickup_negocio_id']].append(p)

    item_rows = requests.get(
        f'{SUPABASE_URL}/rest/v1/itens_proposta?select=id,proposta_id,produto_id,distribuidor_id,quantidade,preco_unitario,total_item&limit=5000',
        headers=HEADERS
    ).json()
    items_by_proposta = defaultdict(list)
    for it in item_rows:
        items_by_proposta[it['proposta_id']].append(it)

    report_rows = []
    counters = Counter()

    for deal in matched:
        code = str(deal['id'])
        clickup_id = a2c[code]
        title = deal.get('title') or ''
        ref_date = deal.get('endTime') or deal.get('startTime') or ''

        propostas = props_by_clickup.get(clickup_id, [])
        selecionada = next((p for p in propostas if (p['situacao'] or '').strip().lower() == 'selecionada'), None)
        prop = selecionada or (propostas[0] if propostas else None)

        if not prop:
            counters['SEM_PROPOSTA_NO_SUPABASE'] += 1
            report_rows.append({
                'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id, 'estagio': deal['dealStage']['name'],
                'produto_agendor': '', 'fabricante_agendor': '', 'distribuidor_esperado': '',
                'produto_supabase': '', 'fabricante_supabase': '', 'distribuidor_supabase': '',
                'valor_agendor': deal.get('value', ''), 'valor_supabase': '',
                'tipo_divergencia': 'SEM_PROPOSTA_NO_SUPABASE',
            })
            continue

        actual_items = items_by_proposta.get(prop['id'], [])
        actual_by_name = defaultdict(list)
        for it in actual_items:
            pinfo = prod_by_id.get(it['produto_id'], {})
            actual_by_name[norm(pinfo.get('nome'))].append(it)

        expected_products = deal.get('products_entities') or []
        matched_names = set()

        if not expected_products:
            counters['SEM_ITEM_NO_AGENDOR'] += 1

        for ep in expected_products:
            prod_name = ep['name'].strip()
            categoria = ep['category'].strip()
            valor_agendor = ep.get('totalValue', 0.0)
            dist_esperado = distribuidor_esperado(categoria, ref_date)
            key = norm(prod_name)
            matched_names.add(key)

            candidates = actual_by_name.get(key, [])
            if not candidates:
                alt_key = next((k for k in actual_by_name if k in key or key in k), None)
                candidates = actual_by_name.get(alt_key, []) if alt_key else []
                if candidates:
                    matched_names.add(alt_key)

            if not candidates:
                counters['PRODUTO_AUSENTE_NO_SUPABASE'] += 1
                report_rows.append({
                    'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id, 'estagio': deal['dealStage']['name'],
                    'produto_agendor': prod_name, 'fabricante_agendor': categoria,
                    'distribuidor_esperado': dist_esperado,
                    'produto_supabase': '(AUSENTE)', 'fabricante_supabase': '', 'distribuidor_supabase': '',
                    'valor_agendor': valor_agendor, 'valor_supabase': '',
                    'tipo_divergencia': 'PRODUTO_AUSENTE_NO_SUPABASE',
                })
                continue

            for it in candidates:
                pinfo = prod_by_id.get(it['produto_id'], {})
                fab_supabase = norm(pinfo.get('fabricante'))
                dist_supabase = dist_by_id.get(it['distribuidor_id'], '(SEM_DISTRIBUIDOR)')
                valor_supabase = it.get('total_item', 0.0)

                divergencias = []
                if norm(pinfo.get('nome')) != key:
                    divergencias.append('NOME_PRODUTO')
                if fab_supabase != norm(categoria):
                    divergencias.append('FABRICANTE')
                if norm(dist_supabase) != norm(dist_esperado):
                    divergencias.append('DISTRIBUIDOR')
                try:
                    if abs(float(valor_supabase or 0) - float(valor_agendor or 0)) > 0.02:
                        divergencias.append('VALOR')
                except (TypeError, ValueError):
                    divergencias.append('VALOR')

                if divergencias:
                    for tipo in divergencias:
                        counters[tipo] += 1
                    report_rows.append({
                        'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id, 'estagio': deal['dealStage']['name'],
                        'produto_agendor': prod_name, 'fabricante_agendor': categoria,
                        'distribuidor_esperado': dist_esperado,
                        'produto_supabase': pinfo.get('nome', ''), 'fabricante_supabase': pinfo.get('fabricante', ''),
                        'distribuidor_supabase': dist_supabase,
                        'valor_agendor': valor_agendor, 'valor_supabase': valor_supabase,
                        'tipo_divergencia': '+'.join(divergencias),
                    })
                else:
                    counters['OK'] += 1

        for key, its in actual_by_name.items():
            if key in matched_names:
                continue
            for it in its:
                pinfo = prod_by_id.get(it['produto_id'], {})
                counters['PRODUTO_EXTRA_NO_SUPABASE'] += 1
                report_rows.append({
                    'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id, 'estagio': deal['dealStage']['name'],
                    'produto_agendor': '(NÃO EXISTE NO AGENDOR)', 'fabricante_agendor': '',
                    'distribuidor_esperado': '',
                    'produto_supabase': pinfo.get('nome', ''), 'fabricante_supabase': pinfo.get('fabricante', ''),
                    'distribuidor_supabase': dist_by_id.get(it['distribuidor_id'], ''),
                    'valor_agendor': '', 'valor_supabase': it.get('total_item', 0.0),
                    'tipo_divergencia': 'PRODUTO_EXTRA_NO_SUPABASE',
                })

    out_path = 'reports/divergencias_auditoria_forecast_ativo.csv'
    fieldnames = [
        'agendor_id', 'titulo', 'clickup_id', 'estagio', 'produto_agendor', 'fabricante_agendor',
        'distribuidor_esperado', 'produto_supabase', 'fabricante_supabase', 'distribuidor_supabase',
        'valor_agendor', 'valor_supabase', 'tipo_divergencia',
    ]
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in report_rows:
            if row['tipo_divergencia'] != 'OK':
                writer.writerow(row)

    print('\n=== RESUMO ===')
    for tipo, cnt in counters.most_common():
        print(f'  {tipo}: {cnt}')
    print(f'\nRelatório salvo em: {out_path}')


if __name__ == '__main__':
    main()
