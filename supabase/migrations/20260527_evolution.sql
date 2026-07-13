-- 1. Remoção do campo SKU da tabela produtos
ALTER TABLE produtos DROP COLUMN IF EXISTS sku;

-- Adiciona uma restrição única composta para evitar nomes duplicados do mesmo fabricante
ALTER TABLE produtos ADD CONSTRAINT unique_nome_fabricante UNIQUE (nome, fabricante);

-- 2. Criação da Tabela de Distribuidores
CREATE TABLE IF NOT EXISTS distribuidores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Semente de Distribuidores Comuns de TI
INSERT INTO distribuidores (nome) VALUES
('SND'),
('Ingram Micro'),
('Network1'),
('ScanSource'),
('Westcon'),
('Anixter'),
('Adistec'),
('Flytech')
ON CONFLICT (nome) DO NOTHING;
