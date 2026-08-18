-- supabase/migrations/20260818g_webhooks_empresa_360.sql
--
-- Cria os 3 Database Webhooks pendentes da Empresa 360º (negócios, contatos,
-- contas) diretamente via SQL, em vez de exigir configuração manual no
-- painel do Supabase Studio (Database > Webhooks). Replica exatamente o
-- mecanismo que o Studio usa por trás dos panos: um trigger AFTER INSERT
-- chamando supabase_functions.http_request(), que monta o payload
-- {type, table, schema, record, old_record} e faz o POST via pg_net —
-- o mesmo formato que as 3 Edge Functions já esperam.
--
-- Sem estes triggers, negócios/contatos/contas criados pela SPA ficavam
-- presos em sync_status='pending' para sempre (a criação em si funciona
-- normalmente — só a sincronização com o ClickUp em segundo plano
-- dependia deste passo).

CREATE TRIGGER sync_negocio_clickup
AFTER INSERT ON public.negocios
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://supabase.llworkflow.com.br/functions/v1/sync-negocio-clickup',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);

CREATE TRIGGER sync_contato_clickup
AFTER INSERT ON public.contatos
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://supabase.llworkflow.com.br/functions/v1/sync-contato-clickup',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);

CREATE TRIGGER sync_conta_clickup
AFTER INSERT ON public.contas
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://supabase.llworkflow.com.br/functions/v1/sync-conta-clickup',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
