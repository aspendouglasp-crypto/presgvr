import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import {
  Search,
  Calendar,
  Filter,
  AlertCircle,
  Loader2,
  Database,
  Activity,
  ChevronDown,
  X,
  User,
  Camera,
  Pencil,
  Save,
  ShieldAlert,
  MapPin,
  Package,
  FileText,
  History,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Storage de fotos (bucket privado — URLs assinadas)                 */
/* ------------------------------------------------------------------ */

const BUCKET_FOTOS = "fotos-pessoas";

async function subirFoto(file: File, pasta: "presos" | "visitantes") {
  const extensao = (file.name.split(".").pop() || "jpg").toLowerCase();
  const nomeArquivo = `${pasta}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(nomeArquivo, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return nomeArquivo;
}

async function obterUrlFoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .createSignedUrl(path, 3600);
  if (error) {
    console.error("Erro ao gerar URL assinada da foto:", error);
    return null;
  }
  return data?.signedUrl || null;
}

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface Ocorrencia {
  id: string;
  data_fato: string;
  tipo_situacao: string;
  status_ocorrencia: string;
  justificativa_conclusao: string;
  concluida_em: string | null;
  bloco_no_fato: string;
  cela_no_fato: string;
  item_apreendido: string;
  quantidade: string;
  possui_reds: boolean;
  numero_reds: string;
  teve_prisao: boolean;
  historico_resumido: string;
  criado_em: string | null;
  atualizado_em: string | null;

  preso_id: string | null;
  preso_infopen: string;
  preso_nome: string;
  presoSexo: string;
  presoFotoPath: string | null;

  visitante_id: string | null;
  visitante_nome: string;
  visitanteCpf: string;
  visitanteSexo: string;
  visitanteInfopen: string;
  visitanteArtigos: string;
  visitanteReincidente: boolean;
  visitanteFotoPath: string | null;
}

interface ListaOcorrenciasProps {
  tabelaSupabase?: string;
}

function mapearOcorrencia(item: any): Ocorrencia {
  return {
    id: String(item.id),
    data_fato: item.data_fato || "",
    tipo_situacao: item.tipo_situacao || "Apreensão de Ilícito",
    status_ocorrencia: item.status_ocorrencia || 'em_andamento',
    justificativa_conclusao: item.justificativa_conclusao || '',
    concluida_em: item.concluida_em || null,
    bloco_no_fato: item.bloco_no_fato || "",
    cela_no_fato: item.cela_no_fato || "",
    item_apreendido: item.item_apreendido || "",
    quantidade: item.quantidade || "",
    possui_reds: !!item.possui_reds,
    numero_reds: item.numero_reds || "",
    teve_prisao: !!item.teve_prisao,
    historico_resumido: item.historico_resumido || "",
    criado_em: item.criado_em || null,
    atualizado_em: item.atualizado_em || null,

    preso_id: item.preso_id || null,
    preso_infopen: item.preso_infopen || item.presos?.infopen || "",
    preso_nome: item.preso_nome || item.presos?.nome || "NÃO INFORMADO",
    presoSexo: item.presos?.sexo || "",
    presoFotoPath: item.presos?.foto_path || null,

    visitante_id: item.visitante_id || null,
    visitante_nome: item.visitante_nome || item.visitantes?.nome || "NÃO INFORMADO",
    visitanteCpf: item.visitantes?.cpf || "",
    visitanteSexo: item.visitantes?.sexo || "",
    visitanteInfopen: item.visitantes?.infopen || "",
    visitanteArtigos: item.visitantes?.artigos || "",
    visitanteReincidente: !!item.visitantes?.reincidente,
    visitanteFotoPath: item.visitantes?.foto_path || null,
  };
}

/* ------------------------------------------------------------------ */

export default function ListaOcorrencias({
  tabelaSupabase = "ocorrencias_visita",
}: ListaOcorrenciasProps) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  // Detalhamento / edição
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null);
  const [edicao, setEdicao] = useState<Ocorrencia | null>(null);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [urlPresoAtual, setUrlPresoAtual] = useState<string | null>(null);
  const [urlVisitanteAtual, setUrlVisitanteAtual] = useState<string | null>(null);
  const [fotoPresoFile, setFotoPresoFile] = useState<File | null>(null);
  const [fotoVisitanteFile, setFotoVisitanteFile] = useState<File | null>(null);
  const [previewPreso, setPreviewPreso] = useState<string | null>(null);
  const [previewVisitante, setPreviewVisitante] = useState<string | null>(null);

  useEffect(() => {
    carregarOcorrencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabelaSupabase]);

  async function carregarOcorrencias() {
    setIsLoading(true);
    setErro(null);

    try {
      const { data, error } = await supabase
        .from(tabelaSupabase)
        .select(`
          *,
          presos ( infopen, nome, sexo, foto_path ),
          visitantes ( cpf, nome, sexo, infopen, artigos, reincidente, foto_path )
        `)
        .order("data_fato", { ascending: false });

      if (error) throw error;
      if (data) setOcorrencias(data.map(mapearOcorrencia));
    } catch (err: any) {
      console.error("Erro na consulta Supabase:", err);
      setErro("Não foi possível conectar ao banco de dados: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  }

  const ocorrenciasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return ocorrencias.filter((item) => {
      const statusOcorrencia = item.status_ocorrencia || 'em_andamento';
      const atendeBusca =
        termo === "" ||
        item.visitante_nome.toLowerCase().includes(termo) ||
        item.preso_nome.toLowerCase().includes(termo) ||
        (item.historico_resumido || item.item_apreendido || "").toLowerCase().includes(termo) ||
        item.id.toLowerCase().includes(termo) ||
        item.tipo_situacao.toLowerCase().includes(termo);

      const atendeTipo = filtroTipo === "Todos" || item.tipo_situacao === filtroTipo;
      const atendeStatus =
        filtroStatus === "Todos" ||
        (filtroStatus === "Em andamento" && statusOcorrencia === "em_andamento") ||
        (filtroStatus === "Concluída" && statusOcorrencia === "concluida");

      return atendeBusca && atendeTipo && atendeStatus;
    });
  }, [ocorrencias, busca, filtroTipo, filtroStatus]);

  const limparFiltros = () => {
    setBusca("");
    setFiltroTipo("Todos");
    setFiltroStatus("Todos");
  };

  const possuiFiltro = busca.trim() !== "" || filtroTipo !== "Todos" || filtroStatus !== "Todos";

  /* ---------------- detalhamento ---------------- */

  function abrirDetalhe(item: Ocorrencia) {
    setSelecionada(item);
    setEdicao(item);
    setModoEdicao(false);
    setErroEdicao(null);
    limparEstadoFotos();

    setCarregandoFotos(true);
    Promise.all([obterUrlFoto(item.presoFotoPath), obterUrlFoto(item.visitanteFotoPath)]).then(
      ([urlPreso, urlVisitante]) => {
        setUrlPresoAtual(urlPreso);
        setUrlVisitanteAtual(urlVisitante);
        setCarregandoFotos(false);
      }
    );
  }

  function limparEstadoFotos() {
    setFotoPresoFile(null);
    setFotoVisitanteFile(null);
    setPreviewPreso((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    setPreviewVisitante((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    setUrlPresoAtual(null);
    setUrlVisitanteAtual(null);
  }

  function fecharDetalhe() {
    setSelecionada(null);
    setEdicao(null);
    setModoEdicao(false);
    setErroEdicao(null);
    limparEstadoFotos();
  }

  function handleFotoPreso(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFotoPresoFile(file);
    setPreviewPreso((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return URL.createObjectURL(file);
    });
  }

  function handleFotoVisitante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFotoVisitanteFile(file);
    setPreviewVisitante((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return URL.createObjectURL(file);
    });
  }

  async function salvarEdicao() {
    if (!edicao || !selecionada) return;

    if (edicao.status_ocorrencia === 'concluida' && !edicao.justificativa_conclusao.trim()) {
      setErroEdicao('Informe uma justificativa para concluir a ocorrência.');
      return;
    }

    setSalvandoEdicao(true);
    setErroEdicao(null);

    try {
      let presoFotoPath: string | null = null;
      let visitanteFotoPath: string | null = null;

      if (fotoPresoFile) presoFotoPath = await subirFoto(fotoPresoFile, "presos");
      if (fotoVisitanteFile) visitanteFotoPath = await subirFoto(fotoVisitanteFile, "visitantes");

      if (presoFotoPath && edicao.preso_id) {
        const { error } = await supabase
          .from("presos")
          .update({ foto_path: presoFotoPath })
          .eq("id", edicao.preso_id);
        if (error) throw error;
      }

      if (visitanteFotoPath && edicao.visitante_id) {
        const { error } = await supabase
          .from("visitantes")
          .update({ foto_path: visitanteFotoPath })
          .eq("id", edicao.visitante_id);
        if (error) throw error;
      }

      // Atualiza o lançamento. A trigger no banco copia a versão ANTERIOR
      // dessa linha para ocorrencias_visita_historico automaticamente —
      // aqui só gravamos a versão nova, que passa a ser a visível.
      const { error: ocError } = await supabase
        .from(tabelaSupabase)
        .update({
          preso_nome: edicao.preso_nome.trim(),
          preso_infopen: edicao.preso_infopen.trim(),
          visitante_nome: edicao.visitante_nome.trim(),
          data_fato: edicao.data_fato ? new Date(edicao.data_fato).toISOString() : null,
          bloco_no_fato: edicao.bloco_no_fato.trim() || null,
          cela_no_fato: edicao.cela_no_fato.trim() || null,
          tipo_situacao: edicao.tipo_situacao,
          status_ocorrencia: edicao.status_ocorrencia || 'em_andamento',
          item_apreendido: edicao.item_apreendido.trim() || null,
          quantidade: edicao.quantidade.trim() || null,
          possui_reds: edicao.possui_reds,
          numero_reds: edicao.numero_reds.trim() || null,
          teve_prisao: edicao.teve_prisao,
          historico_resumido: edicao.historico_resumido.trim() || null,
          justificativa_conclusao:
            edicao.status_ocorrencia === 'concluida' ? edicao.justificativa_conclusao.trim() || null : null,
          concluida_em:
            edicao.status_ocorrencia === 'concluida' ? new Date().toISOString() : null,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", selecionada.id);

      if (ocError) throw ocError;

      const atualizada: Ocorrencia = {
        ...edicao,
        presoFotoPath: presoFotoPath || selecionada.presoFotoPath,
        visitanteFotoPath: visitanteFotoPath || selecionada.visitanteFotoPath,
        atualizado_em: new Date().toISOString(),
      };

      setOcorrencias((lista) => lista.map((o) => (o.id === atualizada.id ? atualizada : o)));
      setSelecionada(atualizada);
      setEdicao(atualizada);
      setModoEdicao(false);

      setFotoPresoFile(null);
      setFotoVisitanteFile(null);
      setPreviewPreso((atual) => {
        if (atual) URL.revokeObjectURL(atual);
        return null;
      });
      setPreviewVisitante((atual) => {
        if (atual) URL.revokeObjectURL(atual);
        return null;
      });

      if (presoFotoPath) setUrlPresoAtual(await obterUrlFoto(presoFotoPath));
      if (visitanteFotoPath) setUrlVisitanteAtual(await obterUrlFoto(visitanteFotoPath));
    } catch (err: any) {
      console.error("Erro ao salvar edição:", err);
      setErroEdicao("Não foi possível salvar: " + (err.message || "erro desconhecido"));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  function cancelarEdicao() {
    if (!selecionada) return;
    setEdicao(selecionada);
    setModoEdicao(false);
    setErroEdicao(null);
    setFotoPresoFile(null);
    setFotoVisitanteFile(null);
    setPreviewPreso((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    setPreviewVisitante((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
  }

  useEffect(() => {
    if (!selecionada) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharDetalhe();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionada]);

  return (
    <div className="aletheia-content">
      <style>{estilos}</style>

      {/* LINHA DE IDENTIFICAÇÃO DO MÓDULO */}
      <div className="aletheia-module-line">
        <div className="module-left">
          <span className="module-number">M.03</span>
          <span>REGISTRO DE VISITAÇÕES &amp; OCORRÊNCIAS</span>
        </div>

        <div className="module-center">
          <span />
          <Activity size={12} />
          <span />
        </div>

        <div className="module-right">MÓDULO SEGURANÇA</div>
      </div>

      {erro && <div className="aletheia-banner-error">{erro}</div>}

      {/* ÁREA DE BUSCA E FILTROS */}
      <section className="query-area">
        <div className="search-zone">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por visitante, preso, código, tipo ou palavra-chave..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-zone">
          <div className="filter-control">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="filter-select"
            >
              <option value="Todos">TODOS OS TIPOS</option>
              <option value="Flagrada">FLAGRADA</option>
              <option value="Suspeita">SUSPEITA</option>
              <option value="Apreensão Body Scanner">BODY SCANNER</option>
              <option value="Tentativa de Entrada Indevida">ENTRADA INDEVIDA</option>
              <option value="Documentação Falsa">DOCUMENTAÇÃO FALSA</option>
              <option value="Outros">OUTROS</option>
            </select>
            <ChevronDown className="filter-icon" />
          </div>

          <div className="filter-control">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="filter-select"
            >
              <option value="Todos">TODOS OS STATUS</option>
              <option value="Em andamento">EM ANDAMENTO</option>
              <option value="Concluída">CONCLUÍDA</option>
            </select>
            <ChevronDown className="filter-icon" />
          </div>

          <button type="button" className="clear-button" onClick={limparFiltros} title="Limpar filtros">
            {possuiFiltro ? <X size={14} /> : <Filter size={14} />}
          </button>
        </div>
      </section>

      {/* METADADOS / CONTADOR */}
      <div className="result-meta">
        <div className="result-count">
          <Database size={12} />
          <strong>{ocorrenciasFiltradas.length}</strong>
          <span>{ocorrenciasFiltradas.length === 1 ? "OCORRÊNCIA REGISTRADA" : "OCORRÊNCIAS REGISTRADAS"}</span>
          {possuiFiltro && <span className="result-filtered">/ FILTRO ATIVO</span>}
        </div>

        <div className="result-description">CLIQUE EM UM REGISTRO PARA DETALHAR</div>
      </div>

      {/* LISTAGEM DE REGISTROS */}
      <div className="occurrence-list">
        {isLoading ? (
          <div className="aletheia-empty">
            <div className="aletheia-empty-icon">
              <Loader2 size={16} className="aletheia-spin" />
            </div>
            <strong>Consultando Supabase</strong>
            <span>CARREGANDO OCORRÊNCIAS REGISTRADAS</span>
          </div>
        ) : ocorrenciasFiltradas.length > 0 ? (
          ocorrenciasFiltradas.map((item, index) => (
            <div
              key={item.id}
              className="occurrence-row"
              role="button"
              tabIndex={0}
              onClick={() => abrirDetalhe(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  abrirDetalhe(item);
                }
              }}
            >
              <div className="occurrence-index">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>

              <div className="occurrence-subject">
                <div className="occurrence-top">
                  <span className="occurrence-id">#{item.id.slice(0, 8)}</span>
                  <span className="occurrence-type">{item.tipo_situacao}</span>
                </div>
                <div className="subject-label">
                  <User size={12} />
                  <span>{item.visitante_nome}</span>
                </div>
              </div>

              <div className="occurrence-inmate">
                <div className="inmate-title">Preso Vinculado</div>
                <div className="inmate-name">{item.preso_nome}</div>
              </div>

              <div className="occurrence-details">
                <div className="details-text" title={item.historico_resumido || item.item_apreendido}>
                  {item.historico_resumido || item.item_apreendido || "Sem descrição registrada."}
                </div>
              </div>

              <div className="occurrence-date">
                <Calendar size={13} />
                <span>{item.data_fato ? item.data_fato.split("T")[0] : ""}</span>
              </div>

              <div className="occurrence-status">
                <span className={`status-badge ${item.status_ocorrencia === 'concluida' ? 'status-concluida' : 'status-em-andamento'}`}>
                  {item.status_ocorrencia === 'concluida' ? 'Concluída' : 'Em andamento'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="aletheia-empty">
            <div className="aletheia-empty-icon">
              <AlertCircle size={16} />
            </div>
            <strong>Nenhuma ocorrência encontrada</strong>
            <span>TENTE REAJUSTAR OS FILTROS DA CONSULTA</span>
          </div>
        )}
      </div>

      {/* PAINEL DE DETALHAMENTO / EDIÇÃO */}
      {selecionada && edicao && (
        <div className="detail-overlay" onClick={fecharDetalhe}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <div className="detail-header-top">
                <div>
                  <span className="detail-eyebrow">OCORRÊNCIA #{selecionada.id.slice(0, 8)}</span>
                  <h3>{edicao.tipo_situacao}</h3>
                </div>
                <button type="button" className="detail-close" onClick={fecharDetalhe} title="Fechar (Esc)">
                  <X size={16} />
                </button>
              </div>

              <div className="detail-actions">
                {!modoEdicao ? (
                  <button type="button" className="detail-btn" onClick={() => setModoEdicao(true)}>
                    <Pencil size={13} /> Editar lançamento
                  </button>
                ) : (
                  <>
                    <button type="button" className="detail-btn detail-btn-ghost" onClick={cancelarEdicao} disabled={salvandoEdicao}>
                      Cancelar
                    </button>
                    <button type="button" className="detail-btn detail-btn-primary" onClick={salvarEdicao} disabled={salvandoEdicao}>
                      {salvandoEdicao ? <Loader2 size={13} className="aletheia-spin" /> : <Save size={13} />}
                      Salvar alterações
                    </button>
                  </>
                )}
              </div>

              {erroEdicao && <div className="detail-error">{erroEdicao}</div>}

              <div className="detail-audit-note">
                <History size={11} />
                <span>Alterações substituem o registro visível; a versão anterior fica preservada para auditoria.</span>
              </div>
            </div>

            <div className="detail-body">
              {/* FOTOS EM PARALELO */}
              <div className="detail-photos">
                <FotoPessoa
                  titulo="Detento"
                  nome={edicao.preso_nome}
                  preview={previewPreso}
                  urlAtual={urlPresoAtual}
                  carregando={carregandoFotos}
                  editavel={modoEdicao}
                  onSelecionar={handleFotoPreso}
                />
                <FotoPessoa
                  titulo="Visitante"
                  nome={edicao.visitante_nome}
                  preview={previewVisitante}
                  urlAtual={urlVisitanteAtual}
                  carregando={carregandoFotos}
                  editavel={modoEdicao}
                  onSelecionar={handleFotoVisitante}
                  destaque
                />
              </div>

              {/* IDENTIFICAÇÃO */}
              <div className="detail-section">
                <div className="detail-section-title">
                  <ShieldAlert size={13} /> Identificação
                </div>
                <div className="detail-grid">
                  <CampoDetalhe label="Nome do detento" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input"
                        value={edicao.preso_nome}
                        onChange={(e) => setEdicao({ ...edicao, preso_nome: e.target.value })}
                      />
                    ) : (
                      edicao.preso_nome
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="INFOPEN do detento" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input mono"
                        value={edicao.preso_infopen}
                        onChange={(e) => setEdicao({ ...edicao, preso_infopen: e.target.value })}
                      />
                    ) : (
                      <span className="mono">{edicao.preso_infopen || "—"}</span>
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="Nome da visitante" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input"
                        value={edicao.visitante_nome}
                        onChange={(e) => setEdicao({ ...edicao, visitante_nome: e.target.value })}
                      />
                    ) : (
                      edicao.visitante_nome
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="CPF da visitante" editavel={false}>
                    <span className="mono">{edicao.visitanteCpf || "—"}</span>
                  </CampoDetalhe>

                  <CampoDetalhe label="INFOPEN / carteira da visitante" editavel={false}>
                    {edicao.visitanteInfopen || "—"}
                  </CampoDetalhe>

                  <CampoDetalhe label="Artigo enquadrado" editavel={false}>
                    {edicao.visitanteArtigos || "—"}
                  </CampoDetalhe>
                </div>
                {edicao.visitanteReincidente && (
                  <div className="detail-flag">Visitante reincidente em ocorrências</div>
                )}
              </div>

              {/* LOCAL E DATA */}
              <div className="detail-section">
                <div className="detail-section-title">
                  <MapPin size={13} /> Local e data do fato
                </div>
                <div className="detail-grid">
                  <CampoDetalhe label="Data e hora do fato" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        type="datetime-local"
                        className="detail-input mono"
                        value={edicao.data_fato ? edicao.data_fato.slice(0, 16) : ""}
                        onChange={(e) => setEdicao({ ...edicao, data_fato: e.target.value })}
                      />
                    ) : (
                      <span className="mono">
                        {edicao.data_fato ? new Date(edicao.data_fato).toLocaleString("pt-BR") : "—"}
                      </span>
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="Bloco" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input"
                        value={edicao.bloco_no_fato}
                        onChange={(e) => setEdicao({ ...edicao, bloco_no_fato: e.target.value })}
                      />
                    ) : (
                      edicao.bloco_no_fato || "—"
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="Cela" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input"
                        value={edicao.cela_no_fato}
                        onChange={(e) => setEdicao({ ...edicao, cela_no_fato: e.target.value })}
                      />
                    ) : (
                      edicao.cela_no_fato || "—"
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="Tipo de situação" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <select
                        className="detail-input"
                        value={edicao.tipo_situacao}
                        onChange={(e) => setEdicao({ ...edicao, tipo_situacao: e.target.value })}
                      >
                        <option value="Flagrada">Flagrada (com apreensão)</option>
                        <option value="Suspeita">Suspeita / sob averiguação</option>
                        <option value="Apreensão Body Scanner">Apreensão via body scanner</option>
                        <option value="Tentativa de Entrada Indevida">Tentativa de entrada indevida</option>
                        <option value="Documentação Falsa">Documentação falsa / irregular</option>
                        <option value="Outros">Outros desvios</option>
                      </select>
                    ) : (
                      edicao.tipo_situacao
                    )}
                  </CampoDetalhe>
                </div>
              </div>

              {/* APREENSÃO E DESDOBRAMENTOS */}
              <div className="detail-section">
                <div className="detail-section-title">
                  <Package size={13} /> Apreensão e desdobramentos
                </div>
                <div className="detail-grid">
                  <CampoDetalhe label="Item apreendido" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input"
                        value={edicao.item_apreendido}
                        onChange={(e) => setEdicao({ ...edicao, item_apreendido: e.target.value })}
                      />
                    ) : (
                      edicao.item_apreendido || "—"
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="Quantidade / peso" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input"
                        value={edicao.quantidade}
                        onChange={(e) => setEdicao({ ...edicao, quantidade: e.target.value })}
                      />
                    ) : (
                      edicao.quantidade || "—"
                    )}
                  </CampoDetalhe>

                  <CampoDetalhe label="Número do REDS" editavel={modoEdicao}>
                    {modoEdicao ? (
                      <input
                        className="detail-input mono"
                        value={edicao.numero_reds}
                        onChange={(e) => setEdicao({ ...edicao, numero_reds: e.target.value })}
                        disabled={!edicao.possui_reds}
                      />
                    ) : (
                      <span className="mono">{edicao.numero_reds || "—"}</span>
                    )}
                  </CampoDetalhe>
                </div>

                <div className="detail-checks">
                  <label className={`detail-check ${!modoEdicao ? "detail-check-readonly" : ""}`}>
                    <input
                      type="checkbox"
                      checked={edicao.possui_reds}
                      disabled={!modoEdicao}
                      onChange={(e) => setEdicao({ ...edicao, possui_reds: e.target.checked })}
                    />
                    <span className="check-box" />
                    Possui REDS
                  </label>
                  <label className={`detail-check ${!modoEdicao ? "detail-check-readonly" : ""}`}>
                    <input
                      type="checkbox"
                      checked={edicao.teve_prisao}
                      disabled={!modoEdicao}
                      onChange={(e) => setEdicao({ ...edicao, teve_prisao: e.target.checked })}
                    />
                    <span className="check-box" />
                    Condução à Depol
                  </label>
                </div>
              </div>

              {/* STATUS E HISTÓRICO */}
              <div className="detail-section">
                <div className="detail-section-title">
                  <FileText size={13} /> Status e histórico
                </div>

                {modoEdicao ? (
                  <>
                    <div className="detail-status-row">
                      <label className="detail-field" style={{ width: '100%' }}>
                        <span className="detail-field-label">Status da ocorrência</span>
                        <select
                          className="detail-input"
                          value={edicao.status_ocorrencia || 'em_andamento'}
                          onChange={(e) => setEdicao({ ...edicao, status_ocorrencia: e.target.value, ...(e.target.value === 'em_andamento' ? { justificativa_conclusao: '' } : {}) })}
                        >
                          <option value="em_andamento">Em andamento</option>
                          <option value="concluida">Concluída</option>
                        </select>
                      </label>
                    </div>

                    {edicao.status_ocorrencia === 'concluida' && (
                      <div className="detail-status-extra">
                        <label className="detail-field" style={{ width: '100%' }}>
                          <span className="detail-field-label">Justificativa da conclusão</span>
                          <textarea
                            className="detail-input detail-textarea"
                            rows={3}
                            value={edicao.justificativa_conclusao || ''}
                            onChange={(e) => setEdicao({ ...edicao, justificativa_conclusao: e.target.value })}
                            placeholder="Descreva o motivo da conclusão da ocorrência..."
                          />
                        </label>
                      </div>
                    )}

                    <div className="detail-status-extra">
                      <label className="detail-field" style={{ width: '100%' }}>
                        <span className="detail-field-label">Histórico resumido</span>
                        <textarea
                          className="detail-input detail-textarea"
                          rows={3}
                          value={edicao.historico_resumido}
                          onChange={(e) => setEdicao({ ...edicao, historico_resumido: e.target.value })}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="detail-paragraph"><strong>Status:</strong> {edicao.status_ocorrencia === 'concluida' ? 'Concluída' : 'Em andamento'}</p>
                    {edicao.status_ocorrencia === 'concluida' && edicao.justificativa_conclusao && (
                      <p className="detail-paragraph detail-status-note">{edicao.justificativa_conclusao}</p>
                    )}
                    <p className="detail-paragraph">{edicao.historico_resumido || "Nenhum histórico registrado."}</p>
                  </>
                )}
              </div>

              <div className="detail-timestamps">
                {edicao.criado_em && <span>Registrado em {new Date(edicao.criado_em).toLocaleString("pt-BR")}</span>}
                {edicao.atualizado_em && <span>· Última edição em {new Date(edicao.atualizado_em).toLocaleString("pt-BR")}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponentes                                                     */
/* ------------------------------------------------------------------ */

function CampoDetalhe({
  label,
  children,
}: {
  label: string;
  editavel: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <div className="detail-field-value">{children}</div>
    </div>
  );
}

function FotoPessoa({
  titulo,
  nome,
  preview,
  urlAtual,
  carregando,
  editavel,
  onSelecionar,
  destaque = false,
}: {
  titulo: string;
  nome: string;
  preview: string | null;
  urlAtual: string | null;
  carregando: boolean;
  editavel: boolean;
  onSelecionar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  destaque?: boolean;
}) {
  const src = preview || urlAtual;

  return (
    <div className={`detail-photo-card ${destaque ? "detail-photo-card-focus" : ""}`}>
      <div className="detail-photo-frame">
        {carregando ? (
          <Loader2 size={18} className="aletheia-spin" />
        ) : src ? (
          <img src={src} alt={`Foto de ${nome}`} />
        ) : (
          <User size={22} />
        )}

        {editavel && (
          <label className="detail-photo-upload" title="Selecionar foto">
            <input type="file" accept="image/*" onChange={onSelecionar} hidden />
            <Camera size={13} />
          </label>
        )}
      </div>
      <div className="detail-photo-caption">
        <span className="detail-photo-title">{titulo}</span>
        <span className="detail-photo-name">{nome}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Estilos                                                             */
/* ------------------------------------------------------------------ */

const estilos = `
  .aletheia-content {
    width: 100%;
    color: #202522;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .aletheia-module-line {
    height: 34px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    border-bottom: 1px solid #dfe3e1;
    color: #8a928d;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
    letter-spacing: 0.12em;
  }

  .module-left, .module-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .module-right {
    justify-content: flex-end;
  }

  .module-number {
    color: #a72d31;
  }

  .module-center {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #cbd0cd;
  }

  .module-center span {
    width: 38px;
    height: 1px;
    background: #dfe3e1;
  }

  .query-area {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 20px;
    margin-top: 16px;
    padding-bottom: 20px;
    border-bottom: 1px solid #dfe3e1;
  }

  .search-zone {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 40px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.65);
  }

  .search-zone:focus-within {
    border-color: rgba(167,45,49,0.45);
    box-shadow: 0 0 0 2px rgba(167,45,49,0.045);
  }

  .search-icon {
    width: 15px;
    height: 15px;
    margin-left: 11px;
    flex-shrink: 0;
    color: #8a928d;
  }

  .search-input {
    width: 100%;
    height: 38px;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 0 10px;
    color: #202522;
    font-size: 11px;
  }

  .search-input::placeholder {
    color: #a4aaa6;
  }

  .filter-zone {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
  }

  .filter-control {
    position: relative;
  }

  .filter-select {
    appearance: none;
    width: 100%;
    height: 40px;
    padding: 0 31px 0 10px;
    border: 1px solid #dfe3e1;
    border-radius: 0;
    background: rgba(255,255,255,0.65);
    color: #59615c;
    outline: none;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
    letter-spacing: 0.03em;
    cursor: pointer;
  }

  .filter-select:focus {
    border-color: rgba(167,45,49,0.45);
    box-shadow: 0 0 0 2px rgba(167,45,49,0.045);
  }

  .filter-icon {
    position: absolute;
    right: 9px;
    top: 50%;
    transform: translateY(-50%);
    width: 13px;
    height: 13px;
    pointer-events: none;
    color: #8a928d;
  }

  .clear-button {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #dfe3e1;
    background: transparent;
    color: #8a928d;
    cursor: pointer;
    transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .clear-button:hover {
    color: #a72d31;
    border-color: rgba(167,45,49,0.30);
    background: rgba(167,45,49,0.045);
  }

  .result-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 0 10px;
  }

  .result-count {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #59615c;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
    letter-spacing: 0.07em;
  }

  .result-count strong {
    color: #202522;
    font-size: 10px;
    font-weight: 600;
  }

  .result-filtered {
    color: #a72d31;
  }

  .result-description {
    color: #8a928d;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 7px;
    letter-spacing: 0.08em;
  }

  .occurrence-list {
    position: relative;
    border-top: 1px solid #cbd0cd;
  }

  .occurrence-row {
    display: grid;
    grid-template-columns: 60px 220px 200px minmax(200px, 1fr) 110px 110px;
    align-items: center;
    min-height: 72px;
    border-bottom: 1px solid #dfe3e1;
    transition: background 0.18s ease;
    cursor: pointer;
  }

  .occurrence-row:hover, .occurrence-row:focus-visible {
    background: rgba(167,45,49,0.035);
    outline: none;
  }

  .occurrence-index {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    border-right: 1px solid #e5e8e6;
    color: #a72d31;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
  }

  .occurrence-index span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1px solid rgba(167,45,49,0.22);
    background: rgba(167,45,49,0.035);
  }

  .occurrence-subject {
    padding: 10px 14px;
    min-width: 0;
  }

  .occurrence-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .occurrence-id {
    color: #8a928d;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
  }

  .occurrence-type {
    color: #a72d31;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .subject-label {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #202522;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .subject-label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subject-label svg {
    color: #8a928d;
    flex-shrink: 0;
  }

  .occurrence-inmate {
    padding: 10px 14px;
    border-left: 1px dashed #dfe3e1;
    min-width: 0;
  }

  .inmate-title {
    color: #8a928d;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 7px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 3px;
  }

  .inmate-name {
    color: #59615c;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .occurrence-details {
    padding: 10px 14px;
    border-left: 1px dashed #dfe3e1;
    min-width: 0;
  }

  .details-text {
    color: #8a928d;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .occurrence-date {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-left: 1px dashed #dfe3e1;
    color: #59615c;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
    white-space: nowrap;
  }

  .occurrence-date svg {
    color: #8a928d;
    flex-shrink: 0;
  }

  .occurrence-status {
    display: flex;
    justify-content: flex-end;
    padding-right: 8px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    min-width: 85px;
    justify-content: center;
    padding: 5px 6px;
    border: 1px solid;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 7px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .status-em-andamento {
    color: #7b5b1d;
    border-color: rgba(123,91,29,0.22);
    background: rgba(255,193,7,0.08);
  }

  .status-concluida {
    color: #4e6f5a;
    border-color: rgba(78,111,90,0.24);
    background: rgba(78,111,90,0.055);
  }

  .detail-status-row {
    margin-bottom: 12px;
  }

  .detail-status-extra {
    margin-top: 12px;
  }

  .detail-status-note {
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(123,91,29,0.05);
    border-left: 2px solid rgba(123,91,29,0.35);
  }

  .aletheia-banner-error {
    padding: 8px 12px;
    margin-top: 10px;
    border: 1px solid rgba(167,45,49,0.2);
    background: rgba(167,45,49,0.04);
    color: #a72d31;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 8px;
    letter-spacing: 0.05em;
  }

  .aletheia-empty {
    min-height: 190px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-bottom: 1px solid #dfe3e1;
    color: #8a928d;
  }

  .aletheia-empty-icon {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #dfe3e1;
    color: #a72d31;
    background: rgba(167,45,49,0.025);
  }

  .aletheia-empty strong {
    color: #59615c;
    font-size: 11px;
    font-weight: 500;
  }

  .aletheia-empty span {
    color: #8a928d;
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 7px;
    letter-spacing: 0.06em;
  }

  .aletheia-spin {
    animation: aletheia-spin 0.85s linear infinite;
  }

  @keyframes aletheia-spin {
    to { transform: rotate(360deg); }
  }

  /* ---------------- painel de detalhamento ---------------- */

  .detail-overlay {
    position: fixed;
    inset: 0;
    background: rgba(32,37,34,0.32);
    backdrop-filter: blur(1.5px);
    display: flex;
    justify-content: flex-end;
    z-index: 70;
  }

  .detail-panel {
    width: min(480px, 100%);
    height: 100%;
    background: #fafbfa;
    border-left: 1px solid #cbd0cd;
    overflow-y: auto;
    animation: detail-slide-in 0.22s ease;
  }

  @keyframes detail-slide-in {
    from { transform: translateX(24px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .detail-header {
    position: sticky;
    top: 0;
    background: #fafbfa;
    border-bottom: 1px solid #dfe3e1;
    padding: 18px 20px 14px;
    z-index: 1;
  }

  .detail-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .detail-eyebrow {
    display: block;
    font-family: "IBM Plex Mono", monospace;
    font-size: 8px;
    letter-spacing: 0.12em;
    color: #8a928d;
    margin-bottom: 3px;
  }

  .detail-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #a72d31;
    letter-spacing: -0.01em;
  }

  .detail-close {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #dfe3e1;
    background: transparent;
    color: #59615c;
    cursor: pointer;
  }
  .detail-close:hover { color: #a72d31; border-color: rgba(167,45,49,0.3); }

  .detail-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }

  .detail-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.6);
    color: #59615c;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
  }
  .detail-btn:hover:not(:disabled) { border-color: rgba(167,45,49,0.35); color: #a72d31; }
  .detail-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .detail-btn-primary {
    background: #a72d31;
    border-color: #a72d31;
    color: #fafbfa;
  }
  .detail-btn-primary:hover:not(:disabled) { background: #862427; color: #fafbfa; }

  .detail-btn-ghost { background: transparent; }

  .detail-error {
    margin-top: 10px;
    padding: 8px 10px;
    border-left: 2px solid #a72d31;
    background: rgba(167,45,49,0.06);
    color: #862427;
    font-size: 11px;
  }

  .detail-audit-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    color: #8a928d;
    font-size: 9.5px;
    line-height: 1.4;
  }
  .detail-audit-note svg { flex-shrink: 0; }

  .detail-body {
    padding: 18px 20px 28px;
  }

  .detail-photos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 22px;
  }

  .detail-photo-card {
    border: 1px solid #dfe3e1;
    background: #fff;
    padding: 12px;
  }
  .detail-photo-card-focus { border-color: rgba(167,45,49,0.3); }

  .detail-photo-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f4f5f4;
    border: 1px solid #eef0ef;
    color: #8a928d;
    overflow: hidden;
  }
  .detail-photo-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .detail-photo-upload {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #a72d31;
    color: #fafbfa;
    cursor: pointer;
    border: 1px solid #862427;
  }
  .detail-photo-upload:hover { background: #862427; }

  .detail-photo-caption {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 8px;
  }
  .detail-photo-title {
    font-family: "IBM Plex Mono", monospace;
    font-size: 7.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8a928d;
  }
  .detail-photo-name {
    font-size: 11.5px;
    font-weight: 600;
    color: #202522;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-section {
    margin-bottom: 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid #eef0ef;
  }
  .detail-section:last-of-type { border-bottom: 0; }

  .detail-section-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 600;
    color: #202522;
    margin-bottom: 12px;
  }
  .detail-section-title svg { color: #a72d31; }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 14px;
  }

  .detail-field { min-width: 0; }

  .detail-field-label {
    display: block;
    font-family: "IBM Plex Mono", monospace;
    font-size: 7.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8a928d;
    margin-bottom: 4px;
  }

  .detail-field-value {
    font-size: 12px;
    color: #202522;
    word-break: break-word;
  }

  .detail-input {
    width: 100%;
    height: 32px;
    border: 1px solid #dfe3e1;
    background: rgba(255,255,255,0.7);
    padding: 0 8px;
    font-size: 12px;
    color: #202522;
    outline: none;
    font-family: inherit;
  }
  .detail-input:focus { border-color: rgba(167,45,49,0.5); box-shadow: 0 0 0 2px rgba(167,45,49,0.06); }
  .detail-input:disabled { opacity: 0.5; }
  .detail-input.mono { font-family: "IBM Plex Mono", monospace; font-size: 11px; }

  .detail-textarea { height: auto; min-height: 70px; padding: 8px; resize: vertical; line-height: 1.5; }

  .detail-flag {
    margin-top: 10px;
    display: inline-block;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 500;
    color: #862427;
    background: rgba(167,45,49,0.06);
    border: 1px solid rgba(167,45,49,0.2);
  }

  .detail-checks {
    display: flex;
    gap: 18px;
    margin-top: 14px;
  }

  .detail-check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: #59615c;
    cursor: pointer;
    user-select: none;
  }
  .detail-check-readonly { cursor: default; }
  .detail-check input { position: absolute; opacity: 0; pointer-events: none; }
  .detail-check .check-box {
    width: 14px;
    height: 14px;
    border: 1px solid #cbd0cd;
    background: rgba(255,255,255,0.5);
    position: relative;
  }
  .detail-check input:checked + .check-box { background: #a72d31; border-color: #a72d31; }
  .detail-check input:checked + .check-box:after {
    content: "";
    position: absolute;
    width: 6px;
    height: 3px;
    left: 3px;
    top: 4px;
    border-left: 1.5px solid white;
    border-bottom: 1.5px solid white;
    transform: rotate(-45deg);
  }

  .detail-paragraph {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: #59615c;
  }

  .detail-timestamps {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-family: "IBM Plex Mono", monospace;
    font-size: 8.5px;
    color: #8a928d;
    letter-spacing: 0.02em;
  }

  @media (max-width: 1024px) {
    .occurrence-row { grid-template-columns: 50px 180px 160px 100px 95px; }
    .occurrence-details { display: none; }
  }

  @media (max-width: 768px) {
    .query-area { grid-template-columns: 1fr; }
    .filter-zone { grid-template-columns: 1fr 1fr 40px; }
    .occurrence-row { grid-template-columns: 45px 1fr 1fr; }
    .occurrence-date, .occurrence-details { display: none; }
    .detail-panel { width: 100%; }
  }
`;