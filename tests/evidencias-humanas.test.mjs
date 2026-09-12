import test from 'node:test';
import assert from 'node:assert/strict';
import { selecionarEvidenciasHumanas } from '../supabase/functions/mcp-brain/evidencias-humanas.ts';
const autores = { '10': 'humano', '20': 'agente', '30': 'sistema' };
const atividade = (id, autor, data, extra = {}) => ({ id, autor_clickup_id: autor, data_execucao: data, texto: 'Cliente avalia proposta', ...extra });
test('agente recente e autor desconhecido não substituem follow-up humano de tarefa', () => {
  const r = selecionarEvidenciasHumanas([
    atividade('a', '20', '2026-09-12T12:00:00Z'),
    atividade('b', '99', '2026-09-11T12:00:00Z'),
    atividade('c', '10', '2026-09-10T12:00:00Z', { origem: 'tarefa' }),
  ], autores);
  assert.deepEqual(r.evidencias.map(e => e.id), ['c']);
  assert.equal(r.excluidas.agente, 1);
  assert.equal(r.excluidas.desconhecido, 1);
});
test('deduplica comentário e sua cópia sem descartar anexo humano', () => {
  const r = selecionarEvidenciasHumanas([
    atividade('local', '10', '2026-09-10T12:00:00Z', { clickup_comment_id: '77', anexos: [{url:'https://example.com/print.png'}] }),
    atividade('cu_77', '10', '2026-09-10T12:00:00Z', { clickup_comment_id: '77' }),
  ], autores);
  assert.equal(r.evidencias.length, 1);
  assert.equal(r.evidencias[0].anexos[0].interpretacao, 'nao_realizada');
});
test('autorias conflitantes do mesmo comentário não são tratadas como humanas', () => {
  const r = selecionarEvidenciasHumanas([
    atividade('local', '10', '2026-09-10T12:00:00Z', { clickup_comment_id:'77' }),
    atividade('cu_77', '20', '2026-09-10T12:00:00Z', { clickup_comment_id:'77' }),
  ], autores);
  assert.equal(r.evidencias.length, 0);
  assert.equal(r.conflitos_autoria, 1);
});
test('data inválida não vira atualização recente e limite não oculta cobertura', () => {
  const r = selecionarEvidenciasHumanas([
    atividade('a','10','invalida'),
    atividade('b','10','2026-09-09T12:00:00Z'),
    atividade('c','10','2026-09-10T12:00:00Z'),
  ], autores, 1);
  assert.deepEqual(r.evidencias.map(e=>e.id), ['c']);
  assert.equal(r.total_elegiveis,2);
  assert.equal(r.omitidas_por_limite,1);
  assert.equal(r.datas_invalidas,1);
});
test('sem classificação configurada nenhuma autoria é presumida humana', () => {
  assert.equal(selecionarEvidenciasHumanas([atividade('a','10','2026-09-10')], {}).evidencias.length,0);
});

test('coletor atravessa páginas antes de filtrar e informa fonte consultada', async () => {
  const { coletarEvidenciasHumanas } = await import('../supabase/functions/mcp-brain/evidencias-humanas.ts');
  const r = await coletarEvidenciasHumanas(async (inicio, fim) => {
    assert.equal(fim-inicio, 499);
    return inicio === 0 ? Array.from({length:500},(_,i)=>atividade(String(i),'20','2026-09-11')) : [atividade('humano','10','2026-09-10')];
  }, autores);
  assert.equal(r.evidencias[0].id,'humano');
  assert.equal(r.registros_consultados,501);
  assert.equal(r.cobertura_banco_completa,true);
});

test('limite defensivo do coletor informa cobertura incompleta', async () => {
  const { coletarEvidenciasHumanas } = await import('../supabase/functions/mcp-brain/evidencias-humanas.ts');
  const r = await coletarEvidenciasHumanas(async (inicio) => Array.from({length:500},(_,i)=>atividade(String(inicio+i),'20','2026-09-11')), autores);
  assert.equal(r.registros_consultados,10000);
  assert.equal(r.cobertura_banco_completa,false);
});
test('erro de consulta não é apresentado como ausência de atividade humana', async () => {
  const { coletarEvidenciasHumanas } = await import('../supabase/functions/mcp-brain/evidencias-humanas.ts');
  await assert.rejects(coletarEvidenciasHumanas(async()=>{throw new Error('indisponível');},autores), /indisponível/);
});

test('classificação aceita IDs negativos de agentes do ClickUp e os exclui', async () => {
  const { lerClassificacaoAutores } = await import('../supabase/functions/mcp-brain/evidencias-humanas.ts');
  const autores = lerClassificacaoAutores('{"-39955114":"agente","90848927":"humano"}');
  const r = selecionarEvidenciasHumanas([
    atividade('agente', '-39955114', '2026-09-12'),
    atividade('humano', '90848927', '2026-09-11'),
  ], autores);
  assert.deepEqual(r.evidencias.map(e=>e.id), ['humano']);
  assert.equal(r.excluidas.agente,1);
});
test('configuração rejeita tipos desconhecidos, arrays, IDs inválidos e ausência', async () => {
  const { lerClassificacaoAutores } = await import('../supabase/functions/mcp-brain/evidencias-humanas.ts');
  for (const raw of [undefined, '', '[]', 'null', '{"nome":"humano"}', '{"10":"admin"}', '{']) {
    assert.throws(()=>lerClassificacaoAutores(raw), /Classificação|Configuração/);
  }
});
