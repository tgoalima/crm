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
