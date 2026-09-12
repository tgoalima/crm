// Domínio de interface de R.Os carregado pelo navegador antes de app.js.
// Os testes executam este mesmo arquivo, evitando uma cópia de regras só para Node.
(function registrarDominioRos(global) {
  const montarQueryRos = (filters = {}, page = 1, limit = 50) => {
    const params = new URLSearchParams();
    params.set('pagina', String(Math.max(1, Number(page) || 1)));
    params.set('limite', String(Math.max(1, Math.min(200, Number(limit) || 50))));
    for (const chave of [
      'negocio_id', 'fabricante_id', 'fabricante', 'situacao', 'responsavel',
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

  const validarDataCivil = (valor, nomeCampo) => {
    if (!valor || typeof valor !== 'string') {
      throw new Error(`${nomeCampo} é obrigatória.`);
    }
    const limpo = valor.trim();
    const match = limpo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error(`${nomeCampo} deve usar o formato YYYY-MM-DD.`);
    }
    const ano = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
      throw new Error(`${nomeCampo} deve ser uma data válida.`);
    }
    return limpo;
  };

  const obterAcoesPermitidasRo = (situacao, temPendente = false, options = {}) => {
    const temSucessoraAtiva = !!options.temSucessoraAtiva;
    if (situacao === 'Backoffice') return ['enviar', 'aprovar', 'encerrar'];
    if (situacao === 'Aguardando aprovação') return ['aprovar', 'encerrar'];
    if (situacao === 'Aprovada') {
      const acoes = [temPendente ? 'responder_renovacao' : 'solicitar_renovacao'];
      if (!temPendente && !temSucessoraAtiva) {
        acoes.push('substituir');
      }
      acoes.push('encerrar');
      return acoes;
    }
    return [];
  };

  const validarPayloadAcaoRo = (acao, dados = {}, contexto = {}) => {
    if (!dados || typeof dados !== 'object') {
      throw new Error('Dados da ação são obrigatórios.');
    }

    const versaoEsperada = dados.versao_esperada !== undefined && dados.versao_esperada !== null
      ? Number(dados.versao_esperada)
      : (contexto.versao !== undefined ? Number(contexto.versao) : null);

    const requestId = dados.request_id ? String(dados.request_id).trim() : null;

    if (acao === 'enviar') {
      const dataSolicitacao = validarDataCivil(dados.data_solicitacao, 'A data do envio/solicitação');
      const observacao = dados.observacao ? String(dados.observacao).trim() : null;
      return {
        rota: 'enviar',
        payload: {
          data_solicitacao: dataSolicitacao,
          observacao,
          versao_esperada: versaoEsperada,
          request_id: requestId,
        },
      };
    }

    if (acao === 'aprovar') {
      const numeroRo = dados.numero_ro ? String(dados.numero_ro).trim() : '';
      if (!numeroRo) {
        throw new Error('O número oficial da R.O. é obrigatório.');
      }
      const dataAprovacao = validarDataCivil(dados.data_aprovacao, 'A data de aprovação');
      const dataVencimento = validarDataCivil(dados.data_vencimento, 'A data de vencimento');
      return {
        rota: 'aprovar',
        payload: {
          numero_ro: numeroRo,
          data_aprovacao: dataAprovacao,
          data_vencimento: dataVencimento,
          versao_esperada: versaoEsperada,
          request_id: requestId,
        },
      };
    }

    if (acao === 'solicitar_renovacao') {
      const dataSolicitacao = validarDataCivil(dados.data_solicitacao, 'A data de solicitação');
      return {
        rota: 'renovacoes',
        payload: {
          data_solicitacao: dataSolicitacao,
          evidencias: Array.isArray(dados.evidencias) ? dados.evidencias : [],
          versao_esperada: versaoEsperada,
          request_id: requestId,
        },
      };
    }

    if (acao === 'responder_renovacao') {
      const tipoResposta = dados.tipo_resposta ? String(dados.tipo_resposta).trim().toLowerCase() : '';
      if (!['aprovar', 'negar'].includes(tipoResposta)) {
        throw new Error('A resposta de renovação deve ser "aprovar" ou "negar".');
      }
      const dataResposta = validarDataCivil(dados.data_resposta, 'A data da resposta');
      const ciclo = Number(dados.ciclo || contexto.ciclo || 1);
      if (!Number.isInteger(ciclo) || ciclo < 1) {
        throw new Error('Ciclo de renovação inválido.');
      }

      if (tipoResposta === 'aprovar') {
        const novoVencimento = validarDataCivil(dados.novo_vencimento, 'O novo vencimento');
        const vencimentoAtual = contexto.data_vencimento || dados.vencimento_anterior;
        if (vencimentoAtual && novoVencimento <= vencimentoAtual) {
          throw new Error('O novo vencimento deve ser posterior ao vencimento atual da R.O.');
        }
        return {
          rota: `renovacoes/${ciclo}/aprovar`,
          payload: {
            data_resposta: dataResposta,
            novo_vencimento: novoVencimento,
            evidencias: Array.isArray(dados.evidencias) ? dados.evidencias : [],
            versao_esperada: versaoEsperada,
            request_id: requestId,
          },
        };
      } else {
        const motivo = dados.motivo ? String(dados.motivo).trim() : '';
        if (!motivo) {
          throw new Error('O motivo da negativa de renovação é obrigatório.');
        }
        return {
          rota: `renovacoes/${ciclo}/negar`,
          payload: {
            data_resposta: dataResposta,
            motivo,
            evidencias: Array.isArray(dados.evidencias) ? dados.evidencias : [],
            versao_esperada: versaoEsperada,
            request_id: requestId,
          },
        };
      }
    }

    if (acao === 'encerrar') {
      const situacao = dados.situacao ? String(dados.situacao).trim() : '';
      if (!['Encerrada', 'Reprovada'].includes(situacao)) {
        throw new Error('A situação final deve ser "Encerrada" ou "Reprovada".');
      }
      const dataEncerramento = validarDataCivil(dados.data_encerramento, 'A data do encerramento');
      const motivo = dados.motivo ? String(dados.motivo).trim() : '';
      if (!motivo) {
        throw new Error('O motivo do encerramento/reprovação é obrigatório.');
      }
      return {
        rota: 'encerrar',
        payload: {
          situacao,
          data_encerramento: dataEncerramento,
          motivo,
          versao_esperada: versaoEsperada,
          request_id: requestId,
        },
      };
    }

    if (acao === 'substituir') {
      return {
        rota: 'substituir',
        payload: {
          versao_esperada: versaoEsperada,
          request_id: requestId,
        },
      };
    }

    throw new Error(`Ação desconhecida: ${acao}`);
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


  const resolverNegocioCrmParaRo = async (task, consultarCrm) => {
    if (!task || typeof task !== "object" || typeof consultarCrm !== "function") {
      return null;
    }
    const idRaw = task.id ? String(task.id).trim() : "";
    const clickupId = task.clickup_negocio_id ? String(task.clickup_negocio_id).trim() : "";

    // 1. Tenta por UUID se idRaw parecer um UUID (com traços)
    if (idRaw && idRaw.includes("-")) {
      try {
        const resUuid = await consultarCrm({ id: idRaw });
        if (resUuid && resUuid.id) return resUuid;
      } catch {
        // segue para tentar por clickup_negocio_id
      }
    }

    // 2. Tenta por clickup_negocio_id
    const targetCuId = clickupId || idRaw;
    if (targetCuId) {
      try {
        const resCu = await consultarCrm({ clickup_negocio_id: targetCuId });
        if (resCu && resCu.id) return resCu;
      } catch {
        return null;
      }
    }

    // Nunca retorna fallback fictício com task.id
    return null;
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

  const executarAcaoRo = async (id, rotaOuAcao, payload = {}, options = {}) => {
    const fetchFn = options.fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('Ambiente sem suporte a fetch disponível.');
    if (!id || typeof id !== 'string') throw new Error('Identificador da R.O. é obrigatório.');

    const baseUrl = options.baseUrl || '/api/ros';
    const rotaLimpa = String(rotaOuAcao || '').replace(/^\/+/, '');
    if (!rotaLimpa) throw new Error('Rota de ação não informada.');

    const url = `${baseUrl}/${id}/${rotaLimpa}`;
    const requestId = options.requestId || payload?.request_id || (typeof options.gerarRequestId === 'function' ? options.gerarRequestId() : null);

    const getHeadersFn = options.getSupabaseHeaders || options.getHeaders;
    const authHeaders = typeof getHeadersFn === 'function' ? getHeadersFn() : {};
    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders,
    };
    if (requestId) {
      headers['x-request-id'] = requestId;
    }

    const payloadEnvio = { ...payload };
    if (requestId && !payloadEnvio.request_id) {
      payloadEnvio.request_id = requestId;
    }

    let response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadEnvio),
      });
    } catch (error) {
      const erroRede = new Error(`Falha de rede ao executar ação da R.O.: ${error?.message || error}`);
      erroRede.isNetworkError = true;
      throw erroRede;
    }

    let payloadResposta = null;
    try {
      payloadResposta = await response.json();
    } catch {
      payloadResposta = null;
    }

    if (!response.ok) {
      const mensagem = traduzirErroApiRos(response.status, payloadResposta, 'Erro ao executar ação da R.O.');
      const erroApi = new Error(mensagem);
      erroApi.status = response.status;
      erroApi.data = payloadResposta;
      throw erroApi;
    }

    return payloadResposta?.data !== undefined ? payloadResposta.data : payloadResposta;
  };

  const fetchRegistroOportunidade = async (id, options = {}) => {
    const fetchFn = options.fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('Ambiente sem suporte a fetch disponível.');
    if (!id || typeof id !== 'string') throw new Error('Identificador da R.O. é obrigatório.');

    const baseUrl = options.baseUrl || '/api/ros';
    const getHeadersFn = options.getSupabaseHeaders || options.getHeaders;
    const authHeaders = typeof getHeadersFn === 'function' ? getHeadersFn() : {};

    let response;
    try {
      response = await fetchFn(`${baseUrl}/${id}`, {
        method: 'GET',
        headers: authHeaders,
      });
    } catch (error) {
      const erroRede = new Error(`Falha de rede ao consultar detalhes da R.O.: ${error?.message || error}`);
      erroRede.isNetworkError = true;
      throw erroRede;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const msg = traduzirErroApiRos(response.status, payload, 'Erro ao carregar detalhes da R.O.');
      const erro = new Error(msg);
      erro.status = response.status;
      erro.data = payload;
      throw erro;
    }

    if (Array.isArray(payload?.data)) {
      if (payload.data.length === 0) {
        const erro404 = new Error('R.O. não encontrada.');
        erro404.status = 404;
        throw erro404;
      }
      return payload.data[0];
    }
    return payload?.data || payload;
  };


  const obterPeriodoMesCivilAtual = (dataRef) => {
    const hoje = dataRef ? String(dataRef).slice(0, 10) : obterHojeSaoPaulo();
    const inicio = `${hoje.slice(0, 7)}-01`;
    return { data_inicio: inicio, data_fim: hoje };
  };

  const validarPeriodoEvidencias = (dataInicio, dataFim) => {
    const padrao = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataInicio || !padrao.test(String(dataInicio).trim())) {
      throw new Error('Data inicial inválida: use o formato YYYY-MM-DD.');
    }
    if (!dataFim || !padrao.test(String(dataFim).trim())) {
      throw new Error('Data final inválida: use o formato YYYY-MM-DD.');
    }
    if (String(dataInicio).trim() > String(dataFim).trim()) {
      throw new Error('Período inválido: a data inicial é posterior à data final.');
    }
    return { data_inicio: String(dataInicio).trim(), data_fim: String(dataFim).trim() };
  };

  const montarQueryEvidenciasRos = (filters = {}, page = 1, limit = 50) => {
    const params = new URLSearchParams();
    params.set('pagina', String(Math.max(1, Number(page) || 1)));
    params.set('limite', String(Math.max(1, Math.min(200, Number(limit) || 50))));
    for (const chave of [
      'negocio_id', 'fabricante_id', 'fabricante', 'situacao', 'responsavel',
      'numero_ro', 'cliente', 'oportunidade', 'busca', 'q',
      'data_inicio', 'data_fim',
    ]) {
      const valor = filters[chave];
      if (valor === undefined || valor === null) continue;
      const texto = String(valor).trim();
      if (texto) params.set(chave, texto);
    }
    return params;
  };

  const fetchEvidenciasRos = async (filters = {}, page = 1, limit = 50, options = {}) => {
    const fetchFn = options.fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('Ambiente sem suporte a fetch disponível.');
    const query = montarQueryEvidenciasRos(filters, page, limit);
    const baseUrl = options.baseUrl || '/api/ros';
    const getHeadersFn = options.getSupabaseHeaders || options.getHeaders;
    const headers = typeof getHeadersFn === 'function' ? getHeadersFn() : {};
    let response;
    try {
      response = await fetchFn(`${baseUrl}/evidencias?${query.toString()}`, { method: 'GET', headers });
    } catch (error) {
      throw new Error(`Falha de rede ao consultar evidências de R.Os: ${error?.message || error}`);
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(traduzirErroApiRos(response.status, payload, 'Erro ao carregar evidências de R.Os.'));
    return {
      data: Array.isArray(payload?.data) ? payload.data : [],
      total: typeof payload?.total === 'number' ? payload.total : (payload?.data?.length || 0),
      total_sem_atualizacao_confirmada: typeof payload?.total_sem_atualizacao_confirmada === 'number'
        ? payload.total_sem_atualizacao_confirmada
        : (typeof payload?.total_sem_atualizacao === 'number' ? payload.total_sem_atualizacao : 0),
      total_cobertura_desconhecida: typeof payload?.total_cobertura_desconhecida === 'number' ? payload.total_cobertura_desconhecida : 0,
      total_sem_atualizacao: typeof payload?.total_sem_atualizacao_confirmada === 'number' ? payload.total_sem_atualizacao_confirmada : (payload?.total_sem_atualizacao || 0),
      total_com_atualizacao: typeof payload?.total_com_atualizacao === 'number' ? payload.total_com_atualizacao : 0,
      cobertura_evidencias_completa: payload?.cobertura_evidencias_completa ?? true,
      data_inicio: payload?.data_inicio || filters.data_inicio || '',
      data_fim: payload?.data_fim || filters.data_fim || '',
      pagina: typeof payload?.pagina === 'number' ? payload.pagina : page,
      limite: typeof payload?.limite === 'number' ? payload.limite : limit,
      total_paginas: typeof payload?.total_paginas === 'number' ? payload.total_paginas : 1,
    };
  };

  const formatarRelatorioAtualizacaoFabricante = (dadosEvidencias, nomeFabricante = '') => {
    const fabric = nomeFabricante ? nomeFabricante.trim() : (dadosEvidencias?.data?.[0]?.fabricante || 'Fabricante');
    const inicio = dadosEvidencias?.data_inicio ? formatarDataCivil(dadosEvidencias.data_inicio) : '—';
    const fim = dadosEvidencias?.data_fim ? formatarDataCivil(dadosEvidencias.data_fim) : '—';
    const total = dadosEvidencias?.total ?? dadosEvidencias?.data?.length ?? 0;
    const semAtivConf = dadosEvidencias?.total_sem_atualizacao_confirmada ?? dadosEvidencias?.total_sem_atualizacao ?? 0;
    const cobDesc = dadosEvidencias?.total_cobertura_desconhecida ?? 0;
    const cobertura = dadosEvidencias?.cobertura_evidencias_completa ? 'Completa' : `Parcial (${cobDesc} com cobertura pendente de verificação)`;

    let texto = `# Atualização Comercial de R.Os — ${fabric}\n`;
    texto += `Período analisado: ${inicio} a ${fim}\n`;
    texto += `Total de R.Os: ${total} | Sem atualização confirmada: ${semAtivConf} | Cobertura desconhecida/parcial: ${cobDesc} | Cobertura geral: ${cobertura}\n`;
    texto += `Gerado a partir das evidências registradas no CRM Suprimática.\n\n`;
    texto += `---\n\n`;

    const ros = dadosEvidencias?.data || [];
    if (ros.length === 0) {
      texto += `Nenhum registro de oportunidade localizado para este fabricante no período.\n`;
      return texto;
    }

    ros.forEach((ro, index) => {
      const numRo = ro.numero_ro || 'Aguardando número';
      const cliente = ro.cliente || 'Cliente não informado';
      const oport = ro.oportunidade || 'Oportunidade não informada';
      const venc = ro.data_vencimento ? `${formatarDataCivil(ro.data_vencimento)} (${ro.vigencia || '—'})` : 'Sem prazo';

      texto += `### ${index + 1}. ${cliente} — ${oport}\n`;
      texto += `• R.O.: ${numRo} | Situação: ${ro.situacao} | Vencimento: ${venc}\n`;

      if (ro.atualizacao_no_periodo) {
        const ativ = ro.atualizacao_no_periodo;
        const autor = ativ.autor_nome || 'Autor comercial';
        const dataAtiv = ativ.data ? formatarDataCivil(ativ.data) : 'Data não informada';
        const textoEvid = (ativ.texto || '').replace(/\s+/g, ' ').trim();
        texto += `• Atualização no período: "${textoEvid}" (por ${autor} em ${dataAtiv})\n`;
      } else {
        if (ro.ultima_atividade_humana) {
          const ult = ro.ultima_atividade_humana;
          const autorUlt = ult.autor_nome || 'Autor comercial';
          const dataUlt = ult.data ? formatarDataCivil(ult.data) : 'Data não informada';
          const textoUlt = (ult.texto || '').replace(/\s+/g, ' ').trim();
          texto += `• Sem atualização humana no período selecionado.\n`;
          texto += `  Última atividade anterior registrada: "${textoUlt}" (por ${autorUlt} em ${dataUlt})\n`;
        } else {
          texto += `• Sem atualização humana registrada no período e sem histórico anterior localizado.\n`;
        }
      }

      if (Array.isArray(ro.alertas) && ro.alertas.length > 0) {
        texto += `• Alertas: ${ro.alertas.join('; ')}\n`;
      }

      texto += `\n`;
    });

    return texto.trim();
  };

  global.RosUiDomain = {
    montarQueryRos,
    traduzirErroApiRos,
    fetchRegistrosOportunidade,
    fetchRegistroOportunidade,
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
    validarPayloadAcaoRo,
    executarAcaoRo,
    gerarRequestIdRo,
    desambiguarOportunidade,
    criarRegistroOportunidade,
    resolverNegocioCrmParaRo,
    obterPeriodoMesCivilAtual,
    validarPeriodoEvidencias,
    montarQueryEvidenciasRos,
    fetchEvidenciasRos,
    formatarRelatorioAtualizacaoFabricante,
  };

})(globalThis);
