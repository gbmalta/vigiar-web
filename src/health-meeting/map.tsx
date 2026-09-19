import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors, number, trend, type City, type Prediction } from './data';

export default function PredictionMap({
  cities,
  rows,
  selected,
  onSelect,
}: {
  cities: City[];
  rows: Prediction[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!node.current) return;
    const instance = L.map(node.current, {
      scrollWheelZoom: false,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
    });
    map.current = instance;
    L.control
      .zoom({ zoomInTitle: 'Aproximar mapa', zoomOutTitle: 'Afastar mapa' })
      .addTo(instance);
    instance.fitBounds(
      cities.map((c) => [c.lat, c.lng] as L.LatLngTuple),
      { padding: [48, 48] },
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Referência municipal: IBGE',
      maxZoom: 19,
    })
      .on('tileerror', () => setTileError(true))
      .addTo(instance);
    const resize = new ResizeObserver(() => {
      instance.invalidateSize();
      instance.fitBounds(
        cities.map((c) => [c.lat, c.lng] as L.LatLngTuple),
        { padding: [48, 48] },
      );
    });
    resize.observe(node.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [cities]);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    for (const city of cities) {
      const row = rows.find((r) => r.city === city.id);
      if (!row) continue;
      const tone = trend(row);
      const label = document.createElement('span');
      label.textContent = `${city.name} · ${number(row.predicted)} previstas · ${tone}`;
      const marker = L.marker([city.lat, city.lng], {
        title: `${city.name}: ${number(row.predicted)} previstas, ${tone}. Selecionar cidade.`,
        icon: L.divIcon({
          className: 'hm-map-pin',
          html: `<span class="hm-pin ${city.id === selected ? 'is-selected' : ''}" style="--pin-color:${colors[tone]}"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .addTo(layer)
        .bindTooltip(label, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => onSelect(city.id));
    }
    return () => {
      layer.remove();
    };
  }, [cities, rows, selected, onSelect]);
  return (
    <div className="hm-map-wrap">
      <div
        ref={node}
        className="hm-map"
        role="region"
        aria-label="Mapa interativo das cinco cidades. Os mesmos dados estão na lista de cidades."
      />
      {tileError && (
        <p className="hm-map-error">
          Mapa de fundo indisponível. Consulte os valores na lista de cidades.
        </p>
      )}
    </div>
  );
}
