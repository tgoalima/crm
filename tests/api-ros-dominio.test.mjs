import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarComando, interpretarConsulta } from '../supabase/functions/api-ros/dominio.ts';

const uuid = '11111111-1111-4111-8111-111111111111';

test('criação exige oportunidade, fabricante e categoria', () => {
  assert.deepEqual(
    interpretarComando('POST', '', {
      negocio_id: uuid,
      fabricante_id: uuid,
      categoria: 'Infraestrutura',
      titulo: 'Datacenter',
    }),
    {
      rpc: 'ro_criar',
      params: {
        p_negocio_id: uuid,
        p_fabricante_id: uuid,
        p_categoria: 'Infraestrutura',
        p_titulo: 'Datacenter',
        p_cenario: null,
        p_responsavel_operacional_clickup_id: null,
        p_request_id: null,
      },
    },
  );
  assert.throws(() => interpretarComando('POST', '', { fabricante_id: uuid, categoria: 'Infra' }), /oportunidade/i);
});

test('aprovação exige número, aprovação e vencimento confirmados', () => {
  const result = interpretarComando('POST', `${uuid}/aprovar`, {
    numero_ro: '001-ABC', data_aprovacao: '2026-09-12', data_vencimento: '2026-12-11',
  });
  assert.equal(result.rpc, 'ro_aprovar');
  assert.equal(result.params.p_numero_ro, '001-ABC');
  assert.throws(() => interpretarComando('POST', `${uuid}/aprovar`, {
    numero_ro: '1', data_aprovacao: '12/09/2026', data_vencimento: '2026-12-11',
  }), /data/i);
});

test('solicitação e resposta de renovação são comandos distintos', () => {
  assert.equal(interpretarComando('POST', `${uuid}/renovacoes`, {
    data_solicitacao: '2026-11-20',
  }).rpc, 'ro_solicitar_renovacao');
  assert.equal(interpretarComando('POST', `${uuid}/renovacoes/2/aprovar`, {
    data_resposta: '2026-11-25', novo_vencimento: '2027-03-11',
  }).rpc, 'ro_responder_renovacao');
  assert.equal(interpretarComando('POST', `${uuid}/renovacoes/2/negar`, {
    data_resposta: '2026-11-25', motivo: 'Fabricante recusou',
  }).params.p_situacao, 'Negada');
});

test('substituição exige novo número e mantém referência da anterior', () => {
  const result = interpretarComando('POST', `${uuid}/substituir`, {
    numero_ro: 'NOVA-2', data_aprovacao: '2026-09-12', data_vencimento: '2026-12-11',
  });
  assert.equal(result.rpc, 'ro_substituir');
  assert.equal(result.params.p_ro_anterior_id, uuid);
});

test('encerramento exige situação final e data', () => {
  assert.equal(interpretarComando('POST', `${uuid}/encerrar`, {
    situacao: 'Encerrada', data_encerramento: '2026-09-12', motivo: 'Projeto cancelado',
  }).rpc, 'ro_encerrar');
  assert.throws(() => interpretarComando('POST', `${uuid}/encerrar`, {
    situacao: 'Aprovada', data_encerramento: '2026-09-12',
  }), /situação/i);
});

test('campos inesperados e rotas desconhecidas são rejeitados', () => {
  assert.throws(() => interpretarComando('POST', '', {
    negocio_id: uuid, fabricante_id: uuid, categoria: 'Infra', admin: true,
  }), /campo/i);
  assert.throws(() => interpretarComando('DELETE', uuid, {}), /rota/i);
});

test('interpretarConsulta valida paginação, filtros e rejeita parâmetros inválidos', () => {
  const paramsValidos = new URLSearchParams({
    negocio_id: uuid,
    fabricante_id: uuid,
    situacao: 'Aprovada',
    responsavel: '90848927',
    vence_ate: '2026-12-31',
    pagina: '2',
    limite: '50',
  });
  const consulta = interpretarConsulta(paramsValidos);
  assert.equal(consulta.negocio_id, uuid);
  assert.equal(consulta.fabricante_id, uuid);
  assert.equal(consulta.situacao, 'Aprovada');
  assert.equal(consulta.responsavel, '90848927');
  assert.equal(consulta.vence_ate, '2026-12-31');
  assert.equal(consulta.pagina, 2);
  assert.equal(consulta.limite, 50);

  assert.throws(() => interpretarConsulta(new URLSearchParams({ limite: '0' })), /paginação/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ limite: '300' })), /paginação/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ pagina: '-1' })), /paginação/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ vence_ate: '31/12/2026' })), /data/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ negocio_id: 'invalido' })), /oportunidade/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ fabricante_id: 'invalido' })), /fabricante/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ parametro_desconhecido: '123' })), /parâmetro/i);
});

test('comandos de mutação aceitam request_id para idempotência e versao_esperada para controle de concorrência', () => {
  const criacao = interpretarComando('POST', '', {
    negocio_id: uuid,
    fabricante_id: uuid,
    categoria: 'Software',
    titulo: 'Backup Cloud',
    request_id: 'req-12345',
  });
  assert.equal(criacao.params.p_request_id, 'req-12345');

  const aprovacao = interpretarComando('POST', `${uuid}/aprovar`, {
    numero_ro: 'RO-999',
    data_aprovacao: '2026-09-12',
    data_vencimento: '2026-12-11',
    versao_esperada: 3,
    request_id: 'req-aprov-1',
  });
  assert.equal(aprovacao.params.p_versao_esperada, 3);
  assert.equal(aprovacao.params.p_request_id, 'req-aprov-1');

  assert.throws(() => interpretarComando('POST', `${uuid}/aprovar`, {
    numero_ro: 'RO-999',
    data_aprovacao: '2026-09-12',
    data_vencimento: '2026-12-11',
    versao_esperada: -1,
  }), /versão/i);

  assert.throws(() => interpretarComando('POST', `${uuid}/aprovar`, {
    numero_ro: 'RO-999',
    data_aprovacao: '2026-09-12',
    data_vencimento: '2026-12-11',
    versao_esperada: 'tres',
  }), /versão/i);
});

