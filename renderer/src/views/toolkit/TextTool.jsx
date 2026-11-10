// Metin dönüştürücü: BÜYÜK / küçük / Başlık, Türkçe karakter düzelt / sil, slug, satır işlemleri, sayım.
import React, { useState } from "react";
import { Icon } from "../../components/ui";
import { TRANSFORMS, countText } from "./textTools";
import { useCopy, useStored } from "./toolkitUi";

export default function TextTool() {
  const copy = useCopy();
  const [text, setText] = useStored("toolkit.text", "");
  const [undo, setUndo] = useState(null);
  const c = countText(text);
  const run = (t) => {
    const out = t.run(text);
    if (out === text) return;
    setUndo(text);
    setText(out);
  };
  const paste = async () => { try { const v = await navigator.clipboard.readText(); if (v) { setUndo(text); setText(v); } } catch { /* izin yok */ } };
  return (
    <div className="tk-text">
      <textarea value={text} onChange={(e) => { setText(e.target.value); setUndo(null); }} placeholder="Metni yapıştırın ya da yazın…" aria-label="Metin" spellCheck={false} />
      <div className="tk-text__bar">
        <button type="button" className="btn btn--sm" onClick={paste}><Icon name="clipboard" size={12} /> Yapıştır</button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(text, "Metin kopyalandı")} disabled={!text}><Icon name="copy" size={12} /> Kopyala</button>
        {undo != null && <button type="button" className="btn btn--sm" onClick={() => { setText(undo); setUndo(null); }}><Icon name="undo" size={12} /> Geri al</button>}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setUndo(text); setText(""); }} disabled={!text}>Temizle</button>
      </div>
      <div className="tk-chips" role="group" aria-label="Dönüşümler">
        {TRANSFORMS.map((t) => <button key={t.key} type="button" className="tk-chip" onClick={() => run(t)} disabled={!text}>{t.label}</button>)}
      </div>
      <dl className="tk-stats" aria-label="Sayım">
        <div><dt>Karakter</dt><dd>{c.chars.toLocaleString("tr-TR")}</dd></div>
        <div><dt>Boşluksuz</dt><dd>{c.noSpaces.toLocaleString("tr-TR")}</dd></div>
        <div><dt>Sözcük</dt><dd>{c.words.toLocaleString("tr-TR")}</dd></div>
        <div><dt>Satır</dt><dd>{c.lines.toLocaleString("tr-TR")}</dd></div>
        <div><dt>Cümle</dt><dd>{c.sentences.toLocaleString("tr-TR")}</dd></div>
        <div><dt>Okuma</dt><dd>{c.readMinutes} dk</dd></div>
      </dl>
    </div>
  );
}
