import { useEffect, useMemo, useState } from 'react';
import {
  CROPS,
  NEUTRAL_SCENARIO,
  analyzeSite,
  applyMarketOverrides,
  defaultFarmerInputs,
} from '@fieldshift/core';
import type { Crop, FarmerInputs, Scenario, SiteProfile } from '@fieldshift/core';
import { HeaderStepper } from './components/HeaderStepper';
import type { StepId } from './components/HeaderStepper';
import { HowItWorksModal } from './components/HowItWorksModal';
import { StepCatalogAndSources } from './components/StepCatalogAndSources';
import type { MarketOverrides } from './components/StepCatalogAndSources';
import { StepDiagnosis } from './components/StepDiagnosis';
import { StepLocation } from './components/StepLocation';
import type { CandidateLocation } from './components/StepLocation';
import { StepPriorities } from './components/StepPriorities';
import { StepStrategies } from './components/StepStrategies';
import { LoadingPipeline } from './components/ui/LoadingPipeline';
import { useLocale } from './i18n/LocaleContext';
import { fetchCatalog, streamSiteProfile } from './lib/api';
import type { StreamProgressEvent } from './lib/api';

export function App() {
  const { locale } = useLocale();
  const [step, setStep] = useState<StepId>(1);
  const [candidate, setCandidate] = useState<CandidateLocation | null>(null);
  const [site, setSite] = useState<SiteProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressEvents, setProgressEvents] = useState<StreamProgressEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [baseCatalog, setBaseCatalog] = useState<Crop[]>(CROPS);
  const [nassStatus, setNassStatus] = useState<string | undefined>(undefined);
  const [overrides, setOverrides] = useState<MarketOverrides>({});

  const [farmer, setFarmer] = useState<FarmerInputs | null>(null);
  const [scenario, setScenario] = useState<Scenario>(NEUTRAL_SCENARIO);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  useEffect(() => {
    fetchCatalog()
      .then((res) => {
        setBaseCatalog(res.crops);
        setNassStatus(res.nassStatus);
      })
      .catch(() => {
        // Built-in catalog stays active if offline
      });
  }, []);

  const effectiveCatalog = useMemo(
    () => applyMarketOverrides(baseCatalog, overrides),
    [baseCatalog, overrides],
  );

  const analysis = useMemo(() => {
    if (!site || !farmer) return null;
    return analyzeSite(site, farmer, scenario, effectiveCatalog, locale);
  }, [site, farmer, scenario, effectiveCatalog, locale]);

  const confirmParcel = async (loc: CandidateLocation, refresh = false) => {
    setCandidate(loc);
    setLoading(true);
    setLoadError(null);
    setProgressEvents([]);
    setStep(2);

    try {
      const profile = await streamSiteProfile(loc.lat, loc.lon, loc.name, refresh, (evt) => {
        setProgressEvents((prev) => {
          const rest = prev.filter((p) => p.step !== evt.step);
          return [...rest, evt];
        });
      });
      setSite(profile);
      const baseFarmer = defaultFarmerInputs(profile);
      if (loc.areaHa && loc.areaHa >= 0.5) {
        baseFarmer.constraints = { ...baseFarmer.constraints, farmSizeHa: loc.areaHa };
      }
      setFarmer(baseFarmer);
      setScenario(NEUTRAL_SCENARIO);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : locale === 'en'
          ? 'Could not load field data.'
          : 'No se pudieron cargar los datos de la parcela.',
      );
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-[#2A2118]">
      <HeaderStepper
        step={step}
        onSelectStep={setStep}
        onOpenHelp={() => setHelpOpen(true)}
        site={site}
        loading={loading}
      />
      <HowItWorksModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {loadError && (
          <div className="mb-5 rounded-xl border border-[#A84A28]/40 bg-[#F9EAE3] px-4 py-3 text-xs font-semibold text-[#7A3016]">
            {loadError}
          </div>
        )}

        {step === 1 && (
          <StepLocation
            candidate={candidate}
            onSelectCandidate={setCandidate}
            onConfirmParcel={(loc) => confirmParcel(loc, false)}
            loading={loading}
          />
        )}

        {step > 1 && loading && candidate && (
          <LoadingPipeline
            parcelName={candidate.name}
            lat={candidate.lat}
            lon={candidate.lon}
            events={progressEvents}
          />
        )}

        {step === 2 && !loading && site && analysis && (
          <StepDiagnosis
            site={site}
            windows={analysis.windows}
            parcelPolygon={candidate?.polygon}
            onRefresh={() =>
              confirmParcel(
                {
                  lat: site.location.lat,
                  lon: site.location.lon,
                  name: site.location.name,
                  areaHa: candidate?.areaHa,
                  polygon: candidate?.polygon,
                },
                true,
              )
            }
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && !loading && site && farmer && analysis && (
          <StepPriorities
            site={site}
            catalog={effectiveCatalog}
            farmer={farmer}
            cropTable={analysis.cropTable}
            onChange={setFarmer}
            onContinue={() => setStep(4)}
          />
        )}

        {step === 4 && !loading && site && farmer && analysis && (
          <StepStrategies
            site={site}
            farmer={farmer}
            scenario={scenario}
            analysis={analysis}
            catalog={effectiveCatalog}
            onScenarioChange={setScenario}
            onOpenSources={() => setStep(5)}
          />
        )}

        {step === 5 && !loading && site && analysis && (
          <StepCatalogAndSources
            site={site}
            catalog={effectiveCatalog}
            baseCatalog={baseCatalog}
            cropTable={analysis.cropTable}
            overrides={overrides}
            nassStatus={nassStatus}
            onChangeOverrides={setOverrides}
          />
        )}
      </main>
    </div>
  );
}

export default App;
