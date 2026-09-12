-- Teste transacional das regras de agregação de R.Os (Task 3.1)
-- Valida a função public.ro_resumo_agregado garantindo que cálculos aconteçam
-- no banco, com search_path seguro, respeitando o fuso America/Sao_Paulo.
-- A transação é finalizada com ROLLBACK obrigatório.

BEGIN;

DO $$
DECLARE
    negocio_a uuid;
    negocio_b uuid;
    fabricante_a uuid;
    fabricante_b uuid;
    ro_aguardando uuid;
    ro_analise uuid;
    ro_vencendo_15 uuid;
    ro_vencendo_limite uuid;
    ro_vencendo_fora uuid;
    hoje_sp date;
    resumo_json jsonb;
    i integer;
BEGIN
    hoje_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

    SELECT id INTO negocio_a FROM public.negocios ORDER BY id LIMIT 1;
    SELECT id INTO negocio_b FROM public.negocios WHERE id <> negocio_a ORDER BY id LIMIT 1;
    IF negocio_a IS NULL OR negocio_b IS NULL THEN
        RAISE EXCEPTION 'Teste de agregação requer dois negócios existentes no banco';
    END IF;

    INSERT INTO public.fabricantes_ro (nome, prazo_inicial_sugerido_dias, limite_renovacoes)
    VALUES ('Fabricante Alpha Teste Resumo', 90, 3)
    RETURNING id INTO fabricante_a;

    INSERT INTO public.fabricantes_ro (nome, prazo_inicial_sugerido_dias, limite_renovacoes)
    VALUES ('Fabricante Beta Teste Resumo', 60, 2)
    RETURNING id INTO fabricante_b;

    -- 1. Cria 60 registros em lote (mais que uma página de 50 registros)
    FOR i IN 1..60 LOOP
        INSERT INTO public.registros_oportunidade (
            negocio_id, fabricante_id, numero_ro, categoria, situacao,
            data_solicitacao, data_aprovacao, data_vencimento
        ) VALUES (
            negocio_a,
            fabricante_a,
            'RO-LOTE-' || i,
            'Infraestrutura',
            'Backoffice',
            hoje_sp - 10,
            NULL,
            NULL
        );
    END LOOP;

    -- 2. Registro com situação "Aguardando aprovação"
    INSERT INTO public.registros_oportunidade (
        negocio_id, fabricante_id, numero_ro, categoria, situacao,
        data_solicitacao
    ) VALUES (
        negocio_a, fabricante_a, 'RO-AGUARDANDO-1', 'Nuvem', 'Aguardando aprovação', hoje_sp - 2
    ) RETURNING id INTO ro_aguardando;

    -- 3. Registro com renovação em análise
    INSERT INTO public.registros_oportunidade (
        negocio_id, fabricante_id, numero_ro, categoria, situacao,
        data_solicitacao, data_aprovacao, data_vencimento
    ) VALUES (
        negocio_b, fabricante_b, 'RO-ANALISE-1', 'Segurança', 'Aprovada',
        hoje_sp - 40, hoje_sp - 35, hoje_sp + 60
    ) RETURNING id INTO ro_analise;

    INSERT INTO public.renovacoes_ro (
        registro_oportunidade_id, ciclo, situacao, data_solicitacao, autor_clickup_id
    ) VALUES (
        ro_analise, 1, 'Em análise', hoje_sp - 5, '90848927'
    );

    -- 4. Registro vencendo em 10 dias (dentro da janela de 15 dias)
    INSERT INTO public.registros_oportunidade (
        negocio_id, fabricante_id, numero_ro, categoria, situacao,
        data_solicitacao, data_aprovacao, data_vencimento
    ) VALUES (
        negocio_a, fabricante_b, 'RO-VENC-10D', 'Software', 'Aprovada',
        hoje_sp - 20, hoje_sp - 18, hoje_sp + 10
    ) RETURNING id INTO ro_vencendo_15;

    -- 5. Registro vencendo no limite exato de 15 dias
    INSERT INTO public.registros_oportunidade (
        negocio_id, fabricante_id, numero_ro, categoria, situacao,
        data_solicitacao, data_aprovacao, data_vencimento
    ) VALUES (
        negocio_b, fabricante_a, 'RO-VENC-15D', 'Hardware', 'Aprovada',
        hoje_sp - 30, hoje_sp - 25, hoje_sp + 15
    ) RETURNING id INTO ro_vencendo_limite;

    -- 6. Registro vencendo em 16 dias (fora da janela de 15 dias)
    INSERT INTO public.registros_oportunidade (
        negocio_id, fabricante_id, numero_ro, categoria, situacao,
        data_solicitacao, data_aprovacao, data_vencimento
    ) VALUES (
        negocio_b, fabricante_a, 'RO-VENC-16D', 'Hardware', 'Aprovada',
        hoje_sp - 30, hoje_sp - 25, hoje_sp + 16
    ) RETURNING id INTO ro_vencendo_fora;

    -- Teste A: Agregação global (mais de uma página, > 60 registros criados)
    resumo_json := public.ro_resumo_agregado();
    IF (resumo_json->>'total')::bigint < 65 THEN
        RAISE EXCEPTION 'Total geral esperado >= 65, obtido: %', resumo_json->>'total';
    END IF;
    IF (resumo_json->>'aguardando_aprovacao')::bigint < 1 THEN
        RAISE EXCEPTION 'Aguardando aprovação esperado >= 1';
    END IF;
    IF (resumo_json->>'renovacoes_em_analise')::bigint < 1 THEN
        RAISE EXCEPTION 'Renovações em análise esperado >= 1';
    END IF;
    IF (resumo_json->>'vencem_15_dias')::bigint < 2 THEN
        RAISE EXCEPTION 'Vencem em até 15 dias esperado >= 2 (10d e 15d)';
    END IF;

    -- Teste B: Filtro combinado por fabricante_b
    resumo_json := public.ro_resumo_agregado(p_fabricante_id => fabricante_b);
    IF (resumo_json->>'total')::bigint <> 2 THEN
        RAISE EXCEPTION 'Fabricante B deveria ter 2 registros, obtido: %', resumo_json->>'total';
    END IF;
    IF (resumo_json->>'renovacoes_em_analise')::bigint <> 1 THEN
        RAISE EXCEPTION 'Fabricante B deveria ter 1 renovação em análise';
    END IF;
    IF (resumo_json->>'vencem_15_dias')::bigint <> 1 THEN
        RAISE EXCEPTION 'Fabricante B deveria ter 1 registro vencendo em até 15 dias';
    END IF;

    -- Teste C: Filtro por número exato/ilike
    resumo_json := public.ro_resumo_agregado(p_numero_ro => 'RO-VENC-10D');
    IF (resumo_json->>'total')::bigint <> 1 OR (resumo_json->>'vencem_15_dias')::bigint <> 1 THEN
        RAISE EXCEPTION 'Filtro por número da R.O. falhou';
    END IF;

    -- Teste D: Conjunto vazio (nenhum registro atende ao critério)
    resumo_json := public.ro_resumo_agregado(p_numero_ro => 'RO-INEXISTENTE-TOTALMENTE-XYZ');
    IF (resumo_json->>'total')::bigint <> 0
       OR (resumo_json->>'aguardando_aprovacao')::bigint <> 0
       OR (resumo_json->>'renovacoes_em_analise')::bigint <> 0
       OR (resumo_json->>'vencem_15_dias')::bigint <> 0 THEN
        RAISE EXCEPTION 'Conjunto vazio deveria retornar zeros, obtido: %', resumo_json;
    END IF;

END;
$$;

ROLLBACK;
