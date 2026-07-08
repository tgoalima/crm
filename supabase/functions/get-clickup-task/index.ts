// Deno Edge Function: get-clickup-task
// Proxy seguro para obter informações de tarefas do ClickUp (Evita expor tokens da API no Frontend)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, PATCH",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const taskId = url.searchParams.get("task_id");

    if (!taskId) {
      return new Response(JSON.stringify({ error: "Parâmetro task_id é obrigatório." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!CLICKUP_API_TOKEN) {
      // Se não houver token configurado, retorna mock em desenvolvimento
      console.warn("CLICKUP_API_TOKEN não está configurado. Retornando dados simulados.");
      return new Response(
        JSON.stringify({
          name: `Projeto Simulado #${taskId}`,
          proposal_number: `PROP-${taskId.substring(0, 4).toUpperCase()}-2026`,
          custom_fields: []
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const clickupUrl = `https://api.clickup.com/api/v2/task/${taskId}`;
    console.log(`Buscando tarefa no ClickUp: ${clickupUrl}`);

    const response = await fetch(clickupUrl, {
      method: "GET",
      headers: {
        "Authorization": CLICKUP_API_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Erro ao buscar no ClickUp: ${response.status} - ${errText}`);
      
      // Fallback amigável se a tarefa não for encontrada ou houver falha de rede
      return new Response(
        JSON.stringify({
          name: `Negócio #${taskId}`,
          proposal_number: `PROPOSTA-${taskId.substring(0, 4).toUpperCase()}`,
          custom_fields: [],
          warning: "Dados simulados devido a falha de comunicação com ClickUp API."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const taskData = await response.json();
    
    // Tentar localizar um campo customizado contendo "proposta" ou "proposal"
    let proposalNumber = "";
    const customFields = taskData.custom_fields || [];
    
    for (const field of customFields) {
      const fieldName = (field.name || "").toLowerCase();
      if (fieldName.includes("proposta") || fieldName.includes("proposal") || fieldName.includes("numero")) {
        if (field.value !== undefined && field.value !== null) {
          proposalNumber = String(field.value);
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        name: taskData.name || `Tarefa #${taskId}`,
        proposal_number: proposalNumber || `PROP-${taskId.toUpperCase()}`,
        custom_fields: customFields
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Erro no processamento da Edge Function get-clickup-task:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
