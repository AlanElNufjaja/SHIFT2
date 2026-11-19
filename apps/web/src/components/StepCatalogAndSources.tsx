import { useState } from 'react';
import {
  BookOpen,
  Database,
  ExternalLink,
  RotateCcw,
  Search,
  Sprout,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  GLOSSARY,
  MONTH_NAMES_ES,
  SOURCES,
} from '@fieldshift/core';
import type {
  ConnectorStatus,
  Crop,
  CropCategory,
  CropSuitabilityRow,
  SiteProfile,
  SourceAgency,
} from '@fieldshift/core';
import { DetailsToggle } from './ui/DetailsToggle';

export type MarketOverrides = Record<
  string,
  { price?: number; potentialYield?: number; costPerHa?: number; priceSource?: string }
>;

interface Props {
  site: SiteProfile;
  catalog: Crop[];
  baseCatalog: Crop[];
  cropTable: CropSuitabilityRow[];
  overrides: MarketOverrides;
  nassStatus?: string;
  onChangeOverrides: (next: MarketOverrides) => void;
}

const STATUS_BADGE: Record<ConnectorStatus, { label: string; cls: string }> = {
  live: { label: 'En vivo', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cached: { label: 'Guardado', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  fallback: { label: 'Estimado', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  unavailable: { label: 'Sin respuesta', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  'not-applicable': { label: 'Otra región', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
  'key-required': { label: 'Opcional', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  reference: { label: 'Referencia', cls: 'bg-stone-50 text-stone-700 border-stone-200' },
};

function suitabilityPlainLabel(score: number): string {
  if (score >= 70) return `Se da muy bien (${score})`;
  if (score >= 45) return `Se da regular (${score})`;
  return `Difícil aquí (${score})`;
}

interface MarketInputProps {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
}

function SafeNumberField({ label, value, onCommit }: MarketInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  const displayed = focused ? draft : String(value);

  const commit = () => {
    setFocused(false);
    const parsed = Number(draft);
    const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setDraft(String(safe));
    onCommit(safe);
  };

  return (
    <label className="block min-w-0">
      <span className="block truncate text-[10px] font-semibold text-stone-600">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={displayed}
        onFocus={() => {
          setDraft(String(value));
          setFocused(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0) {
            onCommit(n);
          }
        }}
        onBlur={commit}
        className="mt-0.5 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-mono text-xs text-stone-900"
      />
    </label>
  );
}

export function StepCatalogAndSources({
  site,
  catalog,
  baseCatalog,
  cropTable,
  overrides,
  nassStatus,
  onChangeOverrides,
}: Props) {
  const [tab, setTab] = useState<'catalog' | 'sources'>('catalog');
  const [cropQuery, setCropQuery] = useState('');
  const [catFilter, setCatFilter] = useState<CropCategory | 'all'>('all');
  const [agencyFilter, setAgencyFilter] = useState<SourceAgency | 'all'>('all');

  const rowMap = new Map(cropTable.map((r) => [r.cropId, r]));

  const filteredCrops = catalog.filter((c) => {
    if (catFilter !== 'all' && c.category !== catFilter) return false;
    const q = cropQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.family.toLowerCase().includes(q) ||
      c.scientific.toLowerCase().includes(q)
    );
  });

  const updateCropMarket = (
    cropId: string,
    field: 'price' | 'potentialYield' | 'costPerHa',
    val: number,
  ) => {
    if (!Number.isFinite(val) || val < 0) return;
    onChangeOverrides({
      ...overrides,
      [cropId]: {
        ...overrides[cropId],
        [field]: val,
        priceSource: 'Precio ajustado por ti',
      },
    });
  };

  const hasOverrides = Object.keys(overrides).length > 0;
  const agencies = Array.from(new Set(Object.values(SOURCES).map((s) => s.agency)));
  const cleanNassStatus = nassStatus ? nassStatus.replace(/\.+$/, '') : '';

  const filteredReports = site.sources.filter((rep) => {
    if (agencyFilter === 'all') return true;
    return SOURCES[rep.id]?.agency === agencyFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header + Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
        <div>
          <span className="rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 text-xs font-bold text-[#1B3B2B]">
            Paso 5 de 5 · Cultivos, precios y origen de la información
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#2A2118]">
            Ajusta precios de tu región o revisa de dónde salen los datos
          </h1>
        </div>

        <div className="inline-flex flex-wrap rounded-xl border border-[#C8B89E] bg-[#EFE5D5] p-1 text-xs">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-bold transition ${
              tab === 'catalog' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
            }`}
          >
            <Sprout className="h-4 w-4" />
            Cultivos y precios ({catalog.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('sources')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-bold transition ${
              tab === 'sources' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
            }`}
          >
            <Database className="h-4 w-4" />
            De dónde salen los datos
          </button>
        </div>
      </div>

      {tab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-4 shadow-card">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={cropQuery}
                onChange={(e) => setCropQuery(e.target.value)}
                placeholder="Buscar cultivo por nombre (ej. maíz, sorgo, frijol)…"
                className="w-full rounded-xl border border-stone-300 py-2 pl-9 pr-3 text-xs focus:border-emerald-700 focus:outline-none"
              />
            </div>

            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value as CropCategory | 'all')}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800"
            >
              <option value="all">Todos los tipos</option>
              {(Object.keys(CATEGORY_LABELS) as CropCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>

            {hasOverrides && (
              <button
                type="button"
                onClick={() => onChangeOverrides({})}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Regresar a precios originales
              </button>
            )}
          </div>

          {cleanNassStatus && (
            <p className="text-xs text-stone-600">
              Precios de referencia: {cleanNassStatus}. Si cambias el precio o rendimiento de un cultivo, las opciones del Paso 4 se actualizan al instante.
            </p>
          )}

          {filteredCrops.length === 0 ? (
            <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-8 text-center shadow-card">
              <p className="text-sm font-bold text-[#2A2118]">
                No encontramos ningún cultivo con ese nombre o filtro.
              </p>
              <p className="mt-1 text-xs text-[#6B5A46]">
                Prueba borrando la búsqueda o cambiando la categoría.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCropQuery('');
                  setCatFilter('all');
                }}
                className="mt-4 rounded-xl bg-[#234E36] px-4 py-2 text-xs font-bold text-[#FAF6EE] hover:bg-[#1B3B2B]"
              >
                Mostrar todos los cultivos
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredCrops.map((c) => {
                const row = rowMap.get(c.id);
                const base = baseCatalog.find((x) => x.id === c.id) ?? c;
                const isEdited = Boolean(overrides[c.id]);

                return (
                  <div
                    key={c.id}
                    className={`min-w-0 rounded-2xl border bg-[#FAF6EE] p-4 shadow-card ${
                      isEdited ? 'border-[#234E36] ring-1 ring-[#234E36]/25' : 'border-[#C8B89E]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-xl">{c.icon}</span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-extrabold text-stone-900">{c.name}</h3>
                          <p className="truncate text-[11px] text-stone-500">Familia: {c.family}</p>
                        </div>
                      </div>

                      {row && (
                        <div className="shrink-0 text-right">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                              row.suitability >= 70
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : row.suitability >= 45
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                            }`}
                          >
                            {suitabilityPlainLabel(row.suitability)}
                          </span>
                          <p className="mt-0.5 text-[10px] text-stone-500">
                            Mejor mes para sembrar: {MONTH_NAMES_ES[row.placement.startMonth]} ({row.placement.months} m)
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Agronomic traits */}
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-2.5 text-[11px]">
                      <div>
                        <span className="text-stone-500">Agua que pide</span>
                        <p className="font-mono font-bold text-stone-800">
                          {c.water.seasonalMm[0]}–{c.water.seasonalMm[1]} mm
                        </p>
                      </div>
                      <div>
                        <span className="text-stone-500">Abono (nitrógeno)</span>
                        <p className="font-mono font-bold text-stone-800">
                          {c.nitrogen.fixer
                            ? `Aporta +${c.nitrogen.fixationKgHa} kg`
                            : `Ocupa ${c.nitrogen.demandKgHa} kg`}
                        </p>
                      </div>
                      <div>
                        <span className="text-stone-500">Rastrojo / raíz</span>
                        <p className="font-mono font-bold text-stone-800">
                          {c.soil.residueTHa} t/ha · {c.soil.rootDepthM} m
                        </p>
                      </div>
                    </div>

                    {/* Inline local market editor — responsive without horizontal clipping */}
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <SafeNumberField
                        label={`Precio (USD/${c.market.unit})`}
                        value={c.market.price}
                        step={5}
                        onCommit={(v) => updateCropMarket(c.id, 'price', v)}
                      />
                      <SafeNumberField
                        label={`Cosecha (${c.market.unit}/ha)`}
                        value={c.market.potentialYield}
                        step={0.2}
                        onCommit={(v) => updateCropMarket(c.id, 'potentialYield', v)}
                      />
                      <SafeNumberField
                        label="Gasto trabajo (USD/ha)"
                        value={c.market.costPerHa}
                        step={25}
                        onCommit={(v) => updateCropMarket(c.id, 'costPerHa', v)}
                      />
                    </div>

                    <p className="mt-2.5 text-[11px] leading-relaxed text-stone-600">{c.notes}</p>
                    <p className="mt-1 text-[10px] text-stone-400">
                      Referencia: {isEdited ? `Editado por ti (original: $${base.market.price})` : c.market.priceSource}
                    </p>
                    {row && row.limiting.length > 0 && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] text-amber-900">
                        Cuidado aquí: {row.limiting.join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'sources' && (
        <div className="space-y-6">
          {/* Plain-Language 3-Step Explanation */}
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-stone-900">
              <BookOpen className="h-4 w-4 text-emerald-700" />
              Cómo juntamos esta información para tu parcela
            </h2>
            <div className="mt-3 grid gap-4 text-xs leading-relaxed text-stone-700 md:grid-cols-3">
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="font-bold text-stone-900">1. Clima y lluvia de tu zona</p>
                <p className="mt-1">
                  Consultamos registros reales de los últimos años de satélites y estaciones (NASA POWER y ERA5) para
                  saber cuánto llueve, cuándo hace helada y cuánto calor quema las flores.
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="font-bold text-stone-900">2. Tierra, pendiente y verdor</p>
                <p className="mt-1">
                  Revisamos si la tierra es arenosa o barrial, cuánta agua guarda, si tiene pendiente para deslave y en
                  qué meses el terreno se ve pelón desde el satélite.
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="font-bold text-stone-900">3. Transparencia total</p>
                <p className="mt-1">
                  Siempre te avisamos cuándo un dato viene directo de satélite o cuándo es solo un estimado regional
                  que necesita revisarse pisando el terreno.
                </p>
              </div>
            </div>
          </div>

          {/* Everyday Spanish Glossary */}
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <h2 className="text-base font-bold text-stone-900">Palabras clave explicadas sencillo</h2>
            <p className="text-xs text-stone-600">
              Qué significa cada palabra que aparece cuando abres los detalles técnicos.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(GLOSSARY).map(([key, g]) => (
                <div key={key} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 text-xs">
                  <p className="font-bold text-stone-900">{g.term}</p>
                  <p className="mt-1 font-medium text-emerald-800">{g.short}</p>
                  <p className="mt-1 leading-relaxed text-stone-600">{g.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Technical 34-Source Audit Table inside DetailsToggle */}
          <DetailsToggle
            title={`Ver tabla técnica de las ${site.sources.length} bases de datos`}
            subtitle="Solo para técnicos o curiosos: estado de conexión en vivo, resolución en metros y limitaciones de cada fuente."
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-stone-600">
                  Estado exacto consultado para <strong>{site.location.name}</strong>.
                </p>
                <select
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value as SourceAgency | 'all')}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800"
                >
                  <option value="all">Todas las agencias ({site.sources.length})</option>
                  {agencies.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-stone-200 text-[11px] uppercase text-stone-500">
                    <tr>
                      <th className="py-2 pr-3">Fuente / Agencia</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2 pr-3">Resolución</th>
                      <th className="py-2 pr-3">Resultado</th>
                      <th className="py-2">Limitación clave</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredReports.map((rep) => {
                      const meta = SOURCES[rep.id];
                      const badge = STATUS_BADGE[rep.status];
                      return (
                        <tr key={rep.id} className="align-top hover:bg-stone-50/60">
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-900">{meta.name}</span>
                              <a
                                href={meta.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-stone-400 hover:text-emerald-700"
                                title="Sitio oficial"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <span className="mt-0.5 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                              {meta.agency} · {meta.category}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                              {badge.label}
                            </span>
                            {rep.ms > 0 && (
                              <p className="mt-0.5 font-mono text-[10px] text-stone-400">{rep.ms} ms</p>
                            )}
                          </td>
                          <td className="py-3 pr-3 font-mono text-[11px] text-stone-700">
                            {meta.spatialResolution}
                            <p className="font-sans text-[10px] text-stone-400">{meta.temporalResolution}</p>
                          </td>
                          <td className="py-3 pr-3 text-stone-700">
                            <p className="font-medium text-stone-800">{rep.summary}</p>
                            {rep.detail && <p className="mt-0.5 text-[11px] text-rose-700">{rep.detail}</p>}
                          </td>
                          <td className="py-3 text-[11px] text-stone-500">{meta.limitations}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </DetailsToggle>
        </div>
      )}
    </div>
  );
}
