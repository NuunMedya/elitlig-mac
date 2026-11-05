// Yayın Stüdyosu · YAYIN GRAFİKLERİ kancası.
//
//   const g = useGraphics({ matchId, live });
//   drawGraphics(ctx, { width, height, now }, g.snapshotRef.current);   // her karede
//
// Programdaki grafik (skorboard çeşidi, altyazı, röportaj bandı) stüdyoya
// özgü durumdur (maç başına localStorage). "Web ile eşitle" açıkken seçilen
// çeşit / röportaj modu PUT overlay-status ile OBS'teki web kaplamasına da
// yazılır. Altyazı satırları ve röportaj konukları yayın masasından
// (broadcast-state) gelir; web /altyazi ve /skoroverlay ile ortaktır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logoInline from "../../../assets/elitlig-beyaz.png?inline";
import { useToast } from "../../../components/ui";
import { friendlyError } from "../../../lib/studio/manage";
import {
  INTERVIEW_VARIANTS, addHeadlinePatch, currentLedMode, currentOverlayMode, editAt, interviewPatch, moveItem, removeAt,
} from "../../../lib/studio/manageBroadcast";
import { buildGraphicsSnapshot, preloadImages, snapshotImageUrls } from "../../../lib/studio/graphics";
import { LED_MODES, SCOREBOARD_VARIANTS, isWebVariant, normalizeLedMode, normalizeVariant } from "../../../lib/studio/graphics/variants";
import { useDesk } from "../manage/useDesk";
import * as api from "./graphicsApi";
import { useBranding } from "./useBranding";

const LOCAL = (id) => `elitlig.studio.graphics.${id || "none"}`;
const readLocal = (id) => { try { return JSON.parse(localStorage.getItem(LOCAL(id)) || "null") || {}; } catch { return {}; } };
const writeLocal = (id, v) => { try { localStorage.setItem(LOCAL(id), JSON.stringify(v)); } catch { /* yoksay */ } };

export function useGraphics({ matchId, live } = {}) {
  const toast = useToast();
  const id = Number(matchId) > 0 ? Number(matchId) : null;
  const brand = useBranding(id);
  const desk = useDesk(id);
  const match = live?.match && Number(live.match.id) === id ? live.match : null;

  /* ------------------------------ yerel durum ------------------------------ */
  const [local, setLocal] = useState(() => readLocal(id));
  const [variantSince, setVariantSince] = useState(() => Date.now());
  const [subtitleEpoch, setSubtitleEpoch] = useState(() => Date.now());
  const [interviewSince, setInterviewSince] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLocal(readLocal(id)); setVariantSince(Date.now()); }, [id]);
  const patchLocal = useCallback((patch) => setLocal((cur) => { const next = { ...cur, ...patch }; writeLocal(id, next); return next; }), [id]);

  const syncWeb = local.syncWeb !== false;
  const serverOverlay = match ? currentOverlayMode(match) : null;
  const variant = normalizeVariant(local.variant || serverOverlay || "scoreboard");
  const ledMode = normalizeLedMode(local.ledMode || (match ? currentLedMode(match) : "scoreboard"));

  // Başka bir reji web modunu değiştirdiyse (eşitleme açıkken) programı da izle.
  const lastServer = useRef(null);
  useEffect(() => {
    if (!serverOverlay) return;
    if (lastServer.current && lastServer.current !== serverOverlay && syncWeb && serverOverlay !== local.variant && serverOverlay !== "interview") {
      patchLocal({ variant: serverOverlay });
      setVariantSince(Date.now());
    }
    lastServer.current = serverOverlay;
  }, [serverOverlay]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ skorboard / LED ------------------------------ */
  const setScorebugVariant = useCallback(async (key, { web = syncWeb } = {}) => {
    const v = normalizeVariant(key);
    patchLocal({ variant: v });
    setVariantSince(Date.now());
    if (!web || !id || !isWebVariant(v)) return true;
    lastServer.current = v;
    const res = await api.setOverlayStatus(id, v);
    if (!res.ok) { toast(friendlyError(res, "Web skorboard modu değiştirilemedi (stüdyoda uygulandı)."), { tone: "warn", timeout: 5000 }); return false; }
    live?.refresh?.();
    return true;
  }, [id, live, patchLocal, syncWeb, toast]);

  const setLedMode = useCallback(async (key) => {
    const k = normalizeLedMode(key);
    if (!id) return false;
    setBusy(true);
    const res = await api.setLedStatus(id, k);
    setBusy(false);
    if (!res.ok) { toast(friendlyError(res, "LED ekran içeriği değiştirilemedi."), { tone: "error", timeout: 6000 }); return false; }
    patchLocal({ ledMode: k });
    toast(`LED ekran: ${LED_MODES.find((m) => m.key === k)?.label || k}.`, { tone: "success" });
    live?.refresh?.();
    return true;
  }, [id, live, patchLocal, toast]);

  const setSyncWeb = useCallback((on) => patchLocal({ syncWeb: Boolean(on) }), [patchLocal]);

  /* --------------------------------- altyazı --------------------------------- */
  const subtitleSettings = desk.state.subtitle;
  const lines = subtitleSettings.customHeadlines || [];
  const setSubtitleOnAir = useCallback((on) => {
    patchLocal({ subtitleOnAir: Boolean(on) });
    if (on) setSubtitleEpoch(Date.now());
  }, [patchLocal]);
  const saveLines = useCallback((next, note) => desk.save({ subtitle: { customHeadlines: next, sections: { custom: true } } }, note), [desk]);
  const addLine = useCallback((tag, text) => {
    const patch = addHeadlinePatch(subtitleSettings, tag, text);
    if (!patch) { toast("Satır boş ya da en çok sayıya ulaşıldı (20).", { tone: "warn" }); return Promise.resolve(false); }
    return desk.save(patch, "Altyazı satırı eklendi.");
  }, [desk, subtitleSettings, toast]);
  const removeLine = useCallback((i) => saveLines(removeAt(lines, i), "Satır kaldırıldı."), [lines, saveLines]);
  const moveLine = useCallback((i, dir) => saveLines(moveItem(lines, i, dir)), [lines, saveLines]);
  const editLine = useCallback((i, patch) => saveLines(editAt(lines, i, patch)), [lines, saveLines]);
  const setSubtitleSettings = useCallback((patch, note) => desk.save({ subtitle: patch }, note), [desk]);

  /* --------------------------------- röportaj --------------------------------- */
  const iv = desk.state.interview;
  const interviewStyle = INTERVIEW_VARIANTS.some((v) => v.key === iv.variant) ? iv.variant : "classic";
  const setInterviewOnAir = useCallback(async (on, { web = syncWeb } = {}) => {
    patchLocal({ interviewOnAir: Boolean(on), ...(on ? { webBefore: variant } : {}) });
    if (on) setInterviewSince(Date.now());
    if (!web || !id) return true;
    const status = on ? "interview" : isWebVariant(local.webBefore || variant) && (local.webBefore || variant) !== "interview" ? (local.webBefore || variant) : "scoreboard";
    lastServer.current = status;
    const res = await api.setOverlayStatus(id, status);
    if (!res.ok) toast(friendlyError(res, "Web kaplaması röportaj moduna alınamadı (stüdyoda yayında)."), { tone: "warn", timeout: 5000 });
    else live?.refresh?.();
    return res.ok;
  }, [id, live, local.webBefore, patchLocal, syncWeb, toast, variant]);

  /** { title, style, people, sponsorId } → broadcast-state.interview (web de okur). */
  const saveInterview = useCallback((next, note = "Röportaj bandı kaydedildi.") => desk.save(interviewPatch({
    title: next.title ?? iv.title, variant: next.style ?? next.variant ?? iv.variant, sponsorId: next.sponsorId !== undefined ? next.sponsorId : iv.sponsorId, people: next.people ?? iv.people,
  }), note), [desk, iv]);
  const setInterviewStyle = useCallback((style) => saveInterview({ style }, null), [saveInterview]);

  /* --------------------------------- snapshot --------------------------------- */
  const snapshot = useMemo(() => buildGraphicsSnapshot(live, {
    branding: brand.branding,
    defaultLogo: logoInline,
    variant,
    variantSince,
    sponsors: desk.sponsors,
    subtitle: { onAir: Boolean(local.subtitleOnAir), settings: subtitleSettings, epoch: subtitleEpoch },
    interview: { onAir: Boolean(local.interviewOnAir), style: interviewStyle, title: iv.title, people: iv.people, sponsorId: iv.sponsorId, since: interviewSince },
  }), [live, brand.branding, variant, variantSince, desk.sponsors, local.subtitleOnAir, local.interviewOnAir, subtitleSettings, subtitleEpoch, interviewStyle, iv, interviewSince]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  useEffect(() => { preloadImages(snapshotImageUrls(snapshot)); }, [snapshot]);

  return {
    matchId: id,
    ready: Boolean(match),
    busy: busy || brand.saving || desk.saving,
    // marka
    branding: snapshot.branding,          // çözülmüş (renkler, yazı tipi, logo)
    brandingDraft: brand.branding,        // düzenlenen (web biçimi + extras)
    brand,
    // skorboard / LED
    variants: SCOREBOARD_VARIANTS, scorebugVariant: variant, setScorebugVariant,
    ledModes: LED_MODES, ledMode, setLedMode,
    syncWeb, setSyncWeb,
    // altyazı
    subtitle: { onAir: Boolean(local.subtitleOnAir), lines, settings: subtitleSettings, blocks: snapshot.subtitle.blocks },
    setSubtitleOnAir, addLine, removeLine, moveLine, editLine, setSubtitleSettings,
    // röportaj
    interview: { onAir: Boolean(local.interviewOnAir), style: interviewStyle, title: iv.title, people: iv.people, sponsorId: iv.sponsorId },
    setInterviewOnAir, saveInterview, setInterviewStyle,
    // yayın masası (sponsorlar vb.)
    desk,
    // ön ayarlar
    presets: brand.presets, presetsRemote: brand.presetsRemote,
    applyPreset: brand.applyPreset, savePreset: brand.savePreset, renamePreset: brand.renamePreset,
    deletePreset: brand.deletePreset, setDefaultPreset: brand.setDefaultPreset, overwritePreset: brand.overwritePreset,
    // çizim
    snapshot, snapshotRef,
  };
}
