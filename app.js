// App React para o Gerador de Propostas Comerciais com Versionamento (Modelo de Produção)

const { useState, useEffect, useMemo, useRef } = React;

const DEAL_VALUE_FIELD_ID = 'ee65221a-029d-4d0a-a981-b71b5a29b4b4';
const API_KEY = 'pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437';

// Configuração padrão ou carregada do LocalStorage
const getInitialConfig = () => {
  return {
    url: localStorage.getItem('supa_url') || '',
    anonKey: localStorage.getItem('supa_key') || '',
  };
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

function App() {
  const [config, setConfig] = useState(getInitialConfig);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [clickupTaskId, setClickupTaskId] = useState('');
  const [clickupListId, setClickupListId] = useState('');
  
  // Controle de Abas (Editor vs Gestão)
  const [activeTab, setActiveTab] = useState('propostas'); // 'propostas' | 'gestao' | 'relatorios'
  
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
  const [produtos, setProdutos] = useState([]);
  const [distribuidores, setDistribuidores] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [newVendedorName, setNewVendedorName] = useState('');
  const [editingVendedor, setEditingVendedor] = useState(null);
  const [currentProposta, setCurrentProposta] = useState(null);
  const [itens, setItens] = useState([]);
  
  // Edição no Painel de Gestão (Produtos e Distribuidores)
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingDistributor, setEditingDistributor] = useState(null);
  const [newDistributorName, setNewDistributorName] = useState('');
  const [settingsActiveTab, setSettingsActiveTab] = useState('connection'); // 'connection' | 'products' | 'distributors' | 'venders'
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
  const saveTimeoutRef = useRef(null);
  const [importText, setImportText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState('');
  
  // UX/UIs
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ nome: '', fabricante: '', custo_referencia: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Inicializar Cliente Supabase
  useEffect(() => {
    if (config.url && config.anonKey) {
      try {
        const client = window.supabase.createClient(config.url, config.anonKey);
        setSupabaseClient(client);
        testConnection(client);
      } catch (err) {
        console.error("Erro ao inicializar Supabase:", err);
        setDbConnected(false);
      }
    } else {
      setShowSettingsModal(true);
    }
  }, [config]);

  // Testar conexão buscando produtos
  const testConnection = async (client) => {
    try {
      const { data, error } = await client.from('produtos').select('id').limit(1);
      if (error) throw error;
      setDbConnected(true);
      setErrorMsg('');
      loadProducts(client);
      loadDistributors(client);
      loadVendedores(client);
    } catch (err) {
      console.error("Erro de conexão com o banco:", err);
      setDbConnected(false);
      setErrorMsg('Falha ao conectar ao Supabase. Verifique suas credenciais.');
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
        const clickupHeaders = {
          "Authorization": API_KEY,
          "Content-Type": "application/json"
        };
        const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${idWithoutHash}`, {
          headers: clickupHeaders
        });
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
        console.error("Erro ao obter detalhes da tarefa no ClickUp:", clickupErr);
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
  const loadVendedores = async (client = supabaseClient) => {
    if (!client) return;
    const { data, error } = await client.from('vendedores').select('*').order('nome');
    if (!error && data) {
      setVendedores(data);
    }
  };

  // Carregar dados para o painel de relatórios
  const loadDashboardData = async (client = supabaseClient) => {
    if (!client) return;
    setLoadingDashboard(true);
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

    // Agrupar faturamento por Distribuidor e por Fabricante com filtros aplicados
    const distributorTotals = {};
    const manufacturerTotals = {};

    commercialData.forEach(item => {
      const value = (parseFloat(item.quantidade) || 0) * (parseFloat(item.preco_unitario) || 0);
      const distName = item.distribuidores?.nome || 'Não Informado';
      const fabName = item.produtos?.fabricante || 'Não Informado';

      if (selectedDistributorFilter === 'all' || distName.trim().toLowerCase() === selectedDistributorFilter.trim().toLowerCase()) {
        distributorTotals[distName] = (distributorTotals[distName] || 0) + value;
      }

      if (selectedManufacturerFilter === 'all' || fabName.trim().toLowerCase() === selectedManufacturerFilter.trim().toLowerCase()) {
        manufacturerTotals[fabName] = (manufacturerTotals[fabName] || 0) + value;
      }
    });

    // Paleta moderna, vibrante e translúcida
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
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: dataValues,
            backgroundColor: chartColors.slice(0, labels.length),
            borderColor: chartBorderColors.slice(0, labels.length),
            borderWidth: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#94a3b8',
                font: {
                  family: 'Plus Jakarta Sans',
                  size: 11
                }
              }
            },
            tooltip: {
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
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: dataValues,
            backgroundColor: chartColors.slice(0, labels.length),
            borderColor: chartBorderColors.slice(0, labels.length),
            borderWidth: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#94a3b8',
                font: {
                  family: 'Plus Jakarta Sans',
                  size: 11
                }
              }
            },
            tooltip: {
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
  }, [activeTab, commercialData, loadingDashboard, selectedDistributorFilter, selectedManufacturerFilter]);

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
      setIsProjeto(prop ? !!prop.cenario : false);

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
      const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${cleanTaskId}`, {
        headers: {
          "Authorization": API_KEY,
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
        const urlValue = `https://api.clickup.com/api/v2/task/${cleanTaskId}/field/${campoValor.id}`;
        
        console.log(`[${new Date().toISOString()}] POST ${urlValue} - Body:`, JSON.stringify(bodyFormatado));
        
        if (cleanTaskId === '86ahby7wm') {
          console.log(`[${new Date().toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando valor local para ClickUp (${flowName}): ${bodyFormatado.value}`);
        }

        const resVal = await fetch(urlValue, {
          method: 'POST',
          headers: {
            "Authorization": API_KEY,
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
            const verifyRes = await fetch(`https://api.clickup.com/api/v2/task/${cleanTaskId}`, {
              headers: {
                "Authorization": API_KEY,
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
        const urlGlobal = `https://api.clickup.com/api/v2/task/${parentTaskId}/field/${DEAL_VALUE_FIELD_ID}`;
        const bodyFormatado = { value: Number(Number(valorLimpo).toFixed(2)) };

        console.log(`[${new Date().toISOString()}] POST ${urlGlobal} - Body:`, JSON.stringify(bodyFormatado));

        if (cleanTaskId === '86ahby7wm' || parentTaskId === '86ahby7wm') {
          console.log(`[${new Date().toISOString()}] [DETECTOR TASK 86ahby7wm] Enviando Deal Value global para a tarefa pai ${parentTaskId}: ${bodyFormatado.value}`);
        }

        const resGlobal = await fetch(urlGlobal, {
          method: 'POST',
          headers: {
            "Authorization": API_KEY,
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
            const verifyRes = await fetch(`https://api.clickup.com/api/v2/task/${parentTaskId}`, {
              headers: {
                "Authorization": API_KEY,
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

      // 3. Inserir a nova proposta
      const { data: newProp, error: propErr } = await supabaseClient
        .from('propostas')
        .insert({
          clickup_negocio_id: clickupTaskId,
          versao: nextVersao,
          cenario: '',
          situacao: 'Ativa',
          total_proposta: currentProposta.total_proposta,
          criado_por: currentProposta.criado_por
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
  const handleDeleteProposal = async () => {
    if (!currentProposta || !supabaseClient) return;
    const isVa = currentProposta.versao === 'vA';
    
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
      const message = `Deseja realmente excluir a versão ${currentProposta.versao}?`;
      if (!confirm(message)) return;
      setSaving(true);
      try {
        // Deleta os itens da proposta atual
        await supabaseClient
          .from('itens_proposta')
          .delete()
          .eq('proposta_id', currentProposta.id);

        // Deleta a proposta atual
        const { error } = await supabaseClient
          .from('propostas')
          .delete()
          .eq('id', currentProposta.id);

        if (error) throw error;

        showToast('Versão excluída com sucesso!', 'success');

        const vaProp = propostas.find(p => p.versao === 'vA');
        await loadPropostas(vaProp?.id || null);
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
    try {
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: newSituacao,
          motivo_perda: null
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      showToast(`Situação alterada para ${newSituacao}!`, 'success');
      
      setCurrentProposta({
        ...currentProposta,
        situacao: newSituacao,
        motivo_perda: null
      });

      loadPropostas(currentProposta.id);
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
        "Authorization": API_KEY,
        "Content-Type": "application/json"
      };

      // 1. Obter os Workspaces (Teams) para achar o team_id
      const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
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
            const listTasksRes = await fetch(`https://api.clickup.com/api/v2/list/${clickupListId}/task?archived=false&include_custom_fields=true&limit=100&include_closed=true&page=${listPage}`, {
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
          const teamTasksRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/task?archived=false&include_custom_fields=true&limit=100&include_closed=true&page=${teamPage}`, {
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

  // 9. Alterar Status para "Selecionada" (Gatilho para sincronização no ClickUp)
  const handleSelectProposal = async () => {
    if (!currentProposta || !clickupTaskId) return;
    const taskId = String(clickupTaskId).replace('#', '').trim();
    setSaving(true);
    try {
      if (!isReadOnly) {
        await handleSaveProposal();
      }

      // 1. REGRA CONDICIONAL DUPLA DA CADEIRA ÚNICA
      if (isProjeto === false) {
        // REGRA VENDA SIMPLES: Mudar TODAS as outras propostas do mesmo 'clickup_negocio_id' para 'Desconsiderada'
        await supabaseClient
          .from('propostas')
          .update({ situacao: 'Desconsiderada' })
          .eq('clickup_negocio_id', clickupTaskId)
          .neq('id', currentProposta.id);
      } else {
        // REGRA PROJETO COMPLEXO: Mudar as outras propostas apenas de 'Selecionada' para 'Ativa'
        await supabaseClient
          .from('propostas')
          .update({ situacao: 'Ativa' })
          .eq('clickup_negocio_id', clickupTaskId)
          .eq('situacao', 'Selecionada')
          .neq('id', currentProposta.id);
      }

      // 2. Atualiza a proposta atual para 'Selecionada' no Supabase
      const { error } = await supabaseClient
        .from('propostas')
        .update({ 
          situacao: 'Selecionada',
          total_proposta: realTimeGrandTotal,
          clickup_negocio_id: clickupTaskId,
          versao: currentProposta.versao
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, 'Select');

      showToast('Proposta selecionada e ClickUp atualizado com sucesso!', 'success');
      loadPropostas(currentProposta.id);
    } catch (err) {
      console.error(err);
      showToast('Erro ao selecionar ou sincronizar com ClickUp.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!currentProposta || !supabaseClient) return;
    if (!closeDate) {
      showToast('Por favor, informe a data de fechamento.', 'error');
      return;
    }
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
          data_fechamento: closeDate,
          total_proposta: realTimeGrandTotal
        })
        .eq('id', currentProposta.id);

      if (error) throw error;

      // 2. Sincronizar ClickUp se aplicável
      if (clickupTaskId) {
        await syncClickUpProposta(clickupTaskId, realTimeGrandTotal, situacao);
        
        const taskId = String(clickupTaskId).replace('#', '').trim();
        const clickupStatus = isWin ? 'ganho' : 'perdido';
        const body = { status: clickupStatus };
        const resStat = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
          method: 'PUT',
          headers: {
            "Authorization": API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        if (resStat.status !== 200 && resStat.status !== 201) {
          const errText = await resStat.text();
          console.error(`Erro ao atualizar Status no ClickUp [Status: ${resStat.status}]:`, errText);
        }
      }

      showToast(`Proposta marcada como ${isWin ? 'GANHA' : 'PERDIDA'} com sucesso!`, 'success');
      setShowCloseModal(false);
      loadPropostas(currentProposta.id);
      loadDashboardData();
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
          onClick={() => setActiveTab('propostas')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'propostas' 
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40' 
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80'
          }`}
        >
          Propostas
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
              <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fim</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Início Comp.</label>
                  <input
                    type="date"
                    value={compareStartDate}
                    onChange={(e) => setCompareStartDate(e.target.value)}
                    className="bg-slate-950 border border-indigo-950/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Fim Comp.</label>
                  <input
                    type="date"
                    value={compareEndDate}
                    onChange={(e) => setCompareEndDate(e.target.value)}
                    className="bg-slate-950 border border-indigo-950/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={() => loadDashboardData()}
                  disabled={loadingDashboard}
                  className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all"
                >
                  {loadingDashboard ? '...' : 'Filtrar'}
                </button>
              </div>
            </div>

            {/* Cards Executivos de BI */}
            {!loadingDashboard && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Card 1: Negócios Convertidos */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Negócios Convertidos (Ganhos)</span>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-black text-white">{biMetrics.wonCount}</span>
                    <span className="text-xs text-slate-400">propostas</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    R$ {biMetrics.wonValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {compareStartDate && compareEndDate && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs">
                      <span className={`font-bold flex items-center ${biMetrics.wonValDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biMetrics.wonValDiff >= 0 ? '▲' : '▼'} {Math.abs(biMetrics.wonValDiff).toFixed(1)}%
                      </span>
                      <span className="text-slate-500">vs período anterior</span>
                    </div>
                  )}
                </div>

                {/* Card 2: Negócios Perdidos */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Negócios Perdidos</span>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-black text-white">{biMetrics.lostCount}</span>
                    <span className="text-xs text-slate-400">propostas</span>
                  </div>
                  <div className="text-xl font-bold text-red-400 mt-1">
                    R$ {biMetrics.lostValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {compareStartDate && compareEndDate && (
                    <div className="mt-3 flex items-center space-x-1.5 text-xs">
                      <span className={`font-bold flex items-center ${biMetrics.lostValDiff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biMetrics.lostValDiff <= 0 ? '▼' : '▲'} {Math.abs(biMetrics.lostValDiff).toFixed(1)}%
                      </span>
                      <span className="text-slate-500">vs período anterior</span>
                    </div>
                  )}
                </div>

                {/* Card 3: Taxa de Conversão */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col relative overflow-hidden">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Taxa de Conversão Geral</span>
                  <div className="text-3xl font-black text-indigo-400 mt-1">
                    {biMetrics.convRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
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
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">Distribuição por Distribuidor</h3>
                      <p className="text-xs text-slate-500">Faturamento total acumulado agrupado por Distribuidor</p>
                    </div>
                    <select
                      value={selectedDistributorFilter}
                      onChange={(e) => setSelectedDistributorFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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
                  </div>
                  <div className="relative h-80 w-full flex-1 min-h-[320px]">
                    <canvas ref={distributorCanvasRef}></canvas>
                  </div>
                </div>

                {/* Gráfico B: Fabricante */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">Distribuição por Fabricante</h3>
                      <p className="text-xs text-slate-500">Faturamento total acumulado agrupado por Fabricante</p>
                    </div>
                    <select
                      value={selectedManufacturerFilter}
                      onChange={(e) => setSelectedManufacturerFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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
                  </div>
                  <div className="relative h-80 w-full flex-1 min-h-[320px]">
                    <canvas ref={manufacturerCanvasRef}></canvas>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        {/* ABA 1: EDITOR DE PROPOSTAS */}
        {activeTab === 'propostas' && (
          !clickupTaskId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 bg-indigo-950/50 rounded-full border border-indigo-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Editor de Propostas Bloqueado</h3>
                <p className="text-sm text-slate-400">Por favor, insira um Negócio ID no topo do painel para carregar as propostas correspondentes e habilitar a timeline de versões.</p>
              </div>
            </div>
          ) : (
            <React.Fragment>
              {/* Barra Lateral: Timeline de Versões */}
              <aside className="w-1/5 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400">Timeline de Versões</h2>
                  <span className="bg-slate-800 px-2 py-0.5 rounded-full text-xs font-semibold text-slate-300">
                    {propostas.length}
                  </span>
                </div>

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
                <div className="flex-1 space-y-3 pr-1">
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
                        onClick={() => loadProposalDetails(prop.id)}
                        className={`relative p-3 rounded-xl cursor-pointer timeline-item glass-card transition-all ${
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
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${statusColors[prop.situacao] || 'bg-slate-700'}`}>
                            {prop.situacao}
                          </span>
                        </div>

                        <div className="flex justify-between items-baseline mt-2">
                          <span className="text-[10px] text-slate-500">
                            {new Date(prop.created_at).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} • {prop.criado_por.split(' ')[0]}
                          </span>
                          <span className="text-sm font-bold text-white">
                            R$ {Number(prop.total_proposta).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {propostas.length > 0 && (
                <button
                  onClick={handleGerarNovaVersao}
                  disabled={saving}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 mt-4 shadow-lg shadow-indigo-950/50 hover:bg-indigo-500"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>Gerar Nova Versão</span>
                </button>
              )}
            </aside>

            {/* Painel Central: Editor */}
            <main className="w-4/5 flex flex-col bg-slate-950 relative overflow-hidden">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                  <div className="w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                  <p className="text-sm text-slate-400 font-medium">Processando dados da proposta...</p>
                </div>
              ) : !currentProposta ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6">
                  <div className="w-20 h-20 bg-indigo-950/50 rounded-full border border-indigo-500/20 flex items-center justify-center">
                    <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Painel de Propostas Comerciais</h3>
                    <p className="text-sm text-slate-400">Selecione ou gere uma nova proposta na barra lateral para carregar a tela de negociação.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  {/* Barra de Título / Cabeçalho do Editor */}
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

                    {/* Ações */}
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

                      {currentProposta.situacao !== 'Selecionada' && currentProposta.situacao !== 'Ganho' && (
                        <button
                          onClick={handleSelectProposal}
                          disabled={saving}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/30 transition-all flex items-center space-x-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>
                            {currentProposta.situacao === 'Desconsiderada' ? 'Reativar e Selecionar' : 'Selecionar'}
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

                  <div className="p-6 bg-slate-900/10 border-b border-slate-900 grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">É um Projeto?</label>
                      <select
                        className="w-full rounded-xl bg-slate-900/50 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                        value={isProjeto ? "true" : "false"}
                        onChange={(e) => {
                          const val = e.target.value === "true";
                          setIsProjeto(val);
                          if (!val) {
                            setCurrentProposta({ ...currentProposta, cenario: "" });
                          }
                        }}
                      >
                        <option value="false" className="bg-slate-900 text-slate-200">Não</option>
                        <option value="true" className="bg-slate-900 text-slate-200">Sim</option>
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

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Situação Atual</label>
                      <div className="flex items-center bg-slate-900/50 border border-slate-800 rounded-xl px-3 h-[42px] space-x-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          currentProposta.situacao === 'Selecionada' ? 'bg-emerald-500 animate-pulse' :
                          currentProposta.situacao === 'Ativa' ? 'bg-blue-500' :
                          currentProposta.situacao === 'Ganho' ? 'bg-amber-500 animate-bounce' :
                          currentProposta.situacao === 'Perdido' ? 'bg-red-500' :
                          currentProposta.situacao === 'Desconsiderada' ? 'bg-red-500/50' : 'bg-slate-500'
                        }`}></span>
                        <select
                          className="bg-transparent border-0 p-0 text-sm font-semibold text-slate-200 focus:ring-0 focus:outline-none cursor-pointer flex-1"
                          value={currentProposta.situacao}
                          onChange={(e) => handleSituationChange(e.target.value)}
                        >
                          <option value="Ativa" className="bg-slate-900 text-slate-200">Ativa</option>
                          <option value="Selecionada" className="bg-slate-900 text-slate-200">Selecionada</option>
                          <option value="Ganho" className="bg-slate-900 text-slate-200">Ganho</option>
                          <option value="Desconsiderada" className="bg-slate-900 text-slate-200">Desconsiderada</option>
                          <option value="Perdido" className="bg-slate-900 text-slate-200">Perdido</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Tabela de Itens */}
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
                              <th className="pb-3 w-5/12">Produto [Fabricante]</th>
                              <th className="pb-3 w-3/12">Distribuidor</th>
                              <th className="pb-3 w-1/12 text-center">Qtd</th>
                              <th className="pb-3 w-2/12 text-right">Unitário</th>
                              <th className="pb-3 w-2/12 text-right">Subtotal</th>
                              {!isReadOnly && <th className="pb-3 w-1/12 text-center">Ações</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/60">
                            {itens.map((item, index) => {
                              const subtotal = item.quantidade * item.preco_unitario || 0;
                              return (
                                <tr key={item.id} className="group hover:bg-slate-900/20 transition-colors">
                                  
                                  {/* Produto */}
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

                                  {/* Distribuidor (Dropdown a partir da tabela distribuidores) */}
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

                                  {/* Quantidade */}
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

                                  {/* Preço Unitário com Máscara Visual (sem R$ no input) */}
                                  <td className="py-3.5 pr-4 text-right">
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

                                  {/* Subtotal */}
                                  <td className="py-3.5 text-right font-bold text-slate-200 text-sm">
                                    R$ {subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </td>

                                  {/* Remover item */}
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

                  {/* Totais */}
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
              )}
            </main>
          </React.Fragment>
          )
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
                  onClick={() => setSettingsActiveTab('connection')}
                  className={`w-full px-4 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    settingsActiveTab === 'connection'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                  }`}
                >
                  Conexão Supabase
                </button>
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
                {/* 1. ABA CONEXÃO */}
                {settingsActiveTab === 'connection' && (
                  <form onSubmit={handleSaveConfig} className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Project URL</label>
                      <input 
                        type="url" 
                        name="url"
                        required
                        placeholder="https://xxxx.supabase.co"
                        defaultValue={config.url}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Anon Key (Public API Key)</label>
                      <textarea 
                        name="key"
                        required
                        rows="4"
                        placeholder="eyJhbGciOi..."
                        defaultValue={config.anonKey}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-950/30 transition-all"
                    >
                      Conectar e Validar
                    </button>
                  </form>
                )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
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

    </div>
  );
}

// Renderizar o App React na div root
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
