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
} from '@fieldshift/core';
import type {
  Crop,
  CropCategory,
  CropSuitabilityRow,
  Equipment,
  FarmerInputs,
  IrrigationSystem,
  Priorities,
  PriorityKey,
  SiteProfile,
} from '@fieldshift/core';
import { DetailsToggle } from './ui/DetailsToggle';

interface Props {
  site: SiteProfile;
  catalog: Crop[];
  farmer: FarmerInputs;
  cropTable: CropSuitabilityRow[];
  onChange: (next: FarmerInputs) => void;
  onContinue: () => void;
}

const PRIORITY_PRESETS: { label: string; values: Priorities }[] = [
  { label: 'Un poco de todo', values: { water: 4, soil: 4, income: 3, forage: 1, resilience: 4 } },
  { label: 'Gastar menos agua', values: { water: 5, soil: 4, income: 2, forage: 1, resilience: 5 } },
  { label: 'Cuidar y abonar la tierra', values: { water: 3, soil: 5, income: 2, forage: 2, resilience: 5 } },
  { label: 'Sacar mejor ganancia', values: { water: 2, soil: 2, income: 5, forage: 0, resilience: 3 } },
  { label: 'Tener pastura para ganado', values: { water: 3, soil: 4, income: 2, forage: 5, resilience: 4 } },
];

const SIMPLE_PRIORITIES: { key: PriorityKey; label: string; hint: string }[] = [
  { key: 'water', label: 'Ahorrar agua', hint: 'Prefiere cultivos que ocupan poca agua o resisten sequía.' },
  { key: 'soil', label: 'Cuidar la tierra y dar abono natural', hint: 'Prefiere plantas que tapan el suelo y fijan abono.' },
  { key: 'income', label: 'Ganar más dinero por hectárea', hint: 'Busca mejor venta descontando costos de semilla, abono y riego.' },
  { key: 'forage', label: 'Tener pastura / comida para ganado', hint: 'Da más puntos a alfalfa, avena, sorgo y pastos.' },
  { key: 'resilience', label: 'Evitar pérdidas por clima o plagas', hint: 'Cambia de familia de planta cada ciclo para cortar plagas.' },
];

const SIMPLE_IRRIGATION: { id: IrrigationSystem; label: string; eff: string; note: string }[] = [
  { id: 'none', label: 'Solo lluvia (temporal)', eff: 'Sin riego', note: 'Depende 100 % de lo que llueva y de la humedad que guarde la tierra.' },
  { id: 'furrow', label: 'Riego rodado / surcos', eff: 'Aprovecha ~60 %', note: 'Se pierde parte del agua en regaderas y escurrimientos.' },
  { id: 'sprinkler', label: 'Aspersión', eff: 'Aprovecha ~75 %', note: 'Riega bien, aunque el viento fuerte evapora algo de agua.' },
  { id: 'pivot', label: 'Pivote central', eff: 'Aprovecha ~85 %', note: 'Reparte parejo en parcelas grandes.' },
  { id: 'drip', label: 'Goteo / cintilla', eff: 'Aprovecha ~92 %', note: 'Lleva el agua directo a la raíz con muy poca pérdida.' },
];

const ALL_EQUIPMENT = Object.keys(EQUIPMENT_LABELS) as Equipment[];
const ALL_MARKET_CATS = (Object.keys(CATEGORY_LABELS) as CropCategory[]).filter(
  (c) => c !== 'cover' && c !== 'fallow',
);

function priorityLevelLabel(v: number): string {
  if (v === 0) return 'No me importa';
  if (v <= 2) return 'Poco';
  if (v === 3) return 'Normal';
  if (v === 4) return 'Importante';
  return 'Muy importante';
}

function irrigationTurnsText(mm: number): string {
  if (mm <= 0) return 'Solo temporal (sin riegos)';
  const turns = Math.max(1, Math.round(mm / 130));
  return `Equivale aprox. a ${turns} ${turns === 1 ? 'riego ligero' : 'riegos'} en todo el año`;
}

export function StepPriorities({ site, catalog, farmer, cropTable, onChange, onContinue }: Props) {
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
            Paso 3 de 5 · Tu siembra y tus metas
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#2A2118]">
            Cuéntanos qué siembras y qué quieres lograr
          </h1>
          <p className="mt-0.5 text-sm text-[#524333]">
            Con esto buscamos las opciones que mejor se den en tu tierra y con tu agua.
          </p>
        </div>

        <button
          type="button"
          disabled={missingFilters || feasibleCount === 0}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-xl bg-[#234E36] px-5 py-3 text-sm font-bold text-[#FAF6EE] shadow-sm transition hover:bg-[#1B3B2B] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
        >
          Ver opciones para sembrar ({feasibleCount} cultivos posibles)
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>

      {missingFilters && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#A84A28]/50 bg-[#F9EAE3] p-4 text-xs text-[#7A3016]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#A84A28]" />
            <span>
              <strong>Faltan opciones activas:</strong> desmarcaste toda la maquinaria o todos los tipos de cultivo para vender.
              Activa al menos uno o restaura todos para poder comparar opciones.
            </span>
          </div>
          <button
            type="button"
            onClick={activateAllFilters}
            className="shrink-0 rounded-xl bg-[#A84A28] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#8B3A1D]"
          >
            Activar todo
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Current crops + Priorities */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-stone-900">1. ¿Qué siembras hoy y qué sembraste antes?</h2>
              {site.cropHistory.years.some((y) => y.cropId) && (
                <button
                  type="button"
                  onClick={importFromCdl}
                  className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Llenar con mapa de años atrás
                </button>
              )}
            </div>

            <div className="mt-4">
              <label htmlFor="current-crop" className="block text-xs font-semibold text-stone-700">
                Cultivo actual (o el último que cosechaste)
              </label>
              <select
                id="current-crop"
                value={farmer.currentCropId}
                onChange={(e) => onChange({ ...farmer, currentCropId: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                {mainCrops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-700">
                ¿Qué hubo en los ciclos anteriores? (sirve para ver si se repiten plagas)
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
                      {c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-stone-700">
                ¿Cómo queda la tierra después de cosechar?
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ['bare', 'Queda pelona (descanso)', 'Sin plantas hasta la otra siembra'],
                    ['cover', 'Con planta de cobertura', 'Tapa la tierra y da abono'],
                    ['double-crop', 'Segunda siembra corta', 'Se siembra otro cultivo corto'],
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
              <h2 className="text-sm font-bold text-[#2A2118]">2. ¿Qué es lo más importante para ti?</h2>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRIORITY_PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => onChange({ ...farmer, priorities: { ...pr.values } })}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-emerald-400 hover:bg-emerald-50"
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              {SIMPLE_PRIORITIES.map(({ key, label, hint }) => {
                const val = farmer.priorities[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-stone-800">{label}</span>
                      <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-900">
                        {priorityLevelLabel(val)} ({val}/5)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      aria-label={label}
                      value={val}
                      onChange={(e) => setPriority(key, Number(e.target.value))}
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
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                <Droplets className="h-4 w-4 text-sky-700" />
                3. ¿Cómo riegas y cuánta agua tienes?
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
                Solo lluvia (sin riego)
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
                      <span>{sys.label}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-sky-800">{sys.eff}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-600">{sys.note}</p>
                  </button>
                );
              })}
            </div>

            {farmer.constraints.irrigationSystem !== 'none' && (
              <div className="mt-4 rounded-xl bg-stone-50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-stone-800">Agua de riego disponible al año</span>
                  <span className="font-mono text-sm font-bold text-sky-800">
                    {farmer.constraints.irrigationMm} mm ({irrigationTurnsText(farmer.constraints.irrigationMm)})
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1600}
                  step={25}
                  aria-label="Agua de riego disponible"
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
            title="Ajustar maquinaria, tipo de venta y costos (opcional)"
            subtitle="Ya dejamos todo activado por defecto. Ábrelo si solo siembras ciertos cultivos o quieres poner tu tamaño de parcela."
            badge={`${farmer.constraints.equipment.length} equipos · ${farmer.constraints.marketCategories.length} ventas`}
            defaultOpen={missingFilters}
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block min-w-0 text-xs">
                  <span className="font-semibold text-stone-700">Tamaño parcela (ha)</span>
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
                  <span className="font-semibold text-stone-700">Costo agua (USD/1000 m³)</span>
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
                  <span className="font-semibold text-stone-700">Precio abono N (USD/kg)</span>
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
                    Maquinaria disponible (propia o rentada)
                  </p>
                  <button
                    type="button"
                    onClick={activateAllFilters}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline"
                  >
                    Marcar todo
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
                        {EQUIPMENT_LABELS[eq]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-stone-800">Qué puedes vender cerca de tu parcela</p>
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
                        {CATEGORY_LABELS[cat]}
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
                Incluir cultivos de varios años (alfalfa, pastizal, nogal, manzano)
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
          Ver mis opciones para sembrar
          <ArrowRight className="h-4 w-4 text-[#D99B26]" />
        </button>
      </div>
    </div>
  );
}
