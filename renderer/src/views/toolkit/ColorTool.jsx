// Renk seçici: ekrandan renk al (EyeDropper), HEX / RGB / HSL kopyala, tonlar, karşıtlık, son renkler.
import React, { useState } from "react";
import { Icon, isMac } from "../../components/ui";
import { formats, parseColor, pushRecent, readableOn, shades, toHex } from "./colorUtils";
import { CopyRow, deskkit, useCopy, useStored } from "./toolkitUi";

export default function ColorTool() {
  const copy = useCopy();
  const [recent, setRecent] = useStored("toolkit.colors", []);
  const [hex, setHex] = useState(() => recent[0] || "#7C3AED");
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const color = parseColor(hex) || { r: 124, g: 58, b: 237, a: 1 };
  const read = readableOn(color);
  const canPick = typeof window !== "undefined" && "EyeDropper" in window;

  const choose = (h, { remember = true } = {}) => {
    const c = parseColor(h);
    if (!c) return false;
    const x = toHex(c);
    setHex(x);
    if (remember) setRecent((r) => pushRecent(r, x));
    return true;
  };
  const pick = async () => {
    setErr(null);
    // Seçim sürerken panel odak kaybedip gizlenmesin.
    await deskkit()?.pinPanel(true);
    try {
      const res = await new window.EyeDropper().open();
      if (res?.sRGBHex) { choose(res.sRGBHex); copy(toHex(parseColor(res.sRGBHex)), `${toHex(parseColor(res.sRGBHex))} kopyalandı`); }
    } catch (e) {
      if (e?.name !== "AbortError") setErr(isMac() ? "Renk alınamadı. Başka uygulamalardan renk almak için Sistem Ayarları › Gizlilik ve Güvenlik › Ekran Kaydı'nda Elitlig Araçlar'a izin verin." : "Renk alınamadı.");
    } finally {
      deskkit()?.pinPanel(false);
    }
  };

  return (
    <div className="tk-color">
      <div className="tk-color__hero" style={{ background: toHex(color), color: read.color }}>
        <strong>{toHex(color)}</strong>
        <span>Yazı karşıtlığı {read.ratio.toLocaleString("tr-TR")}:1 · {read.ratio >= 4.5 ? "okunur (AA)" : read.ratio >= 3 ? "büyük yazı için" : "zayıf"}</span>
        <div className="tk-color__acts">
          <button type="button" className="btn btn--sm" onClick={pick} disabled={!canPick} title={canPick ? "Ekrandaki herhangi bir noktadan renk al" : "Bu sürümde desteklenmiyor"}><Icon name="droplet" size={13} /> Ekrandan al</button>
          <label className="btn btn--sm tk-color__native" title="Renk paleti">
            <Icon name="palette" size={13} /> Palet
            <input type="color" value={toHex(color).toLowerCase()} onChange={(e) => choose(e.target.value, { remember: false })} onBlur={(e) => choose(e.target.value)} aria-label="Renk paleti" />
          </label>
        </div>
      </div>
      {err && <p className="tk-err" role="alert">{err}</p>}
      <form className="tk-inline" onSubmit={(e) => { e.preventDefault(); if (choose(text)) { setText(""); setErr(null); } else setErr("Renk anlaşılamadı: #7c3aed, rgb(124, 58, 237) ya da hsl(262, 83%, 58%) yazın."); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="#7c3aed · rgb(…) · hsl(…)" aria-label="Renk kodu" />
        <button type="submit" className="btn btn--sm">Göster</button>
      </form>
      <div className="tk-copies">{formats(color).map((f) => <CopyRow key={f.key} label={f.label} value={f.value} onCopy={copy} />)}</div>
      <div className="tk-swatches" aria-label="Tonlar">
        {shades(color, [-36, -24, -12, 0, 12, 24, 36]).map((h, i) => (
          <button key={`${h}-${i}`} type="button" className={`tk-swatch${h === toHex(color) ? " is-cur" : ""}`} style={{ background: h }} onClick={() => copy(h, `${h} kopyalandı`)} title={`${h} · tıkla: kopyala`} aria-label={`${h} kopyala`} />
        ))}
      </div>
      {recent.length > 0 && (
        <section className="tk-sub">
          <div className="tk-sub__head"><h4>Son renkler</h4><button type="button" className="link-btn" onClick={() => setRecent([])}>Temizle</button></div>
          <div className="tk-swatches is-recent">
            {recent.map((h) => <button key={h} type="button" className={`tk-swatch${h === toHex(color) ? " is-cur" : ""}`} style={{ background: h }} onClick={() => choose(h, { remember: false })} title={h} aria-label={`${h} seç`} />)}
          </div>
        </section>
      )}
    </div>
  );
}
