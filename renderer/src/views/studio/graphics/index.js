// Yayın Stüdyosu · YAYIN GRAFİKLERİ — dışa açılan API (CORE stüdyo bunu kullanır).
//
//   import { useGraphics, drawGraphics, GraphicsToolbar, ScoreboardTab, … } from "./graphics";
//
//   const g = useGraphics({ matchId, live });          // live = useLiveMatch(...)
//   // kompozitör karesinde (program tuvali, her kare; sceneId → sahne bazlı süzme):
//   drawGraphics(ctx, { width, height, now: Date.now(), sceneId }, g.snapshotRef.current);
//   // modlar geçici gizleyebilir: { ...snap, hideScorebug, hideSubtitle, hideInterview }
//   // üst çubuk:
//   <GraphicsToolbar g={g} />
//   // üst sekmeler (scenes = [{ id, name }]):
//   <ScoreboardTab g={g} live={live} scenes={scenes} />           Skorbord + görünüm + sahneler
//   <SubtitlePanel g={g} scenes={scenes} embedded? />             Altyazı (+ sahneler)
//   <BrandTab g={g} live={live} />                                Marka & tema (yalnız bu maç)
//   <PresetsTab g={g} />                                          Ön ayarlar (şablon; bu maça uygula)
//   <LedGraphicsPanel g={g} live={live} embedded? />              LED sekmesinin içine
//   <InterviewGraphicsPanel g={g} live={live} scenes={scenes} embedded? />  Röportaj sekmesinin içine
//   <SponsorPanel g={g} />  <LinksPanel g={g} />                  sponsor yayını, OBS / LED adresleri
//   <GraphicsDock g={g} matchId live scenes />                    hepsi tek panelde (eski düzen)
//
// "embedded" verilirse kabuk (başlık şeridi) çizilmez: başka sekmenin gövdesine gömülür.
//
// g alanları (useGraphics.js): branding (çözülmüş: logoUrl, logoScale, primary,
// secondary, accent, accentLight, text, fontFamily, fontScale, palette, brandName…),
// brandingDraft (web biçimi + extras), brand (kaydet / ön ayar işlemleri; hepsi
// yalnız bu maça yazar), variants, scorebugVariant, setScorebugVariant(key),
// ledModes, ledMode, setLedMode(key) (PUT led-status), syncWeb, setSyncWeb,
// visibility { scorebug, subtitle, interview: "all" | [sceneId] }, setVisibility(key, value),
// subtitle { onAir, lines, settings, blocks }, setSubtitleOnAir(bool), addLine /
// removeLine / moveLine / editLine, interview { onAir, style, title, people[{ name,
// role, teamName, image, side }], sponsorId }, setInterviewOnAir(bool), saveInterview,
// setInterviewStyle, presets, applyPreset(id) (yalnız bu maç), savePreset(name),
// renamePreset, deletePreset, overwritePreset, desk, snapshot, snapshotRef.
export { useGraphics } from "./useGraphics";
export { drawGraphics, buildGraphicsSnapshot, graphicsLayers, isVisibleIn, normalizeVisibility } from "../../../lib/studio/graphics";
export { default as GraphicsToolbar } from "./GraphicsToolbar";
export { default as GraphicsDock } from "./GraphicsDock";
export { default as GraphicsPreview } from "./GraphicsPreview";
export { default as ScoreboardTab } from "./ScoreboardTab";
export { default as SubtitlePanel } from "./SubtitlePanel";
export { default as BrandTab } from "./BrandTab";
export { default as PresetsTab } from "./PresetsTab";
export { default as LedGraphicsPanel } from "./LedGraphicsPanel";
export { default as InterviewGraphicsPanel } from "./InterviewGraphicsPanel";
export { default as SceneVisibility } from "./SceneVisibility";
export { SponsorPanel, LinksPanel } from "./BroadcastExtras";
