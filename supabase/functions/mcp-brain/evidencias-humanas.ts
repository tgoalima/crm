// Seleção pura: não consulta serviços, não altera autoria e não interpreta anexos.
export type NaturezaAutor = 'humano' | 'agente' | 'sistema' | 'desconhecido';
export type Atividade = {
  id: string;
  clickup_comment_id?: string | null;
  autor_clickup_id?: string | number | null;
  autor_nome?: string | null;
  origem?: string;
  data_execucao?: string | null;
  texto?: string | null;
  anexos?: Array<Record<string, unknown>>;
  anexos_verificados?: boolean;
};

export function selecionarEvidenciasHumanas(
  atividades: Atividade[], autores: Record<string, NaturezaAutor>, limite = 50,
) {
  if (!Number.isInteger(limite) || limite < 1 || limite > 200) throw new Error('Limite deve estar entre 1 e 200.');
  const grupos = new Map<string, Atividade[]>();
  for (const a of atividades) {
    const chave = a.clickup_comment_id ? `comentario:${a.clickup_comment_id}` : `atividade:${a.id}`;
    grupos.set(chave, [...(grupos.get(chave) || []), a]);
  }
  const excluidas = { agente: 0, sistema: 0, desconhecido: 0 };
  let conflitos_autoria = 0;
  let datas_invalidas = 0;
  const elegiveis = [];
  for (const grupo of grupos.values()) {
    const ids = new Set(grupo.map(a => String(a.autor_clickup_id ?? '').trim()));
    if (ids.size !== 1) { conflitos_autoria++; continue; }
    const idAutor = [...ids][0];
    const natureza = Object.prototype.hasOwnProperty.call(autores, idAutor) ? autores[idAutor] : 'desconhecido';
    if (natureza !== 'humano') {
      excluidas[natureza === 'agente' || natureza === 'sistema' ? natureza : 'desconhecido']++;
      continue;
    }
    // Preferir o registro canônico local à cópia externa.
    const a = grupo.find(item => !item.id.startsWith('cu_')) || grupo[0];
    const instante = Date.parse(a.data_execucao || '');
    if (!Number.isFinite(instante)) { datas_invalidas++; continue; }
    elegiveis.push({
      id: a.id, clickup_comment_id: a.clickup_comment_id || null,
      autor_clickup_id: idAutor, autor_nome: a.autor_nome || null,
      origem: a.origem || null, data: new Date(instante).toISOString(),
      texto: a.texto || '',
      anexos_verificados: a.anexos_verificados ?? a.origem !== 'clickup',
      anexos: (a.anexos || []).map(anexo => ({ ...anexo, interpretacao: 'nao_realizada' })),
    });
  }
  elegiveis.sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
  return {
    evidencias: elegiveis.slice(0, limite), total_elegiveis: elegiveis.length,
    omitidas_por_limite: Math.max(0, elegiveis.length - limite),
    excluidas, conflitos_autoria, datas_invalidas,
  };
}

// O adaptador deve ordenar por ID estável. Limite defensivo explícito, nunca
// tratar resultado interrompido como histórico completo.
export async function coletarEvidenciasHumanas(
  buscarPagina: (inicio: number, fim: number) => Promise<Atividade[]>,
  autores: Record<string, NaturezaAutor>, limite = 50,
  buscarClickUp?: () => Promise<{ atividades: Atividade[]; completa: boolean; motivo: string | null }>,
) {
  const atividades: Atividade[] = [];
  let completa = false;
  for (let inicio = 0; inicio < 10000; inicio += 500) {
    const pagina = await buscarPagina(inicio, inicio + 499);
    atividades.push(...pagina);
    if (pagina.length < 500) { completa = true; break; }
  }
  const externos = buscarClickUp ? await buscarClickUp() : null;
  return {
    ...selecionarEvidenciasHumanas([...atividades, ...(externos?.atividades || [])], autores, limite),
    registros_consultados: atividades.length, cobertura_banco_completa: completa,
    fonte: externos ? 'atividades_negocio + ClickUp' : 'atividades_negocio',
    cobertura_clickup_completa: externos?.completa ?? false,
    cobertura_clickup: externos ? (externos.motivo || 'Comentarios principais consultados; respostas em threads e anexos externos não extraídos.') : 'Comentarios exclusivos do ClickUp nao consultados.',
    comentarios_clickup_consultados: externos?.atividades.length || 0,
  };
}


export function lerClassificacaoAutores(raw: string | undefined): Record<string, NaturezaAutor> {
  if (!raw) throw new Error("Classificação de autores ainda não configurada no servidor.");
  let autores;
  try { autores = JSON.parse(raw); }
  catch { throw new Error("Configuração de autores inválida."); }
  if (!autores || typeof autores !== "object" || Array.isArray(autores) ||
      Object.entries(autores).some(([id, tipo]) => !/^-?\d+$/.test(id) ||
        !["humano", "agente", "sistema", "desconhecido"].includes(String(tipo)))) {
    throw new Error("Configuração de autores inválida.");
  }
  return autores;
}
