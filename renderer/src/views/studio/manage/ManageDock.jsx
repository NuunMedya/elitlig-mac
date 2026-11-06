// Yayın Stüdyosu · MAÇ YÖNETİMİ (stüdyo dokunun sekmesi).
//
//   Maçlar     maç SEÇİMİ (şu an canlı maçlar üstte, gün / tarih süzgeci, arama,
//              yeni maç). Maç seçilince doğrudan Reji açılır.
//   Reji       skor + saat | olay ızgarası (Goller, Kartlar, Değişiklik, Diğer) |
//              olay listesi (en yeni üstte; düzenle / sil)
//   Kadro      iki takımın maç kadrosu
//   Maç sonu   puanlar, maçın enleri (maçın golü / kurtarışı olaydan ve tekrar
//              kliplerinden), içerik, istatistik, maçı yayınla
//   Takımlar   takım ve oyuncu oluştur / düzenle
//   Sponsor    sponsor grafiği yayını + OBS / LED bağlantıları
// Yayın grafikleri (Skorbord, Altyazı, Marka & tema, Ön ayarlar, LED, Röportaj)
// artık stüdyonun kendi üst sekmelerindedir (./graphics dışa aktarımları).
//
// Kullanım:
//   <ManageDock matchId={id|null} match={live.match} live={live}
//     onOpenMatch={(id) => setMatchId(id)}
//     graphics={g}                                   // isteğe bağlı: useGraphics() (yoksa içeride kurulur)
//     scenes={[{ id, name }]}                        // isteğe bağlı (sahne bazlı grafik görünürlüğü)
//     replays={replays}                              // useReplays listesi: maçın golü / kurtarışı kapakları
//     onPlayReplay={(replay) => …}                   // isteğe bağlı: tekrarı stüdyonun tekrar panelinde aç
//     fullscreen / onFullscreenChange                // isteğe bağlı denetimli "Tam ekran"
//     onGoalTap={({ side, code }) => …}              // GOL'e basıldığı an (golcü seçilmeden) → tekrar kaydı
//     onEventCreated={({ event, playerName, side, code }) => …} />  // olay kaydedildikten sonra
// matchId boşken yalnız Maçlar ve Takımlar açılır. Yetkiyi sunucu denetler.
import React, { useEffect, useState } from "react";
import { Icon, Spinner } from "../../../components/ui";
import { statusLabel } from "../../../lib/studio/manageMatches";
import { LinksPanel, SponsorPanel, useGraphics } from "../graphics";
import LineupTab from "./LineupTab";
import MatchesTab from "./MatchesTab";
import { NeedMatch } from "./pickers";
import PostTab from "./PostTab";
import RejiTab from "./RejiTab";
import TeamsTab from "./TeamsTab";
import { useAuthUser } from "./useManage";
import "./manage.css";

export const MANAGE_TABS = [
  { key: "maclar", label: "Maçlar", icon: "calendar" },
  { key: "reji", label: "Reji", icon: "zap", needsMatch: true },
  { key: "kadro", label: "Kadro", icon: "shirt", needsMatch: true },
  { key: "macsonu", label: "Maç sonu", icon: "award", needsMatch: true },
  { key: "takimlar", label: "Takımlar & Oyuncular", icon: "users" },
  { key: "yayin", label: "Sponsor & bağlantılar", icon: "handshake", needsMatch: true },
];

const STORE = "elitlig.studio.manageTab";
const readTab = () => { try { const v = localStorage.getItem(STORE); return MANAGE_TABS.some((t) => t.key === v) ? v : null; } catch { return null; } };
const writeTab = (v) => { try { localStorage.setItem(STORE, v); } catch { /* yoksay */ } };

const SponsorBody = ({ g, matchId }) => (
  <div className="mg-stack">
    <SponsorPanel g={g} />
    <LinksPanel g={g} matchId={matchId} />
  </div>
);
/** Dışarıdan g verilmezse kendi useGraphics'ini kurar. */
function OwnSponsorHost({ matchId, live }) {
  const g = useGraphics({ matchId, live });
  return <SponsorBody g={g} matchId={matchId} />;
}
const SponsorHost = ({ graphics, matchId, live }) => (graphics ? <SponsorBody g={graphics} matchId={matchId} /> : <OwnSponsorHost matchId={matchId} live={live} />);

export function ManageDock({
  matchId = null, match = null, live = null, onOpenMatch, graphics = null, onGoalTap, onEventCreated,
  scenes = [], replays = [], onPlayReplay, fullscreen, onFullscreenChange,
}) {
  const user = useAuthUser();
  const hasMatch = Number(matchId) > 0;
  const [tab, setTab] = useState(() => (hasMatch ? readTab() || "reji" : "maclar"));
  const [fullOwn, setFullOwn] = useState(false);
  const full = fullscreen ?? fullOwn;
  const setFull = (v) => { if (onFullscreenChange) onFullscreenChange(v); if (fullscreen === undefined) setFullOwn(v); };
  const current = MANAGE_TABS.find((t) => t.key === tab) || MANAGE_TABS[0];
  const active = current.needsMatch && !hasMatch ? "maclar" : current.key;

  useEffect(() => { writeTab(tab); }, [tab]);
  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop")) setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id) => {
    onOpenMatch?.(id);
    setTab("reji");
  };

  const matchReady = hasMatch && match && Number(match.id) === Number(matchId);
  const body = () => {
    const def = MANAGE_TABS.find((t) => t.key === active);
    if (def.needsMatch) {
      if (!hasMatch) return <NeedMatch />;
      if (live?.error && !match) return <p className="mg-error">{live.error.message || "Maç alınamadı."}</p>;
      if (!matchReady) return <Spinner label="Maç yükleniyor…" />;
    }
    switch (active) {
      case "reji": return <RejiTab key={matchId} matchId={Number(matchId)} live={live} onGoalTap={onGoalTap} onEventCreated={onEventCreated} />;
      case "kadro": return <LineupTab key={matchId} matchId={Number(matchId)} match={match} live={live} user={user} />;
      case "macsonu": return <PostTab key={matchId} matchId={Number(matchId)} match={match} live={live} replays={replays} onPlayReplay={onPlayReplay} />;
      case "yayin": return <SponsorHost key={matchId} graphics={graphics} matchId={Number(matchId)} live={live} />;
      case "maclar": return <MatchesTab user={user} currentMatchId={hasMatch ? Number(matchId) : null} onOpenMatch={open} />;
      case "takimlar": return <TeamsTab user={user} match={matchReady ? match : null} />;
      default: return null;
    }
  };

  const score = live?.score ? `${live.score.home} – ${live.score.away}` : match ? `${match.first_team_score ?? 0} – ${match.second_team_score ?? 0}` : "";
  return (
    <div className={`mg-dock mg-manage${full ? " is-full" : ""}`} data-tab={active}>
      <nav className="mg-tabs" role="tablist" aria-label="Maç yönetimi">
        {MANAGE_TABS.map((t) => {
          const disabled = t.needsMatch && !hasMatch;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={active === t.key ? "is-on" : ""} disabled={disabled} title={disabled ? "Önce Maçlar sekmesinden bir maç seç" : undefined} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={13} /> <span className="mg-tabs__label">{t.label}</span>
            </button>
          );
        })}
        <span className="mg-grow" />
        {matchReady && (
          <button type="button" className="mg-matchinfo" title={`Maç #${matchId} — başka maç seçmek için tıkla`} onClick={() => setTab("maclar")}>
            <span className={`mg-matchinfo__status${live?.status === "canli" ? " is-live" : ""}`}>{live?.status === "canli" && <span className="mg-live__dot" />}{statusLabel(match.mac_durumu)}</span>
            <b>{live?.homeName || match.first_team_name}</b>
            <span className="mg-score">{score}</span>
            <b>{live?.awayName || match.second_team_name}</b>
          </button>
        )}
        {hasMatch && <button type="button" className="icon-btn icon-btn--xs" title="Maç verisini yenile" onClick={() => live?.refresh?.()}><Icon name="refresh" size={13} /></button>}
        <button type="button" className={`mg-fullbtn${full ? " is-on" : ""}`} aria-pressed={full} title={full ? "Doka geri dön (Esc)" : "Maç yönetimini tam ekranda aç"} onClick={() => setFull(!full)}>
          <Icon name={full ? "x" : "external"} size={13} /> {full ? "Küçült" : "Tam ekran"}
        </button>
      </nav>
      <div className="mg-body">{body()}</div>
    </div>
  );
}

export default ManageDock;
