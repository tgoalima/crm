// supabase/functions/sync-negocio-clickup/index.ts
// Dispara via Database Webhook no INSERT de `negocios` com clickup_negocio_id
// NULL. Cria a tarefa correspondente no ClickUp, vincula à Conta, e espelha
// o número de proposta que já foi gerado no Supabase (não gera nada aqui).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "";

const NEGOCIOS_LIST_ID = "901326185457";
const CUSTOM_ITEM_ID_NEGOCIO = 1004;
const CF_ESTAGIO_VENDA = "c8d0abe2-c59f-4a9e-93ff-bd060659aa63";
const CF_TIPO_OPORTUNIDADE = "5d384245-0640-4621-a2dd-98370f7efa82";
const OPT_TIPO_PROJETO = "fa509e92-7528-4a8b-a9bc-11f2f5da3350";
const CF_CRM_ITEM_TYPE = "bc39138f-fe02-4480-9c08-f1a8a4eefd5d";
const OPT_CRM_ITEM_NEGOCIO = "cd6922b0-34f4-45e3-853a-cba995a2591c";
const CF_NUMERO_PROPOSTA = "c44cc05d-303f-47e2-b243-40c6b26b732f";
const CF_VALOR = "ee65221a-029d-4d0a-a981-b71b5a29b4b4";
const CF_PROBABILIDADE = "2c667b12-79c6-4949-b995-5c3938e7ff51";

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

const TIPO_OPORTUNIDADE_CLICKUP: Record<string, string> = {
  "Projeto": "fa509e92-7528-4a8b-a9bc-11f2f5da3350",
  "Garantias": "52b4285a-1e92-4ecb-b8b9-7a2348461882",
  "Serviços": "2e351ad7-2af5-4532-be83-fe24423a1994",
  "SSU": "62c6d78c-fa67-44d8-b594-66ed63264df1",
  "Volumes": "62f161bc-b78b-46b7-a73b-1d8faa1a1246",
  "Upgrade": "e55ef41f-51e6-436e-bb53-79ff688960c7",
};

const RO_CLICKUP_IDS: Record<string, string> = {
  roInfra: "673b8e3f-f6b2-4b09-b536-fe881b9e5780",
  roSw1: "769281a2-dade-47ae-8867-453fbac6adb3",
  roSw2: "e1a271ac-107d-4131-b63c-87dfb2e2396d",
  roSw3: "a940746a-b869-4bb7-8f7c-81775c169022",
  roSw4: "cf2a09b3-a85a-43cb-8e2e-0f1bdfc243f5",
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
    console.error("[sync-negocio-clickup] Falha ao descriptografar token pessoal:", e.message);
    return null;
  }
}

// Token pessoal de quem criou o registro (criado_por_user_id), se existir
// e estiver salvo em usuarios_clickup; senão cai pro token de serviço
// global — nunca falha a sincronização por causa disso.
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
    const clickupToken = await resolveClickUpToken(supabase, record.criado_por_user_id);

    // 1) Buscar clickup_account_id da conta
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
    // ainda não sincronizada com o ClickUp — mesmo padrão async deste negócio). Não é
    // motivo pra falhar: cria a tarefa do negócio mesmo assim, só não dá pra vincular
    // à tarefa da conta ainda (o passo de vínculo já é não-bloqueante logo abaixo).

    // 2) Criar a tarefa no ClickUp
    const estagioId = ESTAGIO_NOME_PARA_ID[record.estagio] || ESTAGIO_NOME_PARA_ID["Registro"];
    const tipoId = TIPO_OPORTUNIDADE_CLICKUP[record.tipo_oportunidade] || OPT_TIPO_PROJETO;
    const customFields: Record<string, unknown>[] = [
      { id: CF_ESTAGIO_VENDA, value: estagioId },
      { id: CF_TIPO_OPORTUNIDADE, value: tipoId },
      { id: CF_CRM_ITEM_TYPE, value: OPT_CRM_ITEM_NEGOCIO },
    ];
    if (record.numero_proposta_oficial) {
      customFields.push({ id: CF_NUMERO_PROPOSTA, value: record.numero_proposta_oficial });
    }
    if (record.valor_clickup_fallback) {
      customFields.push({ id: CF_VALOR, value: record.valor_clickup_fallback });
    }
    if (record.probabilidade) {
      customFields.push({ id: CF_PROBABILIDADE, value: record.probabilidade });
    }
    const RO_COLUNAS: Record<string, string> = {
      roInfra: "ro_infra",
      roSw1: "ro_sw1",
      roSw2: "ro_sw2",
      roSw3: "ro_sw3",
      roSw4: "ro_sw4",
    };
    for (const [campo, cfId] of Object.entries(RO_CLICKUP_IDS)) {
      const valor = record[RO_COLUNAS[campo]];
      if (valor) customFields.push({ id: cfId, value: valor });
    }

    const createBody: Record<string, unknown> = {
      name: record.nome,
      custom_item_id: CUSTOM_ITEM_ID_NEGOCIO,
      custom_fields: customFields,
    };
    if (record.descricao) createBody.description = record.descricao;
    if (record.data_previsao) {
      createBody.due_date = new Date(`${record.data_previsao}T12:00:00Z`).getTime();
    }

    const createRes = await fetch(`https://api.clickup.com/api/v2/list/${NEGOCIOS_LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization: clickupToken, "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      await marcarFalha(supabase, record.id, `Falha ao criar tarefa no ClickUp: ${createRes.status} ${errText}`);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const created = await createRes.json();
    const novoClickupId = created.id;

    // 3) Vincular à Conta (não bloqueia — se falhar ou a conta ainda não tiver
    // clickup_account_id, o negócio já existe e fica sem vínculo visual no ClickUp)
    if (conta?.clickup_account_id) {
      const linkRes = await fetch(`https://api.clickup.com/api/v2/task/${novoClickupId}/link/${conta.clickup_account_id}`, {
        method: "POST",
        headers: { Authorization: clickupToken },
      });
      if (!linkRes.ok) {
        console.error(`[sync-negocio-clickup] Falha ao vincular ${novoClickupId} -> ${conta.clickup_account_id}: ${linkRes.status}`);
      }
    } else {
      console.warn(`[sync-negocio-clickup] Conta ${record.conta_id} ainda sem clickup_account_id — negócio ${novoClickupId} criado sem vínculo.`);
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
