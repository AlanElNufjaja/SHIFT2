import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Loader2,
  Map as MapIcon,
  MapPin,
  Pencil,
  RotateCcw,
  ScanSearch,
  Search,
  Sprout,
  X,
} from 'lucide-react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { PILOT_PARCELS, localizePilot } from '@fieldshift/core';
import type { PilotParcel } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';
import { fetchUsdaCropAtPoint, searchLocations } from '../lib/api';
import type { GeocodeResult } from '../lib/api';
import { parcelPinIcon } from '../lib/mapPin';
import {
  computePolygonAreaHa,
  computePolygonCentroid,
  fetchOsmParcels,
  getLanduseLabel,
} from '../lib/parcels';
import type { DetectedParcel } from '../lib/parcels';
import { SatelliteBaseLayers } from './SatelliteBaseLayers';
import type { BasemapMode } from './SatelliteBaseLayers';

export interface CandidateLocation {
  lat: number;
  lon: number;
  name: string;
  climateTag?: string;
  areaHa?: number;
  polygon?: [number, number][];
  usdaCrop?: { year: number; cdlName: string } | null;
  pilotId?: string;
}

interface Props {
  candidate: CandidateLocation | null;
  onSelectCandidate: (c: CandidateLocation) => void;
  onConfirmParcel: (c: CandidateLocation, refresh?: boolean) => void;
  loading: boolean;
}

function MapController({
  target,
}: {
  target: { lat: number; lon: number; zoom?: number; seq: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const z = target.zoom ?? Math.max(map.getZoom(), 14);
    map.setView([target.lat, target.lon], z, { animate: true });
  }, [target, map]);
  return null;
}

interface MapEventsProps {
  drawing: boolean;
  onClickPoint: (lat: number, lon: number) => void;
  onMoveEnd: (zoom: number, bounds: { south: number; west: number; north: number; east: number }) => void;
}

function MapEventBridge({ drawing: _drawing, onClickPoint, onMoveEnd }: MapEventsProps) {
  const map = useMap();

  useEffect(() => {
    const b = map.getBounds();
    onMoveEnd(map.getZoom(), {
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapEvents({
    click(e) {
      onClickPoint(+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5));
    },
    moveend() {
      const b = map.getBounds();
      onMoveEnd(map.getZoom(), {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
    },
  });
  return null;
}

export function StepLocation({ candidate, onSelectCandidate, onConfirmParcel, loading }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHint, setSearchHint] = useState<string | null>(null);

  const [basemap, setBasemap] = useState<BasemapMode>('sat');
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showUsdaCdl, setShowUsdaCdl] = useState(false);

  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [showCoords, setShowCoords] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');

  // Map view state for Overpass parcel detection & programmatic recentering
  const [mapZoom, setMapZoom] = useState(4);
  const [mapBounds, setMapBounds] = useState<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lon: number;
    zoom?: number;
    seq: number;
  } | null>(null);

  // Overpass detected parcels
  const [detectParcelsOn, setDetectParcelsOn] = useState(false);
  const [detectedParcels, setDetectedParcels] = useState<DetectedParcel[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const overpassAbortRef = useRef<AbortController | null>(null);

  // Manual polygon drawing
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);

  // USDA CDL point lookup for current candidate
  const [usdaLoading, setUsdaLoading] = useState(false);
  const usdaAbortRef = useRef<AbortController | null>(null);

  const flyTo = useCallback((lat: number, lon: number, zoom?: number) => {
    setFlyTarget((prev) => ({ lat, lon, zoom, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const chooseLocation = useCallback(
    (next: CandidateLocation, targetZoom?: number) => {
      onSelectCandidate(next);
      flyTo(next.lat, next.lon, targetZoom);

      usdaAbortRef.current?.abort();
      const ctrl = new AbortController();
      usdaAbortRef.current = ctrl;
      setUsdaLoading(true);
      fetchUsdaCropAtPoint(next.lat, next.lon, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          if (res?.inCONUS && res.cdlName && res.year) {
            onSelectCandidate({
              ...next,
              usdaCrop: { year: res.year, cdlName: res.cdlName },
            });
          } else {
            onSelectCandidate({ ...next, usdaCrop: null });
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setUsdaLoading(false);
        });
    },
    [flyTo, onSelectCandidate],
  );

  useEffect(() => {
    if (candidate) {
      setManualLat(candidate.lat.toFixed(4));
      setManualLon(candidate.lon.toFixed(4));
    }
  }, [candidate]);

  // Search debounce
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearchHint(null);
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const list = await searchLocations(trimmed);
        setResults(list);
        setHasSearched(true);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query]);

  // Overpass debounced parcel fetch when enabled and zoom >= 13
  useEffect(() => {
    if (!detectParcelsOn || !mapBounds) {
      if (!detectParcelsOn) {
        setDetectedParcels([]);
        setDetectError(null);
      }
      return;
    }
    if (mapZoom < 13) {
      setDetectedParcels([]);
      setDetectError(null);
      return;
    }

    const t = setTimeout(async () => {
      overpassAbortRef.current?.abort();
      const ctrl = new AbortController();
      overpassAbortRef.current = ctrl;
      setDetecting(true);
      setDetectError(null);
      try {
        const { parcels } = await fetchOsmParcels(mapBounds, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setDetectedParcels(parcels);
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          setDetectError(
            err instanceof Error && err.name === 'AbortError'
              ? null
              : 'overpass-timeout',
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setDetecting(false);
      }
    }, 650);

    return () => clearTimeout(t);
  }, [detectParcelsOn, mapZoom, mapBounds]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim().length < 2) {
      e.preventDefault();
      setSearchHint(
        isEn
          ? 'Type your town, county, or valley name to search.'
          : 'Escribe el nombre de tu pueblo, municipio o valle para buscarlo.',
      );
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus(
        isEn
          ? 'GPS is not available in this browser. Tap your field directly on the map.'
          : 'Tu teléfono o navegador no permite usar GPS aquí. Toca tu parcela en el mapa.',
      );
      return;
    }
    setGpsStatus(isEn ? 'Finding your GPS location…' : 'Buscando tu ubicación por GPS…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(5);
        const lon = +pos.coords.longitude.toFixed(5);
        setGpsStatus(null);
        setSelectedParcelId(null);
        chooseLocation(
          { lat, lon, name: isEn ? 'My field (GPS location)' : 'Mi parcela ubicada con GPS' },
          15,
        );
      },
      () => {
        setGpsStatus(
          isEn
            ? 'Could not read GPS. Allow location access or tap directly on the map.'
            : 'No pudimos leer el GPS. Permite el acceso o toca directo en el mapa.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleManualCoords = () => {
    const la = Number(manualLat);
    const lo = Number(manualLon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -85 || la > 85 || lo < -180 || lo > 180) {
      setGpsStatus(
        isEn
          ? 'Invalid coordinates. Latitude: -85 to 85, Longitude: -180 to 180.'
          : 'Coordenadas inválidas. Latitud: -85 a 85, Longitud: -180 a 180.',
      );
      return;
    }
    setGpsStatus(null);
    setSelectedParcelId(null);
    chooseLocation(
      {
        lat: la,
        lon: lo,
        name: isEn
          ? `Selected field (${la.toFixed(3)}, ${lo.toFixed(3)})`
          : `Parcela elegida (${la.toFixed(3)}, ${lo.toFixed(3)})`,
      },
      14,
    );
  };

  const selectPilot = (rawPilot: PilotParcel) => {
    const p = localizePilot(rawPilot, locale);
    setSelectedParcelId(null);
    setDrawingMode(false);
    setDrawPoints([]);
    chooseLocation(
      {
        lat: p.lat,
        lon: p.lon,
        name: p.name,
        climateTag: p.climateTag,
        pilotId: p.id,
      },
      14,
    );
  };

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      if (drawingMode) {
        setDrawPoints((prev) => [...prev, [lat, lon]]);
        return;
      }
      setSelectedParcelId(null);
      chooseLocation({
        lat,
        lon,
        name: isEn
          ? `Pinned field (${lat.toFixed(3)}, ${lon.toFixed(3)})`
          : `Parcela marcada (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
      });
    },
    [drawingMode, chooseLocation, isEn],
  );

  const handleSelectOsmParcel = (parcel: DetectedParcel) => {
    if (drawingMode) return;
    setSelectedParcelId(parcel.id);
    const [clat, clon] = parcel.center;
    const luLabel = getLanduseLabel(parcel.landuse, locale);
    const detailName = parcel.name ?? (parcel.cropTag ? `${isEn ? 'Crop' : 'Cultivo'}: ${parcel.cropTag}` : undefined);
    chooseLocation({
      lat: clat,
      lon: clon,
      name: detailName ? `${luLabel} · ${detailName}` : `${luLabel} (${parcel.areaHa} ha)`,
      areaHa: parcel.areaHa,
      polygon: parcel.polygon,
    });
  };

  const finishDrawing = () => {
    if (drawPoints.length < 3) return;
    const areaHa = computePolygonAreaHa(drawPoints);
    const [clat, clon] = computePolygonCentroid(drawPoints);
    setDrawingMode(false);
    setSelectedParcelId('custom-drawn');
    chooseLocation({
      lat: clat,
      lon: clon,
      name: isEn ? `My drawn field (${areaHa} ha)` : `Mi parcela dibujada (${areaHa} ha)`,
      areaHa,
      polygon: drawPoints,
    });
    setDrawPoints([]);
  };

  const handleMoveEnd = useCallback(
    (zoom: number, bounds: { south: number; west: number; north: number; east: number }) => {
      setMapZoom(zoom);
      setMapBounds(bounds);
    },
    [],
  );

  // Derive localized display text if current candidate comes from a pilot parcel
  const activePilot = candidate?.pilotId
    ? PILOT_PARCELS.find((p) => p.id === candidate.pilotId)
    : undefined;
  const displayPilot = activePilot ? localizePilot(activePilot, locale) : null;
  const displayCandidateName = displayPilot?.name ?? candidate?.name ?? '';
  const displayClimateTag = displayPilot?.climateTag ?? candidate?.climateTag;

  const drawnAreaLive = drawPoints.length >= 3 ? computePolygonAreaHa(drawPoints) : 0;
  const centerLat = candidate?.lat ?? 34.5;
  const centerLon = candidate?.lon ?? -101.5;

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#234E36]/25 bg-[#E7EFE9] px-3 py-1 text-xs font-bold text-[#1B3B2B]">
              <Sprout className="h-3.5 w-3.5 text-[#234E36]" />
              {isEn ? 'Step 1 of 5 · Pick your land' : 'Paso 1 de 5 · Elige dónde siembras'}
            </span>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-[#2A2118] sm:text-3xl">
              {isEn ? 'Where is your field?' : '¿Dónde está tu parcela?'}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[#524333]">
              {isEn
                ? 'Search your town or county, use your phone GPS, outline your field corners, or tap directly on the satellite relief map.'
                : 'Busca tu pueblo o municipio, usa el GPS de tu teléfono, marca las esquinas de tu terreno o toca directo en el mapa satelital con relieve.'}
            </p>
          </div>
          <div className="rounded-xl border border-[#C87D18]/45 bg-[#FDF4E3] px-4 py-3 text-xs text-[#5B3808] lg:max-w-xs">
            <p className="font-bold text-[#7A4B0A]">
              {isEn ? 'First step to begin' : 'Paso necesario para empezar'}
            </p>
            <p className="mt-0.5 leading-relaxed">
              {isEn
                ? 'Pick and confirm your location first — then we will pull your local weather, soil, and planting options.'
                : 'Primero elige y confirma dónde está tu parcela; enseguida te mostramos el clima, la tierra y las opciones para sembrar.'}
            </p>
          </div>
        </div>
      </div>

      {/* Search + Map Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Search & Examples */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <label htmlFor="parcel-search" className="block text-sm font-bold text-[#2A2118]">
              {isEn ? 'Search your town, county, or valley' : 'Busca tu pueblo, municipio o valle'}
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#7D6C58]" />
              <input
                id="parcel-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={isEn ? 'e.g. Lubbock, Fresno, Ames, Delicias…' : 'Ej. Delicias, Lubbock, Fresno, Sonora…'}
                className="w-full rounded-xl border border-[#C8B89E] bg-white py-2.5 pl-9 pr-10 text-sm text-[#2A2118] placeholder:text-[#8E7D68] focus:border-[#234E36] focus:outline-none focus:ring-2 focus:ring-[#234E36]/20"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-[#234E36]" />
              )}

              {results.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-[#C8B89E] bg-[#FAF6EE] py-1 shadow-elevated">
                  {results.map((r, i) => {
                    const pilotHit = r.pilotId
                      ? PILOT_PARCELS.find((p) => p.id === r.pilotId)
                      : undefined;
                    const locPilot = pilotHit ? localizePilot(pilotHit, locale) : null;
                    return (
                      <li key={`${r.lat}-${r.lon}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedParcelId(null);
                            chooseLocation(
                              {
                                lat: r.lat,
                                lon: r.lon,
                                name: locPilot
                                  ? locPilot.name
                                  : [r.name, r.region, r.country].filter(Boolean).join(', '),
                                pilotId: r.pilotId,
                              },
                              14,
                            );
                            setResults([]);
                            setHasSearched(false);
                            setQuery('');
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs hover:bg-[#EDE3D1]"
                        >
                          <div>
                            <p className="font-semibold text-[#2A2118]">
                              {locPilot ? locPilot.name : r.name}
                              {r.isPilot && (
                                <span className="ml-2 rounded bg-[#D99B26]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#6E4509]">
                                  {isEn ? 'Example' : 'Ejemplo'}
                                </span>
                              )}
                            </p>
                            <p className="text-[#6B5A46]">
                              {[r.region, locPilot ? locPilot.country : r.country].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {searchHint && <p className="mt-2 text-xs font-medium text-[#8C550E]">{searchHint}</p>}

            {query.trim().length >= 2 && !searching && hasSearched && results.length === 0 && (
              <p className="mt-2 rounded-xl border border-[#C87D18]/45 bg-[#FDF4E3] px-3 py-2 text-xs text-[#6E4509]">
                {isEn
                  ? 'No place found under that name. Try a nearby town or tap your land directly on the map.'
                  : 'No encontramos ese lugar. Prueba con el municipio más cercano o toca tu parcela directo en el mapa.'}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseGps}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#C8B89E] bg-white px-3.5 py-2 text-xs font-bold text-[#2A2118] hover:bg-[#F3EBDC]"
              >
                <Crosshair className="h-3.5 w-3.5 text-[#234E36]" />
                {isEn ? 'Use my GPS (I am on the field)' : 'Usar mi GPS (estoy en la parcela)'}
              </button>

              <button
                type="button"
                onClick={() => setShowCoords((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#5B4935] hover:bg-[#EFE5D5]"
              >
                <span>{isEn ? 'Have exact coordinates?' : '¿Tienes coordenadas exactas?'}</span>
                {showCoords ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            {showCoords && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#C8B89E] bg-[#F2E9DA] p-3">
                <input
                  type="text"
                  aria-label={isEn ? 'Latitude' : 'Latitud'}
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder={isEn ? 'Lat (e.g. 33.65)' : 'Latitud (ej. 28.22)'}
                  className="w-28 rounded-lg border border-[#C8B89E] bg-white px-2.5 py-1.5 font-mono text-xs text-[#2A2118]"
                />
                <input
                  type="text"
                  aria-label={isEn ? 'Longitude' : 'Longitud'}
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  placeholder={isEn ? 'Lon (e.g. -101.72)' : 'Longitud (ej. -105.41)'}
                  className="w-28 rounded-lg border border-[#C8B89E] bg-white px-2.5 py-1.5 font-mono text-xs text-[#2A2118]"
                />
                <button
                  type="button"
                  onClick={handleManualCoords}
                  className="rounded-lg bg-[#234E36] px-3 py-1.5 text-xs font-bold text-[#FAF6EE] hover:bg-[#1B3B2B]"
                >
                  {isEn ? 'Find' : 'Ubicar'}
                </button>
              </div>
            )}

            {gpsStatus && <p className="mt-2 text-xs font-semibold text-[#A84A28]">{gpsStatus}</p>}
          </div>

          {/* Example Parcels */}
          <div className="rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] p-5 shadow-card">
            <h2 className="text-sm font-bold text-[#2A2118]">
              {isEn ? 'Or try a real sample farm' : 'O prueba con una parcela de ejemplo'}
            </h2>
            <p className="mt-0.5 text-xs text-[#6B5A46]">
              {isEn
                ? 'Sample farming regions to explore how the guide works:'
                : 'Casos reales de zonas agrícolas para ver cómo funciona la guía:'}
            </p>
            <div className="mt-3 grid gap-2.5">
              {PILOT_PARCELS.map((raw) => {
                const p = localizePilot(raw, locale);
                const selected =
                  candidate &&
                  Math.abs(candidate.lat - p.lat) < 0.01 &&
                  Math.abs(candidate.lon - p.lon) < 0.01;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPilot(raw)}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? 'border-[#234E36] bg-[#EAF2EC] ring-1 ring-[#234E36]'
                        : 'border-[#C8B89E] bg-white/80 hover:border-[#234E36]/60 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-[#2A2118]">{p.name}</span>
                      <span
                        className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          p.inCONUS
                            ? 'border-sky-300 bg-sky-50 text-sky-900'
                            : 'border-[#C8B89E] bg-[#F3EBDC] text-[#5B4935]'
                        }`}
                      >
                        {p.country}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-[#234E36]">{p.climateTag}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[#524333]">{p.summary}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Interactive Satellite Map + Parcel Tools + Confirmation Card */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="relative z-0 isolate overflow-hidden rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] shadow-card">
            {/* Map Title & Basemap Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C8B89E] px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2A2118]">
                <MapIcon className="h-4 w-4 text-[#234E36]" />
                {isEn ? 'Satellite map with terrain & boundaries' : 'Mapa satelital con relieve y linderos'}
              </div>
              <div className="inline-flex rounded-lg border border-[#C8B89E] bg-[#EFE5D5] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setBasemap('sat')}
                  className={`rounded-md px-2.5 py-1 font-bold transition ${
                    basemap === 'sat' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
                  }`}
                >
                  {isEn ? 'Satellite + relief' : 'Satélite + relieve'}
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap('topo')}
                  className={`rounded-md px-2.5 py-1 font-bold transition ${
                    basemap === 'topo' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
                  }`}
                >
                  {isEn ? 'Topo' : 'Topográfico'}
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap('light')}
                  className={`rounded-md px-2.5 py-1 font-bold transition ${
                    basemap === 'light' ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
                  }`}
                >
                  {isEn ? 'Streets' : 'Calles'}
                </button>
              </div>
            </div>

            {/* Parcel & Overlay Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#C8B89E]/70 bg-[#F2E9DA] px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setDetectParcelsOn((v) => !v);
                  setDrawingMode(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  detectParcelsOn
                    ? 'border-[#1B3B2B] bg-[#234E36] text-[#FAF6EE] shadow-sm'
                    : 'border-[#C8B89E] bg-[#FAF6EE] text-[#2A2118] hover:bg-white'
                }`}
              >
                {detecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="h-3.5 w-3.5" />
                )}
                {isEn ? 'Find fields' : 'Detectar parcelas'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDrawingMode((v) => !v);
                  setDrawPoints([]);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  drawingMode
                    ? 'border-[#965B0F] bg-[#C87D18] text-white shadow-sm'
                    : 'border-[#C8B89E] bg-[#FAF6EE] text-[#2A2118] hover:bg-white'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
                {drawingMode
                  ? isEn
                    ? 'Drawing corners…'
                    : 'Dibujando esquinas…'
                  : isEn
                  ? 'Draw my field'
                  : 'Dibujar mi parcela'}
              </button>

              <button
                type="button"
                onClick={() => setShowBoundaries((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  showBoundaries
                    ? 'border-[#234E36]/40 bg-[#E7EFE9] text-[#1B3B2B]'
                    : 'border-[#C8B89E] bg-[#FAF6EE] text-[#6B5A46]'
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                {isEn ? 'Borders & roads' : 'Fronteras y caminos'}
              </button>

              <button
                type="button"
                onClick={() => setShowUsdaCdl((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  showUsdaCdl
                    ? 'border-[#C87D18] bg-[#FDF4E3] text-[#7A4B0A]'
                    : 'border-[#C8B89E] bg-[#FAF6EE] text-[#6B5A46]'
                }`}
              >
                <Sprout className="h-3.5 w-3.5" />
                {isEn ? 'U.S. crops (USDA)' : 'Cultivos EE. UU. (USDA)'}
              </button>
            </div>

            {/* Contextual Helper Bars for Detection / Drawing / USDA */}
            {detectParcelsOn && mapZoom < 13 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C87D18]/40 bg-[#FDF4E3] px-4 py-2 text-xs text-[#6E4509]">
                <span>
                  {isEn
                    ? `Zoom in closer to see mapped field borders (current zoom ${mapZoom}, needs 13).`
                    : `Acércate más al terreno para ver los linderos de parcelas (zoom actual ${mapZoom}, mínimo 13).`}
                </span>
                <button
                  type="button"
                  onClick={() => flyTo(centerLat, centerLon, 14)}
                  className="shrink-0 rounded-lg bg-[#C87D18] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#A66510]"
                >
                  {isEn ? 'Zoom in here' : 'Acercar aquí'}
                </button>
              </div>
            )}

            {detectParcelsOn && mapZoom >= 13 && !detecting && (
              <div className="border-b border-[#C8B89E]/70 bg-[#FAF6EE] px-4 py-2 text-xs text-[#524333]">
                {detectError ? (
                  <span className="font-semibold text-[#A84A28]">
                    {isEn
                      ? 'Field boundary service took too long; try zooming closer or use “Draw my field”.'
                      : 'El servicio de linderos tardó en responder; puedes acercarte más o usar "Dibujar mi parcela".'}
                  </span>
                ) : detectedParcels.length > 0 ? (
                  isEn ? (
                    <span>
                      <strong className="text-[#234E36]">{detectedParcels.length} fields found</strong> on screen. Tap one on the map to select it and measure hectares.
                    </span>
                  ) : (
                    <span>
                      <strong className="text-[#234E36]">{detectedParcels.length} parcelas detectadas</strong> en pantalla. Toca una en el mapa para seleccionarla y medir sus hectáreas.
                    </span>
                  )
                ) : isEn ? (
                  <span>
                    No mapped farm parcels found here in open data. Pan the map or use <strong>“Draw my field”</strong>.
                  </span>
                ) : (
                  <span>
                    No hay parcelas registradas aquí en datos abiertos. Mueve el mapa o usa <strong>“Dibujar mi parcela”</strong>.
                  </span>
                )}
              </div>
            )}

            {drawingMode && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C87D18]/45 bg-[#FDF4E3] px-4 py-2.5 text-xs text-[#5B3808]">
                <div>
                  <strong>
                    {isEn ? 'Tap the corners of your field on the map' : 'Toca las esquinas de tu terreno en el mapa'}
                  </strong>{' '}
                  ({drawPoints.length} {isEn ? 'points' : 'puntos'}
                  {drawnAreaLive > 0 ? ` · ${drawnAreaLive} ${isEn ? 'ha est.' : 'ha aprox.'}` : ''}).
                </div>
                <div className="flex items-center gap-1.5">
                  {drawPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C8B89E] bg-white px-2.5 py-1 font-semibold text-[#2A2118]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {isEn ? 'Undo' : 'Deshacer'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={drawPoints.length < 3}
                    onClick={finishDrawing}
                    className="rounded-lg bg-[#234E36] px-3 py-1 font-bold text-[#FAF6EE] disabled:opacity-45"
                  >
                    {isEn ? 'Finish field' : 'Terminar parcela'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawingMode(false);
                      setDrawPoints([]);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#C8B89E] bg-white px-2.5 py-1 font-semibold text-[#6B5A46]"
                  >
                    <X className="h-3 w-3" />
                    {isEn ? 'Cancel' : 'Cancelar'}
                  </button>
                </div>
              </div>
            )}

            <div className={`h-[390px] w-full sm:h-[460px] ${drawingMode ? 'cursor-crosshair' : ''}`}>
              <MapContainer center={[centerLat, centerLon]} zoom={candidate ? 14 : 4} className="h-full w-full">
                <SatelliteBaseLayers
                  basemap={basemap}
                  showBoundaries={showBoundaries}
                  showUsdaCdl={showUsdaCdl}
                />

                <MapController target={flyTarget} />
                <MapEventBridge
                  drawing={drawingMode}
                  onClickPoint={handleMapClick}
                  onMoveEnd={handleMoveEnd}
                />

                {/* Detected OSM Polygons */}
                {detectedParcels.map((parcel) => {
                  const isSel = parcel.id === selectedParcelId;
                  const luLabel = getLanduseLabel(parcel.landuse, locale);
                  return (
                    <Polygon
                      key={parcel.id}
                      positions={parcel.polygon}
                      pathOptions={{
                        color: isSel ? '#D99B26' : '#234E36',
                        fillColor: isSel ? '#D99B26' : '#4E8C62',
                        weight: isSel ? 3.5 : 2,
                        fillOpacity: isSel ? 0.38 : 0.2,
                      }}
                      eventHandlers={{
                        click: (e) => {
                          e.originalEvent.stopPropagation();
                          handleSelectOsmParcel(parcel);
                        },
                      }}
                    >
                      <Popup>
                        <div className="text-xs">
                          <p className="font-bold text-[#2A2118]">{luLabel}</p>
                          {(parcel.name || parcel.cropTag) && (
                            <p className="text-[#524333]">
                              {parcel.name ?? `${isEn ? 'Crop' : 'Cultivo'}: ${parcel.cropTag}`}
                            </p>
                          )}
                          <p className="font-semibold text-[#234E36]">
                            {parcel.areaHa} {isEn ? 'hectares' : 'hectáreas'}
                          </p>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                })}

                {/* Active candidate polygon (drawn or selected OSM) */}
                {candidate?.polygon && selectedParcelId === 'custom-drawn' && (
                  <Polygon
                    positions={candidate.polygon}
                    pathOptions={{
                      color: '#D99B26',
                      fillColor: '#D99B26',
                      weight: 3.5,
                      fillOpacity: 0.32,
                    }}
                  />
                )}

                {/* In-progress drawing preview */}
                {drawingMode && drawPoints.length > 0 && (
                  <>
                    {drawPoints.length >= 3 ? (
                      <Polygon
                        positions={drawPoints}
                        pathOptions={{
                          color: '#D99B26',
                          fillColor: '#D99B26',
                          weight: 3,
                          dashArray: '6 4',
                          fillOpacity: 0.25,
                        }}
                      />
                    ) : (
                      <Polyline
                        positions={drawPoints}
                        pathOptions={{ color: '#D99B26', weight: 3, dashArray: '6 4' }}
                      />
                    )}
                    {drawPoints.map((pt, idx) => (
                      <CircleMarker
                        key={idx}
                        center={pt}
                        radius={5}
                        pathOptions={{ color: '#1B3B2B', fillColor: '#D99B26', fillOpacity: 1, weight: 2 }}
                      />
                    ))}
                  </>
                )}

                {candidate && !drawingMode && (
                  <Marker position={[candidate.lat, candidate.lon]} icon={parcelPinIcon}>
                    <Popup>
                      <div className="text-xs">
                        <p className="font-bold text-[#2A2118]">{displayCandidateName}</p>
                        {candidate.areaHa && (
                          <p className="font-semibold text-[#234E36]">
                            {candidate.areaHa} {isEn ? 'ha measured' : 'ha medidas'}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            {showUsdaCdl && (
              <div className="flex flex-wrap items-center gap-3 border-t border-[#C8B89E] bg-[#F2E9DA] px-4 py-2 text-[11px] text-[#524333]">
                <span className="font-bold text-[#2A2118]">
                  {isEn ? 'USDA Crop map (U.S.):' : 'Mapa de cultivos USDA (EE. UU.):'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#eab308]" /> {isEn ? 'Corn' : 'Maíz'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#16a34a]" /> {isEn ? 'Soybeans' : 'Soya'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#dc2626]" /> {isEn ? 'Cotton / Veg' : 'Algodón / Hortaliza'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#92400e]" /> {isEn ? 'Wheat / Barley' : 'Trigo / Cebada'}
                </span>
              </div>
            )}
          </div>

          {/* Confirmation Card */}
          <div className="rounded-2xl border-2 border-[#234E36]/35 bg-[#FAF6EE] p-5 shadow-card">
            {candidate ? (
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7EFE9] text-[#234E36]">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[#234E36]">
                      {isEn ? 'Field ready to check' : 'Parcela lista para revisar'}
                    </p>
                    <p className="text-base font-extrabold text-[#2A2118]">{displayCandidateName}</p>
                    {displayClimateTag && (
                      <p className="text-xs text-[#524333]">{displayClimateTag}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {candidate.areaHa && (
                        <span className="rounded-full border border-[#234E36]/30 bg-[#E7EFE9] px-2.5 py-0.5 text-[11px] font-bold text-[#1B3B2B]">
                          {isEn ? `Measured size: ${candidate.areaHa} ha` : `Superficie medida: ${candidate.areaHa} ha`}
                        </span>
                      )}
                      {usdaLoading && (
                        <span className="rounded-full border border-[#C8B89E] bg-[#F2E9DA] px-2.5 py-0.5 text-[11px] text-[#5B4935]">
                          {isEn ? 'Checking USDA crop record…' : 'Revisando cultivo USDA…'}
                        </span>
                      )}
                      {!usdaLoading && candidate.usdaCrop && (
                        <span className="rounded-full border border-[#C87D18]/40 bg-[#FDF4E3] px-2.5 py-0.5 text-[11px] font-bold text-[#7A4B0A]">
                          {isEn
                            ? `Crop mapped by USDA (${candidate.usdaCrop.year}): ${candidate.usdaCrop.cdlName}`
                            : `Cultivo visto por USDA (${candidate.usdaCrop.year}): ${candidate.usdaCrop.cdlName}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onConfirmParcel({ ...candidate, name: displayCandidateName })}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#234E36] px-5 py-3 text-sm font-bold text-[#FAF6EE] shadow-sm transition hover:bg-[#1B3B2B] disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isEn ? 'Checking weather & soil…' : 'Revisando clima y tierra…'}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-[#D99B26]" />
                      {isEn ? 'Confirm this field & continue' : 'Confirmar mi parcela y continuar'}
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-[#524333]">
                <MapPin className="h-5 w-5 shrink-0 text-[#8E7D68]" />
                {isEn
                  ? 'Pick a sample farm on the left, search your town, or tap/draw your field on the map to begin.'
                  : 'Elige un ejemplo de la izquierda, busca tu municipio o toca/dibuja tu parcela en el mapa para empezar.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
