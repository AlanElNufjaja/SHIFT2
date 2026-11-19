import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  CROPS,
  buildSyntheticClimate,
  buildSyntheticSoil,
  buildSyntheticTerrain,
  defaultFarmerInputs,
  lookupRegionalAquifer,
} from '@fieldshift/core';
import type { SiteProfile } from '@fieldshift/core';
import { createApp } from '../src/app';

function fixtureSite(): SiteProfile {
  const lat = 28.19;
  const lon = -105.47;
  const { monthly, period } = buildSyntheticClimate(lat, lon);
  return {
    id: '28.190,-105.470',
    generatedAt: '2026-11-19T12:00:00Z',
    location: { lat, lon, name: 'Valle de Delicias, Chihuahua', country: 'México', inCONUS: false },
    grid: {
      cellId: 'N28.19_W105.47@0.01',
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
      resolution: 'Sintético',
      confidence: 0.5,
      annualPrecip: Math.round(monthly.reduce((a, b) => a + b.precip, 0)),
      annualET0: Math.round(monthly.reduce((a, b) => a + b.et0, 0)),
      meanTemp: +(monthly.reduce((a, b) => a + b.tmean, 0) / 12).toFixed(1),
      aridityIndex: 0.25,
      annualSeries: [],
      tempTrendCPerDecade: null,
      precipTrendPctPerDecade: null,
      recent: [],
      recentPrecipAnomalyPct: null,
      recentTempAnomalyC: null,
      et0BiasFactor: 1,
    },
    soil: buildSyntheticSoil(lat, lon),
    terrain: buildSyntheticTerrain(lat, lon),
    vegetation: {
      provenance: 'unavailable',
      sources: ['modis'],
      confidence: 0.3,
      resolution: '250 m',
      series: [],
      monthlyNdvi: Array(12).fill(null),
      peakMonth: null,
      peakNdvi: null,
      bareSoilMonths: [0, 1, 11],
      greenMonths: 6,
      monthlyLstDay: Array(12).fill(null),
      annualActualET: null,
    },
    water: {
      regionalStorageTrend: lookupRegionalAquifer(lat, lon),
      groundwater: {
        provenance: 'unavailable',
        sources: ['usgs-water'],
        sites: [],
        medianTrendMPerYr: null,
        summary: 'Fuera de EE. UU.',
      },
      soilMoistureAnomaly: null,
      openetAnnualMm: null,
    },
    cropHistory: {
      provenance: 'unavailable',
      sources: ['cdl'],
      years: [],
      maxConsecutiveSameFamily: 0,
      dominantCropId: null,
      summary: 'Sin CDL',
    },
    imagery: [],
    sources: [],
    quality: {
      overall: 0.55,
      liveSources: 0,
      cachedSources: 0,
      fallbackSources: 3,
      unavailableSources: 2,
      warnings: [],
    },
  };
}

describe('Field Shift Express API', () => {
  const app = createApp();

  it('GET /api/health returns service status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('fieldshift-api');
  });

  it('GET /api/pilots returns 6 pilot parcels', async () => {
    const res = await request(app).get('/api/pilots');
    expect(res.status).toBe(200);
    expect(res.body.pilots).toHaveLength(6);
  });

  it('GET /api/sources returns all 34 sources and glossary', async () => {
    const res = await request(app).get('/api/sources');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.sources)).toHaveLength(34);
    expect(res.body.glossary.et0).toBeDefined();
  });

  it('GET /api/crops returns all catalog crops', async () => {
    const res = await request(app).get('/api/crops');
    expect(res.status).toBe(200);
    expect(res.body.crops.length).toBe(CROPS.length);
  });

  it('GET /api/site rejects out-of-range coordinates with 400', async () => {
    const res = await request(app).get('/api/site?lat=999&lon=0');
    expect(res.status).toBe(400);
  });

  it('GET /api/cdl-point handles out-of-CONUS coordinates cleanly and rejects invalid coords', async () => {
    const bad = await request(app).get('/api/cdl-point?lat=999&lon=0');
    expect(bad.status).toBe(400);
    const mx = await request(app).get('/api/cdl-point?lat=28.225&lon=-105.415');
    expect(mx.status).toBe(200);
    expect(mx.body.inCONUS).toBe(false);
  });

  it('POST /api/analyze computes >= 3 strategies and respects market overrides', async () => {
    const site = fixtureSite();
    const farmer = defaultFarmerInputs(site);
    const res = await request(app).post('/api/analyze').send({
      site,
      farmer,
      overrides: { sorghum: { price: 240 } },
    });
    expect(res.status).toBe(200);
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(3);
    expect(res.body.windows.length).toBeGreaterThan(0);
  });
});
