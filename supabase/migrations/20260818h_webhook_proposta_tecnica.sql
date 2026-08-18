-- supabase/migrations/20260818h_webhook_proposta_tecnica.sql
--
-- Cria o Database Webhook (via SQL direto, mesmo mecanismo de
-- 20260818g_webhooks_empresa_360.sql) que dispara a Edge Function
-- sync-proposta-tecnica-clickup a cada nova proposta criada — porta pro
-- CRM a automação "Enviar Proposta vX" que hoje roda como Google Apps
-- Script no ClickUp (cria/reaproveita a lista técnica em PRE-VENDAS/PROJETOS
-- e a tarefa técnica correspondente, linkada ao negócio de origem).

CREATE TRIGGER sync_proposta_tecnica_clickup
AFTER INSERT ON public.propostas
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://supabase.llworkflow.com.br/functions/v1/sync-proposta-tecnica-clickup',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
