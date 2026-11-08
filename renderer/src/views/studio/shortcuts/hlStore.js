// Yayın Stüdyosu · ÖZET SEÇİMİ — Özet paneli (HighlightsPanel) ve özet düğmeleri (./wOzet)
// AYNI seçimi, kartları ve müziği kullanır: düğmeden "son tekrarı özete ekle" panelde de
// görünür. Oluşturma da tek yoldan (buildHighlight): plan + skorbord bilgisi + giriş /
// kapanış kartı uzunluğu + arka plan müziği.
import { useCallback, useMemo } from "react";
import { buildHighlightPlan, defaultHighlightItems, eventsUntil, normalizeHighlightMusic, scoreForReplay } from "../../../lib/studio/highlights";
import { PROGRAM_ANGLE, anglesOf, metaFor, replayBanner, replayOfMatch } from "../../../lib/studio/replays";
import { scorerLines } from "../../../lib/studio/scorebug";
import { cardInfo } from "../modes/useHighlightMode";
import { cardLengthOf, normalizeOps } from "../settings/opsSettings";
import { SETTINGS_KEY } from "../settings/settings";
import { getLocal, setLocal, useLocal } from "./localStore";

export const HL_MUSIC_KEY = "elitlig.studio.highlightMusic";

/** Bu maçın özete girebilecek tekrarları. */
export const mineOf = (replays, meta, matchId) => (replays || []).filter((r) => replayOfMatch(r, meta?.[r.id], matchId) && anglesOf(r).length);

/** Seçim: { items, edited } (maç başına, bellekte; panel ve düğmeler ortak). */
export function useHlSelection(matchId, mine) {
  const defaults = useMemo(() => defaultHighlightItems(mine, { preferredAngles: [PROGRAM_ANGLE] }), [mine]);
  const [sel, setSel] = useLocal(`hl.${matchId || 0}`, { items: null, edited: false }, false);
  const items = sel?.edited && Array.isArray(sel.items) ? sel.items.filter((x) => mine.some((r) => r.id === x.replayId)) : defaults;
  const edit = useCallback((fn) => setSel((s) => {
    const base = s?.edited && Array.isArray(s.items) ? s.items : defaults;
    return { items: typeof fn === "function" ? fn(base) : fn, edited: true };
  }), [defaults, setSel]);
  const reset = useCallback(() => setSel({ items: null, edited: false }), [setSel]);
  return { items, edited: Boolean(sel?.edited), edit, reset, defaults };
}
/** Düğmeler için (kancasız): seçime tekrar ekle. */
export function addToHighlight(matchId, replay, mine, angles) {
  const key = `hl.${matchId || 0}`;
  const cur = getLocal(key, { items: null, edited: false }, false);
  const base = cur?.edited && Array.isArray(cur.items) ? cur.items : defaultHighlightItems(mine, { preferredAngles: [PROGRAM_ANGLE] });
  if (base.some((x) => x.replayId === replay.id)) return false;
  setLocal(key, { items: [...base, { replayId: replay.id, angles: angles?.length ? angles : [(replay.angles || []).find((a) => a.url)?.angle].filter(Boolean) }], edited: true }, false);
  return true;
}

/** Kayıtlı işletim ayarları (ops verilmeyen yerler için: Özet paneli). */
const opsNow = () => { try { return normalizeOps(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null")?.ops); } catch { return normalizeOps(null); } };

/** Giriş / kapanış kartı uzunluğu: { intro, outro } ("long" | "short" | "none"). */
export function useHlCards(ops) {
  const [c, set] = useLocal("hlCards", null);
  const o = ops || opsNow();
  const v = { intro: c?.intro || o?.hl?.intro || "long", outro: c?.outro || o?.hl?.outro || "long" };
  return [v, (patch) => set((x) => ({ ...(x || v), ...patch }))];
}

/** Arka plan müziği (panelin eski kaydıyla aynı anahtar). */
export function useHlMusic(ops) {
  const [m, setM] = useLocal("hlMusic", () => {
    try { const raw = JSON.parse(window.localStorage.getItem(HL_MUSIC_KEY) || "null"); if (raw) return normalizeHighlightMusic(raw); } catch { /* yoksay */ }
    const o = ops || opsNow();
    return normalizeHighlightMusic({ volumeDb: o?.hl?.musicDb, duckDb: o?.hl?.duckDb });
  }, false);
  const set = useCallback((patch) => setM((cur) => {
    const n = normalizeHighlightMusic({ ...(cur || {}), ...patch });
    try { window.localStorage.setItem(HL_MUSIC_KEY, JSON.stringify(n)); } catch { /* yoksay */ }
    return n;
  }), [setM]);
  return [normalizeHighlightMusic(m), set];
}

/** Plan (kart uzunluklarıyla). */
export function highlightPlan({ items, mine, meta, live, cards }) {
  const scoreOf = (r) => scoreForReplay(r, metaFor(r, meta), { events: live?.events, homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, fallback: live?.score || { home: 0, away: 0 } });
  return buildHighlightPlan({ items, replays: mine, scoreOf, introMs: cardLengthOf(cards?.intro).introMs, outroMs: cardLengthOf(cards?.outro).outroMs });
}

/** Özeti oluştur (tek yol). */
export async function buildHighlight({ hl, plan, meta, live, imagesRef, stingerKind = "stinger", music = null }) {
  const info = { ...cardInfo(live), score: live.score };
  const boardOf = (seg) => {
    const r = seg.replay;
    const mm = metaFor(r, meta);
    const known = mm.minute != null;
    return {
      homeName: live.homeName,
      awayName: live.awayName,
      homeScore: seg.score?.home ?? 0,
      awayScore: seg.score?.away ?? 0,
      clockMs: known ? mm.minute * 60000 : 0,
      period: mm.period || 1,
      clockLabel: known ? null : "MAÇ ÖZETİ",
      scorers: scorerLines(eventsUntil(live.events, r, mm), { homeTeamId: live.homeTeamId, awayTeamId: live.awayTeamId, nameOf: live.nameOf }),
      event: replayBanner(r, mm),
    };
  };
  return hl.build({ plan, info, images: imagesRef?.current || {}, boardOf, stingerKind, music: music?.url ? music : null });
}

export const HL_BUSY = ["preparing", "rendering", "finishing", "uploading"];
export const HL_PHASE = { preparing: "Klipler hazırlanıyor", rendering: "Oluşturuluyor", finishing: "Dosya yazılıyor", uploading: "Yükleniyor", done: "Hazır", uploaded: "Yüklendi", error: "Hata", idle: "Hazır değil" };
