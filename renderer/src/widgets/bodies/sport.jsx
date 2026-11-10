// Spor widget'ları (herkese açık Elitlig API'si, oturum gerekmez; ana süreç: app/widgets/feeds.js):
//   • Canlı maç: seçilen maçın skoru; canlıyken 30 sn'de bir, değilse 5 dk'da bir yenilenir; gol olunca vurgu
//   • Puan durumu: lig seçimi (güncel sezon), sıra / oynanan / averaj / puan; takımı vurgula
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { includesTr } from "../../lib/helpers";
import { Err, Loading, W, usePoll, Hero, isBig, pick } from "../common";

const slug = (s) => String(s || "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
const matchUrl = (m) => (m?.id && m.city ? `/${slug(m.city)}/mac/${m.id}` : "/");

/* ------------------------------ canlı maç ------------------------------ */

function MatchPicker({ onPick, current }) {
  const q = usePoll(async () => {
    const r = await W().widgets.matches({ city: "" });
    if (!r?.ok) throw new Error(r?.error || "Maçlar alınamadı.");
    return r;
  }, 60000);
  const [term, setTerm] = useState("");
  if (q.error && !q.data) return <Err text={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const rows = [...q.data.live, ...q.data.upcoming].filter((m) => !term || includesTr(`${m.home} ${m.away} ${m.league} ${m.city}`, term));
  return (
    <div className="wg-settings">
      <input className="wg-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Takım / lig ara…" aria-label="Maç ara" autoFocus />
      <div className="wg-list">
        {rows.slice(0, 12).map((m) => (
          <button key={m.id} type="button" className={`wg-row${current === m.id ? " is-sel" : ""}`} onClick={() => onPick(m)} data-mid={m.id}>
            {m.live ? <i className="wg-live">CANLI</i> : <span className="wg-row__time">{new Date(m.start).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
            <span className="wg-row__text">{m.home} – {m.away}</span>
          </button>
        ))}
        {!rows.length && <p className="wg-muted">Maç bulunamadı.</p>}
      </div>
    </div>
  );
}

export function LiveMatchWidget({ item, size, settings, update, closeSettings }) {
  const id = item.options.matchId;
  const [live, setLive] = useState(false);
  const q = usePoll(async () => {
    if (!id) return null;
    const r = await W().widgets.match(id);
    if (!r?.ok) throw new Error(r?.error || "Maç alınamadı.");
    return r.match;
  }, live ? 30000 : 5 * 60000, [id, live]);
  const m = q.data;
  useEffect(() => { setLive(m?.state === "live"); }, [m?.state]);
  // Skor değişince kısa vurgu.
  const prev = useRef(null);
  const [goal, setGoal] = useState(false);
  useEffect(() => {
    if (!m) return;
    const key = `${m.homeScore}-${m.awayScore}`;
    if (prev.current && prev.current !== key && m.state === "live") { setGoal(true); setTimeout(() => setGoal(false), 8000); }
    prev.current = key;
  }, [m]);
  if (settings || !id) {
    return <MatchPicker current={id} onPick={(x) => { update({ options: { matchId: x.id, label: `${x.home} – ${x.away}` } }); closeSettings(); }} />;
  }
  if (q.error && !m) return <Err text={q.error} onRetry={q.reload} />;
  if (!m) return <Loading />;
  const when = m.start ? new Date(m.start) : null;
  return (
    <button type="button" className={`wg-score is-${size}${m.state === "live" ? " is-live" : ""}${goal ? " is-goal" : ""}`} onClick={() => W().app.openWeb(matchUrl(m))} title="Maç sayfasını aç">
      <span className="wg-score__state">{m.state === "live" ? <i className="wg-live">CANLI</i> : m.state === "done" ? "Maç sonu" : when ? when.toLocaleString("tr-TR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Fikstür"}{goal && <b className="wg-goal"> GOL!</b>}</span>
      <span className="wg-score__row">
        <b className="wg-score__team">{m.home}</b>
        <strong data-testid="score">{m.state === "fixture" ? "–" : `${m.homeScore} : ${m.awayScore}`}</strong>
        <b className="wg-score__team">{m.away}</b>
      </span>
      {size !== "small" && <small className="wg-muted">{[m.league, m.field, m.city].filter(Boolean).join(" · ")}</small>}
      {q.data && q.error && <small className="wg-muted">Çevrimdışı · son skor</small>}
    </button>
  );
}

/* ------------------------------ puan durumu ------------------------------ */

function LeaguePicker({ value, onPick }) {
  const q = usePoll(async () => {
    const r = await W().widgets.leagues();
    if (!r?.ok) throw new Error(r?.error || "Ligler alınamadı.");
    return r.leagues;
  }, 6 * 3600000);
  const [term, setTerm] = useState("");
  if (q.error && !q.data) return <Err text={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const list = q.data.filter((l) => !term || includesTr(`${l.name} ${l.city} ${l.season?.name || ""}`, term));
  return (
    <div className="wg-settings">
      <input className="wg-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Lig ya da şehir ara…" aria-label="Lig ara" autoFocus />
      <div className="wg-list">
        {list.slice(0, 30).map((l) => (
          <button key={l.id} type="button" className={`wg-row${value === l.id ? " is-sel" : ""}`} onClick={() => onPick(l)} data-league={l.id}>
            <span className="wg-row__text">{l.name}</span><small>{l.city} · {l.season?.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StandingsWidget({ item, size, settings, update, closeSettings }) {
  const { leagueId, leagueName, team } = item.options;
  const q = usePoll(async () => {
    if (!leagueId) return null;
    const r = await W().widgets.standings({ leagueId });
    if (!r?.ok) throw new Error(r?.error || "Puan durumu alınamadı.");
    return r;
  }, 10 * 60000, [leagueId]);
  const rows = useMemo(() => q.data?.rows || [], [q.data]);
  if (settings || !leagueId) {
    return <LeaguePicker value={leagueId} onPick={(l) => { update({ options: { leagueId: l.id, seasonId: null, leagueName: [l.name, l.season?.name, l.city].filter(Boolean).join(" · ") } }); closeSettings(); }} />;
  }
  if (q.error && !q.data) return <Err text={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const title = leagueName || [q.data.league?.name, q.data.season?.name, q.data.league?.city].filter(Boolean).join(" · ");
  const max = pick(size, 4, 4, 12);
  const mine = team ? rows.findIndex((r) => r.team === team) : -1;
  const shown = rows.slice(0, max);
  if (mine >= max) shown.push(rows[mine]);
  return (
    <div className="wg-standings">
      <p className="wg-muted wg-standings__title" title={title}>{title}</p>
      <table>
        <thead><tr><th>#</th><th className="is-team">Takım</th><th>O</th>{isBig(size) && <th>G-B-M</th>}<th>Av</th><th>P</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={`${r.rank}-${r.team}`} className={r.team === team ? "is-mine" : ""} onClick={() => update({ options: { team: r.team === team ? "" : r.team } })} title="Tıkla: takımı vurgula">
              <td>{r.rank}</td><td className="is-team">{r.team}</td><td>{r.played}</td>{isBig(size) && <td>{r.won}-{r.drawn}-{r.lost}</td>}<td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td><b>{r.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="wg-muted">Bu sezonda puan durumu yok.</p>}
      <button type="button" className="wg-link" onClick={() => W().app.openWeb("/puan-durumu")}><Icon name="external" size={10} /> elitlig.com puan durumu</button>
    </div>
  );
}
