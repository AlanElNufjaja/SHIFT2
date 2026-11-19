import {
  buildSyntheticSoil,
  classifyTexture,
  clamp,
  estimateAWC,
  estimateKFactor,
} from '@fieldshift/core';
import type { DrainageClass, SoilProfile, SourceReport } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

interface SdaResponse {
  Table?: (string | null)[][];
}

interface SoilGridsResponse {
  properties?: {
    layers?: {
      name: string;
      depths: {
        range: { top_depth: number; bottom_depth: number };
        label: string;
        values: { mean: number | null };
      }[];
    }[];
  };
}

export interface SoilConnectorResult {
  soil: SoilProfile;
  reports: SourceReport[];
}

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapDrainage(raw: string | null | undefined): DrainageClass {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('excess')) return 'excessive';
  if (s.includes('somewhat poor')) return 'somewhat-poor';
  if (s.includes('very poorly') || s.includes('poorly')) return 'poor';
  if (s.includes('moderately well')) return 'moderate';
  return 'well';
}

async function querySsurgo(lat: number, lon: number) {
  const query = `SELECT TOP 15 mu.muname, c.compname, c.comppct_r, c.hydgrp, c.drainagecl, h.hzdept_r, h.hzdepb_r, h.sandtotal_r, h.claytotal_r, h.om_r, h.awc_r, h.kffact, h.ph1to1h2o_r, h.ec_r FROM mapunit mu INNER JOIN component c ON c.mukey = mu.mukey LEFT JOIN chorizon h ON h.cokey = c.cokey WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon.toFixed(5)} ${lat.toFixed(5)})')) ORDER BY c.comppct_r DESC, h.hzdept_r ASC`;

  return fetchJson<SdaResponse>(
    'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, format: 'JSON+COLUMNNAME' }),
    },
    10000,
  );
}

async function querySoilGrids(lat: number, lon: number) {
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query` +
    `?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}` +
    `&property=clay&property=sand&property=soc&property=phh2o` +
    `&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`;
  return fetchJson<SoilGridsResponse>(url, undefined, 11000);
}

export async function fetchSoil(lat: number, lon: number, inCONUS: boolean): Promise<SoilConnectorResult> {
  const retrievedAt = new Date().toISOString();
  const reports: SourceReport[] = [];

  if (inCONUS) {
    const sda = await querySsurgo(lat, lon);
    const rows = sda.data?.Table?.slice(1) ?? [];
    // Pick highest-percentage component that has non-null texture/horizon data
    const validRows = rows.filter((r) => num(r[7]) !== null && num(r[8]) !== null && num(r[9]) !== null);
    if (sda.ok && validRows.length > 0) {
      const topComp = validRows[0][1];
      const compRows = validRows.filter((r) => r[1] === topComp);

      let wSand = 0; let wSandD = 0;
      let wClay = 0; let wClayD = 0;
      let wOm = 0; let wOmD = 0;
      let wAwc = 0; let wAwcD = 0;
      let wKf = 0; let wKfD = 0;
      let wPh = 0; let wPhD = 0;
      let wEc = 0; let wEcD = 0;
      let maxDepthCm = 100;

      for (const r of compRows) {
        const top = num(r[5]) ?? 0;
        const bot = num(r[6]) ?? top + 20;
        if (bot > maxDepthCm) maxDepthCm = bot;
        // Weight mainly top 60 cm for agronomic surface & root zone
        const overlap = Math.max(0, Math.min(bot, 60) - top);
        if (overlap <= 0) continue;

        const sand = num(r[7]);
        const clay = num(r[8]);
        const om = num(r[9]);
        const awc = num(r[10]);
        const kf = num(r[11]);
        const ph = num(r[12]);
        const ec = num(r[13]);

        if (sand !== null) { wSand += sand * overlap; wSandD += overlap; }
        if (clay !== null) { wClay += clay * overlap; wClayD += overlap; }
        if (om !== null) { wOm += om * overlap; wOmD += overlap; }
        if (awc !== null) { wAwc += awc * overlap; wAwcD += overlap; }
        if (kf !== null) { wKf += kf * overlap; wKfD += overlap; }
        if (ph !== null) { wPh += ph * overlap; wPhD += overlap; }
        if (ec !== null) { wEc += ec * overlap; wEcD += overlap; }
      }

      if (wSandD > 0 && wClayD > 0) {
        const sand = Math.round(wSand / wSandD);
        const clay = Math.round(wClay / wClayD);
        const silt = Math.max(0, 100 - sand - clay);
        const organicMatter = +(wOmD > 0 ? wOm / wOmD : 1.8).toFixed(2);
        const awcMmPerM = wAwcD > 0
          ? Math.round(clamp((wAwc / wAwcD) * 1000, 60, 240))
          : estimateAWC(sand, clay, organicMatter);
        const kFactor = wKfD > 0
          ? +(clamp((wKf / wKfD) * 0.1317, 0.01, 0.075)).toFixed(4)
          : estimateKFactor(sand, silt, clay, organicMatter);
        const ph = wPhD > 0 ? +(wPh / wPhD).toFixed(1) : null;
        const ecDsM = wEcD > 0 ? +(wEc / wEcD).toFixed(1) : null;
        const drainage = mapDrainage(compRows[0][4]);
        const texture = classifyTexture(sand, clay);
        const muname = compRows[0][0] ?? undefined;
        const component = compRows[0][1] ?? undefined;
        const hydgrp = compRows[0][3] ?? undefined;

        const soil: SoilProfile = {
          provenance: 'live',
          sources: ['ssurgo'],
          confidence: 0.88,
          resolution: '1:12 000–1:24 000 (USDA SSURGO)',
          mapUnit: muname,
          component: component ?? undefined,
          sand,
          clay,
          silt,
          organicMatter,
          awcMmPerM,
          ph,
          kFactor,
          drainage,
          hydrologicGroup: hydgrp ?? undefined,
          texture,
          ecDsM,
          rootZoneDepthM: +clamp(maxDepthCm / 100, 0.6, 1.8).toFixed(1),
          notes: [
            `Serie dominante SSURGO: ${component ?? 'N/D'} (${compRows[0][2] ?? '?'} % del mapa).`,
          ],
        };

        reports.push({
          id: 'ssurgo',
          status: 'live',
          mode: 'values',
          ms: sda.ms,
          summary: `${muname ?? component}: ${texture}, MO ${organicMatter} %, AWC ${awcMmPerM} mm/m`,
          retrievedAt,
          endpoint: 'sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest',
        });
        reports.push({
          id: 'soilgrids',
          status: 'not-applicable',
          mode: 'values',
          ms: 0,
          summary: 'No requerido (SSURGO de mayor detalle disponible)',
        });
        return { soil, reports };
      }
    }

    reports.push({
      id: 'ssurgo',
      status: 'unavailable',
      mode: 'values',
      ms: sda.ms,
      summary: 'SSURGO sin horizontes agronómicos en este punto (ej. área urbana o agua)',
      detail: sda.error,
      retrievedAt,
      endpoint: 'sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest',
    });
  } else {
    reports.push({
      id: 'ssurgo',
      status: 'not-applicable',
      mode: 'values',
      ms: 0,
      summary: 'Solo cobertura EE. UU. (CONUS)',
    });
  }

  // Global / fallback: ISRIC SoilGrids v2.0
  const sg = await querySoilGrids(lat, lon);
  const layers = sg.data?.properties?.layers ?? [];
  const depthMean = (layerName: string, divisor: number): number | null => {
    const layer = layers.find((l) => l.name === layerName);
    if (!layer) return null;
    let sum = 0;
    let wSum = 0;
    for (const d of layer.depths) {
      if (d.values.mean === null || d.values.mean === undefined) continue;
      const thick = Math.max(1, d.range.bottom_depth - d.range.top_depth);
      sum += (d.values.mean / divisor) * thick;
      wSum += thick;
    }
    return wSum > 0 ? sum / wSum : null;
  };

  const clay = depthMean('clay', 10);
  const sand = depthMean('sand', 10);
  const socGKg = depthMean('soc', 10);
  const ph = depthMean('phh2o', 10);

  if (sg.ok && clay !== null && sand !== null) {
    const c = Math.round(clay);
    const s = Math.round(sand);
    const silt = Math.max(0, 100 - s - c);
    const om = +(socGKg !== null ? clamp((socGKg / 10) * 1.724, 0.4, 8) : 1.8).toFixed(2);
    const awcMmPerM = estimateAWC(s, c, om);
    const kFactor = estimateKFactor(s, silt, c, om);
    const texture = classifyTexture(s, c);
    const drainage: DrainageClass = s > 75 ? 'excessive' : c > 45 ? 'somewhat-poor' : 'well';

    const soil: SoilProfile = {
      provenance: 'live',
      sources: ['soilgrids'],
      confidence: 0.68,
      resolution: '250 m (ISRIC SoilGrids v2.0)',
      sand: s,
      clay: c,
      silt,
      organicMatter: om,
      awcMmPerM,
      ph: ph !== null ? +ph.toFixed(1) : null,
      kFactor,
      drainage,
      texture,
      ecDsM: null,
      rootZoneDepthM: 1.2,
      notes: [
        'Estimación estadística global 0–30 cm (SoilGrids). No incluye salinidad (EC) ni capas compactadas locales; valide con muestreo de laboratorio.',
      ],
    };

    reports.push({
      id: 'soilgrids',
      status: 'live',
      mode: 'values',
      ms: sg.ms,
      summary: `Textura ${texture} (arena ${s} %, arcilla ${c} %), MO ${om} %, pH ${soil.ph ?? 'N/D'}`,
      retrievedAt,
      endpoint: 'rest.isric.org/soilgrids/v2.0/properties/query',
    });
    return { soil, reports };
  }

  reports.push({
    id: 'soilgrids',
    status: 'unavailable',
    mode: 'values',
    ms: sg.ms,
    summary: 'SoilGrids sin datos en esta coordenada (posible zona urbana o cuerpo de agua)',
    detail: sg.error,
    retrievedAt,
    endpoint: 'rest.isric.org/soilgrids/v2.0/properties/query',
  });

  return {
    soil: buildSyntheticSoil(lat, lon),
    reports,
  };
}
