-- supabase/migrations/20260818f_contas_clickup_id_nullable.sql
--
-- Empresa 360º (ajustes pós-revisão): criar uma empresa nova pela SPA agora
-- segue o mesmo padrão Supabase-primeiro + assíncrono já usado em negócios
-- e contatos (INSERT com clickup_account_id NULL, sync-conta-clickup
-- preenche depois). A coluna era NOT NULL porque só existia para empresas
-- migradas do ClickUp (sempre com ID real). A constraint UNIQUE permite
-- múltiplos NULL normalmente, então não há conflito.

ALTER TABLE public.contas ALTER COLUMN clickup_account_id DROP NOT NULL;

-- Mesmas colunas de acompanhamento de sincronização já usadas em
-- negocios/contatos, pro selo "sincronizando..."/"falha ao sincronizar"
-- funcionar também na aba Empresas.
ALTER TABLE public.contas
    ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'synced',
    ADD COLUMN IF NOT EXISTS sync_error TEXT;
