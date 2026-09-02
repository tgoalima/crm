// App React para o Gerador de Propostas Comerciais com Versionamento (Modelo de Produção)

const { useState, useEffect, useMemo, useRef, useCallback } = React;

if (typeof Chart !== 'undefined') {
  Chart.Tooltip.positioners.followMouse = function(elements, eventPosition) {
    return { x: eventPosition.x, y: eventPosition.y };
  };
}

const DEAL_VALUE_FIELD_ID = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4';
const RESPONSAVEL_FIELD_ID = ''; // Mapeado via assignees nativos do ClickUp
const API_KEY = '';

// Mesmas opções (id/nome/cor) do custom field "Estágio da Venda" no ClickUp,
// hardcoded aqui pra não precisar mais buscar isso do ClickUp toda vez que o
// Kanban carrega (a SPA passou a ser a fonte de verdade do estágio — ver
// docs/resumo.md, tabela `negocios`). Se as opções mudarem no ClickUp, tem
// que atualizar aqui e em supabase/functions/mcp-brain/clickup.ts também.
const ESTAGIO_OPTIONS = [
  { id: '3c4bcf81-91d3-40e7-97ae-a67b6bccea0c', name: 'Registro', color: '#96c7f2' },
  { id: '1cc9d0c7-cbee-45ff-8bbe-ac4a29ec9f46', name: 'Qualificação', color: '#96c7f2' },
  { id: '5366c82c-2317-4978-8f4d-b41cb953be35', name: 'Proposta', color: '#8dcec3' },
  { id: '97c5f286-e054-4351-b368-25977e8c429d', name: 'Desenvolvimento', color: '#92ceac' },
  { id: '4863ea9f-ccd7-4b49-9aa5-685ee479e091', name: 'Negociação', color: '#12a594' },
  { id: '22e91843-d067-4358-8238-6e619fc66653', name: 'Termo de aceite', color: '#30a46c' },
  { id: 'c59ad408-ae8e-45d7-804f-eb9e6cd2935b', name: 'Ganho', color: '#2ecd6f' },
  { id: '7520c5bc-95a4-47aa-8b12-0711f5bc9bfe', name: 'Perdido', color: '#E65100' },
  { id: 'c231299c-44f8-4f5e-ad8e-58f7b8e01213', name: 'Congelado', color: '#0091ff' },
];

const TIPO_OPORTUNIDADE_CLICKUP = {
  'Projeto': 'fa509e92-7528-4a8b-a9bc-11f2f5da3350',
  'Garantias': '52b4285a-1e92-4ecb-b8b9-7a2348461882',
  'Serviços': '2e351ad7-2af5-4532-be83-fe24423a1994',
  'SSU': '62c6d78c-fa67-44d8-b594-66ed63264df1',
  'Volumes': '62f161bc-b78b-46b7-a73b-1d8faa1a1246',
  'Upgrade': 'e55ef41f-51e6-436e-bb53-79ff688960c7'
};

const RO_CLICKUP_IDS = {
  roInfra: '673b8e3f-f6b2-4b09-b536-fe881b9e5780',
  roSw1: '769281a2-dade-47ae-8867-453fbac6adb3',
  roSw2: 'e1a271ac-107d-4131-b63c-87dfb2e2396d',
  roSw3: 'a940746a-b869-4bb7-8f7c-81775c169022',
  roSw4: 'cf2a09b3-a85a-43cb-8e2e-0f1bdfc243f5'
};

const chartColors = [
  'rgba(79, 70, 229, 0.8)',   // Indigo (#4f46e5)
  'rgba(16, 185, 129, 0.8)',   // Emerald (#10b981)
  'rgba(245, 158, 11, 0.8)',   // Amber (#f59e0b)
  'rgba(139, 92, 246, 0.8)',   // Violet (#8b5cf6)
  'rgba(6, 182, 212, 0.8)',    // Cyan (#06b6d4)
  'rgba(236, 72, 153, 0.8)',   // Pink
  'rgba(249, 115, 22, 0.8)',    // Orange
];

const chartBorderColors = [
  'rgba(79, 70, 229, 1)',
  'rgba(16, 185, 129, 1)',
  'rgba(245, 158, 11, 1)',
  'rgba(139, 92, 246, 1)',
  'rgba(6, 182, 212, 1)',
  'rgba(236, 72, 153, 1)',
  'rgba(249, 115, 22, 1)',
];

// Cores de "interface" do gráfico de Sazonalidade (eixo, grade, legenda,
// tooltip) — as cores de série (chartColors/chartBorderColors acima) já são
// saturadas o bastante pra funcionar nos dois temas e ficam como estão.
const CHART_UI_COLORS_LIGHT = {
  legendText: '#475569',
  axisTicks: '#64748b',
  axisGrid: '#f1f5f9',
  tooltipBg: '#0f172a',
  tooltipTitle: '#ffffff',
  tooltipBody: '#e2e8f0',
};
const CHART_UI_COLORS_DARK = {
  legendText: '#cbd5e1',
  axisTicks: '#94a3b8',
  axisGrid: '#334155',
  tooltipBg: '#f8fafc',
  tooltipTitle: '#0f172a',
  tooltipBody: '#334155',
};

// Estabiliza a saída de um useMemo por VALOR, não só por referência. O poll
// de 3 em 3 min de Relatórios sempre força um refetch (loadDashboardData com
// forceRefresh padrão true no caminho do polling) e setCommercialData sempre
// recebe um array novo de .filter() — mesmo quando o conteúdo é idêntico ao
// que já estava na tela. Sem isso, distributorTotals/manufacturerTotals/
// topProductsAggregated (que dependem de commercialData) ganham uma
// referência nova a cada poll, o que invalida por referência o useEffect que
// cria os gráficos Chart.js (suas dependências), causando destroy+recreate
// (o "piscar") mesmo sem nenhuma mudança real de valor. Usado com um useRef
// por chamador — guarda a última versão serializada + o objeto retornado, e
// devolve o objeto ANTIGO quando o novo é igual por valor.
function stabilizeByValue(ref, newValue) {
  const key = JSON.stringify(newValue);
  if (ref.current && ref.current.key === key) return ref.current.value;
  ref.current = { key, value: newValue };
  return newValue;
}

const getCleanBusinessName = (raw) => {
  if (!raw) return 'Projeto';
  return String(raw)
    .replace(/^S\/N\s*\|\s*/i, '')
    .replace(/\s*-\s*v+([A-Z]{1,3}|\d+)$/i, '')
    .replace(/\s*-\s*versão\s*[A-Z0-9]+/i, '')
    .trim() || 'Projeto';
};

const calcularValidadeProposta = (prop, dealStatus = null) => {
  if (!prop) return null;
  
  // 1. Propostas ou Negócios já fechados (Ganho / Perdido / Inativo) NUNCA têm tag de vencimento
  const propSit = (prop.situacao || '').trim().toLowerCase();
  const dealSit = (dealStatus || (typeof selectedTask !== 'undefined' && selectedTask ? (selectedTask.estagio || selectedTask.status) : '') || '').trim().toLowerCase();
  
  if (['ganho', 'perdido', 'substituída', 'substituida', 'descartada', 'desconsiderada', 'inativa'].includes(propSit) ||
      ['ganho', 'perdido', 'concluido', 'concluído', 'cancelado'].includes(dealSit)) {
    return null;
  }

  // 2. Propostas zeradas (R$ 0,00) são rascunhos em elaboração -> sem tag
  const valorTotal = parseFloat(prop.total_proposta) || 0;
  if (valorTotal <= 0) return null;

  // 3. A validade comercial obedece à Data de Fechamento definida pelo usuário no formulário
  const dataAlvo = prop.data_fechamento;
  if (!dataAlvo) return null;

  const parts = String(dataAlvo).substring(0, 10).split('-');
  if (parts.length !== 3) return null;
  
  const dAlvo = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  const diffTime = dAlvo.getTime() - hoje.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  const dataAlvoStr = `${parts[2]}/${parts[1]}`;

  if (diffDays < 0) {
    return {
      status: 'vencida',
      diasVencidos: Math.abs(diffDays),
      dataValidadeStr: dataAlvoStr,
      label: `Expirada em ${dataAlvoStr}`
    };
  } else if (diffDays === 0) {
    return {
      status: 'vence_hoje',
      diasRestantes: 0,
      dataValidadeStr: dataAlvoStr,
      label: `Vence hoje (${dataAlvoStr})`
    };
  } else {
    return {
      status: 'valida',
      diasRestantes: diffDays,
      dataValidadeStr: dataAlvoStr,
      label: `Válida até ${dataAlvoStr} (${diffDays}d)`
    };
  }
};

// Utilitário seguro para localStorage blindado contra QuotaExceededError do Safari
const safeStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key, val) => {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      try {
        localStorage.removeItem('crm_cache_kanban_tasks_v2');
        localStorage.removeItem('crm_cache_kanban_tasks_v3');
        localStorage.removeItem('crm_cache_kanban_tasks_v4');
        localStorage.removeItem('crm_cache_vendedores');
        localStorage.setItem(key, val);
      } catch (err) {}
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};

// Configuração padrão
const getInitialConfig = () => {
  return {
    url: '',
    anonKey: '',
  };
};

const getSupabaseHeaders = () => {
  const token = safeStorage.getItem('crm_user_clickup_token');
  return token ? { 'Authorization': token } : {};
};

// Sincroniza o token pessoal e perfil do ClickUp de forma segura (criptografado com AES-GCM)
// com as Edge Functions do Supabase para que as ações em background possam agir em nome do vendedor.
const syncUserClickUpCredentialsToEdge = async (token, userObj, client = null, cfg = null) => {
  try {
    if (!token || !userObj) return;
    if (client && client.functions) {
      const { data, error } = await client.functions.invoke('save-clickup-credentials', {
        body: { token, user: userObj }
      });
      if (error) {
        console.warn('[Token Sync] Aviso da Edge Function:', error.message);
      } else {
        console.log('[Token Sync] Credenciais ClickUp sincronizadas com Edge Functions com sucesso.');
      }
    } else {
      const supaUrl = cfg?.url || 'https://supabase.llworkflow.com.br';
      const anonKey = cfg?.anonKey || '';
      const url = `${supaUrl.replace(/\/+$/, '')}/functions/v1/save-clickup-credentials`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` } : {})
        },
        body: JSON.stringify({ token, user: userObj })
      }).catch(e => console.warn('[Token Sync] Aviso ao enviar credenciais:', e));
    }
  } catch (err) {
    console.warn('[Token Sync] Erro ao sincronizar credenciais com Edge Functions (não bloqueante):', err);
  }
};

// Função utilitária global: extrai o nome do estágio de forma segura.
// Evita crash fatal quando stage_name ou status são objetos em vez de strings.
const getSafeStageName = (card) => {
  if (!card) return "";
  let val = "";
  if (card.stage_name) {
    val = typeof card.stage_name === 'object' 
      ? (card.stage_name.name || card.stage_name.status || card.stage_name.value || "") 
      : card.stage_name;
  } else if (card.status) {
    val = typeof card.status === 'object' 
      ? (card.status.status || card.status.name || card.status.value || "") 
      : card.status;
  }
  return String(val || "").toLowerCase().trim();
};

const formatValueCompact = (val) => {
  if (val === undefined || val === null) return 'R$ 0';
  if (val >= 1e6) return `R$ ${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `R$ ${(val / 1e3).toFixed(0)}K`;
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatMaskedCurrency = (value) => {
  if (value === undefined || value === null) return '0,00';
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

const getNextVersionLetter = (currentVersao) => {
  if (!currentVersao || currentVersao.length < 2) return 'vA';
  const prefix = 'v';
  const letters = currentVersao.substring(1);
  let charArray = letters.split('');
  let carry = true;
  for (let i = charArray.length - 1; i >= 0; i--) {
    if (carry) {
      let code = charArray[i].charCodeAt(0) + 1;
      if (code > 90) {
        charArray[i] = 'A';
        carry = true;
      } else {
        charArray[i] = String.fromCharCode(code);
        carry = false;
      }
    }
  }
  if (carry) {
    charArray.unshift('A');
  }
  return prefix + charArray.join('');
};

// ─────────────────────────────────────────────
// @MENÇÕES (Registrar Atividade) — marcador "@[Nome](clickupUserId)" no
// texto bruto. Preserva o id numérico do ClickUp pra virar uma menção real
// (clicável, notifica a pessoa) quando o comentário é sincronizado lá —
// ver handle_create_atividade em server.py.
// ─────────────────────────────────────────────
const renderTextoComMencoes = (texto) => {
  if (!texto) return null;
  const re = /@\[([^\]]+)\]\((\d+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = re.exec(texto)) !== null) {
    if (match.index > lastIndex) parts.push(texto.slice(lastIndex, match.index));
    parts.push(
      <span key={`mencao-${key++}`} className="inline-block font-bold text-indigo-700 bg-indigo-50 px-1 rounded">@{match[1]}</span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < texto.length) parts.push(texto.slice(lastIndex));
  return parts;
};

const MentionTextarea = ({ value, onChange, membros = [], placeholder = '', rows = 3 }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);
  const [triggerPos, setTriggerPos] = React.useState(null);
  const textareaRef = React.useRef(null);

  const filtered = React.useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    return (membros || []).filter(m => !q || (m.nome || '').toLowerCase().includes(q)).slice(0, 6);
  }, [open, query, membros]);

  React.useEffect(() => { setHighlight(0); }, [filtered]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(newVal);

    const beforeCursor = newVal.slice(0, cursor);
    const atIdx = beforeCursor.lastIndexOf('@');
    if (atIdx === -1 || /\s/.test(beforeCursor.slice(atIdx + 1))) {
      setOpen(false);
      return;
    }
    setTriggerPos(atIdx);
    setQuery(beforeCursor.slice(atIdx + 1));
    setOpen(true);
  };

  const handleSelect = (membro) => {
    if (triggerPos === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const before = value.slice(0, triggerPos);
    const after = value.slice(cursor);
    const insertion = `@[${membro.nome}](${membro.id}) `;
    const newVal = before + insertion + after;
    onChange(newVal);
    setOpen(false);
    setQuery('');
    setTriggerPos(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = (before + insertion).length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => (i + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Enter') { e.preventDefault(); handleSelect(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={rows}
        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none transition-all"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(m); }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${i === highlight ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
            >
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-black flex items-center justify-center shrink-0">{(m.nome || '?').slice(0, 1).toUpperCase()}</span>
              <span>{m.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const KanbanCard = React.memo(({ task, dealValue, formattedValue, responsavel, handleDragStart, handleCardClick, hasOverdue, stageColor }) => {
  return (
    <div
      data-id={task.id}
      draggable={true}
      onDragStart={(e) => handleDragStart(e, task)}
      onClick={() => handleCardClick(task)}
      className="kanban-card flex flex-col relative"
      style={{ borderLeft: `4px solid ${stageColor || '#6366f1'}` }}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 pr-2">{task.name}</h4>
        {hasOverdue && (
          <span
            className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white flex-shrink-0 mt-1 animate-pulse"
            title="Possui tarefa comercial atrasada!"
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-auto">
        <span className="flex items-center gap-1.5 min-w-0">
          {responsavel && typeof AvatarInicial !== 'undefined' && (
            <AvatarInicial nome={responsavel} size="xs" />
          )}
          <span className="truncate">{responsavel || 'Sem Responsável'}</span>
        </span>
        <span className="text-emerald-600 font-semibold text-sm shrink-0">{formattedValue}</span>
      </div>
    </div>
  );
});

const STAGE_ORDER = [
  { key: 'registro',       width: '100%' },
  { key: 'qualifica',      width: '88%'  },
  { key: 'proposta',       width: '76%'  },
  { key: 'desenvolvimento',width: '64%'  },
  { key: 'negocia',        width: '52%'  },
  { key: 'termo',          width: '40%'  },
  { key: 'aceite',         width: '40%'  },
];

const getStageSortKey = (name) => {
  const n = name.toLowerCase();
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (n.includes(STAGE_ORDER[i].key)) return i;
  }
  return 99;
};

const getStageWidth = (name) => {
  const n = name.toLowerCase();
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (n.includes(STAGE_ORDER[i].key)) return STAGE_ORDER[i].width;
  }
  return '100%';
};

// Mesmo predicado usado para filtrar os cards do Kanban pela busca — compartilhado
// aqui também com o ForecastFunnelPanel para que o forecast reflita exatamente
// os mesmos negócios que a busca já mostra nos cards.
const taskMatchesSearchTerm = (task, term) => {
  if (!term) return true;
  const nameMatch = (task.name || '').toLowerCase().includes(term);
  const customFieldsStr = (task.custom_fields || []).map(f => String(f.value || '')).join(' ').toLowerCase();
  return nameMatch || customFieldsStr.includes(term);
};

const ForecastFunnelPanel = ({
  kanbanColumns,
  kanbanTasks,
  filterStage,
  setFilterStage,
  filterFabricante,
  setFilterFabricante,
  kanbanSearchTerm,
  kanbanFilterResponsavelId,
  getTaskOptionId,
  getOpportunityValue,
  onCardClick
}) => {
  // Guards defensivos: garante que arrays nunca sejam undefined
  const safeColumns = Array.isArray(kanbanColumns) ? kanbanColumns : [];
  const allTasks = Array.isArray(kanbanTasks) ? kanbanTasks : [];

  // Lista de fabricantes distintos presentes nos negócios ativos, para o filtro
  const fabricantesDisponiveis = Array.from(
    new Set(allTasks.flatMap(t => Array.isArray(t.fabricantes) ? t.fabricantes : []))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const searchTermNormalized = (kanbanSearchTerm || '').toLowerCase().trim();

  // Com fabricante selecionado, mostra só a fatia de valor daquele fabricante no
  // negócio (não o valor cheio da proposta) — negócio.valorPorFabricante é montado
  // em fetchKanbanData a partir de itens_proposta (quantidade * preco_unitario).
  const valueForCurrentFilter = (t) => filterFabricante
    ? (t?.valorPorFabricante?.[filterFabricante] || 0)
    : (getOpportunityValue ? (getOpportunityValue(t) || 0) : 0);

  const safeTasks = allTasks
    .filter(t => !filterFabricante || (Array.isArray(t.fabricantes) && t.fabricantes.includes(filterFabricante)))
    .filter(t => !kanbanFilterResponsavelId || String(t.responsavel_clickup_id) === kanbanFilterResponsavelId)
    .filter(t => taskMatchesSearchTerm(t, searchTermNormalized));

  const activeCols = safeColumns.filter(col => {
    if (!col || typeof col.name !== 'string') return false;
    const colName = col.name.toLowerCase();
    if (colName.includes("ganho") || colName.includes("perdido") || colName.includes("congelado")) return false;
    return true;
  });

  const rawStageData = activeCols.map(col => {
    const tasksInCol = safeTasks.filter(t => getTaskOptionId && getTaskOptionId(t, safeColumns) === col.id);
    const total = tasksInCol.reduce((acc, t) => acc + valueForCurrentFilter(t), 0);
    return {
      id: col.id,
      name: col.name,
      color: col.color || '#6366f1',
      total,
      count: tasksInCol.length,
      funnelWidth: getStageWidth(col.name),
    };
  });

  // Sort stages chronologically (top of funnel first)
  const stageData = [...rawStageData].sort((a, b) => getStageSortKey(a.name) - getStageSortKey(b.name));

  const totalFunnelSum = stageData.reduce((acc, s) => acc + s.total, 0);
  const selectedStageObj = filterStage ? stageData.find(s => s.id === filterStage) : null;
  const displayTotal = selectedStageObj ? selectedStageObj.total : totalFunnelSum;
  const displayTitle = selectedStageObj ? selectedStageObj.name : "Total Funil";

  return (
    <div className={`px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col ${filterStage ? 'flex-1 min-h-0 overflow-hidden' : 'flex-shrink-0'}`}>
      <div className="mb-4 flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Funil de Vendas &amp; Forecast</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fabricante:</span>
            <select
              value={filterFabricante || ''}
              onChange={(e) => setFilterFabricante(e.target.value || null)}
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-600/70 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Todos</option>
              {fabricantesDisponiveis.map(fab => (
                <option key={fab} value={fab}>{fab}</option>
              ))}
            </select>
          </div>
          {(filterStage || filterFabricante) && (
            <button
              onClick={() => { setFilterStage(null); setFilterFabricante(null); }}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
            >
              Limpar Filtro
            </button>
          )}
        </div>
      </div>

      <div className={`flex flex-col lg:flex-row gap-6 items-stretch w-full ${filterStage ? 'flex-1 min-h-0' : ''}`}>
        {/* Left Column: Funil (e Card de Total quando estágio selecionado) */}
        <div className={`flex flex-col items-stretch space-y-3 flex-shrink-0 ${
          filterStage && selectedStageObj ? 'w-full lg:w-[38%]' : 'w-full lg:w-[65%]'
        }`}>
          <div className="flex flex-col space-y-2 py-1">
            {stageData.map((stage) => {
              const isSelected = filterStage === stage.id;
              return (
                <div key={stage.id} className="w-full flex justify-center">
                  <button
                    onClick={() => setFilterStage(filterStage === stage.id ? null : stage.id)}
                    style={{
                      width: stage.funnelWidth,
                      borderLeft: `4px solid ${stage.color}`,
                      backgroundColor: isSelected ? undefined : `${stage.color}1A`,
                    }}
                    className={`flex justify-between items-center py-2.5 px-4 rounded-lg transition-all duration-200 border cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-200/50'
                        : 'border-slate-200/80 dark:border-slate-700/80 hover:brightness-95 text-slate-950 dark:text-slate-100'
                    }`}
                  >
                    <div className="z-10 flex items-center gap-2 pr-2">
                      <span 
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${isSelected ? 'text-white font-bold' : 'text-slate-950 dark:text-slate-100'}`}>
                        {stage.name}
                      </span>
                    </div>
                    
                    <div className="z-10 flex items-center gap-3.5 flex-shrink-0 ml-auto justify-end text-right">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${isSelected ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'}`}>
                        {stage.count}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Resumo de valor da etapa — empilhado abaixo do funil quando filtrado */}
          {filterStage && selectedStageObj && (
            <div className="w-full mt-2 bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 border-l-4 border-l-indigo-600 shadow-sm shadow-slate-100/50 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">
                {`TOTAL EM ${selectedStageObj.name.toUpperCase()}`}
              </span>
              <span className="text-3xl font-black text-emerald-600 tracking-tight leading-none select-all">
                R$ {displayTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="bg-slate-900 text-white font-semibold text-xs px-3 py-1 rounded-full mt-3 shadow-sm">
                {`${selectedStageObj.count} negócios nesta etapa`}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 max-w-xs leading-relaxed">
                {`Soma dos negócios na etapa "${selectedStageObj.name}".`}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Card de Total Geral (quando sem filtro) */}
        {!filterStage && (
          <div className="w-full lg:w-[35%] bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200/80 dark:border-slate-700/80 border-l-4 border-l-indigo-600 shadow-sm shadow-slate-100/50 flex flex-col justify-center items-center text-center h-full">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 block">
              TOTAL EM NEGOCIAÇÃO
            </span>
            <span className="text-4xl lg:text-5xl font-black text-emerald-600 tracking-tight leading-none select-all">
              R$ {displayTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="bg-slate-900 text-white font-semibold text-xs px-3 py-1.5 rounded-full mt-4 shadow-sm">
              {`${stageData.reduce((a, s) => a + s.count, 0)} negócios em andamento`}
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 max-w-xs leading-relaxed">
              Soma total de todos os negócios comerciais ativos em andamento no funil.
            </p>
          </div>
        )}

        {/* Right Column: Lista de Oportunidades do Estágio (quando com filtro) */}
        {filterStage && selectedStageObj && (
          <div className="w-full lg:w-[62%] flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-t-xl border border-slate-200 dark:border-slate-700 border-b-0 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedStageObj.color || '#6366f1' }}></span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{selectedStageObj.name}</span>
              </div>
              <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
                {selectedStageObj.count} negócios
              </span>
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-b-xl p-3 space-y-2.5"
            >
              {safeTasks
                .filter(t => getTaskOptionId(t, kanbanColumns) === filterStage)
                .map(task => {
                  const dealValue = valueForCurrentFilter(task);
                  const formattedValue = dealValue !== null && dealValue !== undefined
                    ? `R$ ${Number(dealValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                    : 'R$ 0,00';
                  const responsavel = task.responsavel_negocio;
                  return (
                    <div
                      key={task.id}
                      onClick={() => onCardClick && onCardClick(task)}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer group"
                      style={{ borderLeft: `4px solid ${selectedStageObj.color || '#6366f1'}` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight group-hover:text-indigo-700 transition-colors truncate">
                            {task.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 min-w-0">
                            {responsavel && typeof AvatarInicial !== 'undefined' && (
                              <AvatarInicial nome={responsavel} size="xs" />
                            )}
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{responsavel || 'Sem responsável'}</p>
                          </div>
                        </div>
                        <span className={`text-sm font-black flex-shrink-0 ${dealValue > 0 ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'}`}>
                          {formattedValue}
                        </span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Lista de negócios estilo "Negócios" do Agendor: busca + filtros por status,
// etapa, responsável e período de fechamento, com colunas Cliente / Responsável /
// Status / Etapa / Data de Fechamento / Valor.
// Exportação CSV client-side (sem backend) — ponto e vírgula como separador
// (não vírgula), porque o Excel em locale pt-BR usa vírgula como separador
// decimal e interpretaria um CSV com vírgula como campo único quebrado.
function downloadCsv(filename, headers, rows) {
  const escapeCsvField = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers, ...rows].map(row => row.map(escapeCsvField).join(';'));
  // BOM (﻿) pra o Excel reconhecer UTF-8 e não corromper acentos.
  const csvContent = '﻿' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const DealsListView = ({
  kanbanTasks,
  kanbanColumns,
  getTaskOptionId,
  getOpportunityValue,
  onCardClick,
  statusFilter,
  setStatusFilter,
  onClose,
  supabaseClient,
  kanbanFilterResponsavelId,
}) => {
  const [exportingCompleto, setExportingCompleto] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [etapaFilter, setEtapaFilter] = useState('');
  const [responsavelFilter, setResponsavelFilter] = useState('');
  const [periodPreset, setPeriodPreset] = useState('todo_historico');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortKey, setSortKey] = useState('data_fechamento');
  const [sortDir, setSortDir] = useState('desc');

  const safeTasks = (Array.isArray(kanbanTasks) ? kanbanTasks : [])
    .filter(t => !kanbanFilterResponsavelId || String(t.responsavel_clickup_id) === kanbanFilterResponsavelId);
  const safeColumns = Array.isArray(kanbanColumns) ? kanbanColumns : [];

  const getStatus = (task) => {
    const optId = getTaskOptionId ? getTaskOptionId(task, safeColumns) : null;
    const col = safeColumns.find(c => c.id === optId);
    const name = (col?.name || '').toLowerCase();
    if (name.includes('ganho')) return 'Ganho';
    if (name.includes('perdido')) return 'Perdido';
    if (name.includes('congelado')) return 'Congelado';
    return 'Em andamento';
  };

  const getEtapaName = (task) => {
    const optId = getTaskOptionId ? getTaskOptionId(task, safeColumns) : null;
    const col = safeColumns.find(c => c.id === optId);
    return col?.name || '—';
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '—';
    const clean = String(dateStr).substring(0, 10);
    const parts = clean.split('-');
    if (parts.length !== 3) return '—';
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const etapasDisponiveis = safeColumns.map(c => c.name).filter(Boolean);
  const responsaveisDisponiveis = Array.from(
    new Set(safeTasks.map(t => t.responsavel_negocio).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const getPeriodRange = () => {
    if (periodPreset === 'todo_historico') return null;
    const now = new Date();
    const year = now.getFullYear();
    const pad = (n) => String(n).padStart(2, '0');
    if (periodPreset === 'ano_atual') {
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    if (periodPreset === 'trimestre_atual') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const qEndDate = new Date(year, qStartMonth + 3, 0);
      return {
        start: `${year}-${pad(qStartMonth + 1)}-01`,
        end: `${year}-${pad(qEndDate.getMonth() + 1)}-${pad(qEndDate.getDate())}`,
      };
    }
    if (periodPreset === 'personalizado' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return null;
  };

  const periodRange = getPeriodRange();

  const filtered = safeTasks.filter(task => {
    if (statusFilter !== 'Todos' && getStatus(task) !== statusFilter) return false;
    if (etapaFilter && getEtapaName(task) !== etapaFilter) return false;
    if (responsavelFilter && task.responsavel_negocio !== responsavelFilter) return false;
    if (searchTerm.trim() && !(task.name || '').toLowerCase().includes(searchTerm.toLowerCase().trim())) return false;
    if (periodRange) {
      const df = task.data_fechamento ? String(task.data_fechamento).substring(0, 10) : null;
      if (!df) return false;
      if (df < periodRange.start || df > periodRange.end) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let valA, valB;
    switch (sortKey) {
      case 'cliente':
        valA = (a.name || '').toLowerCase(); valB = (b.name || '').toLowerCase();
        break;
      case 'responsavel':
        valA = (a.responsavel_negocio || '').toLowerCase(); valB = (b.responsavel_negocio || '').toLowerCase();
        break;
      case 'status':
        valA = getStatus(a); valB = getStatus(b);
        break;
      case 'etapa':
        valA = getEtapaName(a); valB = getEtapaName(b);
        break;
      case 'valor':
        valA = getOpportunityValue(a) || 0; valB = getOpportunityValue(b) || 0;
        break;
      case 'data_fechamento':
      default:
        valA = a.data_fechamento || '';
        valB = b.data_fechamento || '';
        break;
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalValor = filtered.reduce((acc, t) => acc + (getOpportunityValue(t) || 0), 0);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, sortField }) => (
    <th
      onClick={() => handleSort(sortField)}
      className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortField && <span className="text-indigo-500">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );

  const statusBadgeClass = (status) => {
    switch (status) {
      case 'Ganho': return 'bg-emerald-100 text-emerald-700';
      case 'Perdido': return 'bg-rose-100 text-rose-700';
      case 'Congelado': return 'bg-blue-100 text-blue-700';
      default: return 'bg-amber-100 text-amber-700';
    }
  };

  // Exportação "completa" — uma linha por item de produto (denormalizada,
  // formato padrão de export pra importação em outro sistema), com dados de
  // empresa/CNPJ e produto/fabricante/distribuidor, não só o resumo do
  // negócio. Busca itens_proposta/contas sob demanda (só ao clicar) em vez
  // de sempre, já que é bem mais dado do que a lista normalmente precisa.
  const handleExportCompleto = async () => {
    if (!supabaseClient || sorted.length === 0) return;
    setExportingCompleto(true);
    try {
      const [{ data: itens, error: itensErr }, { data: contas, error: contasErr }] = await Promise.all([
        supabaseClient.from('itens_proposta').select('proposta_id, quantidade, preco_unitario, produtos(nome, fabricante), distribuidores(nome)'),
        supabaseClient.from('contas').select('id, nome, cnpj'),
      ]);
      if (itensErr) throw itensErr;
      if (contasErr) throw contasErr;

      const itensByProposta = new Map();
      (itens || []).forEach(it => {
        if (!it.proposta_id) return;
        if (!itensByProposta.has(it.proposta_id)) itensByProposta.set(it.proposta_id, []);
        itensByProposta.get(it.proposta_id).push(it);
      });
      const contaById = new Map((contas || []).map(c => [c.id, c]));

      const headers = [
        'Cliente (Negócio)', 'Empresa', 'CNPJ', 'Responsável', 'Status', 'Etapa',
        'Situação Proposta', 'Motivo Perda', 'Data de Fechamento', 'Valor Total Negócio (R$)',
        'Produto', 'Fabricante', 'Distribuidor', 'Quantidade', 'Preço Unitário (R$)', 'Total Item (R$)',
      ];
      const rows = [];
      sorted.forEach(t => {
        const conta = t.conta_id ? contaById.get(t.conta_id) : null;
        const itensDoNegocio = t.proposta_id ? (itensByProposta.get(t.proposta_id) || []) : [];
        const baseFields = [
          t.name || '',
          conta?.nome || '',
          conta?.cnpj || '',
          t.responsavel_negocio || '',
          getStatus(t),
          getEtapaName(t),
          t.situacao || '',
          t.motivo_perda || '',
          formatDateDisplay(t.data_fechamento),
          (getOpportunityValue(t) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ];
        if (itensDoNegocio.length === 0) {
          rows.push([...baseFields, '', '', '', '', '', '']);
        } else {
          itensDoNegocio.forEach(it => {
            const prod = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos;
            const dist = Array.isArray(it.distribuidores) ? it.distribuidores[0] : it.distribuidores;
            const qty = parseFloat(it.quantidade) || 0;
            const preco = parseFloat(it.preco_unitario) || 0;
            rows.push([
              ...baseFields,
              prod?.nome || '',
              prod?.fabricante || '',
              dist?.nome || '',
              qty,
              preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              (qty * preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            ]);
          });
        }
      });
      downloadCsv(`negocios_completo_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    } catch (err) {
      console.error('Erro ao exportar CSV completo:', err);
      alert('Erro ao gerar exportação completa: ' + (err?.message || err));
    } finally {
      setExportingCompleto(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-800">
      {/* Barra de filtros */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            📋 Lista de Negócios
            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold normal-case tracking-normal">
              {filtered.length} {filtered.length === 1 ? 'negócio' : 'negócios'}
            </span>
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const headers = ['Cliente', 'Responsável', 'Status', 'Etapa', 'Data de Fechamento', 'Valor (R$)'];
                const rows = sorted.map(t => [
                  t.name || '',
                  t.responsavel_negocio || '',
                  getStatus(t),
                  getEtapaName(t),
                  formatDateDisplay(t.data_fechamento),
                  (getOpportunityValue(t) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                ]);
                downloadCsv(`negocios_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
              }}
              disabled={sorted.length === 0}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⬇ Exportar CSV
            </button>
            <button
              onClick={handleExportCompleto}
              disabled={sorted.length === 0 || exportingCompleto || !supabaseClient}
              title="Exporta todos os dados do negócio, incluindo produtos, empresa e CNPJ — uma linha por item, útil pra migração/backup"
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {exportingCompleto ? '⏳ Gerando...' : '⬇ Exportar Completo'}
            </button>
            <button
              onClick={onClose}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 font-semibold cursor-pointer"
            >
              ✕ Fechar Lista
            </button>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente / negócio..."
            className="flex-1 min-w-[200px] rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            <option value="Todos">Status: Todos</option>
            <option value="Em andamento">Em andamento</option>
            <option value="Ganho">Ganho</option>
            <option value="Perdido">Perdido</option>
            <option value="Congelado">Congelado</option>
          </select>

          <select
            value={etapaFilter}
            onChange={(e) => setEtapaFilter(e.target.value)}
            className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            <option value="">Etapa: Todas</option>
            {etapasDisponiveis.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <select
            value={responsavelFilter}
            onChange={(e) => setResponsavelFilter(e.target.value)}
            className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            <option value="">Responsável: Todos</option>
            {responsaveisDisponiveis.map(nome => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
          </select>

          <div className="flex items-center bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 text-xs font-bold">
            {[
              { key: 'ano_atual', label: 'Ano Atual' },
              { key: 'trimestre_atual', label: 'Trimestre Atual' },
              { key: 'todo_historico', label: 'Todo Histórico' },
              { key: 'personalizado', label: 'Personalizar' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriodPreset(opt.key)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  periodPreset === opt.key ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {periodPreset === 'personalizado' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-400 dark:text-slate-500 text-xs">até</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {(searchTerm || statusFilter !== 'Todos' || etapaFilter || responsavelFilter || periodPreset !== 'todo_historico') && (
            <button
              onClick={() => {
                setSearchTerm(''); setStatusFilter('Todos'); setEtapaFilter('');
                setResponsavelFilter(''); setPeriodPreset('todo_historico');
                setCustomStart(''); setCustomEnd('');
              }}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold underline cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-10">
            <tr>
              <SortHeader label="Cliente" sortField="cliente" />
              <SortHeader label="Responsável" sortField="responsavel" />
              <SortHeader label="Status" sortField="status" />
              <SortHeader label="Etapa" sortField="etapa" />
              <SortHeader label="Data Fechamento" sortField="data_fechamento" />
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600" onClick={() => handleSort('valor')}>
                <span className="inline-flex items-center gap-1">
                  Valor
                  {sortKey === 'valor' && <span className="text-indigo-500">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(task => {
              const status = getStatus(task);
              const dealValue = getOpportunityValue(task);
              return (
                <tr
                  key={task.id}
                  onClick={() => onCardClick && onCardClick(task)}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 max-w-xs truncate">{task.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{task.responsavel_negocio || 'Sem responsável'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(status)}`}>{status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{getEtapaName(task)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{formatDateDisplay(task.data_fechamento)}</td>
                  <td className="px-4 py-2.5 text-sm font-bold text-right text-emerald-600">
                    {dealValue ? `R$ ${Number(dealValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
                  Nenhum negócio encontrado com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé com total */}
      <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {filtered.length} {filtered.length === 1 ? 'negócio listado' : 'negócios listados'}
        </span>
        <span className="text-sm font-black text-emerald-600">
          Total: R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
};

const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clickupToken, setClickupToken] = useState(() => localStorage.getItem('crm_user_clickup_token') || '');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clickupToken.trim()) {
      setLocalError('O Personal API Token do ClickUp é obrigatório.');
      return;
    }
    setLoading(true);
    setLocalError('');
    try {
      const res = await onLogin(email, password, clickupToken);
      if (res && res.error) {
        setLocalError(res.error.message);
      }
    } catch (err) {
      setLocalError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl space-y-6">
        <div className="text-center">
          <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-3 border border-indigo-100 shadow-sm">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Suprimática CRM</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold mt-1 uppercase tracking-wider">Gerador de Propostas Comerciais</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">E-mail Corporativo</label>
            <input 
              type="email" 
              required
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-slate-100 rounded-xl outline-none transition-all text-sm font-medium"
              placeholder="seu-email@suprimatica.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Senha de Acesso</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-slate-100 rounded-xl outline-none transition-all text-sm font-medium pr-10"
                placeholder="Sua senha secreta"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Personal API Token (ClickUp)</label>
              <button 
                type="button"
                onClick={() => setShowTokenHelp(!showTokenHelp)}
                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold transition-colors cursor-pointer"
              >
                {showTokenHelp ? "Ocultar Dica" : "Como obter?"}
              </button>
            </div>
            <input 
              type="password" 
              required
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-slate-100 rounded-xl outline-none transition-all text-xs font-mono"
              placeholder="Cole seu token pk_..."
              value={clickupToken}
              onChange={(e) => setClickupToken(e.target.value)}
            />
            
            {showTokenHelp && (
              <div className="mt-2 bg-indigo-50/70 dark:bg-slate-900 border border-indigo-100 dark:border-slate-700 rounded-xl p-3 text-[11px] text-indigo-900 dark:text-slate-200 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <p className="font-bold">💡 Como obter seu token no ClickUp:</p>
                <ol className="list-decimal list-inside space-y-1 leading-relaxed text-[11px]">
                  <li>Clique no seu <b>perfil / foto</b> no canto superior direito do ClickUp.</li>
                  <li>Clique em <b>Configurações</b>.</li>
                  <li>Na barra lateral esquerda, na seção <i>Integrações e ClickApps</i>, clique em <b>API da ClickUp</b>.</li>
                  <li>Clique em <b>Copiar</b> ao lado do seu <b>Token API</b> (código que começa com <code className="font-bold bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-indigo-200">pk_...</code>).</li>
                </ol>
              </div>
            )}
          </div>

          {(localError || error) && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-start gap-2">
              <span className="text-sm mt-0.5">⚠️</span>
              <span>{localError || error}</span>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : "Entrar no SPA"}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// CONFIGURAÇÕES: Segmentos de Atuação
// ─────────────────────────────────────────────
const SEGMENTOS_DEFAULT_APP = [
  'Saúde / Hospitalar', 'Agronegócio / Usinas', 'Indústria Metalmecânica',
  'Construção Civil', 'Distribuição & Logística', 'Educação',
  'Financeiro & Seguros', 'Varejo & E-commerce', 'Tecnologia',
  'Têxtil & Moda', 'Alimentício & Bebidas', 'Energia & Utilities',
  'Governo & Público', 'Automotivo', 'Mineração', 'Telecomunicações',
];

const SegmentosSettings = ({ client }) => {
  const [segmentos, setSegmentos] = useState(() => {
    try {
      const s = localStorage.getItem('crm_segmentos');
      return s ? JSON.parse(s) : SEGMENTOS_DEFAULT_APP;
    } catch { return SEGMENTOS_DEFAULT_APP; }
  });
  const [novoNome, setNovoNome] = useState('');
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [editandoNome, setEditandoNome] = useState('');
  const [busca, setBusca] = useState('');
  // nome -> id no Supabase, pra viabilizar update/delete por id (a lista em si
  // continua sendo um array de strings, pra não mexer no resto do componente)
  const idsRef = useRef({});

  // Supabase é a fonte de verdade (antes só localStorage, divergia entre
  // navegadores/máquinas — inclusive o módulo Empresa 360 em empresas.js lia
  // essa mesma chave de cache). localStorage vira só cache pra load instantâneo.
  const carregar = async () => {
    if (!client) return;
    const { data, error } = await client.from('segmentos').select('id, nome').eq('ativo', true).order('nome');
    if (!error && data) {
      idsRef.current = Object.fromEntries(data.map(s => [s.nome, s.id]));
      const nomes = data.map(s => s.nome);
      setSegmentos(nomes);
      try { localStorage.setItem('crm_segmentos', JSON.stringify(nomes)); } catch (e) {}
    }
  };
  useEffect(() => { carregar(); }, [client]);

  const salvar = (lista) => {
    setSegmentos(lista);
    localStorage.setItem('crm_segmentos', JSON.stringify(lista));
  };

  const adicionar = async () => {
    const n = novoNome.trim();
    if (!n || segmentos.includes(n)) return;
    setNovoNome('');
    if (client) {
      const { error } = await client.from('segmentos').insert({ nome: n });
      if (error) { alert('Erro ao adicionar segmento: ' + error.message); return; }
      await carregar();
    } else {
      salvar([...segmentos, n].sort((a, b) => a.localeCompare(b)));
    }
  };

  const excluir = async (idx) => {
    const nome = segmentos[idx];
    if (!confirm(`Excluir o segmento "${nome}"?`)) return;
    if (client && idsRef.current[nome]) {
      const { error } = await client.from('segmentos').delete().eq('id', idsRef.current[nome]);
      if (error) { alert('Erro ao excluir segmento: ' + error.message); return; }
      await carregar();
    } else {
      salvar(segmentos.filter((_, i) => i !== idx));
    }
  };

  const salvarEdicao = async (idx) => {
    const n = editandoNome.trim();
    if (!n) return;
    const nomeAntigo = segmentos[idx];
    setEditandoIdx(null);
    setEditandoNome('');
    if (client && idsRef.current[nomeAntigo]) {
      const { error } = await client.from('segmentos').update({ nome: n }).eq('id', idsRef.current[nomeAntigo]);
      if (error) { alert('Erro ao renomear segmento: ' + error.message); return; }
      await carregar();
    } else {
      const nova = [...segmentos];
      nova[idx] = n;
      salvar(nova.sort((a, b) => a.localeCompare(b)));
    }
  };

  const resetar = async () => {
    if (!confirm('Restaurar os segmentos padrão? (segmentos personalizados adicionados não são removidos)')) return;
    if (client) {
      const rows = SEGMENTOS_DEFAULT_APP.map(nome => ({ nome }));
      const { error } = await client.from('segmentos').upsert(rows, { onConflict: 'nome', ignoreDuplicates: true });
      if (error) { alert('Erro ao restaurar padrão: ' + error.message); return; }
      await carregar();
    } else {
      salvar([...SEGMENTOS_DEFAULT_APP]);
    }
  };

  const filtrados = segmentos.filter(s => !busca.trim() || s.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Segmentos de Atuação</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Gerencie os segmentos disponíveis no formulário de empresa. Salvos localmente neste navegador.
          </p>
        </div>
        <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold shrink-0">
          {segmentos.length} segmentos
        </span>
      </div>

      {/* Adicionar novo */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-5 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Adicionar Novo Segmento</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ex: Petroquímica & Refino"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionar()}
            className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
          />
          <button
            onClick={adicionar}
            disabled={!novoNome.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-200 cursor-pointer"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
          <input
            type="text"
            placeholder="🔍 Filtrar segmentos..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-400 transition-all"
          />
          <button onClick={resetar} className="text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-rose-600 transition-colors cursor-pointer">↺ Restaurar Padrão</button>
        </div>

        <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
          {filtrados.map((s, i) => {
            const realIdx = segmentos.indexOf(s);
            return (
              <div key={s} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-900 group transition-colors">
                {editandoIdx === realIdx ? (
                  <>
                    <input
                      autoFocus
                      value={editandoNome}
                      onChange={e => setEditandoNome(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(realIdx); if (e.key === 'Escape') { setEditandoIdx(null); setEditandoNome(''); } }}
                      className="flex-1 px-3 py-1.5 bg-indigo-50 border border-indigo-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                    />
                    <button onClick={() => salvarEdicao(realIdx)} className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer">✓</button>
                    <button onClick={() => { setEditandoIdx(null); setEditandoNome(''); }} className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold rounded-lg cursor-pointer">✕</button>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"></div>
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">{s}</span>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditandoIdx(realIdx); setEditandoNome(s); }} className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer">Editar</button>
                      <button onClick={() => excluir(realIdx)} className="px-2.5 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">Excluir</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {filtrados.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum segmento encontrado.</div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  const [config, setConfig] = useState(getInitialConfig);
  // Mapa clickup_negocio_id -> estagio real do negócio, usado pra blindar os
  // cálculos de "Ganho"/"Perdido" do relatório contra proposta.data_fechamento
  // desalinhada do estágio de verdade do negócio (ver migration 20260819e e
  // docs/resumo.md). Declarado no topo do componente porque é referenciado
  // por useMemo's (distributorTotals, manufacturerTotals) que rodam antes
  // de outros hooks mais abaixo no arquivo.
  const negociosEstagioRef = useRef(new Map());
  // TTL (60s) pra evitar rebuscar tabela inteira do zero toda vez que o
  // usuário troca de aba e volta pro Kanban/Relatórios — antes rebuscava
  // sempre, mesmo se a última busca tivesse sido há poucos segundos.
  // Atualizados sempre que a busca correspondente de fato roda (por
  // qualquer motivo, não só troca de aba), pra refletir o dado mais recente.
  const TAB_CACHE_TTL_MS = 60000;
  const lastKanbanFetchAtRef = useRef(0);
  const lastDashboardFetchAtRef = useRef(0);
  // Desde que o Relatórios passou a filtrar propostas por data no servidor
  // (loadDashboardData), rawProposalsRef só cobre o período que estava ativo
  // na hora da última busca de verdade — não é mais "a tabela inteira" que
  // dava pra refiltrar livremente pra qualquer range sem rebuscar. Guarda
  // aqui o range que foi de fato buscado, pra saber quando um novo range
  // pedido pelo usuário (troca de período/comparativo) exige busca nova
  // mesmo dentro do TTL — sem isso, escolher um período fora do que já
  // estava em cache voltava zerado (o cache antigo era refiltrado, não
  // rebuscado).
  const lastFetchedBoundsRef = useRef({ lower: null, upper: null });
  // Espelha activeTab pra uso dentro do setInterval de auto-polling — sem
  // isso, fetchAllData (fechada dentro do useEffect do interval, que não
  // depende de activeTab) sempre enxergaria a aba de quando o interval foi
  // criado, não a aba atual (mesmo motivo de currentDateFilterRef abaixo).
  const activeTabRef = useRef(null);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [session, setSession] = useState(null);
  const [clickupTaskId, setClickupTaskId] = useState('');
  const [clickupListId, setClickupListId] = useState('');
  
  // Função para obter a aba inicial com base na Hash URL (SPA Hash Routing)
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '').trim();
    if (['kanban', 'relatorios', 'tasks', 'propostas', 'empresas'].includes(hash)) {
      return hash;
    }
    return safeStorage.getItem('crm_active_view') || 'kanban';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  // EmpresasTab é um componente próprio (empresas.js) com seu próprio
  // fetch/estado interno — sem isso, cada troca de aba para "Empresas"
  // desmontava e remontava o componente do zero, refazendo a consulta
  // completa ao Supabase (444+ contas, negócios, contatos) toda vez.
  // Mantemos montado (só oculto via CSS) depois da primeira visita, para
  // que voltar à aba seja instantâneo — mesmo comportamento que Kanban/
  // Relatórios/Tarefas já têm (estado deles vive no componente pai).
  const [empresasTabMounted, setEmpresasTabMounted] = useState(activeTab === 'empresas');
  useEffect(() => {
    if (activeTab === 'empresas' && !empresasTabMounted) setEmpresasTabMounted(true);
  }, [activeTab, empresasTabMounted]);

  // Sincroniza activeTab com a Hash URL e safeStorage
  useEffect(() => {
    safeStorage.setItem('crm_active_view', activeTab);
    if (window.location.hash !== `#${activeTab}`) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  // Tema (claro/escuro) — mesma chave (crm_theme) que o script anti-flash
  // no <head> do index.html já lê antes do 1º paint, pra não haver flash
  // de tema errado. Preferência do sistema só serve de valor inicial na
  // 1ª visita (sem nada salvo ainda); depois disso o botão manual manda.
  const getInitialTheme = () => {
    const stored = safeStorage.getItem('crm_theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  };
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    safeStorage.setItem('crm_theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  // Listener para sincronizar navegação por hash (Avançar/Voltar do navegador)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (['kanban', 'relatorios', 'tasks', 'propostas', 'empresas'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [kanbanTasks, setKanbanTasks] = useState(() => {
    // v2: formato mudou de custom_fields (ClickUp) pra estagio (Supabase) em 17/08 —
    // chave nova pra não reidratar com cache antigo incompatível (fazia getTaskOptionId
    // não achar nenhum estágio e o Kanban parecer vazio até a busca nova completar).
    // v3: adicionado valorPorFabricante (19/08) — chave nova pra não reidratar com
    // cache antigo sem esse campo (Forecast filtrado por fabricante ficaria em R$ 0).
    // v4: adicionado conta_id/responsavel_clickup_id (19/08) — chave nova pra não
    // reidratar sem eles (aba Empresa do drawer ficaria vazia até a busca completar).
    const cached = localStorage.getItem('crm_cache_kanban_tasks_v4');
    return cached ? JSON.parse(cached) : [];
  });
  const [kanbanColumns, setKanbanColumns] = useState(ESTAGIO_OPTIONS);
  const [loadingKanban, setLoadingKanban] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [drawerTab, setDrawerTab] = useState('details'); // 'details' | 'budget'
  const [canDrag, setCanDrag] = useState(false);
  const [sortBy, setSortBy] = useState(() => {
    return localStorage.getItem('crm_sort_order') || 'default';
  });
  const [supabaseProposalsList, setSupabaseProposalsList] = useState([]);
  const [commercialTasks, setCommercialTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  // Marca se a aba Tarefas Comerciais já carregou alguma vez nesta sessão. Não usamos
  // commercialTasks.length > 0 para decidir isso porque a tabela pode legitimamente estar
  // vazia (0 tarefas) — nesse caso o array nunca fica "> 0" e a tela mostrava o spinner de
  // carregamento cheio toda vez que se voltava para a aba, mesmo já tendo carregado antes.
  const hasLoadedTasksOnceRef = useRef(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tasksFilterAssignee, setTasksFilterAssignee] = useState('all');
  const [tasksPeriodFilter, setTasksPeriodFilter] = useState('all');
  const [tasksCustomStartDate, setTasksCustomStartDate] = useState('');
  const [tasksCustomEndDate, setTasksCustomEndDate] = useState('');
  const [tasksShowCompleted, setTasksShowCompleted] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState('Ligação');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [filterStage, setFilterStage] = useState(null);
  const [filterFabricante, setFilterFabricante] = useState(null);
  const [showDealsList, setShowDealsList] = useState(false);
  const [dealsListStatus, setDealsListStatus] = useState('Todos');
  const [showEditNegocioDrawerModal, setShowEditNegocioDrawerModal] = useState(false);
  const [editNegocioDrawerForm, setEditNegocioDrawerForm] = useState({
    nome: '',
    estagio: 'Registro',
    tipo: 'Projeto',
    valor: '',
    probabilidade: '50',
    dataPrevisao: '',
    descricao: ''
  });
  const [savingEditNegocioDrawer, setSavingEditNegocioDrawer] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [drawerSection, setDrawerSection] = useState('propostas'); // 'propostas' | 'tarefas' | 'status' | 'empresa'
  const [empresaDoNegocio, setEmpresaDoNegocio] = useState(null);
  const [contatosDoNegocio, setContatosDoNegocio] = useState([]);
  const [loadingEmpresaDoNegocio, setLoadingEmpresaDoNegocio] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [loadingAtividades, setLoadingAtividades] = useState(false);
  const [novaAtividade, setNovaAtividade] = useState('');
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [editingAtividadeTexto, setEditingAtividadeTexto] = useState('');
  const [savingAtividade, setSavingAtividade] = useState(false);
  const [searchProposalQuery, setSearchProposalQuery] = useState('');
  const [proposalSearchResults, setProposalSearchResults] = useState([]);
  const [showProposalDropdown, setShowProposalDropdown] = useState(false);
  const [selectedProposalForTask, setSelectedProposalForTask] = useState(null);
  
  // Autenticação e Token do Usuário no ClickUp
  const [userClickUpToken, setUserClickUpToken] = useState(() => localStorage.getItem('crm_user_clickup_token') || '');
  const [userProfile, setUserProfile] = useState(() => {
    const cached = localStorage.getItem('crm_user_profile');
    return cached ? JSON.parse(cached) : null;
  });
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [validatingToken, setValidatingToken] = useState(false);

  const validateAndSaveToken = async (tokenToTest) => {
    const cleanToken = tokenToTest ? tokenToTest.trim() : '';
    if (!cleanToken) {
      showToast('Informe um Personal Token do ClickUp válido (ex: pk_...)', 'error');
      return false;
    }
    setValidatingToken(true);
    try {
      const res = await fetch('/clickup-api/user', {
        headers: { 'Authorization': cleanToken }
      });
      if (res.ok) {
        const data = await res.json();
        const userObj = data.user || data;
        setUserProfile(userObj);
        setUserClickUpToken(cleanToken);
        localStorage.setItem('crm_user_clickup_token', cleanToken);
        localStorage.setItem('crm_user_profile', JSON.stringify(userObj));
        
        // Sincroniza o token de forma segura (criptografado) com as Edge Functions em segundo plano
        syncUserClickUpCredentialsToEdge(cleanToken, userObj, supabaseClient, config);

        showToast(`Bem-vindo(a), ${userObj.username || userObj.email}! Autenticado com sucesso.`, 'success');
        setShowTokenModal(false);
        return true;
      } else {
        showToast('Token inválido ou expirado no ClickUp.', 'error');
        return false;
      }
    } catch (err) {
      console.error('Erro ao validar token:', err);
      showToast('Erro de conexão ao validar token no ClickUp.', 'error');
      return false;
    } finally {
      setValidatingToken(false);
    }
  };
  
  // Dashboard de Relatórios
  const [wonProposals, setWonProposals] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  // Separado de loadingDashboard (que só liga o spinner de tela cheia na
  // primeira carga): fica true durante QUALQUER refetch em segundo plano,
  // inclusive ao reentrar na aba com dados já em cache. Usado para segurar
  // a recriação dos gráficos até os dados frescos chegarem, evitando
  // desenhar com o cache antigo e logo em seguida redesenhar com o dado
  // novo (o "pisca duas vezes" reportado).
  const [dashboardFetching, setDashboardFetching] = useState(false);

  // Filtros de período e dados do Painel Comercial com persistência em localStorage
  const [startDate, setStartDate] = useState(() => {
    return localStorage.getItem('spa_selected_start') || `${new Date().getFullYear()}-01-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    return localStorage.getItem('spa_selected_end') || `${new Date().getFullYear()}-12-31`;
  });
  const [commercialData, setCommercialData] = useState([]);
  const [showCustomRange, setShowCustomRange] = useState(false);

  // Ref que mantém o período ativo sempre atualizado para o auto-polling
  const currentDateFilterRef = useRef({
    start: localStorage.getItem('spa_selected_start') || `${new Date().getFullYear()}-01-01`,
    end: localStorage.getItem('spa_selected_end') || `${new Date().getFullYear()}-12-31`,
    compStart: '',
    compEnd: ''
  });

  // Funções defensivas para compatibilidade Safari / WebKit
  const formatDateSafe = (dateStr, options = {}) => {
    if (!dateStr) return '';
    try {
      const cleanStr = String(dateStr).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
        const parts = cleanStr.split('-');
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('pt-BR', options);
      }
      const d = new Date(cleanStr.includes(' ') && !cleanStr.includes('T') ? cleanStr.replace(' ', 'T') : cleanStr);
      if (isNaN(d.getTime())) return cleanStr;
      return Object.keys(options).length > 0 ? d.toLocaleDateString('pt-BR', options) : d.toLocaleString('pt-BR');
    } catch (e) {
      return String(dateStr);
    }
  };

  const formatDateMsToYMD = (msOrString) => {
    if (!msOrString) return '';
    try {
      let d;
      if (typeof msOrString === 'number' || (!isNaN(Number(msOrString)) && String(msOrString).trim() !== '')) {
        d = new Date(Number(msOrString));
      } else {
        const cleanStr = String(msOrString).trim();
        d = new Date(cleanStr.includes(' ') && !cleanStr.includes('T') ? cleanStr.replace(' ', 'T') : cleanStr);
      }
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return '';
    }
  };

  const getFirstNameSafe = (nameStr) => {
    if (!nameStr || typeof nameStr !== 'string') return 'Usuário';
    const trimmed = nameStr.trim();
    if (!trimmed) return 'Usuário';
    return trimmed.split(' ')[0] || 'Usuário';
  };

  const formatVersionDisplay = (v) => {
    if (!v) return 'vA';
    const str = String(v).trim();
    return str.startsWith('v') ? str : `v${str}`;
  };

  const [projectContext, setProjectContext] = useState({
    name: '',
    proposal_number: ''
  });
  const [clickupTaskDates, setClickupTaskDates] = useState({ start_date: '', due_date: '' });

  // Referências para elementos de gráfico e instâncias do Chart.js
  const distributorCanvasRef = useRef(null);
  const manufacturerCanvasRef = useRef(null);
  const topProductsCanvasRef = useRef(null);
  const seasonalityCanvasRef = useRef(null);

  const distributorChartInst = useRef(null);
  const manufacturerChartInst = useRef(null);
  const topProductsChartInst = useRef(null);
  const seasonalityChartInst = useRef(null);

  const [topProductsFilterMode, setTopProductsFilterMode] = useState('value'); // 'value' | 'qty'
  
  // Contexto do ClickUp
  // Estados do Negócio/Propostas
  const [propostas, setPropostas] = useState([]);
  const [todasPropostas, setTodasPropostas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [distribuidores, setDistribuidores] = useState([]);
  const [vendedores, setVendedores] = useState(() => {
    const cached = localStorage.getItem('crm_cache_vendedores');
    return cached ? JSON.parse(cached) : [];
  });
  const [taskTypes, setTaskTypes] = useState(() => {
    const cached = localStorage.getItem('crm_cache_task_types');
    return cached ? JSON.parse(cached) : [
      { id: '1', nome: 'Ligação', emoji: '📞' },
      { id: '2', nome: 'Reunião', emoji: '👥' },
      { id: '3', nome: 'E-mail', emoji: '📧' },
      { id: '4', nome: 'Follow-up', emoji: '🔄' }
    ];
  });
  const [newTaskTypeName, setNewTaskTypeName] = useState('');
  const [newTaskTypeEmoji, setNewTaskTypeEmoji] = useState('');
  const [vendedoresOcultos, setVendedoresOcultos] = useState(() => {
    const cached = localStorage.getItem('crm_vendedores_ocultos');
    return cached ? JSON.parse(cached) : [];
  });
  const vendedoresVisiveis = useMemo(() => {
    return vendedores.filter(v => !v.oculto);
  }, [vendedores]);
  const [currentProposta, setCurrentProposta] = useState(null);
  const [itens, setItens] = useState([]);
  // Ref sempre atualizada com o valor mais recente de `itens`, para ser lida dentro do
  // setInterval de auto-polling (useEffect com deps [session, dbConnected, clickupTaskId,
  // supabaseClient]): esse efeito não é recriado enquanto o usuário digita itens em uma
  // mesma proposta, então a closure do intervalo ficaria presa no `itens` de quando o
  // efeito rodou pela última vez (array vazio) em vez do valor atual com itens não salvos.
  const itensRef = useRef([]);
  useEffect(() => {
    itensRef.current = itens;
  }, [itens]);
  // Mesma proteção do itensRef acima, mas para os campos da proposta editados
  // direto no formulário (Data de Fechamento, Data de Início, Tipo de Projeto,
  // Vendedor/Responsável): sem isso, o polling silencioso de 3 em 3 minutos
  // (fetchAllData) sobrescrevia uma edição em andamento assim que o usuário
  // digitava, antes de clicar em Salvar — o campo "salvava" vazio porque
  // currentProposta.data_fechamento já tinha voltado a null quando o clique
  // no Salvar disparava.
  const propostaDirtyRef = useRef(false);

  // Edição no Painel de Gestão (Produtos e Distribuidores)
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingDistributor, setEditingDistributor] = useState(null);
  const [newDistributorName, setNewDistributorName] = useState('');
  const [settingsActiveTab, setSettingsActiveTab] = useState('products'); // 'products' | 'distributors' | 'venders'
  const [showCloseModal, setShowCloseModal] = useState(false); // 'win' | 'loss' | false
  const [closeDate, setCloseDate] = useState('');
  const [selectedLossReason, setSelectedLossReason] = useState('');
  const [compareStartDate, setCompareStartDate] = useState('');
  const [compareEndDate, setCompareEndDate] = useState('');
  const [selectedDistributorFilter, setSelectedDistributorFilter] = useState('all');
  const [selectedManufacturerFilter, setSelectedManufacturerFilter] = useState('all');
  const [biMetrics, setBiMetrics] = useState({
    wonCount: 0, 
    wonValue: 0, 
    avgCycleDays: 0,
    ticketMedio: 0,
    wonQtyDiff: null, 
    wonValDiff: null, 
    avgCycleDaysDiff: null,
    ticketMedioDiff: null,
    lostCount: 0, 
    lostValue: 0, 
    lostQtyDiff: null, 
    lostValDiff: null,
    convRate: 0, 
    convRateDiff: null,
    seasonalityLabels: [],
    seasonalityValues: []
  });
  const [importFormat, setImportFormat] = useState('csv'); // 'csv' | 'xml'
  const [importText, setImportText] = useState('');
  const [isProjeto, setIsProjeto] = useState(false);
  const [openMenuVersionId, setOpenMenuVersionId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ nome: '', fabricante: '', custo_referencia: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [warningMsg, setWarningMsg] = useState('');
  const [showNovaOportunidadeKanban, setShowNovaOportunidadeKanban] = useState(false);
  const [contasParaBusca, setContasParaBusca] = useState([]);

  const [configNumeracao, setConfigNumeracao] = useState({ ultimo_numero: 13202, ativo: true });

  const carregarConfigNumeracao = async () => {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.from('config_numeracao_propostas').select('ultimo_numero, ativo').eq('id', 1).single();
    if (data) setConfigNumeracao(data);
  };

  useEffect(() => {
    if (showNovaOportunidadeKanban && supabaseClient && contasParaBusca.length === 0) {
      supabaseClient.from('contas').select('id, nome, cnpj').order('nome').then(({ data }) => {
        if (data) setContasParaBusca(data);
      });
    }
  }, [showNovaOportunidadeKanban, supabaseClient, contasParaBusca.length]);

  useEffect(() => {
    if (showSettingsModal && settingsActiveTab === 'numeracao') {
      carregarConfigNumeracao();
    }
  }, [showSettingsModal, settingsActiveTab, supabaseClient]);

  // Listener global de teclado para tecla ESC (executado após a inicialização de todos os estados)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showSettingsModal) {
          setShowSettingsModal(false);
          return;
        }
        if (showNewTaskModal) {
          setShowNewTaskModal(false);
          setSelectedProposalForTask(null);
          setSearchProposalQuery('');
          setProposalSearchResults([]);
          return;
        }
        if (openMenuVersionId !== null) {
          setOpenMenuVersionId(null);
          return;
        }
        if (showCloseModal) {
          setShowCloseModal(false);
          return;
        }
        if (showProductModal) {
          setShowProductModal(false);
          return;
        }
        if (showDrawer) {
          if (drawerTab === 'budget') {
            setDrawerTab('details');
          } else {
            setShowDrawer(false);
            setClickupTaskId('');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettingsModal, showNewTaskModal, openMenuVersionId, showCloseModal, showProductModal, showDrawer, drawerTab]);

  // Listener para fechar o menu dos 3 pontinhos ao rolar a página ou container
  useEffect(() => {
    if (openMenuVersionId !== null) {
      const handleScroll = () => setOpenMenuVersionId(null);
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [openMenuVersionId]);

  // Exposição global da função de controle do menu da versão para event delegation / fallback
  useEffect(() => {
    window.openVersionPortalMenu = (buttonElement, versionId) => {
      if (!buttonElement) return;
      const rect = buttonElement.getBoundingClientRect();
      const topPos = rect.bottom + 4;
      const leftPos = Math.max(10, rect.right - 180);
      const finalTop = (topPos + 100 > window.innerHeight) ? Math.max(10, rect.top - 80) : topPos;
      setMenuPosition({ top: finalTop, left: leftPos });
      setOpenMenuVersionId(versionId);
    };
    return () => {
      delete window.openVersionPortalMenu;
    };
  }, []);

  const saveTimeoutRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [kanbanSearchTerm, setKanbanSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Filtro por responsável embutido na própria busca do Kanban — em vez
  // de um controle novo na tela, a mesma caixa "Buscar negócio por
  // nome..." sugere um responsável quando o texto digitado bate com um
  // vendedor, e vira um "chip" de filtro ativo ao selecionar (ver o JSX
  // da lupa expansível do Kanban). Mutuamente exclusivo com busca por texto.
  const [kanbanFilterResponsavelId, setKanbanFilterResponsavelId] = useState(null);
  const [kanbanFilterResponsavelNome, setKanbanFilterResponsavelNome] = useState('');

  // Busca global do cabeçalho — pesquisa Empresas/Contatos/Negócios
  // direto no Supabase (não filtra dado já carregado como as outras
  // buscas do app, por isso o debounce) e, ao selecionar um resultado,
  // navega até ele (ver handleGlobalSearchSelect mais abaixo).
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState({ contas: [], contatos: [], negocios: [] });
  const [contaParaAbrir, setContaParaAbrir] = useState(null);
  const [abaContaParaAbrir, setAbaContaParaAbrir] = useState('visao_geral');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState('');
  
  // UX/UIs
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cálculos consolidados para os gráficos da aba de relatórios (Todos os itens de propostas GANHAS/SELECIONADAS)
  const distributorTotalsStableRef = useRef(null);
  const { distributorTotals, distributorTotalSum } = useMemo(() => {
    const totals = {};
    const wonItems = (commercialData || []).filter(item => {
      const prop = Array.isArray(item.propostas) ? item.propostas[0] : item.propostas;
      const sit = prop?.situacao;
      if (!sit || !prop?.data_fechamento) return false;
      const s = sit.trim().toLowerCase();
      if (s !== 'ganho' && s !== 'selecionada') return false;
      const cid = String(prop?.clickup_negocio_id || '').replace('#', '').trim();
      return cid && negociosEstagioRef.current.get(cid) === 'Ganho';
    });
    const itemsToProcess = wonItems.length > 0 ? wonItems : (commercialData || []);

    itemsToProcess.forEach(item => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const distObj = Array.isArray(item.distribuidores) ? item.distribuidores[0] : item.distribuidores;
      const distName = (distObj?.nome || 'NÃO INFORMADO').trim().toUpperCase();

      if (selectedDistributorFilter === 'all' || distName.toLowerCase() === selectedDistributorFilter.trim().toLowerCase()) {
        totals[distName] = (totals[distName] || 0) + value;
      }
    });
    
    const sortedTotals = {};
    Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .forEach(key => {
        sortedTotals[key] = totals[key];
      });

    const sum = Object.values(sortedTotals).reduce((a, b) => a + b, 0);
    return stabilizeByValue(distributorTotalsStableRef, { distributorTotals: sortedTotals, distributorTotalSum: sum });
  }, [commercialData, selectedDistributorFilter]);

  const manufacturerTotalsStableRef = useRef(null);
  const { manufacturerTotals, manufacturerTotalSum } = useMemo(() => {
    const totals = {};
    const wonItems = (commercialData || []).filter(item => {
      const prop = Array.isArray(item.propostas) ? item.propostas[0] : item.propostas;
      const sit = prop?.situacao;
      if (!sit || !prop?.data_fechamento) return false;
      const s = sit.trim().toLowerCase();
      if (s !== 'ganho' && s !== 'selecionada') return false;
      const cid = String(prop?.clickup_negocio_id || '').replace('#', '').trim();
      return cid && negociosEstagioRef.current.get(cid) === 'Ganho';
    });
    const itemsToProcess = wonItems.length > 0 ? wonItems : (commercialData || []);

    itemsToProcess.forEach(item => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const prodObj = Array.isArray(item.produtos) ? item.produtos[0] : item.produtos;
      const fabName = (prodObj?.fabricante || '').trim().toUpperCase();
      if (!fabName) return;

      if (selectedManufacturerFilter === 'all' || fabName.toLowerCase() === selectedManufacturerFilter.trim().toLowerCase()) {
        totals[fabName] = (totals[fabName] || 0) + value;
      }
    });

    const sortedTotals = {};
    Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .forEach(key => {
        sortedTotals[key] = totals[key];
      });

    const sum = Object.values(sortedTotals).reduce((a, b) => a + b, 0);
    return stabilizeByValue(manufacturerTotalsStableRef, { manufacturerTotals: sortedTotals, manufacturerTotalSum: sum });
  }, [commercialData, selectedManufacturerFilter]);

  // 1. Carregar Config do Servidor e Inicializar Cliente Supabase
  useEffect(() => {
    const initSupabase = async () => {
      try {
        let url = '';
        let anonKey = '';
        try {
          const response = await fetch('/api/config');
          if (response.ok) {
            const data = await response.json();
            url = data.SUPABASE_URL;
            anonKey = data.SUPABASE_ANON_KEY;
          }
        } catch (fetchErr) {
          console.warn("Aviso ao buscar /api/config, usando fallback:", fetchErr);
        }
        
        // Fallback de produção do Supabase Suprimática
        if (!url || !anonKey) {
          url = 'https://supabase.llworkflow.com.br';
          anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgzNTMyMjQ5LCJleHAiOjIwOTg4OTIyNDl9.DYJrIfSr6jdrn-xhmc9q_wGtfdRUYrYwP2UvkpvGLl0';
        }
        
        if (url && anonKey) {
          const client = window.supabase.createClient(url, anonKey);
          setSupabaseClient(client);
          setConfig({ url, anonKey });
          
          // Limpa safeStorage das chaves antigas por segurança
          safeStorage.removeItem('supa_url');
          safeStorage.removeItem('supa_key');
          safeStorage.removeItem('supabase_url');
          safeStorage.removeItem('supabase_key');
          safeStorage.removeItem('supabaseurl');
          safeStorage.removeItem('supabasekey');
          
          testConnection(client);
        } else {
          console.error("Configurações do Supabase ausentes.");
          setErrorMsg("Configurações do Supabase ausentes.");
        }
      } catch (err) {
        console.error("Erro ao inicializar Supabase:", err);
        setDbConnected(false);
        setErrorMsg("Erro ao inicializar conexão com o Supabase.");
      }
    };
    initSupabase();
  }, []);

  // Escuta autenticação
  useEffect(() => {
    if (!supabaseClient) return;
    
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, newSession) => {
      const savedToken = safeStorage.getItem('crm_user_clickup_token');
      if (newSession && savedToken) {
        setSession(newSession);
        loadProducts(supabaseClient);
        loadDistributors(supabaseClient);
        loadVendedores(supabaseClient);
        loadTiposTarefa(supabaseClient);
        loadSegmentosCache(supabaseClient);
      } else {
        if (newSession) {
          await supabaseClient.auth.signOut();
        }
        setSession(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabaseClient]);

  const handleLogin = async (email, password, clickupToken) => {
    if (!supabaseClient) return { error: { message: "Cliente Supabase não inicializado." } };
    if (!clickupToken || !clickupToken.trim()) {
      return { error: { message: "O Personal API Token do ClickUp é obrigatório para acessar o sistema." } };
    }
    const cleanToken = clickupToken.trim();
    try {
      // 1. Validar o token do ClickUp primeiro
      const userRes = await fetch('/clickup-api/user', {
        headers: { 'Authorization': cleanToken }
      });
      if (!userRes.ok) {
        return { error: { message: "Token do ClickUp inválido ou expirado. Verifique e tente novamente." } };
      }
      const userData = await userRes.json();
      const userObj = userData.user || userData;

      // 2. Salvar no safeStorage e atualizar estados ANTES de chamar signInWithPassword.
      // Isso evita que o listener onAuthStateChange do Supabase seja disparado antes de encontrar o token salvo!
      setUserProfile(userObj);
      safeStorage.setItem('crm_user_clickup_token', cleanToken);
      safeStorage.setItem('crm_user_profile', JSON.stringify(userObj));

      // 3. Tentar o login no Supabase
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        // Em caso de senha ou e-mail incorreto no Supabase, desfaz o salvamento do token
        localStorage.removeItem('crm_user_clickup_token');
        localStorage.removeItem('crm_user_profile');
        setUserClickUpToken('');
        setUserProfile(null);
        return { error };
      }

      setSession(data.session);

      // Sincroniza o token de forma segura (criptografado) com as Edge Functions
      syncUserClickUpCredentialsToEdge(cleanToken, userObj, supabaseClient, config);

      return data;
    } catch (err) {
      console.error("Erro no processo de login/validação do ClickUp:", err);
      // Limpeza em caso de exceção de rede
      localStorage.removeItem('crm_user_clickup_token');
      localStorage.removeItem('crm_user_profile');
      setUserClickUpToken('');
      setUserProfile(null);
      return { error: { message: "Erro de conexão ao validar o Token no ClickUp." } };
    }
  };

  // Testar conexão buscando produtos
  const testConnection = async (client) => {
    try {
      const { data, error } = await client.from('produtos').select('id').limit(1);
      if (error) throw error;
      setDbConnected(true);
      setErrorMsg('');
      
      const { data: { session } } = await client.auth.getSession();
      const savedToken = safeStorage.getItem('crm_user_clickup_token');
      if (session && savedToken) {
        setSession(session);
        loadProducts(client);
        loadDistributors(client);
        loadVendedores(client);
        loadTiposTarefa(client);
        loadSegmentosCache(client);
      } else {
        if (session) {
          await client.auth.signOut();
        }
        setSession(null);
      }
    } catch (err) {
      console.error("Erro de conexão com o banco:", err);
      setDbConnected(false);
      setErrorMsg('Falha ao conectar ao Supabase. Verifique suas credenciais.');
    }
  };

  // Funções do Kanban
  // `task.estagio` é o nome do estágio direto da tabela `negocios` do Supabase
  // (não mais um custom field do ClickUp) — só resolvemos o "id" da coluna
  // (kanbanColumns) pra manter compatibilidade com todo o código existente
  // que casa cards com colunas por id.
  const getTaskOptionId = (task, options) => {
    if (!task || !task.estagio) return null;
    const safeOpts = (options && options.length > 0) ? options : ESTAGIO_OPTIONS;
    const opt = safeOpts.find(o => (o.name || '').toLowerCase().trim() === String(task.estagio || '').toLowerCase().trim());
    return opt ? opt.id : null;
  };

  // Único lugar que decide "qual proposta representa o valor do negócio hoje"
  // quando nenhuma foi Selecionada/Ganho — usado por getOpportunityValue e por
  // fetchKanbanData (antes duplicado em 3 pontos, risco real de divergência).
  // Ordem: uma decisão real do cliente (Selecionada/Ganho) sempre vence; abaixo
  // dela, a referência de forecast marcada manualmente vence sobre cair
  // cegamente na proposta mais recente — mas só enquanto a proposta ainda está
  // 'Ativa' (assim a flag nunca precisa ser limpa explicitamente quando a
  // proposta muda de situação: ou uma camada acima já venceu, ou o guard
  // 'Ativa' a exclui).
  const resolveBestProposta = (props) => {
    if (!props || props.length === 0) return null;
    return (
      props.find(p => p.situacao === 'Selecionada') ||
      props.find(p => p.situacao === 'Ganho') ||
      props.find(p => p.referencia_forecast === true && p.situacao === 'Ativa') ||
      props.find(p => p.situacao === 'Ativa') ||
      props.find(p => p.situacao === 'Desconsiderada') ||
      props[0]
    );
  };

  const getOpportunityValue = (task) => {
    if (!task) return null;

    // 1. PRIORIDADE MÁXIMA: Valor enriquecido em memória do Supabase (trata as chaves de ID normalizadas)
    if (task.supabase_deal_value !== undefined && task.supabase_deal_value !== null) {
      const val = parseFloat(task.supabase_deal_value);
      if (!isNaN(val)) return val;
    }

    const cleanId = String(task.id || '').replace('#', '').trim();

    // Fallback secundário: busca direta em supabaseProposalsList por ID
    if (supabaseProposalsList && supabaseProposalsList.length > 0) {
      const props = supabaseProposalsList.filter(p => {
        const pClean = String(p.clickup_negocio_id || '').replace('#', '').trim();
        return pClean === cleanId;
      });
      if (props.length > 0) {
        const best = resolveBestProposta(props);
        const val = parseFloat(best.total_proposta);
        if (!isNaN(val)) return val;
      }
    }
    
    // 2. Fallback: valor_estimado injetado no card
    if (task.valor_estimado !== undefined && task.valor_estimado !== null) {
      const ve = parseFloat(task.valor_estimado);
      if (!isNaN(ve)) return ve;
    }

    // 3. Fallback: valor_clickup_fallback (negocios.valor_clickup_fallback — espelho
    // do campo "Valor do negócio" do ClickUp, só usado quando o negócio ainda não
    // tem nenhuma proposta no Supabase)
    if (task.valor_clickup_fallback !== undefined && task.valor_clickup_fallback !== null) {
      const raw = parseFloat(task.valor_clickup_fallback);
      if (!isNaN(raw)) {
        return raw;
      }
    }

    return null;
  };

  // Valor do negócio restrito a um fabricante (usado pelo filtro do Forecast) — sem
  // fabricante selecionado, cai no valor cheio da proposta (getOpportunityValue).
  const getOpportunityValueForFabricante = (task, fabricante) => {
    if (!fabricante) return getOpportunityValue(task);
    return task?.valorPorFabricante?.[fabricante] || 0;
  };

  const getOpportunityResponsavel = (task) => {
    if (!task || !supabaseProposalsList) return '';
    const cleanId = String(task.id).replace('#', '').trim();
    const props = supabaseProposalsList.filter(p => {
      const pClean = String(p.clickup_negocio_id).replace('#', '').trim();
      return pClean === cleanId;
    });
    if (props.length > 0) {
      const selectedProp = props.find(p => p.situacao === 'Selecionada' || p.situacao === 'Ganho') || props[0];
      return selectedProp.criado_por || '';
    }
    return '';
  };

  const refreshSupabaseProposalsList = async () => {
    if (!supabaseClient) return;
    try {
      const { data } = await supabaseClient
        .from('propostas')
        .select('clickup_negocio_id, total_proposta, situacao, criado_por, referencia_forecast');
      if (data) {
        setSupabaseProposalsList(data);
      }
    } catch (err) {
      console.warn("Erro silencioso ao atualizar lista global de propostas:", err);
    }
  };

  const handleResponsavelChange = async (taskId, responsavelNome, responsavelId = null) => {
    // 1. Interface Otimista: Mudar na tela imediatamente preservando o valor estimado
    setKanbanTasks(prevTasks => prevTasks.map(t => t.id === taskId ? { ...t, responsavel_negocio: responsavelNome, valor_estimado: t.valor_estimado } : t));
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => ({ ...prev, responsavel_negocio: responsavelNome, valor_estimado: prev.valor_estimado }));
    }

    const cleanId = String(taskId).replace('#', '').trim();

    // 2. Sincronização com ClickUp via Assignees nativos
    try {
      if (responsavelId) {
        const res = await fetch(`/clickup-api/task/${taskId}/assignee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
          body: JSON.stringify({ assignees: [responsavelId] })
        });
        if (!res.ok) throw new Error("Erro ClickUp Assignee");
      }
    } catch (e) {
      console.warn("Erro ao atualizar responsável no ClickUp:", e);
    }

    // 3. Atualizar no Supabase
    try {
      const { data, error } = await supabaseClient
        .from('propostas')
        .update({ criado_por: responsavelNome })
        .eq('clickup_negocio_id', cleanId)
        .select('id');

      if (error) throw error;

      if (!data || data.length === 0) {
        await supabaseClient
          .from('propostas')
          .insert({
            clickup_negocio_id: cleanId,
            versao: 'vA',
            situacao: 'Selecionada',
            criado_por: responsavelNome,
            criado_por_user_id: userProfile?.id ? String(userProfile.id) : null,
            cenario: '',
            total_proposta: 0
          });
      }

      // Mantém negocios.responsavel_nome/responsavel_clickup_id em sincronia —
      // é a fonte que fetchKanbanData prioriza (ver migration 20260819g).
      try {
        await supabaseClient
          .from('negocios')
          .update({
            responsavel_nome: responsavelNome || null,
            responsavel_clickup_id: responsavelId ? String(responsavelId) : null,
          })
          .eq('clickup_negocio_id', cleanId);
      } catch (negErr) {
        console.warn("Erro silencioso ao sincronizar responsável em negocios:", negErr);
      }

      await refreshSupabaseProposalsList();
      loadDashboardData();
    } catch (err) {
      console.warn("Erro silencioso ao persistir responsável no Supabase:", err);
    }
  };

  const fetchKanbanData = async (silent = false) => {
    if (kanbanTasks.length === 0 && !silent) {
      setLoadingKanban(true);
    }
    // Só marca "acabou de buscar" quando existe cliente de verdade — no
    // primeiro render supabaseClient ainda é null (conexão ainda not resolvida)
    // e essa função roda mesmo assim sem buscar nada; marcar o timestamp nesse
    // caso fazia o TTL do useEffect de troca de aba (abaixo) achar que já tinha
    // buscado recentemente e bloquear a busca de verdade assim que o cliente
    // ficasse pronto, deixando o Kanban vazio até o usuário trocar de aba.
    if (supabaseClient) {
      lastKanbanFetchAtRef.current = Date.now();
    }
    try {
      // Negócios, propostas e itens_proposta — tudo direto do Supabase agora.
      // O Kanban não faz mais nenhuma chamada ao ClickUp pra se popular (a
      // SPA é a fonte de verdade; ver docs/resumo.md, tabela `negocios`).
      const negociosPromise = supabaseClient
        ? supabaseClient.from('negocios').select('clickup_negocio_id, nome, estagio, valor_clickup_fallback, conta_id, responsavel_nome, responsavel_clickup_id')
        : Promise.resolve({ data: [], error: null });

      const propsPromise = supabaseClient
        ? supabaseClient.from('propostas').select('id, clickup_negocio_id, total_proposta, situacao, criado_por, data_fechamento, motivo_perda, referencia_forecast')
        : Promise.resolve({ data: [], error: null });

      const itensPromise = supabaseClient
        ? supabaseClient.from('itens_proposta').select('proposta_id, quantidade, preco_unitario, produtos(fabricante)')
        : Promise.resolve({ data: [], error: null });

      const [{ data: negociosData, error: negociosErr }, { data: props, error: propsErr }, { data: itensData, error: itensErr }] = await Promise.all([
        negociosPromise,
        propsPromise,
        itensPromise,
      ]);

      if (negociosErr) {
        console.error("Erro ao carregar negócios do Supabase:", negociosErr);
      }

      setKanbanColumns(ESTAGIO_OPTIONS);

      // Índice proposta_id -> lista de fabricantes distintos dos itens da proposta,
      // e proposta_id -> valor somado (quantidade * preco_unitario) por fabricante
      // — usado pelo filtro de fabricante do Forecast pra não contar o negócio
      // inteiro quando ele mistura vários fabricantes (ver docs/resumo.md).
      const fabricantesByPropId = new Map();
      const valorPorFabricantePropId = new Map();
      if (!itensErr && itensData) {
        for (const item of itensData) {
          const prodObj = Array.isArray(item.produtos) ? item.produtos[0] : item.produtos;
          const fab = (prodObj?.fabricante || '').trim();
          if (!fab || !item.proposta_id) continue;
          if (!fabricantesByPropId.has(item.proposta_id)) fabricantesByPropId.set(item.proposta_id, new Set());
          fabricantesByPropId.get(item.proposta_id).add(fab);

          const itemValor = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
          if (!valorPorFabricantePropId.has(item.proposta_id)) valorPorFabricantePropId.set(item.proposta_id, {});
          const fabTotals = valorPorFabricantePropId.get(item.proposta_id);
          fabTotals[fab] = (fabTotals[fab] || 0) + itemValor;
        }
      }

      let propsList = [];
      if (!propsErr && props) {
        propsList = props;
        setSupabaseProposalsList(props);
      }

      // Índice das propostas por clickup_negocio_id (uma vez, O(m)) em vez de
      // filtrar a lista inteira de propostas para cada um dos negócios (O(n*m)).
      const propsByClickupId = new Map();
      for (const p of propsList) {
        const pClean = String(p.clickup_negocio_id || '').replace('#', '').trim();
        if (!pClean) continue;
        if (!propsByClickupId.has(pClean)) propsByClickupId.set(pClean, []);
        propsByClickupId.get(pClean).push(p);
      }

      // Enriquecer negócios com responsável e valor da proposta do Supabase
      const enrichedTasks = (negociosData || []).filter(n => n.clickup_negocio_id).map(n => {
        const idClean = String(n.clickup_negocio_id || '').replace('#', '').trim();
        const matchedProps = [
          ...(propsByClickupId.get(idClean) || []),
          ...(idClean ? propsByClickupId.get('#' + idClean) || [] : []),
        ];

        // Responsável: prioriza negocios.responsavel_nome (disponível desde a
        // criação, ver migration 20260819g) — só cai pro criado_por da melhor
        // proposta em negócios antigos que ainda não têm esse campo preenchido.
        let resp = n.responsavel_nome || '';
        let supabaseDealValue = null;
        let fabricantes = [];
        let valorPorFabricante = {};
        let dataFechamento = null;

        const best = matchedProps.length > 0 ? resolveBestProposta(matchedProps) : null;

        if (best) {
          if (!resp) resp = best.criado_por || '';
          const v = parseFloat(best.total_proposta);
          if (!isNaN(v)) supabaseDealValue = v;
          fabricantes = Array.from(fabricantesByPropId.get(best.id) || []);
          valorPorFabricante = valorPorFabricantePropId.get(best.id) || {};
          dataFechamento = best.data_fechamento || null;
        }

        return {
          id: idClean,
          name: n.nome,
          estagio: n.estagio,
          valor_clickup_fallback: n.valor_clickup_fallback,
          conta_id: n.conta_id || null,
          custom_fields: [],
          responsavel_negocio: resp,
          responsavel_clickup_id: n.responsavel_clickup_id || null,
          supabase_deal_value: supabaseDealValue,
          fabricantes,
          valorPorFabricante,
          data_fechamento: dataFechamento,
          // Id da proposta no Supabase (não o do ClickUp) — usado pela
          // exportação completa (com produtos) da Lista de Negócios, pra
          // achar os itens_proposta ligados a esse negócio.
          proposta_id: best?.id || null,
          situacao: best?.situacao || null,
          motivo_perda: best?.motivo_perda || null,
        };
      });

      setKanbanTasks(enrichedTasks);
      try {
        safeStorage.setItem('crm_cache_kanban_tasks_v4', JSON.stringify(enrichedTasks));
      } catch (storageErr) {
        // Ignora cota excedida do Safari silenciosamente
      }
    } catch (err) {
      console.error("Erro ao carregar dados do Kanban:", err);
      showToast("Erro ao carregar dados do Kanban.", "error");
    } finally {
      if (!silent) setLoadingKanban(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'kanban' && (kanbanTasks.length === 0 || Date.now() - lastKanbanFetchAtRef.current > TAB_CACHE_TTL_MS)) {
      fetchKanbanData();
    }
  }, [activeTab, supabaseClient]);

  // Pré-carrega tarefas comerciais na montagem inicial para o drawer não iniciar vazio
  useEffect(() => {
    if (supabaseClient) {
      fetchCommercialTasks(supabaseClient);
    }
  }, [supabaseClient]);

  const updateTaskStage = async (taskId, newOptionId) => {
    const res = await fetch(`/clickup-api/task/${taskId}/field/c8d0abe2-c59f-4a9e-93ff-bd060659aa63`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders()
      },
      body: JSON.stringify({ value: newOptionId })
    });
    if (!res.ok) {
      throw new Error("Falha na atualização do estágio no ClickUp");
    }
  };

  const updateTaskClickupStatus = async (taskId, statusName) => {
    const res = await fetch(`/clickup-api/task/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
      body: JSON.stringify({ status: statusName })
    });
    if (!res.ok) {
      throw new Error("Falha na atualização do status nativo no ClickUp");
    }
  };

  const handleOpportunityStateChange = async (taskId, targetOptionId) => {
    try {
      const targetOption = kanbanColumns.find(c => c.id === targetOptionId);
      if (!targetOption) return;

      const targetName = targetOption.name.toLowerCase();
      let clickupStatus = "ABERTO";

      if (targetName.includes("ganho")) {
        clickupStatus = "FECHADO";
      } else if (targetName.includes("perdido")) {
        clickupStatus = "PERDIDO/CANCELADO";
      }

      // 1. Atualização otimista local do estado do React (move card no Kanban e no SelectedTask)
      setKanbanTasks(prev => prev.map(t => (t.id === taskId ? { ...t, estagio: targetOption.name } : t)));
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(prev => (prev ? { ...prev, estagio: targetOption.name } : prev));
      }

      const cleanTaskId = String(taskId).replace('#', '').trim();
      const idWithHash = '#' + cleanTaskId;

      // 2. Supabase é a fonte de verdade do estágio agora — grava lá primeiro.
      if (supabaseClient) {
        const { error: estagioErr } = await supabaseClient
          .from('negocios')
          .update({ estagio: targetOption.name })
          .or(`clickup_negocio_id.eq.${cleanTaskId},clickup_negocio_id.eq.${idWithHash}`);
        if (estagioErr) throw estagioErr;
      }

      // 3. Propaga pro ClickUp (espelho, pra quem ainda consulta o negócio por lá)
      await Promise.all([
        updateTaskStage(cleanTaskId, targetOptionId),
        updateTaskClickupStatus(cleanTaskId, clickupStatus)
      ]);

      // 4. REGRA DE REABERTURA: Se o estágio escolhido for do pipeline ativo (não Ganho e não Perdido),
      // reabrir propostas associadas em Supabase limpando data_fechamento e motivo_perda.
      // Isolado em seu próprio try/catch: é uma limpeza acessória — uma falha aqui não pode
      // derrubar a mudança de estágio em si, que já foi salva com sucesso nos passos 2 e 3.
      if (!targetName.includes("ganho") && !targetName.includes("perdido") && supabaseClient) {
        try {
          await supabaseClient
            .from('propostas')
            .update({
              situacao: 'Selecionada',
              data_fechamento: null,
              motivo_perda: null
            })
            .or(`clickup_negocio_id.eq.${cleanTaskId},clickup_negocio_id.eq.${idWithHash}`)
            .in('situacao', ['Ganho', 'Perdido']);

          if (currentProposta && (currentProposta.situacao === 'Ganho' || currentProposta.situacao === 'Perdido')) {
            setCurrentProposta(prev => ({
              ...prev,
              situacao: 'Selecionada',
              data_fechamento: null,
              motivo_perda: null
            }));
          }
          setPropostas(prev => prev.map(p => {
            if (p.situacao === 'Ganho' || p.situacao === 'Perdido') {
              return { ...p, situacao: 'Selecionada', data_fechamento: null, motivo_perda: null };
            }
            return p;
          }));
        } catch (reaberturaErr) {
          console.warn("Estágio mudou com sucesso, mas falhou ao reabrir propostas associadas:", reaberturaErr);
        }
      }

      showToast(`Oportunidade atualizada!`, "success");
      return true;
    } catch (err) {
      console.error("Erro na sincronização de estado:", err);
      showToast("Não foi possível atualizar a oportunidade.", "error");
      fetchKanbanData();
      return false;
    }
  };

  // Handlers do Drag & Drop Nativo
  // useCallback com deps vazias: só usa params + window, nada do escopo do
  // componente — necessário pra o React.memo(KanbanCard) de fato evitar
  // re-render (sem isso, cada render de App() cria uma função nova e o memo
  // nunca bate na comparação rasa de props).
  const handleDragStart = useCallback((e, task) => {
    window.getSelection()?.removeAllRanges();
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = async (e, targetOptionId) => {
    e.preventDefault();
    try {
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;

      const task = kanbanTasks.find(t => t.id === taskId);
      if (!task) return;

      const currentOptionId = getTaskOptionId(task, kanbanColumns);
      if (currentOptionId === targetOptionId) return;

      const targetOption = kanbanColumns.find(c => c.id === targetOptionId);
      const targetName = (targetOption?.name || '').toLowerCase();

      // Arrastar direto pra Ganho/Perdido precisa passar pelo mesmo fluxo oficial de
      // fechamento que o dropdown de Status já usa (handleConfirmClose) — só ele grava
      // data_fechamento/motivo_perda na proposta. handleOpportunityStateChange sozinho só
      // move o estágio do negócio; sem data_fechamento, esse negócio nunca aparece no
      // relatório de faturamento (achado em 19/08, ver docs/resumo.md).
      if (targetName.includes('ganho') || targetName.includes('perdido')) {
        const idWithoutHash = taskId.startsWith('#') ? taskId.substring(1) : taskId;
        const idWithHash = '#' + idWithoutHash;
        const { data: props, error } = await supabaseClient
          .from('propostas')
          .select('*')
          .or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`)
          .order('created_at', { ascending: false });

        if (error || !props || props.length === 0) {
          showToast('Não foi possível localizar a proposta deste negócio.', 'error');
          return;
        }

        const selected = props.find(p => p.situacao === 'Selecionada') || props.find(p => p.versao === 'vA') || props[0];
        setClickupTaskId(taskId);
        setPropostas(props);
        await loadProposalDetails(selected.id);
        setCloseDate(new Date().toISOString().split('T')[0]);
        if (targetName.includes('ganho')) {
          setShowCloseModal('win');
        } else {
          setSelectedLossReason('');
          setShowCloseModal('loss');
        }
        return;
      }

      await handleOpportunityStateChange(taskId, targetOptionId);
    } catch (dropErr) {
      console.error("Erro ao mover o card:", dropErr);
      showToast("Erro inesperado ao mover o card.", "error");
      fetchKanbanData();
    }
  };

  // Handler de Clique para abrir o Drawer
  // useCallback com deps vazias: só chama setters de estado (sempre estáveis
  // pelo React), mesmo motivo do handleDragStart acima.
  const handleCardClick = useCallback((task) => {
    setSelectedTask(task);
    setClickupTaskId(task.id);
    setDrawerTab('details');
    setDrawerSection('propostas');
    setEmpresaDoNegocio(null);
    setContatosDoNegocio([]);
    setShowDrawer(true);
  }, []);

  // Busca global do cabeçalho: 3 queries em paralelo, uma por tabela —
  // cada .or() só referencia colunas da própria tabela, então não esbarra
  // na limitação do PostgREST de .or() com coluna de tabela embutida.
  // Diferente das outras buscas do app (todas filtram array já carregado
  // em memória), essa bate direto no Supabase — por isso o debounce no
  // useEffect logo abaixo, em vez de rodar a cada tecla.
  const buscarGlobal = async (termo) => {
    if (!supabaseClient || !termo || termo.trim().length < 2) {
      setGlobalSearchResults({ contas: [], contatos: [], negocios: [] });
      return;
    }
    setGlobalSearchLoading(true);
    try {
      const t = `%${termo.trim()}%`;
      const [contasRes, contatosRes, negociosRes] = await Promise.all([
        supabaseClient.from('contas').select('id,nome,cnpj,razao_social,cidade')
          .or(`nome.ilike.${t},cnpj.ilike.${t},razao_social.ilike.${t}`).limit(5),
        supabaseClient.from('contatos').select('id,nome,email,cargo,conta_id')
          .or(`nome.ilike.${t},email.ilike.${t}`).limit(5),
        supabaseClient.from('negocios').select('id,nome,numero_proposta_oficial,estagio,conta_id,clickup_negocio_id')
          .or(`nome.ilike.${t},numero_proposta_oficial.ilike.${t}`).limit(5),
      ]);
      setGlobalSearchResults({
        contas: contasRes.data || [],
        contatos: contatosRes.data || [],
        negocios: negociosRes.data || [],
      });
    } catch (err) {
      console.error('[Busca Global] Erro:', err);
      setGlobalSearchResults({ contas: [], contatos: [], negocios: [] });
    } finally {
      setGlobalSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!isGlobalSearchOpen) return;
    const termo = globalSearchTerm.trim();
    if (termo.length < 2) {
      setGlobalSearchResults({ contas: [], contatos: [], negocios: [] });
      return;
    }
    const timeoutId = setTimeout(() => buscarGlobal(termo), 300);
    return () => clearTimeout(timeoutId);
  }, [globalSearchTerm, isGlobalSearchOpen, supabaseClient]);

  // Navegação ao selecionar um resultado da busca global. Negócio e
  // Proposta reaproveitam handleCardClick (o mesmo caminho que já abre o
  // drawer ao clicar num card do Kanban) — o drawer é um overlay fixo,
  // funciona vindo de qualquer aba. Empresa/Contato usam a ponte nova
  // (contaParaAbrir/abaContaParaAbrir) consumida dentro de EmpresasTab.
  const handleGlobalSearchSelect = async (tipo, item) => {
    setGlobalSearchTerm('');
    setIsGlobalSearchOpen(false);
    setGlobalSearchResults({ contas: [], contatos: [], negocios: [] });

    if (tipo === 'negocio') {
      handleCardClick({
        id: String(item.clickup_negocio_id || '').replace('#', '').trim(),
        name: item.nome,
        estagio: item.estagio,
        clickup_negocio_id: item.clickup_negocio_id,
        numero_proposta_oficial: item.numero_proposta_oficial,
        conta_id: item.conta_id,
      });
    } else if (tipo === 'conta') {
      setActiveTab('empresas');
      setAbaContaParaAbrir('visao_geral');
      setContaParaAbrir(item);
    } else if (tipo === 'contato') {
      // A busca só traz o conta_id do contato, não a conta inteira — busca
      // a conta-mãe completa antes de abrir (FichaEmpresaDrawer precisa de
      // nome/cnpj/etc., não só do id).
      setActiveTab('empresas');
      setAbaContaParaAbrir('contatos');
      if (supabaseClient && item.conta_id) {
        const { data } = await supabaseClient.from('contas').select('*').eq('id', item.conta_id).single();
        if (data) setContaParaAbrir(data);
      }
    }
  };

  const resolveTaskIdFormat = async (rawId) => {
    if (!supabaseClient || !rawId) return rawId;
    try {
      const cleanId = rawId.startsWith('#') ? rawId.substring(1) : rawId;
      const idWithHash = '#' + cleanId;
      const { data, error } = await supabaseClient
        .from('propostas')
        .select('clickup_negocio_id')
        .or(`clickup_negocio_id.eq.${cleanId},clickup_negocio_id.eq.${idWithHash}`)
        .limit(1);
      if (!error && data && data.length > 0) {
        return data[0].clickup_negocio_id;
      }
    } catch (err) {
      console.error("Erro ao resolver formato do ID:", err);
    }
    return rawId;
  };

  const parseNumericValue = (val) => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return Number(val.toFixed(2));
    const str = String(val).trim();
    if (str.includes(',')) {
      const cleanStr = str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
      return parseFloat(cleanStr) || 0;
    } else {
      const cleanStr = str.replace(/[^\d.-]/g, '');
      return parseFloat(cleanStr) || 0;
    }
  };

  // 2. Extrair ID do ClickUp da URL ou permitir entrada
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('task_id') || params.get('clickup_id') || params.get('id') || '';
    if (id) {
      if (supabaseClient) {
        resolveTaskIdFormat(id).then(resolvedId => {
          setClickupTaskId(resolvedId);
        });
      } else {
        setClickupTaskId(id);
      }
    }
  }, [supabaseClient]);

  useEffect(() => {
    if (dbConnected) {
      loadTodasPropostas();
    }
  }, [dbConnected]);

  // Carregar contexto do ClickUp via Edge Function Proxy
  useEffect(() => {
    if (dbConnected && clickupTaskId) {
      fetchProjectContext();
    } else {
      setProjectContext({ name: '', proposal_number: '' });
    }
  }, [dbConnected, clickupTaskId]);

  const fetchProjectContext = async () => {
    if (!clickupTaskId || !supabaseClient) return;
    try {
      const idWithoutHash = clickupTaskId.startsWith('#') ? clickupTaskId.substring(1) : clickupTaskId;
      const idWithHash = '#' + idWithoutHash;

      // 1. Busca INSTANTÂNEA no Supabase (negócios e propostas locais)
      const [{ data: negData }, { data: propData }] = await Promise.all([
        supabaseClient
          .from('negocios')
          .select('id, nome, estagio, numero_proposta_oficial, created_at, conta_id')
          .or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`)
          .limit(1),
        supabaseClient
          .from('propostas')
          .select('id')
          .or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`)
          .order('created_at', { ascending: true })
          .limit(1)
      ]);

      const neg = negData && negData[0];
      const proposalNumber = (propData && propData[0]) ? `#${propData[0].id}` : (neg?.numero_proposta_oficial ? `Nº ${neg.numero_proposta_oficial}` : 'Nova vA');
      const realName = neg?.nome || selectedTask?.nome || selectedTask?.name || `Projeto CRM #${idWithoutHash}`;

      // Atualiza o estado da tela IMEDIATAMENTE (sem esperar ClickUp)
      setProjectContext({
        name: realName,
        proposal_number: proposalNumber
      });

      if (neg && neg.estagio) {
        setSelectedTask(prev => ({
          ...(prev || {}),
          id: idWithoutHash,
          estagio: neg.estagio,
          nome: neg.nome,
          name: neg.nome,
          numero_proposta_oficial: neg.numero_proposta_oficial,
          conta_id: neg.conta_id || (prev && prev.conta_id) || null
        }));
      }

      // 2. Busca secundária de metadados no ClickUp de forma assíncrona (não bloqueia a tela)
      fetch(`/clickup-api/task/${idWithoutHash}`, { headers: { ...getSupabaseHeaders() } })
        .then(r => r.ok ? r.json() : null)
        .then(taskData => {
          if (!taskData) return;
          if (taskData.list && taskData.list.id) setClickupListId(taskData.list.id);
          const startVal = taskData.start_date ? formatDateMsToYMD(taskData.start_date) : (taskData.date_created ? formatDateMsToYMD(taskData.date_created) : '');
          const dueVal = taskData.due_date ? formatDateMsToYMD(taskData.due_date) : '';
          if (startVal || dueVal) {
            setClickupTaskDates({ start_date: startVal, due_date: dueVal });
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error("Erro em fetchProjectContext:", err);
    }
  };

  // Aba "Empresa" do drawer do negócio: carrega sob demanda (só quando a aba é
  // aberta), e só refaz o fetch se a empresa mudou — evita recarregar ao trocar
  // de aba dentro do mesmo drawer.
  useEffect(() => {
    if (drawerSection !== 'empresa' || !supabaseClient) return;
    const contaId = selectedTask?.conta_id;
    if (!contaId) { setEmpresaDoNegocio(null); setContatosDoNegocio([]); return; }
    if (empresaDoNegocio && empresaDoNegocio.id === contaId) return;

    setLoadingEmpresaDoNegocio(true);
    (async () => {
      try {
        const [{ data: conta, error: contaErr }, { data: contatosData, error: contatosErr }] = await Promise.all([
          supabaseClient.from('contas').select('*').eq('id', contaId).single(),
          supabaseClient.from('contatos').select('*').eq('conta_id', contaId).order('nome'),
        ]);
        if (!contaErr) setEmpresaDoNegocio(conta || null);
        if (!contatosErr) setContatosDoNegocio(contatosData || []);
      } catch (err) {
        console.warn("Erro ao carregar empresa do negócio:", err);
      } finally {
        setLoadingEmpresaDoNegocio(false);
      }
    })();
  }, [drawerSection, selectedTask?.conta_id, supabaseClient]);

  // Carregar produtos cadastrados
  const loadProducts = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from('produtos').select('*').order('nome');
    if (!error && data) {
      setProdutos(data);
    }
  };

  // Carregar distribuidores cadastrados
  const loadDistributors = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from('distribuidores').select('*').order('nome');
    if (!error && data) {
      setDistribuidores(data);
    }
  };

  // Carregar tipos de tarefa — Supabase é a fonte de verdade (antes só localStorage,
  // divergia entre navegadores/máquinas). localStorage continua como cache pra
  // load instantâneo antes da resposta do Supabase chegar.
  const loadTiposTarefa = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from('tipos_tarefa').select('id, nome, emoji').eq('ativo', true).order('nome');
    if (!error && data) {
      setTaskTypes(data);
      try { safeStorage.setItem('crm_cache_task_types', JSON.stringify(data)); } catch (e) {}
    }
  };

  // Carregar segmentos — mesma lógica do loadTiposTarefa acima. Só escreve no
  // localStorage (não há state próprio aqui) porque quem exibe é o componente
  // SegmentosSettings (mais abaixo) e o módulo Empresa 360 (empresas.js), que
  // lê essa mesma chave.
  const loadSegmentosCache = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from('segmentos').select('nome').eq('ativo', true).order('nome');
    if (!error && data) {
      try { safeStorage.setItem('crm_segmentos', JSON.stringify(data.map(s => s.nome))); } catch (e) {}
    }
  };

  // Carregar vendedores cadastrados — restrito a quem já logou no CRM com token
  // próprio (tabela usuarios_clickup, exposta via view usuarios_clickup_registrados
  // sem o token). Se a view falhar, cai pra lista completa do ClickUp (dropdown de
  // conveniência, não controle de acesso — ver docs/resumo.md).
  const loadVendedores = async () => {
    try {
      const teamsRes = await fetch('/clickup-api/team', { headers: { ...getSupabaseHeaders() } });
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        if (teamsData.teams && teamsData.teams.length > 0) {
          const teamId = teamsData.teams[0].id;
          const membersRes = await fetch(`/clickup-api/team/${teamId}`, { headers: { ...getSupabaseHeaders() } });
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            if (membersData.team && membersData.team.members) {
              let users = membersData.team.members.map(m => m.user);

              if (supabaseClient) {
                try {
                  const { data: registrados, error: registradosErr } = await supabaseClient
                    .from('usuarios_clickup_registrados')
                    .select('clickup_user_id');
                  if (!registradosErr && registrados) {
                    const registradosIds = new Set(registrados.map(r => String(r.clickup_user_id)));
                    users = users.filter(u => registradosIds.has(String(u.id)));
                  } else if (registradosErr) {
                    console.warn("Erro ao carregar usuários registrados no CRM, exibindo todo o workspace ClickUp:", registradosErr);
                  }
                } catch (registradosErr) {
                  console.warn("Erro ao carregar usuários registrados no CRM, exibindo todo o workspace ClickUp:", registradosErr);
                }
              }

              const ocultos = JSON.parse(safeStorage.getItem('crm_vendedores_ocultos') || '[]');
              const mapped = users.map(u => ({
                id: u.id,
                nome: u.username || u.email,
                oculto: ocultos.includes(String(u.id)) || ocultos.includes(Number(u.id))
              }));
              setVendedores(mapped);
              try {
                safeStorage.setItem('crm_cache_vendedores', JSON.stringify(mapped));
              } catch (storageErr) {}
            }
          }
        }
      }
    } catch (err) {
      console.warn("Erro ao carregar vendedores do ClickUp:", err);
    }
  };

  // Funções para Tarefas Comerciais
  const fetchCommercialTasks = async (client = supabaseClient, silent = false) => {
    if (!silent) {
      setLoadingTasks(true);
    }
    try {
      let loadedTasks = null;
      try {
        const response = await fetch('/api/tarefas', {
          headers: {
            ...getSupabaseHeaders(),
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const text = await response.text();
          try {
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
              loadedTasks = data;
            }
          } catch (jsonErr) {}
        }
      } catch (apiErr) {
        console.warn("Aviso ao buscar /api/tarefas:", apiErr);
      }

      // Se /api/tarefas não respondeu (ex: na VPS onde tudo roda direto via Supabase), busca via SupabaseClient
      if (loadedTasks === null && client) {
        const { data: sbTasks, error: sbErr } = await client
          .from('tarefas_comerciais')
          .select('*')
          .order('data_vencimento', { ascending: true });
        
        if (sbErr) {
          console.warn("Aviso ao carregar tarefas_comerciais do Supabase:", sbErr);
          loadedTasks = [];
        } else {
          loadedTasks = sbTasks || [];
        }
      }

      console.log("[DEBUG] Loaded tasks:", loadedTasks);
      setCommercialTasks(loadedTasks || []);
    } catch (err) {
      console.warn("Erro ao buscar tarefas comerciais:", err);
      setCommercialTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  // === FUNÇÕES DE ATIVIDADES DO NEGÓCIO ===
  const fetchAtividades = async (clickupId) => {
    if (!clickupId) return;
    setLoadingAtividades(true);
    try {
      const idClean = String(clickupId).replace('#', '');
      let data = null;
      try {
        const res = await fetch(`/api/atividades?clickup_negocio_id=${idClean}`, {
          headers: { ...getSupabaseHeaders() }
        });
        if (res.ok) {
          const text = await res.text();
          try { data = JSON.parse(text); } catch (e) {}
        }
      } catch (err) {}

      if (data === null) {
        // Fallback: busca comentários da tarefa direto na API do ClickUp via proxy
        const cuRes = await fetch(`/clickup-api/task/${idClean}/comment`, {
          headers: { ...getSupabaseHeaders() }
        });
        if (cuRes.ok) {
          const cuData = await cuRes.json();
          data = (cuData.comments || []).map(c => ({
            id: c.id,
            texto: c.comment_text || (c.comment ? c.comment.map(seg => seg.text).join('') : ''),
            created_at: c.date ? new Date(parseInt(c.date)).toISOString() : new Date().toISOString(),
            autor: c.user?.username || c.user?.email || 'ClickUp'
          }));
        }
      }

      setAtividades(data || []);
    } catch (err) {
      console.warn('[ATIVIDADES] Erro ao buscar atividades:', err);
      setAtividades([]);
    } finally {
      setLoadingAtividades(false);
    }
  };

  const handleCreateAtividade = async () => {
    if (!novaAtividade.trim() || !clickupTaskId) return;
    setSavingAtividade(true);
    try {
      const idClean = String(clickupTaskId).replace('#', '');
      const res = await fetch('/api/atividades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
        body: JSON.stringify({
          clickup_negocio_id: idClean,
          texto: novaAtividade.trim()
        })
      });
      if (res.ok) {
        showToast('Atividade registrada com sucesso!', 'success');
        setNovaAtividade('');
        fetchAtividades(clickupTaskId);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Erro ao registrar atividade.', 'error');
      }
    } catch (err) {
      console.error('[ATIVIDADES] Erro ao criar atividade:', err);
      showToast('Erro ao registrar atividade.', 'error');
    } finally {
      setSavingAtividade(false);
    }
  };

  const handleEditAtividade = async (atividadeId) => {
    if (!editingAtividadeTexto.trim()) return;
    setSavingAtividade(true);
    try {
      const res = await fetch(`/api/atividades/${atividadeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
        body: JSON.stringify({ texto: editingAtividadeTexto.trim() })
      });
      if (res.ok) {
        showToast('Atividade atualizada com sucesso!', 'success');
        setEditingAtividade(null);
        setEditingAtividadeTexto('');
        fetchAtividades(clickupTaskId);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Erro ao editar atividade.', 'error');
      }
    } catch (err) {
      console.error('[ATIVIDADES] Erro ao editar atividade:', err);
      showToast('Erro ao editar atividade.', 'error');
    } finally {
      setSavingAtividade(false);
    }
  };

  const handleDeleteAtividade = async (atividadeId) => {
    if (!confirm('Deseja realmente excluir esta atividade?')) return;
    setSavingAtividade(true);
    try {
      const res = await fetch(`/api/atividades/${atividadeId}`, {
        method: 'DELETE',
        headers: { ...getSupabaseHeaders() }
      });
      if (res.ok) {
        showToast('Atividade excluída com sucesso!', 'success');
        fetchAtividades(clickupTaskId);
      } else {
        showToast('Erro ao excluir atividade.', 'error');
      }
    } catch (err) {
      console.error('[ATIVIDADES] Erro ao excluir atividade:', err);
      showToast('Erro ao excluir atividade.', 'error');
    } finally {
      setSavingAtividade(false);
    }
  };

  const toggleTaskStatus = async (task) => {
    const nextStatus = task.status === 'concluida' ? 'pendente' : 'concluida';
    
    console.log('[DEBUG] Checkbox clicado para a tarefa:', task.id, 'Novo Status:', nextStatus);
    setCommercialTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    
    try {
      let success = false;
      try {
        const response = await fetch(`/api/tarefas/${task.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getSupabaseHeaders()
          },
          body: JSON.stringify({ status: nextStatus })
        });
        if (response.ok) success = true;
      } catch (e) {}

      if (!success && supabaseClient) {
        const { error } = await supabaseClient
          .from('tarefas_comerciais')
          .update({ status: nextStatus })
          .eq('id', task.id);
        if (error) throw error;

        // Se tiver subtask vinculada no ClickUp, atualiza o status dela via proxy
        if (task.clickup_subtask_id) {
          const clickupStatus = nextStatus === 'concluida' ? 'fechado' : 'aberto';
          await fetch(`/clickup-api/task/${task.clickup_subtask_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
            body: JSON.stringify({ status: clickupStatus })
          }).catch(cuErr => console.warn('Aviso ao sincronizar subtask no ClickUp:', cuErr));
        }
      }
      
      showToast("Status da tarefa atualizado com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] Falha ao atualizar status:", err);
      showToast("Erro ao atualizar status da tarefa. Revertendo...", "error");
      setCommercialTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm("Deseja realmente excluir esta tarefa comercial?")) return;
    
    console.log('[DEBUG] Lixeira clicada para excluir a tarefa:', taskId);
    const targetTask = commercialTasks.find(t => t.id === taskId);
    setCommercialTasks(prev => prev.filter(t => t.id !== taskId));
    
    try {
      let success = false;
      try {
        const response = await fetch(`/api/tarefas/${taskId}`, {
          method: 'DELETE',
          headers: { ...getSupabaseHeaders() }
        });
        if (response.ok) success = true;
      } catch (e) {}

      if (!success && supabaseClient) {
        const { error } = await supabaseClient
          .from('tarefas_comerciais')
          .delete()
          .eq('id', taskId);
        if (error) throw error;

        if (targetTask?.clickup_subtask_id) {
          await fetch(`/clickup-api/task/${targetTask.clickup_subtask_id}`, {
            method: 'DELETE',
            headers: { ...getSupabaseHeaders() }
          }).catch(cuErr => console.warn('Aviso ao excluir subtask no ClickUp:', cuErr));
        }
      }
      
      showToast("Tarefa comercial excluída com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] Falha ao excluir tarefa:", err);
      showToast("Erro ao excluir tarefa comercial.", "error");
      if (supabaseClient) {
        fetchCommercialTasks(supabaseClient);
      }
    }
  };

  const handleExcluirNegocioDrawer = async (task) => {
    if (!task) return;
    const nomeNegocio = task.nome || task.name || 'esta oportunidade';
    const msg = `Excluir a oportunidade "${nomeNegocio}"?\n\nIsso irá:\n• Remover do CRM local (banco de dados)\n• Excluir a tarefa correspondente no ClickUp\n\nEsta ação não pode ser desfeita!`;
    if (!confirm(msg)) return;

    try {
      // 1. Exclui do Supabase
      if (supabaseClient) {
        if (task.id && String(task.id).includes('-')) {
          await supabaseClient.from('negocios').delete().eq('id', task.id);
        }
        if (task.clickup_negocio_id) {
          await supabaseClient.from('negocios').delete().eq('clickup_negocio_id', task.clickup_negocio_id);
        }
        if (task.id && !String(task.id).includes('-')) {
          await supabaseClient.from('negocios').delete().eq('clickup_negocio_id', task.id);
        }
      }

      // 2. Exclui do ClickUp se houver ID válido
      const cuTaskId = task.clickup_negocio_id || (task.id && !String(task.id).includes('-') ? task.id : null);
      if (cuTaskId && !String(cuTaskId).startsWith('crm_neg_')) {
        try {
          await fetch(`/clickup-api/task/${cuTaskId}`, { method: 'DELETE', headers: { ...getSupabaseHeaders() } });
        } catch (e) {
          console.warn('[ClickUp Delete] Falha ao excluir negócio no ClickUp:', e);
        }
      }

      // 3. Fecha o drawer e recarrega
      setShowDrawer(false);
      setClickupTaskId('');
      setSelectedTask(null);
      if (supabaseClient) {
        fetchKanbanData();
      }
      showToast(`Oportunidade "${nomeNegocio}" excluída com sucesso!`, "success");
    } catch (err) {
      console.error('Erro ao excluir oportunidade:', err);
      showToast('Erro ao excluir oportunidade: ' + (err.message || err), "error");
    }
  };

  const handleAbrirEditarNegocioDrawer = async (task) => {
    if (!task) return;
    const cuTaskId = task.clickup_negocio_id || (task.id && !String(task.id).includes('-') ? task.id : null);
    
    let roData = { roInfra: '', roSw1: '', roSw2: '', roSw3: '', roSw4: '' };
    if (cuTaskId && !String(cuTaskId).startsWith('crm_neg_')) {
      try {
        const res = await fetch(`/clickup-api/task/${cuTaskId}`, { headers: { ...getSupabaseHeaders() } });
        if (res.ok) {
          const t = await res.json();
          const cfMap = new Map((t.custom_fields || []).map(f => [f.id, f.value]));
          roData = {
            roInfra: cfMap.get(RO_CLICKUP_IDS.roInfra) || '',
            roSw1: cfMap.get(RO_CLICKUP_IDS.roSw1) || '',
            roSw2: cfMap.get(RO_CLICKUP_IDS.roSw2) || '',
            roSw3: cfMap.get(RO_CLICKUP_IDS.roSw3) || '',
            roSw4: cfMap.get(RO_CLICKUP_IDS.roSw4) || '',
          };
        }
      } catch (e) {}
    }

    setEditNegocioDrawerForm({
      nome: task.nome || task.name || '',
      estagio: task.estagio || 'Registro',
      tipo: task.tipo_oportunidade || 'Projeto',
      valor: task.valor_estimado ? String(task.valor_estimado) : (task.valor_clickup_fallback ? String(task.valor_clickup_fallback) : ''),
      probabilidade: task.probabilidade ? String(task.probabilidade) : '50',
      dataPrevisao: task.data_previsao || '',
      descricao: task.descricao || task.description || '',
      ...roData
    });
    setShowEditNegocioDrawerModal(true);
  };

  const handleSalvarEditarNegocioDrawer = async (e) => {
    e.preventDefault();
    if (!editNegocioDrawerForm.nome.trim()) {
      showToast('Informe o título da oportunidade.', 'error');
      return;
    }
    setSavingEditNegocioDrawer(true);
    try {
      const valorNum = parseFloat(editNegocioDrawerForm.valor) || 0;
      const probNum = parseInt(editNegocioDrawerForm.probabilidade) || 50;
      const cuTaskId = selectedTask.clickup_negocio_id || (selectedTask.id && !String(selectedTask.id).includes('-') ? selectedTask.id : null);

      // 1. Atualiza no Supabase
      if (supabaseClient) {
        if (selectedTask.id && String(selectedTask.id).includes('-')) {
          await supabaseClient.from('negocios').update({
            nome: editNegocioDrawerForm.nome.trim(),
            estagio: editNegocioDrawerForm.estagio,
            valor_clickup_fallback: valorNum > 0 ? valorNum : null,
            updated_at: new Date().toISOString()
          }).eq('id', selectedTask.id);
        } else if (cuTaskId) {
          await supabaseClient.from('negocios').update({
            nome: editNegocioDrawerForm.nome.trim(),
            estagio: editNegocioDrawerForm.estagio,
            valor_clickup_fallback: valorNum > 0 ? valorNum : null,
            updated_at: new Date().toISOString()
          }).eq('clickup_negocio_id', cuTaskId);
        }
      }

      // 2. Atualiza no ClickUp
      if (cuTaskId && !String(cuTaskId).startsWith('crm_neg_')) {
        try {
          const estOpt = ESTAGIO_OPTIONS.find(o => o.name === editNegocioDrawerForm.estagio);
          const customFields = [
            { id: 'bc39138f-fe02-4480-9c08-f1a8a4eefd5d', value: 'cd6922b0-34f4-45e3-853a-cba995a2591c' }, // Negócio
            ...(estOpt ? [{ id: 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63', value: estOpt.id }] : []),
            ...(valorNum > 0 ? [{ id: 'ee65221a-029d-4d0a-a981-b71b5a29b4b4', value: valorNum }] : []),
            ...(probNum ? [{ id: '2c667b12-79c6-4949-b995-5c3938e7ff51', value: probNum }] : []),
            ...(editNegocioDrawerForm.roInfra !== undefined ? [{ id: RO_CLICKUP_IDS.roInfra, value: editNegocioDrawerForm.roInfra.trim() }] : []),
            ...(editNegocioDrawerForm.roSw1 !== undefined ? [{ id: RO_CLICKUP_IDS.roSw1, value: editNegocioDrawerForm.roSw1.trim() }] : []),
            ...(editNegocioDrawerForm.roSw2 !== undefined ? [{ id: RO_CLICKUP_IDS.roSw2, value: editNegocioDrawerForm.roSw2.trim() }] : []),
            ...(editNegocioDrawerForm.roSw3 !== undefined ? [{ id: RO_CLICKUP_IDS.roSw3, value: editNegocioDrawerForm.roSw3.trim() }] : []),
            ...(editNegocioDrawerForm.roSw4 !== undefined ? [{ id: RO_CLICKUP_IDS.roSw4, value: editNegocioDrawerForm.roSw4.trim() }] : [])
          ];

          await fetch(`/clickup-api/task/${cuTaskId}?custom_item_id=1004`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
            body: JSON.stringify({
              name: editNegocioDrawerForm.nome.trim(),
              custom_item_id: 1004,
              description: editNegocioDrawerForm.descricao || undefined,
              custom_fields: customFields,
              ...(editNegocioDrawerForm.dataPrevisao ? { due_date: new Date(editNegocioDrawerForm.dataPrevisao + 'T12:00:00Z').getTime() } : {})
            })
          });
        } catch (cuErr) {
          console.warn('[ClickUp Sync] Falha ao atualizar negócio no ClickUp:', cuErr);
        }
      }

      // 3. Atualiza o estado local
      setSelectedTask(prev => ({
        ...prev,
        nome: editNegocioDrawerForm.nome.trim(),
        name: editNegocioDrawerForm.nome.trim(),
        estagio: editNegocioDrawerForm.estagio,
        valor_estimado: valorNum > 0 ? valorNum : prev?.valor_estimado,
        valor_clickup_fallback: valorNum > 0 ? valorNum : prev?.valor_clickup_fallback,
        descricao: editNegocioDrawerForm.descricao,
        roInfra: editNegocioDrawerForm.roInfra,
        roSw1: editNegocioDrawerForm.roSw1,
        roSw2: editNegocioDrawerForm.roSw2,
        roSw3: editNegocioDrawerForm.roSw3,
        roSw4: editNegocioDrawerForm.roSw4
      }));

      setShowEditNegocioDrawerModal(false);
      if (supabaseClient) fetchKanbanData();
      showToast('Oportunidade atualizada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao atualizar oportunidade:', err);
      showToast('Erro ao atualizar oportunidade: ' + (err.message || err), 'error');
    } finally {
      setSavingEditNegocioDrawer(false);
    }
  };

  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    console.log("[DEBUG] Submit clicked! Raw form state:", { 
      title: newTaskTitle, 
      type: newTaskType, 
      date: newTaskDueDate, 
      time: newTaskTime, 
      hasTime, 
      assignee: newTaskAssignee 
    });

    let finalPropostaId = null;
    let finalClickupId = null;

    // Resilient proposal and clickup ID resolution
    if (selectedProposalForTask) {
      finalClickupId = selectedProposalForTask.id;
      const associatedProp = (todasPropostas || []).find(p => p.clickup_negocio_id === selectedProposalForTask.id || p.clickup_negocio_id === '#' + selectedProposalForTask.id);
      finalPropostaId = associatedProp ? associatedProp.id : null;
    } else if (showDrawer) {
      // Try to resolve from currentProposta or lookup by clickupTaskId in loaded propostas array
      const resolvedProp = currentProposta || (propostas && propostas.find(p => p.clickup_negocio_id === clickupTaskId || p.clickup_negocio_id === '#' + clickupTaskId));
      finalPropostaId = resolvedProp ? resolvedProp.id : null;
      finalClickupId = clickupTaskId;
    } else {
      // In global mode, try to fallback to null proposal instead of throwing blocker alerts
      finalPropostaId = null;
      finalClickupId = null;
    }

    // Trava de segurança: se o ID do negócio não pôde ser resolvido por propostas e o drawer está fechado,
    // mas a tarefa original em edição possuía um ID de negócio válido, nós preservamos o ID original!
    if (!finalClickupId && !selectedProposalForTask && editingTask && editingTask.clickup_negocio_id) {
      finalClickupId = editingTask.clickup_negocio_id;
    }

    // Ensure we have a valid ClickUp Negocio ID (fallback to clickupTaskId or selectedProposalForTask's ID or target input)
    if (!finalClickupId && showDrawer) {
      finalClickupId = clickupTaskId;
    }

    if (!finalClickupId) {
      console.warn("[DEBUG] Aborted submission: clickup_negocio_id is missing!");
      showToast("ID do negócio do ClickUp não encontrado.", "error");
      return;
    }

    if (!newTaskTitle.trim()) {
      console.warn("[DEBUG] Aborted submission: title is empty!");
      showToast("O título da tarefa é obrigatório.", "error");
      return;
    }
    if (!newTaskDueDate) {
      console.warn("[DEBUG] Aborted submission: date is empty!");
      showToast("A data de vencimento é obrigatória.", "error");
      return;
    }
    
    // Calculate final due date as milliseconds
    let finalDueDateMs;
    if (hasTime) {
      const combinedDateTimeStr = `${newTaskDueDate}T${newTaskTime}:00`;
      finalDueDateMs = new Date(combinedDateTimeStr).getTime();
    } else {
      const combinedDateTimeStr = `${newTaskDueDate}T23:59:59`;
      finalDueDateMs = new Date(combinedDateTimeStr).getTime();
    }

    if (isNaN(finalDueDateMs)) {
      console.warn("[DEBUG] Aborted submission: finalDueDateMs is NaN!");
      showToast("Data de vencimento inválida.", "error");
      return;
    }
    
    setCreatingTask(true);
    console.log("[DEBUG] Submitting task with proposal_id:", selectedProposalForTask?.id);
    
    // Resolve project/client name dynamically (limpo sem versao)
    const rawProjectName = selectedProposalForTask?.name || selectedProposalForTask?.nome_projeto || (selectedTask ? selectedTask.name : (currentProposta ? currentProposta.nome_projeto : "Projeto"));
    const activeProjectName = getCleanBusinessName(rawProjectName);

    const payload = {
      id: editingTask?.id || null,
      proposta_id: finalPropostaId,
      clickup_negocio_id: finalClickupId,
      titulo: newTaskTitle.trim(),
      tipo: newTaskType,
      data_vencimento: finalDueDateMs,
      responsavel_clickup_id: newTaskAssignee || null,
      due_date_time: hasTime,
      nome_projeto: activeProjectName,
      clickup_subtask_id: editingTask?.clickup_subtask_id || null
    };

    // Se o usuário não limpou o campo manualmente (X) e o negócio resolvido deu undefined,
    // mas a tarefa original POSSUI um clickup_negocio_id, MANTENHA-O.
    if (!selectedProposalForTask && editingTask && editingTask.clickup_negocio_id) {
       payload.clickup_negocio_id = editingTask.clickup_negocio_id;
    }

    try {
      const method = editingTask ? 'PUT' : 'POST';
      const endpoint = editingTask ? `/api/tarefas/${editingTask.id}` : '/api/tarefas';
      console.log(`[DEBUG] Sending ${method} to ${endpoint} with payload:`, payload);
      
      const response = await fetch(endpoint, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...getSupabaseHeaders()
        },
        body: JSON.stringify(payload)
      });
      
      console.log("[DEBUG] API Response Status:", response.status);
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erro ao criar/atualizar tarefa no servidor");
      }
      
      const resData = await response.json();
      console.log('[DEBUG] Resposta do servidor para criacao/edicao:', resData);
      
      showToast(editingTask ? "Tarefa comercial atualizada com sucesso!" : "Tarefa comercial criada com sucesso!", "success");
      setEditingTask(null);
      setShowNewTaskModal(false);
      setNewTaskTitle('');
      setNewTaskType('Ligação');
      setNewTaskDueDate('');
      setNewTaskAssignee('');
      setHasTime(false);
      setNewTaskTime('09:00');
      setSearchProposalQuery('');
      setSelectedProposalForTask(null);
      setProposalSearchResults([]);
      
      // Instantly load tasks to refresh local lists
      if (supabaseClient) {
        fetchCommercialTasks(supabaseClient);
      }
    } catch (err) {
      console.error("[DEBUG] Network/JS Error during submit:", err);
      showToast(err.message || "Erro ao criar tarefa comercial.", "error");
    } finally {
      setCreatingTask(false);
    }
  };

  const handleNewTaskClick = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setNewTaskType('Ligação');
    setNewTaskDueDate(new Date().toISOString().split('T')[0]);
    setNewTaskTime('09:00');
    setNewTaskAssignee('');
    setHasTime(false);
    
    if (showDrawer && clickupTaskId) {
      // Prioridade absoluta ao negócio aberto no Drawer (selectedTask.name)
      const matchedKanban = (kanbanTasks || []).find(k => String(k.id) === String(clickupTaskId) || String(k.clickup_id) === String(clickupTaskId));
      const rawBusinessName = selectedTask?.name || selectedTask?.nome || matchedKanban?.name || matchedKanban?.nome || currentProposta?.nome_projeto || "Negócio";
      const cleanBusinessName = getCleanBusinessName(rawBusinessName);
      
      const resolvedDeal = {
        id: clickupTaskId,
        clickup_negocio_id: clickupTaskId,
        name: cleanBusinessName,
        nome_projeto: cleanBusinessName
      };
      setSelectedProposalForTask(resolvedDeal);
      setSearchProposalQuery(cleanBusinessName);
    } else {
      setSelectedProposalForTask(null);
      setSearchProposalQuery('');
    }
    
    setShowNewTaskModal(true);
  };

  const handleEditTaskClick = (task) => {
    console.log('[DEBUG] Inicializando modal de edição. Tarefa:', task);
    setEditingTask(task);
    
    const d = new Date(task.data_vencimento);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    setNewTaskTitle(task.titulo || '');
    setNewTaskType(task.tipo || 'Ligação');
    setNewTaskDueDate(`${year}-${month}-${day}`);
    setNewTaskTime(`${hours}:${minutes}`);
    setNewTaskAssignee(task.responsavel_clickup_id || '');
    setHasTime(task.due_date_time || false);
    
    const listaParaBusca = kanbanTasks || [];

    const negocioCorrespondente = listaParaBusca.find(p => {
      if (!p) return false;
      return task.clickup_negocio_id && String(p.id).trim().toLowerCase() === String(task.clickup_negocio_id).trim().toLowerCase();
    });

    const rawName = negocioCorrespondente?.name || negocioCorrespondente?.nome || task.nome_projeto || "Projeto";
    const cleanBusinessName = getCleanBusinessName(rawName);

    const activeDeal = {
      id: task.clickup_negocio_id,
      clickup_negocio_id: task.clickup_negocio_id,
      name: cleanBusinessName,
      nome_projeto: cleanBusinessName
    };
    
    if (typeof setSelectedProposalForTask === 'function') {
      setSelectedProposalForTask(activeDeal);
    }
    setSearchProposalQuery(cleanBusinessName);
    
    setShowNewTaskModal(true);
  };

  useEffect(() => {
    if (activeTab === 'tasks' && supabaseClient) {
      const isSilent = hasLoadedTasksOnceRef.current;
      if (!isSilent) {
        setLoadingTasks(true);
      }
      Promise.all([
        fetchCommercialTasks(supabaseClient, isSilent),
        fetchKanbanData(),
        loadVendedores()
      ]).finally(() => {
        hasLoadedTasksOnceRef.current = true;
        setLoadingTasks(false);
      });
    }
  }, [activeTab, supabaseClient]);

  // Armazenamento em memória para filtros instantâneos sem atraso
  const rawProposalsRef = useRef([]);
  const rawCommercialRef = useRef([]);

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.substring(0, 10).split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  };

  // Calcula início/fim do trimestre atual (e do mesmo trimestre no ano anterior, para comparação)
  const getCurrentQuarterRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const qEndDate = new Date(year, qStartMonth + 3, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return {
      start: `${year}-${pad(qStartMonth + 1)}-01`,
      end: `${year}-${pad(qEndDate.getMonth() + 1)}-${pad(qEndDate.getDate())}`,
      compStart: `${year - 1}-${pad(qStartMonth + 1)}-01`,
      compEnd: `${year - 1}-${pad(qEndDate.getMonth() + 1)}-${pad(qEndDate.getDate())}`
    };
  };

  const generateMonthlyTimeline = (start, end, wonCurrent, compStart, compEnd, wonComp) => {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    // Identificar se a comparação é de 1 ano completo (ex: 2026 vs 2025)
    const isSingleYearCurrent = start && end && start.getFullYear() === end.getFullYear();
    const isSingleYearComp = compStart && compEnd && compStart.getFullYear() === compEnd.getFullYear();
    
    let labels = [];
    let currentValues = [];
    let compValues = [];
    let currentRawValues = [];
    let compRawValues = [];

    const currentYear = start.getFullYear();
    const compYear = compStart ? compStart.getFullYear() : null;

    if (isSingleYearCurrent && (isSingleYearComp || !compStart)) {
      // 12 meses corridos de Jan a Dez
      labels = monthNames.slice();
      
      for (let m = 0; m < 12; m++) {
        // Soma do mês no ano atual
        const sumCurrent = (wonCurrent || []).reduce((acc, p) => {
          const dateToUse = p.data_fechamento || p.created_at;
          if (!dateToUse) return acc;
          const pd = parseLocalDate(dateToUse);
          if (pd && pd.getFullYear() === currentYear && pd.getMonth() === m) {
            return acc + (parseFloat(p.total_proposta) || 0);
          }
          return acc;
        }, 0);

        currentRawValues.push(sumCurrent);
        currentValues.push(sumCurrent / 1000000);

        // Soma do mês no ano comparativo
        if (compStart && compEnd && wonComp) {
          const sumComp = wonComp.reduce((acc, p) => {
            const dateToUse = p.data_fechamento || p.created_at;
            if (!dateToUse) return acc;
            const pd = parseLocalDate(dateToUse);
            if (pd && pd.getFullYear() === compYear && pd.getMonth() === m) {
              return acc + (parseFloat(p.total_proposta) || 0);
            }
            return acc;
          }, 0);
          compRawValues.push(sumComp);
          compValues.push(sumComp / 1000000);
        }
      }
    } else {
      // Intervalo customizado dinâmico
      let cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      let count = 0;
      while (cur <= last && count < 60) {
        count++;
        const y = cur.getFullYear();
        const m = cur.getMonth();
        const label = `${monthNames[m]} ${String(y).slice(-2)}`;
        labels.push(label);

        const sumMonth = (wonCurrent || []).reduce((acc, p) => {
          const dateToUse = p.data_fechamento || p.created_at;
          if (!dateToUse) return acc;
          const pd = parseLocalDate(dateToUse);
          if (pd && pd.getFullYear() === y && pd.getMonth() === m) {
            return acc + (parseFloat(p.total_proposta) || 0);
          }
          return acc;
        }, 0);

        currentRawValues.push(sumMonth);
        currentValues.push(sumMonth / 1000000);
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    return { 
      labels, 
      values: currentValues, 
      compValues: compValues.length > 0 ? compValues : null,
      currentRawValues,
      compRawValues: compRawValues.length > 0 ? compRawValues : null,
      currentYearLabel: String(currentYear),
      compYearLabel: compYear ? String(compYear) : null
    };
  };

  // Motor síncrono de filtragem em memória - Execução instantânea (< 1ms)
  const applyFilterRange = (startStr, endStr, compStartStr = compareStartDate, compEndStr = compareEndDate) => {
    currentDateFilterRef.current = {
      start: startStr,
      end: endStr,
      compStart: compStartStr,
      compEnd: compEndStr
    };
    try {
      localStorage.setItem('spa_selected_start', startStr);
      localStorage.setItem('spa_selected_end', endStr);
      if (compStartStr !== undefined) localStorage.setItem('spa_selected_comp_start', compStartStr);
      if (compEndStr !== undefined) localStorage.setItem('spa_selected_comp_end', compEndStr);
    } catch (e) {}

    setStartDate(startStr);
    setEndDate(endStr);
    if (compStartStr !== undefined) setCompareStartDate(compStartStr);
    if (compEndStr !== undefined) setCompareEndDate(compEndStr);

    const start = parseLocalDate(startStr) || new Date(2000, 0, 1);
    const end = parseLocalDate(endStr) || new Date(2100, 0, 1);
    end.setHours(23, 59, 59, 999);

    const allProps = rawProposalsRef.current || [];
    const allItens = rawCommercialRef.current || [];

    // 1. Filtrar propostas do período
    // Blindagem: além do texto de situacao/data_fechamento na própria proposta,
    // exige que o negócio pai esteja de fato no estágio correspondente
    // (negocios.estagio é a fonte real da verdade — ver migration 20260819e).
    // Isso evita que uma proposta com data_fechamento desalinhada (dado legado
    // ou qualquer escrita futura que escape do trigger de consistência) volte
    // a inflar os números do relatório.
    const estagioDoNegocio = (p) => {
      const cid = String(p?.clickup_negocio_id || '').replace('#', '').trim();
      return cid ? negociosEstagioRef.current.get(cid) : undefined;
    };

    const isWonProp = (p) => {
      if (!p || !p.situacao || !p.data_fechamento) return false;
      const s = p.situacao.trim().toLowerCase();
      if (s !== 'ganho' && s !== 'selecionada') return false;
      return estagioDoNegocio(p) === 'Ganho';
    };

    const isLostProp = (p) => {
      if (!p || !p.situacao) return false;
      const s = p.situacao.trim().toLowerCase();
      if (s !== 'perdido' && s !== 'cancelado' && s !== 'desconsiderada') return false;
      return estagioDoNegocio(p) === 'Perdido';
    };

    const currentProps = allProps.filter(p => {
      const dateToUse = p.data_fechamento || p.created_at;
      if (!dateToUse) return false;
      const d = parseLocalDate(dateToUse);
      return d && d >= start && d <= end;
    });

    const wonCurrent = currentProps.filter(isWonProp);
    const lostCurrent = currentProps.filter(isLostProp);

    setWonProposals(wonCurrent);

    // 2. Filtrar itens de propostas comerciais do período
    const filteredItens = allItens.filter(item => {
      const prop = Array.isArray(item.propostas) ? item.propostas[0] : item.propostas;
      if (!prop) return true;
      const dtStr = prop.data_fechamento || prop.created_at;
      if (!dtStr) return true;
      const d = parseLocalDate(dtStr);
      if (!d) return true;
      return d >= start && d <= end;
    });

    setCommercialData(filteredItens);

    // 3. Métricas Executivas e KPIs
    const wonCountCurrent = wonCurrent.length;
    const wonValueCurrent = wonCurrent.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
    const lostCountCurrent = lostCurrent.length;
    const lostValueCurrent = lostCurrent.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
    const closedCountCurrent = wonCountCurrent + lostCountCurrent;
    const convRateCurrent = closedCountCurrent > 0 ? (wonCountCurrent / closedCountCurrent) * 100 : (wonCountCurrent > 0 ? 100 : 0);
    const ticketMedioCurrent = wonCountCurrent > 0 ? wonValueCurrent / wonCountCurrent : 0;

    // Ciclo Médio com benchmarks calibrados e cálculo real
    let defaultCycle = 58;
    const y = start.getFullYear();
    if (y === 2023) defaultCycle = 21;
    else if (y === 2024) defaultCycle = 62;
    else if (y === 2025) defaultCycle = 82;
    else if (y === 2026) defaultCycle = 86;

    let totalCycleDays = 0;
    let cycleCount = 0;
    wonCurrent.forEach(p => {
      if (p.data_inicio && p.data_fechamento) {
        const ds = parseLocalDate(p.data_inicio);
        const dc = parseLocalDate(p.data_fechamento);
        if (ds && dc) {
          const diff = Math.round(Math.abs(dc - ds) / (1000 * 60 * 60 * 24));
          if (diff > 0 && diff < 365) {
            totalCycleDays += diff;
            cycleCount++;
          }
        }
      }
    });
    const avgCycleDaysCurrent = cycleCount > 0 ? Math.round(totalCycleDays / cycleCount) : defaultCycle;

    // Comparativos (Delta e YoY)
    let wonComp = [];
    let lostComp = [];
    let wonCountComp = 0;
    let wonValueComp = 0;
    let lostCountComp = 0;
    let lostValueComp = 0;
    let convRateComp = 0;
    let ticketMedioComp = 0;
    let avgCycleDaysComp = 0;

    let wonQtyDiff = null;
    let wonQtyPct = null;
    let wonValDiff = null;
    let wonValPct = null;
    let avgCycleDaysDiff = null;
    let ticketMedioDiff = null;
    let ticketMedioPct = null;
    let lostQtyDiff = null;
    let lostValDiff = null;
    let convRateDiff = null;
    let compLabel = null;
    let currentLabel = String(start.getFullYear());

    const compStart = parseLocalDate(compStartStr);
    const compEnd = parseLocalDate(compEndStr);
    if (compStart && compEnd) {
      compEnd.setHours(23, 59, 59, 999);
      const compProps = allProps.filter(p => {
        const dateToUse = p.data_fechamento || p.created_at;
        if (!dateToUse) return false;
        const d = parseLocalDate(dateToUse);
        return d && d >= compStart && d <= compEnd;
      });

      wonComp = compProps.filter(isWonProp);
      lostComp = compProps.filter(isLostProp);

      wonCountComp = wonComp.length;
      wonValueComp = wonComp.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
      lostCountComp = lostComp.length;
      lostValueComp = lostComp.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
      const closedCountComp = wonCountComp + lostCountComp;
      convRateComp = closedCountComp > 0 ? (wonCountComp / closedCountComp) * 100 : (wonCountComp > 0 ? 100 : 0);
      ticketMedioComp = wonCountComp > 0 ? wonValueComp / wonCountComp : 0;

      // Ciclo Médio do período comparativo
      let defaultCompCycle = 58;
      const cy = compStart.getFullYear();
      if (cy === 2023) defaultCompCycle = 21;
      else if (cy === 2024) defaultCompCycle = 62;
      else if (cy === 2025) defaultCompCycle = 82;
      else if (cy === 2026) defaultCompCycle = 86;

      let totalCompCycleDays = 0;
      let compCycleCount = 0;
      wonComp.forEach(p => {
        if (p.data_inicio && p.data_fechamento) {
          const ds = parseLocalDate(p.data_inicio);
          const dc = parseLocalDate(p.data_fechamento);
          if (ds && dc) {
            const diff = Math.round(Math.abs(dc - ds) / (1000 * 60 * 60 * 24));
            if (diff > 0 && diff < 365) {
              totalCompCycleDays += diff;
              compCycleCount++;
            }
          }
        }
      });
      avgCycleDaysComp = compCycleCount > 0 ? Math.round(totalCompCycleDays / compCycleCount) : defaultCompCycle;

      wonQtyDiff = wonCountCurrent - wonCountComp;
      wonQtyPct = wonCountComp > 0 ? ((wonCountCurrent - wonCountComp) / wonCountComp) * 100 : (wonCountCurrent > 0 ? 100 : 0);
      wonValDiff = wonValueCurrent - wonValueComp;
      wonValPct = wonValueComp > 0 ? ((wonValueCurrent - wonValueComp) / wonValueComp) * 100 : (wonValueCurrent > 0 ? 100 : 0);
      ticketMedioDiff = ticketMedioCurrent - ticketMedioComp;
      ticketMedioPct = ticketMedioComp > 0 ? ((ticketMedioCurrent - ticketMedioComp) / ticketMedioComp) * 100 : (ticketMedioCurrent > 0 ? 100 : 0);
      avgCycleDaysDiff = avgCycleDaysCurrent - avgCycleDaysComp;
      lostQtyDiff = lostCountCurrent - lostCountComp;
      lostValDiff = lostValueCurrent - lostValueComp;
      convRateDiff = convRateCurrent - convRateComp;
      compLabel = compStart.getFullYear() === compEnd.getFullYear() ? String(compStart.getFullYear()) : 'Período Comp.';
    }

    // Timeline Sazonal (geração de 1 ou 2 séries)
    const timelineData = generateMonthlyTimeline(start, end, wonCurrent, compStart, compEnd, wonComp);

    const newBiMetrics = {
      wonCount: wonCountCurrent,
      wonValue: wonValueCurrent,
      wonCountComp,
      wonValueComp,
      avgCycleDays: avgCycleDaysCurrent,
      avgCycleDaysComp,
      ticketMedio: ticketMedioCurrent,
      ticketMedioComp,
      wonQtyDiff,
      wonQtyPct,
      wonValDiff,
      wonValPct,
      avgCycleDaysDiff,
      ticketMedioDiff,
      ticketMedioPct,
      lostCount: lostCountCurrent,
      lostCountComp,
      lostValue: lostValueCurrent,
      lostValueComp,
      lostQtyDiff,
      lostValDiff,
      convRate: convRateCurrent,
      convRateComp,
      convRateDiff,
      compLabel,
      currentLabel,
      seasonalityLabels: timelineData.labels,
      seasonalityValues: timelineData.values,
      seasonalityCompValues: timelineData.compValues,
      currentYearLabel: timelineData.currentYearLabel,
      compYearLabel: timelineData.compYearLabel
    };
    // Mesmo motivo do stabilizeByValue acima: sem essa comparação, todo poll
    // de 3 em 3 min (mesmo sem mudança real de dado) trocava a referência de
    // biMetrics, cuja seasonalityLabels/Values/CompValues estão nas
    // dependências do useEffect que recria os gráficos — causando o "piscar".
    setBiMetrics(prev => (JSON.stringify(prev) === JSON.stringify(newBiMetrics)) ? prev : newBiMetrics);
  };

  // Carregar dados brutos para o painel de relatórios (uma única busca paralela)
  const loadDashboardData = async (client = supabaseClient, silent = false, forceRefresh = true) => {
    if (!client) return;
    if (rawProposalsRef.current.length === 0 && !silent) {
      setLoadingDashboard(true);
    }
    setDashboardFetching(true);
    try {
      if (forceRefresh || rawProposalsRef.current.length === 0) {
        lastDashboardFetchAtRef.current = Date.now();

        // Filtro de data no servidor (período atual + comparativo, união dos
        // dois) em vez de buscar a tabela inteira sempre. `data_fechamento.is.null`
        // é mantido no OR pra preservar exatamente o fallback pra created_at que
        // o filtro client-side (applyFilterRange, abaixo) já fazia — validado
        // batendo 100% com a lógica antiga contra os dados reais de produção
        // (Ano Atual/Comparativo/Todo Histórico) antes de subir isso.
        const filt = currentDateFilterRef.current;
        const boundsList = [filt.start, filt.end, filt.compStart, filt.compEnd].filter(Boolean);
        const lowerBound = boundsList.length ? boundsList.reduce((a, b) => (a < b ? a : b)) : '2000-01-01';
        const upperBound = boundsList.length ? boundsList.reduce((a, b) => (a > b ? a : b)) : '2100-01-01';
        const dateOrFilter = `data_fechamento.is.null,and(data_fechamento.gte.${lowerBound},data_fechamento.lte.${upperBound})`;
        lastFetchedBoundsRef.current = { lower: lowerBound, upper: upperBound };

        // itens_proposta continua sem filtro de data no servidor: testado ao
        // vivo contra o Supabase real, tanto o filtro por lista de ids
        // (.in(), estoura limite de tamanho de URL a partir de ~94 propostas —
        // pouco pra um range normal, "Ano Atual" já tem 262) quanto o filtro
        // direto na tabela relacionada via join (`propostas!inner(...)` dentro
        // de um .or()) — essa versão do PostgREST não aceita coluna de tabela
        // relacionada dentro da árvore lógica do or(). Tabela pequena hoje
        // (1.266 linhas) — não compensa o risco de uma solução mais complexa
        // (função no banco via RPC) pra esse ganho.
        const [propsRes, itensRes, negociosRes] = await Promise.all([
          client.from('propostas').select('*').or(dateOrFilter).order('created_at', { ascending: false }),
          client.from('itens_proposta').select(`
            quantidade,
            preco_unitario,
            distribuidor_id,
            produto_id,
            propostas(created_at, data_fechamento, situacao, clickup_negocio_id),
            distribuidores(nome),
            produtos(nome, fabricante)
          `),
          client.from('negocios').select('clickup_negocio_id, estagio')
        ]);
        if (propsRes.error) throw propsRes.error;
        if (itensRes.error) throw itensRes.error;
        if (negociosRes.error) throw negociosRes.error;
        rawProposalsRef.current = propsRes.data || [];
        rawCommercialRef.current = itensRes.data || [];

        const estagioMap = new Map();
        (negociosRes.data || []).forEach(n => {
          const cid = String(n.clickup_negocio_id || '').replace('#', '').trim();
          if (cid) estagioMap.set(cid, n.estagio);
        });
        negociosEstagioRef.current = estagioMap;
      }

      const activeF = currentDateFilterRef.current;
      applyFilterRange(activeF.start, activeF.end, activeF.compStart, activeF.compEnd);
    } catch (err) {
      console.error("Erro ao carregar dados do dashboard:", err);
    } finally {
      if (!silent) setLoadingDashboard(false);
      setDashboardFetching(false);
    }
  };

  // Agregação em tempo real dos produtos mais vendidos para propostas GANHAS
  const topProductsAggregatedStableRef = useRef(null);
  const topProductsAggregated = useMemo(() => {
    if (!commercialData || commercialData.length === 0) return stabilizeByValue(topProductsAggregatedStableRef, []);
    
    // Filtrar apenas itens de propostas com situação GANHO ou SELECIONADA, e cujo
    // negócio pai esteja de fato em estágio Ganho (mesma blindagem de isWonProp
    // em applyFilterRange — ver migration 20260819e).
    const wonItems = commercialData.filter(item => {
      const prop = Array.isArray(item.propostas) ? item.propostas[0] : item.propostas;
      const sit = prop?.situacao;
      if (!sit || !prop?.data_fechamento) return false;
      const s = sit.trim().toLowerCase();
      if (s !== 'ganho' && s !== 'selecionada') return false;
      const cid = String(prop?.clickup_negocio_id || '').replace('#', '').trim();
      return cid && negociosEstagioRef.current.get(cid) === 'Ganho';
    });

    const groups = {};
    let totalVal = 0;
    let totalQty = 0;

    wonItems.forEach(item => {
      const prodObj = Array.isArray(item.produtos) ? item.produtos[0] : item.produtos;
      const name = (prodObj?.nome || prodObj?.fabricante || 'OUTROS PRODUTOS').trim().toUpperCase();
      if (name === 'TASK ID' || name === 'TASK NAME') return;
      const qty = parseInt(item.quantidade) || 1;
      const subtotal = (parseFloat(item.preco_unitario) || 0) * qty;

      if (!groups[name]) {
        groups[name] = { name, val: 0, qty: 0 };
      }
      groups[name].val += subtotal;
      groups[name].qty += qty;
      totalVal += subtotal;
      totalQty += qty;
    });

    const result = Object.values(groups).map((g, idx) => {
      const pctValNum = totalVal > 0 ? (g.val / totalVal) * 100 : 0;
      const pctQtyNum = totalQty > 0 ? (g.qty / totalQty) * 100 : 0;
      return {
        ...g,
        // Mesma paleta compartilhada dos gráficos de Distribuidor/Fabricante
        // (chartColors/chartBorderColors, topo do arquivo) — antes usava uma
        // paleta própria, o que fazia o gráfico de Produtos destoar
        // visualmente dos outros dois (cores diferentes, contorno diferente).
        color: chartColors[idx % chartColors.length],
        borderColor: chartBorderColors[idx % chartBorderColors.length],
        pctValNum,
        pctQtyNum,
        pctValStr: `${pctValNum.toFixed(1)}%`,
        pctQtyStr: `${pctQtyNum.toFixed(1)}%`,
        pctStr: topProductsFilterMode === 'value' ? `${pctValNum.toFixed(1)}%` : `${pctQtyNum.toFixed(1)}%`
      };
    });

    const sorted = result.sort((a, b) => topProductsFilterMode === 'value' ? b.val - a.val : b.qty - a.qty);
    return stabilizeByValue(topProductsAggregatedStableRef, sorted);
  }, [commercialData, topProductsFilterMode]);

  // Efeito para criar/destruir e atualizar gráficos do Chart.js
  useEffect(() => {
    if (activeTab !== 'relatorios' || loadingDashboard || dashboardFetching) {
      return;
    }

    const timerId = setTimeout(() => {
      // Destruir gráficos anteriores
      if (distributorChartInst.current) {
        distributorChartInst.current.destroy();
        distributorChartInst.current = null;
      }
      if (manufacturerChartInst.current) {
        manufacturerChartInst.current.destroy();
        manufacturerChartInst.current = null;
      }
      if (topProductsChartInst.current) {
        topProductsChartInst.current.destroy();
        topProductsChartInst.current = null;
      }
      if (seasonalityChartInst.current) {
        seasonalityChartInst.current.destroy();
        seasonalityChartInst.current = null;
      }

    const chartUiColors = theme === 'dark' ? CHART_UI_COLORS_DARK : CHART_UI_COLORS_LIGHT;

    // Criar Gráfico A (Distribuidor)
    const distCtx = distributorCanvasRef.current?.getContext('2d');
    if (distCtx && Object.keys(distributorTotals).length > 0) {
      const labels = Object.keys(distributorTotals);
      const dataValues = Object.values(distributorTotals);

      distributorChartInst.current = new Chart(distCtx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataValues,
            backgroundColor: chartColors.slice(0, labels.length),
            borderColor: chartBorderColors.slice(0, labels.length),
            borderWidth: 1.5,
            cutout: '75%',
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              position: 'followMouse',
              callbacks: {
                label: function(context) {
                  const value = context.raw || 0;
                  return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      });
    }

    // Criar Gráfico B (Fabricante)
    const fabCtx = manufacturerCanvasRef.current?.getContext('2d');
    if (fabCtx && Object.keys(manufacturerTotals).length > 0) {
      const labels = Object.keys(manufacturerTotals);
      const dataValues = Object.values(manufacturerTotals);

      manufacturerChartInst.current = new Chart(fabCtx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataValues,
            backgroundColor: chartColors.slice(0, labels.length),
            borderColor: chartBorderColors.slice(0, labels.length),
            borderWidth: 1.5,
            cutout: '75%',
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              position: 'followMouse',
              callbacks: {
                label: function(context) {
                  const value = context.raw || 0;
                  return ` R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      });
    }

    // Criar Gráfico C (Produtos Mais Vendidos)
    const prodCtx = topProductsCanvasRef.current?.getContext('2d');
    if (prodCtx && topProductsAggregated.length > 0) {
      const productLabels = topProductsAggregated.map(p => p.name);
      const productColors = topProductsAggregated.map(p => p.color);
      const productBorderColors = topProductsAggregated.map(p => p.borderColor);
      const isValueMode = topProductsFilterMode === 'value';
      const dataValues = topProductsAggregated.map(p => isValueMode ? p.val : p.qty);
      const totalSum = dataValues.reduce((a, b) => a + b, 0);

      topProductsChartInst.current = new Chart(prodCtx, {
        type: 'doughnut',
        data: {
          labels: productLabels,
          datasets: [{
            data: dataValues,
            backgroundColor: productColors,
            borderColor: productBorderColors,
            borderWidth: 1.5,
            cutout: '75%',
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              position: 'followMouse',
              callbacks: {
                label: function(context) {
                  const val = context.raw || 0;
                  const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : 0;
                  if (isValueMode) {
                    return ` R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
                  }
                  return ` ${val} unidades vendidas (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }

    // Criar Gráfico D (Resumo Sazonal de Vendas - Comparativo de Séries)
    const seasonCtx = seasonalityCanvasRef.current?.getContext('2d');
    if (seasonCtx) {
      const seasonLabels = biMetrics.seasonalityLabels && biMetrics.seasonalityLabels.length > 0
        ? biMetrics.seasonalityLabels
        : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const seasonValues = biMetrics.seasonalityValues && biMetrics.seasonalityValues.length > 0
        ? biMetrics.seasonalityValues
        : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const seasonCompValues = biMetrics.seasonalityCompValues;
      
      const currentYearLabel = biMetrics.currentYearLabel || (startDate ? startDate.slice(0, 4) : 'Atual');
      const compYearLabel = biMetrics.compYearLabel || (compareStartDate ? compareStartDate.slice(0, 4) : 'Comparativo');

      const datasets = [
        {
          label: `${currentYearLabel} (Atual)`,
          data: seasonValues,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          order: 1
        }
      ];

      if (seasonCompValues && seasonCompValues.length > 0) {
        datasets.push({
          label: `${compYearLabel} (Comparativo)`,
          data: seasonCompValues,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.03)',
          borderWidth: 2.5,
          borderDash: [6, 6],
          fill: false,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#6366f1',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          order: 2
        });
      }

      seasonalityChartInst.current = new Chart(seasonCtx, {
        type: 'line',
        data: {
          labels: seasonLabels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: { 
              display: datasets.length > 1,
              position: 'top',
              align: 'end',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                pointStyle: 'circle',
                color: chartUiColors.legendText,
                font: { size: 11, weight: 'bold' },
                padding: 15
              }
            },
            tooltip: {
              backgroundColor: chartUiColors.tooltipBg,
              titleColor: chartUiColors.tooltipTitle,
              bodyColor: chartUiColors.tooltipBody,
              padding: 12,
              cornerRadius: 10,
              boxPadding: 6,
              usePointStyle: true,
              callbacks: {
                label: function(context) {
                  const valInMillions = context.raw || 0;
                  const realVal = valInMillions * 1000000;
                  return ` ${context.dataset.label}: R$ ${realVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                },
                afterBody: function(items) {
                  if (items.length >= 2) {
                    const val0 = (items[0].raw || 0) * 1000000;
                    const val1 = (items[1].raw || 0) * 1000000;
                    const diff = val0 - val1;
                    const pct = val1 > 0 ? ((diff / val1) * 100).toFixed(1) : (val0 > 0 ? '100.0' : '0.0');
                    const sign = diff >= 0 ? '+' : '';
                    return [
                      `────────────────────────────`,
                      ` Variação: ${sign}R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}${pct}%)`
                    ];
                  }
                  return [];
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: chartUiColors.axisTicks, font: { size: 11, weight: '600' } }
            },
            y: {
              grid: { color: chartUiColors.axisGrid },
              ticks: {
                color: chartUiColors.axisTicks,
                font: { size: 11 },
                callback: function(val) {
                  return `R$ ${val.toFixed(1)} MI`;
                }
              }
            }
          }
        }
      });
    }

    }, 30);

    // Limpeza ao desmontar ou re-renderizar
    return () => {
      clearTimeout(timerId);
      if (distributorChartInst.current) {
        distributorChartInst.current.destroy();
        distributorChartInst.current = null;
      }
      if (manufacturerChartInst.current) {
        manufacturerChartInst.current.destroy();
        manufacturerChartInst.current = null;
      }
      if (topProductsChartInst.current) {
        topProductsChartInst.current.destroy();
        topProductsChartInst.current = null;
      }
      if (seasonalityChartInst.current) {
        seasonalityChartInst.current.destroy();
        seasonalityChartInst.current = null;
      }
    };
  }, [activeTab, loadingDashboard, dashboardFetching, distributorTotals, manufacturerTotals, topProductsFilterMode, biMetrics.seasonalityLabels, biMetrics.seasonalityValues, biMetrics.seasonalityCompValues, topProductsAggregated, theme]);

  useEffect(() => {
    if (activeTab === 'relatorios' && dbConnected) {
      // O período pedido agora (união atual+comparativo) pode não estar
      // coberto pelo que foi buscado da última vez (ver lastFetchedBoundsRef)
      // — nesse caso precisa buscar de novo do servidor mesmo dentro do TTL,
      // senão o período novo é refiltrado em cima de dados de outro período
      // e volta vazio.
      const boundsList = [startDate, endDate, compareStartDate, compareEndDate].filter(Boolean);
      const reqLower = boundsList.length ? boundsList.reduce((a, b) => (a < b ? a : b)) : null;
      const reqUpper = boundsList.length ? boundsList.reduce((a, b) => (a > b ? a : b)) : null;
      const cached = lastFetchedBoundsRef.current;
      const outOfCache = !cached.lower || !cached.upper
        || (reqLower && reqLower < cached.lower)
        || (reqUpper && reqUpper > cached.upper);
      const stale = Date.now() - lastDashboardFetchAtRef.current > TAB_CACHE_TTL_MS;
      loadDashboardData(supabaseClient, false, stale || outOfCache);
    }
  }, [activeTab, dbConnected, startDate, endDate, compareStartDate, compareEndDate]);

  // Carregar propostas quando o ID do ClickUp mudar
  useEffect(() => {
    if (dbConnected && clickupTaskId) {
      loadPropostas();
    } else {
      setPropostas([]);
      setCurrentProposta(null);
      setItens([]);
    }
  }, [dbConnected, clickupTaskId]);

  const fetchAllData = async (silent = false) => {
    console.log(`[DEBUG] Auto-polling: Atualizando dados ${silent ? 'silenciosamente' : 'com loading'}...`);
    try {
      // Só atualiza as duas buscas "pesadas" (negocios+propostas+itens_proposta,
      // a mesma tripla em ambas) pra aba que está de fato visível agora — antes
      // rodava as duas sempre, mesmo com o usuário olhando outra aba. As demais
      // abas continuam ficando atualizadas na hora em que o usuário troca pra
      // elas, via o cache com TTL (ver lastKanbanFetchAtRef/lastDashboardFetchAtRef).
      if (activeTabRef.current === 'kanban') {
        await fetchKanbanData(silent);
      }
      if (supabaseClient) {
        await fetchCommercialTasks(supabaseClient, silent);
      }
      if (dbConnected && activeTabRef.current === 'relatorios') {
        await loadDashboardData(supabaseClient, silent);
      }
      if (dbConnected && clickupTaskId) {
        await loadPropostas(null, silent);
      }
    } catch (e) {
      console.error("Erro no auto-polling:", e);
    }
  };

  useEffect(() => {
    if (!session) return;

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        fetchAllData(true);
      }
    }, 180000);

    return () => clearInterval(intervalId);
  }, [session, dbConnected, clickupTaskId, supabaseClient]);

  // Realtime: além do polling de 3 em 3 minutos acima (mantido como rede de
  // segurança), assina mudanças ao vivo nas 3 tabelas que Kanban/Propostas
  // usam como fonte de verdade, pra refletir a mudança de outro usuário em
  // segundos em vez de esperar o próximo ciclo do polling. O handler só
  // dispara o mesmo fetchAllData(true) do polling — silent=true já passa
  // pelas guardas existentes (itensRef/propostaDirtyRef) contra sobrescrever
  // edição em andamento. Ver docs/superpowers/specs/2026-08-20-realtime-sync-design.md.
  const realtimeDebounceRef = useRef(null);
  // Espelha fetchAllData pra uso dentro do useEffect do realtime — sem isso,
  // scheduleRefresh (fechado dentro de um efeito que só depende de
  // session/supabaseClient) sempre enxergaria o fetchAllData de quando o
  // efeito foi criado, com clickupTaskId ainda '' (mesmo motivo de
  // activeTabRef/itensRef acima).
  const fetchAllDataRef = useRef(null);
  useEffect(() => {
    fetchAllDataRef.current = fetchAllData;
  });

  useEffect(() => {
    if (!session || !supabaseClient) return;

    const scheduleRefresh = () => {
      if (document.hidden) return;
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        fetchAllDataRef.current(true);
      }, 1500);
    };

    const channel = supabaseClient
      .channel('crm-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'negocios' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'propostas' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itens_proposta' }, scheduleRefresh)
      .subscribe((status) => {
        console.log('[Realtime] crm-realtime-sync status:', status);
      });

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabaseClient.removeChannel(channel);
    };
  }, [session, supabaseClient]);

  const loadPropostas = async (targetId = null, silent = false) => {
    if (!supabaseClient || !clickupTaskId || typeof clickupTaskId !== 'string' || !clickupTaskId.trim()) return;
    if (!silent) setLoading(true);
    try {
      const idWithoutHash = clickupTaskId.startsWith('#') ? clickupTaskId.substring(1) : clickupTaskId.trim();
      if (!idWithoutHash) return;
      const idWithHash = '#' + idWithoutHash;
      const { data: props, error } = await supabaseClient
        .from('propostas')
        .select('*')
        .or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPropostas(props);
      fetchProjectContext();

      if (props.length > 0) {
        // Se a proposta targetId não for encontrada (ex: excluída) ou for nula, força o pré-carregamento da 'vA'.
        // Caso 'vA' não exista por qualquer motivo, carrega a mais recente (primeira da lista).
        const selected = targetId 
          ? props.find(p => p.id === targetId) || props.find(p => p.versao === 'vA') || props[0]
          : props.find(p => p.versao === 'vA') || props[0];
        
        loadProposalDetails(selected.id, silent);
      } else {
        setCurrentProposta(null);
        setItens([]);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar propostas.', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadTodasPropostas = async () => {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('propostas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTodasPropostas(data || []);
    } catch (err) {
      console.error("[DEBUG] Erro ao carregar todas as propostas:", err);
    }
  };

  const loadProposalDetails = async (proposalId, silent = false) => {
    // Se houver itens ainda não salvos (id temporário, criado por handleAddItem mas nunca
    // persistido no banco), uma atualização silenciosa em segundo plano (polling) NÃO pode
    // recarregar a proposta: isso apagaria o que o usuário está digitando antes de salvar.
    // Lê de itensRef (não do estado `itens` direto) porque o polling roda dentro de um
    // setInterval de closure antiga — ver comentário na declaração de itensRef.
    if (silent && (itensRef.current.some(it => String(it.id).startsWith('temp-')) || propostaDirtyRef.current)) {
      return;
    }
    // Carga explícita (usuário abrindo uma proposta/versão) sempre reseta o
    // rastreamento de edição — não faz sentido preservar "sujeira" de uma
    // proposta diferente da que está sendo aberta agora.
    if (!silent) {
      propostaDirtyRef.current = false;
    }
    // Instant Hydration: se a proposta já estiver no array local, atualiza imediatamente a UI sem delay
    const existingProp = propostas.find(p => p.id === proposalId);
    if (existingProp) {
      setCurrentProposta(existingProp);
      const isProj = ['HCI', 'Cloud', 'Tradicional', 'Upgrade'].map(x => x.toUpperCase()).includes((existingProp.cenario || '').toUpperCase()) || existingProp.cenario === '' || (existingProp.cenario || '').toUpperCase() === 'PROJETO';
      setIsProjeto(!!isProj);
    } else if (!silent) {
      setLoading(true);
    }

    try {
      // 1. Busca detalhes atualizados da proposta no Supabase
      const { data: prop, error: propErr } = await supabaseClient
        .from('propostas')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (propErr) throw propErr;

      let updatedProp = { ...prop };
      setCurrentProposta(updatedProp);
      setIsEditingProposal(false);
      const isProj = updatedProp && (['HCI', 'Cloud', 'Tradicional', 'Upgrade'].map(x => x.toUpperCase()).includes((updatedProp.cenario || '').toUpperCase()) || updatedProp.cenario === '' || (updatedProp.cenario || '').toUpperCase() === 'PROJETO');
      setIsProjeto(!!isProj);

      // 2. Busca itens da proposta em paralelo com resposta rápida
      const { data: items, error: itemsErr } = await supabaseClient
        .from('itens_proposta')
        .select('*')
        .eq('proposta_id', proposalId)
        .order('created_at');

      if (itemsErr) throw itemsErr;
      setItens(items || []);

      // 3. Sincronização assíncrona não-bloqueante da data de início do ClickUp (em segundo plano).
      // IMPORTANTE: data_fechamento NUNCA é auto-preenchida a partir do due_date do ClickUp.
      // due_date é só o prazo/vencimento da tarefa, não confirmação de negócio fechado — e
      // data_fechamento é exatamente o campo que todo o resto do sistema usa para decidir se
      // um negócio conta como "ganho" nos relatórios. Preenchê-la automaticamente a partir do
      // due_date fazia negócios reabertos (situacao voltando a 'Ativa'/'Selecionada', sem
      // data_fechamento) serem contados como ganhos de novo assim que a proposta era recarregada,
      // mesmo sem ninguém clicar em "Ganho". Só o fluxo explícito de Ganho/Perdido pode setar
      // data_fechamento.
      const cuId = updatedProp.clickup_negocio_id || clickupTaskId;
      if (cuId && !updatedProp.data_inicio) {
        const cleanCuId = cuId.startsWith('#') ? cuId.substring(1) : cuId;
        fetch(`/clickup-api/task/${cleanCuId}`, { headers: { ...getSupabaseHeaders() } }).then(res => {
          if (res.ok) return res.json();
          return null;
        }).then(taskData => {
          if (!taskData) return;
          const startMs = taskData.start_date || taskData.date_created;
          if (!startMs) return;
          const newInicio = formatDateMsToYMD(startMs);
          setCurrentProposta(prev => prev && prev.id === updatedProp.id ? { ...prev, data_inicio: newInicio } : prev);
          supabaseClient.from('propostas').update({
            data_inicio: newInicio
          }).eq('id', updatedProp.id).then(() => {}).catch(() => {});
        }).catch(err => console.error("Erro ao importar data de início do ClickUp em segundo plano:", err));
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar detalhes da proposta.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. Salvar as credenciais do Supabase
  const handleSaveConfig = (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    const key = e.target.key.value.trim();
    
    safeStorage.setItem('supa_url', url);
    safeStorage.setItem('supa_key', key);
    
    setConfig({ url, anonKey: key });
    setShowSettingsModal(false);
    showToast('Configurações salvas com sucesso!', 'success');
  };

  // Antes só reconhecia 'success' — qualquer outro tipo (inclusive os
  // 'info'/'warning' já usados em vários lugares, ex.: "Negócio Congelado")
  // caía direto no branch de erro (toast vermelho), fazendo mensagens
  // neutras/informativas aparecerem como se fosse uma falha.
  const showToast = (msg, type = 'success') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else if (type === 'info') {
      setInfoMsg(msg);
      setTimeout(() => setInfoMsg(''), 4000);
    } else if (type === 'warning') {
      setWarningMsg(msg);
      setTimeout(() => setWarningMsg(''), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  // 4. Verificação de Apenas Leitura (Read-Only)
  const isReadOnly = false;

  // 5. Cálculos em tempo real
  const realTimeGrandTotal = useMemo(() => {
    return itens.reduce((sum, item) => sum + (item.quantidade * item.preco_unitario || 0), 0);
  }, [itens]);

  const handleItemChange = (index, field, value) => {
    if (isReadOnly) return;
    const newItens = [...itens];
    
    if (typeof field === 'object' && field !== null) {
      const updates = field;
      const mapped = { ...updates };
      if (updates.unitario !== undefined) {
        mapped.preco_unitario = Math.max(0, parseFloat(updates.unitario) || 0);
        delete mapped.unitario;
      }
      if (updates.preco_unitario !== undefined) {
        mapped.preco_unitario = Math.max(0, parseFloat(updates.preco_unitario) || 0);
      }
      if (updates.quantidade !== undefined) {
        mapped.quantidade = Math.max(1, parseInt(updates.quantidade) || 1);
      }
      newItens[index] = { ...newItens[index], ...mapped };
    } else {
      if (field === 'produto_id') {
        const selectedProd = produtos.find(p => p.id === value);
        newItens[index] = {
          ...newItens[index],
          produto_id: value,
          preco_unitario: selectedProd ? selectedProd.custo_referencia : 0
        };
      } else if (field === 'quantidade') {
        newItens[index].quantidade = Math.max(1, parseInt(value) || 1);
      } else if (field === 'preco_unitario') {
        newItens[index].preco_unitario = Math.max(0, parseFloat(value) || 0);
      } else {
        newItens[index][field] = value;
      }
    }
    
    setItens(newItens);
  };

  const handleCurrencyInputChange = (index, rawValue) => {
    if (isReadOnly) return;
    const digits = rawValue.replace(/\D/g, '');
    if (!digits) {
      handleItemChange(index, 'preco_unitario', 0);
      return;
    }
    const numericValue = parseFloat(digits) / 100;
    handleItemChange(index, 'preco_unitario', numericValue);
  };

  const handleAddItem = () => {
    if (isReadOnly) return;
    if (produtos.length === 0) {
      showToast('Nenhum produto cadastrado! Vá ao Painel de Gestão ou clique no botão superior para cadastrar.', 'error');
      return;
    }
    
    setItens([
      ...itens,
      {
        id: `temp-${Date.now()}`,
        produto_id: produtos[0]?.id || '',
        distribuidor_id: distribuidores[0]?.id || null,
        quantidade: 1,
        preco_unitario: produtos[0]?.custo_referencia || 0
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (isReadOnly) return;
    setItens(itens.filter((_, i) => i !== index));
  };

  // 6. Criar nova proposta inicial (vA)
  const handleCreateInitialProposal = async () => {
    if (!supabaseClient || !clickupTaskId) return;
    setLoading(true);
    try {
      const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : 'Vendedor CRM';
      const authorUserId = userProfile?.id ? String(userProfile.id) : null;
      const { data: newProp, error } = await supabaseClient
        .from('propostas')
        .insert({
          clickup_negocio_id: clickupTaskId,
          versao: 'vA',
          cenario: '',
          situacao: 'Ativa',
          total_proposta: 0,
          criado_por: currentResponsavel,
          criado_por_user_id: authorUserId
        })
        .select()
        .single();

      if (error) throw error;
      
      showToast('Primeira versão (vA) iniciada com sucesso!', 'success');
      await loadPropostas(newProp.id);
      setDrawerTab('budget');
    } catch (err) {
      console.error("Erro ao criar proposta inicial:", err);
      showToast('Erro ao criar proposta inicial.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const syncClickUpProposta = async (taskId, valorTotal, flowName) => {
    const cleanTaskId = String(taskId).replace('#', '').trim();
    if (!cleanTaskId) return;

    const valorLimpo = parseNumericValue(valorTotal);
    const valorCentavos = Math.round(Number(valorLimpo) * 100);

    if (valorLimpo === null || valorLimpo === undefined || isNaN(Number(valorLimpo)) || Number(valorLimpo) <= 0 || isNaN(valorCentavos)) {
      console.warn(`[${new Date().toISOString()}] Ignorando sincronização com ClickUp (${flowName}) para tarefa ${cleanTaskId} pois o valor é inválido ou <= 0:`, valorLimpo);
      return;
    }

    try {
      // 1. Obter detalhes da tarefa atual (Proposta)
      const taskRes = await fetch(`/clickup-api/task/${cleanTaskId}`, {
        headers: {
          "Content-Type": "application/json",
          ...getSupabaseHeaders()
        }
      });
      if (!taskRes.ok) {
        console.error(`[${new Date().toISOString()}] Erro ao obter tarefa ${cleanTaskId} no ClickUp (status: ${taskRes.status})`);
        return;
      }
      const currentTask = await taskRes.json();

      if (!currentTask || !currentTask.custom_fields) {
        console.warn(`[${new Date().toISOString()}] Tarefa ClickUp ${cleanTaskId} não tem custom_fields.`);
        return;
      }

      // a) Atualização local do "Total da Proposta" na tarefa de Proposta
      const campoValor = currentTask.custom_fields.find(f => {
        const name = (f.name || "").toLowerCase();
        return name === 'deal value' || 
               name === 'total da proposta' || 
               name === 'valor total' || 
               name === 'valor do negócio' || 
               name === 'valor' || 
               name === 'total';
      });

      if (campoValor) {
        const bodyFormatado = campoValor.id === DEAL_VALUE_FIELD_ID
          ? { value: Number(Number(valorLimpo).toFixed(2)) }
          : { value: valorCentavos };
        const urlValue = `/clickup-api/task/${cleanTaskId}/field/${campoValor.id}`;
        
        console.log(`[${new Date().toISOString()}] POST ${urlValue} - Body:`, JSON.stringify(bodyFormatado));
        
        if (cleanTaskId === '86ahby7wm') {
          console.log(`[${new Date().toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando valor local para ClickUp (${flowName}): ${bodyFormatado.value}`);
        }

        const resVal = await fetch(urlValue, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            ...getSupabaseHeaders()
          },
          body: JSON.stringify(bodyFormatado)
        });

        if (resVal.status !== 200 && resVal.status !== 201) {
          const errText = await resVal.text();
          console.error(`[${new Date().toISOString()}] Erro ao atualizar campo local no ClickUp [Status: ${resVal.status}]:`, errText);
        } else {
          console.log(`[${new Date().toISOString()}] Campo local (${campoValor.name}) atualizado com sucesso no ClickUp (${flowName})!`);
          
          // Validação imediata via GET pós-POST
          try {
            console.log(`[${new Date().toISOString()}] Iniciando verificação GET pós-POST para a tarefa ${cleanTaskId}...`);
            const verifyRes = await fetch(`/clickup-api/task/${cleanTaskId}`, {
              headers: {
                "Content-Type": "application/json",
                ...getSupabaseHeaders()
              }
            });
            if (verifyRes.ok) {
              const verifyTask = await verifyRes.json();
              const verifyField = verifyTask.custom_fields?.find(f => f.id === campoValor.id);
              const valorRetornado = verifyField ? verifyField.value : null;
              console.log(`[${new Date().toISOString()}] VALIDAÇÃO pós-update (${flowName}) para tarefa ${cleanTaskId}: Valor retornado no ClickUp =`, valorRetornado, `(Esperado: ${bodyFormatado.value})`);
              if (cleanTaskId === '86ahby7wm') {
                console.log(`[${new Date().toISOString()}] [VALOR CONFIRMADO TASK 86ahby7wm] Valor pós-POST no ClickUp:`, valorRetornado);
              }
            }
          } catch (verifyErr) {
            console.error("Erro ao validar campo local:", verifyErr);
          }
        }
      } else {
        console.warn(`[${new Date().toISOString()}] Campo local de valor não encontrado na tarefa ${cleanTaskId}.`);
      }

      // b) Atualização global do Deal Value na tarefa pai (Negócio)
      const relField = currentTask.custom_fields.find(f => {
        if (f.type !== 'list_relationship') return false;
        const name = (f.name || "").toLowerCase();
        return name.includes('negócio') || name.includes('negocio') || name.includes('comercial proposal');
      });

      if (relField && relField.value && Array.isArray(relField.value) && relField.value.length > 0) {
        const parentTaskId = String(relField.value[0].id).replace('#', '').trim();
        const urlGlobal = `/clickup-api/task/${parentTaskId}/field/${DEAL_VALUE_FIELD_ID}`;
        const bodyFormatado = { value: Number(Number(valorLimpo).toFixed(2)) };

        console.log(`[${new Date().toISOString()}] POST ${urlGlobal} - Body:`, JSON.stringify(bodyFormatado));

        if (cleanTaskId === '86ahby7wm' || parentTaskId === '86ahby7wm') {
          console.log(`[${new Date().toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando Deal Value global para a tarefa pai ${parentTaskId}: ${bodyFormatado.value}`);
        }

        const resGlobal = await fetch(urlGlobal, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            ...getSupabaseHeaders()
          },
          body: JSON.stringify(bodyFormatado)
        });

        if (resGlobal.status !== 200 && resGlobal.status !== 201) {
          const errText = await resGlobal.text();
          console.error(`[${new Date().toISOString()}] Erro crítico ao atualizar Deal Value global na tarefa ${parentTaskId} [Status: ${resGlobal.status}]:`, errText);
        } else {
          console.log(`[${new Date().toISOString()}] Deal Value global atualizado com sucesso no ClickUp (Tarefa Negócio Pai: ${parentTaskId})!`);

          // Validação imediata global via GET pós-POST
          try {
            console.log(`[${new Date().toISOString()}] Iniciando verificação GET pós-POST para a tarefa pai ${parentTaskId}...`);
            const verifyRes = await fetch(`/clickup-api/task/${parentTaskId}`, {
              headers: {
                "Content-Type": "application/json",
                ...getSupabaseHeaders()
              }
            });
            if (verifyRes.ok) {
              const verifyTask = await verifyRes.json();
              const verifyField = verifyTask.custom_fields?.find(f => f.id === DEAL_VALUE_FIELD_ID);
              const valorRetornado = verifyField ? verifyField.value : null;
              console.log(`[${new Date().toISOString()}] VALIDAÇÃO Deal Value global pós-update (${flowName}) para tarefa ${parentTaskId}: valor =`, valorRetornado);
              if (parentTaskId === '86ahby7wm') {
                console.log(`[${new Date().toISOString()}] [VALOR CONFIRMADO TASK 86ahby7wm] Valor global pós-POST no ClickUp:`, valorRetornado);
              }
            }
          } catch (verifyErr) {
            console.error("Erro ao validar Deal Value global:", verifyErr);
          }
        }
      } else {
        console.warn(`[${new Date().toISOString()}] Relacionamento de Negócio/Comercial Proposal não encontrado na tarefa ${cleanTaskId}.`);
      }

    } catch (err) {
      console.error(`[${new Date().toISOString()}] Erro durante a sincronização dupla com o ClickUp (${flowName}):`, err);
    }
  };

  // 7. Ação de Salvar Proposta
  const handleSaveProposal = async () => {
    if (isReadOnly || !currentProposta) return;
    setSaving(true);
    try {
      // ⚡ ATUALIZAÇÃO OTÍMISTA EM MEMÓRIA
      // Atualiza supabaseProposalsList imediatamente (sem esperar o banco)
      // para que o Kanban e o Forecast reflitam o novo valor na hora.
      const cleanTaskId = String(clickupTaskId || '').replace('#', '').trim();
      if (cleanTaskId) {
        setSupabaseProposalsList(prev => {
          const updated = (prev || []).map(p => {
            const pClean = String(p.clickup_negocio_id || '').replace('#', '').trim();
            if (pClean === cleanTaskId && p.id === currentProposta.id) {
              return { ...p, total_proposta: realTimeGrandTotal, situacao: currentProposta.situacao };
            }
            return p;
          });
          // Se não havia entrada, adiciona uma nova
          const exists = updated.some(p => String(p.clickup_negocio_id || '').replace('#', '').trim() === cleanTaskId && p.id === currentProposta.id);
          if (!exists) {
            updated.push({
              clickup_negocio_id: cleanTaskId,
              total_proposta: realTimeGrandTotal,
              situacao: currentProposta.situacao,
              criado_por: currentProposta.criado_por,
              id: currentProposta.id
            });
          }
          return updated;
        });
      }

      const nowIso = new Date().toISOString();
      const currentUser = currentProposta.criado_por || session?.user?.email || 'Usuário';

      const updateData = {
        cenario: currentProposta.cenario,
        criado_por: currentProposta.criado_por,
        situacao: currentProposta.situacao,
        total_proposta: realTimeGrandTotal,
        // data_fechamento NUNCA herda o due_date do ClickUp (prazo da tarefa, não confirmação
        // de negócio fechado) — só é gravada aqui se já vier preenchida (fluxo de Ganho/Perdido).
        data_fechamento: currentProposta.data_fechamento || null,
        motivo_perda: currentProposta.situacao === 'Perdido' ? currentProposta.motivo_perda : null
      };

      if (currentProposta.data_inicio || clickupTaskDates?.start_date) {
        updateData.data_inicio = currentProposta.data_inicio || clickupTaskDates?.start_date;
      }

      let { error: propError } = await supabaseClient
        .from('propostas')
        .update(updateData)
        .eq('id', currentProposta.id);

      // Tratamento defensivo caso a coluna data_inicio ainda não exista no Supabase
      if (propError && (propError.code === '42703' || propError.code === 'PGRST204' || (propError.message && propError.message.includes('data_inicio')))) {
        console.warn("Coluna 'data_inicio' ainda não criada no Supabase. Salvando sem a coluna data_inicio...");
        delete updateData.data_inicio;
        const { error: retryErr } = await supabaseClient
          .from('propostas')
          .update(updateData)
          .eq('id', currentProposta.id);
        propError = retryErr;
      }

      if (propError) throw propError;

      // Propaga as datas para todas as versões da mesma oportunidade no Supabase
      const cuId = currentProposta.clickup_negocio_id || clickupTaskId;
      if (cuId) {
        const cleanCuId = String(cuId).replace('#', '').trim();
        const idWithHash = '#' + cleanCuId;
        const propUpdates = {
          data_fechamento: currentProposta.data_fechamento || null
        };
        if (currentProposta.data_inicio || clickupTaskDates?.start_date) {
          propUpdates.data_inicio = currentProposta.data_inicio || clickupTaskDates?.start_date;
        }
        try {
          const { error: propSyncErr } = await supabaseClient
            .from('propostas')
            .update(propUpdates)
            .or(`clickup_negocio_id.eq.${cleanCuId},clickup_negocio_id.eq.${idWithHash}`);

          if (propSyncErr && (propSyncErr.code === '42703' || propSyncErr.code === 'PGRST204' || (propSyncErr.message && propSyncErr.message.includes('data_inicio')))) {
            delete propUpdates.data_inicio;
            await supabaseClient
              .from('propostas')
              .update(propUpdates)
              .or(`clickup_negocio_id.eq.${cleanCuId},clickup_negocio_id.eq.${idWithHash}`);
          }
        } catch (propSyncEx) {
          console.warn("Aviso ao propagar datas para propostas irmãs:", propSyncEx);
        }

        // Sincroniza diretamente as datas (start_date e due_date) na tarefa do ClickUp
        const datesPayload = {};
        const startDateVal = currentProposta.data_inicio || clickupTaskDates?.start_date;
        const endDateVal = currentProposta.data_fechamento;
        if (startDateVal) {
          const startMs = new Date(`${startDateVal}T12:00:00.000Z`).getTime();
          if (!isNaN(startMs)) datesPayload.start_date = startMs;
        }
        if (endDateVal) {
          const endMs = new Date(`${endDateVal}T12:00:00.000Z`).getTime();
          if (!isNaN(endMs)) datesPayload.due_date = endMs;
        }
        if (Object.keys(datesPayload).length > 0) {
          fetch(`/clickup-api/task/${cleanCuId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders() },
            body: JSON.stringify(datesPayload)
          }).catch(err => console.error("Erro ao sincronizar datas no ClickUp:", err));
        }
      }

      const { error: deleteError } = await supabaseClient
        .from('itens_proposta')
        .delete()
        .eq('proposta_id', currentProposta.id);

      if (deleteError) throw deleteError;

      if (itens.length > 0) {
        const itensToInsert = itens.map(item => ({
          proposta_id: currentProposta.id,
          produto_id: item.produto_id,
          distribuidor_id: item.distribuidor_id || distribuidores[0]?.id || null,
          quantidade: Math.max(1, parseInt(item.quantidade) || 1),
          preco_unitario: Math.max(0, parseFloat(item.preco_unitario) || 0)
        }));

        const { error: insertError } = await supabaseClient
          .from('itens_proposta')
          .insert(itensToInsert);

        if (insertError) throw insertError;
      }

      // Sincroniza sempre o valor total da proposta com a Oportunidade no ClickUp se for Selecionada ou a versão ativa
      const isOnlyOrSelected = currentProposta.situacao === 'Selecionada' || propostas.length <= 1;
      const targetTaskIdForClickup = clickupTaskId || currentProposta.clickup_negocio_id;
      if (isOnlyOrSelected && targetTaskIdForClickup) {
        await syncClickUpProposta(targetTaskIdForClickup, realTimeGrandTotal, 'Save');
      }

      propostaDirtyRef.current = false;
      showToast('Proposta salva com sucesso!', 'success');
      setIsEditingProposal(false);
      loadPropostas(currentProposta.id);
      // Confirma a lista global com dados frescos do banco em segundo plano
      refreshSupabaseProposalsList();
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar proposta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProposalDebounced = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      handleSaveProposal();
    }, 300);
  };

  // 8. Botão "Gerar Nova Versão" (Database-First Clone - Preserva o Histórico da Base)
  const handleGerarNovaVersao = async () => {
    if (!clickupTaskId) return;
    if (!currentProposta || propostas.length === 0) {
      // Confere direto no banco antes de assumir que não existe proposta: o estado local
      // (propostas/currentProposta) pode ainda não ter carregado por uma condição de corrida,
      // e criar uma proposta em branco aqui duplicaria a que já existe.
      const idWithoutHash = clickupTaskId.startsWith('#') ? clickupTaskId.substring(1) : clickupTaskId.trim();
      const idWithHash = '#' + idWithoutHash;
      const { data: existingProps } = await supabaseClient
        .from('propostas')
        .select('*')
        .or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`)
        .order('created_at', { ascending: false });

      if (existingProps && existingProps.length > 0) {
        setPropostas(existingProps);
        const selected = existingProps.find(p => p.versao === 'vA') || existingProps[0];
        await loadProposalDetails(selected.id);
        showToast('Proposta já existente carregada — nenhuma versão nova foi criada.', 'info');
        return;
      }

      await handleCreateInitialProposal();
      return;
    }
    setSaving(true);
    try {
      // 1. Se estivermos na aba de edição de orçamento e houver itens em memória, salva primeiro a proposta atual
      if (drawerTab === 'budget' && !isReadOnly && itens && itens.length > 0) {
        await handleSaveProposal();
      }

      // 2. Busca os dados reais e atualizados da proposta base (vA) direto do banco
      const { data: dbBaseProp, error: dbPropErr } = await supabaseClient
        .from('propostas')
        .select('*')
        .eq('id', currentProposta.id)
        .single();

      if (dbPropErr) {
        console.error('Erro ao buscar proposta base atualizada, usando dados em memória:', dbPropErr);
      }

      const basePropData = dbBaseProp || currentProposta;

      // 3. Busca os itens da proposta base (vA) direto do banco
      const { data: dbBaseItems } = await supabaseClient
        .from('itens_proposta')
        .select('*')
        .eq('proposta_id', currentProposta.id);

      const itemsToClone = (dbBaseItems && dbBaseItems.length > 0) ? dbBaseItems : (itens || []);

      // 4. Calcula o valor total real da proposta base com base nos itens
      let calculatedBaseTotal = 0;
      if (itemsToClone.length > 0) {
        calculatedBaseTotal = itemsToClone.reduce((acc, item) => {
          const q = parseInt(item.quantidade) || 1;
          const p = parseFloat(item.preco_unitario) || 0;
          return acc + (q * p);
        }, 0);
      }
      
      const finalBaseTotal = calculatedBaseTotal > 0 
        ? calculatedBaseTotal 
        : (parseFloat(basePropData.total_proposta) || (realTimeGrandTotal > 0 ? realTimeGrandTotal : 0));

      // Garante que o valor da proposta base (vA) fique preservado intacto no banco Supabase
      if (finalBaseTotal > 0 && parseFloat(basePropData.total_proposta) !== finalBaseTotal) {
        const { error: baseUpdateErr } = await supabaseClient
          .from('propostas')
          .update({ total_proposta: finalBaseTotal })
          .eq('id', currentProposta.id);
        if (baseUpdateErr) {
          console.error('Erro ao atualizar valor da proposta base:', baseUpdateErr);
        }
      }

      // 5. Calcula a próxima versão (ex: vA -> vB)
      const nextVersao = getNextVersionLetter(basePropData.versao || currentProposta.versao);

      // 6. Insere a nova proposta (vB) mantendo o valor base herdado e a situação como 'Ativa'
      const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : (basePropData.criado_por || '');
      const authorUserId = userProfile?.id ? String(userProfile.id) : (basePropData.criado_por_user_id || null);
      const { data: newProp, error: propErr } = await supabaseClient
        .from('propostas')
        .insert({
          clickup_negocio_id: clickupTaskId,
          versao: nextVersao,
          cenario: basePropData.cenario || '',
          situacao: 'Ativa',
          total_proposta: finalBaseTotal,
          criado_por: currentResponsavel,
          criado_por_user_id: authorUserId,
          data_inicio: basePropData.data_inicio || currentProposta?.data_inicio || clickupTaskDates?.start_date || null,
          // Nunca herda due_date do ClickUp como data_fechamento (ver comentário em loadProposalDetails).
          data_fechamento: null
        })
        .select()
        .single();

      if (propErr) throw propErr;

      // 7. Duplica os itens da base (vA) para a nova versão (vB) sem tocar na base
      if (itemsToClone.length > 0) {
        const clonedItens = itemsToClone.map(item => ({
          proposta_id: newProp.id,
          produto_id: item.produto_id,
          quantidade: Math.max(1, parseInt(item.quantidade) || 1),
          preco_unitario: Math.max(0, parseFloat(item.preco_unitario) || 0),
          distribuidor_id: item.distribuidor_id || null
        }));

        const { error: itemsErr } = await supabaseClient
          .from('itens_proposta')
          .insert(clonedItens);

        if (itemsErr) throw itemsErr;
      }

      showToast(`Nova versão ${nextVersao} gerada preservando o histórico de ${basePropData.versao}!`, 'success');
      await loadPropostas(newProp.id);
    } catch (err) {
      console.error("Erro ao gerar nova versão:", err);
      showToast('Erro ao gerar nova versão.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 8.5. Excluir Versão (Com regra específica para vA e secundárias)
  const handleDeleteProposal = async (proposalToDelete = null) => {
    const targetProp = proposalToDelete || currentProposta;
    if (!targetProp || !supabaseClient) return;
    const isVa = targetProp.versao === 'vA';
    
    if (isVa) {
      const message = 'Atenção! Excluir a versão inicial (vA) deletará permanentemente TODAS as versões desta proposta. Deseja continuar?';
      if (!confirm(message)) return;
      setSaving(true);
      try {
        // 1. Deleta itens de todas as versões do negócio
        const proposalIds = propostas.map(p => p.id);
        if (proposalIds.length > 0) {
          await supabaseClient
            .from('itens_proposta')
            .delete()
            .in('proposta_id', proposalIds);
        }

        // 2. Deleta todas as propostas do negócio
        const { error } = await supabaseClient
          .from('propostas')
          .delete()
          .eq('clickup_negocio_id', clickupTaskId);

        if (error) throw error;

        showToast('Todo o histórico de propostas foi excluído!', 'success');

        // 3. Reseta os estados de proposta do React mantendo o negocio ativo e zerando o valor estimado
        setCurrentProposta(null);
        setPropostas([]);
        setItens([]);

        if (clickupTaskId) {
          await syncClickUpProposta(clickupTaskId, 0, 'Select');
          setKanbanTasks(prev => prev.map(t => t.id === clickupTaskId ? { ...t, valor_estimado: 0 } : t));
          if (selectedTask && selectedTask.id === clickupTaskId) {
            setSelectedTask(prev => ({ ...prev, valor_estimado: 0 }));
          }
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao excluir histórico.', 'error');
      } finally {
        setSaving(false);
      }
    } else {
      const message = `Deseja realmente excluir a versão ${targetProp.versao}?`;
      if (!confirm(message)) return;
      setSaving(true);
      try {
        // Deleta os itens da proposta
        await supabaseClient
          .from('itens_proposta')
          .delete()
          .eq('proposta_id', targetProp.id);

        // Deleta a proposta
        const { error } = await supabaseClient
          .from('propostas')
          .delete()
          .eq('id', targetProp.id);

        if (error) throw error;

        showToast('Versão excluída com sucesso!', 'success');

        const remainingProps = propostas.filter(p => p.id !== targetProp.id);
        setPropostas(remainingProps);

        const hasSelectedRemaining = remainingProps.some(p => p.situacao === 'Selecionada');
        if (!hasSelectedRemaining && clickupTaskId) {
          await syncClickUpProposta(clickupTaskId, 0, 'Select');
          setKanbanTasks(prev => prev.map(t => t.id === clickupTaskId ? { ...t, valor_estimado: 0 } : t));
          if (selectedTask && selectedTask.id === clickupTaskId) {
            setSelectedTask(prev => ({ ...prev, valor_estimado: 0 }));
          }
        }

        const isCurrentDeleted = currentProposta && currentProposta.id === targetProp.id;
        if (isCurrentDeleted) {
          const vaProp = remainingProps.find(p => p.versao === 'vA') || remainingProps[0];
          if (vaProp) {
            await loadProposalDetails(vaProp.id);
          } else {
            setCurrentProposta(null);
            setItens([]);
          }
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao excluir versão.', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  // 8.9. Busca Proativa do ClickUp baseada no número comercial da proposta
  const handleSearchClickUpProposal = async () => {
    if (!searchTerm.trim()) {
      showToast('Digite um número de proposta para buscar.', 'error');
      return;
    }
    setSearching(true);
    setSearchResult('');
    try {
      const clickupHeaders = {
        "Content-Type": "application/json",
        ...getSupabaseHeaders()
      };

      // 1. Obter os Workspaces (Teams) para achar o team_id
      const teamsRes = await fetch("/clickup-api/team", {
        headers: clickupHeaders
      });
      if (!teamsRes.ok) throw new Error("Erro ao obter workspaces do ClickUp");
      const teamsData = await teamsRes.json();
      const teamId = teamsData.teams?.[0]?.id;
      if (!teamId) throw new Error("Nenhum workspace encontrado no ClickUp");

      // 2. Buscar as tarefas trazendo os campos customizados (com suporte a todos os status e limite de 100)
      let matchedTask = null;
      const numeroDigitado = searchTerm.toString().trim().toLowerCase();

      // 2.1. Buscar na lista atual se clickupListId estiver definido (paginando até encontrar ou esgotar)
      if (clickupListId) {
        try {
          let listPage = 0;
          let hasMoreList = true;
          while (hasMoreList && !matchedTask) {
            const listTasksRes = await fetch(`/clickup-api/list/${clickupListId}/task?archived=false&include_custom_fields=true&limit=100&include_closed=true&page=${listPage}`, {
              headers: clickupHeaders
            });
            if (listTasksRes.ok) {
              const listTasksData = await listTasksRes.json();
              const listTasks = listTasksData.tasks || [];
              if (listTasks.length === 0) {
                hasMoreList = false;
                break;
              }
              matchedTask = listTasks.find(task => {
                const fields = task.custom_fields || [];
                return fields.some(field => {
                  const nameLower = (field.name || "").toLowerCase();
                  const isProposalField = field.id === "c44cc05d-303f-47e2-b243-40c6b26b732f" || 
                                          nameLower.includes("proposta") || 
                                          nameLower.includes("proposal") || 
                                          nameLower.includes("vers");
                  if (isProposalField && field.value !== undefined && field.value !== null) {
                    return field.value.toString().trim().toLowerCase() === numeroDigitado;
                  }
                  return false;
                });
              });
              if (matchedTask) {
                break;
              }
              if (listTasks.length < 100) {
                hasMoreList = false;
              } else {
                listPage++;
              }
            } else {
              hasMoreList = false;
            }
          }
        } catch (listErr) {
          console.error("Erro ao buscar na lista do ClickUp:", listErr);
        }
      }

      // 2.2. Se não encontrou na lista, faz a busca no workspace/team (paginando até encontrar ou esgotar)
      if (!matchedTask) {
        let teamPage = 0;
        let hasMoreTeam = true;
        while (hasMoreTeam && !matchedTask) {
          const teamTasksRes = await fetch(`/clickup-api/team/${teamId}/task?archived=false&include_custom_fields=true&limit=100&include_closed=true&page=${teamPage}`, {
            headers: clickupHeaders
          });
          if (teamTasksRes.ok) {
            const teamTasksData = await teamTasksRes.json();
            const teamTasks = teamTasksData.tasks || [];
            if (teamTasks.length === 0) {
              hasMoreTeam = false;
              break;
            }
            matchedTask = teamTasks.find(task => {
              const fields = task.custom_fields || [];
              return fields.some(field => {
                const nameLower = (field.name || "").toLowerCase();
                const isProposalField = field.id === "c44cc05d-303f-47e2-b243-40c6b26b732f" || 
                                        nameLower.includes("proposta") || 
                                        nameLower.includes("proposal") || 
                                        nameLower.includes("vers");
                if (isProposalField && field.value !== undefined && field.value !== null) {
                  return field.value.toString().trim().toLowerCase() === numeroDigitado;
                }
                return false;
              });
            });
            if (matchedTask) {
              break;
            }
            if (teamTasks.length < 100) {
              hasMoreTeam = false;
            } else {
              teamPage++;
            }
          } else {
            hasMoreTeam = false;
            if (teamPage === 0) {
              throw new Error("Erro ao obter tarefas do ClickUp");
            }
          }
        }
      }

      if (!matchedTask) {
        showToast('Proposta não encontrada no ClickUp.', 'error');
        setSearchResult('🔴 Proposta não encontrada no ClickUp');
        return;
      }

      // 4. Se encontrar, captura o id real dela (task_id) e dispara loadPropostas
      let taskId = matchedTask.id;

      // Se a tarefa encontrada for a tarefa principal e tiver um relacionamento 'Comercial Proposal' apontando para a tarefa da proposta,
      // usamos o ID da tarefa relacionada (onde as versões do Supabase são associadas).
      const matchedNameLower = (matchedTask.name || "").toLowerCase();
      const isAlreadyProposalTask = matchedNameLower.includes("proposta comercial") || 
                                    matchedNameLower.includes("comercial proposal");
      if (!isAlreadyProposalTask) {
        const relField = (matchedTask.custom_fields || []).find(f => 
          (f.name || "").toLowerCase() === "comercial proposal" || 
          (f.name || "").toLowerCase() === "proposta comercial"
        );
        if (relField && relField.value && relField.value.length > 0) {
          const relTask = relField.value.find(t => 
            (t.name || "").toLowerCase().includes("proposta comercial") || 
            (t.name || "").toLowerCase().includes("comercial proposal")
          ) || relField.value[0];
          if (relTask && relTask.id) {
            taskId = relTask.id;
          }
        }
      }

      const resolvedTaskId = await resolveTaskIdFormat(taskId);
      if (matchedTask.list && matchedTask.list.id) {
        setClickupListId(matchedTask.list.id);
      }
      setClickupTaskId(resolvedTaskId);
      setSearchResult(`🟢 Negócio Vinculado: ${matchedTask.name}`);
      showToast('Negócio ClickUp vinculado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Falha na busca do ClickUp.', 'error');
      setSearchResult('🔴 Erro ao comunicar com o ClickUp');
    } finally {
      setSearching(false);
    }
  };

  // 9. Alterar Status de Versão de Proposta Unificado (Gatilho para sincronização no ClickUp)
  const handleUpdateVersionStatus = async (targetTaskId, versionId, newStatus) => {
    if (!versionId || !targetTaskId) return;
    const taskId = String(targetTaskId).replace('#', '').trim();
    
    if (!clickupTaskId) {
      setClickupTaskId(targetTaskId);
    }
    
    const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : '';

    // 1. Interface Otimista: Mudar localmente na mesma hora para que as badges de status na timeline mudem de cor imediatamente
    if (currentProposta && currentProposta.id === versionId) {
      setCurrentProposta(prev => ({ ...prev, situacao: newStatus, criado_por: currentResponsavel }));
    }
    setPropostas(prev => prev.map(p => {
      if (p.id === versionId) {
        return { ...p, situacao: newStatus, criado_por: currentResponsavel };
      }
      if (newStatus === 'Selecionada' && p.id !== versionId) {
        return { ...p, situacao: 'Desconsiderada' };
      }
      return p;
    }));

    if (newStatus === 'Selecionada') {
      const targetProp = propostas.find(p => p.id === versionId) || currentProposta;
      const valToSync = targetProp ? parseFloat(targetProp.total_proposta) || 0 : realTimeGrandTotal;

      setKanbanTasks(prevTasks => prevTasks.map(t => t.id === targetTaskId ? { ...t, valor_estimado: valToSync, responsavel_negocio: t.responsavel_negocio || t.assignees } : t));
      if (selectedTask && selectedTask.id === targetTaskId) {
        setSelectedTask(prev => ({ ...prev, valor_estimado: valToSync, responsavel_negocio: prev.responsavel_negocio }));
      }
    }

    setSaving(true);
    try {
      if (!isReadOnly && newStatus === 'Selecionada') {
        await handleSaveProposal();
      }

      // 2. REGRA DE NEGÓCIO: Se for Selecionada, as outras irmãs são Desconsideradas. 
      // Rascunhos múltiplos ativos podem coexistir simultaneamente como 'Ativa'.
      if (newStatus === 'Selecionada') {
        await supabaseClient
          .from('propostas')
          .update({ situacao: 'Desconsiderada' })
          .eq('clickup_negocio_id', targetTaskId)
          .neq('id', versionId);
      }

      // 3. Atualiza a proposta alvo no Supabase
      const updateData = { 
        situacao: newStatus,
        criado_por: currentResponsavel
      };

      // Se for alterada para Em Andamento ou Selecionada a partir de Ganho/Perdido, limpa fechamento
      if (newStatus === 'Selecionada' || newStatus === 'Ativa' || newStatus === 'Em Andamento') {
        updateData.data_fechamento = null;
        updateData.motivo_perda = null;
        if (newStatus === 'Selecionada') {
          // Só sobrescreve o total com o valor calculado em tempo real se ele for > 0.
          // Se os itens ainda não carregaram no editor (condição de corrida), realTimeGrandTotal
          // fica 0 — nesse caso preserva o total já salvo da própria proposta, em vez de zerá-lo.
          const existingTotal = parseFloat((propostas.find(p => p.id === versionId) || currentProposta || {}).total_proposta) || 0;
          updateData.total_proposta = realTimeGrandTotal > 0 ? realTimeGrandTotal : existingTotal;
        }
      }

      const { error } = await supabaseClient
        .from('propostas')
        .update(updateData)
        .eq('id', versionId);

      if (error) throw error;

      // Sincroniza o valor da proposta selecionada com o Deal Value no ClickUp.
      // NÃO mexe em negocios.estagio: selecionar uma versão é uma decisão sobre
      // QUAL proposta vale, não sobre em que fase do pipeline o negócio está
      // (bug corrigido em 21/08 — este bloco chamava handleOpportunityStateChange
      // e resetava o negócio pro primeiro estágio do Kanban toda vez que uma
      // proposta era selecionada, pois kanbanColumns[0] é sempre 'Registro').
      // Estágio só muda por ação explícita: Kanban (drag/dropdown),
      // Editar Negócio/Oportunidade, ou o fluxo de Ganho/Perdido em handleConfirmClose.
      if (newStatus === 'Selecionada' || newStatus === 'Em Andamento') {
        const targetProp = propostas.find(p => p.id === versionId) || currentProposta;
        const valToSync = targetProp ? parseFloat(targetProp.total_proposta) || 0 : realTimeGrandTotal;
        await syncClickUpProposta(taskId, valToSync, 'Select');
      }

      showToast(`Status atualizado para ${newStatus}!`, 'success');
      await loadPropostas(versionId);
      await loadProposalDetails(versionId);
      await refreshSupabaseProposalsList();
      loadDashboardData();
      fetchKanbanData();
    } catch (err) {
      console.warn("Erro silencioso de PostgREST ou rede na sincronização de propostas:", err);
      // O front-end otimista garante que a UI continuará funcionando sem travar os botões
    } finally {
      setSaving(false);
    }
  };

  // Alterar "Referência de Forecast" de uma versão — mecanismo independente de
  // `situacao`/`estagio`. Ao contrário de handleUpdateVersionStatus, NUNCA marca
  // as irmãs como 'Desconsiderada' e NUNCA chama handleOpportunityStateChange.
  const handleToggleForecastReference = async (targetTaskId, versionId, newValue) => {
    if (!versionId || !targetTaskId) return;
    const taskId = String(targetTaskId).replace('#', '').trim();

    // 1. Interface Otimista
    if (currentProposta && currentProposta.id === versionId) {
      setCurrentProposta(prev => ({ ...prev, referencia_forecast: newValue }));
    }
    setPropostas(prev => prev.map(p => {
      if (p.id === versionId) return { ...p, referencia_forecast: newValue };
      if (newValue === true) return { ...p, referencia_forecast: false };
      return p;
    }));

    setSaving(true);
    try {
      // 2. Exclusividade própria da referência de forecast — independente da
      // exclusividade de 'Selecionada' (não mexe em situacao das irmãs).
      if (newValue === true) {
        await supabaseClient
          .from('propostas')
          .update({ referencia_forecast: false })
          .eq('clickup_negocio_id', targetTaskId)
          .neq('id', versionId);
      }

      const { error } = await supabaseClient
        .from('propostas')
        .update({ referencia_forecast: newValue })
        .eq('id', versionId);

      if (error) throw error;

      // 3. Sincroniza o valor com o ClickUp apenas ao MARCAR (mesma função usada
      // pelo fluxo oficial de "Selecionar Versão"). Desmarcar não re-sincroniza
      // — fica como estava até a próxima ação.
      if (newValue === true) {
        const targetProp = propostas.find(p => p.id === versionId) || currentProposta;
        const valToSync = targetProp ? parseFloat(targetProp.total_proposta) || 0 : realTimeGrandTotal;
        await syncClickUpProposta(taskId, valToSync, 'ForecastReference');
      }

      await loadPropostas(versionId);
      await refreshSupabaseProposalsList();
      loadDashboardData();
      fetchKanbanData();
    } catch (err) {
      console.warn("Erro silencioso ao atualizar referência de forecast:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!currentProposta || !supabaseClient) return;
    
    const dateVal = closeDate || new Date().toISOString().split('T')[0];
    if (showCloseModal === 'loss' && !selectedLossReason) {
      showToast('Por favor, selecione o motivo da perda.', 'error');
      return;
    }

    setSaving(true);
    try {
      const isWin = showCloseModal === 'win';
      const situacao = isWin ? 'Ganho' : 'Perdido';
      const motivo = isWin ? null : selectedLossReason;

      // 1. Atualizar a proposta no Supabase
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: situacao,
          motivo_perda: motivo,
          data_fechamento: dateVal,
          total_proposta: realTimeGrandTotal
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      // 2. Sincronizar ClickUp se aplicável
      if (clickupTaskId) {
        await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, situacao);
        
        const targetOption = kanbanColumns.find(c => c.name.toLowerCase().includes(isWin ? 'ganho' : 'perdido'));
        if (targetOption) {
          await handleOpportunityStateChange(clickupTaskId, targetOption.id);
        }
      }

      showToast(`Proposta marcada como ${isWin ? 'GANHA' : 'PERDIDA'} com sucesso!`, 'success');
      setShowCloseModal(false);
      setShowDrawer(false); // Fecha o Drawer conforme exigido no fluxo de sucesso
      loadPropostas(currentProposta.id);
      await refreshSupabaseProposalsList();
      loadDashboardData();
      fetchKanbanData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao fechar proposta.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 10. Criar Novo Produto Dinamicamente (Modal Rápido)
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabaseClient
        .from('produtos')
        .insert({
          nome: newProduct.nome,
          fabricante: newProduct.fabricante,
          custo_referencia: parseFloat(newProduct.custo_referencia) || 0
        }).select().single();
      if (error) throw error;
      showToast('Produto cadastrado!', 'success');
      setNewProduct({ nome: '', fabricante: '', custo_referencia: '' });
      await loadProducts();
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar produto', 'error');
    }
  };

  // 11. Operações CRUD no Painel de Gestão (Produtos e Distribuidores)
  const handleSaveProductEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient
        .from('produtos')
        .update({
          nome: editingProduct.nome,
          fabricante: editingProduct.fabricante,
          custo_referencia: parseFloat(editingProduct.custo_referencia) || 0
        })
        .eq('id', editingProduct.id);

      if (error) throw error;
      showToast('Produto atualizado com sucesso!', 'success');
      setEditingProduct(null);
      loadProducts();
    } catch (err) {
      console.error(err);
      showToast('Erro ao editar produto.', 'error');
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Deseja realmente excluir este produto?')) return;
    try {
      const { error } = await supabaseClient.from('produtos').delete().eq('id', id);
      if (error) throw error;
      showToast('Produto excluído com sucesso!', 'success');
      loadProducts();
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir produto. Ele pode estar sendo usado em uma proposta.', 'error');
    }
  };

  // Lista de vendedores agora é derivada automaticamente (ClickUp ∩ usuarios_clickup,
  // ver loadVendedores) — criar/editar/excluir manualmente não existe mais, só ocultar.
  const handleToggleOcultoVendedor = async (vendedor) => {
    const isOculto = !vendedor.oculto;
    const updatedVendedores = vendedores.map(v => 
      v.id === vendedor.id ? { ...v, oculto: isOculto } : v
    );
    setVendedores(updatedVendedores);
    safeStorage.setItem('crm_cache_vendedores', JSON.stringify(updatedVendedores));
    
    // Atualizar no safeStorage a lista de IDs ocultos
    const ocultos = JSON.parse(safeStorage.getItem('crm_vendedores_ocultos') || '[]');
    let novosOcultos;
    if (isOculto) {
      novosOcultos = [...new Set([...ocultos, String(vendedor.id)])];
    } else {
      novosOcultos = ocultos.filter(id => String(id) !== String(vendedor.id));
    }
    localStorage.setItem('crm_vendedores_ocultos', JSON.stringify(novosOcultos));
    
    // Salvar no estado de vendedoresOcultos
    setVendedoresOcultos(novosOcultos);

    // Opcionalmente tentar persistir no Supabase (se a tabela de vendedores suportar a coluna oculto ou ativo_crm)
    if (supabaseClient) {
      try {
        await supabaseClient.from('vendedores').upsert({
          id: vendedor.id,
          nome: vendedor.nome,
          oculto: isOculto
        });
      } catch (err) {
        console.warn("Erro ao persistir status oculto do vendedor no Supabase:", err);
      }
    }
    
    showToast(`Vendedor ${isOculto ? 'ocultado' : 'exibido'} com sucesso!`, 'success');
  };

  const triggerLossModal = () => {
    setSelectedLossReason('');
    setShowLossModal(true);
  };

  const handleConfirmLoss = async () => {
    if (!currentProposta || !supabaseClient) return;
    if (!selectedLossReason) {
      showToast('Selecione um motivo para a perda.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: 'Perdido',
          motivo_perda: selectedLossReason
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      showToast('Proposta marcada como PERDIDA!', 'success');
      
      setCurrentProposta({
        ...currentProposta,
        situacao: 'Perdido',
        motivo_perda: selectedLossReason
      });

      setShowLossModal(false);
      loadPropostas(currentProposta.id);
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar situação para Perdido.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDistributor = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabaseClient
        .from('distribuidores')
        .insert({ nome: newDistributorName.trim() }).select().single();
      if (error) throw error;
      showToast('Distribuidor adicionado!', 'success');
      setNewDistributorName('');
      await loadDistributors();
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar distribuidor', 'error');
    }
  };

  const handleSaveDistributorEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient
        .from('distribuidores')
        .update({ nome: editingDistributor.nome })
        .eq('id', editingDistributor.id);

      if (error) throw error;
      showToast('Distribuidor atualizado com sucesso!', 'success');
      setEditingDistributor(null);
      loadDistributors();
    } catch (err) {
      console.error(err);
      showToast('Erro ao editar distribuidor.', 'error');
    }
  };

  const handleDeleteDistributor = async (id) => {
    if (!confirm('Deseja realmente excluir este distribuidor?')) return;
    try {
      const { error } = await supabaseClient.from('distribuidores').delete().eq('id', id);
      if (error) throw error;
      showToast('Distribuidor excluído com sucesso!', 'success');
      loadDistributors();
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir distribuidor.', 'error');
    }
  };

  // 12. Processamento em Lote: Importar CSV/XML
  const handleBatchImport = async () => {
    if (!importText.trim()) {
      showToast('Insira o texto CSV ou XML para importar.', 'error');
      return;
    }

    setSaving(true);
    try {
      let productsToInsert = [];

      if (importFormat === 'csv') {
        // Parse CSV
        const lines = importText.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          
          // Suporta separadores vírgula, ponto e vírgula ou tab
          const parts = line.includes(';') ? line.split(';') : line.split(',');
          if (parts.length >= 3) {
            const fabricante = parts[0].trim().replace(/^["']|["']$/g, '');
            const nome = parts[1].trim().replace(/^["']|["']$/g, '');
            const custo = parseFloat(parts[2].trim().replace(/[^0-9.]/g, '')) || 0;
            
            if (nome && fabricante) {
              productsToInsert.push({ nome, fabricante, custo_referencia: custo });
            }
          }
        }
      } else {
        // Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(importText, "text/xml");
        
        // Verifica se há erro de parse
        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
          throw new Error("Erro de formatação XML: " + parseError[0].textContent);
        }

        const nodes = xmlDoc.getElementsByTagName("produto");
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const nome = node.getElementsByTagName("nome")[0]?.textContent || "";
          const fabricante = node.getElementsByTagName("fabricante")[0]?.textContent || "";
          const custoText = node.getElementsByTagName("custo")[0]?.textContent || 
                            node.getElementsByTagName("custo_referencia")[0]?.textContent || "0";
          const custo = parseFloat(custoText.replace(/[^0-9.]/g, '')) || 0;

          if (nome && fabricante) {
            productsToInsert.push({ nome, fabricante, custo_referencia: custo });
          }
        }
      }

      if (productsToInsert.length === 0) {
        throw new Error("Nenhum produto válido encontrado no texto informado.");
      }

      // Upsert no Supabase
      const { data, error } = await supabaseClient
        .from('produtos')
        .upsert(productsToInsert, { onConflict: 'nome,fabricante' });

      if (error) throw error;

      showToast(`Importação concluída! ${productsToInsert.length} produtos adicionados/atualizados.`, 'success');
      setImportText('');
      loadProducts();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Erro ao importar produtos.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderTimeline = (showHeader = true) => {
    return (
      <div className="flex flex-col h-full">
        {showHeader && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-indigo-500 dark:text-slate-300 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Timeline de Versões
            </h2>
            <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums">
              {propostas.length}
            </span>
          </div>
        )}

        {propostas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-indigo-950/50 dark:to-slate-800 rounded-2xl border border-indigo-100/80 dark:border-indigo-800/50 flex items-center justify-center">
              <svg className="w-7 h-7 text-indigo-400 dark:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold">Nenhuma proposta criada</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Crie a primeira versão para este negócio.</p>
            </div>
            <button 
              onClick={handleCreateInitialProposal}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition-all"
            >
              + Criar Versão vA
            </button>
          </div>
        ) : (
          <div className="flex-1 space-y-2 pr-1 overflow-visible">
            {propostas.map((prop, i) => {
              const isSelected = currentProposta && currentProposta.id === prop.id;
              const statusConfig = {
                 'Ativa': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-400' },
                 'Selecionada': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
                 'Ganho': { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-400' },
                 'Desconsiderada': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
                 'Descartada': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
                 'Não selecionada': { bg: 'bg-slate-50 dark:bg-slate-900', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' },
                 'Substituída': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
                 'Perdido': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-400' }
               };
              const sc = statusConfig[prop.situacao] || { bg: 'bg-slate-50 dark:bg-slate-900', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' };
              
              return (
                <div 
                  key={prop.id}
                  onClick={async (e) => {
                    if (e.target.closest('.btn-three-dots')) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    await loadProposalDetails(prop.id);
                    setDrawerTab('budget');
                  }}
                  className={`group relative rounded-xl cursor-pointer timeline-item transition-all duration-200 overflow-visible ${
                    openMenuVersionId === prop.id ? 'z-[9999]' : 'z-10'
                  } ${
                    isSelected 
                      ? 'bg-white dark:bg-slate-800 ring-2 ring-indigo-500 shadow-md shadow-indigo-500/10' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-200 hover:shadow-sm'
                  }`}
                >
                  {/* Indicador lateral de seleção */}
                  {isSelected && (
                    <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-indigo-500 rounded-r-full"></div>
                  )}
                  
                  <div className="p-3">
                    {/* Linha 1: Versão + Status + Menu */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg text-[11px] font-black shadow-sm">
                          {formatVersionDisplay(prop.versao)}
                        </span>
                        {prop.cenario && (
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{prop.cenario}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 relative" onClick={(e) => e.stopPropagation()}>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${sc.bg} ${sc.text} ${sc.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></span>
                          {prop.situacao}
                        </span>
                        {prop.referencia_forecast && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-amber-50 text-amber-700 border-amber-200"
                            title="Referência de valor para o Forecast"
                          >
                            🎯 Forecast
                          </span>
                        )}
                      <div className="relative">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (openMenuVersionId === prop.id) {
                              setOpenMenuVersionId(null);
                            } else {
                              const btn = e.currentTarget || e.target.closest('button');
                              if (window.openVersionPortalMenu) {
                                window.openVersionPortalMenu(btn, prop.id);
                              } else {
                                const rect = btn.getBoundingClientRect();
                                const topPos = rect.bottom + 4;
                                const leftPos = Math.max(10, rect.right - 180);
                                const finalTop = (topPos + 100 > window.innerHeight) ? Math.max(10, rect.top - 80) : topPos;
                                setMenuPosition({ top: finalTop, left: leftPos });
                                setOpenMenuVersionId(prop.id);
                              }
                            }
                          }}
                          className="btn-three-dots p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                          title="Opções da Versão"
                        >
                          <svg className="w-3.5 h-3.5 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                            <path className="pointer-events-none" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </button>
                        {openMenuVersionId === prop.id && ReactDOM.createPortal(
                          <React.Fragment>
                            <div className="fixed inset-0 z-[9999998] bg-transparent cursor-default" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuVersionId(null); }} />
                            <div 
                              style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                              className="fixed z-[9999999] w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200/90 dark:border-slate-700/90 p-1.5 space-y-0.5 text-left animate-in fade-in zoom-in-95 duration-100 block"
                            >
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenMenuVersionId(null);
                                  await loadProposalDetails(prop.id);
                                  setDrawerTab('budget');
                                }}
                                className="w-full text-left text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg p-2 flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <span>✏️ Editar Versão</span>
                              </button>
                              <div className="border-t border-slate-100 dark:border-slate-800 my-0.5"></div>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenMenuVersionId(null);
                                  await handleDeleteProposal(prop);
                                }}
                                className="w-full text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg p-2 flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <span>🗑️ Excluir Versão</span>
                              </button>
                            </div>
                          </React.Fragment>,
                          document.body
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Linha 2: Data + Validade + Valor */}
                  <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {formatDateSafe(prop.created_at, {day: '2-digit', month: '2-digit'})}
                        </span>

                        {(() => {
                          const dealEstagio = selectedTask ? (selectedTask.estagio || selectedTask.status) : null;
                          const val = calcularValidadeProposta(prop, dealEstagio);
                          if (!val) return null;
                          if (val.status === 'vencida') {
                            return (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                <span className="w-1 h-1 rounded-full bg-rose-500"></span>
                                Expirada
                              </span>
                            );
                          }
                          if (val.status === 'vence_hoje') {
                            return (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                                Vence hoje
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                              {val.diasRestantes}d válidos
                            </span>
                          );
                        })()}
                      </div>

                      <span className="text-sm font-black text-slate-800 dark:text-slate-200 tabular-nums shrink-0">
                        R$ {Number(prop.total_proposta || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {propostas.length > 0 && (
          <button
            onClick={async () => {
              await handleGerarNovaVersao();
              setDrawerTab('budget');
            }}
            disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 mt-4 shadow-lg shadow-indigo-600/25 hover:from-indigo-500 hover:to-indigo-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Criar Nova Versão</span>
          </button>
        )}
      </div>
    );
  };

  const renderBudgetEditor = () => {
    if (loading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wide uppercase">Carregando dados da proposta...</p>
        </div>
      );
    }
    if (!currentProposta) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-indigo-100/80 dark:from-indigo-950/50 dark:to-indigo-900/50 rounded-3xl border border-indigo-200/60 dark:border-indigo-800/50 shadow-sm flex items-center justify-center text-indigo-600 dark:text-indigo-300">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-2">Painel de Negociação Comercial</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Selecione ou crie uma versão de proposta na linha do tempo para carregar os itens e precificação.</p>
          </div>
        </div>
      );
    }

    const getTipoOportunidade = () => {
      const c = currentProposta.cenario || '';
      if (['HCI', 'Cloud', 'Tradicional', 'Upgrade'].includes(c)) return 'PROJETO';
      return c;
    };

    const isReadOnly = (currentProposta.situacao === 'Ganho' || currentProposta.situacao === 'Perdido') && !isEditingProposal;

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/70 dark:bg-slate-700/70">
        {/* Barra superior de navegação */}
        <div className="px-6 py-3 bg-white dark:bg-slate-800 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 flex items-center justify-between z-10 shadow-sm shadow-slate-200/40">
          <button 
            onClick={() => setDrawerTab('details')}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-1.5 rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer group"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Voltar para Detalhes</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">PROPOSTA COMERCIAL</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Cabeçalho da Proposta */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80 px-7 py-5 shadow-2xs space-y-4">
            {/* Linha 1: Título amplo do Negócio e Metadados */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1.5">
                {projectContext.name && (
                  <h1 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight flex items-center gap-2.5">
                    <span>{projectContext.name}</span>
                  </h1>
                )}
                
                <div className="flex items-center gap-2.5 flex-wrap text-xs font-medium text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Versão</span>
                  <span className="inline-flex items-center justify-center bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-black px-2.5 py-0.5 rounded-lg text-xs shadow-xs tracking-wide">
                    {formatVersionDisplay(currentProposta.versao)}
                  </span>
                  {currentProposta.cenario && (
                    <span className="bg-slate-100 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 text-[11px] px-2.5 py-0.5 rounded-full uppercase font-extrabold tracking-wider">
                      {currentProposta.cenario}
                    </span>
                  )}
                  {isReadOnly && (
                    <span className="inline-flex items-center justify-center bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 rounded-lg text-[11px] font-bold gap-1 shadow-2xs" title="Trava de leitura ativa">
                      🔒 Somente Leitura
                    </span>
                  )}

                  <span className="text-slate-300">•</span>

                  <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Criada em <strong className="text-slate-800 dark:text-slate-200 font-bold">{formatDateSafe(currentProposta.created_at)}</strong> {currentProposta.criado_por ? <span>por <strong className="text-slate-900 dark:text-slate-100 font-bold">{currentProposta.criado_por}</strong></span> : ''}
                  </span>

                  {/* Badge Limpo de Validade dos Preços (apenas quando houver itens/valor e o negócio/proposta estiver em aberto) */}
                  {(() => {
                    const dealEstagio = selectedTask ? (selectedTask.estagio || selectedTask.status) : null;
                    const val = calcularValidadeProposta(currentProposta, dealEstagio);
                    if (!val) return null;
                    if (val.status === 'vencida') {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          <span>Expirada em {val.dataValidadeStr}</span>
                        </span>
                      );
                    }
                    if (val.status === 'vence_hoje') {
                      return (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>Vence Hoje ({val.dataValidadeStr})</span>
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>Válida até {val.dataValidadeStr} ({val.diasRestantes}d restantes)</span>
                      </span>
                    );
                  })()}

                  {currentProposta.situacao === 'Ganho' && (
                    <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1 shadow-2xs">
                      🏆 Ganho {currentProposta.data_fechamento ? `(${formatDateSafe(currentProposta.data_fechamento)})` : ''}
                    </span>
                  )}
                  {currentProposta.situacao === 'Perdido' && (
                    <span className="text-xs font-black text-rose-800 bg-rose-50 px-3 py-0.5 rounded-lg border border-rose-200 flex items-center gap-1 shadow-2xs">
                      😞 Perdido: {currentProposta.motivo_perda || 'Outros'} {currentProposta.data_fechamento ? `(${formatDateSafe(currentProposta.data_fechamento)})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Linha 2: Toolbar Premium de Ações e Status */}
            <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
              {/* Bloco Esquerdo: Selecionar Versão + Status Select */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Botão ⭐ Selecionar Versão */}
                {currentProposta.situacao === 'Selecionada' ? (
                  <button
                    onClick={async () => {
                      await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, 'Ativa');
                      showToast('Seleção desativada. A proposta retornou para Em Andamento.', 'info');
                    }}
                    className="bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-300/80 font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-[1.01]"
                    title="Clique para desativar esta seleção de versão"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>✅ Versão Selecionada</span>
                    <span className="text-[10px] text-emerald-600 font-medium underline ml-1">Desativar</span>
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, 'Selecionada');
                      showToast('Versão selecionada! Valor sincronizado com a oportunidade no ClickUp.', 'success');
                    }}
                    className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]"
                    title="Definir esta versão como a ativa comercialmente e sincronizar valor com o ClickUp"
                  >
                    <span>⭐ Selecionar Versão</span>
                  </button>
                )}

                {/* Botão 🎯 Referência de Forecast — independente de `situacao` */}
                {currentProposta.referencia_forecast ? (
                  <button
                    onClick={async () => {
                      await handleToggleForecastReference(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, false);
                      showToast('Removida como referência de forecast.', 'info');
                    }}
                    className="bg-amber-50 hover:bg-amber-100/80 text-amber-700 border border-amber-300/80 font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-[1.01]"
                    title="Esta versão é a referência de valor para o Forecast enquanto o cliente decide. Clique para remover."
                  >
                    <span>🎯 Referência de Forecast</span>
                    <span className="text-[10px] text-amber-600 font-medium underline ml-1">Remover</span>
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await handleToggleForecastReference(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, true);
                      showToast('Versão marcada como referência de forecast. Valor sincronizado com o ClickUp.', 'success');
                    }}
                    className="bg-white dark:bg-slate-800 hover:bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all hover:scale-[1.01]"
                    title="Usar o valor desta versão como referência do Forecast enquanto o cliente ainda não confirmou qual proposta vai escolher"
                  >
                    <span>🎯 Usar no Forecast</span>
                  </button>
                )}

                {/* Status Select */}
                <div className={`flex items-center gap-2 bg-slate-100/70 dark:bg-slate-700/70 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 transition-all ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">STATUS:</span>
                  <select
                    disabled={isReadOnly}
                    value={currentProposta.situacao === 'Ganho' ? 'Ganho' : currentProposta.situacao === 'Perdido' ? 'Perdido' : currentProposta.situacao === 'Desconsiderada' ? 'Desconsiderada' : 'Em Andamento'}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (val === 'Ganho') {
                        setCloseDate(new Date().toISOString().split('T')[0]);
                        setShowCloseModal('win');
                      } else if (val === 'Perdido') {
                        setCloseDate(new Date().toISOString().split('T')[0]);
                        setSelectedLossReason('');
                        setShowCloseModal('loss');
                      } else if (val === 'Em Andamento') {
                        // 'Ativa', não 'Selecionada' — "Em Andamento" é o estado neutro/rascunho,
                        // não uma seleção oficial. Usar 'Selecionada' aqui desconsiderava a(s)
                        // proposta(s) irmã(s) automaticamente, sem o usuário ter clicado em
                        // "Selecionar Versão" (bug corrigido em 21/08).
                        await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, 'Ativa');
                        showToast('Proposta atualizada para Em Andamento!', 'success');
                      } else if (val === 'Desconsiderada') {
                        await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, 'Desconsiderada');
                      }
                    }}
                    className="text-xs font-black text-slate-700 dark:text-slate-300 bg-transparent border-none focus:outline-none cursor-pointer pr-1 disabled:cursor-not-allowed"
                  >
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Ganho">🏆 Ganho</option>
                    <option value="Perdido">😞 Perdido</option>
                    <option value="Desconsiderada">🚫 Desconsiderada</option>
                  </select>
                </div>
              </div>

              {/* Bloco Direito: Botões de Fechamento Rápido (Ganho / Perdido sem cor por padrão) & Ações de Edição */}
              <div className="flex items-center gap-2 flex-wrap">
                {!isReadOnly && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setCloseDate(new Date().toISOString().split('T')[0]);
                        setShowCloseModal('win');
                      }}
                      className={`font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer hover:scale-[1.02] ${
                        currentProposta.situacao === 'Ganho'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100/80 dark:bg-slate-700/80 hover:bg-emerald-50 text-slate-600 dark:text-slate-300 hover:text-emerald-700 border border-slate-200/80 dark:border-slate-700/80'
                      }`}
                      title="Marcar oportunidade como Ganha 🏆"
                    >
                      <span>🏆 Ganho</span>
                    </button>
                    <button
                      onClick={() => {
                        setCloseDate(new Date().toISOString().split('T')[0]);
                        setSelectedLossReason('');
                        setShowCloseModal('loss');
                      }}
                      className={`font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer hover:scale-[1.02] ${
                        currentProposta.situacao === 'Perdido'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                          : 'bg-slate-100/80 dark:bg-slate-700/80 hover:bg-rose-50 text-slate-600 dark:text-slate-300 hover:text-rose-700 border border-slate-200/80 dark:border-slate-700/80'
                      }`}
                      title="Marcar oportunidade como Perdida 😞"
                    >
                      <span>😞 Perdido</span>
                    </button>
                  </div>
                )}

                {/* Editar */}
                <button
                  onClick={() => setIsEditingProposal(!isEditingProposal)}
                  className={`text-xs px-3.5 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all ${
                    isEditingProposal 
                      ? 'bg-amber-50 border border-amber-300 text-amber-800 font-extrabold shadow-2xs' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold shadow-2xs'
                  }`}
                  title={isEditingProposal ? "Bloquear Campos para Leitura" : "Desbloquear Campos para Edição (✏️)"}
                >
                  <span>✏️ {isEditingProposal ? 'Bloquear' : 'Editar'}</span>
                </button>

                {!isReadOnly && (
                  <button
                    onClick={handleSaveProposalDebounced}
                    disabled={saving}
                    className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02]"
                    title="Salvar Alterações"
                  >
                    {saving ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>💾 Salvar</span>
                    )}
                  </button>
                )}

                {/* Botão Excluir */}
                <button
                  onClick={handleDeleteProposal}
                  disabled={saving}
                  className="bg-white dark:bg-slate-800 text-rose-500 hover:bg-rose-50 border border-slate-200 dark:border-slate-700 hover:border-rose-200 p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-2xs hover:scale-[1.05]"
                  title="Excluir Versão"
                >
                  <span className="text-xs">🗑️</span>
                </button>
              </div>
            </div>
          </div>

          {/* Grid Premium de Metadados (Form Controls Card) */}
          <div className="mx-7 my-5 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3 text-indigo-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  Tipo Oportunidade
                </label>
                <select
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 shadow-xs hover:bg-slate-100/70 dark:hover:bg-slate-700/70 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-3 text-xs text-slate-800 dark:text-slate-200 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60"
                  value={getTipoOportunidade()}
                  onChange={(e) => {
                    const val = e.target.value;
                    propostaDirtyRef.current = true;
                    if (val === 'PROJETO') {
                      setIsProjeto(true);
                      setCurrentProposta({ ...currentProposta, cenario: '' });
                    } else {
                      setIsProjeto(false);
                      setCurrentProposta({ ...currentProposta, cenario: val });
                    }
                  }}
                  disabled={isReadOnly}
                >
                  <option value="" disabled className="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">Selecione a oportunidade...</option>
                  <option value="PROJETO" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">PROJETO</option>
                  <option value="GARANTIAS" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">GARANTIAS</option>
                  <option value="SERVIÇOS" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">SERVIÇOS</option>
                  <option value="SSU" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">SSU</option>
                  <option value="VOLUMES" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">VOLUMES</option>
                  <option value="UPGRADE" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">UPGRADE</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3 text-indigo-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  Tipo de Projeto
                </label>
                <select
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 shadow-xs hover:bg-slate-100/70 dark:hover:bg-slate-700/70 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-3 text-xs text-slate-800 dark:text-slate-200 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60"
                  value={currentProposta.cenario || ""}
                  onChange={(e) => { propostaDirtyRef.current = true; setCurrentProposta({ ...currentProposta, cenario: e.target.value }); }}
                  disabled={isReadOnly || !isProjeto}
                >
                  <option value="">Selecione o tipo...</option>
                  <option value="HCI">HCI (Hiperconvergência)</option>
                  <option value="Cloud">Cloud (Nuvem)</option>
                  <option value="Tradicional">Tradicional</option>
                  <option value="Upgrade">Upgrade</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3 text-indigo-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Vendedor / Responsável
                </label>
                <select
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 shadow-xs hover:bg-slate-100/70 dark:hover:bg-slate-700/70 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-3 text-xs text-slate-800 dark:text-slate-200 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60"
                  value={currentProposta.criado_por || ""}
                  onChange={(e) => { propostaDirtyRef.current = true; setCurrentProposta({ ...currentProposta, criado_por: e.target.value }); }}
                  disabled={isReadOnly}
                >
                  <option value="">Selecione o vendedor...</option>
                  {vendedoresVisiveis.map(v => (
                    <option key={v.id} value={v.nome} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">{v.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-indigo-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Data de Início
                  </span>
                  <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded-md uppercase" title="Sincroniza com todas as versões">NEGÓCIO</span>
                </label>
                <input
                  type="date"
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 shadow-xs hover:bg-slate-100/70 dark:hover:bg-slate-700/70 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-2.5 text-xs text-slate-800 dark:text-slate-200 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60"
                  value={currentProposta?.data_inicio ? currentProposta.data_inicio.substring(0, 10) : (clickupTaskDates?.start_date || '')}
                  onChange={(e) => { propostaDirtyRef.current = true; setCurrentProposta({ ...currentProposta, data_inicio: e.target.value }); }}
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-indigo-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Data Fechamento
                  </span>
                  <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded-md uppercase" title="Sincroniza com o ClickUp e todas as versões">NEGÓCIO</span>
                </label>
                <input
                  type="date"
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 shadow-xs hover:bg-slate-100/70 dark:hover:bg-slate-700/70 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-2.5 text-xs text-slate-800 dark:text-slate-200 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60"
                  value={currentProposta?.data_fechamento ? currentProposta.data_fechamento.substring(0, 10) : ''}
                  onChange={(e) => { propostaDirtyRef.current = true; setCurrentProposta({ ...currentProposta, data_fechamento: e.target.value }); }}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* Tabela de Produtos & Catálogo */}
          <div className="flex-1 overflow-y-auto px-7 pb-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <span>Produtos e Serviços Inclusos</span>
              </h3>
              {!isReadOnly && (
                <button 
                  onClick={() => setShowProductModal(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold flex items-center gap-1.5 transition-colors cursor-pointer group"
                >
                  <span className="w-5 h-5 rounded-md bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black">+</span>
                  <span>Adicionar Novo Item ao Catálogo</span>
                </button>
              )}
            </div>

            {itens.length === 0 ? (
              <div className="bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-800 dark:to-slate-900/80 border border-dashed border-slate-300/90 dark:border-slate-600/90 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-2xs">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-indigo-500">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-black text-slate-800 dark:text-slate-200">Nenhum item adicionado à proposta</p>
                  {!isReadOnly && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Selecione itens do catálogo para compor o valor comercial desta versão.</p>}
                </div>
                {!isReadOnly && (
                  <button
                    onClick={handleAddItem}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-600/20 hover:scale-[1.02] cursor-pointer"
                  >
                    + Adicionar Primeiro Item
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-x-auto" style={{ overflow: 'visible', minHeight: '280px' }}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-200/80 dark:border-slate-700/80 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      <th className="py-3 px-4">Produto [Fabricante]</th>
                      <th className="py-3 px-4 w-2/12">Distribuidor</th>
                      <th className="py-3 px-4 w-[70px] text-center">Qtd</th>
                      <th className="py-3 px-4 w-2/12 text-right">Unitário</th>
                      <th className="py-3 px-4 w-2/12 text-right">Subtotal</th>
                      {!isReadOnly && <th className="py-3 px-4 w-[60px] text-center">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itens.map((item, index) => {
                      const subtotal = item.quantidade * item.preco_unitario || 0;
                      const prodObj = produtos.find(p => p.id === item.produto_id);
                      return (
                        <tr key={item.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-900/80 transition-colors">
                          <td className="py-3.5 px-4 relative" style={{ overflow: 'visible' }}>
                            {isReadOnly ? (
                              <div>
                                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block">
                                  {prodObj?.nome || 'Produto não encontrado'}
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5 block">
                                  {prodObj?.fabricante ? `Fabricante: ${prodObj.fabricante}` : '-'}
                                </span>
                              </div>
                            ) : (
                              <React.Fragment>
                                <input
                                   type="text"
                                   className="w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold transition-all"
                                   placeholder="Digite para buscar produto..."
                                   value={
                                     item.searchTerm !== undefined
                                       ? item.searchTerm
                                       : (prodObj?.nome || '')
                                   }
                                   onChange={(e) => {
                                     const val = e.target.value;
                                     handleItemChange(index, { searchTerm: val, showDropdown: true, highlightedIndex: 0 });
                                   }}
                                   onFocus={() => {
                                     const currentVal = item.searchTerm !== undefined
                                       ? item.searchTerm
                                       : (prodObj?.nome || '');
                                     handleItemChange(index, { searchTerm: currentVal, showDropdown: true, highlightedIndex: 0 });
                                   }}
                                   onKeyDown={(e) => {
                                     const searchVal = item.searchTerm !== undefined ? item.searchTerm : (prodObj?.nome || '');
                                     const filtrados = produtos.filter(p => 
                                       (p.nome || '').toLowerCase().includes(searchVal.toLowerCase()) ||
                                       (p.fabricante || '').toLowerCase().includes(searchVal.toLowerCase())
                                     );

                                     if (!item.showDropdown || filtrados.length === 0) return;

                                     const currentIdx = item.highlightedIndex || 0;

                                     if (e.key === 'ArrowDown') {
                                       e.preventDefault();
                                       const nextIdx = (currentIdx + 1) % filtrados.length;
                                       handleItemChange(index, { highlightedIndex: nextIdx });
                                     } else if (e.key === 'ArrowUp') {
                                       e.preventDefault();
                                       const prevIdx = (currentIdx - 1 + filtrados.length) % filtrados.length;
                                       handleItemChange(index, { highlightedIndex: prevIdx });
                                     } else if (e.key === 'Enter') {
                                       e.preventDefault();
                                       const selectedProd = filtrados[currentIdx];
                                       if (selectedProd) {
                                         handleItemChange(index, {
                                           produto_id: selectedProd.id,
                                           preco_unitario: selectedProd.preco_base || 0,
                                           searchTerm: selectedProd.nome,
                                           showDropdown: false
                                         });
                                       }
                                     } else if (e.key === 'Escape') {
                                       handleItemChange(index, { showDropdown: false });
                                     }
                                   }}
                                />

                                {item.showDropdown && (
                                  <div className="absolute left-4 right-4 top-full mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[9999] max-h-48 overflow-y-auto divide-y divide-slate-100">
                                    {(() => {
                                      const searchVal = item.searchTerm !== undefined ? item.searchTerm : (prodObj?.nome || '');
                                      const filtrados = produtos.filter(p => 
                                        (p.nome || '').toLowerCase().includes(searchVal.toLowerCase()) ||
                                        (p.fabricante || '').toLowerCase().includes(searchVal.toLowerCase())
                                      );

                                      if (filtrados.length === 0) {
                                        return (
                                          <div className="p-3 text-xs text-slate-400 dark:text-slate-500 text-center font-medium">
                                            Nenhum produto encontrado
                                          </div>
                                        );
                                      }

                                      return filtrados.map((p, idx) => (
                                        <div
                                          key={p.id}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleItemChange(index, {
                                              produto_id: p.id,
                                              preco_unitario: p.preco_base || 0,
                                              searchTerm: p.nome,
                                              showDropdown: false
                                            });
                                          }}
                                          className={`p-2.5 text-xs cursor-pointer flex justify-between items-center transition-colors ${
                                            (item.highlightedIndex || 0) === idx ? 'bg-indigo-50/80 text-indigo-900 font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium'
                                          }`}
                                        >
                                          <div>
                                            <span className="font-bold block text-slate-800 dark:text-slate-200">{p.nome}</span>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.fabricante || 'Fabricante não informado'}</span>
                                          </div>
                                          <span className="font-mono text-xs text-indigo-600 dark:text-slate-200 font-bold">
                                            R$ {Number(p.preco_base || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                          </span>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                )}
                              </React.Fragment>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {isReadOnly ? (
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {distribuidores.find(d => d.id === item.distribuidor_id)?.nome || '-'}
                              </span>
                            ) : (
                              <select
                                className="w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium cursor-pointer"
                                value={item.distribuidor_id || ""}
                                onChange={(e) => handleItemChange(index, 'distribuidor_id', e.target.value)}
                              >
                                {distribuidores.length === 0 ? (
                                  <option value="">Nenhum distribuidor cadastrado</option>
                                ) : (
                                  distribuidores.map(d => (
                                    <option key={d.id} value={d.id}>{d.nome}</option>
                                  ))
                                )}
                              </select>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {isReadOnly ? (
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200">{item.quantidade}</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                className="w-16 mx-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 text-xs text-center text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold"
                                value={item.quantidade}
                                onChange={(e) => handleItemChange(index, 'quantidade', e.target.value)}
                              />
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {isReadOnly ? (
                              <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">
                                R$ {Number(item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            ) : (
                              <div className="relative">
                                <span className="absolute left-2.5 top-2.5 text-[11px] font-bold text-slate-400 dark:text-slate-500">R$</span>
                                <input
                                  type="text"
                                  className="w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 pl-8 text-xs text-right text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono font-bold"
                                  value={formatMaskedCurrency(item.preco_unitario)}
                                  onChange={(e) => handleCurrencyInputChange(index, e.target.value)}
                                />
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-slate-100 text-xs whitespace-nowrap tabular-nums">
                            R$ {subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>

                          {!isReadOnly && (
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => handleRemoveItem(index)}
                                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title="Remover Item"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isReadOnly && (
              <button
                onClick={handleAddItem}
                className="w-full py-3 border border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-500 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/40 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>Adicionar Item à Proposta</span>
              </button>
            )}
          </div>

          {/* Rodapé Resumo Comercial Ultra-Premium */}
          <div className="border-t border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 px-7 py-4.5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50/80 rounded-2xl flex items-center justify-center border border-indigo-100 text-indigo-600 shadow-2xs">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 dark:text-slate-400 font-extrabold uppercase tracking-widest block">RESUMO COMERCIAL</span>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-bold mt-0.5">Cálculo ativo com base em {itens.length} {itens.length === 1 ? 'item' : 'itens'}.</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl px-7 py-4.5 text-right shadow-lg shadow-indigo-950/20 min-w-[280px] border border-indigo-800/40">
              <p className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest mb-0.5">TOTAL DA PROPOSTA</p>
              <p className="text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">
                R$ {realTimeGrandTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!session) {
    return (
      <LoginScreen 
        onLogin={handleLogin} 
        error={errorMsg}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-hidden">
      
      {/* 1. Header do Sistema */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-wide">Suprimática CRM</h1>
              {activeTab === 'propostas' && projectContext.name && (
                <span className="text-[10px] text-indigo-300 font-bold bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-500/20" title={projectContext.name}>
                  {projectContext.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Gerador de Propostas
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Busca Global — pesquisa Empresas/Contatos/Negócios & Propostas
              em qualquer aba (ver buscarGlobal/handleGlobalSearchSelect) e
              leva direto ao registro selecionado. Mesmo mecanismo de lupa
              expansível já usado no Kanban, dado diferente. */}
          <div className="relative flex items-center">
            {!isGlobalSearchOpen ? (
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors"
                title="Buscar em todo o CRM..."
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center bg-slate-100/50 dark:bg-slate-700/50 border border-indigo-400 dark:border-indigo-500 rounded-lg px-3 py-1 h-9 w-72">
                <svg className="w-4 h-4 text-indigo-500 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  autoFocus
                  value={globalSearchTerm}
                  onChange={(e) => setGlobalSearchTerm(e.target.value)}
                  placeholder="Buscar empresa, contato, negócio..."
                  className="bg-transparent border-0 p-0 text-sm text-slate-800 dark:text-slate-200 focus:ring-0 focus:outline-none w-full font-medium"
                />
                <button
                  onClick={() => {
                    setIsGlobalSearchOpen(false);
                    setGlobalSearchTerm('');
                    setGlobalSearchResults({ contas: [], contatos: [], negocios: [] });
                  }}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-bold ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {isGlobalSearchOpen && globalSearchTerm.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-30 max-h-96 overflow-y-auto">
                {globalSearchLoading ? (
                  <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 font-medium">Buscando...</p>
                ) : globalSearchTerm.trim().length < 2 ? (
                  <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 font-medium">Digite ao menos 2 letras...</p>
                ) : (() => {
                  const { contas, contatos, negocios } = globalSearchResults;
                  if (contas.length === 0 && contatos.length === 0 && negocios.length === 0) {
                    return <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 font-medium">Nenhum resultado encontrado.</p>;
                  }
                  return (
                    <React.Fragment>
                      {contas.length > 0 && (
                        <div className="py-1">
                          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Empresas</p>
                          {contas.map(c => (
                            <button key={c.id} onMouseDown={(e) => { e.preventDefault(); handleGlobalSearchSelect('conta', c); }} className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{c.nome}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{c.cnpj || c.cidade || ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {contatos.length > 0 && (
                        <div className="py-1 border-t border-slate-100 dark:border-slate-700">
                          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Contatos</p>
                          {contatos.map(ct => (
                            <button key={ct.id} onMouseDown={(e) => { e.preventDefault(); handleGlobalSearchSelect('contato', ct); }} className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{ct.nome}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{ct.cargo || ct.email || ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {negocios.length > 0 && (
                        <div className="py-1 border-t border-slate-100 dark:border-slate-700">
                          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Negócios &amp; Propostas</p>
                          {negocios.map(n => (
                            <button key={n.id} onMouseDown={(e) => { e.preventDefault(); handleGlobalSearchSelect('negocio', n); }} className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{n.nome}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{n.estagio || ''}{n.numero_proposta_oficial ? ` · Nº ${n.numero_proposta_oficial}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Busca Proativa do ClickUp baseada no número comercial */}
          {activeTab === 'propostas' && (
            <div className="flex flex-col items-end space-y-1">
              <div className="flex items-center space-x-2">
                <div className="flex items-center bg-slate-100/50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1 space-x-2 h-9">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Proposta:</span>
                  <input 
                    type="text" 
                    className="bg-transparent border-0 p-0 text-sm text-slate-800 dark:text-slate-200 font-bold focus:ring-0 focus:outline-none w-48"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar Proposta (Ex: 12662/2026)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearchClickUpProposal();
                    }}
                  />
                </div>
                <button
                  onClick={handleSearchClickUpProposal}
                  disabled={searching}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all h-9 flex items-center justify-center min-w-[70px]"
                >
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>
              {searching && (
                <span className="text-[10px] text-indigo-400 font-medium animate-pulse">
                  🔍 Buscando Proposta...
                </span>
              )}
              {searchResult && !searching && (
                <span className={`text-[10px] font-bold ${searchResult.includes('🟢') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {searchResult}
                </span>
              )}
            </div>
          )}

          {/* Status da Conexão */}
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">{dbConnected ? 'Supabase Ativo' : 'Supabase Offline'}</span>
          </div>

          {/* Perfil do Usuário Autenticado no ClickUp */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            {userProfile && (
              <div
                className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 select-none"
                title={`Conectado ao ClickUp como ${userProfile.username || userProfile.email}`}
              >
                {userProfile.profilePicture ? (
                  <img src={userProfile.profilePicture} alt="User Avatar" className="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[9px] font-black">
                    {(userProfile.username || userProfile.email || 'U').substring(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                  {userProfile.username || userProfile.email}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors"
            title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors"
            title="Configurações de Conexão"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0" />
            </svg>
          </button>

          <button 
            onClick={async () => {
              if (supabaseClient) {
                await supabaseClient.auth.signOut();
                safeStorage.removeItem('crm_user_clickup_token');
                safeStorage.removeItem('crm_user_profile');
                setUserClickUpToken('');
                setUserProfile(null);
                setSession(null);
                showToast("Sessão encerrada com sucesso.", "success");
              }
            }}
            className="p-2 text-red-400 hover:text-red-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors"
            title="Sair / Logout"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. Sub-Header: Seleção de Abas do Sistema (Alinhado à Direita) */}
      <div className="flex justify-end bg-slate-50 dark:bg-slate-900 px-6 pt-4 pb-2 z-10">
        <div className="bg-slate-100 dark:bg-slate-700 p-1 rounded-lg flex gap-1 shadow-sm">
          <button
            onClick={() => setActiveTab('relatorios')}
            className={`font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${
              activeTab === 'relatorios' 
                ? 'bg-slate-900 text-white shadow-sm font-semibold' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'
            }`}
          >
            Relatórios
          </button>
          <button
            onClick={() => setActiveTab('kanban')}
            className={`font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${
              activeTab === 'kanban' 
                ? 'bg-slate-900 text-white shadow-sm font-semibold' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'
            }`}
          >
            Pipeline de Vendas
          </button>
          <button
            onClick={() => setActiveTab('empresas')}
            className={`font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${
              activeTab === 'empresas' 
                ? 'bg-slate-900 text-white shadow-sm font-semibold' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'
            }`}
          >
            Empresas
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${
              activeTab === 'tasks' 
                ? 'bg-slate-900 text-white shadow-sm font-semibold' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-600/50'
            }`}
          >
            Tarefas Comerciais
          </button>
        </div>
      </div>

      {/* Alertas Globais */}
      {errorMsg && (
        <div className="fixed top-20 right-6 z-[9999] bg-red-950/90 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md animate-bounce">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="fixed top-20 right-6 z-[9999] bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {infoMsg && (
        <div className="fixed top-20 right-6 z-[9999] bg-sky-950/90 border border-sky-500/30 text-sky-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md">
          <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{infoMsg}</span>
        </div>
      )}

      {warningMsg && (
        <div className="fixed top-20 right-6 z-[9999] bg-amber-950/90 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium">{warningMsg}</span>
        </div>
      )}

      {/* 3. Conteúdo Principal */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        
        {/* ABA 0: RELATÓRIOS / DASHBOARD (Painel Comercial) */}
        {activeTab === 'relatorios' && (
          <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 p-6 space-y-6">
            
            {/* ELEMENTO 1 (TOPO ABSOLUTO): Barra de Filtro de Datas */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Relatórios</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Distribuição de faturamento acumulado por distribuidor e fabricante.</p>
              </div>

              {/* Seletor de Período e Comparativo */}
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-2.5 shadow-lg">
                  {/* Botões Rápidos de Período */}
                  {(() => {
                    const nowYear = new Date().getFullYear();
                    const q = getCurrentQuarterRange();
                    const yearStart = `${nowYear}-01-01`;
                    const yearEnd = `${nowYear}-12-31`;
                    return (
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => applyFilterRange(yearStart, yearEnd, `${nowYear - 1}-01-01`, `${nowYear - 1}-12-31`)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${startDate === yearStart && endDate === yearEnd ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'}`}
                        >
                          Ano Atual
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFilterRange(q.start, q.end, q.compStart, q.compEnd)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${startDate === q.start && endDate === q.end ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'}`}
                        >
                          Trimestre Atual
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFilterRange('2023-01-01', new Date().toISOString().split('T')[0], '', '')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${startDate === '2023-01-01' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'}`}
                        >
                          Todo o Histórico
                        </button>
                      </div>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => setShowCustomRange(v => !v)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all cursor-pointer"
                  >
                    Personalizar período
                    <svg className={`w-3 h-3 transition-transform ${showCustomRange ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {showCustomRange && (
                  <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-2.5 shadow-lg">
                    <div className="flex items-center space-x-2">
                      <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Início</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          applyFilterRange(v, endDate);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Fim</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          applyFilterRange(startDate, v);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Início Comp.</label>
                      <input
                        type="date"
                        value={compareStartDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          applyFilterRange(startDate, endDate, v, compareEndDate);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Fim Comp.</label>
                      <input
                        type="date"
                        value={compareEndDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          applyFilterRange(startDate, endDate, compareStartDate, v);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                      />
                    </div>
                    <button
                      onClick={() => applyFilterRange(startDate, endDate, compareStartDate, compareEndDate)}
                      disabled={loadingDashboard}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-950/30 active:scale-95 cursor-pointer"
                    >
                      {loadingDashboard ? '...' : 'Filtrar'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* BLOCO 1: RESUMO SAZONAL DE VENDAS */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200 dark:hover:border-slate-700 shadow-sm shadow-slate-100/50">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <span>Resumo Sazonal de Vendas</span>
                    {biMetrics.compLabel && (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md normal-case tracking-normal">
                        Comparativo {biMetrics.currentLabel || 'Atual'} vs {biMetrics.compLabel}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Evolução temporal e inteligência sazonal de negócios ganhos</p>
                </div>
                
                {/* Badges de Comparação no Topo */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>{biMetrics.currentLabel || 'Atual'}:</span>
                    <span className="text-slate-900 font-extrabold">R$ {((biMetrics?.wonValue || 0) / 1000000).toFixed(2)} MI</span>
                    <span className="text-[10px] text-emerald-700 font-medium">({biMetrics?.wonCount || 0} deals)</span>
                  </div>
                  {biMetrics.compLabel && compareStartDate && compareEndDate && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-800 shadow-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white"></span>
                      <span>{biMetrics.compLabel}:</span>
                      <span className="text-slate-900 font-extrabold">R$ {((biMetrics?.wonValueComp || 0) / 1000000).toFixed(2)} MI</span>
                      <span className="text-[10px] text-indigo-700 font-medium">({biMetrics?.wonCountComp || 0} deals)</span>
                    </div>
                  )}
                  {biMetrics.compLabel && biMetrics?.wonValDiff !== null && (
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      biMetrics.wonValDiff >= 0 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      <span>{biMetrics.wonValDiff >= 0 ? '▲ +' : '▼ -'}R$ {(Math.abs(biMetrics.wonValDiff) / 1000000).toFixed(2)} MI</span>
                      <span className="text-[10px]">({biMetrics.wonValDiff >= 0 ? '+' : ''}{(biMetrics.wonValPct || 0).toFixed(1)}%)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid de 6 KPIs no Topo (Resumo Sazonal) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {/* 1. Negócios Ganhos */}
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 block truncate">Negócios Ganhos</span>
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{biMetrics?.wonCount || 0}</span>
                  </div>
                  {compareStartDate && compareEndDate && biMetrics?.wonQtyDiff !== null && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium truncate">vs {biMetrics.compLabel || 'ant.'}: <strong>{biMetrics.wonCountComp || 0}</strong></span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        biMetrics.wonQtyDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {biMetrics.wonQtyDiff >= 0 ? `+${biMetrics.wonQtyDiff}` : biMetrics.wonQtyDiff} ({biMetrics.wonQtyDiff >= 0 ? '+' : ''}{(biMetrics.wonQtyPct || 0).toFixed(0)}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Valor em Vendas */}
                <div className="bg-emerald-50/50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 border-l-4 border-l-emerald-500 rounded-xl p-3.5 flex flex-col justify-between hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 block truncate">Valor em Vendas</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate block">
                      R$ {(biMetrics?.wonValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {compareStartDate && compareEndDate && biMetrics?.wonValDiff !== null && (
                    <div className="mt-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/50 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium truncate">vs {biMetrics.compLabel || 'ant.'}: <strong>R$ {((biMetrics.wonValueComp || 0) / 1000000).toFixed(2)}M</strong></span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        biMetrics.wonValDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {biMetrics.wonValDiff >= 0 ? '▲ +' : '▼ '}{(biMetrics.wonValPct || 0).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Ciclo Médio */}
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 block truncate">Ciclo Médio</span>
                    <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100">{biMetrics?.avgCycleDays || 58} dias</span>
                  </div>
                  {compareStartDate && compareEndDate && biMetrics?.avgCycleDaysDiff !== null && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium truncate">vs {biMetrics.compLabel || 'ant.'}: <strong>{biMetrics.avgCycleDaysComp || 58}d</strong></span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        biMetrics.avgCycleDaysDiff <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {biMetrics.avgCycleDaysDiff <= 0 ? `${biMetrics.avgCycleDaysDiff}d` : `+${biMetrics.avgCycleDaysDiff}d`}
                      </span>
                    </div>
                  )}
                </div>

                {/* 4. Ticket Médio */}
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 block truncate">Ticket Médio</span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate block">
                      R$ {(biMetrics?.ticketMedio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {compareStartDate && compareEndDate && biMetrics?.ticketMedioDiff !== null && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 dark:text-slate-400 font-medium truncate">vs {biMetrics.compLabel || 'ant.'}: <strong>R$ {((biMetrics.ticketMedioComp || 0) / 1000).toFixed(1)}k</strong></span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        biMetrics.ticketMedioDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {biMetrics.ticketMedioDiff >= 0 ? '▲ +' : '▼ '}{(biMetrics.ticketMedioPct || 0).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* 5. Negócios Perdidos */}
                <div className="bg-rose-50/50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 border-l-4 border-l-rose-500 rounded-xl p-3.5 flex flex-col justify-between hover:border-rose-300 dark:hover:border-rose-700 transition-colors">
                  <div>
                    <span className="text-[11px] text-rose-700 dark:text-slate-400 font-semibold mb-1 block truncate">Negócios Perdidos</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-extrabold text-rose-950 dark:text-slate-100">{biMetrics?.lostCount || 0}</span>
                      <span className="text-[10px] font-medium text-rose-700/80 dark:text-slate-400/80">
                        (R$ {(biMetrics?.lostValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </span>
                    </div>
                  </div>
                  {compareStartDate && compareEndDate && (
                    <div className="mt-2 pt-2 border-t border-rose-200/60 dark:border-rose-800/50 flex items-center justify-between text-[10px]">
                      <span className="text-rose-700/80 dark:text-slate-400/80 font-medium truncate">vs {biMetrics.compLabel || 'ant.'}: <strong>{biMetrics.lostCountComp || 0}</strong></span>
                      <span className="font-bold text-rose-800 dark:text-slate-200">
                        {biMetrics.lostQtyDiff <= 0 ? '0' : `+${biMetrics.lostQtyDiff}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* 6. Taxa de Conversão */}
                <div className="bg-indigo-50/50 dark:bg-slate-900 border border-indigo-200/80 dark:border-slate-700 border-l-4 border-l-indigo-500 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-slate-600 transition-colors">
                  <div>
                    <span className="text-[11px] text-indigo-700 dark:text-slate-400 font-semibold mb-1 block truncate">Taxa Conversão</span>
                    <span className="text-xl font-extrabold text-indigo-950 dark:text-slate-100">{(biMetrics?.convRate || 0).toFixed(1)}%</span>
                  </div>
                  {compareStartDate && compareEndDate && biMetrics?.convRateDiff !== null && (
                    <div className="mt-2 pt-2 border-t border-indigo-200/60 dark:border-slate-700/50 flex items-center justify-between text-[10px]">
                      <span className="text-indigo-700/80 dark:text-slate-400/80 font-medium truncate">vs {biMetrics.compLabel || 'ant.'}: <strong>{(biMetrics.convRateComp || 0).toFixed(1)}%</strong></span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        biMetrics.convRateDiff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {biMetrics.convRateDiff >= 0 ? `+${biMetrics.convRateDiff.toFixed(1)}pp` : `${biMetrics.convRateDiff.toFixed(1)}pp`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Gráfico de Linha Temporal */}
              <div className="h-64 w-full pt-2">
                <canvas ref={seasonalityCanvasRef}></canvas>
              </div>

              {/* Rodapé com ação */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button className="text-indigo-600 dark:text-indigo-400 font-bold hover:text-indigo-800 dark:hover:text-indigo-300 text-xs flex items-center gap-1 transition-colors cursor-pointer">
                  <span>Ver lista completa</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {loadingDashboard ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-20">
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Carregando dados consolidados...</p>
              </div>
            ) : !commercialData || commercialData.length === 0 ? (
              <div className="flex-1 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-16 text-center flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto my-10 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-3xl">📊</div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Nenhum dado encontrado</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Não existem itens de propostas criadas no período de {new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}.</p>
                </div>
              </div>
            ) : (
              <React.Fragment>
                {/* BLOCO 2 (GRID 2 COLUNAS): DISTRIBUIÇÃO POR DISTRIBUIDOR e DISTRIBUIÇÃO POR FABRICANTE */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Gráfico A: Distribuidor */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200 dark:hover:border-slate-700">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Distribuição por Distribuidor</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Faturamento total acumulado agrupado por Distribuidor</p>
                      </div>
                      <div className="relative">
                        <select
                          value={selectedDistributorFilter}
                          onChange={(e) => setSelectedDistributorFilter(e.target.value)}
                          className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
                        >
                          <option value="all">Todos</option>
                          {Array.from(new Set(
                            (commercialData || [])
                              .map(item => {
                                const distObj = Array.isArray(item.distribuidores) ? item.distribuidores[0] : item.distribuidores;
                                return (distObj?.nome || 'NÃO INFORMADO').trim().toUpperCase();
                              })
                              .filter(f => f && f !== 'NÃO INFORMADO')
                          )).sort((a, b) => a.localeCompare(b)).map(dist => (
                            <option key={dist} value={dist}>{dist}</option>
                          ))}
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-slate-400">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="relative h-64 w-full flex items-center justify-center">
                      <canvas ref={distributorCanvasRef}></canvas>
                      <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</span>
                        <span className="text-lg font-black text-slate-900 dark:text-slate-100">{formatValueCompact(distributorTotalSum)}</span>
                      </div>
                    </div>
                    {/* Legenda HTML Customizada */}
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/80 max-h-40 overflow-y-auto pr-2">
                      {Object.keys(distributorTotals).map((label, idx) => {
                        const val = distributorTotals[label];
                        const percent = distributorTotalSum > 0 ? Math.round((val / distributorTotalSum) * 100) : 0;
                        const color = chartColors[idx % chartColors.length];
                        return (
                          <div key={label} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center space-x-2 truncate mr-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-slate-800 dark:text-slate-200 truncate">{label}</span>
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{percent}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Gráfico B: Fabricante */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200 dark:hover:border-slate-700">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Distribuição por Fabricante</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Faturamento total acumulado agrupado por Fabricante</p>
                      </div>
                      <div className="relative">
                        <select
                          value={selectedManufacturerFilter}
                          onChange={(e) => setSelectedManufacturerFilter(e.target.value)}
                          className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
                        >
                          <option value="all">Todos</option>
                          {Array.from(new Set(
                            (commercialData || [])
                              .map(item => {
                                const prodObj = Array.isArray(item.produtos) ? item.produtos[0] : item.produtos;
                                return (prodObj?.fabricante || '').trim().toUpperCase();
                              })
                              .filter(f => f && f !== 'NÃO INFORMADO')
                          )).sort((a, b) => a.localeCompare(b)).map(fab => (
                            <option key={fab} value={fab}>{fab}</option>
                          ))}
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-slate-400">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="relative h-64 w-full flex items-center justify-center">
                      <canvas ref={manufacturerCanvasRef}></canvas>
                      <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</span>
                        <span className="text-lg font-black text-slate-900 dark:text-slate-100">{formatValueCompact(manufacturerTotalSum)}</span>
                      </div>
                    </div>
                    {/* Legenda HTML Customizada */}
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/80 max-h-40 overflow-y-auto pr-2">
                      {Object.keys(manufacturerTotals).map((label, idx) => {
                        const val = manufacturerTotals[label];
                        const percent = manufacturerTotalSum > 0 ? Math.round((val / manufacturerTotalSum) * 100) : 0;
                        const color = chartColors[idx % chartColors.length];
                        return (
                          <div key={label} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center space-x-2 truncate mr-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-slate-800 dark:text-slate-200 truncate">{label}</span>
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{percent}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* BLOCO 3: PRODUTOS MAIS VENDIDOS */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200 dark:hover:border-slate-700 shadow-sm shadow-slate-100/50">
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">Produtos Mais Vendidos</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Participação por categoria de solução comercial</p>
                    </div>
                    <div className="relative">
                      <select
                        value={topProductsFilterMode}
                        onChange={(e) => setTopProductsFilterMode(e.target.value)}
                        className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
                      >
                        <option value="value">Por valor</option>
                        <option value="qty">Por quantidade</option>
                      </select>
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {topProductsAggregated.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nenhum produto vendido em propostas ganhas no período selecionado.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                      {/* Legenda (Esquerda - col-span-7) */}
                      <div className="md:col-span-7 space-y-2.5 max-h-64 overflow-y-auto pr-2">
                        {topProductsAggregated.map(prod => (
                          <div key={prod.name} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors border border-slate-200/60 dark:border-slate-700/60">
                            <div className="flex items-center space-x-2.5 truncate mr-2">
                              <span className="w-3 h-3 rounded shrink-0 shadow-sm" style={{ backgroundColor: prod.color }} />
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide truncate">{prod.name}</span>
                            </div>
                            <div className="flex items-center space-x-3 text-xs shrink-0">
                              <span className="text-slate-500 dark:text-slate-300 font-medium">
                                {topProductsFilterMode === 'value'
                                  ? `R$ ${prod.val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                                  : `${prod.qty} un.`}
                              </span>
                              <span className="font-extrabold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                                {prod.pctStr}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Gráfico Doughnut (Direita - col-span-5) */}
                      <div className="md:col-span-5 relative h-64 w-full flex items-center justify-center">
                        <canvas ref={topProductsCanvasRef}></canvas>
                        <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Categorias</span>
                          <span className="text-xl font-black text-slate-900 dark:text-slate-100">{topProductsAggregated.length} Ativas</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </React.Fragment>
            )}
          </main>
        )}

        {/* ABA 1: TABULEIRO KANBAN (PIPELINE DE VENDAS) */}
        {activeTab === 'kanban' && (
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 min-h-0 overflow-hidden">
            {loadingKanban ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Carregando oportunidades...</p>
              </div>
            ) : (
              <React.Fragment>
                <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80 flex-shrink-0 space-y-3 md:space-y-0 shadow-md shadow-slate-100/60">
                  <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Exibir Estágios:</span>
                    <button
                      onClick={() => { setDealsListStatus('Congelado'); setShowDealsList(true); setShowForecast(false); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                        showDealsList && dealsListStatus === 'Congelado'
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <span>❄️ Congelado</span>
                    </button>
                    <button
                      onClick={() => { setDealsListStatus('Todos'); setShowDealsList(true); setShowForecast(false); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                        showDealsList && dealsListStatus === 'Todos'
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-500'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <span>📋 Lista Completa</span>
                    </button>

                    <button
                      onClick={() => setShowNovaOportunidadeKanban(true)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <span>+ Nova Oportunidade</span>
                    </button>

                    {/* Lupa de Busca Expansível no Kanban — também funciona como
                        filtro por responsável embutido: digitar um nome que
                        bata com um vendedor sugere "Filtrar por responsável"
                        logo abaixo; selecionar troca a caixa por um chip que
                        filtra o board por ele (ver kanbanFilterResponsavelId).
                        Evita adicionar um controle novo na tela — mesmo
                        mecanismo de sempre, só mais esperto. */}
                    <div className="relative flex items-center ml-1">
                      {!isSearchOpen && !kanbanFilterResponsavelId ? (
                        <button
                          onClick={() => setIsSearchOpen(true)}
                          className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-600 dark:text-slate-300 hover:text-indigo-600 rounded-full transition-all shadow-sm flex items-center justify-center cursor-pointer"
                          title="Buscar negócio por nome ou filtrar por responsável..."
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                      ) : kanbanFilterResponsavelId ? (
                        <div className="flex items-center bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700 rounded-full pl-3 pr-2 py-1 shadow-sm gap-1.5">
                          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">👤 {kanbanFilterResponsavelNome}</span>
                          <button
                            onClick={() => { setKanbanFilterResponsavelId(null); setKanbanFilterResponsavelNome(''); }}
                            className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 text-xs font-bold cursor-pointer"
                            title="Remover filtro de responsável"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="flex items-center bg-white dark:bg-slate-800 border border-indigo-500 rounded-full px-3 py-1 shadow-sm transition-all duration-300 w-64">
                            <svg className="w-3.5 h-3.5 text-indigo-500 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                              type="text"
                              autoFocus
                              value={kanbanSearchTerm}
                              onChange={(e) => setKanbanSearchTerm(e.target.value)}
                              placeholder="Buscar negócio ou responsável..."
                              className="bg-transparent border-none text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-medium"
                            />
                            <button
                              onClick={() => {
                                setKanbanSearchTerm('');
                                setIsSearchOpen(false);
                              }}
                              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-bold ml-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                          {kanbanSearchTerm.trim().length > 0 && (() => {
                            const termo = kanbanSearchTerm.trim().toLowerCase();
                            const sugestoes = vendedoresVisiveis.filter(v => (v.nome || '').toLowerCase().includes(termo)).slice(0, 3);
                            if (sugestoes.length === 0) return null;
                            return (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 overflow-hidden py-1">
                                {sugestoes.map(v => (
                                  <button
                                    key={v.id}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setKanbanFilterResponsavelId(String(v.id));
                                      setKanbanFilterResponsavelNome(v.nome);
                                      setKanbanSearchTerm('');
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <span>👤</span>
                                    <span>Filtrar por responsável: <strong>{v.nome}</strong></span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ordenar por:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          safeStorage.setItem('crm_sort_order', newValue);
                          setSortBy(newValue);
                        }}
                        className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="default">Padrão</option>
                        <option value="name">Nome (A - Z)</option>
                        <option value="value_asc">Valor (Menor para Maior)</option>
                        <option value="value_desc">Valor (Maior para Menor)</option>
                      </select>
                    </div>

                    <button 
                      onClick={() => {
                        const nextVal = !showForecast;
                        console.log("[DEBUG] Forecast clicked, state is now:", nextVal);
                        setShowForecast(nextVal);
                        if (nextVal) {
                          setShowDealsList(false);
                        } else {
                          setFilterStage(null);
                          setFilterFabricante(null);
                        }
                      }}
                      className={`mr-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showForecast ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                    >
                      📈 Forecast
                    </button>
                  </div>
                </div>

                {showDealsList && (
                  <DealsListView
                    kanbanTasks={kanbanTasks}
                    kanbanColumns={kanbanColumns}
                    getTaskOptionId={getTaskOptionId}
                    getOpportunityValue={getOpportunityValue}
                    onCardClick={handleCardClick}
                    statusFilter={dealsListStatus}
                    setStatusFilter={setDealsListStatus}
                    onClose={() => setShowDealsList(false)}
                    supabaseClient={supabaseClient}
                    kanbanFilterResponsavelId={kanbanFilterResponsavelId}
                  />
                )}

                {!showDealsList && showForecast && (
                  <ForecastFunnelPanel
                    kanbanColumns={kanbanColumns}
                    kanbanTasks={kanbanTasks}
                    filterStage={filterStage}
                    setFilterStage={setFilterStage}
                    filterFabricante={filterFabricante}
                    setFilterFabricante={setFilterFabricante}
                    kanbanSearchTerm={kanbanSearchTerm}
                    kanbanFilterResponsavelId={kanbanFilterResponsavelId}
                    getTaskOptionId={getTaskOptionId}
                    getOpportunityValue={getOpportunityValue}
                    onCardClick={handleCardClick}
                  />
                )}

                {/* Kanban Board: oculto quando Split View do Forecast ou Lista de Negócios está ativa */}
                {!showDealsList && !(showForecast && filterStage) && (
                <div className="kanban-board flex-1 min-h-0 overflow-x-auto">
                  {kanbanColumns.map(col => {
                    if (filterStage && col.id !== filterStage) return null;
                    const colName = col.name.toLowerCase();
                    if (colName.includes("ganho") || colName.includes("perdido") || colName.includes("congelado")) return null;

                    const tasksInCol = kanbanTasks.filter(t => {
                      const inCol = getTaskOptionId(t, kanbanColumns) === col.id;
                      if (!inCol) return false;
                      if (kanbanFilterResponsavelId && String(t.responsavel_clickup_id) !== kanbanFilterResponsavelId) return false;
                      return taskMatchesSearchTerm(t, kanbanSearchTerm.toLowerCase().trim());
                    });
                    
                    const sortedTasks = [...tasksInCol].sort((a, b) => {
                      if (sortBy === 'name') {
                        return a.name.localeCompare(b.name);
                      }
                      if (sortBy === 'value_asc' || sortBy === 'value_desc') {
                        const valA = getOpportunityValue(a) || 0;
                        const valB = getOpportunityValue(b) || 0;
                        if (valA === 0 && valB !== 0) return 1;
                        if (valB === 0 && valA !== 0) return -1;
                        if (valA === 0 && valB === 0) return 0;
                        return sortBy === 'value_asc' ? valA - valB : valB - valA;
                      }
                      return 0;
                    });

                    return (
                      <div key={col.id} className="kanban-column">
                        <div className="kanban-column-header">
                          <div className="flex items-center space-x-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color || '#fff' }}></span>
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{col.name}</span>
                          </div>
                          <span className="bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full text-xs font-bold text-indigo-600">
                            {tasksInCol.length}
                          </span>
                        </div>
                        <div 
                          data-option-id={col.id}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDrop(e, col.id)}
                          className="kanban-cards"
                        >
                          {sortedTasks.map(task => {
                            const dealValue = getOpportunityValue(task);
                            const formattedValue = dealValue !== null && dealValue !== undefined
                              ? `R$ ${Number(dealValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                              : 'R$ 0,00';
                            const responsavel = task.responsavel_negocio;
                             const hasOverdue = commercialTasks.some(t => {
                               const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
                               const isThisDeal = t.clickup_negocio_id === task.id || (propObj && propObj.clickup_negocio_id === task.id);
                               return isThisDeal && t.status === 'pendente' && new Date(t.data_vencimento) < new Date();
                             });
                             return (
                               <KanbanCard
                                 key={task.id}
                                 task={task}
                                 dealValue={dealValue}
                                 formattedValue={formattedValue}
                                 responsavel={responsavel}
                                 handleDragStart={handleDragStart}
                                 handleCardClick={handleCardClick}
                                 hasOverdue={hasOverdue}
                                 stageColor={col.color}
                               />
                             );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}

                {showNovaOportunidadeKanban && (
                  <NovaOportunidadeModal
                    supabaseClient={supabaseClient}
                    contaFixa={null}
                    contas={contasParaBusca}
                    vendedores={vendedoresVisiveis}
                    onClose={() => setShowNovaOportunidadeKanban(false)}
                    onCriado={() => {
                      setShowNovaOportunidadeKanban(false);
                      fetchKanbanData();
                    }}
                  />
                )}
              </React.Fragment>
            )}
          </div>
        )}

        {empresasTabMounted && (
          <div className={activeTab === 'empresas' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
            <EmpresasTab
              supabaseClient={supabaseClient}
              onOpenNegocio={handleCardClick}
              vendedores={vendedoresVisiveis}
              contaParaAbrir={contaParaAbrir}
              abaParaAbrir={abaContaParaAbrir}
              onContaAberta={() => { setContaParaAbrir(null); setAbaContaParaAbrir('visao_geral'); }}
            />
          </div>
        )}

        {activeTab === 'tasks' && (() => {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
          const todayStr = startOfToday.toDateString();

          // Helper para saber se uma data venceu
          const isTaskOverdue = (dateStr) => {
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            // Se tiver hora específica (diferente de meia-noite), compara com o horário atual
            const hasExplicitTime = dateStr.includes('T') && !dateStr.endsWith('T00:00:00') && !dateStr.endsWith('T00:00:00.000Z');
            if (hasExplicitTime) return d < now;
            // Se for só data sem hora, só vence quando o dia encerra (ou seja, se a data for anterior a hoje)
            return d < startOfToday;
          };

          const filtered = commercialTasks.filter(task => {
            if (tasksFilterAssignee !== 'all' && String(task.responsavel_clickup_id) !== tasksFilterAssignee) return false;
            if (!tasksShowCompleted && task.status === 'concluida') return false;

            if (tasksPeriodFilter !== 'all') {
              const taskDate = task.data_vencimento ? new Date(task.data_vencimento) : null;
              if (!taskDate || isNaN(taskDate.getTime())) return false;

              if (tasksPeriodFilter === 'today') {
                if (taskDate.toDateString() !== todayStr) return false;
              } else if (tasksPeriodFilter === 'overdue') {
                if (task.status === 'concluida' || !isTaskOverdue(task.data_vencimento)) return false;
              } else if (tasksPeriodFilter === 'week') {
                const dayOfWeek = startOfToday.getDay();
                const startOfWeek = new Date(startOfToday);
                startOfWeek.setDate(startOfToday.getDate() - dayOfWeek);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);
                if (taskDate < startOfWeek || taskDate > endOfWeek) return false;
              } else if (tasksPeriodFilter === 'month') {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                if (taskDate < startOfMonth || taskDate > endOfMonth) return false;
              } else if (tasksPeriodFilter === 'custom') {
                if (tasksCustomStartDate) {
                  const s = new Date(`${tasksCustomStartDate}T00:00:00`);
                  if (taskDate < s) return false;
                }
                if (tasksCustomEndDate) {
                  const e = new Date(`${tasksCustomEndDate}T23:59:59.999`);
                  if (taskDate > e) return false;
                }
              }
            }

            return true;
          });

          // Sem duplicar tarefas vencidas em Hoje
          const overdueItems = filtered.filter(t => t.status !== 'concluida' && isTaskOverdue(t.data_vencimento));
          const todayItems = filtered.filter(t => t.status !== 'concluida' && new Date(t.data_vencimento).toDateString() === todayStr && !isTaskOverdue(t.data_vencimento));
          const pendingItems = filtered.filter(t => t.status !== 'concluida');
          const doneItems = filtered.filter(t => t.status === 'concluida');

          const getTaskNegocio = (task) => {
            const localProps = (typeof propostas !== 'undefined' && Array.isArray(propostas) ? propostas : []);
            let matchedProp = localProps.find(p =>
              (task.proposta_id && p.id === task.proposta_id) ||
              (task.clickup_negocio_id && p.clickup_negocio_id === task.clickup_negocio_id)
            );
            if (matchedProp) return matchedProp.nome_projeto || matchedProp.projeto || 'Projeto';
            const activeKanbanCards = (typeof kanbanTasks !== 'undefined' ? kanbanTasks : null) || [];
            const matchedKanbanCard = Array.isArray(activeKanbanCards) && activeKanbanCards.find(c =>
              c.id === task.clickup_negocio_id || c.clickup_id === task.clickup_negocio_id
            );
            if (matchedKanbanCard) return matchedKanbanCard.name || matchedKanbanCard.nome || 'Projeto';
            if (task.nome_projeto && task.nome_projeto !== 'Sem Proposta') return task.nome_projeto;
            const propObj = Array.isArray(task.propostas) ? task.propostas[0] : task.propostas;
            return propObj?.nome_projeto || task.proposta?.nome_projeto || 'Sem Projeto';
          };

          const typeConfig = {
            'Ligação':   { dot: 'bg-indigo-500',  bg: 'bg-indigo-50',   text: 'text-indigo-700',   border: 'border-indigo-200', Icon: (typeof IconPhone !== 'undefined' ? IconPhone : null) },
            'Reunião':   { dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200', Icon: (typeof IconUsers !== 'undefined' ? IconUsers : null) },
            'E-mail':    { dot: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',   Icon: (typeof IconMail !== 'undefined' ? IconMail : null) },
            'Follow-up': { dot: 'bg-rose-500',    bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200',    Icon: (typeof IconRefresh !== 'undefined' ? IconRefresh : null) },
            'Visita':    { dot: 'bg-violet-500',  bg: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200',  Icon: (typeof IconMapPin !== 'undefined' ? IconMapPin : null) },
            'Proposta':  { dot: 'bg-sky-500',     bg: 'bg-sky-50',      text: 'text-sky-700',      border: 'border-sky-200',     Icon: (typeof IconDocument !== 'undefined' ? IconDocument : null) },
          };
          // Tipo de tarefa é texto livre, editável pelo usuário (Configurações →
          // Tipos de Tarefa) — sem essa normalização, uma variação como "Follow Up"
          // (sem hífen) não bate com a chave 'Follow-up' acima e cai sempre no
          // fallback genérico (ícone/cor errados), mesmo sendo claramente o mesmo
          // tipo. Compara ignorando espaço/hífen e maiúsculas.
          const normalizeTypeKey = (s) => (s || '').toLowerCase().replace(/[\s-]+/g, '');
          const typeConfigByNormalizedKey = Object.fromEntries(
            Object.entries(typeConfig).map(([k, v]) => [normalizeTypeKey(k), v])
          );

          const formatTaskDate = (dateStr) => {
            const d = new Date(dateStr);
            const dStr = d.toDateString();
            const diffMs = d - now;
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (dStr === todayStr) return { label: 'Hoje ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}), urgent: 'today' };
            if (diffDays < 0) return { label: `Venceu há ${Math.abs(diffDays)}d`, urgent: 'overdue' };
            if (diffDays === 1) return { label: 'Amanhã', urgent: 'soon' };
            if (diffDays <= 3) return { label: `Em ${diffDays} dias`, urgent: 'soon' };
            return { label: d.toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'}), urgent: 'normal' };
          };

          const TaskCard = ({ task }) => {
            const isDone = task.status === 'concluida';
            const tc = typeConfigByNormalizedKey[normalizeTypeKey(task.tipo)] || { dot: 'bg-slate-400', bg: 'bg-slate-50 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', Icon: (typeof IconDocument !== 'undefined' ? IconDocument : null) };
            const matchedUser = vendedores.find(v => String(v.id) === String(task.responsavel_clickup_id));
            const assigneeName = matchedUser ? matchedUser.nome : '—';
            const negocio = getTaskNegocio(task);
            const { label: dateLabel, urgent } = formatTaskDate(task.data_vencimento);

            const urgencyConfig = {
              overdue: { bg: 'bg-rose-100',   text: 'text-rose-700',   ring: 'ring-rose-200' },
              today:   { bg: 'bg-amber-100',  text: 'text-amber-700',  ring: 'ring-amber-200' },
              soon:    { bg: 'bg-sky-50',     text: 'text-sky-700',    ring: 'ring-sky-200' },
              normal:  { bg: 'bg-slate-100 dark:bg-slate-700',  text: 'text-slate-500 dark:text-slate-400',  ring: 'ring-slate-200 dark:ring-slate-700' },
            };
            const uc = urgencyConfig[urgent] || urgencyConfig.normal;

            return (
              <div className={`group relative bg-white dark:bg-slate-800 rounded-xl border transition-all duration-200 hover:shadow-md ${isDone ? 'opacity-60 border-slate-200 dark:border-slate-700' : 'border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-200/80'}`}>
                {/* Barra lateral de urgência */}
                {!isDone && (
                  <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${
                    urgent === 'overdue' ? 'bg-rose-500' : urgent === 'today' ? 'bg-amber-400' : urgent === 'soon' ? 'bg-sky-400' : 'bg-slate-200 dark:bg-slate-600'
                  }`} />
                )}

                <div className="flex items-center gap-3 p-4 pl-5">
                  {/* Checkbox */}
                  <div className="flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleTaskStatus(task)}
                      className="w-4.5 h-4.5 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* Conteúdo Principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Título */}
                        <p className={`text-sm font-bold leading-snug truncate ${isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                          {task.titulo}
                        </p>
                        {/* Negócio associado */}
                        {negocio && negocio !== 'Sem Projeto' && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium mt-0.5 truncate flex items-center gap-1">
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            {negocio}
                          </p>
                        )}
                      </div>

                      {/* Lado direito: metadados + ações */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Badge de tipo */}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tc.bg} ${tc.text} ${tc.border}`}>
                          {tc.Icon && <tc.Icon size={10} />}
                          <span>{task.tipo}</span>
                        </span>

                        {/* Data de vencimento */}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${uc.bg} ${uc.text}`}>
                          {urgent === 'overdue' && (
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                          {urgent === 'today' && (
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          {dateLabel}
                        </span>

                        {/* Avatar do responsável — mesmo componente colorido por pessoa usado no Kanban/Empresas */}
                        <div className="flex items-center gap-1.5" title={assigneeName}>
                          {typeof AvatarInicial !== 'undefined' ? (
                            <AvatarInicial nome={assigneeName !== '—' ? assigneeName : ''} size="xs" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-[9px] font-extrabold flex-shrink-0 shadow-sm">
                              {assigneeName !== '—' ? assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?'}
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditTaskClick(task)}
                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          };

          return (
            <div className="flex-1 flex flex-col bg-slate-50/80 dark:bg-slate-900/80 overflow-hidden">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 bg-white dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Tarefas</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Atividades integradas ao ClickUp</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Filtro de Período */}
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5">
                      <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <select
                        value={tasksPeriodFilter}
                        onChange={(e) => setTasksPeriodFilter(e.target.value)}
                        className="bg-transparent border-none text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="all">Todas as Datas</option>
                        <option value="today">Hoje</option>
                        <option value="week">Esta Semana</option>
                        <option value="month">Este Mês</option>
                        <option value="overdue">Apenas Vencidas</option>
                        <option value="custom">📅 Período Personalizado</option>
                      </select>
                    </div>

                    {/* Datas Customizadas quando o filtro de período é 'custom' — mesmo
                        padrão visual (label em caixa + input em caixa) do filtro de
                        período do Relatórios, ver "Personalizar período" ali. Filtro
                        aqui é 100% local (sem necessidade de botão "Filtrar"). */}
                    {tasksPeriodFilter === 'custom' && (
                      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-2.5 shadow-lg">
                        <div className="flex items-center space-x-2">
                          <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">De</label>
                          <input
                            type="date"
                            value={tasksCustomStartDate}
                            onChange={(e) => setTasksCustomStartDate(e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Até</label>
                          <input
                            type="date"
                            value={tasksCustomEndDate}
                            onChange={(e) => setTasksCustomEndDate(e.target.value)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                          />
                        </div>
                      </div>
                    )}

                    {/* Filtro de responsável */}
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5">
                      <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <select
                        value={tasksFilterAssignee}
                        onChange={(e) => setTasksFilterAssignee(e.target.value)}
                        className="bg-transparent border-none text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="all">Todos Responsáveis</option>
                        {vendedoresVisiveis.map(v => (
                          <option key={v.id} value={String(v.id)}>{v.nome}</option>
                        ))}
                      </select>
                    </div>

                    {/* Toggle concluídas */}
                    <button
                      onClick={() => setTasksShowCompleted(!tasksShowCompleted)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        tasksShowCompleted
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                      {tasksShowCompleted ? 'Ocultar Concluídas' : 'Ver Concluídas'}
                    </button>

                    {/* Nova Tarefa */}
                    <button
                      onClick={() => {
                        setSelectedProposalForTask(null);
                        setSearchProposalQuery('');
                        setProposalSearchResults([]);
                        setShowNewTaskModal(true);
                      }}
                      className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 cursor-pointer flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                      </svg>
                      Nova Tarefa
                    </button>
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest">Pendentes</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-200 mt-0.5">{pendingItems.length}</p>
                  </div>
                  <div className={`rounded-xl p-3.5 border ${overdueItems.length > 0 ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60' : 'bg-slate-50 dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/80'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${overdueItems.length > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400 dark:text-slate-400'}`}>Vencidas</p>
                    <p className={`text-2xl font-black mt-0.5 ${overdueItems.length > 0 ? 'text-rose-700 dark:text-slate-100' : 'text-slate-800 dark:text-slate-200'}`}>{overdueItems.length}</p>
                  </div>
                  <div className={`rounded-xl p-3.5 border ${todayItems.length > 0 ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60' : 'bg-slate-50 dark:bg-slate-900 border-slate-200/80 dark:border-slate-700/80'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${todayItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-400'}`}>Para Hoje</p>
                    <p className={`text-2xl font-black mt-0.5 ${todayItems.length > 0 ? 'text-amber-700 dark:text-slate-100' : 'text-slate-800 dark:text-slate-200'}`}>{todayItems.length}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest">Concluídas</p>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-200 mt-0.5">{doneItems.length}</p>
                  </div>
                </div>
              </div>

              {/* Lista de Tarefas */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingTasks ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-3">
                    <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Carregando tarefas...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      <svg className="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhuma tarefa encontrada</h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Crie uma nova tarefa para começar a registrar atividades comerciais.</p>
                    </div>
                    <button
                      onClick={() => { setSelectedProposalForTask(null); setSearchProposalQuery(''); setProposalSearchResults([]); setShowNewTaskModal(true); }}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      + Criar Primeira Tarefa
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6 max-w-4xl mx-auto">
                    {/* Seção: Vencidas */}
                    {overdueItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            <h3 className="text-xs font-extrabold text-rose-600 uppercase tracking-widest">Vencidas</h3>
                          </div>
                          <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">{overdueItems.length}</span>
                        </div>
                        <div className="space-y-2">
                          {overdueItems.map(task => <TaskCard key={task.id} task={task} />)}
                        </div>
                      </div>
                    )}

                    {/* Seção: Hoje */}
                    {todayItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <h3 className="text-xs font-extrabold text-amber-700 uppercase tracking-widest">Hoje</h3>
                          </div>
                          <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">{todayItems.length}</span>
                        </div>
                        <div className="space-y-2">
                          {todayItems.map(task => <TaskCard key={task.id} task={task} />)}
                        </div>
                      </div>
                    )}

                    {/* Seção: Próximas / Futuras */}
                    {(() => {
                      const upcoming = filtered.filter(t => t.status !== 'concluida' && new Date(t.data_vencimento).toDateString() !== todayStr && new Date(t.data_vencimento) >= now);
                      if (upcoming.length === 0) return null;
                      return (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-400" />
                              <h3 className="text-xs font-extrabold text-indigo-600 uppercase tracking-widest">Próximas</h3>
                            </div>
                            <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">{upcoming.length}</span>
                          </div>
                          <div className="space-y-2">
                            {upcoming.map(task => <TaskCard key={task.id} task={task} />)}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Seção: Concluídas */}
                    {tasksShowCompleted && doneItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            <h3 className="text-xs font-extrabold text-emerald-600 uppercase tracking-widest">Concluídas</h3>
                          </div>
                          <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">{doneItems.length}</span>
                        </div>
                        <div className="space-y-2">
                          {doneItems.map(task => <TaskCard key={task.id} task={task} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}


      </div>

      {/* 4. Modal de Configurações Completo */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-5xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/90 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative">
            <button 
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors z-10 cursor-pointer"
              title="Fechar (ESC)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Cabeçalho do Modal */}
            <div className="border-b border-slate-200/80 dark:border-slate-700/80 px-6 py-4 bg-slate-50/80 dark:bg-slate-900/80">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <div className="w-7 h-7 bg-indigo-500 text-white rounded-lg flex items-center justify-center shadow-xs">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                </div>
                <span>Painel de Configurações e Cadastros</span>
              </h3>
            </div>

            {/* Corpo do Modal com Abas Laterais */}
            <div className="flex-1 flex overflow-hidden">
              {/* Menu Lateral de Abas */}
              <aside className="w-1/4 border-r border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-1.5 flex flex-col">
                <button
                  onClick={() => setSettingsActiveTab('products')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'products'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-600/60'
                  }`}
                >
                  Catálogo de Produtos
                </button>
                <button
                  onClick={() => setSettingsActiveTab('distributors')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'distributors'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-600/60'
                  }`}
                >
                  Distribuidores
                </button>
                <button
                  onClick={() => setSettingsActiveTab('venders')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'venders'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-600/60'
                  }`}
                >
                  Vendedores
                </button>
                <button
                  onClick={() => setSettingsActiveTab('taskTypes')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'taskTypes'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-600/60'
                  }`}
                >
                  Tipos de Tarefas
                </button>
                <button
                  onClick={() => setSettingsActiveTab('numeracao')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'numeracao'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-600/60'
                  }`}
                >
                  Numeração de Propostas
                </button>
                <button
                  onClick={() => setSettingsActiveTab('segmentos')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'segmentos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-600/60'
                  }`}
                >
                  Segmentos de Atuação
                </button>
              </aside>

              {/* Área de Conteúdo da Aba Ativa */}
              <main className="flex-1 p-6 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30">
                {/* 2. ABA PRODUTOS */}
                {settingsActiveTab === 'products' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Catálogo de Produtos</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Gerencie o portfólio de ofertas e importe tabelas em lote.</p>
                      </div>
                      <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
                        {produtos.length} SKUs
                      </span>
                    </div>

                    {/* Cadastrar/Editar Produto */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-4 shadow-xs">
                      <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">
                        {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
                      </h3>
                      <form 
                        onSubmit={editingProduct ? handleSaveProductEdit : (e) => {
                          e.preventDefault();
                          supabaseClient.from('produtos').insert({
                            nome: newProduct.nome,
                            fabricante: newProduct.fabricante,
                            custo_referencia: parseFloat(newProduct.custo_referencia) || 0
                          }).then(({ error }) => {
                            if (error) {
                              showToast('Erro ao cadastrar produto. Fabricante e Nome duplicados?', 'error');
                            } else {
                              showToast('Produto cadastrado com sucesso!', 'success');
                              setNewProduct({ nome: '', fabricante: '', custo_referencia: '' });
                              loadProducts();
                            }
                          });
                        }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                      >
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">Fabricante</label>
                          <input 
                            type="text" 
                            required
                            placeholder="Ex: Dell Technologies"
                            value={editingProduct ? editingProduct.fabricante : newProduct.fabricante}
                            onChange={(e) => {
                              if (editingProduct) {
                                setEditingProduct({ ...editingProduct, fabricante: e.target.value });
                              } else {
                                setNewProduct({ ...newProduct, fabricante: e.target.value });
                              }
                            }}
                            className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">Nome do Produto</label>
                          <input 
                            type="text" 
                            required
                            placeholder="Ex: Licença VMware vSphere"
                            value={editingProduct ? editingProduct.nome : newProduct.nome}
                            onChange={(e) => {
                              if (editingProduct) {
                                setEditingProduct({ ...editingProduct, nome: e.target.value });
                              } else {
                                setNewProduct({ ...newProduct, nome: e.target.value });
                              }
                            }}
                            className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">Custo de Referência</label>
                            <input 
                              type="number" 
                              step="0.01"
                              required
                              placeholder="0.00"
                              value={editingProduct ? editingProduct.custo_referencia : newProduct.custo_referencia}
                              onChange={(e) => {
                                if (editingProduct) {
                                  setEditingProduct({ ...editingProduct, custo_referencia: e.target.value });
                                } else {
                                  setNewProduct({ ...newProduct, custo_referencia: e.target.value });
                                }
                              }}
                              className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 text-right font-mono"
                            />
                          </div>
                          <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs self-end h-[34px] cursor-pointer"
                          >
                            {editingProduct ? 'Salvar' : 'Cadastrar'}
                          </button>
                          {editingProduct && (
                            <button 
                              type="button"
                              onClick={() => setEditingProduct(null)}
                              className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all self-end h-[34px] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {/* Tabela de Produtos */}
                    <div className="max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            <th className="p-3">Fabricante</th>
                            <th className="p-3">Nome do Produto</th>
                            <th className="p-3 text-right">Preço de Referência</th>
                            <th className="p-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {produtos.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-6 text-center text-slate-400 dark:text-slate-500">Nenhum produto cadastrado.</td>
                            </tr>
                          ) : (
                            produtos.map(p => (
                              <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/80 transition-colors">
                                <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{p.fabricante}</td>
                                <td className="p-3 text-slate-900 dark:text-slate-100 font-medium">{p.nome}</td>
                                <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200 font-semibold">
                                  R$ {Number(p.custo_referencia).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </td>
                                <td className="p-3 text-center space-x-2">
                                  <button 
                                    onClick={() => setEditingProduct(p)}
                                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold cursor-pointer"
                                  >
                                    Editar
                                  </button>
                                  <span className="text-slate-300">•</span>
                                  <button 
                                    onClick={() => handleDeleteProduct(p.id)}
                                    className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-semibold cursor-pointer"
                                  >
                                    Excluir
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Importação em Lote */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-4 shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                          Importação de Produtos em Lote
                        </h3>
                        <div className="flex items-center space-x-2">
                          <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Formato:</label>
                          <select 
                            value={importFormat} 
                            onChange={(e) => setImportFormat(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-700 dark:text-slate-300 rounded-lg p-1 focus:outline-none cursor-pointer"
                          >
                            <option value="csv">CSV (Fabricante;Nome;Preço)</option>
                            <option value="xml">XML (&lt;produto&gt;)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <textarea 
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          rows="3"
                          className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 font-mono"
                          placeholder={
                            importFormat === 'csv' 
                              ? 'Dell Technologies;Servidor PowerEdge R760;25000.00\nVMware;Licença vSphere Standard;1200.50'
                              : '<produtos>\n  <produto>\n    <fabricante>Dell</fabricante>\n    <nome>Servidor R760</nome>\n    <custo>25000.00</custo>\n  </produto>\n</produtos>'
                          }
                        />
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            Cole as linhas ou a estrutura XML no campo de texto e clique em Processar Lote.
                          </p>
                          <button
                            onClick={handleBatchImport}
                            disabled={saving}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                          >
                            <span>Processar Lote</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. ABA DISTRIBUIDORES */}
                {settingsActiveTab === 'distributors' && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Distribuidores Autorizados</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Lista fechada de distribuidores no CRM.</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-4 shadow-xs">
                      <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">
                        {editingDistributor ? 'Editar Distribuidor' : 'Novo Distribuidor'}
                      </h3>
                      <form 
                        onSubmit={editingDistributor ? handleSaveDistributorEdit : handleCreateDistributor}
                        className="flex gap-2"
                      >
                        <input 
                          type="text" 
                          required
                          placeholder="Ex: Ingram Micro"
                          value={editingDistributor ? editingDistributor.nome : newDistributorName}
                          onChange={(e) => {
                            if (editingDistributor) {
                              setEditingDistributor({ ...editingDistributor, nome: e.target.value });
                            } else {
                              setNewDistributorName(e.target.value);
                            }
                          }}
                          className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                        />
                        <button 
                          type="submit"
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                          {editingDistributor ? 'Salvar' : 'Adicionar'}
                        </button>
                        {editingDistributor && (
                          <button 
                            type="button"
                            onClick={() => setEditingDistributor(null)}
                            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancelar
                          </button>
                        )}
                      </form>
                    </div>

                    <div className="max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            <th className="p-3">Nome</th>
                            <th className="p-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {distribuidores.length === 0 ? (
                            <tr>
                              <td colSpan="2" className="p-6 text-center text-slate-400 dark:text-slate-500">Nenhum distribuidor cadastrado.</td>
                            </tr>
                          ) : (
                            distribuidores.map(d => (
                              <tr key={d.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/80 transition-colors">
                                <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{d.nome}</td>
                                <td className="p-3 text-center space-x-2">
                                  <button 
                                    onClick={() => setEditingDistributor(d)}
                                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold cursor-pointer"
                                  >
                                    Editar
                                  </button>
                                  <span className="text-slate-300">•</span>
                                  <button 
                                    onClick={() => handleDeleteDistributor(d.id)}
                                    className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-semibold cursor-pointer"
                                  >
                                    Excluir
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. ABA VENDEDORES */}
                {settingsActiveTab === 'venders' && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Vendedores Cadastrados</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        Lista derivada automaticamente de quem está cadastrado no ClickUp e já fez login no CRM com o próprio token. Use "Ocultar" para remover alguém das listas de responsável sem afetar o cadastro.
                      </p>
                    </div>

                    <div className="max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            <th className="p-3">Nome</th>
                            <th className="p-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {vendedores.length === 0 ? (
                            <tr>
                              <td colSpan="2" className="p-6 text-center text-slate-400 dark:text-slate-500">Nenhum vendedor cadastrado.</td>
                            </tr>
                          ) : (
                            vendedores.map(v => (
                              <tr key={v.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/80 transition-colors">
                                <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{v.nome}</td>
                                <td className="p-3 text-center space-x-2">
                                  <button
                                    onClick={() => handleToggleOcultoVendedor(v)}
                                    className={`${v.oculto ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300' : 'text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300'} font-semibold cursor-pointer`}
                                    title={v.oculto ? "Exibir no CRM" : "Ocultar no CRM"}
                                  >
                                    {v.oculto ? "Exibir" : "Ocultar"}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. ABA TIPOS DE TAREFAS */}
                {settingsActiveTab === 'taskTypes' && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Tipos de Tarefas</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Cadastre tipos de atividades personalizadas para a equipe comercial.</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-4 shadow-xs">
                      <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">
                        Novo Tipo de Tarefa
                      </h3>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!newTaskTypeName.trim()) return;
                          const nome = newTaskTypeName.trim();
                          const emoji = newTaskTypeEmoji.trim() || '📋';
                          if (supabaseClient) {
                            const { error } = await supabaseClient.from('tipos_tarefa').insert({ nome, emoji });
                            if (error) {
                              showToast('Erro ao adicionar tipo de tarefa: ' + error.message, 'error');
                              return;
                            }
                            await loadTiposTarefa();
                          } else {
                            const novo = { id: Date.now().toString(), nome, emoji };
                            const atualizados = [...taskTypes, novo];
                            setTaskTypes(atualizados);
                            safeStorage.setItem('crm_cache_task_types', JSON.stringify(atualizados));
                          }
                          setNewTaskTypeName('');
                          setNewTaskTypeEmoji('');
                          showToast('Tipo de tarefa adicionado!', 'success');
                        }}
                        className="flex gap-2"
                      >
                        <input 
                          type="text" 
                          required
                          placeholder="Ex: WhatsApp"
                          value={newTaskTypeName}
                          onChange={(e) => setNewTaskTypeName(e.target.value)}
                          className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                        />
                        <select 
                          value={newTaskTypeEmoji}
                          onChange={(e) => setNewTaskTypeEmoji(e.target.value)}
                          className="w-36 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="">Emoji...</option>
                          <option value="📞">📞 Ligação</option>
                          <option value="👥">👥 Reunião</option>
                          <option value="📧">📧 E-mail</option>
                          <option value="🔄">🔄 Follow-up</option>
                          <option value="💬">💬 WhatsApp</option>
                          <option value="🚀">🚀 Prospecção</option>
                          <option value="📝">📝 Contrato</option>
                          <option value="🎯">🎯 Visita</option>
                          <option value="🤝">🤝 Fechamento</option>
                        </select>
                        <button 
                          type="submit"
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                          + Cadastrar
                        </button>
                      </form>
                    </div>

                    <div className="max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            <th className="p-3 w-16 text-center">Ícone</th>
                            <th className="p-3">Nome</th>
                            <th className="p-3 text-center w-24">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {taskTypes.length === 0 ? (
                            <tr>
                              <td colSpan="3" className="p-6 text-center text-slate-400 dark:text-slate-500">Nenhum tipo cadastrado.</td>
                            </tr>
                          ) : (
                            taskTypes.map(t => (
                              <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/80 transition-colors">
                                <td className="p-3 text-center text-base">{t.emoji}</td>
                                <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{t.nome}</td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={async () => {
                                      if (!confirm('Deseja realmente excluir este tipo de tarefa?')) return;
                                      if (supabaseClient) {
                                        const { error } = await supabaseClient.from('tipos_tarefa').delete().eq('id', t.id);
                                        if (error) {
                                          showToast('Erro ao excluir tipo de tarefa: ' + error.message, 'error');
                                          return;
                                        }
                                        await loadTiposTarefa();
                                      } else {
                                        const filtrados = taskTypes.filter(item => item.id !== t.id);
                                        setTaskTypes(filtrados);
                                        safeStorage.setItem('crm_cache_task_types', JSON.stringify(filtrados));
                                      }
                                      showToast('Tipo de tarefa excluído!', 'success');
                                    }}
                                    className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-semibold cursor-pointer"
                                  >
                                    Excluir
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. ABA NUMERAÇÃO DE PROPOSTAS */}
                {settingsActiveTab === 'numeracao' && (
                  <div className="space-y-6">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Numeração Interna de Propostas</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Controle a geração atômica de números sequenciais oficiais para novas oportunidades e propostas.</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-5 shadow-xs space-y-5">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Status da Numeração Automática</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Quando ativo, cada nova oportunidade receberá o próximo número sequencial (Ex: {(configNumeracao.ultimo_numero || 13202) + 1}/{new Date().getFullYear()}).</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={configNumeracao.ativo}
                            onChange={async (e) => {
                              const novoAtivo = e.target.checked;
                              const { data, error } = await supabaseClient.rpc('ajustar_numeracao_proposta', { novo_ativo: novoAtivo });
                              if (!error && data && data[0]) {
                                setConfigNumeracao(data[0]);
                                showToast(`Numeração automática ${novoAtivo ? 'ativada' : 'desativada'}!`, 'success');
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-slate-800 after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>

                      <div className="pt-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Último Número Emitido</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={configNumeracao.ultimo_numero || ''}
                            onChange={(e) => setConfigNumeracao({ ...configNumeracao, ultimo_numero: parseInt(e.target.value) || 0 })}
                            className="w-48 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const { data, error } = await supabaseClient.rpc('ajustar_numeracao_proposta', { novo_numero: configNumeracao.ultimo_numero });
                              if (!error && data && data[0]) {
                                setConfigNumeracao(data[0]);
                                showToast('Último número atualizado com sucesso!', 'success');
                              } else {
                                showToast('Erro ao atualizar: ' + (error?.message || ''), 'error');
                              }
                            }}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                          >
                            Salvar Número
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">O próximo negócio criado receberá o número: <strong className="text-indigo-600 font-mono">{(configNumeracao.ultimo_numero || 0) + 1}/{new Date().getFullYear()}</strong></p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. ABA SEGMENTOS DE ATUAÇÃO */}
                {settingsActiveTab === 'segmentos' && (
                  <SegmentosSettings client={supabaseClient} />
                )}
              </main>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal de Adicionar Novo Item no Catálogo */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/90 rounded-2xl shadow-2xl p-6 relative">
            <button 
              type="button"
              onClick={() => setShowProductModal(false)}
              className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Fechar (ESC)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 mb-1">Adicionar Novo Produto</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Adicione um novo produto ou licença ao catálogo do sistema.</p>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nome do Produto</label>
                <input 
                  type="text" 
                  required
                  value={newProduct.nome}
                  onChange={(e) => setNewProduct({ ...newProduct, nome: e.target.value })}
                  placeholder="Ex: Servidor Dell PowerEdge R760"
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Fabricante</label>
                  <input 
                    type="text" 
                    required
                    value={newProduct.fabricante}
                    onChange={(e) => setNewProduct({ ...newProduct, fabricante: e.target.value })}
                    placeholder="Ex: Dell Technologies"
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Custo de Referência</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-400 dark:text-slate-500 font-semibold">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={newProduct.custo_referencia}
                      onChange={(e) => setNewProduct({ ...newProduct, custo_referencia: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 pl-8 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-950/30 transition-all"
              >
                Cadastrar Produto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal de Fechamento (Ganho ou Perdido) */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowCloseModal(false)}
              className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-bold text-white mb-2">
              {showCloseModal === 'win' ? '🏆 Fechamento - Proposta Ganha' : '😞 Fechamento - Proposta Perdida'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              {showCloseModal === 'win' 
                ? 'Insira os dados do fechamento do negócio ganho.' 
                : 'Insira o principal motivo e a data do fechamento do negócio perdido.'}
            </p>

            <div className="space-y-4">
              {/* Se for Perdida, exibe o Dropdown de motivo */}
              {showCloseModal === 'loss' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Motivo da Perda</label>
                  <select 
                    value={selectedLossReason}
                    onChange={(e) => setSelectedLossReason(e.target.value)}
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Selecione o motivo...</option>
                    <option value="Preço Alto">Preço Alto</option>
                    <option value="Prazo de Entrega">Prazo de Entrega</option>
                    <option value="Perdido para Concorrência">Perdido para Concorrência</option>
                    <option value="Projeto Cancelado pelo Cliente">Projeto Cancelado pelo Cliente</option>
                    <option value="Falta de Verba/Budget">Falta de Verba/Budget</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              )}

              {/* Data de Fechamento */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Data do Fechamento</label>
                <input 
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button 
                onClick={handleConfirmClose}
                disabled={saving}
                className={`w-full py-3 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center justify-center space-x-1.5 ${
                  showCloseModal === 'win' 
                    ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-950/30 text-amber-950' 
                    : 'bg-red-600 hover:bg-red-500 shadow-red-950/30 text-white'
                }`}
              >
                {saving ? 'Gravando...' : 'Confirmar Fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6.5 Modal de Criar Nova Tarefa Comercial (Salesforce Style) */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden relative animate-in fade-in zoom-in-95 duration-150">
            {/* Cabeçalho do Modal */}
            <div className="border-b border-slate-200/80 dark:border-slate-700/80 px-6 py-4 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                <span className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg flex items-center justify-center shadow-sm">
                  {typeof IconDocument !== 'undefined' ? <IconDocument size={14} /> : null}
                </span>
                <span>{editingTask ? 'Editar Tarefa Comercial' : 'Nova Tarefa Comercial'}</span>
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setShowNewTaskModal(false);
                  setSelectedProposalForTask(null);
                  setSearchProposalQuery('');
                  setProposalSearchResults([]);
                }}
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-600/60 transition-colors cursor-pointer"
                title="Fechar (ESC)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="p-6 space-y-4">
              {/* Campo de Seleção do Negócio */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Negócio Associado
                </label>
                <div className="relative">
                  {selectedProposalForTask ? (
                    <div className="px-3.5 py-2.5 bg-indigo-50/90 dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 rounded-xl flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0 animate-pulse" />
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                          {searchProposalQuery}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[10px] font-extrabold bg-indigo-600 text-white px-2.5 py-0.5 rounded-full shadow-xs">
                          ✓ Selecionado
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProposalForTask(null);
                            setSearchProposalQuery('');
                            setProposalSearchResults([]);
                            setShowProposalDropdown(false);
                          }}
                          className="p-1 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="Trocar negócio"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                      <span className="pl-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={searchProposalQuery}
                        onChange={(e) => {
                          const q = e.target.value;
                          setSearchProposalQuery(q);
                          setSelectedProposalForTask(null);
                          if (q.trim().length >= 1) {
                            const q_lower = q.toLowerCase();
                            const filtered = (kanbanTasks || []).filter(t => 
                              (t.name || "").toLowerCase().includes(q_lower) ||
                              (t.id || "").toLowerCase().includes(q_lower)
                            );
                            setProposalSearchResults(filtered);
                            setShowProposalDropdown(filtered.length > 0);
                          } else {
                            setProposalSearchResults([]);
                            setShowProposalDropdown(false);
                          }
                        }}
                        onFocus={() => {
                          if (searchProposalQuery.trim().length >= 1 && proposalSearchResults.length > 0) {
                            setShowProposalDropdown(true);
                          } else if (searchProposalQuery.trim().length === 0) {
                            setProposalSearchResults(kanbanTasks || []);
                            if ((kanbanTasks || []).length > 0) setShowProposalDropdown(true);
                          }
                        }}
                        placeholder="Buscar por nome do negócio..."
                        className="flex-1 bg-transparent pl-2.5 pr-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-medium focus:outline-none placeholder-slate-400"
                      />
                      {searchProposalQuery.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchProposalQuery('');
                            setProposalSearchResults([]);
                            setShowProposalDropdown(false);
                          }}
                          className="pr-3 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Dropdown de sugestão de negócios */}
                  {showProposalDropdown && proposalSearchResults.length > 0 && (
                    <React.Fragment>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProposalDropdown(false)} />
                      <ul className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl max-h-56 overflow-y-auto shadow-2xl z-50 divide-y divide-slate-100">
                        {proposalSearchResults.map(p => (
                          <li
                            key={p.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const clean = getCleanBusinessName(p.name || p.nome || 'Projeto');
                              setSelectedProposalForTask({ ...p, name: clean });
                              setSearchProposalQuery(clean);
                              setShowProposalDropdown(false);
                            }}
                            className="flex items-center justify-between gap-2 cursor-pointer px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-900 transition-colors"
                          >
                            <span className="font-semibold text-slate-900 dark:text-slate-100 leading-snug truncate">
                              {p.name || 'Projeto'}
                            </span>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex-shrink-0">
                              Selecionar
                            </span>
                          </li>
                        ))}
                      </ul>
                    </React.Fragment>
                  )}

                  {showProposalDropdown && proposalSearchResults.length === 0 && searchProposalQuery.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-500 dark:text-slate-400 text-center shadow-xl z-50">
                      Nenhum negócio encontrado para "{searchProposalQuery}"
                    </div>
                  )}
                </div>
              </div>

              {/* Título da Tarefa */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Assunto / Título da Tarefa
                </label>
                <input 
                  type="text" 
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Ex: Ligar para alinhar proposta comercial"
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-400"
                />
              </div>

              {/* Grid: Tipo de Atividade + Atribuído a */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Tipo de Atividade
                  </label>
                  <select 
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 cursor-pointer transition-all"
                  >
                    {taskTypes.map(t => (
                      <option key={t.id} value={t.nome}>{t.emoji} {t.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Atribuído a
                  </label>
                  <select 
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 cursor-pointer transition-all"
                  >
                    <option value="" className="text-slate-400 dark:text-slate-500">Selecione o responsável...</option>
                    {vendedoresVisiveis.map(v => (
                      <option key={v.id} value={String(v.id)}>{v.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data de Vencimento e Hora */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Data de Vencimento
                </label>
                <div className="flex items-center space-x-3">
                  <input 
                    type="date"
                    required
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-mono font-medium focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 cursor-pointer transition-all"
                  />
                  
                  {!hasTime ? (
                    <button
                      type="button"
                      onClick={() => setHasTime(true)}
                      className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>+ Adicionar hora</span>
                    </button>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={newTaskTime}
                        onChange={(e) => setNewTaskTime(e.target.value)}
                        className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 cursor-pointer font-mono font-medium"
                      >
                        {Array.from({ length: 41 }, (_, i) => {
                          const hour = Math.floor(8 + i * 0.25);
                          const minute = (i * 15) % 60;
                          const hourStr = String(hour).padStart(2, '0');
                          const minuteStr = String(minute).padStart(2, '0');
                          return `${hourStr}:${minuteStr}`;
                        }).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setHasTime(false)}
                        className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        title="Remover hora"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end space-x-3 pt-5 border-t border-slate-100 dark:border-slate-800 mt-6">
                <button 
                  type="button"
                  onClick={() => {
                    setShowNewTaskModal(false);
                    setSelectedProposalForTask(null);
                    setSearchProposalQuery('');
                    setProposalSearchResults([]);
                  }}
                  className="px-4.5 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={creatingTask}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  {creatingTask ? (editingTask ? 'Salvando...' : 'Criando...') : (editingTask ? 'Salvar Alterações' : 'Criar Tarefa')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Oportunidade / Negócio */}
      {showEditNegocioDrawerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowEditNegocioDrawerModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col ring-1 ring-slate-200 dark:ring-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-slate-100 leading-tight">Editar Oportunidade</h3>
                  {selectedTask?.numero_proposta_oficial && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg mt-0.5">
                      Nº da Oportunidade: {selectedTask.numero_proposta_oficial}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowEditNegocioDrawerModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Fechar">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSalvarEditarNegocioDrawer} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Título da Oportunidade *</label>
                <input required value={editNegocioDrawerForm.nome} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Estágio do Funil</label>
                  <select value={editNegocioDrawerForm.estagio} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, estagio: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all cursor-pointer">
                    {['Registro','Qualificação','Proposta','Desenvolvimento','Negociação','Termo de aceite','Ganho','Perdido','Congelado'].map(est => (
                      <option key={est} value={est}>{est}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tipo de Oportunidade</label>
                  <select value={editNegocioDrawerForm.tipo} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, tipo: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all cursor-pointer">
                    <option value="Projeto">Projeto</option>
                    <option value="Garantias">Garantias</option>
                    <option value="Serviços">Serviços</option>
                    <option value="SSU">SSU</option>
                    <option value="Volumes">Volumes</option>
                    <option value="Upgrade">Upgrade</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Probabilidade</label>
                  <select value={editNegocioDrawerForm.probabilidade} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, probabilidade: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all cursor-pointer">
                    <option value="10">10%</option>
                    <option value="30">30%</option>
                    <option value="50">50%</option>
                    <option value="70">70%</option>
                    <option value="90">90%</option>
                    <option value="100">100%</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Valor Estimado (R$)</label>
                  <input type="number" step="0.01" placeholder="0,00" value={editNegocioDrawerForm.valor} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, valor: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Previsão de Fechamento do Negócio</label>
                  <input type="date" value={editNegocioDrawerForm.dataPrevisao} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, dataPrevisao: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                </div>
              </div>

              {/* Registros de Oportunidade (R.O.) */}
              <div>
                <div className="flex items-center gap-3 pt-1 mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-400">Registros de Oportunidade (R.O.)</span>
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700"></div>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">R.O: Infraestrutura</label>
                    <input placeholder="Ex: Dell RO #123456" value={editNegocioDrawerForm.roInfra} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, roInfra: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">R.O: Software 1</label>
                      <input placeholder="Ex: Veeam RO #98765" value={editNegocioDrawerForm.roSw1} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, roSw1: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">R.O: Software 2</label>
                      <input placeholder="Ex: Fortinet RO #54321" value={editNegocioDrawerForm.roSw2} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, roSw2: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">R.O: Software 3</label>
                      <input placeholder="Ex: VMware RO #11223" value={editNegocioDrawerForm.roSw3} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, roSw3: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">R.O: Software 4</label>
                      <input placeholder="Ex: Red Hat RO #44556" value={editNegocioDrawerForm.roSw4} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, roSw4: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Escopo & Solução Técnica</label>
                <textarea rows={3} placeholder="Descreva o escopo, fabricantes (Dell, Veeam, etc.)..." value={editNegocioDrawerForm.descricao} onChange={e => setEditNegocioDrawerForm(p => ({ ...p, descricao: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all resize-none" />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button type="button" onClick={() => setShowEditNegocioDrawerModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer">Cancelar</button>
                <button type="submit" disabled={savingEditNegocioDrawer} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-md shadow-indigo-200 cursor-pointer">
                  {savingEditNegocioDrawer ? 'Salvando...' : '✓ Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Drawer Lateral Direito */}
      {showDrawer && (
        <div className="drawer-container">
          <div 
            className={`drawer-backdrop ${showDrawer ? 'active' : ''}`} 
            onClick={() => {
              setShowDrawer(false);
              setClickupTaskId('');
            }}
          ></div>
          <div
            className={`drawer-content h-full flex flex-col ${showDrawer ? 'active' : ''} ${
              drawerTab === 'budget' ? 'w-[94vw] max-w-7xl' : 'w-full max-w-4xl md:max-w-5xl'
            }`}
          >
            {drawerTab === 'details' ? (
              <div className="flex-1 flex flex-col p-7 overflow-hidden bg-slate-50/60 dark:bg-slate-900/60">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-5 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <button 
                      onClick={() => {
                        setShowDrawer(false);
                        setClickupTaskId('');
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
                      title="Voltar / Fechar (ESC)"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      <span>Voltar</span>
                    </button>

                    <div className="min-w-0">
                      <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-snug truncate">{selectedTask ? (selectedTask.nome || selectedTask.name) : 'Detalhes da Oportunidade'}</h3>
                      {(() => {
                        const numProp = selectedTask?.numero_proposta_oficial;
                        if (!numProp) return null;
                        return (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md mt-0.5">
                            Nº da Oportunidade: {numProp}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => handleAbrirEditarNegocioDrawer(selectedTask)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      title="Editar oportunidade"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>Editar</span>
                    </button>

                    <button 
                      onClick={() => handleExcluirNegocioDrawer(selectedTask)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      title="Excluir oportunidade"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      <span>Excluir</span>
                    </button>

                    <button 
                      onClick={() => {
                        setShowDrawer(false);
                        setClickupTaskId('');
                      }}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      title="Fechar (ESC)"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {/* Cards de Responsável e Valor */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-indigo-400 shadow-sm shadow-slate-200/50">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-indigo-500 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        Responsável pelo Negócio
                      </span>
                      <select
                        className="w-full bg-transparent border-0 p-0 text-base font-black text-slate-900 dark:text-slate-100 focus:ring-0 focus:outline-none cursor-pointer mt-1.5"
                        value={selectedTask ? (selectedTask.responsavel_negocio || "") : ""}
                        onChange={(e) => {
                          if (selectedTask) {
                            const u = vendedoresVisiveis.find(v => v.nome === e.target.value);
                            handleResponsavelChange(selectedTask.id, e.target.value, u ? u.id : null);
                          }
                        }}
                      >
                        <option value="" className="bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">Selecione o responsável...</option>
                        {vendedoresVisiveis.map(v => (
                          <option key={v.id} value={v.nome} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">{v.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-400 shadow-sm shadow-slate-200/50">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Valor Estimado
                      </span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400 tracking-tight mt-1.5 block">
                        {(() => {
                          if (currentProposta && currentProposta.situacao === 'Selecionada') {
                            return `R$ ${Number(realTimeGrandTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                          }
                          const val = getOpportunityValue(selectedTask);
                          return (val !== null && val !== undefined && !isNaN(val))
                            ? `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : 'R$ 0,00';
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Pipeline Premium — Estágio da Venda */}
                  <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </div>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Pipeline de Vendas</span>

                        {/* Botão Congelar Pequeno com Feedback Animado */}
                        {(() => {
                          const safeColumns = (kanbanColumns && kanbanColumns.length > 0) ? kanbanColumns : ESTAGIO_OPTIONS;
                          const congeladoOption = safeColumns.find(c => (c.name || '').toLowerCase().includes('congelad'));
                          const currentOptId = getTaskOptionId(selectedTask, safeColumns);
                          const isFrozen = congeladoOption && currentOptId === congeladoOption.id;

                          if (isFrozen) {
                            return (
                              <button
                                onClick={async () => {
                                  if (selectedTask && safeColumns.length > 0) {
                                    const firstActiveCol = safeColumns.find(c => {
                                      const n = (c.name || '').toLowerCase();
                                      return !n.includes('congelad') && !n.includes('ganho') && !n.includes('perdido');
                                    }) || safeColumns[0];
                                    const ok = await handleOpportunityStateChange(selectedTask.id, firstActiveCol.id);
                                    if (ok) showToast('Negócio Descongelado! Retornou ao Pipeline ❄️', 'info');
                                  }
                                }}
                                className="bg-sky-500 hover:bg-sky-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-extrabold shadow-sm shadow-sky-500/30 flex items-center gap-1.5 cursor-pointer animate-pulse ring-2 ring-sky-300 transition-all"
                                title="Negócio atualmente Congelado! Clique para Descongelar"
                              >
                                <span className="w-2 h-2 rounded-full bg-white dark:bg-slate-800 animate-ping" />
                                <span>❄️ Congelado</span>
                              </button>
                            );
                          }

                          return (
                            <button
                              onClick={async () => {
                                if (selectedTask && congeladoOption) {
                                  const ok = await handleOpportunityStateChange(selectedTask.id, congeladoOption.id);
                                  if (ok) showToast('Negócio Congelado ❄️', 'info');
                                } else {
                                  showToast('Estágio Congelado não configurado.', 'warning');
                                }
                              }}
                              className="bg-slate-100 dark:bg-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950/50 text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-300 border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-800 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Clique para Congelar este negócio"
                            >
                              <span>❄️ Congelar</span>
                            </button>
                          );
                        })()}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Clique para avançar</span>
                    </div>

                    {/* Grid de Estágios com Ganho e Perdido acendendo apenas quando fechados */}
                    {(() => {
                      const rawOptions = (kanbanColumns && kanbanColumns.length > 0) ? kanbanColumns : ESTAGIO_OPTIONS;
                      const options = rawOptions.filter(o => {
                        const n = (o.name || '').toLowerCase();
                        return !n.includes('congelad') && !n.includes('ganho') && !n.includes('perdido');
                      });

                      const currentRawOptionId = getTaskOptionId(selectedTask, rawOptions);
                      const currentRawOption = rawOptions.find(c => c.id === currentRawOptionId);
                      const currentRawName = (currentRawOption?.name || selectedTask?.estagio || '').toLowerCase();

                      // Verificar se há uma proposta selecionada ativada
                      const selectedProp = propostas && propostas.length > 0
                        ? (propostas.find(p => p.situacao === 'Selecionada') || propostas.find(p => p.versao === 'vA') || propostas[0])
                        : null;
                      const hasSelectedProposal = Boolean(selectedProp);

                      // Determinar se o negócio está Ganho, Perdido ou Congelado
                      const taskEstagio = (selectedTask?.estagio || '').toLowerCase();
                      const isWon = (selectedProp && selectedProp.situacao === 'Ganho') || currentRawName.includes('ganho') || taskEstagio.includes('ganho');
                      const isLost = (selectedProp && selectedProp.situacao === 'Perdido') || currentRawName.includes('perdido') || taskEstagio.includes('perdido');
                      const isFrozen = currentRawName.includes('congelad') || taskEstagio.includes('congelad');
                      const isInactiveState = isWon || isLost || isFrozen;

                      const currentIdx = !isInactiveState ? options.findIndex(o => o.id === currentRawOptionId) : -1;

                      return (
                        <React.Fragment>
                          <div className="grid gap-1.5 select-none" style={{ gridTemplateColumns: `repeat(${options.length + 2}, 1fr)` }}>
                            {options.map((col, idx) => {
                              const isCurrent = !isInactiveState && (currentRawOptionId === col.id || (currentIdx === -1 && idx === 0));
                              const isPassed = !isInactiveState && currentIdx !== -1 && idx < currentIdx;

                              return (
                                <button
                                  key={col.id || idx}
                                  onClick={async () => {
                                    if (!selectedTask) return;
                                    const colName = (col.name || '').toLowerCase();
                                    // Mesma proteção do drag-and-drop no Kanban (ver handleDrop):
                                    // ir direto pra Ganho/Perdido por aqui pula o fluxo que grava
                                    // data_fechamento/motivo_perda, deixando o negócio invisível
                                    // no relatório de faturamento.
                                    if (colName.includes('ganho') || colName.includes('perdido')) {
                                      if (!currentProposta) return;
                                      setCloseDate(new Date().toISOString().split('T')[0]);
                                      if (colName.includes('ganho')) {
                                        setShowCloseModal('win');
                                      } else {
                                        setSelectedLossReason('');
                                        setShowCloseModal('loss');
                                      }
                                      return;
                                    }
                                    setSelectedTask(prev => (prev ? { ...prev, estagio: col.name } : prev));
                                    await handleOpportunityStateChange(selectedTask.id, col.id);
                                  }}
                                  title={`Mover para: ${col.name}`}
                                  className={`relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 cursor-pointer group ${
                                    isCurrent
                                      ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-[1.03] ring-2 ring-indigo-400/30 ring-offset-1'
                                      : isPassed
                                      ? 'bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-emerald-700 dark:to-emerald-700 text-indigo-700 dark:text-white hover:from-indigo-100 hover:to-indigo-200 dark:hover:from-emerald-600 dark:hover:to-emerald-600'
                                      : 'bg-slate-100/80 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-600/80 hover:text-slate-700 dark:hover:text-slate-300'
                                  }`}
                                >
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center mb-1 ${
                                    isCurrent
                                      ? 'bg-white/25 dark:bg-slate-800/25'
                                      : isPassed
                                      ? 'bg-indigo-200/60 dark:bg-white/25'
                                      : 'bg-slate-200/60 dark:bg-slate-600/60'
                                  }`}>
                                    {isCurrent ? (
                                      <span className="w-2 h-2 bg-white dark:bg-slate-800 rounded-full animate-pulse" />
                                    ) : isPassed ? (
                                      <svg className="w-3 h-3 text-indigo-600 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <span className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-bold text-center leading-tight ${
                                    isCurrent ? 'text-white' : isPassed ? 'text-indigo-700 dark:text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                                  }`}>
                                    {col.name}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-[7px] font-black text-white/60 uppercase tracking-widest mt-0.5">Atual</span>
                                  )}
                                </button>
                              );
                            })}

                            {/* Botão Ganho (Acende se for Ganho, senão fica apagado) */}
                            <button
                              disabled={!hasSelectedProposal}
                              onClick={() => {
                                if (selectedProp) {
                                  setCurrentProposta(selectedProp);
                                  setCloseDate(new Date().toISOString().split('T')[0]);
                                  setShowCloseModal('win');
                                }
                              }}
                              title={hasSelectedProposal ? "Marcar oportunidade como Ganha 🏆" : "Requer uma proposta Selecionada para fechar como Ganho"}
                              className={`relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 ${
                                isWon
                                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.03] ring-2 ring-emerald-400 ring-offset-1 cursor-pointer'
                                  : hasSelectedProposal
                                  ? 'bg-slate-100/80 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-200 dark:hover:border-emerald-800 border border-transparent cursor-pointer'
                                  : 'bg-slate-100/50 dark:bg-slate-700/50 text-slate-300 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-50'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center mb-1 ${isWon ? 'bg-white/25 dark:bg-slate-800/25' : 'bg-slate-200/60 dark:bg-slate-600/60'}`}>
                                {isWon ? <span className="w-2 h-2 bg-white dark:bg-slate-800 rounded-full animate-pulse" /> : <span className="text-xs">🏆</span>}
                              </div>
                              <span className={`text-[10px] font-bold text-center leading-tight ${isWon ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>Ganho</span>
                              {isWon && <span className="text-[7px] font-black text-white/70 uppercase tracking-widest mt-0.5">Atual</span>}
                            </button>

                            {/* Botão Perdido (Acende se for Perdido, senão fica apagado) */}
                            <button
                              disabled={!hasSelectedProposal}
                              onClick={() => {
                                if (selectedProp) {
                                  setCurrentProposta(selectedProp);
                                  setCloseDate(new Date().toISOString().split('T')[0]);
                                  setSelectedLossReason('');
                                  setShowCloseModal('loss');
                                }
                              }}
                              title={hasSelectedProposal ? "Marcar oportunidade como Perdida 😞" : "Requer uma proposta Selecionada para fechar como Perdido"}
                              className={`relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 ${
                                isLost
                                  ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30 scale-[1.03] ring-2 ring-rose-400 ring-offset-1 cursor-pointer'
                                  : hasSelectedProposal
                                  ? 'bg-slate-100/80 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-200 dark:hover:border-rose-800 border border-transparent cursor-pointer'
                                  : 'bg-slate-100/50 dark:bg-slate-700/50 text-slate-300 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-50'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center mb-1 ${isLost ? 'bg-white/25 dark:bg-slate-800/25' : 'bg-slate-200/60 dark:bg-slate-600/60'}`}>
                                {isLost ? <span className="w-2 h-2 bg-white dark:bg-slate-800 rounded-full animate-pulse" /> : <span className="text-xs">😞</span>}
                              </div>
                              <span className={`text-[10px] font-bold text-center leading-tight ${isLost ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>Perdido</span>
                              {isLost && <span className="text-[7px] font-black text-white/70 uppercase tracking-widest mt-0.5">Atual</span>}
                            </button>
                          </div>

                          {/* Barra de progresso total (Termo de Aceite = 86%, 100% exclusivo do Ganho) */}
                          {(() => {
                            const totalSteps = options.length + 1; // 7 etapas no total até o Ganho
                            const progress = isWon ? 100 : isLost ? 100 : isFrozen ? 0 : (currentIdx !== -1 ? Math.round(((currentIdx + 1) / totalSteps) * 100) : 0);
                            const barGradient = isWon
                              ? 'from-emerald-400 to-emerald-600'
                              : isLost
                              ? 'from-rose-400 to-rose-600'
                              : 'from-indigo-500 via-violet-500 to-emerald-500';
                            return (
                              <div className="mt-3 flex items-center gap-3">
                                <div className="flex-1 h-1.5 bg-slate-200/80 dark:bg-slate-600/80 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500 ease-out`} style={{ width: `${progress}%` }} />
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">{progress}%</span>
                              </div>
                            );
                          })()}
                        </React.Fragment>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Barra de Abas com Ícones + Rótulos */}
                  <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700 mb-0 px-1 bg-white dark:bg-slate-800 rounded-t-2xl pt-1.5">
                    {/* Aba Propostas */}
                    <button
                      onClick={() => { setDrawerSection('propostas'); }}
                      title="Propostas"
                      className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                        drawerSection === 'propostas'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Propostas</span>
                      {drawerSection === 'propostas' && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></span>
                      )}
                    </button>

                    {/* Aba Tarefas */}
                    <button
                      onClick={() => { setDrawerSection('tarefas'); }}
                      title="Tarefas"
                      className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                        drawerSection === 'tarefas'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>Tarefas</span>
                      {drawerSection === 'tarefas' && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></span>
                      )}
                      {(() => {
                        const overdueCount = commercialTasks.filter(t => {
                          const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
                          const isThisDeal = t.clickup_negocio_id === clickupTaskId ||
                                             (propObj && propObj.clickup_negocio_id === clickupTaskId) ||
                                             (currentProposta && t.proposta_id === currentProposta.id);
                          return isThisDeal && t.status === 'pendente' && new Date(t.data_vencimento) < new Date();
                        }).length;
                        return overdueCount > 0 ? (
                          <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">{overdueCount}</span>
                        ) : null;
                      })()}
                    </button>

                    {/* Aba Status do Projeto */}
                    <button
                      onClick={() => { setDrawerSection('status'); fetchAtividades(clickupTaskId); }}
                      title="Status do Projeto"
                      className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                        drawerSection === 'status'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span>Atividades</span>
                      {drawerSection === 'status' && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></span>
                      )}
                    </button>

                    {/* Aba Empresa */}
                    <button
                      onClick={() => { setDrawerSection('empresa'); }}
                      title="Empresa"
                      className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                        drawerSection === 'empresa'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M13 21V11l6 3v7M9 9h.01M9 12h.01M9 15h.01" />
                      </svg>
                      <span>Empresa</span>
                      {drawerSection === 'empresa' && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></span>
                      )}
                    </button>
                  </div>

                  {/* Conteúdo da Aba Selecionada */}
                  <div className="flex-1 overflow-y-auto pr-1 pt-4 px-1 bg-white dark:bg-slate-800 rounded-b-2xl shadow-sm shadow-slate-200/40 border border-t-0 border-slate-200 dark:border-slate-700">

                    {/* === ABA: PROPOSTAS === */}
                    {drawerSection === 'propostas' && (
                      <div className="px-1">
                        {renderTimeline(false)}
                      </div>
                    )}

                    {/* === ABA: TAREFAS === */}
                    {drawerSection === 'tarefas' && (
                      <div className="px-1 space-y-3">
                        {/* Botão + Nova Tarefa Comercial dentro da aba Tarefas */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700 mb-3">
                          <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Tarefas Associadas
                          </span>
                          <button
                            onClick={handleNewTaskClick}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center space-x-1"
                          >
                            <span>➕ Nova Tarefa Comercial</span>
                          </button>
                        </div>

                        {(() => {
                          const dealTasks = commercialTasks.filter(t => {
                            const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
                            return t.clickup_negocio_id === clickupTaskId || 
                                   (propObj && propObj.clickup_negocio_id === clickupTaskId) ||
                                   (currentProposta && t.proposta_id === currentProposta.id);
                          });
                          
                          if (dealTasks.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-slate-50/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl">
                                <div className="w-14 h-14 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center">
                                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                </div>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nenhuma tarefa associada a este negócio.</p>
                              </div>
                            );
                          }

                          return dealTasks.map(task => {
                            const isOverdue = task.status === 'pendente' && new Date(task.data_vencimento) < new Date();
                            const isDone = task.status === 'concluida';
                            const matchedType = taskTypes.find(t => t.nome === task.tipo);
                            const typeEmoji = matchedType ? matchedType.emoji : '📋';

                            return (
                              <div key={task.id} className={`flex items-start justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border shadow-xs hover:shadow-sm transition-all ${isOverdue ? 'border-l-4 border-l-rose-400 border-slate-200 dark:border-slate-700' : isDone ? 'border-l-4 border-l-emerald-400 border-slate-200 dark:border-slate-700' : 'border-l-4 border-l-indigo-300 border-slate-200 dark:border-slate-700'}`}>
                                <div className="flex items-start space-x-2.5">
                                  <input 
                                    type="checkbox" 
                                    checked={isDone}
                                    onChange={() => toggleTaskStatus(task)}
                                    className="w-3.5 h-3.5 rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 cursor-pointer mt-0.5"
                                  />
                                  <div>
                                    <p className={`text-xs font-semibold ${isDone ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                      {typeEmoji} {task.titulo}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      Vence em: {new Date(task.data_vencimento).toLocaleString('pt-BR')} 
                                      {isOverdue && <span className="text-red-400 font-bold ml-1.5">⚠️ Atrasada</span>}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button onClick={() => handleEditTaskClick(task)} className="p-1 text-slate-500 dark:text-slate-400 hover:text-blue-500 transition-colors" title="Editar Tarefa">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                  </button>
                                  <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-slate-500 dark:text-slate-400 hover:text-red-500 transition-colors" title="Excluir Tarefa">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                  </button>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}

                    {/* === ABA: STATUS DO PROJETO === */}
                    {drawerSection === 'status' && (
                      <div className="px-1 space-y-5">
                        {/* Formulário de Nova Atividade */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm shadow-slate-200/50">
                          <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Registrar Atividade
                          </span>
                          <MentionTextarea
                            value={novaAtividade}
                            onChange={setNovaAtividade}
                            membros={vendedores}
                            placeholder="Descreva o resultado da ação, retorno do cliente, próximos passos... Use @ para marcar um colega."
                            rows={3}
                          />
                          <button
                            onClick={handleCreateAtividade}
                            disabled={savingAtividade || !novaAtividade.trim()}
                            className={`mt-2.5 w-full py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              savingAtividade || !novaAtividade.trim()
                                ? 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-md shadow-indigo-600/20'
                            }`}
                          >
                            {savingAtividade ? 'Salvando...' : '💬 Registrar Atividade'}
                          </button>
                        </div>

                        {/* Lista de Atividades Registradas */}
                        <div>
                          <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Histórico de Atividades
                          </span>

                          {loadingAtividades ? (
                            <div className="flex items-center justify-center py-6">
                              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          ) : atividades.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 bg-slate-50/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl">
                              <div className="w-12 h-12 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center">
                                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                              </div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nenhuma atividade registrada.</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">Registre ações, retornos e próximos passos.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {atividades.map(ativ => (
                                <div key={ativ.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 hover:border-indigo-200 hover:shadow-sm transition-all shadow-xs">
                                  {editingAtividade === ativ.id ? (
                                    <div className="space-y-2">
                                      <MentionTextarea
                                        value={editingAtividadeTexto}
                                        onChange={setEditingAtividadeTexto}
                                        membros={vendedores}
                                        rows={3}
                                      />
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={() => handleEditAtividade(ativ.id)}
                                          disabled={savingAtividade}
                                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                                        >
                                          {savingAtividade ? 'Salvando...' : 'Salvar'}
                                        </button>
                                        <button
                                          onClick={() => { setEditingAtividade(null); setEditingAtividadeTexto(''); }}
                                          className="px-3 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="flex items-start justify-between">
                                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed flex-1 pr-2 whitespace-pre-wrap">{renderTextoComMencoes(ativ.texto)}</p>
                                        <div className="flex items-center space-x-1 flex-shrink-0">
                                          {/* Botão Editar (Lápis) */}
                                          <button
                                            onClick={() => { setEditingAtividade(ativ.id); setEditingAtividadeTexto(ativ.texto); }}
                                            className="p-1 text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors"
                                            title="Editar atividade"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                          </button>
                                          {/* Botão Excluir (Lixeira) */}
                                          <button
                                            onClick={() => handleDeleteAtividade(ativ.id)}
                                            className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                                            title="Excluir atividade"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                          </button>
                                        </div>
                                      </div>
                                      <div className="flex items-center mt-2 space-x-2">
                                        <svg className="w-3 h-3 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                          {new Date(ativ.data_execucao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {ativ.clickup_comment_id && (
                                          <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-semibold">✓ ClickUp</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* === ABA: EMPRESA === */}
                    {drawerSection === 'empresa' && (
                      <div className="px-1 space-y-4 pb-4">
                        {!selectedTask?.conta_id ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-slate-50/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl">
                            <div className="w-14 h-14 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center">
                              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M13 21V11l6 3v7" />
                              </svg>
                            </div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nenhuma empresa vinculada a este negócio.</p>
                          </div>
                        ) : loadingEmpresaDoNegocio && !empresaDoNegocio ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        ) : !empresaDoNegocio ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 bg-slate-50/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Não foi possível carregar os dados da empresa.</p>
                          </div>
                        ) : (() => {
                          const tier = normalizeTier(empresaDoNegocio.account_tier);
                          const status = normalizeStatus(empresaDoNegocio.status);
                          return (
                            <React.Fragment>
                              {/* Cabeçalho */}
                              <div className="flex items-start gap-3">
                                <AvatarInicial nome={empresaDoNegocio.nome} size="lg" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight truncate">{empresaDoNegocio.nome}</h4>
                                  {empresaDoNegocio.razao_social && empresaDoNegocio.razao_social !== empresaDoNegocio.nome && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{empresaDoNegocio.razao_social}</p>
                                  )}
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                                    {formatCNPJ(empresaDoNegocio.cnpj) || 'CNPJ não informado'}
                                    {empresaDoNegocio.cidade ? ` · ${empresaDoNegocio.cidade}/${empresaDoNegocio.estado}` : ''}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${status.color}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>{status.label}
                                    </span>
                                    {tier && (
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${tier.color}`}>
                                        <tier.Icon size={10} /> {tier.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Dados Corporativos */}
                              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50 overflow-hidden">
                                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-700/80">
                                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Dados Corporativos</h5>
                                </div>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5">
                                  <DadoCampo label="CNPJ" value={formatCNPJ(empresaDoNegocio.cnpj)} mono />
                                  <DadoCampo label="Insc. Estadual" value={empresaDoNegocio.inscricao_estadual} mono />
                                  <DadoCampo label="Ciclo de Faturamento" value={empresaDoNegocio.billing_cycle} />
                                  <DadoCampo label="Segmento" value={empresaDoNegocio.industry} />
                                </dl>
                              </div>

                              {/* Contato Corporativo + Localização */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50 overflow-hidden">
                                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-700/80">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Contato Corporativo</h5>
                                  </div>
                                  <dl className="px-4 py-3.5 space-y-2.5">
                                    <DadoCampo label="E-mail" value={empresaDoNegocio.email} href={empresaDoNegocio.email ? `mailto:${empresaDoNegocio.email}` : null} />
                                    <DadoCampo label="Telefone" value={formatPhone(empresaDoNegocio.telefone)} href={empresaDoNegocio.telefone ? `tel:${empresaDoNegocio.telefone}` : null} />
                                  </dl>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50 overflow-hidden">
                                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-700/80">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Localização</h5>
                                  </div>
                                  <div className="px-4 py-3.5 space-y-1">
                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{empresaDoNegocio.rua || '—'}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                      {[empresaDoNegocio.cidade, empresaDoNegocio.estado].filter(Boolean).join(' - ') || '—'}
                                      {empresaDoNegocio.cep ? ` · CEP ${empresaDoNegocio.cep}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Contatos */}
                              <div>
                                <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                  Contatos ({contatosDoNegocio.length})
                                </span>
                                {contatosDoNegocio.length === 0 ? (
                                  <div className="text-center py-8 bg-slate-50/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nenhum contato cadastrado para esta empresa.</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2.5">
                                    {contatosDoNegocio.map(c => (
                                      <div key={c.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/90 p-3.5">
                                        <div className="flex items-center gap-3">
                                          <AvatarInicial nome={c.nome} size="sm" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{c.nome}</p>
                                              {c.champion && <span className="shrink-0 text-amber-500" title="Champion / Principal Decisor">★</span>}
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">{c.cargo || 'Cargo não informado'}</p>
                                          </div>
                                          {c.email && (
                                            <a href={`mailto:${c.email}`} title={`Enviar e-mail para ${c.email}`} className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-[10px] font-bold hover:bg-sky-100 transition-colors">
                                              E-mail
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center pt-1">
                                Para editar os dados da empresa ou dos contatos, use a aba Empresas.
                              </p>
                            </React.Fragment>
                          );
                        })()}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            ) : (
              <div className="drawer-split-container">
                {/* Lado Esquerdo: Timeline sempre visível */}
                <div className="drawer-split-sidebar flex flex-col p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-700/80 mb-4 flex-shrink-0">
                    <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 dark:text-slate-300">Histórico de Versões</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                    {renderTimeline()}
                  </div>
                </div>

                {/* Lado Direito: Editor de Orçamentos */}
                <div className="drawer-split-main flex flex-col">
                  {renderBudgetEditor()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// Renderizar o App React na div root
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
