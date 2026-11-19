import {
  AlertTriangle,
  ArrowRight,
  Droplets,
  Flame,
  Layers,
  Mountain,
  RefreshCw,
  Sprout,
  Waves,
} from 'lucide-react';
import { MONTH_NAMES_ES } from '@fieldshift/core';
import type { CriticalWindow, SiteProfile } from '@fieldshift/core';
import { ClimateCharts } from './ClimateCharts';
import { GeospatialMap } from './GeospatialMap';
import { DetailsToggle } from './ui/DetailsToggle';
import { ProvenanceBadge } from './ui/ProvenanceBadge';

interface Props {
  site: SiteProfile;
  windows: CriticalWindow[];
  parcelPolygon?: [number, number][];
  onRefresh: () => void;
  onContinue: () => void;
}

const SEVERITY_STYLE = {
  high: 'border-rose-200 bg-rose-50/70 text-rose-950',
  medium: 'border-amber-200 bg-amber-50/70 text-amber-950',
  low: 'border-emerald-200 bg-emerald-50/60 text-emerald-950',
};

const SEVERITY_LABEL = {
  high: 'Cuidado importante',
  medium: 'Pon atención',
  low: 'Buena oportunidad',
};

function describeWater(aridity: number, precip: number, et0: number): { headline: string; note: string } {
  if (aridity < 0.2) {
    return {
      headline: 'Zona muy seca: ocupa riego seguro',
      note: `Llueve ${precip} mm al año, pero el sol y el aire secan ${et0} mm.`,
    };
  }
  if (aridity < 0.5) {
    return {
      headline: 'Llueve poco: depende mucho del riego',
      note: `Caen ${precip} mm de lluvia al año frente a ${et0} mm de evaporación.`,
    };
  }
  return {
    headline: 'Buena lluvia: puede trabajar de temporal',
    note: `Llueve ${precip} mm al año (demanda del aire: ${et0} mm).`,
  };
}

function describeSoil(awc: number, om: number, texture: string): { headline: string; note: string } {
  const retention = awc >= 145 ? 'guarda bien el agua' : awc >= 105 ? 'guarda agua regular' : 'se seca rápido';
  return {
    headline: `Tierra que ${retention}`,
    note: `Tipo ${texture} · Abono natural (materia orgánica): ${om} %.`,
  };
}

export function StepDiagnosis({ site, windows, parcelPolygon, onRefresh, onContinue }: Props) {
  const totalFrost = Math.round(site.climate.monthly.reduce((a, b) => a + b.frostDays, 0));
  const totalHeat = Math.round(site.climate.monthly.reduce((a, b) => a + b.heatDays, 0));

  const waterSummary = describeWater(site.climate.aridityIndex, site.climate.annualPrecip, site.climate.annualET0);
  const soilSummary = describeSoil(site.soil.awcMmPerM, site.soil.organicMatter, site.soil.texture);

  const bareCount = site.vegetation.bareSoilMonths.length;
  const bareHeadline =
    bareCount >= 4
      ? `Tierra pelona ${bareCount} meses al año`
      : bareCount > 0
      ? `Poca cobertura en ${bareCount} mes(es)`
      : 'Buena cobertura gran parte del año';

  const tempHeadline =
    totalHeat >= 25
      ? 'Veranos con mucho calor fuerte'
      : totalFrost >= 30
      ? 'Inviernos fríos con varias heladas'
      : 'Clima templado con pocos extremos';

  return (
    <div className="space-y-6">
      {/* Header + Main CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
        <div>
          <span className="rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 text-xs font-bold text-[#1B3B2B]">
            Paso 2 de 5 · Así está tu parcela
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#2A2118]">
            Lo que vemos en {site.location.name}
          </h1>
          <p className="mt-0.5 text-sm text-[#524333]">
            Primero te mostramos lo más importante en palabras claras. Si quieres ver mapas o números técnicos, ábrelos abajo.
          </p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#234E36] px-5 py-3 text-sm font-bold text-[#FAF6EE] shadow-sm hover:bg-[#1B3B2B]"
        >
          Elegir mi cultivo y lo que busco
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>

      {/* Plain-Language Summary Banner */}
      <div className="rounded-2xl border border-[#234E36]/30 bg-[#E7EFE9] p-5 shadow-card">
        <h2 className="text-base font-extrabold text-[#1B3B2B]">En resumen, así está tu campo:</h2>
        <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-[#1F3A2A]">
          <li>• <strong>Agua y lluvia:</strong> {waterSummary.headline}. {waterSummary.note}</li>
          <li>• <strong>Calor y heladas:</strong> {tempHeadline} ({totalHeat} días muy calientes ≥35 °C y {totalFrost} días con helada al año).</li>
          <li>• <strong>Tu tierra:</strong> {soilSummary.headline}. {soilSummary.note}</li>
          <li>
            • <strong>Protección del suelo:</strong>{' '}
            {bareCount > 0
              ? `Se ve tierra descubierta durante ${bareCount} meses (${site.vegetation.bareSoilMonths.map((m) => MONTH_NAMES_ES[m]).join(', ')}), donde el viento y la lluvia lavan tierra buena.`
              : `El terreno mantiene algo de planta o rastrojo la mayor parte del año (altura ${site.terrain.elevationM} m, inclinación ${site.terrain.slopePct} %).`}
          </li>
        </ul>
      </div>

      {/* 4 Easy-Read Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
            <Droplets className="h-4 w-4 text-sky-700" />
            Lluvia al año
          </span>
          <p className="mt-2 font-display text-xl font-extrabold text-[#2A2118]">
            {site.climate.annualPrecip} mm
          </p>
          <p className="mt-1 text-xs text-[#524333]">{waterSummary.headline}</p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.climate.provenance} sources={site.climate.sources} compact />
          </div>
        </div>

        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#8E3C1E]">
            <Flame className="h-4 w-4 text-[#A84A28]" />
            Calor y heladas
          </span>
          <p className="mt-2 font-display text-xl font-extrabold text-[#2A2118]">
            {site.climate.meanTemp} °C promedio
          </p>
          <p className="mt-1 text-xs text-[#524333]">
            {totalFrost} días de helada · {totalHeat} días muy calientes
          </p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.climate.provenance} sources={site.climate.sources} compact />
          </div>
        </div>

        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#7A4B0A]">
            <Layers className="h-4 w-4 text-[#C87D18]" />
            Tu tierra
          </span>
          <p className="mt-2 font-display text-xl font-extrabold capitalize text-[#2A2118]">
            {site.soil.texture}
          </p>
          <p className="mt-1 text-xs text-[#524333]">
            Guarda {site.soil.awcMmPerM} mm/m · Abono org. {site.soil.organicMatter} %
          </p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.soil.provenance} sources={site.soil.sources} compact />
          </div>
        </div>

        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#1B3B2B]">
            <Mountain className="h-4 w-4 text-[#234E36]" />
            Terreno y cobertura
          </span>
          <p className="mt-2 font-display text-xl font-extrabold text-[#2A2118]">
            {bareHeadline}
          </p>
          <p className="mt-1 text-xs text-[#524333]">
            Inclinación {site.terrain.slopePct} % · Altura {site.terrain.elevationM} m
          </p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.terrain.provenance} sources={site.terrain.sources} compact />
          </div>
        </div>
      </div>

      {/* Critical Windows — Important alerts first */}
      <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card sm:p-6">
        <h2 className="text-base font-extrabold text-[#2A2118]">
          Meses delicados y oportunidades en tu terreno
        </h2>
        <p className="mt-0.5 text-xs text-[#524333]">
          Revisa en qué meses hay más riesgo por falta de agua, calor, heladas o tierra descubierta.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {windows.map((w, idx) => (
            <div key={`${w.kind}-${idx}`} className={`rounded-xl border p-4 ${SEVERITY_STYLE[w.severity]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wide">
                  {SEVERITY_LABEL[w.severity]}
                </span>
                <div className="flex flex-wrap gap-1">
                  {w.months.slice(0, 6).map((m) => (
                    <span
                      key={m}
                      className="rounded-md bg-white/85 px-2 py-0.5 font-mono text-[11px] font-semibold text-stone-800"
                    >
                      {MONTH_NAMES_ES[m]}
                    </span>
                  ))}
                  {w.months.length > 6 && (
                    <span className="rounded-md bg-white/85 px-2 py-0.5 font-mono text-[11px] text-stone-700">
                      +{w.months.length - 6} meses
                    </span>
                  )}
                </div>
              </div>
              <h3 className="mt-1.5 text-sm font-bold">{w.title}</h3>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{w.detail}</p>
              <div className="mt-2.5">
                <ProvenanceBadge provenance={w.provenance} sources={w.sources} compact />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progressive Disclosure: Maps, Charts & Technical Data */}
      <div className="space-y-4">
        <DetailsToggle
          title="Ver mapa de tu parcela y capas de agua / verdor"
          subtitle="Abre el mapa para cambiar entre vista satélite con relieve, humedad de la tierra, calor y lluvia reciente."
        >
          <GeospatialMap site={site} parcelPolygon={parcelPolygon} />
        </DetailsToggle>

        <DetailsToggle
          title="Ver gráficas de lluvia, calor y verdor por mes"
          subtitle="Gráficas mes por mes y cómo ha cambiado el clima en los últimos 30 años."
        >
          <ClimateCharts site={site} />
        </DetailsToggle>

        <DetailsToggle
          title="Ver agua subterránea, historial de siembras y notas de precisión"
          subtitle="Pozos cercanos, lo que se sembró antes, avisos sobre los límites de los datos y botón para actualizar."
        >
          <div className="space-y-5">
            {site.quality.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  Qué conviene revisar directamente en tu campo
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-amber-900">
                  {site.quality.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                    <Waves className="h-4 w-4 text-sky-700" />
                    Agua de pozo y reserva subterránea
                  </h3>
                  <ProvenanceBadge
                    provenance={
                      site.water.groundwater.sites.length > 0
                        ? site.water.groundwater.provenance
                        : site.water.regionalStorageTrend.provenance
                    }
                    sources={
                      site.water.groundwater.sites.length > 0
                        ? site.water.groundwater.sources
                        : site.water.regionalStorageTrend.sources
                    }
                    compact
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-stone-700">
                  {site.water.regionalStorageTrend.note}
                </p>
                {site.water.groundwater.sites.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-stone-800">{site.water.groundwater.summary}</p>
                    <div className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
                      {site.water.groundwater.sites.map((st) => (
                        <div key={st.id} className="flex items-center justify-between px-3 py-2 text-xs">
                          <div>
                            <p className="font-semibold text-stone-800">{st.name}</p>
                            <p className="text-[11px] text-stone-500">A {st.distanceKm} km · {st.nObs} mediciones</p>
                          </div>
                          <div className="text-right font-mono">
                            <p className="font-semibold text-stone-800">
                              {st.lastDepthM !== null ? `${st.lastDepthM} m prof.` : 'Sin dato'}
                            </p>
                            {st.trendMPerYr !== null && (
                              <p className={st.trendMPerYr < -0.05 ? 'text-rose-700' : 'text-emerald-700'}>
                                {st.trendMPerYr > 0 ? '+' : ''}
                                {st.trendMPerYr} m/año
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-stone-600">{site.water.groundwater.summary}</p>
                )}
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                    <Sprout className="h-4 w-4 text-emerald-700" />
                    Lo que se vio sembrado años atrás
                  </h3>
                  <ProvenanceBadge provenance={site.cropHistory.provenance} sources={site.cropHistory.sources} compact />
                </div>
                {site.cropHistory.years.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {site.cropHistory.years.map((y) => (
                      <div key={y.year} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs">
                        <span className="font-mono font-bold text-stone-700">{y.year}</span>
                        <p className="font-semibold text-stone-900">{y.cdlName}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-stone-600">{site.cropHistory.summary}</p>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Volver a consultar datos recientes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </DetailsToggle>
      </div>

      {/* Bottom CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#234E36] px-6 py-3.5 text-sm font-bold text-[#FAF6EE] shadow-sm hover:bg-[#1B3B2B]"
        >
          Siguiente: decir qué siembro y qué busco
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>
    </div>
  );
}
