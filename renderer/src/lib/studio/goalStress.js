// Yayın Stüdyosu — "GOL ANI YÜKÜ" tanılaması (saf; sınanır).
//
// GOL'e basıldığı an (tekrar kaydı başlar) yayın sayaçlarının anlık görüntüsü alınır; sonraki
// GOAL_STRESS_WINDOW_MS (20 sn: kayıt, olay, bölüm, yükleme planı) boyunca her saniye örneklenir
// ve pencere bitince özet çıkar: atlanan kare (kodlayıcı + kare ızgarası boşluğu), çizim
// takılması, ses boşluğu (atılan ses, ms), aktarıcının görüntü atlaması, en büyük ağ tamponu,
// en düşük gönderim hızı. Yayın tanılama penceresinde "Gol anı" satırı ve tanılama günlüğü.
export const GOAL_STRESS_WINDOW_MS = 20_000;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Sayaçların anlık görüntüsü. draw: karıştırıcı (getStats), enc: kodlama yolu (getEncodeStats), status: motor durumu. */
export function goalStressSnapshot({ draw = null, enc = null, status = null, at = Date.now() } = {}) {
  const net = status?.network || null;
  const aw = enc?.audioWorker || null;
  return {
    at,
    stalls: n(draw?.totalStalls),
    encodeDropped: n(enc?.encodeDropped),
    gridGaps: n(enc?.gaps),
    framesEncoded: n(enc?.framesEncoded),
    audioGapMs: aw ? n(aw.gapMs) + n(aw.dropped) * 20 : n(enc?.audioGapMs),
    relayDrops: n(net?.dropEvents),
    relayDroppedBytes: n(net?.droppedBytes),
    pendingBytes: n(net?.pendingBytes),
    sentKbps: net && Number.isFinite(Number(net.sentKbps)) ? Number(net.sentKbps) : null,
    ffmpegDropped: n(status?.droppedFrames),
  };
}

export function summarizeGoalStress(start, end, extra = {}) {
  const d = (k) => Math.max(0, n(end[k]) - n(start[k]));
  const seconds = Math.max(0, Math.round((end.at - start.at) / 100) / 10);
  const droppedFrames = d("encodeDropped") + d("gridGaps") + d("ffmpegDropped");
  return {
    at: start.at,
    seconds,
    droppedFrames,
    encodeDropped: d("encodeDropped"),
    gridGaps: d("gridGaps"),
    stalls: d("stalls"),
    framesEncoded: d("framesEncoded"),
    audioGapMs: d("audioGapMs"),
    relayDrops: d("relayDrops"),
    relayDroppedBytes: d("relayDroppedBytes"),
    maxPendingBytes: Math.max(n(extra.maxPendingBytes), n(end.pendingBytes), n(start.pendingBytes)),
    minSentKbps: extra.minSentKbps ?? null,
    ok: droppedFrames <= Math.max(3, seconds * 0.5) && d("audioGapMs") < 200 && d("relayDrops") === 0,
  };
}

/** mark(snap) GOL anında; sample(snap) saniyede bir → pencere bitince özet (yoksa null). */
export function createGoalStress({ windowMs = GOAL_STRESS_WINDOW_MS } = {}) {
  let cur = null;
  let last = null;
  let count = 0;
  const finish = (snap) => {
    last = { ...summarizeGoalStress(cur.start, snap, cur), index: count };
    cur = null;
    return last;
  };
  return {
    mark(snap) {
      // Pencere sürerken yeni gol: önceki özet o ana kadar kapanır.
      if (cur) finish(snap);
      count += 1;
      cur = { start: snap, maxPendingBytes: snap.pendingBytes, minSentKbps: snap.sentKbps };
    },
    sample(snap) {
      if (!cur) return null;
      cur.maxPendingBytes = Math.max(n(cur.maxPendingBytes), n(snap.pendingBytes));
      if (snap.sentKbps != null) cur.minSentKbps = cur.minSentKbps == null ? snap.sentKbps : Math.min(cur.minSentKbps, snap.sentKbps);
      return snap.at - cur.start.at >= windowMs ? finish(snap) : null;
    },
    active: () => Boolean(cur),
    last: () => last,
    count: () => count,
  };
}

/** Tanılama penceresi metni. */
export function goalStressText(s) {
  if (!s) return "henüz gol yok";
  const parts = [`${s.droppedFrames} kare atlandı`];
  if (s.stalls) parts.push(`${s.stalls} çizim takılması`);
  parts.push(s.audioGapMs ? `${s.audioGapMs} ms ses boşluğu` : "ses kesintisiz");
  if (s.relayDrops) parts.push(`ağ ${s.relayDrops} kez görüntü attı`);
  if (s.minSentKbps != null) parts.push(`en düşük gönderim ${s.minSentKbps} kbps`);
  return `${parts.join(" · ")} (${String(s.seconds).replace(".", ",")} sn)`;
}
