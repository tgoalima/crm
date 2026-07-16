const { useState, useEffect, useMemo, useRef } = React;
if (typeof Chart !== "undefined") {
  Chart.Tooltip.positioners.followMouse = function(elements, eventPosition) {
    return { x: eventPosition.x, y: eventPosition.y };
  };
}
const DEAL_VALUE_FIELD_ID = "ee65221a-029d-4d0a-a981-b71b5a29b4b4";
const RESPONSAVEL_FIELD_ID = "";
const API_KEY = "";
const chartColors = [
  "rgba(99, 102, 241, 0.75)",
  // Indigo
  "rgba(16, 185, 129, 0.75)",
  // Emerald
  "rgba(245, 158, 11, 0.75)",
  // Amber
  "rgba(239, 68, 68, 0.75)",
  // Red
  "rgba(6, 182, 212, 0.75)",
  // Cyan
  "rgba(236, 72, 153, 0.75)",
  // Pink
  "rgba(139, 92, 246, 0.75)",
  // Violet
  "rgba(20, 184, 166, 0.75)"
  // Teal
];
const chartBorderColors = [
  "rgba(99, 102, 241, 1)",
  "rgba(16, 185, 129, 1)",
  "rgba(245, 158, 11, 1)",
  "rgba(239, 68, 68, 1)",
  "rgba(6, 182, 212, 1)",
  "rgba(236, 72, 153, 1)",
  "rgba(139, 92, 246, 1)",
  "rgba(20, 184, 166, 1)"
];
const getInitialConfig = () => {
  return {
    url: "",
    anonKey: ""
  };
};
const getSupabaseHeaders = () => {
  return {};
};
const getSafeStageName = (card) => {
  if (!card) return "";
  let val = "";
  if (card.stage_name) {
    val = typeof card.stage_name === "object" ? card.stage_name.name || card.stage_name.status || card.stage_name.value || "" : card.stage_name;
  } else if (card.status) {
    val = typeof card.status === "object" ? card.status.status || card.status.name || card.status.value || "" : card.status;
  }
  return String(val || "").toLowerCase().trim();
};
const formatValueCompact = (val) => {
  if (val === void 0 || val === null) return "R$ 0";
  if (val >= 1e6) return `R$ ${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `R$ ${(val / 1e3).toFixed(0)}K`;
  return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const formatMaskedCurrency = (value) => {
  if (value === void 0 || value === null) return "0,00";
  const num = typeof value === "number" ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};
const getNextVersionLetter = (currentVersao) => {
  if (!currentVersao || currentVersao.length < 2) return "vA";
  const prefix = "v";
  const letters = currentVersao.substring(1);
  let charArray = letters.split("");
  let carry = true;
  for (let i = charArray.length - 1; i >= 0; i--) {
    if (carry) {
      let code = charArray[i].charCodeAt(0) + 1;
      if (code > 90) {
        charArray[i] = "A";
        carry = true;
      } else {
        charArray[i] = String.fromCharCode(code);
        carry = false;
      }
    }
  }
  if (carry) {
    charArray.unshift("A");
  }
  return prefix + charArray.join("");
};
const KanbanCard = React.memo(({ task, dealValue, formattedValue, responsavel, handleDragStart, handleCardClick, hasOverdue }) => {
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      "data-id": task.id,
      draggable: true,
      onDragStart: (e) => handleDragStart(e, task),
      onClick: () => handleCardClick(task),
      className: "kanban-card flex flex-col relative"
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between mb-2" }, /* @__PURE__ */ React.createElement("h4", { className: "text-sm font-semibold text-slate-100 line-clamp-2 pr-2" }, task.name), hasOverdue && /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "w-2.5 h-2.5 rounded-full bg-red-500 border border-slate-950 flex-shrink-0 mt-1 animate-pulse",
        title: "Possui tarefa comercial atrasada!"
      }
    )),
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between text-xs text-slate-400 mt-auto" }, /* @__PURE__ */ React.createElement("span", null, responsavel || "Sem Respons\xE1vel"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-indigo-400" }, formattedValue))
  );
});
const STAGE_ORDER = [
  { key: "registro", width: "100%" },
  { key: "qualifica", width: "85%" },
  { key: "proposta", width: "70%" },
  { key: "desenvolvimento", width: "55%" },
  { key: "negocia", width: "40%" },
  { key: "termo", width: "25%" },
  { key: "aceite", width: "25%" }
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
  return "100%";
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
  const safeColumns = Array.isArray(kanbanColumns) ? kanbanColumns : [];
  const safeTasks = Array.isArray(kanbanTasks) ? kanbanTasks : [];
  const activeCols = safeColumns.filter((col) => {
    if (!col || typeof col.name !== "string") return false;
    const colName = col.name.toLowerCase();
    if (colName.includes("ganho") || colName.includes("perdido") || colName.includes("congelado")) return false;
    return true;
  });
  const rawStageData = activeCols.map((col) => {
    const tasksInCol = safeTasks.filter((t) => getTaskOptionId && getTaskOptionId(t, safeColumns) === col.id);
    const total = tasksInCol.reduce((acc, t) => acc + (getOpportunityValue ? getOpportunityValue(t) || 0 : 0), 0);
    return {
      id: col.id,
      name: col.name,
      color: col.color || "#6366f1",
      total,
      count: tasksInCol.length,
      funnelWidth: getStageWidth(col.name)
    };
  });
  const stageData = [...rawStageData].sort((a, b) => getStageSortKey(a.name) - getStageSortKey(b.name));
  const totalFunnelSum = stageData.reduce((acc, s) => acc + s.total, 0);
  const selectedStageObj = filterStage ? stageData.find((s) => s.id === filterStage) : null;
  const displayTotal = selectedStageObj ? selectedStageObj.total : totalFunnelSum;
  const displayTitle = selectedStageObj ? selectedStageObj.name : "Total Funil";
  return /* @__PURE__ */ React.createElement("div", { className: "px-6 py-5 border-b border-slate-800 bg-slate-900/30 flex-shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Funil de Vendas & Forecast"), filterStage && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setFilterStage(null),
      className: "text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
    },
    "Limpar Filtro"
  )), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8 w-full items-stretch" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-stretch justify-center space-y-1.5 py-1" }, stageData.map((stage) => {
    const isSelected = filterStage === stage.id;
    return /* @__PURE__ */ React.createElement("div", { key: stage.id, className: "flex justify-center w-full" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setFilterStage(filterStage === stage.id ? null : stage.id),
        style: { width: stage.funnelWidth },
        className: `group flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 border cursor-pointer ${isSelected ? "bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-900/70 hover:bg-slate-800/90 border-slate-800 text-slate-300 hover:text-white hover:border-slate-600"}`
      },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between w-full min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 min-w-0" }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "w-1.5 h-1.5 rounded-full flex-shrink-0",
          style: { backgroundColor: stage.color }
        }
      ), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold tracking-wide uppercase whitespace-nowrap overflow-hidden text-ellipsis" }, stage.name)), /* @__PURE__ */ React.createElement("span", { className: `text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ml-2 ${isSelected ? "bg-white/20 text-white" : "bg-slate-700 text-slate-400 group-hover:text-slate-200"}` }, stage.count)),
      /* @__PURE__ */ React.createElement("span", { className: `font-mono text-[10px] font-bold flex-shrink-0 ml-2 ${isSelected ? "text-white" : "text-indigo-400"}` }, "R$ ", stage.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 }))
    ));
  })), /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-br from-indigo-950/50 to-slate-900/80 p-6 rounded-2xl border border-indigo-500/15 flex flex-col justify-center items-center text-center w-full min-h-[240px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3 block" }, filterStage && selectedStageObj ? selectedStageObj.name : "Total em Negocia\xE7\xE3o"), /* @__PURE__ */ React.createElement("span", { className: "text-3xl font-black text-emerald-400 leading-none select-all drop-shadow-[0_2px_10px_rgba(16,185,129,0.2)]" }, "R$ ", displayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 mt-4 max-w-xs leading-relaxed" }, filterStage && selectedStageObj ? `Soma dos neg\xF3cios na etapa "${selectedStageObj.name}".` : "Soma total de todos os neg\xF3cios comerciais ativos em andamento no funil."), !filterStage && /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-xs text-slate-500 font-semibold px-3 py-1 bg-slate-950/50 rounded-full border border-slate-800/40" }, stageData.reduce((a, s) => a + s.count, 0), " neg\xF3cios em andamento"))));
};
const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLocalError("");
    try {
      const res = await onLogin(email, password);
      if (res && res.error) {
        setLocalError(res.error.message);
      }
    } catch (err) {
      setLocalError(err.message || "Erro ao realizar login");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "text-center mb-8" }, /* @__PURE__ */ React.createElement("div", { className: "inline-flex p-3 bg-indigo-500/10 text-indigo-400 rounded-full mb-3" }, /* @__PURE__ */ React.createElement("svg", { className: "w-8 h-8", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" }))), /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-bold text-white" }, "Gest\xE3o Comercial"), /* @__PURE__ */ React.createElement("p", { className: "text-slate-400 text-sm mt-1" }, "Fa\xE7a login para acessar o sistema")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, className: "space-y-5" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2" }, "E-mail"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      required: true,
      className: "w-full px-4 py-3 bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 rounded-lg outline-none transition-all",
      placeholder: "seu-email@suprimatica.com.br",
      value: email,
      onChange: (e) => setEmail(e.target.value)
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2" }, "Senha"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "password",
      required: true,
      className: "w-full px-4 py-3 bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 rounded-lg outline-none transition-all",
      placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
      value: password,
      onChange: (e) => setPassword(e.target.value)
    }
  )), (localError || error) && /* @__PURE__ */ React.createElement("div", { className: "p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg" }, localError || error), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: loading,
      className: "w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
    },
    loading ? /* @__PURE__ */ React.createElement("span", { className: "w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" }) : "Entrar"
  ))));
};
function App() {
  const [config, setConfig] = useState(getInitialConfig);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [session, setSession] = useState(null);
  const [clickupTaskId, setClickupTaskId] = useState("");
  const [clickupListId, setClickupListId] = useState("");
  const TARGET_LIST_ID = "901326185457";
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("crm_active_view") || "kanban");
  useEffect(() => {
    localStorage.setItem("crm_active_view", activeTab);
  }, [activeTab]);
  const [kanbanTasks, setKanbanTasks] = useState(() => {
    const cached = localStorage.getItem("crm_cache_kanban_tasks");
    return cached ? JSON.parse(cached) : [];
  });
  const [kanbanColumns, setKanbanColumns] = useState([]);
  const [loadingKanban, setLoadingKanban] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [drawerTab, setDrawerTab] = useState("details");
  const [canDrag, setCanDrag] = useState(false);
  const [showGanhoCol, setShowGanhoCol] = useState(false);
  const [showPerdidoCol, setShowPerdidoCol] = useState(false);
  const [showCongeladoCol, setShowCongeladoCol] = useState(false);
  const [sortBy, setSortBy] = useState(() => {
    return localStorage.getItem("crm_sort_order") || "default";
  });
  const [supabaseProposalsList, setSupabaseProposalsList] = useState([]);
  const [commercialTasks, setCommercialTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tasksFilterAssignee, setTasksFilterAssignee] = useState("all");
  const [tasksShowCompleted, setTasksShowCompleted] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState("Liga\xE7\xE3o");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [filterStage, setFilterStage] = useState(null);
  const [hasTime, setHasTime] = useState(false);
  const [newTaskTime, setNewTaskTime] = useState("09:00");
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [searchProposalQuery, setSearchProposalQuery] = useState("");
  const [proposalSearchResults, setProposalSearchResults] = useState([]);
  const [showProposalDropdown, setShowProposalDropdown] = useState(false);
  const [selectedProposalForTask, setSelectedProposalForTask] = useState(null);
  const [wonProposals, setWonProposals] = useState([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const now = /* @__PURE__ */ new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  });
  const [commercialData, setCommercialData] = useState([]);
  const distributorCanvasRef = useRef(null);
  const manufacturerCanvasRef = useRef(null);
  const distributorChartInst = useRef(null);
  const manufacturerChartInst = useRef(null);
  const [projectContext, setProjectContext] = useState({ name: "", proposal_number: "" });
  const [propostas, setPropostas] = useState([]);
  const [todasPropostas, setTodasPropostas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [distribuidores, setDistribuidores] = useState([]);
  const [vendedores, setVendedores] = useState(() => {
    const cached = localStorage.getItem("crm_cache_vendedores");
    return cached ? JSON.parse(cached) : [];
  });
  const [newVendedorName, setNewVendedorName] = useState("");
  const [editingVendedor, setEditingVendedor] = useState(null);
  const [currentProposta, setCurrentProposta] = useState(null);
  const [itens, setItens] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingDistributor, setEditingDistributor] = useState(null);
  const [newDistributorName, setNewDistributorName] = useState("");
  const [settingsActiveTab, setSettingsActiveTab] = useState("products");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  const [selectedLossReason, setSelectedLossReason] = useState("");
  const [compareStartDate, setCompareStartDate] = useState("");
  const [compareEndDate, setCompareEndDate] = useState("");
  const [selectedDistributorFilter, setSelectedDistributorFilter] = useState("all");
  const [selectedManufacturerFilter, setSelectedManufacturerFilter] = useState("all");
  const [biMetrics, setBiMetrics] = useState({
    wonCount: 0,
    wonValue: 0,
    wonQtyDiff: 0,
    wonValDiff: 0,
    lostCount: 0,
    lostValue: 0,
    lostQtyDiff: 0,
    lostValDiff: 0,
    convRate: 0,
    convRateDiff: 0
  });
  const [importFormat, setImportFormat] = useState("csv");
  const [isProjeto, setIsProjeto] = useState(false);
  const [openMenuVersionId, setOpenMenuVersionId] = useState(null);
  const saveTimeoutRef = useRef(null);
  const [importText, setImportText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { distributorTotals, distributorTotalSum } = useMemo(() => {
    const totals = {};
    commercialData.forEach((item) => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const distName = item.distribuidores?.nome || "N\xE3o Informado";
      if (selectedDistributorFilter === "all" || distName.trim().toLowerCase() === selectedDistributorFilter.trim().toLowerCase()) {
        totals[distName] = (totals[distName] || 0) + value;
      }
    });
    const sortedTotals = {};
    Object.keys(totals).sort((a, b) => totals[b] - totals[a]).forEach((key) => {
      sortedTotals[key] = totals[key];
    });
    const sum = Object.values(sortedTotals).reduce((a, b) => a + b, 0);
    return { distributorTotals: sortedTotals, distributorTotalSum: sum };
  }, [commercialData, selectedDistributorFilter]);
  const { manufacturerTotals, manufacturerTotalSum } = useMemo(() => {
    const totals = {};
    commercialData.forEach((item) => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const fabName = item.produtos?.fabricante || "N\xE3o Informado";
      if (selectedManufacturerFilter === "all" || fabName.trim().toLowerCase() === selectedManufacturerFilter.trim().toLowerCase()) {
        totals[fabName] = (totals[fabName] || 0) + value;
      }
    });
    const sortedTotals = {};
    Object.keys(totals).sort((a, b) => totals[b] - totals[a]).forEach((key) => {
      sortedTotals[key] = totals[key];
    });
    const sum = Object.values(sortedTotals).reduce((a, b) => a + b, 0);
    return { manufacturerTotals: sortedTotals, manufacturerTotalSum: sum };
  }, [commercialData, selectedManufacturerFilter]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ nome: "", fabricante: "", custo_referencia: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  useEffect(() => {
    const initSupabase = async () => {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("Erro ao carregar configura\xE7\xF5es do servidor");
        const data = await response.json();
        const url = data.SUPABASE_URL;
        const anonKey = data.SUPABASE_ANON_KEY;
        if (url && anonKey) {
          const client = window.supabase.createClient(url, anonKey);
          setSupabaseClient(client);
          localStorage.removeItem("supa_url");
          localStorage.removeItem("supa_key");
          localStorage.removeItem("supabase_url");
          localStorage.removeItem("supabase_key");
          localStorage.removeItem("supabaseurl");
          localStorage.removeItem("supabasekey");
          testConnection(client);
        } else {
          console.error("Configura\xE7\xF5es do Supabase ausentes no servidor.");
          setErrorMsg("Configura\xE7\xF5es do Supabase ausentes no servidor (.env).");
        }
      } catch (err) {
        console.error("Erro ao inicializar Supabase:", err);
        setDbConnected(false);
        setErrorMsg("Erro de conex\xE3o com o servidor ao buscar configura\xE7\xF5es.");
      }
    };
    initSupabase();
  }, []);
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
    if (!supabaseClient) return { error: { message: "Cliente Supabase n\xE3o inicializado." } };
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      return { error };
    }
    setSession(data.session);
    return data;
  };
  const testConnection = async (client) => {
    try {
      const { data, error } = await client.from("produtos").select("id").limit(1);
      if (error) throw error;
      setDbConnected(true);
      setErrorMsg("");
      const { data: { session: session2 } } = await client.auth.getSession();
      if (session2) {
        setSession(session2);
        loadProducts(client);
        loadDistributors(client);
        loadVendedores(client);
      }
    } catch (err) {
      console.error("Erro de conex\xE3o com o banco:", err);
      setDbConnected(false);
      setErrorMsg("Falha ao conectar ao Supabase. Verifique suas credenciais.");
    }
  };
  const getTaskOptionId = (task, options) => {
    const field = task.custom_fields ? task.custom_fields.find((f) => f.id === "c8d0abe2-c59f-4a9e-93ff-bd060659aa63") : null;
    if (!field || field.value === void 0 || field.value === null) return null;
    const valStr = String(field.value);
    const optById = options.find((o) => o.id === valStr);
    if (optById) return optById.id;
    const idx = parseInt(field.value, 10);
    if (!isNaN(idx) && options[idx]) {
      return options[idx].id;
    }
    const optByName = options.find((o) => o.name.toLowerCase() === valStr.toLowerCase());
    if (optByName) return optByName.id;
    return valStr;
  };
  const getOpportunityValue = (task) => {
    if (!task) return null;
    if (task.supabase_deal_value !== void 0 && task.supabase_deal_value !== null) {
      const val = parseFloat(task.supabase_deal_value);
      if (!isNaN(val)) return val;
    }
    const cleanId = String(task.id || "").replace("#", "").trim();
    if (supabaseProposalsList && supabaseProposalsList.length > 0) {
      const props = supabaseProposalsList.filter((p) => {
        const pClean = String(p.clickup_negocio_id || "").replace("#", "").trim();
        return pClean === cleanId;
      });
      if (props.length > 0) {
        let best = props.find((p) => p.situacao === "Selecionada") || props.find((p) => p.situacao === "Ganho") || props.find((p) => p.situacao === "Ativa") || props.find((p) => p.situacao === "Desconsiderada") || props[0];
        const val = parseFloat(best.total_proposta);
        if (!isNaN(val)) return val;
      }
    }
    if (task.valor_estimado !== void 0 && task.valor_estimado !== null) {
      const ve = parseFloat(task.valor_estimado);
      if (!isNaN(ve)) return ve;
    }
    const dealValField = task.custom_fields ? task.custom_fields.find((f) => f.id === DEAL_VALUE_FIELD_ID) : null;
    if (dealValField && dealValField.value !== void 0 && dealValField.value !== null) {
      const raw = parseFloat(dealValField.value);
      if (!isNaN(raw)) {
        return raw;
      }
    }
    return null;
  };
  const getOpportunityResponsavel = (task) => {
    if (!task || !supabaseProposalsList) return "";
    const cleanId = String(task.id).replace("#", "").trim();
    const props = supabaseProposalsList.filter((p) => {
      const pClean = String(p.clickup_negocio_id).replace("#", "").trim();
      return pClean === cleanId;
    });
    if (props.length > 0) {
      const selectedProp = props.find((p) => p.situacao === "Selecionada" || p.situacao === "Ganho") || props[0];
      return selectedProp.criado_por || "";
    }
    return "";
  };
  const refreshSupabaseProposalsList = async () => {
    if (!supabaseClient) return;
    try {
      const { data } = await supabaseClient.from("propostas").select("clickup_negocio_id, total_proposta, situacao, criado_por");
      if (data) {
        setSupabaseProposalsList(data);
      }
    } catch (err) {
      console.warn("Erro silencioso ao atualizar lista global de propostas:", err);
    }
  };
  const handleResponsavelChange = async (taskId, responsavelNome, responsavelId = null) => {
    setKanbanTasks((prevTasks) => prevTasks.map((t) => t.id === taskId ? { ...t, responsavel_negocio: responsavelNome, valor_estimado: t.valor_estimado } : t));
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) => ({ ...prev, responsavel_negocio: responsavelNome, valor_estimado: prev.valor_estimado }));
    }
    const cleanId = String(taskId).replace("#", "").trim();
    try {
      if (responsavelId) {
        const res = await fetch(`/clickup-api/task/${taskId}/assignee`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignees: [responsavelId] })
        });
        if (!res.ok) throw new Error("Erro ClickUp Assignee");
      }
    } catch (e) {
      console.warn("Erro ao atualizar respons\xE1vel no ClickUp:", e);
    }
    try {
      const { data, error } = await supabaseClient.from("propostas").update({ criado_por: responsavelNome }).eq("clickup_negocio_id", cleanId);
      if (error) throw error;
      if (!data || data.length === 0) {
        await supabaseClient.from("propostas").insert({
          clickup_negocio_id: cleanId,
          versao: "vA",
          situacao: "Selecionada",
          criado_por: responsavelNome,
          cenario: "",
          total_proposta: 0
        });
      }
      await refreshSupabaseProposalsList();
      loadDashboardData();
    } catch (err) {
      console.warn("Erro silencioso ao persistir respons\xE1vel no Supabase:", err);
    }
  };
  const fetchKanbanData = async () => {
    if (kanbanTasks.length === 0) {
      setLoadingKanban(true);
    }
    try {
      let propsList = [];
      if (supabaseClient) {
        const { data: props, error: propsErr } = await supabaseClient.from("propostas").select("clickup_negocio_id, total_proposta, situacao, criado_por");
        if (!propsErr && props) {
          propsList = props;
          setSupabaseProposalsList(props);
        }
      }
      const fieldsRes = await fetch(`/clickup-api/list/${TARGET_LIST_ID}/field`);
      let columnsData = [];
      if (fieldsRes.ok) {
        const fieldsData = await fieldsRes.json();
        if (fieldsData.fields) {
          const stageField = fieldsData.fields.find((f) => f.id === "c8d0abe2-c59f-4a9e-93ff-bd060659aa63");
          if (stageField && stageField.type_config && stageField.type_config.options) {
            columnsData = stageField.type_config.options;
            setKanbanColumns(stageField.type_config.options);
          }
        }
      }
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
      const enrichedTasks = allTasks.map((t) => {
        const idAlpha = String(t.id || "").replace("#", "").trim();
        const idNumeric = String(t.custom_id || t.task_id || "").replace("#", "").trim();
        const propMatchesTask = (p) => {
          const pClean = String(p.clickup_negocio_id || "").replace("#", "").trim();
          if (!pClean) return false;
          if (pClean === idAlpha) return true;
          if (idNumeric && pClean === idNumeric) return true;
          if (idAlpha && pClean === "#" + idAlpha) return true;
          if (idNumeric && pClean === "#" + idNumeric) return true;
          return false;
        };
        const matchedProps = propsList.filter(propMatchesTask);
        let resp = "";
        let supabaseDealValue = null;
        if (matchedProps.length > 0) {
          const best = matchedProps.find((p) => p.situacao === "Selecionada") || matchedProps.find((p) => p.situacao === "Ganho") || matchedProps.find((p) => p.situacao === "Ativa") || matchedProps.find((p) => p.situacao === "Desconsiderada") || matchedProps[0];
          resp = best.criado_por || "";
          const v = parseFloat(best.total_proposta);
          if (!isNaN(v)) supabaseDealValue = v;
        }
        if (t.assignees && t.assignees.length > 0) {
          resp = t.assignees[0].username || t.assignees[0].email || resp;
        }
        return { ...t, responsavel_negocio: resp, supabase_deal_value: supabaseDealValue };
      });
      setKanbanTasks(enrichedTasks);
      localStorage.setItem("crm_cache_kanban_tasks", JSON.stringify(enrichedTasks));
    } catch (err) {
      console.error("Erro ao carregar dados do Kanban:", err);
      showToast("Erro ao carregar dados do Kanban do ClickUp.", "error");
    } finally {
      setLoadingKanban(false);
    }
  };
  useEffect(() => {
    if (activeTab === "kanban") {
      fetchKanbanData();
    }
  }, [activeTab, supabaseClient]);
  useEffect(() => {
    if (supabaseClient) {
      fetchCommercialTasks(supabaseClient);
    }
  }, [supabaseClient]);
  const updateTaskStage = async (taskId, newOptionId) => {
    const res = await fetch(`/clickup-api/task/${taskId}/field/c8d0abe2-c59f-4a9e-93ff-bd060659aa63`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ value: newOptionId })
    });
    if (!res.ok) {
      throw new Error("Falha na atualiza\xE7\xE3o do est\xE1gio no ClickUp");
    }
  };
  const updateTaskClickupStatus = async (taskId, statusName) => {
    const res = await fetch(`/clickup-api/task/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusName })
    });
    if (!res.ok) {
      throw new Error("Falha na atualiza\xE7\xE3o do status nativo no ClickUp");
    }
  };
  const handleOpportunityStateChange = async (taskId, targetOptionId) => {
    try {
      const targetOption = kanbanColumns.find((c) => c.id === targetOptionId);
      if (!targetOption) return;
      const targetName = targetOption.name.toLowerCase();
      let clickupStatus = "ABERTO";
      if (targetName.includes("ganho")) {
        clickupStatus = "FECHADO";
      } else if (targetName.includes("perdido")) {
        clickupStatus = "PERDIDO/CANCELADO";
      }
      setKanbanTasks((prev) => prev.map((t) => {
        if (t.id === taskId) {
          const updatedFields = t.custom_fields ? t.custom_fields.map((f) => f.id === "c8d0abe2-c59f-4a9e-93ff-bd060659aa63" ? { ...f, value: targetOptionId } : f) : [{ id: "c8d0abe2-c59f-4a9e-93ff-bd060659aa63", value: targetOptionId }];
          return { ...t, custom_fields: updatedFields };
        }
        return t;
      }));
      const cleanTaskId = String(taskId).replace("#", "").trim();
      await Promise.all([
        updateTaskStage(cleanTaskId, targetOptionId),
        updateTaskClickupStatus(cleanTaskId, clickupStatus)
      ]);
      showToast(`Oportunidade atualizada no ClickUp!`, "success");
    } catch (err) {
      console.error("Erro na sincroniza\xE7\xE3o de estado:", err);
      showToast("N\xE3o foi poss\xEDvel atualizar o ClickUp.", "error");
      fetchKanbanData();
    }
  };
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
      const task = kanbanTasks.find((t) => t.id === taskId);
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
  const handleCardClick = (task) => {
    setSelectedTask(task);
    setClickupTaskId(task.id);
    setDrawerTab("details");
    setShowDrawer(true);
  };
  const resolveTaskIdFormat = async (rawId) => {
    if (!supabaseClient || !rawId) return rawId;
    try {
      const cleanId = rawId.startsWith("#") ? rawId.substring(1) : rawId;
      const idWithHash = "#" + cleanId;
      const { data, error } = await supabaseClient.from("propostas").select("clickup_negocio_id").or(`clickup_negocio_id.eq.${cleanId},clickup_negocio_id.eq.${idWithHash}`).limit(1);
      if (!error && data && data.length > 0) {
        return data[0].clickup_negocio_id;
      }
    } catch (err) {
      console.error("Erro ao resolver formato do ID:", err);
    }
    return rawId;
  };
  const parseNumericValue = (val) => {
    if (val === void 0 || val === null) return 0;
    if (typeof val === "number") return Number(val.toFixed(2));
    const str = String(val).trim();
    if (str.includes(",")) {
      const cleanStr = str.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
      return parseFloat(cleanStr) || 0;
    } else {
      const cleanStr = str.replace(/[^\d.-]/g, "");
      return parseFloat(cleanStr) || 0;
    }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("task_id") || params.get("clickup_id") || params.get("id") || "";
    if (id) {
      if (supabaseClient) {
        resolveTaskIdFormat(id).then((resolvedId) => {
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
  useEffect(() => {
    if (dbConnected && clickupTaskId) {
      fetchProjectContext();
    } else {
      setProjectContext({ name: "", proposal_number: "" });
    }
  }, [dbConnected, clickupTaskId]);
  const fetchProjectContext = async () => {
    if (!clickupTaskId || !supabaseClient) return;
    try {
      const idWithoutHash = clickupTaskId.startsWith("#") ? clickupTaskId.substring(1) : clickupTaskId;
      const idWithHash = "#" + idWithoutHash;
      const { data, error } = await supabaseClient.from("propostas").select("id").or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`).order("created_at", { ascending: true }).limit(1);
      let proposalNumber = "Nova vA";
      if (!error && data && data.length > 0) {
        proposalNumber = `#${data[0].id}`;
      }
      let clickupName = "";
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
      let nameParam = params.get("task_name") || "";
      if (nameParam.includes("{{") || nameParam.includes("}}")) {
        nameParam = "";
      }
      const decodedName = nameParam ? decodeURIComponent(nameParam) : clickupName || `Projeto CRM #${clickupTaskId}`;
      setProjectContext({
        name: decodedName,
        proposal_number: proposalNumber
      });
    } catch (err) {
      console.error(err);
      setProjectContext({
        name: `Projeto CRM #${clickupTaskId}`,
        proposal_number: "Nova vA"
      });
    }
  };
  const loadProducts = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from("produtos").select("*").order("nome");
    if (!error && data) {
      setProdutos(data);
    }
  };
  const loadDistributors = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from("distribuidores").select("*").order("nome");
    if (!error && data) {
      setDistribuidores(data);
    }
  };
  const loadVendedores = async () => {
    try {
      const teamsRes = await fetch("/clickup-api/team");
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        if (teamsData.teams && teamsData.teams.length > 0) {
          const teamId = teamsData.teams[0].id;
          const membersRes = await fetch(`/clickup-api/team/${teamId}`);
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            if (membersData.team && membersData.team.members) {
              const users = membersData.team.members.map((m) => m.user);
              const mapped = users.map((u) => ({ id: u.id, nome: u.username || u.email }));
              setVendedores(mapped);
              localStorage.setItem("crm_cache_vendedores", JSON.stringify(mapped));
            }
          }
        }
      }
    } catch (err) {
      console.warn("Erro ao carregar vendedores do ClickUp:", err);
    }
  };
  const fetchCommercialTasks = async (client = supabaseClient, silent = false) => {
    if (!silent) {
      setLoadingTasks(true);
    }
    try {
      const response = await fetch("/api/tarefas", {
        headers: {
          ...getSupabaseHeaders(),
          "Content-Type": "application/json"
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
    const nextStatus = task.status === "concluida" ? "pendente" : "concluida";
    console.log("[DEBUG] Checkbox clicado para a tarefa:", task.id, "Novo Status:", nextStatus);
    setCommercialTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: nextStatus } : t));
    try {
      const response = await fetch(`/api/tarefas/${task.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-supabase-url": localStorage.getItem("supa_url") || "",
          "x-supabase-key": localStorage.getItem("supa_key") || ""
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!response.ok) {
        throw new Error("Erro na requisi\xE7\xE3o para o servidor");
      }
      const data = await response.json();
      console.log("[DEBUG] Resposta do servidor para status:", data);
      showToast("Status da tarefa atualizado com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] Falha ao atualizar status:", err);
      showToast("Erro ao atualizar status da tarefa. Revertendo...", "error");
      setCommercialTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: task.status } : t));
    }
  };
  const handleDeleteTask = async (taskId) => {
    if (!confirm("Deseja realmente excluir esta tarefa comercial?")) return;
    console.log("[DEBUG] Lixeira clicada para excluir a tarefa:", taskId);
    setCommercialTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      const response = await fetch(`/api/tarefas/${taskId}`, {
        method: "DELETE",
        headers: {
          "x-supabase-url": localStorage.getItem("supa_url") || "",
          "x-supabase-key": localStorage.getItem("supa_key") || ""
        }
      });
      if (!response.ok) {
        throw new Error("Erro ao excluir tarefa no servidor");
      }
      const data = await response.json();
      console.log("[DEBUG] Resposta do servidor para exclusao:", data);
      showToast("Tarefa comercial exclu\xEDda com sucesso!", "success");
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
    if (selectedProposalForTask) {
      finalClickupId = selectedProposalForTask.id;
      const associatedProp = (todasPropostas || []).find((p) => p.clickup_negocio_id === selectedProposalForTask.id || p.clickup_negocio_id === "#" + selectedProposalForTask.id);
      finalPropostaId = associatedProp ? associatedProp.id : null;
    } else if (showDrawer) {
      const resolvedProp = currentProposta || propostas && propostas.find((p) => p.clickup_negocio_id === clickupTaskId || p.clickup_negocio_id === "#" + clickupTaskId);
      finalPropostaId = resolvedProp ? resolvedProp.id : null;
      finalClickupId = clickupTaskId;
    } else {
      finalPropostaId = null;
      finalClickupId = null;
    }
    if (!finalClickupId && !selectedProposalForTask && editingTask && editingTask.clickup_negocio_id) {
      finalClickupId = editingTask.clickup_negocio_id;
    }
    if (!finalClickupId && showDrawer) {
      finalClickupId = clickupTaskId;
    }
    if (!finalClickupId) {
      console.warn("[DEBUG] Aborted submission: clickup_negocio_id is missing!");
      showToast("ID do neg\xF3cio do ClickUp n\xE3o encontrado.", "error");
      return;
    }
    if (!newTaskTitle.trim()) {
      console.warn("[DEBUG] Aborted submission: title is empty!");
      showToast("O t\xEDtulo da tarefa \xE9 obrigat\xF3rio.", "error");
      return;
    }
    if (!newTaskDueDate) {
      console.warn("[DEBUG] Aborted submission: date is empty!");
      showToast("A data de vencimento \xE9 obrigat\xF3ria.", "error");
      return;
    }
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
      showToast("Data de vencimento inv\xE1lida.", "error");
      return;
    }
    setCreatingTask(true);
    console.log("[DEBUG] Submitting task with proposal_id:", selectedProposalForTask?.id);
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
    if (!selectedProposalForTask && editingTask && editingTask.clickup_negocio_id) {
      payload.clickup_negocio_id = editingTask.clickup_negocio_id;
    }
    try {
      const method = editingTask ? "PUT" : "POST";
      const endpoint = editingTask ? `/api/tarefas/${editingTask.id}` : "/api/tarefas";
      console.log(`[DEBUG] Sending ${method} to ${endpoint} with payload:`, payload);
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
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
      console.log("[DEBUG] Resposta do servidor para criacao/edicao:", resData);
      showToast(editingTask ? "Tarefa comercial atualizada com sucesso!" : "Tarefa comercial criada com sucesso!", "success");
      setEditingTask(null);
      setShowNewTaskModal(false);
      setNewTaskTitle("");
      setNewTaskType("Liga\xE7\xE3o");
      setNewTaskDueDate("");
      setNewTaskAssignee("");
      setHasTime(false);
      setNewTaskTime("09:00");
      setSearchProposalQuery("");
      setSelectedProposalForTask(null);
      setProposalSearchResults([]);
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
    setNewTaskTitle("");
    setNewTaskType("Liga\xE7\xE3o");
    setNewTaskDueDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
    setNewTaskTime("09:00");
    setNewTaskAssignee("");
    setHasTime(false);
    if (showDrawer && clickupTaskId) {
      const resolvedProp = currentProposta || propostas && propostas.find((p) => p.clickup_negocio_id === clickupTaskId || p.clickup_negocio_id === "#" + clickupTaskId) || {
        clickup_negocio_id: clickupTaskId,
        nome_projeto: selectedTask ? selectedTask.name : "Neg\xF3cio Atual"
      };
      setSelectedProposalForTask(resolvedProp);
      const cleanLabel = (raw) => String(raw || "").replace(/^S\/N\s*\|\s*/i, "").replace(/\s*-\s*[A-Z]+$/i, "").trim();
      setSearchProposalQuery(cleanLabel(resolvedProp.nome_projeto || resolvedProp.projeto || "Neg\xF3cio Atual"));
    } else {
      setSelectedProposalForTask(null);
      setSearchProposalQuery("");
    }
    setShowNewTaskModal(true);
  };
  const handleEditTaskClick = (task) => {
    console.log("[DEBUG] Inicializando modal de edi\xE7\xE3o. Tarefa:", task);
    console.log("[DEBUG] Lista de neg\xF3cios (Kanban) dispon\xEDveis (tamanho):", kanbanTasks ? kanbanTasks.length : 0);
    setEditingTask(task);
    const d = new Date(task.data_vencimento);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    setNewTaskTitle(task.titulo || "");
    setNewTaskType(task.tipo || "Liga\xE7\xE3o");
    setNewTaskDueDate(`${year}-${month}-${day}`);
    setNewTaskTime(`${hours}:${minutes}`);
    setNewTaskAssignee(task.responsavel_clickup_id || "");
    setHasTime(task.due_date_time || false);
    const listaParaBusca = kanbanTasks || [];
    if (listaParaBusca && listaParaBusca.length > 0) {
      console.log("[DEBUG] Amostra de estrutura de neg\xF3cio (Kanban):", listaParaBusca[0]);
    }
    const negocioCorrespondente = listaParaBusca.find((p) => {
      if (!p) return false;
      const matchClickUp = task.clickup_negocio_id && String(p.id).trim().toLowerCase() === String(task.clickup_negocio_id).trim().toLowerCase();
      return matchClickUp;
    });
    console.log("[DEBUG] Neg\xF3cio resolvido por ID do Kanban na edi\xE7\xE3o:", negocioCorrespondente);
    const activeDeal = negocioCorrespondente || {
      id: task.clickup_negocio_id,
      name: task.nome_projeto || "Projeto"
    };
    if (typeof setSelectedProposalForTask === "function") {
      setSelectedProposalForTask(activeDeal);
    }
    const cleanLabel = (raw) => String(raw || "").replace(/^S\/N\s*\|\s*/i, "").replace(/\s*-\s*[A-Z]+$/i, "").trim();
    setSearchProposalQuery(cleanLabel(activeDeal.name || "Neg\xF3cio Atual"));
    setShowNewTaskModal(true);
  };
  useEffect(() => {
    if (activeTab === "tasks" && supabaseClient) {
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
  const loadDashboardData = async (client = supabaseClient) => {
    if (!client) return;
    if (wonProposals.length === 0) {
      setLoadingDashboard(true);
    }
    try {
      const { data, error } = await client.from("propostas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const won = (data || []).filter((p) => p.situacao === "Ganho");
      setWonProposals(won);
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
    const parts = dateStr.substring(0, 10).split("-");
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  };
  const calculateBIMetrics = (allProps) => {
    if (!allProps || allProps.length === 0) return;
    const start = parseLocalDate(startDate) || new Date(2e3, 0, 1);
    const end = parseLocalDate(endDate) || new Date(2100, 0, 1);
    end.setHours(23, 59, 59, 999);
    const compStart = parseLocalDate(compareStartDate);
    const compEnd = parseLocalDate(compareEndDate);
    if (compEnd) {
      compEnd.setHours(23, 59, 59, 999);
    }
    const currentProps = allProps.filter((p) => {
      const dateToUse = p.data_fechamento || p.created_at;
      if (!dateToUse) return false;
      const d = parseLocalDate(dateToUse);
      return d && d >= start && d <= end;
    });
    const wonCurrent = currentProps.filter((p) => p.situacao && p.situacao.trim().toLowerCase() === "ganho");
    const lostCurrent = currentProps.filter((p) => p.situacao && p.situacao.trim().toLowerCase() === "perdido");
    const wonCountCurrent = wonCurrent.length;
    const wonValueCurrent = wonCurrent.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
    const lostCountCurrent = lostCurrent.length;
    const lostValueCurrent = lostCurrent.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
    const closedCountCurrent = wonCountCurrent + lostCountCurrent;
    const convRateCurrent = closedCountCurrent > 0 ? wonCountCurrent / closedCountCurrent * 100 : 0;
    let wonQtyDiff = 0;
    let wonValDiff = 0;
    let lostQtyDiff = 0;
    let lostValDiff = 0;
    let convRateDiff = 0;
    if (compStart && compEnd) {
      const compProps = allProps.filter((p) => {
        const dateToUse = p.data_fechamento || p.created_at;
        if (!dateToUse) return false;
        const d = parseLocalDate(dateToUse);
        return d && d >= compStart && d <= compEnd;
      });
      const wonComp = compProps.filter((p) => p.situacao && p.situacao.trim().toLowerCase() === "ganho");
      const lostComp = compProps.filter((p) => p.situacao && p.situacao.trim().toLowerCase() === "perdido");
      const wonCountComp = wonComp.length;
      const wonValueComp = wonComp.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
      const lostCountComp = lostComp.length;
      const lostValueComp = lostComp.reduce((acc, p) => acc + (parseFloat(p.total_proposta) || 0), 0);
      const closedCountComp = wonCountComp + lostCountComp;
      const convRateComp = closedCountComp > 0 ? wonCountComp / closedCountComp * 100 : 0;
      wonQtyDiff = wonCountComp > 0 ? (wonCountCurrent - wonCountComp) / wonCountComp * 100 : wonCountCurrent > 0 ? 100 : 0;
      wonValDiff = wonValueComp > 0 ? (wonValueCurrent - wonValueComp) / wonValueComp * 100 : wonValueCurrent > 0 ? 100 : 0;
      lostQtyDiff = lostCountComp > 0 ? (lostCountCurrent - lostCountComp) / lostCountComp * 100 : lostCountCurrent > 0 ? 100 : 0;
      lostValDiff = lostValueComp > 0 ? (lostValueCurrent - lostValueComp) / lostValueComp * 100 : lostValueCurrent > 0 ? 100 : 0;
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
      let query = client.from("itens_proposta").select(`
          quantidade,
          preco_unitario,
          distribuidor_id,
          produto_id,
          propostas!inner(created_at),
          distribuidores(nome),
          produtos(fabricante)
        `);
      if (startDate) {
        query = query.gte("propostas.created_at", `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query = query.lte("propostas.created_at", `${endDate}T23:59:59.999Z`);
      }
      const { data, error } = await query;
      if (error) throw error;
      setCommercialData(data || []);
    } catch (err) {
      console.error("Erro ao carregar dados do painel comercial:", err);
    }
  };
  useEffect(() => {
    if (activeTab !== "relatorios" || loadingDashboard || !commercialData) {
      return;
    }
    if (distributorChartInst.current) {
      distributorChartInst.current.destroy();
      distributorChartInst.current = null;
    }
    if (manufacturerChartInst.current) {
      manufacturerChartInst.current.destroy();
      manufacturerChartInst.current = null;
    }
    const distCtx = distributorCanvasRef.current?.getContext("2d");
    if (distCtx && Object.keys(distributorTotals).length > 0) {
      const labels = Object.keys(distributorTotals);
      const dataValues = Object.values(distributorTotals);
      distributorChartInst.current = new Chart(distCtx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{
            data: dataValues,
            backgroundColor: chartColors.slice(0, labels.length),
            borderColor: chartBorderColors.slice(0, labels.length),
            borderWidth: 1.5,
            cutout: "75%",
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
              position: "followMouse",
              callbacks: {
                label: function(context) {
                  const value = context.raw || 0;
                  return ` R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      });
    }
    const fabCtx = manufacturerCanvasRef.current?.getContext("2d");
    if (fabCtx && Object.keys(manufacturerTotals).length > 0) {
      const labels = Object.keys(manufacturerTotals);
      const dataValues = Object.values(manufacturerTotals);
      manufacturerChartInst.current = new Chart(fabCtx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{
            data: dataValues,
            backgroundColor: chartColors.slice(0, labels.length),
            borderColor: chartBorderColors.slice(0, labels.length),
            borderWidth: 1.5,
            cutout: "75%",
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
              position: "followMouse",
              callbacks: {
                label: function(context) {
                  const value = context.raw || 0;
                  return ` R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      });
    }
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
    if (activeTab === "relatorios" && dbConnected) {
      loadDashboardData();
    }
  }, [activeTab, dbConnected, startDate, endDate]);
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
    console.log("[DEBUG] Auto-polling: Atualizando dados silenciosamente...");
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
    }, 18e4);
    return () => clearInterval(intervalId);
  }, [session, dbConnected, clickupTaskId, supabaseClient]);
  const loadPropostas = async (targetId = null) => {
    if (!supabaseClient || !clickupTaskId) return;
    setLoading(true);
    try {
      const idWithoutHash = clickupTaskId.startsWith("#") ? clickupTaskId.substring(1) : clickupTaskId;
      const idWithHash = "#" + idWithoutHash;
      const { data: props, error } = await supabaseClient.from("propostas").select("*").or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`).order("created_at", { ascending: false });
      if (error) throw error;
      setPropostas(props);
      fetchProjectContext();
      if (props.length > 0) {
        const selected = targetId ? props.find((p) => p.id === targetId) || props.find((p) => p.versao === "vA") || props[0] : props.find((p) => p.versao === "vA") || props[0];
        loadProposalDetails(selected.id);
      } else {
        setCurrentProposta(null);
        setItens([]);
      }
    } catch (err) {
      console.error(err);
      showToast("Erro ao carregar propostas.", "error");
    } finally {
      setLoading(false);
    }
  };
  const loadTodasPropostas = async () => {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from("propostas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setTodasPropostas(data || []);
    } catch (err) {
      console.error("[DEBUG] Erro ao carregar todas as propostas:", err);
    }
  };
  const loadProposalDetails = async (proposalId) => {
    setLoading(true);
    try {
      const { data: prop, error: propErr } = await supabaseClient.from("propostas").select("*").eq("id", proposalId).single();
      if (propErr) throw propErr;
      setCurrentProposta(prop);
      const isProj = prop && (["HCI", "Cloud", "Tradicional", "Upgrade"].map((x) => x.toUpperCase()).includes((prop.cenario || "").toUpperCase()) || prop.cenario === "" || (prop.cenario || "").toUpperCase() === "PROJETO");
      setIsProjeto(!!isProj);
      const { data: items, error: itemsErr } = await supabaseClient.from("itens_proposta").select("*").eq("proposta_id", proposalId).order("created_at");
      if (itemsErr) throw itemsErr;
      setItens(items || []);
    } catch (err) {
      console.error(err);
      showToast("Erro ao carregar detalhes da proposta.", "error");
    } finally {
      setLoading(false);
    }
  };
  const handleSaveConfig = (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    const key = e.target.key.value.trim();
    localStorage.setItem("supa_url", url);
    localStorage.setItem("supa_key", key);
    setConfig({ url, anonKey: key });
    setShowSettingsModal(false);
    showToast("Configura\xE7\xF5es salvas com sucesso!", "success");
  };
  const showToast = (msg, type = "success") => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(""), 4e3);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 4e3);
    }
  };
  const isReadOnly = false;
  const realTimeGrandTotal = useMemo(() => {
    return itens.reduce((sum, item) => sum + (item.quantidade * item.preco_unitario || 0), 0);
  }, [itens]);
  const handleItemChange = (index, field, value) => {
    if (isReadOnly) return;
    const newItens = [...itens];
    if (typeof field === "object" && field !== null) {
      const updates = field;
      const mapped = { ...updates };
      if (updates.unitario !== void 0) {
        mapped.preco_unitario = Math.max(0, parseFloat(updates.unitario) || 0);
        delete mapped.unitario;
      }
      if (updates.preco_unitario !== void 0) {
        mapped.preco_unitario = Math.max(0, parseFloat(updates.preco_unitario) || 0);
      }
      if (updates.quantidade !== void 0) {
        mapped.quantidade = Math.max(1, parseInt(updates.quantidade) || 1);
      }
      newItens[index] = { ...newItens[index], ...mapped };
    } else {
      if (field === "produto_id") {
        const selectedProd = produtos.find((p) => p.id === value);
        newItens[index] = {
          ...newItens[index],
          produto_id: value,
          preco_unitario: selectedProd ? selectedProd.custo_referencia : 0
        };
      } else if (field === "quantidade") {
        newItens[index].quantidade = Math.max(1, parseInt(value) || 1);
      } else if (field === "preco_unitario") {
        newItens[index].preco_unitario = Math.max(0, parseFloat(value) || 0);
      } else {
        newItens[index][field] = value;
      }
    }
    setItens(newItens);
  };
  const handleCurrencyInputChange = (index, rawValue) => {
    if (isReadOnly) return;
    const digits = rawValue.replace(/\D/g, "");
    if (!digits) {
      handleItemChange(index, "preco_unitario", 0);
      return;
    }
    const numericValue = parseFloat(digits) / 100;
    handleItemChange(index, "preco_unitario", numericValue);
  };
  const handleAddItem = () => {
    if (isReadOnly) return;
    if (produtos.length === 0) {
      showToast("Nenhum produto cadastrado! V\xE1 ao Painel de Gest\xE3o ou clique no bot\xE3o superior para cadastrar.", "error");
      return;
    }
    setItens([
      ...itens,
      {
        id: `temp-${Date.now()}`,
        produto_id: produtos[0]?.id || "",
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
  const handleCreateInitialProposal = async () => {
    if (!supabaseClient || !clickupTaskId) return;
    setLoading(true);
    try {
      const { data: newProposalId, error } = await supabaseClient.rpc("gerar_nova_versao", {
        id_negocio: clickupTaskId,
        cenario_nome: currentProposta ? currentProposta.cenario : "",
        criador: currentProposta ? currentProposta.criado_por : "Vendedor CRM"
      });
      if (error) throw error;
      showToast("Primeira vers\xE3o (vA) iniciada!", "success");
      loadPropostas(newProposalId);
    } catch (err) {
      console.error("Erro detalhado no insert inicial:", err);
      showToast("Erro ao criar proposta inicial.", "error");
    } finally {
      setLoading(false);
    }
  };
  const syncClickUpProposta = async (taskId, valorTotal, flowName) => {
    const cleanTaskId = String(taskId).replace("#", "").trim();
    if (!cleanTaskId) return;
    const valorLimpo = parseNumericValue(valorTotal);
    const valorCentavos = Math.round(Number(valorLimpo) * 100);
    if (valorLimpo === null || valorLimpo === void 0 || isNaN(Number(valorLimpo)) || Number(valorLimpo) <= 0 || isNaN(valorCentavos)) {
      console.warn(`[${(/* @__PURE__ */ new Date()).toISOString()}] Ignorando sincroniza\xE7\xE3o com ClickUp (${flowName}) para tarefa ${cleanTaskId} pois o valor \xE9 inv\xE1lido ou <= 0:`, valorLimpo);
      return;
    }
    try {
      const taskRes = await fetch(`/clickup-api/task/${cleanTaskId}`, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!taskRes.ok) {
        console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Erro ao obter tarefa ${cleanTaskId} no ClickUp (status: ${taskRes.status})`);
        return;
      }
      const currentTask = await taskRes.json();
      if (!currentTask || !currentTask.custom_fields) {
        console.warn(`[${(/* @__PURE__ */ new Date()).toISOString()}] Tarefa ClickUp ${cleanTaskId} n\xE3o tem custom_fields.`);
        return;
      }
      const campoValor = currentTask.custom_fields.find((f) => {
        const name = (f.name || "").toLowerCase();
        return name === "deal value" || name === "total da proposta" || name === "valor total" || name === "valor do neg\xF3cio" || name === "valor" || name === "total";
      });
      if (campoValor) {
        const bodyFormatado = campoValor.id === DEAL_VALUE_FIELD_ID ? { value: Number(Number(valorLimpo).toFixed(2)) } : { value: valorCentavos };
        const urlValue = `/clickup-api/task/${cleanTaskId}/field/${campoValor.id}`;
        console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] POST ${urlValue} - Body:`, JSON.stringify(bodyFormatado));
        if (cleanTaskId === "86ahby7wm") {
          console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando valor local para ClickUp (${flowName}): ${bodyFormatado.value}`);
        }
        const resVal = await fetch(urlValue, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyFormatado)
        });
        if (resVal.status !== 200 && resVal.status !== 201) {
          const errText = await resVal.text();
          console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Erro ao atualizar campo local no ClickUp [Status: ${resVal.status}]:`, errText);
        } else {
          console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] Campo local (${campoValor.name}) atualizado com sucesso no ClickUp (${flowName})!`);
          try {
            console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] Iniciando verifica\xE7\xE3o GET p\xF3s-POST para a tarefa ${cleanTaskId}...`);
            const verifyRes = await fetch(`/clickup-api/task/${cleanTaskId}`, {
              headers: {
                "Content-Type": "application/json"
              }
            });
            if (verifyRes.ok) {
              const verifyTask = await verifyRes.json();
              const verifyField = verifyTask.custom_fields?.find((f) => f.id === campoValor.id);
              const valorRetornado = verifyField ? verifyField.value : null;
              console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] VALIDA\xC7\xC3O p\xF3s-update (${flowName}) para tarefa ${cleanTaskId}: Valor retornado no ClickUp =`, valorRetornado, `(Esperado: ${bodyFormatado.value})`);
              if (cleanTaskId === "86ahby7wm") {
                console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] [VALOR CONFIRMADO TASK 86ahby7wm] Valor p\xF3s-POST no ClickUp:`, valorRetornado);
              }
            }
          } catch (verifyErr) {
            console.error("Erro ao validar campo local:", verifyErr);
          }
        }
      } else {
        console.warn(`[${(/* @__PURE__ */ new Date()).toISOString()}] Campo local de valor n\xE3o encontrado na tarefa ${cleanTaskId}.`);
      }
      const relField = currentTask.custom_fields.find((f) => {
        if (f.type !== "list_relationship") return false;
        const name = (f.name || "").toLowerCase();
        return name.includes("neg\xF3cio") || name.includes("negocio") || name.includes("comercial proposal");
      });
      if (relField && relField.value && Array.isArray(relField.value) && relField.value.length > 0) {
        const parentTaskId = String(relField.value[0].id).replace("#", "").trim();
        const urlGlobal = `/clickup-api/task/${parentTaskId}/field/${DEAL_VALUE_FIELD_ID}`;
        const bodyFormatado = { value: Number(Number(valorLimpo).toFixed(2)) };
        console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] POST ${urlGlobal} - Body:`, JSON.stringify(bodyFormatado));
        if (cleanTaskId === "86ahby7wm" || parentTaskId === "86ahby7wm") {
          console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando Deal Value global para a tarefa pai ${parentTaskId}: ${bodyFormatado.value}`);
        }
        const resGlobal = await fetch(urlGlobal, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyFormatado)
        });
        if (resGlobal.status !== 200 && resGlobal.status !== 201) {
          const errText = await resGlobal.text();
          console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Erro cr\xEDtico ao atualizar Deal Value global na tarefa ${parentTaskId} [Status: ${resGlobal.status}]:`, errText);
        } else {
          console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] Deal Value global atualizado com sucesso no ClickUp (Tarefa Neg\xF3cio Pai: ${parentTaskId})!`);
          try {
            console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] Iniciando verifica\xE7\xE3o GET p\xF3s-POST para a tarefa pai ${parentTaskId}...`);
            const verifyRes = await fetch(`/clickup-api/task/${parentTaskId}`, {
              headers: {
                "Content-Type": "application/json"
              }
            });
            if (verifyRes.ok) {
              const verifyTask = await verifyRes.json();
              const verifyField = verifyTask.custom_fields?.find((f) => f.id === DEAL_VALUE_FIELD_ID);
              const valorRetornado = verifyField ? verifyField.value : null;
              console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] VALIDA\xC7\xC3O Deal Value global p\xF3s-update (${flowName}) para tarefa ${parentTaskId}: valor =`, valorRetornado);
              if (parentTaskId === "86ahby7wm") {
                console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] [VALOR CONFIRMADO TASK 86ahby7wm] Valor global p\xF3s-POST no ClickUp:`, valorRetornado);
              }
            }
          } catch (verifyErr) {
            console.error("Erro ao validar Deal Value global:", verifyErr);
          }
        }
      } else {
        console.warn(`[${(/* @__PURE__ */ new Date()).toISOString()}] Relacionamento de Neg\xF3cio/Comercial Proposal n\xE3o encontrado na tarefa ${cleanTaskId}.`);
      }
    } catch (err) {
      console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Erro durante a sincroniza\xE7\xE3o dupla com o ClickUp (${flowName}):`, err);
    }
  };
  const handleSaveProposal = async () => {
    if (isReadOnly || !currentProposta) return;
    setSaving(true);
    try {
      const cleanTaskId = String(clickupTaskId || "").replace("#", "").trim();
      if (cleanTaskId) {
        setSupabaseProposalsList((prev) => {
          const updated = (prev || []).map((p) => {
            const pClean = String(p.clickup_negocio_id || "").replace("#", "").trim();
            if (pClean === cleanTaskId && p.id === currentProposta.id) {
              return { ...p, total_proposta: realTimeGrandTotal, situacao: currentProposta.situacao };
            }
            return p;
          });
          const exists = updated.some((p) => String(p.clickup_negocio_id || "").replace("#", "").trim() === cleanTaskId && p.id === currentProposta.id);
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
      const { error: propError } = await supabaseClient.from("propostas").update({
        cenario: currentProposta.cenario,
        criado_por: currentProposta.criado_por,
        situacao: currentProposta.situacao,
        total_proposta: realTimeGrandTotal,
        motivo_perda: currentProposta.situacao === "Perdido" ? currentProposta.motivo_perda : null
      }).eq("id", currentProposta.id);
      if (propError) throw propError;
      const { error: deleteError } = await supabaseClient.from("itens_proposta").delete().eq("proposta_id", currentProposta.id);
      if (deleteError) throw deleteError;
      if (itens.length > 0) {
        const itensToInsert = itens.map((item) => ({
          proposta_id: currentProposta.id,
          produto_id: item.produto_id,
          distribuidor_id: item.distribuidor_id || distribuidores[0]?.id || null,
          quantidade: Math.max(1, parseInt(item.quantidade) || 1),
          preco_unitario: Math.max(0, parseFloat(item.preco_unitario) || 0)
        }));
        const { error: insertError } = await supabaseClient.from("itens_proposta").insert(itensToInsert);
        if (insertError) throw insertError;
      }
      if (currentProposta.situacao === "Selecionada") {
        await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, "Save");
      }
      showToast("Proposta salva com sucesso!", "success");
      loadPropostas(currentProposta.id);
      refreshSupabaseProposalsList();
    } catch (err) {
      console.error(err);
      showToast("Erro ao salvar proposta.", "error");
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
  const handleGerarNovaVersao = async () => {
    if (!currentProposta || !clickupTaskId) return;
    setSaving(true);
    try {
      if (!isReadOnly) {
        await handleSaveProposal();
      }
      const nextVersao = getNextVersionLetter(currentProposta.versao);
      await supabaseClient.from("propostas").update({ situacao: isProjeto ? "Ativa" : "Desconsiderada" }).eq("clickup_negocio_id", clickupTaskId).in("situacao", ["Ativa", "Selecionada"]);
      const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : currentProposta.criado_por || "";
      const { data: newProp, error: propErr } = await supabaseClient.from("propostas").insert({
        clickup_negocio_id: clickupTaskId,
        versao: nextVersao,
        cenario: "",
        situacao: "Ativa",
        total_proposta: currentProposta.total_proposta,
        criado_por: currentResponsavel
      }).select().single();
      if (propErr) throw propErr;
      if (itens.length > 0) {
        const clonedItens = itens.map((item) => ({
          proposta_id: newProp.id,
          produto_id: item.produto_id,
          quantidade: Math.max(1, parseInt(item.quantidade) || 1),
          preco_unitario: Math.max(0, parseFloat(item.preco_unitario) || 0),
          distribuidor_id: item.distribuidor_id || null
        }));
        const { error: itemsErr } = await supabaseClient.from("itens_proposta").insert(clonedItens);
        if (itemsErr) throw itemsErr;
      }
      showToast("Nova vers\xE3o gerada com sucesso!", "success");
      loadPropostas(newProp.id);
    } catch (err) {
      console.error("Erro ao gerar nova vers\xE3o:", err);
      showToast("Erro ao gerar nova vers\xE3o.", "error");
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteProposal = async (proposalToDelete = null) => {
    const targetProp = proposalToDelete || currentProposta;
    if (!targetProp || !supabaseClient) return;
    const isVa = targetProp.versao === "vA";
    if (isVa) {
      const message = "Aten\xE7\xE3o! Excluir a vers\xE3o inicial (vA) deletar\xE1 permanentemente TODAS as vers\xF5es desta proposta. Deseja continuar?";
      if (!confirm(message)) return;
      setSaving(true);
      try {
        const proposalIds = propostas.map((p) => p.id);
        if (proposalIds.length > 0) {
          await supabaseClient.from("itens_proposta").delete().in("proposta_id", proposalIds);
        }
        const { error } = await supabaseClient.from("propostas").delete().eq("clickup_negocio_id", clickupTaskId);
        if (error) throw error;
        showToast("Todo o hist\xF3rico de propostas foi exclu\xEDdo!", "success");
        setCurrentProposta(null);
        setPropostas([]);
        setItens([]);
        setClickupTaskId("");
      } catch (err) {
        console.error(err);
        showToast("Erro ao excluir hist\xF3rico.", "error");
      } finally {
        setSaving(false);
      }
    } else {
      const message = `Deseja realmente excluir a vers\xE3o ${targetProp.versao}?`;
      if (!confirm(message)) return;
      setSaving(true);
      try {
        await supabaseClient.from("itens_proposta").delete().eq("proposta_id", targetProp.id);
        const { error } = await supabaseClient.from("propostas").delete().eq("id", targetProp.id);
        if (error) throw error;
        showToast("Vers\xE3o exclu\xEDda com sucesso!", "success");
        const isCurrentDeleted = currentProposta && currentProposta.id === targetProp.id;
        setPropostas((prev) => prev.filter((p) => p.id !== targetProp.id));
        if (isCurrentDeleted) {
          const vaProp = propostas.find((p) => p.versao === "vA");
          if (vaProp && vaProp.id !== targetProp.id) {
            await loadProposalDetails(vaProp.id);
          } else {
            setCurrentProposta(null);
            setItens([]);
          }
        }
      } catch (err) {
        console.error(err);
        showToast("Erro ao excluir vers\xE3o.", "error");
      } finally {
        setSaving(false);
      }
    }
  };
  const handleSituationChange = async (newSituacao) => {
    if (!currentProposta || !supabaseClient) return;
    if (newSituacao === "Selecionada") {
      await handleSelectProposal();
      return;
    }
    if (newSituacao === "Ganho") {
      setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
      setShowCloseModal("win");
      return;
    }
    if (newSituacao === "Perdido") {
      setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
      setSelectedLossReason("");
      setShowCloseModal("loss");
      return;
    }
    setSaving(true);
    const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : "";
    try {
      const { error } = await supabaseClient.from("propostas").update({
        situacao: newSituacao,
        motivo_perda: null,
        criado_por: currentResponsavel
      }).eq("id", currentProposta.id);
      if (error) throw error;
      showToast(`Situa\xE7\xE3o alterada para ${newSituacao}!`, "success");
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
      showToast("Erro ao atualizar situa\xE7\xE3o.", "error");
    } finally {
      setSaving(false);
    }
  };
  const handleSearchClickUpProposal = async () => {
    if (!searchTerm.trim()) {
      showToast("Digite um n\xFAmero de proposta para buscar.", "error");
      return;
    }
    setSearching(true);
    setSearchResult("");
    try {
      const clickupHeaders = {
        "Content-Type": "application/json"
      };
      const teamsRes = await fetch("/clickup-api/team", {
        headers: clickupHeaders
      });
      if (!teamsRes.ok) throw new Error("Erro ao obter workspaces do ClickUp");
      const teamsData = await teamsRes.json();
      const teamId = teamsData.teams?.[0]?.id;
      if (!teamId) throw new Error("Nenhum workspace encontrado no ClickUp");
      let matchedTask = null;
      const numeroDigitado = searchTerm.toString().trim().toLowerCase();
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
              matchedTask = listTasks.find((task) => {
                const fields = task.custom_fields || [];
                return fields.some((field) => {
                  const nameLower = (field.name || "").toLowerCase();
                  const isProposalField = field.id === "c44cc05d-303f-47e2-b243-40c6b26b732f" || nameLower.includes("proposta") || nameLower.includes("proposal") || nameLower.includes("vers");
                  if (isProposalField && field.value !== void 0 && field.value !== null) {
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
            matchedTask = teamTasks.find((task) => {
              const fields = task.custom_fields || [];
              return fields.some((field) => {
                const nameLower = (field.name || "").toLowerCase();
                const isProposalField = field.id === "c44cc05d-303f-47e2-b243-40c6b26b732f" || nameLower.includes("proposta") || nameLower.includes("proposal") || nameLower.includes("vers");
                if (isProposalField && field.value !== void 0 && field.value !== null) {
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
        showToast("Proposta n\xE3o encontrada no ClickUp.", "error");
        setSearchResult("\u{1F534} Proposta n\xE3o encontrada no ClickUp");
        return;
      }
      let taskId = matchedTask.id;
      const matchedNameLower = (matchedTask.name || "").toLowerCase();
      const isAlreadyProposalTask = matchedNameLower.includes("proposta comercial") || matchedNameLower.includes("comercial proposal");
      if (!isAlreadyProposalTask) {
        const relField = (matchedTask.custom_fields || []).find(
          (f) => (f.name || "").toLowerCase() === "comercial proposal" || (f.name || "").toLowerCase() === "proposta comercial"
        );
        if (relField && relField.value && relField.value.length > 0) {
          const relTask = relField.value.find(
            (t) => (t.name || "").toLowerCase().includes("proposta comercial") || (t.name || "").toLowerCase().includes("comercial proposal")
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
      setSearchResult(`\u{1F7E2} Neg\xF3cio Vinculado: ${matchedTask.name}`);
      showToast("Neg\xF3cio ClickUp vinculado com sucesso!", "success");
    } catch (err) {
      console.error(err);
      showToast("Falha na busca do ClickUp.", "error");
      setSearchResult("\u{1F534} Erro ao comunicar com o ClickUp");
    } finally {
      setSearching(false);
    }
  };
  const handleUpdateVersionStatus = async (targetTaskId, versionId, newStatus) => {
    if (!versionId || !targetTaskId) return;
    const taskId = String(targetTaskId).replace("#", "").trim();
    if (!clickupTaskId) {
      setClickupTaskId(targetTaskId);
    }
    const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : "";
    if (currentProposta && currentProposta.id === versionId) {
      setCurrentProposta((prev) => ({ ...prev, situacao: newStatus, criado_por: currentResponsavel }));
    }
    setPropostas((prev) => prev.map((p) => {
      if (p.id === versionId) {
        return { ...p, situacao: newStatus, criado_por: currentResponsavel };
      }
      if (newStatus === "Selecionada" && p.id !== versionId) {
        return { ...p, situacao: "Desconsiderada" };
      }
      return p;
    }));
    if (newStatus === "Selecionada") {
      const targetProp = propostas.find((p) => p.id === versionId) || currentProposta;
      const valToSync = targetProp ? parseFloat(targetProp.total_proposta) || 0 : realTimeGrandTotal;
      setKanbanTasks((prevTasks) => prevTasks.map((t) => t.id === targetTaskId ? { ...t, valor_estimado: valToSync, responsavel_negocio: t.responsavel_negocio || t.assignees } : t));
      if (selectedTask && selectedTask.id === targetTaskId) {
        setSelectedTask((prev) => ({ ...prev, valor_estimado: valToSync, responsavel_negocio: prev.responsavel_negocio }));
      }
    }
    setSaving(true);
    try {
      if (!isReadOnly && newStatus === "Selecionada") {
        await handleSaveProposal();
      }
      if (newStatus === "Selecionada") {
        await supabaseClient.from("propostas").update({ situacao: "Desconsiderada" }).eq("clickup_negocio_id", targetTaskId).neq("id", versionId);
      }
      const updateData = {
        situacao: newStatus,
        criado_por: currentResponsavel
      };
      if (newStatus === "Selecionada") {
        updateData.total_proposta = realTimeGrandTotal;
      }
      const { error } = await supabaseClient.from("propostas").update(updateData).eq("id", versionId);
      if (error) throw error;
      if (newStatus === "Selecionada") {
        const targetProp = propostas.find((p) => p.id === versionId) || currentProposta;
        const valToSync = targetProp ? parseFloat(targetProp.total_proposta) || 0 : realTimeGrandTotal;
        await syncClickUpProposta(taskId, valToSync, "Select");
      }
      showToast(`Status atualizado para ${newStatus}!`, "success");
      await loadPropostas(versionId);
      await loadProposalDetails(versionId);
      await refreshSupabaseProposalsList();
      loadDashboardData();
      fetchKanbanData();
    } catch (err) {
      console.warn("Erro silencioso de PostgREST ou rede na sincroniza\xE7\xE3o de propostas:", err);
    } finally {
      setSaving(false);
    }
  };
  const handleConfirmClose = async () => {
    if (!currentProposta || !supabaseClient) return;
    const dateVal = closeDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (showCloseModal === "loss" && !selectedLossReason) {
      showToast("Por favor, selecione o motivo da perda.", "error");
      return;
    }
    setSaving(true);
    try {
      const isWin = showCloseModal === "win";
      const situacao = isWin ? "Ganho" : "Perdido";
      const motivo = isWin ? null : selectedLossReason;
      const { error } = await supabaseClient.from("propostas").update({
        situacao,
        motivo_perda: motivo,
        data_fechamento: dateVal,
        total_proposta: realTimeGrandTotal
      }).eq("id", currentProposta.id);
      if (error) throw error;
      if (clickupTaskId) {
        await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, situacao);
        const targetOption = kanbanColumns.find((c) => c.name.toLowerCase().includes(isWin ? "ganho" : "perdido"));
        if (targetOption) {
          await handleOpportunityStateChange(clickupTaskId, targetOption.id);
        }
      }
      showToast(`Proposta marcada como ${isWin ? "GANHA" : "PERDIDA"} com sucesso!`, "success");
      setShowCloseModal(false);
      setShowDrawer(false);
      loadPropostas(currentProposta.id);
      await refreshSupabaseProposalsList();
      loadDashboardData();
      fetchKanbanData();
    } catch (err) {
      console.error(err);
      showToast("Erro ao fechar proposta.", "error");
    } finally {
      setSaving(false);
    }
  };
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabaseClient.from("produtos").insert({
        nome: newProduct.nome,
        fabricante: newProduct.fabricante,
        custo_referencia: parseFloat(newProduct.custo_referencia) || 0
      }).select().single();
      if (error) throw error;
      showToast("Produto cadastrado!", "success");
      setNewProduct({ nome: "", fabricante: "", custo_referencia: "" });
      await loadProducts();
    } catch (err) {
      showToast(err.message || "Erro ao cadastrar produto", "error");
    }
  };
  const handleSaveProductEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient.from("produtos").update({
        nome: editingProduct.nome,
        fabricante: editingProduct.fabricante,
        custo_referencia: parseFloat(editingProduct.custo_referencia) || 0
      }).eq("id", editingProduct.id);
      if (error) throw error;
      showToast("Produto atualizado com sucesso!", "success");
      setEditingProduct(null);
      loadProducts();
    } catch (err) {
      console.error(err);
      showToast("Erro ao editar produto.", "error");
    }
  };
  const handleDeleteProduct = async (id) => {
    if (!confirm("Deseja realmente excluir este produto?")) return;
    try {
      const { error } = await supabaseClient.from("produtos").delete().eq("id", id);
      if (error) throw error;
      showToast("Produto exclu\xEDdo com sucesso!", "success");
      loadProducts();
    } catch (err) {
      console.error(err);
      showToast("Erro ao excluir produto. Ele pode estar sendo usado em uma proposta.", "error");
    }
  };
  const handleCreateVendedor = async (e) => {
    e.preventDefault();
    if (!newVendedorName.trim()) return;
    try {
      const { data, error } = await supabaseClient.from("vendedores").insert({ nome: newVendedorName.trim() }).select().single();
      if (error) throw error;
      showToast("Vendedor adicionado!", "success");
      setNewVendedorName("");
      await loadVendedores();
    } catch (err) {
      showToast(err.message || "Erro ao cadastrar vendedor", "error");
    }
  };
  const handleSaveVendedorEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient.from("vendedores").update({ nome: editingVendedor.nome }).eq("id", editingVendedor.id);
      if (error) throw error;
      showToast("Vendedor atualizado com sucesso!", "success");
      setEditingVendedor(null);
      loadVendedores();
    } catch (err) {
      console.error(err);
      showToast("Erro ao editar vendedor.", "error");
    }
  };
  const handleDeleteVendedor = async (id) => {
    if (!confirm("Deseja realmente excluir este vendedor?")) return;
    try {
      const { error } = await supabaseClient.from("vendedores").delete().eq("id", id);
      if (error) throw error;
      showToast("Vendedor exclu\xEDdo com sucesso!", "success");
      loadVendedores();
    } catch (err) {
      console.error(err);
      showToast("Erro ao excluir vendedor.", "error");
    }
  };
  const triggerLossModal = () => {
    setSelectedLossReason("");
    setShowLossModal(true);
  };
  const handleConfirmLoss = async () => {
    if (!currentProposta || !supabaseClient) return;
    if (!selectedLossReason) {
      showToast("Selecione um motivo para a perda.", "error");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabaseClient.from("propostas").update({
        situacao: "Perdido",
        motivo_perda: selectedLossReason
      }).eq("id", currentProposta.id);
      if (error) throw error;
      showToast("Proposta marcada como PERDIDA!", "success");
      setCurrentProposta({
        ...currentProposta,
        situacao: "Perdido",
        motivo_perda: selectedLossReason
      });
      setShowLossModal(false);
      loadPropostas(currentProposta.id);
    } catch (err) {
      console.error(err);
      showToast("Erro ao atualizar situa\xE7\xE3o para Perdido.", "error");
    } finally {
      setSaving(false);
    }
  };
  const handleCreateDistributor = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabaseClient.from("distribuidores").insert({ nome: newDistributorName.trim() }).select().single();
      if (error) throw error;
      showToast("Distribuidor adicionado!", "success");
      setNewDistributorName("");
      await loadDistributors();
    } catch (err) {
      showToast(err.message || "Erro ao cadastrar distribuidor", "error");
    }
  };
  const handleSaveDistributorEdit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient.from("distribuidores").update({ nome: editingDistributor.nome }).eq("id", editingDistributor.id);
      if (error) throw error;
      showToast("Distribuidor atualizado com sucesso!", "success");
      setEditingDistributor(null);
      loadDistributors();
    } catch (err) {
      console.error(err);
      showToast("Erro ao editar distribuidor.", "error");
    }
  };
  const handleDeleteDistributor = async (id) => {
    if (!confirm("Deseja realmente excluir este distribuidor?")) return;
    try {
      const { error } = await supabaseClient.from("distribuidores").delete().eq("id", id);
      if (error) throw error;
      showToast("Distribuidor exclu\xEDdo com sucesso!", "success");
      loadDistributors();
    } catch (err) {
      console.error(err);
      showToast("Erro ao excluir distribuidor.", "error");
    }
  };
  const handleBatchImport = async () => {
    if (!importText.trim()) {
      showToast("Insira o texto CSV ou XML para importar.", "error");
      return;
    }
    setSaving(true);
    try {
      let productsToInsert = [];
      if (importFormat === "csv") {
        const lines = importText.split("\n");
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          const parts = line.includes(";") ? line.split(";") : line.split(",");
          if (parts.length >= 3) {
            const fabricante = parts[0].trim().replace(/^["']|["']$/g, "");
            const nome = parts[1].trim().replace(/^["']|["']$/g, "");
            const custo = parseFloat(parts[2].trim().replace(/[^0-9.]/g, "")) || 0;
            if (nome && fabricante) {
              productsToInsert.push({ nome, fabricante, custo_referencia: custo });
            }
          }
        }
      } else {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(importText, "text/xml");
        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
          throw new Error("Erro de formata\xE7\xE3o XML: " + parseError[0].textContent);
        }
        const nodes = xmlDoc.getElementsByTagName("produto");
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const nome = node.getElementsByTagName("nome")[0]?.textContent || "";
          const fabricante = node.getElementsByTagName("fabricante")[0]?.textContent || "";
          const custoText = node.getElementsByTagName("custo")[0]?.textContent || node.getElementsByTagName("custo_referencia")[0]?.textContent || "0";
          const custo = parseFloat(custoText.replace(/[^0-9.]/g, "")) || 0;
          if (nome && fabricante) {
            productsToInsert.push({ nome, fabricante, custo_referencia: custo });
          }
        }
      }
      if (productsToInsert.length === 0) {
        throw new Error("Nenhum produto v\xE1lido encontrado no texto informado.");
      }
      const { data, error } = await supabaseClient.from("produtos").upsert(productsToInsert, { onConflict: "nome,fabricante" });
      if (error) throw error;
      showToast(`Importa\xE7\xE3o conclu\xEDda! ${productsToInsert.length} produtos adicionados/atualizados.`, "success");
      setImportText("");
      loadProducts();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erro ao importar produtos.", "error");
    } finally {
      setSaving(false);
    }
  };
  const renderTimeline = (showHeader = true) => {
    return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col space-y-4 h-full" }, showHeader && /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("h2", { className: "text-sm font-bold uppercase tracking-wider text-indigo-400" }, "Timeline de Vers\xF5es"), /* @__PURE__ */ React.createElement("span", { className: "bg-slate-800 px-2 py-0.5 rounded-full text-xs font-semibold text-slate-300" }, propostas.length)), propostas.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center p-4 text-center space-y-4" }, /* @__PURE__ */ React.createElement("svg", { className: "w-10 h-10 text-slate-600", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "Nenhuma proposta criada para este neg\xF3cio."), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleCreateInitialProposal,
        className: "w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white shadow-lg transition-all"
      },
      "Criar Vers\xE3o vA"
    )) : /* @__PURE__ */ React.createElement("div", { className: "flex-1 space-y-3 pr-1 overflow-visible" }, propostas.map((prop, i) => {
      const isSelected = currentProposta && currentProposta.id === prop.id;
      const statusColors = {
        "Ativa": "bg-blue-500 text-blue-100 border-blue-400/20",
        "Selecionada": "bg-emerald-500 text-emerald-100 border-emerald-400/20",
        "Ganho": "bg-amber-500 text-amber-950 border-amber-400/20 font-extrabold",
        "Desconsiderada": "bg-red-600 text-white border-red-500/20",
        "N\xE3o selecionada": "bg-slate-600 text-slate-300 border-slate-500/20",
        "Substitu\xEDda": "bg-amber-600/70 text-amber-200 border-amber-500/20"
      };
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: prop.id,
          onClick: async () => {
            await loadProposalDetails(prop.id);
            setDrawerTab("budget");
          },
          className: `p-3 rounded-xl cursor-pointer timeline-item glass-card transition-all ${openMenuVersionId === prop.id ? "relative z-40" : "relative z-10"} ${isSelected ? "active-glow border-indigo-500 bg-slate-800/80" : "bg-slate-900/40 hover:bg-slate-800/30"}`
        },
        /* @__PURE__ */ React.createElement("div", { className: "timeline-line" }),
        /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-5 h-5 flex items-center justify-center bg-indigo-950 text-indigo-300 rounded-md text-xs font-bold border border-indigo-500/30" }, prop.versao), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-medium text-slate-300 uppercase" }, prop.cenario)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-1.5 relative", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${statusColors[prop.situacao] || "bg-slate-700"}` }, prop.situacao), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              setOpenMenuVersionId(openMenuVersionId === prop.id ? null : prop.id);
            },
            className: "p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors",
            title: "Mudar Situa\xE7\xE3o"
          },
          /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "currentColor", viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" }))
        ), openMenuVersionId === prop.id && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-40 bg-transparent cursor-default", onClick: () => setOpenMenuVersionId(null) }), /* @__PURE__ */ React.createElement("div", { className: "absolute right-full top-0 mr-2 z-50 w-36 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1 block" }, ["Ativa", "Selecionada", "Ganho", "Desconsiderada", "Perdido"].map((st) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: st,
            onClick: async (e) => {
              e.stopPropagation();
              setOpenMenuVersionId(null);
              await loadProposalDetails(prop.id);
              if (st === "Ganho") {
                setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
                setShowCloseModal("win");
              } else if (st === "Perdido") {
                setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
                setSelectedLossReason("");
                setShowCloseModal("loss");
              } else {
                await handleUpdateVersionStatus(clickupTaskId || prop.clickup_negocio_id, prop.id, st);
              }
            },
            className: "w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          },
          st
        )), /* @__PURE__ */ React.createElement("div", { className: "border-t border-slate-800 my-1" }), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: async (e) => {
              e.stopPropagation();
              setOpenMenuVersionId(null);
              await handleDeleteProposal(prop);
            },
            className: "w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/30 hover:text-red-300 font-medium"
          },
          "\u{1F5D1}\uFE0F Excluir"
        )))))),
        /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-baseline mt-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-500" }, new Date(prop.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), " \u2022 ", prop.criado_por.split(" ")[0]), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-white" }, "R$ ", Number(isSelected ? realTimeGrandTotal : prop.total_proposta).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })))
      );
    })), propostas.length > 0 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: async () => {
          await handleGerarNovaVersao();
          setDrawerTab("budget");
        },
        disabled: saving,
        className: "w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 mt-4 shadow-lg shadow-indigo-950/50 hover:bg-indigo-500"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" })),
      /* @__PURE__ */ React.createElement("span", null, "Gerar Nova Vers\xE3o")
    ));
  };
  const renderBudgetEditor = () => {
    if (loading) {
      return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-400 font-medium" }, "Processando dados da proposta..."));
    }
    if (!currentProposta) {
      return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "w-20 h-20 bg-indigo-950/50 rounded-full border border-indigo-500/20 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("svg", { className: "w-10 h-10 text-indigo-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-xl font-bold text-white mb-2" }, "Painel de Propostas Comerciais"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-400" }, "Selecione ou gere uma nova proposta na timeline para carregar a tela de negocia\xE7\xE3o.")));
    }
    const getTipoOportunidade = () => {
      const c = currentProposta.cenario || "";
      if (["HCI", "Cloud", "Tradicional", "Upgrade"].includes(c)) return "PROJETO";
      return c;
    };
    return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setDrawerTab("details"),
        className: "flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M10 19l-7-7m0 0l7-7m-7 7h18" })),
      /* @__PURE__ */ React.createElement("span", null, "Voltar para Detalhes")
    )), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "border-b border-slate-800 bg-slate-900/20 p-6 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-4" }, /* @__PURE__ */ React.createElement("div", null, projectContext.name && /* @__PURE__ */ React.createElement("h1", { className: "text-3xl font-extrabold text-indigo-400 tracking-tight mb-2" }, projectContext.name), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-bold text-white tracking-tight" }, "Proposta ", currentProposta.versao), currentProposta.cenario && /* @__PURE__ */ React.createElement("span", { className: "bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2.5 py-0.5 rounded-full uppercase font-bold" }, currentProposta.cenario), isReadOnly && /* @__PURE__ */ React.createElement("span", { className: "bg-amber-950/60 border border-amber-500/20 text-amber-300 text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold flex items-center space-x-1 pulse-badge" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" })), /* @__PURE__ */ React.createElement("span", null, "Apenas Leitura"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3 flex-wrap mt-1.5" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "Criada em ", new Date(currentProposta.created_at).toLocaleString("pt-BR"), " ", currentProposta.criado_por ? `por ${currentProposta.criado_por}` : ""), currentProposta.situacao === "Ganho" && /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-bold text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded-md border border-amber-500/30" }, "\u{1F3C6} Ganho ", currentProposta.data_fechamento ? `(${(/* @__PURE__ */ new Date(currentProposta.data_fechamento + "T00:00:00")).toLocaleDateString("pt-BR")})` : ""), currentProposta.situacao === "Perdido" && /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-bold text-red-400 bg-red-950/80 px-2.5 py-0.5 rounded-md border border-red-500/30" }, "\u{1F61E} Perdido: ", currentProposta.motivo_perda || "Outros", " ", currentProposta.data_fechamento ? `(${(/* @__PURE__ */ new Date(currentProposta.data_fechamento + "T00:00:00")).toLocaleDateString("pt-BR")})` : "")))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center flex-wrap gap-2.5" }, currentProposta.situacao !== "Ganho" && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
          setShowCloseModal("win");
        },
        disabled: saving,
        className: "px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-amber-950 rounded-xl text-xs font-black shadow-lg shadow-amber-950/30 transition-all flex items-center space-x-1.5"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F3C6} Marcar como Ganha")
    ), currentProposta.situacao !== "Perdido" && currentProposta.situacao !== "Ganho" && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
          setSelectedLossReason("");
          setShowCloseModal("loss");
        },
        disabled: saving,
        className: "px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-red-950/30 transition-all flex items-center space-x-1.5"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F61E} Marcar como Perdido")
    ), currentProposta.situacao !== "Ganho" && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, "Selecionada"),
        disabled: saving || currentProposta.situacao === "Selecionada",
        className: `px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-lg ${currentProposta.situacao === "Selecionada" ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 cursor-default" : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/30"}`
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M5 13l4 4L19 7" })),
      /* @__PURE__ */ React.createElement("span", null, currentProposta.situacao === "Selecionada" ? "\u2713 Selecionada" : currentProposta.situacao === "Desconsiderada" ? "Reativar e Selecionar" : "Selecionar")
    ), !isReadOnly && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleSaveProposalDebounced,
        disabled: saving,
        className: "p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-indigo-950/30 transition-all flex items-center justify-center",
        title: "Salvar Altera\xE7\xF5es"
      },
      saving ? /* @__PURE__ */ React.createElement("div", { className: "w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" }) : /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" }), /* @__PURE__ */ React.createElement("polyline", { points: "17 21 17 13 7 13 7 21" }), /* @__PURE__ */ React.createElement("polyline", { points: "7 3 7 8 15 8" }))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleDeleteProposal,
        disabled: saving,
        className: "p-2.5 bg-slate-900 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-900/50 rounded-xl transition-all flex items-center justify-center",
        title: "Excluir Vers\xE3o"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "11", x2: "10", y2: "17" }), /* @__PURE__ */ React.createElement("line", { x1: "14", y1: "11", x2: "14", y2: "17" }))
    ))), /* @__PURE__ */ React.createElement("div", { className: "p-6 bg-slate-900/10 border-b border-slate-900 grid grid-cols-1 md:grid-cols-3 gap-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" }, "Tipo de Oportunidade"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500",
        value: getTipoOportunidade(),
        onChange: (e) => {
          const val = e.target.value;
          if (val === "PROJETO") {
            setIsProjeto(true);
            setCurrentProposta({ ...currentProposta, cenario: "" });
          } else {
            setIsProjeto(false);
            setCurrentProposta({ ...currentProposta, cenario: val });
          }
        }
      },
      /* @__PURE__ */ React.createElement("option", { value: "", disabled: true, className: "bg-slate-900 text-slate-400" }, "Selecione o tipo de Oportunidade..."),
      /* @__PURE__ */ React.createElement("option", { value: "PROJETO", className: "bg-slate-900 text-slate-200" }, "PROJETO"),
      /* @__PURE__ */ React.createElement("option", { value: "GARANTIAS", className: "bg-slate-900 text-slate-200" }, "GARANTIAS"),
      /* @__PURE__ */ React.createElement("option", { value: "SERVI\xC7OS", className: "bg-slate-900 text-slate-200" }, "SERVI\xC7OS"),
      /* @__PURE__ */ React.createElement("option", { value: "SSU", className: "bg-slate-900 text-slate-200" }, "SSU"),
      /* @__PURE__ */ React.createElement("option", { value: "VOLUMES", className: "bg-slate-900 text-slate-200" }, "VOLUMES"),
      /* @__PURE__ */ React.createElement("option", { value: "UPGRADE", className: "bg-slate-900 text-slate-200" }, "UPGRADE")
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" }, "Tipo de Projeto"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-60",
        value: currentProposta.cenario || "",
        onChange: (e) => setCurrentProposta({ ...currentProposta, cenario: e.target.value }),
        disabled: isReadOnly || !isProjeto
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecione o tipo..."),
      /* @__PURE__ */ React.createElement("option", { value: "HCI" }, "HCI (Hiperconverg\xEAncia)"),
      /* @__PURE__ */ React.createElement("option", { value: "Cloud" }, "Cloud (Nuvem)"),
      /* @__PURE__ */ React.createElement("option", { value: "Tradicional" }, "Tradicional"),
      /* @__PURE__ */ React.createElement("option", { value: "Upgrade" }, "Upgrade")
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" }, "Vendedor / Respons\xE1vel"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-60",
        value: currentProposta.criado_por || "",
        onChange: (e) => setCurrentProposta({ ...currentProposta, criado_por: e.target.value }),
        disabled: isReadOnly
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecione o vendedor..."),
      vendedores.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: v.nome, className: "bg-slate-900 text-slate-200" }, v.nome))
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-400 uppercase tracking-wider" }, "Produtos e Servi\xE7os inclusos"), !isReadOnly && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowProductModal(true),
        className: "text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
      },
      /* @__PURE__ */ React.createElement("span", null, "+ Adicionar Novo Item ao Cat\xE1logo")
    )), itens.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "border border-dashed border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4" }, /* @__PURE__ */ React.createElement("svg", { className: "w-12 h-12 text-slate-700", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-400 font-medium" }, "Esta proposta ainda n\xE3o tem nenhum item adicionado."), !isReadOnly && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-1" }, "Adicione produtos do cat\xE1logo abaixo.")), !isReadOnly && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleAddItem,
        className: "px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all"
      },
      "Adicionar Primeiro Item"
    )) : /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto", style: { overflow: "visible", minHeight: "280px" } }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-800/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "pb-3" }, "Produto [Fabricante]"), /* @__PURE__ */ React.createElement("th", { className: "pb-3 w-2/12" }, "Distribuidor"), /* @__PURE__ */ React.createElement("th", { className: "pb-3 w-[60px] text-center" }, "Qtd"), /* @__PURE__ */ React.createElement("th", { className: "pb-3 w-2/12 text-right" }, "Unit\xE1rio"), /* @__PURE__ */ React.createElement("th", { className: "pb-3 w-2/12 text-right" }, "Subtotal"), !isReadOnly && /* @__PURE__ */ React.createElement("th", { className: "pb-3 w-[60px] text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-900/60" }, itens.map((item, index) => {
      const subtotal = item.quantidade * item.preco_unitario || 0;
      return /* @__PURE__ */ React.createElement("tr", { key: item.id, className: "group hover:bg-slate-900/20 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "py-3.5 pr-4 relative", style: { overflow: "visible" } }, isReadOnly ? /* @__PURE__ */ React.createElement("div", { className: "text-sm font-semibold text-slate-200" }, produtos.find((p) => p.id === item.produto_id)?.nome || "Produto n\xE3o encontrado", /* @__PURE__ */ React.createElement("span", { className: "block text-[10px] text-slate-500 font-mono mt-0.5" }, "Fabricante: ", produtos.find((p) => p.id === item.produto_id)?.fabricante || "-")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "w-full rounded-xl bg-slate-900 border border-slate-800 p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500",
          placeholder: "Digite para buscar produto...",
          value: item.searchTerm !== void 0 ? item.searchTerm : produtos.find((p) => p.id === item.produto_id)?.nome || "",
          onChange: (e) => {
            const val = e.target.value;
            handleItemChange(index, { searchTerm: val, showDropdown: true });
          },
          onFocus: () => {
            const currentVal = item.searchTerm !== void 0 ? item.searchTerm : produtos.find((p) => p.id === item.produto_id)?.nome || "";
            handleItemChange(index, { searchTerm: currentVal, showDropdown: true });
          },
          onBlur: () => {
            setTimeout(() => {
              handleItemChange(index, { showDropdown: false });
            }, 200);
          }
        }
      ), item.showDropdown && (item.searchTerm !== void 0 ? item.searchTerm : produtos.find((p) => p.id === item.produto_id)?.nome || "") && (() => {
        const searchVal = item.searchTerm !== void 0 ? item.searchTerm : produtos.find((p) => p.id === item.produto_id)?.nome || "";
        const filtrados = produtos.filter(
          (p) => (p.nome || "").toLowerCase().includes(searchVal.toLowerCase()) || (p.fabricante || "").toLowerCase().includes(searchVal.toLowerCase())
        );
        return filtrados.length > 0 ? /* @__PURE__ */ React.createElement("ul", { className: "absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-800 rounded-xl max-h-48 overflow-y-auto shadow-2xl z-[9999] block divide-y divide-slate-800" }, filtrados.map((p) => /* @__PURE__ */ React.createElement(
          "li",
          {
            key: p.id,
            className: "p-2.5 text-sm text-slate-300 hover:bg-indigo-600 hover:text-white cursor-pointer transition-colors block text-left",
            onMouseDown: () => {
              handleItemChange(index, {
                produto_id: p.id,
                searchTerm: p.nome,
                unitario: p.custo_referencia || 0,
                showDropdown: false
              });
            }
          },
          /* @__PURE__ */ React.createElement("span", { className: "font-medium" }, p.nome),
          /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500 ml-2" }, "(", p.fabricante, ")")
        ))) : null;
      })())), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 pr-4" }, isReadOnly ? /* @__PURE__ */ React.createElement("span", { className: "text-sm text-slate-300" }, distribuidores.find((d) => d.id === item.distribuidor_id)?.nome || "-") : /* @__PURE__ */ React.createElement(
        "select",
        {
          className: "w-full rounded-xl bg-slate-900 border border-slate-800 p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500",
          value: item.distribuidor_id || "",
          onChange: (e) => handleItemChange(index, "distribuidor_id", e.target.value)
        },
        distribuidores.length === 0 ? /* @__PURE__ */ React.createElement("option", { value: "" }, "Nenhum distribuidor cadastrado") : distribuidores.map((d) => /* @__PURE__ */ React.createElement("option", { key: d.id, value: d.id }, d.nome))
      )), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 pr-4 text-center" }, isReadOnly ? /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-slate-300" }, item.quantidade) : /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "number",
          min: "1",
          className: "w-16 mx-auto rounded-xl bg-slate-900 border border-slate-800 p-2 text-sm text-center text-slate-200 focus:outline-none focus:border-indigo-500",
          value: item.quantidade,
          onChange: (e) => handleItemChange(index, "quantidade", e.target.value)
        }
      )), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 pr-4 text-right whitespace-nowrap" }, isReadOnly ? /* @__PURE__ */ React.createElement("span", { className: "text-sm text-slate-300" }, "R$ ", Number(item.preco_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("span", { className: "absolute left-2 top-2 text-xs text-slate-500" }, "R$"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "w-full rounded-xl bg-slate-900 border border-slate-800 p-2 pl-7 text-sm text-right text-slate-200 focus:outline-none focus:border-indigo-500 font-mono",
          value: formatMaskedCurrency(item.preco_unitario),
          onChange: (e) => handleCurrencyInputChange(index, e.target.value)
        }
      ))), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 text-right font-bold text-slate-200 text-sm whitespace-nowrap" }, "R$ ", subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), !isReadOnly && /* @__PURE__ */ React.createElement("td", { className: "py-3.5 text-center" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleRemoveItem(index),
          className: "p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
        },
        /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }))
      )));
    })))), !isReadOnly && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleAddItem,
        className: "w-full mt-4 py-3 border border-dashed border-slate-800 hover:border-indigo-500/40 rounded-2xl text-xs font-semibold text-slate-500 hover:text-indigo-400 bg-slate-900/10 hover:bg-slate-900/30 transition-all flex items-center justify-center space-x-2"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M12 4v16m8-8H4" })),
      /* @__PURE__ */ React.createElement("span", null, "Adicionar Item")
    )), /* @__PURE__ */ React.createElement("div", { className: "border-t border-slate-800 bg-slate-900/30 p-6 flex flex-col md:flex-row justify-between items-center" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "Resumo Comercial"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "C\xE1lculo ativo com base em ", itens.length, " ", itens.length === 1 ? "item" : "itens", ".")), /* @__PURE__ */ React.createElement("div", { className: "text-right" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "Total da Proposta"), /* @__PURE__ */ React.createElement("span", { className: "text-3xl font-extrabold text-indigo-400" }, "R$ ", realTimeGrandTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))))));
  };
  if (!session) {
    return /* @__PURE__ */ React.createElement(
      LoginScreen,
      {
        onLogin: handleLogin,
        error: errorMsg
      }
    );
  }
  return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("header", { className: "h-16 border-b border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between z-10" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-indigo-600 p-2 rounded-lg" }, /* @__PURE__ */ React.createElement("svg", { className: "w-6 h-6 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("h1", { className: "text-lg font-bold text-white tracking-wide" }, "Suprim\xE1tica CRM"), activeTab === "propostas" && projectContext.name && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-indigo-300 font-bold bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-500/20", title: projectContext.name }, projectContext.name)), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "Gerador de Propostas"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-4" }, activeTab === "propostas" && /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-end space-y-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1 space-x-2 h-9" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400 font-semibold uppercase" }, "Proposta:"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "bg-transparent border-0 p-0 text-sm text-slate-200 font-bold focus:ring-0 focus:outline-none w-48",
      value: searchTerm,
      onChange: (e) => setSearchTerm(e.target.value),
      placeholder: "Buscar Proposta (Ex: 12662/2026)",
      onKeyDown: (e) => {
        if (e.key === "Enter") handleSearchClickUpProposal();
      }
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleSearchClickUpProposal,
      disabled: searching,
      className: "px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all h-9 flex items-center justify-center min-w-[70px]"
    },
    searching ? "..." : "Buscar"
  )), searching && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-indigo-400 font-medium animate-pulse" }, "\u{1F50D} Buscando Proposta..."), searchResult && !searching && /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold ${searchResult.includes("\u{1F7E2}") ? "text-emerald-400" : "text-red-400"}` }, searchResult)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: `w-2 h-2 rounded-full ${dbConnected ? "bg-emerald-500" : "bg-red-500"}` }), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400 hidden sm:inline" }, dbConnected ? "Supabase Ativo" : "Supabase Offline")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowSettingsModal(true),
      className: "p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors",
      title: "Configura\xE7\xF5es de Conex\xE3o"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }), /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0" }))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: async () => {
        if (supabaseClient) {
          await supabaseClient.auth.signOut();
          setSession(null);
          showToast("Sess\xE3o encerrada com sucesso.", "success");
        }
      },
      className: "p-2 text-red-400 hover:text-red-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors",
      title: "Sair / Logout"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" }))
  ))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end bg-slate-950 px-6 pt-3 pb-1 space-x-2 z-10" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setActiveTab("relatorios"),
      className: `px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "relatorios" ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40" : "text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80"}`
    },
    "Relat\xF3rios"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setActiveTab("kanban"),
      className: `px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "kanban" ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40" : "text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80"}`
    },
    "Pipeline de Vendas (Kanban)"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setActiveTab("tasks"),
      className: `px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "tasks" ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40" : "text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80"}`
    },
    "Tarefas Comerciais"
  )), errorMsg && /* @__PURE__ */ React.createElement("div", { className: "fixed top-20 right-6 z-50 bg-red-950/90 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md animate-bounce" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5 text-red-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" })), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium" }, errorMsg)), successMsg && /* @__PURE__ */ React.createElement("div", { className: "fixed top-20 right-6 z-50 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5 text-emerald-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium" }, successMsg)), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex overflow-hidden" }, activeTab === "relatorios" && /* @__PURE__ */ React.createElement("main", { className: "flex-1 flex flex-col bg-slate-950 p-6 overflow-y-auto" }, /* @__PURE__ */ React.createElement("div", { className: "mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-extrabold text-white tracking-tight" }, "Relat\xF3rios"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, "Distribui\xE7\xE3o de faturamento acumulado por distribuidor e fabricante.")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-3 bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-2.5 shadow-lg" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider" }, "In\xEDcio"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: startDate,
      onChange: (e) => setStartDate(e.target.value),
      className: "bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider" }, "Fim"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: endDate,
      onChange: (e) => setEndDate(e.target.value),
      className: "bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider" }, "In\xEDcio Comp."), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: compareStartDate,
      onChange: (e) => setCompareStartDate(e.target.value),
      className: "bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider" }, "Fim Comp."), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: compareEndDate,
      onChange: (e) => setCompareEndDate(e.target.value),
      className: "bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => loadDashboardData(),
      disabled: loadingDashboard,
      className: "px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-950/30 active:scale-95"
    },
    loadingDashboard ? "..." : "Filtrar"
  ))), /* @__PURE__ */ React.createElement("div", { className: "mb-4 p-2 px-3 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center space-x-2 text-[11px] text-slate-400" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-slate-400 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("span", { className: "leading-none" }, /* @__PURE__ */ React.createElement("strong", { className: "text-slate-300 font-bold" }, "Nota de Integridade:"), " Os totais deste painel refletem os itens detalhados no ", /* @__PURE__ */ React.createElement("strong", { className: "text-indigo-400" }, "Supabase"), ". O tabuleiro Kanban reflete o faturamento total das oportunidades no ", /* @__PURE__ */ React.createElement("strong", { className: "text-indigo-400" }, "ClickUp"), ".")), !loadingDashboard && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700/60 hover:shadow-lg hover:shadow-indigo-950/10" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 z-10" }, "Neg\xF3cios Convertidos (Ganhos)"), /* @__PURE__ */ React.createElement("svg", { className: "w-9 h-9 text-emerald-400/25 absolute top-3 right-3 pointer-events-none z-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline space-x-2 z-10" }, /* @__PURE__ */ React.createElement("span", { className: "text-2xl font-black text-white" }, biMetrics.wonCount), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, "propostas")), /* @__PURE__ */ React.createElement("div", { className: "text-xl font-bold text-emerald-400 mt-1 z-10" }, "R$ ", biMetrics.wonValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), compareStartDate && compareEndDate && /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center space-x-1.5 text-xs z-10" }, /* @__PURE__ */ React.createElement("span", { className: `font-bold flex items-center ${biMetrics.wonValDiff >= 0 ? "text-emerald-400" : "text-red-400"}` }, biMetrics.wonValDiff >= 0 ? "\u25B2" : "\u25BC", " ", Math.abs(biMetrics.wonValDiff).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { className: "text-slate-500" }, "vs per\xEDodo anterior"))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700/60 hover:shadow-lg hover:shadow-indigo-950/10" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 z-10" }, "Neg\xF3cios Perdidos"), /* @__PURE__ */ React.createElement("svg", { className: "w-9 h-9 text-rose-400/25 absolute top-3 right-3 pointer-events-none z-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" })), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline space-x-2 z-10" }, /* @__PURE__ */ React.createElement("span", { className: "text-2xl font-black text-white" }, biMetrics.lostCount), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-400" }, "propostas")), /* @__PURE__ */ React.createElement("div", { className: "text-xl font-bold text-red-400 mt-1 z-10" }, "R$ ", biMetrics.lostValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), compareStartDate && compareEndDate && /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center space-x-1.5 text-xs z-10" }, /* @__PURE__ */ React.createElement("span", { className: `font-bold flex items-center ${biMetrics.lostValDiff <= 0 ? "text-emerald-400" : "text-red-400"}` }, biMetrics.lostValDiff <= 0 ? "\u25BC" : "\u25B2", " ", Math.abs(biMetrics.lostValDiff).toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { className: "text-slate-500" }, "vs per\xEDodo anterior"))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-slate-700/60 hover:shadow-lg hover:shadow-indigo-950/10" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 z-10" }, "Taxa de Convers\xE3o Geral"), /* @__PURE__ */ React.createElement("svg", { className: "w-9 h-9 text-indigo-400/25 absolute top-3 right-3 pointer-events-none z-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" })), /* @__PURE__ */ React.createElement("div", { className: "text-3xl font-black text-indigo-400 mt-1 z-10" }, biMetrics.convRate.toFixed(1), "%"), /* @__PURE__ */ React.createElement("div", { className: "text-xs text-slate-400 mt-1 z-10" }, "sobre total fechado (", biMetrics.wonCount + biMetrics.lostCount, ")"), compareStartDate && compareEndDate && /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center space-x-1.5 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: `font-bold flex items-center ${biMetrics.convRateDiff >= 0 ? "text-emerald-400" : "text-red-400"}` }, biMetrics.convRateDiff >= 0 ? "\u25B2 +" : "\u25BC ", " ", biMetrics.convRateDiff.toFixed(1), " pp"), /* @__PURE__ */ React.createElement("span", { className: "text-slate-500" }, "vs per\xEDodo anterior")))), loadingDashboard ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-3 py-20" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-400 font-medium" }, "Carregando dados consolidados...")) : !commercialData || commercialData.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 border border-dashed border-slate-800 rounded-2xl p-16 text-center flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto my-10 bg-slate-900/10" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-3xl" }, "\u{1F4CA}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-bold text-white" }, "Nenhum dado encontrado"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-2" }, "N\xE3o existem itens de propostas criadas no per\xEDodo de ", (/* @__PURE__ */ new Date(startDate + "T00:00:00")).toLocaleDateString("pt-BR"), " a ", (/* @__PURE__ */ new Date(endDate + "T00:00:00")).toLocaleDateString("pt-BR"), "."))) : /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:border-slate-800" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-6 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-300 uppercase tracking-wider mb-1" }, "Distribui\xE7\xE3o por Distribuidor"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Faturamento total acumulado agrupado por Distribuidor")), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedDistributorFilter,
      onChange: (e) => setSelectedDistributorFilter(e.target.value),
      className: "appearance-none bg-slate-900 border border-slate-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
    },
    /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todos"),
    Array.from(new Set(
      commercialData.map((item) => item.distribuidores?.nome).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b)).map((dist) => /* @__PURE__ */ React.createElement("option", { key: dist, value: dist }, dist))
  ), /* @__PURE__ */ React.createElement("div", { className: "absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }))))), /* @__PURE__ */ React.createElement("div", { className: "relative h-64 w-full flex items-center justify-center" }, /* @__PURE__ */ React.createElement("canvas", { ref: distributorCanvasRef }), /* @__PURE__ */ React.createElement("div", { className: "absolute flex flex-col items-center justify-center text-center pointer-events-none" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, "Total"), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-white" }, formatValueCompact(distributorTotalSum)))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-x-4 gap-y-1.5 mt-6 pt-4 border-t border-slate-800/60 max-h-40 overflow-y-auto pr-1" }, Object.keys(distributorTotals).map((label, idx) => {
    const val = distributorTotals[label];
    const percent = distributorTotalSum > 0 ? Math.round(val / distributorTotalSum * 100) : 0;
    const color = chartColors[idx % chartColors.length];
    return /* @__PURE__ */ React.createElement("div", { key: label, className: "flex items-center justify-between text-xs py-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 truncate mr-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-2.5 h-2.5 rounded-full shrink-0", style: { backgroundColor: color } }), /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 truncate" }, label)), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-300" }, percent, "%"));
  }))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:border-slate-800" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-6 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-300 uppercase tracking-wider mb-1" }, "Distribui\xE7\xE3o por Fabricante"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Faturamento total acumulado agrupado por Fabricante")), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedManufacturerFilter,
      onChange: (e) => setSelectedManufacturerFilter(e.target.value),
      className: "appearance-none bg-slate-900 border border-slate-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
    },
    /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todos"),
    Array.from(new Set(
      commercialData.map((item) => item.produtos?.fabricante).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b)).map((fab) => /* @__PURE__ */ React.createElement("option", { key: fab, value: fab }, fab))
  ), /* @__PURE__ */ React.createElement("div", { className: "absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }))))), /* @__PURE__ */ React.createElement("div", { className: "relative h-64 w-full flex items-center justify-center" }, /* @__PURE__ */ React.createElement("canvas", { ref: manufacturerCanvasRef }), /* @__PURE__ */ React.createElement("div", { className: "absolute flex flex-col items-center justify-center text-center pointer-events-none" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, "Total"), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-white" }, formatValueCompact(manufacturerTotalSum)))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-x-4 gap-y-1.5 mt-6 pt-4 border-t border-slate-800/60 max-h-40 overflow-y-auto pr-1" }, Object.keys(manufacturerTotals).map((label, idx) => {
    const val = manufacturerTotals[label];
    const percent = manufacturerTotalSum > 0 ? Math.round(val / manufacturerTotalSum * 100) : 0;
    const color = chartColors[idx % chartColors.length];
    return /* @__PURE__ */ React.createElement("div", { key: label, className: "flex items-center justify-between text-xs py-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 truncate mr-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-2.5 h-2.5 rounded-full shrink-0", style: { backgroundColor: color } }), /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 truncate" }, label)), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-300" }, percent, "%"));
  }))))), activeTab === "kanban" && /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden" }, loadingKanban ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-slate-400 font-medium" }, "Carregando oportunidades do ClickUp...")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center justify-between px-6 py-3 bg-slate-900/40 border-b border-slate-800/80 flex-shrink-0 space-y-3 md:space-y-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3 flex-wrap gap-y-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-400" }, "Exibir Est\xE1gios:"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowGanhoCol(!showGanhoCol),
      className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${showGanhoCol ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F3C6} Ganho")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowPerdidoCol(!showPerdidoCol),
      className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${showPerdidoCol ? "bg-rose-500/20 border-rose-500/50 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F61E} Perdido")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowCongeladoCol(!showCongeladoCol),
      className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${showCongeladoCol ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u2744\uFE0F Congelado")
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-400" }, "Ordenar por:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: sortBy,
      onChange: (e) => {
        const newValue = e.target.value;
        localStorage.setItem("crm_sort_order", newValue);
        setSortBy(newValue);
      },
      className: "rounded-xl bg-slate-900 border border-slate-800 p-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("option", { value: "default" }, "Padr\xE3o"),
    /* @__PURE__ */ React.createElement("option", { value: "name" }, "Nome (A - Z)"),
    /* @__PURE__ */ React.createElement("option", { value: "value_asc" }, "Valor (Menor para Maior)"),
    /* @__PURE__ */ React.createElement("option", { value: "value_desc" }, "Valor (Maior para Menor)")
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        const nextVal = !showForecast;
        console.log("[DEBUG] Forecast clicked, state is now:", nextVal);
        setShowForecast(nextVal);
        if (!nextVal) {
          setFilterStage(null);
        }
      },
      className: `mr-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showForecast ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`
    },
    "\u{1F4C8} Forecast"
  ))), showForecast && /* @__PURE__ */ React.createElement(
    ForecastFunnelPanel,
    {
      kanbanColumns,
      kanbanTasks,
      showGanhoCol,
      showPerdidoCol,
      showCongeladoCol,
      filterStage,
      setFilterStage,
      getTaskOptionId,
      getOpportunityValue
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "kanban-board" }, kanbanColumns.map((col) => {
    if (filterStage && col.id !== filterStage) return null;
    const colName = col.name.toLowerCase();
    if (colName.includes("ganho") && !showGanhoCol) return null;
    if (colName.includes("perdido") && !showPerdidoCol) return null;
    if (colName.includes("congelado") && !showCongeladoCol) return null;
    const tasksInCol = kanbanTasks.filter((t) => getTaskOptionId(t, kanbanColumns) === col.id);
    const sortedTasks = [...tasksInCol].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "value_asc" || sortBy === "value_desc") {
        const valA = getOpportunityValue(a) || 0;
        const valB = getOpportunityValue(b) || 0;
        if (valA === 0 && valB !== 0) return 1;
        if (valB === 0 && valA !== 0) return -1;
        if (valA === 0 && valB === 0) return 0;
        return sortBy === "value_asc" ? valA - valB : valB - valA;
      }
      return 0;
    });
    return /* @__PURE__ */ React.createElement("div", { key: col.id, className: "kanban-column" }, /* @__PURE__ */ React.createElement("div", { className: "kanban-column-header" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-3 h-3 rounded-full", style: { backgroundColor: col.color || "#fff" } }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-white uppercase tracking-wider" }, col.name)), /* @__PURE__ */ React.createElement("span", { className: "bg-slate-800 px-2 py-0.5 rounded-full text-xs font-bold text-slate-400" }, tasksInCol.length)), /* @__PURE__ */ React.createElement(
      "div",
      {
        "data-option-id": col.id,
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => handleDrop(e, col.id),
        className: "kanban-cards"
      },
      sortedTasks.map((task) => {
        const dealValue = getOpportunityValue(task);
        const formattedValue = dealValue !== null && dealValue !== void 0 ? `R$ ${Number(dealValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Sem Valor";
        const responsavel = task.responsavel_negocio;
        const hasOverdue = commercialTasks.some((t) => {
          const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
          const isThisDeal = t.clickup_negocio_id === task.id || propObj && propObj.clickup_negocio_id === task.id;
          return isThisDeal && t.status === "pendente" && new Date(t.data_vencimento) < /* @__PURE__ */ new Date();
        });
        return /* @__PURE__ */ React.createElement(
          KanbanCard,
          {
            key: task.id,
            task,
            dealValue,
            formattedValue,
            responsavel,
            handleDragStart,
            handleCardClick,
            hasOverdue
          }
        );
      })
    ));
  })))), activeTab === "tasks" && /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden bg-slate-950 p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "text-2xl font-extrabold text-white tracking-tight" }, "Tarefas Comerciais"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Gerenciamento e controle de atividades integradas ao ClickUp")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-400" }, "Respons\xE1vel:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: tasksFilterAssignee,
      onChange: (e) => setTasksFilterAssignee(e.target.value),
      className: "rounded-xl bg-slate-900 border border-slate-800 p-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todos"),
    vendedores.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: String(v.id) }, v.nome))
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setTasksShowCompleted(!tasksShowCompleted),
      className: `px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${tasksShowCompleted ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"}`
    },
    tasksShowCompleted ? "\u2713 Mostrando Conclu\xEDdas" : "Mostrar Conclu\xEDdas"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
        setShowNewTaskModal(true);
      },
      className: "px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1"
    },
    /* @__PURE__ */ React.createElement("span", null, "\u2795 Nova Tarefa")
  ))), loadingTasks ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-400 font-medium" }, "Carregando tarefas comerciais...")) : (() => {
    const filtered = commercialTasks.filter((task) => {
      if (tasksFilterAssignee !== "all" && String(task.responsavel_clickup_id) !== tasksFilterAssignee) {
        return false;
      }
      if (!tasksShowCompleted && task.status === "concluida") {
        return false;
      }
      return true;
    });
    if (filtered.length === 0) {
      return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800 text-3xl" }, "\u{1F4CB}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-white mb-1" }, "Nenhuma tarefa encontrada"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "N\xE3o h\xE1 tarefas comerciais registradas para os filtros selecionados.")));
    }
    return /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500" }, /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-12" }, "Status"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4" }, "T\xEDtulo"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4" }, "Neg\xF3cio/Proposta"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4" }, "Tipo"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4" }, "Vencimento"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4" }, "Respons\xE1vel"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-16 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-800/50 text-xs" }, filtered.map((task) => {
      const isDone = task.status === "concluida";
      const typeColors = {
        "Liga\xE7\xE3o": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
        "Reuni\xE3o": "bg-purple-500/10 text-purple-400 border border-purple-500/20",
        "E-mail": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        "Follow-up": "bg-rose-500/10 text-rose-400 border border-rose-500/20"
      };
      const matchedUser = vendedores.find((v) => String(v.id) === String(task.responsavel_clickup_id));
      const assigneeName = matchedUser ? matchedUser.nome : task.responsavel_clickup_id || "N\xE3o assinalado";
      const proposalText = (() => {
        const localProps = (typeof propostas !== "undefined" && Array.isArray(propostas) ? propostas : []) || (typeof proposals !== "undefined" && Array.isArray(proposals) ? proposals : []);
        const matchedProp = localProps.find(
          (p) => task.proposta_id && p.id === task.proposta_id || task.clickup_negocio_id && p.clickup_negocio_id === task.clickup_negocio_id
        );
        const propObj = Array.isArray(task.propostas) ? task.propostas[0] : task.propostas;
        const resolvedName = matchedProp?.nome_projeto || matchedProp?.projeto || task.nome_projeto || propObj?.nome_projeto || propObj?.cenario || task.proposta?.nome_projeto;
        const resolvedVersion = matchedProp?.versao || propObj?.versao || task.proposta?.versao || "";
        const versionPrefix = resolvedVersion ? `v${resolvedVersion} - ` : "";
        const resolvedClickUpId = matchedProp?.clickup_negocio_id || task.clickup_negocio_id || propObj?.clickup_negocio_id;
        const clickUpSuffix = resolvedClickUpId ? ` (#${resolvedClickUpId})` : "";
        if (!resolvedName || resolvedName === "Sem Proposta") {
          return "Sem Proposta";
        }
        return `${versionPrefix}${resolvedName}${clickUpSuffix}`;
      })();
      return /* @__PURE__ */ React.createElement("tr", { key: task.id, className: "hover:bg-slate-900/20 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          checked: isDone,
          onChange: () => toggleTaskStatus(task),
          className: "w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        }
      )), /* @__PURE__ */ React.createElement("td", { className: `py-3.5 px-4 font-semibold ${isDone ? "line-through text-slate-500" : "text-white"}` }, task.titulo), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-slate-400" }, (() => {
        const localProps = (typeof propostas !== "undefined" && Array.isArray(propostas) ? propostas : []) || (typeof proposals !== "undefined" && Array.isArray(proposals) ? proposals : []);
        let matchedProp = localProps.find(
          (p) => task.proposta_id && p.id === task.proposta_id || task.clickup_negocio_id && p.clickup_negocio_id === task.clickup_negocio_id
        );
        if (matchedProp) {
          return matchedProp.nome_projeto || matchedProp.projeto || "Projeto";
        }
        const activeKanbanCards = (typeof kanbanTasks !== "undefined" ? kanbanTasks : null) || [];
        const matchedKanbanCard = Array.isArray(activeKanbanCards) && activeKanbanCards.find(
          (c) => c.id === task.clickup_negocio_id || c.clickup_id === task.clickup_negocio_id
        );
        if (matchedKanbanCard) {
          return matchedKanbanCard.name || matchedKanbanCard.nome || matchedKanbanCard.nome_projeto || "Projeto Sem Nome";
        }
        if (task.nome_projeto && task.nome_projeto !== "Sem Proposta") return task.nome_projeto;
        if (task.proposta?.nome_projeto) return task.proposta.nome_projeto;
        return "Sem Proposta";
      })()), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4" }, /* @__PURE__ */ React.createElement("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-bold ${typeColors[task.tipo] || "bg-slate-800"}` }, task.tipo)), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 font-mono text-slate-300" }, new Date(task.data_vencimento).toLocaleString("pt-BR")), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-slate-400 font-medium" }, "\u{1F464} ", assigneeName), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-center flex items-center justify-center space-x-2" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleEditTaskClick(task),
          className: "p-1 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer",
          title: "Editar Tarefa"
        },
        /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" }))
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleDeleteTask(task.id),
          className: "p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer",
          title: "Excluir Tarefa"
        },
        /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4 text-slate-400 hover:text-red-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }))
      )));
    }))));
  })())), showSettingsModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowSettingsModal(false),
      className: "absolute top-4 right-4 text-slate-400 hover:text-white z-10"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  ), /* @__PURE__ */ React.createElement("div", { className: "border-b border-slate-800 p-6 bg-slate-900/60" }, /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-white flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5 text-indigo-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" })), /* @__PURE__ */ React.createElement("span", null, "Painel de Configura\xE7\xF5es e Cadastros"))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex overflow-hidden" }, /* @__PURE__ */ React.createElement("aside", { className: "w-1/4 border-r border-slate-800 bg-slate-950/20 p-4 space-y-2 flex flex-col" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("products"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${settingsActiveTab === "products" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"}`
    },
    "Cat\xE1logo de Produtos"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("distributors"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${settingsActiveTab === "distributors" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"}`
    },
    "Distribuidores"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("venders"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${settingsActiveTab === "venders" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"}`
    },
    "Vendedores"
  )), /* @__PURE__ */ React.createElement("main", { className: "flex-1 p-6 overflow-y-auto bg-slate-950/50" }, settingsActiveTab === "products" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-white" }, "Cat\xE1logo de Produtos"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 font-medium" }, "Gerencie o portf\xF3lio de ofertas e importe tabelas em lote.")), /* @__PURE__ */ React.createElement("span", { className: "bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-semibold" }, produtos.length, " SKUs")), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/60 border border-slate-800/60 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3" }, editingProduct ? "Editar Produto" : "Cadastrar Novo Produto"), /* @__PURE__ */ React.createElement(
    "form",
    {
      onSubmit: editingProduct ? handleSaveProductEdit : (e) => {
        e.preventDefault();
        supabaseClient.from("produtos").insert({
          nome: newProduct.nome,
          fabricante: newProduct.fabricante,
          custo_referencia: parseFloat(newProduct.custo_referencia) || 0
        }).then(({ error }) => {
          if (error) {
            showToast("Erro ao cadastrar produto. Fabricante e Nome duplicados?", "error");
          } else {
            showToast("Produto cadastrado com sucesso!", "success");
            setNewProduct({ nome: "", fabricante: "", custo_referencia: "" });
            loadProducts();
          }
        });
      },
      className: "grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
    },
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] text-slate-400 font-semibold mb-1" }, "Fabricante"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        required: true,
        placeholder: "Ex: Dell Technologies",
        value: editingProduct ? editingProduct.fabricante : newProduct.fabricante,
        onChange: (e) => {
          if (editingProduct) {
            setEditingProduct({ ...editingProduct, fabricante: e.target.value });
          } else {
            setNewProduct({ ...newProduct, fabricante: e.target.value });
          }
        },
        className: "w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      }
    )),
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] text-slate-400 font-semibold mb-1" }, "Nome do Produto"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        required: true,
        placeholder: "Ex: Licen\xE7a VMware vSphere",
        value: editingProduct ? editingProduct.nome : newProduct.nome,
        onChange: (e) => {
          if (editingProduct) {
            setEditingProduct({ ...editingProduct, nome: e.target.value });
          } else {
            setNewProduct({ ...newProduct, nome: e.target.value });
          }
        },
        className: "w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      }
    )),
    /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] text-slate-400 font-semibold mb-1" }, "Custo de Refer\xEAncia"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "0.01",
        required: true,
        placeholder: "0.00",
        value: editingProduct ? editingProduct.custo_referencia : newProduct.custo_referencia,
        onChange: (e) => {
          if (editingProduct) {
            setEditingProduct({ ...editingProduct, custo_referencia: e.target.value });
          } else {
            setNewProduct({ ...newProduct, custo_referencia: e.target.value });
          }
        },
        className: "w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 text-right"
      }
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md self-end h-[34px]"
      },
      editingProduct ? "Salvar" : "Cadastrar"
    ), editingProduct && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setEditingProduct(null),
        className: "px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all self-end h-[34px]"
      },
      "Cancelar"
    ))
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-slate-950/40 border border-slate-800/40 rounded-xl" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Fabricante"), /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome do Produto"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-right" }, "Pre\xE7o de Refer\xEAncia"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-800/40" }, produtos.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "4", className: "p-6 text-center text-slate-500" }, "Nenhum produto cadastrado.")) : produtos.map((p) => /* @__PURE__ */ React.createElement("tr", { key: p.id, className: "hover:bg-slate-900/10" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-300" }, p.fabricante), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-slate-200" }, p.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-mono text-slate-200" }, "R$ ", Number(p.custo_referencia).toLocaleString("pt-BR", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center space-x-1.5" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setEditingProduct(p),
      className: "text-indigo-400 hover:text-indigo-300"
    },
    "Editar"
  ), /* @__PURE__ */ React.createElement("span", null, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeleteProduct(p.id),
      className: "text-red-400 hover:text-red-300"
    },
    "Excluir"
  ))))))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/40 border border-slate-800/60 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-3" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-400 uppercase tracking-wider" }, "Importa\xE7\xE3o de Produtos em Lote"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] text-slate-400 font-semibold" }, "Formato:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: importFormat,
      onChange: (e) => setImportFormat(e.target.value),
      className: "bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded p-1 focus:outline-none"
    },
    /* @__PURE__ */ React.createElement("option", { value: "csv" }, "CSV (Fabricante;Nome;Pre\xE7o)"),
    /* @__PURE__ */ React.createElement("option", { value: "xml" }, "XML (<produto>)")
  ))), /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: importText,
      onChange: (e) => setImportText(e.target.value),
      rows: "3",
      className: "w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono",
      placeholder: importFormat === "csv" ? "Dell Technologies;Servidor PowerEdge R760;25000.00\nVMware;Licen\xE7a vSphere Standard;1200.50" : "<produtos>\n  <produto>\n    <fabricante>Dell</fabricante>\n    <nome>Servidor R760</nome>\n    <custo>25000.00</custo>\n  </produto>\n</produtos>"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-500" }, "Cole as linhas ou a estrutura XML no campo de texto e clique em Processar Lote."), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleBatchImport,
      disabled: saving,
      className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-1.5"
    },
    /* @__PURE__ */ React.createElement("span", null, "Processar Lote")
  ))))), settingsActiveTab === "distributors" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-white" }, "Distribuidores Autorizados"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 font-medium" }, "Lista fechada de distribuidores no CRM.")), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/60 border border-slate-800/60 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3" }, editingDistributor ? "Editar Distribuidor" : "Novo Distribuidor"), /* @__PURE__ */ React.createElement(
    "form",
    {
      onSubmit: editingDistributor ? handleSaveDistributorEdit : handleCreateDistributor,
      className: "flex gap-2"
    },
    /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        required: true,
        placeholder: "Ex: Ingram Micro",
        value: editingDistributor ? editingDistributor.nome : newDistributorName,
        onChange: (e) => {
          if (editingDistributor) {
            setEditingDistributor({ ...editingDistributor, nome: e.target.value });
          } else {
            setNewDistributorName(e.target.value);
          }
        },
        className: "flex-1 rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      }
    ),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
      },
      editingDistributor ? "Salvar" : "Adicionar"
    ),
    editingDistributor && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setEditingDistributor(null),
        className: "px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
      },
      "Cancelar"
    )
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-slate-950/40 border border-slate-800/40 rounded-xl" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-800/40" }, distribuidores.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "2", className: "p-6 text-center text-slate-500" }, "Nenhum distribuidor cadastrado.")) : distribuidores.map((d) => /* @__PURE__ */ React.createElement("tr", { key: d.id, className: "hover:bg-slate-900/10" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-300" }, d.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center space-x-1.5" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setEditingDistributor(d),
      className: "text-indigo-400 hover:text-indigo-300"
    },
    "Editar"
  ), /* @__PURE__ */ React.createElement("span", null, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeleteDistributor(d.id),
      className: "text-red-400 hover:text-red-300"
    },
    "Excluir"
  )))))))), settingsActiveTab === "venders" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-white" }, "Vendedores Cadastrados"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 font-medium" }, "Gerencie a equipe de vendas.")), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/60 border border-slate-800/60 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3" }, editingVendedor ? "Editar Vendedor" : "Novo Vendedor"), /* @__PURE__ */ React.createElement(
    "form",
    {
      onSubmit: editingVendedor ? handleSaveVendedorEdit : handleCreateVendedor,
      className: "flex gap-2"
    },
    /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        required: true,
        placeholder: "Ex: Ana Silva",
        value: editingVendedor ? editingVendedor.nome : newVendedorName,
        onChange: (e) => {
          if (editingVendedor) {
            setEditingVendedor({ ...editingVendedor, nome: e.target.value });
          } else {
            setNewVendedorName(e.target.value);
          }
        },
        className: "flex-1 rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      }
    ),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
      },
      editingVendedor ? "Salvar" : "Adicionar"
    ),
    editingVendedor && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setEditingVendedor(null),
        className: "px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
      },
      "Cancelar"
    )
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-slate-950/40 border border-slate-800/40 rounded-xl" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-800/40" }, vendedores.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "2", className: "p-6 text-center text-slate-500" }, "Nenhum vendedor cadastrado.")) : vendedores.map((v) => /* @__PURE__ */ React.createElement("tr", { key: v.id, className: "hover:bg-slate-900/10" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-300" }, v.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center space-x-1.5" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setEditingVendedor(v),
      className: "text-indigo-400 hover:text-indigo-300"
    },
    "Editar"
  ), /* @__PURE__ */ React.createElement("span", null, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeleteVendedor(v.id),
      className: "text-red-400 hover:text-red-300"
    },
    "Excluir"
  )))))))))))), showProductModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowProductModal(false),
      className: "absolute top-4 right-4 text-slate-400 hover:text-white"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  ), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-white mb-2" }, "Adicionar Novo Produto"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mb-6" }, "Adicione um novo produto ou licen\xE7a ao cat\xE1logo do sistema."), /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateProduct, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Nome do Produto"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: newProduct.nome,
      onChange: (e) => setNewProduct({ ...newProduct, nome: e.target.value }),
      placeholder: "Ex: Servidor Dell PowerEdge R760",
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Fabricante"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: newProduct.fabricante,
      onChange: (e) => setNewProduct({ ...newProduct, fabricante: e.target.value }),
      placeholder: "Ex: Dell Technologies",
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Custo de Refer\xEAncia"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("span", { className: "absolute left-2.5 top-2 text-xs text-slate-500" }, "R$"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "0.01",
      required: true,
      value: newProduct.custo_referencia,
      onChange: (e) => setNewProduct({ ...newProduct, custo_referencia: e.target.value }),
      placeholder: "0.00",
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2 pl-8 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    }
  )))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      className: "w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-950/30 transition-all"
    },
    "Cadastrar Produto"
  )))), showCloseModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowCloseModal(false),
      className: "absolute top-4 right-4 text-slate-400 hover:text-white"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  ), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-white mb-2" }, showCloseModal === "win" ? "\u{1F3C6} Fechamento - Proposta Ganha" : "\u{1F61E} Fechamento - Proposta Perdida"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mb-6" }, showCloseModal === "win" ? "Insira os dados do fechamento do neg\xF3cio ganho." : "Insira o principal motivo e a data do fechamento do neg\xF3cio perdido."), /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, showCloseModal === "loss" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Motivo da Perda"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedLossReason,
      onChange: (e) => setSelectedLossReason(e.target.value),
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecione o motivo..."),
    /* @__PURE__ */ React.createElement("option", { value: "Pre\xE7o Alto" }, "Pre\xE7o Alto"),
    /* @__PURE__ */ React.createElement("option", { value: "Prazo de Entrega" }, "Prazo de Entrega"),
    /* @__PURE__ */ React.createElement("option", { value: "Perdido para Concorr\xEAncia" }, "Perdido para Concorr\xEAncia"),
    /* @__PURE__ */ React.createElement("option", { value: "Projeto Cancelado pelo Cliente" }, "Projeto Cancelado pelo Cliente"),
    /* @__PURE__ */ React.createElement("option", { value: "Falta de Verba/Budget" }, "Falta de Verba/Budget"),
    /* @__PURE__ */ React.createElement("option", { value: "Outros" }, "Outros")
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Data do Fechamento"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: closeDate,
      onChange: (e) => setCloseDate(e.target.value),
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleConfirmClose,
      disabled: saving,
      className: `w-full py-3 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center justify-center space-x-1.5 ${showCloseModal === "win" ? "bg-amber-500 hover:bg-amber-400 shadow-amber-950/30 text-amber-950" : "bg-red-600 hover:bg-red-500 shadow-red-950/30 text-white"}`
    },
    saving ? "Gravando..." : "Confirmar Fechamento"
  )))), showNewTaskModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative" }, /* @__PURE__ */ React.createElement("div", { className: "border-b border-slate-800 p-5 bg-slate-900/60 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", null, "\u{1F4CB} ", editingTask ? "Editar Tarefa Comercial" : "Nova Tarefa Comercial")), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setShowNewTaskModal(false);
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
      },
      className: "p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  )), /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateTaskSubmit, className: "p-6 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Neg\xF3cio"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("div", { className: `flex items-center w-full rounded-xl border transition-all ${selectedProposalForTask ? "bg-indigo-950/25 border-indigo-500/40" : "bg-slate-950 border-slate-800 focus-within:border-indigo-500"}` }, /* @__PURE__ */ React.createElement("span", { className: "pl-3 text-slate-500 flex-shrink-0" }, /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" }))), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: searchProposalQuery,
      onChange: (e) => {
        const q = e.target.value;
        setSearchProposalQuery(q);
        setSelectedProposalForTask(null);
        if (q.trim().length >= 1) {
          const q_lower = q.toLowerCase();
          const filtered = (kanbanTasks || []).filter(
            (t) => (t.name || "").toLowerCase().includes(q_lower) || (t.id || "").toLowerCase().includes(q_lower)
          );
          setProposalSearchResults(filtered);
          setShowProposalDropdown(filtered.length > 0);
        } else {
          setProposalSearchResults([]);
          setShowProposalDropdown(false);
        }
      },
      onFocus: () => {
        if (searchProposalQuery.trim().length >= 1 && proposalSearchResults.length > 0) {
          setShowProposalDropdown(true);
        } else if (searchProposalQuery.trim().length === 0) {
          setProposalSearchResults(kanbanTasks || []);
          if ((kanbanTasks || []).length > 0) setShowProposalDropdown(true);
        }
      },
      placeholder: "Comece a digitar para buscar o neg\xF3cio...",
      className: "flex-1 bg-transparent pl-2 pr-2 py-2.5 text-sm text-slate-200 focus:outline-none placeholder-slate-600"
    }
  ), selectedProposalForTask ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 pr-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-emerald-400 text-xs font-bold" }, "\u2713"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
        setShowProposalDropdown(false);
      },
      className: "text-slate-500 hover:text-red-400 transition-colors p-0.5 cursor-pointer",
      title: "Limpar sele\xE7\xE3o"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2.5, d: "M6 18L18 6M6 6l12 12" }))
  )) : searchProposalQuery.length > 0 ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setSearchProposalQuery("");
        setProposalSearchResults([]);
        setShowProposalDropdown(false);
      },
      className: "pr-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2.5, d: "M6 18L18 6M6 6l12 12" }))
  ) : /* @__PURE__ */ React.createElement("span", { className: "pr-3 text-slate-600" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" })))), selectedProposalForTask && /* @__PURE__ */ React.createElement("div", { className: "mt-1.5 px-3 py-1.5 bg-indigo-950/40 border border-indigo-500/20 rounded-lg flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" }), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-indigo-200 font-semibold truncate flex-1" }, searchProposalQuery), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-indigo-400 font-mono" }, "Selecionado")), showProposalDropdown && proposalSearchResults.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-40", onClick: () => setShowProposalDropdown(false) }), /* @__PURE__ */ React.createElement("ul", { className: "absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-60 overflow-y-auto shadow-xl z-50 divide-y divide-slate-800/60" }, proposalSearchResults.map((p) => /* @__PURE__ */ React.createElement(
    "li",
    {
      key: p.id,
      onMouseDown: (e) => e.preventDefault(),
      onClick: () => {
        setSelectedProposalForTask(p);
        const cleanLabel = (raw) => String(raw || "").replace(/^S\/N\s*\|\s*/i, "").replace(/\s*-\s*v?[A-Z]{1,3}$/i, "").trim();
        setSearchProposalQuery(cleanLabel(p.name || "Projeto"));
        setShowProposalDropdown(false);
      },
      className: "flex items-center gap-2 cursor-pointer px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
    },
    /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" }),
    /* @__PURE__ */ React.createElement("span", { className: "font-medium text-sm text-slate-100 leading-snug truncate" }, p.name || "Projeto")
  )))), showProposalDropdown && proposalSearchResults.length === 0 && searchProposalQuery.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-500 text-center shadow-xl z-50" }, 'Nenhum neg\xF3cio encontrado para "', searchProposalQuery, '"'))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Assunto / T\xEDtulo da Tarefa"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: newTaskTitle,
      onChange: (e) => setNewTaskTitle(e.target.value),
      placeholder: "Ex: Ligar para alinhar proposta comercial",
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Tipo de Atividade"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: newTaskType,
      onChange: (e) => setNewTaskType(e.target.value),
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("option", { value: "Liga\xE7\xE3o" }, "\u{1F4DE} Liga\xE7\xE3o"),
    /* @__PURE__ */ React.createElement("option", { value: "Reuni\xE3o" }, "\u{1F465} Reuni\xE3o"),
    /* @__PURE__ */ React.createElement("option", { value: "E-mail" }, "\u2709\uFE0F E-mail"),
    /* @__PURE__ */ React.createElement("option", { value: "Follow-up" }, "\u{1F504} Follow-up")
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Atribu\xEDdo a"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: newTaskAssignee,
      onChange: (e) => setNewTaskAssignee(e.target.value),
      className: "w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("option", { value: "", className: "text-slate-400" }, "Selecione o respons\xE1vel..."),
    vendedores.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: String(v.id) }, v.nome))
  ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2" }, "Data de Vencimento"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      required: true,
      value: newTaskDueDate,
      onChange: (e) => setNewTaskDueDate(e.target.value),
      className: "flex-1 rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
    }
  ), !hasTime ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setHasTime(true),
      className: "px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("span", null, "\u2795 Adicionar hora")
  ) : /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-1" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: newTaskTime,
      onChange: (e) => setNewTaskTime(e.target.value),
      className: "rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
    },
    Array.from({ length: 41 }, (_, i) => {
      const hour = Math.floor(8 + i * 0.25);
      const minute = i * 15 % 60;
      const hourStr = String(hour).padStart(2, "0");
      const minuteStr = String(minute).padStart(2, "0");
      return `${hourStr}:${minuteStr}`;
    }).map((t) => /* @__PURE__ */ React.createElement("option", { key: t, value: t }, t))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setHasTime(false),
      className: "p-2.5 bg-red-950/40 text-red-400 hover:bg-red-950/60 rounded-xl text-xs font-bold transition-all cursor-pointer",
      title: "Remover hora"
    },
    "\u2715"
  )))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-end space-x-3 pt-4 border-t border-slate-800/60 mt-6" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setShowNewTaskModal(false);
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
      },
      className: "px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
    },
    "Cancelar"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: creatingTask,
      className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-950/30 transition-all"
    },
    creatingTask ? editingTask ? "Salvando..." : "Criando..." : editingTask ? "Salvar Altera\xE7\xF5es" : "Criar Tarefa"
  ))))), showDrawer && /* @__PURE__ */ React.createElement("div", { className: "drawer-container" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `drawer-backdrop ${showDrawer ? "active" : ""}`,
      onClick: () => {
        setShowDrawer(false);
        setClickupTaskId("");
      }
    }
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `drawer-content h-full flex flex-col ${showDrawer ? "active" : ""} ${drawerTab === "budget" ? "w-[75vw] max-w-7xl" : "w-full max-w-xl md:max-w-2xl"}`
    },
    drawerTab === "details" ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col p-6 overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between border-b border-slate-800 pb-4 mb-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-white" }, selectedTask ? selectedTask.name : "Detalhes do Neg\xF3cio"), (() => {
      const propNumField = selectedTask && selectedTask.custom_fields ? selectedTask.custom_fields.find((f) => f.id === "c44cc05d-303f-47e2-b243-40c6b26b732f") : null;
      const propNum = propNumField ? propNumField.value : null;
      return /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400" }, propNum ? `N\xBA da Proposta: ${propNum}` : `ID da oportunidade: #${clickupTaskId}`);
    })()), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setShowDrawer(false);
          setClickupTaskId("");
        },
        className: "p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
    )), /* @__PURE__ */ React.createElement("div", { className: "space-y-4 mb-8" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/60 p-3.5 rounded-xl border border-slate-800" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "Respons\xE1vel pelo Neg\xF3cio"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "w-full bg-transparent border-0 p-0 text-sm font-semibold text-slate-200 focus:ring-0 focus:outline-none cursor-pointer mt-1",
        value: selectedTask ? selectedTask.responsavel_negocio || "" : "",
        onChange: (e) => {
          if (selectedTask) {
            const u = vendedores.find((v) => v.nome === e.target.value);
            handleResponsavelChange(selectedTask.id, e.target.value, u ? u.id : null);
          }
        }
      },
      /* @__PURE__ */ React.createElement("option", { value: "", className: "bg-slate-900 text-slate-400" }, "Selecione o respons\xE1vel..."),
      vendedores.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: v.nome, className: "bg-slate-900 text-slate-200" }, v.nome))
    )), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-900/60 p-3.5 rounded-xl border border-slate-800" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "Valor Estimado"), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-semibold text-indigo-400 mt-1 block" }, (() => {
      if (currentProposta && currentProposta.situacao === "Selecionada") {
        return `R$ ${Number(realTimeGrandTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      }
      const val = getOpportunityValue(selectedTask);
      return val !== null && val !== void 0 && !isNaN(val) ? `R$ ${Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";
    })()))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between border-t border-slate-800 pt-4 mt-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "A\xE7\xF5es do Neg\xF3cio"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          if (typeof setSelectedProposalForTask === "function") setSelectedProposalForTask(currentProposta);
          if (typeof setSelectedProposal === "function") setSelectedProposal(currentProposta);
          if (currentProposta) {
            const propNum = currentProposta.numero_proposta ? currentProposta.numero_proposta + " | " : "";
            const propName = currentProposta.nome_projeto || currentProposta.cenario || "Projeto";
            setSearchProposalQuery(`${propNum}${propName} - v${currentProposta.versao}`);
          } else {
            setSearchProposalQuery("Sem Proposta");
          }
          setShowNewTaskModal(true);
        },
        className: "px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u2795 Nova Tarefa Comercial")
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col space-y-4 overflow-y-auto pr-1" }, /* @__PURE__ */ React.createElement("div", { className: "border border-slate-800 rounded-xl overflow-hidden bg-slate-900/20" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        onClick: () => setTimelineCollapsed(!timelineCollapsed),
        className: "flex items-center justify-between p-4 bg-slate-900/40 cursor-pointer select-none hover:bg-slate-900/60 transition-colors"
      },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 text-xs" }, timelineCollapsed ? "\u25B6" : "\u25BC"), /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-black uppercase tracking-wider text-indigo-400" }, "Timeline de Vers\xF5es")),
      timelineCollapsed && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20 font-semibold max-w-[200px] truncate" }, (() => {
        const activeProp = propostas.find((p) => ["Ativa", "Selecionada", "Ganho"].includes(p.situacao)) || propostas[0];
        return activeProp ? `${activeProp.versao} ${activeProp.situacao} - R$ ${Number(activeProp.total_proposta).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Nenhuma Vers\xE3o";
      })())
    ), !timelineCollapsed && /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-slate-800/60 max-h-[300px] overflow-y-auto" }, renderTimeline(false))), /* @__PURE__ */ React.createElement("div", { className: "border border-slate-800 rounded-xl overflow-hidden bg-slate-900/20" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        onClick: () => setTasksCollapsed(!tasksCollapsed),
        className: "flex items-center justify-between p-4 bg-slate-900/40 cursor-pointer select-none hover:bg-slate-900/60 transition-colors"
      },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-400 text-xs" }, tasksCollapsed ? "\u25B6" : "\u25BC"), /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-black uppercase tracking-wider text-indigo-400" }, "Tarefas do Neg\xF3cio")),
      tasksCollapsed && /* @__PURE__ */ React.createElement("span", { className: `text-[10px] px-2 py-0.5 rounded-full border font-semibold ${commercialTasks.filter((t) => {
        const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
        const isThisDeal = t.clickup_negocio_id === clickupTaskId || propObj && propObj.clickup_negocio_id === clickupTaskId || currentProposta && t.proposta_id === currentProposta.id;
        return isThisDeal && t.status === "pendente" && new Date(t.data_vencimento) < /* @__PURE__ */ new Date();
      }).length > 0 ? "bg-red-950/80 text-red-300 border-red-500/20 font-bold animate-pulse" : "bg-slate-800 text-slate-300 border-slate-700/20"}` }, (() => {
        const dealTasks = commercialTasks.filter((t) => {
          const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
          return t.clickup_negocio_id === clickupTaskId || propObj && propObj.clickup_negocio_id === clickupTaskId || currentProposta && t.proposta_id === currentProposta.id;
        });
        const pTasks = dealTasks.filter((t) => t.status === "pendente");
        const odTasks = pTasks.filter((t) => new Date(t.data_vencimento) < /* @__PURE__ */ new Date());
        return `${pTasks.length} Pendentes ${odTasks.length > 0 ? `| ${odTasks.length} Atrasada(s)` : ""}`;
      })())
    ), !tasksCollapsed && /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-slate-800/60 space-y-4 max-h-[300px] overflow-y-auto" }, (() => {
      const dealTasks = commercialTasks.filter((t) => {
        const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
        return t.clickup_negocio_id === clickupTaskId || propObj && propObj.clickup_negocio_id === clickupTaskId || currentProposta && t.proposta_id === currentProposta.id;
      });
      if (dealTasks.length === 0) {
        return /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 text-center py-2" }, "Nenhuma tarefa associada a este neg\xF3cio.");
      }
      return /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, dealTasks.map((task) => {
        const isOverdue = task.status === "pendente" && new Date(task.data_vencimento) < /* @__PURE__ */ new Date();
        const isDone = task.status === "concluida";
        const typeEmoji = {
          "Liga\xE7\xE3o": "\u{1F4DE}",
          "Reuni\xE3o": "\u{1F465}",
          "E-mail": "\u2709\uFE0F",
          "Follow-up": "\u{1F504}"
        }[task.tipo] || "\u{1F4CB}";
        return /* @__PURE__ */ React.createElement("div", { key: task.id, className: "flex items-start justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800/60 hover:border-slate-700 transition-colors" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start space-x-2.5" }, /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "checkbox",
            checked: isDone,
            onChange: () => toggleTaskStatus(task),
            className: "w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-0.5"
          }
        ), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: `text-xs font-semibold ${isDone ? "line-through text-slate-500" : "text-slate-200"}` }, typeEmoji, " ", task.titulo), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-500 mt-0.5" }, "Vence em: ", new Date(task.data_vencimento).toLocaleString("pt-BR"), isOverdue && /* @__PURE__ */ React.createElement("span", { className: "text-red-400 font-bold ml-1.5" }, "\u26A0\uFE0F Atrasada")))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => handleEditTaskClick(task), className: "p-1 text-slate-400 hover:text-blue-500 transition-colors", title: "Editar Tarefa" }, /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" }))), /* @__PURE__ */ React.createElement("button", { onClick: () => handleDeleteTask(task.id), className: "p-1 text-slate-400 hover:text-red-500 transition-colors", title: "Excluir Tarefa" }, /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M3 6h18" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }), /* @__PURE__ */ React.createElement("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }), /* @__PURE__ */ React.createElement("line", { x1: "10", x2: "10", y1: "11", y2: "17" }), /* @__PURE__ */ React.createElement("line", { x1: "14", x2: "14", y1: "11", y2: "17" })))));
      }));
    })())))) : /* @__PURE__ */ React.createElement("div", { className: "drawer-split-container" }, /* @__PURE__ */ React.createElement("div", { className: "drawer-split-sidebar flex flex-col p-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4 flex-shrink-0" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-black uppercase tracking-wider text-indigo-400" }, "Hist\xF3rico de Vers\xF5es"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setDrawerTab("details"),
        className: "text-[10px] bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-slate-300 transition-colors font-bold"
      },
      "\u2190 Detalhes"
    )), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto min-h-0 pr-1" }, renderTimeline())), /* @__PURE__ */ React.createElement("div", { className: "drawer-split-main flex flex-col" }, renderBudgetEditor()))
  )));
}
const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(/* @__PURE__ */ React.createElement(App, null));
