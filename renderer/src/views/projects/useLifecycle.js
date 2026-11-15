// Künye, maliyet hesabı ve akış verisi için kancalar. Okumalar çevrimdışıyken
// önbellekten gelir (ana süreç); yazmalar bağlantı ister (useRun açıkça bildirir).
import { useCallback, useEffect, useRef, useState } from "react";
import { get, patch, post, put, request, useResource } from "../../api";
import { BASE, useRun } from "./common";

export const FEED_EVENT = "project:feed";
export const POLL_MS = 20000;

/** Künye görünümü + kaydet. onSaved: proje verisini tazelemek için. */
export function useBrief(projectId, { onSaved } = {}) {
  const res = useResource(`${BASE}/${projectId}/brief`);
  const run = useRun();
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const save = useCallback(async (body, okMessage) => {
    const r = await patch(`${BASE}/${projectId}/brief`, body);
    if (!run(r, okMessage)) return null;
    res.setData(r.data);
    saved.current?.(r.data, body);
    return r.data;
  }, [projectId, run, res.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...res, save };
}

/** Maliyet hesabı: call(method, path, body) sunucunun döndürdüğü görünümü yazar. */
export function useCosts(projectId) {
  const res = useResource(`${BASE}/${projectId}/costs`);
  const run = useRun();
  const call = useCallback(async (method, sub, body, okMessage) => {
    const r = await request({ method, path: `${BASE}/${projectId}/costs${sub || ""}`, body, queue: false });
    const message = typeof okMessage === "function" && r.ok ? okMessage(r.data) : okMessage;
    if (!run(r, message)) return null;
    if (r.data?.items && r.data?.summary) res.setData(r.data);
    return r.data;
  }, [projectId, run, res.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...res, call };
}

/**
 * Proje akışı olayları: ana süreçteki sohbet bağlantısı "project:feed"
 * olayını "chat:event" ile iletir. { live }: bağlantı durumu (yoksa yoklama).
 */
export function useFeedEvents(projectId, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  const [live, setLive] = useState(false);
  useEffect(() => {
    const chat = window.elitlig?.chat;
    if (!chat) return undefined;
    chat.status?.().then((st) => setLive(st?.state === "connected")).catch(() => {});
    const offStatus = chat.onStatus?.((st) => setLive(st?.state === "connected")) || (() => {});
    const off = chat.onEvent?.((e) => {
      if (e?.name === FEED_EVENT && Number(e.payload?.project_id) === Number(projectId)) ref.current?.(e.payload);
    }) || (() => {});
    return () => { off(); offStatus(); };
  }, [projectId]);
  return { live };
}

/** Akış sekmesinin okunmadı rozeti. */
export function useFeedUnread(projectId, { active = false } = {}) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => get(`${BASE}/${projectId}/feed/unread`).then((r) => { if (r.ok) setUnread(Number(r.data?.unread) || 0); }), [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (active) setUnread(0); }, [active]);
  const { live } = useFeedEvents(projectId, (p) => { if (!active && ["post", "comment"].includes(p.action)) setUnread((n) => n + 1); });
  useEffect(() => {
    if (live || active) return undefined;
    const t = setInterval(load, POLL_MS * 3);
    return () => clearInterval(t);
  }, [live, active, load]);
  return unread;
}

export { post, put };
