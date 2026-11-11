// Komut ve klavye yönlendirmesi: genel komutlar (⌘N yeni, ⌘F bul, ⌘P yazdır, ⌘E dışa aktar…)
// ve görünümlerin pencere düzeyindeki tuş dinleyicileri YALNIZ odaktaki bölmenin etkin
// sekmesine gider. Gizli (arka plandaki) sekmeler ve odakta olmayan bölmeler susar.
//
//   • useCommand (api.js) ve useCommandGate: React bağlamıyla (PaneCtx) — kesin.
//   • window/document keydown dinleyicileri: görünüm dinleyiciyi kurarken hangi sekmenin içinde
//     olduğunu bilmez; sekme gövdesi başına ve sonuna konan işaretçiler (OwnerScope) kurulum anında
//     "şu an kuran sekme"yi bildirir. Aynı dinleyicinin yeniden kurulması (bağımlılık değişince
//     kaldır + ekle) sahipliği kaynak metniyle devralır. Sahibi bilinmeyen dinleyici her zaman çalışır.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react";

/* ─────────────────────────── etkin sekmeler (saf) ─────────────────────────── */

const active = new Set();
let multi = false;
/** Workspace her çizimde bildirir: komut alan sekme(ler) ve birden çok sekme var mı. */
export function setCommandTargets(ids, isMulti) {
  active.clear();
  for (const id of ids) active.add(id);
  multi = Boolean(isMulti);
}
/** owner: sekme kimliği ya da "pins" (sabit katman: hep açık). */
export const ownerActive = (owner) => !multi || owner == null || owner === "pins" || active.has(owner);

/* ─────────────────────────── React bağlamı ─────────────────────────── */

export const PaneCtx = createContext(null);
/** Bulunulan bölme/sekme: { tabId, paneId } ya da null (bölme dışında: sabit katman, kabuk). */
export const usePane = () => useContext(PaneCtx);

/** () => bu bileşen komut almalı mı? (bölme dışında her zaman true; sabit katmanda false). */
export function useCommandGate() {
  const ctx = useContext(PaneCtx);
  const ref = useRef(ctx);
  ref.current = ctx;
  return useCallback(() => {
    const c = ref.current;
    if (!c) return true;
    if (c.tabId === "pins") return false; // sabit bileşenler genel komutları yakalamaz
    return ownerActive(c.tabId);
  }, []);
}

/* ─────────────────────────── tuş dinleyicisi sahipliği ─────────────────────────── */

const KEY_TYPES = new Set(["keydown", "keyup", "keypress"]);
let current = null;
const recent = new Map(); // `${type}|${kaynak}` → [sahip] (kaldırılıp hemen yeniden kurulan dinleyiciler)
let flushQueued = false;
const flushSoon = () => {
  if (flushQueued) return;
  flushQueued = true;
  setTimeout(() => { recent.clear(); flushQueued = false; }, 0);
};
const srcOf = (fn) => { try { return Function.prototype.toString.call(fn).slice(0, 400); } catch { return ""; } };

/** Kurulum anındaki sahip (testler için de). */
export const currentOwner = () => current;
export const setCurrentOwner = (o) => { current = o; };

/**
 * window ve document'ın tuş dinleyicilerini sahiplik kapısıyla sarar (bir kez).
 * isActive(owner) false iken o sahibin dinleyicileri olayı görmez.
 */
export function installKeyGate(targets = [typeof window !== "undefined" ? window : null, typeof document !== "undefined" ? document : null], isActive = ownerActive) {
  for (const target of targets.filter(Boolean)) {
    if (target.__wsKeyGate) continue;
    target.__wsKeyGate = true;
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    const wrappers = new WeakMap(); // fn → Map(`${type}|${capture}` → { w, owner })
    target.addEventListener = function patchedAdd(type, fn, opts) {
      if (!KEY_TYPES.has(type) || typeof fn !== "function") return add.call(this, type, fn, opts);
      const capture = typeof opts === "boolean" ? opts : Boolean(opts && opts.capture);
      const k = `${type}|${capture}`;
      let map = wrappers.get(fn);
      if (!map) { map = new Map(); wrappers.set(fn, map); }
      if (map.has(k)) return undefined; // aynı dinleyici iki kez eklenmez (tarayıcı davranışı)
      let owner = current;
      if (owner == null) {
        const list = recent.get(`${type}|${srcOf(fn)}`);
        if (list?.length) owner = list.shift();
      }
      const entry = { owner, w: null };
      entry.w = function gated(e) { if (entry.owner != null && !isActive(entry.owner)) return undefined; return fn.call(this, e); };
      map.set(k, entry);
      return add.call(this, type, entry.w, opts);
    };
    target.removeEventListener = function patchedRemove(type, fn, opts) {
      if (!KEY_TYPES.has(type) || typeof fn !== "function") return remove.call(this, type, fn, opts);
      const capture = typeof opts === "boolean" ? opts : Boolean(opts && opts.capture);
      const k = `${type}|${capture}`;
      const map = wrappers.get(fn);
      const entry = map?.get(k);
      if (!entry) return remove.call(this, type, fn, opts);
      map.delete(k);
      if (entry.owner != null) {
        const key = `${type}|${srcOf(fn)}`;
        if (!recent.has(key)) recent.set(key, []);
        recent.get(key).push(entry.owner);
        flushSoon();
      }
      return remove.call(this, type, entry.w, opts);
    };
  }
}

/** Sekme gövdesinin başına/sonuna konan işaretçiler: aradaki bileşenlerin etkileri bu sekmeye aittir. */
function Mark({ owner }) {
  useLayoutEffect(() => { current = owner; });
  useEffect(() => { current = owner; });
  return null;
}
function Unmark() {
  useLayoutEffect(() => { current = null; });
  useEffect(() => { current = null; });
  return null;
}
export function OwnerScope({ owner, children }) {
  return <><Mark owner={owner} />{children}<Unmark /></>;
}
