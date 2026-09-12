export class ErroComando extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
  if (!DATA.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw new ErroComando(400, `${nome} deve usar o formato YYYY-MM-DD.`);
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
  negocio_id: string | null;
  fabricante_id: string | null;
  situacao: string | null;
  responsavel: string | null;
  vence_ate: string | null;
  pagina: number;
  limite: number;
};

export function interpretarConsulta(params: URLSearchParams): ConsultaRos {
  const permitidos = ['negocio_id', 'fabricante_id', 'situacao', 'responsavel', 'vence_ate', 'pagina', 'limite'];
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

  const negocioIdRaw = params.get('negocio_id');
  const fabricanteIdRaw = params.get('fabricante_id');
  const venceAteRaw = params.get('vence_ate');

  return {
    negocio_id: negocioIdRaw ? uuid(negocioIdRaw, 'A oportunidade') : null,
    fabricante_id: fabricanteIdRaw ? uuid(fabricanteIdRaw, 'O fabricante') : null,
    situacao: texto(params.get('situacao'), 'A situação'),
    responsavel: texto(params.get('responsavel'), 'O responsável'),
    vence_ate: venceAteRaw ? data(venceAteRaw, 'A data limite de vencimento') : null,
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

  let match = rota.match(new RegExp(`^(${UUID_PATTERN})/aprovar$`, 'i'));
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
    somente(corpo, ['data_resposta', 'novo_vencimento', 'motivo', 'evidencias', 'request_id']);
    const aprovar = match[3].toLowerCase() === 'aprovar';
    return { rpc: 'ro_responder_renovacao', params: {
      p_id: match[1], p_ciclo: Number(match[2]), p_situacao: aprovar ? 'Aprovada' : 'Negada',
      p_data_resposta: data(corpo.data_resposta, 'A data de resposta'),
      p_novo_vencimento: aprovar ? data(corpo.novo_vencimento, 'O novo vencimento') : null,
      p_motivo: aprovar ? null : texto(corpo.motivo, 'O motivo', true),
      p_evidencias: corpo.evidencias ?? [],
      p_request_id: texto(corpo.request_id, 'O request_id'),
    } };
  }
  match = rota.match(new RegExp(`^(${UUID_PATTERN})/substituir$`, 'i'));
  if (match) {
    somente(corpo, ['numero_ro', 'data_aprovacao', 'data_vencimento', 'versao_esperada', 'request_id']);
    return { rpc: 'ro_substituir', params: {
      p_ro_anterior_id: match[1],
      p_numero_ro: texto(corpo.numero_ro, 'O novo número da R.O.', true),
      p_data_aprovacao: data(corpo.data_aprovacao, 'A data de aprovação'),
      p_data_vencimento: data(corpo.data_vencimento, 'A data de vencimento'),
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

