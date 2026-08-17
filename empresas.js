// empresas.js
// Aba "Empresas": lista + Ficha 360º por conta. Carregado como script Babel
// separado (mesmo padrão sem-build do app.js) pra não inchar ainda mais um
// arquivo que já tem 8000+ linhas.

// Réplica da lógica de prioridade de proposta já usada no Kanban
// (getOpportunityValue em app.js) — mas operando direto sobre negocio/propostas
// do Supabase, sem precisar do formato enriquecido do Kanban.
const resolveNegocioValor = (negocio, propostasPorNegocio) => {
  const key = String(negocio.clickup_negocio_id || '').replace('#', '').trim();
  const props = propostasPorNegocio.get(key) || [];
  if (props.length === 0) return 0;
  const best =
    props.find(p => p.situacao === 'Selecionada') ||
    props.find(p => p.situacao === 'Ganho') ||
    props.find(p => p.situacao === 'Ativa') ||
    props.find(p => p.situacao === 'Desconsiderada') ||
    props[0];
  const v = parseFloat(best.total_proposta);
  return isNaN(v) ? 0 : v;
};

const ESTAGIOS_FORA_DO_PIPELINE = new Set(['Ganho', 'Perdido', 'Congelado']);

const EmpresasTab = ({ supabaseClient, onOpenNegocio }) => {
  const [contas, setContas] = React.useState([]);
  const [negocios, setNegocios] = React.useState([]);
  const [propostasPorNegocio, setPropostasPorNegocio] = React.useState(new Map());
  const [contatos, setContatos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busca, setBusca] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const [filtroTier, setFiltroTier] = React.useState('');
  const [contaSelecionada, setContaSelecionada] = React.useState(null);
  const [showNovaOportunidade, setShowNovaOportunidade] = React.useState(false);
  const [showNovoContato, setShowNovoContato] = React.useState(false);

  const carregarDados = React.useCallback(async () => {
    if (!supabaseClient) return;
    setLoading(true);
    const [{ data: contasData }, { data: negociosData }, { data: propostasData }, { data: contatosData }] = await Promise.all([
      supabaseClient.from('contas').select('id, clickup_account_id, nome, cnpj, cidade, estado, status, account_tier, industry, billing_cycle, razao_social, rua, cep, email, telefone'),
      supabaseClient.from('negocios').select('id, clickup_negocio_id, nome, conta_id, estagio, numero_proposta_oficial, sync_status, sync_error'),
      supabaseClient.from('propostas').select('id, clickup_negocio_id, total_proposta, situacao, data_fechamento'),
      supabaseClient.from('contatos').select('id, clickup_contact_id, nome, cargo, email, celular, whatsapp, champion, conta_id, sync_status'),
    ]);

    const propsMap = new Map();
    for (const p of propostasData || []) {
      const key = String(p.clickup_negocio_id || '').replace('#', '').trim();
      const lista = propsMap.get(key) || [];
      lista.push(p);
      propsMap.set(key, lista);
    }

    setContas(contasData || []);
    setNegocios(negociosData || []);
    setPropostasPorNegocio(propsMap);
    setContatos(contatosData || []);
    setLoading(false);
  }, [supabaseClient]);

  React.useEffect(() => { carregarDados(); }, [carregarDados]);

  const metrica = React.useMemo(() => {
    let pipelineAberto = 0;
    let faturamentoHistorico = 0;
    for (const n of negocios) {
      const valor = resolveNegocioValor(n, propostasPorNegocio);
      if (n.estagio === 'Ganho') faturamentoHistorico += valor;
      else if (n.estagio && !ESTAGIOS_FORA_DO_PIPELINE.has(n.estagio)) pipelineAberto += valor;
    }
    return { totalEmpresas: contas.length, pipelineAberto, faturamentoHistorico };
  }, [contas, negocios, propostasPorNegocio]);

  const contasFiltradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contas.filter(c => {
      if (filtroStatus && c.status !== filtroStatus) return false;
      if (filtroTier && c.account_tier !== filtroTier) return false;
      if (!termo) return true;
      return (c.nome || '').toLowerCase().includes(termo)
        || (c.cnpj || '').toLowerCase().includes(termo)
        || (c.cidade || '').toLowerCase().includes(termo);
    });
  }, [contas, busca, filtroStatus, filtroTier]);

  const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 p-6 space-y-6 overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase">Total de Empresas</p>
          <p className="text-2xl font-black text-slate-900">{metrica.totalEmpresas}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase">Pipeline Aberto</p>
          <p className="text-2xl font-black text-indigo-600">{formatBRL(metrica.pipelineAberto)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase">Faturamento Histórico</p>
          <p className="text-2xl font-black text-emerald-600">{formatBRL(metrica.faturamentoHistorico)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200 p-3">
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ ou cidade..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">Todos os status</option>
          <option value="customer base">Customer base</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="at risk">At risk</option>
        </select>
        <select value={filtroTier} onChange={(e) => setFiltroTier(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">Todos os tiers</option>
          <option value="Tier 1">Tier 1</option>
          <option value="Tier 2">Tier 2</option>
          <option value="Tier 3">Tier 3</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contasFiltradas.map(conta => (
          <div
            key={conta.id}
            onClick={() => setContaSelecionada(conta)}
            className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
          >
            <h4 className="font-bold text-slate-900">{conta.nome}</h4>
            <p className="text-xs text-slate-500">{conta.cidade}{conta.cidade && conta.estado ? ' - ' : ''}{conta.estado}</p>
            <div className="flex items-center gap-2 mt-2">
              {conta.status && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{conta.status}</span>}
              {conta.account_tier && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{conta.account_tier}</span>}
            </div>
          </div>
        ))}
        {contasFiltradas.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full text-center py-8">Nenhuma empresa encontrada.</p>
        )}
      </div>

      {contaSelecionada && (
        <FichaEmpresaDrawer
          conta={contaSelecionada}
          negocios={negocios.filter(n => n.conta_id === contaSelecionada.id)}
          contatos={contatos.filter(c => c.conta_id === contaSelecionada.id)}
          propostasPorNegocio={propostasPorNegocio}
          onClose={() => setContaSelecionada(null)}
          onOpenNegocio={onOpenNegocio}
          onNovaOportunidade={() => setShowNovaOportunidade(true)}
          onNovoContato={() => setShowNovoContato(true)}
        />
      )}

      {showNovaOportunidade && (
        <NovaOportunidadeModal
          supabaseClient={supabaseClient}
          contaFixa={contaSelecionada}
          contas={contas}
          onClose={() => setShowNovaOportunidade(false)}
          onCriado={() => { setShowNovaOportunidade(false); carregarDados(); }}
        />
      )}

      {showNovoContato && contaSelecionada && (
        <NovoContatoModal
          supabaseClient={supabaseClient}
          conta={contaSelecionada}
          onClose={() => setShowNovoContato(false)}
          onCriado={() => { setShowNovoContato(false); carregarDados(); }}
        />
      )}
    </div>
  );
};

const FichaEmpresaDrawer = ({ conta, negocios, contatos, propostasPorNegocio, onClose, onOpenNegocio, onNovaOportunidade, onNovoContato }) => {
  const [aba, setAba] = React.useState('visao_geral');
  const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">{conta.nome}</h3>
            <p className="text-xs text-slate-500">{conta.cnpj}</p>
            <div className="flex gap-2 mt-2">
              {conta.status && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{conta.status}</span>}
              {conta.account_tier && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{conta.account_tier}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>

        <div className="flex gap-2 border-b border-slate-200 mb-4">
          {[['visao_geral', 'Visão Geral'], ['contatos', `Contatos (${contatos.length})`], ['oportunidades', `Oportunidades (${negocios.length})`]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${aba === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {aba === 'visao_geral' && (
          <div className="space-y-2 text-sm">
            <p><span className="font-bold text-slate-600">Razão Social:</span> {conta.razao_social || '—'}</p>
            <p><span className="font-bold text-slate-600">Endereço:</span> {conta.rua || '—'}, {conta.cidade || '—'} - {conta.estado || '—'}, {conta.cep || '—'}</p>
            <p><span className="font-bold text-slate-600">Segmento:</span> {conta.industry || '—'}</p>
            <p><span className="font-bold text-slate-600">Ciclo de Faturamento:</span> {conta.billing_cycle || '—'}</p>
            <p><span className="font-bold text-slate-600">Email:</span> {conta.email || '—'}</p>
            <p><span className="font-bold text-slate-600">Telefone:</span> {conta.telefone || '—'}</p>
          </div>
        )}

        {aba === 'contatos' && (
          <div className="space-y-3">
            <button onClick={onNovoContato} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold">+ Adicionar Contato</button>
            {contatos.map(c => (
              <div key={c.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-slate-800">{c.nome} {c.champion && <span title="Champion">⭐</span>}</p>
                  <p className="text-xs text-slate-500">{c.cargo || '—'}</p>
                  <p className="text-xs text-slate-500">{c.email || '—'}</p>
                </div>
                {c.whatsapp && (
                  <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 text-xs font-bold">WhatsApp</a>
                )}
                {c.sync_status === 'pending' && <span className="text-[10px] text-amber-500">sincronizando...</span>}
                {c.sync_status === 'failed' && <span className="text-[10px] text-rose-500">falha ao sincronizar</span>}
              </div>
            ))}
            {contatos.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum contato cadastrado.</p>}
          </div>
        )}

        {aba === 'oportunidades' && (
          <div className="space-y-3">
            <button onClick={onNovaOportunidade} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold">+ Nova Oportunidade</button>
            {negocios.map(n => (
              <div
                key={n.id}
                onClick={() => n.clickup_negocio_id && onOpenNegocio && onOpenNegocio({ id: n.clickup_negocio_id, name: n.nome })}
                className="border border-slate-200 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:border-indigo-300"
              >
                <div>
                  <p className="font-bold text-sm text-slate-800">{n.nome}</p>
                  <p className="text-xs text-slate-500">{n.estagio || '—'} {n.numero_proposta_oficial ? `· ${n.numero_proposta_oficial}` : ''}</p>
                </div>
                <span className="text-sm font-bold text-emerald-600">{formatBRL(resolveNegocioValor(n, propostasPorNegocio))}</span>
                {n.sync_status === 'pending' && <span className="text-[10px] text-amber-500 ml-2">sincronizando...</span>}
                {n.sync_status === 'failed' && <span className="text-[10px] text-rose-500 ml-2" title={n.sync_error}>falha ao sincronizar</span>}
              </div>
            ))}
            {negocios.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhuma oportunidade cadastrada.</p>}
          </div>
        )}
      </div>
    </div>
  );
};
