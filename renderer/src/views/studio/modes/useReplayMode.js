// TEKRAR modu: önizlemede seçili tekrar / açı döngüyle oynar (sessiz); "Yayına al"
// kuyruğu (seçilenler ya da önizlenen) PROGRAM'a verir. Öğeler arasında seçilen
// logo geçişi; kuyruk bitince mod kendi geçişiyle canlıya döner. Ağır çekim
// önizlemede ve yayında anında uygulanır. Program öğeleri "media" şeridinde
// (yönlendirme varsayılanı: yalnız canlı mikrofon).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STINGER_MS } from "../../../lib/studio/stinger";
import { PROGRAM_ANGLE, buildReplayQueue, defaultAngles, metaFor, replayBanner } from "../../../lib/studio/replays";
import { isStingerKind } from "../../../lib/studio/transitions";
import { drawReplayBadge } from "../../../lib/studio/scorebug";
import { drawTransitionStinger } from "../../../lib/studio/transitions";
import { drawVideoFull } from "../draw";
import { prepare, useReplayPlayer } from "../useReplayPlayer";

const mkVideo = () => {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = true;
  return v;
};

export function useReplayMode({ replays, rate, audio, between, onFinished, onError, brandRef, previewing }) {
  const list = replays?.replays || [];
  const meta = replays?.meta || {};
  const recordAngles = replays?.recordAngles || [PROGRAM_ANGLE];
  const [selection, setSelection] = useState({}); // replayId → [açı]
  const [cursor, setCursor] = useState(null); // { replayId, angle }
  const previewEl = useMemo(mkVideo, []);
  const els = useMemo(() => [mkVideo(), mkVideo()], []);
  const replayRef = useRef({ active: false });
  const innerRef = useRef(null); // öğeler arası geçiş { startedAt, ms, kind, onMid, fired }
  const errRef = useRef(onError);
  errRef.current = onError;

  // Ses: program öğeleri bir kez bağlanır, kapı açık (yalnız yayında oynarlar).
  const attach = audio?.attachMedia;
  useEffect(() => { if (attach) els.forEach((el) => attach(el, { strip: "media", on: true })); }, [attach, els]);

  const queue = useMemo(() => buildReplayQueue(list, selection), [list, selection]);
  const cursorItem = useMemo(() => {
    const c = cursor || (queue[0] ? { replayId: queue[0].replayId, angle: queue[0].angle } : null);
    if (!c) return null;
    const r = list.find((x) => x.id === c.replayId);
    const a = r?.angles?.find((x) => x.angle === c.angle && x.url) || r?.angles?.find((x) => x.url);
    return r && a ? { replayId: r.id, angle: a.angle, url: a.url, replay: r, durationMs: a.durationMs || r.durationMs } : null;
  }, [cursor, queue, list]);

  // Önizleme öğesi: imleçteki klip döngüyle.
  const [previewReady, setPreviewReady] = useState(false);
  const pUrl = cursorItem?.url || null;
  useEffect(() => {
    setPreviewReady(false);
    if (!pUrl) { try { previewEl.pause(); } catch { /* yoksay */ } return undefined; }
    let alive = true;
    previewEl.loop = true;
    prepare(previewEl, pUrl).then(() => { if (alive) { setPreviewReady(true); previewEl.playbackRate = rate; previewEl.play().catch(() => {}); } })
      .catch((e) => { if (alive) errRef.current?.(e?.message || "Tekrar önizlenemedi."); });
    return () => { alive = false; };
  }, [pUrl, previewEl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { previewEl.playbackRate = rate; }, [rate, previewEl]);
  useEffect(() => {
    if (previewing && previewReady) previewEl.play().catch(() => {});
    else if (!previewing) { try { previewEl.pause(); } catch { /* yoksay */ } }
  }, [previewing, previewReady, previewEl]);

  const bannerOf = useCallback((item) => replayBanner(item.replay, metaFor(item.replay, meta)), [meta]);
  const betweenRef = useRef(between);
  betweenRef.current = between;
  const switchVia = useCallback((onMid) => {
    const b = betweenRef.current || { kind: "stinger", ms: STINGER_MS };
    if (!isStingerKind(b.kind)) { onMid(); return; }
    const prev = innerRef.current;
    if (prev && !prev.fired) { prev.fired = true; try { prev.onMid(); } catch { /* yoksay */ } }
    const sg = { startedAt: performance.now(), ms: b.ms || STINGER_MS, kind: b.kind, onMid, fired: false };
    innerRef.current = sg;
    setTimeout(() => { if (!sg.fired) { sg.fired = true; try { sg.onMid(); } catch { /* yoksay */ } } }, sg.ms * 0.5 + 250);
  }, []);
  const player = useReplayPlayer({ els, replayRef, switchVia, firstImmediate: true, onFinished, bannerOf, rate, onError });

  /** Yayına verilecek kuyruk: seçilenler, yoksa önizlenen klip. */
  const airQueue = useCallback(() => {
    if (queue.length) return queue;
    return cursorItem ? [{ replayId: cursorItem.replayId, angle: cursorItem.angle, url: cursorItem.url, durationMs: cursorItem.durationMs, replay: cursorItem.replay }] : [];
  }, [queue, cursorItem]);

  const start = useCallback(async (q) => {
    const items = q || airQueue();
    if (!items.length) { errRef.current?.("Yayına verilecek tekrar seçilmedi."); return false; }
    return player.play(items);
  }, [airQueue, player]);

  const latestQueue = useCallback(() => {
    const r = replays?.latest || list[0];
    if (!r) return [];
    return buildReplayQueue([r], { [r.id]: defaultAngles(r, recordAngles) });
  }, [replays?.latest, list, recordAngles]);

  /** Bir tekrarı seç ve önizlemeye yükle (ManageDock › onPlayReplay). */
  const open = useCallback((replay) => {
    if (!replay?.id) return;
    const angles = defaultAngles(replay, recordAngles);
    setSelection({ [replay.id]: angles });
    setCursor({ replayId: replay.id, angle: angles[0] || PROGRAM_ANGLE });
  }, [recordAngles]);

  /** Program içeriği (tekrar + rozet + öğeler arası geçiş). */
  const drawProgram = useCallback((ctx, W, H, now) => {
    const r = replayRef.current;
    if (r?.active && r.el) drawVideoFull(ctx, r.el, W, H);
    else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
  }, []);
  const drawProgramTop = useCallback((ctx, W, H, now) => {
    drawReplayBadge(ctx, W);
    const sg = innerRef.current;
    if (!sg) return;
    const p = Math.min(1, (now - sg.startedAt) / sg.ms);
    if (p >= 0.5 && !sg.fired) { sg.fired = true; try { sg.onMid(); } catch { /* yoksay */ } }
    if (p < 1) drawTransitionStinger(ctx, W, H, sg.kind, p, brandRef?.current?.logo, brandRef?.current?.branding);
    else innerRef.current = null;
  }, [brandRef]);
  const drawPreview = useCallback((ctx, W, H) => {
    if (!previewReady || !drawVideoFull(ctx, previewEl, W, H)) {
      ctx.fillStyle = "#0b0712"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `700 ${Math.round(H * 0.045)}px -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(cursorItem ? "Tekrar yükleniyor…" : "Önizlemek için listeden tekrar seç", W / 2, H / 2);
    }
  }, [previewReady, previewEl, cursorItem]);
  const event = useCallback((target) => (target === "program" ? replayRef.current?.event || null : cursorItem ? bannerOf(cursorItem) : null), [cursorItem, bannerOf]);

  return {
    selection, setSelection, cursor: cursorItem, setCursor, queue, airQueue, latestQueue, open,
    player, start, stop: (withTr) => player.stop(withTr), drawProgram, drawProgramTop, drawPreview, event, previewEl, previewReady, ready: Boolean(airQueue().length),
  };
}
