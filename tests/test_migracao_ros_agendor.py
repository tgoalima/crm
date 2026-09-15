#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Testes unitários para a prévia de migração das R.O.s históricas do Agendor.
scripts/migracao_ros_agendor.py
"""

import os
import sys
import unittest

# Adiciona a raiz do repositório ao sys.path para import direto
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from scripts.migracao_ros_agendor import (
    normalizar_codigo_agendor,
    normalizar_nome_fabricante,
    classificar_e_extrair_ro,
    gerar_source_id,
    executar_conciliacao,
    carregar_mapa_clickup,
    ler_planilha_xlsx,
    carregar_env_local,
    DEFAULT_PLANILHA_PATH
)


class TestMigracaoRosAgendor(unittest.TestCase):

    def test_normalizar_codigo_agendor(self):
        """Valida normalização robusta de identificadores numéricos do Agendor."""
        # Inteiro puro
        self.assertEqual(normalizar_codigo_agendor(42112468), "42112468")
        # Float do Excel
        self.assertEqual(normalizar_codigo_agendor(42112468.0), "42112468")
        # Notação científica
        self.assertEqual(normalizar_codigo_agendor("4.2112468E7"), "42112468")
        self.assertEqual(normalizar_codigo_agendor("4.2112468e+07"), "42112468")
        # String com espaços
        self.assertEqual(normalizar_codigo_agendor("  42112468  "), "42112468")
        # Nulos e vazios
        self.assertIsNone(normalizar_codigo_agendor(None))
        self.assertIsNone(normalizar_codigo_agendor(""))
        self.assertIsNone(normalizar_codigo_agendor("   "))

    def test_descarte_valores_invalidos(self):
        """Valida que valores vazios, pontuações, apóstrofos e expressões de ausência são descartados."""
        descartaveis = [
            "'",
            "-",
            "—",
            ".",
            "/",
            "SEM RO",
            "sem ro",
            "SEM RO - RENOVAÇÃO",
            "sem ro - renovacao",
            "SEM R.O",
            "N/A",
            "nao",
            "não",
            "VMware Não é Elegivél Essentials",
            "vmware nao e elegivel essentials",
            "",
            "   "
        ]
        for val in descartaveis:
            res = classificar_e_extrair_ro(val)
            self.assertIsNone(res, f"Valor '{val}' deveria ter sido descartado como None, mas retornou: {res}")

    def test_classificacao_dell_alta_confianca(self):
        """Valida extração de padrões Dell com alta confiança."""
        # DELL padrão hífen
        r1 = classificar_e_extrair_ro("DELL - 27387568")
        self.assertEqual(r1['fabricante_sugerido'], "DELL")
        self.assertEqual(r1['confianca_fabricante'], "alta")
        self.assertEqual(r1['numero_ro_sugerido'], "27387568")
        self.assertEqual(r1['confianca_numero'], "alta")

        # DELL sem hífen
        r2 = classificar_e_extrair_ro("DELL 27244304")
        self.assertEqual(r2['fabricante_sugerido'], "DELL")
        self.assertEqual(r2['confianca_fabricante'], "alta")
        self.assertEqual(r2['numero_ro_sugerido'], "27244304")
        self.assertEqual(r2['confianca_numero'], "alta")

        # R.O com DELL no fim
        r3 = classificar_e_extrair_ro("R.O 27176796 DELL")
        self.assertEqual(r3['fabricante_sugerido'], "DELL")
        self.assertEqual(r3['confianca_fabricante'], "alta")
        self.assertEqual(r3['numero_ro_sugerido'], "27176796")
        self.assertEqual(r3['confianca_numero'], "alta")

    def test_classificacao_fortinet_alta_confianca(self):
        """Valida extração de padrões Fortinet com alta confiança."""
        # Fortinet explícito
        r1 = classificar_e_extrair_ro("FORTINET - DR-0525-4655403")
        self.assertEqual(r1['fabricante_sugerido'], "FORTINET")
        self.assertEqual(r1['confianca_fabricante'], "alta")
        self.assertEqual(r1['numero_ro_sugerido'], "DR-0525-4655403")
        self.assertEqual(r1['confianca_numero'], "alta")

        # Fortinet implícito pelo formato DR-xxxx-xxxx
        r2 = classificar_e_extrair_ro("DR-0225-4391925")
        self.assertEqual(r2['fabricante_sugerido'], "FORTINET")
        self.assertEqual(r2['confianca_fabricante'], "alta")
        self.assertEqual(r2['numero_ro_sugerido'], "DR-0225-4391925")
        self.assertEqual(r2['confianca_numero'], "alta")

    def test_classificacao_veeam_alta_confianca(self):
        """Valida extração de padrões Veeam com alta confiança."""
        r1 = classificar_e_extrair_ro("VEEAM - DRG-067623-747836640897-S-VDP5")
        self.assertEqual(r1['fabricante_sugerido'], "VEEAM")
        self.assertEqual(r1['confianca_fabricante'], "alta")
        self.assertEqual(r1['numero_ro_sugerido'], "DRG-067623-747836640897-S-VDP5")
        self.assertEqual(r1['confianca_numero'], "alta")

        # DRG sem palavra VEEAM
        r2 = classificar_e_extrair_ro("DRG-067623-729878394864-S-PF10")
        self.assertEqual(r2['fabricante_sugerido'], "VEEAM")
        self.assertEqual(r2['confianca_fabricante'], "alta")
        self.assertEqual(r2['numero_ro_sugerido'], "DRG-067623-729878394864-S-PF10")
        self.assertEqual(r2['confianca_numero'], "alta")

    def test_classificacao_hpe_broadcom_redhat(self):
        """Valida HPE, Broadcom e Red Hat."""
        # HPE
        r_hpe = classificar_e_extrair_ro("HPE - OPE-0017251720")
        self.assertEqual(r_hpe['fabricante_sugerido'], "HPE")
        self.assertEqual(r_hpe['confianca_fabricante'], "alta")
        self.assertEqual(r_hpe['numero_ro_sugerido'], "OPE-0017251720")
        self.assertEqual(r_hpe['confianca_numero'], "alta")

        # OPE com espaço
        r_hpe2 = classificar_e_extrair_ro("OPE - 0017730408")
        self.assertEqual(r_hpe2['fabricante_sugerido'], "HPE")
        self.assertEqual(r_hpe2['confianca_fabricante'], "alta")
        self.assertEqual(r_hpe2['numero_ro_sugerido'], "OPE-0017730408")

        # Broadcom
        r_b = classificar_e_extrair_ro("Broadcom - 7BQNJ3MSR8")
        self.assertEqual(r_b['fabricante_sugerido'], "BROADCOM")
        self.assertEqual(r_b['confianca_fabricante'], "alta")
        self.assertEqual(r_b['numero_ro_sugerido'], "7BQNJ3MSR8")
        self.assertEqual(r_b['confianca_numero'], "alta")

        # Red Hat
        r_r = classificar_e_extrair_ro("RHEL - 71151663")
        self.assertEqual(r_r['fabricante_sugerido'], "RED HAT")
        self.assertEqual(r_r['confianca_fabricante'], "alta")
        self.assertEqual(r_r['numero_ro_sugerido'], "71151663")
        self.assertEqual(r_r['confianca_numero'], "alta")

    def test_classificacao_casos_ambiguos_e_pendencias(self):
        """Valida que termos como PRIME, STORAGE, RO INTERNO não viram números falsos e marcam confiança desconhecida/baixa."""
        # PRIME isolado
        r_prime = classificar_e_extrair_ro("PRIME")
        self.assertEqual(r_prime['fabricante_sugerido'], "DESCONHECIDO")
        self.assertEqual(r_prime['confianca_fabricante'], "desconhecida")
        self.assertEqual(r_prime['numero_ro_sugerido'], "")
        self.assertEqual(r_prime['confianca_numero'], "desconhecida")
        self.assertTrue(len(r_prime['motivo_pendencia']) > 0)

        # PRIME VEEAM
        r_pv = classificar_e_extrair_ro("PRIME VEEAM")
        self.assertEqual(r_pv['fabricante_sugerido'], "VEEAM")
        self.assertEqual(r_pv['confianca_fabricante'], "alta")
        self.assertEqual(r_pv['numero_ro_sugerido'], "")
        self.assertEqual(r_pv['confianca_numero'], "desconhecida")

        # RO INTERNO FORTINET
        r_ro_int = classificar_e_extrair_ro("RO INTERNO COM DANIELLA TORRESAN (FORTINET)")
        self.assertEqual(r_ro_int['fabricante_sugerido'], "FORTINET")
        self.assertEqual(r_ro_int['confianca_fabricante'], "alta")
        self.assertEqual(r_ro_int['numero_ro_sugerido'], "")
        self.assertEqual(r_ro_int['confianca_numero'], "desconhecida")

        # 8 dígitos com STORAGE
        r_stor = classificar_e_extrair_ro("30076916 - STORAGE")
        self.assertEqual(r_stor['fabricante_sugerido'], "DELL")
        self.assertEqual(r_stor['confianca_fabricante'], "baixa")
        self.assertEqual(r_stor['numero_ro_sugerido'], "30076916")
        self.assertEqual(r_stor['confianca_numero'], "alta")

    def test_source_id_determinismo(self):
        """Gera source_id determinístico baseado em deal_id e coluna."""
        sid1 = gerar_source_id("42112468", "R.O I")
        sid2 = gerar_source_id("42112468", "R.O I")
        sid3 = gerar_source_id("42112468", "R.O  II")
        self.assertEqual(sid1, sid2)
        self.assertEqual(sid1, "agendor:42112468:r_o_i")
        self.assertEqual(sid3, "agendor:42112468:r_o_ii")

    def test_vinculo_estrito_e_rejeicao_por_nome(self):
        """
        Valida que o vínculo com a oportunidade é estrito ao Agendor Deal ID e exige presença em public.negocios.
        Semelhança ou identidade de nome NÃO gera vínculo se o ID não bater.
        """
        agendor_map = {
            "42112468": [{'id': 'task_101', 'name': 'Empresa Alpha - Negócio Firewall'}]
        }
        crm_negocios_map = {
            'task_101': {'id': 'neg_uuid_101', 'nome': 'Empresa Alpha - Negócio Firewall'}
        }

        candidatos = [
            # Caso 1: ID coincide perfeitamente e existe no CRM
            {
                'source_id': 'agendor:42112468:ro_1',
                'agendor_deal_id': '42112468',
                'coluna_origem': 'R.O I',
                'valor_bruto': 'DELL - 27387568',
                'fabricante_sugerido': 'DELL',
                'confianca_fabricante': 'alta',
                'numero_ro_sugerido': '27387568',
                'confianca_numero': 'alta',
                'empresa_agendor': 'Empresa Alpha',
                'titulo_agendor': 'Empresa Alpha - Negócio Firewall',
                'status_agendor': 'Ganho',
                'etapa_agendor': 'Fechamento',
                'descricao_agendor': 'Desc',
                'data_inicio_agendor': '2024-01-01',
                'data_conclusao_agendor': '2024-02-01',
                'data_cadastro_agendor': '2024-01-01',
                'motivo_pendencia': ''
            },
            # Caso 2: ID diferente, embora o título do negócio seja idêntico ao da task do ClickUp
            {
                'source_id': 'agendor:99999999:ro_1',
                'agendor_deal_id': '99999999',
                'coluna_origem': 'R.O I',
                'valor_bruto': 'DELL - 29680447',
                'fabricante_sugerido': 'DELL',
                'confianca_fabricante': 'alta',
                'numero_ro_sugerido': '29680447',
                'confianca_numero': 'alta',
                'empresa_agendor': 'Empresa Alpha',
                'titulo_agendor': 'Empresa Alpha - Negócio Firewall',  # Mesmo nome!
                'status_agendor': 'Ganho',
                'etapa_agendor': 'Fechamento',
                'descricao_agendor': 'Desc',
                'data_inicio_agendor': '2024-01-01',
                'data_conclusao_agendor': '2024-02-01',
                'data_cadastro_agendor': '2024-01-01',
                'motivo_pendencia': ''
            }
        ]

        resultado = executar_conciliacao(candidatos, agendor_map, crm_negocios_map, [])
        self.assertEqual(len(resultado), 2)

        # Caso 1 deve estar vinculado
        self.assertEqual(resultado[0]['status_vinculo'], "vinculado")
        self.assertEqual(resultado[0]['clickup_task_id'], "task_101")
        self.assertEqual(resultado[0]['negocio_id'], "neg_uuid_101")

        # Caso 2 DEVE estar pendente, rejeitando o match por nome
        self.assertEqual(resultado[1]['status_vinculo'], "pendente")
        self.assertEqual(resultado[1]['clickup_task_id'], "")
        self.assertEqual(resultado[1]['negocio_id'], "")
        self.assertIn("não encontrado", resultado[1]['motivo_pendencia'])

    def test_regra_vinculo_exige_presenca_em_public_negocios(self):
        """
        Regra 2: se a tarefa existir no ClickUp mas não estiver em public.negocios,
        status_vinculo DEVE ser 'pendente' e motivo_pendencia específico.
        """
        agendor_map = {
            "5555": [{'id': 'task_555', 'name': 'Negócio sem registro no CRM'}]
        }
        # CRM não tem a tarefa 'task_555' mapeada em public.negocios
        crm_negocios_vazio = {}

        candidato = {
            'source_id': 'agendor:5555:ro_1',
            'agendor_deal_id': '5555',
            'coluna_origem': 'R.O I',
            'valor_bruto': 'DELL - 28096884',
            'fabricante_sugerido': 'DELL',
            'confianca_fabricante': 'alta',
            'numero_ro_sugerido': '28096884',
            'confianca_numero': 'alta',
            'empresa_agendor': 'Empresa Beta',
            'titulo_agendor': 'Beta Infra',
            'status_agendor': 'Ganho',
            'etapa_agendor': 'Fechamento',
            'descricao_agendor': '',
            'data_inicio_agendor': '',
            'data_conclusao_agendor': '',
            'data_cadastro_agendor': '',
            'motivo_pendencia': ''
        }

        resultado = executar_conciliacao([candidato], agendor_map, crm_negocios_vazio, [])
        self.assertEqual(resultado[0]['status_vinculo'], "pendente")
        self.assertEqual(
            resultado[0]['motivo_pendencia'],
            "Tarefa ClickUp encontrada, mas oportunidade não localizada em public.negocios"
        )
        self.assertEqual(resultado[0]['negocio_id'], "")

    def test_regra_duplicidade_estrita_mesmo_negocio_e_fabricante(self):
        """
        Regra 3: duplicidade confirmada só quando houver compatibilidade de:
        - negocio_id;
        - fabricante normalizado (confiança alta);
        - numero_ro normalizado (confiança alta).
        """
        agendor_map = {
            "1111": [{'id': 'task_111', 'name': 'Oportunidade 1'}]
        }
        crm_negocios_map = {
            'task_111': {'id': 'neg_uuid_111', 'nome': 'Oportunidade 1'}
        }

        # Mesmo negócio (1111 -> neg_uuid_111), mesmo fabricante (DELL, alta) e mesmo número (27387568, alta)
        candidatos = [
            {
                'source_id': 'agendor:1111:ro_1',
                'agendor_deal_id': '1111',
                'coluna_origem': 'R.O I',
                'valor_bruto': 'DELL - 27387568',
                'fabricante_sugerido': 'DELL',
                'confianca_fabricante': 'alta',
                'numero_ro_sugerido': '27387568',
                'confianca_numero': 'alta',
                'empresa_agendor': 'Empresa 1',
                'titulo_agendor': 'Op 1',
                'status_agendor': 'Ganho',
                'etapa_agendor': 'Fechamento',
                'descricao_agendor': '',
                'data_inicio_agendor': '',
                'data_conclusao_agendor': '',
                'data_cadastro_agendor': '',
                'motivo_pendencia': ''
            },
            {
                'source_id': 'agendor:1111:ro_2',
                'agendor_deal_id': '1111',
                'coluna_origem': 'R.O  II',
                'valor_bruto': 'DELL 27387568',
                'fabricante_sugerido': 'DELL',
                'confianca_fabricante': 'alta',
                'numero_ro_sugerido': '27387568',
                'confianca_numero': 'alta',
                'empresa_agendor': 'Empresa 1',
                'titulo_agendor': 'Op 1',
                'status_agendor': 'Ganho',
                'etapa_agendor': 'Fechamento',
                'descricao_agendor': '',
                'data_inicio_agendor': '',
                'data_conclusao_agendor': '',
                'data_cadastro_agendor': '',
                'motivo_pendencia': ''
            }
        ]

        resultado = executar_conciliacao(candidatos, agendor_map, crm_negocios_map, [])
        # Ambos vinculados à oportunidade
        self.assertEqual(resultado[0]['status_vinculo'], "vinculado")
        self.assertEqual(resultado[1]['status_vinculo'], "vinculado")
        # Duplicidade confirmada
        self.assertTrue(resultado[0]['possivel_duplicata'])
        self.assertTrue(resultado[1]['possivel_duplicata'])
        self.assertIn("Duplicidade confirmada na oportunidade", resultado[0]['motivo_duplicata'])

    def test_regra_duplicidade_negocios_distintos_e_revisao_coincidencia(self):
        """
        Regra 3: quando o mesmo número ocorre em oportunidades distintas,
        NÃO é duplicidade confirmada (possivel_duplicata = False),
        e sim 'Revisão de possível coincidência'.
        """
        agendor_map = {
            "1111": [{'id': 'task_111', 'name': 'Oportunidade 1'}],
            "2222": [{'id': 'task_222', 'name': 'Oportunidade 2'}]
        }
        crm_negocios_map = {
            'task_111': {'id': 'neg_uuid_111', 'nome': 'Oportunidade 1'},
            'task_222': {'id': 'neg_uuid_222', 'nome': 'Oportunidade 2'}
        }

        # Oportunidades distintas com o mesmo número
        candidatos = [
            {
                'source_id': 'agendor:1111:ro_1',
                'agendor_deal_id': '1111',
                'coluna_origem': 'R.O I',
                'valor_bruto': 'DELL - 27387568',
                'fabricante_sugerido': 'DELL',
                'confianca_fabricante': 'alta',
                'numero_ro_sugerido': '27387568',
                'confianca_numero': 'alta',
                'empresa_agendor': 'Empresa 1',
                'titulo_agendor': 'Op 1',
                'status_agendor': 'Ganho',
                'etapa_agendor': 'Fechamento',
                'descricao_agendor': '',
                'data_inicio_agendor': '',
                'data_conclusao_agendor': '',
                'data_cadastro_agendor': '',
                'motivo_pendencia': ''
            },
            {
                'source_id': 'agendor:2222:ro_1',
                'agendor_deal_id': '2222',
                'coluna_origem': 'R.O I',
                'valor_bruto': 'DELL - 27387568',
                'fabricante_sugerido': 'DELL',
                'confianca_fabricante': 'alta',
                'numero_ro_sugerido': '27387568',
                'confianca_numero': 'alta',
                'empresa_agendor': 'Empresa 2',
                'titulo_agendor': 'Op 2',
                'status_agendor': 'Ganho',
                'etapa_agendor': 'Fechamento',
                'descricao_agendor': '',
                'data_inicio_agendor': '',
                'data_conclusao_agendor': '',
                'data_cadastro_agendor': '',
                'motivo_pendencia': ''
            }
        ]

        resultado = executar_conciliacao(candidatos, agendor_map, crm_negocios_map, [])
        # Vínculos preservados
        self.assertEqual(resultado[0]['status_vinculo'], "vinculado")
        self.assertEqual(resultado[1]['status_vinculo'], "vinculado")
        # NÃO é duplicidade confirmada da oportunidade
        self.assertFalse(resultado[0]['possivel_duplicata'])
        self.assertFalse(resultado[1]['possivel_duplicata'])
        # Registrado como revisão de possível coincidência
        self.assertIn("Revisão de possível coincidência", resultado[0]['motivo_pendencia'])
        self.assertIn("Revisão de possível coincidência", resultado[1]['motivo_pendencia'])

    def test_normalizar_nome_fabricante(self):
        """Valida normalização canônica de nomes de fabricantes do CRM."""
        self.assertEqual(normalizar_nome_fabricante("Dell Computadores do Brasil"), "DELL")
        self.assertEqual(normalizar_nome_fabricante("DELL"), "DELL")
        self.assertEqual(normalizar_nome_fabricante("Fortinet Technologies"), "FORTINET")
        self.assertEqual(normalizar_nome_fabricante("Fortigate"), "FORTINET")
        self.assertEqual(normalizar_nome_fabricante("Veeam Software"), "VEEAM")
        self.assertEqual(normalizar_nome_fabricante("Hewlett Packard Enterprise"), "HPE")
        self.assertEqual(normalizar_nome_fabricante("HPE"), "HPE")
        self.assertEqual(normalizar_nome_fabricante("Aruba Networks"), "HPE")
        self.assertEqual(normalizar_nome_fabricante("Broadcom Inc."), "BROADCOM")
        self.assertEqual(normalizar_nome_fabricante("VMware by Broadcom"), "BROADCOM")
        self.assertEqual(normalizar_nome_fabricante("Red Hat"), "RED HAT")
        self.assertEqual(normalizar_nome_fabricante("RHEL"), "RED HAT")
        # Desconhecidos e nulos retornam None
        self.assertIsNone(normalizar_nome_fabricante("Fabricante X Desconhecido"))
        self.assertIsNone(normalizar_nome_fabricante("DESCONHECIDO"))
        self.assertIsNone(normalizar_nome_fabricante(""))
        self.assertIsNone(normalizar_nome_fabricante(None))

    def test_duplicidade_crm_mesma_oportunidade_mesmo_fabricante_mesmo_numero(self):
        """
        Regra Estrita de Duplicidade CRM (Item 8.1):
        Mesma oportunidade + mesmo fabricante normalizado + mesmo número existente no CRM => duplicidade true.
        """
        agendor_map = {
            "1111": [{'id': 'task_111', 'name': 'Oportunidade 1'}]
        }
        crm_negocios_map = {
            'task_111': {'id': 'neg_uuid_111', 'nome': 'Oportunidade 1'}
        }
        crm_ros = [
            {
                'id': 'ro_crm_uuid_88',
                'negocio_id': 'neg_uuid_111',
                'fabricante_normalizado': 'DELL',
                'numero_ro': '27387568',
                'situacao': 'aprovada'
            }
        ]

        candidato = {
            'source_id': 'agendor:1111:ro_1',
            'agendor_deal_id': '1111',
            'coluna_origem': 'R.O I',
            'valor_bruto': 'DELL - 27387568',
            'fabricante_sugerido': 'DELL',
            'confianca_fabricante': 'alta',
            'numero_ro_sugerido': '27387568',
            'confianca_numero': 'alta',
            'empresa_agendor': 'Empresa 1',
            'titulo_agendor': 'Op 1',
            'status_agendor': 'Ganho',
            'etapa_agendor': 'Fechamento',
            'descricao_agendor': '',
            'data_inicio_agendor': '',
            'data_conclusao_agendor': '',
            'data_cadastro_agendor': '',
            'motivo_pendencia': ''
        }

        resultado = executar_conciliacao([candidato], agendor_map, crm_negocios_map, crm_ros)
        self.assertEqual(resultado[0]['status_vinculo'], "vinculado")
        self.assertTrue(resultado[0]['possivel_duplicata'])
        self.assertIn("ro_crm_uuid_88", resultado[0]['motivo_duplicata'])
        self.assertIn("DELL", resultado[0]['motivo_duplicata'])

    def test_duplicidade_crm_mesma_oportunidade_fabricante_diferente_mesmo_numero(self):
        """
        Regra Estrita de Duplicidade CRM (Item 8.2):
        Mesma oportunidade + fabricante DIFERENTE + mesmo número => duplicidade false.
        """
        agendor_map = {
            "1111": [{'id': 'task_111', 'name': 'Oportunidade 1'}]
        }
        crm_negocios_map = {
            'task_111': {'id': 'neg_uuid_111', 'nome': 'Oportunidade 1'}
        }
        crm_ros = [
            {
                'id': 'ro_crm_uuid_99',
                'negocio_id': 'neg_uuid_111',
                'fabricante_normalizado': 'HPE',  # Fabricante diferente do candidato (DELL)
                'numero_ro': '27387568',
                'situacao': 'aprovada'
            }
        ]

        candidato = {
            'source_id': 'agendor:1111:ro_1',
            'agendor_deal_id': '1111',
            'coluna_origem': 'R.O I',
            'valor_bruto': 'DELL - 27387568',
            'fabricante_sugerido': 'DELL',
            'confianca_fabricante': 'alta',
            'numero_ro_sugerido': '27387568',
            'confianca_numero': 'alta',
            'empresa_agendor': 'Empresa 1',
            'titulo_agendor': 'Op 1',
            'status_agendor': 'Ganho',
            'etapa_agendor': 'Fechamento',
            'descricao_agendor': '',
            'data_inicio_agendor': '',
            'data_conclusao_agendor': '',
            'data_cadastro_agendor': '',
            'motivo_pendencia': ''
        }

        resultado = executar_conciliacao([candidato], agendor_map, crm_negocios_map, crm_ros)
        self.assertEqual(resultado[0]['status_vinculo'], "vinculado")
        self.assertFalse(resultado[0]['possivel_duplicata'])
        self.assertEqual(resultado[0]['motivo_duplicata'], "")

    def test_duplicidade_crm_fabricante_desconhecido_mesmo_numero(self):
        """
        Regra Estrita de Duplicidade CRM (Item 8.3):
        Fabricante CRM desconhecido / não-normalizado + mesmo número => duplicidade false e nota para revisão.
        """
        agendor_map = {
            "1111": [{'id': 'task_111', 'name': 'Oportunidade 1'}]
        }
        crm_negocios_map = {
            'task_111': {'id': 'neg_uuid_111', 'nome': 'Oportunidade 1'}
        }
        crm_ros = [
            {
                'id': 'ro_crm_uuid_sem_fab',
                'negocio_id': 'neg_uuid_111',
                'fabricante_normalizado': None,  # Fabricante não normalizado / desconhecido
                'numero_ro': '27387568',
                'situacao': 'em_aprovacao'
            }
        ]

        candidato = {
            'source_id': 'agendor:1111:ro_1',
            'agendor_deal_id': '1111',
            'coluna_origem': 'R.O I',
            'valor_bruto': 'DELL - 27387568',
            'fabricante_sugerido': 'DELL',
            'confianca_fabricante': 'alta',
            'numero_ro_sugerido': '27387568',
            'confianca_numero': 'alta',
            'empresa_agendor': 'Empresa 1',
            'titulo_agendor': 'Op 1',
            'status_agendor': 'Ganho',
            'etapa_agendor': 'Fechamento',
            'descricao_agendor': '',
            'data_inicio_agendor': '',
            'data_conclusao_agendor': '',
            'data_cadastro_agendor': '',
            'motivo_pendencia': ''
        }

        resultado = executar_conciliacao([candidato], agendor_map, crm_negocios_map, crm_ros)
        self.assertEqual(resultado[0]['status_vinculo'], "vinculado")
        self.assertFalse(resultado[0]['possivel_duplicata'])
        self.assertEqual(resultado[0]['motivo_duplicata'], "")
        # Registra apenas nota para revisão humana no motivo_pendencia
        self.assertIn("Revisão de possível coincidência", resultado[0]['motivo_pendencia'])
        self.assertIn("ro_crm_uuid_sem_fab", resultado[0]['motivo_pendencia'])
        self.assertIn("fabricante não normalizado ou desconhecido", resultado[0]['motivo_pendencia'])

    def test_leitor_xlsx_nativo(self):
        """Valida a leitura do arquivo real XLSX via biblioteca padrão do Python."""
        if os.path.exists(DEFAULT_PLANILHA_PATH):
            rows = ler_planilha_xlsx(DEFAULT_PLANILHA_PATH)
            self.assertEqual(len(rows), 690)
            self.assertEqual(len(rows[0]), 38)
            self.assertEqual(rows[0][0], "Código do Negócio")


if __name__ == '__main__':
    unittest.main()
