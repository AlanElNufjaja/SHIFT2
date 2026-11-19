import {
  BookOpen,
  Check,
  Compass,
  HelpCircle,
  Lock,
  MapPin,
  SlidersHorizontal,
  Sprout,
  Sun,
} from 'lucide-react';
import type { SiteProfile } from '@fieldshift/core';

export type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: StepId; label: string; icon: typeof MapPin }[] = [
  { id: 1, label: '1. Tu parcela', icon: MapPin },
  { id: 2, label: '2. Tu campo', icon: Sun },
  { id: 3, label: '3. Tu siembra', icon: SlidersHorizontal },
  { id: 4, label: '4. Opciones', icon: Compass },
  { id: 5, label: '5. Cultivos', icon: BookOpen },
];

interface Props {
  step: StepId;
  onSelectStep: (s: StepId) => void;
  onOpenHelp: () => void;
  site: SiteProfile | null;
  loading: boolean;
}

export function HeaderStepper({ step, onSelectStep, onOpenHelp, site, loading }: Props) {
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
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-extrabold tracking-tight text-[#FAF6EE]">
                  Field Shift
                </span>
                <span className="rounded-full bg-[#D99B26] px-2.5 py-0.5 text-[11px] font-extrabold text-[#1A140C]">
                  Ayuda para el campo
                </span>
              </div>
              <p className="text-xs text-[#DDD3C0]">
                Guía para decidir qué sembrar · No sustituye tu experiencia ni a tu técnico
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenHelp}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#3C6E54] bg-[#264D39] px-3 py-1.5 text-xs font-bold text-[#FAF6EE] transition hover:border-[#D99B26]/70 hover:bg-[#2E5D45]"
            >
              <HelpCircle className="h-3.5 w-3.5 text-[#D99B26]" />
              ¿Cómo funciona esto?
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
                  Cambiar parcela
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Guided Stepper Bar — crisp contrast on forest header without horizontal overflow */}
        <nav
          aria-label="Pasos de la guía"
          className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5"
        >
          {STEPS.map((st) => {
            const Icon = st.icon;
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
                    ? 'Primero elige y confirma dónde está tu parcela en el Paso 1'
                    : st.label
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
                <span className="truncate">{st.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
