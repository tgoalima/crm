import type { Atividade } from './evidencias-humanas.ts';
export type CursorComentario = { start: string; start_id: string };
export type ResultadoComentarios = { atividades: Atividade[]; completa: boolean; motivo: string | null };
// Paginação oficial: data + ID do último comentário. Não inferir fim pelo tamanho.
export async function coletarComentariosClickUp(
  buscar: (cursor?: CursorComentario) => Promise<unknown>,
): Promise<ResultadoComentarios> {
  const atividades: Atividade[] = [];
  const vistos = new Set<string>();
  let cursor: CursorComentario | undefined;
  const parcial = (motivo: string) => ({ atividades, completa: false, motivo });
  for (let pagina = 0; pagina < 100; pagina++) {
    let resposta: any;
    try { resposta = await buscar(cursor); }
    catch { return parcial('falha_consulta'); }
    if (!Array.isArray(resposta?.comments)) return parcial('resposta_invalida');
    const comentarios = resposta.comments;
    if (!comentarios.length) return { atividades, completa: true, motivo: null };
    for (const c of comentarios) {
      if (!c || c.id == null || !/^\d+$/.test(String(c.date ?? ''))) return parcial('comentario_invalido');
      const data = new Date(Number(c.date));
      if (!Number.isFinite(data.getTime())) return parcial('comentario_invalido');
      atividades.push({
        id: `cu_${c.id}`, clickup_comment_id: String(c.id),
        autor_clickup_id: c.user?.id == null ? null : String(c.user.id),
        autor_nome: c.user?.username || c.user?.email || null,
        origem: 'clickup', data_execucao: data.toISOString(),
        texto: typeof c.comment_text === 'string' ? c.comment_text : '',
        // Não confundir falta de extração com prova de ausência de anexos.
        anexos: [], anexos_verificados: false,
      });
    }
    const ultimo = comentarios[comentarios.length - 1];
    cursor = { start: String(ultimo.date), start_id: String(ultimo.id) };
    const chave = `${cursor.start}:${cursor.start_id}`;
    if (vistos.has(chave)) return parcial('cursor_repetido');
    vistos.add(chave);
  }
  return parcial('limite_paginas');
}
