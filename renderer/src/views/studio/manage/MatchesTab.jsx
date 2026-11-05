// Maç yönetimi · MAÇ SEÇİMİ (dokun ilk sekmesi): üstte şu an canlı maçlar
// (büyük kartlar, tek tıkla Reji), altta süzgeçli maç listesi (gün / tarih aralığı, il,
// lig, sezon, durum, arama), maçı stüdyoda açma, yeni maç ve maç düzenleme.
//   GET /maclar?includeDraft=1&date_from&date_to&city&city_id&league_id&season_id&mac_durumu
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Spinner } from "../../../components/ui";
import { isoDay } from "../../../lib/studio/match";
import { MATCH_STATUS_OPTIONS, filterMatches, isNationwide, liveFirst, liveStripRows, matchListQuery, rangePreset, statusLabel } from "../../../lib/studio/manageMatches";
import * as api from "./manageApi";
import { CreateMatchModal, EditMatchModal } from "./MatchForms";
import { EMPTY_SCOPE, ScopeFields } from "./pickers";
import { useLoad } from "./useManage";

const PRESETS = [
  { key: "yesterday", label: "Dün" },
  { key: "today", label: "Bugün" },
  { key: "tomorrow", label: "Yarın" },
  { key: "week", label: "Bu hafta" },
  { key: "past", label: "Son 2 hafta" },
];

const dayText = (day) => {
  if (!day) return "Tarih yok";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
};

const STATUS_TONE = { canli: "red", zamanlanmis: "blue", taslak: "amber", yayinlanmis: "green" };

export default function MatchesTab({ user, currentMatchId, onOpenMatch }) {
  const nationwide = isNationwide(user);
  const [preset, setPreset] = useState("today");
  const [range, setRange] = useState(() => rangePreset("today"));
  const [scope, setScope] = useState({ ...EMPTY_SCOPE, city: nationwide ? "" : user?.city || "" });
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const query = matchListQuery({ from: range.from, to: range.to, status, leagueId: scope.leagueId, seasonId: scope.seasonId, city: scope.city });
  if (scope.cityId) query.city_id = scope.cityId;
  const list = useLoad(() => api.listMatches(query), [JSON.stringify(query)], { fallback: "Maçlar alınamadı." });
  const rows = useMemo(() => liveFirst(filterMatches(list.data, { from: range.from, to: range.to, q, status })), [list.data, range, q, status]);
  const liveQuery = { ...matchListQuery({ status: "canli", city: scope.city }), date_from: undefined, date_to: undefined, limit: 50 };
  const liveList = useLoad(() => api.listMatches(liveQuery), [scope.city], { fallback: "" });
  const liveRows = useMemo(() => liveStripRows(liveList.data, { city: scope.city }), [liveList.data, scope.city]);
  // Canlı şerit 30 sn'de bir tazelenir.
  useEffect(() => {
    const t = setInterval(() => liveList.reload({ quiet: true }), 30_000);
    return () => clearInterval(t);
  }, [liveList.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePreset = (key) => { setPreset(key); setRange(rangePreset(key, isoDay())); };

  return (
    <div className="mg-stack">
      {liveRows.length > 0 && (
        <section className="mg-livestrip" aria-label="Şu an canlı">
          <h6 className="mg-sidehead"><span className="mg-live__dot" /> Şu an canlı</h6>
          <div className="mg-livestrip__list">
            {liveRows.map((m) => (
              <button key={m.id} type="button" className={`mg-livecard${Number(currentMatchId) === m.id ? " is-current" : ""}`} onClick={() => onOpenMatch?.(m.id)}>
                <span className="mg-livecard__teams"><b>{m.home}</b><span className="mg-score">{m.homeScore ?? 0} – {m.awayScore ?? 0}</span><b>{m.away}</b></span>
                <small>{[m.league, m.field, m.time].filter(Boolean).join(" · ")}</small>
                <span className="mg-livecard__go">{Number(currentMatchId) === m.id ? "Stüdyoda" : "Rejiyi aç →"}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="mg-toolbar mg-wrap">
        <div className="seg seg--sm">
          {PRESETS.map((p) => <button key={p.key} type="button" className={preset === p.key ? "is-active" : ""} onClick={() => choosePreset(p.key)}>{p.label}</button>)}
        </div>
        <label className="mg-field mg-field--date"><span>Başlangıç</span><input type="date" value={range.from} onChange={(e) => { setPreset("custom"); setRange((r) => ({ from: e.target.value, to: r.to && r.to < e.target.value ? e.target.value : r.to })); }} /></label>
        <label className="mg-field mg-field--date"><span>Bitiş</span><input type="date" value={range.to} min={range.from} onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, to: e.target.value })); }} /></label>
        <label className="mg-field"><span>Durum</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {MATCH_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="mg-search mg-grow"><Icon name="search" size={13} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Takım, saha ya da maç no…" /></div>
        <button type="button" className="icon-btn" title="Yenile" onClick={() => list.reload()}><Icon name="refresh" size={14} /></button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> Yeni maç</button>
      </div>
      <ScopeFields value={scope} onChange={setScope} lockCity={!nationwide && Boolean(user?.city)} compact />

      {list.error && <p className="mg-error">{list.error}</p>}
      {list.loading && !list.data ? <Spinner label="Maçlar yükleniyor…" /> : rows.length ? (
        <ul className="mg-rows mg-rows--scroll mg-matches">
          {rows.map((m) => (
            <li key={m.id} className={`mg-row${Number(currentMatchId) === m.id ? " is-current" : ""}`}>
              <span className="mg-match__when"><b>{m.time || "--:--"}</b><small>{dayText(m.date)}</small></span>
              <span className="mg-row__main">
                <strong>{m.home} <span className="mg-score">{m.status === "canli" || m.status === "yayinlanmis" ? `${m.homeScore ?? 0} – ${m.awayScore ?? 0}` : "–"}</span> {m.away}</strong>
                <small>{[m.league, m.season, m.field, nationwide ? m.city : null].filter(Boolean).join(" · ")} · #{m.id}</small>
              </span>
              <span className={`pill pill--xs pill--${STATUS_TONE[m.status] || "tool"}`}>{statusLabel(m.status)}</span>
              <button type="button" className="icon-btn icon-btn--xs" title="Maç bilgilerini düzenle" onClick={() => setEditing(m.id)}><Icon name="pencil" size={12} /></button>
              {Number(currentMatchId) === m.id
                ? <span className="pill pill--xs pill--tool">Stüdyoda</span>
                : <button type="button" className={`btn btn--xs${m.status === "canli" ? " btn--primary" : ""}`} onClick={() => onOpenMatch?.(m.id)}>Seç · Reji</button>}
            </li>
          ))}
        </ul>
      ) : <p className="mg-muted">Bu süzgeçle maç yok. Tarih aralığını genişlet ya da “Yeni maç” ile oluştur.</p>}
      {list.data && <p className="mg-muted mg-small">{rows.length} maç{status ? ` · ${statusLabel(status)}` : ""}</p>}

      {creating && <CreateMatchModal user={user} onClose={() => setCreating(false)} onOpen={onOpenMatch} onCreated={() => { setCreating(false); list.reload({ quiet: true }); }} />}
      {editing && <EditMatchModal matchId={editing} onClose={() => setEditing(null)} onSaved={() => list.reload({ quiet: true })} onDeleted={() => list.reload({ quiet: true })} />}
    </div>
  );
}
