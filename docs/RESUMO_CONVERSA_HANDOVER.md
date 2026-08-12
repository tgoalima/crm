# 📋 Resumo Executivo & Handover de Contexto para IA

> **Como usar este documento:** Copie e cole todo o conteúdo abaixo no prompt inicial de qualquer IA (ChatGPT, Claude, Gemini, Cursor, etc.) para que ela compreenda 100% do projeto, da arquitetura, do histórico de decisões e do estado atual do banco de dados e do código.

---

## 1. Visão Geral do Projeto & Arquitetura

* **Nome do Projeto:** SPA Gestão Comercial Suprimática
* **Objetivo:** Single Page Application (SPA) de CRM e Gestão Comercial de alto padrão para a empresa **Suprimática**, integrando pipeline de vendas, propostas comerciais, métricas de faturamento e inteligência de dados para suporte à diretoria comercial e agentes de IA.
* **Stack Tecnológica:**
  * **Frontend:** React 18 (via CDN / Babel standalone), Tailwind CSS v4, Chart.js.
  * **Backend / Proxy:** Python HTTP Server (`server.py` na porta 8000) atuando como proxy seguro com injeção de tokens para ClickUp e Supabase.
  * **Banco de Dados (Fonte da Verdade):** Supabase (PostgreSQL) com tabelas relacionais `propostas`, `itens_proposta`, `produtos`, `distribuidores`, `contas`.
  * **Integrações:**
    * **ClickUp:** CRM operacional diário e Kanban de estágios.
    * **Agendor:** Histórico legado oficial de vendas (2023 a 2026).

---

## 2. Regras de Negócio e Diretrizes Estruturais

1. **Integridade de Dados no Supabase:**
   * A diretoria comercial utilizará IAs e consultas diretas no banco de dados. Portanto, **os dados precisam estar 100% corretos na base de dados (`itens_proposta`, `propostas`, etc.) e não apenas visualmente no frontend**.
2. **Regras Oficiais de Faturamento por Distribuidor:**
   * **`TD Synnex`:** Distribuidor exclusivo para faturamento de **VMware Open**.
   * **`4Server`:** Distribuidor/Broker exclusivo para **4SERVERS** (Upgrades de Storage, Memória e Servidor).
   * **`Suprimatica`:** Faturamento direto da Suprimática para **Suprimática Serviços** e **SSU Contratos**.
   * **`Ingram Micro`:** Distribuidor oficial para todos os demais produtos e fabricantes (*Dell EMC, Fortinet, Microsoft, Veeam, Park Place, AWS, Aruba, HPE, Lenovo, etc.*).
3. **Visibilidade de Relatórios:**
   * Manter a granularidade dos fabricantes e produtos no dashboard (sem forçar agrupamento artificial em "Outros").
4. **Fonte Única da Verdade do Histórico (Ground Truth):**
   * Pasta local `Planilha Agendor/` contendo as planilhas oficiais exportadas do Agendor:
     * `606404-negocios-2026-08-07-21-57-34.xlsx` (689 linhas de itens e negócios ganhos).
     * `606404-produtos-2026-08-07-17-38-17.xlsx` (catálogo oficial de produtos e categorias).

---

## 3. O Que Foi Realizado Nesta Sessão (Resumo das Entregas)

1. **Auditoria e Calibração de Faturamento 2026 (R$ 14.057.592,77):**
   * Sincronizados e calibrados os 64 negócios e 105 itens de 2026 diretamente no Supabase.
   * **Suprimática Serviços:** Calibrado em **R$ 641.941,17 (14 negócios)**.
   * **SSU Contratos:** Calibrado em **R$ 940.785,04 (6 negócios)**.
   * **Categoria Suprimática Serviços:** **R$ 1.582.726,21 (20 negócios)**.
2. **Paridade Absoluta das Quantidades (116 unidades em 2026):**
   * Total de produtos vendidos calibrado em **116 unidades**:
     * `Suprimática Serviços`: 21 un
     * `Veeam`: 18 un (16 Veeam Open + 2 Veeam Vault)
     * `Microsoft`: 15 un
     * `Dell EMC`: 15 un
     * `Fortinet`: 14 un
     * `4Servers`: 7 un
     * `Park Place`: 7 un
     * `Aruba`: 6 un
     * `VMware`: 5 un
     * `Outros (AWS, Omnissa, Lenovo)`: 8 un
3. **Mapeamento de Distribuidores:**
   * Gravados em `itens_proposta` no Supabase os vínculos corretos para Ingram Micro, TD Synnex, 4Server e Suprimática.
4. **Sincronização Histórica Consolidada (2023 a 2026):**
   * **2026:** 64 negócios | R$ 14.057.592,77 | 117 itens
   * **2025:** 112 negócios | R$ 13.351.376,25 | 320 itens
   * **2024:** 131 negócios | R$ 32.940.439,11 | 1.047 itens
   * **2023:** 131 negócios | R$ 18.095.745,06 | 280 itens
   * **Total Acumulado:** 438 negócios | **R$ 78.445.153,19** | 1.764 itens
5. **Atualização da Documentação Técnica (`Resumo_2.md`):**
   * Documento oficial de handover atualizado com toda a arquitetura, tabelas do Supabase e histórico de versões até a **v45.0**.

---

## 4. Estrutura de Arquivos Principais

* `/app.js`: Código-fonte React 18 da SPA comercial (~7.990 linhas).
* `/index.html`: Arquivo HTML com carregamento do React e tag de versão (`app.js?v=45.0`).
* `/server.py`: Servidor HTTP local (porta 8000) e proxy para ClickUp e Supabase.
* `/Planilha Agendor/`: Pasta com as planilhas oficiais `.xlsx` e fotos de auditoria.
* `/Resumo_2.md`: Documentação técnica detalhada de arquitetura e versões.
* `/.env`: Variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_KEY`).

---

## 5. Como Rodar e Testar

```bash
# 1. Executar o servidor local Python
python3 server.py

# 2. Acessar no navegador
http://localhost:8000
```
> **Nota de Manutenção:** Ao realizar edições em `app.js`, altere o parâmetro de versão no `index.html` (ex: `app.js?v=45.0` → `app.js?v=46.0`) para forçar a limpeza de cache no navegador.

---

## 6. Próximos Passos Recomendados

* Validar e refinar detalhadamente os relatórios dos anos anteriores (**2025, 2024 e 2023**) conforme demanda da diretoria comercial, utilizando a mesma metodologia de cruzamento com `Planilha Agendor/606404-negocios-2026-08-07-21-57-34.xlsx`.
