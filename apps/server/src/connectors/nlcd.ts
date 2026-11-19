import type { Sourced, SourceReport } from '@fieldshift/core';
import { fetchJson } from '../lib/http';

const NLCD_CLASSES: Record<number, string> = {
  11: 'Agua abierta',
  21: 'Área abierta desarrollada',
  22: 'Urbano baja intensidad',
  23: 'Urbano intensidad media',
  24: 'Urbano alta intensidad',
  31: 'Suelo estéril / roca / arena',
  41: 'Bosque caducifolio',
  42: 'Bosque de coníferas',
  43: 'Bosque mixto',
  52: 'Matorral / arbustal',
  71: 'Pastizal / herbazal',
  81: 'Pradera / heno (Pasture/Hay)',
  82: 'Cultivos agrícolas (Cultivated Crops)',
  90: 'Humedal boscoso',
  95: 'Humedal herbáceo',
};

interface NlcdResponse {
  features?: { properties?: { PALETTE_INDEX?: number } }[];
}

export async function fetchNlcd(
  lat: number,
  lon: number,
  inCONUS: boolean,
): Promise<{ landCover: Sourced<string> | null; report: SourceReport }> {
  const retrievedAt = new Date().toISOString();
  if (!inCONUS) {
    return {
      landCover: null,
      report: {
        id: 'nlcd',
        status: 'not-applicable',
        mode: 'values',
        ms: 0,
        summary: 'Solo cobertura EE. UU. (CONUS)',
      },
    };
  }

  const d = 0.001;
  const url =
    `https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms` +
    `?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo` +
    `&LAYERS=NLCD_2021_Land_Cover_L48&QUERY_LAYERS=NLCD_2021_Land_Cover_L48` +
    `&STYLES=&SRS=EPSG:4326` +
    `&BBOX=${(lon - d).toFixed(5)},${(lat - d).toFixed(5)},${(lon + d).toFixed(5)},${(lat + d).toFixed(5)}` +
    `&WIDTH=3&HEIGHT=3&X=1&Y=1&INFO_FORMAT=application/json`;

  const res = await fetchJson<NlcdResponse>(url, undefined, 7000);
  const code = res.data?.features?.[0]?.properties?.PALETTE_INDEX;

  if (!res.ok || typeof code !== 'number') {
    return {
      landCover: null,
      report: {
        id: 'nlcd',
        status: 'unavailable',
        mode: 'values',
        ms: res.ms,
        summary: 'Sin respuesta de USGS NLCD',
        detail: res.error,
        retrievedAt,
        endpoint: 'mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms',
      },
    };
  }

  const label = NLCD_CLASSES[code] ?? `Clase NLCD ${code}`;
  return {
    landCover: {
      value: label,
      provenance: 'live',
      sources: ['nlcd'],
      resolution: '30 m (NLCD 2021)',
      confidence: 0.85,
    },
    report: {
      id: 'nlcd',
      status: 'live',
      mode: 'values',
      ms: res.ms,
      summary: `Cobertura 30 m: ${label} (código ${code})`,
      retrievedAt,
      latestObservation: '2021',
      endpoint: 'mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms',
    },
  };
}
