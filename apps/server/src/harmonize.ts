import {
  ALL_SOURCE_IDS,
  DAYS_IN_MONTH,
  SOURCES,
  buildSyntheticClimate,
  buildSyntheticSoil,
  buildSyntheticTerrain,
  clamp,
  hargreavesET0,
  lookupRegionalAquifer,
} from '@fieldshift/core';
import type {
  ClimateProfile,
  MonthlyClimate,
  Provenance,
  SiteProfile,
  SourceId,
  SourceReport,
} from '@fieldshift/core';
import { fetchCdlHistory } from './connectors/cdl';
import { fetchCmrAndStac } from './connectors/cmrAndStac';
import { fetchElevation } from './connectors/elevation';
import { fetchEra5 } from './connectors/era5';
import { reverseGeocode } from './connectors/geocode';
import { fetchModis } from './connectors/modis';
import { fetchNasaPower } from './connectors/nasaPower';
import { fetchNlcd } from './connectors/nlcd';
import { fetchOpenEt } from './connectors/optionalKeys';
import { fetchSoil } from './connectors/soil';
import { fetchUsgsWater } from './connectors/usgsWater';
import { getCached, setCached } from './lib/cache';
import { buildAnalysisGrid, isInCONUS } from './lib/geo';

export interface ProgressEvent {
  step: string;
  label: string;
  status: 'done' | 'fallback' | 'unavailable' | 'cached';
  ms: number;
  summary: string;
  doneCount: number;
  totalCount: number;
}

const REFERENCE_IDS: SourceId[] = [
  'wss',
  'statsgo2',
  'ams-market-news',
  'ag-data-commons',
  'fao-gaez',
  'prism',
  'cocorahs',
  'landfire',
];

function markProfileCached(profile: SiteProfile): SiteProfile {
  const sources = profile.sources.map((s) =>
    s.status === 'live' ? { ...s, status: 'cached' as const, ms: 0 } : s,
  );
  const liveOrCached = sources.filter((s) => s.status === 'live' || s.status === 'cached').length;
  return {
    ...profile,
    sources,
    quality: {
      ...profile.quality,
      liveSources: 0,
      cachedSources: liveOrCached,
    },
  };
}

export async function buildSiteProfile(
  lat: number,
  lon: number,
  opts?: {
    name?: string;
    refresh?: boolean;
    onProgress?: (evt: ProgressEvent) => void;
  },
): Promise<SiteProfile> {
  const id = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cacheKey = `site_v1_${id}`;

  if (!opts?.refresh) {
    const cached = await getCached<SiteProfile>(cacheKey);
    if (cached.hit) {
      const profile = markProfileCached(cached.data);
      if (opts?.name && profile.location.name !== opts.name) {
        profile.location = { ...profile.location, name: opts.name };
      }
      opts?.onProgress?.({
        step: 'cache',
        label: 'Caché armonizada de parcela',
        status: 'cached',
        ms: 0,
        summary: `Recuperado de caché (${cached.cachedAt.slice(0, 16).replace('T', ' ')} UTC)`,
        doneCount: 9,
        totalCount: 9,
      });
      return profile;
    }
  }

  const inCONUS = isInCONUS(lat, lon);
  const totalCount = 9;
  let doneCount = 0;

  const emit = (
    step: string,
    label: string,
    status: ProgressEvent['status'],
    ms: number,
    summary: string,
  ) => {
    doneCount++;
    opts?.onProgress?.({ step, label, status, ms, summary, doneCount, totalCount });
  };

  const track = async <T>(
    step: string,
    label: string,
    fn: () => Promise<T>,
    describe: (val: T) => { status: ProgressEvent['status']; ms: number; summary: string },
  ): Promise<T | null> => {
    const t0 = Date.now();
    try {
      const val = await fn();
      const d = describe(val);
      emit(step, label, d.status, d.ms, d.summary);
      return val;
    } catch (err) {
      emit(step, label, 'unavailable', Date.now() - t0, err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const [
    geoInfo,
    powerRes,
    era5Res,
    modisRes,
    elevRes,
    soilRes,
    cdlRes,
    nlcdRes,
    usgsRes,
    cmrStacRes,
    openEtRes,
  ] = await Promise.all([
    opts?.name
      ? Promise.resolve<{ name: string; region?: string; country?: string; countryCode?: string }>({ name: opts.name })
      : reverseGeocode(lat, lon),
    track(
      'nasa-power',
      'NASA POWER (agroclimatología)',
      () => fetchNasaPower(lat, lon),
      (v) => ({ status: v.ok ? 'done' : 'unavailable', ms: v.report.ms, summary: v.report.summary }),
    ),
    track(
      'era5',
      'ECMWF ERA5-Land (ET₀ y humedad)',
      () => fetchEra5(lat, lon),
      (v) => ({ status: v.ok ? 'done' : 'unavailable', ms: v.report.ms, summary: v.report.summary }),
    ),
    track(
      'modis',
      'NASA MODIS NDVI + LST',
      () => fetchModis(lat, lon),
      (v) => ({ status: v.ok ? 'done' : 'unavailable', ms: v.report.ms, summary: v.report.summary }),
    ),
    track(
      'srtm',
      'Elevación y pendiente (SRTM / Copernicus)',
      () => fetchElevation(lat, lon),
      (v) => ({
        status: v.terrain.provenance === 'live' ? 'done' : 'fallback',
        ms: v.reports.reduce((a, b) => Math.max(a, b.ms), 0),
        summary: v.reports[0]?.summary ?? `${v.terrain.elevationM} m`,
      }),
    ),
    track(
      'soil',
      'Suelo (USDA SSURGO / ISRIC SoilGrids)',
      () => fetchSoil(lat, lon, inCONUS),
      (v) => ({
        status: v.soil.provenance === 'live' ? 'done' : 'fallback',
        ms: v.reports.reduce((a, b) => Math.max(a, b.ms), 0),
        summary: `${v.soil.texture}, AWC ${v.soil.awcMmPerM} mm/m`,
      }),
    ),
    track(
      'cdl',
      'Historial agrícola (USDA CropScape CDL)',
      () => fetchCdlHistory(lat, lon, inCONUS),
      (v) => ({
        status: v.report.status === 'live' ? 'done' : 'unavailable',
        ms: v.report.ms,
        summary: v.report.summary,
      }),
    ),
    track(
      'nlcd',
      'Cobertura de suelo (USGS NLCD)',
      () => fetchNlcd(lat, lon, inCONUS),
      (v) => ({
        status: v.report.status === 'live' ? 'done' : 'unavailable',
        ms: v.report.ms,
        summary: v.report.summary,
      }),
    ),
    track(
      'usgs-water',
      'Acuíferos / Pozos USGS Water',
      () => fetchUsgsWater(lat, lon, inCONUS),
      (v) => ({
        status: v.report.status === 'live' ? 'done' : 'unavailable',
        ms: v.report.ms,
        summary: v.report.summary,
      }),
    ),
    track(
      'cmr-stac',
      'Catálogos NASA CMR + Sentinel-2 / NAIP',
      () => fetchCmrAndStac(lat, lon, inCONUS),
      (v) => ({
        status: v.imagery.length > 0 ? 'done' : 'unavailable',
        ms: v.reports.reduce((a, b) => Math.max(a, b.ms), 0),
        summary: `${v.imagery.length} colecciones con cobertura confirmada`,
      }),
    ),
    fetchOpenEt(lat, lon, inCONUS),
  ]);

  // ── Harmonize climate (POWER + ERA5 bias-correction & cross-check) ─────────
  let monthly: MonthlyClimate[];
  let climProvenance: Provenance;
  let climSources: SourceId[];
  let climPeriod: string;
  let climResolution: string;
  let climConfidence: number;
  let et0BiasFactor = 1;
  let crossCheck: ClimateProfile['crossCheck'];

  if (powerRes?.ok && powerRes.monthly.length === 12) {
    monthly = powerRes.monthly.map((m) => ({ ...m }));
    climProvenance = 'live';
    climSources = ['nasa-power'];
    climPeriod = powerRes.period;
    climResolution = '0.5° × 0.625° (~55 km, POWER) + 0.1° (ERA5 ET₀)';
    climConfidence = 0.86;

    if (era5Res?.ok && era5Res.monthlyEt0.length === 12) {
      climSources.push('era5');
      const powerEt0Sum = monthly.reduce((a, b) => a + b.et0, 0);
      const era5Et0Sum = era5Res.monthlyEt0.reduce((a, b) => a + b, 0);
      if (powerEt0Sum > 50 && era5Et0Sum > 50) {
        et0BiasFactor = +clamp(era5Et0Sum / powerEt0Sum, 0.72, 1.35).toFixed(2);
        monthly = monthly.map((m, idx) => ({
          ...m,
          et0: +era5Res.monthlyEt0[idx].toFixed(1),
        }));
      }
      const pMeanT = monthly.reduce((a, b) => a + b.tmean, 0) / 12;
      const eMeanT = era5Res.monthlyTmean.reduce((a, b) => a + b, 0) / 12;
      const pSumP = monthly.reduce((a, b) => a + b.precip, 0);
      const eSumP = era5Res.monthlyPrecip.reduce((a, b) => a + b, 0);
      crossCheck = {
        tempDiffC: +(pMeanT - eMeanT).toFixed(1),
        precipDiffPct: eSumP > 10 ? Math.round(((pSumP - eSumP) / eSumP) * 100) : 0,
      };
      climConfidence = 0.91;
    }
  } else if (era5Res?.ok && era5Res.monthlyPrecip.length === 12) {
    // Fallback to ERA5 alone when POWER is down
    const synth = buildSyntheticClimate(lat, lon).monthly;
    monthly = synth.map((s, m) => ({
      ...s,
      tmean: era5Res.monthlyTmean[m] ?? s.tmean,
      tmax: +( (era5Res.monthlyTmean[m] ?? s.tmean) + 6 ).toFixed(1),
      tmin: +( (era5Res.monthlyTmean[m] ?? s.tmean) - 6 ).toFixed(1),
      precip: era5Res.monthlyPrecip[m] ?? s.precip,
      et0: era5Res.monthlyEt0[m] ?? +(hargreavesET0(s.tmean, s.tmax, s.tmin, s.srad) * DAYS_IN_MONTH[m]).toFixed(1),
      soilWetness: era5Res.monthlySoilMoisture[m] ? +clamp(era5Res.monthlySoilMoisture[m] * 2.2, 0.1, 0.95).toFixed(2) : s.soilWetness,
    }));
    climProvenance = 'live';
    climSources = ['era5'];
    climPeriod = 'Últimos 5 años (ECMWF ERA5-Land)';
    climResolution = '0.1° (~9 km)';
    climConfidence = 0.78;
  } else {
    const synth = buildSyntheticClimate(lat, lon);
    monthly = synth.monthly;
    climProvenance = 'baseline';
    climSources = ['fieldshift-baseline'];
    climPeriod = synth.period;
    climResolution = 'Modelo sintético latitudinal';
    climConfidence = 0.35;
  }

  const annualPrecip = Math.round(monthly.reduce((a, b) => a + b.precip, 0));
  const annualET0 = Math.round(monthly.reduce((a, b) => a + b.et0, 0));
  const meanTemp = +(monthly.reduce((a, b) => a + b.tmean, 0) / 12).toFixed(1);
  const aridityIndex = +(annualPrecip / Math.max(1, annualET0)).toFixed(2);

  // Merge recent 24-month observations from POWER + ERA5
  const recentMap = new Map((powerRes?.recent ?? []).map((r) => [r.period, { ...r }]));
  for (const er of era5Res?.recent ?? []) {
    const cur = recentMap.get(er.period) ?? { period: er.period };
    recentMap.set(er.period, {
      ...cur,
      et0: er.et0,
      soilMoisture: er.soilMoisture,
      precip: cur.precip ?? er.precip,
      tmean: cur.tmean ?? er.tmean,
    });
  }
  const recent = Array.from(recentMap.values()).sort((a, b) => a.period.localeCompare(b.period)).slice(-24);

  // Recent 12-month precip & temp anomaly
  const last12 = recent.slice(-12);
  const recentPrecipAnomalyPct =
    last12.length >= 6 && last12.some((r) => r.precipAnomalyPct !== undefined)
      ? {
          value: Math.round(
            last12.reduce((a, r) => a + (r.precipAnomalyPct ?? 0), 0) /
              Math.max(1, last12.filter((r) => r.precipAnomalyPct !== undefined).length),
          ),
          unit: '%',
          provenance: 'derived' as const,
          sources: ['nasa-power'] as SourceId[],
          confidence: 0.85,
          method: 'Anomalía media últimos 12 meses vs promedio 2016–2025',
        }
      : null;

  const recentTempAnomalyC =
    last12.length >= 6 && last12.some((r) => r.tempAnomalyC !== undefined)
      ? {
          value: +(
            last12.reduce((a, r) => a + (r.tempAnomalyC ?? 0), 0) /
            Math.max(1, last12.filter((r) => r.tempAnomalyC !== undefined).length)
          ).toFixed(2),
          unit: '°C',
          provenance: 'derived' as const,
          sources: ['nasa-power'] as SourceId[],
          confidence: 0.85,
          method: 'Desviación media últimos 12 meses vs promedio 2016–2025',
        }
      : null;

  const climate: ClimateProfile = {
    monthly,
    provenance: climProvenance,
    sources: climSources,
    period: climPeriod,
    resolution: climResolution,
    confidence: climConfidence,
    annualPrecip,
    annualET0,
    meanTemp,
    aridityIndex,
    annualSeries: powerRes?.annualSeries ?? [],
    tempTrendCPerDecade:
      powerRes?.tempTrendCPerDecade !== null && powerRes?.tempTrendCPerDecade !== undefined
        ? {
            value: powerRes.tempTrendCPerDecade,
            unit: '°C/década',
            provenance: 'derived',
            sources: ['nasa-power'],
            resolution: '0.5° × 0.625°',
            confidence: 0.82,
            method: 'Regresión lineal OLS 1995–2025 (NASA POWER)',
          }
        : null,
    precipTrendPctPerDecade:
      powerRes?.precipTrendPctPerDecade !== null && powerRes?.precipTrendPctPerDecade !== undefined
        ? {
            value: powerRes.precipTrendPctPerDecade,
            unit: '%/década',
            provenance: 'derived',
            sources: ['nasa-power'],
            resolution: '0.5° × 0.625°',
            confidence: 0.72,
            method: 'Regresión lineal OLS 1995–2025 (NASA POWER)',
          }
        : null,
    recent,
    recentPrecipAnomalyPct,
    recentTempAnomalyC,
    et0BiasFactor,
    crossCheck,
  };

  // ── Soil & Terrain ──────────────────────────────────────────────────────────
  const soil = soilRes?.soil ?? buildSyntheticSoil(lat, lon);
  const terrain = elevRes?.terrain ?? buildSyntheticTerrain(lat, lon);

  // ── Vegetation ──────────────────────────────────────────────────────────────
  const modisOk = Boolean(modisRes?.ok);
  const vegetation = {
    provenance: (modisOk ? 'live' : 'unavailable') as Provenance,
    sources: modisOk
      ? (['modis', ...(nlcdRes?.landCover ? ['nlcd'] : [])] as SourceId[])
      : (['modis'] as SourceId[]),
    confidence: modisOk ? 0.82 : 0.25,
    resolution: '250 m NDVI / 1 km LST (MODIS)',
    series: modisRes?.series ?? [],
    monthlyNdvi: modisRes?.monthlyNdvi ?? Array(12).fill(null),
    peakMonth: modisRes?.peakMonth ?? null,
    peakNdvi: modisRes?.peakNdvi ?? null,
    bareSoilMonths: modisRes?.bareSoilMonths ?? [],
    greenMonths: modisRes?.greenMonths ?? 0,
    monthlyLstDay: modisRes?.monthlyLstDay ?? Array(12).fill(null),
    annualActualET: null,
    landCover: nlcdRes?.landCover ?? null,
  };

  // ── Water ───────────────────────────────────────────────────────────────────
  const water = {
    regionalStorageTrend: lookupRegionalAquifer(lat, lon),
    groundwater: usgsRes?.groundwater ?? {
      provenance: 'unavailable' as Provenance,
      sources: ['usgs-water'] as SourceId[],
      sites: [],
      medianTrendMPerYr: null,
      summary: 'No consultado',
    },
    soilMoistureAnomaly:
      era5Res?.latestSoilMoistureAnomaly !== null && era5Res?.latestSoilMoistureAnomaly !== undefined
        ? {
            value: era5Res.latestSoilMoistureAnomaly,
            unit: 'fracción',
            provenance: 'derived' as const,
            sources: ['era5'] as SourceId[],
            resolution: '0.1° (~9 km)',
            confidence: 0.78,
            method: 'Último mes completo ERA5-Land 0–7 cm vs media 5 años del mismo mes',
          }
        : null,
    openetAnnualMm: openEtRes.openetAnnualMm,
  };

  const cropHistory = cdlRes?.cropHistory ?? {
    provenance: 'unavailable' as Provenance,
    sources: ['cdl'] as SourceId[],
    years: [],
    maxConsecutiveSameFamily: 0,
    dominantCropId: null,
    summary: 'Sin historial CDL disponible',
  };

  // ── Collect SourceReports for all 34 sources ────────────────────────────────
  const reportMap = new Map<SourceId, SourceReport>();
  const register = (r: SourceReport | undefined) => {
    if (r) reportMap.set(r.id, r);
  };

  register(powerRes?.report);
  register(era5Res?.report);
  register(modisRes?.report);
  elevRes?.reports.forEach(register);
  soilRes?.reports.forEach(register);
  register(cdlRes?.report);
  register(nlcdRes?.report);
  register(usgsRes?.report);
  cmrStacRes?.reports.forEach(register);
  register(openEtRes.report);

  // nass-quickstats
  reportMap.set('nass-quickstats', {
    id: 'nass-quickstats',
    status: process.env.NASS_API_KEY ? 'live' : 'key-required',
    mode: 'key-required',
    ms: 0,
    summary: process.env.NASS_API_KEY
      ? 'Disponible vía /api/crops con NASS_API_KEY'
      : 'Precios base 2023–2024; configure NASS_API_KEY para actualización automática.',
  });

  // Reference datasets
  for (const refId of REFERENCE_IDS) {
    if (!reportMap.has(refId)) {
      reportMap.set(refId, {
        id: refId,
        status: 'reference',
        mode: SOURCES[refId].mode,
        ms: 0,
        summary: SOURCES[refId].usedFor,
      });
    }
  }

  const usedBaseline =
    climate.provenance === 'baseline' || soil.provenance === 'baseline' || terrain.provenance === 'baseline';

  reportMap.set('fieldshift-baseline', {
    id: 'fieldshift-baseline',
    status: usedBaseline ? 'fallback' : 'not-applicable',
    mode: 'values',
    ms: 0,
    summary: usedBaseline
      ? 'Activado como respaldo transparente en al menos una dimensión sin datos en vivo.'
      : 'No fue necesario: las dimensiones principales obtuvieron datos en vivo.',
  });
  reportMap.set('fieldshift-catalog', {
    id: 'fieldshift-catalog',
    status: 'live',
    mode: 'values',
    ms: 0,
    summary: '25 cultivos y coberturas con parámetros FAO-56, N, suelo y mercado.',
  });
  reportMap.set('user-input', {
    id: 'user-input',
    status: 'live',
    mode: 'values',
    ms: 0,
    summary: 'Listo para recibir restricciones, cultivo actual y prioridades.',
  });

  const sources: SourceReport[] = ALL_SOURCE_IDS.map((sid) => {
    return (
      reportMap.get(sid) ?? {
        id: sid,
        status: 'unavailable',
        mode: SOURCES[sid].mode,
        ms: 0,
        summary: 'No consultado',
      }
    );
  });

  const liveSources = sources.filter((s) => s.status === 'live').length;
  const fallbackSources = sources.filter((s) => s.status === 'fallback').length;
  const unavailableSources = sources.filter((s) => s.status === 'unavailable').length;

  // Overall data confidence
  const overall = +clamp(
    climate.confidence * 0.4 +
      soil.confidence * 0.25 +
      terrain.confidence * 0.15 +
      vegetation.confidence * 0.2,
    0.25,
    0.95,
  ).toFixed(2);

  const warnings: string[] = [];
  if (climate.provenance === 'baseline') {
    warnings.push('No se pudo conectar con NASA POWER ni ERA5: el clima usa modelo sintético de respaldo (no mediciones).');
  }
  if (soil.provenance === 'baseline') {
    warnings.push('Sin datos de SSURGO ni SoilGrids en este punto: el suelo usa textura franca de respaldo; realice análisis de laboratorio.');
  }
  if (!inCONUS) {
    warnings.push('Parcela fuera de EE. UU. (CONUS): USDA SSURGO, CropScape CDL, NLCD y pozos USGS no aplican; se usan fuentes globales (NASA POWER, ERA5, MODIS, SRTM, SoilGrids).');
  }
  if (vegetation.provenance === 'unavailable') {
    warnings.push('MODIS NDVI no devolvió serie para este punto; la detección de suelo desnudo se basa en el calendario de cultivo.');
  }
  if (crossCheck && Math.abs(crossCheck.precipDiffPct) > 25) {
    warnings.push(
      `Diferencia notable de lluvia entre NASA POWER (55 km) y ERA5-Land (9 km): ${crossCheck.precipDiffPct > 0 ? '+' : ''}${crossCheck.precipDiffPct} %. Verifique con pluviómetro local.`,
    );
  }

  const profile: SiteProfile = {
    id,
    generatedAt: new Date().toISOString(),
    location: {
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      name: opts?.name ?? geoInfo.name,
      region: geoInfo.region,
      country: geoInfo.country,
      countryCode: geoInfo.countryCode,
      inCONUS,
    },
    grid: buildAnalysisGrid(lat, lon),
    climate,
    soil,
    terrain,
    vegetation,
    water,
    cropHistory,
    imagery: cmrStacRes?.imagery ?? [],
    sources,
    quality: {
      overall,
      liveSources,
      cachedSources: 0,
      fallbackSources,
      unavailableSources,
      warnings,
    },
  };

  await setCached(cacheKey, profile, 24 * 3600_000);
  return profile;
}
