// supabase/functions/sync-negocio-clickup/index.ts
// Dispara via Database Webhook no INSERT de `negocios` com clickup_negocio_id
// NULL. Cria a tarefa correspondente no ClickUp, vincula à Conta, e espelha
// o número de proposta que já foi gerado no Supabase (não gera nada aqui).
//
// Atribuição por Usuário: resolve o token pessoal do vendedor via
// criado_por_user_id → usuarios_clickup, com fallback para CLICKUP_API_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { resolveClickUpToken } from "../_shared/resolve-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

const NEGOCIOS_LIST_ID = "901326185457";
const CUSTOM_ITEM_ID_NEGOCIO = 1004;
const CF_ESTAGIO_VENDA = "c8d0abe2-c59f-4a9e-93ff-bd060659aa63";
const CF_TIPO_OPORTUNIDADE = "5d384245-0640-4621-a2dd-98370f7efa82";
const OPT_TIPO_PROJETO = "fa509e92-7528-4a8b-a9bc-11f2f5da3350";
const CF_CRM_ITEM_TYPE = "bc39138f-fe02-4480-9c08-f1a8a4eefd5d";
const OPT_CRM_ITEM_NEGOCIO = "cd6922b0-34f4-45e3-853a-cba995a2591c";
const CF_NUMERO_PROPOSTA = "c44cc05d-303f-47e2-b243-40c6b26b732f";

const ESTAGIO_NOME_PARA_ID: Record<string, string> = {
  "Registro": "3c4bcf81-91d3-40e7-97ae-a67b6bccea0c",
  "Qualificação": "1cc9d0c7-cbee-45ff-8bbe-ac4a29ec9f46",
  "Proposta": "5366c82c-2317-4978-8f4d-b41cb953be35",
  "Desenvolvimento": "97c5f286-e054-4351-b368-25977e8c429d",
  "Negociação": "4863ea9f-ccd7-4b49-9aa5-685ee479e091",
  "Termo de aceite": "22e91843-d067-4358-8238-6e619fc66653",
  "Ganho": "c59ad408-ae8e-45d7-804f-eb9e6cd2935b",
  "Perdido": "7520c5bc-95a4-47aa-8b12-0711f5bc9bfe",
  "Congelado": "c231299c-44f8-4f5e-ad8e-58f7b8e01213",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function marcarFalha(supabase: any, negocioId: string, mensagem: string) {
  console.error(`[sync-negocio-clickup] Falha no negócio ${negocioId}: ${mensagem}`);
  await supabase.from("negocios").update({ sync_status: "failed", sync_error: mensagem }).eq("id", negocioId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record } = payload;

    if (table !== "negocios" || type !== "INSERT" || !record || record.clickup_negocio_id) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (não é criação pendente de negócio)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLICKUP_API_TOKEN) {
      throw new Error("Variáveis de ambiente não configuradas (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/CLICKUP_API_TOKEN)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Buscar clickup_account_id da conta
    const { data: conta, error: contaErr } = await supabase
      .from("contas")
      .select("clickup_account_id")
      .eq("id", record.conta_id)
      .single();

    if (contaErr || !conta?.clickup_account_id) {
      await marcarFalha(supabase, record.id, `Conta não encontrada ou sem clickup_account_id (conta_id=${record.conta_id})`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 2) Resolver o token pessoal do vendedor (fallback: token global)
    const clickupToken = await resolveClickUpToken(record.criado_por_user_id, supabase);

    // 3) Criar a tarefa no ClickUp
    const estagioId = ESTAGIO_NOME_PARA_ID[record.estagio] || ESTAGIO_NOME_PARA_ID["Registro"];
    const customFields: Record<string, unknown>[] = [
      { id: CF_ESTAGIO_VENDA, value: estagioId },
      { id: CF_TIPO_OPORTUNIDADE, value: OPT_TIPO_PROJETO },
      { id: CF_CRM_ITEM_TYPE, value: OPT_CRM_ITEM_NEGOCIO },
    ];
    if (record.numero_proposta_oficial) {
      customFields.push({ id: CF_NUMERO_PROPOSTA, value: record.numero_proposta_oficial });
    }

    const createRes = await fetch(`https://api.clickup.com/api/v2/list/${NEGOCIOS_LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization: clickupToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: record.nome,
        custom_item_id: CUSTOM_ITEM_ID_NEGOCIO,
        custom_fields: customFields,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      await marcarFalha(supabase, record.id, `Falha ao criar tarefa no ClickUp: ${createRes.status} ${errText}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const created = await createRes.json();
    const novoClickupId = created.id;

    // 4) Vincular à Conta (não bloqueia — se falhar, o negócio já existe e fica sem vínculo visual no ClickUp)
    const linkRes = await fetch(`https://api.clickup.com/api/v2/task/${novoClickupId}/link/${conta.clickup_account_id}`, {
      method: "POST",
      headers: { Authorization: clickupToken },
    });
    if (!linkRes.ok) {
      console.error(`[sync-negocio-clickup] Falha ao vincular ${novoClickupId} -> ${conta.clickup_account_id}: ${linkRes.status}`);
    }

    // 4) Confirmar no Supabase
    const { error: updateErr } = await supabase
      .from("negocios")
      .update({ clickup_negocio_id: novoClickupId, sync_status: "synced" })
      .eq("id", record.id);

    if (updateErr) {
      await marcarFalha(supabase, record.id, `Tarefa ClickUp criada (id=${novoClickupId}) mas falha ao atualizar Supabase: ${updateErr.message}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    return new Response(JSON.stringify({ success: true, clickup_negocio_id: novoClickupId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[sync-negocio-clickup] Erro:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
