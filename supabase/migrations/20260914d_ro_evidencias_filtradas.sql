-- Paginação das evidências com o mesmo conjunto de situações exibido no painel.
-- Evita URLs grandes quando a busca textual encontra muitas oportunidades.
CREATE OR REPLACE FUNCTION public.ro_listar_ids_evidencias_filtrados(
    p_negocio_id uuid DEFAULT NULL,
    p_fabricante_id uuid DEFAULT NULL,
    p_fabricante text DEFAULT NULL,
    p_situacoes text[] DEFAULT NULL,
    p_responsavel text DEFAULT NULL,
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
        LEFT JOIN public.fabricantes_ro f ON f.id = ro.fabricante_id
        WHERE
            (p_negocio_id IS NULL OR ro.negocio_id = p_negocio_id)
            AND (p_fabricante_id IS NULL OR ro.fabricante_id = p_fabricante_id)
            AND (nullif(btrim(p_fabricante), '') IS NULL OR f.nome ILIKE ('%' || btrim(p_fabricante) || '%'))
            AND (p_situacoes IS NULL OR ro.situacao = ANY(p_situacoes))
            AND (p_responsavel IS NULL OR ro.responsavel_operacional_clickup_id = p_responsavel)
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

REVOKE ALL ON FUNCTION public.ro_listar_ids_evidencias_filtrados(
    uuid, uuid, text, text[], text, text, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ro_listar_ids_evidencias_filtrados(
    uuid, uuid, text, text[], text, text, text, text, text, integer, integer
) TO service_role;
