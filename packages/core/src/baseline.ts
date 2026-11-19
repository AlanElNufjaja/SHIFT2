/**
 * Transparent baseline / synthetic generators used strictly when live APIs
 * are unreachable or lack coverage. Every value carries provenance: 'baseline'.
 */
import { AQUIFER_NOTES_EN } from './i18n';
import type { Locale, MonthlyClimate, SoilProfile, Sourced, TerrainProfile } from './types';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function buildSyntheticClimate(lat: number, lon: number): {
  monthly: MonthlyClimate[];
  period: string;
} {
  const absLat = Math.abs(lat);
  const south = lat < 0;

  // Approximate annual mean temperature and seasonal amplitude by latitude
  const meanTemp = clamp(28 - 0.43 * absLat, -5, 29);
  const amp = clamp(2 + 0.28 * absLat, 2, 15);

  // Subtropical dry belt around 20–35° (wider in continental interiors)
  const subtropDry = Math.exp(-Math.pow((absLat - 29) / 10, 2));
  const baseAnnualPrecip = clamp(1200 - 800 * subtropDry - 8 * Math.max(0, absLat - 45), 220, 1500);

  // Simple monsoon vs mediterranean vs continental seasonality
  const mediterranean = absLat >= 31 && absLat <= 43 && lon < -112;

  const monthly: MonthlyClimate[] = [];
  for (let m = 0; m < 12; m++) {
    const phase = south ? ((m + 6) % 12) : m; // align peak warmth to phase=6 (July N / Jan S)
    const seasonalWave = -Math.cos((2 * Math.PI * (phase - 0.4)) / 12);
    const tmean = +(meanTemp + amp * seasonalWave).toFixed(1);
    const diurnal = 10 + 5 * subtropDry;
    const tmax = +(tmean + diurnal * 0.5).toFixed(1);
    const tmin = +(tmean - diurnal * 0.5).toFixed(1);

    // Solar radiation MJ/m2/day
    const srad = +clamp(17 + 7 * seasonalWave - 0.12 * absLat, 5, 27).toFixed(1);

    // Rainfall weight
    let w: number;
    if (mediterranean) {
      w = 1 - 0.8 * seasonalWave; // wet winter, dry summer
    } else if (subtropDry > 0.45) {
      w = 0.6 + 0.9 * Math.max(0, Math.sin((Math.PI * (phase - 4)) / 6)); // summer monsoon peak
    } else {
      w = 0.8 + 0.35 * seasonalWave;
    }
    const precip = +(Math.max(5, (baseAnnualPrecip / 12) * Math.max(0.12, w))).toFixed(1);

    // Hargreaves ET0
    const et0Day = 0.0023 * Math.max(1, tmean + 17.8) * Math.sqrt(Math.max(1, tmax - tmin)) * (srad * 0.408);
    const et0 = +Math.max(15, et0Day * DAYS_IN_MONTH[m]).toFixed(1);

    const frostDays = tmin <= 0 ? +clamp((2 - tmin) * 2.5, 1, DAYS_IN_MONTH[m]).toFixed(1) : tmin < 4 ? 1.5 : 0;
    const heatDays = tmax >= 35 ? +clamp((tmax - 33) * 3.5, 1, DAYS_IN_MONTH[m]).toFixed(1) : tmax > 32 ? 1.5 : 0;
    const heavyRainDays = precip > 90 ? +(precip / 65).toFixed(1) : precip > 45 ? 0.5 : 0.1;

    const rh = +clamp(72 - 22 * subtropDry - 8 * seasonalWave, 25, 88).toFixed(0);
    const wind = +(2.3 + 0.5 * subtropDry).toFixed(1);
    const soilWetness = +clamp(0.25 + 0.35 * (precip / Math.max(30, et0)), 0.15, 0.8).toFixed(2);

    monthly.push({
      month: m,
      tmean,
      tmax,
      tmin,
      precip,
      et0,
      srad,
      rh,
      wind,
      frostDays,
      heatDays,
      heavyRainDays,
      soilWetness,
    });
  }

  return {
    monthly,
    period: 'Modelo sintético latitudinal (respaldo sin API en vivo)',
  };
}

export function buildSyntheticSoil(_lat: number, _lon: number): SoilProfile {
  return {
    provenance: 'baseline',
    sources: ['fieldshift-baseline'],
    confidence: 0.35,
    resolution: 'Referencia regional (no medido en campo)',
    sand: 40,
    clay: 22,
    silt: 38,
    organicMatter: 1.6,
    awcMmPerM: 145,
    ph: 7.2,
    kFactor: 0.032,
    drainage: 'well',
    texture: 'loam',
    ecDsM: null,
    rootZoneDepthM: 1.2,
    notes: [
      'Valores francos de referencia generados porque ningún servicio de suelos respondió. Valide textura, pH y salinidad con análisis de suelo local.',
    ],
  };
}

export function buildSyntheticTerrain(_lat: number, _lon: number): TerrainProfile {
  return {
    provenance: 'baseline',
    sources: ['fieldshift-baseline'],
    confidence: 0.3,
    resolution: 'Supuesto neutro (sin DEM)',
    elevationM: 500,
    slopePct: 1.5,
    aspectDeg: null,
    lsFactor: 0.25,
    terrainErosionIndex: 0.15,
  };
}

interface AquiferZone {
  name: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  trend: 'strong-decline' | 'decline' | 'stable';
  note: string;
}

const KNOWN_AQUIFER_ZONES: AquiferZone[] = [
  {
    name: 'Acuífero Ogallala / High Plains (EE. UU.)',
    latMin: 31.5, latMax: 42.5, lonMin: -105.0, lonMax: -97.5,
    trend: 'strong-decline',
    note: 'GRACE/GRACE-FO y piezómetros muestran descenso sostenido del almacenamiento subterráneo en el sur y centro del Ogallala.',
  },
  {
    name: 'Valle Central de California (EE. UU.)',
    latMin: 34.8, latMax: 40.6, lonMin: -122.5, lonMax: -118.5,
    trend: 'strong-decline',
    note: 'GRACE-FO documenta sobreexplotación crónica de acuíferos durante sequías multianuales (sujeto a planes SGMA).',
  },
  {
    name: 'Cuencas del Norte de México (Chihuahua / Coahuila / Sonora)',
    latMin: 25.5, latMax: 32.0, lonMin: -112.5, lonMax: -101.0,
    trend: 'decline',
    note: 'Estrés hídrico regional alto en presas y acuíferos agrícolas reportado por GRACE-FO y balances de CONAGUA.',
  },
  {
    name: 'Bajío y Centro de México',
    latMin: 19.8, latMax: 22.8, lonMin: -103.5, lonMax: -99.5,
    trend: 'strong-decline',
    note: 'Extracción intensiva en acuíferos del Bajío y Lerma-Chapala reportada en estudios GRACE y piezometría.',
  },
  {
    name: 'Corn Belt / Medio Oeste de EE. UU.',
    latMin: 39.0, latMax: 46.5, lonMin: -97.5, lonMax: -84.0,
    trend: 'stable',
    note: 'Almacenamiento hídrico regional estable en series GRACE-FO; los principales retos son drenaje, escorrentía y pérdida de nitratos.',
  },
  {
    name: 'Valle del Indo / Noroeste de India y Pakistán',
    latMin: 24.0, latMax: 33.5, lonMin: 68.0, lonMax: 78.5,
    trend: 'strong-decline',
    note: 'Una de las anomalías negativas más marcadas a nivel global en GRACE/GRACE-FO.',
  },
  {
    name: 'Llanura del Norte de China',
    latMin: 34.0, latMax: 40.5, lonMin: 113.0, lonMax: 120.5,
    trend: 'strong-decline',
    note: 'Descenso prolongado de reservas subterráneas observado por GRACE-FO.',
  },
  {
    name: 'Cuenca Murray–Darling (Australia)',
    latMin: -37.5, latMax: -26.0, lonMin: 138.0, lonMax: 151.0,
    trend: 'decline',
    note: 'Alta variabilidad interanual con déficits severos en años de El Niño en series GRACE.',
  },
];

export function lookupRegionalAquifer(
  lat: number,
  lon: number,
  locale: Locale = 'en',
): Sourced<'strong-decline' | 'decline' | 'stable' | 'unknown'> {
  const match = KNOWN_AQUIFER_ZONES.find(
    (z) => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax,
  );
  if (!match) {
    return {
      value: 'unknown',
      provenance: 'baseline',
      sources: ['grace', 'fieldshift-baseline'],
      resolution: '~300 km (GRACE/GRACE-FO)',
      confidence: 0.3,
      method:
        locale === 'en'
          ? 'Regional basin water overview'
          : 'Referencia regional por cuenca hidrogeológica',
      note:
        locale === 'en'
          ? 'No pre-mapped regional groundwater trend here; check local well water depths.'
          : 'Sin tendencia gravimétrica pre-clasificada para esta cuenca; verifique niveles piezométricos locales.',
    };
  }
  const enKey = Object.keys(AQUIFER_NOTES_EN).find((k) => match.name.includes(k));
  const enInfo = enKey ? AQUIFER_NOTES_EN[enKey] : undefined;
  return {
    value: match.trend,
    provenance: 'baseline',
    sources: ['grace', 'fieldshift-baseline'],
    resolution: '~300 km (GRACE/GRACE-FO)',
    confidence: 0.65,
    method:
      locale === 'en'
        ? `Regional GRACE groundwater overview: ${enInfo?.name ?? match.name}`
        : `Síntesis regional publicada GRACE/GRACE-FO: ${match.name}`,
    note:
      locale === 'en'
        ? `${enInfo?.note ?? match.note} Note: this covers a wide ~300 km basin, not a single well.`
        : `${match.note} Nota: la resolución de GRACE (~300 km) refleja la cuenca, no un pozo individual.`,
  };
}
