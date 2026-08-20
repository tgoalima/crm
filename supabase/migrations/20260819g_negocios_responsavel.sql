-- supabase/migrations/20260819g_negocios_responsavel.sql
--
-- Responsável comercial do negócio, disponível desde a criação — mesmo padrão
-- já usado em contas.responsavel_nome/responsavel_clickup_id. Não substitui
-- propostas.criado_por (usado pelo dropdown "Vendedor/Responsável" da proposta);
-- as duas fontes são mantidas em paralelo pelo mesmo evento de escrita
-- (ver handleResponsavelChange e NovaOportunidadeModal.salvar em app.js/empresas.js).

ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS responsavel_nome TEXT;
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS responsavel_clickup_id TEXT;
