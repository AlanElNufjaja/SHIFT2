import type {
  Crop,
  CropEvaluation,
  DrainageClass,
  IrrigationSystem,
  MonthlyClimate,
  MonthlyCropBalance,
  Scenario,
  SoilProfile,
  TextureClass,
} from './types';

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Hargreaves–Samani reference evapotranspiration (mm/day). */
export function hargreavesET0(tmean: number, tmax: number, tmin: number, sradMJm2Day: number): number {
  const td = Math.max(1, tmax - tmin);
  const raEq = Math.max(0.5, sradMJm2Day * 0.408);
  return Math.max(0.2, 0.0023 * Math.max(0, tmean + 17.8) * Math.sqrt(td) * raEq);
}

/** USDA SCS effective monthly rainfall approximation (mm). */
export function effectivePrecip(monthlyPrecipMm: number): number {
  if (monthlyPrecipMm <= 0) return 0;
  if (monthlyPrecipMm <= 250) {
    return (monthlyPrecipMm * (125 - 0.2 * monthlyPrecipMm)) / 125;
  }
  return 125 + 0.1 * monthlyPrecipMm;
}

/** USDA soil texture triangle classification. */
export function classifyTexture(sand: number, clay: number): TextureClass {
  const silt = Math.max(0, 100 - sand - clay);
  if (silt + 1.5 * clay < 15) return 'sand';
  if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return 'loamy sand';
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) {
    return 'sandy loam';
  }
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'loam';
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'silt loam';
  if (silt >= 80 && clay < 12) return 'silt';
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'sandy clay loam';
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'clay loam';
  if (clay >= 27 && clay < 40 && sand <= 20) return 'silty clay loam';
  if (clay >= 35 && sand > 45) return 'sandy clay';
  if (clay >= 40 && silt >= 40) return 'silty clay';
  return 'clay';
}

/** Available water capacity estimate (mm/m) from texture and organic matter (%). */
export function estimateAWC(sand: number, clay: number, om: number): number {
  const silt = Math.max(0, 100 - sand - clay);
  const base = 155 - 0.85 * sand + 0.45 * silt + 0.15 * clay + 10 * Math.min(om, 5);
  return Math.round(clamp(base, 60, 240));
}

/** RUSLE soil erodibility K factor (SI units: t·ha·h / ha·MJ·mm) via EPIC-style approximation. */
export function estimateKFactor(sand: number, silt: number, clay: number, om: number): number {
  const sn = 1 - sand / 100;
  const orgC = om / 1.724;
  const fcsand = 0.2 + 0.3 * Math.exp(-0.0256 * sand * (1 - silt / 100));
  const fclsi = Math.pow(Math.max(0.01, silt / Math.max(1, clay + silt)), 0.3);
  const fhisand = 1 - (0.7 * Math.pow(sn, 5)) / (Math.pow(sn, 5) + Math.exp(-5.51 + 22.9 * sn));
  const forcg = 1 - (0.25 * orgC) / (orgC + Math.exp(3.72 - 2.95 * orgC));
  const k = fcsand * fclsi * forcg * fhisand * 0.1317;
  return +clamp(k, 0.01, 0.075).toFixed(4);
}

/** RUSLE topographic LS factor (assumes representative 50 m slope length). */
export function computeLSFactor(slopePct: number, lengthM = 50): number {
  const s = Math.max(0.1, slopePct);
  const theta = Math.atan(s / 100);
  const beta = (Math.sin(theta) / 0.0896) / (3 * Math.pow(Math.sin(theta), 0.8) + 0.56);
  const m = beta / (1 + beta);
  const L = Math.pow(lengthM / 22.13, m);
  const S = s < 9 ? 10.8 * Math.sin(theta) + 0.03 : 16.8 * Math.sin(theta) - 0.5;
  return +clamp(L * S, 0.05, 8).toFixed(2);
}

/** Modified Fournier Index -> RUSLE rainfall erosivity R (MJ·mm / ha·h·yr). */
export function computeRFactor(monthlyPrecip: number[]): number {
  const annual = Math.max(1, monthlyPrecip.reduce((a, b) => a + Math.max(0, b), 0));
  const mfi = monthlyPrecip.reduce((a, p) => a + p * p, 0) / annual;
  const r = 1.735 * Math.pow(10, 1.5 * Math.log10(Math.max(1, mfi)) - 0.08188);
  return Math.round(clamp(r, 80, 7500));
}

/** RUSLE annual soil loss (t/ha/yr) from R, K, LS and cover factor C (0.01–0.65). */
export function computeSoilLoss(rFactor: number, kFactor: number, lsFactor: number, cFactor: number): number {
  return +(rFactor * kFactor * lsFactor * clamp(cFactor, 0.01, 0.8)).toFixed(2);
}

export function irrigationEfficiency(system: IrrigationSystem): number {
  switch (system) {
    case 'none': return 1.0;
    case 'furrow': return 0.6;
    case 'sprinkler': return 0.75;
    case 'pivot': return 0.85;
    case 'drip': return 0.92;
  }
}

export function applyScenario(
  monthly: MonthlyClimate[],
  scenario: Scenario,
  irrigationMm: number,
): { monthly: MonthlyClimate[]; irrigationMm: number } {
  const isNeutral =
    scenario.deltaTempC === 0 &&
    scenario.precipChangePct === 0 &&
    scenario.waterAvailabilityChangePct === 0;

  if (isNeutral) {
    return { monthly, irrigationMm };
  }

  const pScale = Math.max(0.1, 1 + scenario.precipChangePct / 100);
  const etScale = Math.max(0.75, 1 + 0.035 * scenario.deltaTempC);
  const dt = scenario.deltaTempC;

  const shifted = monthly.map((m) => {
    const tmean = +(m.tmean + dt).toFixed(1);
    const tmax = +(m.tmax + dt).toFixed(1);
    const tmin = +(m.tmin + dt).toFixed(1);
    const precip = +(m.precip * pScale).toFixed(1);
    const et0 = +(m.et0 * etScale).toFixed(1);

    // Shift frost and heat day counts realistically with temperature delta
    let frostDays = m.frostDays;
    if (dt !== 0) {
      if (tmin <= 0) {
        frostDays = clamp(m.frostDays - dt * 1.4, 0, DAYS_IN_MONTH[m.month]);
      } else if (tmin <= 3.5 && dt < 0) {
        frostDays = clamp(m.frostDays + Math.abs(dt) * 1.5, 0, DAYS_IN_MONTH[m.month]);
      } else if (dt > 0) {
        frostDays = Math.max(0, m.frostDays * Math.max(0, 1 - dt * 0.22));
      }
    }

    let heatDays = m.heatDays;
    if (dt > 0) {
      const extra = tmax >= 32 ? dt * (tmax >= 35 ? 3.2 : 1.8) : tmax >= 29 ? dt * 0.6 : 0;
      heatDays = clamp(m.heatDays + extra, 0, DAYS_IN_MONTH[m.month]);
    } else if (dt < 0) {
      heatDays = Math.max(0, m.heatDays + dt * 2);
    }

    const heavyRainDays = +(m.heavyRainDays * pScale).toFixed(1);
    const soilWetness = +clamp(m.soilWetness * Math.pow(pScale, 0.35) / Math.pow(etScale, 0.2), 0.05, 0.95).toFixed(2);

    return {
      ...m,
      tmean,
      tmax,
      tmin,
      precip,
      et0,
      frostDays: +frostDays.toFixed(1),
      heatDays: +heatDays.toFixed(1),
      heavyRainDays,
      soilWetness,
    };
  });

  const effIrr = Math.max(0, Math.round(irrigationMm * Math.max(0, 1 + scenario.waterAvailabilityChangePct / 100)));
  return { monthly: shifted, irrigationMm: effIrr };
}

/** Approximate winter chill hours (0 °C <= T <= 7.2 °C) from monthly diurnal temperature range. */
export function estimateChillHours(monthly: MonthlyClimate[]): number {
  let hours = 0;
  for (const m of monthly) {
    const mid = (m.tmax + m.tmin) / 2;
    const halfAmp = Math.max(1, (m.tmax - m.tmin) / 2);
    let chillFrac = 0;
    const steps = 12;
    for (let s = 0; s < steps; s++) {
      const t = mid + halfAmp * Math.sin((2 * Math.PI * s) / steps);
      if (t >= 0 && t <= 7.2) chillFrac += 1 / steps;
      else if (t > 7.2 && t <= 10) chillFrac += 0.35 / steps;
    }
    hours += DAYS_IN_MONTH[m.month] * 24 * chillFrac;
  }
  return Math.round(hours);
}

const DRAINAGE_INDEX: Record<DrainageClass, number> = {
  excessive: 0,
  well: 1,
  moderate: 2,
  'somewhat-poor': 3,
  poor: 4,
};

export function soilSuitability(crop: Crop, soil: SoilProfile): { score: number; limiting: string[] } {
  let score = 1.0;
  const limiting: string[] = [];

  if (soil.ph !== null) {
    const [pMin, pMax] = crop.soil.phRange;
    if (soil.ph < pMin) {
      const diff = pMin - soil.ph;
      score *= clamp(1 - diff * 0.25, 0.45, 1);
      if (diff > 0.3) limiting.push(`Suelo ácido (pH ${soil.ph.toFixed(1)} < óptimo ${pMin})`);
    } else if (soil.ph > pMax) {
      const diff = soil.ph - pMax;
      score *= clamp(1 - diff * 0.22, 0.5, 1);
      if (diff > 0.3) limiting.push(`Suelo alcalino (pH ${soil.ph.toFixed(1)} > óptimo ${pMax})`);
    }
  }

  if (soil.ecDsM !== null && soil.ecDsM > crop.soil.salinityThreshold) {
    const excess = soil.ecDsM - crop.soil.salinityThreshold;
    const pen = clamp(1 - excess * 0.14, 0.35, 1);
    score *= pen;
    limiting.push(`Salinidad (EC ${soil.ecDsM.toFixed(1)} dS/m > umbral ${crop.soil.salinityThreshold})`);
  }

  const dIdx = DRAINAGE_INDEX[soil.drainage];
  if (dIdx >= 3 && crop.soil.waterlogSensitivity > 0.55) {
    const pen = dIdx === 4 ? 1 - 0.5 * crop.soil.waterlogSensitivity : 1 - 0.25 * crop.soil.waterlogSensitivity;
    score *= clamp(pen, 0.4, 1);
    limiting.push('Drenaje deficiente / riesgo de encharcamiento');
  }

  if (soil.awcMmPerM < 85 && crop.water.droughtSensitivity > 0.65 && crop.role === 'main') {
    score *= 0.88;
    limiting.push('Suelo arenoso con baja retención de humedad');
  }

  return { score: +clamp(score, 0.25, 1).toFixed(3), limiting };
}

/** Find the planting month (0..11) that gives highest thermal + seasonal fit. */
export function findBestPlantingMonth(crop: Crop, monthly: MonthlyClimate[]): number {
  if (crop.season === 'perennial' || crop.id === 'fallow') return 0;

  if (crop.season === 'warm') {
    // Warm season: start at the first frost-safe warming month so the peak falls in summer
    let bestMonth = 3;
    let bestScore = -1e9;
    for (let s = 0; s < 12; s++) {
      // Evaluate 4-month window from s
      let gddAcc = 0;
      let frostPen = 0;
      let heatPen = 0;
      const span = Math.min(5, crop.thermal.maxMonths);
      for (let k = 0; k < span; k++) {
        const m = monthly[(s + k) % 12];
        const gdd = Math.max(0, m.tmean - crop.thermal.tBase) * DAYS_IN_MONTH[m.month];
        gddAcc += gdd;
        if (k === 0) frostPen += m.frostDays * (1 - crop.thermal.frostTolerance) * 45;
        if (k >= 1 && k <= 3 && m.tmax > crop.thermal.tHeatStress) {
          heatPen += (m.tmax - crop.thermal.tHeatStress) * 18;
        }
      }
      const startTemp = monthly[s].tmean;
      const tooColdStart = startTemp < crop.thermal.tBase + 1 ? 180 : 0;
      const gddFit = crop.thermal.gdd > 0 ? Math.min(1, gddAcc / (crop.thermal.gdd * 0.85)) * 220 : 120;
      const sc = gddFit - frostPen - heatPen - tooColdStart;
      if (sc > bestScore) {
        bestScore = sc;
        bestMonth = s;
      }
    }
    return bestMonth;
  }

  // Cool season / overwintering: plant in autumn (cool enough without immediate deep freeze)
  // or early spring if winters kill the crop
  let bestMonth = 9;
  let bestScore = -1e9;
  for (let s = 0; s < 12; s++) {
    let validMonths = 0;
    let killPen = 0;
    let heatPen = 0;
    let gddAcc = 0;
    const span = Math.min(7, crop.thermal.maxMonths);
    for (let k = 0; k < span; k++) {
      const m = monthly[(s + k) % 12];
      if (m.tmin < crop.thermal.tLethalMin) {
        killPen += (crop.thermal.tLethalMin - m.tmin) * 80;
      }
      const gdd = Math.max(0, m.tmean - crop.thermal.tBase) * DAYS_IN_MONTH[m.month];
      gddAcc += gdd;
      if (m.tmean >= crop.thermal.tOptLow - 5 && m.tmean <= crop.thermal.tOptHigh + 4) {
        validMonths += 1;
      }
      if (k >= 2 && m.tmax > crop.thermal.tHeatStress) {
        heatPen += (m.tmax - crop.thermal.tHeatStress) * 35;
      }
    }
    // Prefer planting while topsoil is still workable (> 6 °C)
    const estPenalty = monthly[s].tmean < 4 ? 120 : monthly[s].tmean > 26 ? 90 : 0;
    const gddFit = crop.thermal.gdd > 0 ? Math.min(1, gddAcc / crop.thermal.gdd) * 180 : 100;
    const sc = validMonths * 35 + gddFit - killPen - heatPen - estPenalty;
    if (sc > bestScore) {
      bestScore = sc;
      bestMonth = s;
    }
  }
  return bestMonth;
}

/**
 * Simulate one crop cycle in the parcel's climate & soil and produce a transparent evaluation.
 */
export function evaluateCrop(
  crop: Crop,
  monthly: MonthlyClimate[],
  soil: SoilProfile,
  availableIrrigationMm: number,
  system: IrrigationSystem,
  nPriceUsdPerKg = 1.4,
  waterCostUsdPer1000m3 = 25,
  startMonthOverride?: number,
  maxMonthsOverride?: number,
): CropEvaluation {
  const startMonth = startMonthOverride ?? findBestPlantingMonth(crop, monthly);
  const maxM = maxMonthsOverride ?? crop.thermal.maxMonths;
  const eff = irrigationEfficiency(system);

  // Determine cycle length in months using GDD (for annuals) or fixed 12 months (perennials)
  let cycleMonths = maxM;
  if (crop.season !== 'perennial' && crop.id !== 'fallow' && crop.thermal.gdd > 0) {
    let gdd = 0;
    let reached = maxM;
    for (let k = 0; k < maxM; k++) {
      const m = monthly[(startMonth + k) % 12];
      gdd += Math.max(0, m.tmean - crop.thermal.tBase) * DAYS_IN_MONTH[m.month];
      if (k + 1 >= crop.thermal.minMonths && gdd >= crop.thermal.gdd) {
        reached = k + 1;
        break;
      }
    }
    cycleMonths = clamp(reached, crop.thermal.minMonths, maxM);
  }

  // Monthly water balance simulation across the crop cycle
  const rootDepth = Math.min(crop.soil.rootDepthM, soil.rootZoneDepthM);
  // Readily available water storage capacity (mm)
  const rawMax = Math.max(25, soil.awcMmPerM * rootDepth * 0.55);
  let soilWater = rawMax * 0.55; // moderate initial moisture

  const monthlyBal: MonthlyCropBalance[] = [];
  let etcTotal = 0;
  let peffTotal = 0;
  let netIrrTotal = 0;
  let gddTotal = 0;
  let thermalWeightSum = 0;
  let frostDamageSum = 0;
  let heatDamageSum = 0;
  let winterKill = false;

  for (let k = 0; k < cycleMonths; k++) {
    const mIdx = (startMonth + k) % 12;
    const m = monthly[mIdx];
    const progress = (k + 0.5) / cycleMonths;

    let stage: MonthlyCropBalance['stage'];
    let kc: number;
    if (crop.id === 'fallow') {
      stage = 'dormant';
      kc = crop.water.kcIni;
    } else if (crop.season === 'perennial' && m.tmean < crop.thermal.tBase) {
      stage = 'dormant';
      kc = 0.25;
    } else if (progress < 0.22) {
      stage = 'initial';
      kc = crop.water.kcIni;
    } else if (progress < 0.45) {
      stage = 'development';
      const frac = (progress - 0.22) / 0.23;
      kc = crop.water.kcIni + frac * (crop.water.kcMid - crop.water.kcIni);
    } else if (progress < 0.78) {
      stage = 'mid';
      kc = crop.water.kcMid;
    } else {
      stage = 'late';
      const frac = (progress - 0.78) / 0.22;
      kc = crop.water.kcMid + frac * (crop.water.kcEnd - crop.water.kcMid);
    }

    const etc = +(m.et0 * kc).toFixed(1);
    const peff = +effectivePrecip(m.precip).toFixed(1);
    etcTotal += etc;
    peffTotal += peff;

    // Water balance step
    soilWater += peff;
    let irrNeed = 0;
    if (soilWater < etc) {
      irrNeed = etc - soilWater;
      soilWater = 0;
    } else {
      soilWater = Math.min(rawMax, soilWater - etc);
    }
    netIrrTotal += irrNeed;

    // Thermal response
    if (m.tmin < crop.thermal.tLethalMin && crop.id !== 'fallow') {
      winterKill = true;
    }
    const gdd = Math.max(0, m.tmean - crop.thermal.tBase) * DAYS_IN_MONTH[mIdx];
    gddTotal += gdd;

    if (stage !== 'dormant') {
      let tFit = 1;
      if (m.tmean < crop.thermal.tOptLow) {
        tFit = clamp(1 - (crop.thermal.tOptLow - m.tmean) / Math.max(6, crop.thermal.tOptLow - crop.thermal.tBase + 4), 0.2, 1);
      } else if (m.tmean > crop.thermal.tOptHigh) {
        tFit = clamp(1 - (m.tmean - crop.thermal.tOptHigh) / 10, 0.25, 1);
      }
      thermalWeightSum += tFit;

      // Frost sensitivity is highest at start (seedling) or late/mid (bloom)
      const frostStageMult = stage === 'mid' ? 1.15 : stage === 'initial' ? 0.95 : 0.7;
      if (m.frostDays > 0 && crop.thermal.frostTolerance < 0.95) {
        frostDamageSum += (m.frostDays / 10) * (1 - crop.thermal.frostTolerance) * frostStageMult;
      }

      // Heat damage during mid-season flowering/fruit fill
      if ((stage === 'mid' || stage === 'development') && m.tmax > crop.thermal.tHeatStress - 2) {
        const excess = Math.max(0, m.tmax - crop.thermal.tHeatStress + 1);
        const dayRatio = Math.max(0.15, m.heatDays / 12);
        heatDamageSum += (excess / 8) * dayRatio * (1 - crop.thermal.heatTolerance * 0.75);
      }
    } else {
      thermalWeightSum += 1;
    }

    monthlyBal.push({
      month: mIdx,
      stage,
      kc: +kc.toFixed(2),
      etc,
      peff,
      irrigationNeed: +irrNeed.toFixed(1),
      soilWaterEnd: +soilWater.toFixed(1),
      frostDays: m.frostDays,
      heatDays: m.heatDays,
    });
  }

  // Water application & FAO-33 yield response
  const grossIrr = system === 'none' ? 0 : Math.round(netIrrTotal / eff);
  const appliedGross = system === 'none' ? 0 : Math.min(availableIrrigationMm, grossIrr);
  const appliedNet = appliedGross * eff;
  const actualET = Math.min(etcTotal, etcTotal - netIrrTotal + appliedNet);
  const deficitMm = Math.max(0, Math.round(etcTotal - actualET));

  let waterFactor = 1;
  if (crop.id !== 'fallow' && etcTotal > 0 && crop.water.ky > 0) {
    const etRatio = clamp(actualET / etcTotal, 0, 1);
    waterFactor = clamp(1 - crop.water.ky * (1 - etRatio), 0.12, 1);
  }

  const thermalFactor = winterKill ? 0.1 : clamp(thermalWeightSum / Math.max(1, cycleMonths), 0.15, 1);
  const frostFactor = winterKill ? 0.05 : clamp(1 - frostDamageSum * 0.45, 0.1, 1);
  const heatFactor = clamp(1 - heatDamageSum * 0.5, 0.2, 1);

  let seasonFactor = 1;
  if (crop.thermal.gdd > 0 && crop.season !== 'perennial' && crop.id !== 'fallow') {
    seasonFactor = clamp(gddTotal / crop.thermal.gdd, 0.2, 1);
  }

  let chillFactor = 1;
  if (crop.thermal.chillHours && crop.thermal.chillHours > 0) {
    const chill = estimateChillHours(monthly);
    chillFactor = clamp(chill / crop.thermal.chillHours, 0.25, 1);
  }

  const soilRes = soilSuitability(crop, soil);
  const soilFactor = soilRes.score;

  // Overall suitability 0-100
  const combined =
    crop.id === 'fallow'
      ? 0.65
      : Math.pow(thermalFactor, 0.7) *
        Math.pow(frostFactor, 1.0) *
        Math.pow(heatFactor, 0.9) *
        Math.pow(seasonFactor, 1.0) *
        Math.pow(chillFactor, 0.85) *
        Math.pow(waterFactor, 1.0) *
        Math.pow(soilFactor, 0.75);

  const suitability = Math.round(clamp(combined * 100, 0, 100));

  // Limiting factor explanations in plain Spanish
  const limitingFactors: string[] = [...soilRes.limiting];
  if (winterKill) limitingFactors.push('Temperatura mínima letal en invierno');
  if (frostFactor < 0.8) limitingFactors.push('Riesgo de heladas durante el ciclo activo');
  if (heatFactor < 0.82) limitingFactors.push('Estrés por calor extremo en floración / llenado');
  if (seasonFactor < 0.85) limitingFactors.push('Estación térmica corta (grados-día insuficientes)');
  if (chillFactor < 0.8) limitingFactors.push('Horas frío invernales insuficientes');
  if (waterFactor < 0.78) {
    limitingFactors.push(
      system === 'none'
        ? `Déficit hídrico en temporal (${deficitMm} mm faltantes)`
        : `Agua de riego insuficiente (${deficitMm} mm de déficit)`,
    );
  }

  // Yield & economics
  const yieldScale = clamp(combined, 0.1, 1);
  const yieldEstimate = +(crop.market.potentialYield * yieldScale).toFixed(2);
  const grossRevenue = crop.role === 'service' ? 0 : Math.round(yieldEstimate * crop.market.price);

  const estAmortized =
    crop.cycle.lifecycleYears > 1
      ? crop.cycle.establishmentCostPerHa / crop.cycle.lifecycleYears
      : crop.cycle.establishmentCostPerHa;
  const nCost = Math.round(crop.nitrogen.demandKgHa * nPriceUsdPerKg);
  const waterCost = Math.round((appliedGross * 10 / 1000) * waterCostUsdPer1000m3); // 1 mm/ha = 10 m3/ha
  const operatingCost = Math.round(crop.market.costPerHa + estAmortized + nCost + waterCost);

  const minSuit = crop.role === 'service' ? 25 : 32;
  const feasible = !winterKill && suitability >= minSuit && (crop.role === 'service' || yieldScale >= 0.3);

  return {
    cropId: crop.id,
    placement: { cropId: crop.id, startMonth, months: cycleMonths },
    suitability,
    factors: {
      thermal: +thermalFactor.toFixed(2),
      frost: +frostFactor.toFixed(2),
      heat: +heatFactor.toFixed(2),
      season: +seasonFactor.toFixed(2),
      chill: +chillFactor.toFixed(2),
      water: +waterFactor.toFixed(2),
      soil: +soilFactor.toFixed(2),
    },
    etcMm: Math.round(etcTotal),
    peffMm: Math.round(peffTotal),
    netIrrigationMm: Math.round(netIrrTotal),
    grossIrrigationMm: grossIrr,
    appliedIrrigationMm: Math.round(appliedGross),
    waterDeficitMm: deficitMm,
    yieldEstimate,
    yieldUnit: crop.market.unit,
    grossRevenue,
    operatingCost,
    monthly: monthlyBal,
    limitingFactors,
    feasible,
  };
}
