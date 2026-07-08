-- 1. Criação das Tabelas
CREATE TABLE IF NOT EXISTS produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    fabricante TEXT NOT NULL,
    custo_referencia NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS propostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clickup_negocio_id TEXT NOT NULL,
    versao TEXT NOT NULL, -- Ex: 'vA', 'vB', 'vC'
    cenario TEXT NOT NULL, -- Ex: 'HCI', 'Cloud', 'Tradicional'
    situacao TEXT NOT NULL DEFAULT 'Ativa', -- Estados: 'Ativa', 'Selecionada', 'Não selecionada', 'Substituída'
    total_proposta NUMERIC(10,2) DEFAULT 0.00,
    criado_por TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_proposta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposta_id UUID REFERENCES propostas(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES produtos(id) ON DELETE RESTRICT,
    distribuidor TEXT NOT NULL,
    quantidade INT NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL,
    total_item NUMERIC(10,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Criação de Índices para Performance
CREATE INDEX IF NOT EXISTS idx_propostas_clickup_id ON propostas(clickup_negocio_id);
CREATE INDEX IF NOT EXISTS idx_itens_proposta_id ON itens_proposta(proposta_id);

-- 3. Trigger para Recalcular o Total da Proposta
CREATE OR REPLACE FUNCTION recalculate_total_proposta()
RETURNS TRIGGER AS $$
DECLARE
    v_proposta_id UUID;
    v_total NUMERIC(10,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_proposta_id := OLD.proposta_id;
    ELSE
        v_proposta_id := NEW.proposta_id;
    END IF;

    SELECT COALESCE(SUM(total_item), 0.00)
    INTO v_total
    FROM itens_proposta
    WHERE proposta_id = v_proposta_id;

    UPDATE propostas
    SET total_proposta = v_total
    WHERE id = v_proposta_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_total_proposta ON itens_proposta;
CREATE TRIGGER trigger_recalculate_total_proposta
AFTER INSERT OR UPDATE OR DELETE ON itens_proposta
FOR EACH ROW
EXECUTE FUNCTION recalculate_total_proposta();

-- 4. Trigger para Garantir que Apenas uma Proposta seja 'Selecionada' por ID do ClickUp
CREATE OR REPLACE FUNCTION auto_deselect_other_proposals()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.situacao = 'Selecionada' AND (OLD.situacao IS DISTINCT FROM 'Selecionada' OR TG_OP = 'INSERT') THEN
        UPDATE propostas
        SET situacao = 'Não selecionada'
        WHERE clickup_negocio_id = NEW.clickup_negocio_id
          AND id <> NEW.id
          AND situacao = 'Selecionada';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_deselect_other_proposals ON propostas;
CREATE TRIGGER trigger_deselect_other_proposals
BEFORE INSERT OR UPDATE ON propostas
FOR EACH ROW
EXECUTE FUNCTION auto_deselect_other_proposals();

-- 5. Função de Apoio para Incrementar o Código de Versão (ex: vA -> vB -> ... -> vZ -> vAA -> vAB)
CREATE OR REPLACE FUNCTION increment_version_code(current_version TEXT)
RETURNS TEXT AS $$
DECLARE
    prefix TEXT := 'v';
    letters TEXT;
    len INT;
    i INT;
    char_val INT;
    carry BOOLEAN := true;
    new_letters TEXT := '';
BEGIN
    letters := substring(current_version from 2);
    len := length(letters);
    
    FOR i IN REVERSE len..1 LOOP
        char_val := ascii(substring(letters from i for 1));
        IF carry THEN
            char_val := char_val + 1;
            IF char_val > 90 THEN -- ASCII de 'Z'
                char_val := 65; -- ASCII de 'A'
                carry := true;
            ELSE
                carry := false;
            END IF;
        END IF;
        new_letters := chr(char_val) || new_letters;
    END LOOP;
    
    IF carry THEN
        new_letters := 'A' || new_letters;
    END IF;
    
    RETURN prefix || new_letters;
END;
$$ LANGUAGE plpgsql;

-- 6. Função RPC para Clonar Proposta e Incrementar Versão (Gerar Nova Versão) ou Criar Inicial (vA)
DROP FUNCTION IF EXISTS gerar_nova_versao(UUID, TEXT);
DROP FUNCTION IF EXISTS gerar_nova_versao(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION gerar_nova_versao(id_negocio TEXT, cenario_nome TEXT, criador TEXT)
RETURNS UUID AS $$
DECLARE
    v_latest_proposal RECORD;
    v_nova_versao TEXT;
    v_novo_proposta_id UUID;
BEGIN
    -- Obter a última proposta ativa ou selecionada para este negócio
    SELECT id, versao, total_proposta
    INTO v_latest_proposal
    FROM propostas
    WHERE clickup_negocio_id = id_negocio
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        -- Primeira proposta (vA)
        v_nova_versao := 'vA';

        INSERT INTO propostas (clickup_negocio_id, versao, cenario, situacao, total_proposta, criado_por)
        VALUES (id_negocio, v_nova_versao, cenario_nome, 'Ativa', 0.00, criador)
        RETURNING id INTO v_novo_proposta_id;
    ELSE
        -- Incrementar a letra da versão com base na anterior
        v_nova_versao := increment_version_code(v_latest_proposal.versao);

        -- Marcar as versões Ativas anteriores como Substituída
        UPDATE propostas
        SET situacao = 'Substituída'
        WHERE clickup_negocio_id = id_negocio
          AND situacao = 'Ativa';

        -- Inserir nova proposta
        INSERT INTO propostas (clickup_negocio_id, versao, cenario, situacao, total_proposta, criado_por)
        VALUES (id_negocio, v_nova_versao, cenario_nome, 'Ativa', v_latest_proposal.total_proposta, criador)
        RETURNING id INTO v_novo_proposta_id;

        -- Clonar todos os itens da proposta antiga para a nova
        INSERT INTO itens_proposta (proposta_id, produto_id, distribuidor, quantidade, preco_unitario)
        SELECT v_novo_proposta_id, produto_id, distribuidor, quantidade, preco_unitario
        FROM itens_proposta
        WHERE proposta_id = v_latest_proposal.id;
    END IF;

    RETURN v_novo_proposta_id;
END;
$$ LANGUAGE plpgsql;
