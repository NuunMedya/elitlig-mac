// Yayın Stüdyosu · Ayarlar › VAR teması: tema seçici (canlı önizlemeler).
//
// Önizlemeler yayındaki VAR çiziminin AYNISI (var/drawVar.js), sahte saha
// görüntüsüyle. Seçim prefs.modes.var.theme'e yazılır (VAR sekmesindeki hızlı
// seçimle aynı ayar; yayında anında değişir). Kendi içinde bağımsız bileşen:
// Ayarlar sayfasına yalnız bölüm anahtarı + bu bileşen eklenir.
import React, { useState } from "react";
import { VAR_DECISIONS, VAR_LAYOUTS, VAR_STATES } from "../../../lib/studio/var";
import { VAR_THEMES, varThemeFromPrefs, varThemeOf, withVarTheme } from "../../../lib/studio/varThemes";
import VarThemePreview from "../var/VarThemePreview";
import "../var/varTheme.css";

export const VAR_THEME_SECTION = { key: "var", label: "VAR teması", icon: "palette" };

export function ThemeSwatch({ theme }) {
  return <span className="vth-swatch" aria-hidden="true">{theme.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>;
}

export default function VarThemeSection({ prefs, setPref }) {
  const current = varThemeFromPrefs(prefs);
  const [layout, setLayout] = useState("two");
  const [state, setState] = useState("decision");
  const [decision, setDecision] = useState("goalOff");
  const [hover, setHover] = useState(null);
  const choose = (key) => setPref("modes", (m) => withVarTheme(m, key));
  const t = varThemeOf(current);
  return (
    <>
      <section className="st-set__card">
        <header><h3>Seçili tema · {t.label}</h3><p>Canlı önizleme: VAR yayına alındığında programda bu görünüm çizilir. VAR sekmesinden de hızlıca değiştirilebilir.</p></header>
        <div className="st-set__card-body">
          <div className="vth-stage">
            <div className="vth-stage__view">
              <VarThemePreview theme={current} layout={layout} state={state} decision={decision} width={960} height={540} animate fluid title={`${t.label} önizlemesi`} />
            </div>
            <div className="vth-stage__ctl">
              <label>Düzen
                <span className="st-seg st-seg--xs">{VAR_LAYOUTS.map((l) => <button key={l.key} type="button" className={layout === l.key ? "is-on" : ""} onClick={() => setLayout(l.key)}>{l.label}</button>)}</span>
              </label>
              <label>Durum
                <span className="st-seg st-seg--xs">{VAR_STATES.map((x) => <button key={x.key} type="button" className={state === x.key ? "is-on" : ""} onClick={() => setState(x.key)}>{x.label}</button>)}</span>
              </label>
              {state === "decision" && (
                <label>Karar
                  <select value={decision} onChange={(e) => setDecision(e.target.value)}>{VAR_DECISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
                </label>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="st-set__card">
        <header><h3>Temalar</h3><p>Her tema: açı pencerelerinin çerçevesi, VAR rozeti ve başlık, İNCELEME › KONTROL › KARAR adımları, açı etiketleri ve hareketli karar bandı.</p></header>
        <div className="st-set__card-body">
          <div className="vth-grid">
            {VAR_THEMES.map((x) => (
              <button key={x.key} type="button" className={`vth-card ${current === x.key ? "is-on" : ""}`} style={{ "--vth-accent": x.accent }} aria-pressed={current === x.key}
                onClick={() => choose(x.key)} onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover((h) => (h === x.key ? null : h))}>
                <VarThemePreview theme={x.key} layout={layout} state={state} decision={decision} width={384} height={216} animate={hover === x.key} />
                <span className="vth-card__meta">
                  <ThemeSwatch theme={x} />
                  <span><strong>{x.label}</strong><small>{x.hint}</small></span>
                  <i className="vth-card__check" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
