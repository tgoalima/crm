// supabase/functions/sync-conta-clickup/index.ts
// Dispara via Database Webhook no INSERT de `contas` com clickup_account_id
// NULL. Cria a tarefa correspondente na lista Contas do ClickUp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "";

const CONTAS_LIST_ID = "901326185461";
const CUSTOM_ITEM_ID_CONTA = 1005;
const CF_CRM_ITEM_TYPE = "bc39138f-fe02-4480-9c08-f1a8a4eefd5d";
const OPT_CRM_ITEM_CONTA = "4e096a5b-96d7-4a40-baec-1fde61909cb0";
const CF_RAZAO_SOCIAL = "922c6189-1843-4039-90af-e45dd920cef4";
const CF_CNPJ = "599b82f5-c87e-4248-a5dc-724027a29130";
const CF_EMAIL = "0fe8980d-9591-4d36-974c-58d13d864352";
const CF_TELEFONE = "8e9075cd-05c8-4be5-aa44-5615c216c868";
const CF_CIDADE = "95dbcd56-ebc5-4196-89e0-48185328367e";
const CF_ESTADO = "1ee2496a-94f9-4962-82e8-035a5136efcc";
const CF_RUA = "e5e777af-7e38-4707-b2ad-b3fdbd5cf239";
const CF_CEP = "5c99dab5-3ee4-4071-b723-f17be8c94397";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function marcarFalha(supabase: any, contaId: string, mensagem: string) {
  console.error(`[sync-conta-clickup] Falha na conta ${contaId}: ${mensagem}`);
  await supabase.from("contas").update({ sync_status: "failed", sync_error: mensagem }).eq("id", contaId);
}

// ─────────────────────────────────────────────
// ATRIBUIÇÃO POR USUÁRIO — resolve com qual token do ClickUp sincronizar
// ─────────────────────────────────────────────
async function importDecryptionKey(): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(TOKEN_ENCRYPTION_KEY), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function decryptToken(encryptedB64: string, ivB64: string): Promise<string | null> {
  try {
    const key = await importDecryptionKey();
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    console.error("[sync-conta-clickup] Falha ao descriptografar token pessoal:", e.message);
    return null;
  }
}

async function resolveClickUpToken(supabase: any, criadoPorUserId: string | null | undefined): Promise<string> {
  if (!criadoPorUserId || !TOKEN_ENCRYPTION_KEY) return CLICKUP_API_TOKEN;
  const { data, error } = await supabase
    .from("usuarios_clickup")
    .select("token_encrypted, token_iv")
    .eq("user_id", criadoPorUserId)
    .maybeSingle();
  if (error || !data) return CLICKUP_API_TOKEN;
  const decrypted = await decryptToken(data.token_encrypted, data.token_iv);
  return decrypted || CLICKUP_API_TOKEN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record } = payload;

    if (table !== "contas" || type !== "INSERT" || !record || record.clickup_account_id) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (não é criação pendente de conta)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLICKUP_API_TOKEN) {
      throw new Error("Variáveis de ambiente não configuradas (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/CLICKUP_API_TOKEN)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const clickupToken = await resolveClickUpToken(supabase, record.criado_por_user_id);

    // 1) Criar a tarefa no ClickUp
    const customFields: Record<string, unknown>[] = [
      { id: CF_CRM_ITEM_TYPE, value: OPT_CRM_ITEM_CONTA },
    ];
    const addField = (id: string, val: unknown) => {
      if (val !== undefined && val !== null && val !== "") customFields.push({ id, value: val });
    };
    addField(CF_RAZAO_SOCIAL, record.razao_social);
    addField(CF_CNPJ, record.cnpj);
    addField(CF_EMAIL, record.email);
    addField(CF_TELEFONE, record.telefone);
    addField(CF_CIDADE, record.cidade);
    addField(CF_ESTADO, record.estado);
    addField(CF_RUA, record.rua);
    addField(CF_CEP, record.cep);

    const createRes = await fetch(`https://api.clickup.com/api/v2/list/${CONTAS_LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization: clickupToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: record.nome,
        custom_item_id: CUSTOM_ITEM_ID_CONTA,
        status: record.status || "customer base",
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

    // 2) Confirmar no Supabase
    const { error: updateErr } = await supabase
      .from("contas")
      .update({ clickup_account_id: novoClickupId, sync_status: "synced" })
      .eq("id", record.id);

    if (updateErr) {
      await marcarFalha(supabase, record.id, `Tarefa ClickUp criada (id=${novoClickupId}) mas falha ao atualizar Supabase: ${updateErr.message}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    return new Response(JSON.stringify({ success: true, clickup_account_id: novoClickupId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[sync-conta-clickup] Erro:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
