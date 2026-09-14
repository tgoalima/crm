export class ErroAutoria extends Error {
  status: number;
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status; }
}

type AutorConfirmado = { id: string; nome: string | null };
const CACHE_IDENTIDADE_MS = 60_000;
const identidadePorCredencial = new Map<string, { autor: AutorConfirmado; expiraEm: number }>();
const validacoesEmAndamento = new Map<string, Promise<AutorConfirmado>>();

async function consultarAutorClickUp(
  credencial: string,
  consultar: (token: string) => Promise<Response>,
): Promise<AutorConfirmado> {
  let response: Response;
  try { response = await consultar(credencial); }
  catch { throw new ErroAutoria(503, 'Não foi possível verificar sua identidade no ClickUp. Tente novamente.'); }
  if (!response.ok) throw new ErroAutoria(response.status === 401 || response.status === 403 ? 401 : 503,
    'Não foi possível validar sua sessão no ClickUp.');
  let user;
  try { user = (await response.json()).user; }
  catch { throw new ErroAutoria(503, 'Resposta de identidade inválida.'); }
  const id = String(user?.id ?? '');
  if (!/^-?\d+$/.test(id)) throw new ErroAutoria(503, 'Resposta de identidade inválida.');
  return { id, nome: user.username || user.email || null };
}

export async function validarAutor(
  token: string | null, informado: unknown, consultar: (token: string) => Promise<Response>,
) {
  if (!token?.trim()) throw new ErroAutoria(401, 'Entre no CRM para registrar a atividade.');
  const credencial = token.trim();
  const agora = Date.now();
  const emCache = identidadePorCredencial.get(credencial);
  let autor: AutorConfirmado;

  if (emCache && emCache.expiraEm > agora) {
    autor = emCache.autor;
  } else {
    if (emCache) identidadePorCredencial.delete(credencial);
    let pendente = validacoesEmAndamento.get(credencial);
    if (!pendente) {
      pendente = consultarAutorClickUp(credencial, consultar).then((resultado) => {
        identidadePorCredencial.set(credencial, { autor: resultado, expiraEm: Date.now() + CACHE_IDENTIDADE_MS });
        return resultado;
      }).finally(() => validacoesEmAndamento.delete(credencial));
      validacoesEmAndamento.set(credencial, pendente);
    }
    autor = await pendente;
  }

  if (informado != null && String(informado) !== autor.id) throw new ErroAutoria(403,
    'O autor informado não corresponde à sessão. Entre novamente no CRM.');
  return autor;
}
