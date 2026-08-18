-- supabase/migrations/20260818d_restrict_config_numeracao_select.sql
--
-- Restringe SELECT em config_numeracao_propostas a authenticated apenas —
-- a tela de Configurações (Numeração de Propostas) só roda atrás de sessão
-- logada, não precisa expor o contador via anon key pública.

DROP POLICY "Sel" ON public.config_numeracao_propostas;
CREATE POLICY "Sel" ON public.config_numeracao_propostas FOR SELECT TO authenticated USING (true);
