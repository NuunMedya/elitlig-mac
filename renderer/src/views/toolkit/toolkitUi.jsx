// Araç takımı — ortak küçük parçalar (panoya kopyala, yerel tercih, köprü).
import React, { useCallback, useState } from "react";
import { Icon, useToast } from "../../components/ui";

export const deskkit = () => { try { return window.elitlig?.deskkit || null; } catch { return null; } };

/** Panoya kopyala + kısa bildirim. */
export function useCopy() {
  const toast = useToast();
  return useCallback(async (text, what = "Kopyalandı") => {
    try {
      await navigator.clipboard.writeText(String(text));
      toast(`${what}.`, { tone: "success", timeout: 1600 });
      return true;
    } catch {
      toast("Panoya kopyalanamadı.", { tone: "error" });
      return false;
    }
  }, [toast]);
}

/** localStorage'da tutulan küçük tercih (okunamazsa varsayılan; yazılamazsa yalnız bellekte). */
export function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw == null ? initial : JSON.parse(raw); } catch { return initial; }
  });
  const set = useCallback((v) => setValue((cur) => {
    const next = typeof v === "function" ? v(cur) : v;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* yoksay */ }
    return next;
  }), [key]);
  return [value, set];
}

/** Kopyalanabilir değer satırı. */
export function CopyRow({ label, value, mono = true, onCopy }) {
  return (
    <button type="button" className="tk-copy" onClick={() => onCopy(value, `${label} kopyalandı`)} title="Kopyalamak için tıklayın">
      <span className="tk-copy__label">{label}</span>
      <span className={`tk-copy__value${mono ? " is-mono" : ""}`}>{value}</span>
      <Icon name="copy" size={13} />
    </button>
  );
}
