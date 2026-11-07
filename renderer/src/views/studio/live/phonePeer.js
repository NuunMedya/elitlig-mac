// Yayın Stüdyosu — telefon kamerası: WebRTC YANITLAYICI (stüdyo tarafı).
//
// Telefon teklif yollar (tüm yerel ağ adaylarıyla); burada yanıt üretilir, aday
// toplama bitince tek seferde gönderilir (STUN yok: yalnız yerel ağ). Telefon her
// yeniden bağlanışta yeni teklif yollar; eski bağlantı kapanır, görüntü öğesi aynı kalır.
//
//   createPhonePeer({ send(msg), onStream(stream), onState(state, info) })
//     handle(msg)       telefondan gelen ileti (offer / ice / state / battery / bye)
//     tally(state)      "program" | "preview" | null → telefonda kırmızı / yeşil çerçeve
//     config(patch)     uzaktan kamera / çözünürlük / fps / mikrofon
//     close()

const gathered = (pc, ms = 2000) => new Promise((resolve) => {
  if (pc.iceGatheringState === "complete") { resolve(); return; }
  const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); resolve(); } };
  pc.addEventListener("icegatheringstatechange", done);
  setTimeout(resolve, ms);
});

export function createPhonePeer({ send, onStream = () => {}, onState = () => {}, RTC = typeof RTCPeerConnection !== "undefined" ? RTCPeerConnection : null } = {}) {
  let pc = null;
  let closed = false;
  let lastTally;
  const info = { media: null, battery: null, device: null };

  const closePc = () => { if (pc) { try { pc.close(); } catch { /* yoksay */ } pc = null; } };

  async function answer(sdp) {
    if (!RTC) { onState("error", { message: "Bu sürümde WebRTC yok." }); return; }
    closePc();
    const mine = new RTC({ iceServers: [] });
    pc = mine;
    const stream = new MediaStream();
    mine.ontrack = (ev) => {
      if (pc !== mine) return;
      const tracks = ev.streams?.[0]?.getTracks?.() || [ev.track];
      for (const t of tracks) if (!stream.getTracks().includes(t)) stream.addTrack(t);
      onStream(stream);
    };
    mine.onconnectionstatechange = () => {
      if (pc !== mine) return;
      const st = mine.connectionState;
      if (st === "connected") onState("live", info);
      else if (st === "failed") onState("standby", { ...info, message: "Görüntü bağlantısı koptu; telefon yeniden bağlanıyor…" });
      else if (st === "disconnected") onState("standby", { ...info, message: "Telefon bağlantısı zayıf…" });
    };
    try {
      await mine.setRemoteDescription({ type: "offer", sdp });
      const ans = await mine.createAnswer();
      await mine.setLocalDescription(ans);
      await gathered(mine);
      if (pc !== mine || closed) return;
      send({ t: "answer", sdp: mine.localDescription.sdp });
      if (lastTally !== undefined) send({ t: "tally", state: lastTally });
    } catch (e) {
      onState("error", { ...info, message: `Telefon bağlantısı kurulamadı: ${e?.message || e}` });
    }
  }

  function handle(msg) {
    if (closed || !msg) return;
    if (msg.t === "offer" && typeof msg.sdp === "string") { if (msg.media) info.media = msg.media; onState("connecting", info); answer(msg.sdp); return; }
    if (msg.t === "ice" && msg.candidate && pc) { pc.addIceCandidate(msg.candidate).catch(() => {}); return; }
    if (msg.t === "state") { if (msg.media) info.media = msg.media; onState("info", info); return; }
    if (msg.t === "battery") { info.battery = { level: Number(msg.level), charging: Boolean(msg.charging) }; onState("info", info); return; }
    if (msg.t === "hello") { if (msg.media) info.media = msg.media; onState("connecting", info); return; }
    if (msg.t === "bye") { closePc(); onState("standby", { ...info, message: "Telefon ayrıldı; yeniden bağlanması bekleniyor (QR kodu okutup “Kamerayı aç”)." }); }
  }

  return {
    handle,
    tally(state) { lastTally = state || null; send({ t: "tally", state: lastTally }); },
    config(patch) { send({ t: "config", ...patch }); },
    renegotiate() { send({ t: "renegotiate" }); },
    info: () => info,
    stats: async () => {
      if (!pc) return null;
      try {
        const rep = await pc.getStats();
        let out = null;
        rep.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "video") out = { fps: r.framesPerSecond || null, width: r.frameWidth || null, height: r.frameHeight || null, bytes: r.bytesReceived || 0, lost: r.packetsLost || 0, at: r.timestamp }; });
        return out;
      } catch { return null; }
    },
    close() { closed = true; closePc(); },
  };
}
