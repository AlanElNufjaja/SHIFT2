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
import { getCrop, MONTH_NAMES_ES } from '@fieldshift/core';
import type { Crop, Strategy, StrategyArchetype } from '@fieldshift/core';

const STRATEGY_COLORS = ['#15803d', '#0284c7', '#d97706', '#c2410c', '#64748b'];

const ARCHETYPE_SHORT_ES: Record<StrategyArchetype, string> = {
  current: 'Lo que siembras hoy',
  'water-soil': 'Ahorrar agua y cuidar tierra',
  diversified: 'Cambiar cultivo y dar abono',
  income: 'Mejor ganancia',
  forage: 'Más pastura',
  'priority-optimal': 'Cambio paso a paso',
};

interface Props {
  strategies: Strategy[];
  catalog: Crop[];
}

export function StrategyCharts({ strategies, catalog }: Props) {
  const topForRadar = strategies.slice(0, 3);
  const current = strategies.find((s) => s.isCurrent);
  const radarStrategies =
    current && !topForRadar.some((s) => s.id === current.id)
      ? [...topForRadar.slice(0, 2), current]
      : topForRadar;

  const barData = strategies.map((s) => ({
    name: s.isCurrent ? 'Hoy' : `Opción #${s.rank}`,
    agua: s.metrics.irrigationMm,
    ingreso: s.metrics.netIncomePerHa,
  }));

  const axes = [
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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Bar comparison */}
        <div className="rounded-2xl border border-[#C8B89E] bg-white p-5 shadow-card lg:col-span-7">
          <h3 className="text-sm font-bold text-stone-900">
            Comparación de agua de riego y ganancia por hectárea
          </h3>
          <p className="text-xs text-stone-600">
            Agua que pide cada opción (azul) frente a lo que te queda libre aprox. al año (verde).
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
                    name === 'agua' ? `${value} mm/año` : `$${Number(value).toLocaleString('en-US')} USD/ha`,
                    name === 'agua' ? 'Agua que ocupa (mm)' : 'Ganancia aprox. (USD/ha)',
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="w" dataKey="agua" name="Agua que ocupa (mm)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="usd" dataKey="ingreso" name="Ganancia aprox. (USD/ha)" fill="#15803d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar */}
        <div className="rounded-2xl border border-[#C8B89E] bg-white p-5 shadow-card lg:col-span-5">
          <h3 className="text-sm font-bold text-stone-900">En qué es más fuerte cada opción (0–100)</h3>
          <p className="text-xs text-stone-600">
            Mientras más abierto el dibujo hacia una esquina, mejor responde en ese punto.
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
                    name={s.isCurrent ? 'Hoy' : `#${s.rank} ${ARCHETYPE_SHORT_ES[s.archetype]}`}
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
            <h3 className="text-sm font-bold text-stone-900">Calendario de siembras a 3 años (mes a mes)</h3>
            <p className="text-xs text-stone-600">
              Cada cuadrito es un mes. Pasa el dedo o ratón por encima para ver qué cultivo está en la tierra.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-stone-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Cultivo principal
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-teal-500" /> Planta de cobertura
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-stone-300" /> Tierra en descanso
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
                    #{s.rank} · {s.isCurrent ? 'Hoy: ' : ''}
                    {s.sequenceLabel}
                  </span>
                  <span className="font-mono text-[11px] text-stone-500">
                    Tierra tapada {s.metrics.groundCoverPct} % · {s.metrics.bareMonths} m pelona/año
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
                    return (
                      <div
                        key={mIdx}
                        title={`Año ${Math.floor(mIdx / 12) + 1} · ${MONTH_NAMES_ES[mIdx % 12]}: ${crop?.name ?? 'Descanso'}`}
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
