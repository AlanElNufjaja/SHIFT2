import type { Crop, SiteProfile, SourceId, SourceMeta } from '@fieldshift/core';

export interface GeocodeResult {
  name: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat: number;
  lon: number;
  isPilot?: boolean;
  pilotId?: string;
}

export interface StreamProgressEvent {
  step: string;
  label: string;
  status: 'done' | 'fallback' | 'unavailable' | 'cached';
  ms: number;
  summary: string;
  doneCount: number;
  totalCount: number;
}

export async function searchLocations(query: string): Promise<GeocodeResult[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: GeocodeResult[] };
  return json.results ?? [];
}

export async function fetchCatalog(): Promise<{ crops: Crop[]; nassStatus?: string }> {
  const res = await fetch('/api/crops');
  if (!res.ok) throw new Error(`Error cargando catálogo (${res.status})`);
  const json = (await res.json()) as { crops: Crop[]; report?: { summary?: string } };
  return { crops: json.crops, nassStatus: json.report?.summary };
}

export async function fetchSourcesMeta(): Promise<{
  sources: Record<SourceId, SourceMeta>;
}> {
  const res = await fetch('/api/sources');
  if (!res.ok) throw new Error(`Error cargando fuentes (${res.status})`);
  return (await res.json()) as { sources: Record<SourceId, SourceMeta> };
}

export function streamSiteProfile(
  lat: number,
  lon: number,
  name: string | undefined,
  refresh: boolean,
  onProgress: (evt: StreamProgressEvent) => void,
): Promise<SiteProfile> {
  const params = new URLSearchParams({
    lat: lat.toFixed(5),
    lon: lon.toFixed(5),
    refresh: refresh ? '1' : '0',
  });
  if (name) params.set('name', name);

  return new Promise((resolve, reject) => {
    if (typeof EventSource === 'undefined') {
      fetch(`/api/site?${params.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as SiteProfile;
        })
        .then(resolve)
        .catch(reject);
      return;
    }

    const es = new EventSource(`/api/site/stream?${params.toString()}`);
    let settled = false;

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as StreamProgressEvent;
        onProgress(data);
      } catch {
        // Ignore malformed progress chunk
      }
    });

    es.addEventListener('complete', (e) => {
      settled = true;
      es.close();
      try {
        resolve(JSON.parse((e as MessageEvent).data) as SiteProfile);
      } catch (err) {
        reject(err);
      }
    });

    es.addEventListener('failed', (e) => {
      settled = true;
      es.close();
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { error?: string };
        reject(new Error(payload.error ?? 'Error cargando parcela'));
      } catch {
        reject(new Error('Error cargando datos satelitales'));
      }
    });

    es.onerror = () => {
      es.close();
      if (settled) return;
      // Clean fallback to standard JSON endpoint
      fetch(`/api/site?${params.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as SiteProfile;
        })
        .then(resolve)
        .catch(reject);
    };
  });
}

export interface UsdaPointCrop {
  inCONUS: boolean;
  year?: number;
  cdlCode?: number;
  cdlName?: string;
}

export async function fetchUsdaCropAtPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<UsdaPointCrop | null> {
  try {
    const res = await fetch(
      `/api/cdl-point?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`,
      { signal },
    );
    if (!res.ok) return null;
    return (await res.json()) as UsdaPointCrop;
  } catch {
    return null;
  }
}
