import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Quick from "./views/Quick";
import { ToastProvider } from "./components/ui";
import "./styles.css";

const quick = window.location.hash === "#quick";
// LED çıkış penceresi (Yayın Stüdyosu → LED ekran, 2. monitör): kabuk ve oturum yok.
const ledOutput = window.location.hash === "#led-output";
const LedOutput = lazy(() => import("./views/studio/led/LedOutput"));
// Masaüstü araç takımı paneli (⌃⌥Boşluk): ayrı, çerçevesiz pencere (app/toolkit.js).
const toolkit = window.location.hash === "#toolkit";
const Toolkit = lazy(() => import("./views/toolkit/Toolkit"));

// Menüdeki Geri Al / Yinele: yazı alanındaysa yerel geri alma, değilse açık
// araca (ör. tablo düzenleyicisi) iletilir.
window.elitlig.onCommand((cmd) => {
  if (cmd !== "undo" && cmd !== "redo") return;
  const el = document.activeElement;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) document.execCommand(cmd);
  else window.dispatchEvent(new Event(`elitlig:${cmd}`));
});
document.documentElement.dataset.window = quick ? "quick" : ledOutput ? "led" : "main";
// Platform sınıfı: Mac'te çerçevesiz pencere (trafik ışıkları), Windows'ta yerel
// çerçeve — üst boşluklar ve kaydırma çubukları buna göre ayarlanır (styles.css).
document.documentElement.classList.add(`platform-${String(window.elitlig.platform || "darwin").replace(/[^a-z0-9]/gi, "")}`);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {ledOutput ? (
      <Suspense fallback={null}><LedOutput /></Suspense>
    ) : (
      <ToastProvider>{quick ? <Quick /> : toolkit ? <Suspense fallback={null}><Toolkit /></Suspense> : <App />}</ToastProvider>
    )}
  </React.StrictMode>
);
