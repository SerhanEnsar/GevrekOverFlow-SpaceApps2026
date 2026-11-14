// When did NISAR image this place? NASA CMR granule search (CORS-enabled), all GCOV collections.
const CMR = "https://cmr.earthdata.nasa.gov/search/granules.json";
export const GCOV_COLLECTIONS = ["NISAR_L2_GCOV_V1", "NISAR_L2_GCOV_PROVISIONAL_V1", "NISAR_L2_GCOV_BETA_V1"];

/** Track + direction + frame from a GCOV granule name, e.g. "095D068" (same as pipeline/geometry.py). */
export function geometryKey(name) {
  const m = /GCOV_\d{3}_(\d{3})_([AD])_(\d{3})/.exec(name ?? "");
  return m ? m[1] + m[2] + m[3] : null;
}

/** Arrays of CMR entries -> unique [{date, geometry}] newest first. */
export function parsePasses(entryLists) {
  const seen = new Map();
  for (const list of entryLists)
    for (const e of list) {
      const date = e.time_start.slice(0, 10), geometry = geometryKey(e.title ?? e.producer_granule_id);
      seen.set(`${date}|${geometry}`, { date, geometry });
    }
  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

const cache = new Map();

/** All NISAR GCOV passes over a point (optionally only after a date). */
export async function passDates(lon, lat, { after = null } = {}) {
  const key = `${lon.toFixed(3)},${lat.toFixed(3)},${after}`;
  if (cache.has(key)) return cache.get(key);
  const lists = await Promise.all(GCOV_COLLECTIONS.map(async (sn) => {
    const q = new URLSearchParams({ short_name: sn, point: `${lon},${lat}`, page_size: "500", sort_key: "-start_date" });
    if (after) q.set("temporal", `${after}T00:00:00Z,`);
    const r = await fetch(`${CMR}?${q}`);
    if (!r.ok) throw new Error(`CMR ${r.status}`);
    return (await r.json()).feed.entry;
  }));
  const out = parsePasses(lists);
  cache.set(key, out);
  return out;
}

/** Is there any NISAR GCOV pass over the point after `date`? (cheap: only hit counts) */
export async function hasPassAfter(lon, lat, date) {
  const hits = await Promise.all(GCOV_COLLECTIONS.map(async (sn) => {
    const q = new URLSearchParams({ short_name: sn, point: `${lon},${lat}`, page_size: "0",
      temporal: `${date}T23:59:59Z,` });
    const r = await fetch(`${CMR}?${q}`);
    return r.ok ? +(r.headers.get("CMR-Hits") ?? 0) : 0;
  }));
  return hits.some((h) => h > 0);
}

/** Point-in-polygon (ray casting) for a GeoJSON Polygon's outer ring. */
export function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Local answer from the recent-passes file: true/false, or null when the date is older than the file. */
export function imagedAfterLocal(fc, lon, lat, date) {
  const dates = fc.features.map((f) => f.properties.date).sort();
  if (!dates.length || date < dates[0]) return null;
  return fc.features.some((f) => f.properties.date > date && inRing([lon, lat], f.geometry.coordinates[0]));
}
