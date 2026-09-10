'use client';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatNumber } from '@/lib/map-data';
export default function NotificationTrend({
  data,
  year,
}: {
  data: { year: string; value: number }[];
  year: number;
}) {
  const values = data.map((d) => ({
    ...d,
    fill:
      Number(d.year) === year
        ? '#d89d45'
        : d.year === '2026'
          ? '#9dbbb0'
          : '#257b70',
  }));
  return (
    <ChartContainer
      config={{ value: { label: 'Notificações', color: '#18746e' } }}
      className="trend-chart"
    >
      <BarChart data={values} accessibilityLayer>
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis hide />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v) => (
                <strong>{formatNumber(Number(v))} registros</strong>
              )}
              labelFormatter={(_, p) => p?.[0]?.payload.year}
            />
          }
        />
        <Bar dataKey="value" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
