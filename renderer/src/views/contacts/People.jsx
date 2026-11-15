// Rehber → Kişiler (masaüstü): web'deki Rehber'le aynı özellikler.
// Solda: Tüm kişiler, Favoriler, Son bakılanlar, Doğum günleri, Kişilerim ve
// HEDEF KİTLELER — en üstte Elitlig sistem kitlesi (Elitlig'in kendi
// sisteminden gelenler, canlı; üye / oyuncu / takım başkanı / yönetim
// kırılımı), altında kendi kitleleriniz. ⌘ ile birden çok kitle, VE / VEYA.
// Ortada: arama, favori şeridi, harf / takım / kitle bölümleri, A-Z atlama,
// çoklu seçimle toplu kitle atama. Sağda ayrıntı (ContactPanel).
// vCard / CSV içe ve dışa aktarma, yinelenenleri birleştirme.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, OfflineNote, Spinner, ViewHeader, useConfirm, useResult, useToast } from "../../components/ui";
import { del, get, patch, post, request, tempId, useCommand, useDebounced, useResource } from "../../api";
import {
  ALPHABET, ELITLIG_CATEGORIES, SYSTEM_AUDIENCE, contactMatches, contactsToCsv, contactsToVcf, contactToVcf, digitsOf, findDuplicates,
  groupByAudience, matchesAudiences, prettyPhone, rowAudiences, sectionsByLetter, upcomingBirthdays,
} from "../../lib/contactCore";
import { compareRows, manualRow, memberRow, mergeRows, rowContact, rowSubtitle, CAT_LABEL } from "../../lib/contactRows";
import ContactPanel from "./ContactPanel";
import ContactEditor from "./ContactEditor";
import { AudienceDialog, BulkAudienceDialog, DuplicatesDialog, ImportDialog, audienceIcon } from "./RehberDialogs";
import { Avatar } from "./Avatar";
import "./contacts.css";
import ExportButton from "../../components/ExportButton";
import { contactsReport } from "../../lib/export/reports";
import { normalizeContact } from "../../lib/contactCore";

const PAGE = 60;
const SMART = [
  { key: "all", label: "Tüm kişiler", icon: "users" },
  { key: "favorites", label: "Favoriler", icon: "star" },
  { key: "recent", label: "Son bakılanlar", icon: "clock" },
  { key: "birthdays", label: "Doğum günleri", icon: "sparkles" },
  { key: "manual", label: "Kişilerim", icon: "user" },
];
const SORTS = [["name", "A → Z"], ["name_desc", "Z → A"], ["newest", "En yeni"], ["oldest", "En eski"]];
const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ } };

const cardRow = (card, member) => (card.member_user_id ? memberRow(member || { id: Number(card.member_user_id), name: card.name, categories: [] }, card) : manualRow(card));
const refMember = (r) => ({ id: r.member_user_id, name: r.name, phone: r.phone, email: r.email, city: r.city, categories: r.categories || [] });

export default function People({ arg, argSeq, go, tabs, onTeam }) {
  const result = useResult();
  const toast = useToast();
  const confirm = useConfirm();
  const manualRes = useResource("/api/tools/contacts");
  const audRes = useResource("/api/tools/contacts/audiences");
  const cards = useMemo(() => manualRes.data?.items || [], [manualRes.data]);
  const memberAudiences = manualRes.data?.member_audiences || {};
  const audiences = useMemo(() => audRes.data?.items || [], [audRes.data]);
  const [members, setMembers] = useState({ items: [], page: 0, hasMore: false, total: 0, counts: null, cities: [], loading: false, error: null, offline: false });
  const [smart, setSmart] = useState("all");
  const [selectedAuds, setSelectedAuds] = useState([]);
  const [audMode, setAudMode] = useState("or");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [group, setGroup] = useState("letter");
  const [q, setQ] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [city, setCity] = useState("");
  const [selected, setSelected] = useState(arg && arg !== "new" ? `m${arg}` : null);
  // Paletten açılan, listede (henüz) olmayan kişi kartı (ör. üyeye bağlı kart).
  const [pinnedRow, setPinnedRow] = useState(null);
  const [editing, setEditing] = useState(arg === "new" ? { initial: {} } : null);
  const [dialog, setDialog] = useState(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Map());
  const [audRefs, setAudRefs] = useState({});
  const [favMembers, setFavMembers] = useState({});
  const [recents, setRecents] = useState(() => readJson("contacts:recent", []));
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const query = useDebounced(q, 300);
  useCommand("new", () => setEditing({ initial: {} }));
  useCommand("find", () => searchRef.current?.focus());

  const memberAccess = members.error?.status === 403 || audiences.find((a) => a.system)?.access === false ? false : true;
  const manualSelected = useMemo(() => selectedAuds.filter((id) => id !== SYSTEM_AUDIENCE), [selectedAuds]);
  const elitligSelected = selectedAuds.includes(SYSTEM_AUDIENCE);
  const wantsMembers = memberAccess && smart === "all" && (!selectedAuds.length || (elitligSelected && (audMode === "or" || !manualSelected.length)));

  const loadMembers = async (page = 1) => {
    setMembers((s) => ({ ...s, loading: true }));
    const res = await get("/api/tools/contacts/directory", { q: query || undefined, category: (elitligSelected && category) || undefined, city: city || undefined, has_phone: onlyPhone ? 1 : undefined, sort, page, page_size: PAGE });
    setMembers((s) => {
      if (!res.ok) return { ...s, loading: false, error: res.error, items: page === 1 ? [] : s.items };
      const d = res.data;
      return { items: page === 1 ? d.items : [...s.items, ...d.items], page, hasMore: d.hasMore, total: d.total, counts: d.counts || s.counts, cities: d.cities?.length ? d.cities : s.cities, loading: false, error: null, offline: Boolean(res.offline) };
    });
  };
  useEffect(() => { if (wantsMembers) loadMembers(1); }, [wantsMembers, query, category, city, onlyPhone, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const missing = manualSelected.filter((id) => !audRefs[id]);
    if (!missing.length) return undefined;
    let alive = true;
    Promise.all(missing.map((id) => get(`/api/tools/contacts/audiences/${id}/recipients`).then((r) => [id, r.ok ? r.data.items || [] : []])))
      .then((pairs) => { if (alive) setAudRefs((m) => ({ ...m, ...Object.fromEntries(pairs) })); });
    return () => { alive = false; };
  }, [manualSelected, audRefs]);
  useEffect(() => {
    if (smart !== "favorites" || !memberAccess) return;
    const ids = cards.filter((c) => c.member_user_id && c.favorite && !favMembers[c.member_user_id]).map((c) => c.member_user_id);
    if (!ids.length) return;
    Promise.all(ids.map((id) => get(`/api/tools/contacts/directory/${id}`))).then((list) => setFavMembers((m) => ({ ...m, ...Object.fromEntries(list.filter((r) => r.ok).map((r) => [r.data.item.id, r.data.item])) })));
  }, [smart, cards, memberAccess, favMembers]);

  // Rehber açıkken paletten kişi / "Yeni kişi" seçilince açık görünüm güncellenir.
  const cardsReady = Boolean(manualRes.data);
  useEffect(() => {
    if (!arg) return;
    if (arg === "new") { setEditing({ initial: {} }); return; }
    const card = cards.find((c) => String(c.id) === String(arg));
    if (card?.member_user_id) {
      const row = cardRow(card, members.items.find((m) => Number(m.id) === Number(card.member_user_id)));
      setPinnedRow(row);
      setSelected(row.key);
    } else {
      setPinnedRow(null);
      setSelected(`m${arg}`);
    }
  }, [arg, argSeq, cardsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => { manualRes.reload({ quiet: true }); audRes.reload({ quiet: true }); setAudRefs({}); };

  /* -------------------------------- satırlar -------------------------------- */
  const cardByMember = useMemo(() => new Map(cards.filter((c) => c.member_user_id).map((c) => [Number(c.member_user_id), c])), [cards]);
  const manualRows = useMemo(() => cards.filter((c) => !c.member_user_id).map(manualRow), [cards]);
  const memberRows = useMemo(() => members.items.map((m) => memberRow(m, cardByMember.get(Number(m.id)))), [members.items, cardByMember]);
  const audById = useMemo(() => new Map(audiences.map((a) => [String(a.id), a])), [audiences]);
  const audOf = useCallback((r) => [...rowAudiences(r, memberAudiences)].filter((id) => audById.has(id)), [memberAudiences, audById]);
  const localOk = useCallback((r) => contactMatches({ ...(r.card || {}), name: r.name, phone: r.phone, email: r.email, city: r.city, company: r.card?.company || r.sub }, query)
    && (!onlyPhone || digitsOf(r.phone).length > 0) && (!city || r.city === city), [query, onlyPhone, city]);
  const birthdays = useMemo(() => upcomingBirthdays(cards, { days: 60 }), [cards]);

  const rows = useMemo(() => {
    const cmp = compareRows(sort);
    if (smart === "favorites") return [...manualRows.filter((r) => r.favorite), ...cards.filter((c) => c.member_user_id && c.favorite).map((c) => cardRow(c, favMembers[c.member_user_id]))].filter(localOk).sort(cmp);
    if (smart === "birthdays") return birthdays.map((b) => ({ ...cardRow(b.contact), birthday: b })).filter(localOk);
    if (smart === "recent") {
      const known = new Map([...manualRows, ...memberRows].map((r) => [r.key, r]));
      return recents.map((r) => known.get(r.key) || (r.member ? memberRow(r.member, cardByMember.get(Number(r.id))) : null)).filter(Boolean).filter(localOk);
    }
    if (smart === "manual") return [...manualRows, ...cards.filter((c) => c.member_user_id).map((c) => cardRow(c))].filter(localOk).sort(cmp);
    if (!selectedAuds.length) return memberAccess ? mergeRows(memberRows, manualRows.filter(localOk), sort, members.hasMore) : manualRows.filter(localOk).sort(cmp);
    if (wantsMembers) return manualSelected.length ? mergeRows(memberRows, manualRows.filter((r) => matchesAudiences(r, manualSelected, "or", memberAudiences)).filter(localOk), sort, members.hasMore) : memberRows;
    const cand = new Map(manualRows.map((r) => [r.key, r]));
    manualSelected.forEach((id) => (audRefs[id] || []).forEach((it) => {
      if (!it.member_user_id || cand.has(`u${it.member_user_id}`)) return;
      cand.set(`u${it.member_user_id}`, memberRow(members.items.find((m) => Number(m.id) === Number(it.member_user_id)) || refMember(it), cardByMember.get(Number(it.member_user_id))));
    }));
    return [...cand.values()].filter((r) => matchesAudiences(r, selectedAuds, audMode, memberAudiences)).filter(localOk).sort(cmp);
  }, [smart, sort, cards, manualRows, memberRows, members.items, members.hasMore, favMembers, birthdays, recents, cardByMember, selectedAuds, manualSelected, wantsMembers, memberAccess, memberAudiences, audRefs, audMode, localOk]);

  const groups = useMemo(() => {
    if (smart === "birthdays") return [{ label: "Önümüzdeki 60 gün", rows }];
    if (smart === "recent") return [{ label: "Son bakılanlar", rows }];
    if (group === "team") {
      const map = new Map();
      rows.forEach((r) => { const k = r.team?.name || "Takımsız"; map.set(k, [...(map.get(k) || []), r]); });
      return [...map.entries()].sort(([a], [b]) => (a === "Takımsız") - (b === "Takımsız") || a.localeCompare(b, "tr")).map(([label, list]) => ({ label, rows: list, count: true }));
    }
    if (group === "audience") return groupByAudience(rows, audiences, memberAudiences).map((g) => ({ label: g.audience.name, audience: g.audience, rows: g.rows, count: true }));
    if (sort.startsWith("name")) { const s = sectionsByLetter(rows); return (sort === "name_desc" ? s.reverse().map((x) => ({ ...x, rows: [...x.rows].reverse() })) : s).map((x) => ({ label: x.letter, letter: true, rows: x.rows })); }
    const map = new Map();
    rows.forEach((r) => { const k = r.createdAt ? new Date(r.createdAt).toLocaleDateString("tr-TR", { month: "long", year: "numeric" }) : "Tarihsiz"; map.set(k, [...(map.get(k) || []), r]); });
    return [...map.entries()].map(([label, list]) => ({ label, rows: list }));
  }, [rows, smart, group, sort, audiences, memberAudiences]);
  const letters = new Set(groups.filter((g) => g.letter).map((g) => g.label));
  const known = useMemo(() => new Map([...(pinnedRow ? [pinnedRow] : []), ...rows, ...manualRows, ...memberRows].map((r) => [r.key, r])), [rows, manualRows, memberRows, pinnedRow]);
  const current = known.get(selected) || null;
  useEffect(() => {
    if (!current) return;
    setRecents((list) => { const next = [{ key: current.key, id: current.id, member: current.member || null }, ...list.filter((r) => r.key !== current.key)].slice(0, 20); writeJson("contacts:recent", next); return next; });
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const elitlig = audiences.find((a) => a.system);
  const manualAuds = audiences.filter((a) => !a.system);
  const favorites = [...manualRows.filter((r) => r.favorite), ...cards.filter((c) => c.member_user_id && c.favorite).map((c) => cardRow(c, members.items.find((m) => Number(m.id) === Number(c.member_user_id))))].slice(0, 14);
  const counts = { all: (elitlig?.count ?? members.counts?.all ?? 0) + manualRows.length, favorites: cards.filter((c) => c.favorite).length, recent: recents.length, birthdays: birthdays.length, manual: cards.length };
  const pickedRows = [...picked.values()];

  /* --------------------------------- işlemler --------------------------------- */
  const pickAudience = (id, multi) => {
    const key = String(id);
    if (key === SYSTEM_AUDIENCE && !memberAccess) { toast("Elitlig kitlesini görmek için “Üyeleri görüntüleme” yetkisi gerekir.", { tone: "warn" }); return; }
    setSmart("all");
    setSelected(null);
    setSelectedAuds((list) => (multi ? (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]) : list.length === 1 && list[0] === key ? [] : [key]));
    if (key !== SYSTEM_AUDIENCE || multi) setCategory("");
  };
  const toggleFav = async (row) => {
    if (row.card) { if (result(await patch(`/api/tools/contacts/${row.card.id}`, { favorite: !row.card.favorite }))) reload(); }
    else if (result(await post("/api/tools/contacts", { name: row.name, member_user_id: row.id, favorite: true }, { tempId: tempId() }), "Favorilere eklendi.")) reload();
  };
  const saveMember = async (row) => { if (result(await post("/api/tools/contacts", { name: row.name, member_user_id: row.id }, { tempId: tempId() }), `${row.name} kişilerinize kaydedildi.`)) reload(); };
  const removeCard = async (card) => {
    if (!(await confirm({ title: card.member_user_id ? "Kişisel kartı sil" : "Kişiyi sil", message: card.member_user_id ? "Bu üyeye eklediğiniz not, etiket ve favori silinsin mi? Üye rehberde kalır." : `${card.name} rehberden silinsin mi?`, danger: true, confirmLabel: "Sil" }))) return;
    if (result(await del(`/api/tools/contacts/${card.id}`), "Silindi.")) { setEditing(null); if (!card.member_user_id) setSelected(null); reload(); }
  };
  const audNames = (r) => audOf(r).map((id) => audById.get(id)?.name).filter(Boolean);
  const saveFile = async (name, text, ext, label) => { const res = await window.elitlig.files.save(name, text, [{ name: label, extensions: [ext] }]); if (res.ok) window.elitlig.files.reveal(res.path); };
  const collectAll = async () => {
    if (!wantsMembers || !members.hasMore) return rows;
    const res = await request({ path: "/api/tools/contacts/directory", query: { q: query || undefined, category: (elitligSelected && category) || undefined, city: city || undefined, has_phone: onlyPhone ? 1 : undefined, sort, export: 1 }, cache: false });
    return res.ok ? mergeRows(res.data.items.map((m) => memberRow(m, cardByMember.get(Number(m.id)))), rows.filter((r) => r.source === "manual"), sort, false) : rows;
  };
  const exportAs = async (kind, source) => {
    const list = (source || await collectAll()).map((r) => rowContact(r, audNames(r)));
    const title = [smart !== "all" ? SMART.find((s) => s.key === smart)?.label : null, ...selectedAuds.map((id) => audById.get(id)?.name)].filter(Boolean).join("-") || "Tumu";
    if (kind === "vcf") await saveFile(`Elitlig-Rehber-${title}.vcf`, contactsToVcf(list), "vcf", "vCard");
    else if (kind === "csv") await saveFile(`Elitlig-Rehber-${title}.csv`, contactsToCsv(list), "csv", "CSV");
    else if (kind === "phones") { const p = [...new Set(list.flatMap((c) => c.phones.map((x) => prettyPhone(x.value))))]; await navigator.clipboard.writeText(p.join("\n")); toast(`${p.length} telefon kopyalandı.`, { tone: "success" }); }
    else if (kind === "emails") { const e = [...new Set(list.flatMap((c) => c.emails.map((x) => x.value)))]; await navigator.clipboard.writeText(e.join(", ")); toast(`${e.length} e-posta kopyalandı.`, { tone: "success" }); }
  };
  const editRow = (row) => setEditing(row.source === "member" ? { initial: row.card || { name: row.name }, member: row.member || { id: row.id, name: row.name } } : { initial: row.card });
  const togglePick = (r) => setPicked((m) => { const n = new Map(m); if (n.has(r.key)) n.delete(r.key); else n.set(r.key, r); return n; });
  const scopeTitle = smart !== "all" ? SMART.find((s) => s.key === smart)?.label : selectedAuds.length ? selectedAuds.map((id) => audById.get(id)?.name || "Elitlig").join(audMode === "and" ? " ve " : " veya ") : "Tüm kişiler";

  return (
    <div className="view">
      <ViewHeader icon="users" title="Rehber" subtitle={`${elitlig?.count != null ? `${elitlig.count} Elitlig kişisi · ` : ""}${cards.length} kişiniz · ${manualAuds.length} hedef kitle`}>
        {tabs}
        <button type="button" className="btn" onClick={() => setDialog({ kind: "import" })}><Icon name="upload" size={14} /> İçe aktar</button>
        <ExportButton id="contacts" title="Rehber"
          scopes={[{ value: "view", label: "Listedeki kişiler" }, ...(pickedRows.length ? [{ value: "picked", label: `Seçili kişiler (${pickedRows.length})` }] : [])]}
          report={async ({ scope: sc }) => contactsReport((sc === "picked" ? pickedRows : await collectAll()).map((r) => normalizeContact(rowContact(r, audNames(r)))), { title: `Rehber — ${scopeTitle}`, filters: [query ? `"${query}"` : "", city || ""].filter(Boolean) })}
          extraItems={[
          { label: "Mac Kişiler / telefon (.vcf)", icon: "download", onClick: () => exportAs("vcf") },
          { label: "Telefonları kopyala", icon: "phone", onClick: () => exportAs("phones") },
          { label: "E-postaları kopyala", icon: "mail", onClick: () => exportAs("emails") },
          { label: "Yinelenen kişileri bul", icon: "copy", onClick: () => setDialog({ kind: "dupes", groups: findDuplicates(cards) }) },
        ]} />
        <button type="button" className="btn btn--primary" onClick={() => setEditing({ initial: { audience_ids: manualSelected.map(Number) } })}><Icon name="userPlus" size={14} /> Yeni kişi</button>
      </ViewHeader>
      <OfflineNote offline={manualRes.offline || members.offline} savedAt={manualRes.savedAt} />
      {members.error && members.error.status !== 403 && <ErrorNote error={members.error} onRetry={() => loadMembers(1)} />}

      <div className="rb">
        <aside className="rb-side" aria-label="Rehber listeleri">
          {SMART.map((s) => (
            <button key={s.key} type="button" className={`rb-side__item${smart === s.key && !selectedAuds.length ? " is-active" : ""}`} onClick={() => { setSmart(s.key); setSelectedAuds([]); setSelected(null); }}>
              <Icon name={s.icon} size={14} /><span>{s.label}</span>{counts[s.key] > 0 && <b>{counts[s.key]}</b>}
            </button>
          ))}
          <div className="rb-side__head"><h3>Hedef kitleler</h3><button type="button" className="icon-btn icon-btn--xs" onClick={() => setDialog({ kind: "audience", initial: {} })} aria-label="Hedef kitle ekle" title="Hedef kitle ekle"><Icon name="plus" size={13} /></button></div>
          <nav aria-label="Hedef kitleler" className="rb-side__auds">
            {elitlig && (
              <div className={`rb-side__item rb-aud${elitligSelected ? " is-active" : ""}`} style={{ "--aud": elitlig.color }}>
                <button type="button" className="rb-aud__btn" aria-pressed={elitligSelected} onClick={(e) => pickAudience(SYSTEM_AUDIENCE, e.metaKey || e.ctrlKey || e.shiftKey)} title="Elitlig'in kendi sisteminden gelenler (otomatik)">
                  <span className="rb-audicon"><Icon name="shield" size={13} /></span><span>Elitlig<small>Sistem kitlesi</small></span>
                </button>
                {elitlig.access === false ? <Icon name="lock" size={12} /> : <b>{elitlig.count ?? ""}</b>}
              </div>
            )}
            {elitligSelected && elitlig?.breakdown && (
              <div className="rb-subcats" role="radiogroup" aria-label="Elitlig kırılımı">
                <button type="button" role="radio" aria-checked={!category} className={!category ? "is-on" : ""} onClick={() => setCategory("")}>Tümü</button>
                {ELITLIG_CATEGORIES.map((c) => <button key={c.key} type="button" role="radio" aria-checked={category === c.key} className={category === c.key ? "is-on" : ""} onClick={() => setCategory(c.key)}>{c.label} <small>{elitlig.breakdown[c.key]}</small></button>)}
              </div>
            )}
            {manualAuds.map((a) => {
              const on = selectedAuds.includes(String(a.id));
              return (
                <div key={a.id} className={`rb-side__item rb-aud${on ? " is-active" : ""}`} style={{ "--aud": a.color || "#64748b" }}>
                  <button type="button" className="rb-aud__btn" aria-pressed={on} onClick={(e) => pickAudience(a.id, e.metaKey || e.ctrlKey || e.shiftKey)} title={a.description || "⌘ ile birden çok kitle seçin"}>
                    <span className="rb-audicon"><Icon name={audienceIcon(a.icon)} size={13} /></span><span>{a.name}</span>
                  </button>
                  <b>{a.count}</b>
                  <button type="button" className="icon-btn icon-btn--xs rb-aud__edit" onClick={() => setDialog({ kind: "audience", initial: a })} aria-label={`${a.name} kitlesini düzenle`}><Icon name="pencil" size={12} /></button>
                </div>
              );
            })}
            {!manualAuds.length && <p className="rb-side__empty">Sponsorlar, Hakemler, Basın… kendi hedef kitlelerinizi oluşturun.</p>}
          </nav>
          {selectedAuds.length > 1 && (
            <div className="rb-andor"><span>Birleştir:</span>
              <div className="seg seg--sm" role="radiogroup" aria-label="Kitle birleştirme">
                <button type="button" role="radio" aria-checked={audMode === "or"} className={audMode === "or" ? "is-active" : ""} onClick={() => setAudMode("or")}>VEYA</button>
                <button type="button" role="radio" aria-checked={audMode === "and"} className={audMode === "and" ? "is-active" : ""} onClick={() => setAudMode("and")}>VE</button>
              </div>
            </div>
          )}
        </aside>

        <section className="rb-list" aria-label="Kişiler">
          <div className="rb-list__head">
            <div className="rb-list__title"><h2>{scopeTitle}</h2><span className="muted small">{wantsMembers ? members.total + rows.filter((r) => r.source === "manual").length : rows.length}</span></div>
            <div className="search-box search-box--full"><Icon name="search" size={14} /><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, telefon, e-posta, kurum… (⌘F)" aria-label="Rehberde ara" /></div>
            <div className="rb-chips">
              <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button type="button" className={`rb-chip${group === "team" ? " is-on" : ""}`} aria-pressed={group === "team"} onClick={() => setGroup((g) => (g === "team" ? "letter" : "team"))}><Icon name="team" size={12} /> Takım</button>
              <button type="button" className={`rb-chip${group === "audience" ? " is-on" : ""}`} aria-pressed={group === "audience"} onClick={() => setGroup((g) => (g === "audience" ? "letter" : "audience"))}><Icon name="target" size={12} /> Kitle</button>
              <button type="button" className={`rb-chip${onlyPhone ? " is-on" : ""}`} aria-pressed={onlyPhone} onClick={() => setOnlyPhone((v) => !v)}><Icon name="phone" size={12} /> Telefonlu</button>
              {members.cities?.length > 0 && <select className="select-sm" value={city} onChange={(e) => setCity(e.target.value)} aria-label="İl"><option value="">Tüm iller</option>{members.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
              <button type="button" className={`rb-chip${picking ? " is-on" : ""}`} aria-pressed={picking} onClick={() => { setPicking((v) => !v); setPicked(new Map()); }}><Icon name="checkSquare" size={12} /> Seç</button>
            </div>
          </div>
          {!memberAccess && smart === "all" && <div className="notice notice--warn"><Icon name="lock" size={14} /> Elitlig üyelerini görmek için “Üyeleri görüntüleme” yetkisi gerekir.</div>}
          {picking && picked.size > 0 && (
            <div className="rb-bulk">
              <strong>{picked.size} seçili</strong>
              <button type="button" className="btn btn--sm btn--primary" onClick={() => setDialog({ kind: "bulk" })}>Hedef kitle…</button>
              <button type="button" className="btn btn--sm" onClick={() => exportAs("vcf", pickedRows)}>vCard</button>
              <button type="button" className="btn btn--sm" onClick={() => exportAs("csv", pickedRows)}>CSV</button>
              <button type="button" className="btn btn--sm" onClick={() => setPicked(new Map(rows.map((r) => [r.key, r])))}>Tümü</button>
            </div>
          )}
          {smart === "all" && !selectedAuds.length && !query && favorites.length > 0 && (
            <div className="rb-favs">{favorites.map((f) => <button key={f.key} type="button" className={`rb-fav${selected === f.key ? " is-active" : ""}`} onClick={() => setSelected(f.key)} title={f.name}><Avatar name={f.name} src={f.avatar} /><span>{f.name.split(" ")[0]}</span></button>)}</div>
          )}
          {smart === "all" && !selectedAuds.length && !query && birthdays.some((b) => b.inDays <= 14) && (
            <button type="button" className="rb-bday" onClick={() => setSmart("birthdays")}><Icon name="sparkles" size={14} /> {birthdays.filter((b) => b.inDays <= 14).slice(0, 3).map((b) => `${b.contact.name.split(" ")[0]} (${b.inDays === 0 ? "bugün" : `${b.inDays} gün`})`).join(", ")}</button>
          )}
          <div className="rb-list__body">
            <div className="rb-list__scroll" ref={listRef}>
              {(manualRes.loading && !manualRes.data) || (wantsMembers && members.loading && !members.items.length) ? <Spinner /> : !rows.length ? (
                <Empty icon="users" title={selectedAuds.length ? "Bu kitlede kişi yok" : q ? "Kayıt bulunamadı" : smart === "birthdays" ? "Yaklaşan doğum günü yok" : "Kişi yok"} text={selectedAuds.length ? "“Seç” ile kişileri işaretleyip kitleye ekleyin." : q ? "Aramayı değiştirin." : "Kişi ekleyin ya da içe aktarın."} />
              ) : groups.map((g) => (
                <section key={g.label} data-letter={g.letter ? g.label : undefined}>
                  <h4 className="rb-letter" style={g.audience ? { "--aud": g.audience.color || "#64748b" } : undefined}>{g.audience && <span className="rb-dot" />}{g.label}{g.count && <span>{g.rows.length}</span>}</h4>
                  {g.rows.map((r) => (
                    <div key={`${g.label}-${r.key}`} className={`rb-row${selected === r.key ? " is-active" : ""}`}>
                      {picking && <input type="checkbox" checked={picked.has(r.key)} onChange={() => togglePick(r)} aria-label={`${r.name} seç`} />}
                      <button type="button" className="rb-row__main" onClick={() => (picking ? togglePick(r) : setSelected(r.key))}>
                        <Avatar name={r.name} src={r.avatar} />
                        <span className="rb-row__text">
                          <strong>{r.name} {r.favorite && <Icon name="star" size={11} />}</strong>
                          {r.team && group !== "team" && <span className="team-badge">{r.team.name}{r.team.captain ? " · Başkan" : ""}</span>}
                          <small>{r.source === "member" ? r.categories.map((c) => CAT_LABEL[c] || c).join(" · ") : rowSubtitle(r)}{r.city ? ` · ${r.city}` : ""}</small>
                        </span>
                        {r.birthday ? <span className="rb-row__bday">{r.birthday.inDays === 0 ? "Bugün" : `${r.birthday.inDays} gün`}</span> : audOf(r).filter((id) => id !== SYSTEM_AUDIENCE).slice(0, 2).map((id) => <span key={id} className="rb-mini" style={{ "--aud": audById.get(id).color || "#64748b" }} title={audById.get(id).name} />)}
                      </button>
                    </div>
                  ))}
                </section>
              ))}
              {wantsMembers && members.hasMore && <button type="button" className="btn btn--block btn--soft" disabled={members.loading} onClick={() => loadMembers(members.page + 1)}>{members.loading ? "Yükleniyor…" : `Daha fazla (${members.items.length} / ${members.total})`}</button>}
            </div>
            {group === "letter" && sort.startsWith("name") && rows.length > 12 && (
              <nav className="rb-az" aria-label="Harfe atla">{ALPHABET.map((l) => <button key={l} type="button" disabled={!letters.has(l)} onClick={() => listRef.current?.querySelector(`[data-letter="${l}"]`)?.scrollIntoView({ block: "start" })}>{l}</button>)}</nav>
            )}
          </div>
        </section>

        <section className="rb-detail" aria-label="Kişi ayrıntısı">
          {current ? (
            <ContactPanel key={current.key} row={current} audiences={audiences} rowAudienceIds={audOf(current)} go={go} onTeam={onTeam}
              onEdit={() => editRow(current)} onFav={() => toggleFav(current)} onSaveMember={() => saveMember(current)} onDelete={() => current.card && removeCard(current.card)}
              onAudience={() => { setPicked(new Map([[current.key, current]])); setDialog({ kind: "bulk" }); }}
              onVcard={() => saveFile(`${current.name}.vcf`, contactToVcf(rowContact(current, audNames(current))), "vcf", "vCard")} />
          ) : <Empty icon="user" title="Bir kişi seçin" text="Arayın, WhatsApp'tan yazın, kitleye ekleyin." />}
        </section>
      </div>

      {editing && <ContactEditor initial={editing.initial} member={editing.member} audiences={audiences} onClose={() => setEditing(null)} onDelete={removeCard} onSaved={(item) => { setEditing(null); reload(); if (item?.id && !item.member_user_id) setSelected(`m${item.id}`); }} />}
      {dialog?.kind === "audience" && <AudienceDialog initial={dialog.initial} audiences={audiences} onClose={() => setDialog(null)} onDone={(change) => { setDialog(null); if (change?.removed) setSelectedAuds((l) => l.filter((x) => x !== String(change.removed))); if (change?.into) setSelectedAuds([String(change.into)]); reload(); }} />}
      {dialog?.kind === "bulk" && <BulkAudienceDialog rows={pickedRows} audiences={audiences} memberAccess={memberAccess} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setPicked(new Map()); reload(); }} />}
      {dialog?.kind === "import" && <ImportDialog audiences={audiences} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog?.kind === "dupes" && <DuplicatesDialog groups={dialog.groups} onClose={() => setDialog(null)} onMerged={reload} />}
    </div>
  );
}
