// Panorama · MARKA PROFİLLERİ paneli — farklı markaların yayınları için logo, renk paleti, yazı
// tipleri, kart / künye / bant / saat stilleri, animasyon ve filigran. Profil seçimi yayında da
// anında uygulanır. Kopyala / yeniden adlandır / sil / dışa-içe aktar (JSON, logolar gömülü).
import React, { useEffect, useMemo, useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import {
  ANIMS, BUILTIN_BRANDS, BUILTIN_FONTS, CLOCK_STYLES, COMMON_SYSTEM_FONTS, HEADER_STYLES, NAME_STYLES, THEMES, TICKER_STYLES, WATERMARK_POS,
  applyThemeToBrand, copyBrand, exportBrands, normalizeBrand, paletteFromPixels, parseBrandFile,
} from "../../../lib/studio/panorama/brands";

/* ─────────────────────────── görsel yardımcıları ─────────────────────────── */

/** Görseli yükler (web adresi masaüstü medya vekilinden: tuval kirlenmez). */
export function loadImg(src) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Görsel açılamadı."));
    el.src = /^https?:/i.test(src) && window.elitlig ? `elitlig-media://m/${encodeURIComponent(src)}` : src;
  });
}
/** Küçültülmüş gömülü veri (data: adresi; saydamlık korunur) + palet pikselleri. */
export async function imageToData(src, max = 640) {
  const el = await loadImg(src);
  const w0 = el.naturalWidth || el.width; const h0 = el.naturalHeight || el.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext("2d");
  ctx.drawImage(el, 0, 0, c.width, c.height);
  let data = c.toDataURL("image/webp", 0.9);
  if (!/^data:image\/webp/.test(data)) data = c.toDataURL("image/png");
  const s = document.createElement("canvas"); s.width = 64; s.height = 64;
  const sx = s.getContext("2d");
  sx.drawImage(el, 0, 0, 64, 64);
  let pixels = null;
  try { pixels = sx.getImageData(0, 0, 64, 64).data; } catch { pixels = null; }
  return { data, pixels, width: c.width, height: c.height };
}

/** Yazı tipi bu bilgisayarda yüklü mü (tuvalde iki yedek yazı tipine göre ölçü farkı). */
export function fontAvailable(name) {
  try {
    const c = document.createElement("canvas").getContext("2d");
    const probe = "mmmmmmmmmmlli WQ 0123 ğüşİÇ";
    return ["monospace", "serif"].every((fb) => { c.font = `72px ${fb}`; const a = c.measureText(probe).width; c.font = `72px "${name}", ${fb}`; return Math.abs(c.measureText(probe).width - a) > 0.5; });
  } catch { return false; }
}
export function useSystemFonts() {
  const [list, setList] = useState(() => [...BUILTIN_FONTS]);
  useEffect(() => {
    let dead = false;
    (async () => {
      const names = new Set(COMMON_SYSTEM_FONTS);
      try { const r = await window.elitlig?.studio?.panorama?.fonts?.(); for (const f of r?.fonts || []) names.add(f); } catch { /* yoksay */ }
      try { if (typeof window.queryLocalFonts === "function") for (const f of await window.queryLocalFonts()) names.add(f.family); } catch { /* izin yok */ }
      const ok = [...names].filter((n) => !BUILTIN_FONTS.includes(n) && fontAvailable(n)).sort((a, b) => a.localeCompare(b, "tr"));
      if (!dead) setList([...BUILTIN_FONTS, ...ok]);
    })();
    return () => { dead = true; };
  }, []);
  return list;
}

/* ─────────────────────────────── bileşenler ─────────────────────────────── */

const Sel = ({ label, value, options, onChange }) => (
  <label className="field pn-mini"><span>{label}</span>
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  </label>
);
const Range = ({ label, value, min, max, step = 1, onChange, unit = "" }) => (
  <label className="field pn-mini pn-range"><span>{label} <b>{value}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>
);
const COLOR_LABELS = [["primary", "Ana renk"], ["secondary", "İkincil"], ["accent", "Vurgu"], ["text", "Metin"], ["background", "Arka plan"], ["panel", "Kart zemini"]];

export function Swatch({ b }) {
  const c = b.colors;
  return <i className="pn-swatch" style={{ background: `linear-gradient(135deg, ${c.background} 0 40%, ${c.primary} 40% 70%, ${c.accent} 70% 85%, ${c.panel} 85%)` }} />;
}

export function LogoField({ label, value, onChange, onPalette, toast }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async (src, name, keepUrl) => {
    setBusy(true);
    try {
      const r = await imageToData(src);
      onChange({ data: r.data, url: keepUrl || null, name }, r.pixels);
    } catch (e) { toast(e?.message || "Görsel açılamadı.", { tone: "error" }); } finally { setBusy(false); }
  };
  const pick = async () => {
    const r = await window.elitlig?.studio?.media?.pick?.({ kind: "image" });
    const f = r?.files?.[0];
    if (!f) { if (r?.error) toast(r.error.message, { tone: "error" }); return; }
    apply(f.url, f.name, f.url);
  };
  const src = value?.data || value?.url || null;
  return (
    <div className="pn-logo">
      <span className="pn-logo__lbl">{label}</span>
      <div className="pn-logo__row">
        <span className="pn-logo__pic">{src ? <img src={src} alt="" /> : <Icon name="image" size={18} />}</span>
        <button type="button" className="btn btn--sm" onClick={pick} disabled={busy} data-act="logo-file"><Icon name="folder" size={12} /> Dosyadan</button>
        {value && <button type="button" className="icon-btn" onClick={() => onChange(null)} title="Kaldır"><Icon name="trash" size={12} /></button>}
        {value && onPalette && <button type="button" className="btn btn--sm" onClick={() => onPalette(src)} title="Logodan otomatik palet" data-act="palette"><Icon name="palette" size={12} /> Palet çıkar</button>}
      </div>
      <div className="pn-row2">
        <input className="input" placeholder="ya da web adresi (https://…/logo.png)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className="btn btn--sm" disabled={!/^https?:\/\//i.test(url) || busy} onClick={() => apply(url.trim(), url.trim().split("/").pop(), url.trim())}>Getir</button>
      </div>
      {value?.name && <small className="st-hint">{value.name}{value.url && /^elitlig-studio:/.test(value.url) ? " · yerel dosya" : ""}</small>}
    </div>
  );
}

function BrandEditor({ brand, onChange, fonts, toast }) {
  const b = brand;
  const set = (patch) => onChange(normalizeBrand({ ...b, ...patch, savedAt: Date.now() }));
  const setIn = (k, patch) => set({ [k]: { ...b[k], ...patch } });
  const palette = async (src) => {
    try {
      const r = await imageToData(src, 256);
      if (!r.pixels) { toast("Bu görselden renk okunamadı.", { tone: "warn" }); return; }
      const p = paletteFromPixels(r.pixels);
      set({ colors: { ...b.colors, primary: p.primary, secondary: p.secondary, accent: p.accent, background: p.background, text: p.text } });
      toast(p.source === "logo" ? "Palet logodan çıkarıldı." : "Logo renksiz: güvenli bir palet önerildi.", { tone: "success", timeout: 2500 });
    } catch (e) { toast(e?.message || "Palet çıkarılamadı.", { tone: "error" }); }
  };
  const fontOpts = [["", "Tema varsayılanı"], ...fonts.map((f) => [f, f])];
  return (
    <div className="pn-brand-ed" data-brand-editor={b.id}>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Profil adı</span><input className="input" value={b.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} data-field="brand-name" /></label>
        <label className="field pn-mini"><span>Program başlığı (künye)</span><input className="input" value={b.title} maxLength={60} placeholder="ör. KUPA GECESİ" onChange={(e) => set({ title: e.target.value })} data-field="brand-title" /></label>
      </div>
      <Sel label="Temel tema" value={b.theme} options={THEMES.map((t) => [t.key, t.label])} onChange={(k) => onChange({ ...applyThemeToBrand(b, k), savedAt: Date.now() })} />
      <LogoField label="Logo" value={b.logo} onChange={(logo) => set({ logo })} onPalette={palette} toast={toast} />
      <LogoField label="İkinci logo / sponsor logosu" value={b.logo2} onChange={(logo2) => set({ logo2 })} toast={toast} />
      <div className="pn-field"><span>Renk paleti</span>
        <div className="pn-colors">{COLOR_LABELS.map(([k, l]) => (
          <label key={k} className="pn-color"><input type="color" value={b.colors[k]} onChange={(e) => set({ colors: { ...b.colors, [k]: e.target.value } })} data-color={k} /><span>{l}</span><code>{b.colors[k]}</code></label>
        ))}</div>
      </div>
      <div className="pn-row2">
        <Sel label="Başlık yazı tipi" value={b.fonts.display} options={fontOpts} onChange={(v) => setIn("fonts", { display: v })} />
        <Sel label="Metin yazı tipi" value={b.fonts.body} options={fontOpts} onChange={(v) => setIn("fonts", { body: v })} />
      </div>
      <h4>Kart stili</h4>
      <div className="pn-row2">
        <Range label="Köşe" value={b.card.radius} min={0} max={60} unit=" px" onChange={(v) => setIn("card", { radius: v })} />
        <Range label="Saydamlık" value={Math.round(b.card.opacity * 100)} min={30} max={100} unit="%" onChange={(v) => setIn("card", { opacity: v / 100 })} />
      </div>
      <div className="pn-row2">
        <Range label="Gölge" value={b.card.shadow} min={0} max={80} onChange={(v) => setIn("card", { shadow: v })} />
        <Range label="Kenarlık" value={b.card.border} min={0} max={8} unit=" px" onChange={(v) => setIn("card", { border: v })} />
      </div>
      <label className="pn-check"><input type="checkbox" checked={b.card.glass} onChange={(e) => setIn("card", { glass: e.target.checked })} /> Cam efekti (yarı saydam, parlak üst kenar)</label>
      <h4>Künye, isim bandı, alt bant, saat</h4>
      <div className="pn-row2">
        <Sel label="Künye (üst logo + başlık)" value={b.header.style} options={HEADER_STYLES} onChange={(v) => setIn("header", { style: v })} />
        <label className="field pn-mini"><span>Künye alt yazısı</span><input className="input" value={b.header.tagline} maxLength={60} onChange={(e) => setIn("header", { tagline: e.target.value })} /></label>
      </div>
      <div className="pn-row2">
        <Sel label="Kamera isim bandı" value={b.names.style} options={NAME_STYLES} onChange={(v) => setIn("names", { style: v })} />
        <Sel label="Alt bant" value={b.ticker.style} options={TICKER_STYLES} onChange={(v) => setIn("ticker", { style: v })} />
      </div>
      <div className="pn-row2">
        <Sel label="Saat" value={b.clock.style} options={CLOCK_STYLES} onChange={(v) => setIn("clock", { style: v })} />
        <label className="field pn-mini"><span>Bant etiketi</span><input className="input" value={b.ticker.label} maxLength={24} placeholder="(Görünüm sekmesindeki)" onChange={(e) => setIn("ticker", { label: e.target.value })} /></label>
      </div>
      <h4>Giriş / çıkış animasyonu</h4>
      <div className="pn-row2">
        <Sel label="Kart girişi" value={b.anim.in} options={ANIMS} onChange={(v) => setIn("anim", { in: v })} />
        <Sel label="Kart çıkışı" value={b.anim.out} options={ANIMS} onChange={(v) => setIn("anim", { out: v })} />
      </div>
      <Range label="Süre" value={b.anim.ms} min={150} max={2000} step={10} unit=" ms" onChange={(v) => setIn("anim", { ms: v })} />
      <h4>Filigran / köşe logosu</h4>
      <div className="pn-row2">
        <Sel label="Konum" value={b.watermark.pos} options={WATERMARK_POS} onChange={(v) => setIn("watermark", { pos: v })} />
        <Sel label="Logo" value={b.watermark.which} options={[["logo", "Ana logo"], ["logo2", "İkinci logo"]]} onChange={(v) => setIn("watermark", { which: v })} />
      </div>
      <div className="pn-row2">
        <Range label="Boy" value={b.watermark.size} min={40} max={400} unit=" px" onChange={(v) => setIn("watermark", { size: v })} />
        <Range label="Saydamlık" value={Math.round(b.watermark.opacity * 100)} min={10} max={100} unit="%" onChange={(v) => setIn("watermark", { opacity: v / 100 })} />
      </div>
    </div>
  );
}

/**
 * brands: kullanıcı profilleri; activeId: pano.brandId; onSelect(id); setBrands(list).
 * presets: dışa aktarmaya eklenecek hazır ayarlar (isteğe bağlı); onImportPresets(list).
 */
export default function BrandPanel({ brands, setBrands, activeId, onSelect, ask, presets = [], onImportPresets }) {
  const toast = useToast();
  const fonts = useSystemFonts();
  const active = useMemo(() => brands.find((b) => b.id === activeId) || BUILTIN_BRANDS.find((b) => b.id === activeId) || BUILTIN_BRANDS[0], [brands, activeId]);
  const userActive = brands.some((b) => b.id === active.id);
  const update = (b) => setBrands(brands.map((x) => (x.id === b.id ? b : x)));
  const create = (from) => {
    const b = copyBrand(from, from.builtin ? `Yeni marka (${from.name})` : undefined);
    setBrands([...brands, b]);
    onSelect(b.id);
    toast(`“${b.name}” profili oluşturuldu.`, { tone: "success", timeout: 2200 });
  };
  // Yeniden adlandırma: düzenleyicideki ad alanı (yazdıkça kaydedilir).
  const rename = () => {
    const el = document.querySelector('[data-field="brand-name"]');
    el?.focus(); el?.select?.();
  };
  const remove = async () => {
    if (!userActive) return;
    if (!(await ask({ title: "Profili sil", message: `“${active.name}” silinsin mi? Bu profili kullanan hazır ayarlar Elitlig klasik temasına döner.`, confirmLabel: "Sil", danger: true }))) return;
    setBrands(brands.filter((b) => b.id !== active.id));
    onSelect(BUILTIN_BRANDS[0].id);
  };
  const doExport = async (all) => {
    const list = all ? brands : userActive ? [active] : [];
    if (!list.length) { toast("Dışa aktarılacak kendi profilin yok (önce bir hazır temayı kopyala).", { tone: "warn" }); return; }
    const used = new Set(list.map((b) => b.id));
    const file = exportBrands(list, { presets: all ? presets : presets.filter((p) => used.has(p.brandId)) });
    const name = all ? "elitlig-panorama-markalar.json" : `${active.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "marka"}.elitlig-marka.json`;
    const r = await window.elitlig?.files?.save?.(name, JSON.stringify(file, null, 1), [{ name: "Elitlig marka dosyası", extensions: ["json"] }]);
    if (r?.ok) toast(`Dışa aktarıldı: ${r.path}`, { tone: "success", timeout: 4000 });
  };
  const doImport = async () => {
    const r = await window.elitlig?.files?.open?.([{ name: "Elitlig marka dosyası", extensions: ["json"] }]);
    if (!r?.ok) return;
    const text = new TextDecoder("utf-8").decode(r.data);
    const res = parseBrandFile(text, brands);
    if (res.errors.length) { toast(res.errors[0], { tone: "error" }); return; }
    setBrands([...brands, ...res.brands]);
    if (res.presets.length) onImportPresets?.(res.presets);
    if (res.brands[0]) onSelect(res.brands[0].id);
    toast(`${res.brands.length} marka profili${res.presets.length ? ` ve ${res.presets.length} hazır ayar` : ""} içe aktarıldı.`, { tone: "success", timeout: 3500 });
  };
  return (
    <div className="pn-brands">
      <p className="st-hint">Farklı markaların yayınları: logo, renkler, yazı tipleri ve stiller. Seçim yayın sırasında da anında uygulanır.</p>
      <h4>Hazır temalar ({BUILTIN_BRANDS.length})</h4>
      <div className="pn-brandgrid">{BUILTIN_BRANDS.map((b) => (
        <button key={b.id} type="button" className={`pn-brandbtn ${activeId === b.id ? "is-on" : ""}`} onClick={() => onSelect(b.id)} title={THEMES.find((t) => t.key === b.theme)?.hint} data-brand={b.id}><Swatch b={b} /><span>{b.name}</span></button>
      ))}</div>
      <h4>Marka profillerim</h4>
      {brands.length ? <div className="pn-brandgrid">{brands.map((b) => (
        <button key={b.id} type="button" className={`pn-brandbtn ${activeId === b.id ? "is-on" : ""}`} onClick={() => onSelect(b.id)} data-brand={b.id}>
          {b.logo?.data || b.logo?.url ? <img className="pn-brandbtn__logo" src={b.logo.data || b.logo.url} alt="" /> : <Swatch b={b} />}<span>{b.name}</span>
        </button>
      ))}</div> : <p className="st-hint">Henüz profil yok. Bir temayı seçip “Kopyala ve düzenle” ile başla.</p>}
      <div className="pn-brandbar">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => create(active)} data-act="brand-copy"><Icon name="copy" size={12} /> {active.builtin ? "Kopyala ve düzenle" : "Kopyala"}</button>
        {userActive && <button type="button" className="btn btn--sm" onClick={rename}><Icon name="pencil" size={12} /> Yeniden adlandır</button>}
        {userActive && <button type="button" className="btn btn--sm" onClick={remove}><Icon name="trash" size={12} /> Sil</button>}
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--sm" onClick={() => doExport(false)} disabled={!userActive} title="Seçili profili (logolar gömülü) JSON olarak kaydet" data-act="brand-export"><Icon name="download" size={12} /> Dışa aktar</button>
        <button type="button" className="btn btn--sm" onClick={() => doExport(true)} disabled={!brands.length} title="Tüm profiller + hazır ayarlar">Tümü</button>
        <button type="button" className="btn btn--sm" onClick={doImport} data-act="brand-import"><Icon name="upload" size={12} /> İçe aktar</button>
      </div>
      {userActive ? <BrandEditor key={active.id} brand={active} onChange={update} fonts={fonts} toast={toast} /> : <p className="st-hint">Hazır temalar salt okunurdur. Logo ve renkleri değiştirmek için kopyala.</p>}
    </div>
  );
}

