CREATE TABLE public.tarefas_comerciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposta_id UUID REFERENCES public.propostas(id) ON DELETE CASCADE,
    clickup_subtask_id VARCHAR(255),
    titulo VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('Ligação', 'Reunião', 'E-mail', 'Follow-up')),
    data_vencimento TIMESTAMP WITH TIME ZONE NOT NULL,
    responsavel_clickup_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tarefas_comerciais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sel" ON public.tarefas_comerciais FOR SELECT TO anon USING (true);
CREATE POLICY "Ins" ON public.tarefas_comerciais FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd" ON public.tarefas_comerciais FOR UPDATE TO anon USING (true);

-- Políticas de RLS para a tabela de propostas e permissão de execução na RPC
CREATE POLICY "Ins_propostas" ON public.propostas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Upd_propostas" ON public.propostas FOR UPDATE TO anon USING (true);
GRANT EXECUTE ON FUNCTION public.gerar_nova_versao(TEXT, TEXT, TEXT) TO anon, authenticated;
