// Künye düzenleme penceresi: kimlik, tarih & takvim, mekân, hedef kitle,
// hedefler & KPI, bütçe & gelir, ekip & paydaşlar, riskler, kapanış.
// Soruya bağlı alanlar işaretlidir; kaydedilince bağlı sorular da cevaplanır.
import React, { useMemo, useState } from "react";
import { Field, Icon, Modal } from "../../components/ui";
import { RISK_COLORS, money } from "../../lib/lifecycleUtils";
import { ROLE_LABEL, TagEditor } from "./common";

export const SECTIONS = [
  { key: "identity", label: "Kimlik", icon: "file" },
  { key: "dates", label: "Tarih & takvim", icon: "calendar" },
  { key: "place", label: "Mekân", icon: "map" },
  { key: "audience", label: "Hedef kitle", icon: "users" },
  { key: "goals", label: "Hedefler & KPI", icon: "target" },
  { key: "budget", label: "Bütçe & gelir", icon: "wallet" },
  { key: "team", label: "Ekip & paydaşlar", icon: "team" },
  { key: "risks", label: "Riskler", icon: "alert" },
  { key: "closing", label: "Kapanış", icon: "flag" },
];
const FIELD_SECTION = {
  summary: "identity", start_date: "dates", end_date: "dates", event_date: "dates", venue: "place", city: "place", audience: "audience", segments: "audience",
  age_range: "audience", expected_count: "audience", expected_teams: "audience", kpis: "goals", success_criteria: "goals", budget_limit: "budget",
  revenue_target: "budget", sponsorship_target: "budget", stakeholders: "team", risks: "risks", review: "closing",
};
export const sectionOf = (key) => FIELD_SECTION[key] || "identity";

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blank = (v) => (v === "" || v == null ? null : v);
const toDraft = (b) => ({
  summary: b.summary || "", start_date: b.start_date || "", end_date: b.end_date || "", event_date: b.event_date || "",
  key_dates: (b.key_dates || []).map((k) => ({ ...k })), venue: b.venue || "", city: b.city || "", audience: b.audience || "",
  segments: [...(b.segments || [])], age_min: b.age_min ?? "", age_max: b.age_max ?? "", expected_count: b.expected_count ?? "", expected_teams: b.expected_teams ?? "",
  kpis: (b.kpis || []).map((k) => ({ ...k, target: k.target ?? "", actual: k.actual ?? "" })), success_criteria: [...(b.success_criteria || [])],
  budget_limit: b.budget_limit ?? "", revenue_target: b.revenue_target ?? "", sponsorship_target: b.sponsorship_target ?? "",
  stakeholders: (b.stakeholders || []).map((p) => ({ ...p })), risks: (b.risks || []).map((r) => ({ ...r })), review: b.review || "",
});
export const toBody = (d) => ({
  ...d,
  age_min: blank(d.age_min), age_max: blank(d.age_max), expected_count: blank(d.expected_count), expected_teams: blank(d.expected_teams),
  budget_limit: blank(d.budget_limit), revenue_target: blank(d.revenue_target), sponsorship_target: blank(d.sponsorship_target),
  start_date: d.start_date || null, end_date: d.end_date || null, event_date: d.event_date || null,
  kpis: d.kpis.filter((k) => String(k.name || "").trim()).map((k) => ({ ...k, target: blank(k.target), actual: blank(k.actual) })),
  key_dates: d.key_dates.filter((k) => String(k.label || "").trim()), stakeholders: d.stakeholders.filter((p) => String(p.name || "").trim()), risks: d.risks.filter((r) => String(r.title || "").trim()),
});

const Linked = ({ view, field }) => {
  const q = view?.questions?.[field];
  if (!q) return null;
  return <span className={`lc-linked ${q.status === "open" ? "is-open" : ""}`} title="Bu alan bir soruyla bağlı: cevap ve künye birbirini günceller"><Icon name="help" size={10} /> {q.status === "open" ? "Soru açık" : "Soru cevaplandı"}</span>;
};

function Rows({ rows, onChange, render, add, addLabel, disabled }) {
  return (
    <div className="lc-rows">
      {rows.map((r, i) => (
        <div key={r.id || i} className="lc-rows__row">
          {render(r, (p) => onChange(rows.map((x, j) => (j === i ? { ...x, ...p } : x))))}
          {!disabled && <button type="button" className="icon-btn" aria-label="Satırı sil" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>}
        </div>
      ))}
      {!disabled && <button type="button" className="btn btn--sm btn--ghost lc-addline" onClick={() => onChange([...rows, add()])}><Icon name="plus" size={12} /> {addLabel}</button>}
    </div>
  );
}

export default function BriefEditor({ ctx, view, initialSection = "identity", onSave, onClose }) {
  const [section, setSection] = useState(initialSection);
  const [d, setD] = useState(() => toDraft(view.brief || {}));
  const [busy, setBusy] = useState(false);
  const ro = !ctx.canEdit;
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const missing = useMemo(() => new Set((view.completeness?.missing || []).map((m) => sectionOf(m.key))), [view]);
  const L = (f) => <Linked view={view} field={f} />;
  const team = [{ user_id: ctx.project.owner_id, role: "owner" }, ...ctx.members];
  const submit = async () => {
    setBusy(true);
    const ok = await onSave(toBody(d));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal title="Proje künyesi" onClose={onClose} width={980} className="lc-editor"
      footer={<>
        <span className="muted small spacer">Künye; genel bakışta, yazdırılan proje özetinde ve bağlı soruların cevabında kullanılır.</span>
        <button type="button" className="btn" onClick={onClose}>{ro ? "Kapat" : "Vazgeç"}</button>
        {!ro && <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>{busy ? "Kaydediliyor…" : "Künyeyi kaydet"}</button>}
      </>}>
      <div className="lc-editor__layout">
        <nav className="lc-editor__nav" aria-label="Künye bölümleri">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" className={section === s.key ? "is-active" : ""} aria-current={section === s.key ? "true" : undefined} onClick={() => setSection(s.key)}>
              <Icon name={s.icon} size={14} /> {s.label}{missing.has(s.key) && <span className="lc-dotmiss" aria-label="eksik" />}
            </button>
          ))}
        </nav>
        <div className="lc-editor__body">
          {section === "identity" && (
            <Field label={<>Amaç / özet {L("summary")}</>}><textarea rows={7} value={d.summary} onChange={set("summary")} disabled={ro} placeholder="Bu proje neden var, ne yapacağız, sonunda ne olacak?" autoFocus /></Field>
          )}
          {section === "dates" && (
            <>
              <div className="form-grid form-grid--3">
                <Field label={<>Başlangıç {L("start_date")}</>}><input type="date" value={d.start_date} onChange={set("start_date")} disabled={ro} /></Field>
                <Field label={<>Etkinlik / ana gün {L("event_date")}</>}><input type="date" value={d.event_date} onChange={set("event_date")} disabled={ro} /></Field>
                <Field label={<>Bitiş {L("end_date")}</>}><input type="date" value={d.end_date} onChange={set("end_date")} disabled={ro} /></Field>
              </div>
              <h4 className="lc-subhead">Önemli tarihler</h4>
              <Rows rows={d.key_dates} disabled={ro} onChange={set("key_dates")} addLabel="Önemli tarih ekle" add={() => ({ id: uid("d"), label: "", date: "", done: false })}
                render={(r, p) => (<>
                  <input value={r.label} onChange={(e) => p({ label: e.target.value })} placeholder="ör. Kayıtların kapanışı" aria-label="Tarih adı" disabled={ro} />
                  <input type="date" value={r.date || ""} onChange={(e) => p({ date: e.target.value })} aria-label="Tarih" disabled={ro} className="lc-w-date" />
                  <label className="lc-check"><input type="checkbox" checked={Boolean(r.done)} onChange={(e) => p({ done: e.target.checked })} disabled={ro} /> Geçti</label>
                </>)} />
            </>
          )}
          {section === "place" && (
            <div className="form-grid">
              <Field label={<>Mekân / tesis {L("venue")}</>}><input value={d.venue} onChange={set("venue")} disabled={ro} placeholder="ör. Yıldız Halı Saha" /></Field>
              <Field label={<>Şehir {L("city")}</>}><input value={d.city} onChange={set("city")} disabled={ro} placeholder="ör. Ankara" /></Field>
            </div>
          )}
          {section === "audience" && (
            <>
              <Field label={<>Hedef kitle {L("audience")}</>}><textarea rows={3} value={d.audience} onChange={set("audience")} disabled={ro} placeholder="Kime ulaşıyoruz? Kim katılacak, kim izleyecek?" /></Field>
              <Field label={<>Segmentler {L("segments")}</>}><TagEditor value={d.segments} onChange={set("segments")} disabled={ro} placeholder="Segment ekle ve ↩" /></Field>
              <div className="form-grid lc-grid4">
                <Field label={<>Yaş (en az) {L("age_range")}</>}><input type="number" min={0} max={120} value={d.age_min} onChange={set("age_min")} disabled={ro} /></Field>
                <Field label="Yaş (en çok)"><input type="number" min={0} max={120} value={d.age_max} onChange={set("age_max")} disabled={ro} /></Field>
                <Field label={<>Beklenen katılımcı {L("expected_count")}</>}><input type="number" min={0} value={d.expected_count} onChange={set("expected_count")} disabled={ro} /></Field>
                <Field label={<>Beklenen takım {L("expected_teams")}</>}><input type="number" min={0} value={d.expected_teams} onChange={set("expected_teams")} disabled={ro} /></Field>
              </div>
              <p className="muted small">Katılımcı ve takım sayısı maliyet hesabında "katılımcı / takım başı" kalemlerin çarpanıdır.</p>
            </>
          )}
          {section === "goals" && (
            <>
              <h4 className="lc-subhead">Hedefler & KPI'lar {L("kpis")}</h4>
              <Rows rows={d.kpis} disabled={ro} onChange={set("kpis")} addLabel="KPI ekle" add={() => ({ id: uid("k"), name: "", target: "", actual: "", unit: "" })}
                render={(r, p) => (<>
                  <input value={r.name} onChange={(e) => p({ name: e.target.value })} placeholder="ör. Katılımcı sayısı" aria-label="KPI adı" disabled={ro} />
                  <input type="number" className="lc-w-num" value={r.target} onChange={(e) => p({ target: e.target.value })} placeholder="Hedef" aria-label="Hedef değer" disabled={ro} />
                  <input type="number" className="lc-w-num" value={r.actual} onChange={(e) => p({ actual: e.target.value })} placeholder="Gerçekleşen" aria-label="Gerçekleşen" disabled={ro} />
                  <input className="lc-w-unit" value={r.unit || ""} onChange={(e) => p({ unit: e.target.value })} placeholder="Birim" aria-label="Birim" disabled={ro} />
                </>)} />
              <Field label={<>Başarı ölçütleri {L("success_criteria")}</>}><TagEditor value={d.success_criteria} onChange={set("success_criteria")} disabled={ro} placeholder="Ölçüt ekle ve ↩" /></Field>
            </>
          )}
          {section === "budget" && (
            <>
              <div className="form-grid form-grid--3">
                <Field label={<>Bütçe tavanı (₺) {L("budget_limit")}</>}><input inputMode="decimal" value={d.budget_limit} onChange={set("budget_limit")} disabled={ro} /></Field>
                <Field label={<>Gelir hedefi (₺) {L("revenue_target")}</>}><input inputMode="decimal" value={d.revenue_target} onChange={set("revenue_target")} disabled={ro} /></Field>
                <Field label={<>Sponsorluk hedefi (₺) {L("sponsorship_target")}</>}><input inputMode="decimal" value={d.sponsorship_target} onChange={set("sponsorship_target")} disabled={ro} /></Field>
              </div>
              <div className="lc-inlinesum">
                <span>Maliyet hesabına göre planlanan: <b>{money(view.costs?.cost?.total)}</b></span>
                <span>Planlanan gelir: <b>{money(view.costs?.revenue?.total)}</b></span>
                <button type="button" className="link-btn" onClick={() => { onClose(); ctx.setTab("costs"); }}>Maliyet hesabını aç →</button>
              </div>
            </>
          )}
          {section === "team" && (
            <>
              <h4 className="lc-subhead">Proje ekibi</h4>
              <div className="lc-teamlist">{team.map((m) => <span key={m.user_id}><b>{ctx.people[m.user_id]?.name || `#${m.user_id}`}</b> <span className="pill pill--xs">{ROLE_LABEL[m.role] || m.role}</span></span>)}</div>
              <p className="muted small">Üyeler ve roller Ayarlar sekmesinden yönetilir. <button type="button" className="link-btn" onClick={() => { onClose(); ctx.setTab("settings"); }}>Ayarlar →</button></p>
              <h4 className="lc-subhead">Paydaşlar {L("stakeholders")}</h4>
              <Rows rows={d.stakeholders} disabled={ro} onChange={set("stakeholders")} addLabel="Paydaş ekle" add={() => ({ id: uid("p"), name: "", role: "", contact: "" })}
                render={(r, p) => (<>
                  <input value={r.name} onChange={(e) => p({ name: e.target.value })} placeholder="Kurum / kişi" aria-label="Paydaş adı" disabled={ro} />
                  <input value={r.role || ""} onChange={(e) => p({ role: e.target.value })} placeholder="Rol (ör. Ana sponsor)" aria-label="Paydaş rolü" disabled={ro} />
                  <input value={r.contact || ""} onChange={(e) => p({ contact: e.target.value })} placeholder="İletişim" aria-label="İletişim" disabled={ro} />
                </>)} />
            </>
          )}
          {section === "risks" && (
            <>
              <h4 className="lc-subhead">Riskler {L("risks")}</h4>
              <Rows rows={d.risks} disabled={ro} onChange={set("risks")} addLabel="Risk ekle" add={() => ({ id: uid("r"), title: "", level: "medium", mitigation: "", owner: "", status: "open" })}
                render={(r, p) => (
                  <div className="lc-riskrow" style={{ "--rc": RISK_COLORS[r.level] || "#64748b" }}>
                    <input value={r.title} onChange={(e) => p({ title: e.target.value })} placeholder="Risk (ör. Kötü hava)" aria-label="Risk" disabled={ro} />
                    <select value={r.level || "medium"} onChange={(e) => p({ level: e.target.value })} aria-label="Olasılık / etki" disabled={ro}><option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option></select>
                    <select value={r.status || "open"} onChange={(e) => p({ status: e.target.value })} aria-label="Risk durumu" disabled={ro}><option value="open">Açık</option><option value="watching">İzleniyor</option><option value="closed">Kapandı</option></select>
                    <input className="lc-riskrow__wide" value={r.mitigation || ""} onChange={(e) => p({ mitigation: e.target.value })} placeholder="Önlem / B planı" aria-label="Önlem" disabled={ro} />
                    <input value={r.owner || ""} onChange={(e) => p({ owner: e.target.value })} placeholder="Sorumlu" aria-label="Sorumlu" disabled={ro} />
                  </div>
                )} />
            </>
          )}
          {section === "closing" && (
            <>
              <Field label={<>Değerlendirme {L("review")}</>}><textarea rows={8} value={d.review} onChange={set("review")} disabled={ro} placeholder="Ne iyi gitti, ne aksadı, bir dahaki sefere ne yapacağız?" /></Field>
              <p className="muted small">Kapanış evresinde KPI gerçekleşenlerini ve maliyetlerin gerçekleşenlerini de girin.</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
