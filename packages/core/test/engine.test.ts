import { describe, expect, it } from 'vitest';
import {
  ALL_SOURCE_IDS,
  GLOSSARY,
  PILOT_PARCELS,
  SOURCES,
  analyzeSite,
  buildSyntheticClimate,
  buildSyntheticSoil,
  buildSyntheticTerrain,
  defaultFarmerInputs,
  evaluateCrop,
  getCrop,
  getGlossary,
  getSourceMeta,
  localizePilot,
  lookupRegionalAquifer,
} from '../src';
import type { SiteProfile } from '../src';

function makeTestSite(lat: number, lon: number, name: string, inCONUS = false): SiteProfile {
  const { monthly, period } = buildSyntheticClimate(lat, lon);
  const soil = buildSyntheticSoil(lat, lon);
  const terrain = buildSyntheticTerrain(lat, lon);
  const annualPrecip = Math.round(monthly.reduce((a, b) => a + b.precip, 0));
  const annualET0 = Math.round(monthly.reduce((a, b) => a + b.et0, 0));
  const meanTemp = +(monthly.reduce((a, b) => a + b.tmean, 0) / 12).toFixed(1);

  return {
    id: `${lat.toFixed(2)},${lon.toFixed(2)}`,
    generatedAt: '2026-11-19T12:00:00Z',
    location: { lat, lon, name, inCONUS },
    grid: {
      cellId: `N${lat.toFixed(2)}_W${Math.abs(lon).toFixed(2)}@0.01`,
      cellSizeDeg: 0.01,
      center: { lat, lon },
      bounds: [[lat - 0.005, lon - 0.005], [lat + 0.005, lon + 0.005]],
      nativeCells: [],
    },
    climate: {
      monthly,
      provenance: 'baseline',
      sources: ['fieldshift-baseline'],
      period,
      resolution: 'Sintético latitudinal',
      confidence: 0.5,
      annualPrecip,
      annualET0,
      meanTemp,
      aridityIndex: +(annualPrecip / Math.max(1, annualET0)).toFixed(2),
      annualSeries: [],
      tempTrendCPerDecade: null,
      precipTrendPctPerDecade: null,
      recent: [],
      recentPrecipAnomalyPct: null,
      recentTempAnomalyC: null,
      et0BiasFactor: 1,
    },
    soil,
    terrain,
    vegetation: {
      provenance: 'baseline',
      sources: ['fieldshift-baseline'],
      confidence: 0.4,
      resolution: 'N/A',
      series: [],
      monthlyNdvi: Array(12).fill(null),
      peakMonth: null,
      peakNdvi: null,
      bareSoilMonths: [0, 1, 10, 11],
      greenMonths: 5,
      monthlyLstDay: Array(12).fill(null),
      annualActualET: null,
    },
    water: {
      regionalStorageTrend: lookupRegionalAquifer(lat, lon),
      groundwater: {
        provenance: 'unavailable',
        sources: [],
        sites: [],
        medianTrendMPerYr: null,
        summary: 'Sin pozos en prueba unitaria',
      },
      soilMoistureAnomaly: null,
      openetAnnualMm: null,
    },
    cropHistory: {
      provenance: 'unavailable',
      sources: [],
      years: [],
      maxConsecutiveSameFamily: 0,
      dominantCropId: null,
      summary: 'Sin historial CDL',
    },
    imagery: [],
    sources: [],
    quality: {
      overall: 0.6,
      liveSources: 0,
      cachedSources: 0,
      fallbackSources: 3,
      unavailableSources: 0,
      warnings: [],
    },
  };
}

describe('Field Shift Core Engine', () => {
  it('documents all 34 SourceIds in SOURCES registry', () => {
    expect(ALL_SOURCE_IDS.length).toBe(34);
    for (const id of ALL_SOURCE_IDS) {
      expect(SOURCES[id]).toBeDefined();
      expect(SOURCES[id].name.length).toBeGreaterThan(2);
      expect(SOURCES[id].limitations.length).toBeGreaterThan(5);
    }
  });

  it('evaluates arid vs temperate crops with physically consistent water deficits & chill hours', () => {
    const semiArid = makeTestSite(28.19, -105.47, 'Delicias, MX');
    const temperate = makeTestSite(42.02, -93.62, 'Ames, IA', true);

    const alfalfaArid = evaluateCrop(getCrop('alfalfa'), semiArid.climate.monthly, semiArid.soil, 0, 'none');
    const sorghumArid = evaluateCrop(getCrop('sorghum'), semiArid.climate.monthly, semiArid.soil, 0, 'none');
    expect(alfalfaArid.grossIrrigationMm).toBeGreaterThanOrEqual(0);
    expect(alfalfaArid.etcMm).toBeGreaterThan(sorghumArid.etcMm);

    const tropical = makeTestSite(18.0, -96.0, 'Tropical, MX');
    const appleTemperate = evaluateCrop(getCrop('apple'), temperate.climate.monthly, temperate.soil, 0, 'none');
    const appleWarm = evaluateCrop(getCrop('apple'), tropical.climate.monthly, tropical.soil, 600, 'drip');
    expect(appleTemperate.factors.chill).toBeGreaterThan(appleWarm.factors.chill);
  });

  it('returns at least 3 distinct strategies including current baseline with 5-part explanations', () => {
    const lubbock = makeTestSite(33.58, -101.85, 'Lubbock, TX', true);
    const farmer = defaultFarmerInputs(lubbock);
    const res = analyzeSite(lubbock, farmer);

    expect(res.strategies.length).toBeGreaterThanOrEqual(3);
    const current = res.strategies.find((s) => s.isCurrent);
    expect(current).toBeDefined();

    for (const s of res.strategies) {
      expect(s.rank).toBeGreaterThan(0);
      expect(s.explanation.why.length).toBeGreaterThan(0);
      expect(s.explanation.evidence.length).toBeGreaterThan(0);
      expect(s.explanation.benefits.length).toBeGreaterThanOrEqual(4);
      expect(s.explanation.gaps.length).toBeGreaterThan(0);
      expect(s.explanation.risks.length).toBeGreaterThan(0);
      expect(s.timeline.length).toBeGreaterThanOrEqual(3);
    }
    expect(res.windows.length).toBeGreaterThan(0);
  });

  it('responds dynamically to farmer priority weights (water vs forage vs income)', () => {
    const site = makeTestSite(28.19, -105.47, 'Delicias, MX');
    const base = defaultFarmerInputs(site);

    const waterFirst = analyzeSite(site, {
      ...base,
      priorities: { water: 5, soil: 3, income: 1, forage: 0, resilience: 4 },
    });
    const forageFirst = analyzeSite(site, {
      ...base,
      priorities: { water: 1, soil: 2, income: 1, forage: 5, resilience: 2 },
    });

    const topWater = waterFirst.strategies[0];
    const topForage = forageFirst.strategies[0];
    expect(topForage.metrics.forageTHa).toBeGreaterThanOrEqual(topWater.metrics.forageTHa);
  });

  it('marks simulated evidence and increases water stress under climate shock scenario', () => {
    const site = makeTestSite(33.58, -101.85, 'Lubbock, TX', true);
    const farmer = defaultFarmerInputs(site);
    const neutral = analyzeSite(site, farmer);
    const severe = analyzeSite(site, farmer, {
      deltaTempC: 3,
      precipChangePct: -35,
      waterAvailabilityChangePct: -50,
    });

    expect(severe.effectiveIrrigationMm).toBeLessThan(neutral.effectiveIrrigationMm);
    const neutralCurrent = neutral.strategies.find((s) => s.isCurrent)!;
    const severeCurrent = severe.strategies.find((s) => s.isCurrent)!;
    expect(severeCurrent.metrics.waterDeficitMm).toBeGreaterThan(neutralCurrent.metrics.waterDeficitMm);
    expect(severeCurrent.explanation.evidence.some((e) => e.provenance === 'simulated')).toBe(true);
    expect(severeCurrent.scores.reliability).toBeLessThan(neutralCurrent.scores.reliability);
  });

  it('uses an equal-weighted average when all priorities are 0', () => {
    const site = makeTestSite(33.58, -101.85, 'Lubbock, TX', true);
    const base = defaultFarmerInputs(site);
    const res = analyzeSite(site, {
      ...base,
      priorities: { water: 0, soil: 0, income: 0, forage: 0, resilience: 0 },
    });
    expect(res.strategies.length).toBeGreaterThanOrEqual(3);
    for (const s of res.strategies) {
      expect(Number.isFinite(s.scores.total)).toBe(true);
      expect(s.scores.total).toBeGreaterThan(0);
    }
  });

  it('defaults engine output to English and supports full Spanish localization', () => {
    const site = makeTestSite(33.58, -101.85, 'Lubbock, TX', true);
    const farmer = defaultFarmerInputs(site);

    const enRes = analyzeSite(site, farmer);
    const esRes = analyzeSite(site, farmer, undefined, undefined, 'es');

    expect(enRes.strategies[0].title).not.toEqual(esRes.strategies[0].title);
    expect(enRes.strategies.some((s) => s.title.includes('Keep your current crop'))).toBe(true);
    expect(esRes.strategies.some((s) => s.title.includes('Seguir como siembras hoy'))).toBe(true);

    const enGlossary = getGlossary('en');
    for (const k of Object.keys(GLOSSARY)) {
      expect(enGlossary[k]).toBeDefined();
      expect(enGlossary[k].short.length).toBeGreaterThan(5);
    }

    for (const id of ALL_SOURCE_IDS) {
      expect(getSourceMeta(id, 'en').description.length).toBeGreaterThan(5);
      expect(getSourceMeta(id, 'es').description.length).toBeGreaterThan(5);
    }

    for (const p of PILOT_PARCELS) {
      const pEn = localizePilot(p, 'en');
      expect(pEn.name.length).toBeGreaterThan(3);
      expect(pEn.summary.length).toBeGreaterThan(10);
    }
  });
});
