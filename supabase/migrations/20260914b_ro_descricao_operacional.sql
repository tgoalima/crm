-- Contexto operacional da R.O.: contato, itens, valores e resumo comercial.
-- Não é atividade humana nem substitui o histórico de eventos.

ALTER TABLE public.registros_oportunidade
    ADD COLUMN IF NOT EXISTS descricao text;

ALTER TABLE public.registros_oportunidade
    DROP CONSTRAINT IF EXISTS registros_oportunidade_descricao_tamanho;

ALTER TABLE public.registros_oportunidade
    ADD CONSTRAINT registros_oportunidade_descricao_tamanho
    CHECK (descricao IS NULL OR char_length(descricao) <= 6000);

-- A RPC de criação muda de assinatura para receber a descrição. A antiga só
-- era executável por service_role e é substituída na mesma migration.
DROP FUNCTION IF EXISTS public.ro_criar(uuid, uuid, text, text, text, text, text, text, text);

CREATE FUNCTION public.ro_criar(
    p_negocio_id uuid,
    p_fabricante_id uuid,
    p_categoria text,
    p_titulo text DEFAULT NULL,
    p_descricao text DEFAULT NULL,
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
    IF p_descricao IS NOT NULL AND char_length(p_descricao) > 6000 THEN
        RAISE EXCEPTION 'A descrição pode ter no máximo 6.000 caracteres';
    END IF;

    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.dados->>'request_id' = p_request_id AND e.tipo = 'Criada'
         LIMIT 1;
        IF FOUND THEN RETURN resultado; END IF;
    END IF;

    INSERT INTO public.registros_oportunidade
        (negocio_id, fabricante_id, categoria, titulo, descricao, cenario,
         responsavel_operacional_clickup_id, data_solicitacao)
    VALUES (p_negocio_id, p_fabricante_id, p_categoria, p_titulo, p_descricao, p_cenario,
            p_responsavel_operacional_clickup_id, CURRENT_DATE)
    RETURNING * INTO resultado;

    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (resultado.id, 'Criada', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object(
                'situacao', resultado.situacao,
                'tem_descricao', resultado.descricao IS NOT NULL,
                'request_id', p_request_id
            ));
    RETURN resultado;
END; $$;

CREATE FUNCTION public.ro_atualizar_descricao(
    p_id uuid,
    p_descricao text,
    p_versao_esperada integer DEFAULT NULL,
    p_request_id text DEFAULT NULL,
    p_autor_clickup_id text DEFAULT NULL,
    p_autor_nome text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE atual public.registros_oportunidade; resultado public.registros_oportunidade;
BEGIN
    IF p_autor_clickup_id IS NULL THEN RAISE EXCEPTION 'Autor obrigatório'; END IF;
    IF p_descricao IS NOT NULL AND char_length(p_descricao) > 6000 THEN
        RAISE EXCEPTION 'A descrição pode ter no máximo 6.000 caracteres';
    END IF;

    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id, 0));
        SELECT r.* INTO resultado
          FROM public.registros_oportunidade r
          JOIN public.eventos_ro e ON e.registro_oportunidade_id = r.id
         WHERE e.registro_oportunidade_id = p_id
           AND e.dados->>'request_id' = p_request_id
           AND e.tipo = 'Descrição atualizada'
         LIMIT 1;
        IF FOUND THEN RETURN resultado; END IF;
    END IF;

    SELECT * INTO atual FROM public.registros_oportunidade WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'R.O. não encontrada'; END IF;
    IF p_versao_esperada IS NOT NULL AND atual.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. (esperada: %, atual: %)',
            p_versao_esperada, atual.versao USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.registros_oportunidade
       SET descricao = NULLIF(btrim(p_descricao), '')
     WHERE id = p_id
     RETURNING * INTO resultado;

    INSERT INTO public.eventos_ro
        (registro_oportunidade_id, tipo, autor_clickup_id, autor_nome, origem, dados)
    VALUES (p_id, 'Descrição atualizada', p_autor_clickup_id, p_autor_nome, 'CRM',
            jsonb_build_object(
                'descricao_preenchida', resultado.descricao IS NOT NULL,
                'descricao_tamanho', char_length(coalesce(resultado.descricao, '')),
                'request_id', p_request_id
            ));
    RETURN resultado;
END; $$;

-- Uma R.O. sucessora representa o mesmo contexto comercial e herda-o.
CREATE OR REPLACE FUNCTION public.ro_herdar_descricao_sucessora()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
    IF NEW.ro_anterior_id IS NOT NULL AND NEW.descricao IS NULL THEN
        SELECT descricao INTO NEW.descricao
          FROM public.registros_oportunidade
         WHERE id = NEW.ro_anterior_id;
    END IF;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS registros_oportunidade_herdar_descricao_sucessora ON public.registros_oportunidade;
CREATE TRIGGER registros_oportunidade_herdar_descricao_sucessora
BEFORE INSERT ON public.registros_oportunidade
FOR EACH ROW EXECUTE FUNCTION public.ro_herdar_descricao_sucessora();

REVOKE ALL ON FUNCTION public.ro_criar(uuid, uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_atualizar_descricao(uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_herdar_descricao_sucessora() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ro_criar(uuid, uuid, text, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ro_atualizar_descricao(uuid, text, integer, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
