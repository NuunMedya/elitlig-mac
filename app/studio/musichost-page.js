// Gizli müzik penceresi: iki YouTube oynatıcısı; komutlar ana süreçten (musichost.js).
//   komut { deck: "a" | "b", cmd: load | play | pause | stop | volume | seek, args }
//   olay  { deck, type: "ready" | "state" | "tick" | "error", … }
(function () {
  "use strict";
  var bridge = window.musicHost;
  if (!bridge) return;
  var decks = { a: { player: null, ready: false, queue: [] }, b: { player: null, ready: false, queue: [] } };

  function run(d, cmd, args) {
    var p = decks[d].player;
    if (!p) return;
    args = args || {};
    try {
      if (cmd === "load") {
        var o = { videoId: String(args.videoId || ""), startSeconds: Number(args.startSeconds) || 0 };
        if (args.endSeconds != null) o.endSeconds = Number(args.endSeconds);
        if (args.volume != null) p.setVolume(Math.max(0, Math.min(100, Number(args.volume) || 0)));
        p.unMute();
        if (args.autoplay === false) p.cueVideoById(o); else p.loadVideoById(o);
      } else if (cmd === "play") p.playVideo();
      else if (cmd === "pause") p.pauseVideo();
      else if (cmd === "stop") p.stopVideo();
      else if (cmd === "volume") p.setVolume(Math.max(0, Math.min(100, Number(args.v) || 0)));
      else if (cmd === "seek") p.seekTo(Number(args.sec) || 0, true);
    } catch (e) { bridge.emit({ deck: d, type: "error", code: -1, message: String((e && e.message) || e) }); }
  }

  bridge.onCommand(function (msg) {
    var d = msg && msg.deck === "b" ? "b" : "a";
    if (!decks[d].ready) { decks[d].queue.push(msg); return; }
    run(d, msg.cmd, msg.args);
  });

  window.onYouTubeIframeAPIReady = function () {
    ["a", "b"].forEach(function (d) {
      decks[d].player = new window.YT.Player("deck-" + d, {
        host: "https://www.youtube-nocookie.com", width: 240, height: 135,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 },
        events: {
          onReady: function () {
            decks[d].ready = true;
            bridge.emit({ deck: d, type: "ready" });
            decks[d].queue.splice(0).forEach(function (m) { run(d, m.cmd, m.args); });
          },
          onStateChange: function (e) { bridge.emit({ deck: d, type: "state", state: e.data }); },
          onError: function (e) { bridge.emit({ deck: d, type: "error", code: e.data }); },
        },
      });
    });
  };
  setInterval(function () {
    ["a", "b"].forEach(function (d) {
      var p = decks[d].player;
      if (!p || !decks[d].ready || typeof p.getPlayerState !== "function") return;
      var st = p.getPlayerState();
      if (st !== 1 && st !== 3) return;
      bridge.emit({ deck: d, type: "tick", time: p.getCurrentTime(), duration: p.getDuration(), state: st });
    });
  }, 250);
  var s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = function () { bridge.emit({ deck: "a", type: "error", code: -2, message: "YouTube oynatıcısı yüklenemedi." }); };
  document.head.appendChild(s);
})();
