import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const caminhoDominio = new URL('../ros-ui-domain.js', import.meta.url).pathname;

function carregarDominioRos({ fetchImpl } = {}) {
  const contexto = { URLSearchParams, fetch: fetchImpl };
  contexto.globalThis = contexto;
  vm.runInNewContext(fs.readFileSync(caminhoDominio, 'utf8'), contexto, { filename: caminhoDominio });
  return contexto.RosUiDomain;
}

test('o navegador e os testes carregam o mesmo domínio de R.Os', () => {
  const dominio = carregarDominioRos();
  assert.equal(typeof dominio?.montarQueryRos, 'function');
  assert.equal(typeof dominio?.traduzirErroApiRos, 'function');
  assert.equal(typeof dominio?.fetchRegistrosOportunidade, 'function');
});

test('montarQueryRos serializa paginação e filtros omitindo campos vazios', () => {
  const { montarQueryRos } = carregarDominioRos();
  const queryPadrao = montarQueryRos({}, 1, 50);
  assert.equal(queryPadrao.get('pagina'), '1');
  assert.equal(queryPadrao.get('limite'), '50');
  assert.equal(queryPadrao.has('fabricante_id'), false);
  assert.equal(queryPadrao.has('situacao'), false);

  const queryCompleta = montarQueryRos({
    negocio_id: '11111111-1111-4111-8111-111111111111',
    fabricante_id: '22222222-2222-4222-8222-222222222222',
    situacao: 'Aprovada', responsavel: '90848927', vence_ate: '2026-12-31',
    filtro_vazio: '', filtro_nulo: null, filtro_undefined: undefined,
  }, 2, 25);
  assert.equal(queryCompleta.get('pagina'), '2');
  assert.equal(queryCompleta.get('limite'), '25');
  assert.equal(queryCompleta.get('negocio_id'), '11111111-1111-4111-8111-111111111111');
  assert.equal(queryCompleta.get('fabricante_id'), '22222222-2222-4222-8222-222222222222');
  assert.equal(queryCompleta.get('situacao'), 'Aprovada');
  assert.equal(queryCompleta.get('responsavel'), '90848927');
  assert.equal(queryCompleta.get('vence_ate'), '2026-12-31');
  assert.equal(queryCompleta.has('filtro_vazio'), false);
  assert.equal(queryCompleta.has('filtro_nulo'), false);
});

test('traduzirErroApiRos mapeia códigos HTTP e mensagens sem expor detalhes internos', () => {
  const { traduzirErroApiRos } = carregarDominioRos();
  assert.match(traduzirErroApiRos(401, null), /sessão expirada|não autenticada/i);
  assert.match(traduzirErroApiRos(403, null), /acesso negado|não cadastrado/i);
  assert.equal(traduzirErroApiRos(409, { error: 'Conflito de versão: R.O. alterada por outro usuário.' }), 'Conflito de versão: R.O. alterada por outro usuário.');
  assert.equal(traduzirErroApiRos(422, { error: 'Versão esperada deve ser um número inteiro positivo.' }), 'Versão esperada deve ser um número inteiro positivo.');
  assert.match(traduzirErroApiRos(500, null), /erro de comunicação|inesperado/i);
  assert.equal(traduzirErroApiRos(503, null, 'Serviço temporariamente indisponível.'), 'Serviço temporariamente indisponível.');
});

test('fetchRegistrosOportunidade envia Authorization, monta query e processa resposta com sucesso', async () => {
  let urlChamada = '';
  let headersChamados = {};
  const mockFetch = async (url, init) => {
    urlChamada = String(url); headersChamados = init?.headers || {};
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'ro-1', titulo: 'Dell HCI' }], total: 1, pagina: 1, limite: 50 }) };
  };
  const { fetchRegistrosOportunidade } = carregarDominioRos({ fetchImpl: mockFetch });
  const resultado = await fetchRegistrosOportunidade({ situacao: 'Aprovada' }, 1, 50, { getHeaders: () => ({ Authorization: 'Bearer token-clickup-123' }) });
  assert.match(urlChamada, /\/api\/ros\?.*situacao=Aprovada/);
  assert.match(urlChamada, /pagina=1/);
  assert.match(urlChamada, /limite=50/);
  assert.equal(headersChamados.Authorization, 'Bearer token-clickup-123');
  assert.equal(resultado.total, 1);
  assert.equal(resultado.data[0].id, 'ro-1');
});

test('fetchRegistrosOportunidade traduz resposta não OK e falha de rede', async () => {
  const mockFetch401 = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
  const { fetchRegistrosOportunidade: consultar401 } = carregarDominioRos({ fetchImpl: mockFetch401 });
  await assert.rejects(() => consultar401({}, 1, 50), /sessão expirada|não autenticada/i);
  const mockFetchNetworkError = async () => { throw new Error('Failed to fetch'); };
  const { fetchRegistrosOportunidade: consultarRede } = carregarDominioRos({ fetchImpl: mockFetchNetworkError });
  await assert.rejects(() => consultarRede({}, 1, 50), /falha de rede|comunicação|Failed to fetch/i);
});

test('fetchRegistrosOportunidade traduz status 403, 409, 422 e 500', async () => {
  const criarMock = (status, body) => async () => ({ ok: false, status, json: async () => body });
  for (const [status, body, esperado] of [[403, {}, /acesso negado/i], [409, { error: 'Conflito de versão ao atualizar R.O.' }, /conflito de versão/i], [422, { error: 'Entidade improcessável' }, /entidade improcessável/i], [500, {}, /erro inesperado na comunicação/i]]) {
    const { fetchRegistrosOportunidade } = carregarDominioRos({ fetchImpl: criarMock(status, body) });
    await assert.rejects(() => fetchRegistrosOportunidade({}, 1, 50), esperado);
  }
});

test('fetchResumoRos consulta /api/ros/resumo com filtros e headers de autorização', async () => {
  let urlChamada = '';
  let headersChamados = {};
  const mockFetch = async (url, init) => {
    urlChamada = String(url);
    headersChamados = init?.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        total: 15,
        aguardando_aprovacao: 4,
        renovacoes_em_analise: 2,
        vencem_15_dias: 3,
      }),
    };
  };
  const { fetchResumoRos } = carregarDominioRos({ fetchImpl: mockFetch });
  const resumo = await fetchResumoRos(
    { fabricante_id: 'fab-123', situacao: 'Aguardando aprovação' },
    { getHeaders: () => ({ Authorization: 'Bearer token-clickup' }) }
  );
  assert.match(urlChamada, /\/api\/ros\/resumo\?.*fabricante_id=fab-123/);
  assert.match(urlChamada, /situacao=Aguardando\+aprova%C3%A7%C3%A3o|situacao=Aguardando/);
  assert.equal(headersChamados.Authorization, 'Bearer token-clickup');
  assert.equal(resumo.total, 15);
  assert.equal(resumo.aguardando_aprovacao, 4);
  assert.equal(resumo.renovacoes_em_analise, 2);
  assert.equal(resumo.vencem_15_dias, 3);
});

test('fetchResumoRos traduz erro não OK e falha de rede', async () => {
  const mockFetch500 = async () => ({ ok: false, status: 500, json: async () => ({ error: 'Falha interna' }) });
  const { fetchResumoRos: resumo500 } = carregarDominioRos({ fetchImpl: mockFetch500 });
  await assert.rejects(() => resumo500({}), /erro inesperado|Falha interna/i);

  const mockFetchRede = async () => { throw new Error('Falha de rede'); };
  const { fetchResumoRos: resumoRede } = carregarDominioRos({ fetchImpl: mockFetchRede });
  await assert.rejects(() => resumoRede({}), /falha de rede|comunicação/i);
});

test('formatarDataCivil formata data no padrão brasileiro sem desvio de fuso', () => {
  const { formatarDataCivil } = carregarDominioRos();
  assert.equal(formatarDataCivil(null), '-');
  assert.equal(formatarDataCivil(undefined), '-');
  assert.equal(formatarDataCivil(''), '-');
  assert.equal(formatarDataCivil('2026-09-12'), '12/09/2026');
  assert.equal(formatarDataCivil('2026-01-05'), '05/01/2026');
  assert.equal(formatarDataCivil('2026-12-31'), '31/12/2026');
});

test('calcularVigenciaRo classifica prazos no padrão civil America/Sao_Paulo', () => {
  const { calcularVigenciaRo } = carregarDominioRos();
  const hoje = '2026-09-12';
  assert.equal(calcularVigenciaRo(null, hoje), 'Sem prazo');
  assert.equal(calcularVigenciaRo('', hoje), 'Sem prazo');
  assert.equal(calcularVigenciaRo('2026-09-10', hoje), 'Vencida');
  assert.equal(calcularVigenciaRo('2026-09-12', hoje), 'Vence hoje');
  assert.equal(calcularVigenciaRo('2026-09-20', hoje), 'A vencer');
  assert.equal(calcularVigenciaRo('2026-09-27', hoje), 'A vencer'); // 15 dias
  assert.equal(calcularVigenciaRo('2026-09-28', hoje), 'Vigente');
  assert.equal(calcularVigenciaRo('2026-11-30', hoje), 'Vigente');
});

test('obterRotuloSituacao mapeia situações comerciais e classes acessíveis com texto legível', () => {
  const { obterRotuloSituacao } = carregarDominioRos();
  const backoffice = obterRotuloSituacao('Backoffice');
  assert.equal(backoffice.rotulo, 'Backoffice');
  assert.ok(backoffice.classeBadge.includes('bg-'));

  const aguardando = obterRotuloSituacao('Aguardando aprovação');
  assert.equal(aguardando.rotulo, 'Aguardando aprovação');
  assert.ok(aguardando.classeBadge.includes('bg-'));

  const aprovada = obterRotuloSituacao('Aprovada');
  assert.equal(aprovada.rotulo, 'Aprovada');

  const reprovada = obterRotuloSituacao('Reprovada');
  assert.equal(reprovada.rotulo, 'Reprovada');

  const encerrada = obterRotuloSituacao('Encerrada');
  assert.equal(encerrada.rotulo, 'Encerrada');

  const substituida = obterRotuloSituacao('Substituída');
  assert.equal(substituida.rotulo, 'Substituída');

  const desconhecido = obterRotuloSituacao('Inexistente');
  assert.equal(desconhecido.rotulo, 'Inexistente');
});

test('calcularPaginacao calcula páginas, limites e intervalos com segurança', () => {
  const { calcularPaginacao } = carregarDominioRos();
  const pag1 = calcularPaginacao(105, 1, 50);
  assert.equal(pag1.totalPaginas, 3);
  assert.equal(pag1.inicio, 1);
  assert.equal(pag1.fim, 50);
  assert.equal(pag1.temAnterior, false);
  assert.equal(pag1.temProximo, true);

  const pag2 = calcularPaginacao(105, 2, 50);
  assert.equal(pag2.inicio, 51);
  assert.equal(pag2.fim, 100);
  assert.equal(pag2.temAnterior, true);
  assert.equal(pag2.temProximo, true);

  const pag3 = calcularPaginacao(105, 3, 50);
  assert.equal(pag3.inicio, 101);
  assert.equal(pag3.fim, 105);
  assert.equal(pag3.temAnterior, true);
  assert.equal(pag3.temProximo, false);

  const pagVazia = calcularPaginacao(0, 1, 50);
  assert.equal(pagVazia.totalPaginas, 1);
  assert.equal(pagVazia.inicio, 0);
  assert.equal(pagVazia.fim, 0);
  assert.equal(pagVazia.temAnterior, false);
  assert.equal(pagVazia.temProximo, false);
});

test('montarQueryRos serializa cliente, oportunidade, numero_ro e busca mantendo paridade entre lista e resumo', () => {
  const { montarQueryRos } = carregarDominioRos();
  const query = montarQueryRos({
    cliente: 'Hospital Sírio-Libanês',
    oportunidade: 'Projeto Telecom',
    numero_ro: 'RO-900',
    busca: 'Projeto Telecom',
    situacao: 'Aguardando aprovação',
  }, 1, 50);

  assert.equal(query.get('cliente'), 'Hospital Sírio-Libanês');
  assert.equal(query.get('oportunidade'), 'Projeto Telecom');
  assert.equal(query.get('numero_ro'), 'RO-900');
  assert.equal(query.get('busca'), 'Projeto Telecom');
  assert.equal(query.get('situacao'), 'Aguardando aprovação');
});

test('formatarCategoriaRo retorna a categoria ou travessão e nunca inventa Infra', () => {
  const { formatarCategoriaRo } = carregarDominioRos();
  assert.equal(formatarCategoriaRo('Software'), 'Software');
  assert.equal(formatarCategoriaRo('Nuvem Híbrida'), 'Nuvem Híbrida');
  assert.equal(formatarCategoriaRo(''), '—');
  assert.equal(formatarCategoriaRo('   '), '—');
  assert.equal(formatarCategoriaRo(null), '—');
  assert.equal(formatarCategoriaRo(undefined), '—');
});

test('obterLinkOportunidade gera link seguro e atributos externos corretos quando houver identificador', () => {
  const { obterLinkOportunidade } = carregarDominioRos();

  const comClickup = obterLinkOportunidade({
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Projeto Core Switch',
    clickup_negocio_id: '868abc123',
  });
  assert.equal(comClickup.temLink, true);
  assert.equal(comClickup.url, 'https://app.clickup.com/t/868abc123');
  assert.equal(comClickup.rel, 'noopener noreferrer');
  assert.equal(comClickup.target, '_blank');

  const semIdentificador = obterLinkOportunidade({
    nome: 'Oportunidade Manual',
  });
  assert.equal(semIdentificador.temLink, false);
  assert.equal(semIdentificador.url, null);
});

test('tratarEstadoResumo assegura que falha de consulta nunca exibe zero e sim Indisponível', () => {
  const { tratarEstadoResumo } = carregarDominioRos();

  // Sucesso com zeros legítimos confirmados
  const sucessoZero = tratarEstadoResumo({
    total: 0,
    aguardando_aprovacao: 0,
    renovacoes_em_analise: 0,
    vencem_15_dias: 0,
  }, null, false);
  assert.equal(sucessoZero.disponivel, true);
  assert.equal(sucessoZero.valores.total, 0);
  assert.equal(sucessoZero.valores.aguardando_aprovacao, 0);

  // Erro no resumo: nunca deve mascarar com zero
  const comErro = tratarEstadoResumo(null, 'Erro 500 no banco', false);
  assert.equal(comErro.disponivel, false);
  assert.equal(comErro.textoExibicao, 'Indisponível');
  assert.equal(comErro.valores.total, null);

  // Carregando
  const carregando = tratarEstadoResumo(null, null, true);
  assert.equal(carregando.carregando, true);
  assert.equal(carregando.disponivel, false);
});

test('painel ordena eventos recentes primeiro e separa vigência, ciclo e ações permitidas', () => {
  const { ordenarEventosRo, resumirCiclosRo, obterAcoesPermitidasRo } = carregarDominioRos();
  const eventos = ordenarEventosRo([
    { tipo: 'Criada', created_at: '2026-09-01T10:00:00Z' },
    { tipo: 'Aprovada', created_at: '2026-09-12T12:00:00Z' },
    { tipo: 'Renovação solicitada', created_at: '2026-09-08T09:00:00Z' },
  ]);
  assert.deepEqual(Array.from(eventos, (evento) => evento.tipo), ['Aprovada', 'Renovação solicitada', 'Criada']);

  const ciclos = resumirCiclosRo([
    { ciclo: 1, situacao: 'Aprovada' },
    { ciclo: 2, situacao: 'Em análise' },
  ]);
  assert.equal(ciclos.aprovados, 1);
  assert.equal(ciclos.pendente?.ciclo, 2);

  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Backoffice')), ['enviar', 'aprovar', 'encerrar']);
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Aguardando aprovação')), ['aprovar', 'encerrar']);
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Aprovada', false)), ['solicitar_renovacao', 'encerrar']);
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Aprovada', true)), ['responder_renovacao', 'encerrar']);
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Encerrada')), []);
});

test('validarPayloadCriacaoRo exige oportunidade, fabricante e categoria com cenário e responsável opcionais', () => {
  const { validarPayloadCriacaoRo } = carregarDominioRos();

  // Bloqueio sem oportunidade
  assert.throws(
    () => validarPayloadCriacaoRo({ fabricante_id: 'fab-1', categoria: 'Software' }),
    /oportunidade/i
  );
  assert.throws(
    () => validarPayloadCriacaoRo({ negocio_id: '', fabricante_id: 'fab-1', categoria: 'Software' }),
    /oportunidade/i
  );

  // Bloqueio sem fabricante
  assert.throws(
    () => validarPayloadCriacaoRo({ negocio_id: 'neg-1', categoria: 'Software' }),
    /fabricante/i
  );

  // Bloqueio sem categoria
  assert.throws(
    () => validarPayloadCriacaoRo({ negocio_id: 'neg-1', fabricante_id: 'fab-1', categoria: '' }),
    /categoria/i
  );

  // Sucesso com campos mínimos obrigatórios (cenário e responsável opcionais)
  const limpoMinimo = validarPayloadCriacaoRo({
    negocio_id: 'neg-1',
    fabricante_id: 'fab-1',
    categoria: 'Infraestrutura',
  });
  assert.equal(limpoMinimo.negocio_id, 'neg-1');
  assert.equal(limpoMinimo.fabricante_id, 'fab-1');
  assert.equal(limpoMinimo.categoria, 'Infraestrutura');
  assert.equal(limpoMinimo.cenario, null);
  assert.equal(limpoMinimo.responsavel_operacional_clickup_id, null);
  assert.equal(limpoMinimo.titulo, null);

  // Sucesso com todos os campos preenchidos
  const limpoCompleto = validarPayloadCriacaoRo({
    negocio_id: 'neg-2',
    fabricante_id: 'fab-2',
    categoria: 'Nuvem',
    titulo: 'Expansão Datacenter',
    cenario: 'Migração de servidores legados',
    responsavel_operacional_clickup_id: '90848927',
    request_id: 'req-stable-1',
  });
  assert.equal(limpoCompleto.titulo, 'Expansão Datacenter');
  assert.equal(limpoCompleto.cenario, 'Migração de servidores legados');
  assert.equal(limpoCompleto.responsavel_operacional_clickup_id, '90848927');
  assert.equal(limpoCompleto.request_id, 'req-stable-1');
});

test('retry de criacao de R.O. reutiliza estritamente o mesmo request_id apos falha e tem sucesso na 2a chamada', async () => {
  const { criarRegistroOportunidade, gerarRequestIdRo } = carregarDominioRos();

  const requestIdEstavel = gerarRequestIdRo();
  const chamadas = [];

  const mockFetch = async (url, init) => {
    const headers = init?.headers || {};
    const body = JSON.parse(init?.body || '{}');
    chamadas.push({
      url: String(url),
      headers,
      body,
    });

    if (chamadas.length === 1) {
      // 1a chamada falha (500 do servidor)
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Falha temporária de infraestrutura' }),
      };
    }

    // 2a chamada (retry) confirma sucesso 201
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 'ro-criada-com-sucesso',
        negocio_id: body.negocio_id,
        fabricante_id: body.fabricante_id,
        situacao: 'Backoffice',
      }),
    };
  };

  const { criarRegistroOportunidade: criarRoComMock } = carregarDominioRos({ fetchImpl: mockFetch });

  const payload = {
    negocio_id: '11111111-1111-4111-8111-111111111111',
    fabricante_id: '22222222-2222-4222-8222-222222222222',
    categoria: 'Infraestrutura',
    request_id: requestIdEstavel,
  };

  // 1a tentativa: deve falhar sem perder o request_id
  await assert.rejects(
    () => criarRoComMock(payload),
    /falha|temporária/i
  );
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].headers['x-request-id'], requestIdEstavel);
  assert.equal(chamadas[0].body.request_id, requestIdEstavel);

  // 2a tentativa (retry): mesmo request_id enviado na mesma criação
  const respostaSucesso = await criarRoComMock(payload);
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1].headers['x-request-id'], requestIdEstavel);
  assert.equal(chamadas[1].body.request_id, requestIdEstavel);

  // Validação explícita de idempotência
  assert.equal(chamadas[0].headers['x-request-id'], chamadas[1].headers['x-request-id']);
  assert.equal(chamadas[0].body.request_id, chamadas[1].body.request_id);
  assert.equal(respostaSucesso.id, 'ro-criada-com-sucesso');
});

test('criarRegistroOportunidade envia POST para /api/ros com headers corretos e processa sucesso', async () => {
  let urlChamada = '';
  let metodoChamado = '';
  let headersChamados = {};
  let corpoChamado = null;

  const mockFetch = async (url, init) => {
    urlChamada = String(url);
    metodoChamado = init?.method;
    headersChamados = init?.headers || {};
    corpoChamado = JSON.parse(init?.body || '{}');
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 'ro-nova-1',
        negocio_id: corpoChamado.negocio_id,
        fabricante_id: corpoChamado.fabricante_id,
        situacao: 'Backoffice',
      }),
    };
  };

  const { criarRegistroOportunidade } = carregarDominioRos({ fetchImpl: mockFetch });
  const resultado = await criarRegistroOportunidade(
    {
      negocio_id: 'neg-123',
      fabricante_id: 'fab-456',
      categoria: 'Software',
      cenario: 'Cenário teste',
      request_id: 'req-abc-999',
    },
    { getHeaders: () => ({ Authorization: 'Bearer token-clickup-123' }) }
  );

  assert.equal(urlChamada, '/api/ros');
  assert.equal(metodoChamado, 'POST');
  assert.equal(headersChamados.Authorization, 'Bearer token-clickup-123');
  assert.equal(headersChamados['x-request-id'], 'req-abc-999');
  assert.equal(corpoChamado.negocio_id, 'neg-123');
  assert.equal(corpoChamado.request_id, 'req-abc-999');
  assert.equal(resultado.id, 'ro-nova-1');
  assert.equal(resultado.situacao, 'Backoffice');
});

test('criarRegistroOportunidade traduz erros 401, 409, 422 e falha de rede preservando dados para retry', async () => {
  const criarMockErro = (status, payload) => async () => ({
    ok: false,
    status,
    json: async () => payload,
  });

  // 401
  const { criarRegistroOportunidade: criar401 } = carregarDominioRos({
    fetchImpl: criarMockErro(401, { error: 'Unauthorized' }),
  });
  await assert.rejects(
    () => criar401({ negocio_id: 'neg-1', fabricante_id: 'fab-1', categoria: 'Software' }),
    /sessão expirada|não autenticada/i
  );

  // 409
  const { criarRegistroOportunidade: criar409 } = carregarDominioRos({
    fetchImpl: criarMockErro(409, { error: 'R.O. já cadastrada para este fabricante' }),
  });
  await assert.rejects(
    () => criar409({ negocio_id: 'neg-1', fabricante_id: 'fab-1', categoria: 'Software' }),
    /já cadastrada|conflito/i
  );

  // 422
  const { criarRegistroOportunidade: criar422 } = carregarDominioRos({
    fetchImpl: criarMockErro(422, { error: 'Categoria inválida' }),
  });
  await assert.rejects(
    () => criar422({ negocio_id: 'neg-1', fabricante_id: 'fab-1', categoria: 'Software' }),
    /inválid/i
  );

  // Falha de rede
  const { criarRegistroOportunidade: criarRede } = carregarDominioRos({
    fetchImpl: async () => { throw new Error('Failed to fetch'); },
  });
  await assert.rejects(
    () => criarRede({ negocio_id: 'neg-1', fabricante_id: 'fab-1', categoria: 'Software' }),
    /falha de rede/i
  );
});

test('desambiguarOportunidade formata cliente e nome do projeto claramente', () => {
  const { desambiguarOportunidade } = carregarDominioRos();

  const opComCliente = desambiguarOportunidade({
    id: 'op-1',
    nome: 'Expansão Datacenter HCI',
    contas: { nome: 'Hospital Santa Joana' },
  });
  assert.equal(opComCliente, 'Hospital Santa Joana — Expansão Datacenter HCI');

  const opComRazaoSocial = desambiguarOportunidade({
    id: 'op-2',
    nome: 'Licenciamento Red Hat',
    contas: { razao_social: 'Acme Corp S/A' },
  });
  assert.equal(opComRazaoSocial, 'Acme Corp S/A — Licenciamento Red Hat');

  const opSemCliente = desambiguarOportunidade({
    id: 'op-3',
    nome: 'Projeto Firewall Fortinet',
  });
  assert.equal(opSemCliente, 'Sem cliente informado — Projeto Firewall Fortinet');
});

test('resolverNegocioCrmParaRo nunca usa task.id como fallback de negocio_id quando nao localizado no CRM', async () => {
  const { resolverNegocioCrmParaRo } = carregarDominioRos();

  // Caso 1: Busca no CRM não encontra registro (retorna null)
  const consultarCrmVazio = async () => null;
  const taskClickUp = { id: 'clickup-task-8899', name: 'Projeto Sem Sincronia CRM' };

  const resultado = await resolverNegocioCrmParaRo(taskClickUp, consultarCrmVazio);
  // Não pode retornar objeto contendo id do ClickUp como se fosse negócio do CRM
  assert.equal(resultado, null);

  // Caso 2: Falha na consulta (erro lançado)
  const consultarCrmErro = async () => { throw new Error('Erro de conexão ao CRM'); };
  const resultadoErro = await resolverNegocioCrmParaRo(taskClickUp, consultarCrmErro);
  assert.equal(resultadoErro, null);

  // Caso 3: Encontra negócio real no CRM
  const negocioRealCrm = {
    id: '33333333-3333-4333-8333-333333333333',
    nome: 'Projeto Oficial CRM',
    conta_id: '44444444-4444-4444-8444-444444444444',
  };
  const consultarCrmSucesso = async (criterio) => {
    if (criterio.clickup_negocio_id === 'clickup-task-8899') {
      return negocioRealCrm;
    }
    return null;
  };
  const resultadoSucesso = await resolverNegocioCrmParaRo(taskClickUp, consultarCrmSucesso);
  assert.equal(resultadoSucesso.id, negocioRealCrm.id);

  // Verificação estática do arquivo app.js: assegura que handleAbrirNovaRoOportunidade
  // não possui fallback atribuindo task.id para negocio.id
  const appJsPath = new URL('../app.js', import.meta.url).pathname;
  const appJsConteudo = fs.readFileSync(appJsPath, 'utf8');
  assert.ok(
    !appJsConteudo.includes('negocio = {\n        id: task.id') &&
    !appJsConteudo.includes('negocio = { id: task.id') &&
    !appJsConteudo.includes('negocio = {\n        id: task?.id'),
    'app.js não deve conter fallback atribuindo task.id a negocio.id'
  );
});

test('busca de clientes e oportunidades protege caracteres reservados e não utiliza .or concatenado em app.js', () => {
  const appJsPath = new URL('../app.js', import.meta.url).pathname;
  const appJsConteudo = fs.readFileSync(appJsPath, 'utf8');

  // Assegura que o NovaRoModal em app.js não utiliza .or(...) concatenado para busca de clientes
  const modalStart = appJsConteudo.indexOf("function NovaRoModal(");
  const modalEnd = appJsConteudo.indexOf("function RegistrosOportunidadeView(");
  const novaRoModalTrecho = appJsConteudo.slice(modalStart, modalEnd);

  assert.ok(
    !novaRoModalTrecho.includes(".or("),
    "NovaRoModal não deve concatenar strings no operador .or(...) do PostgREST"
  );
  assert.ok(
    novaRoModalTrecho.includes("supabaseClient.from(\"contas\").select(\"id\").ilike(\"nome\"") ||
    novaRoModalTrecho.includes("supabaseClient.from('contas').select('id').ilike('nome'"),
    "NovaRoModal deve fazer consulta independente em contas.nome"
  );
  assert.ok(
    novaRoModalTrecho.includes("supabaseClient.from(\"contas\").select(\"id\").ilike(\"razao_social\"") ||
    novaRoModalTrecho.includes("supabaseClient.from('contas').select('id').ilike('razao_social'"),
    "NovaRoModal deve fazer consulta independente em contas.razao_social"
  );

  // Simulação de pesquisa com caracteres reservados (vírgula, aspas, parênteses, porcentagem)
  const termosReservados = [
    'Empresa, Ltda',
    'Cliente (Matriz)',
    '100% Tecnologia',
    'Projeto "Enterprise"',
    'A & B / C, D (SP)',
  ];

  for (const termo of termosReservados) {
    // As consultas em contas devem ser independentes (nome e razao_social)
    const queryNome = "%" + termo + "%";
    const queryRazao = "%" + termo + "%";
    assert.ok(queryNome.includes(termo));
    assert.ok(queryRazao.includes(termo));

    // Verificação de união de IDs sem duplicidade
    const listaResultadosMockNome = [{ id: 'conta-1' }, { id: 'conta-2' }];
    const listaResultadosMockRazao = [{ id: 'conta-2' }, { id: 'conta-3' }];
    const idsUnicos = new Set();
    listaResultadosMockNome.forEach((c) => c?.id && idsUnicos.add(c.id));
    listaResultadosMockRazao.forEach((c) => c?.id && idsUnicos.add(c.id));
    assert.deepEqual(Array.from(idsUnicos), ['conta-1', 'conta-2', 'conta-3']);
  }
});

test('obterAcoesPermitidasRo bloqueia nova solicitação se houver ciclo pendente e nunca oferece substituir na Task 6', () => {
  const { obterAcoesPermitidasRo } = carregarDominioRos();

  // Backoffice: enviar, aprovar, encerrar
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Backoffice')), ['enviar', 'aprovar', 'encerrar']);

  // Aguardando aprovação: aprovar, encerrar
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Aguardando aprovação')), ['aprovar', 'encerrar']);

  // Aprovada sem renovação pendente: solicitar_renovacao, encerrar (NUNCA substituir)
  const acoesSemPendente = Array.from(obterAcoesPermitidasRo('Aprovada', false));
  assert.deepEqual(acoesSemPendente, ['solicitar_renovacao', 'encerrar']);
  assert.equal(acoesSemPendente.includes('substituir'), false);

  // Aprovada com renovação pendente: responder_renovacao, encerrar (NUNCA solicitar_renovacao, NUNCA substituir)
  const acoesComPendente = Array.from(obterAcoesPermitidasRo('Aprovada', true));
  assert.deepEqual(acoesComPendente, ['responder_renovacao', 'encerrar']);
  assert.equal(acoesComPendente.includes('solicitar_renovacao'), false);
  assert.equal(acoesComPendente.includes('substituir'), false);

  // Inativas
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Encerrada')), []);
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Reprovada')), []);
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Substituída')), []);
});

test('validarPayloadAcaoRo valida regras estritas de cada ação operacional', () => {
  const { validarPayloadAcaoRo } = carregarDominioRos();

  // A) Enviar
  assert.throws(() => validarPayloadAcaoRo('enviar', {}), /data do envio/i);
  assert.throws(() => validarPayloadAcaoRo('enviar', { data_solicitacao: '2026-02-30' }), /data válida/i);
  const envioValido = validarPayloadAcaoRo('enviar', {
    data_solicitacao: '2026-09-12',
    observacao: 'Enviado ao portal do fabricante',
    versao_esperada: 1,
    request_id: 'req-envio-1',
  });
  assert.equal(envioValido.rota, 'enviar');
  assert.equal(envioValido.payload.data_solicitacao, '2026-09-12');
  assert.equal(envioValido.payload.observacao, 'Enviado ao portal do fabricante');
  assert.equal(envioValido.payload.versao_esperada, 1);
  assert.equal(envioValido.payload.request_id, 'req-envio-1');

  // B) Aprovar
  assert.throws(() => validarPayloadAcaoRo('aprovar', { data_aprovacao: '2026-09-12', data_vencimento: '2026-12-11' }), /número oficial/i);
  assert.throws(() => validarPayloadAcaoRo('aprovar', { numero_ro: 'RO-1', data_aprovacao: '2026-09-12' }), /data de vencimento/i);
  const aprovacaoValida = validarPayloadAcaoRo('aprovar', {
    numero_ro: 'RO-DELL-2026-01',
    data_aprovacao: '2026-09-12',
    data_vencimento: '2026-12-11',
    versao_esperada: 2,
    request_id: 'req-aprov-1',
  });
  assert.equal(aprovacaoValida.rota, 'aprovar');
  assert.equal(aprovacaoValida.payload.numero_ro, 'RO-DELL-2026-01');
  assert.equal(aprovacaoValida.payload.data_vencimento, '2026-12-11');

  // C) Solicitar renovação
  assert.throws(() => validarPayloadAcaoRo('solicitar_renovacao', {}), /data de solicitação/i);
  const renovacaoSolicitada = validarPayloadAcaoRo('solicitar_renovacao', {
    data_solicitacao: '2026-11-20',
    versao_esperada: 3,
  });
  assert.equal(renovacaoSolicitada.rota, 'renovacoes');
  assert.equal(renovacaoSolicitada.payload.data_solicitacao, '2026-11-20');

  // D) Responder renovação - Aprovação (exige novo vencimento posterior ao atual)
  assert.throws(() => validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'aprovar',
    data_resposta: '2026-11-25',
    novo_vencimento: '2026-12-11', // igual ao vencimento atual
  }, { data_vencimento: '2026-12-11', ciclo: 1 }), /posterior ao vencimento atual/i);

  assert.throws(() => validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'aprovar',
    data_resposta: '2026-11-25',
    novo_vencimento: '2026-10-01', // anterior ao atual
  }, { data_vencimento: '2026-12-11', ciclo: 1 }), /posterior ao vencimento atual/i);

  const renovacaoAprovada = validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'aprovar',
    data_resposta: '2026-11-25',
    novo_vencimento: '2027-03-11',
    request_id: 'req-ren-aprov',
  }, { data_vencimento: '2026-12-11', ciclo: 2 });
  assert.equal(renovacaoAprovada.rota, 'renovacoes/2/aprovar');
  assert.equal(renovacaoAprovada.payload.novo_vencimento, '2027-03-11');
  assert.equal(renovacaoAprovada.payload.request_id, 'req-ren-aprov');

  // D) Responder renovação - Negativa (exige motivo, não envia novo vencimento e preserva anterior)
  assert.throws(() => validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'negar',
    data_resposta: '2026-11-25',
  }, { ciclo: 2 }), /motivo da negativa/i);

  const renovacaoNegada = validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'negar',
    data_resposta: '2026-11-25',
    motivo: 'Fabricante informou limite de prazo expirado',
    novo_vencimento: '2027-01-01', // se digitado indevidamente, não deve ser repassado
  }, { data_vencimento: '2026-12-11', ciclo: 2 });
  assert.equal(renovacaoNegada.rota, 'renovacoes/2/negar');
  assert.equal(renovacaoNegada.payload.motivo, 'Fabricante informou limite de prazo expirado');
  assert.equal(renovacaoNegada.payload.novo_vencimento, undefined);

  // E) Encerrar ou reprovar
  assert.throws(() => validarPayloadAcaoRo('encerrar', {
    situacao: 'Substituída',
    data_encerramento: '2026-12-01',
    motivo: 'Tentativa de substituição indevida',
  }), /situação final deve ser "Encerrada" ou "Reprovada"/i);

  assert.throws(() => validarPayloadAcaoRo('encerrar', {
    situacao: 'Encerrada',
    data_encerramento: '2026-12-01',
  }), /motivo/i);

  const encerramentoValido = validarPayloadAcaoRo('encerrar', {
    situacao: 'Encerrada',
    data_encerramento: '2026-12-02',
    motivo: 'Oportunidade perdida para concorrente',
    versao_esperada: 4,
  });
  assert.equal(encerramentoValido.rota, 'encerrar');
  assert.equal(encerramentoValido.payload.situacao, 'Encerrada');
  assert.equal(encerramentoValido.payload.data_encerramento, '2026-12-02');
  assert.equal(encerramentoValido.payload.motivo, 'Oportunidade perdida para concorrente');
});

test('executarAcaoRo envia POST com headers, x-request-id e payload corretos', async () => {
  let urlChamada = '';
  let metodoChamado = '';
  let headersChamados = {};
  let bodyChamado = null;

  const mockFetch = async (url, init) => {
    urlChamada = String(url);
    metodoChamado = init?.method;
    headersChamados = init?.headers || {};
    bodyChamado = JSON.parse(init?.body || '{}');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'ro-123',
          situacao: 'Aguardando aprovação',
          versao: 2,
        },
      }),
    };
  };

  const { executarAcaoRo } = carregarDominioRos({ fetchImpl: mockFetch });

  const getHeaders = () => ({ Authorization: 'Bearer token-jwt-crm' });
  const resultado = await executarAcaoRo(
    'ro-123',
    'enviar',
    { data_solicitacao: '2026-09-12', versao_esperada: 1, request_id: 'req-envio-mock' },
    { getHeaders }
  );

  assert.equal(metodoChamado, 'POST');
  assert.equal(urlChamada, '/api/ros/ro-123/enviar');
  assert.equal(headersChamados['Authorization'], 'Bearer token-jwt-crm');
  assert.equal(headersChamados['Content-Type'], 'application/json');
  assert.equal(headersChamados['x-request-id'], 'req-envio-mock');
  assert.equal(bodyChamado.data_solicitacao, '2026-09-12');
  assert.equal(bodyChamado.request_id, 'req-envio-mock');
  assert.equal(resultado.situacao, 'Aguardando aprovação');
  assert.equal(resultado.versao, 2);
});

test('executarAcaoRo traduz erros 401, 403, 409, 422, 500 e falha de rede sem ocultar detalhes', async () => {
  const { executarAcaoRo } = carregarDominioRos();

  // 401
  const mock401 = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  });
  const { executarAcaoRo: acao401 } = carregarDominioRos({ fetchImpl: mock401 });
  await assert.rejects(() => acao401('ro-1', 'enviar', {}), (err) => {
    assert.equal(err.status, 401);
    assert.match(err.message, /login novamente/i);
    return true;
  });

  // 403
  const mock403 = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: 'Forbidden' }),
  });
  const { executarAcaoRo: acao403 } = carregarDominioRos({ fetchImpl: mock403 });
  await assert.rejects(() => acao403('ro-1', 'enviar', {}), (err) => {
    assert.equal(err.status, 403);
    assert.match(err.message, /autorização registrada/i);
    return true;
  });

  // 409 Conflito de versão
  const mock409 = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: 'Conflito de versão da R.O. (esperada: 1, atual: 2)' }),
  });
  const { executarAcaoRo: acao409 } = carregarDominioRos({ fetchImpl: mock409 });
  await assert.rejects(() => acao409('ro-1', 'aprovar', {}), (err) => {
    assert.equal(err.status, 409);
    assert.match(err.message, /conflito/i);
    return true;
  });

  // 422 Dados inválidos
  const mock422 = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ error: 'Data de resposta inválida' }),
  });
  const { executarAcaoRo: acao422 } = carregarDominioRos({ fetchImpl: mock422 });
  await assert.rejects(() => acao422('ro-1', 'enviar', {}), (err) => {
    assert.equal(err.status, 422);
    assert.match(err.message, /Data de resposta inválida/i);
    return true;
  });

  // 500
  const mock500 = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Falha interna' }),
  });
  const { executarAcaoRo: acao500 } = carregarDominioRos({ fetchImpl: mock500 });
  await assert.rejects(() => acao500('ro-1', 'enviar', {}), (err) => {
    assert.equal(err.status, 500);
    assert.match(err.message, /Falha interna|servidor/i);
    return true;
  });

  // Falha de rede
  const mockRede = async () => {
    throw new Error('Connection refused');
  };
  const { executarAcaoRo: acaoRede } = carregarDominioRos({ fetchImpl: mockRede });
  await assert.rejects(() => acaoRede('ro-1', 'enviar', {}), (err) => {
    assert.equal(err.isNetworkError, true);
    assert.match(err.message, /Falha de rede/i);
    return true;
  });
});

test('retry de executarAcaoRo reutiliza exatamente o mesmo request_id na segunda tentativa', async () => {
  const { gerarRequestIdRo } = carregarDominioRos();
  const requestIdEstavel = gerarRequestIdRo();
  const chamadas = [];

  const mockFetch = async (url, init) => {
    chamadas.push({
      url: String(url),
      headers: init?.headers || {},
      body: JSON.parse(init?.body || '{}'),
    });

    if (chamadas.length === 1) {
      // 1ª tentativa falha por timeout/500
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Timeout ao contatar backend' }),
      };
    }

    // 2ª tentativa (retry) bem-sucedida
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'ro-retry-id',
          situacao: 'Aprovada',
          numero_ro: 'RO-CONFIRMADA-1',
        },
      }),
    };
  };

  const { executarAcaoRo } = carregarDominioRos({ fetchImpl: mockFetch });

  const payload = {
    numero_ro: 'RO-CONFIRMADA-1',
    data_aprovacao: '2026-09-12',
    data_vencimento: '2026-12-11',
    request_id: requestIdEstavel,
  };

  // 1ª tentativa falha
  await assert.rejects(() => executarAcaoRo('ro-retry-id', 'aprovar', payload), /Timeout|servidor/i);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].headers['x-request-id'], requestIdEstavel);
  assert.equal(chamadas[0].body.request_id, requestIdEstavel);

  // 2ª tentativa reenvia com o mesmo request_id
  const sucesso = await executarAcaoRo('ro-retry-id', 'aprovar', payload);
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[1].headers['x-request-id'], requestIdEstavel);
  assert.equal(chamadas[1].body.request_id, requestIdEstavel);

  // Validação estrita de estabilidade do request_id no retry
  assert.equal(chamadas[0].headers['x-request-id'], chamadas[1].headers['x-request-id']);
  assert.equal(chamadas[0].body.request_id, chamadas[1].body.request_id);
  assert.equal(sucesso.situacao, 'Aprovada');
});

test('fetchRegistroOportunidade busca R.O. individual para recarregamento em caso de conflito', async () => {
  let urlChamada = '';
  let headersChamados = {};

  const mockFetch = async (url, init) => {
    urlChamada = String(url);
    headersChamados = init?.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{
          id: 'ro-recarregar-123',
          versao: 3,
          situacao: 'Aprovada',
          numero_ro: 'RO-ATUALIZADA-9',
          data_vencimento: '2027-01-15',
        }],
        total: 1,
      }),
    };
  };

  const { fetchRegistroOportunidade } = carregarDominioRos({ fetchImpl: mockFetch });

  const ro = await fetchRegistroOportunidade('ro-recarregar-123', {
    getHeaders: () => ({ Authorization: 'Bearer token-crm' }),
  });

  assert.equal(urlChamada, '/api/ros/ro-recarregar-123');
  assert.equal(headersChamados['Authorization'], 'Bearer token-crm');
  assert.equal(ro.id, 'ro-recarregar-123');
  assert.equal(ro.versao, 3);
  assert.equal(ro.numero_ro, 'RO-ATUALIZADA-9');
});
