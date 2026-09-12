-- supabase/migrations/20260912d_ro_registrar_envio.sql
--
-- Registro de envio de R.O. ao fabricante (Task 6).
-- Regras:
--   * Apenas R.O. em "Backoffice" pode ser enviada.
--   * Atualiza a situação para "Aguardando aprovação" e data_solicitacao para a data informada.
--   * Registra evento auditável "Enviada ao fabricante" com observação e request_id.
--   * Suporta idempotência por request_id com advisory lock transacional.
--   * Valida versao_esperada para controle de concorrência otimista.
--   * Não altera número, vencimento ou qualquer dado da oportunidade.

CREATE OR REPLACE FUNCTION public.ro_registrar_envio(
    p_id uuid,
    p_data_solicitacao date,
    p_observacao text DEFAULT NULL,
    p_versao_esperada integer DEFAULT NULL,
    p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL,
    p_autor_nome text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    ro public.registros_oportunidade;
    resultado public.registros_oportunidade;
BEGIN
    IF p_autor_clickup_id IS NULL THEN
        RAISE EXCEPTION 'Autor obrigatório';
    END IF;

    -- Idempotência por request_id
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.registro_oportunidade_id = p_id
           AND e.dados->>'request_id' = p_request_id
           AND e.tipo = 'Enviada ao fabricante'
         LIMIT 1;
        IF FOUND THEN
            RETURN resultado;
        END IF;
    END IF;

    SELECT * INTO ro FROM public.registros_oportunidade WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'R.O. não encontrada';
    END IF;
    IF ro.situacao <> 'Backoffice' THEN
        RAISE EXCEPTION 'Apenas R.O. em Backoffice pode ser enviada ao fabricante (situação atual: %)', ro.situacao;
    END IF;
    IF p_versao_esperada IS NOT NULL AND ro.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. (esperada: %, atual: %)', p_versao_esperada, ro.versao USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.registros_oportunidade
       SET situacao = 'Aguardando aprovação',
           data_solicitacao = p_data_solicitacao
     WHERE id = p_id
     RETURNING * INTO resultado;

    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (p_id, 'Enviada ao fabricante', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('data_solicitacao', p_data_solicitacao,
                               'observacao', p_observacao,
                               'request_id', p_request_id));
    RETURN resultado;
END; $$;

REVOKE ALL ON FUNCTION public.ro_registrar_envio(uuid, date, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ro_registrar_envio(uuid, date, text, integer, text, text, text) TO service_role;
