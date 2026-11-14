// Time-series panel: radar signal of the clicked place over the comparable dates.
import { Chart, registerables } from "https://cdn.jsdelivr.net/npm/chart.js@4.6.1/+esm";

Chart.register(...registerables);

export const NO_DATA_TEXT = "No radar data here";

// Vertical dashed line at the event date (between the last pre- and first post-event dates).
const eventLine = {
  id: "eventLine",
  afterDatasetsDraw(chart, _args, opts) {
    if (opts.index == null || opts.index < 0) return;
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const px = opts.index === 0 ? x.getPixelForValue(0) : (x.getPixelForValue(opts.index - 1) + x.getPixelForValue(opts.index)) / 2;
    ctx.save();
    ctx.strokeStyle = "#ff5a36"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
    ctx.fillStyle = "#ff5a36"; ctx.font = "11px system-ui"; ctx.fillText("fire", px + 4, top + 10);
    ctx.restore();
  },
};

/** Render `series` ({dates, hh, hv} or null) into `el`. Returns the Chart (or null). */
export function showSeries(el, series, manifest) {
  if (el.__chart) { el.__chart.destroy(); el.__chart = null; }
  if (!series) { el.textContent = NO_DATA_TEXT; return null; }

  el.innerHTML = '<canvas height="190"></canvas>';
  const fmt = (v) => (v == null ? null : Math.round(v * 10) / 10);
  // Dates from another orbit: HV only (HH is not comparable across orbits), hollow points.
  const other = series.dates.map((d) => (manifest.date_geometry?.[d] ?? manifest.geometry) !== manifest.geometry);
  const chart = new Chart(el.querySelector("canvas"), {
    type: "line",
    data: {
      labels: series.dates.map((d) => d.slice(5)),
      datasets: [
        { label: "HV (vegetation volume)", data: series.hv.map(fmt), borderColor: "#7fd18b", backgroundColor: "#7fd18b",
          pointBackgroundColor: other.map((o) => (o ? "transparent" : "#7fd18b")), pointRadius: 4,
          segment: { borderDash: (c) => (other[c.p0DataIndex] || other[c.p1DataIndex] ? [4, 4] : undefined) }, tension: 0.25, spanGaps: false },
        { label: "HH (surface & structure)", data: series.hh.map((v, i) => (other[i] ? null : fmt(v))), borderColor: "#e3a34f", backgroundColor: "#e3a34f", tension: 0.25, spanGaps: false },
      ],
    },
    options: {
      animation: false,
      plugins: {
        legend: { labels: { color: "#c9d3da", boxWidth: 12 } },
        eventLine: { index: series.dates.findIndex((d) => d >= manifest.event_date) },
        tooltip: { callbacks: {
          label: (c) => `${c.dataset.label}: ${c.parsed.y} dB`,
          footer: (items) => (items.length && other[items[0].dataIndex] ? "Other orbit — only HV comparable" : ""),
        } },
      },
      scales: {
        x: { ticks: { color: "#93a1ab" }, grid: { color: "#1d2731" } },
        y: { title: { display: true, text: "dB", color: "#93a1ab" }, ticks: { color: "#93a1ab" }, grid: { color: "#1d2731" } },
      },
    },
    plugins: [eventLine],
  });
  el.__chart = chart;
  return chart;
}
