-- supabase/migrations/20260819b_atividades_negocio.sql
--
-- A tabela `atividades_negocio` nunca existiu no banco de produção — nem
-- server.py (uso local) nem a nova Edge Function api-atividades conseguiam
-- gravar nela (erro real confirmado nos logs: "Could not find the table
-- 'public.atividades_negocio' in the schema cache"). O recurso só parecia
-- funcionar porque o GET tem um fallback que mescla comentários nativos do
-- ClickUp quando não encontra a linha correspondente no Supabase — ou seja,
-- a listagem sempre funcionou via ClickUp, mas nada nunca foi persistido
-- de fato no Supabase.
--
-- Schema alinhado ao que server.py e api-atividades/index.ts já gravam:
-- clickup_negocio_id, clickup_comment_id, texto, data_execucao, timestamps.

CREATE TABLE public.atividades_negocio (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    clickup_negocio_id character varying(255) NOT NULL,
    clickup_comment_id character varying(255),
    texto text NOT NULL,
    data_execucao timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT atividades_negocio_pkey PRIMARY KEY (id)
);

CREATE INDEX atividades_negocio_clickup_negocio_id_idx ON public.atividades_negocio (clickup_negocio_id);

ALTER TABLE public.atividades_negocio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total para usuarios logados" ON public.atividades_negocio
    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Sel" ON public.atividades_negocio FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.atividades_negocio FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.atividades_negocio FOR UPDATE TO anon USING (true);
CREATE POLICY "Del" ON public.atividades_negocio FOR DELETE TO anon USING (true);
