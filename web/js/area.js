// Area analysis: every NISAR pixel inside a drawn rectangle, circle or polygon.
// Two sources share one interface:
//   gibsArea   — anywhere on Earth, NASA GIBS imagery at zoom 8 (~500 m), dates from CMR
//   bundleArea — inside a showcase, the full-resolution (20 m) bundle
// Both return {kind, n, pixelHa(i), dates, read(date) -> {hh, hv} (Float32Array, NaN = no data),
//              width, height, idx (pixel -> image index)} so the card does not care which one it got.
import { getTile, tileUrl, READ_ZOOM } from "./gibs.js";
import { gibsToDb, classId } from "./rules.js";
import { inRing } from "./cmr.js";
import { destination } from "./orbit.js";

export const MAX_PIXELS = 60000;          // ~ 150 x 150 km at zoom 8: keeps the browser responsive
const MAX_TILES = 30;
const WORLD = 256 * 2 ** READ_ZOOM;       // global pixels across at READ_ZOOM

// ---- geometry -----------------------------------------------------------------------

/** Closed ring of a circle (centre [lon, lat], radius km). */
export function circleRing(center, km, n = 64) {
  const ring = [];
  for (let i = 0; i < n; i++) ring.push(destination(center, (i * 360) / n, km));
  return [...ring, ring[0]];
}
/** Closed ring of a lon/lat rectangle given two corners. */
export function rectRing([x1, y1], [x2, y2]) {
  const [w, e] = x1 < x2 ? [x1, x2] : [x2, x1], [s, n] = y1 < y2 ? [y1, y2] : [y2, y1];
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}
/** Area of a lon/lat ring in km² (spherical excess approximation, fine below ~1000 km). */
export function ringAreaKm2(ring) {
  const R = 6371.0088, rad = Math.PI / 180;
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((a * R * R) / 2);
}
export function ringCentroid(ring) {
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
const bboxOf = (ring) => ring.reduce(([w, s, e, n], [x, y]) => [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)],
  [Infinity, Infinity, -Infinity, -Infinity]);

// Web Mercator global pixel <-> lon/lat at READ_ZOOM
const gxOf = (lon) => ((lon + 180) / 360) * WORLD;
const gyOf = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * WORLD;
const lonOf = (gx) => (gx / WORLD) * 360 - 180;
const latOf = (gy) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / WORLD))) * 180) / Math.PI;

/** Zoom-8 pixels whose centres fall inside the ring: {gx0, gy0, width, height, px: [[gx, gy]], tiles: Set}. */
export function pixelsInRing(ring) {
  const [w, s, e, n] = bboxOf(ring);
  const gx0 = Math.floor(gxOf(w)), gx1 = Math.ceil(gxOf(e)), gy0 = Math.floor(gyOf(n)), gy1 = Math.ceil(gyOf(s));
  const width = gx1 - gx0, height = gy1 - gy0;
  if (width * height > MAX_PIXELS * 2) return { tooBig: true, width, height };
  const px = [], tiles = new Set();
  for (let gy = gy0; gy < gy1; gy++) {
    const lat = latOf(gy + 0.5);
    for (let gx = gx0; gx < gx1; gx++)
      if (inRing([lonOf(gx + 0.5), lat], ring)) { px.push([gx, gy]); tiles.add(`${gx >> 8},${gy >> 8}`); }
  }
  return { gx0, gy0, width, height, px, tiles, tooBig: px.length > MAX_PIXELS || tiles.size > MAX_TILES };
}

/** Ground area of one zoom-8 pixel at a latitude, in hectares. */
export const mercPixelHa = (lat) => ((40075016.686 * Math.cos((lat * Math.PI) / 180)) / WORLD) ** 2 / 1e4;

// ---- sources --------------------------------------------------------------------------

/** Anywhere: GIBS imagery. passes = [{date, geometry, hv}] at the area's centre. */
export function gibsArea(ring, passes, rules) {
  const sel = pixelsInRing(ring);
  if (sel.tooBig) return { tooBig: true };
  const ha = sel.px.map(([, gy]) => mercPixelHa(latOf(gy + 0.5)));
  const cache = new Map();
  return {
    kind: "gibs", n: sel.px.length, pixelHa: (i) => ha[i], dates: passes,
    width: sel.width, height: sel.height,
    idx: sel.px.map(([gx, gy]) => (gy - sel.gy0) * sel.width + (gx - sel.gx0)),
    async read(date) {
      if (cache.has(date)) return cache.get(date);
      const imgs = new Map();
      await Promise.all([...sel.tiles].map(async (k) => {
        const [tx, ty] = k.split(",").map(Number);
        imgs.set(k, await getTile(tileUrl(date, READ_ZOOM, tx, ty)));
      }));
      const hh = new Float32Array(sel.px.length).fill(NaN), hv = new Float32Array(sel.px.length).fill(NaN);
      sel.px.forEach(([gx, gy], i) => {
        const img = imgs.get(`${gx >> 8},${gy >> 8}`);
        if (!img) return;
        const j = ((gy & 255) * 256 + (gx & 255)) * 4, d = img.data;
        if (!d[j + 3] || d[j] + d[j + 1] + d[j + 2] === 0) return;
        const v = gibsToDb(rules, d[j], d[j + 1]);
        if (v.hv < -35) return;                          // black strip edge, not ground
        hh[i] = v.hh; hv[i] = v.hv;
      });
      const out = { hh, hv };
      cache.set(date, out);
      return out;
    },
  };
}

/** Inside a showcase: the 20 m bundle (manifest + time series). */
export function bundleArea(bundle, ring) {
  const m = bundle.manifest, { width: W, height: H } = m.grid, [w, s, e, n] = m.bbox;
  const [bw, bs, be, bn] = bboxOf(ring);
  const c0 = Math.max(0, Math.floor(((bw - w) / (e - w)) * W)), c1 = Math.min(W, Math.ceil(((be - w) / (e - w)) * W));
  const r0 = Math.max(0, Math.floor(((n - bn) / (n - s)) * H)), r1 = Math.min(H, Math.ceil(((n - bs) / (n - s)) * H));
  // Very large selections are sampled on a regular grid (every k-th pixel) to stay fast.
  const total = Math.max(0, (c1 - c0) * (r1 - r0)), k = Math.max(1, Math.ceil(Math.sqrt(total / 250000)));
  const px = [];
  for (let r = r0; r < r1; r += k)
    for (let c = c0; c < c1; c += k)
      if (inRing([w + ((c + 0.5) / W) * (e - w), n - ((r + 0.5) / H) * (n - s)], ring)) px.push([c, r]);
  const lat = (s + n) / 2;
  const pxHa = (((e - w) / W) * 111320 * Math.cos((lat * Math.PI) / 180) * (((n - s) / H) * 110540)) / 1e4 * k * k;
  const geo = m.date_geometry ?? {};
  const T = m.dates.length, plane = W * H, sc = m.db_scale;
  const width = Math.ceil((c1 - c0) / k), height = Math.ceil((r1 - r0) / k);
  return {
    kind: "bundle", n: px.length, pixelHa: () => pxHa, sampled: k > 1,
    dates: m.dates.map((d) => ({ date: d, geometry: geo[d] ?? m.geometry ?? null, hv: true })),
    width, height, idx: px.map(([c, r]) => Math.floor((r - r0) / k) * width + Math.floor((c - c0) / k)),
    async read(date) {
      const t = m.dates.indexOf(date), ts = bundle.ts;
      const hh = new Float32Array(px.length).fill(NaN), hv = new Float32Array(px.length).fill(NaN);
      if (t < 0 || !ts || t >= T) return { hh, hv };
      px.forEach(([c, r], i) => {
        const a = ts[(t * 2) * plane + r * W + c], b = ts[(t * 2 + 1) * plane + r * W + c];
        if (a) hh[i] = sc.offset + sc.step * a;
        if (b) hv[i] = sc.offset + sc.step * b;
      });
      return { hh, hv };
    },
  };
}

// ---- statistics --------------------------------------------------------------------------

/** Class areas (ha) and mean HV over valid pixels. -> {byClass: {id: ha}, validHa, meanHv, coverage} */
export function classStats(area, v, rules, source) {
  const byClass = {};
  let valid = 0, validHa = 0, sumHv = 0;
  for (let i = 0; i < area.n; i++) {
    if (Number.isNaN(v.hv[i]) || Number.isNaN(v.hh[i])) continue;
    const id = classId(rules, v.hh[i], v.hv[i], source), ha = area.pixelHa(i);
    byClass[id] = (byClass[id] ?? 0) + ha;
    valid++; validHa += ha; sumHv += v.hv[i];
  }
  return { byClass, validHa, meanHv: valid ? sumHv / valid : null, coverage: area.n ? valid / area.n : 0 };
}

/** Loss / gain areas (ha) between two dates; per-pixel codes (1 loss, 2 gain, 0 none, -1 no data). */
export function changeStats(area, before, after, thresholdDb) {
  const code = new Int8Array(area.n).fill(-1);
  let loss = 0, gain = 0, compared = 0;
  for (let i = 0; i < area.n; i++) {
    const a = before.hv[i], b = after.hv[i];
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const d = b - a, ha = area.pixelHa(i);
    compared += ha;
    if (d <= -thresholdDb) { loss += ha; code[i] = 1; }
    else if (d >= thresholdDb) { gain += ha; code[i] = 2; }
    else code[i] = 0;
  }
  return { lossHa: loss, gainHa: gain, comparedHa: compared, code };
}

// ---- images ----------------------------------------------------------------------------------

const clamp = (v) => Math.max(0, Math.min(255, v));
/** dB back to NASA GIBS colours (inverse of rules.gibs_model), so area images look like the map. */
export function dbToRgb(rules, hh, hv) {
  const [a1, b1, c1] = rules.gibs_model.hv, [a2, b2, c2] = rules.gibs_model.hh;
  // HV depends almost only on G; then HH gives R.
  let lg = (hv - a1) / b1;                                 // ln(1 + G), first guess ignoring R
  let lr = (hh - a2 - b2 * lg) / c2;
  lg = (hv - a1 - c1 * lr) / b1;                           // one refinement with R
  lr = (hh - a2 - b2 * lg) / c2;
  const g = clamp(Math.exp(lg) - 1), r = clamp(Math.exp(lr) - 1);
  return [r, g, clamp((hh - hv) * 9)];
}
// The showcase frames' fixed stretch (pipeline/frames.py), so 20 m areas look like the showcase image.
const SHOWCASE_STRETCH = { hh: [-20, 0], hv: [-26, -5], ratio: [1, 11] };
const st = (v, [lo, hi]) => clamp(((v - lo) / (hi - lo)) * 255);
export const showcaseRgb = (hh, hv) => [st(hh, SHOWCASE_STRETCH.hh), st(hv, SHOWCASE_STRETCH.hv), st(hh - hv, SHOWCASE_STRETCH.ratio)];

/** Radar-look image (as on the map) of the selection, transparent outside it. */
export function radarImage(area, v, rules) {
  const c = new OffscreenCanvas(area.width, area.height), ctx = c.getContext("2d");
  const img = ctx.createImageData(area.width, area.height);
  for (let i = 0; i < area.n; i++) {
    if (Number.isNaN(v.hv[i])) continue;
    const j = area.idx[i] * 4, [r, g, b] = area.kind === "bundle" ? showcaseRgb(v.hh[i], v.hv[i]) : dbToRgb(rules, v.hh[i], v.hv[i]);
    img.data[j] = r; img.data[j + 1] = g; img.data[j + 2] = b; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
/** Change map: red = loss, blue = gain, grey = no change, transparent = no data / outside. */
export function changeImage(area, code) {
  const c = new OffscreenCanvas(area.width, area.height), ctx = c.getContext("2d");
  const img = ctx.createImageData(area.width, area.height);
  const col = { 0: [70, 78, 92], 1: [230, 57, 70], 2: [60, 120, 230] };
  for (let i = 0; i < area.n; i++) {
    if (code[i] < 0) continue;
    const j = area.idx[i] * 4, [r, g, b] = col[code[i]];
    img.data[j] = r; img.data[j + 1] = g; img.data[j + 2] = b; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---- CSV ------------------------------------------------------------------------------------

/** rows: [{date, geometry, stats}] -> CSV text with one column per class (ha). */
export function areaCsv(rows, rules, meta) {
  const ids = rules.classes.map((c) => c.id);
  const head = `# NISAR Time Machine — area analysis. ${meta}\n` +
    ["date", "orbit", "valid_ha", "mean_hv_db", ...ids.map((id) => `${id}_ha`)].join(",");
  const lines = rows.map(({ date, geometry, stats: s }) => [date, geometry ?? "", s.validHa.toFixed(1),
    s.meanHv == null ? "" : s.meanHv.toFixed(2), ...ids.map((id) => (s.byClass[id] ?? 0).toFixed(1))].join(","));
  return [head, ...lines].join("\n") + "\n";
}
