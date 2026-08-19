-- supabase/migrations/20260819d_fix_numeracao_proposta_perdidos.sql
--
-- Corrige a corrupção da numeração de propostas causada por uma automação
-- nativa do ClickUp (fora deste repositório) que ficou ativa por engano
-- durante a migração histórica de negócios PERDIDOS do Agendor (17/08/2026,
-- scripts/migracao_agendor_perdidos.py) e atribuiu um numero_proposta_oficial
-- novo, da sequência viva 2026, a 186 negócios históricos que nunca deveriam
-- consumir essa sequência. A migração de GANHOS (438 negócios) não teve esse
-- problema — o usuário já tinha desabilitado a automação antes de rodá-la.
--
-- 1) gerar_numero_proposta() ganha proteção contra colisão: ao resetar o
--    contador pra antes da corrupção (12811, ver UPDATE abaixo), a geração
--    volta a cruzar por números que negócios reais já usam (tanto os ~57
--    negócios legítimos que ficaram intercalados com os 186 na faixa
--    12812-13201, quanto as propostas reais 13207-13209/2026 geradas depois
--    da corrupção, que o usuário decidiu manter como estão). Sem essa
--    proteção, a função reatribuiria um número já em uso.
CREATE OR REPLACE FUNCTION public.gerar_numero_proposta()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_novo_numero INT;
  v_ativo BOOLEAN;
  v_ano TEXT;
  v_candidato TEXT;
BEGIN
  SELECT ativo INTO v_ativo FROM public.config_numeracao_propostas WHERE id = 1;
  IF NOT v_ativo THEN
    RETURN NULL;
  END IF;

  v_ano := EXTRACT(YEAR FROM now())::TEXT;

  LOOP
    UPDATE public.config_numeracao_propostas
    SET ultimo_numero = ultimo_numero + 1, updated_at = now()
    WHERE id = 1
    RETURNING ultimo_numero INTO v_novo_numero;

    v_candidato := v_novo_numero || '/' || v_ano;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.negocios WHERE numero_proposta_oficial = v_candidato
    );
  END LOOP;

  RETURN v_candidato;
END;
$function$;
