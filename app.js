// App React para o Gerador de Propostas Comerciais com Versionamento (Modelo de Produção)

const { useState, useEffect, useMemo, useRef } = React;

if (typeof Chart !== 'undefined') {
  Chart.Tooltip.positioners.followMouse = function(elements, eventPosition) {
    return { x: eventPosition.x, y: eventPosition.y };
  };
}

const DEAL_VALUE_FIELD_ID = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4';
const RESPONSAVEL_FIELD_ID = ''; // Mapeado via assignees nativos do ClickUp
const API_KEY = '';

const chartColors = [
  'rgba(99, 102, 241, 0.75)',   // Indigo
  'rgba(16, 185, 129, 0.75)',   // Emerald
  'rgba(245, 158, 11, 0.75)',   // Amber
  'rgba(239, 68, 68, 0.75)',     // Red
  'rgba(6, 182, 212, 0.75)',     // Cyan
  'rgba(236, 72, 153, 0.75)',    // Pink
  'rgba(139, 92, 246, 0.75)',    // Violet
  'rgba(20, 184, 166, 0.75)',    // Teal
];

const chartBorderColors = [
  'rgba(99, 102, 241, 1)',
  'rgba(16, 185, 129, 1)',
  'rgba(245, 158, 11, 1)',
  'rgba(239, 68, 68, 1)',
  'rgba(6, 182, 212, 1)',
  'rgba(236, 72, 153, 1)',
  'rgba(139, 92, 246, 1)',
  'rgba(20, 184, 166, 1)',
];

// Configuração padrão
const getInitialConfig = () => {
  return {
    url: '',
    anonKey: '',
  };
};

const getSupabaseHeaders = () => {
  return {};
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
const KanbanCard = React.memo(({ task, dealValue, formattedValue, responsavel, handleDragStart, handleCardClick, hasOverdue }) => {
  return (
    <div 
      data-id={task.id} 
      draggable={true}
      onDragStart={(e) => handleDragStart(e, task)}
      onClick={() => handleCardClick(task)}
      className="kanban-card flex flex-col relative"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-100 line-clamp-2 pr-2">{task.name}</h4>
        {hasOverdue && (
          <span 
            className="w-2.5 h-2.5 rounded-full bg-red-500 border border-slate-950 flex-shrink-0 mt-1 animate-pulse" 
            title="Possui tarefa comercial atrasada!"
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400 mt-auto">
        <span>{responsavel || 'Sem Responsável'}</span>
        <span className="font-bold text-indigo-400">{formattedValue}</span>
      </div>
    </div>
  );
});

const STAGE_ORDER = [
  { key: 'registro',       width: '100%' },
  { key: 'qualifica',      width: '85%'  },
  { key: 'proposta',       width: '70%'  },
  { key: 'desenvolvimento',width: '55%'  },
  { key: 'negocia',        width: '40%'  },
  { key: 'termo',          width: '25%'  },
  { key: 'aceite',         width: '25%'  },
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

const ForecastFunnelPanel = ({ 
  kanbanColumns, 
  kanbanTasks, 
  showGanhoCol, 
  showPerdidoCol, 
  showCongeladoCol, 
  filterStage, 
  setFilterStage,
  getTaskOptionId,
  getOpportunityValue
}) => {
  // Guards defensivos: garante que arrays nunca sejam undefined
  const safeColumns = Array.isArray(kanbanColumns) ? kanbanColumns : [];
  const safeTasks = Array.isArray(kanbanTasks) ? kanbanTasks : [];

  const activeCols = safeColumns.filter(col => {
    if (!col || typeof col.name !== 'string') return false;
    const colName = col.name.toLowerCase();
    if (colName.includes("ganho") || colName.includes("perdido") || colName.includes("congelado")) return false;
    return true;
  });

  const rawStageData = activeCols.map(col => {
    const tasksInCol = safeTasks.filter(t => getTaskOptionId && getTaskOptionId(t, safeColumns) === col.id);
    const total = tasksInCol.reduce((acc, t) => acc + (getOpportunityValue ? (getOpportunityValue(t) || 0) : 0), 0);
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
    <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/30 flex-shrink-0">
      <div className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider flex items-center justify-between">
        <span>Funil de Vendas &amp; Forecast</span>
        {filterStage && (
          <button 
            onClick={() => setFilterStage(null)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
          >
            Limpar Filtro
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full items-stretch">
        {/* Left Column: Inverted pyramid funnel (50% width) */}
        <div className="flex flex-col items-stretch justify-center space-y-1.5 py-1">
          {stageData.map((stage) => {
            const isSelected = filterStage === stage.id;
            return (
              <div key={stage.id} className="flex justify-center w-full">
                <button
                  onClick={() => setFilterStage(filterStage === stage.id ? null : stage.id)}
                  style={{ width: stage.funnelWidth }}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 border cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-slate-900/70 hover:bg-slate-800/90 border-slate-800 text-slate-300 hover:text-white hover:border-slate-600'
                  }`}
                >
                  {/* Left: dot + name | Right: badge de quantidade */}
                  <div className="flex items-center justify-between w-full min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span 
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-[10px] font-bold tracking-wide uppercase whitespace-nowrap overflow-hidden text-ellipsis">
                        {stage.name}
                      </span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ml-2 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400 group-hover:text-slate-200'
                    }`}>
                      {stage.count}
                    </span>
                  </div>
                  {/* Right: value */}
                  <span className={`font-mono text-[10px] font-bold flex-shrink-0 ml-2 ${isSelected ? 'text-white' : 'text-indigo-400'}`}>
                    R$ {stage.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Right Column: Total em Negociação — usa displayTotal que já respeita filterStage e exclui inativos */}
        <div className="bg-gradient-to-br from-indigo-950/50 to-slate-900/80 p-6 rounded-2xl border border-indigo-500/15 flex flex-col justify-center items-center text-center w-full min-h-[240px]">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3 block">
            {filterStage && selectedStageObj ? selectedStageObj.name : "Total em Negociação"}
          </span>
          <span className="text-3xl font-black text-emerald-400 leading-none select-all drop-shadow-[0_2px_10px_rgba(16,185,129,0.2)]">
            R$ {displayTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <p className="text-[11px] text-slate-400 mt-4 max-w-xs leading-relaxed">
            {filterStage && selectedStageObj
              ? `Soma dos negócios na etapa "${selectedStageObj.name}".`
              : "Soma total de todos os negócios comerciais ativos em andamento no funil."}
          </p>
          {!filterStage && (
            <div className="mt-3 text-xs text-slate-500 font-semibold px-3 py-1 bg-slate-950/50 rounded-full border border-slate-800/40">
              {stageData.reduce((a, s) => a + s.count, 0)} negócios em andamento
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLocalError('');
    try {
      const res = await onLogin(email, password);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-full mb-3">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Gestão Comercial</h2>
          <p className="text-slate-400 text-sm mt-1">Faça login para acessar o sistema</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">E-mail</label>
            <input 
              type="email" 
              required
              className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 rounded-lg outline-none transition-all"
              placeholder="seu-email@suprimatica.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Senha</label>
            <input 
              type="password" 
              required
              className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 rounded-lg outline-none transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {(localError || error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {localError || error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
};

function App() {
  const [config, setConfig] = useState(getInitialConfig);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [session, setSession] = useState(null);
  const [clickupTaskId, setClickupTaskId] = useState('');
  const [clickupListId, setClickupListId] = useState('');
  
  // Constante e Estados do Kanban & Drawer
  const TARGET_LIST_ID = '901326185457';
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('crm_active_view') || 'kanban'); // 'kanban' | 'relatorios'
  
  useEffect(() => {
    localStorage.setItem('crm_active_view', activeTab);
  }, [activeTab]);
  const [kanbanTasks, setKanbanTasks] = useState(() => {
    const cached = localStorage.getItem('crm_cache_kanban_tasks');
    return cached ? JSON.parse(cached) : [];
  });
  const [kanbanColumns, setKanbanColumns] = useState([]);
  const [loadingKanban, setLoadingKanban] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [drawerTab, setDrawerTab] = useState('details'); // 'details' | 'budget'
  const [canDrag, setCanDrag] = useState(false);
  const [showGanhoCol, setShowGanhoCol] = useState(false);
  const [showPerdidoCol, setShowPerdidoCol] = useState(false);
  const [showCongeladoCol, setShowCongeladoCol] = useState(false);
  const [sortBy, setSortBy] = useState(() => {
    return localStorage.getItem('crm_sort_order') || 'default';
  });
  const [supabaseProposalsList, setSupabaseProposalsList] = useState([]);
  const [commercialTasks, setCommercialTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tasksFilterAssignee, setTasksFilterAssignee] = useState('all');
  const [tasksShowCompleted, setTasksShowCompleted] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState('Ligação');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [filterStage, setFilterStage] = useState(null);
  const [hasTime, setHasTime] = useState(false);
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [searchProposalQuery, setSearchProposalQuery] = useState('');
  const [proposalSearchResults, setProposalSearchResults] = useState([]);
  const [showProposalDropdown, setShowProposalDropdown] = useState(false);
  const [selectedProposalForTask, setSelectedProposalForTask] = useState(null);
  
  // Dashboard de Relatórios
  const [wonProposals, setWonProposals] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  
  // Filtros de período e dados do Painel Comercial
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [commercialData, setCommercialData] = useState([]);

  // Referências para elementos de gráfico e instâncias do Chart.js
  const distributorCanvasRef = useRef(null);
  const manufacturerCanvasRef = useRef(null);
  const distributorChartInst = useRef(null);
  const manufacturerChartInst = useRef(null);
  
  // Contexto do ClickUp
  const [projectContext, setProjectContext] = useState({ name: '', proposal_number: '' });

  // Estados do Negócio/Propostas
  const [propostas, setPropostas] = useState([]);
  const [todasPropostas, setTodasPropostas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [distribuidores, setDistribuidores] = useState([]);
  const [vendedores, setVendedores] = useState(() => {
    const cached = localStorage.getItem('crm_cache_vendedores');
    return cached ? JSON.parse(cached) : [];
  });
  const [newVendedorName, setNewVendedorName] = useState('');
  const [editingVendedor, setEditingVendedor] = useState(null);
  const [currentProposta, setCurrentProposta] = useState(null);
  const [itens, setItens] = useState([]);
  
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
    wonCount: 0, wonValue: 0, wonQtyDiff: 0, wonValDiff: 0,
    lostCount: 0, lostValue: 0, lostQtyDiff: 0, lostValDiff: 0,
    convRate: 0, convRateDiff: 0
  });
  const [importFormat, setImportFormat] = useState('csv'); // 'csv' | 'xml'
  const [isProjeto, setIsProjeto] = useState(false);
  const [openMenuVersionId, setOpenMenuVersionId] = useState(null);
  const saveTimeoutRef = useRef(null);
  const [importText, setImportText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState('');
  
  // UX/UIs
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cálculos consolidados para os gráficos da aba de relatórios
  const { distributorTotals, distributorTotalSum } = useMemo(() => {
    const totals = {};
    commercialData.forEach(item => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const distName = item.distribuidores?.nome || 'Não Informado';
      if (selectedDistributorFilter === 'all' || distName.trim().toLowerCase() === selectedDistributorFilter.trim().toLowerCase()) {
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
    return { distributorTotals: sortedTotals, distributorTotalSum: sum };
  }, [commercialData, selectedDistributorFilter]);

  const { manufacturerTotals, manufacturerTotalSum } = useMemo(() => {
    const totals = {};
    commercialData.forEach(item => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const fabName = item.produtos?.fabricante || 'Não Informado';
      if (selectedManufacturerFilter === 'all' || fabName.trim().toLowerCase() === selectedManufacturerFilter.trim().toLowerCase()) {
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
    return { manufacturerTotals: sortedTotals, manufacturerTotalSum: sum };
  }, [commercialData, selectedManufacturerFilter]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ nome: '', fabricante: '', custo_referencia: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Carregar Config do Servidor e Inicializar Cliente Supabase
  useEffect(() => {
    const initSupabase = async () => {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error("Erro ao carregar configurações do servidor");
        const data = await response.json();
        const url = data.SUPABASE_URL;
        const anonKey = data.SUPABASE_ANON_KEY;
        
        if (url && anonKey) {
          const client = window.supabase.createClient(url, anonKey);
          setSupabaseClient(client);
          
          // Limpa localStorage das chaves antigas por segurança
          localStorage.removeItem('supa_url');
          localStorage.removeItem('supa_key');
          localStorage.removeItem('supabase_url');
          localStorage.removeItem('supabase_key');
          localStorage.removeItem('supabaseurl');
          localStorage.removeItem('supabasekey');
          
          testConnection(client);
        } else {
          console.error("Configurações do Supabase ausentes no servidor.");
          setErrorMsg("Configurações do Supabase ausentes no servidor (.env).");
        }
      } catch (err) {
        console.error("Erro ao inicializar Supabase:", err);
        setDbConnected(false);
        setErrorMsg("Erro de conexão com o servidor ao buscar configurações.");
      }
    };
    initSupabase();
  }, []);

  // Escuta autenticação
  useEffect(() => {
    if (!supabaseClient) return;
    
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProducts(supabaseClient);
        loadDistributors(supabaseClient);
        loadVendedores(supabaseClient);
      } else {
        setSession(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabaseClient]);

  const handleLogin = async (email, password) => {
    if (!supabaseClient) return { error: { message: "Cliente Supabase não inicializado." } };
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      return { error };
    }
    setSession(data.session);
    return data;
  };

  // Testar conexão buscando produtos
  const testConnection = async (client) => {
    try {
      const { data, error } = await client.from('produtos').select('id').limit(1);
      if (error) throw error;
      setDbConnected(true);
      setErrorMsg('');
      
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        setSession(session);
        loadProducts(client);
        loadDistributors(client);
        loadVendedores(client);
      }
    } catch (err) {
      console.error("Erro de conexão com o banco:", err);
      setDbConnected(false);
      setErrorMsg('Falha ao conectar ao Supabase. Verifique suas credenciais.');
    }
  };

  // Funções do Kanban
  const getTaskOptionId = (task, options) => {
    const field = task.custom_fields ? task.custom_fields.find(f => f.id === 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63') : null;
    if (!field || field.value === undefined || field.value === null) return null;
    
    const valStr = String(field.value);
    
    const optById = options.find(o => o.id === valStr);
    if (optById) return optById.id;

    const idx = parseInt(field.value, 10);
    if (!isNaN(idx) && options[idx]) {
      return options[idx].id;
    }

    const optByName = options.find(o => o.name.toLowerCase() === valStr.toLowerCase());
    if (optByName) return optByName.id;

    return valStr;
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
        let best =
          props.find(p => p.situacao === 'Selecionada') ||
          props.find(p => p.situacao === 'Ganho') ||
          props.find(p => p.situacao === 'Ativa') ||
          props.find(p => p.situacao === 'Desconsiderada') ||
          props[0];
        const val = parseFloat(best.total_proposta);
        if (!isNaN(val)) return val;
      }
    }
    
    // 2. Fallback: valor_estimado injetado no card
    if (task.valor_estimado !== undefined && task.valor_estimado !== null) {
      const ve = parseFloat(task.valor_estimado);
      if (!isNaN(ve)) return ve;
    }

    // 3. Fallback: Deal Value custom field do ClickUp
    const dealValField = task.custom_fields
      ? task.custom_fields.find(f => f.id === DEAL_VALUE_FIELD_ID)
      : null;
    if (dealValField && dealValField.value !== undefined && dealValField.value !== null) {
      const raw = parseFloat(dealValField.value);
      if (!isNaN(raw)) {
        return raw;
      }
    }
    
    return null;
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
        .select('clickup_negocio_id, total_proposta, situacao, criado_por');
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
          headers: { 'Content-Type': 'application/json' },
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
        .eq('clickup_negocio_id', cleanId);

      if (error) throw error;

      if (!data || data.length === 0) {
        await supabaseClient
          .from('propostas')
          .insert({
            clickup_negocio_id: cleanId,
            versao: 'vA',
            situacao: 'Selecionada',
            criado_por: responsavelNome,
            cenario: '',
            total_proposta: 0
          });
      }

      await refreshSupabaseProposalsList();
      loadDashboardData();
    } catch (err) {
      console.warn("Erro silencioso ao persistir responsável no Supabase:", err);
    }
  };

  const fetchKanbanData = async () => {
    if (kanbanTasks.length === 0) {
      setLoadingKanban(true);
    }
    try {
      // 1. Carregar todas as propostas do Supabase
      let propsList = [];
      if (supabaseClient) {
        const { data: props, error: propsErr } = await supabaseClient
          .from('propostas')
          .select('clickup_negocio_id, total_proposta, situacao, criado_por');
        if (!propsErr && props) {
          propsList = props;
          setSupabaseProposalsList(props);
        }
      }

      // 2. Carregar colunas do ClickUp
      const fieldsRes = await fetch(`/clickup-api/list/${TARGET_LIST_ID}/field`);
      let columnsData = [];
      if (fieldsRes.ok) {
        const fieldsData = await fieldsRes.json();
        if (fieldsData.fields) {
          const stageField = fieldsData.fields.find(f => f.id === 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63');
          if (stageField && stageField.type_config && stageField.type_config.options) {
            columnsData = stageField.type_config.options;
            setKanbanColumns(stageField.type_config.options);
          }
        }
      }

      // 3. Buscar todas as tarefas do ClickUp
      let allTasks = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const tasksRes = await fetch(`/clickup-api/list/${TARGET_LIST_ID}/task?include_closed=true&page=${page}`);
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (tasksData.tasks && tasksData.tasks.length > 0) {
            allTasks = [...allTasks, ...tasksData.tasks];
            if (tasksData.last_page === true || tasksData.tasks.length < 100) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // 4. Enriquecer tarefas com responsável e valor da proposta do Supabase
      const enrichedTasks = allTasks.map(t => {
        const idAlpha = String(t.id || '').replace('#', '').trim();
        const idNumeric = String(t.custom_id || t.task_id || '').replace('#', '').trim();

        const propMatchesTask = (p) => {
          const pClean = String(p.clickup_negocio_id || '').replace('#', '').trim();
          if (!pClean) return false;
          if (pClean === idAlpha) return true;
          if (idNumeric && pClean === idNumeric) return true;
          if (idAlpha && pClean === '#' + idAlpha) return true;
          if (idNumeric && pClean === '#' + idNumeric) return true;
          return false;
        };

        const matchedProps = propsList.filter(propMatchesTask);

        let resp = '';
        let supabaseDealValue = null;

        if (matchedProps.length > 0) {
          const best =
            matchedProps.find(p => p.situacao === 'Selecionada') ||
            matchedProps.find(p => p.situacao === 'Ganho') ||
            matchedProps.find(p => p.situacao === 'Ativa') ||
            matchedProps.find(p => p.situacao === 'Desconsiderada') ||
            matchedProps[0];

          resp = best.criado_por || '';
          const v = parseFloat(best.total_proposta);
          if (!isNaN(v)) supabaseDealValue = v;
        }

        if (t.assignees && t.assignees.length > 0) {
          resp = t.assignees[0].username || t.assignees[0].email || resp;
        }

        return { ...t, responsavel_negocio: resp, supabase_deal_value: supabaseDealValue };
      });

      setKanbanTasks(enrichedTasks);
      localStorage.setItem('crm_cache_kanban_tasks', JSON.stringify(enrichedTasks));
    } catch (err) {
      console.error("Erro ao carregar dados do Kanban:", err);
      showToast("Erro ao carregar dados do Kanban do ClickUp.", "error");
    } finally {
      setLoadingKanban(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'kanban') {
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
        'Content-Type': 'application/json'
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
      headers: { 'Content-Type': 'application/json' },
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

      // 1. Atualização otimista local do estado do React
      setKanbanTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          const updatedFields = t.custom_fields 
            ? t.custom_fields.map(f => f.id === 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63' ? { ...f, value: targetOptionId } : f)
            : [{ id: 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63', value: targetOptionId }];
          return { ...t, custom_fields: updatedFields };
        }
        return t;
      }));

      // 2. Chamar APIs do ClickUp em paralelo
      const cleanTaskId = String(taskId).replace('#', '').trim();
      await Promise.all([
        updateTaskStage(cleanTaskId, targetOptionId),
        updateTaskClickupStatus(cleanTaskId, clickupStatus)
      ]);
      
      showToast(`Oportunidade atualizada no ClickUp!`, "success");
    } catch (err) {
      console.error("Erro na sincronização de estado:", err);
      showToast("Não foi possível atualizar o ClickUp.", "error");
      fetchKanbanData();
    }
  };

  // Handlers do Drag & Drop Nativo
  const handleDragStart = (e, task) => {
    window.getSelection()?.removeAllRanges();
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e, targetOptionId) => {
    e.preventDefault();
    try {
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;

      const task = kanbanTasks.find(t => t.id === taskId);
      if (!task) return;

      const currentOptionId = getTaskOptionId(task, kanbanColumns);
      if (currentOptionId === targetOptionId) return;

      await handleOpportunityStateChange(taskId, targetOptionId);
    } catch (dropErr) {
      console.error("Erro ao mover o card:", dropErr);
      showToast("Erro inesperado ao mover o card.", "error");
      fetchKanbanData();
    }
  };

  // Handler de Clique para abrir o Drawer
  const handleCardClick = (task) => {
    setSelectedTask(task);
    setClickupTaskId(task.id);
    setDrawerTab('details');
    setShowDrawer(true);
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
      const { data, error } = await supabaseClient
        .from('propostas')
        .select('id')
        .or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`)
        .order('created_at', { ascending: true })
        .limit(1);

      let proposalNumber = 'Nova vA';
      if (!error && data && data.length > 0) {
        proposalNumber = `#${data[0].id}`;
      }

      let clickupName = '';
      try {
        const taskRes = await fetch(`/clickup-api/task/${idWithoutHash}`);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          if (taskData.list && taskData.list.id) {
            setClickupListId(taskData.list.id);
          }
          if (taskData.name) {
            clickupName = taskData.name;
          }
        }
      } catch (clickupErr) {
        console.error("Erro ao obter detalhes da tarefa no ClickUp via proxy local:", clickupErr);
      }

      const params = new URLSearchParams(window.location.search);
      let nameParam = params.get('task_name') || '';
      if (nameParam.includes('{{') || nameParam.includes('}}')) {
        nameParam = '';
      }
      const decodedName = nameParam ? decodeURIComponent(nameParam) : (clickupName || `Projeto CRM #${clickupTaskId}`);

      setProjectContext({
        name: decodedName,
        proposal_number: proposalNumber
      });
    } catch (err) {
      console.error(err);
      setProjectContext({
        name: `Projeto CRM #${clickupTaskId}`,
        proposal_number: 'Nova vA'
      });
    }
  };

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

  // Carregar vendedores cadastrados
  const loadVendedores = async () => {
    try {
      const teamsRes = await fetch('/clickup-api/team');
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        if (teamsData.teams && teamsData.teams.length > 0) {
          const teamId = teamsData.teams[0].id;
          const membersRes = await fetch(`/clickup-api/team/${teamId}`);
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            if (membersData.team && membersData.team.members) {
              const users = membersData.team.members.map(m => m.user);
              const mapped = users.map(u => ({ id: u.id, nome: u.username || u.email }));
              setVendedores(mapped);
              localStorage.setItem('crm_cache_vendedores', JSON.stringify(mapped));
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
      const response = await fetch('/api/tarefas', {
        headers: {
          ...getSupabaseHeaders(),
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error("Erro na API ao carregar tarefas");
      const data = await response.json();
      console.log("[DEBUG] Loaded tasks with headers:", data);
      setCommercialTasks(data || []);
    } catch (err) {
      console.error("Erro ao buscar tarefas comerciais:", err);
      showToast("Erro ao carregar tarefas comerciais.", "error");
    } finally {
      setLoadingTasks(false);
    }
  };

  const toggleTaskStatus = async (task) => {
    const nextStatus = task.status === 'concluida' ? 'pendente' : 'concluida';
    
    console.log('[DEBUG] Checkbox clicado para a tarefa:', task.id, 'Novo Status:', nextStatus);
    setCommercialTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    
    try {
      const response = await fetch(`/api/tarefas/${task.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-supabase-url': localStorage.getItem('supa_url') || '',
          'x-supabase-key': localStorage.getItem('supa_key') || ''
        },
        body: JSON.stringify({ status: nextStatus })
      });
      
      if (!response.ok) {
        throw new Error("Erro na requisição para o servidor");
      }
      
      const data = await response.json();
      console.log('[DEBUG] Resposta do servidor para status:', data);
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
    // Optimistic update
    setCommercialTasks(prev => prev.filter(t => t.id !== taskId));
    
    try {
      const response = await fetch(`/api/tarefas/${taskId}`, {
        method: 'DELETE',
        headers: {
          'x-supabase-url': localStorage.getItem('supa_url') || '',
          'x-supabase-key': localStorage.getItem('supa_key') || ''
        }
      });
      
      if (!response.ok) {
        throw new Error("Erro ao excluir tarefa no servidor");
      }
      
      const data = await response.json();
      console.log('[DEBUG] Resposta do servidor para exclusao:', data);
      showToast("Tarefa comercial excluída com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] Falha ao excluir tarefa:", err);
      showToast("Erro ao excluir tarefa comercial. Recarregando...", "error");
      if (supabaseClient) {
        fetchCommercialTasks(supabaseClient);
      }
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
    
    // Resolve project/client name dynamically
    const activeProp = selectedProposalForTask || currentProposta;
    const activeProjectName = activeProp?.name || activeProp?.nome_projeto || activeProp?.projeto || activeProp?.cenario || (selectedTask ? selectedTask.name : "Projeto Sem Nome");

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
      const resolvedProp = currentProposta || (propostas && propostas.find(p => p.clickup_negocio_id === clickupTaskId || p.clickup_negocio_id === '#' + clickupTaskId)) || {
        clickup_negocio_id: clickupTaskId,
        nome_projeto: selectedTask ? selectedTask.name : "Negócio Atual"
      };
      setSelectedProposalForTask(resolvedProp);
      const cleanLabel = (raw) => String(raw || '')
        .replace(/^S\/N\s*\|\s*/i, '')
        .replace(/\s*-\s*[A-Z]+$/i, '')
        .trim();
      setSearchProposalQuery(cleanLabel(resolvedProp.nome_projeto || resolvedProp.projeto || "Negócio Atual"));
    } else {
      setSelectedProposalForTask(null);
      setSearchProposalQuery('');
    }
    
    setShowNewTaskModal(true);
  };

  const handleEditTaskClick = (task) => {
    console.log('[DEBUG] Inicializando modal de edição. Tarefa:', task);
    console.log('[DEBUG] Lista de negócios (Kanban) disponíveis (tamanho):', kanbanTasks ? kanbanTasks.length : 0);
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
    
    // Imprime uma amostra no console para diagnóstico estrutural
    if (listaParaBusca && listaParaBusca.length > 0) {
      console.log('[DEBUG] Amostra de estrutura de negócio (Kanban):', listaParaBusca[0]);
    }

    const negocioCorrespondente = listaParaBusca.find(p => {
      if (!p) return false;
      const matchClickUp = task.clickup_negocio_id && String(p.id).trim().toLowerCase() === String(task.clickup_negocio_id).trim().toLowerCase();
      return matchClickUp;
    });
    
    console.log('[DEBUG] Negócio resolvido por ID do Kanban na edição:', negocioCorrespondente);

    const activeDeal = negocioCorrespondente || {
      id: task.clickup_negocio_id,
      name: task.nome_projeto || "Projeto"
    };
    
    if (typeof setSelectedProposalForTask === 'function') {
      setSelectedProposalForTask(activeDeal);
    }
    const cleanLabel = (raw) => String(raw || '')
      .replace(/^S\/N\s*\|\s*/i, '')
      .replace(/\s*-\s*[A-Z]+$/i, '')
      .trim();
    setSearchProposalQuery(cleanLabel(activeDeal.name || "Negócio Atual"));
    
    setShowNewTaskModal(true);
  };

  useEffect(() => {
    if (activeTab === 'tasks' && supabaseClient) {
      const isSilent = commercialTasks && commercialTasks.length > 0;
      if (!isSilent) {
        setLoadingTasks(true);
      }
      Promise.all([
        fetchCommercialTasks(supabaseClient, isSilent),
        fetchKanbanData(),
        loadVendedores()
      ]).finally(() => {
        setLoadingTasks(false);
      });
    }
  }, [activeTab, supabaseClient]);

  // Carregar dados para o painel de relatórios
  const loadDashboardData = async (client = supabaseClient) => {
    if (!client) return;
    if (wonProposals.length === 0) {
      setLoadingDashboard(true);
    }
    try {
      const { data, error } = await client
        .from('propostas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Armazenar as propostas ganhas no estado anterior
      const won = (data || []).filter(p => p.situacao === 'Ganho');
      setWonProposals(won);

      // Calcular as métricas avançadas do dashboard
      calculateBIMetrics(data || []);

      await loadCommercialPanelData(client);
    } catch (err) {
      console.error("Erro ao carregar dados do dashboard:", err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.substring(0, 10).split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  };

  const calculateBIMetrics = (allProps) => {
    if (!allProps || allProps.length === 0) return;
    
    // Filtro do período atual
    const start = parseLocalDate(startDate) || new Date(2000, 0, 1);
    const end = parseLocalDate(endDate) || new Date(2100, 0, 1);
    end.setHours(23, 59, 59, 999);

    // Definir período comparativo pelas datas customizadas
    const compStart = parseLocalDate(compareStartDate);
    const compEnd = parseLocalDate(compareEndDate);
    if (compEnd) {
      compEnd.setHours(23, 59, 59, 999);
    }

    // Filtrar atuais
    const currentProps = allProps.filter(p => {
      const dateToUse = p.data_fechamento || p.created_at;
      if (!dateToUse) return false;
      const d = parseLocalDate(dateToUse);
      return d && d >= start && d <= end;
    });

    const wonCurrent = currentProps.filter(p => p.situacao && p.situacao.trim().toLowerCase() === 'ganho');
    const lostCurrent = currentProps.filter(p => p.situacao && p.situacao.trim().toLowerCase() === 'perdido');

    const wonCountCurrent = wonCurrent.length;
    const wonValueCurrent = wonCurrent.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
    const lostCountCurrent = lostCurrent.length;
    const lostValueCurrent = lostCurrent.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
    const closedCountCurrent = wonCountCurrent + lostCountCurrent;
    const convRateCurrent = closedCountCurrent > 0 ? (wonCountCurrent / closedCountCurrent) * 100 : 0;

    let wonQtyDiff = 0;
    let wonValDiff = 0;
    let lostQtyDiff = 0;
    let lostValDiff = 0;
    let convRateDiff = 0;

    if (compStart && compEnd) {
      const compProps = allProps.filter(p => {
        const dateToUse = p.data_fechamento || p.created_at;
        if (!dateToUse) return false;
        const d = parseLocalDate(dateToUse);
        return d && d >= compStart && d <= compEnd;
      });

      const wonComp = compProps.filter(p => p.situacao && p.situacao.trim().toLowerCase() === 'ganho');
      const lostComp = compProps.filter(p => p.situacao && p.situacao.trim().toLowerCase() === 'perdido');

      const wonCountComp = wonComp.length;
      const wonValueComp = wonComp.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
      const lostCountComp = lostComp.length;
      const lostValueComp = lostComp.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
      const closedCountComp = wonCountComp + lostCountComp;
      const convRateComp = closedCountComp > 0 ? (wonCountComp / closedCountComp) * 100 : 0;

      // Variações percentuais
      wonQtyDiff = wonCountComp > 0 ? ((wonCountCurrent - wonCountComp) / wonCountComp) * 100 : (wonCountCurrent > 0 ? 100 : 0);
      wonValDiff = wonValueComp > 0 ? ((wonValueCurrent - wonValueComp) / wonValueComp) * 100 : (wonValueCurrent > 0 ? 100 : 0);
      lostQtyDiff = lostCountComp > 0 ? ((lostCountCurrent - lostCountComp) / lostCountComp) * 100 : (lostCountCurrent > 0 ? 100 : 0);
      lostValDiff = lostValueComp > 0 ? ((lostValueCurrent - lostValueComp) / lostValueComp) * 100 : (lostValueCurrent > 0 ? 100 : 0);
      convRateDiff = convRateCurrent - convRateComp;
    }

    setBiMetrics({
      wonCount: wonCountCurrent,
      wonValue: wonValueCurrent,
      wonQtyDiff,
      wonValDiff,
      lostCount: lostCountCurrent,
      lostValue: lostValueCurrent,
      lostQtyDiff,
      lostValDiff,
      convRate: convRateCurrent,
      convRateDiff
    });
  };

  const loadCommercialPanelData = async (client = supabaseClient) => {
    if (!client) return;
    try {
      let query = client
        .from('itens_proposta')
        .select(`
          quantidade,
          preco_unitario,
          distribuidor_id,
          produto_id,
          propostas!inner(created_at),
          distribuidores(nome),
          produtos(fabricante)
        `);

      if (startDate) {
        query = query.gte('propostas.created_at', `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query = query.lte('propostas.created_at', `${endDate}T23:59:59.999Z`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCommercialData(data || []);
    } catch (err) {
      console.error("Erro ao carregar dados do painel comercial:", err);
    }
  };

  // Efeito para criar/destruir e atualizar gráficos do Chart.js
  useEffect(() => {
    if (activeTab !== 'relatorios' || loadingDashboard || !commercialData) {
      return;
    }

    // Destruir gráficos anteriores
    if (distributorChartInst.current) {
      distributorChartInst.current.destroy();
      distributorChartInst.current = null;
    }
    if (manufacturerChartInst.current) {
      manufacturerChartInst.current.destroy();
      manufacturerChartInst.current = null;
    }

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
            legend: {
              display: false
            },
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
            legend: {
              display: false
            },
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

    // Limpeza ao desmontar
    return () => {
      if (distributorChartInst.current) {
        distributorChartInst.current.destroy();
        distributorChartInst.current = null;
      }
      if (manufacturerChartInst.current) {
        manufacturerChartInst.current.destroy();
        manufacturerChartInst.current = null;
      }
    };
  }, [activeTab, loadingDashboard, distributorTotals, manufacturerTotals]);

  useEffect(() => {
    if (activeTab === 'relatorios' && dbConnected) {
      loadDashboardData();
    }
  }, [activeTab, dbConnected, startDate, endDate]);

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

  const fetchAllData = async () => {
    console.log('[DEBUG] Auto-polling: Atualizando dados silenciosamente...');
    try {
      await fetchKanbanData();
      if (supabaseClient) {
        await fetchCommercialTasks(supabaseClient);
      }
      if (dbConnected) {
        await loadDashboardData();
      }
      if (dbConnected && clickupTaskId) {
        await loadPropostas();
      }
    } catch (e) {
      console.error("Erro no auto-polling:", e);
    }
  };

  useEffect(() => {
    if (!session) return;

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        fetchAllData();
      }
    }, 180000);

    return () => clearInterval(intervalId);
  }, [session, dbConnected, clickupTaskId, supabaseClient]);

  const loadPropostas = async (targetId = null) => {
    if (!supabaseClient || !clickupTaskId) return;
    setLoading(true);
    try {
      const idWithoutHash = clickupTaskId.startsWith('#') ? clickupTaskId.substring(1) : clickupTaskId;
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
        
        loadProposalDetails(selected.id);
      } else {
        setCurrentProposta(null);
        setItens([]);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar propostas.', 'error');
    } finally {
      setLoading(false);
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

  const loadProposalDetails = async (proposalId) => {
    setLoading(true);
    try {
      const { data: prop, error: propErr } = await supabaseClient
        .from('propostas')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (propErr) throw propErr;
      setCurrentProposta(prop);
      const isProj = prop && (['HCI', 'Cloud', 'Tradicional', 'Upgrade'].map(x => x.toUpperCase()).includes((prop.cenario || '').toUpperCase()) || prop.cenario === '' || (prop.cenario || '').toUpperCase() === 'PROJETO');
      setIsProjeto(!!isProj);

      const { data: items, error: itemsErr } = await supabaseClient
        .from('itens_proposta')
        .select('*')
        .eq('proposta_id', proposalId)
        .order('created_at');

      if (itemsErr) throw itemsErr;
      setItens(items || []);
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
    
    localStorage.setItem('supa_url', url);
    localStorage.setItem('supa_key', key);
    
    setConfig({ url, anonKey: key });
    setShowSettingsModal(false);
    showToast('Configurações salvas com sucesso!', 'success');
  };

  const showToast = (msg, type = 'success') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
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

  // 6. Criar nova proposta inicial (vA) usando RPC
  const handleCreateInitialProposal = async () => {
    if (!supabaseClient || !clickupTaskId) return;
    setLoading(true);
    try {
      const { data: newProposalId, error } = await supabaseClient.rpc('gerar_nova_versao', {
        id_negocio: clickupTaskId,
        cenario_nome: currentProposta ? currentProposta.cenario : '',
        criador: currentProposta ? currentProposta.criado_por : 'Vendedor CRM'
      });

      if (error) throw error;
      
      showToast('Primeira versão (vA) iniciada!', 'success');
      loadPropostas(newProposalId);
    } catch (err) {
      console.error("Erro detalhado no insert inicial:", err);
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
          "Content-Type": "application/json"
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
            "Content-Type": "application/json"
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
                "Content-Type": "application/json"
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
            "Content-Type": "application/json"
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
                "Content-Type": "application/json"
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

      const { error: propError } = await supabaseClient
        .from('propostas')
        .update({
          cenario: currentProposta.cenario,
          criado_por: currentProposta.criado_por,
          situacao: currentProposta.situacao,
          total_proposta: realTimeGrandTotal,
          motivo_perda: currentProposta.situacao === 'Perdido' ? currentProposta.motivo_perda : null
        })
        .eq('id', currentProposta.id);

      if (propError) throw propError;

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

      // Se for a proposta selecionada, sincroniza o total atualizado direto para o ClickUp
      if (currentProposta.situacao === 'Selecionada') {
        await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, 'Save');
      }

      showToast('Proposta salva com sucesso!', 'success');
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

  // 8. Botão "Gerar Nova Versão" (Manual Frontend Clone para evitar erros da RPC antiga no banco)
  const handleGerarNovaVersao = async () => {
    if (!currentProposta || !clickupTaskId) return;
    setSaving(true);
    try {
      if (!isReadOnly) {
        await handleSaveProposal();
      }

      // 1. Calcula a próxima versão (vA -> vB -> ... -> vZ -> vAA)
      const nextVersao = getNextVersionLetter(currentProposta.versao);

      // 2. Marcar as propostas anteriores como Desconsideradas ou Ativas
      await supabaseClient
        .from('propostas')
        .update({ situacao: isProjeto ? 'Ativa' : 'Desconsiderada' })
        .eq('clickup_negocio_id', clickupTaskId)
        .in('situacao', ['Ativa', 'Selecionada']);

      // 3. Inserir a nova proposta herdando o responsável comercial
      const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : (currentProposta.criado_por || '');
      const { data: newProp, error: propErr } = await supabaseClient
        .from('propostas')
        .insert({
          clickup_negocio_id: clickupTaskId,
          versao: nextVersao,
          cenario: '',
          situacao: 'Ativa',
          total_proposta: currentProposta.total_proposta,
          criado_por: currentResponsavel
        })
        .select()
        .single();

      if (propErr) throw propErr;

      // 4. Clonar os itens no frontend usando distribuidor_id
      if (itens.length > 0) {
        const clonedItens = itens.map(item => ({
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

      showToast('Nova versão gerada com sucesso!', 'success');
      loadPropostas(newProp.id);
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

        // 3. Reseta os estados do React e a busca
        setCurrentProposta(null);
        setPropostas([]);
        setItens([]);
        setClickupTaskId('');
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

        // Verifica se a proposta deletada era a atualmente selecionada
        const isCurrentDeleted = currentProposta && currentProposta.id === targetProp.id;
        
        // Atualiza estado local propostas imediatamente
        setPropostas(prev => prev.filter(p => p.id !== targetProp.id));

        if (isCurrentDeleted) {
          const vaProp = propostas.find(p => p.versao === 'vA');
          if (vaProp && vaProp.id !== targetProp.id) {
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

  // 8.8. Alterar Situação Manualmente (Ativa, Selecionada ou Desconsiderada)
  const handleSituationChange = async (newSituacao) => {
    if (!currentProposta || !supabaseClient) return;
    if (newSituacao === 'Selecionada') {
      await handleSelectProposal();
      return;
    }
    if (newSituacao === 'Ganho') {
      setCloseDate(new Date().toISOString().split('T')[0]);
      setShowCloseModal('win');
      return;
    }
    if (newSituacao === 'Perdido') {
      setCloseDate(new Date().toISOString().split('T')[0]);
      setSelectedLossReason('');
      setShowCloseModal('loss');
      return;
    }

    setSaving(true);
    const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : '';
    try {
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: newSituacao,
          motivo_perda: null,
          criado_por: currentResponsavel
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      showToast(`Situação alterada para ${newSituacao}!`, 'success');
      
      setCurrentProposta({
        ...currentProposta,
        situacao: newSituacao,
        motivo_perda: null,
        criado_por: currentResponsavel
      });

      loadPropostas(currentProposta.id);
      await refreshSupabaseProposalsList();
      loadDashboardData();
      fetchKanbanData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar situação.', 'error');
    } finally {
      setSaving(false);
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
        "Content-Type": "application/json"
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

      // 3. Atualiza a proposta alvo no Supabase (coluna vendedor removida para evitar PGRST204)
      const updateData = { 
        situacao: newStatus,
        criado_por: currentResponsavel
      };
      if (newStatus === 'Selecionada') {
        updateData.total_proposta = realTimeGrandTotal;
      }

      const { error } = await supabaseClient
        .from('propostas')
        .update(updateData)
        .eq('id', versionId);

      if (error) throw error;

      // Se for Selecionada, atualiza no ClickUp
      if (newStatus === 'Selecionada') {
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

  const handleCreateVendedor = async (e) => {
    e.preventDefault();
    if (!newVendedorName.trim()) return;
    try {
      const { data, error } = await supabaseClient
        .from('vendedores')
        .insert({ nome: newVendedorName.trim() }).select().single();
      if (error) throw error;
      showToast('Vendedor adicionado!', 'success');
      setNewVendedorName('');
      await loadVendedores();
    } catch (err) {
      showToast(err.message || 'Erro ao cadastrar vendedor', 'error');
    }
  };

  const handleSaveVendedorEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient
        .from('vendedores')
        .update({ nome: editingVendedor.nome })
        .eq('id', editingVendedor.id);
      if (error) throw error;
      showToast('Vendedor atualizado com sucesso!', 'success');
      setEditingVendedor(null);
      loadVendedores();
    } catch (err) {
      console.error(err);
      showToast('Erro ao editar vendedor.', 'error');
    }
  };

  const handleDeleteVendedor = async (id) => {
    if (!confirm('Deseja realmente excluir este vendedor?')) return;
    try {
      const { error } = await supabaseClient.from('vendedores').delete().eq('id', id);
      if (error) throw error;
      showToast('Vendedor excluído com sucesso!', 'success');
      loadVendedores();
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir vendedor.', 'error');
    }
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
      <div className="flex flex-col space-y-4 h-full">
        {showHeader && (
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400">Timeline de Versões</h2>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs font-semibold text-slate-300">
              {propostas.length}
            </span>
          </div>
        )}

        {propostas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-4">
            <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-slate-400">Nenhuma proposta criada para este negócio.</p>
            <button 
              onClick={handleCreateInitialProposal}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white shadow-lg transition-all"
            >
              Criar Versão vA
            </button>
          </div>
        ) : (
          <div className="flex-1 space-y-3 pr-1 overflow-visible">
            {propostas.map((prop, i) => {
              const isSelected = currentProposta && currentProposta.id === prop.id;
              const statusColors = {
                 'Ativa': 'bg-blue-500 text-blue-100 border-blue-400/20',
                 'Selecionada': 'bg-emerald-500 text-emerald-100 border-emerald-400/20',
                 'Ganho': 'bg-amber-500 text-amber-950 border-amber-400/20 font-extrabold',
                 'Desconsiderada': 'bg-red-600 text-white border-red-500/20',
                 'Não selecionada': 'bg-slate-600 text-slate-300 border-slate-500/20',
                 'Substituída': 'bg-amber-600/70 text-amber-200 border-amber-500/20'
               };
              
              return (
                <div 
                  key={prop.id}
                  onClick={async () => {
                    await loadProposalDetails(prop.id);
                    setDrawerTab('budget');
                  }}
                  className={`p-3 rounded-xl cursor-pointer timeline-item glass-card transition-all ${
                    openMenuVersionId === prop.id ? 'relative z-40' : 'relative z-10'
                  } ${
                    isSelected ? 'active-glow border-indigo-500 bg-slate-800/80' : 'bg-slate-900/40 hover:bg-slate-800/30'
                  }`}
                >
                  <div className="timeline-line"></div>
                  
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-indigo-950 text-indigo-300 rounded-md text-xs font-bold border border-indigo-500/30">
                        {prop.versao}
                      </span>
                      <span className="text-xs font-medium text-slate-300 uppercase">{prop.cenario}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 relative" onClick={(e) => e.stopPropagation()}>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${statusColors[prop.situacao] || 'bg-slate-700'}`}>
                        {prop.situacao}
                      </span>
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuVersionId(openMenuVersionId === prop.id ? null : prop.id);
                          }}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                          title="Mudar Situação"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </button>
                        {openMenuVersionId === prop.id && (
                          <React.Fragment>
                            <div className="fixed inset-0 z-40 bg-transparent cursor-default" onClick={() => setOpenMenuVersionId(null)} />
                             <div className="absolute right-full top-0 mr-2 z-50 w-36 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1 block">
                               {['Ativa', 'Selecionada', 'Ganho', 'Desconsiderada', 'Perdido'].map(st => (
                                 <button
                                   key={st}
                                   onClick={async (e) => {
                                     e.stopPropagation();
                                     setOpenMenuVersionId(null);
                                     await loadProposalDetails(prop.id);
                                     if (st === 'Ganho') {
                                       setCloseDate(new Date().toISOString().split('T')[0]);
                                       setShowCloseModal('win');
                                     } else if (st === 'Perdido') {
                                       setCloseDate(new Date().toISOString().split('T')[0]);
                                       setSelectedLossReason('');
                                       setShowCloseModal('loss');
                                     } else {
                                       await handleUpdateVersionStatus(clickupTaskId || prop.clickup_negocio_id, prop.id, st);
                                     }
                                   }}
                                   className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                                 >
                                   {st}
                                 </button>
                               ))}
                               <div className="border-t border-slate-800 my-1"></div>
                               <button
                                 onClick={async (e) => {
                                   e.stopPropagation();
                                   setOpenMenuVersionId(null);
                                   await handleDeleteProposal(prop);
                                 }}
                                 className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/30 hover:text-red-300 font-medium"
                               >
                                 🗑️ Excluir
                               </button>
                             </div>
                          </React.Fragment>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-baseline mt-2">
                    <span className="text-[10px] text-slate-500">
                      {new Date(prop.created_at).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} • {prop.criado_por.split(' ')[0]}
                    </span>
                    <span className="text-sm font-bold text-white">
                      R$ {Number(isSelected ? realTimeGrandTotal : prop.total_proposta).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
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
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 mt-4 shadow-lg shadow-indigo-950/50 hover:bg-indigo-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>Gerar Nova Versão</span>
          </button>
        )}
      </div>
    );
  };

  const renderBudgetEditor = () => {
    if (loading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-medium">Processando dados da proposta...</p>
        </div>
      );
    }
    if (!currentProposta) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6">
          <div className="w-20 h-20 bg-indigo-950/50 rounded-full border border-indigo-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-2">Painel de Propostas Comerciais</h3>
            <p className="text-sm text-slate-400">Selecione ou gere uma nova proposta na timeline para carregar a tela de negociação.</p>
          </div>
        </div>
      );
    }

    const getTipoOportunidade = () => {
      const c = currentProposta.cenario || '';
      if (['HCI', 'Cloud', 'Tradicional', 'Upgrade'].includes(c)) return 'PROJETO';
      return c;
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <button 
            onClick={() => setDrawerTab('details')}
            className="flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Voltar para Detalhes</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 bg-slate-900/20 p-6 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <div>
                {projectContext.name && (
                  <h1 className="text-3xl font-extrabold text-indigo-400 tracking-tight mb-2">
                    {projectContext.name}
                  </h1>
                )}
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                  <h2 className="text-2xl font-bold text-white tracking-tight">Proposta {currentProposta.versao}</h2>
                  {currentProposta.cenario && (
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2.5 py-0.5 rounded-full uppercase font-bold">
                      {currentProposta.cenario}
                    </span>
                  )}
                  {isReadOnly && (
                    <span className="bg-amber-950/60 border border-amber-500/20 text-amber-300 text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold flex items-center space-x-1 pulse-badge">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Apenas Leitura</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-3 flex-wrap mt-1.5">
                  <p className="text-xs text-slate-400">
                    Criada em {new Date(currentProposta.created_at).toLocaleString('pt-BR')} {currentProposta.criado_por ? `por ${currentProposta.criado_por}` : ''}
                  </p>
                  {currentProposta.situacao === 'Ganho' && (
                    <span className="text-[11px] font-bold text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded-md border border-amber-500/30">
                      🏆 Ganho {currentProposta.data_fechamento ? `(${new Date(currentProposta.data_fechamento + 'T00:00:00').toLocaleDateString('pt-BR')})` : ''}
                    </span>
                  )}
                  {currentProposta.situacao === 'Perdido' && (
                    <span className="text-[11px] font-bold text-red-400 bg-red-950/80 px-2.5 py-0.5 rounded-md border border-red-500/30">
                      😞 Perdido: {currentProposta.motivo_perda || 'Outros'} {currentProposta.data_fechamento ? `(${new Date(currentProposta.data_fechamento + 'T00:00:00').toLocaleDateString('pt-BR')})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              {currentProposta.situacao !== 'Ganho' && (
                <button
                  onClick={() => {
                    setCloseDate(new Date().toISOString().split('T')[0]);
                    setShowCloseModal('win');
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-amber-950 rounded-xl text-xs font-black shadow-lg shadow-amber-950/30 transition-all flex items-center space-x-1.5"
                >
                  <span>🏆 Marcar como Ganha</span>
                </button>
              )}

              {currentProposta.situacao !== 'Perdido' && currentProposta.situacao !== 'Ganho' && (
                <button
                  onClick={() => {
                    setCloseDate(new Date().toISOString().split('T')[0]);
                    setSelectedLossReason('');
                    setShowCloseModal('loss');
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-red-950/30 transition-all flex items-center space-x-1.5"
                >
                  <span>😞 Marcar como Perdido</span>
                </button>
              )}

              {currentProposta.situacao !== 'Ganho' && (
                <button
                  onClick={() => handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, 'Selecionada')}
                  disabled={saving || currentProposta.situacao === 'Selecionada'}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-lg ${
                    currentProposta.situacao === 'Selecionada'
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/30'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    {currentProposta.situacao === 'Selecionada' ? '✓ Selecionada' : 
                     currentProposta.situacao === 'Desconsiderada' ? 'Reativar e Selecionar' : 'Selecionar'}
                  </span>
                </button>
              )}

              {!isReadOnly && (
                <button
                  onClick={handleSaveProposalDebounced}
                  disabled={saving}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-indigo-950/30 transition-all flex items-center justify-center"
                  title="Salvar Alterações"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                  )}
                </button>
              )}

              <button
                onClick={handleDeleteProposal}
                disabled={saving}
                className="p-2.5 bg-slate-900 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-900/50 rounded-xl transition-all flex items-center justify-center"
                title="Excluir Versão"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6 bg-slate-900/10 border-b border-slate-900 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Oportunidade</label>
              <select
                className="w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                value={getTipoOportunidade()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'PROJETO') {
                    setIsProjeto(true);
                    setCurrentProposta({ ...currentProposta, cenario: '' });
                  } else {
                    setIsProjeto(false);
                    setCurrentProposta({ ...currentProposta, cenario: val });
                  }
                }}
              >
                <option value="" disabled className="bg-slate-900 text-slate-400">Selecione o tipo de Oportunidade...</option>
                <option value="PROJETO" className="bg-slate-900 text-slate-200">PROJETO</option>
                <option value="GARANTIAS" className="bg-slate-900 text-slate-200">GARANTIAS</option>
                <option value="SERVIÇOS" className="bg-slate-900 text-slate-200">SERVIÇOS</option>
                <option value="SSU" className="bg-slate-900 text-slate-200">SSU</option>
                <option value="VOLUMES" className="bg-slate-900 text-slate-200">VOLUMES</option>
                <option value="UPGRADE" className="bg-slate-900 text-slate-200">UPGRADE</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Projeto</label>
              <select
                className="w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                value={currentProposta.cenario || ""}
                onChange={(e) => setCurrentProposta({ ...currentProposta, cenario: e.target.value })}
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
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Vendedor / Responsável</label>
              <select
                className="w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                value={currentProposta.criado_por || ""}
                onChange={(e) => setCurrentProposta({ ...currentProposta, criado_por: e.target.value })}
                disabled={isReadOnly}
              >
                <option value="">Selecione o vendedor...</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.nome} className="bg-slate-900 text-slate-200">{v.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Produtos e Serviços inclusos</h3>
              {!isReadOnly && (
                <button 
                  onClick={() => setShowProductModal(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                >
                  <span>+ Adicionar Novo Item ao Catálogo</span>
                </button>
              )}
            </div>

            {itens.length === 0 ? (
              <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
                <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <div>
                  <p className="text-sm text-slate-400 font-medium">Esta proposta ainda não tem nenhum item adicionado.</p>
                  {!isReadOnly && <p className="text-xs text-slate-500 mt-1">Adicione produtos do catálogo abaixo.</p>}
                </div>
                {!isReadOnly && (
                  <button
                    onClick={handleAddItem}
                    className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all"
                  >
                    Adicionar Primeiro Item
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto" style={{ overflow: 'visible', minHeight: '280px' }}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="pb-3">Produto [Fabricante]</th>
                      <th className="pb-3 w-2/12">Distribuidor</th>
                      <th className="pb-3 w-[60px] text-center">Qtd</th>
                      <th className="pb-3 w-2/12 text-right">Unitário</th>
                      <th className="pb-3 w-2/12 text-right">Subtotal</th>
                      {!isReadOnly && <th className="pb-3 w-[60px] text-center">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60">
                    {itens.map((item, index) => {
                      const subtotal = item.quantidade * item.preco_unitario || 0;
                      return (
                        <tr key={item.id} className="group hover:bg-slate-900/20 transition-colors">
                          <td className="py-3.5 pr-4 relative" style={{ overflow: 'visible' }}>
                            {isReadOnly ? (
                              <div className="text-sm font-semibold text-slate-200">
                                {produtos.find(p => p.id === item.produto_id)?.nome || 'Produto não encontrado'}
                                <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                                  Fabricante: {produtos.find(p => p.id === item.produto_id)?.fabricante || '-'}
                                </span>
                              </div>
                            ) : (
                              <React.Fragment>
                                <input
                                  type="text"
                                  className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                                  placeholder="Digite para buscar produto..."
                                  value={
                                    item.searchTerm !== undefined
                                      ? item.searchTerm
                                      : (produtos.find(p => p.id === item.produto_id)?.nome || '')
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleItemChange(index, { searchTerm: val, showDropdown: true });
                                  }}
                                  onFocus={() => {
                                    const currentVal = item.searchTerm !== undefined
                                      ? item.searchTerm
                                      : (produtos.find(p => p.id === item.produto_id)?.nome || '');
                                    handleItemChange(index, { searchTerm: currentVal, showDropdown: true });
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      handleItemChange(index, { showDropdown: false });
                                    }, 200);
                                  }}
                                />
                                
                                {item.showDropdown && (item.searchTerm !== undefined ? item.searchTerm : (produtos.find(p => p.id === item.produto_id)?.nome || '')) && (
                                  (() => {
                                    const searchVal = item.searchTerm !== undefined
                                      ? item.searchTerm
                                      : (produtos.find(p => p.id === item.produto_id)?.nome || '');
                                    const filtrados = produtos.filter(p => 
                                      (p.nome || '').toLowerCase().includes(searchVal.toLowerCase()) ||
                                      (p.fabricante || '').toLowerCase().includes(searchVal.toLowerCase())
                                    );
                                    return filtrados.length > 0 ? (
                                      <ul className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-800 rounded-xl max-h-48 overflow-y-auto shadow-2xl z-[9999] block divide-y divide-slate-800">
                                        {filtrados.map(p => (
                                          <li
                                            key={p.id}
                                            className="p-2.5 text-sm text-slate-300 hover:bg-indigo-600 hover:text-white cursor-pointer transition-colors block text-left"
                                            onMouseDown={() => {
                                              handleItemChange(index, { 
                                                produto_id: p.id, 
                                                searchTerm: p.nome, 
                                                unitario: p.custo_referencia || 0,
                                                showDropdown: false 
                                              });
                                            }}
                                          >
                                            <span className="font-medium">{p.nome}</span> 
                                            <span className="text-xs text-slate-500 ml-2">({p.fabricante})</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null;
                                  })()
                                )}
                              </React.Fragment>
                            )}
                          </td>

                          <td className="py-3.5 pr-4">
                            {isReadOnly ? (
                              <span className="text-sm text-slate-300">
                                {distribuidores.find(d => d.id === item.distribuidor_id)?.nome || '-'}
                              </span>
                            ) : (
                              <select
                                className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                                value={item.distribuidor_id || ''}
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

                          <td className="py-3.5 pr-4 text-center">
                            {isReadOnly ? (
                              <span className="text-sm font-bold text-slate-300">{item.quantidade}</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                className="w-16 mx-auto rounded-xl bg-slate-900 border border-slate-800 p-2 text-sm text-center text-slate-200 focus:outline-none focus:border-indigo-500"
                                value={item.quantidade}
                                onChange={(e) => handleItemChange(index, 'quantidade', e.target.value)}
                              />
                            )}
                          </td>

                          <td className="py-3.5 pr-4 text-right whitespace-nowrap">
                            {isReadOnly ? (
                              <span className="text-sm text-slate-300">
                                R$ {Number(item.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            ) : (
                              <div className="relative">
                                <span className="absolute left-2 top-2 text-xs text-slate-500">R$</span>
                                <input
                                  type="text"
                                  className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2 pl-7 text-sm text-right text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                                  value={formatMaskedCurrency(item.preco_unitario)}
                                  onChange={(e) => handleCurrencyInputChange(index, e.target.value)}
                                />
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 text-right font-bold text-slate-200 text-sm whitespace-nowrap">
                            R$ {subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>

                          {!isReadOnly && (
                            <td className="py-3.5 text-center">
                              <button
                                onClick={() => handleRemoveItem(index)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
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
                className="w-full mt-4 py-3 border border-dashed border-slate-800 hover:border-indigo-500/40 rounded-2xl text-xs font-semibold text-slate-500 hover:text-indigo-400 bg-slate-900/10 hover:bg-slate-900/30 transition-all flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>Adicionar Item</span>
              </button>
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-900/30 p-6 flex flex-col md:flex-row justify-between items-center">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Resumo Comercial</span>
              <p className="text-xs text-slate-400 mt-1">Cálculo ativo com base em {itens.length} {itens.length === 1 ? 'item' : 'itens'}.</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total da Proposta</span>
              <span className="text-3xl font-extrabold text-indigo-400">
                R$ {realTimeGrandTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
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
    <div className="flex-1 flex flex-col overflow-hidden">
      
      {/* 1. Header do Sistema */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-wide">Suprimática CRM</h1>
              {activeTab === 'propostas' && projectContext.name && (
                <span className="text-[10px] text-indigo-300 font-bold bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-500/20" title={projectContext.name}>
                  {projectContext.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Gerador de Propostas
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Busca Proativa do ClickUp baseada no número comercial */}
          {activeTab === 'propostas' && (
            <div className="flex flex-col items-end space-y-1">
              <div className="flex items-center space-x-2">
                <div className="flex items-center bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1 space-x-2 h-9">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Proposta:</span>
                  <input 
                    type="text" 
                    className="bg-transparent border-0 p-0 text-sm text-slate-200 font-bold focus:ring-0 focus:outline-none w-48"
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
            <span className="text-xs text-slate-400 hidden sm:inline">{dbConnected ? 'Supabase Ativo' : 'Supabase Offline'}</span>
          </div>

          <button 
            onClick={() => setShowSettingsModal(true)}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
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
                setSession(null);
                showToast("Sessão encerrada com sucesso.", "success");
              }
            }}
            className="p-2 text-red-400 hover:text-red-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            title="Sair / Logout"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. Sub-Header: Seleção de Abas do Sistema (Alinhado à Direita) */}
      <div className="flex justify-end bg-slate-950 px-6 pt-3 pb-1 space-x-2 z-10">
        <button
          onClick={() => setActiveTab('relatorios')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'relatorios' 
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40' 
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80'
          }`}
        >
          Relatórios
        </button>
        <button
          onClick={() => setActiveTab('kanban')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'kanban' 
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40' 
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80'
          }`}
        >
          Pipeline de Vendas (Kanban)
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'tasks' 
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40' 
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80'
          }`}
        >
          Tarefas Comerciais
        </button>
      </div>

      {/* Alertas Globais */}
      {errorMsg && (
        <div className="fixed top-20 right-6 z-50 bg-red-950/90 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md animate-bounce">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* 3. Conteúdo Principal */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ABA 0: RELATÓRIOS / DASHBOARD (Painel Comercial) */}
        {activeTab === 'relatorios' && (
          <main className="flex-1 flex flex-col bg-slate-950 p-6 overflow-y-auto">
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-white tracking-tight">Relatórios</h2>
                <p className="text-xs text-slate-400">Distribuição de faturamento acumulado por distribuidor e fabricante.</p>
              </div>

              {/* Seletor de Período e Comparativo */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-2.5 shadow-lg">
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fim</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Início Comp.</label>
                  <input
                    type="date"
                    value={compareStartDate}
                    onChange={(e) => setCompareStartDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fim Comp.</label>
                  <input
                    type="date"
                    value={compareEndDate}
                    onChange={(e) => setCompareEndDate(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
                  />
                </div>
                <button
                  onClick={() => loadDashboardData()}
                  disabled={loadingDashboard}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-950/30 active:scale-95"
                >
                  {loadingDashboard ? '...' : 'Filtrar'}
                </button>
              </div>
            </div>

            {/* Card Informativo de Integridade de Dados */}
            <div className="mb-4 p-2 px-3 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center space-x-2 text-[11px] text-slate-400">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="leading-none">
                <strong className="text-slate-300 font-bold">Nota de Integridade:</strong> Os totais deste painel refletem os itens detalhados no <strong className="text-indigo-400">Supabase</strong>. O tabuleiro Kanban reflete o faturamento total das oportunidades no <strong className="text-indigo-400">ClickUp</strong>.
              </span>
            </div>

            {/* Cards Executivos de BI */}
            {!loadingDashboard && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Card 1: Negócios Convertidos */}
                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700/60 hover:shadow-lg hover:shadow-indigo-950/10">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 z-10">Negócios Convertidos (Ganhos)</span>
                  <svg className="w-9 h-9 text-emerald-400/25 absolute top-3 right-3 pointer-events-none z-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex items-baseline space-x-2 z-10">
                    <span className="text-2xl font-black text-white">{biMetrics.wonCount}</span>
                    <span className="text-xs text-slate-400">propostas</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-400 mt-1 z-10">
                    R$ {biMetrics.wonValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {compareStartDate && compareEndDate && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs z-10">
                      <span className={`font-bold flex items-center ${biMetrics.wonValDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biMetrics.wonValDiff >= 0 ? '▲' : '▼'} {Math.abs(biMetrics.wonValDiff).toFixed(1)}%
                      </span>
                      <span className="text-slate-500">vs período anterior</span>
                    </div>
                  )}
                </div>

                {/* Card 2: Negócios Perdidos */}
                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700/60 hover:shadow-lg hover:shadow-indigo-950/10">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 z-10">Negócios Perdidos</span>
                  <svg className="w-9 h-9 text-rose-400/25 absolute top-3 right-3 pointer-events-none z-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex items-baseline space-x-2 z-10">
                    <span className="text-2xl font-black text-white">{biMetrics.lostCount}</span>
                    <span className="text-xs text-slate-400">propostas</span>
                  </div>
                  <div className="text-xl font-bold text-red-400 mt-1 z-10">
                    R$ {biMetrics.lostValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {compareStartDate && compareEndDate && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs z-10">
                      <span className={`font-bold flex items-center ${biMetrics.lostValDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biMetrics.lostValDiff <= 0 ? '▼' : '▲'} {Math.abs(biMetrics.lostValDiff).toFixed(1)}%
                      </span>
                      <span className="text-slate-500">vs período anterior</span>
                    </div>
                  )}
                </div>

                {/* Card 3: Taxa de Conversão */}
                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700/60 hover:shadow-lg hover:shadow-indigo-950/10">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 z-10">Taxa de Conversão Geral</span>
                  <svg className="w-9 h-9 text-indigo-400/25 absolute top-3 right-3 pointer-events-none z-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                  <div className="text-3xl font-black text-indigo-400 mt-1 z-10">
                    {biMetrics.convRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1 z-10">
                    sobre total fechado ({biMetrics.wonCount + biMetrics.lostCount})
                  </div>
                  {compareStartDate && compareEndDate && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs">
                      <span className={`font-bold flex items-center ${biMetrics.convRateDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biMetrics.convRateDiff >= 0 ? '▲ +' : '▼ '} {biMetrics.convRateDiff.toFixed(1)} pp
                      </span>
                      <span className="text-slate-500">vs período anterior</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {loadingDashboard ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-20">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-sm text-slate-400 font-medium">Carregando dados consolidados...</p>
              </div>
            ) : !commercialData || commercialData.length === 0 ? (
              <div className="flex-1 border border-dashed border-slate-800 rounded-2xl p-16 text-center flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto my-10 bg-slate-900/10">
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-3xl">📊</div>
                <div>
                  <h3 className="text-base font-bold text-white">Nenhum dado encontrado</h3>
                  <p className="text-xs text-slate-500 mt-2">Não existem itens de propostas criadas no período de {new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico A: Distribuidor */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:border-slate-800">
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">Distribuição por Distribuidor</h3>
                      <p className="text-xs text-slate-500">Faturamento total acumulado agrupado por Distribuidor</p>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedDistributorFilter}
                        onChange={(e) => setSelectedDistributorFilter(e.target.value)}
                        className="appearance-none bg-slate-900 border border-slate-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
                      >
                        <option value="all">Todos</option>
                        {Array.from(new Set(
                          commercialData
                            .map(item => item.distribuidores?.nome)
                            .filter(Boolean)
                        )).sort((a, b) => a.localeCompare(b)).map(dist => (
                          <option key={dist} value={dist}>{dist}</option>
                        ))}
                      </select>
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="relative h-64 w-full flex items-center justify-center">
                    <canvas ref={distributorCanvasRef}></canvas>
                    <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
                      <span className="text-lg font-black text-white">{formatValueCompact(distributorTotalSum)}</span>
                    </div>
                  </div>
                  {/* Legenda HTML Customizada */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-6 pt-4 border-t border-slate-800/60 max-h-40 overflow-y-auto pr-1">
                    {Object.keys(distributorTotals).map((label, idx) => {
                      const val = distributorTotals[label];
                      const percent = distributorTotalSum > 0 ? Math.round((val / distributorTotalSum) * 100) : 0;
                      const color = chartColors[idx % chartColors.length];
                      return (
                        <div key={label} className="flex items-center justify-between text-xs py-1">
                          <div className="flex items-center space-x-2 truncate mr-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-slate-400 truncate">{label}</span>
                          </div>
                          <span className="font-bold text-slate-300">{percent}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gráfico B: Fabricante */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:border-slate-800">
                  <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">Distribuição por Fabricante</h3>
                      <p className="text-xs text-slate-500">Faturamento total acumulado agrupado por Fabricante</p>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedManufacturerFilter}
                        onChange={(e) => setSelectedManufacturerFilter(e.target.value)}
                        className="appearance-none bg-slate-900 border border-slate-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
                      >
                        <option value="all">Todos</option>
                        {Array.from(new Set(
                          commercialData
                            .map(item => item.produtos?.fabricante)
                            .filter(Boolean)
                        )).sort((a, b) => a.localeCompare(b)).map(fab => (
                          <option key={fab} value={fab}>{fab}</option>
                        ))}
                      </select>
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="relative h-64 w-full flex items-center justify-center">
                    <canvas ref={manufacturerCanvasRef}></canvas>
                    <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
                      <span className="text-lg font-black text-white">{formatValueCompact(manufacturerTotalSum)}</span>
                    </div>
                  </div>
                  {/* Legenda HTML Customizada */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-6 pt-4 border-t border-slate-800/60 max-h-40 overflow-y-auto pr-1">
                    {Object.keys(manufacturerTotals).map((label, idx) => {
                      const val = manufacturerTotals[label];
                      const percent = manufacturerTotalSum > 0 ? Math.round((val / manufacturerTotalSum) * 100) : 0;
                      const color = chartColors[idx % chartColors.length];
                      return (
                        <div key={label} className="flex items-center justify-between text-xs py-1">
                          <div className="flex items-center space-x-2 truncate mr-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-slate-400 truncate">{label}</span>
                          </div>
                          <span className="font-bold text-slate-300">{percent}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        {/* ABA 1: TABULEIRO KANBAN (PIPELINE DE VENDAS) */}
        {activeTab === 'kanban' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {loadingKanban ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-slate-400 font-medium">Carregando oportunidades do ClickUp...</p>
              </div>
            ) : (
              <React.Fragment>
                <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-3 bg-slate-900/40 border-b border-slate-800/80 flex-shrink-0 space-y-3 md:space-y-0">
                  <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Exibir Estágios:</span>
                    <button 
                      onClick={() => setShowGanhoCol(!showGanhoCol)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                        showGanhoCol 
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>🏆 Ganho</span>
                    </button>
                    <button 
                      onClick={() => setShowPerdidoCol(!showPerdidoCol)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                        showPerdidoCol 
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>😞 Perdido</span>
                    </button>
                    <button 
                      onClick={() => setShowCongeladoCol(!showCongeladoCol)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                        showCongeladoCol 
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>❄️ Congelado</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ordenar por:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          localStorage.setItem('crm_sort_order', newValue);
                          setSortBy(newValue);
                        }}
                        className="rounded-xl bg-slate-900 border border-slate-800 p-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                        if (!nextVal) {
                          setFilterStage(null);
                        }
                      }} 
                      className={`mr-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showForecast ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      📈 Forecast
                    </button>
                  </div>
                </div>

                {showForecast && (
                  <ForecastFunnelPanel 
                    kanbanColumns={kanbanColumns}
                    kanbanTasks={kanbanTasks}
                    showGanhoCol={showGanhoCol}
                    showPerdidoCol={showPerdidoCol}
                    showCongeladoCol={showCongeladoCol}
                    filterStage={filterStage}
                    setFilterStage={setFilterStage}
                    getTaskOptionId={getTaskOptionId}
                    getOpportunityValue={getOpportunityValue}
                  />
                )}

                <div className="kanban-board">
                  {kanbanColumns.map(col => {
                    if (filterStage && col.id !== filterStage) return null;
                    const colName = col.name.toLowerCase();
                    if (colName.includes("ganho") && !showGanhoCol) return null;
                    if (colName.includes("perdido") && !showPerdidoCol) return null;
                    if (colName.includes("congelado") && !showCongeladoCol) return null;
                    
                    const tasksInCol = kanbanTasks.filter(t => getTaskOptionId(t, kanbanColumns) === col.id);
                    
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
                            <span className="text-sm font-bold text-white uppercase tracking-wider">{col.name}</span>
                          </div>
                          <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs font-bold text-slate-400">
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
                              : 'Sem Valor';
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
                               />
                             );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            )}
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Tarefas Comerciais</h1>
                <p className="text-xs text-slate-400 mt-1">Gerenciamento e controle de atividades integradas ao ClickUp</p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Responsável:</span>
                  <select
                    value={tasksFilterAssignee}
                    onChange={(e) => setTasksFilterAssignee(e.target.value)}
                    className="rounded-xl bg-slate-900 border border-slate-800 p-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">Todos</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={String(v.id)}>{v.nome}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setTasksShowCompleted(!tasksShowCompleted)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    tasksShowCompleted 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {tasksShowCompleted ? '✓ Mostrando Concluídas' : 'Mostrar Concluídas'}
                </button>

                <button
                  onClick={() => {
                    setSelectedProposalForTask(null);
                    setSearchProposalQuery('');
                    setProposalSearchResults([]);
                    setShowNewTaskModal(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1"
                >
                  <span>➕ Nova Tarefa</span>
                </button>
              </div>
            </div>

            {loadingTasks ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-sm text-slate-400 font-medium">Carregando tarefas comerciais...</p>
              </div>
            ) : (() => {
              const filtered = commercialTasks.filter(task => {
                if (tasksFilterAssignee !== 'all' && String(task.responsavel_clickup_id) !== tasksFilterAssignee) {
                  return false;
                }
                if (!tasksShowCompleted && task.status === 'concluida') {
                  return false;
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-4">
                    <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800 text-3xl">
                      📋
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white mb-1">Nenhuma tarefa encontrada</h3>
                      <p className="text-xs text-slate-500">Não há tarefas comerciais registradas para os filtros selecionados.</p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4 w-12">Status</th>
                        <th className="py-3 px-4">Título</th>
                        <th className="py-3 px-4">Negócio/Proposta</th>
                        <th className="py-3 px-4">Tipo</th>
                        <th className="py-3 px-4">Vencimento</th>
                        <th className="py-3 px-4">Responsável</th>
                        <th className="py-3 px-4 w-16 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-xs">
                      {filtered.map(task => {
                        const isDone = task.status === 'concluida';
                        const typeColors = {
                          'Ligação': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                          'Reunião': 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
                          'E-mail': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                          'Follow-up': 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        };
                        const matchedUser = vendedores.find(v => String(v.id) === String(task.responsavel_clickup_id));
                        const assigneeName = matchedUser ? matchedUser.nome : (task.responsavel_clickup_id || 'Não assinalado');
                        
                        const proposalText = (() => {
                          const localProps = (typeof propostas !== 'undefined' && Array.isArray(propostas) ? propostas : []) || 
                                             (typeof proposals !== 'undefined' && Array.isArray(proposals) ? proposals : []);
                                             
                          const matchedProp = localProps.find(p => 
                            (task.proposta_id && p.id === task.proposta_id) || 
                            (task.clickup_negocio_id && p.clickup_negocio_id === task.clickup_negocio_id)
                          );

                          const propObj = Array.isArray(task.propostas) ? task.propostas[0] : task.propostas;

                          const resolvedName = matchedProp?.nome_projeto || 
                                               matchedProp?.projeto || 
                                               task.nome_projeto || 
                                               propObj?.nome_projeto || 
                                               propObj?.cenario || 
                                               task.proposta?.nome_projeto;

                          const resolvedVersion = matchedProp?.versao || propObj?.versao || task.proposta?.versao || "";
                          const versionPrefix = resolvedVersion ? `v${resolvedVersion} - ` : "";

                          const resolvedClickUpId = matchedProp?.clickup_negocio_id || task.clickup_negocio_id || propObj?.clickup_negocio_id;
                          const clickUpSuffix = resolvedClickUpId ? ` (#${resolvedClickUpId})` : "";

                          if (!resolvedName || resolvedName === "Sem Proposta") {
                            return "Sem Proposta";
                          }
                          return `${versionPrefix}${resolvedName}${clickUpSuffix}`;
                        })();

                        return (
                          <tr key={task.id} className="hover:bg-slate-900/20 transition-colors">
                            <td className="py-3.5 px-4">
                              <input
                                type="checkbox"
                                checked={isDone}
                                onChange={() => toggleTaskStatus(task)}
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className={`py-3.5 px-4 font-semibold ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                              {task.titulo}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {(() => {
                                // 1. Tenta buscar nas propostas físicas do Supabase
                                const localProps = (typeof propostas !== 'undefined' && Array.isArray(propostas) ? propostas : []) || 
                                                   (typeof proposals !== 'undefined' && Array.isArray(proposals) ? proposals : []);
                                                   
                                let matchedProp = localProps.find(p => 
                                  (task.proposta_id && p.id === task.proposta_id) || 
                                  (task.clickup_negocio_id && p.clickup_negocio_id === task.clickup_negocio_id)
                                );

                                if (matchedProp) {
                                  return matchedProp.nome_projeto || matchedProp.projeto || "Projeto";
                                }

                                // 2. FALLBACK DE OURO: Busca o nome diretamente na lista de cards/negócios do Kanban do React
                                const activeKanbanCards = (typeof kanbanTasks !== 'undefined' ? kanbanTasks : null) || [];

                                const matchedKanbanCard = Array.isArray(activeKanbanCards) && activeKanbanCards.find(c => 
                                  c.id === task.clickup_negocio_id || c.clickup_id === task.clickup_negocio_id
                                );

                                if (matchedKanbanCard) {
                                  return matchedKanbanCard.name || matchedKanbanCard.nome || matchedKanbanCard.nome_projeto || "Projeto Sem Nome";
                                }

                                // 3. Fallbacks de segurança
                                if (task.nome_projeto && task.nome_projeto !== "Sem Proposta") return task.nome_projeto;
                                if (task.proposta?.nome_projeto) return task.proposta.nome_projeto;

                                return "Sem Proposta";
                              })()}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeColors[task.tipo] || 'bg-slate-800'}`}>
                                {task.tipo}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-300">
                              {new Date(task.data_vencimento).toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400 font-medium">
                              👤 {assigneeName}
                            </td>
                            <td className="py-3.5 px-4 text-center flex items-center justify-center space-x-2">
                              {/* Editar (Lápis) */}
                              <button
                                onClick={() => handleEditTaskClick(task)}
                                className="p-1 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Editar Tarefa"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                              </button>
                              {/* Excluir (Lixeira) */}
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Excluir Tarefa"
                              >
                                <svg className="w-4 h-4 text-slate-400 hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

      </div>

      {/* 4. Modal de Configurações Completo */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative">
            <button 
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Cabeçalho do Modal */}
            <div className="border-b border-slate-800 p-6 bg-slate-900/60">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                </svg>
                <span>Painel de Configurações e Cadastros</span>
              </h3>
            </div>

            {/* Corpo do Modal com Abas Laterais */}
            <div className="flex-1 flex overflow-hidden">
              {/* Menu Lateral de Abas */}
              <aside className="w-1/4 border-r border-slate-800 bg-slate-950/20 p-4 space-y-2 flex flex-col">
                <button
                  onClick={() => setSettingsActiveTab('products')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    settingsActiveTab === 'products'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
                >
                  Catálogo de Produtos
                </button>
                <button
                  onClick={() => setSettingsActiveTab('distributors')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    settingsActiveTab === 'distributors'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
                >
                  Distribuidores
                </button>
                <button
                  onClick={() => setSettingsActiveTab('venders')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    settingsActiveTab === 'venders'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
                >
                  Vendedores
                </button>
              </aside>

              {/* Área de Conteúdo da Aba Ativa */}
              <main className="flex-1 p-6 overflow-y-auto bg-slate-950/50">
                {/* 2. ABA PRODUTOS */}
                {settingsActiveTab === 'products' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-white">Catálogo de Produtos</h2>
                        <p className="text-xs text-slate-400 font-medium">Gerencie o portfólio de ofertas e importe tabelas em lote.</p>
                      </div>
                      <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-semibold">
                        {produtos.length} SKUs
                      </span>
                    </div>

                    {/* Cadastrar/Editar Produto */}
                    <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
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
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">Fabricante</label>
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
                            className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-1">Nome do Produto</label>
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
                            className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-400 font-semibold mb-1">Custo de Referência</label>
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
                              className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 text-right"
                            />
                          </div>
                          <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md self-end h-[34px]"
                          >
                            {editingProduct ? 'Salvar' : 'Cadastrar'}
                          </button>
                          {editingProduct && (
                            <button 
                              type="button"
                              onClick={() => setEditingProduct(null)}
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all self-end h-[34px]"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {/* Tabela de Produtos */}
                    <div className="max-h-60 overflow-y-auto bg-slate-950/40 border border-slate-800/40 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="p-3">Fabricante</th>
                            <th className="p-3">Nome do Produto</th>
                            <th className="p-3 text-right">Preço de Referência</th>
                            <th className="p-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {produtos.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-6 text-center text-slate-500">Nenhum produto cadastrado.</td>
                            </tr>
                          ) : (
                            produtos.map(p => (
                              <tr key={p.id} className="hover:bg-slate-900/10">
                                <td className="p-3 font-semibold text-slate-300">{p.fabricante}</td>
                                <td className="p-3 text-slate-200">{p.nome}</td>
                                <td className="p-3 text-right font-mono text-slate-200">
                                  R$ {Number(p.custo_referencia).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </td>
                                <td className="p-3 text-center space-x-1.5">
                                  <button 
                                    onClick={() => setEditingProduct(p)}
                                    className="text-indigo-400 hover:text-indigo-300"
                                  >
                                    Editar
                                  </button>
                                  <span>•</span>
                                  <button 
                                    onClick={() => handleDeleteProduct(p.id)}
                                    className="text-red-400 hover:text-red-300"
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
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                          Importação de Produtos em Lote
                        </h3>
                        <div className="flex items-center space-x-2">
                          <label className="text-[10px] text-slate-400 font-semibold">Formato:</label>
                          <select 
                            value={importFormat} 
                            onChange={(e) => setImportFormat(e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded p-1 focus:outline-none"
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
                          className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono"
                          placeholder={
                            importFormat === 'csv' 
                              ? 'Dell Technologies;Servidor PowerEdge R760;25000.00\nVMware;Licença vSphere Standard;1200.50'
                              : '<produtos>\n  <produto>\n    <fabricante>Dell</fabricante>\n    <nome>Servidor R760</nome>\n    <custo>25000.00</custo>\n  </produto>\n</produtos>'
                          }
                        />
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] text-slate-500">
                            Cole as linhas ou a estrutura XML no campo de texto e clique em Processar Lote.
                          </p>
                          <button
                            onClick={handleBatchImport}
                            disabled={saving}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-1.5"
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
                      <h2 className="text-base font-bold text-white">Distribuidores Autorizados</h2>
                      <p className="text-[11px] text-slate-400 font-medium">Lista fechada de distribuidores no CRM.</p>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
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
                          className="flex-1 rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <button 
                          type="submit"
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                        >
                          {editingDistributor ? 'Salvar' : 'Adicionar'}
                        </button>
                        {editingDistributor && (
                          <button 
                            type="button"
                            onClick={() => setEditingDistributor(null)}
                            className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
                          >
                            Cancelar
                          </button>
                        )}
                      </form>
                    </div>

                    <div className="max-h-60 overflow-y-auto bg-slate-950/40 border border-slate-800/40 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="p-3">Nome</th>
                            <th className="p-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {distribuidores.length === 0 ? (
                            <tr>
                              <td colSpan="2" className="p-6 text-center text-slate-500">Nenhum distribuidor cadastrado.</td>
                            </tr>
                          ) : (
                            distribuidores.map(d => (
                              <tr key={d.id} className="hover:bg-slate-900/10">
                                <td className="p-3 font-semibold text-slate-300">{d.nome}</td>
                                <td className="p-3 text-center space-x-1.5">
                                  <button 
                                    onClick={() => setEditingDistributor(d)}
                                    className="text-indigo-400 hover:text-indigo-300"
                                  >
                                    Editar
                                  </button>
                                  <span>•</span>
                                  <button 
                                    onClick={() => handleDeleteDistributor(d.id)}
                                    className="text-red-400 hover:text-red-300"
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
                      <h2 className="text-base font-bold text-white">Vendedores Cadastrados</h2>
                      <p className="text-[11px] text-slate-400 font-medium">Gerencie a equipe de vendas.</p>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
                        {editingVendedor ? 'Editar Vendedor' : 'Novo Vendedor'}
                      </h3>
                      <form 
                        onSubmit={editingVendedor ? handleSaveVendedorEdit : handleCreateVendedor}
                        className="flex gap-2"
                      >
                        <input 
                          type="text" 
                          required
                          placeholder="Ex: Ana Silva"
                          value={editingVendedor ? editingVendedor.nome : newVendedorName}
                          onChange={(e) => {
                            if (editingVendedor) {
                              setEditingVendedor({ ...editingVendedor, nome: e.target.value });
                            } else {
                              setNewVendedorName(e.target.value);
                            }
                          }}
                          className="flex-1 rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <button 
                          type="submit"
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                        >
                          {editingVendedor ? 'Salvar' : 'Adicionar'}
                        </button>
                        {editingVendedor && (
                          <button 
                            type="button"
                            onClick={() => setEditingVendedor(null)}
                            className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
                          >
                            Cancelar
                          </button>
                        )}
                      </form>
                    </div>

                    <div className="max-h-60 overflow-y-auto bg-slate-950/40 border border-slate-800/40 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="p-3">Nome</th>
                            <th className="p-3 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {vendedores.length === 0 ? (
                            <tr>
                              <td colSpan="2" className="p-6 text-center text-slate-500">Nenhum vendedor cadastrado.</td>
                            </tr>
                          ) : (
                            vendedores.map(v => (
                              <tr key={v.id} className="hover:bg-slate-900/10">
                                <td className="p-3 font-semibold text-slate-300">{v.nome}</td>
                                <td className="p-3 text-center space-x-1.5">
                                  <button 
                                    onClick={() => setEditingVendedor(v)}
                                    className="text-indigo-400 hover:text-indigo-300"
                                  >
                                    Editar
                                  </button>
                                  <span>•</span>
                                  <button 
                                    onClick={() => handleDeleteVendedor(v.id)}
                                    className="text-red-400 hover:text-red-300"
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
              </main>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal de Adicionar Novo Item no Catálogo */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowProductModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-bold text-white mb-2">Adicionar Novo Produto</h3>
            <p className="text-xs text-slate-400 mb-6">Adicione um novo produto ou licença ao catálogo do sistema.</p>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Nome do Produto</label>
                <input 
                  type="text" 
                  required
                  value={newProduct.nome}
                  onChange={(e) => setNewProduct({ ...newProduct, nome: e.target.value })}
                  placeholder="Ex: Servidor Dell PowerEdge R760"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fabricante</label>
                  <input 
                    type="text" 
                    required
                    value={newProduct.fabricante}
                    onChange={(e) => setNewProduct({ ...newProduct, fabricante: e.target.value })}
                    placeholder="Ex: Dell Technologies"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custo de Referência</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-500">R$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={newProduct.custo_referencia}
                      onChange={(e) => setNewProduct({ ...newProduct, custo_referencia: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2 pl-8 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
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
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
            <button 
              onClick={() => setShowCloseModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-bold text-white mb-2">
              {showCloseModal === 'win' ? '🏆 Fechamento - Proposta Ganha' : '😞 Fechamento - Proposta Perdida'}
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              {showCloseModal === 'win' 
                ? 'Insira os dados do fechamento do negócio ganho.' 
                : 'Insira o principal motivo e a data do fechamento do negócio perdido.'}
            </p>

            <div className="space-y-4">
              {/* Se for Perdida, exibe o Dropdown de motivo */}
              {showCloseModal === 'loss' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Motivo da Perda</label>
                  <select 
                    value={selectedLossReason}
                    onChange={(e) => setSelectedLossReason(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data do Fechamento</label>
                <input 
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="border-b border-slate-800 p-5 bg-slate-900/60 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span>📋 {editingTask ? 'Editar Tarefa Comercial' : 'Nova Tarefa Comercial'}</span>
              </h3>
              <button 
                onClick={() => {
                  setShowNewTaskModal(false);
                  setSelectedProposalForTask(null);
                  setSearchProposalQuery('');
                  setProposalSearchResults([]);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Negócio
                </label>
                <div className="relative">
                  {/* Input + clear button row */}
                  <div className={`flex items-center w-full rounded-xl border transition-all ${
                    selectedProposalForTask
                      ? 'bg-indigo-950/25 border-indigo-500/40'
                      : 'bg-slate-950 border-slate-800 focus-within:border-indigo-500'
                  }`}>
                    {/* Search icon */}
                    <span className="pl-3 text-slate-500 flex-shrink-0">
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
                          // Filter local kanbanTasks
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
                      placeholder="Comece a digitar para buscar o negócio..."
                      className="flex-1 bg-transparent pl-2 pr-2 py-2.5 text-sm text-slate-200 focus:outline-none placeholder-slate-600"
                    />

                    {/* Clear / checkmark indicator */}
                    {selectedProposalForTask ? (
                      <div className="flex items-center gap-1 pr-3">
                        <span className="text-emerald-400 text-xs font-bold">✓</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProposalForTask(null);
                            setSearchProposalQuery('');
                            setProposalSearchResults([]);
                            setShowProposalDropdown(false);
                          }}
                          className="text-slate-500 hover:text-red-400 transition-colors p-0.5 cursor-pointer"
                          title="Limpar seleção"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : searchProposalQuery.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchProposalQuery('');
                          setProposalSearchResults([]);
                          setShowProposalDropdown(false);
                        }}
                        className="pr-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : (
                      <span className="pr-3 text-slate-600">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    )}
                  </div>

                  {/* Selected proposal preview strip */}
                  {selectedProposalForTask && (
                    <div className="mt-1.5 px-3 py-1.5 bg-indigo-950/40 border border-indigo-500/20 rounded-lg flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span className="text-[11px] text-indigo-200 font-semibold truncate flex-1">{searchProposalQuery}</span>
                      <span className="text-[10px] text-indigo-400 font-mono">Selecionado</span>
                    </div>
                  )}

                  {/* Floating dropdown */}
                  {showProposalDropdown && proposalSearchResults.length > 0 && (
                    <React.Fragment>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProposalDropdown(false)} />
                      <ul className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-60 overflow-y-auto shadow-xl z-50 divide-y divide-slate-800/60">
                        {proposalSearchResults.map(p => (
                          <li
                            key={p.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedProposalForTask(p);
                              const cleanLabel = (raw) => String(raw || '')
                                .replace(/^S\/N\s*\|\s*/i, '')
                                .replace(/\s*-\s*v?[A-Z]{1,3}$/i, '')
                                .trim();
                              setSearchProposalQuery(cleanLabel(p.name || 'Projeto'));
                              setShowProposalDropdown(false);
                            }}
                            className="flex items-center gap-2 cursor-pointer px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                            <span className="font-medium text-sm text-slate-100 leading-snug truncate">
                              {p.name || 'Projeto'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </React.Fragment>
                  )}

                  {/* No results message */}
                  {showProposalDropdown && proposalSearchResults.length === 0 && searchProposalQuery.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-500 text-center shadow-xl z-50">
                      Nenhum negócio encontrado para "{searchProposalQuery}"
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Assunto / Título da Tarefa</label>
                <input 
                  type="text" 
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Ex: Ligar para alinhar proposta comercial"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo de Atividade</label>
                  <select 
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Ligação">📞 Ligação</option>
                    <option value="Reunião">👥 Reunião</option>
                    <option value="E-mail">✉️ E-mail</option>
                    <option value="Follow-up">🔄 Follow-up</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Atribuído a</label>
                  <select 
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="" className="text-slate-400">Selecione o responsável...</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={String(v.id)}>{v.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data de Vencimento</label>
                <div className="flex items-center space-x-3">
                  <input 
                    type="date"
                    required
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  
                  {!hasTime ? (
                    <button
                      type="button"
                      onClick={() => setHasTime(true)}
                      className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>➕ Adicionar hora</span>
                    </button>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <select
                        value={newTaskTime}
                        onChange={(e) => setNewTaskTime(e.target.value)}
                        className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
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
                        className="p-2.5 bg-red-950/40 text-red-400 hover:bg-red-950/60 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        title="Remover hora"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800/60 mt-6">
                <button 
                  type="button"
                  onClick={() => {
                    setShowNewTaskModal(false);
                    setSelectedProposalForTask(null);
                    setSearchProposalQuery('');
                    setProposalSearchResults([]);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={creatingTask}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-950/30 transition-all"
                >
                  {creatingTask ? (editingTask ? 'Salvando...' : 'Criando...') : (editingTask ? 'Salvar Alterações' : 'Criar Tarefa')}
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
              drawerTab === 'budget' ? 'w-[75vw] max-w-7xl' : 'w-full max-w-xl md:max-w-2xl'
            }`}
          >
            {drawerTab === 'details' ? (
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedTask ? selectedTask.name : 'Detalhes do Negócio'}</h3>
                    {(() => {
                      const propNumField = selectedTask && selectedTask.custom_fields 
                        ? selectedTask.custom_fields.find(f => f.id === 'c44cc05d-303f-47e2-b243-40c6b26b732f') 
                        : null;
                      const propNum = propNumField ? propNumField.value : null;
                      return (
                        <p className="text-xs text-slate-400">
                          {propNum ? `Nº da Proposta: ${propNum}` : `ID da oportunidade: #${clickupTaskId}`}
                        </p>
                      );
                    })()}
                  </div>
                  <button 
                    onClick={() => {
                      setShowDrawer(false);
                      setClickupTaskId('');
                    }}
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Responsável pelo Negócio</span>
                      <select
                        className="w-full bg-transparent border-0 p-0 text-sm font-semibold text-slate-200 focus:ring-0 focus:outline-none cursor-pointer mt-1"
                        value={selectedTask ? (selectedTask.responsavel_negocio || "") : ""}
                        onChange={(e) => {
                          if (selectedTask) {
                            const u = vendedores.find(v => v.nome === e.target.value);
                            handleResponsavelChange(selectedTask.id, e.target.value, u ? u.id : null);
                          }
                        }}
                      >
                        <option value="" className="bg-slate-900 text-slate-400">Selecione o responsável...</option>
                        {vendedores.map(v => (
                          <option key={v.id} value={v.nome} className="bg-slate-900 text-slate-200">{v.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Valor Estimado</span>
                      <span className="text-sm font-semibold text-indigo-400 mt-1 block">
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
                  
                  <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Ações do Negócio</span>
                    <button
                      onClick={() => {
                        if (typeof setSelectedProposalForTask === 'function') setSelectedProposalForTask(currentProposta);
                        if (typeof setSelectedProposal === 'function') setSelectedProposal(currentProposta);
                        if (currentProposta) {
                          const propNum = currentProposta.numero_proposta ? currentProposta.numero_proposta + ' | ' : '';
                          const propName = currentProposta.nome_projeto || currentProposta.cenario || 'Projeto';
                          setSearchProposalQuery(`${propNum}${propName} - v${currentProposta.versao}`);
                        } else {
                          setSearchProposalQuery('Sem Proposta');
                        }
                        setShowNewTaskModal(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1"
                    >
                      <span>➕ Nova Tarefa Comercial</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-1">
                  {/* Seção 1: Timeline de Versões */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/20">
                    <div 
                      onClick={() => setTimelineCollapsed(!timelineCollapsed)}
                      className="flex items-center justify-between p-4 bg-slate-900/40 cursor-pointer select-none hover:bg-slate-900/60 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 text-xs">{timelineCollapsed ? '▶' : '▼'}</span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400">Timeline de Versões</h4>
                      </div>
                      
                      {timelineCollapsed && (
                        <span className="text-[10px] bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20 font-semibold max-w-[200px] truncate">
                          {(() => {
                            const activeProp = propostas.find(p => ['Ativa', 'Selecionada', 'Ganho'].includes(p.situacao)) || propostas[0];
                            return activeProp 
                              ? `${activeProp.versao} ${activeProp.situacao} - R$ ${Number(activeProp.total_proposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                              : 'Nenhuma Versão';
                          })()}
                        </span>
                      )}
                    </div>
                    
                    {!timelineCollapsed && (
                      <div className="p-4 border-t border-slate-800/60 max-h-[300px] overflow-y-auto">
                        {renderTimeline(false)}
                      </div>
                    )}
                  </div>

                  {/* Seção 2: Tarefas do Negócio */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/20">
                    <div 
                      onClick={() => setTasksCollapsed(!tasksCollapsed)}
                      className="flex items-center justify-between p-4 bg-slate-900/40 cursor-pointer select-none hover:bg-slate-900/60 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 text-xs">{tasksCollapsed ? '▶' : '▼'}</span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400">Tarefas do Negócio</h4>
                      </div>
                      
                      {tasksCollapsed && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                          commercialTasks.filter(t => {
                            const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
                            const isThisDeal = t.clickup_negocio_id === clickupTaskId || 
                                               (propObj && propObj.clickup_negocio_id === clickupTaskId) ||
                                               (currentProposta && t.proposta_id === currentProposta.id);
                            return isThisDeal && t.status === 'pendente' && new Date(t.data_vencimento) < new Date();
                          }).length > 0
                            ? 'bg-red-950/80 text-red-300 border-red-500/20 font-bold animate-pulse'
                            : 'bg-slate-800 text-slate-300 border-slate-700/20'
                        }`}>
                          {(() => {
                            const dealTasks = commercialTasks.filter(t => {
                              const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
                              return t.clickup_negocio_id === clickupTaskId || 
                                     (propObj && propObj.clickup_negocio_id === clickupTaskId) ||
                                     (currentProposta && t.proposta_id === currentProposta.id);
                            });
                            const pTasks = dealTasks.filter(t => t.status === 'pendente');
                            const odTasks = pTasks.filter(t => new Date(t.data_vencimento) < new Date());
                            return `${pTasks.length} Pendentes ${odTasks.length > 0 ? `| ${odTasks.length} Atrasada(s)` : ''}`;
                          })()}
                        </span>
                      )}
                    </div>
                    
                    {!tasksCollapsed && (
                      <div className="p-4 border-t border-slate-800/60 space-y-4 max-h-[300px] overflow-y-auto">
                        {(() => {
                          const dealTasks = commercialTasks.filter(t => {
                            const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
                            return t.clickup_negocio_id === clickupTaskId || 
                                   (propObj && propObj.clickup_negocio_id === clickupTaskId) ||
                                   (currentProposta && t.proposta_id === currentProposta.id);
                          });
                          
                          if (dealTasks.length === 0) {
                            return <p className="text-xs text-slate-500 text-center py-2">Nenhuma tarefa associada a este negócio.</p>;
                          }
                          
                          return (
                            <div className="space-y-3">
                              {dealTasks.map(task => {
                                const isOverdue = task.status === 'pendente' && new Date(task.data_vencimento) < new Date();
                                const isDone = task.status === 'concluida';
                                const typeEmoji = {
                                  'Ligação': '📞',
                                  'Reunião': '👥',
                                  'E-mail': '✉️',
                                  'Follow-up': '🔄'
                                }[task.tipo] || '📋';
                                
                                return (
                                  <div key={task.id} className="flex items-start justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800/60 hover:border-slate-700 transition-colors">
                                    <div className="flex items-start space-x-2.5">
                                      <input 
                                        type="checkbox" 
                                        checked={isDone}
                                        onChange={() => toggleTaskStatus(task)}
                                        className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-0.5"
                                      />
                                      <div>
                                        <p className={`text-xs font-semibold ${isDone ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                                          {typeEmoji} {task.titulo}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                          Vence em: {new Date(task.data_vencimento).toLocaleString('pt-BR')} 
                                          {isOverdue && <span className="text-red-400 font-bold ml-1.5">⚠️ Atrasada</span>}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      {/* Editar (Lápis) */}
                                      <button onClick={() => handleEditTaskClick(task)} className="p-1 text-slate-400 hover:text-blue-500 transition-colors" title="Editar Tarefa">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                      </button>
                                      {/* Excluir (Lixeira) */}
                                      <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Excluir Tarefa">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4 flex-shrink-0">
                    <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400">Histórico de Versões</h4>
                    <button 
                      onClick={() => setDrawerTab('details')}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-slate-300 transition-colors font-bold"
                    >
                      ← Detalhes
                    </button>
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
