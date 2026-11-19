import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Droplets,
  SlidersHorizontal,
  Tractor,
  Wand2,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  MAIN_CROPS,
  getCategoryLabel,
  getCropName,
  getEquipmentLabel,
} from '@fieldshift/core';
import type {
  Crop,
  CropCategory,
  CropSuitabilityRow,
  Equipment,
  FarmerInputs,
  IrrigationSystem,
  Locale,
  Priorities,
  PriorityKey,
  SiteProfile,
} from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';
import { DetailsToggle } from './ui/DetailsToggle';

interface Props {
  site: SiteProfile;
  catalog: Crop[];
  farmer: FarmerInputs;
  cropTable: CropSuitabilityRow[];
  onChange: (next: FarmerInputs) => void;
  onContinue: () => void;
}

const PRIORITY_PRESETS: { labelEn: string; labelEs: string; values: Priorities }[] = [
  { labelEn: 'Balanced mix', labelEs: 'Un poco de todo', values: { water: 4, soil: 4, income: 3, forage: 1, resilience: 4 } },
  { labelEn: 'Save water', labelEs: 'Gastar menos agua', values: { water: 5, soil: 4, income: 2, forage: 1, resilience: 5 } },
  { labelEn: 'Build soil health', labelEs: 'Cuidar y abonar la tierra', values: { water: 3, soil: 5, income: 2, forage: 2, resilience: 5 } },
  { labelEn: 'Top profit', labelEs: 'Sacar mejor ganancia', values: { water: 2, soil: 2, income: 5, forage: 0, resilience: 3 } },
  { labelEn: 'Hay & livestock feed', labelEs: 'Tener pastura para ganado', values: { water: 3, soil: 4, income: 2, forage: 5, resilience: 4 } },
];

const SIMPLE_PRIORITIES: {
  key: PriorityKey;
  labelEn: string;
  hintEn: string;
  labelEs: string;
  hintEs: string;
}[] = [
  {
    key: 'water',
    labelEn: 'Save water',
    hintEn: 'Favors crops that drink less water or ride out dry spells.',
    labelEs: 'Ahorrar agua',
    hintEs: 'Prefiere cultivos que ocupan poca agua o resisten sequía.',
  },
  {
    key: 'soil',
    labelEn: 'Protect soil & build natural fertilizer',
    hintEn: 'Favors crops that cover bare ground and add free nitrogen.',
    labelEs: 'Cuidar la tierra y dar abono natural',
    hintEs: 'Prefiere plantas que tapan el suelo y fijan abono.',
  },
  {
    key: 'income',
    labelEn: 'Earn more net profit per hectare',
    hintEn: 'Aims for better take-home return after seed, fertilizer, and water costs.',
    labelEs: 'Ganar más dinero por hectárea',
    hintEs: 'Busca mejor venta descontando costos de semilla, abono y riego.',
  },
  {
    key: 'forage',
    labelEn: 'Produce hay or grazing feed',
    hintEn: 'Boosts alfalfa, oats, sorghum-sudan, and pasture grasses.',
    labelEs: 'Tener pastura / comida para ganado',
    hintEs: 'Da más puntos a alfalfa, avena, sorgo y pastos.',
  },
  {
    key: 'resilience',
    labelEn: 'Cut weather & pest losses',
    hintEn: 'Switches plant families each season to break root pests and weeds.',
    labelEs: 'Evitar pérdidas por clima o plagas',
    hintEs: 'Cambia de familia de planta cada ciclo para cortar plagas.',
  },
];

const SIMPLE_IRRIGATION: {
  id: IrrigationSystem;
  labelEn: string;
  effEn: string;
  noteEn: string;
  labelEs: string;
  effEs: string;
  noteEs: string;
}[] = [
  {
    id: 'none',
    labelEn: 'Rain only (dryland)',
    effEn: 'No irrigation',
    noteEn: 'Relies 100% on rainfall and moisture stored in your soil.',
    labelEs: 'Solo lluvia (temporal)',
    effEs: 'Sin riego',
    noteEs: 'Depende 100 % de lo que llueva y de la humedad que guarde la tierra.',
  },
  {
    id: 'furrow',
    labelEn: 'Flood / furrow irrigation',
    effEn: '~60% efficiency',
    noteEn: 'Some water is lost along ditches and at the tail end.',
    labelEs: 'Riego rodado / surcos',
    effEs: 'Aprovecha ~60 %',
    noteEs: 'Se pierde parte del agua en regaderas y escurrimientos.',
  },
  {
    id: 'sprinkler',
    labelEn: 'Sprinklers',
    effEn: '~75% efficiency',
    noteEn: 'Good coverage, though heavy wind blows and dries some spray.',
    labelEs: 'Aspersión',
    effEs: 'Aprovecha ~75 %',
    noteEs: 'Riega bien, aunque el viento fuerte evapora algo de agua.',
  },
  {
    id: 'pivot',
    labelEn: 'Center pivot',
    effEn: '~85% efficiency',
    noteEn: 'Spreads water evenly across larger fields.',
    labelEs: 'Pivote central',
    effEs: 'Aprovecha ~85 %',
    noteEs: 'Reparte parejo en parcelas grandes.',
  },
  {
    id: 'drip',
    labelEn: 'Drip / micro-tape',
    effEn: '~92% efficiency',
    noteEn: 'Puts water right at the roots with minimal waste.',
    labelEs: 'Goteo / cintilla',
    effEs: 'Aprovecha ~92 %',
    noteEs: 'Lleva el agua directo a la raíz con muy poca pérdida.',
  },
];

const ALL_EQUIPMENT = Object.keys(EQUIPMENT_LABELS) as Equipment[];
const ALL_MARKET_CATS = (Object.keys(CATEGORY_LABELS) as CropCategory[]).filter(
  (c) => c !== 'cover' && c !== 'fallow',
);

function priorityLevelLabel(v: number, locale: Locale): string {
  if (locale === 'en') {
    if (v === 0) return 'Not needed';
    if (v <= 2) return 'Low';
    if (v === 3) return 'Medium';
    if (v === 4) return 'Important';
    return 'Top priority';
  }
  if (v === 0) return 'No me importa';
  if (v <= 2) return 'Poco';
  if (v === 3) return 'Normal';
  if (v === 4) return 'Importante';
  return 'Muy importante';
}

function irrigationTurnsText(mm: number, locale: Locale): string {
  if (locale === 'en') {
    if (mm <= 0) return 'Rainfed only (no irrigation)';
    const turns = Math.max(1, Math.round(mm / 130));
    return `Roughly ${turns} ${turns === 1 ? 'light watering' : 'waterings'} per year`;
  }
  if (mm <= 0) return 'Solo temporal (sin riegos)';
  const turns = Math.max(1, Math.round(mm / 130));
  return `Equivale aprox. a ${turns} ${turns === 1 ? 'riego ligero' : 'riegos'} en todo el año`;
}

export function StepPriorities({ site, catalog, farmer, cropTable, onChange, onContinue }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';

  const mainCrops = catalog.filter((c) => c.role === 'main');
  const feasibleCount = cropTable.filter((r) => {
    const c = catalog.find((x) => x.id === r.cropId);
    return c?.role === 'main' && r.feasible;
  }).length;

  const missingFilters =
    farmer.constraints.equipment.length === 0 || farmer.constraints.marketCategories.length === 0;

  // Local text drafts for numeric inputs so typing/clearing never triggers Range/setEnd cursor errors
  const [haDraft, setHaDraft] = useState(String(farmer.constraints.farmSizeHa));
  const [waterCostDraft, setWaterCostDraft] = useState(String(farmer.constraints.waterCostUsdPer1000m3));
  const [nCostDraft, setNCostDraft] = useState(String(farmer.constraints.nPriceUsdPerKg));

  useEffect(() => {
    setHaDraft(String(farmer.constraints.farmSizeHa));
    setWaterCostDraft(String(farmer.constraints.waterCostUsdPer1000m3));
    setNCostDraft(String(farmer.constraints.nPriceUsdPerKg));
  }, [
    farmer.constraints.farmSizeHa,
    farmer.constraints.waterCostUsdPer1000m3,
    farmer.constraints.nPriceUsdPerKg,
  ]);

  const commitNum = (
    raw: string,
    min: number,
    fallback: number,
    field: 'farmSizeHa' | 'waterCostUsdPer1000m3' | 'nPriceUsdPerKg',
    setDraft: (s: string) => void,
  ) => {
    const parsed = Number(raw);
    const safe = Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
    setDraft(String(safe));
    onChange({
      ...farmer,
      constraints: { ...farmer.constraints, [field]: safe },
    });
  };

  const setPriority = (k: PriorityKey, v: number) => {
    onChange({
      ...farmer,
      priorities: { ...farmer.priorities, [k]: v },
    });
  };

  const togglePrevCrop = (id: string) => {
    const exists = farmer.previousCropIds.includes(id);
    const next = exists
      ? farmer.previousCropIds.filter((x) => x !== id)
      : [id, ...farmer.previousCropIds].slice(0, 3);
    onChange({ ...farmer, previousCropIds: next });
  };

  const toggleEquipment = (eq: Equipment) => {
    const exists = farmer.constraints.equipment.includes(eq);
    const next = exists
      ? farmer.constraints.equipment.filter((x) => x !== eq)
      : [...farmer.constraints.equipment, eq];
    onChange({ ...farmer, constraints: { ...farmer.constraints, equipment: next } });
  };

  const toggleCategory = (cat: CropCategory) => {
    const exists = farmer.constraints.marketCategories.includes(cat);
    const next = exists
      ? farmer.constraints.marketCategories.filter((x) => x !== cat)
      : [...farmer.constraints.marketCategories, cat];
    onChange({ ...farmer, constraints: { ...farmer.constraints, marketCategories: next } });
  };

  const activateAllFilters = () => {
    onChange({
      ...farmer,
      constraints: {
        ...farmer.constraints,
        equipment: [...ALL_EQUIPMENT],
        marketCategories: [...ALL_MARKET_CATS],
      },
    });
  };

  const importFromCdl = () => {
    const ids = site.cropHistory.years
      .map((y) => y.cropId)
      .filter((id): id is string => Boolean(id && MAIN_CROPS.some((c) => c.id === id)));
    if (ids.length === 0) return;
    const latest = ids[ids.length - 1];
    const prev = ids.slice(0, -1).reverse().slice(0, 2);
    onChange({
      ...farmer,
      currentCropId: latest,
      previousCropIds: prev.length > 0 ? prev : [latest],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
        <div>
          <span className="rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 text-xs font-bold text-[#1B3B2B]">
            {isEn ? 'Step 3 of 5 · Your crop & goals' : 'Paso 3 de 5 · Tu siembra y tus metas'}
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#2A2118]">
            {isEn ? 'Tell us what you grow & what matters most' : 'Cuéntanos qué siembras y qué quieres lograr'}
          </h1>
          <p className="mt-0.5 text-sm text-[#524333]">
            {isEn
              ? 'We use this to pick planting options that match your land, gear, and water.'
              : 'Con esto buscamos las opciones que mejor se den en tu tierra y con tu agua.'}
          </p>
        </div>

        <button
          type="button"
          disabled={missingFilters || feasibleCount === 0}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#234E36] px-5 py-3 text-sm font-bold text-[#FAF6EE] shadow-sm transition hover:bg-[#1B3B2B] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
        >
          {isEn
            ? `See planting options (${feasibleCount} crops fit)`
            : `Ver opciones para sembrar (${feasibleCount} cultivos posibles)`}
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>

      {missingFilters && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#A84A28]/50 bg-[#F9EAE3] p-4 text-xs text-[#7A3016]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#A84A28]" />
            <span>
              {isEn ? (
                <>
                  <strong>No gear or buyers checked:</strong> You unchecked all machinery or all crop markets. Turn at least one back on to compare rotations.
                </>
              ) : (
                <>
                  <strong>Faltan opciones activas:</strong> desmarcaste toda la maquinaria o todos los tipos de cultivo para vender. Activa al menos uno o restaura todos para poder comparar opciones.
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={activateAllFilters}
            className="shrink-0 rounded-xl bg-[#A84A28] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#8B3A1D]"
          >
            {isEn ? 'Turn all back on' : 'Activar todo'}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Current crops + Priorities */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-stone-900">
                {isEn
                  ? '1. What do you grow now & what grew here before?'
                  : '1. ¿Qué siembras hoy y qué sembraste antes?'}
              </h2>
              {site.cropHistory.years.some((y) => y.cropId) && (
                <button
                  type="button"
                  onClick={importFromCdl}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {isEn ? 'Fill from past U.S. crop map' : 'Llenar con mapa de años atrás'}
                </button>
              )}
            </div>

            <div className="mt-4">
              <label htmlFor="current-crop" className="block text-xs font-semibold text-stone-700">
                {isEn ? 'Current crop (or last crop harvested)' : 'Cultivo actual (o el último que cosechaste)'}
              </label>
              <select
                id="current-crop"
                value={farmer.currentCropId}
                onChange={(e) => onChange({ ...farmer, currentCropId: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                {mainCrops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {getCropName(c, locale)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-700">
                {isEn
                  ? 'What grew in recent years? (helps check for repeating pests)'
                  : '¿Qué hubo en los ciclos anteriores? (sirve para ver si se repiten plagas)'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mainCrops.map((c) => {
                  const active = farmer.previousCropIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => togglePrevCrop(c.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? 'border-emerald-700 bg-emerald-50 font-semibold text-emerald-900'
                          : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-white'
                      }`}
                    >
                      {c.icon} {getCropName(c, locale)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-700">
                {isEn ? 'How is the ground left after harvest?' : '¿Cómo queda la tierra después de cosechar?'}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    [
                      'bare',
                      isEn ? 'Left bare (fallow)' : 'Queda pelona (descanso)',
                      isEn ? 'No plants until next planting' : 'Sin plantas hasta la otra siembra',
                    ],
                    [
                      'cover',
                      isEn ? 'With cover crop' : 'Con planta de cobertura',
                      isEn ? 'Protects soil and adds organic mulch' : 'Tapa la tierra y da abono',
                    ],
                    [
                      'double-crop',
                      isEn ? 'Second short crop' : 'Segunda siembra corta',
                      isEn ? 'Grow a fast off-season crop' : 'Se siembra otro cultivo corto',
                    ],
                  ] as const
                ).map(([val, title, sub]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onChange({ ...farmer, offSeason: val })}
                    className={`rounded-xl border p-3 text-left transition ${
                      farmer.offSeason === val
                        ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700'
                        : 'border-stone-200 bg-stone-50/60 hover:bg-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-stone-900">{title}</p>
                    <p className="mt-0.5 text-[11px] text-stone-600">{sub}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Priorities */}
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#234E36]" />
              <h2 className="text-sm font-bold text-[#2A2118]">
                {isEn ? '2. What matters most on your farm?' : '2. ¿Qué es lo más importante para ti?'}
              </h2>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRIORITY_PRESETS.map((pr, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onChange({ ...farmer, priorities: { ...pr.values } })}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-emerald-400 hover:bg-emerald-50"
                >
                  {isEn ? pr.labelEn : pr.labelEs}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              {SIMPLE_PRIORITIES.map((item) => {
                const val = farmer.priorities[item.key];
                const label = isEn ? item.labelEn : item.labelEs;
                const hint = isEn ? item.hintEn : item.hintEs;
                return (
                  <div key={item.key}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-stone-800">{label}</span>
                      <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-900">
                        {priorityLevelLabel(val, locale)} ({val}/5)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      aria-label={label}
                      value={val}
                      onChange={(e) => setPriority(item.key, Number(e.target.value))}
                      className="fs-range mt-1.5 w-full"
                    />
                    <p className="mt-0.5 text-[11px] text-stone-500">{hint}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Water + Optional Equipment/Market Details */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                <Droplets className="h-4 w-4 text-sky-700" />
                {isEn ? '3. How do you water & how much do you have?' : '3. ¿Cómo riegas y cuánta agua tienes?'}
              </h2>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...farmer,
                    constraints: { ...farmer.constraints, irrigationSystem: 'none', irrigationMm: 0 },
                  })
                }
                className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                {isEn ? 'Rain only (no irrigation)' : 'Solo lluvia (sin riego)'}
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SIMPLE_IRRIGATION.map((sys) => {
                const active = farmer.constraints.irrigationSystem === sys.id;
                return (
                  <button
                    key={sys.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...farmer,
                        constraints: {
                          ...farmer.constraints,
                          irrigationSystem: sys.id,
                          irrigationMm: sys.id === 'none' ? 0 : Math.max(250, farmer.constraints.irrigationMm),
                        },
                      })
                    }
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-sky-600 bg-sky-50/70 ring-1 ring-sky-600'
                        : 'border-stone-200 bg-stone-50/50 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-stone-900">
                      <span>{isEn ? sys.labelEn : sys.labelEs}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-sky-800">
                        {isEn ? sys.effEn : sys.effEs}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-600">{isEn ? sys.noteEn : sys.noteEs}</p>
                  </button>
                );
              })}
            </div>

            {farmer.constraints.irrigationSystem !== 'none' && (
              <div className="mt-4 rounded-xl bg-stone-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-stone-800">
                    {isEn ? 'Irrigation water available per year' : 'Agua de riego disponible al año'}
                  </span>
                  <span className="font-mono text-sm font-bold text-sky-800">
                    {farmer.constraints.irrigationMm} mm ({irrigationTurnsText(farmer.constraints.irrigationMm, locale)})
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1600}
                  step={25}
                  aria-label={isEn ? 'Irrigation water available' : 'Agua de riego disponible'}
                  value={farmer.constraints.irrigationMm}
                  onChange={(e) =>
                    onChange({
                      ...farmer,
                      constraints: { ...farmer.constraints, irrigationMm: Number(e.target.value) },
                    })
                  }
                  className="fs-range mt-2 w-full"
                />
              </div>
            )}
          </div>

          <DetailsToggle
            title={
              isEn
                ? 'Adjust machinery, buyers & input costs (optional)'
                : 'Ajustar maquinaria, tipo de venta y costos (opcional)'
            }
            subtitle={
              isEn
                ? 'Everything starts turned on. Open this to limit machinery, local buyers, or enter your field size.'
                : 'Ya dejamos todo activado por defecto. Ábrelo si solo siembras ciertos cultivos o quieres poner tu tamaño de parcela.'
            }
            badge={
              isEn
                ? `${farmer.constraints.equipment.length} gear · ${farmer.constraints.marketCategories.length} buyers`
                : `${farmer.constraints.equipment.length} equipos · ${farmer.constraints.marketCategories.length} ventas`
            }
            defaultOpen={missingFilters}
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block min-w-0 text-xs">
                  <span className="font-semibold text-stone-700">
                    {isEn ? 'Field size (ha)' : 'Tamaño parcela (ha)'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={haDraft}
                    onChange={(e) => setHaDraft(e.target.value)}
                    onBlur={() => commitNum(haDraft, 0.5, 1, 'farmSizeHa', setHaDraft)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                </label>
                <label className="block min-w-0 text-xs">
                  <span className="font-semibold text-stone-700">
                    {isEn ? 'Water cost (USD/1000 m³)' : 'Costo agua (USD/1000 m³)'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={waterCostDraft}
                    onChange={(e) => setWaterCostDraft(e.target.value)}
                    onBlur={() => commitNum(waterCostDraft, 0, 0, 'waterCostUsdPer1000m3', setWaterCostDraft)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                </label>
                <label className="block min-w-0 text-xs">
                  <span className="font-semibold text-stone-700">
                    {isEn ? 'Nitrogen price (USD/kg)' : 'Precio abono N (USD/kg)'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={nCostDraft}
                    onChange={(e) => setNCostDraft(e.target.value)}
                    onBlur={() => commitNum(nCostDraft, 0, 0, 'nPriceUsdPerKg', setNCostDraft)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 font-mono text-xs"
                  />
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                    <Tractor className="h-3.5 w-3.5 text-emerald-700" />
                    {isEn ? 'Machinery available (owned or hired)' : 'Maquinaria disponible (propia o rentada)'}
                  </p>
                  <button
                    type="button"
                    onClick={activateAllFilters}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline"
                  >
                    {isEn ? 'Select all' : 'Marcar todo'}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ALL_EQUIPMENT.map((eq) => {
                    const active = farmer.constraints.equipment.includes(eq);
                    return (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => toggleEquipment(eq)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
                          active
                            ? 'border-emerald-700 bg-emerald-50 font-semibold text-emerald-900'
                            : 'border-stone-200 bg-stone-50 text-stone-500'
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {getEquipmentLabel(eq, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-stone-800">
                  {isEn ? 'Crops you can sell locally' : 'Qué puedes vender cerca de tu parcela'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ALL_MARKET_CATS.map((cat) => {
                    const active = farmer.constraints.marketCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
                          active
                            ? 'border-emerald-700 bg-emerald-50 font-semibold text-emerald-900'
                            : 'border-stone-200 bg-stone-50 text-stone-500'
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {getCategoryLabel(cat, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-stone-800">
                <input
                  type="checkbox"
                  checked={farmer.constraints.allowPerennials}
                  onChange={(e) =>
                    onChange({
                      ...farmer,
                      constraints: { ...farmer.constraints, allowPerennials: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                />
                {isEn
                  ? 'Include multi-year crops (alfalfa, pasture grass, pecan, apple)'
                  : 'Incluir cultivos de varios años (alfalfa, pastizal, nogal, manzano)'}
              </label>
            </div>
          </DetailsToggle>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={missingFilters || feasibleCount === 0}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#234E36] px-6 py-3.5 text-sm font-bold text-[#FAF6EE] shadow-sm transition hover:bg-[#1B3B2B] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
        >
          {isEn ? 'See my planting options' : 'Ver mis opciones para sembrar'}
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>
    </div>
  );
}
