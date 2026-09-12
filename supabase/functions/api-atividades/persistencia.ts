// Não repetir publicação automaticamente: um timeout pode esconder sucesso remoto.
export async function persistirAtividade<T extends { id: string }>(operacoes: {
  salvar: () => Promise<T>;
  publicar: () => Promise<string>;
  vincular: (id: string, comentarioId: string) => Promise<void>;
}) {
  const salva = await operacoes.salvar();
  if (!salva?.id) throw new Error('Banco não confirmou a gravação da atividade.');
  let comentarioId: string;
  try {
    comentarioId = await operacoes.publicar();
    if (!comentarioId) throw new Error('Comentário sem confirmação.');
  } catch {
    return [{ ...salva, sincronizacao: 'pendente' }];
  }
  try { await operacoes.vincular(salva.id, comentarioId); }
  catch {
    return [{ ...salva, clickup_comment_id: comentarioId, sincronizacao: 'requer_conciliacao' }];
  }
  return [{ ...salva, clickup_comment_id: comentarioId, sincronizacao: 'sincronizado' }];
}
