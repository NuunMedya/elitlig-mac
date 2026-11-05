// Maç yönetimi · Yayın grafikleri — web kaplamalarının (skorboard, LED,
// altyazı) tüm ayarları stüdyodan:
//   Skorboard   PUT /api/maclar/:id/overlay-status { status }   (OVERLAY_MODES)
//   LED ekran   PUT /api/maclar/:id/led-status { status }       (LED_MODES) + maçın enleri
//   Sponsor     broadcast-state { onAir } / { corner } / { led }
//   Altyazı     broadcast-state { subtitle }
//   Röportaj    broadcast-state { interview } + skorboard "interview" modu
//   Bağlantılar /skorboard/canli/:id, /skoroverlay?match=, /led/:id, /altyazi/:id
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { LED_MODES, OVERLAY_GROUPS, OVERLAY_MODES, currentLedMode, currentOverlayMode, ledModeBody, overlayLinks, overlayModeBody } from "../../../lib/studio/manageBroadcast";
import HighlightsDesk from "./HighlightsDesk";
import InterviewDesk from "./InterviewDesk";
import * as api from "./manageApi";
import { LinkRow } from "./pickers";
import SponsorDesk from "./SponsorDesk";
import SubtitleDesk from "./SubtitleDesk";
import { useDesk } from "./useDesk";
import { useRun } from "./useManage";

const SITE = "https://elitlig.com";

const SECTIONS = [
  { key: "score", label: "Skorboard", icon: "layers" },
  { key: "led", label: "LED ekran", icon: "grid" },
  { key: "subtitle", label: "Altyazı", icon: "list" },
  { key: "interview", label: "Röportaj", icon: "mic" },
  { key: "sponsor", label: "Sponsor", icon: "handshake" },
  { key: "links", label: "Önizleme bağlantıları", icon: "link" },
];

/** Sunucuya yazılan mod, maç kaydı tazelenene kadar yerelde de tutulur. */
function useMode(serverValue) {
  const [local, setLocal] = useState(null);
  useEffect(() => { setLocal(null); }, [serverValue]);
  return [local ?? serverValue, setLocal];
}

export default function GraphicsTab({ matchId, match, live }) {
  const { run, busy, toast } = useRun();
  const desk = useDesk(matchId);
  const [section, setSection] = useState("score");
  const [overlay, setOverlay] = useMode(currentOverlayMode(match));
  const [led, setLed] = useMode(currentLedMode(match));

  const pickOverlay = async (mode) => {
    const label = OVERLAY_MODES.find((m) => m.key === mode)?.label;
    const ok = await run(() => api.setOverlayStatus(matchId, overlayModeBody(mode)), { ok: `Skorboard: ${label} yayında.`, fail: "Skorboard modu değiştirilemedi." });
    if (ok) { setOverlay(mode); live?.refresh?.(); }
    return Boolean(ok);
  };
  const pickLed = async (mode) => {
    const label = LED_MODES.find((m) => m.key === mode)?.label;
    const ok = await run(() => api.setLedStatus(matchId, ledModeBody(mode)), { ok: `LED ekran: ${label}.`, fail: "LED ekran içeriği değiştirilemedi." });
    if (ok) { setLed(mode); live?.refresh?.(); }
    return Boolean(ok);
  };

  return (
    <div className="mg-graphics">
      <nav className="mg-subnav" aria-label="Yayın grafikleri">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? "is-on" : ""} onClick={() => setSection(s.key)}>
            <Icon name={s.icon} size={13} /> {s.label}
          </button>
        ))}
        <span className="mg-grow" />
        <span className="mg-muted mg-now">Skorboard: <b>{OVERLAY_MODES.find((m) => m.key === overlay)?.label || overlay || "—"}</b> · LED: <b>{LED_MODES.find((m) => m.key === led)?.label || "—"}</b></span>
      </nav>
      {desk.error && section !== "score" && section !== "links" && <p className="mg-error">{desk.error} <button type="button" className="btn btn--xs" onClick={desk.refresh}>Yeniden dene</button></p>}

      <div className="mg-graphics__body">
        {section === "score" && (
          <div className="mg-stack">
            {OVERLAY_GROUPS.map((g) => (
              <section key={g.key}>
                <h6 className="mg-sidehead">{g.title}</h6>
                <div className="mg-modes">
                  {OVERLAY_MODES.filter((m) => m.group === g.key).map((m) => (
                    <button key={m.key} type="button" className={`mg-mode${overlay === m.key ? " is-on" : ""}`} disabled={busy} onClick={() => (m.key === "interview" ? setSection("interview") : pickOverlay(m.key))}>
                      <strong>{overlay === m.key && <span className="mg-live__dot" />}{m.label}</strong><small>{m.hint}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <p className="mg-muted">Röportaj modu için önce konukları “Röportaj” bölümünde seç; oradan yayına alınır.</p>
          </div>
        )}

        {section === "led" && (
          <div className="mg-stack">
            <div className="mg-modes">
              {LED_MODES.map((m) => (
                <button key={m.key} type="button" className={`mg-mode is-led${led === m.key ? " is-on" : ""}`} disabled={busy} onClick={() => pickLed(m.key)}>
                  <strong>{led === m.key && <span className="mg-live__dot" />}{m.label}</strong><small>{m.hint}</small>
                </button>
              ))}
            </div>
            <div className="mg-grid2">
              <HighlightsDesk matchId={matchId} match={match} live={live} />
              <fieldset className="mg-box">
                <legend>LED sponsoru</legend>
                <p className="mg-muted">“Marka / sponsor” içeriğinde gösterilecek sponsor. Seçince LED ekran sponsor görünümüne geçer.</p>
                <select value={desk.state.led?.sponsorId || ""} disabled={desk.saving || desk.loading} onChange={async (e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const ok = await desk.save({ led: { sponsorId: id } }, id ? null : "LED sponsoru kaldırıldı.");
                  if (ok && id) await pickLed("sponsor");
                }}>
                  <option value="">Elit Lig marka ekranı</option>
                  {desk.sponsors.filter((s) => s.placements?.includes("led_screen")).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </fieldset>
            </div>
          </div>
        )}

        {section === "subtitle" && (desk.loading ? <p className="mg-muted">Altyazı ayarları yükleniyor…</p> : <SubtitleDesk desk={desk} matchId={matchId} toast={toast} />)}
        {section === "interview" && (desk.loading ? <p className="mg-muted">Röportaj bilgisi yükleniyor…</p> : <InterviewDesk desk={desk} live={live} isLive={overlay === "interview"} onGoLive={() => pickOverlay("interview")} />)}
        {section === "sponsor" && <SponsorDesk desk={desk} ledMode={led} onLedSponsorMode={() => pickLed("sponsor")} />}
        {section === "links" && (
          <div className="mg-stack">
            <p className="mg-muted">OBS / vMix'e “Tarayıcı kaynağı” olarak 1920×1080 ekle; LED bilgisayarında tam ekran aç. Modu bu sekmeden değiştirdiğinde kaplamalar birkaç saniye içinde güncellenir.</p>
            <ul className="mg-rows">{overlayLinks(matchId, SITE).map((l) => <LinkRow key={l.key} label={l.label} hint={l.hint} url={l.url} toast={toast} />)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
