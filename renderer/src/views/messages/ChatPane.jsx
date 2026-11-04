// Açık sohbet: başlık (çevrimiçi / son görülme / yazıyor…), sabitlenmiş mesaj,
// gün ayraçlı mesaj akışı (yukarı kaydırınca eski mesajlar), mesaj eylemleri,
// çoklu seçim (ilet, yıldızla, kopyala, sil), sürükle-bırak ekler ve yazma alanı.
//
// Üye mesajları (conv._inbox): üyenin "ElitLig Yönetimi" sohbeti aynı bölmede
// açılır; mesajlar /api/admin/chat'ten okunur, yanıt ElitLig Yönetimi adına
// gider, okundu ortak damgadır. Tepki, yıldız, sabitleme, düzenleme, silme
// ve iletme bu sohbetlerde yoktur (sunucu yönetim görünümünde desteklemez).
//
// Hazır içerikler (2.8, yönetim hesapları): "+" menüsünden ya da grup
// başlığındaki hızlı eylemden günün maçları kartı, "Ben talibim" görev anketi
// ve Haftanın Enleri anketi gönderilir; talip ol / görevlendir / kapat ve
// aday önerisi / koordinasyon pencereleri buradan yönetilir.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon, MenuButton, Spinner, useConfirm, useToast } from "../../components/ui";
import { del, get, post, put, request, useCommand } from "../../api";
import { Avatar, C, PointMenu, chatApi, fileToPayload, isImageName } from "./common";
import { Bubble } from "./Bubble";
import Composer from "./Composer";
import { AttachPreview, ForwardModal, Lightbox, LocationModal, MessageInfoModal, PollModal, ReactionsModal, VotersModal } from "./Pickers";
import {
  QUICK_REACTIONS, albumize, applyReaction, canDelete, canEdit, canForward, groupMessages, isGroupChat, lastSeenLabel,
  markReadUntil, mergeMessages, newClientId, nextVote, pollResults, quoteText,
} from "../../lib/chatUtils";
import { A, KIND_LABELS, asInboxMessage } from "../../lib/inboxUtils";
import { attachOptions, assignChoices, dutyLabel, toggleVolunteer } from "../../lib/chatContent";
import { AwardForm, AwardTaskModal, MatchesForm, SignupForm } from "./ContentForms";

const PAGE = 40;

export default function ChatPane({ conv, me, conversations, subscribe, typing, presence, link, drafts, actions, panel, setPanel, jump, onConsumedJump, onRead, onConvPatch, canReply = true, access = {}, onBack, go }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [reply, setReply] = useState(null);
  const [edit, setEdit] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [drag, setDrag] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [assignMenu, setAssignMenu] = useState(null);
  const listRef = useRef(null);
  const keepScroll = useRef(null);
  const stick = useRef(true);
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const meId = Number(me.id);
  const meSender = useMemo(() => ({ user_id: meId, name: me.name, is_me: true }), [meId, me.name]);
  const isGroup = isGroupChat(conv);
  const participants = conv.participants || [];
  const draft = drafts.get(conv.id);
  const seq = useRef(0);
  const lastRead = useRef(0);
  const olderBusy = useRef(false);
  const inbox = Boolean(conv._inbox);
  const base = inbox ? A : C;
  const norm = useCallback((list) => (inbox ? (list || []).map(asInboxMessage) : list || []), [inbox]);
  // Hazır içerik yetkileri: yönetim hesabı (content), görevlendirme (staff.assign), haftanın enleri (todos.assign).
  const caps = useMemo(() => ({ content: Boolean(access.content) && !inbox, assign: Boolean(access.assign) && !inbox, award: Boolean(access.award) && !inbox }), [access.content, access.assign, access.award, inbox]);
  const attachItems = useMemo(() => attachOptions({ management: caps.content, inbox, canAward: caps.award }), [caps, inbox]);

  const patchMsg = useCallback((key, fn) => setMessages((list) => list.map((m) => ((m.id && m.id === key) || m.client_id === key ? { ...m, ...(typeof fn === "function" ? fn(m) : fn) } : m))), []);

  /* ------------------------------- yükleme ------------------------------- */
  const withPending = async (list) => {
    const pending = (await chatApi().pending()).filter((p) => p.conversation_id === Number(conv.id) && !list.some((m) => m.client_id === p.client_id));
    return mergeMessages(list, pending.map((p) => ({ client_id: p.client_id, kind: "text", body: p.body, created_at: p.at, sender: meSender, _queued: true, reply_to: p.reply_to_id ? { id: p.reply_to_id, body: "" } : null })));
  };
  const load = useCallback(async () => {
    setLoading(true);
    const res = await get(`${base}/conversations/${conv.id}/messages`, { limit: PAGE });
    if (res.ok) {
      stick.current = true;
      setMessages(await withPending(norm(res.data.messages)));
      setHasMore(Boolean(res.data.has_more));
      if (res.data.conversation && !inbox) onConvPatch(conv.id, res.data.conversation, { soft: true });
    } else setMessages(await withPending([]));
    setOffline(Boolean(res.offline));
    setLoading(false);
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Son sayfayı yeniden okur: yeni mesajlar, okundu durumları, tepkiler, düzenlemeler. */
  const syncTail = useCallback(async () => {
    const res = await get(`${base}/conversations/${conv.id}/messages`, { limit: PAGE });
    if (!res.ok) return;
    setOffline(Boolean(res.offline));
    setMessages((list) => {
      const incoming = norm(res.data.messages);
      const lastKnown = Math.max(0, ...list.filter((m) => m.id).map((m) => m.id));
      const fresh = incoming.filter((m) => m.id > lastKnown && !m.sender?.is_me).length;
      if (fresh && !stick.current) setNewBelow((n) => n + fresh);
      return mergeMessages(list, incoming);
    });
  }, [conv.id, base, norm]);

  const loadOlder = useCallback(async () => {
    const first = msgsRef.current.find((m) => m.id);
    if (!first || !hasMore) return false;
    const el = listRef.current;
    keepScroll.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
    const res = await get(`${base}/conversations/${conv.id}/messages`, { before: first.id, limit: PAGE });
    if (!res.ok) { keepScroll.current = null; return false; }
    setHasMore(Boolean(res.data.has_more));
    setMessages((list) => mergeMessages(norm(res.data.messages), list));
    return true;
  }, [conv.id, hasMore, base, norm]);

  useEffect(() => {
    setMessages([]); setReply(draft?.reply || null); setEdit(null); setSelecting(null); setModal(null); setNewBelow(0);
    load();
    chatApi().setActive(conv.id);
    return () => { chatApi().setActive(null); };
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Okundu: pencere odaktaysa ve karşı taraftan okunmamış mesaj varsa.
  const markRead = useCallback(() => {
    if (!document.hasFocus() || document.hidden) return;
    const lastOther = [...msgsRef.current].reverse().find((m) => m.id && !m.sender?.is_me && m.kind !== "system");
    if (!lastOther && !conv.unread && !conv.marked_unread) return;
    if (!conv.unread && !conv.marked_unread && lastOther && lastOther.id <= lastRead.current) return;
    lastRead.current = lastOther?.id || 0;
    onRead(conv.id);
    request({ method: "POST", path: `${base}/conversations/${conv.id}/read`, body: {}, queue: false });
  }, [conv.id, conv.unread, conv.marked_unread, onRead, base]);
  useEffect(() => { if (!loading) markRead(); }, [loading, messages.length, markRead]);
  useEffect(() => {
    const onFocus = () => { lastRead.current = 0; markRead(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  // Gerçek zaman: bu sohbetin olayları.
  const syncTimer = useRef(null);
  const syncSoon = useCallback((ms = 400) => { clearTimeout(syncTimer.current); syncTimer.current = setTimeout(syncTail, ms); }, [syncTail]);
  useEffect(() => subscribe((name, payload) => {
    if (name === "chat:poll" || name === "sync:done") { syncSoon(100); return; }
    if (Number(payload?.conversation_id) !== Number(conv.id)) return;
    // Üye yazdı: sunucu yönetime yalnız sohbet kimliğini yollar.
    if (name === "chat:admin-inbox") { syncSoon(150); return; }
    if (name === "chat:message" && payload.message) {
      const m = inbox ? asInboxMessage(payload.message) : payload.message;
      setMessages((list) => mergeMessages(list, [m]));
      if (!m.sender?.is_me && !stick.current) setNewBelow((n) => n + 1);
      syncSoon(m.reply_to_id || m.kind !== "text" ? 200 : 900);
    } else if (name === "chat:updated" && payload.message) setMessages((list) => mergeMessages(list, norm([payload.message])));
    else if (name === "chat:deleted") patchMsg(Number(payload.message_id), { deleted: true, body: null, meta: null, reactions: [] });
    else if (name === "chat:read" && Number(payload.user_id) !== meId) setMessages((list) => markReadUntil(list, payload.read_at || new Date(), { group: isGroup }));
  }), [subscribe, conv.id, syncSoon, patchMsg, meId, isGroup, inbox, norm]);
  // Socket yokken açık sohbet daha sık yoklanır.
  useEffect(() => {
    if (link === "connected") return undefined;
    const t = setInterval(() => syncTail(), 6000);
    return () => clearInterval(t);
  }, [link, syncTail]);
  useEffect(() => () => clearTimeout(syncTimer.current), []);

  /* -------------------------------- kaydırma -------------------------------- */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepScroll.current) {
      el.scrollTop = el.scrollHeight - keepScroll.current.height + keepScroll.current.top;
      keepScroll.current = null;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  // Panel açılınca / pencere boyutu değişince alttaysa altta kalır.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [loading]);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    stick.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && newBelow) setNewBelow(0);
    if (el.scrollTop < 120 && hasMore && !keepScroll.current && !olderBusy.current) {
      olderBusy.current = true;
      loadOlder().finally(() => { olderBusy.current = false; });
    }
  };
  const toBottom = () => { const el = listRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setNewBelow(0); };

  const jumpTo = useCallback(async (id) => {
    for (let i = 0; i < 12; i += 1) {
      const el = listRef.current?.querySelector(`[data-mid="${id}"]`);
      if (el) {
        stick.current = false;
        // Yalnız mesaj akışı kaydırılır (scrollIntoView üst kapları da kaydırıyordu).
        const box = listRef.current;
        box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2), behavior: "smooth" });
        setHighlight(id);
        setTimeout(() => setHighlight(null), 1800);
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      if (!(await loadOlder())) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 60));
    }
    toast("Mesaj bulunamadı.", { tone: "warn" });
  }, [loadOlder, toast]);
  useEffect(() => {
    if (jump?.conversationId === conv.id && jump.messageId && !loading) { jumpTo(jump.messageId); onConsumedJump(); }
  }, [jump, loading, conv.id, jumpTo, onConsumedJump]);

  /* -------------------------------- gönderme -------------------------------- */
  const optimistic = (extra) => {
    seq.current += 1;
    const m = { client_id: newClientId(), kind: "text", created_at: new Date().toISOString(), sender: meSender, reactions: [], _pending: true, _seq: seq.current, ...extra };
    stick.current = true;
    setMessages((list) => [...list, m]);
    return m;
  };
  const deliver = async (m, body) => {
    // Üye mesajlarında yanıt yönetim adına gider; kuyruğa alınmaz (bağlantı ister).
    const res = await request({ method: "POST", path: `${base}/conversations/${conv.id}/messages`, body: { ...body, client_id: m.client_id }, ...(inbox ? { queue: false } : {}) });
    if (res.ok && res.queued) { patchMsg(m.client_id, { _pending: false, _queued: true }); return res; }
    if (res.ok && res.data?.message) {
      const sent = inbox ? asInboxMessage(res.data.message) : res.data.message;
      setMessages((list) => mergeMessages(list, [{ ...sent, _localUrl: m._localUrl }]));
      onConvPatch(conv.id, { last_message: sent, last_message_at: sent.created_at, marked_unread: false, ...(inbox ? { unread: 0 } : {}) });
      return res;
    }
    patchMsg(m.client_id, { _pending: false, _failed: true, _error: res.offline ? "Bağlantı yok" : res.error?.message, _body: body });
    return res;
  };
  const sendText = (text, mentions) => {
    const r = reply;
    setReply(null);
    drafts.clear(conv.id);
    const body = { kind: "text", body: text, reply_to_id: r?.id || null, mentions };
    const m = optimistic({ body: text, reply_to: r ? { id: r.id, body: quoteText(r), kind: r.kind, sender_name: r.sender?.is_me ? me.name : r.sender?.name } : null, meta: mentions?.length ? { mentions } : null });
    deliver(m, body);
  };
  const saveEdit = async (text) => {
    const target = edit;
    setEdit(null);
    if (!target || text === target.body) return;
    patchMsg(target.id, { body: text, edited_at: new Date().toISOString() });
    const res = await request({ method: "PATCH", path: `${C}/conversations/${conv.id}/messages/${target.id}`, body: { body: text } });
    if (res.ok) setMessages((list) => mergeMessages(list, [res.data.message]));
    else { patchMsg(target.id, { body: target.body, edited_at: target.edited_at }); toast(res.error?.message || "Düzenlenemedi.", { tone: "error" }); }
  };
  const uploadAndSend = async (m, file, caption) => {
    const up = await chatApi().upload(m.kind === "audio" ? "audio" : "file", file);
    if (!up.ok) { patchMsg(m.client_id, { _pending: false, _failed: true, _error: up.error?.message || "Yüklenemedi", _file: file, _caption: caption }); return; }
    const meta = m.kind === "audio"
      ? { audio: { url: up.data.url, duration_ms: m.meta.audio.duration_ms, mime: up.data.mime || file.mime } }
      : { file: { url: up.data.url, name: up.data.name || file.name, mime: up.data.mime || file.mime, size: up.data.size || file.size, width: file.width, height: file.height } };
    await deliver(m, { kind: m.kind, body: caption || null, meta, reply_to_id: m.reply_to?.id || null });
  };
  const sendFiles = async (files, caption) => {
    setModal(null);
    const r = reply;
    setReply(null);
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const image = isImageName(f.name, f.mime);
      const cap = i === files.length - 1 ? caption : "";
      const localUrl = image ? URL.createObjectURL(new Blob([f.data], { type: f.mime || "image/png" })) : null;
      const m = optimistic({ kind: image ? "image" : "file", body: cap || null, _localUrl: localUrl, meta: { file: { name: f.name, size: f.size, mime: f.mime, width: f.width, height: f.height }, caption: cap || null }, reply_to: i === 0 && r ? { id: r.id, body: quoteText(r), sender_name: r.sender?.name } : null });
      // eslint-disable-next-line no-await-in-loop
      await uploadAndSend(m, f, cap);
    }
  };
  const sendVoice = async (blob, ms) => {
    const data = new Uint8Array(await blob.arrayBuffer());
    const file = { name: `sesli-mesaj-${Date.now()}.${blob.type.includes("mp4") ? "m4a" : "webm"}`, mime: blob.type.split(";")[0] || "audio/webm", size: data.length, data };
    const m = optimistic({ kind: "audio", body: "Sesli mesaj", _localUrl: URL.createObjectURL(blob), meta: { audio: { duration_ms: ms } } });
    uploadAndSend(m, file, "");
  };
  const sendRich = async (kind, meta, fallback) => {
    setModal(null);
    const m = optimistic({ kind, body: fallback, meta });
    const res = await deliver(m, { kind, meta });
    if (!res.ok) toast(res.offline ? "Anket ve konum için bağlantı gerekir." : res.error?.message || "Gönderilemedi.", { tone: "error" });
  };
  const retry = (m) => {
    patchMsg(m.client_id, { _failed: false, _pending: true, _error: null });
    if (m._file) uploadAndSend(m, m._file, m._caption);
    else deliver(m, m._body || { kind: "text", body: m.body });
  };
  const pickFiles = async (which) => {
    const list = await chatApi().pick({ images: which === "images" });
    const big = list.filter((f) => f.tooLarge);
    if (big.length) toast(`${big.map((f) => f.name).join(", ")}: 25 MB'tan büyük dosya gönderilemez.`, { tone: "error" });
    const ok = list.filter((f) => f.data);
    if (ok.length) setModal({ type: "attach", files: ok });
  };
  const takeFiles = async (fileList) => {
    const arr = [...fileList].slice(0, 10);
    if (!arr.length) return;
    if (arr.some((f) => f.size > 25 * 1024 * 1024)) { toast("25 MB'tan büyük dosya gönderilemez.", { tone: "error" }); return; }
    setModal({ type: "attach", files: await Promise.all(arr.map(fileToPayload)) });
  };
  const onFiles = (arg) => (typeof arg === "string" ? pickFiles(arg) : takeFiles(arg));

  /* --------------------------------- eylemler --------------------------------- */
  const react = async (m, emoji) => {
    const before = m.reactions;
    patchMsg(m.id, { reactions: applyReaction(m.reactions, emoji, { user_id: meId, name: me.name }) });
    const res = await request({ method: "POST", path: `${C}/conversations/${conv.id}/messages/${m.id}/reactions`, body: { emoji } });
    if (res.ok) setMessages((list) => mergeMessages(list, [res.data.message]));
    else { patchMsg(m.id, { reactions: before }); toast(res.offline ? "Tepki için bağlantı gerekir." : res.error?.message, { tone: "error" }); }
  };
  const star = async (list, on) => {
    for (const m of list) {
      patchMsg(m.id, { starred: on });
      // eslint-disable-next-line no-await-in-loop
      const res = on ? await put(`${C}/conversations/${conv.id}/messages/${m.id}/star`, {}) : await del(`${C}/conversations/${conv.id}/messages/${m.id}/star`);
      if (!res.ok) { patchMsg(m.id, { starred: !on }); toast(res.error?.message || "Yapılamadı.", { tone: "error" }); break; }
    }
  };
  const removeMsgs = async (list) => {
    if (!(await confirm({ title: list.length > 1 ? `${list.length} mesaj silinsin mi?` : "Mesaj silinsin mi?", message: "Mesaj herkesten silinir; sohbette “Bu mesaj silindi” yazar.", danger: true, confirmLabel: "Herkesten sil" }))) return;
    for (const m of list) {
      // eslint-disable-next-line no-await-in-loop
      const res = await del(`${C}/conversations/${conv.id}/messages/${m.id}`);
      if (res.ok) patchMsg(m.id, { deleted: true, body: null, meta: null, reactions: [] });
      else { toast(res.error?.message || "Silinemedi.", { tone: "error" }); break; }
    }
    setSelecting(null);
  };
  const forward = async (ids, targets) => {
    setModal(null);
    const res = await request({ method: "POST", path: `${C}/forward`, body: { message_ids: ids, conversation_ids: targets }, queue: false });
    if (res.ok) { toast(`${res.data.sent} mesaj iletildi.`, { tone: "success" }); setSelecting(null); } else toast(res.offline ? "İletmek için bağlantı gerekir." : res.error?.message, { tone: "error" });
  };
  const pinMsg = async (m) => {
    const id = conv.pinned_message_id === m?.id ? null : m?.id || null;
    const res = await request({ method: "PUT", path: `${C}/conversations/${conv.id}/pin`, body: { message_id: id } });
    if (res.ok) { onConvPatch(conv.id, { pinned_message_id: id }); syncSoon(200); } else toast(res.error?.message || "Sabitlenemedi.", { tone: "error" });
  };
  const vote = async (m, optionId) => {
    const current = pollResults(m.meta.poll, meId).mine;
    const next = nextVote(m.meta.poll, current, optionId);
    const votes = Object.fromEntries(Object.entries(m.meta.poll.votes || {}).map(([k, v]) => [k, v.filter((u) => Number(u) !== meId)]));
    next.forEach((o) => { votes[o] = [...(votes[o] || []), meId]; });
    patchMsg(m.id, { meta: { ...m.meta, poll: { ...m.meta.poll, votes } } });
    const res = await request({ method: "POST", path: `${C}/conversations/${conv.id}/messages/${m.id}/vote`, body: { option_ids: next } });
    if (res.ok) setMessages((list) => mergeMessages(list, [res.data.message]));
    else { patchMsg(m.id, { meta: m.meta }); toast(res.offline ? "Oy için bağlantı gerekir." : res.error?.message, { tone: "error" }); }
  };
  /* ----------------------------- hazır içerikler ----------------------------- */
  const sendContent = async (type, body) => {
    const res = await request({ method: "POST", path: `${C}/conversations/${conv.id}/content/${type}`, body, queue: false });
    if (!res.ok) { toast(res.offline ? "Hazır içerik göndermek için bağlantı gerekir." : res.error?.message || "Gönderilemedi.", { tone: "error" }); return false; }
    const sent = res.data.message;
    stick.current = true;
    setMessages((list) => mergeMessages(list, [sent]));
    onConvPatch(conv.id, { last_message: sent, last_message_at: sent.created_at, marked_unread: false });
    toast(type === "award" ? "Haftanın Enleri anketi gönderildi; aday öneri kartları açıldı." : type === "signup" ? "Görev anketi gönderildi." : "Maç programı gönderildi.", { tone: "success" });
    return true;
  };
  const signupCall = async (m, path, body, fallbackError) => {
    const res = await request({ method: "POST", path: `${C}/conversations/${conv.id}/messages/${m.id}/signup${path}`, body, queue: false });
    if (res.ok && res.data?.message) setMessages((list) => mergeMessages(list, [res.data.message]));
    else toast(res.offline ? "Bu işlem için bağlantı gerekir." : res.error?.message || fallbackError, { tone: "error" });
    return res.ok;
  };
  const signupToggle = async (m, { slot_id: slotId, on }) => {
    const before = m.meta;
    patchMsg(m.id, { meta: { ...m.meta, signup: toggleVolunteer(m.meta.signup, slotId, me, on) } });
    if (!(await signupCall(m, "", { slot_id: slotId, on }, "Yapılamadı."))) patchMsg(m.id, { meta: before });
  };
  const signupAssign = async (m, slotId, userId, name) => {
    if (await signupCall(m, "/assign", { slot_id: slotId, user_id: userId }, "Görevlendirilemedi.")) toast(userId ? `${name} görevlendirildi; maç ekibine yazıldı.` : "Görev boşaltıldı.", { tone: "success" });
  };
  const signupClose = async (m, closed) => {
    if (closed && !(await confirm({ title: "Anket kapatılsın mı?", message: "Kapanan ankete yeni talip gelmez. İstediğinizde yeniden açabilirsiniz.", confirmLabel: "Anketi kapat" }))) return;
    if (await signupCall(m, "/close", { closed }, "Yapılamadı.")) toast(closed ? "Anket kapandı." : "Anket yeniden açıldı.", { tone: "success" });
  };

  const images = useMemo(() => messages.filter((m) => m.kind === "image" && !m.deleted), [messages]);

  const onAction = useCallback((type, target, extra) => {
    const list = Array.isArray(target) ? target : [target];
    const m = list[list.length - 1];
    if (inbox && ["react", "vote"].includes(type)) return;
    switch (type) {
      case "menu": setMenu({ at: extra, list }); break;
      case "react": setMenu({ at: extra, list, reactOnly: true }); break;
      case "reactions": setModal({ type: "reactions", m }); break;
      case "jump": jumpTo(target); break;
      case "lightbox": setModal({ type: "lightbox", index: Math.max(0, images.findIndex((x) => (x.id || x.client_id) === (m.id || m.client_id))) }); break;
      case "download": chatApi().download(m.meta?.file?.url, m.meta?.file?.name).then((r) => r.ok && window.elitlig.files.reveal(r.path)); break;
      case "openFile": chatApi().openFile(m.meta?.file?.url, m.meta?.file?.name).then((r) => !r.ok && toast("Dosya açılamadı.", { tone: "error" })); break;
      case "vote": vote(m, extra); break;
      case "voters": setModal({ type: "voters", m }); break;
      case "retry": retry(m); break;
      case "contentForm": setModal({ type: extra.type, initial: extra }); break;
      case "signupToggle": signupToggle(m, extra); break;
      case "signupAssignMenu": setAssignMenu({ at: { rect: extra.rect }, m, row: extra.row }); break;
      case "signupClose": signupClose(m, extra.closed); break;
      case "awardTask": setModal({ type: "awardTask", kind: extra.kind, id: extra.id, week: m.meta?.award?.week }); break;
      case "select": setSelecting((s) => { const n = new Set(s || []); const on = list.every((x) => n.has(x.id)); list.forEach((x) => (on ? n.delete(x.id) : x.id && n.add(x.id))); return n; }); break;
      default: break;
    }
  }, [images, jumpTo, inbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuItems = (list) => {
    const m = list[list.length - 1];
    const multi = list.length > 1;
    if (inbox) {
      return [
        canReply && !multi && { label: "Yanıtla", icon: "reply", onClick: () => { setEdit(null); setReply(m); } },
        m.kind === "text" && { label: "Kopyala", icon: "copy", onClick: () => navigator.clipboard.writeText(m.body || "") },
        { label: "Seç", icon: "checkSquare", onClick: () => setSelecting(new Set(list.map((x) => x.id))) },
      ];
    }
    return [
      { label: "Yanıtla", icon: "reply", onClick: () => { setEdit(null); setReply(m); } },
      m.kind === "text" && { label: "Kopyala", icon: "copy", onClick: () => navigator.clipboard.writeText(m.body || "") },
      list.every(canForward) && { label: "İlet", icon: "forward", onClick: () => setModal({ type: "forward", ids: list.map((x) => x.id) }) },
      { label: list.every((x) => x.starred) ? "Yıldızı kaldır" : "Yıldızla", icon: "star", onClick: () => star(list, !list.every((x) => x.starred)) },
      !multi && { label: conv.pinned_message_id === m.id ? "Sabitlemeyi kaldır" : "Sabitle", icon: "pin", onClick: () => pinMsg(m) },
      !multi && canEdit(m) && { label: "Düzenle", icon: "pencil", onClick: () => { setReply(null); setEdit(m); } },
      !multi && m.sender?.is_me && { label: "Bilgi", icon: "info", onClick: () => setModal({ type: "info", m }) },
      { label: "Seç", icon: "checkSquare", onClick: () => setSelecting(new Set(list.map((x) => x.id))) },
      list.every(canDelete) && "-",
      list.every(canDelete) && { label: "Herkesten sil", icon: "trash", danger: true, onClick: () => removeMsgs(list) },
    ];
  };

  useCommand("find", () => setPanel({ kind: "search" }));

  /* ---------------------------------- çizim ---------------------------------- */
  const items = useMemo(() => albumize(groupMessages(messages)), [messages]);
  const typingNames = Object.values(typing || {}).map((t) => t.name).filter(Boolean);
  const other = conv.other_user;
  const sub = typingNames.length
    ? (isGroup ? `${typingNames.join(", ")} yazıyor…` : "yazıyor…")
    : isGroup ? participants.map((p) => (p.is_me ? "Siz" : p.name)).slice(0, 12).join(", ")
      : [lastSeenLabel(presence?.[other?.user_id]), other?.managed_team_id && other.manager_name && other.manager_name !== conv.title ? `${other.manager_name} · takım başkanı` : other?.subtitle || conv.subtitle].filter(Boolean).join(" · ");
  const disabledReason = inbox ? (canReply ? null : "Yönetim adına yazma yetkiniz yok (messages.reply). Mesajları okuyabilirsiniz.")
    : conv.blocked_by_me ? "Bu kişiyi engellediniz. Mesaj göndermek için kişi bilgisinden engeli kaldırın."
    : conv.can_write === false ? conv.restricted_reason || "Bu sohbete mesaj yazılamaz."
      : conv.only_admins_send && conv.my_role !== "admin" ? "Bu gruba yalnız grup yöneticileri mesaj gönderebilir." : null;
  const pinned = conv.pinned_message_id ? messages.find((m) => m.id === conv.pinned_message_id) : null;
  const selectedList = selecting ? messages.filter((m) => selecting.has(m.id)) : [];
  const lastMine = [...messages].reverse().find((m) => m.sender?.is_me && canEdit(m));
  const isStaff = other?.kind === "staff";
  const inboxSub = inbox ? [KIND_LABELS[conv.kind] && conv.subtitle && !String(conv.subtitle).startsWith(KIND_LABELS[conv.kind]) ? KIND_LABELS[conv.kind] : null, conv.subtitle].filter(Boolean).join(" · ") : null;

  return (
    <section className={`ms-chat ${drag ? "is-drag" : ""}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files") && !disabledReason) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabledReason) takeFiles(e.dataTransfer.files); }}>
      <header className={`ms-chat__head ${inbox ? "is-inbox" : ""}`}>
        {onBack && <button type="button" className="icon-btn ms-back" aria-label="Sohbetlere dön" onClick={onBack}><Icon name="chevronLeft" size={20} /></button>}
        {inbox ? (
          <div className="ms-chat__who">
            <Avatar name={conv.title} id={conv.entity?.user_id ?? conv.id} url={conv.avatar || conv.entity?.avatar} size={40} group={conv.kind === "team"} />
            <span className="ms-chat__titles">
              <strong>{conv.title}<span className="ms-inbox-tag"><Icon name="inbox" size={11} /> Üye mesajı</span></strong>
              <small>{inboxSub || "ElitLig Yönetimi sohbeti"}</small>
            </span>
          </div>
        ) : (
        <button type="button" className="ms-chat__who" onClick={() => setPanel(panel?.kind === "info" ? null : { kind: "info" })}>
          <Avatar name={conv.title} id={other?.user_id ?? conv.id} url={conv.avatar} size={40} group={isGroup} online={!isGroup && presence?.[other?.user_id]?.online} />
          <span className="ms-chat__titles">
            <strong>{conv.title}{other?.team_name && other.team_name !== conv.title && <span className="ms-team">{other.team_name}</span>}</strong>
            <small className={typingNames.length ? "is-typing" : ""}>{sub}</small>
          </span>
        </button>
        )}
        {inbox ? (
        <div className="ms-chat__tools">
          <span className="ms-inbox-note" title="Bu sohbet tüm yönetim ekibinin ortak gelen kutusudur. Yanıtlar üyeye ElitLig Yönetimi adıyla gider; yazan yönetici kayıtta tutulur.">Ortak gelen kutusu</span>
          <MenuButton label="Sohbet menüsü" items={[
            { label: "Mesajları seç", icon: "checkSquare", onClick: () => setSelecting(new Set()) },
            { label: "Sitede aç", icon: "external", onClick: () => window.elitlig.app.openWeb("/yonetim/araclar/mesajlar") },
          ]} />
        </div>
        ) : (
        <div className="ms-chat__tools">
          <span className="ms-tooltip-wrap" title={conv.can_call ? "Sesli arama masaüstünde henüz yok — Elitlig mobil uygulamasından ya da sitedeki sohbetten arayabilirsiniz." : "Bu sohbette sesli arama yapılamaz."}>
            <button type="button" className="icon-btn" disabled aria-label="Sesli arama"><Icon name="phone" size={18} /></button>
          </span>
          {caps.content && isGroup && !disabledReason && (
            <MenuButton label="Hazır içerik gönder" icon="sparkles" className="ms-quick" items={[
              { label: "Günün maçlarını gönder", icon: "ball", onClick: () => setModal({ type: "matches" }) },
              { label: "“Ben talibim” görev anketi", icon: "handshake", onClick: () => setModal({ type: "signup" }) },
              caps.award && { label: "Haftanın Enleri anketi", icon: "trophy", onClick: () => setModal({ type: "award" }) },
            ].filter(Boolean)} />
          )}
          <button type="button" className={`icon-btn ${panel?.kind === "search" ? "is-on" : ""}`} title="Mesajlarda ara (⌘F)" onClick={() => setPanel(panel?.kind === "search" ? null : { kind: "search" })}><Icon name="search" size={18} /></button>
          <MenuButton label="Sohbet menüsü" items={[
            { label: isGroup ? "Grup bilgisi" : "Kişi bilgisi", icon: "info", onClick: () => setPanel({ kind: "info" }) },
            { label: "Medya, bağlantılar ve belgeler", icon: "image", onClick: () => setPanel({ kind: "media" }) },
            { label: "Yıldızlı mesajlar", icon: "star", onClick: () => setPanel({ kind: "starred" }) },
            { label: "Mesajları seç", icon: "checkSquare", onClick: () => setSelecting(new Set()) },
            "-",
            { label: conv.muted ? "Bildirimleri aç" : "Sessize al", icon: conv.muted ? "bell" : "bellOff", onClick: () => actions.mute(conv) },
            { label: conv.pinned ? "Sabitlemeyi kaldır" : "Sohbeti sabitle", icon: "pin", onClick: () => actions.pin(conv) },
            { label: conv.archived ? "Arşivden çıkar" : "Arşivle", icon: "archive", onClick: () => actions.archive(conv) },
            { label: "Okunmadı olarak işaretle", icon: "circle", onClick: () => actions.markUnread(conv) },
            "-",
            !isGroup && !isStaff && other && { label: conv.blocked_by_me ? "Engeli kaldır" : "Engelle", icon: "ban", danger: !conv.blocked_by_me, onClick: () => actions.block(conv) },
            !isStaff && other && { label: "Şikayet et", icon: "flag", danger: true, onClick: () => actions.report(conv) },
            isGroup && conv.type === "group" && { label: "Gruptan çık", icon: "logout", danger: true, onClick: () => actions.leave(conv) },
            { label: "Sohbeti sil", icon: "trash", danger: true, onClick: () => actions.remove(conv) },
          ]} />
        </div>
        )}
      </header>
      {pinned || conv.pinned_message_id ? (
        <button type="button" className="ms-pinbar" onClick={() => jumpTo(conv.pinned_message_id)}>
          <Icon name="pin" size={14} />
          <span><strong>Sabitlenmiş mesaj</strong><small>{pinned ? `${pinned.sender?.is_me ? "Siz" : pinned.sender?.name}: ${quoteText(pinned)}` : "Görmek için tıklayın"}</small></span>
          <span className="icon-btn icon-btn--xs" role="button" tabIndex={0} title="Sabitlemeyi kaldır" onClick={(e) => { e.stopPropagation(); pinMsg(null); }}><Icon name="x" size={12} /></span>
        </button>
      ) : null}
      {offline && <div className="ms-banner"><Icon name="cloudOff" size={13} /> Çevrimdışı: son kaydedilen mesajlar gösteriliyor. Yazdığınız metin mesajları bağlantı gelince gönderilir.</div>}
      <div className="ms-chat__body">
      <div className="ms-chat__scroll" ref={listRef} onScroll={onScroll}>
        <div className="ms-chat__inner">
          {hasMore && <div className="ms-older"><Spinner label="Eski mesajlar…" /></div>}
          {!hasMore && !loading && <div className="ms-encrypt"><Icon name={inbox ? "inbox" : "lock"} size={12} /> {inbox ? "Üyenin ElitLig Yönetimi sohbeti · yanıtlarınız yönetim adına gider. Talepler ve bildirimler burada değil, Talepler'dedir." : "Mesajlar Elitlig sunucusunda saklanır; yalnız sohbetteki kişiler görür."}</div>}
          {loading && !messages.length ? <div className="ms-skel">{[60, 40, 72, 35, 55].map((w, i) => <span key={i} className={i % 2 ? "is-mine" : ""} style={{ width: `${w}%` }} />)}</div> : items.map((it) => (
            it.type === "day" ? <div key={it.key} className="ms-day"><span>{it.label}</span></div>
              : <Bubble key={it.key} item={it} conv={conv} meId={meId} participants={participants} selecting={Boolean(selecting)} selected={selecting} highlighted={highlight && (it.message?.id === highlight || it.messages?.some((x) => x.id === highlight))} onAction={onAction} caps={caps} />
          ))}
          {!loading && !messages.length && <div className="ms-system"><span>{isGroup ? "Grupta henüz mesaj yok. İlk mesajı siz yazın." : `${conv.title} ile sohbeti başlatın.`}</span></div>}
        </div>
      </div>
      {!atBottom && <button type="button" className="ms-down" onClick={toBottom} aria-label="En alta git">{newBelow > 0 && <b>{newBelow}</b>}<Icon name="chevronDown" size={20} strokeWidth={2.4} /></button>}
      {drag && <div className="ms-drop"><Icon name="upload" size={36} /><strong>Göndermek için bırakın</strong><span>Fotoğraf ve belgeler (en çok 25 MB)</span></div>}
      </div>
      {selecting ? (
        <div className="ms-selectbar">
          <button type="button" className="icon-btn" onClick={() => setSelecting(null)} aria-label="Seçimi kapat"><Icon name="x" /></button>
          <strong>{selecting.size} seçildi</strong>
          <span className="spacer" />
          <button type="button" className="btn btn--sm" disabled={!selectedList.length || !selectedList.every((m) => m.kind === "text")} onClick={() => { navigator.clipboard.writeText(selectedList.map((m) => `[${new Date(m.created_at).toLocaleString("tr-TR")}] ${m.sender?.is_me ? me.name : m.sender?.name}: ${m.body}`).join("\n")); toast("Kopyalandı.", { tone: "success" }); }}><Icon name="copy" size={14} /> Kopyala</button>
          {!inbox && <>
          <button type="button" className="btn btn--sm" disabled={!selectedList.length} onClick={() => star(selectedList, !selectedList.every((m) => m.starred))}><Icon name="star" size={14} /> Yıldızla</button>
          <button type="button" className="btn btn--sm" disabled={!selectedList.length || !selectedList.every(canDelete)} onClick={() => removeMsgs(selectedList)}><Icon name="trash" size={14} /> Sil</button>
          <button type="button" className="btn btn--sm btn--primary" disabled={!selectedList.length || !selectedList.every(canForward)} onClick={() => setModal({ type: "forward", ids: selectedList.map((m) => m.id) })}><Icon name="forward" size={14} /> İlet</button>
          </>}
        </div>
      ) : (
        <Composer key={conv.id} conv={conv} meId={meId} participants={participants} draft={draft} disabledReason={disabledReason}
          onDraft={(text) => drafts.set(conv.id, { text, reply: reply ? { id: reply.id, body: quoteText(reply), sender: reply.sender, kind: reply.kind } : null })}
          reply={reply} edit={edit} onCancel={(what) => { if (what === "editLast") { if (lastMine) setEdit(lastMine); return; } setReply(null); setEdit(null); }}
          onSend={sendText} onSaveEdit={saveEdit} onFiles={onFiles} onPoll={inbox ? null : () => setModal({ type: "poll" })} onLocation={inbox ? null : () => setModal({ type: "location" })} onVoice={sendVoice}
          attachItems={attachItems} onContent={(key) => setModal({ type: key })}
          placeholder={inbox ? "ElitLig Yönetimi adına yaz…" : undefined} noTyping={inbox} />
      )}

      {menu && (
        <PointMenu at={menu.at} onClose={() => setMenu(null)} items={menu.reactOnly ? [] : menuItems(menu.list)} align={menu.list[0]?.sender?.is_me ? "end" : "start"} header={!inbox && menu.list.length === 1 && !menu.list[0].deleted ? (
          <div className="ms-quickreact">
            {QUICK_REACTIONS.map((e) => <button key={e} type="button" className={menu.list[0].reactions?.some((r) => r.mine && r.emoji === e) ? "is-mine" : ""} onClick={() => { setMenu(null); react(menu.list[0], e); }}>{e}</button>)}
          </div>
        ) : null} />
      )}
      {modal?.type === "matches" && <MatchesForm conv={conv} initial={modal.initial} onClose={() => setModal(null)} onSend={sendContent} />}
      {modal?.type === "signup" && <SignupForm conv={conv} meId={meId} initial={modal.initial} onClose={() => setModal(null)} onSend={sendContent} />}
      {modal?.type === "award" && <AwardForm conv={conv} meId={meId} onClose={() => setModal(null)} onSend={sendContent} />}
      {modal?.type === "awardTask" && <AwardTaskModal kind={modal.kind} id={modal.id} week={modal.week} go={go} onClose={() => setModal(null)} />}
      {assignMenu && (() => {
        const choices = assignChoices(assignMenu.row);
        const slot = assignMenu.row.slot;
        return (
          <PointMenu at={assignMenu.at} align="end" onClose={() => setAssignMenu(null)} header={<div className="ms-assign-head"><strong>Görevlendir · {slot.duty_label || dutyLabel(slot.duty)}</strong><small>{slot.match?.home} – {slot.match?.away}{slot.match?.time ? ` · ${slot.match.time}` : ""}</small></div>}
            items={[
              ...choices.map((c) => ({ label: c.current ? `${c.name} (görevli)` : c.name, icon: c.current ? "check" : "user", disabled: c.current, onClick: () => signupAssign(assignMenu.m, slot.id, c.user_id, c.name) })),
              !choices.length && { label: "Henüz talip yok", icon: "info", disabled: true },
              assignMenu.row.assigned && "-",
              assignMenu.row.assigned && { label: "Görevi boşalt", icon: "x", danger: true, onClick: () => signupAssign(assignMenu.m, slot.id, null) },
            ]} />
        );
      })()}
      {modal?.type === "attach" && <AttachPreview files={modal.files} onClose={() => setModal(null)} onSend={(caption) => sendFiles(modal.files, caption)} />}
      {modal?.type === "poll" && <PollModal onClose={() => setModal(null)} onSend={(p) => sendRich("poll", { poll: p }, `📊 ${p.question}`)} />}
      {modal?.type === "location" && <LocationModal onClose={() => setModal(null)} onSend={(l) => sendRich("location", { location: l }, `📍 ${l.label || l.address}`)} />}
      {modal?.type === "forward" && <ForwardModal conversations={conversations} count={modal.ids.length} onClose={() => setModal(null)} onSend={(targets) => forward(modal.ids, targets)} />}
      {modal?.type === "reactions" && <ReactionsModal message={messages.find((x) => x.id === modal.m.id) || modal.m} meId={meId} onClose={() => setModal(null)} onRemoveMine={() => { setModal(null); react(modal.m, ""); }} />}
      {modal?.type === "info" && <MessageInfoModal conversationId={conv.id} message={modal.m} onClose={() => setModal(null)} />}
      {modal?.type === "voters" && <VotersModal message={messages.find((x) => x.id === modal.m.id) || modal.m} participants={participants} onClose={() => setModal(null)} />}
      {modal?.type === "lightbox" && <Lightbox items={images} index={modal.index} onClose={() => setModal(null)} onDownload={(m) => chatApi().download(m.meta?.file?.url, m.meta?.file?.name || "fotograf.jpg").then((r) => r.ok && window.elitlig.files.reveal(r.path))} />}
    </section>
  );
}
