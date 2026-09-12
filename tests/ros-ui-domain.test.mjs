import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montarQueryRos,
  traduzirErroApiRos,
  calcularIndicadoresRos,
  calcularVigenciaRo,
} from '../supabase/functions/api-ros/ui-domain.ts';

test('montarQueryRos serializa paginação e filtros omitindo campos vazios', () => {
  const queryPadrao = montarQueryRos({}, 1, 50);
  assert.equal(queryPadrao.get('pagina'), '1');
  assert.equal(queryPadrao.get('limite'), '50');
  assert.equal(queryPadrao.has('fabricante_id'), false);
  assert.equal(queryPadrao.has('situacao'), false);

  const queryCompleta = montarQueryRos({
    negocio_id: '11111111-1111-4111-8111-111111111111',
    fabricante_id: '22222222-2222-4222-8222-222222222222',
    situacao: 'Aprovada',
    responsavel: '90848927',
    vence_ate: '2026-12-31',
    filtro_vazio: '',
    filtro_nulo: null,
    filtro_undefined: undefined,
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
  assert.match(traduzirErroApiRos(401, null), /sessão expirada|não autenticada/i);
  assert.match(traduzirErroApiRos(403, null), /acesso negado|não cadastrado/i);
  assert.equal(
    traduzirErroApiRos(409, { error: 'Conflito de versão: R.O. alterada por outro usuário.' }),
    'Conflito de versão: R.O. alterada por outro usuário.',
  );
  assert.equal(
    traduzirErroApiRos(422, { error: 'Versão esperada deve ser um número inteiro positivo.' }),
    'Versão esperada deve ser um número inteiro positivo.',
  );
  assert.match(traduzirErroApiRos(500, null), /erro de comunicação|inesperado/i);
  assert.equal(traduzirErroApiRos(503, null, 'Serviço temporariamente indisponível.'), 'Serviço temporariamente indisponível.');
});

test('calcularVigenciaRo classifica prazos no padrão civil sem inventar data', () => {
  const hoje = '2026-09-12';
  assert.equal(calcularVigenciaRo(null, hoje), 'Sem prazo');
  assert.equal(calcularVigenciaRo(undefined, hoje), 'Sem prazo');
  assert.equal(calcularVigenciaRo('', hoje), 'Sem prazo');

  assert.equal(calcularVigenciaRo('2026-09-10', hoje), 'Vencida');
  assert.equal(calcularVigenciaRo('2026-09-12', hoje), 'Vence hoje');
  assert.equal(calcularVigenciaRo('2026-09-20', hoje), 'A vencer');
  assert.equal(calcularVigenciaRo('2026-09-27', hoje), 'A vencer'); // 15 dias
  assert.equal(calcularVigenciaRo('2026-10-30', hoje), 'Vigente');
});

test('calcularIndicadoresRos totaliza indicadores sobre o conjunto de registros', () => {
  const hoje = '2026-09-12';
  const lista = [
    { id: '1', situacao: 'Aguardando aprovação', data_vencimento: null, renovacoes_ro: [] },
    { id: '2', situacao: 'Backoffice', data_vencimento: null, renovacoes_ro: [] },
    {
      id: '3',
      situacao: 'Aprovada',
      data_vencimento: '2026-09-20',
      renovacoes_ro: [{ ciclo: 1, situacao: 'Em análise' }],
    },
    { id: '4', situacao: 'Aprovada', data_vencimento: '2026-09-01', renovacoes_ro: [] },
    { id: '5', situacao: 'Aprovada', data_vencimento: null, renovacoes_ro: [] },
    { id: '6', situacao: 'Aprovada', data_vencimento: '2026-11-15', renovacoes_ro: [] },
  ];

  const ind = calcularIndicadoresRos(lista, hoje);
  assert.equal(ind.total, 6);
  assert.equal(ind.aguardandoAprovacao, 1);
  assert.equal(ind.backoffice, 1);
  assert.equal(ind.renovacoesEmAnalise, 1);
  assert.equal(ind.vencem15Dias, 1);
  assert.equal(ind.vencidas, 1);
  assert.equal(ind.semPrazo, 1);
});

test('fetchRegistrosOportunidade envia Authorization, monta query e processa resposta com sucesso', async () => {
  const { fetchRegistrosOportunidade } = await import('../supabase/functions/api-ros/ui-domain.ts');

  let urlChamada = '';
  let headersChamados = {};

  const mockFetch = async (url, init) => {
    urlChamada = String(url);
    headersChamados = init?.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'ro-1', titulo: 'Dell HCI' }],
        total: 1,
        pagina: 1,
        limite: 50,
      }),
    };
  };

  const resultado = await fetchRegistrosOportunidade(
    { situacao: 'Aprovada' },
    1,
    50,
    {
      fetchImpl: mockFetch,
      getHeaders: () => ({ Authorization: 'Bearer token-clickup-123' }),
    }
  );

  assert.match(urlChamada, /\/api\/ros\?.*situacao=Aprovada/);
  assert.match(urlChamada, /pagina=1/);
  assert.match(urlChamada, /limite=50/);
  assert.equal(headersChamados.Authorization, 'Bearer token-clickup-123');
  assert.equal(resultado.total, 1);
  assert.equal(resultado.data[0].id, 'ro-1');
});

test('fetchRegistrosOportunidade traduz resposta não OK e falha de rede', async () => {
  const { fetchRegistrosOportunidade } = await import('../supabase/functions/api-ros/ui-domain.ts');

  const mockFetch401 = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  });

  await assert.rejects(
    () => fetchRegistrosOportunidade({}, 1, 50, { fetchImpl: mockFetch401 }),
    /sessão expirada|não autenticada/i
  );

  const mockFetchNetworkError = async () => {
    throw new Error('Failed to fetch');
  };

  await assert.rejects(
    () => fetchRegistrosOportunidade({}, 1, 50, { fetchImpl: mockFetchNetworkError }),
    /falha de rede|comunicação|Failed to fetch/i
  );
});

test('fetchRegistrosOportunidade traduz status 403, 409, 422 e 500', async () => {
  const { fetchRegistrosOportunidade } = await import('../supabase/functions/api-ros/ui-domain.ts');

  const criarMock = (status, body) => async () => ({
    ok: false,
    status,
    json: async () => body,
  });

  await assert.rejects(
    () => fetchRegistrosOportunidade({}, 1, 50, { fetchImpl: criarMock(403, {}) }),
    /acesso negado/i
  );

  await assert.rejects(
    () => fetchRegistrosOportunidade({}, 1, 50, {
      fetchImpl: criarMock(409, { error: 'Conflito de versão ao atualizar R.O.' })
    }),
    /conflito de versão/i
  );

  await assert.rejects(
    () => fetchRegistrosOportunidade({}, 1, 50, {
      fetchImpl: criarMock(422, { error: 'Entidade improcessável' })
    }),
    /entidade improcessável/i
  );

  await assert.rejects(
    () => fetchRegistrosOportunidade({}, 1, 50, { fetchImpl: criarMock(500, {}) }),
    /erro inesperado na comunicação/i
  );
});

test('descarte de resposta obsoleta garante que apenas a requisição mais recente atualiza o estado', async () => {
  const { fetchRegistrosOportunidade, ehRespostaMaisRecente } = await import(
    '../supabase/functions/api-ros/ui-domain.ts'
  );

  let sequence = 0;
  let estadoAplicado = null;

  // Mock com delay configurável
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const mockFetchLento = async () => {
    await delay(30);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'ro-antiga' }], total: 1 }),
    };
  };

  const mockFetchRapido = async () => {
    await delay(5);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'ro-nova' }], total: 1 }),
    };
  };

  // Dispara req 1 (lenta)
  const id1 = ++sequence;
  const p1 = fetchRegistrosOportunidade({}, 1, 50, { fetchImpl: mockFetchLento }).then((res) => {
    if (ehRespostaMaisRecente(id1, sequence)) {
      estadoAplicado = res.data[0].id;
    }
  });

  // Dispara req 2 logo em seguida (rápida)
  const id2 = ++sequence;
  const p2 = fetchRegistrosOportunidade({}, 1, 50, { fetchImpl: mockFetchRapido }).then((res) => {
    if (ehRespostaMaisRecente(id2, sequence)) {
      estadoAplicado = res.data[0].id;
    }
  });

  await Promise.all([p1, p2]);

  // Mesmo que a req 1 tenha terminado depois da req 2, apenas a req 2 deve ter sido aplicada!
  assert.equal(estadoAplicado, 'ro-nova');
  assert.equal(ehRespostaMaisRecente(id1, sequence), false);
  assert.equal(ehRespostaMaisRecente(id2, sequence), true);
});

