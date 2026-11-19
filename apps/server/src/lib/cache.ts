import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../.cache');

interface CacheEnvelope<T> {
  cachedAt: string;
  expiresAt: number;
  data: T;
}

const mem = new Map<string, CacheEnvelope<unknown>>();

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function getCached<T>(key: string): Promise<{ hit: true; data: T; cachedAt: string } | { hit: false }> {
  const now = Date.now();
  const inMem = mem.get(key) as CacheEnvelope<T> | undefined;
  if (inMem && inMem.expiresAt > now) {
    return { hit: true, data: inMem.data, cachedAt: inMem.cachedAt };
  }

  const file = path.join(CACHE_DIR, `${safeKey(key)}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (parsed.expiresAt > now) {
      mem.set(key, parsed);
      return { hit: true, data: parsed.data, cachedAt: parsed.cachedAt };
    }
  } catch {
    // Miss or unreadable cache file
  }
  return { hit: false };
}

export async function setCached<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const envelope: CacheEnvelope<T> = {
    cachedAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlMs,
    data,
  };
  mem.set(key, envelope);

  const file = path.join(CACHE_DIR, `${safeKey(key)}.json`);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(envelope), 'utf8');
  } catch {
    // Non-fatal if filesystem cache write fails
  }
}
