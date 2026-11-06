// Yayın grafikleri · MARKA & TEMA düzenleyici (web OverlayBrandingPanel'in
// masaüstü karşılığı + masaüstü ekleri). Taslak stüdyo programında anında
// görünür; "Kaydet" maçın kaydına (PUT overlay-branding) ve web kaplamalarına yazar.
import React, { useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import {
  FONT_SCALE_MAX, FONT_SCALE_MIN, LOGO_POSITIONS, LOGO_SCALE_MAX, LOGO_SCALE_MIN, OVERLAY_FONTS, OVERLAY_THEMES,
  normalizeLogoUrl, resolveThemeColors, themeSwatches,
} from "../../../lib/studio/graphics/branding";
import GraphicsPreview from "./GraphicsPreview";
import { pickAndUploadImage } from "./graphicsApi";

const Swatches = ({ design }) => {
  const sw = themeSwatches(design);
  return <span className="gx-swatches" aria-hidden="true">{[sw.deep, sw.base, sw.surface, sw.accent, sw.light].map((c, i) => <i key={i} style={{ background: c }} />)}</span>;
};

export default function BrandingEditor({ g, live }) {
  const toast = useToast();
  const b = g.brand;
  const draft = b.branding;
  const [screen, setScreen] = useState("scoreboard");
  const [linked, setLinked] = useState(true);
  const [logoText, setLogoText] = useState("");
  const [uploading, setUploading] = useState(false);
  const design = draft[screen];

  const setDesign = (patch) => {
    if (linked) b.update({ scoreboard: patch, led: patch });
    else b.update({ [screen]: patch });
  };
  const setLogo = (url) => { b.update({ logoUrl: url }); setLogoText(""); };
  const upload = async () => {
    setUploading(true);
    const res = await pickAndUploadImage();
    setUploading(false);
    if (res.ok) { setLogo(res.url); toast("Logo yüklendi; yayına almak için Kaydet.", { tone: "success" }); } else if (!res.cancelled) toast(res.error?.message || "Logo yüklenemedi.", { tone: "error" });
  };
  const applyUrl = (e) => {
    e.preventDefault();
    const url = normalizeLogoUrl(logoText);
    if (!url) { toast("Logo adresi http(s) ile başlamalı.", { tone: "warn" }); return; }
    setLogo(url);
  };
  const custom = design.theme === "custom";
  const colors = resolveThemeColors(design);

  return (
    <div className="gx-brand">
      <div className="gx-brand__form">
        <fieldset className="mg-box">
          <legend>Logo ve marka adı</legend>
          <div className="gx-logo">
            <span className="gx-logo__img">{draft.logoUrl ? <img src={draft.logoUrl} alt="" /> : <span className="mg-muted">ElitLig</span>}</span>
            <div className="mg-stack mg-grow">
              <div className="mg-inline mg-wrap">
                <button type="button" className="btn btn--sm" onClick={upload} disabled={uploading}><Icon name="upload" size={13} /> {uploading ? "Yükleniyor…" : "Bilgisayardan yükle"}</button>
                <button type="button" className={`btn btn--sm${!draft.logoUrl ? " is-on" : ""}`} onClick={() => setLogo(null)}>ElitLig logosu</button>
                {live?.logos?.home && <button type="button" className="btn btn--sm" onClick={() => setLogo(live.logos.home)} title={live.homeName}>Ev sahibi arması</button>}
                {live?.logos?.away && <button type="button" className="btn btn--sm" onClick={() => setLogo(live.logos.away)} title={live.awayName}>Deplasman arması</button>}
              </div>
              <form className="mg-inline" onSubmit={applyUrl}>
                <input className="mg-grow" value={logoText} onChange={(e) => setLogoText(e.target.value)} placeholder={draft.logoUrl || "https://… (logo adresi yapıştır)"} />
                <button type="submit" className="btn btn--sm" disabled={!logoText.trim()}>Kullan</button>
              </form>
            </div>
          </div>
          <div className="mg-inline mg-wrap">
            <label className="mg-field mg-grow"><span>Marka yazısı</span>
              <input value={draft.brandName || ""} maxLength={40} placeholder="ELİT LİG" onChange={(e) => b.update({ brandName: e.target.value || null })} />
            </label>
            <label className="mg-field"><span>Logo yeri</span>
              <select value={draft.extras.logoPosition} onChange={(e) => b.update({ extras: { logoPosition: e.target.value } })}>
                {LOGO_POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          </div>
          <label className="mg-field"><span>Logo boyutu · %{design.logoScale}</span>
            <input type="range" min={LOGO_SCALE_MIN} max={LOGO_SCALE_MAX} step={5} value={design.logoScale} onChange={(e) => setDesign({ logoScale: Number(e.target.value) })} />
          </label>
        </fieldset>

        <fieldset className="mg-box">
          <legend>Tema</legend>
          <div className="mg-inline mg-wrap">
            <div className="seg seg--sm">
              <button type="button" className={screen === "scoreboard" ? "is-active" : ""} onClick={() => setScreen("scoreboard")}>Skorboard / grafikler</button>
              <button type="button" className={screen === "led" ? "is-active" : ""} onClick={() => setScreen("led")}>LED ekran</button>
            </div>
            <label className="mg-check"><input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} /> İkisi aynı</label>
          </div>
          <div className="gx-themes">
            {OVERLAY_THEMES.map((t) => (
              <button key={t.key} type="button" className={`gx-theme${design.theme === t.key ? " is-on" : ""}`} onClick={() => setDesign({ theme: t.key })}>
                <Swatches design={{ ...design, theme: t.key }} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          {custom && (
            <div className="mg-inline mg-wrap">
              <label className="mg-field"><span>Zemin rengi</span><input type="color" value={design.baseColor || colors?.base || "#300030"} onChange={(e) => setDesign({ baseColor: e.target.value })} /></label>
              <label className="mg-field"><span>Vurgu rengi</span><input type="color" value={design.accentColor || colors?.accent || "#54009c"} onChange={(e) => setDesign({ accentColor: e.target.value })} /></label>
            </div>
          )}
          <div className="mg-inline mg-wrap">
            <label className="mg-field mg-grow"><span>Yazı tipi</span>
              <select value={design.font} onChange={(e) => setDesign({ font: e.target.value })}>
                {OVERLAY_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label className="mg-field"><span>Yazı rengi</span><input type="color" value={draft.extras.textColor} onChange={(e) => b.update({ extras: { textColor: e.target.value } })} /></label>
            <label className="mg-field"><span>Ev şeridi</span><input type="color" value={draft.extras.homeColor || "#8a6cf0"} onChange={(e) => b.update({ extras: { homeColor: e.target.value } })} /></label>
            <label className="mg-field"><span>Deplasman şeridi</span><input type="color" value={draft.extras.awayColor || "#f06c8a"} onChange={(e) => b.update({ extras: { awayColor: e.target.value } })} /></label>
            {(draft.extras.homeColor || draft.extras.awayColor) && <button type="button" className="btn btn--xs btn--ghost" onClick={() => b.update({ extras: { homeColor: null, awayColor: null } })}>Şerit renklerini sıfırla</button>}
          </div>
          <label className="mg-field"><span>Yazı boyutu · %{draft.extras.fontScale}</span>
            <input type="range" min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={5} value={draft.extras.fontScale} onChange={(e) => b.update({ extras: { fontScale: Number(e.target.value) } })} />
          </label>
          <p className="mg-muted mg-small">Yazı rengi, yazı boyutu, logo yeri ve şerit renkleri yalnız stüdyo programına uygulanır (web kaplamaları tema, yazı tipi ve logo boyutunu kullanır).</p>
        </fieldset>
      </div>

      <div className="gx-brand__side">
        <GraphicsPreview snapshot={g.snapshot} width={360} fps={4} title="Programdaki görünüm (taslak)" />
        <GraphicsPreview snapshot={g.snapshot} variant="pre_match" isolate width={360} fps={1} delay={150} title="Maç öncesi kartı (taslak)" />
        <div className="mg-inline mg-end">
          {b.dirty && <span className="pill pill--xs pill--amber">Kaydedilmedi</span>}
          <button type="button" className="btn btn--sm btn--ghost" disabled={!b.dirty || b.saving} onClick={b.revert}>Geri al</button>
          <button type="button" className="btn btn--sm btn--primary" disabled={!b.dirty || b.saving} onClick={() => b.save()}><Icon name="check" size={13} /> Bu maça kaydet (web dahil)</button>
        </div>
        <p className="mg-muted mg-small">Değişiklikler yalnız bu maça (#{g.matchId}) yazılır; diğer maçların görünümü değişmez.</p>
        {b.error && <p className="mg-error">{b.error}</p>}
      </div>
    </div>
  );
}
