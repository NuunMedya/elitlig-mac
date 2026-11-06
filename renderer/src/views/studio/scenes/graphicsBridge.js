// Yayın Stüdyosu — grafik modülü köprüsü ("./graphics", grafik / reji ekibi).
//
// Sözleşme: useGraphics({ matchId, live }) → g (g.snapshot, g.branding, g.ledMode,
// g.interview, g.setInterviewOnAir?…), drawGraphics(ctx, { width, height, now }, g.snapshot),
// <GraphicsToolbar g={g} />. Modül paralel geliştirildiği için isteğe bağlı
// yüklenir: önce views/studio/graphics/index.js, yoksa tek tek dosyalar
// (useGraphics.js, GraphicsToolbar.jsx, lib/studio/graphics/index.js).
// import.meta.glob eşleşme bulamazsa {} döner: yapı bozulmaz, stüdyo yedek
// skorbordla çalışır.
const first = (mods) => Object.values(mods)[0] || null;
const index = first(import.meta.glob(["../graphics/index.js", "../graphics/index.jsx"], { eager: true }));
const hookMod = first(import.meta.glob("../graphics/useGraphics.js", { eager: true }));
const toolbarMod = first(import.meta.glob("../graphics/GraphicsToolbar.jsx", { eager: true }));
// Stil dosyası (index.js yoksa da araç çubuğu biçimli görünsün).
import.meta.glob("../graphics/*.css", { eager: true });
const drawMod = first(import.meta.glob("../../../lib/studio/graphics/index.js", { eager: true }));

const useGraphics = index?.useGraphics || hookMod?.useGraphics || null;
const drawGraphics = index?.drawGraphics || drawMod?.drawGraphics || null;

export const graphicsModule = index || hookMod || null;
export const hasGraphics = Boolean(useGraphics && drawGraphics);

/** Modül yoksa kancanın yerine geçen boş kanca (kanca sırası sabit kalır). */
const useNoGraphics = () => null;
export const useGraphicsSafe = hasGraphics ? useGraphics : useNoGraphics;
export const drawGraphicsSafe = hasGraphics ? drawGraphics : null;
export const GraphicsToolbar = index?.GraphicsToolbar || toolbarMod?.GraphicsToolbar || toolbarMod?.default || null;

// Üst sekmeler (grafik ekibi; yoksa sekme gösterilmez):
//   <BrandTab g matchId live scenes /> · <PresetsTab …/> · <ScoreboardTab …/>
//   <LedGraphicsPanel g matchId scenes /> (LED sekmesinin içinde)
//   <InterviewGraphicsPanel g … /> (röportaj kipi kullanır)
// drawGraphics(ctx, { width, height, now, sceneId }, snapshot): sceneId'ye göre
// grafiğin "hangi sahnelerde görünsün" (g.visibility) süzgeci grafik modülündedir.
const pickComp = (name) => index?.[name] || null;
export const BrandTab = pickComp("BrandTab");
export const PresetsTab = pickComp("PresetsTab");
export const ScoreboardTab = pickComp("ScoreboardTab");
export const LedGraphicsPanel = pickComp("LedGraphicsPanel");
export const InterviewGraphicsPanel = pickComp("InterviewGraphicsPanel");
export const SubtitlePanel = pickComp("SubtitlePanel");
export const SponsorPanel = pickComp("SponsorPanel");
export const LinksPanel = pickComp("LinksPanel");
