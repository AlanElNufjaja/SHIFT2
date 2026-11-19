import type { MonthlyObservation, SourceReport } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

interface OpenMeteoArchiveResponse {
  daily?: {
    time: string[];
    precipitation_sum?: (number | null)[];
    et0_fao_evapotranspiration?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    soil_moisture_0_to_7cm_mean?: (number | null)[];
  };
}

export interface Era5Result {
  ok: boolean;
  /** 12-month climatology of FAO-56 ET0 (mm/month), precip (mm/month), tmean (°C), soilMoisture (m3/m3). */
  monthlyEt0: number[];
  monthlyPrecip: number[];
  monthlyTmean: number[];
  monthlySoilMoisture: number[];
  /** Last 24 months ERA5 observations (YYYY-MM). */
  recent: MonthlyObservation[];
  latestSoilMoistureAnomaly: number | null;
  latestObservation?: string;
  report: SourceReport;
}

export async function fetchEra5(lat: number, lon: number): Promise<Era5Result> {
  // Query ~5 years ending 8 days before current date
  const endDt = new Date(Date.now() - 8 * 86400_000);
  const startDt = new Date(endDt.getFullYear() - 5, 0, 1);
  const startDate = startDt.toISOString().slice(0, 10);
  const endDate = endDt.toISOString().slice(0, 10);

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,soil_moisture_0_to_7cm_mean` +
    `&timezone=GMT`;

  const res = await fetchJson<OpenMeteoArchiveResponse>(url, undefined, 11000);
  const retrievedAt = new Date().toISOString();

  if (!res.ok || !res.data?.daily?.time?.length) {
    return {
      ok: false,
      monthlyEt0: [],
      monthlyPrecip: [],
      monthlyTmean: [],
      monthlySoilMoisture: [],
      recent: [],
      latestSoilMoistureAnomaly: null,
      report: {
        id: 'era5',
        status: 'unavailable',
        mode: 'values',
        ms: res.ms,
        summary: 'No respondió ECMWF ERA5-Land (Open-Meteo)',
        detail: res.error ?? 'Sin serie diaria',
        retrievedAt,
        endpoint: 'archive-api.open-meteo.com/v1/archive',
      },
    };
  }

  const d = res.data.daily;
  const times = d.time;
  const cal = Array.from({ length: 12 }, () => ({
    et0Sum: 0, pSum: 0, tSum: 0, smSum: 0, smN: 0, n: 0, years: new Set<string>(),
  }));
  const ymMap = new Map<string, { et0: number; p: number; t: number; sm: number; smN: number; n: number }>();

  for (let i = 0; i < times.length; i++) {
    const dt = times[i];
    const yr = dt.slice(0, 4);
    const mIdx = Number(dt.slice(5, 7)) - 1;
    if (mIdx < 0 || mIdx > 11) continue;

    const et0 = d.et0_fao_evapotranspiration?.[i];
    const pr = d.precipitation_sum?.[i];
    const tx = d.temperature_2m_max?.[i];
    const tn = d.temperature_2m_min?.[i];
    const sm = d.soil_moisture_0_to_7cm_mean?.[i];
    if (et0 == null || pr == null || tx == null || tn == null) continue;

    const tm = (tx + tn) / 2;
    const b = cal[mIdx];
    b.n += 1;
    b.years.add(yr);
    b.et0Sum += et0;
    b.pSum += pr;
    b.tSum += tm;
    if (sm != null) {
      b.smSum += sm;
      b.smN += 1;
    }

    const ym = dt.slice(0, 7);
    const cur = ymMap.get(ym) ?? { et0: 0, p: 0, t: 0, sm: 0, smN: 0, n: 0 };
    cur.n += 1;
    cur.et0 += et0;
    cur.p += pr;
    cur.t += tm;
    if (sm != null) {
      cur.sm += sm;
      cur.smN += 1;
    }
    ymMap.set(ym, cur);
  }

  const monthlyEt0 = cal.map((b) => +(b.et0Sum / Math.max(1, b.years.size)).toFixed(1));
  const monthlyPrecip = cal.map((b) => +(b.pSum / Math.max(1, b.years.size)).toFixed(1));
  const monthlyTmean = cal.map((b) => +(b.tSum / Math.max(1, b.n)).toFixed(1));
  const monthlySoilMoisture = cal.map((b) => (b.smN > 0 ? +(b.smSum / b.smN).toFixed(3) : 0.22));

  const keys = Array.from(ymMap.keys()).sort().slice(-24);
  const recent: MonthlyObservation[] = keys.map((ym) => {
    const v = ymMap.get(ym)!;
    return {
      period: ym,
      et0: +v.et0.toFixed(1),
      precip: +v.p.toFixed(1),
      tmean: +(v.t / Math.max(1, v.n)).toFixed(1),
      soilMoisture: v.smN > 0 ? +(v.sm / v.smN).toFixed(3) : undefined,
    };
  });

  // Compute latest full-month soil moisture anomaly (fraction vs 5-yr same-month baseline)
  let latestSoilMoistureAnomaly: number | null = null;
  for (let i = recent.length - 1; i >= 0; i--) {
    const obs = recent[i];
    if (obs.soilMoisture !== undefined) {
      const mIdx = Number(obs.period.slice(5, 7)) - 1;
      const base = monthlySoilMoisture[mIdx];
      if (base > 0.02) {
        latestSoilMoistureAnomaly = +((obs.soilMoisture - base) / base).toFixed(2);
      }
      break;
    }
  }

  const latestObservation = times[times.length - 1];
  return {
    ok: true,
    monthlyEt0,
    monthlyPrecip,
    monthlyTmean,
    monthlySoilMoisture,
    recent,
    latestSoilMoistureAnomaly,
    latestObservation,
    report: {
      id: 'era5',
      status: 'live',
      mode: 'values',
      ms: res.ms,
      summary: `${times.length} días ERA5-Land (ET₀ FAO-56 + humedad 0–7 cm)`,
      retrievedAt,
      latestObservation,
      endpoint: 'archive-api.open-meteo.com/v1/archive',
    },
  };
}
