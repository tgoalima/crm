// Domínio de interface de R.Os carregado pelo navegador antes de app.js.
// Os testes executam este mesmo arquivo, evitando uma cópia de regras só para Node.
(function registrarDominioRos(global) {
  const montarQueryRos = (filters = {}, page = 1, limit = 50) => {
    const params = new URLSearchParams();
    params.set('pagina', String(Math.max(1, Number(page) || 1)));
    params.set('limite', String(Math.max(1, Math.min(200, Number(limit) || 50))));
    for (const chave of [
      'negocio_id', 'fabricante_id', 'situacao', 'responsavel',
      'vence_ate', 'numero_ro', 'cliente', 'oportunidade', 'busca', 'q',
    ]) {
      const valor = filters[chave];
      if (valor === undefined || valor === null) continue;
      const texto = String(valor).trim();
      if (texto) params.set(chave, texto);
    }
    return params;
  };

  const traduzirErroApiRos = (status, responseData, fallback) => {
    if (status === 401) return 'Sessão expirada ou não autenticada. Faça login novamente no CRM.';
    if (status === 403) return 'Acesso negado: seu usuário não possui autorização registrada no CRM.';
    if (status === 409) return responseData?.error || 'Conflito de versão ou duplicidade: o registro foi alterado por outro usuário.';
    if (status === 422) return responseData?.error || 'Dados da solicitação inválidos para esta operação de R.O.';
    if (status === 500) return responseData?.error || 'Erro inesperado na comunicação com o servidor ao consultar R.Os.';
    if (typeof responseData?.error === 'string') return responseData.error;
    if (typeof fallback === 'string') return fallback;
    return 'Erro inesperado na comunicação com o servidor ao consultar R.Os.';
  };

  const fetchRegistrosOportunidade = async (filters = {}, page = 1, limit = 50, options = {}) => {
    const fetchFn = options.fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('Ambiente sem suporte a fetch disponível.');
    const query = montarQueryRos(filters, page, limit);
    const baseUrl = options.baseUrl || '/api/ros';
    const headers = typeof options.getHeaders === 'function' ? options.getHeaders() : {};
    let response;
    try {
      response = await fetchFn(`${baseUrl}?${query.toString()}`, { method: 'GET', headers });
    } catch (error) {
      throw new Error(`Falha de rede ao consultar R.Os: ${error?.message || error}`);
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(traduzirErroApiRos(response.status, payload, 'Erro ao carregar lista de R.Os.'));
    return {
      data: Array.isArray(payload?.data) ? payload.data : [],
      total: typeof payload?.total === 'number' ? payload.total : (payload?.data?.length || 0),
      pagina: typeof payload?.pagina === 'number' ? payload.pagina : page,
      limite: typeof payload?.limite === 'number' ? payload.limite : limit,
    };
  };

  const fetchResumoRos = async (filters = {}, options = {}) => {
    const fetchFn = options.fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('Ambiente sem suporte a fetch disponível.');
    const query = montarQueryRos(filters, 1, 1);
    const baseUrl = options.baseUrl || '/api/ros';
    const headers = typeof options.getHeaders === 'function' ? options.getHeaders() : {};
    let response;
    try {
      response = await fetchFn(`${baseUrl}/resumo?${query.toString()}`, { method: 'GET', headers });
    } catch (error) {
      throw new Error(`Falha de rede ao consultar resumo de R.Os: ${error?.message || error}`);
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(traduzirErroApiRos(response.status, payload, 'Erro ao carregar resumo de R.Os.'));
    return {
      total: typeof payload?.total === 'number' ? payload.total : 0,
      aguardando_aprovacao: typeof payload?.aguardando_aprovacao === 'number' ? payload.aguardando_aprovacao : 0,
      renovacoes_em_analise: typeof payload?.renovacoes_em_analise === 'number' ? payload.renovacoes_em_analise : 0,
      vencem_15_dias: typeof payload?.vencem_15_dias === 'number' ? payload.vencem_15_dias : 0,
    };
  };

  const obterHojeSaoPaulo = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch (e) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
  };

  const formatarDataCivil = (dataStr) => {
    if (!dataStr || typeof dataStr !== 'string') return '-';
    const limpo = dataStr.trim();
    const match = limpo.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return limpo || '-';
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  };

  const formatarCategoriaRo = (categoria) => {
    if (!categoria || typeof categoria !== 'string') return '—';
    const limpo = categoria.trim();
    return limpo || '—';
  };

  const obterLinkOportunidade = (negocio) => {
    if (!negocio || typeof negocio !== 'object') {
      return { temLink: false, url: null, label: '—', rel: null, target: null };
    }
    const nome = negocio.nome || (negocio.id ? `Oportunidade #${String(negocio.id).slice(0, 8)}` : 'Oportunidade');
    const clickupId = negocio.clickup_negocio_id;
    if (clickupId && typeof clickupId === 'string' && clickupId.trim()) {
      return {
        temLink: true,
        url: `https://app.clickup.com/t/${clickupId.trim()}`,
        label: nome,
        rel: 'noopener noreferrer',
        target: '_blank',
      };
    }
    return {
      temLink: false,
      url: null,
      label: nome,
      rel: null,
      target: null,
    };
  };

  const tratarEstadoResumo = (resumo, erro, carregando = false) => {
    if (carregando) {
      return {
        carregando: true,
        disponivel: false,
        textoExibicao: 'Carregando...',
        valores: { total: null, aguardando_aprovacao: null, renovacoes_em_analise: null, vencem_15_dias: null },
      };
    }
    if (erro || !resumo) {
      return {
        carregando: false,
        disponivel: false,
        textoExibicao: 'Indisponível',
        valores: { total: null, aguardando_aprovacao: null, renovacoes_em_analise: null, vencem_15_dias: null },
      };
    }
    return {
      carregando: false,
      disponivel: true,
      textoExibicao: null,
      valores: {
        total: typeof resumo.total === 'number' ? resumo.total : 0,
        aguardando_aprovacao: typeof resumo.aguardando_aprovacao === 'number' ? resumo.aguardando_aprovacao : 0,
        renovacoes_em_analise: typeof resumo.renovacoes_em_analise === 'number' ? resumo.renovacoes_em_analise : 0,
        vencem_15_dias: typeof resumo.vencem_15_dias === 'number' ? resumo.vencem_15_dias : 0,
      },
    };
  };

  const calcularVigenciaRo = (dataVencimento, hojeStr = obterHojeSaoPaulo()) => {
    if (!dataVencimento || typeof dataVencimento !== 'string' || !dataVencimento.trim()) {
      return 'Sem prazo';
    }
    const vencimento = dataVencimento.trim().slice(0, 10);
    if (vencimento < hojeStr) return 'Vencida';
    if (vencimento === hojeStr) return 'Vence hoje';

    const tVenc = Date.parse(`${vencimento}T00:00:00Z`);
    const tHoje = Date.parse(`${hojeStr}T00:00:00Z`);
    const diffDias = Math.round((tVenc - tHoje) / (1000 * 60 * 60 * 24));
    if (diffDias >= 1 && diffDias <= 15) return 'A vencer';
    return 'Vigente';
  };

  const obterRotuloSituacao = (situacao) => {
    switch (situacao) {
      case 'Backoffice':
        return {
          rotulo: 'Backoffice',
          classeBadge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
        };
      case 'Aguardando aprovação':
        return {
          rotulo: 'Aguardando aprovação',
          classeBadge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
        };
      case 'Aprovada':
        return {
          rotulo: 'Aprovada',
          classeBadge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
        };
      case 'Reprovada':
        return {
          rotulo: 'Reprovada',
          classeBadge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
        };
      case 'Encerrada':
        return {
          rotulo: 'Encerrada',
          classeBadge: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        };
      case 'Substituída':
        return {
          rotulo: 'Substituída',
          classeBadge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800',
        };
      default:
        return {
          rotulo: situacao || 'Não definida',
          classeBadge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700',
        };
    }
  };

  const calcularPaginacao = (total = 0, pagina = 1, limite = 50) => {
    const totalRegistros = Math.max(0, Number(total) || 0);
    const limitePorPagina = Math.max(1, Number(limite) || 50);
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / limitePorPagina));
    const paginaAtual = Math.max(1, Math.min(totalPaginas, Number(pagina) || 1));
    const inicio = totalRegistros === 0 ? 0 : (paginaAtual - 1) * limitePorPagina + 1;
    const fim = Math.min(totalRegistros, paginaAtual * limitePorPagina);
    return {
      totalPaginas,
      paginaAtual,
      inicio,
      fim,
      temAnterior: paginaAtual > 1,
      temProximo: paginaAtual < totalPaginas,
    };
  };

  const ordenarEventosRo = (eventos = []) => [...(Array.isArray(eventos) ? eventos : [])]
    .sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));

  const resumirCiclosRo = (renovacoes = []) => {
    const lista = Array.isArray(renovacoes) ? renovacoes : [];
    return {
      aprovados: lista.filter((renovacao) => renovacao?.situacao === 'Aprovada').length,
      pendente: lista.find((renovacao) => renovacao?.situacao === 'Em análise') || null,
    };
  };

  const obterAcoesPermitidasRo = (situacao) => {
    if (situacao === 'Backoffice') return ['enviar', 'aprovar', 'encerrar'];
    if (situacao === 'Aguardando aprovação') return ['aprovar', 'encerrar'];
    if (situacao === 'Aprovada') return ['renovar', 'substituir', 'encerrar'];
    return [];
  };


  const validarPayloadCriacaoRo = (payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Dados da R.O. são obrigatórios.');
    }
    const negocioId = payload.negocio_id ? String(payload.negocio_id).trim() : '';
    if (!negocioId) {
      throw new Error('A seleção da oportunidade é obrigatória.');
    }
    const fabricanteId = payload.fabricante_id ? String(payload.fabricante_id).trim() : '';
    if (!fabricanteId) {
      throw new Error('O fabricante é obrigatório.');
    }
    const categoria = payload.categoria ? String(payload.categoria).trim() : '';
    if (!categoria) {
      throw new Error('A categoria é obrigatória.');
    }

    return {
      negocio_id: negocioId,
      fabricante_id: fabricanteId,
      categoria,
      titulo: payload.titulo ? String(payload.titulo).trim() : null,
      cenario: payload.cenario ? String(payload.cenario).trim() : null,
      responsavel_operacional_clickup_id: payload.responsavel_operacional_clickup_id ? String(payload.responsavel_operacional_clickup_id).trim() : null,
      request_id: payload.request_id ? String(payload.request_id).trim() : null,
    };
  };

  const gerarRequestIdRo = () => {
    try {
      if (typeof global.crypto?.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const desambiguarOportunidade = (oportunidade) => {
    if (!oportunidade || typeof oportunidade !== 'object') return 'Oportunidade não identificada';
    const nomeOp = oportunidade.nome || oportunidade.name || `Oportunidade #${String(oportunidade.id || '').slice(0, 8)}`;
    const conta = oportunidade.contas?.nome || oportunidade.contas?.razao_social || oportunidade.contas?.nome_fantasia || oportunidade.cliente_nome || oportunidade.conta_nome || '';
    if (conta) {
      return `${conta} — ${nomeOp}`;
    }
    return `Sem cliente informado — ${nomeOp}`;
  };

  const criarRegistroOportunidade = async (dados, options = {}) => {
    const fetchFn = options.fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('Ambiente sem suporte a fetch disponível.');

    const payloadLimpo = validarPayloadCriacaoRo(dados);
    const requestId = payloadLimpo.request_id || gerarRequestIdRo();
    payloadLimpo.request_id = requestId;

    const baseUrl = options.baseUrl || '/api/ros';
    const authHeaders = typeof options.getHeaders === 'function' ? options.getHeaders() : {};
    const headers = {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      ...authHeaders,
    };

    let response;
    try {
      response = await fetchFn(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadLimpo),
      });
    } catch (error) {
      throw new Error(`Falha de rede ao criar R.O.: ${error?.message || error}`);
    }

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      throw new Error(traduzirErroApiRos(response.status, payload, 'Erro ao criar Registro de Oportunidade.'));
    }
    return payload?.data || payload;
  };

  global.RosUiDomain = {
    montarQueryRos,
    traduzirErroApiRos,
    fetchRegistrosOportunidade,
    fetchResumoRos,
    obterHojeSaoPaulo,
    formatarDataCivil,
    formatarCategoriaRo,
    obterLinkOportunidade,
    tratarEstadoResumo,
    calcularVigenciaRo,
    obterRotuloSituacao,
    calcularPaginacao,
    ordenarEventosRo,
    resumirCiclosRo,
    obterAcoesPermitidasRo,
    validarPayloadCriacaoRo,
    gerarRequestIdRo,
    desambiguarOportunidade,
    criarRegistroOportunidade,
  };
})(globalThis);
