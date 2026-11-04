// Mesaj balonu: metin, fotoğraf (albüm), belge, sesli mesaj, anket, konum,
// sistem satırı; yanıt alıntısı, iletildi / düzenlendi etiketi, saat + tikler,
// tepkiler ve üzerine gelince açılan eylem düğmeleri.
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { Avatar, Ticks, anchorOf, pointOf } from "./common";
import { clockTime, emojiOnlyCount, formatBytes, formatDuration, mediaUrl, parseRich, pollResults, quoteText, reactionSummary, senderColor, tickStatus } from "../../lib/chatUtils";

const openUrl = (url) => window.elitlig.app.openExternal(url);

export function RichText({ text, participants, meId }) {
  const parts = useMemo(() => parseRich(text, participants), [text, participants]);
  return parts.map((p, i) => {
    if (p.t === "link") return <a key={i} href={p.v} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openUrl(p.v); }}>{p.v}</a>;
    if (p.t === "mention") return <span key={i} className={`ms-mention ${Number(p.id) === Number(meId) ? "is-me" : ""}`}>{p.v}</span>;
    if (p.t === "bold") return <strong key={i}>{p.v}</strong>;
    return <React.Fragment key={i}>{p.v}</React.Fragment>;
  });
}

/* --------------------------------- ses --------------------------------- */
const bars = (seed, n = 34) => {
  let x = Number(seed) || 7;
  return Array.from({ length: n }, () => { x = (x * 9301 + 49297) % 233280; return 0.25 + (x / 233280) * 0.75; });
};
export function AudioPlayer({ m }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const total = (m.meta?.audio?.duration_ms || 0) / 1000;
  const [dur, setDur] = useState(total);
  const heights = useMemo(() => bars(m.id), [m.id]);
  const src = m._localUrl || mediaUrl(m.meta?.audio?.url);
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate]);
  const toggle = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a) return;
    if (a.paused) { document.querySelectorAll("audio").forEach((x) => { if (x !== a) x.pause(); }); a.play().catch(() => {}); } else a.pause();
  };
  const seek = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };
  const progress = dur ? pos / dur : 0;
  return (
    <div className="ms-audio" onClick={(e) => e.stopPropagation()}>
      <Avatar name={m.sender?.name} id={m.sender?.user_id} url={m.sender?.avatar} size={38} />
      <button type="button" className="ms-audio__play" onClick={toggle} aria-label={playing ? "Duraklat" : "Oynat"}><Icon name={playing ? "pause" : "play"} size={16} strokeWidth={2.4} /></button>
      <div className="ms-audio__track">
        <div className="ms-audio__bars" onClick={seek}>
          {heights.map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%` }} className={i / heights.length <= progress ? "is-on" : ""} />)}
        </div>
        <div className="ms-audio__meta">
          <span>{formatDuration((playing || pos ? pos : dur) * 1000)}</span>
          <button type="button" className="ms-audio__rate" onClick={(e) => { e.stopPropagation(); setRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1)); }}>{rate}×</button>
        </div>
      </div>
      {src && <audio ref={ref} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }} />}
    </div>
  );
}

/* -------------------------------- anket -------------------------------- */
function PollCard({ m, meId, onVote, onVoters }) {
  const poll = m.meta?.poll;
  const r = pollResults(poll, meId);
  if (!poll) return null;
  return (
    <div className="ms-poll" onClick={(e) => e.stopPropagation()}>
      <strong className="ms-poll__q">{poll.question}</strong>
      <small className="muted">{poll.multiple ? "Birden çok seçenek seçilebilir" : "Bir seçenek seçin"}</small>
      {r.rows.map((o) => (
        <button key={o.id} type="button" className={`ms-poll__opt ${o.mine ? "is-mine" : ""}`} onClick={() => onVote(m, o.id)}>
          <span className={`ms-poll__box ${poll.multiple ? "is-multi" : ""}`}>{o.mine && <Icon name="check" size={11} strokeWidth={3} />}</span>
          <span className="ms-poll__text">{o.text}</span>
          <span className="ms-poll__count">{o.count}</span>
          <span className="ms-poll__bar"><i style={{ width: `${Math.round(o.bar * 100)}%` }} /></span>
        </button>
      ))}
      <button type="button" className="ms-poll__voters" onClick={() => onVoters(m)}>{r.total ? `${r.total} kişi oy verdi · Oyları gör` : "Henüz oy yok"}</button>
    </div>
  );
}

function FileCard({ m, onOpen, onDownload }) {
  const f = m.meta?.file || {};
  const ext = String(f.name || "").split(".").pop().toUpperCase().slice(0, 4);
  return (
    <div className="ms-file" onClick={(e) => { e.stopPropagation(); if (!m._pending) onOpen(m); }}>
      <span className="ms-file__ic" data-ext={ext}><Icon name="file" size={22} /></span>
      <span className="ms-file__text"><strong>{f.name || "Belge"}</strong><small>{[f.size ? formatBytes(f.size) : null, ext].filter(Boolean).join(" · ")}{m._pending ? " · yükleniyor…" : ""}</small></span>
      {!m._pending && <button type="button" className="icon-btn" title="İndir" onClick={(e) => { e.stopPropagation(); onDownload(m); }}><Icon name="download" /></button>}
    </div>
  );
}

function LocationCard({ m }) {
  const l = m.meta?.location || {};
  const q = l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : l.address || l.label;
  return (
    <button type="button" className="ms-loc" onClick={(e) => { e.stopPropagation(); openUrl(`https://maps.apple.com/?q=${encodeURIComponent(q || "")}`); }}>
      <span className="ms-loc__map"><Icon name="map" size={26} /></span>
      <span><strong>{l.label || l.venue_name || "Konum"}</strong><small>{l.address || q}</small><em>Haritada aç</em></span>
    </button>
  );
}

function ImageThumb({ m, onOpen, single = true }) {
  const f = m.meta?.file || {};
  const src = m._localUrl || mediaUrl(f.url);
  const ratio = f.width && f.height ? Math.max(0.55, Math.min(1.6, f.width / f.height)) : 1.33;
  return (
    <button type="button" className={`ms-img ${single ? "" : "ms-img--cell"} ${m._pending ? "is-pending" : ""}`} style={single ? { aspectRatio: String(ratio) } : undefined} onClick={(e) => { e.stopPropagation(); onOpen(m); }}>
      {src ? <img src={src} alt={m.meta?.caption || "Fotoğraf"} loading="lazy" draggable={false} /> : <Icon name="image" size={28} />}
      {m._pending && <span className="ms-img__spin" />}
    </button>
  );
}

/* -------------------------------- balon -------------------------------- */
function BubbleImpl({ item, conv, meId, participants, selecting, selected, highlighted, onAction }) {
  const album = item.type === "album" ? item.messages : null;
  const m = album ? album[album.length - 1] : item.message;
  const mine = Boolean(m.sender?.is_me);
  const isGroup = conv.type === "group" || conv.type === "team";
  const status = tickStatus(m);
  const rs = reactionSummary(m.reactions);
  const isSelected = album ? album.every((x) => selected?.has(x.id)) : selected?.has(m.id);

  if (m.kind === "system") {
    return <div className="ms-system" data-mid={m.id}><span>{m.body}</span></div>;
  }
  const big = (m.kind || "text") === "text" && !m.deleted ? emojiOnlyCount(m.body) : 0;
  // Saat + tik + "düzenlendi" son satırın sağına sığsın diye metnin sonuna boşluk (WhatsApp gibi).
  const spacer = <span className="ms-spacer" style={{ width: 44 + (status ? 20 : 0) + (m.edited_at ? 64 : 0) + (m.starred ? 14 : 0) }} />;
  const menu = (e, point) => { e.preventDefault(); e.stopPropagation(); onAction("menu", album || m, point ? pointOf(e) : anchorOf(e)); };
  const showName = isGroup && !mine && item.first;
  const media = !m.deleted && (m.kind === "image" || album);

  const body = () => {
    if (m.deleted) return <span className="ms-deleted"><Icon name="ban" size={13} /> {mine ? "Bu mesajı sildiniz" : "Bu mesaj silindi"}{spacer}</span>;
    if (album) {
      const shown = album.slice(0, 4);
      return (
        <>
        <div className={`ms-album ms-album--${Math.min(4, album.length)}`}>
          {shown.map((x, i) => (
            <span key={x.id || x.client_id} className="ms-album__cell">
              <ImageThumb m={x} single={false} onOpen={(mm) => onAction("lightbox", mm)} />
              {i === 3 && album.length > 4 && <span className="ms-album__more">+{album.length - 4}</span>}
            </span>
          ))}
        </div>
        {m.meta?.caption && <div className="ms-text ms-text--caption"><RichText text={m.meta.caption} participants={participants} meId={meId} />{spacer}</div>}
        </>
      );
    }
    switch (m.kind) {
      case "image": return <><ImageThumb m={m} onOpen={(mm) => onAction("lightbox", mm)} />{m.meta?.caption && <div className="ms-text ms-text--caption"><RichText text={m.meta.caption} participants={participants} meId={meId} />{spacer}</div>}</>;
      case "file": return <><FileCard m={m} onOpen={(mm) => onAction("openFile", mm)} onDownload={(mm) => onAction("download", mm)} />{m.meta?.caption && <div className="ms-text"><RichText text={m.meta.caption} participants={participants} meId={meId} />{spacer}</div>}</>;
      case "audio": return <AudioPlayer m={m} />;
      case "poll": return <PollCard m={m} meId={meId} onVote={(mm, o) => onAction("vote", mm, o)} onVoters={(mm) => onAction("voters", mm)} />;
      case "location": return <LocationCard m={m} />;
      case "call": return <span className="ms-call"><Icon name="phone" size={14} /> {m.body || "Sesli arama"}{spacer}</span>;
      default: return <div className={`ms-text ${big ? `ms-text--emoji ms-text--emoji${big}` : ""}`}><RichText text={m.body} participants={participants} meId={meId} />{!big && spacer}</div>;
    }
  };

  return (
    <div className={`ms-row ${mine ? "is-mine" : ""} ${item.first ? "is-first" : ""} ${item.last ? "is-last" : ""} ${selecting ? "is-selecting" : ""} ${isSelected ? "is-selected" : ""} ${highlighted ? "is-highlight" : ""}`}
      data-mid={m.id || m.client_id} onClick={selecting ? () => onAction("select", album || m) : undefined} onContextMenu={(e) => menu(e, true)}>
      {selecting && <span className={`ms-check ${isSelected ? "is-on" : ""}`}>{isSelected && <Icon name="check" size={12} strokeWidth={3} />}</span>}
      {isGroup && !mine && <span className="ms-row__av">{item.last ? <Avatar name={m.sender?.name} id={m.sender?.user_id} url={m.sender?.avatar} size={28} /> : null}</span>}
      <div className="ms-bubble-wrap">
        <div className={`ms-bubble ${media ? "ms-bubble--media" : ""} ${big ? "ms-bubble--bare" : ""} ${m.kind === "audio" ? "ms-bubble--audio" : ""} ${m.kind === "poll" ? "ms-bubble--poll" : ""} ${m._failed ? "is-failed" : ""}`}>
          {showName && <div className="ms-sender" style={{ color: senderColor(m.sender?.user_id) }}>{m.sender?.name}{m.sender?.is_management ? <span className="ms-sender__tag">Yönetim</span> : null}</div>}
          {m.forwarded && !m.deleted && <div className="ms-fwd"><Icon name="forward" size={12} /> İletildi</div>}
          {m.reply_to && !m.deleted && (
            <button type="button" className="ms-quote" style={{ "--q": senderColor(m.reply_to.sender_name) }} onClick={(e) => { e.stopPropagation(); onAction("jump", m.reply_to.id); }}>
              <strong>{m.reply_to.sender_name || "Mesaj"}</strong>
              <span>{m.reply_to.body == null ? "Bu mesaj silindi" : quoteText(m.reply_to)}</span>
            </button>
          )}
          {body()}
          <span className={`ms-meta ${media && !m.meta?.caption ? "ms-meta--over" : ""}`}>
            {m.starred && <Icon name="star" size={10} strokeWidth={2.4} />}
            {m.edited_at && !m.deleted && <em>düzenlendi</em>}
            <span>{clockTime(m.created_at || Date.now())}</span>
            <Ticks status={status} />
          </span>
          {!selecting && !m.deleted && m.id && <button type="button" className="ms-bubble__chev" aria-label="Mesaj menüsü" onClick={(e) => menu(e, false)}><Icon name="chevronDown" size={14} strokeWidth={2.4} /></button>}
        </div>
        {!selecting && !m.deleted && m.id && <button type="button" className="ms-react-btn" title="Tepki ver" onClick={(e) => { e.stopPropagation(); onAction("react", m, anchorOf(e)); }}><Icon name="smile" size={16} /></button>}
        {m._failed && <button type="button" className="ms-retry" onClick={(e) => { e.stopPropagation(); onAction("retry", m); }}><Icon name="refresh" size={12} /> {m._error || "Gönderilemedi"} · yeniden dene</button>}
        {rs.total > 0 && (
          <button type="button" className={`ms-reacts ${rs.mine ? "is-mine" : ""}`} onClick={(e) => { e.stopPropagation(); onAction("reactions", m); }}>
            {rs.top.map((e) => <span key={e}>{e}</span>)}{rs.total > 1 && <b>{rs.total}</b>}
          </button>
        )}
      </div>
    </div>
  );
}

export const Bubble = memo(BubbleImpl);
