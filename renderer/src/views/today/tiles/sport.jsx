// Spor: günün maçları (Elitlig canlı + fikstür akışı), maç görevlendirme (eksik görevliler).
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { useData } from "../data";
import { Big, List, Row, State, Stats, XsButton } from "../parts";

const W = () => window.elitlig;
const hm = (iso) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const slug = (s) => String(s).toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
export const matchUrl = (m) => (m.id && m.city ? `/${slug(m.city)}/mac/${m.id}` : "/");

/** Ana süreçteki maç akışı (widget'larla ortak önbellek: 2 dk). */
function useMatches(city) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    const load = () => W().widgets.matches({ city: city || "" }).then((r) => {
      if (!alive) return;
      if (r?.ok) setState({ data: r, error: null, loading: false });
      else setState((s) => ({ data: s.data, error: { message: /HTTP 404/.test(String(r?.error)) ? "Maç akışı bağlı sunucuda yok (404)." : r?.error || "Maçlar alınamadı." }, loading: false }));
    }).catch((e) => alive && setState((s) => ({ ...s, error: { message: String(e?.message || e) }, loading: false })));
    load();
    const t = setInterval(load, 90000);
    return () => { alive = false; clearInterval(t); };
  }, [city]);
  return { ...state, reload: () => {} };
}

export function MatchesTile({ tier, o, lines, go }) {
  const q = useMatches(o.city);
  const days = Number(o.days) || 2;
  const now = new Date();
  const today = dayKey(now);
  const until = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days - 1));
  const live = q.data?.live || [];
  const upcoming = (q.data?.upcoming || []).filter((m) => m.start && dayKey(new Date(m.start)) <= until);
  const todayCount = upcoming.filter((m) => dayKey(new Date(m.start)) === today).length;
  const open = (m) => W().app.openWeb(matchUrl(m));
  if (tier === "xs") {
    return <XsButton icon="ball" value={live.length ? `${live.length}` : todayCount} label={live.length ? "canlı" : "bugün"} tone={live.length ? "red" : ""} title="Günün maçları" onClick={() => go("planning")} />;
  }
  const first = live[0] || upcoming[0];
  if (tier === "s") {
    return (
      <State q={q} empty={q.data && !first ? `Bugün maç yok${o.city ? ` (${o.city})` : ""}.` : null} emptyIcon="ball">
        {first && (
          <button type="button" className={`dt-score${first.live ? " is-live" : ""}`} onClick={() => open(first)}>
            <span className="dt-score__tag">{first.live ? `CANLI · ${live.length} maç` : `${todayCount} maç bugün`}</span>
            <span className="dt-score__teams"><b>{first.home}</b><b>{first.away}</b></span>
            <strong>{first.live ? `${first.homeScore}–${first.awayScore}` : hm(first.start)}</strong>
          </button>
        )}
      </State>
    );
  }
  const rows = [...live, ...upcoming];
  const groups = tier === "xl"
    ? [...new Set(rows.map((m) => m.league || "Diğer"))].map((lg) => ({ label: lg, items: rows.filter((m) => (m.league || "Diğer") === lg) }))
    : [{ label: null, items: rows }];
  let budget = Math.max(2, lines - (tier === "m" ? 1 : 1));
  return (
    <State q={q} empty={q.data && !rows.length ? `Önümüzdeki ${days === 1 ? "gün" : `${days} gün`} maç yok${o.city ? ` (${o.city})` : ""}.` : null} emptyIcon="ball">
      {tier !== "m" && <Stats items={[{ label: "canlı", value: live.length, tone: live.length ? "red" : "" }, { label: "bugün", value: todayCount }, { label: `${days} günde`, value: upcoming.length }]} />}
      <div className={tier === "xl" ? "dt-cols" : ""}>
        {groups.map((g) => {
          if (budget <= 0) return null;
          const items = g.items.slice(0, budget);
          budget -= items.length + (g.label ? 1 : 0);
          return (
            <section key={g.label || "all"}>
              {g.label && <h4 className="dt-sub">{g.label}</h4>}
              <List>
                {items.map((m) => (
                  <li key={`${m.live ? "l" : "f"}${m.id}`} className={`dt-match${m.live ? " is-live" : ""}`}>
                    <button type="button" onClick={() => open(m)} title={[m.league, m.field, m.city].filter(Boolean).join(" · ")}>
                      <span className="dt-match__teams"><b>{m.home}</b><b>{m.away}</b></span>
                      {m.live ? <span className="dt-match__score"><i>CANLI</i>{m.homeScore}–{m.awayScore}</span>
                        : <span className="dt-match__when">{dayKey(new Date(m.start)) === today ? "Bugün" : new Date(m.start).toLocaleDateString("tr-TR", { weekday: "short", day: "numeric" })} {hm(m.start)}{tier !== "m" && m.field ? <small>{m.field}</small> : null}</span>}
                    </button>
                  </li>
                ))}
              </List>
            </section>
          );
        })}
      </div>
      {q.data?.stale && <p className="dt-offline"><Icon name="cloudOff" size={11} /> Çevrimdışı · son liste</p>}
    </State>
  );
}

const SHORT = { spiker: "SPK", reji: "RJ", hakem: "HKM", fotografci: "FOTO", saglikci: "SĞL" };
export function StaffMatchesTile({ tier, go, lines }) {
  const q = useData("/api/staff/matches", { range: "upcoming" }, { ttl: 60000 });
  const items = q.data?.items || [];
  const duties = q.data?.duties || [];
  const missing = items.filter((m) => m.assignedCount < m.dutyCount);
  const holes = missing.reduce((s, m) => s + (m.dutyCount - m.assignedCount), 0);
  const open = () => go("todos");
  if (tier === "xs") return <XsButton icon="team" value={missing.length} label="eksik" tone={missing.length ? "amber" : ""} title="Görevlisi eksik maçlar" onClick={open} />;
  if (q.status === 403 || q.error?.status === 403) return <State empty="Personel görevlendirme yetkiniz yok." emptyIcon="lock" />;
  if (tier === "s") {
    return (
      <State q={q}>
        <Big value={missing.length} label="maçta eksik görevli" sub={missing[0] ? `${missing[0].label} · ${missing[0].day?.slice(5)} ${missing[0].time || ""}` : items.length ? "Tüm görevler dolu ✓" : "Yaklaşan maç yok"} tone={missing.length ? "amber" : ""} onClick={open} />
      </State>
    );
  }
  const list = (tier === "m" ? missing : items).slice(0, Math.max(2, lines - 2));
  return (
    <State q={q} empty={q.data && !items.length ? "Yaklaşan maç yok." : null} emptyIcon="ball">
      <Stats items={[{ label: "yaklaşan maç", value: items.length, onClick: open }, { label: "eksikli", value: missing.length, tone: missing.length ? "amber" : "", onClick: open }, { label: "boş görev", value: holes, tone: holes ? "red" : "", onClick: open }]} />
      <List>
        {list.map((m) => (
          <Row key={m.id} icon="ball" title={m.label} sub={`${m.day || ""} ${m.time || ""}${m.field ? ` · ${m.field}` : ""}`} right={`${m.assignedCount}/${m.dutyCount}`} tone={m.assignedCount < m.dutyCount ? "amber" : "green"} onClick={open}>
            {(tier === "l" || tier === "xl") && <span className="dt-duties">{duties.map((d) => <i key={d.key} className={m.crew?.[d.key] ? "is-on" : ""} title={`${d.label}: ${m.crew?.[d.key]?.name || "atanmadı"}`}>{SHORT[d.key] || d.label.slice(0, 3)}</i>)}</span>}
          </Row>
        ))}
      </List>
    </State>
  );
}
