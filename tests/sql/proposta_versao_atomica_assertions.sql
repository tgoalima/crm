-- Executar somente num ambiente de teste; a transação termina em rollback.
BEGIN;

DO $$
DECLARE
  negocio text := 'teste-versao-atomica';
  base_a uuid;
  base_r uuid;
  nova_id uuid;
  nova_versao text;
BEGIN
  INSERT INTO public.propostas (clickup_negocio_id, versao, cenario, situacao, total_proposta, criado_por)
  VALUES (negocio, 'vA', 'Teste', 'Desconsiderada', 10, 'Teste') RETURNING id INTO base_a;
  INSERT INTO public.propostas (clickup_negocio_id, versao, cenario, situacao, total_proposta, criado_por)
  VALUES (negocio, 'vR', 'Teste', 'Ativa', 20, 'Teste') RETURNING id INTO base_r;

  SELECT id, versao INTO nova_id, nova_versao
  FROM public.gerar_proxima_versao_proposta(negocio, 'Teste', NULL);

  IF nova_versao <> 'vS' THEN
    RAISE EXCEPTION 'Esperava vS após vA e vR; obtido %', nova_versao;
  END IF;
  IF (SELECT total_proposta FROM public.propostas WHERE id = nova_id) <> 20 THEN
    RAISE EXCEPTION 'A nova proposta deve clonar a maior versão (vR)';
  END IF;
END;
$$;

ROLLBACK;
