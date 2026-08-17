// Definição e implementação das tools MCP expostas ao ClickUp Brain.
// Todas são somente leitura sobre o Supabase (+ ClickUp para resolver clientes
// e estágio do negócio no funil).

import { supabase } from "./supabase.ts";
import { ESTAGIOS_FORA_DO_PIPELINE } from "./clickup.ts";

// Resolve uma Conta pelo nome direto na tabela `contas` do Supabase (populada
// por scripts/migracao_contas_contatos_clickup.py a partir da lista Contas do
// ClickUp) — sem nenhuma chamada à API do ClickUp. Tenta igualdade
// case-insensitive primeiro, depois substring (acelerado pelo índice
// gin_trgm_ops criado em 20260817_contas_contatos.sql).
async function resolverContaPorNome(nomeCliente: string): Promise<{ id: string; nome: string } | null> {
  const termo = nomeCliente.trim();
  if (!termo) return null;

  const exata = await supabase.from("contas").select("id, nome").ilike("nome", termo).limit(1);
  if (exata.data && exata.data.length > 0) return exata.data[0];

  const parcial = await supabase.from("contas").select("id, nome").ilike("nome", `%${termo}%`).limit(1);
  if (parcial.data && parcial.data.length > 0) return parcial.data[0];

  return null;
}

const PROPOSTA_SELECT = `
  id, clickup_negocio_id, versao, cenario, situacao, total_proposta,
  criado_por, created_at, motivo_perda, data_fechamento,
  itens_proposta (
    id, quantidade, preco_unitario, total_item,
    produtos ( id, nome, fabricante ),
    distribuidores ( id, nome )
  )
`;

export const TOOLS = [
  {
    name: "buscar_proposta_por_negocio",
    description:
      "Retorna a(s) proposta(s) de um negócio do ClickUp, com itens, produtos e distribuidores.",
    inputSchema: {
      type: "object",
      properties: {
        clickup_task_id: {
          type: "string",
          description: "ID da tarefa 'Negócio' no ClickUp (clickup_negocio_id)",
        },
      },
      required: ["clickup_task_id"],
    },
  },
  {
    name: "listar_propostas_por_situacao",
    description:
      "Lista propostas filtradas pela situação bruta da proposta no Supabase (Ativa, Selecionada, Inativa, Ganho, Perdido). Para saber o estágio real do negócio no funil do ClickUp (Ganho/Perdido/Congelado/em andamento), prefira resumo_forecast ou negocios_fechados.",
    inputSchema: {
      type: "object",
      properties: {
        situacao: {
          type: "string",
          enum: ["Ativa", "Selecionada", "Inativa", "Ganho", "Perdido"],
          description:
            "'Selecionada' é a versão escolhida para o negócio (inclui negócios já Ganhos, não só em andamento). 'Inativa' é uma versão substituída por outra.",
        },
        limite: { type: "number", description: "Máximo de resultados (padrão 50)" },
      },
      required: ["situacao"],
    },
  },
  {
    name: "resumo_forecast",
    description:
      "Resumo do forecast atual: mesmo cálculo do card 'Total em Negociação' do Pipeline de Vendas no SPA (soma o valor de cada negócio ainda em andamento no funil, excluindo Ganho/Perdido/Congelado), com breakdown por fabricante e distribuidor.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "negocios_fechados",
    description:
      "Lista e soma negócios por estágio de fechamento no funil do ClickUp (Ganho, Perdido ou Congelado) — reflete exatamente os filtros '🏆 Ganho' / '😞 Perdido' / '❄️ Congelado' do Pipeline de Vendas no SPA. Use para 'quantos negócios ganhamos', 'total perdido no ano', 'histórico de negócios fechados/ganhos/perdidos de um cliente'.",
    inputSchema: {
      type: "object",
      properties: {
        estagio: { type: "string", enum: ["Ganho", "Perdido", "Congelado"] },
        nome_cliente: {
          type: "string",
          description: "Opcional — filtra só os negócios desse estágio para essa empresa (resolvida pela lista Contas do ClickUp).",
        },
        data_inicio: { type: "string", description: "YYYY-MM-DD, opcional — filtra pela data de fechamento da proposta" },
        data_fim: { type: "string", description: "YYYY-MM-DD, opcional" },
      },
      required: ["estagio"],
    },
  },
  {
    name: "analise_por_fabricante",
    description:
      "Lista propostas (qualquer situação/estágio) que contêm itens de um fabricante específico (ex: DELL, FORTINET, VMWARE), com valores e negócios.",
    inputSchema: {
      type: "object",
      properties: { fabricante: { type: "string" } },
      required: ["fabricante"],
    },
  },
  {
    name: "analise_por_distribuidor",
    description:
      "Lista propostas (qualquer situação/estágio) com itens vinculados a um distribuidor específico (ex: Ingram Micro, TD Synnex), com valores.",
    inputSchema: {
      type: "object",
      properties: { distribuidor: { type: "string" } },
      required: ["distribuidor"],
    },
  },
  {
    name: "historico_cliente",
    description:
      "Histórico completo de negócios de um cliente, cada um já rotulado com o estágio real no funil do ClickUp (Ganho/Perdido/Congelado/em andamento) e o valor calculado do mesmo jeito que o SPA mostra. O cliente é resolvido pela lista 'Contas' do ClickUp.",
    inputSchema: {
      type: "object",
      properties: {
        nome_cliente: { type: "string" },
        estagio: {
          type: "string",
          enum: ["Ganho", "Perdido", "Congelado", "Em andamento"],
          description: "Opcional — filtra só os negócios desse cliente nesse estágio.",
        },
      },
      required: ["nome_cliente"],
    },
  },
  {
    name: "ranking_clientes",
    description:
      "Ranking de clientes por valor total de propostas Selecionadas (vendas fechadas), opcionalmente filtrado por período de fechamento. Cobre 100% das propostas, sem amostragem.",
    inputSchema: {
      type: "object",
      properties: {
        top_n: { type: "number", description: "Quantidade de clientes no ranking (padrão 10)" },
        data_inicio: { type: "string", description: "Data de fechamento inicial, formato YYYY-MM-DD" },
        data_fim: { type: "string", description: "Data de fechamento final, formato YYYY-MM-DD" },
      },
    },
  },
];

export async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "buscar_proposta_por_negocio":
      return buscarPropostaPorNegocio(String(args.clickup_task_id || ""));
    case "listar_propostas_por_situacao":
      return listarPropostasPorSituacao(String(args.situacao || ""), Number(args.limite) || 50);
    case "resumo_forecast":
      return resumoForecast();
    case "negocios_fechados":
      return negociosFechados(
        String(args.estagio || ""),
        args.nome_cliente ? String(args.nome_cliente) : undefined,
        args.data_inicio ? String(args.data_inicio) : undefined,
        args.data_fim ? String(args.data_fim) : undefined,
      );
    case "analise_por_fabricante":
      return analisePorFabricante(String(args.fabricante || ""));
    case "analise_por_distribuidor":
      return analisePorDistribuidor(String(args.distribuidor || ""));
    case "historico_cliente":
      return historicoCliente(String(args.nome_cliente || ""), args.estagio ? String(args.estagio) : undefined);
    case "ranking_clientes":
      return rankingClientes(
        Number(args.top_n) || 10,
        args.data_inicio ? String(args.data_inicio) : undefined,
        args.data_fim ? String(args.data_fim) : undefined,
      );
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

async function buscarPropostaPorNegocio(clickupTaskId: string) {
  if (!clickupTaskId) throw new Error("clickup_task_id é obrigatório");
  const { data, error } = await supabase
    .from("propostas")
    .select(PROPOSTA_SELECT)
    .eq("clickup_negocio_id", clickupTaskId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { negocio_id: clickupTaskId, propostas: data };
}

async function listarPropostasPorSituacao(situacao: string, limite: number) {
  if (!situacao) throw new Error("situacao é obrigatória");
  const { data, error } = await supabase
    .from("propostas")
    .select(PROPOSTA_SELECT)
    .eq("situacao", situacao)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return { situacao, total: data?.length ?? 0, propostas: data };
}

// Réplica de getOpportunityValue() em app.js: por negócio, usa a proposta
// Supabase de maior prioridade (Selecionada > Ganho > Ativa > Desconsiderada
// > qualquer outra) e só cai para o valor do campo do ClickUp se o negócio
// não tiver nenhuma proposta no Supabase. "Selecionada" sozinha NÃO basta
// como proxy de estágio, porque também é usada em negócios já Ganhos — o
// estágio real vem sempre do ClickUp (custom field "Estágio da Venda").
const PRIORIDADE_SITUACAO = ["Selecionada", "Ganho", "Ativa", "Desconsiderada"];

function resolverMelhorProposta(props: any[]): any | null {
  for (const situacao of PRIORIDADE_SITUACAO) {
    const found = props.find((p) => p.situacao === situacao);
    if (found) return found;
  }
  return props[0] || null;
}

// Busca propostas para uma lista de negócios em lotes, evitando estourar o
// limite de tamanho de URL do PostgREST quando há centenas de IDs (ex: os
// ~440 negócios Ganhos).
const SUPABASE_IN_CHUNK_SIZE = 150;

async function fetchPropostasPorNegocios(ids: string[]): Promise<Map<string, any[]>> {
  const map = new Map<string, any[]>();
  for (let i = 0; i < ids.length; i += SUPABASE_IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + SUPABASE_IN_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from("propostas").select(PROPOSTA_SELECT).in("clickup_negocio_id", chunk);
    if (error) throw new Error(error.message);
    for (const p of data || []) {
      const lista = map.get(p.clickup_negocio_id) || [];
      lista.push(p);
      map.set(p.clickup_negocio_id, lista);
    }
  }
  return map;
}

async function resumoForecast() {
  // 100% Supabase agora: `negocios.estagio` é populado por
  // scripts/migracao_negocios_clickup.py a partir do custom field "Estágio
  // da Venda" do ClickUp — nenhuma chamada ao ClickUp acontece mais aqui.
  const { data: negociosAtivos, error } = await supabase
    .from("negocios")
    .select("clickup_negocio_id, nome, valor_clickup_fallback")
    .not("estagio", "in", "(Ganho,Perdido,Congelado)")
    .not("estagio", "is", null);
  if (error) throw new Error(error.message);

  const propostasPorNegocio = await fetchPropostasPorNegocios((negociosAtivos || []).map((n) => n.clickup_negocio_id));

  const porFabricante = new Map<string, number>();
  const porDistribuidor = new Map<string, number>();
  let total = 0;

  for (const negocio of negociosAtivos || []) {
    const props = propostasPorNegocio.get(negocio.clickup_negocio_id) || [];
    const melhor = resolverMelhorProposta(props);

    if (melhor) {
      total += Number(melhor.total_proposta) || 0;
      for (const item of melhor.itens_proposta || []) {
        const fab = item.produtos?.fabricante || "Desconhecido";
        const dist = item.distribuidores?.nome || "Desconhecido";
        const totalItem = Number(item.total_item) || 0;
        porFabricante.set(fab, (porFabricante.get(fab) || 0) + totalItem);
        porDistribuidor.set(dist, (porDistribuidor.get(dist) || 0) + totalItem);
      }
    } else if (negocio.valor_clickup_fallback != null) {
      total += negocio.valor_clickup_fallback;
    }
  }

  return {
    total_em_negociacao: total,
    negocios_em_andamento: (negociosAtivos || []).length,
    por_fabricante: Object.fromEntries(porFabricante),
    por_distribuidor: Object.fromEntries(porDistribuidor),
  };
}

const NEGOCIOS_FECHADOS_LISTA_MAX = 100;

async function negociosFechados(estagio: string, nomeCliente?: string, dataInicio?: string, dataFim?: string) {
  if (!estagio) throw new Error("estagio é obrigatório");

  let clienteResolvido: string | null = null;
  let query = supabase
    .from("negocios")
    .select("clickup_negocio_id, nome, valor_clickup_fallback")
    .eq("estagio", estagio);

  if (nomeCliente) {
    const conta = await resolverContaPorNome(nomeCliente);
    if (!conta) {
      return { cliente_buscado: nomeCliente, encontrado: false, mensagem: "Cliente não encontrado na tabela de Contas." };
    }
    clienteResolvido = conta.nome;
    query = query.eq("conta_id", conta.id);
  }

  const { data: candidatos, error: negError } = await query;
  if (negError) throw new Error(negError.message);

  const propostasPorNegocio = await fetchPropostasPorNegocios((candidatos || []).map((n) => n.clickup_negocio_id));

  let total = 0;
  const negocios: any[] = [];
  for (const negocio of candidatos || []) {
    const props = propostasPorNegocio.get(negocio.clickup_negocio_id) || [];
    const melhor = resolverMelhorProposta(props);
    const dataFechamento = melhor?.data_fechamento || null;

    if (dataInicio && (!dataFechamento || dataFechamento < dataInicio)) continue;
    if (dataFim && (!dataFechamento || dataFechamento > dataFim)) continue;

    const valor = melhor ? Number(melhor.total_proposta) || 0 : negocio.valor_clickup_fallback || 0;
    total += valor;
    negocios.push({
      negocio_id: negocio.clickup_negocio_id,
      nome: negocio.nome,
      valor,
      data_fechamento: dataFechamento,
      versao: melhor?.versao || null,
      motivo_perda: melhor?.motivo_perda || null,
    });
  }

  negocios.sort((a, b) => b.valor - a.valor);

  return {
    estagio,
    cliente: clienteResolvido,
    periodo: { data_inicio: dataInicio || null, data_fim: dataFim || null },
    total_valor: total,
    total_negocios: negocios.length,
    negocios: negocios.slice(0, NEGOCIOS_FECHADOS_LISTA_MAX),
    nota:
      negocios.length > NEGOCIOS_FECHADOS_LISTA_MAX
        ? `Mostrando os ${NEGOCIOS_FECHADOS_LISTA_MAX} de maior valor, de um total de ${negocios.length} negócios (o total_valor já soma todos).`
        : undefined,
  };
}

async function analisePorFabricante(fabricante: string) {
  if (!fabricante) throw new Error("fabricante é obrigatório");
  const { data, error } = await supabase.from("propostas").select(PROPOSTA_SELECT);
  if (error) throw new Error(error.message);

  const alvo = fabricante.trim().toUpperCase();
  const negocios = (data || [])
    .map((p: any) => ({
      ...p,
      itens_proposta: (p.itens_proposta || []).filter((i: any) =>
        (i.produtos?.fabricante || "").toUpperCase().includes(alvo)
      ),
    }))
    .filter((p: any) => p.itens_proposta.length > 0);

  return { fabricante, negocios };
}

async function analisePorDistribuidor(distribuidor: string) {
  if (!distribuidor) throw new Error("distribuidor é obrigatório");
  const { data, error } = await supabase.from("propostas").select(PROPOSTA_SELECT);
  if (error) throw new Error(error.message);

  const alvo = distribuidor.trim().toUpperCase();
  const negocios = (data || [])
    .map((p: any) => ({
      ...p,
      itens_proposta: (p.itens_proposta || []).filter((i: any) =>
        (i.distribuidores?.nome || "").toUpperCase().includes(alvo)
      ),
    }))
    .filter((p: any) => p.itens_proposta.length > 0);

  return { distribuidor, negocios };
}

async function historicoCliente(nomeCliente: string, estagioFiltro?: string) {
  if (!nomeCliente) throw new Error("nome_cliente é obrigatório");

  // 100% Supabase: conta, negócios e estágio já vêm todos das tabelas
  // (`contas`/`negocios`) — nenhuma chamada ao ClickUp acontece mais aqui.
  const conta = await resolverContaPorNome(nomeCliente);
  if (!conta) {
    return {
      cliente_buscado: nomeCliente,
      encontrado: false,
      mensagem: "Cliente não encontrado na tabela de Contas.",
    };
  }

  const { data: negociosDaConta, error: negError } = await supabase
    .from("negocios")
    .select("clickup_negocio_id, nome, estagio, valor_clickup_fallback")
    .eq("conta_id", conta.id);
  if (negError) throw new Error(negError.message);

  if (!negociosDaConta || negociosDaConta.length === 0) {
    return { cliente: conta.nome, conta_id: conta.id, total_negocios: 0, negocios: [] };
  }

  const propostasPorNegocio = await fetchPropostasPorNegocios(negociosDaConta.map((n) => n.clickup_negocio_id));

  let negocios = negociosDaConta.map((n) => {
    const props = propostasPorNegocio.get(n.clickup_negocio_id) || [];
    const melhor = resolverMelhorProposta(props);
    const estagioLabel = n.estagio && !ESTAGIOS_FORA_DO_PIPELINE.has(n.estagio) ? "Em andamento" : n.estagio;
    return {
      negocio_id: n.clickup_negocio_id,
      nome: n.nome,
      estagio: estagioLabel,
      valor: melhor ? Number(melhor.total_proposta) || 0 : n.valor_clickup_fallback || 0,
      proposta: melhor
        ? {
            versao: melhor.versao,
            situacao: melhor.situacao,
            data_fechamento: melhor.data_fechamento,
            motivo_perda: melhor.motivo_perda,
            itens: melhor.itens_proposta,
          }
        : null,
    };
  });

  if (estagioFiltro) {
    negocios = negocios.filter((n) => n.estagio === estagioFiltro);
  }

  negocios.sort((a, b) => (b.proposta?.data_fechamento || "").localeCompare(a.proposta?.data_fechamento || ""));

  return { cliente: conta.nome, conta_id: conta.id, total_negocios: negocios.length, negocios };
}

// Antes desta fase, resolver o cliente de cada proposta exigia uma chamada
// individual ao ClickUp por negócio (rate limit ~100/min, estourava o timeout
// de 60s do worker acima de ~60 propostas). Com `propostas.conta_id` populado
// por scripts/migracao_contas_contatos_clickup.py, isso vira uma query SQL
// direta — sem nenhuma chamada ao ClickUp, sem limite de amostra.
async function rankingClientes(topN: number, dataInicio?: string, dataFim?: string) {
  let query = supabase
    .from("propostas")
    .select("total_proposta, conta_id, contas(nome)")
    .eq("situacao", "Selecionada");
  if (dataInicio) query = query.gte("data_fechamento", dataInicio);
  if (dataFim) query = query.lte("data_fechamento", dataFim);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const totalPorCliente = new Map<string, number>();
  for (const p of data || []) {
    const cliente = (p as any).contas?.nome || "(sem conta vinculada)";
    totalPorCliente.set(cliente, (totalPorCliente.get(cliente) || 0) + (Number(p.total_proposta) || 0));
  }

  const ranking = [...totalPorCliente.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([cliente, total], i) => ({ posicao: i + 1, cliente, total_vendido: total }));

  return {
    periodo: { data_inicio: dataInicio || null, data_fim: dataFim || null },
    ranking,
  };
}
