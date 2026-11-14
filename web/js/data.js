// Web data bundle access. Pure functions (no DOM) so web/tests.html can test them.
//
// Bundle layout (written by pipeline/export.py):
//   manifest.json   { bbox:[w,s,e,n], dates:[...], grid:{width,height}, db_scale:{offset,step}, ... }
//   timeseries.bin  uint8[dates][2 pol: HH, HV][height][width]; 0 = no data; dB = offset + step * v

export async function loadBundle(region, base = "data") {
  const dir = `${base}/${region}`;
  const manifest = await (await fetch(`${dir}/manifest.json`)).json();
  const ts = new Uint8Array(await (await fetch(`${dir}/timeseries.bin`)).arrayBuffer());
  return { manifest, ts };
}

export function decodeDb(v, scale) {
  return v === 0 ? null : scale.offset + scale.step * v;
}

// Pixel (col,row) for a lon/lat, or null outside the bbox.
export function pixelOf(manifest, lon, lat) {
  const [w, s, e, n] = manifest.bbox;
  if (lon < w || lon > e || lat < s || lat > n) return null;
  const { width, height } = manifest.grid;
  const col = Math.min(width - 1, Math.floor(((lon - w) / (e - w)) * width));
  const row = Math.min(height - 1, Math.floor(((n - lat) / (n - s)) * height));
  return { col, row };
}

// Mean HH/HV dB per date around a point (radiusM = 0: single pixel).
// Returns null outside the bbox or when every value is missing.
export function seriesAt(bundle, lon, lat, radiusM = 0) {
  const { manifest: m, ts } = bundle;
  const center = pixelOf(m, lon, lat);
  if (!center) return null;
  const { width: W, height: H } = m.grid;
  const [w, s, e, n] = m.bbox;
  const mPerCol = ((e - w) / W) * 111320 * Math.cos((lat * Math.PI) / 180);
  const mPerRow = ((n - s) / H) * 111320;
  const rc = Math.floor(radiusM / mPerCol), rr = Math.floor(radiusM / mPerRow);

  const pixels = [];
  for (let r = Math.max(0, center.row - rr); r <= Math.min(H - 1, center.row + rr); r++)
    for (let c = Math.max(0, center.col - rc); c <= Math.min(W - 1, center.col + rc); c++) {
      const dx = rc ? (c - center.col) / rc : 0, dy = rr ? (r - center.row) / rr : 0;
      if (dx * dx + dy * dy <= 1) pixels.push(r * W + c);
    }

  const T = m.dates.length, plane = W * H;
  const meanAt = (t, p) => {
    let sum = 0, k = 0;
    for (const px of pixels) {
      const v = decodeDb(ts[(t * 2 + p) * plane + px], m.db_scale);
      if (v !== null) { sum += v; k++; }
    }
    return k ? sum / k : null;
  };
  const hh = [], hv = [];
  for (let t = 0; t < T; t++) { hh.push(meanAt(t, 0)); hv.push(meanAt(t, 1)); }
  if (hh.every((v) => v === null) && hv.every((v) => v === null)) return null;
  return { dates: m.dates, hh, hv };
}

// HH/HV dB of a single pixel at date index t (null outside the bbox or without data).
export function valuesAt(bundle, lon, lat, t) {
  const { manifest: m, ts } = bundle;
  const px = pixelOf(m, lon, lat);
  if (!px || t < 0 || t >= m.dates.length) return null;
  const plane = m.grid.width * m.grid.height, i = px.row * m.grid.width + px.col;
  return {
    hh: decodeDb(ts[(t * 2) * plane + i], m.db_scale),
    hv: decodeDb(ts[(t * 2 + 1) * plane + i], m.db_scale),
  };
}
