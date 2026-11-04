import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Quick from "./views/Quick";
import { ToastProvider } from "./components/ui";
import "./styles.css";

const quick = window.location.hash === "#quick";

// Menüdeki Geri Al / Yinele: yazı alanındaysa yerel geri alma, değilse açık
// araca (ör. tablo düzenleyicisi) iletilir.
window.elitlig.onCommand((cmd) => {
  if (cmd !== "undo" && cmd !== "redo") return;
  const el = document.activeElement;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName))) document.execCommand(cmd);
  else window.dispatchEvent(new Event(`elitlig:${cmd}`));
});
document.documentElement.dataset.window = quick ? "quick" : "main";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>{quick ? <Quick /> : <App />}</ToastProvider>
  </React.StrictMode>
);
