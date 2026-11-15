// Panorama yayını · kartların ek verisi: web Panorama sahneleri, haftanın maçı önizlemesi, hava
// durumu, çoklu il karşılaştırması ve web sahne kataloğu.
//
//   const ex = usePanoramaExtras(pano, data)  → { web, weather, cities, catalog, version, refresh }
// web / weather / cities: Map (model.cardPayload ctx'i). Listedeki her (kapalı olmayan) kartın verisi
// önceden çekilir; yayındaki kartınki 60 sn'de bir tazelenir. Hata olursa son sağlam veri kalır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../../api";
import { preloadImages } from "../../../lib/studio/graphics";
import { currentCard, motwMatch, webCardKey } from "../../../lib/studio/panorama/model";
import { WEB_SCENES, fetchCatalog, fetchCities, fetchWebScene, sceneKeyOf } from "../../../lib/studio/panorama/webScenes";
import { webPayloadImages } from "../../../lib/studio/panorama/drawWeb";

const WEB_TTL = 60_000;
const WEATHER_TTL = 10 * 60_000;
const CITIES_TTL = 2 * 60_000;

/** Kartın ihtiyaç duyduğu istekler: [{ type: "web" | "weather" | "cities", key, run }]. */
export function cardNeeds(card, data, scope) {
  if (!card || card.off) return [];
  const o = card.opts || {};
  if (card.kind === "web" && o.scene) return [{ type: "web", key: webCardKey(card, scope), scene: o.scene, opts: o }];
  if (card.kind === "motw") {
    const m = motwMatch(card, data);
    return m?.id ? [{ type: "web", key: sceneKeyOf("mac_onizleme", { matchId: m.id }, scope), scene: "mac_onizleme", opts: { matchId: m.id } }] : [];
  }
  if (card.kind === "weather") {
    const city = String(o.city || data?.scope?.city?.label || "").trim();
    return city || (o.lat && o.lon) ? [{ type: "weather", key: city.toLocaleLowerCase("tr-TR"), q: { city, lat: o.lat || undefined, lon: o.lon || undefined } }] : [];
  }
  if (card.kind === "cities" && (o.cityIds || []).length) return [{ type: "cities", key: o.cityIds.join(","), ids: o.cityIds }];
  return [];
}

export function usePanoramaExtras(pano, data) {
  const maps = useRef({ web: new Map(), weather: new Map(), cities: new Map(), at: new Map(), busy: new Set() });
  const [version, setVersion] = useState(0);
  const [catalog, setCatalog] = useState({ scenes: WEB_SCENES, source: "builtin" });
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const scope = pano.scope;

  useEffect(() => {
    let dead = false;
    fetchCatalog(request).then((c) => { if (!dead) setCatalog(c); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const run = useCallback(async (need, force = false) => {
    const M = maps.current;
    const id = `${need.type}:${need.key}`;
    const ttl = need.type === "web" ? WEB_TTL : need.type === "weather" ? WEATHER_TTL : CITIES_TTL;
    if (M.busy.has(id)) return;
    if (!force && M.at.has(id) && Date.now() - M.at.get(id) < ttl) return;
    M.busy.add(id);
    try {
      if (need.type === "web") {
        const r = await fetchWebScene(request, need.scene, need.opts, scope);
        const prev = M.web.get(need.key);
        // Hata olursa son sağlam yük kalır (yayına boş kart gitmez).
        M.web.set(need.key, r.payload || !prev?.payload ? r : { ...prev, error: null });
        preloadImages(webPayloadImages(r.payload));
      } else if (need.type === "weather") {
        const fn = window.elitlig?.studio?.panorama?.weather;
        const r = fn ? await fn(need.q) : { ok: false, error: "Bu sürümde hava durumu yok." };
        const prev = M.weather.get(need.key);
        M.weather.set(need.key, r.ok ? { weather: r.weather } : prev?.weather ? prev : { error: r.error || "Alınamadı." });
      } else if (need.type === "cities") {
        const r = await fetchCities(request, need.ids);
        const prev = M.cities.get(need.key);
        M.cities.set(need.key, r.cities?.length || !prev ? r : prev);
        preloadImages((r.cities || []).flatMap((c) => [c.leader?.teamLogo, c.topScorer?.image]).filter(Boolean));
      }
      M.at.set(id, Date.now());
      bump();
    } catch { /* yoksay */ } finally { M.busy.delete(id); }
  }, [scope, bump]);

  // Listedeki tüm kartların ihtiyaçları (yayın kapsamı / liste değişince).
  const needs = useMemo(() => {
    const out = new Map();
    for (const c of pano.playlist.items) for (const n of cardNeeds(c, data, scope)) out.set(`${n.type}:${n.key}`, n);
    return [...out.values()];
  }, [pano.playlist.items, data, scope]);
  useEffect(() => {
    let dead = false;
    (async () => { for (const n of needs) { if (dead) break; await run(n); } })();
    return () => { dead = true; };
  }, [needs, run]);

  // Yayındaki kart: süresi dolan verisi tazelenir.
  const card = currentCard(pano.playlist);
  const cardRef = useRef(card);
  cardRef.current = card;
  useEffect(() => {
    const t = setInterval(() => { for (const n of cardNeeds(cardRef.current, data, scope)) run(n); }, 15_000);
    return () => clearInterval(t);
  }, [data, scope, run]);

  const refresh = useCallback((c) => { for (const n of cardNeeds(c || cardRef.current, data, scope)) run(n, true); }, [data, scope, run]);

  return { web: maps.current.web, weather: maps.current.weather, cities: maps.current.cities, catalog, version, refresh };
}
