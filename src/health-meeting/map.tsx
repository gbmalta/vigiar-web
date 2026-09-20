import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { ArrowLeft, Focus, Pause, Play } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { assetUrl } from '@/lib/asset-url';
import {
  colors,
  date,
  number,
  trend,
  type City,
  type Prediction,
} from './data';
import {
  historyWindow,
  placeCards,
  regionColor,
  regionMetrics,
  type Region,
  type RegionMetric,
  type Regions,
  type MapPoint,
} from './map-data';
import { Sparkline } from './sparkline';

const decimal = (value: number | null, digits = 3) =>
  value === null
    ? 'Sem dado'
    : value.toLocaleString('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
const money = (value: number | null) =>
  value === null
    ? 'Sem dado'
    : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PredictionMap({
  cities,
  rows,
  predictions,
  selected,
  focusCity,
  onFocus,
  onSelect,
  week,
  weeks,
  onWeekChange,
}: {
  cities: City[];
  rows: Prediction[];
  predictions: Prediction[];
  selected: string;
  focusCity: string | null;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
  week: string;
  weeks: string[];
  onWeekChange: (week: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const polygons = useRef<L.GeoJSON | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [tileError, setTileError] = useState(false);
  const [frame, setFrame] = useState<{
    width: number;
    height: number;
    points: MapPoint[];
  }>({ width: 0, height: 0, points: [] });
  const [showCharts, setShowCharts] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [metric, setMetric] = useState<RegionMetric>('ivs');
  const [regionId, setRegionId] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const [regionData, setRegionData] = useState<{
    city: string;
    geo: Regions;
  } | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const activeCity = cities.find((c) => c.id === focusCity);
  const geo = regionData?.city === focusCity ? regionData.geo : null;
  const activeRegion = geo?.features.find(
    (f) => f.properties.id === regionId,
  )?.properties;
  const sortedRegions = useMemo(
    () =>
      geo
        ? [...geo.features].sort((a, b) =>
            a.properties.name.localeCompare(b.properties.name, 'pt-BR'),
          )
        : [],
    [geo],
  );
  const filteredRegions = useMemo(() => {
    const normalize = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    return sortedRegions.filter(
      (f) =>
        normalize(f.properties.name).includes(normalize(query)) ||
        f.properties.id.includes(query),
    );
  }, [query, sortedRegions]);
  const series = useMemo(
    () =>
      Object.fromEntries(
        cities.map((c) => [c.id, historyWindow(predictions, c.id, week)]),
      ),
    [cities, predictions, week],
  );
  const index = weeks.indexOf(week);

  useEffect(() => {
    if (!node.current) return;
    const instance = L.map(node.current, {
      scrollWheelZoom: false,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      zoomAnimation: false,
      preferCanvas: true,
    });
    map.current = instance;
    L.control
      .zoom({ zoomInTitle: 'Aproximar mapa', zoomOutTitle: 'Afastar mapa' })
      .addTo(instance);
    instance.fitBounds(
      cities.map((c) => [c.lat, c.lng] as L.LatLngTuple),
      { padding: [65, 80] },
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · IBGE · UDH: Atlas Brasil/IPEA',
      maxZoom: 19,
    })
      .on('tileerror', () => setTileError(true))
      .addTo(instance);
    const update = () => {
      const size = instance.getSize();
      const points = cities
        .map((c) => {
          const p = instance.latLngToContainerPoint([c.lat, c.lng]);
          return { id: c.id, x: p.x, y: p.y };
        })
        .filter((p) => p.x >= 0 && p.x <= size.x && p.y >= 0 && p.y <= size.y);
      setFrame({ width: size.x, height: size.y, points });
    };
    let frameRequest = 0;
    const scheduleUpdate = () => {
      if (!frameRequest)
        frameRequest = window.requestAnimationFrame(() => {
          frameRequest = 0;
          update();
        });
    };
    instance.on('move zoomend', scheduleUpdate);
    const resize = new ResizeObserver(() => {
      instance.invalidateSize();
      update();
    });
    resize.observe(node.current);
    update();
    return () => {
      resize.disconnect();
      instance.off('move zoomend', scheduleUpdate);
      window.cancelAnimationFrame(frameRequest);
      instance.remove();
      map.current = null;
    };
  }, [cities]);

  // Only city navigation changes the camera. Time changes and resizes preserve it.
  useEffect(() => {
    if (!map.current) return;
    setRegionId('');
    setQuery('');
    if (activeCity)
      map.current.setView([activeCity.lat, activeCity.lng], 11, {
        animate: false,
      });
    else
      map.current.fitBounds(
        cities.map((c) => [c.lat, c.lng] as L.LatLngTuple),
        { padding: [65, 80], animate: false },
      );
  }, [activeCity, cities]);

  useEffect(() => {
    setRegionError(null);
    if (!focusCity) return;
    const controller = new AbortController();
    fetch(assetUrl(`data/udh-${focusCity}.geojson`), {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error('Regiões indisponíveis');
        return r.json();
      })
      .then((result: Regions) => {
        if (
          result.type !== 'FeatureCollection' ||
          !result.features.length ||
          result.features.some((f) => f.properties.city !== focusCity)
        )
          throw new Error('Geografia incompatível');
        if (!controller.signal.aborted)
          setRegionData({ city: focusCity, geo: result });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setRegionError(focusCity);
      });
    return () => controller.abort();
  }, [focusCity, retry]);

  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    if (!focusCity)
      for (const city of cities) {
        const row = rows.find((r) => r.city === city.id);
        if (!row) continue;
        const label = document.createElement('span');
        label.textContent = `${city.name} · ${number(row.predicted)} previstas · ${trend(row)}. Clique para explorar as regiões.`;
        L.marker([city.lat, city.lng], {
          title: `${city.name}: aproximar e explorar regiões`,
          icon: L.divIcon({
            className: 'hm-map-pin',
            html: `<span class="hm-pin ${city.id === selected ? 'is-selected' : ''}" style="--pin-color:${colors[trend(row)]}"></span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        })
          .addTo(layer)
          .bindTooltip(label, { direction: 'top' })
          .on('click', () => select.current(city.id));
      }
    return () => {
      layer.remove();
    };
  }, [cities, rows, selected, focusCity]);

  useEffect(() => {
    if (!map.current || !geo) return;
    const layer = L.geoJSON(geo, {
      style: (f) => ({
        color: '#fff',
        weight: 1,
        fillColor: regionColor(f!.properties as Region, metric),
        fillOpacity: 0.75,
      }),
      onEachFeature: (feature, polygon) => {
        const r = feature.properties as Region;
        const label = document.createElement('span');
        label.textContent = `${r.name} · ${regionMetrics[metric].label}: ${metric === 'income' ? money(r[metric]) : decimal(r[metric], metric === 'cnes' ? 0 : 3)}`;
        const popup = document.createElement('div');
        popup.className = 'hm-region-popup';
        const title = document.createElement('strong');
        title.textContent = r.name;
        popup.append(title);
        for (const [name, value] of [
          ['IVS · 2010', decimal(r.ivs)],
          ['IDHM · 2010', decimal(r.idhm)],
          ['Renda per capita · 2010', money(r.income)],
          ['CNES · jul/2026', decimal(r.cnes, 0)],
        ]) {
          const line = document.createElement('div');
          const key = document.createElement('span');
          const val = document.createElement('b');
          key.textContent = name;
          val.textContent = value;
          line.append(key, val);
          popup.append(line);
        }
        polygon.bindPopup(popup, { maxWidth: 245, autoPan: false });
        polygon
          .bindTooltip(label, { sticky: true })
          .on('click', () => setRegionId(r.id));
      },
    }).addTo(map.current);
    polygons.current = layer;
    return () => {
      layer.remove();
      polygons.current = null;
    };
  }, [geo, metric]);

  useEffect(() => {
    if (!geo || !map.current) return;
    const bounds = L.geoJSON(geo).getBounds();
    if (bounds.isValid())
      map.current.fitBounds(bounds, {
        padding: [22, 22],
        maxZoom: 12,
        animate: false,
      });
  }, [geo]);

  useEffect(() => {
    polygons.current?.eachLayer((layer) => {
      const polygon = layer as L.Polygon & { feature: { properties: Region } };
      const chosen = polygon.feature.properties.id === regionId;
      polygon.setStyle({
        color: chosen ? '#053a81' : '#fff',
        weight: chosen ? 3 : 1,
        fillOpacity: chosen ? 0.9 : 0.75,
      });
      if (chosen) {
        polygon.bringToFront();
        polygon.openPopup();
      } else {
        polygon.closePopup();
      }
    });
  }, [regionId, geo, metric]);

  useEffect(() => {
    const feature = geo?.features.find((f) => f.properties.id === regionId);
    if (feature && map.current)
      map.current.fitBounds(L.geoJSON(feature).getBounds(), {
        padding: [45, 45],
        maxZoom: 15,
        animate: false,
      });
  }, [regionId, geo]);

  useEffect(() => {
    if (!playing) return;
    if (index >= weeks.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => onWeekChange(weeks[index + 1]), 1200);
    return () => window.clearTimeout(timer);
  }, [playing, index, weeks, onWeekChange]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const cardWidth = frame.width < 400 ? 115 : 137;
  const cards = placeCards(
    frame.points,
    frame.width,
    frame.height,
    cardWidth,
    83,
  );
  const config = regionMetrics[metric];
  return (
    <div className="hm-map-explorer">
      <div className="hm-map-toolbar">
        {activeCity ? (
          <>
            <button onClick={() => onFocus(null)}>
              <ArrowLeft size={15} />
              Todas as cidades
            </button>
            <strong>
              {activeCity.name} <span>· regiões (UDHs)</span>
            </strong>
          </>
        ) : (
          <>
            <label>
              <input
                type="checkbox"
                checked={showCharts}
                onChange={(e) => setShowCharts(e.target.checked)}
              />
              Minigráficos no mapa
            </label>
            <button onClick={() => onSelect(selected)}>
              <Focus size={15} />
              Entrar na cidade
            </button>
          </>
        )}
      </div>
      {!activeCity && showCharts && (
        <div className="hm-spark-key">
          <span className="predicted">Previsto</span>
          <span className="observed">Observado</span>
          <small>Até 26 semanas · escala própria por cidade</small>
        </div>
      )}
      {activeCity && (
        <div className="hm-region-controls">
          <label>
            Colorir regiões por
            <select
              aria-label="Variável das regiões"
              value={metric}
              onChange={(e) => setMetric(e.target.value as RegionMetric)}
            >
              {Object.entries(regionMetrics).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
          <span>Referência: {config.reference}</span>
        </div>
      )}
      <div className="hm-map-wrap">
        <div
          ref={node}
          className="hm-map hm-map-history"
          role="region"
          aria-label={
            activeCity
              ? `Mapa das regiões de ${activeCity.name}. Selecione uma região no mapa ou na lista abaixo.`
              : 'Mapa interativo das cinco cidades com séries previstas e observadas.'
          }
        />
        {!focusCity && showCharts && (
          <div className="hm-map-cards">
            <svg
              className="hm-card-connectors"
              width={frame.width}
              height={frame.height}
              aria-hidden="true"
            >
              {cards.map((c) => (
                <line
                  key={c.id}
                  x1={c.x}
                  y1={c.y}
                  x2={c.left + cardWidth / 2}
                  y2={c.top + 42}
                  stroke="#69839e"
                  strokeWidth="1"
                />
              ))}
            </svg>
            {cards.map((p) => {
              const c = cities.find((c) => c.id === p.id)!;
              const history = series[c.id];
              return (
                <button
                  key={c.id}
                  className={`hm-map-card ${selected === c.id ? 'selected' : ''}`}
                  style={{ left: p.left, top: p.top, width: cardWidth }}
                  onClick={() => onSelect(c.id)}
                  aria-label={`Explorar histórico e regiões de ${c.name}`}
                >
                  <strong>
                    {c.name}
                    <span>{number(history.at(-1)!.predicted)}</span>
                  </strong>
                  <Sparkline series={history} city={c.name} />
                  <small>
                    {date(history[0].week, false)} <span>→</span>{' '}
                    {date(history.at(-1)!.week, false)}
                  </small>
                </button>
              );
            })}
          </div>
        )}
        {focusCity && !geo && (
          <div className="hm-region-loading" role="status">
            {regionError === focusCity ? (
              <>
                <span>Não foi possível carregar as regiões.</span>
                <button onClick={() => setRetry((v) => v + 1)}>
                  Tentar novamente
                </button>
              </>
            ) : (
              'Carregando regiões da cidade…'
            )}
          </div>
        )}
        {tileError && (
          <p className="hm-map-error">
            Mapa de fundo indisponível. As séries e os dados regionais continuam
            acessíveis.
          </p>
        )}
      </div>
      <div className="hm-time-player">
        <button
          aria-label={
            playing ? 'Pausar reprodução histórica' : 'Reproduzir histórico'
          }
          onClick={() => {
            if (!playing && index === weeks.length - 1) onWeekChange(weeks[0]);
            setPlaying((v) => !v);
          }}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <div>
          <label htmlFor={`history-${focusCity || 'brasil'}`}>
            Reprodução histórica <strong>{date(week)}</strong>
          </label>
          <input
            id={`history-${focusCity || 'brasil'}`}
            type="range"
            min="0"
            max={weeks.length - 1}
            step="1"
            value={index}
            aria-label="Semana da reprodução histórica"
            aria-valuetext={date(week)}
            onChange={(e) => {
              setPlaying(false);
              onWeekChange(weeks[Number(e.target.value)]);
            }}
          />
        </div>
        <span>2024–2025</span>
      </div>
      {activeCity && (
        <>
          <div className="hm-local-history">
            <div>
              <strong>Histórico municipal · {activeCity.name}</strong>
              <span>
                Previsto e observado · até 26 semanas até {date(week)}
              </span>
            </div>
            <Sparkline
              series={series[activeCity.id]}
              city={activeCity.name}
              expanded
            />
            <div className="hm-spark-key">
              <span className="predicted">Previsto</span>
              <span className="observed">Observado</span>
              <small>Notificações nas 4 semanas seguintes</small>
            </div>
          </div>
          {geo && (
            <div className="hm-region-panel">
              <div
                className="hm-region-legend"
                aria-label={`Legenda de ${config.label}`}
              >
                {config.colors.map((color, i) => (
                  <span key={color}>
                    <i style={{ background: color }} />
                    {i === 0
                      ? `< ${config.thresholds[0].toLocaleString('pt-BR')}`
                      : i === 4
                        ? `≥ ${config.thresholds[3].toLocaleString('pt-BR')}`
                        : `${config.thresholds[i - 1].toLocaleString('pt-BR')}–<${config.thresholds[i].toLocaleString('pt-BR')}`}
                  </span>
                ))}
                <span>
                  <i style={{ background: '#c4c9c6' }} />
                  Sem dado
                </span>
              </div>
              <div className="hm-region-picker">
                <label>
                  Buscar região
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nome ou código da UDH"
                  />
                </label>
                <label>
                  Região da cidade
                  <select
                    aria-label="Região da cidade"
                    value={
                      filteredRegions.some((f) => f.properties.id === regionId)
                        ? regionId
                        : ''
                    }
                    onChange={(e) => setRegionId(e.target.value)}
                  >
                    <option value="">
                      {filteredRegions.length
                        ? `Selecione · ${filteredRegions.length} regiões`
                        : 'Nenhuma região encontrada'}
                    </option>
                    {filteredRegions.map((f) => (
                      <option key={f.properties.id} value={f.properties.id}>
                        {f.properties.name} · {f.properties.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {activeRegion ? (
                <section
                  className="hm-region-detail"
                  aria-label="Dados da região selecionada"
                >
                  <h3>{activeRegion.name}</h3>
                  <p>
                    UDH {activeRegion.id} · {activeCity.name}
                  </p>
                  <dl>
                    <div>
                      <dt>IVS · 2010</dt>
                      <dd>{decimal(activeRegion.ivs)}</dd>
                    </div>
                    <div>
                      <dt>IDHM · 2010</dt>
                      <dd>{decimal(activeRegion.idhm)}</dd>
                    </div>
                    <div>
                      <dt>Renda per capita · 2010</dt>
                      <dd>{money(activeRegion.income)}</dd>
                    </div>
                    <div>
                      <dt>CNES vinculados · jul/2026</dt>
                      <dd>{decimal(activeRegion.cnes, 0)}</dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <p className="hm-region-hint">
                  Clique em uma região ou escolha na lista para consultar suas
                  variáveis.
                </p>
              )}
              <p className="hm-region-footnote">
                UDHs são Unidades de Desenvolvimento Humano; seus limites não
                equivalem necessariamente a bairros. Indicadores regionais são
                fotografias de suas respectivas datas e não mudam com a
                reprodução. A predição é municipal: não há série prevista ou
                observada por UDH neste recorte.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
