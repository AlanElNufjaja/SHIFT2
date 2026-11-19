import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import {
  CROPS,
  GLOSSARY,
  NEUTRAL_SCENARIO,
  PILOT_PARCELS,
  SOURCES,
  analyzeSite,
  applyMarketOverrides,
} from '@fieldshift/core';
import type { FarmerInputs, Locale, Scenario, SiteProfile } from '@fieldshift/core';
import { searchPlaces } from './connectors/geocode';
import { fetchNassMarketPrices } from './connectors/optionalKeys';
import { buildSiteProfile } from './harmonize';
import { getCached, setCached } from './lib/cache';
import { isInCONUS, wgs84ToAlbers5070 } from './lib/geo';
import { fetchText } from './lib/http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

function parseCoords(rawLat: unknown, rawLon: unknown): { lat: number; lon: number } | null {
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -85 || lat > 85 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'fieldshift-api',
      time: new Date().toISOString(),
      optionalKeys: {
        nass: Boolean(process.env.NASS_API_KEY),
        openet: Boolean(process.env.OPENET_API_KEY),
      },
    });
  });

  app.get('/api/pilots', (_req, res) => {
    res.json({ pilots: PILOT_PARCELS });
  });

  app.get('/api/sources', (_req, res) => {
    res.json({ sources: SOURCES, glossary: GLOSSARY });
  });

  app.get('/api/crops', async (_req, res) => {
    try {
      const nass = await fetchNassMarketPrices();
      const crops = applyMarketOverrides(CROPS, nass.overrides);
      res.json({ crops, report: nass.report });
    } catch {
      res.json({
        crops: CROPS,
        report: {
          id: 'nass-quickstats',
          status: 'unavailable',
          mode: 'key-required',
          ms: 0,
          summary: 'Usando catálogo base 2023–2024',
        },
      });
    }
  });

  app.get('/api/geocode', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    try {
      const results = await searchPlaces(q);
      res.json({ results });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Error geocoding' });
    }
  });

  app.get('/api/cdl-point', async (req, res) => {
    const coords = parseCoords(req.query.lat, req.query.lon);
    if (!coords) {
      res.status(400).json({ error: 'Parámetros lat/lon inválidos.' });
      return;
    }
    if (!isInCONUS(coords.lat, coords.lon)) {
      res.json({ inCONUS: false, crop: null });
      return;
    }

    const cacheKey = `cdl_pt_${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}`;
    const cached = await getCached<{ inCONUS: true; year: number; cdlCode: number; cdlName: string } | null>(cacheKey);
    if (cached.hit) {
      res.json(cached.data ?? { inCONUS: true, crop: null });
      return;
    }

    const [ax, ay] = wgs84ToAlbers5070(coords.lat, coords.lon);
    for (const year of [2025, 2024, 2023]) {
      const url = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${year}&x=${ax.toFixed(2)}&y=${ay.toFixed(2)}`;
      const r = await fetchText(url, undefined, 6000);
      const m = r.ok && r.data ? r.data.match(/value:\s*(\d+),\s*category:\s*"([^"]*)"/) : null;
      if (m) {
        const payload = { inCONUS: true as const, year, cdlCode: Number(m[1]), cdlName: m[2] };
        await setCached(cacheKey, payload, 24 * 3600_000);
        res.json(payload);
        return;
      }
    }

    res.json({ inCONUS: true, crop: null });
  });

  app.get('/api/site', async (req, res) => {
    const coords = parseCoords(req.query.lat, req.query.lon);
    if (!coords) {
      res.status(400).json({ error: 'Parámetros lat/lon inválidos (lat -85..85, lon -180..180).' });
      return;
    }
    const name = typeof req.query.name === 'string' && req.query.name.trim() ? req.query.name.trim() : undefined;
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

    try {
      const site = await buildSiteProfile(coords.lat, coords.lon, { name, refresh });
      res.json(site);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error construyendo perfil del sitio' });
    }
  });

  app.get('/api/site/stream', async (req, res) => {
    const coords = parseCoords(req.query.lat, req.query.lon);
    if (!coords) {
      res.status(400).json({ error: 'Parámetros lat/lon inválidos.' });
      return;
    }
    const name = typeof req.query.name === 'string' && req.query.name.trim() ? req.query.name.trim() : undefined;
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const sendEvent = (event: string, data: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const site = await buildSiteProfile(coords.lat, coords.lon, {
        name,
        refresh,
        onProgress: (evt) => sendEvent('progress', evt),
      });
      sendEvent('complete', site);
    } catch (err) {
      sendEvent('failed', { error: err instanceof Error ? err.message : 'Error interno' });
    } finally {
      if (!closed) res.end();
    }
  });

  app.post('/api/analyze', (req, res) => {
    const body = req.body as {
      site?: SiteProfile;
      farmer?: FarmerInputs;
      scenario?: Scenario;
      overrides?: Record<string, { price?: number; potentialYield?: number; costPerHa?: number }>;
      locale?: Locale;
    } | null;

    if (!body?.site || !body?.farmer) {
      res.status(400).json({ error: 'Se requieren los objetos `site` y `farmer` en el cuerpo JSON.' });
      return;
    }

    try {
      const catalog = body.overrides ? applyMarketOverrides(CROPS, body.overrides) : CROPS;
      const locale: Locale = body.locale === 'es' ? 'es' : 'en';
      const result = analyzeSite(body.site, body.farmer, body.scenario ?? NEUTRAL_SCENARIO, catalog, locale);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Error analizando parcela' });
    }
  });

  // Serve built Vite SPA in production when present
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  return app;
}
