import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  Database,
  FileText,
  Filter,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { supabase } from './supabaseClient';

type TipoPessoa = 'preso' | 'visitante';

type StatusGeral = 'Ativo' | 'Inativo' | 'Em observação' | 'Baixado';

interface PessoaResultado {
  id: number;
  tipo: TipoPessoa;
  nome: string;
  infopen?: string | null;
  cpf?: string | null;
  sexo?: string | null;
  bloco?: string | null;
  cela?: string | null;
  status?: StatusGeral | string | null;
  foto_path?: string | null;
  reincidente?: boolean | null;
  artigos?: string | null;
  observacoes?: string | null;
}

interface LancamentoHistorico {
  id: number;
  data_fato: string | null;
  tipo_situacao: string | null;
  status_ocorrencia: string | null;
  item_apreendido: string | null;
  historico_resumido: string | null;
  protocolo: string | null;
  bloco_no_fato: string | null;
  cela_no_fato: string | null;
  quantidade: string | null;
  possui_reds: boolean | null;
  numero_reds: string | null;
  teve_prisao: boolean | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

interface ObservacaoPessoa {
  id: number;
  pessoa_tipo: TipoPessoa;
  pessoa_id: number;
  texto: string;
  criado_em?: string | null;
  atualizado_em?: string | null;
}

interface FormCadastro {
  nome: string;
  tipo: TipoPessoa;
  infopen: string;
  cpf: string;
  sexo: string;
  bloco: string;
  cela: string;
  status: StatusGeral | string;
  reincidente: boolean;
  artigos: string;
  observacoes: string;
}

const estadoCadastroInicial: FormCadastro = {
  nome: '',
  tipo: 'preso',
  infopen: '',
  cpf: '',
  sexo: 'Masculino',
  bloco: '',
  cela: '',
  status: 'Ativo',
  reincidente: false,
  artigos: '',
  observacoes: '',
};

function normalizarPessoa(item: any, tipo: TipoPessoa): PessoaResultado {
  return {
    id: item.id,
    tipo,
    nome: item.nome || 'Sem nome',
    infopen: item.infopen ?? null,
    cpf: item.cpf ?? null,
    sexo: item.sexo ?? null,
    bloco: item.bloco ?? null,
    cela: item.cela ?? null,
    status: item.status ?? null,
    foto_path: item.foto_path ?? null,
    reincidente: item.reincidente ?? null,
    artigos: item.artigos ?? null,
    observacoes: item.observacoes ?? null,
  };
}

async function gerarUrlFoto(path: string | null): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage.from('fotos-pessoas').createSignedUrl(path, 3600);

  if (error) {
    console.error('Erro ao gerar URL da foto:', error);
    return null;
  }

  return data?.signedUrl ?? null;
}

export default function PesquisaIndividuos() {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoPessoa | null>(null);
  const [termoBusca, setTermoBusca] = useState('');
  const [resultados, setResultados] = useState<PessoaResultado[]>([]);
  const [selecionado, setSelecionado] = useState<PessoaResultado | null>(null);
  const [historico, setHistorico] = useState<LancamentoHistorico[]>([]);
  const [observacoes, setObservacoes] = useState<ObservacaoPessoa[]>([]);
  const [novaObservacao, setNovaObservacao] = useState('');
  const [editandoObservacaoId, setEditandoObservacaoId] = useState<number | null>(null);
  const [textoObservacaoEditando, setTextoObservacaoEditando] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [carregandoNotas, setCarregandoNotas] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  const [filtroTipo, setFiltroTipo] = useState('Todos');
  const [modalCadastroAberto, setModalCadastroAberto] = useState(false);
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [cadastroForm, setCadastroForm] = useState<FormCadastro>(estadoCadastroInicial);
  const [edicaoForm, setEdicaoForm] = useState<FormCadastro | null>(null);
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [erroNotas, setErroNotas] = useState<string | null>(null);

  useEffect(() => {
    setSelecionado(null);
    setHistorico([]);
    setObservacoes([]);
    setNovaObservacao('');
    setErroNotas(null);
    setResultadoPadrao();
  }, [tipoSelecionado]);

  const setResultadoPadrao = () => {
    setResultados([]);
    setTermoBusca('');
  };

  const buscarPessoas = async (termo: string, tipo: TipoPessoa | null) => {
    if (!tipo) {
      setResultados([]);
      return;
    }

    const busca = termo.trim();

    if (busca && busca.length < 2) {
      setResultados([]);
      return;
    }

    setCarregando(true);

    try {
      const tabela = tipo === 'preso' ? 'presos' : 'visitantes';
      const query = supabase
        .from(tabela)
        .select(
          tipo === 'preso'
            ? 'id, nome, infopen, sexo, bloco, cela, foto_path, status, observacoes'
            : 'id, nome, infopen, cpf, sexo, bloco, cela, foto_path, status, reincidente, artigos, observacoes'
        );

      const queryFinal = busca
        ? query.or(
            tipo === 'preso'
              ? `nome.ilike.%${busca}%,infopen.ilike.%${busca}%`
              : `nome.ilike.%${busca}%,cpf.ilike.%${busca}%,infopen.ilike.%${busca}%`
          )
        : query;

      const { data, error } = await queryFinal.limit(30);

      if (error) throw error;

      const lista = (data ?? []).map((item) => normalizarPessoa(item, tipo));
      setResultados(lista);
    } catch (err) {
      console.error('Erro ao buscar indivíduos:', err);
      setResultados([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void buscarPessoas(termoBusca, tipoSelecionado);
  }, [termoBusca, tipoSelecionado]);

  const carregarObservacoes = async (pessoa: PessoaResultado) => {
    setCarregandoNotas(true);
    setObservacoes([]);
    setErroNotas(null);

    try {
      const { data, error } = await supabase
        .from('pessoa_observacoes')
        .select('*')
        .eq('pessoa_tipo', pessoa.tipo)
        .eq('pessoa_id', pessoa.id)
        .order('criado_em', { ascending: false });

      if (error) {
        const tabela = pessoa.tipo === 'preso' ? 'presos' : 'visitantes';
        const { data: pessoaData, error: pessoaErr } = await supabase
          .from(tabela)
          .select('observacoes')
          .eq('id', pessoa.id)
          .maybeSingle();

        if (!pessoaErr && pessoaData?.observacoes) {
          setObservacoes([
            {
              id: Date.now(),
              pessoa_tipo: pessoa.tipo,
              pessoa_id: pessoa.id,
              texto: String(pessoaData.observacoes),
              criado_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString(),
            },
          ]);
          return;
        }

        setObservacoes([]);
        return;
      }

      setObservacoes((data ?? []) as ObservacaoPessoa[]);
    } catch (err) {
      console.error('Erro ao carregar observações do indivíduo:', err);
      setObservacoes([]);
    } finally {
      setCarregandoNotas(false);
    }
  };

  const carregarHistorico = async (pessoa: PessoaResultado) => {
    setCarregandoHistorico(true);
    setHistorico([]);

    try {
      let query = supabase
        .from('ocorrencias_visita')
        .select(`
          id,
          data_fato,
          tipo_situacao,
          status_ocorrencia,
          item_apreendido,
          historico_resumido,
          protocolo,
          bloco_no_fato,
          cela_no_fato,
          quantidade,
          possui_reds,
          numero_reds,
          teve_prisao,
          criado_em,
          atualizado_em
        `)
        .order('data_fato', { ascending: false });

      if (pessoa.tipo === 'preso') {
        const filtros = [
          pessoa.id ? `preso_id.eq.${pessoa.id}` : null,
          pessoa.infopen ? `preso_infopen.eq.${pessoa.infopen}` : null,
        ].filter(Boolean);

        if (filtros.length > 0) {
          query = query.or(filtros.join(','));
        }
      } else {
        const filtros = [
          pessoa.id ? `visitante_id.eq.${pessoa.id}` : null,
          pessoa.nome ? `visitante_nome.eq.${pessoa.nome}` : null,
        ].filter(Boolean);

        if (filtros.length > 0) {
          query = query.or(filtros.join(','));
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      setHistorico((data ?? []) as LancamentoHistorico[]);

      if (pessoa.foto_path) {
        const url = await gerarUrlFoto(pessoa.foto_path);
        setFotoUrl(url);
      } else {
        setFotoUrl(null);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico do indivíduo:', err);
      setHistorico([]);
      setFotoUrl(null);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  useEffect(() => {
    if (!selecionado) return;
    void carregarHistorico(selecionado);
    void carregarObservacoes(selecionado);
  }, [selecionado]);

  const abrirModalCadastro = () => {
    setCadastroForm({
      ...estadoCadastroInicial,
      tipo: tipoSelecionado || 'preso',
    });
    setErroCadastro(null);
    setModalCadastroAberto(true);
  };

  const abrirModalEdicao = () => {
    if (!selecionado) return;

    setEdicaoForm({
      nome: selecionado.nome,
      tipo: selecionado.tipo,
      infopen: selecionado.infopen || '',
      cpf: selecionado.cpf || '',
      sexo: selecionado.sexo || 'Masculino',
      bloco: selecionado.bloco || '',
      cela: selecionado.cela || '',
      status: selecionado.status || 'Ativo',
      reincidente: Boolean(selecionado.reincidente),
      artigos: selecionado.artigos || '',
      observacoes: selecionado.observacoes || '',
    });
    setErroEdicao(null);
    setModalEdicaoAberto(true);
  };

  const salvarCadastro = async () => {
    if (!cadastroForm.nome.trim()) {
      setErroCadastro('Informe o nome do indivíduo.');
      return;
    }

    if (cadastroForm.tipo === 'preso' && !cadastroForm.infopen.trim()) {
      setErroCadastro('Informe o INFOPEN do preso.');
      return;
    }

    if (cadastroForm.tipo === 'visitante' && !cadastroForm.cpf.trim()) {
      setErroCadastro('Informe o CPF do visitante.');
      return;
    }

    setSalvandoCadastro(true);
    setErroCadastro(null);

    try {
      const tabela = cadastroForm.tipo === 'preso' ? 'presos' : 'visitantes';
      const payload = {
        nome: cadastroForm.nome.trim(),
        infopen: cadastroForm.tipo === 'preso' ? cadastroForm.infopen.trim() : cadastroForm.infopen.trim() || null,
        cpf: cadastroForm.tipo === 'visitante' ? cadastroForm.cpf.trim() : null,
        sexo: cadastroForm.sexo || null,
        bloco: cadastroForm.bloco.trim() || null,
        cela: cadastroForm.cela.trim() || null,
        status: cadastroForm.status || 'Ativo',
        reincidente: cadastroForm.tipo === 'visitante' ? cadastroForm.reincidente : null,
        artigos: cadastroForm.tipo === 'visitante' ? cadastroForm.artigos.trim() || null : null,
        observacoes: cadastroForm.observacoes.trim() || null,
      };

      const { data, error } = await supabase.from(tabela).insert(payload).select().single();

      if (error) throw error;

      const pessoaCriada = normalizarPessoa(data, cadastroForm.tipo);
      setResultados((lista) => [pessoaCriada, ...lista]);
      setSelecionado(pessoaCriada);
      setModalCadastroAberto(false);
      setCadastroForm({ ...estadoCadastroInicial, tipo: cadastroForm.tipo });
    } catch (err: any) {
      console.error('Erro ao cadastrar indivíduo:', err);
      setErroCadastro(err.message || 'Não foi possível salvar o cadastro.');
    } finally {
      setSalvandoCadastro(false);
    }
  };

  const salvarEdicao = async () => {
    if (!selecionado || !edicaoForm) return;

    if (!edicaoForm.nome.trim()) {
      setErroEdicao('Informe o nome do indivíduo.');
      return;
    }

    if (edicaoForm.tipo === 'preso' && !edicaoForm.infopen.trim()) {
      setErroEdicao('Informe o INFOPEN do preso.');
      return;
    }

    if (edicaoForm.tipo === 'visitante' && !edicaoForm.cpf.trim()) {
      setErroEdicao('Informe o CPF do visitante.');
      return;
    }

    setSalvandoEdicao(true);
    setErroEdicao(null);

    try {
      const tabela = edicaoForm.tipo === 'preso' ? 'presos' : 'visitantes';
      const payload = {
        nome: edicaoForm.nome.trim(),
        infopen: edicaoForm.tipo === 'preso' ? edicaoForm.infopen.trim() : edicaoForm.infopen.trim() || null,
        cpf: edicaoForm.tipo === 'visitante' ? edicaoForm.cpf.trim() : null,
        sexo: edicaoForm.sexo || null,
        bloco: edicaoForm.bloco.trim() || null,
        cela: edicaoForm.cela.trim() || null,
        status: edicaoForm.status || 'Ativo',
        reincidente: edicaoForm.tipo === 'visitante' ? edicaoForm.reincidente : null,
        artigos: edicaoForm.tipo === 'visitante' ? edicaoForm.artigos.trim() || null : null,
        observacoes: edicaoForm.observacoes.trim() || null,
      };

      const { data, error } = await supabase.from(tabela).update(payload).eq('id', selecionado.id).select().single();

      if (error) throw error;

      const pessoaAtualizada = normalizarPessoa(data, edicaoForm.tipo);
      setSelecionado(pessoaAtualizada);
      setResultados((lista) =>
        lista.map((pessoa) => (pessoa.id === pessoaAtualizada.id && pessoa.tipo === pessoaAtualizada.tipo ? pessoaAtualizada : pessoa)),
      );
      setModalEdicaoAberto(false);
      setEdicaoForm(null);
    } catch (err: any) {
      console.error('Erro ao atualizar indivíduo:', err);
      setErroEdicao(err.message || 'Não foi possível atualizar o perfil.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const salvarObservacao = async () => {
    if (!selecionado) return;

    const texto = novaObservacao.trim();
    if (!texto) return;

    setSalvandoNota(true);
    setErroNotas(null);

    try {
      const payload = {
        pessoa_tipo: selecionado.tipo,
        pessoa_id: selecionado.id,
        texto,
      };

      const { data, error } = await supabase.from('pessoa_observacoes').insert(payload).select().single();

      if (error) {
        const tabela = selecionado.tipo === 'preso' ? 'presos' : 'visitantes';
        const { error: fallbackErr } = await supabase
          .from(tabela)
          .update({ observacoes: texto })
          .eq('id', selecionado.id);

        if (fallbackErr) throw fallbackErr;

        setObservacoes((atual) => [
          {
            id: Date.now(),
            pessoa_tipo: selecionado.tipo,
            pessoa_id: selecionado.id,
            texto,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          },
          ...atual,
        ]);
        setNovaObservacao('');
        return;
      }

      setObservacoes((atual) => [data as ObservacaoPessoa, ...atual]);
      setNovaObservacao('');
    } catch (err: any) {
      console.error('Erro ao salvar observação:', err);
      setErroNotas(err.message || 'Não foi possível registrar a observação.');
    } finally {
      setSalvandoNota(false);
    }
  };

  const atualizarObservacao = async (observacaoId: number, texto: string) => {
    if (!texto.trim() || !selecionado) return;

    setSalvandoNota(true);
    setErroNotas(null);

    try {
      const { data, error } = await supabase
        .from('pessoa_observacoes')
        .update({ texto: texto.trim(), atualizado_em: new Date().toISOString() })
        .eq('id', observacaoId)
        .select()
        .single();

      if (error) throw error;

      setObservacoes((atual) =>
        atual.map((item) => (item.id === observacaoId ? ({ ...item, ...data } as ObservacaoPessoa) : item)),
      );
      setEditandoObservacaoId(null);
      setTextoObservacaoEditando('');
    } catch (err: any) {
      console.error('Erro ao atualizar observação:', err);
      setErroNotas(err.message || 'Não foi possível atualizar a observação.');
    } finally {
      setSalvandoNota(false);
    }
  };

  const excluirObservacao = async (observacaoId: number) => {
    if (!selecionado) return;

    setSalvandoNota(true);
    setErroNotas(null);

    try {
      const { error } = await supabase.from('pessoa_observacoes').delete().eq('id', observacaoId);

      if (error) throw error;

      setObservacoes((atual) => atual.filter((item) => item.id !== observacaoId));
    } catch (err: any) {
      console.error('Erro ao excluir observação:', err);
      setErroNotas(err.message || 'Não foi possível excluir a observação.');
    } finally {
      setSalvandoNota(false);
    }
  };

  const historicoFiltrado = useMemo(() => {
    return historico.filter((item) => {
      const tipoOk = filtroTipo === 'Todos' || (item.tipo_situacao ?? '') === filtroTipo;
      const statusOk =
        filtroStatus === 'Todos' ||
        (filtroStatus === 'Em andamento' && item.status_ocorrencia === 'em_andamento') ||
        (filtroStatus === 'Concluída' && item.status_ocorrencia === 'concluida');

      return tipoOk && statusOk;
    });
  }, [historico, filtroStatus, filtroTipo]);

  const tiposDisponiveis = useMemo(() => {
    const mapa = new Set(historico.map((item) => item.tipo_situacao).filter(Boolean) as string[]);
    return Array.from(mapa).sort();
  }, [historico]);

  return (
    <div className="pesquisa-shell">
      <style>{estilos}</style>

      <div className="pesquisa-header">
        <div>
          <span className="section-kicker">EXPLORE</span>
          <h2>Pesquisa de indivíduos</h2>
        </div>

        <div className="pesquisa-actions">
          {tipoSelecionado && (
            <button type="button" className="action-button secondary" onClick={abrirModalCadastro}>
              <Plus size={12} />
              Novo Cadastro
            </button>
          )}
          {selecionado && (
            <button type="button" className="action-button primary" onClick={abrirModalEdicao}>
              <Pencil size={12} />
              Editar Perfil
            </button>
          )}
          <div className="pesquisa-count">
            <Database size={12} />
            <span>{tipoSelecionado ? `${resultados.length} resultado(s)` : 'Selecione o tipo'}</span>
          </div>
        </div>
      </div>

      <div className="tipo-selector">
        <button
          type="button"
          className={`tipo-option ${tipoSelecionado === 'preso' ? 'tipo-option-active' : ''}`}
          onClick={() => setTipoSelecionado('preso')}
        >
          <ShieldAlert size={14} />
          Presos
        </button>
        <button
          type="button"
          className={`tipo-option ${tipoSelecionado === 'visitante' ? 'tipo-option-active' : ''}`}
          onClick={() => setTipoSelecionado('visitante')}
        >
          <User size={14} />
          Visitantes
        </button>
      </div>

      {!tipoSelecionado ? (
        <div className="pesquisa-empty-panel large">
          <Users size={18} />
          <p>Escolha primeiro entre presos ou visitantes para listar e consultar os cadastros.</p>
        </div>
      ) : (
        <>
          <section className="pesquisa-busca">
            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder={
                  tipoSelecionado === 'preso'
                    ? 'Buscar preso por nome ou INFOPEN...'
                    : 'Buscar visitante por nome, CPF ou INFOPEN...'
                }
              />
            </div>
          </section>

          {carregando && <div className="pesquisa-empty">Carregando resultados...</div>}

          {!carregando && termoBusca.trim().length > 0 && termoBusca.trim().length < 2 && (
            <div className="pesquisa-empty">Digite pelo menos 2 caracteres para iniciar a busca.</div>
          )}

          {!carregando && !selecionado && resultados.length === 0 && termoBusca.trim().length >= 2 && (
            <div className="pesquisa-empty">Nenhum indivíduo encontrado para esse critério.</div>
          )}

          <div className="pesquisa-layout">
            <aside className="pesquisa-lista">
              {resultados.length > 0 ? (
                resultados.map((pessoa) => (
                  <button
                    key={`${pessoa.tipo}-${pessoa.id}`}
                    type="button"
                    className={`resultado-item ${selecionado?.id === pessoa.id && selecionado?.tipo === pessoa.tipo ? 'resultado-item-active' : ''}`}
                    onClick={() => setSelecionado(pessoa)}
                  >
                    <div className="resultado-avatar">
                      {pessoa.tipo === 'preso' ? <ShieldAlert size={14} /> : <User size={14} />}
                    </div>

                    <div className="resultado-texto">
                      <strong>{pessoa.nome}</strong>
                      <small>
                        {pessoa.tipo === 'preso'
                          ? `INFOPEN ${pessoa.infopen || '—'}`
                          : `CPF ${pessoa.cpf || '—'}`}
                      </small>
                    </div>
                  </button>
                ))
              ) : (
                <div className="pesquisa-empty-panel">
                  <Users size={18} />
                  <p>{termoBusca ? 'Nenhum resultado para o filtro atual.' : 'Pesquise ou selecione um cadastro para iniciar.'}</p>
                </div>
              )}
            </aside>

            <main className="pesquisa-detalhe">
              {!selecionado ? (
                <div className="pesquisa-empty-panel large">
                  <FileText size={18} />
                  <p>Os dados completos do indivíduo aparecerão aqui após a seleção no painel da esquerda.</p>
                </div>
              ) : (
                <>
                  <div className="perfil-card">
                    <div className="perfil-foto">
                      {fotoUrl ? (
                        <img src={fotoUrl} alt={selecionado.nome} />
                      ) : (
                        <div className="perfil-placeholder">
                          {selecionado.tipo === 'preso' ? <ShieldAlert size={22} /> : <User size={22} />}
                        </div>
                      )}
                    </div>

                    <div className="perfil-info">
                      <div className="perfil-topo">
                        <span className="badge">{selecionado.tipo === 'preso' ? 'PRESO' : 'VISITANTE'}</span>
                        <strong>{selecionado.nome}</strong>
                      </div>

                      <div className="perfil-grid">
                        <div>
                          <small>{selecionado.tipo === 'preso' ? 'INFOPEN' : 'CPF'}</small>
                          <span>{selecionado.tipo === 'preso' ? selecionado.infopen || '—' : selecionado.cpf || '—'}</span>
                        </div>
                        <div>
                          <small>Sexo</small>
                          <span>{selecionado.sexo || '—'}</span>
                        </div>
                        <div>
                          <small>Bloco</small>
                          <span>{selecionado.bloco || '—'}</span>
                        </div>
                        <div>
                          <small>Cela</small>
                          <span>{selecionado.cela || '—'}</span>
                        </div>
                        <div>
                          <small>Status</small>
                          <span>{selecionado.status || '—'}</span>
                        </div>
                        {selecionado.tipo === 'visitante' && (
                          <>
                            <div>
                              <small>INFOPEN / carteira</small>
                              <span>{selecionado.infopen || '—'}</span>
                            </div>
                            <div>
                              <small>Reincidente</small>
                              <span>{selecionado.reincidente ? 'Sim' : 'Não'}</span>
                            </div>
                            <div>
                              <small>Artigos</small>
                              <span>{selecionado.artigos || '—'}</span>
                            </div>
                            <div>
                              <small>Cadastro</small>
                              <span>Visitante</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="perfil-actions">
                    <button type="button" className="action-button primary" onClick={abrirModalEdicao}>
                      <Pencil size={12} />
                      Incluir mais informação
                    </button>
                  </div>

                  <div className="filtros-historico">
                    <div className="filtro-group">
                      <label>
                        <Filter size={12} />
                        Tipo
                      </label>
                      <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                        <option value="Todos">Todos</option>
                        {tiposDisponiveis.map((tipo) => (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        ))}
                      </select>
                    </div>

                    <div className="filtro-group">
                      <label>
                        <ClipboardList size={12} />
                        Status
                      </label>
                      <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                        <option value="Todos">Todos</option>
                        <option value="Em andamento">Em andamento</option>
                        <option value="Concluída">Concluída</option>
                      </select>
                    </div>
                  </div>

                  <div className="historico-header">
                    <div>
                      <span className="section-kicker">HISTÓRICO</span>
                      <h3>Lançamentos do indivíduo</h3>
                    </div>
                    <span className="historico-total">{historicoFiltrado.length} registros</span>
                  </div>

                  {carregandoHistorico ? (
                    <div className="pesquisa-empty">Carregando histórico...</div>
                  ) : historicoFiltrado.length > 0 ? (
                    <div className="historico-lista">
                      {historicoFiltrado.map((item) => (
                        <article key={item.id} className="historico-item">
                          <div className="historico-topo">
                            <span className="historico-tipo">{item.tipo_situacao || 'Sem classificação'}</span>
                            <span className={`historico-status ${item.status_ocorrencia === 'concluida' ? 'status-concluida' : 'status-em-andamento'}`}>
                              {item.status_ocorrencia === 'concluida' ? 'Concluída' : 'Em andamento'}
                            </span>
                          </div>

                          <div className="historico-meta">
                            <div>
                              <CalendarDays size={12} />
                              <span>{item.data_fato ? new Date(item.data_fato).toLocaleString('pt-BR') : 'Sem data'}</span>
                            </div>
                            <div>
                              <MapPin size={12} />
                              <span>{item.bloco_no_fato || 'Bloco não informado'} / {item.cela_no_fato || 'Cela não informada'}</span>
                            </div>
                          </div>

                          <p>{item.historico_resumido || item.item_apreendido || 'Sem observação detalhada.'}</p>

                          <div className="historico-tags">
                            {item.protocolo && <span>Protocolo: {item.protocolo}</span>}
                            {item.quantidade && <span>Qtd.: {item.quantidade}</span>}
                            {item.possui_reds && <span>REDS: {item.numero_reds || 'Registrado'}</span>}
                            {item.teve_prisao && <span>Teve prisão</span>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="pesquisa-empty-panel large">
                      <AlertCircle size={18} />
                      <p>Não há lançamentos para esse filtro no histórico da pessoa selecionada.</p>
                    </div>
                  )}

                  <section className="observacoes-section">
                    <div className="observacoes-header">
                      <div>
                        <span className="section-kicker">INTERNO</span>
                        <h3>Observações pessoais</h3>
                      </div>
                      <span className="historico-total">{observacoes.length} registros</span>
                    </div>

                    <div className="observacoes-form">
                      <textarea
                        value={novaObservacao}
                        onChange={(e) => setNovaObservacao(e.target.value)}
                        placeholder="Adicionar observação interna sobre esse indivíduo..."
                        rows={4}
                      />
                      <button type="button" className="action-button primary" onClick={salvarObservacao} disabled={salvandoNota}>
                        <NotebookPen size={12} />
                        {salvandoNota ? 'Salvando...' : 'Salvar observação'}
                      </button>
                    </div>

                    {erroNotas && <div className="detail-error">{erroNotas}</div>}

                    {carregandoNotas ? (
                      <div className="pesquisa-empty">Carregando observações...</div>
                    ) : observacoes.length > 0 ? (
                      <div className="observacoes-lista">
                        {observacoes.map((obs) => (
                          <div key={obs.id} className="observacao-item">
                            {editandoObservacaoId === obs.id ? (
                              <>
                                <textarea
                                  value={textoObservacaoEditando}
                                  onChange={(e) => setTextoObservacaoEditando(e.target.value)}
                                  rows={4}
                                />
                                <div className="observacao-actions">
                                  <button type="button" className="action-button primary" onClick={() => atualizarObservacao(obs.id, textoObservacaoEditando)}>
                                    <Save size={12} />
                                    Salvar
                                  </button>
                                  <button type="button" className="action-button secondary" onClick={() => {
                                    setEditandoObservacaoId(null);
                                    setTextoObservacaoEditando('');
                                  }}>
                                    <X size={12} />
                                    Cancelar
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p>{obs.texto}</p>
                                <div className="observacao-meta">
                                  <small>{obs.criado_em ? new Date(obs.criado_em).toLocaleString('pt-BR') : 'Sem data'}</small>
                                  <div className="observacao-actions">
                                    <button type="button" className="icon-button" onClick={() => {
                                      setEditandoObservacaoId(obs.id);
                                      setTextoObservacaoEditando(obs.texto);
                                    }}>
                                      <Pencil size={12} />
                                    </button>
                                    <button type="button" className="icon-button danger" onClick={() => excluirObservacao(obs.id)}>
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="pesquisa-empty-panel large">
                        <NotebookPen size={18} />
                        <p>Nenhuma observação interna registrada para este indivíduo.</p>
                      </div>
                    )}
                  </section>
                </>
              )}
            </main>
          </div>
        </>
      )}

      {modalCadastroAberto && (
        <div className="modal-overlay" onClick={() => setModalCadastroAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="section-kicker">NOVO</span>
                <h3>Novo cadastro</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setModalCadastroAberto(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-grid">
              <label className="field-group">
                <span>Tipo</span>
                <select
                  value={cadastroForm.tipo}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, tipo: e.target.value as TipoPessoa }))}
                >
                  <option value="preso">Preso</option>
                  <option value="visitante">Visitante</option>
                </select>
              </label>

              <label className="field-group">
                <span>Nome</span>
                <input
                  value={cadastroForm.nome}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, nome: e.target.value }))}
                  placeholder="Nome completo"
                />
              </label>

              <label className="field-group">
                <span>{cadastroForm.tipo === 'preso' ? 'INFOPEN' : 'CPF'}</span>
                <input
                  value={cadastroForm.tipo === 'preso' ? cadastroForm.infopen : cadastroForm.cpf}
                  onChange={(e) =>
                    setCadastroForm((atual) => ({
                      ...atual,
                      ...(atual.tipo === 'preso' ? { infopen: e.target.value } : { cpf: e.target.value }),
                    }))
                  }
                  placeholder={cadastroForm.tipo === 'preso' ? 'INFOPEN' : 'CPF'}
                />
              </label>

              <label className="field-group">
                <span>Sexo</span>
                <select
                  value={cadastroForm.sexo}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, sexo: e.target.value }))}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                </select>
              </label>

              <label className="field-group">
                <span>Bloco</span>
                <input
                  value={cadastroForm.bloco}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, bloco: e.target.value }))}
                  placeholder="Ex.: A, B, C"
                />
              </label>

              <label className="field-group">
                <span>Cela</span>
                <input
                  value={cadastroForm.cela}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, cela: e.target.value }))}
                  placeholder="Ex.: 04"
                />
              </label>

              <label className="field-group">
                <span>Status</span>
                <select
                  value={cadastroForm.status}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, status: e.target.value }))}
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Em observação">Em observação</option>
                  <option value="Baixado">Baixado</option>
                </select>
              </label>

              {cadastroForm.tipo === 'visitante' && (
                <label className="field-group checkbox-field">
                  <input
                    type="checkbox"
                    checked={cadastroForm.reincidente}
                    onChange={(e) => setCadastroForm((atual) => ({ ...atual, reincidente: e.target.checked }))}
                  />
                  <span>Reincidente</span>
                </label>
              )}

              {cadastroForm.tipo === 'visitante' && (
                <label className="field-group field-full">
                  <span>Artigos / Observações de entrada</span>
                  <input
                    value={cadastroForm.artigos}
                    onChange={(e) => setCadastroForm((atual) => ({ ...atual, artigos: e.target.value }))}
                    placeholder="Artigos ou observações de entrada"
                  />
                </label>
              )}

              <label className="field-group field-full">
                <span>Observações internas</span>
                <textarea
                  value={cadastroForm.observacoes}
                  onChange={(e) => setCadastroForm((atual) => ({ ...atual, observacoes: e.target.value }))}
                  rows={3}
                  placeholder="Registro interno do perfil"
                />
              </label>
            </div>

            {erroCadastro && <div className="detail-error">{erroCadastro}</div>}

            <div className="modal-actions">
              <button type="button" className="action-button secondary" onClick={() => setModalCadastroAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="action-button primary" onClick={salvarCadastro} disabled={salvandoCadastro}>
                <Save size={12} />
                {salvandoCadastro ? 'Salvando...' : 'Salvar cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEdicaoAberto && edicaoForm && (
        <div className="modal-overlay" onClick={() => setModalEdicaoAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="section-kicker">EDITAR</span>
                <h3>Editar perfil</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setModalEdicaoAberto(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-grid">
              <label className="field-group">
                <span>Nome</span>
                <input
                  value={edicaoForm.nome}
                  onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, nome: e.target.value } : atual))}
                />
              </label>

              <label className="field-group">
                <span>{edicaoForm.tipo === 'preso' ? 'INFOPEN' : 'CPF'}</span>
                <input
                  value={edicaoForm.tipo === 'preso' ? edicaoForm.infopen : edicaoForm.cpf}
                  onChange={(e) =>
                    setEdicaoForm((atual) =>
                      atual
                        ? {
                            ...atual,
                            ...(atual.tipo === 'preso' ? { infopen: e.target.value } : { cpf: e.target.value }),
                          }
                        : atual,
                    )
                  }
                />
              </label>

              <label className="field-group">
                <span>Sexo</span>
                <select
                  value={edicaoForm.sexo}
                  onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, sexo: e.target.value } : atual))}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                </select>
              </label>

              <label className="field-group">
                <span>Bloco</span>
                <input
                  value={edicaoForm.bloco}
                  onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, bloco: e.target.value } : atual))}
                />
              </label>

              <label className="field-group">
                <span>Cela</span>
                <input
                  value={edicaoForm.cela}
                  onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, cela: e.target.value } : atual))}
                />
              </label>

              <label className="field-group">
                <span>Status</span>
                <select
                  value={edicaoForm.status}
                  onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, status: e.target.value } : atual))}
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Em observação">Em observação</option>
                  <option value="Baixado">Baixado</option>
                </select>
              </label>

              {edicaoForm.tipo === 'visitante' && (
                <label className="field-group checkbox-field">
                  <input
                    type="checkbox"
                    checked={edicaoForm.reincidente}
                    onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, reincidente: e.target.checked } : atual))}
                  />
                  <span>Reincidente</span>
                </label>
              )}

              {edicaoForm.tipo === 'visitante' && (
                <label className="field-group field-full">
                  <span>Artigos / Observações de entrada</span>
                  <input
                    value={edicaoForm.artigos}
                    onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, artigos: e.target.value } : atual))}
                  />
                </label>
              )}

              <label className="field-group field-full">
                <span>Observações internas</span>
                <textarea
                  value={edicaoForm.observacoes}
                  onChange={(e) => setEdicaoForm((atual) => (atual ? { ...atual, observacoes: e.target.value } : atual))}
                  rows={3}
                />
              </label>
            </div>

            {erroEdicao && <div className="detail-error">{erroEdicao}</div>}

            <div className="modal-actions">
              <button type="button" className="action-button secondary" onClick={() => setModalEdicaoAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="action-button primary" onClick={salvarEdicao} disabled={salvandoEdicao}>
                <Save size={12} />
                {salvandoEdicao ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const estilos = `
  .pesquisa-shell {
    display: flex;
    flex-direction: column;
    gap: 18px;
    color: #202522;
    padding-top: 20px;
  }

  .pesquisa-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #dfe3e1;
    padding-bottom: 12px;
  }

  .section-kicker {
    display: block;
    margin-bottom: 6px;
    font-size: 8px;
    letter-spacing: 0.16em;
    color: #8a928d;
    font-family: 'IBM Plex Mono', monospace;
  }

  .pesquisa-header h2,
  .modal-header h3,
  .historico-header h3,
  .observacoes-header h3 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -0.03em;
  }

  .pesquisa-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .tipo-selector {
    display: inline-flex;
    width: fit-content;
    gap: 10px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.3);
    padding: 8px;
  }

  .tipo-option {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: #47514e;
    padding: 10px 16px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 8px;
    cursor: pointer;
    font-family: 'IBM Plex Mono', monospace;
    transition: all 0.18s ease;
  }

  .tipo-option-active {
    background: rgba(167,45,49,0.08);
    border-color: rgba(167,45,49,0.2);
    color: #a72d31;
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.55);
    color: #202522;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 8px;
    padding: 9px 12px;
    cursor: pointer;
    font-family: 'IBM Plex Mono', monospace;
    transition: all 0.18s ease;
  }

  .action-button.primary {
    background: rgba(167,45,49,0.08);
    border-color: rgba(167,45,49,0.2);
    color: #a72d31;
  }

  .action-button.secondary {
    background: rgba(255,255,255,0.7);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .perfil-actions {
    display: flex;
    justify-content: flex-end;
  }

  .pesquisa-count {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(167,45,49,0.05);
    border: 1px solid rgba(167,45,49,0.18);
    padding: 7px 10px;
    color: #a72d31;
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .pesquisa-busca {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(760px, 100%);
    background: rgba(255,255,255,0.4);
    border: 1px solid #dfe3e1;
    padding: 9px 12px;
    color: #8a928d;
  }

  .search-box input {
    width: 100%;
    border: 0;
    background: transparent;
    outline: none;
    color: #202522;
    font-size: 12px;
  }

  .search-box input::placeholder {
    color: #8a928d;
  }

  .pesquisa-layout {
    display: grid;
    grid-template-columns: 330px minmax(0, 1fr);
    gap: 18px;
    min-height: 520px;
  }

  .pesquisa-lista {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.35);
    padding: 12px;
    min-height: 320px;
  }

  .resultado-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.35);
    padding: 10px 10px;
    text-align: left;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .resultado-item:hover,
  .resultado-item-active {
    background: rgba(167,45,49,0.06);
    border-color: rgba(167,45,49,0.28);
  }

  .resultado-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(167,45,49,0.08);
    color: #a72d31;
    flex-shrink: 0;
  }

  .resultado-texto {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .resultado-texto strong {
    font-size: 11px;
    line-height: 1.3;
    word-break: break-word;
  }

  .resultado-texto small {
    color: #59615c;
    font-size: 8px;
    letter-spacing: 0.06em;
    font-family: 'IBM Plex Mono', monospace;
  }

  .pesquisa-detalhe {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .perfil-card {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 16px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.35);
    padding: 16px;
  }

  .perfil-foto {
    width: 100%;
    aspect-ratio: 1 / 1;
    border: 1px solid #dfe3e1;
    background: #f3f5f4;
    overflow: hidden;
  }

  .perfil-foto img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .perfil-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #a72d31;
    background: rgba(167,45,49,0.06);
  }

  .perfil-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .perfil-topo {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 8px;
    border: 1px solid rgba(167,45,49,0.18);
    background: rgba(167,45,49,0.05);
    color: #a72d31;
    font-size: 7px;
    letter-spacing: 0.12em;
    font-family: 'IBM Plex Mono', monospace;
  }

  .perfil-topo strong {
    font-size: 18px;
    letter-spacing: -0.03em;
  }

  .perfil-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .perfil-grid div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .perfil-grid small {
    font-size: 7px;
    color: #8a928d;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
  }

  .perfil-grid span {
    font-size: 11px;
    color: #202522;
    word-break: break-word;
  }

  .filtros-historico {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.32);
    padding: 12px;
  }

  .filtro-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 180px;
  }

  .filtro-group label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a928d;
    font-family: 'IBM Plex Mono', monospace;
  }

  .filtro-group select,
  .field-group input,
  .field-group select,
  .field-group textarea,
  .observacoes-form textarea,
  .observacao-item textarea {
    width: 100%;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.6);
    padding: 9px 10px;
    color: #202522;
    outline: none;
    box-sizing: border-box;
    font: inherit;
  }

  .historico-header,
  .observacoes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #dfe3e1;
    padding-bottom: 10px;
  }

  .historico-total {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: #8a928d;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
  }

  .historico-lista,
  .observacoes-lista {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .historico-item,
  .observacao-item {
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.35);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .historico-topo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .historico-tipo {
    font-size: 12px;
    font-weight: 700;
  }

  .historico-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 7px;
    font-size: 7px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
  }

  .status-concluida {
    background: rgba(78,111,90,0.08);
    color: #4e6f5a;
  }

  .status-em-andamento {
    background: rgba(167,45,49,0.06);
    color: #a72d31;
  }

  .historico-meta {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    color: #59615c;
    font-size: 10px;
  }

  .historico-meta div {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .historico-item p,
  .observacao-item p {
    margin: 0;
    color: #59615c;
    font-size: 11px;
    line-height: 1.5;
  }

  .historico-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .historico-tags span {
    display: inline-flex;
    align-items: center;
    padding: 5px 7px;
    background: rgba(89,97,92,0.06);
    border: 1px solid rgba(89,97,92,0.12);
    color: #59615c;
    font-size: 7px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
  }

  .observacoes-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.28);
    padding: 16px;
  }

  .observacoes-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .observacao-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #59615c;
    font-size: 10px;
  }

  .observacao-meta small {
    color: #59615c;
  }

  .observacao-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.6);
    color: #202522;
    width: 30px;
    height: 30px;
    cursor: pointer;
  }

  .icon-button.danger {
    color: #a72d31;
    border-color: rgba(167,45,49,0.2);
    background: rgba(167,45,49,0.06);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 22, 0.42);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 24px;
  }

  .modal-card {
    width: min(760px, 100%);
    max-height: 90vh;
    overflow: auto;
    background: #fbfbfa;
    border: 1px solid #dfe3e1;
    box-shadow: 0 20px 50px rgba(27, 32, 30, 0.18);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px solid #dfe3e1;
    padding-bottom: 12px;
  }

  .modal-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field-group span {
    font-size: 8px;
    letter-spacing: 0.1em;
    color: #8a928d;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
  }

  .field-full {
    grid-column: 1 / -1;
  }

  .checkbox-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    align-self: end;
    min-height: 44px;
  }

  .checkbox-field input {
    width: 16px;
    height: 16px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    border-top: 1px solid #dfe3e1;
    padding-top: 12px;
  }

  .detail-error {
    padding: 10px 12px;
    background: rgba(167,45,49,0.06);
    border: 1px solid rgba(167,45,49,0.15);
    color: #a72d31;
    font-size: 11px;
  }

  .pesquisa-empty,
  .pesquisa-empty-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    border: 1px dashed #dfe3e1;
    background: rgba(255,255,255,0.2);
    color: #59615c;
    font-size: 11px;
    text-align: center;
    padding: 18px;
  }

  .pesquisa-empty-panel {
    flex-direction: column;
    gap: 10px;
  }

  .pesquisa-empty-panel.large {
    min-height: 220px;
  }

  @media (max-width: 980px) {
    .pesquisa-layout {
      grid-template-columns: 1fr;
    }

    .perfil-grid,
    .modal-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .pesquisa-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .tipo-selector {
      width: 100%;
      justify-content: space-between;
    }

    .perfil-card,
    .modal-grid {
      grid-template-columns: 1fr;
    }

    .perfil-grid {
      grid-template-columns: 1fr;
    }
  }
`;
