import { buildSyntheticTerrain, computeLSFactor } from '@fieldshift/core';
import type { SourceReport, TerrainProfile } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

interface OpenTopoResponse {
  results?: { elevation: number | null }[];
}

interface OpenMeteoElevResponse {
  elevation?: number[];
}

export interface ElevationResult {
  terrain: TerrainProfile;
  reports: SourceReport[];
}

function buildTerrainFromCross(
  elevations: number[],
  lat: number,
  sourceId: 'srtm' | 'copernicus-dem',
  resolution: string,
): TerrainProfile {
  const [c, n, s, e, w] = elevations;
  const dLatM = 0.001 * 111_132;
  const dLonM = Math.max(20, 0.001 * 111_320 * Math.cos((lat * Math.PI) / 180));

  const dzDy = (n - s) / (2 * dLatM);
  const dzDx = (e - w) / (2 * dLonM);
  const slopeFrac = Math.hypot(dzDx, dzDy);
  const slopePct = +(Math.min(45, slopeFrac * 100)).toFixed(1);

  let aspectDeg: number | null = null;
  if (slopeFrac > 0.002) {
    aspectDeg = Math.round(((Math.atan2(dzDx, dzDy) * 180) / Math.PI + 360) % 360);
  }

  const lsFactor = computeLSFactor(slopePct, 50);
  const terrainErosionIndex = +Math.min(1, lsFactor / 4).toFixed(2);

  return {
    provenance: 'live',
    sources: [sourceId],
    confidence: sourceId === 'srtm' ? 0.88 : 0.8,
    resolution,
    elevationM: Math.round(c),
    slopePct,
    aspectDeg,
    lsFactor,
    terrainErosionIndex,
  };
}

export async function fetchElevation(lat: number, lon: number): Promise<ElevationResult> {
  const d = 0.001;
  const pts = [
    [lat, lon],
    [lat + d, lon],
    [lat - d, lon],
    [lat, lon + d],
    [lat, lon - d],
  ];

  const retrievedAt = new Date().toISOString();
  const reports: SourceReport[] = [];

  // Primary: NASA SRTM 30m via OpenTopoData
  const locsParam = pts.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join('|');
  const srtmUrl = `https://api.opentopodata.org/v1/srtm30m?locations=${locsParam}`;
  const srtmRes = await fetchJson<OpenTopoResponse>(srtmUrl, undefined, 8000);

  if (srtmRes.ok && srtmRes.data?.results?.length === 5 && srtmRes.data.results.every((r) => typeof r.elevation === 'number')) {
    const elevs = srtmRes.data.results.map((r) => r.elevation as number);
    const terrain = buildTerrainFromCross(elevs, lat, 'srtm', '30 m (SRTM)');
    reports.push({
      id: 'srtm',
      status: 'live',
      mode: 'values',
      ms: srtmRes.ms,
      summary: `Elevación ${terrain.elevationM} m, pendiente ${terrain.slopePct} %`,
      retrievedAt,
      endpoint: 'api.opentopodata.org/v1/srtm30m',
    });
    reports.push({
      id: 'copernicus-dem',
      status: 'not-applicable',
      mode: 'values',
      ms: 0,
      summary: 'No requerido (SRTM 30 m disponible)',
    });
    return { terrain, reports };
  }

  reports.push({
    id: 'srtm',
    status: 'unavailable',
    mode: 'values',
    ms: srtmRes.ms,
    summary: 'OpenTopoData SRTM no disponible',
    detail: srtmRes.error,
    retrievedAt,
    endpoint: 'api.opentopodata.org/v1/srtm30m',
  });

  // Fallback: Copernicus DEM via Open-Meteo Elevation
  const lats = pts.map(([la]) => la.toFixed(5)).join(',');
  const lons = pts.map(([, lo]) => lo.toFixed(5)).join(',');
  const copUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
  const copRes = await fetchJson<OpenMeteoElevResponse>(copUrl, undefined, 8000);

  if (copRes.ok && copRes.data?.elevation?.length === 5 && copRes.data.elevation.every((v) => typeof v === 'number')) {
    const terrain = buildTerrainFromCross(copRes.data.elevation, lat, 'copernicus-dem', '90 m (Copernicus DEM)');
    reports.push({
      id: 'copernicus-dem',
      status: 'live',
      mode: 'values',
      ms: copRes.ms,
      summary: `Respaldo DEM: ${terrain.elevationM} m, pendiente ${terrain.slopePct} %`,
      retrievedAt,
      endpoint: 'api.open-meteo.com/v1/elevation',
    });
    return { terrain, reports };
  }

  reports.push({
    id: 'copernicus-dem',
    status: 'unavailable',
    mode: 'values',
    ms: copRes.ms,
    summary: 'Open-Meteo Elevation no disponible',
    detail: copRes.error,
    retrievedAt,
  });

  return {
    terrain: buildSyntheticTerrain(lat, lon),
    reports,
  };
}
