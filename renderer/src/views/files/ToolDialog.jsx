// Araç seçenekleri penceresi (boyut, kalite, biçim, aralık…). "Başlat" işi
// kuyruğa koyar; ilerleme Dosya Araçları'nın iş listesinde görünür.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Modal, Segmented } from "../../components/ui";
import { formatBytes } from "../../lib/files/catalog";
import { RENAME_TOKENS, applyRenameTemplate, cleanFileName } from "../../lib/files/renameUtils";

const DEFAULTS = {
  imgResize: { mode: "max", percent: 50, maxW: 1920, maxH: 1920, width: "", height: "", keep: true, format: "", quality: 92 },
  imgRotate: { angle: 90, flipH: false, flipV: false },
  imgCompress: { quality: 75, maxSide: "", format: "same" },
  imgCollage: { cols: "", cell: 600, gap: 12, background: "#ffffff", radius: 0, format: "jpg" },
  toPdf: { page: "a4", marginMm: 10 },
  imgToPdf: { page: "a4", marginMm: 10 },
  avCompress: { mode: "preset", preset: "medium", targetMB: 25, maxHeight: "" },
  avSpeed: { factor: 2, mute: false },
  avExtract: { format: "mp3" },
  avJoin: { format: "" },
  avSplit: { everySec: 60 },
  avResize: { height: 720 },
  avCrop: { aspect: "1:1" },
  avRotate: { direction: "cw" },
  "to-gif": { fps: 12, width: 480 },
  pdfSplit: { mode: "each", ranges: "" },
  pdfRotate: { rotateAll: 90 },
  textEncode: { from: "auto", to: "utf-8", lineEndings: "" },
  zipCreate: { name: "" },
  rename: { template: "{ad}-{n}", start: 1, pad: "" },
};

const TITLES = { toPdf: "Görsellerden PDF", "to-gif": "GIF'e dönüştür" };

export default function ToolDialog({ tool, files, onClose, onStart }) {
  const key = tool.id === "toPdf" && tool.op === "imagesToPdf" ? "toPdf" : tool.id;
  const [o, setO] = useState(() => ({ ...(DEFAULTS[key] || {}) }));
  const [order, setOrder] = useState(files);
  const [textInfo, setTextInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setO((v) => ({ ...v, ...patch }));
  const n = files.length;
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);

  useEffect(() => {
    if (key === "textEncode" && files[0]) window.elitlig.fileTools.textInfo(files[0].id).then((r) => { if (r.ok) { setTextInfo(r); } });
  }, [key, files]);

  const renamePreview = useMemo(() => (key === "rename" ? files.slice(0, 6).map((f, i) => {
    const start = Number(o.start) || 1;
    const pad = Number(o.pad) || String(start + files.length - 1).length;
    const folder = String(f.path || "").split(/[\\/]/).slice(-2, -1)[0] || "";
    return `${cleanFileName(applyRenameTemplate(o.template, { name: f.name, ext: f.ext, mtimeMs: f.mtimeMs, folder }, i, { start, pad }))}${f.ext ? `.${f.ext}` : ""}`;
  }) : []), [key, files, o.template, o.start, o.pad]);

  const start = async () => {
    setBusy(true);
    let spec = null;
    const opts = { ...o };
    switch (key) {
      case "imgResize": spec = { client: "imgResize", options: { ...opts, format: opts.format || null } }; break;
      case "imgRotate": spec = { client: "imgRotate", options: opts }; break;
      case "imgCompress": spec = { client: "imgCompress", options: { ...opts, maxSide: Number(opts.maxSide) || null } }; break;
      case "imgCollage": spec = { client: "imgCollage", options: { ...opts, cols: Number(opts.cols) || null, cell: Number(opts.cell) || 600, gap: Number(opts.gap) || 0, radius: Number(opts.radius) || 0 } }; break;
      case "toPdf": case "imgToPdf": spec = { op: "imagesToPdf", options: opts }; break;
      case "avCompress": spec = { op: "compress", options: opts.mode === "size" ? { targetMB: Number(opts.targetMB) || 25, maxHeight: Number(opts.maxHeight) || null } : { preset: opts.preset, ...(opts.maxHeight ? { maxHeight: Number(opts.maxHeight) } : {}) } }; break;
      case "avSpeed": spec = { op: "speed", options: { factor: Number(opts.factor), mute: opts.mute } }; break;
      case "avExtract": spec = { op: "extractAudio", options: opts }; break;
      case "avJoin": spec = { op: "join", options: { format: opts.format || null }, ids: order.map((f) => f.id) }; break;
      case "avSplit": spec = { op: "split", options: { everySec: Number(opts.everySec) || 60 } }; break;
      case "avResize": spec = { op: "resize", options: { height: Number(opts.height) } }; break;
      case "avCrop": spec = { op: "cropAspect", options: opts }; break;
      case "avRotate": spec = { op: "rotate", options: opts }; break;
      case "to-gif": spec = { op: "convert", options: { format: "gif", fps: Number(opts.fps), width: Number(opts.width) } }; break;
      case "pdfSplit": spec = { op: "pdfSplit", options: opts.mode === "ranges" ? { ranges: opts.ranges } : {} }; break;
      case "pdfRotate": spec = { op: "pdfOrganize", options: { rotateAll: Number(opts.rotateAll) } }; break;
      case "textEncode": spec = { op: "textEncode", options: { from: opts.from, to: opts.to, lineEndings: opts.lineEndings || null } }; break;
      case "zipCreate": spec = { op: "zipCreate", options: { name: opts.name || null } }; break;
      case "rename": spec = { op: "renameCopies", options: { template: opts.template, start: Number(opts.start) || 1, pad: Number(opts.pad) || 0 } }; break;
      default: spec = { op: tool.op, options: opts };
    }
    const res = await onStart(spec);
    setBusy(false);
    if (res?.ok !== false) onClose();
  };

  const formatSelect = (value, onChange, opts) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );

  return (
    <Modal title={TITLES[key] || tool.label} onClose={onClose} width={520}
      footer={<>
        <span className="muted ft-dialog__count">{n} dosya{totalBytes ? ` · ${formatBytes(totalBytes)}` : ""}</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={start} disabled={busy || (key === "pdfSplit" && o.mode === "ranges" && !o.ranges.trim())}>{busy ? "Başlatılıyor…" : "Başlat"}</button>
      </>}>
      <div className="ft-form">
        {key === "imgResize" && (<>
          <Segmented value={o.mode} onChange={(mode) => set({ mode })} size="sm" ariaLabel="Boyut kipi" options={[{ value: "max", label: "En fazla" }, { value: "percent", label: "Yüzde" }, { value: "exact", label: "Tam boyut" }]} />
          {o.mode === "percent" && <Field label="Ölçek (%)"><input type="number" min="1" max="1000" value={o.percent} onChange={(e) => set({ percent: e.target.value })} /></Field>}
          {o.mode === "max" && <div className="ft-row"><Field label="En fazla genişlik"><input type="number" min="1" value={o.maxW} onChange={(e) => set({ maxW: e.target.value })} /></Field><Field label="En fazla yükseklik"><input type="number" min="1" value={o.maxH} onChange={(e) => set({ maxH: e.target.value })} /></Field></div>}
          {o.mode === "exact" && (<>
            <div className="ft-row"><Field label="Genişlik (px)"><input type="number" min="1" value={o.width} onChange={(e) => set({ width: e.target.value })} /></Field><Field label="Yükseklik (px)"><input type="number" min="1" value={o.height} onChange={(e) => set({ height: e.target.value })} /></Field></div>
            <label className="ft-check"><input type="checkbox" checked={o.keep} onChange={(e) => set({ keep: e.target.checked })} /> En-boy oranını koru (kutuya sığdır)</label>
          </>)}
          <Field label="Biçim">{formatSelect(o.format, (format) => set({ format }), [["", "Aynı biçim"], ["jpg", "JPG"], ["png", "PNG"], ["webp", "WEBP"]])}</Field>
          {o.mode === "max" && <p className="muted ft-note">Küçük görseller büyütülmez.</p>}
        </>)}
        {key === "imgRotate" && (<>
          <Segmented value={String(o.angle)} onChange={(v) => set({ angle: Number(v) })} size="sm" ariaLabel="Açı" options={[{ value: "0", label: "Döndürme" }, { value: "90", label: "90° sağa" }, { value: "270", label: "90° sola" }, { value: "180", label: "180°" }]} />
          <label className="ft-check"><input type="checkbox" checked={o.flipH} onChange={(e) => set({ flipH: e.target.checked })} /> Yatay çevir (ayna)</label>
          <label className="ft-check"><input type="checkbox" checked={o.flipV} onChange={(e) => set({ flipV: e.target.checked })} /> Dikey çevir</label>
        </>)}
        {key === "imgCompress" && (<>
          <Field label={`Kalite: ${o.quality}`} hint="75 çoğu fotoğraf için gözle fark edilmeyen bir küçülme sağlar."><input type="range" min="30" max="95" value={o.quality} onChange={(e) => set({ quality: Number(e.target.value) })} /></Field>
          <Field label="En uzun kenar">{formatSelect(o.maxSide, (maxSide) => set({ maxSide }), [["", "Değiştirme"], ["3840", "3840 px (4K)"], ["2560", "2560 px"], ["1920", "1920 px (Full HD)"], ["1280", "1280 px"], ["1024", "1024 px"]])}</Field>
          <Field label="Biçim" hint="PNG kayıpsızdır, kalite ayarı onu küçültmez: “Otomatik” PNG'yi saydamlığı koruyarak WEBP'ye sıkıştırır; JPG ve WEBP aynı biçimde kalır.">{formatSelect(o.format, (format) => set({ format }), [["same", "Otomatik"], ["jpg", "JPG"], ["webp", "WEBP"]])}</Field>
        </>)}
        {key === "imgCollage" && (<>
          <div className="ft-row">
            <Field label="Sütun"><input type="number" min="1" max="12" placeholder="Otomatik" value={o.cols} onChange={(e) => set({ cols: e.target.value })} /></Field>
            <Field label="Hücre genişliği (px)"><input type="number" min="80" max="3000" value={o.cell} onChange={(e) => set({ cell: e.target.value })} /></Field>
          </div>
          <div className="ft-row">
            <Field label="Boşluk (px)"><input type="number" min="0" max="200" value={o.gap} onChange={(e) => set({ gap: e.target.value })} /></Field>
            <Field label="Köşe (px)"><input type="number" min="0" max="200" value={o.radius} onChange={(e) => set({ radius: e.target.value })} /></Field>
          </div>
          <div className="ft-row">
            <Field label="Arka plan"><input type="color" value={o.background} onChange={(e) => set({ background: e.target.value })} /></Field>
            <Field label="Biçim">{formatSelect(o.format, (format) => set({ format }), [["jpg", "JPG"], ["png", "PNG"], ["webp", "WEBP"]])}</Field>
          </div>
          <p className="muted ft-note">Görseller seçim sırasıyla yerleştirilir.</p>
        </>)}
        {(key === "toPdf" || key === "imgToPdf") && (<>
          <Field label="Sayfa">{formatSelect(o.page, (page) => set({ page }), [["a4", "A4 dikey"], ["a4-landscape", "A4 yatay"], ["fit", "Görsel boyutunda"]])}</Field>
          {o.page !== "fit" && <Field label="Kenar boşluğu (mm)"><input type="number" min="0" max="40" value={o.marginMm} onChange={(e) => set({ marginMm: e.target.value })} /></Field>}
          <p className="muted ft-note">Her görsel ayrı sayfa olur; seçim sırası korunur.</p>
        </>)}
        {key === "avCompress" && (<>
          <Segmented value={o.mode} onChange={(mode) => set({ mode })} size="sm" ariaLabel="Sıkıştırma kipi" options={[{ value: "preset", label: "Kalite" }, { value: "size", label: "Hedef boyut" }]} />
          {o.mode === "preset" ? (
            <Segmented value={o.preset} onChange={(preset) => set({ preset })} size="sm" ariaLabel="Kalite" options={[{ value: "small", label: "Küçük dosya" }, { value: "medium", label: "Dengeli" }, { value: "high", label: "Yüksek kalite" }]} />
          ) : (
            <Field label="Hedef boyut (MB)" hint="Ses için 128 kbps ayrılır; çok küçük hedeflerde görüntü kalitesi düşer."><input type="number" min="1" max="4000" value={o.targetMB} onChange={(e) => set({ targetMB: e.target.value })} /></Field>
          )}
          {files.every((f) => f.kind === "video") && <Field label="En fazla yükseklik">{formatSelect(o.maxHeight, (maxHeight) => set({ maxHeight }), [["", o.mode === "preset" ? "Ön ayara göre" : "Değiştirme"], ["2160", "2160p"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"]])}</Field>}
        </>)}
        {key === "avSpeed" && (<>
          <Field label="Hız">{formatSelect(String(o.factor), (factor) => set({ factor: Number(factor) }), [["0.25", "0,25× (çok yavaş)"], ["0.5", "0,5×"], ["0.75", "0,75×"], ["1.25", "1,25×"], ["1.5", "1,5×"], ["2", "2×"], ["3", "3×"], ["4", "4×"]])}</Field>
          {files.some((f) => f.kind === "video") && <label className="ft-check"><input type="checkbox" checked={o.mute} onChange={(e) => set({ mute: e.target.checked })} /> Sesi kaldır</label>}
        </>)}
        {key === "avExtract" && <Field label="Ses biçimi">{formatSelect(o.format, (format) => set({ format }), [["mp3", "MP3"], ["m4a", "M4A (AAC)"], ["wav", "WAV"], ["flac", "FLAC"]])}</Field>}
        {key === "avJoin" && (<>
          <p className="muted ft-note">Sıra (yukarı / aşağı ile değiştirin). Farklı boyutlu videolar ilkinin boyutuna sığdırılır.</p>
          <ol className="ft-order">
            {order.map((f, i) => (
              <li key={f.id}><span>{i + 1}. {f.name}</span>
                <button type="button" className="icon-btn icon-btn--xs" disabled={!i} onClick={() => setOrder((l) => { const c = [...l]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })} aria-label="Yukarı">↑</button>
                <button type="button" className="icon-btn icon-btn--xs" disabled={i === order.length - 1} onClick={() => setOrder((l) => { const c = [...l]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })} aria-label="Aşağı">↓</button>
              </li>
            ))}
          </ol>
          <Field label="Biçim">{formatSelect(o.format, (format) => set({ format }), files[0]?.kind === "audio" ? [["", "M4A"], ["mp3", "MP3"], ["wav", "WAV"], ["flac", "FLAC"]] : [["", "MP4"], ["mov", "MOV"], ["mkv", "MKV"], ["webm", "WEBM"]])}</Field>
        </>)}
        {key === "avSplit" && <Field label="Parça uzunluğu (saniye)" hint="Kodlamadan bölünür: kesimler en yakın anahtar kareye denk gelir."><input type="number" min="1" value={o.everySec} onChange={(e) => set({ everySec: e.target.value })} /></Field>}
        {key === "avResize" && <Field label="Yükseklik">{formatSelect(String(o.height), (height) => set({ height: Number(height) }), [["2160", "2160p (4K)"], ["1440", "1440p"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"]])}</Field>}
        {key === "avCrop" && <Field label="Oran (ortadan kırpılır)">{formatSelect(o.aspect, (aspect) => set({ aspect }), [["1:1", "1:1 kare"], ["9:16", "9:16 dikey (Reels, Shorts)"], ["16:9", "16:9 yatay"], ["4:5", "4:5"], ["4:3", "4:3"]])}</Field>}
        {key === "avRotate" && <Field label="Döndürme">{formatSelect(o.direction, (direction) => set({ direction }), [["cw", "90° sağa"], ["ccw", "90° sola"], ["180", "180°"], ["hflip", "Yatay çevir"], ["vflip", "Dikey çevir"]])}</Field>}
        {key === "to-gif" && (<div className="ft-row">
          <Field label="Kare / sn">{formatSelect(String(o.fps), (fps) => set({ fps: Number(fps) }), [["8", "8"], ["10", "10"], ["12", "12"], ["15", "15"], ["20", "20"]])}</Field>
          <Field label="Genişlik">{formatSelect(String(o.width), (width) => set({ width: Number(width) }), [["320", "320 px"], ["480", "480 px"], ["640", "640 px"], ["800", "800 px"]])}</Field>
        </div>)}
        {key === "pdfSplit" && (<>
          <Segmented value={o.mode} onChange={(mode) => set({ mode })} size="sm" ariaLabel="Bölme" options={[{ value: "each", label: "Her sayfa ayrı" }, { value: "ranges", label: "Aralıklar" }]} />
          {o.mode === "ranges" && <Field label="Sayfa aralıkları" hint="Örn. 1-3, 5, 8- (her aralık ayrı dosya)"><input value={o.ranges} onChange={(e) => set({ ranges: e.target.value })} placeholder="1-3, 5, 8-" autoFocus /></Field>}
        </>)}
        {key === "pdfRotate" && <Segmented value={String(o.rotateAll)} onChange={(v) => set({ rotateAll: Number(v) })} size="sm" ariaLabel="Açı" options={[{ value: "90", label: "90° sağa" }, { value: "270", label: "90° sola" }, { value: "180", label: "180°" }]} />}
        {key === "textEncode" && (<>
          <div className="ft-row">
            <Field label={`Kaynak${textInfo ? ` (algılanan: ${(textInfo.encodings.find((e) => e.key === textInfo.encoding) || { label: textInfo.encoding }).label})` : ""}`}>
              {formatSelect(o.from, (from) => set({ from }), [["auto", "Otomatik"], ...(textInfo?.encodings || []).map((e) => [e.key, e.label])])}
            </Field>
            <Field label="Hedef">{formatSelect(o.to, (to) => set({ to }), (textInfo?.encodings || [{ key: "utf-8", label: "UTF-8" }]).map((e) => [e.key, e.label]))}</Field>
          </div>
          <Field label="Satır sonu">{formatSelect(o.lineEndings, (lineEndings) => set({ lineEndings }), [["", "Değiştirme"], ["lf", "LF (Mac / Linux)"], ["crlf", "CRLF (Windows)"]])}</Field>
          {textInfo?.preview && <pre className="ft-preview selectable">{textInfo.preview}</pre>}
        </>)}
        {key === "zipCreate" && <Field label="Arşiv adı" hint={`${n} öğe sıkıştırılır; orijinaller yerinde kalır.`}><input value={o.name} onChange={(e) => set({ name: e.target.value })} placeholder={n === 1 ? files[0].name.replace(/\.[^.]+$/, "") : "Arşiv"} autoFocus /></Field>}
        {key === "rename" && (<>
          <Field label="Şablon" hint="Yeniden adlandırılmış KOPYALAR çıktı klasörüne yazılır; özgün dosyalar değişmez."><input value={o.template} onChange={(e) => set({ template: e.target.value })} autoFocus /></Field>
          <div className="ft-tokens">{RENAME_TOKENS.map((t) => <button key={t.token} type="button" className="chip" onClick={() => set({ template: `${o.template}${t.token}` })} title={t.label}>{t.token}</button>)}</div>
          <div className="ft-row">
            <Field label="Başlangıç no"><input type="number" value={o.start} onChange={(e) => set({ start: e.target.value })} /></Field>
            <Field label="Basamak"><input type="number" min="0" max="6" placeholder="Otomatik" value={o.pad} onChange={(e) => set({ pad: e.target.value })} /></Field>
          </div>
          <ul className="ft-renames">{renamePreview.map((name, i) => <li key={i}><span className="muted">{files[i].name}</span> → <strong>{name}</strong></li>)}{files.length > 6 && <li className="muted">… ve {files.length - 6} dosya daha</li>}</ul>
        </>)}
      </div>
    </Modal>
  );
}
