# Empresa 360º — Design

## Contexto

O SPA já traz `contas`/`contatos`/`negocios` do ClickUp pro Supabase (migração de 17/08), e o Kanban já lê/escreve nessas tabelas em vez de depender do ClickUp ao vivo. Falta uma tela pra ver e gerenciar essas Contas diretamente na SPA — hoje só existem no ClickUp. Essa é a Fase 3 (frontend) do plano de evolução do CRM: uma aba "Empresas" com lista + ficha 360º por conta, incluindo criação de negócio e contato diretamente pela SPA (invertendo o fluxo atual, onde tudo nasce no ClickUp).

Esse documento é o resultado de uma sessão de brainstorming com o usuário (17/08/2026) — decisões já tomadas e aprovadas estão marcadas como tal; não é uma lista de opções em aberto.

## Escopo desta entrega

**Dentro do escopo:**
- Aba "Empresas": lista com busca/filtros/métricas + Ficha 360º por conta (Visão Geral, Contatos, Oportunidades)
- Criação de Contato (dentro da Ficha 360º)
- Criação de Oportunidade/Negócio (dentro da Ficha 360º **e** um botão equivalente no Kanban)
- **Gerador interno de numeração de propostas** (Supabase, síncrono, substitui o Apps Script/planilha no caminho crítico) + tela de configuração (ligar/desligar, ajustar número manualmente)
- Sincronização assíncrona Supabase → ClickUp pra criação de negócio/contato (a numeração em si **não** é assíncrona — acontece na hora, dentro do Supabase)

**Fora do escopo (decisão explícita, não esquecimento):**
- Aba "Contatos" global/separada — contatos só aparecem dentro da Ficha 360º da conta por enquanto
- Edição/exclusão de conta ou contato existente
- Autocomplete de cliente no modal do Gerador de Propostas (fica pra depois)
- O Apps Script/planilha do Google **deixa de fazer parte do fluxo de criação** (decisão desta sessão, 17/08) — o número passa a ser gerado no Supabase. O script ajustado (`docs/apps_script_numeracao_proposta_ajustado.gs`) fica sem uso nesse fluxo; não precisa ser desativado, só não é mais chamado.
- Numeração de propostas propriamente ditas (`propostas`) — só a numeração do **negócio** (`negocios.numero_proposta_oficial`) entra aqui, porque é isso que faz sentido logicamente (acontece na criação do negócio, antes de existir qualquer proposta)

## Arquitetura

```
Empresas (lista) ──click──> Ficha 360º (drawer)
                                 ├─ Visão Geral
                                 ├─ Contatos ──[+ Adicionar Contato]──┐
                                 └─ Oportunidades ──[+ Nova Oportunidade]──┤
                                                                            │
Kanban (Pipeline de Vendas) ──[+ Nova Oportunidade]───────────────────────┤
                                                                            ▼
                                                    (só negócio) RPC gerar_numero_proposta()
                                                    — síncrono, dentro do Supabase, sem chamada externa
                                                                            │
                                                                            ▼
                                                              INSERT direto no Supabase
                                                              (negocios/contatos, sync_status='pending',
                                                               numero_proposta_oficial já preenchido)
                                                                            │
                                                          Database Webhook (INSERT)
                                                                            ▼
                                                    Edge Function nova (sync-negocio-clickup /
                                                    sync-contato-clickup): cria no ClickUp,
                                                    vincula à Conta, ESPELHA o número já gerado
                                                    pro custom field do ClickUp (não gera nada novo),
                                                    UPDATE do Supabase com os IDs reais + sync_status
```

A SPA nunca espera a sincronização com o ClickUp — grava no Supabase e segue. A numeração, porém, é **síncrona** (acontece na hora, junto com o INSERT do negócio, sem depender de nada externo) porque é 100% interna ao Supabase. O item aparece na tela na hora, já com número (se a numeração estiver ativa) e um selo "sincronizando..." enquanto `sync_status = 'pending'`.

## Componentes de frontend (`app.js`)

- **Nova aba "Empresas"** na barra de navegação superior.
- **`EmpresasListView`**: cards de métrica (Total de Empresas, Pipeline Aberto, Faturamento Histórico — mesma lógica de prioridade de proposta já usada no Kanban, extraída pra uma função compartilhada `resolveNegocioValor(negocio, propostasPorNegocio)`); busca por nome/CNPJ/cidade; filtros por Status e Tier; grid de cards.
- **`FichaEmpresaDrawer`**: reaproveita o padrão visual do drawer de negócio já existente. Abas: Visão Geral (endereço, segmento, ciclo de faturamento), Contatos (lista + botão Adicionar), Oportunidades (lista de negócios da conta, clicar abre o editor de proposta já existente via `handleCardClick`).
- **`NovaOportunidadeModal`**: componente único, chamado da Ficha 360º (conta pré-selecionada, campo travado) e de um botão novo na barra do Kanban (busca de conta). Campos: Nome do negócio + Conta. Estágio inicial fixo em "Registro", Tipo de Oportunidade fixo em "Projeto" (default), sem pedir valor.
- **`NovoContatoModal`** (ou form inline na aba Contatos): Nome, Cargo, Email, Celular, WhatsApp, Champion (checkbox).
- **Configurações → Numeração de Propostas** (nova seção na tela de configurações já existente, ⚙️ no topo): mostra o próximo número (`ultimo_numero + 1`), toggle **Ativo/Inativo**, campo pra sobrescrever `ultimo_numero` manualmente. Chama a RPC `ajustar_numeracao_proposta(novo_numero, novo_ativo)`.

Carregamento de dados: ao ativar a aba Empresas, busca `contas` + `negocios` + `propostas` do Supabase uma vez (mesmo padrão do `fetchKanbanData`), mantém em estado; a Ficha 360º filtra por `conta_id` sem nova busca. Contatos: busca todos de uma vez também (327 linhas, barato).

## Mudanças de schema

Nova migration (`supabase/migrations/20260818_negocios_contatos_sync_async.sql`):

```sql
ALTER TABLE public.negocios
  ALTER COLUMN clickup_negocio_id DROP NOT NULL,
  ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced', -- 'pending' | 'synced' | 'failed'
  ADD COLUMN sync_error TEXT,
  ADD COLUMN numero_proposta_oficial TEXT; -- Ex: 12759/2026 — pertence ao NEGÓCIO, não à proposta

ALTER TABLE public.contatos
  ALTER COLUMN clickup_contact_id DROP NOT NULL,
  ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced',
  ADD COLUMN sync_error TEXT;

-- Corrige o lugar errado onde esse campo tinha sido colocado na Fase 1
-- (numeração acontece na criação do negócio, antes de qualquer proposta existir)
ALTER TABLE public.propostas
  DROP COLUMN IF EXISTS numero_proposta_oficial;

-- Gerador interno de numeração (substitui a planilha do Google) — linha única (id=1),
-- semeada com o último número real em uso hoje (13202, confirmado pelo usuário em 17/08).
CREATE TABLE public.config_numeracao_propostas (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ultimo_numero INT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.config_numeracao_propostas (id, ultimo_numero, ativo) VALUES (1, 13202, true);

ALTER TABLE public.config_numeracao_propostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sel" ON public.config_numeracao_propostas FOR SELECT TO anon, authenticated USING (true);
-- Sem policy de UPDATE direto pra anon/authenticated — só as duas RPCs abaixo
-- (SECURITY DEFINER) podem alterar essa linha, pra ninguém pular o incremento
-- atômico escrevendo direto na tabela.

-- Gera o próximo número (ou NULL se a numeração estiver desativada). Chamada
-- pela SPA na mesma operação de criar um negócio.
CREATE OR REPLACE FUNCTION public.gerar_numero_proposta()
RETURNS TEXT AS $$
DECLARE
  v_novo_numero INT;
  v_ativo BOOLEAN;
BEGIN
  SELECT ativo INTO v_ativo FROM public.config_numeracao_propostas WHERE id = 1;
  IF NOT v_ativo THEN
    RETURN NULL;
  END IF;

  UPDATE public.config_numeracao_propostas
  SET ultimo_numero = ultimo_numero + 1, updated_at = now()
  WHERE id = 1
  RETURNING ultimo_numero INTO v_novo_numero;

  RETURN v_novo_numero || '/' || EXTRACT(YEAR FROM now())::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ajuste manual (tela de Configurações). novo_numero/novo_ativo são opcionais
-- (passa NULL pra não mexer naquele campo).
CREATE OR REPLACE FUNCTION public.ajustar_numeracao_proposta(novo_numero INT DEFAULT NULL, novo_ativo BOOLEAN DEFAULT NULL)
RETURNS TABLE(ultimo_numero INT, ativo BOOLEAN) AS $$
BEGIN
  UPDATE public.config_numeracao_propostas
  SET
    ultimo_numero = COALESCE(novo_numero, config_numeracao_propostas.ultimo_numero),
    ativo = COALESCE(novo_ativo, config_numeracao_propostas.ativo),
    updated_at = now()
  WHERE id = 1;

  RETURN QUERY SELECT c.ultimo_numero, c.ativo FROM public.config_numeracao_propostas c WHERE c.id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

`UNIQUE` em `clickup_negocio_id`/`clickup_contact_id` continua válido com múltiplos `NULL` (comportamento padrão do Postgres — `NULL` nunca conflita com outro `NULL` numa constraint `UNIQUE`), não precisa de índice parcial.

**Concorrência:** o `UPDATE ... RETURNING` dentro de `gerar_numero_proposta()` é atômico por natureza do MVCC do Postgres (duas chamadas simultâneas serializam automaticamente na mesma linha, sem número duplicado) — não precisa de `LockService` nem nada parecido com o que a planilha do Google exigia.

## Backend (Edge Functions novas)

- **`supabase/functions/sync-negocio-clickup/index.ts`**: recebe o payload do Database Webhook (linha nova de `negocios` com `clickup_negocio_id IS NULL`). Cria a tarefa na lista Negócios do ClickUp (custom_item_id 1004, Estágio=Registro, Tipo=Projeto, CRM Item Type=Negócio, e o custom field "Nº da Proposta" já preenchido com `numero_proposta_oficial` — que já veio pronto do Supabase, essa function não gera nada), vincula à Conta (`task/{id}/link/{conta.clickup_account_id}` — precisa buscar o `clickup_account_id` da conta via `conta_id`), e faz `UPDATE negocios SET clickup_negocio_id=..., sync_status='synced'`. Em qualquer falha, grava `sync_status='failed', sync_error=<mensagem>` — não derruba o negócio já criado no Supabase. **Não chama mais o Apps Script.**
- **`supabase/functions/sync-contato-clickup/index.ts`**: mesma ideia — cria na lista Contatos, vincula à Conta, `UPDATE contatos SET clickup_contact_id=..., sync_status='synced'`.
- Database Webhooks configurados no painel do Supabase (mesmo lugar onde `sync-clickup-value` já está configurado): INSERT em `negocios`/`contatos`.

## Tratamento de erro (decisões da sessão de brainstorming)

- Falha ao criar a Edge Function/webhook nem dispara: item fica com `sync_status='pending'` indefinidamente — aceitável pra essa entrega (sem retry automático agendado; retry manual fica pra depois se virar problema real).
- Falha dentro da Edge Function (ClickUp): `sync_status='failed'` com o motivo em `sync_error`, negócio/contato continua existindo normalmente no Supabase e utilizável na SPA. **O número da proposta já foi gerado e gravado antes disso** — uma falha de sincronização com o ClickUp nunca afeta a numeração.
- Numeração desativada (`ativo=false` na config): `gerar_numero_proposta()` devolve `NULL`, o negócio nasce sem `numero_proposta_oficial` (mostrado como "sem número" na SPA) — não é um erro, é o comportamento esperado do interruptor pedido pelo usuário.
- A SPA nunca bloqueia nem trava esperando a sincronização com o ClickUp — no máximo re-consulta por alguns segundos após a criação pra atualizar o selo, e desiste silenciosamente se demorar (usuário só vê quando recarregar/reabrir). A numeração em si (Supabase) é sempre síncrona e imediata, não tem "selo de carregando".

## Verificação

1. Migration aplicada sem erro; `negocios`/`contatos` aceitam `clickup_negocio_id IS NULL`; `config_numeracao_propostas` semeada com `ultimo_numero=13202, ativo=true`.
2. Chamar `gerar_numero_proposta()` direto via SQL/REST → devolve `"13203/2026"` (ou o ano vigente) e incrementa `ultimo_numero` pra 13203. Chamar de novo → `"13204/2026"`. Confirma que não repete/pula números mesmo com chamadas em rajada (testar 5-10 chamadas concorrentes).
3. Criar uma Oportunidade de teste pela SPA (Ficha 360º e pelo Kanban) → aparece **na hora**, já com número de proposta preenchido, e com selo "sincronizando..." (só do lado ClickUp) → em poucos segundos vira uma tarefa real no ClickUp, vinculada à conta certa, com o mesmo número no custom field → selo some.
4. Criar um Contato de teste → mesma verificação de sincronização, sem numeração (não se aplica a contato).
5. Forçar uma falha na Edge Function (ex: desligar) → confirma que o negócio continua visível na SPA com `sync_status='failed'` **e o número já atribuído continua lá**, sem travar a tela.
6. Testar o toggle "Ativo/Inativo" nas Configurações: desativar → criar negócio → nasce sem número, sem erro. Reativar → próxima criação volta a numerar a partir de onde parou.
7. Testar o ajuste manual de número nas Configurações → próxima criação usa o novo valor.
8. `sync_status` **não** precisa de nenhum filtro especial no MCP: um negócio recém-criado já grava `estagio='Registro'` e `conta_id` reais no INSERT inicial (antes mesmo de sincronizar), então `resumo_forecast`/`negocios_fechados`/`ranking_clientes` já contam ele certo desde o primeiro segundo.
