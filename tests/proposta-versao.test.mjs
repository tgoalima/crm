import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/20260914e_propostas_versao_atomica.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/sync-proposta-tecnica-clickup/index.ts', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

test('a RPC cria a sucessora da maior versão, não da proposta aberta', () => {
  assert.match(migration, /ORDER BY public\.proposta_versao_rank\(versao\) DESC/);
  assert.match(migration, /v_nova_versao := public\.increment_version_code\(v_base\.versao\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(app, /rpc\('gerar_proxima_versao_proposta'/);
  assert.doesNotMatch(app, /const nextVersao = getNextVersionLetter\(basePropData/);
});

test('a migração suporta a progressão vR para vS e vZ para vAA', () => {
  assert.match(migration, /proposta_versao_rank/);
  assert.match(migration, /increment_version_code/);
  // A função existente faz a conversão de coluna alfabética; a RPC sempre
  // a alimenta com a maior versão válida encontrada no banco.
  const increment = fs.readFileSync('supabase/migrations/20260527_init.sql', 'utf8');
  assert.match(increment, /IF carry THEN\s+new_letters := 'A' \|\| new_letters/);
});

test('a sincronização técnica falha fechada e pagina a lista do ClickUp', () => {
  assert.match(edge, /limit=\$\{limite\}&page=\$\{pagina\}/);
  assert.match(edge, /throw new Error\(`GET tarefas da lista/);
  assert.match(edge, /sync_status: "failed"/);
  assert.match(edge, /Nenhuma tarefa foi criada/);
  assert.doesNotMatch(edge, /if \(!res\.ok\) return 0/);
});
