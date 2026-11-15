// Projeler → künye, yaşam döngüsü, maliyet hesabı ve akış için saf yardımcılar.
// Bağımlılıksızdır; web ve masaüstünde aynı dosya kullanılır
// (web: src/pages/management/tools/projects/lifecycleUtils.js — iki kopya aynı tutulur).

export const STAGE_COLORS = { idea: "#8b5cf6", planning: "#2563eb", preparation: "#0891b2", execution: "#ea580c", closing: "#16a34a" };
export const RISK_COLORS = { low: "#16a34a", medium: "#d97706", high: "#dc2626" };
export const RISK_LABELS = { low: "Düşük", medium: "Orta", high: "Yüksek" };
export const RISK_STATUS_LABELS = { open: "Açık", watching: "İzleniyor", closed: "Kapandı" };
export const POST_KIND_META = {
  announcement: { label: "Duyuru", color: "#db2777" },
  update: { label: "Güncelleme", color: "#2563eb" },
  note: { label: "Not", color: "#64748b" },
  comment: { label: "Yorum", color: "#64748b" },
};
export const COST_STATUS_COLORS = { draft: "#64748b", quoted: "#2563eb", approved: "#7c3aed", paid: "#16a34a", cancelled: "#94a3b8" };

const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const money2Fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

/** Tutar: tam sayıysa kuruşsuz, değilse iki hane. */
export const money = (v) => (v == null || v === "" ? "—" : (Math.abs(Number(v) % 1) > 0.004 ? money2Fmt : moneyFmt).format(Number(v) || 0));
export const num = (v) => (v == null || v === "" ? "—" : numFmt.format(Number(v) || 0));
export const pct = (v) => (v == null ? "—" : `%${numFmt.format(Number(v) || 0)}`);

export const formatDay = (iso, opts = { day: "numeric", month: "long", year: "numeric" }) => {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", opts);
};
export const shortDay = (iso) => formatDay(iso, { day: "numeric", month: "short" });

/** Gün farkı (bugünden). */
export const daysFrom = (iso, today = new Date()) => {
  if (!iso) return null;
  const a = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
};
export const countdownText = (days) => {
  if (days == null) return "";
  if (days === 0) return "Bugün";
  if (days === 1) return "Yarın";
  if (days === -1) return "Dün";
  return days > 0 ? `${days} gün kaldı` : `${-days} gün önce`;
};

/** Ölçütün "Tamamla" hedefi: { type: "brief" | "tab", key }. */
export const targetOf = (target) => {
  const [type, key] = String(target || "").split(":");
  return type && key ? { type, key } : null;
};

export const kpiProgress = (k) => (k && k.target ? Math.max(0, Math.min(100, Math.round(((Number(k.actual) || 0) / Number(k.target)) * 100))) : 0);

/** Proje tarih şeridi: başlangıç → (önemli tarihler) → etkinlik → bitiş, sıralı ve tekil. */
export function timeline(brief = {}) {
  const out = [];
  if (brief.start_date) out.push({ key: "start", label: "Başlangıç", date: brief.start_date, kind: "start" });
  (brief.key_dates || []).forEach((k) => k.date && out.push({ key: k.id, label: k.label, date: k.date, kind: "milestone", done: k.done }));
  if (brief.event_date) out.push({ key: "event", label: "Etkinlik", date: brief.event_date, kind: "event" });
  if (brief.end_date) out.push({ key: "end", label: "Bitiş", date: brief.end_date, kind: "end" });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Şeritteki yerleşim (%), bugün işaretiyle. */
export function timelineLayout(points, today = new Date()) {
  if (!points.length) return { points: [], today: null };
  const t = (iso) => new Date(`${iso}T12:00:00`).getTime();
  const min = t(points[0].date);
  const max = t(points[points.length - 1].date);
  const span = Math.max(1, max - min);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return {
    points: points.map((p) => ({ ...p, at: points.length === 1 ? 50 : ((t(p.date) - min) / span) * 100 })),
    today: now >= min && now <= max && points.length > 1 ? ((now - min) / span) * 100 : null,
  };
}

/** Maliyet kaleminin hesap satırı: "4 gün × 10.000 ₺ × katılımcı (120)". */
export function costLine(item, summary) {
  const q = Number(item.quantity) || 0;
  const parts = [`${num(q)}${item.unit ? ` ${item.unit}` : ""} × ${money(item.unit_price)}`];
  if (item.basis === "per_participant") parts.push(`× ${num(summary?.participants || 0)} katılımcı`);
  if (item.basis === "per_team") parts.push(`× ${num(summary?.teams || 0)} takım`);
  parts.push(item.vat_included ? `KDV %${num(item.vat_rate)} dahil` : `+ KDV %${num(item.vat_rate)}`);
  return parts.join(" ");
}

/** Dışa aktarma satırları (Excel / CSV). */
export const COST_EXPORT = (statusLabel, basisLabel) => [
  ["Tür", (i) => (i.kind === "revenue" ? "Gelir" : "Gider"), 70],
  ["Kategori", (i) => i.category, 140],
  ["Kalem", (i) => i.name, 220],
  ["Taban", (i) => basisLabel(i.basis), 110],
  ["Miktar", (i) => i.quantity, 70],
  ["Birim", (i) => i.unit, 70],
  ["Birim fiyat", (i) => i.unit_price ?? "", 100],
  ["KDV %", (i) => i.vat_rate, 60],
  ["KDV dahil mi", (i) => (i.vat_included ? "Evet" : "Hayır"), 90],
  ["KDV hariç", (i) => i.net, 100],
  ["KDV", (i) => i.vat, 90],
  ["Tahmini (KDV dahil)", (i) => i.gross, 130],
  ["Gerçekleşen", (i) => (i.actual ?? ""), 110],
  ["Fark", (i) => (i.variance ?? ""), 90],
  ["Durum", (i) => statusLabel(i), 110],
  ["Tedarikçi", (i) => i.supplier || "", 180],
  ["Muhasebe", (i) => (i.entry_id ? "İşlendi" : ""), 80],
  ["Not", (i) => i.note, 220],
];

/* ------------------------------- akış metni ------------------------------- */

/** İmlecin önündeki @arama (bahsetme önerisi): { query, start } ya da null. */
export function mentionQuery(text, caret) {
  const before = String(text || "").slice(0, caret ?? String(text || "").length);
  const m = before.match(/(^|\s)@([\p{L}\d._-]{0,30})$/u);
  return m ? { query: m[2], start: before.length - m[2].length - 1 } : null;
}
export function insertMention(text, caret, name) {
  const q = mentionQuery(text, caret);
  if (!q) return { text, caret };
  const before = text.slice(0, q.start);
  const after = text.slice(caret);
  const insert = `@${name} `;
  return { text: `${before}${insert}${after}`, caret: before.length + insert.length };
}

/** Gönderi metnini parçalara ayırır: düz metin, @bahsetme (ekip adları), bağlantı. */
export function tokenize(text, names = []) {
  const src = String(text || "");
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(https?:\\/\\/[^\\s<]+)|@(${[...sorted.map(escape), "herkes", "ekip"].join("|")})`, "giu");
  const out = [];
  let last = 0;
  src.replace(pattern, (match, url, mention, offset) => {
    if (offset > last) out.push({ type: "text", text: src.slice(last, offset) });
    out.push(url ? { type: "url", text: url } : { type: "mention", text: `@${mention}` });
    last = offset + match.length;
    return match;
  });
  if (last < src.length) out.push({ type: "text", text: src.slice(last) });
  return out;
}

/* ---------------------------- proje özeti (yazdır) ---------------------------- */

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Tek sayfalık "Proje özeti" HTML'i (yazdır / PDF).
 * input: { project, view (künye görünümü), team: [{ name, role }], generatedAt }
 */
export function summaryHtml({ project = {}, view = {}, team = [], generatedAt = new Date() }) {
  const b = view.brief || {};
  const c = view.costs || {};
  const lc = view.lifecycle || { stages: [] };
  const color = project.color || "#6d28d9";
  const row = (k, v) => (v ? `<tr><th>${esc(k)}</th><td>${v}</td></tr>` : "");
  const list = (items) => (items && items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  const age = b.age_min != null || b.age_max != null ? `${b.age_min ?? "…"}–${b.age_max ?? "…"} yaş` : "";
  const stages = (lc.stages || []).map((s) => `<span class="st ${s.state}"><b>${esc(s.label)}</b><small>%${s.progress}</small></span>`).join("");
  const kpis = (b.kpis || []).map((k) => `<tr><td>${esc(k.name)}</td><td>${k.target != null ? esc(num(k.target)) : "—"} ${esc(k.unit || "")}</td><td>${k.actual != null ? esc(num(k.actual)) : "—"}</td></tr>`).join("");
  const risks = (b.risks || []).map((r) => `<li><b>${esc(r.title)}</b> <em>(${esc(RISK_LABELS[r.level] || "")}${r.status ? ` · ${esc(RISK_STATUS_LABELS[r.status] || "")}` : ""})</em>${r.mitigation ? ` — ${esc(r.mitigation)}` : ""}</li>`);
  const cats = (c.by_category || []).filter((x) => x.kind === "cost").slice(0, 8).map((x) => `<tr><td>${esc(x.category)}</td><td>${esc(money(x.planned))}</td><td>${x.actual ? esc(money(x.actual)) : "—"}</td></tr>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(project.name || "Proje")} · Proje özeti</title><style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; } body { font: 11px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; }
  header { border-left: 6px solid ${esc(color)}; padding: 4px 0 6px 12px; margin-bottom: 10px; }
  h1 { font-size: 20px; margin: 0; } header p { margin: 3px 0 0; color: #4b5563; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: ${esc(color)}; margin: 12px 0 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; } table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 2px 4px; } th { width: 38%; color: #6b7280; font-weight: 600; }
  .t td, .t th { border-bottom: 1px solid #f1f5f9; } .t thead th { color: #374151; width: auto; }
  .stages { display: flex; gap: 4px; margin: 6px 0; } .st { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 6px; display: flex; flex-direction: column; }
  .st.current { border-color: ${esc(color)}; background: #f5f3ff; } .st.past { background: #f0fdf4; } .st small { color: #6b7280; }
  .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 6px 0; } .kpi div { border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 7px; }
  .kpi small { display: block; color: #6b7280; } .kpi b { font-size: 13px; } ul { margin: 2px 0; padding-left: 16px; } footer { margin-top: 12px; color: #9ca3af; font-size: 9px; }
  </style></head><body>
  <header><h1>${esc(project.name || "Proje")}</h1><p>${esc(b.summary || project.description || "")}</p></header>
  <div class="stages">${stages}</div>
  <div class="kpi">
    <div><small>Planlanan maliyet</small><b>${esc(money(c.cost?.total))}</b></div>
    <div><small>Gerçekleşen</small><b>${esc(money(c.actual?.cost))}</b></div>
    <div><small>Planlanan gelir</small><b>${esc(money(c.revenue?.total))}</b></div>
    <div><small>Kâr / zarar</small><b>${esc(money(c.profit))}</b></div>
  </div>
  <div class="grid"><div>
    <h2>Tarih &amp; mekân</h2><table>
      ${row("Başlangıç", esc(formatDay(b.start_date)))}${row("Etkinlik", esc(formatDay(b.event_date)))}${row("Bitiş", esc(formatDay(b.end_date)))}
      ${(b.key_dates || []).map((k) => row(k.label, esc(formatDay(k.date)))).join("")}
      ${row("Mekân", esc([b.venue, b.city].filter(Boolean).join(", ")))}
    </table>
    <h2>Hedef kitle</h2><table>
      ${row("Kitle", esc(b.audience))}${row("Segmentler", esc((b.segments || []).join(", ")))}${row("Yaş", esc(age))}
      ${row("Beklenen katılımcı", b.expected_count != null ? esc(num(b.expected_count)) : "")}${row("Beklenen takım", b.expected_teams != null ? esc(num(b.expected_teams)) : "")}
    </table>
    <h2>Ekip &amp; paydaşlar</h2>${list([...team.map((m) => `${esc(m.name)}${m.role ? ` <em>(${esc(m.role)})</em>` : ""}`), ...(b.stakeholders || []).map((p) => `${esc(p.name)}${p.role ? ` <em>(${esc(p.role)})</em>` : ""}`)])}
  </div><div>
    <h2>Bütçe</h2><table>
      ${row("Bütçe tavanı", b.budget_limit != null ? esc(money(b.budget_limit)) : "")}${row("Gelir hedefi", b.revenue_target != null ? esc(money(b.revenue_target)) : "")}
      ${row("Sponsorluk hedefi", b.sponsorship_target != null ? esc(money(b.sponsorship_target)) : "")}
      ${row("Katılımcı başı maliyet", c.per_participant != null ? esc(money(c.per_participant)) : "")}${row("Takım başı maliyet", c.per_team != null ? esc(money(c.per_team)) : "")}
      ${row("Başabaş", [c.break_even?.participants?.units != null ? `${num(c.break_even.participants.units)} katılımcı` : "", c.break_even?.teams?.units != null ? `${num(c.break_even.teams.units)} takım` : "", c.break_even?.sponsors?.units != null ? `${num(c.break_even.sponsors.units)} sponsor` : ""].filter(Boolean).map(esc).join(" · "))}
    </table>
    ${cats ? `<table class="t"><thead><tr><th>Kategori</th><th>Planlanan</th><th>Gerçekleşen</th></tr></thead><tbody>${cats}</tbody></table>` : ""}
    <h2>Hedefler &amp; KPI</h2>${kpis ? `<table class="t"><thead><tr><th>Hedef</th><th>Hedef değer</th><th>Gerçekleşen</th></tr></thead><tbody>${kpis}</tbody></table>` : "<p>—</p>"}
    ${(b.success_criteria || []).length ? `<h2>Başarı ölçütleri</h2>${list(b.success_criteria.map(esc))}` : ""}
    <h2>Riskler</h2>${risks.length ? list(risks) : "<p>—</p>"}
  </div></div>
  ${b.review ? `<h2>Değerlendirme</h2><p>${esc(b.review)}</p>` : ""}
  <footer>Elitlig · Projeler · ${esc(new Date(generatedAt).toLocaleString("tr-TR"))}</footer>
  </body></html>`;
}

/** Soru → künye bağı seçenekleri (sunucu: services/projectBrief.js FIELDS). */
export const BRIEF_FIELD_OPTIONS = [
  ["summary", "Amaç / özet"], ["start_date", "Başlangıç tarihi"], ["end_date", "Bitiş tarihi"], ["event_date", "Etkinlik / ana gün"],
  ["venue", "Mekân"], ["city", "Şehir"], ["audience", "Hedef kitle"], ["segments", "Kitle segmentleri"], ["age_range", "Yaş aralığı"],
  ["expected_count", "Beklenen katılımcı"], ["expected_teams", "Beklenen takım"], ["kpis", "Hedefler & KPI'lar"], ["success_criteria", "Başarı ölçütleri"],
  ["budget_limit", "Bütçe tavanı"], ["revenue_target", "Gelir hedefi"], ["sponsorship_target", "Sponsorluk hedefi"], ["stakeholders", "Paydaşlar"],
  ["risks", "Riskler"], ["review", "Değerlendirme"], ["note", "Not (künyede not olarak)"],
];
export const briefFieldLabel = (key) => BRIEF_FIELD_OPTIONS.find(([k]) => k === key)?.[1] || key;
