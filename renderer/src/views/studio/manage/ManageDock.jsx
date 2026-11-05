// Yayın Stüdyosu · MAÇ YÖNETİMİ (stüdyo dokunun ilk sekmesi).
//
//   Maçlar     maç SEÇİMİ (şu an canlı maçlar üstte, gün / tarih süzgeci, arama,
//              yeni maç). Maç seçilince doğrudan Reji açılır.
//   Reji       Reji + Olaylar tek sayfa: skor / saat / aşama | tüm olay türleri
//              (iki takım) | birikmiş olay listesi (düzenle / sil)
//   Kadro      iki takımın maç kadrosu
//   Grafikler  skorbord çeşitleri, marka & ön ayarlar, altyazı, röportaj, LED, sponsor
//   Maç sonu   puanlar, maçın enleri, içerik, istatistik, maçı yayınla
//   Takımlar   takım ve oyuncu oluştur / düzenle
//
// Kullanım:
//   <ManageDock matchId={id|null} match={live.match} live={live}
//     onOpenMatch={(id) => setMatchId(id)}
//     graphics={g}                                   // isteğe bağlı: useGraphics() (yoksa içeride kurulur)
//     onGoalTap={({ side, code }) => …}              // GOL'e basıldığı an (golcü seçilmeden) → tekrar kaydı
//     onEventCreated={({ event, playerName, side, code }) => …} />  // olay kaydedildikten sonra
// matchId boşken yalnız Maçlar ve Takımlar açılır. Yetkiyi sunucu denetler.
import React, { useEffect, useState } from "react";
import { Icon, Spinner } from "../../../components/ui";
import { statusLabel } from "../../../lib/studio/manageMatches";
import { GraphicsDock, useGraphics } from "../graphics";
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
  { key: "grafik", label: "Grafikler", icon: "layers", needsMatch: true },
  { key: "macsonu", label: "Maç sonu", icon: "award", needsMatch: true },
  { key: "takimlar", label: "Takımlar & Oyuncular", icon: "users" },
];

const STORE = "elitlig.studio.manageTab";
const readTab = () => { try { const v = localStorage.getItem(STORE); return MANAGE_TABS.some((t) => t.key === v) ? v : null; } catch { return null; } };
const writeTab = (v) => { try { localStorage.setItem(STORE, v); } catch { /* yoksay */ } };

/** Grafikler sekmesi: dışarıdan g verilmezse kendi useGraphics'ini kurar. */
function GraphicsHost({ matchId, live }) {
  const g = useGraphics({ matchId, live });
  return <GraphicsDock g={g} matchId={matchId} live={live} />;
}

export function ManageDock({ matchId = null, match = null, live = null, onOpenMatch, graphics = null, onGoalTap, onEventCreated }) {
  const user = useAuthUser();
  const hasMatch = Number(matchId) > 0;
  const [tab, setTab] = useState(() => (hasMatch ? readTab() || "reji" : "maclar"));
  const current = MANAGE_TABS.find((t) => t.key === tab) || MANAGE_TABS[0];
  const active = current.needsMatch && !hasMatch ? "maclar" : current.key;

  useEffect(() => { writeTab(tab); }, [tab]);

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
      case "grafik": return graphics ? <GraphicsDock g={graphics} matchId={Number(matchId)} live={live} /> : <GraphicsHost key={matchId} matchId={Number(matchId)} live={live} />;
      case "macsonu": return <PostTab key={matchId} matchId={Number(matchId)} match={match} live={live} />;
      case "maclar": return <MatchesTab user={user} currentMatchId={hasMatch ? Number(matchId) : null} onOpenMatch={open} />;
      case "takimlar": return <TeamsTab user={user} match={matchReady ? match : null} />;
      default: return null;
    }
  };

  return (
    <div className="mg-dock">
      <nav className="mg-tabs" role="tablist" aria-label="Maç yönetimi">
        {MANAGE_TABS.map((t) => {
          const disabled = t.needsMatch && !hasMatch;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={active === t.key ? "is-on" : ""} disabled={disabled} title={disabled ? "Önce Maçlar sekmesinden bir maç seç" : undefined} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={13} /> {t.label}
            </button>
          );
        })}
        <span className="mg-grow" />
        {matchReady && (
          <button type="button" className="mg-matchinfo" title={`Maç #${matchId} — başka maç seçmek için tıkla`} onClick={() => setTab("maclar")}>
            <b>{live?.homeName || match.first_team_name}</b>
            <span className="mg-score">{live?.score ? `${live.score.home} – ${live.score.away}` : `${match.first_team_score ?? 0} – ${match.second_team_score ?? 0}`}</span>
            <b>{live?.awayName || match.second_team_name}</b>
            <span className={`pill pill--xs${live?.status === "canli" ? " pill--red" : ""}`}>{statusLabel(match.mac_durumu)}</span>
          </button>
        )}
        {hasMatch && <button type="button" className="icon-btn icon-btn--xs" title="Maç verisini yenile" onClick={() => live?.refresh?.()}><Icon name="refresh" size={13} /></button>}
      </nav>
      <div className="mg-body">{body()}</div>
    </div>
  );
}

export default ManageDock;
