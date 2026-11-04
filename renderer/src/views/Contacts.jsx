// Rehber: siteye kaydolan üyeler (canlı, /contacts/directory) ile elle eklenen
// kişi/cari kartları (/contacts) tek listede — web'deki Rehber'le aynı.
// Üyeye eklenen kişisel not ve favori, member_user_id'li kartta saklanır.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, OfflineNote, Spinner, ViewHeader, useConfirm, useResult } from "../components/ui";
import { del, get, patch, post, request, tempId, useCommand, useDebounced, useResource } from "../api";
import { formatDate, includesTr, letterOf, prettyPhone, toVCard, waNumber } from "../lib/helpers";
import { toCsvText } from "../lib/sheets/sheetEngine";

const FILTERS = [
  { key: "all", label: "Tümü", icon: "users" },
  { key: "uye", label: "Üye", icon: "user", category: "uye" },
  { key: "oyuncu", label: "Oyuncu", icon: "shirt", category: "oyuncu" },
  { key: "takim_baskani", label: "Takım başkanı", icon: "award", category: "takim_baskani" },
  { key: "yonetim", label: "Yönetim", icon: "lock", category: "yonetim" },
  { key: "manual", label: "Manuel kayıt", icon: "note" },
  { key: "favorites", label: "Favoriler", icon: "star" },
];
const CAT_LABEL = { uye: "Üye", oyuncu: "Oyuncu", takim_baskani: "Takım başkanı", yonetim: "Yönetim" };
const SORTS = [["newest", "En yeni"], ["oldest", "En eski"], ["name", "A → Z"], ["name_desc", "Z → A"]];
const openUrl = (url) => window.elitlig.app.openExternal(url);

function ContactActions({ phone, email }) {
  if (!phone && !email) return null;
  return (
    <div className="contact-actions">
      {phone && <button type="button" className="icon-btn" title="Ara (iPhone / FaceTime)" onClick={() => openUrl(`tel:${phone.replace(/\s/g, "")}`)}><Icon name="phone" /></button>}
      {phone && <button type="button" className="icon-btn icon-btn--wa" title="WhatsApp" onClick={() => openUrl(`https://wa.me/${waNumber(phone)}`)}><Icon name="message" /></button>}
      {email && <button type="button" className="icon-btn" title="E-posta" onClick={() => openUrl(`mailto:${email}`)}><Icon name="mail" /></button>}
      {phone && <button type="button" className="icon-btn" title="Numarayı kopyala" onClick={() => navigator.clipboard.writeText(phone)}><Icon name="copy" /></button>}
    </div>
  );
}

const memberRow = (m, card) => ({ key: `m${m.id}`, kind: "member", id: m.id, name: m.name, sub: [m.team?.name || m.player?.team, m.city].filter(Boolean).join(" · "), phone: m.phone, email: m.email, city: m.city, createdAt: m.createdAt, categories: m.categories || [], favorite: Boolean(card?.favorite), card, member: m, isNew: m.isNew });
const manualRow = (c) => ({ key: `c${c.id}`, kind: "manual", id: c.id, name: c.name, sub: [c.company, c.title].filter(Boolean).join(" · ") || prettyPhone(c.phone), phone: c.phone, email: c.email, city: c.city, createdAt: c.createdAt, categories: [], favorite: Boolean(c.favorite), card: c });

export default function Contacts({ arg }) {
  const result = useResult();
  const confirm = useConfirm();
  const [filter, setFilter] = useState(() => localStorage.getItem("contacts:filter") || "all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [city, setCity] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [selected, setSelected] = useState(arg && arg !== "new" ? `c${arg}` : null);
  const [editing, setEditing] = useState(arg === "new" ? {} : null);
  const [members, setMembers] = useState({ items: [], page: 0, hasMore: false, total: 0, counts: null, cities: [], loading: false, error: null, offline: false });
  const [favMembers, setFavMembers] = useState([]);
  const searchRef = useRef(null);
  const query = useDebounced(q, 300);
  const manual = useResource("/api/tools/contacts");
  const cards = useMemo(() => manual.data?.items || [], [manual.data]);
  const cardByMember = useMemo(() => new Map(cards.filter((c) => c.member_user_id).map((c) => [Number(c.member_user_id), c])), [cards]);
  const manualOnly = useMemo(() => cards.filter((c) => !c.member_user_id), [cards]);
  const def = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const wantsMembers = filter !== "manual" && filter !== "favorites" && members.error?.status !== 403;

  useEffect(() => { try { localStorage.setItem("contacts:filter", filter); } catch { /* yoksay */ } }, [filter]);
  useCommand("new", () => setEditing({}));
  useCommand("find", () => searchRef.current?.focus());

  // Üye rehberi: ilk sayfa ve "daha fazla"; sayılar ve iller ilk sayfadan korunur.
  const loadMembers = async (page = 1) => {
    if (!wantsMembers && page === 1 && members.error?.status === 403) return;
    setMembers((s) => ({ ...s, loading: true }));
    const res = await get("/api/tools/contacts/directory", { q: query || undefined, category: def.category, city: city || undefined, has_phone: onlyPhone ? 1 : undefined, new: onlyNew ? 1 : undefined, sort, page, page_size: 60 });
    setMembers((s) => {
      if (!res.ok) return { ...s, loading: false, error: res.error, items: page === 1 ? [] : s.items };
      const d = res.data;
      return { items: page === 1 ? d.items : [...s.items, ...d.items], page, hasMore: d.hasMore, total: d.total, counts: d.counts || s.counts, cities: d.cities?.length ? d.cities : s.cities, loading: false, error: null, offline: Boolean(res.offline) };
    });
  };
  useEffect(() => { if (filter !== "manual" && filter !== "favorites") loadMembers(1); }, [query, filter, city, onlyPhone, onlyNew, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Favori üyeler tek tek okunur.
  useEffect(() => {
    if (filter !== "favorites") return;
    const ids = cards.filter((c) => c.member_user_id && c.favorite).map((c) => c.member_user_id);
    Promise.all(ids.map((id) => get(`/api/tools/contacts/directory/${id}`))).then((list) => setFavMembers(list.filter((r) => r.ok).map((r) => r.data.item)));
  }, [filter, cards]);

  const rows = useMemo(() => {
    const manualFiltered = manualOnly.filter((c) => (!q || includesTr(`${c.name} ${c.company} ${c.title} ${c.phone} ${c.email} ${c.city} ${c.note}`, q)) && (!onlyPhone || c.phone) && (!city || c.city === city)).map(manualRow);
    let list;
    if (filter === "manual") list = manualFiltered;
    else if (filter === "favorites") list = [...favMembers.map((m) => memberRow(m, cardByMember.get(Number(m.id)))), ...manualFiltered.filter((r) => r.favorite)];
    else if (filter === "all") list = [...members.items.map((m) => memberRow(m, cardByMember.get(Number(m.id)))), ...(onlyNew ? [] : manualFiltered)];
    else list = members.items.map((m) => memberRow(m, cardByMember.get(Number(m.id))));
    const byName = (a, b) => a.name.localeCompare(b.name, "tr");
    const byDate = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    return list.sort(sort === "name" ? byName : sort === "name_desc" ? (a, b) => -byName(a, b) : sort === "oldest" ? (a, b) => -byDate(a, b) : byDate);
  }, [manualOnly, members.items, favMembers, cardByMember, filter, q, onlyPhone, onlyNew, city, sort]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = sort.startsWith("name") ? letterOf(r.name) : r.createdAt ? new Date(r.createdAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" }) : "Tarihsiz";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()];
  }, [rows, sort]);

  const current = rows.find((r) => r.key === selected) || null;
  const count = (key) => {
    if (key === "manual") return manualOnly.length;
    if (key === "favorites") return cards.filter((c) => c.favorite).length;
    if (key === "all") return members.counts ? members.counts.all + manualOnly.length : null;
    return members.counts?.[key] ?? null;
  };

  const reloadAll = () => { manual.reload({ quiet: true }); };
  const toggleFav = async (row) => {
    if (row.kind === "manual" || row.card) {
      const card = row.card;
      if (result(await patch(`/api/tools/contacts/${card.id}`, { favorite: !card.favorite }))) reloadAll();
    } else {
      if (result(await post("/api/tools/contacts", { name: row.name, phone: row.phone, email: row.email, city: row.city, member_user_id: row.id, favorite: true }, { tempId: tempId() }), "Favorilere eklendi.")) reloadAll();
    }
  };
  const exportAll = async (format) => {
    let list = rows;
    if (filter !== "manual" && filter !== "favorites" && members.hasMore) {
      const res = await request({ path: "/api/tools/contacts/directory", query: { q: query || undefined, category: def.category, city: city || undefined, has_phone: onlyPhone ? 1 : undefined, new: onlyNew ? 1 : undefined, sort, export: 1 }, cache: false });
      if (res.ok) list = [...res.data.items.map((m) => memberRow(m)), ...(filter === "all" ? manualOnly.map(manualRow) : [])];
    }
    const name = `Elitlig-Rehber-${def.label}`;
    const data = format === "vcf" ? toVCard(list.map((r) => ({ name: r.name, phone: r.phone, email: r.email, city: r.city, company: r.sub }))) : toCsvText([["Ad soyad", "Tür", "Telefon", "E-posta", "İl", "Takım / kurum", "Kayıt"], ...list.map((r) => [r.name, r.kind === "member" ? r.categories.map((c) => CAT_LABEL[c] || c).join(", ") : "Manuel", r.phone || "", r.email || "", r.city || "", r.sub || "", r.createdAt ? formatDate(r.createdAt) : ""])]);
    const res = await window.elitlig.files.save(`${name}.${format}`, data, [{ name: format === "vcf" ? "vCard" : "CSV", extensions: [format] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };

  return (
    <div className="view">
      <ViewHeader icon="users" title="Rehber" subtitle={members.counts ? `${members.counts.all} kayıtlı üye · ${manualOnly.length} manuel kişi${members.counts.new_week ? ` · son 7 günde ${members.counts.new_week} yeni üye` : ""}` : `${manualOnly.length} kişi`}>
        <div className="search-box"><Icon name="search" size={14} /><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, telefon, e-posta, takım…" /></div>
        <MenuButton icon="download" label="Dışa aktar" items={[{ label: "Mac Kişiler'e aktar (.vcf)", onClick: () => exportAll("vcf") }, { label: "Excel / CSV", onClick: () => exportAll("csv") }]} />
        <button type="button" className="btn btn--primary" onClick={() => setEditing({})}><Icon name="plus" /> Kişi ekle</button>
      </ViewHeader>

      <div className="contact-filters">
        {FILTERS.filter((f) => members.error?.status !== 403 || ["manual", "favorites"].includes(f.key)).map((f) => (
          <button key={f.key} type="button" className={filter === f.key ? "is-active" : ""} onClick={() => { setFilter(f.key); setSelected(null); }}>
            <Icon name={f.icon} size={14} /> {f.label} {count(f.key) != null && <span>{count(f.key)}</span>}
          </button>
        ))}
      </div>
      <div className="filters">
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {members.cities?.length > 0 && <select className="select-sm" value={city} onChange={(e) => setCity(e.target.value)}><option value="">Tüm iller</option>{members.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        <label className="toggle"><input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Telefonu olanlar</label>
        {filter !== "manual" && <label className="toggle"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Son 7 gün</label>}
      </div>
      {members.error?.status === 403 && <div className="notice notice--warn"><Icon name="lock" size={14} /> {members.error.message || "Üye rehberini görmek için “Üyeleri görüntüleme” yetkisi gerekir."} Elle eklediğiniz kişiler aşağıda.</div>}
      {members.error && members.error.status !== 403 && <ErrorNote error={members.error} onRetry={() => loadMembers(1)} />}
      <OfflineNote offline={manual.offline || members.offline} savedAt={manual.savedAt} />

      <div className="contacts">
        <aside className="contacts__list">
          <div className="contacts__scroll">
            {(manual.loading && !manual.data) || (members.loading && !members.items.length && wantsMembers) ? <Spinner /> : grouped.map(([label, list]) => (
              <section key={label}>
                <h4 className="letter">{label}</h4>
                {list.map((r) => (
                  <button type="button" key={r.key} className={`contact-row ${selected === r.key ? "is-active" : ""}`} onClick={() => setSelected(r.key)}>
                    <span className="avatar">{letterOf(r.name)}</span>
                    <span className="contact-row__text">
                      <strong>{r.name} {r.favorite && <Icon name="star" size={11} />}</strong>
                      <small>{r.kind === "member" ? r.categories.map((c) => CAT_LABEL[c] || c).join(" · ") : "Manuel"}{r.sub ? ` · ${r.sub}` : ""}</small>
                    </span>
                    {r.isNew && <span className="pill pill--blue pill--xs">Yeni</span>}
                  </button>
                ))}
              </section>
            ))}
            {!rows.length && !members.loading && <Empty icon="users" title="Kayıt bulunamadı" text={q ? "Aramayı değiştirin." : "Süzgeçleri temizleyin ya da kişi ekleyin."} />}
            {members.hasMore && wantsMembers && <button type="button" className="btn btn--block btn--soft" disabled={members.loading} onClick={() => loadMembers(members.page + 1)}>{members.loading ? "Yükleniyor…" : `Daha fazla (${members.items.length} / ${members.total})`}</button>}
          </div>
        </aside>
        <section className="contacts__detail">
          {current ? <Detail row={current} onFav={() => toggleFav(current)} onEdit={() => setEditing(current.kind === "manual" ? current.card : current.card || { name: current.name, phone: current.phone || "", email: current.email || "", city: current.city || "", member_user_id: current.id })}
            onDelete={async () => { if (current.kind === "manual" && await confirm({ title: "Kişiyi sil", message: `${current.name} silinsin mi?`, danger: true, confirmLabel: "Sil" }) && result(await del(`/api/tools/contacts/${current.id}`), "Silindi.")) { setSelected(null); reloadAll(); } }} />
            : <Empty icon="user" title="Bir kişi seçin" text="Arayabilir, WhatsApp'tan yazabilir, not ve favori ekleyebilirsiniz." />}
        </section>
      </div>
      {editing && <ContactEditor contact={editing.id ? editing : null} draft={editing.id ? null : editing} onClose={() => setEditing(null)} onSaved={(item) => { setEditing(null); reloadAll(); if (item?.id && !item.member_user_id) setSelected(`c${item.id}`); }} />}
    </div>
  );
}

function Detail({ row, onFav, onEdit, onDelete }) {
  const m = row.member;
  const card = row.card;
  return (
    <div className="contact-card">
      <header>
        <span className="avatar avatar--xl">{letterOf(row.name)}</span>
        <div>
          <h2>{row.name}</h2>
          <p className="muted">{row.kind === "member" ? `@${m.username} · ${row.categories.map((c) => CAT_LABEL[c] || c).join(", ")}` : [card.title, card.company].filter(Boolean).join(" · ") || "Manuel kişi"}</p>
        </div>
        <div className="row-gap">
          <button type="button" className={`icon-btn ${row.favorite ? "is-on" : ""}`} title="Favori" onClick={onFav}><Icon name="star" /></button>
          <button type="button" className="btn btn--sm" onClick={onEdit}>{row.kind === "member" ? (card ? "Notu düzenle" : "Not ekle") : "Düzenle"}</button>
          {row.kind === "manual" && <MenuButton items={[{ label: "vCard olarak kaydet", icon: "download", onClick: () => window.elitlig.files.save(`${row.name}.vcf`, toVCard([card]), [{ name: "vCard", extensions: ["vcf"] }]) }, { label: "Sil", icon: "trash", danger: true, onClick: onDelete }]} />}
        </div>
      </header>
      <ContactActions phone={row.phone} email={row.email} />
      <dl className="kv">
        {row.phone && <><dt>Telefon</dt><dd>{prettyPhone(row.phone)}</dd></>}
        {row.email && <><dt>E-posta</dt><dd>{row.email}</dd></>}
        {row.city && <><dt>İl</dt><dd>{row.city}</dd></>}
        {m?.team?.name && <><dt>Takım</dt><dd>{m.team.name}</dd></>}
        {m?.player && <><dt>Oyuncu kaydı</dt><dd>{m.player.name}{m.player.team ? ` · ${m.player.team}` : ""}</dd></>}
        {m && <><dt>Üyelik</dt><dd>{m.status === "active" ? "Aktif" : m.status}{m.createdAt ? ` · ${formatDate(m.createdAt)} tarihinde katıldı` : ""}</dd></>}
        {card?.company && row.kind === "manual" && <><dt>Kurum</dt><dd>{card.company}</dd></>}
        {card?.tags?.length > 0 && <><dt>Etiketler</dt><dd>{card.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</dd></>}
      </dl>
      {card?.note && <div className="note-box"><strong className="small muted">Notunuz</strong><br />{card.note}</div>}
      {row.kind === "member" && !row.phone && <p className="muted small">Üye telefon bilgisi girmemiş.</p>}
    </div>
  );
}

function ContactEditor({ contact, draft, onClose, onSaved }) {
  const result = useResult();
  const src = contact || draft || {};
  const isMemberCard = Boolean(src.member_user_id);
  const [form, setForm] = useState({ name: src.name || "", company: src.company || "", title: src.title || "", phone: src.phone || "", email: src.email || "", city: src.city || "", tags: (src.tags || []).join(", "), note: src.note || "", favorite: Boolean(src.favorite) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), ...(isMemberCard ? { member_user_id: src.member_user_id } : {}) };
    const res = contact ? await patch(`/api/tools/contacts/${contact.id}`, body) : await post("/api/tools/contacts", body, { tempId: tempId() });
    setBusy(false);
    if (result(res, contact ? "Kaydedildi." : "Kişi eklendi.")) onSaved(res.data?.item);
  };
  return (
    <Modal title={isMemberCard ? `${src.name}: kişisel not` : contact ? "Kişiyi düzenle" : "Yeni kişi"} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="contact-form" className="btn btn--primary" disabled={busy || !form.name.trim()}>Kaydet</button>
    </>}>
      <form id="contact-form" className="form-grid" onSubmit={save}>
        {!isMemberCard && <>
          <Field label="Ad soyad" className="span2"><input autoFocus value={form.name} onChange={set("name")} /></Field>
          <Field label="Kurum / takım"><input value={form.company} onChange={set("company")} /></Field>
          <Field label="Görev / unvan"><input value={form.title} onChange={set("title")} /></Field>
          <Field label="Telefon"><input value={form.phone} onChange={set("phone")} placeholder="0555 123 45 67" /></Field>
          <Field label="E-posta"><input type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="İl"><input value={form.city} onChange={set("city")} /></Field>
        </>}
        <Field label="Etiketler (virgülle)" className={isMemberCard ? "span2" : ""}><input value={form.tags} onChange={set("tags")} placeholder="hakem, saha" /></Field>
        <Field label="Not" className="span2"><textarea autoFocus={isMemberCard} rows={4} value={form.note} onChange={set("note")} /></Field>
        <label className="toggle"><input type="checkbox" checked={form.favorite} onChange={set("favorite")} /> Favori</label>
      </form>
    </Modal>
  );
}
