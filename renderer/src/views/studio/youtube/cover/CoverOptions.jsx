// YouTube kapağı · şablon seçici (canlı küçük önizlemeler) ve seçenekler.
// Ayarlar › YouTube kapağı ile kapak penceresi aynı bileşenleri kullanır.
import React, { useRef, useState } from "react";
import { Field, Icon } from "../../../../components/ui";
import { ACCENT_MODES, COVER_FIELDS, COVER_TEMPLATES } from "../../../../lib/studio/cover/model";
import CoverPreview from "./CoverPreview";
import { shrinkBackground } from "./coverStore";

export function TemplatePicker({ data, settings, onPick, thumbWidth = 220 }) {
  return (
    <div className="yc-templates" role="radiogroup" aria-label="Kapak şablonu">
      {COVER_TEMPLATES.map((t) => (
        <button key={t.key} type="button" role="radio" aria-checked={settings.template === t.key}
          className={`yc-tpl ${settings.template === t.key ? "is-on" : ""}`} onClick={() => onPick(t.key)} title={t.hint}>
          <CoverPreview data={data} settings={{ ...settings, template: t.key }} width={thumbWidth} title={`${t.label} önizlemesi`} />
          <span className="yc-tpl__label">{settings.template === t.key && <Icon name="check" size={12} />} {t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function CoverOptions({ settings, set, toast, compact = false }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState("");
  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { set({ background: await shrinkBackground(file) }); } catch (err) { toast?.(err?.message || "Görsel eklenemedi.", { tone: "error" }); }
  };
  const useUrl = () => {
    const v = url.trim();
    if (!/^https?:\/\//i.test(v)) { toast?.("Görsel adresi http(s):// ile başlamalı.", { tone: "warn" }); return; }
    set({ background: v }); setUrl("");
  };
  return (
    <div className={`yc-options ${compact ? "is-compact" : ""}`}>
      <Field label="Renkler">
        <div className="st-seg" role="radiogroup" aria-label="Kapak renkleri">
          {ACCENT_MODES.map((m) => <button key={m.key} type="button" role="radio" aria-checked={settings.accentMode === m.key} className={settings.accentMode === m.key ? "is-on" : ""} onClick={() => set({ accentMode: m.key })} title={m.hint}>{m.label}</button>)}
        </div>
      </Field>
      {settings.accentMode === "custom" && (
        <Field label="Aksan rengi">
          <span className="yc-color"><input type="color" value={settings.customColor} onChange={(e) => set({ customColor: e.target.value })} aria-label="Aksan rengi" /> <code>{settings.customColor}</code></span>
        </Field>
      )}
      {settings.accentMode === "team" && <p className="st-hint yc-note">Takım renkleri armalardaki baskın renkten alınır; arma yoksa Grafikler › Marka'daki takım renkleri kullanılır.</p>}

      <Field label="Görünecek bilgiler">
        <div className="st-chips">
          {COVER_FIELDS.map((f) => (
            <button key={f.key} type="button" className={`st-chip ${settings.show[f.key] ? "is-on" : ""}`} aria-pressed={settings.show[f.key]} onClick={() => set({ show: { [f.key]: !settings.show[f.key] } })}>
              {settings.show[f.key] ? "✓ " : ""}{f.label}
            </button>
          ))}
        </div>
      </Field>
      {settings.show.live && (
        <Field label="Rozet yazısı">
          <input value={settings.liveLabel} maxLength={16} onChange={(e) => set({ liveLabel: e.target.value })} placeholder="CANLI" style={{ maxWidth: 180 }} />
        </Field>
      )}

      {!compact && (
        <Field label="Zemin fotoğrafı (isteğe bağlı)" hint="Şablonun zemini fotoğrafın üstüne saydam olarak biner. 1280×720'e kırpılır.">
          <div className="yc-bg">
            {settings.background
              ? <img src={settings.background} alt="" className="yc-bg__thumb" />
              : <span className="yc-bg__thumb is-empty"><Icon name="image" size={16} /></span>}
            <div className="yc-bg__ctl">
              <div className="st-row">
                <button type="button" className="btn btn--xs" onClick={() => fileRef.current?.click()}><Icon name="upload" size={11} /> Bilgisayardan seç</button>
                {settings.background && <button type="button" className="btn btn--xs btn--ghost" onClick={() => set({ background: null })}><Icon name="trash" size={11} /> Kaldır</button>}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickFile} />
              </div>
              <div className="st-row">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ya da görsel adresi (https://…)" spellCheck={false} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); useUrl(); } }} />
                <button type="button" className="btn btn--xs" disabled={!url.trim()} onClick={useUrl}>Kullan</button>
              </div>
              {settings.background && (
                <label className="yc-range">Şablon katmanı · %{settings.backgroundDim}
                  <input type="range" min={0} max={95} step={5} value={settings.backgroundDim} onChange={(e) => set({ backgroundDim: Number(e.target.value) })} />
                </label>
              )}
            </div>
          </div>
        </Field>
      )}
    </div>
  );
}
