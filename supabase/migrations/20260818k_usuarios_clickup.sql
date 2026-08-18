-- supabase/migrations/20260818k_usuarios_clickup.sql
--
-- 1. Tabela para armazenar tokens pessoais do ClickUp (criptografados AES-GCM)
--    na camada do Supabase. A descriptografia acontece nas Edge Functions
--    usando TOKEN_ENCRYPTION_KEY (env var). Nenhuma policy para anon/authenticated
--    → tabela acessível SOMENTE via service_role (Edge Functions).
--
-- 2. Campo criado_por_user_id nas tabelas de escrita (negocios, contatos,
--    contas, propostas) para vincular o autor da ação ao seu token pessoal.
--    O valor é o clickup_user_id numérico do usuário logado, preenchido
--    pelo frontend no momento da criação.

-- ─────────────────────────────────────────────
-- 1) Tabela usuarios_clickup
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuarios_clickup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT UNIQUE NOT NULL,
    clickup_user_id TEXT UNIQUE,
    username TEXT,
    encrypted_token TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.usuarios_clickup ENABLE ROW LEVEL SECURITY;
-- Sem policies → inacessível via Data API (anon/authenticated).
-- Somente service_role (Edge Functions) lê/escreve.

-- ─────────────────────────────────────────────
-- 2) criado_por_user_id nas tabelas principais
-- ─────────────────────────────────────────────
ALTER TABLE public.negocios   ADD COLUMN IF NOT EXISTS criado_por_user_id TEXT;
ALTER TABLE public.contatos   ADD COLUMN IF NOT EXISTS criado_por_user_id TEXT;
ALTER TABLE public.contas     ADD COLUMN IF NOT EXISTS criado_por_user_id TEXT;
ALTER TABLE public.propostas  ADD COLUMN IF NOT EXISTS criado_por_user_id TEXT;

-- Colunas para sync da tarefa técnica "Enviar Proposta vX" no ClickUp
ALTER TABLE public.propostas  ADD COLUMN IF NOT EXISTS clickup_proposta_tecnica_id TEXT;
ALTER TABLE public.propostas  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.propostas  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Índices para lookup rápido de "quem criou o quê"
CREATE INDEX IF NOT EXISTS idx_negocios_criado_por ON public.negocios(criado_por_user_id);
CREATE INDEX IF NOT EXISTS idx_contatos_criado_por ON public.contatos(criado_por_user_id);
CREATE INDEX IF NOT EXISTS idx_contas_criado_por   ON public.contas(criado_por_user_id);

-- ─────────────────────────────────────────────
-- 3) Trigger de INSERT para automação "Enviar Proposta vX"
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS sync_proposta_tecnica_clickup_insert ON public.propostas;
CREATE TRIGGER sync_proposta_tecnica_clickup_insert
AFTER INSERT ON public.propostas
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://supabase.llworkflow.com.br/functions/v1/sync-proposta-tecnica-clickup',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
