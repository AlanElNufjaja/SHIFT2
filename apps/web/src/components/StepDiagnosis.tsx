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
import {
  MONTH_NAMES,
  getTextureLabel,
  lookupRegionalAquifer,
} from '@fieldshift/core';
import type { CriticalWindow, Locale, SiteProfile } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';
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

const SEVERITY_LABELS: Record<Locale, Record<'high' | 'medium' | 'low', string>> = {
  en: {
    high: 'Watch closely',
    medium: 'Heads up',
    low: 'Good opportunity',
  },
  es: {
    high: 'Cuidado importante',
    medium: 'Pon atención',
    low: 'Buena oportunidad',
  },
};

function describeWater(
  aridity: number,
  precip: number,
  et0: number,
  locale: Locale,
): { headline: string; note: string } {
  if (locale === 'en') {
    if (aridity < 0.2) {
      return {
        headline: 'Very dry climate — relies on irrigation',
        note: `Gets about ${precip} mm of rain per year while sun and wind dry ${et0} mm.`,
      };
    }
    if (aridity < 0.5) {
      return {
        headline: 'Low rainfall — depends heavily on irrigation',
        note: `Falls about ${precip} mm of rain per year compared to ${et0} mm dried by heat and wind.`,
      };
    }
    return {
      headline: 'Good rainfall — can work rainfed most years',
      note: `Gets ${precip} mm of rain per year (air drying pull: ${et0} mm).`,
    };
  }

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

function describeSoil(
  awc: number,
  om: number,
  texLabel: string,
  locale: Locale,
): { headline: string; note: string } {
  if (locale === 'en') {
    const retention =
      awc >= 145
        ? 'holds water well'
        : awc >= 105
        ? 'holds a fair amount of water'
        : 'dries out fast';
    return {
      headline: `Soil ${retention}`,
      note: `Type: ${texLabel} · Natural organic matter: ${om}%.`,
    };
  }
  const retention = awc >= 145 ? 'guarda bien el agua' : awc >= 105 ? 'guarda agua regular' : 'se seca rápido';
  return {
    headline: `Tierra que ${retention}`,
    note: `Tipo ${texLabel} · Abono natural (materia orgánica): ${om} %.`,
  };
}

function buildFieldWarnings(site: SiteProfile, locale: Locale): string[] {
  if (locale === 'es' && site.quality.warnings.length > 0) {
    return site.quality.warnings;
  }
  const list: string[] = [];
  if (site.climate.provenance === 'baseline') {
    list.push('Could not reach live weather feeds here: rainfall and heat are backup estimates, not direct readings.');
  }
  if (site.soil.provenance === 'baseline') {
    list.push('No detailed soil survey found here: check texture, pH, and salt with a local soil lab sample.');
  }
  if (!site.location.inCONUS) {
    list.push('Outside the U.S., U.S. crop maps and well logs do not apply — global NASA & soil maps are used instead.');
  }
  if (site.vegetation.provenance === 'unavailable') {
    list.push('Satellite greenness snapshots were unavailable here, so bare-ground risk uses your planting calendar.');
  }
  if (site.climate.crossCheck && Math.abs(site.climate.crossCheck.precipDiffPct) > 25) {
    list.push(
      `Noticeable rainfall difference between global weather feeds (${site.climate.crossCheck.precipDiffPct > 0 ? '+' : ''}${site.climate.crossCheck.precipDiffPct}%). Check against your own rain gauge.`,
    );
  }
  return list;
}

export function StepDiagnosis({ site, windows, parcelPolygon, onRefresh, onContinue }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';
  const monthNames = MONTH_NAMES[locale];

  const totalFrost = Math.round(site.climate.monthly.reduce((a, b) => a + b.frostDays, 0));
  const totalHeat = Math.round(site.climate.monthly.reduce((a, b) => a + b.heatDays, 0));

  const texLabel = getTextureLabel(site.soil.texture, locale);
  const waterSummary = describeWater(site.climate.aridityIndex, site.climate.annualPrecip, site.climate.annualET0, locale);
  const soilSummary = describeSoil(site.soil.awcMmPerM, site.soil.organicMatter, texLabel, locale);

  const bareCount = site.vegetation.bareSoilMonths.length;
  const bareHeadline = isEn
    ? bareCount >= 4
      ? `Bare dirt ${bareCount} months/yr`
      : bareCount > 0
      ? `Thin cover ${bareCount} month(s)`
      : 'Good plant cover most of the year'
    : bareCount >= 4
    ? `Tierra pelona ${bareCount} meses al año`
    : bareCount > 0
    ? `Poca cobertura en ${bareCount} mes(es)`
    : 'Buena cobertura gran parte del año';

  const tempHeadline = isEn
    ? totalHeat >= 25
      ? 'Very hot summers'
      : totalFrost >= 30
      ? 'Cold winters with regular frost'
      : 'Mild weather with few extremes'
    : totalHeat >= 25
    ? 'Veranos con mucho calor fuerte'
    : totalFrost >= 30
    ? 'Inviernos fríos con varias heladas'
    : 'Clima templado con pocos extremos';

  const warnings = buildFieldWarnings(site, locale);
  const regionalWaterNote = lookupRegionalAquifer(site.location.lat, site.location.lon, locale).note;
  const groundwaterSummary = isEn
    ? site.water.groundwater.sites.length > 0
      ? `${site.water.groundwater.sites.length} nearby monitoring well(s) checked within 25 km${
          site.water.groundwater.medianTrendMPerYr !== null
            ? ` (typical trend: ${site.water.groundwater.medianTrendMPerYr > 0 ? '+' : ''}${site.water.groundwater.medianTrendMPerYr} m/yr).`
            : '.'
        }`
      : site.location.inCONUS
      ? 'No USGS observation wells found within 25 km — rely on your own well water measurements.'
      : 'USGS well depth records cover the United States only.'
    : site.water.groundwater.summary;

  return (
    <div className="space-y-6">
      {/* Header + Main CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
        <div>
          <span className="rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 text-xs font-bold text-[#1B3B2B]">
            {isEn ? 'Step 2 of 5 · How your field looks' : 'Paso 2 de 5 · Así está tu parcela'}
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#2A2118]">
            {isEn ? `What we see at ${site.location.name}` : `Lo que vemos en ${site.location.name}`}
          </h1>
          <p className="mt-0.5 text-sm text-[#524333]">
            {isEn
              ? 'Here is the plain-English takeaway first. Open the sections below if you want maps or detailed numbers.'
              : 'Primero te mostramos lo más importante en palabras claras. Si quieres ver mapas o números técnicos, ábrelos abajo.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#234E36] px-5 py-3 text-sm font-bold text-[#FAF6EE] shadow-sm hover:bg-[#1B3B2B]"
        >
          {isEn ? 'Pick my crop & goals' : 'Elegir mi cultivo y lo que busco'}
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>

      {/* Plain-Language Summary Banner */}
      <div className="rounded-2xl border border-[#234E36]/30 bg-[#E7EFE9] p-5 shadow-card">
        <h2 className="text-base font-extrabold text-[#1B3B2B]">
          {isEn ? 'At a glance, here is your field:' : 'En resumen, así está tu campo:'}
        </h2>
        <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-[#1F3A2A]">
          <li>
            • <strong>{isEn ? 'Rain & water:' : 'Agua y lluvia:'}</strong> {waterSummary.headline}. {waterSummary.note}
          </li>
          <li>
            • <strong>{isEn ? 'Heat & freezes:' : 'Calor y heladas:'}</strong> {tempHeadline} (
            {isEn
              ? `${totalHeat} very hot days ≥35 °C and ${totalFrost} freezing nights per year`
              : `${totalHeat} días muy calientes ≥35 °C y ${totalFrost} días con helada al año`}
            ).
          </li>
          <li>
            • <strong>{isEn ? 'Your soil:' : 'Tu tierra:'}</strong> {soilSummary.headline}. {soilSummary.note}
          </li>
          <li>
            • <strong>{isEn ? 'Ground protection:' : 'Protección del suelo:'}</strong>{' '}
            {bareCount > 0
              ? isEn
                ? `Soil looks bare for ${bareCount} months (${site.vegetation.bareSoilMonths.map((m) => monthNames[m]).join(', ')}), leaving topsoil open to wind and storm washout.`
                : `Se ve tierra descubierta durante ${bareCount} meses (${site.vegetation.bareSoilMonths.map((m) => monthNames[m]).join(', ')}), donde el viento y la lluvia lavan tierra buena.`
              : isEn
              ? `Soil stays covered with plants or stubble most of the year (elevation ${site.terrain.elevationM} m, slope ${site.terrain.slopePct}%).`
              : `El terreno mantiene algo de planta o rastrojo la mayor parte del año (altura ${site.terrain.elevationM} m, inclinación ${site.terrain.slopePct} %).`}
          </li>
        </ul>
      </div>

      {/* 4 Easy-Read Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
            <Droplets className="h-4 w-4 text-sky-700" />
            {isEn ? 'Yearly rainfall' : 'Lluvia al año'}
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
            {isEn ? 'Heat & freezes' : 'Calor y heladas'}
          </span>
          <p className="mt-2 font-display text-xl font-extrabold text-[#2A2118]">
            {site.climate.meanTemp} °C {isEn ? 'avg' : 'promedio'}
          </p>
          <p className="mt-1 text-xs text-[#524333]">
            {isEn
              ? `${totalFrost} frost days · ${totalHeat} scorching days`
              : `${totalFrost} días de helada · ${totalHeat} días muy calientes`}
          </p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.climate.provenance} sources={site.climate.sources} compact />
          </div>
        </div>

        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#7A4B0A]">
            <Layers className="h-4 w-4 text-[#C87D18]" />
            {isEn ? 'Your dirt' : 'Tu tierra'}
          </span>
          <p className="mt-2 font-display text-xl font-extrabold text-[#2A2118]">
            {texLabel}
          </p>
          <p className="mt-1 text-xs text-[#524333]">
            {isEn
              ? `Holds ${site.soil.awcMmPerM} mm/m · Org. matter ${site.soil.organicMatter}%`
              : `Guarda ${site.soil.awcMmPerM} mm/m · Abono org. ${site.soil.organicMatter} %`}
          </p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.soil.provenance} sources={site.soil.sources} compact />
          </div>
        </div>

        <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#1B3B2B]">
            <Mountain className="h-4 w-4 text-[#234E36]" />
            {isEn ? 'Slope & cover' : 'Terreno y cobertura'}
          </span>
          <p className="mt-2 font-display text-xl font-extrabold text-[#2A2118]">
            {bareHeadline}
          </p>
          <p className="mt-1 text-xs text-[#524333]">
            {isEn
              ? `Slope ${site.terrain.slopePct}% · Elevation ${site.terrain.elevationM} m`
              : `Inclinación ${site.terrain.slopePct} % · Altura ${site.terrain.elevationM} m`}
          </p>
          <div className="mt-3">
            <ProvenanceBadge provenance={site.terrain.provenance} sources={site.terrain.sources} compact />
          </div>
        </div>
      </div>

      {/* Critical Windows — Important alerts first */}
      <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card sm:p-6">
        <h2 className="text-base font-extrabold text-[#2A2118]">
          {isEn ? 'Tough months & chances on your land' : 'Meses delicados y oportunidades en tu terreno'}
        </h2>
        <p className="mt-0.5 text-xs text-[#524333]">
          {isEn
            ? 'See which months bring dry stress, heat, frost, or bare-ground risks.'
            : 'Revisa en qué meses hay más riesgo por falta de agua, calor, heladas o tierra descubierta.'}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {windows.map((w, idx) => (
            <div key={`${w.kind}-${idx}`} className={`rounded-xl border p-4 ${SEVERITY_STYLE[w.severity]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wide">
                  {SEVERITY_LABELS[locale][w.severity]}
                </span>
                <div className="flex flex-wrap gap-1">
                  {w.months.slice(0, 6).map((m) => (
                    <span
                      key={m}
                      className="rounded-md bg-white/85 px-2 py-0.5 font-mono text-[11px] font-semibold text-stone-800"
                    >
                      {monthNames[m]}
                    </span>
                  ))}
                  {w.months.length > 6 && (
                    <span className="rounded-md bg-white/85 px-2 py-0.5 font-mono text-[11px] text-stone-700">
                      +{w.months.length - 6} {isEn ? 'mo' : 'meses'}
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
          title={isEn ? 'View field map & water / greenness layers' : 'Ver mapa de tu parcela y capas de agua / verdor'}
          subtitle={
            isEn
              ? 'Switch between satellite relief, topsoil moisture, daytime heat, and recent rainfall.'
              : 'Abre el mapa para cambiar entre vista satélite con relieve, humedad de la tierra, calor y lluvia reciente.'
          }
        >
          <GeospatialMap site={site} parcelPolygon={parcelPolygon} />
        </DetailsToggle>

        <DetailsToggle
          title={isEn ? 'View monthly rain, heat & greenness charts' : 'Ver gráficas de lluvia, calor y verdor por mes'}
          subtitle={
            isEn
              ? 'Month-by-month weather bars and 30-year local rainfall/warming shifts.'
              : 'Gráficas mes por mes y cómo ha cambiado el clima en los últimos 30 años.'
          }
        >
          <ClimateCharts site={site} />
        </DetailsToggle>

        <DetailsToggle
          title={
            isEn
              ? 'View groundwater wells, past crops & field-check notes'
              : 'Ver agua subterránea, historial de siembras y notas de precisión'
          }
          subtitle={
            isEn
              ? 'Nearby monitoring wells, what grew here before, data limits, and refresh button.'
              : 'Pozos cercanos, lo que se sembró antes, avisos sobre los límites de los datos y botón para actualizar.'
          }
        >
          <div className="space-y-5">
            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  {isEn ? 'Things worth checking directly on your field' : 'Qué conviene revisar directamente en tu campo'}
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-amber-900">
                  {warnings.map((w, i) => (
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
                    {isEn ? 'Well water & basin trend' : 'Agua de pozo y reserva subterránea'}
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
                  {regionalWaterNote ?? site.water.regionalStorageTrend.note}
                </p>
                {site.water.groundwater.sites.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-stone-800">{groundwaterSummary}</p>
                    <div className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
                      {site.water.groundwater.sites.map((st) => (
                        <div key={st.id} className="flex items-center justify-between px-3 py-2 text-xs">
                          <div>
                            <p className="font-semibold text-stone-800">{st.name}</p>
                            <p className="text-[11px] text-stone-500">
                              {isEn ? `${st.distanceKm} km away · ${st.nObs} readings` : `A ${st.distanceKm} km · ${st.nObs} mediciones`}
                            </p>
                          </div>
                          <div className="text-right font-mono">
                            <p className="font-semibold text-stone-800">
                              {st.lastDepthM !== null
                                ? `${st.lastDepthM} m ${isEn ? 'deep' : 'prof.'}`
                                : isEn
                                ? 'No reading'
                                : 'Sin dato'}
                            </p>
                            {st.trendMPerYr !== null && (
                              <p className={st.trendMPerYr < -0.05 ? 'text-rose-700' : 'text-emerald-700'}>
                                {st.trendMPerYr > 0 ? '+' : ''}
                                {st.trendMPerYr} {isEn ? 'm/yr' : 'm/año'}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-stone-600">{groundwaterSummary}</p>
                )}
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                    <Sprout className="h-4 w-4 text-emerald-700" />
                    {isEn ? 'Past crops spotted by satellite' : 'Lo que se vio sembrado años atrás'}
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
                  <p className="mt-2 text-xs text-stone-600">
                    {isEn
                      ? site.location.inCONUS
                        ? 'No USDA crop map record found for this exact point.'
                        : 'USDA crop history maps apply only to U.S. fields.'
                      : site.cropHistory.summary}
                  </p>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {isEn ? 'Refresh latest data' : 'Volver a consultar datos recientes'}
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
          {isEn ? 'Next: tell us your crop & goals' : 'Siguiente: decir qué siembro y qué busco'}
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>
    </div>
  );
}
