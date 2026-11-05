// Yayın Stüdyosu · Maç yönetimi (alt dok sekmesi). Web reji panelinin ve
// yönetimin maç / takım / oyuncu ekranlarının stüdyodaki karşılığı:
//
//   Reji              tüm olay türleri (değişiklik dahil), olay düzenle / sil
//   Kadro             iki takımın maç kadrosu, oyuncu ekle / oluştur
//   Yayın grafikleri  skorboard çeşitleri, LED içeriği, sponsor, altyazı, röportaj, bağlantılar
//   Maçlar            liste, stüdyoda aç, yeni maç, maç bilgileri
//   Takımlar          takım ve oyuncu oluştur / düzenle, kadro bağı
//
// Kullanım: <ManageDock matchId={id|null} match={live.match} live={live} onOpenMatch={(id) => …} />
// matchId boşken yalnız Maçlar ve Takımlar sekmeleri açılır. Yetkiyi sunucu
// denetler; 403 yanıtları dostça uyarıya çevrilir.
import React, { useEffect, useState } from "react";
import { Icon, Spinner } from "../../../components/ui";
import { statusLabel } from "../../../lib/studio/manageMatches";
import GraphicsTab from "./GraphicsTab";
import LineupTab from "./LineupTab";
import MatchesTab from "./MatchesTab";
import { NeedMatch } from "./pickers";
import RejiTab from "./RejiTab";
import TeamsTab from "./TeamsTab";
import { useAuthUser } from "./useManage";
import "./manage.css";

const TABS = [
  { key: "reji", label: "Reji", icon: "zap", needsMatch: true },
  { key: "kadro", label: "Kadro", icon: "shirt", needsMatch: true },
  { key: "grafik", label: "Yayın grafikleri", icon: "layers", needsMatch: true },
  { key: "maclar", label: "Maçlar", icon: "calendar" },
  { key: "takimlar", label: "Takımlar & Oyuncular", icon: "users" },
];

const STORE = "elitlig.studio.manageTab";
const readTab = () => { try { return localStorage.getItem(STORE) || null; } catch { return null; } };
const writeTab = (v) => { try { localStorage.setItem(STORE, v); } catch { /* yoksay */ } };

export function ManageDock({ matchId = null, match = null, live = null, onOpenMatch }) {
  const user = useAuthUser();
  const hasMatch = Number(matchId) > 0;
  const [tab, setTab] = useState(() => readTab() || (hasMatch ? "reji" : "maclar"));
  const current = TABS.find((t) => t.key === tab) || TABS[0];
  const active = current.needsMatch && !hasMatch ? "maclar" : current.key;

  useEffect(() => { writeTab(tab); }, [tab]);

  const matchReady = hasMatch && match && Number(match.id) === Number(matchId);
  const body = () => {
    const def = TABS.find((t) => t.key === active);
    if (def.needsMatch) {
      if (!hasMatch) return <NeedMatch />;
      if (live?.error && !match) return <p className="mg-error">{live.error.message || "Maç alınamadı."}</p>;
      if (!matchReady) return <Spinner label="Maç yükleniyor…" />;
    }
    switch (active) {
      case "reji": return <RejiTab key={matchId} matchId={Number(matchId)} live={live} userId={Number(user?.id) || null} />;
      case "kadro": return <LineupTab key={matchId} matchId={Number(matchId)} match={match} live={live} user={user} />;
      case "grafik": return <GraphicsTab key={matchId} matchId={Number(matchId)} match={match} live={live} />;
      case "maclar": return <MatchesTab user={user} currentMatchId={hasMatch ? Number(matchId) : null} onOpenMatch={(id) => { onOpenMatch?.(id); }} />;
      case "takimlar": return <TeamsTab user={user} match={matchReady ? match : null} />;
      default: return null;
    }
  };

  return (
    <div className="mg-dock">
      <nav className="mg-tabs" role="tablist" aria-label="Maç yönetimi">
        {TABS.map((t) => {
          const disabled = t.needsMatch && !hasMatch;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={active === t.key ? "is-on" : ""} disabled={disabled} title={disabled ? "Önce bir maç seç" : undefined} onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={13} /> {t.label}
            </button>
          );
        })}
        <span className="mg-grow" />
        {matchReady && (
          <span className="mg-matchinfo" title={`Maç #${matchId}`}>
            <b>{live?.homeName || match.first_team_name}</b>
            <span className="mg-score">{live?.score ? `${live.score.home} – ${live.score.away}` : `${match.first_team_score ?? 0} – ${match.second_team_score ?? 0}`}</span>
            <b>{live?.awayName || match.second_team_name}</b>
            <span className={`pill pill--xs${live?.status === "canli" ? " pill--red" : ""}`}>{statusLabel(match.mac_durumu)}</span>
          </span>
        )}
        {hasMatch && <button type="button" className="icon-btn icon-btn--xs" title="Maç verisini yenile" onClick={() => live?.refresh?.()}><Icon name="refresh" size={13} /></button>}
      </nav>
      <div className="mg-body">{body()}</div>
    </div>
  );
}

export default ManageDock;
