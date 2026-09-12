export class ErroAutoria extends Error {
  status: number;
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status; }
}
export async function validarAutor(
  token: string | null, informado: unknown, consultar: (token: string) => Promise<Response>,
) {
  if (!token?.trim()) throw new ErroAutoria(401, 'Entre no CRM para registrar a atividade.');
  let response: Response;
  try { response = await consultar(token.trim()); }
  catch { throw new ErroAutoria(503, 'Não foi possível verificar sua identidade no ClickUp. Tente novamente.'); }
  if (!response.ok) throw new ErroAutoria(response.status === 401 || response.status === 403 ? 401 : 503,
    'Não foi possível validar sua sessão no ClickUp.');
  let user;
  try { user = (await response.json()).user; }
  catch { throw new ErroAutoria(503, 'Resposta de identidade inválida.'); }
  const id = String(user?.id ?? '');
  if (!/^-?\d+$/.test(id)) throw new ErroAutoria(503, 'Resposta de identidade inválida.');
  if (informado != null && String(informado) !== id) throw new ErroAutoria(403,
    'O autor informado não corresponde à sessão. Entre novamente no CRM.');
  return { id, nome: user.username || user.email || null };
}
