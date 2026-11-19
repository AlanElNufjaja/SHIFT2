import { CROP_BY_ID } from './catalog';
import {
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  GLOSSARY,
  MONTH_FULL_ES,
  MONTH_NAMES_ES,
  SOURCES,
} from './sources';
import type { GlossaryEntry, PilotParcel } from './sources';
import type {
  Crop,
  CropCategory,
  CropFamily,
  Equipment,
  Locale,
  SourceId,
  SourceMeta,
  TextureClass,
} from './types';

export const MONTH_NAMES: Record<Locale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: MONTH_NAMES_ES,
};

export const MONTH_FULL: Record<Locale, readonly string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  es: MONTH_FULL_ES,
};

export const EQUIPMENT_LABELS_I18N: Record<Locale, Record<Equipment, string>> = {
  en: {
    planter: 'Row planter',
    'grain-drill': 'Grain / cover-crop drill',
    combine: 'Combine harvester',
    'cotton-picker': 'Cotton picker',
    hay: 'Hay mower, rake & baler',
    orchard: 'Orchard / tree care gear',
    vegetable: 'Transplanter / vegetable gear',
    'peanut-digger': 'Peanut digger',
  },
  es: EQUIPMENT_LABELS,
};

export function getEquipmentLabel(eq: Equipment, locale: Locale = 'en'): string {
  return EQUIPMENT_LABELS_I18N[locale][eq] ?? EQUIPMENT_LABELS[eq];
}

export const CATEGORY_LABELS_I18N: Record<Locale, Record<CropCategory, string>> = {
  en: {
    grain: 'Grains',
    oilseed: 'Oilseeds',
    fiber: 'Fiber',
    forage: 'Forage & hay',
    vegetable: 'Vegetables',
    tree: 'Fruit & nut trees',
    legume: 'Beans & legumes',
    cover: 'Cover crops',
    fallow: 'Rest / fallow',
  },
  es: CATEGORY_LABELS,
};

export function getCategoryLabel(cat: CropCategory, locale: Locale = 'en'): string {
  return CATEGORY_LABELS_I18N[locale][cat] ?? CATEGORY_LABELS[cat];
}

export const FAMILY_LABELS_I18N: Record<Locale, Record<CropFamily, string>> = {
  en: {
    Poaceae: 'Grass / grain family',
    Fabaceae: 'Legume / bean family',
    Malvaceae: 'Mallow / cotton family',
    Asteraceae: 'Sunflower family',
    Brassicaceae: 'Mustard / brassica family',
    Solanaceae: 'Nightshade / tomato family',
    Juglandaceae: 'Walnut / pecan family',
    Rosaceae: 'Rose / apple family',
    Mixed: 'Mixed plant families',
    None: 'No crop',
  },
  es: {
    Poaceae: 'Gramíneas (pastos y granos)',
    Fabaceae: 'Leguminosas (dan abono)',
    Malvaceae: 'Malváceas (algodón)',
    Asteraceae: 'Compuestas (girasol/cártamo)',
    Brassicaceae: 'Crucíferas (canola)',
    Solanaceae: 'Solanáceas (tomate)',
    Juglandaceae: 'Nogales',
    Rosaceae: 'Rosáceas (manzano)',
    Mixed: 'Mezcla de familias',
    None: 'Sin cultivo',
  },
};

export function getFamilyLabel(family: CropFamily, locale: Locale = 'en'): string {
  return FAMILY_LABELS_I18N[locale][family] ?? family;
}

export const TEXTURE_LABELS_I18N: Record<Locale, Record<TextureClass, string>> = {
  en: {
    sand: 'Sandy (drains fast)',
    'loamy sand': 'Loamy sand (light)',
    'sandy loam': 'Sandy loam',
    loam: 'Loam (balanced)',
    'silt loam': 'Silty loam (holds water)',
    silt: 'Silty',
    'sandy clay loam': 'Sandy clay loam',
    'clay loam': 'Clay loam (heavy)',
    'silty clay loam': 'Silty clay loam (heavy)',
    'sandy clay': 'Sandy clay',
    'silty clay': 'Silty clay',
    clay: 'Clay (heavy, sticky)',
  },
  es: {
    sand: 'Arenosa (se seca rápido)',
    'loamy sand': 'Arena franca (ligera)',
    'sandy loam': 'Franco arenosa',
    loam: 'Tierra franca (pareja)',
    'silt loam': 'Franco limosa (guarda agua)',
    silt: 'Limosa',
    'sandy clay loam': 'Franco arcillo-arenosa',
    'clay loam': 'Franco arcillosa (barrial)',
    'silty clay loam': 'Franco arcillo-limosa',
    'sandy clay': 'Arcillo-arenosa',
    'silty clay': 'Arcillo-limosa',
    clay: 'Arcillosa (pesada / barro)',
  },
};

export function getTextureLabel(texture: TextureClass, locale: Locale = 'en'): string {
  return TEXTURE_LABELS_I18N[locale][texture] ?? texture;
}

export function getCropName(crop: Crop, locale: Locale = 'en'): string {
  return locale === 'en' ? crop.nameEn : crop.name;
}

interface CropTextEn {
  notes: string;
  keyRisks: string[];
  priceSource?: string;
}

export const CROP_TEXT_EN: Record<string, CropTextEn> = {
  corn: {
    notes: 'Needs plenty of fertilizer and water at tasseling/silking — very sensitive to >35 °C heat or dry spells then.',
    keyRisks: ['Corn rootworm / armyworm if grown back-to-back', 'Ear mold toxins when hot and dry at grain fill', 'Leaf blight in humid summers'],
  },
  wheat: {
    notes: 'Cool-season grain: makes good use of winter moisture and leaves protective straw on the field.',
    keyRisks: ['Stripe or leaf rust in cool, damp springs', 'Heat damage during grain fill', 'Head blight if planted directly into heavy corn stalks'],
  },
  sorghum: {
    notes: 'Handles heat and drought well; can pause during dry spells and recover when rain returns.',
    keyRisks: ['Sugarcane aphid outbreaks', 'Bird damage near harvest', 'Head mold in cool, wet flowering weather'],
  },
  cotton: {
    notes: 'Handles heat and moderate salt well, but needs a long warm season and leaves little ground cover afterward.',
    keyRisks: ['Bollworm and boll weevil pressure', 'Root rot in high-lime soils', 'Ups and downs in fiber prices'],
  },
  soybean: {
    notes: 'Makes its own nitrogen from air and helps break corn rootworm and stalk pest cycles.',
    keyRisks: ['Soybean cyst nematode if planted too often', 'Rust or white mold in damp weather', 'Prices tied closely to export markets'],
  },
  alfalfa: {
    notes: 'Lasts 3–5 years per planting. Builds great soil health and nitrogen, but drinks lots of summer water.',
    keyRisks: ['Heavy water demand in hot summer months', 'Alfalfa weevil and aphids', 'Root rot in standing water'],
  },
  safflower: {
    notes: 'Deep taproot pulls leftover subsoil moisture; classic low-irrigation winter/spring option.',
    keyRisks: ['Leaf spot and rust if rain hits during bloom', 'Smaller local buyer market (contracts help)', 'Root trouble in flooded soil'],
  },
  pecan: {
    notes: 'Long-term orchard tree with high value and high summer water use; needs moderate winter chill.',
    keyRisks: ['Takes 6–8 years before full nut harvest', 'Very high summer water demand', 'Late spring frost at budbreak and alternate-year yields'],
  },
  apple: {
    notes: 'High-value fruit orchard with heavy startup cost; warmer winters can lower needed chill hours.',
    keyRisks: ['Needs 800–1,000 winter chill hours', 'Spring bloom frost and hail risk', 'Codling moth and fire blight'],
  },
  tomato: {
    notes: 'High-value, high-cost vegetable crop; drip tape irrigation greatly boosts yield and saves water.',
    keyRisks: ['Needs a processor or buyer contract ahead of planting', 'Flower drop when nights stay >22 °C or days >34 °C', 'Viruses and root nematodes in tight rotations'],
  },
  drybean: {
    notes: 'Short season and modest water needs; works well with seasonal rain or as a second short crop.',
    keyRisks: ['Very sensitive to salty soil and bloom heat', 'Leaf blight in wet weather', 'Local buyer prices swing season to season'],
  },
  chickpea: {
    notes: 'Cool-season legume that finishes on stored winter moisture with very little water.',
    keyRisks: ['Ascochyta blight in wet winters', 'Often sold into export markets', 'Root rot in poorly drained soil'],
  },
  barley: {
    notes: 'Most salt-tolerant small grain; shorter season than wheat and saves irrigation water.',
    keyRisks: ['Malting buyers require a contract and lower nitrogen', 'Rust and net blotch', 'Lodging (falling over) with too much fertilizer'],
  },
  'oats-forage': {
    notes: 'Fast, low-cost winter hay or forage that covers bare soil during windy months.',
    keyRisks: ['Crown rust in mild damp weather', 'High nitrates in hay after severe drought', 'Local hay demand varies'],
    priceSource: 'USDA NASS non-alfalfa hay reference 2024 (~150 USD/t)',
  },
  sunflower: {
    notes: 'Deep taproot reaches leftover water and nutrients deep in the soil profile.',
    keyRisks: ['Bird feeding near maturity', 'Stalk/head rot in damp weather', 'Fewer local oilseed crush buyers in some areas'],
  },
  canola: {
    notes: 'Brassica broadleaf crop that breaks small-grain diseases and leaves cleaner fields behind.',
    keyRisks: ['Hot weather at flowering hurts pod set', 'Aphids and diamondback moth', 'Check distance to nearest oilseed buyer'],
  },
  'sorghum-sudan': {
    notes: 'Fast summer forage producing lots of feed per inch of water, with multiple cuttings.',
    keyRisks: ['Prussic acid risk if grazed right after frost or drought', 'Nitrate buildup with heavy fertilizer', 'Sugarcane aphid pressure'],
    priceSource: 'USDA NASS non-alfalfa hay reference 2024',
  },
  'triticale-forage': {
    notes: 'Hardy winter forage grain that handles freezes well and protects winter ground.',
    keyRisks: ['Ergot in humid bloom', 'Local forage demand', 'Feed quality depends on cutting at the right stage'],
    priceSource: 'USDA NASS non-alfalfa hay reference 2024',
  },
  millet: {
    notes: 'Lowest water grain in the list; finishes fast in 60–90 days when rain or water is short.',
    keyRisks: ['Specialty/birdseed market (check buyer first)', 'Wind shatter when dry', 'Slow early growth against weeds'],
    priceSource: 'USDA NASS proso millet price received 2023 (reference)',
  },
  peanut: {
    notes: 'Summer legume that pairs well with cotton on loose sandy soils.',
    keyRisks: ['Needs loose sandy ground for digging', 'Mold risk if late season turns hot and dry', 'Needs specialized digging and harvest gear'],
  },
  'perennial-grass': {
    notes: 'Long-term pasture or hay cover suited to steep slopes or fields with very limited water.',
    keyRisks: ['Slow to establish in dry years', 'Needs rotational grazing or hay management', 'Lower cash profit per hectare than row crops'],
    priceSource: 'USDA NASS non-alfalfa hay reference 2024',
  },
  'cover-rye': {
    notes: 'Catches leftover fertilizer, blocks wind and rain washout, and adds lots of organic mulch.',
    keyRisks: ['Can drink spring moisture before planting in dry areas', 'Ties up nitrogen briefly if killed too late', 'Terminate 2–3 weeks before planting next cash crop'],
    priceSource: 'Soil-building cover crop (no direct cash sale; grazable forage value)',
  },
  'cover-legume': {
    notes: 'Adds free nitrogen (50–100 kg/ha) for the next crop and loosens topsoil.',
    keyRisks: ['Higher seed cost than rye', 'Needs ~2 mild months in fall to get started', 'Watch root-knot nematodes on sandy ground'],
    priceSource: 'Soil-building cover crop (no direct cash sale)',
  },
  'cover-summer-mix': {
    notes: 'Mixed deep and shallow roots build quick summer ground cover after winter grain.',
    keyRisks: ['Needs enough summer rain or moisture to sprout', 'Cut or terminate before weeds/cover go to seed'],
    priceSource: 'Soil-building cover crop (no direct cash sale)',
  },
  fallow: {
    notes: 'Field left resting with no plants; saves a little moisture but leaves soil exposed to wind and rain.',
    keyRisks: ['Bare topsoil blows away or washes in storms', 'Gradual loss of organic matter', 'Weeds must still be controlled'],
    priceSource: 'Weed-control cost only',
  },
};

export function getCropNotes(crop: Crop, locale: Locale = 'en'): string {
  if (locale === 'en') return CROP_TEXT_EN[crop.id]?.notes ?? crop.notes;
  return crop.notes;
}

export function getCropRisks(crop: Crop, locale: Locale = 'en'): string[] {
  if (locale === 'en') return CROP_TEXT_EN[crop.id]?.keyRisks ?? crop.pest.keyRisks;
  return crop.pest.keyRisks;
}

export function getCropPriceSource(crop: Crop, locale: Locale = 'en'): string {
  if (locale === 'en') {
    const enCustom = CROP_TEXT_EN[crop.id]?.priceSource;
    if (enCustom) return enCustom;
    if (crop.market.priceSource.startsWith('USDA NASS')) return crop.market.priceSource;
    return `Reference benchmark (${crop.market.priceYear})`;
  }
  return crop.market.priceSource;
}

export function getCropByIdSafe(id: string, catalog?: Crop[]): Crop | undefined {
  return catalog?.find((c) => c.id === id) ?? CROP_BY_ID[id];
}

// ── Pilot parcels EN localization ────────────────────────────────────────────

interface PilotTextEn {
  name: string;
  country: string;
  climateTag: string;
  summary: string;
}

export const PILOT_TEXT_EN: Record<string, PilotTextEn> = {
  'delicias-mx': {
    name: 'Delicias Valley, Chihuahua',
    country: 'Mexico',
    climateTag: 'Semi-arid irrigated · tight water supply',
    summary: 'Warm irrigated valley with low summer rain and heavy pressure on reservoirs and well water.',
  },
  'lubbock-tx': {
    name: 'High Plains (Lubbock), Texas',
    country: 'USA',
    climateTag: 'Semi-arid · Ogallala aquifer dropping',
    summary: 'Frequent back-to-back cotton with winter blowing dust risk and falling well water levels.',
  },
  'ames-ia': {
    name: 'Corn Belt (Ames), Iowa',
    country: 'USA',
    climateTag: 'Temperate sub-humid · rainfed',
    summary: 'Deep fertile soils with heavy spring storms; strong fit for winter cover crops to stop soil & nitrogen washout.',
  },
  'fresno-ca': {
    name: 'Central Valley (Fresno), California',
    country: 'USA',
    climateTag: 'Warm Mediterranean · regulated pumping',
    summary: 'Dry, hot summers with strict pumping limits and salt buildup risks where leaching is low.',
  },
  'yaqui-mx': {
    name: 'Yaqui Valley (Cd. Obregón), Sonora',
    country: 'Mexico',
    climateTag: 'Warm arid · winter/summer rotation',
    summary: 'Traditional wheat valley facing dam limits and heat waves; shorter crops like safflower or chickpea save water.',
  },
  'cuauhtemoc-mx': {
    name: 'Apple Highlands (Cuauhtémoc), Chihuahua',
    country: 'Mexico',
    climateTag: 'Cool highlands (2,060 m) · late spring frost',
    summary: 'High-elevation apple orchards facing spring bloom freezes and fewer winter chill hours.',
  },
};

export function localizePilot(pilot: PilotParcel, locale: Locale = 'en'): PilotParcel {
  if (locale !== 'en') return pilot;
  const en = PILOT_TEXT_EN[pilot.id];
  if (!en) return pilot;
  return { ...pilot, ...en };
}

// ── Aquifer notes EN ─────────────────────────────────────────────────────────

export const AQUIFER_NOTES_EN: Record<string, { name: string; note: string }> = {
  'Ogallala / High Plains': {
    name: 'Ogallala / High Plains Aquifer (USA)',
    note: 'Satellite gravity readings (GRACE) and local wells show steady groundwater decline across the southern & central High Plains.',
  },
  'Valle Central': {
    name: 'California Central Valley (USA)',
    note: 'GRACE satellites show long-term groundwater overuse during dry multi-year spells (check local SGMA pumping rules).',
  },
  'Cuencas del Norte': {
    name: 'Northern Mexico Basins (Chihuahua / Coahuila / Sonora)',
    note: 'High regional water stress on dams and farm wells reported by GRACE satellites and basin water balances.',
  },
  'Bajío': {
    name: 'Bajio & Central Mexico',
    note: 'Heavy groundwater pumping across Bajio and Lerma-Chapala valleys reported by GRACE satellites and well gauges.',
  },
  'Corn Belt': {
    name: 'U.S. Corn Belt / Midwest',
    note: 'Regional groundwater levels look stable overall; main issues here are spring drainage, storm runoff, and fertilizer washout.',
  },
  'Indo': {
    name: 'Indus Basin / NW India & Pakistan',
    note: 'One of the sharpest regional groundwater drops tracked worldwide by GRACE satellites.',
  },
  'China': {
    name: 'North China Plain',
    note: 'Long-term drop in deep groundwater reserves tracked by GRACE satellites.',
  },
  'Murray': {
    name: 'Murray–Darling Basin (Australia)',
    note: 'Big year-to-year swings with steep dry deficits during El Niño years in GRACE data.',
  },
};

// ── Plain-language English glossary ──────────────────────────────────────────

export const GLOSSARY_EN: Record<string, GlossaryEntry> = {
  et0: {
    term: 'Reference water pull (ET₀)',
    short: 'How much water sun, heat, and wind pull out of a well-watered green field.',
    detail: 'Combines sunshine, temperature, humidity, and wind to estimate daily or monthly water evaporation and crop thirst.',
    example: 'An ET₀ of 180 mm/month equals 180 liters per m² of water pulled by warm dry air.',
  },
  etc: {
    term: 'Crop water need (ETc)',
    short: 'How much water a specific crop actually uses from planting to harvest.',
    detail: 'Calculated by scaling ET₀ according to crop growth stage — low at sprouting, highest at flowering and grain fill.',
  },
  'water-balance': {
    term: 'Water balance',
    short: 'Water coming in (rain + irrigation) minus water going out (crop thirst).',
    detail: 'When rain and stored soil moisture fall short of crop thirst, the gap must be filled by irrigation or yields drop.',
  },
  aridity: {
    term: 'Dryness index (Rain / ET₀)',
    short: 'Compares yearly rain against yearly sun and air drying power.',
    detail: 'Under 0.20 means very dry desert/arid ground; 0.20–0.50 semi-arid (needs irrigation); above 0.65 humid rainfed.',
  },
  ndvi: {
    term: 'Greenness index (NDVI)',
    short: 'Satellite score of how green and thick plant cover is (0 to 1).',
    detail: 'Measures red vs. infrared light bounced off leaves. Values below 0.25 usually mean bare ground or dry stubble; above 0.55 means thick green growth.',
  },
  'bare-soil': {
    term: 'Bare ground months',
    short: 'Months when the field sits uncovered with no living plants or thick stubble.',
    detail: 'During bare months, sun bakes topsoil, storms wash away fertile dirt, and wind blows dust across open ground.',
  },
  'soil-moisture': {
    term: 'Soil wetness vs. normal',
    short: 'Whether topsoil is wetter or drier than usual for this time of year.',
    detail: 'Compares recent satellite and weather readings against the 5-year normal for the same month.',
  },
  'soil-wetness': {
    term: 'Topsoil wetness (GWETTOP)',
    short: 'How wet the top ~5 cm of dirt is right now (0 = bone dry, 1 = soaked).',
    detail: 'Estimated from weather + satellite assimilation; helpful as a regional guide before fieldwork.',
  },
  awc: {
    term: 'Water-holding sponge (AWC)',
    short: 'How much plant-usable water your dirt holds per meter of depth.',
    detail: 'Loamy soil with good organic matter holds 140–200 mm/m like a sponge; pure sand holds under 90 mm/m and dries fast.',
  },
  om: {
    term: 'Soil organic matter (OM)',
    short: 'Dark broken-down plant roots and compost that feed soil and hold moisture.',
    detail: 'More organic matter helps rain soak in, feeds crops slowly, and stops crusting and washout.',
  },
  'k-factor': {
    term: 'Washout risk (K factor)',
    short: 'How easily dirt particles break loose and wash away in heavy rain.',
    detail: 'Silty soils low in organic matter wash away easiest and benefit most from cover crops or stubble.',
  },
  rusle: {
    term: 'Estimated soil washout (RUSLE)',
    short: 'Rough yearly estimate of fertile topsoil lost to rain runoff (tons/ha/yr).',
    detail: 'Combines storm intensity, soil type, hill slope, and ground cover. Values above 5–10 t/ha/yr signal slow soil loss.',
  },
  'frost-risk': {
    term: 'Frost risk',
    short: 'Chance of freezing temperatures (≤ 0 °C) while a crop is growing or blooming.',
    detail: 'Counts freezing nights per month. A late spring freeze during bloom can do far more damage than an early winter chill.',
  },
  'heat-stress': {
    term: 'Heat shock days',
    short: 'Hot afternoons that can sterilize pollen, drop flowers, or shrink grain size.',
    detail: 'Each crop has its own limit (around 35 °C for corn, 34 °C for tomatoes). Dry bare ground also runs hotter than air.',
  },
  'chill-hours': {
    term: 'Winter chill hours',
    short: 'Hours between 0 and 7.2 °C in winter that fruit and nut trees need to wake up.',
    detail: 'Apples and pecans need enough cold winter rest to bloom evenly in spring.',
  },
  'n-fixation': {
    term: 'Natural nitrogen (legumes)',
    short: 'Ability of beans, alfalfa, chickpeas, and vetch to pull fertilizer from the air.',
    detail: 'Friendly root bacteria turn air nitrogen into plant food and leave extra fertility for the next year’s grain.',
  },
  biomass: {
    term: 'Residue & plant bulk (biomass)',
    short: 'Dry weight of stalks, leaves, and roots grown on the field.',
    detail: 'Leaving stalks or growing cover crops shields topsoil from sun and wind and builds darker, richer dirt.',
  },
  gdd: {
    term: 'Growing heat clock (GDD)',
    short: 'Counts useful warm days above a crop’s base temperature until maturity.',
    detail: 'Helps match planting month and harvest length to your local spring, summer, or winter temperatures.',
  },
  ky: {
    term: 'Drought yield drop (Ky)',
    short: 'How fast a crop loses yield when water runs short.',
    detail: 'High numbers (> 1, like corn) lose yield fast in dry spells; lower numbers (< 0.9, like sorghum) hold up much better.',
  },
  monoculture: {
    term: 'Repeating the same crop',
    short: 'Growing the same plant family year after year in the same dirt.',
    detail: 'Lets root worms, diseases, and tough weeds build up. Switching families (like grain followed by beans) breaks that cycle.',
  },
  grace: {
    term: 'Basin groundwater trend (GRACE)',
    short: 'Satellites that weigh big regional changes in underground water.',
    detail: 'Tracks entire river basins (~300 km wide), not individual wells — always check your own well depth locally.',
  },
  harmonization: {
    term: 'Matching different map scales',
    short: 'Lines up wide weather grids with field-level soil and slope maps on one calendar.',
    detail: 'Weather satellites measure ~50 km squares while soil/slope maps zoom to 10–250 m. We line them up transparently and label each source.',
  },
};

export function getGlossary(locale: Locale = 'en'): Record<string, GlossaryEntry> {
  return locale === 'en' ? GLOSSARY_EN : GLOSSARY;
}

// ── 34-Source Metadata EN ────────────────────────────────────────────────────

interface SourceTextEn {
  name?: string;
  description: string;
  usedFor: string;
  temporalResolution: string;
  coverage: string;
  limitations: string;
}

export const SOURCE_TEXT_EN: Record<SourceId, SourceTextEn> = {
  'nasa-power': {
    description: 'Daily and monthly weather records derived from NASA satellites and solar radiation sensors.',
    usedFor: 'Daily/monthly temperature, rainfall, sunlight, humidity, wind, topsoil wetness, frost/heat days, and 30-year climate trends.',
    temporalResolution: 'Daily (2016–2025) & monthly (1995–2025)',
    coverage: 'Global',
    limitations: 'Its ~55 km grid smooths out localized storms, frost pockets in low spots, and narrow valley weather.',
  },
  smap: {
    description: 'Satellite radar/radiometer measuring moisture in the top 5 cm of soil.',
    usedFor: 'Checks recent satellite passes over your area and displays the topsoil moisture map overlay.',
    temporalResolution: 'Every 2–3 days (L3) / 3-hourly (L4)',
    coverage: 'Global (±85°)',
    limitations: 'Measures only the top 5 cm and loses accuracy under thick crops or frozen ground; raw numeric grids need Earthdata login.',
  },
  'gpm-imerg': {
    description: 'Combined satellite rainfall estimate tracking storm rain rates worldwide.',
    usedFor: 'Checks daily rainfall granule availability and shows recent storm rain layers on the map.',
    temporalResolution: '30-min / daily',
    coverage: 'Global (±60°)',
    limitations: 'Daily rainfall totals in the calculator come from NASA POWER + ERA5; IMERG provides map visuals and availability.',
  },
  landsat: {
    description: '30 m field-scale optical satellite imagery for crop vigor and bare soil checks.',
    usedFor: 'Verifies recent cloud-free HLS Landsat/Sentinel-2 scenes available over your field.',
    temporalResolution: 'Every 8–16 days (paired with Sentinel-2)',
    coverage: 'Global',
    limitations: 'Blocked by clouds; downloading full multi-band files requires Earthdata login.',
  },
  modis: {
    description: '16-day greenness (NDVI at 250 m) and 8-day daytime soil heat (1 km).',
    usedFor: 'Builds the seasonal greenness curve, spots bare-soil months, checks ground heat, and powers map overlays.',
    temporalResolution: '16-day (NDVI) / 8-day (LST)',
    coverage: 'Global',
    limitations: 'A 250 m pixel (~6.25 ha) can blend neighboring fields, dirt roads, or ditch edges on small plots.',
  },
  viirs: {
    description: 'Follow-on vegetation greenness and land heat satellite continuing MODIS.',
    usedFor: 'Checks recent seasonal vegetation record availability in NASA CMR.',
    temporalResolution: '8–16 days',
    coverage: 'Global',
    limitations: 'Coarse 375–500 m pixel size; seasonal greenness graph relies on 250 m MODIS.',
  },
  ecostress: {
    name: 'NASA ECOSTRESS (International Space Station)',
    description: 'High-detail 70 m ground heat and crop water-stress thermal sensor.',
    usedFor: 'Checks recent ISS thermal overpasses available for your location.',
    temporalResolution: 'Irregular (3–5 days)',
    coverage: 'Global (±52°)',
    limitations: 'Pass times shift (including night passes); full raw thermal downloads require Earthdata/AppEEARS.',
  },
  srtm: {
    description: 'Global 30 m terrain elevation map used to measure height and hill slope.',
    usedFor: 'Field elevation, percent slope measured across a 5-point cross, and storm runoff washout index.',
    temporalResolution: 'Static',
    coverage: 'Global (60°N – 56°S)',
    limitations: 'Captures year-2000 surface height (including trees/barns); laser-leveled fields may be flatter.',
  },
  grace: {
    description: 'Gravity satellites tracking broad underground water gains or losses across river basins.',
    usedFor: 'Regional aquifer decline context and recent GRACE data check.',
    temporalResolution: 'Monthly',
    coverage: 'Global',
    limitations: 'Very wide ~300 km footprint: shows overall basin trend, not the water depth in a single well.',
  },
  gldas: {
    description: 'Global land water model combining weather inputs with satellite data.',
    usedFor: 'Checks monthly hydrology dataset availability in NASA CMR.',
    temporalResolution: 'Monthly / 3-hourly',
    coverage: 'Global',
    limitations: '25 km grid size; water-balance math in Field Shift uses NASA POWER and ERA5-Land.',
  },
  nldas: {
    description: 'Higher-detail North American soil moisture and water-balance model.',
    usedFor: 'Checks monthly NLDAS dataset availability across North America.',
    temporalResolution: 'Hourly / monthly',
    coverage: 'North America (25°–53°N)',
    limitations: 'Covers northern/central Mexico, USA, and southern Canada only.',
  },
  gedi: {
    description: 'Space-based laser measuring tree height and canopy structure.',
    usedFor: 'Checks nearby laser footprints for orchards or tree-crop parcels.',
    temporalResolution: 'Orbit tracks (2019–present)',
    coverage: '±51.6° latitude',
    limitations: 'Measures narrow laser lines, not wall-to-wall coverage across every annual field.',
  },
  'sentinel-2': {
    description: 'High-detail 10–20 m European optical imagery revisiting every 5 days.',
    usedFor: 'Live count of recent low-cloud (<20%) images available over your parcel.',
    temporalResolution: '5 days',
    coverage: 'Global',
    limitations: 'Shows scene availability and cloud percentage rather than pixel-by-pixel downloads in the browser.',
  },
  era5: {
    name: 'ECMWF ERA5-Land (via Open-Meteo Archive)',
    description: 'Detailed 9 km land weather dataset with crop water demand and topsoil moisture.',
    usedFor: 'Calibrates evaporation accuracy, tracks recent 24-month soil moisture anomalies, and cross-checks NASA POWER.',
    temporalResolution: 'Daily (last 5 years)',
    coverage: 'Global',
    limitations: 'Trails real time by ~5 days and still averages weather over ~9 km squares.',
  },
  ssurgo: {
    description: 'Detailed U.S. county field-by-field soil survey.',
    usedFor: 'Soil texture (% sand/clay/silt), organic matter, water-holding capacity, pH, salt level (EC), and drainage.',
    temporalResolution: 'Static (NRCS updated)',
    coverage: 'United States (CONUS)',
    limitations: 'Available only inside the U.S.; outside the U.S. Field Shift uses ISRIC SoilGrids (250 m).',
  },
  statsgo2: {
    description: 'Broader state-level U.S. soil map where SSURGO is unmapped.',
    usedFor: 'Automatic backup inside the U.S. when detailed SSURGO polygons are missing.',
    temporalResolution: 'Static',
    coverage: 'United States',
    limitations: 'Less field detail than SSURGO; confirm with a local soil lab sample.',
  },
  wss: {
    description: 'Official USDA interactive website for local soil reports.',
    usedFor: 'Reference link to inspect your exact parcel boundaries and county soil notes manually.',
    temporalResolution: 'Static',
    coverage: 'United States & territories',
    limitations: 'Interactive web portal without a direct PDF report API; numeric values load from SSURGO.',
  },
  soilgrids: {
    description: 'Global 250 m digital soil map (clay, sand, organic carbon, pH).',
    usedFor: 'Soil properties outside the U.S. (e.g., Mexico, Latin America, worldwide) and backup when SSURGO is missing.',
    temporalResolution: 'Static',
    coverage: 'Global',
    limitations: 'Statistical global map with wider uncertainty than U.S. SSURGO; does not report salt (EC) or hardpan.',
  },
  cdl: {
    description: 'Annual U.S. satellite crop map showing what grew on every 30 m pixel.',
    usedFor: '5-year crop history (2021–2025) at your pin, back-to-back crop checks, and optional US crop map layer.',
    temporalResolution: 'Annual (2008–2025)',
    coverage: 'United States (CONUS)',
    limitations: 'Covers the continental U.S. only and has occasional classification errors on small plots or rare crops.',
  },
  'nass-quickstats': {
    description: 'Official USDA annual crop prices received by growers, acreage, and yields.',
    usedFor: 'Optional live price refresh in `/api/crops` when `NASS_API_KEY` is configured; otherwise uses built-in 2023–2024 prices.',
    temporalResolution: 'Annual / Monthly',
    coverage: 'United States',
    limitations: 'Needs a free `NASS_API_KEY` for live updates; adjust prices to match your local buyer.',
  },
  'ams-market-news': {
    description: 'Weekly wholesale elevator, hay, and vegetable market price reports.',
    usedFor: 'Market benchmark context; you can edit any crop price directly in Step 5.',
    temporalResolution: 'Daily / Weekly',
    coverage: 'United States',
    limitations: 'Real prices vary by grade, moisture, trucking, and buyer contracts.',
  },
  'ag-data-commons': {
    description: 'USDA open repository of crop rotation and cover-crop field trials.',
    usedFor: 'Reference figures for cover-crop erosion cuts and legume nitrogen carryover.',
    temporalResolution: 'By study',
    coverage: 'Primarily United States',
    limitations: 'Research studies vary by site; always check local extension trials.',
  },
  'fao-gaez': {
    name: 'FAO GAEZ & FAO-56 / FAO-33 Crop Guides',
    description: 'International crop water need (Kc) and drought sensitivity (Ky) standards.',
    usedFor: 'Powers the crop suitability, monthly water balance, and drought yield formulas.',
    temporalResolution: 'Seasonal',
    coverage: 'Global',
    limitations: 'Standard figures assume reasonable pest control and drainage.',
  },
  'usgs-water': {
    description: 'U.S. network of groundwater observation wells with measured water depths.',
    usedFor: 'Finds nearby monitoring wells (<25 km) and multi-year water-level trends.',
    temporalResolution: 'Periodic / continuous',
    coverage: 'United States',
    limitations: 'U.S. only; a nearby monitoring well may tap a different aquifer depth than your irrigation well.',
  },
  nlcd: {
    description: '30 m U.S. land-cover map (cropland, pasture, shrub, forest, town).',
    usedFor: 'Checks surrounding land cover at the chosen point.',
    temporalResolution: 'Every 2–3 years',
    coverage: 'United States (CONUS)',
    limitations: 'U.S. only; shows general land cover rather than specific crop species.',
  },
  naip: {
    description: 'High-detail 0.6 m U.S. aerial farm photography.',
    usedFor: 'Checks recent high-resolution flight availability in Planetary Computer STAC.',
    temporalResolution: 'Every 2–3 years',
    coverage: 'United States (CONUS)',
    limitations: 'U.S. only and captured every few years (not meant for weekly stress checks).',
  },
  prism: {
    description: 'High-resolution U.S. valley-and-mountain weather normals.',
    usedFor: 'Methodological benchmark for local valley and mountain weather differences.',
    temporalResolution: 'Daily / monthly / 30-yr normal',
    coverage: 'United States (CONUS)',
    limitations: 'U.S. only; automated multi-decade series require bulk grid downloads.',
  },
  cocorahs: {
    description: 'Volunteer rain-gauge network run by farmers and weather watchers.',
    usedFor: 'Reminder to check local rain-gauge totals against satellite rainfall estimates.',
    temporalResolution: 'Daily',
    coverage: 'North America',
    limitations: 'Gauge spacing varies widely; keeping your own field rain gauge helps most.',
  },
  openet: {
    name: 'OpenET (NASA / USGS / DRI / EDF)',
    description: 'Field-scale 30 m satellite actual crop water use across western & central U.S.',
    usedFor: 'Adds measured 30 m annual water use when `OPENET_API_KEY` is configured.',
    temporalResolution: 'Monthly / daily',
    coverage: 'Western & central United States',
    limitations: 'Mainly U.S. coverage and requires a free OpenET API key.',
  },
  landfire: {
    description: '30 m vegetation and natural windbreak / grassland boundary map.',
    usedFor: 'Landscape context along field edges and rangeland transitions.',
    temporalResolution: 'Periodic',
    coverage: 'United States',
    limitations: 'Focused on wildland vegetation rather than annual row crops.',
  },
  'copernicus-dem': {
    description: 'Global 30–90 m terrain elevation backup used when SRTM is unavailable.',
    usedFor: 'Automatic elevation & slope backup if OpenTopoData SRTM times out.',
    temporalResolution: 'Static',
    coverage: 'Global',
    limitations: 'Backup terrain model; fine laser-grading or raised beds do not show up at 30–90 m.',
  },
  'fieldshift-baseline': {
    name: 'Field Shift — Backup weather & soil model',
    description: 'Transparent backup estimate used only if live weather/soil services are offline.',
    usedFor: 'Keeps the tool working smoothly if an external service drops; always labeled as an estimate.',
    temporalResolution: 'Seasonal',
    coverage: 'Global',
    limitations: 'NOT a field measurement — check soil and weather locally when active.',
  },
  'fieldshift-catalog': {
    name: 'Field Shift Crop & Practice Guide (FAO / USDA)',
    description: 'Structured guide to 25 crops and cover crops with heat, water, nitrogen, soil, and budget benchmarks.',
    usedFor: 'Scores crop suitability, water/nitrogen balance, pest breaks, and editable farm budgets.',
    temporalResolution: 'Per crop season',
    coverage: 'Customizable per farm',
    limitations: 'Prices and yields are starting benchmarks; edit them in Step 5 to match your local buyer.',
  },
  'user-input': {
    name: 'Farmer knowledge & field setup',
    description: 'Your current crop, prior rotations, irrigation system, water budget, gear, and farm goals.',
    usedFor: 'Filters out impractical crops and ranks rotation options around what matters most to you.',
    temporalResolution: 'Live input',
    coverage: 'Your field',
    limitations: 'Recommendations are only as realistic as the water limits, irrigation gear, and local prices entered.',
  },
};

export function getSourceMeta(id: SourceId, locale: Locale = 'en'): SourceMeta {
  const base = SOURCES[id];
  if (locale !== 'en') return base;
  const en = SOURCE_TEXT_EN[id];
  if (!en) return base;
  return {
    ...base,
    name: en.name ?? base.name,
    description: en.description,
    usedFor: en.usedFor,
    temporalResolution: en.temporalResolution,
    coverage: en.coverage,
    limitations: en.limitations,
  };
}
