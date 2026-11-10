// Renk ve tasarım: barkod (Code 128 / EAN-13), toplu QR (CSV'den), logodan renk paleti, yazı tipi
// önizleyici, sosyal medya görsel boyutları. Mantık: ../lib/barcode.js, misc.js; QR: lib/studio/qr.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Segmented, useToast } from "../../../components/ui";
import { qrEncode, qrPath } from "../../../lib/studio/qr";
import { zipStore } from "../../../lib/sheets/xlsxExport";
import { useCopy, useStored } from "../toolkitUi";
import { barcodeSvg, code128, ean13 } from "../lib/barcode";
import { SOCIAL_SIZES, coverRect, extractPalette } from "../lib/misc";
import { parseCsv } from "../lib/textData";
import { Field } from "./common";

const fileSafe = (s) => String(s || "dosya").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);

/** SVG metni → PNG baytları (beyaz zemin). */
async function svgToPng(svg, width) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("SVG çizilemedi")); img.src = url; });
    const scale = width ? width / img.width : 2;
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

/* ------------------------------- barkod ------------------------------- */

export function BarcodeTool() {
  const toast = useToast();
  const [o, setO] = useStored("tt.barcode", { type: "code128", text: "ELITLIG-2026", height: 80, module: 2 });
  const set = (p) => setO({ ...o, ...p });
  const res = useMemo(() => { try { return { code: o.type === "ean13" ? ean13(o.text) : code128(o.text) }; } catch (e) { return { error: e.message }; } }, [o.type, o.text]);
  const svg = res.code ? barcodeSvg(res.code, { height: Number(o.height) || 80, module: Number(o.module) || 2 }) : "";
  const save = async (kind) => {
    const data = kind === "svg" ? svg : await svgToPng(svg, null);
    const r = await window.elitlig.files.save(`barkod-${fileSafe(res.code.text)}.${kind}`, data, [{ name: kind.toUpperCase(), extensions: [kind] }]);
    if (r?.ok) toast("Kaydedildi.", { tone: "success" });
  };
  const copyImage = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([await svgToPng(svg, null)], { type: "image/png" }) })]); toast("Barkod görseli kopyalandı.", { tone: "success" }); } catch { toast("Kopyalanamadı.", { tone: "error" }); }
  };
  return (
    <div className="tt">
      <Segmented value={o.type} onChange={(type) => set({ type, text: type === "ean13" ? "869000000000" : "ELITLIG-2026" })} size="sm" ariaLabel="Barkod türü" options={[{ value: "code128", label: "Code 128 (metin, kod)" }, { value: "ean13", label: "EAN-13 (ürün)" }]} />
      <div className="tt-cols3">
        <Field label={o.type === "ean13" ? "12 ya da 13 hane" : "Metin"}><input className="is-mono" value={o.text} onChange={(e) => set({ text: e.target.value })} aria-label="Barkod içeriği" /></Field>
        <Field label="Yükseklik"><input type="number" min="30" max="300" value={o.height} onChange={(e) => set({ height: e.target.value })} aria-label="Yükseklik" /></Field>
        <Field label="Çizgi kalınlığı"><input type="number" min="1" max="6" value={o.module} onChange={(e) => set({ module: e.target.value })} aria-label="Çizgi kalınlığı" /></Field>
      </div>
      {res.error ? <p className="tk-err">{res.error}</p> : <>
        <div className="tt-svg" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Barkod" />
        {o.type === "ean13" && <p className="tt-muted">Kontrol hanesi: {res.code.check} → {res.code.text}</p>}
        <div className="tt-row">
          <button type="button" className="btn btn--sm btn--primary" onClick={copyImage}><Icon name="copy" size={12} /> Görseli kopyala</button>
          <button type="button" className="btn btn--sm" onClick={() => save("png")}><Icon name="download" size={12} /> PNG</button>
          <button type="button" className="btn btn--sm" onClick={() => save("svg")}><Icon name="download" size={12} /> SVG</button>
        </div>
      </>}
    </div>
  );
}

/* ------------------------------- toplu QR ------------------------------- */

const QR_MARGIN = 4;
const qrSvg = (qr, px = 512) => { const n = qr.size + QR_MARGIN * 2; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${qrPath(qr, QR_MARGIN)}" fill="#000"/></svg>`; };

/** "Etiket;içerik" ya da yalnız içerik satırları (CSV / Excel yapıştırma). */
export function parseQrRows(text) {
  return parseCsv(text).map((r) => (r.length >= 2 ? { label: r[0].trim(), content: r.slice(1).join(",").trim() } : { label: r[0].trim(), content: r[0].trim() })).filter((r) => r.content);
}

export function QrBatchTool() {
  const toast = useToast();
  const [text, setText] = useStored("tt.qrbatch", "Kartallar;https://elitlig.com/takim/kartallar\nAslanlar;https://elitlig.com/takim/aslanlar\nMaç günü formu;https://elitlig.com/form");
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => parseQrRows(text).slice(0, 300).map((r) => { try { return { ...r, qr: qrEncode(r.content, { ecl: "M" }) }; } catch (e) { return { ...r, error: e.message }; } }), [text]);
  const ok = items.filter((x) => x.qr);
  const saveZip = async () => {
    setBusy(true);
    try {
      const files = [];
      const used = new Set();
      for (const [i, it] of ok.entries()) {
        let name = fileSafe(it.label || `qr-${i + 1}`);
        while (used.has(name)) name = `${name}-${i + 1}`;
        used.add(name);
        files.push({ name: `${name}.png`, data: await svgToPng(qrSvg(it.qr), 1024) });
      }
      const r = await window.elitlig.files.save("qr-kodlari.zip", zipStore(files), [{ name: "ZIP", extensions: ["zip"] }]);
      if (r?.ok) { toast(`${files.length} QR kaydedildi.`, { tone: "success" }); window.elitlig.files.reveal(r.path); }
    } catch (e) { toast(e.message, { tone: "error" }); } finally { setBusy(false); }
  };
  const savePdf = () => {
    const cells = ok.map((it) => `<figure>${qrSvg(it.qr, 150)}<figcaption>${String(it.label).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</figcaption></figure>`).join("");
    window.elitlig.pdf(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>body{font:11px Arial,sans-serif;margin:20px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;text-align:center;break-inside:avoid;border:1px dashed #ccc;padding:8px}svg{width:100%;height:auto}</style></head><body><main>${cells}</main></body></html>`, "QR kodlari");
  };
  return (
    <div className="tt">
      <Field label={`Satırlar (${ok.length} QR) — "Etiket;bağlantı" ya da yalnız bağlantı; Excel'den iki sütun yapıştırılabilir`}><textarea className="is-mono" value={text} onChange={(e) => setText(e.target.value)} aria-label="QR satırları" /></Field>
      {items.some((x) => x.error) && <p className="tt-warn">Çok uzun içerik: {items.filter((x) => x.error).map((x) => x.label).join(", ")}</p>}
      <div className="tt-row">
        <button type="button" className="btn btn--sm btn--primary" onClick={saveZip} disabled={!ok.length || busy}><Icon name="download" size={12} /> {busy ? "Hazırlanıyor…" : "PNG'ler (ZIP)"}</button>
        <button type="button" className="btn btn--sm" onClick={savePdf} disabled={!ok.length}><Icon name="printer" size={12} /> Yazdırılabilir PDF</button>
      </div>
      <div className="tt-qrgrid" aria-label="QR kodları">
        {ok.map((it, i) => <figure key={i}><span dangerouslySetInnerHTML={{ __html: qrSvg(it.qr, 120) }} /><figcaption>{it.label}</figcaption></figure>)}
      </div>
    </div>
  );
}

/* ------------------------------- logodan palet ------------------------------- */

export function LogoPaletteTool() {
  const copy = useCopy();
  const [src, setSrc] = useState(null);
  const [k, setK] = useStored("tt.palette.k", 6);
  const [skipWhite, setSkipWhite] = useStored("tt.palette.skipWhite", true);
  const [palette, setPalette] = useState([]);
  const [error, setError] = useState(null);
  const imgRef = useRef(null);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const analyse = () => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    try { setPalette(extractPalette(g.getImageData(0, 0, c.width, c.height).data, Number(k) || 6, { skipWhite })); setError(null); } catch (e) { setError(e.message); }
  };
  useEffect(analyse, [k, skipWhite]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (f) => { if (!f) return; if (!/^image\//.test(f.type)) { setError("Görsel dosyası seçin (PNG, JPG, SVG, WEBP)."); return; } setSrc(URL.createObjectURL(f)); };
  const css = palette.map((p, i) => `  --renk-${i + 1}: ${p.hex};`).join("\n");
  return (
    <div className="tt" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
      <div className="tt-row">
        <label className="btn btn--sm btn--primary"><Icon name="image" size={12} /> Logo / görsel seç<input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Görsel seç" /></label>
        <span className="tt-muted">ya da buraya sürükleyin</span>
        <select value={k} onChange={(e) => setK(Number(e.target.value))} aria-label="Renk sayısı" style={{ flex: "0 0 auto", width: "auto" }}>{[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} renk</option>)}</select>
        <label className="tk-check"><input type="checkbox" checked={skipWhite} onChange={(e) => setSkipWhite(e.target.checked)} /> Beyaz zemini atla</label>
      </div>
      {src && <img ref={imgRef} src={src} alt="Seçilen görsel" className="tt-imgprev" onLoad={analyse} />}
      {error && <p className="tk-err">{error}</p>}
      {palette.length > 0 && (<>
        <div className="tt-palette" aria-label="Palet">
          {palette.map((p) => (
            <button key={p.hex} type="button" className="tt-swatch" onClick={() => copy(p.hex, `${p.hex} kopyalandı`)} title={`rgb(${p.rgb.join(", ")})`}>
              <i style={{ background: p.hex }} /><span>{p.hex}<small>%{p.share}</small></span>
            </button>
          ))}
        </div>
        <div className="tt-row">
          <button type="button" className="btn btn--sm" onClick={() => copy(palette.map((p) => p.hex).join(", "), "Palet kopyalandı")}><Icon name="copy" size={12} /> HEX listesi</button>
          <button type="button" className="btn btn--sm" onClick={() => copy(`:root {\n${css}\n}`, "CSS değişkenleri kopyalandı")}>CSS değişkenleri</button>
        </div>
      </>)}
      {!src && <p className="tt-muted">Takım ya da sponsor logosundan baskın renkleri çıkarır (yayın grafikleri, forma, afiş için). Görsel bu bilgisayardan çıkmaz.</p>}
    </div>
  );
}

/* ------------------------------- yazı tipi önizleyici ------------------------------- */

const COMMON_FONTS = ["Inter", "Helvetica Neue", "Arial", "Arial Black", "Avenir Next", "Futura", "Gill Sans", "Georgia", "Times New Roman", "Menlo", "Courier New", "Impact", "Trebuchet MS", "Verdana", "Segoe UI", "Roboto", "Montserrat", "Oswald", "Bebas Neue", "Poppins", "SF Pro Display", "DejaVu Sans", "Liberation Sans", "Noto Sans"];

export function FontTool() {
  const copy = useCopy();
  const [sample, setSample] = useStored("tt.font.sample", "Kartallar 2–1 Aslanlar · ŞAMPİYONLUK MAÇI · ğüşıöç 0123");
  const [size, setSize] = useStored("tt.font.size", 28);
  const [weight, setWeight] = useStored("tt.font.weight", 700);
  const [q, setQ] = useState("");
  const [fonts, setFonts] = useState(() => COMMON_FONTS.filter((f) => { try { return document.fonts?.check?.(`12px "${f}"`); } catch { return true; } }));
  const [local, setLocal] = useState(false);
  const loadLocal = async () => {
    try {
      const list = await window.queryLocalFonts();
      setFonts([...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b, "tr")));
      setLocal(true);
    } catch { setLocal("denied"); }
  };
  const shown = fonts.filter((f) => !q || f.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))).slice(0, 300);
  return (
    <div className="tt">
      <input value={sample} onChange={(e) => setSample(e.target.value)} aria-label="Örnek metin" />
      <div className="tt-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yazı tipi ara" aria-label="Yazı tipi ara" />
        <label className="tk-check">Boyut <input type="range" min="12" max="72" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Boyut" /></label>
        <select value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Kalınlık" style={{ flex: "0 0 auto", width: "auto" }}>{[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}</select>
        {local !== true && typeof window.queryLocalFonts === "function" && <button type="button" className="btn btn--sm" onClick={loadLocal}>Tüm yüklü yazı tiplerini getir</button>}
      </div>
      {local === "denied" && <p className="tt-warn">Yazı tipi listesine erişilemedi; yaygın yazı tipleri gösteriliyor.</p>}
      <p className="tt-muted">{fonts.length} yazı tipi · tıklayınca adı kopyalanır</p>
      <div className="tt-fonts">
        {shown.map((f) => (
          <button key={f} type="button" className="tt-font" onClick={() => copy(f, `${f} kopyalandı`)}>
            <small>{f}</small><div style={{ fontFamily: `"${f}"`, fontSize: size, fontWeight: weight }}>{sample}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- sosyal medya boyutları ------------------------------- */

export function SocialSizeTool({ go }) {
  const toast = useToast();
  const [preset, setPreset] = useStored("tt.social.preset", "ig-square");
  const [fit, setFit] = useStored("tt.social.fit", "cover");
  const [bg, setBg] = useStored("tt.social.bg", "#000000");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const canvasRef = useRef(null);
  const p = SOCIAL_SIZES.find((x) => x.key === preset) || SOCIAL_SIZES[0];
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = p.w; c.height = p.h;
      const g = c.getContext("2d");
      g.fillStyle = bg; g.fillRect(0, 0, p.w, p.h);
      g.imageSmoothingQuality = "high";
      const r = coverRect(img.naturalWidth, img.naturalHeight, p.w, p.h, fit);
      g.drawImage(img, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
    };
    img.src = url;
  }, [url, p.w, p.h, fit, bg]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (f) => { if (!f || !/^image\//.test(f.type)) return; setFile(f); setUrl(URL.createObjectURL(f)); };
  const save = async (fmt) => {
    const blob = await new Promise((r) => canvasRef.current.toBlob(r, fmt === "jpg" ? "image/jpeg" : "image/png", 0.92));
    const name = `${fileSafe(file?.name?.replace(/\.[^.]+$/, ""))}-${p.key}-${p.w}x${p.h}.${fmt}`;
    const r = await window.elitlig.files.save(name, new Uint8Array(await blob.arrayBuffer()), [{ name: fmt.toUpperCase(), extensions: [fmt] }]);
    if (r?.ok) { toast("Kaydedildi.", { tone: "success" }); window.elitlig.files.reveal(r.path); }
  };
  return (
    <div className="tt" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
      <div className="tt-sizes" role="radiogroup" aria-label="Boyut">
        {SOCIAL_SIZES.map((s) => {
          const r = Math.min(26 / s.w, 26 / s.h);
          return (
            <button key={s.key} type="button" role="radio" aria-checked={preset === s.key} className={`tt-size${preset === s.key ? " is-on" : ""}`} onClick={() => setPreset(s.key)}>
              <i style={{ width: Math.round(s.w * r), height: Math.round(s.h * r) }} /><span>{s.label}<small>{s.w}×{s.h}</small></span>
            </button>
          );
        })}
      </div>
      <div className="tt-row">
        <label className="btn btn--sm btn--primary"><Icon name="image" size={12} /> Görsel seç<input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Görsel seç" /></label>
        <Segmented value={fit} onChange={setFit} size="sm" ariaLabel="Yerleşim" options={[{ value: "cover", label: "Kırparak doldur" }, { value: "contain", label: "Sığdır" }]} />
        {fit === "contain" && <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Kenar rengi" />}
      </div>
      {url ? (<>
        <canvas ref={canvasRef} className="tt-imgprev" style={{ maxHeight: 260 }} aria-label="Önizleme" />
        <div className="tt-row">
          <button type="button" className="btn btn--sm btn--primary" onClick={() => save("jpg")}><Icon name="download" size={12} /> JPG</button>
          <button type="button" className="btn btn--sm" onClick={() => save("png")}><Icon name="download" size={12} /> PNG</button>
        </div>
      </>) : <p className="tt-muted">Görsel seçin ya da sürükleyin. Çok sayıda görsel için: Dosya Araçları → Araçlar → Yeniden boyutlandır → <strong>Sosyal medya</strong>{go ? <button type="button" className="link-btn" onClick={() => go("files")}>Dosya Araçları'nı aç</button> : null}.</p>}
    </div>
  );
}
