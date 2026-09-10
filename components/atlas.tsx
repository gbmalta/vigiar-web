'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  Info,
  Layers,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react';

import type { FeatureCollection } from 'geojson';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command';

import { GeoMap } from '@/components/geo-map';
import { DagOverview } from '@/components/dag-overview';
import {
  City,
  Layer,
  Metadata,
  formatDate,
  formatNumber,
  getJSON,
  colorFor,
} from '@/lib/map-data';
import { useMapTools } from '@/hooks/use-map-tools';
import { assetUrl } from '@/lib/asset-url';

const NotificationTrend = lazy(() => import('@/components/notification-trend'));
type Climate = Record<
  string,
  [number | null, number | null, number, number, string]
>;
export type Facility = [string, string, number, number, string];
export type Area = {
  id: string;
  name: string;
  city: string;
  ivs: number | null;
  idhm: number | null;
  income: number | null;
  cnes: number;
};
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const LAYERS: { id: Layer; label: string }[] = [
  { id: 'notifications', label: 'Notificações · SINAN' },
  { id: 'temperature', label: 'Temperatura · Clima' },
  { id: 'rain', label: 'Precipitação · Clima' },
  { id: 'cnes', label: 'Estabelecimentos · CNES' },
  { id: 'udh', label: 'Vulnerabilidade · UDH' },
];
const clean = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const decimal = (n: number | null | undefined, d = 1) =>
  n == null
    ? 'Sem dados'
    : n.toLocaleString('pt-BR', {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });

export function Atlas() {
  const [year, setYear] = useState(2026),
    [layer, setLayer] = useState<Layer>('notifications');
  const [cities, setCities] = useState<City[]>([]),
    [meta, setMeta] = useState<Metadata | null>(null);
  const [values, setValues] = useState<Record<string, number>>({}),
    [climate, setClimate] = useState<Climate>({}),
    [series, setSeries] = useState<Record<string, number[]>>({});
  const [selected, setSelected] = useState<City | null>(null),
    [area, setArea] = useState<Area | null>(null),
    [geo, setGeo] = useState<FeatureCollection | null>(null),
    [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [detailOpen, setDetailOpen] = useState(false),
    [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const request = useRef(0);
  const changeYear = useCallback((y: number) => {
    setYear(y);
  }, []);
  const changeLayer = useCallback(
    (l: Layer) => {
      setLayer(l);
      setArea(null);
      setDetailOpen(false);
      if (l === 'udh')
        setSelected((c) =>
          meta?.study.includes(c?.id || '')
            ? c
            : cities.find((c) => c.id === '3304557') || null,
        );
    },
    [meta, cities],
  );
  const selectCity = useCallback((c: City, open = true) => {
    setSelected(c);
    setArea(null);
    setSearchOpen(false);
    setQuery('');
    setDetailOpen(open);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      getJSON<City[]>('municipalities.json'),
      getJSON<Metadata>('metadata.json'),
      getJSON<Record<string, number[]>>('series.json'),
    ])
      .then(([c, m, s]) => {
        if (active) {
          setCities(c);
          setMeta(m);
          setSeries(s);
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Não foi possível carregar a base. Verifique sua conexão e tente novamente.',
          );
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setBusy(true);
        setError('');
        setValues({});
        setClimate({});
      }
    });
    const load = async () => {
      await Promise.resolve();
      let v: Record<string, number> = {};
      if (layer === 'notifications')
        v = await getJSON(`notifications-${year}.json`);
      else if (layer === 'cnes') v = await getJSON('cnes.json');
      else if (layer === 'temperature' || layer === 'rain') {
        const c = await getJSON<Climate>(`climate-${year}.json`);
        if (active) setClimate(c);
        Object.entries(c).forEach(([id, a]) => {
          const value = a[layer === 'temperature' ? 0 : 1];
          if (value != null) v[id] = value;
        });
      }
      if (active) {
        setValues(v);
        setBusy(false);
      }
    };
    load().catch(() => {
      if (active) {
        setError('Não foi possível carregar esta camada. Tente novamente.');
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [year, layer, retry]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setGeo(null);
        setFacilities(null);
        setGeoBusy(false);
      }
    });
    if (
      !selected ||
      !meta?.study.includes(selected.id) ||
      (layer !== 'udh' && layer !== 'cnes')
    )
      return;
    queueMicrotask(() => {
      if (active) setGeoBusy(true);
    });
    const load =
      layer === 'udh'
        ? getJSON<FeatureCollection>(`udh-${selected.id}.geojson`).then((g) => {
            if (active) setGeo(g);
          })
        : getJSON<Facility[]>(`facilities-${selected.id}.json`).then((f) => {
            if (active) setFacilities(f);
          });
    load
      .catch(() => {
        if (active)
          setError(
            'Não foi possível carregar os detalhes geográficos. Tente novamente.',
          );
      })
      .finally(() => {
        if (active) setGeoBusy(false);
      });
    return () => {
      active = false;
    };
  }, [layer, selected, meta, retry]);
  const annual = meta?.annual[year],
    weather = meta?.climate[year],
    isClimate = layer === 'temperature' || layer === 'rain',
    isStatic = layer === 'cnes' || layer === 'udh';
  const study = useMemo(
    () =>
      meta?.study
        .map((id) => cities.find((c) => c.id === id))
        .filter((c): c is City => !!c) || [],
    [meta, cities],
  );
  const results = useMemo(() => {
    const pool = layer === 'udh' ? study : cities;
    const q = clean(query);
    return q
      ? pool
          .filter((c) => clean(`${c.name} ${c.uf} ${c.id}`).includes(q))
          .slice(0, 50)
      : study;
  }, [query, cities, study, layer]);
  const summary =
    layer === 'notifications'
      ? {
          title: `NOTIFICAÇÕES · ${year}`,
          number: annual?.total,
          sub: `${formatNumber(annual?.municipalities || 0)} municípios representados`,
        }
      : isClimate
        ? {
            title: `COBERTURA CLIMÁTICA · ${year}`,
            number: Object.keys(values).length,
            sub: 'municípios com observações',
          }
        : layer === 'cnes'
          ? {
              title: 'ESTABELECIMENTOS · JUL 2026',
              number: meta?.cnes.total,
              sub: 'registros no cadastro nacional',
            }
          : {
              title: 'ÁREAS DE DESENVOLVIMENTO HUMANO',
              number: 1961,
              sub: 'UDHs em cinco municípios · referência 2010',
            };
  const note =
    layer === 'notifications'
      ? year === 2026
        ? '2026 parcial · até 29/06. Há 18 registros sem correspondência na malha.'
        : 'Contagem de registros notificados, sem filtro de confirmação. Não representa pacientes únicos.'
      : isClimate
        ? `Até ${weather ? formatDate(weather.max) : '…'} · ${weather?.weeks || '…'} semanas na base. A cobertura varia por município.`
        : layer === 'cnes'
          ? 'Referência fixa: julho de 2026. Os pontos de unidades com UDH estão disponíveis nas cinco cidades de estudo.'
          : 'Referência fixa: 2010. Toque em uma área para ver IVS, IDHM e estabelecimentos associados.';
  const selectedValue = selected ? values[selected.id] : undefined;
  const chartData = YEARS.map((y, i) => ({
    year: String(y),
    value: selected
      ? series[selected.id]?.[i] || 0
      : meta?.annual[y].total || 0,
  }));
  const thresholds =
    layer === 'temperature'
      ? [0, 15, 20, 25, 28]
      : layer === 'rain'
        ? [0, 500, 1000, 1500, 2500]
        : layer === 'udh'
          ? [0, 0.2, 0.3, 0.4, 0.5]
          : layer === 'cnes'
            ? [1, 20, 100, 500, 2000]
            : [1, 10, 100, 1000, 10000];
  const legendTitle =
    layer === 'temperature'
      ? 'Temperatura média observada (°C)'
      : layer === 'rain'
        ? 'Precipitação acumulada (mm)'
        : layer === 'udh'
          ? 'Índice de Vulnerabilidade Social'
          : layer === 'cnes' && facilities
            ? 'Localização dos estabelecimentos'
            : layer === 'cnes'
              ? 'Estabelecimentos por município'
              : 'Notificações por município';
  const configure = useCallback(
    async (input: {
      year?: number;
      layer?: Layer;
      municipalityId?: string;
    }) => {
      const id = ++request.current;
      const nextLayer = input.layer || layer,
        nextYear = input.year || year;
      const city = input.municipalityId
        ? cities.find((c) => c.id === input.municipalityId)
        : selected;
      if (input.municipalityId && !city)
        throw new Error('Município inexistente');
      if (nextLayer === 'udh' && city && !meta?.study.includes(city.id))
        throw new Error(
          'Camada UDH disponível apenas nas cinco cidades de estudo',
        );
      if (nextLayer === 'notifications')
        await getJSON(`notifications-${nextYear}.json`);
      else if (nextLayer === 'cnes') await getJSON('cnes.json');
      else if (nextLayer === 'temperature' || nextLayer === 'rain')
        await getJSON(`climate-${nextYear}.json`);
      if (id !== request.current) throw new Error('Consulta substituída');
      changeLayer(nextLayer);
      setYear(nextYear);
      if (city) selectCity(city, false);
      return {
        year: nextYear,
        layer: nextLayer,
        municipalityId: city?.id || null,
      };
    },
    [layer, year, cities, selected, meta, changeLayer, selectCity],
  );
  useMapTools({
    year,
    layer,
    municipalityId: selected?.id || null,
    loading: busy || geoBusy,
    configure,
  });

  return (
    <main className="atlas-app">
      <header className="atlas-header">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <div>
            <strong>VIGIAR</strong>
            <span>Observatório territorial</span>
          </div>
        </div>
        <span className="header-note">BASE HISTÓRICA · 2021—2026</span>
        <Button variant="outline" onClick={() => setInfoOpen(true)}>
          <Info />
          <span>Dados e relatórios</span>
        </Button>
      </header>
      <div className="atlas-workspace">
        <aside className="explorer">
          <div className="eyebrow">EXPLORAR O TERRITÓRIO</div>
          <h1>
            A história dos dados,
            <br />
            no mapa.
          </h1>
          <p className="intro">
            Uma visão geográfica da base de pesquisa. Escolha uma camada e
            percorra os anos.
          </p>
          <div className="explore-controls">
            <div className="layer-control">
              <label id="layer-label" htmlFor="map-layer">
                <Layers size={14} /> CAMADA DO MAPA
              </label>
              <Select
                value={layer}
                onValueChange={(v) => {
                  if (v) changeLayer(v as Layer);
                }}
              >
                <SelectTrigger id="map-layer" aria-labelledby="layer-label">
                  <SelectValue>
                    {LAYERS.find((l) => l.id === layer)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LAYERS.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="search-button"
              variant="outline"
              onClick={() => setSearchOpen(true)}
            >
              <Search />
              <span>
                {selected
                  ? `${selected.name} · ${selected.uf}`
                  : 'Buscar município'}
              </span>
              <span className="search-shortcut">↗</span>
            </Button>
          </div>
          <section className="metric-card" aria-live="polite">
            <span className="eyebrow">{summary.title}</span>
            <strong className="big-number">
              {meta && !busy ? formatNumber(summary.number || 0) : '…'}
            </strong>
            <span>{summary.sub}</span>
          </section>
          <div className="context-note">
            <Info size={18} />
            <p>{note}</p>
          </div>
          <section className="study-cities">
            <div className="eyebrow">CIDADES DE ESTUDO</div>
            {study.map((c) => (
              <Button
                key={c.id}
                variant="ghost"
                onClick={() => selectCity(c, layer !== 'udh')}
                aria-pressed={selected?.id === c.id}
              >
                <MapPin size={14} />
                <span>{c.name}</span>
                <small>{c.uf}</small>
                <ChevronRight size={14} />
              </Button>
            ))}
          </section>
          <div className="source-stamp">
            <CheckCheck size={15} /> Carga validada · 09 set 2026
            <span>SINAN · INMET · CNES · Atlas Brasil</span>
          </div>
        </aside>
        <section
          className="map-stage"
          aria-label="Mapa interativo dos dados extraídos"
        >
          <GeoMap
            cities={cities}
            values={values}
            layer={layer}
            selected={selected}
            onSelect={(c) => selectCity(c)}
            geo={geo}
            facilities={facilities}
            onAreaSelect={(a) => {
              setArea(a);
              setDetailOpen(true);
            }}
          />
          <div className="map-caption">
            <span className="live-dot" />
            {layer === 'notifications'
              ? 'MUNICÍPIO DE NOTIFICAÇÃO'
              : layer === 'udh'
                ? `UDHs · ${selected?.name || 'Selecione uma cidade'}`
                : layer === 'cnes' && facilities
                  ? `UNIDADES COM UDH · ${selected?.name}`
                  : isClimate
                    ? 'OBSERVAÇÕES NAS ESTAÇÕES'
                    : 'CADASTRO DE ESTABELECIMENTOS'}
          </div>
          {selected && (
            <Button
              variant="outline"
              className="selected-pill"
              onClick={() => setDetailOpen(true)}
            >
              <MapPin size={14} />
              {selected.name}
              <ArrowUpRight size={14} />
            </Button>
          )}
          {(busy || geoBusy) && (
            <output className="data-loading">
              Carregando {geoBusy ? 'detalhes geográficos' : 'camada'}…
            </output>
          )}
          {error && (
            <div className="map-error" role="alert">
              {error}
              <Button variant="outline" onClick={() => setRetry((r) => r + 1)}>
                Tentar novamente
              </Button>
            </div>
          )}
          <div className="map-legend">
            <strong>{legendTitle}</strong>
            {layer === 'cnes' && facilities ? (
              <>
                <span className="facility-key" />{' '}
                <small>Coordenadas do CNES · recorte com UDH</small>
              </>
            ) : (
              <>
                <div className="legend-swatches">
                  {thresholds.map((t) => (
                    <span key={t} style={{ background: colorFor(t, layer) }} />
                  ))}
                </div>
                <div className="legend-labels">
                  {thresholds.map((t) => (
                    <span key={t}>
                      {t === 0
                        ? '0'
                        : t >= 1000
                          ? `${t / 1000} mil`
                          : decimal(t, t < 1 ? 1 : 0)}
                      {t === thresholds[4] ? '+' : ''}
                    </span>
                  ))}
                </div>
                <small>
                  {layer === 'udh'
                    ? '0: menor · 1: maior vulnerabilidade'
                    : isClimate
                      ? 'Sem ponto: sem observação na base'
                      : 'Cor e tamanho: contagem absoluta'}
                </small>
              </>
            )}
          </div>
          <footer className={`timeline ${isStatic ? 'static-timeline' : ''}`}>
            <div className="timeline-heading">
              <span>
                {isStatic
                  ? 'PERÍODO DE REFERÊNCIA'
                  : layer === 'notifications'
                    ? 'ANO DE NOTIFICAÇÃO'
                    : 'ANO EPIDEMIOLÓGICO'}
              </span>
              <strong>
                {isStatic ? (layer === 'cnes' ? 'Jul 2026' : '2010') : year}
                {!isStatic &&
                  (year === 2026 || (isClimate && year === 2024)) && (
                    <small>PARCIAL</small>
                  )}
              </strong>
            </div>
            {isStatic ? (
              <p>
                Esta camada é uma referência fixa. Selecione Notificações ou
                Clima para navegar pelos anos.
              </p>
            ) : (
              <>
                <Slider
                  aria-label="Ano dos dados"
                  min={2021}
                  max={2026}
                  step={1}
                  value={[year]}
                  onValueChange={(v) => changeYear(Array.isArray(v) ? v[0] : v)}
                />
                <div className="year-buttons">
                  {YEARS.map((y) => (
                    <Button
                      key={y}
                      variant="ghost"
                      aria-pressed={year === y}
                      onClick={() => changeYear(y)}
                    >
                      {y}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </footer>
        </section>
      </div>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogHeader>
            <DialogTitle>Encontre um município</DialogTitle>
            <DialogDescription>
              {layer === 'udh'
                ? 'Áreas disponíveis nas cinco cidades de estudo.'
                : 'Busque pelo nome, UF ou código IBGE.'}
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              aria-label="Nome do município"
              placeholder="Ex.: Recife, PE ou 2611606"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>Nenhum município encontrado.</CommandEmpty>
              {results.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => selectCity(c, layer !== 'udh')}
                >
                  <MapPin />
                  <span>{c.name}</span>
                  <small>{c.uf}</small>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="bottom" className="detail-sheet">
          <SheetHeader>
            <div className="eyebrow">
              {area ? 'UNIDADE DE DESENVOLVIMENTO HUMANO' : 'PERFIL MUNICIPAL'}
            </div>
            <SheetTitle>
              {area?.name || selected?.name || 'Brasil'}
              {!area && selected && <small> · {selected.uf}</small>}
            </SheetTitle>
            <SheetDescription>
              {area
                ? `UDH ${area.id} · referência 2010`
                : `${selected ? 'IBGE ' + selected.id + ' · ' : ''}${LAYERS.find((l) => l.id === layer)?.label}`}
            </SheetDescription>
          </SheetHeader>
          <div className="detail-body">
            {area ? (
              <>
                <div className="detail-stats">
                  <div>
                    <span>IVS · 2010</span>
                    <strong>{decimal(area.ivs, 3)}</strong>
                  </div>
                  <div>
                    <span>IDHM · 2010</span>
                    <strong>{decimal(area.idhm, 3)}</strong>
                  </div>
                  <div>
                    <span>CNES com UDH · jul 2026</span>
                    <strong>{formatNumber(area.cnes)}</strong>
                  </div>
                </div>
                <p className="detail-note">
                  Índices de referência do Atlas Brasil. CNES é uma fotografia
                  de julho de 2026 e não mede a oferta de serviços em 2010.
                </p>
              </>
            ) : layer === 'notifications' ? (
              <>
                <div className="detail-stats">
                  <div>
                    <span>Notificações extraídas · {year}</span>
                    <strong>{formatNumber(selectedValue || 0)}</strong>
                  </div>
                  <div>
                    <span>Última data no recorte nacional</span>
                    <strong className="date-stat">
                      {annual ? formatDate(annual.max) : '—'}
                    </strong>
                  </div>
                </div>
                <Suspense
                  fallback={<p className="detail-note">Carregando gráfico…</p>}
                >
                  {detailOpen && (
                    <NotificationTrend data={chartData} year={year} />
                  )}
                </Suspense>
                <div className="accessible-series">
                  {chartData.map((d) => (
                    <span key={d.year}>
                      <b>
                        {d.year}
                        {d.year === '2026' ? '*' : ''}
                      </b>
                      {formatNumber(d.value)}
                    </span>
                  ))}
                </div>
                <p className="detail-note">
                  * 2026 é parcial (até 29/06). São registros por município de
                  notificação, não pacientes únicos nem apenas casos
                  confirmados. Zero significa ausência de registros no recorte
                  extraído.
                </p>
              </>
            ) : isClimate ? (
              <>
                <div className="detail-stats">
                  <div>
                    <span>
                      {layer === 'temperature'
                        ? 'Média observada'
                        : 'Acumulado observado'}
                    </span>
                    <strong>
                      {selectedValue == null
                        ? 'Sem dados'
                        : `${decimal(selectedValue)} ${layer === 'temperature' ? '°C' : 'mm'}`}
                    </strong>
                  </div>
                  <div>
                    <span>Semanas com observação</span>
                    <strong>
                      {selected
                        ? (climate[selected.id]?.[
                            layer === 'temperature' ? 2 : 3
                          ] ?? '—')
                        : '—'}
                    </strong>
                  </div>
                </div>
                <p className="detail-note">
                  {layer === 'temperature'
                    ? 'Média simples das médias semanais das estações disponíveis.'
                    : 'Soma dos totais semanais médios entre as estações disponíveis.'}{' '}
                  Cobertura variável; ausência de observação não equivale a
                  zero. Última semana do município:{' '}
                  {selected && climate[selected.id]
                    ? formatDate(climate[selected.id][4])
                    : 'sem observação'}
                  .
                </p>
              </>
            ) : layer === 'cnes' ? (
              <>
                <div className="detail-stats">
                  <div>
                    <span>Cadastro municipal · jul 2026</span>
                    <strong>{formatNumber(selectedValue || 0)}</strong>
                  </div>
                  <div>
                    <span>Unidades com UDH e coordenadas</span>
                    <strong>
                      {facilities
                        ? formatNumber(facilities.length)
                        : 'Sem recorte'}
                    </strong>
                  </div>
                </div>
                <p className="detail-note">
                  O cadastro pode incluir estabelecimentos desativados. O total
                  municipal usa o município gestor; os pontos detalhados usam
                  coordenadas vinculadas a uma UDH nas cinco cidades de estudo.
                  Amplie o mapa e toque em uma unidade para consultar seu nome e
                  código CNES.
                </p>
              </>
            ) : (
              <>
                <div className="detail-stats">
                  <div>
                    <span>UDHs disponíveis</span>
                    <strong>
                      {selected
                        ? formatNumber(meta?.udhCounts[selected.id] || 0)
                        : '—'}
                    </strong>
                  </div>
                </div>
                <p className="detail-note">
                  Feche este painel e toque em uma área do mapa para consultar
                  seus indicadores de 2010.
                </p>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="info-dialog">
          <DialogHeader>
            <div className="eyebrow">PROVENIÊNCIA E LEITURA DOS DADOS</div>
            <DialogTitle>Uma base, diferentes referências.</DialogTitle>
            <DialogDescription>
              Carga histórica concluída e validada em 09/09/2026. Dados
              originais armazenados na GCP.
            </DialogDescription>
          </DialogHeader>
          <div className="info-body">
            <div className="verified-line">
              <ShieldCheck /> 18 arquivos conferidos · 12.506.888 registros
              reconciliados
            </div>
            <DagOverview />
            <h3>Como interpretar o mapa</h3>
            <p>
              Notificações são a soma de <code>qt</code> na base SINAN, agrupada
              pelo ano da data de notificação e pelo município de notificação. O
              mapa não representa endereço de pacientes, local de residência ou
              local de infecção. Os círculos ficam em um ponto representativo de
              cada município.
            </p>
            <p>
              A escala é fixa entre os anos e mostra contagens absolutas. Não é
              uma taxa de incidência, um mapa de risco ou uma comparação
              ajustada por população. Municípios maiores podem ter mais
              registros.
            </p>
            <div className="coverage-table">
              <div>
                <b>SINAN</b>
                <span>
                  2021–2026 · 2026 até 29/06; 18 registros sem correspondência
                  geográfica.
                </span>
              </div>
              <div>
                <b>Clima</b>
                <span>
                  Ano epidemiológico; semanas e estações disponíveis. 2024 vai
                  até 30/11; 2026 até 28/02. Não representa uma normal
                  climatológica.
                </span>
              </div>
              <div>
                <b>CNES</b>
                <span>
                  Julho de 2026 · 631.973 estabelecimentos;{' '}
                  {formatNumber(
                    (meta?.cnes.total || 0) - (meta?.cnes.mapped || 0),
                  )}{' '}
                  sem município na malha. 39.980 unidades vinculadas a UDH no
                  recorte de estudo.
                </span>
              </div>
              <div>
                <b>UDH / IVS</b>
                <span>
                  2010 · 1.961 áreas em Rio de Janeiro, Porto Alegre, Manaus,
                  Recife e Cuiabá. Geometrias simplificadas para navegação.
                </span>
              </div>
            </div>
            <p>
              As fronteiras municipais vêm da{' '}
              <a
                href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3"
                target="_blank"
                rel="noreferrer"
              >
                API de malhas do IBGE
              </a>
              , consultada em 09/09/2026. Essa geometria é uma referência comum
              para todos os anos, sem reconstrução de alterações territoriais
              históricas.
            </p>
            <h3>Relatórios para abrir ou baixar</h3>
            <a
              className="report-link"
              href={assetUrl('reports/VIGIAR_Relatorio_Operacional_20260909.pdf')}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowDownToLine />
              <span>
                <b>Relatório da execução noturna</b>
                <small>Execução, correções, verificações e custos · PDF</small>
              </span>
              <ArrowUpRight />
            </a>
            <a
              className="report-link"
              href={assetUrl('reports/VIGIAR_Arquitetura_Metricas_20260909.pdf')}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowDownToLine />
              <span>
                <b>DAG, arquitetura e métricas</b>
                <small>Documento para o grupo de pesquisa · PDF</small>
              </span>
              <ArrowUpRight />
            </a>
            <p className="detail-note">
              O mapa usa agregações prontas: navegar não dispara consultas no
              BigQuery nem liga a máquina do Airflow. A base do mapa é estática,
              correspondente a esta carga.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
