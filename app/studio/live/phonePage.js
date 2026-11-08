// Yayın Stüdyosu — telefon kamerası sayfası (telefonun tarayıcısında açılır).
//
// QR kod → https://<bilgisayarın yerel IP'si>:<port>/p/<eşleme kodu>
// Sayfa kamerayı + mikrofonu açar, WebSocket (wss://…/ws/<kod>) ile stüdyoya
// bağlanır ve WebRTC teklifini (tüm ICE adaylarıyla, STUN'suz: yalnız yerel ağ)
// yollar. Stüdyo yanıtlar; görüntü doğrudan telefon → bilgisayar akar.
//
//   - Arka / ön kamera, çözünürlük (480p–4K), kare hızı, mikrofon, yakınlaştırma
//     (destekleyen telefonda), fener; değişiklikler yeniden bağlanmadan
//     (replaceTrack) uygulanır.
//   - Bağlantı koparsa 1, 2, 4, 8 sn arayla kendiliğinden yeniden bağlanır;
//     kamera açık kalır. Ekran kilitlenmesin diye Wake Lock istenir.
//   - "Yayında" ışığı: kaynak PROGRAM'daysa kırmızı, ÖNİZLEME'deyse yeşil çerçeve.
//   - Stüdyo uzaktan kamera / çözünürlük değiştirebilir ({ t: "config" }).
"use strict";

const PHONE_PAGE = String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#140a20">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Elitlig · Telefon kamerası</title>
<style>
  :root { color-scheme: dark; --bg:#0b0612; --card:#160d20; --line:#2c1d3d; --text:#f4efff; --muted:#a99bbf; --brand:#7c3aed; --pgm:#ff2d55; --pvw:#22c55e; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 15px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
  body { display: flex; flex-direction: column; min-height: 100%; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
  header b { font-size: 16px; }
  #dot { width: 10px; height: 10px; border-radius: 50%; background: #666; flex: none; }
  #dot.is-on { background: var(--pvw); box-shadow: 0 0 10px var(--pvw); }
  #dot.is-wait { background: #f59e0b; }
  #state { color: var(--muted); font-size: 13px; margin-left: auto; text-align: right; }
  .stage { position: relative; margin: 0 10px; border-radius: 14px; overflow: hidden; background: #000; border: 4px solid transparent; flex: 1; min-height: 200px; display: flex; align-items: center; justify-content: center; }
  .stage.is-program { border-color: var(--pgm); }
  .stage.is-preview { border-color: var(--pvw); }
  .stage video { width: 100%; height: 100%; object-fit: contain; background: #000; }
  .tally { position: absolute; top: 10px; left: 10px; padding: 3px 9px; border-radius: 6px; font-weight: 800; font-size: 12px; letter-spacing: .06em; display: none; }
  .stage.is-program .tally { display: block; background: var(--pgm); }
  .stage.is-preview .tally { display: block; background: var(--pvw); color: #04140a; }
  .hint { position: absolute; inset: auto 10px 10px 10px; background: rgba(0,0,0,.6); padding: 8px 10px; border-radius: 10px; font-size: 13px; color: #ddd; }
  .controls { padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .controls label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  select, button { font: inherit; color: var(--text); background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
  button { font-weight: 700; }
  .wide { grid-column: 1 / -1; }
  #go { background: var(--brand); border-color: var(--brand); font-size: 17px; padding: 14px; }
  #go.is-stop { background: #3a1d4f; border-color: #5b2b7d; }
  .row { display: flex; gap: 8px; }
  .row > * { flex: 1; }
  .toggle { display: flex !important; flex-direction: row !important; align-items: center; gap: 8px !important; font-size: 14px !important; color: var(--text) !important; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
  .toggle input { width: 20px; height: 20px; }
  #zoomWrap { display: none; }
  input[type=range] { width: 100%; }
  .err { color: #fca5a5; }
  footer { color: var(--muted); font-size: 12px; padding: 4px 14px 12px; }
  footer a { color: #c4b5fd; }
</style>
</head>
<body>
<header><span id="dot"></span><b>Elitlig · Telefon kamerası</b><span id="state">Hazır</span></header>
<div class="stage" id="stage">
  <video id="v" playsinline muted autoplay></video>
  <span class="tally" id="tally">YAYINDA</span>
  <div class="hint" id="hint">“Kamerayı aç”a dokun. En iyi görüntü için telefonu <b>yatay</b> tut ve şarja tak.</div>
</div>
<div class="controls">
  <label>Kamera<select id="facing"><option value="environment">Arka kamera</option><option value="user">Ön kamera (selfie)</option></select></label>
  <label>Çözünürlük<select id="res"><option value="480">480p</option><option value="720" selected>720p (önerilen)</option><option value="1080">1080p</option><option value="2160">4K (destekleyen telefonda)</option></select></label>
  <label>Kare hızı<select id="fps"><option>24</option><option selected>30</option><option>60</option></select></label>
  <label class="toggle"><input type="checkbox" id="mic" checked> Mikrofon</label>
  <label class="wide" id="zoomWrap">Yakınlaştırma<input type="range" id="zoom" min="1" max="1" step="0.1" value="1"></label>
  <div class="row wide"><button type="button" id="torch" hidden>Fener</button><button type="button" id="flip">Kamerayı çevir</button></div>
  <button type="button" class="wide" id="go">Kamerayı aç</button>
</div>
<footer>Bu sayfa yalnız yerel ağda çalışır; görüntü doğrudan bilgisayara gider. Uyarı görmemek için <a href="/ca.crt">sertifikayı yükleyebilirsin</a>.</footer>
<script>
(function () {
  var token = (location.pathname.match(/\/p\/([A-Za-z0-9]+)/) || [])[1] || "";
  var $ = function (id) { return document.getElementById(id); };
  var video = $("v"), stage = $("stage"), stateEl = $("state"), dot = $("dot"), hint = $("hint");
  var stream = null, ws = null, pc = null, running = false, retry = 0, retryTimer = null, wakeLock = null, tally = null, lastSettings = null;
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem("elitlig.phone") || "{}"); } catch (e) { saved = {}; }
  if (saved.facing) $("facing").value = saved.facing;
  if (saved.res) $("res").value = saved.res;
  if (saved.fps) $("fps").value = saved.fps;
  if (saved.mic === false) $("mic").checked = false;

  function setState(text, kind) { stateEl.textContent = text; dot.className = kind === "on" ? "is-on" : kind === "wait" ? "is-wait" : ""; }
  function settings() { return { facing: $("facing").value, res: Number($("res").value), fps: Number($("fps").value), mic: $("mic").checked }; }
  function persist() { try { localStorage.setItem("elitlig.phone", JSON.stringify(settings())); } catch (e) {} }
  function dims(res) { var h = res; var w = Math.round(h * 16 / 9); return { w: w, h: h }; }
  function maxBitrate(res, fps) { var base = res >= 2160 ? 20e6 : res >= 1080 ? 8e6 : res >= 720 ? 4e6 : 1.5e6; return fps > 30 ? base * 1.5 : base; }

  function videoConstraints(s) {
    var d = dims(s.res);
    // Yatay / dikey: telefon kendi yönüne göre döndürür; ideal değerler yeter.
    return { facingMode: { ideal: s.facing }, width: { ideal: d.w }, height: { ideal: d.h }, frameRate: { ideal: s.fps, max: s.fps } };
  }
  function audioConstraints() { return { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }; }

  function getMedia(s) {
    return navigator.mediaDevices.getUserMedia({ video: videoConstraints(s), audio: s.mic ? audioConstraints() : false });
  }

  function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

  function describe() {
    var vt = stream && stream.getVideoTracks()[0];
    var st = vt && vt.getSettings ? vt.getSettings() : {};
    return { width: st.width || null, height: st.height || null, fps: st.frameRate ? Math.round(st.frameRate) : null, facing: st.facingMode || settings().facing, label: vt ? vt.label : "", audio: Boolean(stream && stream.getAudioTracks().length) };
  }

  function updateCaps() {
    var vt = stream && stream.getVideoTracks()[0];
    var caps = vt && vt.getCapabilities ? vt.getCapabilities() : {};
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      $("zoomWrap").style.display = "flex";
      $("zoom").min = caps.zoom.min; $("zoom").max = caps.zoom.max; $("zoom").step = caps.zoom.step || 0.1;
      var cur = vt.getSettings().zoom; if (cur) $("zoom").value = cur;
    } else $("zoomWrap").style.display = "none";
    $("torch").hidden = !caps.torch;
  }

  function senderOf(kind) {
    if (!pc) return null;
    var tr = pc.getTransceivers().find(function (t) { return t.receiver && t.receiver.track && t.receiver.track.kind === kind; });
    return tr ? tr.sender : null;
  }

  function closePc() { if (pc) { try { pc.close(); } catch (e) {} pc = null; } }

  function gathered(p) {
    return new Promise(function (resolve) {
      if (p.iceGatheringState === "complete") return resolve();
      var done = function () { if (p.iceGatheringState === "complete") { p.removeEventListener("icegatheringstatechange", done); resolve(); } };
      p.addEventListener("icegatheringstatechange", done);
      setTimeout(resolve, 2500);
    });
  }

  function applyBitrate() {
    if (!pc) return;
    var s = settings();
    pc.getSenders().forEach(function (snd) {
      if (!snd.track || snd.track.kind !== "video" || !snd.getParameters) return;
      var p = snd.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = maxBitrate(s.res, s.fps);
      p.degradationPreference = "maintain-resolution";
      try { snd.setParameters(p).catch(function () {}); } catch (e) {}
    });
  }

  function negotiate() {
    closePc();
    if (!stream) return;
    pc = new RTCPeerConnection({ iceServers: [] });
    var mine = pc;
    stream.getTracks().forEach(function (t) { pc.addTransceiver(t, { direction: "sendonly", streams: [stream] }); });
    pc.onconnectionstatechange = function () {
      if (mine !== pc) return;
      var st = pc.connectionState;
      if (st === "connected") { retry = 0; setState("Bağlı · stüdyoya gidiyor", "on"); hint.style.display = "none"; applyBitrate(); send({ t: "state", media: describe() }); }
      else if (st === "failed") { setState("Görüntü bağlantısı koptu, yeniden kuruluyor…", "wait"); setTimeout(function () { if (mine === pc && running) negotiate(); }, 1000); }
      else if (st === "disconnected") setState("Bağlantı zayıf…", "wait");
    };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(mine); }).then(function () {
      if (mine !== pc) return;
      send({ t: "offer", sdp: pc.localDescription.sdp, media: describe() });
    }).catch(function (e) { setState("Hata: " + e.message, ""); });
  }

  function connect() {
    if (!running) return;
    clearTimeout(retryTimer);
    setState(retry ? "Stüdyoya yeniden bağlanıyor…" : "Stüdyoya bağlanıyor…", "wait");
    var url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/" + token;
    var sock = new WebSocket(url);
    ws = sock;
    sock.onopen = function () { send({ t: "hello", ua: navigator.userAgent, settings: settings(), media: describe() }); negotiate(); };
    sock.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "answer" && pc) { pc.setRemoteDescription({ type: "answer", sdp: m.sdp }).catch(function (e) { setState("Yanıt hatası: " + e.message, ""); }); }
      else if (m.t === "renegotiate") negotiate();
      else if (m.t === "tally") setTally(m.state);
      else if (m.t === "config") applyRemote(m);
      else if (m.t === "replaced") { running = false; setState("Bu kaynağa başka bir telefon bağlandı.", ""); stopAll(true); }
      else if (m.t === "unknown") { running = false; setState("Eşleme kodu geçersiz: stüdyodaki QR kodu yeniden okutun.", ""); stopAll(true); }
      else if (m.t === "name" && m.name) document.title = m.name + " · Elitlig";
    };
    sock.onclose = function () {
      if (ws !== sock) return;
      ws = null;
      closePc();
      if (!running) return;
      retry += 1;
      var wait = Math.min(8000, 1000 * Math.pow(2, Math.min(3, retry - 1)));
      setState("Stüdyo bağlantısı yok, " + Math.round(wait / 1000) + " sn sonra yeniden…", "wait");
      retryTimer = setTimeout(connect, wait);
    };
  }

  function setTally(state) {
    tally = state;
    stage.className = "stage" + (state === "program" ? " is-program" : state === "preview" ? " is-preview" : "");
    $("tally").textContent = state === "program" ? "YAYINDA" : "ÖNİZLEMEDE";
    if (state === "program" && navigator.vibrate) navigator.vibrate(60);
  }

  function replaceVideo(s) {
    // Ön / arka değişimi: bazı telefonlar iki kamerayı aynı anda açamaz → önce eskisini kapat.
    var old = stream && stream.getVideoTracks()[0];
    if (old) old.stop();
    return navigator.mediaDevices.getUserMedia({ video: videoConstraints(s), audio: false }).then(function (ns) {
      var nt = ns.getVideoTracks()[0];
      if (old) stream.removeTrack(old);
      stream.addTrack(nt);
      video.srcObject = stream;
      var sender = senderOf("video");
      if (sender) return sender.replaceTrack(nt).then(function () { applyBitrate(); updateCaps(); send({ t: "state", media: describe() }); });
      updateCaps();
      return null;
    });
  }

  function replaceAudio(on) {
    var old = stream && stream.getAudioTracks()[0];
    var sender = senderOf("audio");
    if (!on) { if (old) { old.stop(); stream.removeTrack(old); } if (sender) sender.replaceTrack(null); send({ t: "state", media: describe() }); return Promise.resolve(); }
    if (old) return Promise.resolve();
    return navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false }).then(function (as) {
      var at = as.getAudioTracks()[0];
      stream.addTrack(at);
      if (sender) return sender.replaceTrack(at);
      negotiate(); // ilk açılışta ses yoktu: yeni hat için yeniden teklif
      return null;
    });
  }

  function applyRemote(m) {
    if (m.facing) $("facing").value = m.facing;
    if (m.res) $("res").value = String(m.res);
    if (m.fps) $("fps").value = String(m.fps);
    if (typeof m.mic === "boolean") $("mic").checked = m.mic;
    onSettings();
  }

  function onSettings() {
    persist();
    if (!stream) return;
    var s = settings();
    var prev = lastSettings || s;
    lastSettings = s;
    var chain = Promise.resolve();
    if (prev.facing !== s.facing || prev.res !== s.res || prev.fps !== s.fps) chain = chain.then(function () { return replaceVideo(s); });
    if (prev.mic !== s.mic) chain = chain.then(function () { return replaceAudio(s.mic); });
    chain.catch(function (e) { setState("Kamera değiştirilemedi: " + e.message, ""); });
  }

  function lockScreen() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && running) lockScreen(); });

  function stopAll(keepState) {
    running = false;
    clearTimeout(retryTimer);
    closePc();
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    video.srcObject = null;
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    $("go").textContent = "Kamerayı aç"; $("go").className = "wide";
    if (!keepState) setState("Durduruldu", "");
    setTally(null);
  }

  $("go").onclick = function () {
    if (running) { stopAll(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState("Bu tarayıcı kameraya izin vermiyor (HTTPS gerekli).", "");
      hint.innerHTML = '<span class="err">Kamera açılamıyor. Sayfa güvenli (https) açılmalı: QR kodu yeniden okutun ve uyarıda “Ayrıntılar › Bu web sitesini ziyaret et” deyin.</span>';
      return;
    }
    var s = settings();
    lastSettings = s;
    setState("Kamera açılıyor…", "wait");
    getMedia(s).then(function (st) {
      stream = st;
      video.srcObject = st;
      video.play().catch(function () {});
      running = true;
      retry = 0;
      $("go").textContent = "Durdur"; $("go").className = "wide is-stop";
      hint.textContent = "Stüdyoya bağlanıyor… Telefonu yatay tut.";
      updateCaps();
      lockScreen();
      connect();
    }).catch(function (e) {
      setState("Kamera açılamadı", "");
      hint.innerHTML = '<span class="err">' + (e && e.name === "NotAllowedError" ? "Kamera izni verilmedi. Tarayıcı ayarlarından bu siteye kamera izni ver." : "Kamera açılamadı: " + (e && e.message || e)) + "</span>";
    });
  };
  ["facing", "res", "fps", "mic"].forEach(function (id) { $(id).onchange = onSettings; });
  $("flip").onclick = function () { $("facing").value = $("facing").value === "user" ? "environment" : "user"; onSettings(); };
  $("zoom").oninput = function () { var vt = stream && stream.getVideoTracks()[0]; if (vt) vt.applyConstraints({ advanced: [{ zoom: Number($("zoom").value) }] }).catch(function () {}); };
  var torchOn = false;
  $("torch").onclick = function () { var vt = stream && stream.getVideoTracks()[0]; if (!vt) return; torchOn = !torchOn; vt.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(function () {}); };
  // Pil durumu (destekleyen tarayıcı): stüdyoya bildirilir.
  if (navigator.getBattery) navigator.getBattery().then(function (b) {
    var report = function () { send({ t: "battery", level: Math.round(b.level * 100), charging: b.charging }); };
    b.onlevelchange = report; b.onchargingchange = report; setInterval(report, 60000);
  }).catch(function () {});
  if (!token) setState("Eşleme kodu yok: stüdyodaki QR kodu okut.", "");
  window.__phone = { state: function () { return { running: running, ws: ws ? ws.readyState : -1, pc: pc ? pc.connectionState : null, tally: tally, media: describe() }; } };
})();
</script>
</body>
</html>`;

module.exports = { PHONE_PAGE };
