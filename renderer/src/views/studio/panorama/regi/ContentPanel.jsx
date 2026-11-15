// Panorama rejisi · İÇERİK: web sitesinin içeriği tek yerde — canlı maçlar, son sonuçlar, fikstür, puan
// durumu, gol / asist krallığı, en değerliler, haftanın enleri, haberler, sponsorlar. Her satırdan tek
// tıkla: KART (ilgili kart listeye eklenir ve yayına gelir), ALT YAZI (maç / oyuncu / takım / haberden
// alt yazı yapılır ve gösterilir), BANT (kayan banda öğe). Kapsam (il / lig / sezon) Veri panelinde.
import React, { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui";
import { gfxId, lowerFromContent, showLower } from "../../../../lib/studio/panorama/gfx";
import { useRegi } from "./RegiCtx";

const score = (m) => (m.homeScore != null && m.awayScore != null ? `${m.homeScore}-${m.awayScore}` : "–");
const SECTIONS = [
  ["live", "Canlı", "broadcast"], ["results", "Sonuçlar", "check"], ["fixtures", "Fikstür", "calendar"], ["standings", "Puan durumu", "trophy"],
  ["scorers", "Gol krallığı", "ball"], ["assists", "Asist", "zap"], ["mvp", "En değerliler", "star"], ["weekly", "Haftanın enleri", "sparkles"], ["news", "Haberler", "file"], ["sponsors", "Sponsorlar", "handshake"],
];
const CARD_OF = { live: "live", results: "results", fixtures: "fixtures", standings: "standings", scorers: "scorers", assists: "assists", mvp: "mvp", weekly: "weekly", news: "news", sponsors: "sponsors" };

export default function ContentPanel() {
  const R = useRegi();
  const d = R.pd.data;
  const [sec, setSec] = useState("results");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const m = (list) => (list || []).map((x) => ({ key: `m${x.id}`, type: "match", x, title: `${x.homeName} ${score(x)} ${x.awayName}`, sub: [x.date, x.time, x.venue].filter(Boolean).join(" · "), logos: [x.homeLogo, x.awayLogo] }));
    const p = (list, unit) => (list || []).map((x, i) => ({ key: `p${x.id || i}`, type: "player", x, title: `${i + 1}. ${x.name}`, sub: `${x.teamName || ""} · ${x[unit] ?? ""} ${unit === "goals" ? "gol" : unit === "assists" ? "asist" : "puan"}`, logos: [x.image || x.teamLogo] }));
    switch (sec) {
      case "live": return m(d.live);
      case "results": return m(d.results);
      case "fixtures": return m(d.fixtures);
      case "standings": return (d.standings?.rows || []).map((x) => ({ key: `t${x.teamId}`, type: "team", x, title: `${x.rank}. ${x.teamName}`, sub: `${x.points} puan · ${x.played} maç · ${x.wins}G ${x.draws}B ${x.losses}M · av ${x.goalDiff}`, logos: [x.teamLogo] }));
      case "scorers": return p(d.scorers, "goals");
      case "assists": return p(d.assists, "assists");
      case "mvp": return p(d.mvp, "points");
      case "weekly": return (d.weekly?.items || []).map((x, i) => ({ key: `w${i}`, type: "player", x, title: `${x.awardLabel}: ${x.name}`, sub: x.teamName || "", logos: [x.image || x.teamLogo] }));
      case "news": return (d.news || []).map((x) => ({ key: `n${x.id}`, type: "news", x, title: x.title, sub: [x.category, x.summary].filter(Boolean).join(" · "), logos: [x.image] }));
      case "sponsors": return (d.sponsors || []).map((x, i) => ({ key: `s${i}`, type: "sponsor", x, title: x.name, sub: x.url || "", logos: [x.logo] }));
      default: return [];
    }
  }, [d, sec]);
  const shown = q.trim() ? rows.filter((r) => `${r.title} ${r.sub}`.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR"))) : rows;
  const count = (k) => (k === "standings" ? d.standings?.rows?.length : k === "weekly" ? d.weekly?.items?.length : d[k]?.length) || 0;
  const asLower = (r) => {
    const it = r.type === "sponsor" ? { id: gfxId("lt"), kind: "sponsor", title: r.x.name, subtitle: r.x.url || "", kicker: "SPONSOR", logo: r.x.logo || "", number: "", style: "", color: "", sec: 8, key: "" } : lowerFromContent(r.type, r.x);
    if (!it) return;
    R.setGfx((g) => showLower({ ...g, lowers: [...g.lowers, it] }, it.id, Date.now()));
    R.toast(`Alt yazı yayında: ${it.title}`, { tone: "success", timeout: 1800 });
  };
  const asTicker = (r) => { R.setGfx((g) => ({ ...g, tickerItems: [...g.tickerItems, { id: gfxId("tk"), text: `${r.title}${r.type === "news" ? "" : r.sub ? ` (${r.sub})` : ""}`.slice(0, 200), on: true }] })); R.toast("Banda eklendi.", { tone: "success", timeout: 1500 }); };
  const asCard = () => R.showCardKind(CARD_OF[sec]);
  return (
    <div className="pr-content" data-panel="icerik">
      <nav className="pr-subtabs is-wrap">{SECTIONS.map(([k, l, ic]) => (
        <button key={k} type="button" className={sec === k ? "is-on" : ""} onClick={() => setSec(k)} data-csec={k}><Icon name={ic} size={12} /> {l} <em>{count(k)}</em></button>
      ))}</nav>
      <div className="pr-bar">
        <input className="input pr-grow" value={q} placeholder="Ara…" onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn btn--xs btn--primary" onClick={asCard} title="Bu bölümün kartını listeye ekle ve yayına getir" data-act="content-card"><Icon name="layers" size={11} /> Kart olarak yayına</button>
        <button type="button" className="btn btn--xs" onClick={R.pd.refresh} disabled={R.pd.loading} title="Tazele"><Icon name="refresh" size={11} /></button>
      </div>
      {!shown.length && <p className="st-hint st-pad">{R.pd.loading ? "Yükleniyor…" : "Bu bölümde içerik yok (kapsam: Veri paneli)."}</p>}
      <ul className="pr-crows">
        {shown.map((r) => (
          <li key={r.key} data-content-row={r.type}>
            {r.logos.filter(Boolean).slice(0, 2).map((u, i) => <img key={i} src={/^https?:/.test(u) && window.elitlig ? `elitlig-media://m/${encodeURIComponent(u)}` : u} alt="" />)}
            <div><b>{r.title}</b><small>{r.sub}</small></div>
            <button type="button" className="btn btn--xs" onClick={() => asLower(r)} title="Alt yazı yap ve göster" data-act="content-lower"><Icon name="type" size={11} /> Alt yazı</button>
            <button type="button" className="btn btn--xs" onClick={() => asTicker(r)} title="Kayan banda ekle" data-act="content-ticker"><Icon name="list" size={11} /> Bant</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
