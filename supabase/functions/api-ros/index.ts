import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { validarAutor, ErroAutoria } from "../api-atividades/autoria.ts";
import { interpretarComando, interpretarConsulta, ErroComando } from "./dominio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function caminho(url: URL) {
  return url.pathname.replace(/^\/+/, "")
    .replace(/^functions\/v1\/?/, "")
    .replace(/^api-ros\/?/, "")
    .replace(/^\/+|\/+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Supabase não configurado." }, 500);
  }

  try {
    const token = req.headers.get("Authorization");
    const autor = await validarAutor(token, null, (credencial) =>
      fetch("https://api.clickup.com/api/v2/user", {
        headers: { Authorization: credencial }, signal: AbortSignal.timeout(10000),
      })
    );
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: cadastrado, error: cadastroError } = await supabase
      .from("usuarios_clickup_registrados")
      .select("clickup_user_id")
      .eq("clickup_user_id", autor.id)
      .maybeSingle();
    if (cadastroError) throw new Error("Não foi possível validar o acesso ao CRM.");
    if (!cadastrado) throw new ErroAutoria(403, "Usuário não cadastrado no CRM.");
    const url = new URL(req.url);
    const tail = caminho(url);

    if (req.method === "GET") {
      if (tail && !/^[0-9a-f-]{36}$/i.test(tail)) throw new ErroComando(404, "Rota não encontrada.");
      const consulta = interpretarConsulta(url.searchParams);
      let query = supabase.from("registros_oportunidade").select(`
        *, fabricantes_ro(id,nome,prazo_inicial_sugerido_dias,limite_renovacoes),
        negocios(id,nome,conta_id,clickup_negocio_id),
        renovacoes_ro(*), eventos_ro(*)
      `, { count: "exact" });
      if (tail) query = query.eq("id", tail);
      if (consulta.negocio_id) query = query.eq("negocio_id", consulta.negocio_id);
      if (consulta.fabricante_id) query = query.eq("fabricante_id", consulta.fabricante_id);
      if (consulta.situacao) query = query.eq("situacao", consulta.situacao);
      if (consulta.responsavel) query = query.eq("responsavel_operacional_clickup_id", consulta.responsavel);
      if (consulta.vence_ate) query = query.lte("data_vencimento", consulta.vence_ate);

      const offset = (consulta.pagina - 1) * consulta.limite;
      const { data, error, count } = await query.order("data_vencimento", { ascending: true, nullsFirst: false })
        .range(offset, offset + consulta.limite - 1);
      if (error) throw new Error(`Falha ao consultar R.Os: ${error.message}`);
      return json({
        data,
        total: count || 0,
        pagina: consulta.pagina,
        limite: consulta.limite,
        total_paginas: Math.ceil((count || 0) / consulta.limite),
      });
    }

    const body = await req.json().catch(() => { throw new ErroComando(400, "JSON inválido."); });
    const requestIdHeader = req.headers.get("x-request-id");
    if (requestIdHeader && !body.request_id) {
      body.request_id = requestIdHeader;
    }
    const comando = interpretarComando(req.method, tail, body);
    const { data, error } = await supabase.rpc(comando.rpc, {
      ...comando.params,
      p_autor_clickup_id: autor.id,
      p_autor_nome: autor.nome,
    });
    if (error) {
      console.error("[api-ros] RPC falhou", { rpc: comando.rpc, code: error.code, message: error.message });
      const conflito = error.code === "23505" || error.code === "23514" || error.code === "P0001";
      return json({ error: conflito ? error.message : "Não foi possível concluir a operação da R.O." }, conflito ? 409 : 500);
    }
    return json({ data }, comando.rpc === "ro_criar" ? 201 : 200);
  } catch (error) {
    const status = error instanceof ErroAutoria || error instanceof ErroComando ? error.status : 500;
    console.error("[api-ros] Erro", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, status);
  }
});

