#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auditoria SOMENTE-LEITURA: compara os 438 negócios ganhos do Agendor (fonte de
verdade via API, campo `category` = fabricante real) contra o estado atual do
Supabase (propostas/itens_proposta/produtos/distribuidores).

Não escreve nada no banco. Gera um CSV de divergências e um resumo no console.
"""

import os
import json
import csv
from collections import defaultdict, Counter

import requests
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
HEADERS = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}

VMWARE_CUTOFF = '2025-02-01'       # a partir desta data, VMware Open -> TD Synnex
LEGACY_4SERVER_CUTOFF = '2025-02-25'  # a partir desta data, Legacy TI -> 4Server

SERVICO_CATEGORIES = {'SUPRIMÁTICA SERVIÇOS', 'SUPRIMATICA SERVIÇOS', 'SUPRIMATICA'}


def norm(s):
    return (s or '').strip().upper().replace('  ', ' ')


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


def main():
    print('=== Carregando fontes ===')
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
    print(f'Negócios Ganhos (2023-2026) no Agendor: {len(won)}')

    matched_codes = [c for c in won_by_id if c in agendor_to_clickup]
    print(f'Com mapeamento para ClickUp: {len(matched_codes)}')

    # --- Supabase: distribuidores ---
    dist_rows = requests.get(f'{SUPABASE_URL}/rest/v1/distribuidores?select=*', headers=HEADERS).json()
    dist_by_id = {d['id']: d['nome'] for d in dist_rows}
    dist_names_lower = {d['nome'].lower() for d in dist_rows}

    # --- Supabase: produtos ---
    prod_rows = requests.get(f'{SUPABASE_URL}/rest/v1/produtos?select=*&limit=1000', headers=HEADERS).json()
    prod_by_id = {p['id']: p for p in prod_rows}

    # --- Supabase: propostas ---
    prop_rows = requests.get(
        f'{SUPABASE_URL}/rest/v1/propostas?select=id,clickup_negocio_id,situacao,total_proposta&limit=2000',
        headers=HEADERS
    ).json()
    props_by_clickup = defaultdict(list)
    for p in prop_rows:
        props_by_clickup[p['clickup_negocio_id']].append(p)

    # --- Supabase: itens_proposta (todos) ---
    item_rows = requests.get(
        f'{SUPABASE_URL}/rest/v1/itens_proposta?select=id,proposta_id,produto_id,distribuidor_id,quantidade,preco_unitario,total_item&limit=5000',
        headers=HEADERS
    ).json()
    items_by_proposta = defaultdict(list)
    for it in item_rows:
        items_by_proposta[it['proposta_id']].append(it)

    print(f'Propostas no Supabase: {len(prop_rows)} | Itens: {len(item_rows)}')

    report_rows = []
    counters = Counter()

    for code in matched_codes:
        deal = won_by_id[code]
        clickup_id = agendor_to_clickup[code]
        title = deal.get('title') or ''
        end_time = deal.get('endTime') or ''

        propostas = props_by_clickup.get(clickup_id, [])
        selecionada = next((p for p in propostas if p['situacao'] == 'Selecionada'), None)
        prop = selecionada or (propostas[0] if propostas else None)

        if not prop:
            counters['SEM_PROPOSTA_NO_SUPABASE'] += 1
            report_rows.append({
                'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id,
                'produto_agendor': '', 'fabricante_agendor': '', 'distribuidor_esperado': '',
                'produto_supabase': '', 'fabricante_supabase': '', 'distribuidor_supabase': '',
                'valor_agendor': '', 'valor_supabase': '',
                'servico_prioridade': '', 'tipo_divergencia': 'SEM_PROPOSTA_NO_SUPABASE',
            })
            continue

        if not selecionada and len(propostas) > 1:
            counters['SEM_VERSAO_SELECIONADA'] += 1

        actual_items = items_by_proposta.get(prop['id'], [])
        actual_by_name = defaultdict(list)
        for it in actual_items:
            pinfo = prod_by_id.get(it['produto_id'], {})
            actual_by_name[norm(pinfo.get('nome'))].append(it)

        expected_products = deal.get('products_entities') or []
        matched_names = set()

        for ep in expected_products:
            prod_name = ep['name'].strip()
            categoria = ep['category'].strip()
            valor_agendor = ep.get('totalValue', 0.0)
            dist_esperado = distribuidor_esperado(categoria, end_time)
            key = norm(prod_name)
            matched_names.add(key)

            candidates = actual_by_name.get(key, [])
            if not candidates:
                # tenta achar por substring (produto pode estar cadastrado com nome ligeiramente diferente)
                alt_key = next((k for k in actual_by_name if k in key or key in k), None)
                candidates = actual_by_name.get(alt_key, []) if alt_key else []
                if candidates:
                    matched_names.add(alt_key)

            if not candidates:
                counters['PRODUTO_AUSENTE_NO_SUPABASE'] += 1
                report_rows.append({
                    'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id,
                    'produto_agendor': prod_name, 'fabricante_agendor': categoria,
                    'distribuidor_esperado': dist_esperado,
                    'produto_supabase': '(AUSENTE)', 'fabricante_supabase': '', 'distribuidor_supabase': '',
                    'valor_agendor': valor_agendor, 'valor_supabase': '',
                    'servico_prioridade': categoria.upper() in SERVICO_CATEGORIES,
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
                        'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id,
                        'produto_agendor': prod_name, 'fabricante_agendor': categoria,
                        'distribuidor_esperado': dist_esperado,
                        'produto_supabase': pinfo.get('nome', ''), 'fabricante_supabase': pinfo.get('fabricante', ''),
                        'distribuidor_supabase': dist_supabase,
                        'valor_agendor': valor_agendor, 'valor_supabase': valor_supabase,
                        'servico_prioridade': categoria.upper() in SERVICO_CATEGORIES,
                        'tipo_divergencia': '+'.join(divergencias),
                    })
                else:
                    counters['OK'] += 1

        # itens no Supabase que não existem no Agendor (produto extra / sujeira)
        for key, its in actual_by_name.items():
            if key in matched_names:
                continue
            for it in its:
                pinfo = prod_by_id.get(it['produto_id'], {})
                counters['PRODUTO_EXTRA_NO_SUPABASE'] += 1
                report_rows.append({
                    'agendor_id': code, 'titulo': title, 'clickup_id': clickup_id,
                    'produto_agendor': '(NÃO EXISTE NO AGENDOR)', 'fabricante_agendor': '',
                    'distribuidor_esperado': '',
                    'produto_supabase': pinfo.get('nome', ''), 'fabricante_supabase': pinfo.get('fabricante', ''),
                    'distribuidor_supabase': dist_by_id.get(it['distribuidor_id'], ''),
                    'valor_agendor': '', 'valor_supabase': it.get('total_item', 0.0),
                    'servico_prioridade': '',
                    'tipo_divergencia': 'PRODUTO_EXTRA_NO_SUPABASE',
                })

    # catálogo de produtos com fabricante suspeito (independente de negócio)
    print('\n=== Verificando integridade do catálogo produtos ===')
    catalog_issues = []
    known_fabricantes_validos = {
        'DELL EMC', 'DELL CLIENT', 'HPE', 'FORTINET', 'ARUBA', 'LENOVO', 'NUTANIX', 'FUJITSU', 'APC',
        'ORACLE', 'MICROSOFT', 'AWS', 'AZURE', 'IBM', 'GOOGLE', 'RED HAT', 'OMNISSA',
        'PARCEIRO', 'POSITIVO', 'SUPRIMÁTICA SERVIÇOS', 'OTG', 'PARK PLACE', 'TEAMVIEWER',
        'CENTRIC', 'VEEAM', 'VMWARE', '4SERVERS', 'LEGACY TI', 'ZEBRA',
    }
    for p in prod_rows:
        fab = (p.get('fabricante') or '').strip()
        if norm(fab) not in known_fabricantes_validos or not fab:
            catalog_issues.append(p)
    for p in catalog_issues:
        print(f"  [CATALOGO SUSPEITO] produto='{p['nome']}' fabricante='{p['fabricante']}' id={p['id']}")

    # --- Escreve CSV ---
    out_path = 'reports/divergencias_auditoria_completa.csv'
    fieldnames = [
        'agendor_id', 'titulo', 'clickup_id', 'produto_agendor', 'fabricante_agendor',
        'distribuidor_esperado', 'produto_supabase', 'fabricante_supabase', 'distribuidor_supabase',
        'valor_agendor', 'valor_supabase', 'servico_prioridade', 'tipo_divergencia',
    ]
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in report_rows:
            if row['tipo_divergencia'] != 'OK':
                writer.writerow(row)

    print('\n=== RESUMO DA AUDITORIA ===')
    for tipo, cnt in counters.most_common():
        print(f'  {tipo}: {cnt}')
    print(f'\nRelatório completo salvo em: {out_path}')
    print(f'Problemas de catálogo (produtos.fabricante suspeito): {len(catalog_issues)}')


if __name__ == '__main__':
    main()
