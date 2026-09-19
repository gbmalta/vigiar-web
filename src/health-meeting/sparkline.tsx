import { date, number, type Prediction } from './data';
import { sparkline } from './map-data';

export function Sparkline({
  series,
  city,
  expanded = false,
}: {
  series: Prediction[];
  city: string;
  expanded?: boolean;
}) {
  const height = expanded ? 72 : 34;
  const shape = sparkline(series, 128, height);
  if (!series.length) return <span>Sem histórico neste período.</span>;
  return (
    <svg
      viewBox={`0 0 128 ${height}`}
      className="hm-sparkline"
      role="img"
      aria-label={`${city}: previsto e observado nas últimas ${series.length} semanas disponíveis, até ${date(series.at(-1)!.week)}. Escala de zero a ${number(shape.max)} notificações.`}
      preserveAspectRatio="none"
    >
      <line x1="3" y1={height - 3} x2="125" y2={height - 3} stroke="#dce6df" />
      <path
        d={shape.observed}
        fill="none"
        stroke="#455863"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={shape.predicted}
        fill="none"
        stroke="#188360"
        strokeWidth="1.8"
        strokeDasharray="4 2"
        vectorEffect="non-scaling-stroke"
      />
      {series.length === 1 && shape.observedEnd && (
        <circle
          cx={shape.observedEnd.x}
          cy={shape.observedEnd.y}
          r="2"
          fill="#455863"
        />
      )}
      {series.length === 1 && shape.predictedEnd && (
        <circle
          cx={shape.predictedEnd.x}
          cy={shape.predictedEnd.y}
          r="2"
          fill="#188360"
        />
      )}
    </svg>
  );
}
