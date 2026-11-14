// Selection tools on the map: point (the normal click), rectangle (drag), circle (drag the radius)
// and polygon (click the corners; click the first one or double-click to finish). Esc cancels.
import { rectRing, circleRing } from "./area.js";
import { distanceKm } from "./fires.js";

const EMPTY = { type: "FeatureCollection", features: [] };
const poly = (ring) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } });

/** onDone(ring, shape) is called with a closed lon/lat ring. Returns {setMode(mode), mode, clear(), cancel()}. */
export function initDraw(map, { onDone, onMode, onBlocked } = {}) {
  let mode = "point", start = null, verts = [], dragging = false;

  const ensure = () => {
    if (map.getSource("sel")) return;
    map.addSource("sel", { type: "geojson", data: EMPTY });
    map.addSource("sel-draft", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "sel-fill", type: "fill", source: "sel", paint: { "fill-color": "#5ef2ff", "fill-opacity": 0.08 } });
    map.addLayer({ id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#5ef2ff", "line-width": 2 } });
    map.addLayer({ id: "sel-draft-line", type: "line", source: "sel-draft", filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": "#5ef2ff", "line-width": 1.6, "line-dasharray": [2, 2] } });
    map.addLayer({ id: "sel-draft-pt", type: "circle", source: "sel-draft", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 4, "circle-color": "#5ef2ff", "circle-stroke-color": "#02040a", "circle-stroke-width": 1.5 } });
  };
  const draft = (features) => { ensure(); map.getSource("sel-draft").setData({ type: "FeatureCollection", features }); };
  const finish = (ring, shape) => {
    ensure();
    map.getSource("sel").setData(poly(ring));
    draft([]);
    start = null; verts = []; dragging = false;
    onDone?.(ring, shape);
  };
  const lngLat = (e) => [e.lngLat.lng, e.lngLat.lat];
  const vertexFeatures = (pts) => pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));

  // While the map flies or zooms, a click would land on a moving point: ignore it and say why.
  const moving = () => { if (!map.isMoving()) return false; onBlocked?.(); return true; };

  // Rectangle and circle: press, drag, release (the map does not pan meanwhile).
  map.on("mousedown", (e) => {
    if (mode !== "rect" && mode !== "circle") return;
    e.preventDefault();
    if (moving()) return;
    start = lngLat(e); dragging = true;
  });
  map.on("mousemove", (e) => {
    const p = lngLat(e);
    if (dragging && start) {
      const ring = mode === "rect" ? rectRing(start, p) : circleRing(start, Math.max(0.5, distanceKm(start[0], start[1], p[0], p[1])));
      draft([poly(ring)]);
    } else if (mode === "polygon" && verts.length)
      draft([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...verts, p] } }, ...vertexFeatures(verts)]);
  });
  map.on("mouseup", (e) => {
    if (!dragging || !start) return;
    const p = lngLat(e);
    const km = distanceKm(start[0], start[1], p[0], p[1]);
    dragging = false;
    if (km < 0.5) { start = null; draft([]); return; }    // a click, not a drag
    finish(mode === "rect" ? rectRing(start, p) : circleRing(start, km), mode);
  });

  // Polygon: click corners; closing on the first corner or a double-click finishes.
  map.on("click", (e) => {
    if (mode !== "polygon" || moving()) return;
    const p = lngLat(e);
    if (verts.length >= 3) {
      const first = map.project(verts[0]);
      if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) return finish([...verts, verts[0]], "polygon");
    }
    verts.push(p);
    draft(vertexFeatures(verts));
  });
  map.on("dblclick", (e) => {
    if (mode !== "polygon") return;
    e.preventDefault();
    if (verts.length >= 3) finish([...verts, verts[0]], "polygon");
  });

  const api = {
    get mode() { return mode; },
    /** True while a shape is being drawn (other click handlers should stand aside). */
    get busy() { return mode !== "point"; },
    setMode(m) {
      mode = m; start = null; verts = []; dragging = false;
      if (map.getSource("sel-draft")) draft([]);
      const drawing = m !== "point";
      map.getCanvas().style.cursor = drawing ? "crosshair" : "";
      drawing ? map.dragPan.disable() : map.dragPan.enable();
      drawing ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();
      onMode?.(m);
    },
    /** Esc: drop the shape being drawn; returns true if there was one. */
    cancel() {
      const had = !!start || verts.length > 0;
      start = null; verts = []; dragging = false;
      if (map.getSource("sel-draft")) draft([]);
      return had;
    },
    clear() { if (map.getSource("sel")) map.getSource("sel").setData(EMPTY); },
  };
  return api;
}
