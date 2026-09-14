-- Uma oportunidade pode ser perdida antes da criação de qualquer proposta.
-- Os dados de fechamento pertencem ao negócio nesse caso.
ALTER TABLE public.negocios
    ADD COLUMN IF NOT EXISTS data_fechamento DATE,
    ADD COLUMN IF NOT EXISTS motivo_perda TEXT;
