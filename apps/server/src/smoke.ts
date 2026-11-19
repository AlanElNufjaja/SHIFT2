/**
 * Live end-to-end smoke verification against real NASA / USDA / USGS / ESA APIs
 * for Lubbock TX (CONUS) and Valle de Delicias MX (global).
 */
import { analyzeSite, defaultFarmerInputs } from '@fieldshift/core';
import { buildSiteProfile } from './harmonize';

async function runParcel(name: string, lat: number, lon: number) {
  console.log(`\n=== Smoke check: ${name} (${lat}, ${lon}) ===`);
  const t0 = Date.now();
  const site = await buildSiteProfile(lat, lon, { name, refresh: true });
  const farmer = defaultFarmerInputs(site);
  const res = analyzeSite(site, farmer);

  console.log(`Elapsed: ${Date.now() - t0} ms | Quality: ${(site.quality.overall * 100).toFixed(0)} %`);
  console.log(`Live: ${site.quality.liveSources} | Fallback: ${site.quality.fallbackSources} | Unavailable: ${site.quality.unavailableSources}`);
  console.log(`Climate (${site.climate.provenance}): P=${site.climate.annualPrecip} mm, ET0=${site.climate.annualET0} mm, T=${site.climate.meanTemp} C`);
  console.log(`Soil (${site.soil.provenance}): ${site.soil.texture}, OM=${site.soil.organicMatter} %, AWC=${site.soil.awcMmPerM} mm/m, pH=${site.soil.ph}`);
  console.log(`Terrain (${site.terrain.provenance}): ${site.terrain.elevationM} m, slope=${site.terrain.slopePct} %`);
  console.log(`MODIS (${site.vegetation.provenance}): ${site.vegetation.series.length} NDVI pts, bare=${site.vegetation.bareSoilMonths.length} m`);
  console.log(`CDL (${site.cropHistory.provenance}): ${site.cropHistory.summary}`);
  console.log(`USGS GW (${site.water.groundwater.provenance}): ${site.water.groundwater.summary}`);
  console.log(`Top 3 strategies:`);
  for (const s of res.strategies.slice(0, 3)) {
    console.log(
      `  #${s.rank} ${s.title} -> Score ${s.scores.total}/100 | ${s.sequenceLabel} | Irr ${s.metrics.irrigationMm} mm | Net $${s.metrics.netIncomePerHa}/ha`,
    );
  }
}

await runParcel('Lubbock, TX (parcela agrícola)', 33.65, -101.72);
await runParcel('Delicias, CHIH (distrito 005)', 28.225, -105.415);
