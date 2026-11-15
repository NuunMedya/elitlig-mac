// Rehber (masaüstü) pencereleri: hedef kitle (oluştur / düzenle / birleştir /
// sil), toplu kitle atama, vCard / CSV içe aktarma (alan eşlemeli), yinelenen
// kişileri birleştirme.
import React, { useMemo, useState } from "react";
import { Field, Icon, Modal, useConfirm, useResult } from "../../components/ui";
import { del, patch, post, tempId } from "../../api";
import { IMPORT_FIELDS, guessMapping, parseCsv, parseVcf, prettyPhone, rowsToContacts } from "../../lib/contactCore";
import { Avatar } from "./Avatar";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#e11d48", "#ea580c", "#d97706", "#16a34a", "#0d9488", "#0891b2", "#475569"];
// Sunucudaki simge anahtarı → uygulamadaki simge.
const ICONS = [["users", "users", "Kişiler"], ["star", "star", "Yıldız"], ["handshake", "handshake", "Sponsor"], ["whistle", "award", "Hakem"], ["building", "folder", "Saha / kurum"], ["truck", "map", "Tedarikçi"], ["megaphone", "broadcast", "Basın"], ["briefcase", "briefcase", "İş"], ["trophy", "trophy", "Kupa"], ["camera", "camera", "Medya"], ["shield", "shield", "Takım"], ["flag", "flag", "Bayrak"]];
export const audienceIcon = (key) => ICONS.find((i) => i[0] === key)?.[1] || "users";

export function AudienceDialog({ initial = {}, audiences = [], onClose, onDone }) {
  const result = useResult();
  const confirm = useConfirm();
  const editing = Boolean(initial.id);
  const [form, setForm] = useState({ name: "", color: COLORS[audiences.length % COLORS.length], icon: "users", description: "", ...initial });
  const [into, setInto] = useState("");
  const others = audiences.filter((a) => !a.system && a.id !== initial.id);
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    const body = { name: form.name, color: form.color, icon: form.icon, description: form.description || null };
    const res = editing ? await patch(`/api/tools/contacts/audiences/${initial.id}`, body) : await post("/api/tools/contacts/audiences", body, { tempId: tempId() });
    if (result(res, editing ? "Hedef kitle kaydedildi." : `"${form.name}" hedef kitlesi oluşturuldu.`)) onDone();
  };
  const remove = async () => {
    if (!(await confirm({ title: "Hedef kitleyi sil", message: `"${initial.name}" silinsin mi? Kişiler silinmez; yalnız bu kitleden çıkarılır.`, danger: true, confirmLabel: "Sil" }))) return;
    if (result(await del(`/api/tools/contacts/audiences/${initial.id}`), "Hedef kitle silindi.")) onDone({ removed: initial.id });
  };
  const merge = async () => {
    const target = others.find((a) => String(a.id) === String(into));
    if (!target || !(await confirm({ title: "Kitleleri birleştir", message: `"${initial.name}" kişileri "${target.name}" kitlesine taşınsın ve "${initial.name}" silinsin mi?`, confirmLabel: "Birleştir" }))) return;
    const res = await post(`/api/tools/contacts/audiences/${initial.id}/merge`, { into: target.id });
    if (result(res, `${res.data?.moved ?? 0} kişi "${target.name}" kitlesine taşındı.`)) onDone({ into: target.id });
  };
  return (
    <Modal title={editing ? "Hedef kitleyi düzenle" : "Yeni hedef kitle"} onClose={onClose} width={520} footer={<>
      {editing && <button type="button" className="btn btn--danger" onClick={remove}>Sil</button>}
      <span className="rb-spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="rb-aud" className="btn btn--primary" disabled={!form.name.trim()}>Kaydet</button>
    </>}>
      <form id="rb-aud" className="form-grid" onSubmit={save}>
        <Field label="Ad" className="span2"><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ör. Sponsor adayları, Hakemler, Basın" maxLength={80} aria-label="Hedef kitle adı" /></Field>
        <Field label="Renk" className="span2"><div className="rb-swatches">{COLORS.map((c) => <button key={c} type="button" className={`rb-swatch${form.color === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={c} aria-pressed={form.color === c} />)}</div></Field>
        <Field label="Simge" className="span2"><div className="rb-icons">{ICONS.map(([key, icon, label]) => <button key={key} type="button" className={`rb-iconpick${form.icon === key ? " is-on" : ""}`} style={{ "--aud": form.color }} title={label} aria-label={label} aria-pressed={form.icon === key} onClick={() => setForm({ ...form, icon: key })}><Icon name={icon} size={15} /></button>)}</div></Field>
        <Field label="Açıklama (isteğe bağlı)" className="span2"><input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} /></Field>
        {editing && others.length > 0 && (
          <Field label="Başka kitleyle birleştir" className="span2"><div className="row-gap"><select value={into} onChange={(e) => setInto(e.target.value)}><option value="">Kitle seçin…</option>{others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button type="button" className="btn btn--sm" disabled={!into} onClick={merge}>Birleştir</button></div></Field>
        )}
      </form>
    </Modal>
  );
}

export function BulkAudienceDialog({ rows, audiences = [], memberAccess, onClose, onDone }) {
  const result = useResult();
  const manual = audiences.filter((a) => !a.system);
  const [id, setId] = useState(manual[0]?.id ?? "");
  const [mode, setMode] = useState("add");
  const contactIds = rows.filter((r) => r.source === "manual" || r.card).map((r) => (r.source === "manual" ? r.id : r.card.id));
  const memberIds = rows.filter((r) => r.source === "member" && !r.card).map((r) => r.id);
  const blocked = memberIds.length > 0 && !memberAccess;
  const save = async () => {
    const res = await post(`/api/tools/contacts/audiences/${id}/members`, { [mode]: { contact_ids: contactIds, member_user_ids: memberIds } });
    const name = manual.find((a) => String(a.id) === String(id))?.name;
    if (result(res, mode === "add" ? `${res.data?.added ?? rows.length} kişi "${name}" kitlesine eklendi.` : `${res.data?.removed ?? rows.length} kişi "${name}" kitlesinden çıkarıldı.`)) onDone();
  };
  return (
    <Modal title={`${rows.length} kişi · hedef kitle`} onClose={onClose} width={460} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={!id || blocked} onClick={save}>{mode === "add" ? "Kitleye ekle" : "Kitleden çıkar"}</button></>}>
      {!manual.length ? <p className="muted">Önce bir hedef kitle oluşturun.</p> : (
        <div className="rb-bulkform">
          <div className="seg seg--sm" role="radiogroup" aria-label="İşlem"><button type="button" role="radio" aria-checked={mode === "add"} className={mode === "add" ? "is-active" : ""} onClick={() => setMode("add")}>Ekle</button><button type="button" role="radio" aria-checked={mode === "remove"} className={mode === "remove" ? "is-active" : ""} onClick={() => setMode("remove")}>Çıkar</button></div>
          {manual.map((a) => (
            <label key={a.id} className={`rb-audrow${String(id) === String(a.id) ? " is-on" : ""}`} style={{ "--aud": a.color || "#64748b" }}>
              <input type="radio" name="rb-aud" checked={String(id) === String(a.id)} onChange={() => setId(a.id)} />
              <span className="rb-audicon"><Icon name={audienceIcon(a.icon)} size={13} /></span><span><strong>{a.name}</strong><small>{a.count ?? 0} kişi</small></span>
            </label>
          ))}
          {memberIds.length > 0 && <p className="muted small">{blocked ? "Elitlig üyelerini kitleye eklemek için “Üyeleri görüntüleme” yetkisi gerekir." : `${memberIds.length} Elitlig üyesi rehberinize kaydedilmeden kitleye bağlanır.`}</p>}
        </div>
      )}
    </Modal>
  );
}

export function ImportDialog({ audiences = [], onClose, onDone }) {
  const result = useResult();
  const [kind, setKind] = useState(null);
  const [rows, setRows] = useState([]);
  const [vcards, setVcards] = useState([]);
  const [mapping, setMapping] = useState({});
  const [hasHeader, setHasHeader] = useState(true);
  const [audIds, setAudIds] = useState([]);
  const [skip, setSkip] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const manual = audiences.filter((a) => !a.system);
  const choose = async () => {
    const res = await window.elitlig.files.open([{ name: "Kişiler (vCard, CSV)", extensions: ["vcf", "csv", "txt"] }]);
    if (!res.ok) return;
    const text = new TextDecoder("utf-8").decode(res.data);
    setError("");
    if (/\.vcf$/i.test(res.name) || /BEGIN:VCARD/i.test(text)) { const list = parseVcf(text); if (!list.length) { setError("Dosyada kişi bulunamadı."); return; } setVcards(list); setKind("vcf"); } else {
      const parsed = parseCsv(text);
      if (!parsed.length) { setError("Dosyada satır bulunamadı."); return; }
      setRows(parsed); setMapping(guessMapping(parsed[0])); setKind("csv");
    }
  };
  const contacts = useMemo(() => (kind === "vcf" ? vcards : rowsToContacts(rows, mapping, { hasHeader })), [kind, vcards, rows, mapping, hasHeader]);
  const submit = async () => {
    setBusy(true);
    let created = 0; const skipped = []; const errors = [];
    for (let i = 0; i < contacts.length; i += 1000) {
      // eslint-disable-next-line no-await-in-loop
      const res = await post("/api/tools/contacts/import", { items: contacts.slice(i, i + 1000), audience_ids: audIds, skip_duplicates: skip });
      if (!result(res)) { setBusy(false); return; }
      if (res.queued) { setBusy(false); setDone({ queued: true }); onDone(); return; }
      created += res.data.created; skipped.push(...res.data.skipped); errors.push(...res.data.errors.map((e) => ({ ...e, row: e.row + i })));
    }
    setBusy(false);
    setDone({ created, skipped, errors });
    onDone();
  };
  return (
    <Modal title="Kişileri içe aktar" onClose={onClose} width={820} footer={<>
      {kind && !done && <span className="muted small">{contacts.length} kişi</span>}
      <span className="rb-spacer" />
      <button type="button" className="btn" onClick={onClose}>{done ? "Kapat" : "Vazgeç"}</button>
      {kind && !done && <button type="button" className="btn btn--primary" disabled={busy || !contacts.length} onClick={submit}>{busy ? "Aktarılıyor…" : `${contacts.length} kişiyi aktar`}</button>}
    </>}>
      {error && <div className="notice notice--warn">{error}</div>}
      {done ? (done.queued ? <p>Çevrimdışısınız: kişiler bağlantı gelince aktarılacak.</p> : (
        <div><p><strong>{done.created}</strong> kişi rehbere eklendi.</p>{done.skipped.length > 0 && <p className="muted small">{done.skipped.length} kişi zaten rehberde olduğu için atlandı.</p>}{done.errors.length > 0 && <details><summary>{done.errors.length} satır aktarılamadı</summary><ul>{done.errors.slice(0, 30).map((e) => <li key={e.row}>Satır {e.row}: {e.message}</li>)}</ul></details>}</div>
      )) : !kind ? (
        <div className="rb-drop"><Icon name="upload" size={28} /><strong>vCard (.vcf) ya da CSV dosyası seçin</strong><span className="muted small">Mac Kişiler, telefon rehberi, Google / Outlook ya da Excel (CSV) dosyaları.</span><button type="button" className="btn btn--primary" onClick={choose}>Dosya seç…</button></div>
      ) : (
        <div className="rb-import">
          {kind === "csv" && <>
            <label className="toggle"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> İlk satır başlık</label>
            <div className="rb-mapgrid">{IMPORT_FIELDS.map((f) => <label key={f.key} className="field"><span className="field__label">{f.label}</span><select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })} aria-label={`${f.label} sütunu`}><option value="">— Yok —</option>{(rows[0] || []).map((h, i) => <option key={i} value={i}>{hasHeader ? h || `Sütun ${i + 1}` : `Sütun ${i + 1}`}</option>)}</select></label>)}</div>
          </>}
          <div className="rb-preview"><table className="table"><thead><tr><th>Ad</th><th>Telefon</th><th>E-posta</th><th>Kurum</th></tr></thead><tbody>{contacts.slice(0, 8).map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.phones.map((p) => prettyPhone(p.value)).join(", ")}</td><td>{c.emails.map((e) => e.value).join(", ")}</td><td>{c.company || ""}</td></tr>)}</tbody></table></div>
          {manual.length > 0 && <div className="rb-audpick">{manual.map((a) => { const on = audIds.includes(a.id); return <button key={a.id} type="button" className={`rb-audtag rb-audtag--btn${on ? " is-on" : ""}`} style={{ "--aud": a.color || "#64748b" }} aria-pressed={on} onClick={() => setAudIds(on ? audIds.filter((x) => x !== a.id) : [...audIds, a.id])}><span className="rb-dot" />{a.name}</button>; })}</div>}
          <label className="toggle"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Aynı telefon / e-postayla kayıtlı olanları atla</label>
        </div>
      )}
    </Modal>
  );
}

export function DuplicatesDialog({ groups = [], onClose, onMerged }) {
  const result = useResult();
  const [keep, setKeep] = useState(() => Object.fromEntries(groups.map((g, i) => [i, g.keep.id])));
  const [done, setDone] = useState(new Set());
  const REASON = { telefon: "Aynı telefon", "e-posta": "Aynı e-posta", ad: "Aynı ad" };
  const merge = async (i) => {
    const all = [groups[i].keep, ...groups[i].others];
    const res = await post("/api/tools/contacts/merge", { keep_id: keep[i], merge_ids: all.filter((c) => c.id !== keep[i]).map((c) => c.id) });
    if (result(res, "Kişiler birleştirildi.")) { setDone((s) => new Set([...s, i])); onMerged(); }
  };
  return (
    <Modal title="Yinelenen kişiler" onClose={onClose} width={760} footer={<button type="button" className="btn btn--primary" onClick={onClose}>Bitti</button>}>
      {!groups.length ? <p className="muted">Yinelenen kişi bulunamadı.</p> : groups.map((g, i) => (
        <section key={i} className={`rb-dupe${done.has(i) ? " is-done" : ""}`}>
          <header><strong>{g.reasons.map((r) => REASON[r] || r).join(" · ")}</strong>{done.has(i) && <span className="pill pill--green pill--xs">Birleştirildi</span>}</header>
          <div className="rb-dupe__cards">{[g.keep, ...g.others].map((c) => (
            <label key={c.id} className={`rb-dupe__card${keep[i] === c.id ? " is-keep" : ""}`}>
              <input type="radio" name={`d${i}`} checked={keep[i] === c.id} disabled={done.has(i)} onChange={() => setKeep((k) => ({ ...k, [i]: c.id }))} />
              <Avatar name={c.name} src={c.avatar_url} />
              <span><strong>{c.name}</strong><small>{[c.company, ...c.phones.map((p) => prettyPhone(p.value)), ...c.emails.map((e) => e.value)].filter(Boolean).join(" · ") || "—"}</small></span>
            </label>
          ))}</div>
          {!done.has(i) && <button type="button" className="btn btn--sm btn--primary" onClick={() => merge(i)}>Birleştir</button>}
        </section>
      ))}
    </Modal>
  );
}
