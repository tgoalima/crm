import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { validarAutor, ErroAutoria } from "../api-atividades/autoria.ts";
import {
  interpretarComando,
  interpretarConsulta,
  interpretarConsultaEvidencias,
  enriquecerRosComEvidencias,
  obterHojeSp,
  predicadoIlikePostgrest,
  ErroComando,
} from "./dominio.ts";
import { coletarEvidenciasHumanas, lerClassificacaoAutores } from "../mcp-brain/evidencias-humanas.ts";
import { coletarComentariosClickUp } from "../mcp-brain/comentarios.ts";

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

const UUID_NULO = "00000000-0000-0000-0000-000000000000";

function idsUnicos(registros: Array<{ id: string }> | null): string[] {
  return [...new Set((registros || []).map((registro) => registro.id).filter(Boolean))];
}

async function buscarIdsContas(supabase: any, termo: string): Promise<string[]> {
  const padrao = `%${termo}%`;
  const resultados = await Promise.all([
    supabase.from("contas").select("id").ilike("nome", padrao),
    supabase.from("contas").select("id").ilike("razao_social", padrao),
  ]);
  const falha = resultados.find(({ error }) => error)?.error;
  if (falha) throw new Error(`Falha ao pesquisar clientes: ${falha.message}`);
  return idsUnicos(resultados.flatMap(({ data }) => data || []));
}

async function buscarIdsNegocios(supabase: any, termo: string, incluirConta: boolean): Promise<string[]> {
  const consultas: any[] = [
    supabase.from("negocios").select("id").ilike("nome", `%${termo}%`),
  ];
  if (incluirConta) {
    const contaIds = await buscarIdsContas(supabase, termo);
    if (contaIds.length) consultas.push(supabase.from("negocios").select("id").in("conta_id", contaIds));
  }
  const resultados = await Promise.all(consultas);
  const falha = resultados.find(({ error }) => error)?.error;
  if (falha) throw new Error(`Falha ao pesquisar oportunidades: ${falha.message}`);
  return idsUnicos(resultados.flatMap(({ data }) => data || []));
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
      if (tail && tail !== "resumo" && tail !== "evidencias" && !/^[0-9a-f-]{36}$/i.test(tail)) {
        throw new ErroComando(404, "Rota não encontrada.");
      }

      // Rota de Evidências Humanas (Task 8): Tratar antes de interpretarConsulta
      // para garantir que data_inicio e data_fim nunca sejam passados para interpretarConsulta
      if (tail === "evidencias") {
        const consultaEvidencias = interpretarConsultaEvidencias(url.searchParams);

        let queryEvidencias = supabase.from("registros_oportunidade").select(`
          id, numero_ro, categoria, cenario, situacao, data_vencimento, responsavel_operacional_clickup_id,
          fabricantes_ro(id,nome,prazo_inicial_sugerido_dias,limite_renovacoes),
          negocios(id,nome,conta_id,clickup_negocio_id,contas(id,nome,razao_social)),
          renovacoes_ro(ciclo,situacao)
        `, { count: "exact" });

        if (consultaEvidencias.negocio_id) queryEvidencias = queryEvidencias.eq("negocio_id", consultaEvidencias.negocio_id);
        if (consultaEvidencias.fabricante_id) queryEvidencias = queryEvidencias.eq("fabricante_id", consultaEvidencias.fabricante_id);
        if (consultaEvidencias.fabricante) queryEvidencias = queryEvidencias.ilike("fabricantes_ro.nome", `%${consultaEvidencias.fabricante}%`);
        if (consultaEvidencias.situacao) queryEvidencias = queryEvidencias.eq("situacao", consultaEvidencias.situacao);
        else queryEvidencias = queryEvidencias.in("situacao", ["Backoffice", "Aguardando aprovação", "Aprovada"]);
        if (consultaEvidencias.responsavel) queryEvidencias = queryEvidencias.eq("responsavel_operacional_clickup_id", consultaEvidencias.responsavel);
        if (consultaEvidencias.numero_ro) queryEvidencias = queryEvidencias.ilike("numero_ro", `%${consultaEvidencias.numero_ro}%`);

        if (consultaEvidencias.cliente) {
          const contaIds = await buscarIdsContas(supabase, consultaEvidencias.cliente);
          const { data: negsMatch } = await supabase
            .from("negocios")
            .select("id")
            .in("conta_id", contaIds.length > 0 ? contaIds : [UUID_NULO]);
          const negIds = idsUnicos(negsMatch);
          queryEvidencias = queryEvidencias.in("negocio_id", negIds.length > 0 ? negIds : [UUID_NULO]);
        }

        if (consultaEvidencias.oportunidade) {
          const negIds = await buscarIdsNegocios(supabase, consultaEvidencias.oportunidade, false);
          queryEvidencias = queryEvidencias.in("negocio_id", negIds.length > 0 ? negIds : [UUID_NULO]);
        }

        if (consultaEvidencias.busca) {
          const negIds = await buscarIdsNegocios(supabase, consultaEvidencias.busca, true);
          if (negIds.length > 0) {
            queryEvidencias = queryEvidencias.or(`${predicadoIlikePostgrest("numero_ro", consultaEvidencias.busca)},negocio_id.in.(${negIds.join(",")})`);
          } else {
            queryEvidencias = queryEvidencias.ilike("numero_ro", `%${consultaEvidencias.busca}%`);
          }
        }

        const offsetEvid = (consultaEvidencias.pagina - 1) * consultaEvidencias.limite;
        const { data: rosBrutas, error: erroRos, count: totalCount } = await queryEvidencias
          .order("data_vencimento", { ascending: true, nullsFirst: false })
          .range(offsetEvid, offsetEvid + consultaEvidencias.limite - 1);

        if (erroRos) throw new Error(`Falha ao consultar R.Os para evidências: ${erroRos.message}`);

        // Extrai oportunidades distintas (reutilização de coleta)
        const tarefasIds = [...new Set((rosBrutas || []).map((r: any) => r.negocios?.clickup_negocio_id).filter(Boolean))];

        // Carregar e validar estritamente a classificação de autores.
        // Ausência ou erro deve tornar a coleta indisponível/parcial explicitamente.
        let autores: Record<string, any> | null = null;
        let erroClassificacaoAutores: Error | null = null;
        try {
          autores = lerClassificacaoAutores(Deno.env.get("CRM_AUTORES_CLASSIFICACAO_JSON"));
        } catch (errAutores) {
          console.warn("[api-ros/evidencias] Classificação de autores ausente ou inválida:", errAutores);
          erroClassificacaoAutores = errAutores instanceof Error ? errAutores : new Error("Classificação de autores não configurada.");
        }

        const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");
        const mapaEvidencias = new Map<string, any | Error>();

        for (let i = 0; i < tarefasIds.length; i += 4) {
          const lote = tarefasIds.slice(i, i + 4);
          await Promise.all(lote.map(async (taskId) => {
            if (erroClassificacaoAutores || !autores) {
              mapaEvidencias.set(taskId, erroClassificacaoAutores || new Error("Autores não configurados"));
              return;
            }

            try {
              const buscarClickUp = clickupToken ? () => coletarComentariosClickUp(async (cursor) => {
                const query = cursor ? `?${new URLSearchParams(cursor)}` : "";
                const resp = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment${query}`, {
                  headers: { Authorization: clickupToken },
                  signal: AbortSignal.timeout(10000),
                });
                if (!resp.ok) throw new Error(`Falha ao consultar comentários ClickUp (${resp.status})`);
                return resp.json();
              }) : undefined;

              const coleta = await coletarEvidenciasHumanas(async (inicio, fim) => {
                const { data: ativs, error: errAtivs } = await supabase.from("atividades_negocio")
                  .select("id,clickup_comment_id,autor_clickup_id,autor_nome,origem,data_execucao,texto,anexos")
                  .eq("clickup_negocio_id", taskId).order("id", { ascending: true }).range(inicio, fim);
                if (errAtivs) throw new Error("Falha ao consultar atividades do CRM.");
                return ativs || [];
              }, autores, 50, buscarClickUp);

              mapaEvidencias.set(taskId, coleta);
            } catch (errColeta) {
              console.warn(`[api-ros/evidencias] Falha na coleta da oportunidade ${taskId}:`, errColeta);
              mapaEvidencias.set(taskId, errColeta instanceof Error ? errColeta : new Error("Falha desconhecida"));
            }
          }));
        }

        const resultadoEnriquecido = enriquecerRosComEvidencias(
          rosBrutas || [],
          mapaEvidencias,
          consultaEvidencias.data_inicio,
          consultaEvidencias.data_fim,
          obterHojeSp(),
        );

        return json({
          data: resultadoEnriquecido.ros,
          total: totalCount || 0,
          total_sem_atualizacao_confirmada: resultadoEnriquecido.total_sem_atualizacao_confirmada,
          total_cobertura_desconhecida: resultadoEnriquecido.total_cobertura_desconhecida,
          total_com_atualizacao: resultadoEnriquecido.total_com_atualizacao,
          total_sem_atualizacao: resultadoEnriquecido.total_sem_atualizacao_confirmada,
          cobertura_evidencias_completa: resultadoEnriquecido.cobertura_evidencias_completa,
          data_inicio: consultaEvidencias.data_inicio,
          data_fim: consultaEvidencias.data_fim,
          pagina: consultaEvidencias.pagina,
          limite: consultaEvidencias.limite,
          total_paginas: Math.ceil((totalCount || 0) / consultaEvidencias.limite),
        });
      }

      // Rota de Lista e Resumo chamam interpretarConsulta estritamente
      const consulta = interpretarConsulta(url.searchParams);

      if (tail === "resumo") {
        const { data: resumoRpc, error: resumoError } = await supabase.rpc("ro_resumo_agregado", {
          p_negocio_id: consulta.negocio_id,
          p_fabricante_id: consulta.fabricante_id,
          p_situacao: consulta.situacao,
          p_responsavel: consulta.responsavel,
          p_vence_ate: consulta.vence_ate,
          p_cliente: consulta.cliente,
          p_oportunidade: consulta.oportunidade,
          p_numero_ro: consulta.numero_ro,
          p_busca: consulta.busca,
        });

        if (resumoError || !resumoRpc) {
          throw new ErroComando(
            500,
            `Falha ao calcular resumo agregado de R.Os: ${resumoError?.message || "Sem retorno da RPC"}`,
          );
        }

        return json(resumoRpc);
      }

      let query = supabase.from("registros_oportunidade").select(`
        *, fabricantes_ro(id,nome,prazo_inicial_sugerido_dias,limite_renovacoes),
        negocios(id,nome,conta_id,clickup_negocio_id,contas(id,nome,razao_social)),
        renovacoes_ro(*), eventos_ro(*)
      `, { count: "exact" });
      if (tail) query = query.eq("id", tail);
      if (consulta.conta_id) {
        const { data: negsConta, error: errNegsConta } = await supabase
          .from("negocios")
          .select("id")
          .eq("conta_id", consulta.conta_id);
        if (errNegsConta) {
          throw new ErroComando(500, `Falha ao consultar oportunidades da conta: ${errNegsConta.message}`);
        }
        const negIds = idsUnicos(negsConta);
        query = query.in("negocio_id", negIds.length > 0 ? negIds : [UUID_NULO]);
      }
      if (consulta.negocio_id) query = query.eq("negocio_id", consulta.negocio_id);
      if (consulta.fabricante_id) query = query.eq("fabricante_id", consulta.fabricante_id);
      if (consulta.situacao) query = query.eq("situacao", consulta.situacao);
      if (consulta.responsavel) query = query.eq("responsavel_operacional_clickup_id", consulta.responsavel);
      if (consulta.vence_ate) query = query.lte("data_vencimento", consulta.vence_ate);
      if (consulta.numero_ro) query = query.ilike("numero_ro", `%${consulta.numero_ro}%`);

      if (consulta.cliente) {
        const contaIds = await buscarIdsContas(supabase, consulta.cliente);
        const { data: negsMatch } = await supabase
          .from("negocios")
          .select("id")
          .in("conta_id", contaIds.length > 0 ? contaIds : [UUID_NULO]);
        const negIds = idsUnicos(negsMatch);
        query = query.in("negocio_id", negIds.length > 0 ? negIds : [UUID_NULO]);
      }

      if (consulta.oportunidade) {
        const negIds = await buscarIdsNegocios(supabase, consulta.oportunidade, false);
        query = query.in("negocio_id", negIds.length > 0 ? negIds : [UUID_NULO]);
      }

      if (consulta.busca) {
        const negIds = await buscarIdsNegocios(supabase, consulta.busca, true);

        if (negIds.length > 0) {
          query = query.or(`${predicadoIlikePostgrest("numero_ro", consulta.busca)},negocio_id.in.(${negIds.join(",")})`);
        } else {
          query = query.ilike("numero_ro", `%${consulta.busca}%`);
        }
      }

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
