import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const caminhoDominio = path.resolve('ros-ui-domain.js');

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
