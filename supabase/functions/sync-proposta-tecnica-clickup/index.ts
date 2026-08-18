// supabase/functions/sync-proposta-tecnica-clickup/index.ts
// Dispara via Database Webhook no INSERT e no DELETE de `propostas`. No
// INSERT, cria (ou reaproveita) a lista técnica na pasta PRE-VENDAS/PROJETOS
// e a tarefa "Enviar Proposta vX" dentro dela, linkada de volta ao negócio de
// origem — porta pro CRM a automação que hoje roda como Google Apps Script
// no ClickUp. No DELETE, remove a tarefa técnica correspondente à versão
// excluída no CRM (o usuário reportou ter que apagar manualmente no ClickUp
// depois de excluir uma versão pelo CRM).
//
// Autocorreção de versão: para negócios que já eram controlados manualmente
// pelo ClickUp antes do CRM existir, o contador de versão do Supabase
// (propostas.versao) pode estar atrasado em relação ao que já existe na
// lista técnica (ex: CRM calcula "vB", mas o ClickUp já tem até "vH").
// Antes de criar a tarefa, checamos a maior versão já existente na lista
// técnica e, se for maior ou igual à calculada pelo CRM, pulamos direto
// para a próxima depois dela — e corrigimos `propostas.versao` no Supabase
// para bater com o que foi realmente usado, sincronizando os dois lados daí
// em diante sem precisar de ajuste manual.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

const FOLDER_PROJETOS_ID = "90134052120";
const TECH_CUSTOM_ITEM_ID = 1014;
const PREFIX_TASK = "Enviar Proposta ";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeId(id: unknown): string {
  return String(id || "").replace("#", "").trim();
}

// Letras de versão como coluna de planilha: A=1, Z=26, AA=27, AB=28... —
// permite comparar/gerar "próxima versão" corretamente mesmo além de Z.
function letterRank(letters: string): number {
  let rank = 0;
  for (const ch of letters.toUpperCase()) {
    const code = ch.charCodeAt(0) - 64; // A=1
    if (code < 1 || code > 26) continue;
    rank = rank * 26 + code;
  }
  return rank;
}

function rankToLetters(rank: number): string {
  let s = "";
  let n = rank;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

// Maior letra de versão já existente entre as tarefas "Enviar Proposta vX"
// da lista técnica (0 se a lista estiver vazia ou não tiver nenhuma).
async function getMaxVersionRankInList(listaId: string): Promise<number> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listaId}/task?include_closed=true`, {
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  const tasks = data.tasks || [];
  const re = /^Enviar Proposta\s+v([A-Za-z]+)/i;
  let maxRank = 0;
  for (const t of tasks) {
    const m = (t.name || "").match(re);
    if (m) {
      const rank = letterRank(m[1]);
      if (rank > maxRank) maxRank = rank;
    }
  }
  return maxRank;
}

// Procura a lista técnica pelo nome sem criar — usado no fluxo de exclusão,
// onde não faz sentido criar uma lista só pra constatar que não há nada
// nela pra apagar.
async function findListaTecnica(nome: string): Promise<string | null> {
  const listRes = await fetch(`https://api.clickup.com/api/v2/folder/${FOLDER_PROJETOS_ID}/list`, {
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  if (!listRes.ok) return null;
  const listData = await listRes.json();
  const existente = (listData.lists || []).find((l: any) => (l.name || "").trim() === nome);
  return existente ? existente.id : null;
}

async function getOrCreateListaTecnica(nome: string): Promise<string | null> {
  const existenteId = await findListaTecnica(nome);
  if (existenteId) return existenteId;

  const createRes = await fetch(`https://api.clickup.com/api/v2/folder/${FOLDER_PROJETOS_ID}/list`, {
    method: "POST",
    headers: { Authorization: CLICKUP_API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome }),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  return created.id || null;
}

// Acha o id da tarefa "Enviar Proposta vX" (match exato, sem contar espaços
// extras) dentro da lista técnica — usado no fluxo de exclusão.
async function findTarefaVersao(listaId: string, versao: string): Promise<string | null> {
  const nomeAlvo = `${PREFIX_TASK}${versao}`.trim().toLowerCase();
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listaId}/task?include_closed=true`, {
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tasks = data.tasks || [];
  const found = tasks.find((t: any) => (t.name || "").trim().toLowerCase() === nomeAlvo);
  return found ? found.id : null;
}

// Fluxo de exclusão: apaga a tarefa técnica "Enviar Proposta vX"
// correspondente à proposta excluída no CRM. Nunca apaga a lista técnica
// inteira (pode ter outras tarefas/subtarefas do projeto) — só a tarefa
// dessa versão específica.
async function handleDelete(supabase: ReturnType<typeof createClient>, oldRecord: any): Promise<Response> {
  if (!oldRecord) {
    return new Response(JSON.stringify({ success: true, message: "Ignorado (sem old_record no DELETE)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  const idLimpo = normalizeId(oldRecord.clickup_negocio_id);
  const idComHash = "#" + idLimpo;
  const { data: negocio, error: negocioErr } = await supabase
    .from("negocios")
    .select("nome, numero_proposta_oficial")
    .or(`clickup_negocio_id.eq.${idLimpo},clickup_negocio_id.eq.${idComHash}`)
    .limit(1)
    .maybeSingle();

  if (negocioErr || !negocio || !negocio.numero_proposta_oficial) {
    console.warn(`[sync-proposta-tecnica-clickup] DELETE ignorado — negócio não encontrado ou sem número de proposta (clickup_negocio_id=${oldRecord.clickup_negocio_id}).`);
    return new Response(JSON.stringify({ success: true, message: "Ignorado (negócio sem número de proposta)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  const nomeLista = `${negocio.numero_proposta_oficial} - ${negocio.nome}`;
  const listaId = await findListaTecnica(nomeLista);
  if (!listaId) {
    console.warn(`[sync-proposta-tecnica-clickup] DELETE ignorado — lista técnica "${nomeLista}" não existe.`);
    return new Response(JSON.stringify({ success: true, message: "Ignorado (lista técnica não existe)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  const tarefaId = await findTarefaVersao(listaId, String(oldRecord.versao || ""));
  if (!tarefaId) {
    console.warn(`[sync-proposta-tecnica-clickup] DELETE ignorado — tarefa "${PREFIX_TASK}${oldRecord.versao}" não encontrada na lista "${nomeLista}".`);
    return new Response(JSON.stringify({ success: true, message: "Ignorado (tarefa técnica não encontrada)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  const delRes = await fetch(`https://api.clickup.com/api/v2/task/${tarefaId}`, {
    method: "DELETE",
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  if (!delRes.ok && delRes.status !== 404) {
    const errText = await delRes.text();
    console.error(`[sync-proposta-tecnica-clickup] Falha ao excluir tarefa técnica ${tarefaId}: ${delRes.status} ${errText}`);
    return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }

  return new Response(JSON.stringify({ success: true, tarefa_tecnica_excluida: tarefaId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record, old_record } = payload;

    if (table !== "propostas" || (type !== "INSERT" && type !== "DELETE")) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (não é criação/exclusão de proposta)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLICKUP_API_TOKEN) {
      throw new Error("Variáveis de ambiente não configuradas (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/CLICKUP_API_TOKEN)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (type === "DELETE") {
      return await handleDelete(supabase, old_record);
    }
    if (!record) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (sem record no INSERT)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 1) Achar o negócio de origem (pelo clickup_negocio_id, normalizando '#')
    const idLimpo = normalizeId(record.clickup_negocio_id);
    const idComHash = "#" + idLimpo;
    const { data: negocio, error: negocioErr } = await supabase
      .from("negocios")
      .select("nome, numero_proposta_oficial, clickup_negocio_id")
      .or(`clickup_negocio_id.eq.${idLimpo},clickup_negocio_id.eq.${idComHash}`)
      .limit(1)
      .maybeSingle();

    if (negocioErr || !negocio || !negocio.numero_proposta_oficial) {
      console.warn(`[sync-proposta-tecnica-clickup] Ignorado — negócio não encontrado ou sem número de proposta (clickup_negocio_id=${record.clickup_negocio_id}).`);
      return new Response(JSON.stringify({ success: true, message: "Ignorado (negócio sem número de proposta)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2) Nome da lista técnica e get-or-create
    const nomeLista = `${negocio.numero_proposta_oficial} - ${negocio.nome}`;
    const listaId = await getOrCreateListaTecnica(nomeLista);
    if (!listaId) {
      console.error(`[sync-proposta-tecnica-clickup] Falha ao obter/criar lista técnica "${nomeLista}".`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 3) Autocorreção: compara a versão calculada pelo CRM com a maior já
    // existente na lista técnica (relevante para negócios que já eram
    // controlados manualmente pelo ClickUp antes do CRM existir).
    const versaoLetrasCrm = String(record.versao || "").replace(/^v/i, "");
    const rankCrm = letterRank(versaoLetrasCrm) || 1;
    const maxRankClickUp = await getMaxVersionRankInList(listaId);
    const rankFinal = maxRankClickUp >= rankCrm ? maxRankClickUp + 1 : rankCrm;
    const versaoFinal = "v" + rankToLetters(rankFinal);

    // 4) Cria a tarefa técnica "Enviar Proposta vX"
    const nomeTarefa = `${PREFIX_TASK}${versaoFinal}`.trim();
    const createRes = await fetch(`https://api.clickup.com/api/v2/list/${listaId}/task`, {
      method: "POST",
      headers: { Authorization: CLICKUP_API_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ name: nomeTarefa, custom_item_id: TECH_CUSTOM_ITEM_ID }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`[sync-proposta-tecnica-clickup] Falha ao criar tarefa técnica: ${createRes.status} ${errText}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const createdTask = await createRes.json();
    const tarefaTecnicaId = createdTask.id;

    // 5) Se a versão usada divergiu da calculada pelo CRM (lista técnica
    // estava à frente), corrige `propostas.versao` no Supabase para bater
    // com o que foi de fato criado no ClickUp — sincroniza os dois lados
    // e evita o mesmo desalinhamento na próxima versão deste negócio.
    if (versaoFinal !== record.versao && record.id) {
      const { error: updErr } = await supabase.from("propostas").update({ versao: versaoFinal }).eq("id", record.id);
      if (updErr) {
        console.error(`[sync-proposta-tecnica-clickup] Falha ao corrigir versao no Supabase (id=${record.id}): ${updErr.message}`);
      } else {
        console.log(`[sync-proposta-tecnica-clickup] Versão corrigida de "${record.versao}" para "${versaoFinal}" (proposta id=${record.id}) para bater com o ClickUp.`);
      }
    }

    // 6) Linka de volta ao negócio de origem (não bloqueia)
    if (negocio.clickup_negocio_id) {
      const linkRes = await fetch(`https://api.clickup.com/api/v2/task/${tarefaTecnicaId}/link/${normalizeId(negocio.clickup_negocio_id)}`, {
        method: "POST",
        headers: { Authorization: CLICKUP_API_TOKEN },
      });
      if (!linkRes.ok) {
        console.error(`[sync-proposta-tecnica-clickup] Falha ao vincular ${tarefaTecnicaId} -> ${negocio.clickup_negocio_id}: ${linkRes.status}`);
      }
    }

    return new Response(JSON.stringify({ success: true, lista_id: listaId, tarefa_tecnica_id: tarefaTecnicaId, versao: versaoFinal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[sync-proposta-tecnica-clickup] Erro:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
