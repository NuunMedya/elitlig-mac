// Rehber (masaüstü): kişi kartı formu — etiketli çoklu telefon / e-posta,
// sosyal hesaplar, adres, web, doğum günü (yılsız olabilir), fotoğraf,
// hedef kitleler, etiketler, not. Üyeye bağlı kartta iletişim bilgisi üye
// kaydından gelir; yalnız kişisel alanlar tutulur. Çevrimdışı kuyruğa alınır.
import React, { useState } from "react";
import { Field, Icon, Modal, useResult } from "../../components/ui";
import { patch, post, tempId } from "../../api";
import { EMAIL_LABELS, PHONE_LABELS, SOCIAL_NETWORKS, birthdayParts, normalizeContact } from "../../lib/contactCore";

const pad = (n) => String(n).padStart(2, "0");

function Entries({ items, onChange, labels, type, placeholder, add, aria }) {
  return (
    <div className="rb-entries">
      {items.map((it, i) => (
        <div key={i} className="rb-entry">
          <select className="select-sm" value={it.label || labels[0].key} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`${aria} ${i + 1} türü`}>{labels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          <input type={type} value={it.value || ""} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label={`${aria} ${i + 1}`} />
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`${aria} ${i + 1} sil`}><Icon name="x" size={12} /></button>
        </div>
      ))}
      {items.length < 8 && <button type="button" className="rb-add" onClick={() => onChange([...items, { label: labels[items.length ? 1 : 0]?.key || labels[0].key, value: "" }])}><Icon name="plus" size={12} /> {add}</button>}
    </div>
  );
}

export default function ContactEditor({ initial = {}, member, audiences = [], onClose, onSaved, onDelete }) {
  const result = useResult();
  const src = normalizeContact(initial);
  const editing = Boolean(initial.id);
  const linked = Boolean(member);
  const bd = birthdayParts(src.birthday);
  const [form, setForm] = useState({
    name: src.name || member?.name || "", company: src.company || "", title: src.title || "", city: src.city || "", address: src.address || "", website: src.website || "",
    phones: src.phones.length ? src.phones : [{ label: "cep", value: "" }], emails: src.emails.length ? src.emails : [{ label: "kişisel", value: "" }],
    socials: src.socials, birthday: bd ? `${bd.year || 2000}-${pad(bd.month)}-${pad(bd.day)}` : "", noYear: Boolean(bd && !bd.year), avatar_url: src.avatar_url || "",
    tags: (src.tags || []).join(", "), note: src.note || "", favorite: Boolean(src.favorite), audience_ids: (src.audience_ids || []).map(Number),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const manualAuds = audiences.filter((a) => !a.system);
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const p = birthdayParts(form.birthday);
    const birthday = !form.birthday ? null : form.noYear && p ? `--${pad(p.month)}-${pad(p.day)}` : form.birthday;
    const personal = { tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), note: form.note, favorite: form.favorite, audience_ids: form.audience_ids, birthday, socials: form.socials.filter((s) => s.value.trim()), avatar_url: form.avatar_url || null };
    const body = linked ? { ...personal, name: form.name, member_user_id: member.id } : { ...personal, name: form.name, company: form.company, title: form.title, city: form.city, address: form.address, website: form.website || null, phones: form.phones.filter((x) => x.value.trim()), emails: form.emails.filter((x) => x.value.trim()) };
    const res = editing ? await patch(`/api/tools/contacts/${initial.id}`, body) : await post("/api/tools/contacts", body, { tempId: tempId() });
    setBusy(false);
    if (result(res, editing ? "Kaydedildi." : linked ? "Kişilerinize kaydedildi." : "Kişi eklendi.")) onSaved(res.data?.item);
  };
  return (
    <Modal title={linked ? `${form.name}: kişisel kart` : editing ? "Kişiyi düzenle" : "Yeni kişi"} onClose={onClose} width={640} footer={<>
      {editing && <button type="button" className="btn btn--danger" onClick={() => onDelete(initial)}>Sil</button>}
      <span className="rb-spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="rb-form" className="btn btn--primary" disabled={busy || !form.name.trim()}>Kaydet</button>
    </>}>
      <form id="rb-form" className="form-grid" onSubmit={save}>
        {linked ? <p className="muted small span2">Telefon, e-posta ve il üye kaydından canlı gelir; burada size özel bilgiler tutulur.</p> : <>
          <Field label="Ad soyad" className="span2"><input autoFocus value={form.name} onChange={set("name")} maxLength={120} /></Field>
          <Field label="Kurum / takım"><input value={form.company} onChange={set("company")} maxLength={120} /></Field>
          <Field label="Görev / unvan"><input value={form.title} onChange={set("title")} maxLength={120} /></Field>
          <Field label="Telefon"><Entries items={form.phones} onChange={(phones) => setForm({ ...form, phones })} labels={PHONE_LABELS} type="tel" placeholder="0555 123 45 67" add="Telefon ekle" aria="Telefon" /></Field>
          <Field label="E-posta"><Entries items={form.emails} onChange={(emails) => setForm({ ...form, emails })} labels={EMAIL_LABELS} type="email" placeholder="ad@ornek.com" add="E-posta ekle" aria="E-posta" /></Field>
          <Field label="Adres"><input value={form.address} onChange={set("address")} maxLength={300} /></Field>
          <Field label="İl"><input value={form.city} onChange={set("city")} maxLength={60} /></Field>
          <Field label="Web" className="span2"><input value={form.website} onChange={set("website")} maxLength={200} placeholder="ornek.com" /></Field>
        </>}
        <Field label="Doğum günü"><div className="row-gap"><input type="date" value={form.birthday} onChange={set("birthday")} /><label className="toggle"><input type="checkbox" checked={form.noYear} onChange={set("noYear")} /> Yılsız</label></div></Field>
        <Field label="Fotoğraf adresi"><input value={form.avatar_url} onChange={set("avatar_url")} placeholder="https://…" maxLength={500} /></Field>
        <Field label="Sosyal hesaplar" className="span2">
          <div className="rb-entries">
            {form.socials.map((s, i) => (
              <div key={i} className="rb-entry">
                <select className="select-sm" value={s.network} onChange={(e) => setForm({ ...form, socials: form.socials.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)) })} aria-label={`Sosyal hesap ${i + 1} ağı`}>{SOCIAL_NETWORKS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}</select>
                <input value={s.value} onChange={(e) => setForm({ ...form, socials: form.socials.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="@kullanici" aria-label={`Sosyal hesap ${i + 1}`} />
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setForm({ ...form, socials: form.socials.filter((_, j) => j !== i) })} aria-label="Sil"><Icon name="x" size={12} /></button>
              </div>
            ))}
            <button type="button" className="rb-add" onClick={() => setForm({ ...form, socials: [...form.socials, { network: "instagram", value: "" }] })}><Icon name="plus" size={12} /> Sosyal hesap ekle</button>
          </div>
        </Field>
        <Field label="Hedef kitleler" className="span2">
          {manualAuds.length ? <div className="rb-audpick">{manualAuds.map((a) => { const on = form.audience_ids.includes(Number(a.id)); return <button key={a.id} type="button" className={`rb-audtag rb-audtag--btn${on ? " is-on" : ""}`} style={{ "--aud": a.color || "#64748b" }} aria-pressed={on} onClick={() => setForm({ ...form, audience_ids: on ? form.audience_ids.filter((x) => x !== Number(a.id)) : [...form.audience_ids, Number(a.id)] })}><span className="rb-dot" />{a.name}</button>; })}</div> : <span className="muted small">Önce kenar çubuğundan bir hedef kitle oluşturun.</span>}
        </Field>
        <Field label="Etiketler (virgülle)" className="span2"><input value={form.tags} onChange={set("tags")} placeholder="hakem, saha" /></Field>
        <Field label="Not" className="span2"><textarea rows={3} value={form.note} onChange={set("note")} autoFocus={linked} /></Field>
        <label className="toggle"><input type="checkbox" checked={form.favorite} onChange={set("favorite")} /> Favori</label>
      </form>
    </Modal>
  );
}
