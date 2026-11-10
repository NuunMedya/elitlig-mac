// QR oluşturucu: metin / bağlantı ya da Wi-Fi ağı. Kodlayıcı uygulamanın kendi saf JS QR'ı
// (lib/studio/qr.js, ISO/IEC 18004; Yayın Stüdyosu'nda da kullanılır) — bağımlılık yok.
import React, { useMemo, useState } from "react";
import { Icon, Segmented, useToast } from "../../components/ui";
import { qrEncode, qrPath } from "../../lib/studio/qr";
import { useStored } from "./toolkitUi";

const MARGIN = 4;
/** Wi-Fi QR metni (telefon kamerası tanır). Özel karakterler kaçışlanır. */
export function wifiText({ ssid, password, security = "WPA", hidden = false }) {
  const esc = (s) => String(s || "").replace(/([\;,:"])/g, "\\$1");
  return `WIFI:T:${security === "nopass" ? "nopass" : security};S:${esc(ssid)};${security === "nopass" ? "" : `P:${esc(password)};`}${hidden ? "H:true;" : ""};`;
}

function svgMarkup(qr, px = 512) {
  const n = qr.size + MARGIN * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${qrPath(qr, MARGIN)}" fill="#000"/></svg>`;
}
async function pngBlob(qr, px = 1024) {
  const n = qr.size + MARGIN * 2;
  const scale = Math.max(1, Math.floor(px / n));
  const canvas = document.createElement("canvas");
  canvas.width = n * scale;
  canvas.height = n * scale;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000";
  for (let y = 0; y < qr.size; y += 1) for (let x = 0; x < qr.size; x += 1) if (qr.rows[y][x]) g.fillRect((x + MARGIN) * scale, (y + MARGIN) * scale, scale, scale);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export default function QrTool() {
  const toast = useToast();
  const [mode, setMode] = useStored("toolkit.qrMode", "text");
  const [text, setText] = useStored("toolkit.qrText", "https://elitlig.com");
  const [wifi, setWifi] = useState({ ssid: "", password: "", security: "WPA", hidden: false });
  const content = mode === "wifi" ? (wifi.ssid ? wifiText(wifi) : "") : text.trim();
  const qr = useMemo(() => { if (!content) return null; try { return qrEncode(content, { ecl: "M" }); } catch (e) { return { error: e.message }; } }, [content]);
  const ok = qr && !qr.error;
  const name = mode === "wifi" ? `wifi-${wifi.ssid || "ag"}` : "qr-kod";

  const copyImage = async () => {
    try {
      const blob = await pngBlob(qr);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("QR görseli kopyalandı.", { tone: "success", timeout: 1600 });
    } catch { toast("Görsel panoya kopyalanamadı.", { tone: "error" }); }
  };
  const save = async (kind) => {
    const files = window.elitlig?.files;
    if (!files) return;
    const data = kind === "svg" ? svgMarkup(qr) : new Uint8Array(await (await pngBlob(qr)).arrayBuffer());
    const res = await files.save(`${name}.${kind}`, data, [{ name: kind.toUpperCase(), extensions: [kind] }]);
    if (res?.ok) toast("Kaydedildi.", { tone: "success" });
  };

  return (
    <div className="tk-qr">
      <Segmented size="sm" value={mode} onChange={setMode} ariaLabel="QR türü" options={[{ value: "text", label: "Metin / bağlantı", icon: "link" }, { value: "wifi", label: "Wi-Fi", icon: "globe" }]} />
      {mode === "text" ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Bağlantı ya da metin" aria-label="QR içeriği" spellCheck={false} />
      ) : (
        <div className="tk-qr__wifi">
          <input value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} placeholder="Ağ adı (SSID)" aria-label="Ağ adı" />
          <input value={wifi.password} onChange={(e) => setWifi({ ...wifi, password: e.target.value })} placeholder="Parola" aria-label="Parola" disabled={wifi.security === "nopass"} />
          <select value={wifi.security} onChange={(e) => setWifi({ ...wifi, security: e.target.value })} aria-label="Güvenlik">
            <option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">Parolasız</option>
          </select>
          <label className="toggle"><input type="checkbox" checked={wifi.hidden} onChange={(e) => setWifi({ ...wifi, hidden: e.target.checked })} /> Gizli ağ</label>
        </div>
      )}
      <div className="tk-qr__preview">
        {ok ? (
          <svg viewBox={`0 0 ${qr.size + MARGIN * 2} ${qr.size + MARGIN * 2}`} width="188" height="188" shapeRendering="crispEdges" role="img" aria-label="QR kod">
            <rect width="100%" height="100%" fill="#fff" />
            <path d={qrPath(qr, MARGIN)} fill="#000" />
          </svg>
        ) : <p className="muted">{qr?.error ? "Metin QR için çok uzun." : "İçerik girin."}</p>}
      </div>
      {ok && <p className="tk-note">Sürüm {qr.version} · hata düzeltme {qr.ecl} · {[...new TextEncoder().encode(content)].length} bayt</p>}
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm btn--primary" onClick={copyImage} disabled={!ok}><Icon name="copy" size={12} /> Görseli kopyala</button>
        <button type="button" className="btn btn--sm" onClick={() => save("png")} disabled={!ok}><Icon name="download" size={12} /> PNG</button>
        <button type="button" className="btn btn--sm" onClick={() => save("svg")} disabled={!ok}><Icon name="download" size={12} /> SVG</button>
      </div>
    </div>
  );
}
