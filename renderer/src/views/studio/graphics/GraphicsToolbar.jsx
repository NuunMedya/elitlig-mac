// Yayın grafikleri · üst çubuk denetimleri (CORE stüdyo başlığına koyar):
//   [Skorbord ▾] [LED ▾] [Altyazı] [Röportaj]
import React from "react";
import { Icon } from "../../../components/ui";
import { LED_MODES, SCOREBOARD_VARIANTS, VARIANT_GROUPS } from "../../../lib/studio/graphics/variants";

export default function GraphicsToolbar({ g, compact = false }) {
  if (!g) return null;
  const disabled = !g.matchId;
  return (
    <div className={`gx-toolbar${compact ? " is-compact" : ""}`} role="group" aria-label="Yayın grafikleri">
      <label className="gx-tb__field" title="Programdaki skorbord / tam ekran grafik">
        <Icon name="layers" size={13} />
        <span className="gx-tb__label">Skorbord</span>
        <select value={g.scorebugVariant} disabled={disabled} onChange={(e) => g.setScorebugVariant(e.target.value)} aria-label="Skorbord çeşidi">
          {VARIANT_GROUPS.map((grp) => (
            <optgroup key={grp.key} label={grp.title}>
              {SCOREBOARD_VARIANTS.filter((v) => v.group === grp.key).map((v) => <option key={v.key} value={v.key} title={v.hint}>{v.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="gx-tb__field" title="Sahadaki LED ekranın içeriği (web /led)">
        <Icon name="grid" size={13} />
        <span className="gx-tb__label">LED</span>
        <select value={g.ledMode} disabled={disabled || g.busy} onChange={(e) => g.setLedMode(e.target.value)} aria-label="LED ekran içeriği">
          {LED_MODES.map((m) => <option key={m.key} value={m.key} title={m.hint}>{m.label}</option>)}
        </select>
      </label>
      <button type="button" className={`gx-tb__toggle${g.subtitle.onAir ? " is-on" : ""}`} disabled={disabled} aria-pressed={g.subtitle.onAir}
        title={g.subtitle.onAir ? "Altyazıyı programdan kaldır" : "Altyazı şeridini programa al"} onClick={() => g.setSubtitleOnAir(!g.subtitle.onAir)}>
        {g.subtitle.onAir && <span className="gx-dot" />}<Icon name="list" size={13} /> Altyazı
      </button>
      <button type="button" className={`gx-tb__toggle${g.interview.onAir ? " is-on" : ""}`} disabled={disabled} aria-pressed={g.interview.onAir}
        title={g.interview.onAir ? "Röportaj bandını kaldır" : g.interview.people?.length ? "Röportaj bandını yayına al" : "Önce Röportaj sekmesinden konuk seç"}
        onClick={() => g.setInterviewOnAir(!g.interview.onAir)}>
        {g.interview.onAir && <span className="gx-dot" />}<Icon name="mic" size={13} /> Röportaj
      </button>
    </div>
  );
}
