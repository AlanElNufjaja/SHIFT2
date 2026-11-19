import { DAYS_IN_MONTH, hargreavesET0 } from '@fieldshift/core';
import type { AnnualPoint, MonthlyClimate, MonthlyObservation, SourceReport } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

interface PowerResponse {
  properties?: {
    parameter?: Record<string, Record<string, number>>;
  };
}

export interface NasaPowerResult {
  ok: boolean;
  monthly: MonthlyClimate[];
  annualSeries: AnnualPoint[];
  recent: MonthlyObservation[];
  tempTrendCPerDecade: number | null;
  precipTrendPctPerDecade: number | null;
  period: string;
  latestObservation?: string;
  report: SourceReport;
}

function valid(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > -900;
}

function linearSlope(xs: number[], ys: number[]): number | null {
  if (xs.length < 10 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

export async function fetchNasaPower(lat: number, lon: number): Promise<NasaPowerResult> {
  const dailyUrl =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M,GWETTOP` +
    `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=20160101&end=20251231&format=JSON`;

  const monthlyUrl =
    `https://power.larc.nasa.gov/api/temporal/monthly/point` +
    `?parameters=T2M,PRECTOTCORR` +
    `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=1995&end=2025&format=JSON`;

  const [dailyRes, monthlyRes] = await Promise.all([
    fetchJson<PowerResponse>(dailyUrl, undefined, 13000),
    fetchJson<PowerResponse>(monthlyUrl, undefined, 11000),
  ]);

  const retrievedAt = new Date().toISOString();

  if (!dailyRes.ok || !dailyRes.data?.properties?.parameter) {
    return {
      ok: false,
      monthly: [],
      annualSeries: [],
      recent: [],
      tempTrendCPerDecade: null,
      precipTrendPctPerDecade: null,
      period: '',
      report: {
        id: 'nasa-power',
        status: 'unavailable',
        mode: 'values',
        ms: dailyRes.ms,
        summary: 'No respondió NASA POWER',
        detail: dailyRes.error ?? 'Sin parámetros en respuesta',
        retrievedAt,
        endpoint: 'power.larc.nasa.gov/api/temporal/daily/point',
      },
    };
  }

  const p = dailyRes.data.properties.parameter;
  const dates = Object.keys(p.T2M ?? {}).sort();

  // Accumulate climatology by month (0..11) and by YYYY-MM
  interface Bucket {
    n: number;
    tmean: number;
    tmax: number;
    tmin: number;
    precip: number;
    srad: number;
    rh: number;
    wind: number;
    wet: number;
    wetN: number;
    frost: number;
    heat: number;
    heavy: number;
    years: Set<string>;
  }

  const cal: Bucket[] = Array.from({ length: 12 }, () => ({
    n: 0, tmean: 0, tmax: 0, tmin: 0, precip: 0, srad: 0, rh: 0, wind: 0,
    wet: 0, wetN: 0, frost: 0, heat: 0, heavy: 0, years: new Set<string>(),
  }));

  const ymMap = new Map<string, { n: number; tSum: number; pSum: number; wSum: number; wN: number }>();

  let latestDate = '';
  for (const d of dates) {
    const t = p.T2M?.[d];
    const tx = p.T2M_MAX?.[d];
    const tn = p.T2M_MIN?.[d];
    const pr = p.PRECTOTCORR?.[d];
    const sr = p.ALLSKY_SFC_SW_DWN?.[d];
    const rh = p.RH2M?.[d];
    const ws = p.WS2M?.[d];
    const gw = p.GWETTOP?.[d];

    if (!valid(t) || !valid(tx) || !valid(tn) || !valid(pr)) continue;
    latestDate = d;

    const yr = d.slice(0, 4);
    const mIdx = Number(d.slice(4, 6)) - 1;
    if (mIdx < 0 || mIdx > 11) continue;

    const b = cal[mIdx];
    b.n += 1;
    b.years.add(yr);
    b.tmean += t;
    b.tmax += tx;
    b.tmin += tn;
    b.precip += pr;
    b.srad += valid(sr) ? sr : 16;
    b.rh += valid(rh) ? rh : 55;
    b.wind += valid(ws) ? ws : 2.5;
    if (valid(gw)) {
      b.wet += gw;
      b.wetN += 1;
    }
    if (tn <= 0) b.frost += 1;
    if (tx >= 35) b.heat += 1;
    if (pr >= 25) b.heavy += 1;

    const ym = `${yr}-${d.slice(4, 6)}`;
    const cur = ymMap.get(ym) ?? { n: 0, tSum: 0, pSum: 0, wSum: 0, wN: 0 };
    cur.n += 1;
    cur.tSum += t;
    cur.pSum += pr;
    if (valid(gw)) {
      cur.wSum += gw;
      cur.wN += 1;
    }
    ymMap.set(ym, cur);
  }

  const monthly: MonthlyClimate[] = cal.map((b, m) => {
    const n = Math.max(1, b.n);
    const yrs = Math.max(1, b.years.size);
    const tmean = +(b.tmean / n).toFixed(1);
    const tmax = +(b.tmax / n).toFixed(1);
    const tmin = +(b.tmin / n).toFixed(1);
    const srad = +(b.srad / n).toFixed(1);
    const precip = +(b.precip / yrs).toFixed(1);
    const et0Day = hargreavesET0(tmean, tmax, tmin, srad);
    const et0 = +(et0Day * DAYS_IN_MONTH[m]).toFixed(1);
    return {
      month: m,
      tmean,
      tmax,
      tmin,
      precip,
      et0,
      srad,
      rh: Math.round(b.rh / n),
      wind: +(b.wind / n).toFixed(1),
      frostDays: +(b.frost / yrs).toFixed(1),
      heatDays: +(b.heat / yrs).toFixed(1),
      heavyRainDays: +(b.heavy / yrs).toFixed(1),
      soilWetness: b.wetN > 0 ? +(b.wet / b.wetN).toFixed(2) : 0.4,
    };
  });

  // Recent 24 months vs 10-year monthly climatology
  const recentKeys = Array.from(ymMap.keys()).sort().slice(-24);
  const recent: MonthlyObservation[] = recentKeys.map((ym) => {
    const v = ymMap.get(ym)!;
    const mIdx = Number(ym.slice(5, 7)) - 1;
    const base = monthly[mIdx];
    const tmean = +(v.tSum / v.n).toFixed(1);
    const precip = +v.pSum.toFixed(1);
    const soilWetness = v.wN > 0 ? +(v.wSum / v.wN).toFixed(2) : undefined;
    const tempAnomalyC = +(tmean - base.tmean).toFixed(2);
    const precipAnomalyPct = base.precip > 5 ? Math.round(((precip - base.precip) / base.precip) * 100) : 0;
    return {
      period: ym,
      tmean,
      precip,
      soilWetness,
      tempAnomalyC,
      precipAnomalyPct,
    };
  });

  // 30-year annual series & trends from monthly endpoint
  const annualSeries: AnnualPoint[] = [];
  if (monthlyRes.ok && monthlyRes.data?.properties?.parameter) {
    const mp = monthlyRes.data.properties.parameter;
    for (let yr = 1995; yr <= 2025; yr++) {
      let tSum = 0;
      let tCount = 0;
      let pSum = 0;
      let pCount = 0;
      for (let m = 0; m < 12; m++) {
        const key = `${yr}${String(m + 1).padStart(2, '0')}`;
        const tv = mp.T2M?.[key];
        const pv = mp.PRECTOTCORR?.[key];
        if (valid(tv)) {
          tSum += tv;
          tCount++;
        }
        if (valid(pv)) {
          pSum += pv * DAYS_IN_MONTH[m];
          pCount++;
        }
      }
      if (tCount === 12 && pCount === 12) {
        annualSeries.push({
          year: yr,
          tmean: +(tSum / 12).toFixed(2),
          precip: Math.round(pSum),
        });
      }
    }
  }

  let tempTrendCPerDecade: number | null = null;
  let precipTrendPctPerDecade: number | null = null;
  if (annualSeries.length >= 12) {
    const xs = annualSeries.map((a) => a.year);
    const ts = annualSeries.map((a) => a.tmean);
    const ps = annualSeries.map((a) => a.precip);
    const tSlope = linearSlope(xs, ts);
    const pSlope = linearSlope(xs, ps);
    const pMean = ps.reduce((a, b) => a + b, 0) / ps.length;
    if (tSlope !== null) tempTrendCPerDecade = +(tSlope * 10).toFixed(2);
    if (pSlope !== null && pMean > 10) precipTrendPctPerDecade = +((pSlope * 10 / pMean) * 100).toFixed(1);
  }

  const latestFormatted = latestDate
    ? `${latestDate.slice(0, 4)}-${latestDate.slice(4, 6)}-${latestDate.slice(6, 8)}`
    : undefined;

  return {
    ok: true,
    monthly,
    annualSeries,
    recent,
    tempTrendCPerDecade,
    precipTrendPctPerDecade,
    period: '2016–2025 (diario) / 1995–2025 (tendencias)',
    latestObservation: latestFormatted,
    report: {
      id: 'nasa-power',
      status: 'live',
      mode: 'values',
      ms: Math.max(dailyRes.ms, monthlyRes.ms),
      summary: `${dates.length} días agroclimáticos (2016–2025) y ${annualSeries.length} años de tendencia`,
      retrievedAt,
      latestObservation: latestFormatted,
      endpoint: 'power.larc.nasa.gov/api/temporal/{daily,monthly}/point',
    },
  };
}
