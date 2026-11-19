import { CROPS } from '@fieldshift/core';
import type { Sourced, SourceReport } from '@fieldshift/core';
import { getCached, setCached } from '../lib/cache';
import { fetchJson } from '../lib/http';

interface NassResponse {
  data?: { Value?: string; year?: string }[];
}

export interface MarketOverridesMap {
  [cropId: string]: { price: number; priceYear: number; priceSource: string };
}

export async function fetchNassMarketPrices(): Promise<{
  overrides: MarketOverridesMap;
  report: SourceReport;
}> {
  const apiKey = process.env.NASS_API_KEY;
  const retrievedAt = new Date().toISOString();

  if (!apiKey) {
    return {
      overrides: {},
      report: {
        id: 'nass-quickstats',
        status: 'key-required',
        mode: 'key-required',
        ms: 0,
        summary: 'Usando precios base de referencia NASS 2023–2024 (configure NASS_API_KEY para actualizar en vivo).',
        endpoint: 'quickstats.nass.usda.gov/api/api_GET',
      },
    };
  }

  const cached = await getCached<MarketOverridesMap>('nass_prices_v1');
  if (cached.hit) {
    return {
      overrides: cached.data,
      report: {
        id: 'nass-quickstats',
        status: 'cached',
        mode: 'key-required',
        ms: 0,
        summary: `Precios NASS en caché para ${Object.keys(cached.data).length} cultivos`,
        retrievedAt: cached.cachedAt,
      },
    };
  }

  const t0 = Date.now();
  const overrides: MarketOverridesMap = {};
  const mappable = CROPS.filter((c) => c.market.nass);

  await Promise.all(
    mappable.map(async (crop) => {
      const nass = crop.market.nass!;
      const url =
        `https://quickstats.nass.usda.gov/api/api_GET/` +
        `?key=${encodeURIComponent(apiKey)}` +
        `&agg_level_desc=NATIONAL&freq_desc=ANNUAL` +
        `&short_desc=${encodeURIComponent(nass.shortDesc)}` +
        `&year__GE=2022&format=JSON`;
      const res = await fetchJson<NassResponse>(url, undefined, 8000);
      if (!res.ok || !res.data?.data?.length) return;

      const rows = res.data.data
        .map((r) => ({ year: Number(r.year), val: Number((r.Value ?? '').replace(/,/g, '')) }))
        .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.val) && r.val > 0)
        .sort((a, b) => b.year - a.year);

      if (rows.length > 0) {
        overrides[crop.id] = {
          price: Math.round(rows[0].val * nass.factor),
          priceYear: rows[0].year,
          priceSource: `USDA NASS QuickStats en vivo (${rows[0].year})`,
        };
      }
    }),
  );

  const ms = Date.now() - t0;
  if (Object.keys(overrides).length > 0) {
    await setCached('nass_prices_v1', overrides, 12 * 3600_000);
  }

  return {
    overrides,
    report: {
      id: 'nass-quickstats',
      status: Object.keys(overrides).length > 0 ? 'live' : 'unavailable',
      mode: 'key-required',
      ms,
      summary:
        Object.keys(overrides).length > 0
          ? `Actualizados ${Object.keys(overrides).length} precios en vivo desde QuickStats`
          : 'Sin precios válidos en QuickStats',
      retrievedAt,
      endpoint: 'quickstats.nass.usda.gov/api/api_GET',
    },
  };
}

interface OpenEtResponse {
  et?: number;
}

export async function fetchOpenEt(
  lat: number,
  lon: number,
  inCONUS: boolean,
): Promise<{ openetAnnualMm: Sourced<number> | null; report: SourceReport }> {
  const apiKey = process.env.OPENET_API_KEY;
  if (!inCONUS) {
    return {
      openetAnnualMm: null,
      report: {
        id: 'openet',
        status: 'not-applicable',
        mode: 'key-required',
        ms: 0,
        summary: 'Cobertura principal en EE. UU.',
      },
    };
  }

  if (!apiKey) {
    return {
      openetAnnualMm: null,
      report: {
        id: 'openet',
        status: 'key-required',
        mode: 'key-required',
        ms: 0,
        summary: 'Requiere OPENET_API_KEY para consultar evapotranspiración real 30 m en vivo.',
        endpoint: 'openet-api.org/raster/timeseries/point',
      },
    };
  }

  const res = await fetchJson<OpenEtResponse[]>(
    'https://openet-api.org/raster/timeseries/point',
    {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        date_range: ['2024-01-01', '2024-12-31'],
        interval: 'monthly',
        geometry: [lon, lat],
        model: 'Ensemble',
        variable: 'ET',
        units: 'mm',
        file_format: 'JSON',
      }),
    },
    8000,
  );

  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
    return {
      openetAnnualMm: null,
      report: {
        id: 'openet',
        status: 'unavailable',
        mode: 'key-required',
        ms: res.ms,
        summary: 'Error consultando OpenET',
        detail: res.error,
        retrievedAt: new Date().toISOString(),
        endpoint: 'openet-api.org/raster/timeseries/point',
      },
    };
  }

  const sum = Math.round(res.data.reduce((a, b) => a + (Number(b.et) || 0), 0));
  return {
    openetAnnualMm: {
      value: sum,
      unit: 'mm/año',
      provenance: 'live',
      sources: ['openet'],
      resolution: '30 m (OpenET Ensemble)',
      confidence: 0.9,
    },
    report: {
      id: 'openet',
      status: 'live',
      mode: 'key-required',
      ms: res.ms,
      summary: `ET real observada 2024: ${sum} mm/año`,
      retrievedAt: new Date().toISOString(),
      latestObservation: '2024',
      endpoint: 'openet-api.org/raster/timeseries/point',
    },
  };
}
