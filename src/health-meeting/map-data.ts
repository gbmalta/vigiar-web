import type { FeatureCollection, Geometry } from 'geojson';
import type { Prediction } from './data';

export type Region = {
  id: string;
  name: string;
  city: string;
  ivs: number | null;
  idhm: number | null;
  income: number | null;
  cnes: number | null;
};
export type Regions = FeatureCollection<Geometry, Region>;
export type RegionMetric = 'ivs' | 'idhm' | 'income' | 'cnes';
export const regionMetrics = {
  ivs: {
    label: 'Vulnerabilidade · IVS',
    reference: '2010',
    thresholds: [0.2, 0.3, 0.4, 0.5],
    colors: ['#d9ece3', '#aacdbb', '#72a792', '#d2ad72', '#af6b42'],
  },
  idhm: {
    label: 'Desenvolvimento · IDHM',
    reference: '2010',
    thresholds: [0.5, 0.6, 0.7, 0.8],
    colors: ['#e0ece8', '#b8d6c9', '#8bbaa5', '#548c73', '#245c46'],
  },
  income: {
    label: 'Renda per capita',
    reference: '2010 · R$',
    thresholds: [500, 1000, 1500, 2500],
    colors: ['#e0ece8', '#b8d6c9', '#8bbaa5', '#548c73', '#245c46'],
  },
  cnes: {
    label: 'Estabelecimentos vinculados',
    reference: 'jul/2026 · CNES',
    thresholds: [1, 5, 10, 50],
    colors: ['#e0ece8', '#b8d6c9', '#8bbaa5', '#548c73', '#245c46'],
  },
} as const;
export function regionColor(region: Region, metric: RegionMetric) {
  const value = region[metric];
  if (value === null) return '#c4c9c6';
  const config = regionMetrics[metric];
  return config.colors[config.thresholds.filter((t) => value >= t).length];
}
export function historyWindow(
  predictions: Prediction[],
  city: string,
  week: string,
) {
  return predictions
    .filter((r) => r.city === city && r.week <= week)
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-26);
}
/** A shared zero-based vertical scale for the two lines, local to each city. */
export function sparkline(series: Prediction[], width = 128, height = 34) {
  const max = Math.max(1, ...series.flatMap((r) => [r.predicted, r.observed]));
  const point = (i: number, value: number) => ({
    x: 3 + (i / Math.max(1, series.length - 1)) * (width - 6),
    y: height - 3 - (value / max) * (height - 6),
  });
  const path = (key: 'predicted' | 'observed') =>
    series
      .map((r, i) => {
        const p = point(i, r[key]);
        return `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      })
      .join(' ');
  return {
    max,
    predicted: path('predicted'),
    observed: path('observed'),
    predictedEnd: series.length
      ? point(series.length - 1, series.at(-1)!.predicted)
      : null,
    observedEnd: series.length
      ? point(series.length - 1, series.at(-1)!.observed)
      : null,
  };
}
export type MapPoint = { id: string; x: number; y: number };
/** Place cards near their true map coordinates, avoiding overlap when space permits. */
export function placeCards(
  points: MapPoint[],
  width: number,
  height: number,
  cardWidth: number,
  cardHeight: number,
) {
  const placed: (MapPoint & { left: number; top: number })[] = [];
  for (const p of points) {
    const xs = [
      -cardWidth - 20,
      -cardWidth / 2,
      20,
      cardWidth + 20,
      ...placed.flatMap((r) => [
        r.left - cardWidth - 12 - p.x,
        r.left + cardWidth + 12 - p.x,
      ]),
    ];
    const ys = [
      -2 * cardHeight - 30,
      -cardHeight - 16,
      -cardHeight / 2,
      20,
      cardHeight + 30,
      ...placed.flatMap((r) => [
        r.top - cardHeight - 12 - p.y,
        r.top + cardHeight + 12 - p.y,
      ]),
    ];
    const candidates = xs.flatMap((x) => ys.map((y) => [x, y]));
    let best = { left: 8, top: 8, cost: Infinity };
    for (const [dx, dy] of candidates) {
      const left = Math.max(8, Math.min(width - cardWidth - 8, p.x + dx));
      const top = Math.max(8, Math.min(height - cardHeight - 8, p.y + dy));
      const overlap = placed.reduce(
        (sum, r) =>
          sum +
          Math.max(
            0,
            Math.min(left + cardWidth + 5, r.left + cardWidth + 5) -
              Math.max(left - 5, r.left - 5),
          ) *
            Math.max(
              0,
              Math.min(top + cardHeight + 5, r.top + cardHeight + 5) -
                Math.max(top - 5, r.top - 5),
            ),
        0,
      );
      const coveredPoints = points.filter(
        (point) =>
          point.x > left - 15 &&
          point.x < left + cardWidth + 15 &&
          point.y > top - 15 &&
          point.y < top + cardHeight + 15,
      ).length;
      const cost =
        overlap * 1000 +
        coveredPoints * 10000 +
        Math.hypot(left + cardWidth / 2 - p.x, top + cardHeight / 2 - p.y);
      if (cost < best.cost) best = { left, top, cost };
    }
    placed.push({ ...p, left: best.left, top: best.top });
  }
  return placed;
}
