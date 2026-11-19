import { getSourceMeta } from '@fieldshift/core';
import type { ConnectorStatus, Locale, Provenance, SourceReport } from '@fieldshift/core';

export const PROVENANCE_COPY: Record<
  Locale,
  Record<Provenance, { label: string; explain: string }>
> = {
  en: {
    live: {
      label: 'Live recent data',
      explain: 'Pulled today from weather stations, soil maps, or satellites for your location.',
    },
    cached: {
      label: 'Saved recent data',
      explain: 'Real satellite or soil data checked recently for your location.',
    },
    derived: {
      label: 'Calculated from local weather',
      explain: 'Calculated directly from your parcel’s local rainfall, temperature, and soil figures.',
    },
    baseline: {
      label: 'Regional estimate',
      explain: 'Approximate regional figure (not measured on your exact field). Worth checking in person.',
    },
    simulated: {
      label: 'Weather test mode',
      explain: 'Result from the heat, rain, or water-cut sliders you adjusted to test different seasons.',
    },
    user: {
      label: 'Entered by you',
      explain: 'Numbers or choices you typed in or adjusted in the guide.',
    },
    unavailable: {
      label: 'Not available here',
      explain: 'No local record was returned for this spot, so a neutral starting value is used.',
    },
  },
  es: {
    live: {
      label: 'Dato real reciente',
      explain: 'Tomado hoy de estaciones climáticas, mapas de suelo o satélites para tu zona.',
    },
    cached: {
      label: 'Dato real guardado',
      explain: 'Dato real consultado hace poco para tu zona.',
    },
    derived: {
      label: 'Calculado del clima',
      explain: 'Cuenta sacada con los datos reales del clima y de la tierra de tu parcela.',
    },
    baseline: {
      label: 'Estimado de la región',
      explain: 'Referencia aproximada de la zona (no es medición directa en tu terreno). Conviene revisarlo en campo.',
    },
    simulated: {
      label: 'Prueba de clima',
      explain: 'Resultado de la prueba que moviste para ver qué pasa si cambia el calor, la lluvia o el riego.',
    },
    user: {
      label: 'Dato que pusiste tú',
      explain: 'Información que tú escribiste o ajustaste en la herramienta.',
    },
    unavailable: {
      label: 'Sin dato aquí',
      explain: 'No hubo información disponible para este punto; usamos un valor neutro.',
    },
  },
};

export const CONNECTOR_STATUS_COPY: Record<
  Locale,
  Record<ConnectorStatus, { label: string; cls: string }>
> = {
  en: {
    live: { label: 'Live', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    cached: { label: 'Saved', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
    fallback: { label: 'Estimate', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    unavailable: { label: 'No reply', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
    'not-applicable': { label: 'Other region', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
    'key-required': { label: 'Optional key', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
    reference: { label: 'Reference', cls: 'bg-stone-50 text-stone-700 border-stone-200' },
  },
  es: {
    live: { label: 'En vivo', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    cached: { label: 'Guardado', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
    fallback: { label: 'Estimado', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    unavailable: { label: 'Sin respuesta', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
    'not-applicable': { label: 'Otra región', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
    'key-required': { label: 'Opcional', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
    reference: { label: 'Referencia', cls: 'bg-stone-50 text-stone-700 border-stone-200' },
  },
};

export function localizeSourceSummary(rep: SourceReport, locale: Locale): string {
  if (locale === 'es') return rep.summary;

  if (rep.status === 'reference') {
    return getSourceMeta(rep.id, 'en').usedFor;
  }

  if (rep.id === 'fieldshift-baseline') {
    return rep.status === 'fallback'
      ? 'Used automatically as a backup for one or more missing live feeds.'
      : 'Not needed — live data answered for climate, soil, and terrain.';
  }
  if (rep.id === 'fieldshift-catalog') {
    return '25 crops & cover crops with water, nitrogen, soil, and budget benchmarks.';
  }
  if (rep.id === 'user-input') {
    return 'Ready for your current crop, water limits, gear, and priorities.';
  }
  if (rep.id === 'nass-quickstats') {
    return rep.status === 'live'
      ? 'Connected via /api/crops with NASS_API_KEY.'
      : 'Built-in 2023–2024 USDA price benchmarks active (no API key needed).';
  }
  if (rep.id === 'openet') {
    if (rep.status === 'not-applicable') return 'Covers U.S. fields primarily.';
    if (rep.status === 'key-required') return 'Optional 30 m U.S. water-use lookup (requires OPENET_API_KEY).';
  }

  if (rep.status === 'not-applicable') {
    return 'Covers contiguous United States only.';
  }
  if (rep.summary === 'No consultado' || rep.status === 'unavailable') {
    return 'No live record returned for this spot.';
  }

  // Fallback for live connector summaries containing numbers
  const nums = rep.summary.match(/\d+/g);
  if (rep.id === 'nasa-power') {
    return nums ? `Live daily climate record retrieved (${nums[0]} years)` : 'Live NASA POWER climate data loaded';
  }
  if (rep.id === 'era5') {
    return 'Live ERA5-Land evaporation & topsoil moisture loaded';
  }
  if (rep.id === 'modis') {
    return 'Live MODIS greenness (NDVI) & surface heat curve loaded';
  }
  if (rep.id === 'srtm' || rep.id === 'copernicus-dem') {
    return 'Elevation and hill slope calculated';
  }
  if (rep.id === 'ssurgo' || rep.id === 'soilgrids') {
    return 'Local soil texture, water holding & pH loaded';
  }
  if (rep.id === 'cdl') {
    return nums ? `Checked ${nums[0]} years of USDA crop history` : 'Checked USDA crop map history';
  }
  if (rep.id === 'nlcd') {
    return 'Checked 30 m U.S. land cover at parcel';
  }
  if (rep.id === 'usgs-water') {
    return nums && Number(nums[0]) > 0
      ? `Checked ${nums[0]} nearby USGS well station(s)`
      : 'No nearby USGS monitoring wells within 25 km';
  }
  if (['smap', 'gpm-imerg', 'landsat', 'viirs', 'ecostress', 'grace', 'gldas', 'nldas', 'gedi', 'sentinel-2', 'naip'].includes(rep.id)) {
    return nums
      ? `${nums[0]} recent satellite pass(es)/scene(s) found over this field`
      : 'Satellite coverage verified for this location';
  }

  return rep.summary;
}

export function translateNassStatus(summary: string | undefined, locale: Locale): string {
  if (!summary) return '';
  if (locale === 'es') return summary.replace(/\.+$/, '');
  if (summary.toLowerCase().includes('quickstats') || summary.toLowerCase().includes('nass')) {
    if (summary.toLowerCase().includes('actualizados') || summary.toLowerCase().includes('en caché')) {
      return 'Live USDA NASS reference prices active';
    }
    return 'Using built-in 2023–2024 USDA price benchmarks';
  }
  return summary.replace(/\.+$/, '');
}
