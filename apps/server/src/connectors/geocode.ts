import { PILOT_PARCELS } from '@fieldshift/core';
import { getCached, setCached } from '../lib/cache';
import { fetchJson } from '../lib/http';

export interface GeocodePlace {
  name: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat: number;
  lon: number;
  isPilot?: boolean;
  pilotId?: string;
}

interface OpenMeteoGeocodeResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
  }[];
}

interface NominatimReverseResponse {
  name?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export async function searchPlaces(query: string): Promise<GeocodePlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const qLower = q.toLowerCase();
  const pilotMatches: GeocodePlace[] = PILOT_PARCELS.filter(
    (p) =>
      p.name.toLowerCase().includes(qLower) ||
      p.region.toLowerCase().includes(qLower) ||
      p.country.toLowerCase().includes(qLower),
  ).map((p) => ({
    name: p.name,
    region: p.region,
    country: p.country,
    countryCode: p.inCONUS ? 'US' : 'MX',
    lat: p.lat,
    lon: p.lon,
    isPilot: true,
    pilotId: p.id,
  }));

  const cacheKey = `geo_q_${qLower}`;
  const cached = await getCached<GeocodePlace[]>(cacheKey);
  if (cached.hit) {
    return [...pilotMatches, ...cached.data];
  }

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es`;
  const res = await fetchJson<OpenMeteoGeocodeResponse>(url, undefined, 6000);
  const remote: GeocodePlace[] = (res.data?.results ?? []).map((r) => ({
    name: r.name,
    region: r.admin1,
    country: r.country,
    countryCode: r.country_code,
    lat: +r.latitude.toFixed(5),
    lon: +r.longitude.toFixed(5),
  }));

  if (remote.length > 0) {
    await setCached(cacheKey, remote, 12 * 3600_000);
  }

  return [...pilotMatches, ...remote].slice(0, 8);
}

export async function reverseGeocode(lat: number, lon: number): Promise<{
  name: string;
  region?: string;
  country?: string;
  countryCode?: string;
}> {
  const cacheKey = `rev_${lat.toFixed(3)}_${lon.toFixed(3)}`;
  const cached = await getCached<{ name: string; region?: string; country?: string; countryCode?: string }>(cacheKey);
  if (cached.hit) return cached.data;

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&format=jsonv2&zoom=10`;
  const res = await fetchJson<NominatimReverseResponse>(url, undefined, 5000);

  if (!res.ok || !res.data) {
    return { name: `Parcela ${lat.toFixed(3)}, ${lon.toFixed(3)}` };
  }

  const addr = res.data.address;
  const place = addr?.city ?? addr?.town ?? addr?.village ?? addr?.municipality ?? addr?.county ?? res.data.name;
  const result = {
    name: place ? `${place}${addr?.state ? `, ${addr.state}` : ''}` : res.data.display_name ?? `Parcela ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    region: addr?.state,
    country: addr?.country,
    countryCode: addr?.country_code?.toUpperCase(),
  };

  await setCached(cacheKey, result, 24 * 3600_000);
  return result;
}
