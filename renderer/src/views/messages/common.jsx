// Mesajlar: ortak parçalar (avatar, tikler, imleçte açılan menü, emoji seçici).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui";
import { menuPosition } from "../../lib/menuUtils";
import { initials, mediaUrl, senderColor } from "../../lib/chatUtils";

export const chatApi = () => window.elitlig.chat;
export const C = "/api/chat";

export function Avatar({ name, url, id, size = 40, online = false, group = false, className = "" }) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? mediaUrl(url) : null;
  return (
    <span className={`ms-av ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38), "--av": senderColor(id ?? name) }}>
      {src ? <img src={src} alt="" onError={() => setBroken(true)} /> : group ? <Icon name="users" size={Math.round(size * 0.48)} strokeWidth={2} /> : initials(name)}
      {online && <i className="ms-av__dot" aria-label="çevrimiçi" />}
    </span>
  );
}

/** ✓ gönderildi · ✓✓ gri bazıları okudu · ✓✓ mavi okundu · saat bekliyor · ! gönderilemedi */
export function Ticks({ status }) {
  if (!status) return null;
  if (status === "pending") return <span className="ms-tick ms-tick--pending" title="Gönderilmeyi bekliyor"><Icon name="clock" size={12} strokeWidth={2.2} /></span>;
  if (status === "failed") return <span className="ms-tick ms-tick--failed" title="Gönderilemedi"><Icon name="alert" size={13} strokeWidth={2.2} /></span>;
  if (status === "sent") return <span className="ms-tick" title="Gönderildi"><Icon name="check" size={14} strokeWidth={2.4} /></span>;
  return <span className={`ms-tick ${status === "read" ? "ms-tick--read" : ""}`} title={status === "read" ? "Okundu" : "Bazı kişiler okudu"}><Icon name="checks" size={16} strokeWidth={2.2} /></span>;
}

/**
 * İmleçte (sağ tık) ya da bir düğmenin yanında açılan menü. items:
 * [{ label, icon, onClick, danger, hint }] | "-"; üstte isteğe bağlı içerik (emoji çubuğu).
 */
export function PointMenu({ at, items, onClose, header, align = "start" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const m = ref.current.getBoundingClientRect();
    const r = at.rect || { top: at.y, bottom: at.y, left: at.x, right: at.x };
    setPos(menuPosition(r, { width: m.width, height: m.height }, { width: window.innerWidth, height: window.innerHeight }, { align }));
  }, [at, align]);
  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="menu__list ms-pmenu" data-tool="messages" role="menu" style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: "hidden" }}>
      {header}
      {items.filter(Boolean).map((item, i) => (item === "-" ? <hr key={`hr${i}`} /> : (
        <button key={`${item.label}${i}`} type="button" role="menuitem" disabled={item.disabled} title={item.hint} className={item.danger ? "is-danger" : ""} onClick={() => { onClose(); item.onClick?.(); }}>
          {item.icon && <Icon name={item.icon} size={14} />}<span>{item.label}</span>
        </button>
      )))}
    </div>,
    document.body,
  );
}

const EMOJI_SETS = [
  ["Sık", ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🔥", "🎉", "✅", "⚽", "🏆"]],
  ["Yüzler", ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😊", "🙂", "😉", "😍", "🥰", "😘", "😎", "🤩", "🤔", "🤨", "😐", "😶", "🙄", "😏", "😴", "😌", "😜", "🤪", "😬", "😱", "😡", "🤯", "🥳", "🤗", "🤝", "😇", "🥺", "😤", "😭"]],
  ["Spor", ["⚽", "🥅", "🏟️", "🏆", "🥇", "🥈", "🥉", "🏅", "🎽", "👟", "🧤", "📣", "⏱️", "🟨", "🟥", "📅", "📍", "🚌"]],
  ["İşaret", ["👍", "👎", "👌", "✌️", "🤞", "👊", "💪", "🙌", "👋", "☝️", "👉", "👀", "💯", "❗", "❓", "⚠️", "✔️", "❌", "⭐", "💬", "📌", "📎", "📞", "💰"]],
];

/** Basit emoji seçici: son kullanılanlar + kategoriler. */
export function EmojiPicker({ onPick, onClose, anchor }) {
  const [recent] = useState(() => { try { return JSON.parse(localStorage.getItem("chat:emoji") || "[]"); } catch { return []; } });
  const pick = (e) => {
    try { localStorage.setItem("chat:emoji", JSON.stringify([e, ...recent.filter((x) => x !== e)].slice(0, 16))); } catch { /* yoksay */ }
    onPick(e);
  };
  const sets = recent.length ? [["Son kullanılanlar", recent], ...EMOJI_SETS] : EMOJI_SETS;
  return (
    <PointMenu at={anchor} onClose={onClose} items={[]} align="start" header={(
      <div className="ms-emoji" onMouseDown={(e) => e.preventDefault()}>
        {sets.map(([title, list]) => (
          <section key={title}>
            <h5>{title}</h5>
            <div>{list.map((e, i) => <button key={`${e}${i}`} type="button" onClick={() => pick(e)}>{e}</button>)}</div>
          </section>
        ))}
      </div>
    )} />
  );
}

export const anchorOf = (e) => ({ rect: e.currentTarget.getBoundingClientRect() });
export const pointOf = (e) => ({ x: e.clientX, y: e.clientY });

/** Dosyayı ana sürece gönderilecek biçime çevirir (Uint8Array). */
export async function fileToPayload(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  let width = null;
  let height = null;
  if (String(file.type).startsWith("image/")) {
    try { const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height; bmp.close?.(); } catch { /* ölçülemedi */ }
  }
  return { name: file.name || "dosya", mime: file.type || "", size: file.size, data, width, height };
}

export const isImageName = (name, mime) => /^image\//.test(mime || "") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name || "");
