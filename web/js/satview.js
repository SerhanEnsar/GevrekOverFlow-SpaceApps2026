// "Satellite view": the camera rides with NISAR (approximate position — visualization only).
// Kept light like a game camera: a fixed 1 s tick moves the camera in one jump (the map then stays a
// still picture until the next tick), only the newest NISAR days are drawn (level of detail), and
// entering/leaving uses a quick fade cut instead of a long flight that loads tiles all the way.
import { destination, groundRange } from "./orbit.js";

/** Where the beam hits the ground: centre of the swath, left of the flight direction. */
export function swathCentre(now) {
  const mid = (groundRange(33, now.altKm) + groundRange(47, now.altKm)) / 2;
  return destination([now.lon, now.lat], now.heading - 90, mid);
}

/** Camera for a view: "eye" = from the satellite toward the swath, "outside" = beside the beam. */
export function cameraFor(map, now, view) {
  if (view === "eye") {
    const [lng, lat] = swathCentre(now);
    return map.calculateCameraOptionsFromTo({ lng: now.lon, lat: now.lat }, now.altKm * 1000, { lng, lat }, 0);
  }
  const c = destination([now.lon, now.lat], now.heading - 90, 270);
  return { center: c, zoom: 4, pitch: 58, bearing: now.heading };
}

/** Ids of the NISAR day layers to hide: all but the `keep` newest. */
export function lodHidden(layerIds, keep = 2) {
  return [...layerIds].filter((id) => id.startsWith("nisar-")).sort().slice(0, -keep || undefined);
}

/**
 * ui: {bar, label, toggle, resume, close, fade, scan}. Returns the controller.
 */
export function createSatView(map, ui) {
  const st = { active: false, view: "eye", paused: false, frame: 0, saved: null, hidden: [] };
  const fadeCut = (fn) => {
    ui.fade.classList.add("on");
    setTimeout(() => { fn(); requestAnimationFrame(() => ui.fade.classList.remove("on")); }, 280);
  };
  const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  const render = () => {
    ui.label.innerHTML = `🛰 <strong>Satellite view</strong> · following NISAR · frame ${st.frame}`
      + (st.paused ? ' · <span class="muted">paused</span>' : "");
    ui.toggle.textContent = st.view === "eye" ? "Outside view" : "Satellite's eye";
    ui.resume.hidden = !st.paused;
  };
  const place = (now) => {
    vis("sat-beam", st.view !== "eye");                  // inside the beam it would only fill the screen
    if (map.getLayer("sat-swath")) map.setPaintProperty("sat-swath", "fill-opacity", st.view === "eye" ? 0.1 : 0.22);
    map.jumpTo(cameraFor(map, now, st.view));
  };

  const api = {
    get active() { return st.active; },
    enter(now) {
      if (st.active || !now) return;
      st.active = true; st.paused = false; st.frame = 0;
      st.saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      st.hidden = lodHidden(map.getStyle().layers.map((l) => l.id)).filter((id) => map.getLayoutProperty(id, "visibility") !== "none");
      st.hidden.forEach((id) => vis(id, false));
      ui.bar.hidden = false; render();
      fadeCut(() => place(now));
    },
    /** Called every tick with the latest position. */
    tick(now) {
      if (!st.active || st.paused || !now) return;
      st.frame++;
      place(now);
      render();
      ui.scan.classList.remove("go"); void ui.scan.offsetWidth; ui.scan.classList.add("go");
    },
    toggleView(now) {
      st.view = st.view === "eye" ? "outside" : "eye";
      st.paused = false; render();
      if (now) fadeCut(() => place(now));
    },
    pause() { if (st.active && !st.paused) { st.paused = true; render(); } },
    resume(now) { st.paused = false; render(); if (now) fadeCut(() => place(now)); },
    /** restore=false: leave the camera where it is (another feature is taking over). */
    exit(restore = true) {
      if (!st.active) return;
      st.active = false;
      st.hidden.forEach((id) => vis(id, true));
      vis("sat-beam", true);
      if (map.getLayer("sat-swath")) map.setPaintProperty("sat-swath", "fill-opacity", 0.22);
      ui.bar.hidden = true;
      if (restore && st.saved) { const s = st.saved; fadeCut(() => map.jumpTo(s)); }
    },
  };
  // A drag, scroll or rotate by the user pauses the follow (jumpTo has no originalEvent).
  map.on("movestart", (e) => { if (e.originalEvent && st.active) api.pause(); });
  return api;
}
