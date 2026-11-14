// NISAR's approximate live position and radar beam — for VISUALIZATION ONLY.
// Position: public two-line elements (TLE, NORAD 65053) propagated with SGP4 (satellite.js).
// Beam: NISAR's L-band radar looks to the LEFT of its flight direction at 33–47° incidence and
// images a ~242 km wide swath (NASA / ASF). Nothing here is used for any measurement.

export const NORAD_ID = 65053;
export const TLE_URL = `https://tle.ivanstanojevic.me/api/tle/${NORAD_ID}`;
const SAT_LIB = "https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/+esm";
const R = 6371;                     // mean Earth radius, km
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/** Point at `distKm` from [lon, lat] along `bearingDeg` on a sphere. */
export function destination([lon, lat], bearingDeg, distKm) {
  const d = distKm / R, b = bearingDeg * D2R, f1 = lat * D2R, l1 = lon * D2R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [((l2 * R2D + 540) % 360) - 180, f2 * R2D];
}

/** Initial bearing from a to b, degrees. */
export function bearing([lo1, la1], [lo2, la2]) {
  const f1 = la1 * D2R, f2 = la2 * D2R, dl = (lo2 - lo1) * D2R;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Ground distance (km) from the nadir to where the beam hits at `incidenceDeg`, spherical Earth. */
export function groundRange(incidenceDeg, altKm) {
  const ti = incidenceDeg * D2R;
  const tl = Math.asin((R / (R + altKm)) * Math.sin(ti));   // look angle at the satellite
  return R * (ti - tl);                                      // Earth central angle × R
}

/** Keep longitudes of a ring continuous around `refLon` (avoids polygons wrapping the antimeridian). */
const unwrap = (ring, refLon) => ring.map(([x, y]) => [x + 360 * Math.round((refLon - x) / 360), y]);

/**
 * Beam drawn as a stack of extruded slabs from the ground swath up to the satellite.
 * sub: [lon, lat] below the satellite; heading: flight direction (deg); altKm: altitude.
 * Returns a GeoJSON FeatureCollection with properties {base, top} in metres.
 */
export function beamFeatures(sub, heading, altKm, { steps = 18, nearInc = 33, farInc = 47 } = {}) {
  const left = heading - 90;
  const near = groundRange(nearInc, altKm), far = groundRange(farInc, altKm);
  const mid = (near + far) / 2, half = (far - near) / 2;
  const centre = destination(sub, left, mid);
  const back = bearing(centre, sub);
  const feats = [];
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const c = destination(centre, back, mid * (t0 + t1) / 2);       // slab centre, moving toward nadir
    const w = Math.max(half * (1 - t0), 6);                          // across-track half width shrinks
    const a = Math.max(18 * (1 - t0), 4);                            // along-track half thickness
    const p = (dx, dy) => destination(destination(c, back, dx), heading, dy);
    const ring = unwrap([p(-w, -a), p(-w, a), p(w, a), p(w, -a), p(-w, -a)], c[0]);
    feats.push({ type: "Feature", properties: { base: t0 * altKm * 1000, top: t1 * altKm * 1000, kind: "beam" },
      geometry: { type: "Polygon", coordinates: [ring] } });
  }
  // The satellite itself: a small bright block at its altitude.
  const s = 14, q = (dx, dy) => destination(destination(sub, left, dx), heading, dy);
  feats.push({ type: "Feature", properties: { base: altKm * 1000 - 12000, top: altKm * 1000 + 12000, kind: "sat" },
    geometry: { type: "Polygon", coordinates: [unwrap([q(-s, -s), q(-s, s), q(s, s), q(s, -s), q(-s, -s)], sub[0])] } });
  return { type: "FeatureCollection", features: feats };
}

/** Ground swath strip (near→far range) along [lon, lat, heading] track points, as one small quad per
 *  track step: a single big polygon would fold over itself where the orbit turns near the poles. */
export function swathPolygon(track, altKm, nearInc = 33, farInc = 47) {
  const near = groundRange(nearInc, altKm), far = groundRange(farInc, altKm);
  const inner = track.map(([x, y, h]) => destination([x, y], h - 90, near));
  const outer = track.map(([x, y, h]) => destination([x, y], h - 90, far));
  const features = [];
  for (let i = 0; i + 1 < track.length; i++) {
    const ring = [inner[i], inner[i + 1], outer[i + 1], outer[i], inner[i]];
    if (ring.some(([, y]) => Math.abs(y) > 85)) continue;   // too close to a pole to draw cleanly
    features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [unwrap(ring, ring[0][0])] } });
  }
  return { type: "FeatureCollection", features };
}

let lib = null;
async function satLib() { return (lib ??= await import(SAT_LIB)); }

/** Fetch the latest TLE; falls back to the bundled snapshot. Returns {line1, line2, date, source}. */
export async function loadTle(fallbackUrl = "data/global/tle.json") {
  for (const url of [TLE_URL, fallbackUrl]) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.line1 && j.line2) return { line1: j.line1, line2: j.line2, date: j.date, source: url === TLE_URL ? "live" : "snapshot" };
    } catch { /* try the next one */ }
  }
  return null;
}

/** Make a propagator: at(date) → {lon, lat, altKm, heading} or null. */
export async function makePropagator(tle) {
  const sat = await satLib();
  const rec = sat.twoline2satrec(tle.line1, tle.line2);
  const pos = (date) => {
    const pv = sat.propagate(rec, date);
    if (!pv?.position) return null;
    const g = sat.eciToGeodetic(pv.position, sat.gstime(date));
    return [sat.degreesLong(g.longitude), sat.degreesLat(g.latitude), g.height];
  };
  return (date) => {
    const a = pos(date), b = pos(new Date(date.getTime() + 10000));
    if (!a || !b) return null;
    return { lon: a[0], lat: a[1], altKm: a[2], heading: bearing(a, b) };
  };
}

/** Everything the map needs at time `date`: {beam, swath, track, now} or null. */
export function satelliteScene(at, date, { swathMin = 8, trackMin = 45 } = {}) {
  const now = at(date);
  if (!now) return null;
  const pts = (fromMin, toMin, stepS) => {
    const out = [];
    for (let s = fromMin * 60; s <= toMin * 60; s += stepS) {
      const q = at(new Date(date.getTime() + s * 1000));
      if (q) out.push([q.lon, q.lat, q.heading]);
    }
    return out;
  };
  const sw = pts(-swathMin, 0, 20);
  // Ground track ahead: unwrap longitudes so the line never jumps across the map.
  const tr = pts(0, trackMin, 30);
  for (let i = 1; i < tr.length; i++) tr[i][0] += 360 * Math.round((tr[i - 1][0] - tr[i][0]) / 360);
  return {
    now,
    beam: beamFeatures([now.lon, now.lat], now.heading, now.altKm),
    swath: sw.length > 1 ? swathPolygon(sw, now.altKm) : { type: "FeatureCollection", features: [] },
    track: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: tr.map(([x, y]) => [x, y]) } },
  };
}
