// Yayın grafikleri · GRAFİK PAKETİ DEPOSU (bu bilgisayarda, localStorage
// "studio.gfxPackages.v1"; ayar şablonlarında "Grafik paketleri" grubu).
//
//   usePackageStore()      [depo, güncelle]  — galeri, parçacık ve useGraphics aynı depoyu paylaşır
//   getPackageStore() / setPackageStore(fn | yama)
//   reloadPackageStore()   ayar şablonu uygulanınca depodan yeniden oku
//
// Bekleyen paket ("Sonraki geçişte"): bellekte; GEÇİŞ'te Studio uygular.
import { useEffect, useState } from "react";
import { PACKAGE_STORE_KEY, normalizePackageStore } from "../../../lib/studio/graphics/packages";

const read = () => {
  try { return normalizePackageStore(JSON.parse(localStorage.getItem(PACKAGE_STORE_KEY) || "null")); } catch { return normalizePackageStore(null); }
};

let current = null;
const subs = new Set();
const ensure = () => { if (!current) current = read(); return current; };

export const getPackageStore = () => ensure();

export function setPackageStore(patch) {
  const cur = ensure();
  const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
  current = normalizePackageStore(next);
  try { localStorage.setItem(PACKAGE_STORE_KEY, JSON.stringify(current)); } catch { /* yer yoksa yalnız bellekte */ }
  subs.forEach((fn) => fn(current));
  return current;
}

export function reloadPackageStore() {
  current = read();
  subs.forEach((fn) => fn(current));
  return current;
}

export function usePackageStore() {
  const [s, setS] = useState(ensure);
  useEffect(() => {
    subs.add(setS);
    setS(ensure());
    return () => { subs.delete(setS); };
  }, []);
  return [s, setPackageStore];
}

/* ------------------------------ bekleyen paket ------------------------------ */

let pending = null; // { id, matchId, at }
const pendSubs = new Set();
export const getPendingPackage = () => pending;
export function setPendingPackage(v) {
  pending = v ? { ...v, at: Date.now() } : null;
  pendSubs.forEach((fn) => fn(pending));
}
export function usePendingPackage() {
  const [p, setP] = useState(pending);
  useEffect(() => { pendSubs.add(setP); setP(pending); return () => { pendSubs.delete(setP); }; }, []);
  return p;
}
