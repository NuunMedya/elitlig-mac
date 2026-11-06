// Kimliği hiç değişmeyen geri çağırma (her zaman son işlevi çağırır).
//
// Stüdyo saniyede birkaç kez yeniden çizilir (saat, durum). Alt bileşenlere
// her çizimde YENİ işlev verilirse etkiler yeniden çalışır — ör. ortak Modal
// onClose değişince ilk alana odaklanır ve açık <select> menüsü kapanır.
import { useCallback, useLayoutEffect, useRef } from "react";

export function useStable(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args) => ref.current?.(...args), []);
}
