// supabase/functions/sync-proposta-tecnica-clickup/index.ts
// Dispara via Database Webhook no INSERT e no DELETE de `propostas`. No
// INSERT, cria (ou reaproveita) a lista técnica na pasta PRE-VENDAS/PROJETOS
// e a tarefa "Enviar Proposta vX" dentro dela, linkada de volta ao negócio de
// origem — porta pro CRM a automação que hoje roda como Google Apps Script
// no ClickUp. No DELETE, remove a tarefa técnica correspondente à versão
// excluída no CRM.
//
// Restaurado em 19/08 para o design original (lista técnica na pasta, não
// subtask do negócio) depois de uma reescrita paralela ter substituído esse
// comportamento sem coordenação — combinado com o usuário que o formato
// "lista técnica" é o correto (replica o Apps Script antigo que a equipe já
// usava). Mantém, dessa reescrita paralela, duas melhorias genuínas:
// idempotência via `clickup_proposta_tecnica_id` (evita duplicar a tarefa se
// o webhook disparar mais de uma vez) e exclusão direto por esse id (mais
// simples/confiável que buscar a tarefa pelo nome).
//
// Autocorreção de versão: para negócios que já eram controlados manualmente
// pelo ClickUp antes do CRM existir, o contador de versão do Supabase
// (propostas.versao) pode estar atrasado em relação ao que já existe na
// lista técnica (ex: CRM calcula "vB", mas o ClickUp já tem até "vH").
// Antes de criar a tarefa, checamos a maior versão já existente na lista
// técnica e, se for maior ou igual à calculada pelo CRM, pulamos direto
// para a próxima depois dela — e corrigimos `propostas.versao` no Supabase
// para bater com o que foi realmente usado, sincronizando os dois lados daí
// em diante sem precisar de ajuste manual.
//
// Atribuição por Usuário: resolve o token pessoal do vendedor via
// criado_por_user_id → usuarios_clickup (módulo compartilhado
// _shared/resolve-token.ts), com fallback para CLICKUP_API_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { resolveClickUpToken } from "../_shared/resolve-token.ts";
import { clickupFetch } from "../_shared/clickup-fetch.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const FOLDER_PROJETOS_ID = "90134052120";
const TECH_CUSTOM_ITEM_ID = 1014;
const PREFIX_TASK = "Enviar Proposta ";

// A lista técnica/"Enviar Proposta vX" só faz sentido pra propostas do tipo
// PROJETO — o app.js grava o "Tipo de Oportunidade" direto na coluna
// `cenario`: PROJETO fica com cenario "" (ainda não escolheu o "Tipo de
// Projeto") ou um dos 4 valores abaixo (Tipo de Projeto, dentro de Projeto);
// os outros 5 tipos de oportunidade (Garantias/Serviços/SSU/Volumes/Upgrade)
// gravam o próprio nome do tipo, em CAIXA ALTA, direto em `cenario` — daí o
// match ser sensível a maiúsculas/minúsculas: "Upgrade" (Tipo de Projeto,
// dentro de Projeto) é uma string diferente de "UPGRADE" (Tipo de
// Oportunidade, não-projeto), e não podem ser confundidas aqui.
const TIPOS_SEM_LISTA_TECNICA = new Set(["GARANTIAS", "SERVIÇOS", "SSU", "VOLUMES", "UPGRADE"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeId(id: unknown): string {
  return String(id || "").replace("#", "").trim();
}

// Letras de versão como coluna de planilha: A=1, Z=26, AA=27, AB=28... —
// permite comparar/gerar "próxima versão" corretamente mesmo além de Z.
function letterRank(letters: string): number {
  let rank = 0;
  for (const ch of letters.toUpperCase()) {
    const code = ch.charCodeAt(0) - 64; // A=1
    if (code < 1 || code > 26) continue;
    rank = rank * 26 + code;
  }
  return rank;
}

function rankToLetters(rank: number): string {
  let s = "";
  let n = rank;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

// Maior letra de versão já existente entre as tarefas "Enviar Proposta vX"
// da lista técnica (0 se a lista estiver vazia ou não tiver nenhuma).
async function getMaxVersionRankInList(listaId: string, token: string): Promise<number> {
  const res = await clickupFetch(`https://api.clickup.com/api/v2/list/${listaId}/task?include_closed=true`, {
    headers: { Authorization: token },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  const tasks = data.tasks || [];
  const re = /^Enviar Proposta\s+v([A-Za-z]+)/i;
  let maxRank = 0;
  for (const t of tasks) {
    const m = (t.name || "").match(re);
    if (m) {
      const rank = letterRank(m[1]);
      if (rank > maxRank) maxRank = rank;
    }
  }
  return maxRank;
}

// Comparação sem diferenciar maiúsculas/minúsculas: negócios legados (lista
// técnica já criada manualmente pelo Apps Script antigo, antes do CRM
// existir) usam a lista em CAIXA ALTA, enquanto `negocios.nome` no Supabase
// guarda o nome como foi digitado (case misto) — um match exato (`===`)
// nunca reconhece essa lista como já existente e tenta recriá-la.
function normalizeNomeLista(nome: string): string {
  return nome.trim().toLowerCase();
}

async function findListaTecnica(nome: string, token: string): Promise<{ id: string | null; erro: string | null }> {
  const listRes = await clickupFetch(`https://api.clickup.com/api/v2/folder/${FOLDER_PROJETOS_ID}/list`, {
    headers: { Authorization: token },
  });
  if (!listRes.ok) {
    const errText = await listRes.text();
    return { id: null, erro: `GET lista (folder ${FOLDER_PROJETOS_ID}): ${listRes.status} ${errText}` };
  }
  const listData = await listRes.json();
  const alvo = normalizeNomeLista(nome);
  const existente = (listData.lists || []).find((l: any) => normalizeNomeLista(l.name || "") === alvo);
  return { id: existente ? existente.id : null, erro: null };
}

async function getOrCreateListaTecnica(nome: string, token: string): Promise<{ id: string | null; erro: string | null }> {
  const { id: existenteId, erro: erroFind } = await findListaTecnica(nome, token);
  if (existenteId) return { id: existenteId, erro: null };
  if (erroFind) return { id: null, erro: erroFind };

  const createRes = await clickupFetch(`https://api.clickup.com/api/v2/folder/${FOLDER_PROJETOS_ID}/list`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    return { id: null, erro: `POST lista (folder ${FOLDER_PROJETOS_ID}): ${createRes.status} ${errText}` };
  }
  const created = await createRes.json();
  return { id: created.id || null, erro: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record, old_record } = payload;

    if (table !== "propostas" || (type !== "INSERT" && type !== "DELETE")) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (não é criação/exclusão de proposta)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis de ambiente não configuradas (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ───────────────────────────────────────
    // DELETE: exclui a tarefa técnica direto pelo id salvo — mais simples e
    // confiável que buscar por nome na lista.
    // ───────────────────────────────────────
    if (type === "DELETE") {
      const deletedRecord = old_record || record;
      if (!deletedRecord?.clickup_proposta_tecnica_id) {
        return new Response(JSON.stringify({ success: true, message: "Ignorado (sem tarefa técnica associada)" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const clickupToken = await resolveClickUpToken(deletedRecord.criado_por_user_id, supabase);
      const delRes = await clickupFetch(`https://api.clickup.com/api/v2/task/${deletedRecord.clickup_proposta_tecnica_id}`, {
        method: "DELETE",
        headers: { Authorization: clickupToken },
      });
      if (!delRes.ok && delRes.status !== 404) {
        const errText = await delRes.text();
        console.error(`[sync-proposta-tecnica-clickup] Falha ao excluir tarefa técnica ${deletedRecord.clickup_proposta_tecnica_id}: ${delRes.status} ${errText}`);
        return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }

      return new Response(JSON.stringify({ success: true, tarefa_tecnica_excluida: deletedRecord.clickup_proposta_tecnica_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ───────────────────────────────────────
    // INSERT: cria a tarefa técnica na lista da pasta PRE-VENDAS/PROJETOS
    // ───────────────────────────────────────
    if (!record) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (sem record no INSERT)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Idempotência: se já existe clickup_proposta_tecnica_id, essa proposta
    // já foi processada (ex: o webhook disparou mais de uma vez) — não cria
    // uma segunda tarefa.
    if (record.clickup_proposta_tecnica_id) {
      return new Response(JSON.stringify({ success: true, message: "Ignorado (tarefa técnica já existe)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Filtro por tipo de oportunidade: só PROJETO gera lista técnica.
    const cenarioRecord = String(record.cenario || "").trim();
    if (TIPOS_SEM_LISTA_TECNICA.has(cenarioRecord)) {
      return new Response(JSON.stringify({ success: true, message: `Ignorado (tipo de oportunidade "${cenarioRecord}" não gera lista técnica)` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 1) Achar o negócio de origem (pelo clickup_negocio_id, normalizando '#')
    const idLimpo = normalizeId(record.clickup_negocio_id);
    const idComHash = "#" + idLimpo;
    const { data: negocio, error: negocioErr } = await supabase
      .from("negocios")
      .select("nome, numero_proposta_oficial, clickup_negocio_id")
      .or(`clickup_negocio_id.eq.${idLimpo},clickup_negocio_id.eq.${idComHash}`)
      .limit(1)
      .maybeSingle();

    if (negocioErr || !negocio || !negocio.numero_proposta_oficial) {
      console.warn(`[sync-proposta-tecnica-clickup] Ignorado — negócio não encontrado ou sem número de proposta (clickup_negocio_id=${record.clickup_negocio_id}).`);
      return new Response(JSON.stringify({ success: true, message: "Ignorado (negócio sem número de proposta)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const clickupToken = await resolveClickUpToken(record.criado_por_user_id, supabase);

    // 2) Nome da lista técnica e get-or-create
    const nomeLista = `${negocio.numero_proposta_oficial} - ${negocio.nome}`;
    const { id: listaId, erro: erroLista } = await getOrCreateListaTecnica(nomeLista, clickupToken);
    if (!listaId) {
      const detalhe = erroLista || "motivo desconhecido";
      console.error(`[sync-proposta-tecnica-clickup] Falha ao obter/criar lista técnica "${nomeLista}": ${detalhe}`);
      await supabase.from("propostas").update({ sync_status: "failed", sync_error: `Falha ao obter/criar lista técnica "${nomeLista}": ${detalhe}` }).eq("id", record.id);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // 3) Autocorreção: compara a versão calculada pelo CRM com a maior já
    // existente na lista técnica (relevante para negócios que já eram
    // controlados manualmente pelo ClickUp antes do CRM existir).
    const versaoLetrasCrm = String(record.versao || "").replace(/^v/i, "");
    const rankCrm = letterRank(versaoLetrasCrm) || 1;
    const maxRankClickUp = await getMaxVersionRankInList(listaId, clickupToken);
    const rankFinal = maxRankClickUp >= rankCrm ? maxRankClickUp + 1 : rankCrm;
    const versaoFinal = "v" + rankToLetters(rankFinal);

    // 4) Cria a tarefa técnica "Enviar Proposta vX"
    const nomeTarefa = `${PREFIX_TASK}${versaoFinal}`.trim();
    const createRes = await clickupFetch(`https://api.clickup.com/api/v2/list/${listaId}/task`, {
      method: "POST",
      headers: { Authorization: clickupToken, "Content-Type": "application/json" },
      body: JSON.stringify({ name: nomeTarefa, custom_item_id: TECH_CUSTOM_ITEM_ID }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`[sync-proposta-tecnica-clickup] Falha ao criar tarefa técnica: ${createRes.status} ${errText}`);
      await supabase.from("propostas").update({ sync_status: "failed", sync_error: `ClickUp ${createRes.status}: ${errText}` }).eq("id", record.id);
      return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const createdTask = await createRes.json();
    const tarefaTecnicaId = createdTask.id;

    // 5) Salva o id da tarefa técnica (idempotência + base pro DELETE) e,
    // se a versão usada divergiu da calculada pelo CRM (lista técnica
    // estava à frente), corrige propostas.versao pra bater com o que foi
    // de fato criado no ClickUp — sincroniza os dois lados dali em diante.
    const updatePayload: Record<string, unknown> = {
      clickup_proposta_tecnica_id: tarefaTecnicaId,
      sync_status: "synced",
    };
    if (versaoFinal !== record.versao) {
      updatePayload.versao = versaoFinal;
    }
    const { error: updErr } = await supabase.from("propostas").update(updatePayload).eq("id", record.id);
    if (updErr) {
      console.error(`[sync-proposta-tecnica-clickup] Tarefa criada (id=${tarefaTecnicaId}) mas falha ao atualizar Supabase: ${updErr.message}`);
    } else if (versaoFinal !== record.versao) {
      console.log(`[sync-proposta-tecnica-clickup] Versão corrigida de "${record.versao}" para "${versaoFinal}" (proposta id=${record.id}) para bater com o ClickUp.`);
    }

    // 6) Linka de volta ao negócio de origem (não bloqueia)
    if (negocio.clickup_negocio_id) {
      const linkRes = await clickupFetch(`https://api.clickup.com/api/v2/task/${tarefaTecnicaId}/link/${normalizeId(negocio.clickup_negocio_id)}`, {
        method: "POST",
        headers: { Authorization: clickupToken },
      });
      if (!linkRes.ok) {
        console.error(`[sync-proposta-tecnica-clickup] Falha ao vincular ${tarefaTecnicaId} -> ${negocio.clickup_negocio_id}: ${linkRes.status}`);
      }
    }

    return new Response(JSON.stringify({ success: true, lista_id: listaId, tarefa_tecnica_id: tarefaTecnicaId, versao: versaoFinal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[sync-proposta-tecnica-clickup] Erro:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
