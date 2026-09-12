// Funções puras de domínio de interface para R.Os

export type FiltrosRos = {
  negocio_id?: string | null;
  fabricante_id?: string | null;
  situacao?: string | null;
  responsavel?: string | null;
  vence_ate?: string | null;
  [key: string]: unknown;
};

export function montarQueryRos(filters: FiltrosRos = {}, page = 1, limit = 50): URLSearchParams {
  const params = new URLSearchParams();
  params.set('pagina', String(Math.max(1, Number(page) || 1)));
  params.set('limite', String(Math.max(1, Math.min(200, Number(limit) || 50))));

  const chavesPermitidas = ['negocio_id', 'fabricante_id', 'situacao', 'responsavel', 'vence_ate'];
  for (const chave of chavesPermitidas) {
    const valor = filters[chave];
    if (valor !== undefined && valor !== null) {
      const str = String(valor).trim();
      if (str) {
        params.set(chave, str);
      }
    }
  }

  return params;
}

export function traduzirErroApiRos(
  status: number,
  responseData?: { error?: string } | null,
  fallback?: string
): string {
  if (status === 401) {
    return 'Sessão expirada ou não autenticada. Faça login novamente no CRM.';
  }
  if (status === 403) {
    return 'Acesso negado: seu usuário não possui autorização registrada no CRM.';
  }
  if (status === 409) {
    return (
      responseData?.error ||
      'Conflito de versão ou duplicidade: o registro foi alterado por outro usuário.'
    );
  }
  if (status === 422) {
    return responseData?.error || 'Dados da solicitação inválidos para esta operação de R.O.';
  }
  if (status === 500) {
    return (
      responseData?.error ||
      'Erro inesperado na comunicação com o servidor ao consultar R.Os.'
    );
  }
  if (responseData?.error && typeof responseData.error === 'string') {
    return responseData.error;
  }
  if (fallback && typeof fallback === 'string') {
    return fallback;
  }
  return 'Erro inesperado na comunicação com o servidor ao consultar R.Os.';
}

export type TipoVigencia = 'Sem prazo' | 'Vencida' | 'Vence hoje' | 'A vencer' | 'Vigente';

export function calcularVigenciaRo(
  dataVencimento: string | null | undefined,
  hojeStr: string = new Date().toISOString().slice(0, 10)
): TipoVigencia {
  if (!dataVencimento || typeof dataVencimento !== 'string' || !dataVencimento.trim()) {
    return 'Sem prazo';
  }

  const vencimento = dataVencimento.trim();
  if (vencimento < hojeStr) {
    return 'Vencida';
  }
  if (vencimento === hojeStr) {
    return 'Vence hoje';
  }

  const msPorDia = 1000 * 60 * 60 * 24;
  const tVenc = Date.parse(`${vencimento}T00:00:00Z`);
  const tHoje = Date.parse(`${hojeStr}T00:00:00Z`);
  const diferencaDias = Math.round((tVenc - tHoje) / msPorDia);

  if (diferencaDias >= 1 && diferencaDias <= 15) {
    return 'A vencer';
  }
  return 'Vigente';
}

export type IndicadoresRos = {
  total: number;
  aguardandoAprovacao: number;
  backoffice: number;
  renovacoesEmAnalise: number;
  vencem15Dias: number;
  vencidas: number;
  semPrazo: number;
};

export function calcularIndicadoresRos(
  rows: Array<{
    situacao?: string;
    data_vencimento?: string | null;
    renovacoes_ro?: Array<{ situacao?: string }>;
  }> = [],
  hojeStr: string = new Date().toISOString().slice(0, 10)
): IndicadoresRos {
  let aguardandoAprovacao = 0;
  let backoffice = 0;
  let renovacoesEmAnalise = 0;
  let vencem15Dias = 0;
  let vencidas = 0;
  let semPrazo = 0;

  for (const row of rows) {
    const sit = row.situacao || '';
    if (sit === 'Aguardando aprovação') {
      aguardandoAprovacao++;
    } else if (sit === 'Backoffice') {
      backoffice++;
    }

    if (Array.isArray(row.renovacoes_ro)) {
      const temEmAnalise = row.renovacoes_ro.some((ren) => ren.situacao === 'Em análise');
      if (temEmAnalise) renovacoesEmAnalise++;
    }

    if (sit === 'Aprovada') {
      const vigencia = calcularVigenciaRo(row.data_vencimento, hojeStr);
      if (vigencia === 'A vencer' || vigencia === 'Vence hoje') {
        vencem15Dias++;
      } else if (vigencia === 'Vencida') {
        vencidas++;
      } else if (vigencia === 'Sem prazo') {
        semPrazo++;
      }
    }
  }

  return {
    total: rows.length,
    aguardandoAprovacao,
    backoffice,
    renovacoesEmAnalise,
    vencem15Dias,
    vencidas,
    semPrazo,
  };
}

export type FetchRosOptions = {
  fetchImpl?: typeof fetch;
  getHeaders?: () => Record<string, string>;
  baseUrl?: string;
};

export type FetchRosResult = {
  data: Array<any>;
  total: number;
  pagina: number;
  limite: number;
};

export async function fetchRegistrosOportunidade(
  filters: FiltrosRos = {},
  page = 1,
  limit = 50,
  options: FetchRosOptions = {}
): Promise<FetchRosResult> {
  const fetchFn = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) {
    throw new Error('Ambiente sem suporte a fetch disponível.');
  }

  const query = montarQueryRos(filters, page, limit);
  const baseUrl = options.baseUrl || '/api/ros';
  const queryString = query.toString();
  const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;

  const defaultHeaders: Record<string, string> = {};
  if (typeof options.getHeaders === 'function') {
    Object.assign(defaultHeaders, options.getHeaders());
  }

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: defaultHeaders,
    });
  } catch (err: any) {
    throw new Error(`Falha de rede ao consultar R.Os: ${err?.message || err}`);
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg = traduzirErroApiRos(res.status, payload, 'Erro ao carregar lista de R.Os.');
    throw new Error(msg);
  }

  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    total: typeof payload?.total === 'number' ? payload.total : (payload?.data?.length || 0),
    pagina: typeof payload?.pagina === 'number' ? payload.pagina : page,
    limite: typeof payload?.limite === 'number' ? payload.limite : limit,
  };
}

export function ehRespostaMaisRecente(idRequisicao: number, ultimoIdIniciado: number): boolean {
  return idRequisicao === ultimoIdIniciado;
}

