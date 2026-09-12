DO $$
DECLARE
    negocio_a uuid;
    negocio_b uuid;
    fabricante uuid;
    ro_original uuid;
    ro_substituta uuid;
    ro_rpc public.registros_oportunidade;
    renovacao_rpc public.renovacoes_ro;
BEGIN
    SELECT id INTO negocio_a FROM public.negocios ORDER BY id LIMIT 1;
    SELECT id INTO negocio_b FROM public.negocios WHERE id <> negocio_a ORDER BY id LIMIT 1;
    IF negocio_a IS NULL OR negocio_b IS NULL THEN
        RAISE EXCEPTION 'Teste requer dois negócios existentes';
    END IF;

    INSERT INTO public.fabricantes_ro
        (nome, prazo_inicial_sugerido_dias, limite_renovacoes)
    VALUES ('Fabricante teste R.O.', 90, 3)
    RETURNING id INTO fabricante;

    INSERT INTO public.registros_oportunidade
        (negocio_id, fabricante_id, numero_ro, categoria, situacao,
         data_solicitacao, data_aprovacao, data_vencimento)
    VALUES
        (negocio_a, fabricante, 'RO-TESTE-1', 'Infraestrutura', 'Aprovada',
         DATE '2026-01-01', DATE '2026-01-02', DATE '2026-04-02')
    RETURNING id INTO ro_original;

    INSERT INTO public.renovacoes_ro
        (registro_oportunidade_id, ciclo, situacao, data_solicitacao,
         data_resposta, vencimento_anterior, novo_vencimento,
         autor_clickup_id, autor_nome)
    VALUES
        (ro_original, 1, 'Aprovada', DATE '2026-03-10', DATE '2026-03-12',
         DATE '2026-04-02', DATE '2026-07-01', '90848927', 'Thiago Lima');

    IF (SELECT data_vencimento FROM public.registros_oportunidade WHERE id = ro_original)
       <> DATE '2026-07-01' THEN
        RAISE EXCEPTION 'Renovação aprovada não atualizou o vencimento';
    END IF;

    INSERT INTO public.registros_oportunidade
        (negocio_id, fabricante_id, numero_ro, categoria, ro_anterior_id)
    VALUES (negocio_a, fabricante, 'RO-TESTE-2', 'Infraestrutura', ro_original)
    RETURNING id INTO ro_substituta;

    BEGIN
        UPDATE public.registros_oportunidade
           SET negocio_id = negocio_b
         WHERE id = ro_substituta;
        RAISE EXCEPTION 'Substituição entre oportunidades diferentes foi aceita';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM = 'Substituição entre oportunidades diferentes foi aceita' THEN
                RAISE;
            END IF;
            IF SQLERRM <> 'R.O. substituta deve pertencer à mesma oportunidade' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        UPDATE public.registros_oportunidade
           SET ro_anterior_id = ro_substituta
         WHERE id = ro_original;
        RAISE EXCEPTION 'Cadeia circular de substituição foi aceita';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM = 'Cadeia circular de substituição foi aceita' THEN
                RAISE;
            END IF;
            IF SQLERRM <> 'A cadeia de substituição de R.O. não pode ser circular' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        INSERT INTO public.renovacoes_ro
            (registro_oportunidade_id, ciclo, situacao, data_solicitacao,
             autor_clickup_id)
        VALUES (ro_original, 2, 'Em análise', DATE '2026-06-10', '90848927');
        INSERT INTO public.renovacoes_ro
            (registro_oportunidade_id, ciclo, situacao, data_solicitacao,
             autor_clickup_id)
        VALUES (ro_original, 3, 'Em análise', DATE '2026-06-11', '90848927');
        RAISE EXCEPTION 'Duas renovações pendentes foram aceitas';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    INSERT INTO public.renovacoes_ro
        (registro_oportunidade_id, ciclo, situacao, data_solicitacao,
         autor_clickup_id)
    VALUES (ro_original, 2, 'Em análise', DATE '2026-06-10', '90848927');

    UPDATE public.renovacoes_ro
       SET situacao = 'Negada', data_resposta = DATE '2026-06-12'
     WHERE registro_oportunidade_id = ro_original AND ciclo = 2;

    INSERT INTO public.renovacoes_ro
        (registro_oportunidade_id, ciclo, situacao, data_solicitacao,
         autor_clickup_id)
    VALUES (ro_original, 3, 'Em análise', DATE '2026-06-13', '90848927');

    BEGIN
        INSERT INTO public.renovacoes_ro
            (registro_oportunidade_id, ciclo, situacao, data_solicitacao,
             autor_clickup_id)
        VALUES (ro_original, 4, 'Em análise', DATE '2026-06-14', '90848927');
        RAISE EXCEPTION 'Limite de renovações do fabricante foi ignorado';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM = 'Limite de renovações do fabricante foi ignorado' THEN
                RAISE;
            END IF;
            IF SQLERRM <> 'Limite de 3 renovações atingido para o fabricante' THEN
                RAISE;
            END IF;
    END;

    SELECT * INTO ro_rpc FROM public.ro_criar(
        negocio_b, fabricante, 'Software', 'Projeto RPC', 'Nuvem',
        '112112544', '90848927', 'Thiago Lima', '11111111-1111-4111-8111-111111111101'
    );
    SELECT * INTO ro_rpc FROM public.ro_registrar_envio(
        ro_rpc.id, DATE '2026-09-10', 'Enviada para análise do fabricante', NULL,
        '11111111-1111-4111-8111-111111111101e', '90848927', 'Thiago Lima'
    );
    IF (SELECT situacao FROM public.registros_oportunidade WHERE id = ro_rpc.id) <> 'Aguardando aprovação'
       OR (SELECT data_solicitacao FROM public.registros_oportunidade WHERE id = ro_rpc.id) <> DATE '2026-09-10' THEN
        RAISE EXCEPTION 'Registro de envio não atualizou situação ou data de solicitação';
    END IF;
    SELECT * INTO ro_rpc FROM public.ro_aprovar(
        ro_rpc.id, 'RO-RPC-1', DATE '2026-09-12', DATE '2026-12-11',
        NULL, '11111111-1111-4111-8111-111111111102', '90848927', 'Thiago Lima'
    );
    SELECT * INTO renovacao_rpc FROM public.ro_solicitar_renovacao(
        ro_rpc.id, DATE '2026-11-20', '[]'::jsonb, NULL,
        '11111111-1111-4111-8111-111111111103', '90848927', 'Thiago Lima'
    );
    -- Resposta versionada da renovação com versao_esperada
    SELECT versao INTO ro_rpc.versao FROM public.registros_oportunidade WHERE id = ro_rpc.id;
    SELECT * INTO renovacao_rpc FROM public.ro_responder_renovacao(
        ro_rpc.id, renovacao_rpc.ciclo, 'Aprovada', DATE '2026-11-25',
        DATE '2027-03-11', NULL, '[]'::jsonb, ro_rpc.versao,
        '11111111-1111-4111-8111-111111111104', '90848927', 'Thiago Lima'
    );

    -- Idempotência: retry com o mesmo request_id retorna o resultado mesmo após incremento da versão da R.O.
    SELECT * INTO renovacao_rpc FROM public.ro_responder_renovacao(
        ro_rpc.id, renovacao_rpc.ciclo, 'Aprovada', DATE '2026-11-25',
        DATE '2027-03-11', NULL, '[]'::jsonb, ro_rpc.versao - 1,
        '11111111-1111-4111-8111-111111111104', '90848927', 'Thiago Lima'
    );
    IF renovacao_rpc.situacao <> 'Aprovada' THEN
        RAISE EXCEPTION 'Retry idempotente de responder renovação falhou';
    END IF;

    -- Conflito de versão ao tentar responder ciclo com versão defasada e novo request_id
    BEGIN
        PERFORM public.ro_responder_renovacao(
            ro_rpc.id, renovacao_rpc.ciclo, 'Aprovada', DATE '2026-11-26',
            DATE '2027-04-11', NULL, '[]'::jsonb, ro_rpc.versao - 1,
            '11111111-1111-4111-8111-111111111104b', '90848927', 'Thiago Lima'
        );
        RAISE EXCEPTION 'Conflito de versão na resposta de renovação não foi detectado';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLSTATE <> 'P0001' AND SQLERRM NOT ILIKE '%conflito de versão%' THEN
                RAISE;
            END IF;
    END;
    IF (SELECT count(*) FROM public.eventos_ro WHERE registro_oportunidade_id = ro_rpc.id) <> 5 THEN
        RAISE EXCEPTION 'Fluxo RPC não registrou todos os eventos esperados';
    END IF;
    SELECT * INTO ro_substituta FROM public.ro_substituir(
        ro_rpc.id, NULL, '11111111-1111-4111-8111-111111111105',
        '90848927', 'Thiago Lima'
    );
    IF (SELECT situacao FROM public.registros_oportunidade WHERE id = ro_rpc.id) <> 'Aprovada'
       OR (SELECT situacao FROM public.registros_oportunidade WHERE id = ro_substituta) <> 'Backoffice' THEN
        RAISE EXCEPTION 'Substituição pendente alterou a R.O. anterior antes da aprovação';
    END IF;
    SELECT * INTO ro_substituta FROM public.ro_aprovar(
        ro_substituta, 'RO-RPC-2', DATE '2026-12-01', DATE '2027-03-01',
        NULL, '11111111-1111-4111-8111-111111111106', '90848927', 'Thiago Lima'
    );
    IF (SELECT situacao FROM public.registros_oportunidade WHERE id = ro_rpc.id) <> 'Substituída' THEN
        RAISE EXCEPTION 'Aprovação da sucessora não efetivou a substituição';
    END IF;
    SELECT * INTO ro_substituta FROM public.ro_encerrar(
        ro_substituta, 'Encerrada', DATE '2026-12-02', 'Projeto cancelado',
        NULL, '11111111-1111-4111-8111-111111111107', '90848927', 'Thiago Lima'
    );
END;
$$;

ROLLBACK;
