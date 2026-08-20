-- supabase/migrations/20260820a_tipos_tarefa_segmentos.sql
--
-- "Tipos de Tarefa" e "Segmentos" (Configurações do CRM) eram salvos só em
-- localStorage do navegador (app.js:1580-1587 taskTypes, app.js:1158-1201
-- SegmentosSettings, empresas.js:7-16 carregarSegmentos) — cada
-- navegador/máquina tinha sua própria lista, que divergia silenciosamente
-- entre vendedores e se perdia ao trocar de navegador/limpar dados. Migrando
-- para tabelas reais no Supabase, mesmo padrão de RLS já usado em
-- atividades_negocio (20260819b).
--
-- Seed com os valores hoje hardcoded como fallback em ambos os arquivos, para
-- não mudar o comportamento visível no primeiro deploy.

CREATE TABLE IF NOT EXISTS public.tipos_tarefa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL DEFAULT '📋',
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.segmentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tipos_tarefa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segmentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total para usuarios logados" ON public.tipos_tarefa
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Sel" ON public.tipos_tarefa FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.tipos_tarefa FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.tipos_tarefa FOR UPDATE TO anon USING (true);
CREATE POLICY "Del" ON public.tipos_tarefa FOR DELETE TO anon USING (true);

CREATE POLICY "Acesso total para usuarios logados" ON public.segmentos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Sel" ON public.segmentos FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.segmentos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.segmentos FOR UPDATE TO anon USING (true);
CREATE POLICY "Del" ON public.segmentos FOR DELETE TO anon USING (true);

INSERT INTO public.tipos_tarefa (nome, emoji) VALUES
    ('Ligação', '📞'),
    ('Reunião', '👥'),
    ('E-mail', '📧'),
    ('Follow-up', '🔄')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.segmentos (nome) VALUES
    ('Saúde / Hospitalar'), ('Agronegócio / Usinas'), ('Indústria Metalmecânica'),
    ('Construção Civil'), ('Distribuição & Logística'), ('Educação'),
    ('Financeiro & Seguros'), ('Varejo & E-commerce'), ('Tecnologia'),
    ('Têxtil & Moda'), ('Alimentício & Bebidas'), ('Energia & Utilities'),
    ('Governo & Público'), ('Automotivo'), ('Mineração'), ('Telecomunicações')
ON CONFLICT (nome) DO NOTHING;
