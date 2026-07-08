// Deno Edge Function: clickup-status-webhook
// Escuta webhooks de alteração de status do ClickUp e impede conclusão ("Ganho") se não houver exatamente 1 proposta Selecionada

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

serve(async (req) => {
  // CORS configuration
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
    console.log("Recebido Webhook do ClickUp:", JSON.stringify(payload, null, 2));

    // O ClickUp costuma enviar histórico de alterações em history_items para webhooks de status
    const taskId = payload.task_id;
    const historyItems = payload.history_items || [];
    
    // Procura por alteração de status
    const statusChange = historyItems.find((item: any) => item.field === "status");
    
    if (statusChange && taskId) {
      const beforeStatus = statusChange.before?.status;
      const afterStatus = statusChange.after?.status;

      console.log(`Tarefa ${taskId} mudou status de "${beforeStatus}" para "${afterStatus}"`);

      // Verifica se o novo status é "Ganho" (ou "won", "closed" conforme configurado)
      // Ajustamos para verificar variações comuns de status de sucesso comercial em português/inglês
      const successStatuses = ["ganho", "won", "closed", "fechado"];
      const isTargetStatus = successStatuses.includes(afterStatus?.toLowerCase());

      if (isTargetStatus) {
        console.log(`Status de sucesso identificado. Iniciando verificação de propostas selecionadas...`);

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLICKUP_API_TOKEN) {
          throw new Error("Variáveis de ambiente do Supabase ou ClickUp não configuradas no Deno.");
        }

        // Criar cliente do Supabase com Service Role Key para ignorar RLS
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Buscar propostas da tarefa no banco
        const { data: propostas, error: dbError } = await supabase
          .from("propostas")
          .select("id, versao, situacao")
          .eq("clickup_negocio_id", taskId);

        if (dbError) {
          throw new Error(`Erro ao consultar banco de dados: ${dbError.message}`);
        }

        // Filtrar as selecionadas
        const selecionadas = propostas ? propostas.filter(p => p.situacao === "Selecionada") : [];
        const countSelecionadas = selecionadas.length;

        console.log(`Total de propostas para a tarefa ${taskId}: ${propostas?.length || 0}. Selecionadas: ${countSelecionadas}`);

        // A validação falha se não houver EXATAMENTE uma proposta selecionada
        if (countSelecionadas !== 1) {
          console.warn(`Validação falhou! Esperado 1 proposta selecionada, encontrado ${countSelecionadas}. Iniciando Rollback no ClickUp...`);

          // 1. Reverter o status no ClickUp
          const rollbackUrl = `https://api.clickup.com/api/v2/task/${taskId}`;
          const rollbackResponse = await fetch(rollbackUrl, {
            method: "PUT",
            headers: {
              "Authorization": CLICKUP_API_TOKEN,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              status: beforeStatus // Retorna ao status anterior
            })
          });

          if (!rollbackResponse.ok) {
            const errTxt = await rollbackResponse.text();
            console.error(`Erro ao fazer rollback de status no ClickUp: ${rollbackResponse.status} - ${errTxt}`);
          } else {
            console.log(`Rollback de status executado com sucesso. Status revertido para "${beforeStatus}".`);
          }

          // 2. Inserir comentário de erro informando o vendedor
          const commentUrl = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
          const commentMsg = `⚠️ [TRAVA DE SEGURANÇA - CRM] Não foi possível mover este negócio para o status "${afterStatus}". \n\nMotivo: É obrigatório que haja exatamente uma (1) proposta comercial com o status "Selecionada" no sistema para fechar a venda. Atualmente, existem ${countSelecionadas} propostas selecionadas. \n\nO status foi revertido automaticamente para "${beforeStatus}". Por favor, selecione a proposta correta na aba de propostas antes de ganhar o negócio.`;
          
          const commentResponse = await fetch(commentUrl, {
            method: "POST",
            headers: {
              "Authorization": CLICKUP_API_TOKEN,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              comment_text: commentMsg
            })
          });

          if (!commentResponse.ok) {
            const errTxt = await commentResponse.text();
            console.error(`Erro ao criar comentário no ClickUp: ${commentResponse.status} - ${errTxt}`);
          } else {
            console.log("Comentário de erro inserido na tarefa do ClickUp.");
          }

          return new Response(JSON.stringify({ 
            success: false, 
            message: `Validação falhou. Encontrado ${countSelecionadas} propostas selecionadas. Status revertido.` 
          }), {
            headers: { "Content-Type": "application/json" },
            status: 200 // Retorna 200 pois o webhook foi processado com sucesso (mesmo com falha de validação comercial)
          });
        }

        console.log("Validação com sucesso! Existe exatamente 1 proposta selecionada:", selecionadas[0].versao);
        return new Response(JSON.stringify({ success: true, message: "Validação passou. Negócio fechado autorizado." }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Evento ignorado (não é alteração para status de ganho)" }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    console.error("Erro ao processar webhook do ClickUp:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    });
  }
});
