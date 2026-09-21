import { useEffect, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { assetUrl } from '@/lib/asset-url';
import { date as formatDate, number } from './data';
import { addDays, historicalInput, predict } from './inference';
import type { ClimateWeek, InferenceBundle } from './inference';

const decimal = (v: number, digits = 2) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: digits });
const inputNumber = (value: string) => (value === '' ? NaN : Number(value));
const inputClimate = (value: string) => (value === '' ? null : Number(value));

function ScenarioChart({
  counts,
  week,
  prediction,
  original,
  edited,
}: {
  counts: number[];
  week: string;
  prediction: number;
  original: number;
  edited: boolean;
}) {
  // Historical and future values are all four-week totals, not weekly forecasts.
  const totals = Array.from({ length: 13 }, (_, i) =>
    counts.slice(37 + i, 41 + i).reduce((a, b) => a + b, 0),
  );
  const max = Math.max(1, ...totals, prediction, original) * 1.14;
  const x = (i: number) => 54 + i * 28;
  const y = (value: number) => 202 - (value / max) * 164;
  const endX = x(16);
  const line = totals
    .map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`)
    .join(' ');
  return (
    <figure className="hm-lab-chart">
      <svg
        viewBox="0 0 556 254"
        role="img"
        aria-label={`Histórico de totais em quatro semanas e previsão de ${number(prediction)} notificações entre ${formatDate(addDays(week, 7))} e ${formatDate(addDays(week, 34))}.`}
      >
        <rect
          x={x(12) + 8}
          y="28"
          width={endX - x(12) + 12}
          height="174"
          fill="var(--hm-teal-pale, #edf8f6)"
        />
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1="54"
              x2="522"
              y1={y(max * fraction)}
              y2={y(max * fraction)}
              stroke="#dce4e9"
              strokeDasharray="3 4"
            />
            <text x="45" y={y(max * fraction) + 4} textAnchor="end">
              {number(max * fraction)}
            </text>
          </g>
        ))}
        <text x="54" y="15">
          Notificações · total em 4 semanas
        </text>
        <path d={line} stroke="#83949c" fill="none" strokeWidth="2.3" />
        {totals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#83949c">
            <title>
              {formatDate(addDays(week, (i - 12) * 7 + 6))}: {number(v)} nas
              quatro semanas encerradas
            </title>
          </circle>
        ))}
        <path
          d={`M ${x(12)} ${y(totals[12])} L ${endX} ${y(prediction)}`}
          fill="none"
          stroke="#087f73"
          strokeWidth="2.5"
          strokeDasharray="5 5"
        />
        {edited && (
          <circle
            cx={endX}
            cy={y(original)}
            r="5"
            fill="white"
            stroke="#8b9aa3"
            strokeWidth="1.5"
          >
            <title>Modelo com entradas originais: {decimal(original)}</title>
          </circle>
        )}
        <circle cx={endX} cy={y(prediction)} r="6" fill="#087f73">
          <title>Previsão do cenário: {decimal(prediction)}</title>
        </circle>
        <text x={x(0)} y="222">
          {formatDate(addDays(week, -84 + 6), false)}
        </text>
        <text x={x(12)} y="222" textAnchor="middle">
          {formatDate(addDays(week, 6), false)}
        </text>
        <text x={endX} y="222" textAnchor="middle">
          {formatDate(addDays(week, 34), false)}
        </text>
        <text x={endX - 44} y="244" textAnchor="middle" fill="#087f73">
          Próximas 4 semanas
        </text>
      </svg>
      <figcaption>
        <span>— {edited ? 'Histórico do cenário' : 'Histórico observado'}</span>
        <span className="hm-lab-legend-prediction">┄ Predição</span>
        {edited && <span>○ Modelo com dados originais</span>}
      </figcaption>
      <p>
        Um único total para a janela futura. O segmento tracejado conecta esse
        total ao histórico; não indica previsões semanais.
      </p>
    </figure>
  );
}

function Scenario({
  bundle,
  city,
  week,
}: {
  bundle: InferenceBundle;
  city: string;
  week: string;
}) {
  const original = historicalInput(bundle, city, week);
  const [counts, setCounts] = useState(original.counts);
  const [climate, setClimate] = useState(original.climate);
  const [resetNotice, setResetNotice] = useState('');
  const originalResult = predict(
    bundle,
    city,
    week,
    original.counts,
    original.climate,
  );
  const edited =
    counts.some((v, i) => v !== original.counts[i]) ||
    climate.some(
      (r, i) =>
        r.temperature !== original.climate[i].temperature ||
        r.precipitation !== original.climate[i].precipitation,
    );
  let result: ReturnType<typeof predict> | undefined;
  let error = '';
  try {
    result = predict(bundle, city, week, counts, climate);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Revise as entradas.';
  }
  function updateCount(index: number, value: string) {
    setCounts((previous) =>
      previous.map((v, i) => (i === index ? inputNumber(value) : v)),
    );
    setResetNotice('');
  }
  function updateClimate(
    index: number,
    key: 'temperature' | 'precipitation',
    value: string,
  ) {
    setClimate((previous) =>
      previous.map((r, i) =>
        i === index ? { ...r, [key]: inputClimate(value) } : r,
      ),
    );
    setResetNotice('');
  }
  const latestClimate = climate[7];
  const numValue = (value: number) => (Number.isFinite(value) ? value : '');
  return (
    <>
      <div className="hm-lab-workspace">
        <div className="hm-lab-inputs">
          <label htmlFor="lab-notifications">
            Notificações na semana de referência
            <span>
              {formatDate(week)} – {formatDate(addDays(week, 6))}
            </span>
          </label>
          <div className="hm-lab-number">
            <input
              id="lab-notifications"
              type="number"
              min="0"
              step="1"
              value={numValue(counts[52])}
              onChange={(e) => updateCount(52, e.target.value)}
              aria-describedby={error ? 'lab-error' : undefined}
            />
            <span>notificações</span>
          </div>
          <p className="hm-lab-input-note">
            As 52 semanas anteriores são carregadas do município e da data
            selecionados.
          </p>
          <div className="hm-lab-climate-heading">
            <strong>Clima da semana anterior</strong>
            <span>
              {formatDate(latestClimate.date)} –{' '}
              {formatDate(addDays(latestClimate.date, 6))}
            </span>
          </div>
          <div className="hm-lab-climate-inputs">
            <label>
              Temperatura média (°C)
              <input
                type="number"
                min="-90"
                max="65"
                step="any"
                value={latestClimate.temperature ?? ''}
                onChange={(e) =>
                  updateClimate(7, 'temperature', e.target.value)
                }
              />
            </label>
            <label>
              Precipitação acumulada (mm)
              <input
                type="number"
                min="0"
                step="any"
                value={latestClimate.precipitation ?? ''}
                onChange={(e) =>
                  updateClimate(7, 'precipitation', e.target.value)
                }
              />
            </label>
          </div>
          <p className="hm-lab-input-note">
            O modelo usa clima até a semana anterior, em janelas de 4 e 8
            semanas. Um campo climático vazio aciona a imputação aprendida no
            treino.
          </p>
          <button
            className="hm-lab-reset"
            onClick={() => {
              setCounts(original.counts);
              setClimate(original.climate);
              setResetNotice('Entradas originais restauradas.');
            }}
          >
            <RotateCcw size={14} /> Restaurar dados do exemplo
          </button>
          <span className="hm-lab-feedback" role="status">
            {resetNotice}
          </span>
        </div>
        <div className="hm-lab-output">
          <div className="hm-lab-output-heading">
            <span className="hm-section-label">
              {edited ? 'CENÁRIO EDITADO' : 'EXEMPLO HISTÓRICO'}
            </span>
            <span>Inferência local · v44</span>
          </div>
          {result ? (
            <>
              <div
                className="hm-lab-result"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <strong>{number(result.prediction)}</strong>
                <span>
                  notificações previstas
                  <br />
                  {formatDate(result.start)} – {formatDate(result.end)}
                </span>
              </div>
              {edited && (
                <p className="hm-lab-comparison">
                  Com as entradas originais:{' '}
                  <strong>{number(originalResult.prediction)}</strong>.
                  Diferença do cenário:{' '}
                  <strong>
                    {result.prediction >= originalResult.prediction ? '+' : '−'}
                    {number(
                      Math.abs(result.prediction - originalResult.prediction),
                    )}
                  </strong>{' '}
                  notificações.
                </p>
              )}
              <ScenarioChart
                counts={counts}
                week={week}
                prediction={result.prediction}
                original={originalResult.prediction}
                edited={edited}
              />
            </>
          ) : (
            <p id="lab-error" className="hm-lab-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <details className="hm-lab-detail">
        <summary>
          Editar histórico de entrada{' '}
          <span>53 semanas de notificações · 8 de clima</span>
        </summary>
        <p>
          Altere valores semanais; defasagens, médias móveis e acumulados são
          recalculados. As semanas que não entram diretamente nas 18 variáveis
          são mantidas para contextualizar o histórico. Mudar o município ou a
          data carrega outro exemplo e descarta as edições.
        </p>
        <div className="hm-lab-history-grid">
          <div
            className="hm-lab-history-table"
            tabIndex={0}
            role="region"
            aria-label="Histórico editável de notificações"
          >
            <table>
              <caption>Notificações · semanas iniciadas em</caption>
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Notificações</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((count, index) => {
                  const date = addDays(week, (index - 52) * 7);
                  return (
                    <tr key={date}>
                      <th scope="row">
                        {formatDate(date)}
                        {index === 52 && <small>Referência</small>}
                        {index === 0 && <small>52 semanas atrás</small>}
                      </th>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`Notificações em ${formatDate(date)}`}
                          value={numValue(count)}
                          onChange={(e) => updateCount(index, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className="hm-lab-history-table"
            tabIndex={0}
            role="region"
            aria-label="Histórico editável de clima"
          >
            <table>
              <caption>Clima · semanas iniciadas em</caption>
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>°C · média</th>
                  <th>mm · total</th>
                </tr>
              </thead>
              <tbody>
                {climate.map((r: ClimateWeek, index) => (
                  <tr key={r.date}>
                    <th scope="row">{formatDate(r.date)}</th>
                    <td>
                      <input
                        type="number"
                        min="-90"
                        max="65"
                        step="any"
                        aria-label={`Temperatura em ${formatDate(r.date)}`}
                        value={r.temperature ?? ''}
                        onChange={(e) =>
                          updateClimate(index, 'temperature', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Precipitação em ${formatDate(r.date)}`}
                        value={r.precipitation ?? ''}
                        onChange={(e) =>
                          updateClimate(index, 'precipitation', e.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <details className="hm-lab-detail">
        <summary>
          Ver variáveis calculadas e cálculo do modelo <span>18 atributos</span>
        </summary>
        {result ? (
          <>
            <div className="hm-lab-calculation">
              <span>
                Base <strong>{decimal(result.base)}</strong>
              </span>
              <span>
                Atividade nas últimas 4 semanas{' '}
                <strong>{number(result.activity)}</strong>
              </span>
              <span>
                Limiar do município <strong>{number(result.threshold)}</strong>
              </span>
              <span>
                Intensidade da correção <strong>{decimal(result.gamma)}</strong>
              </span>
            </div>
            <p className="hm-lab-formula">
              ŷ = {decimal(result.base)} × exp({decimal(result.gamma)} ×{' '}
              {decimal(result.linear, 6)}) ={' '}
              <strong>{decimal(result.prediction, 4)}</strong>
            </p>
            <p>
              {result.lowActivity
                ? 'A atividade está até o limiar aprendido no treino: o modelo reduz a correção pela metade.'
                : 'A atividade está acima do limiar aprendido no treino: o modelo aplica a correção integral.'}{' '}
              {result.imputedFeatures.length > 0 &&
                `Mediana do treino aplicada a: ${result.imputedFeatures.join(', ')}.`}
            </p>
            <div className="hm-lab-feature-values">
              <dl>
                {bundle.parameters.numericFeatures.map((name, i) => (
                  <div key={name}>
                    <dt>
                      <code>{name}</code>
                    </dt>
                    <dd>
                      {result.features[name] === null
                        ? `Ausente → ${decimal(result.imputed[i], 4)}`
                        : decimal(result.features[name]!, 4)}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>
                    <code>city</code>
                  </dt>
                  <dd>
                    {bundle.cities.find((c) => c.id === city)?.name} · {city}
                  </dd>
                </div>
              </dl>
            </div>
            <p>
              Os valores numéricos passam pela imputação e padronização do
              treino; município usa one-hot encoding. Coeficientes, intercepto,
              médias, escalas e limiares são os mesmos do modelo congelado.
            </p>
          </>
        ) : (
          <p>Corrija as entradas para calcular as variáveis.</p>
        )}
      </details>
    </>
  );
}

export default function PredictionLab() {
  const [bundle, setBundle] = useState<InferenceBundle | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [city, setCity] = useState('3304557');
  const [week, setWeek] = useState('2024-06-30');
  useEffect(() => {
    const controller = new AbortController();
    fetch(assetUrl('health-meeting/inference.json'), {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error('Modelo indisponível');
        return r.json();
      })
      .then(setBundle)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section className="hm-lab" aria-labelledby="lab-heading">
      <div className="hm-lab-heading">
        <div>
          <span className="hm-section-label">MODELO INTERATIVO</span>
          <h2 id="lab-heading">Simular uma predição</h2>
        </div>
        <SlidersHorizontal size={22} aria-hidden="true" />
      </div>
      <p>
        Escolha um município e uma semana de 2024–2025. Edite notificações e
        clima para calcular um cenário com o modelo real; o histórico necessário
        é preenchido automaticamente.
      </p>
      {error ? (
        <p role="alert">
          Não foi possível carregar o modelo.{' '}
          <button
            className="hm-lab-reset"
            onClick={() => {
              setError(false);
              setAttempt((v) => v + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      ) : !bundle ? (
        <p role="status">Carregando modelo e histórico…</p>
      ) : (
        <>
          <div className="hm-lab-selectors">
            <label>
              Município do exemplo
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                {bundle.cities.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name} · {c.uf}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Semana de referência do exemplo
              <select value={week} onChange={(e) => setWeek(e.target.value)}>
                {bundle.dates.map((date) => (
                  <option value={date} key={date}>
                    {formatDate(date)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Scenario
            key={`${city}:${week}`}
            bundle={bundle}
            city={city}
            week={week}
          />
          <p className="hm-lab-source">
            Cenário exploratório com pesos fixos de {bundle.sourceVersion}. As
            alterações mostram a resposta do modelo, não efeitos causais nem uma
            previsão operacional atual. Dados históricos consolidados e
            reanálise ERA5; a disponibilidade original não foi reconstruída.
            Cálculo no navegador, sem envio das entradas.{' '}
            <a href={assetUrl('health-meeting/inference.json')} download>
              Parâmetros e histórico (JSON) ↓
            </a>
          </p>
        </>
      )}
    </section>
  );
}
