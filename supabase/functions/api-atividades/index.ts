// supabase/functions/api-atividades/index.ts
//
// Migração de /api/atividades (server.py) para Edge Function HTTP, pra
// funcionar também em produção na VPS (crm.llworkflow.com.br), onde não
// existe nenhum processo Python rodando — só server.py local (dev) tinha
// essas rotas. Roteado via nginx: /api/atividades* -> esta function
// (ver deploy/nginx.conf).
//
// Replica fielmente o comportamento de server.py:
// - GET  /api/atividades?clickup_negocio_id=X  → lista Supabase + mescla
//   comentários nativos do ClickUp que ainda não foram espelhados lá.
// - POST /api/atividades                       → cria comentário no
//   ClickUp (com suporte a @menção real via build_clickup_comment_segments)
//   e grava em atividades_negocio.
// - PUT  /api/atividades/{id}                  → edita o comentário no
//   ClickUp e a linha no Supabase (ids "cu_..." são comentários nativos do
//   ClickUp sem linha própria no Supabase).
// - DELETE /api/atividades/{id}                → exclui dos dois lados.
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

const MENTION_PATTERN = /@\[([^\]]+)\]\((\d+)\)/g;

// Converte um texto com marcadores @[Nome](clickupUserId) — inseridos pelo
// MentionTextarea do app.js — numa lista de segmentos rich-text do ClickUp:
// texto normal vira {text}, cada marcador vira {type:"tag", user:{id}},
// que o ClickUp renderiza como uma menção real.
function buildClickUpCommentSegments(texto: string): Array<Record<string, unknown>> {
  const segments: Array<Record<string, unknown>> = [];
  let lastEnd = 0;
  for (const m of texto.matchAll(MENTION_PATTERN)) {
    const start = m.index ?? 0;
    if (start > lastEnd) segments.push({ text: texto.slice(lastEnd, start) });
    segments.push({ type: "tag", user: { id: parseInt(m[2], 10) } });
    lastEnd = start + m[0].length;
  }
  if (lastEnd < texto.length) segments.push({ text: texto.slice(lastEnd) });
  if (segments.length === 0) segments.push({ text: texto });
  return segments;
}

async function clickupFetch(path: string, method: string, token: string, body?: unknown) {
  return fetch(`https://api.clickup.com/api/v2/${path}`, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
  // O roteador interno preserva o segmento "api-atividades" no path (só
  // remove o prefixo /functions/v1) — remove os dois, em qualquer ordem/
  // presença. O que sobra é "" (lista/cria) ou "{id}" (editar/excluir).
  const tail = url.pathname
    .replace(/^\/+/, "")
    .replace(/^functions\/v1\/?/, "")
    .replace(/^api-atividades\/?/, "");
  const atividadeId = tail || null;
  const clickupToken = getClickUpToken(req);

  try {
    // ───────────────────────────────────────
    // GET — lista atividades de um negócio (Supabase + fallback ClickUp)
    // ───────────────────────────────────────
    if (req.method === "GET") {
      const clickupId = url.searchParams.get("clickup_negocio_id");
      if (!clickupId || ["null", "undefined", ""].includes(clickupId)) {
        return json([]);
      }
      const idClean = clickupId.replace("#", "");
      let atividades: any[] = [];

      const { data: sbData, error: sbErr } = await supabase
        .from("atividades_negocio")
        .select("*")
        .eq("clickup_negocio_id", idClean)
        .order("data_execucao", { ascending: false });
      if (!sbErr && sbData) atividades = sbData;

      try {
        const cuRes = await clickupFetch(`task/${idClean}/comment`, "GET", clickupToken);
        if (cuRes.ok) {
          const cuData = await cuRes.json();
          const comments = cuData.comments || [];
          const sbCommentIds = new Set(atividades.filter((a) => a.clickup_comment_id).map((a) => String(a.clickup_comment_id)));
          for (const c of comments) {
            const cId = String(c.id);
            if (!sbCommentIds.has(cId)) {
              const rawText = c.comment_text || "";
              const cleanText = rawText.replace("[SPA Gestão Comercial] ", "").trim();
              let dateIso = new Date().toISOString();
              if (c.date) {
                const ms = parseInt(c.date, 10);
                if (!isNaN(ms)) dateIso = new Date(ms).toISOString();
              }
              atividades.push({
                id: `cu_${cId}`,
                clickup_negocio_id: idClean,
                clickup_comment_id: cId,
                texto: cleanText,
                data_execucao: dateIso,
                created_at: dateIso,
                updated_at: dateIso,
                // Comentário nativo do ClickUp, sem linha própria no
                // Supabase: a resposta do ClickUp já traz o autor, que
                // antes era descartado — agora vai pro feed também.
                origem: "clickup",
                autor_nome: c.user?.username || c.user?.email || null,
                autor_clickup_id: c.user?.id != null ? String(c.user.id) : null,
                anexos: [],
              });
            }
          }
        }
      } catch (cuErr) {
        console.warn("[api-atividades] Falha ao buscar comentários no ClickUp:", cuErr.message);
      }

      atividades.sort((a, b) => String(b.data_execucao || "").localeCompare(String(a.data_execucao || "")));
      return json(atividades);
    }

    // ───────────────────────────────────────
    // POST — cria comentário no ClickUp + grava no Supabase
    // ───────────────────────────────────────
    if (req.method === "POST") {
      const data = await req.json();
      const clickupNegocioId = data.clickup_negocio_id;
      const texto = (data.texto || "").trim();
      if (!clickupNegocioId || !texto) {
        return json({ error: "clickup_negocio_id e texto são obrigatórios" }, 400);
      }

      const idClean = String(clickupNegocioId).replace("#", "");
      const nowIso = new Date().toISOString();

      // Metadados novos (aba Atividades repaginada) — todos opcionais, pra
      // não quebrar nenhum chamador antigo que só manda clickup_negocio_id
      // e texto. `anexos` são só ponteiros pro ClickUp (ver migração
      // 20260904), nunca bytes de arquivo.
      const autorNome = typeof data.autor_nome === "string" ? data.autor_nome.trim() || null : null;
      const autorClickupId = data.autor_clickup_id != null ? String(data.autor_clickup_id) : null;
      const origem = ["manual", "tarefa", "clickup"].includes(data.origem) ? data.origem : "manual";
      const tarefaId = typeof data.tarefa_id === "string" ? data.tarefa_id : null;
      const tarefaTipo = typeof data.tarefa_tipo === "string" ? data.tarefa_tipo : null;
      const tarefaTitulo = typeof data.tarefa_titulo === "string" ? data.tarefa_titulo : null;
      const anexos = Array.isArray(data.anexos) ? data.anexos : [];

      // O texto gravado no nosso banco é só o corpo puro (a referência à
      // tarefa vira colunas estruturadas, não mais um prefixo colado na
      // string). O comentário no ClickUp, por outro lado, não tem como
      // exibir essas colunas — recebe o contexto embutido no próprio texto.
      let clickupTexto = texto;
      if (origem === "tarefa" && (tarefaTipo || tarefaTitulo)) {
        const selo = tarefaTipo && tarefaTitulo ? `${tarefaTipo}: ${tarefaTitulo}` : (tarefaTipo || tarefaTitulo);
        clickupTexto = `✅ Tarefa concluída (${selo}) — ${texto}`;
      }

      let clickupCommentId: string | null = null;
      try {
        const commentPayload = {
          comment: buildClickUpCommentSegments(`[SPA Gestão Comercial] ${clickupTexto}`),
          notify_all: false,
        };
        const cuRes = await clickupFetch(`task/${idClean}/comment`, "POST", clickupToken, commentPayload);
        if (cuRes.ok) {
          const cuData = await cuRes.json();
          clickupCommentId = String(cuData.id || cuData.comment?.id || "") || null;
        } else {
          console.warn(`[api-atividades] Falha ao criar comentário no ClickUp: ${cuRes.status} ${await cuRes.text()}`);
        }
      } catch (cuErr) {
        console.warn("[api-atividades] Erro ao criar comentário no ClickUp:", cuErr.message);
      }

      const supabasePayload = {
        clickup_negocio_id: idClean,
        clickup_comment_id: clickupCommentId,
        texto,
        data_execucao: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        autor_nome: autorNome,
        autor_clickup_id: autorClickupId,
        origem,
        tarefa_id: tarefaId,
        tarefa_tipo: tarefaTipo,
        tarefa_titulo: tarefaTitulo,
        anexos,
      };

      let sbResData: unknown[] = [supabasePayload];
      const { data: inserted, error: sbErr } = await supabase.from("atividades_negocio").insert(supabasePayload).select();
      if (!sbErr && inserted) sbResData = inserted;
      else if (sbErr) console.warn("[api-atividades] Falha ao salvar atividade no Supabase:", sbErr.message);

      return json(sbResData, 201);
    }

    // ───────────────────────────────────────
    // PUT — edita comentário no ClickUp + linha no Supabase
    // ───────────────────────────────────────
    if (req.method === "PUT") {
      if (!atividadeId) return json({ error: "ID da atividade inválido" }, 400);
      const data = await req.json();
      const texto = (data.texto || "").trim();
      if (!texto) return json({ error: "O texto é obrigatório" }, 400);

      const nowIso = new Date().toISOString();
      let clickupCommentId: string | null = null;
      let existingOrigem: string | null = null;
      let existingTarefaTipo: string | null = null;
      let existingTarefaTitulo: string | null = null;

      if (atividadeId.startsWith("cu_")) {
        clickupCommentId = atividadeId.replace("cu_", "");
      } else {
        const { data: existing } = await supabase
          .from("atividades_negocio")
          .select("clickup_comment_id, origem, tarefa_tipo, tarefa_titulo")
          .eq("id", atividadeId)
          .maybeSingle();
        if (existing?.clickup_comment_id) clickupCommentId = existing.clickup_comment_id;
        existingOrigem = existing?.origem || null;
        existingTarefaTipo = existing?.tarefa_tipo || null;
        existingTarefaTitulo = existing?.tarefa_titulo || null;
      }

      // Reaplica o mesmo contexto de tarefa do POST original, senão editar
      // o texto apagaria a referência no comentário do ClickUp.
      let clickupTexto = texto;
      if (existingOrigem === "tarefa" && (existingTarefaTipo || existingTarefaTitulo)) {
        const selo = existingTarefaTipo && existingTarefaTitulo
          ? `${existingTarefaTipo}: ${existingTarefaTitulo}`
          : (existingTarefaTipo || existingTarefaTitulo);
        clickupTexto = `✅ Tarefa concluída (${selo}) — ${texto}`;
      }

      if (clickupCommentId) {
        try {
          const commentPayload = { comment: buildClickUpCommentSegments(`[SPA Gestão Comercial] ${clickupTexto}`) };
          const cuRes = await clickupFetch(`comment/${clickupCommentId}`, "PUT", clickupToken, commentPayload);
          console.log(`[api-atividades] Comentário ${clickupCommentId} atualizado no ClickUp (status: ${cuRes.status})`);
        } catch (cuErr) {
          console.warn("[api-atividades] Falha ao atualizar comentário no ClickUp:", cuErr.message);
        }
      }

      if (!atividadeId.startsWith("cu_")) {
        const { error: sbErr } = await supabase.from("atividades_negocio").update({ texto, updated_at: nowIso }).eq("id", atividadeId);
        if (sbErr) console.warn("[api-atividades] PATCH Supabase falhou:", sbErr.message);
      }

      return json({ success: true, texto });
    }

    // ───────────────────────────────────────
    // DELETE — exclui dos dois lados
    // ───────────────────────────────────────
    if (req.method === "DELETE") {
      if (!atividadeId) return json({ error: "ID da atividade inválido" }, 400);
      let clickupCommentId: string | null = null;

      if (atividadeId.startsWith("cu_")) {
        clickupCommentId = atividadeId.replace("cu_", "");
      } else {
        const { data: existing } = await supabase.from("atividades_negocio").select("clickup_comment_id").eq("id", atividadeId).maybeSingle();
        if (existing?.clickup_comment_id) clickupCommentId = existing.clickup_comment_id;
        const { error: delErr } = await supabase.from("atividades_negocio").delete().eq("id", atividadeId);
        if (delErr) console.warn("[api-atividades] DELETE Supabase falhou:", delErr.message);
      }

      if (clickupCommentId) {
        try {
          const cuRes = await clickupFetch(`comment/${clickupCommentId}`, "DELETE", clickupToken);
          console.log(`[api-atividades] Comentário ${clickupCommentId} excluído no ClickUp (status: ${cuRes.status})`);
        } catch (cuErr) {
          console.warn("[api-atividades] Falha ao excluir comentário no ClickUp:", cuErr.message);
        }
      }

      return json({ success: true });
    }

    return json({ error: "Método não suportado" }, 405);
  } catch (error) {
    console.error("[api-atividades] Erro:", error.message);
    return json({ error: error.message }, 500);
  }
});
