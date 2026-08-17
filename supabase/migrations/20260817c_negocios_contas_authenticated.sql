-- Corrige gap de RLS descoberto ao vivo em 17/08: `contas`/`contatos`/`negocios`
-- só tinham policy para o role `anon`, mas o app usa Supabase Auth (sessão
-- logada) — uma sessão autenticada roda como `authenticated`, que não batia
-- em nenhuma policy dessas 3 tabelas e retornava 0 linhas silenciosamente
-- (sem erro, comportamento padrão de RLS: SELECT sem policy correspondente
-- = resultado vazio, não uma exceção). `propostas`/`itens_proposta` já tinham
-- esse acesso liberado via policies criadas direto no painel do Supabase
-- (nunca versionadas — mesmo padrão de drift documentado em docs/resumo.md),
-- replicando aqui a mesma cobertura pras tabelas novas.

CREATE POLICY "Acesso total para usuarios logados" ON public.contas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total para usuarios logados" ON public.contatos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total para usuarios logados" ON public.negocios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
