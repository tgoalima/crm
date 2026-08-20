-- supabase/migrations/20260819f_usuarios_clickup_registrados_view.sql
--
-- View somente-leitura sobre usuarios_clickup expondo apenas as colunas
-- não-sensíveis (nunca encrypted_token/iv), pra que o frontend consiga
-- filtrar os dropdowns de Vendedor/Responsável pra só quem já logou no
-- CRM com token próprio do ClickUp — hoje: Thiago, Marcos e Fábio.
--
-- usuarios_clickup em si continua service_role-only (ver 20260818k), a
-- view é a única superfície de leitura liberada pro cliente autenticado.

CREATE OR REPLACE VIEW public.usuarios_clickup_registrados AS
  SELECT clickup_user_id, username, user_email
  FROM public.usuarios_clickup
  WHERE clickup_user_id IS NOT NULL;

GRANT SELECT ON public.usuarios_clickup_registrados TO authenticated;
