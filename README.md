# Gerador de Propostas Comerciais com Versionamento - Suprimática CRM

Esta aplicação é um widget híbrido embarcável (via Iframe/Embed View) dentro do ClickUp CRM. Ela possibilita que os vendedores criem, editem, comparem e versionem propostas comerciais para um negócio do CRM, além de sincronizar automaticamente os valores finais com o ClickUp e bloquear o fechamento do negócio caso não exista exatamente uma proposta selecionada.

---

## 🏗️ Arquitetura e Estrutura do Projeto

A solução foi projetada sob uma arquitetura de baixo custo e alta performance:
- **Banco de Dados**: Supabase (PostgreSQL) com triggers nativas para integridade transacional, recalculando o valor total de propostas e garantindo a unicidade de propostas selecionadas.
- **Frontend SPA**: React 18 e Tailwind CSS carregados via CDN (sem necessidade de compilação local, ideal para hospedar em CDNs estáticas como Vercel, Netlify ou GitHub Pages).
- **Integração ClickUp**: Duas Supabase Edge Functions que realizam a ponte segura (com credenciais ocultas no backend) com as APIs do ClickUp.

```
📁 /
├── 📁 supabase/
│   ├── 📁 migrations/
│   │   ├── 📄 20260527_init.sql      # Estrutura do banco, triggers e funções PL/pgSQL
│   │   ├── 📄 20260527_evolution.sql # Evolução do banco (remoção de SKU e distribuidores)
│   │   └── 📄 20260527_seed.sql      # Produtos de exemplo (sem SKU)
│   └── 📁 functions/
│       ├── 📁 sync-clickup-value/    # Sincroniza o valor da proposta no custom field do ClickUp
│       │   └── 📄 index.ts
│       ├── 📁 clickup-status-webhook/ # Valida se há 1 proposta selecionada ao fechar como Ganho
│       │   └── 📄 index.ts
│       ├── 📁 get-clickup-task/      # Proxy seguro para puxar contexto de tarefas do ClickUp
│       │   └── 📄 index.ts
│       ├── 📁 sync-negocio-clickup/  # Empresa 360º: espelha negócio criado na SPA pro ClickUp (async)
│       │   └── 📄 index.ts
│       ├── 📁 sync-contato-clickup/  # Empresa 360º: espelha contato criado na SPA pro ClickUp (async)
│       │   └── 📄 index.ts
│       └── 📁 mcp-brain/             # Servidor MCP: expõe o banco ao ClickUp Brain (somente leitura)
│           ├── 📄 index.ts           # Protocolo MCP (JSON-RPC): initialize / tools.list / tools.call
│           ├── 📄 tools.ts           # As 7 tools (propostas, forecast, fabricante, cliente, etc.)
│           ├── 📄 clickup.ts         # Resolução de cliente via lista "Contas" do ClickUp
│           └── 📄 supabase.ts        # Cliente Supabase (anon key, somente leitura)
├── 📄 index.html                     # Entrypoint do frontend SPA
├── 📄 styles.css                     # Estilos customizados, glassmorphism e timeline
├── 📄 app.js                         # Interface interativa e lógica React (Babel runtime)
└── 📄 empresas.js                    # Aba Empresas / Ficha 360º (Contas, Contatos, Negócios)
```

---

## 🚀 Passo a Passo de Instalação e Deploy

### 1. Configuração do Banco de Dados (Supabase)

1. Acesse o painel do seu projeto no **Supabase** e navegue até o **SQL Editor**.
2. Crie uma nova query, copie o conteúdo de [20260527_init.sql](supabase/migrations/20260527_init.sql) e clique em **Run**.
3. Crie uma segunda query, copie o conteúdo de [20260527_evolution.sql](supabase/migrations/20260527_evolution.sql) e clique em **Run** para evoluir a modelagem (remover SKU e criar distribuidores).
4. Crie uma terceira query, copie o conteúdo de [20260527_seed.sql](supabase/migrations/20260527_seed.sql) e clique em **Run** para carregar os produtos padrão sem SKU.
5. **Empresa 360º (Contas/Contatos/Negócios + numeração interna de propostas)** — rode em ordem: [20260817_contas_contatos.sql](supabase/migrations/20260817_contas_contatos.sql), [20260817b_negocios.sql](supabase/migrations/20260817b_negocios.sql), [20260817c_negocios_contas_authenticated.sql](supabase/migrations/20260817c_negocios_contas_authenticated.sql), [20260818_negocios_contatos_sync_numeracao.sql](supabase/migrations/20260818_negocios_contatos_sync_numeracao.sql), [20260818b_fix_grant_ajustar_numeracao.sql](supabase/migrations/20260818b_fix_grant_ajustar_numeracao.sql), [20260818c_fix_grant_public_ajustar.sql](supabase/migrations/20260818c_fix_grant_public_ajustar.sql). Cria as tabelas `contas`/`contatos`/`negocios`, as colunas de sync (`sync_status`/`sync_error`/`clickup_negocio_id`/`clickup_contact_id`) e o gerador interno de numeração de propostas (`config_numeracao_propostas` + RPCs `gerar_numero_proposta()`/`ajustar_numeracao_proposta()`).

---

### 2. Deploy das Edge Functions

Com o Supabase CLI instalado, execute os seguintes comandos no terminal:

```bash
# 1. Login na sua conta Supabase
supabase login

# 2. Link do projeto
supabase link --project-ref seu-project-ref-id

# 3. Deploy das funções para a nuvem do Supabase
supabase functions deploy sync-clickup-value
supabase functions deploy clickup-status-webhook
supabase functions deploy get-clickup-task

# 4. Empresa 360º — sincronização assíncrona Supabase → ClickUp
supabase functions deploy sync-negocio-clickup
supabase functions deploy sync-contato-clickup
```

#### Configuração de Segredos (Secrets) no Supabase:
Para que as funções consigam se comunicar de forma segura com o ClickUp e com o seu banco de dados, defina as variáveis de ambiente necessárias:

```bash
supabase secrets set CLICKUP_API_TOKEN="seu_token_pessoal_do_clickup"
supabase secrets set CLICKUP_CUSTOM_FIELD_ID="uuid_do_campo_customizado_de_valor_no_clickup"
supabase secrets set SUPABASE_URL="https://seu-projeto.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="sua_chave_service_role_do_supabase"
```

---

### 3. Configuração dos Webhooks

#### A. Database Webhook (Sincronização de Valor):
1. No dashboard do Supabase, acesse **Database** > **Webhooks**.
2. Clique em **Create a new webhook**.
3. Preencha as configurações:
   - **Name**: `sync_clickup_value`
   - **Table**: `propostas`
   - **Events**: Marque apenas **Update**.
   - **Webhook Service**: Selecione **Supabase Edge Functions**.
   - **Edge Function**: Selecione `sync-clickup-value`.
   - **Method**: `POST`.
4. Salve o webhook.

#### B. ClickUp Webhook (Trava de Segurança "Negócio Ganho"):
Para registrar o webhook do ClickUp apontando para a sua Edge Function pública `clickup-status-webhook`:
Execute uma requisição POST na API do ClickUp para criar o webhook (utilize o Postman, cURL ou o terminal):

```bash
curl -X POST https://api.clickup.com/api/v2/team/SEU_TEAM_ID/webhook \
  -H "Authorization: seu_token_pessoal_do_clickup" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://seu-projeto.supabase.co/functions/v1/clickup-status-webhook",
    "events": ["taskStatusUpdated"]
  }'
```

#### C. Database Webhook (Empresa 360º — sincronização de Negócios):
1. No dashboard do Supabase, acesse **Database** > **Webhooks**.
2. Clique em **Create a new webhook**.
3. Preencha as configurações:
   - **Name**: `sync_negocio_clickup`
   - **Table**: `negocios`
   - **Events**: Marque apenas **Insert**.
   - **Webhook Service**: Selecione **Supabase Edge Functions**.
   - **Edge Function**: Selecione `sync-negocio-clickup`.
   - **Method**: `POST`.
4. Salve o webhook. Sem isso, negócios criados pela SPA ficam presos em `sync_status='pending'` para sempre (a criação em si funciona normalmente — só a sincronização com o ClickUp em segundo plano depende deste webhook).

#### D. Database Webhook (Empresa 360º — sincronização de Contatos):
Mesmo processo do item C, com:
   - **Name**: `sync_contato_clickup`
   - **Table**: `contatos`
   - **Events**: apenas **Insert**.
   - **Edge Function**: `sync-contato-clickup`.
   - **Method**: `POST`.

---

## 🧠 Integração com o ClickUp Brain (MCP Server)

Expõe o banco Supabase (somente leitura) como um servidor MCP para o ClickUp Brain, permitindo que o diretor pergunte em linguagem natural sobre propostas, produtos, distribuidores e histórico de clientes.

### 1. Deploy da Function

```bash
supabase functions deploy mcp-brain
```

### 2. Segredos adicionais

```bash
supabase secrets set SUPABASE_ANON_KEY="sua_anon_key"
supabase secrets set MCP_AUTH_KEY="uma_chave_forte_gerada_por_voce"
# CLICKUP_API_TOKEN já deve estar configurado (usado pelas outras functions)
```

> A function usa a **anon key**, não a service_role — as tabelas consultadas (`propostas`, `itens_proposta`, `produtos`, `distribuidores`) já têm policy de SELECT liberada para o role `anon` (ver `supabase/migrations/20260712_enable_rls.sql`).

### 3. Configuração no ClickUp

1. **Workspace Settings** → **Apps** → **MCP Servers** → **Add Custom MCP Server**.
2. **Nome**: `Supabase CRM Suprimatica`.
3. **URL**: `https://seu-projeto.supabase.co/functions/v1/mcp-brain`.
4. **Header customizado**: `X-MCP-Key: <mesma chave definida em MCP_AUTH_KEY>`.
5. **Escopo**: defina quem no workspace pode usar o servidor (ex.: apenas o diretor, ou todos os membros).

### Tools disponíveis para o Brain

| Tool | Uso |
|---|---|
| `buscar_proposta_por_negocio` | "Detalhe da proposta do negócio X" |
| `listar_propostas_por_situacao` | "Quais são as propostas ativas?" |
| `resumo_forecast` | "Qual é o forecast atual?" |
| `analise_por_fabricante` | "Quais negócios temos com a Dell?" |
| `analise_por_distribuidor` | "Quanto passamos pela Ingram Micro?" |
| `historico_cliente` | "Qual é o histórico da Minerva?" |
| `ranking_clientes` | "Quais são nossos 10 maiores clientes?" |

`historico_cliente` e `ranking_clientes` resolvem o cliente pela lista **Contas** do ClickUp (não existe tabela `clientes`/`contas` no Supabase hoje), reaproveitando a mesma lógica de casamento de nomes de `scripts/migracao_agendor_perdidos.py`.

---

## 💻 Como Executar Localmente

Como o projeto é construído sem necessidade de build em Node.js (React nativo carregado via CDN), você pode usar o servidor HTTP embutido do Python:

```bash
# No diretório raiz do projeto, execute:
python -m http.server 8080 --bind 127.0.0.1
```

Abra no seu navegador:
- [http://127.0.0.1:8080](http://127.0.0.1:8080) (Versão autônoma)
- [http://127.0.0.1:8080/?task_id=seu-id-de-teste](http://127.0.0.1:8080/?task_id=seu-id-de-teste) (Simulando execução dentro do ClickUp para a tarefa/negócio informada)

*Nota: Ao abrir pela primeira vez, clique no ícone de engrenagem ⚙️ no canto superior direito para inserir a URL e Anon Key do seu projeto Supabase.*

---

## 🛠️ Embarcando no ClickUp CRM

Para disponibilizar a ferramenta diretamente no CRM para os vendedores:
1. Acesse qualquer tarefa no seu espaço de CRM do ClickUp.
2. Clique em **+ Add View** no menu superior da tarefa.
3. Escolha a opção **Embed** (Iframe).
4. Insira o link da sua SPA hospedada (ex: `https://sua-spa-crm.pages.dev/?task_id=${task_id}`).
   - *Dica*: O ClickUp substituirá automaticamente `${task_id}` pelo ID do card atual, fazendo com que o widget exiba apenas o histórico de propostas daquele negócio específico de forma automática e contextual!
