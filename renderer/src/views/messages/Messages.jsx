// Mesajlar (⇧⌘M): WhatsApp benzeri ekip mesajlaşması. Yönetim hesabı;
// yönetimdeki arkadaşları, takım başkanları, oyuncular ve üyelerle birebir
// yazışır, karışık gruplar kurar. Sol: sohbet listesi (arama, süzgeçler,
// sabitlenenler, arşiv, yıldızlılar); orta: açık sohbet; sağ: bilgi paneli.
//
// Gerçek zaman ana süreçteki socket'ten gelir (window.elitlig.chat.onEvent);
// socket yokken liste ve açık sohbet yoklanır. Çevrimdışıyken son veriler
// önbellekten okunur, metin mesajları kuyruğa alınır.
//
// Üye mesajları (2.7): messages.view yetkisi olan yönetici, üyelerin (takım,
// oyuncu, üye) "ElitLig Yönetimi" sohbetlerini burada ortak gelen kutusu
// olarak görür ("Üye mesajları" süzgeci, Takımlar / Oyuncular / Üyeler);
// aynı sohbet bölmesinde açılır, yanıt ElitLig Yönetimi adına gider.
// Talepler ve bildirimler sohbete düşmez (Talepler aracı). Arama kayıtları
// messages.calls_view ile "Kayıtlar" panelindedir.
//
// 2.8 görünüm: solda ikon rayı (Sohbetler, Gruplar, Üye mesajları, Yıldızlı,
// Arşiv, Kayıtlar, Ayarlar), büyük başlıklı liste, yuvarlak arama ve süzgeç
// hapları; dar pencerede liste ↔ sohbet ekranları.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Icon, Kbd, MenuButton, Spinner, useConfirm, useResult, useToast } from "../../components/ui";
import { get, patch, post, request, useCommand, useDebounced, useResource } from "../../api";
import { Avatar, C, PointMenu, Ticks, chatApi, pointOf } from "./common";
import ChatPane from "./ChatPane";
import { ContactPanel, GroupPanel, MediaPanel, SearchPanel, StarredPanel } from "./InfoPanel";
import { Lightbox, NewChatPanel, NewGroupPanel, ReportModal } from "./Pickers";
import { CallsPanel, ChatSettingsPanel } from "./InboxPanels";
import { A, INBOX_KINDS, KIND_LABELS, filterInbox, inboxCounts, inboxThreads, unreadMerged } from "../../lib/inboxUtils";
import { applyIncoming, chatCounts, chatPreview, createDraftStore, filterChats, isGroupChat, isUnread, listTime, quoteText, tickStatus, upsertChat } from "../../lib/chatUtils";
import "./messages.css";

const PILLS = [["all", "Tümü"], ["unread", "Okunmamış"], ["pinned", "Sabitlenen"], ["groups", "Gruplar"]];
const TITLES = { inbox: "Üye mesajları", starred: "Yıldızlı mesajlar", archive: "Arşiv" };
const TYPING_TTL = 6000;

export default function Messages({ arg, auth, go }) {
  const toast = useToast();
  const result = useResult();
  const confirm = useConfirm();
  const me = useMemo(() => ({ id: Number(auth.user?.id), name: auth.user?.fullName || auth.user?.username || "Siz" }), [auth.user]);
  const res = useResource(`${C}/conversations`);
  const conversations = useMemo(() => res.data?.conversations || [], [res.data]);
  const setList = useCallback((fn) => res.setData((d) => ({ ...(d || {}), conversations: fn(d?.conversations || []) })), [res.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  // Üye mesajları (ortak gelen kutusu): yalnız messages.view yetkisiyle.
  const access = auth.access || {};
  const inboxRes = useResource(access.inbox ? `${A}/conversations` : null, { limit: 100 }, { enabled: Boolean(access.inbox) });
  const inboxList = useMemo(() => (access.inbox ? inboxThreads(inboxRes.data?.conversations) : []), [inboxRes.data, access.inbox]);
  const setInboxList = useCallback((fn) => inboxRes.setData((d) => (d ? { ...d, conversations: fn(d.conversations || []) } : d)), [inboxRes.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  const inboxReload = useRef(null);
  inboxReload.current = () => inboxRes.reload({ quiet: true });
  const inboxTimer = useRef(null);
  const reloadInboxSoon = (ms = 400) => { clearTimeout(inboxTimer.current); inboxTimer.current = setTimeout(() => inboxReload.current?.(), ms); };
  const [inboxKind, setInboxKind] = useState("all");
  const [activeId, setActiveId] = useState(() => (/^\d+$/.test(String(arg || "")) ? Number(arg) : null));
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [side, setSide] = useState(null); // newChat | newGroup
  const [panel, setPanel] = useState(null);
  const [typing, setTyping] = useState({});
  const [presence, setPresence] = useState({});
  const [link, setLink] = useState("connecting");
  const [online, setOnline] = useState(true);
  const [jump, setJump] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);
  const [report, setReport] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [hits, setHits] = useState(null);
  const [starred, setStarred] = useState(null);
  const drafts = useMemo(() => createDraftStore(window.localStorage), []);
  const [, setDraftTick] = useState(0);
  const listeners = useRef(new Set());
  const searchRef = useRef(null);
  const active = conversations.find((c) => Number(c.id) === Number(activeId)) || inboxList.find((c) => Number(c.id) === Number(activeId)) || null;
  const query = useDebounced(q, 300);

  const subscribe = useCallback((fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); }, []);
  const emitLocal = (name, payload) => listeners.current.forEach((fn) => { try { fn(name, payload); } catch { /* dinleyici */ } });

  /* ------------------------------ gerçek zaman ------------------------------ */
  useEffect(() => {
    chatApi().status().then((s) => setLink(s.state));
    const offStatus = chatApi().onStatus((s) => setLink(s.state));
    const offSync = window.elitlig.sync.onDone(() => { res.reload({ quiet: true }); emitLocal("sync:done", {}); });
    window.elitlig.sync.status().then((st) => setOnline(st.online));
    const offOnline = window.elitlig.sync.onStatus((st) => setOnline(st.online));
    // Yazan / mesaj gönderen kişi şu an çevrimiçidir.
    const seen = (uid) => uid && Number(uid) !== me.id && setPresence((p) => ({ ...p, [uid]: { online: true, last_seen: new Date().toISOString() } }));
    const off = chatApi().onEvent(({ name, payload }) => {
      emitLocal(name, payload);
      const cid = Number(payload?.conversation_id);
      // Üye mesajları: üye yazdı (yalnız kimlik gelir) ya da yönetim adına yanıt / okundu.
      if (name === "chat:admin-inbox") { reloadInboxSoon(300); return; }
      if (payload?.admin) {
        if (name === "chat:message" && payload.message) {
          setInboxList((list) => list.map((c) => (Number(c.id) === cid ? { ...c, last_message: payload.message, last_message_at: payload.message.created_at || new Date().toISOString(), unread: 0 } : c)));
        }
        reloadInboxSoon(900);
        return;
      }
      if (name === "chat:typing") seen(payload.user_id);
      if (name === "chat:message") seen(payload.message?.sender?.user_id);
      if (name === "chat:message" && payload.message) {
        setTyping((t) => { if (!t[cid]) return t; const n = { ...t }; const u = { ...n[cid] }; delete u[payload.message.sender?.user_id]; n[cid] = u; return n; });
        let missing = false;
        setList((list) => {
          const r = applyIncoming(list, cid, payload.message, { active: Number(activeRef.current) === cid && document.hasFocus() });
          missing = !r.found;
          return r.list;
        });
        if (missing) setTimeout(() => res.reload({ quiet: true }), 50);
      } else if (name === "chat:conversation" && payload.conversation) {
        if (payload.conversation.removed && Number(activeRef.current) === Number(payload.conversation.id)) { setActiveId(null); toast("Bu gruptan çıkarıldınız.", { tone: "warn" }); }
        setList((list) => upsertChat(list, payload.conversation));
      } else if (name === "chat:typing") {
        setTyping((t) => {
          const n = { ...t, [cid]: { ...(t[cid] || {}) } };
          if (payload.typing === false) delete n[cid][payload.user_id];
          else n[cid][payload.user_id] = { name: payload.name, until: Date.now() + TYPING_TTL };
          return n;
        });
      } else if (name === "chat:read") {
        setList((list) => list.map((c) => (Number(c.id) === cid && c.last_message?.sender?.is_me && c.type === "direct" ? { ...c, last_message: { ...c.last_message, status: "read" } } : c)));
      } else if (name === "chat:updated" && payload.message) {
        setList((list) => list.map((c) => (Number(c.id) === cid && c.last_message?.id === payload.message.id ? { ...c, last_message: { ...c.last_message, ...payload.message } } : c)));
      } else if (name === "chat:deleted") {
        setList((list) => list.map((c) => (Number(c.id) === cid && c.last_message?.id === Number(payload.message_id) ? { ...c, last_message: { ...c.last_message, deleted: true, body: null } } : c)));
      } else if (name === "chat:poll") { res.reload({ quiet: true }); reloadInboxSoon(100); }
    });
    return () => { off(); offStatus(); offSync(); offOnline(); clearTimeout(inboxTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  useEffect(() => {
    const t = setInterval(() => setTyping((all) => {
      const now = Date.now();
      let changed = false;
      const n = {};
      Object.entries(all).forEach(([cid, users]) => { n[cid] = {}; Object.entries(users).forEach(([uid, v]) => { if (v.until > now) n[cid][uid] = v; else changed = true; }); });
      return changed ? n : all;
    }), 1500);
    return () => clearInterval(t);
  }, []);

  // Çevrimiçi / son görülme: birebir sohbetlerin karşı tarafı.
  const presenceIds = useMemo(() => [...new Set(conversations.filter((c) => c.type === "direct" && c.other_user?.user_id).map((c) => c.other_user.user_id))].slice(0, 150).join(","), [conversations]);
  useEffect(() => {
    if (!presenceIds) return undefined;
    const load = () => request({ path: `${C}/presence`, query: { user_ids: presenceIds }, cache: false }).then((r) => r.ok && setPresence(r.data.presence || {}));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [presenceIds]);

  /* -------------------------------- yönlendirme -------------------------------- */
  const openDirect = useCallback(async (userId) => {
    const existing = conversations.find((c) => c.type === "direct" && Number(c.other_user?.user_id) === Number(userId));
    if (existing) { setActiveId(existing.id); setSide(null); return existing; }
    const r = await request({ method: "POST", path: `${C}/conversations`, body: { type: "direct", user_id: Number(userId) }, queue: false });
    if (!result(r)) return null;
    setList((list) => upsertChat(list, r.data.conversation));
    setActiveId(r.data.conversation.id);
    setSide(null);
    return r.data.conversation;
  }, [conversations, result, setList]);
  const consumedArg = useRef(null);
  useEffect(() => {
    if (!arg || consumedArg.current === arg) return;
    consumedArg.current = arg;
    if (/^\d+$/.test(String(arg))) setActiveId(Number(arg));
    else if (arg === "new") setSide("newChat");
    else if (arg === "newGroup") setSide("newGroup");
    else if (typeof arg === "object") {
      if (arg.conversationId) { setActiveId(Number(arg.conversationId)); if (arg.messageId) setJump({ conversationId: Number(arg.conversationId), messageId: Number(arg.messageId) }); }
      else if (arg.userId) openDirect(arg.userId);
      else if (arg.newGroup) setSide({ kind: "newGroup", initial: arg.newGroup });
    }
  }, [arg, openDirect]);
  useCommand("new", () => setSide("newChat"));
  useCommand("newGroup", () => setSide("newGroup"));
  useCommand("refresh", () => { res.reload({ quiet: true }); chatApi().refresh(); });
  useEffect(() => { setPanel(null); }, [activeId]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.querySelector(".modal, .menu__list, .ms-lightbox")) {
        if (panel) { setPanel(null); e.preventDefault(); } else if (side) { setSide(null); e.preventDefault(); }
      }
      if (e.metaKey && e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const list = shownChats();
        const i = list.findIndex((c) => c.id === activeId);
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next) setActiveId(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, side, conversations, inboxList, inboxKind, filter, q, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sohbetlerde ve mesajlarda arama.
  useEffect(() => {
    if (query.trim().length < 2) { setHits(null); return; }
    get(`${C}/search`, { q: query.trim() }).then((r) => setHits(r.ok ? r.data.items || [] : []));
  }, [query]);
  useEffect(() => { if (filter === "starred") get(`${C}/starred`).then((r) => setStarred(r.ok ? r.data.items || [] : [])); }, [filter]);

  /* ----------------------------- sohbet işlemleri ----------------------------- */
  const patchConv = useCallback((id, p, { soft = false } = {}) => {
    const apply = (list) => list.map((c) => {
      if (Number(c.id) !== Number(id)) return c;
      if (!soft) return { ...c, ...p };
      // Mesaj sayfasıyla gelen sohbet özeti kişisel durumu taşır; okunmamış yerelde sıfırlanır.
      const { unread: _u, ...rest } = p;
      return { ...c, ...rest, unread: c.unread };
    });
    setList(apply);
    setInboxList(apply);
  }, [setList, setInboxList]);
  const onRead = useCallback((id) => patchConv(id, { unread: 0, marked_unread: false }), [patchConv]);
  const setState = async (c, body, ok) => {
    const r = await request({ method: "PATCH", path: `${C}/conversations/${c.id}/state`, body, queue: false });
    if (r.ok) { patchConv(c.id, { pinned: r.data.pinned, archived: r.data.archived, marked_unread: r.data.marked_unread, pinned_at: r.data.pinned ? c.pinned_at || new Date().toISOString() : null }); if (ok) toast(ok, { tone: "success" }); }
    else toast(r.offline ? "Bu işlem için bağlantı gerekir." : r.error?.message, { tone: "error" });
    return r.ok;
  };
  const actions = {
    pin: (c) => setState(c, { pinned: !c.pinned }),
    archive: (c) => setState(c, { archived: !c.archived }, c.archived ? "Arşivden çıkarıldı." : "Sohbet arşivlendi."),
    markUnread: async (c) => { if (await setState(c, { marked_unread: !c.marked_unread }) && !c.marked_unread && Number(c.id) === Number(activeId)) setActiveId(null); },
    mute: async (c) => {
      const r = await request({ method: "PATCH", path: `${C}/conversations/${c.id}/mute`, body: { muted: !c.muted }, queue: false });
      if (result(r, !c.muted ? "Sessize alındı: bu sohbetten bildirim gelmez." : "Bildirimler açıldı.")) patchConv(c.id, { muted: !c.muted });
    },
    remove: async (c) => {
      if (!(await confirm({ title: "Sohbet silinsin mi?", message: `${c.title} sohbeti ve mesajları yalnız sizin listenizden kalkar. Yeni mesaj gelirse sohbet yeniden açılır.`, danger: true, confirmLabel: "Sohbeti sil" }))) return;
      const r = await request({ method: "DELETE", path: `${C}/conversations/${c.id}`, queue: false });
      if (result(r, "Sohbet silindi.")) { setList((list) => list.filter((x) => x.id !== c.id)); if (Number(activeId) === Number(c.id)) setActiveId(null); drafts.clear(c.id); }
    },
    leave: async (c) => {
      if (!(await confirm({ title: "Gruptan çık", message: `${c.title} grubundan çıkmak istiyor musunuz?`, danger: true, confirmLabel: "Gruptan çık" }))) return;
      if (result(await post(`${C}/conversations/${c.id}/leave`, {}, { queue: false }), "Gruptan çıktınız.")) { setActiveId(null); res.reload({ quiet: true }); }
    },
    block: async (c) => {
      const u = c.other_user;
      if (!u) return;
      if (c.blocked_by_me) {
        if (result(await request({ method: "DELETE", path: `${C}/blocks/${u.user_id}`, queue: false }), "Engel kaldırıldı.")) patchConv(c.id, { blocked_by_me: false, can_write: true });
        return;
      }
      if (!(await confirm({ title: `${u.name} engellensin mi?`, message: "Engellenen kişi size mesaj gönderemez ve sizi arayamaz. Engeli sonra kaldırabilirsiniz.", danger: true, confirmLabel: "Engelle" }))) return;
      if (result(await request({ method: "POST", path: `${C}/blocks`, body: { user_id: u.user_id }, queue: false }), `${u.name} engellendi.`)) patchConv(c.id, { blocked_by_me: true, can_write: false });
    },
    report: (c) => setReport(c),
  };
  const createGroup = async (form) => {
    const r = await request({ method: "POST", path: `${C}/conversations`, body: { type: "group", title: form.title.trim(), user_ids: form.user_ids }, queue: false });
    if (!result(r)) return;
    const conv = r.data.conversation;
    const extra = {};
    if (form.description?.trim()) extra.description = form.description.trim();
    if (form.only_admins_send) extra.only_admins_send = true;
    if (form.only_admins_edit) extra.only_admins_edit = true;
    if (form.photo?.data) { const up = await chatApi().upload("file", form.photo); if (up.ok) extra.avatar_url = up.data.url; }
    if (Object.keys(extra).length) await patch(`${C}/conversations/${conv.id}/group`, extra);
    if (conv.skipped_members?.length) toast(`${conv.skipped_members.length} kişi gruba eklenemedi (mesaj kabul tercihi).`, { tone: "warn", timeout: 6000 });
    setList((list) => upsertChat(list, { ...conv, ...extra }));
    setSide(null);
    setActiveId(conv.id);
    res.reload({ quiet: true });
  };

  /* ---------------------------------- liste ---------------------------------- */
  const counts = chatCounts(conversations);
  const iCounts = inboxCounts(inboxList);
  // Hapta yalnız okunmamış sayısı (WhatsApp gibi); diğerleri sade.
  const chipCount = (k) => (k === "unread" ? counts.unread + iCounts.unread : null);
  const section = ["inbox", "starred", "archive"].includes(filter) ? filter : filter === "groups" ? "groups" : "chats";
  const chatsUnread = counts.unread;
  const rail = [
    { key: "chats", label: "Sohbetler", icon: "message", badge: chatsUnread, go: "all" },
    { key: "groups", label: "Gruplar", icon: "users", badge: conversations.filter((c) => !c.archived && isGroupChat(c) && isUnread(c)).length, go: "groups" },
    access.inbox && { key: "inbox", label: "Üye mesajları", icon: "inbox", badge: iCounts.unread, go: "inbox", tone: "inbox" },
    { key: "starred", label: "Yıldızlı", icon: "star", go: "starred" },
    { key: "archive", label: "Arşiv", icon: "archive", go: "archive", dot: counts.archive > 0 && conversations.some((c) => c.archived && isUnread(c)) },
  ].filter(Boolean);
  function shownChats() {
    if (filter === "starred") return [];
    if (filter === "inbox") return filterInbox(inboxList, { kind: inboxKind, q });
    if (filter === "unread" && access.inbox) return unreadMerged(conversations, inboxList, { q });
    // Aramada üye mesajları da bulunur.
    if (filter === "all" && q.trim() && access.inbox) return [...filterChats(conversations, { filter, q }), ...filterInbox(inboxList, { q })];
    return filterChats(conversations, { filter, q });
  }
  const shown = shownChats();
  const openInWeb = () => window.elitlig.app.openWeb("/yonetim/araclar/mesajlar");
  const inboxRowItems = (c) => [
    isUnread(c) && { label: "Okundu olarak işaretle", icon: "circle", onClick: () => request({ method: "POST", path: `${A}/conversations/${c.id}/read`, body: {}, queue: false }).then((r) => (r.ok ? onRead(c.id) : toast(r.error?.message || "Yapılamadı.", { tone: "error" }))) },
    { label: "Sitede aç", icon: "external", onClick: openInWeb },
  ];
  const typingIn = (c) => Object.values(typing[c.id] || {}).map((t) => t.name).filter(Boolean);
  const rowItems = (c) => (c._inbox ? inboxRowItems(c) : [
    { label: c.archived ? "Arşivden çıkar" : "Sohbeti arşivle", icon: "archive", onClick: () => actions.archive(c) },
    { label: c.muted ? "Bildirimleri aç" : "Sessize al", icon: c.muted ? "bell" : "bellOff", onClick: () => actions.mute(c) },
    !c.archived && { label: c.pinned ? "Sabitlemeyi kaldır" : "Sohbeti sabitle", icon: "pin", onClick: () => actions.pin(c) },
    { label: isUnread(c) ? "Okundu olarak işaretle" : "Okunmadı olarak işaretle", icon: "circle", onClick: () => (isUnread(c) ? request({ method: "POST", path: `${C}/conversations/${c.id}/read`, body: {}, queue: false }).then(() => onRead(c.id)) : actions.markUnread(c)) },
    "-",
    c.type === "group" && { label: "Gruptan çık", icon: "logout", danger: true, onClick: () => actions.leave(c) },
    { label: "Sohbeti sil", icon: "trash", danger: true, onClick: () => actions.remove(c) },
  ]);

  const chatRow = (c) => {
    const p = chatPreview(c);
    // Üye mesajlarında ElitLig Yönetimi adına yazılan son yanıt "Yönetim:" ile başlar.
    if (c._inbox && c.last_message?.sender?.is_management && !p.deleted) p.prefix = "Yönetim: ";
    const who = typingIn(c);
    const draft = Number(c.id) !== Number(activeId) ? drafts.get(c.id) : null;
    const status = tickStatus(c.last_message);
    return (
      <div role="button" tabIndex={0} className={`ms-item ${Number(c.id) === Number(activeId) ? "is-active" : ""} ${isUnread(c) ? "is-unread" : ""} ${c._inbox ? "is-inbox" : ""}`} data-cid={c.id} data-inbox={c._inbox ? c.kind : undefined}
        onClick={() => { setActiveId(c.id); setSide(null); }} onKeyDown={(e) => e.key === "Enter" && setActiveId(c.id)}
        onContextMenu={(e) => { e.preventDefault(); setRowMenu({ at: pointOf(e), c }); }}>
        <Avatar name={c.title} id={c.other_user?.user_id ?? c.entity?.user_id ?? c.id} url={c.avatar || c.entity?.avatar} size={48} group={isGroupChat(c) || c.kind === "team"} online={c.type === "direct" && presence[c.other_user?.user_id]?.online} />
        <span className="ms-item__main">
          <span className="ms-item__top">
            <strong>{c.title}</strong>
            <time>{listTime(c.last_message_at)}</time>
          </span>
          <span className="ms-item__bottom">
            {who.length ? <span className="ms-item__typing">{isGroupChat(c) ? `${who[0].split(" ")[0]} yazıyor…` : "yazıyor…"}</span>
              : draft?.text ? <span className="ms-item__prev"><em className="ms-item__draft">Taslak:</em> {draft.text}</span>
                : <span className={`ms-item__prev ${p.deleted ? "is-deleted" : ""}`}>{c.last_message?.sender?.is_me && <Ticks status={status} />}{p.prefix && <b>{p.prefix}</b>}{p.text}</span>}
            <span className="ms-item__icons">
              {c.muted && <Icon name="bellOff" size={14} />}
              {c.pinned && <Icon name="pin" size={14} />}
              {Number(c.unread) > 0 ? <span className={`ms-badge ${c.muted ? "is-muted" : ""}`}>{c.unread > 99 ? "99+" : c.unread}</span> : c.marked_unread ? <span className="ms-badge ms-badge--dot" /> : null}
              <button type="button" className="ms-item__chev" aria-label="Sohbet menüsü" onClick={(e) => { e.stopPropagation(); setRowMenu({ at: { rect: e.currentTarget.getBoundingClientRect() }, c }); }}><Icon name="chevronDown" size={15} /></button>
            </span>
          </span>
          {c._inbox ? <span className="ms-item__team ms-item__kind"><b className={`ms-kind ms-kind--${c.kind}`}>{KIND_LABELS[c.kind] || "Üye"}</b>{c.subtitle && c.subtitle !== KIND_LABELS[c.kind] ? String(c.subtitle).replace(/^(Takım|Oyuncu|Üye)\s*·\s*/, "") : ""}</span>
            : c.other_user?.team_name && c.other_user.team_name !== c.title ? <span className="ms-item__team">{c.other_user.team_name}</span>
            : c.other_user?.managed_team_id && c.other_user.manager_name && c.other_user.manager_name !== c.title ? <span className="ms-item__team ms-item__team--person"><Icon name="award" size={10} /> {c.other_user.manager_name}</span> : null}
        </span>
      </div>
    );
  };

  const leftBody = () => {
    if (side === "newChat") return <NewChatPanel onClose={() => setSide(null)} onPick={(p) => openDirect(p.user_id)} onNewGroup={() => setSide("newGroup")} />;
    if (side === "newGroup" || side?.kind === "newGroup") return <NewGroupPanel initial={side?.initial} onClose={() => setSide(null)} onCreate={createGroup} />;
    if (side === "settings") return <ChatSettingsPanel me={me} link={link} onClose={() => setSide(null)} />;
    if (side === "calls") return <CallsPanel onClose={() => setSide(null)} onOpenChat={(id) => { setSide(null); setFilter("inbox"); setActiveId(id); }} />;
    return (
      <>
        <header className="ms-list__head">
          <h2>{TITLES[section] || (section === "groups" ? "Gruplar" : "Sohbetler")}</h2>
          <span className="spacer" />
          <button type="button" className="ms-round" title="Yeni sohbet (⌘N)" data-act="new" onClick={() => setSide("newChat")}><Icon name="pencil" size={16} /></button>
          <MenuButton label="Diğer" className="ms-round" items={[
            { label: "Yeni grup", icon: "users", onClick: () => setSide("newGroup") },
            access.calls && { label: "Kayıtlar (aramalar)", icon: "phone", onClick: () => setSide("calls") },
            { label: "Tümünü okundu say", icon: "checks", disabled: !counts.unread, onClick: async () => { for (const c of conversations.filter((x) => !x.archived && isUnread(x))) { /* eslint-disable-next-line no-await-in-loop */ const r = await request({ method: "POST", path: `${C}/conversations/${c.id}/read`, body: {}, queue: false }); if (r.ok) onRead(c.id); } } },
            "-",
            { label: "Ayarlar", icon: "sliders", onClick: () => setSide("settings") },
            { label: "Sitede aç", icon: "external", onClick: openInWeb },
          ].filter(Boolean)} />
        </header>
        <div className="ms-search"><Icon name="search" size={14} /><input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sohbetlerde ve mesajlarda ara" onKeyDown={(e) => e.key === "Escape" && setQ("")} />{q && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setQ("")}><Icon name="x" size={12} /></button>}</div>
        {(section === "chats" || section === "groups") && (
          <div className="ms-chips" role="tablist" aria-label="Süzgeç">
            {PILLS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} data-filter={k} className={filter === k ? "is-active" : ""} onClick={() => setFilter(k)}>{l}{chipCount(k) ? <span>{chipCount(k)}</span> : null}</button>)}
          </div>
        )}
        {filter === "inbox" && (
          <div className="ms-subchips" role="tablist" aria-label="Üye mesajları">
            {INBOX_KINDS.map(([k, l]) => <button key={k} type="button" data-kind={k} className={inboxKind === k ? "is-active" : ""} onClick={() => setInboxKind(k)}>{l}{k === "all" ? (inboxList.length ? <em>{inboxList.length}</em> : null) : iCounts[k] ? <span>{iCounts[k]}</span> : null}</button>)}
          </div>
        )}
        {link !== "connected" && (
          <div className={`ms-conn ${!online || res.offline ? "is-offline" : ""}`}>
            <Icon name={!online || res.offline ? "cloudOff" : "refresh"} size={13} />
            {!online || res.offline ? "Çevrimdışı — önbellekteki sohbetler. Metin mesajları bağlantı gelince gider." : "Canlı bağlantı kuruluyor… mesajlar birkaç saniyede bir yenileniyor."}
          </div>
        )}
        <div className="ms-list__scroll">
          {res.loading && !res.data ? <div className="ms-skel-list">{Array.from({ length: 8 }, (_, i) => <span key={i}><i /><b /></span>)}</div>
            : filter === "starred" ? (
              <div className="ms-hits">
                {!starred ? <Spinner /> : starred.map((m) => (
                  <button key={m.id} type="button" className="ms-hit" onClick={() => { setActiveId(m.conversation_id); setJump({ conversationId: m.conversation_id, messageId: m.id }); }}>
                    <span className="ms-hit__top"><strong>{m.sender?.is_me ? "Siz" : m.sender?.name}</strong><em> · {m.conversation_title || "Sohbet"}</em><small>{listTime(m.created_at)}</small></span>
                    <span className="ms-hit__body"><Icon name="star" size={11} /> {quoteText(m)}</span>
                  </button>
                ))}
                {starred && !starred.length && <Empty icon="star" title="Yıldızlı mesaj yok" text="Önemli mesajları menüden yıldızlayın; burada toplanır." />}
              </div>
            ) : (
              <>
                {filter === "all" && counts.archive > 0 && !q && <button type="button" className="ms-archived-link ms-archived-link--top" data-act="archive" onClick={() => setFilter("archive")}><span className="ms-archived-link__ic"><Icon name="archive" size={17} /></span> Arşivlenmiş <span>{counts.archive}</span></button>}
                {filter === "all" && !q && access.inbox && inboxList.length > 0 && (
                  <button type="button" className="ms-inbox-link" data-act="inbox" onClick={() => setFilter("inbox")}>
                    <span className="ms-av ms-av--inbox"><Icon name="inbox" size={20} /></span>
                    <span className="ms-inbox-link__text"><strong>Üye mesajları</strong><small>{iCounts.unread ? `${iCounts.unread} okunmamış sohbet · takım, oyuncu ve üyeler` : "Takım, oyuncu ve üyelerin ElitLig Yönetimi sohbetleri"}</small></span>
                    {iCounts.unreadMessages > 0 && <span className="ms-badge">{iCounts.unreadMessages > 99 ? "99+" : iCounts.unreadMessages}</span>}
                    <Icon name="chevronRight" size={16} />
                  </button>
                )}
                {filter === "inbox" && inboxRes.loading && !inboxRes.data && <div className="ms-skel-list">{Array.from({ length: 6 }, (_, i) => <span key={i}><i /><b /></span>)}</div>}
                {filter === "inbox" && inboxRes.error && !inboxRes.data && <p className="ms-note">{inboxRes.error.status === 403 ? "Üye mesajlarını görme yetkiniz yok (messages.view)." : inboxRes.error.message || "Üye mesajları alınamadı."}</p>}
                {shown.map((c) => <React.Fragment key={`${c._inbox ? "i" : "p"}${c.id}`}>{chatRow(c)}</React.Fragment>)}
                {filter === "inbox" && !shown.length && inboxRes.data && <Empty icon="inbox" title={q ? "Eşleşen üye sohbeti yok" : "Üye mesajı yok"} text="Takım, oyuncu ve üyelerin ElitLig Yönetimi'ne yazdığı mesajlar burada toplanır. Onay bekleyen talepler Talepler'dedir." />}
                {!shown.length && !q && filter !== "inbox" && <Empty icon={filter === "archive" ? "archive" : "message"} title={filter === "archive" ? "Arşiv boş" : filter === "unread" ? "Okunmamış sohbet yok" : "Henüz sohbet yok"} text={filter === "all" ? "Takım başkanları, oyuncular, üyeler ya da yönetimdeki arkadaşlarınızla yazışmaya başlayın." : null}
                  action={filter === "all" ? <button type="button" className="btn btn--primary" onClick={() => setSide("newChat")}><Icon name="plus" /> Yeni sohbet</button> : null} />}
                {q && !shown.length && <p className="ms-note">“{q}” ile eşleşen sohbet yok.</p>}
                {hits?.length > 0 && (
                  <div className="ms-hits">
                    <h5 className="ms-h5">Mesajlar</h5>
                    {hits.slice(0, 30).map((m) => (
                      <button key={m.id} type="button" className="ms-hit" onClick={() => { setActiveId(m.conversation_id); setJump({ conversationId: m.conversation_id, messageId: m.id }); }}>
                        <span className="ms-hit__top"><strong>{conversations.find((c) => c.id === m.conversation_id)?.title || m.conversation_title}</strong><small>{listTime(m.created_at)}</small></span>
                        <span className="ms-hit__body">{m.sender?.is_me ? "Siz: " : m.sender?.name ? `${m.sender.name}: ` : ""}{quoteText(m)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
        </div>
      </>
    );
  };

  const rightPanel = () => {
    if (!active || !panel || active._inbox) return null;
    const back = panel.from === "info" ? () => setPanel({ kind: "info" }) : null;
    if (panel.kind === "media") return <MediaPanel conv={active} onClose={() => setPanel(null)} onBack={back} onOpenImage={(items, index) => setLightbox({ items: items.map((x) => ({ ...x, meta: { file: { url: x.url } } })), index })} onJump={(id) => setJump({ conversationId: active.id, messageId: id })} />;
    if (panel.kind === "starred") return <StarredPanel conv={active} onClose={() => setPanel(null)} onBack={back} onJump={(id) => setJump({ conversationId: active.id, messageId: id })} />;
    if (panel.kind === "search") return <SearchPanel conv={active} onClose={() => setPanel(null)} onJump={(id) => setJump({ conversationId: active.id, messageId: id })} />;
    const openImage = (items, index) => setLightbox({ items: items.map((x) => ({ ...x, meta: { file: { url: x.url } } })), index });
    if (isGroupChat(active)) {
      return <GroupPanel conv={active} meId={me.id} onClose={() => setPanel(null)} onOpenMedia={() => setPanel({ kind: "media", from: "info" })} onOpenStarred={() => setPanel({ kind: "starred", from: "info" })}
        onOpenDirect={openDirect} onLeft={() => { setActiveId(null); res.reload({ quiet: true }); }} onChanged={() => res.reload({ quiet: true })} onImage={openImage} onMute={() => actions.mute(active)} />;
    }
    return <ContactPanel conv={active} conversations={conversations} onClose={() => setPanel(null)} onOpenMedia={() => setPanel({ kind: "media", from: "info" })} onOpenStarred={() => setPanel({ kind: "starred", from: "info" })}
      onOpenChat={(id) => setActiveId(id)} onBlock={() => actions.block(active)} onReport={() => actions.report(active)} onMute={() => actions.mute(active)} onImage={openImage} />;
  };

  return (
    <div className={`ms-view ${panel && active ? "has-panel" : ""} ${active ? "has-chat" : ""}`}>
      <nav className="ms-rail" aria-label="Mesajlar bölümleri">
        {rail.map((r) => (
          <button key={r.key} type="button" className={`ms-rail__btn ${section === r.key && !side ? "is-active" : ""} ${r.tone ? `is-${r.tone}` : ""}`} data-rail={r.key} title={r.label} aria-label={r.label} onClick={() => { setSide(null); setFilter(r.go); setQ(""); }}>
            <Icon name={r.icon} size={20} strokeWidth={section === r.key ? 2.2 : 1.8} />
            {r.badge > 0 ? <b>{r.badge > 99 ? "99+" : r.badge}</b> : r.dot ? <i /> : null}
          </button>
        ))}
        <span className="spacer" />
        {access.calls && <button type="button" className={`ms-rail__btn ${side === "calls" ? "is-active" : ""}`} data-rail="calls" title="Kayıtlar — yönetim arama kayıtları" aria-label="Kayıtlar" onClick={() => setSide(side === "calls" ? null : "calls")}><Icon name="phone" size={19} /></button>}
        <button type="button" className={`ms-rail__btn ${side === "settings" ? "is-active" : ""}`} data-rail="settings" title="Ayarlar" aria-label="Ayarlar" onClick={() => setSide(side === "settings" ? null : "settings")}><Icon name="sliders" size={19} /></button>
        <span className="ms-rail__me" title={me.name}><Avatar name={me.name} id={me.id} size={34} /></span>
      </nav>
      <aside className="ms-list">{leftBody()}</aside>
      {active ? (
        <ChatPane key={`${active._inbox ? "i" : "p"}${active.id}`} conv={active} canReply={access.reply !== false} me={me} conversations={conversations} subscribe={subscribe} typing={typing[active.id]} presence={presence} link={link}
          drafts={{ get: drafts.get, set: (id, d) => { drafts.set(id, d); setDraftTick((x) => x + 1); }, clear: (id) => { drafts.clear(id); setDraftTick((x) => x + 1); } }}
          actions={actions} panel={panel} setPanel={setPanel} jump={jump} onConsumedJump={() => setJump(null)} onRead={onRead} onConvPatch={patchConv}
          access={access} go={go} onBack={() => setActiveId(null)} />
      ) : (
        <section className="ms-welcome">
          <div className="ms-welcome__art"><Icon name="message" size={54} strokeWidth={1.4} /></div>
          <h2>Elitlig Mesajlar</h2>
          <p>Takım başkanları, oyuncular, üyeler ve yönetimdeki arkadaşlarınızla birebir yazışın ya da grup kurun. Mesajlar sitedeki ve mobil uygulamadaki sohbetle aynıdır.</p>
          <div className="ms-welcome__actions">
            <button type="button" className="btn btn--primary" onClick={() => setSide("newChat")}><Icon name="pencil" /> Yeni sohbet</button>
            <button type="button" className="btn" onClick={() => setSide("newGroup")}><Icon name="users" /> Yeni grup</button>
            <button type="button" className="btn btn--ghost" onClick={() => go("contacts", { tab: "teams" })}><Icon name="team" /> Rehber · Takımlar</button>
          </div>
          <div className="ms-welcome__keys">
            <span><Kbd>⌘N</Kbd> yeni sohbet</span><span><Kbd>⇧⌘N</Kbd> yeni grup</span><span><Kbd>⌘F</Kbd> sohbette ara</span><span><Kbd>⌥⌘↓</Kbd> sonraki sohbet</span>
          </div>
          <small className="ms-welcome__foot"><Icon name="lock" size={11} /> {link === "connected" ? "Canlı bağlantı açık" : "Canlı bağlantı kuruluyor"} · bildirimler pencere arka plandayken gelir</small>
        </section>
      )}
      {rightPanel()}
      {rowMenu && <PointMenu at={rowMenu.at} onClose={() => setRowMenu(null)} items={rowItems(rowMenu.c)} />}
      {report && <ReportModal who={report.other_user?.name || report.title} onClose={() => setReport(null)} onSend={async (form) => {
        const r = await request({ method: "POST", path: `${C}/reports`, body: { reason: form.reason, details: form.details || null, user_id: report.other_user?.user_id || null, conversation_id: report.id, block: form.block }, queue: false });
        if (result(r, "Şikayetiniz iletildi. Teşekkürler.")) { setReport(null); if (form.block) patchConv(report.id, { blocked_by_me: true, can_write: false }); }
      }} />}
      {lightbox && <Lightbox items={lightbox.items} index={lightbox.index} onClose={() => setLightbox(null)} onDownload={(m) => chatApi().download(m.meta?.file?.url, "fotograf.jpg").then((r) => r.ok && window.elitlig.files.reveal(r.path))} />}
    </div>
  );
}
