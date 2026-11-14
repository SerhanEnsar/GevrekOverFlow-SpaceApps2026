// Global card: what NISAR saw at any clicked place, from NASA GIBS imagery (~500 m).
import { passDates } from "./cmr.js";
import { readPixel, cropAround } from "./gibs.js";
import { gibsToDb, interpret } from "./rules.js";
import { nearby } from "./fires.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const db = (v) => (v == null ? "–" : v.toFixed(1).replace("-", "−"));

/** Default before/after: the first pass after `event` (or the latest pass) and the pass before it,
 *  preferring the same orbit so the pair is fully comparable. */
export function defaultPassPair(passes, event = null) {
  if (!passes.length) return [null, null];
  const asc = [...passes].sort((a, b) => (a.date < b.date ? -1 : 1));
  let j = event ? asc.findIndex((p) => p.date > event) : asc.length - 1;
  if (j < 0) j = asc.length - 1;
  const after = asc[j];
  const before = [...asc.slice(0, j)].reverse().find((p) => p.geometry === after.geometry) ?? asc[j - 1] ?? null;
  return [before, after];
}

/**
 * el: card container. ctx: {rules, fires: rows[], onFire(row), onClose()}.
 * Returns {destroy}. Everything loads asynchronously; the card shows progress.
 */
export async function openGlobalCard(el, lng, lat, ctx, { event = null, title = null } = {}) {
  const token = (el.__token = (el.__token ?? 0) + 1);
  const alive = () => el.__token === token;
  el.hidden = false;
  el.innerHTML = `
    <div class="gc-head">
      <div><div class="gc-kicker">${title ? "🔥 " + esc(title) : "Anywhere on Earth"}</div>
        <div class="gc-title">${lat.toFixed(3)}°, ${lng.toFixed(3)}°</div></div>
      <button class="btn ghost gc-close" aria-label="Close">✕</button>
    </div>
    <div class="gc-badge">Approximate · ~500 m · from NASA GIBS imagery</div>
    <div class="gc-body"><p class="muted">Asking NASA when NISAR imaged this place…</p></div>`;
  el.querySelector(".gc-close").addEventListener("click", () => { el.hidden = true; el.__token++; ctx.onClose?.(); });
  const body = el.querySelector(".gc-body");

  let passes;
  try { passes = await passDates(lng, lat); } catch { passes = null; }
  if (!alive()) return;
  if (!passes) { body.innerHTML = `<p class="muted">NASA's search service could not be reached. Try again in a moment.</p>`; return; }
  if (!passes.length) { body.innerHTML = `<p class="muted">NISAR has not imaged this place yet (or the data are not public yet).</p>`; return; }

  const opt = (p, sel) => `<option value="${p.date}|${p.geometry}" ${sel ? "selected" : ""}>${p.date} · ${p.geometry}</option>`;
  let [before, after] = defaultPassPair(passes, event);
  const fires = ctx.fires ? nearby(ctx.fires, lng, lat, 50).slice(0, 5) : [];

  body.innerHTML = `
    <div class="gc-dates">
      <label>Before<select class="gc-before">${passes.map((p) => opt(p, p === before)).join("")}</select></label>
      <label>After<select class="gc-after">${passes.map((p) => opt(p, p === after)).join("")}</select></label>
    </div>
    <div class="gc-imgs">
      <figure><div class="gc-img gc-img-b"></div><figcaption class="gc-cap-b"></figcaption></figure>
      <figure><div class="gc-img gc-img-a"></div><figcaption class="gc-cap-a"></figcaption></figure>
    </div>
    <div class="gc-result"></div>
    ${fires.length ? `<h4>Fires within 50 km (NASA EONET)</h4><ul class="gc-fires">${fires.map((f, i) =>
      `<li><button class="linkish" data-i="${i}">${esc(f[1])}</button> <span class="muted">${f[2]}${f[5] ? " · " + f[5].toLocaleString("en") + " ha" : ""}</span></li>`).join("")}</ul>` : ""}
    <details class="gc-details"><summary>Details</summary><div class="gc-expert"></div></details>
    <p class="m-small">${passes.length} NISAR passes here since ${passes.at(-1).date}. Only dates from the same orbit are fully comparable; across orbits only HV is.</p>`;

  fires.length && body.querySelectorAll(".gc-fires button").forEach((b) =>
    b.addEventListener("click", () => ctx.onFire?.(fires[+b.dataset.i])));

  const parse = (v) => { const [date, geometry] = v.split("|"); return passes.find((p) => p.date === date && p.geometry === geometry); };
  const selB = body.querySelector(".gc-before"), selA = body.querySelector(".gc-after");

  async function render() {
    const b = parse(selB.value), a = parse(selA.value);
    const res = body.querySelector(".gc-result");
    res.innerHTML = `<p class="muted">Reading the radar images…</p>`;
    body.querySelector(".gc-cap-b").textContent = b.date;
    body.querySelector(".gc-cap-a").textContent = a.date;
    const [pb, pa, cb, ca] = await Promise.all([readPixel(lng, lat, b.date), readPixel(lng, lat, a.date),
      cropAround(lng, lat, b.date), cropAround(lng, lat, a.date)]);
    if (!alive() || parse(selB.value) !== b || parse(selA.value) !== a) return;
    for (const [sel, c] of [[".gc-img-b", cb], [".gc-img-a", ca]]) {
      const box = body.querySelector(sel);
      box.innerHTML = "";
      if (c) {
        const cv = document.createElement("canvas"); cv.width = c.width; cv.height = c.height;
        cv.getContext("2d").drawImage(c, 0, 0); box.append(cv);
      } else box.innerHTML = `<span class="muted small">no image</span>`;
    }
    const dA = pa && gibsToDb(ctx.rules, pa.r, pa.g), dB = pb && gibsToDb(ctx.rules, pb.r, pb.g);
    if (!dA) {
      res.innerHTML = `<p class="muted">NASA's map service has no NISAR image for ${a.date} here yet. Pick another date.</p>`;
      body.querySelector(".gc-expert").innerHTML = "";
      return;
    }
    const ex = interpret(ctx.rules, { hh: dA.hh, hv: dA.hv, dhv: dB ? dA.hv - dB.hv : null, prevDate: b.date }, "global");
    const sameOrbit = a.geometry === b.geometry;
    res.innerHTML = `
      <div class="ex-head"><span class="sw" style="background:${ex.color}"></span>${ex.label}
        <span class="ex-conf ${ex.confidence}">${ex.confidence === "high" ? "clear" : "uncertain"}</span></div>
      <p>${ex.plain}</p>
      ${ex.change ? `<p class="gc-change ${ex.change.id}">${ex.change.label}${ex.change.experimental ? ' <span class="tag">experimental</span>' : ""}</p>` : ""}
      ${dB ? "" : `<p class="muted small">No image on ${b.date} here — change cannot be estimated.</p>`}
      ${sameOrbit ? "" : `<p class="muted small">Different orbits (${b.geometry} → ${a.geometry}): only HV is comparable.</p>`}`;
    body.querySelector(".gc-expert").innerHTML = `
      <div>${a.date}: HH ≈ ${db(dA.hh)} dB · HV ≈ ${db(dA.hv)} dB (GIBS RGB ${pa.r.toFixed(0)}, ${pa.g.toFixed(0)}, ${pa.b.toFixed(0)})</div>
      ${dB ? `<div>${b.date}: HH ≈ ${db(dB.hh)} dB · HV ≈ ${db(dB.hv)} dB · ΔHV ${db(dA.hv - dB.hv)} dB</div>` : ""}
      <div class="muted">${esc(ctx.rules.gibs_model.about)}</div>`;
  }
  selB.addEventListener("change", render);
  selA.addEventListener("change", render);
  await render();
}
