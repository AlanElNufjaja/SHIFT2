import type { NdviPoint, SourceReport } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

interface OrnlSubsetItem {
  modis_date: string;
  calendar_date: string;
  data: number[];
}

interface OrnlSubsetResponse {
  subset?: OrnlSubsetItem[];
}

export interface ModisResult {
  ok: boolean;
  series: NdviPoint[];
  monthlyNdvi: (number | null)[];
  peakMonth: number | null;
  peakNdvi: number | null;
  bareSoilMonths: number[];
  greenMonths: number;
  monthlyLstDay: (number | null)[];
  latestObservation?: string;
  report: SourceReport;
}

const DOYS_16DAY = [
  1, 17, 33, 49, 65, 81, 97, 113, 129, 145, 161, 177,
  193, 209, 225, 241, 257, 273, 289, 305, 321, 337, 353,
];

function recentModis16DayGrid(count = 23): string[] {
  const cutoff = new Date(Date.now() - 28 * 86400_000);
  const cutoffYear = cutoff.getUTCFullYear();
  const startOfYr = Date.UTC(cutoffYear, 0, 1);
  const cutoffDoy = Math.floor((cutoff.getTime() - startOfYr) / 86400_000) + 1;

  const all: string[] = [];
  for (const yr of [cutoffYear - 2, cutoffYear - 1, cutoffYear]) {
    for (const doy of DOYS_16DAY) {
      if (yr === cutoffYear && doy > cutoffDoy) continue;
      all.push(`A${yr}${String(doy).padStart(3, '0')}`);
    }
  }
  return all.slice(-count);
}

async function fetchSubsetRange(
  product: 'MOD13Q1' | 'MOD11A2',
  band: string,
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  timeoutMs: number,
) {
  const url =
    `https://modis.ornl.gov/rst/api/v1/${product}/subset` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&band=${band}&startDate=${startDate}&endDate=${endDate}&kmAboveBelow=0&kmLeftRight=0`;
  return fetchJson<OrnlSubsetResponse>(url, undefined, timeoutMs);
}

export async function fetchModis(lat: number, lon: number): Promise<ModisResult> {
  const retrievedAt = new Date().toISOString();
  const t0 = Date.now();

  const grid = recentModis16DayGrid(23);
  const ndviRanges: [string, string][] = [];
  for (let i = 0; i < grid.length; i += 8) {
    const sl = grid.slice(i, i + 8);
    ndviRanges.push([sl[0], sl[sl.length - 1]]);
  }

  // Latest completed summer/winter year for MOD11A2 LST samples
  const lstYear = new Date(Date.now() - 180 * 86400_000).getUTCFullYear();
  const lstRanges: [string, string][] = [
    [`A${lstYear}001`, `A${lstYear}033`],
    [`A${lstYear}185`, `A${lstYear}217`],
  ];

  const [ndviResponses, lstResponses] = await Promise.all([
    Promise.all(
      ndviRanges.map(([s, e]) =>
        fetchSubsetRange('MOD13Q1', '250m_16_days_NDVI', lat, lon, s, e, 15000),
      ),
    ),
    Promise.all(
      lstRanges.map(([s, e]) =>
        fetchSubsetRange('MOD11A2', 'LST_Day_1km', lat, lon, s, e, 12000),
      ),
    ),
  ]);

  const totalMs = Date.now() - t0;
  const series: NdviPoint[] = [];
  const ndviBuckets: number[][] = Array.from({ length: 12 }, () => []);
  let firstErr: string | undefined;

  for (const res of ndviResponses) {
    if (!res.ok) {
      if (!firstErr && res.error) firstErr = res.error;
      continue;
    }
    for (const item of res.data?.subset ?? []) {
      const raw = item.data?.[0];
      if (typeof raw !== 'number' || raw <= -2000 || raw > 10000) continue;
      const ndvi = +(raw * 0.0001).toFixed(3);
      series.push({ date: item.calendar_date, ndvi });
      const m = Number(item.calendar_date.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) ndviBuckets[m].push(ndvi);
    }
  }
  series.sort((a, b) => a.date.localeCompare(b.date));

  const monthlyNdvi = ndviBuckets.map((arr) =>
    arr.length > 0 ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3) : null,
  );

  let peakMonth: number | null = null;
  let peakNdvi: number | null = null;
  const bareSoilMonths: number[] = [];
  let greenMonths = 0;

  monthlyNdvi.forEach((v, m) => {
    if (v === null) return;
    if (peakNdvi === null || v > peakNdvi) {
      peakNdvi = v;
      peakMonth = m;
    }
    if (v < 0.25) bareSoilMonths.push(m);
    if (v >= 0.35) greenMonths++;
  });

  // LST Day (Kelvin * 0.02 -> °C)
  const lstBuckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const res of lstResponses) {
    if (!res.ok) continue;
    for (const item of res.data?.subset ?? []) {
      const raw = item.data?.[0];
      if (typeof raw !== 'number' || raw < 7500) continue;
      const c = +(raw * 0.02 - 273.15).toFixed(1);
      const m = Number(item.calendar_date.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) lstBuckets[m].push(c);
    }
  }
  const monthlyLstDay = lstBuckets.map((arr) =>
    arr.length > 0 ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null,
  );

  const latestObservation = series.length > 0 ? series[series.length - 1].date : undefined;

  return {
    ok: series.length > 0,
    series,
    monthlyNdvi,
    peakMonth,
    peakNdvi,
    bareSoilMonths,
    greenMonths,
    monthlyLstDay,
    latestObservation,
    report: {
      id: 'modis',
      status: series.length > 0 ? 'live' : 'unavailable',
      mode: 'values',
      ms: totalMs,
      summary:
        series.length > 0
          ? `${series.length} lecturas MOD13Q1 NDVI (250 m)${
              monthlyLstDay.some((x) => x !== null) ? ' + MOD11A2 LST (1 km)' : ''
            }`
          : 'No se obtuvieron compuestos MODIS NDVI válidos',
      detail: series.length > 0 ? undefined : firstErr,
      retrievedAt,
      latestObservation,
      endpoint: 'modis.ornl.gov/rst/api/v1/{MOD13Q1,MOD11A2}/subset',
    },
  };
}
