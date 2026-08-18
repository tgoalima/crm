# 📋 Resumo Consolidado — Arquitetura, Infraestrutura e Handover do CRM Suprimática

> **Como usar este documento:** Este arquivo é a fonte única de verdade sobre a arquitetura, banco de dados, integrações e histórico do CRM Suprimática. Cole este arquivo no contexto inicial de qualquer IA ou desenvolvedor para total alinhamento sobre o projeto.

---

## 1. Visão Geral da Arquitetura

- **Nome da Aplicação:** SPA Gestão Comercial Suprimática (CRM / Gerador de Propostas).
- **Ambientes de Uso:**
  1. **Web Direto / Embedded no ClickUp:** Acessível publicamente em `https://crm.llworkflow.com.br` (embarcado como View / iframe dentro de tarefas do ClickUp ou standalone).
  2. **Ambiente Local (Desenvolvimento):** Servido por `server.py` (Python `http.server` multi-thread na porta 8080) que emula proxy e variáveis locais.
- **Frontend:**
  - **Framework:** React 18 + Babel Standalone via CDN (sem bundler Webpack/Vite — compilação rápida em runtime).
  - **Módulos:**
    - `app.js`: Script central (~9500 linhas) contendo Kanban de Deals, Relatórios Financeiros/Forecast, Gerador de Propostas Comerciais, Tarefas Comerciais e Autenticação.
    - `empresas.js`: Módulo Empresa 360º (Gestão de Contas, Ficha 360º, Contatos vinculados, Oportunidades com R.O., Segmentos de Atuação).
    - `index.html`: Shell da SPA com cache-busters dinâmicos (`?v=X.X`).
  - **Estilização:** Tailwind CSS v4 com compilação estática (`dist/styles.css` gerado via `npx @tailwindcss/cli -i ./styles.css -o ./dist/styles.css`).
- **Banco de Dados (Fonte da Verdade):** Supabase (PostgreSQL), **self-hosted** na VPS em `https://supabase.llworkflow.com.br`.
- **Backend / Microsserviços:** Supabase Edge Functions (Deno) rodando em container Docker na mesma VPS.
- **CRM de Origem (Histórico):** Agendor (dados de 2023–2026 de negócios ganhos e perdidos migrados para o Supabase).
- **Gestão de Tarefas e Oportunidades:** ClickUp (Workspace Suprimática — Lista de Negócios, Contas, Contatos e Projetos).

---

## 2. Infraestrutura de Servidor e Deploy (VPS Self-Hosted)

O Supabase e a SPA rodam em uma **VPS Ubuntu dedicada** sob Docker Compose.

### Estrutura de Diretórios na VPS:
- `/home/ubuntu/apps/suprimatica-crm/`: Repositório do Frontend SPA (servido pelo Nginx na porta `8085`).
- `/home/ubuntu/apps/supabase/docker/`: Instância oficial self-hosted do Supabase.
- `/home/ubuntu/apps/supabase/docker/volumes/functions/`: Volume montado no container `supabase-edge-functions` (`/home/deno/functions`).
- `/home/ubuntu/apps/nginx-proxy-manager/`: Reverse Proxy que gerencia certificados SSL (Let's Encrypt) e roteia `https://crm.llworkflow.com.br` e `https://supabase.llworkflow.com.br`.

### Containers Principais:
1. `deploy-frontend-spa-1` (`nginx:alpine` na porta `8085`):
   - Serve o frontend compilado.
   - Fornece o endpoint nativo `/api/config` com a URL e `anon_key` do Supabase.
   - Atua como proxy reverso para `/clickup-api/` repassando o cabeçalho `Authorization` do usuário logado.
2. `supabase-edge-functions` (`supabase/edge-runtime:v1.74.0`):
   - Router central `main` (`volumes/functions/main/index.ts`) que despacha chamadas `/functions/v1/<nome>`.
   - Executa as Edge Functions com timeout de 60s.
3. `supabase-db` (`supabase/postgres`):
   - Banco de dados PostgreSQL 15 com extensões (`pg_trgm`, `pg_net`, `pg_graphql`).

### Variáveis de Ambiente no Servidor (`/home/ubuntu/apps/supabase/docker/.env`):
- `CLICKUP_API_TOKEN`: Token de contingência/serviço global do ClickUp.
- `TOKEN_ENCRYPTION_KEY`: Chave secreta de 256 bits para criptografia AES-GCM dos tokens pessoais dos vendedores.
- `MCP_AUTH_KEY`: Token de autorização para o ClickUp Brain consultar o servidor MCP.

---

## 3. Schema Completo do Banco de Dados (Supabase PostgreSQL)

### A. Tabelas de Vendas & CRM:
- **`contas` (Empresas/Clientes):**
  - `id` (UUID, PK), `clickup_account_id` (TEXT, unique), `nome`, `razao_social`, `cnpj`, `email`, `telefone`, `cep`, `rua`, `cidade`, `estado`, `industry` (segmento), `account_tier`, `billing_cycle`, `status`, `responsavel_nome`, `responsavel_clickup_id`, `criado_por_user_id`, `sync_status`, `sync_error`, `created_at`, `updated_at`.
- **`contatos` (Pessoas):**
  - `id` (UUID, PK), `conta_id` (FK → contas), `clickup_contact_id` (TEXT, unique), `nome`, `email`, `cargo`, `celular`, `whatsapp`, `champion` (BOOLEAN), `criado_por_user_id`, `sync_status`, `sync_error`, `created_at`, `updated_at`.
- **`negocios` (Oportunidades/Deals):**
  - `id` (UUID, PK), `clickup_negocio_id` (TEXT, unique), `nome`, `conta_id` (FK → contas), `estagio` (Registro, Qualificação, Proposta, Desenvolvimento, Negociação, Termo de aceite, Ganho, Perdido, Congelado), `numero_proposta_oficial` (Ex: `13205/2026`), `valor_clickup_fallback` (NUMERIC), `tipo_oportunidade`, `probabilidade`, `data_previsao`, `descricao`, `ro_infra`, `ro_sw1`, `ro_sw2`, `ro_sw3`, `ro_sw4`, `contato_principal_id`, `criado_por_user_id`, `sync_status`, `sync_error`, `created_at`, `updated_at`.
- **`propostas` (Versões de Orçamentos - vA, vB, etc.):**
  - `id` (UUID, PK), `clickup_negocio_id` (TEXT), `versao` (vA, vB, vC...), `cenario` (HCI, Tradicional, etc.), `situacao` (Ativa, Selecionada, Substituída, Desconsiderada, Ganho, Perdido), `total_proposta` (NUMERIC, gerido por trigger), `criado_por` (Nome do responsável), `criado_por_user_id` (ClickUp ID numérico do autor), `clickup_proposta_tecnica_id` (ID da tarefa técnica no ClickUp), `data_inicio`, `data_fechamento`, `motivo_perda`, `sync_status`, `sync_error`, `created_at`.
- **`itens_proposta` (Itens de Hardware/Software/Serviços):**
  - `id` (UUID, PK), `proposta_id` (FK → propostas), `produto_id` (FK → produtos), `distribuidor_id` (FK → distribuidores), `quantidade` (INT), `preco_unitario` (NUMERIC), `total_item` (GENERATED ALWAYS AS quantidade * preco_unitario).
- **`produtos` & `distribuidores`:**
  - Cadastros base de produtos (SKU, Nome, Fabricante, Custo) e Distribuidores.
- **`tarefas_comerciais` (Follow-ups Comerciais):**
  - `id` (UUID, PK), `proposta_id`, `clickup_subtask_id`, `clickup_negocio_id`, `titulo`, `tipo` (Ligação, Reunião, E-mail, Follow-up), `data_vencimento` (BIGINT timestamp), `responsavel_clickup_id`, `status` (pendente/concluida).

### B. Tabelas de Infraestrutura e Segurança:
- **`usuarios_clickup` (Cofre de Tokens Criptografados):**
  - `id` (UUID, PK), `user_email` (UNIQUE), `clickup_user_id` (UNIQUE), `username`, `encrypted_token` (AES-GCM base64), `iv` (base64), `created_at`, `updated_at`.
  - **RLS:** Habilitado sem policies para `anon`/`authenticated` — somente lido/escrito pela chave `service_role` nas Edge Functions.
- **`config_numeracao_propostas` (Sequenciador Atômico de Propostas):**
  - `id` (INT PK = 1), `ultimo_numero` (INT), `ativo` (BOOLEAN), `updated_at`.
  - Funções RPC atômicas: `gerar_numero_proposta()` e `ajustar_numeracao_proposta(novo_numero, novo_ativo)`.

---

## 4. Atribuição por Usuário Real (Identidade no ClickUp)

### O Problema Resolvido:
Anteriormente, toda ação síncrona ou assíncrona feita no CRM era criada no ClickUp em nome de uma conta de serviço genérica global (`CLICKUP_API_TOKEN`).

### A Solução Implementada:
1. **Frontend:**
   - No login ou modal de perfil, o vendedor insere seu **Personal API Token (`pk_...`)**.
   - O token é salvo localmente no `localStorage` (`crm_user_clickup_token`) e no perfil (`crm_user_profile`).
   - Toda requisição HTTP da SPA para o proxy `/clickup-api/` inclui o header `Authorization: pk_...`.
   - O frontend dispara automaticamente `syncUserClickUpCredentialsToEdge` enviando o token para a Edge Function `save-clickup-credentials`.
2. **Criptografia na Edge Function:**
   - A Edge Function `save-clickup-credentials` recebe o token em texto puro, criptografa com **Web Crypto AES-GCM (256-bit)** usando `TOKEN_ENCRYPTION_KEY` e grava no cofre `usuarios_clickup`.
3. **Resolução Assíncrona em Background:**
   - As Edge Functions de sincronização (`sync-negocio-clickup`, `sync-contato-clickup`, `sync-proposta-tecnica-clickup`) importam `supabase/functions/_shared/resolve-token.ts`.
   - Elas leem `record.criado_por_user_id`, buscam o token pessoal descriptografado e realizam a chamada à API do ClickUp **com a identidade real do vendedor**. Se não houver token cadastrado, aplicam fallback transparente para o token global.

---

## 5. Módulo Empresa 360º (`empresas.js`)

- **Visão 360º de Contas:** Permite visualizar empresas, métricas consolidadas (Total em Pipeline, Negócios Fechados, Taxa de Conversão, Contatos Chave/Champions).
- **Criação Supabase-First & Assíncrona:**
  - O usuário cria Empresa, Contato ou Oportunidade no CRM.
  - O registro é inserido imediatamente no Supabase com `sync_status = 'pending'` e `criado_por_user_id`.
  - A interface fecha instantaneamente sem aguardar a latência do ClickUp.
  - Um Database Webhook (Trigger PostgreSQL via `supabase_functions.http_request`) dispara a Edge Function correspondente para criar a tarefa/contato/oportunidade no ClickUp em background e vinculá-la à Conta.
- **Campos Específicos de Negócios:**
  - Suporte a Registros de Oportunidade (R.O.) dos fabricantes Dell, Veeam, Fortinet, VMware e RedHat.
  - Campos de Probabilidade, Tipo de Oportunidade, Data de Fechamento e Contato Principal.

---

## 6. Automação "Enviar Proposta vX" & Vínculos Técnicos

- **Trigger de Proposta Técnica (`sync_proposta_tecnica_clickup_insert`):**
  - Ao criar uma versão inicial (`vA`) ou nova versão (`vB`, `vC`...) no Gerador de Propostas, a Edge Function `sync-proposta-tecnica-clickup` cria automaticamente uma subtarefa técnica `[Nome do Negócio] — Enviar Proposta vX` dentro da oportunidade no ClickUp, com os valores e com o vendedor como responsável.
  - O ID da subtarefa criada é salvo em `propostas.clickup_proposta_tecnica_id`.
- **Exclusão Limpa (`sync_proposta_tecnica_clickup_delete`):**
  - Se uma versão for excluída pelo CRM, a Edge Function remove automaticamente a subtarefa correspondente no ClickUp, evitando tarefas técnicas órfãs.

---

## 7. ClickUp Brain via MCP Server (`supabase/functions/mcp-brain/`)

Servidor **Model Context Protocol (MCP)** sobre HTTP/JSON-RPC 2.0 que permite ao ClickUp Brain (IA interna do ClickUp) consultar dados do CRM em linguagem natural com permissão de leitura.

### As 8 Ferramentas Expostas:
1. `buscar_proposta_por_negocio`: Retorna itens, valores e histórico de versões de uma oportunidade.
2. `listar_propostas_por_situacao`: Filtra propostas por estado (Ativa, Selecionada, Ganho, etc.).
3. `resumo_forecast`: Retorna o resumo consolidado do funil comercial em andamento.
4. `negocios_fechados`: Retorna totais e lista de negócios Ganhos, Perdidos ou Congelados com filtros de período.
5. `analise_por_fabricante`: Relatório de propostas e valores por fabricante.
6. `analise_por_distribuidor`: Relatório de propostas e valores por distribuidor parceiro.
7. `historico_cliente`: Histórico comercial completo de um cliente (todas as oportunidades e status).
8. `detalhes_versao_proposta`: Cruza os dados do Supabase com os comentários e status da tarefa técnica no ClickUp.

---

## 8. Frontend `app.js` — Regras de Negócio Importantes

1. **Prioridade de Valor do Negócio (`getOpportunityValue`):**
   `task.supabase_deal_value` → Proposta Selecionada → Proposta Ganho → Proposta Ativa → `valor_estimado` → Custom Field `Valor do negócio` do ClickUp.
2. **Validade Comercial Dinâmica:**
   - Baseada estritamente na data de fechamento planejada (`data_fechamento`).
   - Ocultada automaticamente em propostas e negócios com status **Ganho** ou **Perdido**.
3. **Resiliência Web / VPS:**
   - Todas as chamadas de tarefas comerciais (`fetchCommercialTasks`), atividades (`fetchAtividades`), conclusão (`toggleTaskStatus`) e exclusão (`handleDeleteTask`) consultam o Supabase diretamente com fallback seguro ao proxy do ClickUp.
4. **Cache-Busters:**
   - Sempre incrementar as versões em `index.html` ao alterar os arquivos:
     - `app.js?v=X.X`
     - `empresas.js?v=X.X`
     - `dist/styles.css?v=X.X`

---

## 9. Procedimento Padrão de Deploy

### 1. Atualizar Frontend na VPS:
```bash
# Na sua máquina local:
npx @tailwindcss/cli -i ./styles.css -o ./dist/styles.css
git add .
git commit -m "feat: sua alteração"
git push origin main

# Na VPS:
ssh suprimatica-vps "cd /home/ubuntu/apps/suprimatica-crm && git pull origin main && cd deploy && docker compose down && docker compose up -d"
```

### 2. Aplicar Migrations no Banco:
```bash
ssh suprimatica-vps "docker exec -i supabase-db psql -U postgres -d postgres" < "supabase/migrations/nome_da_migration.sql"
```

### 3. Atualizar Edge Functions na VPS:
```bash
ssh suprimatica-vps "cp -r /home/ubuntu/apps/suprimatica-crm/supabase/functions/* /home/ubuntu/apps/supabase/docker/volumes/functions/ && cd /home/ubuntu/apps/supabase/docker && docker compose up -d functions"
```
