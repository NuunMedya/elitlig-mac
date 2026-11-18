// Grafik / arayüz süreci çökmeleri (ana süreç: app/crashMonitor.js) → kısa bildirim. 2.36.0.
import { useEffect } from "react";
import { useToast } from "../components/ui";

const KIND = { GPU: "Ekran kartı (grafik) süreci", renderer: "Arayüz süreci", Utility: "Yardımcı süreç" };

/** Olayın okunur metni. */
export function processGoneText(e) {
  const who = KIND[e?.type] || (e?.type ? `${e.type} süreci` : "Bir süreç");
  if (e?.kind === "unclean-exit") return "Önceki oturum beklenmedik şekilde kapanmıştı (günlüğe yazıldı).";
  const why = { crashed: "çöktü", oom: "bellek yetmedi", "launch-failed": "başlatılamadı", "integrity-failure": "bütünlük hatası", "abnormal-exit": "beklenmedik şekilde kapandı" }[e?.reason] || e?.reason || "kapandı";
  return `${who} ${why}${e?.exitCode != null ? ` (kod ${e.exitCode})` : ""}. Ayrıntı: Ayarlar › Performans › Çökme günlüğü.`;
}

export function useProcessGoneToasts() {
  const toast = useToast();
  useEffect(() => {
    const perf = window.elitlig?.perf;
    if (!perf?.onProcessGone) return undefined;
    const a = perf.onProcessGone((e) => toast(processGoneText(e), { tone: e?.type === "GPU" ? "error" : "warn", timeout: 9000 }));
    const b = perf.onSafeModeSuggested?.(({ count } = {}) => toast(`Ekran kartı süreci son 10 dakikada ${count} kez çöktü. Yayından sonra Ayarlar › Performans › Güvenli modda yeniden başlat önerilir.`, { tone: "error", timeout: 15000 }));
    return () => { a?.(); b?.(); };
  }, [toast]);
}
