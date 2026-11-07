// Yayın Stüdyosu · MAÇ YÖNETİMİ (stüdyo dokunun sekmesi).
//
//   Maçlar     maç SEÇİMİ (şu an canlı maçlar üstte, gün / tarih süzgeci, arama,
//              yeni maç). Maç seçilince doğrudan Reji açılır.
//   Reji       iki takım ayna sütunlarda (büyük GOL, kart, penaltı, değişiklik…);
//              ortada skor + saat + maç akışı + olay listesi; altta gol müziği
//   Kadro      iki takımın maç kadrosu
//   Maç sonu   puanlar, maçın enleri (maçın golü / kurtarışı olaydan ve tekrar
//              kliplerinden), içerik, istatistik, maçı yayınla
//   Takımlar   takım ve oyuncu oluştur / düzenle
// Yayın grafikleri (Skorbord, Altyazı, Marka & tema, Ön ayarlar, LED, Röportaj) ve
// "Sponsor & linkler" stüdyonun kendi üst sekmelerindedir (./graphics dışa
// aktarımları); sponsor bölümü burada ikinci kez gösterilmez.
//
// Kullanım:
//   <ManageDock matchId={id|null} match={live.match} live={live}
//     onOpenMatch={(id) => setMatchId(id)}
//     graphics={g}                                   // (eski) yok sayılır: sponsor bölümü grafik sekmesinde
//     scenes={[{ id, name }]}                        // (eski) yok sayılır
//     replays={replays}                              // useReplays listesi: maçın golü / kurtarışı kapakları
//     onPlayReplay={(replay) => …}                   // isteğe bağlı: tekrarı stüdyonun tekrar panelinde aç
//     fullscreen / onFullscreenChange                // isteğe bağlı denetimli "Tam ekran"
//     onGoalTap={({ side, code }) => …}              // GOL'e basıldığı an (golcü seçilmeden) → tekrar kaydı
//     onEventCreated={({ event, playerName, side, code }) => …}     // olay kaydedildikten sonra
//     goalMusic={useGoalMusic(…)} />                 // isteğe bağlı: Reji'de gol müziği (../goalmusic)
// matchId boşken yalnız Maçlar ve Takımlar açılır. Yetkiyi sunucu denetler.
//
// AYRILABİLİR: her sekme kendi panelidir (yerleşimde "Maç yönetimi › Reji" …) ve sekmelerin
// anlamlı bölümleri pano bileşenidir (MANAGE_PARTS):
//   <ManageDock only="reji" …/>              tek sekme (sekme şeridi yok, maç bilgisi var)
//   <ManagePart tab="reji" part="events" …/> tek bölüm (pano bileşeni)
//   onSplit                                  birleşik panelde "Sekmelere ayır" düğmesi
// Seçili maç Studio'dadır; süzgeçler, seçimler ve taslaklar ./manageStore'da ortaktır.
import React, { useEffect, useState } from "react";
import { Icon, Spinner } from "../../../components/ui";
import { statusLabel } from "../../../lib/studio/manageMatches";
import LineupTab from "./LineupTab";
import MatchesTab from "./MatchesTab";
import { NeedMatch } from "./pickers";
import PostTab from "./PostTab";
import RejiTab from "./RejiTab";
import TeamsTab from "./TeamsTab";
import { useShared } from "./manageStore";
import { useAuthUser } from "./useManage";
import "./manage.css";

export const MANAGE_TABS = [
  { key: "maclar", label: "Maçlar", icon: "calendar" },
  { key: "reji", label: "Reji", icon: "zap", needsMatch: true },
  { key: "kadro", label: "Kadro", icon: "shirt", needsMatch: true },
  { key: "macsonu", label: "Maç sonu", icon: "award", needsMatch: true },
  { key: "takimlar", label: "Takımlar & Oyuncular", icon: "users" },
];

/** Pano bileşeni olarak ayrılabilen bölümler (layoutModel "mg.<sekme>.<bölüm>"). */
export const MANAGE_PARTS = {
  maclar: [["live", "Şu an canlı"], ["filters", "Süzgeçler"], ["list", "Maç listesi"]],
  reji: [["center", "Skor ve saat"], ["home", "Ev sahibi eylemleri"], ["away", "Deplasman eylemleri"], ["events", "Olay listesi"], ["any", "Hızlı olay (takım seçmeden)"], ["music", "Gol müziği"]],
  kadro: [["home", "Ev sahibi kadrosu"], ["away", "Deplasman kadrosu"]],
  macsonu: [["summary", "Skor ve yayınla"], ["ratings", "Puanlar"], ["awards", "MVP ve ödüller"], ["goal", "Maçın golü"], ["save", "Maçın kurtarışı"], ["content", "İçerik"], ["stats", "İstatistik"]],
};

const STORE = "elitlig.studio.manageTab";
const readTab = () => { try { const v = localStorage.getItem(STORE); return MANAGE_TABS.some((t) => t.key === v) ? v : null; } catch { return null; } };
const writeTab = (v) => { try { localStorage.setItem(STORE, v); } catch { /* yoksay */ } };

/** Sekmenin (ya da bölümünün) gövdesi; maç gerekiyorsa bekleme / uyarı. */
function TabBody({ tab, part = null, user, matchId, match, live, onOpen, onGoalTap, onEventCreated, goalMusic, replays, onPlayReplay }) {
  const hasMatch = Number(matchId) > 0;
  const def = MANAGE_TABS.find((t) => t.key === tab) || MANAGE_TABS[0];
  const matchReady = hasMatch && match && Number(match.id) === Number(matchId);
  if (def.needsMatch) {
    if (!hasMatch) return <NeedMatch />;
    if (live?.error && !match) return <p className="mg-error">{live.error.message || "Maç alınamadı."}</p>;
    if (!matchReady) return <Spinner label="Maç yükleniyor…" />;
  }
  switch (def.key) {
    case "reji": return <RejiTab key={matchId} matchId={Number(matchId)} live={live} onGoalTap={onGoalTap} onEventCreated={onEventCreated} goalMusic={goalMusic} part={part} />;
    case "kadro": return <LineupTab key={matchId} matchId={Number(matchId)} match={match} live={live} user={user} part={part} />;
    case "macsonu": return <PostTab key={matchId} matchId={Number(matchId)} match={match} live={live} replays={replays} onPlayReplay={onPlayReplay} part={part} />;
    case "maclar": return <MatchesTab user={user} currentMatchId={hasMatch ? Number(matchId) : null} onOpenMatch={onOpen} part={part} />;
    case "takimlar": return <TeamsTab user={user} match={matchReady ? match : null} />;
    default: return null;
  }
}

/** Tek bölüm (pano bileşeni): <ManagePart tab="reji" part="events" matchId match live … />. */
export function ManagePart({ tab, part, onOpenMatch, ...rest }) {
  const user = useAuthUser();
  const [, setTab] = useShared("manage.tab", () => readTab() || "maclar");
  const open = (id) => { onOpenMatch?.(id); setTab("reji"); };
  return (
    <div className={`mg-dock mg-manage mg-solo is-${tab} is-${tab}-${part}`} data-tab={tab} data-part={part}>
      <div className="mg-body"><TabBody tab={tab} part={part} user={user} onOpen={open} {...rest} /></div>
    </div>
  );
}

export function ManageDock({
  matchId = null, match = null, live = null, onOpenMatch, onGoalTap, onEventCreated, goalMusic = null,
  replays = [], onPlayReplay, fullscreen, onFullscreenChange, only = null, onSplit = null,
}) {
  const user = useAuthUser();
  const hasMatch = Number(matchId) > 0;
  const [sharedTab, setTab] = useShared("manage.tab", () => (hasMatch ? readTab() || "reji" : "maclar"));
  const tab = only || sharedTab;
  const [fullOwn, setFullOwn] = useState(false);
  const full = fullscreen ?? fullOwn;
  const setFull = (v) => { if (onFullscreenChange) onFullscreenChange(v); if (fullscreen === undefined) setFullOwn(v); };
  const current = MANAGE_TABS.find((t) => t.key === tab) || MANAGE_TABS[0];
  const active = current.needsMatch && !hasMatch ? "maclar" : current.key;

  useEffect(() => { if (!only) writeTab(tab); }, [tab, only]);
  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop")) setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps

  // Maç seçilince Reji açılır (ayrılmış "› Maçlar" panelinde: birleşik paneldeki sekme Reji olur).
  const open = (id) => {
    onOpenMatch?.(id);
    setTab("reji");
  };

  const matchReady = hasMatch && match && Number(match.id) === Number(matchId);
  // Ayrılmış "› Reji / › Kadro / › Maç sonu" maç yokken de kendi sekmesini gösterir (NeedMatch).
  const shown = only || active;
  const body = () => <TabBody tab={shown} user={user} matchId={matchId} match={match} live={live} onOpen={open} onGoalTap={onGoalTap} onEventCreated={onEventCreated} goalMusic={goalMusic} replays={replays} onPlayReplay={onPlayReplay} />;

  const score = live?.score ? `${live.score.home} – ${live.score.away}` : match ? `${match.first_team_score ?? 0} – ${match.second_team_score ?? 0}` : "";
  return (
    <div className={`mg-dock mg-manage${full ? " is-full" : ""}${only ? ` is-only` : ""}`} data-tab={shown}>
      <nav className="mg-tabs" role={only ? undefined : "tablist"} aria-label="Maç yönetimi">
        {only && <span className="mg-tabs__only"><Icon name={current.icon} size={13} /> {current.label}</span>}
        {!only && MANAGE_TABS.map((t) => {
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
        {!only && onSplit && <button type="button" className="icon-btn icon-btn--xs" title="Sekmelere ayır: Maçlar, Reji, Kadro, Maç sonu, Takımlar ayrı paneller olur (aynı bölmede sekme)" aria-label="Sekmelere ayır" onClick={onSplit}><Icon name="layers" size={13} /></button>}
        <button type="button" className={`mg-fullbtn${full ? " is-on" : ""}`} aria-pressed={full} title={full ? "Doka geri dön (Esc)" : "Maç yönetimini tam ekranda aç"} onClick={() => setFull(!full)}>
          <Icon name={full ? "x" : "external"} size={13} /> {full ? "Küçült" : "Tam ekran"}
        </button>
      </nav>
      <div className="mg-body">{body()}</div>
    </div>
  );
}

export default ManageDock;
