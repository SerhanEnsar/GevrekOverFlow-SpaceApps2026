// Wildfire events from NASA EONET: a 1-year snapshot (data/global/fires.json, built by
// pipeline/eonet.py) merged with the last days fetched live. Row: [id, title, date, lon, lat, ha].
const EONET = "https://eonet.gsfc.nasa.gov/api/v3/events";
const ACRE_HA = 0.404686;

function point(g) {
  if (g.type === "Point") return g.coordinates;
  const ring = g.coordinates[0], pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** EONET API response -> compact rows (same format as the snapshot), newest first. */
export function parseLive(json) {
  return mergeFires([], json.events.map((e) => {
    const g = e.geometry.reduce((a, b) => (b.date > a.date ? b : a));
    const [lon, lat] = point(g);
    const m = g.magnitudeValue;
    const ha = m == null ? null : Math.round(g.magnitudeUnit === "acres" ? m * ACRE_HA : m);
    return [e.id, e.title, g.date.slice(0, 10), r4(lon), r4(lat), ha];
  }));
}

export function mergeFires(snapshot, live) {
  const byId = new Map(snapshot.map((r) => [r[0], r]));
  for (const r of live) byId.set(r[0], r);
  return [...byId.values()].sort((a, b) => (a[2] < b[2] ? 1 : a[2] > b[2] ? -1 : a[0] < b[0] ? 1 : -1));
}

export function inRange(rows, days, today) {
  const from = new Date(Date.parse(today + "T00:00:00Z") - days * 864e5).toISOString().slice(0, 10);
  return rows.filter((r) => r[2] >= from);
}

export function distanceKm(lon1, lat1, lon2, lat2) {
  const R = 6371.0088, rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Fires within km of a point, newest first. */
export function nearby(rows, lon, lat, km) {
  return rows.filter((r) => distanceKm(lon, lat, r[3], r[4]) <= km).sort((a, b) => (a[2] < b[2] ? 1 : -1));
}

/** Snapshot + live last 10 days. Either part may fail; whatever arrives is used. */
export async function loadFires() {
  const [snap, live] = await Promise.all([
    fetch("data/global/fires.json").then((r) => r.json()).then((d) => d.events).catch(() => []),
    fetch(`${EONET}?category=wildfires&status=all&days=10&limit=5000`).then((r) => r.json()).then(parseLive).catch(() => []),
  ]);
  return mergeFires(snap, live);
}
