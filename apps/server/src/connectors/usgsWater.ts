import type { GroundwaterSite, SourceReport, WaterProfile } from '@fieldshift/core';
import { haversineKm } from '../lib/geo';
import { fetchJson } from '../lib/http';

interface MonitoringLocationsResponse {
  features?: {
    properties?: {
      id?: string;
      monitoring_location_name?: string;
    };
    geometry?: { coordinates?: [number, number] };
  }[];
}

interface FieldMeasurementsResponse {
  features?: {
    properties?: {
      value?: string;
      unit_of_measure?: string;
      time?: string;
    };
  }[];
}

export interface UsgsWaterResult {
  groundwater: WaterProfile['groundwater'];
  report: SourceReport;
}

function olsSlopePerYr(points: { yearFrac: number; depthM: number }[]): number | null {
  if (points.length < 2) return null;
  const minY = Math.min(...points.map((p) => p.yearFrac));
  const maxY = Math.max(...points.map((p) => p.yearFrac));
  if (maxY - minY < 1.5) return null;
  const n = points.length;
  const mx = points.reduce((a, b) => a + b.yearFrac, 0) / n;
  const my = points.reduce((a, b) => a + b.depthM, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.yearFrac - mx) * (p.depthM - my);
    den += (p.yearFrac - mx) ** 2;
  }
  if (den === 0) return null;
  // parameter_code 72019 is depth below land surface: deeper value = water table decline (negative storage change)
  return +(-(num / den)).toFixed(2);
}

export async function fetchUsgsWater(lat: number, lon: number, inCONUS: boolean): Promise<UsgsWaterResult> {
  const retrievedAt = new Date().toISOString();
  if (!inCONUS) {
    return {
      groundwater: {
        provenance: 'unavailable',
        sources: ['usgs-water'],
        sites: [],
        medianTrendMPerYr: null,
        summary: 'La red de pozos USGS cubre EE. UU.; fuera de EE. UU. consulte piezómetros locales o CONAGUA.',
      },
      report: {
        id: 'usgs-water',
        status: 'not-applicable',
        mode: 'values',
        ms: 0,
        summary: 'Solo cobertura EE. UU. (CONUS)',
      },
    };
  }

  const bbox = `${(lon - 0.2).toFixed(4)},${(lat - 0.2).toFixed(4)},${(lon + 0.2).toFixed(4)},${(lat + 0.2).toFixed(4)}`;
  const locUrl =
    `https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items` +
    `?f=json&bbox=${bbox}&site_type_code=GW&limit=12&properties=id,monitoring_location_name`;

  const locRes = await fetchJson<MonitoringLocationsResponse>(locUrl, undefined, 7000);
  if (!locRes.ok || !locRes.data?.features?.length) {
    return {
      groundwater: {
        provenance: 'unavailable',
        sources: ['usgs-water'],
        sites: [],
        medianTrendMPerYr: null,
        summary: locRes.ok
          ? 'No se hallaron pozos USGS de monitoreo dentro de ~22 km.'
          : 'No respondió USGS Water OGC API.',
      },
      report: {
        id: 'usgs-water',
        status: locRes.ok ? 'live' : 'unavailable',
        mode: 'values',
        ms: locRes.ms,
        summary: locRes.ok ? '0 pozos GW en radio de ~22 km' : 'Error consultando USGS Water',
        detail: locRes.error,
        retrievedAt,
        endpoint: 'api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations',
      },
    };
  }

  const nearby = locRes.data.features
    .map((f) => {
      const id = f.properties?.id;
      const name = f.properties?.monitoring_location_name ?? id ?? 'Pozo USGS';
      const coords = f.geometry?.coordinates;
      if (!id || !coords) return null;
      return {
        id,
        name,
        distanceKm: +haversineKm(lat, lon, coords[1], coords[0]).toFixed(1),
      };
    })
    .filter((x): x is { id: string; name: string; distanceKm: number } => x !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  const tMeas = Date.now();
  const sites: GroundwaterSite[] = await Promise.all(
    nearby.map(async (w) => {
      const fmUrl =
        `https://api.waterdata.usgs.gov/ogcapi/v0/collections/field-measurements/items` +
        `?f=json&monitoring_location_id=${encodeURIComponent(w.id)}` +
        `&parameter_code=72019&datetime=2012-01-01T00:00:00Z/..&limit=40`;
      const fmRes = await fetchJson<FieldMeasurementsResponse>(fmUrl, undefined, 7500);
      const pts: { yearFrac: number; depthM: number; ts: number }[] = [];
      for (const f of fmRes.data?.features ?? []) {
        const val = Number(f.properties?.value);
        const timeStr = f.properties?.time;
        if (!Number.isFinite(val) || !timeStr) continue;
        const unit = (f.properties?.unit_of_measure ?? 'ft').toLowerCase();
        const depthM = unit.includes('m') && !unit.includes('ft') ? val : val * 0.3048;
        const msTime = Date.parse(timeStr);
        if (Number.isNaN(msTime)) continue;
        pts.push({
          yearFrac: msTime / (365.25 * 86400_000),
          depthM,
          ts: msTime,
        });
      }
      pts.sort((a, b) => a.ts - b.ts);
      const lastDepthM = pts.length > 0 ? +pts[pts.length - 1].depthM.toFixed(1) : null;
      return {
        id: w.id,
        name: w.name,
        distanceKm: w.distanceKm,
        trendMPerYr: olsSlopePerYr(pts),
        lastDepthM,
        nObs: pts.length,
      };
    }),
  );

  const totalMs = locRes.ms + (Date.now() - tMeas);
  const trends = sites.map((s) => s.trendMPerYr).filter((t): t is number => t !== null).sort((a, b) => a - b);
  const medianTrendMPerYr = trends.length > 0 ? trends[Math.floor(trends.length / 2)] : null;

  let summary = `${sites.length} pozo(s) USGS cercanos (el más cercano a ${sites[0].distanceKm} km)`;
  if (medianTrendMPerYr !== null) {
    summary += medianTrendMPerYr < -0.05
      ? `: tendencia mediana de descenso ${Math.abs(medianTrendMPerYr).toFixed(2)} m/año.`
      : medianTrendMPerYr > 0.05
      ? `: recuperación mediana +${medianTrendMPerYr.toFixed(2)} m/año.`
      : `: nivel estable (${medianTrendMPerYr.toFixed(2)} m/año).`;
  } else {
    summary += '; pocas lecturas recientes para estimar tendencia.';
  }

  return {
    groundwater: {
      provenance: 'live',
      sources: ['usgs-water'],
      sites,
      medianTrendMPerYr,
      summary,
    },
    report: {
      id: 'usgs-water',
      status: 'live',
      mode: 'values',
      ms: totalMs,
      summary,
      retrievedAt,
      endpoint: 'api.waterdata.usgs.gov/ogcapi/v0/collections/{monitoring-locations,field-measurements}',
    },
  };
}
