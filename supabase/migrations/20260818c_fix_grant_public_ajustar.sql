-- supabase/migrations/20260818c_fix_grant_public_ajustar.sql
--
-- Remove PUBLIC grant de ajustar_numeracao_proposta (admin only).

REVOKE EXECUTE ON FUNCTION public.ajustar_numeracao_proposta(INT, BOOLEAN) FROM PUBLIC;
