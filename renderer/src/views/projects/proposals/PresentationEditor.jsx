// Sunum düzenleyici: solda içerik (bölümler, paketler, tema, logo / kapak,
// tanıtım ve künye, rakamlar, görünürlük, referanslar, iletişim), sağda canlı
// önizleme (sunucu aynı HTML'i üretir). Kaydet, PDF, paylaş, e-postayla gönder.
import React, { useEffect, useRef, useState } from "react";
import { Field, Icon, Modal } from "../../../components/ui";
import { request } from "../../../api";
import { SECTIONS, displayNumber } from "../../../lib/salesUtils";
import { DocPreview, refreshSales, salesPath, useCall, useSales } from "./salesCommon";
import MailComposer from "./MailComposer";

const PALETTE = ["#4338ca", "#0f766e", "#b91c1c", "#1d4ed8", "#7c3aed", "#0f172a", "#c2410c", "#15803d"];

function Pairs({ items = [], onChange, a, b, aLabel, bLabel, max, add, multiline = false }) {
  const set = (i, k, v) => onChange(items.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
  return (
    <div className="sl-pairs">
      {items.map((x, i) => (
        <div key={i} className="sl-pair">
          <input value={x[a] || ""} placeholder={aLabel} aria-label={`${aLabel} ${i + 1}`} onChange={(e) => set(i, a, e.target.value)} />
          {multiline ? <textarea rows={2} value={x[b] || ""} placeholder={bLabel} aria-label={`${bLabel} ${i + 1}`} onChange={(e) => set(i, b, e.target.value)} /> : <input value={x[b] || ""} placeholder={bLabel} aria-label={`${bLabel} ${i + 1}`} onChange={(e) => set(i, b, e.target.value)} />}
          <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`${i + 1}. satırı sil`}><Icon name="x" size={12} /></button>
        </div>
      ))}
      {items.length < max && <button type="button" className="btn btn--xs btn--soft" onClick={() => onChange([...items, { [a]: "", [b]: "" }])}><Icon name="plus" size={11} /> {add}</button>}
    </div>
  );
}

const Group = ({ title, icon, open = false, children }) => (
  <details className="sl-group" open={open}>
    <summary><Icon name={icon} size={14} /> {title}<Icon name="chevronDown" size={12} className="sl-group__chev" /></summary>
    <div className="sl-group__body">{children}</div>
  </details>
);

export default function PresentationEditor({ ctx, presentation, onClose }) {
  const pid = ctx.project.id;
  const call = useCall();
  const { data: sales } = useSales(pid);
  const [form, setForm] = useState(() => ({
    title: presentation.title, kind: presentation.kind, proposal_id: presentation.proposal_id || "", package_ids: presentation.package_ids,
    theme: { primary: "", accent: "", logo_url: "", cover_url: "", ...presentation.theme }, content: { ...presentation.content, contact: { ...(presentation.content?.contact || {}) } }, sections: presentation.sections,
  }));
  const [html, setHtml] = useState("");
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [mailing, setMailing] = useState(false);
  const frame = useRef(null);
  const scroll = useRef(0);
  const set = (p) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };
  const setC = (p) => { setForm((f) => ({ ...f, content: { ...f.content, ...p } })); setDirty(true); };
  const setT = (p) => { setForm((f) => ({ ...f, theme: { ...f.theme, ...p } })); setDirty(true); };
  const payload = () => ({ title: form.title, kind: form.kind, proposal_id: form.proposal_id ? Number(form.proposal_id) : null, package_ids: form.package_ids, theme: Object.fromEntries(Object.entries(form.theme).filter(([, v]) => v)), content: form.content, sections: form.sections });

  useEffect(() => {
    const t = setTimeout(async () => {
      try { scroll.current = frame.current?.contentWindow?.scrollY || 0; } catch { scroll.current = 0; }
      const r = await request({ method: "POST", path: `${salesPath(pid)}/render`, body: { presentation: payload() }, queue: false });
      if (r.ok) { setHtml(r.data.html); setErr(""); } else setErr(r.offline ? "Canlı önizleme için internet bağlantısı gerekir." : r.error?.message || "Önizleme hazırlanamadı.");
    }, 500);
    return () => clearTimeout(t);
  }, [form, pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (quiet = false) => {
    setBusy(true);
    const res = await call({ method: "PATCH", path: `${salesPath(pid)}/presentations/${presentation.id}`, body: payload() }, quiet ? null : "Sunum kaydedildi.");
    setBusy(false);
    if (res) { setDirty(false); refreshSales(); return true; }
    return false;
  };
  const toggleSection = (k) => set({ sections: form.sections.includes(k) ? form.sections.filter((s) => s !== k) : SECTIONS.map((s) => s.key).filter((x) => x === k || form.sections.includes(x)) });
  const pkgs = sales?.packages || [];
  const pkgSel = form.package_ids == null ? pkgs.filter((p) => p.active).map((p) => p.id) : form.package_ids;
  const c = form.content;

  return (
    <Modal title={form.title || "Sunum"} onClose={onClose} width={1320} className="modal--tool sl-pres" footer={<>
      <span className="muted small spacer">{dirty ? "Kaydedilmemiş değişiklikler var" : "Kaydedildi"}</span>
      {ctx.canEdit && <button type="button" className="btn" onClick={async () => { if (!dirty || await save(true)) setMailing(true); }}><Icon name="mail" size={13} /> E-postayla gönder</button>}
      <button type="button" className="btn" onClick={async () => { if (!dirty || await save(true)) setPreview(true); }}><Icon name="download" size={13} /> PDF · Paylaş</button>
      {ctx.canEdit && <button type="button" className="btn btn--primary" disabled={busy || !dirty} onClick={() => save()}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>}
    </>}>
      <div className="sl-pres__grid">
        <fieldset className="sl-pres__form sl-fieldset" disabled={!ctx.canEdit}>
          <Field label="Sunum başlığı"><input className="sl-title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} aria-label="Sunum başlığı" /></Field>
          <div className="form-grid">
            <Field label="Üst başlık"><input value={c.kicker || ""} onChange={(e) => setC({ kicker: e.target.value })} placeholder="Ör. Sponsorluk fırsatları" /></Field>
            <Field label="Organizatör"><input value={c.organizer || ""} onChange={(e) => setC({ organizer: e.target.value })} /></Field>
          </div>
          <Field label="Alt başlık"><input value={c.subtitle || ""} onChange={(e) => setC({ subtitle: e.target.value })} placeholder="Tek cümlelik değer önerisi" /></Field>
          <Group title="Bölümler ve paketler" icon="layers" open>
            <div className="sl-chips">{SECTIONS.map((s) => <button key={s.key} type="button" className={`sl-chip ${form.sections.includes(s.key) ? "is-on" : ""}`} aria-pressed={form.sections.includes(s.key)} onClick={() => toggleSection(s.key)}>{form.sections.includes(s.key) && <Icon name="check" size={11} />} {s.label}</button>)}</div>
            {pkgs.length > 0 && <div className="sl-chips"><small className="muted">Paketler:</small>{pkgs.map((p) => <button key={p.id} type="button" className={`sl-chip ${pkgSel.includes(p.id) ? "is-on" : ""}`} aria-pressed={pkgSel.includes(p.id)} onClick={() => set({ package_ids: pkgSel.includes(p.id) ? pkgSel.filter((x) => x !== p.id) : [...pkgSel, p.id] })}><span className="sl-dot" style={{ background: p.color }} /> {p.name}</button>)}</div>}
            {form.sections.includes("proposal") && (
              <Field label="Sunuma eklenecek teklif">
                <select value={form.proposal_id} onChange={(e) => set({ proposal_id: e.target.value })}>
                  <option value="">Teklif seçilmedi</option>
                  {(sales?.proposals || []).map((q) => <option key={q.id} value={q.id}>{displayNumber(q.number, q.revision)} · {q.recipient_company || q.title}</option>)}
                </select>
              </Field>
            )}
          </Group>
          <Group title="Tema ve görseller" icon="palette">
            <Field label="Ana renk"><div className="sl-colors">{PALETTE.map((col) => <button key={col} type="button" className={form.theme.primary === col ? "is-on" : ""} style={{ background: col }} onClick={() => setT({ primary: col })} aria-label={`Renk ${col}`} />)}<input type="color" value={form.theme.primary || ctx.project.color || "#4338ca"} onChange={(e) => setT({ primary: e.target.value })} aria-label="Özel renk" /></div></Field>
            <Field label="Vurgu rengi (boşsa otomatik)"><div className="sl-colors"><input type="color" value={form.theme.accent || "#06b6d4"} onChange={(e) => setT({ accent: e.target.value })} aria-label="Vurgu rengi" />{form.theme.accent && <button type="button" className="btn btn--xs" onClick={() => setT({ accent: "" })}>Otomatik</button>}</div></Field>
            <Field label="Logo adresi (https://…)"><input type="url" value={form.theme.logo_url || ""} onChange={(e) => setT({ logo_url: e.target.value })} placeholder="https://" /></Field>
            <Field label="Kapak görseli (https://…)"><input type="url" value={form.theme.cover_url || ""} onChange={(e) => setT({ cover_url: e.target.value })} placeholder="https://" /></Field>
          </Group>
          <Group title="Proje tanıtımı ve künye" icon="info">
            <Field label="Tanıtım metni (boşsa proje açıklaması)"><textarea rows={5} value={c.intro || ""} onChange={(e) => setC({ intro: e.target.value })} /></Field>
            <div className="form-grid">
              <Field label="Tarih (boşsa proje tarihleri)"><input value={c.dates_text || ""} onChange={(e) => setC({ dates_text: e.target.value })} /></Field>
              <Field label="Mekân"><input value={c.venue || ""} onChange={(e) => setC({ venue: e.target.value })} /></Field>
              <Field label="Hedef kitle" className="span2"><input value={c.audience || ""} onChange={(e) => setC({ audience: e.target.value })} /></Field>
            </div>
            <small className="muted">Ek bilgiler (ör. Yayın, Katılımcı, Format)</small>
            <Pairs items={c.facts || []} onChange={(facts) => setC({ facts })} a="label" b="value" aLabel="Başlık" bLabel="Değer" max={8} add="Bilgi ekle" />
          </Group>
          <Group title="Rakamlarla (erişim)" icon="trend">
            <Pairs items={c.stats || []} onChange={(stats) => setC({ stats })} a="value" b="label" aLabel="Rakam" bLabel="Açıklama" max={9} add="Rakam ekle" />
            <small className="muted">1–4 rakam tanıtım sayfasında, 5 ve üzeri ayrı sayfada gösterilir.</small>
          </Group>
          <Group title="Görünürlük alanları" icon="eye"><Pairs items={c.visibility || []} onChange={(visibility) => setC({ visibility })} a="title" b="text" aLabel="Alan" bLabel="Açıklama" max={6} add="Alan ekle" multiline /></Group>
          <Group title="Referanslar / geçmiş" icon="award"><Pairs items={c.references || []} onChange={(references) => setC({ references })} a="name" b="text" aLabel="Marka / kurum" bLabel="Ör. Ana sponsor — 3 sezon" max={9} add="Referans ekle" /></Group>
          <Group title="İletişim ve kapanış" icon="user">
            <div className="form-grid">
              {[["name", "Ad soyad"], ["title", "Unvan"], ["phone", "Telefon"], ["email", "E-posta"], ["web", "Web"]].map(([k, l]) => <Field key={k} label={l}><input value={c.contact?.[k] || ""} onChange={(e) => setC({ contact: { ...c.contact, [k]: e.target.value } })} /></Field>)}
              <Field label="Kapanış başlığı"><input value={c.closing_title || ""} onChange={(e) => setC({ closing_title: e.target.value })} /></Field>
            </div>
            <Field label="Kapanış metni"><input value={c.closing || ""} onChange={(e) => setC({ closing: e.target.value })} /></Field>
          </Group>
        </fieldset>
        <section className="sl-pres__preview" aria-label="Canlı önizleme">
          {err ? <div className="error-note"><span>{err}</span></div> : html ? <iframe ref={frame} title="Sunum önizlemesi" srcDoc={html} sandbox="allow-same-origin" onLoad={() => { try { frame.current.contentWindow.scrollTo(0, scroll.current); } catch { /* yok */ } }} /> : <div className="sl-skeleton" />}
        </section>
      </div>
      {preview && <DocPreview pid={pid} canEdit={ctx.canEdit} title={`${form.title} · önizleme`} path={`${salesPath(pid)}/presentations/${presentation.id}/render`} shareRef={{ kind: "presentation", ref_id: presentation.id }} shares={(sales?.shares || []).filter((s) => s.kind === "presentation" && s.ref_id === presentation.id && !s.lead_id)} onClose={() => setPreview(false)} />}
      {mailing && <MailComposer ctx={ctx} presentationId={presentation.id} templateKey="sponsorluk_davet" onClose={() => setMailing(false)} />}
    </Modal>
  );
}
