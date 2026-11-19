import type { AnalysisGrid } from '@fieldshift/core';

/**
 * Approximate boundary check for Contiguous United States (CONUS) to gate
 * USDA SSURGO / CropScape CDL / USGS NLCD / NAIP / USGS NWIS queries without
 * triggering false positives in Northern Mexico (Chihuahua/Sonora/Coahuila).
 */
export function isInCONUS(lat: number, lon: number): boolean {
  if (lat > 49.4 || lon < -124.8 || lon > -66.8) return false;
  if (lon < -114.7) return lat >= 32.5;
  if (lon < -106.5) return lat >= 31.33;
  if (lon < -102.5) return lat >= 29.0;
  if (lon < -99.0) return lat >= 27.0;
  return lat >= 24.5;
}

/**
 * Exact WGS84 (EPSG:4326) -> NAD83 / Conus Albers (EPSG:5070) projection
 * required by USDA CropScape CDLService.
 */
export function wgs84ToAlbers5070(latDeg: number, lonDeg: number): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e = Math.sqrt(e2);
  const r = Math.PI / 180;

  const q = (phi: number) => {
    const s = Math.sin(phi);
    return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)));
  };
  const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);

  const p0 = 23 * r;
  const p1 = 29.5 * r;
  const p2 = 45.5 * r;
  const l0 = -96 * r;

  const m1 = m(p1);
  const m2 = m(p2);
  const q0 = q(p0);
  const q1 = q(p1);
  const q2 = q(p2);

  const n = (m1 * m1 - m2 * m2) / (q2 - q1);
  const C = m1 * m1 + n * q1;
  const rho = (phi: number) => (a * Math.sqrt(C - n * q(phi))) / n;

  const theta = n * (lonDeg * r - l0);
  const x = rho(latDeg * r) * Math.sin(theta);
  const y = rho(p0) - rho(latDeg * r) * Math.cos(theta);
  return [x, y];
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function snapCell(val: number, step: number): [number, number] {
  const min = Math.floor(val / step) * step;
  return [+(min).toFixed(4), +(min + step).toFixed(4)];
}

export function buildAnalysisGrid(lat: number, lon: number): AnalysisGrid {
  const cellSizeDeg = 0.01;
  const half = cellSizeDeg / 2;
  const latTag = `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(2)}`;
  const lonTag = `${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(2)}`;

  const [pLat0, pLat1] = snapCell(lat, 0.5);
  const [pLon0, pLon1] = snapCell(lon, 0.625);
  const [eLat0, eLat1] = snapCell(lat, 0.1);
  const [eLon0, eLon1] = snapCell(lon, 0.1);
  const [sLat0, sLat1] = snapCell(lat, 0.085);
  const [sLon0, sLon1] = snapCell(lon, 0.085);

  return {
    cellId: `${latTag}_${lonTag}@0.01`,
    cellSizeDeg,
    center: { lat: +lat.toFixed(5), lon: +lon.toFixed(5) },
    bounds: [
      [+(lat - half).toFixed(5), +(lon - half).toFixed(5)],
      [+(lat + half).toFixed(5), +(lon + half).toFixed(5)],
    ],
    nativeCells: [
      {
        sourceId: 'nasa-power',
        label: 'NASA POWER (0.5° × 0.625°, ~55 km)',
        bounds: [[pLat0, pLon0], [pLat1, pLon1]],
      },
      {
        sourceId: 'era5',
        label: 'ECMWF ERA5-Land (0.1°, ~9 km)',
        bounds: [[eLat0, eLon0], [eLat1, eLon1]],
      },
      {
        sourceId: 'smap',
        label: 'NASA SMAP EASE-Grid (~9 km)',
        bounds: [[sLat0, sLon0], [sLat1, sLon1]],
      },
    ],
  };
}
