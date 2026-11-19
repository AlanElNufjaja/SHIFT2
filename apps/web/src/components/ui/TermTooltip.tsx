import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { GLOSSARY } from '@fieldshift/core';

interface Props {
  termKey: keyof typeof GLOSSARY | string;
  label?: string;
}

export function TermTooltip({ termKey, label }: Props) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[termKey];

  if (!entry) {
    return <span>{label ?? termKey}</span>;
  }

  return (
    <span className="relative inline-flex items-center gap-0.5 align-baseline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center gap-1 border-b border-dotted border-stone-400 text-left font-medium text-inherit hover:border-emerald-700 hover:text-emerald-900 focus:outline-none"
      >
        <span>{label ?? entry.term}</span>
        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-stone-400" />
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 w-80 max-w-[88vw] rounded-xl border border-stone-200 bg-white p-3.5 text-left text-xs text-stone-700 shadow-elevated"
        >
          <p className="font-semibold text-stone-900">{entry.term}</p>
          <p className="mt-1 font-medium text-emerald-800">{entry.short}</p>
          <p className="mt-1 leading-relaxed text-stone-600">{entry.detail}</p>
          {entry.example && (
            <p className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-600">
              <span className="font-semibold text-stone-700">Ejemplo:</span> {entry.example}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
