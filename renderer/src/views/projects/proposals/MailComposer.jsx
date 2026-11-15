// Şablonla e-posta (tek kişi ya da seçili liste): hazır / kendi / proje
// şablonları, değişkenler, teklif ve sunum bağlantısı, alıcı başına önizleme.
// Sunucuda SMTP açıksa tek tıkla gönderilir; değilse her ileti varsayılan posta
// uygulamasında açılır (mailto) ya da kopyalanır, gönderilenler iletişim
// geçmişine işlenir.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Field, Icon, Modal, useConfirm, useToast } from "../../../components/ui";
import { get, request } from "../../../api";
import { VARIABLES, displayNumber, insertAt, isValidEmail, mergeAudienceRecipients, usedVariables } from "../../../lib/salesUtils";
import { Avatar } from "../common";
import { SALES, copyText, refreshSales, salesPath, useCall, useSales } from "./salesCommon";

const pick = (list, key) => list.find((t) => t.id === `builtin:${key}`) || list[0] || null;

export default function MailComposer({ ctx, leadIds = [], proposalId = null, presentationId = null, templateKey = null, onClose }) {
  const pid = ctx.project.id;
  const toast = useToast();
  const confirm = useConfirm();
  const call = useCall();
  const { data: sales } = useSales(pid);
  const [recipients, setRecipients] = useState(() => [...new Set(leadIds.map(Number))]);
  // Projede kişi olmayan alıcılar (Rehber hedef kitlesinden): { email, name, company }.
  const [extras, setExtras] = useState([]);
  const [audiences, setAudiences] = useState(null);
  const [audBusy, setAudBusy] = useState(false);
  const total = recipients.length + extras.length;
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [proposal, setProposal] = useState(proposalId ? String(proposalId) : "");
  const [presentation, setPresentation] = useState(presentationId ? String(presentationId) : "");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const [saving, setSaving] = useState(null);
  const last = useRef({ name: "body", start: null, end: null });
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const smtp = Boolean(sales?.mail?.enabled);
  const leadById = useMemo(() => new Map(ctx.leads.map((l) => [Number(l.id), l])), [ctx.leads]);
  const candidates = ctx.leads.filter((l) => (l.kind || "customer") !== "supplier" && !recipients.includes(Number(l.id)));

  const apply = (t) => { if (!t) return; setTemplateId(t.id); setSubject(t.subject); setBody(t.body); };
  useEffect(() => {
    let alive = true;
    get(`${SALES}/templates`, { project_id: pid }).then((r) => {
      if (!alive) return;
      const items = r.ok ? r.data.items : [];
      setTemplates(items);
      apply(pick(items, templateKey || (proposalId ? "teklif_gonderim" : presentationId ? "sponsorluk_davet" : "toplanti_talebi")));
    });
    return () => { alive = false; };
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rehber hedef kitleleri (Elitlig sistem kitlesi dahil; yetkisizse erişimsiz görünür).
  useEffect(() => {
    let alive = true;
    get("/api/tools/contacts/audiences").then((r) => { if (alive) setAudiences(r.ok ? (r.data?.items || []).filter((a) => a.access !== false && Number(a.count) > 0) : []); });
    return () => { alive = false; };
  }, []);
  const addAudience = async (id) => {
    if (!id) return;
    setAudBusy(true);
    const r = await get(`/api/tools/contacts/audiences/${id}/recipients`, { channel: "email" });
    setAudBusy(false);
    if (!r.ok) { toast(r.offline ? "Hedef kitleyi okumak için bağlantı gerekir." : r.error?.message || "Hedef kitle okunamadı.", { tone: "error" }); return; }
    const m = mergeAudienceRecipients({ items: r.data?.items || [], leads: ctx.leads, leadIds: recipients, extras });
    setRecipients(m.leadIds);
    setExtras(m.extras);
    const name = r.data?.audience?.name || "Hedef kitle";
    const parts = [m.matched && `${m.matched} proje kişisi`, m.added && `${m.added} rehber kişisi`].filter(Boolean);
    const skippedNote = [m.duplicate && `${m.duplicate} zaten listede`, r.data?.totals?.hidden && `${r.data.totals.hidden} erişiminiz dışında`].filter(Boolean).join(", ");
    toast(parts.length ? `${name}: ${parts.join(" ve ")} eklendi${skippedNote ? ` (${skippedNote})` : ""}.` : `${name}: eklenecek yeni e-posta adresi yok${skippedNote ? ` (${skippedNote})` : ""}.`, { tone: parts.length ? "success" : "warn" });
  };

  const vars = useMemo(() => usedVariables(subject, body), [subject, body]);
  // Şablon bir bağlantı kullanıyorsa: projenin sunumu / kişinin teklifi kendiliğinden seçilir.
  useEffect(() => {
    if (vars.includes("sunum_linki") && !presentation && sales?.presentations?.length) setPresentation(String(sales.presentations[0].id));
    if ((vars.includes("teklif_linki") || vars.includes("teklif_no")) && !proposal && recipients.length === 1) {
      const q = (sales?.proposals || []).find((x) => Number(x.lead_id) === Number(recipients[0]));
      if (q) setProposal(String(q.id));
    }
  }, [vars, sales, recipients, presentation, proposal]);
  const payload = useMemo(() => ({
    subject, body, ...(templateId ? { template_id: templateId } : {}), lead_ids: recipients,
    ...(extras.length ? { recipients: extras.map(({ email, name, company }) => ({ email, name, company })) } : {}),
    ...(proposal ? { proposal_id: Number(proposal) } : {}), ...(presentation ? { presentation_id: Number(presentation) } : {}),
  }), [subject, body, templateId, recipients, extras, proposal, presentation]);

  useEffect(() => {
    if (!subject.trim() || !body.trim() || !total) { setPreview(null); setPreviewError(""); return undefined; }
    if (vars.includes("teklif_linki") && !proposal) { setPreview(null); setPreviewError("Şablonda {{teklif_linki}} var: bir teklif seçin."); return undefined; }
    if (vars.includes("sunum_linki") && !presentation) { setPreview(null); setPreviewError("Şablonda {{sunum_linki}} var: bir sunum seçin."); return undefined; }
    const t = setTimeout(async () => {
      const r = await request({ method: "POST", path: `${salesPath(pid)}/mail/preview`, body: payload, queue: false });
      if (r.ok) { setPreview(r.data); setPreviewError(""); } else { setPreview(null); setPreviewError(r.offline ? "Önizleme için internet bağlantısı gerekir." : r.error?.message || "Önizleme hazırlanamadı."); }
    }, 450);
    return () => clearTimeout(t);
  }, [pid, payload, subject, body, total, vars, proposal, presentation]);

  const remember = (name) => (e) => { last.current = { name, start: e.target.selectionStart, end: e.target.selectionEnd }; };
  const insertVar = (key) => {
    const token = `{{${key}}}`;
    const { name, start, end } = last.current;
    const isSubject = name === "subject";
    const r = insertAt(isSubject ? subject : body, start, end, token);
    (isSubject ? setSubject : setBody)(r.value);
    last.current = { name, start: r.caret, end: r.caret };
    requestAnimationFrame(() => { const el = (isSubject ? subjectRef : bodyRef).current; el?.focus(); el?.setSelectionRange(r.caret, r.caret); });
  };

  const ready = preview?.messages?.filter((m) => m.ok) || [];
  const skipped = preview?.messages?.filter((m) => !m.ok) || [];
  const shown = ready[Math.min(idx, Math.max(0, ready.length - 1))];
  const changed = () => { refreshSales(); ctx.actions.reload(); };

  const prepareManual = async () => {
    setBusy("manual");
    const res = await call({ method: "POST", path: `${salesPath(pid)}/mail/preview`, body: payload });
    setBusy("");
    if (!res) return;
    const list = res.messages.filter((m) => m.ok);
    setManual(list);
    setDone(new Set());
    if (list.length === 1) { window.elitlig.app.openExternal(list[0].mailto); setDone(new Set([list[0].to])); }
  };
  const send = async () => {
    setBusy("send");
    const r = await request({ method: "POST", path: `${salesPath(pid)}/mail/send`, body: payload, queue: false });
    setBusy("");
    if (!r.ok) {
      if (r.error?.code === "MAIL_DISABLED") { prepareManual(); return; }
      toast(r.offline ? "Çevrimdışısınız: e-posta göndermek için bağlantı gerekir." : r.error?.message || "Gönderilemedi.", { tone: "error", timeout: 5000 });
      return;
    }
    changed();
    toast(r.data.failed ? `${r.data.sent} e-posta gönderildi, ${r.data.failed} gönderilemedi.` : `${r.data.sent} e-posta gönderildi ve iletişim geçmişine işlendi.`, { tone: r.data.sent ? "success" : "error" });
    if (r.data.sent) onClose();
  };
  const logManual = async () => {
    const list = manual.filter((m) => done.has(m.to));
    if (!list.length) return;
    setBusy("log");
    const res = await call({ method: "POST", path: `${salesPath(pid)}/mail/log`, body: { transport: "mailto", template_id: templateId || null, ...(proposal ? { proposal_id: Number(proposal) } : {}), ...(presentation ? { presentation_id: Number(presentation) } : {}), messages: list.map((m) => ({ lead_id: m.lead_id, to: m.to, name: m.name, subject: m.subject, body: m.body })) } }, `${list.length} gönderim iletişim geçmişine işlendi.`);
    setBusy("");
    if (res) { changed(); onClose(); }
  };

  const current = templates?.find((t) => t.id === templateId);
  const dirty = current && (current.subject !== subject || current.body !== body);
  const saveTemplate = async () => {
    if (!saving?.name?.trim()) return;
    const res = await call({ method: "POST", path: `${SALES}/templates`, body: { name: saving.name.trim(), subject, body, category: "Kendi şablonum", ...(saving.project ? { project_id: pid } : {}) } }, "Şablon kaydedildi.");
    if (res) { setTemplates((l) => [res.item, ...(l || [])]); setTemplateId(res.item.id); setSaving(null); }
  };
  const updateTemplate = async () => {
    const res = await call({ method: "PATCH", path: `${SALES}/templates/${current.id}`, body: { subject, body } }, "Şablon güncellendi.");
    if (res) setTemplates((l) => l.map((t) => (t.id === res.item.id ? res.item : t)));
  };
  const removeTemplate = async () => {
    if (!(await confirm({ title: "Şablon silinsin mi?", message: `“${current.name}” silinecek.`, confirmLabel: "Sil", danger: true }))) return;
    if (await call({ method: "DELETE", path: `${SALES}/templates/${current.id}` }, "Şablon silindi.")) {
      const rest = templates.filter((t) => t.id !== current.id);
      setTemplates(rest);
      apply(pick(rest, "toplanti_talebi"));
    }
  };
  const groups = templates ? [["Hazır şablonlar", templates.filter((t) => t.builtin)], ["Bu projenin şablonları", templates.filter((t) => !t.builtin && t.project_id)], ["Şablonlarım", templates.filter((t) => !t.builtin && !t.project_id)]].filter(([, l]) => l.length) : [];

  if (manual) {
    return (
      <Modal title="Posta uygulamasıyla gönder" onClose={onClose} width={720} footer={<>
        <span className="muted small spacer">{done.size}/{manual.length} gönderildi işaretli</span>
        <button type="button" className="btn" onClick={() => setManual(null)}>Geri</button>
        <button type="button" className="btn btn--primary" disabled={!done.size || busy === "log"} onClick={logManual}><Icon name="activity" size={13} /> Geçmişe işle ({done.size})</button>
      </>}>
        <p className="sl-note"><Icon name="info" size={14} /> {smtp ? "İletiler kişiye özel hazırlandı." : "Sunucuda e-posta gönderimi açık değil; iletiler kişiye özel hazırlandı."} “Posta uygulamasında aç” ile gönderin ya da kopyalayın; gönderdiklerinizi işaretleyip geçmişe işleyin.</p>
        <ul className="sl-manual">
          {manual.map((m) => (
            <li key={m.to} className={done.has(m.to) ? "is-done" : ""}>
              <Avatar name={m.name || m.to} size={28} />
              <span className="sl-manual__who"><strong>{m.name || m.to}</strong><small>{m.to} · {m.subject}</small></span>
              <button type="button" className="btn btn--sm" onClick={() => { window.elitlig.app.openExternal(m.mailto); setDone((s) => new Set([...s, m.to])); }}><Icon name="mail" size={12} /> Posta uygulamasında aç</button>
              <button type="button" className="btn btn--sm" onClick={async () => toast((await copyText(`${m.subject}\n\n${m.body}`)) ? "Konu ve metin kopyalandı." : "Kopyalanamadı.")}><Icon name="copy" size={12} /> Kopyala</button>
              <label className="sl-toggle sl-toggle--sm"><input type="checkbox" checked={done.has(m.to)} onChange={(e) => setDone((s) => { const n = new Set(s); if (e.target.checked) n.add(m.to); else n.delete(m.to); return n; })} /> Gönderildi</label>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal title={total > 1 ? `Toplu e-posta · ${total} kişi` : "Şablonla e-posta"} onClose={onClose} width={1080} className="modal--tool sl-mail" footer={<>
      <span className={`sl-smtp spacer ${smtp ? "is-on" : ""}`}><Icon name={smtp ? "cloud" : "mail"} size={13} /> {smtp ? "Sunucudan gönderilir" : "Posta uygulamanızla gönderilir"}</span>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      {smtp && <button type="button" className="btn" disabled={!ready.length || Boolean(busy)} onClick={prepareManual}>Posta uygulamasıyla</button>}
      <button type="button" className="btn btn--primary" disabled={!ctx.canEdit || !ready.length || Boolean(busy)} onClick={smtp ? send : prepareManual}><Icon name="send" size={13} /> {busy === "send" ? "Gönderiliyor…" : smtp ? `Gönder (${ready.length})` : `Hazırla (${ready.length})`}</button>
    </>}>
      <div className="sl-mail__grid">
        <div className="sl-mail__form">
          <Field label={`Alıcılar · ${total} kişi`}>
            <div className="sl-recips">
              {recipients.map((id) => {
                const l = leadById.get(id);
                if (!l) return null;
                const ok = isValidEmail(l.email);
                return <span key={id} className={`sl-recip ${ok ? "" : "is-bad"}`} title={ok ? l.email : "E-posta adresi yok ya da geçersiz"}><Avatar name={l.name} size={18} />{l.name}{!ok && <Icon name="alert" size={11} />}<button type="button" onClick={() => setRecipients((r) => r.filter((x) => x !== id))} aria-label={`${l.name} çıkar`}><Icon name="x" size={11} /></button></span>;
              })}
              {extras.map((x) => (
                <span key={x.email} className="sl-recip sl-recip--extra" title={`${x.email} · Rehber'den (projede kişi değil)`}><Avatar name={x.name || x.email} size={18} />{x.name || x.email}<button type="button" onClick={() => setExtras((l) => l.filter((y) => y.email !== x.email))} aria-label={`${x.name || x.email} çıkar`}><Icon name="x" size={11} /></button></span>
              ))}
              {audiences?.length > 0 && (
                <select className="sl-recips__add" value="" disabled={audBusy} aria-label="Hedef kitleden alıcı ekle" onChange={(e) => addAudience(e.target.value)}>
                  <option value="">{audBusy ? "Kitle okunuyor…" : "+ Hedef kitleden alıcı ekle"}</option>
                  {audiences.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.with_email ?? a.count} e-posta</option>)}
                </select>
              )}
              {candidates.length > 0 && (
                <select className="sl-recips__add" value="" aria-label="Alıcı ekle" onChange={(e) => { const v = Number(e.target.value); if (v) setRecipients((r) => [...r, v]); }}>
                  <option value="">+ Kişi ekle</option>
                  {candidates.map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` · ${l.company}` : ""}{l.email ? "" : " (e-posta yok)"}</option>)}
                </select>
              )}
            </div>
            {sales?.limits?.bulk && total > sales.limits.bulk && <p className="sl-warn"><Icon name="alert" size={12} /> Tek seferde en fazla {sales.limits.bulk} kişiye gönderilebilir; listeyi küçültün.</p>}
          </Field>
          <div className="form-grid">
            <Field label="Şablon">
              <select value={templateId} onChange={(e) => apply(templates.find((t) => t.id === e.target.value))} disabled={!templates} aria-label="Şablon">
                {!templates && <option>Yükleniyor…</option>}
                {groups.map(([g, list]) => <optgroup key={g} label={g}>{list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
              </select>
            </Field>
            <div className="sl-tplacts">
              {current && !current.builtin && dirty && <button type="button" className="btn btn--sm" onClick={updateTemplate}>Şablonu güncelle</button>}
              {current && !current.builtin && <button type="button" className="icon-btn" title="Şablonu sil" onClick={removeTemplate}><Icon name="trash" size={13} /></button>}
              <button type="button" className="btn btn--sm" onClick={() => setSaving({ name: "", project: false })}><Icon name="plus" size={12} /> Şablon olarak kaydet</button>
            </div>
          </div>
          {saving && (
            <div className="sl-savetpl">
              <input autoFocus placeholder="Şablon adı" aria-label="Şablon adı" value={saving.name} onChange={(e) => setSaving((s) => ({ ...s, name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTemplate(); } }} />
              <label className="sl-toggle sl-toggle--sm"><input type="checkbox" checked={saving.project} onChange={(e) => setSaving((s) => ({ ...s, project: e.target.checked }))} /> Proje ekibiyle paylaş</label>
              <button type="button" className="btn btn--primary btn--sm" disabled={!saving.name.trim()} onClick={saveTemplate}>Kaydet</button>
              <button type="button" className="btn btn--sm" onClick={() => setSaving(null)}>Vazgeç</button>
            </div>
          )}
          <div className="form-grid">
            <Field label="Teklif">
              <select value={proposal} onChange={(e) => setProposal(e.target.value)} aria-label="Teklif">
                <option value="">Teklif eklenmedi</option>
                {(sales?.proposals || []).map((q) => <option key={q.id} value={q.id}>{displayNumber(q.number, q.revision)} · {q.recipient_company || q.recipient_name || q.title}</option>)}
              </select>
            </Field>
            <Field label="Sunum">
              <select value={presentation} onChange={(e) => setPresentation(e.target.value)} aria-label="Sunum">
                <option value="">Sunum eklenmedi</option>
                {(sales?.presentations || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Konu"><input ref={subjectRef} value={subject} maxLength={250} onChange={(e) => { setSubject(e.target.value); remember("subject")(e); }} onSelect={remember("subject")} onFocus={remember("subject")} aria-label="Konu" /></Field>
          <Field label="Metin"><textarea ref={bodyRef} rows={12} className="sl-mail__body" value={body} onChange={(e) => { setBody(e.target.value); remember("body")(e); }} onSelect={remember("body")} onFocus={remember("body")} aria-label="E-posta metni" /></Field>
          <div className="sl-vars" role="group" aria-label="Değişken ekle">
            <small>Değişken ekle:</small>
            {VARIABLES.map(([k, l]) => <button key={k} type="button" className="sl-var" title={`{{${k}}}`} onClick={() => insertVar(k)}>{l}</button>)}
          </div>
        </div>
        <aside className="sl-mail__preview">
          <header>
            <strong><Icon name="eye" size={13} /> Önizleme</strong>
            {ready.length > 1 && <select className="select-sm" value={Math.min(idx, ready.length - 1)} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Önizlenen alıcı">{ready.map((m, i) => <option key={m.to} value={i}>{m.name || m.to}</option>)}</select>}
          </header>
          {previewError ? <div className="error-note"><span>{previewError}</span></div> : !total ? <p className="muted small">Alıcı seçin.</p> : !shown ? <p className="muted small">{preview ? "Geçerli e-posta adresi olan alıcı yok." : "Hazırlanıyor…"}</p> : (
            <div className="sl-mailcard">
              <div className="sl-mailcard__row"><small>Kime</small><span>{shown.name ? `${shown.name} <${shown.to}>` : shown.to}</span></div>
              <div className="sl-mailcard__row"><small>Konu</small><b>{shown.subject}</b></div>
              <pre className="sl-mailcard__body selectable">{shown.body}</pre>
              {shown.missing?.length > 0 && <p className="sl-warn"><Icon name="alert" size={12} /> Boş kalan: {shown.missing.map((k) => `{{${k}}}`).join(", ")}</p>}
              {shown.unknown?.length > 0 && <p className="sl-warn"><Icon name="alert" size={12} /> Tanınmayan: {shown.unknown.map((k) => `{{${k}}}`).join(", ")}</p>}
            </div>
          )}
          {skipped.length > 0 && <div className="sl-skipped"><strong>{skipped.length} alıcı atlanacak</strong><ul>{skipped.map((m, i) => <li key={`${m.lead_id}-${i}`}>{m.name || leadById.get(Number(m.lead_id))?.name || m.to || "—"}: {m.error}</li>)}</ul></div>}
        </aside>
      </div>
    </Modal>
  );
}
