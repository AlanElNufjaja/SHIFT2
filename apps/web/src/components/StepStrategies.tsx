import { Download, Printer, Sprout } from 'lucide-react';
import type { AnalysisResult, Crop, FarmerInputs, Scenario, SiteProfile } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';
import { ScenarioSimulator } from './ScenarioSimulator';
import { StrategyCard } from './StrategyCard';
import { StrategyCharts } from './StrategyCharts';
import { DetailsToggle } from './ui/DetailsToggle';

interface Props {
  site: SiteProfile;
  farmer: FarmerInputs;
  scenario: Scenario;
  analysis: AnalysisResult;
  catalog: Crop[];
  onScenarioChange: (s: Scenario) => void;
  onOpenSources: () => void;
}

export function StepStrategies({
  site,
  farmer,
  scenario,
  analysis,
  catalog,
  onScenarioChange,
  onOpenSources,
}: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';

  const downloadJson = () => {
    const payload = {
      generatedAt: analysis.generatedAt,
      location: site.location,
      scenario,
      farmer,
      strategies: analysis.strategies,
      windows: analysis.windows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fieldshift-${site.location.lat.toFixed(2)}_${site.location.lon.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const best = analysis.strategies[0];

  return (
    <div className="space-y-6">
      {/* Header + Plain-Language Top Takeaway */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 text-xs font-bold text-[#1B3B2B]">
            <Sprout className="h-3.5 w-3.5 text-[#234E36]" />
            {isEn ? 'Step 4 of 5 · Best options for your land' : 'Paso 4 de 5 · Mejores opciones para tu parcela'}
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#2A2118]">
            {isEn ? `What fits best in ${site.location.name}` : `Qué conviene sembrar en ${site.location.name}`}
          </h1>
          <p className="mt-0.5 text-sm text-[#524333]">
            {isEn ? (
              <>
                We compared {analysis.strategies.length} plans for your{' '}
                <strong>{farmer.constraints.farmSizeHa} hectares</strong>, ranked from top match downward.
              </>
            ) : (
              <>
                Comparamos {analysis.strategies.length} caminos para tus{' '}
                <strong>{farmer.constraints.farmSizeHa} hectáreas</strong>, empezando por el que mejor se ajusta a lo que pediste.
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSources}
          className="no-print rounded-xl border border-[#C8B89E] bg-white px-4 py-2.5 text-xs font-bold text-[#2A2118] hover:bg-[#F3EBDC]"
        >
          {isEn ? 'Edit crop prices or view data sources' : 'Ajustar precios de venta o ver cultivos'}
        </button>
      </div>

      {/* Quick Top Recommendation Summary */}
      {best && (
        <div className="rounded-2xl border border-[#234E36]/30 bg-[#E7EFE9] p-4 text-sm text-[#1B3B2B] shadow-card">
          <p className="font-extrabold">
            {isEn ? `Top pick right now: ${best.sequenceLabel}` : `Lo más recomendable ahora: ${best.sequenceLabel}`}
          </p>
          <p className="mt-1 text-xs text-[#234E36]">
            {isEn
              ? `Scores ${best.scores.total} out of 100 based on your farm goals. Below you can compare it against staying as-is and test dry or hot seasons.`
              : `Logra ${best.scores.total} de 100 puntos según tus metas. Abajo puedes compararla contra seguir igual que hoy y probar qué pasa si el año viene más seco.`}
          </p>
        </div>
      )}

      {/* Interactive Scenario Simulator (Warm Amber/Terracotta, ZERO Purple) */}
      <ScenarioSimulator
        scenario={scenario}
        baseIrrigationMm={farmer.constraints.irrigationMm}
        effectiveIrrigationMm={analysis.effectiveIrrigationMm}
        onChange={onScenarioChange}
      />

      {analysis.notes.length > 0 && (
        <div className="rounded-xl border border-[#C87D18]/45 bg-[#FDF4E3] px-4 py-3 text-xs text-[#6E4509]">
          {analysis.notes.map((n, i) => (
            <p key={i}>• {n}</p>
          ))}
        </div>
      )}

      {/* Main Easy-Read Strategy Cards */}
      <div className="space-y-5">
        {analysis.strategies.map((s) => (
          <StrategyCard key={s.id} strategy={s} catalog={catalog} />
        ))}
      </div>

      {/* Progressive Disclosure: Comparative Charts + Export */}
      <DetailsToggle
        title={isEn ? 'See comparison charts & 3-year planting calendar' : 'Ver gráficas comparativas y calendario de 3 años'}
        subtitle={
          isEn
            ? 'Visual charts comparing water use, estimated profit, and ground cover month by month.'
            : 'Dibujos para comparar agua, ganancia y cómo queda cubierta la tierra mes a mes.'
        }
      >
        <StrategyCharts strategies={analysis.strategies} catalog={catalog} />
      </DetailsToggle>

      <div className="no-print">
        <DetailsToggle
          title={isEn ? 'Print summary sheet or download backup file' : 'Imprimir hoja resumen o descargar archivo para técnico'}
          subtitle={
            isEn
              ? 'Take a paper printout to discuss with your advisor or save the full numbers.'
              : 'Lleva esta comparación impresa o guarda los datos completos.'
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-900"
            >
              <Printer className="h-4 w-4" />
              {isEn ? 'Print summary' : 'Imprimir resumen'}
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              <Download className="h-4 w-4" />
              {isEn ? 'Download advisor file (JSON)' : 'Descargar respaldo técnico (JSON)'}
            </button>
          </div>
        </DetailsToggle>
      </div>
    </div>
  );
}
