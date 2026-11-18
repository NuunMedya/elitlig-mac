// ELİTLİG STÜDYO — bağımsız uygulamanın arayüz girişi (renderer/studio.html, 2.36.0).
//
// Yalnız Yayın Stüdyosu (ve ayarları) kurulur: kenar çubuğu, çalışma alanı sekmeleri, araç takımı,
// mesajlar, tablolar, müzik çalar vb. bu paketin JS yığınına / React ağacına hiç girmez.
// #led-output: LED çıkış penceresi (2. monitör), oturumsuz.
import "./lib/perf/reactStats";
import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { importFromAraclar } from "./lib/studioMigration";
import "./styles.css";

const ledOutput = window.location.hash === "#led-output";
const LedOutput = lazy(() => import("./views/studio/led/LedOutput"));
const StudioApp = lazy(() => import("./studioApp/StudioApp"));

document.documentElement.dataset.window = ledOutput ? "led" : "main";
document.documentElement.dataset.app = "studio";
document.documentElement.classList.add(`platform-${String(window.elitlig?.platform || "darwin").replace(/[^a-z0-9]/gi, "")}`);

async function boot() {
  // İlk açılış: Elitlig Araçlar'daki stüdyo ayarları (sahneler, yerleşim, kısayollar …) React'ten ÖNCE yazılır.
  let migration = null;
  if (!ledOutput) {
    try { migration = await importFromAraclar(window.elitlig?.studioApp, window.localStorage); } catch { migration = null; }
    // Menü: "Elitlig Araçlar'dan stüdyo ayarlarını içe aktar…" → zorla aktar ve yeniden yükle.
    window.elitlig?.studioApp?.onReimport?.(async () => {
      try { await importFromAraclar(window.elitlig.studioApp, window.localStorage, { force: true }); } catch { /* yoksay */ }
      window.location.reload();
    });
  }
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      {ledOutput ? (
        <Suspense fallback={null}><LedOutput /></Suspense>
      ) : (
        <ToastProvider><ConfirmProvider><Suspense fallback={null}><StudioApp migration={migration} /></Suspense></ConfirmProvider></ToastProvider>
      )}
    </React.StrictMode>,
  );
}
boot();
