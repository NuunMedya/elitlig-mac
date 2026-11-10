// Mesajlar ve talepler: okunmamışlar, sohbet listesi, birine hemen mesaj gönder (kişi ara / sabit alıcı),
// büyükte sohbet akışı; bekleyen talepler; eşitleme durumu.
// Gönderme Mesajlar görünümüyle aynı uçtur: kişisel sohbet çevrimdışıyken kuyruğa alınır (api.js giden
// kutusu); üye mesajları (ElitLig Yönetimi adına) bağlantı ister.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { get, request } from "../../../api";
import { chatPreview, directorySections, initials, isUnread, listTime, newClientId, senderColor } from "../../../lib/chatUtils";
import { A, inboxThreads } from "../../../lib/inboxUtils";
import { topCategories } from "../../../lib/requestUtils";
import { chatUnread, recentChats } from "../../../widgets/widgetModel";
import { refreshData, useBridge, useData } from "../data";
import { Big, List, Note, Row, State, Stats, XsButton } from "../parts";

const C = "/api/chat";
const W = () => window.elitlig;

function Av({ name, id, size = 26, group }) {
  return <span className="dt-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), "--av": senderColor(id ?? name) }}>{group ? <Icon name="users" size={Math.round(size * 0.5)} /> : initials(name)}</span>;
}

/** Kişisel + üye sohbetleri, gerçek zamanlı tazelenir. */
function useChats(access, source) {
  const personal = useData(`${C}/conversations`, null, { enabled: source !== "inbox", ttl: 15000, poll: 120000 });
  const wantInbox = Boolean(access?.inbox) && source !== "personal";
  const inbox = useData(`${A}/conversations`, { limit: 100 }, { enabled: wantInbox, ttl: 15000, poll: 120000 });
  useEffect(() => {
    let t = null;
    const off = W().chat?.onEvent?.(({ name } = {}) => {
      if (["chat:message", "chat:admin-inbox", "chat:read", "chat:conversation", "chat:deleted", "chat:updated"].includes(name)) {
        clearTimeout(t);
        t = setTimeout(() => { refreshData(`${C}/conversations`); refreshData(`${A}/conversations`); }, name === "chat:message" ? 300 : 800);
      }
    });
    return () => { clearTimeout(t); off?.(); };
  }, []);
  const p = personal.data?.conversations || [];
  const i = useMemo(() => (inbox.data ? inboxThreads(inbox.data.conversations) : []), [inbox.data]);
  return { personal, inbox, list: recentChats(p, i, source), unread: chatUnread(p, i, source), all: [...p, ...i], loading: !personal.data && personal.loading };
}

/** Kişi arama (Mesajlar rehberi) → doğrudan sohbet. */
function PersonSearch({ onPick, autoFocus }) {
  const [q, setQ] = useState("");
  const [base, setBase] = useState(null);
  const [found, setFound] = useState(null);
  useEffect(() => {
    let live = true;
    get(`${C}/directory`, { limit: 200 }).then((r) => live && setBase(r.ok ? r.data : { error: r.error }));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    if (q.trim().length < 2) { setFound(null); return undefined; }
    const t = setTimeout(() => get(`${C}/directory`, { q: q.trim(), limit: 40 }).then((r) => live && setFound(r.ok ? r.data : null)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const dir = base;
  // Takım başkanı rehberde takım adıyla gelir: kişinin adı (manager_name) da aranır; sunucu
  // aramasının sonuçları yerel süzgeçle birleşir.
  const sections = useMemo(() => {
    const merge = (a, b) => { const seen = new Set(); return [...(a || []), ...(b || [])].filter((p) => p && !seen.has(p.user_id) && seen.add(p.user_id)); };
    const keys = ["staff", "managers", "players", "members"];
    return directorySections(Object.fromEntries(keys.map((k) => [k, merge(base?.[k], found?.[k])])), { q: "" });
  }, [base, found]);
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  const people = sections.flatMap((s) => s.items.map((p) => ({ ...p, section: s.title })))
    .filter((p) => !needle || `${p.name} ${p.manager_name || ""} ${p.team_name || ""} ${p.subtitle || ""} ${p.username || ""}`.toLocaleLowerCase("tr-TR").includes(needle))
    .slice(0, 12);
  return (
    <div className="dt-person">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi ara: ad, takım, kullanıcı adı" aria-label="Kişi ara" autoFocus={autoFocus} />
      <ul className="dt-list">
        {dir?.error && <li className="dt-hint">{dir.error.message || "Rehber alınamadı."}</li>}
        {people.map((p) => (
          <li key={p.user_id} className="dt-row">
            <button type="button" className="dt-row__main" onClick={() => onPick(p)} data-user={p.user_id}>
              <Av name={p.name} id={p.user_id} size={22} />
              <span className="dt-row__text"><span>{p.name}</span><small>{p.line || p.section}</small></span>
            </button>
          </li>
        ))}
        {dir && !dir.error && !people.length && <li className="dt-hint">Kişi bulunamadı.</li>}
      </ul>
    </div>
  );
}

function Composer({ target, onSent, onCancel, compact = false, inputRef }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); }, [note]);
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !target || busy) return;
    setBusy(true);
    const base = target._inbox ? A : C;
    const res = await request({ method: "POST", path: `${base}/conversations/${target.id}/messages`, body: { kind: "text", body, client_id: newClientId() }, ...(target._inbox ? { queue: false } : {}) });
    setBusy(false);
    if (res.ok && res.queued) { setText(""); setNote({ tone: "amber", text: "Çevrimdışı: kuyruğa alındı, bağlantı gelince gönderilecek." }); }
    else if (res.ok) {
      setText("");
      setNote({ tone: "green", text: `${target.title} → gönderildi ✓` });
      if (!target._inbox) request({ method: "POST", path: `${C}/conversations/${target.id}/read`, body: {}, queue: false });
      onSent?.(res.data?.message);
    } else setNote({ tone: "red", text: res.offline && target._inbox ? "Üye mesajı yanıtı bağlantı ister." : res.error?.message || "Gönderilemedi." });
  };
  const blocked = target && (target.can_write === false || target.blocked_by_me);
  return (
    <form className={`dt-composer${compact ? " is-compact" : ""}`} onSubmit={send}>
      {!compact && <span className="dt-composer__to">→ <b>{target?.title || "Alıcı seçin"}</b>{target?._inbox ? " (ElitLig Yönetimi adına)" : ""}{onCancel && <button type="button" className="icon-btn icon-btn--xs" onClick={onCancel} aria-label="Alıcıyı kaldır"><Icon name="x" size={11} /></button>}</span>}
      <div className="dt-composer__row">
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={blocked ? "Bu sohbete yazılamıyor" : compact && target ? `${target.title} — mesaj yazın…` : "Mesaj yazın…"} aria-label="Mesaj" maxLength={4000} disabled={!target || blocked}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel?.(); }} />
        <button type="submit" className="btn btn--primary btn--xs" disabled={!text.trim() || !target || busy || blocked} aria-label="Gönder"><Icon name="send" size={12} /> Gönder</button>
      </div>
      <Note note={note} />
    </form>
  );
}

function Thread({ conv }) {
  const base = conv._inbox ? A : C;
  const q = useData(`${base}/conversations/${conv.id}/messages`, { limit: 30 }, { ttl: 5000, poll: 60000 });
  const box = useRef(null);
  useEffect(() => {
    if (!conv._inbox && isUnread(conv)) request({ method: "POST", path: `${C}/conversations/${conv.id}/read`, body: {}, queue: false }).then(() => refreshData(`${C}/conversations`));
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const off = W().chat?.onEvent?.(({ name, payload } = {}) => {
      if (name === "chat:message" && Number(payload?.conversation_id || payload?.message?.conversation_id) === Number(conv.id)) q.reload();
    });
    return () => off?.();
  }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const msgs = [...(q.data?.messages || [])].sort((a, b) => Number(a.id) - Number(b.id)).slice(-30);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs.length]);
  return (
    <div className="dt-thread" ref={box}>
      <State q={q} empty={q.data && !msgs.length ? "Henüz mesaj yok — ilk mesajı yazın." : null} emptyIcon="message">
        {msgs.map((m) => (
          <div key={m.id || m.client_id} className={`dt-bubble${m.sender?.is_me || m.sender?.is_management ? " is-me" : ""}${m.kind === "system" ? " is-system" : ""}`}>
            {!m.sender?.is_me && ["group", "team"].includes(conv.type) && <b>{m.sender?.name}</b>}
            <span>{m.deleted ? "Bu mesaj silindi" : chatPreview({ type: conv.type, last_message: { ...m, sender: { ...m.sender, is_me: false } } }).text}</span>
            <small>{listTime(m.created_at)}</small>
          </div>
        ))}
      </State>
    </div>
  );
}

export function MessagesTile({ tier, o, set, go, auth, lines, w }) {
  const access = auth?.access || {};
  const source = o.source || "all";
  const chats = useChats(access, source);
  const [total] = useBridge(() => W().chat?.status?.().then((s) => s?.unread ?? null), (cb) => W().chat?.onUnread?.(cb), []);
  const [target, setTarget] = useState(null);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef(null);
  const fixed = o.to ? chats.all.find((c) => String(c.id) === String(o.to)) : null;
  const unread = chats.personal.data || chats.inbox.data ? chats.unread : (total ?? 0);
  useEffect(() => { if (target) setTimeout(() => inputRef.current?.focus(), 30); }, [target]);
  // Sohbet listesi tazelenince seçili sohbetin bilgisi güncellensin.
  const current = target ? chats.all.find((c) => c.id === target.id && Boolean(c._inbox) === Boolean(target._inbox)) || target : null;

  const openDirect = async (p) => {
    const existing = chats.all.find((c) => c.type === "direct" && Number(c.other_user?.user_id) === Number(p.user_id));
    if (existing) { setTarget(existing); setPicking(false); return; }
    const r = await request({ method: "POST", path: `${C}/conversations`, body: { type: "direct", user_id: Number(p.user_id) }, queue: false });
    if (r.ok && r.data?.conversation) { setTarget(r.data.conversation); setPicking(false); refreshData(`${C}/conversations`); }
  };

  if (tier === "xs") {
    return <XsButton icon="message" badge={unread} label={fixed ? fixed.title : "Mesajlar"} title={unread ? `${unread} okunmamış mesaj` : "Mesajlar"} onClick={() => go(fixed ? `messages:${fixed.id}` : chats.list[0] && isUnread(chats.list[0]) ? `messages:${chats.list[0].id}` : "messages")} />;
  }
  if (chats.personal.error && !chats.personal.data && source !== "inbox") return <State q={chats.personal} />;
  if (chats.loading) return <State q={chats.personal} />;

  const row = (c, onClick) => {
    const p = chatPreview(c);
    const u = isUnread(c);
    return (
      <li key={`${c._inbox ? "i" : "p"}${c.id}`} className={`dt-chat${u ? " is-unread" : ""}${current?.id === c.id ? " is-target" : ""}`} data-cid={c.id}>
        <button type="button" className="dt-chat__main" onClick={() => onClick(c)} title="Yaz">
          <Av name={c.title} id={c.other_user?.user_id ?? c.id} group={["group", "team"].includes(c.type)} />
          <span className="dt-chat__text">
            <span className="dt-chat__top"><b>{c.title}</b>{c._inbox && <i className="dt-tag">Üye</i>}<small>{listTime(c.last_message?.created_at || c.last_message_at)}</small></span>
            <span className="dt-chat__last">{p.prefix}{p.text}</span>
          </span>
          {u && <em className="dt-badge">{Number(c.unread) || "•"}</em>}
        </button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => go(`messages:${c.id}`)} aria-label={`${c.title} sohbetini Mesajlar'da aç`} title="Mesajlar'da aç"><Icon name="external" size={11} /></button>
      </li>
    );
  };
  const sum = (
    <div className="dt-msgsum">
      <button type="button" className={`dt-count${unread ? " is-on" : ""}`} onClick={() => go("messages")} title="Mesajlar'ı aç"><b data-testid="unread">{unread}</b><span>okunmamış</span></button>
      {chats.personal.offline && <span className="pill">çevrimdışı</span>}
      <span className="dt-grow" />
      <button type="button" className={`btn btn--xs${picking ? " is-on" : ""}`} onClick={() => setPicking((v) => !v)} aria-pressed={picking}><Icon name="userPlus" size={12} /> Yeni mesaj</button>
    </div>
  );

  if (tier === "s") {
    if (fixed) {
      return (
        <div className="dt-stack">
          <div className="dt-msgsum"><Av name={fixed.title} id={fixed.other_user?.user_id ?? fixed.id} size={22} /><b className="dt-ellipsis">{fixed.title}</b>{isUnread(fixed) && <em className="dt-badge">{fixed.unread || "•"}</em>}<span className="dt-grow" /><button type="button" className="link-btn" onClick={() => go(`messages:${fixed.id}`)}>Aç →</button></div>
          <Composer target={fixed} compact onSent={() => refreshData(`${C}/conversations`)} />
        </div>
      );
    }
    const top = chats.list[0];
    const p0 = top ? chatPreview(top) : null;
    return <Big value={unread} label={unread === 1 ? "okunmamış mesaj" : "okunmamış"} tone={unread ? "green" : ""} sub={top ? `${top.title}: ${p0.prefix}${p0.text}` : "Henüz mesaj yok"} onClick={() => go(top ? `messages:${top.id}` : "messages")} />;
  }

  const listMax = Math.max(1, lines - (current ? 4 : 2));
  if (tier === "xl" && w >= 8) {
    return (
      <div className="dt-msgs is-split">
        <div className="dt-msgs__side">
          {sum}
          {picking ? <PersonSearch onPick={openDirect} autoFocus /> : <ul className="dt-list">{chats.list.slice(0, Math.max(3, lines)).map((c) => row(c, (x) => { setTarget(x); setPicking(false); }))}</ul>}
        </div>
        <div className="dt-msgs__pane">
          {current ? (<>
            <div className="dt-msgs__head"><Av name={current.title} id={current.other_user?.user_id ?? current.id} size={24} /><b>{current.title}</b><span className="dt-grow" /><button type="button" className="link-btn" onClick={() => go(`messages:${current.id}`)}>Mesajlar'da aç →</button></div>
            <Thread key={`${current._inbox ? "i" : "p"}${current.id}`} conv={current} />
            <Composer target={current} compact inputRef={inputRef} onSent={() => { refreshData(`${C}/conversations`); refreshData(`/conversations/${current.id}/messages`); }} />
          </>) : <div className="dt-empty"><Icon name="message" size={20} /><span>Soldan bir sohbet seçin ya da “Yeni mesaj” ile kişi arayın.</span></div>}
        </div>
      </div>
    );
  }
  return (
    <div className="dt-msgs">
      {sum}
      {picking ? <PersonSearch onPick={openDirect} autoFocus /> : (
        <ul className="dt-list">
          {chats.list.length ? chats.list.slice(0, listMax).map((c) => row(c, (x) => setTarget(current?.id === x.id ? null : x))) : <li className="dt-hint">Henüz mesaj yok. “Yeni mesaj” ile başlayın.</li>}
        </ul>
      )}
      {current && <Composer target={current} inputRef={inputRef} onCancel={() => setTarget(null)} onSent={() => refreshData(`${C}/conversations`)} />}
      {!current && !picking && tier !== "m" && <p className="dt-hint">Bir sohbete tıklayın, buradan yazın.</p>}
      {set && null}
    </div>
  );
}

export function RequestsTile({ tier, go, lines }) {
  const [summary] = useBridge(() => W().requests.summary(), (cb) => W().requests.onSummary(cb), []);
  if (summary?.denied) return <State empty="Talepler yönetim hesaplarına açıktır." emptyIcon="lock" />;
  const cats = topCategories(summary, 8);
  const total = Number(summary?.total) || 0;
  if (tier === "xs") return <XsButton icon="inbox" badge={total} label="Talepler" tone={total ? "red" : ""} onClick={() => go("requests")} />;
  if (!summary) return <State q={{ loading: true }} />;
  if (tier === "s") return <Big value={total} label="talep onay bekliyor" tone={total ? "red" : ""} sub={cats.slice(0, 2).map((c) => `${c.label}: ${c.open}`).join(" · ") || "Bekleyen talep yok ✓"} onClick={() => go("requests")} />;
  if (!total) return <State empty="Bekleyen talep yok. Takım ve üyelerden gelen onay talepleri burada görünür." emptyIcon="checks" />;
  return (
    <div className="dt-stack">
      <button type="button" className="today-req__total link-btn" onClick={() => go("requests")}><strong>{total}</strong><span>talep onay bekliyor</span></button>
      {tier === "m" ? (
        <div className="today-req__cats">{cats.slice(0, 6).map((c) => <button key={c.key} type="button" data-cat={c.key} onClick={() => go(`requests:${c.key}`)}><Icon name={c.icon} size={13} /> {c.label} <b>{c.open}</b></button>)}</div>
      ) : (
        <List>{cats.slice(0, Math.max(2, lines - 2)).map((c) => <Row key={c.key} icon={c.icon} title={c.label} right={c.open} tone={c.open ? "red" : ""} onClick={() => go(`requests:${c.key}`)} />)}</List>
      )}
    </div>
  );
}

export function SyncTile({ tier }) {
  const [st] = useBridge(() => W().sync.status(), (cb) => W().sync.onStatus(cb), []);
  const [busy, setBusy] = useState(false);
  const online = st?.online !== false;
  const pending = Number(st?.pending) || 0;
  const flush = async () => { setBusy(true); await W().sync.flush().catch(() => {}); setBusy(false); };
  if (tier === "xs") return <XsButton icon={online ? "cloud" : "cloudOff"} badge={pending} label={online ? "Çevrimiçi" : "Çevrimdışı"} tone={online ? "green" : "amber"} onClick={flush} title={pending ? `${pending} değişiklik eşitlenmeyi bekliyor — şimdi eşitle` : "Şimdi eşitle"} />;
  return (
    <div className="dt-stack">
      <Stats items={[{ label: online ? "çevrimiçi" : "çevrimdışı", value: <Icon name={online ? "cloud" : "cloudOff"} size={18} />, tone: online ? "green" : "amber" }, { label: "bekleyen değişiklik", value: pending, tone: pending ? "amber" : "" }]} />
      <button type="button" className="btn btn--xs" onClick={flush} disabled={busy || !online}><Icon name="refresh" size={12} /> {busy ? "Eşitleniyor…" : "Şimdi eşitle"}</button>
      {tier === "m" && st?.lastSync && <p className="dt-hint">Son eşitleme: {new Date(st.lastSync).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>}
    </div>
  );
}
