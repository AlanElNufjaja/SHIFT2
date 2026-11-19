import { getCrop } from './catalog';
import { MONTH_NAMES_ES } from './sources';
import type {
  CriticalWindow,
  CropEvaluation,
  FarmerInputs,
  MonthlyClimate,
  Provenance,
  SiteProfile,
  SourceId,
} from './types';

function fmtMonths(months: number[]): string {
  return months.map((m) => MONTH_NAMES_ES[m]).join(', ');
}

export function detectCriticalWindows(
  site: SiteProfile,
  currentEval: CropEvaluation,
  farmer: FarmerInputs,
  effectiveClimate: MonthlyClimate[],
  isSimulated: boolean,
): CriticalWindow[] {
  const windows: CriticalWindow[] = [];
  const currentCrop = getCrop(farmer.currentCropId);
  const climProv: Provenance = isSimulated ? 'simulated' : site.climate.provenance;
  const climSources: SourceId[] = isSimulated ? [...site.climate.sources, 'user-input'] : site.climate.sources;

  // 1. Bare soil window from MODIS NDVI + off-season management
  const activeMonths = new Set<number>();
  for (let k = 0; k < currentEval.placement.months; k++) {
    activeMonths.add((currentEval.placement.startMonth + k) % 12);
  }
  const ndviBare = site.vegetation.bareSoilMonths;
  const offSeasonBare = farmer.offSeason === 'bare'
    ? Array.from({ length: 12 }, (_, m) => m).filter((m) => !activeMonths.has(m))
    : [];

  const bareMonths = ndviBare.length > 0 ? ndviBare : offSeasonBare;
  if (bareMonths.length >= 2) {
    const severity = bareMonths.length >= 5 ? 'high' : bareMonths.length >= 3 ? 'medium' : 'low';
    const fromSatellite = ndviBare.length > 0;
    windows.push({
      kind: 'bare-soil',
      title: 'Ventana de suelo desnudo (baja cobertura vegetal)',
      months: bareMonths,
      severity,
      detail: fromSatellite
        ? `MODIS NDVI < 0.25 en ${fmtMonths(bareMonths)}. Durante estos ${bareMonths.length} meses el suelo queda expuesto a viento, radiación directa, evaporación y pérdida de materia orgánica.`
        : `Con manejo actual en barbecho tras ${currentCrop.name}, el lote queda sin cultivo vivo durante ${bareMonths.length} meses (${fmtMonths(bareMonths)}).`,
      provenance: fromSatellite ? site.vegetation.provenance : 'derived',
      sources: fromSatellite ? site.vegetation.sources : ['user-input'],
    });
  }

  // 2. Water stress / peak evaporative demand window
  const activeStressMonths = currentEval.monthly
    .filter((mb) => mb.etc - mb.peff > 75 || (farmer.constraints.irrigationSystem === 'none' && mb.etc - mb.peff > 40))
    .map((mb) => mb.month);

  if (activeStressMonths.length > 0 || currentEval.waterDeficitMm > 60) {
    const months = activeStressMonths.length > 0
      ? activeStressMonths
      : currentEval.monthly.slice(1, 4).map((m) => m.month);
    const aqDecline =
      site.water.regionalStorageTrend.value === 'strong-decline' ||
      site.water.regionalStorageTrend.value === 'decline' ||
      (site.water.groundwater.medianTrendMPerYr !== null && site.water.groundwater.medianTrendMPerYr < -0.15);

    const severity =
      currentEval.waterDeficitMm > 180 || (currentEval.waterDeficitMm > 80 && aqDecline)
        ? 'high'
        : currentEval.waterDeficitMm > 60 || aqDecline
        ? 'medium'
        : 'low';

    windows.push({
      kind: 'water-stress',
      title: 'Ventana crítica de estrés hídrico / alta demanda evaporativa',
      months,
      severity,
      detail: `Entre ${fmtMonths(months)} la demanda de ${currentCrop.name} (ETc) supera ampliamente la lluvia efectiva${
        currentEval.waterDeficitMm > 0
          ? `, generando un déficit estimado de ${currentEval.waterDeficitMm} mm con el agua disponible.`
          : `, exigiendo ${currentEval.grossIrrigationMm} mm brutos de riego.`
      }${aqDecline ? ' Además, los indicadores regionales/pozos muestran descenso hídrico.' : ''}`,
      provenance: climProv,
      sources: climSources,
    });
  }

  // 3. Heat stress window
  const heatMonths = effectiveClimate
    .filter((m) => m.heatDays >= 3 || m.tmax >= currentCrop.thermal.tHeatStress - 1)
    .filter((m) => activeMonths.has(m.month))
    .map((m) => m.month);

  if (heatMonths.length > 0) {
    const maxHeat = Math.max(...heatMonths.map((m) => effectiveClimate[m].tmax));
    windows.push({
      kind: 'heat',
      title: 'Riesgo de golpe de calor en etapa sensible',
      months: heatMonths,
      severity: maxHeat >= currentCrop.thermal.tHeatStress + 2 ? 'high' : 'medium',
      detail: `Temperaturas máximas medias alcanzan ${maxHeat.toFixed(1)} °C en ${fmtMonths(heatMonths)} (umbral crítico de ${currentCrop.name}: ${currentCrop.thermal.tHeatStress} °C). Puede afectar polinización y llenado.`,
      provenance: climProv,
      sources: climSources,
    });
  }

  // 4. Frost window overlapping active crop or spring bloom
  const frostMonths = effectiveClimate
    .filter((m) => m.frostDays >= 1.5 && activeMonths.has(m.month))
    .filter(() => currentCrop.thermal.frostTolerance < 0.7)
    .map((m) => m.month);

  if (frostMonths.length > 0) {
    windows.push({
      kind: 'frost',
      title: 'Exposición a heladas durante ciclo activo o brotación',
      months: frostMonths,
      severity: frostMonths.some((m) => effectiveClimate[m].frostDays >= 5) ? 'high' : 'medium',
      detail: `Se registran heladas en ${fmtMonths(frostMonths)} mientras ${currentCrop.name} (tolerancia baja/media a heladas) está en campo. Considere ajuste de fecha de siembra o cultivo tolerante al frío.`,
      provenance: climProv,
      sources: climSources,
    });
  }

  // 5. Erosion risk (heavy rain on bare soil or steep slope / high K)
  const bareSet = new Set(bareMonths);
  const erosiveMonths = effectiveClimate
    .filter((m) => (m.heavyRainDays >= 0.8 || m.precip >= 85) && (bareSet.has(m.month) || site.terrain.slopePct > 3))
    .map((m) => m.month);

  if (erosiveMonths.length > 0 && (site.terrain.slopePct > 2 || site.soil.kFactor >= 0.032 || bareMonths.length >= 3)) {
    windows.push({
      kind: 'erosion',
      title: 'Riesgo de erosión hídrica y pérdida de suelo fértil',
      months: erosiveMonths,
      severity: site.terrain.slopePct > 4 || bareMonths.length >= 4 ? 'high' : 'medium',
      detail: `Lluvias intensas en ${fmtMonths(erosiveMonths)} coinciden con pendiente de ${site.terrain.slopePct.toFixed(1)} % y erodabilidad K=${site.soil.kFactor.toFixed(3)}. Mantener rastrojo o cobertura viva reduce drásticamente el arrastre.`,
      provenance: site.terrain.provenance === 'live' ? 'derived' : site.terrain.provenance,
      sources: [...site.terrain.sources, ...site.soil.sources],
    });
  }

  // 6. Monoculture / pest cycle lock-in
  const histFamilies = [
    currentCrop.family,
    ...farmer.previousCropIds.map((id) => {
      try { return getCrop(id).family; } catch { return 'None'; }
    }),
  ].filter((f) => f !== 'None');

  let consecFarmer = 1;
  for (let i = 1; i < histFamilies.length; i++) {
    if (histFamilies[i] === histFamilies[0]) consecFarmer++;
    else break;
  }
  const cdlConsec = site.cropHistory.maxConsecutiveSameFamily;
  const maxConsec = Math.max(consecFarmer, cdlConsec);

  if (maxConsec >= 2) {
    windows.push({
      kind: 'monoculture',
      title: 'Riesgo de acumulación de plagas y patógenos por monocultivo',
      months: Array.from(activeMonths),
      severity: maxConsec >= 3 ? 'high' : 'medium',
      detail: `Se detectan ${maxConsec} ciclos consecutivos de la familia ${currentCrop.family}${
        cdlConsec >= 2 ? ` (confirmado también en USDA CropScape: ${site.cropHistory.summary})` : ''
      }. Alternar con otra familia botánica rompe inóculo de suelo y malezas.`,
      provenance: cdlConsec >= 2 ? site.cropHistory.provenance : 'user',
      sources: cdlConsec >= 2 ? site.cropHistory.sources : ['user-input'],
    });
  }

  // 7. Off-season opportunity window (cover crop or short-cycle legume)
  const offMonths = Array.from({ length: 12 }, (_, m) => m).filter((m) => !activeMonths.has(m));
  const workableOff = offMonths.filter((m) => effectiveClimate[m].tmean >= 4 && effectiveClimate[m].precip >= 12);
  if (offMonths.length >= 3 && farmer.offSeason === 'bare') {
    windows.push({
      kind: 'opportunity',
      title: 'Ventana de oportunidad entre ciclos para cobertura o leguminosa',
      months: workableOff.length >= 2 ? workableOff : offMonths.slice(0, 4),
      severity: 'low',
      detail: `Existen ${offMonths.length} meses libres tras la cosecha principal (${fmtMonths(offMonths)}). ${
        workableOff.length >= 2
          ? 'Hay humedad y temperatura suficientes para establecer un cultivo de cobertura o forraje invernal de bajo costo.'
          : 'Aunque el periodo es seco o frío, conservar rastrojo en pie y evitar laboreo protege la humedad residual.'
      }`,
      provenance: climProv,
      sources: climSources,
    });
  }

  return windows;
}
