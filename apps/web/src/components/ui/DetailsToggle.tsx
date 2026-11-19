import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocale } from '../../i18n/LocaleContext';

interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function DetailsToggle({ title, subtitle, badge, defaultOpen = false, children }: Props) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const labelHide = locale === 'en' ? 'Hide' : 'Ocultar';
  const labelShow = locale === 'en' ? 'Show details' : 'Ver detalles';

  return (
    <div className="overflow-hidden rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[#F3EBDC] sm:px-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-[#2A2118]">{title}</span>
            {badge && (
              <span className="rounded-full border border-[#C8B89E] bg-[#F1E8D7] px-2.5 py-0.5 text-[11px] font-semibold text-[#5B4935]">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-[#6B5A46]">{subtitle}</p>}
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#C8B89E] bg-[#F1E8D7] px-3 py-1.5 text-xs font-bold text-[#234E36]">
          <span>{open ? labelHide : labelShow}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && <div className="border-t border-[#C8B89E] bg-[#FAF6EE] p-4 sm:p-5">{children}</div>}
    </div>
  );
}
