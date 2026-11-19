import { getCrop } from '@fieldshift/core';
import type { CropHistory, CropHistoryYear, SourceReport } from '@fieldshift/core';
import { wgs84ToAlbers5070 } from '../lib/geo';
import { fetchText } from '../lib/http';

const CDL_TO_CROP_ID: Record<number, string> = {
  1: 'corn',
  12: 'corn',
  13: 'corn',
  2: 'cotton',
  4: 'sorghum',
  5: 'soybean',
  6: 'sunflower',
  10: 'peanut',
  21: 'barley',
  22: 'wheat',
  23: 'wheat',
  24: 'wheat',
  27: 'cover-rye',
  28: 'oats-forage',
  31: 'canola',
  33: 'safflower',
  36: 'alfalfa',
  37: 'perennial-grass',
  42: 'drybean',
  51: 'chickpea',
  54: 'tomato',
  61: 'fallow',
  68: 'apple',
  74: 'pecan',
  176: 'perennial-grass',
  205: 'triticale-forage',
};

export interface CdlResult {
  cropHistory: CropHistory;
  report: SourceReport;
}

export async function fetchCdlHistory(lat: number, lon: number, inCONUS: boolean): Promise<CdlResult> {
  const retrievedAt = new Date().toISOString();
  if (!inCONUS) {
    return {
      cropHistory: {
        provenance: 'unavailable',
        sources: ['cdl'],
        years: [],
        maxConsecutiveSameFamily: 0,
        dominantCropId: null,
        summary: 'USDA CropScape CDL cubre únicamente Estados Unidos (CONUS). Ingrese su historial manualmente.',
      },
      report: {
        id: 'cdl',
        status: 'not-applicable',
        mode: 'values',
        ms: 0,
        summary: 'Solo cobertura EE. UU. (CONUS)',
      },
    };
  }

  const [ax, ay] = wgs84ToAlbers5070(lat, lon);
  const queryYears = [2021, 2022, 2023, 2024, 2025];
  const t0 = Date.now();

  const results = await Promise.all(
    queryYears.map(async (yr): Promise<CropHistoryYear | null> => {
      const url = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${yr}&x=${ax.toFixed(2)}&y=${ay.toFixed(2)}`;
      const res = await fetchText(url, undefined, 8000);
      if (!res.ok || !res.data) return null;
      const m = res.data.match(/value:\s*(\d+),\s*category:\s*"([^"]*)"/);
      if (!m) return null;
      const code = Number(m[1]);
      const name = m[2];
      return {
        year: yr,
        cdlCode: code,
        cdlName: name,
        cropId: CDL_TO_CROP_ID[code] ?? null,
      };
    }),
  );

  const ms = Date.now() - t0;
  const years = results.filter((r): r is CropHistoryYear => r !== null);

  if (years.length === 0) {
    return {
      cropHistory: {
        provenance: 'unavailable',
        sources: ['cdl'],
        years: [],
        maxConsecutiveSameFamily: 0,
        dominantCropId: null,
        summary: 'USDA CropScape no respondió para esta coordenada.',
      },
      report: {
        id: 'cdl',
        status: 'unavailable',
        mode: 'values',
        ms,
        summary: 'No se obtuvieron años CDL',
        retrievedAt,
        endpoint: 'nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue',
      },
    };
  }

  // Max consecutive same botanical family
  let maxConsec = 1;
  let cur = 1;
  const counts = new Map<string, number>();

  for (let i = 0; i < years.length; i++) {
    const cid = years[i].cropId;
    if (cid) counts.set(cid, (counts.get(cid) ?? 0) + 1);
    if (i > 0) {
      const prevCid = years[i - 1].cropId;
      const prevFam = prevCid ? getCrop(prevCid).family : years[i - 1].cdlName;
      const nowFam = cid ? getCrop(cid).family : years[i].cdlName;
      if (prevFam !== 'None' && prevFam === nowFam && years[i].cdlCode !== 61) {
        cur++;
        if (cur > maxConsec) maxConsec = cur;
      } else {
        cur = 1;
      }
    }
  }

  let dominantCropId: string | null = null;
  let bestC = 0;
  for (const [k, v] of counts.entries()) {
    if (v > bestC) {
      bestC = v;
      dominantCropId = k;
    }
  }

  const summary = years.map((y) => `${y.year}: ${y.cdlName}`).join(' · ');

  return {
    cropHistory: {
      provenance: 'live',
      sources: ['cdl'],
      years,
      maxConsecutiveSameFamily: maxConsec,
      dominantCropId,
      summary,
    },
    report: {
      id: 'cdl',
      status: 'live',
      mode: 'values',
      ms,
      summary: `${years.length} años CDL (${years[0].year}–${years[years.length - 1].year})`,
      retrievedAt,
      latestObservation: `${years[years.length - 1].year}`,
      endpoint: 'nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue',
    },
  };
}
