// Yayın Stüdyosu — LED YÖNLENDİRME (saf). "LED'e ver" seçicisi ve sahne kutusundaki
// "LED'e ver" düğmesi bunu kullanır.
//
//   program  Yayın (Program) — VARSAYILAN: program her değiştiğinde LED de değişir
//   preview  Önizleme
//   scene    Belirli sahne (sceneId)
//   off      Kapalı (LED penceresi siyah)
//
// Program bir özel kipteyse (tekrar / VAR / röportaj) LED o kipi çizemez
// (ayrı pencere): son program sahnesini göstermeye devam eder.
export const LED_ROUTE_KEYS = ["program", "preview", "scene", "off"];
export const DEFAULT_LED_ROUTE = { route: "program", sceneId: null };

export function normalizeLedRoute(raw) {
  const route = LED_ROUTE_KEYS.includes(raw?.route) ? raw.route : DEFAULT_LED_ROUTE.route;
  const sceneId = typeof raw?.sceneId === "string" && raw.sceneId ? raw.sceneId : null;
  return { route: route === "scene" && !sceneId ? "program" : route, sceneId };
}

/** LED'de görünecek sahne kimliği (yoksa null = siyah). */
export function ledTargetScene(routing, { programId = null, previewId = null, sceneIds = null } = {}) {
  const r = normalizeLedRoute(routing);
  const exists = (id) => Boolean(id) && (!sceneIds || sceneIds.includes(id));
  if (r.route === "off") return null;
  if (r.route === "preview") return exists(previewId) ? previewId : exists(programId) ? programId : null;
  if (r.route === "scene") return exists(r.sceneId) ? r.sceneId : exists(programId) ? programId : null;
  return exists(programId) ? programId : null;
}

/** Sahne kutusunda "LED" rozeti: bu sahne LED'de mi. */
export const ledShowsScene = (routing, sceneId, ids, ledOpen = true) => Boolean(ledOpen) && ledTargetScene(routing, ids) === sceneId;

/** Kutudaki "LED'e ver": o sahneye sabitler; zaten o sahnedeyse Program'a döner. */
export function routeSceneToLed(routing, sceneId, ids = {}) {
  const r = normalizeLedRoute(routing);
  if (r.route === "scene" && r.sceneId === sceneId) return { route: "program", sceneId };
  if (r.route === "program" && ids.programId === sceneId) return r;
  return { route: "scene", sceneId };
}

/** Seçicinin etiketi. */
export function ledRouteLabel(routing, sceneName = () => null) {
  const r = normalizeLedRoute(routing);
  if (r.route === "scene") return `Sahne: ${sceneName(r.sceneId) || "?"}`;
  return { program: "Yayın (Program)", preview: "Önizleme", off: "Kapalı" }[r.route];
}

/* ───────── [2.33] TEK DOKUNUŞLA "YAYINI LED'E VER" ─────────
   LED çıkışını açıp kapatmakla uğraşmadan: LED yayını (Program) izler — tekrar / VAR / özel
   kipler yayındayken program aynasına geçer — ve önceki LED içeriği (sahne, site sayfası,
   skor / metin…) saklanır; ikinci dokunuş onu geri getirir. prefs: useLed tercihleri. */

/** LED şu an "yayını veriyor" mu. */
export const ledLiveOn = (prefs) => Boolean(prefs?.live) && !prefs?.web;

/** Yayını LED'e ver: { web, route, sceneId, live, back, fx } yaması (önceki içerik back'te). */
export function ledLivePatch(prefs, fx) {
  const p = prefs || {};
  const f = fx || {};
  const back = p.live && p.back ? p.back : { web: Boolean(p.web), route: p.route || "program", sceneId: p.sceneId || null, content: f.content || "scene" };
  return { web: false, route: "program", sceneId: p.sceneId || null, live: true, back, fx: { ...f, content: "scene", freeze: false, black: false } };
}

/** Önceki LED içeriğine dön (yoksa: Program sahnesi). */
export function ledBackPatch(prefs, fx) {
  const p = prefs || {};
  const f = fx || {};
  const b = p.back && typeof p.back === "object" ? p.back : { web: false, route: "program", sceneId: null, content: "scene" };
  const r = normalizeLedRoute(b);
  return { web: Boolean(b.web), route: r.route, sceneId: r.sceneId, live: false, back: null, fx: { ...f, content: typeof b.content === "string" ? b.content : "scene", freeze: false, black: false } };
}
