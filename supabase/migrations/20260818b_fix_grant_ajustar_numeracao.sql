-- supabase/migrations/20260818b_fix_grant_ajustar_numeracao.sql
--
-- Correção de segurança: ajustar_numeracao_proposta (função admin) deve ser
-- restrita apenas a authenticated, removendo acesso de anon (chave pública exposta).

REVOKE EXECUTE ON FUNCTION public.ajustar_numeracao_proposta(INT, BOOLEAN) FROM anon;
