import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lerArquivo = (caminho) => fs.readFileSync(new URL('../' + caminho, import.meta.url), 'utf8');
import { interpretarComando, interpretarConsulta, calcularResumoAgregadoDominio, predicadoIlikePostgrest } from '../supabase/functions/api-ros/dominio.ts';

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

test('substituição cria sucessora pendente e não exige número antecipado', () => {
  const result = interpretarComando('POST', `${uuid}/substituir`, {
    versao_esperada: 2, request_id: '11111111-1111-4111-8111-111111111112',
  });
  assert.equal(result.rpc, 'ro_substituir');
  assert.equal(result.params.p_ro_anterior_id, uuid);
  assert.equal(result.params.p_versao_esperada, 2);
  assert.throws(() => interpretarComando('POST', `${uuid}/substituir`, {
    numero_ro: 'NOVA-2',
  }), /campo/i);
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

test('datas civis inexistentes são rejeitadas antes de chegar ao banco', () => {
  assert.throws(() => interpretarComando('POST', `${uuid}/aprovar`, {
    numero_ro: 'RO-999', data_aprovacao: '2026-02-30', data_vencimento: '2026-12-11',
  }), /data/i);
  assert.throws(() => interpretarConsulta(new URLSearchParams({ vence_ate: '2026-04-31' })), /data/i);
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

test('interpretarConsulta suporta filtros de cliente, numero_ro e busca textual mantendo semântica uniforme', () => {
  const paramsCompletos = new URLSearchParams({
    cliente: 'Hospital Santa Joana',
    numero_ro: 'RO-2026-99',
    busca: 'Projeto Nuvem',
    situacao: 'Aprovada',
    pagina: '1',
    limite: '50',
  });
  const consulta = interpretarConsulta(paramsCompletos);
  assert.equal(consulta.cliente, 'Hospital Santa Joana');
  assert.equal(consulta.numero_ro, 'RO-2026-99');
  assert.equal(consulta.busca, 'Projeto Nuvem');
  assert.equal(consulta.situacao, 'Aprovada');

  // Sinônimo 'q' mapeia para busca
  const paramsQ = new URLSearchParams({ q: 'Dell EMC' });
  assert.equal(interpretarConsulta(paramsQ).busca, 'Dell EMC');
});

test('interpretarConsulta aceita o filtro textual de oportunidade', () => {
  const consulta = interpretarConsulta(new URLSearchParams({ oportunidade: 'Projeto de Modernização' }));
  assert.equal(consulta.oportunidade, 'Projeto de Modernização');
});

test('predicado de busca PostgREST encapsula caracteres reservados do texto do usuário', () => {
  assert.equal(
    predicadoIlikePostgrest('numero_ro', 'RO,(Dell)."A"'),
    'numero_ro.ilike."*RO,(Dell).\\"A\\"*"',
  );
});

test('migration do resumo não expõe função SECURITY DEFINER ao público', () => {
  const migration = lerArquivo('supabase/migrations/20260912c_ro_resumo_agregado.sql');
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.ro_resumo_agregado[\s\S]*FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.ro_resumo_agregado[\s\S]*TO service_role;/);
});

test('consulta de R.O. usa somente colunas existentes de contas', () => {
  const migration = lerArquivo('supabase/migrations/20260912c_ro_resumo_agregado.sql');
  const api = lerArquivo('supabase/functions/api-ros/index.ts');
  assert.doesNotMatch(migration, /nome_fantasia/);
  assert.doesNotMatch(api, /nome_fantasia/);
});

test('teste SQL do resumo começa uma transação antes de executar inserções e sempre faz rollback', () => {
  const testeSql = lerArquivo('tests/sql/ro_resumo_agregado_assertions.sql').trim();
  assert.match(testeSql, /^--[^\n]*\n[\s\S]*?BEGIN;/);
  assert.match(testeSql, /ROLLBACK;\s*$/);
});

test('calcularResumoAgregadoDominio agrega mais de uma página, renovações em análise, vencimentos civis em até 15 dias e conjunto vazio', () => {
  const hojeSp = '2026-09-12';

  // 1. Conjunto vazio
  const vazio = calcularResumoAgregadoDominio([], hojeSp);
  assert.deepEqual(vazio, {
    total: 0,
    aguardando_aprovacao: 0,
    renovacoes_em_analise: 0,
    vencem_15_dias: 0,
  });

  // 2. Agregação com 120 registros (mais de duas páginas de 50)
  const registros = [];
  for (let i = 1; i <= 120; i++) {
    if (i <= 20) {
      // 20 aguardando aprovação
      registros.push({ situacao: 'Aguardando aprovação', data_vencimento: null });
    } else if (i <= 50) {
      // 30 com renovação em análise
      registros.push({
        situacao: 'Aprovada',
        data_vencimento: '2026-10-15',
        renovacoes_ro: [{ situacao: 'Em análise' }],
      });
    } else if (i <= 65) {
      // 15 aprovadas vencendo em até 15 dias (entre 12/09 e 27/09)
      const dia = 12 + (i - 51); // 12 a 26
      const diaStr = dia < 10 ? `0${dia}` : `${dia}`;
      registros.push({
        situacao: 'Aprovada',
        data_vencimento: `2026-09-${diaStr}`,
        renovacoes_ro: [],
      });
    } else if (i <= 70) {
      // 5 aprovadas no limite exato de 15 dias (2026-09-27)
      registros.push({
        situacao: 'Aprovada',
        data_vencimento: '2026-09-27',
        renovacoes_ro: [],
      });
    } else if (i <= 80) {
      // 10 aprovadas fora do limite (vencem em 2026-09-28 ou depois)
      registros.push({
        situacao: 'Aprovada',
        data_vencimento: '2026-09-28',
        renovacoes_ro: [],
      });
    } else {
      // 40 em outras situações (Backoffice, Encerrada, Substituída)
      registros.push({ situacao: 'Backoffice', data_vencimento: null });
    }
  }

  const resumo = calcularResumoAgregadoDominio(registros, hojeSp);
  assert.equal(resumo.total, 120);
  assert.equal(resumo.aguardando_aprovacao, 20);
  assert.equal(resumo.renovacoes_em_analise, 30);
  assert.equal(resumo.vencem_15_dias, 20); // 15 + 5
});

test('comando de envio aceita somente campos previstos e mapeia para ro_registrar_envio', () => {
  const comando = interpretarComando('POST', `${uuid}/enviar`, {
    data_solicitacao: '2026-09-12',
    observacao: 'Enviado por e-mail ao parceiro',
    versao_esperada: 2,
    request_id: 'req-envio-1',
  });
  assert.equal(comando.rpc, 'ro_registrar_envio');
  assert.equal(comando.params.p_id, uuid);
  assert.equal(comando.params.p_data_solicitacao, '2026-09-12');
  assert.equal(comando.params.p_observacao, 'Enviado por e-mail ao parceiro');
  assert.equal(comando.params.p_versao_esperada, 2);
  assert.equal(comando.params.p_request_id, 'req-envio-1');

  // Rejeita campos inesperados
  assert.throws(() => interpretarComando('POST', `${uuid}/enviar`, {
    data_solicitacao: '2026-09-12',
    campo_estranho: 'invalido',
  }), /campo/i);

  // Exige data de solicitação válida
  assert.throws(() => interpretarComando('POST', `${uuid}/enviar`, {
    observacao: 'Sem data',
  }), /data/i);

  assert.throws(() => interpretarComando('POST', `${uuid}/enviar`, {
    data_solicitacao: '2026-02-30',
  }), /data/i);
});

test('migration de envio não expõe função SECURITY DEFINER ao público e revoga execute', () => {
  const migration = lerArquivo('supabase/migrations/20260912d_ro_registrar_envio.sql');
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.ro_registrar_envio[\s\S]*FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.ro_registrar_envio[\s\S]*TO service_role;/);
});

test('teste SQL do fluxo de R.O. inclui asserção transacional para ro_registrar_envio e sempre faz rollback', () => {
  const testeSql = lerArquivo('tests/sql/ro_schema_assertions.sql').trim();
  assert.match(testeSql, /ro_registrar_envio/);
  assert.match(testeSql, /Aguardando aprovação/);
  assert.match(testeSql, /ROLLBACK;\s*$/);
});

test('rota de responder renovação aceita versao_esperada e mapeia para a nova RPC', () => {
  const aprovacao = interpretarComando('POST', `${uuid}/renovacoes/1/aprovar`, {
    data_resposta: '2026-11-25',
    novo_vencimento: '2027-03-11',
    versao_esperada: 3,
    request_id: 'req-ren-1',
  });
  assert.equal(aprovacao.rpc, 'ro_responder_renovacao');
  assert.equal(aprovacao.params.p_id, uuid);
  assert.equal(aprovacao.params.p_ciclo, 1);
  assert.equal(aprovacao.params.p_situacao, 'Aprovada');
  assert.equal(aprovacao.params.p_data_resposta, '2026-11-25');
  assert.equal(aprovacao.params.p_novo_vencimento, '2027-03-11');
  assert.equal(aprovacao.params.p_versao_esperada, 3);
  assert.equal(aprovacao.params.p_request_id, 'req-ren-1');

  const negativa = interpretarComando('POST', `${uuid}/renovacoes/2/negar`, {
    data_resposta: '2026-11-26',
    motivo: 'Fabricante negou extensão de prazo',
    versao_esperada: 4,
    request_id: 'req-ren-2',
  });
  assert.equal(negativa.rpc, 'ro_responder_renovacao');
  assert.equal(negativa.params.p_id, uuid);
  assert.equal(negativa.params.p_ciclo, 2);
  assert.equal(negativa.params.p_situacao, 'Negada');
  assert.equal(negativa.params.p_data_resposta, '2026-11-26');
  assert.equal(negativa.params.p_motivo, 'Fabricante negou extensão de prazo');
  assert.equal(negativa.params.p_novo_vencimento, null);
  assert.equal(negativa.params.p_versao_esperada, 4);
  assert.equal(negativa.params.p_request_id, 'req-ren-2');

  assert.throws(() => interpretarComando('POST', `${uuid}/renovacoes/1/aprovar`, {
    data_resposta: '2026-11-25',
    novo_vencimento: '2027-03-11',
    versao_esperada: -1,
  }), /versão/i);
});

test('migration de renovação versionada não expõe função SECURITY DEFINER ao público e revoga execute', () => {
  const migration = lerArquivo('supabase/migrations/20260912e_ro_responder_renovacao_versao.sql');
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.ro_responder_renovacao[\s\S]*FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.ro_responder_renovacao[\s\S]*TO service_role;/);
  assert.match(migration, /p_versao_esperada integer DEFAULT NULL/);
});

test('teste SQL do fluxo de R.O. inclui validação de versão e retry idempotente em renovação', () => {
  const testeSql = lerArquivo('tests/sql/ro_schema_assertions.sql').trim();
  assert.match(testeSql, /ro_responder_renovacao/);
  assert.match(testeSql, /Retry idempotente de responder renovação/);
  assert.match(testeSql, /Conflito de versão na resposta de renovação/);
  assert.match(testeSql, /P0001/);
});


// ─────────────────────────────────────────────────────────────────────────
// Task 7: Testes de substituição na API
// ─────────────────────────────────────────────────────────────────────────

test('substituição aceita apenas versao_esperada e request_id, sem campos extras (Task 7)', () => {
  const result = interpretarComando('POST', `${uuid}/substituir`, {
    versao_esperada: 5,
    request_id: 'req-sub-001',
  });
  assert.equal(result.rpc, 'ro_substituir');
  assert.equal(result.params.p_ro_anterior_id, uuid);
  assert.equal(result.params.p_versao_esperada, 5);
  assert.equal(result.params.p_request_id, 'req-sub-001');
});

test('substituição rejeita campos não permitidos no corpo (Task 7)', () => {
  assert.throws(() => interpretarComando('POST', `${uuid}/substituir`, {
    versao_esperada: 5,
    request_id: 'req-sub-002',
    numero_ro: 'DELL-999', // campo não permitido
  }), /não reconhecido|não permitido/i);
});

test('substituição sem request_id funciona (p_request_id fica null)', () => {
  const result = interpretarComando('POST', `${uuid}/substituir`, {
    versao_esperada: 3,
  });
  assert.equal(result.rpc, 'ro_substituir');
  assert.equal(result.params.p_request_id, null);
});

test('substituição com versão negativa rejeita', () => {
  assert.throws(() => interpretarComando('POST', `${uuid}/substituir`, {
    versao_esperada: -1,
  }), /versão/i);
});

test('migration 20260912f valida substituição com renovação pendente e múltiplos sucessores (Task 7)', () => {
  const migration = lerArquivo('supabase/migrations/20260912f_ro_substituir_validacoes.sql');

  // Verifica que a migration usa SECURITY INVOKER
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);

  // Verifica que a migration tem as validações de renovação pendente
  assert.match(migration, /renovação pendente/i);
  assert.match(migration, /renovacoes_ro/);
  assert.match(migration, /Em análise/);

  // Verifica que a migration verifica múltiplos sucessores
  assert.match(migration, /substituição em andamento/i);
  assert.match(migration, /ro_anterior_id/);

  // Verifica que revoga e concede grants corretamente
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.ro_substituir/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.ro_substituir[\s\S]*TO service_role/);

  // Verifica idempotência por request_id
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /Substituição iniciada/);
});
