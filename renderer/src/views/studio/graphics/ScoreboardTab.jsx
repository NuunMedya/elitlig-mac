// Yayın grafikleri · SKORBORD sekmesi (stüdyo üst sekmesi olarak bağlanır):
//   sol   tüm çeşitler canlı önizlemeyle; tıkla → programa (web ile eşitlenebilir)
//   sağ   programda olan, "hangi sahnelerde görünsün", skorbordun görünüm
//         ayarları (logo yeri / boyutu, yazı boyutu, şerit renkleri — yalnız bu maç)
//
//   <ScoreboardTab g={g} live={live} scenes={[{ id, name }]} />
import React from "react";
import { Icon } from "../../../components/ui";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, LOGO_POSITIONS, LOGO_SCALE_MAX, LOGO_SCALE_MIN } from "../../../lib/studio/graphics/branding";
import { SCOREBOARD_VARIANTS, VARIANT_GROUPS, variantInfo } from "../../../lib/studio/graphics/variants";
import GraphicsPreview from "./GraphicsPreview";
import { GraphicsTabShell, GxCard } from "./parts";
import SceneVisibility from "./SceneVisibility";

/** Skorbordun görünüm ayarları: taslak programda anında görünür, "Kaydet" yalnız bu maça yazar. */
export function ScoreboardLook({ g }) {
  const b = g.brand;
  const d = b.branding;
  const sb = d.scoreboard;
  return (
    <GxCard title="Görünüm" icon="sliders" aside={b.dirty ? <span className="pill pill--xs pill--amber">Kaydedilmedi</span> : null}>
      <div className="gx-form">
        <label className="mg-field"><span>Logo yeri</span>
          <select value={d.extras.logoPosition} onChange={(e) => b.update({ extras: { logoPosition: e.target.value } })}>
            {LOGO_POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="mg-field"><span>Logo boyutu · %{sb.logoScale}</span>
          <input type="range" min={LOGO_SCALE_MIN} max={LOGO_SCALE_MAX} step={5} value={sb.logoScale} onChange={(e) => b.update({ scoreboard: { logoScale: Number(e.target.value) } })} />
        </label>
        <label className="mg-field"><span>Yazı boyutu · %{d.extras.fontScale}</span>
          <input type="range" min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={5} value={d.extras.fontScale} onChange={(e) => b.update({ extras: { fontScale: Number(e.target.value) } })} />
        </label>
        <div className="gx-colors">
          <label className="mg-field"><span>Ev şeridi</span><input type="color" value={d.extras.homeColor || "#8a6cf0"} onChange={(e) => b.update({ extras: { homeColor: e.target.value } })} /></label>
          <label className="mg-field"><span>Dep. şeridi</span><input type="color" value={d.extras.awayColor || "#f06c8a"} onChange={(e) => b.update({ extras: { awayColor: e.target.value } })} /></label>
          <label className="mg-field"><span>Yazı</span><input type="color" value={d.extras.textColor} onChange={(e) => b.update({ extras: { textColor: e.target.value } })} /></label>
          {(d.extras.homeColor || d.extras.awayColor) && <button type="button" className="btn btn--xs btn--ghost" onClick={() => b.update({ extras: { homeColor: null, awayColor: null } })}>Sıfırla</button>}
        </div>
      </div>
      <div className="gx-actions">
        <button type="button" className="btn btn--sm btn--ghost" disabled={!b.dirty || b.saving} onClick={b.revert}>Geri al</button>
        <button type="button" className="btn btn--sm btn--primary" disabled={!b.dirty || b.saving} onClick={() => b.save()}><Icon name="check" size={13} /> Bu maça kaydet</button>
      </div>
      <p className="mg-muted mg-small">Tema, logo ve yazı tipi “Marka &amp; tema” sekmesinde.</p>
    </GxCard>
  );
}

export function ScoreboardVariants({ g, columns }) {
  return (
    <div className="gx-variants">
      {VARIANT_GROUPS.map((grp) => (
        <section key={grp.key} className="gx-group">
          <h6 className="gx-group__title">{grp.title}</h6>
          <div className="gx-tiles" style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
            {SCOREBOARD_VARIANTS.filter((v) => v.group === grp.key).map((v, i) => (
              <button key={v.key} type="button" className={`gx-tile${g.scorebugVariant === v.key ? " is-on" : ""}`} onClick={() => g.setScorebugVariant(v.key)} title={v.hint} aria-pressed={g.scorebugVariant === v.key}>
                <GraphicsPreview snapshot={g.snapshot} variant={v.key} isolate width={232} fps={1} delay={i * 90} />
                <span className="gx-tile__label">
                  <b>{g.scorebugVariant === v.key && <span className="gx-dot" />}{v.label}</b>
                  <small>{v.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ScoreboardTab({ g, scenes = [] }) {
  const current = g ? variantInfo(g.scorebugVariant) : null;
  return (
    <GraphicsTabShell g={g} title="Skorbord" icon="layers"
      actions={g && <label className="mg-check gx-sync" title="Seçilen skorbord / röportaj modu OBS'teki web kaplamasına da yazılır"><input type="checkbox" checked={g.syncWeb} onChange={(e) => g.setSyncWeb(e.target.checked)} /> Web kaplamasıyla eşitle</label>}>
      {g?.matchId && (
        <div className="gx-split">
          <div className="gx-split__main"><ScoreboardVariants g={g} /></div>
          <aside className="gx-split__side">
            <GxCard title="Programda" icon="broadcast">
              <GraphicsPreview snapshot={g.snapshot} width={300} fps={4} title="Programdaki skorbord" />
              <p className="gx-now"><span className="gx-dot" /> <b>{current?.label || "—"}</b> <small>{current?.hint}</small></p>
            </GxCard>
            <SceneVisibility g={g} kind="scorebug" scenes={scenes} title="Skorbord hangi sahnelerde görünsün" />
            <ScoreboardLook g={g} />
          </aside>
        </div>
      )}
    </GraphicsTabShell>
  );
}
