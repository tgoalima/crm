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
│       └── 📁 get-clickup-task/      # Proxy seguro para puxar contexto de tarefas do ClickUp
│           └── 📄 index.ts
├── 📄 index.html                     # Entrypoint do frontend SPA
├── 📄 styles.css                     # Estilos customizados, glassmorphism e timeline
└── 📄 app.js                         # Interface interativa e lógica React (Babel runtime)
```

---

## 🚀 Passo a Passo de Instalação e Deploy

### 1. Configuração do Banco de Dados (Supabase)

1. Acesse o painel do seu projeto no **Supabase** e navegue até o **SQL Editor**.
2. Crie uma nova query, copie o conteúdo de [20260527_init.sql](supabase/migrations/20260527_init.sql) e clique em **Run**.
3. Crie uma segunda query, copie o conteúdo de [20260527_evolution.sql](supabase/migrations/20260527_evolution.sql) e clique em **Run** para evoluir a modelagem (remover SKU e criar distribuidores).
4. Crie uma terceira query, copie o conteúdo de [20260527_seed.sql](supabase/migrations/20260527_seed.sql) e clique em **Run** para carregar os produtos padrão sem SKU.

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
