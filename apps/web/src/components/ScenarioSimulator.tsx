import { Flame, RotateCcw } from 'lucide-react';
import { NEUTRAL_SCENARIO } from '@fieldshift/core';
import type { Scenario } from '@fieldshift/core';

interface Props {
  scenario: Scenario;
  baseIrrigationMm: number;
  effectiveIrrigationMm: number;
  onChange: (next: Scenario) => void;
}

const PRESETS: { label: string; scenario: Scenario }[] = [
  { label: 'Clima normal', scenario: NEUTRAL_SCENARIO },
  { label: 'Año seco (+1.5 °C, −20 % agua)', scenario: { deltaTempC: 1.5, precipChangePct: -20, waterAvailabilityChangePct: -20 } },
  { label: 'Mucha sequía (+2.5 °C, −35 % lluvia, −45 % riego)', scenario: { deltaTempC: 2.5, precipChangePct: -35, waterAvailabilityChangePct: -45 } },
  { label: 'Año muy caliente (+3 °C)', scenario: { deltaTempC: 3.0, precipChangePct: 0, waterAvailabilityChangePct: -10 } },
];

function tempExplain(dt: number): string {
  if (dt === 0) return 'Temperatura normal de tu zona';
  if (dt > 0) return `+${dt.toFixed(1)} °C: días más calientes que pueden pasmar flores`;
  return `${dt.toFixed(1)} °C: año más fresco de lo normal`;
}

function precipExplain(pct: number): string {
  if (pct === 0) return 'Lluvia normal de tu zona';
  if (pct < 0) return `Llueve ${Math.abs(pct)} % menos de lo normal`;
  return `Llueve ${pct} % más de lo normal`;
}

function waterExplain(pct: number, effMm: number): string {
  if (pct === 0) return `Cuentas con tu riego normal (${effMm} mm)`;
  if (pct < 0) return `Te recortan ${Math.abs(pct)} % el agua de riego (quedan ${effMm} mm)`;
  return `Tienes ${pct} % más agua de riego (${effMm} mm)`;
}

export function ScenarioSimulator({ scenario, baseIrrigationMm, effectiveIrrigationMm, onChange }: Props) {
  const isNeutral =
    scenario.deltaTempC === 0 &&
    scenario.precipChangePct === 0 &&
    scenario.waterAvailabilityChangePct === 0;

  return (
    <div
      className={`rounded-2xl border p-5 shadow-card transition ${
        isNeutral ? 'border-[#C8B89E] bg-[#FAF6EE]' : 'border-[#C87D18] bg-[#FDF4E3]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              isNeutral ? 'bg-[#EFE5D5] text-[#5B4935]' : 'bg-[#F7DFB3] text-[#8C550E]'
            }`}
          >
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#2A2118]">
              ¿Y si viene un año más seco o caliente? Prueba aquí
            </h2>
            <p className="text-xs text-[#524333]">
              Mueve estos controles para ver qué siembra aguanta mejor si falta lluvia o sube el calor.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.scenario)}
              className="rounded-lg border border-[#C8B89E] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2A2118] hover:border-[#C87D18] hover:bg-[#FDF4E3]"
            >
              {p.label}
            </button>
          ))}
          {!isNeutral && (
            <button
              type="button"
              onClick={() => onChange(NEUTRAL_SCENARIO)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#C87D18] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#A66510]"
            >
              <RotateCcw className="h-3 w-3" />
              Volver a normal
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#C8B89E] bg-white p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-stone-800">Calor</span>
            <span className="font-mono font-bold text-orange-700">
              {scenario.deltaTempC > 0 ? '+' : ''}
              {scenario.deltaTempC.toFixed(1)} °C
            </span>
          </div>
          <input
            type="range"
            min={-1}
            max={4}
            step={0.5}
            aria-label="Cambio de calor"
            value={scenario.deltaTempC}
            onChange={(e) => onChange({ ...scenario, deltaTempC: Number(e.target.value) })}
            className="fs-range mt-2 w-full"
          />
          <p className="mt-1.5 text-[11px] text-stone-600">{tempExplain(scenario.deltaTempC)}</p>
        </div>

        <div className="rounded-xl border border-[#C8B89E] bg-white p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#2A2118]">Lluvia</span>
            <span className="font-mono font-bold text-sky-700">
              {scenario.precipChangePct > 0 ? '+' : ''}
              {scenario.precipChangePct} %
            </span>
          </div>
          <input
            type="range"
            min={-45}
            max={30}
            step={5}
            aria-label="Cambio de lluvia"
            value={scenario.precipChangePct}
            onChange={(e) => onChange({ ...scenario, precipChangePct: Number(e.target.value) })}
            className="fs-range mt-2 w-full"
          />
          <p className="mt-1.5 text-[11px] text-stone-600">{precipExplain(scenario.precipChangePct)}</p>
        </div>

        <div className="rounded-xl border border-[#C8B89E] bg-white p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#2A2118]">Agua para regar</span>
            <span className="font-mono font-bold text-emerald-800">
              {scenario.waterAvailabilityChangePct > 0 ? '+' : ''}
              {scenario.waterAvailabilityChangePct} %
            </span>
          </div>
          <input
            type="range"
            min={-60}
            max={25}
            step={5}
            aria-label="Cambio de agua de riego"
            value={scenario.waterAvailabilityChangePct}
            onChange={(e) => onChange({ ...scenario, waterAvailabilityChangePct: Number(e.target.value) })}
            className="fs-range mt-2 w-full"
          />
          <p className="mt-1.5 text-[11px] text-stone-600">
            {baseIrrigationMm === 0
              ? 'Parcela de temporal (sin riego)'
              : waterExplain(scenario.waterAvailabilityChangePct, effectiveIrrigationMm)}
          </p>
        </div>
      </div>
    </div>
  );
}
