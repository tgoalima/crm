-- Migration: 20260912f_ro_substituir_validacoes.sql
-- Propósito: Reforçar validações na RPC ro_substituir:
--   1. Bloquear substituição se a R.O. anterior tiver renovação pendente (Em análise)
--   2. Bloquear substituição se a R.O. anterior já tiver uma sucessora não-final
--      (impedir múltiplos sucessores simultâneos)
-- Abordagem: DROP + CREATE da função, mantendo a mesma assinatura e grants.

BEGIN;

-- Drop da função atual para recriá-la com validações adicionais
DROP FUNCTION IF EXISTS public.ro_substituir(uuid, integer, text, text, text);

CREATE FUNCTION public.ro_substituir(
    p_ro_anterior_id uuid, p_versao_esperada integer DEFAULT NULL,
    p_request_id text DEFAULT NULL, p_autor_clickup_id text DEFAULT NULL,
    p_autor_nome text DEFAULT NULL
) RETURNS public.registros_oportunidade
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    anterior public.registros_oportunidade;
    resultado public.registros_oportunidade;
    tem_renovacao_pendente boolean;
    tem_sucessora_ativa boolean;
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
         WHERE e.dados->>'request_id' = p_request_id AND e.tipo = 'Substituição iniciada'
         LIMIT 1;
        IF FOUND THEN RETURN resultado; END IF;
    END IF;

    -- Bloquear a linha da R.O. anterior
    SELECT * INTO anterior FROM public.registros_oportunidade
     WHERE id = p_ro_anterior_id FOR UPDATE;
    IF NOT FOUND OR anterior.situacao <> 'Aprovada' THEN
        RAISE EXCEPTION 'R.O. anterior não encontrada ou não está aprovada';
    END IF;

    -- Verificar conflito de versão
    IF p_versao_esperada IS NOT NULL AND anterior.versao <> p_versao_esperada THEN
        RAISE EXCEPTION 'Conflito de versão da R.O. anterior (esperada: %, atual: %)',
            p_versao_esperada, anterior.versao USING ERRCODE = 'P0001';
    END IF;

    -- Verificar renovação pendente na R.O. anterior
    SELECT EXISTS (
        SELECT 1 FROM public.renovacoes_ro
         WHERE registro_oportunidade_id = p_ro_anterior_id
           AND situacao = 'Em análise'
    ) INTO tem_renovacao_pendente;
    IF tem_renovacao_pendente THEN
        RAISE EXCEPTION 'Não é possível substituir uma R.O. com renovação pendente. Responda a renovação antes de iniciar a substituição.';
    END IF;

    -- Verificar se já existe uma sucessora não-final (Backoffice ou Aguardando aprovação)
    SELECT EXISTS (
        SELECT 1 FROM public.registros_oportunidade
         WHERE ro_anterior_id = p_ro_anterior_id
           AND situacao NOT IN ('Reprovada', 'Encerrada')
    ) INTO tem_sucessora_ativa;
    IF tem_sucessora_ativa THEN
        RAISE EXCEPTION 'Esta R.O. já possui uma substituição em andamento.';
    END IF;

    -- Criar a R.O. sucessora em Backoffice
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

-- Restaurar grants (mesma assinatura)
REVOKE ALL ON FUNCTION public.ro_substituir(uuid, integer, text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ro_substituir(uuid, integer, text, text, text)
    TO service_role;

COMMIT;
