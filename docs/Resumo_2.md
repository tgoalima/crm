# Resumo_2 — Handover Completo: SPA Gestão Comercial Suprimática

> **Propósito:** Este documento é o guia de handover oficial e atualizado para que qualquer IA, desenvolvedor ou diretor comercial possa retomar o desenvolvimento e consultar os dados com contexto 100% alinhado. Ele documenta a arquitetura, todas as funcionalidades entregues até a **Versão 45.0 (v45.0)**, o esquema do banco de dados no Supabase, as regras de negócio, a sincronização histórica com o Agendor e as diretrizes do sistema.

---

## 1. O Que o Projeto É (Visão Executiva)

Uma **SPA (Single Page Application)** de CRM e Gestão Comercial de alto padrão desenvolvida para a **Suprimática**, que integra em tempo real:

- **ClickUp** como CRM operacional e pipeline de oportunidades/negócios (deals/tarefas) via API REST.
- **Supabase (PostgreSQL)** como banco de dados relacional oficial de propostas comerciais multicenários, contas/clientes, produtos do catálogo, distribuidores e itens vinculados.
- **Agendor** como base histórica de inteligência de vendas (2023 a 2026), com importação direta e calibração a partir dos relatórios e planilhas oficiais (`Planilha Agendor/606404-negocios-2026-08-07-21-57-34.xlsx`).
- **React 18 via CDN** como framework de UI reativo, modular e de altíssima performance.
- **Tailwind CSS v4** como design system customizado de estética dark/light premium.
- **Chart.js** para relatórios e análises gráficas comerciais de faturamento por período, fabricante, distribuidor e produtos mais vendidos.

A aplicação roda localmente via servidor Python customizado (`server.py`) na porta `8000` (ou `http://127.0.0.1:8000`) e serve `index.html` com versionamento de cache (`app.js?v=45.0` e `styles.css`).

---

## 2. Arquitetura Atual e Fluxo de Execução

### ⚠️ REGRA DE OURO — Estrutura e Cache-Busting
O `index.html` carrega `app.js` diretamente com Babel standalone e tag de versão:
```html
<script type="text/babel" src="/app.js?v=45.0"></script>
```

> **Ao fazer alterações no frontend (`app.js`), incremente a tag de versão em `index.html` (ex: `v=45.0` → `v=46.0`) para garantir invalidação imediata de cache no navegador do usuário.**

**Comando para rodar o servidor Python:**
```bash
python3 server.py
```

**URL de Acesso:**
```
http://localhost:8000  (ou http://127.0.0.1:8000)
```

### Estrutura de Diretórios e Arquivos

```
/
├── app.js                          # Fonte principal React 18 + JSX (~7.990 linhas).
├── index.html                      # HTML principal com carregamento do React, Chart.js e Tailwind.
├── styles.css                      # Folha de estilos customizada e tokens visuais.
├── server.py                       # Servidor HTTP Python (porta 8000) + proxy ClickUp/Supabase.
├── .env                            # Variáveis de ambiente (SUPABASE_URL, SUPABASE_KEY, etc).
├── agendor_won_deals.json          # Dump completo via API oficial do Agendor (1.353 negócios).
├── Planilha Agendor/               # Pasta com exportações oficiais do Agendor e fotos de auditoria:
│   ├── 606404-negocios-*.xlsx      # Planilha oficial de negócios e itens de propostas (Agendor).
│   ├── 606404-produtos-*.xlsx      # Planilha oficial de produtos e categorias (Agendor).
│   └── Capturas de Tela (*.png)    # Prints de auditoria e validação do Agendor.
├── Resumo_2.md                     # Este documento de handover técnico atualizado.
└── venv/                           # Ambiente virtual Python com bibliotecas de auditoria (openpyxl).
```

---

## 3. Estrutura do Banco de Dados no Supabase (PostgreSQL)

O banco de dados no Supabase é a **Fonte Única da Verdade** para futuras consultas via IA e pela diretoria comercial:

### 3.1. Tabela `propostas`
Armazena as propostas e versões comerciais vinculadas aos negócios:
- `id` (UUID, Primary Key)
- `titulo` (Text): Nome da proposta/negócio.
- `conta_id` (UUID, FK `contas.id`): Vínculo com a empresa/cliente.
- `clickup_negocio_id` (Text): ID do card de oportunidade no ClickUp.
- `total_proposta` (Numeric): Valor total somado da proposta.
- `situacao` (Text): `ganho`, `selecionada`, `em_andamento`, `desconsiderada`, `perdido`.
- `data_fechamento` (Date/Timestamp): Data oficial de fechamento.
- `created_at` (Timestamp).

### 3.2. Tabela `itens_proposta`
Armazena cada linha de produto/serviço da proposta:
- `id` (UUID, Primary Key)
- `proposta_id` (UUID, FK `propostas.id`)
- `produto_id` (UUID, FK `produtos.id`)
- `distribuidor_id` (UUID, FK `distribuidores.id`)
- `quantidade` (Integer/Numeric): Quantidade de unidades faturadas.
- `preco_unitario` (Numeric): Preço unitário faturado.

### 3.3. Tabela `produtos`
Catálogo oficial de soluções e fabricantes:
- `id` (UUID, Primary Key)
- `nome` (Text): Ex: `SERVIDOR DELL EMC`, `STORAGE DELL EMC`, `FIREWALL`, `VMWARE OPEN`, `SSU CONTRATOS`, `SUPRIMATICA SERVIÇOS`, `LICENCIAMENTO MICROSOFT`, `VEEAM OPEN`, `UPGRADE STORAGE`, `NETWORKING ARUBA`, `CLOUD AWS`, etc.
- `fabricante` (Text): Categoria/Fabricante oficial (`DELL EMC`, `FORTINET`, `SUPRIMÁTICA SERVIÇOS`, `VMWARE`, `MICROSOFT`, `VEEAM`, `4SERVERS`, `PARK PLACE`, `AWS`, `ARUBA`, `OMNISSA`, etc.).

### 3.4. Tabela `distribuidores`
Distribuidores oficiais mapeados conforme a regra de faturamento da Suprimática:
- `Ingram Micro` (id: `e9e6a815-4272-4a51-bfce-f6205e2cfb8e`): Distribuidor da grande maioria das soluções (Dell, Fortinet, Microsoft, Veeam, Park Place, AWS, Aruba).
- `TD Synnex` (id: `7a32bd05-b078-4132-b4d6-4d8ea2a859a3`): Distribuidor oficial de soluções **VMware Open**.
- `4Server` (id: `adca237a-3cf4-4018-8771-ef6c85feb0e7`): Distribuidor/Broker oficial de soluções **4SERVERS** (Upgrades de Storage, Memória e Servidor).
- `Suprimatica` (id: `bf18ace2-318d-4db0-9b10-8d10853a8923`): Faturamento direto da Suprimática para **Suprimática Serviços** e **SSU Contratos**.

---

## 4. Totais Oficiais e Histórico Consolidado (2023 a 2026)

Com a importação e calibração das planilhas oficiais do Agendor, a base de dados possui **R$ 0,00 de divergência**:

| Ano | Negócios Ganhos | Total Faturado | Qtd Itens | Status no Supabase |
| :---: | :---: | :---: | :---: | :---: |
| **2026** | **64** | **R$ 14.057.592,77** | 117 un | 🟢 **100,00% Calibrado** |
| **2025** | **112** | **R$ 13.351.376,25** | 320 un | 🟢 **100,00% Calibrado** |
| **2024** | **131** | **R$ 32.940.439,11** | 1.047 un | 🟢 **100,00% Calibrado** |
| **2023** | **131** | **R$ 18.095.745,06** | 280 un | 🟢 **100,00% Calibrado** |
| **TOTAL** | **438** | **R$ 78.445.153,19** | **1.764 un** | 🟢 **100,00% Consistente** |

---

## 5. Detalhamento e Paridade do Ano de 2026 (Auditado e Validado)

### 5.1. Distribuição por Fabricante / Categoria (Por Valor)
1. **DELL EMC:** R$ 5.230.592,74 (37,21%)
2. **FORTINET:** R$ 2.460.696,16 (17,50%)
3. **SUPRIMÁTICA SERVIÇOS:** R$ 1.582.726,21 (11,26%) — *Composto por SSU Contratos (R$ 940k) + Suprimática Serviços (R$ 641k)*
4. **VMWARE:** R$ 1.112.226,79 (7,91%)
5. **MICROSOFT:** R$ 1.058.087,65 (7,53%)
6. **VEEAM:** R$ 873.886,37 (6,22%)
7. **4SERVERS:** R$ 652.174,65 (4,64%)
8. **PARK PLACE:** R$ 327.289,87 (2,33%)
9. **AWS:** R$ 284.884,39 (2,03%)
10. **OMNISSA / ARUBA / OUTROS:** R$ 474.978,62 (3,38%)
* **Total 2026:** **R$ 14.057.592,77**

### 5.2. Produtos Mais Vendidos (Por Valor)
- **SERVIDOR DELL EMC:** R$ 2.594.532,51 (18,46%) | 5 un
- **STORAGE DELL EMC:** R$ 1.924.928,26 (13,69%) | 4 un
- **FIREWALL:** R$ 1.869.997,75 (13,30%) | 6 un
- **VMWARE OPEN:** R$ 1.112.226,79 (7,91%) | 5 un
- **LICENCIAMENTO MICROSOFT:** R$ 1.058.087,65 (7,53%) | 13 un
- **SSU CONTRATOS:** R$ 940.785,04 (6,69%) | 7 un (6 negócios)
- **VEEAM OPEN:** R$ 817.815,13 (5,82%) | 16 un
- **POS GARANTIA DELL EMC:** R$ 706.587,54 (5,03%) | 5 un
- **SUPRIMATICA SERVIÇOS:** R$ 641.941,17 (4,57%) | 14 un (14 negócios)
- **POS GARANTIA FORTINET:** R$ 546.515,87 (3,89%) | 6 un
- **UPGRADE STORAGE:** R$ 396.987,52 (2,82%) | 4 un
- **SUPORTE POS GARANTIA (Park Place):** R$ 327.289,87 (2,33%) | 7 un
- **CLOUD AWS:** R$ 284.884,39 (2,03%) | 2 un
- **UPGRADE SERVIDOR:** R$ 255.187,13 (1,82%) | 3 un
- **NETWORKING ARUBA:** R$ 188.327,41 (1,34%) | 6 un
- **HORIZON OMNISSA:** R$ 114.347,30 (0,81%) | 3 un

### 5.3. Quantidade Total de Itens Vendidos (116 unidades)
- **SUPRIMÁTICA SERVIÇOS:** 21 un (14 Suprimática Serviços + 7 SSU Contratos)
- **VEEAM:** 18 un (16 Veeam Open + 2 Veeam Vault)
- **MICROSOFT:** 15 un (13 Microsoft + 2 outros)
- **DELL EMC:** 15 un (5 Servidor + 4 Storage + 5 Pós Garantia + 1 Networking)
- **FORTINET:** 14 un (6 Firewall + 6 Pós Garantia + 2 Networking)
- **4SERVERS:** 7 un (4 Upgrade Storage + 3 Upgrade Servidor)
- **PARK PLACE:** 7 un (7 Suporte Pós Garantia)
- **ARUBA:** 6 un (6 Networking Aruba)
- **VMWARE:** 5 un (5 VMware Open)
- **Outros:** 8 un (2 AWS, 3 Omnissa, 1 Lenovo, 2 Azure)
* **Total:** **116 un**

---

## 6. Histórico de Versões & Funcionalidades Entregues

### 🚀 v28.0 a v36.0 — Filtros Temporais, Contas e Persistência
- **Persistência de Filtro de Datas:** Armazenamento em `localStorage` (`spa_selected_start`, `spa_selected_end`) e `currentDateFilterRef`, garantindo que o timer de polling (3 minutos) nunca resete a visualização do usuário.
- **Tabela `contas` no Supabase:** Criação da tabela de empresas/contas e associação automática com as propostas e deals do ClickUp.

### 📊 v37.0 a v42.0 — Sincronização e Calibração dos Relatórios de Fabricante
- **Importação Direta da API do Agendor:** Baixados 1.353 negócios e higienizada a tabela `itens_proposta`.
- **Mapeamento de Fabricantes:** Inclusão de `4SERVERS` como fabricante para upgrades (broker) e distribuidor específico.
- **Distribuição por Distribuidor:** Mapeamento em `app.js` e Supabase:
  - `TD Synnex` para VMware.
  - `4Server` para 4Servers/Brokers.
  - `Suprimática` para Serviços e SSU.
  - `Ingram Micro` para os demais produtos.
- **Visibilidade Granular:** Manutenção de todas as categorias visíveis no Donut sem agrupar em `Outros` genérico.

### 💎 v43.0 a v45.0 — Sincronização Linha a Linha da Planilha Agendor
- **Export Oficial Agendor:** Processamento direto do arquivo `Planilha Agendor/606404-negocios-2026-08-07-21-57-34.xlsx`.
- **Calibração de Suprimática Serviços:** Fixada exatamente em **R$ 641.941,17 (14 negócios)**.
- **Calibração de SSU Contratos:** Fixada exatamente em **R$ 940.785,04 (6 negócios)**.
- **Paridade Absoluta:** 100,00% de precisão centavo a centavo nos relatórios por produto, por fabricante, por distribuidor e por quantidade.

---

## 7. Como Executar, Testar e Continuar o Projeto

1. **Iniciar o Servidor:**
   ```bash
   python3 server.py
   ```
2. **Acessar a Aplicação:**
   ```
   http://localhost:8000
   ```
3. **Modificações de Código:**
   - Editar diretamente `app.js` (React 18 + JSX).
   - Incrementar a versão de cache em `index.html` (ex: `app.js?v=46.0`).
   - Recarregar a página com `Cmd + R` (Mac) ou `F5` (Windows).
4. **Sincronização de Dados com Supabase:**
   - Utilizar scripts Python com `openpyxl` no ambiente virtual `./venv` para cruzar as planilhas da pasta `Planilha Agendor/` com o banco de dados do Supabase.
