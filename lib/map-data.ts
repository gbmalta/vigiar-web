import { assetUrl } from '@/lib/asset-url';

export type City = {
  id: string;
  name: string;
  uf: string;
  lat: number;
  lng: number;
};
export type Layer = 'notifications' | 'temperature' | 'rain' | 'cnes' | 'udh';
export type Annual = {
  total: number;
  mapped: number;
  unmapped: number;
  municipalities: number;
  min: string;
  max: string;
};
export type Metadata = {
  builtAt: string;
  runId: string;
  sourcePrefix: string;
  years: number[];
  annual: Record<string, Annual>;
  climate: Record<
    string,
    { municipalities: number; min: string; max: string; weeks: number }
  >;
  study: string[];
  udhCounts: Record<string, number>;
  cnes: { reference: string; total: number; mapped: number; linked: number };
  udhReference: number;
  outsideYears: number;
  verifiedFiles: number;
};
export const formatNumber = (v: number) =>
  new Intl.NumberFormat('pt-BR').format(v);
export const formatDate = (v: string) =>
  new Date(v + 'T12:00:00').toLocaleDateString('pt-BR');
const cache = new Map<string, Promise<unknown>>();
export function getJSON<T>(name: string): Promise<T> {
  if (!cache.has(name))
    cache.set(
      name,
      fetch(assetUrl('data/' + name))
        .then((r) => {
          if (!r.ok) throw new Error('Não foi possível ler ' + name);
          return r.json();
        })
        .catch((e) => {
          cache.delete(name);
          throw e;
        }),
    );
  return cache.get(name) as Promise<T>;
}
export function colorFor(value: number, layer: Layer) {
  const palette =
    layer === 'temperature'
      ? ['#4b7bba', '#44a6a1', '#e6ba66', '#db7438', '#a53125']
      : layer === 'rain'
        ? ['#d9e9ef', '#84c2cf', '#3898ad', '#22678d', '#18334f']
        : layer === 'udh'
          ? ['#359a8c', '#79b8a1', '#e5c867', '#d9854b', '#b84c45']
          : ['#80b6b0', '#41968e', '#18746e', '#155851', '#e6a147'];
  const thresholds =
    layer === 'temperature'
      ? [15, 20, 25, 28]
      : layer === 'rain'
        ? [500, 1000, 1500, 2500]
        : layer === 'udh'
          ? [0.2, 0.3, 0.4, 0.5]
          : layer === 'cnes'
            ? [20, 100, 500, 2000]
            : [10, 100, 1000, 10000];
  return palette[thresholds.filter((t) => value >= t).length];
}
