// supabase/functions/sync-proposta-tecnica-clickup/index.ts
// Dispara via Database Webhook no INSERT de `propostas`. Cria (ou reaproveita)
// a lista técnica na pasta PRE-VENDAS/PROJETOS e a tarefa "Enviar Proposta vX"
// dentro dela, linkada de volta ao negócio de origem — porta pro CRM a
// automação que hoje roda como Google Apps Script no ClickUp. Não grava
// nada no Supabase: é uma ação só do lado do ClickUp.

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

async function getOrCreateListaTecnica(nome: string): Promise<string | null> {
  const listRes = await fetch(`https://api.clickup.com/api/v2/folder/${FOLDER_PROJETOS_ID}/list`, {
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  if (!listRes.ok) return null;
  const listData = await listRes.json();
  const existente = (listData.lists || []).find((l: any) => (l.name || "").trim() === nome);
  if (existente) return existente.id;

  const createRes = await fetch(`https://api.clickup.com/api/v2/folder/${FOLDER_PROJETOS_ID}/list`, {
    method: "POST",
    headers: { Authorization: CLICKUP_API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome }),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  return created.id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record } = payload;

    if (table !== "propostas" || type !== "INSERT" || !record) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (não é criação de proposta)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLICKUP_API_TOKEN) {
      throw new Error("Variáveis de ambiente não configuradas (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/CLICKUP_API_TOKEN)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // 3) Cria a tarefa técnica "Enviar Proposta vX"
    const nomeTarefa = `${PREFIX_TASK}${record.versao || ""}`.trim();
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

    // 4) Linka de volta ao negócio de origem (não bloqueia)
    if (negocio.clickup_negocio_id) {
      const linkRes = await fetch(`https://api.clickup.com/api/v2/task/${tarefaTecnicaId}/link/${normalizeId(negocio.clickup_negocio_id)}`, {
        method: "POST",
        headers: { Authorization: CLICKUP_API_TOKEN },
      });
      if (!linkRes.ok) {
        console.error(`[sync-proposta-tecnica-clickup] Falha ao vincular ${tarefaTecnicaId} -> ${negocio.clickup_negocio_id}: ${linkRes.status}`);
      }
    }

    return new Response(JSON.stringify({ success: true, lista_id: listaId, tarefa_tecnica_id: tarefaTecnicaId }), {
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
