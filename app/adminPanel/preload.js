// Gömülü yönetim paneli (elitlig.com) için ön yükleme betiği.
//
// Bu betik yalnız Yönetim bölümünün ayrı oturum bölmesinde (persist:elitlig-admin),
// sandbox + contextIsolation ile çalışır; sayfaya Node ya da Electron açılmaz.
// Görevleri:
//   - Sayfa betikleri çalışmadan ÖNCE masaüstü oturum jetonunu web'in kendi
//     anahtarına (localStorage "accessToken") ve kullanıcı önbelleğine ("user")
//     yazmak: panel ayrı giriş istemeden açılır. Jeton URL'ye hiç konmaz; ana
//     süreç yalnız SITE_ORIGIN çerçevesine verir.
//   - Jeton yenilenince / oturum kapanınca localStorage'ı eşitlemek.
//   - Web'in "tam panel" modunu tanıması için window.elitligDesktopPanel köprüsü
//     (src/utils/desktopApp.js: çıkış, oturum sonu ve görünen menünün bildirimi).
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const TOKEN_KEY = "accessToken";
const LEGACY_TOKEN_KEY = "token";

let boot = null;
try { boot = ipcRenderer.sendSync("admin-panel:bootstrap"); } catch { boot = null; }

const writeSession = (session) => {
  try {
    if (session?.token) {
      localStorage.setItem(TOKEN_KEY, session.token);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      if (session.user) {
        // Web önbelleğindeki kullanıcı başka biriyse ya da yoksa masaüstünün kullanıcısı yazılır;
        // web açılışta /api/users/verify ile yine sunucudan tazeler (UserContext).
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem("user") || "null"); } catch { cached = null; }
        const same = cached && String(cached.id ?? cached.username) === String(session.user.id ?? session.user.username);
        localStorage.setItem("user", JSON.stringify(same ? { ...cached, ...session.user } : session.user));
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem("user");
    }
  } catch { /* depolama kapalı */ }
};

if (boot && boot.allowed) {
  writeSession(boot.session);

  ipcRenderer.on("admin-panel:session", (_e, session) => writeSession(session));

  contextBridge.exposeInMainWorld("elitligDesktopPanel", {
    panel: true,
    version: String(boot.version || ""),
    platform: process.platform,
    // Web'in "Çıkış yap"ı: masaüstü oturumu kapatır (onayı masaüstü sorar).
    signOut: () => ipcRenderer.send("admin-panel:signOut"),
    // Web 401 aldı: masaüstü oturumu doğrular; gerekirse kendi giriş ekranını açar.
    sessionExpired: () => ipcRenderer.send("admin-panel:sessionExpired"),
    // Web'in kullanıcıya gösterdiği menü (yetkiyle süzülmüş): masaüstünün Yönetim listesi.
    publishNav: (groups) => {
      try { ipcRenderer.send("admin-panel:nav", JSON.parse(JSON.stringify(groups))); } catch { /* geçersiz veri */ }
    },
  });
}
