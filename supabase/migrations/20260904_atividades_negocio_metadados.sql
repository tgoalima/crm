-- supabase/migrations/20260904_atividades_negocio_metadados.sql
--
-- Adiciona metadados que faltavam em `atividades_negocio` (criada em
-- 20260819b_atividades_negocio.sql) pra dar suporte à aba Atividades
-- repaginada: autor de cada registro, origem (manual/tarefa/clickup),
-- referência à tarefa concluída que gerou o registro, e ponteiros de
-- anexo (o arquivo em si fica no ClickUp — aqui só metadados, nunca bytes).
--
-- Tudo nulo/default: linhas existentes continuam válidas sem re-migração,
-- e o front-end trata a ausência desses campos com um parser legado sobre
-- o texto (ver parseAtividade em app.js).

ALTER TABLE public.atividades_negocio
  ADD COLUMN IF NOT EXISTS autor_nome character varying(160),
  ADD COLUMN IF NOT EXISTS autor_clickup_id character varying(64),
  ADD COLUMN IF NOT EXISTS origem character varying(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS tarefa_id uuid,
  ADD COLUMN IF NOT EXISTS tarefa_tipo character varying(80),
  ADD COLUMN IF NOT EXISTS tarefa_titulo text,
  ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.atividades_negocio.origem IS 'manual | tarefa | clickup';
COMMENT ON COLUMN public.atividades_negocio.anexos IS 'Array de ponteiros pro ClickUp: [{clickup_attachment_id, title, url, mimetype, size}] — o arquivo em si vive no ClickUp, nunca aqui.';
