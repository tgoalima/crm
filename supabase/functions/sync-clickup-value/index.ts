// Deno Edge Function: sync-clickup-value
// Escuta o Database Webhook do Supabase para sincronizar o total da proposta selecionada no ClickUp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN");
const CLICKUP_CUSTOM_FIELD_ID = Deno.env.get("CLICKUP_CUSTOM_FIELD_ID");
const CLICKUP_PROPOSTA_FIELD_ID = Deno.env.get("CLICKUP_PROPOSTA_FIELD_ID");

serve(async (req) => {
  // Configuração de CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, PATCH",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      }
    });
  }

  try {
    const payload = await req.json();
    console.log("Recebido Database Webhook Payload:", JSON.stringify(payload, null, 2));

    const { type, table, record, old_record } = payload;

    // Validar se o evento é uma atualização/inserção de proposta para o status 'Selecionada'
    if (
      table === "propostas" &&
      record &&
      record.situacao === "Selecionada" &&
      (!old_record || old_record.situacao !== "Selecionada")
    ) {
      const taskId = record.clickup_negocio_id;
      const totalProposta = parseFloat(record.total_proposta) || 0;

      console.log(`Proposta ${record.versao} de ID ${record.id} foi selecionada.`);
      
      if (totalProposta === null || totalProposta === undefined || isNaN(totalProposta) || totalProposta <= 0) {
        console.warn(`[${new Date().toISOString()}] Valor da proposta ${record.versao} de ID ${record.id} é nulo, inválido ou zero (R$ ${totalProposta}). Ignorando sincronização com ClickUp para evitar sobrescrita.`);
        return new Response(JSON.stringify({ success: true, message: "Valor inválido ou zero, ignorando sincronização" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      console.log(`Sincronizando valor R$ ${totalProposta} (centavos) e versão ${record.versao} na tarefa ClickUp ${taskId}...`);

      if (!CLICKUP_API_TOKEN || !CLICKUP_CUSTOM_FIELD_ID) {
        throw new Error("Variáveis de ambiente CLICKUP_API_TOKEN ou CLICKUP_CUSTOM_FIELD_ID não configuradas no Supabase.");
      }

      const valorCentavos = Math.round(totalProposta * 100);

      // Método 1: Tentar atualizar usando o endpoint direto de Custom Fields do ClickUp (Recomendado)
      const clickupValueUrl = `https://api.clickup.com/api/v2/task/${taskId}/field/${CLICKUP_CUSTOM_FIELD_ID}`;
      
      const bodyValue = {
        value: valorCentavos
      };
      
      console.log(`[${new Date().toISOString()}] POST ${clickupValueUrl} - Body: ${JSON.stringify(bodyValue)}`);
      
      const responseValue = await fetch(clickupValueUrl, {
        method: "POST",
        headers: {
          "Authorization": CLICKUP_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyValue),
      });

      let responsePropostaOk = true;
      if (CLICKUP_PROPOSTA_FIELD_ID) {
        const clickupPropostaUrl = `https://api.clickup.com/api/v2/task/${taskId}/field/${CLICKUP_PROPOSTA_FIELD_ID}`;
        const bodyProposta = {
          value: record.versao
        };
        console.log(`[${new Date().toISOString()}] POST ${clickupPropostaUrl} - Body: ${JSON.stringify(bodyProposta)}`);
        const responseProposta = await fetch(clickupPropostaUrl, {
          method: "POST",
          headers: {
            "Authorization": CLICKUP_API_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bodyProposta),
        });
        responsePropostaOk = responseProposta.ok;
      }

      if (!responseValue.ok || !responsePropostaOk) {
        console.error(`Erro ao atualizar custom field(s). Status valor: ${responseValue.status}. Tentando fallback...`);
        
        // Método 2 (Fallback): Tentar atualizar via PATCH direto no array da tarefa
        console.log("Tentando método alternativo via PATCH /task...");
        const clickupTaskUrl = `https://api.clickup.com/api/v2/task/${taskId}`;
        
        const patchBody = {
          custom_fields: [
            {
              id: CLICKUP_CUSTOM_FIELD_ID,
              value: valorCentavos
            },
            ...(CLICKUP_PROPOSTA_FIELD_ID ? [{
              id: CLICKUP_PROPOSTA_FIELD_ID,
              value: record.versao
            }] : [])
          ]
        };
        
        console.log(`[${new Date().toISOString()}] PATCH ${clickupTaskUrl} - Body: ${JSON.stringify(patchBody)}`);

        const responseTask = await fetch(clickupTaskUrl, {
          method: "PATCH",
          headers: {
            "Authorization": CLICKUP_API_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patchBody),
        });

        if (!responseTask.ok) {
          const errTaskText = await responseTask.text();
          throw new Error(`Falha no ClickUp em ambos os métodos. Retorno do PATCH: ${responseTask.status} - ${errTaskText}`);
        }
      }

      // Validação pós-POST na Edge Function
      try {
        const verifyUrl = `https://api.clickup.com/api/v2/task/${taskId}`;
        console.log(`[${new Date().toISOString()}] Iniciando verificação GET pós-POST na Edge Function para tarefa ${taskId}...`);
        const verifyRes = await fetch(verifyUrl, {
          headers: {
            "Authorization": CLICKUP_API_TOKEN,
            "Content-Type": "application/json",
          }
        });
        if (verifyRes.ok) {
          const verifyTask = await verifyRes.json();
          const verifyField = verifyTask.custom_fields?.find((f: any) => f.id === CLICKUP_CUSTOM_FIELD_ID);
          const valorRetornado = verifyField ? verifyField.value : null;
          console.log(`[${new Date().toISOString()}] [EDGE FUNCTION VALIDAÇÃO] Tarefa ${taskId}: Valor retornado no ClickUp = ${valorRetornado} (Esperado: ${valorCentavos})`);
          if (taskId === '86ahby7wm') {
            console.log(`[${new Date().toISOString()}] [EDGE FUNCTION DETECTOR 86ahby7wm] Valor retornado pós-POST no ClickUp: ${valorRetornado}`);
          }
        } else {
          console.error(`[${new Date().toISOString()}] Falha ao realizar GET pós-POST na Edge Function para tarefa ${taskId}. Status: ${verifyRes.status}`);
        }
      } catch (verifyErr: any) {
        console.error(`[${new Date().toISOString()}] Erro ao verificar pós-POST na Edge Function:`, verifyErr.message);
      }

      console.log(`Valor de R$ ${totalProposta} (centavos: ${valorCentavos}) e versão ${record.versao} sincronizados com sucesso na tarefa ${taskId} do ClickUp.`);
      
      return new Response(JSON.stringify({ success: true, message: "Valor e versão sincronizados com sucesso" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Webhook ignorado (situação não é 'Selecionada' ou não alterada)" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Erro no processamento do webhook:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
