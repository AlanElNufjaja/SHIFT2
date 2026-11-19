import {
  applyScenario,
  clamp,
  computeRFactor,
  computeSoilLoss,
  evaluateCrop,
  irrigationEfficiency,
} from './agronomy';
import { CROPS, MAIN_CROPS, getCrop } from './catalog';
import { MONTH_NAMES_ES, PILOT_PARCELS } from './sources';
import { detectCriticalWindows } from './windows';
import type {
  AnalysisResult,
  Crop,
  CropCategory,
  CropEvaluation,
  CropFamily,
  CropSuitabilityRow,
  Equipment,
  EvidenceItem,
  FarmerInputs,
  MonthlyClimate,
  Priorities,
  Provenance,
  Scenario,
  SiteProfile,
  SourceId,
  Strategy,
  StrategyArchetype,
  StrategyMetrics,
  StrategyScores,
  TimelineSlot,
} from './types';

export const DEFAULT_PRIORITIES: Priorities = {
  water: 4,
  soil: 4,
  income: 3,
  forage: 1,
  resilience: 4,
};

const ALL_CATEGORIES: CropCategory[] = [
  'grain', 'oilseed', 'fiber', 'forage', 'vegetable', 'tree', 'legume', 'cover', 'fallow',
];

const ALL_EQUIPMENT: Equipment[] = [
  'planter', 'grain-drill', 'combine', 'cotton-picker', 'hay', 'orchard', 'vegetable', 'peanut-digger',
];

export function defaultFarmerInputs(site: SiteProfile): FarmerInputs {
  // Check if site is close to one of our pilot parcels to provide sensible defaults
  const pilot = PILOT_PARCELS.find(
    (p) => Math.hypot(p.lat - site.location.lat, p.lon - site.location.lon) < 0.25,
  );
  if (pilot) {
    return {
      currentCropId: pilot.defaultCropId,
      previousCropIds: [...pilot.defaultPreviousIds],
      offSeason: pilot.defaultOffSeason,
      priorities: { ...DEFAULT_PRIORITIES },
      constraints: {
        irrigationMm: pilot.defaultIrrigationMm,
        irrigationSystem: pilot.defaultIrrigationSystem,
        equipment: [...ALL_EQUIPMENT],
        marketCategories: [...ALL_CATEGORIES],
        excludedCrops: [],
        allowPerennials: true,
        farmSizeHa: 25,
        waterCostUsdPer1000m3: 25,
        nPriceUsdPerKg: 1.4,
      },
    };
  }

  // Otherwise infer reasonable defaults from climate & USDA CDL history
  const aridity = site.climate.aridityIndex;
  const cdlDom = site.cropHistory.dominantCropId;
  const recentHist = site.cropHistory.years
    .map((y) => y.cropId)
    .filter((id): id is string => id !== null)
    .slice(-2);

  const isArid = aridity < 0.45;
  const isCool = site.climate.meanTemp < 14;
  const currentCropId = cdlDom && CROPS.some((c) => c.id === cdlDom)
    ? cdlDom
    : isArid
    ? (isCool ? 'wheat' : 'sorghum')
    : (isCool ? 'wheat' : 'corn');

  return {
    currentCropId,
    previousCropIds: recentHist.length > 0 ? recentHist : [currentCropId],
    offSeason: site.vegetation.bareSoilMonths.length >= 3 ? 'bare' : 'cover',
    priorities: { ...DEFAULT_PRIORITIES },
    constraints: {
      irrigationMm: isArid ? 450 : 0,
      irrigationSystem: isArid ? 'sprinkler' : 'none',
      equipment: [...ALL_EQUIPMENT],
      marketCategories: [...ALL_CATEGORIES],
      excludedCrops: [],
      allowPerennials: true,
      farmSizeHa: 25,
      waterCostUsdPer1000m3: 25,
      nPriceUsdPerKg: 1.4,
    },
  };
}

function getExclusionReason(crop: Crop, farmer: FarmerInputs): string | undefined {
  if (crop.role === 'service') return undefined;
  const { constraints } = farmer;
  if (constraints.excludedCrops.includes(crop.id)) return 'Excluido manualmente';
  if (!constraints.allowPerennials && crop.season === 'perennial') return 'Perennes desactivados en restricciones';
  if (constraints.marketCategories.length > 0 && !constraints.marketCategories.includes(crop.category)) {
    return `Categoría (${crop.category}) fuera de acceso de mercado`;
  }
  if (constraints.equipment.length > 0 && crop.equipment.length > 0) {
    const hasOne = crop.equipment.some((eq) => constraints.equipment.includes(eq));
    if (!hasOne) return 'Requiere maquinaria no disponible';
  }
  return undefined;
}

function pickBestCover(
  evals: Record<string, CropEvaluation>,
  preferLegume: boolean,
  effectiveClimate: MonthlyClimate[],
): string | null {
  const candidates = preferLegume
    ? ['cover-legume', 'cover-summer-mix', 'cover-rye']
    : ['cover-rye', 'cover-legume', 'cover-summer-mix'];
  const feasible = candidates.filter((id) => evals[id]?.feasible);
  if (feasible.length === 0) return null;
  // Avoid high water consumption cover if climate is very dry (< 280 mm rain)
  const annualP = effectiveClimate.reduce((a, b) => a + b.precip, 0);
  if (annualP < 280) {
    return evals['cover-rye']?.feasible ? 'cover-rye' : feasible[0];
  }
  return feasible[0];
}

function countDistinctFamilies(ids: string[], catalog: Crop[]): number {
  const s = new Set<CropFamily>();
  for (const id of ids) {
    const f = getCrop(id, catalog).family;
    if (f !== 'None') s.add(f);
  }
  return s.size;
}

function consecutiveSameFamily(ids: string[], catalog: Crop[]): number {
  let maxC = 1;
  let cur = 1;
  for (let i = 1; i < ids.length; i++) {
    const prev = getCrop(ids[i - 1], catalog).family;
    const now = getCrop(ids[i], catalog).family;
    if (prev !== 'None' && prev === now) {
      cur++;
      if (cur > maxC) maxC = cur;
    } else {
      cur = 1;
    }
  }
  return maxC;
}

interface SimulatedStrategyCore {
  timeline: TimelineSlot[];
  horizonMonths: number;
  monthlyCover: number[];
  metrics: StrategyMetrics;
  sequenceLabel: string;
}

function simulateStrategy(
  mainSeq: string[],
  offSeasonPolicy: 'bare' | 'cover' | 'double-crop',
  preferredCoverId: string | null,
  site: SiteProfile,
  farmer: FarmerInputs,
  effectiveClimate: MonthlyClimate[],
  effectiveIrrigationMm: number,
  evals: Record<string, CropEvaluation>,
  catalog: Crop[],
): SimulatedStrategyCore {
  const horizonMonths = 36;
  const monthlyCover = new Array<number>(horizonMonths).fill(0.12); // bare soil residue baseline
  const timeline: TimelineSlot[] = [];

  const eff = irrigationEfficiency(farmer.constraints.irrigationSystem);
  const { nPriceUsdPerKg, waterCostUsdPer1000m3 } = farmer.constraints;

  let totalRevenue = 0;
  let totalCost = 0;
  let totalGrossIrrDemand = 0;
  let totalIrrApplied = 0;
  let totalEtc = 0;
  let totalDeficit = 0;
  let totalResidue = 0;
  let totalNFixed = 0;
  let totalNFert = 0;
  let totalNExported = 0;
  let totalForage = 0;
  let suitSum = 0;
  let pestBreaks = 0;
  let doubleCropCount = 0;

  let prevMainFamily: CropFamily | null = farmer.previousCropIds[0]
    ? getCrop(farmer.previousCropIds[0], catalog).family
    : null;
  let nCreditCarry = 0;
  let consecutiveSame = 0;

  // Determine main crop sequence across 3 years
  const seq3: string[] = [
    mainSeq[0],
    mainSeq[1] ?? mainSeq[0],
    mainSeq[2] ?? mainSeq[0],
  ];

  // If the first crop is a perennial occupying 12 months/yr, keep it across all 3 years
  const firstCrop = getCrop(seq3[0], catalog);
  if (firstCrop.season === 'perennial') {
    seq3[1] = seq3[0];
    seq3[2] = seq3[0];
  }

  for (let y = 0; y < 3; y++) {
    const mainId = seq3[y];
    const mainCrop = getCrop(mainId, catalog);
    const baseEval = evals[mainId] ?? evaluateCrop(
      mainCrop,
      effectiveClimate,
      site.soil,
      effectiveIrrigationMm,
      farmer.constraints.irrigationSystem,
      nPriceUsdPerKg,
      waterCostUsdPer1000m3,
    );

    const yearOffset = y * 12;
    const startAbs = yearOffset + baseEval.placement.startMonth;
    const mainMonths = Math.min(12, baseEval.placement.months);

    // Check family sequence (monoculture penalty vs pest break bonus)
    if (prevMainFamily && prevMainFamily !== 'None') {
      if (prevMainFamily === mainCrop.family && mainCrop.season !== 'perennial') {
        consecutiveSame++;
      } else {
        consecutiveSame = 0;
        if (mainCrop.pest.breaks.includes(prevMainFamily)) {
          pestBreaks++;
        }
      }
    }
    prevMainFamily = mainCrop.family;

    const monoPenalty = consecutiveSame >= 2 ? 0.84 : consecutiveSame === 1 ? 0.91 : 1.0;
    const divBonus = countDistinctFamilies(seq3, catalog) >= 3 ? 1.04 : 1.0;
    const rotMult = clamp(monoPenalty * divBonus, 0.78, 1.06);

    // Determine off-season slot if main crop leaves >= 3 free months
    let offSlotCropId: string | null = null;
    const freeMonths = 12 - mainMonths;
    if (freeMonths >= 3 && mainCrop.season !== 'perennial') {
      if (offSeasonPolicy === 'double-crop') {
        // Pick an opposite-season short annual feasible crop
        const oppositeSeason = mainCrop.season === 'warm' ? 'cool' : 'warm';
        const doubleCandidates = ['chickpea', 'barley', 'oats-forage', 'drybean', 'millet', 'triticale-forage']
          .map((id) => ({ id, ev: evals[id], c: getCrop(id, catalog) }))
          .filter((x) => x.ev && x.ev.feasible && x.c.season === oppositeSeason && x.ev.placement.months <= freeMonths);
        if (doubleCandidates.length > 0) {
          doubleCandidates.sort((a, b) => b.ev.suitability - a.ev.suitability);
          offSlotCropId = doubleCandidates[0].id;
          doubleCropCount++;
        } else if (preferredCoverId) {
          offSlotCropId = preferredCoverId;
        }
      } else if (offSeasonPolicy === 'cover' && preferredCoverId) {
        offSlotCropId = preferredCoverId;
      }
    }

    // Allocate annual irrigation between main and off-season slot (main gets priority)
    const mainGrossDemand = baseEval.grossIrrigationMm;
    const mainApplied = farmer.constraints.irrigationSystem === 'none'
      ? 0
      : Math.min(effectiveIrrigationMm, mainGrossDemand);
    const remainingIrr = Math.max(0, effectiveIrrigationMm - mainApplied);

    const nFertMain = Math.max(0, mainCrop.nitrogen.demandKgHa - nCreditCarry);
    const nSavedUsd = Math.round(Math.min(mainCrop.nitrogen.demandKgHa, nCreditCarry) * nPriceUsdPerKg);
    const mainRevenueAdj = Math.round(baseEval.grossRevenue * rotMult);
    const mainCostAdj = Math.max(0, baseEval.operatingCost - nSavedUsd);
    const mainNet = mainRevenueAdj - mainCostAdj;

    timeline.push({
      role: 'main',
      start: startAbs,
      months: mainMonths,
      evaluation: baseEval,
      irrigationShare: mainGrossDemand > 0 ? +(mainApplied / mainGrossDemand).toFixed(2) : 1,
      nFertilizerKgHa: Math.round(nFertMain),
      nCreditReceivedKgHa: Math.round(nCreditCarry),
      netIncome: mainNet,
    });

    // Paint monthly ground cover for main crop (keep wrapped within 36 months)
    for (let k = 0; k < mainMonths; k++) {
      const idx = (startAbs + k) % horizonMonths;
      const frac = (k + 0.5) / mainMonths;
      const stageScale = frac < 0.2 ? 0.55 : frac < 0.8 ? 1.0 : 0.75;
      monthlyCover[idx] = Math.max(monthlyCover[idx], +(mainCrop.soil.coverIndex * stageScale).toFixed(2));
    }
    // Harvest residue cover carryover for the next 1-2 months
    if (mainCrop.soil.residueTHa >= 4 && !mainCrop.soil.intensiveTillage) {
      for (let r = 0; r < 2; r++) {
        const idx = (startAbs + mainMonths + r) % horizonMonths;
        monthlyCover[idx] = Math.max(monthlyCover[idx], 0.38);
      }
    }

    totalRevenue += mainRevenueAdj;
    totalCost += mainCostAdj;
    totalGrossIrrDemand += mainGrossDemand;
    totalIrrApplied += mainApplied;
    totalEtc += baseEval.etcMm;
    totalDeficit += baseEval.waterDeficitMm;
    totalResidue += mainCrop.soil.residueTHa;
    totalNFixed += mainCrop.nitrogen.fixationKgHa;
    totalNFert += nFertMain;
    totalNExported += mainCrop.nitrogen.demandKgHa;
    totalForage += mainCrop.market.forageValue * baseEval.yieldEstimate;
    suitSum += baseEval.suitability;

    nCreditCarry = mainCrop.nitrogen.creditNextKgHa;

    // Off-season slot (cover, double-crop or fallow)
    if (freeMonths >= 2 && mainCrop.season !== 'perennial') {
      const offStart = (startAbs + mainMonths) % horizonMonths;
      if (offSlotCropId) {
        const offCrop = getCrop(offSlotCropId, catalog);
        const offEval = evaluateCrop(
          offCrop,
          effectiveClimate,
          site.soil,
          offCrop.role === 'service' ? 0 : remainingIrr, // covers run rainfed
          offCrop.role === 'service' ? 'none' : farmer.constraints.irrigationSystem,
          nPriceUsdPerKg,
          waterCostUsdPer1000m3,
          (baseEval.placement.startMonth + mainMonths) % 12,
          Math.min(freeMonths, offCrop.thermal.maxMonths),
        );
        const isCover = offCrop.role === 'service';
        const offNet = offEval.grossRevenue - offEval.operatingCost;
        const offMonths = Math.min(freeMonths, offEval.placement.months);

        timeline.push({
          role: isCover ? 'cover' : 'double',
          start: offStart,
          months: offMonths,
          evaluation: offEval,
          irrigationShare: offEval.grossIrrigationMm > 0 ? +(offEval.appliedIrrigationMm / offEval.grossIrrigationMm).toFixed(2) : 1,
          nFertilizerKgHa: Math.round(offCrop.nitrogen.demandKgHa),
          nCreditReceivedKgHa: 0,
          netIncome: offNet,
        });

        for (let k = 0; k < offMonths; k++) {
          const idx = (offStart + k) % horizonMonths;
          monthlyCover[idx] = Math.max(monthlyCover[idx], +(offCrop.soil.coverIndex * 0.9).toFixed(2));
        }

        totalRevenue += offEval.grossRevenue;
        totalCost += offEval.operatingCost;
        totalGrossIrrDemand += offEval.grossIrrigationMm;
        totalIrrApplied += offEval.appliedIrrigationMm;
        totalEtc += offEval.etcMm;
        totalDeficit += offEval.waterDeficitMm;
        totalResidue += offCrop.soil.residueTHa;
        totalNFixed += offCrop.nitrogen.fixationKgHa;
        totalNFert += offCrop.nitrogen.demandKgHa;
        totalNExported += offCrop.nitrogen.demandKgHa;
        totalForage += offCrop.market.forageValue * offEval.yieldEstimate;
        nCreditCarry += offCrop.nitrogen.creditNextKgHa;
      } else {
        // Explicit fallow slot for visual clarity
        const fallowCrop = getCrop('fallow', catalog);
        const fallowEval = evals['fallow'] ?? evaluateCrop(
          fallowCrop,
          effectiveClimate,
          site.soil,
          0,
          'none',
          nPriceUsdPerKg,
          waterCostUsdPer1000m3,
          (baseEval.placement.startMonth + mainMonths) % 12,
          freeMonths,
        );
        timeline.push({
          role: 'fallow',
          start: offStart,
          months: freeMonths,
          evaluation: fallowEval,
          irrigationShare: 1,
          nFertilizerKgHa: 0,
          nCreditReceivedKgHa: 0,
          netIncome: -fallowEval.operatingCost,
        });
        totalCost += fallowEval.operatingCost;
      }
    }
  }

  // Annualize metrics across 3 years
  const yr = 3;
  const avgCover = monthlyCover.reduce((a, b) => a + b, 0) / horizonMonths;
  const bareCount = monthlyCover.filter((c) => c < 0.3).length;
  let bareCritical = 0;
  for (let i = 0; i < horizonMonths; i++) {
    if (monthlyCover[i] < 0.3) {
      const m = effectiveClimate[i % 12];
      if (m.heavyRainDays >= 0.7 || m.wind >= 3.2 || m.frostDays >= 3) {
        bareCritical++;
      }
    }
  }

  // RUSLE annual soil loss estimate: C factor ranges from 0.02 (dense permanent cover) to 0.48 (bare/tilled)
  const rFactor = computeRFactor(effectiveClimate.map((m) => m.precip));
  const tillagePenalty = seq3.some((id) => getCrop(id, catalog).soil.intensiveTillage) ? 0.06 : 0;
  const cFactor = clamp(0.45 * (1 - avgCover) + 0.02 + tillagePenalty, 0.015, 0.55);
  const soilLossTHa = computeSoilLoss(rFactor, site.soil.kFactor, site.terrain.lsFactor, cFactor);

  const avgAppliedIrr = totalIrrApplied / yr;
  const avgEtc = totalEtc / yr;
  const avgRevenue = totalRevenue / yr;
  const avgCost = totalCost / yr;
  const avgNet = avgRevenue - avgCost;

  // Total water volume consumed (m3/ha/yr): 1 mm = 10 m3/ha
  const effectiveRainAnnual = effectiveClimate.reduce((a, b) => a + b.precip * 0.7, 0);
  const totalWaterM3 = Math.max(1000, (avgEtc > 0 ? avgEtc : effectiveRainAnnual + avgAppliedIrr * eff) * 10);
  const waterProductivity = +(Math.max(0, avgNet) / totalWaterM3).toFixed(2);

  // Climate risk across the 3-year main slots (1 - min/avg frost*heat*water factor)
  const mainSlots = timeline.filter((t) => t.role === 'main');
  const meanRisk =
    mainSlots.reduce((acc, sl) => {
      const f = sl.evaluation.factors;
      const r = 1 - f.frost * f.heat * f.water;
      return acc + r;
    }, 0) / Math.max(1, mainSlots.length);

  const metrics: StrategyMetrics = {
    irrigationMm: Math.round(totalGrossIrrDemand / yr),
    irrigationAppliedMm: Math.round(avgAppliedIrr),
    etcMm: Math.round(avgEtc),
    waterDeficitMm: Math.round(totalDeficit / yr),
    waterProductivity,
    bareMonths: +(bareCount / yr).toFixed(1),
    bareCriticalMonths: +(bareCritical / yr).toFixed(1),
    groundCoverPct: Math.round(avgCover * 100),
    soilLossTHa,
    residueTHa: +(totalResidue / yr).toFixed(1),
    nFixedKgHa: Math.round(totalNFixed / yr),
    nFertilizerKgHa: Math.round(totalNFert / yr),
    nBalanceKgHa: Math.round((totalNFixed - totalNExported * 0.55) / yr),
    revenuePerHa: Math.round(avgRevenue),
    costPerHa: Math.round(avgCost),
    netIncomePerHa: Math.round(avgNet),
    forageTHa: +(totalForage / yr).toFixed(1),
    diversity: countDistinctFamilies(seq3, catalog),
    pestBreaks: pestBreaks + doubleCropCount,
    maxConsecutiveSameFamily: consecutiveSameFamily(seq3, catalog),
    climateRisk: +clamp(meanRisk, 0, 1).toFixed(2),
    meanSuitability: Math.round(suitSum / yr),
  };

  const seqNames = seq3.every((x) => x === seq3[0])
    ? getCrop(seq3[0], catalog).name
    : seq3.map((id) => getCrop(id, catalog).name).join(' → ');
  const offLabel =
    offSeasonPolicy === 'cover' && preferredCoverId
      ? ` + ${getCrop(preferredCoverId, catalog).name}`
      : offSeasonPolicy === 'double-crop'
      ? ' + doble cultivo'
      : '';

  return {
    timeline,
    horizonMonths,
    monthlyCover,
    metrics,
    sequenceLabel: `${seqNames}${offLabel}`,
  };
}

function computeScores(
  m: StrategyMetrics,
  seqIds: string[],
  priorities: Priorities,
  effectiveIrrigationMm: number,
  site: SiteProfile,
  isSimulated: boolean,
  catalog: Crop[],
): StrategyScores {
  // Water score: rewards low irrigation demand relative to budget & zero deficit & high USD/m3
  const waterBudget = Math.max(300, effectiveIrrigationMm || 400);
  const demandRatio = clamp(m.irrigationMm / waterBudget, 0, 2);
  const deficitPen = clamp(m.waterDeficitMm / 250, 0, 1) * 45;
  const water = Math.round(clamp(100 - demandRatio * 34 - deficitPen + Math.min(18, m.waterProductivity * 25), 5, 100));

  // Soil score: rewards ground cover %, residue, N fixed, low soil loss
  const coverScore = m.groundCoverPct * 0.45;
  const residueScore = clamp(m.residueTHa / 8, 0, 1) * 20;
  const nFixScore = clamp(m.nFixedKgHa / 120, 0, 1) * 20;
  const erosionPen = clamp(m.soilLossTHa / 15, 0, 1) * 35;
  const soil = Math.round(clamp(20 + coverScore + residueScore + nFixScore - erosionPen, 10, 100));

  // Income score: maps netIncomePerHa (-500..4500+) smoothly to 10..100
  const income = Math.round(clamp(30 + (m.netIncomePerHa / 2200) * 55, 5, 100));

  // Forage score: maps forageTHa (0..14) to 10..100
  const forage = Math.round(clamp(10 + (m.forageTHa / 12) * 90, 10, 100));

  // Resilience score: diversity, pest breaks, low climateRisk, high suitability
  const divScore = clamp((m.diversity - 1) / 2, 0, 1) * 30;
  const pestScore = clamp(m.pestBreaks / 2, 0, 1) * 18;
  const suitScore = m.meanSuitability * 0.35;
  const riskPen = m.climateRisk * 32 + (m.maxConsecutiveSameFamily >= 3 ? 14 : m.maxConsecutiveSameFamily === 2 ? 7 : 0);
  const resilience = Math.round(clamp(25 + divScore + pestScore + suitScore - riskPen, 10, 100));

  const rawSum = priorities.water + priorities.soil + priorities.income + priorities.forage + priorities.resilience;
  const total =
    rawSum === 0
      ? Math.round((water + soil + income + forage + resilience) / 5)
      : Math.round(
          (water * priorities.water +
            soil * priorities.soil +
            income * priorities.income +
            forage * priorities.forage +
            resilience * priorities.resilience) /
            rawSum,
        );

  // Reliability reflects data confidence, market volatility and whether this is a scenario simulation
  const avgMarketRisk =
    seqIds.reduce((a, id) => a + getCrop(id, catalog).market.marketRisk, 0) / Math.max(1, seqIds.length);
  const simDiscount = isSimulated ? 0.88 : 1.0;
  const reliability = Math.round(
    clamp((site.quality.overall * 0.65 + (1 - avgMarketRisk) * 0.35) * simDiscount * 100, 30, 96),
  );

  return { water, soil, income, forage, resilience, total, reliability };
}

function buildExplanation(
  archetype: StrategyArchetype,
  seqIds: string[],
  offPolicy: 'bare' | 'cover' | 'double-crop',
  preferredCoverId: string | null,
  metrics: StrategyMetrics,
  currentMetrics: StrategyMetrics,
  site: SiteProfile,
  farmer: FarmerInputs,
  isSimulated: boolean,
  scenario: Scenario,
  catalog: Crop[],
): Strategy['explanation'] {
  const why: string[] = [];
  const evidence: EvidenceItem[] = [];
  const benefits: Strategy['explanation']['benefits'] = [];
  const gaps: string[] = [];
  const risks: string[] = [];

  const mainCrops = seqIds.map((id) => getCrop(id, catalog));
  const climProv: Provenance = isSimulated ? 'simulated' : site.climate.provenance;
  const climSources: SourceId[] = isSimulated ? [...site.climate.sources, 'user-input'] : site.climate.sources;

  // 1. Why suggested
  if (archetype === 'current') {
    why.push(
      `Sirve como línea base real para comparar: mantiene ${mainCrops[0].name} con manejo de entre-ciclos "${
        offPolicy === 'bare' ? 'barbecho descubierto' : offPolicy === 'cover' ? 'cobertura' : 'doble cultivo'
      }".`,
    );
    if (metrics.maxConsecutiveSameFamily >= 2) {
      why.push(`Mantiene el mismo grupo botánico (${mainCrops[0].family}), lo que permite medir el costo oculto de continuar el monocultivo.`);
    }
  } else {
    if (archetype === 'water-soil') {
      why.push(
        `Seleccionada para reducir presión hídrica y proteger la superficie del suelo combinando ${mainCrops.map((c) => c.name).join(' y ')}${
          preferredCoverId && offPolicy === 'cover' ? ` con ${getCrop(preferredCoverId, catalog).name}` : ''
        }.`,
      );
    } else if (archetype === 'diversified') {
      why.push(
        `Rompe ciclos de plagas y aporta nitrógeno biológico alternando ${metrics.diversity} familias botánicas (${mainCrops.map((c) => c.family).join(' / ')}).`,
      );
    } else if (archetype === 'income') {
      why.push(
        `Prioriza margen neto por hectárea y eficiencia económica del agua (${metrics.waterProductivity.toFixed(2)} USD/m³) sin repetir monocultivo.`,
      );
    } else if (archetype === 'forage') {
      why.push(
        `Optimizada para producción de biomasa forrajera (${metrics.forageTHa.toFixed(1)} t MS/ha/año) y estabilidad de cobertura.`,
      );
    } else {
      why.push(
        `Combinación a medida que obtiene la mayor puntuación ponderada según tus prioridades actuales (Agua ${farmer.priorities.water}/5, Suelo ${farmer.priorities.soil}/5, Ingreso ${farmer.priorities.income}/5).`,
      );
    }

    if (metrics.bareMonths < currentMetrics.bareMonths) {
      why.push(`Reduce los meses de suelo desnudo de ${currentMetrics.bareMonths} a ${metrics.bareMonths} meses/año.`);
    }
    if (metrics.nFixedKgHa > 20) {
      why.push(`Fija ~${metrics.nFixedKgHa} kg N/ha/año mediante leguminosas, recortando dependencia de fertilizante sintético.`);
    }
  }

  // 2. Evidence from datasets
  evidence.push({
    label: isSimulated ? 'Balance climático (escenario simulado)' : 'Climatología y demanda atmosférica (P / ET₀)',
    value: `Lluvia ${Math.round(site.climate.annualPrecip * (1 + scenario.precipChangePct / 100))} mm/año vs ET₀ ${Math.round(site.climate.annualET0 * (1 + 0.035 * scenario.deltaTempC))} mm/año (índice aridez ${site.climate.aridityIndex.toFixed(2)})`,
    provenance: climProv,
    sources: climSources,
    polarity: metrics.waterDeficitMm > 80 ? 'against' : 'context',
  });

  evidence.push({
    label: 'Retención y erodabilidad del suelo',
    value: `Textura ${site.soil.texture}, MO ${site.soil.organicMatter.toFixed(1)} %, AWC ${site.soil.awcMmPerM} mm/m, K=${site.soil.kFactor.toFixed(3)}`,
    provenance: site.soil.provenance,
    sources: site.soil.sources,
    polarity: site.soil.awcMmPerM >= 130 ? 'support' : 'context',
  });

  if (site.vegetation.bareSoilMonths.length > 0) {
    evidence.push({
      label: 'Cobertura satelital MODIS NDVI',
      value: `${site.vegetation.bareSoilMonths.length} meses/año con NDVI < 0.25 (${site.vegetation.bareSoilMonths.map((m) => MONTH_NAMES_ES[m]).join(', ')})`,
      provenance: site.vegetation.provenance,
      sources: site.vegetation.sources,
      polarity: metrics.bareMonths < currentMetrics.bareMonths ? 'support' : 'against',
    });
  }

  if (site.water.groundwater.sites.length > 0 || site.water.regionalStorageTrend.value !== 'unknown') {
    evidence.push({
      label: 'Disponibilidad hídrica / acuífero',
      value: site.water.groundwater.summary,
      provenance: site.water.groundwater.sites.length > 0 ? site.water.groundwater.provenance : site.water.regionalStorageTrend.provenance,
      sources: site.water.groundwater.sites.length > 0 ? site.water.groundwater.sources : site.water.regionalStorageTrend.sources,
      polarity: metrics.irrigationAppliedMm < currentMetrics.irrigationAppliedMm ? 'support' : 'context',
    });
  }

  evidence.push({
    label: 'Idoneidad agroclimática promedio de la secuencia',
    value: `${metrics.meanSuitability}/100 (riesgo climático ${(metrics.climateRisk * 100).toFixed(0)} %)`,
    provenance: isSimulated ? 'simulated' : 'derived',
    sources: ['fieldshift-catalog', ...climSources],
    polarity: metrics.meanSuitability >= 65 ? 'support' : 'against',
  });

  // 3. Potential benefits (with deltas vs current)
  const dWater = currentMetrics.irrigationMm - metrics.irrigationMm;
  benefits.push({
    label: 'Demanda bruta de riego',
    value: `${metrics.irrigationMm} mm/año`,
    delta: archetype === 'current' ? undefined : -dWater,
    good: dWater >= 0,
  });

  const dIncome = metrics.netIncomePerHa - currentMetrics.netIncomePerHa;
  benefits.push({
    label: 'Margen neto estimado',
    value: `$${metrics.netIncomePerHa.toLocaleString('en-US')} USD/ha`,
    delta: archetype === 'current' ? undefined : dIncome,
    good: dIncome >= 0,
  });

  const dBare = +(metrics.bareMonths - currentMetrics.bareMonths).toFixed(1);
  benefits.push({
    label: 'Cobertura viva / suelo protegido',
    value: `${metrics.groundCoverPct} % (${metrics.bareMonths} m desnudo)`,
    delta: archetype === 'current' ? undefined : dBare,
    good: dBare <= 0,
  });

  const dN = metrics.nFixedKgHa - currentMetrics.nFixedKgHa;
  benefits.push({
    label: 'Fijación biológica de N',
    value: `${metrics.nFixedKgHa} kg N/ha/año`,
    delta: archetype === 'current' ? undefined : dN,
    good: dN >= 0,
  });

  const dEros = +(metrics.soilLossTHa - currentMetrics.soilLossTHa).toFixed(1);
  benefits.push({
    label: 'Erosión hídrica estimada',
    value: `${metrics.soilLossTHa} t/ha/año`,
    delta: archetype === 'current' ? undefined : dEros,
    good: dEros <= 0,
  });

  // 4. Information gaps / uncertainty
  if (site.climate.provenance !== 'live' && site.climate.provenance !== 'cached') {
    gaps.push('Clima en modo respaldo sintético: no refleja anomalías ni heladas recientes reales de la parcela.');
  } else {
    gaps.push(`Clima NASA POWER (${site.climate.resolution}) promedia celdas grandes: no captura heladas en hondonadas o lluvias torrenciales muy localizadas.`);
  }
  if (!site.location.inCONUS) {
    gaps.push('Fuera de EE. UU. no hay SSURGO ni USDA CropScape: la textura/pH vienen de SoilGrids (250 m) y faltan datos de salinidad (EC).');
  } else if (site.soil.ecDsM === null) {
    gaps.push('No se reporta conductividad eléctrica (salinidad) ni compactación reciente del subsuelo.');
  }
  gaps.push('Los precios y rendimientos potenciales son referencias del catálogo: deben ajustarse a contratos locales, flete y calidad de cosecha.');
  if (isSimulated) {
    gaps.push('Los valores marcados como “simulado” exploran sensibilidad climática/hídrica y no son pronósticos meteorológicos.');
  }

  // 5. Risks requiring local field review
  const uniqRisks = new Set<string>();
  for (const c of mainCrops) {
    for (const r of c.pest.keyRisks.slice(0, 2)) uniqRisks.add(`${c.name}: ${r}.`);
  }
  if (preferredCoverId && offPolicy === 'cover') {
    const cov = getCrop(preferredCoverId, catalog);
    uniqRisks.add(`${cov.name}: vigilar fecha de terminación (2–3 semanas antes de sembrar) para no consumir humedad inicial en años secos.`);
  }
  if (metrics.waterDeficitMm > 60) {
    uniqRisks.add(`Déficit hídrico estimado de ${metrics.waterDeficitMm} mm/año: confirme dotación real del distrito/pozo o ajuste superficie sembrada.`);
  }
  if (mainCrops.some((c) => c.cycle.yearsToBearing > 0)) {
    uniqRisks.add('Cultivos leñosos requieren flujo de caja durante años improductivos iniciales y análisis detallado de horas frío y salinidad.');
  }
  for (const r of uniqRisks) risks.push(r);

  return { why, evidence, benefits, gaps, risks: risks.slice(0, 5) };
}

export function analyzeSite(
  site: SiteProfile,
  farmer: FarmerInputs,
  scenario: Scenario = { deltaTempC: 0, precipChangePct: 0, waterAvailabilityChangePct: 0 },
  catalog: Crop[] = CROPS,
): AnalysisResult {
  const isSimulated =
    scenario.deltaTempC !== 0 ||
    scenario.precipChangePct !== 0 ||
    scenario.waterAvailabilityChangePct !== 0;

  const { monthly: effectiveClimate, irrigationMm: effectiveIrrigationMm } = applyScenario(
    site.climate.monthly,
    scenario,
    farmer.constraints.irrigationMm,
  );

  // Evaluate all crops in catalog once under effective climate & irrigation
  const evals: Record<string, CropEvaluation> = {};
  const cropTable: CropSuitabilityRow[] = [];
  const { nPriceUsdPerKg, waterCostUsdPer1000m3, irrigationSystem } = farmer.constraints;

  for (const crop of catalog) {
    const ev = evaluateCrop(
      crop,
      effectiveClimate,
      site.soil,
      effectiveIrrigationMm,
      irrigationSystem,
      nPriceUsdPerKg,
      waterCostUsdPer1000m3,
    );
    evals[crop.id] = ev;
    const excludedReason = getExclusionReason(crop, farmer);
    cropTable.push({
      cropId: crop.id,
      suitability: ev.suitability,
      netIncomePerHa: ev.grossRevenue - ev.operatingCost,
      irrigationMm: ev.grossIrrigationMm,
      feasible: ev.feasible && !excludedReason,
      excludedReason,
      limiting: ev.limitingFactors,
      placement: ev.placement,
    });
  }

  cropTable.sort((a, b) => b.suitability - a.suitability);

  const currentEval = evals[farmer.currentCropId] ?? evals['corn'];
  const windows = detectCriticalWindows(site, currentEval, farmer, effectiveClimate, isSimulated);

  // Eligible main crops for rotation construction
  const eligible = MAIN_CROPS.filter((c) => {
    const row = cropTable.find((r) => r.cropId === c.id);
    return row && row.feasible;
  });
  const pool = eligible.length >= 2 ? eligible : MAIN_CROPS.filter((c) => (evals[c.id]?.suitability ?? 0) >= 22);
  const annualPool = pool.filter((c) => c.season !== 'perennial');
  const usablePool = annualPool.length >= 2 ? annualPool : pool;

  const rankBy = (scoreFn: (c: Crop) => number) =>
    [...usablePool].sort((a, b) => scoreFn(b) - scoreFn(a));

  // Helper to assemble a diverse 3-crop sequence prioritizing different botanical families
  const buildDiverse3 = (ordered: Crop[], forceLegume = false): [string, string, string] => {
    const picked: Crop[] = [];
    if (forceLegume) {
      const leg = ordered.find((c) => c.nitrogen.fixer) ?? usablePool.find((c) => c.nitrogen.fixer);
      if (leg) picked.push(leg);
    }
    for (const c of ordered) {
      if (picked.length >= 3) break;
      if (!picked.some((p) => p.family === c.family)) picked.push(c);
    }
    for (const c of ordered) {
      if (picked.length >= 3) break;
      if (!picked.some((p) => p.id === c.id)) picked.push(c);
    }
    while (picked.length < 3) picked.push(picked[0] ?? getCrop(farmer.currentCropId, catalog));
    return [picked[0].id, picked[1].id, picked[2].id];
  };

  // Strategy specifications (always include current + >= 2 distinct alternatives)
  interface Spec {
    id: string;
    archetype: StrategyArchetype;
    title: string;
    subtitle: string;
    seq: string[];
    offPolicy: 'bare' | 'cover' | 'double-crop';
    preferLegumeCover: boolean;
    isCurrent: boolean;
  }

  const currentCrop = getCrop(farmer.currentCropId, catalog);
  const prevCrop = farmer.previousCropIds[0] && CROPS.some((c) => c.id === farmer.previousCropIds[0])
    ? getCrop(farmer.previousCropIds[0], catalog)
    : currentCrop;

  const currentSeq =
    prevCrop.id !== currentCrop.id && prevCrop.family !== currentCrop.family && currentCrop.season !== 'perennial'
      ? [currentCrop.id, prevCrop.id, currentCrop.id]
      : [currentCrop.id, currentCrop.id, currentCrop.id];

  const waterSoilOrder = rankBy((c) => {
    const ev = evals[c.id];
    const deficitPen = ev.waterDeficitMm * 0.12;
    const irrPen = ev.grossIrrigationMm * 0.06;
    return ev.suitability * 1.1 + c.soil.omBuilding * 30 + c.soil.coverIndex * 20 - deficitPen - irrPen;
  });

  const diversifiedOrder = rankBy((c) => {
    const ev = evals[c.id];
    const fixBonus = c.nitrogen.fixer ? 38 : 0;
    const breakBonus = c.pest.breaks.includes(currentCrop.family) ? 18 : 0;
    return ev.suitability + fixBonus + breakBonus + c.soil.omBuilding * 15 - ev.waterDeficitMm * 0.08;
  });

  const incomeOrder = rankBy((c) => {
    const ev = evals[c.id];
    const net = ev.grossRevenue - ev.operatingCost;
    const wp = net / Math.max(200, ev.etcMm);
    return net * 0.04 + wp * 6 + ev.suitability * 0.4;
  });

  const forageOrder = rankBy((c) => {
    const ev = evals[c.id];
    return c.market.forageValue * 85 + ev.suitability * 0.45 - ev.waterDeficitMm * 0.06;
  });

  const specs: Spec[] = [
    {
      id: 'strat-current',
      archetype: 'current',
      title: 'Estrategia 1 · Mantener manejo actual',
      subtitle: 'Línea base de comparación con tu cultivo y manejo actual entre ciclos',
      seq: currentSeq,
      offPolicy: farmer.offSeason,
      preferLegumeCover: false,
      isCurrent: true,
    },
    {
      id: 'strat-water-soil',
      archetype: 'water-soil',
      title: 'Estrategia 2 · Resiliencia hídrica y protección de suelo',
      subtitle: 'Menor demanda de riego, cobertura en temporada crítica y mejora de infiltración',
      seq: buildDiverse3(waterSoilOrder, false),
      offPolicy: site.climate.annualPrecip >= 260 ? 'cover' : 'bare',
      preferLegumeCover: false,
      isCurrent: false,
    },
    {
      id: 'strat-diversified',
      archetype: 'diversified',
      title: 'Estrategia 3 · Rotación diversificada y fijación de nitrógeno',
      subtitle: 'Alterna familias botánicas para cortar plagas y sustituir fertilizante sintético',
      seq: buildDiverse3(diversifiedOrder, true),
      offPolicy: site.climate.annualPrecip >= 320 ? 'cover' : 'bare',
      preferLegumeCover: true,
      isCurrent: false,
    },
    {
      id: 'strat-income',
      archetype: 'income',
      title: 'Estrategia 4 · Rentabilidad ajustada al agua y riesgo',
      subtitle: 'Maximiza ingreso neto por hectárea y por m³ sin repetir monocultivo',
      seq: buildDiverse3(incomeOrder, false),
      offPolicy: site.climate.annualPrecip >= 420 ? 'double-crop' : 'cover',
      preferLegumeCover: true,
      isCurrent: false,
    },
  ];

  // Add Strategy 5: Forage integration if farmer cares about forage, or priority-optimal blend
  if (farmer.priorities.forage >= 3 && forageOrder.length >= 2) {
    specs.push({
      id: 'strat-forage',
      archetype: 'forage',
      title: 'Estrategia 5 · Integración forrajera y conservación de biomasa',
      subtitle: 'Prioriza materia seca digestible y cobertura continua para sistemas mixtos',
      seq: buildDiverse3(forageOrder, true),
      offPolicy: 'cover',
      preferLegumeCover: false,
      isCurrent: false,
    });
  } else {
    // Also test keeping current crop but upgrading with cover crop + legume partner
    const partner = diversifiedOrder.find((c) => c.family !== currentCrop.family) ?? waterSoilOrder[0];
    if (partner && currentCrop.season !== 'perennial') {
      specs.push({
        id: 'strat-priority-optimal',
        archetype: 'priority-optimal',
        title: 'Estrategia 5 · Transición gradual con tu cultivo base + socio + cobertura',
        subtitle: `Conserva ${currentCrop.name} un año de cada dos alternado con ${partner.name} y cobertura viva`,
        seq: [currentCrop.id, partner.id, currentCrop.id],
        offPolicy: 'cover',
        preferLegumeCover: !partner.nitrogen.fixer,
        isCurrent: false,
      });
    }
  }

  // First simulate Strategy 1 (current) so all alternatives compute exact deltas against it
  const currentCover = farmer.offSeason === 'cover'
    ? pickBestCover(evals, true, effectiveClimate)
    : null;

  const currentCore = simulateStrategy(
    specs[0].seq,
    specs[0].offPolicy,
    currentCover,
    site,
    farmer,
    effectiveClimate,
    effectiveIrrigationMm,
    evals,
    catalog,
  );

  // Simulate all strategies and deduplicate identical non-current alternatives
  const seenKeys = new Set<string>([`${specs[0].seq.join('|')}::${specs[0].offPolicy}`]);
  const built: Strategy[] = [];

  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const key = `${sp.seq.join('|')}::${sp.offPolicy}`;
    if (!sp.isCurrent && seenKeys.has(key)) {
      // Mutate sequence slightly by rotating next eligible crop so user gets genuine distinct options
      const alt = usablePool.find((c) => !sp.seq.includes(c.id));
      if (alt) {
        sp.seq = [sp.seq[0], alt.id, sp.seq[1]];
      } else {
        continue;
      }
    }
    seenKeys.add(`${sp.seq.join('|')}::${sp.offPolicy}`);

    const coverId = sp.isCurrent
      ? currentCover
      : sp.offPolicy === 'cover' || sp.offPolicy === 'double-crop'
      ? pickBestCover(evals, sp.preferLegumeCover, effectiveClimate)
      : null;

    const core = sp.isCurrent
      ? currentCore
      : simulateStrategy(
          sp.seq,
          sp.offPolicy,
          coverId,
          site,
          farmer,
          effectiveClimate,
          effectiveIrrigationMm,
          evals,
          catalog,
        );

    const scores = computeScores(
      core.metrics,
      sp.seq,
      farmer.priorities,
      effectiveIrrigationMm,
      site,
      isSimulated,
      catalog,
    );

    const explanation = buildExplanation(
      sp.archetype,
      sp.seq,
      sp.offPolicy,
      coverId,
      core.metrics,
      currentCore.metrics,
      site,
      farmer,
      isSimulated,
      scenario,
      catalog,
    );

    built.push({
      id: sp.id,
      archetype: sp.archetype,
      title: sp.title,
      subtitle: sp.subtitle,
      timeline: core.timeline,
      horizonMonths: core.horizonMonths,
      monthlyCover: core.monthlyCover,
      offSeasonPolicy: sp.offPolicy,
      mainSequence: sp.seq,
      sequenceLabel: core.sequenceLabel,
      metrics: core.metrics,
      scores,
      explanation,
      rank: 0,
      isCurrent: sp.isCurrent,
    });
  }

  // Guarantee at least 3 strategies even in extreme restrictive constraints
  if (built.length < 3) {
    const fallbacks = ['sorghum', 'wheat', 'cover-legume', 'perennial-grass'];
    for (const fb of fallbacks) {
      if (built.length >= 3) break;
      const key = `${fb}|${fb}|${fb}::cover`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const seq = [fb, fb, fb];
      const coverId = pickBestCover(evals, true, effectiveClimate);
      const core = simulateStrategy(
        seq, 'cover', coverId, site, farmer, effectiveClimate, effectiveIrrigationMm, evals, catalog,
      );
      const scores = computeScores(core.metrics, seq, farmer.priorities, effectiveIrrigationMm, site, isSimulated, catalog);
      const explanation = buildExplanation(
        'water-soil', seq, 'cover', coverId, core.metrics, currentCore.metrics, site, farmer, isSimulated, scenario, catalog,
      );
      built.push({
        id: `strat-fb-${fb}`,
        archetype: 'water-soil',
        title: `Alternativa rústica · ${getCrop(fb, catalog).name}`,
        subtitle: 'Opción de contingencia ante restricciones extremas de clima, agua o maquinaria',
        timeline: core.timeline,
        horizonMonths: core.horizonMonths,
        monthlyCover: core.monthlyCover,
        offSeasonPolicy: 'cover',
        mainSequence: seq,
        sequenceLabel: core.sequenceLabel,
        metrics: core.metrics,
        scores,
        explanation,
        rank: 0,
        isCurrent: false,
      });
    }
  }

  // Rank descending by priority-weighted total score
  const sorted = [...built].sort((a, b) => b.scores.total - a.scores.total);
  sorted.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  const notes: string[] = [];
  if (isSimulated) {
    notes.push(
      `Simulación activa (${scenario.deltaTempC >= 0 ? '+' : ''}${scenario.deltaTempC.toFixed(1)} °C, lluvia ${
        scenario.precipChangePct >= 0 ? '+' : ''
      }${scenario.precipChangePct} %, agua riego ${scenario.waterAvailabilityChangePct >= 0 ? '+' : ''}${
        scenario.waterAvailabilityChangePct
      } %): los resultados reflejan pruebas hipotéticas, no pronósticos climáticos.`,
    );
  }
  if (eligible.length < 3) {
    notes.push('Tus restricciones actuales dejan pocos cultivos viables; ampliar categorías de mercado o equipo abre más alternativas.');
  }

  return {
    scenario,
    strategies: sorted,
    windows,
    cropTable,
    effectiveClimate,
    effectiveIrrigationMm,
    notes,
    generatedAt: new Date().toISOString(),
  };
}
