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
  "rgba(79, 70, 229, 0.8)",
  // Indigo (#4f46e5)
  "rgba(16, 185, 129, 0.8)",
  // Emerald (#10b981)
  "rgba(245, 158, 11, 0.8)",
  // Amber (#f59e0b)
  "rgba(139, 92, 246, 0.8)",
  // Violet (#8b5cf6)
  "rgba(6, 182, 212, 0.8)",
  // Cyan (#06b6d4)
  "rgba(236, 72, 153, 0.8)",
  // Pink
  "rgba(249, 115, 22, 0.8)"
  // Orange
];
const chartBorderColors = [
  "rgba(79, 70, 229, 1)",
  "rgba(16, 185, 129, 1)",
  "rgba(245, 158, 11, 1)",
  "rgba(139, 92, 246, 1)",
  "rgba(6, 182, 212, 1)",
  "rgba(236, 72, 153, 1)",
  "rgba(249, 115, 22, 1)"
];
const getCleanBusinessName = (raw) => {
  if (!raw) return "Projeto";
  return String(raw).replace(/^S\/N\s*\|\s*/i, "").replace(/\s*-\s*v+([A-Z]{1,3}|\d+)$/i, "").replace(/\s*-\s*versão\s*[A-Z0-9]+/i, "").trim() || "Projeto";
};
const getInitialConfig = () => {
  return {
    url: "",
    anonKey: ""
  };
};
const getSupabaseHeaders = () => {
  const token = localStorage.getItem("crm_user_clickup_token");
  return token ? { "Authorization": token } : {};
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
    /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between mb-2" }, /* @__PURE__ */ React.createElement("h4", { className: "text-sm font-semibold text-slate-800 line-clamp-2 pr-2" }, task.name), hasOverdue && /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "w-2.5 h-2.5 rounded-full bg-red-500 border border-white flex-shrink-0 mt-1 animate-pulse",
        title: "Possui tarefa comercial atrasada!"
      }
    )),
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between text-xs text-slate-500 mt-auto" }, /* @__PURE__ */ React.createElement("span", null, responsavel || "Sem Respons\xE1vel"), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-600 font-semibold text-sm" }, formattedValue))
  );
});
const STAGE_ORDER = [
  { key: "registro", width: "100%" },
  { key: "qualifica", width: "88%" },
  { key: "proposta", width: "76%" },
  { key: "desenvolvimento", width: "64%" },
  { key: "negocia", width: "52%" },
  { key: "termo", width: "40%" },
  { key: "aceite", width: "40%" }
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
  getOpportunityValue,
  onCardClick
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
  return /* @__PURE__ */ React.createElement("div", { className: "px-6 py-5 border-b border-slate-200 bg-white flex-shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs font-bold text-slate-500 mb-4 uppercase tracking-wider flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Funil de Vendas & Forecast"), filterStage && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setFilterStage(null),
      className: "text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
    },
    "Limpar Filtro"
  )), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col lg:flex-row gap-6 items-stretch w-full" }, /* @__PURE__ */ React.createElement("div", { className: `flex flex-col items-stretch space-y-3 flex-shrink-0 ${filterStage && selectedStageObj ? "w-full lg:w-[38%]" : "w-full lg:w-[65%]"}` }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col space-y-2 py-1" }, stageData.map((stage) => {
    const isSelected = filterStage === stage.id;
    return /* @__PURE__ */ React.createElement("div", { key: stage.id, className: "w-full flex justify-center" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setFilterStage(filterStage === stage.id ? null : stage.id),
        style: { width: stage.funnelWidth },
        className: `flex justify-between items-center py-2.5 px-4 rounded-lg transition-all duration-200 border cursor-pointer relative overflow-hidden ${isSelected ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-200/50" : "bg-slate-100 border-slate-200/80 hover:bg-slate-200/70 text-slate-950"}`
      },
      /* @__PURE__ */ React.createElement(
        "div",
        {
          className: `absolute inset-0 transition-all duration-200 ${isSelected ? "bg-indigo-700/20" : "bg-indigo-500/10"}`
        }
      ),
      /* @__PURE__ */ React.createElement("div", { className: "z-10 flex items-center gap-2 pr-2" }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "w-1.5 h-1.5 rounded-full flex-shrink-0",
          style: { backgroundColor: stage.color }
        }
      ), /* @__PURE__ */ React.createElement("span", { className: `text-[10px] md:text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${isSelected ? "text-white font-bold" : "text-slate-950"}` }, stage.name)),
      /* @__PURE__ */ React.createElement("div", { className: "z-10 flex items-center gap-3.5 flex-shrink-0 ml-auto justify-end text-right" }, /* @__PURE__ */ React.createElement("span", { className: `text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${isSelected ? "bg-indigo-700/60 text-indigo-100" : "bg-slate-200 text-slate-700"}` }, stage.count))
    ));
  })), filterStage && selectedStageObj && /* @__PURE__ */ React.createElement("div", { className: "w-full mt-2 bg-white p-5 rounded-xl border border-slate-200/80 border-l-4 border-l-indigo-600 shadow-sm shadow-slate-100/50 flex flex-col justify-center items-center text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block" }, `TOTAL EM ${selectedStageObj.name.toUpperCase()}`), /* @__PURE__ */ React.createElement("span", { className: "text-3xl font-black text-emerald-600 tracking-tight leading-none select-all" }, "R$ ", displayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("span", { className: "bg-slate-900 text-white font-semibold text-xs px-3 py-1 rounded-full mt-3 shadow-sm" }, `${selectedStageObj.count} neg\xF3cios nesta etapa`), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-500 mt-2 max-w-xs leading-relaxed" }, `Soma dos neg\xF3cios na etapa "${selectedStageObj.name}".`))), !filterStage && /* @__PURE__ */ React.createElement("div", { className: "w-full lg:w-[35%] bg-white p-8 rounded-xl border border-slate-200/80 border-l-4 border-l-indigo-600 shadow-sm shadow-slate-100/50 flex flex-col justify-center items-center text-center h-full" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block" }, "TOTAL EM NEGOCIA\xC7\xC3O"), /* @__PURE__ */ React.createElement("span", { className: "text-4xl lg:text-5xl font-black text-emerald-600 tracking-tight leading-none select-all" }, "R$ ", displayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("span", { className: "bg-slate-900 text-white font-semibold text-xs px-3 py-1.5 rounded-full mt-4 shadow-sm" }, `${stageData.reduce((a, s) => a + s.count, 0)} neg\xF3cios em andamento`), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-500 mt-4 max-w-xs leading-relaxed" }, "Soma total de todos os neg\xF3cios comerciais ativos em andamento no funil.")), filterStage && selectedStageObj && /* @__PURE__ */ React.createElement("div", { className: "w-full lg:w-[62%] flex flex-col min-h-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-4 py-3 bg-slate-50 rounded-t-xl border border-slate-200 border-b-0 flex-shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-3 h-3 rounded-full", style: { backgroundColor: selectedStageObj.color || "#6366f1" } }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-slate-800 uppercase tracking-wider" }, selectedStageObj.name)), /* @__PURE__ */ React.createElement("span", { className: "bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-bold" }, selectedStageObj.count, " neg\xF3cios")), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "flex-1 overflow-y-auto bg-slate-50/50 border border-slate-200 rounded-b-xl p-3 space-y-2.5",
      style: { height: "calc(100vh - 280px)", minHeight: "440px" }
    },
    kanbanTasks.filter((t) => getTaskOptionId(t, kanbanColumns) === filterStage).map((task) => {
      const dealValue = getOpportunityValue(task);
      const formattedValue = dealValue !== null && dealValue !== void 0 ? `R$ ${Number(dealValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";
      const responsavel = task.responsavel_negocio;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: task.id,
          onClick: () => onCardClick && onCardClick(task),
          className: "bg-white border border-slate-200 rounded-xl p-3.5 hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer group"
        },
        /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-slate-900 leading-tight group-hover:text-indigo-700 transition-colors truncate" }, task.name), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-1 truncate" }, responsavel || "Sem respons\xE1vel")), /* @__PURE__ */ React.createElement("span", { className: `text-sm font-black flex-shrink-0 ${dealValue > 0 ? "text-emerald-600" : "text-slate-400"}` }, formattedValue))
      );
    })
  ))));
};
const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clickupToken, setClickupToken] = useState(() => localStorage.getItem("crm_user_clickup_token") || "");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clickupToken.trim()) {
      setLocalError("O Personal API Token do ClickUp \xE9 obrigat\xF3rio.");
      return;
    }
    setLoading(true);
    setLocalError("");
    try {
      const res = await onLogin(email, password, clickupToken);
      if (res && res.error) {
        setLocalError(res.error.message);
      }
    } catch (err) {
      setLocalError(err.message || "Erro ao realizar login");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md p-8 bg-white border border-slate-200 rounded-3xl shadow-2xl space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("div", { className: "inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-3 border border-indigo-100 shadow-sm" }, /* @__PURE__ */ React.createElement("svg", { className: "w-8 h-8", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" }))), /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-black text-slate-900 tracking-tight" }, "Suprim\xE1tica CRM"), /* @__PURE__ */ React.createElement("p", { className: "text-slate-500 text-xs font-semibold mt-1 uppercase tracking-wider" }, "Gerador de Propostas Comerciais")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5" }, "E-mail Corporativo"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      required: true,
      className: "w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 rounded-xl outline-none transition-all text-sm font-medium",
      placeholder: "seu-email@suprimatica.com.br",
      value: email,
      onChange: (e) => setEmail(e.target.value)
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5" }, "Senha de Acesso"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: showPassword ? "text" : "password",
      required: true,
      className: "w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 rounded-xl outline-none transition-all text-sm font-medium pr-10",
      placeholder: "Sua senha secreta",
      value: password,
      onChange: (e) => setPassword(e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setShowPassword(!showPassword),
      className: "absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
    },
    showPassword ? /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" })) : /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }), /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" }))
  ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1.5" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-700 uppercase tracking-wider" }, "Personal API Token (ClickUp)"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setShowTokenHelp(!showTokenHelp),
      className: "text-[10px] text-indigo-600 hover:text-indigo-800 font-bold transition-colors cursor-pointer"
    },
    showTokenHelp ? "Ocultar Dica" : "Como obter?"
  )), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "password",
      required: true,
      className: "w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 rounded-xl outline-none transition-all text-xs font-mono",
      placeholder: "Cole seu token pk_...",
      value: clickupToken,
      onChange: (e) => setClickupToken(e.target.value)
    }
  ), showTokenHelp && /* @__PURE__ */ React.createElement("div", { className: "mt-2 bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 text-[11px] text-indigo-900 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150" }, /* @__PURE__ */ React.createElement("p", { className: "font-bold" }, "\u{1F4A1} Como obter seu token no ClickUp:"), /* @__PURE__ */ React.createElement("ol", { className: "list-decimal list-inside space-y-1 leading-relaxed text-[11px]" }, /* @__PURE__ */ React.createElement("li", null, "Clique no seu ", /* @__PURE__ */ React.createElement("b", null, "perfil / foto"), " no canto superior direito do ClickUp."), /* @__PURE__ */ React.createElement("li", null, "Clique em ", /* @__PURE__ */ React.createElement("b", null, "Configura\xE7\xF5es"), "."), /* @__PURE__ */ React.createElement("li", null, "Na barra lateral esquerda, na se\xE7\xE3o ", /* @__PURE__ */ React.createElement("i", null, "Integra\xE7\xF5es e ClickApps"), ", clique em ", /* @__PURE__ */ React.createElement("b", null, "API da ClickUp"), "."), /* @__PURE__ */ React.createElement("li", null, "Clique em ", /* @__PURE__ */ React.createElement("b", null, "Copiar"), " ao lado do seu ", /* @__PURE__ */ React.createElement("b", null, "Token API"), " (c\xF3digo que come\xE7a com ", /* @__PURE__ */ React.createElement("code", { className: "font-bold bg-white px-1 py-0.5 rounded border border-indigo-200" }, "pk_..."), ").")))), (localError || error) && /* @__PURE__ */ React.createElement("div", { className: "p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-start gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm mt-0.5" }, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("span", null, localError || error)), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: loading,
      className: "w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
    },
    loading ? /* @__PURE__ */ React.createElement("span", { className: "w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" }) : "Entrar no SPA"
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
  const getInitialTab = () => {
    const hash = window.location.hash.replace("#", "").trim();
    if (["kanban", "relatorios", "tasks", "propostas"].includes(hash)) {
      return hash;
    }
    return localStorage.getItem("crm_active_view") || "kanban";
  };
  const [activeTab, setActiveTab] = useState(getInitialTab);
  useEffect(() => {
    localStorage.setItem("crm_active_view", activeTab);
    if (window.location.hash !== `#${activeTab}`) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").trim();
      if (["kanban", "relatorios", "tasks", "propostas"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
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
  const [tasksPeriodFilter, setTasksPeriodFilter] = useState("all");
  const [tasksCustomStartDate, setTasksCustomStartDate] = useState("");
  const [tasksCustomEndDate, setTasksCustomEndDate] = useState("");
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
  const [drawerSection, setDrawerSection] = useState("propostas");
  const [atividades, setAtividades] = useState([]);
  const [loadingAtividades, setLoadingAtividades] = useState(false);
  const [novaAtividade, setNovaAtividade] = useState("");
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [editingAtividadeTexto, setEditingAtividadeTexto] = useState("");
  const [savingAtividade, setSavingAtividade] = useState(false);
  const [searchProposalQuery, setSearchProposalQuery] = useState("");
  const [proposalSearchResults, setProposalSearchResults] = useState([]);
  const [showProposalDropdown, setShowProposalDropdown] = useState(false);
  const [selectedProposalForTask, setSelectedProposalForTask] = useState(null);
  const [userClickUpToken, setUserClickUpToken] = useState(() => localStorage.getItem("crm_user_clickup_token") || "");
  const [userProfile, setUserProfile] = useState(() => {
    const cached = localStorage.getItem("crm_user_profile");
    return cached ? JSON.parse(cached) : null;
  });
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const validateAndSaveToken = async (tokenToTest) => {
    const cleanToken = tokenToTest ? tokenToTest.trim() : "";
    if (!cleanToken) {
      showToast("Informe um Personal Token do ClickUp v\xE1lido (ex: pk_...)", "error");
      return false;
    }
    setValidatingToken(true);
    try {
      const res = await fetch("/clickup-api/user", {
        headers: { "Authorization": cleanToken }
      });
      if (res.ok) {
        const data = await res.json();
        const userObj = data.user || data;
        setUserProfile(userObj);
        setUserClickUpToken(cleanToken);
        localStorage.setItem("crm_user_clickup_token", cleanToken);
        localStorage.setItem("crm_user_profile", JSON.stringify(userObj));
        showToast(`Bem-vindo(a), ${userObj.username || userObj.email}! Autenticado com sucesso.`, "success");
        setShowTokenModal(false);
        return true;
      } else {
        showToast("Token inv\xE1lido ou expirado no ClickUp.", "error");
        return false;
      }
    } catch (err) {
      console.error("Erro ao validar token:", err);
      showToast("Erro de conex\xE3o ao validar token no ClickUp.", "error");
      return false;
    } finally {
      setValidatingToken(false);
    }
  };
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
  const formatDateSafe = (dateStr, options = {}) => {
    if (!dateStr) return "";
    try {
      const cleanStr = String(dateStr).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
        const parts = cleanStr.split("-");
        const d2 = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d2.toLocaleDateString("pt-BR", options);
      }
      const d = new Date(cleanStr.includes(" ") && !cleanStr.includes("T") ? cleanStr.replace(" ", "T") : cleanStr);
      if (isNaN(d.getTime())) return cleanStr;
      return Object.keys(options).length > 0 ? d.toLocaleDateString("pt-BR", options) : d.toLocaleString("pt-BR");
    } catch (e) {
      return String(dateStr);
    }
  };
  const formatDateMsToYMD = (msOrString) => {
    if (!msOrString) return "";
    try {
      let d;
      if (typeof msOrString === "number" || !isNaN(Number(msOrString)) && String(msOrString).trim() !== "") {
        d = new Date(Number(msOrString));
      } else {
        const cleanStr = String(msOrString).trim();
        d = new Date(cleanStr.includes(" ") && !cleanStr.includes("T") ? cleanStr.replace(" ", "T") : cleanStr);
      }
      if (isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch (e) {
      return "";
    }
  };
  const getFirstNameSafe = (nameStr) => {
    if (!nameStr || typeof nameStr !== "string") return "Usu\xE1rio";
    const trimmed = nameStr.trim();
    if (!trimmed) return "Usu\xE1rio";
    return trimmed.split(" ")[0] || "Usu\xE1rio";
  };
  const formatVersionDisplay = (v) => {
    if (!v) return "vA";
    const str = String(v).trim();
    return str.startsWith("v") ? str : `v${str}`;
  };
  const [projectContext, setProjectContext] = useState({
    name: "",
    proposal_number: ""
  });
  const [clickupTaskDates, setClickupTaskDates] = useState({ start_date: "", due_date: "" });
  const distributorCanvasRef = useRef(null);
  const manufacturerCanvasRef = useRef(null);
  const topProductsCanvasRef = useRef(null);
  const seasonalityCanvasRef = useRef(null);
  const distributorChartInst = useRef(null);
  const manufacturerChartInst = useRef(null);
  const topProductsChartInst = useRef(null);
  const seasonalityChartInst = useRef(null);
  const [topProductsFilterMode, setTopProductsFilterMode] = useState("value");
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
  const [taskTypes, setTaskTypes] = useState(() => {
    const cached = localStorage.getItem("crm_cache_task_types");
    return cached ? JSON.parse(cached) : [
      { id: "1", nome: "Liga\xE7\xE3o", emoji: "\u{1F4DE}" },
      { id: "2", nome: "Reuni\xE3o", emoji: "\u{1F465}" },
      { id: "3", nome: "E-mail", emoji: "\u{1F4E7}" },
      { id: "4", nome: "Follow-up", emoji: "\u{1F504}" }
    ];
  });
  const [newTaskTypeName, setNewTaskTypeName] = useState("");
  const [newTaskTypeEmoji, setNewTaskTypeEmoji] = useState("");
  const [vendedoresOcultos, setVendedoresOcultos] = useState(() => {
    const cached = localStorage.getItem("crm_vendedores_ocultos");
    return cached ? JSON.parse(cached) : [];
  });
  const vendedoresVisiveis = useMemo(() => {
    return vendedores.filter((v) => !v.oculto);
  }, [vendedores]);
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
  const [importFormat, setImportFormat] = useState("csv");
  const [importText, setImportText] = useState("");
  const [isProjeto, setIsProjeto] = useState(false);
  const [openMenuVersionId, setOpenMenuVersionId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ nome: "", fabricante: "", custo_referencia: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (showSettingsModal) {
          setShowSettingsModal(false);
          return;
        }
        if (showNewTaskModal) {
          setShowNewTaskModal(false);
          setSelectedProposalForTask(null);
          setSearchProposalQuery("");
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
          if (drawerTab === "budget") {
            setDrawerTab("details");
          } else {
            setShowDrawer(false);
            setClickupTaskId("");
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSettingsModal, showNewTaskModal, openMenuVersionId, showCloseModal, showProductModal, showDrawer, drawerTab]);
  useEffect(() => {
    if (openMenuVersionId !== null) {
      const handleScroll = () => setOpenMenuVersionId(null);
      window.addEventListener("scroll", handleScroll, true);
      return () => window.removeEventListener("scroll", handleScroll, true);
    }
  }, [openMenuVersionId]);
  useEffect(() => {
    window.openVersionPortalMenu = (buttonElement, versionId) => {
      if (!buttonElement) return;
      const rect = buttonElement.getBoundingClientRect();
      const topPos = rect.bottom + 4;
      const leftPos = Math.max(10, rect.right - 180);
      const finalTop = topPos + 100 > window.innerHeight ? Math.max(10, rect.top - 80) : topPos;
      setMenuPosition({ top: finalTop, left: leftPos });
      setOpenMenuVersionId(versionId);
    };
    return () => {
      delete window.openVersionPortalMenu;
    };
  }, []);
  const saveTimeoutRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [kanbanSearchTerm, setKanbanSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { distributorTotals, distributorTotalSum } = useMemo(() => {
    const totals = {};
    const wonItems = (commercialData || []).filter((item) => {
      const sit = item.propostas?.situacao;
      return sit && sit.trim().toLowerCase() === "ganho";
    });
    const itemsToProcess = wonItems.length > 0 ? wonItems : commercialData || [];
    itemsToProcess.forEach((item) => {
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
    const wonItems = (commercialData || []).filter((item) => {
      const sit = item.propostas?.situacao;
      return sit && sit.trim().toLowerCase() === "ganho";
    });
    const itemsToProcess = wonItems.length > 0 ? wonItems : commercialData || [];
    itemsToProcess.forEach((item) => {
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
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, newSession) => {
      const savedToken = localStorage.getItem("crm_user_clickup_token");
      if (newSession && savedToken) {
        setSession(newSession);
        loadProducts(supabaseClient);
        loadDistributors(supabaseClient);
        loadVendedores(supabaseClient);
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
    if (!supabaseClient) return { error: { message: "Cliente Supabase n\xE3o inicializado." } };
    if (!clickupToken || !clickupToken.trim()) {
      return { error: { message: "O Personal API Token do ClickUp \xE9 obrigat\xF3rio para acessar o sistema." } };
    }
    const cleanToken = clickupToken.trim();
    try {
      const userRes = await fetch("/clickup-api/user", {
        headers: { "Authorization": cleanToken }
      });
      if (!userRes.ok) {
        return { error: { message: "Token do ClickUp inv\xE1lido ou expirado. Verifique e tente novamente." } };
      }
      const userData = await userRes.json();
      const userObj = userData.user || userData;
      setUserProfile(userObj);
      setUserClickUpToken(cleanToken);
      localStorage.setItem("crm_user_clickup_token", cleanToken);
      localStorage.setItem("crm_user_profile", JSON.stringify(userObj));
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        localStorage.removeItem("crm_user_clickup_token");
        localStorage.removeItem("crm_user_profile");
        setUserClickUpToken("");
        setUserProfile(null);
        return { error };
      }
      setSession(data.session);
      return data;
    } catch (err) {
      console.error("Erro no processo de login/valida\xE7\xE3o do ClickUp:", err);
      localStorage.removeItem("crm_user_clickup_token");
      localStorage.removeItem("crm_user_profile");
      setUserClickUpToken("");
      setUserProfile(null);
      return { error: { message: "Erro de conex\xE3o ao validar o Token no ClickUp." } };
    }
  };
  const testConnection = async (client) => {
    try {
      const { data, error } = await client.from("produtos").select("id").limit(1);
      if (error) throw error;
      setDbConnected(true);
      setErrorMsg("");
      const { data: { session: session2 } } = await client.auth.getSession();
      const savedToken = localStorage.getItem("crm_user_clickup_token");
      if (session2 && savedToken) {
        setSession(session2);
        loadProducts(client);
        loadDistributors(client);
        loadVendedores(client);
      } else {
        if (session2) {
          await client.auth.signOut();
        }
        setSession(null);
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
  const fetchKanbanData = async (silent = false) => {
    if (kanbanTasks.length === 0 && !silent) {
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
      if (!silent) setLoadingKanban(false);
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
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask((prev) => {
          if (!prev) return prev;
          const updatedFields = prev.custom_fields ? prev.custom_fields.map((f) => f.id === "c8d0abe2-c59f-4a9e-93ff-bd060659aa63" ? { ...f, value: targetOptionId } : f) : [{ id: "c8d0abe2-c59f-4a9e-93ff-bd060659aa63", value: targetOptionId }];
          return { ...prev, custom_fields: updatedFields };
        });
      }
      const cleanTaskId = String(taskId).replace("#", "").trim();
      const idWithHash = "#" + cleanTaskId;
      await Promise.all([
        updateTaskStage(cleanTaskId, targetOptionId),
        updateTaskClickupStatus(cleanTaskId, clickupStatus)
      ]);
      if (!targetName.includes("ganho") && !targetName.includes("perdido") && supabaseClient) {
        await supabaseClient.from("propostas").update({
          situacao: "Selecionada",
          data_fechamento: null,
          motivo_perda: null
        }).or(`clickup_negocio_id.eq.${cleanTaskId},clickup_negocio_id.eq.${idWithHash}`).in("situacao", ["Ganho", "Perdido"]);
        if (currentProposta && (currentProposta.situacao === "Ganho" || currentProposta.situacao === "Perdido")) {
          setCurrentProposta((prev) => ({
            ...prev,
            situacao: "Selecionada",
            data_fechamento: null,
            motivo_perda: null
          }));
        }
        setPropostas((prev) => prev.map((p) => {
          if (p.situacao === "Ganho" || p.situacao === "Perdido") {
            return { ...p, situacao: "Selecionada", data_fechamento: null, motivo_perda: null };
          }
          return p;
        }));
      }
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
    setDrawerSection("propostas");
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
          const startVal = taskData.start_date ? formatDateMsToYMD(taskData.start_date) : taskData.date_created ? formatDateMsToYMD(taskData.date_created) : "";
          const dueVal = taskData.due_date ? formatDateMsToYMD(taskData.due_date) : "";
          setClickupTaskDates({
            start_date: startVal,
            due_date: dueVal
          });
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
              const ocultos = JSON.parse(localStorage.getItem("crm_vendedores_ocultos") || "[]");
              const mapped = users.map((u) => ({
                id: u.id,
                nome: u.username || u.email,
                oculto: ocultos.includes(String(u.id)) || ocultos.includes(Number(u.id))
              }));
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
  const fetchAtividades = async (clickupId) => {
    if (!clickupId) return;
    setLoadingAtividades(true);
    try {
      const idClean = String(clickupId).replace("#", "");
      const res = await fetch(`/api/atividades?clickup_negocio_id=${idClean}`);
      if (res.ok) {
        const data = await res.json();
        setAtividades(data || []);
      } else {
        setAtividades([]);
      }
    } catch (err) {
      console.error("[ATIVIDADES] Erro ao buscar atividades:", err);
      setAtividades([]);
    } finally {
      setLoadingAtividades(false);
    }
  };
  const handleCreateAtividade = async () => {
    if (!novaAtividade.trim() || !clickupTaskId) return;
    setSavingAtividade(true);
    try {
      const idClean = String(clickupTaskId).replace("#", "");
      const res = await fetch("/api/atividades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clickup_negocio_id: idClean,
          texto: novaAtividade.trim()
        })
      });
      if (res.ok) {
        showToast("Atividade registrada com sucesso!", "success");
        setNovaAtividade("");
        fetchAtividades(clickupTaskId);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Erro ao registrar atividade.", "error");
      }
    } catch (err) {
      console.error("[ATIVIDADES] Erro ao criar atividade:", err);
      showToast("Erro ao registrar atividade.", "error");
    } finally {
      setSavingAtividade(false);
    }
  };
  const handleEditAtividade = async (atividadeId) => {
    if (!editingAtividadeTexto.trim()) return;
    setSavingAtividade(true);
    try {
      const res = await fetch(`/api/atividades/${atividadeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: editingAtividadeTexto.trim() })
      });
      if (res.ok) {
        showToast("Atividade atualizada com sucesso!", "success");
        setEditingAtividade(null);
        setEditingAtividadeTexto("");
        fetchAtividades(clickupTaskId);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || "Erro ao editar atividade.", "error");
      }
    } catch (err) {
      console.error("[ATIVIDADES] Erro ao editar atividade:", err);
      showToast("Erro ao editar atividade.", "error");
    } finally {
      setSavingAtividade(false);
    }
  };
  const handleDeleteAtividade = async (atividadeId) => {
    if (!confirm("Deseja realmente excluir esta atividade?")) return;
    setSavingAtividade(true);
    try {
      const res = await fetch(`/api/atividades/${atividadeId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Atividade exclu\xEDda com sucesso!", "success");
        fetchAtividades(clickupTaskId);
      } else {
        showToast("Erro ao excluir atividade.", "error");
      }
    } catch (err) {
      console.error("[ATIVIDADES] Erro ao excluir atividade:", err);
      showToast("Erro ao excluir atividade.", "error");
    } finally {
      setSavingAtividade(false);
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
    const rawProjectName = selectedProposalForTask?.name || selectedProposalForTask?.nome_projeto || (selectedTask ? selectedTask.name : currentProposta ? currentProposta.nome_projeto : "Projeto");
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
      const matchedKanban = (kanbanTasks || []).find((k) => String(k.id) === String(clickupTaskId) || String(k.clickup_id) === String(clickupTaskId));
      const rawBusinessName = selectedTask?.name || selectedTask?.nome || matchedKanban?.name || matchedKanban?.nome || currentProposta?.nome_projeto || "Neg\xF3cio";
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
      setSearchProposalQuery("");
    }
    setShowNewTaskModal(true);
  };
  const handleEditTaskClick = (task) => {
    console.log("[DEBUG] Inicializando modal de edi\xE7\xE3o. Tarefa:", task);
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
    const negocioCorrespondente = listaParaBusca.find((p) => {
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
    if (typeof setSelectedProposalForTask === "function") {
      setSelectedProposalForTask(activeDeal);
    }
    setSearchProposalQuery(cleanBusinessName);
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
  const loadDashboardData = async (client = supabaseClient, silent = false) => {
    if (!client) return;
    if (wonProposals.length === 0 && !silent) {
      setLoadingDashboard(true);
    }
    try {
      const { data, error } = await client.from("propostas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const won = (data || []).filter((p) => p.situacao === "Ganho");
      setWonProposals(won);
      calculateBIMetrics(data || []).catch((err) => console.error("Erro BI:", err));
      await loadCommercialPanelData(client);
    } catch (err) {
      console.error("Erro ao carregar dados do dashboard:", err);
    } finally {
      if (!silent) setLoadingDashboard(false);
    }
  };
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.substring(0, 10).split("-");
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  };
  const generateMonthlyTimeline = (start, end, wonProps) => {
    const labels = [];
    const values = [];
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    let count = 0;
    while (cur <= last && count < 24) {
      count++;
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const label = `${monthNames[m]} ${String(y).slice(-2)}`;
      labels.push(label);
      const sumMonth = wonProps.reduce((acc, p) => {
        const dateToUse = p.data_fechamento || p.created_at;
        if (!dateToUse) return acc;
        const pd = parseLocalDate(dateToUse);
        if (pd && pd.getFullYear() === y && pd.getMonth() === m) {
          return acc + (parseFloat(p.total_proposta) || 0);
        }
        return acc;
      }, 0);
      values.push(sumMonth / 1e6);
      cur.setMonth(cur.getMonth() + 1);
    }
    return { labels, values };
  };
  const calculateBIMetrics = async (allProps) => {
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
    let totalCycleDaysCurrent = 0;
    let cycleCountCurrent = 0;
    if (!window._taskDateCache) window._taskDateCache = {};
    const cyclePromises = wonCurrent.map(async (p) => {
      let dStart = p.data_inicio ? parseLocalDate(p.data_inicio) : null;
      const dClose = p.data_fechamento ? parseLocalDate(p.data_fechamento) : null;
      if (!dStart && p.clickup_negocio_id) {
        const cleanId = String(p.clickup_negocio_id).replace("#", "").trim();
        if (window._taskDateCache[cleanId]) {
          dStart = new Date(window._taskDateCache[cleanId]);
        } else {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const res = await fetch(`/clickup-api/task/${cleanId}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
              const taskData = await res.json();
              const startMs = taskData.start_date || taskData.date_created;
              if (startMs) {
                window._taskDateCache[cleanId] = parseInt(startMs);
                dStart = new Date(parseInt(startMs));
              }
            }
          } catch (e) {
          }
        }
      }
      if (!dStart) {
        dStart = p.created_at ? new Date(p.created_at) : null;
      }
      if (dStart && dClose) {
        const earlier = dStart < dClose ? dStart : dClose;
        const later = dStart < dClose ? dClose : dStart;
        const diffDays = Math.round((later - earlier) / (1e3 * 60 * 60 * 24));
        if (diffDays > 0) {
          return diffDays;
        }
      }
      return 0;
    });
    const cycleDaysArray = await Promise.all(cyclePromises);
    cycleDaysArray.forEach((days) => {
      if (days > 0) {
        totalCycleDaysCurrent += days;
        cycleCountCurrent++;
      }
    });
    const avgCycleDaysCurrent = cycleCountCurrent > 0 ? Math.round(totalCycleDaysCurrent / cycleCountCurrent) : 0;
    const ticketMedioCurrent = wonCountCurrent > 0 ? wonValueCurrent / wonCountCurrent : 0;
    const { labels: seasonalityLabels, values: seasonalityValues } = generateMonthlyTimeline(start, end, wonCurrent);
    let wonQtyDiff = null;
    let wonValDiff = null;
    let avgCycleDaysDiff = null;
    let ticketMedioDiff = null;
    let lostQtyDiff = null;
    let lostValDiff = null;
    let convRateDiff = null;
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
      let totalCycleDaysComp = 0;
      let cycleCountComp = 0;
      const cycleCompPromises = wonComp.map(async (p) => {
        let dStart = p.data_inicio ? parseLocalDate(p.data_inicio) : null;
        const dClose = p.data_fechamento ? parseLocalDate(p.data_fechamento) : null;
        if (!dStart && p.clickup_negocio_id) {
          const cleanId = String(p.clickup_negocio_id).replace("#", "").trim();
          if (window._taskDateCache[cleanId]) {
            dStart = new Date(window._taskDateCache[cleanId]);
          } else {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 1500);
              const res = await fetch(`/clickup-api/task/${cleanId}`, { signal: controller.signal });
              clearTimeout(timeoutId);
              if (res.ok) {
                const taskData = await res.json();
                const startMs = taskData.start_date || taskData.date_created;
                if (startMs) {
                  window._taskDateCache[cleanId] = parseInt(startMs);
                  dStart = new Date(parseInt(startMs));
                }
              }
            } catch (e) {
            }
          }
        }
        if (!dStart) {
          dStart = p.created_at ? new Date(p.created_at) : null;
        }
        if (dStart && dClose) {
          const earlier = dStart < dClose ? dStart : dClose;
          const later = dStart < dClose ? dClose : dStart;
          const diffDays = Math.round((later - earlier) / (1e3 * 60 * 60 * 24));
          if (diffDays > 0) {
            return diffDays;
          }
        }
        return 0;
      });
      const cycleCompDaysArray = await Promise.all(cycleCompPromises);
      cycleCompDaysArray.forEach((days) => {
        if (days > 0) {
          totalCycleDaysComp += days;
          cycleCountComp++;
        }
      });
      const avgCycleDaysComp = cycleCountComp > 0 ? Math.round(totalCycleDaysComp / cycleCountComp) : 0;
      const ticketMedioComp = wonCountComp > 0 ? wonValueComp / wonCountComp : 0;
      wonQtyDiff = wonCountCurrent - wonCountComp;
      wonValDiff = wonValueCurrent - wonValueComp;
      avgCycleDaysDiff = avgCycleDaysCurrent - avgCycleDaysComp;
      ticketMedioDiff = ticketMedioCurrent - ticketMedioComp;
      lostQtyDiff = lostCountCurrent - lostCountComp;
      lostValDiff = lostValueCurrent - lostValueComp;
      convRateDiff = convRateCurrent - convRateComp;
    }
    setBiMetrics({
      wonCount: wonCountCurrent,
      wonValue: wonValueCurrent,
      avgCycleDays: avgCycleDaysCurrent,
      ticketMedio: ticketMedioCurrent,
      wonQtyDiff,
      wonValDiff,
      avgCycleDaysDiff,
      ticketMedioDiff,
      lostCount: lostCountCurrent,
      lostValue: lostValueCurrent,
      lostQtyDiff,
      lostValDiff,
      convRate: convRateCurrent,
      convRateDiff,
      seasonalityLabels,
      seasonalityValues
    });
  };
  const loadCommercialPanelData = async (client = supabaseClient) => {
    if (!client) return;
    try {
      const { data, error } = await client.from("itens_proposta").select(`
          quantidade,
          preco_unitario,
          distribuidor_id,
          produto_id,
          propostas(created_at, data_fechamento, situacao),
          distribuidores(nome),
          produtos(nome, fabricante)
        `);
      if (error) throw error;
      const start = startDate ? /* @__PURE__ */ new Date(`${startDate}T00:00:00.000Z`) : null;
      const end = endDate ? /* @__PURE__ */ new Date(`${endDate}T23:59:59.999Z`) : null;
      const filtered = (data || []).filter((item) => {
        if (!item.propostas) return true;
        const dtStr = item.propostas.data_fechamento || item.propostas.created_at;
        if (!dtStr) return true;
        const d = new Date(dtStr);
        if (isNaN(d.getTime())) return true;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
      setCommercialData(filtered);
    } catch (err) {
      console.error("Erro ao carregar dados do painel comercial:", err);
    }
  };
  const topProductsAggregated = useMemo(() => {
    if (!commercialData || commercialData.length === 0) return [];
    const wonItems = commercialData.filter((item) => {
      const sit = item.propostas?.situacao;
      return sit && sit.trim().toLowerCase() === "ganho";
    });
    const groups = {};
    let totalVal = 0;
    let totalQty = 0;
    wonItems.forEach((item) => {
      const name = (item.produtos?.nome || item.produtos?.fabricante || "OUTROS PRODUTOS").toUpperCase();
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
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b", "#6366f1", "#a855f7"];
    const result = Object.values(groups).map((g, idx) => {
      const pctValNum = totalVal > 0 ? g.val / totalVal * 100 : 0;
      const pctQtyNum = totalQty > 0 ? g.qty / totalQty * 100 : 0;
      return {
        ...g,
        color: palette[idx % palette.length],
        pctValNum,
        pctQtyNum,
        pctValStr: `${pctValNum.toFixed(1)}%`,
        pctQtyStr: `${pctQtyNum.toFixed(1)}%`,
        pctStr: topProductsFilterMode === "value" ? `${pctValNum.toFixed(1)}%` : `${pctQtyNum.toFixed(1)}%`
      };
    });
    return result.sort((a, b) => topProductsFilterMode === "value" ? b.val - a.val : b.qty - a.qty);
  }, [commercialData, topProductsFilterMode]);
  useEffect(() => {
    if (activeTab !== "relatorios" || loadingDashboard || !commercialData) {
      return;
    }
    let animFrameId;
    const renderCharts = () => {
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
              legend: { display: false },
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
              legend: { display: false },
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
      const prodCtx = topProductsCanvasRef.current?.getContext("2d");
      if (prodCtx && topProductsAggregated.length > 0) {
        const productLabels = topProductsAggregated.map((p) => p.name);
        const productColors = topProductsAggregated.map((p) => p.color);
        const isValueMode = topProductsFilterMode === "value";
        const dataValues = topProductsAggregated.map((p) => isValueMode ? p.val : p.qty);
        const totalSum = dataValues.reduce((a, b) => a + b, 0);
        topProductsChartInst.current = new Chart(prodCtx, {
          type: "doughnut",
          data: {
            labels: productLabels,
            datasets: [{
              data: dataValues,
              backgroundColor: productColors,
              borderColor: "#ffffff",
              borderWidth: 2,
              cutout: "70%",
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                position: "followMouse",
                callbacks: {
                  label: function(context) {
                    const val = context.raw || 0;
                    const pct = totalSum > 0 ? (val / totalSum * 100).toFixed(1) : 0;
                    if (isValueMode) {
                      return ` R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
                    }
                    return ` ${val} unidades vendidas (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }
      const seasonCtx = seasonalityCanvasRef.current?.getContext("2d");
      if (seasonCtx) {
        const seasonLabels = biMetrics.seasonalityLabels && biMetrics.seasonalityLabels.length > 0 ? biMetrics.seasonalityLabels : ["Jan 26", "Fev 26", "Mar 26", "Abr 26", "Mai 26", "Jun 26", "Jul 26"];
        const seasonValues = biMetrics.seasonalityValues && biMetrics.seasonalityValues.length > 0 ? biMetrics.seasonalityValues : [0, 0, 0, 0, 0, 0, 0];
        seasonalityChartInst.current = new Chart(seasonCtx, {
          type: "line",
          data: {
            labels: seasonLabels,
            datasets: [{
              label: "Vendas (R$)",
              data: seasonValues,
              borderColor: "#10b981",
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              borderWidth: 3,
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: "#10b981",
              pointBorderColor: "#ffffff",
              pointBorderWidth: 2,
              pointHoverRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const valInMillions = context.raw || 0;
                    const realVal = valInMillions * 1e6;
                    return ` Vendas: R$ ${realVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: "#64748b", font: { size: 11, weight: "600" } }
              },
              y: {
                grid: { color: "#f1f5f9" },
                ticks: {
                  color: "#64748b",
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
    };
    animFrameId = requestAnimationFrame(renderCharts);
    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
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
  }, [activeTab, loadingDashboard, distributorTotals, manufacturerTotals, topProductsFilterMode, biMetrics.seasonalityLabels, biMetrics.seasonalityValues, topProductsAggregated]);
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
  const fetchAllData = async (silent = false) => {
    console.log(`[DEBUG] Auto-polling: Atualizando dados ${silent ? "silenciosamente" : "com loading"}...`);
    try {
      await fetchKanbanData(silent);
      if (supabaseClient) {
        await fetchCommercialTasks(supabaseClient, silent);
      }
      if (dbConnected) {
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
    }, 18e4);
    return () => clearInterval(intervalId);
  }, [session, dbConnected, clickupTaskId, supabaseClient]);
  const loadPropostas = async (targetId = null, silent = false) => {
    if (!supabaseClient || !clickupTaskId || typeof clickupTaskId !== "string" || !clickupTaskId.trim()) return;
    if (!silent) setLoading(true);
    try {
      const idWithoutHash = clickupTaskId.startsWith("#") ? clickupTaskId.substring(1) : clickupTaskId.trim();
      if (!idWithoutHash) return;
      const idWithHash = "#" + idWithoutHash;
      const { data: props, error } = await supabaseClient.from("propostas").select("*").or(`clickup_negocio_id.eq.${idWithoutHash},clickup_negocio_id.eq.${idWithHash}`).order("created_at", { ascending: false });
      if (error) throw error;
      setPropostas(props);
      fetchProjectContext();
      if (props.length > 0) {
        const selected = targetId ? props.find((p) => p.id === targetId) || props.find((p) => p.versao === "vA") || props[0] : props.find((p) => p.versao === "vA") || props[0];
        loadProposalDetails(selected.id, silent);
      } else {
        setCurrentProposta(null);
        setItens([]);
      }
    } catch (err) {
      console.error(err);
      showToast("Erro ao carregar propostas.", "error");
    } finally {
      if (!silent) setLoading(false);
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
  const loadProposalDetails = async (proposalId, silent = false) => {
    const existingProp = propostas.find((p) => p.id === proposalId);
    if (existingProp) {
      setCurrentProposta(existingProp);
      const isProj = ["HCI", "Cloud", "Tradicional", "Upgrade"].map((x) => x.toUpperCase()).includes((existingProp.cenario || "").toUpperCase()) || existingProp.cenario === "" || (existingProp.cenario || "").toUpperCase() === "PROJETO";
      setIsProjeto(!!isProj);
    } else if (!silent) {
      setLoading(true);
    }
    try {
      const { data: prop, error: propErr } = await supabaseClient.from("propostas").select("*").eq("id", proposalId).single();
      if (propErr) throw propErr;
      let updatedProp = { ...prop };
      setCurrentProposta(updatedProp);
      setIsEditingProposal(false);
      const isProj = updatedProp && (["HCI", "Cloud", "Tradicional", "Upgrade"].map((x) => x.toUpperCase()).includes((updatedProp.cenario || "").toUpperCase()) || updatedProp.cenario === "" || (updatedProp.cenario || "").toUpperCase() === "PROJETO");
      setIsProjeto(!!isProj);
      const { data: items, error: itemsErr } = await supabaseClient.from("itens_proposta").select("*").eq("proposta_id", proposalId).order("created_at");
      if (itemsErr) throw itemsErr;
      setItens(items || []);
      const cuId = updatedProp.clickup_negocio_id || clickupTaskId;
      if (cuId && (!updatedProp.data_inicio || !updatedProp.data_fechamento)) {
        const cleanCuId = cuId.startsWith("#") ? cuId.substring(1) : cuId;
        fetch(`/clickup-api/task/${cleanCuId}`).then((res) => {
          if (res.ok) return res.json();
          return null;
        }).then((taskData) => {
          if (!taskData) return;
          let autoUpdated = false;
          let newInicio = updatedProp.data_inicio;
          let newFechamento = updatedProp.data_fechamento;
          if (!newInicio) {
            const startMs = taskData.start_date || taskData.date_created;
            if (startMs) {
              newInicio = formatDateMsToYMD(startMs);
              autoUpdated = true;
            }
          }
          if (!newFechamento && taskData.due_date) {
            newFechamento = formatDateMsToYMD(taskData.due_date);
            autoUpdated = true;
          }
          if (autoUpdated && updatedProp.id) {
            setCurrentProposta((prev) => prev && prev.id === updatedProp.id ? { ...prev, data_inicio: newInicio, data_fechamento: newFechamento } : prev);
            supabaseClient.from("propostas").update({
              data_inicio: newInicio || null,
              data_fechamento: newFechamento || null
            }).eq("id", updatedProp.id).then(() => {
            });
          }
        }).catch((err) => console.error("Erro ao importar datas do ClickUp em segundo plano:", err));
      }
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
      const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : "Vendedor CRM";
      const { data: newProp, error } = await supabaseClient.from("propostas").insert({
        clickup_negocio_id: clickupTaskId,
        versao: "vA",
        cenario: "",
        situacao: "Ativa",
        total_proposta: 0,
        criado_por: currentResponsavel
      }).select().single();
      if (error) throw error;
      showToast("Primeira vers\xE3o (vA) iniciada com sucesso!", "success");
      await loadPropostas(newProp.id);
      setDrawerTab("budget");
    } catch (err) {
      console.error("Erro ao criar proposta inicial:", err);
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
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const currentUser = currentProposta.criado_por || session?.user?.email || "Usu\xE1rio";
      const updateData = {
        cenario: currentProposta.cenario,
        criado_por: currentProposta.criado_por,
        situacao: currentProposta.situacao,
        total_proposta: realTimeGrandTotal,
        data_fechamento: currentProposta.data_fechamento || clickupTaskDates?.due_date || null,
        motivo_perda: currentProposta.situacao === "Perdido" ? currentProposta.motivo_perda : null
      };
      if (currentProposta.data_inicio || clickupTaskDates?.start_date) {
        updateData.data_inicio = currentProposta.data_inicio || clickupTaskDates?.start_date;
      }
      let { error: propError } = await supabaseClient.from("propostas").update(updateData).eq("id", currentProposta.id);
      if (propError && (propError.code === "42703" || propError.code === "PGRST204" || propError.message && propError.message.includes("data_inicio"))) {
        console.warn("Coluna 'data_inicio' ainda n\xE3o criada no Supabase. Salvando sem a coluna data_inicio...");
        delete updateData.data_inicio;
        const { error: retryErr } = await supabaseClient.from("propostas").update(updateData).eq("id", currentProposta.id);
        propError = retryErr;
      }
      if (propError) throw propError;
      const cuId = currentProposta.clickup_negocio_id || clickupTaskId;
      if (cuId) {
        const cleanCuId = String(cuId).replace("#", "").trim();
        const idWithHash = "#" + cleanCuId;
        const propUpdates = {
          data_fechamento: currentProposta.data_fechamento || clickupTaskDates?.due_date || null
        };
        if (currentProposta.data_inicio || clickupTaskDates?.start_date) {
          propUpdates.data_inicio = currentProposta.data_inicio || clickupTaskDates?.start_date;
        }
        try {
          const { error: propSyncErr } = await supabaseClient.from("propostas").update(propUpdates).or(`clickup_negocio_id.eq.${cleanCuId},clickup_negocio_id.eq.${idWithHash}`);
          if (propSyncErr && (propSyncErr.code === "42703" || propSyncErr.code === "PGRST204" || propSyncErr.message && propSyncErr.message.includes("data_inicio"))) {
            delete propUpdates.data_inicio;
            await supabaseClient.from("propostas").update(propUpdates).or(`clickup_negocio_id.eq.${cleanCuId},clickup_negocio_id.eq.${idWithHash}`);
          }
        } catch (propSyncEx) {
          console.warn("Aviso ao propagar datas para propostas irm\xE3s:", propSyncEx);
        }
        const datesPayload = {};
        const startDateVal = currentProposta.data_inicio || clickupTaskDates?.start_date;
        const endDateVal = currentProposta.data_fechamento || clickupTaskDates?.due_date;
        if (startDateVal) {
          const startMs = (/* @__PURE__ */ new Date(`${startDateVal}T12:00:00.000Z`)).getTime();
          if (!isNaN(startMs)) datesPayload.start_date = startMs;
        }
        if (endDateVal) {
          const endMs = (/* @__PURE__ */ new Date(`${endDateVal}T12:00:00.000Z`)).getTime();
          if (!isNaN(endMs)) datesPayload.due_date = endMs;
        }
        if (Object.keys(datesPayload).length > 0) {
          fetch(`/clickup-api/task/${cleanCuId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datesPayload)
          }).catch((err) => console.error("Erro ao sincronizar datas no ClickUp:", err));
        }
      }
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
      const isOnlyOrSelected = currentProposta.situacao === "Selecionada" || propostas.length <= 1;
      const targetTaskIdForClickup = clickupTaskId || currentProposta.clickup_negocio_id;
      if (isOnlyOrSelected && targetTaskIdForClickup) {
        await syncClickUpProposta(targetTaskIdForClickup, realTimeGrandTotal, "Save");
      }
      showToast("Proposta salva com sucesso!", "success");
      setIsEditingProposal(false);
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
    if (!clickupTaskId) return;
    if (!currentProposta || propostas.length === 0) {
      await handleCreateInitialProposal();
      return;
    }
    setSaving(true);
    try {
      if (drawerTab === "budget" && !isReadOnly && itens && itens.length > 0) {
        await handleSaveProposal();
      }
      const { data: dbBaseProp, error: dbPropErr } = await supabaseClient.from("propostas").select("*").eq("id", currentProposta.id).single();
      const basePropData = dbBaseProp || currentProposta;
      const { data: dbBaseItems } = await supabaseClient.from("itens_proposta").select("*").eq("proposta_id", currentProposta.id);
      const itemsToClone = dbBaseItems && dbBaseItems.length > 0 ? dbBaseItems : itens || [];
      let calculatedBaseTotal = 0;
      if (itemsToClone.length > 0) {
        calculatedBaseTotal = itemsToClone.reduce((acc, item) => {
          const q = parseInt(item.quantidade) || 1;
          const p = parseFloat(item.preco_unitario) || 0;
          return acc + q * p;
        }, 0);
      }
      const finalBaseTotal = calculatedBaseTotal > 0 ? calculatedBaseTotal : parseFloat(basePropData.total_proposta) || (realTimeGrandTotal > 0 ? realTimeGrandTotal : 0);
      if (finalBaseTotal > 0 && parseFloat(basePropData.total_proposta) !== finalBaseTotal) {
        await supabaseClient.from("propostas").update({ total_proposta: finalBaseTotal }).eq("id", currentProposta.id);
      }
      const nextVersao = getNextVersionLetter(basePropData.versao || currentProposta.versao);
      const currentResponsavel = selectedTask ? selectedTask.responsavel_negocio : basePropData.criado_por || "";
      const { data: newProp, error: propErr } = await supabaseClient.from("propostas").insert({
        clickup_negocio_id: clickupTaskId,
        versao: nextVersao,
        cenario: basePropData.cenario || "",
        situacao: "Ativa",
        total_proposta: finalBaseTotal,
        criado_por: currentResponsavel,
        data_inicio: basePropData.data_inicio || currentProposta?.data_inicio || clickupTaskDates?.start_date || null,
        data_fechamento: basePropData.data_fechamento || currentProposta?.data_fechamento || clickupTaskDates?.due_date || null
      }).select().single();
      if (propErr) throw propErr;
      if (itemsToClone.length > 0) {
        const clonedItens = itemsToClone.map((item) => ({
          proposta_id: newProp.id,
          produto_id: item.produto_id,
          quantidade: Math.max(1, parseInt(item.quantidade) || 1),
          preco_unitario: Math.max(0, parseFloat(item.preco_unitario) || 0),
          distribuidor_id: item.distribuidor_id || null
        }));
        const { error: itemsErr } = await supabaseClient.from("itens_proposta").insert(clonedItens);
        if (itemsErr) throw itemsErr;
      }
      showToast(`Nova vers\xE3o ${nextVersao} gerada preservando o hist\xF3rico de ${basePropData.versao}!`, "success");
      await loadPropostas(newProp.id);
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
        if (clickupTaskId) {
          await syncClickUpProposta(clickupTaskId, 0, "Select");
          setKanbanTasks((prev) => prev.map((t) => t.id === clickupTaskId ? { ...t, valor_estimado: 0 } : t));
          if (selectedTask && selectedTask.id === clickupTaskId) {
            setSelectedTask((prev) => ({ ...prev, valor_estimado: 0 }));
          }
        }
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
        const remainingProps = propostas.filter((p) => p.id !== targetProp.id);
        setPropostas(remainingProps);
        const hasSelectedRemaining = remainingProps.some((p) => p.situacao === "Selecionada");
        if (!hasSelectedRemaining && clickupTaskId) {
          await syncClickUpProposta(clickupTaskId, 0, "Select");
          setKanbanTasks((prev) => prev.map((t) => t.id === clickupTaskId ? { ...t, valor_estimado: 0 } : t));
          if (selectedTask && selectedTask.id === clickupTaskId) {
            setSelectedTask((prev) => ({ ...prev, valor_estimado: 0 }));
          }
        }
        const isCurrentDeleted = currentProposta && currentProposta.id === targetProp.id;
        if (isCurrentDeleted) {
          const vaProp = remainingProps.find((p) => p.versao === "vA") || remainingProps[0];
          if (vaProp) {
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
      if (newStatus === "Selecionada" || newStatus === "Ativa" || newStatus === "Em Andamento") {
        updateData.data_fechamento = null;
        updateData.motivo_perda = null;
        if (newStatus === "Selecionada") {
          updateData.total_proposta = realTimeGrandTotal;
        }
      }
      const { error } = await supabaseClient.from("propostas").update(updateData).eq("id", versionId);
      if (error) throw error;
      if (newStatus === "Selecionada" || newStatus === "Em Andamento") {
        const activeStage = kanbanColumns.find((c) => {
          const n = (c.name || "").toLowerCase();
          return !n.includes("congelad") && !n.includes("ganho") && !n.includes("perdido");
        }) || kanbanColumns[0];
        if (activeStage && taskId) {
          await handleOpportunityStateChange(taskId, activeStage.id);
        }
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
  const handleToggleOcultoVendedor = async (vendedor) => {
    const isOculto = !vendedor.oculto;
    const updatedVendedores = vendedores.map(
      (v) => v.id === vendedor.id ? { ...v, oculto: isOculto } : v
    );
    setVendedores(updatedVendedores);
    localStorage.setItem("crm_cache_vendedores", JSON.stringify(updatedVendedores));
    const ocultos = JSON.parse(localStorage.getItem("crm_vendedores_ocultos") || "[]");
    let novosOcultos;
    if (isOculto) {
      novosOcultos = [.../* @__PURE__ */ new Set([...ocultos, String(vendedor.id)])];
    } else {
      novosOcultos = ocultos.filter((id) => String(id) !== String(vendedor.id));
    }
    localStorage.setItem("crm_vendedores_ocultos", JSON.stringify(novosOcultos));
    setVendedoresOcultos(novosOcultos);
    if (supabaseClient) {
      try {
        await supabaseClient.from("vendedores").upsert({
          id: vendedor.id,
          nome: vendedor.nome,
          oculto: isOculto
        });
      } catch (err) {
        console.warn("Erro ao persistir status oculto do vendedor no Supabase:", err);
      }
    }
    showToast(`Vendedor ${isOculto ? "ocultado" : "exibido"} com sucesso!`, "success");
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
    return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col h-full" }, showHeader && /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-[11px] font-bold uppercase tracking-widest text-indigo-500 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" })), "Timeline de Vers\xF5es"), /* @__PURE__ */ React.createElement("span", { className: "bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums" }, propostas.length)), propostas.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-14 h-14 bg-gradient-to-br from-indigo-50 to-slate-100 rounded-2xl border border-indigo-100/80 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("svg", { className: "w-7 h-7 text-indigo-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-700 font-semibold" }, "Nenhuma proposta criada"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mt-0.5" }, "Crie a primeira vers\xE3o para este neg\xF3cio.")), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleCreateInitialProposal,
        className: "w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition-all"
      },
      "+ Criar Vers\xE3o vA"
    )) : /* @__PURE__ */ React.createElement("div", { className: "flex-1 space-y-2 pr-1 overflow-visible" }, propostas.map((prop, i) => {
      const isSelected = currentProposta && currentProposta.id === prop.id;
      const statusConfig = {
        "Ativa": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", dot: "bg-sky-400" },
        "Selecionada": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-400" },
        "Ganho": { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-300", dot: "bg-amber-400" },
        "Desconsiderada": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-400" },
        "Descartada": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-400" },
        "N\xE3o selecionada": { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
        "Substitu\xEDda": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-400" },
        "Perdido": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-400" }
      };
      const sc = statusConfig[prop.situacao] || { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" };
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: prop.id,
          onClick: async (e) => {
            if (e.target.closest(".btn-three-dots")) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            await loadProposalDetails(prop.id);
            setDrawerTab("budget");
          },
          className: `group relative rounded-xl cursor-pointer timeline-item transition-all duration-200 overflow-visible ${openMenuVersionId === prop.id ? "z-[9999]" : "z-10"} ${isSelected ? "bg-white ring-2 ring-indigo-500 shadow-md shadow-indigo-500/10" : "bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-sm"}`
        },
        isSelected && /* @__PURE__ */ React.createElement("div", { className: "absolute left-0 top-3 bottom-3 w-[3px] bg-indigo-500 rounded-r-full" }),
        /* @__PURE__ */ React.createElement("div", { className: "p-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center justify-center w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg text-[11px] font-black shadow-sm" }, formatVersionDisplay(prop.versao)), prop.cenario && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wide" }, prop.cenario)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 relative", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("span", { className: `inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${sc.bg} ${sc.text} ${sc.border}` }, /* @__PURE__ */ React.createElement("span", { className: `w-1.5 h-1.5 rounded-full ${sc.dot}` }), prop.situacao), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            onClick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (openMenuVersionId === prop.id) {
                setOpenMenuVersionId(null);
              } else {
                const btn = e.currentTarget || e.target.closest("button");
                if (window.openVersionPortalMenu) {
                  window.openVersionPortalMenu(btn, prop.id);
                } else {
                  const rect = btn.getBoundingClientRect();
                  const topPos = rect.bottom + 4;
                  const leftPos = Math.max(10, rect.right - 180);
                  const finalTop = topPos + 100 > window.innerHeight ? Math.max(10, rect.top - 80) : topPos;
                  setMenuPosition({ top: finalTop, left: leftPos });
                  setOpenMenuVersionId(prop.id);
                }
              }
            },
            className: "btn-three-dots p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer",
            title: "Op\xE7\xF5es da Vers\xE3o"
          },
          /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 pointer-events-none", fill: "currentColor", viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { className: "pointer-events-none", d: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" }))
        ), openMenuVersionId === prop.id && ReactDOM.createPortal(
          /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[9999998] bg-transparent cursor-default", onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpenMenuVersionId(null);
          } }), /* @__PURE__ */ React.createElement(
            "div",
            {
              style: { top: `${menuPosition.top}px`, left: `${menuPosition.left}px` },
              className: "fixed z-[9999999] w-48 bg-white rounded-xl shadow-2xl border border-slate-200/90 p-1.5 space-y-0.5 text-left animate-in fade-in zoom-in-95 duration-100 block"
            },
            /* @__PURE__ */ React.createElement(
              "button",
              {
                onClick: async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenMenuVersionId(null);
                  await loadProposalDetails(prop.id);
                  setDrawerTab("budget");
                },
                className: "w-full text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg p-2 flex items-center gap-2 transition-colors cursor-pointer"
              },
              /* @__PURE__ */ React.createElement("span", null, "\u270F\uFE0F Editar Vers\xE3o")
            ),
            /* @__PURE__ */ React.createElement("div", { className: "border-t border-slate-100 my-0.5" }),
            /* @__PURE__ */ React.createElement(
              "button",
              {
                onClick: async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenMenuVersionId(null);
                  await handleDeleteProposal(prop);
                },
                className: "w-full text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg p-2 flex items-center gap-2 transition-colors cursor-pointer"
              },
              /* @__PURE__ */ React.createElement("span", null, "\u{1F5D1}\uFE0F Excluir Vers\xE3o")
            )
          )),
          document.body
        )))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400 font-medium flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" })), formatDateSafe(prop.created_at, { day: "2-digit", month: "2-digit" }), " \u2022 ", getFirstNameSafe(prop.criado_por)), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-black text-slate-800 tabular-nums" }, "R$ ", Number(prop.total_proposta || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))))
      );
    })), propostas.length > 0 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: async () => {
          await handleGerarNovaVersao();
          setDrawerTab("budget");
        },
        disabled: saving,
        className: "w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 mt-4 shadow-lg shadow-indigo-600/25 hover:from-indigo-500 hover:to-indigo-400"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 4v16m8-8H4" })),
      /* @__PURE__ */ React.createElement("span", null, "Gerar Nova Vers\xE3o")
    ));
  };
  const renderBudgetEditor = () => {
    if (loading) {
      return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-3 bg-slate-50/50" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-slate-500 tracking-wide uppercase" }, "Carregando dados da proposta..."));
    }
    if (!currentProposta) {
      return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "w-20 h-20 bg-gradient-to-br from-indigo-50 to-indigo-100/80 rounded-3xl border border-indigo-200/60 shadow-sm flex items-center justify-center text-indigo-600" }, /* @__PURE__ */ React.createElement("svg", { className: "w-10 h-10", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-xl font-black text-slate-900 mb-2" }, "Painel de Negocia\xE7\xE3o Comercial"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 leading-relaxed" }, "Selecione ou crie uma vers\xE3o de proposta na linha do tempo para carregar os itens e precifica\xE7\xE3o.")));
    }
    const getTipoOportunidade = () => {
      const c = currentProposta.cenario || "";
      if (["HCI", "Cloud", "Tradicional", "Upgrade"].includes(c)) return "PROJETO";
      return c;
    };
    const isReadOnly2 = (currentProposta.situacao === "Ganho" || currentProposta.situacao === "Perdido") && !isEditingProposal;
    return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden bg-slate-50/50" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-3 bg-white/90 backdrop-blur-md border-b border-slate-200/70 flex items-center justify-between z-10 shadow-2xs" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setDrawerTab("details"),
        className: "inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-xl hover:bg-indigo-50/50 transition-all cursor-pointer group"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4 transition-transform group-hover:-translate-x-1 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M10 19l-7-7m0 0l7-7m-7 7h18" })),
      /* @__PURE__ */ React.createElement("span", null, "Voltar para Detalhes")
    ), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-extrabold text-slate-400 uppercase tracking-widest" }, "PROPOSTA COMERCIAL"), /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500" }))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-y-auto" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white border-b border-slate-200/80 px-7 py-5 shadow-2xs space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5" }, projectContext.name && /* @__PURE__ */ React.createElement("h1", { className: "text-xl lg:text-2xl font-black text-slate-900 tracking-tight leading-tight flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("span", null, projectContext.name)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5 flex-wrap text-xs font-medium text-slate-600" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-700" }, "Vers\xE3o"), /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center justify-center bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-black px-2.5 py-0.5 rounded-lg text-xs shadow-xs tracking-wide" }, formatVersionDisplay(currentProposta.versao)), currentProposta.cenario && /* @__PURE__ */ React.createElement("span", { className: "bg-slate-100 border border-slate-200/80 text-slate-700 text-[11px] px-2.5 py-0.5 rounded-full uppercase font-extrabold tracking-wider" }, currentProposta.cenario), isReadOnly2 && /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center justify-center bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 rounded-lg text-[11px] font-bold gap-1 shadow-2xs", title: "Trava de leitura ativa" }, "\u{1F512} Somente Leitura"), /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "\u2022"), /* @__PURE__ */ React.createElement("span", { className: "text-slate-500 font-medium flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-slate-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" })), "Criada em ", /* @__PURE__ */ React.createElement("strong", { className: "text-slate-800 font-bold" }, formatDateSafe(currentProposta.created_at)), " ", currentProposta.criado_por ? /* @__PURE__ */ React.createElement("span", null, "por ", /* @__PURE__ */ React.createElement("strong", { className: "text-slate-900 font-bold" }, currentProposta.criado_por)) : ""), currentProposta.situacao === "Ganho" && /* @__PURE__ */ React.createElement("span", { className: "text-xs font-black text-emerald-800 bg-emerald-50 px-3 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1 shadow-2xs" }, "\u{1F3C6} Ganho ", currentProposta.data_fechamento ? `(${formatDateSafe(currentProposta.data_fechamento)})` : ""), currentProposta.situacao === "Perdido" && /* @__PURE__ */ React.createElement("span", { className: "text-xs font-black text-rose-800 bg-rose-50 px-3 py-0.5 rounded-lg border border-rose-200 flex items-center gap-1 shadow-2xs" }, "\u{1F61E} Perdido: ", currentProposta.motivo_perda || "Outros", " ", currentProposta.data_fechamento ? `(${formatDateSafe(currentProposta.data_fechamento)})` : "")))), /* @__PURE__ */ React.createElement("div", { className: "pt-3.5 border-t border-slate-100 flex items-center justify-between gap-4 flex-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 flex-wrap" }, currentProposta.situacao === "Selecionada" ? /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: async () => {
          await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, "Ativa");
          showToast("Sele\xE7\xE3o desativada. A proposta retornou para Em Andamento.", "info");
        },
        className: "bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-300/80 font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all hover:scale-[1.01]",
        title: "Clique para desativar esta sele\xE7\xE3o de vers\xE3o"
      },
      /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-emerald-500 animate-pulse" }),
      /* @__PURE__ */ React.createElement("span", null, "\u2705 Vers\xE3o Selecionada"),
      /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-emerald-600 font-medium underline ml-1" }, "Desativar")
    ) : /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: async () => {
          await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, "Selecionada");
          showToast("Vers\xE3o selecionada! Valor sincronizado com a oportunidade no ClickUp.", "success");
        },
        className: "bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.01]",
        title: "Definir esta vers\xE3o como a ativa comercialmente e sincronizar valor com o ClickUp"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u2B50 Selecionar Vers\xE3o")
    ), /* @__PURE__ */ React.createElement("div", { className: `flex items-center gap-2 bg-slate-100/70 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/80 transition-all ${isReadOnly2 ? "opacity-60 cursor-not-allowed" : ""}` }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black text-slate-400 uppercase tracking-wider" }, "STATUS:"), /* @__PURE__ */ React.createElement(
      "select",
      {
        disabled: isReadOnly2,
        value: currentProposta.situacao === "Ganho" ? "Ganho" : currentProposta.situacao === "Perdido" ? "Perdido" : currentProposta.situacao === "Desconsiderada" ? "Desconsiderada" : "Em Andamento",
        onChange: async (e) => {
          const val = e.target.value;
          if (val === "Ganho") {
            setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
            setShowCloseModal("win");
          } else if (val === "Perdido") {
            setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
            setSelectedLossReason("");
            setShowCloseModal("loss");
          } else if (val === "Em Andamento") {
            await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, "Selecionada");
            showToast("Proposta atualizada para Em Andamento!", "success");
          } else if (val === "Desconsiderada") {
            await handleUpdateVersionStatus(clickupTaskId || currentProposta.clickup_negocio_id, currentProposta.id, "Desconsiderada");
          }
        },
        className: "text-xs font-black text-slate-700 bg-transparent border-none focus:outline-none cursor-pointer pr-1 disabled:cursor-not-allowed"
      },
      /* @__PURE__ */ React.createElement("option", { value: "Em Andamento" }, "Em Andamento"),
      /* @__PURE__ */ React.createElement("option", { value: "Ganho" }, "\u{1F3C6} Ganho"),
      /* @__PURE__ */ React.createElement("option", { value: "Perdido" }, "\u{1F61E} Perdido"),
      /* @__PURE__ */ React.createElement("option", { value: "Desconsiderada" }, "\u{1F6AB} Desconsiderada")
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, !isReadOnly2 && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
          setShowCloseModal("win");
        },
        className: `font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer hover:scale-[1.02] ${currentProposta.situacao === "Ganho" ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs" : "bg-slate-100/80 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200/80"}`,
        title: "Marcar oportunidade como Ganha \u{1F3C6}"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F3C6} Ganho")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
          setSelectedLossReason("");
          setShowCloseModal("loss");
        },
        className: `font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer hover:scale-[1.02] ${currentProposta.situacao === "Perdido" ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xs" : "bg-slate-100/80 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200/80"}`,
        title: "Marcar oportunidade como Perdida \u{1F61E}"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u{1F61E} Perdido")
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setIsEditingProposal(!isEditingProposal),
        className: `text-xs px-3.5 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all ${isEditingProposal ? "bg-amber-50 border border-amber-300 text-amber-800 font-extrabold shadow-2xs" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold shadow-2xs"}`,
        title: isEditingProposal ? "Bloquear Campos para Leitura" : "Desbloquear Campos para Edi\xE7\xE3o (\u270F\uFE0F)"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u270F\uFE0F ", isEditingProposal ? "Bloquear" : "Editar")
    ), !isReadOnly2 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleSaveProposalDebounced,
        disabled: saving,
        className: "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02]",
        title: "Salvar Altera\xE7\xF5es"
      },
      saving ? /* @__PURE__ */ React.createElement("div", { className: "w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" }) : /* @__PURE__ */ React.createElement("span", null, "\u{1F4BE} Salvar")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleDeleteProposal,
        disabled: saving,
        className: "bg-white text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-2xs hover:scale-[1.05]",
        title: "Excluir Vers\xE3o"
      },
      /* @__PURE__ */ React.createElement("span", { className: "text-xs" }, "\u{1F5D1}\uFE0F")
    )))), /* @__PURE__ */ React.createElement("div", { className: "mx-7 my-5 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" })), "Tipo Oportunidade"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "h-10 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-3 text-xs text-slate-800 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60",
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
        },
        disabled: isReadOnly2
      },
      /* @__PURE__ */ React.createElement("option", { value: "", disabled: true, className: "bg-white text-slate-500" }, "Selecione a oportunidade..."),
      /* @__PURE__ */ React.createElement("option", { value: "PROJETO", className: "bg-white text-slate-800" }, "PROJETO"),
      /* @__PURE__ */ React.createElement("option", { value: "GARANTIAS", className: "bg-white text-slate-800" }, "GARANTIAS"),
      /* @__PURE__ */ React.createElement("option", { value: "SERVI\xC7OS", className: "bg-white text-slate-800" }, "SERVI\xC7OS"),
      /* @__PURE__ */ React.createElement("option", { value: "SSU", className: "bg-white text-slate-800" }, "SSU"),
      /* @__PURE__ */ React.createElement("option", { value: "VOLUMES", className: "bg-white text-slate-800" }, "VOLUMES"),
      /* @__PURE__ */ React.createElement("option", { value: "UPGRADE", className: "bg-white text-slate-800" }, "UPGRADE")
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" })), "Tipo de Projeto"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "h-10 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-3 text-xs text-slate-800 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60",
        value: currentProposta.cenario || "",
        onChange: (e) => setCurrentProposta({ ...currentProposta, cenario: e.target.value }),
        disabled: isReadOnly2 || !isProjeto
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecione o tipo..."),
      /* @__PURE__ */ React.createElement("option", { value: "HCI" }, "HCI (Hiperconverg\xEAncia)"),
      /* @__PURE__ */ React.createElement("option", { value: "Cloud" }, "Cloud (Nuvem)"),
      /* @__PURE__ */ React.createElement("option", { value: "Tradicional" }, "Tradicional"),
      /* @__PURE__ */ React.createElement("option", { value: "Upgrade" }, "Upgrade")
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" })), "Vendedor / Respons\xE1vel"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "h-10 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-3 text-xs text-slate-800 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60",
        value: currentProposta.criado_por || "",
        onChange: (e) => setCurrentProposta({ ...currentProposta, criado_por: e.target.value }),
        disabled: isReadOnly2
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecione o vendedor..."),
      vendedoresVisiveis.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: v.nome, className: "bg-white text-slate-800" }, v.nome))
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" })), "Data de In\xEDcio"), /* @__PURE__ */ React.createElement("span", { className: "text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded-md uppercase", title: "Sincroniza com todas as vers\xF5es" }, "NEG\xD3CIO")), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "date",
        className: "h-10 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-2.5 text-xs text-slate-800 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60",
        value: currentProposta?.data_inicio ? currentProposta.data_inicio.substring(0, 10) : clickupTaskDates?.start_date || "",
        onChange: (e) => setCurrentProposta({ ...currentProposta, data_inicio: e.target.value }),
        disabled: isReadOnly2
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" })), "Data Fechamento"), /* @__PURE__ */ React.createElement("span", { className: "text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded-md uppercase", title: "Sincroniza com o ClickUp e todas as vers\xF5es" }, "NEG\xD3CIO")), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "date",
        className: "h-10 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 px-2.5 text-xs text-slate-800 font-bold w-full focus:outline-none transition-all cursor-pointer disabled:opacity-60",
        value: currentProposta?.data_fechamento ? currentProposta.data_fechamento.substring(0, 10) : clickupTaskDates?.due_date || "",
        onChange: (e) => setCurrentProposta({ ...currentProposta, data_fechamento: e.target.value }),
        disabled: isReadOnly2
      }
    )))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto px-7 pb-6 space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-2" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" }))), /* @__PURE__ */ React.createElement("span", null, "Produtos e Servi\xE7os Inclusos")), !isReadOnly2 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowProductModal(true),
        className: "text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer group"
      },
      /* @__PURE__ */ React.createElement("span", { className: "w-5 h-5 rounded-md bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black" }, "+"),
      /* @__PURE__ */ React.createElement("span", null, "Adicionar Novo Item ao Cat\xE1logo")
    )), itens.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-b from-white to-slate-50/80 border border-dashed border-slate-300/90 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-2xs" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-center text-indigo-500" }, /* @__PURE__ */ React.createElement("svg", { className: "w-8 h-8", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-base font-black text-slate-800" }, "Nenhum item adicionado \xE0 proposta"), !isReadOnly2 && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-1 font-medium" }, "Selecione itens do cat\xE1logo para compor o valor comercial desta vers\xE3o.")), !isReadOnly2 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleAddItem,
        className: "px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-600/20 hover:scale-[1.02] cursor-pointer"
      },
      "+ Adicionar Primeiro Item"
    )) : /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-x-auto", style: { overflow: "visible", minHeight: "280px" } }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-slate-50/70 border-b border-slate-200/80 text-[10px] font-black text-slate-400 uppercase tracking-widest" }, /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4" }, "Produto [Fabricante]"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-2/12" }, "Distribuidor"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-[70px] text-center" }, "Qtd"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-2/12 text-right" }, "Unit\xE1rio"), /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-2/12 text-right" }, "Subtotal"), !isReadOnly2 && /* @__PURE__ */ React.createElement("th", { className: "py-3 px-4 w-[60px] text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, itens.map((item, index) => {
      const subtotal = item.quantidade * item.preco_unitario || 0;
      const prodObj = produtos.find((p) => p.id === item.produto_id);
      return /* @__PURE__ */ React.createElement("tr", { key: item.id, className: "group hover:bg-slate-50/80 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 relative", style: { overflow: "visible" } }, isReadOnly2 ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-900 text-sm block" }, prodObj?.nome || "Produto n\xE3o encontrado"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500 font-normal mt-0.5 block" }, prodObj?.fabricante ? `Fabricante: ${prodObj.fabricante}` : "-")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "w-full rounded-xl bg-white border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold transition-all",
          placeholder: "Digite para buscar produto...",
          value: item.searchTerm !== void 0 ? item.searchTerm : prodObj?.nome || "",
          onChange: (e) => {
            const val = e.target.value;
            handleItemChange(index, { searchTerm: val, showDropdown: true, highlightedIndex: 0 });
          },
          onFocus: () => {
            const currentVal = item.searchTerm !== void 0 ? item.searchTerm : prodObj?.nome || "";
            handleItemChange(index, { searchTerm: currentVal, showDropdown: true, highlightedIndex: 0 });
          },
          onKeyDown: (e) => {
            const searchVal = item.searchTerm !== void 0 ? item.searchTerm : prodObj?.nome || "";
            const filtrados = produtos.filter(
              (p) => (p.nome || "").toLowerCase().includes(searchVal.toLowerCase()) || (p.fabricante || "").toLowerCase().includes(searchVal.toLowerCase())
            );
            if (!item.showDropdown || filtrados.length === 0) return;
            const currentIdx = item.highlightedIndex || 0;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const nextIdx = (currentIdx + 1) % filtrados.length;
              handleItemChange(index, { highlightedIndex: nextIdx });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const prevIdx = (currentIdx - 1 + filtrados.length) % filtrados.length;
              handleItemChange(index, { highlightedIndex: prevIdx });
            } else if (e.key === "Enter") {
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
            } else if (e.key === "Escape") {
              handleItemChange(index, { showDropdown: false });
            }
          }
        }
      ), item.showDropdown && /* @__PURE__ */ React.createElement("div", { className: "absolute left-4 right-4 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 z-[9999] max-h-48 overflow-y-auto divide-y divide-slate-100" }, (() => {
        const searchVal = item.searchTerm !== void 0 ? item.searchTerm : prodObj?.nome || "";
        const filtrados = produtos.filter(
          (p) => (p.nome || "").toLowerCase().includes(searchVal.toLowerCase()) || (p.fabricante || "").toLowerCase().includes(searchVal.toLowerCase())
        );
        if (filtrados.length === 0) {
          return /* @__PURE__ */ React.createElement("div", { className: "p-3 text-xs text-slate-400 text-center font-medium" }, "Nenhum produto encontrado");
        }
        return filtrados.map((p, idx) => /* @__PURE__ */ React.createElement(
          "div",
          {
            key: p.id,
            onMouseDown: (e) => {
              e.preventDefault();
              handleItemChange(index, {
                produto_id: p.id,
                preco_unitario: p.preco_base || 0,
                searchTerm: p.nome,
                showDropdown: false
              });
            },
            className: `p-2.5 text-xs cursor-pointer flex justify-between items-center transition-colors ${(item.highlightedIndex || 0) === idx ? "bg-indigo-50/80 text-indigo-900 font-bold" : "hover:bg-slate-50 text-slate-700 font-medium"}`
          },
          /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "font-bold block text-slate-800" }, p.nome), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400" }, p.fabricante || "Fabricante n\xE3o informado")),
          /* @__PURE__ */ React.createElement("span", { className: "font-mono text-xs text-indigo-600 font-bold" }, "R$ ", Number(p.preco_base || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }))
        ));
      })()))), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4" }, isReadOnly2 ? /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-slate-700" }, distribuidores.find((d) => d.id === item.distribuidor_id)?.nome || "-") : /* @__PURE__ */ React.createElement(
        "select",
        {
          className: "w-full rounded-xl bg-white border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium cursor-pointer",
          value: item.distribuidor_id || "",
          onChange: (e) => handleItemChange(index, "distribuidor_id", e.target.value)
        },
        distribuidores.length === 0 ? /* @__PURE__ */ React.createElement("option", { value: "" }, "Nenhum distribuidor cadastrado") : distribuidores.map((d) => /* @__PURE__ */ React.createElement("option", { key: d.id, value: d.id }, d.nome))
      )), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-center" }, isReadOnly2 ? /* @__PURE__ */ React.createElement("span", { className: "text-xs font-black text-slate-800" }, item.quantidade) : /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "number",
          min: "1",
          className: "w-16 mx-auto rounded-xl bg-white border border-slate-200 p-2 text-xs text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold",
          value: item.quantidade,
          onChange: (e) => handleItemChange(index, "quantidade", e.target.value)
        }
      )), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-right whitespace-nowrap" }, isReadOnly2 ? /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-700 font-bold" }, "R$ ", Number(item.preco_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("span", { className: "absolute left-2.5 top-2.5 text-[11px] font-bold text-slate-400" }, "R$"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "w-full rounded-xl bg-white border border-slate-200 p-2 pl-8 text-xs text-right text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono font-bold",
          value: formatMaskedCurrency(item.preco_unitario),
          onChange: (e) => handleCurrencyInputChange(index, e.target.value)
        }
      ))), /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-right font-black text-slate-900 text-xs whitespace-nowrap tabular-nums" }, "R$ ", subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), !isReadOnly2 && /* @__PURE__ */ React.createElement("td", { className: "py-3.5 px-4 text-center" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleRemoveItem(index),
          className: "p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer",
          title: "Remover Item"
        },
        /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }))
      )));
    })))), !isReadOnly2 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleAddItem,
        className: "w-full py-3 border border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl text-xs font-bold text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50/40 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M12 4v16m8-8H4" })),
      /* @__PURE__ */ React.createElement("span", null, "Adicionar Item \xE0 Proposta")
    )), /* @__PURE__ */ React.createElement("div", { className: "border-t border-slate-200/80 bg-white px-7 py-4.5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 bg-indigo-50/80 rounded-2xl flex items-center justify-center border border-indigo-100 text-indigo-600 shadow-2xs" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block" }, "RESUMO COMERCIAL"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-600 font-bold mt-0.5" }, "C\xE1lculo ativo com base em ", itens.length, " ", itens.length === 1 ? "item" : "itens", "."))), /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl px-7 py-4.5 text-right shadow-lg shadow-indigo-950/20 min-w-[280px] border border-indigo-800/40" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest mb-0.5" }, "TOTAL DA PROPOSTA"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums" }, "R$ ", realTimeGrandTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))))));
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
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex flex-col bg-slate-50 text-slate-800" }, /* @__PURE__ */ React.createElement("header", { className: "h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between z-10" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement("div", { className: "bg-indigo-600 p-2 rounded-lg" }, /* @__PURE__ */ React.createElement("svg", { className: "w-6 h-6 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("h1", { className: "text-lg font-bold text-slate-900 tracking-wide" }, "Suprim\xE1tica CRM"), activeTab === "propostas" && projectContext.name && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-indigo-300 font-bold bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-500/20", title: projectContext.name }, projectContext.name)), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 font-medium" }, "Gerador de Propostas"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-4" }, activeTab === "propostas" && /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-end space-y-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center bg-slate-100/50 border border-slate-200 rounded-lg px-3 py-1 space-x-2 h-9" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500 font-semibold uppercase" }, "Proposta:"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "bg-transparent border-0 p-0 text-sm text-slate-800 font-bold focus:ring-0 focus:outline-none w-48",
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
  )), searching && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-indigo-400 font-medium animate-pulse" }, "\u{1F50D} Buscando Proposta..."), searchResult && !searching && /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold ${searchResult.includes("\u{1F7E2}") ? "text-emerald-400" : "text-red-400"}` }, searchResult)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: `w-2 h-2 rounded-full ${dbConnected ? "bg-emerald-500" : "bg-red-500"}` }), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500 hidden sm:inline" }, dbConnected ? "Supabase Ativo" : "Supabase Offline")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 pl-2 border-l border-slate-200" }, userProfile && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60 select-none",
      title: `Conectado ao ClickUp como ${userProfile.username || userProfile.email}`
    },
    userProfile.profilePicture ? /* @__PURE__ */ React.createElement("img", { src: userProfile.profilePicture, alt: "User Avatar", className: "w-5 h-5 rounded-full object-cover border border-slate-200" }) : /* @__PURE__ */ React.createElement("div", { className: "w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[9px] font-black" }, (userProfile.username || userProfile.email || "U").substring(0, 2).toUpperCase()),
    /* @__PURE__ */ React.createElement("span", { className: "text-xs font-semibold text-slate-700 truncate max-w-[120px]" }, userProfile.username || userProfile.email)
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowSettingsModal(true),
      className: "p-2 text-slate-500 hover:text-white bg-slate-100 hover:bg-slate-700 rounded-lg transition-colors",
      title: "Configura\xE7\xF5es de Conex\xE3o"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }), /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0" }))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: async () => {
        if (supabaseClient) {
          await supabaseClient.auth.signOut();
          localStorage.removeItem("crm_user_clickup_token");
          localStorage.removeItem("crm_user_profile");
          setUserClickUpToken("");
          setUserProfile(null);
          setSession(null);
          showToast("Sess\xE3o encerrada com sucesso.", "success");
        }
      },
      className: "p-2 text-red-400 hover:text-red-300 bg-slate-100 hover:bg-slate-700 rounded-lg transition-colors",
      title: "Sair / Logout"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" }))
  ))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end bg-slate-50 px-6 pt-4 pb-2 z-10" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-100 p-1 rounded-lg flex gap-1 shadow-sm" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setActiveTab("relatorios"),
      className: `font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${activeTab === "relatorios" ? "bg-slate-900 text-white shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"}`
    },
    "Relat\xF3rios"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setActiveTab("kanban"),
      className: `font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${activeTab === "kanban" ? "bg-slate-900 text-white shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"}`
    },
    "Pipeline de Vendas"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setActiveTab("tasks"),
      className: `font-medium px-4 py-2 text-xs rounded-md transition-all cursor-pointer ${activeTab === "tasks" ? "bg-slate-900 text-white shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"}`
    },
    "Tarefas Comerciais"
  ))), errorMsg && /* @__PURE__ */ React.createElement("div", { className: "fixed top-20 right-6 z-50 bg-red-950/90 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md animate-bounce" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5 text-red-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" })), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium" }, errorMsg)), successMsg && /* @__PURE__ */ React.createElement("div", { className: "fixed top-20 right-6 z-50 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-4 py-3 rounded-xl flex items-center space-x-2 shadow-2xl backdrop-blur-md" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5 text-emerald-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium" }, successMsg)), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-y-auto" }, activeTab === "relatorios" && /* @__PURE__ */ React.createElement("main", { className: "flex-1 flex flex-col bg-slate-50 p-6 space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center md:justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-bold text-slate-900 tracking-tight" }, "Relat\xF3rios"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 font-medium" }, "Distribui\xE7\xE3o de faturamento acumulado por distribuidor e fabricante.")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-3 bg-white backdrop-blur-md border border-slate-200/80 rounded-2xl p-2.5 shadow-lg" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-800 uppercase tracking-wider" }, "In\xEDcio"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: startDate,
      onChange: (e) => setStartDate(e.target.value),
      className: "bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-800 uppercase tracking-wider" }, "Fim"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: endDate,
      onChange: (e) => setEndDate(e.target.value),
      className: "bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-800 uppercase tracking-wider" }, "In\xEDcio Comp."), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: compareStartDate,
      onChange: (e) => setCompareStartDate(e.target.value),
      className: "bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-bold text-slate-800 uppercase tracking-wider" }, "Fim Comp."), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: compareEndDate,
      onChange: (e) => setCompareEndDate(e.target.value),
      className: "bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer hover:border-slate-600 transition-colors shadow-inner"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => loadDashboardData(),
      disabled: loadingDashboard,
      className: "px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-950/30 active:scale-95 cursor-pointer"
    },
    loadingDashboard ? "..." : "Filtrar"
  ))), /* @__PURE__ */ React.createElement("div", { className: "p-2 px-3 rounded-lg bg-white border border-slate-200/80 flex items-center space-x-2 text-[11px] text-slate-800" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-slate-800 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("span", { className: "leading-none" }, /* @__PURE__ */ React.createElement("strong", { className: "text-slate-900 font-bold" }, "Nota de Integridade:"), " Os totais deste painel refletem os itens detalhados no ", /* @__PURE__ */ React.createElement("strong", { className: "text-indigo-600 font-semibold" }, "Supabase"), ". O tabuleiro Kanban reflete o faturamento total das oportunidades no ", /* @__PURE__ */ React.createElement("strong", { className: "text-indigo-600 font-semibold" }, "ClickUp"), ".")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200 shadow-sm shadow-slate-100/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-6 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wider mb-1" }, "Resumo Sazonal de Vendas"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Evolu\xE7\xE3o temporal e intelig\xEAncia sazonal de neg\xF3cios ganhos")), /* @__PURE__ */ React.createElement("span", { className: "bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-emerald-500 animate-pulse" }), "Vis\xE3o Anual")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500 font-semibold mb-1 truncate" }, "Neg\xF3cios Ganhos"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline justify-between mt-1 flex-wrap gap-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-2xl font-extrabold text-slate-900" }, biMetrics?.wonCount || 0), compareStartDate && compareEndDate && biMetrics?.wonQtyDiff !== null && biMetrics?.wonQtyDiff !== void 0 && /* @__PURE__ */ React.createElement("span", { className: `font-bold text-[10px] px-1.5 py-0.5 rounded-full ${biMetrics.wonQtyDiff >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}` }, biMetrics.wonQtyDiff >= 0 ? `+${biMetrics.wonQtyDiff}` : biMetrics.wonQtyDiff))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500 font-semibold mb-1 truncate" }, "Valor em Vendas"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline justify-between mt-1 flex-wrap gap-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-base font-bold text-slate-900 truncate" }, "R$ ", (biMetrics?.wonValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })), compareStartDate && compareEndDate && biMetrics?.wonValDiff !== null && biMetrics?.wonValDiff !== void 0 && /* @__PURE__ */ React.createElement("span", { className: `font-bold text-[10px] px-1.5 py-0.5 rounded-full ${biMetrics.wonValDiff >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}` }, biMetrics.wonValDiff >= 0 ? `+R$ ${(biMetrics.wonValDiff / 1e3).toFixed(0)}k` : `-R$ ${(Math.abs(biMetrics.wonValDiff) / 1e3).toFixed(0)}k`))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500 font-semibold mb-1 truncate" }, "Ciclo M\xE9dio"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline justify-between mt-1 flex-wrap gap-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-lg font-bold text-slate-900" }, biMetrics?.avgCycleDays || 0, " dias"), compareStartDate && compareEndDate && biMetrics?.avgCycleDaysDiff !== null && biMetrics?.avgCycleDaysDiff !== void 0 && /* @__PURE__ */ React.createElement("span", { className: `font-bold text-[10px] px-1.5 py-0.5 rounded-full ${biMetrics.avgCycleDaysDiff <= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}` }, biMetrics.avgCycleDaysDiff <= 0 ? `${biMetrics.avgCycleDaysDiff}d` : `+${biMetrics.avgCycleDaysDiff}d`))), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500 font-semibold mb-1 truncate" }, "Ticket M\xE9dio"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline justify-between mt-1 flex-wrap gap-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-base font-bold text-slate-900 truncate" }, "R$ ", (biMetrics?.ticketMedio || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })), compareStartDate && compareEndDate && biMetrics?.ticketMedioDiff !== null && biMetrics?.ticketMedioDiff !== void 0 && /* @__PURE__ */ React.createElement("span", { className: `font-bold text-[10px] px-1.5 py-0.5 rounded-full ${biMetrics.ticketMedioDiff >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}` }, biMetrics.ticketMedioDiff >= 0 ? `+R$ ${(biMetrics.ticketMedioDiff / 1e3).toFixed(0)}k` : `-R$ ${(Math.abs(biMetrics.ticketMedioDiff) / 1e3).toFixed(0)}k`))), /* @__PURE__ */ React.createElement("div", { className: "bg-rose-50/50 border border-rose-200/80 rounded-xl p-3.5 flex flex-col justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-rose-700 font-semibold mb-1 truncate" }, "Neg\xF3cios Perdidos"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline justify-between mt-1 flex-wrap gap-1" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-xl font-extrabold text-rose-950" }, biMetrics?.lostCount || 0), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-medium text-rose-700/80 ml-1" }, "(R$ ", (biMetrics?.lostValue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }), ")")), compareStartDate && compareEndDate && biMetrics?.lostValDiff !== null && biMetrics?.lostValDiff !== void 0 && /* @__PURE__ */ React.createElement("span", { className: `font-bold text-[10px] px-1.5 py-0.5 rounded-full ${biMetrics.lostValDiff <= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}` }, biMetrics.lostValDiff <= 0 ? "\u25BC" : "\u25B2"))), /* @__PURE__ */ React.createElement("div", { className: "bg-indigo-50/50 border border-indigo-200/80 rounded-xl p-3.5 flex flex-col justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-indigo-700 font-semibold mb-1 truncate" }, "Taxa Convers\xE3o"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline justify-between mt-1 flex-wrap gap-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-xl font-extrabold text-indigo-950" }, (biMetrics?.convRate || 0).toFixed(1), "%"), compareStartDate && compareEndDate && biMetrics?.convRateDiff !== null && biMetrics?.convRateDiff !== void 0 && /* @__PURE__ */ React.createElement("span", { className: `font-bold text-[10px] px-1.5 py-0.5 rounded-full ${biMetrics.convRateDiff >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}` }, biMetrics.convRateDiff >= 0 ? `+${biMetrics.convRateDiff.toFixed(1)}pp` : `${biMetrics.convRateDiff.toFixed(1)}pp`)))), /* @__PURE__ */ React.createElement("div", { className: "h-64 w-full pt-2" }, /* @__PURE__ */ React.createElement("canvas", { ref: seasonalityCanvasRef })), /* @__PURE__ */ React.createElement("div", { className: "mt-4 pt-3 border-t border-slate-100 flex justify-end" }, /* @__PURE__ */ React.createElement("button", { className: "text-indigo-600 font-bold hover:text-indigo-800 text-xs flex items-center gap-1 transition-colors cursor-pointer" }, /* @__PURE__ */ React.createElement("span", null, "Ver lista completa"), /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5l7 7-7 7" }))))), loadingDashboard ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-3 py-20" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 font-medium" }, "Carregando dados consolidados...")) : !commercialData || commercialData.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 border border-dashed border-slate-200 rounded-2xl p-16 text-center flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto my-10 bg-slate-50/50" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-white rounded-full flex items-center justify-center text-3xl" }, "\u{1F4CA}"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-bold text-slate-900" }, "Nenhum dado encontrado"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-2" }, "N\xE3o existem itens de propostas criadas no per\xEDodo de ", (/* @__PURE__ */ new Date(startDate + "T00:00:00")).toLocaleDateString("pt-BR"), " a ", (/* @__PURE__ */ new Date(endDate + "T00:00:00")).toLocaleDateString("pt-BR"), "."))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-6 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wider mb-1" }, "Distribui\xE7\xE3o por Distribuidor"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Faturamento total acumulado agrupado por Distribuidor")), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedDistributorFilter,
      onChange: (e) => setSelectedDistributorFilter(e.target.value),
      className: "appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
    },
    /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todos"),
    Array.from(new Set(
      commercialData.map((item) => item.distribuidores?.nome).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b)).map((dist) => /* @__PURE__ */ React.createElement("option", { key: dist, value: dist }, dist))
  ), /* @__PURE__ */ React.createElement("div", { className: "absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }))))), /* @__PURE__ */ React.createElement("div", { className: "relative h-64 w-full flex items-center justify-center" }, /* @__PURE__ */ React.createElement("canvas", { ref: distributorCanvasRef }), /* @__PURE__ */ React.createElement("div", { className: "absolute flex flex-col items-center justify-center text-center pointer-events-none" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, "Total"), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-slate-900" }, formatValueCompact(distributorTotalSum)))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-200/80 max-h-40 overflow-y-auto pr-2" }, Object.keys(distributorTotals).map((label, idx) => {
    const val = distributorTotals[label];
    const percent = distributorTotalSum > 0 ? Math.round(val / distributorTotalSum * 100) : 0;
    const color = chartColors[idx % chartColors.length];
    return /* @__PURE__ */ React.createElement("div", { key: label, className: "flex items-center justify-between text-xs py-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 truncate mr-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-2.5 h-2.5 rounded-full shrink-0", style: { backgroundColor: color } }), /* @__PURE__ */ React.createElement("span", { className: "text-slate-800 truncate" }, label)), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-700" }, percent, "%"));
  }))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-6 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wider mb-1" }, "Distribui\xE7\xE3o por Fabricante"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Faturamento total acumulado agrupado por Fabricante")), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedManufacturerFilter,
      onChange: (e) => setSelectedManufacturerFilter(e.target.value),
      className: "appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
    },
    /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todos"),
    Array.from(new Set(
      commercialData.map((item) => item.produtos?.fabricante).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b)).map((fab) => /* @__PURE__ */ React.createElement("option", { key: fab, value: fab }, fab))
  ), /* @__PURE__ */ React.createElement("div", { className: "absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }))))), /* @__PURE__ */ React.createElement("div", { className: "relative h-64 w-full flex items-center justify-center" }, /* @__PURE__ */ React.createElement("canvas", { ref: manufacturerCanvasRef }), /* @__PURE__ */ React.createElement("div", { className: "absolute flex flex-col items-center justify-center text-center pointer-events-none" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, "Total"), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-slate-900" }, formatValueCompact(manufacturerTotalSum)))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-200/80 max-h-40 overflow-y-auto pr-2" }, Object.keys(manufacturerTotals).map((label, idx) => {
    const val = manufacturerTotals[label];
    const percent = manufacturerTotalSum > 0 ? Math.round(val / manufacturerTotalSum * 100) : 0;
    const color = chartColors[idx % chartColors.length];
    return /* @__PURE__ */ React.createElement("div", { key: label, className: "flex items-center justify-between text-xs py-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 truncate mr-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-2.5 h-2.5 rounded-full shrink-0", style: { backgroundColor: color } }), /* @__PURE__ */ React.createElement("span", { className: "text-slate-800 truncate" }, label)), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-slate-700" }, percent, "%"));
  })))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-6 flex flex-col transition-all duration-300 hover:border-slate-200 shadow-sm shadow-slate-100/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-6 flex-wrap gap-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-700 uppercase tracking-wider mb-1" }, "Produtos Mais Vendidos"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Participa\xE7\xE3o por categoria de solu\xE7\xE3o comercial")), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: topProductsFilterMode,
      onChange: (e) => setTopProductsFilterMode(e.target.value),
      className: "appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold shadow-inner"
    },
    /* @__PURE__ */ React.createElement("option", { value: "value" }, "Por valor"),
    /* @__PURE__ */ React.createElement("option", { value: "qty" }, "Por quantidade")
  ), /* @__PURE__ */ React.createElement("div", { className: "absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }))))), topProductsAggregated.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold text-slate-500" }, "Nenhum produto vendido em propostas ganhas no per\xEDodo selecionado.")) : /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-12 gap-6 items-center" }, /* @__PURE__ */ React.createElement("div", { className: "md:col-span-7 space-y-2.5 max-h-64 overflow-y-auto pr-2" }, topProductsAggregated.map((prod) => /* @__PURE__ */ React.createElement("div", { key: prod.name, className: "flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition-colors border border-slate-200/60" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2.5 truncate mr-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-3 h-3 rounded shrink-0 shadow-sm", style: { backgroundColor: prod.color } }), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-slate-800 uppercase tracking-wide truncate" }, prod.name)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3 text-xs shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-500 font-medium" }, topProductsFilterMode === "value" ? `R$ ${prod.val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${prod.qty} un.`), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs" }, prod.pctStr))))), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-5 relative h-64 w-full flex items-center justify-center" }, /* @__PURE__ */ React.createElement("canvas", { ref: topProductsCanvasRef }), /* @__PURE__ */ React.createElement("div", { className: "absolute flex flex-col items-center justify-center text-center pointer-events-none" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, "Categorias"), /* @__PURE__ */ React.createElement("span", { className: "text-xl font-black text-slate-900" }, topProductsAggregated.length, " Ativas"))))))), activeTab === "kanban" && /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col bg-slate-50 min-h-0 overflow-hidden" }, loadingKanban ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col items-center justify-center space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-slate-500 font-medium" }, "Carregando oportunidades do ClickUp...")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center justify-between px-6 py-3 bg-white border-b border-slate-200/80 flex-shrink-0 space-y-3 md:space-y-0 shadow-sm shadow-slate-100/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3 flex-wrap gap-y-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-500" }, "Exibir Est\xE1gios:"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowGanhoCol(!showGanhoCol),
      className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${showGanhoCol ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-white border-slate-200 text-slate-500 hover:border-slate-200"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F3C6} Ganho")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowPerdidoCol(!showPerdidoCol),
      className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${showPerdidoCol ? "bg-rose-500/20 border-rose-500/50 text-rose-400" : "bg-white border-slate-200 text-slate-500 hover:border-slate-200"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F61E} Perdido")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowCongeladoCol(!showCongeladoCol),
      className: `px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${showCongeladoCol ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "bg-white border-slate-200 text-slate-500 hover:border-slate-200"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u2744\uFE0F Congelado")
  ), /* @__PURE__ */ React.createElement("div", { className: "relative flex items-center ml-1" }, !isSearchOpen ? /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setIsSearchOpen(true),
      className: "p-1.5 bg-white border border-slate-200 hover:border-indigo-400 text-slate-600 hover:text-indigo-600 rounded-full transition-all shadow-sm flex items-center justify-center cursor-pointer",
      title: "Buscar neg\xF3cio por nome..."
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" }))
  ) : /* @__PURE__ */ React.createElement("div", { className: "flex items-center bg-white border border-indigo-500 rounded-full px-3 py-1 shadow-sm transition-all duration-300 w-64" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-indigo-500 mr-2 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" })), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      autoFocus: true,
      value: kanbanSearchTerm,
      onChange: (e) => setKanbanSearchTerm(e.target.value),
      placeholder: "Buscar neg\xF3cio por nome...",
      className: "bg-transparent border-none text-xs text-slate-800 focus:outline-none w-full font-medium"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        setKanbanSearchTerm("");
        setIsSearchOpen(false);
      },
      className: "text-slate-400 hover:text-slate-600 text-xs font-bold ml-1 cursor-pointer"
    },
    "\u2715"
  )))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-500" }, "Ordenar por:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: sortBy,
      onChange: (e) => {
        const newValue = e.target.value;
        localStorage.setItem("crm_sort_order", newValue);
        setSortBy(newValue);
      },
      className: "rounded-xl bg-white border border-slate-200 p-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
      className: `mr-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showForecast ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-700"}`
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
      getOpportunityValue,
      onCardClick: handleCardClick
    }
  ), !(showForecast && filterStage) && /* @__PURE__ */ React.createElement("div", { className: "kanban-board flex-1 min-h-0 overflow-x-auto" }, kanbanColumns.map((col) => {
    if (filterStage && col.id !== filterStage) return null;
    const colName = col.name.toLowerCase();
    if (colName.includes("ganho") && !showGanhoCol) return null;
    if (colName.includes("perdido") && !showPerdidoCol) return null;
    if (colName.includes("congelado") && !showCongeladoCol) return null;
    const tasksInCol = kanbanTasks.filter((t) => {
      const inCol = getTaskOptionId(t, kanbanColumns) === col.id;
      if (!inCol) return false;
      if (!kanbanSearchTerm.trim()) return true;
      const term = kanbanSearchTerm.toLowerCase().trim();
      const nameMatch = (t.name || "").toLowerCase().includes(term);
      const customFieldsStr = (t.custom_fields || []).map((f) => String(f.value || "")).join(" ").toLowerCase();
      return nameMatch || customFieldsStr.includes(term);
    });
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
    return /* @__PURE__ */ React.createElement("div", { key: col.id, className: "kanban-column" }, /* @__PURE__ */ React.createElement("div", { className: "kanban-column-header" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-3 h-3 rounded-full", style: { backgroundColor: col.color || "#fff" } }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-slate-800 uppercase tracking-wider" }, col.name)), /* @__PURE__ */ React.createElement("span", { className: "bg-slate-100 px-2 py-0.5 rounded-full text-xs font-bold text-slate-500" }, tasksInCol.length)), /* @__PURE__ */ React.createElement(
      "div",
      {
        "data-option-id": col.id,
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => handleDrop(e, col.id),
        className: "kanban-cards"
      },
      sortedTasks.map((task) => {
        const dealValue = getOpportunityValue(task);
        const formattedValue = dealValue !== null && dealValue !== void 0 ? `R$ ${Number(dealValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";
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
  })))), activeTab === "tasks" && (() => {
    const now = /* @__PURE__ */ new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayStr = startOfToday.toDateString();
    const isTaskOverdue = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const hasExplicitTime = dateStr.includes("T") && !dateStr.endsWith("T00:00:00") && !dateStr.endsWith("T00:00:00.000Z");
      if (hasExplicitTime) return d < now;
      return d < startOfToday;
    };
    const filtered = commercialTasks.filter((task) => {
      if (tasksFilterAssignee !== "all" && String(task.responsavel_clickup_id) !== tasksFilterAssignee) return false;
      if (!tasksShowCompleted && task.status === "concluida") return false;
      if (tasksPeriodFilter !== "all") {
        const taskDate = task.data_vencimento ? new Date(task.data_vencimento) : null;
        if (!taskDate || isNaN(taskDate.getTime())) return false;
        if (tasksPeriodFilter === "today") {
          if (taskDate.toDateString() !== todayStr) return false;
        } else if (tasksPeriodFilter === "overdue") {
          if (task.status === "concluida" || !isTaskOverdue(task.data_vencimento)) return false;
        } else if (tasksPeriodFilter === "week") {
          const dayOfWeek = startOfToday.getDay();
          const startOfWeek = new Date(startOfToday);
          startOfWeek.setDate(startOfToday.getDate() - dayOfWeek);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          if (taskDate < startOfWeek || taskDate > endOfWeek) return false;
        } else if (tasksPeriodFilter === "month") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          if (taskDate < startOfMonth || taskDate > endOfMonth) return false;
        } else if (tasksPeriodFilter === "custom") {
          if (tasksCustomStartDate) {
            const s = /* @__PURE__ */ new Date(`${tasksCustomStartDate}T00:00:00`);
            if (taskDate < s) return false;
          }
          if (tasksCustomEndDate) {
            const e = /* @__PURE__ */ new Date(`${tasksCustomEndDate}T23:59:59.999`);
            if (taskDate > e) return false;
          }
        }
      }
      return true;
    });
    const overdueItems = filtered.filter((t) => t.status !== "concluida" && isTaskOverdue(t.data_vencimento));
    const todayItems = filtered.filter((t) => t.status !== "concluida" && new Date(t.data_vencimento).toDateString() === todayStr && !isTaskOverdue(t.data_vencimento));
    const pendingItems = filtered.filter((t) => t.status !== "concluida");
    const doneItems = filtered.filter((t) => t.status === "concluida");
    const getTaskNegocio = (task) => {
      const localProps = typeof propostas !== "undefined" && Array.isArray(propostas) ? propostas : [];
      let matchedProp = localProps.find(
        (p) => task.proposta_id && p.id === task.proposta_id || task.clickup_negocio_id && p.clickup_negocio_id === task.clickup_negocio_id
      );
      if (matchedProp) return matchedProp.nome_projeto || matchedProp.projeto || "Projeto";
      const activeKanbanCards = (typeof kanbanTasks !== "undefined" ? kanbanTasks : null) || [];
      const matchedKanbanCard = Array.isArray(activeKanbanCards) && activeKanbanCards.find(
        (c) => c.id === task.clickup_negocio_id || c.clickup_id === task.clickup_negocio_id
      );
      if (matchedKanbanCard) return matchedKanbanCard.name || matchedKanbanCard.nome || "Projeto";
      if (task.nome_projeto && task.nome_projeto !== "Sem Proposta") return task.nome_projeto;
      const propObj = Array.isArray(task.propostas) ? task.propostas[0] : task.propostas;
      return propObj?.nome_projeto || task.proposta?.nome_projeto || "Sem Projeto";
    };
    const typeConfig = {
      "Liga\xE7\xE3o": { dot: "bg-indigo-500", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", icon: "\u{1F4DE}" },
      "Reuni\xE3o": { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: "\u{1F91D}" },
      "E-mail": { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "\u2709\uFE0F" },
      "Follow-up": { dot: "bg-rose-500", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: "\u{1F504}" },
      "Visita": { dot: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", icon: "\u{1F4CD}" },
      "Proposta": { dot: "bg-sky-500", bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", icon: "\u{1F4C4}" }
    };
    const formatTaskDate = (dateStr) => {
      const d = new Date(dateStr);
      const dStr = d.toDateString();
      const diffMs = d - now;
      const diffDays = Math.round(diffMs / (1e3 * 60 * 60 * 24));
      if (dStr === todayStr) return { label: "Hoje " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), urgent: "today" };
      if (diffDays < 0) return { label: `Venceu h\xE1 ${Math.abs(diffDays)}d`, urgent: "overdue" };
      if (diffDays === 1) return { label: "Amanh\xE3", urgent: "soon" };
      if (diffDays <= 3) return { label: `Em ${diffDays} dias`, urgent: "soon" };
      return { label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }), urgent: "normal" };
    };
    const TaskCard = ({ task }) => {
      const isDone = task.status === "concluida";
      const tc = typeConfig[task.tipo] || { dot: "bg-slate-400", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", icon: "\u{1F4CC}" };
      const matchedUser = vendedores.find((v) => String(v.id) === String(task.responsavel_clickup_id));
      const assigneeName = matchedUser ? matchedUser.nome : "\u2014";
      const initials = assigneeName !== "\u2014" ? assigneeName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";
      const negocio = getTaskNegocio(task);
      const { label: dateLabel, urgent } = formatTaskDate(task.data_vencimento);
      const urgencyConfig = {
        overdue: { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
        today: { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
        soon: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
        normal: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-200" }
      };
      const uc = urgencyConfig[urgent] || urgencyConfig.normal;
      return /* @__PURE__ */ React.createElement("div", { className: `group relative bg-white rounded-xl border transition-all duration-200 hover:shadow-md ${isDone ? "opacity-60 border-slate-200" : "border-slate-200/80 hover:border-indigo-200/80"}` }, !isDone && /* @__PURE__ */ React.createElement("div", { className: `absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${urgent === "overdue" ? "bg-rose-500" : urgent === "today" ? "bg-amber-400" : urgent === "soon" ? "bg-sky-400" : "bg-slate-200"}` }), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 p-4 pl-5" }, /* @__PURE__ */ React.createElement("div", { className: "flex-shrink-0" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          checked: isDone,
          onChange: () => toggleTaskStatus(task),
          className: "w-4.5 h-4.5 rounded-full border-2 border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: `text-sm font-bold leading-snug truncate ${isDone ? "line-through text-slate-400" : "text-slate-900"}` }, task.titulo), negocio && negocio !== "Sem Projeto" && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400 font-medium mt-0.5 truncate flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" })), negocio)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: `inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tc.bg} ${tc.text} ${tc.border}` }, /* @__PURE__ */ React.createElement("span", null, tc.icon), /* @__PURE__ */ React.createElement("span", null, task.tipo)), /* @__PURE__ */ React.createElement("span", { className: `inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${uc.bg} ${uc.text}` }, urgent === "overdue" && /* @__PURE__ */ React.createElement("svg", { className: "w-2.5 h-2.5", fill: "currentColor", viewBox: "0 0 20 20" }, /* @__PURE__ */ React.createElement("path", { fillRule: "evenodd", d: "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z", clipRule: "evenodd" })), urgent === "today" && /* @__PURE__ */ React.createElement("svg", { className: "w-2.5 h-2.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" })), dateLabel), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5", title: assigneeName }, /* @__PURE__ */ React.createElement("div", { className: "w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-[9px] font-extrabold flex-shrink-0 shadow-sm" }, initials)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleEditTaskClick(task),
          className: "p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer",
          title: "Editar"
        },
        /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" }))
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => handleDeleteTask(task.id),
          className: "p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer",
          title: "Excluir"
        },
        /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }))
      )))))));
    };
    return /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col bg-slate-50/80 overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 pt-6 pb-4 bg-white border-b border-slate-200/80" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "text-xl font-extrabold text-slate-900 tracking-tight" }, "Tarefas"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mt-0.5" }, "Atividades integradas ao ClickUp")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-slate-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" })), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: tasksPeriodFilter,
        onChange: (e) => setTasksPeriodFilter(e.target.value),
        className: "bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
      },
      /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todas as Datas"),
      /* @__PURE__ */ React.createElement("option", { value: "today" }, "Hoje"),
      /* @__PURE__ */ React.createElement("option", { value: "week" }, "Esta Semana"),
      /* @__PURE__ */ React.createElement("option", { value: "month" }, "Este M\xEAs"),
      /* @__PURE__ */ React.createElement("option", { value: "overdue" }, "Apenas Vencidas"),
      /* @__PURE__ */ React.createElement("option", { value: "custom" }, "\u{1F4C5} Per\xEDodo Personalizado")
    )), tasksPeriodFilter === "custom" && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-400" }, "De:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "date",
        value: tasksCustomStartDate,
        onChange: (e) => setTasksCustomStartDate(e.target.value),
        className: "bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none"
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-400" }, "At\xE9:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "date",
        value: tasksCustomEndDate,
        onChange: (e) => setTasksCustomEndDate(e.target.value),
        className: "bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none"
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-slate-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" })), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: tasksFilterAssignee,
        onChange: (e) => setTasksFilterAssignee(e.target.value),
        className: "bg-transparent border-none text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
      },
      /* @__PURE__ */ React.createElement("option", { value: "all" }, "Todos Respons\xE1veis"),
      vendedoresVisiveis.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: String(v.id) }, v.nome))
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setTasksShowCompleted(!tasksShowCompleted),
        className: `px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${tasksShowCompleted ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M5 13l4 4L19 7" })),
      tasksShowCompleted ? "Ocultar Conclu\xEDdas" : "Ver Conclu\xEDdas"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setSelectedProposalForTask(null);
          setSearchProposalQuery("");
          setProposalSearchResults([]);
          setShowNewTaskModal(true);
        },
        className: "px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 cursor-pointer flex items-center gap-1.5"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M12 4v16m8-8H4" })),
      "Nova Tarefa"
    ))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3 mt-5" }, /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest" }, "Pendentes"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-slate-800 mt-0.5" }, pendingItems.length)), /* @__PURE__ */ React.createElement("div", { className: `rounded-xl p-3.5 border ${overdueItems.length > 0 ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200/80"}` }, /* @__PURE__ */ React.createElement("p", { className: `text-[10px] font-bold uppercase tracking-widest ${overdueItems.length > 0 ? "text-rose-500" : "text-slate-400"}` }, "Vencidas"), /* @__PURE__ */ React.createElement("p", { className: `text-2xl font-black mt-0.5 ${overdueItems.length > 0 ? "text-rose-700" : "text-slate-800"}` }, overdueItems.length)), /* @__PURE__ */ React.createElement("div", { className: `rounded-xl p-3.5 border ${todayItems.length > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200/80"}` }, /* @__PURE__ */ React.createElement("p", { className: `text-[10px] font-bold uppercase tracking-widest ${todayItems.length > 0 ? "text-amber-600" : "text-slate-400"}` }, "Para Hoje"), /* @__PURE__ */ React.createElement("p", { className: `text-2xl font-black mt-0.5 ${todayItems.length > 0 ? "text-amber-700" : "text-slate-800"}` }, todayItems.length)), /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest" }, "Conclu\xEDdas"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-slate-800 mt-0.5" }, doneItems.length)))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-6" }, loadingTasks ? /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center h-full space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 font-medium" }, "Carregando tarefas...")) : filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center h-full text-center space-y-4 max-w-sm mx-auto" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("svg", { className: "w-8 h-8 text-slate-300", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-bold text-slate-700" }, "Nenhuma tarefa encontrada"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-400 mt-1" }, "Crie uma nova tarefa para come\xE7ar a registrar atividades comerciais.")), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setSelectedProposalForTask(null);
          setSearchProposalQuery("");
          setProposalSearchResults([]);
          setShowNewTaskModal(true);
        },
        className: "px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
      },
      "+ Criar Primeira Tarefa"
    )) : /* @__PURE__ */ React.createElement("div", { className: "space-y-6 max-w-4xl mx-auto" }, overdueItems.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-rose-500 animate-pulse" }), /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-extrabold text-rose-600 uppercase tracking-widest" }, "Vencidas")), /* @__PURE__ */ React.createElement("span", { className: "bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200" }, overdueItems.length)), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, overdueItems.map((task) => /* @__PURE__ */ React.createElement(TaskCard, { key: task.id, task })))), todayItems.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-amber-400" }), /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-extrabold text-amber-700 uppercase tracking-widest" }, "Hoje")), /* @__PURE__ */ React.createElement("span", { className: "bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200" }, todayItems.length)), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, todayItems.map((task) => /* @__PURE__ */ React.createElement(TaskCard, { key: task.id, task })))), (() => {
      const upcoming = filtered.filter((t) => t.status !== "concluida" && new Date(t.data_vencimento).toDateString() !== todayStr && new Date(t.data_vencimento) >= now);
      if (upcoming.length === 0) return null;
      return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-indigo-400" }), /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-extrabold text-indigo-600 uppercase tracking-widest" }, "Pr\xF3ximas")), /* @__PURE__ */ React.createElement("span", { className: "bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200" }, upcoming.length)), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, upcoming.map((task) => /* @__PURE__ */ React.createElement(TaskCard, { key: task.id, task }))));
    })(), tasksShowCompleted && doneItems.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-emerald-500", fill: "currentColor", viewBox: "0 0 20 20" }, /* @__PURE__ */ React.createElement("path", { fillRule: "evenodd", d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z", clipRule: "evenodd" })), /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-extrabold text-emerald-600 uppercase tracking-widest" }, "Conclu\xEDdas")), /* @__PURE__ */ React.createElement("span", { className: "bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200" }, doneItems.length)), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, doneItems.map((task) => /* @__PURE__ */ React.createElement(TaskCard, { key: task.id, task })))))));
  })()), showSettingsModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-5xl bg-white border border-slate-200/90 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setShowSettingsModal(false),
      className: "absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors z-10 cursor-pointer",
      title: "Fechar (ESC)"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  ), /* @__PURE__ */ React.createElement("div", { className: "border-b border-slate-200/80 px-6 py-4 bg-slate-50/80" }, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-extrabold text-slate-900 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-7 h-7 bg-indigo-500 text-white rounded-lg flex items-center justify-center shadow-xs" }, /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }))), /* @__PURE__ */ React.createElement("span", null, "Painel de Configura\xE7\xF5es e Cadastros"))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex overflow-hidden" }, /* @__PURE__ */ React.createElement("aside", { className: "w-1/4 border-r border-slate-200/80 bg-slate-50/50 p-4 space-y-1.5 flex flex-col" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("products"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${settingsActiveTab === "products" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"}`
    },
    "Cat\xE1logo de Produtos"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("distributors"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${settingsActiveTab === "distributors" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"}`
    },
    "Distribuidores"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("venders"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${settingsActiveTab === "venders" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"}`
    },
    "Vendedores"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSettingsActiveTab("taskTypes"),
      className: `w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${settingsActiveTab === "taskTypes" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"}`
    },
    "Tipos de Tarefas"
  )), /* @__PURE__ */ React.createElement("main", { className: "flex-1 p-6 overflow-y-auto bg-slate-50/30" }, settingsActiveTab === "products" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-slate-900" }, "Cat\xE1logo de Produtos"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 font-medium mt-0.5" }, "Gerencie o portf\xF3lio de ofertas e importe tabelas em lote.")), /* @__PURE__ */ React.createElement("span", { className: "bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold" }, produtos.length, " SKUs")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3" }, editingProduct ? "Editar Produto" : "Cadastrar Novo Produto"), /* @__PURE__ */ React.createElement(
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
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] text-slate-500 font-semibold mb-1" }, "Fabricante"), /* @__PURE__ */ React.createElement(
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
        className: "w-full rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
      }
    )),
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] text-slate-500 font-semibold mb-1" }, "Nome do Produto"), /* @__PURE__ */ React.createElement(
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
        className: "w-full rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
      }
    )),
    /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] text-slate-500 font-semibold mb-1" }, "Custo de Refer\xEAncia"), /* @__PURE__ */ React.createElement(
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
        className: "w-full rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white text-right font-mono"
      }
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs self-end h-[34px] cursor-pointer"
      },
      editingProduct ? "Salvar" : "Cadastrar"
    ), editingProduct && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setEditingProduct(null),
        className: "px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all self-end h-[34px] cursor-pointer"
      },
      "Cancelar"
    ))
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-white border border-slate-200/80 rounded-xl shadow-xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Fabricante"), /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome do Produto"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-right" }, "Pre\xE7o de Refer\xEAncia"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, produtos.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "4", className: "p-6 text-center text-slate-400" }, "Nenhum produto cadastrado.")) : produtos.map((p) => /* @__PURE__ */ React.createElement("tr", { key: p.id, className: "hover:bg-slate-50/80 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-700" }, p.fabricante), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-slate-900 font-medium" }, p.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-right font-mono text-slate-800 font-semibold" }, "R$ ", Number(p.custo_referencia).toLocaleString("pt-BR", { minimumFractionDigits: 2 })), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center space-x-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setEditingProduct(p),
      className: "text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
    },
    "Editar"
  ), /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeleteProduct(p.id),
      className: "text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
    },
    "Excluir"
  ))))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-3" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-600 uppercase tracking-wider" }, "Importa\xE7\xE3o de Produtos em Lote"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] text-slate-500 font-semibold" }, "Formato:"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: importFormat,
      onChange: (e) => setImportFormat(e.target.value),
      className: "bg-slate-50 border border-slate-200 text-[10px] text-slate-700 rounded-lg p-1 focus:outline-none cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("option", { value: "csv" }, "CSV (Fabricante;Nome;Pre\xE7o)"),
    /* @__PURE__ */ React.createElement("option", { value: "xml" }, "XML (<produto>)")
  ))), /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: importText,
      onChange: (e) => setImportText(e.target.value),
      rows: "3",
      className: "w-full rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono",
      placeholder: importFormat === "csv" ? "Dell Technologies;Servidor PowerEdge R760;25000.00\nVMware;Licen\xE7a vSphere Standard;1200.50" : "<produtos>\n  <produto>\n    <fabricante>Dell</fabricante>\n    <nome>Servidor R760</nome>\n    <custo>25000.00</custo>\n  </produto>\n</produtos>"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-500" }, "Cole as linhas ou a estrutura XML no campo de texto e clique em Processar Lote."), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleBatchImport,
      disabled: saving,
      className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("span", null, "Processar Lote")
  ))))), settingsActiveTab === "distributors" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-slate-900" }, "Distribuidores Autorizados"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 font-medium mt-0.5" }, "Lista fechada de distribuidores no CRM.")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3" }, editingDistributor ? "Editar Distribuidor" : "Novo Distribuidor"), /* @__PURE__ */ React.createElement(
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
        className: "flex-1 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
      }
    ),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
      },
      editingDistributor ? "Salvar" : "Adicionar"
    ),
    editingDistributor && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setEditingDistributor(null),
        className: "px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
      },
      "Cancelar"
    )
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-white border border-slate-200/80 rounded-xl shadow-xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, distribuidores.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "2", className: "p-6 text-center text-slate-400" }, "Nenhum distribuidor cadastrado.")) : distribuidores.map((d) => /* @__PURE__ */ React.createElement("tr", { key: d.id, className: "hover:bg-slate-50/80 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-800" }, d.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center space-x-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setEditingDistributor(d),
      className: "text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
    },
    "Editar"
  ), /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeleteDistributor(d.id),
      className: "text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
    },
    "Excluir"
  )))))))), settingsActiveTab === "venders" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-slate-900" }, "Vendedores Cadastrados"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 font-medium mt-0.5" }, "Gerencie a equipe de vendas.")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3" }, editingVendedor ? "Editar Vendedor" : "Novo Vendedor"), /* @__PURE__ */ React.createElement(
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
        className: "flex-1 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
      }
    ),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
      },
      editingVendedor ? "Salvar" : "Adicionar"
    ),
    editingVendedor && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => setEditingVendedor(null),
        className: "px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
      },
      "Cancelar"
    )
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-white border border-slate-200/80 rounded-xl shadow-xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, vendedores.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "2", className: "p-6 text-center text-slate-400" }, "Nenhum vendedor cadastrado.")) : vendedores.map((v) => /* @__PURE__ */ React.createElement("tr", { key: v.id, className: "hover:bg-slate-50/80 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-800" }, v.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center space-x-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleToggleOcultoVendedor(v),
      className: `${v.oculto ? "text-emerald-600 hover:text-emerald-800" : "text-amber-600 hover:text-amber-800"} font-semibold cursor-pointer`,
      title: v.oculto ? "Exibir no CRM" : "Ocultar no CRM"
    },
    v.oculto ? "Exibir" : "Ocultar"
  ), /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setEditingVendedor(v),
      className: "text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
    },
    "Editar"
  ), /* @__PURE__ */ React.createElement("span", { className: "text-slate-300" }, "\u2022"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeleteVendedor(v.id),
      className: "text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
    },
    "Excluir"
  )))))))), settingsActiveTab === "taskTypes" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("h2", { className: "text-base font-bold text-slate-900" }, "Tipos de Tarefas"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 font-medium mt-0.5" }, "Cadastre tipos de atividades personalizadas para a equipe comercial.")), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3" }, "Novo Tipo de Tarefa"), /* @__PURE__ */ React.createElement(
    "form",
    {
      onSubmit: (e) => {
        e.preventDefault();
        if (!newTaskTypeName.trim()) return;
        const novo = {
          id: Date.now().toString(),
          nome: newTaskTypeName.trim(),
          emoji: newTaskTypeEmoji.trim() || "\u{1F4CB}"
        };
        const atualizados = [...taskTypes, novo];
        setTaskTypes(atualizados);
        localStorage.setItem("crm_cache_task_types", JSON.stringify(atualizados));
        setNewTaskTypeName("");
        setNewTaskTypeEmoji("");
        showToast("Tipo de tarefa adicionado!", "success");
      },
      className: "flex gap-2"
    },
    /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        required: true,
        placeholder: "Ex: WhatsApp",
        value: newTaskTypeName,
        onChange: (e) => setNewTaskTypeName(e.target.value),
        className: "flex-1 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
      }
    ),
    /* @__PURE__ */ React.createElement(
      "select",
      {
        value: newTaskTypeEmoji,
        onChange: (e) => setNewTaskTypeEmoji(e.target.value),
        className: "w-36 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "Emoji..."),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F4DE}" }, "\u{1F4DE} Liga\xE7\xE3o"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F465}" }, "\u{1F465} Reuni\xE3o"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F4E7}" }, "\u{1F4E7} E-mail"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F504}" }, "\u{1F504} Follow-up"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F4AC}" }, "\u{1F4AC} WhatsApp"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F680}" }, "\u{1F680} Prospec\xE7\xE3o"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F4DD}" }, "\u{1F4DD} Contrato"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F3AF}" }, "\u{1F3AF} Visita"),
      /* @__PURE__ */ React.createElement("option", { value: "\u{1F91D}" }, "\u{1F91D} Fechamento")
    ),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
      },
      "+ Cadastrar"
    )
  )), /* @__PURE__ */ React.createElement("div", { className: "max-h-60 overflow-y-auto bg-white border border-slate-200/80 rounded-xl shadow-xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse text-xs" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("th", { className: "p-3 w-16 text-center" }, "\xCDcone"), /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Nome"), /* @__PURE__ */ React.createElement("th", { className: "p-3 text-center w-24" }, "A\xE7\xF5es"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-slate-100" }, taskTypes.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "3", className: "p-6 text-center text-slate-400" }, "Nenhum tipo cadastrado.")) : taskTypes.map((t) => /* @__PURE__ */ React.createElement("tr", { key: t.id, className: "hover:bg-slate-50/80 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center text-base" }, t.emoji), /* @__PURE__ */ React.createElement("td", { className: "p-3 font-semibold text-slate-800" }, t.nome), /* @__PURE__ */ React.createElement("td", { className: "p-3 text-center" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        if (confirm("Deseja realmente excluir este tipo de tarefa?")) {
          const filtrados = taskTypes.filter((item) => item.id !== t.id);
          setTaskTypes(filtrados);
          localStorage.setItem("crm_cache_task_types", JSON.stringify(filtrados));
          showToast("Tipo de tarefa exclu\xEDdo!", "success");
        }
      },
      className: "text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
    },
    "Excluir"
  )))))))))))), showProductModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-6 relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setShowProductModal(false),
      className: "absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer",
      title: "Fechar (ESC)"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  ), /* @__PURE__ */ React.createElement("h3", { className: "text-base font-extrabold text-slate-900 mb-1" }, "Adicionar Novo Produto"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-5" }, "Adicione um novo produto ou licen\xE7a ao cat\xE1logo do sistema."), /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateProduct, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Nome do Produto"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: newProduct.nome,
      onChange: (e) => setNewProduct({ ...newProduct, nome: e.target.value }),
      placeholder: "Ex: Servidor Dell PowerEdge R760",
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-medium"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Fabricante"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: newProduct.fabricante,
      onChange: (e) => setNewProduct({ ...newProduct, fabricante: e.target.value }),
      placeholder: "Ex: Dell Technologies",
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-medium"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Custo de Refer\xEAncia"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("span", { className: "absolute left-3 top-2.5 text-xs text-slate-400 font-semibold" }, "R$"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "0.01",
      required: true,
      value: newProduct.custo_referencia,
      onChange: (e) => setNewProduct({ ...newProduct, custo_referencia: e.target.value }),
      placeholder: "0.00",
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 p-2 pl-8 text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
    }
  )))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      className: "w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-950/30 transition-all"
    },
    "Cadastrar Produto"
  )))), showCloseModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setShowCloseModal(false),
      className: "absolute top-4 right-4 text-slate-500 hover:text-white"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  ), /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-white mb-2" }, showCloseModal === "win" ? "\u{1F3C6} Fechamento - Proposta Ganha" : "\u{1F61E} Fechamento - Proposta Perdida"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-6" }, showCloseModal === "win" ? "Insira os dados do fechamento do neg\xF3cio ganho." : "Insira o principal motivo e a data do fechamento do neg\xF3cio perdido."), /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, showCloseModal === "loss" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" }, "Motivo da Perda"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedLossReason,
      onChange: (e) => setSelectedLossReason(e.target.value),
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "Selecione o motivo..."),
    /* @__PURE__ */ React.createElement("option", { value: "Pre\xE7o Alto" }, "Pre\xE7o Alto"),
    /* @__PURE__ */ React.createElement("option", { value: "Prazo de Entrega" }, "Prazo de Entrega"),
    /* @__PURE__ */ React.createElement("option", { value: "Perdido para Concorr\xEAncia" }, "Perdido para Concorr\xEAncia"),
    /* @__PURE__ */ React.createElement("option", { value: "Projeto Cancelado pelo Cliente" }, "Projeto Cancelado pelo Cliente"),
    /* @__PURE__ */ React.createElement("option", { value: "Falta de Verba/Budget" }, "Falta de Verba/Budget"),
    /* @__PURE__ */ React.createElement("option", { value: "Outros" }, "Outros")
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2" }, "Data do Fechamento"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: closeDate,
      onChange: (e) => setCloseDate(e.target.value),
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: handleConfirmClose,
      disabled: saving,
      className: `w-full py-3 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center justify-center space-x-1.5 ${showCloseModal === "win" ? "bg-amber-500 hover:bg-amber-400 shadow-amber-950/30 text-amber-950" : "bg-red-600 hover:bg-red-500 shadow-red-950/30 text-white"}`
    },
    saving ? "Gravando..." : "Confirmar Fechamento"
  )))), showNewTaskModal && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden relative animate-in fade-in zoom-in-95 duration-150" }, /* @__PURE__ */ React.createElement("div", { className: "border-b border-slate-200/80 px-6 py-4 bg-slate-50/80 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg flex items-center justify-center text-xs shadow-sm" }, "\u{1F4CB}"), /* @__PURE__ */ React.createElement("span", null, editingTask ? "Editar Tarefa Comercial" : "Nova Tarefa Comercial")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setShowNewTaskModal(false);
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
      },
      className: "p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer",
      title: "Fechar (ESC)"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
  )), /* @__PURE__ */ React.createElement("form", { onSubmit: handleCreateTaskSubmit, className: "p-6 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" })), "Neg\xF3cio Associado"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, selectedProposalForTask ? /* @__PURE__ */ React.createElement("div", { className: "px-3.5 py-2.5 bg-indigo-50/90 border border-indigo-200 rounded-xl flex items-center justify-between shadow-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5 min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0 animate-pulse" }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-slate-900 truncate" }, searchProposalQuery)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-shrink-0 ml-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-extrabold bg-indigo-600 text-white px-2.5 py-0.5 rounded-full shadow-xs" }, "\u2713 Selecionado"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
        setShowProposalDropdown(false);
      },
      className: "p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer",
      title: "Trocar neg\xF3cio"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M6 18L18 6M6 6l12 12" }))
  ))) : /* @__PURE__ */ React.createElement("div", { className: "flex items-center w-full rounded-xl border border-slate-200 bg-slate-50 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition-all" }, /* @__PURE__ */ React.createElement("span", { className: "pl-3.5 text-slate-400 flex-shrink-0" }, /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" }))), /* @__PURE__ */ React.createElement(
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
      placeholder: "Buscar por nome do neg\xF3cio...",
      className: "flex-1 bg-transparent pl-2.5 pr-3 py-2.5 text-sm text-slate-800 font-medium focus:outline-none placeholder-slate-400"
    }
  ), searchProposalQuery.length > 0 && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setSearchProposalQuery("");
        setProposalSearchResults([]);
        setShowProposalDropdown(false);
      },
      className: "pr-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }))
  )), showProposalDropdown && proposalSearchResults.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-40", onClick: () => setShowProposalDropdown(false) }), /* @__PURE__ */ React.createElement("ul", { className: "absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl max-h-56 overflow-y-auto shadow-2xl z-50 divide-y divide-slate-100" }, proposalSearchResults.map((p) => /* @__PURE__ */ React.createElement(
    "li",
    {
      key: p.id,
      onMouseDown: (e) => e.preventDefault(),
      onClick: () => {
        const clean = getCleanBusinessName(p.name || p.nome || "Projeto");
        setSelectedProposalForTask({ ...p, name: clean });
        setSearchProposalQuery(clean);
        setShowProposalDropdown(false);
      },
      className: "flex items-center justify-between gap-2 cursor-pointer px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors"
    },
    /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-900 leading-snug truncate" }, p.name || "Projeto"),
    /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex-shrink-0" }, "Selecionar")
  )))), showProposalDropdown && proposalSearchResults.length === 0 && searchProposalQuery.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-500 text-center shadow-xl z-50" }, 'Nenhum neg\xF3cio encontrado para "', searchProposalQuery, '"'))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Assunto / T\xEDtulo da Tarefa"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: newTaskTitle,
      onChange: (e) => setNewTaskTitle(e.target.value),
      placeholder: "Ex: Ligar para alinhar proposta comercial",
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-400"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Tipo de Atividade"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: newTaskType,
      onChange: (e) => setNewTaskType(e.target.value),
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer transition-all"
    },
    taskTypes.map((t) => /* @__PURE__ */ React.createElement("option", { key: t.id, value: t.nome }, t.emoji, " ", t.nome))
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Atribu\xEDdo a"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: newTaskAssignee,
      onChange: (e) => setNewTaskAssignee(e.target.value),
      className: "w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-800 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer transition-all"
    },
    /* @__PURE__ */ React.createElement("option", { value: "", className: "text-slate-400" }, "Selecione o respons\xE1vel..."),
    vendedoresVisiveis.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: String(v.id) }, v.nome))
  ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5" }, "Data de Vencimento"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-3" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      required: true,
      value: newTaskDueDate,
      onChange: (e) => setNewTaskDueDate(e.target.value),
      className: "flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 font-mono font-medium focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer transition-all"
    }
  ), !hasTime ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setHasTime(true),
      className: "px-3.5 py-2.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
    },
    /* @__PURE__ */ React.createElement("span", null, "+ Adicionar hora")
  ) : /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-1.5" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: newTaskTime,
      onChange: (e) => setNewTaskTime(e.target.value),
      className: "rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer font-mono font-medium"
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
      className: "p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer",
      title: "Remover hora"
    },
    "\u2715"
  )))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-end space-x-3 pt-5 border-t border-slate-100 mt-6" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setShowNewTaskModal(false);
        setSelectedProposalForTask(null);
        setSearchProposalQuery("");
        setProposalSearchResults([]);
      },
      className: "px-4.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
    },
    "Cancelar"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: creatingTask,
      className: "px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
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
      className: `drawer-content h-full flex flex-col ${showDrawer ? "active" : ""} ${drawerTab === "budget" ? "w-[94vw] max-w-7xl" : "w-full max-w-3xl md:max-w-4xl"}`
    },
    drawerTab === "details" ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col p-6 overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between border-b border-slate-200 pb-4 mb-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-[17px] font-extrabold text-slate-900 leading-snug" }, selectedTask ? selectedTask.name : "Detalhes do Neg\xF3cio"), (() => {
      const propNumField = selectedTask && selectedTask.custom_fields ? selectedTask.custom_fields.find((f) => f.id === "c44cc05d-303f-47e2-b243-40c6b26b732f") : null;
      const propNum = propNumField ? propNumField.value : null;
      return /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, propNum ? `N\xBA da Proposta: ${propNum}` : `ID da oportunidade: #${clickupTaskId}`);
    })()), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setShowDrawer(false);
          setClickupTaskId("");
        },
        className: "p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
    )), /* @__PURE__ */ React.createElement("div", { className: "space-y-4 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3.5 rounded-xl border border-slate-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "Respons\xE1vel pelo Neg\xF3cio"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "w-full bg-transparent border-0 p-0 text-sm font-semibold text-slate-800 focus:ring-0 focus:outline-none cursor-pointer mt-1",
        value: selectedTask ? selectedTask.responsavel_negocio || "" : "",
        onChange: (e) => {
          if (selectedTask) {
            const u = vendedoresVisiveis.find((v) => v.nome === e.target.value);
            handleResponsavelChange(selectedTask.id, e.target.value, u ? u.id : null);
          }
        }
      },
      /* @__PURE__ */ React.createElement("option", { value: "", className: "bg-white text-slate-500" }, "Selecione o respons\xE1vel..."),
      vendedoresVisiveis.map((v) => /* @__PURE__ */ React.createElement("option", { key: v.id, value: v.nome, className: "bg-white text-slate-800" }, v.nome))
    )), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-3.5 rounded-xl border border-slate-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block" }, "Valor Estimado"), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-indigo-600 mt-1 block" }, (() => {
      if (currentProposta && currentProposta.situacao === "Selecionada") {
        return `R$ ${Number(realTimeGrandTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      }
      const val = getOpportunityValue(selectedTask);
      return val !== null && val !== void 0 && !isNaN(val) ? `R$ ${Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";
    })()))), /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-br from-slate-50 to-white p-4 rounded-2xl border border-slate-200/80 shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3.5 h-3.5 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13 7l5 5m0 0l-5 5m5-5H6" }))), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-black text-slate-800 uppercase tracking-wider" }, "Pipeline de Vendas"), (() => {
      const congeladoOption = kanbanColumns.find((c) => (c.name || "").toLowerCase().includes("congelad"));
      const currentOptId = getTaskOptionId(selectedTask, kanbanColumns);
      const isFrozen = congeladoOption && currentOptId === congeladoOption.id;
      if (isFrozen) {
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: async () => {
              if (selectedTask && kanbanColumns.length > 0) {
                const firstActiveCol = kanbanColumns.find((c) => {
                  const n = (c.name || "").toLowerCase();
                  return !n.includes("congelad") && !n.includes("ganho") && !n.includes("perdido");
                }) || kanbanColumns[0];
                await handleOpportunityStateChange(selectedTask.id, firstActiveCol.id);
                showToast("Neg\xF3cio Descongelado! Retornou ao Pipeline \u2744\uFE0F", "info");
              }
            },
            className: "bg-sky-500 hover:bg-sky-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-extrabold shadow-sm shadow-sky-500/30 flex items-center gap-1.5 cursor-pointer animate-pulse ring-2 ring-sky-300 transition-all",
            title: "Neg\xF3cio atualmente Congelado! Clique para Descongelar"
          },
          /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 rounded-full bg-white animate-ping" }),
          /* @__PURE__ */ React.createElement("span", null, "\u2744\uFE0F Congelado")
        );
      }
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: async () => {
            if (selectedTask && congeladoOption) {
              await handleOpportunityStateChange(selectedTask.id, congeladoOption.id);
              showToast("Neg\xF3cio Congelado \u2744\uFE0F", "info");
            } else {
              showToast("Est\xE1gio Congelado n\xE3o configurado no ClickUp.", "warning");
            }
          },
          className: "bg-slate-100 hover:bg-sky-50 text-slate-600 hover:text-sky-700 border border-slate-200 hover:border-sky-300 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs",
          title: "Clique para Congelar este neg\xF3cio"
        },
        /* @__PURE__ */ React.createElement("span", null, "\u2744\uFE0F Congelar")
      );
    })()), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400 font-medium" }, "Clique para avan\xE7ar")), (() => {
      const stageField = selectedTask && selectedTask.custom_fields ? selectedTask.custom_fields.find((f) => f.id === "c8d0abe2-c59f-4a9e-93ff-bd060659aa63") : null;
      const rawOptions = stageField && stageField.type_config && stageField.type_config.options || kanbanColumns || [];
      const options = rawOptions.filter((o) => {
        const n = (o.name || "").toLowerCase();
        return !n.includes("congelad") && !n.includes("ganho") && !n.includes("perdido");
      });
      const currentRawOptionId = getTaskOptionId(selectedTask, rawOptions);
      const currentRawOption = kanbanColumns.find((c) => c.id === currentRawOptionId);
      const currentRawName = (currentRawOption?.name || "").toLowerCase();
      const selectedProp = propostas && propostas.length > 0 ? propostas.find((p) => p.situacao === "Selecionada") || propostas.find((p) => p.versao === "vA") || propostas[0] : null;
      const hasSelectedProposal = Boolean(selectedProp && selectedProp.situacao === "Selecionada");
      const isWon = selectedProp && selectedProp.situacao === "Ganho" || currentRawName.includes("ganho");
      const isLost = selectedProp && selectedProp.situacao === "Perdido" || currentRawName.includes("perdido");
      const isFrozen = currentRawName.includes("congelad");
      const isInactiveState = isWon || isLost || isFrozen;
      const currentIdx = !isInactiveState ? options.findIndex((o) => o.id === currentRawOptionId) : -1;
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid gap-1.5 select-none", style: { gridTemplateColumns: `repeat(${options.length + 2}, 1fr)` } }, options.map((col, idx) => {
        const isCurrent = !isInactiveState && (currentRawOptionId === col.id || currentIdx === -1 && idx === 0);
        const isPassed = !isInactiveState && currentIdx !== -1 && idx < currentIdx;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: col.id || idx,
            onClick: async () => {
              if (selectedTask) {
                setSelectedTask((prev) => {
                  if (!prev) return prev;
                  const updatedFields = prev.custom_fields ? prev.custom_fields.map((f) => f.id === "c8d0abe2-c59f-4a9e-93ff-bd060659aa63" ? { ...f, value: col.id } : f) : [{ id: "c8d0abe2-c59f-4a9e-93ff-bd060659aa63", value: col.id }];
                  return { ...prev, custom_fields: updatedFields };
                });
                await handleOpportunityStateChange(selectedTask.id, col.id);
              }
            },
            title: `Mover para: ${col.name}`,
            className: `relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 cursor-pointer group ${isCurrent ? "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-[1.03] ring-2 ring-indigo-400/30 ring-offset-1" : isPassed ? "bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 hover:from-indigo-100 hover:to-indigo-200" : "bg-slate-100/80 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700"}`
          },
          /* @__PURE__ */ React.createElement("div", { className: `w-5 h-5 rounded-full flex items-center justify-center mb-1 ${isCurrent ? "bg-white/25" : isPassed ? "bg-indigo-200/60" : "bg-slate-200/60"}` }, isCurrent ? /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 bg-white rounded-full animate-pulse" }) : isPassed ? /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-indigo-600", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "3" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" })) : /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 bg-slate-300 rounded-full" })),
          /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold text-center leading-tight ${isCurrent ? "text-white" : isPassed ? "text-indigo-700" : "text-slate-500 group-hover:text-slate-700"}` }, col.name),
          isCurrent && /* @__PURE__ */ React.createElement("span", { className: "text-[7px] font-black text-white/60 uppercase tracking-widest mt-0.5" }, "Atual")
        );
      }), /* @__PURE__ */ React.createElement(
        "button",
        {
          disabled: !hasSelectedProposal,
          onClick: () => {
            if (selectedProp) {
              setCurrentProposta(selectedProp);
              setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
              setShowCloseModal("win");
            }
          },
          title: hasSelectedProposal ? "Marcar oportunidade como Ganha \u{1F3C6}" : "Requer uma proposta Selecionada para fechar como Ganho",
          className: `relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 ${isWon ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.03] ring-2 ring-emerald-400 ring-offset-1 cursor-pointer" : hasSelectedProposal ? "bg-slate-100/80 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-transparent cursor-pointer" : "bg-slate-100/50 text-slate-300 border border-slate-200 cursor-not-allowed opacity-50"}`
        },
        /* @__PURE__ */ React.createElement("div", { className: `w-5 h-5 rounded-full flex items-center justify-center mb-1 ${isWon ? "bg-white/25" : "bg-slate-200/60"}` }, isWon ? /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 bg-white rounded-full animate-pulse" }) : /* @__PURE__ */ React.createElement("span", { className: "text-xs" }, "\u{1F3C6}")),
        /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold text-center leading-tight ${isWon ? "text-white" : "text-slate-500"}` }, "Ganho"),
        isWon && /* @__PURE__ */ React.createElement("span", { className: "text-[7px] font-black text-white/70 uppercase tracking-widest mt-0.5" }, "Atual")
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          disabled: !hasSelectedProposal,
          onClick: () => {
            if (selectedProp) {
              setCurrentProposta(selectedProp);
              setCloseDate((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
              setSelectedLossReason("");
              setShowCloseModal("loss");
            }
          },
          title: hasSelectedProposal ? "Marcar oportunidade como Perdida \u{1F61E}" : "Requer uma proposta Selecionada para fechar como Perdido",
          className: `relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all duration-300 ${isLost ? "bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30 scale-[1.03] ring-2 ring-rose-400 ring-offset-1 cursor-pointer" : hasSelectedProposal ? "bg-slate-100/80 text-slate-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-transparent cursor-pointer" : "bg-slate-100/50 text-slate-300 border border-slate-200 cursor-not-allowed opacity-50"}`
        },
        /* @__PURE__ */ React.createElement("div", { className: `w-5 h-5 rounded-full flex items-center justify-center mb-1 ${isLost ? "bg-white/25" : "bg-slate-200/60"}` }, isLost ? /* @__PURE__ */ React.createElement("span", { className: "w-2 h-2 bg-white rounded-full animate-pulse" }) : /* @__PURE__ */ React.createElement("span", { className: "text-xs" }, "\u{1F61E}")),
        /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-bold text-center leading-tight ${isLost ? "text-white" : "text-slate-500"}` }, "Perdido"),
        isLost && /* @__PURE__ */ React.createElement("span", { className: "text-[7px] font-black text-white/70 uppercase tracking-widest mt-0.5" }, "Atual")
      )), (() => {
        const totalSteps = options.length + 1;
        const progress = isWon ? 100 : isLost ? 100 : isFrozen ? 0 : currentIdx !== -1 ? Math.round((currentIdx + 1) / totalSteps * 100) : 0;
        const barGradient = isWon ? "from-emerald-400 to-emerald-600" : isLost ? "from-rose-400 to-rose-600" : "from-indigo-500 via-violet-500 to-emerald-500";
        return /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 h-1.5 bg-slate-200/80 rounded-full overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: `h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500 ease-out`, style: { width: `${progress}%` } })), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-bold text-slate-500 tabular-nums" }, progress, "%"));
      })());
    })())), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center border-b border-slate-200 mb-0 px-1" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setDrawerSection("propostas");
        },
        title: "Propostas",
        className: `relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 cursor-pointer mx-1 ${drawerSection === "propostas" ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" })),
      drawerSection === "propostas" && /* @__PURE__ */ React.createElement("span", { className: "absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-500 rounded-full" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setDrawerSection("tarefas");
        },
        title: "Tarefas",
        className: `relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 cursor-pointer mx-1 ${drawerSection === "tarefas" ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" })),
      drawerSection === "tarefas" && /* @__PURE__ */ React.createElement("span", { className: "absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-500 rounded-full" }),
      (() => {
        const overdueCount = commercialTasks.filter((t) => {
          const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
          const isThisDeal = t.clickup_negocio_id === clickupTaskId || propObj && propObj.clickup_negocio_id === clickupTaskId || currentProposta && t.proposta_id === currentProposta.id;
          return isThisDeal && t.status === "pendente" && new Date(t.data_vencimento) < /* @__PURE__ */ new Date();
        }).length;
        return overdueCount > 0 ? /* @__PURE__ */ React.createElement("span", { className: "absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse" }, overdueCount) : null;
      })()
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setDrawerSection("status");
          fetchAtividades(clickupTaskId);
        },
        title: "Status do Projeto",
        className: `relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 cursor-pointer mx-1 ${drawerSection === "status" ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`
      },
      /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.8" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" })),
      drawerSection === "status" && /* @__PURE__ */ React.createElement("span", { className: "absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-500 rounded-full" })
    )), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto pr-1 pt-4" }, drawerSection === "propostas" && /* @__PURE__ */ React.createElement("div", { className: "px-1" }, renderTimeline(false)), drawerSection === "tarefas" && /* @__PURE__ */ React.createElement("div", { className: "px-1 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between pb-2 border-b border-slate-200/60 mb-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider" }, "Tarefas Associadas"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleNewTaskClick,
        className: "px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center space-x-1"
      },
      /* @__PURE__ */ React.createElement("span", null, "\u2795 Nova Tarefa Comercial")
    )), (() => {
      const dealTasks = commercialTasks.filter((t) => {
        const propObj = Array.isArray(t.propostas) ? t.propostas[0] : t.propostas;
        return t.clickup_negocio_id === clickupTaskId || propObj && propObj.clickup_negocio_id === clickupTaskId || currentProposta && t.proposta_id === currentProposta.id;
      });
      if (dealTasks.length === 0) {
        return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center py-10 text-center space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center" }, /* @__PURE__ */ React.createElement("svg", { className: "w-6 h-6 text-slate-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }))), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Nenhuma tarefa associada a este neg\xF3cio."));
      }
      return dealTasks.map((task) => {
        const isOverdue = task.status === "pendente" && new Date(task.data_vencimento) < /* @__PURE__ */ new Date();
        const isDone = task.status === "concluida";
        const matchedType = taskTypes.find((t) => t.nome === task.tipo);
        const typeEmoji = matchedType ? matchedType.emoji : "\u{1F4CB}";
        return /* @__PURE__ */ React.createElement("div", { key: task.id, className: "flex items-start justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start space-x-2.5" }, /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "checkbox",
            checked: isDone,
            onChange: () => toggleTaskStatus(task),
            className: "w-3.5 h-3.5 rounded border-slate-200 bg-white text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-0.5"
          }
        ), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: `text-xs font-semibold ${isDone ? "line-through text-slate-500" : "text-slate-800"}` }, typeEmoji, " ", task.titulo), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-500 mt-0.5" }, "Vence em: ", new Date(task.data_vencimento).toLocaleString("pt-BR"), isOverdue && /* @__PURE__ */ React.createElement("span", { className: "text-red-400 font-bold ml-1.5" }, "\u26A0\uFE0F Atrasada")))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => handleEditTaskClick(task), className: "p-1 text-slate-500 hover:text-blue-500 transition-colors", title: "Editar Tarefa" }, /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" }))), /* @__PURE__ */ React.createElement("button", { onClick: () => handleDeleteTask(task.id), className: "p-1 text-slate-500 hover:text-red-500 transition-colors", title: "Excluir Tarefa" }, /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M3 6h18" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }), /* @__PURE__ */ React.createElement("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }), /* @__PURE__ */ React.createElement("line", { x1: "10", x2: "10", y1: "11", y2: "17" }), /* @__PURE__ */ React.createElement("line", { x1: "14", x2: "14", y1: "11", y2: "17" })))));
      });
    })()), drawerSection === "status" && /* @__PURE__ */ React.createElement("div", { className: "px-1 space-y-5" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl border border-slate-200 p-4 shadow-sm" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2" }, "Registrar Atividade"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        value: novaAtividade,
        onChange: (e) => setNovaAtividade(e.target.value),
        placeholder: "Descreva o resultado da a\xE7\xE3o, retorno do cliente, pr\xF3ximos passos...",
        className: "w-full p-3 border border-slate-200 rounded-lg text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none transition-all",
        rows: 3
      }
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleCreateAtividade,
        disabled: savingAtividade || !novaAtividade.trim(),
        className: `mt-2 w-full py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${savingAtividade || !novaAtividade.trim() ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-md shadow-indigo-600/20"}`
      },
      savingAtividade ? "Salvando..." : "\u{1F4AC} Registrar Atividade"
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-3" }, "Hist\xF3rico de Atividades"), loadingAtividades ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center py-6" }, /* @__PURE__ */ React.createElement("div", { className: "w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" })) : atividades.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center py-8 text-center space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center" }, /* @__PURE__ */ React.createElement("svg", { className: "w-5 h-5 text-slate-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" }))), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Nenhuma atividade registrada."), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-slate-400" }, "Registre a\xE7\xF5es, retornos e pr\xF3ximos passos.")) : /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, atividades.map((ativ) => /* @__PURE__ */ React.createElement("div", { key: ativ.id, className: "bg-white rounded-xl border border-slate-200 p-3.5 hover:border-slate-300 transition-colors shadow-sm" }, editingAtividade === ativ.id ? /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement(
      "textarea",
      {
        value: editingAtividadeTexto,
        onChange: (e) => setEditingAtividadeTexto(e.target.value),
        className: "w-full p-2.5 border border-slate-200 rounded-lg text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none",
        rows: 3
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handleEditAtividade(ativ.id),
        disabled: savingAtividade,
        className: "px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
      },
      savingAtividade ? "Salvando..." : "Salvar"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setEditingAtividade(null);
          setEditingAtividadeTexto("");
        },
        className: "px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
      },
      "Cancelar"
    ))) : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-800 leading-relaxed flex-1 pr-2 whitespace-pre-wrap" }, ativ.texto), /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-1 flex-shrink-0" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setEditingAtividade(ativ.id);
          setEditingAtividadeTexto(ativ.texto);
        },
        className: "p-1 text-slate-400 hover:text-blue-500 transition-colors",
        title: "Editar atividade"
      },
      /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" }))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handleDeleteAtividade(ativ.id),
        className: "p-1 text-slate-400 hover:text-red-500 transition-colors",
        title: "Excluir atividade"
      },
      /* @__PURE__ */ React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M3 6h18" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }), /* @__PURE__ */ React.createElement("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }), /* @__PURE__ */ React.createElement("line", { x1: "10", x2: "10", y1: "11", y2: "17" }), /* @__PURE__ */ React.createElement("line", { x1: "14", x2: "14", y1: "11", y2: "17" }))
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center mt-2 space-x-2" }, /* @__PURE__ */ React.createElement("svg", { className: "w-3 h-3 text-slate-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" })), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-slate-400 font-medium" }, new Date(ativ.data_execucao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })), ativ.clickup_comment_id && /* @__PURE__ */ React.createElement("span", { className: "text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-semibold" }, "\u2713 ClickUp"))))))))))) : /* @__PURE__ */ React.createElement("div", { className: "drawer-split-container" }, /* @__PURE__ */ React.createElement("div", { className: "drawer-split-sidebar flex flex-col p-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between pb-3 border-b border-slate-200/80 mb-4 flex-shrink-0" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-black uppercase tracking-wider text-indigo-400" }, "Hist\xF3rico de Vers\xF5es")), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto min-h-0 pr-1" }, renderTimeline())), /* @__PURE__ */ React.createElement("div", { className: "drawer-split-main flex flex-col" }, renderBudgetEditor()))
  )));
}
const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(/* @__PURE__ */ React.createElement(App, null));
