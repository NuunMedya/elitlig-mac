import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Quick from "./views/Quick";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import "./styles.css";

const quick = window.location.hash === "#quick";
// LED çıkış penceresi (Yayın Stüdyosu → LED ekran, 2. monitör): kabuk ve oturum yok.
const ledOutput = window.location.hash === "#led-output";
const LedOutput = lazy(() => import("./views/studio/led/LedOutput"));
// Masaüstü araç takımı paneli (⌃⌥Boşluk): ayrı, çerçevesiz pencere (app/toolkit.js).
const toolkit = window.location.hash === "#toolkit";
const Toolkit = lazy(() => import("./views/toolkit/Toolkit"));
// Raflar (#shelf, ⌃⌥T) ve Float rafı (#float): oturumsuz, yerel pencereler.
const shelfPanel = window.location.hash === "#shelf";
const floatShelf = window.location.hash === "#float";
const ShelfPanel = lazy(() => import("./views/shelf/ShelfPanel"));
const FloatShelf = lazy(() => import("./views/files/Float"));
// Masaüstü widget'ları (#widget=<tür>&id=<kimlik>): çerçevesiz, şeffaf küçük pencereler (app/widgets).
const widget = window.location.hash.startsWith("#widget=");
const Widget = lazy(() => import("./widgets/Widget"));
// Hızlı geçiş penceresi (#launcher, ⌃⌥O): araç / kayıt ara ve aç (app/launcher).
const launcher = window.location.hash === "#launcher";
const Launcher = lazy(() => import("./launcher/Launcher"));
// Tarayıcı · sabitlenen video penceresi (#browser-pip): denetim çubuğu (app/browser/pip.js).
const browserPip = window.location.hash === "#browser-pip";
const PipBar = lazy(() => import("./views/browser/PipBar"));

// Menüdeki Geri Al / Yinele: yazı alanındaysa yerel geri alma, değilse açık
// araca (ör. tablo düzenleyicisi) iletilir.
window.elitlig.onCommand((cmd) => {
  if (cmd !== "undo" && cmd !== "redo") return;
  const el = document.activeElement;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) document.execCommand(cmd);
  else window.dispatchEvent(new Event(`elitlig:${cmd}`));
});
document.documentElement.dataset.window = quick ? "quick" : ledOutput ? "led" : shelfPanel ? "shelf" : floatShelf ? "float" : widget ? "widget" : launcher ? "launcher" : browserPip ? "browser-pip" : "main";
// Platform sınıfı: Mac'te çerçevesiz pencere (trafik ışıkları), Windows'ta yerel
// çerçeve — üst boşluklar ve kaydırma çubukları buna göre ayarlanır (styles.css).
document.documentElement.classList.add(`platform-${String(window.elitlig.platform || "darwin").replace(/[^a-z0-9]/gi, "")}`);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {browserPip ? (
      <Suspense fallback={null}><PipBar /></Suspense>
    ) : ledOutput ? (
      <Suspense fallback={null}><LedOutput /></Suspense>
    ) : widget ? (
      <ToastProvider><Suspense fallback={null}><Widget /></Suspense></ToastProvider>
    ) : launcher ? (
      <ToastProvider><Suspense fallback={null}><Launcher /></Suspense></ToastProvider>
    ) : shelfPanel || floatShelf ? (
      <ToastProvider><ConfirmProvider><Suspense fallback={null}>{shelfPanel ? <ShelfPanel /> : <FloatShelf />}</Suspense></ConfirmProvider></ToastProvider>
    ) : (
      <ToastProvider>{quick ? <Quick /> : toolkit ? <Suspense fallback={null}><Toolkit /></Suspense> : <App />}</ToastProvider>
    )}
  </React.StrictMode>
);
