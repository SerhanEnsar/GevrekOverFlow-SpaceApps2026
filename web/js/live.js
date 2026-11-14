// Live data at start-up, straight from NASA, with progress for the cover's loading bar.
// Each loader falls back to the copy saved in the repository if the live service fails,
// and says so ({source: "live" | "saved"}), so the site keeps working offline or during outages.
import { parseLive } from "./fires.js";
import { polMode, hasHV } from "./cmr.js";

const EONET = "https://eonet.gsfc.nasa.gov/api/v3/events";
const CMR_GRAPHQL = "https://graphql.earthdata.nasa.gov/api";
const PASS_COLLECTIONS = ["NISAR_L2_GCOV_V1", "NISAR_L2_GCOV_PROVISIONAL_V1"];
export const EONET_DAYS = 365;
const EONET_BYTES_GUESS = 7e6;           // the year of wildfire events is ~7 MB (no Content-Length is sent)

/** fetch() that reports downloaded bytes; returns the response text. */
export async function fetchText(url, onBytes, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  if (!r.body || !onBytes) return r.text();
  const reader = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.length; onBytes(n);
  }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
}

/** Wildfires of the last year from EONET (~7 MB). onProgress(fraction, label). */
export async function loadFiresLive(onProgress = () => {}) {
  onProgress(0.01, "asking NASA…");
  try {
    const txt = await fetchText(`${EONET}?category=wildfires&status=all&days=${EONET_DAYS}&limit=50000`,
      (n) => onProgress(Math.min(0.97, n / EONET_BYTES_GUESS), `${(n / 1e6).toFixed(1)} MB`));
    const rows = parseLive(JSON.parse(txt));
    onProgress(1, `${rows.length.toLocaleString("en")} fires`);
    return { rows, source: "live" };
  } catch {
    const d = await fetch("data/global/fires.json").then((r) => r.json()).catch(() => ({ events: [] }));
    onProgress(1, "saved copy");
    return { rows: d.events, source: "saved" };
  }
}

// ---- NISAR pass footprints (CMR GraphQL: only the fields we need, ~175 KB for 12 days) ----

const ringFromCmr = (s) => {
  const v = s.trim().split(/\s+/).map(Number), out = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i + 1], v[i]]);      // "lat lon" -> [lon, lat]
  return out;
};
const reduceRing = (ring, max = 12) => {
  let body = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  if (body.length > max) { const step = body.length / max; body = Array.from({ length: max }, (_, i) => body[Math.floor(i * step)]); }
  const r3 = ([x, y]) => [Math.round(x * 1e3) / 1e3, Math.round(y * 1e3) / 1e3];
  body = body.map(r3);
  return [...body, body[0]];
};

/** GraphQL granule items -> GeoJSON features {date, geometry key, pol, hv}; drops antimeridian
 *  crossers and granules that started before `start` (the temporal filter returns overlaps). */
export function passFeatures(items, start) {
  const seen = new Set(), out = [];
  for (const it of items) {
    const date = it.timeStart?.slice(0, 10), poly = it.polygons?.[0]?.[0];
    if (!date || !poly || date < start) continue;
    const ring = ringFromCmr(poly), lons = ring.map((p) => p[0]);
    if (ring.length < 4 || Math.max(...lons) - Math.min(...lons) > 180) continue;
    const r = reduceRing(ring), key = date + JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    const pol = polMode(it.granuleUr);
    out.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [r] }, properties: { date, pol, hv: hasHV(pol) } });
  }
  return out.sort((a, b) => (a.properties.date < b.properties.date ? -1 : 1));
}

async function graphqlWindow(shortName, from, to) {
  const query = "query($p: GranulesInput){ granules(params:$p){ items { granuleUr timeStart polygons } } }";
  const r = await fetch(CMR_GRAPHQL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { p: { shortName, temporal: `${from}T00:00:00Z,${to}T00:00:00Z`, limit: 2000 } } }),
  });
  if (!r.ok) throw new Error(`CMR ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error("CMR GraphQL error");
  return j.data.granules.items;
}

/** NISAR passes of the last `days` days, queried in parallel 2-day windows. */
export async function loadPassesLive(onProgress = () => {}, days = 12, today = new Date()) {
  const day = (k) => new Date(today.getTime() - k * 864e5).toISOString().slice(0, 10);
  const start = day(days), jobs = [];
  for (const sn of PASS_COLLECTIONS) for (let k = days; k > 0; k -= 2) jobs.push([sn, day(k), day(k - 2)]);
  let done = 0;
  onProgress(0.01, "asking NASA…");
  try {
    const lists = await Promise.all(jobs.map(([sn, a, b]) => graphqlWindow(sn, a, b).then((items) => {
      onProgress(++done / jobs.length, `${done}/${jobs.length} queries`);
      return items;
    })));
    const features = passFeatures(lists.flat(), start);
    if (!features.length) throw new Error("no passes");
    onProgress(1, `${features.length.toLocaleString("en")} scenes`);
    return { fc: { type: "FeatureCollection", features }, source: "live" };
  } catch {
    const fc = await fetch("data/global/passes.geojson").then((r) => r.json()).catch(() => ({ type: "FeatureCollection", features: [] }));
    onProgress(1, "saved copy");
    return { fc, source: "saved" };
  }
}

/** Which recent NISAR dates at a point were single-pol (HH only)? -> Set of dates. */
export function hhOnlyDatesAt(fc, inRing, lon, lat) {
  const s = new Set();
  for (const f of fc?.features ?? [])
    if (f.properties.hv === false && inRing([lon, lat], f.geometry.coordinates[0])) s.add(f.properties.date);
  return s;
}
