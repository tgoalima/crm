# Design: Sincronização em tempo real (Kanban, Propostas, Itens)

**Data:** 2026-08-20
**Status:** Aprovado para virar plano de implementação

## Contexto / Problema

Hoje o CRM atualiza os dados de outros usuários (mudança de estágio no Kanban,
status de proposta, itens/valor) só através de um polling silencioso a cada 3
minutos (`fetchAllData`, `app.js:4443`). Um usuário relatou ter visto, via
notificação do Teams, que um colega moveu um negócio de estágio dentro do
próprio Kanban do CRM — e essa mudança só apareceu na tela dele 3-5 minutos
depois.

Investigação confirmou: o Kanban não consulta o ClickUp para se popular — ele
lê exclusivamente do Supabase (`negocios`, `propostas`, `itens_proposta`), e o
Supabase já é gravado no instante em que qualquer usuário faz a mudança pelo
próprio CRM (`handleOpportunityStateChange`, `app.js:2540`, comentário "Supabase
é a fonte de verdade do estágio agora"). Ou seja, o dado já estava correto no
banco quase instantaneamente — o atraso observado foi inteiramente do lado do
navegador do segundo usuário, que só re-busca a cada 3 minutos.

Não há hoje nenhum caminho ClickUp → Supabase para mudanças feitas direto na
UI nativa do ClickUp (fora do CRM) — isso está fora do escopo deste projeto
(ver "Fora de escopo" abaixo).

## Objetivo

Quando um usuário muda estágio de negócio, situação de proposta, ou
itens/valor de proposta pelo CRM, todo outro usuário com o CRM aberto deve ver
essa mudança quase instantaneamente (tipicamente < 1s), sem depender de
esperar o próximo ciclo de polling.

## Escopo

Cobre atualização em tempo real para:
- `negocios.estagio` (mudança de coluna no Kanban)
- `propostas.situacao` / `data_fechamento` / `motivo_perda` / `total_proposta`
- `itens_proposta` (itens de uma proposta sendo editados)

## Fora de escopo (explicitamente)

- **Tarefas comerciais** (`tarefas_comerciais`) — não pedido pelo usuário
  nesta rodada; pode ser adicionado depois seguindo o mesmo padrão.
- **Sincronização ClickUp → Supabase para mudanças feitas fora do CRM** (ex:
  alguém muda o status direto na UI nativa do ClickUp, sem passar pela SPA).
  O caso relatado foi confirmado como mudança feita *dentro* do CRM — não
  exige tocar em webhooks do ClickUp. Se no futuro esse outro caso também
  precisar de tempo real, é um projeto separado (exigiria estender
  `clickup-status-webhook` para também escrever em `negocios.estagio`, hoje
  ele só valida/faz rollback do fechamento "Ganho").

## Arquitetura

**Mecanismo:** Supabase Realtime (`postgres_changes`), nativo do stack
self-hosted já rodando (`supabase-realtime` container confirmado ativo).
Funciona por replicação lógica do Postgres: o navegador abre um WebSocket
inscrito nas tabelas de interesse; qualquer INSERT/UPDATE/DELETE nelas é
emitido para todo cliente inscrito, na mesma sessão de escrita (tipicamente
sub-segundo).

**Pré-requisitos confirmados nesta investigação:**
- RLS das 3 tabelas (`negocios`, `propostas`, `itens_proposta`) já libera
  SELECT para `anon`/`authenticated` — nenhuma mudança de policy necessária.
- Nenhuma tabela está hoje na publicação `supabase_realtime` (confirmado via
  `pg_publication_tables` — 0 linhas). Precisa de uma migration:
  `ALTER PUBLICATION supabase_realtime ADD TABLE negocios, propostas, itens_proposta;`

**Fluxo de dados — decisão chave (aprovada com o usuário):** o evento
recebido via `postgres_changes` **não é usado diretamente para remontar o
card/proposta na tela**. Ele só dispara um **refetch direcionado e
debounced (~1-2s)** reaproveitando as funções que já existem hoje
(`fetchKanbanData(true)`, `loadPropostas(null, true)`). Motivo: essas funções
já fazem o enriquecimento (join negócio + melhor proposta + itens por
fabricante) que o payload cru do evento não traz sozinho: duplicar essa lógica
no handler do evento criaria dois caminhos de cálculo que podem divergir —
exatamente a classe de bug corrigida nesta sessão (trigger duplicado,
comparação de nome divergente). Reaproveitar o código já testado é mais
simples e mais seguro.

Debounce: se vários eventos chegarem em rajada (ex: alguém salva uma proposta
com 5 itens = várias linhas mudando em `itens_proposta`), agrupa numa única
chamada de refetch em vez de uma por evento.

**Proteção contra sobrescrever edição em andamento:** o refetch disparado
pelo Realtime é "silencioso" (`silent = true`), então passa pelas mesmas
guardas já implementadas hoje contra o polling: `itensRef` (itens não salvos)
e `propostaDirtyRef` (campos da proposta editados e não salvos, adicionado
nesta sessão para o bug da Data de Fechamento). Nenhuma guarda nova é
necessária — a proteção já existente cobre o caso, só passa a valer também
para os disparos vindos do Realtime, não só do polling de 3 minutos.

**Resiliência / fallback:** o polling de 3 minutos continua existindo,
inalterado. Se o WebSocket cair (rede instável, aba muito tempo em segundo
plano), o cliente `@supabase/supabase-js` já tenta reconectar sozinho; o
polling cobre a janela até a reconexão sem que o usuário perceba perda de
dados — só perde a "instantaneidade" temporariamente.

## Componentes tocados

- **Nova migration**: adiciona as 3 tabelas à publicação `supabase_realtime`.
- **`app.js`**: novo `useEffect` que abre um canal Realtime (subscribe nas 3
  tabelas) quando a sessão está pronta, com cleanup (unsubscribe) no
  unmount/troca de sessão — mesmo ciclo de vida do `useEffect` do polling
  hoje (`app.js:4436-4446`). O handler do evento só chama as funções de
  refetch já existentes, com debounce.
- Nenhuma mudança nas funções de fetch/enriquecimento existentes
  (`fetchKanbanData`, `loadPropostas`, `loadProposalDetails`) — só passam a
  ser chamadas com mais frequência (orientadas a evento, não só por
  temporizador).

## Testes planejados

- Duas sessões de navegador logadas (ou uma normal + uma anônima/privada):
  mudar estágio de um negócio numa, confirmar que aparece na outra em menos
  de ~2s.
  - Mesmo teste para mudar situação de proposta (Selecionada → Ganho) e para
    editar itens de uma proposta.
- Confirmar que a trava de edição em andamento (`propostaDirtyRef`) segura o
  refetch: abrir uma proposta, começar a editar Data de Fechamento sem
  salvar, disparar uma mudança em outra sessão que afetaria essa mesma
  proposta, confirmar que o campo em edição NÃO é sobrescrito.
- Simular perda de conexão (DevTools → Offline) e confirmar que o polling de
  3 minutos ainda funciona como rede de segurança quando volta a conexão.
