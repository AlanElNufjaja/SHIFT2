import { useEffect } from 'react';
import { CloudSun, Compass, HandHeart, MapPin, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#1A140C]/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-[#C8B89E] bg-[#FAF6EE] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#C8B89E] bg-[#1B3B2B] px-5 py-4 text-[#FAF6EE]">
          <div>
            <span className="inline-block rounded-full bg-[#D99B26] px-2.5 py-0.5 text-[11px] font-extrabold text-[#1A140C]">
              Guía clara
            </span>
            <h2 id="how-it-works-title" className="mt-1 font-display text-lg font-extrabold sm:text-xl">
              ¿Cómo funciona Field Shift?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar explicación"
            className="rounded-lg border border-[#3C6E54] bg-[#264D39] p-1.5 text-[#FAF6EE] transition hover:bg-[#2E5D45]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Plain-Language Farmer Guide */}
        <div className="space-y-4 p-5 text-sm leading-relaxed text-[#2A2118] sm:p-6">
          {/* 1. Where the data comes from */}
          <div className="rounded-xl border border-[#C8B89E] bg-white p-4">
            <div className="flex items-center gap-2 font-display text-sm font-extrabold text-[#1B3B2B]">
              <CloudSun className="h-4 w-4 text-[#C87D18]" />
              1. De dónde sacamos la información de tu parcela
            </div>
            <ul className="mt-2 space-y-1.5 text-xs text-[#524333]">
              <li>
                • <strong>Tu ubicación y tamaño:</strong> usas el mapa satelital para señalar o dibujar tu terreno y medir cuántas hectáreas tiene.
              </li>
              <li>
                • <strong>Lluvia, calor y heladas:</strong> revisamos los registros reales de los últimos años en tu zona para saber cuánto llueve, qué meses quema el sol y cuándo hiela.
              </li>
              <li>
                • <strong>Tu tierra y cultivos anteriores:</strong> consultamos mapas del tipo de suelo (qué tanto guarda agua y si es plano o con pendiente). En Estados Unidos también revisamos el mapa de cultivos del USDA para ver qué se sembró ahí años atrás.
              </li>
            </ul>
          </div>

          {/* 2. How recommendations are built */}
          <div className="rounded-xl border border-[#C8B89E] bg-white p-4">
            <div className="flex items-center gap-2 font-display text-sm font-extrabold text-[#1B3B2B]">
              <Compass className="h-4 w-4 text-[#234E36]" />
              2. Cómo armamos las opciones para sembrar
            </div>
            <ul className="mt-2 space-y-1.5 text-xs text-[#524333]">
              <li>
                • <strong>Comparamos caminos:</strong> ponemos lado a lado seguir sembrando lo mismo que hoy frente a otras opciones (como cambiar de cultivo cada año, meter leguminosas que dan abono natural o tapar la tierra en descanso).
              </li>
              <li>
                • <strong>Tomamos en cuenta tu agua y tus metas:</strong> calculamos cuánta agua pide cada siembra según tu tipo de riego y ordenamos las opciones según lo que nos dijiste que te importa más (ahorrar agua, cuidar el suelo, ganar más o sacar pastura).
              </li>
              <li>
                • <strong>Pruebas de clima y números aproximados:</strong> cuando mueves los controles de sequía o calor haces una prueba aproximada para ver qué cultivo resiste mejor. Los precios y rendimientos son promedios de referencia que puedes cambiar por los de tu comprador local.
              </li>
            </ul>
          </div>

          {/* 3. Why it never replaces the farmer or local field check */}
          <div className="rounded-xl border border-[#A84A28]/40 bg-[#F9EAE3] p-4">
            <div className="flex items-center gap-2 font-display text-sm font-extrabold text-[#7A3016]">
              <HandHeart className="h-4 w-4 text-[#A84A28]" />
              3. Por qué no reemplaza tu experiencia ni la visita al terreno
            </div>
            <p className="mt-1.5 text-xs text-[#5E2814]">
              Las fotos desde arriba y los mapas generales no alcanzan a ver todo lo que pasa dentro de tu parcela: si un pedazo tiene salitre o suelo apretado, cómo está exactamente el agua de tu pozo o canal, qué plaga anda fuerte este año o qué precio te paga tu comprador cercano.
            </p>
            <p className="mt-1.5 text-xs font-bold text-[#7A3016]">
              Úsalo solo como apoyo y guía para tomar mejores decisiones junto con lo que tú conoces de tu tierra y la opinión de un técnico local.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#C8B89E] bg-[#F2E9DA] px-5 py-3.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-[#5B4935]">
            <MapPin className="h-3.5 w-3.5 text-[#234E36]" />
            Puedes abrir esta guía en cualquier momento desde arriba.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#234E36] px-5 py-2 text-xs font-bold text-[#FAF6EE] shadow-sm transition hover:bg-[#1B3B2B]"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
