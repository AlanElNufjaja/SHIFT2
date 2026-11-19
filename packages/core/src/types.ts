/**
 * Shared domain types for Field Shift.
 * These types are the contract between the data-ingestion layer (server),
 * the decision engine (core) and the UI (web).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Provenance — every number shown to a farmer must say where it came from.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * - live:       fetched from the upstream service during this request.
 * - cached:     fetched from the upstream service earlier and served from cache.
 * - derived:    computed by Field Shift from live/cached inputs with a documented model.
 * - baseline:   regional/climatological reference or synthetic baseline model (NOT a measurement).
 * - simulated:  scenario value produced by the what-if simulator (NOT a measurement).
 * - user:       entered or edited by the farmer / advisor.
 * - unavailable: no data could be obtained; the engine uses a neutral assumption and flags it.
 */
export type Locale = 'en' | 'es';

export type Provenance = 'live' | 'cached' | 'derived' | 'baseline' | 'simulated' | 'user' | 'unavailable';

export interface Sourced<T> {
  value: T;
  unit?: string;
  provenance: Provenance;
  /** Source registry ids that contributed to this value. */
  sources: SourceId[];
  /** Short description of the method (e.g. "Hargreaves ET0 bias-corrected with ERA5 FAO-56"). */
  method?: string;
  /** Native resolution of the dominant input (e.g. "0.5° × 0.625°", "30 m"). */
  resolution?: string;
  /** 0-1 confidence that the value represents conditions at the parcel. */
  confidence: number;
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data source registry
// ─────────────────────────────────────────────────────────────────────────────

export type SourceId =
  | 'nasa-power'
  | 'smap'
  | 'gpm-imerg'
  | 'landsat'
  | 'modis'
  | 'viirs'
  | 'ecostress'
  | 'srtm'
  | 'grace'
  | 'gldas'
  | 'nldas'
  | 'gedi'
  | 'sentinel-2'
  | 'era5'
  | 'ssurgo'
  | 'statsgo2'
  | 'wss'
  | 'soilgrids'
  | 'cdl'
  | 'nass-quickstats'
  | 'ams-market-news'
  | 'ag-data-commons'
  | 'fao-gaez'
  | 'usgs-water'
  | 'nlcd'
  | 'naip'
  | 'prism'
  | 'cocorahs'
  | 'openet'
  | 'landfire'
  | 'copernicus-dem'
  | 'fieldshift-baseline'
  | 'fieldshift-catalog'
  | 'user-input';

export type SourceAgency = 'NASA' | 'ESA' | 'ECMWF' | 'USDA' | 'USGS' | 'USFS' | 'FAO' | 'ISRIC' | 'NOAA/Community' | 'Academic' | 'Field Shift';

export type SourceCategory = 'climate' | 'soil-moisture' | 'precipitation' | 'vegetation' | 'thermal' | 'terrain' | 'groundwater' | 'soil' | 'land-use' | 'market' | 'agronomy' | 'imagery' | 'internal';

/**
 * How the connector participates in the analysis:
 * - values:       numeric values were extracted and used by the engine.
 * - availability: real granules/scenes were discovered for the parcel (metadata), values not extracted in-browser.
 * - map-layer:    used as a visual map layer (tiles).
 * - reference:    methodological reference / documented link; no automated query possible without credentials.
 * - key-required: connector implemented but needs an API key in server environment.
 */
export type ConnectorMode = 'values' | 'availability' | 'map-layer' | 'reference' | 'key-required';

export interface SourceMeta {
  id: SourceId;
  name: string;
  agency: SourceAgency;
  category: SourceCategory;
  description: string;
  /** What Field Shift uses it for, in plain language. */
  usedFor: string;
  spatialResolution: string;
  temporalResolution: string;
  coverage: string;
  url: string;
  /** Default participation mode for this source. */
  mode: ConnectorMode;
  limitations: string;
}

export type ConnectorStatus = 'live' | 'cached' | 'fallback' | 'unavailable' | 'not-applicable' | 'key-required' | 'reference';

export interface SourceReport {
  id: SourceId;
  status: ConnectorStatus;
  mode: ConnectorMode;
  /** Wall-clock time of the upstream request in ms (0 for cache/reference). */
  ms: number;
  /** Human readable summary of what was retrieved (e.g. "3 650 daily records 2016–2026"). */
  summary: string;
  /** Error or reason when not live. */
  detail?: string;
  /** ISO timestamp of retrieval. */
  retrievedAt?: string;
  /** Freshness of the most recent observation used (ISO date). */
  latestObservation?: string;
  /** Endpoint used (sanitized: no keys). */
  endpoint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Location & harmonized site profile
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface LocationInfo extends GeoPoint {
  name: string;
  region?: string;
  country?: string;
  countryCode?: string;
  /** Contiguous US — enables USDA/USGS connectors. */
  inCONUS: boolean;
}

export interface AnalysisGrid {
  /** Common analysis cell id, e.g. "N33.60_W101.85@0.01". */
  cellId: string;
  cellSizeDeg: number;
  center: GeoPoint;
  bounds: [[number, number], [number, number]];
  /** Native cells of coarse sources that contain the parcel (for the map). */
  nativeCells: { sourceId: SourceId; label: string; bounds: [[number, number], [number, number]] }[];
}

export interface MonthlyClimate {
  /** 0 = January */
  month: number;
  tmean: number; // °C
  tmax: number; // °C (mean daily max)
  tmin: number; // °C (mean daily min)
  precip: number; // mm / month
  et0: number; // mm / month (reference evapotranspiration)
  srad: number; // MJ m-2 day-1
  rh: number; // %
  wind: number; // m/s at 2 m
  /** Average days per month with Tmin ≤ 0 °C. */
  frostDays: number;
  /** Average days per month with Tmax ≥ 35 °C. */
  heatDays: number;
  /** Average days per month with precipitation ≥ 25 mm (heavy rain events). */
  heavyRainDays: number;
  /** Surface soil wetness 0–1 (NASA POWER GWETTOP, MERRA-2). */
  soilWetness: number;
}

export interface AnnualPoint {
  year: number;
  tmean: number;
  precip: number;
}

export interface MonthlyObservation {
  /** YYYY-MM */
  period: string;
  precip?: number;
  tmean?: number;
  et0?: number;
  soilMoisture?: number; // m3/m3 (ERA5-Land 0–7 cm)
  soilWetness?: number; // 0–1 (POWER GWETTOP)
  precipAnomalyPct?: number;
  tempAnomalyC?: number;
}

export interface ClimateProfile {
  monthly: MonthlyClimate[];
  provenance: Provenance;
  sources: SourceId[];
  period: string; // e.g. "2016–2025"
  resolution: string;
  confidence: number;
  annualPrecip: number;
  annualET0: number;
  meanTemp: number;
  /** Precipitation / ET0 (UNEP aridity index). */
  aridityIndex: number;
  /** Long-term (≈30-yr) annual series for trends. */
  annualSeries: AnnualPoint[];
  tempTrendCPerDecade: Sourced<number> | null;
  precipTrendPctPerDecade: Sourced<number> | null;
  /** Last 24 months vs climatology. */
  recent: MonthlyObservation[];
  recentPrecipAnomalyPct: Sourced<number> | null;
  recentTempAnomalyC: Sourced<number> | null;
  /** Ratio ERA5 FAO-56 / Hargreaves used to bias-correct ET0 (1 when not available). */
  et0BiasFactor: number;
  /** Cross-check between POWER and ERA5 temperatures (°C difference), if both available. */
  crossCheck?: { tempDiffC: number; precipDiffPct: number };
}

export type TextureClass =
  | 'sand'
  | 'loamy sand'
  | 'sandy loam'
  | 'loam'
  | 'silt loam'
  | 'silt'
  | 'sandy clay loam'
  | 'clay loam'
  | 'silty clay loam'
  | 'sandy clay'
  | 'silty clay'
  | 'clay';

export type DrainageClass = 'excessive' | 'well' | 'moderate' | 'somewhat-poor' | 'poor';

export interface SoilProfile {
  provenance: Provenance;
  sources: SourceId[];
  confidence: number;
  resolution: string;
  mapUnit?: string;
  component?: string;
  sand: number; // %
  clay: number; // %
  silt: number; // %
  organicMatter: number; // %
  /** Available water capacity, mm of water per m of soil. */
  awcMmPerM: number;
  ph: number | null;
  /** RUSLE soil erodibility K (t·ha·h / ha·MJ·mm). */
  kFactor: number;
  drainage: DrainageClass;
  hydrologicGroup?: string;
  texture: TextureClass;
  /** Electrical conductivity dS/m (salinity) if known. */
  ecDsM: number | null;
  rootZoneDepthM: number;
  notes: string[];
}

export interface TerrainProfile {
  provenance: Provenance;
  sources: SourceId[];
  confidence: number;
  resolution: string;
  elevationM: number;
  slopePct: number;
  aspectDeg: number | null;
  /** RUSLE LS factor (assumes 50 m slope length). */
  lsFactor: number;
  /** Relative runoff/erosion susceptibility 0–1 from terrain only. */
  terrainErosionIndex: number;
}

export interface NdviPoint {
  date: string; // ISO date
  ndvi: number;
}

export interface VegetationProfile {
  provenance: Provenance;
  sources: SourceId[];
  confidence: number;
  resolution: string;
  series: NdviPoint[];
  /** Mean NDVI by month (0 = Jan), null if no observation. */
  monthlyNdvi: (number | null)[];
  peakMonth: number | null;
  peakNdvi: number | null;
  /** Months in which NDVI suggests bare or sparsely covered soil (NDVI < 0.25). */
  bareSoilMonths: number[];
  /** Approximate number of months with active green cover (NDVI ≥ 0.35). */
  greenMonths: number;
  /** MODIS LST day mean by month (°C) where available. */
  monthlyLstDay: (number | null)[];
  /** MODIS MOD16 annual actual evapotranspiration (mm/yr). */
  annualActualET: Sourced<number> | null;
  landCover?: Sourced<string> | null;
}

export interface GroundwaterSite {
  id: string;
  name: string;
  distanceKm: number;
  trendMPerYr: number | null;
  lastDepthM: number | null;
  nObs: number;
}

export interface WaterProfile {
  /** GRACE/GRACE-FO regional water-storage context. */
  regionalStorageTrend: Sourced<'strong-decline' | 'decline' | 'stable' | 'unknown'>;
  groundwater: {
    provenance: Provenance;
    sources: SourceId[];
    sites: GroundwaterSite[];
    medianTrendMPerYr: number | null;
    summary: string;
  };
  /** Latest monthly soil moisture anomaly (fraction vs climatology), positive = wetter. */
  soilMoistureAnomaly: Sourced<number> | null;
  openetAnnualMm: Sourced<number> | null;
}

export interface CropHistoryYear {
  year: number;
  cdlCode: number | null;
  cdlName: string;
  cropId: string | null;
}

export interface CropHistory {
  provenance: Provenance;
  sources: SourceId[];
  years: CropHistoryYear[];
  /** Max number of consecutive years with the same crop family. */
  maxConsecutiveSameFamily: number;
  dominantCropId: string | null;
  summary: string;
}

export interface ImageryAvailability {
  sourceId: SourceId;
  product: string;
  /** Granules/scenes intersecting the parcel in the look-back window. */
  count: number;
  windowDays: number;
  latest?: string;
  /** Scenes with low cloud cover (when applicable). */
  clearCount?: number;
  native: string;
}

export interface SiteProfile {
  id: string;
  generatedAt: string;
  location: LocationInfo;
  grid: AnalysisGrid;
  climate: ClimateProfile;
  soil: SoilProfile;
  terrain: TerrainProfile;
  vegetation: VegetationProfile;
  water: WaterProfile;
  cropHistory: CropHistory;
  imagery: ImageryAvailability[];
  sources: SourceReport[];
  quality: {
    /** 0–1 overall data confidence for this parcel. */
    overall: number;
    liveSources: number;
    cachedSources: number;
    fallbackSources: number;
    unavailableSources: number;
    warnings: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crop catalog
// ─────────────────────────────────────────────────────────────────────────────

export type CropCategory = 'grain' | 'oilseed' | 'fiber' | 'forage' | 'vegetable' | 'tree' | 'legume' | 'cover' | 'fallow';

export type CropFamily =
  | 'Poaceae'
  | 'Fabaceae'
  | 'Malvaceae'
  | 'Asteraceae'
  | 'Brassicaceae'
  | 'Solanaceae'
  | 'Juglandaceae'
  | 'Rosaceae'
  | 'Mixed'
  | 'None';

export type Equipment = 'planter' | 'grain-drill' | 'combine' | 'cotton-picker' | 'hay' | 'orchard' | 'vegetable' | 'peanut-digger';

export type SeasonType = 'warm' | 'cool' | 'perennial' | 'any';

export interface CropMarket {
  /** Reference price, USD per `unit`. */
  price: number;
  unit: 't' | 't lint' | 't hay' | 't in-shell' | 't DM';
  /** Expected yield at full suitability, `unit` per ha. */
  potentialYield: number;
  /** Operating cost USD/ha/yr excluding irrigation water & N fertilizer (modeled separately). */
  costPerHa: number;
  /** 0–1 value as livestock feed. */
  forageValue: number;
  /** 0–1 price volatility / market access risk (higher = riskier). */
  marketRisk: number;
  priceSource: string;
  priceYear: number;
  /** USDA NASS QuickStats series (short_desc) and factor to convert to USD per `unit`. */
  nass?: { shortDesc: string; factor: number };
}

export interface Crop {
  id: string;
  name: string; // Spanish common name
  nameEn: string;
  scientific: string;
  category: CropCategory;
  family: CropFamily;
  season: SeasonType;
  /** Can be grown during winter dormancy (overwintering annual). */
  overwinters: boolean;
  /** Whether the crop is a main cash/forage crop or a service crop (cover/fallow). */
  role: 'main' | 'service';
  icon: string; // emoji for quick recognition
  color: string; // chart color
  thermal: {
    tBase: number; // °C base temperature for growth
    tOptLow: number;
    tOptHigh: number;
    /** Daily Tmax above which flowering/fruit set is damaged. */
    tHeatStress: number;
    /** Mean monthly Tmin below which the crop is killed (winter-kill), °C. */
    tLethalMin: number;
    /** 0 = killed by light frost, 1 = fully frost tolerant during active growth. */
    frostTolerance: number;
    /** 0 = very heat sensitive, 1 = very heat tolerant. */
    heatTolerance: number;
    /** Growing degree-days (base tBase) to maturity. */
    gdd: number;
    /** Hard cap on cycle months (incl. dormancy). */
    maxMonths: number;
    minMonths: number;
    /** Winter chill hours required (trees). */
    chillHours?: number;
  };
  water: {
    kcIni: number;
    kcMid: number;
    kcEnd: number;
    /** FAO-33 yield response factor Ky. */
    ky: number;
    /** 0–1 drought sensitivity (qualitative, used in explanations). */
    droughtSensitivity: number;
    /** Typical seasonal crop water use, mm (for display). */
    seasonalMm: [number, number];
  };
  nitrogen: {
    fixer: boolean;
    /** Biological N fixation kg N/ha per season. */
    fixationKgHa: number;
    /** Crop N demand kg N/ha per season. */
    demandKgHa: number;
    /** N credit to the following crop, kg N/ha. */
    creditNextKgHa: number;
  };
  soil: {
    /** Residue/biomass returned to soil, t DM/ha. */
    residueTHa: number;
    /** 0–1 canopy/residue ground cover during the crop's active months. */
    coverIndex: number;
    rootDepthM: number;
    /** 0–1 relative contribution to soil organic matter building. */
    omBuilding: number;
    /** Sensitivity to poor drainage/waterlogging 0–1. */
    waterlogSensitivity: number;
    phRange: [number, number];
    /** Salinity threshold ECe dS/m (Maas–Hoffman). */
    salinityThreshold: number;
    /** Requires tillage-intensive operations (row crop, vegetable). */
    intensiveTillage: boolean;
  };
  cycle: {
    /** Typical duration (days) under optimal temperatures, for display. */
    typicalDays: number;
    /** Years in the field (perennials). 1 for annuals. */
    standYears: number;
    /** Years until first commercial harvest (trees). */
    yearsToBearing: number;
    /** Economic life used to amortize establishment (years). */
    lifecycleYears: number;
    establishmentCostPerHa: number;
  };
  pest: {
    /** Families whose pest/disease cycles are interrupted when this crop follows them. */
    breaks: CropFamily[];
    keyRisks: string[];
  };
  equipment: Equipment[];
  market: CropMarket;
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Farmer inputs & scenario
// ─────────────────────────────────────────────────────────────────────────────

export type PriorityKey = 'water' | 'soil' | 'income' | 'forage' | 'resilience';

export type Priorities = Record<PriorityKey, number>; // 0–5

export type IrrigationSystem = 'none' | 'furrow' | 'sprinkler' | 'pivot' | 'drip';

export interface FarmerConstraints {
  /** Irrigation water available for the parcel, mm/yr (0 = rainfed). */
  irrigationMm: number;
  irrigationSystem: IrrigationSystem;
  equipment: Equipment[];
  /** Crop categories the farmer can sell locally / is willing to grow. */
  marketCategories: CropCategory[];
  excludedCrops: string[];
  allowPerennials: boolean;
  farmSizeHa: number;
  /** Cost of irrigation water + pumping, USD per 1000 m³ (= per 100 mm·ha). */
  waterCostUsdPer1000m3: number;
  /** Price of N fertilizer, USD/kg N. */
  nPriceUsdPerKg: number;
}

export interface FarmerInputs {
  currentCropId: string;
  previousCropIds: string[];
  /** Is the field normally left bare after harvest? */
  offSeason: 'bare' | 'cover' | 'double-crop';
  priorities: Priorities;
  constraints: FarmerConstraints;
}

export interface Scenario {
  deltaTempC: number;
  precipChangePct: number;
  /** Change in irrigation water availability, % (applied on constraints.irrigationMm). */
  waterAvailabilityChangePct: number;
}

export const NEUTRAL_SCENARIO: Scenario = { deltaTempC: 0, precipChangePct: 0, waterAvailabilityChangePct: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// Engine outputs
// ─────────────────────────────────────────────────────────────────────────────

export interface CropPlacement {
  cropId: string;
  /** Month index (0 = Jan) in which the crop is planted/established. */
  startMonth: number;
  /** Number of months the crop occupies the field. */
  months: number;
}

export interface MonthlyCropBalance {
  month: number;
  stage: 'initial' | 'development' | 'mid' | 'late' | 'dormant';
  kc: number;
  etc: number;
  peff: number;
  irrigationNeed: number;
  soilWaterEnd: number;
  frostDays: number;
  heatDays: number;
}

export interface CropEvaluation {
  cropId: string;
  placement: CropPlacement;
  /** 0–100 agro-climatic + soil suitability. */
  suitability: number;
  factors: {
    thermal: number; // 0–1
    frost: number; // 0–1 (1 = no damage)
    heat: number; // 0–1
    season: number; // 0–1 GDD completion
    chill: number; // 0–1
    water: number; // 0–1 (Ya/Ym from FAO-33)
    soil: number; // 0–1
  };
  etcMm: number;
  peffMm: number;
  netIrrigationMm: number;
  grossIrrigationMm: number;
  appliedIrrigationMm: number;
  waterDeficitMm: number;
  yieldEstimate: number;
  yieldUnit: string;
  grossRevenue: number;
  operatingCost: number;
  monthly: MonthlyCropBalance[];
  limitingFactors: string[];
  feasible: boolean;
}

export type SlotRole = 'main' | 'double' | 'cover' | 'fallow';

/** One crop occupying the field on the multi-year rotation timeline. */
export interface TimelineSlot {
  role: SlotRole;
  /** Absolute month index on the strategy timeline (0 = January of year 1). */
  start: number;
  months: number;
  evaluation: CropEvaluation;
  /** Irrigation share received vs. full need (0–1) after allocating the annual allotment. */
  irrigationShare: number;
  nFertilizerKgHa: number;
  nCreditReceivedKgHa: number;
  netIncome: number;
}

export interface StrategyMetrics {
  /** Gross irrigation demand mm/yr (avg). */
  irrigationMm: number;
  /** Irrigation applied (limited by availability), mm/yr. */
  irrigationAppliedMm: number;
  /** Crop water use mm/yr. */
  etcMm: number;
  waterDeficitMm: number;
  /** USD per m³ of total water (rain + irrigation) consumed. */
  waterProductivity: number;
  /** Months/yr with less than 30 % ground cover. */
  bareMonths: number;
  /** Bare months coinciding with erosive rainfall or frost/wind risk. */
  bareCriticalMonths: number;
  groundCoverPct: number;
  /** RUSLE soil loss estimate t/ha/yr. */
  soilLossTHa: number;
  residueTHa: number;
  nFixedKgHa: number;
  nFertilizerKgHa: number;
  /** Net N balance indicator (fixed + credits − exported demand), kg/ha/yr. */
  nBalanceKgHa: number;
  revenuePerHa: number;
  costPerHa: number;
  netIncomePerHa: number;
  forageTHa: number;
  /** Number of distinct botanical families. */
  diversity: number;
  /** Number of years in which a pest/disease cycle is broken. */
  pestBreaks: number;
  maxConsecutiveSameFamily: number;
  /** Climate risk 0–1 (frost/heat/drought exposure). */
  climateRisk: number;
  meanSuitability: number;
}

export interface StrategyScores {
  water: number;
  soil: number;
  income: number;
  forage: number;
  resilience: number;
  /** Weighted by farmer priorities, 0–100. */
  total: number;
  /** 0–100 reliability of the recommendation given data quality & model uncertainty. */
  reliability: number;
}

export interface EvidenceItem {
  label: string;
  value: string;
  provenance: Provenance;
  sources: SourceId[];
  /** positive = supports the strategy, negative = argues against, neutral = context. */
  polarity: 'support' | 'against' | 'context';
}

export interface StrategyExplanation {
  why: string[];
  evidence: EvidenceItem[];
  benefits: { label: string; value: string; delta?: number; good?: boolean }[];
  gaps: string[];
  risks: string[];
}

export type StrategyArchetype = 'current' | 'water-soil' | 'diversified' | 'income' | 'forage' | 'priority-optimal';

export interface Strategy {
  id: string;
  archetype: StrategyArchetype;
  title: string;
  subtitle: string;
  /** Crop sequence on a multi-year timeline (main crops + off-season slots). */
  timeline: TimelineSlot[];
  /** Number of months analysed (≈ 36). */
  horizonMonths: number;
  /** Monthly ground cover (0–1) across the horizon. */
  monthlyCover: number[];
  offSeasonPolicy: 'bare' | 'cover' | 'double-crop';
  mainSequence: string[];
  sequenceLabel: string;
  metrics: StrategyMetrics;
  scores: StrategyScores;
  explanation: StrategyExplanation;
  rank: number;
  isCurrent: boolean;
}

export type WindowKind = 'bare-soil' | 'water-stress' | 'heat' | 'frost' | 'erosion' | 'opportunity' | 'monoculture';

export interface CriticalWindow {
  kind: WindowKind;
  title: string;
  months: number[];
  severity: 'low' | 'medium' | 'high';
  detail: string;
  provenance: Provenance;
  sources: SourceId[];
}

export interface CropSuitabilityRow {
  cropId: string;
  suitability: number;
  netIncomePerHa: number;
  irrigationMm: number;
  feasible: boolean;
  excludedReason?: string;
  limiting: string[];
  placement: CropPlacement;
}

export interface AnalysisResult {
  scenario: Scenario;
  strategies: Strategy[];
  windows: CriticalWindow[];
  cropTable: CropSuitabilityRow[];
  /** Climate actually used by the engine (after scenario deltas). */
  effectiveClimate: MonthlyClimate[];
  effectiveIrrigationMm: number;
  notes: string[];
  generatedAt: string;
}
