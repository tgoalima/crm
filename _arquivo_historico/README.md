# Arquivo Histórico

Esta pasta não faz parte do CRM em produção — nada aqui é lido pelo app rodando
(`app.js`, `empresas.js`, edge functions). É o registro de como os dados foram
migrados e reconciliados entre o Agendor e este CRM, mantido só como
referência caso um problema parecido apareça de novo. Movido pra cá em 19/08
como parte da higienização anterior ao release v1 (ver `docs/resumo.md`).

- **`planilhas_agendor/`** — prints e exports (`.xlsx`) originais do Agendor,
  usados na migração inicial de negócios e produtos pro Supabase.
- **`cache/`** — dump bruto (`agendor_won_deals.json`) puxado da API do
  Agendor durante uma das reconciliações.
- **`reports/`** — CSVs de auditoria/divergência gerados pelos scripts abaixo
  (contas sem match, propostas sem itens, divergências de valor).
- **`scripts/`** — scripts Python de um-tiro usados pra migrar, corrigir e
  auditar dados entre Agendor e Supabase. Não são chamados pelo app; rodados
  manualmente quando necessário, contra o banco de produção.
- **`docs/`** — relatórios de auditoria e os documentos originais de
  planejamento/spec do módulo Empresa 360º (`empresas.js`), já implementado.
