// Rehber: kişisel kişi/cari kartları ve siteye kaydolan üyelerin canlı
// rehberi. Tek tıkla arama (FaceTime/iPhone), WhatsApp, e-posta; Mac Kişiler
// uygulamasına vCard ile aktarma.
import React, { useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, OfflineNote, Segmented, Spinner, ViewHeader, useConfirm, useResult } from "../components/ui";
import { del, patch, post, tempId, useCommand, useDebounced, useResource } from "../api";
import { formatDate, includesTr, letterOf, prettyPhone, toVCard, waNumber } from "../lib/helpers";
import { toCsvText } from "../lib/sheets/sheetEngine";

const CATEGORY = [
  { value: "", label: "Tümü", key: "all" },
  { value: "uye", label: "Üye", key: "uye" },
  { value: "oyuncu", label: "Oyuncu", key: "oyuncu" },
  { value: "takim_baskani", label: "Takım başkanı", key: "takim_baskani" },
  { value: "yonetim", label: "Yönetim", key: "yonetim" },
];

const openUrl = (url) => window.elitlig.app.openExternal(url);
function ContactActions({ phone, email }) {
  return (
    <div className="contact-actions">
      {phone && <button type="button" className="icon-btn" title="Ara (iPhone/FaceTime)" onClick={() => openUrl(`tel:${phone.replace(/\s/g, "")}`)}><Icon name="phone" /></button>}
      {phone && <button type="button" className="icon-btn icon-btn--wa" title="WhatsApp" onClick={() => openUrl(`https://wa.me/${waNumber(phone)}`)}><Icon name="message" /></button>}
      {email && <button type="button" className="icon-btn" title="E-posta" onClick={() => openUrl(`mailto:${email}`)}><Icon name="mail" /></button>}
      {phone && <button type="button" className="icon-btn" title="Numarayı kopyala" onClick={() => navigator.clipboard.writeText(phone)}><Icon name="copy" /></button>}
    </div>
  );
}

export default function Contacts({ arg }) {
  const [tab, setTab] = useState("mine");
  return (
    <div className="view">
      <ViewHeader title="Rehber">
        <Segmented value={tab} onChange={setTab} size="sm" options={[{ value: "mine", label: "Kişilerim", icon: "user" }, { value: "directory", label: "Üye rehberi", icon: "users" }]} />
      </ViewHeader>
      {tab === "mine" ? <MyContacts arg={arg} /> : <Directory />}
    </div>
  );
}

function MyContacts({ arg }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState(arg && arg !== "new" ? arg : null);
  const [editing, setEditing] = useState(arg === "new" ? {} : null);
  const searchRef = useRef(null);
  const result = useResult();
  const confirm = useConfirm();
  const data = useResource("/api/tools/contacts");
  const all = useMemo(() => data.data?.items || [], [data.data]);

  useCommand("new", () => setEditing({}));
  useCommand("find", () => searchRef.current?.focus());
  useCommand("export", () => exportVcf(all));

  const tags = useMemo(() => [...new Set(all.flatMap((c) => c.tags || []))].sort((a, b) => a.localeCompare(b, "tr")), [all]);
  const shown = useMemo(() => all.filter((c) => (!query || includesTr(`${c.name} ${c.company} ${c.title} ${c.phone} ${c.email} ${c.city} ${c.note}`, query)) && (!tag || (c.tags || []).includes(tag))), [all, query, tag]);
  const grouped = useMemo(() => {
    const favs = shown.filter((c) => c.favorite);
    const map = new Map();
    shown.filter((c) => !c.favorite).sort((a, b) => a.name.localeCompare(b.name, "tr")).forEach((c) => {
      const l = letterOf(c.name);
      if (!map.has(l)) map.set(l, []);
      map.get(l).push(c);
    });
    return [...(favs.length ? [["★", favs]] : []), ...map.entries()];
  }, [shown]);
  const current = all.find((c) => String(c.id) === String(selected));

  const exportVcf = async (list) => {
    if (!list.length) return;
    const res = await window.elitlig.files.save("Elitlig-Rehber.vcf", toVCard(list), [{ name: "vCard", extensions: ["vcf"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  const remove = async (c) => {
    if (!(await confirm({ title: "Kişiyi sil", message: `${c.name} rehberden silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    setSelected(null);
    if (result(await del(`/api/tools/contacts/${c.id}`), "Kişi silindi.")) data.reload({ quiet: true });
  };
  const toggleFav = async (c) => {
    data.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === c.id ? { ...x, favorite: !c.favorite } : x)) }));
    result(await patch(`/api/tools/contacts/${c.id}`, { favorite: !c.favorite }));
  };

  return (
    <div className="contacts">
      <aside className="contacts__list">
        <div className="row-gap">
          <div className="search-box search-box--full"><Icon name="search" size={14} /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${all.length} kişide ara`} /></div>
          <button type="button" className="icon-btn" title="Yeni kişi (⌘N)" onClick={() => setEditing({})}><Icon name="plus" /></button>
          <MenuButton items={[{ label: "Mac Kişiler'e aktar (.vcf)", icon: "download", onClick: () => exportVcf(shown) }]} />
        </div>
        {tags.length > 0 && <div className="tag-bar">{["", ...tags].map((t) => <button key={t || "all"} type="button" className={tag === t ? "is-on" : ""} onClick={() => setTag(t)}>{t ? `#${t}` : "Tümü"}</button>)}</div>}
        <OfflineNote offline={data.offline} savedAt={data.savedAt} />
        <ErrorNote error={data.error && !data.data ? data.error : null} onRetry={data.reload} />
        {data.loading && !data.data ? <Spinner /> : (
          <div className="contacts__scroll">
            {grouped.map(([letter, list]) => (
              <section key={letter}>
                <h4 className="letter">{letter}</h4>
                {list.map((c) => (
                  <button type="button" key={c.id} className={`contact-row ${String(selected) === String(c.id) ? "is-active" : ""}`} onClick={() => setSelected(c.id)}>
                    <span className="avatar">{letterOf(c.name)}</span>
                    <span><strong>{c.name}</strong><small>{[c.company, c.title].filter(Boolean).join(" · ") || prettyPhone(c.phone)}</small></span>
                  </button>
                ))}
              </section>
            ))}
            {!shown.length && <Empty icon="users" title="Kişi yok" text="⌘N ile kişi ekleyin ya da üye rehberinden ekleyin." />}
          </div>
        )}
      </aside>
      <section className="contacts__detail">
        {current ? (
          <div className="contact-card">
            <header>
              <span className="avatar avatar--xl">{letterOf(current.name)}</span>
              <div>
                <h2>{current.name}</h2>
                <p className="muted">{[current.title, current.company, current.city].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="row-gap">
                <button type="button" className={`icon-btn ${current.favorite ? "is-on" : ""}`} title="Favori" onClick={() => toggleFav(current)}><Icon name="star" /></button>
                <button type="button" className="btn btn--sm" onClick={() => setEditing(current)}>Düzenle</button>
                <MenuButton items={[{ label: "vCard olarak kaydet", icon: "download", onClick: () => exportVcf([current]) }, { label: "Sil", icon: "trash", danger: true, onClick: () => remove(current) }]} />
              </div>
            </header>
            <ContactActions phone={current.phone} email={current.email} />
            <dl className="kv">
              {current.phone && <><dt>Telefon</dt><dd>{prettyPhone(current.phone)}</dd></>}
              {current.email && <><dt>E-posta</dt><dd>{current.email}</dd></>}
              {current.city && <><dt>İl</dt><dd>{current.city}</dd></>}
              {current.tags?.length > 0 && <><dt>Etiketler</dt><dd>{current.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</dd></>}
              {current.member_user_id && <><dt>Üyelik</dt><dd>Siteye kayıtlı üye (#{current.member_user_id})</dd></>}
            </dl>
            {current.note && <div className="note-box">{current.note}</div>}
          </div>
        ) : <Empty icon="user" title="Bir kişi seçin" />}
      </section>
      {editing && <ContactEditor contact={editing.id ? editing : null} draft={editing.id ? null : editing} onClose={() => setEditing(null)} onSaved={(item) => { setEditing(null); data.reload({ quiet: true }); if (item?.id) setSelected(item.id); }} />}
    </div>
  );
}

function ContactEditor({ contact, draft, onClose, onSaved }) {
  const result = useResult();
  const src = contact || draft || {};
  const [form, setForm] = useState({ name: src.name || "", company: src.company || "", title: src.title || "", phone: src.phone || "", email: src.email || "", city: src.city || "", tags: (src.tags || []).join(", "), note: src.note || "", favorite: Boolean(src.favorite), member_user_id: src.member_user_id || undefined });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    const res = contact ? await patch(`/api/tools/contacts/${contact.id}`, body) : await post("/api/tools/contacts", body, { tempId: tempId() });
    setBusy(false);
    if (result(res, contact ? "Kişi güncellendi." : "Kişi eklendi.")) onSaved(res.data?.item);
  };
  return (
    <Modal title={contact ? "Kişiyi düzenle" : "Yeni kişi"} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="contact-form" className="btn btn--primary" disabled={busy || !form.name.trim()}>Kaydet</button>
    </>}>
      <form id="contact-form" className="form-grid" onSubmit={save}>
        <Field label="Ad soyad" className="span2"><input autoFocus value={form.name} onChange={set("name")} /></Field>
        <Field label="Kurum / takım"><input value={form.company} onChange={set("company")} /></Field>
        <Field label="Görev / unvan"><input value={form.title} onChange={set("title")} /></Field>
        <Field label="Telefon"><input value={form.phone} onChange={set("phone")} placeholder="0555 123 45 67" /></Field>
        <Field label="E-posta"><input type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="İl"><input value={form.city} onChange={set("city")} /></Field>
        <Field label="Etiketler (virgülle)"><input value={form.tags} onChange={set("tags")} placeholder="hakem, saha" /></Field>
        <Field label="Not" className="span2"><textarea rows={3} value={form.note} onChange={set("note")} /></Field>
        <label className="toggle"><input type="checkbox" checked={form.favorite} onChange={set("favorite")} /> Favori</label>
      </form>
    </Modal>
  );
}

function Directory() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [member, setMember] = useState(null);
  const [adding, setAdding] = useState(null);
  const query = useDebounced(q, 300);
  const params = { q: query || undefined, category: category || undefined, city: city || undefined, new: onlyNew ? 1 : undefined, has_phone: hasPhone ? 1 : undefined, sort, page, page_size: 60 };
  const data = useResource("/api/tools/contacts/directory", params);
  const d = data.data;
  React.useEffect(() => setPage(1), [query, category, city, onlyNew, hasPhone, sort]);

  const exportCsv = async () => {
    const res = await window.elitlig.request({ path: "/api/tools/contacts/directory", query: { ...params, page: undefined, page_size: undefined, export: 1 }, cache: false });
    if (!res.ok) return;
    const rows = [["Ad soyad", "Kullanıcı adı", "Kategori", "Telefon", "E-posta", "İl", "Takım", "Kayıt tarihi"], ...res.data.items.map((m) => [m.name, m.username, m.categories?.join(", "), m.phone || "", m.email || "", m.city || "", m.team?.name || m.player?.team || "", m.createdAt ? formatDate(m.createdAt) : ""])];
    const saved = await window.elitlig.files.save("Elitlig-Uye-Rehberi.csv", toCsvText(rows), [{ name: "CSV", extensions: ["csv"] }]);
    if (saved.ok) window.elitlig.files.reveal(saved.path);
  };

  if (data.error?.status === 403) return <Empty icon="lock" title="Üye rehberine erişiminiz yok" text={data.error.message} />;

  return (
    <div className="directory">
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, kullanıcı adı, telefon, e-posta" /></div>
        <Segmented value={category} onChange={setCategory} size="sm" options={CATEGORY.map((c) => ({ value: c.value, label: c.label, count: d?.counts?.[c.key] }))} />
        {d?.cities?.length > 0 && <select className="select-sm" value={city} onChange={(e) => setCity(e.target.value)}><option value="">Tüm iller</option>{d.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        <label className="toggle"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Son 7 gün {d?.counts?.new_week ? `(${d.counts.new_week})` : ""}</label>
        <label className="toggle"><input type="checkbox" checked={hasPhone} onChange={(e) => setHasPhone(e.target.checked)} /> Telefonu olan</label>
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">En yeni</option><option value="oldest">En eski</option><option value="name">Ada göre A–Z</option><option value="name_desc">Ada göre Z–A</option></select>
        <button type="button" className="btn btn--sm" onClick={exportCsv}><Icon name="download" /> CSV</button>
      </div>
      <OfflineNote offline={data.offline} savedAt={data.savedAt} />
      <ErrorNote error={data.error && !d ? data.error : null} onRetry={data.reload} />
      {data.loading && !d ? <Spinner /> : d?.items?.length ? (<>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ad soyad</th><th>Kategori</th><th>Telefon</th><th>İl</th><th>Takım</th><th>Kayıt</th><th /></tr></thead>
            <tbody>
              {d.items.map((m) => (
                <tr key={m.id} className="is-clickable" onClick={() => setMember(m)}>
                  <td><strong>{m.name}</strong> {m.isNew && <span className="pill pill--blue">Yeni</span>}<small className="muted"> @{m.username}</small></td>
                  <td>{m.categories?.map((c) => CATEGORY.find((x) => x.value === c)?.label || c).join(", ")}</td>
                  <td>{m.phone ? prettyPhone(m.phone) : <span className="muted">—</span>}</td>
                  <td>{m.city || ""}</td>
                  <td>{m.team?.name || m.player?.team || ""}</td>
                  <td className="muted">{m.createdAt ? formatDate(m.createdAt) : ""}</td>
                  <td onClick={(e) => e.stopPropagation()}><ContactActions phone={m.phone} email={null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span className="muted">{d.total} üye · sayfa {d.page}</span>
          <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</button>
          <button type="button" className="btn btn--sm" disabled={!d.hasMore} onClick={() => setPage(page + 1)}>Sonraki</button>
        </div>
      </>) : <Empty icon="users" title="Üye bulunamadı" />}

      {member && (
        <Modal title={member.name} onClose={() => setMember(null)} width={480} footer={<>
          <button type="button" className="btn" onClick={() => setMember(null)}>Kapat</button>
          <button type="button" className="btn btn--primary" onClick={() => { setAdding({ name: member.name, phone: member.phone || "", email: member.email || "", city: member.city || "", company: member.team?.name || "", member_user_id: member.id }); setMember(null); }}><Icon name="plus" /> Kişilerime ekle</button>
        </>}>
          <ContactActions phone={member.phone} email={member.email} />
          <dl className="kv">
            <dt>Kullanıcı adı</dt><dd>@{member.username}</dd>
            <dt>Kategori</dt><dd>{member.categories?.join(", ")}</dd>
            {member.phone && <><dt>Telefon</dt><dd>{prettyPhone(member.phone)}</dd></>}
            {member.email && <><dt>E-posta</dt><dd>{member.email}</dd></>}
            {member.city && <><dt>İl</dt><dd>{member.city}</dd></>}
            {member.team?.name && <><dt>Takım</dt><dd>{member.team.name}</dd></>}
            {member.player && <><dt>Oyuncu</dt><dd>{member.player.name}{member.player.team ? ` · ${member.player.team}` : ""}</dd></>}
            <dt>Durum</dt><dd>{member.status}</dd>
            {member.createdAt && <><dt>Kayıt</dt><dd>{formatDate(member.createdAt)}</dd></>}
          </dl>
        </Modal>
      )}
      {adding && <ContactEditor draft={adding} onClose={() => setAdding(null)} onSaved={() => setAdding(null)} />}
    </div>
  );
}
