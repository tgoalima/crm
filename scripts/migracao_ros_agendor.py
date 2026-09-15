#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de Prévia de Migração do Funil de R.O.s do Agendor para o CRM Suprimática.
Fase 5: Migração Ensaiada (Somente Prévia / Dry-Run).

Regras Mandatórias:
1. Somente leitura e simulação (dry-run estrito): nenhuma alteração no banco Supabase
   nem no ClickUp; sem deploys, migrations ou escritas.
2. Uso EXCLUSIVO de CLICKUP_API_TOKEN. CLICKUP_TOKEN é explicitamente ignorado e não utilizado.
   Suporte a --env-file opcional para carregar credenciais da VPS ou arquivo específico.
3. Fonte exclusiva: cada linha do funil "Registro de Oportunidades" é uma candidata.
   A prévia preserva as 74 R.O.s, inclusive as que ainda não possuem número oficial.
   Etapas de renovação nunca criam ciclos sem datas e evidências confirmadas.
4. Regra de vínculo estrita:
   - status_vinculo = 'vinculado' SOMENTE se:
     a) Houver exatamente 1 tarefa ClickUp para o Agendor Deal ID; E
     b) Essa tarefa estiver presente em public.negocios, retornando negocio_id UUID.
   - Se a tarefa existir no ClickUp mas não estiver em public.negocios:
     status_vinculo = 'pendente'
     motivo_pendencia = 'Tarefa ClickUp encontrada, mas oportunidade não localizada em public.negocios'.
5. Regra de duplicidade estrita:
   - possivel_duplicata = True SOMENTE quando houver compatibilidade na mesma oportunidade de:
     a) negocio_id;
     b) fabricante normalizado com confianca_fabricante == 'alta';
     c) numero_ro normalizado com confianca_numero == 'alta'.
   - Se fabricante estiver desconhecido ou com confiança baixa, registra como
     revisão de possível coincidência, NÃO como duplicidade confirmada.
6. Separação explícita de contagens no resumo (negócios com campo preenchido na fonte: 73 vs
   negócios com candidato válido pós-descarte).
7. Metadados de coleta e ambiente de execução no JSON de resumo.
"""

import argparse
import csv
import hashlib
import json
import os
import platform
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict, Counter
from datetime import datetime

SCRIPT_VERSION = "2.0.0"

# Constantes de integração
CLICKUP_NEGOCIOS_LIST_ID = '901326185457'
CF_AGENDOR_DEAL_ID = '94d84531-94e7-4f7c-b982-0ab8d9d87b2d'
DEFAULT_PLANILHA_PATH = '_arquivo_historico/planilhas_agendor/Agendor_Funil_R.Os.xlsx'
DEFAULT_OUTPUT_DIR = 'reports'
FUNIL_RO_ESPERADO = 'registro de oportunidades'


def desacentuar(txt):
    """Normaliza rótulos do Agendor para comparação sem alterar o valor original."""
    if txt is None:
        return ''
    return ''.join(
        c for c in unicodedata.normalize('NFKD', str(txt))
        if not unicodedata.combining(c)
    ).lower().strip()


def _valor_linha(linha, indice):
    if indice is None or indice >= len(linha) or linha[indice] is None:
        return ''
    return str(linha[indice]).strip()


def validar_exportacao_funil_ro(headers, linhas):
    """Recusa qualquer exportação que não seja do funil dedicado de R.O.s."""
    indices = {desacentuar(header): pos for pos, header in enumerate(headers) if header}
    obrigatorias = ('codigo do negocio', 'funil', 'etapa', 'r.o i')
    ausentes = [campo for campo in obrigatorias if campo not in indices]
    if ausentes:
        raise ValueError(
            'Planilha incompatível: faltam colunas obrigatórias do funil Registro de Oportunidades: '
            + ', '.join(ausentes)
        )
    valores_funil = {
        desacentuar(_valor_linha(linha, indices['funil']))
        for linha in linhas
        if _valor_linha(linha, indices['codigo do negocio'])
    }
    if valores_funil != {FUNIL_RO_ESPERADO}:
        recebido = ', '.join(sorted(valor or '(vazio)' for valor in valores_funil)) or '(sem linhas)'
        raise ValueError(
            'Planilha incompatível: a prévia aceita somente o funil "Registro de Oportunidades". '
            f'Funil recebido: {recebido}'
        )
    return indices


def gerar_source_id_funil_ro(deal_id):
    """Uma linha do funil dedicado representa uma única R.O. de origem."""
    return f'agendor-ro:{deal_id}'


def mapear_etapa_agendor_ro(etapa):
    """Sugere somente estados que a exportação confirma sem criar ciclos fictícios."""
    etapa_norm = desacentuar(etapa)
    if etapa_norm == 'backoffice':
        return 'Backoffice', 'nao_informada', ''
    if etapa_norm == 'aguardando aprovacao':
        return 'Aguardando aprovação', 'nao_informada', ''
    if etapa_norm == 'aprovado':
        return 'Aprovada', 'nao_informada', ''
    if etapa_norm in ('1o renovacao', '2o renovacao manual'):
        return (
            'Aprovada',
            'revisao_humana_necessaria',
            f'Etapa "{etapa}" indica renovação, mas a exportação não traz datas, ciclo nem evidências para criá-la automaticamente.'
        )
    return (
        'revisao_humana_necessaria',
        'revisao_humana_necessaria',
        f'Etapa do Agendor não mapeada: "{etapa or "(vazia)"}".'
    )


def classificar_ro_funil(numero_raw, titulo, descricao):
    """Prioriza o campo R.O I; usa título/descrição apenas para identificar o fabricante."""
    numero = str(numero_raw or '').strip()
    contexto = ' '.join(parte for parte in (titulo, descricao, numero) if parte)
    fabricante = normalizar_nome_fabricante(contexto)
    if numero:
        classificacao = classificar_e_extrair_ro(numero)
        numero_sugerido = numero.upper()
        confianca_numero = 'alta'
    else:
        classificacao = None
        numero_sugerido = ''
        confianca_numero = 'desconhecida'

    if fabricante:
        fabricante_sugerido = fabricante
        confianca_fabricante = 'alta'
    elif classificacao and classificacao['fabricante_sugerido'] != 'DESCONHECIDO':
        fabricante_sugerido = classificacao['fabricante_sugerido']
        confianca_fabricante = classificacao['confianca_fabricante']
    else:
        fabricante_sugerido = 'DESCONHECIDO'
        confianca_fabricante = 'desconhecida'

    pendencias = []
    if not numero_sugerido:
        pendencias.append('Número oficial da R.O. não informado no Agendor.')
    if fabricante_sugerido == 'DESCONHECIDO':
        pendencias.append('Fabricante não identificado com segurança na exportação.')
    return {
        'valor_bruto': numero,
        'fabricante_sugerido': fabricante_sugerido,
        'confianca_fabricante': confianca_fabricante,
        'numero_ro_sugerido': numero_sugerido,
        'confianca_numero': confianca_numero,
        'motivo_pendencia': ' '.join(pendencias),
    }


def extrair_candidatos_funil_ro(headers, linhas):
    """Extrai uma candidata por linha da exportação exclusiva do funil de R.O.s."""
    indices = validar_exportacao_funil_ro(headers, linhas)
    def indice(*nomes):
        return next((indices.get(desacentuar(nome)) for nome in nomes if desacentuar(nome) in indices), None)

    candidatos = []
    for linha in linhas:
        deal_id = normalizar_codigo_agendor(_valor_linha(linha, indices['codigo do negocio']))
        if not deal_id:
            continue
        titulo = _valor_linha(linha, indice('título do negócio', 'titulo do negocio'))
        descricao = _valor_linha(linha, indice('descrição', 'descricao'))
        etapa = _valor_linha(linha, indices['etapa'])
        classificacao = classificar_ro_funil(_valor_linha(linha, indices['r.o i']), titulo, descricao)
        situacao, renovacao, pendencia_etapa = mapear_etapa_agendor_ro(etapa)
        pendencias = [classificacao['motivo_pendencia'], pendencia_etapa, 'Categoria da R.O. não exportada; validar com Fábio antes da migração.']
        classificacao['motivo_pendencia'] = ' '.join(p for p in pendencias if p)
        candidatos.append({
            'source_id': gerar_source_id_funil_ro(deal_id),
            'agendor_deal_id': deal_id,
            'coluna_origem': 'R.O I',
            'empresa_agendor': _valor_linha(linha, indice('empresa relacionada')),
            'titulo_agendor': titulo,
            'status_agendor': _valor_linha(linha, indice('status')),
            'etapa_agendor': etapa,
            'funil_agendor': _valor_linha(linha, indices['funil']),
            'descricao_agendor': descricao,
            'data_inicio_agendor': _valor_linha(linha, indice('data de início', 'data de inicio')),
            'data_conclusao_agendor': _valor_linha(linha, indice('data de conclusão', 'data de conclusao')),
            'data_cadastro_agendor': _valor_linha(linha, indice('data de cadastro')),
            'validade_confirmada': 'nao_informada',
            'renovacao_confirmada': renovacao,
            'situacao_operacional_sugerida': situacao,
            **classificacao,
        })
    return candidatos, {'total_linhas_ro_fonte': len(linhas), 'total_ros_fonte': len(candidatos)}


def calcular_hash_script():
    """Calcula o hash SHA-256 do próprio arquivo para rastreabilidade estrita."""
    try:
        script_path = os.path.abspath(__file__)
        with open(script_path, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return "desconhecido"


def identificar_ambiente():
    """Identifica o ambiente de execução (VPS vs Local)."""
    node = platform.node()
    system = platform.system()
    if os.path.exists('/home/ubuntu'):
        return f"vps_linux (host: {node}, os: {system} {platform.release()})"
    return f"local_{system.lower()} (host: {node}, os: {system} {platform.release()})"


def carregar_env_local(env_path=None):
    """
    Carrega variáveis de ambiente a partir de um arquivo env especificado ou .env padrão.
    Regra 1: Usa exclusivamente CLICKUP_API_TOKEN. A chave CLICKUP_TOKEN é ignorada.
    Nunca sobrescreve variáveis que já foram exportadas no ambiente.
    """
    alvos = []
    if env_path:
        alvos.append(env_path)
    alvos.append('.env')

    for path in alvos:
        if path and os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    # Regra 1: Ignora explicitamente CLICKUP_TOKEN; usa apenas CLICKUP_API_TOKEN
                    if k == 'CLICKUP_TOKEN':
                        continue
                    if k and k not in os.environ:
                        os.environ[k] = v

    # Fallbacks de nomes comuns do Docker Supabase
    if not os.environ.get('SUPABASE_SERVICE_ROLE_KEY') and os.environ.get('SERVICE_ROLE_KEY'):
        os.environ['SUPABASE_SERVICE_ROLE_KEY'] = os.environ['SERVICE_ROLE_KEY']
    if not os.environ.get('SUPABASE_URL'):
        if os.environ.get('SUPABASE_PUBLIC_URL'):
            os.environ['SUPABASE_URL'] = os.environ['SUPABASE_PUBLIC_URL'].rstrip('/')
        elif os.environ.get('API_EXTERNAL_URL'):
            os.environ['SUPABASE_URL'] = os.environ['API_EXTERNAL_URL'].split('/auth')[0].rstrip('/')
    elif '/auth' in os.environ.get('SUPABASE_URL', ''):
        os.environ['SUPABASE_URL'] = os.environ['SUPABASE_URL'].split('/auth')[0].rstrip('/')


# ---------------------------------------------------------------------------
# 1. Leitura XLSX com Biblioteca Padrão (zipfile + ElementTree)
# ---------------------------------------------------------------------------

def ler_planilha_xlsx(xlsx_path):
    """
    Lê a primeira planilha de um arquivo .xlsx utilizando apenas a biblioteca
    padrão do Python (zipfile e xml.etree.ElementTree).
    Garante portabilidade total sem dependência de openpyxl ou venv.
    """
    if not os.path.exists(xlsx_path):
        raise FileNotFoundError(f"Planilha não encontrada: {xlsx_path}")

    with zipfile.ZipFile(xlsx_path, 'r') as z:
        # 1. Shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            with z.open('xl/sharedStrings.xml') as f:
                tree = ET.parse(f)
                root = tree.getroot()
                ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
                for si in root.iter(f'{ns}si'):
                    text = "".join(t.text or "" for t in si.iter(f'{ns}t'))
                    shared_strings.append(text)

        # 2. Primeira planilha de trabalho
        sheet_candidates = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
        if not sheet_candidates:
            raise ValueError(f"Nenhuma planilha encontrada dentro de {xlsx_path}")
        sheet_path = sorted(sheet_candidates)[0]

        with z.open(sheet_path) as f:
            tree = ET.parse(f)
            root = tree.getroot()
            ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

            rows = []
            for row in root.iter(f'{ns}row'):
                row_cells = {}
                max_c = 0
                for c in row.iter(f'{ns}c'):
                    ref = c.attrib.get('r', '')
                    col_match = re.match(r'([A-Z]+)(\d+)', ref)
                    if col_match:
                        col_letters, _ = col_match.groups()
                        col_idx = 0
                        for char in col_letters:
                            col_idx = col_idx * 26 + (ord(char) - ord('A') + 1)
                        col_idx -= 1
                    else:
                        col_idx = max_c

                    max_c = max(max_c, col_idx + 1)
                    cell_type = c.attrib.get('t')
                    val_el = c.find(f'{ns}v')
                    raw_val = val_el.text if val_el is not None else None

                    if raw_val is not None:
                        if cell_type == 's':
                            try:
                                s_idx = int(raw_val)
                                val = shared_strings[s_idx] if s_idx < len(shared_strings) else ""
                            except ValueError:
                                val = raw_val
                        else:
                            val = raw_val
                    else:
                        is_el = c.find(f'{ns}is')
                        if is_el is not None:
                            val = "".join(t.text or "" for t in is_el.iter(f'{ns}t'))
                        else:
                            val = None

                    row_cells[col_idx] = val

                dense_row = [row_cells.get(i) for i in range(max_c)]
                rows.append(dense_row)

            return rows


# ---------------------------------------------------------------------------
# 2. Normalização e Higienização de Identificadores
# ---------------------------------------------------------------------------

def normalizar_codigo_agendor(raw_val):
    """
    Normaliza o identificador do negócio Agendor.
    Suporta float do Excel (42112468.0), notação científica (4.2112468E7),
    inteiros puros e strings com espaços.
    Retorna uma string numérica limpa sem decimais artificiais, ou None se inválido.
    """
    if raw_val is None:
        return None
    val_str = str(raw_val).strip()
    if not val_str:
        return None

    # Tenta conversão numérica direta (lida com float e notação científica)
    try:
        f_val = float(val_str)
        if f_val.is_integer():
            return str(int(f_val))
    except (ValueError, OverflowError):
        pass

    digits_only = re.sub(r'\D', '', val_str)
    if digits_only:
        return digits_only

    return None


def gerar_source_id(deal_id, col_name):
    """
    Gera um identificador de origem determinístico e estável para a R.O. candidata.
    Exemplo: "agendor:42112468:r_o_i"
    """
    col_norm = re.sub(r'[^a-zA-Z0-9]', '_', str(col_name).strip().lower())
    col_norm = re.sub(r'_+', '_', col_norm).strip('_')
    return f"agendor:{deal_id}:{col_norm}"


# ---------------------------------------------------------------------------
# 3. Classificação e Extração Heurística de R.O.
# ---------------------------------------------------------------------------

VALORES_DESCARTAVEIS = {
    "'", "-", "—", ".", "/", "n/a", "nao", "não", "nao tem", "sem registro",
    "sem ro", "sem r.o", "sem r.o.", "sem ro - renovação", "sem ro - renovacao",
    "vmware não é elegivél essentials", "vmware nao e elegivel essentials"
}

def normalizar_nome_fabricante(nome):
    """
    Normaliza o nome de um fabricante para a convenção canônica do pipeline e CRM:
    DELL, FORTINET, VEEAM, HPE, BROADCOM, RED HAT, etc.
    Retorna a string em caixa alta normalizada, ou None se for vazio/desconhecido/não identificável.
    """
    if not nome:
        return None
    raw = str(nome).strip()
    norm = unicodedata.normalize('NFKD', raw)
    norm = "".join(c for c in norm if not unicodedata.combining(c)).upper()

    if not norm or norm in ('DESCONHECIDO', 'UNKNOWN', 'OUTRO', 'OUTROS', 'N/A', '-', '—'):
        return None

    if 'DELL' in norm:
        return 'DELL'
    if 'FORTINET' in norm or norm.startswith('FORTI'):
        return 'FORTINET'
    if 'VEEAM' in norm:
        return 'VEEAM'
    if 'HPE' in norm or 'HEWLETT' in norm or 'ARUBA' in norm:
        return 'HPE'
    if 'BROADCOM' in norm or 'VMWARE' in norm:
        return 'BROADCOM'
    if 'RED HAT' in norm or 'REDHAT' in norm or 'RHEL' in norm:
        return 'RED HAT'
    if 'SANGFOR' in norm:
        return 'SANGFOR'
    if 'NUTANIX' in norm:
        return 'NUTANIX'
    if 'ORACLE' in norm or 'OCI' in norm:
        return 'ORACLE'
    if 'LENOVO' in norm:
        return 'LENOVO'
    if 'GOOGLE CLOUD' in norm or ' GCP' in f' {norm}':
        return 'GOOGLE CLOUD'
    if 'POSITIVO' in norm:
        return 'POSITIVO'
    if 'SUPERMICRO' in norm:
        return 'SUPERMICRO'
    if 'OMNISSA' in norm:
        return 'OMNISSA'

    return None

def classificar_e_extrair_ro(raw_val, deal_context=None):
    """
    Classifica um valor bruto de campo de R.O.
    Descarta valores sem R.O., apóstrofos, observações de inelegibilidade.
    Extrai fabricante sugerido e número com níveis de confiança explícitos
    (alta, baixa, desconhecida).
    Retorna um dicionário com os campos analisados ou None se for descartável/vazio.
    """
    if raw_val is None:
        return None

    raw_str = str(raw_val).strip()
    if not raw_str:
        return None

    raw_lower = raw_str.lower()
    if raw_lower in VALORES_DESCARTAVEIS or raw_str in VALORES_DESCARTAVEIS:
        return None

    # Inicialização dos campos com ausência e confiança desconhecida
    fabricante_sugerido = "DESCONHECIDO"
    confianca_fabricante = "desconhecida"
    numero_ro_sugerido = ""
    confianca_numero = "desconhecida"
    motivo_pendencia = ""

    # Padrão VEEAM: DRG-xxxxxx-xxxx... ou menção explícita a Veeam
    veeam_pattern = re.search(r'DRG-\d{6}-[\w-]+', raw_str, re.IGNORECASE)
    if 'veeam' in raw_lower or veeam_pattern:
        fabricante_sugerido = "VEEAM"
        confianca_fabricante = "alta"
        if veeam_pattern:
            numero_ro_sugerido = veeam_pattern.group(0).upper()
            confianca_numero = "alta"
        elif 'prime' in raw_lower:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Registro Prime Veeam sem número de Deal Registration informado"
        else:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Menção a Veeam sem número padronizado identificável"

    # Padrão FORTINET: DR-xxxx-xxxx ou menção explícita a Fortinet
    elif 'fortinet' in raw_lower or re.search(r'\bDR-\d{4}-\d+\b', raw_str, re.IGNORECASE):
        fabricante_sugerido = "FORTINET"
        confianca_fabricante = "alta"
        fortinet_num = re.search(r'DR-\d{4}-\d+', raw_str, re.IGNORECASE)
        if fortinet_num:
            numero_ro_sugerido = fortinet_num.group(0).upper()
            confianca_numero = "alta"
        elif 'ro interno' in raw_lower:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Anotação de R.O. interna (Fortinet) sem código externo registrado"
        else:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Menção a Fortinet sem número de Deal Registration padronizado"

    # Padrão HPE / ARUBA: OPE-xxxxxxx ou menção explícita a HPE
    elif 'hpe' in raw_lower or 'aruba' in raw_lower or re.search(r'\bOPE\s*-?\s*\d+\b', raw_str, re.IGNORECASE):
        fabricante_sugerido = "HPE"
        confianca_fabricante = "alta"
        hpe_num = re.search(r'OPE\s*-?\s*(\d+)', raw_str, re.IGNORECASE)
        if hpe_num:
            numero_ro_sugerido = f"OPE-{hpe_num.group(1)}"
            confianca_numero = "alta"
        else:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Menção a HPE sem número padronizado identificável"

    # Padrão BROADCOM / VMWARE
    elif 'broadcom' in raw_lower or 'vmware' in raw_lower:
        fabricante_sugerido = "BROADCOM"
        confianca_fabricante = "alta"
        b_num = re.search(r'[A-Z0-9]{8,12}', raw_str)
        if b_num and not b_num.group(0).isdigit():
            numero_ro_sugerido = b_num.group(0)
            confianca_numero = "alta"
        else:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Menção a Broadcom sem código identificável"

    # Padrão RED HAT / RHEL
    elif 'rhel' in raw_lower or 'red hat' in raw_lower:
        fabricante_sugerido = "RED HAT"
        confianca_fabricante = "alta"
        r_num = re.search(r'\b\d{6,10}\b', raw_str)
        if r_num:
            numero_ro_sugerido = r_num.group(0)
            confianca_numero = "alta"
        else:
            numero_ro_sugerido = ""
            confianca_numero = "desconhecida"
            motivo_pendencia = "Menção a Red Hat sem número de registro"

    # Padrão DELL: Menção explícita a Dell ou 8 dígitos numéricos típicos de Dell Deal Registration
    elif 'dell' in raw_lower:
        fabricante_sugerido = "DELL"
        confianca_fabricante = "alta"
        dell_num = re.search(r'\b\d{8}\b', raw_str)
        if dell_num:
            numero_ro_sugerido = dell_num.group(0)
            confianca_numero = "alta"
        else:
            any_digits = re.search(r'\b\d{6,10}\b', raw_str)
            if any_digits:
                numero_ro_sugerido = any_digits.group(0)
                confianca_numero = "baixa"
            else:
                numero_ro_sugerido = ""
                confianca_numero = "desconhecida"
                motivo_pendencia = "Menção a Dell sem número de registro de 8 dígitos"

    # Caso 8 dígitos isolados com palavra STORAGE ou similar (Dell sugerido)
    elif re.search(r'\b\d{8}\b', raw_str):
        d_num = re.search(r'\b\d{8}\b', raw_str)
        numero_ro_sugerido = d_num.group(0)
        confianca_numero = "alta"
        if 'storage' in raw_lower:
            fabricante_sugerido = "DELL"
            confianca_fabricante = "baixa"
            motivo_pendencia = "Número de 8 dígitos com menção a Storage; fabricante Dell sugerido com baixa confiança"
        elif 'r.o' in raw_lower:
            fabricante_sugerido = "DESCONHECIDO"
            confianca_fabricante = "baixa"
            motivo_pendencia = "Número de 8 dígitos precedido de R.O; fabricante não confirmado"
        else:
            fabricante_sugerido = "DESCONHECIDO"
            confianca_fabricante = "desconhecida"
            motivo_pendencia = "Número de 8 dígitos sem fabricante identificado"

    # Caso PRIME sem fabricante
    elif 'prime' in raw_lower:
        fabricante_sugerido = "DESCONHECIDO"
        confianca_fabricante = "desconhecida"
        numero_ro_sugerido = ""
        confianca_numero = "desconhecida"
        motivo_pendencia = "Registro de programa Prime / garantia sem código alfanumérico padrão de R.O."

    else:
        fabricante_sugerido = "DESCONHECIDO"
        confianca_fabricante = "desconhecida"
        numero_ro_sugerido = ""
        confianca_numero = "desconhecida"
        motivo_pendencia = "Texto fora do padrão de R.O.; requer revisão humana"

    return {
        'valor_bruto': raw_str,
        'fabricante_sugerido': fabricante_sugerido,
        'confianca_fabricante': confianca_fabricante,
        'numero_ro_sugerido': numero_ro_sugerido,
        'confianca_numero': confianca_numero,
        'motivo_pendencia': motivo_pendencia,
    }


# ---------------------------------------------------------------------------
# 4. Requisições HTTP com Biblioteca Padrão (urllib)
# ---------------------------------------------------------------------------

def http_get_json(url, headers=None, timeout=30):
    """
    Executa requisição GET HTTP retornando (status_code, json_data, err_msg).
    Utiliza unicamente a standard library do Python (urllib).
    """
    req = urllib.request.Request(url, headers=headers or {}, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status_code = resp.getcode()
            raw_body = resp.read().decode('utf-8')
            try:
                data = json.loads(raw_body)
            except Exception:
                data = None
            return status_code, data, None
    except urllib.error.HTTPError as ex:
        status_code = ex.code
        try:
            raw_body = ex.read().decode('utf-8')
            data = json.loads(raw_body)
        except Exception:
            data = None
            raw_body = str(ex)
        return status_code, data, raw_body
    except urllib.error.URLError as ex:
        return 0, None, str(ex.reason)
    except Exception as ex:
        return 0, None, str(ex)


# ---------------------------------------------------------------------------
# 5. Coleta Paginada do ClickUp com Falha Explícita
# ---------------------------------------------------------------------------

def carregar_mapa_clickup(token=None, cache_path=None, max_retries=3):
    """
    Carrega tarefas da lista de Negócios do ClickUp (901326185457).
    Regra 1: Usa EXCLUSIVAMENTE CLICKUP_API_TOKEN. CLICKUP_TOKEN é proibido.
    Nunca exibe ou registra tokens em logs ou saídas.
    
    Regras de robustez:
    - Trata rate limit HTTP 429 com backoff controlado.
    - Falha explicitamente (RuntimeError) em erros 401, timeouts não recuperáveis,
      JSON corrompido ou quando a coleta não terminar com sucesso.
    - NUNCA retorna mapa vazio simulando sucesso.
    """
    tasks = []
    origem_clickup = "api"
    data_coleta = datetime.now().isoformat()

    if cache_path and os.path.exists(cache_path):
        print(f"[ClickUp] Carregando tarefas do cache local: {cache_path}")
        origem_clickup = "cache"
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                if isinstance(cached_data, list):
                    tasks = cached_data
                elif isinstance(cached_data, dict) and 'tasks' in cached_data:
                    tasks = cached_data['tasks']
                else:
                    raise ValueError("Formato de cache ClickUp inválido.")
        except Exception as e:
            raise RuntimeError(f"Falha ao ler cache do ClickUp ({cache_path}): {e}")

        if not tasks:
            raise RuntimeError(f"O cache do ClickUp ({cache_path}) está vazio. Coleta inválida.")
    else:
        # Regra 1: Exclusivamente CLICKUP_API_TOKEN
        if not token:
            token = os.getenv('CLICKUP_API_TOKEN')
        if not token:
            raise RuntimeError(
                "CLICKUP_API_TOKEN não configurado no ambiente nem no arquivo env informado. "
                "Para executar a prévia, informe a credencial via --env-file ou variável de ambiente."
            )

        print(f"[ClickUp] Iniciando coleta paginada da lista de Negócios ({CLICKUP_NEGOCIOS_LIST_ID})...")
        page = 0
        headers = {
            'Authorization': token,
            'Content-Type': 'application/json'
        }

        while True:
            url = f"https://api.clickup.com/api/v2/list/{CLICKUP_NEGOCIOS_LIST_ID}/task?include_closed=true&page={page}"
            success = False

            for attempt in range(max_retries):
                status_code, data, err_msg = http_get_json(url, headers=headers, timeout=30)
                time.sleep(0.65)  # Throttle defensivo

                if status_code == 429:
                    wait_sec = (attempt + 1) * 3
                    print(f"  [ClickUp 429] Rate limit atingido na página {page}. Aguardando {wait_sec}s...")
                    time.sleep(wait_sec)
                    continue

                if status_code == 401:
                    raise RuntimeError(
                        f"ClickUp HTTP 401 Unauthorized: token CLICKUP_API_TOKEN inválido ou sem permissão para a lista {CLICKUP_NEGOCIOS_LIST_ID}."
                    )

                if status_code != 200 or data is None:
                    print(f"  [ClickUp HTTP {status_code}] Erro na página {page}: {str(err_msg)[:200]}")
                    time.sleep(2)
                    continue

                page_tasks = data.get('tasks', [])
                if not page_tasks:
                    success = True
                    break

                tasks.extend(page_tasks)
                print(f"  -> Página {page}: {len(page_tasks)} tarefas carregadas (total acumulado: {len(tasks)})")
                success = True
                break

            if not success:
                raise RuntimeError(
                    f"Falha irrecuperável ao coletar página {page} do ClickUp. Coleta abortada para não gerar prévia parcial."
                )

            if not page_tasks:
                break
            page += 1

        if not tasks:
            raise RuntimeError(
                f"Nenhuma tarefa retornada da lista ClickUp {CLICKUP_NEGOCIOS_LIST_ID}. Coleta considerada incompleta."
            )

        print(f"[ClickUp] Coleta finalizada com sucesso. Total de tarefas: {len(tasks)}")

        os.makedirs('cache', exist_ok=True)
        cache_out = 'cache/clickup_tasks_negocios.json'
        try:
            with open(cache_out, 'w', encoding='utf-8') as f:
                json.dump(tasks, f, ensure_ascii=False)
            print(f"[ClickUp] Cache de segurança salvo em {cache_out}")
        except Exception as e:
            print(f"  [ClickUp] Aviso: não foi possível gravar arquivo de cache: {e}")

    # Indexação por Agendor Deal ID
    agendor_id_to_tasks = defaultdict(list)
    for t in tasks:
        for cf in t.get('custom_fields', []):
            if cf.get('id') == CF_AGENDOR_DEAL_ID and cf.get('value'):
                norm_id = normalizar_codigo_agendor(cf.get('value'))
                if norm_id:
                    agendor_id_to_tasks[norm_id].append({
                        'id': t.get('id'),
                        'name': t.get('name', ''),
                        'status': t.get('status', {}).get('status', '') if isinstance(t.get('status'), dict) else str(t.get('status', ''))
                    })

    print(f"[ClickUp] Indexados {len(agendor_id_to_tasks)} Agendor Deal IDs distintos.")

    info_coleta = {
        'origem_clickup': origem_clickup,
        'data_coleta_clickup': data_coleta,
        'total_tarefas_clickup_lidas': len(tasks),
        'paginacao_completa': True,
    }

    return agendor_id_to_tasks, tasks, info_coleta


# ---------------------------------------------------------------------------
# 6. Consulta Somente-Leitura ao CRM (Supabase)
# ---------------------------------------------------------------------------

def carregar_mapa_crm(supabase_url=None, supabase_key=None):
    """
    Executa leituras SOMENTE-LEITURA no Supabase:
    - negocios: mapeia clickup_negocio_id -> {id, nome, conta_id}
    - registros_oportunidade: mapeia (negocio_id, fabricante_id, numero_ro) -> id
      para detecção de duplicidades com R.O.s já cadastradas no CRM.
    Nunca grava, atualiza ou altera qualquer linha no banco.
    """
    if not supabase_url:
        supabase_url = os.getenv('SUPABASE_URL') or os.getenv('SUPABASE_PUBLIC_URL')
    if supabase_url and '/auth' in supabase_url:
        supabase_url = supabase_url.split('/auth')[0].rstrip('/')
    if not supabase_key:
        supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SERVICE_ROLE_KEY') or os.getenv('SUPABASE_KEY')

    negocios_map = {}
    ros_existentes_crm = []

    if not supabase_url or not supabase_key:
        print("[CRM/Supabase] Credenciais não fornecidas. Pulando enriquecimento de UUID de negócio e checagem de R.O.s existentes.")
        return negocios_map, ros_existentes_crm

    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json'
    }

    # 1. Leitura somente-leitura de public.negocios
    try:
        url_negocios = f"{supabase_url.rstrip('/')}/rest/v1/negocios?select=id,clickup_negocio_id,nome,conta_id&limit=5000"
        status_code, data, err_msg = http_get_json(url_negocios, headers=headers, timeout=20)
        if status_code == 200 and isinstance(data, list):
            for item in data:
                cid = item.get('clickup_negocio_id')
                if cid:
                    negocios_map[cid] = item
            print(f"[CRM/Supabase] {len(negocios_map)} negócios carregados da tabela 'negocios'.")
        else:
            print(f"  [CRM/Supabase] Aviso: GET em 'negocios' retornou status {status_code}: {str(err_msg)[:200]}")
    except Exception as e:
        print(f"  [CRM/Supabase] Aviso ao ler tabela 'negocios': {e}")

    # 2. Leitura somente-leitura de public.fabricantes_ro (para normalização e checagem estrita de fabricante)
    fabricantes_map = {}
    try:
        url_fabs = f"{supabase_url.rstrip('/')}/rest/v1/fabricantes_ro?select=id,nome&limit=1000"
        status_code, data, err_msg = http_get_json(url_fabs, headers=headers, timeout=20)
        if status_code == 200 and isinstance(data, list):
            for f in data:
                fid = f.get('id')
                fnome = f.get('nome')
                if fid and fnome:
                    fabricantes_map[fid] = normalizar_nome_fabricante(fnome)
            print(f"[CRM/Supabase] {len(fabricantes_map)} fabricantes carregados da tabela 'fabricantes_ro'.")
        elif status_code == 404:
            print("[CRM/Supabase] Tabela 'fabricantes_ro' não encontrada no banco. Normalização por ID ignorada.")
        else:
            print(f"  [CRM/Supabase] Aviso: GET em 'fabricantes_ro' retornou status {status_code}: {str(err_msg)[:200]}")
    except Exception as e:
        print(f"  [CRM/Supabase] Aviso ao ler 'fabricantes_ro': {e}")

    # 3. Leitura somente-leitura de public.registros_oportunidade (se existir)
    try:
        url_ros = f"{supabase_url.rstrip('/')}/rest/v1/registros_oportunidade?select=id,negocio_id,fabricante_id,numero_ro,situacao&limit=5000"
        status_code, data, err_msg = http_get_json(url_ros, headers=headers, timeout=20)
        if status_code == 200 and isinstance(data, list):
            for ro in data:
                fid = ro.get('fabricante_id')
                if 'fabricante_normalizado' not in ro:
                    ro['fabricante_normalizado'] = fabricantes_map.get(fid)
            ros_existentes_crm = data
            print(f"[CRM/Supabase] {len(ros_existentes_crm)} R.O.s existentes carregadas para verificação de duplicidade.")
        elif status_code == 404:
            print("[CRM/Supabase] Tabela 'registros_oportunidade' não encontrada no banco (migration ainda não aplicada). Checagem contra CRM ignorada.")
        else:
            print(f"  [CRM/Supabase] Aviso: GET em 'registros_oportunidade' retornou status {status_code}: {str(err_msg)[:200]}")
    except Exception as e:
        print(f"  [CRM/Supabase] Aviso ao ler 'registros_oportunidade': {e}")

    return negocios_map, ros_existentes_crm


# ---------------------------------------------------------------------------
# 7. Motor de Conciliação e Detecção de Duplicidades (Regras 2 e 3)
# ---------------------------------------------------------------------------

def executar_conciliacao(candidatos, agendor_id_to_tasks, crm_negocios_map, crm_ros_existentes):
    """
    Concilia candidatos de R.O. com tarefas do ClickUp e o CRM.
    
    Regra 2 (Vínculo Estrito):
    status_vinculo só pode ser 'vinculado' quando:
    - houver exatamente 1 tarefa ClickUp para o Agendor Deal ID; E
    - essa tarefa estiver presente em public.negocios, retornando negocio_id.
    Se a tarefa existir no ClickUp mas negocio_id não existir no CRM:
    status_vinculo = 'pendente'
    motivo_pendencia = "Tarefa ClickUp encontrada, mas oportunidade não localizada em public.negocios"
    
    Regra 3 (Duplicidade Estrita):
    Sinaliza possivel_duplicata = True SOMENTE quando houver compatibilidade de:
    - negocio_id;
    - fabricante normalizado, com confianca_fabricante == 'alta';
    - numero_ro normalizado, com confianca_numero == 'alta'.
    Se fabricante estiver desconhecido ou com confiança baixa, registra como
    revisão de possível coincidência, NÃO como duplicidade confirmada.
    """
    # 1. Determina mapeamento preliminar de negócio
    candidatos_com_negocio = []
    for c in candidatos:
        deal_id = c['agendor_deal_id']
        matched = agendor_id_to_tasks.get(deal_id, [])
        c_copy = dict(c)
        if len(matched) == 1:
            t = matched[0]
            c_copy['clickup_task_id'] = t['id']
            neg_info = crm_negocios_map.get(t['id'])
            if neg_info and neg_info.get('id'):
                c_copy['negocio_id'] = neg_info.get('id')
                c_copy['negocio_nome'] = neg_info.get('nome', t.get('name', ''))
            else:
                c_copy['negocio_id'] = None
                c_copy['negocio_nome'] = t.get('name', '')
        else:
            c_copy['clickup_task_id'] = None
            c_copy['negocio_id'] = None
            c_copy['negocio_nome'] = ''
        candidatos_com_negocio.append(c_copy)

    # 2. Indexadores para detecção de duplicidades e coincidências
    candidatos_por_negocio_fab_num = defaultdict(list)
    candidatos_por_num = defaultdict(list)

    for c in candidatos_com_negocio:
        num = str(c.get('numero_ro_sugerido', '')).strip().upper()
        fab = str(c.get('fabricante_sugerido', '')).strip().upper()
        conf_num = c.get('confianca_numero')
        conf_fab = c.get('confianca_fabricante')

        if num:
            candidatos_por_num[num].append(c)

        if c.get('negocio_id') and num and fab and fab != 'DESCONHECIDO' and conf_fab == 'alta' and conf_num == 'alta':
            candidatos_por_negocio_fab_num[(c['negocio_id'], fab, num)].append(c)

    # Indexa R.O.s pré-existentes do CRM por:
    # 1. (negocio_id, fabricante_normalizado, numero_ro_normalizado) para duplicidade confirmada
    # 2. (negocio_id, numero_ro_normalizado) para R.O.s onde o fabricante é desconhecido/não-normalizado
    ros_crm_por_negocio_fab_num = defaultdict(list)
    ros_crm_sem_fab_por_negocio_num = defaultdict(list)

    for ro in crm_ros_existentes:
        ro_neg_id = ro.get('negocio_id')
        ro_num = str(ro.get('numero_ro', '')).strip().upper()
        if not ro_neg_id or not ro_num:
            continue

        raw_fab = ro.get('fabricante_normalizado') or ro.get('fabricante') or ro.get('fabricante_nome')
        ro_fab = normalizar_nome_fabricante(raw_fab)

        if ro_fab:
            ros_crm_por_negocio_fab_num[(ro_neg_id, ro_fab, ro_num)].append(ro)
        else:
            ros_crm_sem_fab_por_negocio_num[(ro_neg_id, ro_num)].append(ro)

    registros_conciliados = []

    for c in candidatos_com_negocio:
        deal_id = c['agendor_deal_id']
        matched_tasks = agendor_id_to_tasks.get(deal_id, [])

        status_vinculo = "pendente"
        clickup_task_id = c.get('clickup_task_id') or ""
        negocio_id = c.get('negocio_id') or ""
        negocio_nome = c.get('negocio_nome') or ""
        motivo_pendencia = c.get('motivo_pendencia', '')

        # Regra 2: Validação estrita de vínculo
        if len(matched_tasks) == 1:
            if negocio_id:
                status_vinculo = "vinculado"
            else:
                status_vinculo = "pendente"
                motivo_pendencia = "Tarefa ClickUp encontrada, mas oportunidade não localizada em public.negocios"
        elif len(matched_tasks) > 1:
            status_vinculo = "pendente"
            task_ids = ", ".join(t['id'] for t in matched_tasks)
            motivo_pendencia = f"Ambiguidade: Agendor Deal ID associado a {len(matched_tasks)} tarefas no ClickUp ({task_ids})"
        else:
            status_vinculo = "pendente"
            if not motivo_pendencia:
                motivo_pendencia = "Agendor Deal ID não encontrado na lista de Negócios do ClickUp"

        # Regra 3: Validação estrita de duplicidade
        possivel_duplicata = False
        motivo_duplicata = ""

        fab_sugerido = str(c.get('fabricante_sugerido', '')).strip().upper()
        conf_fab = c.get('confianca_fabricante', '')
        num_sugerido = str(c.get('numero_ro_sugerido', '')).strip().upper()
        conf_num = c.get('confianca_numero', '')

        if negocio_id and num_sugerido and fab_sugerido != 'DESCONHECIDO' and conf_fab == 'alta' and conf_num == 'alta':
            chave_oportunidade_ro = (negocio_id, fab_sugerido, num_sugerido)

            # Duplicata no mesmo negócio entre diferentes colunas
            dups_mesmo_negocio = [
                o for o in candidatos_por_negocio_fab_num[chave_oportunidade_ro]
                if o['source_id'] != c['source_id']
            ]
            if dups_mesmo_negocio:
                possivel_duplicata = True
                cols = ", ".join(o['coluna_origem'] for o in dups_mesmo_negocio)
                motivo_duplicata = f"Duplicidade confirmada na oportunidade: mesmo fabricante ({fab_sugerido}) e número ({num_sugerido}) repetido nas colunas ({cols})"

            # Conflito com R.O. pré-existente no CRM para a mesma oportunidade (exige os 3 campos)
            if chave_oportunidade_ro in ros_crm_por_negocio_fab_num:
                possivel_duplicata = True
                ro_ids = ", ".join(r.get('id', '') for r in ros_crm_por_negocio_fab_num[chave_oportunidade_ro])
                msg_crm = f"Duplicidade com R.O. pré-existente no CRM para esta oportunidade e fabricante ({fab_sugerido}) (ID: {ro_ids})"
                motivo_duplicata = f"{motivo_duplicata} | {msg_crm}" if motivo_duplicata else msg_crm

        # Se o fabricante de uma R.O existente no CRM não puder ser normalizado, NÃO marcar duplicidade confirmada.
        # Registra apenas uma nota de revisão no motivo, sem bloquear o candidato.
        if not possivel_duplicata and negocio_id and num_sugerido:
            if (negocio_id, num_sugerido) in ros_crm_sem_fab_por_negocio_num:
                ro_sem_fab = ros_crm_sem_fab_por_negocio_num[(negocio_id, num_sugerido)]
                ro_ids = ", ".join(r.get('id', '') for r in ro_sem_fab)
                nota_crm_sem_fab = f"Revisão de possível coincidência: R.O. pré-existente no CRM com mesmo número ({num_sugerido}) para esta oportunidade, porém com fabricante não normalizado ou desconhecido (ID: {ro_ids})"
                if motivo_pendencia:
                    if nota_crm_sem_fab not in motivo_pendencia:
                        motivo_pendencia += f" | {nota_crm_sem_fab}"
                else:
                    motivo_pendencia = nota_crm_sem_fab

        # Se houver número mas fabricante desconhecido, confiança baixa ou negócios diferentes:
        # Registrar como revisão de possível coincidência, NÃO como duplicidade confirmada
        if not possivel_duplicata and num_sugerido:
            outros_com_mesmo_num = [
                o for o in candidatos_por_num[num_sugerido]
                if o['agendor_deal_id'] != deal_id
            ]
            if outros_com_mesmo_num:
                outros_deals_str = ", ".join(sorted(set(o['agendor_deal_id'] for o in outros_com_mesmo_num)))
                nota_coincidencia = f"Revisão de possível coincidência: número ({num_sugerido}) citado em outro(s) negócio(s) Agendor ({outros_deals_str})"
                if motivo_pendencia:
                    motivo_pendencia += f" | {nota_coincidencia}"
                else:
                    motivo_pendencia = nota_coincidencia
            elif conf_fab in ('baixa', 'desconhecida') or conf_num in ('baixa', 'desconhecida'):
                nota_revisao = f"Revisão de possível coincidência: fabricante ({fab_sugerido}) com confiança {conf_fab} ou número ({num_sugerido}) com confiança {conf_num}"
                if motivo_pendencia and nota_revisao not in motivo_pendencia:
                    motivo_pendencia += f" | {nota_revisao}"
                elif not motivo_pendencia:
                    motivo_pendencia = nota_revisao

        reg = {
            'source_id': c['source_id'],
            'agendor_deal_id': deal_id,
            'coluna_origem': c['coluna_origem'],
            'valor_bruto': c['valor_bruto'],
            'fabricante_sugerido': c['fabricante_sugerido'],
            'confianca_fabricante': c['confianca_fabricante'],
            'numero_ro_sugerido': c['numero_ro_sugerido'],
            'confianca_numero': c['confianca_numero'],
            'status_vinculo': status_vinculo,
            'possivel_duplicata': possivel_duplicata,
            'motivo_duplicata': motivo_duplicata,
            'clickup_task_id': clickup_task_id,
            'negocio_id': negocio_id,
            'negocio_nome': negocio_nome,
            'empresa_agendor': c['empresa_agendor'],
            'titulo_agendor': c['titulo_agendor'],
            'status_agendor': c['status_agendor'],
            'etapa_agendor': c['etapa_agendor'],
            'funil_agendor': c.get('funil_agendor', ''),
            'descricao_agendor': c['descricao_agendor'],
            'data_inicio_agendor': c['data_inicio_agendor'],
            'data_conclusao_agendor': c['data_conclusao_agendor'],
            'data_cadastro_agendor': c['data_cadastro_agendor'],
            'validade_confirmada': c.get('validade_confirmada', 'nao_informada'),
            'renovacao_confirmada': c.get('renovacao_confirmada', 'nao_informada'),
            'situacao_operacional_sugerida': c.get('situacao_operacional_sugerida', 'revisao_humana_necessaria'),
            'motivo_pendencia': motivo_pendencia,
        }
        registros_conciliados.append(reg)

    return registros_conciliados


# ---------------------------------------------------------------------------
# 8. Geração de Relatórios de Auditoria
# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    'source_id',
    'agendor_deal_id',
    'coluna_origem',
    'valor_bruto',
    'fabricante_sugerido',
    'confianca_fabricante',
    'numero_ro_sugerido',
    'confianca_numero',
    'status_vinculo',
    'possivel_duplicata',
    'motivo_duplicata',
    'clickup_task_id',
    'negocio_id',
    'negocio_nome',
    'empresa_agendor',
    'titulo_agendor',
    'status_agendor',
    'etapa_agendor',
    'funil_agendor',
    'descricao_agendor',
    'data_inicio_agendor',
    'data_conclusao_agendor',
    'data_cadastro_agendor',
    'validade_confirmada',
    'renovacao_confirmada',
    'situacao_operacional_sugerida',
    'motivo_pendencia',
]

def emitir_relatorios(registros, estatisticas, output_dir=DEFAULT_OUTPUT_DIR):
    """
    Emite os arquivos de auditoria em output_dir:
    - ro_migracao_dry_run.csv: todos os registros candidatos processados
    - ro_migracao_pendentes.csv: apenas registros com pendências ou duplicatas
    - ro_migracao_resumo.json: estatísticas agregadas e metadados
    """
    os.makedirs(output_dir, exist_ok=True)

    caminho_csv_completo = os.path.join(output_dir, 'ro_migracao_dry_run.csv')
    caminho_csv_pendentes = os.path.join(output_dir, 'ro_migracao_pendentes.csv')
    caminho_json_resumo = os.path.join(output_dir, 'ro_migracao_resumo.json')

    # 1. CSV Completo
    with open(caminho_csv_completo, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        writer.writeheader()
        for r in registros:
            writer.writerow(r)
    print(f"[Relatório] CSV completo gerado: {caminho_csv_completo} ({len(registros)} registros)")

    # 2. CSV de Pendências
    pendentes = [
        r for r in registros
        if r['status_vinculo'] == 'pendente'
        or r['possivel_duplicata']
        or r['confianca_fabricante'] == 'desconhecida'
        or r['confianca_numero'] == 'desconhecida'
        or bool(r['motivo_pendencia'])
    ]
    with open(caminho_csv_pendentes, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        writer.writeheader()
        for r in pendentes:
            writer.writerow(r)
    print(f"[Relatório] CSV de pendências gerado: {caminho_csv_pendentes} ({len(pendentes)} registros)")

    # 3. JSON de Resumo
    resumo_final = {
        'data_execucao': datetime.now().isoformat(),
        'modo': 'dry_run',
        'garantia_seguranca': (
            'Execução em modo estrito de simulação (dry-run). '
            'Nenhuma gravação, alteração ou exclusão foi efetuada em banco de dados, ClickUp ou aplicação.'
        ),
        'total_escritas_realizadas': 0,
        **estatisticas,
        'total_registros_pendentes_ou_revisao': len(pendentes),
    }
    with open(caminho_json_resumo, 'w', encoding='utf-8') as f:
        json.dump(resumo_final, f, ensure_ascii=False, indent=2)
    print(f"[Relatório] Resumo executivo JSON gerado: {caminho_json_resumo}")


# ---------------------------------------------------------------------------
# 9. Função de Orquestração da Prévia
# ---------------------------------------------------------------------------

def executar_previa(planilha_path=DEFAULT_PLANILHA_PATH, clickup_cache=None, limit=None, output_dir=DEFAULT_OUTPUT_DIR, env_file=None):
    """
    Executa o pipeline completo de prévia da migração.
    """
    if env_file:
        print(f"[Ambiente] Carregando credenciais do arquivo especificado: {env_file}")
    carregar_env_local(env_file)

    print("=" * 70)
    print("SIMULAÇÃO DE MIGRAÇÃO DO FUNIL DE R.O.s DO AGENDOR (DRY-RUN)")
    print("=" * 70)
    print(f"Ambiente: {identificar_ambiente()}")
    print(f"Versão do script: {SCRIPT_VERSION} (hash: {calcular_hash_script()[:12]}...)")
    print(f"Planilha de origem: {planilha_path}")

    # 1. Carrega dados brutos do Excel
    rows = ler_planilha_xlsx(planilha_path)
    if not rows:
        raise RuntimeError("Planilha vazia ou sem linhas legíveis.")

    headers = rows[0]
    linhas_fonte = rows[1:]
    candidatos_validos, estatisticas_fonte = extrair_candidatos_funil_ro(headers, linhas_fonte)
    if limit:
        candidatos_validos = candidatos_validos[:limit]
        print(f"Limite aplicado: processando as primeiras {limit} R.O.s.")
    print(f"Linhas de R.O. na planilha: {estatisticas_fonte['total_linhas_ro_fonte']}")
    print(f"R.O.s candidatas do funil dedicado: {len(candidatos_validos)}")

    # 4. Carrega mapas externos (ClickUp e Supabase)
    agendor_id_to_tasks, _, info_coleta = carregar_mapa_clickup(cache_path=clickup_cache)
    crm_negocios_map, crm_ros_existentes = carregar_mapa_crm()

    # 5. Conciliação estrita
    registros_conciliados = executar_conciliacao(
        candidatos_validos,
        agendor_id_to_tasks,
        crm_negocios_map,
        crm_ros_existentes
    )

    # 6. Agregação de estatísticas (Regras 4 e 5)
    total_vinculados = sum(1 for r in registros_conciliados if r['status_vinculo'] == 'vinculado')
    total_pendentes_vinculo = sum(1 for r in registros_conciliados if r['status_vinculo'] == 'pendente')
    total_com_duplicata = sum(1 for r in registros_conciliados if r['possivel_duplicata'])

    distribuicao_fabricantes = Counter(r['fabricante_sugerido'] for r in registros_conciliados)
    distribuicao_confianca_fab = Counter(r['confianca_fabricante'] for r in registros_conciliados)
    distribuicao_confianca_num = Counter(r['confianca_numero'] for r in registros_conciliados)

    estatisticas = {
        'planilha_origem': planilha_path,
        'funil_origem_validado': 'Registro de Oportunidades',
        'total_linhas_planilha': len(rows),
        **estatisticas_fonte,
        'total_candidatos_validos_processados': len(registros_conciliados),
        'total_vinculados_a_oportunidade': total_vinculados,
        'total_pendentes_vinculo': total_pendentes_vinculo,
        'total_com_possivel_duplicata': total_com_duplicata,
        'distribuicao_confianca_fabricante': dict(distribuicao_confianca_fab),
        'distribuicao_confianca_numero': dict(distribuicao_confianca_num),
        'distribuicao_fabricantes': dict(distribuicao_fabricantes),
        # Metadados de coleta e ambiente (Regra 5)
        'origem_clickup': info_coleta.get('origem_clickup', 'api'),
        'data_coleta_clickup': info_coleta.get('data_coleta_clickup'),
        'total_tarefas_clickup_lidas': info_coleta.get('total_tarefas_clickup_lidas', 0),
        'paginacao_completa': info_coleta.get('paginacao_completa', True),
        'ambiente_de_execucao': identificar_ambiente(),
        'versao_script': SCRIPT_VERSION,
        'hash_codigo_script': calcular_hash_script(),
    }

    # 7. Emissão dos Relatórios
    emitir_relatorios(registros_conciliados, estatisticas, output_dir=output_dir)

    print("=" * 70)
    print("RESUMO EXECUTIVO DA PRÉVIA:")
    print(f"  • R.O.s na fonte dedicada:               {estatisticas_fonte['total_ros_fonte']}")
    print(f"  • Total de R.O.s processadas:            {len(registros_conciliados)}")
    print(f"  • Vinculados a oportunidades:            {total_vinculados}")
    print(f"  • Pendentes de vínculo:                  {total_pendentes_vinculo}")
    print(f"  • Com possível duplicidade:              {total_com_duplicata}")
    print(f"  • Distribuição por fabricante:           {dict(distribuicao_fabricantes)}")
    print("=" * 70)
    print("Sucesso: simulação concluída sem erros e sem efeitos colaterais.")
    return registros_conciliados, estatisticas


# ---------------------------------------------------------------------------
# 10. Ponto de Entrada CLI (Dry-Run Exclusivo)
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Prévia de migração das R.O.s históricas do Agendor para o CRM Suprimática (Fase 5: Migração Ensaiada)."
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=True,
        help="Executa em modo simulação (padrão). Nenhuma escrita é realizada."
    )
    parser.add_argument(
        '--env-file',
        type=str,
        default=None,
        help="Caminho opcional para arquivo de variáveis de ambiente (ex: /home/ubuntu/apps/supabase/docker/.env)."
    )
    parser.add_argument(
        '--planilha',
        type=str,
        default=DEFAULT_PLANILHA_PATH,
        help=f"Caminho da planilha de exportação do Agendor (.xlsx). Padrão: {DEFAULT_PLANILHA_PATH}"
    )
    parser.add_argument(
        '--clickup-cache',
        type=str,
        default=None,
        help="Caminho para arquivo JSON de tarefas já baixadas do ClickUp (otimização para testes rápidos offline)."
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=None,
        help="Limita o número de negócios a analisar (útil para testes parciais)."
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Diretório para emissão dos relatórios de auditoria. Padrão: {DEFAULT_OUTPUT_DIR}"
    )

    args = parser.parse_args()

    # Rejeição defensiva contra qualquer tentativa de argumento de gravação
    for raw_arg in sys.argv[1:]:
        if raw_arg in ('--live', '--write', '--apply', '--migrate'):
            sys.exit(
                "ERRO BLOQUEANTE: O modo de escrita não está autorizado. "
                "Este script opera exclusivamente em simulação (--dry-run). Nenhuma gravação permitida."
            )

    try:
        executar_previa(
            planilha_path=args.planilha,
            clickup_cache=args.clickup_cache,
            limit=args.limit,
            output_dir=args.output_dir,
            env_file=args.env_file
        )
    except Exception as ex:
        print(f"\n[ERRO FATAL NA PRÉVIA] {ex}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
