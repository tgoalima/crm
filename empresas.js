// empresas.js — Módulo Empresa 360º Premium v3.2
// Suprimática CRM — Gestão Comercial

// ─────────────────────────────────────────────
// SEGMENTOS
// ─────────────────────────────────────────────
const SEGMENTOS_DEFAULT = [
  'Saúde / Hospitalar', 'Agronegócio / Usinas', 'Indústria Metalmecânica',
  'Construção Civil', 'Distribuição & Logística', 'Educação',
  'Financeiro & Seguros', 'Varejo & E-commerce', 'Tecnologia',
  'Têxtil & Moda', 'Alimentício & Bebidas', 'Energia & Utilities',
  'Governo & Público', 'Automotivo', 'Mineração', 'Telecomunicações',
];
const carregarSegmentos = () => {
  try { const s = localStorage.getItem('crm_segmentos'); return s ? JSON.parse(s) : SEGMENTOS_DEFAULT; }
  catch { return SEGMENTOS_DEFAULT; }
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const formatCNPJ = (cnpj) => {
  if (!cnpj) return null;
  const d = cnpj.replace(/\D/g, '');
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : cnpj;
};
// Máscara progressiva de CNPJ aplicada durante a digitação (onChange)
const maskCNPJ = (v) => {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};
const formatPhone = (phone) => {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
};
const formatCurrency = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// Helper: retorna headers com Authorization do token pessoal do ClickUp
// (espelha getSupabaseHeaders() de app.js, mas em escopo próprio para empresas.js)
const getEmpresasClickUpHeaders = () => {
  try {
    const token = localStorage.getItem('crm_user_clickup_token');
    return token ? { 'Authorization': token } : {};
  } catch { return {}; }
};

// Helper: retorna o clickup_user_id do perfil salvo no localStorage.
// Usado para preencher criado_por_user_id nos INSERTs, permitindo que as
// Edge Functions de sync resolvam o token pessoal do vendedor.
const getCriadoPorUserId = () => {
  try {
    const raw = localStorage.getItem('crm_user_profile');
    if (!raw) return null;
    const profile = JSON.parse(raw);
    return profile?.id ? String(profile.id) : null;
  } catch { return null; }
};

const normalizeTier = (t) => {
  if (!t || t === '0' || t === 'none' || t === '') return null;
  if (t === '1' || t === 'Tier 1') return { label: 'Tier 1', Icon: IconDiamond, color: 'bg-violet-50 text-violet-700 border-violet-200', cardColor: 'bg-violet-50 text-violet-700 border-violet-200', accentBorder: 'border-l-violet-400' };
  if (t === '2' || t === 'Tier 2') return { label: 'Tier 2', Icon: IconStar, color: 'bg-amber-50 text-amber-700 border-amber-200', cardColor: 'bg-amber-50 text-amber-700 border-amber-200', accentBorder: 'border-l-amber-400' };
  if (t === '3' || t === 'Tier 3') return { label: 'Tier 3', Icon: IconPackage, color: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', cardColor: 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', accentBorder: 'border-l-slate-300' };
  return null;
};

const normalizeStatus = (s) => {
  const map = {
    'active':        { label: 'Active',        color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    'customer base': { label: 'Customer Base', color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-500'     },
    'prospect':      { label: 'Prospect',      color: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500'    },
    'at risk':       { label: 'At Risk',        color: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500'    },
  };
  return map[(s || '').toLowerCase()] || { label: s || '—', color: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' };
};

// Paleta de cores sólidas de alto contraste (sem degradê)
const CORES_SOLIDAS = [
  '#4f46e5', // Indigo
  '#0284c7', // Sky
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#e11d48', // Rose
  '#0d9488', // Teal
  '#334155', // Slate
  '#2563eb', // Blue
  '#9333ea', // Purple
];

const getAvatarColor = (nome) => {
  if (!nome || !nome.trim()) return CORES_SOLIDAS[0];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash << 5) - hash + nome.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % CORES_SOLIDAS.length;
  return CORES_SOLIDAS[idx];
};

const getInitials = (nome) => {
  if (!nome || !nome.trim()) return '??';
  const words = nome.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
};

const resolveNegocioValor = (negocio, propostasPorNegocio) => {
  const key = String(negocio.clickup_negocio_id || '').replace('#', '').trim();
  const props = propostasPorNegocio.get(key) || propostasPorNegocio.get(negocio.clickup_negocio_id) || propostasPorNegocio.get(negocio.id) || [];
  if (!props.length) {
    const fallback = parseFloat(negocio.valor_clickup_fallback);
    return isNaN(fallback) ? 0 : fallback;
  }
  const prio = ['Selecionada','Ganho','Ativa','Desconsiderada'];
  const best = prio.reduce((f, sit) => f || props.find(p => p.situacao === sit), null) || props[0];
  const v = parseFloat(best.total_proposta);
  return isNaN(v) ? 0 : v;
};

const ESTAGIOS_ORDEM = ['Registro','Qualificação','Proposta','Desenvolvimento','Negociação','Termo de aceite'];
const ESTAGIOS_FECHADOS = new Set(['Ganho','Perdido','Congelado']);
const ESTAGIO_CLICKUP_IDS = {
  'Registro': '3c4bcf81-91d3-40e7-97ae-a67b6bccea0c',
  'Qualificação': '1cc9d0c7-cbee-45ff-8bbe-ac4a29ec9f46',
  'Proposta': '5366c82c-2317-4978-8f4d-b41cb953be35',
  'Desenvolvimento': '97c5f286-e054-4351-b368-25977e8c429d',
  'Negociação': '4863ea9f-ccd7-4b49-9aa5-685ee479e091',
  'Termo de aceite': '22e91843-d067-4358-8238-6e619fc66653',
  'Ganho': 'c59ad408-ae8e-45d7-804f-eb9e6cd2935b',
  'Perdido': '7520c5bc-95a4-47aa-8b12-0711f5bc9bfe',
  'Congelado': 'c231299c-44f8-4f5e-ad8e-58f7b8e01213'
};

// ─────────────────────────────────────────────
// ÍCONES SVG PREMIUM (sem emoji, inline SVG)
// ─────────────────────────────────────────────
const IconEdit = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconTrash = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
);

const IconUsers = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconBriefcase = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);

const IconPercent = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
  </svg>
);

const IconX = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconClose = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// Conjunto de ícones adicional — substitui os emojis usados como ícone de
// interface (🏢🔍📍💰⚡📄🏆📞✉️🔄⭐💎📦❄️😞) por SVGs no mesmo estilo dos
// ícones acima, pra tirar a mistura emoji+SVG e deixar a linguagem visual
// consistente em todo o módulo (e reaproveitado também nas Tarefas Comerciais).
const IconBuilding = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
    <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
  </svg>
);
const IconSearch = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconMapPin = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconDollar = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);
const IconZap = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconDocument = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IconTrophy = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/>
    <path d="M17 4h3a2 2 0 0 1-2 4h-1"/><path d="M7 4H4a2 2 0 0 0 2 4h1"/>
  </svg>
);
const IconMail = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22 6 12 13 2 6"/>
  </svg>
);
const IconPhone = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const IconStar = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IconDiamond = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/>
  </svg>
);
const IconPackage = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconSnowflake = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="2" x2="12" y2="22"/><line x1="4" y1="7" x2="20" y2="17"/><line x1="4" y1="17" x2="20" y2="7"/>
  </svg>
);
const IconFrown = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);
const IconRefresh = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

// ─────────────────────────────────────────────
// COMPONENTES DE CAMPO (globais — sem bug de foco)
// ─────────────────────────────────────────────
const CRMInput = ({ label, name, value, onChange, type = 'text', placeholder, mono, required, className = '', mask }) => (
  <div className={className}>
    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{label}{required && ' *'}</label>
    <input
      type={type} required={required} placeholder={placeholder} value={value}
      onChange={e => onChange(name, mask ? mask(e.target.value) : e.target.value)}
      className={`w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm shadow-xs ${mono ? 'font-mono' : 'font-medium'} text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all`}
    />
  </div>
);

// Máscara progressiva de valor monetário (BRL): digita "999751,68" enquanto
// armazena o valor numérico puro ("999751.68") para compatibilidade com
// parseFloat() no restante do código.
const maskCurrencyInput = (raw) => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { display: '', numeric: '' };
  const value = parseInt(digits, 10) / 100;
  const display = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { display, numeric: value.toFixed(2) };
};

const CRMCurrencyInput = ({ label, name, value, onChange, placeholder = '0,00', className = '', required }) => {
  const [display, setDisplay] = React.useState(() => {
    const n = parseFloat(value);
    return !value || isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
  const handleInput = (e) => {
    const { display: d, numeric } = maskCurrencyInput(e.target.value);
    setDisplay(d);
    onChange(name, numeric);
  };
  return (
    <div className={className}>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{label}{required && ' *'}</label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm font-bold pointer-events-none">R$</span>
        <input type="text" inputMode="decimal" required={required} placeholder={placeholder} value={display} onChange={handleInput}
          className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
      </div>
    </div>
  );
};

const CRMSelect = ({ label, name, value, onChange, children, className = '' }) => (
  <div className={className}>
    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{label}</label>
    <select value={value} onChange={e => onChange(name, e.target.value)} className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 cursor-pointer">{children}</select>
  </div>
);

const DadoCampo = ({ label, value, href, mono }) => (
  <div>
    <dt className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</dt>
    <dd className={`text-sm font-semibold ${mono ? 'font-mono tracking-wide' : ''} ${value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300'}`}>
      {href && value ? <a href={href} className="text-indigo-600 hover:underline">{value}</a> : (value || '—')}
    </dd>
  </div>
);

// Combobox de Segmentos
const SegmentoCombobox = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [busca, setBusca] = React.useState('');
  const [highlight, setHighlight] = React.useState(-1);
  const listRef = React.useRef(null);
  const segmentos = React.useMemo(() => carregarSegmentos(), []);
  const filtered = React.useMemo(() => {
    const q = busca.trim() || value || '';
    if (!q) return segmentos;
    return segmentos.filter(s => s.toLowerCase().includes(q.toLowerCase()));
  }, [busca, value, segmentos]);

  React.useEffect(() => { setHighlight(-1); }, [filtered]);

  const handleInputChange = React.useCallback((e) => {
    setBusca(e.target.value);
    onChange('industry', e.target.value);
    setOpen(true);
  }, [onChange]);
  const handleSelect = React.useCallback((s) => {
    onChange('industry', s);
    setBusca('');
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = React.useCallback((e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (!filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(i => {
        const next = i < filtered.length - 1 ? i + 1 : 0;
        listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(i => {
        const next = i > 0 ? i - 1 : filtered.length - 1;
        listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, filtered, highlight, handleSelect]);

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Segmento de Atuação</label>
      <input type="text" placeholder="Digite ou selecione..." value={value || busca} onChange={handleInputChange} onKeyDown={handleKeyDown} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
      {open && filtered.length > 0 && (
        <div className="absolute z-[110] top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          <div ref={listRef} className="max-h-44 overflow-y-auto divide-y divide-slate-50">
            {filtered.map((s, i) => (
              <button key={s} type="button" onMouseDown={() => handleSelect(s)} onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${i === highlight ? 'bg-indigo-50 text-indigo-700' : 'text-slate-800 dark:text-slate-200 hover:bg-indigo-50 hover:text-indigo-700'}`}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Avatar Component com cor sólida e alto contraste (sem degradê)
const AvatarInicial = ({ nome, size = 'md', className = '' }) => {
  const sizeMap = {
    xs: 'w-7 h-7 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-xs font-bold',
    lg: 'w-11 h-11 text-sm font-bold',
    xl: 'w-13 h-13 text-base font-extrabold',
  };
  const color = getAvatarColor(nome);
  const ini = getInitials(nome);
  return (
    <div
      style={{ backgroundColor: color }}
      className={`rounded-xl text-white flex items-center justify-center shrink-0 select-none shadow-xs font-bold tracking-wide ${sizeMap[size] || sizeMap.md} ${className}`}
    >
      {ini}
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL EMPRESA
// ─────────────────────────────────────────────
const EmpresaFormModal = ({ supabaseClient, conta, onClose, onSalvo }) => {
  const isEdit = !!conta;
  const [form, setForm] = React.useState({
    nome: conta?.nome || '', razao_social: conta?.razao_social || '',
    cnpj: maskCNPJ(conta?.cnpj || ''), inscricao_estadual: conta?.inscricao_estadual || '',
    status: conta?.status || 'customer base', account_tier: conta?.account_tier || '',
    industry: conta?.industry || '', billing_cycle: conta?.billing_cycle || 'One-time',
    email: conta?.email || '', telefone: conta?.telefone || '',
    rua: conta?.rua || '', cidade: conta?.cidade || '', estado: conta?.estado || 'SP', cep: conta?.cep || '',
  });
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const handleChange = React.useCallback((field, value) => setForm(prev => ({ ...prev, [field]: value })), []);

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro('Informe o nome fantasia da empresa.');
    setSalvando(true); setErro('');
    try {
      if (isEdit) {
        const { error } = await supabaseClient.from('contas').update({ ...form, updated_at: new Date().toISOString() }).eq('id', conta.id);
        if (error) throw error;

        // Atualiza no ClickUp se houver ID válido
        if (conta.clickup_account_id && !conta.clickup_account_id.startsWith('crm_')) {
          try {
            await fetch(`/clickup-api/task/${conta.clickup_account_id}?custom_item_id=1005`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...getEmpresasClickUpHeaders() },
              body: JSON.stringify({
                name: form.nome.trim(),
                custom_item_id: 1005,
                status: form.status || 'customer base',
                custom_fields: [
                  { id: 'bc39138f-fe02-4480-9c08-f1a8a4eefd5d', value: '4e096a5b-96d7-4a40-baec-1fde61909cb0' }, // CRM Item Type: Conta
                  { id: '922c6189-1843-4039-90af-e45dd920cef4', value: form.razao_social || '' },
                  { id: '599b82f5-c87e-4248-a5dc-724027a29130', value: form.cnpj || '' },
                  { id: '0fe8980d-9591-4d36-974c-58d13d864352', value: form.email || '' },
                  { id: '8e9075cd-05c8-4be5-aa44-5615c216c868', value: form.telefone || '' },
                  { id: '95dbcd56-ebc5-4196-89e0-48185328367e', value: form.cidade || '' },
                  { id: '1ee2496a-94f9-4962-82e8-035a5136efcc', value: form.estado || '' },
                  { id: 'e5e777af-7e38-4707-b2ad-b3fdbd5cf239', value: form.rua || '' },
                  { id: '5c99dab5-3ee4-4071-b723-f17be8c94397', value: form.cep || '' }
                ]
              })
            });
          } catch (cuErr) {
            console.warn('[ClickUp Sync] Falha ao atualizar no ClickUp:', cuErr);
          }
        }
      } else {
        // Grava no Supabase primeiro (clickup_account_id NULL, sync_status
        // 'pending') e retorna na hora — a Edge Function sync-conta-clickup
        // cria a tarefa no ClickUp em segundo plano, disparada pelo Database
        // Webhook no INSERT.
        const { error } = await supabaseClient.from('contas').insert({
          clickup_account_id: null,
          ...form,
          criado_por_user_id: getCriadoPorUserId(),
          sync_status: 'pending',
        });
        if (error) throw error;
      }
      onSalvo();
    } catch (err) { setErro('Erro: ' + (err.message || err)); setSalvando(false); }
  };

  const SectionTitle = ({ children }) => (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{children}</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col ring-1 ring-slate-200 dark:ring-slate-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50/70 via-white to-white shrink-0">
          <AvatarInicial nome={form.nome || 'N'} size="lg" />
          <div className="flex-1">
            <h3 className="font-black text-base text-slate-900 dark:text-slate-100">{isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{isEdit ? conta.nome : 'Cadastre uma nova empresa'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Fechar"><IconClose /></button>
        </div>
        <form onSubmit={salvar} className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-100/70 dark:bg-slate-700/70">
          {erro && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">{erro}</div>}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Identificação</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <CRMInput label="Nome Fantasia / Comercial" name="nome" value={form.nome} onChange={handleChange} placeholder="Ex: Hospital do Câncer de Londrina" required className="col-span-2" />
              <CRMInput label="Razão Social" name="razao_social" value={form.razao_social} onChange={handleChange} placeholder="Ex: Fundação Hospitalar Ltda" />
              <CRMInput label="CNPJ" name="cnpj" value={form.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" mono mask={maskCNPJ} />
              <CRMInput label="Inscrição Estadual" name="inscricao_estadual" value={form.inscricao_estadual} onChange={handleChange} placeholder="Ex: 123.456.789.012" mono />
              <CRMSelect label="Status da Conta" name="status" value={form.status} onChange={handleChange}>
                <option value="customer base">Customer Base</option>
                <option value="active">Active (Ativa)</option>
                <option value="prospect">Prospect</option>
                <option value="at risk">At Risk (Em Risco)</option>
              </CRMSelect>
              <CRMSelect label="Account Tier" name="account_tier" value={form.account_tier} onChange={handleChange}>
                <option value="">Sem Tier</option>
                <option value="1">💎 Tier 1 (Estratégico)</option>
                <option value="2">⭐ Tier 2 (Médio)</option>
                <option value="3">📦 Tier 3 (Geral)</option>
              </CRMSelect>
              <SegmentoCombobox value={form.industry} onChange={handleChange} />
              <CRMSelect label="Ciclo de Faturamento" name="billing_cycle" value={form.billing_cycle} onChange={handleChange}>
                <option value="One-time">One-time (Pontual)</option>
                <option value="1">1 Ano (Anual)</option>
                <option value="3">3 Anos</option>
                <option value="5">5 Anos</option>
              </CRMSelect>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Canais de Contato</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <CRMInput label="E-mail Corporativo" name="email" type="email" value={form.email} onChange={handleChange} placeholder="contato@empresa.com.br" />
              <CRMInput label="Telefone Principal" name="telefone" value={form.telefone} onChange={handleChange} placeholder="(11) 3333-0000" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Endereço</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <CRMInput label="Logradouro / Endereço" name="rua" value={form.rua} onChange={handleChange} placeholder="Av. Paulista, 1000" className="col-span-2" />
              <CRMInput label="Cidade" name="cidade" value={form.cidade} onChange={handleChange} placeholder="São Paulo" />
              <div className="grid grid-cols-2 gap-2">
                <CRMInput label="UF" name="estado" value={form.estado} onChange={handleChange} placeholder="SP" />
                <CRMInput label="CEP" name="cep" value={form.cep} onChange={handleChange} placeholder="01310-100" mono />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-xs transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-md shadow-indigo-200 cursor-pointer">
              {salvando ? 'Salvando...' : (isEdit ? '✓ Atualizar Empresa' : '+ Cadastrar Empresa')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL CONTATO
// ─────────────────────────────────────────────
const ContatoFormModal = ({ supabaseClient, conta, contas = [], todosContatos = [], contato, onClose, onSalvo }) => {
  const isEdit = !!contato;
  const [form, setForm] = React.useState({
    nome: contato?.nome || '',
    cargo: contato?.cargo || '',
    email: contato?.email || '',
    celular: contato?.celular || '',
    whatsapp: contato?.whatsapp || '',
    champion: contato?.champion || false,
  });

  // Empresas vinculadas (array de objetos { id, nome })
  const [empresasVinculadas, setEmpresasVinculadas] = React.useState(() => {
    if (!isEdit) return conta ? [conta] : [];
    const normNome = (contato.nome || '').trim().toLowerCase();
    const normEmail = (contato.email || '').trim().toLowerCase();
    const contasIds = new Set();
    if (contato.conta_id) contasIds.add(contato.conta_id);
    if (conta?.id) contasIds.add(conta.id);

    for (const c of todosContatos) {
      const cNome = (c.nome || '').trim().toLowerCase();
      const cEmail = (c.email || '').trim().toLowerCase();
      if ((normNome && cNome === normNome) || (normEmail && cEmail === normEmail && normEmail !== '')) {
        if (c.conta_id) contasIds.add(c.conta_id);
      }
    }
    return contas.filter(c => contasIds.has(c.id));
  });

  const [buscaEmpresa, setBuscaEmpresa] = React.useState('');
  const [showDropdownEmpresa, setShowDropdownEmpresa] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const handleChange = React.useCallback((field, value) => setForm(prev => ({ ...prev, [field]: value })), []);

  const empresasDisponiveis = React.useMemo(() => {
    if (!buscaEmpresa.trim()) return [];
    const t = buscaEmpresa.trim().toLowerCase();
    const vinculadasIds = new Set(empresasVinculadas.map(e => e.id));
    return contas.filter(c => !vinculadasIds.has(c.id) && (c.nome || '').toLowerCase().includes(t)).slice(0, 6);
  }, [contas, empresasVinculadas, buscaEmpresa]);

  const adicionarVinculo = (empresa) => {
    if (!empresasVinculadas.some(e => e.id === empresa.id)) {
      setEmpresasVinculadas(prev => [...prev, empresa]);
    }
    setBuscaEmpresa('');
    setShowDropdownEmpresa(false);
  };

  const removerVinculo = (empresaId) => {
    if (empresasVinculadas.length <= 1) {
      if (!confirm('Ao desvincular a única empresa, este contato sairá desta conta. Confirmar?')) return;
    }
    setEmpresasVinculadas(prev => prev.filter(e => e.id !== empresaId));
  };

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro('Informe o nome do contato.');
    if (empresasVinculadas.length === 0) return setErro('Vincule o contato a pelo menos uma empresa.');

    setSalvando(true);
    setErro('');

    try {
      const normNome = form.nome.trim();
      const normEmail = (form.email || '').trim();
      const contasSelecionadasIds = new Set(empresasVinculadas.map(e => e.id));

      // Contatos existentes do mesmo titular
      const existentesDoTitular = todosContatos.filter(c => {
        const cNome = (c.nome || '').trim().toLowerCase();
        const cEmail = (c.email || '').trim().toLowerCase();
        return (c.id === contato?.id) ||
               (cNome === normNome.toLowerCase()) ||
               (normEmail && cEmail === normEmail.toLowerCase() && normEmail !== '');
      });

      // 1. Atualizar ou Inserir vínculo para cada empresa selecionada
      for (const empresa of empresasVinculadas) {
        const regExistente = existentesDoTitular.find(c => c.conta_id === empresa.id);

        if (regExistente) {
          const { error } = await supabaseClient
            .from('contatos')
            .update({
              nome: normNome,
              cargo: form.cargo || null,
              email: normEmail || null,
              celular: form.celular || null,
              whatsapp: form.whatsapp || null,
              champion: form.champion,
              updated_at: new Date().toISOString()
            })
            .eq('id', regExistente.id);
          if (error) throw error;
        } else {
          // Grava no Supabase primeiro (clickup_contact_id NULL, sync_status
          // 'pending') e segue — a Edge Function sync-contato-clickup cria a
          // tarefa no ClickUp em segundo plano, disparada pelo Database
          // Webhook no INSERT (um contato por empresa vinculada, cada INSERT
          // dispara sua própria sincronização).
          const { error } = await supabaseClient
            .from('contatos')
            .insert({
              conta_id: empresa.id,
              clickup_contact_id: null,
              nome: normNome,
              cargo: form.cargo || null,
              email: normEmail || null,
              celular: form.celular || null,
              whatsapp: form.whatsapp || null,
              champion: form.champion,
              criado_por_user_id: getCriadoPorUserId(),
              sync_status: 'pending',
            });
          if (error) throw error;
        }
      }

      // 2. Remover vínculos que o usuário desmarcou
      for (const reg of existentesDoTitular) {
        if (reg.conta_id && !contasSelecionadasIds.has(reg.conta_id)) {
          await supabaseClient.from('contatos').delete().eq('id', reg.id);
        }
      }

      onSalvo();
    } catch (err) {
      console.error('Erro ao salvar contato:', err);
      setErro('Erro: ' + (err.message || err));
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg shadow-2xl ring-1 border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50/70 via-white to-white shrink-0">
          <AvatarInicial nome={form.nome || 'CT'} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-base text-slate-900 dark:text-slate-100 leading-tight">{isEdit ? 'Editar Contato' : 'Novo Contato'}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
              {empresasVinculadas.length === 1 ? empresasVinculadas[0].nome : `${empresasVinculadas.length} empresas vinculadas`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Fechar"><IconClose /></button>
        </div>

        <form onSubmit={salvar} className="p-6 space-y-4 overflow-y-auto flex-1">
          {erro && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">{erro}</div>}

          {/* VÍNCULO DE EMPRESAS (MULTI-SELEÇÃO) */}
          <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl">
            <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <IconBuilding size={12} /> Empresas Vinculadas <span className="text-indigo-600 font-bold">({empresasVinculadas.length})</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              Vincule este contato a uma ou mais empresas (ex: matriz e filiais) ou troque de empresa caso ele tenha mudado de emprego.
            </p>

            {/* Tags das empresas selecionadas */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {empresasVinculadas.map(emp => (
                <span key={emp.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-indigo-200 text-indigo-900 text-xs font-extrabold rounded-lg shadow-2xs">
                  <span className="flex items-center gap-1"><IconBuilding size={11} /> {emp.nome}</span>
                  <button
                    type="button"
                    onClick={() => removerVinculo(emp.id)}
                    className="text-slate-400 dark:text-slate-500 hover:text-rose-600 rounded-md p-0.5 transition-colors cursor-pointer"
                    title="Remover vínculo desta empresa"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            {/* Campo de busca para adicionar nova empresa */}
            <div className="relative">
              <input
                type="text"
                placeholder="+ Digite para vincular a outra empresa..."
                value={buscaEmpresa}
                onChange={(e) => { setBuscaEmpresa(e.target.value); setShowDropdownEmpresa(true); }}
                onFocus={() => setShowDropdownEmpresa(true)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />

              {showDropdownEmpresa && empresasDisponiveis.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {empresasDisponiveis.map(emp => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => adicionarVinculo(emp)}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                    >
                      <span className="font-bold text-slate-800 dark:text-slate-200">{emp.nome}</span>
                      <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">+ Vincular</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <CRMInput label="Nome Completo" name="nome" value={form.nome} onChange={handleChange} placeholder="Ex: Anderson Galoro" required />
          <CRMInput label="Cargo / Função" name="cargo" value={form.cargo} onChange={handleChange} placeholder="Ex: Gestor de T.I" />
          <CRMInput label="E-mail Corporativo" name="email" type="email" value={form.email} onChange={handleChange} placeholder="anderson@facchini.com.br" />
          
          <div className="grid grid-cols-2 gap-3">
            <CRMInput label="Celular" name="celular" value={form.celular} onChange={handleChange} placeholder="(17) 99721-7526" />
            <CRMInput label="WhatsApp" name="whatsapp" value={form.whatsapp} onChange={handleChange} placeholder="17997217526" />
          </div>

          <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200/70 rounded-xl cursor-pointer select-none">
            <input type="checkbox" checked={form.champion} onChange={e => setForm(p => ({...p, champion: e.target.checked}))} className="w-4 h-4 text-indigo-600 rounded" />
            <div>
              <p className="text-xs font-black text-amber-900 flex items-center gap-1.5"><IconStar size={12} /> Champion / Decisor</p>
              <p className="text-[11px] text-amber-700">Principal tomador de decisão nesta(s) conta(s).</p>
            </div>
          </label>

          <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-md shadow-indigo-200 cursor-pointer">
              {salvando ? 'Salvando...' : (isEdit ? '✓ Atualizar Contato' : '+ Adicionar Contato')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL NOVA OPORTUNIDADE
// ─────────────────────────────────────────────
const TIPO_OPORTUNIDADE_CLICKUP_EMPRESAS = {
  'Projeto': 'fa509e92-7528-4a8b-a9bc-11f2f5da3350',
  'Garantias': '52b4285a-1e92-4ecb-b8b9-7a2348461882',
  'Serviços': '2e351ad7-2af5-4532-be83-fe24423a1994',
  'SSU': '62c6d78c-fa67-44d8-b594-66ed63264df1',
  'Volumes': '62f161bc-b78b-46b7-a73b-1d8faa1a1246',
  'Upgrade': 'e55ef41f-51e6-436e-bb53-79ff688960c7'
};

const RO_CLICKUP_IDS_EMPRESAS = {
  roInfra: '673b8e3f-f6b2-4b09-b536-fe881b9e5780',
  roSw1: '769281a2-dade-47ae-8867-453fbac6adb3',
  roSw2: 'e1a271ac-107d-4131-b63c-87dfb2e2396d',
  roSw3: 'a940746a-b869-4bb7-8f7c-81775c169022',
  roSw4: 'cf2a09b3-a85a-43cb-8e2e-0f1bdfc243f5'
};

// ─────────────────────────────────────────────
// MODAL NOVA OPORTUNIDADE (PRO B2B v4.9)
// ─────────────────────────────────────────────
const NovaOportunidadeModal = ({ supabaseClient, contaFixa, contas = [], contatos = [], vendedores = [], onClose, onCriado }) => {
  const [form, setForm] = React.useState({
    nome: '',
    estagio: 'Registro',
    tipo: 'Projeto',
    valor: '',
    probabilidade: '50',
    dataPrevisao: '',
    contatoId: '',
    responsavelId: '',
    roInfra: '',
    roSw1: '',
    roSw2: '',
    roSw3: '',
    roSw4: '',
    descricao: ''
  });
  const [buscaConta, setBuscaConta] = React.useState('');
  const [contaEscolhida, setContaEscolhida] = React.useState(contaFixa || null);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const contasFiltradas = React.useMemo(() => {
    if (contaFixa || !buscaConta.trim()) return [];
    const t = buscaConta.trim().toLowerCase();
    return (contas || []).filter(c => (c.nome || '').toLowerCase().includes(t)).slice(0, 8);
  }, [contas, buscaConta, contaFixa]);

  const contatosDaConta = React.useMemo(() => {
    if (!contaEscolhida) return [];
    return contatos.filter(c => c.conta_id === contaEscolhida.id);
  }, [contatos, contaEscolhida]);

  const handleChange = React.useCallback((field, value) => {
    setForm(p => ({ ...p, [field]: value }));
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro('Informe o título da oportunidade.');
    if (!contaEscolhida) return setErro('Selecione a empresa vinculada.');
    setSalvando(true); setErro('');

    try {
      // 1. Gera número oficial de proposta no Supabase (síncrono, 100% interno)
      const { data: num, error: numErr } = await supabaseClient.rpc('gerar_numero_proposta');
      if (numErr) throw numErr;

      const valorNum = parseFloat(form.valor) || 0;
      const probNum = parseInt(form.probabilidade) || 50;
      const vendedorEscolhido = form.responsavelId
        ? vendedores.find(v => String(v.id) === form.responsavelId)
        : null;

      // 2. Grava no Supabase primeiro (clickup_negocio_id NULL, sync_status
      // 'pending') e retorna na hora — a Edge Function sync-negocio-clickup
      // cria a tarefa no ClickUp em segundo plano, disparada pelo Database
      // Webhook no INSERT.
      const { error } = await supabaseClient.from('negocios').insert({
        clickup_negocio_id: null,
        nome: form.nome.trim(),
        conta_id: contaEscolhida.id,
        estagio: form.estagio,
        numero_proposta_oficial: num || null,
        valor_clickup_fallback: valorNum > 0 ? valorNum : null,
        tipo_oportunidade: form.tipo || null,
        probabilidade: probNum || null,
        data_previsao: form.dataPrevisao || null,
        descricao: form.descricao || null,
        ro_infra: form.roInfra ? form.roInfra.trim() : null,
        ro_sw1: form.roSw1 ? form.roSw1.trim() : null,
        ro_sw2: form.roSw2 ? form.roSw2.trim() : null,
        ro_sw3: form.roSw3 ? form.roSw3.trim() : null,
        ro_sw4: form.roSw4 ? form.roSw4.trim() : null,
        contato_principal_id: form.contatoId || null,
        responsavel_nome: vendedorEscolhido ? vendedorEscolhido.nome : null,
        responsavel_clickup_id: vendedorEscolhido ? String(vendedorEscolhido.id) : null,
        criado_por_user_id: getCriadoPorUserId(),
        sync_status: 'pending',
      });
      if (error) throw error;

      onCriado();
    } catch (err) { setErro('Erro: ' + (err.message || err)); setSalvando(false); }
  };

  const SectionTitle = ({ children }) => (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{children}</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col ring-1 ring-slate-200 dark:ring-slate-700" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50/70 via-white to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
              <IconBriefcase size={20} />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-slate-100 leading-tight">Nova Oportunidade</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Cadastre um negócio comercial estruturado</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Fechar"><IconClose /></button>
        </div>

        {/* FORM */}
        <form onSubmit={salvar} className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-100/70 dark:bg-slate-700/70">
          {erro && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">{erro}</div>}

          {/* SEÇÃO 1: IDENTIFICAÇÃO */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Identificação da Oportunidade</SectionTitle>
            <div className="space-y-3 mt-2">
              <CRMInput label="Título da Oportunidade" name="nome" value={form.nome} onChange={handleChange} placeholder="Ex: Expansão Servidores Dell PowerEdge R750" required />

              {/* EMPRESA VINCULADA */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Empresa / Conta *</label>
                {contaFixa ? (
                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 shadow-xs rounded-xl">
                    <AvatarInicial nome={contaFixa.nome} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">{contaFixa.nome}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{normalizeStatus(contaFixa.status).label}</p>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <input placeholder="Digite o nome da empresa..." value={contaEscolhida ? contaEscolhida.nome : buscaConta} onChange={e => { setContaEscolhida(null); setBuscaConta(e.target.value); }}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all" />
                    {contasFiltradas.length > 0 && (
                      <div className="absolute z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl mt-1 w-full max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-50">
                        {contasFiltradas.map(c => (
                          <div key={c.id} onClick={() => { setContaEscolhida(c); setBuscaConta(''); }} className="px-4 py-2.5 hover:bg-indigo-50/80 cursor-pointer flex items-center gap-2.5 transition-colors">
                            <AvatarInicial nome={c.nome} size="xs" />
                            <div><p className="text-xs font-bold text-slate-900 dark:text-slate-100">{c.nome}</p><p className="text-[10px] text-slate-400 dark:text-slate-500">{c.cidade || '—'}</p></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CONTATO DECISOR / CHAMPION */}
              {contatosDaConta.length > 0 && (
                <CRMSelect label="Contato Principal / Champion" name="contatoId" value={form.contatoId} onChange={handleChange}>
                  <option value="">Selecione o contato responsável...</option>
                  {contatosDaConta.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.champion ? '⭐ ' : ''}{c.nome}{c.cargo ? ` (${c.cargo})` : ''}
                    </option>
                  ))}
                </CRMSelect>
              )}
            </div>
          </div>

          {/* SEÇÃO 2: PIPELINE & CLASSIFICAÇÃO */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Classificação & Pipeline</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
              <CRMSelect label="Estágio do Funil" name="estagio" value={form.estagio} onChange={handleChange}>
                {['Registro','Qualificação','Proposta','Desenvolvimento','Negociação','Termo de aceite','Ganho','Perdido','Congelado'].map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </CRMSelect>

              <CRMSelect label="Tipo de Oportunidade" name="tipo" value={form.tipo} onChange={handleChange}>
                <option value="Projeto">Projeto</option>
                <option value="Garantias">Garantias</option>
                <option value="Serviços">Serviços</option>
                <option value="SSU">SSU</option>
                <option value="Volumes">Volumes</option>
                <option value="Upgrade">Upgrade</option>
              </CRMSelect>

              <CRMSelect label="Probabilidade" name="probabilidade" value={form.probabilidade} onChange={handleChange}>
                <option value="10">10%</option>
                <option value="30">30%</option>
                <option value="50">50%</option>
                <option value="70">70%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
              </CRMSelect>

              <CRMSelect label="Responsável" name="responsavelId" value={form.responsavelId} onChange={handleChange}>
                <option value="">Selecione o responsável...</option>
                {vendedores.map(v => (
                  <option key={v.id} value={String(v.id)}>{v.nome}</option>
                ))}
              </CRMSelect>
            </div>
          </div>

          {/* SEÇÃO 3: VALORES & PREVISÃO */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Valores & Previsão</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <CRMCurrencyInput label="Valor Estimado" name="valor" value={form.valor} onChange={handleChange} />
              <CRMInput label="Previsão de Fechamento do Negócio" name="dataPrevisao" type="date" value={form.dataPrevisao} onChange={handleChange} />
            </div>
          </div>

          {/* SEÇÃO 4: REGISTROS DE OPORTUNIDADE (R.O.) */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Registros de Oportunidade (R.O.)</SectionTitle>
            <div className="space-y-2.5 mt-2">
              <CRMInput label="R.O: Infraestrutura" name="roInfra" value={form.roInfra} onChange={handleChange} placeholder="Ex: Dell RO #123456" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <CRMInput label="R.O: Software 1" name="roSw1" value={form.roSw1} onChange={handleChange} placeholder="Ex: Veeam RO #98765" />
                <CRMInput label="R.O: Software 2" name="roSw2" value={form.roSw2} onChange={handleChange} placeholder="Ex: Fortinet RO #54321" />
                <CRMInput label="R.O: Software 3" name="roSw3" value={form.roSw3} onChange={handleChange} placeholder="Ex: VMware RO #11223" />
                <CRMInput label="R.O: Software 4" name="roSw4" value={form.roSw4} onChange={handleChange} placeholder="Ex: Red Hat RO #44556" />
              </div>
            </div>
          </div>

          {/* SEÇÃO 5: ESCOPO & NOTAS */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Escopo & Solução Técnica</SectionTitle>
            <div className="mt-2">
              <textarea
                placeholder="Descreva o escopo da solução (ex: Fabricantes envolvidos: Dell, Veeam, Fortinet; servidores, switches, licenciamento, serviços de implantação...)"
                value={form.descricao}
                onChange={e => handleChange('descricao', e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              />
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-xs transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-md shadow-indigo-200 cursor-pointer">
              {salvando ? 'Criando...' : '+ Criar Oportunidade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL EDITAR OPORTUNIDADE (PRO B2B v4.9)
// ─────────────────────────────────────────────
const EditarOportunidadeModal = ({ supabaseClient, negocio, contatos = [], vendedores = [], onClose, onSalvo }) => {
  const [form, setForm] = React.useState({
    nome: negocio?.nome || '',
    estagio: negocio?.estagio || 'Registro',
    tipo: 'Projeto',
    valor: negocio?.valor_clickup_fallback ? String(negocio.valor_clickup_fallback) : '',
    probabilidade: '50',
    dataPrevisao: '',
    responsavelId: negocio?.responsavel_clickup_id || '',
    roInfra: '',
    roSw1: '',
    roSw2: '',
    roSw3: '',
    roSw4: '',
    descricao: ''
  });
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // Carrega campos existentes do ClickUp se houver tarefa vinculada
  React.useEffect(() => {
    if (!negocio?.clickup_negocio_id || negocio.clickup_negocio_id.startsWith('crm_neg_')) return;
    (async () => {
      try {
        const res = await fetch(`/clickup-api/task/${negocio.clickup_negocio_id}`, {
          headers: { ...getEmpresasClickUpHeaders() }
        });
        if (res.ok) {
          const t = await res.json();
          const cfMap = new Map((t.custom_fields || []).map(f => [f.id, f.value]));
          setForm(p => ({
            ...p,
            descricao: t.text_content || t.description || p.descricao,
            dataPrevisao: t.due_date ? new Date(parseInt(t.due_date)).toISOString().split('T')[0] : p.dataPrevisao,
            roInfra: cfMap.get(RO_CLICKUP_IDS_EMPRESAS.roInfra) || p.roInfra,
            roSw1: cfMap.get(RO_CLICKUP_IDS_EMPRESAS.roSw1) || p.roSw1,
            roSw2: cfMap.get(RO_CLICKUP_IDS_EMPRESAS.roSw2) || p.roSw2,
            roSw3: cfMap.get(RO_CLICKUP_IDS_EMPRESAS.roSw3) || p.roSw3,
            roSw4: cfMap.get(RO_CLICKUP_IDS_EMPRESAS.roSw4) || p.roSw4,
          }));
        }
      } catch (e) {}
    })();
  }, [negocio?.clickup_negocio_id]);

  const handleChange = React.useCallback((field, value) => {
    setForm(p => ({ ...p, [field]: value }));
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro('Informe o título do negócio.');
    setSalvando(true); setErro('');

    try {
      const valorNum = parseFloat(form.valor) || 0;
      const probNum = parseInt(form.probabilidade) || 50;
      // Se o responsável não mudou mas está oculto (fora de vendedoresVisiveis),
      // não achar na lista não pode significar "limpar" — mantém o nome original.
      const responsavelInalterado = form.responsavelId === (negocio?.responsavel_clickup_id || '');
      const vendedorEscolhido = form.responsavelId
        ? (vendedores.find(v => String(v.id) === form.responsavelId)
          || (responsavelInalterado ? { id: negocio.responsavel_clickup_id, nome: negocio.responsavel_nome } : null))
        : null;

      // 1. Atualiza no Supabase
      const { error } = await supabaseClient
        .from('negocios')
        .update({
          nome: form.nome.trim(),
          estagio: form.estagio,
          valor_clickup_fallback: valorNum > 0 ? valorNum : null,
          responsavel_nome: vendedorEscolhido ? vendedorEscolhido.nome : null,
          responsavel_clickup_id: vendedorEscolhido ? String(vendedorEscolhido.id) : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', negocio.id);
      if (error) throw error;

      // 2. Atualiza no ClickUp se houver ID válido
      if (negocio.clickup_negocio_id && !negocio.clickup_negocio_id.startsWith('crm_neg_')) {
        try {
          const customFields = [
            { id: 'bc39138f-fe02-4480-9c08-f1a8a4eefd5d', value: 'cd6922b0-34f4-45e3-853a-cba995a2591c' }, // Negócio
            ...(ESTAGIO_CLICKUP_IDS[form.estagio] ? [{ id: 'c8d0abe2-c59f-4a9e-93ff-bd060659aa63', value: ESTAGIO_CLICKUP_IDS[form.estagio] }] : []),
            ...(TIPO_OPORTUNIDADE_CLICKUP_EMPRESAS[form.tipo] ? [{ id: '5d384245-0640-4621-a2dd-98370f7efa82', value: TIPO_OPORTUNIDADE_CLICKUP_EMPRESAS[form.tipo] }] : []),
            ...(valorNum > 0 ? [{ id: 'ee65221a-029d-4d0a-a981-b71b5a29b4b4', value: valorNum }] : []),
            ...(probNum ? [{ id: '2c667b12-79c6-4949-b995-5c3938e7ff51', value: probNum }] : []),
            ...(form.roInfra !== undefined ? [{ id: RO_CLICKUP_IDS_EMPRESAS.roInfra, value: form.roInfra.trim() }] : []),
            ...(form.roSw1 !== undefined ? [{ id: RO_CLICKUP_IDS_EMPRESAS.roSw1, value: form.roSw1.trim() }] : []),
            ...(form.roSw2 !== undefined ? [{ id: RO_CLICKUP_IDS_EMPRESAS.roSw2, value: form.roSw2.trim() }] : []),
            ...(form.roSw3 !== undefined ? [{ id: RO_CLICKUP_IDS_EMPRESAS.roSw3, value: form.roSw3.trim() }] : []),
            ...(form.roSw4 !== undefined ? [{ id: RO_CLICKUP_IDS_EMPRESAS.roSw4, value: form.roSw4.trim() }] : [])
          ];

          await fetch(`/clickup-api/task/${negocio.clickup_negocio_id}?custom_item_id=1004`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getEmpresasClickUpHeaders() },
            body: JSON.stringify({
              name: form.nome.trim(),
              custom_item_id: 1004,
              description: form.descricao || undefined,
              custom_fields: customFields,
              ...(form.dataPrevisao ? { due_date: new Date(form.dataPrevisao + 'T12:00:00Z').getTime() } : {})
            })
          });
        } catch (cuErr) {
          console.warn('[ClickUp Sync] Falha ao atualizar negócio no ClickUp:', cuErr);
        }
      }

      onSalvo();
    } catch (err) { setErro('Erro: ' + (err.message || err)); setSalvando(false); }
  };

  const SectionTitle = ({ children }) => (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{children}</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600"></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col ring-1 ring-slate-200 dark:ring-slate-700" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50/70 via-white to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
              <IconBriefcase size={20} />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-slate-100 leading-tight">Editar Oportunidade</h3>
              {negocio?.numero_proposta_oficial && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg mt-0.5">
                  Nº da Oportunidade: {negocio.numero_proposta_oficial}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Fechar"><IconClose /></button>
        </div>

        {/* FORM */}
        <form onSubmit={salvar} className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-100/70 dark:bg-slate-700/70">
          {erro && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">{erro}</div>}

          {/* SEÇÃO 1: IDENTIFICAÇÃO */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Identificação da Oportunidade</SectionTitle>
            <div className="space-y-3 mt-2">
              <CRMInput label="Título da Oportunidade" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
          </div>

          {/* SEÇÃO 2: PIPELINE & CLASSIFICAÇÃO */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Classificação & Pipeline</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
              <CRMSelect label="Estágio do Funil" name="estagio" value={form.estagio} onChange={handleChange}>
                {['Registro','Qualificação','Proposta','Desenvolvimento','Negociação','Termo de aceite','Ganho','Perdido','Congelado'].map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </CRMSelect>

              <CRMSelect label="Tipo de Oportunidade" name="tipo" value={form.tipo} onChange={handleChange}>
                <option value="Projeto">Projeto</option>
                <option value="Garantias">Garantias</option>
                <option value="Serviços">Serviços</option>
                <option value="SSU">SSU</option>
                <option value="Volumes">Volumes</option>
                <option value="Upgrade">Upgrade</option>
              </CRMSelect>

              <CRMSelect label="Probabilidade" name="probabilidade" value={form.probabilidade} onChange={handleChange}>
                <option value="10">10%</option>
                <option value="30">30%</option>
                <option value="50">50%</option>
                <option value="70">70%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
              </CRMSelect>

              <CRMSelect label="Responsável" name="responsavelId" value={form.responsavelId} onChange={handleChange}>
                <option value="">Selecione o responsável...</option>
                {vendedores.map(v => (
                  <option key={v.id} value={String(v.id)}>{v.nome}</option>
                ))}
              </CRMSelect>
            </div>
          </div>

          {/* SEÇÃO 3: VALORES & PREVISÃO */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Valores & Previsão</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <CRMCurrencyInput label="Valor Estimado" name="valor" value={form.valor} onChange={handleChange} />
              <CRMInput label="Previsão de Fechamento do Negócio" name="dataPrevisao" type="date" value={form.dataPrevisao} onChange={handleChange} />
            </div>
          </div>

          {/* SEÇÃO 4: REGISTROS DE OPORTUNIDADE (R.O.) */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Registros de Oportunidade (R.O.)</SectionTitle>
            <div className="space-y-2.5 mt-2">
              <CRMInput label="R.O: Infraestrutura" name="roInfra" value={form.roInfra} onChange={handleChange} placeholder="Ex: Dell RO #123456" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <CRMInput label="R.O: Software 1" name="roSw1" value={form.roSw1} onChange={handleChange} placeholder="Ex: Veeam RO #98765" />
                <CRMInput label="R.O: Software 2" name="roSw2" value={form.roSw2} onChange={handleChange} placeholder="Ex: Fortinet RO #54321" />
                <CRMInput label="R.O: Software 3" name="roSw3" value={form.roSw3} onChange={handleChange} placeholder="Ex: VMware RO #11223" />
                <CRMInput label="R.O: Software 4" name="roSw4" value={form.roSw4} onChange={handleChange} placeholder="Ex: Red Hat RO #44556" />
              </div>
            </div>
          </div>

          {/* SEÇÃO 5: ESCOPO & NOTAS */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm shadow-slate-200/50 p-4">
            <SectionTitle>Escopo & Solução Técnica</SectionTitle>
            <div className="mt-2">
              <textarea
                placeholder="Descreva o escopo da solução (ex: Fabricantes envolvidos: Dell, Veeam, Fortinet; servidores, switches, licenciamento, serviços de implantação...)"
                value={form.descricao}
                onChange={e => handleChange('descricao', e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              />
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-xs transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition-all shadow-md shadow-indigo-200 cursor-pointer">
              {salvando ? 'Salvando...' : '✓ Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DRAWER FICHA 360º v3.2
// ─────────────────────────────────────────────
const FichaEmpresaDrawer = ({ conta, negocios, contatos, propostasPorNegocio, onClose, onOpenNegocio, onNovaOportunidade, onNovoContato, onEditarEmpresa, onEditarContato, onExcluirContato, onExcluirEmpresa, onEditarNegocio, onExcluirNegocio, isModalAberto }) => {
  const [aba, setAba] = React.useState('visao_geral');
  const [filtroEstagio, setFiltroEstagio] = React.useState('todos');

  React.useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && !isModalAberto) onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, isModalAberto]);

  const kpis = React.useMemo(() => {
    let ganho=0,pipeline=0,qtdGanho=0,qtdPerdido=0,qtdAberto=0;
    for (const n of negocios) {
      const v = resolveNegocioValor(n, propostasPorNegocio);
      if (n.estagio === 'Ganho') { ganho+=v; qtdGanho++; }
      else if (n.estagio === 'Perdido') qtdPerdido++;
      else if (n.estagio !== 'Congelado') { pipeline+=v; qtdAberto++; }
    }
    const taxa = (qtdGanho+qtdPerdido) > 0 ? Math.round((qtdGanho/(qtdGanho+qtdPerdido))*100) : 0;
    return { ganho,pipeline,qtdGanho,qtdPerdido,qtdAberto,taxa,total:negocios.length };
  }, [negocios, propostasPorNegocio]);

  const statsNegocios = React.useMemo(() => {
    let ganho=0,perdido=0,congelado=0,aberto=0;
    for (const n of negocios) {
      if (n.estagio==='Ganho') ganho++;
      else if (n.estagio==='Perdido') perdido++;
      else if (n.estagio==='Congelado') congelado++;
      else aberto++;
    }
    return { ganho,perdido,congelado,aberto,total:negocios.length };
  }, [negocios]);

  const negociosFiltrados = React.useMemo(() => {
    if (filtroEstagio==='ganho') return negocios.filter(n => n.estagio==='Ganho');
    if (filtroEstagio==='perdido') return negocios.filter(n => n.estagio==='Perdido');
    if (filtroEstagio==='aberto') return negocios.filter(n => !ESTAGIOS_FECHADOS.has(n.estagio));
    return negocios;
  }, [negocios, filtroEstagio]);

  const renderPipelineBar = (estagio) => {
    const idx = ESTAGIOS_ORDEM.indexOf(estagio);
    const pct = Math.round(((idx >= 0 ? idx+1 : 1) / ESTAGIOS_ORDEM.length) * 100);
    return (<div className="w-24 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden"><div className="bg-indigo-600 h-full rounded-full" style={{ width: `${pct}%` }}></div></div>);
  };

  const tier = normalizeTier(conta.account_tier);
  const status = normalizeStatus(conta.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 h-full flex flex-col shadow-2xl border-l border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="shrink-0 border-b border-slate-100 dark:border-slate-800">
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-start gap-4">
              <AvatarInicial nome={conta.nome} size="xl" />
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">{conta.nome}</h2>
                {conta.razao_social && conta.razao_social !== conta.nome && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{conta.razao_social}</p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{formatCNPJ(conta.cnpj) || 'CNPJ não informado'}{conta.cidade ? ` · ${conta.cidade}/${conta.estado}` : ''}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full border ${status.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>{status.label}
                  </span>
                  {tier && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full border ${tier.color}`}>
                      <tier.Icon size={10} /> {tier.label}
                    </span>
                  )}
                  {conta.industry && (<span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full">{conta.industry}</span>)}
                  {conta.sync_status === 'pending' && <span className="text-[10px] font-bold text-amber-500">sincronizando...</span>}
                  {conta.sync_status === 'failed' && <span className="text-[10px] font-bold text-rose-500" title={conta.sync_error}>falha ao sincronizar</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onEditarEmpresa(conta)} title="Editar dados da empresa" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all shadow-xs cursor-pointer hover:border-indigo-300 hover:text-indigo-600">
                  <IconEdit size={13} /> Editar
                </button>
                <button onClick={() => onExcluirEmpresa(conta)} title="Excluir esta empresa" className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-rose-50 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-all shadow-xs cursor-pointer">
                  <IconTrash size={13} />
                </button>
                <button onClick={onClose} title="Fechar (ESC)" className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer">
                  <IconClose size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* KPI DASHBOARD — 4 Cards Executivos Estruturados */}
          <div className="p-4 bg-gradient-to-b from-slate-100 to-slate-100/60 border-t border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Card 1: Ganhos */}
              <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 border-t-2 border-t-emerald-400 shadow-sm shadow-slate-200/60 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Ganho</span>
                  <IconDollar size={13} className="text-emerald-500" />
                </div>
                <p className="text-sm sm:text-base font-black text-emerald-600 tracking-tight tabular-nums">
                  {kpis.qtdGanho > 0 ? formatCurrency(kpis.ganho) : '—'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">
                  {kpis.qtdGanho} {kpis.qtdGanho === 1 ? 'negócio ganho' : 'negócios ganhos'}
                </p>
              </div>

              {/* Card 2: Pipeline */}
              <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 border-t-2 border-t-indigo-400 shadow-sm shadow-slate-200/60 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pipeline</span>
                  <IconZap size={13} className="text-indigo-500" />
                </div>
                <p className="text-sm sm:text-base font-black text-indigo-600 tracking-tight tabular-nums">
                  {kpis.qtdAberto > 0 ? formatCurrency(kpis.pipeline) : '—'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">
                  {kpis.qtdAberto} em andamento
                </p>
              </div>

              {/* Card 3: Histórico de Negócios */}
              <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 border-t-2 border-t-slate-300 shadow-sm shadow-slate-200/60 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Negócios</span>
                  <IconDocument size={13} className="text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 tracking-tight tabular-nums">
                  {kpis.total}
                </p>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">
                  {kpis.qtdGanho}G · {kpis.qtdPerdido}P · {kpis.qtdAberto}A
                </p>
              </div>

              {/* Card 4: Taxa de Conversão */}
              <div className={`bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 border-t-2 shadow-sm shadow-slate-200/60 flex flex-col justify-between ${kpis.taxa >= 60 ? 'border-t-emerald-400' : kpis.taxa > 0 ? 'border-t-amber-400' : 'border-t-slate-300'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Conversão</span>
                  <IconTrophy size={13} className={kpis.taxa >= 60 ? 'text-emerald-500' : kpis.taxa > 0 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'} />
                </div>
                <p className={`text-sm sm:text-base font-black tracking-tight tabular-nums ${kpis.taxa >= 60 ? 'text-emerald-600' : kpis.taxa > 0 ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500'}`}>
                  {kpis.total > 0 ? `${kpis.taxa}%` : '—'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">
                  {kpis.taxa >= 60 ? 'Alta taxa' : kpis.taxa > 0 ? 'Taxa média' : 'Sem histórico'}
                </p>
              </div>
            </div>
          </div>

          {/* ABAS */}
          <div className="flex border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 gap-1">
            {[['visao_geral','Visão Geral'],['contatos',`Contatos (${contatos.length})`],['oportunidades',`Oportunidades (${negocios.length})`]].map(([id,label]) => (
              <button key={id} onClick={() => setAba(id)} className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${aba===id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/60' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>{label}</button>
            ))}
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40 dark:bg-slate-900/40">

          {/* ABA VISÃO GERAL */}
          {aba === 'visao_geral' && (
            <div className="p-5 space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-700/80">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><IconBuilding size={12} className="text-indigo-500" /> Dados Corporativos</h4>
                  <button onClick={() => onEditarEmpresa(conta)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"><IconEdit size={11} /> Editar</button>
                </div>
                <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 dark:divide-slate-700">
                  <div className="px-5 py-3.5"><DadoCampo label="Razão Social" value={conta.razao_social} /></div>
                  <div className="px-5 py-3.5"><DadoCampo label="CNPJ" value={formatCNPJ(conta.cnpj)} mono /></div>
                  <div className="px-5 py-3.5"><DadoCampo label="Insc. Estadual" value={conta.inscricao_estadual} mono /></div>
                  <div className="px-5 py-3.5"><DadoCampo label="Ciclo de Faturamento" value={conta.billing_cycle} /></div>
                  <div className="px-5 py-3.5"><DadoCampo label="Segmento" value={conta.industry} /></div>
                  <div className="px-5 py-3.5"><DadoCampo label="Account Tier" value={tier ? <span className="flex items-center gap-1.5"><tier.Icon size={12} /> {tier.label}</span> : '—'} /></div>
                </dl>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-700/80">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><IconPhone size={12} className="text-indigo-500" /> Contato Corporativo</h4>
                  </div>
                  <dl className="px-5 py-4 space-y-3">
                    <DadoCampo label="E-mail" value={conta.email} href={conta.email ? `mailto:${conta.email}` : null} />
                    <DadoCampo label="Telefone" value={formatPhone(conta.telefone)} href={conta.telefone ? `tel:${conta.telefone}` : null} />
                  </dl>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-700/80">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><IconMapPin size={12} className="text-indigo-500" /> Localização</h4>
                  </div>
                  <div className="px-5 py-4 space-y-1.5">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{conta.rua || '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{[conta.cidade,conta.estado].filter(Boolean).join(' - ')}{conta.cep ? ` · CEP ${conta.cep}` : ''}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA CONTATOS */}
          {aba === 'contatos' && (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">Equipe & Decisores</p>
                <button onClick={onNovoContato} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-200 cursor-pointer">+ Adicionar Contato</button>
              </div>
              {contatos.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3"><IconUsers size={20} className="text-slate-400 dark:text-slate-500" /></div>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhum contato cadastrado</p>
                  <button onClick={onNovoContato} className="mt-2 text-xs font-bold text-indigo-600 hover:underline cursor-pointer">+ Cadastrar Primeiro Contato</button>
                </div>
              ) : contatos.map(c => (
                <div key={c.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700/90 hover:border-indigo-200 hover:shadow-md transition-all group overflow-hidden">
                  <div className="flex items-center gap-3.5 p-4">
                    <div onClick={() => onEditarContato(c)} className="cursor-pointer flex items-center gap-3.5 flex-1 min-w-0" title="Clique para editar">
                      <AvatarInicial nome={c.nome} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h5 className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors truncate">{c.nome}</h5>
                          {c.champion && <span className="shrink-0 text-amber-500" title="Champion / Principal Decisor"><IconStar size={12} /></span>}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{c.cargo || 'Cargo não informado'}</p>
                        {c.email && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{c.email}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          title={`Enviar e-mail para ${c.email}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold hover:bg-sky-100 transition-colors shadow-2xs"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span>E-mail</span>
                        </a>
                      )}
                      {c.whatsapp && (
                        <a
                          href={`https://wa.me/${c.whatsapp.replace(/\D/g,'')}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir conversa no WhatsApp"
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors shadow-2xs"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.972.531 1.766.799 2.796.8 3.18 0 5.767-2.587 5.768-5.766.001-3.182-2.585-5.787-5.768-5.787zm3.387 8.213c-.14.393-.708.73-1.002.776-.285.045-.649.077-2.07-.487-1.464-.579-2.548-2.062-2.62-2.16-.073-.098-.598-.797-.598-1.521 0-.725.378-1.082.512-1.229.135-.147.294-.184.393-.184.099 0 .197.001.283.006.09.004.21-.034.328.25.122.294.417 1.018.454 1.092.037.074.062.16.012.257-.049.098-.074.159-.148.245-.074.086-.156.192-.222.258-.074.074-.151.155-.065.303.086.148.384.633.824 1.025.567.505 1.045.662 1.193.736.147.074.234.061.32-.037.086-.098.369-.429.467-.577.098-.147.197-.123.332-.074.135.049.859.405 1.007.479.148.074.246.111.283.172.037.061.037.357-.103.75z"/>
                          </svg>
                          <span>WhatsApp</span>
                        </a>
                      )}
                      <button onClick={() => onEditarContato(c)} title="Editar contato" className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"><IconEdit size={13} /></button>
                      <button onClick={() => onExcluirContato(c)} title="Excluir contato" className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"><IconTrash size={13} /></button>
                    </div>
                  </div>
                  {c.champion && (<div className="px-4 py-2 border-t border-amber-100 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/80 rounded-b-2xl"><p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><IconStar size={11} /> Champion — Principal decisor desta conta</p></div>)}
                </div>
              ))}
            </div>
          )}

          {/* ABA OPORTUNIDADES */}
          {aba === 'oportunidades' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 p-1 rounded-xl shadow-2xs overflow-x-auto">
                  {[
                    ['todos', `Todas (${statsNegocios.total})`, 'bg-slate-900'],
                    ['aberto', `Abertas (${statsNegocios.aberto})`, 'bg-indigo-600'],
                    ['ganho', `Ganhas (${statsNegocios.ganho})`, 'bg-emerald-600'],
                    ['perdido', `Perdidas (${statsNegocios.perdido})`, 'bg-rose-600']
                  ].map(([id, label, ac]) => (
                    <button
                      key={id}
                      onClick={() => setFiltroEstagio(id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        filtroEstagio === id ? `${ac} text-white shadow-2xs` : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={onNovaOportunidade}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer shrink-0 whitespace-nowrap"
                  title="Criar nova oportunidade para esta empresa"
                >
                  <IconBriefcase size={14} />
                  <span>+ Nova Oportunidade</span>
                </button>
              </div>
              <div className="space-y-2.5">
                {negociosFiltrados.map(n => {
                  const valor = resolveNegocioValor(n, propostasPorNegocio);
                  const isGanho = n.estagio==='Ganho', isPerdido = n.estagio==='Perdido', isCongelado = n.estagio==='Congelado', isAberto = !isGanho && !isPerdido && !isCongelado;
                  return (
                    <div key={n.id} onClick={() => n.clickup_negocio_id && onOpenNegocio && onOpenNegocio({ id: String(n.clickup_negocio_id).replace('#', '').trim(), name: n.nome, estagio: n.estagio, clickup_negocio_id: n.clickup_negocio_id, numero_proposta_oficial: n.numero_proposta_oficial, conta_id: n.conta_id })} className={`bg-white dark:bg-slate-800 rounded-2xl border transition-all cursor-pointer hover:shadow-md group ${isGanho ? 'border-l-4 border-l-emerald-500 border-slate-200 dark:border-slate-700' : isPerdido ? 'border-l-4 border-l-rose-400 border-slate-200 dark:border-slate-700 opacity-80' : isCongelado ? 'border-l-4 border-l-blue-300 border-slate-200 dark:border-slate-700' : 'border-l-4 border-l-indigo-600 border-slate-200 dark:border-slate-700'}`}>
                      <div className="px-4 py-3.5 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-700 transition-colors leading-snug">{n.nome}</h5>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${isGanho ? 'bg-emerald-50 text-emerald-700' : isPerdido ? 'bg-rose-50 text-rose-700' : isCongelado ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'}`}>
                              {isGanho ? <><IconTrophy size={10} /> Ganho</> : isPerdido ? <><IconFrown size={10} /> Perdido</> : isCongelado ? <><IconSnowflake size={10} /> Congelado</> : n.estagio}
                            </span>
                            {n.numero_proposta_oficial && (<span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-2 py-0.5 rounded-lg">Nº {n.numero_proposta_oficial}</span>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-base font-black ${isGanho ? 'text-emerald-600' : isPerdido ? 'text-rose-600' : isCongelado ? 'text-blue-600' : 'text-slate-900 dark:text-slate-100'}`}>{valor > 0 ? formatCurrency(valor) : '—'}</span>
                          <div className="flex items-center gap-0.5 ml-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onEditarNegocio && onEditarNegocio(n)} title="Editar oportunidade" className="w-7 h-7 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"><IconEdit size={13} /></button>
                            <button onClick={() => onExcluirNegocio && onExcluirNegocio(n)} title="Excluir oportunidade" className="w-7 h-7 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"><IconTrash size={13} /></button>
                          </div>
                        </div>
                      </div>
                      {isAberto && (<div className="px-4 pb-3 flex items-center gap-2"><span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Progresso:</span>{renderPipelineBar(n.estagio)}</div>)}
                    </div>
                  );
                })}
                {negociosFiltrados.length === 0 && (<div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700"><p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhuma oportunidade para este filtro.</p></div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// ABA PRINCIPAL — EMPRESAS v3.2
// ─────────────────────────────────────────────
const EmpresasTab = ({ supabaseClient, onOpenNegocio, vendedores = [] }) => {
  const [contas, setContas] = React.useState([]);
  const [negocios, setNegocios] = React.useState([]);
  const [propostasPorNegocio, setPropostasPorNegocio] = React.useState(new Map());
  const [contatos, setContatos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busca, setBusca] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const [filtroTier, setFiltroTier] = React.useState('');

  const [contaSelecionada, setContaSelecionada] = React.useState(null);
  const [showEmpresaModal, setShowEmpresaModal] = React.useState(false);
  const [empresaParaEditar, setEmpresaParaEditar] = React.useState(null);
  const [showNovaOportunidade, setShowNovaOportunidade] = React.useState(false);
  const [showNovoContato, setShowNovoContato] = React.useState(false);
  const [contatoParaEditar, setContatoParaEditar] = React.useState(null);

  const carregarDados = React.useCallback(async (silent = false) => {
    if (!supabaseClient) return;
    if (!silent) setLoading(true);
    try {
      const [{ data: c }, { data: n }, { data: p }, { data: ct }] = await Promise.all([
        supabaseClient.from('contas').select('id,clickup_account_id,nome,cnpj,inscricao_estadual,cidade,estado,status,account_tier,industry,billing_cycle,razao_social,rua,cep,email,telefone,sync_status,sync_error').order('nome'),
        supabaseClient.from('negocios').select('id,clickup_negocio_id,nome,conta_id,estagio,numero_proposta_oficial,sync_status,sync_error,valor_clickup_fallback,responsavel_nome,responsavel_clickup_id'),
        supabaseClient.from('propostas').select('id,clickup_negocio_id,total_proposta,situacao'),
        supabaseClient.from('contatos').select('id,clickup_contact_id,nome,cargo,email,celular,whatsapp,champion,conta_id,sync_status'),
      ]);
      const propsMap = new Map();
      for (const pr of p || []) {
        const prKey = String(pr.clickup_negocio_id || '').replace('#', '').trim();
        const lista = propsMap.get(prKey) || [];
        lista.push(pr); propsMap.set(prKey, lista);
      }
      setContas(c || []); setNegocios(n || []); setPropostasPorNegocio(propsMap); setContatos(ct || []);
      if (contaSelecionada) {
        const upd = (c || []).find(x => x.id === contaSelecionada.id);
        if (upd) setContaSelecionada(upd);
      }
    } catch (e) { console.error('[EmpresasTab]', e); }
    finally { if (!silent) setLoading(false); }
  }, [supabaseClient, contaSelecionada?.id]);

  React.useEffect(() => { carregarDados(); }, [supabaseClient]);

  // Enquanto houver alguma empresa/contato/negócio ainda 'pending' (sync
  // assíncrono com o ClickUp em andamento), busca os dados de novo a cada
  // 3s, em segundo plano (sem piscar o loading), até tudo sincronizar —
  // assim o selo "sincronizando..." some sozinho quando o webhook terminar,
  // sem precisar trocar de aba ou recarregar a página.
  const temPendente = contas.some(c => c.sync_status === 'pending')
    || negocios.some(n => n.sync_status === 'pending')
    || contatos.some(c => c.sync_status === 'pending');
  React.useEffect(() => {
    if (!temPendente) return;
    const timer = setInterval(() => carregarDados(true), 3000);
    return () => clearInterval(timer);
  }, [temPendente, carregarDados]);

  const handleExcluirContato = async (contato) => {
    if (!confirm(`Excluir o contato "${contato.nome}"?`)) return;
    const { error } = await supabaseClient.from('contatos').delete().eq('id', contato.id);
    if (error) alert('Erro: ' + error.message);
    else carregarDados();
  };

  const handleExcluirEmpresa = async (empresa) => {
    const msg = `Excluir a empresa "${empresa.nome}"?\n\nIsso irá:\n• Remover do CRM local (banco de dados)\n• Excluir a tarefa correspondente no ClickUp\n\nEsta ação não pode ser desfeita!`;
    if (!confirm(msg)) return;
    try {
      // 1. Excluir do Supabase
      const { error } = await supabaseClient.from('contas').delete().eq('id', empresa.id);
      if (error) throw error;

      // 2. Excluir no ClickUp se houver ID vinculado
      if (empresa.clickup_account_id && !empresa.clickup_account_id.startsWith('crm_')) {
        try {
          await fetch(`/clickup-api/task/${empresa.clickup_account_id}`, { method: 'DELETE', headers: { ...getEmpresasClickUpHeaders() } });
        } catch (e) {
          console.warn('[ClickUp Delete] Falha ao excluir no ClickUp:', e);
        }
      }

      setContaSelecionada(null);
      carregarDados();
      alert(`Empresa "${empresa.nome}" removida do CRM com sucesso.`);
    } catch (err) {
      alert('Erro ao excluir: ' + (err.message || err));
    }
  };

  const [negocioParaEditar, setNegocioParaEditar] = React.useState(null);
  const [showEditarNegocio, setShowEditarNegocio] = React.useState(false);

  const handleExcluirNegocio = async (negocio) => {
    const msg = `Excluir a oportunidade "${negocio.nome}"?\n\nIsso irá:\n• Remover do CRM local (banco de dados)\n• Excluir a tarefa correspondente no ClickUp\n\nEsta ação não pode ser desfeita!`;
    if (!confirm(msg)) return;
    try {
      // 1. Exclui do Supabase
      const { error } = await supabaseClient.from('negocios').delete().eq('id', negocio.id);
      if (error) throw error;

      // 2. Exclui no ClickUp se houver ID vinculado
      if (negocio.clickup_negocio_id && !negocio.clickup_negocio_id.startsWith('crm_neg_')) {
        try {
          await fetch(`/clickup-api/task/${negocio.clickup_negocio_id}`, { method: 'DELETE', headers: { ...getEmpresasClickUpHeaders() } });
        } catch (e) {
          console.warn('[ClickUp Delete] Falha ao excluir negócio no ClickUp:', e);
        }
      }

      carregarDados();
      alert(`Oportunidade "${negocio.nome}" excluída com sucesso.`);
    } catch (err) {
      alert('Erro ao excluir oportunidade: ' + (err.message || err));
    }
  };

  // Mapas de métricas
  const mapaMetricas = React.useMemo(() => {
    const contMap = new Map(), negMap = new Map(), pipeMap = new Map(), taxaMap = new Map();
    for (const c of contatos) contMap.set(c.conta_id, (contMap.get(c.conta_id) || 0) + 1);
    for (const n of negocios) {
      negMap.set(n.conta_id, (negMap.get(n.conta_id) || 0) + 1);
      if (!ESTAGIOS_FECHADOS.has(n.estagio)) {
        const v = resolveNegocioValor(n, propostasPorNegocio);
        pipeMap.set(n.conta_id, (pipeMap.get(n.conta_id) || 0) + v);
      }
      const t = taxaMap.get(n.conta_id) || { g: 0, p: 0 };
      if (n.estagio==='Ganho') t.g++; else if (n.estagio==='Perdido') t.p++;
      taxaMap.set(n.conta_id, t);
    }
    return { contMap, negMap, pipeMap, taxaMap };
  }, [contatos, negocios, propostasPorNegocio]);

  const contasFiltradas = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return contas.filter(c => {
      if (filtroStatus && c.status !== filtroStatus) return false;
      const tier = normalizeTier(c.account_tier);
      if (filtroTier && (!tier || tier.label !== filtroTier)) return false;
      if (!t) return true;
      return [(c.nome||''),(c.cnpj||''),(c.cidade||''),(c.razao_social||'')].some(v => v.toLowerCase().includes(t));
    });
  }, [contas, busca, filtroStatus, filtroTier]);

  const isModalAberto = showEmpresaModal || showNovoContato || showNovaOportunidade;

  if (loading && !contas.length) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col space-y-4">
        <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Carregando diretório de empresas...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 min-h-0 overflow-hidden">
      {/* TOPBAR */}
      <div className="shrink-0 px-6 py-3.5 bg-white dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md"><IconBuilding size={18} /></div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 leading-tight">Diretório de Empresas</h2>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5">
              <span className="text-indigo-600 font-extrabold">{contasFiltradas.length}</span> / {contas.length} empresas
            </p>
          </div>
        </div>
        <button onClick={() => { setEmpresaParaEditar(null); setShowEmpresaModal(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-200 cursor-pointer">+ Nova Empresa</button>
      </div>

      {/* FILTROS */}
      <div className="shrink-0 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm shadow-slate-200/40 flex flex-wrap items-center gap-2.5 relative z-10">
        <div className="flex-1 min-w-[220px] relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none"><IconSearch size={13} /></span>
          <input type="text" placeholder="Pesquisar por Nome, CNPJ, Cidade..." value={busca} onChange={e => setBusca(e.target.value)} className="w-full pl-8 pr-7 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500" />
          {busca && <button onClick={() => setBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"><IconX size={11} /></button>}
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
          <option value="">Todos os status</option>
          <option value="customer base">Customer Base</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="at risk">At Risk</option>
        </select>
        <select value={filtroTier} onChange={e => setFiltroTier(e.target.value)} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs focus:outline-none focus:border-indigo-500 cursor-pointer">
          <option value="">Todos os Tiers</option>
          <option value="Tier 1">💎 Tier 1</option>
          <option value="Tier 2">⭐ Tier 2</option>
          <option value="Tier 3">📦 Tier 3</option>
        </select>
      </div>

      {/* GRID DE CARDS v3.2 */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-100/70 dark:bg-slate-700/70">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contasFiltradas.map(conta => {
            const numC = mapaMetricas.contMap.get(conta.id) || 0;
            const numN = mapaMetricas.negMap.get(conta.id) || 0;
            const pipelineValor = mapaMetricas.pipeMap.get(conta.id) || 0;
            const taxaData = mapaMetricas.taxaMap.get(conta.id) || { g:0, p:0 };
            const taxa = (taxaData.g+taxaData.p) > 0 ? Math.round((taxaData.g/(taxaData.g+taxaData.p))*100) : null;
            const tier = normalizeTier(conta.account_tier);
            const status = normalizeStatus(conta.status);

            return (
              <div key={conta.id} onClick={() => setContaSelecionada(conta)} className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 border-l-4 ${tier ? tier.accentBorder : 'border-l-indigo-200'} cursor-pointer hover:border-indigo-300 hover:shadow-xl hover:-translate-y-0.5 transition-all group shadow-sm shadow-slate-200/60 overflow-hidden`}>
                <div className="p-4">
                  {/* Linha 1: Avatar + Nome + Tier */}
                  <div className="flex items-start gap-3 mb-2.5">
                    <AvatarInicial nome={conta.nome} size="md" className="rounded-xl" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">{conta.nome}</h4>
                        {tier && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-lg border shrink-0 ${tier.cardColor}`} title={tier.label}>
                            <tier.Icon size={9} /> <span>{tier.label.replace('Tier ','T')}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 truncate">{formatCNPJ(conta.cnpj) || 'CNPJ não informado'}</p>
                    </div>
                  </div>

                  {/* Linha 2: Localização */}
                  {(conta.cidade || conta.estado) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-2.5 flex items-center gap-1">
                      <IconMapPin size={11} className="text-slate-300" />{[conta.cidade,conta.estado].filter(Boolean).join(', ')}
                    </p>
                  )}

                  {/* Linha 3: Pipeline (se houver) — número em destaque, é a informação mais importante do card */}
                  {pipelineValor > 0 && (
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-800/60 border-l-4 border-l-indigo-500 rounded-xl p-2.5 mb-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-500 dark:text-indigo-400 uppercase tracking-wider block">Pipeline em Aberto</span>
                        <span className="text-base font-black text-indigo-700 dark:text-indigo-300 tracking-tight block mt-0.5">{formatCurrency(pipelineValor)}</span>
                      </div>
                      <div className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900 border border-indigo-200/80 dark:border-indigo-700 rounded-lg text-indigo-700 dark:text-indigo-200 font-extrabold text-[10px] uppercase tracking-wide shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                        <span>Em Aberto</span>
                      </div>
                    </div>
                  )}

                  {/* Footer: Status + Métricas com SVG icons */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${status.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                      {status.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px]" title={`${numC} contato${numC !== 1 ? 's' : ''}`}>
                        <IconUsers size={12} className="text-slate-400 dark:text-slate-500" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">{numC}</span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px]" title={`${numN} negócio${numN !== 1 ? 's' : ''}`}>
                        <IconBriefcase size={12} className="text-slate-400 dark:text-slate-500" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">{numN}</span>
                      </span>
                      {taxa !== null && (
                        <span className="flex items-center gap-1 text-[11px]" title={`Taxa de conversão: ${taxa}%`}>
                          <IconPercent size={11} className={taxa >= 60 ? 'text-emerald-500' : taxa > 0 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'} />
                          <span className={`font-bold ${taxa >= 60 ? 'text-emerald-600' : taxa > 0 ? 'text-amber-600' : 'text-slate-400 dark:text-slate-500'}`}>{taxa}%</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {contasFiltradas.length === 0 && (
          <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 mt-4">
            <div className="flex justify-center mb-3 text-slate-300"><IconSearch size={40} /></div>
            <p className="text-base font-bold text-slate-700 dark:text-slate-300">Nenhuma empresa encontrada</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Ajuste os termos da busca ou os filtros.</p>
          </div>
        )}
      </div>

      {/* DRAWER */}
      {contaSelecionada && (
        <FichaEmpresaDrawer conta={contaSelecionada} negocios={negocios.filter(n => n.conta_id === contaSelecionada.id)} contatos={contatos.filter(c => c.conta_id === contaSelecionada.id)} propostasPorNegocio={propostasPorNegocio} isModalAberto={isModalAberto} onClose={() => setContaSelecionada(null)} onOpenNegocio={onOpenNegocio} onNovaOportunidade={() => setShowNovaOportunidade(true)} onNovoContato={() => { setContatoParaEditar(null); setShowNovoContato(true); }} onEditarEmpresa={(c) => { setEmpresaParaEditar(c); setShowEmpresaModal(true); }} onEditarContato={(ct) => { setContatoParaEditar(ct); setShowNovoContato(true); }} onExcluirContato={handleExcluirContato} onExcluirEmpresa={handleExcluirEmpresa} onEditarNegocio={(n) => { setNegocioParaEditar(n); setShowEditarNegocio(true); }} onExcluirNegocio={handleExcluirNegocio} />
      )}
      {showEmpresaModal && (<EmpresaFormModal supabaseClient={supabaseClient} conta={empresaParaEditar} onClose={() => setShowEmpresaModal(false)} onSalvo={() => { setShowEmpresaModal(false); carregarDados(); }} />)}
      {showNovoContato && contaSelecionada && (<ContatoFormModal supabaseClient={supabaseClient} conta={contaSelecionada} contas={contas} todosContatos={contatos} contato={contatoParaEditar} onClose={() => setShowNovoContato(false)} onSalvo={() => { setShowNovoContato(false); carregarDados(); }} />)}
      {showNovaOportunidade && (<NovaOportunidadeModal supabaseClient={supabaseClient} contaFixa={contaSelecionada} contas={contas} contatos={contatos} vendedores={vendedores} onClose={() => setShowNovaOportunidade(false)} onCriado={() => { setShowNovaOportunidade(false); carregarDados(); }} />)}
      {showEditarNegocio && negocioParaEditar && (<EditarOportunidadeModal supabaseClient={supabaseClient} negocio={negocioParaEditar} contatos={contatos} vendedores={vendedores} onClose={() => setShowEditarNegocio(false)} onSalvo={() => { setShowEditarNegocio(false); carregarDados(); }} />)}
    </div>
  );
};
