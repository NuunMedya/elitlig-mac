// Saha ve maç planlama: ortak parçalar — API yolu, işlem sarmalayıcısı,
// takım seçici, iletişim bağlantıları, takım logosu, kaynak / gün / uygunluk
// rozetleri, kısa görüşme sonucu formu, taşıma hedefi, takım iletişim formu ve
// takım notları, sağdan açılan panel.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Field, Icon, Modal, openModalCount, useConfirm, useToast } from "../../components/ui";
import { request } from "../../api";
import { AVAIL, CALL_OUTCOMES, DAY_LABELS, DAY_SHORT, INBOX_SOURCES, QUICK_DUES, callError, contactOf, initials, outcomeMeta, timeAgo, timeLabel, toLocalInput } from "../../lib/planningUtils";

export const A = "/api/match-requests/admin";
export const NOTES = "/api/admin/team-notes";
const tone = (body) => (body?.fixture_pending || body?.stranded || body?.options_skipped?.length || body?.fixture_error ? "warn" : "success");

/**
 * Çağrı merkezi yazma işlemleri bağlantı ister (kuyruğa alınmaz): saat,
 * havuz ve kart durumları sunucuda birbirine bağlıdır.
 * call(method, path, body, { silent, ok }) → yanıt gövdesi | null
 */
export function useDeskCall(onDone) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const call = useCallback(async (method, path, body, { silent = false, ok, query } = {}) => {
    setBusy(true);
    try {
      const r = await request({ method, path, body, query, queue: false });
      if (!r.ok) {
        toast(r.offline ? "Çevrimdışısınız: saha ve maç planlama işlemleri için internet bağlantısı gerekir." : r.error?.message || "İşlem tamamlanamadı.", { tone: "error", timeout: 6000 });
        return null;
      }
      const data = r.data || {};
      if (!silent && (ok || data.message)) toast(ok || data.message, { tone: tone(data), timeout: tone(data) === "warn" ? 7000 : 3500 });
      await onDone?.(data);
      return data;
    } finally {
      setBusy(false);
    }
  }, [toast, onDone]);
  return { call, busy };
}

export const openExternal = (url) => { if (url) window.elitlig.app.openExternal(url); };
export const openSite = (path) => window.elitlig.app.openWeb(path);

/** Sağdan açılan panel (saat, kart, maç ayrıntısı). Escape üstte pencere yoksa kapatır. */
export function SidePanel({ title, eyebrow, badge, onClose, children, footer, width = 520, className = "" }) {
  // Açık pencerelerin (ör. adımın araç penceresi) üstünde, kendisinden sonra
  // açılan pencerelerin (ücretler, onay) altında kalır.
  const [layer] = useState(() => ({ depth: openModalCount() }));
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && openModalCount() <= layer.depth && !document.querySelector(".menu__list")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, layer.depth]);
  return (
    <div className="pl-layer" style={{ zIndex: 49 + layer.depth * 2 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`pl-panel ${className}`} style={{ width }} role="dialog" aria-label={typeof title === "string" ? title : "Ayrıntı"}>
        <header className="pl-panel__head">
          <div className="pl-panel__title">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
            {badge}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </header>
        <div className="pl-panel__body">{children}</div>
        {footer && <footer className="pl-panel__foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/** Aramalı takım seçici: yazdıkça süzülür, tıklayınca seçilir. */
export function TeamPicker({ teams = [], value, onChange, placeholder = "Takım adı yazın", exclude, label, autoFocus = false }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = teams.find((t) => String(t.id) === String(value));
  const hits = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr-TR");
    return teams.filter((t) => String(t.id) !== String(exclude ?? "") && (!n || String(t.team_name || "").toLocaleLowerCase("tr-TR").includes(n))).slice(0, 40);
  }, [teams, q, exclude]);
  const body = (
    <div className={`pl-picker ${open ? "is-open" : ""}`}>
      <div className="search-box">
        <Icon name="search" size={13} />
        <input value={open ? q : selected?.team_name || q} placeholder={selected ? selected.team_name : placeholder} autoFocus={autoFocus}
          onMouseDown={() => { if (!open) { setOpen(true); setQ(""); } }} onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); setQ(""); } if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}
          onBlur={() => setTimeout(() => setOpen(false), 160)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} aria-label={label || "Takım ara"} />
        {value ? <button type="button" className="icon-btn icon-btn--xs" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(""); setQ(""); }} aria-label="Seçimi temizle"><Icon name="x" size={11} /></button> : null}
      </div>
      {open && (
        <ul className="pl-picker__list" role="listbox">
          {hits.map((t) => (
            <li key={t.id}><button type="button" role="option" aria-selected={String(t.id) === String(value)} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(String(t.id)); setOpen(false); setQ(""); }}>{t.team_name}{t.city ? <small>{t.city}</small> : null}</button></li>
          ))}
          {!hits.length && <li className="muted small pl-picker__empty">Takım bulunamadı.</li>}
        </ul>
      )}
    </div>
  );
  return label ? <Field label={label}>{body}</Field> : body;
}

/** Takımın yetkilisi ve ara / WhatsApp / e-posta bağlantıları. */
export function ContactLinks({ teams, teamId, compact = false }) {
  const c = contactOf(teams, teamId);
  if (c.missingManager && !c.hasAny) return <span className="pl-contact is-missing"><Icon name="user" size={11} /> Yetkili kaydı yok</span>;
  return (
    <span className="pl-contact">
      {c.name && !compact && <span className="pl-contact__name"><Icon name="user" size={11} /> {c.name}</span>}
      {c.tel && <button type="button" className="ca-btn ca-btn--call" title={`Ara: ${c.phone}`} onClick={(e) => { e.stopPropagation(); openExternal(c.tel); }}><Icon name="phone" size={11} />{!compact && ` ${c.phone}`}</button>}
      {c.tel2 && !compact && <button type="button" className="ca-btn ca-btn--call" title={`Ara: ${c.phone2}`} onClick={(e) => { e.stopPropagation(); openExternal(c.tel2); }}><Icon name="phone" size={11} /> {c.phone2}</button>}
      {c.wa && <button type="button" className="ca-btn ca-btn--wa" title="WhatsApp ile yaz" onClick={(e) => { e.stopPropagation(); openExternal(c.wa); }}><Icon name="message" size={11} />{!compact && " WhatsApp"}</button>}
      {c.mail && <button type="button" className="ca-btn ca-btn--mail" title={c.email} onClick={(e) => { e.stopPropagation(); openExternal(c.mail); }}><Icon name="mail" size={11} />{!compact && ` ${c.email}`}</button>}
      {!c.tel && !c.wa && !c.mail && <span className="pl-contact is-missing"><Icon name="phone" size={11} /> Telefon kayıtlı değil</span>}
    </span>
  );
}

/** Kısa görüşme sonucu (öneri listelerinde): etiket + (gerekirse) zaman + not. */
export function CallOutcome({ teamName, busy, onSave, onCancel, compact = false }) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [at, setAt] = useState("");
  const meta = outcomeMeta(outcome);
  const ready = outcome && !callError({ outcome, note, at });
  const submit = async () => {
    if (!ready) return;
    const saved = await onSave({ outcome, note: note.trim() || undefined, callbackAt: at && meta.date ? new Date(at).toISOString() : undefined, at });
    if (saved !== null) { setOutcome(""); setNote(""); setAt(""); }
  };
  return (
    <div className={`pl-call ${compact ? "is-compact" : ""}`} role="group" aria-label={`${teamName || "Takım"} görüşme sonucu`}>
      <div className="pl-call__outcomes">
        {CALL_OUTCOMES.map((o) => (
          <button key={o.value} type="button" className={`pl-out ${outcome === o.value ? "is-on" : ""}`} style={{ "--sc": o.color }} aria-pressed={outcome === o.value} onClick={() => setOutcome(outcome === o.value ? "" : o.value)}>
            <Icon name={o.icon} size={12} /> {o.label}
          </button>
        ))}
      </div>
      {meta.date && <DuePicker value={at} onChange={setAt} required={meta.date === "required"} />}
      {outcome && (
        <div className="input-with-btn">
          <input value={note} maxLength={500} autoFocus placeholder={outcome === "note" ? "Notunuz (ör. kaptan değişti, yeni numara…)" : "Kısa not (isteğe bağlı)"} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} aria-label="Görüşme notu" />
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || !ready} onClick={submit}>Kaydet</button>
          {onCancel && <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>Vazgeç</button>}
        </div>
      )}
    </div>
  );
}

/** Tekrar arama / geri dönüş zamanı: hızlı seçimler + tarih-saat. */
export function DuePicker({ value, onChange, required = false, label }) {
  return (
    <div className="pl-due">
      <span className="pl-due__label"><Icon name="clock" size={11} /> {label || (required ? "Ne zaman aranacak?" : "Ne zaman dönülecek? (isteğe bağlı)")}</span>
      {QUICK_DUES.map((d) => { const v = toLocalInput(d.make(new Date())); return <button key={d.key} type="button" className={`chip ${value === v ? "" : "chip--off"}`} onClick={() => onChange(v)}>{d.label}</button>; })}
      <input type="datetime-local" className="pl-input-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Tekrar arama zamanı" />
      {value && !required && <button type="button" className="link-btn small" onClick={() => onChange("")}>Kaldır</button>}
    </div>
  );
}

/** Takım logosu ya da baş harfleri. */
export function TeamAvatar({ name, logo, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const hue = [...String(name || "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span className="pl-avatar" style={{ width: size, height: size, "--hue": hue, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {logo && !failed ? <img src={logo} alt="" onError={() => setFailed(true)} /> : initials(name) || <Icon name="team" size={Math.round(size * 0.5)} />}
    </span>
  );
}

/** Talebin kaynağı: Uygulama / Telefon / Havuz / Geri arama … */
export function SourceBadge({ source, at }) {
  const m = INBOX_SOURCES[source] || INBOX_SOURCES.phone;
  return <span className={`pl-source is-${m.tone || "plain"}`} title={m.hint}><Icon name={m.icon} size={11} /> {m.label}{at ? <small>{timeAgo(at)}</small> : null}</span>;
}

/** Haftanın günleri: istenenler dolu. */
export function DayChips({ days = [], compact = false }) {
  return (
    <span className={`pl-daychips ${compact ? "is-compact" : ""}`} aria-label={days.length ? `Günler: ${days.map((d) => DAY_LABELS[d]).join(", ")}` : "Gün belirtilmedi"}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => <i key={d} className={days.includes(d) ? "is-on" : ""} title={DAY_LABELS[d]}>{DAY_SHORT[d].slice(0, compact ? 1 : 3)}</i>)}
    </span>
  );
}

/** Seçenek çipi: gün saat · saha + uygunluk rengi. */
export function OptionPill({ option, showVenue = true, onClick }) {
  const a = AVAIL[option.avail] || AVAIL.free;
  const label = `${DAY_SHORT[option.day] || ""} ${String(option.date || "").slice(8, 10)}.${String(option.date || "").slice(5, 7)} ${timeLabel(option.hour, option.minute)}`;
  const title = `${option.venue_name || ""} · ${label} · ${a.label}${option.others?.length ? `: ${option.others.map((t) => t.team_name).join(", ")}` : ""}`;
  const body = <><i className={`pl-dot is-${a.tone}`} /><strong>{label}</strong>{showVenue && option.venue_name ? <small>{option.venue_name}</small> : null}{option.avail === "candidates" || option.avail === "opponent" ? <em>{option.avail === "opponent" ? "rakip hazır" : `${option.others.length} aday`}</em> : option.avail === "taken" ? <em>dolu</em> : null}</>;
  return onClick ? <button type="button" className={`pl-opt is-${a.tone}`} title={title} onClick={onClick}>{body}</button> : <span className={`pl-opt is-${a.tone}`} title={title}>{body}</span>;
}

/** Görüşme etiketi (renkli). */
export const OutcomeTag = ({ outcome, label }) => { const m = outcome ? outcomeMeta(outcome) : CALL_OUTCOMES.find((o) => o.label === label || (label && label.startsWith(o.label))) || { ...outcomeMeta(null), icon: "message" }; return <span className="pl-outtag" style={{ "--sc": m.color }}><Icon name={m.icon} size={10} /> {label || m.label}</span>; };

const timesOf = (venue) => (Array.isArray(venue?.grid?.times) ? venue.grid.times : []);
/** Başka saate taşıma / tek saate ekleme hedefi: saha + tarih + saat. */
export function MoveTargetPicker({ venues, defaultVenueId, defaultDate, bookingWindow, busy, onConfirm, onCancel, confirmLabel = "Taşı" }) {
  const [venueId, setVenueId] = useState(defaultVenueId || venues[0]?.public_id || "");
  const [date, setDate] = useState(defaultDate || bookingWindow?.start || "");
  const venue = venues.find((v) => v.public_id === venueId) || null;
  const times = timesOf(venue);
  const [time, setTime] = useState("");
  useEffect(() => {
    setTime((cur) => (times.some((t) => timeLabel(t.hour, t.minute) === cur) ? cur : times[0] ? timeLabel(times[0].hour, times[0].minute) : ""));
  }, [venueId, times.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = () => {
    const picked = times.find((t) => timeLabel(t.hour, t.minute) === time);
    if (venue && date && picked) onConfirm({ venueId: venue.public_id, date, hour: picked.hour, minute: picked.minute || 0 });
  };
  return (
    <div className="pl-move" role="group" aria-label="Hedef saat">
      <Field label="Saha"><select value={venueId} onChange={(e) => setVenueId(e.target.value)}>{venues.map((v) => <option key={v.public_id} value={v.public_id}>{v.name}</option>)}</select></Field>
      <Field label="Tarih"><input type="date" value={date} min={bookingWindow?.start || undefined} max={bookingWindow?.end || undefined} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Saat"><select value={time} disabled={!times.length} onChange={(e) => setTime(e.target.value)}>{times.map((t) => { const l = timeLabel(t.hour, t.minute); return <option key={l} value={l}>{l}</option>; })}</select></Field>
      <div className="row-gap pl-move__actions">
        <button type="button" className="btn btn--sm btn--primary" disabled={busy || !date || !time} onClick={confirm}><Icon name="swap" size={12} /> {confirmLabel}</button>
        <button type="button" className="btn btn--sm" disabled={busy} onClick={onCancel}>Vazgeç</button>
      </div>
    </div>
  );
}

export const CONTACT_FIELDS = [
  { key: "contact_name", label: "İletişim kişisi", type: "text", managerKey: "name", max: 120 },
  { key: "phone", label: "Telefon", type: "tel", managerKey: "phone", max: 40 },
  { key: "phone2", label: "İkinci telefon", type: "tel", max: 40 },
  { key: "whatsapp", label: "WhatsApp", type: "tel", max: 40 },
  { key: "email", label: "E-posta", type: "email", managerKey: "email", max: 160 },
];
const EMPTY_CONTACT = Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, ""]));

/** Takımın yönetim tarafındaki iletişim bilgisi (boş alanda yetkilinin hesabındaki bilgi kullanılır). */
export function TeamContactForm({ teamId, teamName, manager, contact: initial, onSaved, onCancel }) {
  const toast = useToast();
  const [contact, setContact] = useState(initial ? { ...EMPTY_CONTACT, ...initial } : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initial) return undefined;
    let off = false;
    request({ path: `${NOTES}/${teamId}`, cache: false }).then((r) => { if (!off) setContact({ ...EMPTY_CONTACT, ...(r.data?.contact || {}) }); });
    return () => { off = true; };
  }, [teamId, initial]);
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    const r = await request({ method: "PUT", path: `${NOTES}/${teamId}/contact`, body: contact, queue: false });
    setBusy(false);
    if (!r.ok) { toast(r.offline ? "Çevrimdışısınız: iletişim bilgisi için bağlantı gerekir." : r.error?.message || "Kaydedilemedi.", { tone: "error" }); return; }
    setContact({ ...EMPTY_CONTACT, ...(r.data?.contact || {}) });
    toast(`${teamName || "Takım"}: iletişim bilgisi kaydedildi.`, { tone: "success" });
    onSaved?.(r.data?.contact);
  };
  if (!contact) return <p className="muted small">İletişim bilgisi yükleniyor…</p>;
  return (
    <form className="pl-contactform" onSubmit={save}>
      <div className="form-grid">
        {CONTACT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}><input type={f.type} value={contact[f.key] || ""} maxLength={f.max} placeholder={f.managerKey && manager?.[f.managerKey] ? `Hesapta: ${manager[f.managerKey]}` : ""} onChange={(e) => setContact({ ...contact, [f.key]: e.target.value })} /></Field>
        ))}
      </div>
      <div className="row-gap">
        <small className="muted spacer">{contact.updated_at ? `Son düzenleme ${timeAgo(contact.updated_at)}` : manager ? "Boş alanlarda yetkilinin hesabındaki bilgi kullanılır." : "Takımın yetkili hesabı yok; girdiğiniz kişi yetkili olarak görünür."}</small>
        {onCancel && <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>Kapat</button>}
        <button type="submit" className="btn btn--sm btn--primary" disabled={busy}>İletişimi kaydet</button>
      </div>
    </form>
  );
}

const NOTE_EXAMPLES = ["Çoğunlukla çarşamba günleri oynuyorlar", "Zorda kalırsan çağır", "Hafta sonu oynamıyorlar"];
/** Takım notları özeti (sabitlenenler önce) + "Notlar ve iletişim" penceresi. Yetki yoksa hiç çizilmez. */
export function TeamNotesPanel({ teamId, teamName, manager, onChanged }) {
  const [info, setInfo] = useState(null);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    if (!teamId) return;
    const r = await request({ path: `${NOTES}/${teamId}` });
    if (r.ok) { setInfo(r.data); setDenied(false); } else if (r.error?.status === 403 || r.error?.status === 401) setDenied(true);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);
  if (denied || !teamId) return null;
  const notes = info?.notes || [];
  return (
    <section className="pl-section pl-notes">
      <div className="pl-section__head">
        <h3><Icon name="note" size={13} /> Takım notları</h3>
        <button type="button" className="btn btn--xs" onClick={() => setOpen(true)}><Icon name="sliders" size={11} /> Notlar ve iletişim</button>
      </div>
      {notes.length ? (
        <ul className="pl-notes__list">{notes.slice(0, 4).map((n) => <li key={n.id} className={n.pinned ? "is-pinned" : ""}><Icon name={n.pinned ? "pin" : "circle"} size={10} /> <span>{n.body}</span></li>)}</ul>
      ) : <p className="muted small">Not yok. Örn. “çoğunlukla çarşamba oynarlar”, “zorda kalırsan çağır”.</p>}
      {notes.length > 4 && <small className="muted">+{notes.length - 4} not daha</small>}
      {open && <TeamNotesDialog teamId={teamId} teamName={teamName} manager={manager} info={info} onClose={() => setOpen(false)} onChanged={() => { load(); onChanged?.(); }} />}
    </section>
  );
}

function TeamNotesDialog({ teamId, teamName, manager, info, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (method, path, body) => {
    setBusy(true);
    const r = await request({ method, path, body, queue: false });
    setBusy(false);
    if (!r.ok) { toast(r.offline ? "Çevrimdışısınız: takım notları için bağlantı gerekir." : r.error?.message || "Kaydedilemedi.", { tone: "error" }); return null; }
    onChanged();
    return r.data;
  };
  const notes = info?.notes || [];
  return (
    <Modal title={`${teamName || "Takım"} · notlar ve iletişim`} onClose={onClose} width={620} footer={<button type="button" className="btn" onClick={onClose}>Kapat</button>}>
      <p className="muted small">Notları yalnız il yöneticisi ve editör görür.</p>
      <section className="pl-section">
        <div className="pl-section__head"><h3><Icon name="phone" size={13} /> İletişim bilgisi</h3></div>
        <TeamContactForm teamId={teamId} teamName={teamName} manager={manager} contact={info?.contact || {}} onSaved={onChanged} />
      </section>
      <section className="pl-section">
        <div className="pl-section__head"><h3><Icon name="note" size={13} /> Notlar <span className="pill pill--xs">{notes.length}</span></h3></div>
        <textarea rows={2} maxLength={1000} value={draft} placeholder="Örn. çoğunlukla çarşamba günleri oynuyorlar" onChange={(e) => setDraft(e.target.value)} />
        <div className="chips">{NOTE_EXAMPLES.map((x) => <button key={x} type="button" className="chip chip--off" onClick={() => setDraft(x)}>{x}</button>)}</div>
        <div className="row-gap">
          <label className="toggle spacer"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Üste sabitle</label>
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || !draft.trim()} onClick={async () => { if (await run("POST", `${NOTES}/${teamId}/notes`, { body: draft.trim(), pinned: pin })) { setDraft(""); setPin(false); } }}><Icon name="plus" size={12} /> Not ekle</button>
        </div>
        <ul className="pl-notes__full">
          {notes.map((n) => (
            <li key={n.id} className={n.pinned ? "is-pinned" : ""}>
              <div><p>{n.body}</p><small className="muted">{[n.author, timeAgo(n.created_at)].filter(Boolean).join(" · ")}</small></div>
              <button type="button" className="icon-btn icon-btn--xs" disabled={busy} title={n.pinned ? "Sabitlemeyi kaldır" : "Üste sabitle"} onClick={() => run("PATCH", `${NOTES}/${teamId}/notes/${n.id}`, { pinned: !n.pinned })}><Icon name="pin" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" disabled={busy} title="Notu sil" onClick={async () => { if (await confirm({ title: "Notu sil", message: "Bu not silinsin mi?", confirmLabel: "Sil", danger: true })) run("DELETE", `${NOTES}/${teamId}/notes/${n.id}`); }}><Icon name="trash" size={12} /></button>
            </li>
          ))}
          {!notes.length && <li className="muted small">Bu takım için henüz not yok.</li>}
        </ul>
      </section>
    </Modal>
  );
}

/** Türü / durumu gösteren küçük etiket. */
export const Tag = ({ tone, icon, children, solid = false, title }) => (
  <span className={`pl-tag ${tone ? `is-${tone}` : ""} ${solid ? "is-solid" : ""}`} title={title}>{icon && <Icon name={icon} size={10} />}{children}</span>
);
