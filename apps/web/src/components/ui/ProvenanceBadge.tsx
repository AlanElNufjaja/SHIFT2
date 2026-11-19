import { useState } from 'react';
import { getSourceMeta } from '@fieldshift/core';
import type { Provenance, SourceId } from '@fieldshift/core';
import { useLocale } from '../../i18n/LocaleContext';
import { PROVENANCE_COPY } from '../../i18n/translations';

const BADGE_CLASSES: Record<Provenance, { cls: string; dot: string }> = {
  live: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600' },
  cached: { cls: 'bg-teal-50 text-teal-800 border-teal-200', dot: 'bg-teal-600' },
  derived: { cls: 'bg-sky-50 text-sky-800 border-sky-200', dot: 'bg-sky-600' },
  baseline: { cls: 'bg-amber-50 text-amber-900 border-amber-200', dot: 'bg-amber-600' },
  simulated: { cls: 'bg-orange-50 text-orange-900 border-orange-300', dot: 'bg-orange-600' },
  user: { cls: 'bg-stone-100 text-stone-700 border-stone-300', dot: 'bg-stone-600' },
  unavailable: { cls: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-600' },
};

interface Props {
  provenance: Provenance;
  sources?: SourceId[];
  method?: string;
  compact?: boolean;
}

export function ProvenanceBadge({ provenance, sources, method, compact }: Props) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const copy = PROVENANCE_COPY[locale][provenance];
  const style = BADGE_CLASSES[provenance];
  const srcNames = (sources ?? [])
    .map((id) => getSourceMeta(id, locale).name ?? id)
    .slice(0, 3);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        title={`${copy.label}: ${copy.explain}`}
        className={`inline-flex items-center gap-1 rounded-full border font-medium transition hover:opacity-90 ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'
        } ${style.cls}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {copy.label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-stone-200 bg-white p-3 text-left text-xs text-stone-700 shadow-elevated">
          <p className="font-semibold text-stone-900">{copy.label}</p>
          <p className="mt-1 leading-relaxed text-stone-600">{copy.explain}</p>
          {method && (
            <p className="mt-1.5 border-t border-stone-100 pt-1.5 text-[11px] text-stone-500">
              <span className="font-medium text-stone-700">
                {locale === 'en' ? 'Method:' : 'Cómo se sacó:'}
              </span>{' '}
              {method}
            </p>
          )}
          {srcNames.length > 0 && (
            <p className="mt-1 text-[11px] text-stone-500">
              <span className="font-medium text-stone-700">
                {locale === 'en' ? 'Source:' : 'De dónde viene:'}
              </span>{' '}
              {srcNames.join(' · ')}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
