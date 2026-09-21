import type { City } from './data';

export type ClimateWeek = {
  date: string;
  temperature: number | null;
  precipitation: number | null;
};
export type HistoryWeek = ClimateWeek & { notifications: number };
export type InferenceBundle = {
  sourceRun: string;
  sourceVersion: string;
  dates: string[];
  cities: City[];
  history: Record<string, HistoryWeek[]>;
  parameters: {
    numericFeatures: string[];
    medians: number[];
    missingIndicators: number[];
    means: number[];
    scales: number[];
    categories: string[];
    coefficients: number[];
    intercept: number;
    gamma: number;
    activityThresholds: Record<string, number>;
  };
};
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

export function historicalInput(
  bundle: InferenceBundle,
  city: string,
  date: string,
) {
  if (!bundle.dates.includes(date) || !bundle.history[city])
    throw new Error('Escolha um município e uma semana disponíveis.');
  const rows = bundle.history[city];
  const index = rows.findIndex((r) => r.date === date);
  if (index < 52)
    throw new Error(
      'Histórico insuficiente: são necessárias 53 semanas de notificações.',
    );
  const history = rows.slice(index - 52, index + 1);
  if (history.some((r, i) => r.date !== addDays(date, (i - 52) * 7)))
    throw new Error('Há semanas ausentes no histórico.');
  return {
    counts: history.map((r) => r.notifications),
    climate: rows
      .slice(index - 8, index)
      .map((r) => ({
        date: r.date,
        temperature: r.temperature,
        precipitation: r.precipitation,
      })),
  };
}

export function predict(
  bundle: InferenceBundle,
  city: string,
  date: string,
  counts: number[],
  climate: ClimateWeek[],
) {
  const p = bundle.parameters;
  if (!p.categories.includes(city))
    throw new Error('Município não contemplado no modelo.');
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).getUTCDay() !== 0 ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  )
    throw new Error('A semana de referência deve começar em um domingo.');
  if (
    counts.length !== 53 ||
    counts.some((v) => !Number.isSafeInteger(v) || v < 0)
  )
    throw new Error(
      'Preencha as 53 semanas com notificações inteiras, iguais ou maiores que zero.',
    );
  if (
    climate.length !== 8 ||
    climate.some((r, i) => r.date !== addDays(date, (i - 8) * 7))
  )
    throw new Error(
      'O clima deve cobrir as oito semanas anteriores à referência.',
    );
  if (
    climate.some(
      (r) =>
        r.temperature !== null &&
        (!Number.isFinite(r.temperature) ||
          r.temperature < -90 ||
          r.temperature > 65),
    )
  )
    throw new Error(
      'Informe temperaturas entre −90 e 65 °C, ou deixe em branco para dado ausente.',
    );
  if (
    climate.some(
      (r) =>
        r.precipitation !== null &&
        (!Number.isFinite(r.precipitation) || r.precipitation < 0),
    )
  )
    throw new Error(
      'Informe precipitação igual ou maior que zero, ou deixe em branco para dado ausente.',
    );
  const features: Record<string, number | null> = {};
  for (const lag of [0, 1, 2, 3, 4, 8, 12, 52])
    features[`log_lag${lag}`] = Math.log1p(counts[52 - lag]);
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  for (const window of [4, 8, 13])
    features[`log_mean${window}`] = Math.log1p(
      sum(counts.slice(-window)) / window,
    );
  const start = addDays(date, 7);
  const dayOfYear =
    (Date.parse(`${start}T00:00:00Z`) -
      Date.parse(`${start.slice(0, 4)}-01-01T00:00:00Z`)) /
      86400000 +
    1;
  features.season_sin = Math.sin((2 * Math.PI * dayOfYear) / 365.2425);
  features.season_cos = Math.cos((2 * Math.PI * dayOfYear) / 365.2425);
  for (const window of [4, 8]) {
    const temps = climate.slice(-window).map((r) => r.temperature);
    const rain = climate.slice(-window).map((r) => r.precipitation);
    features[`climate_temp_mean${window}`] = temps.includes(null)
      ? null
      : sum(temps as number[]) / window;
    features[`climate_rain_sum${window}`] = rain.includes(null)
      ? null
      : sum(rain as number[]);
  }
  const raw = p.numericFeatures.map((name) => features[name]);
  const imputed = raw.map((v, i) => (v === null ? p.medians[i] : v));
  const numeric = [
    ...imputed,
    ...p.missingIndicators.map((index) => (raw[index] === null ? 1 : 0)),
  ];
  const encoded = [
    ...numeric.map((v, i) => (v - p.means[i]) / p.scales[i]),
    ...p.categories.map((c) => (c === city ? 1 : 0)),
  ];
  const contributions = encoded.map((v, i) => v * p.coefficients[i]);
  const linear = p.intercept + sum(contributions);
  const base = Math.max(1, 4 * counts[52]);
  const activity = sum(counts.slice(-4));
  const threshold = p.activityThresholds[city];
  const lowActivity = activity <= threshold;
  const gamma = lowActivity ? p.gamma : 1;
  const prediction = base * Math.exp(gamma * linear);
  if (
    !Number.isFinite(prediction) ||
    prediction <= 0 ||
    prediction > Number.MAX_SAFE_INTEGER
  )
    throw new Error(
      'Este cenário ultrapassa a faixa numérica de cálculo. Revise as entradas.',
    );
  return {
    prediction,
    features,
    imputed,
    base,
    activity,
    threshold,
    lowActivity,
    gamma,
    linear,
    start,
    end: addDays(date, 34),
    imputedFeatures: p.numericFeatures.filter((_, i) => raw[i] === null),
  };
}
