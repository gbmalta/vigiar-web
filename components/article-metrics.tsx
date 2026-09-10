import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpRight,
  ChartNoAxesCombined,
  Database,
  FileText,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { assetUrl } from '@/lib/asset-url';
import type {
  Analysis,
  Bin,
  Feature,
  Method,
  Quality,
  WeekRow,
} from '@/lib/article-data';
import './article-metrics.css';

type Dataset = {
  method: Method;
  quality: Quality;
  analysis: Analysis;
  panel: WeekRow[];
};
type Section = 'quality' | 'target' | 'woe' | 'method';
const fmt = (n: number | null | undefined, digits = 0) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(
        n,
      );
const pct = (n: number | null | undefined, digits = 1) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const p = n * 100,
    precision = 10 ** -digits;
  if (p > 0 && p < precision) return '<' + fmt(precision, digits) + '%';
  if (p < 100 && p > 100 - precision)
    return '>' + fmt(100 - precision, digits) + '%';
  return fmt(p, digits) + '%';
};
const date = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
const numberTick = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
const sectionNames: [Section, string][] = [
  ['quality', 'Qualidade e integração'],
  ['target', 'Alvo de quatro semanas'],
  ['woe', 'WOE e IV'],
  ['method', 'Método e relatórios'],
];

function Download({
  file,
  children,
}: {
  file: string;
  children: React.ReactNode;
}) {
  return (
    <a className="metrics-download" href={assetUrl(file)} download>
      <ArrowDownToLine size={16} />
      {children}
    </a>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="metrics-note">
      <Info size={18} />
      <div>{children}</div>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metrics-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function binLabel(bin: Bin) {
  if (bin.missing) return 'Ausente';
  if (bin.lower == null && bin.upper == null) return 'Todos os valores';
  if (bin.lower == null) return '< ' + fmt(bin.upper, 3);
  if (bin.upper == null) return '≥ ' + fmt(bin.lower, 3);
  return '[' + fmt(bin.lower, 3) + '; ' + fmt(bin.upper, 3) + ')';
}

function QualityView({ data }: { data: Dataset }) {
  const { quality, method } = data;
  const [scope, setScope] = useState('Brasil');
  const [delayKind, setDelayKind] = useState<'notification' | 'closure'>(
    'notification',
  );
  const [source, setSource] = useState('fat_sinan');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const timing = quality.timeliness.find((x) => x.scope === scope)!;
  const delay = timing[delayKind];
  const selectedMissing = quality.missingness
    .filter(
      (x) =>
        x.table === source &&
        x.column.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.completeness ?? 2) - (b.completeness ?? 2) ||
        a.column.localeCompare(b.column),
    );
  const negatives =
    delayKind === 'notification'
      ? timing.delay_negative
      : timing.closure_negative;
  const present =
    delayKind === 'notification'
      ? timing.delay_present
      : timing.closure_present;
  return (
    <>
      <div className="metrics-section-heading">
        <div>
          <span className="metrics-eyebrow">01 / CONFIABILIDADE</span>
          <h2>O que a carga permite medir</h2>
          <p>
            Dez dimensões do manuscrito, com denominadores explícitos.
            Resultados indisponíveis permanecem identificados.
          </p>
        </div>
        <Download file="analytics/completeness.csv">Completude · CSV</Download>
      </div>
      <div className="metrics-stats">
        <Stat
          label="Notificações representadas"
          value={fmt(method.totals.notifications)}
          detail="Soma de qt · Brasil, 2021–jun/2026"
        />
        <Stat
          label="Grupos no SINAN Gold"
          value={fmt(method.totals.rows)}
          detail="Linhas físicas; não somar ao fato de notificações"
        />
        <Stat
          label="UDHs no recorte de estudo"
          value="1.961"
          detail="Cinco municípios · indicadores de 2010"
        />
        <Stat
          label="Fontes verificadas"
          value={fmt(method.sources.length)}
          detail="Parquets conferidos com o manifesto da carga"
        />
      </div>
      <section className="metrics-card">
        <div className="metrics-card-heading">
          <div>
            <h3>Tempo até a notificação e o encerramento</h3>
            <p>Distribuição de dias, ponderada pelo número de notificações.</p>
          </div>
          <label>
            Recorte
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {quality.timeliness.map((x) => (
                <option key={x.scope} value={x.scope}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="metrics-segments" aria-label="Intervalo temporal">
          <button
            aria-pressed={delayKind === 'notification'}
            onClick={() => setDelayKind('notification')}
          >
            Sintomas → notificação
          </button>
          <button
            aria-pressed={delayKind === 'closure'}
            onClick={() => setDelayKind('closure')}
          >
            Notificação → encerramento*
          </button>
        </div>
        <div className="metrics-stats compact">
          <Stat
            label="Mediana"
            value={fmt(delay.median) + ' dias'}
            detail={
              'Q25–Q75: ' + fmt(delay.q25) + '–' + fmt(delay.q75) + ' dias'
            }
          />
          <Stat
            label="Percentil 90"
            value={fmt(delay.p90) + ' dias'}
            detail={'P95: ' + fmt(delay.p95) + ' · máximo: ' + fmt(delay.max)}
          />
          <Stat
            label="Intervalos não negativos"
            value={fmt(delay.valid)}
            detail={
              pct(delay.valid / timing.total) + ' das notificações do recorte'
            }
          />
          <Stat
            label="Casos não encerrados"
            value={pct(timing.open / timing.total)}
            detail={fmt(timing.open) + ' na data da extração'}
          />
        </div>
        <div
          className="metrics-chart"
          role="img"
          aria-label="Distribuição dos intervalos em dias; valores na tabela abaixo"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 600, height: 290 }}
          >
            <BarChart
              data={delay.histogram}
              margin={{ top: 14, right: 16, bottom: 12, left: 10 }}
            >
              <CartesianGrid vertical={false} stroke="#e0e8e4" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={numberTick} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => fmt(Number(value))} />
              <Bar
                dataKey="n"
                name="Notificações"
                fill="#176b60"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="metrics-inline-facts">
          <span>
            Ausentes: <b>{fmt(timing.total - present)}</b> (
            {pct((timing.total - present) / timing.total)})
          </span>
          <span>
            Intervalos negativos: <b>{fmt(negatives)}</b> (
            {pct(negatives / timing.total)})
          </span>
        </div>
        <details>
          <summary>Valores e definição do intervalo</summary>
          <div className="metrics-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dias</th>
                  <th>Notificações</th>
                </tr>
              </thead>
              <tbody>
                {delay.histogram.map((x) => (
                  <tr key={x.label}>
                    <td>{x.label}</td>
                    <td>{fmt(x.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {method.timelinessNotes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </details>
        <Note>
          {delayKind === 'notification'
            ? 'O intervalo foi recalculado pelas datas. A transformação original usa sintomas − notificação, invertendo o sinal. Valores negativos foram separados dos quantis.'
            : '* Encerramento reconstruído do intervalo derivado e das datas disponíveis. A data bruta de encerramento não está no Gold; o método original já filtra alguns intervalos inválidos.'}
        </Note>
      </section>
      <div className="metrics-two-column">
        <section className="metrics-card">
          <h3>Retenção nas junções</h3>
          <p>Notificações dos cinco municípios, em etapas cumulativas.</p>
          <ol className="metrics-funnel">
            {quality.funnel.map((x, i) => (
              <li key={x.stage}>
                <div className="metrics-funnel-label">
                  <span>
                    <small>{String(i + 1).padStart(2, '0')}</small>
                    {x.stage}
                  </span>
                  <strong>{fmt(x.n)}</strong>
                </div>
                <div className="metrics-track">
                  <span style={{ width: `${x.retained * 100}%` }} />
                </div>
                <div className="metrics-funnel-meta">
                  <span>{pct(x.retained)} do início</span>
                  <span>Perda na etapa: {fmt(x.lossPrevious)}</span>
                </div>
              </li>
            ))}
          </ol>
          <Note>{method.funnelNote}</Note>
        </section>
        <section className="metrics-card">
          <h3>Cobertura espacial atual</h3>
          <p>
            CNES de julho de 2026, no recorte de estudo. Contagem de
            estabelecimentos, não de notificações.
          </p>
          <div className="metrics-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Município</th>
                  <th>CNES</th>
                  <th>Coordenadas válidas¹</th>
                  <th>Com UDH</th>
                  <th>UDHs</th>
                </tr>
              </thead>
              <tbody>
                {quality.spatial.map((x) => (
                  <tr key={x.city}>
                    <th>{x.name}</th>
                    <td>{fmt(x.facilities)}</td>
                    <td>
                      {fmt(x.bounds)}
                      <small>{pct(x.bounds / x.facilities)}</small>
                    </td>
                    <td>
                      {fmt(x.linked)}
                      <small>{pct(x.linked / x.facilities)}</small>
                    </td>
                    <td>{fmt(x.udh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="metrics-caption">
            ¹ Coordenadas numéricas dentro da caixa geográfica do Brasil (lat.
            −34 a 6; long. −74 a −28). Isso não comprova a localização dentro do
            município. A ponte UDH disponível sustenta a contagem de vínculos;
            nenhum geocódigo novo foi criado.
          </p>
          <h4>Ausências que afetam a análise</h4>
          <p>
            Manaus e Recife não têm registros municipais de clima nesta carga. O
            CNES atual não representa a rede histórica de 2021–2025. O painel
            preserva essas distinções nas métricas.
          </p>
          <div className="metrics-formula">
            Completude = 1 − nulos / linhas
            <br />
            Correspondência = chaves encontradas / chaves presentes
          </div>
        </section>
      </div>
      <section className="metrics-card">
        <div className="metrics-card-heading">
          <div>
            <h3>Verificações da carga</h3>
            <p>
              Taxa de atendimento de cada regra; leia o escopo antes de
              interpretar uma divergência.
            </p>
          </div>
        </div>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dimensão / regra</th>
                <th>Atendem</th>
                <th>Elegíveis</th>
                <th>Taxa</th>
                <th>Escopo</th>
              </tr>
            </thead>
            <tbody>
              {quality.checks.map((x, i) => (
                <tr key={i}>
                  <th>
                    <small>{x.dimension}</small>
                    {x.name}
                  </th>
                  <td>{fmt(x.numerator)}</td>
                  <td>{fmt(x.denominator)}</td>
                  <td>
                    <span
                      className={
                        'metrics-rate ' +
                        (x.rate != null && x.rate < 0.99 ? 'attention' : '')
                      }
                    >
                      {pct(x.rate, 2)}
                    </span>
                  </td>
                  <td className="metrics-table-note">{x.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="metrics-card">
        <div className="metrics-card-heading">
          <div>
            <h3>Completude por campo</h3>
            <p>
              Ausências estruturais e campos não aplicáveis exigem
              interpretação.
            </p>
          </div>
          <div className="metrics-filter-row">
            <label>
              Fonte
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setShowAll(false);
                }}
              >
                {quality.inventory.map((x) => (
                  <option key={x.table}>{x.table}</option>
                ))}
              </select>
            </label>
            <label>
              Buscar campo
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowAll(false);
                }}
                placeholder="Ex.: data_notificacao"
              />
            </label>
          </div>
        </div>
        <p className="metrics-caption">{method.completenessNote}</p>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Tipo Gold</th>
                <th>Linhas</th>
                <th>Nulos</th>
                <th>Completude</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? selectedMissing : selectedMissing.slice(0, 16)).map(
                (x) => (
                  <tr key={x.column}>
                    <th className="metrics-code">{x.column}</th>
                    <td>{x.type}</td>
                    <td>{fmt(x.rows)}</td>
                    <td>{fmt(x.nulls)}</td>
                    <td>{pct(x.completeness, 2)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {!selectedMissing.length && <p>Nenhum campo corresponde à busca.</p>}
        {selectedMissing.length > 16 && (
          <button
            className="metrics-text-button"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? 'Mostrar primeiros 16'
              : `Mostrar os ${selectedMissing.length} campos`}
          </button>
        )}
      </section>
      <section className="metrics-card">
        <h3>Dimensões ainda sem medição suficiente</h3>
        <div className="metrics-unavailable">
          {method.unavailable.map((x) => (
            <div key={x.metric}>
              <span>Não disponível</span>
              <h4>{x.metric}</h4>
              <p>{x.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function TargetView({ data }: { data: Dataset }) {
  const [city, setCity] = useState('3304557');
  const [year, setYear] = useState('2025');
  const c = data.analysis.cities.find((x) => x.id === city)!;
  const rows = data.panel.filter(
    (x) => x.city === city && x.week.startsWith(year),
  );
  const events = rows.filter((x) => x.target === 1).length;
  return (
    <>
      <div className="metrics-section-heading">
        <div>
          <span className="metrics-eyebrow">02 / DESENHO TEMPORAL</span>
          <h2>Quatro semanas à frente</h2>
          <p>
            Um alvo retrospectivo de carga relativa de notificações, definido
            para cada município.
          </p>
        </div>
        <Download file="analytics/municipality-week.csv">
          Painel semanal · CSV
        </Download>
      </div>
      <Note>
        “Evento” significa soma futura igual ou superior ao percentil 80 do
        desenvolvimento. Não é alerta sanitário, surto confirmado nem previsão
        de um modelo.
      </Note>
      <div className="metrics-timeline">
        <div>
          <small>DESENVOLVIMENTO</small>
          <b>2021 → 2024</b>
          <span>
            {fmt(data.analysis.devRows)} município-semanas · limiares e bins
          </span>
        </div>
        <div className="purge">
          <small>EXPURGO</small>
          <b>4 semanas</b>
          <span>Horizontes que cruzariam a fronteira</span>
        </div>
        <div className="evaluation">
          <small>AVALIAÇÃO</small>
          <b>2025</b>
          <span>
            {fmt(data.analysis.evaluationRows)} município-semanas · regras
            congeladas
          </span>
        </div>
      </div>
      <div className="metrics-formula">
        B(u,t) = y(u,t+1) + y(u,t+2) + y(u,t+3) + y(u,t+4)
        <br />
        Evento(u,t) = 1 se B(u,t) ≥ Q80 do desenvolvimento de u
      </div>
      <section className="metrics-card">
        <div className="metrics-card-heading">
          <div>
            <h3>Notificações observadas e carga futura</h3>
            <p>
              A semana exibida é a origem t; a soma futura inclui apenas t+1 a
              t+4.
            </p>
          </div>
          <div className="metrics-filter-row">
            <label>
              Município
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                {data.analysis.cities.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ano da origem
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                {['2021', '2022', '2023', '2024', '2025', '2026'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="metrics-stats compact">
          <Stat
            label="Limiar municipal fixo"
            value={fmt(c.threshold, 1)}
            detail="Notificações futuras · quantil 80 do desenvolvimento"
          />
          <Stat
            label={'Origens com evento em ' + year}
            value={fmt(events)}
            detail={
              fmt(rows.filter((x) => x.target != null).length) +
              ' origens com horizonte completo no gráfico'
            }
          />
          <Stat
            label="Eventos na avaliação 2025"
            value={pct(c.evaluationEvents / c.evaluationRows)}
            detail={
              fmt(c.evaluationEvents) + ' de ' + c.evaluationRows + ' semanas'
            }
          />
        </div>
        <div
          className="metrics-chart tall"
          role="img"
          aria-label={
            'Série semanal de ' +
            c.name +
            ', com dados disponíveis para download'
          }
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 600, height: 290 }}
          >
            <ComposedChart
              data={rows}
              margin={{ top: 12, right: 24, left: 6, bottom: 16 }}
            >
              <CartesianGrid vertical={false} stroke="#e0e8e4" />
              <XAxis
                dataKey="week"
                minTickGap={45}
                tickFormatter={(s) => date(String(s)).slice(0, 5)}
                tick={{ fontSize: 12 }}
              />
              <YAxis tickFormatter={numberTick} tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(label) => 'Origem: ' + date(String(label))}
                formatter={(value, name) => [
                  fmt(value == null ? null : Number(value)),
                  name,
                ]}
              />
              <Legend />
              <Bar
                dataKey="notifications"
                name="Notificações em t"
                fill="#96b7aa"
              />
              <Line
                dataKey="burden"
                name="Soma em t+1 a t+4"
                stroke="#145e55"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <ReferenceLine
                y={c.threshold}
                ifOverflow="extendDomain"
                stroke="#b67922"
                strokeDasharray="5 4"
                label={{
                  value: 'Q80',
                  fill: '#9b6318',
                  position: 'insideTopRight',
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="metrics-caption">
          Dados completos até {date(data.method.range.lastFullDay)}. As últimas
          quatro origens não recebem rótulo. 2026 é parcial e está fora da
          avaliação principal; linhas de dezembro podem pertencer ao expurgo.
        </p>
        <details>
          <summary>Consultar valores semanais</summary>
          <div className="metrics-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Domingo de origem</th>
                  <th>Notificações em t</th>
                  <th>Soma futura</th>
                  <th>Evento</th>
                  <th>Partição</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.week}>
                    <th>{date(x.week)}</th>
                    <td>{fmt(x.notifications)}</td>
                    <td>{fmt(x.burden)}</td>
                    <td>
                      {x.target == null
                        ? 'Horizonte incompleto'
                        : x.target
                          ? 'Sim'
                          : 'Não'}
                    </td>
                    <td>
                      {
                        {
                          development: 'Desenvolvimento',
                          evaluation: 'Avaliação',
                          purged: 'Expurgo',
                          incomplete_horizon: 'Incompleto',
                          outside_evaluation: 'Fora da avaliação',
                        }[x.split]
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="metrics-card">
        <h3>Limiares e prevalência por município</h3>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Município</th>
                <th>Limiar Q80</th>
                <th>Origens / eventos no desenvolvimento</th>
                <th>Origens / eventos em 2025</th>
                <th>Semanas com clima em 2025</th>
              </tr>
            </thead>
            <tbody>
              {data.analysis.cities.map((x) => (
                <tr key={x.id}>
                  <th>{x.name}</th>
                  <td>{fmt(x.threshold, 1)}</td>
                  <td>
                    {x.devRows} / {x.devEvents}
                    <small>{pct(x.devEvents / x.devRows)} eventos</small>
                  </td>
                  <td>
                    {x.evaluationRows} / {x.evaluationEvents}
                    <small>
                      {pct(x.evaluationEvents / x.evaluationRows)} eventos
                    </small>
                  </td>
                  <td>
                    {x.evaluationClimateRows} / {x.evaluationRows}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="metrics-caption">
          A prevalência de desenvolvimento pode superar 20% por empates no
          limiar. Clima ausente permanece uma categoria; não exclui as semanas
          da análise de WOE/IV.
        </p>
      </section>
    </>
  );
}

function WoeDetail({
  feature,
  analysis,
}: {
  feature: Feature;
  analysis: Analysis;
}) {
  const bins = feature.bins.map((b, index) => ({
    ...b,
    name: b.missing ? 'Ausente' : `Faixa ${index + 1}`,
    woeDev: b.dev.woe,
    woeEvaluation: b.evaluation.woe,
  }));
  const interval = (ci: Feature['devCI']) =>
    ci?.low == null
      ? 'Não estimado'
      : `[${fmt(ci.low, 3)}; ${fmt(ci.high, 3)}]`;
  return (
    <section
      className="metrics-card metrics-feature-detail"
      aria-labelledby="feature-heading"
    >
      <div className="metrics-card-heading">
        <div>
          <span className="metrics-eyebrow">VARIÁVEL EM DETALHE</span>
          <h3 id="feature-heading">{feature.name}</h3>
          <p>
            {feature.description} Unidade: {feature.unit}.
          </p>
        </div>
      </div>
      {feature.caveat && <Note>{feature.caveat}</Note>}
      <div className="metrics-stats compact">
        <Stat
          label="IV · desenvolvimento"
          value={fmt(feature.ivDev, 4)}
          detail={'IC 95%: ' + interval(feature.devCI)}
        />
        <Stat
          label="IV · avaliação 2025"
          value={fmt(feature.ivEvaluation, 4)}
          detail={'IC 95%: ' + interval(feature.evaluationCI)}
        />
        <Stat
          label="Mudança de distribuição · PSI"
          value={fmt(feature.psi, 4)}
          detail="Mesmos intervalos · interpretação separada do IV"
        />
        <Stat
          label="Sinais de WOE preservados"
          value={`${feature.signSame} / ${feature.signComparable}`}
          detail="Bins com ≥5 linhas e ambas as classes em cada período"
        />
      </div>
      <div
        className="metrics-chart"
        role="img"
        aria-label="WOE por intervalo, detalhado na tabela abaixo"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height: 290 }}
        >
          <BarChart
            data={bins}
            margin={{ top: 8, right: 18, left: 2, bottom: 12 }}
          >
            <CartesianGrid vertical={false} stroke="#e0e8e4" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => fmt(v == null ? null : Number(v), 4)} />
            <Legend />
            <ReferenceLine y={0} stroke="#697f75" />
            <Bar
              dataKey="woeDev"
              name="Desenvolvimento"
              fill="#176b60"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="woeEvaluation"
              name="Avaliação 2025"
              fill="#d89b46"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="metrics-caption">
        WOE positivo: maior representação de não-eventos; negativo: de eventos.
        Os valores de 2025 são diagnósticos calculados após observar os rótulos.
        Faixas numéricas usam [limite inferior; limite superior), com extremos
        abertos.
      </p>
      <div className="metrics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Intervalo</th>
              <th>N / eventos · desenvolvimento</th>
              <th>WOE dev.</th>
              <th>Parcela IV dev.</th>
              <th>N / eventos · 2025</th>
              <th>WOE 2025</th>
            </tr>
          </thead>
          <tbody>
            {feature.bins.map((b, i) => (
              <tr key={i}>
                <th>{binLabel(b)}</th>
                <td>
                  {fmt(b.dev.nonEvent + b.dev.event)} / {fmt(b.dev.event)}
                  <small>
                    {b.dev.nonEvent + b.dev.event
                      ? pct(b.dev.event / (b.dev.nonEvent + b.dev.event)) +
                        ' eventos'
                      : 'Sem observações'}
                  </small>
                </td>
                <td>{fmt(b.dev.woe, 4)}</td>
                <td>{fmt(b.dev.contribution, 4)}</td>
                <td>
                  {fmt(b.evaluation.nonEvent + b.evaluation.event)} /{' '}
                  {fmt(b.evaluation.event)}
                  <small>
                    {b.evaluation.nonEvent + b.evaluation.event
                      ? pct(
                          b.evaluation.event /
                            (b.evaluation.nonEvent + b.evaluation.event),
                        ) + ' eventos'
                      : 'Sem observações'}
                  </small>
                </td>
                <td>{fmt(b.evaluation.woe, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Estabilidade geográfica e incerteza</summary>
        <p>
          Os mesmos intervalos globais são usados em cada cidade. Uma classe
          ausente ou uma variável constante no município produz IV indisponível.
          A suavização não é usada para atribuir discriminação a uma variável
          sem variação local.
        </p>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Município</th>
                <th>IV desenvolvimento</th>
                <th>IV 2025</th>
                <th>Eventos em 2025</th>
              </tr>
            </thead>
            <tbody>
              {feature.cities?.map((c) => (
                <tr key={c.city}>
                  <th>{analysis.cities.find((x) => x.id === c.city)?.name}</th>
                  <td>{fmt(c.ivDev, 4)}</td>
                  <td>{fmt(c.ivEvaluation, 4)}</td>
                  <td>
                    {c.events} / {c.evaluationRows}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          ICs condicionais aos bins e aos limiares fixados: 500 reamostragens de
          município–ano. Desenvolvimento: {feature.devCI?.clusters ?? '—'}{' '}
          conglomerados, {feature.devCI?.valid ?? 0} réplicas válidas;
          avaliação: {feature.evaluationCI?.clusters ?? '—'} conglomerados,{' '}
          {feature.evaluationCI?.valid ?? 0} réplicas válidas. Apenas cinco
          conglomerados em 2025 limitam a precisão; os ICs não validam uso
          preditivo.
        </p>
      </details>
    </section>
  );
}

function WoeView({ data }: { data: Dataset }) {
  const [block, setBlock] = useState('Todos');
  const ordered = useMemo(
    () =>
      [...data.analysis.features].sort(
        (a, b) => (b.ivDev ?? -1) - (a.ivDev ?? -1),
      ),
    [data.analysis],
  );
  const [selected, setSelected] = useState(ordered[0].id);
  const feature = data.analysis.features.find((x) => x.id === selected)!;
  const filtered = ordered.filter(
    (x) => block === 'Todos' || x.block === block,
  );
  const secondary = data.analysis.secondary.features.find(
    (x) => x.id === selected,
  );
  return (
    <>
      <div className="metrics-section-heading">
        <div>
          <span className="metrics-eyebrow">03 / ASSOCIAÇÃO UNIVARIADA</span>
          <h2>Quais variáveis separam os eventos?</h2>
          <p>
            WOE por faixa, IV por variável e estabilidade temporal.{' '}
            {data.method.featureCount} variáveis exploratórias em seis blocos.
          </p>
        </div>
        <Download file="analytics/woe-iv.csv">Ranking · CSV</Download>
      </div>
      <Note>
        IV mede associação univariada com o alvo construído. Não é acurácia,
        causalidade nem recomendação de uso clínico. Variáveis correlacionadas
        não têm seus IVs somados. A ordenação usa o desenvolvimento; 2025 é
        avaliação diagnóstica.
      </Note>
      <div className="metrics-formula">
        WOEⱼ = ln(pⱼ,₀ / pⱼ,₁) &nbsp; · &nbsp; IV = Σⱼ(pⱼ,₀ − pⱼ,₁) · WOEⱼ
        <br />
        <small>
          pⱼ,꜀ = (nⱼ,꜀ + 0,5) / (N꜀ + 0,5 · J). Intervalos comuns ajustados no
          desenvolvimento, com categoria ausente.
        </small>
      </div>
      <section className="metrics-card">
        <div className="metrics-card-heading">
          <div>
            <h3>Ranking de variáveis</h3>
            <p>
              Selecione uma linha para examinar seus intervalos e denominadores.
            </p>
          </div>
          <label>
            Bloco
            <select value={block} onChange={(e) => setBlock(e.target.value)}>
              {['Todos', ...data.analysis.blocks.map((x) => x.name)].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="metrics-table-wrap metrics-ranking">
          <table>
            <thead>
              <tr>
                <th>Variável</th>
                <th>IV dev.</th>
                <th>IV 2025</th>
                <th>Ausentes dev. / 2025</th>
                <th>PSI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className={f.id === selected ? 'selected' : ''}>
                  <th>
                    <button
                      aria-pressed={selected === f.id}
                      onClick={() => setSelected(f.id)}
                    >
                      <small>{f.block}</small>
                      {f.name}
                    </button>
                  </th>
                  <td>
                    <b>{fmt(f.ivDev, 4)}</b>
                  </td>
                  <td>{fmt(f.ivEvaluation, 4)}</td>
                  <td>
                    {pct(f.missingDev)} / {pct(f.missingEvaluation)}
                  </td>
                  <td>{fmt(f.psi, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="metrics-caption">
          “—” indica classe ausente, variável constante/inteiramente ausente ou
          intervalos colapsados pelos critérios mínimos. Não há cortes
          universais de “bom” IV.
        </p>
      </section>
      <WoeDetail feature={feature} analysis={data.analysis} />
      <section className="metrics-card">
        <h3>Análise secundária · avaliação em 2024–2025</h3>
        <p>
          Para <b>{feature.name}</b>, bins e limiares são reajustados apenas no
          desenvolvimento anterior a 2024, com expurgo de quatro origens. O
          período de avaliação inclui 2024, ano com volume elevado de
          notificações.
        </p>
        <div className="metrics-stats compact">
          <Stat
            label="IV dev. até 2023"
            value={fmt(secondary?.ivDev, 4)}
            detail={fmt(data.analysis.secondary.devRows) + ' município-semanas'}
          />
          <Stat
            label="IV avaliação 2024–2025"
            value={fmt(secondary?.ivEvaluation, 4)}
            detail={
              fmt(data.analysis.secondary.evaluationRows) +
              ' município-semanas · sem IC secundário'
            }
          />
          <Stat
            label="PSI secundário"
            value={fmt(secondary?.psi, 4)}
            detail="Mudança de distribuição neste novo corte"
          />
        </div>
      </section>
      <section className="metrics-card">
        <h3>Resumo por bloco</h3>
        <p>
          Mediana e máximo entre variáveis estimáveis, sem somar evidências
          correlacionadas.
        </p>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bloco</th>
                <th>Estimáveis / candidatas</th>
                <th>IV mediano dev.</th>
                <th>IV máximo dev.</th>
                <th>IV mediano 2025</th>
                <th>IV máximo 2025</th>
              </tr>
            </thead>
            <tbody>
              {data.analysis.blocks.map((x) => (
                <tr key={x.name}>
                  <th>{x.name}</th>
                  <td>
                    {x.estimated} / {x.features}
                  </td>
                  <td>{fmt(x.medianDev, 4)}</td>
                  <td>{fmt(x.maxDev, 4)}</td>
                  <td>{fmt(x.medianEvaluation, 4)}</td>
                  <td>{fmt(x.maxEvaluation, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MethodView({ data }: { data: Dataset }) {
  const { method, quality } = data;
  return (
    <>
      <div className="metrics-section-heading">
        <div>
          <span className="metrics-eyebrow">04 / RASTREABILIDADE</span>
          <h2>Como interpretar e reproduzir</h2>
          <p>
            Adaptação metodológica do manuscrito à carga efetivamente
            disponível.
          </p>
        </div>
        <Download file="research/VIGIAR_Relatorio_Metricas_Artigo.pdf">
          Relatório · PDF
        </Download>
      </div>
      <section className="metrics-card">
        <h3>Referência e escopo</h3>
        <p>
          <em>{method.paper.title}</em>
        </p>
        <p>{method.paper.status}</p>
        <Note>
          O histórico disponível começa em 2021. Esta edição calcula métricas
          novas e documenta as diferenças; não é uma reprodução exata dos
          resultados preliminares do artigo.
        </Note>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tema</th>
                <th>No manuscrito</th>
                <th>Nesta edição</th>
              </tr>
            </thead>
            <tbody>
              {method.differences.map((x) => (
                <tr key={x.topic}>
                  <th>{x.topic}</th>
                  <td>{x.paper}</td>
                  <td>{x.edition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="metrics-card">
        <h3>Protocolo da análise</h3>
        <ol className="metrics-protocol">
          {method.protocol.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>
      <section className="metrics-card">
        <h3>Arquivos para revisão</h3>
        <div className="metrics-download-grid">
          <Download file="research/VIGIAR_Relatorio_Metricas_Artigo.pdf">
            Relatório completo · PDF
          </Download>
          <Download file="research/VIGIAR_Relatorio_Metricas_Artigo.md">
            Relatório · Markdown
          </Download>
          <Download file="analytics/municipality-week.csv">
            Município–semana · CSV
          </Download>
          <Download file="analytics/woe-iv.csv">Ranking WOE/IV · CSV</Download>
          <Download file="analytics/completeness.csv">
            Completude · CSV
          </Download>
          <Download file="analytics/analysis.json">
            Bins, ICs e avaliação · JSON
          </Download>
          <Download file="analytics/quality.json">
            Qualidade e funil · JSON
          </Download>
          <Download file="analytics/method.json">
            Método e proveniência · JSON
          </Download>
          <Download file="analytics/manifest.json">
            Hashes dos agregados · JSON
          </Download>
        </div>
        <p className="metrics-caption">
          Downloads públicos contêm agregados municipais e metadados. O PDF do
          manuscrito e os microdados não fazem parte desta publicação.
        </p>
        <a
          className="metrics-repo-link"
          href="https://github.com/gbmalta/vigiar-web"
          target="_blank"
          rel="noreferrer"
        >
          Código, testes e GitHub Actions <ArrowUpRight size={16} />
        </a>
      </section>
      <section className="metrics-card">
        <h3>Inventário do snapshot Gold</h3>
        <div className="metrics-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fonte</th>
                <th>Linhas físicas</th>
                <th>Colunas</th>
                <th>Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {quality.inventory.map((x) => (
                <tr key={x.table}>
                  <th>{x.table}</th>
                  <td>{fmt(x.rows)}</td>
                  <td>{x.columns}</td>
                  <td>{x.files}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="metrics-caption">
          Fontes têm granularidades diferentes. O fato de notificações deriva do
          SINAN: somá-los duplicaria a contagem de eventos. A dimensão municipal
          usa chave composta.
        </p>
        <details>
          <summary>Hashes e identidade dos arquivos de origem</summary>
          <p>
            Execução: <code>{method.runId}</code>. SHA-256 do manuscrito:{' '}
            <code>{method.paper.sha256}</code>.
          </p>
          <div className="metrics-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Bytes</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {method.sources.map((x) => (
                  <tr key={x.file}>
                    <th>{x.file}</th>
                    <td>{fmt(x.bytes)}</td>
                    <td className="metrics-hash">{x.sha256}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}

export default function ArticleMetrics() {
  const [section, setSection] = useState<Section>('quality');
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError('');
    Promise.all(
      ['method', 'quality', 'analysis', 'panel'].map(async (name) => {
        const response = await fetch(assetUrl(`analytics/${name}.json`), {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`Falha ao carregar ${name}: HTTP ${response.status}`);
        return response.json();
      }),
    )
      .then(([method, quality, analysis, panel]) => {
        if (active) setData({ method, quality, analysis, panel });
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Falha ao carregar os agregados.',
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  useEffect(() => {
    document.title = 'Métricas do artigo · VIGIAR';
    return () => {
      document.title = 'VIGIAR · Observatório territorial';
    };
  }, []);
  return (
    <main className="metrics-app">
      <a
        className="metrics-skip"
        href="#metrics-content"
        onClick={(e) => {
          e.preventDefault();
          const content = document.getElementById('metrics-content');
          content?.focus({ preventScroll: true });
          content?.scrollIntoView({ block: 'start' });
        }}
      >
        Pular para o conteúdo
      </a>
      <header className="metrics-header">
        <a className="metrics-brand" href="#mapa">
          <span>
            <Activity size={23} />
          </span>
          <div>
            <strong>VIGIAR</strong>
            <small>Observatório territorial</small>
          </div>
        </a>
        <a className="metrics-back" href="#mapa">
          <ArrowLeft size={17} />
          Voltar ao mapa
        </a>
      </header>
      <div className="metrics-intro">
        <div className="metrics-intro-text">
          <span className="metrics-eyebrow">
            <FileText size={15} /> CADERNO DE EVIDÊNCIAS
          </span>
          <h1>Da base aos indicadores.</h1>
          <p>
            Qualidade, integração e associação com a carga futura de dengue. Uma
            leitura transparente dos dados que sustentam o observatório.
          </p>
        </div>
        <div className="metrics-edition">
          <Database size={20} />
          <div>
            <b>2021–2026</b>
            <span>Snapshot validado · análise retrospectiva</span>
            <small>Desenvolvimento 2021–2024 · avaliação 2025</small>
          </div>
        </div>
      </div>
      <nav className="metrics-nav" aria-label="Seções das métricas">
        {sectionNames.map(([id, name]) => (
          <button
            key={id}
            aria-current={id === section ? 'page' : undefined}
            onClick={() => {
              setSection(id);
              document
                .getElementById('metrics-content')
                ?.scrollIntoView({ block: 'start' });
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <div id="metrics-content" tabIndex={-1} className="metrics-content">
        {error ? (
          <div className="metrics-card" role="alert">
            <h2>Não foi possível carregar os indicadores</h2>
            <p>{error}</p>
            <button
              className="metrics-download"
              onClick={() => setAttempt((a) => a + 1)}
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
          </div>
        ) : !data ? (
          <div className="metrics-loading" role="status">
            <ChartNoAxesCombined />
            Carregando os agregados verificados…
          </div>
        ) : section === 'quality' ? (
          <QualityView data={data} />
        ) : section === 'target' ? (
          <TargetView data={data} />
        ) : section === 'woe' ? (
          <WoeView data={data} />
        ) : (
          <MethodView data={data} />
        )}
      </div>
      <footer className="metrics-footer">
        <span>VIGIAR · Métricas do manuscrito</span>
        <span>
          {data
            ? 'Dados até ' +
              date(data.method.range.max) +
              ' · ' +
              data.method.runId
            : 'Carregando proveniência'}
        </span>
        <a
          href="https://github.com/gbmalta/vigiar-web/actions"
          target="_blank"
          rel="noreferrer"
        >
          Verificações de publicação <ArrowUpRight size={14} />
        </a>
      </footer>
    </main>
  );
}
