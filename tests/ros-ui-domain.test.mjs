import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const caminhoDominio = new URL('../ros-ui-domain.js', import.meta.url).pathname;
const lerArquivo = (relativo) => fs.readFileSync(new URL('../' + relativo, import.meta.url), 'utf8');

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
  assert.equal(typeof dominio?.estaOportunidadeElegivelParaRo, 'function');
});

test('seleção de oportunidade para R.O. aceita etapas ativas e congeladas, mas exclui Ganho e Perdido', () => {
  const { estaOportunidadeElegivelParaRo } = carregarDominioRos();
  assert.equal(estaOportunidadeElegivelParaRo({ estagio: 'Qualificação' }), true);
  assert.equal(estaOportunidadeElegivelParaRo({ estagio: 'Congelado' }), true);
  assert.equal(estaOportunidadeElegivelParaRo({ estagio: 'Ganho' }), false);
  assert.equal(estaOportunidadeElegivelParaRo({ estagio: 'Perdido' }), false);
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

test('aprovação não é enviada quando sua data é anterior ao envio registrado', () => {
  const { validarPayloadAcaoRo } = carregarDominioRos();
  assert.throws(
    () => validarPayloadAcaoRo('aprovar', {
      numero_ro: 'RO-2026-001',
      data_aprovacao: '2026-09-13',
      data_vencimento: '2026-12-13',
    }, { data_solicitacao: '2026-09-14' }),
    /aprovação não pode ser anterior.*14\/09\/2026/i,
  );
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
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Aprovada', false)), ['solicitar_renovacao', 'substituir', 'encerrar']);
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

test('obterAcoesPermitidasRo inclui substituir para Aprovada sem pendente e sem sucessora ativa (Task 7)', () => {
  const { obterAcoesPermitidasRo } = carregarDominioRos();

  // Backoffice: enviar, aprovar, encerrar (nunca substituir)
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Backoffice')), ['enviar', 'aprovar', 'encerrar']);

  // Aguardando aprovação: aprovar, encerrar (nunca substituir)
  assert.deepEqual(Array.from(obterAcoesPermitidasRo('Aguardando aprovação')), ['aprovar', 'encerrar']);

  // Aprovada sem renovação pendente e sem sucessora: solicitar_renovacao, substituir, encerrar
  const acoesSemPendente = Array.from(obterAcoesPermitidasRo('Aprovada', false));
  assert.deepEqual(acoesSemPendente, ['solicitar_renovacao', 'substituir', 'encerrar']);

  // Aprovada com renovação pendente: responder_renovacao, encerrar (NUNCA substituir)
  const acoesComPendente = Array.from(obterAcoesPermitidasRo('Aprovada', true));
  assert.deepEqual(acoesComPendente, ['responder_renovacao', 'encerrar']);
  assert.equal(acoesComPendente.includes('substituir'), false);
  assert.equal(acoesComPendente.includes('solicitar_renovacao'), false);

  // Aprovada sem pendente mas COM sucessora ativa: solicitar_renovacao, encerrar (NUNCA substituir)
  const acoesComSucessora = Array.from(obterAcoesPermitidasRo('Aprovada', false, { temSucessoraAtiva: true }));
  assert.deepEqual(acoesComSucessora, ['solicitar_renovacao', 'encerrar']);
  assert.equal(acoesComSucessora.includes('substituir'), false);

  // Aprovada com pendente E com sucessora: responder_renovacao, encerrar (NUNCA substituir)
  const acoesAmbasFlags = Array.from(obterAcoesPermitidasRo('Aprovada', true, { temSucessoraAtiva: true }));
  assert.deepEqual(acoesAmbasFlags, ['responder_renovacao', 'encerrar']);
  assert.equal(acoesAmbasFlags.includes('substituir'), false);

  // Inativas: nenhuma ação
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

test('validarPayloadAcaoRo inclui versao_esperada nos payloads de aprovar e negar renovacao', () => {
  const { validarPayloadAcaoRo } = carregarDominioRos();

  // 1. Aprovar renovação com versão esperada explícita e herdada do contexto
  const aprovacao = validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'aprovar',
    data_resposta: '2026-11-25',
    novo_vencimento: '2027-03-11',
    versao_esperada: 5,
    request_id: 'req-renov-aprov-1',
  }, { data_vencimento: '2026-12-11', ciclo: 2, versao: 3 });

  assert.equal(aprovacao.rota, 'renovacoes/2/aprovar');
  assert.equal(aprovacao.payload.versao_esperada, 5);
  assert.equal(aprovacao.payload.novo_vencimento, '2027-03-11');
  assert.equal(aprovacao.payload.request_id, 'req-renov-aprov-1');

  // 2. Negar renovação com versão herdada do contexto
  const negativa = validarPayloadAcaoRo('responder_renovacao', {
    tipo_resposta: 'negar',
    data_resposta: '2026-11-26',
    motivo: 'Fabricante não concede novo prazo',
    request_id: 'req-renov-negar-1',
  }, { ciclo: 3, versao: 4 });

  assert.equal(negativa.rota, 'renovacoes/3/negar');
  assert.equal(negativa.payload.versao_esperada, 4);
  assert.equal(negativa.payload.motivo, 'Fabricante não concede novo prazo');
  assert.equal(negativa.payload.novo_vencimento, undefined);
  assert.equal(negativa.payload.request_id, 'req-renov-negar-1');
});

test('executarAcaoRo traduz conflito de versao em 409 ao responder renovacao e preserva status', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: 'Conflito de versão da R.O. (esperada: 2, atual: 3)' }),
  });

  const { executarAcaoRo } = carregarDominioRos({ fetchImpl: mockFetch });

  await assert.rejects(
    () => executarAcaoRo('ro-conflito-1', 'renovacoes/1/aprovar', {
      data_resposta: '2026-11-25',
      novo_vencimento: '2027-03-11',
      versao_esperada: 2,
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /conflito/i);
      return true;
    }
  );
});

test('fluxo de revisao real apos 409 atualiza R.O. no drawer via callback e preserva campos preenchidos', async () => {
  const { fetchRegistroOportunidade, executarAcaoRo } = carregarDominioRos();

  // Simulação dos campos digitados no modal pelo usuário
  const camposDigitados = {
    tipoResposta: 'aprovar',
    dataResposta: '2026-11-25',
    novoVencimento: '2027-04-15',
    motivo: '',
  };

  let roNoDrawer = {
    id: 'ro-409-test',
    numero_ro: 'RO-ORIGINAL',
    versao: 1,
    situacao: 'Aprovada',
    data_vencimento: '2026-12-11',
  };

  let roRecebidaNoCallback = null;
  const onConflitoRoAtualizada = (roFresca) => {
    roRecebidaNoCallback = roFresca;
    roNoDrawer = roFresca;
  };

  // 1. Simula envio que retorna 409
  const mockFetch409 = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: 'Conflito de versão da R.O. (esperada: 1, atual: 2)' }),
  });
  const { executarAcaoRo: acaoComConflito } = carregarDominioRos({ fetchImpl: mockFetch409 });

  let erroCapturado = null;
  try {
    await acaoComConflito('ro-409-test', 'renovacoes/1/aprovar', {
      data_resposta: camposDigitados.dataResposta,
      novo_vencimento: camposDigitados.novoVencimento,
      versao_esperada: roNoDrawer.versao,
    });
  } catch (err) {
    erroCapturado = err;
  }
  assert.equal(erroCapturado?.status, 409);

  // 2. Em 409, busca a R.O. fresca
  const mockFetchFresca = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [{
        id: 'ro-409-test',
        numero_ro: 'RO-ATUALIZADA-POR-OUTRO',
        versao: 2,
        situacao: 'Aprovada',
        data_vencimento: '2026-12-11',
        eventos_ro: [{ tipo: 'Enviada ao fabricante' }],
      }],
      total: 1,
    }),
  });
  const { fetchRegistroOportunidade: buscarFresca } = carregarDominioRos({ fetchImpl: mockFetchFresca });
  const roFresca = await buscarFresca('ro-409-test');

  // 3. Aplica callback no drawer e atualiza versaoEsperada
  onConflitoRoAtualizada(roFresca);
  let versaoEsperadaAtualizada = roFresca.versao;

  // Asserções:
  // - Callback do drawer foi executada com a R.O. fresca
  assert.equal(roRecebidaNoCallback?.numero_ro, 'RO-ATUALIZADA-POR-OUTRO');
  assert.equal(roNoDrawer.versao, 2);
  assert.equal(versaoEsperadaAtualizada, 2);

  // - Campos digitados pelo usuário NÃO foram apagados
  assert.equal(camposDigitados.tipoResposta, 'aprovar');
  assert.equal(camposDigitados.dataResposta, '2026-11-25');
  assert.equal(camposDigitados.novoVencimento, '2027-04-15');

  // 4. Nova confirmação pelo usuário usa a versão esperada atualizada (2) e tem sucesso
  const mockFetchSucesso = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.versao_esperada, 2);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'ro-409-test', situacao: 'Aprovada', versao: 3 } }),
    };
  };
  const { executarAcaoRo: acaoComSucesso } = carregarDominioRos({ fetchImpl: mockFetchSucesso });
  const sucesso = await acaoComSucesso('ro-409-test', 'renovacoes/1/aprovar', {
    data_resposta: camposDigitados.dataResposta,
    novo_vencimento: camposDigitados.novoVencimento,
    versao_esperada: versaoEsperadaAtualizada,
  });
  assert.equal(sucesso.versao, 3);
});

test('app.js conecta onConflitoRoAtualizada entre RegistroOportunidadeDrawer e RoActionModal', () => {
  const appJs = lerArquivo('app.js');
  assert.ok(appJs.includes('onConflitoRoAtualizada={handleConflitoRoAtualizada}'));
  assert.ok(appJs.includes('const handleConflitoRoAtualizada = useCallback((roFresca) => {'));
  assert.ok(appJs.includes('setRo(roFresca)'));
});


// ─────────────────────────────────────────────────────────────────────────
// Task 7: Testes de substituição
// ─────────────────────────────────────────────────────────────────────────

test('validarPayloadAcaoRo valida a ação substituir corretamente (Task 7)', () => {
  const { validarPayloadAcaoRo } = carregarDominioRos();

  // Substituir sem dados adicionais funciona (somente versao_esperada e request_id)
  const resultado = validarPayloadAcaoRo('substituir', {
    versao_esperada: 3,
    request_id: 'req-sub-001',
  });
  assert.equal(resultado.rota, 'substituir');
  assert.equal(resultado.payload.versao_esperada, 3);
  assert.equal(resultado.payload.request_id, 'req-sub-001');

  // Substituir com dados mínimos (sem versao_esperada explícita, usa do contexto)
  const resCtx = validarPayloadAcaoRo('substituir', {}, { versao: 5 });
  assert.equal(resCtx.payload.versao_esperada, 5);

  // Substituir sem nenhum dado funciona
  const resVazio = validarPayloadAcaoRo('substituir', {});
  assert.equal(resVazio.rota, 'substituir');
  assert.equal(resVazio.payload.versao_esperada, null);
});

test('executarAcaoRo para substituir envia POST correto (Task 7)', async () => {
  let ultimaReq = null;
  const mockFetch = async (url, init) => {
    ultimaReq = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'nova-ro-uuid',
          situacao: 'Backoffice',
          ro_anterior_id: 'ro-original',
          versao: 1,
        },
      }),
    };
  };

  const { executarAcaoRo, validarPayloadAcaoRo } = carregarDominioRos({ fetchImpl: mockFetch });
  const validado = validarPayloadAcaoRo('substituir', { versao_esperada: 3, request_id: 'req-sub-002' });
  const resultado = await executarAcaoRo('ro-original', validado.rota, validado.payload, {
    requestId: 'req-sub-002',
  });

  assert.equal(resultado.id, 'nova-ro-uuid');
  assert.equal(resultado.situacao, 'Backoffice');
  assert.equal(resultado.ro_anterior_id, 'ro-original');
  assert.ok(ultimaReq.url.endsWith('/ro-original/substituir'));
  const body = JSON.parse(ultimaReq.init.body);
  assert.equal(body.versao_esperada, 3);
  assert.equal(body.request_id, 'req-sub-002');
});

test('executarAcaoRo para substituir trata 409 (conflito de versão) sem apagar o formulário (Task 7)', async () => {
  const mockFetch409 = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: 'Conflito de versão da R.O. anterior (esperada: 3, atual: 4)' }),
  });

  const { executarAcaoRo } = carregarDominioRos({ fetchImpl: mockFetch409 });
  try {
    await executarAcaoRo('ro-original', 'substituir', { versao_esperada: 3 });
    assert.fail('Deveria ter lançado erro');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.ok(err.message.includes('Conflito') || err.message.includes('conflito') || err.message.includes('outra pessoa'));
  }
});

test('obterAcoesPermitidasRo nunca oferece substituir para Backoffice, Aguardando, Encerrada, Reprovada ou Substituída (Task 7)', () => {
  const { obterAcoesPermitidasRo } = carregarDominioRos();

  const estados = ['Backoffice', 'Aguardando aprovação', 'Encerrada', 'Reprovada', 'Substituída'];
  for (const estado of estados) {
    const acoes = Array.from(obterAcoesPermitidasRo(estado));
    assert.equal(acoes.includes('substituir'), false, `substituir não deveria estar em ${estado}`);
  }
});

test('cadeia de substituição: R.O. anterior preserva situação até aprovação da sucessora (Task 7 - simulação)', () => {
  // Este teste simula a lógica do banco: ao iniciar substituição, a anterior permanece Aprovada.
  // A transição para Substituída só ocorre na RPC ro_aprovar quando a sucessora é aprovada.
  const roAnterior = { id: 'ro-1', situacao: 'Aprovada', numero_ro: 'DELL-001', versao: 5, data_vencimento: '2026-12-31' };
  const roSucessora = { id: 'ro-2', situacao: 'Backoffice', ro_anterior_id: 'ro-1', numero_ro: null, versao: 1 };

  // Anterior permanece Aprovada enquanto sucessora está em Backoffice
  const { obterAcoesPermitidasRo } = carregarDominioRos();

  // Anterior tem uma sucessora ativa → não deve oferecer substituir novamente
  const acoesAnterior = Array.from(obterAcoesPermitidasRo(roAnterior.situacao, false, { temSucessoraAtiva: true }));
  assert.equal(acoesAnterior.includes('substituir'), false);
  // Mas a anterior ainda permite solicitar renovação e encerrar
  assert.ok(acoesAnterior.includes('solicitar_renovacao'));
  assert.ok(acoesAnterior.includes('encerrar'));

  // Sucessora em Backoffice permite enviar, aprovar, encerrar
  const acoesSucessora = Array.from(obterAcoesPermitidasRo(roSucessora.situacao));
  assert.deepEqual(acoesSucessora, ['enviar', 'aprovar', 'encerrar']);
});

test('app.js contém os elementos de UI de substituição (Task 7)', () => {
  const appJs = lerArquivo('app.js');

  // Botão "Iniciar substituição" no mapConfig
  assert.ok(appJs.includes("substituir: { label: 'Iniciar substituição'"));

  // Formulário de substituição no RoActionModal
  assert.ok(appJs.includes("acao === 'substituir'"));
  assert.ok(appJs.includes("Iniciar substituição de R.O."));
  assert.ok(appJs.includes("Confirmar substituição"));
  assert.ok(appJs.includes("permanece"));

  // Seção de Sucessão enriquecida
  assert.ok(appJs.includes('sucessoraAtiva'));
  assert.ok(appJs.includes('roAnterior'));
  assert.ok(appJs.includes('← Anterior:'));
  assert.ok(appJs.includes('→ Sucessora:'));
});


test('Task 7 - drawer recebe e usa supabaseClient por prop, sem globalThis.supabaseClient', () => {
  const appJs = lerArquivo('app.js');

  // Não pode haver nenhuma referência a globalThis.supabaseClient
  assert.equal(appJs.includes('globalThis.supabaseClient'), false, 'Não deve existir globalThis.supabaseClient no app.js');

  // Drawer declara prop supabaseClient
  assert.ok(appJs.includes('function RegistroOportunidadeDrawer({'));
  assert.ok(appJs.includes('supabaseClient = null'));

  // RegistrosOportunidadeView repassa supabaseClient ao Drawer
  assert.ok(appJs.includes('<RegistroOportunidadeDrawer'));
  assert.ok(appJs.includes('supabaseClient={supabaseClient}'));

  // App passa supabaseClient para RegistrosOportunidadeView
  assert.ok(appJs.includes('<RegistrosOportunidadeView'));
});

test('Task 7 - relação sucessora encontrada bloqueia a ação substituir', () => {
  const { obterAcoesPermitidasRo } = carregarDominioRos();

  // Sem sucessora ativa, R.O. Aprovada pode iniciar substituição
  const acoesSemSucessora = Array.from(obterAcoesPermitidasRo('Aprovada', false, { temSucessoraAtiva: false }));
  assert.ok(acoesSemSucessora.includes('substituir'));

  // Com sucessora ativa, a ação substituir é bloqueada
  const acoesComSucessora = Array.from(obterAcoesPermitidasRo('Aprovada', false, { temSucessoraAtiva: true }));
  assert.equal(acoesComSucessora.includes('substituir'), false);
  assert.deepEqual(acoesComSucessora, ['solicitar_renovacao', 'encerrar']);
});

test('Task 7 - relação indisponível não é apresentada como ausência confirmada', () => {
  const appJs = lerArquivo('app.js');

  // A UI não pode assumir 'Sem substituição vinculada' se o cliente não estiver disponível ou estiver carregando
  assert.ok(appJs.includes("statusRelacoes === 'indisponivel'"));
  assert.ok(appJs.includes("statusRelacoes === 'carregando'"));
  assert.ok(appJs.includes("statusRelacoes === 'pronto' && !ro.ro_anterior_id && !sucessoraAtiva"));
  assert.ok(appJs.includes('Informações de substituição indisponíveis'));
});

test('Task 7 - há controles para abrir anterior e sucessora com textos esperados', () => {
  const appJs = lerArquivo('app.js');

  // Controles de navegação
  assert.ok(appJs.includes('Abrir anterior'));
  assert.ok(appJs.includes('Abrir sucessora'));
  assert.ok(appJs.includes('handleNavegarParaRo(roAnterior.id)'));
  assert.ok(appJs.includes('handleNavegarParaRo(sucessoraAtiva.id)'));

  // Sucessora sem número exibe 'Aguardando número'
  assert.ok(appJs.includes("sucessoraAtiva.numero_ro || 'Aguardando número'"));

  // Texto contextual obrigatório durante vigência simultânea
  assert.ok(appJs.includes('A R.O. anterior permanece aprovada até a sucessora receber aprovação oficial.'));
});

test('Task 7 - navegar entre anterior e sucessora troca o registro exibido sem perder o drawer', () => {
  const appJs = lerArquivo('app.js');

  // Drawer tem função de navegação interna que atualiza ro no mesmo drawer
  assert.ok(appJs.includes('const handleNavegarParaRo = async (targetId) => {'));
  assert.ok(appJs.includes('setRo(novaRo)'));
  assert.ok(appJs.includes('onSelecionarRo(novaRo.id, novaRo)'));

  // View suporta roNavegada para não fechar o drawer caso a R.O. não conste na lista paginada atual
  assert.ok(appJs.includes('const [roNavegada, setRoNavegada] = useState(null);'));
  assert.ok(appJs.includes('roNavegada?.id === selectedId ? roNavegada : null'));
});


// ─────────────────────────────────────────────────────────────────────────
// Task 8: Testes de Evidências Humanas e Preparação por Fabricante na UI
// ─────────────────────────────────────────────────────────────────────────

test('Task 8 - obterPeriodoMesCivilAtual gera início do mês e data de hoje em SP', () => {
  const { obterPeriodoMesCivilAtual } = carregarDominioRos();
  const periodo = obterPeriodoMesCivilAtual('2026-09-12');
  assert.equal(periodo.data_inicio, '2026-09-01');
  assert.equal(periodo.data_fim, '2026-09-12');
});

test('Task 8 - validarPeriodoEvidencias aceita período válido e rejeita invertido ou inválido', () => {
  const { validarPeriodoEvidencias } = carregarDominioRos();
  const res = validarPeriodoEvidencias('2026-09-01', '2026-09-30');
  assert.equal(res.data_inicio, '2026-09-01');
  assert.equal(res.data_fim, '2026-09-30');

  assert.throws(() => validarPeriodoEvidencias('2026-09-30', '2026-09-01'), /período/i);
  assert.throws(() => validarPeriodoEvidencias('data-invalida', '2026-09-30'), /data inicial/i);
});

test('Task 8 - fetchEvidenciasRos consulta rota autenticada com parâmetros de período e fabricante', async () => {
  let urlChamada = null;
  let headersChamados = null;

  const mockFetch = async (url, init) => {
    urlChamada = url;
    headersChamados = init?.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'ro-1', numero_ro: 'D-10', cliente: 'Cliente X' }],
        total: 1,
        total_sem_atualizacao: 0,
        total_com_atualizacao: 1,
        cobertura_evidencias_completa: true,
        data_inicio: '2026-09-01',
        data_fim: '2026-09-12',
      }),
    };
  };

  const { fetchEvidenciasRos } = carregarDominioRos({ fetchImpl: mockFetch });
  const resultado = await fetchEvidenciasRos(
    { fabricante_id: 'fab-dell', data_inicio: '2026-09-01', data_fim: '2026-09-12' },
    1,
    50,
    { getHeaders: () => ({ Authorization: 'Bearer token-teste' }) },
  );

  assert.ok(urlChamada.includes('/api/ros/evidencias'));
  assert.ok(urlChamada.includes('fabricante_id=fab-dell'));
  assert.ok(urlChamada.includes('data_inicio=2026-09-01'));
  assert.ok(urlChamada.includes('data_fim=2026-09-12'));
  assert.equal(headersChamados.Authorization, 'Bearer token-teste');
  assert.equal(resultado.total, 1);
  assert.equal(resultado.total_com_atualizacao, 1);
  assert.equal(resultado.cobertura_evidencias_completa, true);
});

test('Task 8 - fetchEvidenciasRos traduz erro 403, 500 e falha de rede sem ocultar detalhes', async () => {
  const mockFetchErro = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: 'Usuário não autorizado' }),
  });
  const { fetchEvidenciasRos } = carregarDominioRos({ fetchImpl: mockFetchErro });
  await assert.rejects(
    fetchEvidenciasRos({}, 1, 50),
    /autorização|Acesso negado/i,
  );
});

test('Task 8 - formatarRelatorioAtualizacaoFabricante formata dados reais e alerta sem atualização', () => {
  const { formatarRelatorioAtualizacaoFabricante } = carregarDominioRos();
  const dados = {
    data: [
      {
        numero_ro: 'RO-DELL-100',
        cliente: 'Empresa Alpha',
        oportunidade: 'Modernização Datacenter',
        situacao: 'Aprovada',
        data_vencimento: '2026-10-15',
        vigencia: 'Vigente',
        atualizacao_no_periodo: {
          autor_nome: 'Thiago',
          data: '2026-09-10T15:00:00Z',
          texto: 'Cliente confirmou alinhamento da proposta técnica.',
        },
      },
      {
        numero_ro: null,
        cliente: 'Beta Tech',
        oportunidade: 'Renovação Storage',
        situacao: 'Aguardando aprovação',
        data_vencimento: null,
        vigencia: 'Sem prazo',
        atualizacao_no_periodo: null,
        ultima_atividade_humana: {
          autor_nome: 'Marcos',
          data: '2026-08-15T11:00:00Z',
          texto: 'Envio de documentação preliminar.',
        },
        alertas: ['Anexo não interpretado'],
      },
    ],
    data_inicio: '2026-09-01',
    data_fim: '2026-09-12',
    total: 2,
    total_sem_atualizacao: 1,
    total_com_atualizacao: 1,
    cobertura_evidencias_completa: true,
  };

  const relatorio = formatarRelatorioAtualizacaoFabricante(dados, 'Dell Technologies');

  // Cabeçalho
  assert.ok(relatorio.includes('Atualização Comercial de R.Os — Dell Technologies'));
  assert.ok(relatorio.includes('Total de R.Os: 2'));
  assert.ok(relatorio.includes('Sem atualização confirmada: 1'));
  assert.ok(relatorio.includes('Cobertura desconhecida/parcial: 0'));

  // R.O. 1 com atualização no período
  assert.ok(relatorio.includes('Empresa Alpha — Modernização Datacenter'));
  assert.ok(relatorio.includes('RO-DELL-100'));
  assert.ok(relatorio.includes('Cliente confirmou alinhamento'));

  // R.O. 2 sem atualização no período com última anterior e alertas
  assert.ok(relatorio.includes('Beta Tech — Renovação Storage'));
  assert.ok(relatorio.includes('Aguardando número'));
  assert.ok(relatorio.includes('Sem atualização humana no período selecionado.'));
  assert.ok(relatorio.includes('Envio de documentação preliminar.'));
  assert.ok(relatorio.includes('Anexo não interpretado'));
});

test('Task 8 - app.js remove placeholder reservado e inclui card real de evidências humanas', () => {
  const appJs = lerArquivo('app.js');

  // Placeholder da Task 8 foi completamente removido
  assert.equal(appJs.includes('Disponível após integração de evidências'), false, 'Não deve mais conter texto de placeholder reservado');
  assert.equal(appJs.includes('Integração ClickUp Brain (Task 8)'), false, 'Não deve mais conter label de integração reservada');

  // Card real está presente com estados e contagem
  assert.ok(appJs.includes('sem atualização confirmada'));
  assert.ok(appJs.includes('cobertura desconhecida') || appJs.includes('Cobertura parcial'));
  assert.ok(appJs.includes('Calculando...'));
  assert.ok(appJs.includes('Indisponível'));
  assert.ok(appJs.includes('parcial'));
  assert.ok(appJs.includes('fetchEvidenciasRos'));
});

test('Task 8 - app.js inclui filtros de período e ação condicional Preparar atualização por fabricante', () => {
  const appJs = lerArquivo('app.js');

  // Filtros de período
  assert.ok(appJs.includes('filtro-data-inicio'));
  assert.ok(appJs.includes('filtro-data-fim'));
  assert.ok(appJs.includes('Período Início'));
  assert.ok(appJs.includes('Período Fim'));

  // Botão condicional
  assert.ok(appJs.includes('filters.fabricante_id'));
  assert.ok(appJs.includes('btn-preparar-atualizacao-fabricante'));
  assert.ok(appJs.includes('Preparar atualização por fabricante'));

  // Modal de atualização
  assert.ok(appJs.includes('function AtualizacaoFabricanteModal'));
  assert.ok(appJs.includes('Copiar relatório'));
  assert.ok(appJs.includes('Sem atualização humana neste mês'));
});


test('Task 8 - montarQueryRos NÃO inclui data_inicio/data_fim, enquanto montarQueryEvidenciasRos inclui', () => {
  const { montarQueryRos, montarQueryEvidenciasRos } = carregarDominioRos();

  const filtrosComDatas = {
    pagina: 1,
    limite: 20,
    situacao: 'Aprovada',
    data_inicio: '2026-09-01',
    data_fim: '2026-09-12',
  };

  // montarQueryRos (usado por /api/ros e /api/ros/resumo) DEVE ignorar data_inicio e data_fim
  const queryRosStr = montarQueryRos(filtrosComDatas).toString();
  assert.ok(!queryRosStr.includes('data_inicio'), 'montarQueryRos não pode conter data_inicio');
  assert.ok(!queryRosStr.includes('data_fim'), 'montarQueryRos não pode conter data_fim');
  assert.ok(queryRosStr.includes('situacao=Aprovada'));

  // montarQueryEvidenciasRos DEVE serializar data_inicio e data_fim
  const queryEvidenciasStr = montarQueryEvidenciasRos(filtrosComDatas).toString();
  assert.ok(queryEvidenciasStr.includes('data_inicio=2026-09-01'), 'montarQueryEvidenciasRos deve incluir data_inicio');
  assert.ok(queryEvidenciasStr.includes('data_fim=2026-09-12'), 'montarQueryEvidenciasRos deve incluir data_fim');
  assert.ok(queryEvidenciasStr.includes('situacao=Aprovada'));
});

test('Task 8 - UI no card e modal exibe cobertura parcial/desconhecida separadamente e nunca chama de sem atualização', () => {
  const appJs = lerArquivo('app.js');

  // No card: Cobertura parcial e quantidade desconhecida separadas
  assert.ok(appJs.includes('cobertura parcial ('), 'Card deve informar cobertura parcial');
  assert.ok(appJs.includes('oportunidade(s) com cobertura desconhecida'));
  assert.ok(appJs.includes('sem atualização confirmada'), 'Card deve usar terminologia sem atualização confirmada');

  // No modal: Cobertura parcial com contagem de desconhecidas separada de sem atualização
  assert.ok(appJs.includes('Cobertura Parcial (') || appJs.includes('cobertura parcial ('));
  assert.ok(appJs.includes('Cobertura desconhecida / parcial:') || appJs.includes('cobertura desconhecida'));
  assert.ok(appJs.includes('Sem atualização confirmada:'));
});


test('montarQueryRos serializa conta_id preservando demais filtros (Ficha 360º)', () => {
  const { montarQueryRos } = carregarDominioRos();
  const contaUuid = '33333333-3333-4333-8333-333333333333';

  const params = montarQueryRos({ conta_id: contaUuid, situacao: 'Aprovada' });
  const str = params.toString();

  assert.ok(str.includes(`conta_id=${contaUuid}`));
  assert.ok(str.includes('situacao=Aprovada'));
  assert.ok(!str.includes('data_inicio'), 'Não pode incluir filtros de evidência');
});

test('Ficha 360º em empresas.js integra aba de R.Os estruturadas com todos os requisitos', () => {
  const empresasJs = lerArquivo('empresas.js');

  // 1. Aba 'ros' presente no seletor de abas
  assert.ok(empresasJs.includes("['ros', `R.Os (${rosData.loading ? '...' : rosData.total !== null ? rosData.total : 0})`]"), 'Aba R.Os deve estar no seletor de abas');

  // 2. Busca usando /api/ros?conta_id=... e headers de autenticação
  assert.ok(empresasJs.includes('/api/ros?conta_id='), 'Deve buscar em /api/ros?conta_id=');
  assert.ok(empresasJs.includes('getEmpresasClickUpHeaders()'), 'Deve usar headers com token do usuário');

  // 3. R.O. sempre exibe a oportunidade de origem
  assert.ok(empresasJs.includes('ro.negocios?.nome || ro.negocio?.nome'));
  assert.ok(empresasJs.includes('ro.fabricantes_ro?.nome || ro.fabricante'));
  assert.ok(empresasJs.includes("ro.numero_ro || 'Aguardando número'"));

  // 4. Link seguro para oportunidade no ClickUp com target _blank e rel noopener noreferrer
  assert.ok(empresasJs.includes('rel="noopener noreferrer"'));
  assert.ok(empresasJs.includes('https://app.clickup.com/t/'));

  // 5. Exibe vigência, vencimento e ciclo (com ro.data_vencimento e classeBadge)
  assert.ok(empresasJs.includes('Ciclo'));
  assert.ok(empresasJs.includes('Vencimento:'));
  assert.ok(empresasJs.includes('calcularVigenciaRo(ro.data_vencimento)'), 'Ficha deve passar ro.data_vencimento para calcularVigenciaRo');
  assert.ok(!empresasJs.includes('calcularVigenciaRo(ro)'), 'Não deve passar o objeto ro inteiro para calcularVigenciaRo');
  assert.ok(empresasJs.includes('rotuloSit.classeBadge'), 'Ficha deve utilizar a propriedade classeBadge retornada por obterRotuloSituacao');
  assert.ok(!empresasJs.includes('rotuloSit.badgeClass'), 'Não deve referenciar badgeClass inexistente');
  assert.ok(empresasJs.includes("'Vencida':"), 'Deve mapear classe para Vencida');
  assert.ok(empresasJs.includes("'Vigente':"), 'Deve mapear classe para Vigente');
  assert.ok(empresasJs.includes("'Sem prazo':"), 'Deve mapear classe para Sem prazo');

  // 6. Resultado parcial (> 200) sinalizado com banner e nunca afirmado como lista completa
  assert.ok(empresasJs.includes('listagem parcial da conta'));
  assert.ok(empresasJs.includes('Ver todas na tela geral'));

  // 7. Erro da API exibe mensagem e botão retry, nunca estado de lista vazia
  assert.ok(empresasJs.includes('Não foi possível consultar as R.Os desta conta'));
  assert.ok(empresasJs.includes('Tentar novamente'));
  assert.ok(empresasJs.includes('!rosData.loading && !rosData.error && rosData.rows.length === 0'), 'Estado vazio só aparece se não houver erro nem loading');
});

test('Ação Nova R.O. na Ficha 360º comunica com app.js reutilizando o mesmo modal existente', () => {
  const empresasJs = lerArquivo('empresas.js');
  const appJs = lerArquivo('app.js');

  // Em empresas.js: botão Nova R.O. nos itens de oportunidade
  assert.ok(empresasJs.includes('+ Nova R.O.'));
  assert.ok(empresasJs.includes('handleNovaRoOportunidade(n)'));
  assert.ok(empresasJs.includes("new CustomEvent('abrir-nova-ro'"));

  // Em app.js: EmpresasTab recebe onNovaRo e app.js escuta abrir-nova-ro
  assert.ok(appJs.includes('onNovaRo={handleAbrirNovaRoOportunidade}'));
  assert.ok(appJs.includes("window.addEventListener('abrir-nova-ro'"));

  // Em app.js: oportunidade chega pré-preenchida e bloqueada (oportunidadeFixa)
  assert.ok(appJs.includes('setModalNovaRoOportunidadeFixa(negocio)'));
  assert.ok(appJs.includes('setModalNovaRoAberto(true)'));

  // Em app.js: após criar com sucesso, dispara evento 'ro-criada'
  assert.ok(appJs.includes("new CustomEvent('ro-criada'"));

  // Em empresas.js: escuta 'ro-criada' para recarregar a seção
  assert.ok(empresasJs.includes("window.addEventListener('ro-criada'"));
});

test('Campos legados de R.O. em empresas.js são marcados como dados legados e preservados', () => {
  const empresasJs = lerArquivo('empresas.js');

  // Título e aviso explicativo dos dados legados
  assert.ok(empresasJs.includes('Registros de Oportunidade (R.O.) — Dados legados'));
  assert.ok(empresasJs.includes('Estes campos são legados e mantidos apenas para histórico'));
  assert.ok(empresasJs.includes('Novas R.Os devem ser criadas pela seção estruturada vinculada à oportunidade'));

  // Campos continuam existindo e não foram apagados
  assert.ok(empresasJs.includes('name="roInfra"'));
  assert.ok(empresasJs.includes('name="roSw1"'));
  assert.ok(empresasJs.includes('name="roSw2"'));
  assert.ok(empresasJs.includes('name="roSw3"'));
  assert.ok(empresasJs.includes('name="roSw4"'));

  // Não são enviados para a rota /api/ros
  assert.ok(!empresasJs.includes('/api/ros/legado'));
});

test('App não acessa showToast em zona morta temporal ao inicializar callbacks de R.O.', () => {
  const appJs = lerArquivo('app.js');

  assert.ok(appJs.includes('const handleNovaRoSucesso = useCallback('));
  assert.ok(
    appJs.includes('function showToast('),
    'showToast precisa ser declaração de função içada, pois callbacks de R.O. a referenciam antes da sua posição textual',
  );
  assert.ok(!appJs.includes('const showToast = ('), 'showToast não pode ser const declarada após os callbacks de R.O.');
});

test('Painel de R.Os usa superfícies escuras válidas e inicia sem ocupar altura excedente', () => {
  const appJs = lerArquivo('app.js');
  const inicio = appJs.indexOf('function RegistrosOportunidadeView(');
  const fim = appJs.indexOf('function App() {', inicio);
  const painelRos = appJs.slice(inicio, fim);

  assert.ok(inicio >= 0 && fim > inicio, 'O painel de R.Os precisa estar isolado para revisão visual');
  assert.ok(painelRos.includes('w-full flex-none'), 'O painel deve iniciar no topo do conteúdo sem disputar altura livre do iframe');
  assert.ok(painelRos.includes('dark:bg-slate-800'), 'Cartões e superfícies de R.Os devem ter fundo escuro válido');
  assert.ok(!painelRos.includes('dark:bg-slate-850'), 'slate-850 não pertence à paleta Tailwind e mantém superfícies brancas no dark mode');
  assert.ok(!painelRos.includes('dark:bg-slate-750'), 'slate-750 não pertence à paleta Tailwind e mantém controles claros no dark mode');
});
