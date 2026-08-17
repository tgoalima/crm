-- Traz o "Negócio" em si (não só a proposta) para o Supabase, incluindo o
-- estágio do funil de vendas (hoje só existe no custom field "Estágio da
-- Venda" do ClickUp, c8d0abe2-c59f-4a9e-93ff-bd060659aa63). Elimina a
-- dependência do ClickUp nas leituras de resumo_forecast/negocios_fechados/
-- historico_cliente no MCP — e é a base para a SPA passar a ser a fonte de
-- verdade do estágio, escrevendo para o ClickUp em vez de só ler de lá.
--
-- Estágio é uma propriedade do NEGÓCIO, não da proposta (um negócio pode ter
-- várias propostas/versões, mas só um estágio no funil) — por isso é uma
-- tabela própria, não uma coluna em `propostas`.

CREATE TABLE IF NOT EXISTS public.negocios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clickup_negocio_id TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    conta_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
    estagio TEXT, -- Registro / Qualificação / Proposta / Desenvolvimento / Negociação / Termo de aceite / Ganho / Perdido / Congelado
    valor_clickup_fallback NUMERIC(14,2), -- custom field "Valor do negócio" no ClickUp, usado só quando não há proposta em `propostas`
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_negocios_conta_id ON public.negocios(conta_id);
CREATE INDEX IF NOT EXISTS idx_negocios_estagio ON public.negocios(estagio);

ALTER TABLE public.negocios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sel" ON public.negocios FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.negocios FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.negocios FOR UPDATE TO anon USING (true);
