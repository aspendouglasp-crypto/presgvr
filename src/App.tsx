import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ListaOcorrencias from "./ListaOcorrencias";
import PesquisaIndividuos from "./PesquisaIndividuos";
import { supabase } from "./supabaseClient"; // Certifique-se de que o caminho do seu cliente Supabase esteja correto
import DashboardEstatisticas from "./DashboardEstatisticas";
import { BarChart3 } from 'lucide-react';
import {
  ShieldAlert,
  Search,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  UserPlus,
  FilePlus,
  RotateCcw,
  Send,
  Keyboard,
  X,
  Loader2,
  Fingerprint,
  Database,
  Activity,
  ArrowRight,
  Camera,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Storage de fotos (bucket privado — URLs assinadas)                 */
/* ------------------------------------------------------------------ */

const BUCKET_FOTOS = 'fotos-pessoas';

async function subirFoto(file: File, pasta: 'presos' | 'visitantes') {
  const extensao = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const nomeArquivo = `${pasta}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(nomeArquivo, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return nomeArquivo;
}

async function obterUrlFoto(fotoPath: string | null) {
  if (!fotoPath) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .createSignedUrl(fotoPath, 60 * 60);

  if (error) {
    console.error('Erro ao obter foto cadastrada:', error);
    return null;
  }

  return data?.signedUrl || null;
}

/* ------------------------------------------------------------------ */
/*  Estado inicial e utilitários                                      */
/* ------------------------------------------------------------------ */

const nowLocal = () => new Date().toISOString().slice(0, 16);

const estadoInicialForm = {
  data_fato: nowLocal(),
  protocolo: '',
  preso_infopen: '',
  preso_nome: '',
  preso_sexo: 'Masculino',
  bloco_no_fato: '',
  cela_no_fato: '',

  visitante_nome: '',
  visitante_cpf: '',
  visitante_sexo: 'Feminino',
  visitante_infopen: '',
  visitante_reincidente: false,
  visitante_artigos: '',

  tipo_situacao: 'Flagrada',
  status_ocorrencia: 'em_andamento',
  item_apreendido: '',
  quantidade: '',
  unidade_medida: '',
  possui_reds: false,
  numero_reds: '',
  teve_prisao: false,
  historico_resumido: '',
  justificativa_conclusao: '',
};

const UNIDADES_MEDIDA = [
  { value: 'g', label: 'Grama (g)' },
  { value: 'kg', label: 'Quilograma (kg)' },
  { value: 'mg', label: 'Miligrama (mg)' },
  { value: 'ml', label: 'Mililitro (mL)' },
  { value: 'l', label: 'Litro (L)' },
  { value: 'unidade', label: 'Unidade (un.)' },
  { value: 'comprimido', label: 'Comprimido' },
  { value: 'capsula', label: 'Cápsula' },
  { value: 'ampola', label: 'Ampola' },
  { value: 'frasco', label: 'Frasco' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'porcao', label: 'Porção' },
  { value: 'objeto', label: 'Objeto' },
];

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const modKeyLabel = isMac ? '⌘' : 'Ctrl';



/* ------------------------------------------------------------------ */
/*  Fontes                                                             */
/* ------------------------------------------------------------------ */

function useFontes() {
  useEffect(() => {
    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

    document.head.appendChild(link);

    return () => {
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export default function App() {
  useFontes();

  // Estado para alternar entre as telas
  const [abaAtiva, setAbaAtiva] = useState('formulario');

  const [form, setForm] = useState(estadoInicialForm);
  const [fotoVisitante, setFotoVisitante] = useState<File | null>(null);
  const [previewFotoVisitante, setPreviewFotoVisitante] = useState<string | null>(null);
  const [fotoPreso, setFotoPreso] = useState<File | null>(null);
  const [previewFotoPreso, setPreviewFotoPreso] = useState<string | null>(null);

  const [ocorrencias, setOcorrencias] = useState<any[]>([]);

  const [presoStatus, setPresoStatus] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle');
  const [visitanteStatus, setVisitanteStatus] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle');

  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<{ tipo: 'success' | 'error'; mensagem: string } | null>(null);
  const [mostrarAjuda, setMostrarAjuda] = useState(false);

  const [erros, setErros] = useState<Record<string, boolean>>({});
  const [presoHistorico, setPresoHistorico] = useState<any[]>([]);
  const [visitanteHistorico, setVisitanteHistorico] = useState<any[]>([]);
  const [presoPreviewId, setPresoPreviewId] = useState<number | null>(null);
  const [visitantePreviewId, setVisitantePreviewId] = useState<number | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);
  const infopenRef = useRef<HTMLInputElement | null>(null);
  const cpfRef = useRef<HTMLInputElement | null>(null);
  const tipoRef = useRef<HTMLSelectElement | null>(null);

  const toastTimer = useRef<number | null>(null);
  const presoTimer = useRef<number | null>(null);
  const visitanteTimer = useRef<number | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Buscar Ocorrências Recentes do Supabase                         */
  /* ---------------------------------------------------------------- */

  const carregarOcorrenciasRecentes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ocorrencias_visita')
        .select(`
          *,
          presos ( infopen, nome ),
          visitantes ( nome )
        `)
        .order('criado_em', { ascending: false })
        .limit(40);

      if (error) throw error;

      // Normaliza o retorno para manter compatibilidade de exibição
      const formatadas = (data || []).map((o: any) => ({
        id: o.id,
        criado_em: o.criado_em,
        tipo_situacao: o.tipo_situacao,
        preso_nome: o.preso_nome || o.presos?.nome || '',
        preso_infopen: o.preso_infopen || o.presos?.infopen || '',
        visitante_nome: o.visitante_nome || o.visitantes?.nome || '',
      }));

      setOcorrencias(formatadas);
    } catch (e) {
      console.error('Erro ao buscar ocorrências do Supabase:', e);
    } finally {
      // no-op
    }
  }, []);

  useEffect(() => {
    carregarOcorrenciasRecentes();
  }, [carregarOcorrenciasRecentes]);

  /* ---------------------------------------------------------------- */
  /*  Toast                                                             */
  /* ---------------------------------------------------------------- */

  const mostrarToast = useCallback((tipo: 'success' | 'error', mensagem: string) => {
    setToast({
      tipo,
      mensagem,
    });

    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }

    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, 4200);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Histórico e pessoas relacionadas                                  */
  /* ---------------------------------------------------------------- */

  const carregarHistoricoPessoa = useCallback(async (
    tipo: 'preso' | 'visitante',
    id?: number | null,
    valor?: string | null,
  ) => {
    if (!id && !valor) return [];

    let query = supabase
      .from('ocorrencias_visita')
      .select(`
        id,
        criado_em,
        tipo_situacao,
        status_ocorrencia,
        item_apreendido,
        historico_resumido,
        preso_id,
        preso_infopen,
        preso_nome,
        visitante_id,
        visitante_nome,
        visitantes ( nome, cpf ),
        presos ( nome, infopen )
      `)
      .order('criado_em', { ascending: false })
      .limit(8);

    if (tipo === 'preso') {
      query = id
        ? query.eq('preso_id', id)
        : query.eq('preso_infopen', valor);
    } else {
      query = id
        ? query.eq('visitante_id', id)
        : query.eq('visitante_nome', valor);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Erro ao consultar histórico de ${tipo}:`, error);
      return [];
    }

    return (data || []).map((item: any) => {
      const pessoaAtual = tipo === 'preso'
        ? (item.preso_nome || item.presos?.nome || 'Detento')
        : (item.visitante_nome || item.visitantes?.nome || 'Visitante');

      const pessoaRelacionada = tipo === 'preso'
        ? (item.visitante_nome || item.visitantes?.nome || 'Visitante relacionado')
        : (item.preso_nome || item.presos?.nome || 'Detento relacionado');

      return {
        id: item.id,
        criado_em: item.criado_em,
        tipo_situacao: item.tipo_situacao,
        status_ocorrencia: item.status_ocorrencia,
        item_apreendido: item.item_apreendido,
        historico_resumido: item.historico_resumido,
        pessoaAtual,
        pessoaRelacionada,
        resumo: tipo === 'preso'
          ? `${pessoaAtual} foi relacionado com ${pessoaRelacionada}`
          : `${pessoaAtual} esteve relacionado com ${pessoaRelacionada}`,
      };
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Verificação do detento no Supabase                              */
  /* ---------------------------------------------------------------- */

  const handleBlurPreso = () => {
    const infopen = form.preso_infopen.trim();

    if (presoTimer.current) {
      window.clearTimeout(presoTimer.current);
    }

    if (!infopen) {
      setPresoStatus('idle');
      return;
    }

    setPresoStatus('checking');

    presoTimer.current = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('presos')
          .select('*')
          .eq('infopen', infopen)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setForm((prev) => ({
            ...prev,
            preso_nome: data.nome || prev.preso_nome,
            preso_sexo: data.sexo || prev.preso_sexo,
            bloco_no_fato: data.bloco || prev.bloco_no_fato,
            cela_no_fato: data.cela || prev.cela_no_fato,
          }));

          if (data.foto_path) {
            const fotoUrl = await obterUrlFoto(data.foto_path);
            setPreviewFotoPreso(fotoUrl);
          } else {
            setPreviewFotoPreso(null);
          }

          const historico = await carregarHistoricoPessoa('preso', data.id, infopen);
          setPresoHistorico(historico);
          setPresoPreviewId(historico[0]?.id ?? null);

          setFotoPreso(null);
          setPresoStatus('found');
        } else {
          setPreviewFotoPreso(null);
          setFotoPreso(null);
          setPresoHistorico([]);
          setPresoPreviewId(null);
          setPresoStatus('not_found');
        }
      } catch (e) {
        console.error('Erro ao consultar preso:', e);
        setPresoStatus('idle');
      }
    }, 260);
  };

  /* ---------------------------------------------------------------- */
  /*  Verificação da visitante no Supabase                           */
  /* ---------------------------------------------------------------- */

  const handleBlurVisitante = () => {
    const cpf = form.visitante_cpf.trim();

    if (visitanteTimer.current) {
      window.clearTimeout(visitanteTimer.current);
    }

    if (!cpf) {
      setVisitanteStatus('idle');
      return;
    }

    setVisitanteStatus('checking');

    visitanteTimer.current = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('visitantes')
          .select('*')
          .eq('cpf', cpf)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setForm((prev) => ({
            ...prev,
            visitante_nome: data.nome || prev.visitante_nome,
            visitante_sexo: data.sexo || prev.visitante_sexo,
            visitante_infopen: data.infopen || prev.visitante_infopen,
            visitante_artigos: data.artigos || prev.visitante_artigos,
            visitante_reincidente: !!data.reincidente,
          }));

          if (data.foto_path) {
            const fotoUrl = await obterUrlFoto(data.foto_path);
            setPreviewFotoVisitante(fotoUrl);
          } else {
            setPreviewFotoVisitante(null);
          }

          const historico = await carregarHistoricoPessoa('visitante', data.id, cpf);
          setVisitanteHistorico(historico);
          setVisitantePreviewId(historico[0]?.id ?? null);

          setFotoVisitante(null);
          setVisitanteStatus('found');
        } else {
          setPreviewFotoVisitante(null);
          setFotoVisitante(null);
          setVisitanteHistorico([]);
          setVisitantePreviewId(null);
          setVisitanteStatus('not_found');
        }
      } catch (e) {
        console.error('Erro ao consultar visitante:', e);
        setVisitanteStatus('idle');
      }
    }, 260);
  };

  /* ---------------------------------------------------------------- */
  /*  Reset                                                            */
  /* ---------------------------------------------------------------- */

  const handleReset = useCallback(() => {
    setForm({
      ...estadoInicialForm,
      data_fato: nowLocal(),
    });

    setFotoVisitante(null);
    setPreviewFotoVisitante((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    setFotoPreso(null);
    setPreviewFotoPreso((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });

    setPresoHistorico([]);
    setVisitanteHistorico([]);
    setPresoPreviewId(null);
    setVisitantePreviewId(null);
    setPresoStatus('idle');
    setVisitanteStatus('idle');
    setErros({});
  }, []);

  const handleSelecionarFotoVisitante = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFotoVisitante(file);
    setPreviewFotoVisitante((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return URL.createObjectURL(file);
    });
  };

  const handleSelecionarFotoPreso = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFotoPreso(file);
    setPreviewFotoPreso((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return URL.createObjectURL(file);
    });
  };

  /* ---------------------------------------------------------------- */
  /*  Validação                                                        */
  /* ---------------------------------------------------------------- */

  const validar = () => {
    const proximos: Record<string, boolean> = {};
    if (form.protocolo && form.protocolo.trim() !== '') {
      const padraoProtocolo = /^\d+\/\d{4}$/;
      if (!padraoProtocolo.test(form.protocolo.trim())) {
        proximos.protocolo = true;
      }
    }

    if (!form.visitante_cpf.trim()) {
      proximos.visitante_cpf = true;
    }

    if (!form.preso_infopen.trim()) {
      proximos.preso_infopen = true;
    }

    if (!form.preso_nome.trim()) {
      proximos.preso_nome = true;
    }

    if (!form.visitante_nome.trim()) {
      proximos.visitante_nome = true;
    }

    if (!form.tipo_situacao) {
      proximos.tipo_situacao = true;
    }

    if (form.status_ocorrencia === 'concluida' && !form.justificativa_conclusao.trim()) {
      proximos.justificativa_conclusao = true;
    }

    setErros(proximos);

    return Object.keys(proximos).length === 0;
  };

  /* ---------------------------------------------------------------- */
  /*  Salvar (Supabase Consultas / Criações + Insert Ocorrência)      */
  /* ---------------------------------------------------------------- */

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validar()) {
      mostrarToast(
        'error',
        'Preencha os campos obrigatórios antes de salvar.'
      );
      return;
    }

    setSalvando(true);

    try {
      const infopenLimpo = form.preso_infopen.trim();
      const presoNomeLimpo = form.preso_nome.trim();

      let presoFotoPath = null;
      if (fotoPreso) {
        presoFotoPath = await subirFoto(fotoPreso, 'presos');
      }

      // 1. Obter ou Criar Preso
      const { data: presoExistente, error: presoConsultaError } = await supabase
        .from('presos')
        .select('id')
        .eq('infopen', infopenLimpo)
        .maybeSingle();

      if (presoConsultaError) throw presoConsultaError;

      let presoId = presoExistente?.id;

      if (presoId) {
        const { error: presoUpdateError } = await supabase
          .from('presos')
          .update({
            nome: presoNomeLimpo,
            sexo: form.preso_sexo,
            bloco: form.bloco_no_fato.trim() || null,
            cela: form.cela_no_fato.trim() || null,
            ...(presoFotoPath ? { foto_path: presoFotoPath } : {}),
          })
          .eq('id', presoId);

        if (presoUpdateError) throw presoUpdateError;
      } else {
        const { data: novoPreso, error: presoInsertError } = await supabase
          .from('presos')
          .insert({
            infopen: infopenLimpo,
            nome: presoNomeLimpo,
            sexo: form.preso_sexo,
            bloco: form.bloco_no_fato.trim() || null,
            cela: form.cela_no_fato.trim() || null,
            ...(presoFotoPath ? { foto_path: presoFotoPath } : {}),
          })
          .select('id')
          .single();

        if (presoInsertError) throw presoInsertError;
        presoId = novoPreso.id;
      }

      // 2. Obter ou Criar Visitante
      let visitanteId = null;
      const cpfLimpo = form.visitante_cpf.trim();

      // Se uma foto foi selecionada, sobe pro Storage antes de gravar —
      // se não houver foto nova, o campo simplesmente não entra no
      // payload e a foto já cadastrada (se existir) é preservada.
      let visitanteFotoPath = null;
      if (fotoVisitante) {
        visitanteFotoPath = await subirFoto(fotoVisitante, 'visitantes');
      }
      const camposFoto = visitanteFotoPath ? { foto_path: visitanteFotoPath } : {};

      if (cpfLimpo) {
        const { data: visitanteExistente, error: visConsultaError } = await supabase
          .from('visitantes')
          .select('id')
          .eq('cpf', cpfLimpo)
          .maybeSingle();

        if (visConsultaError) throw visConsultaError;

        if (visitanteExistente) {
          visitanteId = visitanteExistente.id;
          const { error: visUpdateError } = await supabase
            .from('visitantes')
            .update({
              nome: form.visitante_nome.trim(),
              sexo: form.visitante_sexo,
              infopen: form.visitante_infopen.trim() || null,
              artigos: form.visitante_artigos.trim() || null,
              reincidente: form.visitante_reincidente,
              ...camposFoto,
            })
            .eq('id', visitanteId);

          if (visUpdateError) throw visUpdateError;
        } else {
          const { data: novaVisitante, error: visInsertError } = await supabase
            .from('visitantes')
            .insert({
              cpf: cpfLimpo,
              nome: form.visitante_nome.trim(),
              sexo: form.visitante_sexo,
              infopen: form.visitante_infopen.trim() || null,
              artigos: form.visitante_artigos.trim() || null,
              reincidente: form.visitante_reincidente,
              ...camposFoto,
            })
            .select('id')
            .single();

          if (visInsertError) throw visInsertError;
          visitanteId = novaVisitante.id;
        }
      } else {
        const { data: novaVisitante, error: visInsertError } = await supabase
          .from('visitantes')
          .insert({
            nome: form.visitante_nome.trim(),
            sexo: form.visitante_sexo,
            infopen: form.visitante_infopen.trim() || null,
            artigos: form.visitante_artigos.trim() || null,
            reincidente: form.visitante_reincidente,
            ...camposFoto,
          })
          .select('id')
          .single();

        if (visInsertError) throw visInsertError;
        visitanteId = novaVisitante.id;
      }

      // 3. Registrar a Ocorrência conectando as FKs e colunas obrigatórias
      const { error: ocError } = await supabase
        .from('ocorrencias_visita')
        .insert({
          preso_id: presoId,
          preso_infopen: infopenLimpo,
          preso_nome: presoNomeLimpo,
          visitante_id: visitanteId,
          visitante_nome: form.visitante_nome.trim(),
          data_fato: new Date(form.data_fato).toISOString(),
          protocolo: form.protocolo.trim() || null,
          bloco_no_fato: form.bloco_no_fato.trim() || null,
          cela_no_fato: form.cela_no_fato.trim() || null,
          tipo_situacao: form.tipo_situacao,
          status_ocorrencia: form.status_ocorrencia || 'em_andamento',
          item_apreendido: form.item_apreendido.trim() || null,
          quantidade:
            form.quantidade.trim()
              ? `${form.quantidade.trim()}${form.unidade_medida ? ` ${form.unidade_medida}` : ''}`
              : null,
          possui_reds: form.possui_reds,
          numero_reds: form.numero_reds.trim() || null,
          teve_prisao: form.teve_prisao,
          historico_resumido: form.historico_resumido.trim() || null,
          justificativa_conclusao:
            form.status_ocorrencia === 'concluida' ? form.justificativa_conclusao.trim() || null : null,
          concluida_em:
            form.status_ocorrencia === 'concluida' ? new Date().toISOString() : null,
        });

      if (ocError) throw ocError;

      mostrarToast(
        'success',
        'Ocorrência registrada e entidades sincronizadas.'
      );

      handleReset();
    } catch (err) {
      console.error('Erro ao salvar no Supabase:', err);
      mostrarToast(
        'error',
        'Não foi possível salvar agora. Os dados foram mantidos no formulário.'
      );
    } finally {
      setSalvando(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Atalhos                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      const tag = document.activeElement
        ? document.activeElement.tagName
        : '';

      const digitando =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT';

      if (mod && e.key === 'Enter') {
        e.preventDefault();

        if (formRef.current) {
          formRef.current.requestSubmit();
        }

        return;
      }

      if (
        mod &&
        (e.key === 'Backspace' || e.key === 'Delete')
      ) {
        e.preventDefault();

        handleReset();

        mostrarToast(
          'success',
          'Formulário limpo.'
        );

        return;
      }

      if (e.altKey && e.key === '1') {
        e.preventDefault();

        if (infopenRef.current) {
          infopenRef.current.focus();
        }

        return;
      }

      if (e.altKey && e.key === '2') {
        e.preventDefault();

        if (cpfRef.current) {
          cpfRef.current.focus();
        }

        return;
      }

      if (e.altKey && e.key === '3') {
        e.preventDefault();

        if (tipoRef.current) {
          tipoRef.current.focus();
        }

        return;
      }

      if (!digitando && e.key === '?') {
        e.preventDefault();

        setMostrarAjuda((v) => !v);

        return;
      }

      if (e.key === 'Escape') {
        setMostrarAjuda(false);

        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [handleReset, mostrarToast]);

  /* ---------------------------------------------------------------- */
  /*  Dados derivados                                                  */
  /* ---------------------------------------------------------------- */

  const ocorrenciasHoje = useMemo(() => {
    const hoje = new Date().toDateString();

    return ocorrencias.filter(
      (o) =>
        o.criado_em && new Date(o.criado_em).toDateString() === hoje
    ).length;
  }, [ocorrencias]);

  const presoRelacionados = useMemo(
    () =>
      Array.from(
        new Map(
          presoHistorico
            .filter((item) => item.pessoaRelacionada && item.pessoaRelacionada !== form.preso_nome)
            .map((item) => [item.pessoaRelacionada, item])
        ).values()
      ).slice(0, 4),
    [form.preso_nome, presoHistorico]
  );

  const visitanteRelacionados = useMemo(
    () =>
      Array.from(
        new Map(
          visitanteHistorico
            .filter((item) => item.pessoaRelacionada && item.pessoaRelacionada !== form.visitante_nome)
            .map((item) => [item.pessoaRelacionada, item])
        ).values()
      ).slice(0, 4),
    [form.visitante_nome, visitanteHistorico]
  );

  const presoContextPreview = presoHistorico.find((item) => item.id === presoPreviewId) ?? presoHistorico[0] ?? null;
  const visitanteContextPreview = visitanteHistorico.find((item) => item.id === visitantePreviewId) ?? visitanteHistorico[0] ?? null;

  /* ================================================================ */
  /*  INTERFACE                                                         */
  /* ================================================================ */

  return (
    <div className="aletheia-shell">
      <style>{estilos}</style>

      {/* Sussurro visual */}
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="aletheia-frame">

        {/* CABEÇALHO */}
        <header className="aletheia-header">
          <div className="brand-zone">
            <div className="brand-symbol">
              <ShieldAlert size={21} strokeWidth={1.6} />
            </div>

            <div className="brand-copy">
              <div className="eyebrow">
                ALETHEIA
                <span />
                INTELIGÊNCIA
              </div>
              <h1>Registro de ocorrências</h1>
              <p>
                Correlação e lançamento de fatos relacionados à visitação
              </p>
            </div>
          </div>

          <div className="header-data">
            {/* NAVEGAÇÃO ENTRE FORMULÁRIO, LISTA E DASHBOARD */}
<div className="nav-toggle">
  <button
    type="button"
    onClick={() => setAbaAtiva('formulario')}
    className={`tab-btn ${abaAtiva === 'formulario' ? 'tab-btn-active' : ''}`}
  >
    Novo Registro
  </button>
  <button
    type="button"
    onClick={() => setAbaAtiva('lista')}
    className={`tab-btn ${abaAtiva === 'lista' ? 'tab-btn-active' : ''}`}
  >
    Ver Ocorrências
  </button>
  <button
    type="button"
    onClick={() => setAbaAtiva('pesquisa')}
    className={`tab-btn ${abaAtiva === 'pesquisa' ? 'tab-btn-active' : ''}`}
  >
    <Search size={13} style={{ display: 'inline', marginRight: '4px' }} />
    Pesquisa por Pessoa
  </button>
  <button
    type="button"
    onClick={() => setAbaAtiva('dashboard')}
    className={`tab-btn ${abaAtiva === 'dashboard' ? 'tab-btn-active' : ''}`}
  >
    <BarChart3 size={13} style={{ display: 'inline', marginRight: '4px' }} />
    Estatísticas
  </button>
</div>

            <div className="system-state">
              <span className="state-indicator" />
              <span>BASE OPERACIONAL</span>
            </div>

            <div className="header-divider" />

            <div className="today-stat">
              <strong>{ocorrenciasHoje}</strong>
              <span>REGISTROS<br />HOJE</span>
            </div>

            <button
              type="button"
              className="minimal-button"
              onClick={() => setMostrarAjuda(true)}
              title="Atalhos"
            >
              <Keyboard size={16} />
            </button>

            <button
              type="button"
              className="minimal-button"
              onClick={handleReset}
              title="Limpar"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </header>

        {/* EXIBIÇÃO CONDICIONAL DE CONTEÚDO */}
{abaAtiva === 'dashboard' ? (
  <div className="pt-6">
    <DashboardEstatisticas />
  </div>
) : abaAtiva === 'lista' ? (
  <div className="pt-6">
    <ListaOcorrencias />
  </div>
) : abaAtiva === 'pesquisa' ? (
  <div className="pt-6">
    <PesquisaIndividuos />
  </div>
) : (
  <>
            {/* LINHA DE IDENTIDADE */}
            <div className="module-line">
              <div className="module-line-left">
                <span className="module-index">M.03</span>
                <span className="module-name">OCORRÊNCIAS / VISITA</span>
              </div>

              <div className="module-line-center">
                <span />
                <Activity size={13} />
                <span />
              </div>

              <div className="module-line-right">REGISTRO DIRETO</div>
            </div>

            {/* CONTEÚDO */}
            <div className="content-grid">
              <form ref={formRef} onSubmit={handleSubmit} className="form-area">
                <div className="correlation-rail" />

                {/* 01 — DETENTO */}
                <section className="aletheia-section">
                  <div className="section-marker">
                    <span>01</span>
                  </div>

                  <div className="section-content">
                    <div className="section-heading">
                      <div>
                        <div className="section-kicker">ENTIDADE PRIMÁRIA</div>
                        <h2>
                          <Fingerprint size={16} />
                          Identificação do detento
                        </h2>
                      </div>
                      <Status status={presoStatus} />
                    </div>

                    <div className="fields-grid">
                      <Field label="INFOPEN" required className="field-small">
                        <div className="field-with-icon">
                          <input
                            ref={infopenRef}
                            type="text"
                            required
                            placeholder="000000"
                            value={form.preso_infopen}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                preso_infopen: e.target.value,
                              })
                            }
                            onBlur={handleBlurPreso}
                            className={`aletheia-input mono ${
                              erros.preso_infopen ? 'input-error' : ''
                            }`}
                          />
                          <Search size={14} />
                        </div>
                      </Field>

                      <Field label="Nome completo" required className="field-large">
                        <input
                          type="text"
                          required
                          placeholder="Nome do preso"
                          value={form.preso_nome}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              preso_nome: e.target.value,
                            })
                          }
                          className={`aletheia-input ${
                            erros.preso_nome ? 'input-error' : ''
                          }`}
                        />
                      </Field>

                      <Field label="Bloco no fato">
                        <input
                          type="text"
                          placeholder="Ex.: Bloco B"
                          value={form.bloco_no_fato}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              bloco_no_fato: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        />
                      </Field>

                      <Field label="Cela no fato">
                        <input
                          type="text"
                          placeholder="Ex.: Cela 08"
                          value={form.cela_no_fato}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              cela_no_fato: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        />
                      </Field>

                      <Field label="Sexo">
                        <select
                          value={form.preso_sexo}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              preso_sexo: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        >
                          <option value="Masculino">Masculino</option>
                          <option value="Feminino">Feminino</option>
                        </select>
                      </Field>
                    </div>

                    <div className="person-photo-row">
                      <Field label="Foto do preso" className="field-large">
                        <label className="photo-picker">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSelecionarFotoPreso}
                            hidden
                          />
                          {previewFotoPreso ? (
                            <img src={previewFotoPreso} alt={fotoPreso ? "Pré-visualização da nova foto do preso" : "Foto cadastrada do preso"} />
                          ) : (
                            <span className="photo-picker-empty">
                              <Camera size={15} />
                            </span>
                          )}
                          <span className="photo-picker-text">
                            <strong>{fotoPreso ? fotoPreso.name : 'Selecionar foto'}</strong>
                            <small>Opcional — vinculada ao cadastro do preso</small>
                          </span>
                        </label>
                      </Field>
                    </div>

                    {presoStatus === 'not_found' && (
                      <Notice
                        type="warning"
                        title="Entidade não localizada"
                        text="O INFOPEN informado não foi encontrado na base. Um novo cadastro será criado ao registrar a ocorrência."
                      />
                    )}

                    {presoStatus === 'found' && (
                      <CorrelationNotice>
                        <Database size={14} />
                        <span>Cadastro localizado e dados correlacionados à ocorrência.</span>
                        <ArrowRight size={13} />
                      </CorrelationNotice>
                    )}
                  </div>
                </section>

                {/* 02 — VISITANTE */}
                <section className="aletheia-section">
                  <div className="section-marker">
                    <span>02</span>
                  </div>

                  <div className="section-content">
                    <div className="section-heading">
                      <div>
                        <div className="section-kicker">ENTIDADE RELACIONADA</div>
                        <h2>
                          <UserPlus size={16} />
                          Identificação da visitante
                        </h2>
                      </div>
                      <Status status={visitanteStatus} />
                    </div>

                    <div className="fields-grid">
                      <Field label="CPF" className="field-small">
                        <div className="field-with-icon">
                          <input
                            ref={cpfRef}
                            type="text"
                            placeholder="000.000.000-00"
                            value={form.visitante_cpf}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                visitante_cpf: e.target.value,
                              })
                            }
                            onBlur={handleBlurVisitante}
                            className="aletheia-input mono"
                          />
                          <Search size={14} />
                        </div>
                      </Field>

                      <Field label="Nome completo" required className="field-large">
                        <input
                          type="text"
                          required
                          placeholder="Nome da visitante"
                          value={form.visitante_nome}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              visitante_nome: e.target.value,
                            })
                          }
                          className={`aletheia-input ${
                            erros.visitante_nome ? 'input-error' : ''
                          }`}
                        />
                      </Field>

                      <Field label="INFOPEN / carteira">
                        <input
                          type="text"
                          placeholder="Se houver"
                          value={form.visitante_infopen}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              visitante_infopen: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        />
                      </Field>

                      <Field label="Artigo enquadrado">
                        <input
                          type="text"
                          placeholder="Ex.: Art. 33"
                          value={form.visitante_artigos}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              visitante_artigos: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        />
                      </Field>

                      <label className="aletheia-check">
                        <input
                          type="checkbox"
                          checked={form.visitante_reincidente}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              visitante_reincidente: e.target.checked,
                            })
                          }
                        />
                        <span className="check-box" />
                        <span>Reincidente em ocorrências</span>
                      </label>

                      <Field label="Foto da visitante" className="field-large">
                        <label className="photo-picker">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSelecionarFotoVisitante}
                            hidden
                          />
                          {previewFotoVisitante ? (
                            <img src={previewFotoVisitante} alt={fotoVisitante ? "Pré-visualização da nova foto da visitante" : "Foto cadastrada da visitante"} />
                          ) : (
                            <span className="photo-picker-empty">
                              <Camera size={15} />
                            </span>
                          )}
                          <span className="photo-picker-text">
                            <strong>{fotoVisitante ? fotoVisitante.name : 'Selecionar foto'}</strong>
                            <small>Opcional — usada no detalhamento da ocorrência</small>
                          </span>
                        </label>
                      </Field>
                    </div>

                    {visitanteStatus === 'not_found' && (
                      <Notice
                        type="warning"
                        title="Visitante não localizada"
                        text="O CPF informado não foi encontrado na base. O cadastro será criado automaticamente ao registrar."
                      />
                    )}

                    {visitanteStatus === 'found' && (
                      <CorrelationNotice>
                        <Database size={14} />
                        <span>Cadastro localizado e dados correlacionados à ocorrência.</span>
                        <ArrowRight size={13} />
                      </CorrelationNotice>
                    )}
                  </div>
                </section>

                {/* 03 — OCORRÊNCIA */}
                <section className="aletheia-section">
                  <div className="section-marker active">
                    <span>03</span>
                  </div>

                  <div className="section-content">
                    <div className="section-heading">
                      <div>
                        <div className="section-kicker">EVENTO</div>
                        <h2>
                          <FilePlus size={16} />
                          Detalhes do fato
                        </h2>
                      </div>

                      <div className="event-indicator">
                        <span />
                        LANÇAMENTO
                      </div>
                    </div>

                    <div className="fields-grid">
                      <Field label="Data e hora do fato" required>
                        <input
                          type="datetime-local"
                          required
                          value={form.data_fato}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              data_fato: e.target.value,
                            })
                          }
                          className="aletheia-input mono"
                        />
                      </Field>

                      <Field label="Protocolo">
                        <input
                          type="text"
                          placeholder="123456/2026"
                          pattern="\d+/\d{4}"
                          title="Digite no formato número/ano (ex.: 123456/2026)"
                          value={form.protocolo}
                          onChange={(e) => setForm({ ...form, protocolo: e.target.value })}
                          className="aletheia-input mono"
                        />
                      </Field>

                      <Field label="Tipo de situação" required>
                        <select
                          ref={tipoRef}
                          value={form.tipo_situacao}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              tipo_situacao: e.target.value,
                            })
                          }
                          className="aletheia-input situation-input"
                        >
                          <option value="Flagrada">Flagrada (com apreensão)</option>
                          <option value="Suspeita">Suspeita / sob averiguação</option>
                          <option value="Apreensão Body Scanner">Apreensão via body scanner</option>
                          <option value="Tentativa de Entrada Indevida">Tentativa de entrada indevida</option>
                          <option value="Documentação Falsa">Documentação falsa / irregular</option>
                          <option value="Outros">Outros desvios</option>
                        </select>
                      </Field>

                      <Field label="Status da ocorrência">
                        <select
                          value={form.status_ocorrencia}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              status_ocorrencia: e.target.value,
                              ...(e.target.value === 'em_andamento' ? { justificativa_conclusao: '' } : {}),
                            })
                          }
                          className="aletheia-input aletheia-select"
                        >
                          <option value="em_andamento">Em andamento</option>
                          <option value="concluida">Concluída</option>
                        </select>
                      </Field>

                      <Field label="Item apreendido">
                        <input
                          type="text"
                          placeholder="Ex.: substância análoga a maconha"
                          value={form.item_apreendido}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              item_apreendido: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        />
                      </Field>

                      <Field label="Quantidade">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="Ex.: 50"
                          value={form.quantidade}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              quantidade: e.target.value,
                            })
                          }
                          className="aletheia-input"
                        />
                      </Field>

                      <Field label="Unidade de medida">
                        <select
                          value={form.unidade_medida}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              unidade_medida: e.target.value,
                            })
                          }
                          className="aletheia-input aletheia-select"
                        >
                          <option value="">Não informado</option>
                          {UNIDADES_MEDIDA.map((unidade) => (
                            <option key={unidade.value} value={unidade.value}>
                              {unidade.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div className="event-options">
                      <label className="aletheia-check">
                        <input
                          type="checkbox"
                          checked={form.possui_reds}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              possui_reds: e.target.checked,
                            })
                          }
                        />
                        <span className="check-box" />
                        <span>Possui REDS</span>
                      </label>

                      <label className="aletheia-check">
                        <input
                          type="checkbox"
                          checked={form.teve_prisao}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              teve_prisao: e.target.checked,
                            })
                          }
                        />
                        <span className="check-box" />
                        <span>Condução à DEPOL</span>
                      </label>

                      <input
                        type="text"
                        placeholder="Número do REDS"
                        value={form.numero_reds}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            numero_reds: e.target.value,
                          })
                        }
                        disabled={!form.possui_reds}
                        className="aletheia-input mono reds-input"
                      />
                    </div>

                    {form.status_ocorrencia === 'concluida' && (
                      <div className="history-field">
                        <label className="field-label">JUSTIFICATIVA DA CONCLUSÃO</label>
                        <textarea
                          rows={3}
                          placeholder="Descreva por que a ocorrência foi concluída..."
                          value={form.justificativa_conclusao}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              justificativa_conclusao: e.target.value,
                            })
                          }
                          className={`aletheia-input history-input ${erros.justificativa_conclusao ? 'input-error' : ''}`}
                        />
                      </div>
                    )}

                    <div className="history-field">
                      <label className="field-label">HISTÓRICO RESUMIDO</label>
                      <textarea
                        rows={3}
                        placeholder="Registre de forma objetiva os elementos essenciais do fato..."
                        value={form.historico_resumido}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            historico_resumido: e.target.value,
                          })
                        }
                        className="aletheia-input history-input"
                      />
                    </div>
                  </div>
                </section>

                {/* AÇÃO DE ENVIO */}
                <div className="submit-zone">
                  <div className="submit-info">
                    <div className="submit-mark">
                      <Activity size={15} />
                    </div>
                    <div>
                      <strong>Correlação pronta para registro</strong>
                      <span>
                        O lançamento atualiza as entidades relacionadas e preserva o histórico do fato.
                      </span>
                    </div>
                  </div>

                  <button type="submit" disabled={salvando} className="submit-button">
                    {salvando ? (
                      <>
                        <Loader2 size={15} className="spin" />
                        Registrando
                      </>
                    ) : (
                      <>
                        Registrar ocorrência
                        <Send size={15} />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="preview-stack" aria-label="Previews de pessoas">
                <aside className="entity-preview preview-panel preview-panel-top">
                  <div className="entity-preview-header">
                    <span className="section-kicker">PREVIEW</span>
                    <strong>Preso</strong>
                  </div>

                  {presoStatus === 'found' ? (
                    <>
                      <div className="entity-card">
                        <div className="entity-card-top">
                          {previewFotoPreso ? (
                            <img src={previewFotoPreso} alt="Foto do preso" className="entity-avatar" />
                          ) : (
                            <div className="entity-avatar entity-avatar-placeholder">
                              <Fingerprint size={17} />
                            </div>
                          )}

                          <div className="entity-identity">
                            <strong>{form.preso_nome || 'Preso não identificado'}</strong>
                            <span>{form.preso_infopen || 'INFOPEN não informado'}</span>
                          </div>
                        </div>

                        <div className="entity-meta-grid">
                          <div>
                            <small>Bloco</small>
                            <strong>{form.bloco_no_fato || '—'}</strong>
                          </div>
                          <div>
                            <small>Cela</small>
                            <strong>{form.cela_no_fato || '—'}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="entity-list-wrap">
                        <div className="entity-list-header">
                          <span>Ocorrências citando o preso</span>
                          <small>{presoHistorico.length}</small>
                        </div>

                        <div className="entity-list">
                          {presoHistorico.length > 0 ? (
                            presoHistorico.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`entity-item ${presoPreviewId === item.id ? 'entity-item-active' : ''}`}
                                onClick={() => setPresoPreviewId(item.id)}
                              >
                                <span>{item.pessoaRelacionada || 'Pessoa relacionada'}</span>
                                <small>{new Date(item.criado_em).toLocaleDateString('pt-BR')}</small>
                              </button>
                            ))
                          ) : (
                            <p className="entity-empty">Nenhuma ocorrência vinculada ao preso.</p>
                          )}
                        </div>

                        {presoRelacionados.length > 0 && (
                          <div className="related-cluster">
                            <span className="related-label">Relacionados</span>
                            <div className="related-pills">
                              {presoRelacionados.map((item) => (
                                <span key={item.id} className="related-pill">
                                  {item.pessoaRelacionada}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {presoContextPreview && (
                          <div className="entity-detail">
                            <div className="entity-detail-top">
                              <strong>{presoContextPreview.pessoaRelacionada}</strong>
                              <span>{presoContextPreview.tipo_situacao || 'Ocorrência'}</span>
                            </div>
                            <p>{presoContextPreview.historico_resumido || presoContextPreview.item_apreendido || 'Sem observação registrada nesta ocorrência.'}</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="entity-empty-card">
                      <Fingerprint size={16} />
                      <p>O preview do preso aparecerá aqui quando o INFOPEN for identificado.</p>
                    </div>
                  )}
                </aside>

                <aside className="entity-preview preview-panel">
                  <div className="entity-preview-header">
                    <span className="section-kicker">PREVIEW</span>
                    <strong>Visitante</strong>
                  </div>

                  {visitanteStatus === 'found' ? (
                    <>
                      <div className="entity-card">
                        <div className="entity-card-top">
                          {previewFotoVisitante ? (
                            <img src={previewFotoVisitante} alt="Foto da visitante" className="entity-avatar" />
                          ) : (
                            <div className="entity-avatar entity-avatar-placeholder">
                              <UserPlus size={17} />
                            </div>
                          )}

                          <div className="entity-identity">
                            <strong>{form.visitante_nome || 'Visitante não identificada'}</strong>
                            <span>{form.visitante_cpf || 'CPF não informado'}</span>
                          </div>
                        </div>

                        <div className="entity-meta-grid">
                          <div>
                            <small>Sexo</small>
                            <strong>{form.visitante_sexo || '—'}</strong>
                          </div>
                          <div>
                            <small>Reincidente</small>
                            <strong>{form.visitante_reincidente ? 'Sim' : 'Não'}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="entity-list-wrap">
                        <div className="entity-list-header">
                          <span>Ocorrências citando a visitante</span>
                          <small>{visitanteHistorico.length}</small>
                        </div>

                        <div className="entity-list">
                          {visitanteHistorico.length > 0 ? (
                            visitanteHistorico.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`entity-item ${visitantePreviewId === item.id ? 'entity-item-active' : ''}`}
                                onClick={() => setVisitantePreviewId(item.id)}
                              >
                                <span>{item.pessoaRelacionada || 'Pessoa relacionada'}</span>
                                <small>{new Date(item.criado_em).toLocaleDateString('pt-BR')}</small>
                              </button>
                            ))
                          ) : (
                            <p className="entity-empty">Nenhuma ocorrência vinculada à visitante.</p>
                          )}
                        </div>

                        {visitanteRelacionados.length > 0 && (
                          <div className="related-cluster">
                            <span className="related-label">Relacionados</span>
                            <div className="related-pills">
                              {visitanteRelacionados.map((item) => (
                                <span key={item.id} className="related-pill">
                                  {item.pessoaRelacionada}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {visitanteContextPreview && (
                          <div className="entity-detail">
                            <div className="entity-detail-top">
                              <strong>{visitanteContextPreview.pessoaRelacionada}</strong>
                              <span>{visitanteContextPreview.tipo_situacao || 'Ocorrência'}</span>
                            </div>
                            <p>{visitanteContextPreview.historico_resumido || visitanteContextPreview.item_apreendido || 'Sem observação registrada nesta ocorrência.'}</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="entity-empty-card">
                      <UserPlus size={16} />
                      <p>O preview da visitante aparecerá aqui quando o CPF for identificado.</p>
                    </div>
                  )}
                </aside>
              </div>
            </div>
          </>
        )}

        {/* RODAPÉ */}
        <footer className="aletheia-footer">
          <span>EX VERITATE PAX</span>
          <div className="footer-center">
            <span />
            ALETHEIA
            <span />
          </div>
          <span>REGISTRO / 03</span>
        </footer>

      </div>

      {/* TOAST DE NOTIFICAÇÃO */}
      {toast && (
        <div
          className={`aletheia-toast ${
            toast.tipo === 'success' ? 'toast-success' : 'toast-error'
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.tipo === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
          <span>{toast.mensagem}</span>
        </div>
      )}

      {/* PAINEL DE AJUDA */}
      {mostrarAjuda && (
        <div className="aletheia-overlay" onClick={() => setMostrarAjuda(false)}>
          <div className="help-panel" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <div>
                <span className="section-kicker">ALETHEIA</span>
                <h3>Atalhos de operação</h3>
              </div>
              <button
                type="button"
                className="minimal-button"
                onClick={() => setMostrarAjuda(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="shortcut-list">
              <Shortcut text="Registrar ocorrência" keys={[modKeyLabel, 'Enter']} />
              <Shortcut text="Limpar formulário" keys={[modKeyLabel, '⌫']} />
              <Shortcut text="Ir para INFOPEN" keys={['Alt', '1']} />
              <Shortcut text="Ir para CPF" keys={['Alt', '2']} />
              <Shortcut text="Ir para classificação" keys={['Alt', '3']} />
              <Shortcut text="Abrir ajuda" keys={['?']} />
              <Shortcut text="Fechar" keys={['Esc']} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  COMPONENTES AUXILIARES                                             */
/* ================================================================== */

function Field({
  label,
  required = false,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className}`}>
      <label className="field-label">
        {label}
        {required && <span className="required-mark">*</span>}
      </label>
      {children}
    </div>
  );
}

function Status({ status }: { status?: 'idle' | 'checking' | 'found' | 'not_found' }) {
  if (status === 'checking') {
    return (
      <div className="status checking">
        <Loader2 size={12} className="spin" />
        VERIFICANDO
      </div>
    );
  }

  if (status === 'found') {
    return (
      <div className="status found">
        <UserCheck size={12} />
        LOCALIZADO
      </div>
    );
  }

  return null;
}

function Notice({ title, text, type = 'warning' }: { title: string; text: string; type?: 'warning' | 'info' }) {
  return (
    <div className={`aletheia-notice ${type}`}>
      <AlertTriangle size={14} />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function CorrelationNotice({ children }: { children: React.ReactNode }) {
  return <div className="correlation-notice">{children}</div>;
}

function Shortcut({ text, keys }: { text: string; keys: string[] }) {
  return (
    <div className="shortcut-row">
      <span>{text}</span>
      <div>
        {keys.map((key, index) => (
          <React.Fragment key={`${text}-${key}-${index}`}>
            {index > 0 && <small>+</small>}
            <kbd>{key}</kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ESTILOS — ALETHEIA                                                  */
/* ================================================================== */

const estilos = `
:root{
  --a-bg:#f4f5f4;
  --a-surface:#fafbfa;
  --a-surface-2:#eef0ef;
  --a-line:#dfe3e1;
  --a-line-dark:#cbd0cd;
  --a-text:#202522;
  --a-text-soft:#59615c;
  --a-text-faint:#8a928d;
  --a-red:#a72d31;
  --a-red-dark:#862427;
  --a-red-soft:rgba(167,45,49,.075);
  --a-green:#4e6f5a;
  --a-green-soft:rgba(78,111,90,.09);
  --a-shadow:0 18px 50px rgba(30,38,33,.055);
}

*{ box-sizing:border-box; }

html, body{
  margin:0;
  padding:0;
  min-height:100%;
}

body{ background:var(--a-bg); }

button, input, textarea, select{ font:inherit; }
button{ -webkit-tap-highlight-color:transparent; }

::selection{
  background:rgba(167,45,49,.16);
  color:var(--a-text);
}

.aletheia-shell{
  min-height:100vh;
  position:relative;
  overflow-x:hidden;
  background:
    radial-gradient(circle at 82% 7%, rgba(167,45,49,.035), transparent 28%),
    radial-gradient(circle at 12% 90%, rgba(70,90,80,.035), transparent 32%),
    var(--a-bg);
  color:var(--a-text);
  font-family:'Inter', ui-sans-serif, system-ui, sans-serif;
}

.ambient{
  position:fixed;
  pointer-events:none;
  z-index:0;
  border-radius:50%;
  filter:blur(60px);
  opacity:.28;
}

.ambient-one{
  width:260px;
  height:260px;
  top:-120px;
  right:12%;
  background:rgba(167,45,49,.035);
}

.ambient-two{
  width:320px;
  height:320px;
  bottom:-180px;
  left:-120px;
  background:rgba(50,70,60,.035);
}

.aletheia-frame{
  position:relative;
  z-index:1;
  width:min(1420px,100%);
  margin:0 auto;
  padding:26px 32px 20px;
}

.aletheia-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:30px;
  padding-bottom:20px;
  border-bottom:1px solid var(--a-line);
}

.brand-zone{
  display:flex;
  align-items:center;
  gap:15px;
}

.brand-symbol{
  width:43px;
  height:43px;
  display:flex;
  align-items:center;
  justify-content:center;
  color:var(--a-red);
  border:1px solid rgba(167,45,49,.22);
  background:linear-gradient(145deg, rgba(167,45,49,.055), rgba(167,45,49,.015));
  position:relative;
}

.brand-symbol:after{
  content:"";
  position:absolute;
  width:5px;
  height:5px;
  right:-3px;
  bottom:-3px;
  background:var(--a-red);
}

.brand-copy{
  display:flex;
  flex-direction:column;
}

.eyebrow{
  display:flex;
  align-items:center;
  gap:7px;
  font-family:'IBM Plex Mono', monospace;
  font-size:9px;
  font-weight:600;
  letter-spacing:.15em;
  color:var(--a-red);
  margin-bottom:3px;
}

.eyebrow span{
  display:block;
  width:18px;
  height:1px;
  background:var(--a-line-dark);
}

.brand-copy h1{
  margin:0;
  font-size:19px;
  line-height:1.25;
  font-weight:600;
  letter-spacing:-.025em;
}

.brand-copy p{
  margin:3px 0 0;
  font-size:11px;
  color:var(--a-text-soft);
}

.header-data{
  display:flex;
  align-items:center;
  gap:14px;
}

.nav-toggle{
  display:flex;
  gap:4px;
  background:var(--a-surface-2);
  padding:3px;
  border:1px solid var(--a-line);
}

.tab-btn{
  background:transparent;
  border:0;
  padding:5px 12px;
  font-size:11px;
  font-weight:500;
  color:var(--a-text-soft);
  cursor:pointer;
  transition:all .18s ease;
}

.tab-btn-active{
  background:white;
  color:var(--a-red);
  font-weight:600;
  box-shadow:0 1px 3px rgba(0,0,0,.08);
}

.system-state{
  display:flex;
  align-items:center;
  gap:7px;
  font-family:'IBM Plex Mono', monospace;
  font-size:9px;
  letter-spacing:.08em;
  color:var(--a-text-faint);
}

.state-indicator{
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--a-green);
  box-shadow:0 0 0 3px var(--a-green-soft);
}

.header-divider{
  width:1px;
  height:28px;
  background:var(--a-line);
}

.today-stat{
  display:flex;
  align-items:center;
  gap:7px;
}

.today-stat strong{
  font-family:'IBM Plex Mono', monospace;
  font-size:18px;
  font-weight:500;
  color:var(--a-text);
}

.today-stat span{
  font-family:'IBM Plex Mono', monospace;
  font-size:7px;
  line-height:1.4;
  letter-spacing:.09em;
  color:var(--a-text-faint);
}

.minimal-button{
  width:32px;
  height:32px;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--a-line);
  background:transparent;
  color:var(--a-text-soft);
  cursor:pointer;
  transition:border-color .18s ease, color .18s ease, background .18s ease;
}

.minimal-button:hover{
  color:var(--a-red);
  border-color:rgba(167,45,49,.3);
  background:var(--a-red-soft);
}

.module-line{
  height:34px;
  display:grid;
  grid-template-columns:1fr auto 1fr;
  align-items:center;
  border-bottom:1px solid var(--a-line);
  color:var(--a-text-faint);
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  letter-spacing:.12em;
}

.module-line-left, .module-line-right{
  display:flex;
  align-items:center;
  gap:10px;
}

.module-line-right{ justify-content:flex-end; }
.module-index{ color:var(--a-red); }

.module-line-center{
  display:flex;
  align-items:center;
  gap:7px;
  color:var(--a-line-dark);
}

.module-line-center span{
  width:38px;
  height:1px;
  background:var(--a-line);
}

.content-grid{
  display:grid;
  grid-template-columns:minmax(0,1fr) 300px;
  gap:22px;
  padding-top:28px;
  align-items:start;
}

.preview-stack{
  display:flex;
  flex-direction:column;
  gap:16px;
  max-height:calc(100vh - 260px);
  min-height:620px;
  padding-right:6px;
}

.preview-panel{
  display:flex;
  flex-direction:column;
  gap:12px;
  padding-top:12px;
  min-height:280px;
  height:calc(50% - 8px);
  max-height:48vh;
  overflow:hidden;
}

.preview-panel-top{ min-height:290px; }

.preview-spacer{
  width:100%;
  min-height:1px;
}

.form-area{ position:relative; }

.entity-preview{
  display:flex;
  flex-direction:column;
  gap:12px;
  padding-top:16px;
}

.entity-preview-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding-bottom:8px;
  border-bottom:1px solid var(--a-line);
}

.entity-preview-header strong{
  font-size:12px;
  color:var(--a-text);
}

.entity-card,
.entity-list-wrap,
.entity-empty-card{
  background:rgba(255,255,255,.38);
  border:1px solid var(--a-line);
  padding:12px;
}

.entity-card-top{
  display:flex;
  align-items:center;
  gap:10px;
  margin-bottom:12px;
}

.entity-avatar{
  width:44px;
  height:44px;
  border-radius:50%;
  object-fit:cover;
  border:1px solid var(--a-line);
  background:var(--a-surface-2);
}

.entity-avatar-placeholder{
  display:flex;
  align-items:center;
  justify-content:center;
  color:var(--a-red);
}

.entity-identity{
  display:flex;
  flex-direction:column;
  gap:3px;
  min-width:0;
}

.entity-identity strong{
  font-size:12px;
  line-height:1.3;
  color:var(--a-text);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.entity-identity span{
  font-size:9.5px;
  color:var(--a-text-faint);
  font-family:'IBM Plex Mono', monospace;
}

.entity-meta-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px;
}

.entity-meta-grid div{
  display:flex;
  flex-direction:column;
  gap:3px;
}

.entity-meta-grid small,
.entity-list-header small,
.entity-item small,
.entity-detail-top span{
  font-family:'IBM Plex Mono', monospace;
  letter-spacing:.05em;
}

.entity-meta-grid small,
.entity-list-header small{
  font-size:7.5px;
  color:var(--a-text-faint);
}

.entity-meta-grid strong{
  font-size:10px;
  color:var(--a-text-soft);
}

.entity-list-wrap{
  display:flex;
  flex-direction:column;
  gap:9px;
  min-height:0;
  overflow:hidden;
}

.entity-list-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  color:var(--a-text-soft);
  font-size:8px;
  text-transform:uppercase;
  letter-spacing:.08em;
}

.entity-list{
  display:flex;
  flex-direction:column;
  gap:6px;
  overflow-y:auto;
  max-height:180px;
  padding-right:4px;
}

.entity-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  width:100%;
  padding:7px 8px;
  border:1px solid var(--a-line);
  background:rgba(255,255,255,.35);
  color:var(--a-text-soft);
  cursor:pointer;
  text-align:left;
  font-size:10px;
}

.entity-item:hover{
  border-color:rgba(167,45,49,.35);
  background:var(--a-red-soft);
}

.entity-item-active{
  border-color:rgba(167,45,49,.4);
  background:var(--a-red-soft);
}

.entity-item span{
  font-size:10px;
  line-height:1.3;
  font-weight:600;
}

.entity-item small{
  font-size:6.8px;
  color:var(--a-text-faint);
}

.entity-detail{
  border-top:1px solid var(--a-line);
  padding-top:9px;
}

.entity-detail-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:5px;
}

.entity-detail-top strong{
  font-size:9.5px;
  color:var(--a-text);
}

.entity-detail-top span{
  font-size:6.5px;
  color:var(--a-red);
}

.related-cluster{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding-top:6px;
  border-top:1px solid var(--a-line);
}

.related-label{
  font-size:7px;
  letter-spacing:.08em;
  text-transform:uppercase;
  color:var(--a-text-faint);
  font-family:'IBM Plex Mono', monospace;
}

.related-pills{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}

.related-pill{
  display:inline-flex;
  align-items:center;
  padding:4px 7px;
  border:1px solid rgba(167,45,49,.16);
  background:var(--a-red-soft);
  color:var(--a-red-dark);
  font-size:7.5px;
  line-height:1.2;
  border-radius:999px;
}

.entity-detail p,
.entity-empty,
.entity-empty-card p{
  margin:0;
  color:var(--a-text-soft);
  font-size:10px;
  line-height:1.5;
}

.entity-empty-card{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  gap:8px;
  color:var(--a-text-soft);
}

.entity-empty-card svg{ color:var(--a-red); }

.correlation-rail{
  position:absolute;
  left:11px;
  top:21px;
  bottom:125px;
  width:1px;
  background:linear-gradient(to bottom, var(--a-line-dark), var(--a-line), transparent);
}

.aletheia-section{
  position:relative;
  display:grid;
  grid-template-columns:42px minmax(0,1fr);
  margin-bottom:20px;
}

.section-marker{
  position:relative;
  display:flex;
  justify-content:flex-start;
  padding-top:2px;
}

.section-marker span{
  position:relative;
  z-index:2;
  width:23px;
  height:23px;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--a-line-dark);
  background:var(--a-bg);
  color:var(--a-text-faint);
  font-family:'IBM Plex Mono', monospace;
  font-size:9px;
  transition:color .18s ease, border-color .18s ease;
}

.section-marker.active span{
  color:var(--a-red);
  border-color:rgba(167,45,49,.38);
  background:var(--a-red-soft);
}

.section-content{
  min-width:0;
  border-bottom:1px solid var(--a-line);
  padding:0 0 22px;
}

.section-heading{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:20px;
  margin-bottom:18px;
}

.section-kicker{
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  font-weight:500;
  letter-spacing:.15em;
  color:var(--a-text-faint);
  margin-bottom:4px;
}

.section-heading h2{
  margin:0;
  display:flex;
  align-items:center;
  gap:8px;
  font-size:14px;
  font-weight:600;
  letter-spacing:-.01em;
}

.section-heading h2 svg{ color:var(--a-red); }

.status{
  display:flex;
  align-items:center;
  gap:5px;
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  letter-spacing:.08em;
  padding-top:7px;
}

.status.checking{ color:var(--a-text-faint); }
.status.found{ color:var(--a-green); }

.fields-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:15px 18px;
}

.field-small{ grid-column:span 1; }
.field-large{ grid-column:span 2; }

.field-label{
  display:block;
  margin-bottom:6px;
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  font-weight:500;
  letter-spacing:.09em;
  text-transform:uppercase;
  color:var(--a-text-faint);
}

.required-mark{
  color:var(--a-red);
  margin-left:3px;
}

.field-with-icon{ position:relative; }

.field-with-icon svg{
  position:absolute;
  right:10px;
  top:50%;
  transform:translateY(-50%);
  color:var(--a-text-faint);
  pointer-events:none;
}

.aletheia-input{
  width:100%;
  height:36px;
  border:1px solid var(--a-line);
  border-radius:0;
  background:rgba(255,255,255,.42);
  color:var(--a-text);
  padding:8px 10px;
  font-size:12px;
  outline:none;
  transition:border-color .18s ease, background .18s ease, box-shadow .18s ease;
}

.aletheia-input::placeholder{ color:#a4aaa6; }
.aletheia-input:hover{ border-color:var(--a-line-dark); }

.aletheia-input:focus{
  border-color:rgba(167,45,49,.55);
  background:rgba(255,255,255,.72);
  box-shadow:0 0 0 2px rgba(167,45,49,.055);
}

.aletheia-input:disabled{
  background:rgba(230,233,231,.45);
  color:var(--a-text-faint);
  cursor:not-allowed;
}

.input-error{
  border-color:rgba(167,45,49,.7)!important;
  background:rgba(167,45,49,.025)!important;
}

.mono{
  font-family:'IBM Plex Mono', monospace!important;
  font-size:11px!important;
}

.situation-input{
  color:var(--a-red);
  font-weight:500;
}

textarea.aletheia-input{
  height:auto;
  min-height:75px;
  resize:vertical;
  line-height:1.55;
}

select.aletheia-input{ cursor:pointer; }

.aletheia-check{
  display:flex;
  align-items:center;
  gap:8px;
  min-height:36px;
  cursor:pointer;
  color:var(--a-text-soft);
  font-size:11px;
  user-select:none;
}

.aletheia-check input{
  position:absolute;
  opacity:0;
  pointer-events:none;
}

.check-box{
  width:14px;
  height:14px;
  border:1px solid var(--a-line-dark);
  background:rgba(255,255,255,.35);
  position:relative;
  transition:border-color .15s ease, background .15s ease;
}

.aletheia-check input:checked + .check-box{
  background:var(--a-red);
  border-color:var(--a-red);
}

.aletheia-check input:checked + .check-box:after{
  content:"";
  position:absolute;
  width:6px;
  height:3px;
  left:3px;
  top:4px;
  border-left:1.5px solid white;
  border-bottom:1.5px solid white;
  transform:rotate(-45deg);
}

.person-photo-row{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:15px 18px;
  margin-top:15px;
}
.aletheia-select{
  appearance:auto;
  cursor:pointer;
}
.photo-picker{
  display:flex;
  align-items:center;
  gap:12px;
  height:52px;
  padding:0 12px;
  border:1px dashed var(--a-line-dark);
  background:rgba(255,255,255,.35);
  cursor:pointer;
  transition:border-color .18s ease, background .18s ease;
}
.photo-picker:hover{
  border-color:rgba(167,45,49,.4);
  background:var(--a-red-soft);
}

.photo-picker:has(img){
  border-style:solid;
}
.photo-picker img{
  width:36px;
  height:36px;
  object-fit:cover;
  border:1px solid var(--a-line);
  flex-shrink:0;
}
.photo-picker-empty{
  width:36px;
  height:36px;
  flex-shrink:0;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--a-line);
  color:var(--a-text-faint);
  background:var(--a-surface-2);
}
.photo-picker-text{ display:flex; flex-direction:column; gap:2px; min-width:0; }
.photo-picker-text strong{
  font-size:11.5px;
  font-weight:500;
  color:var(--a-text);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.photo-picker-text small{
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  letter-spacing:.05em;
  color:var(--a-text-faint);
}

.aletheia-notice{
  display:flex;
  align-items:flex-start;
  gap:10px;
  margin-top:15px;
  padding:10px 12px;
  border-left:2px solid var(--a-red);
  background:var(--a-red-soft);
  color:var(--a-text-soft);
}

.aletheia-notice > svg{
  flex-shrink:0;
  color:var(--a-red);
  margin-top:1px;
}

.aletheia-notice div{
  display:flex;
  flex-direction:column;
  gap:2px;
}

.aletheia-notice strong{
  font-size:10px;
  font-weight:600;
  color:var(--a-red-dark);
}

.aletheia-notice span{
  font-size:10.5px;
  line-height:1.45;
  color:var(--a-text-soft);
}

.correlation-notice{
  display:flex;
  align-items:center;
  gap:7px;
  margin-top:14px;
  padding-top:11px;
  border-top:1px solid var(--a-line);
  color:var(--a-green);
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  letter-spacing:.06em;
}

.context-panel{
  margin-top:14px;
  padding:10px 12px 0;
  border-top:1px solid var(--a-line);
}

.context-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:8px;
}

.context-header strong{
  font-size:10px;
  color:var(--a-text-soft);
}

.context-list{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}

.context-pill{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  gap:2px;
  padding:7px 8px;
  border:1px solid var(--a-line);
  background:rgba(255,255,255,.28);
  color:var(--a-text-soft);
  cursor:pointer;
  text-align:left;
  transition:border-color .18s ease, background .18s ease, transform .12s ease;
}

.context-pill:hover{
  border-color:rgba(167,45,49,.38);
  background:var(--a-red-soft);
}

.context-pill-active{
  border-color:rgba(167,45,49,.45);
  background:var(--a-red-soft);
}

.context-pill span{
  font-size:10px;
  font-weight:600;
  line-height:1.2;
}

.context-pill small{
  font-family:'IBM Plex Mono', monospace;
  font-size:7px;
  letter-spacing:.05em;
  color:var(--a-text-faint);
}

.context-preview{
  margin-top:10px;
  padding:10px 11px;
  border:1px solid var(--a-line);
  background:rgba(248,249,248,.82);
}

.context-preview-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:5px;
}

.context-preview-header strong{
  font-size:10px;
  color:var(--a-text);
}

.context-preview-header span{
  font-family:'IBM Plex Mono', monospace;
  font-size:7px;
  letter-spacing:.06em;
  color:var(--a-red);
}

.context-preview p{
  margin:0;
  color:var(--a-text-soft);
  font-size:9.5px;
  line-height:1.5;
}

.correlation-notice svg:last-child{
  margin-left:auto;
  color:var(--a-text-faint);
}

.event-indicator{
  display:flex;
  align-items:center;
  gap:6px;
  padding-top:7px;
  color:var(--a-red);
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
  letter-spacing:.09em;
}

.event-indicator span{
  width:5px;
  height:5px;
  border-radius:50%;
  background:var(--a-red);
  box-shadow:0 0 0 3px var(--a-red-soft);
}

.event-options{
  display:grid;
  grid-template-columns:auto auto minmax(170px,240px);
  align-items:center;
  gap:20px;
  margin-top:17px;
  padding-top:14px;
  border-top:1px solid var(--a-line);
}

.reds-input{ height:34px; }
.history-field{ margin-top:17px; }

.submit-zone{
  margin-left:42px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  padding:16px 0;
  border-top:1px solid var(--a-line);
}

.submit-info{
  display:flex;
  align-items:center;
  gap:10px;
}

.submit-mark{
  width:30px;
  height:30px;
  display:flex;
  align-items:center;
  justify-content:center;
  color:var(--a-red);
  border:1px solid rgba(167,45,49,.2);
  background:var(--a-red-soft);
}

.submit-info div:last-child{
  display:flex;
  flex-direction:column;
  gap:2px;
}

.submit-info strong{
  font-size:10px;
  font-weight:600;
}

.submit-info span{
  font-size:9.5px;
  color:var(--a-text-faint);
}

.submit-button{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:9px;
  min-width:190px;
  height:39px;
  padding:0 16px;
  border:1px solid var(--a-red);
  background:var(--a-red);
  color:white;
  font-size:11px;
  font-weight:600;
  letter-spacing:.01em;
  cursor:pointer;
  transition:background .18s ease, border-color .18s ease, transform .12s ease;
}

.submit-button:hover:not(:disabled){
  background:var(--a-red-dark);
  border-color:var(--a-red-dark);
}

.submit-button:active:not(:disabled){ transform:translateY(1px); }
.submit-button:disabled{ opacity:.55; cursor:not-allowed; }

.aletheia-footer{
  display:grid;
  grid-template-columns:1fr auto 1fr;
  align-items:center;
  padding-top:22px;
  color:var(--a-text-faint);
  font-family:'IBM Plex Mono', monospace;
  font-size:7px;
  letter-spacing:.14em;
}

.aletheia-footer > span:last-child{ text-align:right; }

.footer-center{
  display:flex;
  align-items:center;
  gap:8px;
  color:var(--a-red);
}

.footer-center span{
  width:22px;
  height:1px;
  background:var(--a-line-dark);
}

.aletheia-toast{
  position:fixed;
  left:50%;
  bottom:22px;
  transform:translateX(-50%);
  z-index:100;
  display:flex;
  align-items:center;
  gap:9px;
  min-width:280px;
  max-width:min(500px,calc(100vw - 30px));
  padding:11px 15px;
  border:1px solid var(--a-line-dark);
  background:rgba(250,251,250,.96);
  box-shadow:0 15px 45px rgba(20,28,23,.13);
  font-size:11px;
}

.toast-success{ color:var(--a-green); }
.toast-error{ color:var(--a-red); }

.aletheia-overlay{
  position:fixed;
  inset:0;
  z-index:90;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  background:rgba(235,238,236,.76);
  backdrop-filter:blur(5px);
}

.help-panel{
  width:100%;
  max-width:430px;
  background:var(--a-surface);
  border:1px solid var(--a-line-dark);
  box-shadow:var(--a-shadow);
  padding:22px;
}

.help-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  padding-bottom:15px;
  border-bottom:1px solid var(--a-line);
}

.help-header h3{ margin:0; font-size:14px; font-weight:600; }
.shortcut-list{ padding-top:5px; }

.shortcut-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:15px;
  padding:11px 0;
  border-bottom:1px solid var(--a-line);
  font-size:10.5px;
  color:var(--a-text-soft);
}

.shortcut-row > div{
  display:flex;
  align-items:center;
  gap:4px;
}

.shortcut-row small{ color:var(--a-text-faint); }

.shortcut-row kbd{
  min-width:25px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:3px 6px;
  border:1px solid var(--a-line-dark);
  background:var(--a-bg);
  color:var(--a-text);
  font-family:'IBM Plex Mono', monospace;
  font-size:8px;
}

.spin{ animation:spin .85s linear infinite; }

@keyframes spin{
  to{ transform:rotate(360deg); }
}

@media(max-width:1050px){
  .content-grid{ grid-template-columns:220px minmax(0,1fr) 220px; gap:18px; }
  .fields-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .field-large{ grid-column:span 1; }
  .event-options{ grid-template-columns:auto auto minmax(150px,1fr); }
}

@media(max-width:850px){
  .aletheia-frame{ padding:20px 20px 16px; }
  .header-data .system-state, .header-divider{ display:none; }
  .content-grid{ grid-template-columns:1fr; }
  .entity-preview{ padding-top:0; }
}

@media(max-width:620px){
  .aletheia-header{ align-items:flex-start; flex-direction:column; }
  .brand-copy h1{ font-size:16px; }
  .brand-copy p{ max-width:230px; }
  .today-stat{ display:none; }
  .module-line{ grid-template-columns:1fr auto; }
  .module-line-center{ display:none; }
 .content-grid{ padding-top:20px; }
  .aletheia-section{ grid-template-columns:34px minmax(0,1fr); }
  .fields-grid{ grid-template-columns:1fr; }
  .field-large{ grid-column:span 1; }
  .event-options{ grid-template-columns:1fr; gap:5px; }
  .submit-zone{ margin-left:34px; align-items:stretch; flex-direction:column; }
  .submit-button{ width:100%; }
  .aletheia-footer{ grid-template-columns:1fr auto; }
  .aletheia-footer .footer-center{ display:none; }
}

@media(max-width:420px){
  .aletheia-frame{ padding:15px 13px 12px; }
  .brand-symbol{ width:37px; height:37px; }
  .brand-copy h1{ font-size:14px; }
  .brand-copy p{ font-size:9.5px; }
  .header-data{ gap:5px; width:100%; justify-content:space-between; }
  .minimal-button{ width:29px; height:29px; }
  .section-heading{ flex-direction:column; gap:5px; }
  .status, .event-indicator{ padding-top:0; }
}
`;