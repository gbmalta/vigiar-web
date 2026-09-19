export type Prediction = {
  city: string;
  week: string;
  origin: string;
  start: string;
  end: string;
  observed: number;
  predicted: number;
  baseline: number;
};
export type City = {
  id: string;
  name: string;
  uf: string;
  lat: number;
  lng: number;
};
export type MeetingData = {
  schemaVersion: number;
  sourceRun: string;
  sourceVersion: string;
  evaluatedAt: string;
  sourceHash: string;
  model: string;
  horizonWeeks: number;
  retrospective: boolean;
  previouslyExplored: boolean;
  intervalAvailable: boolean;
  cities: City[];
  predictions: Prediction[];
};
export const number = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
export const date = (value: string, year = true) =>
  new Date(value + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(year ? { year: 'numeric' } : {}),
  });
export function change(row: Prediction) {
  return row.baseline === 0 ? null : (row.predicted / row.baseline - 1) * 100;
}
export function trend(row: Prediction) {
  const delta = change(row);
  return delta === null
    ? 'Sem base'
    : delta > 20
      ? 'Alta'
      : delta < -20
        ? 'Queda'
        : 'Estável';
}
export const colors: Record<string, string> = {
  Alta: '#bd692d',
  Queda: '#387f94',
  Estável: '#398675',
  'Sem base': '#78848b',
};
export function metrics(rows: Prediction[]) {
  const absoluteError = rows.reduce(
    (s, r) => s + Math.abs(r.predicted - r.observed),
    0,
  );
  const observed = rows.reduce((s, r) => s + r.observed, 0);
  const baselineError = rows.reduce(
    (s, r) => s + Math.abs(r.baseline - r.observed),
    0,
  );
  return {
    mae: rows.length ? absoluteError / rows.length : null,
    wape: observed ? (absoluteError / observed) * 100 : null,
    gain: baselineError ? (1 - absoluteError / baselineError) * 100 : null,
  };
}
