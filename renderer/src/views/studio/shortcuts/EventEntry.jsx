// Yayın Stüdyosu · "OLAY GİR" kısayolu paneli: 1) olay türü → 2) iki takımın
// oyuncuları yan yana → oyuncuya tık olayı kaydeder (live.addEvent; Studio'daki
// GOL akışıyla aynı: gol ise tekrar klibi türü seçildiği AN kaydedilir ve olaya bağlanır).
//
//   ctx.event = { live: bool, minute, homeName, awayName, squads: { home, away }, begin(code) → clipKey,
//                 submit({ side, code, playerId, clipKey }) → Promise, cancel(clipKey) }
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { eventLabel, isGoalCode } from "../../../lib/studio/match";

export const EVENT_GROUPS = [
  { key: "gol", label: "Gol", items: [
    { code: "GOAL_RIGHT_FOOT", label: "Sağ ayak" }, { code: "GOAL_LEFT_FOOT", label: "Sol ayak" }, { code: "GOAL_HEADER", label: "Kafa" },
    { code: "GOAL_PENALTY", label: "Penaltı" }, { code: "GOAL_FREEKICK", label: "Frikik" }, { code: "GOAL_LONG_RIGHT", label: "Uzaktan" }, { code: "GOAL_OWN", label: "Kendi kalesine", tone: "own" },
  ] },
  { key: "kart", label: "Kart", items: [{ code: "YELLOW_CARD", label: "Sarı kart", tone: "yellow" }, { code: "RED_CARD", label: "Kırmızı kart", tone: "red" }] },
  { key: "diger", label: "Diğer", items: [
    { code: "ASSIST", label: "Asist" }, { code: "SAVE", label: "Kurtarış" }, { code: "CHANCE_CREATED", label: "Tehlike" }, { code: "FOUL", label: "Faul" }, { code: "INJURY", label: "Sakatlık" },
  ] },
];

function Squad({ side, name, players, needle, busy, onPick }) {
  const list = needle ? players.filter((p) => p.number === needle || p.name.toLocaleLowerCase("tr-TR").includes(needle)) : players;
  const starters = list.filter((p) => p.role === "starter");
  const others = list.filter((p) => p.role !== "starter");
  return (
    <section className={`st-ev__team is-${side}`}>
      <header><i /> <strong>{name}</strong></header>
      <div className="st-ev__players">
        {[...starters, ...others].map((p, i) => (
          <button key={p.id} type="button" className={`st-ev__player ${i === starters.length && starters.length ? "is-firstsub" : ""}`} disabled={busy} onClick={() => onPick(side, p.id)}>
            <b>{p.number || "–"}</b><span>{p.name}</span>
          </button>
        ))}
        {!list.length && <p className="st-hint">{players.length ? "Eşleşen yok." : "Kadro girilmemiş."}</p>}
      </div>
      <button type="button" className="btn btn--xs st-ev__nobody" disabled={busy} onClick={() => onPick(side, null)}>Oyuncusuz kaydet</button>
    </section>
  );
}

export default function EventEntry({ ctx, onClose, onWide }) {
  const E = ctx.event;
  const [code, setCode] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const clipRef = useRef(null);
  const doneRef = useRef(false);
  const needle = q.trim().toLocaleLowerCase("tr-TR");

  // Kapanırken kaydedilmediyse klip yalnız bu bilgisayarda kalır.
  useEffect(() => () => { if (!doneRef.current && clipRef.current) E.cancel(clipRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onWide?.(Boolean(code)); }, [code, onWide]);

  const choose = (c) => {
    if (!E.live) return;
    if (!clipRef.current && isGoalCode(c)) clipRef.current = E.begin(c);
    setCode(c);
  };
  const pick = async (side, playerId) => {
    setBusy(true);
    try {
      await E.submit({ side, code, playerId, clipKey: clipRef.current });
      doneRef.current = true;
      onClose();
    } catch { /* hata Studio'da gösterildi */ } finally { setBusy(false); }
  };
  const groups = useMemo(() => EVENT_GROUPS, []);

  if (!code) {
    return (
      <div className="st-ev">
        {!E.live && <p className="st-note is-warn"><Icon name="info" size={13} /> Maç canlı değil: önce Maç yönetimi › Reji'den maçı başlat.</p>}
        {groups.map((g) => (
          <section key={g.key} className="st-ev__group">
            <h6>{g.label}</h6>
            <div className="st-ev__codes">
              {g.items.map((it) => (
                <button key={it.code} type="button" className={`st-ev__code is-${it.tone || (g.key === "gol" ? "goal" : "plain")}`} disabled={!E.live} onClick={() => choose(it.code)}>
                  <i />{it.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="st-ev">
      <div className="st-ev__bar">
        <button type="button" className="btn btn--xs" onClick={() => setCode(null)} disabled={busy}><Icon name="chevronLeft" size={12} /> Tür</button>
        <strong>{eventLabel(code)}</strong><small>{E.minute != null ? `${E.minute}'` : ""}</small>
        {clipRef.current && <span className="st-ev__clip"><Icon name="video" size={12} /> klip kaydedildi</span>}
        <input type="search" placeholder="No ya da ad…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="st-ev__teams">
        <Squad side="home" name={E.homeName} players={E.squads.home} needle={needle} busy={busy} onPick={pick} />
        <Squad side="away" name={E.awayName} players={E.squads.away} needle={needle} busy={busy} onPick={pick} />
      </div>
    </div>
  );
}
