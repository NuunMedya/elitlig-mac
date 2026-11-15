// Projeler: ortak parçalar ve proje verisi kancası.
import React, { useCallback, useMemo, useState } from "react";
import { Icon, Modal, useToast } from "../../components/ui";
import { del, patch, post, request, tempId, useResource } from "../../api";
import { formatMoney } from "../../lib/helpers";
import { STEP_STATUS_TONE, initials, resolveLink, rowsToBook, sheetToRows } from "../../lib/projectUtils";

export const BASE = "/api/tools/projects";
/** Proje bütçesi değişti (görüşme kapanışı vb.): Bütçe sekmesi yeniden okur. */
export const FINANCE_EVENT = "elitlig:project-finance";
export const money = (v) => formatMoney(v || 0, 0);

export const TOOL_ICONS = {
  leads: "users", suppliers: "handshake", finance: "wallet", questions: "help", portfolio: "briefcase", activity: "activity", todos: "checkSquare", agenda: "calendar",
  notes: "note", sheets: "grid", accounting: "wallet", contacts: "user", calc: "calculator", focus: "timer",
};
/** Adımın aracı → uygulamadaki görünüm. */
export const TOOL_ROUTES = { todos: "todos", agenda: "agenda", notes: "notes", sheets: "sheets", accounting: "ledger", contacts: "contacts", calc: "calc", focus: "focus" };
export const ACTIVITY_ICONS = { call: "phone", whatsapp: "message", email: "mail", meeting: "users", visit: "map", sms: "message", note: "note", status: "refresh", system: "zap" };
export const STATUS_ICON = { todo: "circle", doing: "play", waiting: "clock", blocked: "alert", done: "check", skipped: "skip" };

export const label = (list, key) => (list || []).find((x) => x.key === key)?.label || key || "";

/** Bağlantıyı açar: göreli site yolu tarayıcıda site adresiyle. */
export function openLink(url) {
  const link = resolveLink(url);
  if (!link) return;
  if (link.site) window.elitlig.app.openWeb(link.path);
  else window.elitlig.app.openExternal(link.href);
}

/** İstek sonucu: hata ve çevrimdışı durumunu açıkça bildirir. */
export function useRun() {
  const toast = useToast();
  return useCallback((res, okMessage) => {
    if (!res?.ok) {
      const msg = res?.offline ? "Çevrimdışısınız: bu işlem için internet bağlantısı gerekir." : res?.error?.message || "İşlem yapılamadı.";
      toast(msg, { tone: "error", timeout: 5000 });
      return false;
    }
    if (res.queued) toast("Çevrimdışı kaydedildi: bağlantı gelince eşitlenecek.", { tone: "warn" });
    else if (okMessage) toast(okMessage, { tone: "success" });
    return true;
  }, [toast]);
}

/**
 * Tek projenin tüm verisi ve yazma işlemleri. Değişiklikler önce ekranda
 * uygulanır (iyimser), hata olursa sunucudaki hâl yeniden okunur.
 */
export function useProject(id, me) {
  const res = useResource(`${BASE}/${id}`);
  const run = useRun();
  const { setData, reload } = res;
  const base = `${BASE}/${id}`;
  const quiet = useCallback(() => reload({ quiet: true }), [reload]);

  const swap = useCallback((kind, item) => setData((d) => (d ? { ...d, [kind]: d[kind].map((x) => (String(x.id) === String(item.id) ? { ...x, ...item } : x)) } : d)), [setData]);
  const push = useCallback((kind, item, front = false) => setData((d) => (d ? { ...d, [kind]: front ? [item, ...d[kind]] : [...d[kind], item] } : d)), [setData]);
  const drop = useCallback((kind, itemId) => setData((d) => (d ? { ...d, [kind]: d[kind].filter((x) => String(x.id) !== String(itemId)) } : d)), [setData]);

  const actions = useMemo(() => ({
    reload: quiet,
    async updateProject(changes, extra = {}) {
      const r = await patch(base, changes);
      if (r.ok) { setData((d) => ({ ...d, item: { ...d.item, ...r.data.item, stats: d.item.stats } })); if (!extra.silent) quiet(); return r; }
      if (r.error?.code !== "STAGE_IN_USE") run(r);
      return r;
    },
    /* adımlar */
    async createStep(body) {
      const r = await post(`${base}/steps`, body);
      if (!run(r)) return null;
      push("steps", r.data.item);
      return r.data.item;
    },
    async updateStep(step, changes) {
      swap("steps", { ...step, ...changes });
      const r = await patch(`${base}/steps/${step.id}`, changes);
      if (!run(r)) { quiet(); return null; }
      if (r.data?.item) swap("steps", r.data.item);
      if (changes.status && changes.status !== step.status && !r.queued) quiet();
      return r.data?.item || { ...step, ...changes };
    },
    async deleteStep(step) {
      drop("steps", step.id);
      if (!run(await del(`${base}/steps/${step.id}`), "Adım silindi.")) quiet();
    },
    async reorder(payload, nextSteps) {
      if (nextSteps) setData((d) => ({ ...d, steps: nextSteps }));
      const r = await request({ method: "POST", path: `${base}/reorder`, body: payload, queue: false });
      if (!run(r)) quiet();
    },
    async bulkSteps(body) {
      const r = await request({ method: "POST", path: `${base}/steps/bulk`, body, queue: false });
      if (run(r, `${r.data?.created || 0} adım eklendi.`)) { quiet(); return r.data; }
      return null;
    },
    /* aşamalar */
    async createPhase(body) {
      const r = await post(`${base}/phases`, body);
      if (run(r)) { push("phases", r.data.item); return r.data.item; }
      return null;
    },
    async updatePhase(phase, changes) {
      swap("phases", { ...phase, ...changes });
      if (!run(await patch(`${base}/phases/${phase.id}`, changes))) quiet();
    },
    async deletePhase(phase, query) {
      const r = await request({ method: "DELETE", path: `${base}/phases/${phase.id}`, query });
      if (run(r, "Aşama silindi.")) quiet();
    },
    /* kişiler */
    async createLead(body) {
      const r = await post(`${base}/leads`, body);
      if (!run(r)) return null;
      push("leads", r.data.item, true);
      quiet();
      return r.data.item;
    },
    async updateLead(lead, changes) {
      swap("leads", { ...lead, ...changes });
      const r = await patch(`${base}/leads/${lead.id}`, changes);
      if (!run(r)) { quiet(); return null; }
      if (r.data?.item) swap("leads", r.data.item);
      if (changes.stage && changes.stage !== lead.stage && !r.queued) quiet();
      return r.data?.item || { ...lead, ...changes };
    },
    async deleteLead(lead) {
      drop("leads", lead.id);
      if (!run(await del(`${base}/leads/${lead.id}`), "Kişi silindi.")) quiet();
    },
    async bulkLeads(items) {
      const r = await request({ method: "POST", path: `${base}/leads/bulk`, body: { items }, queue: false });
      if (run(r, `${r.data?.created || 0} kişi eklendi${r.data?.skipped ? `, ${r.data.skipped} kayıt atlandı (aynı telefon/e-posta ya da adsız)` : ""}.`)) { quiet(); return r.data; }
      return null;
    },
    /**
     * Görüşmeyi kapat: müşteride portföy (+ istenirse gelir kaydı), tedarikte
     * gider kaydı. body.entry: false | { amount, account_id, status, due_date, ... }
     */
    async closeLead(lead, body) {
      const r = await request({ method: "POST", path: `${base}/leads/${lead.id}/close`, body, queue: false });
      const supplier = lead.kind === "supplier";
      const e = r.data?.entry;
      const parts = [supplier ? "Tedarik tamamlandı" : "Satış kapandı"];
      if (e) parts.push(`${supplier ? "gidere" : "gelire"} yazıldı (${formatMoney(e.effective, 0)}${e.account_name ? ` · ${e.account_name}` : ""}${e.status === "paid" ? ", hesaba işlendi" : ""})`);
      if (r.data?.portfolio) parts.push("portföye eklendi");
      if (!run(r, `${parts.join(", ")}.`)) return null;
      swap("leads", r.data.lead);
      if (r.data.portfolio) push("portfolio", r.data.portfolio, true);
      if (e) window.dispatchEvent(new Event(FINANCE_EVENT));
      quiet();
      return r.data;
    },
    /** Rehber / üye rehberi / portföyden seçilenleri projenin listesine kopyalar. */
    async importDirectory(body) {
      const r = await request({ method: "POST", path: `${base}/directory/import`, body, queue: false });
      if (!run(r, `${r.data?.created || 0} kayıt proje listesine eklendi${r.data?.skipped ? `, ${r.data.skipped} kayıt zaten listede (aynı telefon/e-posta) olduğu için atlandı` : ""}.`)) return null;
      quiet();
      return r.data;
    },
    /**
     * İletişim kaydı. Çevrimdışıyken kişi, sunucunun kurallarıyla (outcomePreview)
     * ekranda güncellenir; kayıt bağlantı gelince gönderilir.
     */
    async logActivity(body, optimisticLead = null) {
      const tmp = { id: tempId(), project_id: Number(id), type: body.type || "note", outcome: body.outcome || null, note: body.note || "", lead_id: body.lead_id || null, step_id: body.step_id || null, occurred_at: new Date().toISOString(), next_action_at: null, created_by: me, created_at: new Date().toISOString(), pending: true };
      push("activities", tmp, true);
      if (optimisticLead) swap("leads", optimisticLead);
      const r = await post(`${base}/activities`, body, { tempId: tmp.id });
      if (!run(r)) { drop("activities", tmp.id); quiet(); return null; }
      if (r.queued) return { item: tmp, lead: optimisticLead };
      setData((d) => ({ ...d, activities: d.activities.map((a) => (a.id === tmp.id ? r.data.item : a)) }));
      if (r.data.lead) swap("leads", r.data.lead);
      return r.data;
    },
    async deleteActivity(a) {
      drop("activities", a.id);
      if (!run(await del(`${base}/activities/${a.id}`))) quiet();
    },
    /* sorular */
    async createQuestion(body) {
      const tmp = { id: tempId(), project_id: Number(id), status: body.answer ? "answered" : "open", priority: "normal", answer: "", category: null, step_id: null, lead_id: null, due_date: null, asked_by: me, created_at: new Date().toISOString(), ...body };
      push("questions", tmp, true);
      const r = await post(`${base}/questions`, body, { tempId: tmp.id });
      if (!run(r)) { drop("questions", tmp.id); return null; }
      if (!r.queued) setData((d) => ({ ...d, questions: d.questions.map((q) => (q.id === tmp.id ? r.data.item : q)) }));
      return r.data?.item || tmp;
    },
    async updateQuestion(q, changes) {
      const optimistic = { ...q, ...changes };
      if (changes.answer && q.status === "open" && !changes.status) optimistic.status = "answered";
      swap("questions", optimistic);
      const r = await patch(`${base}/questions/${q.id}`, changes);
      if (!run(r)) { quiet(); return; }
      if (r.data?.item) swap("questions", r.data.item);
      // Künyeye bağlı soru: cevap künyeye (ve proje tarihlerine, aynı alana bağlı sorulara) işlendi.
      if (r.data?.brief_updated) quiet();
    },
    async deleteQuestion(q) {
      drop("questions", q.id);
      if (!run(await del(`${base}/questions/${q.id}`), "Soru silindi.")) quiet();
    },
    /* portföy */
    async savePortfolio(entry, body) {
      const r = entry?.id ? await patch(`${BASE}/portfolio/${entry.id}`, body) : await request({ method: "POST", path: `${BASE}/portfolio`, body: { ...body, project_id: Number(id) }, queue: false });
      if (!run(r, entry?.id ? "Kaydedildi." : "Portföye eklendi.")) return null;
      if (entry?.id) swap("portfolio", r.data.item); else push("portfolio", r.data.item, true);
      return r.data.item;
    },
    async deletePortfolio(entry) {
      drop("portfolio", entry.id);
      if (!run(await del(`${BASE}/portfolio/${entry.id}`), "Portföyden çıkarıldı.")) quiet();
      else quiet();
    },
  }), [base, id, me, push, quiet, run, setData, swap, drop]);

  return { ...res, actions };
}

/* ------------------------------- küçük parçalar ------------------------------- */

export const Avatar = ({ name, color, size = 24, title }) => (
  <span className="p-avatar" style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), ...(color ? { background: color } : {}) }} title={title || name}>{initials(name)}</span>
);

export const ProjectBadge = ({ project, size = 40 }) => (
  <span className="p-badge" style={{ "--pc": project?.color || "#7c3aed", width: size, height: size, borderRadius: size * 0.3 }}>
    <Icon name={project?.icon || "folder"} size={Math.round(size * 0.48)} strokeWidth={2} />
  </span>
);

export const Progress = ({ value, color, thin = false }) => (
  <span className={`progress ${thin ? "progress--thin" : ""}`}><span style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, ...(color ? { background: color } : {}) }} /></span>
);

/** Adım durumu: renkli, klavyeyle seçilebilen açılır liste. */
export function StatusSelect({ value, onChange, statuses, disabled, size = "md" }) {
  const tone = STEP_STATUS_TONE[value] || "";
  return (
    <span className={`status-select status-select--${size} ${tone ? `is-${tone}` : ""} ${value === "skipped" ? "is-skipped" : ""}`}>
      <Icon name={STATUS_ICON[value] || "circle"} size={size === "sm" ? 11 : 12} strokeWidth={2.4} />
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()} aria-label="Durum">
        {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </span>
  );
}

export const StagePill = ({ stage, small = false }) => (stage ? (
  <span className={`stage-pill ${small ? "stage-pill--sm" : ""}`} style={{ "--sc": stage.color || "#64748b" }}>{stage.won && <Icon name="check" size={10} strokeWidth={3} />}{stage.label}</span>
) : null);

/** Liste düzenleyici (etiket benzeri). */
export function TagEditor({ value = [], onChange, placeholder = "Ekle ve ↩", disabled }) {
  const [text, setText] = useState("");
  const add = () => { const t = text.trim(); if (t && !value.includes(t)) onChange([...value, t]); setText(""); };
  return (
    <div className="tag-editor">
      {value.map((v) => <span key={v} className="chip">{v}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`${v} kaldır`}>×</button>}</span>)}
      {!disabled && <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} />}
    </div>
  );
}

/** Basit metin isteme penceresi. */
export function PromptDialog({ title, label: fieldLabel, initial = "", confirmLabel = "Kaydet", onClose, onSubmit, multiline = false, children }) {
  const [value, setValue] = useState(initial);
  const submit = (e) => { e?.preventDefault(); onSubmit(value.trim()); };
  return (
    <Modal title={title} onClose={onClose} width={440} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="prompt-form" className="btn btn--primary">{confirmLabel}</button></>}>
      <form id="prompt-form" onSubmit={submit} className="composer">
        <label className="field"><span className="field__label">{fieldLabel}</span>
          {multiline ? <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} /> : <input value={value} onChange={(e) => setValue(e.target.value)} />}
        </label>
        {children}
      </form>
    </Modal>
  );
}

/** Yerel saatli "YYYY-MM-DDTHH:mm" ↔ ISO */
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

/** Excel / CSV dosyası seçtirir ve ilk sayfanın satırlarını döndürür. */
export async function pickSheetRows() {
  const file = await window.elitlig.files.open([{ name: "Excel / CSV", extensions: ["xlsx", "xlsm", "csv", "tsv", "txt"] }]);
  if (!file.ok) return null;
  const { importFile } = await import("../../lib/sheets/importFile");
  const { book, warnings } = await importFile(file.name, file.data);
  const sheets = book.sheets.map((s) => ({ name: s.name, rows: sheetToRows(s) })).filter((s) => s.rows.length);
  return { name: file.name, sheets, warnings };
}

/** Satırları .xlsx olarak kaydeder. */
export async function saveRowsXlsx(fileName, rows, sheetName, colW) {
  const [{ workbookToXlsx }, { createEvaluator }] = await Promise.all([import("../../lib/sheets/xlsxExport"), import("../../lib/sheets/sheetEngine")]);
  const book = rowsToBook(rows, sheetName, colW);
  const bytes = workbookToXlsx(book, createEvaluator(book), { title: sheetName });
  const res = await window.elitlig.files.save(`${fileName}.xlsx`, bytes, [{ name: "Excel", extensions: ["xlsx"] }]);
  if (res.ok) window.elitlig.files.reveal(res.path);
}
export async function saveRowsCsv(fileName, rows) {
  const { toCsvText } = await import("../../lib/sheets/sheetEngine");
  const res = await window.elitlig.files.save(`${fileName}.csv`, toCsvText(rows), [{ name: "CSV", extensions: ["csv"] }]);
  if (res.ok) window.elitlig.files.reveal(res.path);
}

/** Bir zaman damgasını gün başlığı için biçimler. */
export const dayHeading = (iso) => {
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === -1) return "Dün";
  return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

export const ROLE_LABEL = { owner: "Sahip", editor: "Düzenleyici", viewer: "İzleyici" };
