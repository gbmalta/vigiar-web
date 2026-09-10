'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { LocateFixed, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { City, Layer, colorFor, formatNumber } from '@/lib/map-data';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import type { Area, Facility } from '@/components/atlas';
type Props = {
  cities: City[];
  values: Record<string, number>;
  layer: Layer;
  selected: City | null;
  onSelect: (c: City) => void;
  geo: FeatureCollection | null;
  facilities: Facility[] | null;
  onAreaSelect: (area: Area) => void;
};
export function GeoMap({
  cities,
  values,
  layer,
  selected,
  onSelect,
  geo,
  facilities,
  onAreaSelect,
}: Props) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    lib = useRef<typeof Leaflet | null>(null),
    points = useRef<Leaflet.LayerGroup | null>(null),
    select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  const [ready, setReady] = useState(false),
    [tileError, setTileError] = useState(false);
  const [density, setDensity] = useState('');
  const areaSelect = useRef(onAreaSelect);
  useEffect(() => {
    areaSelect.current = onAreaSelect;
  }, [onAreaSelect]);
  useEffect(() => {
    let active = true;
    import('leaflet')
      .then((L) => {
        if (!active || !node.current) return;
        lib.current = L;
        const m = L.map(node.current, {
          zoomControl: false,
          preferCanvas: true,
          minZoom: 3,
          maxZoom: 18,
        }).setView([-14.2, -52.5], window.innerWidth <= 760 ? 3 : 4);
        map.current = m;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · IBGE',
        })
          .on('tileerror', () => {
            if (active) setTileError(true);
          })
          .addTo(m);
        points.current = L.layerGroup().addTo(m);
        const observer = new ResizeObserver(() => m.invalidateSize());
        observer.observe(node.current);
        m.on('unload', () => observer.disconnect());
        setReady(true);
      })
      .catch(() => setTileError(true));
    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const L = lib.current,
      g = points.current,
      m = map.current;
    if (!ready || !L || !g || !m) return;
    g.clearLayers();
    setDensity('');
    if (layer === 'udh' && geo) {
      const areas = L.geoJSON(geo, {
        style: (f) => ({
          color: '#fff',
          weight: 0.8,
          fillColor:
            f?.properties.ivs == null
              ? '#a8b5ae'
              : colorFor(f.properties.ivs, 'udh'),
          fillOpacity: 0.74,
        }),
        onEachFeature: (f, polygon) => {
          const a = f.properties as Area;
          const label = document.createElement('span');
          label.textContent = `${a.name} · IVS ${a.ivs == null ? 'sem dados' : a.ivs.toLocaleString('pt-BR')}`;
          polygon
            .bindTooltip(label, { sticky: true })
            .on('click', () => areaSelect.current(a));
        },
      }).addTo(g);
      if (areas.getBounds().isValid())
        m.fitBounds(areas.getBounds(), {
          paddingTopLeft: [28, 80],
          paddingBottomRight: [28, 165],
          maxZoom: 13,
        });
      return;
    }
    if (layer === 'cnes' && facilities) {
      const render = () => {
        g.clearLayers();
        const visible = facilities.filter((f) =>
          m.getBounds().contains([f[2], f[3]]),
        );
        const count = visible.length,
          limit = 3000,
          step = Math.max(1, Math.ceil(count / limit));
        setDensity(
          count > limit
            ? `${formatNumber(Math.ceil(count / step))} de ${formatNumber(count)} unidades na tela. Amplie para detalhar.`
            : `${formatNumber(count)} unidades nesta área.`,
        );
        visible
          .filter((_, i) => i % step === 0)
          .forEach((f) => {
            const marker = L.circleMarker([f[2], f[3]], {
              radius: 5,
              color: '#fff',
              weight: 1,
              fillColor: '#176b64',
              fillOpacity: 0.88,
            });
            const pop = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = f[1];
            const id = document.createElement('p');
            id.textContent = `CNES ${f[0]} · referência jul/2026`;
            pop.appendChild(name);
            pop.appendChild(id);
            marker.bindPopup(pop).addTo(g);
          });
      };
      if (facilities.length) {
        const bounds = L.latLngBounds(
          facilities.map((f) => [f[2], f[3]] as Leaflet.LatLngTuple),
        );
        m.fitBounds(bounds, {
          paddingTopLeft: [28, 80],
          paddingBottomRight: [28, 165],
          maxZoom: 13,
        });
      }
      render();
      m.on('moveend', render);
      return () => {
        m.off('moveend', render);
      };
    }
    if (layer === 'udh') return;
    [...cities]
      .sort((a, b) => (values[a.id] || 0) - (values[b.id] || 0))
      .forEach((c) => {
        const v = values[c.id];
        if (
          v == null ||
          ((layer === 'notifications' || layer === 'cnes') && v <= 0)
        )
          return;
        const marker = L.circleMarker([c.lat, c.lng], {
          radius:
            layer === 'notifications' || layer === 'cnes'
              ? Math.min(17, 3 + Math.log10(v + 1) * 2.1)
              : 6,
          color: '#fff',
          weight: 0.6,
          fillColor: colorFor(v, layer),
          fillOpacity: 0.82,
        });
        const label = document.createElement('span');
        label.textContent = `${c.name} · ${c.uf}: ${formatNumber(v)}${layer === 'temperature' ? ' °C' : layer === 'rain' ? ' mm' : ''}`;
        marker
          .bindTooltip(label, { direction: 'top' })
          .on('click', () => select.current(c))
          .addTo(g);
      });
  }, [cities, values, layer, ready, geo, facilities]);
  useEffect(() => {
    if (ready && selected)
      map.current?.setView([selected.lat, selected.lng], 9, {
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
  }, [selected, ready]);
  return (
    <>
      <div ref={node} className="geo-map" />
      {!ready && <output className="map-loading">Preparando o mapa…</output>}
      <div className="map-navigation">
        <Button
          variant="outline"
          size="icon"
          aria-label="Ampliar mapa"
          onClick={() => map.current?.zoomIn()}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Reduzir mapa"
          onClick={() => map.current?.zoomOut()}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Mostrar o Brasil"
          onClick={() =>
            map.current?.setView(
              [-14.2, -52.5],
              window.innerWidth <= 760 ? 3 : 4,
            )
          }
        >
          <LocateFixed />
        </Button>
      </div>
      {tileError && (
        <div className="tile-warning">
          Mapa de fundo indisponível. Os dados continuam acessíveis pela busca.
        </div>
      )}
      {density && <div className="map-density-note">{density}</div>}
    </>
  );
}
