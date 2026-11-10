// Proje takvimi (Gantt) için saf yardımcılar: gün hesabı, ölçekler, başlık
// birimleri, şerit yerleşimi, sürükle-bırak sonucu, yoğunluk, Excel satırları ve
// yazdırma / PDF için bağımsız HTML (ganttHtml). Web sürümüyle aynı kurallar
// (elitlig-client …/projects/timeline/timelineUtils.js). Gün dizgileri UTC ile hesaplanır.

export const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");
export const parseDay = (day) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day, n) => new Date(parseDay(day) + Math.round(n) * DAY_MS).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
export const localDay = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const todayDay = () => localDay(new Date());
const parts = (day) => day.split("-").map(Number);
const dayFrom = (y, m, d = 1) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
/** Pazartesi = 0 */
export const weekdayIndex = (day) => (new Date(parseDay(day)).getUTCDay() + 6) % 7;

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export const formatDay = (day, { year = true } = {}) => {
  if (!day) return "—";
  const [y, m, d] = parts(day);
  return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ""}`;
};
export const formatRange = (a, b) => (a === b ? formatDay(a) : `${formatDay(a, { year: a.slice(0, 4) !== b.slice(0, 4) })} – ${formatDay(b)}`);

/** Ölçekler: px = gün başına piksel; months / days = görünen pencere. */
export const SCALES = {
  week: { key: "week", label: "Hafta", px: 40, days: 35 },
  month: { key: "month", label: "Ay", px: 12, months: 4 },
  quarter: { key: "quarter", label: "Çeyrek", px: 4, months: 12 },
  year: { key: "year", label: "Yıl", px: 1.6, months: 24 },
};
export const SCALE_KEYS = Object.keys(SCALES);

/** Ölçeğin, bir gün çevresindeki görünür penceresi: { from, to, days }. */
export function windowFor(scaleKey, anchor = todayDay()) {
  const scale = SCALES[scaleKey] || SCALES.month;
  const [y, m] = parts(anchor);
  let from;
  let to;
  if (scale.key === "week") {
    from = addDays(anchor, -weekdayIndex(anchor) - 7);
    to = addDays(from, scale.days - 1);
  } else {
    const startMonth = scale.key === "month" ? m : scale.key === "quarter" ? m - ((m - 1) % 3) : 1;
    from = dayFrom(y, startMonth);
    to = addDays(dayFrom(y, startMonth + scale.months), -1);
  }
  return { from, to, days: diffDays(from, to) + 1 };
}

/** Önceki / sonraki pencere için yeni çapa günü. */
export function shiftAnchor(scaleKey, anchor, dir) {
  if (scaleKey === "week") return addDays(anchor, 7 * dir);
  const [y, m, d] = parts(anchor);
  const step = scaleKey === "month" ? 1 : scaleKey === "quarter" ? 3 : 12;
  return dayFrom(y, m + step * dir, Math.min(d, 28));
}

/** Başlık birimleri: üst ve alt satır, her biri { key, label, start (gün indeksi), span }. */
export function headerUnits(scaleKey, from, days) {
  const top = [];
  const bottom = [];
  const push = (list, key, label, index) => {
    const last = list[list.length - 1];
    if (last && last.key === key) last.span += 1;
    else list.push({ key, label, start: index, span: 1 });
  };
  for (let i = 0; i < days; i += 1) {
    const day = addDays(from, i);
    const [y, m, d] = parts(day);
    const q = Math.floor((m - 1) / 3) + 1;
    if (scaleKey === "week") {
      push(top, `${y}-${m}`, `${MONTHS_LONG[m - 1]} ${y}`, i);
      push(bottom, day, String(d), i);
    } else if (scaleKey === "month") {
      push(top, `${y}-${m}`, `${MONTHS_LONG[m - 1]} ${y}`, i);
      const monday = addDays(day, -weekdayIndex(day));
      push(bottom, monday, formatDay(monday < from ? from : monday, { year: false }), i);
    } else if (scaleKey === "quarter") {
      push(top, `${y}-q${q}`, `${y} · ${q}. çeyrek`, i);
      push(bottom, `${y}-${m}`, MONTHS[m - 1], i);
    } else {
      push(top, `${y}`, String(y), i);
      push(bottom, `${y}-q${q}`, `Ç${q}`, i);
    }
  }
  return { top, bottom };
}

/** Aralığı pencereye kırpar: { start, span } gün indeksi ya da görünmüyorsa null. */
export function clip(startDay, endDay, from, days) {
  const s = diffDays(from, startDay);
  const e = diffDays(from, endDay);
  if (e < 0 || s > days - 1) return null;
  const cs = Math.max(0, s);
  const ce = Math.min(days - 1, e);
  return { start: cs, span: ce - cs + 1, cutStart: s < 0, cutEnd: e > days - 1 };
}

/** Çakışan çubukları alt alta şeritlere dizer (açgözlü). Döner: { items: [{...p, lane}], lanes }. */
export function packLanes(periods) {
  const ends = [];
  const items = periods
    .slice()
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || b.end_date.localeCompare(a.end_date) || a.id - b.id)
    .map((p) => {
      let lane = ends.findIndex((end) => end < p.start_date);
      if (lane < 0) { lane = ends.length; ends.push(p.end_date); } else ends[lane] = p.end_date;
      return { ...p, lane };
    });
  return { items, lanes: Math.max(1, ends.length) };
}

/**
 * Sürükleme sonucu. mode: "move" (taşı), "start" (sol kenar), "end" (sağ kenar).
 * Kilometre taşı her zaman taşınır; kenar sürüklemesi aralığı ters çeviremez.
 */
export function dragResult(period, mode, delta) {
  const d = Math.round(delta) || 0;
  if (period.kind === "milestone" || mode === "move") {
    const start = addDays(period.start_date, d);
    return { start_date: start, end_date: period.kind === "milestone" ? start : addDays(period.end_date, d) };
  }
  if (mode === "start") {
    const start = addDays(period.start_date, d);
    return { start_date: start > period.end_date ? period.end_date : start, end_date: period.end_date };
  }
  const end = addDays(period.end_date, d);
  return { start_date: period.start_date, end_date: end < period.start_date ? period.start_date : end };
}

/** Boş alanda sürükleyerek seçilen aralık (gün indeksleri → gün dizgileri). */
export function rangeFromIndexes(from, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { start_date: addDays(from, lo), end_date: addDays(from, hi) };
}

/**
 * Yoğunluk: seçilen evredeki (varsayılan organizasyon = execution) dönemlerin
 * gün gün kaç projede aynı anda sürdüğü; ardışık aynı küme tek aralık.
 * Sunucudaki services/projectTimeline.js loadOf ile aynı kural.
 */
export function computeLoad(projects, { stage = "execution", from = null, to = null } = {}) {
  const map = new Map();
  for (const pr of projects) {
    for (const p of pr.periods || []) {
      if (p.kind !== "period" || (stage && p.stage !== stage)) continue;
      const s = from && p.start_date < from ? from : p.start_date;
      const e = to && p.end_date > to ? to : p.end_date;
      for (let d = s, i = 0; d <= e && i < 4000; d = addDays(d, 1), i += 1) {
        if (!map.has(d)) map.set(d, new Set());
        map.get(d).add(pr.id);
      }
    }
  }
  const out = [];
  for (const d of [...map.keys()].sort()) {
    const ids = [...map.get(d)].sort((a, b) => a - b);
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d && last.project_ids.join() === ids.join()) last.to = d;
    else out.push({ from: d, to: d, count: ids.length, project_ids: ids });
  }
  return out;
}

/** Süzgeçler: proje, evre, sorumlu. Dönemsiz kalan proje satırı yalnız süzgeç yoksa görünür. */
export function filterProjects(projects, { projectId = "", stage = "", responsibleId = "", onlyPlanned = false } = {}) {
  return projects
    .filter((p) => !projectId || String(p.id) === String(projectId))
    .map((p) => ({ ...p, periods: (p.periods || []).filter((x) => (!stage || x.stage === stage) && (!responsibleId || String(x.responsible_id) === String(responsibleId))) }))
    .filter((p) => (!stage && !responsibleId && !onlyPlanned) || p.periods.length);
}

/** Dönemin dışına taşan adımlar (aşama bağıyla döneme bağlı olanlar). */
export const stepsOutside = (period, steps = []) => steps.filter((s) => s.period_id === period.id && s.period_linked
  && [s.start_date, s.due_date].filter(Boolean).some((d) => d < period.start_date || d > period.end_date));

export const STAGE_LABELS = { idea: "Fikir", planning: "Planlama", preparation: "Hazırlık", execution: "Uygulama", closing: "Kapanış" };

/** Excel / yazdırma için dönem listesi satırları. */
export function periodRows(projects, people = {}) {
  const rows = [];
  for (const pr of projects) {
    const byId = new Map((pr.periods || []).map((p) => [p.id, p]));
    for (const p of pr.periods || []) {
      rows.push({
        project: pr.name,
        kind: p.kind === "milestone" ? "Kilometre taşı" : "Dönem",
        name: p.name,
        stage: STAGE_LABELS[p.stage] || "",
        start: p.start_date,
        end: p.end_date,
        days: diffDays(p.start_date, p.end_date) + 1,
        responsible: (p.responsible_id && people[p.responsible_id]) || p.responsible || "",
        progress: p.kind === "milestone" ? "" : p.progress,
        depends: p.depends_on && byId.get(p.depends_on) ? byId.get(p.depends_on).name : "",
        description: p.description || "",
      });
    }
  }
  return rows;
}

export const PERIOD_COLUMNS = [
  ["Proje", (r) => r.project, 180],
  ["Tür", (r) => r.kind, 110],
  ["Dönem / kilometre taşı", (r) => r.name, 200],
  ["Evre", (r) => r.stage, 100],
  ["Başlangıç", (r) => r.start, 100],
  ["Bitiş", (r) => r.end, 100],
  ["Gün", (r) => r.days, 60],
  ["Sorumlu", (r) => r.responsible, 140],
  ["İlerleme %", (r) => r.progress, 80],
  ["Önce bitmeli", (r) => r.depends, 160],
  ["Açıklama", (r) => r.description, 260],
];

/** Yazdırma: kâğıt genişliği (yatay, 96 dpi, 8 mm kenar boşluğu) → gün başına piksel. */
export const PAPER = { A4: { width: 1060, label: "A4 yatay" }, A3: { width: 1520, label: "A3 yatay" } };
export const printPx = (paper, days, labelWidth) => Math.max(0.5, ((PAPER[paper] || PAPER.A4).width - labelWidth) / Math.max(1, days));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Yazdırma / PDF için bağımsız (betiksiz) HTML: yatay A4 / A3 sayfaya sığan
 * Gantt (projeler satır satır, dönemler renkli çubuk, kilometre taşları elmas,
 * bugün çizgisi) ve altında dönem listesi. Ana süreç gizli pencerede basar.
 */
export function ganttHtml({ projects = [], scale = "month", from, to, paper = "A4", title = "Proje takvimi", people = {}, today = todayDay() }) {
  const days = diffDays(from, to) + 1;
  const LABEL = 190;
  const px = printPx(paper, days, LABEL);
  const W = days * px;
  const { top, bottom } = headerUnits(scale, from, days);
  const unit = (u, h) => `<div class="u" style="left:${(u.start * px).toFixed(1)}px;width:${(u.span * px).toFixed(1)}px;height:${h}px">${u.span * px > 26 ? esc(u.label) : ""}</div>`;
  const ti = diffDays(from, today);
  const rows = projects.map((p) => {
    const ranged = packLanes((p.periods || []).filter((x) => x.kind !== "milestone"));
    const stones = (p.periods || []).filter((x) => x.kind === "milestone");
    const ms = stones.length ? 16 : 0;
    const h = ms + ranged.lanes * 20 + 8;
    const bars = ranged.items.map((x) => {
      const c = clip(x.start_date, x.end_date, from, days);
      if (!c) return "";
      return `<div class="bar" style="left:${(c.start * px).toFixed(1)}px;width:${Math.max(3, c.span * px).toFixed(1)}px;top:${ms + x.lane * 20 + 4}px;background:${esc(x.color)}">${c.span * px > 40 ? esc(x.name) : ""}</div>`;
    }).join("");
    const shown = stones.filter((x) => clip(x.start_date, x.start_date, from, days)).sort((x, y) => x.start_date.localeCompare(y.start_date));
    const dots = shown.map((x, i) => {
      const c = clip(x.start_date, x.start_date, from, days);
      // Yakındaki bir sonraki taşla yazı üst üste binmesin (yalnız elmas).
      const room = shown[i + 1] ? diffDays(x.start_date, shown[i + 1].start_date) * px : Infinity;
      const label = room > x.name.length * 5 + 14 ? `<div class="mst" style="left:${(c.start * px + px / 2 + 8).toFixed(1)}px">${esc(x.name)}</div>` : "";
      return `<div class="ms" style="left:${(c.start * px + px / 2 - 5).toFixed(1)}px;background:${esc(x.color)}" title="${esc(x.name)}"></div>${label}`;
    }).join("");
    return `<div class="row" style="height:${h}px"><div class="lab"><b style="background:${esc(p.color || "#7c3aed")}"></b><span>${esc(p.name)}</span></div><div class="cv" style="width:${W.toFixed(1)}px;height:${h}px">${dots}${bars}</div></div>`;
  }).join("");
  const list = periodRows(projects, people);
  const tr = list.map((r) => `<tr><td>${esc(r.project)}</td><td>${esc(r.kind)}</td><td>${esc(r.name)}</td><td>${esc(r.stage)}</td><td>${esc(formatDay(r.start))}</td><td>${esc(formatDay(r.end))}</td><td class="n">${r.days}</td><td>${esc(r.responsible)}</td><td class="n">${r.progress === "" ? "" : `%${r.progress}`}</td><td>${esc(r.depends)}</td></tr>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${paper === "A3" ? "A3" : "A4"} landscape; margin: 8mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font: 10px -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; }
h1 { font-size: 15px; margin: 0 0 2px; } .sub { color: #555; margin: 0 0 8px; }
.g { position: relative; border: 1px solid #ccc; width: ${(LABEL + W).toFixed(1)}px; }
.hd { display: flex; border-bottom: 1px solid #ccc; background: #f4f4f7; }
.hd .lab { font-weight: 700; }
.sc { position: relative; width: ${W.toFixed(1)}px; height: 36px; }
.sc .r { position: relative; height: 18px; } .u { position: absolute; top: 0; border-left: 1px solid #ddd; padding: 2px 3px; overflow: hidden; white-space: nowrap; font-size: 9px; }
.row { display: flex; border-bottom: 1px solid #eee; break-inside: avoid; }
.lab { width: ${LABEL}px; flex: 0 0 ${LABEL}px; padding: 4px 6px; border-right: 1px solid #ccc; display: flex; gap: 5px; align-items: center; font-weight: 600; overflow: hidden; }
.lab b { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.cv { position: relative; }
.bar { position: absolute; height: 15px; border-radius: 4px; color: #fff; font-size: 8.5px; font-weight: 700; line-height: 15px; padding: 0 4px; overflow: hidden; white-space: nowrap; }
.ms { position: absolute; top: 3px; width: 10px; height: 10px; transform: rotate(45deg); }
.mst { position: absolute; top: 1px; font-size: 8.5px; font-weight: 600; white-space: nowrap; }
.today { position: absolute; top: 0; bottom: 0; border-left: 1.5px solid #ef4444; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; break-before: auto; } th, td { border: 1px solid #ddd; padding: 3px 5px; text-align: left; } th { background: #f4f4f7; } td.n { text-align: right; }
</style></head><body>
<h1>${esc(title)}</h1><p class="sub">${esc(formatRange(from, to))} · ${projects.length} proje · ${list.length} dönem / kilometre taşı · ${paper === "A3" ? "A3" : "A4"} yatay</p>
<div class="g"><div class="hd"><div class="lab">Proje</div><div class="sc"><div class="r">${top.map((u) => unit(u, 18)).join("")}</div><div class="r">${bottom.map((u) => unit(u, 18)).join("")}</div></div></div>
${rows}${ti >= 0 && ti < days ? `<div class="today" style="left:${(LABEL + ti * px + px / 2).toFixed(1)}px"></div>` : ""}</div>
<table><thead><tr><th>Proje</th><th>Tür</th><th>Dönem</th><th>Evre</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Sorumlu</th><th>İlerleme</th><th>Önce bitmeli</th></tr></thead><tbody>${tr}</tbody></table>
</body></html>`;
}
