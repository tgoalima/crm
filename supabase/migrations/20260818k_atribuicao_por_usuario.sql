-- supabase/migrations/20260818k_atribuicao_por_usuario.sql
--
-- Parte B da atribuição por usuário: tabela que guarda o token pessoal do
-- ClickUp de cada usuário logado (criptografado — nunca em texto puro,
-- ver Edge Function save-clickup-credentials) e a coluna que cada tabela
-- de negócio precisa ter para que as Edge Functions assíncronas
-- (sync-negocio-clickup, sync-contato-clickup, sync-conta-clickup,
-- sync-proposta-tecnica-clickup) saibam de quem é o token a usar.

CREATE TABLE public.usuarios_clickup (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clickup_user_id TEXT,
  nome TEXT,
  token_encrypted TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- RLS habilitada e propositalmente SEM NENHUMA policy: anon/authenticated
-- não enxergam esta tabela de jeito nenhum (nem SELECT, nem INSERT/UPDATE).
-- Só service_role (que ignora RLS por padrão no Supabase) consegue
-- ler/escrever aqui — e só a Edge Function save-clickup-credentials grava,
-- só as Edge Functions sync-*-clickup leem, ambas usando a service role key.
ALTER TABLE public.usuarios_clickup ENABLE ROW LEVEL SECURITY;

-- Coluna "quem criou este registro" nas 4 tabelas cujo INSERT dispara uma
-- Edge Function assíncrona de sincronização com o ClickUp. ON DELETE SET
-- NULL (não bloqueia excluir um usuário do auth.users, só perde a
-- atribuição daquele registro específico — cai no fallback do token global).
ALTER TABLE public.negocios ADD COLUMN IF NOT EXISTS criado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS criado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.contas ADD COLUMN IF NOT EXISTS criado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS criado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
