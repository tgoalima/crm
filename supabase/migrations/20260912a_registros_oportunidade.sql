-- Gestão de Registros de Oportunidade (R.O.).
--
-- Regras centrais:
--   * toda R.O. pertence a um negócio existente;
--   * renovação mantém o número e preserva os vencimentos anteriores;
--   * substituição cria outra R.O. no mesmo negócio;
--   * leitura é compartilhada, mas mutações são feitas por Edge Functions
--     com service_role, para validar autoria e registrar eventos.

CREATE TABLE public.fabricantes_ro (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    prazo_inicial_sugerido_dias integer,
    limite_renovacoes integer,
    ativo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fabricantes_ro_nome_preenchido CHECK (btrim(nome) <> ''),
    CONSTRAINT fabricantes_ro_prazo_positivo CHECK (
        prazo_inicial_sugerido_dias IS NULL OR prazo_inicial_sugerido_dias > 0
    ),
    CONSTRAINT fabricantes_ro_limite_nao_negativo CHECK (
        limite_renovacoes IS NULL OR limite_renovacoes >= 0
    )
);

CREATE UNIQUE INDEX fabricantes_ro_nome_unico
    ON public.fabricantes_ro (lower(btrim(nome)));

CREATE TABLE public.registros_oportunidade (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id uuid NOT NULL REFERENCES public.negocios(id) ON DELETE RESTRICT,
    fabricante_id uuid NOT NULL REFERENCES public.fabricantes_ro(id) ON DELETE RESTRICT,
    numero_ro text,
    categoria text NOT NULL,
    titulo text,
    cenario text,
    situacao text NOT NULL DEFAULT 'Backoffice',
    data_solicitacao date,
    data_aprovacao date,
    data_vencimento date,
    data_encerramento date,
    motivo_encerramento text,
    responsavel_operacional_clickup_id text,
    ro_anterior_id uuid REFERENCES public.registros_oportunidade(id) ON DELETE RESTRICT,
    clickup_task_id text UNIQUE,
    origem_sistema text,
    origem_id text,
    versao integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT registros_oportunidade_categoria_preenchida CHECK (btrim(categoria) <> ''),
    CONSTRAINT registros_oportunidade_numero_preenchido CHECK (
        numero_ro IS NULL OR btrim(numero_ro) <> ''
    ),
    CONSTRAINT registros_oportunidade_situacao_valida CHECK (situacao IN (
        'Backoffice', 'Aguardando aprovação', 'Aprovada', 'Reprovada',
        'Encerrada', 'Substituída'
    )),
    CONSTRAINT registros_oportunidade_datas_aprovacao CHECK (
        data_aprovacao IS NULL OR data_solicitacao IS NULL OR data_aprovacao >= data_solicitacao
    ),
    CONSTRAINT registros_oportunidade_datas_vencimento CHECK (
        data_vencimento IS NULL OR data_aprovacao IS NULL OR data_vencimento >= data_aprovacao
    ),
    CONSTRAINT registros_oportunidade_encerramento_coerente CHECK (
        (situacao IN ('Reprovada', 'Encerrada', 'Substituída')) = (data_encerramento IS NOT NULL)
    ),
    CONSTRAINT registros_oportunidade_sem_autorreferencia CHECK (ro_anterior_id IS NULL OR ro_anterior_id <> id),
    CONSTRAINT registros_oportunidade_origem_completa CHECK (
        (origem_sistema IS NULL) = (origem_id IS NULL)
    ),
    CONSTRAINT registros_oportunidade_versao_positiva CHECK (versao > 0)
);

CREATE INDEX registros_oportunidade_negocio_idx
    ON public.registros_oportunidade (negocio_id);
CREATE INDEX registros_oportunidade_fabricante_idx
    ON public.registros_oportunidade (fabricante_id);
CREATE INDEX registros_oportunidade_situacao_idx
    ON public.registros_oportunidade (situacao);
CREATE INDEX registros_oportunidade_vencimento_ativo_idx
    ON public.registros_oportunidade (data_vencimento)
    WHERE situacao IN ('Aprovada', 'Aguardando aprovação');
CREATE UNIQUE INDEX registros_oportunidade_numero_fabricante_unico
    ON public.registros_oportunidade (fabricante_id, lower(btrim(numero_ro)))
    WHERE numero_ro IS NOT NULL;
CREATE UNIQUE INDEX registros_oportunidade_origem_unica
    ON public.registros_oportunidade (origem_sistema, origem_id)
    WHERE origem_sistema IS NOT NULL;
CREATE UNIQUE INDEX registros_oportunidade_uma_sucessora
    ON public.registros_oportunidade (ro_anterior_id)
    WHERE ro_anterior_id IS NOT NULL;

CREATE TABLE public.renovacoes_ro (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_oportunidade_id uuid NOT NULL
        REFERENCES public.registros_oportunidade(id) ON DELETE RESTRICT,
    ciclo integer NOT NULL,
    situacao text NOT NULL DEFAULT 'Em análise',
    data_solicitacao date NOT NULL,
    data_resposta date,
    vencimento_anterior date,
    novo_vencimento date,
    motivo_negativa text,
    autor_clickup_id text NOT NULL,
    autor_nome text,
    evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT renovacoes_ro_ciclo_positivo CHECK (ciclo > 0),
    CONSTRAINT renovacoes_ro_situacao_valida CHECK (situacao IN ('Em análise', 'Aprovada', 'Negada')),
    CONSTRAINT renovacoes_ro_resposta_coerente CHECK (
        (situacao = 'Em análise' AND data_resposta IS NULL AND novo_vencimento IS NULL)
        OR (situacao = 'Aprovada' AND data_resposta IS NOT NULL AND novo_vencimento IS NOT NULL)
        OR (situacao = 'Negada' AND data_resposta IS NOT NULL AND novo_vencimento IS NULL)
    ),
    CONSTRAINT renovacoes_ro_novo_vencimento CHECK (
        novo_vencimento IS NULL OR vencimento_anterior IS NULL OR novo_vencimento > vencimento_anterior
    ),
    CONSTRAINT renovacoes_ro_evidencias_array CHECK (jsonb_typeof(evidencias) = 'array'),
    UNIQUE (registro_oportunidade_id, ciclo)
);

CREATE UNIQUE INDEX renovacoes_ro_uma_pendente
    ON public.renovacoes_ro (registro_oportunidade_id)
    WHERE situacao = 'Em análise';
CREATE INDEX renovacoes_ro_registro_idx
    ON public.renovacoes_ro (registro_oportunidade_id, ciclo DESC);

CREATE TABLE public.eventos_ro (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_oportunidade_id uuid NOT NULL
        REFERENCES public.registros_oportunidade(id) ON DELETE RESTRICT,
    tipo text NOT NULL,
    autor_clickup_id text,
    autor_nome text,
    origem text NOT NULL,
    dados jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT eventos_ro_tipo_preenchido CHECK (btrim(tipo) <> ''),
    CONSTRAINT eventos_ro_origem_preenchida CHECK (btrim(origem) <> ''),
    CONSTRAINT eventos_ro_dados_objeto CHECK (jsonb_typeof(dados) = 'object')
);

CREATE INDEX eventos_ro_registro_data_idx
    ON public.eventos_ro (registro_oportunidade_id, created_at DESC);

CREATE FUNCTION public.ro_atualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_TABLE_NAME = 'registros_oportunidade' AND TG_OP = 'UPDATE' THEN
        NEW.versao := OLD.versao + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER fabricantes_ro_atualizar_timestamp
BEFORE UPDATE ON public.fabricantes_ro
FOR EACH ROW EXECUTE FUNCTION public.ro_atualizar_timestamp();

CREATE TRIGGER registros_oportunidade_atualizar_timestamp
BEFORE UPDATE ON public.registros_oportunidade
FOR EACH ROW EXECUTE FUNCTION public.ro_atualizar_timestamp();

CREATE TRIGGER renovacoes_ro_atualizar_timestamp
BEFORE UPDATE ON public.renovacoes_ro
FOR EACH ROW EXECUTE FUNCTION public.ro_atualizar_timestamp();

CREATE FUNCTION public.ro_validar_substituicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    anterior record;
    ciclo_encontrado boolean;
BEGIN
    IF NEW.ro_anterior_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT negocio_id, fabricante_id
      INTO anterior
      FROM public.registros_oportunidade
     WHERE id = NEW.ro_anterior_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'R.O. anterior não encontrada';
    END IF;
    IF anterior.negocio_id <> NEW.negocio_id THEN
        RAISE EXCEPTION 'R.O. substituta deve pertencer à mesma oportunidade';
    END IF;
    IF anterior.fabricante_id <> NEW.fabricante_id THEN
        RAISE EXCEPTION 'R.O. substituta deve pertencer ao mesmo fabricante';
    END IF;

    WITH RECURSIVE ancestrais AS (
        SELECT id, ro_anterior_id
          FROM public.registros_oportunidade
         WHERE id = NEW.ro_anterior_id
        UNION
        SELECT r.id, r.ro_anterior_id
          FROM public.registros_oportunidade r
          JOIN ancestrais a ON r.id = a.ro_anterior_id
    )
    SELECT EXISTS (SELECT 1 FROM ancestrais WHERE id = NEW.id)
      INTO ciclo_encontrado;
    IF ciclo_encontrado THEN
        RAISE EXCEPTION 'A cadeia de substituição de R.O. não pode ser circular';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER registros_oportunidade_validar_substituicao
BEFORE INSERT OR UPDATE OF ro_anterior_id, negocio_id, fabricante_id
ON public.registros_oportunidade
FOR EACH ROW EXECUTE FUNCTION public.ro_validar_substituicao();

CREATE FUNCTION public.ro_validar_ciclo_renovacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    limite integer;
    proximo_ciclo integer;
BEGIN
    -- Serializa novas renovações da mesma R.O. para evitar dois ciclos iguais
    -- ou fora de ordem em requisições concorrentes.
    PERFORM 1
      FROM public.registros_oportunidade
     WHERE id = NEW.registro_oportunidade_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'R.O. não encontrada';
    END IF;

    SELECT f.limite_renovacoes
      INTO limite
      FROM public.registros_oportunidade r
      JOIN public.fabricantes_ro f ON f.id = r.fabricante_id
     WHERE r.id = NEW.registro_oportunidade_id;

    SELECT COALESCE(max(ciclo), 0) + 1
      INTO proximo_ciclo
      FROM public.renovacoes_ro
     WHERE registro_oportunidade_id = NEW.registro_oportunidade_id
       AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF TG_OP = 'INSERT' AND NEW.ciclo <> proximo_ciclo THEN
        RAISE EXCEPTION 'Ciclo de renovação inválido; esperado %', proximo_ciclo;
    END IF;
    IF limite IS NOT NULL AND NEW.ciclo > limite THEN
        RAISE EXCEPTION 'Limite de % renovações atingido para o fabricante', limite;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER renovacoes_ro_validar_ciclo
BEFORE INSERT OR UPDATE OF registro_oportunidade_id, ciclo
ON public.renovacoes_ro
FOR EACH ROW EXECUTE FUNCTION public.ro_validar_ciclo_renovacao();

CREATE FUNCTION public.ro_aplicar_renovacao_aprovada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    vencimento_atual date;
BEGIN
    IF NEW.situacao <> 'Aprovada' OR (TG_OP = 'UPDATE' AND OLD.situacao = 'Aprovada') THEN
        RETURN NEW;
    END IF;

    SELECT data_vencimento
      INTO vencimento_atual
      FROM public.registros_oportunidade
     WHERE id = NEW.registro_oportunidade_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'R.O. não encontrada';
    END IF;
    IF vencimento_atual IS DISTINCT FROM NEW.vencimento_anterior THEN
        RAISE EXCEPTION 'O vencimento anterior mudou; recarregue a R.O. antes de aprovar a renovação';
    END IF;

    UPDATE public.registros_oportunidade
       SET data_vencimento = NEW.novo_vencimento,
           situacao = 'Aprovada'
     WHERE id = NEW.registro_oportunidade_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER renovacoes_ro_aplicar_aprovacao
AFTER INSERT OR UPDATE OF situacao ON public.renovacoes_ro
FOR EACH ROW EXECUTE FUNCTION public.ro_aplicar_renovacao_aprovada();

ALTER TABLE public.fabricantes_ro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renovacoes_ro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_ro ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.fabricantes_ro TO anon, authenticated;
GRANT SELECT ON public.registros_oportunidade TO anon, authenticated;
GRANT SELECT ON public.renovacoes_ro TO anon, authenticated;
GRANT SELECT ON public.eventos_ro TO anon, authenticated;
GRANT ALL ON public.fabricantes_ro TO service_role;
GRANT ALL ON public.registros_oportunidade TO service_role;
GRANT ALL ON public.renovacoes_ro TO service_role;
GRANT ALL ON public.eventos_ro TO service_role;

REVOKE ALL ON FUNCTION public.ro_atualizar_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_validar_substituicao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_validar_ciclo_renovacao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ro_aplicar_renovacao_aprovada() FROM PUBLIC, anon, authenticated;

CREATE POLICY fabricantes_ro_leitura ON public.fabricantes_ro
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY registros_oportunidade_leitura ON public.registros_oportunidade
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY renovacoes_ro_leitura ON public.renovacoes_ro
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY eventos_ro_leitura ON public.eventos_ro
    FOR SELECT TO anon, authenticated USING (true);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.registros_oportunidade;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.renovacoes_ro;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos_ro;
    END IF;
END;
$$;

COMMENT ON COLUMN public.registros_oportunidade.data_vencimento IS
    'Data confirmada pelo fabricante; prazo sugerido não deve ser gravado como confirmação.';
COMMENT ON COLUMN public.registros_oportunidade.ro_anterior_id IS
    'R.O. substituída por esta; ambas devem pertencer ao mesmo negócio e fabricante.';
COMMENT ON TABLE public.eventos_ro IS
    'Histórico append-only mantido pelas operações de servidor da R.O.';
