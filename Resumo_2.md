# Resumo_2 — Handover Completo: SPA Gestão Comercial Suprimática

> **Propósito:** Este documento é um guia de handover atualizado para que uma IA possa retomar o desenvolvimento com contexto total. Ele complementa o `Resumo_1.md` com tudo que foi construído, corrigido e descoberto na fase atual do projeto.

---

## 1. O Que o Projeto É (Visão Executiva)

Uma **SPA (Single Page Application)** de CRM e Gestão Comercial para a empresa **Suprimática**, que integra:

- **ClickUp** como fonte de dados de negócios (deals) via API REST
- **Supabase (PostgreSQL)** como banco de dados de propostas comerciais
- **React 18 via CDN** como framework de UI (sem build tool, sem Node.js em produção)
- **Tailwind CSS v4 (compilado via esbuild)** como framework de estilos

A aplicação roda localmente via servidor Python (`server.py`) na porta `8000` e serve dois arquivos compilados: `dist/app.js` e `dist/styles.css`.

---

## 2. Arquitetura Atual e Fluxo de Build

### ⚠️ PONTO CRÍTICO — o navegador NUNCA carrega `app.js` diretamente

O `index.html` aponta para `/dist/app.js?v=6.5`. Portanto:

> **Toda edição feita em `app.js` (fonte) DEVE ser recompilada com esbuild para `dist/app.js`, caso contrário o navegador não vê nenhuma mudança.**

**Comando de build obrigatório após qualquer edição:**
```bash
npx esbuild app.js --bundle=false --outfile=dist/app.js --platform=browser --format=esm --loader:.js=jsx
```

**Comando para rodar o servidor:**
```bash
python3 server.py
```

**URL de acesso:**
```
http://127.0.0.1:8000
```

### Estrutura de Arquivos Relevantes

```
/
├── app.js                  # Fonte principal (React + JSX). EDITAR AQUI.
├── dist/
│   ├── app.js              # Arquivo COMPILADO. O que o navegador carrega.
│   └── styles.css          # Tailwind CSS compilado.
├── styles.css              # Fonte do Tailwind (input para compilação CSS).
├── index.html              # Carrega /dist/app.js e /dist/styles.css.
├── server.py               # Servidor HTTP Python (porta 8000) + proxy para APIs.
├── package.json            # Só tem devDependencies do Tailwind CSS v4.
└── supabase/               # Migrations e Edge Functions do Supabase.
```

---

## 3. O Que o `server.py` Faz (Importante)

O `server.py` **não é um servidor simples**. Ele é um **proxy reverso customizado** que:

1. Serve os arquivos estáticos (HTML, JS, CSS) da pasta local.
2. Faz proxy das chamadas `/clickup-api/*` para `https://api.clickup.com/api/v2/*`, injetando o token de autenticação do ClickUp.
3. Faz proxy das chamadas `/api/*` para o Supabase, injetando as credenciais salvas no `.env`.
4. O arquivo `.env` está ausente no ambiente atual (SUPABASE_URL não está configurado), o que impede a integração com o banco de dados mas não impede o funcionamento do Kanban/ClickUp.

**Token ClickUp hardcoded no server.py:**
```
pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437
```

**ID da lista alvo no ClickUp (TARGET_LIST_ID):**
```
901326185457
```

---

## 4. Arquitetura do `app.js` — Componentes Principais

O `app.js` tem ~5.344 linhas. Abaixo os componentes e funções de maior importância:

### Funções Utilitárias Globais (topo do arquivo)

| Função | Propósito |
|---|---|
| `getSupabaseHeaders()` | Retorna headers com URL/Key do Supabase lidos do `localStorage` |
| `getSafeStageName(card)` | **Novo — adicionado nessa sessão.** Extrai `stage_name` ou `status` de um card de forma segura, tratando casos onde o valor é um **objeto** em vez de string. Evita crash de `.toLowerCase()` em objetos. |
| `formatValueCompact(val)` | Formata valores em R$ com sufixo K/M |
| `formatMaskedCurrency(value)` | Formata valor como moeda pt-BR |
| `getNextVersionLetter(versao)` | Incrementa letras de versão (vA → vB → ... → vZ → vAA) |
| `getStageSortKey(name)` | Retorna índice de ordenação cronológica do estágio do funil |
| `getStageWidth(name)` | Retorna largura percentual do estágio para o funil visual (100% → 25%) |

### Componentes React

| Componente | Localização | Propósito |
|---|---|---|
| `KanbanCard` | ~linha 104 | Card visual de um negócio no Kanban (memo) |
| `ForecastFunnelPanel` | ~linha 156 | Painel de funil de vendas e forecast. **Corrigido nessa sessão.** |
| `App()` | ~linha 285 | Componente raiz. Contém todos os estados e a lógica principal. |

### Estados Principais do App()

| Estado | Tipo | Propósito |
|---|---|---|
| `kanbanTasks` | Array | Lista de negócios/cards do ClickUp |
| `kanbanColumns` | Array | Colunas/estágios do Kanban (vêm da API do ClickUp) |
| `showForecast` | Boolean | Controla visibilidade do painel Forecast |
| `filterStage` | String/null | ID do estágio selecionado para filtrar o Kanban |
| `supabaseProposalsList` | Array | Propostas carregadas do Supabase |
| `activeTab` | String | Aba ativa: `'kanban'` ou `'relatorios'` |
| `showDrawer` | Boolean | Controla o drawer lateral de detalhes do negócio |
| `selectedTask` | Object | Negócio selecionado para abrir no drawer |
| `wonProposals` | Array | Propostas ganhas para o Dashboard |
| `commercialData` | Array | Dados de itens para gráficos de relatório |

---

## 5. O Que Foi Construído e Corrigido Nesta Sessão

### 5.1. Bug de Crash Fatal no Forecast (Tela Preta)

**Causa raiz identificada:**
A API do ClickUp pode retornar `status` ou `stage_name` como um **objeto JavaScript** `{ status: "ganho", color: "#..." }` em vez de uma string simples. Ao chamar `.toLowerCase()` diretamente sobre esse objeto (ex: `card.status.toLowerCase()`), o React crashava com erro fatal, resultando em tela preta.

**Solução implementada:**

1. **Função global `getSafeStageName(card)`** adicionada no topo de `app.js` (linha ~48):
   - Verifica `typeof card.stage_name === 'object'` antes de acessar o valor
   - Tenta extrair `.name`, `.status` ou `.value` do objeto
   - Sempre retorna uma `String` normalizada em lowercase

2. **`ForecastFunnelPanel` protegido com guards defensivos:**
   - `const safeColumns = Array.isArray(kanbanColumns) ? kanbanColumns : [];`
   - `const safeTasks = Array.isArray(kanbanTasks) ? kanbanTasks : [];`
   - Verificação `!col || typeof col.name !== 'string'` antes de processar colunas
   - Verificações `getTaskOptionId &&` e `getOpportunityValue ?` para props de função

3. **`totalVal` no JSX usa `safeTasks`** e chama `getSafeStageName(card)` em vez de lógica inline.

### 5.2. Descoberta Crítica: O Build

**Problema descoberto:** Todas as correções anteriores não estavam sendo vistas no navegador porque o arquivo `dist/app.js` nunca era atualizado. O servidor serve o arquivo compilado.

**Solução:** Após cada ciclo de edição, o comando de build deve ser executado:
```bash
npx esbuild app.js --bundle=false --outfile=dist/app.js --platform=browser --format=esm --loader:.js=jsx
```

---

## 6. Funcionalidades da Aplicação (Estado Atual)

### Aba Kanban (Principal)
- Kanban Board com drag-and-drop de cards entre colunas/estágios
- Colunas de estágio carregadas dinamicamente da API ClickUp
- Colunas ocultas por padrão: Ganho, Perdido, Congelado (toggles para mostrar)
- Ordenação: por nome, valor crescente, valor decrescente
- **Painel Forecast (📈):** Funil visual invertido com larguras proporcionais por estágio, total em negociação excluindo fechados/perdidos/congelados
- Drawer lateral: Ao clicar em um card, abre drawer com detalhes do negócio, histórico de propostas e criação de tarefas comerciais

### Aba Relatórios (Dashboard BI)
- KPIs de faturamento: ganho, perdido, ticket médio
- Comparação de períodos (atual vs. anterior)
- Gráficos de pizza por distribuidor e por fabricante
- Ranking de vendedores
- Listagem de contratos fechados recentes
- Filtros por data início/fim e por distribuidor/fabricante

### Editor de Propostas (Drawer)
- Criação e versionamento de propostas (vA → vB → ...)
- Edição de itens com cálculo em tempo real
- Importação via CSV ou XML
- Sincronização bidirecional com ClickUp (Deal Value em centavos × 100)
- Fluxo "🏆 Marcar como Ganha" → muda status no ClickUp e registra no Supabase

---

## 7. Integrações Técnicas

### ClickUp API
- **Proxy:** Todas as chamadas `/clickup-api/*` passam pelo `server.py`
- **Token:** `pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437` (hardcoded em `server.py`)
- **Lista alvo:** `901326185457`
- **Field de Deal Value:** `DEAL_VALUE_FIELD_ID = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4'`
- **Paginação:** Automática com `page=0, 1, 2...` e `include_closed=true`
- **Valores monetários:** Enviados em centavos (`valorLimpo × 100`)

### Supabase
- **Configuração:** URL e Anon Key armazenadas no `localStorage` do navegador
- **Headers:** Função `getSupabaseHeaders()` lê do localStorage
- **Tabelas principais:** `propostas`, `itens_proposta`, `produtos`, `distribuidores`, `vendedores`
- **Funções RPC:** `gerar_nova_versao` (clona proposta com nova versão letra)
- **Estado atual:** `.env` não configurado no ambiente de dev → Supabase não conectado

---

## 8. Como Retomar o Desenvolvimento

### Workflow de Desenvolvimento
```bash
# 1. Editar o arquivo FONTE
# (editar app.js)

# 2. Recompilar JavaScript (OBRIGATÓRIO após editar)
npx esbuild app.js --bundle=false --outfile=dist/app.js --platform=browser --format=esm --loader:.js=jsx

# 3. Recompilar CSS (apenas se editar styles.css)
npx @tailwindcss/cli -i styles.css -o dist/styles.css

# 4. Iniciar o servidor
python3 server.py

# 5. Testar no navegador
# http://127.0.0.1:8000
```

---

## 9. Bugs Conhecidos e Pontos de Atenção

| Situação | Status | Detalhe |
|---|---|---|
| Crash do Forecast (tela preta) | ✅ Corrigido | `getSafeStageName()` resolve o crash de objetos em stage_name/status. Build já aplicado. |
| `.env` ausente | ⚠️ Pendente | Supabase não conecta sem o arquivo `.env` configurado |
| Versão em cache no navegador | ⚠️ Atenção | O HTML usa `?v=6.5` como cache buster. Incrementar se necessário. |
| `SUPABASE_URL presente? False` | ℹ️ Normal | Aparece sempre no boot do servidor sem `.env`. |
| Erros 400 "HEALED FAILED" | ⚠️ Monitorar | Algumas chamadas à API ClickUp retornam 400 durante sincronização. O servidor tenta recuperar automaticamente. |

---

## 10. Próximos Passos Sugeridos

1. **Verificar o Forecast visualmente** — confirmar se os valores e o funil renderizam corretamente após a correção do crash.
2. **Configurar o `.env`** com as credenciais do Supabase para habilitar o módulo de propostas.
3. **Testar o Drawer de detalhes** — ao clicar em um card do Kanban, o drawer deve abrir com histórico de propostas do Supabase.
4. **Automatizar o build** — criar um script `build.sh` ou adicionar um script `"build"` ao `package.json`.
5. **Incrementar o cache buster** no `index.html` (`?v=6.6`) após grandes mudanças.
6. **Testar o fluxo completo de proposta:** Criar → adicionar itens → selecionar → marcar como ganha → verificar sincronização no ClickUp.

---

## 11. Arquivos de Referência

| Arquivo | Propósito |
|---|---|
| `app.js` | Fonte principal React (EDITAR AQUI) |
| `dist/app.js` | Compilado pelo esbuild (NÃO EDITAR DIRETAMENTE) |
| `index.html` | Entrypoint HTML — carrega dist/app.js |
| `server.py` | Servidor HTTP + Proxy ClickUp/Supabase |
| `styles.css` | Fonte CSS (Tailwind input) |
| `Resumo_1.md` | Contexto e correções da fase anterior do projeto |
