"use strict";
/* Dashboard Aging Stock: plain HTML/SVG, no external libraries.
   Data: window.DASHBOARD_DATA (data.js), built by siapkan_data.py from the notebook results.
   Every page reads in one order: question -> short answer -> key numbers -> actions -> evidence -> details on demand. */

const D = window.DASHBOARD_DATA;
const SVGNS = "http://www.w3.org/2000/svg";
const nf = (d) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const NF0 = nf(0), NF1 = nf(1), NF2 = nf(2), NF3 = nf(3);
/* round on the exact binary value first (as Python does in the report), so 0.6845 shows 0,684 in both */
const num = (x, d = 0) => (x == null || Number.isNaN(x) ? "–" : [NF0, NF1, NF2, NF3][d].format(Number(Number(x).toFixed(d))));
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? "–" : num(x, d) + "%");
const tanggal = (s) => new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const bulanLabel = (s) => new Date(s + "-01T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
const bulanPanjang = (s) => new Date(s + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const jumlah = (arr, f) => arr.reduce((s, r) => s + (typeof f === "function" ? f(r) : r[f]) , 0);

/* ------------------------------------------------------------------ data */
const tabel = (o) => o.rows.map((r) => Object.fromEntries(o.cols.map((c, i) => [c, r[i]])));
const STOK = tabel(D.stok);
const JUAL = tabel(D.penjualan_bulanan);
const STORES = tabel(D.stores);
const EDGES = tabel(D.edges);
const WATCH = tabel(D.watchlist);
const TIERS = tabel(D.tiers_uji);
const SCOPE = tabel(D.transfer_scope);
const TRANSFER = tabel(D.transfer);
const KOM = Object.fromEntries(D.communities.map((c) => [c.id, c]));
const STORE = Object.fromEntries(STORES.map((s) => [s.kode_toko, s]));
const ZONA = [...new Set(STORES.map((s) => s.zona))].sort();
const KELOMPOK = [...new Set(STOK.map((r) => r.kelompok))].sort();
const TINGKAT = { "1": { nama: "Tinggi", ket: "10% skor tertinggi" }, "2": { nama: "Sedang", ket: "20% berikutnya" },
  "3": { nama: "Rendah", ket: "sisanya" } };
const PITA = [{ key: "u_0_30", label: "0–30 hari" }, { key: "u_31_90", label: "31–90 hari" }, { key: "u_91_150", label: "91–150 hari" },
  { key: "u_151_365", label: "151–365 hari" }, { key: "u_365p", label: "Lebih dari 1 tahun" }];
const AMBANG = Math.min(...WATCH.filter((r) => r.ditandai === 1).map((r) => r.skor_risiko));   // threshold of the refitted model
const komVar = (id) => `var(--series-${id})`;
const tierVar = (t) => `var(--tier-${t})`;
const nomorToko = (k) => k.replace("TOKO-", "");
const KECIL = D.communities.find((c) => c.nama === "Toko Jawa bervolume kecil");
const BESAR = D.communities.find((c) => c.nama === "Toko bervolume besar");

/* ------------------------------------------------------------------ state & filters */
const state = { zona: "", toko: "", kelompok: "", tab: "ringkasan", tampil: {}, terbuka: {}, dimRingkas: "toko" };
const tokoCocok = (k) => (!state.toko || k === state.toko) && (!state.zona || STORE[k]?.zona === state.zona);
const kelompokCocok = (g) => !state.kelompok || g === state.kelompok;
const adaFilterToko = () => Boolean(state.toko || state.zona);
const adaFilter = () => Boolean(state.toko || state.zona || state.kelompok);

/* ------------------------------------------------------------------ DOM helpers */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
function sv(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "style") Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  if (text != null) n.textContent = text;
  return n;
}
const textWidth = (() => {
  const c = document.createElement("canvas").getContext("2d");
  return (s, size = 12, weight = 400) => {
    c.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    return c.measureText(s).width;
  };
})();

/* ------------------------------------------------------------------ entity links: store, zone, and product group names
   Every name in the text and tables is a link: one click filters the whole dashboard to it (direct manipulation),
   the changed filter blinks, and a toast offers to undo it (user control and freedom). */
const ESC = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAMA_KOM = D.communities.map((c) => c.nama);                   // store-group names are not filters
const POLA_ENT = new RegExp("(" + [...NAMA_KOM, ...KELOMPOK, ...ZONA].sort((a, b) => b.length - a.length).map(ESC)
  .concat(["TOKO-\\d{2}"]).join("|") + ")", "g");
function jenisEntitas(t) {
  if (/^TOKO-\d{2}$/.test(t) && STORE[t]) return "toko";
  if (ZONA.includes(t)) return "zona";
  if (KELOMPOK.includes(t)) return "kelompok";
  return null;
}
function entLink(jenis, nilai, label = nilai) {
  const judul = { toko: "toko", zona: "zona", kelompok: "product group" }[jenis];
  return el("button", { class: "ent", type: "button", title: `Klik untuk melihat data ${nilai} saja (klik lagi untuk kembali)`,
    "aria-label": `${label}: lihat data ${judul} ini saja`, onclick: (e) => { e.stopPropagation(); terapkanEntitas(jenis, nilai); } }, label);
}
function tautkan(teks) {
  const out = [];
  let last = 0;
  for (const m of teks.matchAll(POLA_ENT)) {
    const j = jenisEntitas(m[0]);
    if (!j) continue;                                                // store-group names stay plain text
    if (m.index > last) out.push(document.createTextNode(teks.slice(last, m.index)));
    out.push(entLink(j, m[0]));
    last = m.index + m[0].length;
  }
  if (last < teks.length) out.push(document.createTextNode(teks.slice(last)));
  return out;
}
/* rich text: **bold** segments, entity names turned into filter links, built without innerHTML */
function rich(tag, s, attrs = {}) {
  const n = el(tag, attrs);
  s.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (part.startsWith("**")) n.append(el("strong", {}, tautkan(part.slice(2, -2))));
    else if (part) n.append(...tautkan(part));
  });
  return n;
}
let toastTimer = null;
function toast(teks, batal) {
  document.querySelector(".toast")?.remove();
  const t = el("div", { class: "toast", role: "status" }, el("span", { text: teks }),
    batal ? el("button", { type: "button", onclick: () => { t.remove(); batal(); } }, "Batalkan") : null);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 6000);
}
function terapkanEntitas(jenis, nilai, { gulir = true } = {}) {
  const lama = { zona: state.zona, toko: state.toko, kelompok: state.kelompok };
  if (jenis === "toko") {
    state.toko = state.toko === nilai ? "" : nilai;
    if (state.toko && state.zona && STORE[nilai].zona !== state.zona) state.zona = "";
  } else if (jenis === "zona") {
    state.zona = state.zona === nilai ? "" : nilai;
    if (state.zona && state.toko && STORE[state.toko].zona !== state.zona) state.toko = "";
  } else state.kelompok = state.kelompok === nilai ? "" : nilai;
  isiFilter();
  renderAktif();
  if (gulir) {                                                       // a text link brings the updated answer into view
    const bar = document.querySelector(".filters");
    const tinggiTab = document.querySelector(".tabs").offsetHeight;
    window.scrollTo({ top: Math.max(0, bar.getBoundingClientRect().top + window.scrollY - tinggiTab - 8), behavior: "smooth" });
  }
  const id = { toko: "f-toko", zona: "f-zona", kelompok: "f-kelompok" }[jenis];
  const wadah = document.getElementById(id).parentElement;
  wadah.classList.remove("kedip"); void wadah.offsetWidth; wadah.classList.add("kedip");
  const aktif = state[jenis];
  toast(aktif ? `Menampilkan: ${aktif}` : `Kembali ke semua ${jenis === "kelompok" ? "product group" : jenis}`,
    () => { Object.assign(state, lama); isiFilter(); renderAktif(); });
}

/* ------------------------------------------------------------------ tooltip (value first, labels after) */
const TT = document.getElementById("tooltip");
function showTip(evt, value, rows = []) {
  TT.replaceChildren(el("div", { class: "tt-val", text: value }),
    ...rows.filter(Boolean).map(([key, label, v]) => el("div", { class: "tt-row" },
      key ? el("i", { class: "key", style: `background:${key}` }) : null,
      el("span", { text: label }), v != null ? el("b", { text: v }) : null)));
  TT.hidden = false;
  const r = evt.target?.getBoundingClientRect ? evt.target.getBoundingClientRect() : null;
  const x = evt.clientX ?? (r ? r.left + r.width / 2 : 0);
  const y = evt.clientY ?? (r ? r.top : 0);
  const w = TT.offsetWidth, h = TT.offsetHeight;
  let left = x + 14, top = y + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top + h > window.innerHeight - 8) top = y - h - 14;
  TT.style.left = Math.max(8, left) + "px";
  TT.style.top = Math.max(8, top) + "px";
}
const hideTip = () => { TT.hidden = true; };
function hover(node, fn, mark) {
  node.setAttribute("tabindex", "0");
  const on = (e) => { fn(e); if (mark) mark.classList.add("hover-lift"); };
  const off = () => { hideTip(); if (mark) mark.classList.remove("hover-lift"); };
  node.addEventListener("pointermove", on);
  node.addEventListener("pointerleave", off);
  node.addEventListener("focus", (e) => { const r = node.getBoundingClientRect(); fn({ ...e, target: node, clientX: r.left + r.width / 2, clientY: r.top }); if (mark) mark.classList.add("hover-lift"); });
  node.addEventListener("blur", off);
}
/* a mark that also filters the dashboard: pointer click or Enter/Space */
function bisaKlik(node, aksi) {
  node.classList.add("klik");
  node.setAttribute("role", "button");
  node.addEventListener("click", (e) => { e.stopPropagation(); hideTip(); aksi(); });
  node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hideTip(); aksi(); } });
}

/* ------------------------------------------------------------------ chart card with a table-view twin */
function card(fig, { judul, desc, badge, plot, table, legend, kontrol, catatan }) {
  const id = fig.id;
  const asTable = state.tampil[id] === "tabel";
  const toggle = table ? el("button", { class: "toggle", type: "button", "aria-pressed": String(asTable),
    onclick: () => { state.tampil[id] = asTable ? "grafik" : "tabel"; renderAktif(); } },
    asTable ? "Lihat grafik" : "Lihat tabel") : null;
  const cap = el("figcaption", {}, el("div", {}, el("h3", { text: judul }), desc ? rich("p", desc, { class: "desc" }) : null,
    badge ? el("span", { class: "badge", text: badge }) : null), el("div", { class: "cap-kanan" }, kontrol || null, toggle));
  const body = asTable ? el("div", { class: "table-view table-wrap" }, table()) : el("div", { class: "plot" });
  fig.replaceChildren(cap, body);
  if (!asTable) {
    plot(body);
    if (legend) body.after(legend);
  }
  if (catatan) fig.append(rich("p", catatan, { class: "catatan" }));
}
/* formatters with one parameter get the value only (num/pct take a decimals argument second) */
const fmtSel = (c, r) => (c.fmt.length > 1 ? c.fmt(r[c.key], r) : c.fmt(r[c.key]));
function sel(c, r) {
  const v = c.render ? c.render(r) : (c.fmt ? fmtSel(c, r) : r[c.key]);
  return v instanceof Node ? v : (v ?? "–");
}
function simpleTable(cols, rows) {
  return el("table", {}, el("thead", {}, el("tr", {}, cols.map((c) => el("th", { class: c.num ? "num" : null, text: c.label })))),
    el("tbody", {}, rows.map((r) => el("tr", {}, cols.map((c) => el("td", { class: c.num ? "num" : null }, sel(c, r)))))));
}
function legendBox(items, shape = "") {
  return el("div", { class: "legend" }, items.map(([color, label]) =>
    el("span", {}, el("i", { class: shape, style: `background:${color}` }), label)));
}
const plotWidth = (host) => Math.max(280, Math.floor(host.getBoundingClientRect().width));
const warna = (nama) => getComputedStyle(document.documentElement).getPropertyValue(nama).trim();
/* sequential mix between two tokens (light -> dark in light mode, the reverse ramp in dark mode) */
function campur(t, lo = "--heat-lo", hi = "--heat-hi") {
  const a = warna(lo).match(/\w\w/g).map((h) => parseInt(h, 16)), b = warna(hi).match(/\w\w/g).map((h) => parseInt(h, 16));
  return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
}
/* readable ink on a sequential cell: the cell's perceived lightness decides */
function tintaUntuk(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#0b0b0b" : "#ffffff";
}

/* category label: one line, or two lines split at a space when it does not fit; never clipped */
function labelLines(text, maxW, size = 12) {
  if (textWidth(text, size) <= maxW) return [text];
  const words = text.split(" ");
  let best = [text], bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const w = Math.max(textWidth(a, size), textWidth(b, size));
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  return best;
}
/* greedy word wrap into as many lines as needed (column headers) */
function wrapLines(text, maxW, size = 12) {
  const out = [];
  let cur = "";
  text.split(" ").forEach((w) => {
    const coba = cur ? cur + " " + w : w;
    if (cur && textWidth(coba, size) > maxW) { out.push(cur); cur = w; } else cur = coba;
  });
  if (cur) out.push(cur);
  return out;
}
function drawLabel(parent, lines, x, yMid, anchor = "end", cls = "lbl") {
  const t = sv("text", { x, y: yMid + 4 - (lines.length - 1) * 7, "text-anchor": anchor, class: cls });
  lines.forEach((ln, i) => t.append(sv("tspan", { x, dy: i ? 14 : 0 }, ln)));
  parent.append(t);
  return t;
}
function labelColumn(items, W, frac = 0.42) {
  const full = Math.max(...items.map((d) => textWidth(d.label))) + 12;
  const labelW = Math.min(W * frac, full);
  const lines = items.map((d) => labelLines(d.label, labelW - 12));
  const labelW2 = Math.min(labelW, Math.max(...lines.flat().map((l) => textWidth(l))) + 12);
  return { labelW: labelW2, lines, two: lines.some((l) => l.length > 1) };
}

/* rounded data-end (4px), square at the baseline */
function barPath(x0, y, w, h, r = 4) {
  if (w <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return `M${x0},${y}H${x0 + w - rr}Q${x0 + w},${y} ${x0 + w},${y + rr}V${y + h - rr}Q${x0 + w},${y + h} ${x0 + w - rr},${y + h}H${x0}Z`;
}
function colPath(x, y0, w, h, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y0}V${y0 - h + rr}Q${x},${y0 - h} ${x + rr},${y0 - h}H${x + w - rr}Q${x + w},${y0 - h} ${x + w},${y0 - h + rr}V${y0}Z`;
}
/* round tick step (1, 2, 2.5, 5 x 10^k) and the axis top it implies */
function skalaRapi(v, target = 4) {
  const raw = Math.max(v, 1e-9) / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw);
  return { step, top: Math.ceil(v / step) * step || step };
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const chip = (color, text) => el("span", { class: "chip" }, el("i", { style: `background:${color}` }), text);

/* ------------------------------------------------------------------ chart: horizontal bars (ranked), optional reference line */
function barsH(host, items, { max, fmt, tip, colorOf = () => "var(--series-1)", onClick, ref }) {
  if (!items.length) { host.append(el("p", { class: "empty", text: "Tidak ada data untuk pilihan ini." })); return; }
  const W = plotWidth(host);
  const { labelW, lines, two } = labelColumn(items, W);
  const valueW = Math.max(...items.map((d) => textWidth(fmt(d.value), 12, 600))) + 10;
  const rowH = two ? 34 : 26, bar = 16, top = ref ? 20 : 4;
  const H = top + items.length * rowH + 4;
  const x0 = labelW, plotW = Math.max(40, W - labelW - valueW);
  const mx = max ?? niceMax(Math.max(...items.map((d) => d.value)));
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });
  svg.append(sv("line", { x1: x0, x2: x0, y1: top - 2, y2: H, class: "baseline" }));
  items.forEach((d, i) => {
    const y = top + i * rowH;
    const w = (d.value / mx) * plotW;
    const g = sv("g", { class: "mark" + (d.dim ? " dim" : "") + (d.pilih ? " pilih" : "") });
    drawLabel(g, lines[i], x0 - 8, y + rowH / 2);
    const p = sv("path", { d: barPath(x0, y + (rowH - bar) / 2, w, bar), style: { fill: colorOf(d) } });
    g.append(p, sv("text", { x: x0 + w + 6, y: y + rowH / 2 + 4, class: "val" }, fmt(d.value)));
    const hit = sv("rect", { x: 0, y, width: W, height: rowH, class: "hit",
      "aria-label": `${d.label}: ${fmt(d.value)}${onClick ? ". Tekan Enter untuk melihat yang ini saja." : ""}` });
    hover(hit, (e) => showTip(e, fmt(d.value), [...tip(d), onClick ? [null, d.pilih ? KLIK_LAGI : KLIK, null] : null]), p);
    if (onClick) bisaKlik(hit, () => onClick(d));
    g.append(hit);
    svg.append(g);
  });
  if (ref) {
    const x = x0 + (ref.value / mx) * plotW;
    svg.insertBefore(sv("line", { x1: x, x2: x, y1: top - 4, y2: H, class: "refline" }), svg.children[1]);
    svg.append(sv("text", { x: Math.min(x, W - textWidth(ref.label, 11) / 2 - 2), y: 11, "text-anchor": "middle", class: "tick" }, ref.label));
  }
  host.append(svg);
}

/* ------------------------------------------------------------------ chart: line over time with event markers */
function lineChart(host, pts, { fmt, label, penanda = [] }) {
  if (!pts.length) { host.append(el("p", { class: "empty", text: "Tidak ada data untuk pilihan ini." })); return; }
  const W = plotWidth(host), H = 250;
  const m = { l: 52, r: 16, t: 26, b: 30 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const { step, top: mx } = skalaRapi(Math.max(...pts.map((p) => p.y)));
  const X = (i) => m.l + (pts.length === 1 ? pw / 2 : (i / (pts.length - 1)) * pw);
  const Y = (v) => m.t + ph - (v / mx) * ph;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": label });
  for (let v = 0, k = 0; v <= mx + 1e-9; v += step, k++) {
    const y = Y(v);
    svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: k ? "gridline" : "baseline" }),
      sv("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "tick" }, v >= 10000 ? num(v / 1000) + " rb" : num(v)));
  }
  penanda.forEach((pn) => {
    const i = pts.findIndex((p) => p.bulan === pn.bulan);
    if (i < 0) return;
    svg.append(sv("line", { x1: X(i), x2: X(i), y1: m.t - 6, y2: m.t + ph, class: "refline" }),
      sv("text", { x: X(i), y: m.t - 10, "text-anchor": "middle", class: "tick" }, pn.teks));
  });
  const tiap = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(pw / 64))));
  pts.forEach((p, i) => { if (i % tiap === 0) svg.append(sv("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "tick" }, p.label)); });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join("");
  svg.append(sv("path", { d: `${d}L${X(pts.length - 1)},${Y(0)}L${X(0)},${Y(0)}Z`, style: { fill: "var(--series-1)", opacity: 0.1 } }),
    sv("path", { d, style: { fill: "none", stroke: "var(--series-1)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" } }));
  const cross = sv("line", { y1: m.t, y2: m.t + ph, style: { stroke: "var(--axis)", strokeWidth: 1, display: "none" } });
  const dot = sv("circle", { r: 4, style: { fill: "var(--series-1)", stroke: "var(--surface-1)", strokeWidth: 2, display: "none" } });
  svg.append(cross, dot);
  const hit = sv("rect", { x: m.l, y: m.t, width: pw, height: ph, class: "hit", tabindex: "0", "aria-label": label + ". Panah kiri/kanan untuk berpindah bulan." });
  const at = (clientX) => {
    const r = svg.getBoundingClientRect();
    const xx = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(pts.length - 1, Math.round(((xx - m.l) / pw) * (pts.length - 1))));
  };
  const show = (e, i) => {
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = "";
    dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(pts[i].y)); dot.style.display = "";
    const pn = penanda.find((q) => q.bulan === pts[i].bulan);
    showTip(e, fmt(pts[i].y), [["var(--series-1)", pts[i].full, null], pn ? [null, pn.ket, null] : null]);
  };
  let focusI = pts.length - 1;
  hit.addEventListener("pointermove", (e) => show(e, at(e.clientX)));
  hit.addEventListener("pointerleave", () => { hideTip(); cross.style.display = "none"; dot.style.display = "none"; });
  hit.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") focusI = Math.max(0, focusI - 1);
    else if (e.key === "ArrowRight") focusI = Math.min(pts.length - 1, focusI + 1);
    else return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    show({ clientX: r.left + (X(focusI) / W) * r.width, clientY: r.top + (Y(pts[focusI].y) / H) * r.height }, focusI);
  });
  svg.append(hit);
  host.append(svg);
}

/* ------------------------------------------------------------------ chart: one tall segmented bar (part-to-whole by age band) */
function rectRound(x, y, w, h, rl, rr) {
  rl = Math.min(rl, w / 2, h / 2); rr = Math.min(rr, w / 2, h / 2);
  return `M${x + rl},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}` +
    `H${x + rl}Q${x},${y + h} ${x},${y + h - rl}V${y + rl}Q${x},${y} ${x + rl},${y}Z`;
}
function segBar(host, bands, kurung) {
  const total = jumlah(bands, "value");
  if (!total) { host.append(el("p", { class: "empty", text: "Tidak ada stok untuk pilihan ini." })); return; }
  const W = plotWidth(host), top = 34, tinggi = 48, H = top + tinggi + 4, gap = 2;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
    "aria-label": "Umur stok: " + bands.map((b) => `${b.label} ${pct((100 * b.value) / total)}`).join(", ") });
  const xs = [];
  let x = 0;
  const nz = bands.map((b, i) => ({ ...b, i })).filter((b) => b.value > 0);
  nz.forEach((b, j) => {
    const full = (b.value / total) * W, last = j === nz.length - 1;
    const w = Math.max(0.5, last ? full : full - gap);
    xs[b.i] = [x, x + w];
    const p = sv("path", { d: rectRound(x, top, w, tinggi, j === 0 ? 6 : 0, last ? 6 : 0), style: { fill: b.color }, class: "mark" });
    const teks = pct((100 * b.value) / total);
    const g = sv("g");
    g.append(p);
    if (w > textWidth(teks, 13, 650) + 10) g.append(sv("text", { x: x + w / 2, y: top + tinggi / 2 + 5, "text-anchor": "middle", class: "seg-val", style: { fill: b.ink } }, teks));
    const hit = sv("rect", { x, y: top, width: Math.max(w, 6), height: tinggi, class: "hit", "aria-label": `${b.label}: ${num(b.value)} unit, ${teks}` });
    hover(hit, (e) => showTip(e, `${num(b.value)} unit`, [[b.color, b.label, null], [null, "Bagian dari semua stok", teks]]), p);
    g.append(hit);
    svg.append(g);
    x += full;
  });
  // brackets name the two halves: not yet aging vs aging stock
  let kananTerakhir = -Infinity;
  kurung.forEach((k) => {
    const ada = k.dari.map((i) => xs[i]).filter(Boolean);
    if (!ada.length) return;
    const a = ada[0][0] + 1, b = ada[ada.length - 1][1] - 1, y = top - 8;
    svg.append(sv("path", { d: `M${a},${y + 5}V${y}H${b}V${y + 5}`, class: "kurung" }));
    const lebar = textWidth(k.label, 12, 600);
    let tx = Math.max(lebar / 2, Math.min(W - lebar / 2, (a + b) / 2));
    tx = Math.max(tx, kananTerakhir + 12 + lebar / 2);
    kananTerakhir = tx + lebar / 2;
    svg.append(sv("text", { x: tx, y: y - 7, "text-anchor": "middle", class: "lbl kuat" }, k.label));
  });
  host.append(svg);
}

/* ------------------------------------------------------------------ chart: scatter (log x), size = stock, colour = store group */
function scatter(host, items, { tip, onClick, rataY }) {
  const W = plotWidth(host), H = Math.round(Math.min(400, Math.max(300, W * 0.66)));
  const m = { l: 44, r: 18, t: 26, b: 44 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const vx = items.map((d) => d.x).filter((v) => v > 0);
  if (!vx.length) { host.append(el("p", { class: "empty", text: "Tidak ada data untuk pilihan ini." })); return; }
  const lo = Math.log10(Math.min(...vx) / 1.4), hi = Math.log10(Math.max(...vx) * 1.4);
  const X = (v) => m.l + ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo)) * pw;
  const Y = (v) => m.t + ph - (v / 100) * ph;
  const maxR = Math.max(...items.map((d) => d.r), 1);
  const R = (d) => 5 + 10 * Math.sqrt(d.r / maxR);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
    "aria-label": "Sebaran toko: jumlah terjual 12 bulan terhadap persentase aging stock" });
  [0, 25, 50, 75, 100].forEach((t) => svg.append(
    sv("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t ? "gridline" : "baseline" }),
    sv("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end", class: "tick" }, t + "%")));
  [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter((v) => Math.log10(v) >= lo && Math.log10(v) <= hi).forEach((v) =>
    svg.append(sv("line", { x1: X(v), x2: X(v), y1: m.t + ph, y2: m.t + ph + 4, class: "baseline" }),
      sv("text", { x: X(v), y: m.t + ph + 17, "text-anchor": "middle", class: "tick" }, v >= 1000 ? num(v / 1000) + " rb" : num(v))));
  svg.append(sv("text", { x: m.l + pw / 2, y: H - 6, "text-anchor": "middle", class: "tick" }, "Terjual dalam 12 bulan (pcs) →"),
    sv("text", { x: m.l - 36, y: 12, class: "tick" }, "↑ Aging stock (%)"));
  if (rataY != null) {
    svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(rataY), y2: Y(rataY), class: "refline" }),
      sv("text", { x: W - m.r, y: Y(rataY) - 5, "text-anchor": "end", class: "tick" }, `rata-rata ${pct(rataY)}`));
  }
  const ada = items.filter((d) => d.x > 0 && d.y != null).map((d) => ({ d, cx: X(d.x), cy: Y(d.y), r: R(d) }));
  const kotak = ada.map((o) => [o.cx - o.r, o.cy - o.r, o.cx + o.r, o.cy + o.r]);   // dots are obstacles too
  const tabrak = (b) => kotak.reduce((s, k) => s + Math.max(0, Math.min(b[2], k[2]) - Math.max(b[0], k[0])) * Math.max(0, Math.min(b[3], k[3]) - Math.max(b[1], k[1])), 0);
  const posLabel = new Map();
  [...ada].sort((p, q) => q.d.y - p.d.y).forEach((o) => {
    const t = nomorToko(o.d.label), w = textWidth(t, 11) + 2, h = 11;
    const calon = [[o.cx + o.r + 3, o.cy + 4, "start"], [o.cx - o.r - 3, o.cy + 4, "end"], [o.cx, o.cy - o.r - 4, "middle"], [o.cx, o.cy + o.r + 12, "middle"]]
      .map(([x, y, a]) => { const x0 = a === "start" ? x : a === "end" ? x - w : x - w / 2; return { x, y, a, b: [x0, y - h + 2, x0 + w, y + 2] }; })
      .filter((c) => c.b[0] >= 0 && c.b[2] <= W);
    const pilih = calon.reduce((best, c) => { const v = tabrak(c.b) - (o.d.y != null ? 0 : 0); return !best || v < best.v ? { ...c, v } : best; }, null);
    posLabel.set(o.d, pilih);
    kotak.push(pilih.b);
  });
  [...ada].sort((a, b) => b.r - a.r).forEach(({ d, cx, cy, r }) => {
    const g = sv("g", { class: "mark" + (d.dim ? " dim" : "") });
    const c = sv("circle", { cx, cy, r, style: { fill: d.color, stroke: d.pilih ? "var(--text-primary)" : "var(--surface-1)", strokeWidth: d.pilih ? 3 : 2, fillOpacity: 0.9 } });
    const lp = posLabel.get(d);
    g.append(c, sv("text", { x: lp.x, y: lp.y, "text-anchor": lp.a, class: "tick halo" }, nomorToko(d.label)));
    const hit = sv("circle", { cx, cy, r: Math.max(r + 4, 12), class: "hit", "aria-label": `${d.label}: ${pct(d.y)} aging stock, ${num(d.x)} pcs terjual. Tekan Enter untuk melihat toko ini saja.` });
    hover(hit, (e) => showTip(e, d.label, [...tip(d), [null, d.pilih ? KLIK_LAGI : KLIK, null]]), c);
    if (onClick) bisaKlik(hit, () => onClick(d));
    g.append(hit);
    svg.append(g);
  });
  host.append(svg);
}

/* ------------------------------------------------------------------ chart: waffle (n of 100) */
function waffle(host, items) {
  const wrap = el("div", { class: "waffles" });
  items.forEach((it) => {
    const n = 10, c = 13, g = 3, S = n * c + (n - 1) * g;
    const svg = sv("svg", { viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: "img", "aria-label": `${it.nilai} dari 100: ${it.ket}` });
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / n), col = i % n;
      svg.append(sv("rect", { x: col * (c + g), y: (n - 1 - row) * (c + g), width: c, height: c, rx: 3,
        style: { fill: i < it.nilai ? it.color : "var(--grid)" } }));
    }
    const fig = el("figure", { class: "waffle", tabindex: "0" }, svg,
      el("figcaption", {}, el("span", { class: "w-angka", text: `${it.nilai} dari 100` }), it.ket));
    hover(fig, (e) => showTip(e, pct(it.persen), it.tip));
    wrap.append(fig);
  });
  host.append(wrap);
}

/* ------------------------------------------------------------------ chart: histogram of risk scores with the cut-off */
function histogram(host, data, { ambang, bins = 20 }) {
  if (!data.length) { host.append(el("p", { class: "empty", text: "Tidak ada SKU baru untuk pilihan ini." })); return; }
  const W = plotWidth(host), H = 230;
  const m = { l: 40, r: 12, t: 28, b: 34 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const hit0 = Array.from({ length: bins }, () => ({ n: 0, f: 0 }));
  data.forEach((d) => { const b = hit0[Math.min(bins - 1, Math.floor(d.s * bins))]; b.n += 1; b.f += d.f; });
  const { step, top: mx } = skalaRapi(Math.max(...hit0.map((b) => b.n)));
  const X = (v) => m.l + v * pw, Y = (v) => m.t + ph - (v / mx) * ph;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Sebaran skor risiko SKU baru" });
  for (let v = 0, k = 0; v <= mx + 1e-9; v += step, k++) {
    svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: k ? "gridline" : "baseline" }),
      sv("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "tick" }, num(v)));
  }
  [0, 20, 40, 60, 80, 100].forEach((t) => svg.append(sv("text", { x: X(t / 100), y: H - 14, "text-anchor": "middle", class: "tick" }, t)));
  svg.append(sv("text", { x: m.l + pw / 2, y: H - 1, "text-anchor": "middle", class: "tick" }, "Skor risiko (0–100) →"));
  const bw = pw / bins, gap = 2;
  hit0.forEach((b, i) => {
    if (!b.n) return;
    const x = X(i / bins) + gap / 2, w = bw - gap;
    const hAman = ((b.n - b.f) / mx) * ph, hRisk = (b.f / mx) * ph;
    const g = sv("g");
    if (b.n - b.f > 0) g.append(sv("path", { d: b.f ? `M${x},${m.t + ph}v${-hAman}h${w}v${hAman}Z` : colPath(x, m.t + ph, w, hAman), style: { fill: "var(--deemph)" }, class: "mark" }));
    if (b.f > 0) g.append(sv("path", { d: colPath(x, m.t + ph - hAman - (b.n - b.f > 0 ? gap / 2 : 0), w, hRisk - (b.n - b.f > 0 ? gap / 2 : 0)), style: { fill: "var(--series-1)" }, class: "mark" }));
    const a = Math.round((100 * i) / bins), z = Math.round((100 * (i + 1)) / bins);
    const hit = sv("rect", { x: X(i / bins), y: m.t, width: bw, height: ph, class: "hit", "aria-label": `Skor ${a}–${z}: ${b.n} SKU` });
    hover(hit, (e) => showTip(e, `${num(b.n)} SKU`, [[null, `Skor ${a}–${z}`, null], b.f ? ["var(--series-1)", "Berisiko", num(b.f)] : null,
      b.n - b.f ? ["var(--deemph)", "Aman", num(b.n - b.f)] : null]), g);
    g.append(hit);
    svg.append(g);
  });
  const xa = X(ambang);
  svg.append(sv("line", { x1: xa, x2: xa, y1: m.t - 8, y2: m.t + ph, class: "refline kuat" }),
    sv("text", { x: xa + 4, y: m.t - 12, class: "lbl kuat" }, `batas berisiko (${Math.round(ambang * 100)})`));
  host.append(svg);
}

/* ------------------------------------------------------------------ chart: matrix heatmap (product group x store group) */
function matrixHeat(host, baris, kolom, nilai, { onBaris }) {
  const W = plotWidth(host);
  const { labelW, lines } = labelColumn(baris, W, 0.36);
  const cellW = (W - labelW) / kolom.length, cellH = 34, gap = 2;
  const hdr = kolom.map((k) => wrapLines(k.label, cellW - 8));
  const hdrH = Math.max(...hdr.map((l) => l.length)) * 14 + 16;
  const H = hdrH + baris.length * cellH + 2;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Persentase aging stock per product group dan kelompok toko" });
  kolom.forEach((k, j) => {
    const cx = labelW + j * cellW + cellW / 2;
    const g = sv("g", { class: "mark" + (k.dim ? " dim" : "") });
    const t = sv("text", { x: cx, y: 12, "text-anchor": "middle", class: "lbl" });
    hdr[j].forEach((ln, i) => t.append(sv("tspan", { x: cx, dy: i ? 14 : 0 }, ln)));
    g.append(t, sv("rect", { x: labelW + j * cellW + gap, y: hdrH - 8, width: cellW - 2 * gap, height: 4, rx: 2, style: { fill: k.color } }));
    svg.append(g);
  });
  baris.forEach((b, i) => {
    const y = hdrH + i * cellH;
    const g = sv("g", { class: "mark" + (b.dim ? " dim" : "") });
    drawLabel(g, lines[i], labelW - 8, y + cellH / 2);
    if (onBaris) {
      const hitL = sv("rect", { x: 0, y, width: labelW - 4, height: cellH, class: "hit", "aria-label": `${b.label}: lihat product group ini saja` });
      hover(hitL, (e) => showTip(e, b.label, [[null, b.pilih ? KLIK_LAGI : KLIK, null]]));
      bisaKlik(hitL, () => onBaris(b));
      g.append(hitL);
    }
    kolom.forEach((k, j) => {
      const v = nilai(b, k);
      const x = labelW + j * cellW + gap / 2, yy = y + gap / 2, w = cellW - gap, h = cellH - gap;
      if (!v || !v.unit) {
        g.append(sv("rect", { x, y: yy, width: w, height: h, rx: 4, style: { fill: "var(--surface-2)" } }),
          sv("text", { x: x + w / 2, y: yy + h / 2 + 4, "text-anchor": "middle", class: "tick" }, "–"));
        return;
      }
      const p = (100 * v.aging) / v.unit, fill = campur(p / 100);
      const r = sv("rect", { x, y: yy, width: w, height: h, rx: 4, style: { fill }, class: k.dim ? "dim" : "" });
      const t = sv("text", { x: x + w / 2, y: yy + h / 2 + 4, "text-anchor": "middle", class: "sel-val", style: { fill: tintaUntuk(fill) } }, pct(p, 0));
      const hit = sv("rect", { x, y: yy, width: w, height: h, class: "hit", "aria-label": `${b.label}, ${k.label}: ${pct(p)} aging stock` });
      hover(hit, (e) => showTip(e, pct(p), [[null, b.label, null], [k.color, k.label, null], [null, "Aging stock", `${num(v.aging)} dari ${num(v.unit)} unit`]]), r);
      g.append(r, t, hit);
    });
    svg.append(g);
  });
  host.append(svg);
}

/* ------------------------------------------------------------------ chart: Sankey (sending zone -> receiving zone) */
function sankey(host, rows, { onZona }) {
  if (!rows.length) { host.append(el("p", { class: "empty", text: "Tidak ada pengiriman untuk pilihan ini." })); return; }
  const W = plotWidth(host), sempit = W < 520;
  const alir = {};
  rows.forEach((r) => { const k = r.zona_asal + "|" + r.zona_penerima; alir[k] = (alir[k] || 0) + r.unit_dipindah; });
  const links = Object.entries(alir).map(([k, v]) => { const [a, b] = k.split("|"); return { a, b, v }; });
  const keluar = {}, masuk = {};
  links.forEach((l) => { keluar[l.a] = (keluar[l.a] || 0) + l.v; masuk[l.b] = (masuk[l.b] || 0) + l.v; });
  const urut = [...ZONA].sort((p, q) => ((keluar[q] || 0) + (masuk[q] || 0)) - ((keluar[p] || 0) + (masuk[p] || 0)));
  const kiri = urut.filter((z) => keluar[z]), kanan = urut.filter((z) => masuk[z]);
  const total = jumlah(links, "v");
  const m = { t: 26, b: 6 }, nodeW = 12, pad = 18;
  const H = sempit ? 340 : 320;
  const k = (H - m.t - m.b - pad * (Math.max(kiri.length, kanan.length) - 1)) / total;
  const posisi = (daftar, nilai) => { let y = m.t; return Object.fromEntries(daftar.map((z) => { const o = { y, h: nilai[z] * k }; y += o.h + pad; return [z, o]; })); };
  const PK = posisi(kiri, keluar), PN = posisi(kanan, masuk);
  const xL = 0, xR = W - nodeW;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Aliran unit dari zona pengirim ke zona penerima" });
  svg.append(sv("text", { x: xL, y: 12, class: "tick" }, "Zona pengirim"), sv("text", { x: W, y: 12, "text-anchor": "end", class: "tick" }, "Zona penerima"));
  const offK = Object.fromEntries(kiri.map((z) => [z, 0])), offN = Object.fromEntries(kanan.map((z) => [z, 0]));
  const lapis = sv("g");
  svg.append(lapis);
  [...links].sort((p, q) => kiri.indexOf(p.a) - kiri.indexOf(q.a) || kanan.indexOf(p.b) - kanan.indexOf(q.b)).forEach((l) => {
    const w = l.v * k;
    const y0 = PK[l.a].y + offK[l.a] + w / 2, y1 = PN[l.b].y + offN[l.b] + w / 2;
    offK[l.a] += w; offN[l.b] += w;
    const xm = (xL + nodeW + xR) / 2;
    const lintas = l.a !== l.b;
    const redup = state.zona && l.a !== state.zona && l.b !== state.zona;
    const p = sv("path", { d: `M${xL + nodeW},${y0}C${xm},${y0} ${xm},${y1} ${xR},${y1}`,
      class: "alir" + (lintas ? " lintas" : "") + (redup ? " dim" : ""), style: { strokeWidth: Math.max(1, w) } });
    hover(p, (e) => showTip(e, `${num(l.v)} unit`, [[null, "Dari", l.a], [null, "Ke", l.b], [null, lintas ? "Ke zona lain" : "Di zona yang sama", null],
      [null, "Bagian dari semua kiriman", pct((100 * l.v) / total)]]), p);
    p.setAttribute("aria-label", `${l.a} ke ${l.b}: ${l.v} unit`);
    lapis.append(p);
  });
  const simpul = (z, o, sisi) => {
    const x = sisi === "kiri" ? xL : xR;
    const g = sv("g", { class: "mark" + (state.zona && state.zona !== z ? " dim" : "") });
    g.append(sv("rect", { x, y: o.y, width: nodeW, height: Math.max(2, o.h), rx: 3, class: "simpul" }));
    const tx = sisi === "kiri" ? x + nodeW + 6 : x - 6, anc = sisi === "kiri" ? "start" : "end";
    const ym = o.y + o.h / 2;
    g.append(sv("text", { x: tx, y: ym - 1, "text-anchor": anc, class: "lbl kuat halo" }, z),
      sv("text", { x: tx, y: ym + 13, "text-anchor": anc, class: "tick halo" }, `${num(sisi === "kiri" ? keluar[z] : masuk[z])} unit ${sisi === "kiri" ? "dikirim" : "diterima"}`));
    const lebar = Math.max(textWidth(z, 12, 600), 90) + nodeW + 10;
    const hit = sv("rect", { x: sisi === "kiri" ? x : x + nodeW - lebar, y: o.y - 4, width: lebar, height: Math.max(o.h + 8, 30), class: "hit",
      "aria-label": `Zona ${z}: lihat zona ini saja` });
    hover(hit, (e) => showTip(e, z, [[null, sisi === "kiri" ? "Unit dikirim" : "Unit diterima", num(sisi === "kiri" ? keluar[z] : masuk[z])],
      [null, state.zona === z ? KLIK_LAGI : KLIK, null]]));
    if (onZona) bisaKlik(hit, () => onZona(z));
    g.append(hit);
    svg.append(g);
  };
  kiri.forEach((z) => simpul(z, PK[z], "kiri"));
  kanan.forEach((z) => simpul(z, PN[z], "kanan"));
  host.append(svg);
}

/* ------------------------------------------------------------------ meters: share of all aging stock (100% = the track) */
function meters(host, rows) {
  rows.forEach((r) => {
    const track = el("div", { class: "track", role: "img", tabindex: "0",
      "aria-label": `${r.nama}: ${pct(r.pk)} ada toko penerima, ${pct(r.pp)} bisa dipindah` },
      el("span", { class: "kandidat", style: `width:${r.pk}%` }), el("span", { class: "isi", style: `width:${r.pp}%` }));
    hover(track, (e) => showTip(e, `${num(r.pindah)} unit bisa dipindah`, [["var(--accent)", "Bisa dipindah", pct(r.pp)],
      ["var(--band-1)", "Ada toko penerima", `${pct(r.pk)} (${num(r.kandidat)} unit)`]]));
    host.append(el("div", { class: "meter-baris" + (r.dipakai ? " dipakai" : "") },
      el("div", { class: "meter-nama" }, r.nama, r.dipakai ? el("span", { class: "pakai", text: "Dipakai" }) : null, el("small", { text: r.ket })),
      track,
      el("div", { class: "meter-nilai" }, pct(r.pp), el("small", { text: `${num(r.pindah)} unit` }))));
  });
}
/* ------------------------------------------------------------------ chart: store network (graph) */
/* Deterministic force layout in a unit box, seeded from the notebook's spring layout: edge attraction,
   all-pair repulsion, a pull toward the centre (keeps separate components close) and collision. */
let LAYOUT = null;
function layoutGraf(rad) {
  if (LAYOUT) return LAYOUT;
  const n = STORES.length, idx = Object.fromEntries(STORES.map((s, i) => [s.kode_toko, i]));
  const xs = STORES.map((s) => s.x), ys = STORES.map((s) => s.y);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const p = STORES.map((s) => [(s.x - mx) / span, (s.y - my) / span]);
  const E = EDGES.map((e) => [idx[e.toko_a], idx[e.toko_b], e.cosine]);
  const k = 0.16, minD = (i, j) => (rad[i] + rad[j]) * 0.0042 + 0.06;
  for (let it = 0; it < 600; it++) {
    const t = 0.03 * (1 - it / 600) + 0.002;
    const f = p.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = p[i][0] - p[j][0], dy = p[i][1] - p[j][1], d = Math.hypot(dx, dy) || 1e-6;
      let rep = (k * k) / d;
      if (d < minD(i, j)) rep += (minD(i, j) - d) * 4;
      f[i][0] += (dx / d) * rep; f[i][1] += (dy / d) * rep; f[j][0] -= (dx / d) * rep; f[j][1] -= (dy / d) * rep;
    }
    for (const [a, b, w] of E) {
      const dx = p[a][0] - p[b][0], dy = p[a][1] - p[b][1], d = Math.hypot(dx, dy) || 1e-6;
      const att = ((d * d) / k) * (0.5 + w);
      f[a][0] -= (dx / d) * att; f[a][1] -= (dy / d) * att; f[b][0] += (dx / d) * att; f[b][1] += (dy / d) * att;
    }
    for (let i = 0; i < n; i++) {
      f[i][0] -= p[i][0] * 0.9; f[i][1] -= p[i][1] * 0.9;
      const fl = Math.hypot(f[i][0], f[i][1]) || 1e-9, step = Math.min(fl, t);
      p[i][0] += (f[i][0] / fl) * step; p[i][1] += (f[i][1] / fl) * step;
    }
  }
  LAYOUT = p;
  return p;
}
const GRAF = { pos: null, kunci: "" };          // node positions (layout space), kept across re-renders
function network(host, { highlight }) {
  const W = plotWidth(host), sempit = W < 520;
  const H = sempit ? Math.round(W * 1.1) : Math.round(Math.min(500, Math.max(340, W * 0.66)));
  const pr = STORES.map((s) => s.pagerank), prMin = Math.min(...pr), prMax = Math.max(...pr);
  const R = (s) => (sempit ? 7 : 9) + (sempit ? 6 : 9) * ((s.pagerank - prMin) / (prMax - prMin || 1));
  const rad = STORES.map(R);
  const lay0 = layoutGraf(rad);
  const lw = Math.max(...lay0.map((q) => q[0])) - Math.min(...lay0.map((q) => q[0]));
  const lh = Math.max(...lay0.map((q) => q[1])) - Math.min(...lay0.map((q) => q[1]));
  const putar = (H > W) === (lw > lh);                                    // fit the long side to the long side
  const base = putar ? lay0.map(([x, y]) => [y, x]) : lay0;
  const kunci = putar ? "potret" : "lanskap";
  if (!GRAF.pos || GRAF.kunci !== kunci) { GRAF.pos = base.map((q) => q.slice()); GRAF.kunci = kunci; }
  const pos = GRAF.pos;
  // fixed view transform (from the untouched layout) so dragging never rescales the picture
  const pad = 30;
  const bx = base.map((q) => q[0]), by = base.map((q) => q[1]);
  const [x1, x2, y1, y2] = [Math.min(...bx), Math.max(...bx), Math.min(...by), Math.max(...by)];
  const sc = Math.min((W - 2 * pad) / (x2 - x1 || 1), (H - 2 * pad - 14) / (y2 - y1 || 1));
  const ox = (W - sc * (x2 - x1)) / 2, oy = (H - 14 - sc * (y2 - y1)) / 2;
  const kePx = (q) => [ox + (q[0] - x1) * sc, oy + (q[1] - y1) * sc];
  const keLay = (px, py) => [x1 + (px - ox) / sc, y1 + (py - oy) / sc];
  const [lx1, ly1] = keLay(16, 16), [lx2, ly2] = keLay(W - 16, H - 28);
  const batasi = (q) => [Math.max(lx1, Math.min(lx2, q[0])), Math.max(ly1, Math.min(ly2, q[1]))];

  const idx = Object.fromEntries(STORES.map((s, i) => [s.kode_toko, i]));
  const tetangga = STORES.map(() => new Set());
  EDGES.forEach((e) => { tetangga[idx[e.toko_a]].add(idx[e.toko_b]); tetangga[idx[e.toko_b]].add(idx[e.toko_a]); });
  const cs = EDGES.map((e) => e.cosine), cMin = Math.min(...cs), cMax = Math.max(...cs);
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", class: "graf",
    "aria-label": "Peta kemiripan toko: tiap titik satu toko, garis menghubungkan toko yang pola penjualannya mirip, warna menunjukkan kelompok toko. Titik dapat diseret dan diklik." });
  const lapisEdge = sv("g"), lapisNode = sv("g");
  svg.append(lapisEdge, lapisNode);
  const filterOn = (i) => !highlight || highlight(STORES[i]);
  const garis = EDGES.map((e) => {
    const a = idx[e.toko_a], b = idx[e.toko_b];
    const ln = sv("line", { class: "edge mark" + (filterOn(a) && filterOn(b) ? "" : " dim"),
      style: { stroke: "var(--edge)", strokeWidth: 1 + 3 * ((e.cosine - cMin) / (cMax - cMin || 1)), strokeLinecap: "round" } });
    lapisEdge.append(ln);
    return { a, b, ln };
  });
  const simpul = STORES.map((s, i) => {
    const g = sv("g", { class: "node mark" + (filterOn(i) ? "" : " dim") });
    const dipilih = state.toko === s.kode_toko;
    const c = sv("circle", { r: rad[i], style: { fill: komVar(s.komunitas), stroke: dipilih ? "var(--text-primary)" : "var(--surface-1)", strokeWidth: dipilih ? 3 : 2 } });
    const t = sv("text", { y: rad[i] + 13, "text-anchor": "middle", class: "lbl" }, nomorToko(s.kode_toko));
    const hit = sv("circle", { r: Math.max(rad[i] + 6, 16), class: "hit node-hit", tabindex: "0", role: "button",
      "aria-label": `${s.kode_toko}, ${KOM[s.komunitas].nama}. Tekan Enter untuk melihat toko ini saja.` });
    g.append(c, t, hit);
    lapisNode.append(g);
    return { g, c, hit };
  });
  const gambar = () => {
    garis.forEach(({ a, b, ln }) => {
      const [ax, ay] = kePx(pos[a]), [bx_, by_] = kePx(pos[b]);
      ln.setAttribute("x1", ax); ln.setAttribute("y1", ay); ln.setAttribute("x2", bx_); ln.setAttribute("y2", by_);
    });
    simpul.forEach(({ g }, i) => { const [x, y] = kePx(pos[i]); g.setAttribute("transform", `translate(${x},${y})`); });
  };
  gambar();

  // focus a store: its neighbours stay, everything else steps back (overview first, details on demand)
  const sorot = (i) => {
    simpul.forEach(({ g }, j) => g.classList.toggle("redup", i != null && j !== i && !tetangga[i].has(j)));
    garis.forEach(({ a, b, ln }) => {
      const kena = i != null && (a === i || b === i);
      ln.classList.toggle("redup", i != null && !kena);
      ln.classList.toggle("fokus", kena);
    });
  };
  const tip = (e, i) => {
    const s = STORES[i];
    showTip(e, s.kode_toko, [[komVar(s.komunitas), KOM[s.komunitas].nama, null], [null, "Zona", s.zona],
      [null, "Aging stock", pct(s.porsi_aging_pct)], [null, "Terjual 12 bulan", num(s.qty_12_bulan) + " pcs"],
      [null, "Paling mirip dengan toko", [...tetangga[i]].map((j) => nomorToko(STORES[j].kode_toko)).join(", ")],
      [null, state.toko === s.kode_toko ? KLIK_LAGI : KLIK, null]]);
  };
  const pilihToko = (i) => terapkanEntitas("toko", STORES[i].kode_toko, { gulir: false });

  // light force simulation: neighbours follow a dragged node, then everything settles
  let alpha = 0, tetap = -1, jalan = false;
  const langkah = () => {
    const n = pos.length, k = 0.16, f = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], d = Math.hypot(dx, dy) || 1e-6;
      const minD = (rad[i] + rad[j]) * 0.0042 + 0.06;
      let rep = (k * k) / d;
      if (d < minD) rep += (minD - d) * 4;
      f[i][0] += (dx / d) * rep; f[i][1] += (dy / d) * rep; f[j][0] -= (dx / d) * rep; f[j][1] -= (dy / d) * rep;
    }
    garis.forEach(({ a, b }, m) => {
      const dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1], d = Math.hypot(dx, dy) || 1e-6;
      const att = ((d * d) / k) * (0.5 + EDGES[m].cosine);
      f[a][0] -= (dx / d) * att; f[a][1] -= (dy / d) * att; f[b][0] += (dx / d) * att; f[b][1] += (dy / d) * att;
    });
    for (let i = 0; i < n; i++) {
      if (i === tetap) continue;
      const fl = Math.hypot(f[i][0], f[i][1]) || 1e-9, step = Math.min(fl, 0.02 * alpha);
      pos[i] = batasi([pos[i][0] + (f[i][0] / fl) * step, pos[i][1] + (f[i][1] / fl) * step]);
    }
  };
  const putaran = () => {
    if (!svg.isConnected) { jalan = false; return; }
    langkah(); gambar();
    alpha *= tetap >= 0 ? 0.995 : 0.94;
    if (alpha > 0.02 || tetap >= 0) requestAnimationFrame(putaran); else jalan = false;
  };
  const panaskan = () => { alpha = Math.max(alpha, 0.8); if (!jalan) { jalan = true; requestAnimationFrame(putaran); } };

  simpul.forEach(({ hit, c }, i) => {
    let mulai = null, geser = false;
    const titik = (e) => {
      const r = svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    hit.addEventListener("pointerenter", (e) => { if (tetap < 0) { sorot(i); tip(e, i); c.classList.add("hover-lift"); } });
    hit.addEventListener("pointermove", (e) => {
      if (mulai && hit.hasPointerCapture(e.pointerId)) {
        const [px, py] = titik(e);
        if (!geser && Math.hypot(px - mulai[0], py - mulai[1]) > 4) { geser = true; hideTip(); svg.classList.add("menyeret"); }
        if (geser) { pos[i] = batasi(keLay(px, py)); gambar(); panaskan(); }
      } else if (tetap < 0) tip(e, i);
    });
    hit.addEventListener("pointerleave", () => { if (tetap < 0) { sorot(null); hideTip(); c.classList.remove("hover-lift"); } });
    hit.addEventListener("pointerdown", (e) => {
      hit.setPointerCapture(e.pointerId); mulai = titik(e); geser = false; tetap = i; sorot(i);
    });
    const selesai = (e) => {
      if (!mulai) return;
      const klik = !geser;
      mulai = null; tetap = -1; svg.classList.remove("menyeret");
      if (hit.hasPointerCapture?.(e.pointerId)) hit.releasePointerCapture(e.pointerId);
      if (klik) pilihToko(i); else { sorot(null); panaskan(); }
    };
    hit.addEventListener("pointerup", selesai);
    hit.addEventListener("pointercancel", selesai);
    hit.addEventListener("focus", () => { sorot(i); const r = hit.getBoundingClientRect(); tip({ clientX: r.left + r.width / 2, clientY: r.top }, i); });
    hit.addEventListener("blur", () => { sorot(null); hideTip(); });
    hit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pilihToko(i); } });
  });

  const atur = el("button", { class: "ghost graf-reset", type: "button", title: "Kembalikan posisi titik ke tata letak awal",
    onclick: () => { GRAF.pos = null; renderAktif(); } }, "Atur ulang posisi");
  host.append(svg, el("div", { class: "graf-bawah" },
    el("p", { class: "hint", text: "Seret titik untuk memindahkannya · arahkan kursor untuk melihat toko yang mirip · klik titik untuk melihat toko itu saja" }), atur));
}

/* ------------------------------------------------------------------ chart: transfer heatmap (source x recipient) */
function heatmap(host, rows) {
  const W = plotWidth(host);
  if (!rows.length) { host.append(el("p", { class: "empty", text: "Tidak ada transfer untuk pilihan ini." })); return; }
  const urut = (a, b) => STORE[a].komunitas - STORE[b].komunitas || a.localeCompare(b);   // community blocks
  const src = [...new Set(rows.map((r) => r.kode_toko))].sort(urut);
  const dst = [...new Set(rows.map((r) => r.toko_penerima))].sort(urut);
  const val = {};
  rows.forEach((r) => { const k = r.kode_toko + "|" + r.toko_penerima; val[k] = (val[k] || 0) + r.unit_dipindah; });
  const mx = Math.max(...Object.values(val));
  const m = { l: 42, t: 36, r: 6, b: 6 };
  const cell = Math.max(14, Math.min(34, Math.floor((W - m.l - m.r) / dst.length)));
  const gap = 2;
  const H = m.t + src.length * cell + m.b;
  const cs = getComputedStyle(document.documentElement);
  const lo = cs.getPropertyValue("--heat-lo").trim(), hi = cs.getPropertyValue("--heat-hi").trim();
  const mix = (t) => {
    const a = lo.match(/\w\w/g).map((h) => parseInt(h, 16)), b = hi.match(/\w\w/g).map((h) => parseInt(h, 16));
    return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
  };
  const svg = sv("svg", { viewBox: `0 0 ${m.l + dst.length * cell + m.r} ${H}`, width: m.l + dst.length * cell + m.r, height: H, role: "img",
    "aria-label": "Unit yang dikirim dari toko pengirim (baris) ke toko penerima (kolom)" });
  dst.forEach((d, j) => svg.append(
    sv("rect", { x: m.l + j * cell + 1, y: m.t - 6, width: cell - 2, height: 4, rx: 2, style: { fill: komVar(STORE[d].komunitas) } }),
    sv("text", { x: m.l + j * cell + cell / 2, y: m.t - 12, "text-anchor": "middle", class: "tick" }, nomorToko(d))));
  src.forEach((s, i) => {
    svg.append(sv("rect", { x: m.l - 6, y: m.t + i * cell + 1, width: 4, height: cell - 2, rx: 2, style: { fill: komVar(STORE[s].komunitas) } }),
      sv("text", { x: m.l - 10, y: m.t + i * cell + cell / 2 + 4, "text-anchor": "end", class: "tick" }, nomorToko(s)));
    dst.forEach((d, j) => {
      const v = val[s + "|" + d];
      const x = m.l + j * cell, y = m.t + i * cell;
      if (!v) { svg.append(sv("rect", { x: x + gap / 2, y: y + gap / 2, width: cell - gap, height: cell - gap, rx: 3, style: { fill: "var(--surface-2)" } })); return; }
      const t = Math.sqrt(v / mx);
      const r = sv("rect", { x: x + gap / 2, y: y + gap / 2, width: cell - gap, height: cell - gap, rx: 3, style: { fill: mix(t) }, class: "mark" });
      const hit = sv("rect", { x, y, width: cell, height: cell, class: "hit", "aria-label": `${s} ke ${d}: ${v} unit` });
      hover(hit, (e) => showTip(e, num(v) + " unit", [[null, "Dari", s], [null, "Ke", d],
        [komVar(STORE[s].komunitas), KOM[STORE[s].komunitas].nama, null]]), r);
      svg.append(r, hit);
    });
  });
  const wrap = el("div", { class: "table-wrap" });
  wrap.append(svg);
  host.append(wrap);
  const scale = el("div", { class: "legend" },
    el("span", {}, "1 unit"), el("i", { style: `width:120px;height:10px;border-radius:3px;background:linear-gradient(90deg, ${mix(0.03)}, ${mix(1)})` }),
    el("span", { text: num(mx) + " unit" }));
  host.append(scale, legendBox(D.communities.map((c) => [komVar(c.id), c.nama])));
}

/* ------------------------------------------------------------------ data table with sort, paging, CSV */
function dataTable(host, { id, judul, desc, cols, rows, sortKey, sortDir = -1, tools, file }) {
  const st = (state.tampil[id] = state.tampil[id] && typeof state.tampil[id] === "object" ? state.tampil[id] : { sort: sortKey, dir: sortDir, n: 15 });
  const sorted = [...rows].sort((a, b) => {
    const x = a[st.sort], y = b[st.sort];
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * st.dir;
  });
  const shown = sorted.slice(0, st.n);
  const csv = () => {
    const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const text = [cols.map((c) => c.key).join(","), ...sorted.map((r) => cols.map((c) => esc(r[c.key])).join(","))].join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: file });
    document.body.append(a); a.click(); a.remove();
  };
  const th = (c) => el("th", { class: c.num ? "num" : null, "aria-sort": st.sort === c.key ? (st.dir > 0 ? "ascending" : "descending") : null },
    el("button", { type: "button", onclick: () => { st.dir = st.sort === c.key ? -st.dir : (c.num ? -1 : 1); st.sort = c.key; renderAktif(); } },
      c.label + (st.sort === c.key ? (st.dir > 0 ? " ↑" : " ↓") : "")));
  host.replaceChildren(
    el("div", { class: "head" }, el("div", {}, el("h3", { text: judul }), el("p", { class: "desc", text: desc })),
      el("button", { class: "toggle", type: "button", onclick: csv }, "Unduh CSV")),
    tools || "",
    el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, cols.map(th))),
      el("tbody", {}, shown.map((r) => el("tr", {}, cols.map((c) => {
        const v = c.render ? c.render(r) : (c.fmt ? fmtSel(c, r) : r[c.key]);
        return el("td", { class: c.num ? "num" : null }, v instanceof Node ? v : (v ?? "–"));
      })))))),
    el("div", { class: "more" }, `Menampilkan ${num(shown.length)} dari ${num(sorted.length)} baris`,
      sorted.length > st.n ? el("button", { class: "ghost", type: "button", onclick: () => { st.n += 25; renderAktif(); } }, "Tampilkan 25 lagi") : null));
}

/* ------------------------------------------------------------------ page building blocks
   Every page reads in one order: question -> short answer -> how to read -> key numbers -> evidence -> actions -> details. */
const IKON = {
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  lonceng: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
  graf: '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.3 8.2l2.6 7.4M15.8 7.8l-2.7 7.8M8.5 6.8l7-.6"/>',
  panah: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  cek: '<path d="M5 12.5l4.2 4.2L19 7"/>',
};
function ikon(nama) {
  const s = sv("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  s.innerHTML = IKON[nama];                                         // constant markup only
  return s;
}
function pertanyaan(host, tanya, jawab) {
  host.append(el("section", { class: "qa" }, el("h2", { class: "tanya", text: tanya }), rich("p", jawab, { class: "jawab" })));
}
function bantu(host, teks) { host.append(el("p", { class: "bantu" }, ikon("info"), rich("span", teks))); }
function kpis(host, items) {
  host.append(el("div", { class: "kpis" }, items.map(([label, value, note]) =>
    el("div", { class: "kpi" }, el("div", { class: "label", text: label }), el("div", { class: "value", text: value }),
      note ? rich("div", note, { class: "note" }) : null))));
}
function langkah(host, judul, items) {
  const s = el("section", { class: "langkah" }, el("h3", {}, ikon("cek"), judul), el("ol", {}, items.map((t) => el("li", {}, rich("span", t)))));
  host.append(s);
  return s;
}
function figur(host, id) { const f = el("figure", { class: "card chart", id }); host.append(f); return f; }
function kisi(host, cls = "grid two") { const g = el("div", { class: cls }); host.append(g); return g; }
function detail(host, id, judul, ket, isiFn) {
  const d = el("details", { class: "detail", id: "d-" + id },
    el("summary", {}, el("span", {}, judul, ket ? el("span", { class: "sum-ket", text: " · " + ket }) : null)));
  const isi = el("div", { class: "detail-isi" });
  d.append(isi);
  host.append(d);
  let sudah = false;
  const buka = () => { if (!sudah) { sudah = true; isiFn(isi); } };   // render on first open: charts need their width
  if (state.terbuka[id]) { d.open = true; buka(); }
  d.addEventListener("toggle", () => { state.terbuka[id] = d.open; if (d.open) buka(); });
}
function kartuTemuan(host, items) {
  host.append(el("div", { class: "temuan" }, items.map((k) =>
    el("article", { class: "kartu-temuan", onclick: (e) => { if (!e.target.closest(".ent, .kt-lanjut")) pilihTab(k.tab, true); } },
      el("div", { class: "kt-label" }, ikon(k.ikon), k.label),
      el("div", { class: "kt-angka", text: k.angka }),
      rich("div", k.satuan, { class: "kt-satuan" }),
      rich("p", k.kalimat, { class: "kt-kalimat" }),
      el("button", { class: "kt-lanjut", type: "button", onclick: () => pilihTab(k.tab, true) }, k.lanjut + " →")))));
}
function seg(label, opsi, nilai, onPilih) {
  return el("div", { class: "seg", role: "group", "aria-label": label }, opsi.map(([v, teks]) =>
    el("button", { type: "button", "aria-pressed": String(v === nilai), onclick: () => onPilih(v) }, teks)));
}
const komLegend = (dot = "") => legendBox(D.communities.map((c) => [komVar(c.id), c.nama]), dot);

/* ------------------------------------------------------------------ shared aggregations */
const stokCocok = (r) => tokoCocok(r.kode_toko) && kelompokCocok(r.kelompok);
function agregat(rows) {
  const a = { unit: 0, aging: 0, pasangan: 0 };
  PITA.forEach((p) => (a[p.key] = 0));
  rows.forEach((r) => { a.unit += r.unit_stok; a.aging += r.unit_aging; a.pasangan += r.pasangan; PITA.forEach((p) => (a[p.key] += r[p.key])); });
  return a;
}
function kelompokkan(rows, kunci) {
  const out = {};
  rows.forEach((r) => { const g = (out[kunci(r)] ||= { unit: 0, aging: 0 }); g.unit += r.unit_stok; g.aging += r.unit_aging; });
  return out;
}
/* "Khusus TOKO-03 · Sepatu Anak Pria: " - the names are links too, so a click on them removes that filter again */
function awalan() {
  const p = [];
  if (state.toko) p.push(state.toko); else if (state.zona) p.push("zona " + state.zona);
  if (state.kelompok) p.push(state.kelompok);
  return p.length ? `Khusus ${p.join(" · ")}: ` : "";
}
function ringkasFilter() {
  const bag = [state.zona && `zona ${state.zona}`, state.toko, state.kelompok].filter(Boolean);
  return bag.length ? `Sedang ditampilkan: ${bag.join(" · ")}. Klik Reset untuk kembali ke semua data.`
    : `Menampilkan semua ${D.meta.jumlah_toko} toko dan semua product group`;
}
const skor100 = (s) => Math.round(s * 100);
const AMBANG100 = skor100(AMBANG);
const HL = D.meta.hierarki_lama;
const CATATAN_HL = HL ? `**Hierarki Lama** = ${HL.sku} SKU lama (dibuat ${HL.tahun.join("–")}) yang kodenya tidak cocok dengan product group sekarang. ` +
  `Stoknya hanya ${num(HL.unit)} unit, jadi persentasenya memang tinggi tetapi jumlahnya sangat kecil.` : null;
const KLIK = "Klik untuk melihat yang ini saja", KLIK_LAGI = "Klik lagi untuk kembali ke semua data";

/* ================================================================== page: Ringkasan */
function renderRingkasan(page) {
  const a = agregat(STOK.filter(stokCocok));
  const porsi = a.unit ? (100 * a.aging) / a.unit : null;
  pertanyaan(page, "Bagaimana kondisi stok saat ini?",
    a.unit ? `${awalan()}**${pct(porsi)} stok sudah jadi aging stock.** Ada ${num(a.aging)} dari ${num(a.unit)} unit yang sudah lebih dari ${D.meta.aging_hari} hari di toko.`
      : `${awalan()}tidak ada stok untuk pilihan ini.`);
  bantu(page, `**Aging stock** = barang yang sudah lebih dari ${D.meta.aging_hari} hari di toko dan belum terjual. Makin lama tersimpan, makin besar diskon yang dibutuhkan untuk menjualnya. ` +
    "**Tips:** klik nama toko, zona, atau product group yang bergaris titik untuk melihat datanya saja.");

  // 1. how old is the stock right now (part-to-whole)
  const bands = PITA.map((p, i) => ({ label: p.label, value: a[p.key], color: `var(--band-${i + 1})`, ink: `var(--band-ink-${i + 1})` }));
  card(figur(page, "c-umur"), {
    judul: "Sudah berapa lama stok ada di toko?", desc: "Semua unit stok, dikelompokkan menurut lamanya di toko",
    plot: (h) => segBar(h, bands, [{ dari: [0, 1, 2], label: `Masih aman (≤ ${D.meta.aging_hari} hari)` }, { dari: [3, 4], label: "Aging stock" }]),
    legend: legendBox(bands.map((b) => [b.color, `${b.label} · ${num(b.value)} unit`])),
    table: () => simpleTable([{ key: "label", label: "Lama di toko" }, { key: "value", label: "Unit", num: 1, fmt: num },
      { key: "p", label: "Persentase", num: 1, fmt: (v) => pct(v) }], bands.map((b) => ({ ...b, p: a.unit ? (100 * b.value) / a.unit : null }))),
    catatan: a.unit ? `**${num(a.u_91_150)} unit (${pct((100 * a.u_91_150) / a.unit)}) sudah 91–150 hari di toko.** Kalau tidak segera laku, unit ini akan jadi aging stock dalam 2 bulan.` : null,
  });

  // 2. the three findings, each a door to its page
  const w = WATCH.filter((r) => tokoCocok(r.kode_toko) && kelompokCocok(r.kelompok));
  const flag = w.filter((r) => r.ditandai === 1);
  const kirim = TRANSFER.filter((r) => tokoCocok(r.kode_toko) && kelompokCocok(r.kelompok));
  const unitKirim = jumlah(kirim, "unit_dipindah");
  page.append(el("h2", { class: "judul-bagian", text: "3 hal yang bisa dilakukan" }));
  kartuTemuan(page, [
    { ikon: "lonceng", label: "Cegah aging stock baru", tab: "ml", lanjut: "Lihat daftarnya", angka: num(flag.length),
      satuan: "SKU baru di toko diperkirakan akan jadi aging stock",
      kalimat: w.length ? `Dari ${num(w.length)} SKU yang mulai dijual Mei–Agustus 2026. Stoknya masih ${num(jumlah(flag, (r) => r.stok || 0))} unit, jadi masih bisa dicegah.` : "Tidak ada SKU baru untuk pilihan ini." },
    { ikon: "graf", label: "Kurangi kiriman ke toko kecil", tab: "graph", lanjut: "Lihat kelompok toko", angka: pct(KECIL.porsi_aging_pct),
      satuan: `stok di **${KECIL.nama}** sudah jadi aging stock`,
      kalimat: `Di ${BESAR.nama.toLowerCase()} hanya ${pct(BESAR.porsi_aging_pct)}. Toko kecil menjual jauh lebih sedikit, jadi stoknya lama habis.` },
    { ikon: "panah", label: "Pindahkan stok ke toko lain", tab: "transfer", lanjut: "Lihat daftar kiriman", angka: num(unitKirim),
      satuan: "unit aging stock bisa dipindah ke toko yang masih bisa menjualnya",
      kalimat: a.aging ? `Itu ${pct((100 * unitKirim) / a.aging)} dari aging stock${adaFilter() ? " pada pilihan ini" : ""}, tanpa perlu beli stok baru.` : "Tidak ada aging stock untuk pilihan ini." },
  ]);

  // 3. where the aging stock sits: per store or per product group
  const dim = state.dimRingkas;
  const kontrol = seg("Tampilkan", [["toko", "Per toko"], ["kelompok", "Per product group"]], dim, (v) => { state.dimRingkas = v; renderAktif(); });
  if (dim === "toko") {
    const byT = kelompokkan(STOK.filter((r) => kelompokCocok(r.kelompok)), (r) => r.kode_toko);
    const all = Object.values(byT), rata = (100 * jumlah(all, "aging")) / (jumlah(all, "unit") || 1);
    const items = Object.entries(byT).filter(([, v]) => v.unit > 0)
      .map(([k, v]) => ({ label: k, value: (100 * v.aging) / v.unit, unit: v.unit, aging: v.aging, kom: STORE[k].komunitas, zona: STORE[k].zona,
        dim: adaFilterToko() && !tokoCocok(k), pilih: state.toko === k }))
      .sort((p, q) => q.value - p.value);
    card(figur(page, "c-sebaran"), {
      judul: "Toko mana yang paling banyak aging stock-nya?", kontrol,
      desc: `Persentase stok yang sudah jadi aging stock di tiap toko${state.kelompok ? ` (${state.kelompok})` : ""}. Warna = kelompok toko. Klik batang untuk melihat toko itu saja.`,
      plot: (h) => barsH(h, items, { max: 100, fmt: (v) => pct(v), colorOf: (d) => komVar(d.kom), ref: { value: rata, label: `rata-rata ${pct(rata)}` },
        onClick: (d) => terapkanEntitas("toko", d.label, { gulir: false }),
        tip: (d) => [[komVar(d.kom), KOM[d.kom].nama, null], [null, "Zona", d.zona], [null, "Aging stock", `${num(d.aging)} dari ${num(d.unit)} unit`]] }),
      legend: komLegend(),
      table: () => simpleTable([{ key: "label", label: "Toko", render: (r) => entLink("toko", r.label) }, { key: "zona", label: "Zona", render: (r) => entLink("zona", r.zona) },
        { key: "kom", label: "Kelompok toko", render: (r) => chip(komVar(r.kom), KOM[r.kom].nama) },
        { key: "aging", label: "Aging stock (unit)", num: 1, fmt: num }, { key: "unit", label: "Semua stok (unit)", num: 1, fmt: num },
        { key: "value", label: "Persentase", num: 1, fmt: (v) => pct(v) }], items),
    });
  } else {
    const byG = kelompokkan(STOK.filter((r) => tokoCocok(r.kode_toko)), (r) => r.kelompok);
    const all = Object.values(byG), rata = (100 * jumlah(all, "aging")) / (jumlah(all, "unit") || 1);
    const items = Object.entries(byG).filter(([, v]) => v.unit > 0)
      .map(([k, v]) => ({ label: k, value: (100 * v.aging) / v.unit, unit: v.unit, aging: v.aging, dim: state.kelompok && k !== state.kelompok, pilih: state.kelompok === k }))
      .sort((p, q) => q.value - p.value);
    card(figur(page, "c-sebaran"), {
      judul: "Product group mana yang paling banyak aging stock-nya?", kontrol,
      desc: `Persentase stok yang sudah jadi aging stock di tiap product group${state.toko ? ` (${state.toko})` : state.zona ? ` (zona ${state.zona})` : ""}. Klik batang untuk melihat product group itu saja.`,
      plot: (h) => barsH(h, items, { max: 100, fmt: (v) => pct(v), ref: { value: rata, label: `rata-rata ${pct(rata)}` },
        onClick: (d) => terapkanEntitas("kelompok", d.label, { gulir: false }),
        tip: (d) => [[null, "Aging stock", `${num(d.aging)} dari ${num(d.unit)} unit`], [null, "Bagian dari semua stok", pct((100 * d.unit) / jumlah(all, "unit"))]] }),
      table: () => simpleTable([{ key: "label", label: "Product group", render: (r) => entLink("kelompok", r.label) },
        { key: "aging", label: "Aging stock (unit)", num: 1, fmt: num }, { key: "unit", label: "Semua stok (unit)", num: 1, fmt: num },
        { key: "value", label: "Persentase", num: 1, fmt: (v) => pct(v) }], items),
      catatan: items.some((d) => d.label === "Hierarki Lama") ? CATATAN_HL : null,
    });
  }

  // 4. context on demand: monthly sales with Idulfitri marked
  detail(page, "tren", "Penjualan per bulan", "penjualan selalu paling tinggi saat Idulfitri", (isi) => {
    const byM = {};
    JUAL.filter((r) => tokoCocok(r.kode_toko) && kelompokCocok(r.kelompok)).forEach((r) => { byM[r.bulan] = (byM[r.bulan] || 0) + r.qty; });
    const pts = Object.keys(byM).sort().map((b) => ({ bulan: b, y: byM[b], label: bulanLabel(b), full: bulanPanjang(b) }));
    const penanda = D.meta.idulfitri.map((t) => ({ bulan: t.slice(0, 7), teks: "Idulfitri", ket: `Idulfitri ${tanggal(t)}` }));
    card(figur(isi, "c-tren"), {
      judul: "Jumlah terjual per bulan", desc: "Garis putus-putus = bulan Idulfitri. Arahkan kursor ke grafik untuk melihat angka tiap bulan.",
      plot: (h) => lineChart(h, pts, { fmt: (v) => num(v) + " pcs", label: "Jumlah terjual per bulan", penanda }),
      table: () => simpleTable([{ key: "full", label: "Bulan" }, { key: "y", label: "Terjual (pcs)", num: 1, fmt: num }], pts),
      catatan: (() => {
        const i = pts.map((p) => p.bulan).lastIndexOf(penanda[penanda.length - 1].bulan);
        if (i < 0 || i + 1 >= pts.length) return null;
        return `**Setelah Idulfitri, penjualan turun tajam:** ${pts[i].full} terjual ${num(pts[i].y)} pcs, ${pts[i + 1].full} hanya ${num(pts[i + 1].y)} pcs. ` +
          "Barang yang belum laku sebelum Idulfitri jadi mudah menumpuk.";
      })(),
    });
  });
}

/* ================================================================== page: Cegah aging stock baru (machine learning) */
function renderML(page) {
  const w = WATCH.filter((r) => tokoCocok(r.kode_toko) && kelompokCocok(r.kelompok));
  const flag = w.filter((r) => r.ditandai === 1);
  const unitFlag = jumlah(flag, (r) => r.stok || 0);
  const tinggiStok = w.filter((r) => r.tingkat === "1" && r.stok > 0);
  const t0s = WATCH.map((r) => r.t0).sort();
  pertanyaan(page, "SKU baru mana yang berisiko jadi aging stock?",
    w.length ? `${awalan()}**${num(flag.length)} dari ${num(w.length)} SKU baru di toko (${pct((100 * flag.length) / w.length, 0)}) diperkirakan akan jadi aging stock.** Stoknya masih ${num(unitFlag)} unit, jadi masih bisa dicegah sekarang.`
      : `${awalan()}tidak ada SKU baru untuk pilihan ini.`);
  bantu(page, `Setiap SKU baru di suatu toko dinilai oleh model machine learning setelah dijual 8 minggu. Hasilnya **skor risiko 0–100**: makin tinggi, makin besar kemungkinan barangnya tidak habis dalam ${D.meta.aging_hari} hari. ` +
    `Skor ${AMBANG100} ke atas = berisiko. **Prioritas Tinggi** = 10% SKU dengan skor paling tinggi.`);
  kpis(page, [
    ["SKU baru yang dinilai", num(w.length), `mulai dijual ${tanggal(t0s[0])}–${tanggal(t0s[t0s.length - 1])}`],
    ["Diperkirakan jadi aging stock", num(flag.length), w.length ? `${pct((100 * flag.length) / w.length, 0)} dari SKU baru (skor ${AMBANG100} ke atas)` : null],
    ["Stok yang berisiko", num(unitFlag), "unit, masih ada di toko"],
    ["Prioritas Tinggi yang masih ada stoknya", num(tinggiStok.length), `SKU · ${num(jumlah(tinggiStok, "stok"))} unit`]]);

  const g1 = kisi(page);
  // risky share per product group
  const byG = {};
  WATCH.filter((r) => tokoCocok(r.kode_toko)).forEach((r) => {
    const g = (byG[r.kelompok] ||= { n: 0, flag: 0, unit: 0 }); g.n += 1; g.flag += r.ditandai; g.unit += r.ditandai ? r.stok || 0 : 0; });
  const semua = Object.values(byG), rata = (100 * jumlah(semua, "flag")) / (jumlah(semua, "n") || 1);
  const gItems = Object.entries(byG).map(([k, v]) => ({ label: k, value: (100 * v.flag) / v.n, ...v, dim: state.kelompok && k !== state.kelompok, pilih: state.kelompok === k }))
    .sort((p, q) => q.value - p.value);
  card(figur(g1, "c-ml-kelompok"), {
    judul: "Product group mana yang paling berisiko?", desc: "Persentase SKU baru yang diperkirakan jadi aging stock. Klik batang untuk melihat product group itu saja.",
    plot: (h) => barsH(h, gItems, { max: 100, fmt: (v) => pct(v, 0), ref: { value: rata, label: `rata-rata ${pct(rata, 0)}` },
      onClick: (d) => terapkanEntitas("kelompok", d.label, { gulir: false }),
      tip: (d) => [[null, "SKU baru", num(d.n)], [null, "Diperkirakan jadi aging stock", num(d.flag)], [null, "Stok berisiko", num(d.unit) + " unit"]] }),
    table: () => simpleTable([{ key: "label", label: "Product group", render: (r) => entLink("kelompok", r.label) }, { key: "n", label: "SKU baru", num: 1, fmt: num },
      { key: "flag", label: "Berisiko", num: 1, fmt: num }, { key: "value", label: "Persentase", num: 1, fmt: (v) => pct(v, 0) },
      { key: "unit", label: "Stok berisiko (unit)", num: 1, fmt: num }], gItems),
  });
  // score distribution
  const scores = w.map((r) => ({ s: r.skor_risiko, f: r.ditandai }));
  card(figur(g1, "c-skor"), {
    judul: "Sebaran skor risiko", desc: `Tiap batang = jumlah SKU baru dengan skor itu. Biru = berisiko (skor ${AMBANG100} ke atas), abu-abu = aman.`,
    plot: (h) => histogram(h, scores, { ambang: AMBANG }),
    legend: legendBox([["var(--series-1)", `Berisiko (${num(flag.length)})`], ["var(--deemph)", `Aman (${num(w.length - flag.length)})`]]),
    table: () => {
      const b = Array.from({ length: 10 }, (_, i) => ({ r: `${i * 10}–${i * 10 + 10}`, n: 0, f: 0 }));
      w.forEach((r) => { const x = b[Math.min(9, Math.floor(r.skor_risiko * 10))]; x.n += 1; x.f += r.ditandai; });
      return simpleTable([{ key: "r", label: "Skor" }, { key: "n", label: "SKU baru", num: 1, fmt: num }, { key: "f", label: "Berisiko", num: 1, fmt: num }], b);
    },
  });

  const g2 = kisi(page);
  // trust: how often the top priority was right on the test set
  const t1 = TIERS.find((t) => t.tingkat === "1");
  card(figur(g2, "c-percaya"), {
    judul: "Seberapa tepat perkiraannya?", badge: `Diuji pada ${num(D.model.pasangan_uji)} SKU lama yang hasilnya sudah diketahui · tidak berubah oleh filter`,
    desc: "Dari setiap 100 SKU, berapa yang benar-benar jadi aging stock",
    plot: (h) => waffle(h, [
      { nilai: Math.round(t1.precision_pct), persen: t1.precision_pct, color: "var(--tier-1)", ket: "SKU Prioritas Tinggi memang jadi aging stock",
        tip: [[null, "SKU Prioritas Tinggi yang diuji", num(t1.pasangan)], [null, "Memang jadi aging stock", num(t1.aging)]] },
      { nilai: Math.round(100 * D.model.baseline), persen: 100 * D.model.baseline, color: "var(--muted)", ket: "SKU yang dipilih acak jadi aging stock",
        tip: [[null, "Semua SKU yang diuji", num(D.model.pasangan_uji)]] }]),
    table: () => simpleTable([{ key: "tingkat", label: "Prioritas", fmt: (v) => TINGKAT[v].nama + " (" + TINGKAT[v].ket + ")" },
      { key: "pasangan", label: "SKU diuji", num: 1, fmt: num }, { key: "precision_pct", label: "Memang jadi aging stock", num: 1, fmt: (v) => pct(v) },
      { key: "porsi_aging_tertangkap_pct", label: "Bagian dari semua aging stock yang ketemu", num: 1, fmt: (v) => pct(v) }], TIERS),
    catatan: `Jadi, mengecek Prioritas Tinggi lebih dulu ${num(t1.precision_pct / (100 * D.model.baseline), 2)} kali lebih tepat sasaran daripada memilih secara acak.`,
  });
  langkah(g2, "Yang perlu dilakukan minggu ini", [
    `**Cek SKU Prioritas Tinggi yang masih ada stoknya** (${num(tinggiStok.length)} SKU, ${num(jumlah(tinggiStok, "stok"))} unit). Mulai dari skor tertinggi di tabel bawah.`,
    "**Jangan kirim stok tambahan** untuk SKU itu ke toko tersebut sampai penjualannya naik.",
    `**Beri diskon kecil lebih awal, atau pindahkan ke toko lain** yang masih bisa menjualnya, sebelum lewat ${D.meta.aging_hari} hari.`,
  ]);

  // the work list
  const hanyaStok = state.tampil.hanyaStok ?? true;
  const pilihTingkat = state.tampil.tingkat ?? "";
  const rowsT = w.filter((r) => (!hanyaStok || r.stok > 0) && (!pilihTingkat || r.tingkat === pilihTingkat));
  const tools = el("div", { class: "table-tools" },
    seg("Prioritas", [["", "Semua"], ["1", "Tinggi"], ["2", "Sedang"], ["3", "Rendah"]], pilihTingkat, (v) => { state.tampil.tingkat = v; renderAktif(); }),
    el("label", {}, el("input", { type: "checkbox", checked: hanyaStok, onchange: (e) => { state.tampil.hanyaStok = e.target.checked; renderAktif(); } }),
      "Hanya yang masih ada stoknya"));
  const t = el("section", { class: "card table-card" });
  page.append(t);
  dataTable(t, {
    id: "t-pantau", judul: "Daftar SKU baru yang perlu dicek", file: "daftar_sku_berisiko.csv",
    desc: "Urut dari skor tertinggi. Klik judul kolom untuk mengurutkan ulang.",
    tools, rows: rowsT, sortKey: "skor_risiko",
    cols: [
      { key: "tingkat", label: "Prioritas", render: (r) => chip(tierVar(r.tingkat), TINGKAT[r.tingkat].nama) },
      { key: "skor_risiko", label: "Skor", num: 1, render: (r) => el("span", { class: "mini-meter" },
        el("span", { class: "track" }, el("span", { class: "isi", style: `width:${skor100(r.skor_risiko)}%` })), String(skor100(r.skor_risiko))) },
      { key: "kode_toko", label: "Toko", render: (r) => entLink("toko", r.kode_toko) },
      { key: "zona", label: "Zona", render: (r) => entLink("zona", r.zona) },
      { key: "kelompok", label: "Product group", render: (r) => entLink("kelompok", r.kelompok) },
      { key: "subclass", label: "Subclass" }, { key: "kode_sku", label: "SKU" },
      { key: "t0", label: "Mulai dijual", fmt: (v) => tanggal(v) },
      { key: "qty_8w", label: "Terjual 8 minggu", num: 1, fmt: num }, { key: "stok", label: "Stok sekarang", num: 1, fmt: num },
    ],
  });

  detail(page, "ml-teknis", "Cara kerja model", "untuk tim data", (isi) => {
    const m = D.model;
    isi.append(el("ul", { class: "teknis" },
      rich("li", `Unit analisis: pasangan toko–SKU (1 SKU di 1 toko). Model **${m.nama}** dipilih dengan cross-validation. Pada data uji (${num(m.pasangan_uji)} pasangan) PR-AUC ${num(m.pr_auc, 3)}, dibanding baseline ${num(m.baseline, 3)}.`),
      rich("li", `Threshold ${num(m.ambang, 2)} (target recall 80%): recall ${pct(100 * m.recall)}, precision ${pct(100 * m.precision)}.`),
      rich("li", `Daftar SKU berisiko: model dilatih ulang dengan semua pasangan yang hasilnya sudah diketahui, lalu menilai ${num(WATCH.length)} pasangan yang mulai dijual ${tanggal(t0s[0])}–${tanggal(t0s[t0s.length - 1])}; threshold model ini ${num(AMBANG, 2)}.`),
      rich("li", "33 fitur dari 8 minggu pertama: pola penjualan awal, harga dan discount, sebaran SKU di toko lain, product hierarchy, zona, dan kalender. Fitur terkuat: qty terjual 8 minggu pertama, lalu mclass, subclass, dan harga satuan.")));
    const tk = tabel(D.topk);
    isi.append(el("h4", { class: "sub-judul", text: "Jika hanya sebagian SKU teratas yang dicek (data uji)" }),
      el("div", { class: "table-wrap" }, simpleTable([{ key: "ditinjau_pct", label: "Yang dicek", fmt: (v) => `${v}% teratas` },
        { key: "pasangan_ditinjau", label: "SKU", num: 1, fmt: num }, { key: "precision_pct", label: "Memang jadi aging stock", num: 1, fmt: (v) => pct(v) },
        { key: "aging_tertangkap_pct", label: "Bagian aging stock yang ketemu", num: 1, fmt: (v) => pct(v) }, { key: "lift", label: "Lebih tepat dari acak", num: 1, fmt: (v) => num(v, 2) + "×" }], tk)));
  });
}

/* ================================================================== page: Atur alokasi toko (graph analytics) */
function renderGraph(page) {
  const g = D.graph;
  const kali = Math.floor(KECIL.porsi_aging_pct / BESAR.porsi_aging_pct);
  pertanyaan(page, "Apakah semua toko perlu dikirimi barang dengan cara yang sama?",
    `**Tidak.** Di ${KECIL.nama}, ${pct(KECIL.porsi_aging_pct)} stok sudah jadi aging stock, lebih dari ${kali} kali ${BESAR.nama.toLowerCase()} (${pct(BESAR.porsi_aging_pct)}). ` +
    "Toko kecil menjual sekitar sepersepuluh toko besar, jadi kirimannya juga perlu lebih sedikit.");
  bantu(page, "Toko dikelompokkan otomatis menurut **kemiripan barang yang laku** dalam 12 bulan terakhir, bukan menurut lokasi. " +
    "Toko dalam satu kelompok punya pola belanja pembeli yang mirip, jadi bisa diberi aturan kiriman yang sama.");

  // the three store groups
  const byK = {};
  STOK.filter((r) => kelompokCocok(r.kelompok)).forEach((r) => {
    const v = (byK[STORE[r.kode_toko].komunitas] ||= { unit: 0, aging: 0 }); v.unit += r.unit_stok; v.aging += r.unit_aging; });
  page.append(el("div", { class: "kelompok-kartu" }, D.communities.map((c) => {
    const toko = STORES.filter((s) => s.komunitas === c.id).map((s) => s.kode_toko).sort();
    const v = byK[c.id] || { unit: 0, aging: 0 };
    const redup = adaFilterToko() && !toko.some(tokoCocok);
    const dd = el("dd", { class: "kk-toko" });
    toko.forEach((k, i) => { if (i) dd.append(", "); dd.append(entLink("toko", k, nomorToko(k))); });
    return el("article", { class: "kk" + (redup ? " dim" : ""), style: `--c:${komVar(c.id)}` },
      el("h3", {}, el("i", { class: "kk-dot" }), c.nama),
      rich("div", `${c.jumlah_toko} toko · zona ${c.zona.split("; ").map((z) => z.replace(/ (\d+)$/, " ($1)")).join(", ")}`, { class: "kk-sub" }),
      el("div", { class: "kk-angka", text: v.unit ? pct((100 * v.aging) / v.unit) : "–" }),
      el("div", { class: "kk-ket", text: `stoknya sudah jadi aging stock${state.kelompok ? ` (${state.kelompok})` : ""}` }),
      el("dl", {},
        el("dt", { text: "Penjualan per toko setahun" }), el("dd", { text: `sekitar ${num(c.median_qty_12_bulan)} pcs` }),
        el("dt", { text: "Aging stock terbanyak" }), el("dd", {}, entLink("kelompok", c.kelompok_aging_terbesar)),
        el("dt", { text: "Nomor toko" }), dd));
  })));

  // the interactive network
  const hl = adaFilterToko() ? (s) => tokoCocok(s.kode_toko) : null;
  card(figur(page, "c-network"), {
    judul: "Peta kemiripan toko",
    desc: "Tiap titik = 1 toko. Garis menghubungkan toko yang barang lakunya mirip (makin tebal, makin mirip). Titik besar = toko yang mirip dengan banyak toko lain.",
    plot: (h) => network(h, { highlight: hl }),
    legend: komLegend("dot"),
    table: () => simpleTable([{ key: "kode_toko", label: "Toko", render: (r) => entLink("toko", r.kode_toko) }, { key: "zona", label: "Zona", render: (r) => entLink("zona", r.zona) },
      { key: "komunitas", label: "Kelompok toko", render: (r) => chip(komVar(r.komunitas), KOM[r.komunitas].nama) },
      { key: "pagerank", label: "Skor keterhubungan (PageRank)", num: 1, fmt: (v) => num(v, 3) }], [...STORES].sort((p, q) => p.komunitas - q.komunitas || q.pagerank - p.pagerank)),
  });

  const g2 = kisi(page);
  // scatter: sales volume vs aging share
  const qty = {};
  JUAL.filter((r) => r.bulan > D.meta.posisi_stok.slice(0, 7).replace(/^(\d{4})/, (y) => String(+y - 1)) && kelompokCocok(r.kelompok))
    .forEach((r) => { qty[r.kode_toko] = (qty[r.kode_toko] || 0) + r.qty; });
  const byT = kelompokkan(STOK.filter((r) => kelompokCocok(r.kelompok)), (r) => r.kode_toko);
  const titik = STORES.map((s) => ({ label: s.kode_toko, x: qty[s.kode_toko] || 0, y: byT[s.kode_toko]?.unit ? (100 * byT[s.kode_toko].aging) / byT[s.kode_toko].unit : null,
    r: byT[s.kode_toko]?.unit || 0, color: komVar(s.komunitas), kom: s.komunitas, zona: s.zona, aging: byT[s.kode_toko]?.aging || 0,
    dim: adaFilterToko() && !tokoCocok(s.kode_toko), pilih: state.toko === s.kode_toko }));
  const tot = Object.values(byT), rataY = (100 * jumlah(tot, "aging")) / (jumlah(tot, "unit") || 1);
  const kecilDiAtas = titik.filter((d) => d.kom === KECIL.id && d.y > rataY).length;
  const terkiri = [...titik].sort((p, q) => p.x - q.x).slice(0, KECIL.jumlah_toko).every((d) => d.kom === KECIL.id);
  card(figur(g2, "c-sebar"), {
    judul: "Toko yang penjualannya kecil, aging stock-nya tinggi",
    desc: "Tiap titik = 1 toko. Makin ke kiri, makin sedikit penjualannya. Makin ke atas, makin banyak aging stock-nya. Klik titik untuk melihat toko itu saja.",
    plot: (h) => scatter(h, titik, { rataY, onClick: (d) => terapkanEntitas("toko", d.label, { gulir: false }),
      tip: (d) => [[d.color, KOM[d.kom].nama, null], [null, "Zona", d.zona], [null, "Terjual 12 bulan", num(d.x) + " pcs"],
        [null, "Aging stock", `${pct(d.y)} (${num(d.aging)} dari ${num(d.r)} unit)`]] }),
    legend: komLegend("dot"),
    table: () => simpleTable([{ key: "label", label: "Toko", render: (r) => entLink("toko", r.label) },
      { key: "kom", label: "Kelompok toko", render: (r) => chip(komVar(r.kom), KOM[r.kom].nama) },
      { key: "x", label: "Terjual 12 bulan (pcs)", num: 1, fmt: num }, { key: "y", label: "Aging stock", num: 1, fmt: (v) => pct(v) },
      { key: "r", label: "Semua stok (unit)", num: 1, fmt: num }], [...titik].sort((p, q) => p.x - q.x)),
    catatan: `**${kecilDiAtas} dari ${KECIL.jumlah_toko} ${KECIL.nama}** punya aging stock di atas rata-rata (${pct(rataY)}).` +
      (terkiri ? " Keenamnya juga toko dengan penjualan paling sedikit (paling kiri)." : ""),
  });
  // matrix: product group x store group
  const sel = {};
  STOK.forEach((r) => { const k = r.kelompok + "|" + STORE[r.kode_toko].komunitas; const v = (sel[k] ||= { unit: 0, aging: 0 }); v.unit += r.unit_stok; v.aging += r.unit_aging; });
  const totG = kelompokkan(STOK, (r) => r.kelompok);
  const baris = KELOMPOK.map((k) => ({ label: k, p: totG[k].aging / totG[k].unit, dim: state.kelompok && k !== state.kelompok, pilih: state.kelompok === k }))
    .sort((p, q) => q.p - p.p);
  const kolom = D.communities.map((c) => ({ label: c.nama, id: c.id, color: komVar(c.id),
    dim: adaFilterToko() && !STORES.some((s) => s.komunitas === c.id && tokoCocok(s.kode_toko)) }));
  const pSel = (gr, id) => { const v = sel[gr + "|" + id]; return v?.unit ? (100 * v.aging) / v.unit : null; };
  const grpKecil = KELOMPOK.filter((k) => pSel(k, KECIL.id) != null);
  const di90 = grpKecil.filter((k) => pSel(k, KECIL.id) >= 90).length;
  const rata2 = KELOMPOK.filter((k) => totG[k].unit >= 100)
    .map((k) => ({ k, min: Math.min(...D.communities.map((c) => pSel(k, c.id)).filter((v) => v != null)) })).filter((x) => x.min >= 60);
  card(figur(g2, "c-matriks"), {
    judul: "Barang apa yang menumpuk di tiap kelompok toko?", desc: "Persentase stok yang sudah jadi aging stock (lihat skala warna di bawah). Klik nama product group untuk melihat datanya saja.",
    plot: (h) => matrixHeat(h, baris, kolom, (b, k) => sel[b.label + "|" + k.id], { onBaris: (b) => terapkanEntitas("kelompok", b.label, { gulir: false }) }),
    legend: el("div", { class: "legend" }, el("span", {}, "0%"),
      el("i", { class: "skala", style: `background:linear-gradient(90deg, ${campur(0)}, ${campur(1)})` }), el("span", {}, "100% aging stock")),
    table: () => simpleTable([{ key: "label", label: "Product group", render: (r) => entLink("kelompok", r.label) },
      ...kolom.map((k) => ({ key: "k" + k.id, label: k.label, num: 1, render: (r) => { const v = sel[r.label + "|" + k.id]; return v?.unit ? `${pct((100 * v.aging) / v.unit)} (${num(v.unit)} unit)` : "–"; } }))], baris),
    catatan: `Di **${KECIL.nama}**, ${di90} dari ${grpKecil.length} product group sudah 90% lebih jadi aging stock. Jadi masalahnya bukan satu jenis barang, tetapi jumlah kirimannya yang terlalu banyak.` +
      (rata2.length ? ` ${rata2.map((x) => x.k).join(" dan ")} tinggi di semua kelompok toko (paling rendah ${pct(Math.min(...rata2.map((x) => x.min)), 0)}).` : ""),
  });

  const pusat = [...STORES].sort((p, q) => q.pagerank - p.pagerank).slice(0, 3).map((s) => s.kode_toko);
  langkah(page, "Yang perlu dilakukan", [
    `**Kurangi kiriman ke ${KECIL.nama}**: lebih sedikit jenis SKU dan lebih sedikit unit per SKU. Penjualannya hanya sekitar ${num(KECIL.median_qty_12_bulan)} pcs per toko setahun.`,
    `**Coba barang baru di ${pusat.join(", ")} lebih dulu.** Toko-toko ini mirip dengan banyak toko lain, jadi hasilnya bisa jadi acuan.`,
    "**Atur kiriman per kelompok toko, jangan hanya per zona.** Toko di zona yang sama belum tentu punya pola penjualan yang sama.",
  ]);

  detail(page, "profil-toko", "Data 20 toko", "penjualan, stok, dan aging stock tiap toko", (isi) => {
    const rowsT = STORES.filter((s) => tokoCocok(s.kode_toko)).map((s) => ({ ...s, unit: byT[s.kode_toko]?.unit || 0, aging: byT[s.kode_toko]?.aging || 0,
      porsi: byT[s.kode_toko]?.unit ? (100 * byT[s.kode_toko].aging) / byT[s.kode_toko].unit : null, qty: qty[s.kode_toko] || 0 }));
    const t = el("section", { class: "card table-card" });
    isi.append(t);
    dataTable(t, {
      id: "t-toko", judul: "Data per toko", file: "data_toko.csv", rows: rowsT, sortKey: "porsi",
      desc: `Penjualan 12 bulan terakhir, stok, dan aging stock${state.kelompok ? ` (${state.kelompok})` : ""}. Klik judul kolom untuk mengurutkan.`,
      cols: [{ key: "kode_toko", label: "Toko", render: (r) => entLink("toko", r.kode_toko) }, { key: "zona", label: "Zona", render: (r) => entLink("zona", r.zona) },
        { key: "komunitas", label: "Kelompok toko", render: (r) => chip(komVar(r.komunitas), KOM[r.komunitas].nama) },
        { key: "qty", label: "Terjual 12 bulan (pcs)", num: 1, fmt: num }, { key: "unit", label: "Semua stok (unit)", num: 1, fmt: num },
        { key: "aging", label: "Aging stock (unit)", num: 1, fmt: num }, { key: "porsi", label: "Aging stock (%)", num: 1, fmt: (v) => pct(v) },
        { key: "pagerank", label: "Keterhubungan", num: 1, fmt: (v) => num(v, 3) }],
    });
  });
  detail(page, "graph-teknis", "Cara kelompok toko dibentuk", "untuk tim data", (isi) => {
    isi.append(el("ul", { class: "teknis" },
      rich("li", "Graph bipartit toko–SKU dari qty terjual 12 bulan terakhir diproyeksikan menjadi graph toko–toko; tiap toko = vektor SKU berbobot log(1 + qty), kemiripan = cosine similarity."),
      rich("li", "Tiap toko dihubungkan ke 4 tetangga paling mirip (k-nearest neighbors), lalu dijalankan Louvain community detection dan PageRank berbobot."),
      rich("li", `Modularity ${num(g.modularitas, 2)}; partisi yang sama muncul pada ${pct(100 * g.porsi_seed, 0)} dari 100 seed. Kesesuaian dengan zona: ARI ${num(g.ari_zona, 2)}, NMI ${num(g.nmi_zona, 2)} (1 = sama persis dengan zona).`),
      rich("li", "Skor keterhubungan = PageRank: toko yang terhubung dengan banyak toko mirip, yang juga terhubung baik, mendapat nilai tinggi.")));
  });
}

/* ================================================================== page: Pindahkan stok (inter-store transfer) */
function renderTransfer(page) {
  const rows = TRANSFER.filter((r) => (tokoCocok(r.kode_toko) || tokoCocok(r.toko_penerima)) && kelompokCocok(r.kelompok));
  const unit = jumlah(rows, "unit_dipindah");
  const antar = jumlah(rows.filter((r) => r.zona_asal !== r.zona_penerima), "unit_dipindah");
  const s = Object.fromEntries(SCOPE.map((x) => [x.penerima_dicari_di, x]));
  const kom = s["komunitas penjualan yang sama"], zona = s["zona yang sama"], semua = s["semua toko"];
  pertanyaan(page, "Aging stock mana yang bisa dipindah ke toko lain?",
    rows.length ? `${awalan()}**${num(unit)} unit aging stock bisa dipindah ke toko lain yang masih bisa menjualnya.**${adaFilter() ? "" : ` Itu ${pct(kom.pct_unit)} dari semua aging stock.`}`
      : `${awalan()}tidak ada kiriman untuk pilihan ini.`);
  bantu(page, "Toko penerima dipilih dari kelompok toko yang sama. Syaratnya: toko itu **sudah tidak punya stok SKU tersebut, tetapi masih menjualnya dalam 90 hari terakhir.** " +
    "Jumlah kiriman tidak lebih dari penjualan 90 hari toko penerima, supaya barangnya benar-benar laku.");
  kpis(page, [
    ["Unit bisa dipindah", num(unit), adaFilterToko() ? "dari atau ke toko yang dipilih" : "ke toko dalam kelompok yang sama"],
    ["Jumlah baris kiriman", num(rows.length), "1 baris = 1 SKU dari 1 toko ke 1 toko"],
    ["Toko pengirim → penerima", `${num(new Set(rows.map((r) => r.kode_toko)).size)} → ${num(new Set(rows.map((r) => r.toko_penerima)).size)}`, "toko"],
    ["Kiriman ke zona lain", unit ? pct((100 * antar) / unit, 0) : "–", `${num(antar)} unit`]]);

  const g1 = kisi(page);
  const nama = { "semua toko": ["Semua toko", "tanpa batasan"], "komunitas penjualan yang sama": ["Kelompok toko yang sama", "toko dengan penjualan mirip"], "zona yang sama": ["Zona yang sama", "toko di wilayah yang sama"] };
  const mRows = SCOPE.map((x) => ({ nama: nama[x.penerima_dicari_di][0], ket: nama[x.penerima_dicari_di][1], pk: x.pct_unit_punya_kandidat, pp: x.pct_unit,
    kandidat: x.unit_punya_kandidat, pindah: x.unit_dapat_dipindah, dipakai: x === kom }));
  card(figur(g1, "c-cakupan"), {
    judul: "Sebaiknya cari toko penerima di mana?", badge: `Semua ${D.meta.jumlah_toko} toko · tidak berubah oleh filter`,
    desc: "Persentase dari semua aging stock (batang penuh = 100%)",
    plot: (h) => meters(h, mRows),
    legend: legendBox([["var(--accent)", "Bisa dipindah"], ["var(--band-1)", "Ada toko penerima, tetapi melebihi penjualannya"]]),
    table: () => simpleTable([{ key: "nama", label: "Cari penerima di" }, { key: "kandidat", label: "Ada toko penerima (unit)", num: 1, fmt: num },
      { key: "pk", label: "%", num: 1, fmt: (v) => pct(v) }, { key: "pindah", label: "Bisa dipindah (unit)", num: 1, fmt: num }, { key: "pp", label: "%", num: 1, fmt: (v) => pct(v) }], mRows),
    catatan: `Dashboard ini memakai **kelompok toko yang sama**. Hasilnya ${num(kom.unit_dapat_dipindah - zona.unit_dapat_dipindah)} unit lebih banyak daripada jika dicari di zona yang sama. ` +
      `Mencari di semua toko memang memberi ${num(semua.unit_dapat_dipindah)} unit, tetapi tokonya kurang mirip.`,
  });
  card(figur(g1, "c-sankey"), {
    judul: "Barang dikirim dari zona mana ke zona mana?", desc: "Makin lebar alirannya, makin banyak unit yang dikirim. Biru = ke zona lain, abu-abu = di zona yang sama. Klik nama zona untuk melihat zona itu saja.",
    plot: (h) => sankey(h, rows, { onZona: (z) => terapkanEntitas("zona", z, { gulir: false }) }),
    legend: legendBox([["var(--accent)", "Ke zona lain"], ["var(--deemph)", "Di zona yang sama"]]),
    table: () => {
      const agg = {};
      rows.forEach((r) => { const k = r.zona_asal + "|" + r.zona_penerima; (agg[k] ||= { asal: r.zona_asal, ke: r.zona_penerima, unit: 0 }).unit += r.unit_dipindah; });
      return simpleTable([{ key: "asal", label: "Dari zona", render: (r) => entLink("zona", r.asal) }, { key: "ke", label: "Ke zona", render: (r) => entLink("zona", r.ke) },
        { key: "unit", label: "Unit", num: 1, fmt: num }], Object.values(agg).sort((p, q) => q.unit - p.unit));
    },
    catatan: unit ? `**${pct((100 * antar) / unit, 0)} unit dikirim ke zona lain**, karena toko yang mirip tidak selalu berada di zona yang sama.` : null,
  });

  langkah(page, "Yang perlu dilakukan", [
    "**Kirim mulai dari baris dengan unit terbanyak dan barang yang paling lama di toko.**",
    "**Untuk kiriman ke zona lain, hitung dulu ongkos kirimnya.** Kirim jika ongkosnya lebih kecil daripada diskon yang harus diberikan kalau barang tetap di toko asal.",
    "**Hentikan kiriman SKU yang sama ke toko pengirim**, supaya aging stock tidak menumpuk lagi di sana.",
  ]);

  const t = el("section", { class: "card table-card" });
  page.append(t);
  dataTable(t, {
    id: "t-transfer", judul: "Daftar kiriman antartoko", file: "daftar_kiriman.csv", rows, sortKey: "unit_dipindah",
    desc: "1 baris = 1 SKU dari 1 toko pengirim ke 1 toko penerima. Klik judul kolom untuk mengurutkan ulang.",
    cols: [{ key: "kode_toko", label: "Dari toko", render: (r) => entLink("toko", r.kode_toko) },
      { key: "toko_penerima", label: "Ke toko", render: (r) => entLink("toko", r.toko_penerima) },
      { key: "zona_penerima", label: "Zona", render: (r) => r.zona_asal === r.zona_penerima ? el("span", { class: "muted", text: "zona sama" }) :
        el("span", {}, entLink("zona", r.zona_asal), " → ", entLink("zona", r.zona_penerima)) },
      { key: "kelompok", label: "Product group", render: (r) => entLink("kelompok", r.kelompok) }, { key: "kode_sku", label: "SKU" },
      { key: "unit_dipindah", label: "Unit dikirim", num: 1, fmt: num }, { key: "umur_hari", label: "Lama di toko (hari)", num: 1, fmt: num },
      { key: "stok", label: "Stok di pengirim", num: 1, fmt: num }, { key: "qty_90_hari", label: "Terjual 90 hari di penerima", num: 1, fmt: num }],
  });

  detail(page, "aliran-toko", "Kiriman antartoko", "toko pengirim × toko penerima", (isi) => {
    card(figur(isi, "c-heat"), {
      judul: "Unit yang dikirim antartoko", desc: "Baris = toko pengirim, kolom = toko penerima. Warna kotak = jumlah unit (lihat skala di bawah). Garis warna di tepi = kelompok toko.",
      plot: (h) => heatmap(h, rows),
      table: () => {
        const agg = {};
        rows.forEach((r) => { const k = r.kode_toko + "|" + r.toko_penerima; (agg[k] ||= { asal: r.kode_toko, ke: r.toko_penerima, unit: 0, sku: 0 }); agg[k].unit += r.unit_dipindah; agg[k].sku += 1; });
        return simpleTable([{ key: "asal", label: "Dari toko", render: (r) => entLink("toko", r.asal) }, { key: "ke", label: "Ke toko", render: (r) => entLink("toko", r.ke) },
          { key: "sku", label: "SKU", num: 1, fmt: num }, { key: "unit", label: "Unit", num: 1, fmt: num }], Object.values(agg).sort((p, q) => q.unit - p.unit));
      },
    });
  });
  detail(page, "transfer-teknis", "Cara jumlah kiriman dihitung", "untuk tim data", (isi) => {
    isi.append(el("ul", { class: "teknis" },
      rich("li", "Untuk tiap SKU dibentuk jaringan aliran: sumber → toko pengirim (kapasitas = unit aging stock) → toko penerima (kapasitas = qty terjual 90 hari terakhir) → tujuan."),
      rich("li", "Toko penerima hanya toko yang tidak lagi memegang stok SKU itu tetapi masih menjualnya dalam 90 hari terakhir, dan berada dalam kelompok toko (community) yang sama."),
      rich("li", "Jumlah kiriman = maximum flow pada jaringan itu, sehingga tidak ada toko penerima yang dikirimi melebihi penjualannya.")));
  });
}

/* ================================================================== page: Tentang data */
function renderTentang(page) {
  const m = D.model;
  const isi = el("div", { class: "prose" });
  page.append(isi);
  isi.append(
    el("h2", { text: "Tentang data dan istilah" }),
    el("p", { text: `Data berasal dari ${D.meta.perusahaan} (nama samaran), ${D.meta.kategori}, contoh ${D.meta.jumlah_toko} toko. ` +
      `Data penjualan ${tanggal(D.meta.periode_penjualan[0])}–${tanggal(D.meta.periode_penjualan[1])}, posisi stok ${tanggal(D.meta.posisi_stok)}. ` +
      "Kode toko, SKU, dan merek sudah disamarkan. Semua angka hanya berlaku untuk 20 toko ini." }),
    el("h3", { text: "Istilah" }),
    el("dl", { class: "istilah" },
      el("dt", { text: "Aging stock" }), el("dd", { text: `Barang yang sudah lebih dari ${D.meta.aging_hari} hari di toko dan belum terjual.` }),
      el("dt", { text: "SKU baru di toko" }), el("dd", { text: "Satu SKU yang mulai dijual di satu toko. Jika 1 SKU dijual di 5 toko, dihitung 5." }),
      el("dt", { text: "Skor risiko (0–100)" }), el("dd", { text: `Perkiraan seberapa besar kemungkinan barang tidak habis dalam ${D.meta.aging_hari} hari. Dihitung setelah barang dijual 8 minggu. Skor ${AMBANG100} ke atas = berisiko.` }),
      el("dt", { text: "Prioritas" }), el("dd", { text: "Tinggi = 10% skor paling tinggi. Sedang = 20% berikutnya. Rendah = sisanya." }),
      el("dt", { text: "Kelompok toko" }), el("dd", { text: "Kumpulan toko yang barang lakunya mirip. Dibentuk otomatis dari data penjualan, bukan dari lokasi." }),
      el("dt", { text: "Hierarki Lama" }), el("dd", { text: `${HL.sku} SKU lama (dibuat ${HL.tahun.join("–")}) yang masih memakai kode produk lama. Kodenya tidak cocok dengan product group sekarang, jadi digabung menjadi satu kelompok. Stoknya tinggal ${num(HL.unit)} unit (${pct((100 * HL.unit) / jumlah(STOK, "unit_stok"))} dari semua stok), jadi tidak perlu jadi prioritas.` }),
      el("dt", { text: "Daftar kiriman" }), el("dd", { text: "Usulan memindahkan aging stock ke toko lain di kelompok yang sama. Toko penerima sudah tidak punya stok SKU itu, tetapi masih menjualnya dalam 90 hari terakhir." })),
    el("h3", { text: "Metode singkat (untuk tim data)" }),
    el("ul", {},
      el("li", { text: `Machine learning: ${m.nama}; pada data uji PR-AUC ${num(m.pr_auc, 3)} dibanding baseline ${num(m.baseline, 3)}, recall ${pct(100 * m.recall)}, precision ${pct(100 * m.precision)}.` }),
      el("li", { text: `Graph analytics: graph toko–toko (cosine similarity, 4 tetangga terdekat), Louvain community detection (modularity ${num(D.graph.modularitas, 2)}), dan PageRank.` }),
      el("li", { text: "Pemindahan stok: maximum flow per SKU; batas penerima = qty terjual 90 hari terakhir." }),
      el("li", { text: "Data diolah dengan pandas, scikit-learn, dan Spark di Google Colab. Dashboard ini hanya memuat hasil ringkasnya." })),
    el("h3", { text: "Sumber" }),
    el("p", {}, "Notebook yang sudah dijalankan: ",
      el("a", { href: "https://colab.research.google.com/drive/1oNIgD7Nkw7kk5W3Grt42HiP-8syen4c_", target: "_blank", rel: "noopener" }, "Google Colab"),
      " · Dataset contoh: ",
      el("a", { href: "https://drive.google.com/drive/folders/12EAO3ClUZdPAn4ffc8pqhYvJdBns0k6L", target: "_blank", rel: "noopener" }, "Google Drive"), "."));
}

/* ================================================================== wiring */
const RENDER = { ringkasan: renderRingkasan, ml: renderML, graph: renderGraph, transfer: renderTransfer, tentang: renderTentang };
function tandaiFilter() {
  [["f-zona", state.zona], ["f-toko", state.toko], ["f-kelompok", state.kelompok]].forEach(([id, v]) =>
    document.getElementById(id).parentElement.classList.toggle("aktif", Boolean(v)));
  document.getElementById("f-reset").disabled = !adaFilter();
  const r = document.getElementById("f-ringkas");
  r.classList.toggle("aktif", adaFilter());
  r.textContent = ringkasFilter();
}
function renderAktif() {
  hideTip();
  tandaiFilter();
  const page = document.getElementById("isi-" + state.tab);
  const y = window.scrollY;
  page.style.minHeight = page.offsetHeight + "px";
  page.replaceChildren();
  RENDER[state.tab](page);
  page.style.minHeight = "";
  window.scrollTo(0, y);
}
function isiFilter() {
  const opt = (v, t) => el("option", { value: v, text: t });
  const fz = document.getElementById("f-zona"), ft = document.getElementById("f-toko"), fk = document.getElementById("f-kelompok");
  fz.replaceChildren(opt("", "Semua zona"), ...ZONA.map((z) => opt(z, z)));
  const tokoList = STORES.filter((s) => !state.zona || s.zona === state.zona).map((s) => s.kode_toko).sort();
  if (state.toko && !tokoList.includes(state.toko)) state.toko = "";
  ft.replaceChildren(opt("", state.zona ? `Semua toko di ${state.zona}` : "Semua toko"), ...tokoList.map((t) => opt(t, `${t} · ${KOM[STORE[t].komunitas].nama}`)));
  fk.replaceChildren(opt("", "Semua product group"), ...KELOMPOK.map((k) => opt(k, k)));
  fz.value = state.zona; ft.value = state.toko; fk.value = state.kelompok;
}
function pilihTab(tab, dariPengguna = false) {
  state.tab = tab;
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => {
    const aktif = b.id === "tab-" + tab;
    b.setAttribute("aria-selected", String(aktif));
    b.tabIndex = aktif ? 0 : -1;                         // roving tabindex: one tab stop for the tab list
    if (aktif) b.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== "panel-" + tab; });
  document.querySelector(".filters").style.display = tab === "tentang" ? "none" : "";
  try { history.replaceState(null, "", "#" + tab); } catch (e) { /* ignore */ }
  renderAktif();
  // a new view starts at its top: bring the content back under the sticky tab bar
  const atas = document.querySelector(".top").offsetHeight;
  if (dariPengguna && window.scrollY > atas) window.scrollTo({ top: atas, behavior: "auto" });
}
function tema() {
  // light by default; the button shows the mode it switches to (moon in light mode, sun in dark mode)
  const btn = document.getElementById("tema");
  let gelap = false;
  try { gelap = localStorage.getItem("tema") === "gelap"; } catch (e) { /* ignore */ }
  const terapkan = () => {
    document.documentElement.setAttribute("data-theme", gelap ? "dark" : "light");
    const label = gelap ? "Aktifkan mode terang" : "Aktifkan mode gelap";
    btn.setAttribute("aria-pressed", String(gelap));
    btn.setAttribute("aria-label", label);
    btn.title = label;
  };
  terapkan();
  btn.addEventListener("click", () => {
    gelap = !gelap;
    try { localStorage.setItem("tema", gelap ? "gelap" : "terang"); } catch (e) { /* ignore */ }
    terapkan();
    renderAktif();                                       // sequential fills are computed from the tokens
  });
}
function init() {
  document.getElementById("subjudul").textContent =
    `${D.meta.kategori} · ${D.meta.perusahaan} (nama samaran) · sampel ${D.meta.jumlah_toko} toko`;
  document.getElementById("chip-posisi").lastChild.textContent = `Posisi stok ${tanggal(D.meta.posisi_stok)}`;
  document.getElementById("kaki").textContent =
    `Data dibangun ${tanggal(D.meta.dibuat)} dari hasil notebook. Angka hanya untuk sampel ${D.meta.jumlah_toko} toko; seluruh identitas disamarkan.`;
  isiFilter();
  document.getElementById("f-zona").addEventListener("change", (e) => { state.zona = e.target.value; isiFilter(); renderAktif(); });
  document.getElementById("f-toko").addEventListener("change", (e) => { state.toko = e.target.value; renderAktif(); });
  document.getElementById("f-kelompok").addEventListener("change", (e) => { state.kelompok = e.target.value; renderAktif(); });
  document.getElementById("f-reset").addEventListener("click", () => {
    const lama = { zona: state.zona, toko: state.toko, kelompok: state.kelompok };
    state.zona = state.toko = state.kelompok = ""; isiFilter(); renderAktif();
    toast("Kembali ke semua data", () => { Object.assign(state, lama); isiFilter(); renderAktif(); });
  });
  const tabs = [...document.querySelectorAll(".tabs [role=tab]")];
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => pilihTab(b.id.replace("tab-", ""), true));
    b.addEventListener("keydown", (e) => {
      let n = null;
      if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") n = tabs[(i + tabs.length - 1) % tabs.length];
      else if (e.key === "Home") n = tabs[0];
      else if (e.key === "End") n = tabs[tabs.length - 1];
      if (!n) return;
      e.preventDefault(); n.focus(); n.click();
    });
  });
  tema();
  const bar = document.querySelector(".tabs");
  const tandaiGeser = () => {
    const kiri = bar.scrollLeft > 12, kanan = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4;
    bar.dataset.geser = [kiri && "kiri", kanan && "kanan"].filter(Boolean).join(" ");
  };
  bar.addEventListener("scroll", tandaiGeser, { passive: true });
  window.addEventListener("resize", tandaiGeser);
  requestAnimationFrame(tandaiGeser);
  let lebar = window.innerWidth, t;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lebar) < 8) return;
    lebar = window.innerWidth; clearTimeout(t); t = setTimeout(renderAktif, 150);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
  const awal = (location.hash || "").slice(1);
  pilihTab(RENDER[awal] ? awal : "ringkasan");
}
init();
