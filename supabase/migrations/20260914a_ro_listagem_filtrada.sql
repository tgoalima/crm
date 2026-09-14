-- Paginação oficial da lista de R.Os, com filtros executados no banco.
-- Evita montar URLs do PostgREST com centenas de IDs de oportunidades.
CREATE OR REPLACE FUNCTION public.ro_listar_ids_filtrados(
    p_conta_id uuid DEFAULT NULL,
    p_negocio_id uuid DEFAULT NULL,
    p_fabricante_id uuid DEFAULT NULL,
    p_situacao text DEFAULT NULL,
    p_responsavel text DEFAULT NULL,
    p_vence_ate date DEFAULT NULL,
    p_cliente text DEFAULT NULL,
    p_oportunidade text DEFAULT NULL,
    p_numero_ro text DEFAULT NULL,
    p_busca text DEFAULT NULL,
    p_pagina integer DEFAULT 1,
    p_limite integer DEFAULT 50
)
RETURNS TABLE(id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH filtrados AS (
        SELECT ro.id, ro.data_vencimento
        FROM public.registros_oportunidade ro
        JOIN public.negocios n ON n.id = ro.negocio_id
        LEFT JOIN public.contas c ON c.id = n.conta_id
        WHERE
            (p_conta_id IS NULL OR n.conta_id = p_conta_id)
            AND (p_negocio_id IS NULL OR ro.negocio_id = p_negocio_id)
            AND (p_fabricante_id IS NULL OR ro.fabricante_id = p_fabricante_id)
            AND (p_situacao IS NULL OR ro.situacao = p_situacao)
            AND (p_responsavel IS NULL OR ro.responsavel_operacional_clickup_id = p_responsavel)
            AND (p_vence_ate IS NULL OR ro.data_vencimento <= p_vence_ate)
            AND (nullif(btrim(p_cliente), '') IS NULL OR (
                c.nome ILIKE ('%' || btrim(p_cliente) || '%')
                OR c.razao_social ILIKE ('%' || btrim(p_cliente) || '%')
            ))
            AND (nullif(btrim(p_oportunidade), '') IS NULL OR n.nome ILIKE ('%' || btrim(p_oportunidade) || '%'))
            AND (nullif(btrim(p_numero_ro), '') IS NULL OR ro.numero_ro ILIKE ('%' || btrim(p_numero_ro) || '%'))
            AND (nullif(btrim(p_busca), '') IS NULL OR (
                ro.numero_ro ILIKE ('%' || btrim(p_busca) || '%')
                OR n.nome ILIKE ('%' || btrim(p_busca) || '%')
                OR c.nome ILIKE ('%' || btrim(p_busca) || '%')
                OR c.razao_social ILIKE ('%' || btrim(p_busca) || '%')
            ))
    )
    SELECT id, count(*) OVER () AS total
    FROM filtrados
    ORDER BY data_vencimento ASC NULLS LAST, id ASC
    OFFSET greatest(p_pagina - 1, 0) * greatest(p_limite, 1)
    LIMIT greatest(p_limite, 1);
$$;

REVOKE ALL ON FUNCTION public.ro_listar_ids_filtrados(
    uuid, uuid, uuid, text, text, date, text, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ro_listar_ids_filtrados(
    uuid, uuid, uuid, text, text, date, text, text, text, text, integer, integer
) TO service_role;
