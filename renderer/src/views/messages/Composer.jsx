// Mesaj yazma alanı: emoji, ek menüsü (fotoğraf, belge, anket, konum),
// sesli mesaj kaydı, yanıt / düzenleme çubuğu, grupta @bahsetme önerisi,
// Enter gönderir / ⇧Enter yeni satır, sohbet başına taslak, yapıştırılan
// görseller, "yazıyor" bildirimi.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { Avatar, EmojiPicker, PointMenu, anchorOf, chatApi } from "./common";
import { extractMentions, formatDuration, insertMention, mentionQuery, quoteText } from "../../lib/chatUtils";

const TYPING_EVERY_MS = 2500;
const TYPING_IDLE_MS = 4000;

export default function Composer({ conv, meId, participants, draft, onDraft, reply, edit, onCancel, onSend, onSaveEdit, onFiles, onPoll, onLocation, onVoice, disabledReason }) {
  const [text, setText] = useState(() => (edit ? edit.body || "" : draft?.text || ""));
  const [emoji, setEmoji] = useState(null);
  const [attach, setAttach] = useState(null);
  const [mention, setMention] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [rec, setRec] = useState(null);
  const ref = useRef(null);
  const typing = useRef({ last: 0, timer: null });
  const recRef = useRef(null);
  const isGroup = conv.type === "group" || conv.type === "team";

  useEffect(() => { if (edit) { setText(edit.body || ""); setTimeout(() => ref.current?.focus(), 0); } }, [edit]);
  useEffect(() => { if (reply) ref.current?.focus(); }, [reply]);
  useEffect(() => { ref.current?.focus(); }, [conv.id]);
  // Taslak: düzenleme dışında yazılan metin sohbet başına saklanır.
  useEffect(() => { if (!edit) onDraft?.(text); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopTyping(), [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(150, el.scrollHeight)}px`;
  }, [text]);

  const others = useMemo(() => (participants || []).filter((p) => Number(p.user_id) !== Number(meId)), [participants, meId]);
  const suggestions = useMemo(() => {
    if (!mention || !isGroup) return [];
    const q = mention.query.toLocaleLowerCase("tr-TR");
    return others.filter((p) => !q || String(p.name).toLocaleLowerCase("tr-TR").includes(q)).slice(0, 6);
  }, [mention, others, isGroup]);

  const stopTyping = () => {
    if (typing.current.timer) clearTimeout(typing.current.timer);
    if (typing.current.last) chatApi().emit("chat:typing", { conversation_id: conv.id, typing: false });
    typing.current = { last: 0, timer: null };
  };
  const emitTyping = () => {
    const now = Date.now();
    if (now - typing.current.last > TYPING_EVERY_MS) { typing.current.last = now; chatApi().emit("chat:typing", { conversation_id: conv.id, typing: true }); }
    if (typing.current.timer) clearTimeout(typing.current.timer);
    typing.current.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const onChange = (e) => {
    setText(e.target.value);
    if (e.target.value) emitTyping();
    const q = isGroup ? mentionQuery(e.target.value, e.target.selectionStart) : null;
    setMention(q);
    setMentionIndex(0);
  };
  const pickMention = (p) => {
    const el = ref.current;
    const next = insertMention(text, mention.start, el.selectionStart, p.name);
    setText(next);
    setMention(null);
    setTimeout(() => { el.focus(); const at = mention.start + p.name.length + 2; el.setSelectionRange(at, at); }, 0);
  };
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (edit) onSaveEdit(value);
    else onSend(value, isGroup ? extractMentions(value, others) : []);
    setText("");
    setMention(null);
    stopTyping();
  };
  const onKeyDown = (e) => {
    if (suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(suggestions[mentionIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
    if (e.key === "Escape" && (reply || edit)) { e.preventDefault(); e.stopPropagation(); if (edit) setText(draft?.text || ""); onCancel(); }
    if (e.key === "ArrowUp" && !text && !edit) { e.preventDefault(); onCancel("editLast"); }
  };
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); onFiles(files); }
  };
  const insertEmoji = (em) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${em}${text.slice(end)}`;
    setText(next);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(start + em.length, start + em.length); }, 0);
  };

  /* ----------------------------- sesli mesaj ----------------------------- */
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      const state = { recorder, stream, chunks, startedAt: Date.now(), cancelled: false };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!state.cancelled && chunks.length) onVoice(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), Date.now() - state.startedAt);
      };
      recorder.start(250);
      recRef.current = state;
      setRec({ ...state, elapsed: 0 });
      emitTyping();
    } catch {
      setRec({ error: "Mikrofona erişilemedi. Sistem Ayarları → Gizlilik → Mikrofon'dan izin verin." });
      setTimeout(() => setRec(null), 4000);
    }
  };
  useEffect(() => {
    if (!rec?.recorder) return undefined;
    const t = setInterval(() => setRec((r) => (r ? { ...r, elapsed: Date.now() - r.startedAt } : r)), 250);
    return () => clearInterval(t);
  }, [rec?.recorder]);
  const stopRec = (cancel) => {
    const state = recRef.current;
    if (!state?.recorder) return;
    state.cancelled = cancel;
    state.recorder.stop();
    recRef.current = null;
    setRec(null);
    stopTyping();
  };

  if (disabledReason) return <div className="ms-composer ms-composer--off"><Icon name="lock" size={14} /> {disabledReason}</div>;

  return (
    <div className="ms-composer-wrap">
      {(reply || edit) && (
        <div className="ms-replybar">
          <span className="ms-replybar__line" />
          <div className="ms-replybar__text">
            <strong>{edit ? "Mesajı düzenle" : reply.sender?.is_me ? "Siz" : reply.sender?.name}</strong>
            <span>{quoteText(edit || reply)}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Vazgeç" onClick={() => { if (edit) setText(draft?.text || ""); onCancel(); }}><Icon name="x" /></button>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="ms-mentions" role="listbox">
          {suggestions.map((p, i) => (
            <button key={p.user_id} type="button" className={i === mentionIndex ? "is-active" : ""} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}>
              <Avatar name={p.name} id={p.user_id} url={p.avatar} size={26} /><strong>{p.name}</strong><small>{p.subtitle}</small>
            </button>
          ))}
        </div>
      )}
      {rec?.recorder ? (
        <div className="ms-composer ms-composer--rec">
          <button type="button" className="icon-btn" title="Kaydı sil" onClick={() => stopRec(true)}><Icon name="trash" /></button>
          <span className="ms-rec-dot" /><strong className="tabular">{formatDuration(rec.elapsed)}</strong>
          <span className="ms-rec-wave">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 6) * 0.12}s` }} />)}</span>
          <button type="button" className="ms-send" title="Gönder" onClick={() => stopRec(false)}><Icon name="send" size={18} strokeWidth={2.2} /></button>
        </div>
      ) : (
        <div className="ms-composer">
          <button type="button" className="icon-btn" title="Emoji" onClick={(e) => setEmoji(anchorOf(e))}><Icon name="smile" size={20} /></button>
          <button type="button" className="icon-btn" title="Ekle" onClick={(e) => setAttach(anchorOf(e))}><Icon name="paperclip" size={19} /></button>
          <textarea ref={ref} rows={1} value={text} onChange={onChange} onKeyDown={onKeyDown} onPaste={onPaste} onBlur={() => setTimeout(() => setMention(null), 150)}
            placeholder={rec?.error || "Bir mesaj yazın"} aria-label="Mesaj" spellCheck />
          {text.trim() || edit
            ? <button type="button" className="ms-send" title={edit ? "Kaydet" : "Gönder (Enter)"} onClick={submit}><Icon name={edit ? "check" : "send"} size={18} strokeWidth={2.2} /></button>
            : <button type="button" className="ms-send ms-send--mic" title="Sesli mesaj kaydet" onClick={startRec}><Icon name="mic" size={19} strokeWidth={2} /></button>}
        </div>
      )}
      {emoji && <EmojiPicker anchor={emoji} onClose={() => setEmoji(null)} onPick={insertEmoji} />}
      {attach && <PointMenu at={attach} onClose={() => setAttach(null)} items={[
        { label: "Fotoğraf", icon: "image", onClick: () => onFiles("images") },
        { label: "Belge", icon: "file", onClick: () => onFiles("files") },
        { label: "Anket", icon: "poll", onClick: onPoll },
        { label: "Konum", icon: "map", onClick: onLocation },
      ]} />}
    </div>
  );
}
