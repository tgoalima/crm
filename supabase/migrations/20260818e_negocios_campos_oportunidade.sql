-- supabase/migrations/20260818e_negocios_campos_oportunidade.sql
--
-- Empresa 360º (ajustes pós-revisão): o formulário de Nova/Editar
-- Oportunidade ganhou campos (Tipo, Probabilidade, Previsão de Fechamento,
-- Descrição, Registros de Oportunidade dos fabricantes, Contato Principal)
-- que hoje só são enviados direto pro ClickUp — nunca ficam gravados no
-- Supabase. Isso impede que a criação de negócio seja Supabase-primeiro +
-- assíncrona de verdade (a Edge Function sync-negocio-clickup precisa
-- desses campos pra montar a tarefa no ClickUp, e só tem acesso à linha
-- gravada em `negocios`). Esta migration adiciona as colunas que faltam.

ALTER TABLE public.negocios
    ADD COLUMN IF NOT EXISTS tipo_oportunidade TEXT,
    ADD COLUMN IF NOT EXISTS probabilidade INTEGER,
    ADD COLUMN IF NOT EXISTS data_previsao DATE,
    ADD COLUMN IF NOT EXISTS descricao TEXT,
    ADD COLUMN IF NOT EXISTS ro_infra TEXT,
    ADD COLUMN IF NOT EXISTS ro_sw1 TEXT,
    ADD COLUMN IF NOT EXISTS ro_sw2 TEXT,
    ADD COLUMN IF NOT EXISTS ro_sw3 TEXT,
    ADD COLUMN IF NOT EXISTS ro_sw4 TEXT,
    ADD COLUMN IF NOT EXISTS contato_principal_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL;
