-- supabase/migrations/20260818_negocios_contatos_sync_numeracao.sql
--
-- Suporte a criação assíncrona (SPA grava no Supabase na hora, ClickUp
-- sincroniza depois em segundo plano) + gerador interno de numeração de
-- propostas (substitui o Apps Script/planilha do Google no caminho crítico
-- de criação — ver docs/superpowers/specs/2026-08-17-empresa-360-design.md).

ALTER TABLE public.negocios
  ALTER COLUMN clickup_negocio_id DROP NOT NULL,
  ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced',
  ADD COLUMN sync_error TEXT,
  ADD COLUMN numero_proposta_oficial TEXT;

ALTER TABLE public.contatos
  ALTER COLUMN clickup_contact_id DROP NOT NULL,
  ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced',
  ADD COLUMN sync_error TEXT;

ALTER TABLE public.propostas
  DROP COLUMN IF EXISTS numero_proposta_oficial;

CREATE TABLE public.config_numeracao_propostas (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ultimo_numero INT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.config_numeracao_propostas (id, ultimo_numero, ativo) VALUES (1, 13202, true);

ALTER TABLE public.config_numeracao_propostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sel" ON public.config_numeracao_propostas FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.gerar_numero_proposta()
RETURNS TEXT AS $$
DECLARE
  v_novo_numero INT;
  v_ativo BOOLEAN;
BEGIN
  SELECT ativo INTO v_ativo FROM public.config_numeracao_propostas WHERE id = 1;
  IF NOT v_ativo THEN
    RETURN NULL;
  END IF;

  UPDATE public.config_numeracao_propostas
  SET ultimo_numero = ultimo_numero + 1, updated_at = now()
  WHERE id = 1
  RETURNING ultimo_numero INTO v_novo_numero;

  RETURN v_novo_numero || '/' || EXTRACT(YEAR FROM now())::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.ajustar_numeracao_proposta(novo_numero INT DEFAULT NULL, novo_ativo BOOLEAN DEFAULT NULL)
RETURNS TABLE(ultimo_numero INT, ativo BOOLEAN) AS $$
BEGIN
  UPDATE public.config_numeracao_propostas
  SET
    ultimo_numero = COALESCE(novo_numero, config_numeracao_propostas.ultimo_numero),
    ativo = COALESCE(novo_ativo, config_numeracao_propostas.ativo),
    updated_at = now()
  WHERE id = 1;

  RETURN QUERY SELECT c.ultimo_numero, c.ativo FROM public.config_numeracao_propostas c WHERE c.id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.gerar_numero_proposta() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_numeracao_proposta(INT, BOOLEAN) TO anon, authenticated;
