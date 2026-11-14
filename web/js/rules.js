// Rule engine: interprets HH/HV (dB) with the transparent rules in web/rules.json.
// The same rules serve two inputs: showcase data (measured, 20 m) and the global layer
// (estimated from NASA GIBS imagery, ~500 m). Pure functions, no DOM.

export async function loadRules(url = "rules.json") {
  return (await fetch(url)).json();
}

export function validateRules(rules) {
  const errors = [];
  const classes = rules?.classes ?? [];
  if (!classes.length) errors.push("no classes");
  classes.forEach((c, i) => {
    if (!c.id || !c.plain || !c.when) errors.push(`class ${i + 1}: id, plain and when are required`);
  });
  const last = classes[classes.length - 1];
  if (last && Object.keys(last.when ?? {}).length) errors.push("the last class must be a fallback (empty 'when')");
  for (const k of ["showcase", "global"])
    if (!rules?.sources?.[k]) errors.push(`missing source '${k}'`);
  if (!rules?.gibs_model?.hv || !rules?.gibs_model?.hh) errors.push("missing gibs_model");
  return errors;
}

function matches(when, { hh, hv }) {
  if (when.hv_max != null && !(hv < when.hv_max)) return false;
  if (when.hv_min != null && !(hv > when.hv_min)) return false;
  if (when.hh_min != null && !(hh > when.hh_min)) return false;
  if (when.hh_minus_hv_min != null && !(hh - hv > when.hh_minus_hv_min)) return false;
  return true;
}

function firstClass(rules, v, source) {
  return rules.classes.find((c) => (!c.sources || c.sources.includes(source)) && matches(c.when, v));
}
/** Fast class id only (no confidence), for many pixels at once. */
export const classId = (rules, hh, hv, source = "showcase") => firstClass(rules, { hh, hv }, source)?.id ?? null;

/** {hh, hv} -> {id, label, color, plain, confidence: "high"|"low", alternatives: [id]} */
export function classify(rules, { hh, hv }, source = "showcase") {
  const main = firstClass(rules, { hh, hv }, source);
  // Confidence: does the class change within the source's uncertainty band?
  const u = rules.sources[source].uncertainty_db;
  const alternatives = [];
  for (const dh of [-u, 0, u])
    for (const dv of [-u, 0, u]) {
      const c = firstClass(rules, { hh: hh + dh, hv: hv + dv }, source);
      if (c.id !== main.id && !alternatives.includes(c.id)) alternatives.push(c.id);
    }
  return {
    id: main.id, label: main.label, color: main.color, plain: main.plain,
    confidence: alternatives.length ? "low" : "high", alternatives,
  };
}

const minus = (v) => v.toFixed(1).replace("-", "−");
const signed = (v) => (v > 0 ? "+" : "") + minus(v);

function changeRule(rules, dhv, source) {
  const t = rules.sources[source].change_threshold_db;
  // "dhv_max": "-threshold" -> dhv <= -t ; "dhv_min": "threshold" -> dhv >= t
  return rules.change.find((r) => (r.when.dhv_max != null && dhv <= -t) || (r.when.dhv_min != null && dhv >= t));
}

/**
 * {hh, hv, dhv?, prevDate?} -> {cls, label, color, plain, expert, confidence, alternatives,
 *   sourceLabel, change: {id, label, experimental} | null} or null without data.
 */
export function interpret(rules, { hh, hv, dhv = null, prevDate = null }, source = "showcase") {
  if (hh == null || hv == null) return null;
  const c = classify(rules, { hh, hv }, source);
  const src = rules.sources[source];
  let plain = c.plain, change = null;
  if (dhv != null) {
    const r = changeRule(rules, dhv, source);
    if (r) {
      change = { id: r.id, label: r.label, experimental: !!src.experimental_change };
      plain += " " + r.plain.replace("{prev}", prevDate ?? "the earlier date").replace("{abs}", Math.abs(dhv).toFixed(1));
    }
  }
  if (c.confidence === "low") {
    const alt = c.alternatives.map((id) => rules.classes.find((k) => k.id === id).label.toLowerCase());
    plain += ` (Close to a threshold — could also be ${alt.join(" or ")}.)`;
  }
  let expert = `HH ${minus(hh)} dB · HV ${minus(hv)} dB · HH−HV ${minus(hh - hv)} dB`;
  if (dhv != null && prevDate) expert += ` · ΔHV ${signed(dhv)} dB vs ${prevDate}`;
  return {
    cls: c.id, label: c.label, color: c.color, plain, expert,
    confidence: c.confidence, alternatives: c.alternatives, sourceLabel: src.label, change,
  };
}

/** GIBS false-colour pixel (R, G) -> estimated {hh, hv} in dB. */
export function gibsToDb(rules, r, g) {
  const f = ([a, b, c]) => a + b * Math.log(1 + g) + c * Math.log(1 + r);
  return { hh: f(rules.gibs_model.hh), hv: f(rules.gibs_model.hv) };
}
