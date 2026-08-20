#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Corrige o conteúdo (produto/fabricante/distribuidor/valor) dos negócios
ATIVOS (Em andamento, não congelados) no Funil de Vendas, usando o Agendor
como fonte de verdade. NÃO mexe em situacao/data_fechamento (esses negócios
ainda não fecharam). Faz backup antes de escrever.
"""

import os
import json

import requests
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
if not SUPABASE_KEY:
    raise SystemExit('SUPABASE_SERVICE_ROLE_KEY não definida no .env')
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

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


def backup_current_state():
    print('=== Backup ===')
    os.makedirs('backups', exist_ok=True)
    snapshot = {}
    for table in ['propostas', 'itens_proposta', 'produtos']:
        r = requests.get(f'{SUPABASE_URL}/rest/v1/{table}?select=*&limit=5000', headers=HEADERS)
        snapshot[table] = r.json()
    path = 'backups/pre_correcao_forecast_ativo.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f'  Backup salvo em {path}')


def main():
    backup_current_state()

    with open('cache/agendor_all_deals_fresh.json', encoding='utf-8') as f:
        agendor_deals = json.load(f)
    by_id = {d['id']: d for d in agendor_deals}
    with open('cache/clickup_agendor_map.json', encoding='utf-8') as f:
        maps = json.load(f)
    a2c = maps['agendor_to_clickup']

    active = [
        d for d in agendor_deals
        if d['dealStatus']['name'] == 'Em andamento'
        and d['dealStage']['funnel']['name'] == 'Funil de Vendas'
        and not d.get('frozen')
        and str(d['id']) in a2c
    ]
    print(f'Negócios ativos não congelados mapeados: {len(active)}')

    dist_rows = requests.get(f'{SUPABASE_URL}/rest/v1/distribuidores?select=*', headers=HEADERS).json()
    dist_by_name = {d['nome'].lower().strip(): d['id'] for d in dist_rows}

    prod_rows = requests.get(f'{SUPABASE_URL}/rest/v1/produtos?select=*&limit=1000', headers=HEADERS).json()
    prod_by_name = {p['nome'].strip().upper(): p['id'] for p in prod_rows}

    corrigidos = 0
    limpos = 0
    ja_ok = 0
    erros = []

    for deal in active:
        code = str(deal['id'])
        clickup_id = a2c[code]
        title = deal.get('title', '')
        ref_date = deal.get('endTime') or deal.get('startTime') or ''
        real_value = deal.get('value', 0.0)
        expected_products = deal.get('products_entities') or []

        props = requests.get(
            f'{SUPABASE_URL}/rest/v1/propostas?select=*&clickup_negocio_id=eq.{clickup_id}', headers=HEADERS
        ).json()
        if not props:
            continue
        selecionada = next((p for p in props if (p['situacao'] or '').strip().lower() == 'selecionada'), None)
        prop = selecionada or props[0]
        pid = prop['id']

        cur_items = requests.get(
            f'{SUPABASE_URL}/rest/v1/itens_proposta?select=*,produtos(nome)&proposta_id=eq.{pid}', headers=HEADERS
        ).json()
        cur_names = {norm(it['produtos']['nome']) for it in cur_items if it.get('produtos')}
        expected_names = {norm(ep['name']) for ep in expected_products}

        # já bate? (mesmo conjunto de nomes de produto e valor igual)
        if cur_names == expected_names and abs((prop['total_proposta'] or 0) - real_value) < 0.02 and expected_names:
            ja_ok += 1
            continue

        if not expected_products:
            # Agendor não tem item nenhum: limpa o que tiver de errado no Supabase e mantém só o total
            if cur_items:
                requests.delete(f'{SUPABASE_URL}/rest/v1/itens_proposta?proposta_id=eq.{pid}', headers=HEADERS)
                limpos += 1
            if abs((prop['total_proposta'] or 0) - real_value) > 0.02:
                requests.patch(f'{SUPABASE_URL}/rest/v1/propostas?id=eq.{pid}', headers=HEADERS,
                                json={'total_proposta': real_value})
            continue

        # reconstrói os itens corretos
        requests.delete(f'{SUPABASE_URL}/rest/v1/itens_proposta?proposta_id=eq.{pid}', headers=HEADERS)

        new_items = []
        for ep in expected_products:
            prod_id = prod_by_name.get(ep['name'].strip().upper())
            if not prod_id:
                erros.append(f'{title}: produto "{ep["name"]}" não encontrado no catálogo')
                continue
            dist_nome = distribuidor_esperado(ep['category'], ref_date)
            dist_id = dist_by_name.get(dist_nome.lower())
            if not dist_id:
                erros.append(f'{title}: distribuidor "{dist_nome}" não encontrado')
                continue
            qty = ep.get('quantity') or 1.0
            qty_int = int(round(qty)) if qty and qty > 0 else 1
            total_val = ep.get('totalValue', 0.0)
            preco_unit = round(total_val / qty_int, 2) if qty_int else round(total_val, 2)
            new_items.append({
                'proposta_id': pid, 'produto_id': prod_id, 'distribuidor_id': dist_id,
                'quantidade': qty_int, 'preco_unitario': preco_unit,
            })

        if new_items:
            requests.post(f'{SUPABASE_URL}/rest/v1/itens_proposta', headers=HEADERS, json=new_items)

        requests.patch(f'{SUPABASE_URL}/rest/v1/propostas?id=eq.{pid}', headers=HEADERS,
                        json={'total_proposta': real_value})
        corrigidos += 1
        print(f'  OK: {title[:60]}')

    print(f'\n=== RESUMO ===')
    print(f'Corrigidos (itens reescritos): {corrigidos}')
    print(f'Limpos (sem item no Agendor, item errado removido): {limpos}')
    print(f'Já estavam corretos: {ja_ok}')
    if erros:
        print(f'\nErros ({len(erros)}):')
        for e in erros:
            print('  -', e)


if __name__ == '__main__':
    main()
