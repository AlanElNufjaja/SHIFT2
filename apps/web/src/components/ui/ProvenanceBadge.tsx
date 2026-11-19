import { useState } from 'react';
import { SOURCES } from '@fieldshift/core';
import type { Provenance, SourceId } from '@fieldshift/core';

const BADGE_STYLE: Record<Provenance, { label: string; cls: string; dot: string; explain: string }> = {
  live: {
    label: 'Dato real reciente',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-600',
    explain: 'Tomado hoy de estaciones climáticas, mapas de suelo o satélites para tu zona.',
  },
  cached: {
    label: 'Dato real guardado',
    cls: 'bg-teal-50 text-teal-800 border-teal-200',
    dot: 'bg-teal-600',
    explain: 'Dato real consultado hace poco para tu zona.',
  },
  derived: {
    label: 'Calculado del clima',
    cls: 'bg-sky-50 text-sky-800 border-sky-200',
    dot: 'bg-sky-600',
    explain: 'Cuenta sacada con los datos reales del clima y de la tierra de tu parcela.',
  },
  baseline: {
    label: 'Estimado de la región',
    cls: 'bg-amber-50 text-amber-900 border-amber-200',
    dot: 'bg-amber-600',
    explain: 'Referencia aproximada de la zona (no es medición directa en tu terreno). Conviene revisarlo en campo.',
  },
  simulated: {
    label: 'Prueba de clima',
    cls: 'bg-orange-50 text-orange-900 border-orange-300',
    dot: 'bg-orange-600',
    explain: 'Resultado de la prueba que moviste para ver qué pasa si cambia el calor, la lluvia o el riego.',
  },
  user: {
    label: 'Dato que pusiste tú',
    cls: 'bg-stone-100 text-stone-700 border-stone-300',
    dot: 'bg-stone-600',
    explain: 'Información que tú escribiste o ajustaste en la herramienta.',
  },
  unavailable: {
    label: 'Sin dato aquí',
    cls: 'bg-rose-50 text-rose-800 border-rose-200',
    dot: 'bg-rose-600',
    explain: 'No hubo información disponible para este punto; usamos un valor neutro.',
  },
};

interface Props {
  provenance: Provenance;
  sources?: SourceId[];
  method?: string;
  compact?: boolean;
}

export function ProvenanceBadge({ provenance, sources, method, compact }: Props) {
  const [open, setOpen] = useState(false);
  const meta = BADGE_STYLE[provenance];
  const srcNames = (sources ?? [])
    .map((id) => SOURCES[id]?.name ?? id)
    .slice(0, 3);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        title={`${meta.label}: ${meta.explain}`}
        className={`inline-flex items-center gap-1 rounded-full border font-medium transition hover:opacity-90 ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
        } ${meta.cls}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-stone-200 bg-white p-3 text-left text-xs text-stone-700 shadow-elevated">
          <p className="font-semibold text-stone-900">{meta.label}</p>
          <p className="mt-1 leading-relaxed text-stone-600">{meta.explain}</p>
          {method && (
            <p className="mt-1.5 border-t border-stone-100 pt-1.5 text-[11px] text-stone-500">
              <span className="font-medium text-stone-700">Cómo se sacó:</span> {method}
            </p>
          )}
          {srcNames.length > 0 && (
            <p className="mt-1 text-[11px] text-stone-500">
              <span className="font-medium text-stone-700">De dónde viene:</span> {srcNames.join(' · ')}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
