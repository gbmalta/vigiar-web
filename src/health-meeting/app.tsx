import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  LayoutDashboard,
  MapPin,
  MoveUpRight,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { assetUrl } from '@/lib/asset-url';
import {
  change,
  colors,
  date,
  metrics,
  number,
  trend,
  type MeetingData,
  type Prediction,
} from './data';

const PredictionMap = lazy(() => import('./map'));
type Tab = 'overview' | 'predictions' | 'map';
const tabs = [
  { id: 'overview', label: 'Visão geral', Icon: LayoutDashboard },
  { id: 'predictions', label: 'Predições', Icon: ChartNoAxesCombined },
  { id: 'map', label: 'Análise espacial', Icon: Compass },
] as const;
const percent = (v: number | null) =>
  v === null
    ? '—'
    : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
function Badge({ row }: { row: Prediction }) {
  const label = trend(row);
  return (
    <span className="hm-badge" style={{ color: colors[label] }}>
      <span style={{ background: colors[label] }} />
      {label}
    </span>
  );
}

function Dashboard({ data }: { data: MeetingData }) {
  const [tab, setTab] = useState<Tab>(() =>
    tabs.some((t) => `#${t.id}` === location.hash)
      ? (location.hash.slice(1) as Tab)
      : 'overview',
  );
  const [cityId, setCity] = useState('3304557');
  const weeks = useMemo(
    () => [...new Set(data.predictions.map((r) => r.week))].sort(),
    [data],
  );
  const [week, setWeek] = useState(weeks.at(-1)!);
  const [showBaseline, setShowBaseline] = useState(false);
  const [methodOpen, setMethodOpen] = useState(
    location.hash === '#methodology',
  );
  const [showObserved, setShowObserved] = useState(true);
  const year = week.slice(0, 4);
  const city = data.cities.find((c) => c.id === cityId)!;
  const rows = useMemo(
    () => data.predictions.filter((r) => r.week === week),
    [data, week],
  );
  const current = rows.find((r) => r.city === cityId)!;
  const series = useMemo(
    () =>
      data.predictions.filter(
        (r) => r.city === cityId && r.week.startsWith(year),
      ),
    [data, cityId, year],
  );
  const overall = metrics(data.predictions);
  const local = metrics(series);
  const weekIndex = weeks.indexOf(week);
  const total = rows.reduce((s, r) => s + r.predicted, 0);
  const rising = rows.filter((r) => trend(r) === 'Alta').length;
  useEffect(() => {
    const sync = () => {
      if (tabs.some((t) => `#${t.id}` === location.hash)) {
        setTab(location.hash.slice(1) as Tab);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  function navigate(next: Tab) {
    location.hash = next;
    setTab(next);
  }
  const map = (
    <Suspense
      fallback={
        <div className="hm-map hm-loading" role="status">
          Carregando mapa…
        </div>
      }
    >
      <PredictionMap
        cities={data.cities}
        rows={rows}
        selected={cityId}
        onSelect={setCity}
      />
    </Suspense>
  );
  const cityList = (
    <div className="hm-city-list">
      {data.cities.map((c) => {
        const r = rows.find((p) => p.city === c.id)!;
        return (
          <button
            key={c.id}
            className={`hm-city ${cityId === c.id ? 'selected' : ''}`}
            onClick={() => setCity(c.id)}
            aria-pressed={cityId === c.id}
          >
            <span className="hm-city-icon">
              <MapPin size={17} />
            </span>
            <span className="hm-city-name">
              <strong>{c.name}</strong>
              <small>
                {c.uf} <span>·</span> <Badge row={r} />
              </small>
            </span>
            <span className="hm-city-value">
              <strong>{number(r.predicted)}</strong>
              <small>previstas</small>
            </span>
            <ChevronRight size={16} />
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="hm-app">
      <a className="hm-skip" href="#main">
        Pular para o conteúdo
      </a>
      <header className="hm-header">
        <a
          href={assetUrl('health-meeting.html')}
          className="hm-brand"
          aria-label="VIGIAR início"
        >
          <span className="hm-brand-icon">
            <Activity size={24} />
          </span>
          VIGIAR
          <span className="hm-brand-description">Inteligência em saúde</span>
        </a>
        <div className="hm-event">
          <span />
          Health Meeting <span className="hm-event-year">2026</span>
        </div>
        <a className="hm-original" href={assetUrl('')}>
          Explorar atlas completo <ArrowUpRight size={16} />
        </a>
      </header>
      <div className="hm-shell">
        <aside className="hm-sidebar">
          <p className="hm-nav-label">EXPLORAR</p>
          <nav aria-label="Navegação principal">
            {tabs.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className={tab === id ? 'active' : ''}
                aria-current={tab === id ? 'page' : undefined}
              >
                <Icon size={19} />
                {label}
                {tab === id && <span className="hm-active-dot" />}
              </a>
            ))}
          </nav>
          <div className="hm-sidebar-note">
            <span className="hm-mini-icon">
              <Activity size={20} />
            </span>
            <strong>
              Da informação
              <br />à antecipação.
            </strong>
            <p>Um olhar sobre a dengue em cinco cidades brasileiras.</p>
            <span className="hm-sidebar-line" />
            <small>
              EDIÇÃO HEALTH MEETING
              <br />
              22 SET · 2026
            </small>
          </div>
          <a
            className="hm-help"
            href="#methodology"
            onClick={() => setMethodOpen(true)}
          >
            <CircleHelp size={17} />
            Sobre os dados
          </a>
        </aside>
        <main id="main" className="hm-main">
          <div className="hm-eyebrow">
            <span>VIGILÂNCIA EPIDEMIOLÓGICA</span>
            <span className="hm-retrospective">
              <Clock3 size={13} />
              Estudo retrospectivo · 2024–2025
            </span>
          </div>
          <div className="hm-page-title">
            <div>
              <h1>
                {tab === 'overview'
                  ? 'Antecipar para cuidar.'
                  : tab === 'predictions'
                    ? 'O que o modelo antecipa?'
                    : 'As predições no território.'}
              </h1>
              <p>
                {tab === 'overview'
                  ? 'Predições de dengue, conectadas ao território.'
                  : tab === 'predictions'
                    ? 'Compare o previsto e o observado, uma cidade de cada vez.'
                    : 'Explore como a variação prevista se distribui entre as cidades.'}
              </p>
            </div>
            <a
              className="hm-download"
              href={assetUrl('health-meeting/predictions.csv')}
              download
            >
              <ArrowDownToLine size={16} />
              <span>Baixar dados</span>
            </a>
          </div>
          <div className="hm-context">
            <div>
              <span className="hm-context-dot" />
              <strong>Previsões históricas</strong>
              <span>
                Explore o que foi previsto para cada período. Não há previsão
                atual para setembro de 2026.
              </span>
            </div>
            <a href="#methodology" onClick={() => setMethodOpen(true)}>
              Entenda o estudo <ArrowRight size={14} />
            </a>
          </div>
          <div className="hm-filter-row">
            <div className="hm-period">
              <label htmlFor="hm-week">SEMANA DE REFERÊNCIA</label>
              <div className="hm-period-controls">
                <button
                  aria-label="Semana anterior"
                  disabled={weekIndex === 0}
                  onClick={() => setWeek(weeks[weekIndex - 1])}
                >
                  <ChevronLeft size={17} />
                </button>
                <select
                  id="hm-week"
                  value={week}
                  onChange={(e) => setWeek(e.target.value)}
                >
                  {weeks.map((w) => (
                    <option key={w} value={w}>
                      {date(w)}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Próxima semana"
                  disabled={weekIndex === weeks.length - 1}
                  onClick={() => setWeek(weeks[weekIndex + 1])}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div className="hm-window">
              <span>JANELA PREVISTA · 4 SEMANAS</span>
              <strong>
                {date(current.start)} <ArrowRight size={14} />{' '}
                {date(current.end)}
              </strong>
            </div>
            <label className="hm-city-select">
              CIDADE EM FOCO
              <select
                aria-label="Cidade em foco"
                value={cityId}
                onChange={(e) => setCity(e.target.value)}
              >
                {data.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.uf}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {tab === 'overview' && (
            <>
              <section
                className="hm-stats"
                aria-label="Resumo da janela selecionada"
              >
                <article>
                  <span>
                    Notificações previstas <ChartNoAxesCombined size={18} />
                  </span>
                  <strong>{number(total)}</strong>
                  <small>Soma das 5 cidades nesta janela</small>
                </article>
                <article>
                  <span>
                    Cidades com alta prevista <MoveUpRight size={18} />
                  </span>
                  <strong>
                    {rising}
                    <em> / 5</em>
                  </strong>
                  <small>
                    Variação acima de 20% sobre as 4 semanas anteriores
                  </small>
                </article>
                <article className="hm-stat-accent">
                  <span>
                    Horizonte de antecipação <Clock3 size={18} />
                  </span>
                  <strong>
                    4 <em>semanas</em>
                  </strong>
                  <small>
                    A partir do encerramento da semana de referência
                  </small>
                </article>
              </section>
              <div className="hm-overview-grid">
                <section className="hm-panel">
                  <div className="hm-panel-heading">
                    <div>
                      <span className="hm-section-label">
                        LEITURA TERRITORIAL
                      </span>
                      <h2>Cinco cidades. Diferentes cenários.</h2>
                    </div>
                    <button
                      className="hm-text-button"
                      onClick={() => navigate('map')}
                    >
                      Explorar mapa <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {map}
                  <div className="hm-legend">
                    <span>
                      <i style={{ background: colors.Alta }} />
                      Alta
                    </span>
                    <span>
                      <i style={{ background: colors.Estável }} />
                      Estável
                    </span>
                    <span>
                      <i style={{ background: colors.Queda }} />
                      Queda
                    </span>
                    <small>Variação frente às 4 semanas anteriores</small>
                  </div>
                </section>
                <section className="hm-panel hm-cities-panel">
                  <div className="hm-panel-heading">
                    <div>
                      <span className="hm-section-label">
                        NA JANELA SELECIONADA
                      </span>
                      <h2>Cidades analisadas</h2>
                    </div>
                    <span className="hm-count">05</span>
                  </div>
                  {cityList}
                  <div className="hm-city-focus">
                    <span>
                      EM FOCO · {city.name.toLocaleUpperCase('pt-BR')}
                    </span>
                    <p>
                      {number(current.predicted)} notificações previstas e{' '}
                      {number(current.observed)} observadas.
                    </p>
                    <button onClick={() => navigate('predictions')}>
                      Ver evolução da cidade <ArrowRight size={16} />
                    </button>
                  </div>
                </section>
              </div>
              <section className="hm-bottom-note">
                <span className="hm-note-icon">
                  <ChartNoAxesCombined size={22} />
                </span>
                <div>
                  <h3>Uma previsão também precisa mostrar seus limites.</h3>
                  <p>
                    No recorte completo, o erro percentual agregado (WAPE) é de{' '}
                    <strong>{percent(overall.wape)}</strong>. Explore o
                    desempenho por cidade.
                  </p>
                </div>
                <button onClick={() => navigate('predictions')}>
                  Ver predições <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}
          {tab === 'predictions' && (
            <>
              <section className="hm-stats">
                <article>
                  <span>Previsto · próxima janela</span>
                  <strong>{number(current.predicted)}</strong>
                  <small>Notificações em {city.name}</small>
                </article>
                <article>
                  <span>Observado · mesma janela</span>
                  <strong>{number(current.observed)}</strong>
                  <small>Valor conhecido após o período</small>
                </article>
                <article className="hm-stat-accent">
                  <span>Variação frente ao histórico recente</span>
                  <strong>{percent(change(current))}</strong>
                  <small>
                    Base: {number(current.baseline)} nas 4 semanas anteriores ·{' '}
                    <Badge row={current} />
                  </small>
                </article>
              </section>
              <section className="hm-panel hm-chart-panel">
                <div className="hm-panel-heading">
                  <div>
                    <span className="hm-section-label">
                      EVOLUÇÃO DAS PREDIÇÕES
                    </span>
                    <h2>
                      {city.name} <span className="hm-muted">/ {year}</span>
                    </h2>
                    <p>
                      Notificações acumuladas nas 4 semanas seguintes a cada
                      origem.
                    </p>
                  </div>
                  <label className="hm-year">
                    Ano
                    <select
                      aria-label="Ano do gráfico"
                      value={year}
                      onChange={(e) =>
                        setWeek(
                          weeks
                            .filter((w) => w.startsWith(e.target.value))
                            .at(-1)!,
                        )
                      }
                    >
                      <option>2024</option>
                      <option>2025</option>
                    </select>
                  </label>
                </div>
                <div className="hm-chart-controls">
                  <span className="hm-line-key">Previsto</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={showObserved}
                      onChange={(e) => setShowObserved(e.target.checked)}
                    />
                    Observado
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showBaseline}
                      onChange={(e) => setShowBaseline(e.target.checked)}
                    />
                    Referência: repetir as 4 semanas anteriores
                  </label>
                </div>
                <div
                  className="hm-chart"
                  role="img"
                  aria-label={`Gráfico de predições de ${city.name} em ${year}. Valores disponíveis na tabela abaixo.`}
                >
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    initialDimension={{ width: 600, height: 330 }}
                  >
                    <LineChart
                      data={series}
                      margin={{ top: 20, right: 20, left: 5, bottom: 10 }}
                    >
                      <CartesianGrid vertical={false} stroke="#e8ece9" />
                      <XAxis
                        dataKey="week"
                        tickFormatter={(v) => date(String(v), false)}
                        minTickGap={48}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#71817c', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        tickFormatter={(v) => number(Number(v))}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#71817c', fontSize: 12 }}
                        width={62}
                      />
                      <Tooltip
                        labelFormatter={(v) => `Referência: ${date(String(v))}`}
                        formatter={(v, name) => [number(Number(v)), name]}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #dce5e0',
                          fontSize: 13,
                        }}
                      />
                      <ReferenceLine
                        x={week}
                        stroke="#a1b8ad"
                        strokeDasharray="3 4"
                      />
                      {showBaseline && (
                        <Line
                          name="Referência"
                          dataKey="baseline"
                          stroke="#a7adb3"
                          strokeDasharray="4 4"
                          dot={false}
                          strokeWidth={1.5}
                          isAnimationActive={false}
                        />
                      )}
                      {showObserved && (
                        <Line
                          name="Observado"
                          dataKey="observed"
                          stroke="#364950"
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      )}
                      <Line
                        name="Previsto"
                        dataKey="predicted"
                        stroke="#228c70"
                        dot={false}
                        activeDot={{ r: 5 }}
                        strokeWidth={2.5}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="hm-chart-foot">
                  <span>
                    As janelas se sobrepõem. Não somar os pontos como total
                    anual.
                  </span>
                  <span>Intervalo de predição indisponível nesta rodada.</span>
                </div>
              </section>
              <section className="hm-performance">
                <div>
                  <span className="hm-section-label">
                    DESEMPENHO · {city.name.toLocaleUpperCase('pt-BR')} · {year}
                  </span>
                  <h2>O quanto a previsão se aproxima?</h2>
                </div>
                <div>
                  <strong>{percent(local.wape)}</strong>
                  <span>Erro percentual agregado · WAPE</span>
                </div>
                <div>
                  <strong>
                    {local.mae === null ? '—' : number(local.mae)}
                  </strong>
                  <span>Erro absoluto médio · notificações</span>
                </div>
                <div>
                  <strong>{percent(local.gain)}</strong>
                  <span>
                    Redução do erro sobre a referência
                    <br />
                    Negativo indica desempenho pior
                  </span>
                </div>
              </section>
              <details className="hm-details">
                <summary>
                  Consultar os {series.length} valores do gráfico
                </summary>
                <div className="hm-table-scroll">
                  <table>
                    <caption>{city.name} · janelas de quatro semanas</caption>
                    <thead>
                      <tr>
                        <th>Referência</th>
                        <th>Janela prevista</th>
                        <th>Previsto</th>
                        <th>Observado</th>
                        <th>Referência simples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.map((r) => (
                        <tr key={r.week}>
                          <td>{date(r.week)}</td>
                          <td>
                            {date(r.start)} a {date(r.end)}
                          </td>
                          <td>{number(r.predicted)}</td>
                          <td>{number(r.observed)}</td>
                          <td>{number(r.baseline)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
          {tab === 'map' && (
            <>
              <div className="hm-spatial-grid">
                <section className="hm-panel hm-spatial-map">
                  <div className="hm-panel-heading">
                    <div>
                      <span className="hm-section-label">
                        VARIAÇÃO PREVISTA
                      </span>
                      <h2>Um olhar sobre o território</h2>
                    </div>
                    <span className="hm-count">5 cidades</span>
                  </div>
                  {map}
                  <div className="hm-legend">
                    <span>
                      <i style={{ background: colors.Alta }} />
                      Alta &gt; 20%
                    </span>
                    <span>
                      <i style={{ background: colors.Estável }} />
                      Estável ±20%
                    </span>
                    <span>
                      <i style={{ background: colors.Queda }} />
                      Queda &gt; 20%
                    </span>
                  </div>
                </section>
                <section className="hm-panel hm-spatial-detail">
                  <div className="hm-panel-heading">
                    <div>
                      <span className="hm-section-label">CIDADE EM FOCO</span>
                      <h2>
                        {city.name}{' '}
                        <span className="hm-muted">/ {city.uf}</span>
                      </h2>
                    </div>
                    <MapPin size={20} />
                  </div>
                  <div className="hm-detail-body">
                    <Badge row={current} />
                    <strong className="hm-detail-number">
                      {number(current.predicted)}
                    </strong>
                    <p>notificações previstas em 4 semanas</p>
                    <dl>
                      <div>
                        <dt>Últimas 4 semanas</dt>
                        <dd>{number(current.baseline)}</dd>
                      </div>
                      <div>
                        <dt>Variação prevista</dt>
                        <dd>{percent(change(current))}</dd>
                      </div>
                      <div>
                        <dt>Observado na janela</dt>
                        <dd>{number(current.observed)}</dd>
                      </div>
                    </dl>
                    <p className="hm-spatial-explanation">
                      A cor compara a cidade com seu próprio histórico recente.
                      Ela não representa incidência, risco individual ou um
                      alerta de surto.
                    </p>
                    <button
                      className="hm-primary"
                      onClick={() => navigate('predictions')}
                    >
                      Explorar predições <ArrowRight size={16} />
                    </button>
                  </div>
                </section>
              </div>
              <section className="hm-panel hm-spatial-cities">
                <div className="hm-panel-heading">
                  <div>
                    <span className="hm-section-label">
                      COMPARAÇÃO MUNICIPAL
                    </span>
                    <h2>A mesma janela, cinco contextos</h2>
                  </div>
                </div>
                {cityList}
              </section>
              <p className="hm-map-caveat">
                <CircleHelp size={16} />
                Pontos representam municípios de notificação. Sem estimativa por
                bairro, taxa populacional ou teste de agrupamento espacial.
              </p>
            </>
          )}
          <details
            className="hm-details hm-methodology"
            id="methodology"
            open={methodOpen}
            onToggle={(event) => setMethodOpen(event.currentTarget.open)}
          >
            <summary>
              Sobre os dados e a metodologia <CircleHelp size={16} />
            </summary>
            <div className="hm-method-grid">
              <div>
                <h3>O que estamos prevendo?</h3>
                <p>
                  O total de notificações de dengue nas quatro semanas
                  seguintes, por município de notificação. Inclui registros
                  posteriormente descartados; não representa casos confirmados
                  nem pessoas únicas.
                </p>
                <h3>Como interpretar as cores?</h3>
                <p>
                  Alta: previsão mais de 20% acima das quatro semanas
                  anteriores. Queda: mais de 20% abaixo. Estável: entre −20% e
                  +20%. Base zero: sem comparação percentual. É uma convenção
                  visual, não um limiar epidemiológico.
                </p>
              </div>
              <div>
                <h3>Qual modelo e avaliação?</h3>
                <p>
                  {data.model}, configuração {data.sourceVersion}, com seleção
                  interna antes de 2024 e sem reajuste durante o teste. São 520
                  previsões, cinco cidades e 104 semanas de referência em
                  2024–2025. Esses anos já foram explorados no projeto: a
                  avaliação é retrospectiva, não prospectiva independente.
                </p>
                <h3>O que significa o erro?</h3>
                <p>
                  WAPE = soma dos erros absolutos / soma dos observados. MAE =
                  média dos erros absolutos. A referência repete o total das
                  últimas quatro semanas. Não há intervalo de predição calibrado
                  nesta rodada. Janelas sobrepostas não podem ser somadas como
                  totais anuais.
                </p>
              </div>
            </div>
            <p className="hm-provenance">
              Rodada de 13/09/2026 · {data.sourceRun} · Origem encerrada em{' '}
              {date(current.origin)} ·{' '}
              <a href={assetUrl('health-meeting/manifest.json')}>
                Proveniência dos dados
              </a>
            </p>
          </details>
          <footer className="hm-footer">
            <span>
              <strong>VIGIAR</strong> Ciência de dados a serviço da saúde
              pública.
            </span>
            <span>Health Meeting · Edição de apresentação</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<MeetingData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(assetUrl('health-meeting/predictions.json'), {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error('Dados indisponíveis');
        return r.json();
      })
      .then((result: MeetingData) => {
        if (
          result.schemaVersion !== 1 ||
          result.cities.length !== 5 ||
          result.predictions.length !== 520
        )
          throw new Error('Dados incompatíveis');
        setData(result);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  if (error)
    return (
      <main className="hm-state">
        <Activity size={36} />
        <h1>Não foi possível carregar os dados.</h1>
        <p>Verifique sua conexão e tente novamente.</p>
        <button onClick={() => setAttempt((a) => a + 1)}>
          Tentar novamente
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="hm-state" role="status">
        <Activity size={36} />
        <p>Preparando uma visão mais clara…</p>
      </main>
    );
  return <Dashboard data={data} />;
}
