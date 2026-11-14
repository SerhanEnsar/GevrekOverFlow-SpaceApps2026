// Before/after swipe: a second, camera-synced map shows the "after" frame and is
// clipped to the right of a draggable handle. The main map shows the "before" frame.
import maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.1/+esm";

const OVERLAY_DROP = ["passes-fill", "passes-line", "showcase-halo", "showcase-dot", "pick"];

export function defaultPair(dates, eventDate) {
  const post = dates.findIndex((d) => d >= eventDate);
  if (post <= 0) return [0, Math.max(0, dates.length - 1)];
  return [post - 1, post];
}

/** map: main map (already showing the "before" frame). afterUrl: frame URL for the right side. */
export function initCompare(map, { afterUrl, bbox, beforeLabel, afterLabel }) {
  const host = map.getContainer().parentElement;
  const wrap = document.createElement("div");
  wrap.className = "cmp-wrap";
  const handle = document.createElement("div");
  handle.className = "cmp-handle";
  handle.innerHTML = `<span class="cmp-tag left">${beforeLabel}</span><span class="cmp-grip">⟷</span><span class="cmp-tag right">${afterLabel}</span>`;
  host.append(wrap, handle);

  const style = map.getStyle();
  style.layers = style.layers.filter((l) => !OVERLAY_DROP.includes(l.id));
  const [w, s, e, n] = bbox;
  const other = new maplibregl.Map({
    container: wrap, style, interactive: false, attributionControl: false,
    center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(),
  });
  other.on("load", () => {
    const src = other.getSource("frame");
    if (src) src.updateImage({ url: afterUrl, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
  });
  const sync = () => other.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
  map.on("move", sync);

  const setX = (x) => {
    const width = host.clientWidth;
    const px = Math.max(0, Math.min(width, x));
    wrap.style.clipPath = `inset(0 0 0 ${px}px)`;
    handle.style.left = `${px}px`;
  };
  setX(host.clientWidth / 2);
  const onMove = (ev) => setX(ev.clientX - host.getBoundingClientRect().left);
  handle.addEventListener("pointerdown", (ev) => {
    handle.setPointerCapture(ev.pointerId);
    handle.addEventListener("pointermove", onMove);
  });
  handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", onMove));

  return {
    destroy() {
      map.off("move", sync);
      other.remove();
      wrap.remove();
      handle.remove();
    },
  };
}
