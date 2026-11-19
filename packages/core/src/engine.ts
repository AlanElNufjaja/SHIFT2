import {
  applyScenario,
  clamp,
  computeRFactor,
  computeSoilLoss,
  evaluateCrop,
  irrigationEfficiency,
} from './agronomy';
import { CROPS, MAIN_CROPS, getCrop } from './catalog';
import {
  MONTH_NAMES,
  getCategoryLabel,
  getCropName,
  getCropRisks,
  getFamilyLabel,
  getTextureLabel,
} from './i18n';
import { PILOT_PARCELS } from './sources';
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
  Locale,
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

function getExclusionReason(crop: Crop, farmer: FarmerInputs, locale: Locale): string | undefined {
  if (crop.role === 'service') return undefined;
  const { constraints } = farmer;
  if (constraints.excludedCrops.includes(crop.id)) {
    return locale === 'en' ? 'Turned off manually' : 'Excluido manualmente';
  }
  if (!constraints.allowPerennials && crop.season === 'perennial') {
    return locale === 'en' ? 'Multi-year crops turned off' : 'Perennes desactivados en restricciones';
  }
  if (constraints.marketCategories.length > 0 && !constraints.marketCategories.includes(crop.category)) {
    return locale === 'en'
      ? `Outside selected buyers (${getCategoryLabel(crop.category, 'en')})`
      : `Categoría (${getCategoryLabel(crop.category, 'es')}) fuera de acceso de mercado`;
  }
  if (constraints.equipment.length > 0 && crop.equipment.length > 0) {
    const hasOne = crop.equipment.some((eq) => constraints.equipment.includes(eq));
    if (!hasOne) {
      return locale === 'en' ? 'Needs machinery not checked' : 'Requiere maquinaria no disponible';
    }
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
  locale: Locale,
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
      undefined,
      undefined,
      locale,
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
          locale,
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
          locale,
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
    ? getCropName(getCrop(seq3[0], catalog), locale)
    : seq3.map((id) => getCropName(getCrop(id, catalog), locale)).join(' → ');
  const offLabel =
    offSeasonPolicy === 'cover' && preferredCoverId
      ? ` + ${getCropName(getCrop(preferredCoverId, catalog), locale)}`
      : offSeasonPolicy === 'double-crop'
      ? locale === 'en'
        ? ' + double crop'
        : ' + doble cultivo'
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
  locale: Locale,
): Strategy['explanation'] {
  const why: string[] = [];
  const evidence: EvidenceItem[] = [];
  const benefits: Strategy['explanation']['benefits'] = [];
  const gaps: string[] = [];
  const risks: string[] = [];

  const mainCrops = seqIds.map((id) => getCrop(id, catalog));
  const mainCropNames = mainCrops.map((c) => getCropName(c, locale));
  const climProv: Provenance = isSimulated ? 'simulated' : site.climate.provenance;
  const climSources: SourceId[] = isSimulated ? [...site.climate.sources, 'user-input'] : site.climate.sources;
  const mNames = MONTH_NAMES[locale];

  // 1. Why suggested
  if (archetype === 'current') {
    const offDesc =
      locale === 'en'
        ? offPolicy === 'bare'
          ? 'left bare between seasons'
          : offPolicy === 'cover'
          ? 'with a cover crop'
          : 'with a second short crop'
        : offPolicy === 'bare'
        ? 'tierra pelona en descanso'
        : offPolicy === 'cover'
        ? 'planta de cobertura'
        : 'doble cultivo';
    why.push(
      locale === 'en'
        ? `Baseline to compare against: keeps growing ${mainCropNames[0]} (${offDesc}).`
        : `Sirve como punto de comparación: mantiene ${mainCropNames[0]} con manejo "${offDesc}".`,
    );
    if (metrics.maxConsecutiveSameFamily >= 2) {
      why.push(
        locale === 'en'
          ? `Repeats the same plant group (${getFamilyLabel(mainCrops[0].family, 'en')}), showing whether pests or tired soil are hurting yields.`
          : `Repite el mismo grupo de planta (${getFamilyLabel(mainCrops[0].family, 'es')}), ayudando a medir el costo de repetir el mismo cultivo.`,
      );
    }
  } else {
    if (archetype === 'water-soil') {
      const covTxt =
        preferredCoverId && offPolicy === 'cover'
          ? ` ${locale === 'en' ? 'with' : 'con'} ${getCropName(getCrop(preferredCoverId, catalog), locale)}`
          : '';
      why.push(
        locale === 'en'
          ? `Picked to save irrigation water and keep topsoil protected using ${mainCropNames.join(' & ')}${covTxt}.`
          : `Elegida para gastar menos agua y proteger la tierra combinando ${mainCropNames.join(' y ')}${covTxt}.`,
      );
    } else if (archetype === 'diversified') {
      why.push(
        locale === 'en'
          ? `Breaks pest and root-disease cycles by switching across ${metrics.diversity} crop families (${mainCrops.map((c) => getFamilyLabel(c.family, 'en')).join(' / ')}).`
          : `Corta plagas de raíz al alternar ${metrics.diversity} familias de plantas (${mainCrops.map((c) => getFamilyLabel(c.family, 'es')).join(' / ')}).`,
      );
    } else if (archetype === 'income') {
      why.push(
        locale === 'en'
          ? `Focuses on take-home profit per hectare and per gallon of water (${metrics.waterProductivity.toFixed(2)} USD/m³) while rotating crops.`
          : `Busca mejor ganancia por hectárea y mejor provecho del agua (${metrics.waterProductivity.toFixed(2)} USD/m³) sin repetir cultivo.`,
      );
    } else if (archetype === 'forage') {
      why.push(
        locale === 'en'
          ? `Built to produce steady livestock feed (${metrics.forageTHa.toFixed(1)} t hay/forage per ha/yr) while keeping ground covered.`
          : `Pensada para sacar buena pastura para ganado (${metrics.forageTHa.toFixed(1)} t/ha/año) y mantener la tierra tapada.`,
      );
    } else {
      why.push(
        locale === 'en'
          ? `Custom blend scoring highest for your goals (Water ${farmer.priorities.water}/5, Soil ${farmer.priorities.soil}/5, Profit ${farmer.priorities.income}/5).`
          : `Mezcla a la medida con mayor puntaje según tus metas (Agua ${farmer.priorities.water}/5, Tierra ${farmer.priorities.soil}/5, Ganancia ${farmer.priorities.income}/5).`,
      );
    }

    if (metrics.bareMonths < currentMetrics.bareMonths) {
      why.push(
        locale === 'en'
          ? `Cuts bare-ground months from ${currentMetrics.bareMonths} down to ${metrics.bareMonths} months per year.`
          : `Baja los meses con tierra pelona de ${currentMetrics.bareMonths} a ${metrics.bareMonths} meses al año.`,
      );
    }
    if (metrics.nFixedKgHa > 20) {
      why.push(
        locale === 'en'
          ? `Legumes add about ${metrics.nFixedKgHa} kg/ha of natural nitrogen per year, cutting fertilizer bills.`
          : `Aporta unos ${metrics.nFixedKgHa} kg/ha de abono natural al año con leguminosas, bajando el gasto en fertilizante.`,
      );
    }
  }

  // 2. Evidence from datasets
  const adjPrecip = Math.round(site.climate.annualPrecip * (1 + scenario.precipChangePct / 100));
  const adjEt0 = Math.round(site.climate.annualET0 * (1 + 0.035 * scenario.deltaTempC));
  evidence.push({
    label:
      locale === 'en'
        ? isSimulated
          ? 'Test weather balance (what-if mode)'
          : 'Yearly rainfall vs. sun & air drying'
        : isSimulated
        ? 'Balance del clima (prueba activada)'
        : 'Lluvia al año vs. agua que seca el sol y aire',
    value:
      locale === 'en'
        ? `Rain ${adjPrecip} mm/yr vs. air drying pull ${adjEt0} mm/yr (dryness index ${site.climate.aridityIndex.toFixed(2)})`
        : `Lluvia ${adjPrecip} mm/año vs. evaporación ${adjEt0} mm/año (índice sequedad ${site.climate.aridityIndex.toFixed(2)})`,
    provenance: climProv,
    sources: climSources,
    polarity: metrics.waterDeficitMm > 80 ? 'against' : 'context',
  });

  const texLabel = getTextureLabel(site.soil.texture, locale);
  evidence.push({
    label: locale === 'en' ? 'Soil water holding & type' : 'Tipo de tierra y agua que guarda',
    value:
      locale === 'en'
        ? `${texLabel}, organic matter ${site.soil.organicMatter.toFixed(1)}%, holds ${site.soil.awcMmPerM} mm/m`
        : `Tierra ${texLabel}, abono orgánico ${site.soil.organicMatter.toFixed(1)} %, guarda ${site.soil.awcMmPerM} mm/m`,
    provenance: site.soil.provenance,
    sources: site.soil.sources,
    polarity: site.soil.awcMmPerM >= 130 ? 'support' : 'context',
  });

  if (site.vegetation.bareSoilMonths.length > 0) {
    const bareNames = site.vegetation.bareSoilMonths.map((m) => mNames[m]).join(', ');
    evidence.push({
      label: locale === 'en' ? 'Satellite bare-ground check' : 'Meses pelones vistos por satélite',
      value:
        locale === 'en'
          ? `${site.vegetation.bareSoilMonths.length} months/yr show bare dirt (${bareNames})`
          : `${site.vegetation.bareSoilMonths.length} meses/año con poca cobertura (${bareNames})`,
      provenance: site.vegetation.provenance,
      sources: site.vegetation.sources,
      polarity: metrics.bareMonths < currentMetrics.bareMonths ? 'support' : 'against',
    });
  }

  if (site.water.groundwater.sites.length > 0 || site.water.regionalStorageTrend.value !== 'unknown') {
    const hasWells = site.water.groundwater.sites.length > 0;
    const gwVal =
      locale === 'en'
        ? hasWells
          ? `${site.water.groundwater.sites.length} nearby monitoring well(s) checked`
          : site.water.regionalStorageTrend.value === 'strong-decline'
          ? 'Regional water table shows strong long-term drop'
          : site.water.regionalStorageTrend.value === 'decline'
          ? 'Regional water table shows moderate decline'
          : site.water.regionalStorageTrend.value === 'stable'
          ? 'Regional water table looks relatively stable'
          : 'No regional groundwater drop recorded'
        : site.water.groundwater.summary;
    evidence.push({
      label: locale === 'en' ? 'Groundwater & well supply' : 'Agua subterránea y pozos',
      value: gwVal,
      provenance: hasWells ? site.water.groundwater.provenance : site.water.regionalStorageTrend.provenance,
      sources: hasWells ? site.water.groundwater.sources : site.water.regionalStorageTrend.sources,
      polarity: metrics.irrigationAppliedMm < currentMetrics.irrigationAppliedMm ? 'support' : 'context',
    });
  }

  evidence.push({
    label: locale === 'en' ? 'Climate & soil fit score' : 'Qué tan bien se adapta al clima y tierra',
    value:
      locale === 'en'
        ? `${metrics.meanSuitability}/100 fit (weather risk ${(metrics.climateRisk * 100).toFixed(0)}%)`
        : `${metrics.meanSuitability}/100 de adaptación (riesgo clima ${(metrics.climateRisk * 100).toFixed(0)} %)`,
    provenance: isSimulated ? 'simulated' : 'derived',
    sources: ['fieldshift-catalog', ...climSources],
    polarity: metrics.meanSuitability >= 65 ? 'support' : 'against',
  });

  // 3. Potential benefits (with deltas vs current)
  const dWater = currentMetrics.irrigationMm - metrics.irrigationMm;
  benefits.push({
    label: locale === 'en' ? 'Total irrigation needed' : 'Agua de riego que pide',
    value: locale === 'en' ? `${metrics.irrigationMm} mm/yr` : `${metrics.irrigationMm} mm/año`,
    delta: archetype === 'current' ? undefined : -dWater,
    good: dWater >= 0,
  });

  const dIncome = metrics.netIncomePerHa - currentMetrics.netIncomePerHa;
  benefits.push({
    label: locale === 'en' ? 'Est. profit per ha' : 'Ganancia aprox. por ha',
    value: `$${metrics.netIncomePerHa.toLocaleString('en-US')} USD/ha`,
    delta: archetype === 'current' ? undefined : dIncome,
    good: dIncome >= 0,
  });

  const dBare = +(metrics.bareMonths - currentMetrics.bareMonths).toFixed(1);
  benefits.push({
    label: locale === 'en' ? 'Protected ground cover' : 'Tierra cubierta / protegida',
    value:
      locale === 'en'
        ? `${metrics.groundCoverPct}% covered (${metrics.bareMonths} bare mo)`
        : `${metrics.groundCoverPct} % (${metrics.bareMonths} m pelona)`,
    delta: archetype === 'current' ? undefined : dBare,
    good: dBare <= 0,
  });

  const dN = metrics.nFixedKgHa - currentMetrics.nFixedKgHa;
  benefits.push({
    label: locale === 'en' ? 'Natural nitrogen added' : 'Abono natural fijado (N)',
    value: locale === 'en' ? `${metrics.nFixedKgHa} kg/ha/yr` : `${metrics.nFixedKgHa} kg N/ha/año`,
    delta: archetype === 'current' ? undefined : dN,
    good: dN >= 0,
  });

  const dEros = +(metrics.soilLossTHa - currentMetrics.soilLossTHa).toFixed(1);
  benefits.push({
    label: locale === 'en' ? 'Estimated soil washout' : 'Pérdida estimada de tierra',
    value: locale === 'en' ? `${metrics.soilLossTHa} t/ha/yr` : `${metrics.soilLossTHa} t/ha/año`,
    delta: archetype === 'current' ? undefined : dEros,
    good: dEros <= 0,
  });

  // 4. Information gaps / uncertainty
  if (site.climate.provenance !== 'live' && site.climate.provenance !== 'cached') {
    gaps.push(
      locale === 'en'
        ? 'Weather uses a regional fallback estimate here, not live local measurements.'
        : 'El clima está usando un estimado regional porque no hubo conexión directa con datos reales.',
    );
  } else {
    gaps.push(
      locale === 'en'
        ? 'Satellite weather averages wide ~55 km areas and can miss low-spot frost pockets or local storms.'
        : 'Los datos de lluvia y calor cubren zonas amplias (~55 km) y pueden no ver una helada en hondonada o lluvia de un solo rancho.',
    );
  }
  if (!site.location.inCONUS) {
    gaps.push(
      locale === 'en'
        ? 'Outside the U.S., soil uses global 250 m maps and lacks salt (salinity) readings — check with a local soil test.'
        : 'Fuera de EE. UU. los mapas de suelo son generales (250 m) y no muestran salinidad — conviene prueba de suelo local.',
    );
  } else if (site.soil.ecDsM === null) {
    gaps.push(
      locale === 'en'
        ? 'Soil salt level and compacted hardpan layers are not measured from satellites.'
        : 'No se reporta nivel de salinidad ni si el suelo está apretado (compactación).',
    );
  }
  gaps.push(
    locale === 'en'
      ? 'Crop prices and yields are starting averages — check with your local buyer and deduct trucking.'
      : 'Los precios y cosechas son promedios de referencia: ajústalos con lo que paga tu comprador local.',
  );
  if (isSimulated) {
    gaps.push(
      locale === 'en'
        ? 'Test-scenario numbers explore what-if weather changes, not an actual forecast.'
        : 'Las pruebas de sequía o calor muestran qué pasaría en ese caso, no son un pronóstico del tiempo.',
    );
  }

  // 5. Risks requiring local field review
  const uniqRisks = new Set<string>();
  for (const c of mainCrops) {
    const cName = getCropName(c, locale);
    for (const r of getCropRisks(c, locale).slice(0, 2)) uniqRisks.add(`${cName}: ${r}.`);
  }
  if (preferredCoverId && offPolicy === 'cover') {
    const cov = getCrop(preferredCoverId, catalog);
    const covName = getCropName(cov, locale);
    uniqRisks.add(
      locale === 'en'
        ? `${covName}: terminate 2–3 weeks before planting in dry years so it does not drink starting soil moisture.`
        : `${covName}: hay que chapolear o cortar 2–3 semanas antes de sembrar para que no robe humedad en años secos.`,
    );
  }
  if (metrics.waterDeficitMm > 60) {
    uniqRisks.add(
      locale === 'en'
        ? `Estimated water gap of ${metrics.waterDeficitMm} mm/yr: confirm your real well/canal allotment or plant fewer hectares.`
        : `Faltarían aprox. ${metrics.waterDeficitMm} mm de agua al año: revisa la dotación real de tu pozo o canal.`,
    );
  }
  if (mainCrops.some((c) => c.cycle.yearsToBearing > 0)) {
    uniqRisks.add(
      locale === 'en'
        ? 'Orchard trees take several years without harvest and need winter chill and low-salt water checks.'
        : 'Árboles frutales tardan varios años en producir y requieren revisar horas frío y salinidad del agua.',
    );
  }
  for (const r of uniqRisks) risks.push(r);

  return { why, evidence, benefits, gaps, risks: risks.slice(0, 5) };
}

export function analyzeSite(
  site: SiteProfile,
  farmer: FarmerInputs,
  scenario: Scenario = { deltaTempC: 0, precipChangePct: 0, waterAvailabilityChangePct: 0 },
  catalog: Crop[] = CROPS,
  locale: Locale = 'en',
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
      undefined,
      undefined,
      locale,
    );
    evals[crop.id] = ev;
    const excludedReason = getExclusionReason(crop, farmer, locale);
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
  const windows = detectCriticalWindows(site, currentEval, farmer, effectiveClimate, isSimulated, locale);

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

  const curName = getCropName(currentCrop, locale);
  const specs: Spec[] = [
    {
      id: 'strat-current',
      archetype: 'current',
      title: locale === 'en' ? 'Keep your current crop' : 'Seguir como siembras hoy',
      subtitle:
        locale === 'en'
          ? 'Side-by-side baseline with your current crop and between-season practice'
          : 'Comparación base con tu cultivo y manejo actual entre ciclos',
      seq: currentSeq,
      offPolicy: farmer.offSeason,
      preferLegumeCover: false,
      isCurrent: true,
    },
    {
      id: 'strat-water-soil',
      archetype: 'water-soil',
      title: locale === 'en' ? 'Save water & protect soil' : 'Ahorrar agua y cuidar la tierra',
      subtitle:
        locale === 'en'
          ? 'Needs less irrigation, covers bare months, and helps rain soak in'
          : 'Pide menos riego, tapa los meses pelones y guarda mejor la lluvia',
      seq: buildDiverse3(waterSoilOrder, false),
      offPolicy: site.climate.annualPrecip >= 260 ? 'cover' : 'bare',
      preferLegumeCover: false,
      isCurrent: false,
    },
    {
      id: 'strat-diversified',
      archetype: 'diversified',
      title: locale === 'en' ? 'Rotate crops & add natural nitrogen' : 'Rotar cultivos y dar abono natural',
      subtitle:
        locale === 'en'
          ? 'Switches plant families to break pests and cut fertilizer costs'
          : 'Cambia de familia cada año para cortar plagas y gastar menos abono',
      seq: buildDiverse3(diversifiedOrder, true),
      offPolicy: site.climate.annualPrecip >= 320 ? 'cover' : 'bare',
      preferLegumeCover: true,
      isCurrent: false,
    },
    {
      id: 'strat-income',
      archetype: 'income',
      title: locale === 'en' ? 'Best net profit for your water' : 'Mejor ganancia cuidando el agua',
      subtitle:
        locale === 'en'
          ? 'Aims for top return per hectare and per gallon without back-to-back pests'
          : 'Busca mayor ganancia por hectárea sin repetir el mismo cultivo',
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
      title: locale === 'en' ? 'More hay & livestock feed' : 'Sacar más pastura para ganado',
      subtitle:
        locale === 'en'
          ? 'Focuses on steady feed tonnage and year-round soil protection'
          : 'Prioriza pastura de calidad y mantiene la tierra cubierta todo el año',
      seq: buildDiverse3(forageOrder, true),
      offPolicy: 'cover',
      preferLegumeCover: false,
      isCurrent: false,
    });
  } else {
    // Also test keeping current crop but upgrading with cover crop + legume partner
    const partner = diversifiedOrder.find((c) => c.family !== currentCrop.family) ?? waterSoilOrder[0];
    if (partner && currentCrop.season !== 'perennial') {
      const partName = getCropName(partner, locale);
      specs.push({
        id: 'strat-priority-optimal',
        archetype: 'priority-optimal',
        title:
          locale === 'en'
            ? 'Step-by-step switch with your main crop + partner'
            : 'Cambio paso a paso con tu cultivo + socio',
        subtitle:
          locale === 'en'
            ? `Keeps ${curName} every other year paired with ${partName} and a cover crop`
            : `Conserva ${curName} un año sí y otro con ${partName} y cobertura viva`,
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
    locale,
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
          locale,
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
      locale,
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
        seq, 'cover', coverId, site, farmer, effectiveClimate, effectiveIrrigationMm, evals, catalog, locale,
      );
      const scores = computeScores(core.metrics, seq, farmer.priorities, effectiveIrrigationMm, site, isSimulated, catalog);
      const explanation = buildExplanation(
        'water-soil', seq, 'cover', coverId, core.metrics, currentCore.metrics, site, farmer, isSimulated, scenario, catalog, locale,
      );
      const fbName = getCropName(getCrop(fb, catalog), locale);
      built.push({
        id: `strat-fb-${fb}`,
        archetype: 'water-soil',
        title: locale === 'en' ? `Hardy backup option · ${fbName}` : `Opción rústica · ${fbName}`,
        subtitle:
          locale === 'en'
            ? 'Backup choice when water, weather, or gear limits are tight'
            : 'Opción resistente cuando hay poca agua, clima difícil o poco equipo',
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
    const dT = `${scenario.deltaTempC >= 0 ? '+' : ''}${scenario.deltaTempC.toFixed(1)} °C`;
    const dP = `${scenario.precipChangePct >= 0 ? '+' : ''}${scenario.precipChangePct}%`;
    const dW = `${scenario.waterAvailabilityChangePct >= 0 ? '+' : ''}${scenario.waterAvailabilityChangePct}%`;
    notes.push(
      locale === 'en'
        ? `Test weather mode active (${dT}, rain ${dP}, irrigation ${dW}): these results show what-if tests, not an actual weather forecast.`
        : `Prueba de clima activada (${dT}, lluvia ${dP}, agua de riego ${dW}): los resultados muestran qué pasaría en ese caso, no son pronóstico.`,
    );
  }
  if (eligible.length < 3) {
    notes.push(
      locale === 'en'
        ? 'Your current filters leave few eligible crops; enabling more buyers or equipment opens more options.'
        : 'Tus filtros actuales dejan pocos cultivos viables; activar más tipos de venta o maquinaria abre más opciones.',
    );
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
