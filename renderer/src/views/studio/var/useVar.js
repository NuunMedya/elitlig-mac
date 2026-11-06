// Yayın Stüdyosu — VAR modu (yeni tasarım): pencereler, klipler, durum.
//
// Düzen (tek / ikili / üçlü) ve her pencereye atanan içerik (canlı kaynak ya da
// tekrar + açı) ayarlarda (modes.var). Klipler pencere başına bir video öğesinde
// döngüyle oynar (önizlemede ve yayında aynı öğe); öğeler karıştırıcının
// "media" şeridine bağlıdır, kapı YALNIZ VAR yayındayken açılır. Yönlendirme
// varsayılanı (Tekrar & VAR): yalnız canlı mikrofon — klip sesi istenirse açılır.
// Durum (İNCELEME / KONTROL / KARAR + karar) yayında anında değişir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeVarV2, varLayoutOf } from "../../../lib/studio/var";
import { angleLabel } from "../../../lib/studio/replays";
import { drawSource, drawVideoIn, sourcesById } from "../draw";
import { prepare } from "../useReplayPlayer";
import { drawVarScene } from "./drawVar";

function angleUrl(replays, replayId, angle) {
  const r = (replays || []).find((x) => x.id === replayId) || null;
  if (!r) return null;
  const a = r.angles?.find((x) => x.angle === angle && x.url) || r.angles?.find((x) => x.url);
  return a?.url || null;
}

export function useVar({ settings, onSettings, replays, sources, runtimeRef, audio, onAir: onAirProp = false, previewing = false, brandRef, onError, varRef, playStinger }) {
  // Eski kullanım (Studio varRef + playStinger ile): kendi yayın durumu.
  const [legacyActive, setLegacyActive] = useState(false);
  const onAir = varRef ? legacyActive : onAirProp;
  const v = useMemo(() => normalizeVarV2(settings), [settings]);
  const vRef = useRef(v);
  vRef.current = v;
  const els = useMemo(() => [0, 1, 2].map(() => {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    return el;
  }), []);
  const readyRef = useRef([false, false, false]);
  const errRef = useRef(onError);
  errRef.current = onError;
  const count = varLayoutOf(v.layout).count;
  const urls = v.slots.map((s, i) => (i < count && s.kind === "replay" ? angleUrl(replays, s.replayId, s.angle) : null));
  const urlKey = urls.join("|");

  // Ses: öğeler bir kez bağlanır; kapı yalnız yayında.
  const attach = audio?.attachMedia;
  const gatesRef = useRef([]);
  useEffect(() => { if (attach) gatesRef.current = els.map((el) => attach(el, { strip: "media", on: false })); }, [attach, els]);
  useEffect(() => { gatesRef.current.forEach((g) => g?.setOn?.(onAir)); }, [onAir]);

  // Klipleri yükle.
  useEffect(() => {
    let alive = true;
    urls.forEach((url, i) => {
      const el = els[i];
      if (!url) { readyRef.current[i] = false; try { el.pause(); } catch { /* yoksay */ } if (el.src) { el.removeAttribute("src"); el.load?.(); } el.dataset.url = ""; return; }
      if (el.dataset.url === url) return;
      el.dataset.url = url;
      readyRef.current[i] = false;
      prepare(el, url).then(() => { if (alive && el.dataset.url === url) { readyRef.current[i] = true; if (onAirRef.current || prevRef.current) el.play().catch(() => {}); } })
        .catch((e) => { if (alive) errRef.current?.(e?.message || "VAR klibi açılamadı."); });
    });
    return () => { alive = false; };
  }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAirRef = useRef(onAir);
  onAirRef.current = onAir;
  const prevRef = useRef(previewing);
  prevRef.current = previewing;
  const playing = onAir || previewing;
  useEffect(() => {
    els.forEach((el, i) => {
      el.loop = v.loop;
      el.playbackRate = v.rate;
      if (playing && urls[i] && readyRef.current[i]) el.play().catch(() => {});
      else if (!playing) { try { el.pause(); } catch { /* yoksay */ } }
    });
  }, [playing, v.loop, v.rate, urlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Karar anı (karar bandı kayarak gelir).
  const decisionAtRef = useRef(0);
  const lastState = useRef(`${v.state}:${v.decision}`);
  const key = `${v.state}:${v.decision}`;
  if (lastState.current !== key) { lastState.current = key; if (v.state === "decision") decisionAtRef.current = performance.now(); }
  const startedRef = useRef(performance.now());

  const set = useCallback((patch) => onSettings((s) => normalizeVarV2({ ...normalizeVarV2(s), ...(typeof patch === "function" ? patch(normalizeVarV2(s)) : patch) })), [onSettings]);
  const setSlot = useCallback((i, patch) => set((n) => ({ slots: n.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) })), [set]);
  const restart = useCallback(() => { startedRef.current = performance.now(); els.forEach((el, i) => { if (urls[i]) { try { el.currentTime = 0; } catch { /* yoksay */ } if (onAirRef.current || prevRef.current) el.play().catch(() => {}); } }); }, [els, urlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const srcRef = useRef(sources);
  srcRef.current = sources;
  const repRef = useRef(replays);
  repRef.current = replays;

  /** Kare çizimi (önizleme ve program aynı). */
  const draw = useCallback((ctx, W, H, now) => {
    const n = vRef.current;
    const byId = sourcesById(srcRef.current || []);
    const paint = (c, slot, r, i) => {
      if (slot?.kind === "source" && slot.sourceId) {
        const s = byId.get(slot.sourceId);
        if (!s) return null;
        drawSource(c, s, runtimeRef?.current?.get(s.id), r, "cover", { placeholders: true, now });
        return { label: s.name, live: true };
      }
      if (slot?.kind === "replay") {
        const el = els[i];
        if (!readyRef.current[i] || !drawVideoIn(c, el, r, "cover")) return null;
        const rep = (repRef.current || []).find((x) => x.id === slot.replayId);
        const ang = rep?.angles?.find((a) => a.angle === slot.angle) || { angle: slot.angle };
        return { label: angleLabel(ang, srcRef.current || []), rate: n.rate, timeMs: (el.currentTime || 0) * 1000 };
      }
      return null;
    };
    drawVarScene(ctx, W, H, now, { ...n, decisionAt: decisionAtRef.current, startedAt: startedRef.current }, paint, brandRef?.current);
  }, [brandRef, els, runtimeRef]);

  const legacyRef = useRef(false);
  const enter = useCallback(() => { if (legacyRef.current) return; legacyRef.current = true; playStinger?.({ onMid: () => { restart(); setLegacyActive(true); } }); }, [playStinger, restart]);
  const exit = useCallback(() => { if (!legacyRef.current) return; legacyRef.current = false; playStinger?.({ onMid: () => setLegacyActive(false) }); }, [playStinger]);
  if (varRef) {
    const first = v.slots.slice(0, count);
    const ri = first.findIndex((x) => x.kind === "replay");
    const si = first.find((x) => x.kind === "source");
    varRef.current = {
      active: legacyActive, mode: count >= 2 ? "both" : first[0]?.kind === "replay" ? "replay" : first[0]?.kind === "source" ? "source" : "bg",
      title: v.topic, subtitle: v.subtitle, sourceId: si?.sourceId || null, video: ri >= 0 && readyRef.current[ri] ? els[ri] : null, rate: v.rate,
    };
  }

  return { active: onAir, enter, exit, toggle: () => (legacyRef.current ? exit() : enter()), replayUrl: urls.find(Boolean) || null, settings: v, set, setSlot, restart, draw, els, urls, count, onStart: () => { startedRef.current = performance.now(); restart(); } };
}
