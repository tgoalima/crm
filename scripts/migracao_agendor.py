#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de Migração e Integração: 438 Deals Ganhos (Agendor -> ClickUp + Supabase)
SPA Gestão Comercial Suprimática (v27.0)
Com Resolução Precisa de Distribuidores:
- Padrão: Ingram Micro (Dell, Aruba, Microsoft, Veeam/VMware OEM)
- Serviços: Suprimatica
- Upgrades / VMware 2025+: TD Synnex
- Park Place: Park Place
- OTG: OTG
- 4Server / Legacy: 4Server / Broker
"""

import sys, os, time, re, zipfile, json, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime

CLICKUP_TOKEN = 'pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437'
NEGOCIOS_LIST_ID = '901326185457'
CONTAS_LIST_ID = '901326185461'
CUSTOM_ITEM_ID_NEGOCIO = 1004

SUPABASE_URL = 'https://supabase.llworkflow.com.br'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgzNTMyMjQ5LCJleHAiOjIwOTg4OTIyNDl9.DYJrIfSr6jdrn-xhmc9q_wGtfdRUYrYwP2UvkpvGLl0'

SPREADSHEET_PATH = 'Planilha Agendor/606404-negocios-2026-08-07-21-57-34.xlsx'

# Mapeamento dos Custom Fields do ClickUp
CF_NUM_PROPOSTA = 'c44cc05d-303f-47e2-b243-40c6b26b732f'
CF_DEAL_VALUE = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4'
CF_ESTAGIO_VENDA = 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63'
OPT_ESTAGIO_GANHO = 'c59ad408-ae8e-45d7-804f-eb9e6cd2935b'
CF_DATA_GANHO = 'e95ca5ca-a139-49a6-b5d4-82365aa170c5'
CF_AGENDOR_DEAL_ID = '94d84531-94e7-4f7c-b982-0ab8d9d87b2d'
CF_TIPO_OPORTUNIDADE = '5d384245-0640-4621-a2dd-98370f7efa82'
CF_CRM_ITEM_TYPE = 'bc39138f-fe02-4480-9c08-f1a8a4eefd5d'
OPT_CRM_ITEM_NEGOCIO = 'cd6922b0-34f4-45e3-853a-cba995a2591c'
CF_ENVIAR_AGENDOR = 'c4b20a7f-1244-40f5-b7c6-73e31608845d'
OPT_ENVIAR_ENVIADO = '089ccab9-4078-4ee9-8185-850ea40db940'

TIPO_OPORTUNIDADE_MAP = {
    'PROJETO': 'fa509e92-7528-4a8b-a9bc-11f2f5da3350',
    'GARANTIAS': '52b4285a-1e92-4ecb-b8b9-7a2348461882',
    'GARANTIA': '52b4285a-1e92-4ecb-b8b9-7a2348461882',
    'SERVIÇOS': '2e351ad7-2af5-4532-be83-fe24423a1994',
    'SERVICOS': '2e351ad7-2af5-4532-be83-fe24423a1994',
    'SSU': '62c6d78c-fa67-44d8-b594-66ed63264df1',
    'VOLUMES': '62f161bc-b78b-46b7-a73b-1d8faa1a1246',
    'VOLUME': '62f161bc-b78b-46b7-a73b-1d8faa1a1246',
    'UPGRADE': 'e55ef41f-51e6-436e-bb53-79ff688960c7'
}

ADAPTACOES_NOMES = {
    'MICROSOFT': 'LICENCIAMENTO MICROSOFT',
    'ORACLE': 'LICENÇA ORACLE STD2',
    'PARK PLACE - GARANTIA': 'SUPORTE POS  GARANTIA',
    'CARDSTUDIO2.0 - PROFISSIONAL': 'CARDSTUDIO2.0 - Profissional',
    'CLOUD': 'CLOUD',
    'TAPE': 'BACKUP EM FITA DELL EMC'
}

def normalize_name(s):
    if not s: return ''
    s = s.lower().strip()
    s = re.sub(r'[\.\/\-\,\(\)\[\]]', ' ', s)
    s = re.sub(r'\b(ltda|s\/a|sa|s\.a\.|eireli|me|epp|inc|comercial|industrial)\b', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def clean_digits(s):
    if not s: return ''
    return re.sub(r'\D', '', str(s))

def excel_date_to_epoch(serial_str):
    try:
        serial = float(serial_str)
        dt = datetime.fromordinal(datetime(1899, 12, 30).toordinal() + int(serial))
        return int(dt.timestamp() * 1000), dt.strftime('%Y-%m-%d'), dt.year
    except:
        now = datetime.now()
        return int(time.time() * 1000), now.strftime('%Y-%m-%d'), now.year

def clickup_api_request(endpoint, method='GET', data=None, retries=3):
    url = f"https://api.clickup.com/api/v2/{endpoint.lstrip('/')}"
    headers = {
        'Authorization': CLICKUP_TOKEN,
        'Content-Type': 'application/json'
    }
    encoded_data = json.dumps(data).encode('utf-8') if data else None
    
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
            with urllib.request.urlopen(req) as resp:
                time.sleep(0.65) # Throttle seguro de 650ms
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = (attempt + 1) * 3
                print(f"[Rate Limit 429] Aguardando {wait_time}s...")
                time.sleep(wait_time)
                continue
            err_msg = e.read().decode('utf-8')
            print(f"[HTTP {e.code}] Erro em {endpoint}: {err_msg}")
            return None
        except Exception as ex:
            print(f"[Exceção] em {endpoint}: {ex}")
            time.sleep(1)
    return None

def supabase_request(table, method='GET', data=None, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    encoded_data = json.dumps(data).encode('utf-8') if data else None
    try:
        req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"[Supabase HTTP {e.code}] em {table}: {err_msg}")
        return None
    except Exception as ex:
        print(f"[Supabase Exceção] em {table}: {ex}")
        return None

def resolve_distribuidor_id(prod_nome, categoria, ano, dist_map):
    p = prod_nome.upper().strip()
    c = categoria.upper().strip()
    
    # 1. Serviços Suprimática
    if 'SSU' in p or 'SUPRIMATICA' in p or 'SUPRIMÁTICA' in p or 'SUPRIMATICA' in c or 'SUPRIMÁTICA' in c:
        return dist_map.get('suprimatica')
        
    # 2. Park Place (Garantias de terceiros)
    if 'PARK PLACE' in p or 'PARK PLACE' in c or 'POS  GARANTIA' in p:
        return dist_map.get('park place')
        
    # 3. OTG
    if 'OTG' in p or 'OTG' in c:
        return dist_map.get('otg')
        
    # 4. 4Server / Legacy / Broker
    if '4SERVER' in p or '4SERVERS' in c or 'LEGACY' in p or 'LEGACY' in c or 'BROKER' in c:
        return dist_map.get('4server')
        
    # 5. TD Synnex (Upgrades e VMware Open a partir de 2025)
    if 'UPGRADE' in p or ('VMWARE' in p and 'OEM' not in p and ano >= 2025):
        return dist_map.get('td synnex')
        
    # 6. Padrão Geral: Ingram Micro (Dell, Aruba, Microsoft, OEM, etc.)
    return dist_map.get('ingram micro')

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Migração Agendor para ClickUp + Supabase")
    parser.add_argument("--limit", type=int, default=None, help="Quantidade de deals a migrar (ou omitir para todos)")
    parser.add_argument("--all", action="store_true", help="Executar todos os 438 deals")
    args = parser.parse_args()

    limit = None if args.all else args.limit
    print(f"=== INICIANDO MIGRAÇÃO ({limit if limit else 'TODOS OS 438 DEALS'}) ===")

    # 1. Carregar produtos e distribuidores do Supabase
    print("\n[1/6] Carregando Catálogo e Distribuidores do Supabase...")
    supa_prods = supabase_request('produtos', 'GET', params='?select=*') or []
    supa_distribs = supabase_request('distribuidores', 'GET', params='?select=*') or []
    dist_map = {d['nome'].lower(): d['id'] for d in supa_distribs}
    print(f"  -> {len(supa_prods)} produtos e {len(supa_distribs)} distribuidores ativos.")

    # Mapa de produtos normalizados
    prod_map = {}
    for p in supa_prods:
        p_name = p['nome'].strip()
        norm_key = p_name.upper().replace(' ', '').replace('_', '').replace('-', '')
        prod_map[norm_key] = p['id']

    # 2. Carregar Contas do ClickUp
    print("\n[2/6] Carregando Contas da lista ClickUp (901326185461)...")
    contas_map_name = {}
    page = 0
    while True:
        res = clickup_api_request(f"list/{CONTAS_LIST_ID}/task?include_closed=true&page={page}")
        if not res or not res.get('tasks'):
            break
        for c in res['tasks']:
            cid = c['id']
            cname = c['name'].strip()
            contas_map_name[normalize_name(cname)] = cid
        page += 1
    print(f"  -> {len(contas_map_name)} contas carregadas e indexadas.")

    # 3. Carregar Idempotência de Negócios no ClickUp
    print("\n[3/6] Carregando Idempotência de Negócios no ClickUp (901326185457)...")
    existing_deals_map = {} # agendor_id -> clickup_task_id
    page = 0
    while True:
        res = clickup_api_request(f"list/{NEGOCIOS_LIST_ID}/task?include_closed=true&page={page}")
        if not res or not res.get('tasks'):
            break
        for t in res['tasks']:
            for cf in t.get('custom_fields', []):
                if cf.get('id') == CF_AGENDOR_DEAL_ID and cf.get('value'):
                    existing_deals_map[str(cf['value']).strip()] = t['id']
        page += 1
    print(f"  -> {len(existing_deals_map)} deals já registrados no ClickUp.")

    # 4. Ler planilha de negócios do Agendor
    print(f"\n[4/6] Lendo {SPREADSHEET_PATH}...")
    with zipfile.ZipFile(SPREADSHEET_PATH, 'r') as z:
        sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = []
        for row in sheet_tree.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
            row_vals = {}
            for cell in row.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                r_attr = cell.attrib.get('r', '')
                col_letter = ''.join([c for c in r_attr if c.isalpha()])
                is_elem = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}is')
                if is_elem is not None:
                    t_elem = is_elem.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    val = t_elem.text if t_elem is not None else ''
                else:
                    v_elem = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = v_elem.text if v_elem is not None else ''
                row_vals[col_letter] = val
            rows.append(row_vals)

    def safe_str(val):
        return str(val).strip() if val is not None else ''

    deals_dict = {}
    for r in rows[1:]:
        deal_id_raw = r.get('A', '')
        if not deal_id_raw: continue
        try:
            deal_id = str(int(float(deal_id_raw)))
        except:
            deal_id = str(deal_id_raw).strip()

        st = safe_str(r.get('L', ''))
        empresa = safe_str(r.get('C', ''))
        num_prop = safe_str(r.get('X', ''))

        if deal_id not in deals_dict:
            deals_dict[deal_id] = {
                'deal_id': deal_id,
                'titulo': safe_str(r.get('D', '')),
                'empresa': empresa,
                'responsavel': safe_str(r.get('E', 'Vendedor CRM')),
                'data_inicio_raw': r.get('F', ''),
                'data_fim_raw': r.get('G', ''),
                'valor_total': float(r.get('K', '0') or 0),
                'status': st,
                'num_proposta': num_prop,
                'tipo_oportunidade': safe_str(r.get('Y', 'PROJETO')),
                'itens': []
            }

        prod_nome = safe_str(r.get('AD', ''))
        if prod_nome:
            preco_val = float(r.get('AE', '0') or 0)
            qtd_val = int(float(r.get('AF', '1') or 1))
            deals_dict[deal_id]['itens'].append({
                'produto': prod_nome,
                'preco': preco_val,
                'qtd': qtd_val,
                'categoria': safe_str(r.get('AJ', ''))
            })

    unique_deals = list(deals_dict.values())
    print(f"  -> Total de {len(unique_deals)} negócios carregados do Agendor.")

    # 5. Execução do lote
    selected_deals = unique_deals[:limit] if limit else unique_deals
    print(f"\n[5/6] Processando {len(selected_deals)} negócios selecionados...")

    migrated_count = 0
    skipped_count = 0
    relatorio_adaptacoes = []
    contas_sem_match = []
    propostas_sem_itens = []

    for idx, deal in enumerate(selected_deals, 1):
        ag_id = deal['deal_id']
        titulo = deal['titulo']
        empresa = deal['empresa']
        valor = deal['valor_total']
        num_prop = deal['num_proposta']
        resp = deal['responsavel']
        tipo_op = deal['tipo_oportunidade'].upper()
        tipo_op_uuid = TIPO_OPORTUNIDADE_MAP.get(tipo_op, TIPO_OPORTUNIDADE_MAP['PROJETO'])

        epoch_fechamento, iso_fechamento, ano_fechamento = excel_date_to_epoch(deal['data_fim_raw'])
        epoch_inicio, iso_inicio, _ = excel_date_to_epoch(deal['data_inicio_raw'])

        print(f"\n[{idx}/{len(selected_deals)}] Negócio {ag_id}: {titulo} (R$ {valor:,.2f})")

        # Match de Conta
        conta_id = contas_map_name.get(normalize_name(empresa))
        if not conta_id:
            for norm_cname, cid in contas_map_name.items():
                if norm_cname and (norm_cname in normalize_name(empresa) or normalize_name(empresa) in norm_cname):
                    conta_id = cid
                    break
        
        if conta_id:
            print(f"  [CONTA VINCULADA] {empresa} -> ClickUp Conta ID: {conta_id}")
        else:
            print(f"  [CONTA SEM MATCH] {empresa} registrada para quarentena.")
            contas_sem_match.append({'deal_id': ag_id, 'titulo': titulo, 'empresa': empresa, 'valor': valor})

        # Verificar se já existe no ClickUp
        clickup_task_id = existing_deals_map.get(ag_id)

        if not clickup_task_id:
            # Montar Payload do ClickUp
            custom_fields_payload = [
                {"id": CF_NUM_PROPOSTA, "value": num_prop},
                {"id": CF_DEAL_VALUE, "value": valor},
                {"id": CF_ESTAGIO_VENDA, "value": OPT_ESTAGIO_GANHO},
                {"id": CF_DATA_GANHO, "value": epoch_fechamento},
                {"id": CF_AGENDOR_DEAL_ID, "value": ag_id},
                {"id": CF_TIPO_OPORTUNIDADE, "value": tipo_op_uuid},
                {"id": CF_CRM_ITEM_TYPE, "value": OPT_CRM_ITEM_NEGOCIO},
                {"id": CF_ENVIAR_AGENDOR, "value": OPT_ENVIAR_ENVIADO}
            ]

            task_payload = {
                "name": titulo,
                "status": "fechado",
                "custom_item_id": CUSTOM_ITEM_ID_NEGOCIO,
                "tags": ["migracao-agendor"],
                "custom_fields": custom_fields_payload
            }

            created_task = clickup_api_request(f"list/{NEGOCIOS_LIST_ID}/task", method='POST', data=task_payload)
            if not created_task or not created_task.get('id'):
                print(f"  [ERRO] Falha ao criar task no ClickUp para o deal {ag_id}.")
                continue

            clickup_task_id = created_task['id']
            existing_deals_map[ag_id] = clickup_task_id
            print(f"  [CLICKUP CRIADO] Task ID: {clickup_task_id} (Status: fechado | Estágio: Ganho)")

            if conta_id:
                clickup_api_request(f"task/{clickup_task_id}/link/{conta_id}", method='POST')
        else:
            print(f"  [CLICKUP EXISTENTE] Task ID: {clickup_task_id} recuperada para sincronização.")

        # Verificar / Inserir Proposta no Supabase
        existing_props = supabase_request('propostas', 'GET', params=f"?clickup_negocio_id=eq.{clickup_task_id}")
        supa_proposta_id = None

        if existing_props and len(existing_props) > 0:
            supa_proposta_id = existing_props[0]['id']
            print(f"  [SUPABASE PROPOSTA EXISTENTE] ID: {supa_proposta_id}")
        else:
            prop_payload = {
                "clickup_negocio_id": clickup_task_id,
                "versao": "vA",
                "situacao": "Selecionada",
                "total_proposta": valor,
                "data_fechamento": iso_fechamento,
                "criado_por": resp,
                "cenario": tipo_op
            }
            inserted_prop = supabase_request('propostas', method='POST', data=prop_payload)
            if inserted_prop and len(inserted_prop) > 0:
                supa_proposta_id = inserted_prop[0]['id']
                print(f"  [SUPABASE PROPOSTA CRIADA] ID: {supa_proposta_id}")

        if not supa_proposta_id:
            print(f"  [ERRO PROPOSTA] Não foi possível vincular proposta no Supabase para {clickup_task_id}.")
            continue

        # Inserção e Validação dos Itens da Proposta com Distribuidor Correto
        existing_items = supabase_request('itens_proposta', 'GET', params=f"?proposta_id=eq.{supa_proposta_id}") or []
        
        if len(existing_items) == 0 and len(deal['itens']) > 0:
            itens_inseridos_count = 0
            for it in deal['itens']:
                prod_raw = it['produto'].strip()
                cat_raw = it['categoria'].strip()
                prod_adapted = ADAPTACOES_NOMES.get(prod_raw.upper(), prod_raw)
                
                # Buscar UUID do produto
                norm_item_key = prod_adapted.upper().replace(' ', '').replace('_', '').replace('-', '')
                produto_uuid = prod_map.get(norm_item_key)

                # Resolver Distribuidor Exato com base nas regras de negócio
                distribuidor_uuid = resolve_distribuidor_id(prod_adapted, cat_raw, ano_fechamento, dist_map)

                if not produto_uuid:
                    produto_uuid = supa_prods[0]['id']
                    relatorio_adaptacoes.append({
                        'deal_id': ag_id,
                        'titulo': titulo,
                        'produto_original': prod_raw,
                        'produto_mapeado': supa_prods[0]['nome'],
                        'qtd': it['qtd'],
                        'preco': it['preco']
                    })
                elif prod_raw.upper() in ADAPTACOES_NOMES:
                    relatorio_adaptacoes.append({
                        'deal_id': ag_id,
                        'titulo': titulo,
                        'produto_original': prod_raw,
                        'produto_mapeado': prod_adapted,
                        'qtd': it['qtd'],
                        'preco': it['preco']
                    })

                item_payload = {
                    "proposta_id": supa_proposta_id,
                    "produto_id": produto_uuid,
                    "distribuidor_id": distribuidor_uuid,
                    "quantidade": it['qtd'],
                    "preco_unitario": it['preco']
                }
                res_it = supabase_request('itens_proposta', method='POST', data=item_payload)
                if res_it:
                    itens_inseridos_count += 1

            print(f"  [ITENS INSERIDOS COM SUCESSO] {itens_inseridos_count} de {len(deal['itens'])} produtos gravados.")
            if itens_inseridos_count == 0:
                propostas_sem_itens.append({'deal_id': ag_id, 'titulo': titulo, 'valor': valor})
        elif len(existing_items) > 0:
            print(f"  [ITENS JÁ EXISTENTES] {len(existing_items)} produtos já cadastrados para esta proposta.")

        migrated_count += 1

    # 6. Gerar Relatórios de Auditoria
    print("\n[6/6] Gerando relatórios de auditoria...")
    with open('relatorio_auditoria_adaptacoes.md', 'w', encoding='utf-8') as f:
        f.write("# 📋 Relatório de Auditoria — Produtos Adaptados na Migração\n\n")
        f.write(f"> Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M:%S')} para validação manual.\n\n")
        f.write("| Agendor Deal ID | Título do Negócio | Produto Original no Agendor | Produto no Supabase | Qtd | Preço Unitário | Validado? |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for item in relatorio_adaptacoes:
            f.write(f"| {item['deal_id']} | {item['titulo']} | {item['produto_original']} | {item['produto_mapeado']} | {item['qtd']} | R$ {item['preco']:,.2f} | [ ] |\n")

    with open('contas_sem_match.csv', 'w', encoding='utf-8') as f:
        f.write("Agendor Deal ID;Titulo;Empresa;Valor\n")
        for c in contas_sem_match:
            f.write(f"{c['deal_id']};{c['titulo']};{c['empresa']};{c['valor']}\n")

    with open('propostas_sem_itens.csv', 'w', encoding='utf-8') as f:
        f.write("Agendor Deal ID;Titulo;Valor\n")
        for p in propostas_sem_itens:
            f.write(f"{p['deal_id']};{p['titulo']};{p['valor']}\n")

    print("\n=== RESUMO DA EXECUÇÃO ===")
    print(f"Deals Processados: {migrated_count}")
    print(f"Produtos com Adaptação Registrados: {len(relatorio_adaptacoes)} (em relatorio_auditoria_adaptacoes.md)")
    print(f"Contas para Revisão Manual: {len(contas_sem_match)} (em contas_sem_match.csv)")
    print(f"Propostas sem Itens (Auditoria): {len(propostas_sem_itens)} (em propostas_sem_itens.csv)")
    print("=== PROCESSO CONCLUÍDO ===")

if __name__ == '__main__':
    main()
