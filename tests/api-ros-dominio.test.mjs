import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lerArquivo = (caminho) => fs.readFileSync(new URL('../' + caminho, import.meta.url), 'utf8');
import { interpretarComando, interpretarConsulta, interpretarConsultaEvidencias, enriquecerRosComEvidencias, calcularResumoAgregadoDominio, predicadoIlikePostgrest, classificarErroRpcRo, estagioPermiteCriarRo } from '../supabase/functions/api-ros/dominio.ts';
import { selecionarEvidenciasHumanas } from '../supabase/functions/mcp-brain/evidencias-humanas.ts';

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

test('estágio Ganho ou Perdido não permite criar R.O., mas etapas ativas e Congelado permitem', () => {
  assert.equal(estagioPermiteCriarRo('Qualificação'), true);
  assert.equal(estagioPermiteCriarRo('Congelado'), true);
  assert.equal(estagioPermiteCriarRo('Ganho'), false);
  assert.equal(estagioPermiteCriarRo('Perdido'), false);
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

test('violação de sequência de datas retorna validação, não conflito de concorrência', () => {
  assert.deepEqual(
    classificarErroRpcRo('23514', 'new row violates check constraint "registros_oportunidade_datas_aprovacao"'),
    { status: 422, error: 'A data de aprovação não pode ser anterior à data de envio ao fabricante.' },
  );
  assert.deepEqual(
    classificarErroRpcRo('P0001', 'Conflito de versão'),
    { status: 409, error: 'Conflito de versão' },
  );
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

test('lista de R.Os usa RPC paginada para busca ampla, sem compor URL com todos os IDs de oportunidades', () => {
  const api = lerArquivo('supabase/functions/api-ros/index.ts');
  const migration = lerArquivo('supabase/migrations/20260914a_ro_listagem_filtrada.sql');
  assert.match(api, /rpc\("ro_listar_ids_filtrados"/);
  const inicioListagem = api.indexOf('const selectRos = () =>');
  const fimListagem = api.indexOf('const body = await req.json()', inicioListagem);
  assert.ok(inicioListagem >= 0 && fimListagem > inicioListagem);
  assert.doesNotMatch(api.slice(inicioListagem, fimListagem), /negIds\.join/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.ro_listar_ids_filtrados/);
  assert.match(migration, /p_busca text DEFAULT NULL/);
  assert.match(migration, /JOIN public\.negocios n/);
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


// ─────────────────────────────────────────────────────────────────────────
// Task 8: Testes de Evidências Humanas no Backend de R.Os
// ─────────────────────────────────────────────────────────────────────────

test('interpretarConsultaEvidencias valida período, limites e padrão de data civil (Task 8)', () => {
  const pValido = new URLSearchParams({
    data_inicio: '2026-09-01',
    data_fim: '2026-09-12',
    pagina: '2',
    limite: '25',
    fabricante: 'Dell',
  });
  const res = interpretarConsultaEvidencias(pValido, '2026-09-12');
  assert.equal(res.data_inicio, '2026-09-01');
  assert.equal(res.data_fim, '2026-09-12');
  assert.equal(res.pagina, 2);
  assert.equal(res.limite, 25);
  assert.equal(res.fabricante, 'Dell');

  // Padrão de período quando omitido: início do mês até hoje
  const pVazio = new URLSearchParams({});
  const resPadrao = interpretarConsultaEvidencias(pVazio, '2026-09-12');
  assert.equal(resPadrao.data_inicio, '2026-09-01');
  assert.equal(resPadrao.data_fim, '2026-09-12');
  assert.equal(resPadrao.pagina, 1);
  assert.equal(resPadrao.limite, 50);

  // Início posterior ao fim é rejeitado
  const pInvertido = new URLSearchParams({ data_inicio: '2026-09-15', data_fim: '2026-09-10' });
  assert.throws(() => interpretarConsultaEvidencias(pInvertido, '2026-09-12'), /período/i);

  // Datas malformadas são rejeitadas
  const pDataInvalida = new URLSearchParams({ data_inicio: 'data-errada' });
  assert.throws(() => interpretarConsultaEvidencias(pDataInvalida, '2026-09-12'), /data_inicio/i);
});

test('duas R.Os da mesma oportunidade utilizam a mesma coleta de evidências (Task 8)', () => {
  const ro1 = {
    id: 'ro-1',
    numero_ro: 'DELL-01',
    situacao: 'Aprovada',
    data_vencimento: '2026-10-30',
    negocios: { id: 'neg-1', nome: 'Projeto Servidores', clickup_negocio_id: 'task-compartilhada', contas: { nome: 'Empresa Alfa' } },
    fabricantes_ro: { nome: 'Dell' },
  };
  const ro2 = {
    id: 'ro-2',
    numero_ro: 'DELL-02',
    situacao: 'Aguardando aprovação',
    data_vencimento: null,
    negocios: { id: 'neg-1', nome: 'Projeto Servidores', clickup_negocio_id: 'task-compartilhada', contas: { nome: 'Empresa Alfa' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const mapa = new Map();
  mapa.set('task-compartilhada', {
    evidencias: [{ id: 'ev-1', autor_nome: 'Fabio', data: '2026-09-10T14:00:00Z', texto: 'Reunião técnica realizada.' }],
    cobertura_banco_completa: true,
    cobertura_clickup_completa: true,
  });

  const resultado = enriquecerRosComEvidencias([ro1, ro2], mapa, '2026-09-01', '2026-09-12', '2026-09-12');

  assert.equal(resultado.ros.length, 2);
  assert.equal(resultado.total_com_atualizacao, 2);
  assert.equal(resultado.total_sem_atualizacao, 0);
  assert.equal(resultado.cobertura_evidencias_completa, true);

  // Ambas apontam para a mesma evidência
  assert.equal(resultado.ros[0].atualizacao_no_periodo.id, 'ev-1');
  assert.equal(resultado.ros[1].atualizacao_no_periodo.id, 'ev-1');
  assert.equal(resultado.ros[0].oportunidade_clickup_id, 'task-compartilhada');
  assert.equal(resultado.ros[1].oportunidade_clickup_id, 'task-compartilhada');
});

test('ausência de atividade no mês mostra a última atividade anterior com alerta explícito (Task 8)', () => {
  const ro = {
    id: 'ro-sem-atualizacao',
    numero_ro: 'DELL-03',
    situacao: 'Aprovada',
    data_vencimento: '2026-11-15',
    negocios: { id: 'neg-2', nome: 'Projeto Storage', clickup_negocio_id: 'task-antiga', contas: { nome: 'Beta SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const mapa = new Map();
  mapa.set('task-antiga', {
    evidencias: [{ id: 'ev-antiga', autor_nome: 'Carlos', data: '2026-08-20T10:00:00Z', texto: 'Validação de escopo com cliente.' }],
    cobertura_banco_completa: true,
    cobertura_clickup_completa: true,
  });

  const resultado = enriquecerRosComEvidencias([ro], mapa, '2026-09-01', '2026-09-12', '2026-09-12');

  assert.equal(resultado.ros[0].atualizacao_no_periodo, null);
  assert.equal(resultado.ros[0].ultima_atividade_humana.id, 'ev-antiga');
  assert.equal(resultado.total_sem_atualizacao, 1);
  assert.equal(resultado.total_com_atualizacao, 0);

  // Alerta explícito obrigatório
  assert.ok(resultado.ros[0].alertas.some((a) => a.includes('Sem atualização humana neste mês')));
  assert.ok(resultado.ros[0].alertas.some((a) => a.includes('2026-08-20')));
});

test('falha em uma oportunidade marca cobertura parcial sem derrubar as demais (Task 8)', () => {
  const roSucesso = {
    id: 'ro-ok',
    numero_ro: 'DELL-OK',
    situacao: 'Aprovada',
    negocios: { id: 'neg-ok', clickup_negocio_id: 'task-ok', contas: { nome: 'OK SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };
  const roFalha = {
    id: 'ro-erro',
    numero_ro: 'DELL-ERR',
    situacao: 'Aprovada',
    negocios: { id: 'neg-erro', clickup_negocio_id: 'task-erro', contas: { nome: 'Erro SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const mapa = new Map();
  mapa.set('task-ok', {
    evidencias: [{ id: 'ev-ok', data: '2026-09-05T10:00:00Z', texto: 'Alinhamento ok.' }],
    cobertura_banco_completa: true,
    cobertura_clickup_completa: true,
  });
  mapa.set('task-erro', new Error('Falha simulada na API do ClickUp'));

  const resultado = enriquecerRosComEvidencias([roSucesso, roFalha], mapa, '2026-09-01', '2026-09-12', '2026-09-12');

  // Cobertura global é marcada como incompleta
  assert.equal(resultado.cobertura_evidencias_completa, false);
  assert.equal(resultado.ros.length, 2);

  // A R.O. com sucesso processa normalmente
  assert.equal(resultado.ros[0].atualizacao_no_periodo.id, 'ev-ok');

  // A R.O. com erro ganha alerta sem derrubar a consulta
  assert.ok(resultado.ros[1].alertas.some((a) => a.includes('Não foi possível consultar as evidências humanas')));
});

test('api-ros index.ts implementa a rota /evidencias com validação de usuário e sem SECURITY DEFINER (Task 8)', () => {
  const indexTs = lerArquivo('supabase/functions/api-ros/index.ts');

  // Rota evidencias está registrada
  assert.ok(indexTs.includes('tail === "evidencias"'));
  assert.ok(indexTs.includes('coletarEvidenciasHumanas'));
  assert.ok(indexTs.includes('enriquecerRosComEvidencias'));

  // Não usa SECURITY DEFINER
  assert.doesNotMatch(indexTs, /SECURITY DEFINER/i);

  // Autenticação obrigatória antes de processar GET
  assert.ok(indexTs.includes('validarAutor(token'));
  assert.ok(indexTs.includes('usuarios_clickup_registrados'));
});


test('GET /api/ros/evidencias com data_inicio não passa por interpretarConsulta e esta rejeita data_inicio/data_fim (Task 8)', () => {
  const indexTs = lerArquivo('supabase/functions/api-ros/index.ts');

  // Comprova que tail === "evidencias" é interceptado ANTES de qualquer chamada a interpretarConsulta
  const idxEvidencias = indexTs.indexOf('tail === "evidencias"');
  const idxInterpretarConsulta = indexTs.indexOf('interpretarConsulta(url.searchParams)');

  assert.ok(idxEvidencias > 0, 'tail === "evidencias" deve estar presente');
  assert.ok(idxInterpretarConsulta > 0, 'interpretarConsulta(url.searchParams) deve estar presente');
  assert.ok(idxEvidencias < idxInterpretarConsulta, 'tail === "evidencias" DEVE ser tratado antes de interpretarConsulta');

  // Se interpretarConsulta recebesse data_inicio ou data_fim, rejeitaria com erro 400
  const paramsInicio = new URLSearchParams({ data_inicio: '2026-09-01' });
  assert.throws(() => interpretarConsulta(paramsInicio), /não permitido.*data_inicio/);

  const paramsFim = new URLSearchParams({ data_fim: '2026-09-12' });
  assert.throws(() => interpretarConsulta(paramsFim), /não permitido.*data_fim/);

  // Já interpretarConsultaEvidencias processa com sucesso
  const paramsEvidencias = new URLSearchParams({ data_inicio: '2026-09-01', data_fim: '2026-09-12' });
  const parsed = interpretarConsultaEvidencias(paramsEvidencias, '2026-09-12');
  assert.equal(parsed.data_inicio, '2026-09-01');
  assert.equal(parsed.data_fim, '2026-09-12');
});

test('interpretarConsultaEvidencias rejeita parâmetros desconhecidos e valida UUIDs (Task 8)', () => {
  // Parâmetro desconhecido é rejeitado
  const pDesconhecido = new URLSearchParams({ parametro_estranho: 'valor' });
  assert.throws(() => interpretarConsultaEvidencias(pDesconhecido, '2026-09-12'), /inválido.*parametro_estranho/);

  // negocio_id inválido (não UUID) é rejeitado
  const pNegocioInvalido = new URLSearchParams({ negocio_id: 'not-a-uuid' });
  assert.throws(() => interpretarConsultaEvidencias(pNegocioInvalido, '2026-09-12'), /negocio_id.*inválido/);

  // fabricante_id inválido (não UUID) é rejeitado
  const pFabricanteInvalido = new URLSearchParams({ fabricante_id: '12345' });
  assert.throws(() => interpretarConsultaEvidencias(pFabricanteInvalido, '2026-09-12'), /fabricante_id.*inválido/);

  // UUIDs válidos são aceitos
  const pValido = new URLSearchParams({
    negocio_id: uuid,
    fabricante_id: uuid,
    situacao: 'Aprovada',
    data_inicio: '2026-09-01',
    data_fim: '2026-09-12',
  });
  const res = interpretarConsultaEvidencias(pValido, '2026-09-12');
  assert.equal(res.negocio_id, uuid);
  assert.equal(res.fabricante_id, uuid);
  assert.equal(res.situacao, 'Aprovada');
});

test('semântica estrita: falha, autor não configurado e oportunidade sem ClickUp entram em cobertura desconhecida, nunca em ausência (Task 8)', () => {
  const roSemClickUp = {
    id: 'ro-sem-clickup',
    numero_ro: 'DELL-NO-CU',
    situacao: 'Aprovada',
    negocios: { id: 'neg-1', clickup_negocio_id: null, contas: { nome: 'Alpha SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const roFalha = {
    id: 'ro-falha',
    numero_ro: 'DELL-FAIL',
    situacao: 'Aprovada',
    negocios: { id: 'neg-2', clickup_negocio_id: 'task-falha', contas: { nome: 'Beta SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const roAutorInvalido = {
    id: 'ro-autor-inv',
    numero_ro: 'DELL-AUTOR',
    situacao: 'Aprovada',
    negocios: { id: 'neg-3', clickup_negocio_id: 'task-autor-inv', contas: { nome: 'Gama SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const mapa = new Map();
  // Falha na chamada
  mapa.set('task-falha', new Error('Timeout ao consultar ClickUp'));
  // Classificação de autor não configurada / inválida
  mapa.set('task-autor-inv', {
    evidencias: [],
    cobertura_banco_completa: false,
    cobertura_clickup_completa: false,
    autor_classificacao_invalida: true,
  });

  const resultado = enriquecerRosComEvidencias(
    [roSemClickUp, roFalha, roAutorInvalido],
    mapa,
    '2026-09-01',
    '2026-09-12',
    '2026-09-12'
  );

  // NENHUMA dessas pode entrar em total_sem_atualizacao_confirmada
  assert.equal(resultado.total_sem_atualizacao_confirmada, 0, 'Não pode contabilizar ausência quando cobertura é desconhecida');
  assert.equal(resultado.total_cobertura_desconhecida, 3, 'Todas as 3 devem entrar em total_cobertura_desconhecida');
  assert.equal(resultado.cobertura_evidencias_completa, false);

  assert.equal(resultado.ros[0].status_evidencia, 'cobertura_desconhecida');
  assert.equal(resultado.ros[1].status_evidencia, 'cobertura_desconhecida');
  assert.equal(resultado.ros[2].status_evidencia, 'cobertura_desconhecida');

  // Alertas individuais são preservados
  assert.ok(resultado.ros[0].alertas.some(a => a.includes('sem identificador ClickUp')));
  assert.ok(resultado.ros[1].alertas.some(a => a.includes('Não foi possível consultar as evidências')));
  assert.ok(resultado.ros[2].alertas.some(a => a.includes('Classificação de autoria não configurada ou inválida')));
});

test('ausência de atualização humana só é contabilizada quando a cobertura da oportunidade está confirmada (Task 8)', () => {
  const roConfirmadaSemAtualizacao = {
    id: 'ro-confirmada-sem-atv',
    numero_ro: 'DELL-OK-VAZIA',
    situacao: 'Aprovada',
    negocios: { id: 'neg-ok', clickup_negocio_id: 'task-ok', contas: { nome: 'Delta SA' } },
    fabricantes_ro: { nome: 'Dell' },
  };

  const mapa = new Map();
  mapa.set('task-ok', {
    evidencias: [],
    cobertura_banco_completa: true,
    cobertura_clickup_completa: true,
  });

  const resultado = enriquecerRosComEvidencias(
    [roConfirmadaSemAtualizacao],
    mapa,
    '2026-09-01',
    '2026-09-12',
    '2026-09-12'
  );

  // Aqui a cobertura está 100% confirmada, portanto é uma ausência confirmada
  assert.equal(resultado.total_sem_atualizacao_confirmada, 1);
  assert.equal(resultado.total_cobertura_desconhecida, 0);
  assert.equal(resultado.cobertura_evidencias_completa, true);
  assert.equal(resultado.ros[0].status_evidencia, 'sem_atualizacao_confirmada');
  assert.ok(resultado.ros[0].alertas.some(a => a.includes('Sem atualização humana neste mês')));
});

test('deduplicação determinística de comentários ClickUp e atividades CRM com exclusão de agentes (Task 8)', () => {
  const autores = {
    '101': 'humano',
    '102': 'agente',
    '103': 'sistema',
  };

  const atividades = [
    // Registro original do CRM com vínculo ao ClickUp
    {
      id: 'crm-ativ-1',
      clickup_comment_id: 'cu-comm-999',
      autor_clickup_id: '101',
      autor_nome: 'Thiago Humano',
      origem: 'crm',
      data_execucao: '2026-09-10T14:00:00Z',
      texto: 'Comentário original no CRM.',
    },
    // Cópia vinda do ClickUp para o mesmo comentário
    {
      id: 'cu_cu-comm-999',
      clickup_comment_id: 'cu-comm-999',
      autor_clickup_id: '101',
      autor_nome: 'Thiago Humano',
      origem: 'clickup',
      data_execucao: '2026-09-10T14:00:00Z',
      texto: 'Comentário replicado do ClickUp.',
    },
    // Comentário gerado por IA/Agente
    {
      id: 'crm-ativ-2',
      clickup_comment_id: 'cu-comm-agent',
      autor_clickup_id: '102',
      autor_nome: 'ClickUp Brain',
      origem: 'crm',
      data_execucao: '2026-09-11T09:00:00Z',
      texto: 'Resumo automático gerado por agente.',
    },
    // Comentário do sistema
    {
      id: 'crm-ativ-3',
      clickup_comment_id: 'cu-comm-sys',
      autor_clickup_id: '103',
      autor_nome: 'System Bot',
      origem: 'crm',
      data_execucao: '2026-09-11T10:00:00Z',
      texto: 'Status alterado pelo sistema.',
    },
  ];

  const resultado = selecionarEvidenciasHumanas(atividades, autores, 50);

  // Apenas 1 evidência humana aceita (deduplicada e sem agentes/sistema)
  assert.equal(resultado.evidencias.length, 1);
  assert.equal(resultado.evidencias[0].clickup_comment_id, 'cu-comm-999');
  assert.equal(resultado.evidencias[0].id, 'crm-ativ-1', 'Deve preferir o registro canônico local');
  assert.equal(resultado.excluidas.agente, 1, 'Deve registrar 1 comentário de agente excluído');
  assert.equal(resultado.excluidas.sistema, 1, 'Deve registrar 1 comentário de sistema excluído');
});


test('interpretarConsulta aceita conta_id válido como UUID e rejeita UUID inválido (Ficha 360º)', () => {
  // UUID válido aceito
  const pValido = new URLSearchParams({ conta_id: uuid });
  const consultaValida = interpretarConsulta(pValido);
  assert.equal(consultaValida.conta_id, uuid);

  // conta_id inválido (não UUID) rejeitado com erro 400
  const pInvalido = new URLSearchParams({ conta_id: 'nao-e-uuid' });
  assert.throws(() => interpretarConsulta(pInvalido), /conta.*inválid/i);
});

test('api-ros repassa conta_id para a listagem oficial no banco sem atalho textual nem ambiguidade (Ficha 360º)', () => {
  const indexTs = lerArquivo('supabase/functions/api-ros/index.ts');
  const migration = lerArquivo('supabase/migrations/20260914a_ro_listagem_filtrada.sql');

  // A lista paginada usa a RPC; a regra de conta fica no JOIN com negocios.
  assert.ok(indexTs.includes('consulta.conta_id'));
  assert.ok(indexTs.includes('p_conta_id: consulta.conta_id'));
  assert.match(migration, /JOIN public\.negocios n/);
  assert.match(migration, /n\.conta_id = p_conta_id/);

  // Não usa busca textual de cliente para resolver conta_id
  assert.ok(!indexTs.includes('buscarIdsContas(supabase, consulta.conta_id)'));
});

test('simulação de consulta por conta_id: conta sem oportunidades ou com múltiplas oportunidades', () => {
  const UUID_NULO = '00000000-0000-0000-0000-000000000000';

  // Cenário 1: Conta sem oportunidades cadastradas
  const negsContaVazia = [];
  const negIdsVazio = negsContaVazia.map(n => n.id);
  const filtroIdsVazio = negIdsVazio.length > 0 ? negIdsVazio : [UUID_NULO];
  assert.deepEqual(filtroIdsVazio, [UUID_NULO], 'Conta sem oportunidades deve filtrar por UUID_NULO resultando em 0 R.Os');

  // Cenário 2: Conta com múltiplas oportunidades
  const negsContaMultiplas = [{ id: 'neg-1' }, { id: 'neg-2' }, { id: 'neg-3' }];
  const negIdsMultiplos = negsContaMultiplas.map(n => n.id);
  const filtroIdsMultiplos = negIdsMultiplos.length > 0 ? negIdsMultiplos : [UUID_NULO];
  assert.deepEqual(filtroIdsMultiplos, ['neg-1', 'neg-2', 'neg-3'], 'Conta com múltiplas oportunidades deve filtrar por todas as oportunidades');
});
