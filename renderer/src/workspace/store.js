// Çalışma alanı kaydı: kullanıcı başına localStorage. Son oturum açılışta geri gelir; adlı
// çalışma alanları (kayıtlı düzenler) ayrı anahtarda. Okuma her zaman onarımla (model.migrateState).
import { migrateState, serializeState } from "./model";
import { normalizePins } from "./pins/pinModel";

export const WS_PREFIX = "workspace.v1";
export const SAVED_PREFIX = "workspace.saved.v1";
export const PINS_PREFIX = "workspace.pins.v1";
export const MAX_SAVED = 20;

const ls = () => { try { return window.localStorage; } catch { return null; } };
const read = (key) => { try { const v = ls()?.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };
const write = (key, value) => { try { ls()?.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const wsKey = (uid) => `${WS_PREFIX}:${uid ?? "anon"}`;
export const savedKey = (uid) => `${SAVED_PREFIX}:${uid ?? "anon"}`;
export const pinsKey = (uid) => `${PINS_PREFIX}:${uid ?? "anon"}`;

/**
 * Son oturum. Kayıt yoksa eski tek görünüm: "route" anahtarındaki son araç tek sekmede.
 * Sekme argümanları (ör. "yeni kayıt aç") yeniden açılışta tekrar çalışmasın diye atılır.
 */
export function loadWorkspace(uid, { validRoute, fallbackRoute }) {
  const raw = read(wsKey(uid));
  const s = migrateState(raw, { validRoute, fallbackRoute });
  for (const t of Object.values(s.tabs)) t.arg = null;
  return s;
}
export const saveWorkspace = (uid, s) => write(wsKey(uid), serializeState(s));

export function listSaved(uid) {
  const list = read(savedKey(uid));
  return Array.isArray(list) ? list.filter((x) => x && typeof x.name === "string" && x.state) : [];
}
export function saveNamed(uid, name, s) {
  const clean = String(name || "").trim().slice(0, 40) || "Çalışma alanı";
  const list = listSaved(uid).filter((x) => x.name.toLocaleLowerCase("tr-TR") !== clean.toLocaleLowerCase("tr-TR"));
  list.unshift({ id: `w${Date.now().toString(36)}`, name: clean, savedAt: Date.now(), state: serializeState(s) });
  write(savedKey(uid), list.slice(0, MAX_SAVED));
  return listSaved(uid);
}
export function deleteSaved(uid, id) {
  write(savedKey(uid), listSaved(uid).filter((x) => x.id !== id));
  return listSaved(uid);
}
export function loadSaved(uid, id, opts) {
  const hit = listSaved(uid).find((x) => x.id === id);
  if (!hit) return null;
  const s = migrateState(hit.state, opts);
  for (const t of Object.values(s.tabs)) t.arg = null;
  return s;
}

export const loadPins = (uid, isKnown) => normalizePins(read(pinsKey(uid)), { isKnown });
export const savePins = (uid, s) => write(pinsKey(uid), s);
