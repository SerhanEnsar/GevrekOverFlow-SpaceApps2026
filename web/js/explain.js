// "What am I looking at?" — plain-language explanation of a radar pixel (G3).
// Thresholds are simple and transparent; they describe typical L-band behaviour,
// not an official land-cover classification.

const CHANGE_DB = 3;

export function surfaceClass(hh, hv) {
  if (hv < -24) return "water";
  if (hh - hv > 10 && hh > -8) return "built";
  if (hv > -13) return "forest";
  if (hv > -18) return "shrub";
  return "open";
}

const TEXT = {
  water: "Calm water or very smooth ground: the radar wave bounces away like off a mirror, so almost nothing comes back.",
  built: "Buildings or rocks: walls and ground act like corner reflectors and send the wave straight back.",
  forest: "Dense vegetation: leaves and branches scatter the wave in all directions, giving a strong HV signal.",
  shrub: "Shrubs or sparse trees: some scattering inside the vegetation, weaker than a forest.",
  open: "Open ground or fields: the wave mostly reflects off the surface; there is little vegetation volume.",
};

const minus = (v) => v.toFixed(1).replace("-", "−");
const signed = (v) => (v > 0 ? "+" : "") + minus(v);

/** {hh, hv, dhv?, prevDate?} in dB -> {cls, plain, expert} or null when there is no data. */
export function explainPixel({ hh, hv, dhv = null, prevDate = null }) {
  if (hh == null || hv == null) return null;
  const cls = surfaceClass(hh, hv);
  let plain = TEXT[cls];
  if (dhv != null && dhv <= -CHANGE_DB)
    plain += ` Since ${prevDate} the vegetation signal fell by ${Math.abs(dhv).toFixed(1)} dB — consistent with burned or removed vegetation.`;
  else if (dhv != null && dhv >= CHANGE_DB)
    plain += ` Since ${prevDate} the vegetation signal rose by ${dhv.toFixed(1)} dB — growing plants or wetter ground.`;
  let expert = `HH ${minus(hh)} dB · HV ${minus(hv)} dB · HH−HV ${minus(hh - hv)} dB`;
  if (dhv != null && prevDate) expert += ` · ΔHV ${signed(dhv)} dB vs ${prevDate}`;
  return { cls, plain, expert };
}
