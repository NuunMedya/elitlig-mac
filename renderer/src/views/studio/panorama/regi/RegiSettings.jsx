// Panorama rejisi · AYARLAR: çıkış (çözünürlük / kare hızı / bit hızı), geçiş süreleri, güvenli alan
// kılavuzu, klavye kısayolları (eylem başına tuş; çakışma uyarısı), ekran yerleşimi (hazır düzenler).
import React from "react";
import { Icon, Kbd } from "../../../../components/ui";
import { BITRATE_MAX_KBPS, BITRATE_MIN_KBPS, FPS_CHOICES, RESOLUTION_CHOICES, normalizeEncoding, recommendedBitrate } from "../../../../lib/studio/broadcast";
import { TRANSITION_KINDS, transitionMs } from "../../../../lib/studio/transitions";
import { HOTKEY_ACTIONS, TAKE_KINDS, hotkeyConflicts, hotkeyLabel, hotkeyMap, keyName } from "../../../../lib/studio/panorama/regi";
import { LAYOUT_PRESETS } from "./PanoramaWorkspace";
import { useRegi } from "./RegiCtx";

function KeyCapture({ value, onChange }) {
  return (
    <input className="input pr-keycap" readOnly value={hotkeyLabel(value)} title="Tıkla ve tuşa bas (Sil / Geri: kaldır)"
      onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); if (e.key === "Backspace" || e.key === "Delete") { onChange(""); return; } const n = keyName(e); if (n && !/^[1-9]$/.test(n)) onChange(n); }} />
  );
}

export default function RegiSettings() {
  const R = useRegi();
  const regi = R.pano.regi;
  const enc = R.prefs.encoding;
  const live = R.onAir;
  const keys = hotkeyMap(regi.hotkeys);
  const itemKeys = [...R.pano.gfx.lowers.filter((l) => l.key).map((l) => ({ key: l.key, label: `Alt yazı: ${l.title}` })), ...R.pano.gfx.titles.filter((l) => l.key).map((l) => ({ key: l.key, label: `Tam ekran: ${l.title}` })), ...Object.entries(regi.scenes).filter(([, s]) => s.key).map(([id, s]) => ({ key: s.key, label: `Sahne: ${R.pano.angles.find((a) => a.id === id)?.name || id}` }))];
  const conflicts = hotkeyConflicts(regi.hotkeys, itemKeys);
  const setEnc = (patch) => R.setPrefs({ encoding: normalizeEncoding({ ...enc, ...patch }) });
  return (
    <div className="pr-settings" data-panel="ayarlar">
      <section className="pr-sec">
        <h4 className="pr-h"><Icon name="monitor" size={12} /> Çıkış (yayın ve kayıt)</h4>
        <div className="pn-row2">
          <label className="field pn-mini"><span>Çözünürlük</span><select className="input" value={enc.resolution} disabled={live} onChange={(e) => setEnc({ resolution: e.target.value, bitrateKbps: recommendedBitrate(e.target.value, enc.fps) })} data-field="out-res">{RESOLUTION_CHOICES.map((r) => <option key={r.key} value={r.key}>{r.label} ({r.width}×{r.height})</option>)}</select></label>
          <label className="field pn-mini"><span>Kare hızı</span><select className="input" value={enc.fps} disabled={live} onChange={(e) => setEnc({ fps: Number(e.target.value), bitrateKbps: recommendedBitrate(enc.resolution, Number(e.target.value)) })} data-field="out-fps">{FPS_CHOICES.map((f) => <option key={f} value={f}>{f} fps</option>)}</select></label>
        </div>
        <label className="field pn-mini"><span>Bit hızı <b>{(enc.bitrateKbps / 1000).toLocaleString("tr-TR")} Mbps</b></span><input type="range" min={BITRATE_MIN_KBPS} max={BITRATE_MAX_KBPS} step={100} value={enc.bitrateKbps} disabled={live} onChange={(e) => setEnc({ bitrateKbps: Number(e.target.value) })} /></label>
        {live && <p className="st-hint">Yayın sürerken çıkış değiştirilemez.</p>}
      </section>
      <section className="pr-sec">
        <h4 className="pr-h"><Icon name="swap" size={12} /> Geçiş süreleri</h4>
        <div className="pr-fields">{TAKE_KINDS.filter((k) => k !== "cut").map((k) => {
          const t = TRANSITION_KINDS.find((x) => x.key === k);
          if (!t) return null;
          const ms = transitionMs(k, R.prefs.transitionMs);
          return <label key={k} className="field pn-mini pn-range"><span>{t.label} <b>{ms} ms</b></span><input type="range" min={t.min} max={t.max} step={50} value={ms} onChange={(e) => R.setPrefs((p) => ({ transitionMs: { ...p.transitionMs, [k]: Number(e.target.value) } }))} /></label>;
        })}</div>
        <p className="st-hint">Logo geçişleri (stinger) temanın logosu ve renkleriyle çizilir. Sahne başına geçiş: Sahneler › sahne ayarı.</p>
      </section>
      <section className="pr-sec">
        <h4 className="pr-h"><Icon name="target" size={12} /> Güvenli alan kılavuzu (yalnız monitörlerde, yayına çıkmaz)</h4>
        <div className="pn-checks">
          {[["on", "Göster"], ["action", "%90 eylem alanı"], ["title", "%80 başlık alanı"], ["thirds", "Üçte bir ızgara"], ["center", "Orta artı"]].map(([k, l]) => (
            <label key={k}><input type="checkbox" checked={regi.safe[k]} onChange={(e) => R.setRegi((r) => ({ ...r, safe: { ...r.safe, [k]: e.target.checked } }))} data-safe={k} /> {l}</label>
          ))}
        </div>
      </section>
      <section className="pr-sec">
        <h4 className="pr-h"><Icon name="command" size={12} /> Klavye kısayolları <span className="st-top__spacer" /><button type="button" className="btn btn--xs" onClick={() => R.setRegi((r) => ({ ...r, hotkeys: {} }))}>Varsayılana dön</button></h4>
        <table className="pr-keys"><tbody>
          {HOTKEY_ACTIONS.map((a) => (
            <tr key={a.key}><td>{a.label}</td><td><KeyCapture value={keys[a.key]} onChange={(v) => R.setRegi((r) => ({ ...r, hotkeys: { ...r.hotkeys, [a.key]: v } }))} /></td></tr>
          ))}
          <tr><td>Sahneyi önizlemeye / doğrudan yayına</td><td><Kbd>1–9</Kbd> / <Kbd>⇧</Kbd>+<Kbd>1–9</Kbd></td></tr>
          <tr><td>Hazır ayar (gösteri) yükle</td><td><Kbd>⌥</Kbd>+<Kbd>1–9</Kbd></td></tr>
          {itemKeys.map((x) => <tr key={x.label}><td>{x.label}</td><td><Kbd>{x.key}</Kbd></td></tr>)}
        </tbody></table>
        {conflicts.length > 0 && <p className="pn-err" data-conflicts="">{conflicts.map((c) => `${hotkeyLabel(c.key)}: ${c.labels.join(" · ")}`).join(" — ")} (aynı tuş birden çok işe bağlı; önce eylem çalışır)</p>}
      </section>
      <section className="pr-sec">
        <h4 className="pr-h"><Icon name="layout" size={12} /> Ekran yerleşimi</h4>
        <div className="pr-presets">{LAYOUT_PRESETS.map((p) => (
          <button key={p.key} type="button" className={regi.layout === p.key ? "is-on" : ""} onClick={() => R.applyLayout(p.key)} data-layout={p.key}><b>{p.label}</b><small>{p.hint}</small></button>
        ))}</div>
        <p className="st-hint">Üst çubuktaki <b>Düzenle</b> ile panelleri sürükle, böl, sekmele; <b>Panel ekle</b> ile kaldırılanları geri getir.</p>
      </section>
    </div>
  );
}
