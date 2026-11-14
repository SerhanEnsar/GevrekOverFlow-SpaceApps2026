// "How we measured" drawer: physics, polarization, the live rules table and findings.
// Numbers come from rules.json and the bundle manifests, so text and data never drift apart.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (v) => (v == null ? "–" : v.toFixed(1).replace("-", "−"));

/** Human-readable condition of a rule ("HV > −13 dB"). */
export function conditionText(when) {
  const parts = [];
  if (when.hv_max != null) parts.push(`HV < ${fmt(when.hv_max)} dB`);
  if (when.hv_min != null) parts.push(`HV > ${fmt(when.hv_min)} dB`);
  if (when.hh_min != null) parts.push(`HH > ${fmt(when.hh_min)} dB`);
  if (when.hh_minus_hv_min != null) parts.push(`HH−HV > ${fmt(when.hh_minus_hv_min)} dB`);
  return parts.length ? parts.join(" and ") : "anything else";
}

function rulesTable(rules) {
  const rows = rules.classes.map((c) => `
    <tr><td><span class="sw" style="background:${c.color}"></span>${esc(c.label)}</td>
    <td>${conditionText(c.when)}</td>
    <td>${c.sources ? "showcases only" : "everywhere"}</td></tr>`).join("");
  const s = rules.sources;
  return `
    <table class="m-table"><thead><tr><th>Class</th><th>Rule (first match wins)</th><th>Used</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="m-small">Change: HV fell or rose by at least ${s.showcase.change_threshold_db} dB (showcases) or
    ${s.global.change_threshold_db} dB (global layer, experimental). Confidence is “low” when the class would change
    within ±${s.showcase.uncertainty_db} dB (showcases) or ±${s.global.uncertainty_db} dB (global).</p>`;
}

function seriesRow(label, m, key) {
  const s = m.summary;
  return `<tr><td>${label}</td>${m.dates.map((d, i) => `<td>${fmt(s[key][i])}</td>`).join("")}</tr>`;
}

function findingSpain(m) {
  const s = m?.summary;
  if (!s) return "";
  return `
    <h4>Guadalajara, Spain — a clear burn scar that does not recover</h4>
    <p>Between ${s.pre_date} and ${s.post_date}, <strong>${Math.round(s.burn_ha).toLocaleString("en")} ha</strong>
    lost at least 3 dB of HV — more than half of the signal scattered back by vegetation. Unchanged land nearby stays flat.
    Three months later the burned area is still losing signal: no regrowth is visible yet.</p>
    <table class="m-table num"><thead><tr><th>Mean HV (dB)</th>${m.dates.map((d) => `<th>${d.slice(5)}</th>`).join("")}</tr></thead>
    <tbody>${seriesRow("Burned area", m, "burn_hv")}${seriesRow("Unchanged area", m, "control_hv")}</tbody></table>
    <p class="m-small">The January date comes from another orbit. Across orbits, HV of unchanged land agrees well
    (r = 0.90, mean difference 0.3 dB) while HH does not (r = 0.76, −2.3 dB): HV is mostly volume scattering and
    depends little on the viewing angle. So January is shown for HV only. It also tells us that summer drying did not
    lower HV before the fire — the drop is the fire.</p>`;
}

function findingMugla(m) {
  const s = m?.summary;
  if (!s) return "";
  return `
    <h4>Muğla – Fethiye, Türkiye — the radar barely noticed (hypothesis)</h4>
    <p>The fire scar is clear in optical images and NASA fire detections, yet only
    <strong>${Math.round(s.burn_ha)} ha</strong> lost 3 dB of HV between ${s.pre_date} and ${s.post_date}.
    Our hypothesis: L-band waves are about 24 cm long and interact mostly with trunks and large branches, not with
    leaves and needles. If the fire burned the understory and the crowns but left charred trunks standing, the trunks
    keep scattering and the radar sees little change. Steep terrain and soil moisture after the fire can also mask
    the signal. Checking this needs field data or a shorter wavelength (e.g. C-band).</p>`;
}

/** el: drawer body. rules: rules.json. manifests: {spain, mugla} (null when not loaded). */
export function renderMethod(el, rules, manifests) {
  el.innerHTML = `
    <section>
      <h3>How a radar sees the ground</h3>
      <p>NISAR (NASA–ISRO) sends its own microwave pulses and measures the echo, so it works day and night and sees
      through clouds and smoke. Its L-band wave is about 24 cm long. The strength of the echo — the backscatter,
      in decibels (dB) — depends on how rough, wet and structured the surface is.</p>
    </section>
    <section>
      <h3>Polarization: HH and HV</h3>
      <p><strong>HH</strong> (sent horizontal, received horizontal) is strong for surfaces and structures: rough ground,
      buildings, tree trunks standing on the ground. <strong>HV</strong> (sent horizontal, received vertical) is created
      when the wave bounces many times inside a volume — the branches of a forest or shrubs. That is why HV is our
      <em>vegetation signal</em>: when vegetation burns, HV falls.</p>
      <p>The colour image shows red = HH, green = HV, blue = HH−HV. Forests look yellow-green, open ground purple-blue,
      calm water almost black.</p>
    </section>
    <section>
      <h3>Interpretation rules</h3>
      ${rules ? rulesTable(rules) : "<p>Rules could not be loaded.</p>"}
    </section>
    <section>
      <h3>Findings</h3>
      ${findingSpain(manifests.spain)}
      ${findingMugla(manifests.mugla)}
    </section>
    <section>
      <h3>Global layer (outside the showcases)</h3>
      <p>Outside the showcases we read NASA GIBS NISAR imagery (zoom ≤ 8, about 500 m pixels) and convert its colours
      back to dB with a model fitted on Spain. Checked on another date and on Muğla, HV is within about ±1 dB.
      Vegetation classes agree 85% with the full-resolution data; buildings cannot be seen at this scale.
      Change between two dates is shown as <em>experimental</em>: it finds 96% of the Spanish burn scar with 0.7%
      false alarms on unchanged land, but cannot draw its exact border.</p>
      <p>Some NISAR passes record <strong>HH only</strong> (single polarization). They have no vegetation channel and
      show up orange or yellow on the globe; we flag them and never use them for vegetation or change.</p>
      <p>The <em>time machine</em> of each place shows up to six NISAR images spread over the whole record, all from
      one orbit so they are comparable, with the vegetation signal (HV) of each and the fire date marked.</p>
    </section>
    <section>
      <h3>Limits</h3>
      <ul>
        <li>NISAR data from 2026 are partly <em>provisional</em> (still being validated by the mission).</li>
        <li>Each place is imaged every 12 days from a given orbit; only same-orbit dates are fully comparable.</li>
        <li>Steep slopes facing away from the radar can be in shadow; soil moisture changes HH.</li>
        <li>The rules are simple and transparent, not an official land-cover classification.</li>
        <li>“NISAR now” is an approximate position computed from public orbit elements (TLE) with the SGP4 model.
        The beam is drawn from published geometry (left-looking, 33–47° incidence, ~242 km swath). It is a
        visualization only — it is not used in any measurement, and it does not show whether the radar is switched on.</li>
      </ul>
    </section>
    <section>
      <h3>Data sources</h3>
      <ul>
        <li>NISAR L2 GCOV (NASA–ISRO), via NASA ASF DAAC and CMR (pass dates and footprints live, CMR GraphQL)</li>
        <li>NASA GIBS: NISAR imagery, Blue Marble, ASTER GDEM relief</li>
        <li>NASA EONET: wildfire events of the last year (live)</li>
        <li>NASA FIRMS active fire detections (VIIRS NOAA-20, 375 m), via the GIBS WMS (live)</li>
        <li>NASA GIBS: VIIRS NOAA-20 true colour satellite photo (optional, 250 m)</li>
        <li>Visualization only: NISAR orbit elements (TLE, NORAD 65053) from a public TLE API listed on api.nasa.gov,
        propagated with satellite.js</li>
      </ul>
    </section>`;
}

/** Short region summary for the showcase panel (null-safe). */
export function summaryHtml(m) {
  const s = m?.summary;
  if (!s) return "";
  const last = m.dates.length - 1;
  const iPost = m.dates.indexOf(s.post_date);
  const ha = Math.round(s.burn_ha).toLocaleString("en");
  if (s.burn_ha < 50)
    return `<strong>Almost no loss of vegetation signal</strong> (${ha} ha) between ${s.pre_date} and ${s.post_date},
      although the fire is visible in optical images. <a href="#" data-open-method>Why?</a>`;
  let trend = "";
  if (last > iPost && s.burn_hv[last] != null && s.burn_hv[iPost] != null) {
    const d = s.burn_hv[last] - s.burn_hv[iPost];
    trend = d >= 1 ? ` By ${m.dates[last]} it has partly recovered (+${d.toFixed(1)} dB).`
      : ` By ${m.dates[last]} there is <strong>no recovery yet</strong> (${fmt(s.burn_hv[last])} dB vs ${fmt(s.control_hv[last])} dB on unchanged land).`;
  }
  return `<strong>${ha} ha</strong> lost more than half of their vegetation signal (HV ≥ 3 dB)
    between ${s.pre_date} and ${s.post_date}.${trend}`;
}

/** Legend for the current map layer. */
export function legendHtml(layer, m, idx) {
  if (layer === "change") {
    if (!m.change[m.dates[idx]]) return `<p class="muted small">First date — nothing earlier to compare with. Pick a later date.</p>`;
    return `<div class="lg"><span class="sw" style="background:#e63946"></span>Vegetation signal fell ≥ 3 dB (burned or cleared)</div>
      <div class="lg"><span class="sw" style="background:#3c78e6"></span>Signal rose ≥ 3 dB (growth or wetter ground)</div>
      <div class="lg muted small">Compared with ${m.dates[idx - 1]}. Clear = changed less than 3 dB.</div>`;
  }
  return `<div class="lg-ramp" aria-hidden="true"></div>
    <div class="lg"><span class="sw" style="background:#c8e04a"></span>Dense vegetation (strong HV)</div>
    <div class="lg"><span class="sw" style="background:#7b5ea7"></span>Open ground, fields, burned land</div>
    <div class="lg"><span class="sw" style="background:#0b1020"></span>Calm water</div>
    <div class="lg"><span class="sw" style="background:#f1faee"></span>Buildings, rocks</div>
    <div class="lg muted small">Red = HH · Green = HV · Blue = HH−HV</div>`;
}
