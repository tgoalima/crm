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
   - Atua como proxy reverso para `/api/tarefas` e `/api/atividades`, repassando `Authorization` para as Edge Functions `api-tarefas`/`api-atividades` (ver nota abaixo).
2. `supabase-edge-functions` (`supabase/edge-runtime:v1.74.0`):
   - Router central `main` (`volumes/functions/main/index.ts`) que despacha chamadas `/functions/v1/<nome>`.
   - Executa as Edge Functions com timeout de 60s.
3. `supabase-db` (`supabase/postgres`):
   - Banco de dados PostgreSQL 15 com extensões (`pg_trgm`, `pg_net`, `pg_graphql`).

### Variáveis de Ambiente no Servidor (`/home/ubuntu/apps/supabase/docker/.env`):
- `CLICKUP_API_TOKEN`: Token de contingência/serviço global do ClickUp.
- `TOKEN_ENCRYPTION_KEY`: Chave secreta de 256 bits para criptografia AES-GCM dos tokens pessoais dos vendedores.
- `MCP_AUTH_KEY`: Token de autorização para o ClickUp Brain consultar o servidor MCP.

### Migração de `/api/tarefas` e `/api/atividades` para Edge Functions (19/08):
`server.py` (script Python local, usado só em desenvolvimento) sempre teve as rotas `/api/tarefas` (CRUD de tarefas comerciais) e `/api/atividades` (CRUD de comentários/atividades do negócio), mas **nunca rodou na VPS** — o domínio real que o usuário usa no dia a dia, `crm.llworkflow.com.br` (embutido como aba no ClickUp), nunca teve essas rotas: caíam no fallback da SPA e devolviam HTML em vez de JSON.
- Criadas as Edge Functions `api-tarefas` e `api-atividades`, portando fielmente a lógica de `server.py` (matching de proposta em 4 níveis + auto-provisionamento + autocura em `api-tarefas`; mesclagem com comentários nativos do ClickUp e menções rich-text em `api-atividades`).
- **Detalhe de roteamento do runtime:** o roteador interno das Edge Functions self-hosted remove o prefixo `/functions/v1/` do path, mas **não** remove o segmento com o nome da function — `req.url` dentro de `api-tarefas` para uma chamada a `.../functions/v1/api-tarefas/{id}/status` chega como `/api-tarefas/{id}/status`, não `/{id}/status`. As duas functions tratam isso extraindo o "tail" com dois `.replace()` separados.
- `deploy/nginx.conf` ganhou dois blocos `location` (`/api/tarefas`, `/api/atividades`) proxiando pra `https://supabase.llworkflow.com.br/functions/v1/api-tarefas`/`api-atividades`, repassando `Authorization` do mesmo jeito que o bloco `/clickup-api/` já fazia.
- **Bug pré-existente descoberto durante os testes (não relacionado à migração):** a tabela `atividades_negocio` nunca existiu no banco — nem `server.py` nem a nova Edge Function conseguiam gravar nela (erro real: `Could not find the table 'public.atividades_negocio' in the schema cache`). O recurso só "funcionava" porque o `GET` tem um fallback que mescla comentários nativos do ClickUp quando não encontra a linha correspondente no Supabase; nada nunca tinha sido persistido de fato. Corrigido com a migration `20260819b_atividades_negocio.sql`.
- Testado ponta a ponta pelo domínio real `crm.llworkflow.com.br` (não só `localhost:8000` na VPS): create/list/status/delete em tarefas, create/list/edit/delete em atividades — dados de teste limpos dos dois lados (Supabase + ClickUp) ao final de cada teste.

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
- **`atividades_negocio` (Comentários/Atividades do Negócio):**
  - `id` (UUID, PK), `clickup_negocio_id`, `clickup_comment_id`, `texto`, `data_execucao`, `created_at`, `updated_at`. Criada em 19/08 (migration `20260819b_atividades_negocio.sql`) — não existia antes, ver nota na seção 2.

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
   - As 4 Edge Functions de sincronização (`sync-negocio-clickup`, `sync-contato-clickup`, `sync-conta-clickup`, `sync-proposta-tecnica-clickup`) importam `supabase/functions/_shared/resolve-token.ts`.
   - Elas leem `record.criado_por_user_id`, buscam o token pessoal descriptografado e realizam a chamada à API do ClickUp **com a identidade real do vendedor**. Se não houver token cadastrado, aplicam fallback transparente para o token global.

### Revisão e correções (19/08):
Esta funcionalidade foi implementada em paralelo por duas sessões de IA sem coordenação (uma delas nesta branch, direto na `main`). Revisão encontrou e corrigiu:
- `sync-negocio-clickup` e `sync-contato-clickup` referenciavam `CLICKUP_API_TOKEN` sem declará-lo (removido na refatoração pro módulo compartilhado, guard de env vars esquecido) — **ReferenceError em 100% das criações de negócio/contato**. Corrigido.
- `save-clickup-credentials` confiava no `{user: {email, id}}` enviado pelo próprio cliente no corpo da requisição, sem validar o JWT de sessão — como o endpoint é público, qualquer requisição podia sobrescrever o token de outro vendedor. Corrigido: a identidade agora vem de `supabase.auth.getUser()` usando o JWT recebido, e o token do ClickUp é conferido na origem antes de salvar.
- `sync-conta-clickup` tinha uma implementação própria (duplicada, desatualizada) de `resolveClickUpToken` com nomes de coluna que não existem no schema real — a busca sempre falhava silenciosamente. Trocado para importar do mesmo `_shared/resolve-token.ts` que as outras 3 functions usam.
- Trigger duplicado em `propostas` (`sync_proposta_tecnica_clickup` + `sync_proposta_tecnica_clickup_insert`, ambos `AFTER INSERT` chamando a mesma function) fazia cada nova versão de proposta criar **duas** tarefas técnicas no ClickUp. Removido o mais antigo (migration `20260819a_fix_trigger_duplicado_proposta_tecnica.sql`).

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

Replica a automação que a equipe já usava via Google Apps Script antes do CRM existir — **decisão confirmada com o usuário em 19/08** depois de uma reescrita paralela ter mudado esse comportamento sem coordenação (ver abaixo).

- **Trigger de Proposta Técnica (`sync_proposta_tecnica_clickup_insert`):**
  - Ao criar uma versão (`vA`, `vB`, `vC`...) no Gerador de Propostas, a Edge Function `sync-proposta-tecnica-clickup` cria (ou reaproveita) uma **lista técnica** na pasta PRE-VENDAS/PROJETOS chamada `"{numero_proposta_oficial} - {nome_do_negócio}"`, e dentro dela cria a tarefa **"Enviar Proposta vX"** (`custom_item_id` = 1014, tipo "Técnico"), linkada de volta à tarefa do negócio.
  - **Autocorreção de versão:** antes de criar, checa a maior versão já existente na lista técnica; se um negócio legado (controlado manualmente pelo ClickUp antes do CRM) já estiver com o histórico à frente do que o CRM calculou, pula direto pra próxima letra depois da maior existente — e corrige `propostas.versao` no Supabase pra bater com o que foi usado de fato.
  - O ID da tarefa técnica criada é salvo em `propostas.clickup_proposta_tecnica_id` (idempotência: se o webhook disparar mais de uma vez pra mesma proposta, não cria uma segunda tarefa).
- **Exclusão Limpa (`sync_proposta_tecnica_clickup_delete`):**
  - Se uma versão for excluída pelo CRM, a Edge Function usa o `clickup_proposta_tecnica_id` salvo pra excluir diretamente a tarefa técnica correspondente no ClickUp — nunca apaga a lista técnica inteira, só a tarefa daquela versão.
- **Nota histórica (19/08):** uma reescrita paralela desta automação (feita sem coordenação, direto na `main`) trocou temporariamente esse design por criar a tarefa como **subtask do próprio negócio** (sem lista técnica, sem `custom_item_id`, sem a autocorreção de versão). Revisado e restaurado ao design original nesta data — o formato "lista técnica" é o que replica o Apps Script antigo e o que a equipe já está acostumada a usar.

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
