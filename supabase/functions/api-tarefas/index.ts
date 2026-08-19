// supabase/functions/api-tarefas/index.ts
//
// Migração de /api/tarefas (server.py) para Edge Function HTTP, pra
// funcionar também em produção na VPS (crm.llworkflow.com.br), onde não
// existe nenhum processo Python rodando — só server.py local (dev) tinha
// essas rotas. Roteado via nginx: /api/tarefas* -> esta function (ver
// deploy/nginx.conf).
//
// Replica fielmente o comportamento de server.py:
// - GET  /api/tarefas                → lista tarefas_comerciais, cada uma
//   enriquecida com a proposta correspondente (proposta/propostas/
//   nome_projeto), igual ao enrich_task_with_proposal original.
// - POST /api/tarefas                → cria (ou edita, se o corpo tiver
//   "id") uma tarefa comercial: cria/edita a subtask no ClickUp, resolve/
//   auto-provisiona/auto-cura o vínculo com a proposta correspondente, e
//   grava em tarefas_comerciais.
// - PUT  /api/tarefas/{id}/status    → marca pendente/concluída, resolve
//   dinamicamente o status correspondente na lista do ClickUp (fallback
//   estático "aberto"/"fechado" se não conseguir).
// - DELETE /api/tarefas/{id}         → exclui a subtask no ClickUp e a
//   linha no Supabase.
//
// Autenticação: o header Authorization aqui carrega o Personal Token do
// ClickUp do vendedor logado (não um JWT do Supabase) — mesmo contrato que
// server.py's get_client_token() já usa. Cai pro CLICKUP_API_TOKEN global
// se ausente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function getClickUpToken(req: Request): string {
  return req.headers.get("Authorization") || CLICKUP_API_TOKEN;
}

async function clickupFetch(path: string, method: string, token: string, body?: unknown) {
  return fetch(`https://api.clickup.com/api/v2/${path}`, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Réplica de parse_date_to_ms (server.py): aceita timestamp numérico,
// string ISO, ou "YYYY-MM-DD" (meio-dia local); default_to_tomorrow cobre
// o due_date quando nada foi informado.
function parseDateToMs(dateVal: unknown, defaultToTomorrow = false): number | null {
  if (dateVal === null || dateVal === undefined || dateVal === "") {
    return defaultToTomorrow ? Date.now() + 24 * 60 * 60 * 1000 : null;
  }
  if (typeof dateVal === "number") return Math.trunc(dateVal);
  const s = String(dateVal);
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 12, 0, 0);
    return d.getTime();
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.getTime();

  return defaultToTomorrow ? Date.now() + 24 * 60 * 60 * 1000 : null;
}

// Réplica de enrich_task_with_proposal (server.py): resolve a proposta
// correspondente por proposta_id (UUID) ou, se ausente, por
// clickup_negocio_id, e injeta proposta/propostas/nome_projeto no shape
// que o frontend espera.
function enrichTaskWithProposal(task: Record<string, any>, props: Record<string, any>[]) {
  const uuidMap = new Map(props.filter((p) => p.id).map((p) => [p.id, p]));
  const clickupMap = new Map<string, Record<string, any>>();
  for (const p of props) {
    const cId = p.clickup_negocio_id;
    if (cId) clickupMap.set(String(cId).replace("#", ""), p);
  }

  const tPropId = task.proposta_id;
  const tClickupClean = String(task.clickup_negocio_id || "").replace("#", "");

  let resolved: Record<string, any> | null = null;
  if (tPropId && uuidMap.has(tPropId)) resolved = uuidMap.get(tPropId)!;
  else if (clickupMap.has(tClickupClean)) resolved = clickupMap.get(tClickupClean)!;

  if (resolved) {
    const projName = resolved.nome_projeto || resolved.projeto || resolved.cliente || resolved.cenario || "Projeto";
    const propNum = resolved.numero_proposta || resolved.numero || "";
    const propPayload = {
      ...resolved,
      nome_projeto: projName,
      projeto: projName,
      cliente: projName,
      numero_proposta: propNum,
      numero: propNum,
      versao: resolved.versao || "A",
    };
    task.proposta = propPayload;
    task.propostas = [propPayload];
    task.nome_projeto = projName;
  } else {
    task.proposta = null;
    task.propostas = [];
    task.nome_projeto = "Sem Proposta";
  }
  return task;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas." }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  // O roteador interno preserva o segmento "api-tarefas" no path (só remove
  // o prefixo /functions/v1) — remove os dois, em qualquer ordem/presença.
  const tail = url.pathname
    .replace(/^\/+/, "")
    .replace(/^functions\/v1\/?/, "")
    .replace(/^api-tarefas\/?/, "");
  const clickupToken = getClickUpToken(req);

  try {
    // ───────────────────────────────────────
    // GET — lista todas as tarefas, enriquecidas com a proposta vinculada
    // ───────────────────────────────────────
    if (req.method === "GET") {
      const { data: tasks, error: tasksErr } = await supabase.from("tarefas_comerciais").select("*");
      if (tasksErr || !tasks) return json([]);

      const { data: props } = await supabase.from("propostas").select("*");
      const propsList = props || [];

      const enriched = tasks.map((t: any) => enrichTaskWithProposal(t, propsList));
      return json(enriched);
    }

    // ───────────────────────────────────────
    // PUT /{id}/status — marca pendente/concluída
    // ───────────────────────────────────────
    const statusMatch = tail.match(/^([^/]+)\/status$/);
    if (req.method === "PUT" && statusMatch) {
      const taskId = statusMatch[1];
      const data = await req.json();
      const status = data.status;
      if (!["pendente", "concluida"].includes(status)) {
        return json({ error: "Status inválido. Deve ser 'pendente' ou 'concluida'" }, 400);
      }

      const { data: updated, error: updErr } = await supabase
        .from("tarefas_comerciais")
        .update({ status })
        .eq("id", taskId)
        .select();
      if (updErr) return json({ error: `Erro ao atualizar tarefa no banco: ${updErr.message}` }, 500);
      if (!updated || updated.length === 0) return json({ error: "Tarefa não encontrada" }, 404);

      const taskRecord = updated[0];
      const clickupSubtaskId = taskRecord.clickup_subtask_id;

      if (clickupSubtaskId) {
        let matchedStatus: string | null = null;
        try {
          const taskRes = await clickupFetch(`task/${clickupSubtaskId}`, "GET", clickupToken);
          if (taskRes.ok) {
            const taskData = await taskRes.json();
            const listId = taskData.list?.id;
            if (listId) {
              const listRes = await clickupFetch(`list/${listId}`, "GET", clickupToken);
              if (listRes.ok) {
                const listData = await listRes.json();
                const statuses = listData.statuses || [];
                const targetType = status === "concluida" ? "closed" : "open";
                const found = statuses.find((s: any) => s.type === targetType);
                if (found) matchedStatus = found.status;
              }
            }
          }
        } catch (lookupErr) {
          console.warn("[api-tarefas] Erro ao buscar status dinamicamente no ClickUp:", lookupErr.message);
        }

        if (!matchedStatus) matchedStatus = status === "concluida" ? "fechado" : "aberto";

        try {
          const cuRes = await clickupFetch(`task/${clickupSubtaskId}`, "PUT", clickupToken, { status: matchedStatus });
          if (!cuRes.ok) {
            const errText = await cuRes.text();
            console.warn(`[api-tarefas] Falha ao sincronizar status no ClickUp (${cuRes.status}): ${errText}`);
            return json({ warning: `Tarefa atualizada localmente, mas falhou ao sincronizar com ClickUp (HTTP ${cuRes.status}): ${errText}`, data: taskRecord });
          }
        } catch (cuErr) {
          console.warn("[api-tarefas] Erro ao sincronizar status no ClickUp:", cuErr.message);
          return json({ warning: `Tarefa atualizada localmente, mas falhou ao sincronizar com ClickUp: ${cuErr.message}`, data: taskRecord });
        }
      }

      return json({ data: taskRecord });
    }

    // ───────────────────────────────────────
    // DELETE /{id} — exclui do ClickUp e do Supabase
    // ───────────────────────────────────────
    if (req.method === "DELETE" && tail && !tail.includes("/")) {
      const taskId = tail;
      const { data: existing, error: getErr } = await supabase.from("tarefas_comerciais").select("*").eq("id", taskId);
      if (getErr) return json({ error: "Erro ao buscar tarefa no banco de dados" }, 502);
      if (!existing || existing.length === 0) return json({ error: "Tarefa não encontrada" }, 404);

      const clickupSubtaskId = existing[0].clickup_subtask_id;
      if (clickupSubtaskId) {
        try {
          await clickupFetch(`task/${clickupSubtaskId}`, "DELETE", clickupToken);
        } catch (cuErr) {
          console.warn("[api-tarefas] Falha ao excluir subtask no ClickUp:", cuErr.message);
        }
      }

      await supabase.from("tarefas_comerciais").delete().eq("id", taskId);
      return json({ success: true });
    }

    // ───────────────────────────────────────
    // POST/PUT — cria (ou edita, se data.id presente) uma tarefa comercial
    // ───────────────────────────────────────
    if (req.method === "POST" || req.method === "PUT") {
      const data = await req.json();

      const propostaIdIn = data.proposta_id;
      const clickupNegocioId = data.clickup_negocio_id;
      const titulo = data.titulo;
      const tipo = data.tipo;
      const dataVencimento = data.data_vencimento;
      const responsavelClickupId = data.responsavel_clickup_id;
      const dueDateTime = data.due_date_time || false;
      const dataInicio = data.data_inicio;

      const assignees: number[] = [];
      if (responsavelClickupId) {
        const n = parseInt(String(responsavelClickupId), 10);
        if (!isNaN(n)) assignees.push(n);
      }

      const startDateMs = parseDateToMs(dataInicio);
      const dueDateMs = parseDateToMs(dataVencimento, true);

      const taskId = data.id;
      let clickupSubtaskId: string | null = null;
      let oldClickupNegocioId: string | null = null;
      let isUpdate = false;

      if (taskId) {
        const { data: existing } = await supabase.from("tarefas_comerciais").select("*").eq("id", taskId);
        if (existing && existing.length > 0) {
          clickupSubtaskId = existing[0].clickup_subtask_id;
          oldClickupNegocioId = existing[0].clickup_negocio_id;
          isUpdate = true;
        }
      }

      if (isUpdate && clickupSubtaskId) {
        const clickupPayload: Record<string, unknown> = { name: titulo, due_date: dueDateMs, due_date_time: dueDateTime };
        if (startDateMs) clickupPayload.start_date = startDateMs;
        if (clickupNegocioId && clickupNegocioId !== oldClickupNegocioId) {
          clickupPayload.parent = clickupNegocioId;
        }
        try {
          const cuRes = await clickupFetch(`task/${clickupSubtaskId}`, "PUT", clickupToken, clickupPayload);
          if (!cuRes.ok) {
            const errText = await cuRes.text();
            return json({ error: `Erro na API do ClickUp ao editar: ${errText}` }, 502);
          }
        } catch (cuErr) {
          return json({ error: `Erro na API do ClickUp ao editar: ${cuErr.message}` }, 502);
        }
      } else {
        let listId: string | null = null;
        try {
          const parentRes = await clickupFetch(`task/${clickupNegocioId}`, "GET", clickupToken);
          if (!parentRes.ok) throw new Error(await parentRes.text());
          const parentData = await parentRes.json();
          listId = parentData.list?.id || null;
          if (!listId) throw new Error("ID da lista do ClickUp não encontrado nos detalhes da tarefa pai");
        } catch (getParentErr) {
          return json({ error: `Erro ao buscar lista do ClickUp: ${getParentErr.message}` }, 502);
        }

        const clickupPayload: Record<string, unknown> = {
          name: titulo,
          assignees,
          due_date: dueDateMs,
          due_date_time: dueDateTime,
          parent: clickupNegocioId,
        };
        if (startDateMs) clickupPayload.start_date = startDateMs;

        try {
          const cuRes = await clickupFetch(`list/${listId}/task`, "POST", clickupToken, clickupPayload);
          if (!cuRes.ok) throw new Error(await cuRes.text());
          const clickupData = await cuRes.json();
          clickupSubtaskId = clickupData.id;
        } catch (cuErr) {
          return json({ error: `Erro na API do ClickUp ao criar: ${cuErr.message}` }, 502);
        }
      }

      const dueDateIso = new Date(dueDateMs!).toISOString();
      const nomeProjeto = data.nome_projeto || "Projeto Sem Nome";
      let targetProp: Record<string, any> | null = null;
      let propostaId = propostaIdIn;

      // 1. Localiza a proposta existente pelo clickup_negocio_id
      if (clickupNegocioId) {
        const idClean = String(clickupNegocioId).replace("#", "");
        const idHash = `#${idClean}`;
        const { data: found } = await supabase
          .from("propostas")
          .select("*")
          .in("clickup_negocio_id", [idClean, idHash])
          .limit(1);
        if (found && found.length > 0) targetProp = found[0];
      }

      // 2. Fallback: busca exata por nome_projeto
      if (!targetProp && nomeProjeto) {
        const { data: found } = await supabase.from("propostas").select("*").eq("nome_projeto", nomeProjeto).limit(1);
        if (found && found.length > 0) targetProp = found[0];
      }

      // 3. Fallback avançado: busca parcial pelo primeiro segmento do nome
      if (!targetProp && nomeProjeto) {
        const cleanName = nomeProjeto.split("|")[0].trim();
        const { data: found } = await supabase.from("propostas").select("*").ilike("nome_projeto", `%${cleanName}%`).limit(1);
        if (found && found.length > 0) targetProp = found[0];
      }

      // 4. Auto-provisionamento: cria a proposta se não existir, pra garantir integridade
      if (!targetProp && clickupNegocioId) {
        const { error: insErr } = await supabase.from("propostas").insert({
          nome_projeto: nomeProjeto,
          clickup_negocio_id: clickupNegocioId,
          numero_proposta: "S/N",
        });
        if (!insErr) {
          const idClean = String(clickupNegocioId).replace("#", "");
          const idHash = `#${idClean}`;
          const { data: found } = await supabase
            .from("propostas")
            .select("*")
            .in("clickup_negocio_id", [idClean, idHash])
            .limit(1);
          if (found && found.length > 0) {
            targetProp = found[0];
            console.log(`[api-tarefas] Proposta auto-provisionada para ClickUp ID ${clickupNegocioId}`);
          }
        }
      }

      // 5. Autocura: se achou a proposta mas ela não tinha clickup_negocio_id
      if (targetProp) {
        propostaId = targetProp.id;
        if (!targetProp.clickup_negocio_id && clickupNegocioId) {
          const { error: healErr } = await supabase.from("propostas").update({ clickup_negocio_id: clickupNegocioId }).eq("id", propostaId);
          if (!healErr) targetProp.clickup_negocio_id = clickupNegocioId;
        }
      }

      const supabasePayload: Record<string, unknown> = {
        proposta_id: propostaId,
        clickup_subtask_id: clickupSubtaskId,
        titulo,
        tipo,
        data_vencimento: dueDateIso,
        responsavel_clickup_id: responsavelClickupId,
        status: data.status || "pendente",
        clickup_negocio_id: clickupNegocioId,
      };

      let sbResult: Record<string, any>[] | null = null;
      if (taskId) {
        const { data: updated, error: updErr } = await supabase.from("tarefas_comerciais").update(supabasePayload).eq("id", taskId).select();
        if (updErr) return json({ error: `Erro ao salvar tarefa no banco de dados: ${updErr.message}` }, 500);
        sbResult = updated;
      } else {
        const { data: inserted, error: insErr } = await supabase.from("tarefas_comerciais").insert(supabasePayload).select();
        if (insErr) return json({ error: `Erro ao salvar tarefa no banco de dados: ${insErr.message}` }, 500);
        sbResult = inserted;
      }

      if (sbResult && sbResult.length > 0) {
        const createdTask = sbResult[0];
        if (targetProp) {
          createdTask.proposta = targetProp;
          createdTask.propostas = [targetProp];
          createdTask.nome_projeto = targetProp.nome_projeto || nomeProjeto;
        } else {
          createdTask.proposta = null;
          createdTask.propostas = [];
          createdTask.nome_projeto = nomeProjeto;
        }
        return json([createdTask], 201);
      }

      return json(sbResult, 201);
    }

    return json({ error: "Método não suportado" }, 405);
  } catch (error) {
    console.error("[api-tarefas] Erro:", error.message);
    return json({ error: error.message }, 500);
  }
});
