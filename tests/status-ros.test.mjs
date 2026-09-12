import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarStatusRos } from '../supabase/functions/mcp-brain/status-ros.ts';

const registros = [
  { id: 'ro1', numero_ro: 'D-1', situacao: 'Aprovada', data_vencimento: '2026-09-20',
    fabricante: 'Dell', negocio: { clickup_negocio_id: 'n1', nome: 'Projeto A', conta: 'Cliente A' } },
  { id: 'ro2', numero_ro: 'D-2', situacao: 'Aprovada', data_vencimento: '2026-10-20',
    fabricante: 'Dell', negocio: { clickup_negocio_id: 'n1', nome: 'Projeto A', conta: 'Cliente A' } },
  { id: 'ro3', numero_ro: 'D-3', situacao: 'Aguardando aprovação', data_vencimento: null,
    fabricante: 'Dell', negocio: { clickup_negocio_id: 'n2', nome: 'Projeto B', conta: 'Cliente B' } },
];

test('consulta evidências uma vez por oportunidade e reutiliza em várias R.Os', async () => {
  const chamadas = [];
  const result = await consultarStatusRos({ fabricante: 'Dell' }, {
    hoje: '2026-09-12',
    buscarRos: async () => ({ registros, total: 3 }),
    buscarEvidencias: async (id) => {
      chamadas.push(id);
      return { evidencias: [{ id: `a-${id}`, data: '2026-09-10T12:00:00Z', texto: 'Cliente analisa proposta' }], cobertura_banco_completa: true, cobertura_clickup_completa: true };
    },
  });
  assert.deepEqual(chamadas.sort(), ['n1', 'n2']);
  assert.equal(result.ros[0].ultima_atividade_humana.id, 'a-n1');
  assert.equal(result.total_encontrado, 3);
});

test('distingue atualização do mês de última atividade antiga', async () => {
  const result = await consultarStatusRos({ fabricante: 'Dell', data_inicio: '2026-09-01', data_fim: '2026-09-30' }, {
    hoje: '2026-09-12', buscarRos: async () => ({ registros: [registros[0]], total: 1 }),
    buscarEvidencias: async () => ({ evidencias: [{ id: 'antiga', data: '2026-08-20T12:00:00Z', texto: 'Reunião realizada' }], cobertura_banco_completa: true, cobertura_clickup_completa: true }),
  });
  assert.equal(result.ros[0].atualizacao_no_periodo, null);
  assert.equal(result.ros[0].ultima_atividade_humana.id, 'antiga');
  assert.match(result.ros[0].alertas[0], /sem atualização humana/i);
});

test('calcula vigência sem transformar ausência de prazo em vencimento', async () => {
  const result = await consultarStatusRos({}, {
    hoje: '2026-09-12', buscarRos: async () => ({ registros, total: 3 }),
    buscarEvidencias: async () => ({ evidencias: [], cobertura_banco_completa: true, cobertura_clickup_completa: true }),
  });
  assert.equal(result.ros[0].vigencia, 'A vencer');
  assert.equal(result.ros[1].vigencia, 'Vigente');
  assert.equal(result.ros[2].vigencia, 'Sem prazo');
});

test('falha parcial de evidências não cancela fabricante inteiro', async () => {
  const result = await consultarStatusRos({}, {
    hoje: '2026-09-12', buscarRos: async () => ({ registros, total: 3 }),
    buscarEvidencias: async (id) => { if (id === 'n2') throw Error('falha'); return { evidencias: [], cobertura_banco_completa: true, cobertura_clickup_completa: true }; },
  });
  assert.equal(result.cobertura_evidencias_completa, false);
  assert.match(result.ros[2].alertas.join(' '), /não foi possível consultar/i);
});

test('valida paginação, período e exige ao menos um critério em consultas amplas', async () => {
  const deps = { hoje: '2026-09-12', buscarRos: async () => ({ registros: [], total: 0 }), buscarEvidencias: async () => ({ evidencias: [] }) };
  await assert.rejects(consultarStatusRos({ limite: 201 }, deps), /limite/i);
  await assert.rejects(consultarStatusRos({ data_inicio: '2026-10-01', data_fim: '2026-09-01' }, deps), /período/i);
});
