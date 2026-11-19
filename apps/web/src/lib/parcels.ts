import type { Locale } from '@fieldshift/core';

/**
 * Client-side parcel geometry utilities and cached OpenStreetMap Overpass loader
 * for detecting agricultural fields (farmland, orchard, vineyard) worldwide.
 */

export type ParcelLanduse = 'farmland' | 'orchard' | 'vineyard' | 'drawn';

export interface DetectedParcel {
  id: string;
  landuse: ParcelLanduse;
  label: string;
  name?: string;
  cropTag?: string;
  polygon: [number, number][]; // [lat, lon][]
  center: [number, number]; // [lat, lon]
  areaHa: number;
}

const LANDUSE_LABELS_I18N: Record<Locale, Record<ParcelLanduse, string>> = {
  en: {
    farmland: 'Farm field',
    orchard: 'Orchard / fruit trees',
    vineyard: 'Vineyard',
    drawn: 'Your drawn field',
  },
  es: {
    farmland: 'Parcela agrícola',
    orchard: 'Huerta / frutales',
    vineyard: 'Viñedo',
    drawn: 'Parcela marcada por ti',
  },
};

export function getLanduseLabel(landuse: ParcelLanduse, locale: Locale = 'en'): string {
  return LANDUSE_LABELS_I18N[locale][landuse];
}

/**
 * Shoelace polygon area on a local tangent-plane projection (hectares).
 * Accurate within <0.2 % at parcel scale (0.1–5,000 ha).
 */
export function computePolygonAreaHa(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const meanLatRad =
    (ring.reduce((acc, p) => acc + p[0], 0) / ring.length) * (Math.PI / 180);
  const metersPerDegLat = 111_132.9;
  const metersPerDegLon = Math.max(1000, 111_320 * Math.cos(meanLatRad));

  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lon1] = ring[i];
    const [lat2, lon2] = ring[(i + 1) % ring.length];
    const x1 = lon1 * metersPerDegLon;
    const y1 = lat1 * metersPerDegLat;
    const x2 = lon2 * metersPerDegLon;
    const y2 = lat2 * metersPerDegLat;
    area2 += x1 * y2 - x2 * y1;
  }
  const sqMeters = Math.abs(area2) / 2;
  return +(sqMeters / 10_000).toFixed(2);
}

export function computePolygonCentroid(ring: [number, number][]): [number, number] {
  if (ring.length === 0) return [0, 0];
  const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lon = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [+lat.toFixed(5), +lon.toFixed(5)];
}

// ── In-memory LRU-like cache for Overpass bounding boxes (10 min TTL) ───────

interface CachedBox {
  ts: number;
  parcels: DetectedParcel[];
}

const OVERPASS_CACHE = new Map<string, CachedBox>();
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 40;

function bboxKey(s: number, w: number, n: number, e: number): string {
  const snap = (v: number) => (Math.round(v / 0.005) * 0.005).toFixed(3);
  return `${snap(s)},${snap(w)},${snap(n)},${snap(e)}`;
}

interface OverpassElement {
  type: 'way';
  id: number;
  tags?: { landuse?: string; name?: string; crop?: string };
  geometry?: { lat: number; lon: number }[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export async function fetchOsmParcels(
  bounds: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal,
): Promise<{ parcels: DetectedParcel[]; fromCache: boolean }> {
  const { south, west, north, east } = bounds;
  const key = bboxKey(south, west, north, east);

  const cached = OVERPASS_CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { parcels: cached.parcels, fromCache: true };
  }

  const query = `[out:json][timeout:12];(way["landuse"~"^(farmland|orchard|vineyard)$"](${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}););out body geom 120;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });

  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status}`);
  }

  const data = (await res.json()) as OverpassResponse;
  const parcels: DetectedParcel[] = [];

  for (const el of data.elements ?? []) {
    if (!el.geometry || el.geometry.length < 4) continue;
    const rawLu = el.tags?.landuse;
    const landuse: ParcelLanduse =
      rawLu === 'orchard' || rawLu === 'vineyard' ? rawLu : 'farmland';

    // Remove closing duplicate node for clean calculations
    const pts: [number, number][] = el.geometry.map((g) => [g.lat, g.lon]);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const ring =
      first[0] === last[0] && first[1] === last[1] ? pts.slice(0, -1) : pts;
    if (ring.length < 3) continue;

    const areaHa = computePolygonAreaHa(ring);
    if (areaHa < 0.05 || areaHa > 5000) continue;

    const center = computePolygonCentroid(ring);
    parcels.push({
      id: `osm-${el.id}`,
      landuse,
      label: LANDUSE_LABELS_I18N.en[landuse],
      name: el.tags?.name,
      cropTag: el.tags?.crop,
      polygon: ring,
      center,
      areaHa,
    });
  }

  if (OVERPASS_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldest = OVERPASS_CACHE.keys().next().value;
    if (oldest) OVERPASS_CACHE.delete(oldest);
  }
  OVERPASS_CACHE.set(key, { ts: Date.now(), parcels });

  return { parcels, fromCache: false };
}
