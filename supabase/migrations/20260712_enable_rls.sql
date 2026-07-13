ALTER TABLE public.distribuidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_proposta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sel" ON public.distribuidores FOR SELECT TO anon USING (true);
CREATE POLICY "Sel" ON public.produtos FOR SELECT TO anon USING (true);
CREATE POLICY "Sel" ON public.itens_proposta FOR SELECT TO anon USING (true);
CREATE POLICY "Sel" ON public.vendedores FOR SELECT TO anon USING (true);
CREATE POLICY "Sel" ON public.propostas FOR SELECT TO anon USING (true);
