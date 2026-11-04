// Elitlig Araçlar — sabitler.
"use strict";

module.exports = {
  APP_NAME: "Elitlig Araçlar",
  API_ORIGIN: process.env.ELITLIG_API_ORIGIN || "https://elitlig-api-88a866b7a4da.herokuapp.com",
  SITE_ORIGIN: process.env.ELITLIG_SITE_ORIGIN || "https://elitlig.com",
  // Bir kez girişten sonra oturum bu kadar gün açık kalır. Sunucu masaüstü
  // girişlerine aynı süreli jeton verir (elitlig-server routes/User.js,
  // DESKTOP_SESSION_DAYS); uygulama jetonu bu süre içinde kendiliğinden yeniler.
  SESSION_DAYS: 90,
  USER_AGENT_MARK: "ElitligDesktop",
  // Her yerden hızlı not / görev / etkinlik penceresi (⌃⌥N).
  QUICK_SHORTCUT: "Control+Alt+N",
  REQUEST_TIMEOUT_MS: 20000,
};
