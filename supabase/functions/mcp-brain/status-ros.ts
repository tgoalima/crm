export type ArgsStatusRos = {
  fabricante?: string;
  cliente?: string;
  situacao?: string;
  apenas_vencendo?: boolean;
  data_inicio?: string;
  data_fim?: string;
  pagina?: number;
  limite?: number;
  numero_ro?: string;
  oportunidade?: string;
  responsavel?: string;
  incluir_historicas?: boolean;
};

type Args = ArgsStatusRos;

type Dependencias = {
  hoje: string;
  buscarRos: (args: Args & { pagina: number; limite: number }) => Promise<{ registros: any[]; total: number }>;
  buscarEvidencias: (clickupTaskId: string) => Promise<any>;
};

function validarData(valor: string, nome: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) {
    throw new Error(`${nome} deve usar YYYY-MM-DD.`);
  }
}

function vigencia(vencimento: string | null, hoje: string) {
  if (!vencimento) return 'Sem prazo';
  const dias = Math.round((Date.parse(`${vencimento}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000);
  if (dias < 0) return 'Vencida';
  if (dias === 0) return 'Vence hoje';
  if (dias <= 15) return 'A vencer';
  return 'Vigente';
}

async function emLotes<T, R>(itens: T[], tamanho: number, executar: (item: T) => Promise<R>) {
  const resultado = new Map<T, R | Error>();
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(async (item) => {
      try { resultado.set(item, await executar(item)); }
      catch (error) { resultado.set(item, error instanceof Error ? error : new Error('Falha desconhecida')); }
    }));
  }
  return resultado;
}

export async function consultarStatusRos(args: Args, deps: Dependencias) {
  const pagina = args.pagina ?? 1;
  const limite = args.limite ?? 50;
  if (!Number.isInteger(pagina) || pagina < 1) throw new Error('Página inválida.');
  if (!Number.isInteger(limite) || limite < 1 || limite > 200) throw new Error('Limite deve estar entre 1 e 200.');
  const inicioPadrao = `${deps.hoje.slice(0, 7)}-01`;
  const dataInicio = args.data_inicio || inicioPadrao;
  const dataFim = args.data_fim || deps.hoje;
  validarData(dataInicio, 'data_inicio');
  validarData(dataFim, 'data_fim');
  if (dataInicio > dataFim) throw new Error('Período inválido: data_inicio é posterior a data_fim.');

  const { registros, total } = await deps.buscarRos({ ...args, pagina, limite });
  const negocios = [...new Set(registros.map((ro) => ro.negocio?.clickup_negocio_id).filter(Boolean))];
  const evidencias = await emLotes(negocios, 4, deps.buscarEvidencias);
  let coberturaCompleta = true;

  const ros = registros.map((ro) => {
    const idNegocio = ro.negocio?.clickup_negocio_id;
    const coleta = idNegocio ? evidencias.get(idNegocio) : new Error('Oportunidade sem ID ClickUp');
    const alertas: string[] = [];
    let lista: any[] = [];
    if (coleta instanceof Error || !coleta) {
      coberturaCompleta = false;
      alertas.push('Não foi possível consultar as evidências humanas desta oportunidade.');
    } else {
      lista = coleta.evidencias || [];
      if (coleta.cobertura_banco_completa === false || coleta.cobertura_clickup_completa === false) {
        coberturaCompleta = false;
        alertas.push('A cobertura das evidências desta oportunidade está incompleta.');
      }
    }
    const noPeriodo = lista.find((a) => {
      const dia = String(a.data || '').slice(0, 10);
      return dia >= dataInicio && dia <= dataFim;
    }) || null;
    if (!noPeriodo) alertas.unshift(`Sem atualização humana entre ${dataInicio} e ${dataFim}.`);
    return {
      id: ro.id,
      cliente: ro.negocio?.conta || null,
      oportunidade: ro.negocio?.nome || null,
      oportunidade_clickup_id: idNegocio || null,
      oportunidade_url: idNegocio ? `https://app.clickup.com/t/${idNegocio}` : null,
      fabricante: ro.fabricante,
      categoria: ro.categoria || null,
      cenario: ro.cenario || null,
      numero_ro: ro.numero_ro || null,
      situacao: ro.situacao,
      data_vencimento: ro.data_vencimento,
      vigencia: vigencia(ro.data_vencimento, deps.hoje),
      ciclo_renovacao: ro.ciclo_renovacao || 0,
      atualizacao_no_periodo: noPeriodo,
      ultima_atividade_humana: lista[0] || null,
      evidencias_humanas: lista.slice(0, 3),
      alertas,
    };
  });

  return {
    filtros: { ...args, data_inicio: dataInicio, data_fim: dataFim },
    total_encontrado: total,
    total_retornado: ros.length,
    pagina,
    limite,
    total_paginas: Math.ceil(total / limite),
    cobertura_evidencias_completa: coberturaCompleta,
    consultado_em: new Date().toISOString(),
    ros,
    orientacao: 'Resuma somente os fatos e evidências retornados. Não invente próximo passo nem conteúdo de anexo. Identifique claramente R.Os sem atualização humana no período.',
  };
}
