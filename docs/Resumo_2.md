# 📋 Resumo Executivo & Handover de Contexto para IA (v54.0)

> **Como usar este documento:** Copie e cole todo o conteúdo abaixo no prompt inicial de qualquer IA (ChatGPT, Claude, Gemini, Cursor, etc.) para que ela compreenda 100% do projeto, da arquitetura, do histórico de decisões, dos bugs já corrigidos e do estado atual do banco de dados e do código.

---

## 1. Visão Geral do Projeto & Arquitetura

* **Nome do Projeto:** SPA Gestão Comercial Suprimática
* **Objetivo:** Single Page Application (SPA) de CRM e Gestão Comercial de alto padrão para a empresa **Suprimática**, integrando pipeline de vendas, propostas comerciais, métricas de faturamento e inteligência de dados para suporte à diretoria comercial e agentes de IA.
* **Stack Tecnológica:**
  * **Frontend:** React 18 (via CDN / Babel standalone, sem build step de JS), Tailwind CSS v4 (**com build step** — ver seção 8), Chart.js.
  * **Backend / Proxy:** Python HTTP Server (`server.py` na porta 8000) atuando como proxy seguro com injeção de tokens para ClickUp e Supabase. Servidor multi-thread (`ThreadingMixIn`) para suportar fetch paralelo do frontend.
  * **Banco de Dados (Fonte da Verdade):** Supabase (PostgreSQL) com tabelas `propostas`, `itens_proposta`, `produtos`, `distribuidores`, `tarefas_comerciais`, `vendedores`.
  * **Integrações de Origem:** Agendor (CRM histórico/origem das vendas, API v3 `api.agendor.com.br/v3/deals`) e ClickUp (Gestão de tarefas/negócios atuais, via proxy `/clickup-api/*`).
  * **Versões atuais de cache-bust:** `app.js?v=53.4` · `dist/styles.css?v=24.0` (ambas em `index.html` — **sempre incrementar as duas ao alterar `app.js`, `styles.css` ou classes Tailwind em `index.html`**, ver seção 8).

---

## 2. Regras de Negócio Fundamentais & Diretrizes Comerciais

1. **Moeda e Precisão:** Valores monetários em Reais (`BRL - R$`), sempre formatados com precisão centavo a centavo (`1.234.567,89`).
2. **Fontes de Dados:**
   * O **Supabase** é a única **Fonte da Verdade** consumida pela SPA.
   * O **Agendor** é o sistema de origem oficial dos dados históricos de vendas ganhas de 2023 a 2026 (arquivo `Planilha Agendor/606404-negocios-2026-08-07-21-57-34.xlsx`) e também da API v3 (campo `category` de cada produto = fabricante; **esse campo só existe via API, não é exportável pela planilha**).
3. **Regras Oficiais de Fabricantes e Distribuidores (2023 a 2026):**
   * **`LEGACY TI` vs `4SERVERS` (Distribuidores e Fabricantes Distintos):**
     - **`LEGACY TI`:** Distribuidor/parceiro histórico de upgrades de hardware até **24/02/2025**.
     - **`4Server`:** Distribuidor/parceiro adotado a partir de **25/02/2025** em diante.
   * **`VMware Open`:** Distribuído por **Ingram Micro** até **31/01/2025**; a partir de **01/02/2025**, por **TD Synnex**.
   * **`MICROSOFT`:** Inclui Licenciamento Microsoft e produtos de nuvem **Cloud Azure** em todos os anos.
   * **`POSITIVO`:** Faturamento de hardware **Super Micro / Positivo**.
   * **`Suprimatica`:** Faturamento direto para serviços próprios (**Suprimática Serviços**, **SSU Contratos** e **SSU Job Avulso**) — a distribuidora fatura a si mesma.
   * **`Park Place` / `OTG`:** Fabricante e distribuidor coincidem — essas duas marcas faturam diretamente (self-billing), sem passar por Ingram Micro ou outro distribuidor.
   * **`Ingram Micro`:** Distribuidor padrão para todos os demais fabricantes (*Dell EMC, Fortinet, HPE, Aruba, Veeam, AWS, Lenovo, Nutanix, APC, Zebra, etc.*).
4. **Padronização de nomes de fabricante:** os nomes de fabricante gravados no Supabase (`produtos.fabricante`) devem ser mantidos **idênticos** aos nomes usados no Agendor, para evitar divergências de comparação/sincronização futuras (decisão explícita do usuário). Auditoria completa já foi feita — ver seção 6.

---

## 3. Totais Oficiais e Histórico Consolidado (2023 a 2026)

| Ano | Negócios Ganhos | Faturamento Propostas | Soma dos Itens | Unidades | Linhas de Itens | Divergência | Status no Supabase |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2026** | **64** | **R$ 14.057.592,77** | **R$ 14.057.592,77** | 117 un | 105 linhas | **R$ 0,00** | 🟢 **100,00% Calibrado** |
| **2025** | **112** | **R$ 13.351.376,25** | **R$ 13.351.376,25** | 323 un | 163 linhas | **R$ 0,00** | 🟢 **100,00% Calibrado** |
| **2024** | **131** | **R$ 32.940.439,11** | **R$ 32.940.439,11** | 1.048 un | 235 linhas | **R$ 0,00** | 🟢 **100,00% Calibrado** |
| **2023** | **131** | **R$ 18.095.745,06** | **R$ 18.095.745,06** | 282 un | 186 linhas | **R$ 0,00** | 🟢 **100,00% Calibrado** |
| **TOTAL** | **438** | **R$ 78.445.153,19** | **R$ 78.445.153,19** | **1.770 un** | **689 linhas** | **R$ 0,00** | 🟢 **100,00% Consistente** |

Esses 438 negócios ganhos e o total de R$ 78.445.153,19 foram **auditados individualmente contra o Agendor** (produto, fabricante, distribuidor e valor) e confirmados também na nova visão de Lista de Negócios (seção 7.5) — os dois caminhos batem exatamente.

Além dos 438 ganhos, os **62 negócios ativos/não congelados** do Funil de Vendas (em andamento, total R$ 25.457.937,45) também foram auditados e corrigidos contra o Agendor (produto/fabricante/distribuidor/valor), preservando `situacao`/`data_fechamento` intocados (esses negócios ainda não fecharam).

---

## 4. Correção de Dados & Auditoria (trabalho concluído)

**Motivação:** o usuário identificou, via prints comparando a SPA com o Agendor, negócios com produto/fabricante/distribuidor incorretos (ex.: item errado herdado de outro negócio, fabricante divergente do real). Pedido explícito: *"Precisamos de ação para corrigir 100% isso eliminando esse tipo de erro"*.

**O que foi feito:**
1. Auditoria completa dos 438 negócios ganhos (`scripts/auditoria_fabricante_distribuidor.py`) comparando Supabase vs. Agendor (planilha + API, já que `category`/fabricante só vem pela API).
2. Correção dos itens divergentes (`scripts/corrigir_fabricante_distribuidor.py`, `scripts/corrigir_conteudo_propostas.py`) — reconstrução de `itens_proposta` a partir dos produtos reais do Agendor para cada negócio.
3. Auditoria e correção equivalente para os 62 negócios ativos do funil (`scripts/auditoria_forecast_ativo.py`, `scripts/corrigir_forecast_ativo.py`).
4. Padronização de nomes de fabricante no catálogo (`produtos.fabricante`) para bater exatamente com o Agendor (20 produtos corrigidos).
5. Backup completo antes de cada escrita, salvo em `backups/` (ex.: `backups/pre_correcao_forecast_ativo.json`).

**Descoberta crítica de infraestrutura:** a RLS (Row Level Security) do Supabase (migração `20260712_enable_rls.sql`) permite `SELECT` com a chave `anon`, mas **não tem policy de `UPDATE`/`DELETE`** nas tabelas `distribuidores`/`produtos`/`itens_proposta`/`vendedores`. Isso faz com que `UPDATE`/`DELETE` com a chave anônima retornem HTTP 204 "sucesso" **sem alterar nenhuma linha** (silencioso, sem erro). Só foi detectado fazendo um teste de escrita→releitura→comparação. A tabela `propostas` não tem RLS.
**Regra prática:** qualquer script de correção em massa **deve usar `SUPABASE_SERVICE_ROLE_KEY`** (presente no `.env`, gitignored) e, idealmente, validar com um round-trip de leitura após escrever.

---

## 5. Bugs Críticos Corrigidos Definitivamente

1. **Perda de dados ao trocar de aba durante edição de itens:** o polling silencioso de 3 minutos (`setInterval` dentro de `loadProposalDetails`) sobrescrevia itens ainda não salvos (ex.: usuário no item 9 de 10 via os dados voltarem a zero). Causa raiz: *stale closure* — o `setInterval` era criado por um `useEffect` com deps limitadas e capturava o valor antigo de `itens`. Corrigido com padrão `itensRef` (`useRef` + `useEffect` espelhando o state) e um guard: se o polling é silencioso (`silent=true`) e existe algum item com id temporário (`temp-...`, de itens recém-adicionados ainda não salvos), o refresh é abortado.
2. **Criação fantasma de proposta "autocura":** havia um bloco em `server.py` (`handle_get_tarefas`) que, ao encontrar uma tarefa comercial órfã (sem proposta vinculada), criava automaticamente uma proposta fake com nome hardcoded ("Unimed São Carlos | Upgrade Switch Core Aruba") e mais 3 chamadas ao Supabase por órfã. Bloco removido inteiramente — hoje uma tarefa órfã aparece como "Sem Proposta" em vez de inventar dados.
3. **Negócio "ganho" fantasma (não existe no Agendor):** o campo `data_fechamento` das propostas estava sendo auto-preenchido a partir do `due_date` do ClickUp em vários pontos do código (criação de nova versão, salvamento de proposta, sincronização de datas), fazendo negócios ainda abertos aparecerem como fechados/ganhos incorretamente. Corrigido em 5 pontos de `app.js`: removido o bloco inteiro de auto-import de `due_date → data_fechamento`; `handleGerarNovaVersao` e `handleSaveProposal` não usam mais `due_date` como fallback para `data_fechamento` (agora fica `null` até o usuário fechar manualmente o negócio). Os registros já afetados foram limpos manualmente.

---

## 6. Otimizações de Performance

* **`server.py`:** trocado de `socketserver.TCPServer` single-thread para `ThreadingMixIn` (`daemon_threads = True`) — necessário para suportar as requisições paralelas do frontend sem enfileirar tudo serialmente.
* **`fetchKanbanData` (app.js):** paginação do ClickUp reescrita para buscar páginas em lotes paralelos especulativos (`fetchAllClickUpTasks`, `BATCH_SIZE = 10`) em vez de uma página por vez; `propostas`, `campos customizados` e `tarefas` do ClickUp agora são buscados em `Promise.all` (antes era sequencial); o casamento task↔proposta passou de filtro aninhado O(n×m) para índice `Map` O(n+m).
* **Aba "Tarefas Comerciais":** antes mostrava spinner de tela cheia toda vez que o usuário voltava à aba. Corrigido com `hasLoadedTasksOnceRef` (`useRef`) — só mostra o loading completo na primeira carga da sessão.

---

## 7. Ajustes Finais de UX (lista fechada — 6 itens, todos entregues)

### 7.1 — Spinner de carregamento da aba Tarefas
Resolvido junto com a otimização de performance (seção 6) — `hasLoadedTasksOnceRef`.

### 7.2 — Barra de rolagem na lista de propostas por etapa do Forecast
A lista de negócios de uma etapa (ex. "Proposta") crescia junto com a tela inteira em vez de rolar internamente. Causa raiz em **três camadas**:
1. `styles.css`: `.kanban-board`/`.kanban-cards` tinham `max-height: calc(100vh - Npx)` com número mágico descasado da altura real do cabeçalho da coluna.
2. `app.js`: a lista de detalhe do estágio (`ForecastFunnelPanel`) não tinha `flex-1 min-h-0 overflow-y-auto`.
3. `index.html`: o wrapper estático `<body>`/`<div id="root">` (**fora da árvore React**, nunca tocado pelas edições em `app.js`) ainda usava `min-h-screen`, deixando a página inteira crescer indefinidamente.

**Armadilha ao corrigir a camada 3:** o projeto usa Tailwind v4 com **build step estático** (`dist/styles.css` é gerado, não é live/JIT no browser). Adicionar classes novas como `h-screen`/`overflow-hidden` direto no `index.html` **não tem efeito nenhum** até rodar o build — ver seção 8.

### 7.3 — Card cortado no fim das colunas do Kanban
Resolvido junto com 7.2, removendo o `max-height` fixo de `.kanban-board`/`.kanban-cards` em `styles.css` (o `flex:1; min-height:0` dentro do container pai, que já tem altura/overflow definidos, é suficiente).

### 7.4 — Filtro por fabricante no Funil de Forecast
Adicionado seletor "Fabricante" no `ForecastFunnelPanel`, populado dinamicamente com os fabricantes presentes nos negócios ativos. Implementação: `fetchKanbanData` agora também busca `itens_proposta` (produto→fabricante) em paralelo e monta um índice `proposta_id → Set(fabricantes)`; cada task do Kanban recebe um array `fabricantes` (baseado na proposta "melhor match" já escolhida para aquele negócio). O filtro reduz tanto os totais por etapa quanto a lista detalhada, e combina corretamente com o filtro de etapa já existente.

### 7.5 — Visão de lista rica para negócios Ganhos / Perdidos / Congelados / Todos
Inspirado na tela "Negócios" do Agendor (Lista com filtros de período/status). Componente novo `DealsListView` (app.js), acessado pelos botões da barra "Exibir Estágios" — **🏆 Ganho**, **😞 Perdido**, **❄️ Congelado** e **📋 Lista Completa** — cada um abre a lista já pré-filtrada pelo status correspondente, mas totalmente reconfigurável dali.

* **Colunas:** Cliente, Responsável, Status, Etapa, Data Fechamento, Valor (ordenáveis clicando no cabeçalho).
* **Filtros:** busca por nome do cliente/negócio, Status (Todos/Em andamento/Ganho/Perdido/Congelado), Etapa, Responsável, e período de fechamento (Ano Atual / Trimestre Atual / Todo Histórico / Personalizado com datas livres).
* **Status vs. Etapa:** "Status" é uma categoria derivada (Ganho/Perdido/Congelado/"Em andamento") a partir do nome da etapa atual do negócio no ClickUp; "Etapa" é o nome bruto do estágio do funil (Registro, Qualificação, Proposta, Desenvolvimento, Negociação, Termo de Aceite, ou Ganho/Perdido/Congelado quando fechado).
* Clique em qualquer linha abre o drawer completo da proposta (mesmo handler usado no Kanban e no Forecast).
* Rodapé com contagem e soma total (R$) dos negócios filtrados.
* `data_fechamento` passou a ser carregado por `fetchKanbanData` (extensão do select em `propostas`) e anexado a cada task, exatamente como `fabricantes` (seção 7.4).
* **Limpeza:** os antigos toggles simples de coluna Ganho/Perdido/Congelado do quadro Kanban puro (`showGanhoCol`/`showPerdidoCol`/`showCongeladoCol`) foram removidos — eram considerados "muito simples" pelo usuário e a nova lista os substitui integralmente. As colunas Ganho/Perdido/Congelado agora ficam sempre ocultas no quadro Kanban simples (só existem via a nova Lista de Negócios).
* **Validado ao vivo:** 438 negócios "Ganho" com total R$ 78.445.153,19 (bate exatamente com Relatórios); busca "Unimed" → 142 resultados; filtro "Em andamento" → total R$ 25.457.937,45 (bate exatamente com o Forecast); ordenação por Valor e filtro "Ano Atual" testados e corretos.

---

## 8. ⚠️ Armadilha de Build: Tailwind CSS não é live no browser

O projeto usa **Tailwind CSS v4 com build estático** via `@tailwindcss/cli` (`node_modules/.bin/tailwindcss`), **não** o CDN/JIT. `dist/styles.css` é um arquivo **gerado**, escaneando `app.js` e `index.html` (`@source` no `styles.css` fonte) por classes utilizadas.

**Consequência prática:** se você adicionar uma classe Tailwind nova (ex. `h-screen`, `overflow-hidden`) direto em `index.html` ou `app.js` e ela nunca tiver sido usada antes em nenhum outro lugar do projeto, **ela simplesmente não existe no CSS compilado** até rodar o build — não dá erro nenhum, o elemento só silenciosamente não recebe o estilo. Isso já causou uma sessão inteira de debug (seção 7.2) até se perceber que `.h-screen{}` não existia em `dist/styles.css`.

**Sempre que adicionar/mudar classes Tailwind, rodar:**
```bash
npx tailwindcss -i styles.css -o dist/styles.css --minify
```
E então **incrementar o cache-buster** `dist/styles.css?v=X.X` em `index.html` (além do `app.js?v=X.X`, que já é necessário para qualquer mudança em `app.js` — navegar com `?queryparam` na URL do `index.html` **não** invalida o `<script src="/app.js?v=...">`, que tem seu próprio query string fixo).

---

## 9. Estado Atual do Sistema

* **Servidor Local:** `server.py` rodando na porta `8000` (multi-thread).
* **Banco Supabase:** 438 propostas ganhas + 62 negócios ativos, todos auditados e íntegros contra o Agendor. RLS ativa em `distribuidores`/`produtos`/`itens_proposta`/`vendedores` (só `SELECT` com `anon`; escrita requer `SUPABASE_SERVICE_ROLE_KEY`).
* **Cache-busters atuais:** `app.js?v=53.4`, `dist/styles.css?v=24.0`.
* **Lista de ajustes finais (6 itens) — concluída integralmente**, ver seção 7.
* **Pendências conhecidas:** nenhuma pendência funcional aberta no momento. Pequena nota de dados: a Lista de Negócios (seção 7.5) mostra 64 negócios "Em andamento" enquanto o Forecast soma 62 — diferença de 2 negócios com valor R$ 0,00 cujo `custom_field` de etapa no ClickUp não casa com nenhuma coluna conhecida (órfãos de dados antigos); o total em R$ bate exatamente entre as duas telas, então não é um bug funcional, só uma diferença de critério de contagem entre os dois componentes.
* **Scripts utilitários criados nesta fase** (todos em `scripts/`, padrão auditoria→correção com backup): `auditoria_fabricante_distribuidor.py`, `corrigir_fabricante_distribuidor.py`, `corrigir_conteudo_propostas.py`, `auditoria_forecast_ativo.py`, `corrigir_forecast_ativo.py`.
