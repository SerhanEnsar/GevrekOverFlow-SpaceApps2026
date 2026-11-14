// Reading NASA GIBS NISAR imagery in the browser (global layer, ~500 m).
// Zoom 8 is the finest healthy level: GIBS tiles at zoom >= 9 of this layer are corrupted.
export const NISAR_LAYER = "NISAR_L2_Geocoded_Polarimetric_Covariance";
export const READ_ZOOM = 8;
const BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export const tileUrl = (date, z, x, y) =>
  `${BASE}/${NISAR_LAYER}/default/${date}/GoogleMapsCompatible_Level13/${z}/${y}/${x}.png`;
export const tileTemplate = (date) =>
  `${BASE}/${NISAR_LAYER}/default/${date}/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`;

/** Web-Mercator tile (x, y) and pixel inside it (px, py) of a lon/lat at zoom z. */
export function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const x = Math.floor(fx), y = Math.floor(fy);
  return { x, y, px: Math.floor((fx - x) * 256), py: Math.floor((fy - y) * 256) };
}

const tiles = new Map();          // url -> Promise<ImageData|null>, small LRU
export async function getTile(url) {
  if (tiles.has(url)) return tiles.get(url);
  const p = (async () => {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  })().catch(() => null);
  tiles.set(url, p);
  if (tiles.size > 200) tiles.delete(tiles.keys().next().value);
  return p;
}

/** Mean R, G, B of the valid pixels in a 3x3 window around lon/lat on `date`, or null. */
export async function readPixel(lon, lat, date) {
  const { x, y, px, py } = tileXY(lon, lat, READ_ZOOM);
  const img = await getTile(tileUrl(date, READ_ZOOM, x, y));
  if (!img) return null;
  let r = 0, g = 0, b = 0, k = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.min(255, Math.max(0, px + dx)), cy = Math.min(255, Math.max(0, py + dy));
      const i = (cy * img.width + cx) * 4;
      if (img.data[i + 3] === 0 || (img.data[i] + img.data[i + 1] + img.data[i + 2] === 0)) continue;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; k++;
    }
  return k >= 5 ? { r: r / k, g: g / k, b: b / k } : null;
}

const baseUrl = (z, x, y) =>
  `${BASE}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;

/** Draw the tiles (from urlOf(z, x, y)) covering a size x size window whose top-left global pixel is gx, gy. */
async function stitch(ctx, urlOf, gx, gy, size) {
  let any = false;
  for (let ty = Math.floor(gy / 256); ty <= Math.floor((gy + size - 1) / 256); ty++)
    for (let tx = Math.floor(gx / 256); tx <= Math.floor((gx + size - 1) / 256); tx++) {
      const img = await getTile(urlOf(READ_ZOOM, tx, ty));
      if (!img) continue;
      any = true;
      const tmp = new OffscreenCanvas(256, 256);
      tmp.getContext("2d").putImageData(img, 0, 0);
      ctx.drawImage(tmp, tx * 256 - gx, ty * 256 - gy);
    }
  return any;
}

/**
 * A size x size canvas of the GIBS NISAR image centred on lon/lat (stitched from up to 4 tiles), or null.
 * Where NISAR did not image (outside its strip) a dimmed Blue Marble map shows instead of black.
 */
export async function cropAround(lon, lat, date, size = 96) {
  const { x, y, px, py } = tileXY(lon, lat, READ_ZOOM);
  const gx = x * 256 + px - size / 2, gy = y * 256 + py - size / 2;   // global pixel of the top-left corner
  const radar = new OffscreenCanvas(size, size);
  const rctx = radar.getContext("2d");
  if (!(await stitch(rctx, (z, tx, ty) => tileUrl(date, z, tx, ty), gx, gy, size))) return null;
  // Empty (fully transparent or black) crops mean "no image on this date".
  const d = rctx.getImageData(0, 0, size, size).data;
  let valid = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2]) valid++;
  if (valid <= size * size * 0.05) return null;
  const out = new OffscreenCanvas(size, size);
  const ctx = out.getContext("2d");
  ctx.filter = "grayscale(0.7) brightness(0.55)";
  await stitch(ctx, baseUrl, gx, gy, size);
  ctx.filter = "none";
  ctx.drawImage(radar, 0, 0);
  return out;
}
