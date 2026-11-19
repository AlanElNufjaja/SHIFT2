import {
  BookOpen,
  Check,
  Compass,
  Globe,
  HelpCircle,
  Lock,
  MapPin,
  SlidersHorizontal,
  Sprout,
  Sun,
} from 'lucide-react';
import type { SiteProfile } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';

export type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: StepId; labelEn: string; labelEs: string; icon: typeof MapPin }[] = [
  { id: 1, labelEn: '1. Your field', labelEs: '1. Tu parcela', icon: MapPin },
  { id: 2, labelEn: '2. Field report', labelEs: '2. Tu campo', icon: Sun },
  { id: 3, labelEn: '3. Your crops', labelEs: '3. Tu siembra', icon: SlidersHorizontal },
  { id: 4, labelEn: '4. Options', labelEs: '4. Opciones', icon: Compass },
  { id: 5, labelEn: '5. Crop list', labelEs: '5. Cultivos', icon: BookOpen },
];

interface Props {
  step: StepId;
  onSelectStep: (s: StepId) => void;
  onOpenHelp: () => void;
  site: SiteProfile | null;
  loading: boolean;
}

export function HeaderStepper({ step, onSelectStep, onOpenHelp, site, loading }: Props) {
  const { locale, setLocale } = useLocale();
  const isEn = locale === 'en';
  const locked = !site || loading;

  return (
    <header className="no-print sticky top-0 z-[1000] border-b-2 border-[#D99B26]/70 bg-[#1B3B2B] shadow-elevated">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D99B26]/60 bg-[#234E36] text-[#D99B26] shadow-sm">
              <Sprout className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-extrabold tracking-tight text-[#FAF6EE]">
                  Field Shift
                </span>
                <span className="rounded-full bg-[#D99B26] px-2.5 py-0.5 text-[11px] font-extrabold text-[#1A140C]">
                  {isEn ? 'Farm decision guide' : 'Ayuda para el campo'}
                </span>
              </div>
              <p className="text-xs text-[#DDD3C0]">
                {isEn
                  ? 'Helper for planning what to plant · Never replaces your experience or local advisor'
                  : 'Guía para decidir qué sembrar · No sustituye tu experiencia ni a tu técnico'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Language switcher (EN | ES) */}
            <div
              role="group"
              aria-label={isEn ? 'Choose language' : 'Elegir idioma'}
              className="inline-flex items-center gap-1 rounded-xl border border-[#3C6E54] bg-[#132B1F] p-1"
            >
              <Globe className="ml-1.5 h-3.5 w-3.5 text-[#D99B26]" aria-hidden="true" />
              <button
                type="button"
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                  locale === 'en'
                    ? 'bg-[#D99B26] text-[#1A140C] shadow-sm'
                    : 'text-[#DDD3C0] hover:text-[#FAF6EE]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                aria-pressed={locale === 'es'}
                onClick={() => setLocale('es')}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                  locale === 'es'
                    ? 'bg-[#D99B26] text-[#1A140C] shadow-sm'
                    : 'text-[#DDD3C0] hover:text-[#FAF6EE]'
                }`}
              >
                ES
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenHelp}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#3C6E54] bg-[#264D39] px-3 py-1.5 text-xs font-bold text-[#FAF6EE] transition hover:border-[#D99B26]/70 hover:bg-[#2E5D45]"
            >
              <HelpCircle className="h-3.5 w-3.5 text-[#D99B26]" />
              {isEn ? 'How does this work?' : '¿Cómo funciona esto?'}
            </button>

            {site && (
              <div className="flex items-center gap-2 rounded-xl border border-[#3C6E54] bg-[#264D39] px-3 py-1.5 text-xs">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#D99B26]" />
                <span className="max-w-[180px] truncate font-semibold text-[#FAF6EE] sm:max-w-xs">
                  {site.location.name}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectStep(1)}
                  className="ml-1 shrink-0 rounded-lg bg-[#D99B26] px-2.5 py-1 font-bold text-[#1A140C] shadow-sm transition hover:bg-[#E7AD3B]"
                >
                  {isEn ? 'Change field' : 'Cambiar parcela'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Guided Stepper Bar — crisp contrast on forest header without horizontal overflow */}
        <nav
          aria-label={isEn ? 'Guide steps' : 'Pasos de la guía'}
          className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5"
        >
          {STEPS.map((st) => {
            const Icon = st.icon;
            const label = isEn ? st.labelEn : st.labelEs;
            const isActive = step === st.id;
            const isLocked = st.id > 1 && locked;
            const isDone = st.id === 1 && Boolean(site);

            return (
              <button
                key={st.id}
                type="button"
                disabled={isLocked}
                onClick={() => onSelectStep(st.id)}
                title={
                  isLocked
                    ? isEn
                      ? 'Pick and confirm your field location in Step 1 first'
                      : 'Primero elige y confirma dónde está tu parcela en el Paso 1'
                    : label
                }
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition ${
                  isActive
                    ? 'border-[#F0BA49] bg-[#D99B26] text-[#1A140C] shadow-sm'
                    : isLocked
                    ? 'cursor-not-allowed border-[#1F3F2E] bg-[#132B1F] text-[#7F9C8B]'
                    : 'border-[#3C6E54] bg-[#264D39] text-[#FAF6EE] hover:border-[#D99B26]/70 hover:bg-[#2E5D45]'
                }`}
              >
                {isLocked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-[#7F9C8B]" />
                ) : isDone && !isActive ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#D99B26]" />
                ) : (
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
