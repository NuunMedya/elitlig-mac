// Yayın grafikleri · TOPLU panel (geriye dönük uyumluluk). Stüdyo artık her
// bölümü kendi üst sekmesine bağlar (ScoreboardTab, SubtitlePanel, BrandTab,
// PresetsTab, LedGraphicsPanel, InterviewGraphicsPanel); bu bileşen aynı
// parçaları tek sekmede alt menüyle gösterir (bağlanmamış eski düzen için).
//
//   <GraphicsDock g={g} matchId={matchId} live={live} scenes={[{ id, name }]} />
import React, { useEffect, useState } from "react";
import { Icon, Spinner } from "../../../components/ui";
import BrandingEditor from "./BrandingEditor";
import { LinksPanel, SponsorPanel } from "./BroadcastExtras";
import InterviewGraphicsPanel from "./InterviewGraphicsPanel";
import LedGraphicsPanel from "./LedGraphicsPanel";
import { useDeskPolling } from "./parts";
import PresetsPanel from "./PresetsPanel";
import { ScoreboardLook, ScoreboardVariants } from "./ScoreboardTab";
import SceneVisibility from "./SceneVisibility";
import SubtitlePanel from "./SubtitlePanel";

const SECTIONS = [
  { key: "score", label: "Skorbord", icon: "layers" },
  { key: "brand", label: "Marka & tema", icon: "palette" },
  { key: "presets", label: "Ön ayarlar", icon: "star" },
  { key: "subtitle", label: "Altyazı", icon: "list" },
  { key: "interview", label: "Röportaj", icon: "mic" },
  { key: "led", label: "LED ekran", icon: "grid" },
  { key: "sponsor", label: "Sponsor", icon: "handshake" },
  { key: "links", label: "Bağlantılar", icon: "link" },
];
const STORE = "elitlig.studio.graphicsSection";
const readSection = () => { try { const v = localStorage.getItem(STORE); return SECTIONS.some((s) => s.key === v) ? v : "score"; } catch { return "score"; } };

export default function GraphicsDock({ g, matchId, live, scenes = [] }) {
  const [section, setSection] = useState(readSection);
  useEffect(() => { try { localStorage.setItem(STORE, section); } catch { /* yoksay */ } }, [section]);
  useDeskPolling(g);

  if (!g) return null;
  if (!g.matchId) return <p className="mg-muted gx-empty mg-dock">Grafikler için önce “Maçlar” sekmesinden bir maç seç.</p>;

  return (
    <div className="mg-dock gx-dock"><div className="mg-graphics">
      <nav className="mg-subnav" aria-label="Yayın grafikleri">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? "is-on" : ""} onClick={() => setSection(s.key)}>
            <Icon name={s.icon} size={13} /> {s.label}
            {s.key === "subtitle" && g.subtitle.onAir && <span className="gx-dot" />}
            {s.key === "interview" && g.interview.onAir && <span className="gx-dot" />}
            {s.key === "brand" && g.brand.dirty && <span className="gx-dot is-amber" />}
          </button>
        ))}
        <span className="mg-grow" />
        <span className="gx-scope"><Icon name="lock" size={11} /> Yalnız bu maç</span>
        <label className="mg-check" title="Seçilen skorbord / röportaj modu OBS'teki web kaplamasına da yazılır"><input type="checkbox" checked={g.syncWeb} onChange={(e) => g.setSyncWeb(e.target.checked)} /> Web kaplamasıyla eşitle</label>
      </nav>

      <div className="mg-graphics__body">
        {section === "score" && (
          <div className="gx-split">
            <div className="gx-split__main"><ScoreboardVariants g={g} /></div>
            <aside className="gx-split__side">
              <SceneVisibility g={g} kind="scorebug" scenes={scenes} title="Skorbord hangi sahnelerde görünsün" />
              <ScoreboardLook g={g} />
            </aside>
          </div>
        )}
        {section === "brand" && (g.brand.loading ? <Spinner label="Yayın görünümü yükleniyor…" /> : <BrandingEditor g={g} live={live} />)}
        {section === "presets" && <PresetsPanel g={g} />}
        {section === "subtitle" && <SubtitlePanel g={g} scenes={scenes} embedded />}
        {section === "interview" && <InterviewGraphicsPanel g={g} live={live} scenes={scenes} embedded />}
        {section === "led" && <LedGraphicsPanel g={g} live={live} embedded />}
        {section === "sponsor" && <SponsorPanel g={g} />}
        {section === "links" && <LinksPanel g={g} matchId={matchId} />}
      </div>
    </div></div>
  );
}
