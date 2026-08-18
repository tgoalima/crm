-- app.js (loadProposalDetails, ~linha 3806-3819) já lia/gravava
-- propostas.data_inicio (sincronização em segundo plano da data de início
-- vinda do ClickUp) mas a coluna nunca existiu no banco — todo carregamento
-- de proposta sem essa data disparava um PATCH que falhava com 400
-- (PGRST204: "Could not find the 'data_inicio' column"). Silencioso
-- (fire-and-forget com .catch(() => {})), mas poluía o console o tempo todo.
ALTER TABLE public.propostas ADD COLUMN IF NOT EXISTS data_inicio DATE;
