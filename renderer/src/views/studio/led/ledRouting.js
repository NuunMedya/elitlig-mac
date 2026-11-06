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
