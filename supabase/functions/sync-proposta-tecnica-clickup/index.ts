// supabase/functions/sync-proposta-tecnica-clickup/index.ts
//
// Dispara via Database Webhook no INSERT e DELETE de `propostas`.
//
// INSERT: Cria a tarefa "Enviar Proposta vX" no ClickUp como subtask
//         do negócio-pai, dentro da lista de negócios. O nome segue o
//         padrão "[NomeDaNegociação] — Enviar Proposta vX".
//
// DELETE: Exclui a tarefa técnica correspondente no ClickUp (evita
//         tarefas órfãs quando o usuário remove uma versão pelo CRM).
//
// Atribuição por Usuário: resolve o token pessoal do vendedor via
// criado_por_user_id → usuarios_clickup, com fallback para CLICKUP_API_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { resolveClickUpToken } from "../_shared/resolve-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

// Lista de Negócios no ClickUp (onde as subtasks são criadas)
const NEGOCIOS_LIST_ID = "901326185457";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record, old_record } = payload;

    if (table !== "propostas") {
      return new Response(
        JSON.stringify({ success: true, message: "Ignorado (tabela diferente)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ───────────────────────────────────────
    // DELETE: Excluir tarefa técnica no ClickUp
    // ───────────────────────────────────────
    if (type === "DELETE") {
      const deletedRecord = old_record || record;
      if (!deletedRecord?.clickup_proposta_tecnica_id) {
        return new Response(
          JSON.stringify({ success: true, message: "Sem tarefa técnica para excluir" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      const token = await resolveClickUpToken(deletedRecord.criado_por_user_id, supabase);
      const delRes = await fetch(
        `https://api.clickup.com/api/v2/task/${deletedRecord.clickup_proposta_tecnica_id}`,
        { method: "DELETE", headers: { Authorization: token } }
      );

      if (!delRes.ok) {
        console.error(`[sync-proposta-tecnica] Falha ao excluir tarefa ${deletedRecord.clickup_proposta_tecnica_id}: ${delRes.status}`);
      } else {
        console.log(`[sync-proposta-tecnica] Tarefa técnica ${deletedRecord.clickup_proposta_tecnica_id} excluída com sucesso.`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ───────────────────────────────────────
    // INSERT: Criar tarefa "Enviar Proposta vX"
    // ───────────────────────────────────────
    if (type !== "INSERT" || !record) {
      return new Response(
        JSON.stringify({ success: true, message: "Ignorado (não é INSERT)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Se já tem clickup_proposta_tecnica_id, já foi criada
    if (record.clickup_proposta_tecnica_id) {
      return new Response(
        JSON.stringify({ success: true, message: "Tarefa técnica já existe" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Buscar o negócio pai para obter clickup_negocio_id e nome
    const { data: negocio, error: negErr } = await supabase
      .from("negocios")
      .select("clickup_negocio_id, nome")
      .eq("clickup_negocio_id", record.clickup_negocio_id)
      .single();

    if (negErr || !negocio?.clickup_negocio_id) {
      console.warn(`[sync-proposta-tecnica] Negócio não encontrado para clickup_negocio_id=${record.clickup_negocio_id}. Tentando criar mesmo assim...`);
    }

    const parentTaskId = negocio?.clickup_negocio_id || record.clickup_negocio_id;
    if (!parentTaskId) {
      console.error(`[sync-proposta-tecnica] Sem clickup_negocio_id para vincular proposta ${record.id}`);
      return new Response(
        JSON.stringify({ success: false, message: "Sem clickup_negocio_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Resolver o token pessoal do vendedor
    const clickupToken = await resolveClickUpToken(record.criado_por_user_id, supabase);

    // Montar o nome da tarefa: "[Nome do Negócio] — Enviar Proposta vX"
    const nomeNegocio = negocio?.nome || "Negócio";
    const versao = record.versao || "vA";
    const taskName = `${nomeNegocio} — Enviar Proposta ${versao}`;

    // Criar a tarefa como subtask do negócio-pai
    const createRes = await fetch(`https://api.clickup.com/api/v2/list/${NEGOCIOS_LIST_ID}/task`, {
      method: "POST",
      headers: { Authorization: clickupToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: taskName,
        parent: parentTaskId,
        description: `Proposta ${versao} — Cenário: ${record.cenario || "N/A"}\nCriado por: ${record.criado_por || "CRM"}\n\nTotal: R$ ${record.total_proposta || "0,00"}`,
        status: "to do",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`[sync-proposta-tecnica] Falha ao criar tarefa: ${createRes.status} ${errText}`);

      // Atualizar status de erro na proposta
      await supabase
        .from("propostas")
        .update({ sync_status: "failed", sync_error: `ClickUp ${createRes.status}: ${errText}` })
        .eq("id", record.id);

      return new Response(
        JSON.stringify({ success: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const created = await createRes.json();
    const novoClickupId = created.id;

    // Salvar o clickup_proposta_tecnica_id na proposta
    const { error: updateErr } = await supabase
      .from("propostas")
      .update({ clickup_proposta_tecnica_id: novoClickupId })
      .eq("id", record.id);

    if (updateErr) {
      console.error(`[sync-proposta-tecnica] Tarefa criada (${novoClickupId}) mas falha no update: ${updateErr.message}`);
    } else {
      console.log(`[sync-proposta-tecnica] Tarefa "${taskName}" criada (${novoClickupId}) e vinculada à proposta ${record.id}.`);
    }

    return new Response(
      JSON.stringify({ success: true, clickup_proposta_tecnica_id: novoClickupId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[sync-proposta-tecnica] Erro:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
