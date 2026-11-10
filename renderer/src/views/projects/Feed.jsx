// Proje akışı: ekibi bilgilendirme ve not alma alanı. Duyuru / güncelleme /
// not; @bahsetme (proje ekibi, @herkes), bağlantı ve dosya eki, yorum, tepki,
// sabitleme. Yeni gönderiler ana süreçteki sohbet bağlantısından anında gelir
// (bağlantı yoksa kısa aralıkla yenilenir). "Proje sohbet grubu" ile ekip
// Mesajlar'da gruplanır.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, Segmented, Spinner, useConfirm, useToast } from "../../components/ui";
import { del, get, patch, post, request } from "../../api";
import { relativeTime } from "../../lib/helpers";
import { POST_KIND_META, insertMention, mentionQuery, tokenize } from "../../lib/lifecycleUtils";
import { Avatar, BASE, ROLE_LABEL, openLink, useRun } from "./common";
import { POLL_MS, useFeedEvents } from "./useLifecycle";
import "./lifecycle.css";

const KIND_ICONS = { announcement: "broadcast", update: "refresh", note: "note" };

/** Başkasının yayınladığı gönderiyi bu kullanıcının gözünden yeniden kurar. */
export function rebase(post, me) {
  if (!post) return post;
  const fix = (p) => ({ ...p, mine: me != null && Number(p.created_by) === Number(me), reactions: (p.reactions || []).map((r) => ({ ...r, mine: Array.isArray(r.user_ids) ? r.user_ids.some((id) => Number(id) === Number(me)) : r.mine })) });
  return { ...fix(post), ...(post.comments ? { comments: post.comments.map(fix) } : {}) };
}

/** Gönderi listesine olayı uygular (yeni / güncel / silinen; yorumlar dahil). */
export function applyFeedEvent(items, ev) {
  if (ev.action === "delete") {
    if (ev.parent_id) return items.map((p) => (p.id === ev.parent_id ? { ...p, comments: p.comments.filter((c) => c.id !== ev.post_id) } : p));
    return items.filter((p) => p.id !== ev.post_id);
  }
  const item = ev.post;
  if (!item) return items;
  if (item.parent_id) {
    return items.map((p) => {
      if (p.id !== item.parent_id) return p;
      const exists = p.comments.some((c) => c.id === item.id);
      return { ...p, comments: exists ? p.comments.map((c) => (c.id === item.id ? item : c)) : [...p.comments, item] };
    });
  }
  if (items.some((p) => p.id === item.id)) return items.map((p) => (p.id === item.id ? { ...p, ...item, comments: p.comments, unread: p.unread } : p));
  return [{ ...item, comments: item.comments || [], unread: ev.action === "post" }, ...items];
}
const sortPosts = (items) => [...items].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.id - a.id);

function MentionBox({ value, onChange, team, placeholder, onSubmit, rows = 3, label, autoFocus }) {
  const ref = useRef(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const q = mentionQuery(value, caret);
  const options = useMemo(() => {
    if (!q) return [];
    const n = q.query.toLocaleLowerCase("tr-TR");
    return [...team.filter((m) => m.name.toLocaleLowerCase("tr-TR").split(/\s+/).some((w) => w.startsWith(n))).slice(0, 6), ...("herkes".startsWith(n) ? [{ user_id: "all", name: "herkes", role: "Tüm ekip" }] : [])];
  }, [q, team]);
  const pick = (m) => {
    const res = insertMention(value, caret, m.name);
    onChange(res.text);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(res.caret, res.caret); setCaret(res.caret); });
  };
  return (
    <div className="lc-mention">
      <textarea ref={ref} rows={rows} value={value} placeholder={placeholder} aria-label={label || placeholder} autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setActive(0); }}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)} onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[active]); return; }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit?.(); }
        }} />
      {options.length > 0 && (
        <ul className="lc-mention__list" role="listbox" aria-label="Bahsedilecek kişi">
          {options.map((m, i) => <li key={m.user_id} role="option" aria-selected={i === active}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)}><Avatar name={m.name} size={20} /> {m.name} <small>{ROLE_LABEL[m.role] || m.role}</small></button></li>)}
        </ul>
      )}
    </div>
  );
}

const Body = ({ text, names }) => (
  <p className="lc-post__body selectable">
    {tokenize(text, names).map((t, i) => {
      if (t.type === "url") return <button key={i} type="button" className="link-btn lc-inline-link" onClick={() => openLink(t.text)}>{t.text}</button>;
      if (t.type === "mention") return <mark key={i} className="lc-at">{t.text}</mark>;
      return <React.Fragment key={i}>{t.text}</React.Fragment>;
    })}
  </p>
);

const Attachments = ({ links = [], attachments = [] }) => (links.length || attachments.length ? (
  <div className="lc-post__att">
    {attachments.filter((a) => a.is_image).map((a) => <button key={a.url} type="button" className="lc-post__img" onClick={() => (window.elitlig.chat.openFile ? window.elitlig.chat.openFile(a.url, a.name) : openLink(a.url))}><img src={a.url} alt={a.name} loading="lazy" /></button>)}
    <div className="row-gap">
      {attachments.filter((a) => !a.is_image).map((a) => <button key={a.url} type="button" className="lc-linkchip" onClick={() => (window.elitlig.chat.openFile ? window.elitlig.chat.openFile(a.url, a.name) : openLink(a.url))}><Icon name="file" size={11} /> {a.name}</button>)}
      {links.map((l) => <button key={l.url} type="button" className="lc-linkchip" onClick={() => openLink(l.url)}><Icon name="link" size={11} /> {l.label}</button>)}
    </div>
  </div>
) : null);

function Reactions({ item, reactions, onReact }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lc-react">
      {item.reactions.map((r) => <button key={r.emoji} type="button" className={`lc-react__chip ${r.mine ? "is-mine" : ""}`} onClick={() => onReact(item, r.emoji)} title={r.names.join(", ")} aria-label={`${r.emoji} ${r.count} kişi${r.mine ? ", sizin tepkiniz" : ""}`}>{r.emoji} {r.count}</button>)}
      <span className="lc-react__add">
        <button type="button" className="lc-react__chip" aria-label="Tepki ekle" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name="smile" size={13} /></button>
        {open && <span className="lc-react__pick">{reactions.map((e) => <button key={e} type="button" onClick={() => { setOpen(false); onReact(item, e); }} aria-label={`${e} tepkisi`}>{e}</button>)}</span>}
      </span>
    </div>
  );
}

function Composer({ projectId, feed, onPosted }) {
  const run = useRun();
  const toast = useToast();
  const [kind, setKind] = useState("update");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const kinds = feed.kinds.filter((k) => feed.can_announce || k.key !== "announcement");
  const addLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast("Bağlantı http:// ya da https:// ile başlamalı.", { tone: "error" }); return; }
    setLinks((l) => [...l, { url }]);
    setLinkDraft("");
  };
  const attach = async () => {
    const picked = await window.elitlig.chat.pick({});
    if (!picked?.length) return;
    setUploading(true);
    for (const f of picked) {
      if (f.tooLarge) { toast(`${f.name} 25 MB'tan büyük.`, { tone: "error" }); continue; }
      // eslint-disable-next-line no-await-in-loop
      const r = await window.elitlig.chat.upload("file", f);
      if (r?.ok) setFiles((x) => [...x, { url: r.data.url, name: r.data.name || f.name, mime: r.data.mime, size: r.data.size, is_image: r.data.is_image }]);
      else toast(r?.offline ? "Dosya yüklemek için bağlantı gerekir." : r?.error?.message || "Dosya yüklenemedi.", { tone: "error" });
    }
    setUploading(false);
  };
  const submit = async () => {
    if (!body.trim() && !links.length && !files.length) return;
    setBusy(true);
    const r = await post(`${BASE}/${projectId}/feed`, { kind, body, links, attachments: files }, { queue: false });
    setBusy(false);
    if (!run(r, r.data?.item?.mentions?.length ? `${r.data.item.mentions.length} kişiye bildirildi (Yapılacaklar).` : null)) return;
    setBody(""); setLinks([]); setFiles([]);
    onPosted(r.data.item);
  };
  return (
    <section className="card lc-composer">
      <Segmented size="sm" value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k.key, label: k.label, icon: KIND_ICONS[k.key] }))} ariaLabel="Gönderi türü" />
      <MentionBox value={body} onChange={setBody} team={feed.team} onSubmit={submit} label="Gönderi metni" placeholder={kind === "announcement" ? "Ekibe duyuru… (@ ile kişi, @herkes ile tüm ekip)" : "Gelişmeyi paylaşın ya da not alın… (@ ile bahsedin, ⌘↩ gönderir)"} />
      {(links.length > 0 || files.length > 0) && (
        <div className="row-gap">
          {files.map((f, i) => <span key={f.url} className="chip"><Icon name="file" size={11} /> {f.name}<button type="button" aria-label={`${f.name} kaldır`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button></span>)}
          {links.map((l, i) => <span key={l.url} className="chip"><Icon name="link" size={11} /> {l.url.replace(/^https?:\/\//, "").slice(0, 40)}<button type="button" aria-label="Bağlantıyı kaldır" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}>×</button></span>)}
        </div>
      )}
      <div className="lc-composer__bar">
        <input className="lc-composer__link" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} placeholder="Bağlantı yapıştır (https://…)" aria-label="Bağlantı ekle" />
        <button type="button" className="btn btn--sm" onClick={addLink} disabled={!linkDraft.trim()}><Icon name="link" size={12} /> Ekle</button>
        <button type="button" className="btn btn--sm" onClick={attach} disabled={uploading}><Icon name="paperclip" size={12} /> {uploading ? "Yükleniyor…" : "Dosya"}</button>
        <span className="spacer" />
        <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={busy || uploading || (!body.trim() && !links.length && !files.length)}><Icon name="send" size={12} /> {busy ? "Paylaşılıyor…" : "Paylaş"}</button>
      </div>
    </section>
  );
}

function PostCard({ item, feed, names, projectId, isOwner, onChanged, onRemoved }) {
  const run = useRun();
  const confirm = useConfirm();
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const meta = POST_KIND_META[item.kind] || POST_KIND_META.note;
  const base = `${BASE}/${projectId}/feed`;
  const react = async (target, emoji) => { const r = await post(`${base}/${target.id}/reactions`, { emoji }, { queue: false }); if (run(r)) onChanged(r.data.item); };
  const sendReply = async () => {
    if (!reply.trim()) return;
    const r = await post(`${base}/${item.id}/comments`, { body: reply }, { queue: false });
    if (run(r)) { onChanged(r.data.item); setReply(""); }
  };
  const save = async (body, msg) => { const r = await patch(`${base}/${item.id}`, body); if (!run(r, msg)) return false; onChanged(r.data.item); return true; };
  const remove = async (target) => {
    if (!(await confirm({ title: target.parent_id ? "Yorumu sil" : "Gönderiyi sil", message: target.parent_id ? "Yorum silinsin mi?" : "Gönderi ve yorumları silinecek.", confirmLabel: "Sil", danger: true }))) return;
    const r = await del(`${base}/${target.id}`);
    if (run(r, "Silindi.")) onRemoved(target);
  };
  const menu = [
    feed.can_pin && { label: item.pinned ? "Sabitlemeyi kaldır" : "En üste sabitle", icon: "pin", onClick: () => save({ pinned: !item.pinned }, item.pinned ? "Sabitleme kaldırıldı." : "Gönderi sabitlendi.") },
    item.mine && { label: "Düzenle", icon: "pencil", onClick: () => { setDraft(item.body); setEditing(true); } },
    (item.mine || isOwner) && { label: "Sil", icon: "trash", danger: true, onClick: () => remove(item) },
  ].filter(Boolean);
  return (
    <article className={`card lc-post is-${item.kind} ${item.pinned ? "is-pinned" : ""} ${item.unread ? "is-unread" : ""}`} style={{ "--kc": meta.color }} aria-label={`${item.author_name || "Ekip"}: ${meta.label}`}>
      <header className="lc-post__head">
        <Avatar name={item.author_name || "?"} size={34} />
        <div className="lc-post__who"><strong>{item.author_name || "Ekip üyesi"}</strong><small title={new Date(item.created_at).toLocaleString("tr-TR")}>{relativeTime(item.created_at)}{item.edited_at ? " · düzenlendi" : ""}</small></div>
        <span className="pill" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}><Icon name={KIND_ICONS[item.kind] || "note"} size={11} /> {meta.label}</span>
        {item.pinned && <span className="lc-pin"><Icon name="pin" size={11} /> Sabit</span>}
        {item.unread && <span className="pill pill--red">Yeni</span>}
        <span className="spacer" />
        {menu.length > 0 && <MenuButton label="Gönderi işlemleri" items={menu} />}
      </header>
      {editing ? (
        <div className="lc-post__edit">
          <MentionBox value={draft} onChange={setDraft} team={feed.team} label="Gönderiyi düzenle" autoFocus onSubmit={async () => { if (await save({ body: draft })) setEditing(false); }} />
          <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>Vazgeç</button><button type="button" className="btn btn--sm btn--primary" onClick={async () => { if (await save({ body: draft })) setEditing(false); }}>Kaydet</button></div>
        </div>
      ) : item.body && <Body text={item.body} names={names} />}
      <Attachments links={item.links} attachments={item.attachments} />
      <footer className="lc-post__foot">
        <Reactions item={item} reactions={feed.reactions} onReact={react} />
        <span className="spacer" />
        <button type="button" className="link-btn small" onClick={() => setShowReply((v) => !v)}><Icon name="message" size={12} /> {item.comments.length ? `${item.comments.length} yorum` : "Yorum yaz"}</button>
      </footer>
      {(item.comments.length > 0 || showReply) && (
        <div className="lc-thread">
          {item.comments.map((c) => (
            <div key={c.id} className="lc-comment">
              <Avatar name={c.author_name || "?"} size={24} />
              <div className="lc-comment__main">
                <div><strong>{c.author_name}</strong> <small>{relativeTime(c.created_at)}</small>{(c.mine || isOwner) && <button type="button" className="lc-comment__del" aria-label="Yorumu sil" onClick={() => remove(c)}><Icon name="x" size={11} /></button>}</div>
                <Body text={c.body} names={names} />
                <Attachments links={c.links} attachments={c.attachments} />
                <Reactions item={c} reactions={feed.reactions} onReact={react} />
              </div>
            </div>
          ))}
          <div className="lc-replybox">
            <MentionBox value={reply} onChange={setReply} team={feed.team} rows={1} label="Yorum yaz" placeholder="Yanıt yazın… (⌘↩)" onSubmit={sendReply} />
            <button type="button" className="btn btn--sm btn--primary" onClick={sendReply} disabled={!reply.trim()}>Gönder</button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Feed({ ctx }) {
  const { project, isOwner, me, go } = ctx;
  const toast = useToast();
  const run = useRun();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("");
  const [offline, setOffline] = useState(false);
  const [opening, setOpening] = useState(false);
  const base = `${BASE}/${project.id}/feed`;
  const markRead = useCallback(() => request({ method: "POST", path: `${base}/read`, body: {}, queue: false }), [base]);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const r = await get(base, kind ? { kind } : undefined);
    if (r.ok) {
      setFeed(r.data);
      setError(null);
      setOffline(Boolean(r.offline));
      if (r.data.unread && !r.offline) markRead();
    } else if (!quiet) setError(r.error?.status === 404 ? { message: "Proje akışı için sunucu güncellemesi henüz yayında değil." } : r.error);
  }, [base, kind, markRead]);
  useEffect(() => { load(); }, [load]);

  const { live } = useFeedEvents(project.id, (ev) => {
    const view = ev.post ? { ...ev, post: rebase(ev.post, me) } : ev;
    setFeed((f) => (f ? { ...f, items: sortPosts(applyFeedEvent(f.items, view)) } : f));
    if (["post", "comment"].includes(ev.action)) markRead();
    if (ev.mentions?.includes?.(Number(me))) toast(`${ev.by?.name || "Bir ekip üyesi"} sizden bahsetti.`, { tone: "info" });
  });
  useEffect(() => {
    if (live) return undefined;
    const t = setInterval(() => { if (document.visibilityState !== "hidden") load({ quiet: true }); }, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const loadMore = async () => {
    const r = await get(base, { before: feed.next_before, ...(kind ? { kind } : {}) });
    if (run(r)) setFeed((f) => ({ ...f, items: [...f.items, ...r.data.items.filter((p) => !p.pinned)], has_more: r.data.has_more, next_before: r.data.next_before }));
  };
  const openChat = async () => {
    setOpening(true);
    const r = await post(`${BASE}/${project.id}/chat-group`, {}, { queue: false });
    setOpening(false);
    if (!run(r)) return;
    if (r.data.skipped_members?.length) toast(`${r.data.skipped_members.map((m) => m.name).join(", ")} sohbete eklenemedi (mesaj kabul etmiyor).`, { tone: "warn" });
    if (r.data.conversation_id) go("messages", String(r.data.conversation_id));
  };

  if (!feed) return error ? <ErrorNote error={error} onRetry={() => load()} /> : <Spinner />;
  const names = feed.team.map((m) => m.name);
  const changed = (item) => setFeed((f) => ({ ...f, items: sortPosts(applyFeedEvent(f.items, { action: "update", post: item })) }));
  const removed = (item) => setFeed((f) => ({ ...f, items: applyFeedEvent(f.items, { action: "delete", post_id: item.id, parent_id: item.parent_id }) }));

  return (
    <div className="proj-section lc-feed">
      <div className="lc-feed__main">
        {offline && <div className="offline-note"><Icon name="cloudOff" size={14} /> Çevrimdışı: akış önbellekten gösteriliyor; paylaşmak için bağlantı gerekir.</div>}
        <Composer projectId={project.id} feed={feed} onPosted={(item) => setFeed((f) => ({ ...f, items: sortPosts([{ ...item, comments: [] }, ...f.items]) }))} />
        <div className="filters">
          <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "", label: "Tümü" }, { value: "announcement", label: "Duyurular" }, { value: "update", label: "Güncellemeler" }, { value: "note", label: "Notlar" }]} ariaLabel="Gönderi türü" />
          <span className="spacer" />
          <span className={`lc-live ${live ? "is-on" : ""}`} title={live ? "Yeni gönderiler anında gelir" : "Bağlantı yok: akış kısa aralıklarla yenilenir"}><i /> {live ? "Canlı" : "Yenileniyor"}</span>
        </div>
        {!feed.items.length ? (
          <div className="card"><Empty icon="message" title={kind ? "Bu türde gönderi yok" : "Akış henüz boş"} text="Gelişmeleri, kararları ve notları ekibinizle burada paylaşın. @ ile ekipten birinden bahsedin; Yapılacaklar listesine düşer." /></div>
        ) : (
          <div className="lc-posts">
            {feed.items.map((p) => <PostCard key={p.id} item={p} feed={feed} names={names} projectId={project.id} isOwner={isOwner} onChanged={changed} onRemoved={removed} />)}
            {feed.has_more && <button type="button" className="btn" onClick={loadMore}>Daha eski gönderiler</button>}
          </div>
        )}
      </div>
      <aside className="lc-feed__side">
        <section className="card">
          <header className="card__head"><h2 className="card__title"><Icon name="team" /> Proje ekibi <span className="pill">{feed.team.length}</span></h2></header>
          <ul className="lc-team">{feed.team.map((m) => <li key={m.user_id}><Avatar name={m.name} size={26} /><span><b>{m.name}</b><small>{ROLE_LABEL[m.role]}</small></span></li>)}</ul>
          <button type="button" className="btn btn--sm lc-chatbtn" onClick={openChat} disabled={opening || feed.team.length < 2}><Icon name="message" size={13} /> {feed.chat_conversation_id ? "Proje sohbetini aç" : "Proje sohbet grubu aç"}</button>
          {feed.team.length < 2 && <p className="muted small">Sohbet grubu için Ayarlar'dan ekibe üye ekleyin.</p>}
        </section>
        <section className="card lc-tips">
          <header className="card__head"><h2 className="card__title"><Icon name="sparkles" /> İpuçları</h2></header>
          <ul>
            <li><b>@Ad</b> ile bahsedilen kişinin Yapılacaklar listesine kart düşer; <b>@herkes</b> tüm ekibi çağırır.</li>
            <li>Önemli kararları <b>Duyuru</b> olarak paylaşıp en üste sabitleyin.</li>
            <li>Teklif, sözleşme ya da fotoğrafı dosya olarak ekleyin.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
