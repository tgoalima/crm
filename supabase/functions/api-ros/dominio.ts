export class ErroComando extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function classificarErroRpcRo(codigo: string | undefined, mensagem: string | undefined) {
  if (codigo === "23514") {
    if (mensagem?.includes("registros_oportunidade_datas_aprovacao")) {
      return {
        status: 422,
        error: "A data de aprovação não pode ser anterior à data de envio ao fabricante.",
      };
    }
    return { status: 422, error: "Os dados informados não atendem às regras da R.O." };
  }
  if (codigo === "23505" || codigo === "P0001") {
    return { status: 409, error: mensagem || "Conflito de versão ou duplicidade na R.O." };
  }
  return null;
}

export function estagioPermiteCriarRo(estagio: unknown): boolean {
  const valor = typeof estagio === "string" ? estagio.trim().toLocaleLowerCase("pt-BR") : "";
  return !valor.includes("ganho") && !valor.includes("perdido");
}

type Corpo = Record<string, unknown>;
type Comando = { rpc: string; params: Record<string, unknown> };

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID = new RegExp(`^${UUID_PATTERN}$`, 'i');
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown, nome: string, obrigatorio = false): string | null {
  if (valor === undefined || valor === null) {
    if (obrigatorio) throw new ErroComando(400, `${nome} é obrigatório.`);
    return null;
  }
  if (typeof valor !== 'string' || !valor.trim()) throw new ErroComando(400, `${nome} é inválido.`);
  return valor.trim();
}

function uuid(valor: unknown, nome: string): string {
  const result = texto(valor, nome, true)!;
  if (!UUID.test(result)) throw new ErroComando(400, `${nome} é inválido.`);
  return result;
}

function data(valor: unknown, nome: string): string {
  const result = texto(valor, nome, true)!;
  const partes = result.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!DATA.test(result) || !partes) {
    throw new ErroComando(400, `${nome} deve usar o formato YYYY-MM-DD.`);
  }
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const civil = new Date(Date.UTC(ano, mes - 1, dia));
  if (civil.getUTCFullYear() !== ano || civil.getUTCMonth() !== mes - 1 || civil.getUTCDate() !== dia) {
    throw new ErroComando(400, `${nome} deve ser uma data válida.`);
  }
  return result;
}

function somente(corpo: Corpo, permitidos: string[]) {
  const inesperado = Object.keys(corpo).find((campo) => !permitidos.includes(campo));
  if (inesperado) throw new ErroComando(400, `Campo não permitido: ${inesperado}.`);
}

function versaoEsperada(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) {
    throw new ErroComando(422, 'Versão esperada deve ser um número inteiro positivo.');
  }
  return valor;
}

export type ConsultaRos = {
  conta_id: string | null;
  negocio_id: string | null;
  fabricante_id: string | null;
  situacao: string | null;
  responsavel: string | null;
  vence_ate: string | null;
  numero_ro: string | null;
  cliente: string | null;
  oportunidade: string | null;
  busca: string | null;
  pagina: number;
  limite: number;
};

// `.or()` recebe uma expressão PostgREST crua. Valores textuais precisam ficar
// entre aspas e ter aspas e barras escapadas antes de compor essa expressão.
export function predicadoIlikePostgrest(campo: string, valor: string): string {
  const seguro = valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${campo}.ilike."*${seguro}*"`;
}

export type ResumoRosAgregado = {
  total: number;
  aguardando_aprovacao: number;
  renovacoes_em_analise: number;
  vencem_15_dias: number;
};

export function calcularResumoAgregadoDominio(
  registros: Array<{
    situacao: string;
    data_vencimento?: string | null;
    renovacoes_ro?: Array<{ situacao: string }> | null;
  }>,
  hojeSp: string,
): ResumoRosAgregado {
  const [ano, mes, dia] = hojeSp.split('-').map(Number);
  const dataRef = new Date(Date.UTC(ano, mes - 1, dia));
  const data15 = new Date(Date.UTC(ano, mes - 1, dia + 15));
  const limite15 = data15.toISOString().slice(0, 10);

  let aguardando = 0;
  let renovacoesEmAnalise = 0;
  let vencem15 = 0;

  for (const r of registros || []) {
    if (r.situacao === 'Aguardando aprovação') {
      aguardando++;
    }
    if (Array.isArray(r.renovacoes_ro) && r.renovacoes_ro.some((ren) => ren.situacao === 'Em análise')) {
      renovacoesEmAnalise++;
    }
    if (r.situacao === 'Aprovada' && r.data_vencimento) {
      const venc = String(r.data_vencimento).slice(0, 10);
      if (venc >= hojeSp && venc <= limite15) {
        vencem15++;
      }
    }
  }

  return {
    total: registros ? registros.length : 0,
    aguardando_aprovacao: aguardando,
    renovacoes_em_analise: renovacoesEmAnalise,
    vencem_15_dias: vencem15,
  };
}

export function interpretarConsulta(params: URLSearchParams): ConsultaRos {
  const permitidos = [
    'conta_id', 'negocio_id', 'fabricante_id', 'situacao', 'responsavel',
    'vence_ate', 'numero_ro', 'cliente', 'oportunidade', 'busca', 'q',
    'pagina', 'limite',
  ];
  for (const chave of params.keys()) {
    if (!permitidos.includes(chave)) {
      throw new ErroComando(400, `Parâmetro de consulta não permitido: ${chave}.`);
    }
  }

  const limiteRaw = Number(params.get('limite') || 100);
  const paginaRaw = Number(params.get('pagina') || 1);
  if (!Number.isInteger(limiteRaw) || limiteRaw < 1 || limiteRaw > 200 ||
      !Number.isInteger(paginaRaw) || paginaRaw < 1) {
    throw new ErroComando(400, 'Paginação inválida: limite deve estar entre 1 e 200 e página deve ser >= 1.');
  }

  const contaIdRaw = params.get('conta_id');
  const negocioIdRaw = params.get('negocio_id');
  const fabricanteIdRaw = params.get('fabricante_id');
  const venceAteRaw = params.get('vence_ate');
  const buscaParam = params.get('busca') || params.get('q');

  return {
    conta_id: contaIdRaw ? uuid(contaIdRaw, 'A conta') : null,
    negocio_id: negocioIdRaw ? uuid(negocioIdRaw, 'A oportunidade') : null,
    fabricante_id: fabricanteIdRaw ? uuid(fabricanteIdRaw, 'O fabricante') : null,
    situacao: texto(params.get('situacao'), 'A situação'),
    responsavel: texto(params.get('responsavel'), 'O responsável'),
    vence_ate: venceAteRaw ? data(venceAteRaw, 'A data limite de vencimento') : null,
    numero_ro: texto(params.get('numero_ro'), 'O número da R.O.'),
    cliente: texto(params.get('cliente'), 'O cliente'),
    oportunidade: texto(params.get('oportunidade'), 'A oportunidade'),
    busca: texto(buscaParam, 'A busca'),
    pagina: paginaRaw,
    limite: limiteRaw,
  };
}

export function interpretarComando(method: string, path: string, corpo: Corpo): Comando {
  if (method !== 'POST' || !corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroComando(404, 'Rota não encontrada.');
  }
  const rota = path.replace(/^\/+|\/+$/g, '');
  if (!rota) {
    somente(corpo, [
      'negocio_id', 'fabricante_id', 'categoria', 'titulo', 'cenario',
      'responsavel_operacional_clickup_id', 'request_id',
    ]);
    return {
      rpc: 'ro_criar',
      params: {
        p_negocio_id: uuid(corpo.negocio_id, 'A oportunidade'),
        p_fabricante_id: uuid(corpo.fabricante_id, 'O fabricante'),
        p_categoria: texto(corpo.categoria, 'A categoria', true),
        p_titulo: texto(corpo.titulo, 'O título'),
        p_cenario: texto(corpo.cenario, 'O cenário'),
        p_responsavel_operacional_clickup_id: texto(corpo.responsavel_operacional_clickup_id, 'O responsável'),
        p_request_id: texto(corpo.request_id, 'O request_id'),
      },
    };
  }

  let match = rota.match(new RegExp(`^(${UUID_PATTERN})/enviar$`, 'i'));
  if (match) {
    somente(corpo, ['data_solicitacao', 'observacao', 'versao_esperada', 'request_id']);
    return {
      rpc: 'ro_registrar_envio',
      params: {
        p_id: match[1],
        p_data_solicitacao: data(corpo.data_solicitacao, 'A data de solicitação'),
        p_observacao: texto(corpo.observacao, 'A observação'),
        p_versao_esperada: versaoEsperada(corpo.versao_esperada),
        p_request_id: texto(corpo.request_id, 'O request_id'),
      },
    };
  }
  match = rota.match(new RegExp(`^(${UUID_PATTERN})/aprovar$`, 'i'));
  if (match) {
    somente(corpo, ['numero_ro', 'data_aprovacao', 'data_vencimento', 'versao_esperada', 'request_id']);
    return { rpc: 'ro_aprovar', params: {
      p_id: match[1],
      p_numero_ro: texto(corpo.numero_ro, 'O número da R.O.', true),
      p_data_aprovacao: data(corpo.data_aprovacao, 'A data de aprovação'),
      p_data_vencimento: data(corpo.data_vencimento, 'A data de vencimento'),
      p_versao_esperada: versaoEsperada(corpo.versao_esperada),
      p_request_id: texto(corpo.request_id, 'O request_id'),
    } };
  }
  match = rota.match(new RegExp(`^(${UUID_PATTERN})/renovacoes$`, 'i'));
  if (match) {
    somente(corpo, ['data_solicitacao', 'evidencias', 'versao_esperada', 'request_id']);
    return { rpc: 'ro_solicitar_renovacao', params: {
      p_id: match[1],
      p_data_solicitacao: data(corpo.data_solicitacao, 'A data de solicitação'),
      p_evidencias: corpo.evidencias ?? [],
      p_versao_esperada: versaoEsperada(corpo.versao_esperada),
      p_request_id: texto(corpo.request_id, 'O request_id'),
    } };
  }
  match = rota.match(new RegExp(`^(${UUID_PATTERN})/renovacoes/(\\d+)/(aprovar|negar)$`, 'i'));
  if (match) {
    somente(corpo, ['data_resposta', 'novo_vencimento', 'motivo', 'evidencias', 'versao_esperada', 'request_id']);
    const aprovar = match[3].toLowerCase() === 'aprovar';
    return { rpc: 'ro_responder_renovacao', params: {
      p_id: match[1], p_ciclo: Number(match[2]), p_situacao: aprovar ? 'Aprovada' : 'Negada',
      p_data_resposta: data(corpo.data_resposta, 'A data de resposta'),
      p_novo_vencimento: aprovar ? data(corpo.novo_vencimento, 'O novo vencimento') : null,
      p_motivo: aprovar ? null : texto(corpo.motivo, 'O motivo', true),
      p_evidencias: corpo.evidencias ?? [],
      p_versao_esperada: versaoEsperada(corpo.versao_esperada),
      p_request_id: texto(corpo.request_id, 'O request_id'),
    } };
  }
  match = rota.match(new RegExp(`^(${UUID_PATTERN})/substituir$`, 'i'));
  if (match) {
    somente(corpo, ['versao_esperada', 'request_id']);
    return { rpc: 'ro_substituir', params: {
      p_ro_anterior_id: match[1],
      p_versao_esperada: versaoEsperada(corpo.versao_esperada),
      p_request_id: texto(corpo.request_id, 'O request_id'),
    } };
  }
  match = rota.match(new RegExp(`^(${UUID_PATTERN})/encerrar$`, 'i'));
  if (match) {
    somente(corpo, ['situacao', 'data_encerramento', 'motivo', 'versao_esperada', 'request_id']);
    const situacao = texto(corpo.situacao, 'A situação', true)!;
    if (!['Reprovada', 'Encerrada'].includes(situacao)) throw new ErroComando(400, 'Situação final inválida.');
    return { rpc: 'ro_encerrar', params: {
      p_id: match[1],
      p_situacao: situacao,
      p_data_encerramento: data(corpo.data_encerramento, 'A data de encerramento'),
      p_motivo: texto(corpo.motivo, 'O motivo', true),
      p_versao_esperada: versaoEsperada(corpo.versao_esperada),
      p_request_id: texto(corpo.request_id, 'O request_id'),
    } };
  }
  throw new ErroComando(404, 'Rota não encontrada.');
}

export type ConsultaEvidenciasRos = {
  negocio_id: string | null;
  fabricante_id: string | null;
  fabricante: string | null;
  situacao: string | null;
  responsavel: string | null;
  numero_ro: string | null;
  cliente: string | null;
  oportunidade: string | null;
  busca: string | null;
  data_inicio: string;
  data_fim: string;
  pagina: number;
  limite: number;
};

export function obterHojeSp(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const valor = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${valor.year}-${valor.month}-${valor.day}`;
}

export function interpretarConsultaEvidencias(
  params: URLSearchParams,
  hojeSpReferencia?: string,
): ConsultaEvidenciasRos {
  const permitidos = [
    'negocio_id', 'fabricante_id', 'fabricante', 'situacao', 'responsavel',
    'numero_ro', 'cliente', 'oportunidade', 'busca', 'q', 'pagina', 'limite',
    'data_inicio', 'data_fim',
  ];
  for (const chave of params.keys()) {
    if (!permitidos.includes(chave)) {
      throw new ErroComando(400, `Parâmetro de consulta inválido para evidências: ${chave}.`);
    }
  }

  const negocioId = params.get('negocio_id')?.trim();
  const fabricanteId = params.get('fabricante_id')?.trim();
  if (negocioId) uuid(negocioId, 'negocio_id');
  if (fabricanteId) uuid(fabricanteId, 'fabricante_id');

  const hoje = hojeSpReferencia || obterHojeSp();
  const rawInicio = params.get('data_inicio')?.trim();
  const rawFim = params.get('data_fim')?.trim();

  const dataInicio = rawInicio ? data(rawInicio, 'data_inicio') : `${hoje.slice(0, 7)}-01`;
  const dataFim = rawFim ? data(rawFim, 'data_fim') : hoje;

  if (dataInicio > dataFim) {
    throw new ErroComando(400, 'Período inválido: data_inicio é posterior a data_fim.');
  }

  const rawPagina = params.get('pagina');
  const pagina = rawPagina ? Number(rawPagina) : 1;
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ErroComando(400, 'Página inválida.');
  }

  const rawLimite = params.get('limite');
  const limite = rawLimite ? Number(rawLimite) : 50;
  if (!Number.isInteger(limite) || limite < 1 || limite > 200) {
    throw new ErroComando(400, 'Limite deve estar entre 1 e 200.');
  }

  return {
    negocio_id: negocioId || null,
    fabricante_id: fabricanteId || null,
    fabricante: params.get('fabricante')?.trim() || null,
    situacao: params.get('situacao')?.trim() || null,
    responsavel: params.get('responsavel')?.trim() || null,
    numero_ro: params.get('numero_ro')?.trim() || null,
    cliente: params.get('cliente')?.trim() || null,
    oportunidade: params.get('oportunidade')?.trim() || null,
    busca: params.get('busca')?.trim() || params.get('q')?.trim() || null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    pagina,
    limite,
  };
}

function calcularVigenciaSimples(vencimento: string | null, hoje: string): string {
  if (!vencimento) return 'Sem prazo';
  const dias = Math.round((Date.parse(`${vencimento}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000);
  if (dias < 0) return 'Vencida';
  if (dias === 0) return 'Vence hoje';
  if (dias <= 15) return 'A vencer';
  return 'Vigente';
}

export function enriquecerRosComEvidencias(
  registros: any[],
  mapaEvidencias: Map<string, any | Error>,
  dataInicio: string,
  dataFim: string,
  hojeSp: string,
) {
  let coberturaCompleta = true;
  let totalSemAtualizacaoConfirmada = 0;
  let totalCoberturaDesconhecida = 0;
  let totalComAtualizacao = 0;

  const ros = (registros || []).map((ro) => {
    const idNegocio = ro.negocios?.clickup_negocio_id || ro.negocio?.clickup_negocio_id || null;
    const coleta = idNegocio ? mapaEvidencias.get(idNegocio) : null;
    const alertas: string[] = [];
    let lista: any[] = [];
    let coberturaOportunidadeConfirmada = true;

    if (!idNegocio) {
      coberturaCompleta = false;
      coberturaOportunidadeConfirmada = false;
      alertas.push('Oportunidade sem identificador ClickUp para consulta de evidências.');
    } else if (coleta instanceof Error || !coleta) {
      coberturaCompleta = false;
      coberturaOportunidadeConfirmada = false;
      const msgErro = coleta instanceof Error ? coleta.message : 'Falha na consulta';
      alertas.push(`Não foi possível consultar as evidências humanas desta oportunidade (${msgErro}).`);
    } else {
      lista = coleta.evidencias || [];
      // Se a fonte for apenas banco e foi lida até o fim, a sincronização CRM está completa
      const bancoIncompleto = coleta.cobertura_banco_completa === false;
      const clickupIncompleto = typeof coleta.fonte === 'string' && coleta.fonte.includes('ClickUp') && coleta.cobertura_clickup_completa === false;
      if (bancoIncompleto || clickupIncompleto) {
        coberturaCompleta = false;
        coberturaOportunidadeConfirmada = false;
        alertas.push('A cobertura das evidências desta oportunidade está incompleta.');
      }
      if (coleta.autor_classificacao_invalida) {
        coberturaCompleta = false;
        coberturaOportunidadeConfirmada = false;
        alertas.push('Classificação de autoria não configurada ou inválida no CRM.');
      }
    }

    const noPeriodo = lista.find((a) => {
      const dia = String(a.data || '').slice(0, 10);
      return dia >= dataInicio && dia <= dataFim;
    }) || null;

    const ultima = lista[0] || null;

    let statusEvidencia: 'com_atualizacao' | 'sem_atualizacao_confirmada' | 'cobertura_desconhecida' = 'cobertura_desconhecida';

    if (noPeriodo) {
      totalComAtualizacao++;
      statusEvidencia = 'com_atualizacao';
    } else if (coberturaOportunidadeConfirmada) {
      totalSemAtualizacaoConfirmada++;
      statusEvidencia = 'sem_atualizacao_confirmada';
      if (ultima && ultima.data) {
        alertas.unshift(`Sem atualização humana neste mês — última atividade em ${ultima.data.slice(0, 10)}.`);
      } else {
        alertas.unshift('Sem atualização humana neste mês.');
      }
    } else {
      totalCoberturaDesconhecida++;
      statusEvidencia = 'cobertura_desconhecida';
    }

    const clienteNome = ro.negocios?.contas?.nome || ro.negocios?.contas?.razao_social || ro.negocio?.conta || null;
    const oportunidadeNome = ro.negocios?.nome || ro.negocio?.nome || null;
    const fabricanteNome = ro.fabricantes_ro?.nome || ro.fabricante || null;
    const ciclos = (ro.renovacoes_ro || []).map((r: any) => Number(r.ciclo) || 0);

    return {
      id: ro.id,
      cliente: clienteNome,
      oportunidade: oportunidadeNome,
      oportunidade_clickup_id: idNegocio,
      oportunidade_url: idNegocio ? `https://app.clickup.com/t/${idNegocio}` : null,
      fabricante: fabricanteNome,
      categoria: ro.categoria || null,
      cenario: ro.cenario || null,
      numero_ro: ro.numero_ro || null,
      situacao: ro.situacao,
      data_vencimento: ro.data_vencimento,
      vigencia: calcularVigenciaSimples(ro.data_vencimento, hojeSp),
      ciclo_renovacao: ciclos.length ? Math.max(...ciclos) : (ro.ciclo_renovacao || 0),
      atualizacao_no_periodo: noPeriodo,
      ultima_atividade_humana: ultima,
      evidencias_humanas: lista.slice(0, 3),
      status_evidencia: statusEvidencia,
      alertas,
      fonte_evidencias: coleta && !(coleta instanceof Error) ? (coleta.fonte || 'CRM') : null,
    };
  });

  return {
    ros,
    total_sem_atualizacao_confirmada: totalSemAtualizacaoConfirmada,
    total_cobertura_desconhecida: totalCoberturaDesconhecida,
    total_com_atualizacao: totalComAtualizacao,
    total_sem_atualizacao: totalSemAtualizacaoConfirmada,
    cobertura_evidencias_completa: coberturaCompleta,
  };
}
