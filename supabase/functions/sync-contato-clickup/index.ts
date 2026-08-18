// supabase/functions/sync-contato-clickup/index.ts
// Dispara via Database Webhook no INSERT de `contatos` com clickup_contact_id
// NULL. Cria a tarefa correspondente no ClickUp e vincula à Conta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "";

const CONTATOS_LIST_ID = "901326185456";
const CF_EMAIL = "Email";
const CF_CARGO = "Cargo";
const CF_CELULAR = "Celular";
const CF_WHATSAPP = "WhatsApp";
const CF_CHAMPION = "Champion";
const CF_CRM_ITEM_TYPE = "bc39138f-fe02-4480-9c08-f1a8a4eefd5d";
const OPT_CRM_ITEM_CONTATO = "2be1fe2b-3db1-48d5-972f-abd5caa7c645";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function marcarFalha(supabase: any, contatoId: string, mensagem: string) {
  console.error(`[sync-contato-clickup] Falha no contato ${contatoId}: ${mensagem}`);
  await supabase.from("contatos").update({ sync_status: "failed", sync_error: mensagem }).eq("id", contatoId);
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
    console.error("[sync-contato-clickup] Falha ao descriptografar token pessoal:", e.message);
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

async function buscarCamposDaLista(): Promise<Map<string, string>> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${CONTATOS_LIST_ID}/field`, {
    headers: { Authorization: CLICKUP_API_TOKEN },
  });
  const data = await res.json();
  const map = new Map<string, string>();
  for (const f of data.fields || []) map.set(f.name, f.id);
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record } = payload;

    if (table !== "contatos" || type !== "INSERT" || !record || record.clickup_contact_id) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLICKUP_API_TOKEN) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const clickupToken = await resolveClickUpToken(supabase, record.criado_por_user_id);

    const { data: conta, error: contaErr } = await supabase
      .from("contas")
      .select("clickup_account_id")
      .eq("id", record.conta_id)
      .single();

    if (contaErr) {
      await marcarFalha(supabase, record.id, `Conta não encontrada (conta_id=${record.conta_id})`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }
    // A conta pode ainda estar com clickup_account_id NULL (criada há pouco pela SPA,
    // ainda não sincronizada) — não é motivo pra falhar, só não dá pra vincular ainda.

    const fieldIds = await buscarCamposDaLista();
    const customFields: Record<string, unknown>[] = [{ id: CF_CRM_ITEM_TYPE, value: OPT_CRM_ITEM_CONTATO }];
    const addField = (label: string, val: unknown) => {
      const id = fieldIds.get(label);
      if (id && val !== undefined && val !== null && val !== "") customFields.push({ id, value: val });
    };
    addField(CF_EMAIL, record.email);
    addField(CF_CARGO, record.cargo);
    addField(CF_CELULAR, record.celular);
    addField(CF_WHATSAPP, record.whatsapp);
    addField(CF_CHAMPION, !!record.champion);

    const createRes = await fetch(`https://api.clickup.com/api/v2/list/${CONTATOS_LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization: clickupToken, "Content-Type": "application/json" },
      body: JSON.stringify({ name: record.nome, custom_fields: customFields }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      await marcarFalha(supabase, record.id, `Falha ao criar tarefa no ClickUp: ${createRes.status} ${errText}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const created = await createRes.json();
    const novoClickupId = created.id;

    if (conta?.clickup_account_id) {
      const linkRes = await fetch(`https://api.clickup.com/api/v2/task/${novoClickupId}/link/${conta.clickup_account_id}`, {
        method: "POST",
        headers: { Authorization: clickupToken },
      });
      if (!linkRes.ok) {
        console.error(`[sync-contato-clickup] Falha ao vincular ${novoClickupId} -> ${conta.clickup_account_id}: ${linkRes.status}`);
      }
    } else {
      console.warn(`[sync-contato-clickup] Conta ${record.conta_id} ainda sem clickup_account_id — contato ${novoClickupId} criado sem vínculo.`);
    }

    const { error: updateErr } = await supabase
      .from("contatos")
      .update({ clickup_contact_id: novoClickupId, sync_status: "synced" })
      .eq("id", record.id);

    if (updateErr) {
      await marcarFalha(supabase, record.id, `Tarefa ClickUp criada (id=${novoClickupId}) mas falha ao atualizar Supabase: ${updateErr.message}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    return new Response(JSON.stringify({ success: true, clickup_contact_id: novoClickupId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[sync-contato-clickup] Erro:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
