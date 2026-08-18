-- supabase/migrations/20260818j_webhook_proposta_tecnica_delete.sql
--
-- Complemento do trigger de INSERT (20260818h): dispara a mesma Edge
-- Function sync-proposta-tecnica-clickup no DELETE de `propostas`, para
-- excluir a tarefa técnica "Enviar Proposta vX" correspondente no ClickUp
-- quando o usuário exclui uma versão pelo CRM. Antes disso a exclusão só
-- acontecia no lado do Supabase — a tarefa técnica ficava órfã e tinha que
-- ser apagada manualmente no ClickUp.

CREATE TRIGGER sync_proposta_tecnica_clickup_delete
AFTER DELETE ON public.propostas
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://supabase.llworkflow.com.br/functions/v1/sync-proposta-tecnica-clickup',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
