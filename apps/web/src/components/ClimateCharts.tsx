import { useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MONTH_NAMES_ES } from '@fieldshift/core';
import type { SiteProfile } from '@fieldshift/core';
import { ProvenanceBadge } from './ui/ProvenanceBadge';

type Tab = 'climate' | 'ndvi' | 'trends';

export function ClimateCharts({ site }: { site: SiteProfile }) {
  const [tab, setTab] = useState<Tab>('climate');

  const monthlyData = site.climate.monthly.map((m, idx) => ({
    name: MONTH_NAMES_ES[idx],
    precip: m.precip,
    et0: m.et0,
    tmax: m.tmax,
    tmin: m.tmin,
    ndvi: site.vegetation.monthlyNdvi[idx],
    soilWetPct: Math.round(m.soilWetness * 100),
  }));

  const hasNdvi = site.vegetation.monthlyNdvi.some((v) => v !== null);
  const hasTrends = site.climate.annualSeries.length >= 5;

  return (
    <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#2A2118]">
            Cómo cambian la lluvia, el calor y el verdor en el año
          </h3>
          <p className="text-xs text-[#524333]">
            {tab === 'climate' && 'Barras azules: lo que llueve al mes · Área naranja: el agua que el sol y el aire secan'}
            {tab === 'ndvi' && 'Verde: qué tan cubierta de plantas está la tierra · Azul: humedad arriba del suelo'}
            {tab === 'trends' && 'Cómo ha subido o bajado la lluvia y el calor en los últimos 30 años'}
          </p>
        </div>

        <div className="inline-flex flex-wrap rounded-xl border border-[#C8B89E] bg-[#EFE5D5] p-1 text-xs">
          <button
            type="button"
            onClick={() => setTab('climate')}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              tab === 'climate' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
            }`}
          >
            Lluvia y calor por mes
          </button>
          <button
            type="button"
            onClick={() => setTab('ndvi')}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              tab === 'ndvi' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
            }`}
          >
            Verdor y humedad
          </button>
          <button
            type="button"
            onClick={() => setTab('trends')}
            className={`rounded-lg px-3 py-1.5 font-bold transition ${
              tab === 'trends' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
            }`}
          >
            Últimos 30 años
          </button>
        </div>
      </div>

      <div className="mt-4 h-[280px] w-full">
        {tab === 'climate' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#57534e' }} />
              <YAxis
                yAxisId="mm"
                tick={{ fontSize: 11, fill: '#0369a1' }}
                label={{ value: 'Agua (mm)', angle: -90, position: 'insideLeft', offset: 18, style: { fontSize: 10, fill: '#0369a1' } }}
              />
              <YAxis
                yAxisId="temp"
                orientation="right"
                tick={{ fontSize: 11, fill: '#b45309' }}
                label={{ value: '°C', angle: 90, position: 'insideRight', offset: 14, style: { fontSize: 10, fill: '#b45309' } }}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, borderColor: '#e7e5e4', fontSize: 12 }}
                formatter={(value: unknown, name: string) => {
                  const labels: Record<string, string> = {
                    precip: 'Lluvia del mes (mm)',
                    et0: 'Agua que seca el aire (mm)',
                    tmax: 'Calor máximo de día (°C)',
                    tmin: 'Frío mínimo de noche (°C)',
                  };
                  return [String(value), labels[name] ?? name];
                }}
              />
              <Bar yAxisId="mm" dataKey="precip" fill="#0284c7" radius={[4, 4, 0, 0]} barSize={18} />
              <Area
                yAxisId="mm"
                type="monotone"
                dataKey="et0"
                fill="#fef3c7"
                stroke="#d97706"
                strokeWidth={2}
                fillOpacity={0.45}
              />
              <Line yAxisId="temp" type="monotone" dataKey="tmax" stroke="#dc2626" strokeWidth={2} dot={{ r: 2.5 }} />
              <Line yAxisId="temp" type="monotone" dataKey="tmin" stroke="#2563eb" strokeWidth={2} dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {tab === 'ndvi' && (
          hasNdvi ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#57534e' }} />
                <YAxis yAxisId="ndvi" domain={[0, 0.9]} tick={{ fontSize: 11, fill: '#15803d' }} />
                <YAxis yAxisId="wet" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#0284c7' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: '#e7e5e4', fontSize: 12 }}
                  formatter={(value: unknown, name: string) => {
                    if (name === 'ndvi') return [String(value), 'Verdor de plantas (0 a 1)'];
                    if (name === 'soilWetPct') return [`${value} %`, 'Humedad superficial (%)'];
                    return [String(value), name];
                  }}
                />
                <ReferenceLine
                  yAxisId="ndvi"
                  y={0.25}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{ value: 'Debajo de aquí = tierra pelona', position: 'insideTopLeft', fill: '#b45309', fontSize: 10 }}
                />
                <Area
                  yAxisId="ndvi"
                  type="monotone"
                  dataKey="ndvi"
                  fill="#bbf7d0"
                  stroke="#15803d"
                  strokeWidth={2.5}
                  connectNulls
                />
                <Line
                  yAxisId="wet"
                  type="monotone"
                  dataKey="soilWetPct"
                  stroke="#0284c7"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl bg-stone-50 px-4 text-center text-xs text-stone-600">
              No tuvimos suficientes fotos satelitales de verdor para este punto; usamos el calendario de tu cultivo.
            </div>
          )
        )}

        {tab === 'trends' && (
          hasTrends ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={site.climate.annualSeries} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#57534e' }} />
                <YAxis yAxisId="p" tick={{ fontSize: 11, fill: '#0284c7' }} />
                <YAxis yAxisId="t" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#dc2626' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: '#e7e5e4', fontSize: 12 }}
                  formatter={(value: unknown, name: string) => [
                    name === 'precip' ? `${value} mm/año` : `${value} °C`,
                    name === 'precip' ? 'Lluvia de todo el año' : 'Temperatura promedio',
                  ]}
                />
                <Bar yAxisId="p" dataKey="precip" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Line yAxisId="t" type="monotone" dataKey="tmean" stroke="#dc2626" strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl bg-stone-50 px-4 text-center text-xs text-stone-600">
              No hay historial largo disponible en modo de respaldo.
            </div>
          )
        )}
      </div>

      {/* Provenance & Simple Trend Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-xs text-stone-600">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge
            provenance={tab === 'ndvi' ? site.vegetation.provenance : site.climate.provenance}
            sources={tab === 'ndvi' ? site.vegetation.sources : site.climate.sources}
            compact
          />
          {site.climate.tempTrendCPerDecade && (
            <span>
              Cambio de calor:{' '}
              <strong className="text-stone-900">
                {site.climate.tempTrendCPerDecade.value > 0 ? '+' : ''}
                {site.climate.tempTrendCPerDecade.value} °C cada 10 años
              </strong>
            </span>
          )}
          {site.climate.recentPrecipAnomalyPct && (
            <span>
              · Último año llovió:{' '}
              <strong className="text-stone-900">
                {site.climate.recentPrecipAnomalyPct.value > 0 ? '+' : ''}
                {site.climate.recentPrecipAnomalyPct.value} % vs. lo normal
              </strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
