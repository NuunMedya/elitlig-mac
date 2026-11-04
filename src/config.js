// Elitlig Araçlar — Mac masaüstü uygulamasının sabitleri.
"use strict";

const SITE_ORIGIN = process.env.ELITLIG_SITE_ORIGIN || "https://elitlig.com";
const API_ORIGIN = process.env.ELITLIG_API_ORIGIN || "https://elitlig-api-88a866b7a4da.herokuapp.com";

// Uygulamanın içinde açılabilen site adresleri. Bunların dışındaki her bağlantı
// (WhatsApp, telefon, e-posta, harita, başka siteler) Mac'in varsayılan
// uygulamasında açılır.
const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, "https://elitlig.com", "https://www.elitlig.com"]);

const TOOLS_PATH = "/yonetim/araclar";
const LOGIN_PATH = "/yonetim/giris";

// Sitedeki Araçlar menüsüyle aynı sıra (elitlig-client src/editor_pages/adminNav.js).
const TOOLS = [
  { key: "hub", name: "Araçlar Merkezi", path: TOOLS_PATH, accelerator: "CmdOrCtrl+0" },
  { key: "todos", name: "Yapılacaklar Listesi", path: "/yonetim/yapilacaklar", accelerator: "CmdOrCtrl+1" },
  { key: "agenda", name: "Ajanda ve Takvim", path: `${TOOLS_PATH}/ajanda`, accelerator: "CmdOrCtrl+2" },
  { key: "notes", name: "Not Defteri", path: `${TOOLS_PATH}/not-defteri`, accelerator: "CmdOrCtrl+3" },
  { key: "ledger", name: "Ön Muhasebe", path: `${TOOLS_PATH}/on-muhasebe`, accelerator: "CmdOrCtrl+4" },
  { key: "sheets", name: "Tablolar", path: `${TOOLS_PATH}/tablolar`, accelerator: "CmdOrCtrl+5" },
  { key: "contacts", name: "Rehber", path: `${TOOLS_PATH}/rehber`, accelerator: "CmdOrCtrl+6" },
  { key: "calc", name: "Hesap Araçları", path: `${TOOLS_PATH}/hesap-araclari`, accelerator: "CmdOrCtrl+7" },
  { key: "focus", name: "Odak Sayacı", path: `${TOOLS_PATH}/odak-sayaci`, accelerator: "CmdOrCtrl+8" },
];

// Kalıcı oturum bölümü: çerezler ve yerel depolama uygulama kapansa da saklanır.
// Sunucu masaüstü uygulamasına 90 günlük oturum verir (elitlig-server
// routes/User.js, DESKTOP_SESSION_DAYS); oturum bu bölümde 3 ay boyunca kalır.
const SESSION_PARTITION = "persist:elitlig";

// Sunucu ve site masaüstü uygulamasını bu imden tanır.
const USER_AGENT_MARK = "ElitligDesktop";

module.exports = { SITE_ORIGIN, API_ORIGIN, ALLOWED_ORIGINS, TOOLS_PATH, LOGIN_PATH, TOOLS, SESSION_PARTITION, USER_AGENT_MARK };
