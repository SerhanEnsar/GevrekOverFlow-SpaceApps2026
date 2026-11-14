// Area card: what NISAR saw inside a drawn rectangle, circle or polygon.
import { passDates } from "./cmr.js";
import { defaultPassPair } from "./globalcard.js";
import { periodicPasses, sparkline } from "./timemachine.js";
import { gibsArea, bundleArea, classStats, changeStats, radarImage, changeImage, areaCsv,
  ringAreaKm2, ringCentroid } from "./area.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const haTxt = (ha) => (ha >= 10000 ? `${(ha / 100).toLocaleString("en", { maximumFractionDigits: 0 })} km²` : `${Math.round(ha).toLocaleString("en")} ha`);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const db = (v) => (v == null ? "–" : v.toFixed(1).replace("-", "−"));
const SHAPES = { rect: "Rectangle", circle: "Circle", polygon: "Polygon" };

function toCanvas(off, cls = "") {
  const c = document.createElement("canvas");
  c.width = off.width; c.height = off.height; c.className = cls;
  c.getContext("2d").drawImage(off, 0, 0);
  return c;
}

function classBar(stats, rules) {
  const total = stats.validHa;
  if (!total) return `<p class="muted small">No NISAR pixels on this date here.</p>`;
  const rows = rules.classes.filter((c) => stats.byClass[c.id]).map((c) => ({ c, ha: stats.byClass[c.id] }))
    .sort((a, b) => b.ha - a.ha);
  return `<div class="ac-bar" role="img" aria-label="Land classes">${rows.map(({ c, ha }) =>
      `<span style="width:${(100 * ha) / total}%;background:${c.color}" title="${esc(c.label)} ${pct(ha, total)}"></span>`).join("")}</div>
    <ul class="ac-classes">${rows.map(({ c, ha }) => `<li><span class="sw" style="background:${c.color}"></span>${esc(c.label)}
      <span class="ac-num">${pct(ha, total)} · ${haTxt(ha)}</span></li>`).join("")}</ul>`;
}

/**
 * el: card container. ring: closed lon/lat ring. shape: rect|circle|polygon.
 * ctx: {rules, bundle (a loaded showcase bundle if the area lies inside it) , onClose, event}
 */
export async function openAreaCard(el, ring, shape, ctx) {
  const token = (el.__token = (el.__token ?? 0) + 1);
  const alive = () => el.__token === token;
  const km2 = ringAreaKm2(ring), [clon, clat] = ringCentroid(ring);
  const useBundle = !!ctx.bundle?.ts;
  const source = useBundle ? "showcase" : "global";
  el.hidden = false;
  el.innerHTML = `
    <div class="gc-head">
      <div><div class="gc-kicker">Area · ${SHAPES[shape] ?? "Selection"}</div>
        <div class="gc-title">${km2 < 100 ? km2.toFixed(1) : Math.round(km2).toLocaleString("en")} km² · ${clat.toFixed(3)}°, ${clon.toFixed(3)}°</div></div>
      <button class="btn ghost gc-close" aria-label="Close">✕</button>
    </div>
    <div class="gc-badge">${useBundle ? "Full resolution · 20 m · showcase data (inside the showcase only)" : "Approximate · ~500 m pixels · from NASA GIBS imagery"}</div>
    <div class="gc-body"><p class="muted">${useBundle ? "Reading the showcase pixels…" : "Asking NASA when NISAR imaged this area…"}</p></div>`;
  el.querySelector(".gc-close").addEventListener("click", () => { el.hidden = true; el.__token++; ctx.onClose?.(); });
  const body = el.querySelector(".gc-body");

  let area;
  if (useBundle) area = bundleArea(ctx.bundle, ring);
  else {
    let passes;
    try { passes = await passDates(clon, clat); } catch { passes = null; }
    if (!alive()) return;
    if (!passes) { body.innerHTML = `<p class="muted">NASA's search service could not be reached. Try again in a moment.</p>`; return; }
    if (!passes.length) { body.innerHTML = `<p class="muted">NISAR has not imaged this area yet (or the data are not public yet).</p>`; return; }
    area = gibsArea(ring, passes, ctx.rules);
  }
  if (area.tooBig) {
    body.innerHTML = `<p class="gc-warn">This area is too large to read in the browser (about 150 × 150 km at most). Draw a smaller one.</p>`;
    return;
  }
  if (!area.n) { body.innerHTML = `<p class="muted">The shape is too small: no NISAR pixel centre falls inside it. Draw a larger one.</p>`; return; }

  const dates = area.dates;
  let [before, after] = useBundle
    ? [dates.find((d) => d.date === ctx.bundle.manifest.summary?.pre_date) ?? dates[0], dates.find((d) => d.date === ctx.bundle.manifest.summary?.post_date) ?? dates.at(-1)]
    : defaultPassPair(dates, ctx.event);
  const opt = (p, sel) => `<option value="${p.date}|${p.geometry}" ${sel ? "selected" : ""}>${p.date}${p.geometry ? " · " + p.geometry : ""}${p.hv === false ? " · HH only" : ""}</option>`;
  const desc = [...dates].sort((a, b) => (a.date < b.date ? 1 : -1));
  body.innerHTML = `
    <div class="gc-dates">
      <label>Before<select class="ac-before">${desc.map((p) => opt(p, p === before)).join("")}</select></label>
      <label>After<select class="ac-after">${desc.map((p) => opt(p, p === after)).join("")}</select></label>
    </div>
    <h4>What is there <span class="muted small ac-on"></span></h4>
    <div class="ac-what"><p class="muted small">Reading ${area.n.toLocaleString("en")} pixels…</p></div>
    <h4>What changed</h4>
    <div class="ac-change"></div>
    <section class="ac-tm"></section>
    <div class="row-between ac-foot"><span class="m-small">${area.n.toLocaleString("en")} pixels${area.sampled ? " (sampled)" : ""} ·
      only same-orbit dates are fully comparable.</span><button class="btn small ac-csv" disabled>⤓ CSV</button></div>`;
  const parse = (v) => { const [d, g] = v.split("|"); return dates.find((p) => p.date === d && String(p.geometry) === g); };
  const selB = body.querySelector(".ac-before"), selA = body.querySelector(".ac-after");
  const thr = ctx.rules.sources[source].change_threshold_db;
  const csvRows = new Map();
  const remember = (p, stats) => csvRows.set(p.date + p.geometry, { date: p.date, geometry: p.geometry, stats });

  let auto = useBundle ? 0 : 4;                            // first render: skip up to 4 dates GIBS has no image for
  async function render() {
    const b = parse(selB.value), a = parse(selA.value);
    body.querySelector(".ac-on").textContent = `· ${a.date}`;
    const what = body.querySelector(".ac-what"), ch = body.querySelector(".ac-change");
    ch.innerHTML = `<p class="muted small">Comparing ${b.date} and ${a.date}…</p>`;
    if (a.hv === false) {
      what.innerHTML = `<p class="gc-warn">On ${a.date} NISAR recorded <strong>HH only</strong>: no vegetation signal. Pick another “after” date.</p>`;
      ch.innerHTML = ""; return;
    }
    const [vb, va] = await Promise.all([b.hv === false ? null : area.read(b.date), area.read(a.date)]);
    if (!alive() || parse(selB.value) !== b || parse(selA.value) !== a) return;
    const sa = classStats(area, va, ctx.rules, source);
    if (!sa.validHa) {
      // NASA's map service often lacks a day: on the first view, step back to an earlier pass of the same orbit.
      const older = auto-- > 0 && desc.filter((p) => p.date < a.date && p.geometry === a.geometry && p.hv !== false && p !== b);
      if (older?.length) {
        const nb = desc.find((p) => p.date < older[0].date && p.geometry === a.geometry && p.hv !== false) ?? b;
        selA.value = `${older[0].date}|${older[0].geometry}`; selB.value = `${nb.date}|${nb.geometry}`;
        return render();
      }
      what.innerHTML = `<p class="gc-warn">NASA's map service has no NISAR image of this area for ${a.date} yet. Pick another “after” date.</p>`;
      ch.innerHTML = ""; return;
    }
    auto = 0;
    remember(a, sa);
    const coverage = sa.coverage < 0.9 ? `<p class="muted small">NISAR imaged ${Math.round(sa.coverage * 100)}% of this area on ${a.date}.</p>` : "";
    what.innerHTML = classBar(sa, ctx.rules) + coverage + `<p class="m-small">Mean vegetation signal (HV): ${db(sa.meanHv)} dB</p>`;
    if (!vb) { ch.innerHTML = `<p class="muted small">${b.date} recorded HH only — pick another “before” date to see change.</p>`; return; }
    remember(b, classStats(area, vb, ctx.rules, source));
    const c = changeStats(area, vb, va, thr);
    const sameOrbit = a.geometry === b.geometry;
    ch.innerHTML = `
      <div class="ac-change-nums">
        <div><span class="ac-big loss">${haTxt(c.lossHa)}</span><span class="muted small">vegetation signal fell ≥ ${thr} dB (${pct(c.lossHa, c.comparedHa)})</span></div>
        <div><span class="ac-big gain">${haTxt(c.gainHa)}</span><span class="muted small">rose ≥ ${thr} dB (${pct(c.gainHa, c.comparedHa)})</span></div>
      </div>
      ${source === "global" ? '<p class="m-small"><span class="tag">experimental</span> ~500 m pixels: sizes are approximate.</p>' : ""}
      ${sameOrbit ? "" : `<p class="muted small">Different orbits (${b.geometry} → ${a.geometry}): only HV is comparable.</p>`}
      <div class="ac-imgs"><figure><div class="ac-img ac-img-a"></div><figcaption>Radar · ${a.date}</figcaption></figure>
        <figure><div class="ac-img ac-img-c"></div><figcaption><span class="lg-dot loss"></span>loss <span class="lg-dot gain"></span>gain · ${b.date} → ${a.date}</figcaption></figure></div>`;
    ch.querySelector(".ac-img-a").append(toCanvas(radarImage(area, va, ctx.rules)));
    ch.querySelector(".ac-img-c").append(toCanvas(changeImage(area, c.code)));
    body.querySelector(".ac-csv").disabled = false;
  }
  selB.addEventListener("change", render);
  selA.addEventListener("change", render);
  body.querySelector(".ac-csv").addEventListener("click", () => {
    const rows = [...csvRows.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
    const meta = `${SHAPES[shape] ?? "Area"} ${km2.toFixed(1)} km² around ${clat.toFixed(4)}, ${clon.toFixed(4)}; source ${useBundle ? "showcase 20 m" : "NASA GIBS ~500 m"}.`;
    const url = URL.createObjectURL(new Blob([areaCsv(rows, ctx.rules, meta)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `nisar-area-${clat.toFixed(3)}_${clon.toFixed(3)}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  await render();
  if (alive()) await areaTimeMachine(body.querySelector(".ac-tm"), area, ctx, source, after?.geometry, alive, remember);
}

/** Periods of the whole area: radar image per period (animated) and the mean HV line. */
async function areaTimeMachine(el, area, ctx, source, prefer, alive, remember) {
  const pick = periodicPasses(area.dates, ctx.event, 6, prefer);
  if (pick.length < 2) return;
  el.innerHTML = `<h4>Time machine <span class="muted small">· reading ${pick.length} periods…</span></h4>`;
  const frames = [];
  for (const p of pick) {                                   // one at a time: each read can touch many tiles
    const v = await area.read(p.date);
    if (!alive()) return;
    const s = classStats(area, v, ctx.rules, source);
    if (s.coverage < 0.2) continue;                         // NISAR barely covered the area that day
    remember(p, s);
    frames.push({ date: p.date, hv: s.meanHv, img: radarImage(area, v, ctx.rules), stats: s });
  }
  if (frames.length < 2) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <h4>Time machine <span class="muted small">· ${frames.length} periods · orbit ${pick[0].geometry ?? "showcase"}</span></h4>
    <div class="tm-view ac-tm-view"><canvas></canvas><div class="tm-date"></div></div>
    <div class="tm-ctl"><button class="btn small tm-play" aria-label="Play">▶</button>
      <div class="tm-strip">${frames.map((f, i) => `<button class="tm-thumb" data-i="${i}" title="${f.date}"><span class="tm-d">${f.date.slice(2, 7).replace("-", "/")}</span></button>`).join("")}</div></div>
    <div class="tm-chart">${sparkline(frames, ctx.event)}<div class="muted small">Mean vegetation signal of the area (HV, dB): ${frames.map((f) => db(f.hv)).join(" → ")}</div></div>`;
  const cv = el.querySelector(".tm-view canvas"); cv.width = area.width; cv.height = area.height;
  const g = cv.getContext("2d"), label = el.querySelector(".tm-date"), thumbs = [...el.querySelectorAll(".tm-thumb")];
  thumbs.forEach((t, i) => t.prepend(toCanvas(frames[i].img)));
  let i = 0, timer = 0;
  const show = (k) => {
    i = k; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(frames[k].img, 0, 0);
    const ev = ctx.event;
    label.innerHTML = `${frames[k].date}${ev ? (frames[k].date > ev ? ' · <span class="tm-after">after the fire</span>' : " · before the fire") : ""}`;
    thumbs.forEach((t, j) => t.classList.toggle("on", j === k));
    el.querySelectorAll(".tm-spark circle").forEach((c) => c.classList.toggle("on", +c.dataset.i === k));
  };
  const play = el.querySelector(".tm-play");
  const stop = () => { clearInterval(timer); timer = 0; play.textContent = "▶"; };
  play.addEventListener("click", () => {
    if (timer) return stop();
    play.textContent = "❚❚";
    timer = setInterval(() => { if (!el.isConnected) return stop(); show((i + 1) % frames.length); }, 1100);
  });
  thumbs.forEach((t, k) => t.addEventListener("click", () => { stop(); show(k); }));
  show(0);
}
