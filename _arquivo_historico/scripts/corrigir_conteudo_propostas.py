#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Corrige 13 propostas cujo CONTEÚDO (produto/valor) está totalmente errado —
nunca passaram pela calibração oficial (data_fechamento nulo, única versão
existente para o negócio). Usa agendor_won_deals.json como fonte de verdade
(Agendor é a fonte de verdade absoluta do projeto).

Faz backup antes de escrever. Para cada negócio: apaga os itens atuais
(errados) e insere os itens corretos vindos do Agendor, com fabricante e
distribuidor computados pelas mesmas regras já corrigidas em
scripts/corrigir_fabricante_distribuidor.py.
"""

import os
import json
from datetime import datetime, timezone

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

AGENDOR_CODES = [
    '44362046',  # Quinelato Freios - Park Place - Garantias
    '25117769',  # Silo da Moda - Rede LAN Aruba
    '21166528',  # Metalurgica Mococa - Suporte HPE
    '21047528',  # Unimed Birigui - Serviço de Rede
    '18862109',  # Bela Vista Alimentos - SSU
    '20100655',  # Newdrop - Veeam/Positivo
    '19418610',  # Lwart - Aruba
    '20003235',  # Unimed Lins - Dell (Pos Garantia) [Foto 1]
    '20098094',  # Usina Colorado - VMware [Foto 3]
    '19038324',  # Unimed Campo Grande - HPE Suporte
    '19346988',  # Unimed Bebedouro - Microsoft
    '18848099',  # Unimed Ribeirão Preto - HPE Storage
    '27486422',  # TMG Rondonópolis
]

# nome no Agendor -> nome exato no catálogo produtos (quando difere)
PROD_NAME_ALIAS = {
    'MICROSOFT': 'LICENCIAMENTO MICROSOFT',
}
# produtos que precisam ser criados no catálogo (não existem ainda)
PROD_CREATE = {
    'CARDSTUDIO2.0 - Profissional': 'ZEBRA',
}


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


def backup_current_state():
    print('=== Backup ===')
    os.makedirs('backups', exist_ok=True)
    snapshot = {}
    for table in ['propostas', 'itens_proposta', 'produtos']:
        r = requests.get(f'{SUPABASE_URL}/rest/v1/{table}?select=*&limit=5000', headers=HEADERS)
        snapshot[table] = r.json()
    path = 'backups/pre_correcao_conteudo_propostas.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f'  Backup salvo em {path}')


def main():
    backup_current_state()

    with open('cache/agendor_won_deals.json', encoding='utf-8') as f:
        agendor = json.load(f)
    by_id = {str(d['id']): d for d in agendor}
    with open('cache/clickup_agendor_map.json', encoding='utf-8') as f:
        maps = json.load(f)
    a2c = maps['agendor_to_clickup']

    dist_rows = requests.get(f'{SUPABASE_URL}/rest/v1/distribuidores?select=*', headers=HEADERS).json()
    dist_by_name = {d['nome'].lower().strip(): d['id'] for d in dist_rows}

    prod_rows = requests.get(f'{SUPABASE_URL}/rest/v1/produtos?select=*&limit=1000', headers=HEADERS).json()
    prod_by_name = {p['nome'].strip().upper(): p['id'] for p in prod_rows}

    # cria produtos que faltam no catálogo
    for nome, fabricante in PROD_CREATE.items():
        if nome.strip().upper() in prod_by_name:
            continue
        r = requests.post(f'{SUPABASE_URL}/rest/v1/produtos', headers=HEADERS,
                           json={'nome': nome, 'fabricante': fabricante, 'custo_referencia': 0.0})
        r.raise_for_status()
        new_id = r.json()[0]['id']
        prod_by_name[nome.strip().upper()] = new_id
        print(f'  [CATALOGO] Criado produto "{nome}" (fabricante {fabricante})')

    print('\n=== Corrigindo conteúdo das propostas ===')
    total_antes = 0.0
    total_depois = 0.0

    for code in AGENDOR_CODES:
        deal = by_id[code]
        clickup_id = a2c[code]
        end_time = deal.get('endTime') or ''
        titulo = deal.get('title', '')

        props = requests.get(
            f'{SUPABASE_URL}/rest/v1/propostas?select=*&clickup_negocio_id=eq.{clickup_id}', headers=HEADERS
        ).json()
        if not props:
            print(f'  [AVISO] Nenhuma proposta encontrada para {titulo} ({code}), pulei.')
            continue
        # usa a única/primeira proposta (todos estes 13 casos têm 1 só, órfã)
        prop = props[0]
        pid = prop['id']

        old_items = requests.get(
            f'{SUPABASE_URL}/rest/v1/itens_proposta?select=total_item&proposta_id=eq.{pid}', headers=HEADERS
        ).json()
        old_total = sum(i.get('total_item') or 0 for i in old_items)
        total_antes += old_total

        # apaga itens errados
        requests.delete(f'{SUPABASE_URL}/rest/v1/itens_proposta?proposta_id=eq.{pid}', headers=HEADERS)

        new_items = []
        for ep in deal.get('products_entities') or []:
            raw_name = ep['name'].strip()
            lookup_name = PROD_NAME_ALIAS.get(raw_name, raw_name)
            prod_id = prod_by_name.get(lookup_name.strip().upper())
            if not prod_id:
                print(f'    [ERRO] produto "{raw_name}" não encontrado no catálogo, pulei este item.')
                continue

            dist_nome = distribuidor_esperado(ep['category'], end_time)
            dist_id = dist_by_name.get(dist_nome.lower())
            if not dist_id:
                print(f'    [ERRO] distribuidor "{dist_nome}" não encontrado.')
                continue

            qty = ep.get('quantity') or 1.0
            qty_int = int(round(qty)) if qty and qty > 0 else 1
            total_val = ep.get('totalValue', 0.0)
            preco_unit = round(total_val / qty_int, 2) if qty_int else round(total_val, 2)

            new_items.append({
                'proposta_id': pid,
                'produto_id': prod_id,
                'distribuidor_id': dist_id,
                'quantidade': qty_int,
                'preco_unitario': preco_unit,
            })

        if new_items:
            r = requests.post(f'{SUPABASE_URL}/rest/v1/itens_proposta', headers=HEADERS, json=new_items)
            r.raise_for_status()

        new_total = deal.get('value', 0.0)
        total_depois += new_total

        requests.patch(
            f'{SUPABASE_URL}/rest/v1/propostas?id=eq.{pid}', headers=HEADERS,
            json={'total_proposta': new_total, 'data_fechamento': end_time[:10]}
        )

        print(f'  {titulo[:55]:55s} | antes R$ {old_total:>13,.2f} -> depois R$ {new_total:>13,.2f} ({len(new_items)} itens)')

    print(f'\nTotal antes (errado): R$ {total_antes:,.2f}')
    print(f'Total depois (correto): R$ {total_depois:,.2f}')
    print(f'Diferença líquida: R$ {total_antes - total_depois:,.2f}')


if __name__ == '__main__':
    main()
