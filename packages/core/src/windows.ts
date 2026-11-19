import { getCrop } from './catalog';
import { MONTH_NAMES, getCropName, getFamilyLabel } from './i18n';
import type {
  CriticalWindow,
  CropEvaluation,
  FarmerInputs,
  Locale,
  MonthlyClimate,
  Provenance,
  SiteProfile,
  SourceId,
} from './types';

function fmtMonths(months: number[], locale: Locale): string {
  const names = MONTH_NAMES[locale];
  return months.map((m) => names[m]).join(', ');
}

export function detectCriticalWindows(
  site: SiteProfile,
  currentEval: CropEvaluation,
  farmer: FarmerInputs,
  effectiveClimate: MonthlyClimate[],
  isSimulated: boolean,
  locale: Locale = 'en',
): CriticalWindow[] {
  const windows: CriticalWindow[] = [];
  const currentCrop = getCrop(farmer.currentCropId);
  const cropName = getCropName(currentCrop, locale);
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
    const monthsText = fmtMonths(bareMonths, locale);
    windows.push({
      kind: 'bare-soil',
      title:
        locale === 'en'
          ? 'Months with bare, uncovered soil'
          : 'Meses con suelo desnudo (poca cobertura)',
      months: bareMonths,
      severity,
      detail:
        locale === 'en'
          ? fromSatellite
            ? `Satellite images show bare ground during ${monthsText} (${bareMonths.length} months). Wind, sun, and storms can dry out and wash away topsoil.`
            : `Leaving the field empty after ${cropName} leaves bare ground for ${bareMonths.length} months (${monthsText}).`
          : fromSatellite
          ? `Las fotos satelitales muestran tierra descubierta en ${monthsText} (${bareMonths.length} meses). El viento, el sol y la lluvia secan y lavan la tierra buena.`
          : `Con descanso pelón después de ${cropName}, el lote queda sin plantas durante ${bareMonths.length} meses (${monthsText}).`,
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

    const monthsText = fmtMonths(months, locale);
    windows.push({
      kind: 'water-stress',
      title:
        locale === 'en'
          ? 'High water need / dry stretch'
          : 'Meses con falta de agua y fuerte sequía',
      months,
      severity,
      detail:
        locale === 'en'
          ? `During ${monthsText}, ${cropName} needs much more water than rain provides${
              currentEval.waterDeficitMm > 0
                ? `, leaving an estimated shortfall of ${currentEval.waterDeficitMm} mm with current water.`
                : `, needing about ${currentEval.grossIrrigationMm} mm of irrigation.`
            }${aqDecline ? ' Regional groundwater tables also show a downward trend.' : ''}`
          : `Entre ${monthsText} ${cropName} pide mucha más agua de la que llueve${
              currentEval.waterDeficitMm > 0
                ? `, dejando un faltante estimado de ${currentEval.waterDeficitMm} mm con el agua disponible.`
                : `, pidiendo unos ${currentEval.grossIrrigationMm} mm de riego.`
            }${aqDecline ? ' Además, los pozos y el agua subterránea de la región van a la baja.' : ''}`,
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
    const monthsText = fmtMonths(heatMonths, locale);
    windows.push({
      kind: 'heat',
      title:
        locale === 'en'
          ? 'High heat during flowering / grain fill'
          : 'Riesgo de calor fuerte en floración',
      months: heatMonths,
      severity: maxHeat >= currentCrop.thermal.tHeatStress + 2 ? 'high' : 'medium',
      detail:
        locale === 'en'
          ? `Afternoon highs average ${maxHeat.toFixed(1)} °C in ${monthsText} (above ${cropName}'s ${currentCrop.thermal.tHeatStress} °C comfort limit). This can hurt pollination and harvest weight.`
          : `El calor en la tarde alcanza ${maxHeat.toFixed(1)} °C en ${monthsText} (límite de ${cropName}: ${currentCrop.thermal.tHeatStress} °C). Puede pasmar flores y bajar cosecha.`,
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
    const monthsText = fmtMonths(frostMonths, locale);
    windows.push({
      kind: 'frost',
      title:
        locale === 'en'
          ? 'Frost risk while crop is growing'
          : 'Riesgo de heladas con el cultivo en pie',
      months: frostMonths,
      severity: frostMonths.some((m) => effectiveClimate[m].frostDays >= 5) ? 'high' : 'medium',
      detail:
        locale === 'en'
          ? `Freezing nights occur in ${monthsText} while ${cropName} is growing. Consider shifting your planting date or choosing a frost-hardy crop.`
          : `Se esperan heladas en ${monthsText} mientras ${cropName} está en el terreno. Conviene ajustar la fecha de siembra o usar un cultivo que aguante más frío.`,
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
    const monthsText = fmtMonths(erosiveMonths, locale);
    windows.push({
      kind: 'erosion',
      title:
        locale === 'en'
          ? 'Heavy rain runoff & topsoil washout'
          : 'Riesgo de deslave y pérdida de tierra buena',
      months: erosiveMonths,
      severity: site.terrain.slopePct > 4 || bareMonths.length >= 4 ? 'high' : 'medium',
      detail:
        locale === 'en'
          ? `Heavy storms in ${monthsText} hit a ${site.terrain.slopePct.toFixed(1)}% slope. Leaving crop stubble or planting a cover crop cuts topsoil loss sharply.`
          : `Lluvias fuertes en ${monthsText} caen sobre terreno con ${site.terrain.slopePct.toFixed(1)} % de inclinación. Dejar rastrojo o planta de cobertura frena mucho el deslave.`,
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
    const famLabel = getFamilyLabel(currentCrop.family, locale);
    windows.push({
      kind: 'monoculture',
      title:
        locale === 'en'
          ? 'Pest buildup from repeating the same crop'
          : 'Riesgo de plagas por repetir el mismo cultivo',
      months: Array.from(activeMonths),
      severity: maxConsec >= 3 ? 'high' : 'medium',
      detail:
        locale === 'en'
          ? `${maxConsec} straight seasons of the same plant family (${famLabel})${
              cdlConsec >= 2 ? ` (also seen on USDA crop maps)` : ''
            }. Rotating to a different crop family helps break root pests and stubborn weeds.`
          : `Se ven ${maxConsec} ciclos seguidos de la misma familia (${famLabel})${
              cdlConsec >= 2 ? ` (también visto en mapas agrícolas de EE. UU.)` : ''
            }. Cambiar a otra familia corta plagas de raíz y malezas.`,
      provenance: cdlConsec >= 2 ? site.cropHistory.provenance : 'user',
      sources: cdlConsec >= 2 ? site.cropHistory.sources : ['user-input'],
    });
  }

  // 7. Off-season opportunity window (cover crop or short-cycle legume)
  const offMonths = Array.from({ length: 12 }, (_, m) => m).filter((m) => !activeMonths.has(m));
  const workableOff = offMonths.filter((m) => effectiveClimate[m].tmean >= 4 && effectiveClimate[m].precip >= 12);
  if (offMonths.length >= 3 && farmer.offSeason === 'bare') {
    const offText = fmtMonths(offMonths, locale);
    windows.push({
      kind: 'opportunity',
      title:
        locale === 'en'
          ? 'Open window to cover soil or grow a short crop'
          : 'Tiempo libre para tapar el suelo o meter otro cultivo corto',
      months: workableOff.length >= 2 ? workableOff : offMonths.slice(0, 4),
      severity: 'low',
      detail:
        locale === 'en'
          ? `Your field sits open for ${offMonths.length} months after harvest (${offText}). ${
              workableOff.length >= 2
                ? 'There is enough warmth and rain to grow a low-cost cover crop or winter forage.'
                : 'Even though it is cool or dry then, keeping standing stubble protects leftover moisture.'
            }`
          : `Quedan ${offMonths.length} meses libres después de cosechar (${offText}). ${
              workableOff.length >= 2
                ? 'Hay humedad y calor suficiente para sembrar una cobertura barata o avena de invierno.'
                : 'Aunque es tiempo seco o frío, dejar el rastrojo en pie guarda la humedad que queda.'
            }`,
      provenance: climProv,
      sources: climSources,
    });
  }

  return windows;
}
