// Mesajlar ve Talepler widget'ları. Sohbet olayları ana süreçteki bağlantıdan (app/chat.js) tüm
// pencerelere yayınlanır (chat:event, chat:unread); widget bunlarla tazelenir ve yeni mesajda vurgulanır.
// Hızlı yanıt Mesajlar'daki gönderme ucuyla aynıdır: kişisel sohbet çevrimdışıyken kuyruğa alınır
// (api.js giden kutusu), üye mesajlarında (ElitLig Yönetimi adına) kuyruk yoktur, bağlantı ister.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { chatPreview, isGroupChat, isUnread, listTime, newClientId } from "../../lib/chatUtils";
import { A, inboxThreads } from "../../lib/inboxUtils";
import { Avatar, Err, Loading, NeedSession, W, openApp, useAuth, usePoll } from "../common";
import { chatUnread, recentChats } from "../widgetModel";

const C = "/api/chat";

/** Yeni mesajda widget'ı birkaç saniye vurgula (kabuk: html[data-flash]). */
function flash() {
  const el = document.documentElement;
  el.dataset.flash = "1";
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { delete el.dataset.flash; }, 6000);
}

export function MessagesWidget({ item, size, settings, update, closeSettings }) {
  const auth = useAuth();
  const signed = auth?.signedIn;
  const access = auth?.access || {};
  const source = item.options.source || "all";
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState(null);
  const [fresh, setFresh] = useState(() => new Set());
  const [reqTotal, setReqTotal] = useState(0);
  const inputRef = useRef(null);
  const q = usePoll(async () => {
    if (!signed) return null;
    const wantInbox = access.inbox && source !== "personal";
    const [p, i] = await Promise.all([
      source === "inbox" ? null : W().request({ path: `${C}/conversations` }),
      wantInbox ? W().request({ path: `${A}/conversations`, query: { limit: 100 } }) : null,
    ]);
    if (p && !p.ok) throw new Error(p.error?.message || "Sohbetler alınamadı.");
    const personal = p?.data?.conversations || [];
    const inbox = i?.ok ? inboxThreads(i.data?.conversations) : [];
    return { personal, inbox, offline: Boolean(p?.offline) };
  }, 2 * 60000, [signed, source, access.inbox]);
  const reloadRef = useRef(q.reload);
  reloadRef.current = q.reload;

  // Yeni mesaj tespiti: sohbetin son mesaj kimliği arttıysa ve benden değilse vurgula. Socket yokken
  // (yoklama) okundu ile yeni mesaj aynı turda gelirse okunmamış toplamı azalabilir; bu karşılaştırma
  // her iki durumda da yeni mesajı yakalar.
  const lastIds = useRef(null);
  useEffect(() => {
    if (!q.data) return;
    const all = [...q.data.personal, ...q.data.inbox];
    const prev = lastIds.current;
    const next = new Map(all.map((c) => [Number(c.id), Number(c.last_message?.id) || 0]));
    lastIds.current = next;
    if (!prev) return;
    const incoming = all.filter((c) => { const m = c.last_message; return m && !m.sender?.is_me && !m.sender?.is_management && m.kind !== "system" && Number(m.id) > (prev.get(Number(c.id)) ?? 0); });
    if (incoming.length) { setFresh((s0) => { const n = new Set(s0); incoming.forEach((c) => n.add(Number(c.id))); return n; }); flash(); }
  }, [q.data]);

  // Gerçek zaman: yeni mesaj / okundu / üye mesajı → kısa gecikmeyle yeniden oku; başkasından gelen mesajda vurgu.
  useEffect(() => {
    let t = null;
    const soon = (ms = 500) => { clearTimeout(t); t = setTimeout(() => reloadRef.current(), ms); };
    const off = W().chat.onEvent(({ name, payload } = {}) => {
      if (["chat:message", "chat:admin-inbox", "chat:read", "chat:conversation", "chat:deleted", "chat:updated", "chat:poll"].includes(name)) soon(name === "chat:message" ? 300 : 900);
      if ((name === "chat:message" && !payload?.message?.sender?.is_me && payload?.message?.kind !== "system") || name === "chat:admin-inbox") {
        const id = Number(payload?.conversation_id || payload?.conversationId || 0);
        if (id) setFresh((s) => new Set(s).add(id));
        flash();
      }
    });
    let last = null;
    const offUnread = W().chat.onUnread((n) => { if (last != null && n > last) flash(); last = n; });
    W().chat.status().then((st) => { last = st?.unread ?? null; }).catch(() => {});
    return () => { clearTimeout(t); off(); offUnread(); };
  }, []);
  useEffect(() => {
    if (!access.requests) return undefined;
    W().requests.summary().then((s) => setReqTotal(Number(s?.total) || 0)).catch(() => {});
    return W().requests.onSummary((s) => setReqTotal(Number(s?.total) || 0));
  }, [access.requests]);
  useEffect(() => { if (replyTo) setTimeout(() => inputRef.current?.focus(), 20); }, [replyTo]);

  if (settings) {
    return (
      <div className="wg-settings">
        <p className="wg-muted">Gösterilecek sohbetler:</p>
        {[["all", "Birleşik (kişisel + üye mesajları)"], ["personal", "Yalnız kişisel sohbetler"], ["inbox", "Yalnız üye mesajları (ortak gelen kutusu)"]].map(([v, l]) => (
          <label key={v} className="wg-check"><input type="radio" name="src" checked={source === v} disabled={v === "inbox" && !access.inbox} onChange={() => update({ options: { source: v } })} /> {l}</label>
        ))}
        <label className="wg-check"><input type="checkbox" checked={item.options.reply !== false} onChange={(e) => update({ options: { reply: e.target.checked } })} /> Hızlı yanıt alanı</label>
        <button type="button" className="wg-btn" onClick={closeSettings}>Tamam</button>
      </div>
    );
  }
  if (signed === false) return <NeedSession />;
  if (q.error && !q.data) return <Err text={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const list = recentChats(q.data.personal, q.data.inbox, source);
  const unread = chatUnread(q.data.personal, q.data.inbox, source);
  const inboxUnread = chatUnread([], q.data.inbox, "inbox");
  const max = size === "medium" ? 6 : 3;
  const canReply = (c) => item.options.reply !== false && c.can_write !== false && !c.blocked_by_me && (!c._inbox || access.reply);

  const open = (c) => { setFresh((s) => { const n = new Set(s); n.delete(Number(c.id)); return n; }); openApp(`messages:${c.id}`); };
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    const c = replyTo;
    if (!body || !c) return;
    setText("");
    setNote({ tone: "", text: "Gönderiliyor…" });
    const base = c._inbox ? A : C;
    const res = await W().request({ method: "POST", path: `${base}/conversations/${c.id}/messages`, body: { kind: "text", body, client_id: newClientId() }, ...(c._inbox ? { queue: false } : {}) });
    if (res.ok && res.queued) setNote({ tone: "amber", text: "Çevrimdışı: kuyruğa alındı, bağlantı gelince gönderilecek." });
    else if (res.ok) {
      setNote({ tone: "green", text: `${c.title} sohbetine gönderildi ✓` });
      if (!c._inbox) W().request({ method: "POST", path: `${C}/conversations/${c.id}/read`, body: {}, queue: false });
      setReplyTo(null);
      setTimeout(() => q.reload(), 400);
    } else { setText(body); setNote({ tone: "red", text: res.offline && c._inbox ? "Üye mesajı yanıtı bağlantı ister." : res.error?.message || "Gönderilemedi." }); }
    setTimeout(() => setNote(null), 5000);
  };

  return (
    <div className="wg-msgs">
      <div className="wg-msgs__sum">
        <button type="button" className={`wg-count${unread ? " is-on" : ""}`} onClick={() => openApp(source === "inbox" ? "messages" : "messages")} title="Mesajlar'ı aç">
          <b data-testid="unread">{unread}</b><span>okunmamış</span>
        </button>
        {source === "all" && access.inbox && <button type="button" className="wg-pill" onClick={() => openApp("messages")} title="Üye mesajları"><Icon name="inbox" size={11} /> Üye {inboxUnread || ""}</button>}
        {access.requests && <button type="button" className={`wg-pill${reqTotal ? " is-alert" : ""}`} onClick={() => openApp("requests")} title="Bekleyen talepler"><Icon name="flag" size={11} /> {reqTotal} talep</button>}
        {q.data.offline && <span className="wg-pill is-muted" title="Son bilinen liste">çevrimdışı</span>}
      </div>
      <div className="wg-list">
        {list.length ? list.slice(0, max).map((c) => {
          const p = chatPreview(c);
          const u = isUnread(c);
          return (
            <div key={`${c._inbox ? "i" : "p"}${c.id}`} className={`wg-chat${u ? " is-unread" : ""}${fresh.has(Number(c.id)) ? " is-fresh" : ""}${replyTo?.id === c.id ? " is-target" : ""}`} data-cid={c.id}>
              <button type="button" className="wg-chat__main" onClick={() => open(c)} title="Sohbeti uygulamada aç">
                <Avatar name={c.title} url={c.avatar} id={c.other_user?.user_id ?? c.id} group={isGroupChat(c)} />
                <span className="wg-chat__text">
                  <span className="wg-chat__top"><b>{c.title}</b>{c._inbox && <i className="wg-tag">Üye</i>}<small>{listTime(c.last_message?.created_at || c.last_message_at)}</small></span>
                  <span className="wg-chat__last">{p.prefix}{p.text}</span>
                </span>
                {u && <em className="wg-badge">{Number(c.unread) || "•"}</em>}
              </button>
              {canReply(c) && <button type="button" className="wg-ib is-sm" onClick={() => setReplyTo(replyTo?.id === c.id ? null : c)} aria-label={`${c.title} sohbetine hızlı yanıt`} title="Hızlı yanıt"><Icon name="reply" size={12} /></button>}
            </div>
          );
        }) : <p className="wg-muted">Henüz mesaj yok.</p>}
        {list.length > max && <button type="button" className="wg-link" onClick={() => openApp("messages")}>+{list.length - max} sohbet daha</button>}
      </div>
      {replyTo && (
        <form className="wg-reply" onSubmit={send}>
          <span className="wg-reply__to">→ {replyTo.title}{replyTo._inbox ? " (ElitLig Yönetimi adına)" : ""}</span>
          <div className="wg-reply__row">
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Kısa yanıt yazın…" aria-label="Hızlı yanıt" maxLength={1000} onKeyDown={(e) => e.key === "Escape" && setReplyTo(null)} />
            <button type="submit" className="wg-ib is-main is-sm" disabled={!text.trim()} aria-label="Gönder"><Icon name="send" size={12} /></button>
          </div>
        </form>
      )}
      {note && <p className={`wg-note-line is-${note.tone || "muted"}`} role="status">{note.text}</p>}
    </div>
  );
}

export function RequestsWidget({ size }) {
  const auth = useAuth();
  const [sum, setSum] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    W().requests.summary().then(setSum).catch(() => {});
    const off = W().requests.onSummary(setSum);
    const offChange = W().requests.onChange(() => flash());
    return () => { off(); offChange(); };
  }, []);
  if (auth && !auth.signedIn) return <NeedSession />;
  if (auth && !auth.access?.requests) return <div className="wg-empty"><Icon name="lock" size={15} /><span>Talepler yönetim hesaplarına açıktır.</span></div>;
  const cats = (sum?.categories || []).filter((c) => size === "medium" || Number(c.open) > 0);
  const total = Number(sum?.total) || 0;
  const refresh = async () => { setBusy(true); await W().requests.refresh().catch(() => {}); setBusy(false); };
  return (
    <div className="wg-reqs">
      <div className="wg-msgs__sum">
        <button type="button" className={`wg-count${total ? " is-alert" : ""}`} onClick={() => openApp("requests")}><b data-testid="requests-total">{total}</b><span>bekleyen talep</span></button>
        <span className="wg__grow" />
        <button type="button" className="wg-ib is-sm" onClick={refresh} disabled={busy} aria-label="Yenile" title="Yenile"><Icon name="refresh" size={12} /></button>
      </div>
      <div className="wg-list">
        {cats.length ? cats.slice(0, size === "medium" ? 8 : 4).map((c) => (
          <button key={c.key} type="button" className="wg-row" onClick={() => openApp(`requests:${c.key}`)}>
            <span className="wg-row__text">{c.label}</span><b className={Number(c.open) ? "wg-num is-alert" : "wg-num"}>{c.open || 0}</b>
          </button>
        )) : <p className="wg-muted">{sum ? "Bekleyen talep yok ✓" : "Yükleniyor…"}</p>}
      </div>
    </div>
  );
}
