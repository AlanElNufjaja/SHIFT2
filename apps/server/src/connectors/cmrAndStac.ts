import type { ImageryAvailability, SourceId, SourceReport } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

interface CmrGranuleResponse {
  feed?: {
    entry?: {
      time_start?: string;
      dataset_id?: string;
    }[];
  };
}

interface StacResponse {
  numberMatched?: number;
  context?: { matched?: number };
  features?: {
    properties?: {
      datetime?: string;
      'eo:cloud_cover'?: number;
    };
  }[];
}

export interface AvailabilityResult {
  imagery: ImageryAvailability[];
  reports: SourceReport[];
}

interface CmrSpec {
  sourceId: SourceId;
  shortName: string;
  product: string;
  native: string;
  conusOnly?: boolean;
  globalCollection?: boolean;
}

const CMR_SPECS: CmrSpec[] = [
  { sourceId: 'smap', shortName: 'SPL3SMP_E', product: 'SMAP L3 Enhanced 9 km (humedad superficial)', native: '9 km' },
  { sourceId: 'gpm-imerg', shortName: 'GPM_3IMERGDF', product: 'GPM IMERG Final Daily (precipitación)', native: '0.1° (~10 km)' },
  { sourceId: 'ecostress', shortName: 'ECO_L2T_LSTE', product: 'ECOSTRESS L2T LSTE (temperatura superficial)', native: '70 m' },
  { sourceId: 'landsat', shortName: 'HLSL30', product: 'HLS Landsat L30 (reflectancia 30 m)', native: '30 m' },
  { sourceId: 'viirs', shortName: 'VNP13A1', product: 'VIIRS VNP13A1 (NDVI/EVI 16 días)', native: '500 m' },
  { sourceId: 'gldas', shortName: 'GLDAS_NOAH025_M', product: 'GLDAS Noah 0.25° mensual', native: '0.25° (~25 km)' },
  { sourceId: 'nldas', shortName: 'NLDAS_NOAH0125_M', product: 'NLDAS-2 Noah 0.125° Norteamérica', native: '0.125° (~12 km)' },
  { sourceId: 'gedi', shortName: 'GEDI04_A', product: 'GEDI L4A biomasa aérea (LiDAR)', native: '25 m huellas' },
  { sourceId: 'grace', shortName: 'TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4', product: 'GRACE/GRACE-FO JPL Mascons RL06.3', native: '~300 km', globalCollection: true },
];

async function queryCmr(spec: CmrSpec, lat: number, lon: number): Promise<{ item?: ImageryAvailability; report: SourceReport }> {
  const retrievedAt = new Date().toISOString();
  const inNorthAmerica = lat >= 25 && lat <= 53 && lon >= -125 && lon <= -67;
  if (spec.sourceId === 'nldas' && !inNorthAmerica) {
    return {
      report: {
        id: spec.sourceId,
        status: 'not-applicable',
        mode: 'availability',
        ms: 0,
        summary: 'NLDAS-2 cubre América del Norte (25°–53° N)',
      },
    };
  }

  const url = spec.globalCollection
    ? `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=${encodeURIComponent(spec.shortName)}&sort_key=-start_date&page_size=1`
    : `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=${encodeURIComponent(spec.shortName)}&point=${lon.toFixed(4)},${lat.toFixed(4)}&sort_key=-start_date&page_size=1`;

  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'FieldShift-NASA-SpaceApps/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      return {
        report: {
          id: spec.sourceId,
          status: 'unavailable',
          mode: 'availability',
          ms,
          summary: `CMR devolvió HTTP ${res.status}`,
          retrievedAt,
          endpoint: 'cmr.earthdata.nasa.gov/search/granules.json',
        },
      };
    }

    const hitsHeader = Number(res.headers.get('cmr-hits') ?? '0');
    const json = (await res.json()) as CmrGranuleResponse;
    const entry = json.feed?.entry?.[0];
    const latest = entry?.time_start?.slice(0, 10);
    const count = Number.isFinite(hitsHeader) && hitsHeader > 0 ? hitsHeader : entry ? 1 : 0;

    return {
      item: {
        sourceId: spec.sourceId,
        product: spec.product,
        count,
        windowDays: 3650,
        latest,
        native: spec.native,
      },
      report: {
        id: spec.sourceId,
        status: 'live',
        mode: spec.sourceId === 'grace' ? 'reference' : 'availability',
        ms,
        summary: `${count.toLocaleString('en-US')} gránulos en archivo CMR${latest ? ` (último: ${latest})` : ''}`,
        retrievedAt,
        latestObservation: latest,
        endpoint: `cmr.earthdata.nasa.gov/search/granules.json?short_name=${spec.shortName}`,
      },
    };
  } catch (err) {
    return {
      report: {
        id: spec.sourceId,
        status: 'unavailable',
        mode: 'availability',
        ms: Date.now() - t0,
        summary: 'Error consultando NASA CMR',
        detail: err instanceof Error ? err.message : String(err),
        retrievedAt,
        endpoint: 'cmr.earthdata.nasa.gov/search/granules.json',
      },
    };
  }
}

async function querySentinel2(lat: number, lon: number): Promise<{ item?: ImageryAvailability; report: SourceReport }> {
  const retrievedAt = new Date().toISOString();
  const end = new Date();
  const start = new Date(end.getTime() - 120 * 86400_000);
  const datetime = `${start.toISOString()}/${end.toISOString()}`;

  const res = await fetchJson<StacResponse>(
    'https://earth-search.aws.element84.com/v1/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        intersects: { type: 'Point', coordinates: [lon, lat] },
        datetime,
        limit: 30,
      }),
    },
    8000,
  );

  if (!res.ok || !res.data) {
    return {
      report: {
        id: 'sentinel-2',
        status: 'unavailable',
        mode: 'availability',
        ms: res.ms,
        summary: 'Error consultando STAC Element84 Sentinel-2',
        detail: res.error,
        retrievedAt,
        endpoint: 'earth-search.aws.element84.com/v1/search',
      },
    };
  }

  const features = res.data.features ?? [];
  const count = res.data.numberMatched ?? res.data.context?.matched ?? features.length;
  const clearCount = features.filter((f) => (f.properties?.['eo:cloud_cover'] ?? 100) < 20).length;
  const latest = features[0]?.properties?.datetime?.slice(0, 10);

  return {
    item: {
      sourceId: 'sentinel-2',
      product: 'Copernicus Sentinel-2 L2A (últimos 120 días)',
      count,
      windowDays: 120,
      clearCount,
      latest,
      native: '10–20 m',
    },
    report: {
      id: 'sentinel-2',
      status: 'live',
      mode: 'availability',
      ms: res.ms,
      summary: `${count} escenas (120 días), ${clearCount} despejadas (<20 % nubes)${latest ? ` · última ${latest}` : ''}`,
      retrievedAt,
      latestObservation: latest,
      endpoint: 'earth-search.aws.element84.com/v1/search',
    },
  };
}

async function queryNaip(lat: number, lon: number, inCONUS: boolean): Promise<{ item?: ImageryAvailability; report: SourceReport }> {
  const retrievedAt = new Date().toISOString();
  if (!inCONUS) {
    return {
      report: {
        id: 'naip',
        status: 'not-applicable',
        mode: 'availability',
        ms: 0,
        summary: 'USDA NAIP cubre únicamente EE. UU. (CONUS)',
      },
    };
  }

  const res = await fetchJson<StacResponse>(
    'https://planetarycomputer.microsoft.com/api/stac/v1/search',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collections: ['naip'],
        intersects: { type: 'Point', coordinates: [lon, lat] },
        limit: 5,
        sortby: [{ field: 'datetime', direction: 'desc' }],
      }),
    },
    8000,
  );

  if (!res.ok || !res.data) {
    return {
      report: {
        id: 'naip',
        status: 'unavailable',
        mode: 'availability',
        ms: res.ms,
        summary: 'Error consultando Planetary Computer NAIP',
        detail: res.error,
        retrievedAt,
        endpoint: 'planetarycomputer.microsoft.com/api/stac/v1/search',
      },
    };
  }

  const features = res.data.features ?? [];
  const latest = features[0]?.properties?.datetime?.slice(0, 10);
  return {
    item: {
      sourceId: 'naip',
      product: 'USDA NAIP ortofoto aérea',
      count: features.length,
      windowDays: 3650,
      latest,
      native: '0.6 m',
    },
    report: {
      id: 'naip',
      status: 'live',
      mode: 'availability',
      ms: res.ms,
      summary: `${features.length} vuelos recientes disponibles${latest ? ` (último: ${latest})` : ''}`,
      retrievedAt,
      latestObservation: latest,
      endpoint: 'planetarycomputer.microsoft.com/api/stac/v1/search',
    },
  };
}

export async function fetchCmrAndStac(lat: number, lon: number, inCONUS: boolean): Promise<AvailabilityResult> {
  const [cmrResults, s2, naip] = await Promise.all([
    Promise.all(CMR_SPECS.map((s) => queryCmr(s, lat, lon))),
    querySentinel2(lat, lon),
    queryNaip(lat, lon, inCONUS),
  ]);

  const imagery: ImageryAvailability[] = [];
  const reports: SourceReport[] = [];

  for (const r of [...cmrResults, s2, naip]) {
    if (r.item) imagery.push(r.item);
    reports.push(r.report);
  }

  return { imagery, reports };
}
