-- Resumo agregado e contadores oficiais de R.Os (Task 3.1).
--
-- Regras obrigatórias:
--   * cálculo efetuado inteiramente no banco de dados sobre todo o conjunto filtrado;
--   * filtros explícitos com parâmetros tipados, sem SQL dinâmico;
--   * search_path fixado com segurança (SET search_path = public);
--   * data civil de referência e limite de 15 dias calculados em America/Sao_Paulo;
--   * contagem de renovações em análise verifica existência na tabela renovacoes_ro.

CREATE OR REPLACE FUNCTION public.ro_resumo_agregado(
    p_negocio_id uuid DEFAULT NULL,
    p_fabricante_id uuid DEFAULT NULL,
    p_situacao text DEFAULT NULL,
    p_responsavel text DEFAULT NULL,
    p_vence_ate date DEFAULT NULL,
    p_cliente text DEFAULT NULL,
    p_oportunidade text DEFAULT NULL,
    p_numero_ro text DEFAULT NULL,
    p_busca text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    hoje_sp date;
    limite_15_sp date;
    v_total bigint := 0;
    v_aguardando bigint := 0;
    v_renovacoes_em_analise bigint := 0;
    v_vencem_15_dias bigint := 0;
    v_busca_limpa text;
    v_cliente_limpo text;
    v_oportunidade_limpa text;
    v_numero_limpo text;
BEGIN
    -- Data civil de referência e janela de 15 dias em America/Sao_Paulo
    hoje_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    limite_15_sp := (hoje_sp + interval '15 days')::date;

    v_busca_limpa := nullif(btrim(p_busca), '');
    v_cliente_limpo := nullif(btrim(p_cliente), '');
    v_oportunidade_limpa := nullif(btrim(p_oportunidade), '');
    v_numero_limpo := nullif(btrim(p_numero_ro), '');

    SELECT
        count(*),
        count(*) FILTER (WHERE ro.situacao = 'Aguardando aprovação'),
        count(*) FILTER (
            WHERE EXISTS (
                SELECT 1
                FROM public.renovacoes_ro ren
                WHERE ren.registro_oportunidade_id = ro.id
                  AND ren.situacao = 'Em análise'
            )
        ),
        count(*) FILTER (
            WHERE ro.situacao = 'Aprovada'
              AND ro.data_vencimento IS NOT NULL
              AND ro.data_vencimento >= hoje_sp
              AND ro.data_vencimento <= limite_15_sp
        )
    INTO
        v_total,
        v_aguardando,
        v_renovacoes_em_analise,
        v_vencem_15_dias
    FROM public.registros_oportunidade ro
    JOIN public.negocios n ON n.id = ro.negocio_id
    LEFT JOIN public.contas c ON c.id = n.conta_id
    LEFT JOIN public.fabricantes_ro f ON f.id = ro.fabricante_id
    WHERE
        -- Filtro por negócio / oportunidade
        (p_negocio_id IS NULL OR ro.negocio_id = p_negocio_id)
        -- Filtro por fabricante
        AND (p_fabricante_id IS NULL OR ro.fabricante_id = p_fabricante_id)
        -- Filtro por situação
        AND (p_situacao IS NULL OR ro.situacao = p_situacao)
        -- Filtro por responsável operacional
        AND (p_responsavel IS NULL OR ro.responsavel_operacional_clickup_id = p_responsavel)
        -- Filtro por data de vencimento
        AND (p_vence_ate IS NULL OR ro.data_vencimento <= p_vence_ate)
        -- Filtro específico por oportunidade/projeto
        AND (v_oportunidade_limpa IS NULL OR n.nome ILIKE ('%' || v_oportunidade_limpa || '%'))
        -- Filtro específico por número da R.O.
        AND (v_numero_limpo IS NULL OR ro.numero_ro ILIKE ('%' || v_numero_limpo || '%'))
        -- Filtro específico por cliente (pesquisa em nome e razão social)
        AND (v_cliente_limpo IS NULL OR (
            c.nome ILIKE ('%' || v_cliente_limpo || '%') OR
            c.razao_social ILIKE ('%' || v_cliente_limpo || '%')
        ))
        -- Busca textual ampla abrangendo número, oportunidade e cliente
        AND (v_busca_limpa IS NULL OR (
            ro.numero_ro ILIKE ('%' || v_busca_limpa || '%') OR
            n.nome ILIKE ('%' || v_busca_limpa || '%') OR
            c.nome ILIKE ('%' || v_busca_limpa || '%') OR
            c.razao_social ILIKE ('%' || v_busca_limpa || '%')
        ));

    RETURN jsonb_build_object(
        'total', coalesce(v_total, 0),
        'aguardando_aprovacao', coalesce(v_aguardando, 0),
        'renovacoes_em_analise', coalesce(v_renovacoes_em_analise, 0),
        'vencem_15_dias', coalesce(v_vencem_15_dias, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ro_resumo_agregado(
    uuid, uuid, text, text, date, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ro_resumo_agregado(
    uuid, uuid, text, text, date, text, text, text, text
) TO service_role;
