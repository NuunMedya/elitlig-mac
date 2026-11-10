// Tarayıcı — sayfaya enjekte edilen CSS / betikler (sabitleme, karanlık kip, okuma kipi).
// Hepsi executeJavaScriptInIsolatedWorld ile çalışır: sayfanın betikleri bu işlevleri göremez,
// sayfaya uygulama API'si verilmez.
"use strict";

const ISOLATED_WORLD = 1077;

// Sabitle: sayfanın tamamı yerine yalnız oynatıcı pencereyi doldurur. YouTube'da oynatıcı
// kabı (#movie_player: kendi denetimleriyle), diğer sitelerde en büyük / oynayan <video>.
// Ataların transform / filter / contain özellikleri position:fixed'i bozar: geçici olarak kaldırılır.
const PIP_CSS = `
html.elitlig-pip-on, html.elitlig-pip-on body { overflow: hidden !important; background: #000 !important; }
html.elitlig-pip-on .elitlig-pip-anc { transform: none !important; filter: none !important; contain: none !important; will-change: auto !important; perspective: none !important; backdrop-filter: none !important; z-index: 2147483646 !important; position: static !important; overflow: visible !important; clip-path: none !important; mask: none !important; }
html.elitlig-pip-on .elitlig-pip-target { position: fixed !important; inset: 0 !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; min-width: 0 !important; min-height: 0 !important; margin: 0 !important; z-index: 2147483647 !important; background: #000 !important; border-radius: 0 !important; transform: none !important; }
html.elitlig-pip-on video.elitlig-pip-target, html.elitlig-pip-on .elitlig-pip-target video { object-fit: contain !important; width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; }
html.elitlig-pip-on ytd-app #masthead-container, html.elitlig-pip-on tp-yt-app-drawer { display: none !important; }
`;

function pipOn() {
  /* eslint-disable no-undef */
  const root = document.documentElement;
  const vids = [...document.querySelectorAll("video")].filter((v) => v.isConnected);
  const score = (v) => { const r = v.getBoundingClientRect(); return (v.paused ? 0 : 1e9) + r.width * r.height + (v.videoWidth || 0); };
  vids.sort((a, b) => score(b) - score(a));
  let target = null;
  if (/(^|\.)youtube\.com$/.test(location.hostname)) target = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  if (!target) target = vids[0] || null;
  for (const el of document.querySelectorAll(".elitlig-pip-target, .elitlig-pip-anc")) el.classList.remove("elitlig-pip-target", "elitlig-pip-anc");
  if (!target) { root.classList.remove("elitlig-pip-on"); return { ok: false, reason: "novideo" }; }
  target.classList.add("elitlig-pip-target");
  for (let p = target.parentElement; p && p !== document.body && p !== root; p = p.parentElement) p.classList.add("elitlig-pip-anc");
  root.classList.add("elitlig-pip-on");
  setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  setTimeout(() => window.dispatchEvent(new Event("resize")), 600);
  const v = target.tagName === "VIDEO" ? target : target.querySelector("video");
  return { ok: true, youtube: target.id === "movie_player", playing: v ? !v.paused : false };
  /* eslint-enable no-undef */
}

function pipOff() {
  /* eslint-disable no-undef */
  for (const el of document.querySelectorAll(".elitlig-pip-target, .elitlig-pip-anc")) el.classList.remove("elitlig-pip-target", "elitlig-pip-anc");
  document.documentElement.classList.remove("elitlig-pip-on");
  setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  return true;
  /* eslint-enable no-undef */
}

/** Oynatma denetimi: "toggle" | "play" | "pause" | "back" | "fwd" | "mute" | "state" */
function mediaControl(action) {
  /* eslint-disable no-undef */
  const vids = [...document.querySelectorAll("video")];
  const score = (v) => (v.paused ? 0 : 1e9) + v.getBoundingClientRect().width * v.getBoundingClientRect().height;
  const v = document.querySelector(".elitlig-pip-target video, video.elitlig-pip-target") || vids.sort((a, b) => score(b) - score(a))[0];
  if (!v) return { ok: false };
  if (action === "toggle") { if (v.paused) v.play().catch(() => {}); else v.pause(); }
  if (action === "play") v.play().catch(() => {});
  if (action === "pause") v.pause();
  if (action === "back") v.currentTime = Math.max(0, v.currentTime - 10);
  if (action === "fwd") v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 10);
  if (action === "mute") v.muted = !v.muted;
  return { ok: true, paused: v.paused, muted: v.muted, time: v.currentTime, duration: Number.isFinite(v.duration) ? v.duration : null };
  /* eslint-enable no-undef */
}

/** Yerel resim içinde resim (Chromium PiP penceresi). */
async function nativePip() {
  /* eslint-disable no-undef */
  if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return { ok: true, on: false }; }
  const vids = [...document.querySelectorAll("video")].filter((v) => v.readyState > 0 && !v.disablePictureInPicture);
  vids.sort((a, b) => (b.paused ? 0 : 1) - (a.paused ? 0 : 1) || b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
  if (!vids[0]) return { ok: false, reason: "novideo" };
  try { await vids[0].requestPictureInPicture(); return { ok: true, on: true }; } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  /* eslint-enable no-undef */
}

// Karanlık kipi zorla: açık renkli sayfa ters çevrilir, görsel / video eski hâline döner.
const DARK_CSS = `
html { filter: invert(0.92) hue-rotate(180deg) !important; background: #fff !important; }
img, video, picture, canvas, iframe, svg image, [style*="background-image"], embed, object { filter: invert(1) hue-rotate(180deg) !important; }
`;

/** Okuma kipi: ana metni bul → { title, byline, site, blocks: [{ t: "h"|"p"|"li"|"quote"|"img"|"pre", text|src }] } */
function readerExtract() {
  /* eslint-disable no-undef */
  const bad = /comment|sidebar|footer|nav|menu|share|social|related|promo|advert|cookie|banner|subscribe|newsletter|popup|modal/i;
  const cands = [...document.querySelectorAll("article, main, [role=main], .post, .article, .entry-content, .content, #content, section, div")];
  let best = null;
  let bestScore = 0;
  for (const el of cands.slice(0, 3000)) {
    if (bad.test(`${el.className} ${el.id}`) && el.tagName !== "ARTICLE") continue;
    const ps = el.querySelectorAll(":scope > p, :scope > div > p, :scope > section > p");
    let len = 0;
    for (const p of ps) len += (p.textContent || "").trim().length;
    const score = len + (el.tagName === "ARTICLE" ? 400 : 0) + (el.tagName === "MAIN" ? 200 : 0);
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (!best || bestScore < 200) best = document.body;
  const blocks = [];
  const walk = (node) => {
    for (const el of node.children) {
      if (blocks.length > 800) return;
      const tag = el.tagName;
      if (/^(SCRIPT|STYLE|NOSCRIPT|NAV|FOOTER|ASIDE|FORM|BUTTON|IFRAME|SVG)$/.test(tag)) continue;
      if (bad.test(`${typeof el.className === "string" ? el.className : ""} ${el.id}`) && !/^(P|H\d)$/.test(tag)) continue;
      const text = (el.innerText || el.textContent || "").replace(/\s+\n/g, "\n").trim();
      if (/^H[1-6]$/.test(tag)) { if (text) blocks.push({ t: "h", level: Number(tag[1]), text: text.slice(0, 400) }); continue; }
      if (tag === "P") { if (text.length > 1) blocks.push({ t: "p", text: text.slice(0, 8000) }); continue; }
      if (tag === "LI") { if (text) blocks.push({ t: "li", text: text.slice(0, 2000) }); continue; }
      if (tag === "BLOCKQUOTE") { if (text) blocks.push({ t: "quote", text: text.slice(0, 4000) }); continue; }
      if (tag === "PRE") { blocks.push({ t: "pre", text: (el.textContent || "").slice(0, 8000) }); continue; }
      if (tag === "IMG") { const src = el.currentSrc || el.src; if (src && /^https?:/.test(src) && (el.naturalWidth || 0) >= 200) blocks.push({ t: "img", src, alt: el.alt || "" }); continue; }
      if (tag === "FIGURE" || tag === "PICTURE") { const img = el.querySelector("img"); const src = img && (img.currentSrc || img.src); if (src && /^https?:/.test(src)) blocks.push({ t: "img", src, alt: img.alt || "" }); const cap = el.querySelector("figcaption"); if (cap && cap.textContent.trim()) blocks.push({ t: "caption", text: cap.textContent.trim().slice(0, 400) }); continue; }
      walk(el);
    }
  };
  walk(best);
  const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content || "";
  const words = blocks.reduce((s, b) => s + (b.text ? b.text.split(/\s+/).length : 0), 0);
  return { title: meta("og:title") || document.title, byline: meta("author") || meta("article:author") || "", site: meta("og:site_name") || location.hostname, url: location.href, minutes: Math.max(1, Math.round(words / 200)), blocks };
  /* eslint-enable no-undef */
}

const call = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;

module.exports = {
  ISOLATED_WORLD, PIP_CSS, DARK_CSS,
  PIP_ON: call(pipOn), PIP_OFF: call(pipOff),
  mediaControlScript: (action) => call(mediaControl, String(action || "state")),
  NATIVE_PIP: call(nativePip), READER: call(readerExtract),
  call,
};
