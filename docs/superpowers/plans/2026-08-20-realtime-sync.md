# Sincronização em Tempo Real (Kanban/Propostas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer mudanças de estágio de negócio, situação de proposta e itens/valor de proposta aparecerem em segundos (não em até 3 minutos) para qualquer outro usuário com o CRM aberto, usando Supabase Realtime.

**Architecture:** Supabase Realtime (`postgres_changes`) já disponível no stack self-hosted é habilitado para as tabelas `negocios`, `propostas` e `itens_proposta`. O navegador abre uma inscrição nessas 3 tabelas; qualquer evento recebido dispara — com debounce de 1.5s — a mesma função de refetch que o polling de 3 minutos já usa (`fetchAllData`), reaproveitando 100% da lógica de enriquecimento existente em vez de remontar estado manualmente a partir do payload do evento.

**Tech Stack:** `@supabase/supabase-js` v2 (já carregado via CDN no frontend), Supabase Realtime (Postgres logical replication), PostgreSQL self-hosted na VPS.

**Spec:** `docs/superpowers/specs/2026-08-20-realtime-sync-design.md`

## Global Constraints

- **Sem framework de testes automatizados neste repo** (confirmado: `package.json` só tem `esbuild`/`tailwindcss` como devDependencies, nenhum diretório de testes existe). Verificação é feita via comandos `curl`/`psql` diretos contra o banco/API e checagem manual no navegador — siga esse padrão, não introduza Jest/Vitest sem necessidade (YAGNI).
- **Não existe ambiente de staging.** Toda mudança de banco (migrations) e todo deploy de frontend vão direto pra produção (`crm.llworkflow.com.br` / `supabase.llworkflow.com.br`, self-hosted numa única VPS). Trate cada passo de aplicação/deploy como produção — confirme antes de rodar comandos destrutivos.
- **Migrations são aplicadas direto no Postgres da VPS**, não por `supabase db push` (não há Supabase CLI configurada neste ambiente): `ssh suprimatica-vps "docker exec supabase-db psql -U postgres -c \"<SQL>\""`. Ainda assim, crie o arquivo `.sql` em `supabase/migrations/` normalmente (é a documentação de histórico do projeto), e comite-o.
- **Deploy do frontend = git, não build-on-server.** O diretório servido (`/home/ubuntu/apps/suprimatica-crm` na VPS) é um `git clone` deste mesmo repositório (remote `https://github.com/tgoalima/crm.git`). `dist/app.js` é **pré-buildado e commitado no git** (a VPS não tem `npm`/`node` instalados) — sempre rode `npm run build:js` localmente e comite `dist/app.js`+`dist/app.js.map` junto com a mudança fonte, na mesma tarefa. Deploy = `git push` local seguido de `ssh suprimatica-vps "cd /home/ubuntu/apps/suprimatica-crm && git pull origin main"`.
- **Cache-busting:** sempre que `dist/app.js` mudar, incremente a query string de versão em `index.html` (`<script defer src="/dist/app.js?v=X.Y"></script>`) — sem isso, navegadores com cache agressivo podem continuar servindo a versão antiga.
- **Acesso SSH:** alias `suprimatica-vps` já configurado localmente (chave SSH, sem senha). Use-o para todos os comandos remotos deste plano.

---

## Task 1: Habilitar Supabase Realtime nas tabelas negocios/propostas/itens_proposta

**Files:**
- Create: `supabase/migrations/20260820d_enable_realtime_negocios_propostas.sql`

**Interfaces:**
- Produces: as 3 tabelas passam a emitir eventos `postgres_changes` (INSERT/UPDATE/DELETE) via Supabase Realtime para qualquer cliente inscrito com uma role que tenha SELECT liberado nelas (já é o caso hoje para `anon`/`authenticated` — confirmado, nenhuma mudança de RLS necessária).

- [ ] **Step 1: Confirmar o estado atual da publicação Realtime (baseline antes da mudança)**

Rode:

```bash
ssh suprimatica-vps "docker exec supabase-db psql -U postgres -c \"SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';\""
```

Esperado: `(0 rows)` — nenhuma tabela habilitada ainda. Se já houver linhas para `negocios`, `propostas` ou `itens_proposta`, pare e investigue antes de continuar (pode já ter sido aplicado antes).

- [ ] **Step 2: Escrever a migration**

Crie `supabase/migrations/20260820d_enable_realtime_negocios_propostas.sql`:

```sql
-- supabase/migrations/20260820d_enable_realtime_negocios_propostas.sql
--
-- Habilita Supabase Realtime (postgres_changes) nas 3 tabelas que o Kanban e
-- o editor de propostas usam como fonte de verdade — parte do projeto de
-- sincronização em tempo real (ver
-- docs/superpowers/specs/2026-08-20-realtime-sync-design.md). RLS dessas
-- tabelas já libera SELECT pra anon/authenticated (confirmado antes desta
-- migration via pg_policies), então não precisa de mudança de policy — só
-- adicionar as tabelas à publicação que o Realtime já usa por padrão.
ALTER PUBLICATION supabase_realtime ADD TABLE public.negocios, public.propostas, public.itens_proposta;
```

- [ ] **Step 3: Aplicar a migration direto no Postgres da VPS**

```bash
ssh suprimatica-vps "docker exec supabase-db psql -U postgres -c \"ALTER PUBLICATION supabase_realtime ADD TABLE public.negocios, public.propostas, public.itens_proposta;\""
```

Esperado: `ALTER PUBLICATION`.

- [ ] **Step 4: Verificar que as 3 tabelas estão agora na publicação**

```bash
ssh suprimatica-vps "docker exec supabase-db psql -U postgres -c \"SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;\""
```

Esperado: 3 linhas — `itens_proposta`, `negocios`, `propostas`.

- [ ] **Step 5: Verificar de ponta a ponta que um evento real chega via WebSocket (usando a mesma anon key que o frontend usa)**

Crie um diretório temporário e instale o cliente Supabase ali (não mexe no `package.json` do projeto):

```bash
mkdir -p /tmp/verify-realtime && cd /tmp/verify-realtime && npm init -y >/dev/null 2>&1 && npm install @supabase/supabase-js >/dev/null 2>&1
```

Crie `/tmp/verify-realtime/verify.mjs`:

```javascript
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_KEY;
if (!url || !anonKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_KEY no ambiente antes de rodar.');
  process.exit(2);
}

const client = createClient(url, anonKey);
let received = false;

client
  .channel('verify-realtime-manual-check')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'negocios' }, (payload) => {
    console.log('EVENT RECEIVED:', JSON.stringify(payload.new).slice(0, 200));
    received = true;
  })
  .subscribe((status) => {
    console.log('Subscription status:', status);
  });

setTimeout(() => {
  console.log(received ? 'RESULT: PASS' : 'RESULT: FAIL (nenhum evento em 12s)');
  process.exit(received ? 0 : 1);
}, 12000);
```

Rode em background e, 3 segundos depois, force um UPDATE real (no-op de valor — regrava o mesmo `estagio` que já existe, então não muda dado nenhum, só dispara o evento de replicação):

```bash
cd "/Users/thiagolima/Documents/Antigravity/Suprimatica/SPA Gestão Comercial Suprimatica" && source .env
(cd /tmp/verify-realtime && SUPABASE_URL="$SUPABASE_URL" SUPABASE_KEY="$SUPABASE_KEY" node verify.mjs) &
sleep 3
NEGOCIO_ID=$(curl -s "$SUPABASE_URL/rest/v1/negocios?select=id,estagio&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import json,sys; r=json.load(sys.stdin)[0]; print(r['id'])")
ESTAGIO=$(curl -s "$SUPABASE_URL/rest/v1/negocios?id=eq.$NEGOCIO_ID&select=estagio" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['estagio'])")
curl -s -X PATCH "$SUPABASE_URL/rest/v1/negocios?id=eq.$NEGOCIO_ID" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "{\"estagio\": \"$ESTAGIO\"}" > /dev/null
wait
```

Esperado: a saída do `node verify.mjs` mostra `Subscription status: SUBSCRIBED`, depois `EVENT RECEIVED: ...` e por fim `RESULT: PASS`.

Se o resultado for `FAIL`: confira primeiro se o `SUPABASE_KEY` no `.env` é a **anon key** (não a service role) — o teste precisa simular exatamente o que o navegador usa; depois reconfira o Step 4.

- [ ] **Step 6: Limpar o ambiente de verificação temporário**

```bash
rm -rf /tmp/verify-realtime
```

- [ ] **Step 7: Commit**

```bash
cd "/Users/thiagolima/Documents/Antigravity/Suprimatica/SPA Gestão Comercial Suprimatica"
git add supabase/migrations/20260820d_enable_realtime_negocios_propostas.sql
git commit -m "feat: habilita Supabase Realtime em negocios/propostas/itens_proposta"
git push origin main
```

---

## Task 2: Inscrição Realtime + refetch debounced no frontend

**Files:**
- Modify: `app.js:4454` (imediatamente após o `useEffect` do polling de 3 minutos, antes da declaração de `loadPropostas`)
- Modify: `index.html` (bump da versão de cache-busting de `dist/app.js`)
- Modify (gerado pelo build, não editar à mão): `dist/app.js`, `dist/app.js.map`

**Interfaces:**
- Consumes: `fetchAllData(silent: boolean)` (já existe, `app.js:4419`) — dispara os refetches corretos conforme a aba ativa; `session` e `supabaseClient` (estado React já existente, `app.js:1498` e `app.js:1500`).
- Produces: nenhuma interface nova consumida por outro código — é um efeito de borda (assinatura + side-effect de refetch).

- [ ] **Step 1: Confirmar o ponto de inserção exato**

Rode:

```bash
cd "/Users/thiagolima/Documents/Antigravity/Suprimatica/SPA Gestão Comercial Suprimatica"
sed -n '4444,4456p' app.js
```

Esperado, confirmando que nada mudou de lugar desde a escrita deste plano:

```javascript
  useEffect(() => {
    if (!session) return;

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        fetchAllData(true);
      }
    }, 180000);

    return () => clearInterval(intervalId);
  }, [session, dbConnected, clickupTaskId, supabaseClient]);

  const loadPropostas = async (targetId = null, silent = false) => {
```

Se os números de linha divergirem, localize o mesmo trecho por busca de texto (`if (!document.hidden) {`) em vez de confiar no número absoluto.

- [ ] **Step 2: Inserir o efeito de assinatura Realtime**

Insira o bloco abaixo **logo depois** da linha `}, [session, dbConnected, clickupTaskId, supabaseClient]);` (fim do `useEffect` do polling) e **antes** de `const loadPropostas = async (targetId = null, silent = false) => {`:

```javascript
  // Realtime: além do polling de 3 em 3 minutos acima (mantido como rede de
  // segurança), assina mudanças ao vivo nas 3 tabelas que Kanban/Propostas
  // usam como fonte de verdade, pra refletir a mudança de outro usuário em
  // segundos em vez de esperar o próximo ciclo do polling. O handler só
  // dispara o mesmo fetchAllData(true) do polling — silent=true já passa
  // pelas guardas existentes (itensRef/propostaDirtyRef) contra sobrescrever
  // edição em andamento. Ver docs/superpowers/specs/2026-08-20-realtime-sync-design.md.
  const realtimeDebounceRef = useRef(null);
  useEffect(() => {
    if (!session || !supabaseClient) return;

    const scheduleRefresh = () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        fetchAllData(true);
      }, 1500);
    };

    const channel = supabaseClient
      .channel('crm-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'negocios' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'propostas' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_proposta' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabaseClient.removeChannel(channel);
    };
  }, [session, supabaseClient]);

```

- [ ] **Step 3: Build local do bundle**

```bash
cd "/Users/thiagolima/Documents/Antigravity/Suprimatica/SPA Gestão Comercial Suprimatica"
npm run build:js
```

Esperado: saída sem erros do `esbuild`, terminando em `⚡ Done in ...ms` duas vezes (empresas.js e app.js).

- [ ] **Step 4: Confirmar que o bundle novo contém o canal Realtime**

```bash
grep -c "postgres_changes" dist/app.js
```

Esperado: `3` (uma ocorrência por `.on(...)` — nomes de variável são minificados, mas a string literal `postgres_changes` não muda).

- [ ] **Step 5: Bump da versão de cache-busting em index.html**

Abra `index.html`, localize a linha:

```html
  <script defer src="/dist/app.js?v=59.5"></script>
```

Incremente o número para `59.6`:

```html
  <script defer src="/dist/app.js?v=59.6"></script>
```

(Se o número atual no arquivo for diferente de `59.5` quando você chegar aqui, incremente a partir do que estiver lá — não sobrescreva com `59.6` às cegas.)

- [ ] **Step 6: Commit e push**

```bash
git add app.js index.html dist/app.js dist/app.js.map
git commit -m "feat: assina Supabase Realtime pra refletir mudanças de outros usuários em segundos"
git push origin main
```

Nota: `dist/` está no `.gitignore` mas os 2 arquivos já são rastreados no repo (foram adicionados com `-f` antes) — `git add` normal já funciona pra eles porque um arquivo já rastreado não é reafetado pelo gitignore. Se o Git reclamar "ignored by .gitignore", use `git add -f dist/app.js dist/app.js.map`.

- [ ] **Step 7: Deploy — atualizar a VPS**

```bash
ssh suprimatica-vps "cd /home/ubuntu/apps/suprimatica-crm && git pull origin main"
```

Esperado: `Fast-forward`, listando `app.js`, `index.html`, `dist/app.js`, `dist/app.js.map` como alterados.

- [ ] **Step 8: Confirmar que o site está servindo o bundle novo (sem cache intermediário desatualizado)**

```bash
curl -s "https://crm.llworkflow.com.br/dist/app.js?v=59.6" | md5
ssh suprimatica-vps "md5sum /home/ubuntu/apps/suprimatica-crm/dist/app.js"
```

(Ajuste `?v=59.6` pro número real que você usou no Step 5.) Esperado: os dois hashes MD5 são idênticos.

- [ ] **Step 9: Verificação manual — duas sessões de navegador**

Este é o teste de aceitação do recurso (não dá pra automatizar sem um navegador real):

1. Abra `https://crm.llworkflow.com.br` em duas janelas/abas diferentes, logadas (pode ser a mesma conta nas duas, ou uma normal + uma anônima/privada).
2. Em ambas, vá pra aba **Kanban**.
3. Numa das janelas, arraste um card de negócio pra outra coluna.
4. Na OUTRA janela, confirme que o card se move sozinho pra nova coluna em até ~2 segundos, sem precisar dar F5.
5. Abra a mesma proposta nas duas janelas. Numa delas, comece a editar o campo "Data de Fechamento" mas **não clique em Salvar**. Na outra janela, mude a situação dessa proposta (ex: marque como Ganho, preenchendo a data de fechamento pelo fluxo normal). Confirme que a janela que estava editando **não perde o que estava digitado** (a proteção `propostaDirtyRef` segura o refetch até você salvar ou navegar pra outro lugar).
6. Abra o DevTools (F12) → aba Network → filtre por "WS" (WebSocket) numa das janelas. Confirme que existe uma conexão WebSocket aberta pra `supabase.llworkflow.com.br` com status 101 (Switching Protocols) — evidência de que a inscrição Realtime está de fato ativa.
7. Ainda no DevTools, aba Network → marque "Offline" (simula perda de conexão). Espere ~10s, desmarque "Offline". Confirme que a conexão WebSocket é restabelecida sozinha (aparece uma nova entrada 101 na aba Network) e que uma mudança feita por você em outra aba/janela durante a queda aparece — se não imediatamente ao reconectar, no mais tardar no próximo ciclo do polling de 3 minutos (rede de segurança).

Se qualquer um desses passos falhar, volte pro Step 2 (revisar o código do efeito) antes de seguir.

- [ ] **Step 10: Registrar a entrega em docs/pendencias.md**

Edite `docs/pendencias.md` removendo (ou marcando como concluído) qualquer menção pendente à sincronização em tempo real, já que este plano a implementa. Se não houver menção existente (é um item novo, não estava na lista antiga), pule este passo.
