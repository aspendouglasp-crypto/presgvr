import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Calendar, ShieldAlert, Users,
  MapPin, AlertOctagon, TrendingUp, Filter,
} from 'lucide-react';

/* Paleta derivada dos dois tons de acento do sistema (oxblood + sálvia),
   sem cores estranhas ao restante do painel. */
const CORES = ['#a72d31', '#4e6f5a', '#862427', '#2f4a3d', '#8a928d', '#59615c'];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function DashboardEstatisticas() {
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear().toString());

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ocorrencias_visita')
        .select(`
          *,
          visitantes ( * )
        `);

      if (error) throw error;
      setDados(data || []);
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  /* Anos disponíveis a partir dos próprios dados — nunca fica preso a uma
     lista fixa que envelhece sozinha. */
  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    const anos = new Set<string>([anoAtual.toString()]);
    dados.forEach((d) => {
      if (d.data_fato) anos.add(new Date(d.data_fato).getFullYear().toString());
    });
    return Array.from(anos).sort((a, b) => Number(b) - Number(a));
  }, [dados]);

  const dadosDoAno = useMemo(
    () => dados.filter((d) => d.data_fato && new Date(d.data_fato).getFullYear().toString() === filtroAno),
    [dados, filtroAno]
  );

  const porMes = useMemo(() => {
    const contagem = MESES.map((mes) => ({ mes, total: 0, flagrantes: 0 }));
    dadosDoAno.forEach((d) => {
      const m = new Date(d.data_fato).getMonth();
      contagem[m].total += 1;
      if (d.tipo_situacao === 'Flagrada') contagem[m].flagrantes += 1;
    });
    return contagem;
  }, [dadosDoAno]);

  const porBloco = useMemo(() => {
    const mapa: Record<string, number> = {};
    dadosDoAno.forEach((d) => {
      const bloco = d.bloco_no_fato || 'Não informado';
      mapa[bloco] = (mapa[bloco] || 0) + 1;
    });
    return Object.keys(mapa)
      .map((key) => ({ bloco: key, total: mapa[key] }))
      .sort((a, b) => b.total - a.total);
  }, [dadosDoAno]);

  const porTipo = useMemo(() => {
    const mapa: Record<string, number> = {};
    dadosDoAno.forEach((d) => {
      const tipo = d.tipo_situacao || 'Outros';
      mapa[tipo] = (mapa[tipo] || 0) + 1;
    });
    return Object.keys(mapa).map((key) => ({ name: key, value: mapa[key] }));
  }, [dadosDoAno]);

  const celasCriticas = useMemo(() => {
    const mapa: Record<string, number> = {};
    dadosDoAno.forEach((d) => {
      if (d.bloco_no_fato && d.cela_no_fato) {
        const chave = `${d.bloco_no_fato} - ${d.cela_no_fato}`;
        mapa[chave] = (mapa[chave] || 0) + 1;
      }
    });
    return Object.keys(mapa)
      .map((key) => ({ cela: key, total: mapa[key] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [dadosDoAno]);

  const maiorCela = celasCriticas[0]?.total || 1;

  /* ---------------------------------------------------------------
     Novos indicadores:
     - sexo dos visitantes envolvidos;
     - presos que mais aparecem;
     - visitantes que mais aparecem.

     Os dados são lidos de forma tolerante porque a estrutura de
     visitantes pode ter nomes de campos diferentes entre ambientes.
  ---------------------------------------------------------------- */
  const obterVisitante = (d: any) => {
    if (!d?.visitantes) return {};
    return Array.isArray(d.visitantes) ? (d.visitantes[0] || {}) : d.visitantes;
  };

  const primeiroCampo = (obj: any, campos: string[]) => {
    for (const campo of campos) {
      const valor = obj?.[campo];
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        return String(valor).trim();
      }
    }
    return null;
  };

  const normalizarSexo = (valor: string | null) => {
    if (!valor) return 'Não informado';
    const v = valor.toLowerCase().trim();
    if (['m', 'masculino', 'homem'].includes(v)) return 'Homem';
    if (['f', 'feminino', 'mulher'].includes(v)) return 'Mulher';
    return 'Não informado';
  };

  const sexoVisitantes = useMemo(() => {
    const mapa: Record<string, number> = {
      Homem: 0,
      Mulher: 0,
      'Não informado': 0,
    };

    dadosDoAno.forEach((d) => {
      const visitante = obterVisitante(d);
      const sexo = normalizarSexo(
        primeiroCampo(visitante, ['sexo', 'genero', 'genero_sexual', 'sexo_visitante'])
      );
      mapa[sexo] += 1;
    });

    return Object.keys(mapa)
      .map((name) => ({ name, value: mapa[name] }))
      .filter((item) => item.value > 0);
  }, [dadosDoAno]);

  const rankingVisitantes = useMemo(() => {
    const mapa: Record<string, number> = {};

    dadosDoAno.forEach((d) => {
      const visitante = obterVisitante(d);
      const nome = primeiroCampo(visitante, [
        'nome',
        'nome_completo',
        'nome_visitante',
        'nome_visitantes',
      ]) || 'Visitante não identificado';

      mapa[nome] = (mapa[nome] || 0) + 1;
    });

    return Object.keys(mapa)
      .map((nome) => ({ nome, total: mapa[nome] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [dadosDoAno]);

  const rankingPresos = useMemo(() => {
    const mapa: Record<string, number> = {};

    dadosDoAno.forEach((d) => {
      const nome = primeiroCampo(d, [
        'nome_preso',
        'preso_nome',
        'nome_custodiado',
        'custodiado_nome',
        'nome_interno',
        'interno_nome',
        'preso',
        'custodiado',
        'interno',
      ]) || 'Preso não identificado';

      mapa[nome] = (mapa[nome] || 0) + 1;
    });

    return Object.keys(mapa)
      .map((nome) => ({ nome, total: mapa[nome] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [dadosDoAno]);

  const maiorVisitante = rankingVisitantes[0]?.total || 1;
  const maiorPreso = rankingPresos[0]?.total || 1;

  return (
    <div className="dash-root">
      <style>{estilosDash}</style>

      <div className="dash-filter dash-year-only">
        <Filter size={12} />
        <select
          value={filtroAno}
          onChange={(e) => setFiltroAno(e.target.value)}
          className="dash-select"
        >
          {anosDisponiveis.map((ano) => (
            <option key={ano} value={ano}>Ano {ano}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <DashSkeleton />
      ) : dadosDoAno.length === 0 ? (
        <div className="aletheia-notice dash-notice-block">
          <AlertOctagon size={15} />
          <div>
            <strong>Sem registros para {filtroAno}</strong>
            <span>Assim que novas ocorrências forem lançadas nesse ano, os indicadores aparecem aqui.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="dash-kpis">
            <CardKpi
              titulo="TOTAL REGISTRADO"
              valor={dadosDoAno.length}
              icon={<ShieldAlert size={16} />}
              tom="red"
            />
            <CardKpi
              titulo="COM REDS GERADO"
              valor={dadosDoAno.filter((d) => d.possui_reds).length}
              icon={<TrendingUp size={16} />}
              tom="neutral"
            />
            <CardKpi
              titulo="CONDUÇÕES À DEPOL"
              valor={dadosDoAno.filter((d) => d.teve_prisao).length}
              icon={<AlertOctagon size={16} />}
              tom="red"
            />
            <CardKpi
              titulo="REINCIDÊNCIA DE VISITANTES"
              valor={dadosDoAno.filter((d) => d.visitantes?.reincidente).length}
              icon={<Users size={16} />}
              tom="green"
            />
          </div>

          <div className="dash-grid-2">
            <div className="dash-panel dash-panel-wide">
              <div className="dash-panel-head">
                <span className="section-kicker">EVOLUÇÃO TEMPORAL</span>
                <h3><Calendar size={14} /> Ocorrências por mês — {filtroAno}</h3>
              </div>
              <div className="dash-chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porMes} barGap={3}>
                    <CartesianGrid stroke="#dfe3e1" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tick={{ fill: '#8a928d', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      axisLine={{ stroke: '#dfe3e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#8a928d', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      axisLine={false}
                      tickLine={false}
                      width={26}
                    />
                    <Tooltip content={<DashTooltip />} cursor={{ fill: 'rgba(167,45,49,.045)' }} />
                    <Bar dataKey="total" name="Total" fill="#cbd0cd" radius={[1, 1, 0, 0]} />
                    <Bar dataKey="flagrantes" name="Flagrantes" fill="#a72d31" radius={[1, 1, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="dash-legend">
                <span><i style={{ background: '#cbd0cd' }} /> Total de ocorrências</span>
                <span><i style={{ background: '#a72d31' }} /> Flagrantes</span>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="section-kicker">CLASSIFICAÇÃO</span>
                <h3><ShieldAlert size={14} /> Tipos de incidência</h3>
              </div>
              <div className="dash-chart-box dash-chart-box-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={porTipo}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="#fafbfa"
                      strokeWidth={2}
                    >
                      {porTipo.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CORES[index % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<DashTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="dash-pie-legend">
                {porTipo.map((t, i) => (
                  <li key={t.name}>
                    <span>
                      <i style={{ background: CORES[i % CORES.length] }} />
                      {t.name}
                    </span>
                    <strong>{t.value}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="dash-grid-2">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="section-kicker">PERFIL DA VISITAÇÃO</span>
                <h3><Users size={14} /> Visitantes por sexo</h3>
              </div>

              <div className="dash-chart-box dash-chart-box-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sexoVisitantes}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={65}
                      paddingAngle={2}
                      stroke="#fafbfa"
                      strokeWidth={2}
                    >
                      {sexoVisitantes.map((item, index) => (
                        <Cell key={item.name} fill={CORES[index % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<DashTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="dash-pie-legend">
                {sexoVisitantes.map((item, index) => (
                  <li key={item.name}>
                    <span>
                      <i style={{ background: CORES[index % CORES.length] }} />
                      {item.name}
                    </span>
                    <strong>{item.value}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="section-kicker">GEOGRAFIA INTERNA</span>
                <h3><MapPin size={14} /> Incidência por bloco</h3>
              </div>
              <div className="dash-chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porBloco} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid stroke="#dfe3e1" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: '#8a928d', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="bloco"
                      type="category"
                      width={92}
                      tick={{ fill: '#59615c', fontSize: 10.5 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<DashTooltip />} cursor={{ fill: 'rgba(78,111,90,.06)' }} />
                    <Bar dataKey="total" fill="#4e6f5a" radius={[0, 1, 1, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="section-kicker">CONCENTRAÇÃO DE RISCO</span>
                <h3><AlertOctagon size={14} /> Top 5 celas com mais registros</h3>
              </div>

              {celasCriticas.length === 0 ? (
                <p className="dash-empty-text">Sem dados de cela cadastrados para {filtroAno}.</p>
              ) : (
                <ul className="dash-ranking">
                  {celasCriticas.map((item, idx) => (
                    <li key={item.cela}>
                      <div className="dash-ranking-top">
                        <span className="dash-ranking-name">
                          <em>{String(idx + 1).padStart(2, '0')}</em>
                          {item.cela}
                        </span>
                        <span className="dash-ranking-value">
                          {item.total} {item.total === 1 ? 'ocorrência' : 'ocorrências'}
                        </span>
                      </div>
                      <div className="dash-ranking-bar">
                        <div style={{ width: `${(item.total / maiorCela) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="dash-grid-2">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="section-kicker">RECORRÊNCIA</span>
                <h3><Users size={14} /> Presos que mais aparecem</h3>
              </div>

              {rankingPresos.length === 0 ? (
                <p className="dash-empty-text">Sem dados de preso/custodiado cadastrados para {filtroAno}.</p>
              ) : (
                <ul className="dash-ranking">
                  {rankingPresos.map((item, idx) => (
                    <li key={item.nome}>
                      <div className="dash-ranking-top">
                        <span className="dash-ranking-name">
                          <em>{String(idx + 1).padStart(2, '0')}</em>
                          {item.nome}
                        </span>
                        <span className="dash-ranking-value">
                          {item.total} {item.total === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>
                      <div className="dash-ranking-bar">
                        <div style={{ width: `${(item.total / maiorPreso) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <span className="section-kicker">RECORRÊNCIA</span>
                <h3><Users size={14} /> Visitantes que mais aparecem</h3>
              </div>

              {rankingVisitantes.length === 0 ? (
                <p className="dash-empty-text">Sem dados de visitantes cadastrados para {filtroAno}.</p>
              ) : (
                <ul className="dash-ranking">
                  {rankingVisitantes.map((item, idx) => (
                    <li key={item.nome}>
                      <div className="dash-ranking-top">
                        <span className="dash-ranking-name">
                          <em>{String(idx + 1).padStart(2, '0')}</em>
                          {item.nome}
                        </span>
                        <span className="dash-ranking-value">
                          {item.total} {item.total === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>
                      <div className="dash-ranking-bar">
                        <div style={{ width: `${(item.total / maiorVisitante) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CardKpi({ titulo, valor, icon, tom }: { titulo: string; valor: number; icon: React.ReactNode; tom: 'red' | 'green' | 'neutral' }) {
  return (
    <div className={`dash-kpi dash-kpi-${tom}`}>
      <div className="dash-kpi-icon">{icon}</div>
      <div>
        <p className="field-label dash-kpi-label">{titulo}</p>
        <p className="dash-kpi-value">{valor}</p>
      </div>
    </div>
  );
}

function DashTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="dash-tooltip">
      {label && <p className="dash-tooltip-label">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="dash-tooltip-row">
          <span><i style={{ background: p.color || p.fill }} />{p.name}</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DashSkeleton() {
  return (
    <div className="dash-skeleton">
      <div className="dash-kpis">
        {[0, 1, 2, 3].map((i) => <div key={i} className="dash-skel-box dash-skel-kpi" />)}
      </div>
      <div className="dash-grid-2">
        <div className="dash-skel-box dash-skel-panel" />
        <div className="dash-skel-box dash-skel-panel" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Estilos — segue os tokens globais definidos em App.tsx (--a-*)     */
/* ------------------------------------------------------------------ */

const estilosDash = `
.dash-root{ padding-top:2px; }

.dash-year-only{
  width:max-content;
  margin:0 0 16px auto;
}

.dash-notice-block{ margin-top:20px; }

.dash-kpis{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
  margin:22px 0;
}

.dash-kpi{
  display:flex;
  align-items:center;
  gap:12px;
  padding:14px 15px;
  border:1px solid var(--a-line);
  background:var(--a-surface);
}

.dash-kpi-icon{
  width:34px;
  height:34px;
  flex-shrink:0;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--a-line);
}
.dash-kpi-red .dash-kpi-icon{ color:var(--a-red); border-color:rgba(167,45,49,.25); background:var(--a-red-soft); }
.dash-kpi-green .dash-kpi-icon{ color:var(--a-green); border-color:rgba(78,111,90,.3); background:var(--a-green-soft); }
.dash-kpi-neutral .dash-kpi-icon{ color:var(--a-text-soft); border-color:var(--a-line-dark); background:var(--a-surface-2); }

.dash-kpi-label{ margin-bottom:5px; }

.dash-kpi-value{
  margin:0;
  font-family:'IBM Plex Mono', monospace;
  font-size:22px;
  font-weight:500;
  color:var(--a-text);
  line-height:1;
}

.dash-grid-2{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:16px;
  margin-bottom:16px;
}

.dash-panel{
  border:1px solid var(--a-line);
  background:var(--a-surface);
  padding:16px 18px 18px;
}

.dash-panel-head{ margin-bottom:14px; }
.dash-panel-head h3{
  margin:2px 0 0;
  display:flex;
  align-items:center;
  gap:7px;
  font-size:12.5px;
  font-weight:600;
  color:var(--a-text);
}
.dash-panel-head h3 svg{ color:var(--a-red); }

.dash-chart-box{ height:230px; }
.dash-chart-box-sm{ height:190px; }

.dash-legend{
  display:flex;
  gap:16px;
  margin-top:10px;
  font-size:10px;
  color:var(--a-text-soft);
}
.dash-legend span{ display:flex; align-items:center; gap:6px; }
.dash-legend i{ width:8px; height:8px; display:inline-block; }

.dash-pie-legend{ margin:12px 0 0; padding:0; list-style:none; }
.dash-pie-legend li{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:6px 0;
  border-top:1px solid var(--a-line);
  font-size:10.5px;
  color:var(--a-text-soft);
}
.dash-pie-legend li:first-child{ border-top:0; }
.dash-pie-legend span{ display:flex; align-items:center; gap:7px; }
.dash-pie-legend i{ width:7px; height:7px; flex-shrink:0; display:inline-block; }
.dash-pie-legend strong{ font-family:'IBM Plex Mono', monospace; color:var(--a-text); font-weight:500; }

.dash-empty-text{ font-size:11px; color:var(--a-text-faint); padding:20px 0; text-align:center; }

.dash-ranking{ margin:0; padding:0; list-style:none; }
.dash-ranking li{ padding:10px 0; border-top:1px solid var(--a-line); }
.dash-ranking li:first-child{ border-top:0; padding-top:2px; }

.dash-ranking-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:6px;
}

.dash-ranking-name{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:11.5px;
  font-weight:500;
  color:var(--a-text);
}
.dash-ranking-name em{
  font-style:normal;
  font-family:'IBM Plex Mono', monospace;
  font-size:9px;
  color:var(--a-red);
}

.dash-ranking-value{
  font-family:'IBM Plex Mono', monospace;
  font-size:9px;
  letter-spacing:.05em;
  color:var(--a-text-faint);
  white-space:nowrap;
}

.dash-ranking-bar{
  height:3px;
  background:var(--a-surface-2);
}
.dash-ranking-bar div{ height:100%; background:var(--a-red); }

.dash-tooltip{
  border:1px solid var(--a-line-dark);
  background:rgba(250,251,250,.98);
  box-shadow:var(--a-shadow);
  padding:8px 10px;
  min-width:120px;
}
.dash-tooltip-label{
  margin:0 0 5px;
  font-family:'IBM Plex Mono', monospace;
  font-size:9px;
  letter-spacing:.08em;
  color:var(--a-text-faint);
}
.dash-tooltip-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  font-size:11px;
  color:var(--a-text-soft);
  padding:1px 0;
}
.dash-tooltip-row span{ display:flex; align-items:center; gap:6px; }
.dash-tooltip-row i{ width:7px; height:7px; display:inline-block; }
.dash-tooltip-row strong{ font-family:'IBM Plex Mono', monospace; color:var(--a-text); }

.dash-skeleton{ margin-top:22px; }
.dash-skel-box{
  background:linear-gradient(90deg, var(--a-surface-2) 25%, #f5f6f5 37%, var(--a-surface-2) 63%);
  background-size:400% 100%;
  animation:dash-shimmer 1.4s ease infinite;
  border:1px solid var(--a-line);
}
.dash-skel-kpi{ height:64px; }
.dash-skel-panel{ height:260px; }

@keyframes dash-shimmer{
  0%{ background-position:100% 50%; }
  100%{ background-position:0 50%; }
}

@media(max-width:900px){
  .dash-kpis{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dash-grid-2{ grid-template-columns:1fr; }
}
@media(max-width:520px){
  .dash-kpis{ grid-template-columns:1fr; }
}
`;