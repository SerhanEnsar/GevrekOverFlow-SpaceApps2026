// App wiring: globe, showcase panel, bottom time strip, method drawer, story.
import { SHOWCASES } from "./config.js";
import { initGlobe, flyToShowcase, setFrame, setFrameVisible, setPick, addNisarDays, setFires, setFireFocus, setOpenShowcase, setSatellite } from "./map.js";
import { loadTle, makePropagator, satelliteScene, destination } from "./orbit.js";
import { loadManifest, loadTimeseries, seriesAt, valuesAt, seriesToCsv } from "./data.js";
import { loadRules, interpret } from "./rules.js";
import { initTimeline } from "./timeline.js";
import { initCompare, defaultPair } from "./compare.js";
import { initStory } from "./story.js";
import { renderMethod, summaryHtml, legendHtml } from "./method.js";
import { tileTemplate, readPixel } from "./gibs.js";
import { gibsToDb } from "./rules.js";
import { hasPassAfter, imagedAfterLocal } from "./cmr.js";
import { loadFires, inRange } from "./fires.js";
import { openGlobalCard } from "./globalcard.js";

const $ = (id) => document.getElementById(id);

// ---- small UI helpers -------------------------------------------------------
let toastTimer = 0;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

const rules = await loadRules().catch(() => { toast("Interpretation rules could not be loaded."); return null; });

// ---- state ------------------------------------------------------------------
let timeline = null, compare = null, currentIdx = 0, currentId = null, layer = "radar";
let lastSeries = null;           // {series, lng, lat} for CSV
let pendingPoint = null;         // a click that came before the pixel values
const manifests = {};            // id -> manifest, for the method drawer

function bundle() { return window.__bundle; }

function showFrame() {
  const b = bundle(); if (!b) return;
  const m = b.manifest, d = m.dates[currentIdx];
  const rel = layer === "radar" ? m.frames[d] : m.change[d];
  $("legend").innerHTML = legendHtml(layer, m, currentIdx);
  if (!rel) { setFrameVisible(map, false); return; }
  setFrame(map, `data/${m.region}/${rel}`, m.bbox);
  setFrameVisible(map, true);
}

function setLayer(next) {
  layer = next;
  document.querySelectorAll(".seg-btn[data-layer]").forEach((b) => {
    const on = b.dataset.layer === next;
    b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
  });
  if (compare && next !== "radar") toggleCompare();
  showFrame();
}
document.querySelectorAll(".seg-btn[data-layer]").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.layer)));

function toggleCompare() {
  const b = bundle(); if (!b) return;
  if (compare) { compare.destroy(); compare = null; $("compare-btn").textContent = "Compare before / after"; return; }
  if (layer !== "radar") setLayer("radar");
  const m = b.manifest, [i, j] = defaultPair(m.dates, m.event_date);
  timeline.set(i);                                    // main map shows "before"
  compare = initCompare(map, {
    afterUrl: `data/${m.region}/${m.frames[m.dates[j]]}`, bbox: m.bbox,
    beforeLabel: `Before · ${m.dates[i]}`, afterLabel: `After · ${m.dates[j]}`,
  });
  $("compare-btn").textContent = "Close comparison";
}
$("compare-btn").addEventListener("click", toggleCompare);

// ---- showcases ----------------------------------------------------------------
async function openShowcase(s) {
  if (compare) toggleCompare();
  if (s.id === currentId && bundle()) return;          // already open
  currentId = s.id;
  $("gcard").hidden = true; setFireFocus(map, null);
  flyToShowcase(map, s);
  setOpenShowcase(map, s.id);
  $("intro").hidden = true; $("showcase").hidden = false; $("globe-btn").hidden = false;
  $("showcase-title").textContent = s.label;
  $("showcase-sub").textContent = s.subtitle;
  $("series-wrap").hidden = true; $("compare-btn").hidden = true; $("hint").hidden = true; $("summary").hidden = true;
  $("legend").innerHTML = "";
  $("timeline").innerHTML = '<span class="muted">Loading radar dates…</span>';
  window.__bundle = null;
  $("status").textContent = "Loading radar data…";
  try {
    const manifest = await loadManifest(s.id);
    if (currentId !== s.id) return;                     // user moved on meanwhile
    const b = { manifest, ts: null };
    window.__bundle = b;
    manifests[s.id] = manifest;
    $("status").textContent = "";
    $("summary").innerHTML = summaryHtml(manifest);
    $("summary").hidden = !manifest.summary;
    timeline = initTimeline($("timeline"), manifest, `data/${s.id}`, (_d, _url, i) => { currentIdx = i; showFrame(); });
    $("compare-btn").hidden = false;
    // Pixel values for the tooltip and the chart arrive in the background.
    $("hint").hidden = false;
    $("hint").textContent = "Loading pixel values…";
    loadTimeseries(s.id).then((ts) => {
      if (window.__bundle !== b) return;
      b.ts = ts;
      $("hint").textContent = "Click anywhere on the radar image to see how that place changed.";
      if (pendingPoint) { showPoint(...pendingPoint); pendingPoint = null; }
    }).catch(() => { $("hint").textContent = "Pixel values could not be loaded — the images still work."; });
  } catch (e) {
    $("status").textContent = "Radar data for this showcase could not be loaded. Check your connection and try again.";
    $("timeline").innerHTML = '<span class="muted">No radar dates available.</span>';
  }
}

function goGlobe(fly = true) {
  if (compare) toggleCompare();
  timeline?.stop?.();
  currentId = null; window.__bundle = null;
  setFrameVisible(map, false);
  setOpenShowcase(map, null);
  $("intro").hidden = false; $("showcase").hidden = true; $("globe-btn").hidden = true;
  $("timeline").innerHTML = '<span class="muted">Pick a showcase on the globe to travel through its radar dates.</span>';
  if (fly) map.flyTo({ center: [10, 30], zoom: 1.6, pitch: 0, bearing: 0, duration: 3000 });
}
$("globe-btn").addEventListener("click", () => goGlobe());

const map = initGlobe("map", SHOWCASES, {
  onShowcase: openShowcase,
  onError: () => toast("Some NASA map tiles could not be loaded right now — the rest of the site keeps working."),
});

// ---- point time series + CSV ------------------------------------------------
function showPoint(lng, lat) {
  const b = bundle(); if (!b) return;
  if (!b.ts) { pendingPoint = [lng, lat]; setPick(map, { lng, lat }); return; }
  setPick(map, { lng, lat });
  $("hint").hidden = true; $("series-wrap").hidden = false;
  const series = seriesAt(b, lng, lat, 60);
  lastSeries = series ? { series, lng, lat } : null;
  $("csv-btn").disabled = !series;
  // Chart.js (~200 KB) is only needed once someone clicks a place.
  import("./chart.js").then(({ showSeries }) => showSeries($("series"), series, b.manifest));
}
const inShowcase = (lng, lat) => {
  const b = bundle(); if (!b) return false;
  const [w, s, e, n] = b.manifest.bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
};

map.on("click", (e) => {
  if (map.queryRenderedFeatures(e.point, { layers: ["showcase-dot"] }).length) return;
  const fire = map.getLayer("fires") && map.queryRenderedFeatures(e.point, { layers: ["fires"] })[0];
  if (fire) { fireIdx = fire.properties.i; focusFire(fireView[fireIdx]); return; }
  if (inShowcase(e.lngLat.lng, e.lngLat.lat)) { showPoint(e.lngLat.lng, e.lngLat.lat); return; }
  openGlobal(e.lngLat.lng, e.lngLat.lat);
});

// ---- global card (anywhere outside the showcases) -------------------------------
function openGlobal(lng, lat, opts = {}) {
  if (!rules) return toast("Interpretation rules are missing — cannot read this place.");
  $("explain").hidden = true;
  setPick(map, { lng, lat });
  openGlobalCard($("gcard"), lng, lat, {
    rules, fires: allFires,
    onFire: (row) => { fireIdx = fireView.indexOf(row); focusFire(row); },
  }, opts);
}
$("csv-btn").addEventListener("click", () => {
  const b = bundle(); if (!b || !lastSeries) return;
  const { series, lng, lat } = lastSeries;
  const blob = new Blob([seriesToCsv(series, b.manifest, lng, lat)], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob), download: `nisar_${b.manifest.region}_${lat.toFixed(4)}_${lng.toFixed(4)}.csv`,
  });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- "What am I looking at?" tooltip -----------------------------------------
let raf = 0;
let hoverTimer = 0, hoverToken = 0;
function placeBox(box, point) {
  const host = map.getContainer().getBoundingClientRect();
  box.style.left = `${Math.min(point.x + 16, host.width - 320)}px`;
  box.style.top = `${Math.min(point.y + 16, host.height - 170)}px`;
}
// Outside the showcases: read the newest GIBS NISAR image under the cursor (zoom >= 5, after a short pause).
function hoverGlobal(e) {
  const box = $("explain"), token = ++hoverToken;
  clearTimeout(hoverTimer);
  box.hidden = true;
  if (!rules || !nisarDates.length || map.getZoom() < 5 || compare) return;
  hoverTimer = setTimeout(async () => {
    for (const d of nisarDates) {
      const px = await readPixel(e.lngLat.lng, e.lngLat.lat, d);
      if (token !== hoverToken) return;
      if (!px) continue;
      const v = gibsToDb(rules, px.r, px.g);
      const ex = interpret(rules, { hh: v.hh, hv: v.hv }, "global");
      box.innerHTML = `<div class="ex-head"><span class="sw" style="background:${ex.color}"></span>${ex.label}
        <span class="ex-conf ${ex.confidence}">${ex.confidence === "high" ? "clear" : "uncertain"}</span></div>
        <div>${ex.plain}</div><div class="explain-expert">NISAR image of ${d} · HV ≈ ${v.hv.toFixed(1).replace("-", "−")} dB<br>${ex.sourceLabel}<br>Click for dates and change</div>`;
      placeBox(box, e.point);
      box.hidden = false;
      return;
    }
  }, 250);
}

map.on("mousemove", (e) => {
  cancelAnimationFrame(raf);
  if (!inShowcase(e.lngLat.lng, e.lngLat.lat)) { hoverGlobal(e); return; }
  clearTimeout(hoverTimer); hoverToken++;
  raf = requestAnimationFrame(() => {
    const b = bundle(), box = $("explain");
    const now = b && valuesAt(b, e.lngLat.lng, e.lngLat.lat, currentIdx);
    const prev = b && currentIdx > 0 ? valuesAt(b, e.lngLat.lng, e.lngLat.lat, currentIdx - 1) : null;
    const ex = now && rules && interpret(rules, {
      hh: now.hh, hv: now.hv,
      dhv: prev && prev.hv != null && now.hv != null ? now.hv - prev.hv : null,
      prevDate: currentIdx > 0 ? b.manifest.dates[currentIdx - 1] : null,
    });
    if (!ex || compare) { box.hidden = true; return; }
    box.innerHTML = `<div class="ex-head"><span class="sw" style="background:${ex.color}"></span>${ex.label}
      <span class="ex-conf ${ex.confidence}">${ex.confidence === "high" ? "clear" : "uncertain"}</span></div>
      <div>${ex.plain}</div><div class="explain-expert">${ex.expert}<br>${ex.sourceLabel}</div>`;
    placeBox(box, e.point);
    box.hidden = false;
  });
});
map.on("mouseout", () => { $("explain").hidden = true; clearTimeout(hoverTimer); hoverToken++; });

// ---- NISAR imagery of the last 12 days (dates from the passes file) --------------
let nisarDates = [];
let passesFc = null;
let mapReady = false;
map.once("load", () => { mapReady = true; if (allFires.length) refreshFires(); });
map.once("load", async () => {
  try {
    const fc = await fetch("data/global/passes.geojson").then((r) => r.json());
    passesFc = fc;
    nisarDates = [...new Set(fc.features.map((f) => f.properties.date))].sort().reverse().slice(0, 12);
    addNisarDays(map, nisarDates, tileTemplate);
  } catch { /* the globe works without the imagery */ }
});

// ---- fires: time range, markers, "latest fire" and stepping -------------------------
const today = new Date().toISOString().slice(0, 10);
let allFires = [], fireView = [], fireIdx = -1, fireDays = 30;

function refreshFires() {
  fireView = inRange(allFires, fireDays, today);
  fireIdx = -1;
  if (mapReady) setFires(map, fireView, today);
  $("fire-count").textContent = `${fireView.length.toLocaleString("en")} fires`;
}
document.querySelectorAll("#fires .seg-btn").forEach((b) => b.addEventListener("click", () => {
  fireDays = +b.dataset.days;
  document.querySelectorAll("#fires .seg-btn").forEach((x) => x.classList.toggle("on", x === b));
  refreshFires();
}));

function focusFire(row) {
  if (!row) return;
  if (bundle() && !inShowcase(row[3], row[4])) goGlobe(false);
  map.stopSpin?.();
  setFireFocus(map, row);
  $("fire-current").textContent = `${row[1]} · ${row[2]}${row[5] ? " · " + row[5].toLocaleString("en") + " ha" : ""}`;
  map.flyTo({ center: [row[3], row[4]], zoom: 7.5, duration: 3500, essential: true });
  openGlobal(row[3], row[4], { event: row[2], title: row[1] });
}

// dir +1 = older, -1 = newer. With the NISAR filter, skip fires that NISAR has not imaged since:
// recent fires are checked against the local passes file, older ones with cheap CMR hit counts,
// six at a time.
async function imagedAfter(row) {
  const local = passesFc ? imagedAfterLocal(passesFc, row[3], row[4], row[2]) : null;
  return local ?? hasPassAfter(row[3], row[4], row[2]).catch(() => false);
}
async function stepFire(dir) {
  const start = fireIdx + dir;
  if (start < 0 || start >= fireView.length) return toast("No more fires in this time range.");
  if (!$("fire-nisar").checked) { fireIdx = start; return focusFire(fireView[start]); }
  $("fire-current").textContent = "Looking for a fire NISAR has imaged since…";
  for (let i = start; i >= 0 && i < fireView.length && Math.abs(i - start) < 300; ) {
    const batch = [];
    for (let k = 0; k < 6 && i >= 0 && i < fireView.length; k++, i += dir) batch.push(i);
    const ok = await Promise.all(batch.map((j) => imagedAfter(fireView[j])));
    const hit = batch[ok.indexOf(true)];
    if (hit != null) { fireIdx = hit; return focusFire(fireView[hit]); }
  }
  $("fire-current").textContent = "";
  toast("No fire in this range has a later NISAR pass yet.");
}
$("fire-latest").addEventListener("click", () => { fireIdx = -1; stepFire(+1); });
$("fire-older").addEventListener("click", () => stepFire(+1));
$("fire-newer").addEventListener("click", () => stepFire(-1));

loadFires().then((rows) => {
  allFires = rows;
  refreshFires();
  if (!rows.length) $("fire-count").textContent = "Fire data could not be loaded.";
});

// ---- NISAR now (approximate position from public TLE — visualization only) -------
let satNow = null;
async function startSatellite() {
  const tle = await loadTle();
  if (!tle) { $("sat-btn").hidden = true; return; }
  const at = await makePropagator(tle).catch(() => null);
  if (!at) { $("sat-btn").hidden = true; return; }
  const tick = () => {
    if (document.hidden) return;
    const sc = satelliteScene(at, new Date());
    if (!sc) return;
    satNow = sc.now;
    setSatellite(map, sc);
    const n = sc.now, ns = n.lat >= 0 ? "N" : "S", ew = n.lon >= 0 ? "E" : "W";
    $("sat-chip").innerHTML = `🛰 <strong>NISAR now</strong> · ${Math.abs(n.lat).toFixed(1)}°${ns}, ${Math.abs(n.lon).toFixed(1)}°${ew}
      · ${Math.round(n.altKm)} km <span class="muted">· approximate, from public TLE (${(tle.date ?? "").slice(0, 10)}) · visualization only</span>`;
    $("sat-chip").hidden = false;
  };
  tick();
  setInterval(tick, 2000);
}
$("sat-btn").addEventListener("click", () => {
  if (!satNow) return toast("NISAR's position is not available right now.");
  if (bundle()) goGlobe(false);
  map.stopSpin?.();
  // Look along the flight direction from behind, so the beam leans out to the left.
  // Centre between the nadir and the imaged strip and look along the flight direction:
  // the beam then climbs from the strip (left) to the satellite (right).
  const c = destination([satNow.lon, satNow.lat], satNow.heading - 90, 270);
  map.flyTo({ center: c, zoom: 4, pitch: 58, bearing: satNow.heading, duration: 3500, essential: true });
});
if (mapReady) startSatellite(); else map.once("load", startSatellite);

// ---- method drawer ------------------------------------------------------------
async function openMethod() {
  for (const s of SHOWCASES)
    if (!manifests[s.id])
      manifests[s.id] = await fetch(`data/${s.id}/manifest.json`).then((r) => r.json()).catch(() => null);
  renderMethod($("method-body"), rules, manifests);
  $("method").hidden = false; $("method-btn").setAttribute("aria-expanded", "true");
}
function closeMethod() { $("method").hidden = true; $("method-btn").setAttribute("aria-expanded", "false"); }
$("method-btn").addEventListener("click", () => ($("method").hidden ? openMethod() : closeMethod()));
$("method-close").addEventListener("click", closeMethod);
// Escape closes the top-most thing: drawer → comparison → card → showcase (back to the globe).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.target.closest?.("input, select, textarea")) return;
  if (!$("method").hidden) return closeMethod();
  if (compare) return toggleCompare();
  if (!$("gcard").hidden) { $("gcard").querySelector(".gc-close")?.click(); return; }
  if (bundle() || currentId) return goGlobe();
  if (map.getPitch() > 0 || map.getBearing() !== 0) map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });
});
$("summary").addEventListener("click", (e) => {
  if (e.target.closest("[data-open-method]")) { e.preventDefault(); openMethod(); }
});

// ---- guided story (starts by itself on the first visit) ------------------------
async function startStory() {
  const steps = await fetch("story.json").then((r) => r.json()).catch(() => null);
  if (!steps) return toast("The story could not be loaded.");
  initStory($("story"), steps, {
    goGlobe,
    openShowcase: (id) => openShowcase(SHOWCASES.find((x) => x.id === id)),
    setDate: (d) => { const k = bundle()?.manifest.dates.indexOf(d); if (k >= 0) timeline.set(k); },
    setCompare: (on) => { if (on !== !!compare) toggleCompare(); },
    showPoint: ([lng, lat]) => showPoint(lng, lat),
  });
}
$("story-btn").addEventListener("click", startStory);
try {
  if (!localStorage.getItem("nisar-story-seen")) {
    localStorage.setItem("nisar-story-seen", "1");
    map.once("load", startStory);
  }
} catch { /* storage blocked: no auto-start */ }

window.__map = map; // for manual inspection during development
