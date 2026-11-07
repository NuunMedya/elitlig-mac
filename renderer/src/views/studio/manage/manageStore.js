// Maç yönetimi · ORTAK DURUM: ayrılmış sekmeler ve parçalar (ör. "Maç yönetimi › Reji",
// panodaki "Reji · olay listesi", birleşik "Maç yönetimi" paneli) aynı anda ekranda olabilir.
// Süzgeçler, seçimler, taslaklar (kadro, puanlar, enler) kopya başına değil BURADA tutulur:
// bir parçada yapılan değişiklik öbürlerinde anında görünür.
//
//   useShared(key, init)          useState gibi: [değer, ayarla] (anahtar başına tek değer)
//   useSharedDraft(key, saved)    sunucudaki kayıttan başlayan taslak: kayıt değişince (ve
//                                 taslak o kayda göre kirli değilse) taslak yenilenir; yeni
//                                 açılan kopya kirli taslağı SİLMEZ
//   resetShared()                 testler için
// Anahtarlar maça bağlıysa maç kimliğini içerir (ör. "kadro.12").
import { useCallback, useMemo, useSyncExternalStore } from "react";

const values = new Map();
const subs = new Map();

const emit = (key) => { for (const f of subs.get(key) || []) f(); };
export function getShared(key, init) {
  if (!values.has(key)) values.set(key, typeof init === "function" ? init() : init);
  return values.get(key);
}
export function setShared(key, value) {
  const prev = values.get(key);
  const next = typeof value === "function" ? value(prev) : value;
  if (Object.is(prev, next)) return;
  values.set(key, next);
  emit(key);
}
export function resetShared() { values.clear(); for (const k of [...subs.keys()]) emit(k); }

function subscribe(key, f) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(f);
  return () => { subs.get(key)?.delete(f); };
}

export function useShared(key, init) {
  getShared(key, init);
  const sub = useCallback((f) => subscribe(key, f), [key]);
  const value = useSyncExternalStore(sub, () => values.get(key), () => values.get(key));
  const set = useCallback((v) => setShared(key, v), [key]);
  return [value, set];
}

/** Kayıttan başlayan ortak taslak: { base: JSON(kayıt), value }. */
export function useSharedDraft(key, saved) {
  const sig = useMemo(() => JSON.stringify(saved ?? null), [saved]);
  const [box, setBox] = useShared(key, () => ({ base: sig, value: saved }));
  // Kayıt değişti (kaydedildi / yenilendi): taslak kayda döner.
  if (box.base !== sig) {
    const next = { base: sig, value: saved };
    values.set(key, next);
    queueMicrotask(() => emit(key));
  }
  const value = box.base !== sig ? saved : box.value;
  const set = useCallback((v) => setBox((b) => ({ ...b, value: typeof v === "function" ? v(b.value) : v })), [setBox]);
  return [value, set];
}
