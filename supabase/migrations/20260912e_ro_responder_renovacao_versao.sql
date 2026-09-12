-- supabase/migrations/20260912e_ro_responder_renovacao_versao.sql
--
-- Concorrência e validação de versão na resposta de renovação de R.O. (Task 6).
-- Regras:
--   * Valida versao_esperada da R.O. antes de alterar o ciclo de renovação.
--   * Preserva idempotência por request_id: retry com o mesmo request_id retorna
--     o resultado anterior mesmo se a versão da R.O. já tiver sido incrementada.
--   * Conflito de versão levanta exceção com código P0001 (mapeado para HTTP 409).
--   * Não altera o comportamento de renovação negada nem o trigger de aprovação.

DROP FUNCTION IF EXISTS public.ro_responder_renovacao(uuid, integer, text, date, date, text, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.ro_responder_renovacao(
    p_id uuid,
    p_ciclo integer,
    p_situacao text,
    p_data_resposta date,
    p_novo_vencimento date DEFAULT NULL,
    p_motivo text DEFAULT NULL,
    p_evidencias jsonb DEFAULT '[]'::jsonb,
    p_versao_esperada integer DEFAULT NULL,
    p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL,
    p_autor_nome text DEFAULT NULL
) RETURNS public.renovacoes_ro
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    ro public.registros_oportunidade;
    resultado public.renovacoes_ro;
BEGIN
    IF p_autor_clickup_id IS NULL THEN
        RAISE EXCEPTION 'Autor obrigatório';
    END IF;
    IF p_situacao NOT IN ('Aprovada', 'Negada') THEN
        RAISE EXCEPTION 'Resposta inválida';
    END IF;

    -- Idempotência por request_id:
    -- Retorna o resultado anterior mesmo se a versão da R.O. já tiver sido incrementada.
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT ren.* INTO resultado
          FROM public.renovacoes_ro ren
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = ren.registro_oportunidade_id
         WHERE e.registro_oportunidade_id = p_id
           AND e.dados->>'request_id' = p_request_id
           AND e.tipo = 'Renovação ' || lower(p_situacao)
         LIMIT 1;
        IF FOUND THEN
            RETURN resultado;
        END IF;
    END IF;

    -- Lock pessimista e validação de versão esperada da R.O.
    SELECT * INTO ro FROM public.registros_oportunidade WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'R.O. não encontrada';
    END IF;

    IF p_versao_esperada IS NOT NULL AND ro.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. (esperada: %, atual: %)', p_versao_esperada, ro.versao USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.renovacoes_ro
       SET situacao = p_situacao,
           data_resposta = p_data_resposta,
           novo_vencimento = CASE WHEN p_situacao = 'Aprovada' THEN p_novo_vencimento END,
           motivo_negativa = CASE WHEN p_situacao = 'Negada' THEN p_motivo END,
           evidencias = p_evidencias
     WHERE registro_oportunidade_id = p_id
       AND ciclo = p_ciclo
       AND situacao = 'Em análise'
     RETURNING * INTO resultado;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Renovação pendente não encontrada';
    END IF;

    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (p_id, 'Renovação ' || lower(p_situacao), p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('ciclo', p_ciclo, 'situacao', p_situacao,
                               'novo_vencimento', p_novo_vencimento, 'motivo', p_motivo,
                               'request_id', p_request_id));

    RETURN resultado;
END; $$;

REVOKE ALL ON FUNCTION public.ro_responder_renovacao(uuid, integer, text, date, date, text, jsonb, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ro_responder_renovacao(uuid, integer, text, date, date, text, jsonb, integer, text, text, text) TO service_role;
