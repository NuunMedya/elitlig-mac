// Yayın Stüdyosu · GÖRÜNTÜ / EFEKTLER düzenleyicisi (kaynak penceresi, sahne
// düzenleyicisinin katman özellikleri ve canlı "Görüntü ayarları" paneli ortak).
//
//   Canlı küçük önizleme: Sonra / Önce / Böl (sol yarı özgün, sağ yarı ayarlı)
//   Hazır ayarlar (Doğal, Canlı, Sinematik, Sıcak, Soğuk, Gece sahası, Siyah-beyaz,
//   Yüksek kontrast) + YAYIN GÖRÜNÜMLERİ (Rec.709 nötr, gece maçı, güneşli gün, çim yeşili,
//   sıcak sinematik, soğuk modern, düşük ışık, yüksek kontrast spor, mat film, doğal cilt)
//   + "Hazır ayar olarak kaydet" (özel; sağ tık / × ile sil) · Sıfırla
//   OTOMATİK beyaz ayarı / pozlama eşitle: kameranın o anki karesi ölçülür (çim ve patlamış
//   pikseller hariç, nötr ağırlıklı, yinelemeli) → sıcaklık / renk tonu / pozlama (+ gerekirse
//   parlak alan kurtarma, gölge açma) önerilip uygulanır. Kameralar arası eşitleme için her
//   kamerada bir kez basmak yeter.
//   Renk · Işık · Detay kaydırıcıları (çift tık: o ayarı sıfırla), tek renk, negatif,
//   yön (yatay / dikey çevir, 90° döndür), yeşil perde (renk, önizlemeden damlalık,
//   benzerlik, yumuşaklık, taşma azaltma).
//
// Değişiklik her kaydırıcı hareketinde onChange(compactFx) ile bildirilir; canlı
// uygulama çağıranın işidir (kaynak penceresi taslağa yazar, panel yapılandırmaya).
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import {
  CHROMA_SLIDERS, FX_DEFAULTS, FX_PRESETS, FX_SLIDERS, MONO, addCustomPreset, applyPreset, autoBalance, compactFx, fxActive, measureBalance,
  fxUnsupported2D, fxValueLabel, loadCustomPresets, presetMatches, removeCustomPreset, resetFx, resolveFx, saveCustomPresets,
} from "../../../lib/studio/videoFx";
import { drawSource } from "../draw";
import { fxHasGL } from "./fxProcessor";
import "./fx.css";

const GROUPS = [
  { key: "renk", label: "Renk" },
  { key: "isik", label: "Işık" },
  { key: "detay", label: "Detay" },
];
const storage = () => { try { return window.localStorage; } catch { return null; } };

/** Kaynağın o anki ÖZGÜN (ayarsız) karesinin küçük örneği → beyaz ayarı ölçümü (yoksa null). */
export function sampleSourceStats(source, runtimeRef) {
  if (!source || typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 96; c.height = 54;
  const x = c.getContext("2d", { willReadFrequently: true });
  try {
    drawSource(x, source, runtimeRef?.current?.get(source.id), { x: 0, y: 0, w: 96, h: 54 }, "cover", { placeholders: false, fx: false });
    const st = measureBalance(x.getImageData(0, 0, 96, 54).data);
    return st.n && st.luma > 0.004 ? st : null;
  } catch { return null; }
}

/** Ayarın canlı küçük önizlemesi. mode: "after" | "before" | "split". onPick(hex): damlalık. */
export function FxPreview({ source, runtimeRef, fx, mode = "after", width = 320, picking = false, onPick }) {
  const ref = useRef(null);
  const live = useRef({ source, fx, mode });
  live.current = { source, fx, mode };
  useEffect(() => {
    let raf = 0; let last = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 60) return; // ~16 kare/sn yeter (yayın tuvalini yormasın)
      last = t;
      const c = ref.current;
      if (!c || c.offsetParent === null) return;
      const { source: s, fx: f, mode: m } = live.current;
      const ctx = c.getContext("2d");
      const rt = s?.id ? runtimeRef?.current?.get(s.id) : null;
      const box = { x: 0, y: 0, w: c.width, h: c.height };
      ctx.fillStyle = "#0b0712";
      ctx.fillRect(0, 0, c.width, c.height);
      if (!s) return;
      const fit = s.kind === "image" || s.kind === "slideshow" ? "contain" : "cover";
      drawSource(ctx, s, rt, box, fit, { placeholders: true, now: t, fx: m === "before" ? false : f || false, fxMaxAge: 40 });
      if (m === "split") {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, c.width / 2, c.height); ctx.clip();
        ctx.fillStyle = "#0b0712"; ctx.fillRect(0, 0, c.width / 2, c.height);
        drawSource(ctx, s, rt, box, fit, { placeholders: true, now: t, fx: false });
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(c.width / 2 - 1, 0, 2, c.height);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runtimeRef]);
  const pick = (e) => {
    if (!picking || !onPick || !source) return;
    // Özgün (ayarsız) kareden renk oku: tuvalin kendisi ayarlı olabilir.
    const c = ref.current;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * c.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * c.height);
    const tmp = document.createElement("canvas");
    tmp.width = c.width; tmp.height = c.height;
    const tx = tmp.getContext("2d", { willReadFrequently: true });
    drawSource(tx, source, runtimeRef?.current?.get(source.id), { x: 0, y: 0, w: c.width, h: c.height }, "cover", { placeholders: false, fx: false });
    try {
      const [R, G, B] = tx.getImageData(x, y, 1, 1).data;
      onPick(`#${[R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
    } catch { /* kirli tuval */ }
  };
  return (
    <div className={`vfx-prev ${picking ? "is-picking" : ""}`}>
      <canvas ref={ref} width={width} height={Math.round((width * 9) / 16)} onClick={pick} />
      {mode === "split" && <><span className="vfx-prev__tag is-l">Önce</span><span className="vfx-prev__tag is-r">Sonra</span></>}
      {mode === "before" && <span className="vfx-prev__tag is-l">Önce (ayarsız)</span>}
      {picking && <span className="vfx-prev__hint">Perde rengini seçmek için görüntüye tıkla</span>}
    </div>
  );
}

function FxSlider({ def, value, onChange, onReset }) {
  const changed = Math.abs(value - (FX_DEFAULTS[def.key] ?? 0)) > 1e-9;
  return (
    <label className={`vfx-slider ${changed ? "is-changed" : ""}`} title={def.hint ? `${def.label} (${def.hint}) — çift tık: sıfırla` : `${def.label} — çift tık: sıfırla`}>
      <span>{def.label}</span>
      <input type="range" min={def.min} max={def.max} step={def.step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={onReset} aria-label={def.label} />
      <em>{fxValueLabel(def.key, value)}</em>
    </label>
  );
}

/**
 * Görüntü ayarı düzenleyicisi. fx: kayıtlı (sıkıştırılmış) ayar; onChange(next | null).
 * source + runtimeRef verilirse canlı önizleme gösterilir. compact: dar panel düzeni.
 */
function FxEditorInner({ fx, onChange, source, runtimeRef, compact = false, preview = true, previewWidth, header = null }) {
  const f = useMemo(() => resolveFx(fx), [fx]);
  const [mode, setMode] = useState("after");
  const [custom, setCustom] = useState(() => loadCustomPresets(storage()));
  const [naming, setNaming] = useState(null);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(() => ({ renk: true, isik: !compact, detay: false, yon: false, chroma: Boolean(f.chroma.on) }));
  const hasGL = useMemo(() => fxHasGL(), []);
  const emit = (next) => onChange(compactFx(next));
  const set = (patch) => emit({ ...f, ...patch });
  const setChroma = (patch) => emit({ ...f, chroma: { ...f.chroma, ...patch } });
  const persist = (list) => { setCustom(list); saveCustomPresets(storage(), list); };
  const unsupported = hasGL ? [] : fxUnsupported2D(f);
  const active = fxActive(fx);
  const presets = [...FX_PRESETS.filter((p) => p.group !== "yayin"), ...custom];
  const looks = FX_PRESETS.filter((p) => p.group === "yayin");
  const [autoMsg, setAutoMsg] = useState(null);
  const runAuto = () => {
    const st = sampleSourceStats(source, runtimeRef);
    if (!st) { setAutoMsg("Kare okunamadı (kaynak açık değil ya da görüntü yok)."); return; }
    const next = autoBalance(st, fx);
    onChange(next);
    const n = resolveFx(next);
    setAutoMsg(`Sıcaklık ${n.temperature}, renk tonu ${n.tint}, pozlama ${n.exposure > 0 ? "+" : ""}${n.exposure.toFixed(2)} EV${n.highlights ? ` · parlak alan ${n.highlights}` : ""}${n.shadows ? ` · gölge +${n.shadows}` : ""}`);
  };
  const chip = (p) => {
    const on = active ? presetMatches(fx, p) : p.id === "natural";
    return (
      <span key={p.id} className={`vfx-chip ${on ? "is-on" : ""} ${p.custom ? "is-custom" : ""}`}>
        <button type="button" onClick={() => onChange(applyPreset(fx, p))} title={p.custom ? `${p.name} (özel hazır ayar)` : p.name}
          onContextMenu={p.custom ? (e) => { e.preventDefault(); persist(removeCustomPreset(custom, p.id)); } : undefined}>{p.name}</button>
        {p.custom && <button type="button" className="vfx-chip__x" aria-label={`${p.name} hazır ayarını sil`} title="Sil" onClick={() => persist(removeCustomPreset(custom, p.id))}><Icon name="x" size={10} /></button>}
      </span>
    );
  };
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className={`vfx ${compact ? "is-compact" : ""}`}>
      {header}
      {preview && source && (
        <div className="vfx__prevwrap">
          <FxPreview source={source} runtimeRef={runtimeRef} fx={fx} mode={mode} width={previewWidth || (compact ? 300 : 340)} picking={picking}
            onPick={(hex) => { setPicking(false); setChroma({ color: hex, on: true }); }} />
          <div className="vfx-seg" role="group" aria-label="Önce / sonra">
            {[["after", "Sonra"], ["before", "Önce"], ["split", "Böl"]].map(([k, l]) => (
              <button key={k} type="button" className={mode === k ? "is-on" : ""} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <div className="vfx__presets" role="group" aria-label="Hazır ayarlar">
        {presets.map(chip)}
        {naming == null ? (
          <button type="button" className="vfx-chip is-add" disabled={!active} onClick={() => setNaming("")} title="Şu anki ayarı hazır ayar olarak sakla"><Icon name="plus" size={11} /> Kaydet</button>
        ) : (
          <form className="vfx-name" onSubmit={(e) => { e.preventDefault(); if (naming.trim()) persist(addCustomPreset(custom, naming, fx)); setNaming(null); }}>
            <input autoFocus value={naming} maxLength={40} placeholder="Hazır ayar adı" aria-label="Hazır ayar adı" onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setNaming(null); }} />
            <button type="submit" className="btn btn--xs btn--primary" disabled={!naming.trim()}>Sakla</button>
          </form>
        )}
        <span className="vfx__sp" />
        <button type="button" className="btn btn--xs" onClick={() => onChange(resetFx(fx))} disabled={!active} title="Renk, ışık, detay ve yeşil perde varsayılana (yön korunur)"><Icon name="refresh" size={11} /> Sıfırla</button>
      </div>

      <div className="vfx__looks" role="group" aria-label="Yayın görünümleri">
        <span className="vfx__looks-t"><Icon name="broadcast" size={11} /> Yayın görünümleri</span>
        {looks.map(chip)}
      </div>

      {source && (
        <div className="vfx__auto">
          <button type="button" className="btn btn--xs" onClick={runAuto} title="Kameranın şu anki karesini ölç: beyaz / gri alanlar nötr, orta tonlar yayın düzeyinde olsun (çim ve patlamış alanlar hesaba katılmaz). Kameralar arası eşitleme için her kamerada bir kez bas.">
            <Icon name="target" size={11} /> Otomatik beyaz ayarı / pozlama eşitle
          </button>
          {autoMsg && <small>{autoMsg}</small>}
        </div>
      )}

      {unsupported.length > 0 && <p className="vfx__warn"><Icon name="alert" size={12} /> Bu bilgisayarda WebGL yok: {unsupported.join(", ")} uygulanmıyor.</p>}

      {GROUPS.map((g) => (
        <section key={g.key} className={`vfx-grp ${open[g.key] ? "is-open" : ""}`}>
          <button type="button" className="vfx-grp__head" onClick={() => toggle(g.key)} aria-expanded={Boolean(open[g.key])}>
            <Icon name={open[g.key] ? "chevronDown" : "chevronRight"} size={12} /> {g.label}
          </button>
          {open[g.key] && (
            <div className="vfx-grp__body">
              {FX_SLIDERS.filter((s) => s.group === g.key).map((s) => (
                <FxSlider key={s.key} def={s} value={f[s.key]} onChange={(v) => set({ [s.key]: v })} onReset={() => set({ [s.key]: FX_DEFAULTS[s.key] })} />
              ))}
              {g.key === "renk" && (
                <div className="vfx-row">
                  <span className="vfx-row__label">Tek renk</span>
                  <div className="vfx-seg is-sm">
                    {MONO.map((m) => <button key={m.key} type="button" className={f.mono === m.key ? "is-on" : ""} aria-pressed={f.mono === m.key} onClick={() => set({ mono: m.key })}>{m.label}</button>)}
                  </div>
                  <label className="vfx-check"><input type="checkbox" checked={f.invert} onChange={(e) => set({ invert: e.target.checked })} /> Negatif</label>
                </div>
              )}
            </div>
          )}
        </section>
      ))}

      <section className={`vfx-grp ${open.yon ? "is-open" : ""}`}>
        <button type="button" className="vfx-grp__head" onClick={() => toggle("yon")} aria-expanded={Boolean(open.yon)}>
          <Icon name={open.yon ? "chevronDown" : "chevronRight"} size={12} /> Yön {(f.flipH || f.flipV || f.rotate) ? <small>{[f.flipH && "ayna", f.flipV && "ters", f.rotate && `${f.rotate}°`].filter(Boolean).join(" · ")}</small> : null}
        </button>
        {open.yon && (
          <div className="vfx-grp__body vfx-row">
            <label className="vfx-check"><input type="checkbox" checked={f.flipH} onChange={(e) => set({ flipH: e.target.checked })} /> Yatay çevir (ayna)</label>
            <label className="vfx-check"><input type="checkbox" checked={f.flipV} onChange={(e) => set({ flipV: e.target.checked })} /> Dikey çevir</label>
            <div className="vfx-seg is-sm" role="group" aria-label="Döndür">
              {[0, 90, 180, 270].map((r) => <button key={r} type="button" className={f.rotate === r ? "is-on" : ""} aria-pressed={f.rotate === r} onClick={() => set({ rotate: r })}>{r}°</button>)}
            </div>
          </div>
        )}
      </section>

      <section className={`vfx-grp ${open.chroma ? "is-open" : ""} ${f.chroma.on ? "is-chroma" : ""}`}>
        <button type="button" className="vfx-grp__head" onClick={() => toggle("chroma")} aria-expanded={Boolean(open.chroma)}>
          <Icon name={open.chroma ? "chevronDown" : "chevronRight"} size={12} /> Yeşil perde (kroma) {f.chroma.on && <small className="is-on">AÇIK</small>}
        </button>
        {open.chroma && (
          <div className="vfx-grp__body">
            <div className="vfx-row">
              <label className="vfx-check"><input type="checkbox" checked={f.chroma.on} onChange={(e) => setChroma({ on: e.target.checked })} /> Perde rengini sil (saydam yap)</label>
              <input type="color" value={f.chroma.color} onChange={(e) => setChroma({ color: e.target.value })} aria-label="Perde rengi" title="Perde rengi" />
              {source && preview && <button type="button" className={`btn btn--xs ${picking ? "btn--primary" : ""}`} onClick={() => { setPicking((p) => !p); if (mode === "before") setMode("after"); }} title="Önizlemeden perde rengini seç"><Icon name="target" size={11} /> {picking ? "Tıkla…" : "Görüntüden seç"}</button>}
              <span className="vfx-swatches">
                {[["#00ff00", "Yeşil"], ["#00b140", "Koyu yeşil"], ["#0047bb", "Mavi"]].map(([c, l]) => <button key={c} type="button" style={{ background: c }} title={l} aria-label={l} onClick={() => setChroma({ color: c })} />)}
              </span>
            </div>
            {CHROMA_SLIDERS.map((s) => (
              <label key={s.key} className="vfx-slider" title={`${s.label} — çift tık: sıfırla`}>
                <span>{s.label}</span>
                <input type="range" min={s.min} max={s.max} step={s.step} value={f.chroma[s.key]} disabled={!f.chroma.on} aria-label={s.label}
                  onChange={(e) => setChroma({ [s.key]: Number(e.target.value) })} onDoubleClick={() => setChroma({ [s.key]: FX_DEFAULTS.chroma[s.key] })} />
                <em>{Math.round(f.chroma[s.key])}</em>
              </label>
            ))}
            <p className="vfx__hint">Sahnede bu katmanın altına bir zemin (görsel, video, renk) koy: perde saydam olur, alttaki görünür.</p>
          </div>
        )}
      </section>
    </div>
  );
}
export const FxEditor = memo(FxEditorInner);
export default FxEditor;
