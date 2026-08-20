-- supabase/migrations/20260820b_indexes_faltantes.sql
--
-- Índices faltantes identificados na auditoria de performance/backend de
-- 20/08: colunas filtradas/joinadas com frequência (trigger
-- auto_deselect_other_proposals, mcp-brain/tools.ts, relatórios, geração de
-- número de proposta) sem índice correspondente. Não afeta nada hoje
-- (~700-800 linhas/tabela), mas evita full scan conforme o volume cresce.

CREATE INDEX IF NOT EXISTS idx_propostas_situacao ON public.propostas(situacao);
CREATE INDEX IF NOT EXISTS idx_propostas_data_fechamento ON public.propostas(data_fechamento);
CREATE INDEX IF NOT EXISTS idx_itens_proposta_produto_id ON public.itens_proposta(produto_id);
CREATE INDEX IF NOT EXISTS idx_negocios_numero_proposta_oficial ON public.negocios(numero_proposta_oficial);
