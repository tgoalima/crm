-- Traz Contas e Contatos do ClickUp (listas 901326185461 / 901326185456) para o
-- Supabase como fonte de verdade, em vez de resolver tudo em tempo real via API
-- do ClickUp (gargalo de latência/rate-limit já documentado em docs/resumo.md,
-- seções 6/9). Campos espelham os custom fields reais confirmados ao vivo na
-- API do ClickUp em 17/08/2026 (Industry, Billing Cycle, Account Tier, Champion,
-- e os status customer base/prospect/at risk/active/lost deal/former client/Closed).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Tabela de Contas (Empresas)
CREATE TABLE IF NOT EXISTS public.contas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clickup_account_id TEXT UNIQUE NOT NULL,
    agendor_id TEXT,
    nome TEXT NOT NULL,
    razao_social TEXT,
    cnpj TEXT,
    email TEXT,
    telefone TEXT,
    cep TEXT,
    rua TEXT,
    cidade TEXT,
    estado TEXT,
    industry TEXT,
    account_tier TEXT,
    billing_cycle TEXT,
    status TEXT, -- valores reais no ClickUp: customer base / prospect / at risk / active / lost deal / former client / Closed
    responsavel_nome TEXT,
    responsavel_clickup_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_cnpj ON public.contas(cnpj);
CREATE INDEX IF NOT EXISTS idx_contas_nome_trgm ON public.contas USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contas_status ON public.contas(status);
CREATE INDEX IF NOT EXISTS idx_contas_tier ON public.contas(account_tier);

-- 2. Tabela de Contatos (Pessoas)
CREATE TABLE IF NOT EXISTS public.contatos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conta_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
    clickup_contact_id TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    email TEXT,
    cargo TEXT,
    celular TEXT,
    whatsapp TEXT,
    champion BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contatos_conta_id ON public.contatos(conta_id);
CREATE INDEX IF NOT EXISTS idx_contatos_nome_trgm ON public.contatos USING gin (nome gin_trgm_ops);

-- 3. Vínculo direto de propostas com Conta/Contato (aditivo, colunas opcionais —
--    não altera nada do fluxo existente de itens_proposta/propostas)
ALTER TABLE public.propostas
    ADD COLUMN IF NOT EXISTS conta_id UUID REFERENCES public.contas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contato_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS numero_proposta_oficial TEXT; -- Ex: 12759/2026 (integração Apps Script — Fase 3)

CREATE INDEX IF NOT EXISTS idx_propostas_conta_id ON public.propostas(conta_id);

-- 4. RLS — mesmo padrão confirmado funcionando em produção para propostas/
--    tarefas_comerciais (testado ao vivo em 17/08/2026: INSERT via anon key
--    funciona e o trigger de recálculo dispara corretamente). Documentando
--    explicitamente aqui em vez de aplicar direto no painel do Supabase, para
--    não repetir o "schema drift" não rastreado já visto em outras tabelas.
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sel" ON public.contas FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.contas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.contas FOR UPDATE TO anon USING (true);

CREATE POLICY "Sel" ON public.contatos FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.contatos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.contatos FOR UPDATE TO anon USING (true);
