// Panorama rejisi · TEMA STÜDYOSU: hazır temalar (gerçek çizimle küçük resim galerisi, gruplu), marka
// profillerim, CANLI ÖNİZLEME (örnek program karesi: zemin + hareket, çerçeveler, künye, kart, alt yazı,
// bant, saat, rozet — temanın kendi çizicileriyle, animasyonlu) ve her ayrıntının değiştiği düzenleyici:
// kimlik (ad, başlık, logolar, logodan palet), 8 renk, yazı tipleri (uygulamayla gelen 15 aile + bu
// bilgisayardakiler), zemin / doku / hareket, kamera çerçevesi, alt yazı bandı, kayan bant, saat, CANLI
// rozeti, köşe logosu, yazı biçimi, hareket ve yumuşatma, içerik kartı, künye, tam ekran başlık.
// Hazır tema düzenlenmeye başlanınca kopyası oluşur (asıl tema salt okunur). Kopyala / çoğalt / sil /
// dışa-içe aktar (JSON; logolar gömülü) / bölümü temaya döndür.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, useToast } from "../../../../components/ui";
import {
  ANIMS, BUILTIN_BRANDS, HEADER_STYLES, NAME_STYLES, THEMES, applyThemeToBrand, copyBrand, exportBrands, normalizeBrand, paletteFromPixels, parseBrandFile,
} from "../../../../lib/studio/panorama/brands";
import { THEME_GROUPS } from "../../../../lib/studio/panorama/themeCatalog";
import { EDITOR_SECTIONS } from "../../../../lib/studio/panorama/themeSchema";
import { BUNDLED_FONT_NAMES } from "../../../../lib/studio/fonts";
import { LogoField, imageToData, useSystemFonts } from "../BrandPanel";
import { clearThumb, demoSnapshot, drawDemoFrame, themeThumb } from "./themePreview";
import { useRegi } from "./RegiCtx";

const COLOR_LABELS = [["primary", "Ana renk"], ["secondary", "İkincil"], ["accent", "Vurgu"], ["accent2", "2. vurgu"], ["text", "Metin"], ["background", "Zemin"], ["panel", "Kart / panel"], ["live", "CANLI rozeti"]];

function Thumb({ brand }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let dead = false;
    const h = (window.requestIdleCallback || ((f) => setTimeout(f, 30)))(() => { if (!dead) setSrc(themeThumb(brand)); });
    return () => { dead = true; (window.cancelIdleCallback || clearTimeout)(h); };
  }, [brand]);
  return src ? <img src={src} alt="" /> : <i className="pr-thumb__ph" style={{ background: `linear-gradient(135deg, ${brand.colors.background}, ${brand.colors.primary})` }} />;
}

/** Canlı önizleme: örnek program karesi ~20 kare/sn (alt yazı her 6 sn'de bir girer / çıkar). */
function LivePreview({ brand }) {
  const ref = useRef(null);
  const brandRef = useRef(brand);
  brandRef.current = brand;
  useEffect(() => {
    let raf = 0; let last = 0;
    const t0 = performance.now();
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 50) return;
      last = t;
      const c = ref.current;
      if (!c || c.offsetParent === null) return;
      const b = brandRef.current;
      const el = (t - t0) % 6000;
      const now = Date.now();
      const snap = demoSnapshot(b);
      // Alt yazı döngüsü: 0–4,4 sn görünür, sonra çıkış hareketi.
      snap.panorama.lower = { ...snap.panorama.lower, at: now - el, hideAt: el > 4400 ? now - (el - 4400) : null };
      try { drawDemoFrame(c.getContext("2d"), b, c.width, c.height, { now, snap }); } catch { /* yoksay */ }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pr-live" width={960} height={540} data-theme-preview="" />;
}

function Field({ def, value, onChange }) {
  const [key, label, type, opts] = def;
  if (type === "select") return <label className="field pn-mini"><span>{label}</span><select className="input" value={String(value)} onChange={(e) => onChange(typeof value === "number" ? Number(e.target.value) : e.target.value)} data-tfield={key}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>;
  if (type === "range") { const [min, max, step] = opts; return <label className="field pn-mini pn-range"><span>{label} <b>{Number(value).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-tfield={key} /></label>; }
  if (type === "check") return <label className="pn-check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} data-tfield={key} /> {label}</label>;
  return <label className="field pn-mini"><span>{label}</span><input className="input" value={value ?? ""} maxLength={opts || 40} onChange={(e) => onChange(e.target.value)} data-tfield={key} /></label>;
}

const TABS = [["kimlik", "Kimlik ve renk"], ["bg", "Zemin"], ["frame", "Çerçeve"], ["lower", "Alt yazı"], ["ticker", "Bant"], ["clock", "Saat · rozet · logo"], ["fonts", "Yazı · hareket"], ["card", "Kart · künye"]];
const TAB_SECTIONS = { bg: ["bg"], frame: ["frame"], lower: ["lower"], ticker: ["ticker"], clock: ["clock", "live", "watermark"], fonts: ["fonts", "anim"], card: ["card", "titleCard"] };

export default function ThemeStudio() {
  const R = useRegi();
  const toast = useToast();
  const sysFonts = useSystemFonts();
  const { brands, setBrands, selectBrand } = R;
  const active = R.brand;
  const userActive = brands.some((b) => b.id === active.id);
  const [tab, setTab] = useState("kimlik");
  const [group, setGroup] = useState("hepsi");
  /** Değişiklik: hazır temadaysa önce kopyası oluşur (asıl tema salt okunur). */
  const edit = (fn) => {
    const base = userActive ? active : copyBrand(active, `${active.name} · özel`);
    const next = normalizeBrand({ ...fn(base), id: base.id, savedAt: Date.now() });
    clearThumb(next.id);
    if (userActive) setBrands(brands.map((b) => (b.id === next.id ? next : b)));
    else { setBrands([...brands, next]); selectBrand(next.id); toast(`Hazır tema salt okunur: “${next.name}” kopyası oluşturuldu ve düzenleniyor.`, { tone: "info", timeout: 3500 }); }
  };
  const setIn = (k, patch) => edit((b) => ({ ...b, [k]: { ...b[k], ...patch } }));
  const resetSection = (k) => edit((b) => { const n = { ...b }; delete n[k]; return n; });
  const palette = async (src) => {
    try {
      const r = await imageToData(src, 256);
      if (!r.pixels) { toast("Bu görselden renk okunamadı.", { tone: "warn" }); return; }
      const p = paletteFromPixels(r.pixels);
      edit((b) => ({ ...b, colors: { ...b.colors, primary: p.primary, secondary: p.secondary, accent: p.accent, background: p.background, text: p.text } }));
    } catch (e) { toast(e?.message || "Palet çıkarılamadı.", { tone: "error" }); }
  };
  const duplicate = () => { const b = copyBrand(active, `${active.name} (kopya)`); setBrands([...brands, b]); selectBrand(b.id); toast(`“${b.name}” oluşturuldu.`, { tone: "success", timeout: 2000 }); };
  const remove = async () => {
    if (!userActive || !(await R.ask({ title: "Profili sil", message: `“${active.name}” silinsin mi?`, confirmLabel: "Sil", danger: true }))) return;
    setBrands(brands.filter((b) => b.id !== active.id));
    selectBrand(BUILTIN_BRANDS[0].id);
  };
  const doExport = async (all) => {
    const list = all ? brands : userActive ? [active] : [copyBrand(active, active.name)];
    if (!list.length) { toast("Dışa aktarılacak profil yok.", { tone: "warn" }); return; }
    const file = exportBrands(list, { presets: all ? R.presetData.list : [] });
    const name = all ? "elitlig-panorama-temalar.json" : `${active.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "tema"}.elitlig-tema.json`;
    const r = await window.elitlig?.files?.save?.(name, JSON.stringify(file, null, 1), [{ name: "Elitlig tema dosyası", extensions: ["json"] }]);
    if (r?.ok) toast(`Dışa aktarıldı: ${r.path}`, { tone: "success", timeout: 4000 });
  };
  const doImport = async () => {
    const r = await window.elitlig?.files?.open?.([{ name: "Elitlig tema dosyası", extensions: ["json"] }]);
    if (!r?.ok) return;
    const res = parseBrandFile(new TextDecoder("utf-8").decode(r.data), brands);
    if (res.errors.length) { toast(res.errors[0], { tone: "error" }); return; }
    setBrands([...brands, ...res.brands]);
    if (res.presets.length) R.importPresets?.(res.presets);
    if (res.brands[0]) selectBrand(res.brands[0].id);
    toast(`${res.brands.length} tema içe aktarıldı.`, { tone: "success", timeout: 3000 });
  };
  const themes = useMemo(() => BUILTIN_BRANDS.filter((b) => group === "hepsi" || THEMES.find((t) => t.key === b.theme)?.group === group), [group]);
  const fontOpts = useMemo(() => [["", "Temanın yazı tipi"], ...BUNDLED_FONT_NAMES.map((f) => [f, `${f} · uygulamayla gelir`]), ...sysFonts.filter((f) => !BUNDLED_FONT_NAMES.includes(f)).map((f) => [f, f])], [sysFonts]);
  const b = active;
  return (
    <div className="pr-theme" data-panel="tema">
      <aside className="pr-theme__gallery">
        <nav className="pr-subtabs is-wrap">
          <button type="button" className={group === "hepsi" ? "is-on" : ""} onClick={() => setGroup("hepsi")}>Hepsi ({BUILTIN_BRANDS.length})</button>
          {THEME_GROUPS.map(([k, l]) => <button key={k} type="button" className={group === k ? "is-on" : ""} onClick={() => setGroup(k)} data-tgroup={k}>{l}</button>)}
        </nav>
        <div className="pr-thumbs">
          {themes.map((t) => (
            <button key={t.id} type="button" className={`pr-thumb ${b.id === t.id ? "is-on" : ""}`} onClick={() => selectBrand(t.id)} title={THEMES.find((x) => x.key === t.theme)?.hint} data-brand={t.id}>
              <Thumb brand={t} /><span>{t.name}</span>
            </button>
          ))}
        </div>
        <h4 className="pr-h">Marka profillerim / özel temalar ({brands.length})</h4>
        {brands.length ? <div className="pr-thumbs">{brands.map((t) => (
          <button key={t.id} type="button" className={`pr-thumb ${b.id === t.id ? "is-on" : ""}`} onClick={() => selectBrand(t.id)} data-brand={t.id}><Thumb brand={t} /><span>{t.name}</span></button>
        ))}</div> : <p className="st-hint">Bir temayı düzenlemeye başlayınca ya da “Kopyala” deyince burada görünür.</p>}
      </aside>
      <section className="pr-theme__main">
        <div className="pr-theme__head">
          <div><b>{b.name}</b><small>{userActive ? "Özel tema / marka profili — değişiklikler anında yayında" : "Hazır tema (salt okunur) — düzenleyince kopyası oluşur"}</small></div>
          <span className="st-top__spacer" />
          <button type="button" className="btn btn--xs btn--primary" onClick={duplicate} data-act="theme-dup"><Icon name="copy" size={11} /> {userActive ? "Çoğalt" : "Kopyala ve düzenle"}</button>
          {userActive && <button type="button" className="btn btn--xs" onClick={remove} data-act="theme-del"><Icon name="trash" size={11} /> Sil</button>}
          <button type="button" className="btn btn--xs" onClick={() => doExport(false)} title="Bu temayı (logolar gömülü) JSON olarak kaydet" data-act="theme-export"><Icon name="download" size={11} /> Dışa aktar</button>
          <button type="button" className="btn btn--xs" onClick={() => doExport(true)} disabled={!brands.length}>Tümü</button>
          <button type="button" className="btn btn--xs" onClick={doImport} data-act="theme-import"><Icon name="upload" size={11} /> İçe aktar</button>
        </div>
        <LivePreview brand={b} />
        <nav className="pr-subtabs is-wrap">{TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)} data-ttab={k}>{l}</button>)}</nav>
        <div className="pr-theme__ed" key={b.id}>
          {tab === "kimlik" && (
            <>
              <div className="pn-row2">
                <label className="field pn-mini"><span>Ad</span><input className="input" value={b.name} maxLength={60} onChange={(e) => edit((x) => ({ ...x, name: e.target.value }))} data-field="brand-name" /></label>
                <label className="field pn-mini"><span>Program başlığı (künye)</span><input className="input" value={b.title} maxLength={60} placeholder="ör. KUPA GECESİ" onChange={(e) => edit((x) => ({ ...x, title: e.target.value }))} data-field="brand-title" /></label>
              </div>
              <label className="field pn-mini"><span>Temel tema (renk ve stiller buradan; kimlik korunur)</span>
                <select className="input" value={b.theme} onChange={(e) => edit((x) => applyThemeToBrand(x, e.target.value))}>{THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
              </label>
              <LogoField label="Logo" value={b.logo} onChange={(logo) => edit((x) => ({ ...x, logo }))} onPalette={palette} toast={toast} />
              <LogoField label="İkinci logo / sponsor logosu" value={b.logo2} onChange={(logo2) => edit((x) => ({ ...x, logo2 }))} toast={toast} />
              <div className="pn-colors pr-colors">{COLOR_LABELS.map(([k, l]) => (
                <label key={k} className="pn-color"><input type="color" value={b.colors[k] || "#000000"} onChange={(e) => edit((x) => ({ ...x, colors: { ...x.colors, [k]: e.target.value } }))} data-color={k} /><span>{l}</span><code>{b.colors[k]}</code></label>
              ))}</div>
              <div className="pn-row2">
                <label className="field pn-mini"><span>Başlık yazı tipi</span><select className="input" value={b.fonts.display} onChange={(e) => setIn("fonts", { display: e.target.value })} data-field="font-display">{fontOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field pn-mini"><span>Metin yazı tipi</span><select className="input" value={b.fonts.body} onChange={(e) => setIn("fonts", { body: e.target.value })} data-field="font-body">{fontOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              </div>
              <p className="pr-fontprev" style={{ fontFamily: `"${b.fonts.display || "Barlow Condensed"}"`, fontWeight: b.fonts.weight }}>ELİTLİG PANORAMA · Ğğ Şş İı Çç Öö Üü 2-1</p>
            </>
          )}
          {TAB_SECTIONS[tab]?.map((sk) => {
            const sec = EDITOR_SECTIONS.find((s) => s.key === sk);
            if (!sec) return null;
            return (
              <section key={sk} className="pr-sec" data-tsection={sk}>
                <h4 className="pr-h"><Icon name={sec.icon} size={12} /> {sec.label}<span className="st-top__spacer" /><button type="button" className="btn btn--xs" onClick={() => resetSection(sk)} title="Bu bölümü temanın varsayılanına döndür">Temaya döndür</button></h4>
                <div className="pr-fields">{sec.fields.map((f) => <Field key={f[0]} def={f} value={b[sk]?.[f[0]]} onChange={(v) => setIn(sk, { [f[0]]: v })} />)}</div>
              </section>
            );
          })}
          {tab === "fonts" && (
            <div className="pn-row2">
              <label className="field pn-mini"><span>Kart girişi</span><select className="input" value={b.anim.in} onChange={(e) => setIn("anim", { in: e.target.value })} data-tfield="in">{ANIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field pn-mini"><span>Kart çıkışı</span><select className="input" value={b.anim.out} onChange={(e) => setIn("anim", { out: e.target.value })}>{ANIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
          )}
          {tab === "card" && (
            <>
              <div className="pn-row2">
                <label className="field pn-mini"><span>Künye (üst logo + başlık)</span><select className="input" value={b.header.style} onChange={(e) => setIn("header", { style: e.target.value })}>{HEADER_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field pn-mini"><span>Künye alt yazısı</span><input className="input" value={b.header.tagline} maxLength={60} onChange={(e) => setIn("header", { tagline: e.target.value })} /></label>
              </div>
              <label className="field pn-mini"><span>Kamera isim bandı</span><select className="input" value={b.names.style} onChange={(e) => setIn("names", { style: e.target.value })}>{NAME_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
