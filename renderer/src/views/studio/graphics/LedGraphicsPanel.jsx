// Yayın grafikleri · LED EKRAN grafikleri (A1'in LED sekmesine gömülür):
//   LED içerik modu (PUT led-status), LED teması (yalnız bu maç), maçın enleri,
//   LED sponsoru.
//
//   <LedGraphicsPanel g={g} live={live} embedded? />
import React from "react";
import { Icon } from "../../../components/ui";
import { OVERLAY_THEMES, themeSwatches } from "../../../lib/studio/graphics/branding";
import { LED_MODES } from "../../../lib/studio/graphics/variants";
import HighlightsDesk from "../manage/HighlightsDesk";
import { DeskError, GraphicsTabShell, GxCard, useDeskPolling } from "./parts";

const Swatches = ({ design }) => {
  const sw = themeSwatches(design);
  return <span className="gx-swatches" aria-hidden="true">{[sw.deep, sw.base, sw.accent, sw.light].map((c, i) => <i key={i} style={{ background: c }} />)}</span>;
};

function LedBody({ g, live }) {
  const desk = g.desk;
  const b = g.brand;
  const led = b.branding.led;
  return (
    <div className="mg-stack">
      <DeskError desk={desk} />
      <GxCard title="LED ekranda ne görünsün" icon="grid">
        <div className="mg-modes">
          {LED_MODES.map((m) => (
            <button key={m.key} type="button" className={`mg-mode is-led${g.ledMode === m.key ? " is-on" : ""}`} disabled={g.busy} onClick={() => g.setLedMode(m.key)} aria-pressed={g.ledMode === m.key}>
              <strong>{g.ledMode === m.key && <span className="mg-live__dot" />}{m.label}</strong><small>{m.hint}</small>
            </button>
          ))}
        </div>
      </GxCard>
      <div className="mg-grid2">
        <GxCard title="LED teması" icon="palette" aside={b.dirty ? <span className="pill pill--xs pill--amber">Kaydedilmedi</span> : null}>
          <div className="gx-themes">
            {OVERLAY_THEMES.map((t) => (
              <button key={t.key} type="button" className={`gx-theme${led.theme === t.key ? " is-on" : ""}`} onClick={() => b.update({ led: { theme: t.key } })}>
                <Swatches design={{ ...led, theme: t.key }} /><span>{t.label}</span>
              </button>
            ))}
          </div>
          {led.theme === "custom" && (
            <div className="gx-colors">
              <label className="mg-field"><span>Zemin</span><input type="color" value={led.baseColor || "#300030"} onChange={(e) => b.update({ led: { baseColor: e.target.value } })} /></label>
              <label className="mg-field"><span>Vurgu</span><input type="color" value={led.accentColor || "#54009c"} onChange={(e) => b.update({ led: { accentColor: e.target.value } })} /></label>
            </div>
          )}
          <div className="gx-actions">
            <button type="button" className="btn btn--sm btn--ghost" disabled={!b.dirty || b.saving} onClick={b.revert}>Geri al</button>
            <button type="button" className="btn btn--sm btn--primary" disabled={!b.dirty || b.saving} onClick={() => b.save()}><Icon name="check" size={13} /> Bu maça kaydet</button>
          </div>
        </GxCard>
        <GxCard title="LED sponsoru" icon="handshake">
          <p className="mg-muted">“Marka / sponsor” içeriğinde gösterilecek sponsor. Seçince LED ekran sponsor görünümüne geçer.</p>
          <select value={desk.state.led?.sponsorId || ""} disabled={desk.saving || desk.loading} onChange={async (e) => {
            const sid = e.target.value ? Number(e.target.value) : null;
            const ok = await desk.save({ led: { sponsorId: sid } }, sid ? null : "LED sponsoru kaldırıldı.");
            if (ok && sid) await g.setLedMode("sponsor");
          }}>
            <option value="">Elit Lig marka ekranı</option>
            {desk.sponsors.filter((s) => s.placements?.includes("led_screen")).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </GxCard>
      </div>
      <HighlightsDesk matchId={g.matchId} match={live?.match} live={live} />
    </div>
  );
}

export default function LedGraphicsPanel({ g, live, embedded = false }) {
  useDeskPolling(g);
  if (embedded) return g?.matchId ? <LedBody g={g} live={live} /> : null;
  return (
    <GraphicsTabShell g={g} title="LED ekran grafikleri" icon="grid">
      {g?.matchId && <LedBody g={g} live={live} />}
    </GraphicsTabShell>
  );
}
