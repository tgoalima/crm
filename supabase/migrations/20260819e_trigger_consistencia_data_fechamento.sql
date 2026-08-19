-- supabase/migrations/20260819e_trigger_consistencia_data_fechamento.sql
--
-- Camada 1 da correção estrutural do relatório de faturamento (19/08).
--
-- Causa raiz do bug encontrado hoje: o relatório de Relatórios (app.js)
-- decide se uma proposta conta como "fechada" (Ganho/Perdido) olhando só
-- pra propostas.situacao + propostas.data_fechamento, sem nunca cruzar
-- com negocios.estagio — o campo que o resto do sistema (Kanban, sync
-- ClickUp) trata como fonte real da verdade do estágio do negócio. Isso
-- permite as duas representações descolarem: achamos 6 propostas com
-- data_fechamento preenchida em negócios que já tinham voltado a estar
-- ativos (Registro/Proposta/Negociação), inflando os números de Ganho.
--
-- A regra de reabertura já existente no frontend (handleOpportunityStateChange,
-- app.js) só limpa data_fechamento de propostas com situacao IN ('Ganho','Perdido')
-- — não pega propostas com situacao 'Selecionada'/'Ativa' que ficaram com
-- data_fechamento presa de um fechamento anterior. Esse trigger fecha essa
-- lacuna rodando no banco, protegendo contra QUALQUER caminho de escrita
-- (frontend, script, edge function, SQL direto) que mude negocios.estagio
-- sem passar pela lógica específica do app.js.

CREATE OR REPLACE FUNCTION public.limpar_data_fechamento_reabertura()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.estagio IS DISTINCT FROM OLD.estagio
       AND (NEW.estagio IS NULL OR NEW.estagio NOT IN ('Ganho', 'Perdido'))
       AND NEW.clickup_negocio_id IS NOT NULL
    THEN
        UPDATE public.propostas
        SET data_fechamento = NULL, motivo_perda = NULL
        WHERE clickup_negocio_id = NEW.clickup_negocio_id
          AND data_fechamento IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_limpar_fechamento_reabertura ON public.negocios;
CREATE TRIGGER trigger_limpar_fechamento_reabertura
    AFTER UPDATE ON public.negocios
    FOR EACH ROW
    EXECUTE FUNCTION public.limpar_data_fechamento_reabertura();
