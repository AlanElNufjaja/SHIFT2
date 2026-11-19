import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MONTH_NAMES, getCrop, getCropName } from '@fieldshift/core';
import type { Crop, Locale, Strategy, StrategyArchetype } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';

const STRATEGY_COLORS = ['#15803d', '#0284c7', '#d97706', '#c2410c', '#64748b'];

const ARCHETYPE_SHORT: Record<Locale, Record<StrategyArchetype, string>> = {
  en: {
    current: 'Today',
    'water-soil': 'Save water & soil',
    diversified: 'Rotate & add N',
    income: 'Top net profit',
    forage: 'More hay / feed',
    'priority-optimal': 'Step-by-step',
  },
  es: {
    current: 'Lo que siembras hoy',
    'water-soil': 'Ahorrar agua y cuidar tierra',
    diversified: 'Cambiar cultivo y dar abono',
    income: 'Mejor ganancia',
    forage: 'Más pastura',
    'priority-optimal': 'Cambio paso a paso',
  },
};

interface Props {
  strategies: Strategy[];
  catalog: Crop[];
}

export function StrategyCharts({ strategies, catalog }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';
  const monthNames = MONTH_NAMES[locale];

  const topForRadar = strategies.slice(0, 3);
  const current = strategies.find((s) => s.isCurrent);
  const radarStrategies =
    current && !topForRadar.some((s) => s.id === current.id)
      ? [...topForRadar.slice(0, 2), current]
      : topForRadar;

  const barData = strategies.map((s) => ({
    name: s.isCurrent ? (isEn ? 'Today' : 'Hoy') : isEn ? `Option #${s.rank}` : `Opción #${s.rank}`,
    agua: s.metrics.irrigationMm,
    ingreso: s.metrics.netIncomePerHa,
  }));

  const axes = isEn
    ? [
        { axis: 'Save water', key: 'water' as const },
        { axis: 'Healthy soil', key: 'soil' as const },
        { axis: 'Profit', key: 'income' as const },
        { axis: 'Forage', key: 'forage' as const },
        { axis: 'Resilience', key: 'resilience' as const },
      ]
    : [
        { axis: 'Ahorro agua', key: 'water' as const },
        { axis: 'Tierra sana', key: 'soil' as const },
        { axis: 'Ganancia', key: 'income' as const },
        { axis: 'Pastura', key: 'forage' as const },
        { axis: 'Aguante', key: 'resilience' as const },
      ];

  const radarData = axes.map((a) => {
    const row: Record<string, string | number> = { axis: a.axis };
    radarStrategies.forEach((s, idx) => {
      row[`s${idx}`] = s.scores[a.key];
    });
    return row;
  });

  const waterBarLabel = isEn ? 'Water needed (mm)' : 'Agua que ocupa (mm)';
  const incomeBarLabel = isEn ? 'Est. profit (USD/ha)' : 'Ganancia aprox. (USD/ha)';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Bar comparison */}
        <div className="rounded-2xl border border-[#C8B89E] bg-white p-5 shadow-card lg:col-span-7">
          <h3 className="text-sm font-bold text-stone-900">
            {isEn
              ? 'Water demand vs. estimated profit per hectare'
              : 'Comparación de agua de riego y ganancia por hectárea'}
          </h3>
          <p className="text-xs text-stone-600">
            {isEn
              ? 'Irrigation water asked for (blue) next to estimated yearly net return (green).'
              : 'Agua que pide cada opción (azul) frente a lo que te queda libre aprox. al año (verde).'}
          </p>
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#44403c' }} />
                <YAxis yAxisId="w" tick={{ fontSize: 11, fill: '#0284c7' }} />
                <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 11, fill: '#15803d' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: '#e7e5e4', fontSize: 12 }}
                  formatter={(value: unknown, name: string) => [
                    name === 'agua' ? `${value} ${isEn ? 'mm/yr' : 'mm/año'}` : `$${Number(value).toLocaleString('en-US')} USD/ha`,
                    name === 'agua' ? waterBarLabel : incomeBarLabel,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="w" dataKey="agua" name={waterBarLabel} fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="usd" dataKey="ingreso" name={incomeBarLabel} fill="#15803d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar */}
        <div className="rounded-2xl border border-[#C8B89E] bg-white p-5 shadow-card lg:col-span-5">
          <h3 className="text-sm font-bold text-stone-900">
            {isEn ? 'Where each plan is strongest (0–100)' : 'En qué es más fuerte cada opción (0–100)'}
          </h3>
          <p className="text-xs text-stone-600">
            {isEn
              ? 'Wider stretch toward a corner means stronger performance on that goal.'
              : 'Mientras más abierto el dibujo hacia una esquina, mejor responde en ese punto.'}
          </p>
          <div className="mt-2 h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e7e5e4" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#44403c', fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {radarStrategies.map((s, idx) => (
                  <Radar
                    key={s.id}
                    name={s.isCurrent ? (isEn ? 'Today' : 'Hoy') : `#${s.rank} ${ARCHETYPE_SHORT[locale][s.archetype]}`}
                    dataKey={`s${idx}`}
                    stroke={STRATEGY_COLORS[idx % STRATEGY_COLORS.length]}
                    fill={STRATEGY_COLORS[idx % STRATEGY_COLORS.length]}
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e7e5e4', fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 36-Month Visual Rotation Calendar */}
      <div className="rounded-2xl border border-[#C8B89E] bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-stone-900">
              {isEn ? '3-year month-by-month planting calendar' : 'Calendario de siembras a 3 años (mes a mes)'}
            </h3>
            <p className="text-xs text-stone-600">
              {isEn
                ? 'Each square is one month. Hover or tap a box to see which crop is in the field.'
                : 'Cada cuadrito es un mes. Pasa el dedo o ratón por encima para ver qué cultivo está en la tierra.'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-stone-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> {isEn ? 'Main crop' : 'Cultivo principal'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" /> {isEn ? 'Cover crop' : 'Planta de cobertura'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-stone-300" /> {isEn ? 'Bare rest' : 'Tierra en descanso'}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-3 overflow-x-auto pb-1">
          {strategies.map((s) => {
            const cells = Array.from({ length: 36 }, (_, idx) => {
              const matching = s.timeline.filter((sl) => {
                const start = sl.start;
                const end = sl.start + sl.months;
                return (idx >= start && idx < end) || (end > 36 && idx < end - 36);
              });
              return matching.find((sl) => sl.role !== 'fallow') ?? matching[0];
            });

            return (
              <div key={s.id} className="min-w-[640px]">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-800">
                    #{s.rank} · {s.isCurrent ? (isEn ? 'Today: ' : 'Hoy: ') : ''}
                    {s.sequenceLabel}
                  </span>
                  <span className="font-mono text-[11px] text-stone-500">
                    {isEn
                      ? `Covered ${s.metrics.groundCoverPct}% · ${s.metrics.bareMonths} bare mo/yr`
                      : `Tierra tapada ${s.metrics.groundCoverPct} % · ${s.metrics.bareMonths} m pelona/año`}
                  </span>
                </div>
                <div
                  className="grid gap-0.5 rounded-lg bg-stone-100 p-1"
                  style={{ gridTemplateColumns: 'repeat(36, minmax(0, 1fr))' }}
                >
                  {cells.map((slot, mIdx) => {
                    const crop = slot ? getCrop(slot.evaluation.cropId, catalog) : null;
                    const isFallow = !slot || slot.role === 'fallow';
                    const bg = isFallow ? '#d6d3d1' : crop?.color ?? '#16a34a';
                    const cropLabel = crop ? getCropName(crop, locale) : isEn ? 'Rest' : 'Descanso';
                    return (
                      <div
                        key={mIdx}
                        title={`${isEn ? 'Year' : 'Año'} ${Math.floor(mIdx / 12) + 1} · ${monthNames[mIdx % 12]}: ${cropLabel}`}
                        className="h-5 rounded-[3px] transition hover:opacity-80"
                        style={{
                          backgroundColor: bg,
                          borderLeft: mIdx % 12 === 0 && mIdx > 0 ? '2px solid #ffffff' : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
