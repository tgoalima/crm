-- Operações transacionais usadas exclusivamente pela Edge Function api-ros.

-- A chave de reenvio é global: uma mesma operação do cliente só pode gerar
-- um evento de auditoria. O lock por chave nas RPCs evita a corrida entre o
-- SELECT de idempotência e a primeira gravação.
CREATE UNIQUE INDEX eventos_ro_request_id_unico
    ON public.eventos_ro ((dados->>'request_id'))
    WHERE dados ? 'request_id' AND dados->>'request_id' IS NOT NULL;

CREATE FUNCTION public.ro_criar(
    p_negocio_id uuid,
    p_fabricante_id uuid,
    p_categoria text,
    p_titulo text DEFAULT NULL,
    p_cenario text DEFAULT NULL,
    p_responsavel_operacional_clickup_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL,
    p_autor_nome text DEFAULT NULL,
    p_request_id text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE resultado public.registros_oportunidade;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;

    -- Idempotência por request_id
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.dados->>'request_id' = p_request_id AND e.tipo = 'Criada'
         LIMIT 1;
        IF FOUND THEN
            RETURN resultado;
        END IF;
    END IF;

    INSERT INTO public.registros_oportunidade
        (negocio_id, fabricante_id, categoria, titulo, cenario,
         responsavel_operacional_clickup_id, data_solicitacao)
    VALUES (p_negocio_id, p_fabricante_id, p_categoria, p_titulo, p_cenario,
            p_responsavel_operacional_clickup_id, CURRENT_DATE)
    RETURNING * INTO resultado;
    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (resultado.id, 'Criada', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('situacao', resultado.situacao, 'request_id', p_request_id));
    RETURN resultado;
END; $$;

CREATE FUNCTION public.ro_aprovar(
    p_id uuid, p_numero_ro text, p_data_aprovacao date, p_data_vencimento date,
    p_versao_esperada integer DEFAULT NULL, p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL, p_autor_nome text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE ro public.registros_oportunidade; anterior public.registros_oportunidade; resultado public.registros_oportunidade;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;

    -- Idempotência por request_id
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.registro_oportunidade_id = p_id AND e.dados->>'request_id' = p_request_id AND e.tipo = 'Aprovada'
         LIMIT 1;
        IF FOUND THEN
            RETURN resultado;
        END IF;
    END IF;

    SELECT * INTO ro FROM public.registros_oportunidade WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'R.O. não encontrada'; END IF;
    IF ro.situacao NOT IN ('Backoffice', 'Aguardando aprovação') THEN
        RAISE EXCEPTION 'R.O. não pode ser aprovada no estado atual (%)', ro.situacao;
    END IF;
    IF p_versao_esperada IS NOT NULL AND ro.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. (esperada: %, atual: %)', p_versao_esperada, ro.versao USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.registros_oportunidade
       SET numero_ro = p_numero_ro, data_aprovacao = p_data_aprovacao,
           data_vencimento = p_data_vencimento, situacao = 'Aprovada'
     WHERE id = p_id
     RETURNING * INTO resultado;
    IF ro.ro_anterior_id IS NOT NULL THEN
        SELECT * INTO anterior FROM public.registros_oportunidade
         WHERE id = ro.ro_anterior_id FOR UPDATE;
        IF NOT FOUND OR anterior.situacao <> 'Aprovada' THEN
            RAISE EXCEPTION 'A R.O. anterior não está disponível para substituição';
        END IF;
        UPDATE public.registros_oportunidade
           SET situacao = 'Substituída', data_encerramento = p_data_aprovacao,
               motivo_encerramento = 'Substituída pela R.O. ' || resultado.numero_ro
         WHERE id = anterior.id;
        INSERT INTO public.eventos_ro
            (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
        VALUES (anterior.id, 'Substituída', p_autor_clickup_id, p_autor_nome, 'CRM',
                jsonb_build_object('nova_ro_id', resultado.id, 'novo_numero', resultado.numero_ro));
    END IF;
    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (resultado.id, 'Aprovada', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('numero_ro', resultado.numero_ro,
                               'data_aprovacao', resultado.data_aprovacao,
                               'data_vencimento', resultado.data_vencimento,
                               'request_id', p_request_id));
    RETURN resultado;
END; $$;

CREATE FUNCTION public.ro_solicitar_renovacao(
    p_id uuid, p_data_solicitacao date, p_evidencias jsonb DEFAULT '[]'::jsonb,
    p_versao_esperada integer DEFAULT NULL, p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL, p_autor_nome text DEFAULT NULL
) RETURNS public.renovacoes_ro
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE ro public.registros_oportunidade; resultado public.renovacoes_ro; proximo integer;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;

    -- Idempotência por request_id
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT ren.* INTO resultado
          FROM public.renovacoes_ro ren
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = ren.registro_oportunidade_id
         WHERE e.registro_oportunidade_id = p_id AND e.dados->>'request_id' = p_request_id AND e.tipo = 'Renovação solicitada'
         LIMIT 1;
        IF FOUND THEN
            RETURN resultado;
        END IF;
    END IF;

    SELECT * INTO ro FROM public.registros_oportunidade WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR ro.situacao <> 'Aprovada' THEN
        RAISE EXCEPTION 'Somente uma R.O. aprovada pode ser renovada';
    END IF;
    IF p_versao_esperada IS NOT NULL AND ro.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. (esperada: %, atual: %)', p_versao_esperada, ro.versao USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(max(ciclo), 0) + 1 INTO proximo
      FROM public.renovacoes_ro WHERE registro_oportunidade_id = p_id;
    INSERT INTO public.renovacoes_ro
        (registro_oportunidade_id, ciclo, data_solicitacao, vencimento_anterior,
         autor_clickup_id, autor_nome, evidencias)
    VALUES (p_id, proximo, p_data_solicitacao, ro.data_vencimento,
            p_autor_clickup_id, p_autor_nome, p_evidencias)
    RETURNING * INTO resultado;
    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (p_id, 'Renovação solicitada', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('ciclo', proximo, 'data_solicitacao', p_data_solicitacao,
                               'vencimento_anterior', ro.data_vencimento,
                               'request_id', p_request_id));
    RETURN resultado;
END; $$;

CREATE FUNCTION public.ro_responder_renovacao(
    p_id uuid, p_ciclo integer, p_situacao text, p_data_resposta date,
    p_novo_vencimento date DEFAULT NULL, p_motivo text DEFAULT NULL,
    p_evidencias jsonb DEFAULT '[]'::jsonb, p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL, p_autor_nome text DEFAULT NULL
) RETURNS public.renovacoes_ro
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE resultado public.renovacoes_ro;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;
    IF p_situacao NOT IN ('Aprovada', 'Negada') THEN RAISE EXCEPTION 'Resposta inválida'; END IF;

    -- Idempotência por request_id
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

    UPDATE public.renovacoes_ro
       SET situacao = p_situacao, data_resposta = p_data_resposta,
           novo_vencimento = CASE WHEN p_situacao = 'Aprovada' THEN p_novo_vencimento END,
           motivo_negativa = CASE WHEN p_situacao = 'Negada' THEN p_motivo END,
           evidencias = p_evidencias
     WHERE registro_oportunidade_id = p_id AND ciclo = p_ciclo AND situacao = 'Em análise'
     RETURNING * INTO resultado;
    IF NOT FOUND THEN RAISE EXCEPTION 'Renovação pendente não encontrada'; END IF;
    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (p_id, 'Renovação ' || lower(p_situacao), p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('ciclo', p_ciclo, 'situacao', p_situacao,
                               'novo_vencimento', p_novo_vencimento, 'motivo', p_motivo,
                               'request_id', p_request_id));
    RETURN resultado;
END; $$;

CREATE FUNCTION public.ro_substituir(
    p_ro_anterior_id uuid, p_versao_esperada integer DEFAULT NULL,
    p_request_id text DEFAULT NULL, p_autor_clickup_id text DEFAULT NULL,
    p_autor_nome text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE anterior public.registros_oportunidade; resultado public.registros_oportunidade;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.dados->>'request_id' = p_request_id AND e.tipo = 'Substituição iniciada'
         LIMIT 1;
        IF FOUND THEN RETURN resultado; END IF;
    END IF;

    SELECT * INTO anterior FROM public.registros_oportunidade
     WHERE id = p_ro_anterior_id FOR UPDATE;
    IF NOT FOUND OR anterior.situacao <> 'Aprovada' THEN
        RAISE EXCEPTION 'R.O. anterior não encontrada ou não está aprovada';
    END IF;
    IF p_versao_esperada IS NOT NULL AND anterior.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. anterior (esperada: %, atual: %)', p_versao_esperada, anterior.versao USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.registros_oportunidade
        (negocio_id, fabricante_id, categoria, titulo, cenario,
         responsavel_operacional_clickup_id, ro_anterior_id)
    VALUES (anterior.negocio_id, anterior.fabricante_id, anterior.categoria,
            anterior.titulo, anterior.cenario, anterior.responsavel_operacional_clickup_id,
            anterior.id)
    RETURNING * INTO resultado;
    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (resultado.id, 'Substituição iniciada', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('ro_anterior_id', anterior.id, 'request_id', p_request_id));
    RETURN resultado;
END; $$;

CREATE FUNCTION public.ro_encerrar(
    p_id uuid, p_situacao text, p_data_encerramento date, p_motivo text,
    p_versao_esperada integer DEFAULT NULL, p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL, p_autor_nome text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE ro public.registros_oportunidade; resultado public.registros_oportunidade;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;
    IF p_situacao NOT IN ('Reprovada', 'Encerrada') THEN RAISE EXCEPTION 'Situação final inválida'; END IF;

    -- Idempotência por request_id
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.registro_oportunidade_id = p_id AND e.dados->>'request_id' = p_request_id
         LIMIT 1;
        IF FOUND THEN
            RETURN resultado;
        END IF;
    END IF;

    SELECT * INTO ro FROM public.registros_oportunidade WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'R.O. não encontrada'; END IF;
    IF ro.situacao IN ('Reprovada', 'Encerrada', 'Substituída') THEN
        RAISE EXCEPTION 'R.O. já está encerrada ou substituída';
    END IF;
    IF p_versao_esperada IS NOT NULL AND ro.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. (esperada: %, atual: %)', p_versao_esperada, ro.versao USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.registros_oportunidade
       SET situacao = p_situacao, data_encerramento = p_data_encerramento,
           motivo_encerramento = p_motivo
     WHERE id = p_id
     RETURNING * INTO resultado;
    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (p_id, p_situacao, p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object('data_encerramento', p_data_encerramento, 'motivo', p_motivo, 'request_id', p_request_id));
    RETURN resultado;
END; $$;

REVOKE ALL ON FUNCTION public.ro_criar(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_aprovar(uuid, text, date, date, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_solicitar_renovacao(uuid, date, jsonb, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_responder_renovacao(uuid, integer, text, date, date, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_substituir(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_encerrar(uuid, text, date, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ro_criar(uuid, uuid, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ro_aprovar(uuid, text, date, date, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ro_solicitar_renovacao(uuid, date, jsonb, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ro_responder_renovacao(uuid, integer, text, date, date, text, jsonb, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ro_substituir(uuid, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ro_encerrar(uuid, text, date, text, integer, text, text, text) TO service_role;
