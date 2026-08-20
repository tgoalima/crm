# Pendências e próximos passos

> Registro do que ficou pra depois e por quê — pra retomar sem perder o
> contexto. Atualizado em 20/08/2026, no meio da execução do plano de
> performance/premium (`.claude/plans/foamy-toasting-harp.md`).

## 1. Bloqueado pela migração de VM (planejada pra ~2 semanas a partir de hoje)

Itens que fazem mais sentido configurar **depois** da migração, direto na
infraestrutura definitiva, pra não fazer o trabalho duas vezes.

### 1.1 Itens de infraestrutura que precisam ser recriados na VM nova
Nenhum desses é código versionado — são configurações feitas direto na VPS
atual, então **não migram sozinhos** junto com o `git pull`:
- **Cron do backup do Postgres** (`scripts/backup_postgres.sh`, roda todo dia
  às 4h). O script em si está no repo, só falta recriar a entrada no
  crontab da VM nova: `crontab -e` → `0 4 * * * /caminho/scripts/backup_postgres.sh >> /caminho/backup.log 2>&1`.
- **nginx-proxy-manager** (SSL + roteamento de `crm.llworkflow.com.br`,
  `supabase.llworkflow.com.br` etc. pra dentro dos containers) — precisa
  reconfigurar os proxy hosts na ferramenta nova (ou reapontar DNS se for
  manter o mesmo nginx-proxy-manager só mudando de IP).
- **`.env`** (raiz do projeto e o `.env` do stack Supabase self-hosted) —
  tem todos os segredos (`SUPABASE_SERVICE_ROLE_KEY`, `CLICKUP_API_TOKEN`,
  `TOKEN_ENCRYPTION_KEY`, `MCP_AUTH_KEY`, senha do Postgres, JWT secrets).
  Nunca está no git (propositalmente) — precisa ser copiado com segurança
  pra VM nova, não regenerado do zero (regenerar quebraria sessões/tokens
  já emitidos).
- **PAT do GitHub** embutido no remote da VM (`git remote -v`) — a VM nova
  vai precisar do seu próprio, mesmo processo que já fizemos pra VM atual.
- **Docker volumes do Supabase self-hosted** (Postgres data, storage) —
  isso é a migração em si, óbvio, mas registrando que não é só "subir os
  containers" — precisa migrar o volume de dados de verdade (dump/restore
  do Postgres, ou copiar o volume inteiro).

### 1.2 Fase 2 — Confiabilidade e Observabilidade (itens 2 e 3)
- **Item 1 (health-check) já está pronto e no ar** — `/health`, testado,
  commitado. Esse migra de graça (é só código).
- **Item 2 — Monitoramento externo (UptimeRobot ou similar)**: não faz
  sentido configurar apontando pra VPS que vai ser trocada. Fazer depois da
  migração, apontando pro domínio já na VM nova (se o domínio continuar o
  mesmo, nem precisa reconfigurar depois — só fazer uma vez já na infra
  final).
- **Item 3 — Alerta de sincronização falha** (`sync_status='failed'` sem
  ninguém notar): precisa de (a) um job agendado (cron do Postgres/Supabase
  ou Edge Function com scheduler) — infra-específico, mesma lógica do
  backup acima — e (b) decidir o canal (e-mail via Resend, recomendado; ou
  WhatsApp, mais trabalhoso). Nenhuma decisão tomada ainda sobre o canal.

## 2. Fase 3 — Funcionalidades "premium" (não bloqueado pela migração, só não deu tempo ainda)

Já entregue: exportação CSV (simples + completa/com produtos) na Lista de
Negócios.

Ordem sugerida no plano original (`.claude/plans/foamy-toasting-harp.md`),
maior valor/menor esforço primeiro:
1. **Busca global** — campo no header consultando negocios/contas/
   contatos/propostas em paralelo, resultados agrupados por tipo.
2. **Trilha de auditoria mínima** — tabela `historico_alteracoes`
   (entidade, campo, valor antigo/novo, usuário, timestamp), populada nos
   pontos que já mudam estado hoje (mudança de estágio, responsável, etc.)
3. **RBAC básico — só pra ações administrativas, nunca pra visibilidade.**
   Importante: nessa empresa não existe carteira de conta por vendedor
   (todo mundo atende todo mundo) — pipeline e contas continuam visíveis
   pra todos, sempre. O RBAC aqui seria só um campo `role` em
   `usuarios_clickup` pra travar ações como excluir proposta ou editar
   catálogo de produtos/distribuidores, nada de filtro de "meus negócios".
4. **Ações em massa** — multi-select em Kanban/Empresas/Tarefas pra
   atribuir/excluir/mudar status em lote.
5. **Notificações in-app** — fila de toasts pra eventos relevantes (não só
   confirmação da própria ação) + indicador de negócios parados há N dias.
6. **Responsividade mobile** — pelo menos Kanban com scroll horizontal +
   fallback em cards pras tabelas de Configurações.
7. **Onboarding/empty states com CTA** — trocar "Nenhum dado encontrado"
   por uma chamada de ação relevante por aba.
8. **Remover a aba `propostas` órfã** (`app.js`, rota morta do app
   original de "Gerador de Propostas", sem botão de navegação — só
   acessível via hash `#propostas`).

## 3. Outras pendências menores encontradas ao longo do caminho

- **Aba Empresas carrega devagar na primeira visita da sessão** (4 tabelas
  em paralelo, ~2.264 linhas somadas — `contas`+`negocios`+`propostas`+
  `contatos`). Não é bug, é o volume real; já é o mais otimizado possível
  sem mudar a estratégia (lazy-load/paginação/virtualização — mais esforço
  do que compensava no momento). Ficou de "revisitar com calma".
- **`supabase/functions/mcp-brain/clickup.ts` e `tools.ts`** — durante a
  auditoria de 20/08 achamos que o código rodando no container de produção
  diverge do que está versionado no repo (drift não documentado, mesmo
  padrão já visto outras vezes no projeto). Não mexemos nisso — baixo risco
  (é só a integração ClickUp Brain/MCP, não afeta o CRM em si), mas vale
  reconciliar em algum momento pra não perder rastro do que está rodando
  de verdade.
- **Item 2 da Fase 1 (filtro de data no servidor) foi implementado e
  validado** apesar do risco inicial — ver commits `f892289`/`1c6669c` — só
  `propostas` foi filtrada no servidor; `itens_proposta` continua sem
  filtro (esbarrou em limitação real do PostgREST/tamanho de URL,
  documentado no commit — resolver direito exigiria uma função no banco via
  RPC, não compensa pra 1.266 linhas hoje).
