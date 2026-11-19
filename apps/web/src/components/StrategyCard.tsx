import {
  AlertCircle,
  Award,
  CheckCircle2,
  Droplets,
  HelpCircle,
  Leaf,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { getCrop, getCropName } from '@fieldshift/core';
import type { Crop, Strategy } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';
import { DetailsToggle } from './ui/DetailsToggle';
import { ProvenanceBadge } from './ui/ProvenanceBadge';

interface Props {
  strategy: Strategy;
  catalog: Crop[];
}

export function StrategyCard({ strategy, catalog }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';
  const { metrics: m, scores: sc, explanation: ex } = strategy;
  const isTop = strategy.rank === 1;

  const headlineTitle = strategy.isCurrent
    ? isEn
      ? 'Keep growing what you have today'
      : 'Seguir como siembras hoy'
    : strategy.title.replace(/^Estrategia \d+\s*·\s*/i, '');

  const waterText = isEn
    ? m.irrigationMm === 0
      ? 'Rain only (no irrigation)'
      : m.waterDeficitMm > 0
      ? `Needs ${m.irrigationMm} mm (short ${m.waterDeficitMm} mm)`
      : `Needs ${m.irrigationMm} mm/yr`
    : m.irrigationMm === 0
    ? 'Solo con lluvia'
    : m.waterDeficitMm > 0
    ? `Pide ${m.irrigationMm} mm (le faltarían ${m.waterDeficitMm} mm)`
    : `Pide ${m.irrigationMm} mm al año`;

  const soilText = isEn
    ? m.nFixedKgHa > 20
      ? `${m.groundCoverPct}% covered · adds +${m.nFixedKgHa} kg free N`
      : `${m.groundCoverPct}% covered (${m.bareMonths} bare mo/yr)`
    : m.nFixedKgHa > 20
    ? `${m.groundCoverPct} % protegida · da +${m.nFixedKgHa} kg de abono natural`
    : `${m.groundCoverPct} % protegida (${m.bareMonths} meses pelona al año)`;

  return (
    <article
      className={`print-break-avoid rounded-2xl border bg-[#FAF6EE] p-5 shadow-card transition sm:p-6 ${
        isTop
          ? 'border-[#234E36] ring-2 ring-[#234E36]/20'
          : strategy.isCurrent
          ? 'border-[#C8B89E] bg-[#F4ECE0]'
          : 'border-[#C8B89E]'
      }`}
    >
      {/* Header: What to plant + quick score */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#C8B89E]/70 pb-4 sm:flex-row sm:items-start">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-extrabold ${
                isTop
                  ? 'bg-[#234E36] text-[#FAF6EE]'
                  : strategy.isCurrent
                  ? 'bg-[#DDD0BA] text-[#2A2118]'
                  : 'border border-[#234E36]/30 bg-[#E7EFE9] text-[#1B3B2B]'
              }`}
            >
              {isTop && <Award className="h-3.5 w-3.5 text-[#D99B26]" />}
              {isTop
                ? isEn
                  ? '#1 Recommended option'
                  : 'Opción #1 recomendada para ti'
                : isEn
                ? `Option #${strategy.rank}`
                : `Opción #${strategy.rank}`}
            </span>
            {strategy.isCurrent && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {isEn ? 'What you grow today' : 'Así estás sembrando hoy'}
              </span>
            )}
          </div>

          <h3 className="font-display text-lg font-extrabold text-stone-900 sm:text-xl">
            {headlineTitle}
          </h3>
          <p className="text-xs text-stone-600">{strategy.subtitle}</p>

          {/* 3-year sequence chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {strategy.mainSequence.map((id, idx) => {
              const c = getCrop(id, catalog);
              return (
                <span
                  key={`${id}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-800"
                >
                  <span>{c.icon}</span>
                  <span>
                    {isEn ? `Year ${idx + 1}` : `Año ${idx + 1}`}: {getCropName(c, locale)}
                  </span>
                </span>
              );
            })}
            {strategy.offSeasonPolicy === 'cover' && (
              <span className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
                {isEn ? '+ Cover crop in off-season' : '+ Planta que tapa la tierra en descanso'}
              </span>
            )}
            {strategy.offSeasonPolicy === 'double-crop' && (
              <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900">
                {isEn ? '+ Second short crop in year' : '+ Segunda siembra corta en el año'}
              </span>
            )}
          </div>
        </div>

        {/* Friendly Score */}
        <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5">
          <div className="text-right">
            <p className="text-[11px] font-semibold text-stone-500">
              {isEn ? 'How well it fits' : 'Qué tanto te conviene'}
            </p>
            <p className="font-display text-2xl font-extrabold text-emerald-800">
              {sc.total}
              <span className="text-sm font-semibold text-stone-400"> / 100</span>
            </p>
          </div>
        </div>
      </div>

      {/* 3 Simple Everyday Summary Strips */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-sky-50/70 p-3 text-xs">
          <p className="flex items-center gap-1 font-bold text-sky-900">
            <Droplets className="h-3.5 w-3.5" /> {isEn ? 'Water needed' : 'Agua que ocupa'}
          </p>
          <p className="mt-1 font-semibold text-stone-900">{waterText}</p>
        </div>
        <div className="rounded-xl bg-emerald-50/70 p-3 text-xs">
          <p className="flex items-center gap-1 font-bold text-emerald-900">
            <TrendingUp className="h-3.5 w-3.5" /> {isEn ? 'Est. profit per ha' : 'Lo que deja aprox. por ha'}
          </p>
          <p className="mt-1 font-semibold text-stone-900">
            ${m.netIncomePerHa.toLocaleString('en-US')} {isEn ? 'USD/yr' : 'USD al año'}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50/70 p-3 text-xs">
          <p className="flex items-center gap-1 font-bold text-amber-900">
            <Leaf className="h-3.5 w-3.5" /> {isEn ? 'How it treats soil' : 'Cómo cuida la tierra'}
          </p>
          <p className="mt-1 font-semibold text-stone-900">{soilText}</p>
        </div>
      </div>

      {/* Plain-Language Bottom Line First */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-950">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            {isEn ? 'Why this option fits your farm' : 'Por qué te conviene esta opción'}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-stone-800">
            {ex.why.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-rose-950">
            <ShieldAlert className="h-4 w-4 text-rose-700" />
            {isEn ? 'What to check before planting' : 'Qué revisar antes de sembrar'}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-stone-800">
            {ex.risks.slice(0, 3).map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Progressive Disclosure for Full Technical Numbers, Benefits Delta, Evidence & Gaps */}
      <div className="mt-4">
        <DetailsToggle
          title={isEn ? 'See full numbers, evidence & gaps' : 'Ver números, pruebas y detalles completos'}
          subtitle={
            isEn
              ? 'Side-by-side comparison vs. today, weather/soil backup facts, and what satellites cannot see.'
              : 'Comparación exacta contra lo que siembras hoy, datos del clima/tierra que la respaldan y qué falta revisar.'
          }
          badge={isEn ? `Data confidence: ${sc.reliability}%` : `Seguridad de los datos: ${sc.reliability} %`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {/* Evidence */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-sky-900">
                {isEn ? 'Local facts backing this plan' : 'Datos reales que respaldan esta opción'}
              </h4>
              <div className="mt-2 space-y-2 text-xs">
                {ex.evidence.map((ev, i) => (
                  <div key={i} className="rounded-lg bg-white p-2.5 ring-1 ring-stone-200/70">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-stone-800">{ev.label}</span>
                      <ProvenanceBadge provenance={ev.provenance} sources={ev.sources} compact />
                    </div>
                    <p className="mt-1 text-stone-600">{ev.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Benefits + Gaps + Remaining Risks */}
            <div className="space-y-3">
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wide text-emerald-900">
                  {isEn
                    ? `Estimated figures ${strategy.isCurrent ? '' : '(compared to today)'}`
                    : `Números estimados ${strategy.isCurrent ? '' : '(comparado con hoy)'}`}
                </h4>
                <div className="mt-2 divide-y divide-stone-200/70 text-xs">
                  {ex.benefits.map((b, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <span className="text-stone-600">{b.label}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-stone-900">{b.value}</span>
                        {b.delta !== undefined && b.delta !== 0 && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              b.good ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {b.delta > 0 ? `+${b.delta}` : b.delta}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber-950">
                  <HelpCircle className="h-4 w-4 text-amber-700" />
                  {isEn ? 'What satellites cannot see from above' : 'Qué datos no sabemos desde lejos'}
                </h4>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-amber-950/90">
                  {ex.gaps.map((g, i) => (
                    <li key={i}>• {g}</li>
                  ))}
                </ul>
              </div>

              {ex.risks.length > 3 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                  <h4 className="text-xs font-extrabold uppercase tracking-wide text-rose-950">
                    {isEn ? 'Extra field checks' : 'Otros cuidados en campo'}
                  </h4>
                  <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-rose-950/90">
                    {ex.risks.slice(3).map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </DetailsToggle>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-stone-500">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-stone-400" />
        {isEn
          ? 'Use this as a starting point to discuss with your local agronomist and check buyer prices before deciding.'
          : 'Úsalo como guía para platicar con tu técnico o revisar precios en tu comprador local antes de decidir.'}
      </p>
    </article>
  );
}
