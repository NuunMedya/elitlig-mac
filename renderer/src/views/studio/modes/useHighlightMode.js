// ÖZET modu: özet oluşturulmadan önce önizlemede yeni giriş kartı (canlandırmalı,
// markalı) döner; oluşturulunca özet dosyası önizlenir ve "Yayına al" ile
// programda kendi sesiyle (yönlendirme varsayılanı: yalnız özet sesi) oynar,
// bitince mod canlıya döner.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INTRO_MS } from "../../../lib/studio/highlights";
import { drawVideoFull } from "../draw";
import { drawCard } from "../renderHighlight";
import { useHighlights } from "../useHighlights";
import { prepare } from "../useReplayPlayer";

export const dateText = (v) => {
  if (!v) return "";
  const d = new Date(String(v).length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

/** Kartın bilgileri (maçtan). */
export function cardInfo(live) {
  const m = live?.match || {};
  return {
    title: [m.lig_adi || m.league_name, m.saha_adi || m.match_field].filter(Boolean).join(" · ") || "",
    league: m.lig_adi || m.league_name || m.organization_name || "",
    venue: m.saha_adi || m.match_field || m.field_name || "",
    homeName: live?.homeName || "Ev sahibi",
    awayName: live?.awayName || "Deplasman",
    score: live?.score || { home: 0, away: 0 },
    date: dateText(m.match_date || m.tarih),
  };
}

export function useHighlightMode({ matchId, live, audio, imagesRef, onAir, previewing, onFinished }) {
  const hl = useHighlights(matchId);
  const el = useMemo(() => { const v = document.createElement("video"); v.playsInline = true; v.preload = "auto"; v.muted = true; return v; }, []);
  const [ready, setReady] = useState(false);
  const url = hl.job.file?.url || null;
  const gateRef = useRef(null);
  const attach = audio?.attachMedia;
  useEffect(() => { if (attach) gateRef.current = attach(el, { strip: "highlight", on: false }); }, [attach, el]);
  useEffect(() => { gateRef.current?.setOn?.(onAir); }, [onAir]);
  useEffect(() => {
    setReady(false);
    if (!url) return undefined;
    let alive = true;
    prepare(el, url).then(() => { if (alive) setReady(true); }).catch(() => {});
    return () => { alive = false; };
  }, [url, el]);
  const finRef = useRef(onFinished);
  finRef.current = onFinished;
  useEffect(() => {
    const end = () => { if (onAirRef.current) finRef.current?.(); };
    el.addEventListener("ended", end);
    return () => el.removeEventListener("ended", end);
  }, [el]);
  const onAirRef = useRef(onAir);
  onAirRef.current = onAir;
  // Önizlemede sessiz döngü; yayına alınınca baştan.
  useEffect(() => {
    if (!ready) return;
    if (onAir) { el.loop = false; try { el.currentTime = 0; } catch { /* yoksay */ } el.play().catch(() => {}); }
    else if (previewing) { el.loop = true; el.play().catch(() => {}); }
    else { try { el.pause(); } catch { /* yoksay */ } }
  }, [onAir, previewing, ready, el]);

  const liveRef = useRef(live);
  liveRef.current = live;
  const t0 = useRef(performance.now());
  const drawIntro = useCallback((ctx, W, H, now) => {
    const local = (now - t0.current) % (INTRO_MS + 1500);
    drawCard(ctx, W, H, "intro", cardInfo(liveRef.current), imagesRef?.current || {}, local);
  }, [imagesRef]);
  const draw = useCallback((ctx, W, H, now) => {
    if (ready && drawVideoFull(ctx, el, W, H)) return;
    drawIntro(ctx, W, H, now);
  }, [ready, el, drawIntro]);

  return { hl, el, ready, draw, drawIntro, hasFile: Boolean(url) };
}
