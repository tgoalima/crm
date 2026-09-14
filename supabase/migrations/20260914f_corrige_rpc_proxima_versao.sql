-- Corrige ambiguidade entre a coluna propostas.id e o campo de saída id da RPC.
-- Necessária para bancos que já receberam a migration 20260914e.

CREATE OR REPLACE FUNCTION public.gerar_proxima_versao_proposta(
  p_clickup_negocio_id text,
  p_criado_por text,
  p_criado_por_user_id text DEFAULT NULL
)
RETURNS TABLE (id uuid, versao text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_id_sem_hash text := regexp_replace(btrim(coalesce(p_clickup_negocio_id, '')), '^#', '');
  v_id_com_hash text;
  v_base public.propostas%ROWTYPE;
  v_nova_versao text;
  v_novo_id uuid;
BEGIN
  IF v_id_sem_hash = '' THEN
    RAISE EXCEPTION 'O identificador da oportunidade é obrigatório.';
  END IF;
  v_id_com_hash := '#' || v_id_sem_hash;

  PERFORM pg_advisory_xact_lock(hashtext(v_id_sem_hash));

  SELECT p.* INTO v_base
  FROM public.propostas AS p
  WHERE p.clickup_negocio_id IN (v_id_sem_hash, v_id_com_hash)
  ORDER BY public.proposta_versao_rank(p.versao) DESC, p.created_at DESC, p.id DESC
  LIMIT 1;

  IF NOT FOUND OR public.proposta_versao_rank(v_base.versao) = 0 THEN
    RAISE EXCEPTION 'Não existe uma versão válida para criar a próxima proposta desta oportunidade.';
  END IF;

  v_nova_versao := public.increment_version_code(v_base.versao);
  INSERT INTO public.propostas (
    clickup_negocio_id, versao, cenario, situacao, total_proposta,
    criado_por, criado_por_user_id, data_inicio, data_fechamento
  ) VALUES (
    v_base.clickup_negocio_id, v_nova_versao, v_base.cenario, 'Ativa', v_base.total_proposta,
    coalesce(nullif(btrim(p_criado_por), ''), v_base.criado_por),
    coalesce(nullif(btrim(p_criado_por_user_id), ''), v_base.criado_por_user_id),
    v_base.data_inicio, NULL
  ) RETURNING propostas.id INTO v_novo_id;

  INSERT INTO public.itens_proposta (proposta_id, produto_id, distribuidor_id, quantidade, preco_unitario)
  SELECT v_novo_id, produto_id, distribuidor_id, quantidade, preco_unitario
  FROM public.itens_proposta
  WHERE proposta_id = v_base.id;

  RETURN QUERY SELECT v_novo_id, v_nova_versao;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gerar_proxima_versao_proposta(text, text, text)
  TO anon, authenticated;
