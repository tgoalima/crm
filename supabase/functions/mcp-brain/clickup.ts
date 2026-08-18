// Helpers de ClickUp usados pelo MCP server para resolver "cliente" (não existe
// tabela clientes/contas no Supabase hoje — mora só na lista "Contas" do ClickUp).
// Porta em TypeScript da lógica já validada em scripts/migracao_agendor_perdidos.py
// (normalize_name / load_contas_map / match_conta).

const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";
const CONTAS_LIST_ID = "901326185461";
const NEGOCIOS_LIST_ID = "901326185457";

// Mesmos IDs de custom field usados em app.js (DEAL_VALUE_FIELD_ID) e
// scripts/migracao_agendor_perdidos.py (CF_ESTAGIO_VENDA / CF_DEAL_VALUE).
const CF_ESTAGIO_VENDA = "c8d0abe2-c59f-4a9e-93ff-bd060659aa63";
const CF_DEAL_VALUE = "ee65221a-029d-4d0a-a981-b71b5a29b4b4";

// Opções do dropdown "Estágio da Venda" (na mesma ordem do orderindex do
// ClickUp) — necessário porque o valor do campo pode vir como o ID da opção
// OU como o orderindex numérico, dependendo do endpoint/versão da API do
// ClickUp (mesma ambiguidade tratada em getTaskOptionId no app.js).
const ESTAGIO_OPTIONS = [
  { id: "3c4bcf81-91d3-40e7-97ae-a67b6bccea0c", nome: "Registro" },
  { id: "1cc9d0c7-cbee-45ff-8bbe-ac4a29ec9f46", nome: "Qualificação" },
  { id: "5366c82c-2317-4978-8f4d-b41cb953be35", nome: "Proposta" },
  { id: "97c5f286-e054-4351-b368-25977e8c429d", nome: "Desenvolvimento" },
  { id: "4863ea9f-ccd7-4b49-9aa5-685ee479e091", nome: "Negociação" },
  { id: "22e91843-d067-4358-8238-6e619fc66653", nome: "Termo de aceite" },
  { id: "c59ad408-ae8e-45d7-804f-eb9e6cd2935b", nome: "Ganho" },
  { id: "7520c5bc-95a4-47aa-8b12-0711f5bc9bfe", nome: "Perdido" },
  { id: "c231299c-44f8-4f5e-ad8e-58f7b8e01213", nome: "Congelado" },
];
export const ESTAGIOS_FORA_DO_PIPELINE = new Set(["Ganho", "Perdido", "Congelado"]);

function resolveEstagioNome(rawValue: unknown): string | null {
  if (rawValue === undefined || rawValue === null) return null;
  const valStr = String(Array.isArray(rawValue) ? rawValue[0] : rawValue);
  const byId = ESTAGIO_OPTIONS.find((o) => o.id === valStr);
  if (byId) return byId.nome;
  const idx = parseInt(valStr, 10);
  if (!isNaN(idx) && ESTAGIO_OPTIONS[idx]) return ESTAGIO_OPTIONS[idx].nome;
  const byName = ESTAGIO_OPTIONS.find((o) => o.nome.toLowerCase() === valStr.toLowerCase());
  return byName ? byName.nome : null;
}

export async function clickupGet(endpoint: string): Promise<any | null> {
  const res = await fetch(`https://api.clickup.com/api/v2/${endpoint}`, {
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  if (!res.ok) {
    console.error(`[ClickUp] GET ${endpoint} -> HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

const ACCENT_REGEX = new RegExp("[̀-ͯ]", "g"); // marcas de acento combinantes (pós NFKD)
const STOPWORD_REGEX = /\b(ltda|s\/a|sa|eireli|me|epp|inc|comercial|industrial)\b/g;
const PUNCT_REGEX = /[./\-,()[\]]/g;

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  let n = s.toLowerCase().trim();
  n = n.normalize("NFKD").replace(ACCENT_REGEX, ""); // remove acentos
  n = n.replace(PUNCT_REGEX, " ");
  n = n.replace(STOPWORD_REGEX, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

interface ContasCache {
  map: Map<string, string>;
  loadedAt: number;
}

let contasCache: ContasCache | null = null;
const CONTAS_CACHE_TTL_MS = 5 * 60 * 1000;

export async function loadContasMap(): Promise<Map<string, string>> {
  if (contasCache && Date.now() - contasCache.loadedAt < CONTAS_CACHE_TTL_MS) {
    return contasCache.map;
  }
  const map = new Map<string, string>();
  let page = 0;
  while (true) {
    const res = await clickupGet(`list/${CONTAS_LIST_ID}/task?include_closed=true&page=${page}`);
    if (!res?.tasks?.length) break;
    for (const t of res.tasks) {
      map.set(normalizeName(t.name), t.id);
    }
    page++;
  }
  contasCache = { map, loadedAt: Date.now() };
  return map;
}

export function matchConta(
  nomeCliente: string,
  contasMap: Map<string, string>,
): { id: string; nome: string } | null {
  const norm = normalizeName(nomeCliente);
  if (!norm) return null;
  if (contasMap.has(norm)) {
    return { id: contasMap.get(norm)!, nome: nomeCliente };
  }
  for (const [nomeNorm, id] of contasMap) {
    if (nomeNorm && (nomeNorm.includes(norm) || norm.includes(nomeNorm))) {
      return { id, nome: nomeNorm };
    }
  }
  return null;
}

export async function getLinkedTaskIds(taskId: string): Promise<string[]> {
  const task = await clickupGet(`task/${taskId}`);
  const linked = task?.linked_tasks || [];
  // A API do ClickUp guarda cada link com dois campos (`task_id`/`link_id`),
  // mas qual dos dois é "esta tarefa" vs "a outra ponta" depende de qual lado
  // criou o link primeiro — não é fixo por tipo de tarefa (confirmado ao vivo:
  // numa Conta o self apareceu em task_id; num Negócio, em link_id). Por
  // segurança, comparamos os dois contra o próprio ID e pegamos o que não bate.
  return linked
    .map((l: any) => (l.task_id === taskId ? l.link_id : l.link_id === taskId ? l.task_id : l.task_id))
    .filter(Boolean);
}

export interface NegocioInfo {
  id: string;
  nome: string;
  estagio: string | null;
  valorClickupFallback: number | null;
}

function taskToNegocioInfo(t: any): NegocioInfo {
  const customFields = t.custom_fields || [];
  const estagioField = customFields.find((f: any) => f.id === CF_ESTAGIO_VENDA);
  const estagio = resolveEstagioNome(estagioField?.value);

  const valorField = customFields.find((f: any) => f.id === CF_DEAL_VALUE);
  const valorClickupFallback =
    valorField?.value !== undefined && valorField?.value !== null && !isNaN(Number(valorField.value))
      ? Number(valorField.value)
      : null;

  return { id: t.id, nome: t.name, estagio, valorClickupFallback };
}

// Todas as tarefas da lista Negócios, com o estágio (custom field "Estágio da
// Venda") já resolvido — Registro/Qualificação/.../Ganho/Perdido/Congelado.
// Base para replicar tanto o funil ativo (resumo_forecast) quanto as listas
// de negócios fechados (negocios_fechados), igual ao Kanban do SPA (app.js:
// ForecastFunnelPanel e DealsListView usam exatamente esse mesmo campo).
export async function loadTodosNegocios(): Promise<NegocioInfo[]> {
  const negocios: NegocioInfo[] = [];
  let page = 0;
  while (true) {
    const res = await clickupGet(`list/${NEGOCIOS_LIST_ID}/task?include_closed=true&page=${page}`);
    if (!res?.tasks?.length) break;
    for (const t of res.tasks) negocios.push(taskToNegocioInfo(t));
    page++;
  }
  return negocios;
}

export async function getNegocioInfo(taskId: string): Promise<NegocioInfo | null> {
  const t = await clickupGet(`task/${taskId}`);
  if (!t) return null;
  return taskToNegocioInfo(t);
}
