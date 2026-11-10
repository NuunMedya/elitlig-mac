// Düzenleyicilerin (görsel, PDF sayfaları, ses/video) ortak kapatma yolu.
//
// Hata (2.27.0): görsel düzenleyicide değişiklik yaptıktan sonra "Vazgeç" / ✕ / Esc
// "Değişiklikler kaydedilmedi" onayını uygulama genelindeki ConfirmProvider ile
// soruyordu. O pencere z-index 50'de, düzenleyici (.ie-backdrop) 70'te çizildiği için
// onay düzenleyicinin ARKASINDA kalıyordu: görünmüyor, tıklanamıyor; Esc yeniden
// soruyor, ↩ ise düzenleyicinin kendi "kaydet" kısayoluna düşüyordu. Kullanıcıya
// "Vazgeç tepki vermiyor" olarak görünüyordu.
//
// Çözüm: onay düzenleyicinin İÇİNDE çizilir (her zaman üstte), açıkken klavye
// yalnız onaya gider (Esc = düzenlemeye dön, ↩ = kaydetmeden kapat). Düzenleyicinin
// dışına (karartılmış alana) tıklamak da aynı yoldan kapatır.
import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * @param {{ dirty: boolean, onClose: () => void, rootRef: React.RefObject<HTMLElement> }} opts
 * @returns {{ requestClose: () => void, ask: object|null, askNode: React.ReactNode, setAsk: Function }}
 */
export function useEditorClose({ dirty, onClose, rootRef, title = "Değişiklikler kaydedilmedi", message = "Düzenlemeleri kaydetmeden kapatılsın mı?", confirmLabel = "Kaydetmeden kapat" }) {
  const [ask, setAsk] = useState(null); // { title, message, confirmLabel, run }
  const state = useRef({});
  state.current = { dirty, onClose, ask };

  const requestClose = useCallback(() => {
    const s = state.current;
    if (s.ask) return; // onay zaten açık
    if (!s.dirty) { s.onClose(); return; }
    setAsk({ title, message, confirmLabel, run: () => state.current.onClose() });
  }, [title, message, confirmLabel]);

  // Onay açıkken klavye: Esc düzenlemeye döner, ↩ onaylar. Yakalama aşamasında ve
  // düzenleyicinin kendi dinleyicisinden ÖNCE çalışsın diye ayrı bir dinleyici;
  // stopImmediatePropagation ile alttaki kısayollar (kaydet, araç değiştir) susar.
  useEffect(() => {
    if (!ask) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); ask.cancel?.(); setAsk(null); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); const run = ask.run; setAsk(null); run(); return; }
      if (e.key !== "Tab") e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ask]);

  // Düzenleyicinin dışına (karartılmış arka plana) tıklama = kapat.
  useEffect(() => {
    const parent = rootRef?.current?.parentElement;
    if (!parent || !parent.classList.contains("ie-backdrop")) return undefined;
    const onDown = (e) => { if (e.target === parent && e.button === 0) requestClose(); };
    parent.addEventListener("mousedown", onDown);
    return () => parent.removeEventListener("mousedown", onDown);
  }, [rootRef, requestClose]);

  const dismiss = () => { ask?.cancel?.(); setAsk(null); };
  const askNode = ask ? (
    <div className="ie__ask" role="alertdialog" aria-modal="true" aria-label={ask.title} onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="ie__ask-box">
        <strong>{ask.title}</strong>
        <p className="muted">{ask.message}</p>
        <div className="ie__ask-btns">
          <button type="button" className="btn" onClick={dismiss}>{ask.cancelLabel || "Düzenlemeye dön"}</button>
          <button type="button" className={`btn btn--primary${ask.danger === false ? "" : " btn--danger"}`} autoFocus onClick={() => { const run = ask.run; setAsk(null); run(); }}>{ask.confirmLabel}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { requestClose, ask, askNode, setAsk };
}

/** Düzenleyici içi genel onay (ör. "Döndürünce işaretler kaldırılır"): Promise<boolean>. */
export function askInside(setAsk, { title, message, confirmLabel = "Tamam", danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    setAsk({ title, message, confirmLabel, danger, cancelLabel: "Vazgeç", run: () => finish(true), cancel: () => finish(false) });
  });
}
