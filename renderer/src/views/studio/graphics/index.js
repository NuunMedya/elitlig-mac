// Yayın Stüdyosu · YAYIN GRAFİKLERİ — dışa açılan API (CORE stüdyo bunu kullanır).
//
//   import { useGraphics, drawGraphics, GraphicsToolbar, GraphicsDock } from "./graphics";
//
//   const g = useGraphics({ matchId, live });          // live = useLiveMatch(...)
//   // kompozitör karesinde (program tuvali, her kare):
//   drawGraphics(ctx, { width, height, now: Date.now() }, g.snapshotRef.current);
//   // üst çubuk:
//   <GraphicsToolbar g={g} />
//   // dok sekmesi:
//   <GraphicsDock g={g} matchId={matchId} live={live} />
//
// g alanları (useGraphics.js): branding (çözülmüş: logoUrl, logoScale, primary,
// secondary, accent, accentLight, text, fontFamily, fontScale, palette, brandName…),
// brandingDraft (web biçimi + extras), brand (kaydet / ön ayar işlemleri),
// variants, scorebugVariant, setScorebugVariant(key), ledModes, ledMode,
// setLedMode(key) (PUT led-status), syncWeb, setSyncWeb, subtitle { onAir, lines,
// settings, blocks }, setSubtitleOnAir(bool), addLine / removeLine / moveLine /
// editLine, interview { onAir, style, title, people[{ name, role, teamName, image,
// side }], sponsorId }, setInterviewOnAir(bool), saveInterview, setInterviewStyle,
// presets, applyPreset(id), savePreset(name), renamePreset, deletePreset,
// setDefaultPreset, overwritePreset, desk, snapshot, snapshotRef.
export { useGraphics } from "./useGraphics";
export { drawGraphics, buildGraphicsSnapshot } from "../../../lib/studio/graphics";
export { default as GraphicsToolbar } from "./GraphicsToolbar";
export { default as GraphicsDock } from "./GraphicsDock";
export { default as GraphicsPreview } from "./GraphicsPreview";
