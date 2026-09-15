# Plano de Execução — Prévia de Migração das R.O.s Históricas do Agendor (Fase 5: Migração Ensaiada)

> **Status:** Revisado conforme diretrizes e aguardando implementação  
> **Data:** 14/09/2026  
> **Modo de Operação:** Somente Prévia (`--dry-run` exclusivo) — Leitura e emissão de relatórios; sem gravações no banco de dados, sem alterações ou criações de tarefas no ClickUp, sem deploys ou migrations.

---

## 1. Objetivo e Escopo

Implementar o mecanismo da **Fase 5 (Migração ensaiada)** para o módulo de Registro de Oportunidades (R.O.) do CRM Suprimática.  
O objetivo é processar a exportação histórica do Agendor, higienizar dados legados, conciliar determinística e estritamente com as oportunidades operacionais atuais (tarefas do ClickUp e tabela `public.negocios` do Supabase) e gerar relatórios completos de auditoria e pendências.

### Regras Mandatórias de Integridade e Operação:
1. **Zero Efeito Colateral e Somente Dry-Run:** O script aceita unicamente o modo de simulação (`--dry-run`). Não haverá flag `--live`, nem escrita no banco Supabase, nem criação de R.O.s, nem criação/alteração de tarefas no ClickUp, nem migrações de banco, nem deploys.
2. **Natureza Histórica dos Registros (Não são "R.O.s Ativas"):** Os 73 negócios identificados no Agendor são registros históricos em status `Ganho` (fechamento comercial). O relatório preserva fielmente o status, etapa e datas originais do Agendor, mas **não infere** situação atual, vigência, aprovação ou renovação. Campos explícitos de ausência registrarão que essas propriedades não estão confirmadas.
3. **Independência entre Vínculo e Duplicidade:** Uma eventual duplicidade de número ou ocorrência **não anula** o vínculo da oportunidade. O modelo de dados separa:
   - `status_vinculo`: `vinculado` | `pendente`
   - `possivel_duplicata`: `true` | `false`
   - `motivo_duplicata`: texto descritivo do conflito detectado (ou vazio se `false`).
   *Regra Estrita de Duplicidade:* A duplicidade confirmada (`possivel_duplicata = true`) exige **na mesma oportunidade** a compatibilidade de: `negocio_id` + fabricante normalizado (confiança alta) + número de R.O. normalizado (confiança alta). A repetição de número em outro negócio é tratada estritamente como **revisão de possível coincidência**, nunca como duplicidade confirmada.
4. **Tratamento Não-Confirmado de Fabricante e Número:** Nem fabricante nem número de R.O. são dados como certos automaticamente. O relatório registrará:
   - `fabricante_sugerido`
   - `confianca_fabricante`: `alta` | `baixa` | `desconhecida`
   - `numero_ro_sugerido`
   - `confianca_numero`: `alta` | `baixa` | `desconhecida`
   - `valor_bruto` (conteúdo original inalterado)
   - Termos como `PRIME`, `STORAGE`, `RO INTERNO` ou anotações informativas sem padrão ficam classificados com confiança `desconhecida` / `baixa` e pendência sinalizada, nunca sendo inventados ou forçados.
5. **Relacionamento Estrito:** A vinculação depende unicamente do campo customizado `Agendor Deal ID` (`94d84531-94e7-4f7c-b982-0ab8d9d87b2d`) no ClickUp. É **estritamente proibido** associar por similaridade ou aproximação de nome. Casos não encontrados ou com ID ambíguo tornam-se `status_vinculo = pendente`.
6. **Conciliação Somente-Leitura com o CRM:** Verificação de duplicidade contra as tabelas `negocios`, `fabricantes_ro` e `registros_oportunidade` do Supabase via consultas GET exclusivamente somente-leitura. O confronto com R.O.s existentes no CRM é indexado estritamente por `(negocio_id, fabricante_normalizado, numero_ro_normalizado)`. Só gera duplicidade confirmada se os três campos coincidirem. Caso o fabricante de uma R.O existente não possa ser normalizado, registra-se apenas uma nota de revisão no motivo, sem bloquear o candidato nem marcar duplicidade confirmada. **Sem qualquer gravação, inserção ou alteração de dados no CRM.**
7. **Independência de Ambiente (Zero Dependências Externas para XLSX):** A leitura da planilha `.xlsx` será implementada utilizando exclusivamente a biblioteca padrão do Python (`zipfile` e `xml.etree.ElementTree`), garantindo 100% de reproducibilidade tanto no macOS quanto no ambiente Linux VPS, eliminando necessidade de `venv` ou `PYTHONPATH`.
8. **Robustez e Falha Explícita na Coleta ClickUp:**
   - Paginação exaustiva até a última página da lista `901326185457` (`include_closed=true`).
   - Throttle de requisições e tratamento de rate limit HTTP 429 com retentativas e espera controlada.
   - Falha imediata e explícita em erros HTTP 401 (Unauthorized), falhas de rede não recuperáveis, timeouts ou respostas JSON malformadas.
   - Caso a coleta não termine com sucesso, o script **falha com erro (`sys.exit(1)`) e aborta**, **nunca gerando um relatório falso com mapa vazio**.
   - Suporte opcional à flag `--clickup-cache <arquivo.json>` para reutilizar uma coleta íntegra e permitir testes determinísticos e rápidos sem estressar a API externa.
9. **Não Versionamento de Relatórios de Auditoria:** O diretório `reports/` é de uso estritamente local para auditoria e será adicionado ao `.gitignore` para não poluir o repositório Git.

---

## 2. Diagnóstico da Fonte de Dados (Exportação Agendor)

Arquivo de origem: `_arquivo_historico/planilhas_agendor/606404-negocios-2026-08-07-21-57-34.xlsx`

- **Total de linhas na planilha:** 690 (linhas duplicadas para negócios com múltiplos itens/produtos).
- **Negócios únicos identificados:** 438.
- **Negócios com preenchimento em colunas de R.O.:** 73 negócios (todos com status `Ganho`).
- **Colunas analisadas:**
  - `Código do Negócio` (Coluna 1)
  - `Empresa relacionada` (Coluna 3)
  - `Título do negócio` (Coluna 4)
  - `Data de início` (Coluna 6)
  - `Data de conclusão` (Coluna 7)
  - `Data de cadastro` (Coluna 8)
  - `Status` (Coluna 12)
  - `Etapa` (Coluna 14)
  - `Descrição` (Coluna 16)
  - `R.O I` (Coluna 23)
  - `R.O  II` (Coluna 26, com dois espaços)
  - `R.O III` (Coluna 27)
  - `R.O IV` (Coluna 28)

### Categorização dos Textos Brutos de R.O.:
1. **Inválidos / Descarte de R.O.:**
   - Apóstrofo isolado: `"'"`
   - Textos de ausência explícita: `"SEM RO"`, `"sem ro"`, `"SEM RO - RENOVAÇÃO"`, `"SEM R.O"`, `"N/A"`
   - Notas de inelegibilidade: `"VMware Não é Elegivél Essentials"`
2. **Textos com Padrão de Fabricante Conhecido:**
   - **Dell:** `DELL - 27387568`, `DELL 27244304`, `R.O 27176796 DELL`, `DELL -  29315878` -> Fabricante `DELL` (`confianca_fabricante: alta`), Número extraído (`confianca_numero: alta`).
   - **Fortinet:** `FORTINET - DR-0525-4655403`, `DR-0225-4391925`, `Fortinet DR-0324-3716266`, `DR-0624-3886115` -> Fabricante `FORTINET` (`confianca_fabricante: alta`), Número `DR-...` (`confianca_numero: alta`).
   - **Veeam:** `VEEAM - DRG-067623-747836640897-S-VDP5`, `DRG-067623-729878394864-S-PF10` -> Fabricante `VEEAM` (`confianca_fabricante: alta`), Número `DRG-...` (`confianca_numero: alta`).
   - **HPE:** `HPE - OPE-0017251720`, `OPE-0018038723`, `OPE - 0017730408` -> Fabricante `HPE` (`confianca_fabricante: alta`), Número `OPE-...` (`confianca_numero: alta`).
   - **Broadcom / VMware:** `Broadcom - 7BQNJ3MSR8` -> Fabricante `BROADCOM` (`confianca_fabricante: alta`), Número `7BQNJ3MSR8` (`confianca_numero: alta`).
   - **Red Hat:** `RHEL - 71151663` -> Fabricante `RED HAT` (`confianca_fabricante: alta`), Número `71151663` (`confianca_numero: alta`).
3. **Casos Ambíguos / Não-Padronizados (Confiança Baixa/Desconhecida):**
   - `30076916 - STORAGE`: Fabricante `DELL` sugerido por padrão de 8 dígitos (`confianca_fabricante: baixa`), Número `30076916` (`confianca_numero: alta`).
   - `RO INTERNO COM DANIELLA TORRESAN (FORTINET)`: Fabricante `FORTINET` (`confianca_fabricante: alta`), Número `desconhecido` (`confianca_numero: desconhecida`), pendência sinalizada.
   - `PRIME`, `PRIME (RENOVAÇÃO)`: Fabricante `desconhecido` (`confianca_fabricante: desconhecida`), Número `PRIME` / `desconhecido` (`confianca_numero: baixa`), pendência para triagem humana.
   - `PRIME VEEAM`: Fabricante `VEEAM` (`confianca_fabricante: alta`), Número `PRIME` / `desconhecido` (`confianca_numero: baixa`), pendência para triagem humana.
   - `R.O 27164676`: Fabricante `desconhecido` (`confianca_fabricante: baixa`), Número `27164676` (`confianca_numero: alta`).

---

## 3. Especificação do Script: `scripts/migracao_ros_agendor.py`

### 3.1 Interface de Linha de Comando (CLI):
```bash
python3 scripts/migracao_ros_agendor.py [--dry-run] [--planilha CAMINHO] [--clickup-cache ARQUIVO] [--limit N] [--output-dir CAMINHO]
```
- A ausência ou presença de `--dry-run` mantém a execução **sempre em modo simulação**.
- Se qualquer argumento tentar indicar escrita (ex: `--live`), o script rejeita e encerra com erro.

### 3.2 Módulos Funcionais:

1. **Leitor XLSX Nativo (`ler_planilha_xlsx`):**
   - Lê `xl/sharedStrings.xml` e `xl/worksheets/sheet1.xml` com `zipfile` e `xml.etree.ElementTree`.
   - Converte coordenadas de células (ex: `A1`, `AL690`) em matriz uniforme de strings.
   - 100% biblioteca padrão, livre de dependências externas.

2. **Normalizador de Identificador Agendor (`normalizar_codigo_agendor`):**
   - Trata floats (`42112468.0`), notação científica (`4.2112468E7`), inteiros e strings com espaços.
   - Retorna string puramente numérica limpa (`"42112468"`).

3. **Classificador Heurístico de R.O. (`classificar_e_extrair_ro`):**
   - Detecta e filtra descartáveis (`"'"` apóstrofo, `"SEM RO"`, etc.).
   - Extrai sugestões com níveis de confiança explícitos (`alta`, `baixa`, `desconhecida`).
   - Preserva o valor bruto integral.

4. **Coletor e Validador ClickUp (`carregar_mapa_clickup`):**
   - Lê tarefas da lista `901326185457` paginando via GET `https://api.clickup.com/api/v2/list/901326185457/task?include_closed=true&page={p}`.
   - Extrai o valor do custom field `Agendor Deal ID` (`94d84531-94e7-4f7c-b982-0ab8d9d87b2d`) e normaliza com `normalizar_codigo_agendor`.
   - Indexa `agendor_id -> [lista de tasks]`. Se um agendor_id tiver múltiplas tarefas, sinaliza ambiguidade.
   - Lança exceção e encerra se encontrar HTTP 401, falha de rede ou interrupção prematura.
   - Nunca emite relatório com mapa ClickUp vazio por falha de comunicação.

5. **Consultor Somente-Leitura CRM (`carregar_mapa_crm`):**
   - Lê `negocios` no Supabase (`id, clickup_negocio_id, nome, conta_id`).
   - Lê `fabricantes_ro` no Supabase (`id, nome`) para normalização canônica dos fabricantes do CRM (DELL, FORTINET, VEEAM, HPE, BROADCOM, RED HAT, etc.).
   - Lê `registros_oportunidade` no Supabase (`id, negocio_id, fabricante_id, numero_ro, situacao`), associando o fabricante normalizado para indexação estrita de duplicidades.

6. **Motor de Conciliação e Detecção de Duplicidade (`executar_conciliacao`):**
   - Define `status_vinculo`: `vinculado` (se houver exatamente 1 tarefa ClickUp para o Agendor Deal ID e essa tarefa estiver presente em `public.negocios`) ou `pendente` (se ausente no ClickUp, ambíguo ou se a tarefa não for localizada no CRM).
   - Define `possivel_duplicata`: `true` SOMENTE quando houver compatibilidade de `negocio_id` + fabricante normalizado (confiança alta) + número de R.O. normalizado (confiança alta) na mesma oportunidade (seja entre colunas do Agendor ou contra R.O. já cadastrada no CRM).
   - Repetição de número em outro negócio Agendor ou com fabricante desconhecido/baixa confiança: registrado como **revisão de possível coincidência** no `motivo_pendencia`, mantendo `possivel_duplicata: false` (repetição de número em outro negócio nunca é duplicidade confirmada).
   - Se o fabricante de uma R.O existente no CRM não puder ser normalizado, registra apenas uma nota de revisão no motivo, sem marcar duplicidade confirmada nem bloquear o candidato.
   - Define `motivo_duplicata`: detalhamento descritivo do conflito quando confirmado.

7. **Gerador de Relatórios em `reports/`:**
   - Emite CSVs e JSON estruturado.

---

## 4. Estrutura dos Relatórios Gerados

### 4.1 `reports/ro_migracao_dry_run.csv`
Colunas obrigatórias:
1. `source_id`: Identificador determinístico (ex: `agendor:42112468:ro_1`)
2. `agendor_deal_id`: Código do negócio original
3. `coluna_origem`: Coluna original (`R.O I`, `R.O  II`, etc.)
4. `valor_bruto`: Texto bruto original
5. `fabricante_sugerido`: Fabricante extraído ou `"DESCONHECIDO"`
6. `confianca_fabricante`: `alta` | `baixa` | `desconhecida`
7. `numero_ro_sugerido`: Número extraído ou vazio
8. `confianca_numero`: `alta` | `baixa` | `desconhecida`
9. `status_vinculo`: `vinculado` | `pendente`
10. `possivel_duplicata`: `true` | `false`
11. `motivo_duplicata`: Detalhe da duplicidade quando houver
12. `clickup_task_id`: ID da tarefa ClickUp encontrada
13. `negocio_id`: UUID da oportunidade no Supabase (se existente)
14. `negocio_nome`: Nome do negócio no CRM
15. `empresa_agendor`: Empresa relacionada original
16. `titulo_agendor`: Título do negócio original
17. `status_agendor`: Status original (`Ganho`)
18. `etapa_agendor`: Etapa original do funil
19. `descricao_agendor`: Descrição original
20. `data_inicio_agendor`: Data de início original
21. `data_conclusao_agendor`: Data de conclusão original
22. `data_cadastro_agendor`: Data de cadastro original
23. `validade_confirmada`: `"nao_informada"` (campo explícito de ausência)
24. `renovacao_confirmada`: `"nao_informada"` (campo explícito de ausência)
25. `situacao_operacional_sugerida`: `"historico_sem_situacao_confirmada"` (campo explícito de ausência)
26. `motivo_pendencia`: Descrição da pendência quando houver

### 4.2 `reports/ro_migracao_pendentes.csv`
Contém exclusivamente os registros onde `status_vinculo == 'pendente'`, `possivel_duplicata == true` ou `confianca_fabricante == 'desconhecida'` / `confianca_numero == 'desconhecida'`, servindo de planilha de trabalho e triagem para os gestores comerciais.

### 4.3 `reports/ro_migracao_resumo.json`
Metadados agregados:
- `data_execucao`
- `modo`: `"dry_run"`
- `planilha_origem`
- `total_linhas_lidas`: 690
- `total_negocios_unicos`: 438
- `total_negocios_com_ro`: 73
- `total_candidatos_ro_extraidos`: contagem total de campos com texto
- `total_candidatos_invalidos_descartados`: apóstrofos, SEM RO, notas
- `total_candidatos_validos_processados`
- `total_vinculados`
- `total_pendentes_vinculo`
- `total_com_possivel_duplicata`
- `distribuicao_confianca_fabricante`: `{ alta: N, baixa: N, desconhecida: N }`
- `distribuicao_confianca_numero`: `{ alta: N, baixa: N, desconhecida: N }`
- `distribuicao_fabricantes`: contagem por fabricante sugerido
- `total_escritas_realizadas`: 0
- `garantia_seguranca`: `"Execução em modo estrito de simulação (dry-run). Nenhuma gravação ou mutação efetuada em banco de dados, ClickUp ou aplicação."`

---

## 5. Suíte de Testes Automatizados (`tests/test_migracao_ros_agendor.py`)

1. **`test_leitor_xlsx_padrao`**: Valida a leitura de arquivos `.xlsx` com `zipfile` e XML padrão sem dependências de terceiros.
2. **`test_normalizar_codigo_agendor`**: Casos de `int`, `float`, notação científica (`4.2112468E7`), string com espaços e nulos.
3. **`test_descarte_valores_invalidos`**: Garantia de que `"'"` (apóstrofo), `"SEM RO"`, `"sem ro"`, `"VMware Não é Elegivél Essentials"` e vazios são descartados.
4. **`test_classificacao_confianca_fabricante_numero`**: Validação das classificações de confiança (`alta`, `baixa`, `desconhecida`) para Dell, Fortinet, Veeam, HPE, Broadcom, Red Hat, Prime e notas internas.
5. **`test_normalizar_nome_fabricante`**: Normalização canônica de fabricantes do CRM (Dell, Fortinet, Veeam, HPE, Broadcom, Red Hat).
6. **`test_duplicidade_crm_mesma_oportunidade_mesmo_fabricante_mesmo_numero`**: Mesma oportunidade + mesmo fabricante normalizado + mesmo número existente no CRM => `possivel_duplicata = true`.
7. **`test_duplicidade_crm_mesma_oportunidade_fabricante_diferente_mesmo_numero`**: Mesma oportunidade + fabricante diferente + mesmo número => `possivel_duplicata = false`.
8. **`test_duplicidade_crm_fabricante_desconhecido_mesmo_numero`**: Fabricante CRM desconhecido / não normalizado + mesmo número => `possivel_duplicata = false` e nota para revisão.
9. **`test_separacao_vinculo_e_duplicidade`**: Assegura que uma duplicidade detectada mantém o `status_vinculo: vinculado`, gravando `possivel_duplicata: true` e o motivo.
10. **`test_vinculo_estrito_e_rejeicao_por_nome`**: Confirma que apenas o `Agendor Deal ID` gera vínculo. Oportunidade com nome idêntico mas ID não mapeado DEVE ficar `pendente`.
11. **`test_falha_explicita_clickup`**: Confirma que erro 401, timeout ou mapa vazio interrompe a execução com erro e não gera relatório falso.
12. **`test_garantia_dry_run_zero_escritas`**: Valida que nenhuma função de mutação é chamada e que o resumo JSON registra `total_escritas_realizadas: 0`.

---

## 6. Procedimento de Validação e Execução

```bash
# 1. Garantir reports/ no .gitignore
git status

# 2. Executar suíte de testes unitários Python
python3 -m unittest discover -s tests -p 'test_*.py'

# 3. Executar suíte JavaScript de regressão
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.mjs

# 4. Executar o script em dry-run
python3 scripts/migracao_ros_agendor.py --dry-run

# 5. Auditar os relatórios gerados
cat reports/ro_migracao_resumo.json
head -n 20 reports/ro_migracao_dry_run.csv
head -n 20 reports/ro_migracao_pendentes.csv
```
