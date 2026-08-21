-- supabase/migrations/20260821a_propostas_referencia_forecast.sql
--
-- Feature: "Referência de Forecast" — flag independente de `situacao` que
-- deixa o usuário marcar qual proposta (ainda 'Ativa') deve ser considerada
-- o valor de referência do negócio no Forecast/Kanban enquanto o cliente
-- ainda não confirmou qual vai escolher. Ao contrário de marcar
-- 'Selecionada', isso NÃO desconsidera as propostas irmãs e NÃO move o
-- negócio no pipeline.
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS referencia_forecast BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_propostas_referencia_forecast
  ON public.propostas(clickup_negocio_id)
  WHERE referencia_forecast = true;

-- Rede de segurança (mesmo padrão de auto_deselect_other_proposals /
-- 20260819c): garante no nível do banco que só uma proposta por negócio
-- fique com referencia_forecast=true, mesmo se alguma escrita não passar
-- pelo app.js.
CREATE OR REPLACE FUNCTION public.auto_unset_other_forecast_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.referencia_forecast = true AND (OLD.referencia_forecast IS DISTINCT FROM true OR TG_OP = 'INSERT') THEN
        UPDATE propostas
        SET referencia_forecast = false
        WHERE clickup_negocio_id = NEW.clickup_negocio_id
          AND id <> NEW.id
          AND referencia_forecast = true;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_unset_other_forecast_reference ON public.propostas;
CREATE TRIGGER trigger_unset_other_forecast_reference
BEFORE INSERT OR UPDATE ON public.propostas
FOR EACH ROW
EXECUTE FUNCTION public.auto_unset_other_forecast_reference();
