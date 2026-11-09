// Yayın Stüdyosu — "DIŞARI GİDEN TÜM SESLERİ KAPAT" (yerel çıkış: hoparlör / kulaklık).
//
// Yerel dinleme yayın karışımından ayrıdır: bütün uygulama pencerelerinin (stüdyo, gizli müzik
// penceresi, LED, yardımcı pencereler) SES ÇIKIŞI webContents.setAudioMuted ile kapatılır. Chromium'da
// sessize alınan bir sekmenin sesi hoparlöre gitmez ama işlenmeye devam eder:
//   · stüdyonun WebAudio karışımı (MediaStreamAudioDestinationNode → kodlayıcı) bir çıkış akışı değildir,
//     yayına giden ses etkilenmez;
//   · müzik penceresinin sekme sesi yakalaması ("Yayına da ver") susturucudan önce alınır, yayına gitmeye
//     devam eder (yalnız yerel yankı susar).
// Ekran dışı (offscreen) web kaynakları dokunulmaz: zaten hoparlöre çalmazlar.
//
// IPC
//   invoke studio:outMute:set (on) → { ok, on, windows }
//   invoke studio:outMute:get      → { on }
"use strict";

function createOutMute({ BrowserWindow, ipcMain, app = null, log = () => {} } = {}) {
  let on = false;
  const targets = () => {
    const list = [];
    for (const w of BrowserWindow?.getAllWindows?.() || []) {
      try {
        if (!w || w.isDestroyed?.()) continue;
        const wc = w.webContents;
        if (!wc || wc.isDestroyed?.() || wc.isOffscreen?.()) continue;
        list.push(wc);
      } catch { /* sonraki */ }
    }
    return list;
  };
  function apply(next) {
    on = Boolean(next);
    let n = 0;
    for (const wc of targets()) {
      try { wc.setAudioMuted(on); n += 1; } catch (e) { log("outMute", e?.message || String(e)); }
    }
    return n;
  }
  function register() {
    ipcMain.handle("studio:outMute:set", (_e, value) => {
      const windows = apply(value);
      return { ok: true, on, windows };
    });
    ipcMain.handle("studio:outMute:get", () => ({ on }));
    // Kapalıyken açılan yeni pencereler (müzik penceresi, LED…) de sessiz başlar.
    app?.on?.("browser-window-created", (_e, win) => {
      if (!on) return;
      try { if (!win.webContents.isOffscreen?.()) win.webContents.setAudioMuted(true); } catch { /* yoksay */ }
    });
  }
  return { register, apply, isOn: () => on };
}

module.exports = { createOutMute };
