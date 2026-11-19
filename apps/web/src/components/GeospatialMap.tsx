import { useState } from 'react';
import { Layers } from 'lucide-react';
import { MapContainer, Marker, Polygon, Popup, Rectangle, TileLayer } from 'react-leaflet';
import { getTextureLabel } from '@fieldshift/core';
import type { Locale, SiteProfile } from '@fieldshift/core';
import { useLocale } from '../i18n/LocaleContext';
import { parcelPinIcon } from '../lib/mapPin';
import { SatelliteBaseLayers } from './SatelliteBaseLayers';
import type { BasemapMode } from './SatelliteBaseLayers';

type OverlayId = 'none' | 'ndvi' | 'smap' | 'imerg' | 'lst' | 'cdl' | 'grid';

interface OverlayMeta {
  id: OverlayId;
  label: string;
  source: string;
  legend: string;
  gradient: string;
  conusOnly?: boolean;
}

const OVERLAYS_I18N: Record<Locale, OverlayMeta[]> = {
  en: [
    {
      id: 'ndvi',
      label: 'Plant greenness',
      source: 'MODIS satellite (crop cover)',
      legend: 'Brown: bare dirt · Light green: thin plants · Dark green: thick healthy crop',
      gradient: 'linear-gradient(to right, #a16207, #fde047, #65a30d, #14532d)',
    },
    {
      id: 'smap',
      label: 'Soil moisture',
      source: 'SMAP satellite (topsoil)',
      legend: 'Yellow: dry dirt · Light blue: damp · Deep blue: very wet',
      gradient: 'linear-gradient(to right, #fef08a, #67e8f9, #0284c7, #1e3a8a)',
    },
    {
      id: 'imerg',
      label: 'Recent rain',
      source: 'GPM satellite (rainfall)',
      legend: 'Light to deep blue: light to heavy rain · Orange/rust: downpour',
      gradient: 'linear-gradient(to right, #bae6fd, #0284c7, #1d4ed8, #c2410c)',
    },
    {
      id: 'lst',
      label: 'Ground heat',
      source: 'MODIS satellite (daytime heat)',
      legend: 'Blue/green: cool · Yellow: warm · Red: scorching soil',
      gradient: 'linear-gradient(to right, #38bdf8, #86efac, #facc15, #dc2626)',
    },
    {
      id: 'cdl',
      label: 'Past U.S. crops',
      source: 'USDA Crop map (U.S.)',
      legend: 'Yellow: corn · Green: soybeans · Gray: cotton · Brown: wheat',
      gradient: 'linear-gradient(to right, #eab308, #16a34a, #94a3b8, #92400e)',
      conusOnly: true,
    },
    {
      id: 'grid',
      label: 'Sensor boxes',
      source: 'Area covered by each weather grid',
      legend: 'Green: your field square · Blue: local weather (~9 km) · Orange: wide weather grid (~55 km)',
      gradient: 'linear-gradient(to right, #15803d, #0284c7, #d97706)',
    },
    {
      id: 'none',
      label: 'Clean photo / map',
      source: 'Clear view with no color layers',
      legend: 'Shows your parcel with terrain shading and roads without extra layers.',
      gradient: 'linear-gradient(to right, #e7e5e4, #a8a29e)',
    },
  ],
  es: [
    {
      id: 'ndvi',
      label: 'Qué tan verde está',
      source: 'Satélite MODIS (vegetación)',
      legend: 'Café: tierra pelona · Verde claro: poco pasto o cultivo · Verde oscuro: cultivo tupido',
      gradient: 'linear-gradient(to right, #a16207, #fde047, #65a30d, #14532d)',
    },
    {
      id: 'smap',
      label: 'Humedad de la tierra',
      source: 'Satélite SMAP (capa superficial)',
      legend: 'Amarillo: tierra seca · Azul claro: húmeda · Azul fuerte: muy mojada',
      gradient: 'linear-gradient(to right, #fef08a, #67e8f9, #0284c7, #1e3a8a)',
    },
    {
      id: 'imerg',
      label: 'Lluvia reciente',
      source: 'Satélite GPM (lluvia)',
      legend: 'Azul claro a azul fuerte: lluvia ligera a fuerte · Naranja/terracota: aguacero',
      gradient: 'linear-gradient(to right, #bae6fd, #0284c7, #1d4ed8, #c2410c)',
    },
    {
      id: 'lst',
      label: 'Calor del suelo',
      source: 'Satélite MODIS (temperatura de día)',
      legend: 'Azul/verde: fresco · Amarillo: templado · Rojo: suelo muy caliente',
      gradient: 'linear-gradient(to right, #38bdf8, #86efac, #facc15, #dc2626)',
    },
    {
      id: 'cdl',
      label: 'Qué se sembró antes',
      source: 'Mapa agrícola USDA (EE. UU.)',
      legend: 'Amarillo: maíz · Verde: soya · Gris: algodón · Café: trigo',
      gradient: 'linear-gradient(to right, #eab308, #16a34a, #94a3b8, #92400e)',
      conusOnly: true,
    },
    {
      id: 'grid',
      label: 'Tamaño de las mediciones',
      source: 'Cuadros que cubre cada satélite',
      legend: 'Verde: cuadro de tu parcela · Azul: clima cercano (~9 km) · Naranja: clima regional (~55 km)',
      gradient: 'linear-gradient(to right, #15803d, #0284c7, #d97706)',
    },
    {
      id: 'none',
      label: 'Solo foto / mapa',
      source: 'Vista limpia sin colores encima',
      legend: 'Muestra tu parcela con relieve y fronteras sin capas encima.',
      gradient: 'linear-gradient(to right, #e7e5e4, #a8a29e)',
    },
  ],
};

interface Props {
  site: SiteProfile;
  parcelPolygon?: [number, number][];
}

export function GeospatialMap({ site, parcelPolygon }: Props) {
  const { locale } = useLocale();
  const isEn = locale === 'en';
  const [basemap, setBasemap] = useState<BasemapMode>('sat');
  const [overlay, setOverlay] = useState<OverlayId>('ndvi');

  const gibsDate = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const availableOverlays = OVERLAYS_I18N[locale].filter((o) => !o.conusOnly || site.location.inCONUS);
  const activeOverlay = availableOverlays.find((o) => o.id === overlay) ?? availableOverlays[0];

  const zoom = overlay === 'grid' ? 9 : parcelPolygon ? 14 : 11;

  return (
    <div className="relative z-0 isolate overflow-hidden rounded-2xl border border-[#C8B89E] bg-[#FAF6EE] shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C8B89E] px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#234E36]" />
          <h3 className="text-sm font-bold text-[#2A2118]">
            {isEn ? 'Map of your field & surroundings' : 'Mapa de tu parcela y sus alrededores'}
          </h3>
        </div>

        <div className="inline-flex rounded-lg border border-[#C8B89E] bg-[#EFE5D5] p-0.5 text-xs">
          {(
            [
              ['sat', isEn ? 'Satellite + relief' : 'Satélite + relieve'],
              ['topo', isEn ? 'Hills & terrain' : 'Cerros y relieve'],
              ['light', isEn ? 'Streets' : 'Calles'],
            ] as const
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBasemap(id)}
              className={`rounded-md px-2.5 py-1 font-bold transition ${
                basemap === id ? 'bg-[#FAF6EE] text-[#1B3B2B] shadow-sm' : 'text-[#5B4935]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Layer Selector Chips */}
      <div className="flex flex-wrap gap-1.5 border-b border-[#C8B89E]/70 bg-[#F2E9DA] px-4 py-2.5">
        {availableOverlays.map((ov) => (
          <button
            key={ov.id}
            type="button"
            onClick={() => setOverlay(ov.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              overlay === ov.id
                ? 'bg-[#234E36] text-[#FAF6EE] shadow-sm'
                : 'border border-[#C8B89E] bg-[#FAF6EE] text-[#2A2118] hover:bg-white'
            }`}
          >
            {ov.label}
          </button>
        ))}
      </div>

      <div className="relative h-[340px] w-full sm:h-[400px]">
        <MapContainer
          key={`${site.id}-${zoom}`}
          center={[site.location.lat, site.location.lon]}
          zoom={zoom}
          className="h-full w-full"
        >
          <SatelliteBaseLayers
            basemap={basemap}
            showBoundaries
            showUsdaCdl={overlay === 'cdl'}
            inCONUS={site.location.inCONUS}
          />

          {overlay === 'ndvi' && (
            <TileLayer
              url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`}
              maxNativeZoom={9}
              maxZoom={18}
              opacity={0.7}
              zIndex={310}
              attribution="NASA GIBS MODIS NDVI"
            />
          )}
          {overlay === 'smap' && (
            <TileLayer
              url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L4_Analyzed_Surface_Soil_Moisture/default/${gibsDate}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`}
              maxNativeZoom={6}
              maxZoom={18}
              opacity={0.65}
              zIndex={310}
              attribution="NASA GIBS SMAP L4"
            />
          )}
          {overlay === 'imerg' && (
            <TileLayer
              url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/${gibsDate}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`}
              maxNativeZoom={6}
              maxZoom={18}
              opacity={0.65}
              zIndex={310}
              attribution="NASA GIBS GPM IMERG"
            />
          )}
          {overlay === 'lst' && (
            <TileLayer
              url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/${gibsDate}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`}
              maxNativeZoom={7}
              maxZoom={18}
              opacity={0.65}
              zIndex={310}
              attribution="NASA GIBS MODIS LST"
            />
          )}

          {overlay === 'grid' && (
            <>
              {site.grid.nativeCells.map((cell) => {
                const color =
                  cell.sourceId === 'nasa-power'
                    ? '#d97706'
                    : cell.sourceId === 'era5'
                    ? '#0284c7'
                    : '#c2410c';
                const cellLabel = isEn
                  ? cell.sourceId === 'nasa-power'
                    ? 'Wide weather box (NASA POWER ~55 km)'
                    : cell.sourceId === 'era5'
                    ? 'Local weather box (ERA5 ~9 km)'
                    : 'Moisture box (SMAP ~9 km)'
                  : cell.label;
                return (
                  <Rectangle
                    key={cell.sourceId}
                    bounds={cell.bounds}
                    pathOptions={{ color, weight: 2, fillOpacity: 0.08, dashArray: '5 4' }}
                  >
                    <Popup>{cellLabel}</Popup>
                  </Rectangle>
                );
              })}
              <Rectangle
                bounds={site.grid.bounds}
                pathOptions={{ color: '#234E36', weight: 2.5, fillOpacity: 0.25 }}
              >
                <Popup>{isEn ? 'Your field check square (~1 km)' : 'Área de análisis de tu parcela'}</Popup>
              </Rectangle>
            </>
          )}

          {parcelPolygon && parcelPolygon.length >= 3 && (
            <Polygon
              positions={parcelPolygon}
              pathOptions={{
                color: '#D99B26',
                fillColor: '#D99B26',
                weight: 3,
                fillOpacity: 0.22,
              }}
            />
          )}

          <Marker position={[site.location.lat, site.location.lon]} icon={parcelPinIcon}>
            <Popup>
              <div className="space-y-1 text-xs">
                <p className="font-bold text-[#2A2118]">{site.location.name}</p>
                <p>
                  {isEn
                    ? `Elevation: ${site.terrain.elevationM} m · Slope: ${site.terrain.slopePct}%`
                    : `Altura: ${site.terrain.elevationM} m · Inclinación: ${site.terrain.slopePct} %`}
                </p>
                <p>
                  {isEn ? 'Soil:' : 'Tierra:'} {getTextureLabel(site.soil.texture, locale)}
                </p>
              </div>
            </Popup>
          </Marker>
        </MapContainer>

        {/* Floating info badge inside isolated map stacking context */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] max-w-xs rounded-xl border border-[#C8B89E] bg-[#FAF6EE]/95 px-3 py-2 text-[11px] shadow-card backdrop-blur">
          <p className="font-bold text-[#2A2118]">{activeOverlay.source}</p>
          <p className="text-[#5B4935]">
            {isEn ? 'Image date:' : 'Fecha de imagen:'} {gibsDate}
          </p>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex flex-col gap-1.5 border-t border-[#C8B89E] bg-[#F2E9DA] px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="h-3 w-24 shrink-0 rounded-full border border-[#C8B89E]"
            style={{ background: activeOverlay.gradient }}
          />
          <span className="text-[#2A2118]">{activeOverlay.legend}</span>
        </div>
      </div>
    </div>
  );
}
