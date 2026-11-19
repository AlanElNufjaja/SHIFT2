import { AlertTriangle, CheckCircle2, Loader2, Sun } from 'lucide-react';
import { useLocale } from '../../i18n/LocaleContext';
import type { StreamProgressEvent } from '../../lib/api';
import { DetailsToggle } from './DetailsToggle';

const EXPECTED_PIPELINE = [
  { step: 'nasa-power', en: 'Local rainfall, heat & frost history', es: 'Lluvias, calor y heladas de la zona' },
  { step: 'era5', en: 'How fast sun & air dry the soil', es: 'Cuánta agua seca el aire (evaporación)' },
  { step: 'modis', en: 'Seasonal greenness vs. bare ground', es: 'Qué tan verde se ve el terreno en el año' },
  { step: 'srtm', en: 'Elevation & hill slope', es: 'Altura y pendiente del terreno' },
  { step: 'soil', en: 'Soil type, water holding & pH', es: 'Tipo de tierra, agua que retiene y acidez' },
  { step: 'cdl', en: 'Past crops planted here (U.S.)', es: 'Qué se sembró años atrás (si aplica)' },
  { step: 'nlcd', en: 'Surrounding land cover (U.S.)', es: 'Uso del terreno alrededor' },
  { step: 'usgs-water', en: 'Nearby groundwater wells (U.S.)', es: 'Pozos de agua cercanos (si aplica)' },
  { step: 'cmr-stac', en: 'Available satellite photos', es: 'Fotos satelitales disponibles' },
];

interface Props {
  parcelName: string;
  lat: number;
  lon: number;
  events: StreamProgressEvent[];
}

export function LoadingPipeline({ parcelName, events }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';
  const byStep = new Map(events.map((e) => [e.step, e]));
  const isCache = byStep.has('cache');
  const pct = isCache
    ? 100
    : Math.min(96, Math.round((events.length / EXPECTED_PIPELINE.length) * 100));

  const statusText = (ev: StreamProgressEvent | undefined) => {
    if (!ev) return isEn ? 'Checking data…' : 'Consultando información…';
    if (!isEn) return ev.summary;
    if (ev.status === 'cached') return 'Loaded from recent saved check';
    if (ev.status === 'done') return 'Ready';
    if (ev.status === 'fallback') return 'Using regional estimate';
    return 'Not available here';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D99B26]/40 bg-[#F3EBDC] text-[#C87D18]">
              <Sun className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2A2118]">
                {isEn
                  ? `Checking weather & soil for ${parcelName}...`
                  : `Revisando el clima y la tierra de ${parcelName}...`}
              </h2>
              <p className="text-xs text-[#6B5A46]">
                {isEn
                  ? 'Just a few seconds — gathering rainfall, temperature, soil, and crop records.'
                  : 'Esto toma unos segundos. Estamos juntando datos de lluvia, temperatura, suelo y cultivos.'}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 font-mono text-sm font-bold text-[#1B3B2B]">
            {pct}%
          </span>
        </div>

        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#E3D8C5]">
          <div
            className="h-full rounded-full bg-[#234E36] transition-all duration-300"
            style={{ width: `${Math.max(8, pct)}%` }}
          />
        </div>

        <div className="mt-4">
          <DetailsToggle
            title={isEn ? 'See what we are checking' : 'Ver qué estamos revisando'}
            badge={`${events.length} / ${EXPECTED_PIPELINE.length}`}
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {EXPECTED_PIPELINE.map((item) => {
                const ev = byStep.get(item.step) ?? (isCache ? byStep.get('cache') : undefined);
                return (
                  <div
                    key={item.step}
                    className="flex items-start gap-2.5 rounded-xl border border-[#C8B89E] bg-[#F4ECE0] p-3 text-xs"
                  >
                    {!ev ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#234E36]" />
                    ) : ev.status === 'done' || ev.status === 'cached' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#234E36]" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C87D18]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[#2A2118]">
                        {isEn ? item.en : item.es}
                      </span>
                      <p className="mt-0.5 truncate text-[#6B5A46]">{statusText(ev)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </DetailsToggle>
        </div>
      </div>

      {/* Skeleton preview matching Step 2 layout */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5">
            <div className="h-3 w-24 rounded bg-[#DDD0BA]" />
            <div className="mt-4 h-7 w-32 rounded bg-[#DDD0BA]" />
            <div className="mt-3 h-2.5 w-40 rounded bg-[#E8DFCE]" />
          </div>
        ))}
      </div>
    </div>
  );
}
