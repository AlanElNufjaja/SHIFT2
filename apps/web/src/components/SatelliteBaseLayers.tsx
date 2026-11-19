import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOverlay, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';

export type BasemapMode = 'sat' | 'topo' | 'light';

interface Props {
  basemap: BasemapMode;
  showBoundaries: boolean;
  showUsdaCdl: boolean;
  inCONUS?: boolean;
}

/**
 * GMU CropScape WMS (`wms_cdlall.cgi`) serves EPSG:4326 and EPSG:5070 (not EPSG:3857),
 * so a standard Leaflet WMS TileLayer receives ServiceException XML. Using an ImageOverlay
 * synchronized to the current viewport bounds in EPSG:4326 renders crisp crop polygons.
 */
function UsdaCropOverlay() {
  const map = useMap();
  const [view, setView] = useState<{
    bounds: [[number, number], [number, number]];
    url: string;
  } | null>(null);

  const sync = useCallback(() => {
    const b = map.getBounds();
    const s = Math.max(-85, b.getSouth());
    const n = Math.min(85, b.getNorth());
    const w = b.getWest();
    const e = b.getEast();
    const sz = map.getSize();
    const width = Math.max(256, Math.min(1400, Math.round(sz.x || 800)));
    const height = Math.max(256, Math.min(1000, Math.round(sz.y || 500)));

    const url =
      `https://nassgeodata.gmu.edu/CropScapeService/wms_cdlall.cgi` +
      `?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=cdl_2024&STYLES=` +
      `&SRS=EPSG:4326&BBOX=${w.toFixed(5)},${s.toFixed(5)},${e.toFixed(5)},${n.toFixed(5)}` +
      `&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/png&TRANSPARENT=true`;

    setView({
      bounds: [
        [s, w],
        [n, e],
      ],
      url,
    });
  }, [map]);

  useEffect(() => {
    sync();
  }, [sync]);

  useMapEvents({
    moveend: sync,
    zoomend: sync,
  });

  if (!view) return null;

  return (
    <ImageOverlay
      url={view.url}
      bounds={view.bounds as LatLngBoundsExpression}
      opacity={0.62}
      zIndex={320}
      attribution="USDA NASS CropScape"
    />
  );
}

/**
 * Street basemap without API key: uses Esri World Street Map by default,
 * falling back automatically to OpenStreetMap standard tiles if >= 3 tiles fail.
 */
function StreetBasemapLayer() {
  const [useOsmFallback, setUseOsmFallback] = useState(false);
  const errorCountRef = useRef(0);

  if (useOsmFallback) {
    return (
      <TileLayer
        key="osm-street"
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
    );
  }

  return (
    <TileLayer
      key="esri-street"
      attribution="Calles &copy; Esri"
      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
      maxZoom={19}
      eventHandlers={{
        tileload: () => {
          errorCountRef.current = 0;
        },
        tileerror: () => {
          errorCountRef.current += 1;
          if (errorCountRef.current >= 3) {
            setUseOsmFallback(true);
          }
        },
      }}
    />
  );
}

/**
 * Reusable map base + relief + reference layers without paid API keys:
 * - Esri World Imagery + Esri World Hillshade (multiply blend for topographic volume)
 * - Esri World Boundaries & Places + World Transportation
 * - Esri World Street Map (with OpenStreetMap fallback) for "Calles"
 * - Optional USDA CropScape CDL overlay (United States)
 */
export function SatelliteBaseLayers({
  basemap,
  showBoundaries,
  showUsdaCdl,
  inCONUS = true,
}: Props) {
  return (
    <>
      {basemap === 'sat' && (
        <>
          <TileLayer
            attribution="Imagen &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <TileLayer
            attribution="Relieve &copy; Esri"
            url="https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
            opacity={0.28}
            maxNativeZoom={13}
            maxZoom={19}
            className="fs-hillshade-layer"
            zIndex={200}
          />
          {showBoundaries && (
            <>
              <TileLayer
                url="https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
                zIndex={350}
              />
              <TileLayer
                url="https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                opacity={0.85}
                maxZoom={19}
                zIndex={355}
              />
            </>
          )}
        </>
      )}

      {basemap === 'topo' && (
        <TileLayer
          attribution="&copy; OpenTopoMap (CC-BY-SA)"
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          maxZoom={17}
        />
      )}

      {basemap === 'light' && <StreetBasemapLayer />}

      {showUsdaCdl && inCONUS && <UsdaCropOverlay />}
    </>
  );
}
