// Rehber → Takımlar: takım adı öne çıkan takım rehberi ve takım kartı
// (başkanlar, kadro, sezonlar, son / gelecek maçlar), tek tıkla arama,
// WhatsApp, e-posta, Mesajlar'da yazışma ve takımla grup kurma.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, OfflineNote, Spinner, useResult, useToast } from "../../components/ui";
import { get, post, tempId, useDebounced } from "../../api";
import { formatDate, prettyPhone, waNumber } from "../../lib/helpers";
import { mediaUrl } from "../../lib/chatUtils";
import ExportButton from "../../components/ExportButton";
import { tableReport } from "../../lib/export/reports";
import { cityCounts, matchLine, matchResult, phonesText, pushRecent, recordText, teamContacts, teamCsv, teamInitials, teamMeta, teamVCards, waLinks, winRate } from "../../lib/teamUtils";

const SORTS = [["name", "Ada göre"], ["city", "İle göre"], ["members", "Üye sayısı"], ["matches", "Maç sayısı"], ["newest", "En yeni"]];
const openUrl = (url) => window.elitlig.app.openExternal(url);
const readRecent = () => { try { return JSON.parse(localStorage.getItem("contacts:recentTeams") || "[]"); } catch { return []; } };

export function TeamLogo({ team, size = 48 }) {
  const [broken, setBroken] = useState(false);
  const src = !broken && mediaUrl(team?.logo);
  return (
    <span className="team-logo" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {src ? <img src={src} alt="" onError={() => setBroken(true)} /> : teamInitials(team?.team_name)}
    </span>
  );
}

function Quick({ person, go, compact = false }) {
  const phone = person?.phone;
  return (
    <span className={`team-quick ${compact ? "team-quick--sm" : ""}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="icon-btn" disabled={!phone} title={phone ? `Ara: ${prettyPhone(phone)}` : "Telefon yok"} onClick={() => openUrl(`tel:${String(phone).replace(/\s/g, "")}`)}><Icon name="phone" size={14} /></button>
      <button type="button" className="icon-btn icon-btn--wa" disabled={!phone} title="WhatsApp" onClick={() => openUrl(`https://wa.me/${waNumber(phone)}`)}><Icon name="message" size={14} /></button>
      {!compact && <button type="button" className="icon-btn" disabled={!person?.email} title={person?.email || "E-posta yok"} onClick={() => openUrl(`mailto:${person.email}`)}><Icon name="mail" size={14} /></button>}
      {person?.id && <button type="button" className="icon-btn icon-btn--chat" title="Mesajlar'da yaz" onClick={() => go("messages", { userId: person.id })}><Icon name="send" size={14} /></button>}
    </span>
  );
}

export default function Teams({ go, tabs, initialTeam, initialQuery }) {
  const [q, setQ] = useState(initialQuery || "");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState(() => localStorage.getItem("contacts:teamSort") || "name");
  const [hasContact, setHasContact] = useState(false);
  const [state, setState] = useState({ items: [], total: 0, page: 0, hasMore: false, cities: [], loading: true, error: null, offline: false });
  const [selected, setSelected] = useState(initialTeam ? Number(initialTeam) : null);
  const [recent, setRecent] = useState(readRecent);
  const query = useDebounced(q, 300);

  const load = async (page = 1) => {
    setState((s) => ({ ...s, loading: true }));
    const res = await get("/api/tools/contacts/teams", { q: query || undefined, city: city || undefined, sort, has_contact: hasContact ? 1 : undefined, page, page_size: 120 });
    setState((s) => {
      if (!res.ok) return { ...s, loading: false, error: res.error };
      const d = res.data;
      return { items: page === 1 ? d.items : [...s.items, ...d.items], total: d.total, page, hasMore: d.hasMore, cities: d.cities || s.cities, loading: false, error: null, offline: Boolean(res.offline) };
    });
  };
  useEffect(() => { load(1); }, [query, city, sort, hasContact]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem("contacts:teamSort", sort); } catch { /* yoksay */ } }, [sort]);
  useEffect(() => {
    // Takım adıyla açıldıysa (oyuncunun takımı) tam eşleşen seçilir.
    const exact = initialQuery && state.items.find((t) => t.team_name === initialQuery);
    if (exact && selected !== exact.team_id) setSelected(exact.team_id);
    else if (!selected && state.items[0] && !initialTeam) setSelected(state.items[0].team_id);
  }, [state.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (t) => {
    setSelected(t.team_id);
    const next = pushRecent(recent, { team_id: t.team_id, team_name: t.team_name });
    setRecent(next);
    try { localStorage.setItem("contacts:recentTeams", JSON.stringify(next)); } catch { /* yoksay */ }
  };
  const chips = useMemo(() => cityCounts(state.items), [state.items]);
  const totals = useMemo(() => state.items.reduce((s, t) => ({ captains: s.captains + t.captains.length, accounts: s.accounts + t.player_accounts, contacts: s.contacts + t.contact_count }), { captains: 0, accounts: 0, contacts: 0 }), [state.items]);

  return (
    <div className="view">
      <header className="view-head">
        <span className="view-head__badge"><Icon name="team" size={22} strokeWidth={2} /></span>
        <div className="view-head__text">
          <h1>Rehber</h1>
          <p>{state.total} takım · {totals.captains} başkan · {totals.accounts} hesaplı oyuncu · {totals.contacts} kişiye ulaşılabilir</p>
        </div>
        <div className="view-head__tools">
          {tabs}
          <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Takım adı ara…" /></div>
        </div>
      </header>
      <div className="filters">
        <select className="select-sm" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {state.cities.length > 0 && <select className="select-sm" value={city} onChange={(e) => setCity(e.target.value)}><option value="">Tüm iller</option>{state.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        <label className="toggle"><input type="checkbox" checked={hasContact} onChange={(e) => setHasContact(e.target.checked)} /> İletişimi olanlar</label>
        <span className="spacer" />
        {!city && chips.length > 1 && <div className="team-cities">{chips.slice(0, 6).map((c) => <button key={c.city} type="button" onClick={() => setCity(c.city)}><Icon name="map" size={11} /> {c.city} <b>{c.count}</b></button>)}</div>}
        {city && <button type="button" className="chip" onClick={() => setCity("")}>{city} <Icon name="x" size={11} /></button>}
      </div>
      {recent.length > 0 && (
        <div className="team-recent"><span className="muted small">Son bakılanlar</span>{recent.map((r) => <button key={r.team_id} type="button" className={`chip ${selected === r.team_id ? "" : "chip--off"}`} onClick={() => setSelected(r.team_id)}>{r.team_name}</button>)}</div>
      )}
      {state.error && <ErrorNote error={state.error} onRetry={() => load(1)} />}
      <OfflineNote offline={state.offline} />
      <div className="contacts teams">
        <aside className="contacts__list teams__list">
          <div className="contacts__scroll">
            {state.loading && !state.items.length ? <Spinner /> : state.items.map((t) => (
              <button type="button" key={t.team_id} className={`team-row ${selected === t.team_id ? "is-active" : ""}`} onClick={() => open(t)}>
                <TeamLogo team={t} size={46} />
                <span className="team-row__text">
                  <strong>{t.team_name}</strong>
                  <small>{teamMeta(t) || "İl bilgisi yok"}</small>
                  <span className="team-row__stats">
                    {recordText(t.record) && <span className="pill pill--xs">{recordText(t.record)}</span>}
                    <span className="pill pill--xs">{t.total_matches} maç</span>
                    <span className={`pill pill--xs ${t.contact_count ? "pill--green" : ""}`}><Icon name="phone" size={10} /> {t.contact_count}</span>
                    <span className="pill pill--xs"><Icon name="users" size={10} /> {t.player_accounts}/{t.roster_count}</span>
                  </span>
                  {t.captains[0] && <span className="team-row__cap"><Icon name="award" size={11} /> {t.captains.map((c) => c.name).join(", ")}</span>}
                </span>
                {t.captains[0] && <Quick person={t.captains[0]} go={go} compact />}
              </button>
            ))}
            {!state.loading && !state.items.length && <Empty icon="team" title="Takım bulunamadı" text="Süzgeçleri değiştirin." />}
            {state.hasMore && <button type="button" className="btn btn--block btn--soft" disabled={state.loading} onClick={() => load(state.page + 1)}>{state.loading ? "Yükleniyor…" : `Daha fazla (${state.items.length} / ${state.total})`}</button>}
          </div>
        </aside>
        <section className="contacts__detail">
          {selected ? <TeamDetail key={selected} id={selected} go={go} /> : <Empty icon="team" title="Bir takım seçin" text="Başkanlar, kadro, sezonlar ve maçlar burada." />}
        </section>
      </div>
    </div>
  );
}

function TeamDetail({ id, go }) {
  const result = useResult();
  const toast = useToast();
  const [data, setData] = useState(null);
  useEffect(() => { get(`/api/tools/contacts/teams/${id}`).then((r) => setData(r.ok ? { ...r.data, offline: r.offline } : { error: r.error })); }, [id]);
  if (!data) return <Spinner />;
  if (data.error) return <ErrorNote error={data.error} />;
  const t = data.team;
  const contacts = teamContacts(data);
  const rate = winRate(t.record);
  const accounts = data.players.filter((p) => p.account).length;
  const save = async (name, text, mime) => {
    const res = await window.elitlig.files.save(name, text, [{ name: mime, extensions: [name.split(".").pop()] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  const addToContacts = async (u, role) => {
    if (result(await post("/api/tools/contacts", { name: u.name, phone: u.phone, email: u.email, city: u.city, company: t.team_name, title: role, member_user_id: u.id }, { tempId: tempId() }), `${u.name} rehberinize eklendi.`)) { /* tamam */ }
  };
  const makeGroup = () => {
    const users = contacts.map((c) => ({ user_id: c.id, name: c.name }));
    if (!users.length) { toast("Bu takımda hesabı olan kişi yok.", { tone: "warn" }); return; }
    go("messages", { newGroup: { title: t.team_name, description: teamMeta(t), users } });
  };
  return (
    <div className="team-card">
      <header className="team-card__head">
        <TeamLogo team={t} size={76} />
        <div className="team-card__title">
          <h2 className="selectable">{t.team_name}</h2>
          <p className="muted">{teamMeta(t) || "İl bilgisi yok"}{t.active ? "" : " · pasif"}</p>
          <div className="team-card__record">
            {recordText(t.record) && <>
              <span className="rec rec--w"><b>{t.record.wins}</b> G</span>
              <span className="rec rec--d"><b>{t.record.draws}</b> B</span>
              <span className="rec rec--l"><b>{t.record.losses}</b> M</span>
            </>}
            {(t.record.goals_for || t.record.goals_against) ? <span className="rec"><b>{t.record.goals_for}:{t.record.goals_against}</b> gol</span> : null}
            <span className="rec"><b>{t.total_matches}</b> maç</span>
            {rate != null && <span className="rec"><b>%{rate}</b> galibiyet</span>}
          </div>
        </div>
        <div className="team-card__actions">
          <button type="button" className="btn btn--primary" onClick={makeGroup} title="Başkanlar ve hesabı olan oyuncularla Mesajlar'da grup"><Icon name="users" /> Takımla grup kur</button>
          <ExportButton id="team-contacts" title={t.team_name}
            report={() => tableReport({ title: `${t.team_name} — Takım rehberi`, filters: [t.city].filter(Boolean), groupBy: "role",
              summary: [{ label: "Kişi", value: contacts.length, type: "number" }, { label: "Maç", value: t.total_matches || 0, type: "number" }],
              columns: [{ key: "name", label: "Ad soyad" }, { key: "role", label: "Rol" }, { key: "position", label: "Mevki" }, { key: "phone", label: "Telefon" }, { key: "email", label: "E-posta" }, { key: "city", label: "İl" }],
              rows: contacts })}
            extraItems={[
            { label: "Mac Kişiler'e aktar (.vcf)", icon: "user", onClick: () => save(`${t.team_name}.vcf`, teamVCards(data), "vCard") },
            { label: "Excel / CSV (eski biçim)", icon: "grid", onClick: () => save(`${t.team_name}.csv`, teamCsv(data), "CSV") },
            { label: "Telefonları kopyala", icon: "copy", disabled: !contacts.some((c) => c.phone), onClick: () => { navigator.clipboard.writeText(phonesText(contacts)); toast("Telefonlar kopyalandı.", { tone: "success" }); } },
          ]} />
          {contacts.some((c) => c.phone) && <MenuButton text="WhatsApp" icon="message" items={waLinks(contacts).map((l) => ({ label: l.name, icon: "message", onClick: () => openUrl(l.url) }))} />}
        </div>
      </header>
      <OfflineNote offline={data.offline} />

      <section className="team-sec">
        <h4>Başkanlar <span>{data.captains.length}</span></h4>
        {data.captains.length ? (
          <div className="team-people">
            {data.captains.map((c) => (
              <div key={c.id} className="team-person team-person--cap">
                <span className="avatar">{(c.name || "?")[0].toLocaleUpperCase("tr-TR")}</span>
                <span className="team-person__text">
                  <strong>{c.name}</strong>
                  <small>{[c.phone ? prettyPhone(c.phone) : "telefon yok", c.email, c.username && `@${c.username}`].filter(Boolean).join(" · ")}</small>
                </span>
                <Quick person={c} go={go} />
                <button type="button" className="btn btn--sm btn--soft" onClick={() => go("messages", { userId: c.id })}><Icon name="send" size={13} /> Mesaj gönder</button>
                <MenuButton items={[{ label: "Rehberime ekle", icon: "plus", onClick: () => addToContacts(c, "Takım başkanı") }, c.phone && { label: "Numarayı kopyala", icon: "copy", onClick: () => navigator.clipboard.writeText(c.phone) }]} />
              </div>
            ))}
          </div>
        ) : <p className="muted small">Bu takımın kayıtlı başkanı yok.</p>}
      </section>

      <section className="team-sec">
        <h4>Kadro <span>{data.players.length} oyuncu · {accounts} hesaplı</span></h4>
        <div className="team-roster">
          {data.players.map((p) => (
            <div key={p.player_id} className={`team-player ${p.account ? "" : "is-noacc"}`}>
              <span className="team-player__name"><strong>{p.name}</strong>{p.position && <small>{p.position}</small>}</span>
              {p.account ? (
                <>
                  <span className="team-player__acc"><span className="pill pill--xs pill--green">hesaplı</span> {p.account.phone ? prettyPhone(p.account.phone) : <span className="muted">telefon yok</span>}</span>
                  <Quick person={p.account} go={go} compact />
                  <MenuButton items={[{ label: "Mesaj gönder", icon: "send", onClick: () => go("messages", { userId: p.account.id }) }, { label: "Rehberime ekle", icon: "plus", onClick: () => addToContacts(p.account, "Oyuncu") }]} />
                </>
              ) : <span className="team-player__acc muted">hesabı yok</span>}
            </div>
          ))}
          {!data.players.length && <p className="muted small">Kadro kaydı yok.</p>}
        </div>
      </section>

      {data.seasons.length > 0 && (
        <section className="team-sec">
          <h4>Sezonlar</h4>
          <div className="row-gap">{data.seasons.map((s) => <span key={s.name} className="chip">{s.name} · {s.played} maç</span>)}</div>
        </section>
      )}

      <div className="team-matches">
        <section className="team-sec">
          <h4>Son maçlar</h4>
          {data.last_matches.map((m) => {
            const r = matchResult(m);
            return (
              <div key={m.id} className="team-match">
                <span className="team-match__date">{formatDate(m.date, { day: "numeric", month: "short" })}{m.time ? ` ${m.time}` : ""}</span>
                <span className="team-match__line">{matchLine(m)}</span>
                {r && <span className={`rec-pill rec-pill--${r}`}>{r}</span>}
              </div>
            );
          })}
          {!data.last_matches.length && <p className="muted small">Oynanmış maç yok.</p>}
        </section>
        <section className="team-sec">
          <h4>Gelecek maçlar</h4>
          {data.next_matches.map((m) => (
            <div key={m.id} className="team-match">
              <span className="team-match__date">{formatDate(m.date, { day: "numeric", month: "short" })}{m.time ? ` ${m.time}` : ""}</span>
              <span className="team-match__line">{matchLine(m)}</span>
              {m.field && <small className="muted">{m.field}</small>}
            </div>
          ))}
          {!data.next_matches.length && <p className="muted small">Planlanmış maç yok.</p>}
        </section>
      </div>
    </div>
  );
}
