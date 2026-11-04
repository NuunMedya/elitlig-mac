// Mesajlar: kişi seçici (yeni sohbet, yeni grup, üye ekle), iletme, tepkiler,
// mesaj bilgisi, anket, konum, ek önizleme, şikayet ve fotoğraf görüntüleyici.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Field, Icon, Modal, Spinner } from "../../components/ui";
import { get, useDebounced } from "../../api";
import { Avatar, C, chatApi, isImageName } from "./common";
import { chatPreview, clockTime, dayLabel, directorySections, filterChats, formatBytes, isGroupChat, mediaUrl } from "../../lib/chatUtils";

/* -------------------------------- kişi listesi -------------------------------- */
/** Rehberden kişi listesi: Yönetim / Takım başkanları / Oyuncular / Üyeler (arama ile). Takım adı öne çıkar. */
export function PeopleList({ q, multi = false, selected, onToggle, onPick, exclude = [] }) {
  const query = useDebounced(q, 250);
  const [dir, setDir] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    get(`${C}/directory`, { q: query.trim().length >= 2 ? query.trim() : undefined, limit: 60 }).then((res) => { if (live) { setDir(res.ok ? res.data : { error: res.error }); setLoading(false); } });
    return () => { live = false; };
  }, [query]);
  const sections = useMemo(() => directorySections(dir, { q, exclude }), [dir, q, exclude]);
  if (loading && !dir) return <Spinner />;
  if (dir?.error) return <div className="ms-note">{dir.error.message || "Rehber alınamadı."}</div>;
  return (
    <div className="ms-people">
      {sections.map((s) => (
        <section key={s.key}>
          <h5>{s.title} <span>{s.items.length}</span></h5>
          {s.items.map((p) => {
            const on = selected?.has(Number(p.user_id));
            return (
              <button key={`${s.key}${p.user_id}`} type="button" className={`ms-person ${on ? "is-on" : ""}`} onClick={() => (multi ? onToggle(p) : onPick(p))}>
                <Avatar name={p.name} id={p.user_id} url={p.avatar} size={40} />
                <span className="ms-person__text">
                  <strong>{p.name}</strong>
                  <span className="ms-person__sub">
                    {p.team && p.team !== p.name && <span className="ms-team">{p.team}</span>}
                    <small>{p.line}</small>
                  </span>
                </span>
                {multi && <span className={`ms-check ${on ? "is-on" : ""}`}>{on && <Icon name="check" size={12} strokeWidth={3} />}</span>}
              </button>
            );
          })}
        </section>
      ))}
      {!sections.length && <Empty icon="users" title="Kimse bulunamadı" text={q.trim().length < 2 ? "Üyeleri bulmak için en az 2 harf yazın." : "Aramayı değiştirin."} />}
      {q.trim().length < 2 && sections.length > 0 && <p className="ms-note">Henüz profil seçmemiş üyeleri bulmak için ad yazın.</p>}
    </div>
  );
}

/** Sol bölmede açılan "Yeni sohbet" paneli. */
export function NewChatPanel({ onClose, onPick, onNewGroup }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="ms-slide">
      <header className="ms-slide__head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Geri"><Icon name="chevronLeft" size={18} /></button>
        <h3>Yeni sohbet</h3>
      </header>
      <div className="ms-search"><Icon name="search" size={14} /><input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, takım ya da kullanıcı adı ara" onKeyDown={(e) => e.key === "Escape" && onClose()} /></div>
      <div className="ms-slide__body">
        <button type="button" className="ms-person ms-person--action" onClick={onNewGroup}>
          <span className="ms-av ms-av--action"><Icon name="users" size={18} /></span><span className="ms-person__text"><strong>Yeni grup</strong><small>Yönetim, başkanlar, oyuncular ve üyelerden</small></span>
        </button>
        <PeopleList q={q} onPick={onPick} />
      </div>
    </div>
  );
}

/** Sol bölmede "Yeni grup": 1) kişileri seç, 2) ad, fotoğraf, açıklama, ayarlar. */
export function NewGroupPanel({ onClose, onCreate, initial }) {
  const [step, setStep] = useState(initial?.users?.length ? 2 : 1);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Map((initial?.users || []).map((u) => [Number(u.user_id), u])));
  const [form, setForm] = useState({ title: initial?.title || "", description: initial?.description || "", only_admins_send: false, only_admins_edit: false, photo: null });
  const [busy, setBusy] = useState(false);
  const toggle = (p) => setPicked((m) => { const n = new Map(m); if (n.has(Number(p.user_id))) n.delete(Number(p.user_id)); else n.set(Number(p.user_id), p); return n; });
  const selected = useMemo(() => new Set(picked.keys()), [picked]);
  const pickPhoto = async () => {
    const [f] = await chatApi().pick({ images: true });
    if (f?.data) setForm((s) => ({ ...s, photo: { ...f, preview: URL.createObjectURL(new Blob([f.data], { type: f.mime })) } }));
  };
  const create = async () => {
    setBusy(true);
    await onCreate({ ...form, user_ids: [...picked.keys()] });
    setBusy(false);
  };
  return (
    <div className="ms-slide">
      <header className="ms-slide__head">
        <button type="button" className="icon-btn" onClick={step === 2 && !initial?.users?.length ? () => setStep(1) : onClose} aria-label="Geri"><Icon name="chevronLeft" size={18} /></button>
        <h3>{step === 1 ? "Gruba kişi ekle" : "Yeni grup"}</h3>
        {step === 1 && <span className="muted small">{picked.size} kişi</span>}
      </header>
      {step === 1 ? (
        <>
          {picked.size > 0 && (
            <div className="ms-picked">
              {[...picked.values()].map((p) => (
                <button key={p.user_id} type="button" className="ms-picked__chip" onClick={() => toggle(p)} title="Çıkar">
                  <Avatar name={p.name} id={p.user_id} url={p.avatar} size={22} /> {p.name} <Icon name="x" size={11} />
                </button>
              ))}
            </div>
          )}
          <div className="ms-search"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi ya da takım ara" /></div>
          <div className="ms-slide__body"><PeopleList q={q} multi selected={selected} onToggle={toggle} /></div>
          <footer className="ms-slide__foot">
            <button type="button" className="ms-fab" disabled={!picked.size} onClick={() => setStep(2)} aria-label="İleri"><Icon name="chevronRight" size={22} strokeWidth={2.4} /></button>
          </footer>
        </>
      ) : (
        <div className="ms-slide__body ms-newgroup">
          <button type="button" className="ms-newgroup__photo" onClick={pickPhoto} title="Grup fotoğrafı">
            {form.photo ? <img src={form.photo.preview} alt="" /> : <><Icon name="camera" size={26} /><span>Grup fotoğrafı ekle</span></>}
          </button>
          <Field label="Grup adı"><input autoFocus value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ör. Ankara kaptanlar" /></Field>
          <Field label="Açıklama (isteğe bağlı)"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <label className="ms-switch"><input type="checkbox" checked={form.only_admins_send} onChange={(e) => setForm({ ...form, only_admins_send: e.target.checked })} /><span><strong>Yalnız yöneticiler mesaj gönderir</strong><small>Duyuru grubu: üyeler yalnız okur, tepki verir.</small></span></label>
          <label className="ms-switch"><input type="checkbox" checked={form.only_admins_edit} onChange={(e) => setForm({ ...form, only_admins_edit: e.target.checked })} /><span><strong>Grup bilgisini yalnız yöneticiler düzenler</strong><small>Ad, fotoğraf, açıklama, üye ekleme ve sabitleme.</small></span></label>
          <div className="ms-newgroup__members">
            <h5>{picked.size} katılımcı</h5>
            <div className="ms-picked">{[...picked.values()].map((p) => <span key={p.user_id} className="ms-picked__chip"><Avatar name={p.name} id={p.user_id} url={p.avatar} size={22} /> {p.name}</span>)}</div>
          </div>
          <button type="button" className="btn btn--primary btn--lg" disabled={busy || !form.title.trim() || !picked.size} onClick={create}>{busy ? "Kuruluyor…" : "Grubu kur"}</button>
        </div>
      )}
    </div>
  );
}

/** Gruba üye ekleme penceresi. */
export function AddMembersModal({ exclude, onClose, onAdd }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(new Map());
  const toggle = (p) => setPicked((m) => { const n = new Map(m); if (n.has(Number(p.user_id))) n.delete(Number(p.user_id)); else n.set(Number(p.user_id), p); return n; });
  return (
    <Modal title="Üye ekle" onClose={onClose} width={480} className="ms-modal" footer={<><span className="muted small spacer">{picked.size} kişi seçildi</span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!picked.size} onClick={() => onAdd([...picked.keys()])}>Ekle</button></>}>
      <div className="ms-search"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi ya da takım ara" /></div>
      <div className="ms-modal__list"><PeopleList q={q} multi selected={new Set(picked.keys())} onToggle={toggle} exclude={exclude} /></div>
    </Modal>
  );
}

/** İlet: sohbet seç (en çok 5). */
export function ForwardModal({ conversations, count, onClose, onSend }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const list = filterChats(conversations, { q }).filter((c) => c.can_write !== false);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));
  return (
    <Modal title={`${count} mesajı ilet`} onClose={onClose} width={460} className="ms-modal" footer={<><span className="muted small spacer">{picked.length ? `${picked.length} sohbet` : "En çok 5 sohbet"}</span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!picked.length} onClick={() => onSend(picked)}><Icon name="send" size={14} /> Gönder</button></>}>
      <div className="ms-search"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sohbet ara" /></div>
      <div className="ms-modal__list">
        {list.map((c) => (
          <button key={c.id} type="button" className={`ms-person ${picked.includes(c.id) ? "is-on" : ""}`} onClick={() => toggle(c.id)}>
            <Avatar name={c.title} id={c.other_user?.user_id ?? c.id} url={c.avatar} size={38} group={isGroupChat(c)} />
            <span className="ms-person__text"><strong>{c.title}</strong><small>{c.subtitle}</small></span>
            <span className={`ms-check ${picked.includes(c.id) ? "is-on" : ""}`}>{picked.includes(c.id) && <Icon name="check" size={12} strokeWidth={3} />}</span>
          </button>
        ))}
        {!list.length && <Empty icon="message" title="Sohbet yok" />}
      </div>
    </Modal>
  );
}

/** Kimler tepki verdi (emoji sekmeli). */
export function ReactionsModal({ message, meId, onClose, onRemoveMine }) {
  const list = message.reactions || [];
  const [tab, setTab] = useState("all");
  const users = (tab === "all" ? list.flatMap((r) => (r.users || []).map((u) => ({ ...u, emoji: r.emoji }))) : (list.find((r) => r.emoji === tab)?.users || []).map((u) => ({ ...u, emoji: tab })))
    .map((u) => ({ ...u, me: Number(u.user_id) === Number(meId) }));
  return (
    <Modal title="Tepkiler" onClose={onClose} width={380} className="ms-modal">
      <div className="ms-tabs">
        <button type="button" className={tab === "all" ? "is-active" : ""} onClick={() => setTab("all")}>Tümü {list.reduce((s, r) => s + r.count, 0)}</button>
        {list.map((r) => <button key={r.emoji} type="button" className={tab === r.emoji ? "is-active" : ""} onClick={() => setTab(r.emoji)}>{r.emoji} {r.count}</button>)}
      </div>
      <div className="ms-modal__list">
        {users.map((u, i) => (
          <div key={`${u.user_id}${i}`} className="ms-person ms-person--static">
            <Avatar name={u.name || "Siz"} id={u.user_id} size={34} />
            <span className="ms-person__text"><strong>{u.me ? "Siz" : u.name}</strong>{u.me && <small>Kaldırmak için tıklayın</small>}</span>
            <button type="button" className="ms-big-emoji" disabled={!u.me} onClick={() => onRemoveMine()}>{u.emoji}</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Mesaj bilgisi: kimler okudu, kimler okumadı. */
export function MessageInfoModal({ conversationId, message, onClose }) {
  const [info, setInfo] = useState(null);
  useEffect(() => { get(`${C}/conversations/${conversationId}/messages/${message.id}/info`).then((r) => setInfo(r.ok ? r.data : { error: r.error })); }, [conversationId, message.id]);
  const row = (u, read) => (
    <div key={u.user_id} className="ms-person ms-person--static">
      <Avatar name={u.name} id={u.user_id} url={u.avatar} size={34} />
      <span className="ms-person__text"><strong>{u.name}</strong><small>{read && u.read_at ? `${dayLabel(u.read_at)} ${clockTime(u.read_at)}` : "Henüz okumadı"}</small></span>
      {read && <span className="ms-tick ms-tick--read"><Icon name="checks" size={16} /></span>}
    </div>
  );
  return (
    <Modal title="Mesaj bilgisi" onClose={onClose} width={420} className="ms-modal">
      <div className="ms-info-quote">{message.body}<small>{dayLabel(message.created_at)} {clockTime(message.created_at)}</small></div>
      {!info ? <Spinner /> : info.error ? <p className="muted">{info.error.message}</p> : (
        <>
          <h5 className="ms-h5"><span className="ms-tick ms-tick--read"><Icon name="checks" size={15} /></span> Okuyanlar · {info.read_by.length}</h5>
          {info.read_by.map((u) => row(u, true))}
          {info.not_read.length > 0 && <h5 className="ms-h5"><Icon name="check" size={14} /> Teslim edildi · {info.not_read.length}</h5>}
          {info.not_read.map((u) => row(u, false))}
        </>
      )}
    </Modal>
  );
}

/** Anket oluştur. */
export function PollModal({ onClose, onSend }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;
  const setOpt = (i, v) => setOptions((list) => {
    const next = list.map((o, j) => (j === i ? v : o));
    if (i === next.length - 1 && v.trim() && next.length < 12) next.push("");
    return next;
  });
  return (
    <Modal title="Anket oluştur" onClose={onClose} width={440} className="ms-modal" footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!valid} onClick={() => onSend({ question: question.trim(), options: options.map((o) => o.trim()).filter(Boolean), multiple })}><Icon name="send" size={14} /> Gönder</button></>}>
      <Field label="Soru"><input autoFocus value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder="ör. Antrenman hangi gün olsun?" /></Field>
      <div className="ms-poll-edit">
        <span className="field__label">Seçenekler</span>
        {options.map((o, i) => (
          <div key={i} className="ms-poll-edit__row">
            <input value={o} maxLength={100} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Seçenek ${i + 1}`} />
            {options.length > 2 && <button type="button" className="icon-btn" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} aria-label="Seçeneği sil"><Icon name="x" /></button>}
          </div>
        ))}
      </div>
      <label className="toggle"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Birden çok seçeneğe izin ver</label>
    </Modal>
  );
}

/** Konum: kayıtlı sahalar ya da elle adres. */
export function LocationModal({ onClose, onSend }) {
  const [q, setQ] = useState("");
  const [venues, setVenues] = useState(null);
  const [manual, setManual] = useState({ label: "", address: "" });
  useEffect(() => { get(`${C}/venues`).then((r) => setVenues(r.ok ? r.data.venues || [] : [])); }, []);
  const list = (venues || []).filter((v) => !q || `${v.name} ${v.address || ""} ${v.city || ""}`.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
  return (
    <Modal title="Konum gönder" onClose={onClose} width={460} className="ms-modal" footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!manual.address.trim()} onClick={() => onSend({ label: manual.label.trim() || null, address: manual.address.trim() })}>Adresi gönder</button></>}>
      <div className="ms-search"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Saha ara" /></div>
      <div className="ms-modal__list ms-modal__list--short">
        {venues === null ? <Spinner /> : list.map((v) => (
          <button key={v.public_id} type="button" className="ms-person" onClick={() => onSend({ label: v.name, address: v.address, venue_public_id: v.public_id, venue_name: v.name })}>
            <span className="ms-av ms-av--action"><Icon name="map" size={18} /></span>
            <span className="ms-person__text"><strong>{v.name}</strong><small>{[v.address, v.city].filter(Boolean).join(" · ")}</small></span>
          </button>
        ))}
        {venues && !list.length && <p className="ms-note">Kayıtlı saha bulunamadı; adresi aşağıya yazın.</p>}
      </div>
      <div className="form-grid">
        <Field label="Ad (isteğe bağlı)"><input value={manual.label} onChange={(e) => setManual({ ...manual, label: e.target.value })} placeholder="ör. Merkez Arena" /></Field>
        <Field label="Adres"><input value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} placeholder="Mahalle, cadde, ilçe" /></Field>
      </div>
    </Modal>
  );
}

/** Anket oyları: seçenek başına oy verenler. */
export function VotersModal({ message, participants, onClose }) {
  const poll = message.meta?.poll || {};
  const name = (id) => participants.find((p) => Number(p.user_id) === Number(id))?.name || `Üye #${id}`;
  return (
    <Modal title={poll.question || "Anket"} onClose={onClose} width={420} className="ms-modal">
      {(poll.options || []).map((o) => {
        const ids = poll.votes?.[o.id] || [];
        return (
          <section key={o.id} className="ms-voters">
            <h5 className="ms-h5">{o.text} <span className="muted">{ids.length} oy</span></h5>
            {ids.map((id) => <div key={id} className="ms-person ms-person--static"><Avatar name={name(id)} id={id} size={30} /><span className="ms-person__text"><strong>{name(id)}</strong></span></div>)}
            {!ids.length && <p className="ms-note">Oy yok</p>}
          </section>
        );
      })}
    </Modal>
  );
}

/** Gönderilecek eklerin önizlemesi ve açıklama. */
export function AttachPreview({ files, onClose, onSend }) {
  const [caption, setCaption] = useState("");
  const [index, setIndex] = useState(0);
  const previews = useMemo(() => files.map((f) => (isImageName(f.name, f.mime) && f.data ? URL.createObjectURL(new Blob([f.data], { type: f.mime || "image/png" })) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);
  const cur = files[index];
  return (
    <Modal title={files.length > 1 ? `${files.length} dosya gönder` : "Dosya gönder"} onClose={onClose} width={620} className="ms-modal ms-attach">
      <div className="ms-attach__stage">
        {previews[index] ? <img src={previews[index]} alt="" /> : <div className="ms-attach__doc"><Icon name="file" size={54} /><strong>{cur?.name}</strong><small>{formatBytes(cur?.size)}</small></div>}
      </div>
      {files.length > 1 && (
        <div className="ms-attach__strip">
          {files.map((f, i) => <button key={i} type="button" className={i === index ? "is-active" : ""} onClick={() => setIndex(i)}>{previews[i] ? <img src={previews[i]} alt="" /> : <Icon name="file" size={20} />}</button>)}
        </div>
      )}
      <div className="ms-composer ms-attach__caption">
        <input autoFocus value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Açıklama ekleyin" onKeyDown={(e) => { if (e.key === "Enter") onSend(caption.trim()); }} />
        <button type="button" className="ms-send" onClick={() => onSend(caption.trim())} title="Gönder"><Icon name="send" size={18} strokeWidth={2.2} /></button>
      </div>
    </Modal>
  );
}

/** Şikayet et (üyeler): neden + açıklama, isteğe bağlı engelle. */
export function ReportModal({ who, onClose, onSend }) {
  const [reasons, setReasons] = useState([]);
  const [form, setForm] = useState({ reason: "", details: "", block: true });
  useEffect(() => { get(`${C}/report-reasons`).then((r) => setReasons(r.ok ? r.data.reasons : [])); }, []);
  return (
    <Modal title={`${who} şikayet et`} onClose={onClose} width={420} className="ms-modal" footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary btn--danger" disabled={!form.reason} onClick={() => onSend(form)}>Şikayet et</button></>}>
      <div className="ms-reasons">{reasons.map((r) => <label key={r.key} className="toggle"><input type="radio" name="reason" checked={form.reason === r.key} onChange={() => setForm({ ...form, reason: r.key })} /> {r.label}</label>)}</div>
      <Field label="Açıklama (isteğe bağlı)"><textarea rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
      <label className="toggle"><input type="checkbox" checked={form.block} onChange={(e) => setForm({ ...form, block: e.target.checked })} /> Ayrıca engelle</label>
    </Modal>
  );
}

/** Fotoğraf görüntüleyici: ← → ile sohbetteki diğer fotoğraflar. */
export function Lightbox({ items, index: start, onClose, onDownload }) {
  const [index, setIndex] = useState(start);
  const cur = items[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items.length, onClose]);
  if (!cur) return null;
  return (
    <div className="ms-lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header>
        <Avatar name={cur.sender?.name} id={cur.sender?.user_id} url={cur.sender?.avatar} size={36} />
        <span><strong>{cur.sender?.is_me ? "Siz" : cur.sender?.name}</strong><small>{dayLabel(cur.created_at)} {clockTime(cur.created_at)} · {index + 1} / {items.length}</small></span>
        <span className="spacer" />
        <button type="button" className="icon-btn" title="İndir" onClick={() => onDownload(cur)}><Icon name="download" size={18} /></button>
        <button type="button" className="icon-btn" title="Kapat (esc)" onClick={onClose}><Icon name="x" size={18} /></button>
      </header>
      <div className="ms-lightbox__stage" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {index > 0 && <button type="button" className="ms-lightbox__nav is-prev" onClick={() => setIndex(index - 1)}><Icon name="chevronLeft" size={26} /></button>}
        <img src={cur._localUrl || mediaUrl(cur.meta?.file?.url || cur.url)} alt="" />
        {index < items.length - 1 && <button type="button" className="ms-lightbox__nav is-next" onClick={() => setIndex(index + 1)}><Icon name="chevronRight" size={26} /></button>}
      </div>
      {cur.meta?.caption && <p className="ms-lightbox__caption">{cur.meta.caption}</p>}
    </div>
  );
}

export const previewLine = (c) => { const p = chatPreview(c); return `${p.prefix}${p.text}`; };
