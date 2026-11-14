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
