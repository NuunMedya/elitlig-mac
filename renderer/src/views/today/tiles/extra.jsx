// Ek bileşenler: yapışkan not / metin, bölüm başlığı, boşluk, görsel / logo, tarih kartı, kontrol
// listesi (yerel ve nottan), sabit not, tarayıcı araması, sabit video, etaplı hızlı görev, müzik
// listesi, tek tıkla muhasebe kaydı (ön ayar).
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { patch, post, tempId } from "../../../api";
import { useAppMusic } from "../../../music/MusicProvider";
import { refreshData, useData } from "../data";
import { parseAmountTr, parseLedgerPreset, runAction } from "../actions";
import { Big, List, Loading, Note, Row, State, XsButton } from "../parts";

const useNote = () => { const [n, setN] = useState(null); useEffect(() => { if (!n) return undefined; const t = setTimeout(() => setN(null), 3500); return () => clearTimeout(t); }, [n]); return [n, setN]; };

/* ──────────────── metin / başlık / boşluk / görsel / tarih ──────────────── */

export function TextTile({ tier, o, set, preview }) {
  const [text, setText] = useState(o.text || "");
  useEffect(() => { setText(o.text || ""); }, [o.text]);
  const save = () => { if (text !== (o.text || "")) set({ text }); };
  const style = { "--sticky": o.paper || "#fef3c7", fontSize: o.size === "l" ? 20 : o.size === "s" ? 12 : 14.5, textAlign: o.align || "left" };
  if (tier === "xs") return <div className="dt-sticky is-xs" style={style} title={text}>{text.slice(0, 18) || "Not"}</div>;
  if (preview || o.locked) return <div className="dt-sticky" style={style}>{text || "Yapışkan not"}</div>;
  return <textarea className="dt-sticky" style={style} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} placeholder="Buraya yaz… (bu bilgisayarda panoyla birlikte saklanır)" aria-label="Yapışkan not" />;
}

export function HeadingTile({ o, item }) {
  const text = o.text || item?.title || "Bölüm";
  return (
    <div className={`dt-heading is-${o.style || "line"}`} style={item?.accent ? { "--accent": item.accent } : undefined}>
      {o.icon ? <Icon name={o.icon} size={16} /> : null}<h2>{text}</h2>{o.sub ? <small>{o.sub}</small> : null}<span className="dt-heading__rule" aria-hidden="true" />
    </div>
  );
}

export const SpacerTile = ({ preview }) => <div className={`dt-spacer${preview ? " is-preview" : ""}`} aria-hidden="true" />;

export function ImageTile({ o, openSettings, tier }) {
  const src = String(o.src || "").trim();
  const ok = /^https?:\/\//i.test(src) || /^data:image\//i.test(src);
  if (!ok) return tier === "xs" ? <XsButton icon="image" label="Görsel" onClick={openSettings} /> : <div className="dt-empty"><Icon name="image" size={18} /><span>Görsel / logo adresi girin.</span><button type="button" className="btn btn--xs" onClick={openSettings}>Ayarla</button></div>;
  const img = <img src={src} alt={o.alt || ""} style={{ objectFit: o.fit || "contain" }} />;
  return <div className={`dt-image${o.bg === "dark" ? " is-dark" : o.bg === "none" ? " is-none" : ""}`}>{o.link ? <button type="button" onClick={() => runAction(o.link.includes(":") ? o.link : `web:${o.link}`, { go: () => {} })}>{img}</button> : img}</div>;
}

export function DateTile({ tier }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const start = new Date(now.getFullYear(), 0, 1);
  const dayNo = Math.floor((now - start) / 86400000) + 1;
  const week = Math.ceil((dayNo + ((start.getDay() + 6) % 7)) / 7);
  if (tier === "xs") return <div className="dt-date is-xs"><small>{now.toLocaleDateString("tr-TR", { month: "short" })}</small><b>{now.getDate()}</b></div>;
  return (
    <div className={`dt-date is-${tier}`}>
      <small>{now.toLocaleDateString("tr-TR", { weekday: "long" })}</small>
      <b>{now.getDate()}</b>
      <span>{now.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</span>
      {tier !== "s" && <em>{week}. hafta · yılın {dayNo}. günü</em>}
    </div>
  );
}

/* ──────────────── kontrol listeleri ──────────────── */

/** Yerel kontrol listesi (ör. maç günü): maddeler bileşenin ayarında saklanır; "Sıfırla" yeni gün için. */
export function ChecklistTile({ tier, o, set, lines }) {
  const items = useMemo(() => String(o.items || "").split("\n").map((s) => s.trim()).filter(Boolean), [o.items]);
  const done = new Set(Array.isArray(o.done) ? o.done : []);
  const [add, setAdd] = useState("");
  const toggle = (k) => { const next = new Set(done); if (next.has(k)) next.delete(k); else next.add(k); set({ done: [...next] }); };
  const n = items.filter((x) => done.has(x)).length;
  if (tier === "xs") return <XsButton icon="checks" value={`${n}/${items.length}`} label="liste" tone={n === items.length && items.length ? "green" : ""} />;
  if (tier === "s" && !lines) return <Big value={`${n}/${items.length}`} label="tamamlandı" />;
  return (
    <div className="dt-checklist">
      <div className="dt-checklist__head"><b>{n}/{items.length}</b><span className="dt-bar"><i style={{ width: `${items.length ? (n / items.length) * 100 : 0}%` }} /></span>
        <button type="button" className="link-btn" onClick={() => set({ done: [] })} title="Tüm işaretleri kaldır (yeni gün)">Sıfırla</button></div>
      <ul>
        {items.map((x) => <li key={x}><label><input type="checkbox" checked={done.has(x)} onChange={() => toggle(x)} /> <span className={done.has(x) ? "is-done" : ""}>{x}</span></label></li>)}
      </ul>
      {(tier === "l" || tier === "xl") && (
        <form className="dt-inline" onSubmit={(e) => { e.preventDefault(); if (add.trim()) { set({ items: [...items, add.trim()].join("\n") }); setAdd(""); } }}>
          <Icon name="plus" size={13} className="dt-inline__icon" /><input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Madde ekle" aria-label="Madde ekle" />
        </form>
      )}
    </div>
  );
}

/** Not defterindeki bir kontrol listesi: maddeleri buradan işaretle (sunucuya yazılır). */
export function NoteChecklistTile({ tier, o, go, result, lines }) {
  const q = useData("/api/tools/notes");
  const notes = (q.data?.items || []).filter((n) => (n.checklist || []).length);
  const note = notes.find((n) => String(n.id) === String(o.note)) || notes.find((n) => n.pinned) || notes[0];
  const [busy, setBusy] = useState(false);
  if (tier === "xs") return <XsButton icon="checks" value={note ? `${note.checklist.filter((c) => c.done).length}/${note.checklist.length}` : "–"} label={note?.title || "Liste"} onClick={() => note && go(`notes:${note.id}`)} />;
  if (!note) return <State q={q} empty="Kontrol listesi olan not yok. Not Defteri'nde liste oluşturun." emptyIcon="checks" />;
  const toggle = async (i) => {
    if (busy) return;
    setBusy(true);
    const checklist = note.checklist.map((c, k) => (k === i ? { ...c, done: !c.done } : c));
    q.setData((d) => ({ ...d, items: d.items.map((n) => (n.id === note.id ? { ...n, checklist } : n)) }));
    const res = await patch(`/api/tools/notes/${note.id}`, { checklist, ...(note.version ? { version: note.version } : {}) });
    setBusy(false);
    if (!result(res)) q.reload(); else refreshData("/api/tools/notes");
  };
  return (
    <div className="dt-checklist">
      <div className="dt-checklist__head"><button type="button" className="link-btn" onClick={() => go(`notes:${note.id}`)}><b>{note.title || "Liste"}</b></button><span className="dt-grow" /><small>{note.checklist.filter((c) => c.done).length}/{note.checklist.length}</small></div>
      <ul>{note.checklist.slice(0, Math.max(3, lines + 2)).map((c, i) => <li key={`${c.text}${i}`}><label><input type="checkbox" checked={Boolean(c.done)} disabled={busy} onChange={() => toggle(i)} /> <span className={c.done ? "is-done" : ""}>{c.text}</span></label></li>)}</ul>
    </div>
  );
}

export function PinnedNoteTile({ tier, o, go }) {
  const q = useData("/api/tools/notes");
  const list = q.data?.items || [];
  const note = list.find((n) => String(n.id) === String(o.note)) || list.find((n) => n.pinned) || list[0];
  if (tier === "xs") return <XsButton icon="pin" label={note?.title || "Not"} onClick={() => note && go(`notes:${note.id}`)} />;
  if (!note) return <State q={q} empty="Not yok." emptyIcon="note" />;
  return (
    <button type="button" className="dt-pinnote" onClick={() => go(`notes:${note.id}`)} style={note.color ? { "--sticky": note.color } : undefined}>
      <b>{note.emoji ? `${note.emoji} ` : ""}{note.title || "Not"}</b>
      {note.body && <p>{String(note.body).slice(0, tier === "s" ? 120 : 900)}</p>}
      {(note.checklist || []).length > 0 && <ul>{note.checklist.slice(0, 8).map((c, i) => <li key={i} className={c.done ? "is-done" : ""}>{c.done ? "☑" : "☐"} {c.text}</li>)}</ul>}
    </button>
  );
}

/* ──────────────── tarayıcı ──────────────── */

export function BrowserSearchTile({ tier, o, go }) {
  const [q, setQ] = useState("");
  const open = (e) => { e?.preventDefault(); if (!q.trim()) { go("browser"); return; } window.elitlig.browser?.cmd?.("newTab", { url: q.trim() }); go("browser"); setQ(""); };
  if (tier === "xs") return <XsButton icon="globe" label="Tarayıcı" title="Gömülü tarayıcı (⇧⌘B)" onClick={() => go("browser")} />;
  const quick = [["YouTube", "https://www.youtube.com"], ["Google", "https://www.google.com"], ["elitlig.com", "https://elitlig.com"], ["Haritalar", "https://maps.google.com"]];
  return (
    <div className="dt-stack">
      <form className="dt-inline" onSubmit={open}>
        <Icon name="search" size={14} className="dt-inline__icon" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={o.placeholder || "Ara ya da adres yaz…"} aria-label="Tarayıcıda ara" />
        <button type="submit" className="btn btn--xs btn--primary">Aç</button>
      </form>
      {tier !== "s" && <div className="dt-chips">{quick.map(([l, u]) => <button key={u} type="button" onClick={() => { window.elitlig.browser?.cmd?.("newTab", { url: u }); go("browser"); }}>{l}</button>)}</div>}
    </div>
  );
}

/** Videoyu tarayıcıda açıp kenara sabitler (resim içinde resim): YouTube izlerken başka sekmelerde gez. */
export function PinnedVideoTile({ tier, o, go, toast, openSettings }) {
  const url = String(o.url || "").trim();
  const ok = /^https?:\/\//i.test(url);
  const play = async () => {
    if (!ok) { openSettings(); return; }
    const id = await window.elitlig.browser?.cmd?.("newTab", { url });
    go("browser");
    if (id) setTimeout(() => window.elitlig.browser?.cmd?.("pin", { id, mode: o.mode === "dock" ? "dock" : "float" }), 1200);
    toast?.("Video açıldı ve kenara sabitleniyor.", { tone: "success", timeout: 2500 });
  };
  const yt = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{6,})/)?.[1];
  if (tier === "xs") return <XsButton icon="video" label={o.label || "Video"} onClick={play} />;
  return (
    <button type="button" className="dt-video" onClick={play} title={ok ? url : "Video adresi ayarlayın"}>
      {yt ? <img src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`} alt="" /> : <span className="dt-video__ph"><Icon name="video" size={28} /></span>}
      <span className="dt-video__play"><Icon name="play" size={18} /></span>
      <b>{o.label || (ok ? url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40) : "Video ayarlayın")}</b>
    </button>
  );
}

/* ──────────────── yapılacaklar: etaplı hızlı görev ──────────────── */

export function QuickTodoPhaseTile({ tier, o, result, go, bar }) {
  const projects = useData("/api/tools/projects", null, { ttl: 60000, enabled: tier !== "xs" });
  const list = (projects.data?.items || []).filter((p) => !p.archived && p.status !== "done" && p.status !== "cancelled");
  const [pid, setPid] = useState(o.project || "");
  const proj = list.find((p) => String(p.id) === String(pid)) || null;
  const detail = useData(proj ? `/api/tools/projects/${proj.id}` : null, null, { enabled: Boolean(proj), ttl: 60000 });
  const phases = (detail.data?.phases || detail.data?.item?.phases || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const [phase, setPhase] = useState(o.phase || "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useNote();
  if (tier === "xs") return <XsButton icon="checkSquare" label="Görev + etap" onClick={() => go("todos:new")} />;
  const add = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const body = { kind: "task", title: text.trim(), ...(proj ? { project_id: proj.id } : {}), ...(proj && phase ? { phase_name: phase } : {}), ...(!proj && phase ? { labels: [{ text: phase, color: "purple" }] } : {}) };
    const res = await post("/api/todos", body, { tempId: tempId() });
    setBusy(false);
    if (result(res)) { setText(""); setNote({ tone: "green", text: `Eklendi${proj ? ` · ${proj.name}` : ""}${phase ? ` › ${phase}` : ""}` }); refreshData("/api/todos"); window.dispatchEvent(new Event("elitlig:todos-changed")); }
  };
  return (
    <form className={`dt-stack dt-todophase${bar ? " is-bar" : ""}`} onSubmit={add}>
      <div className="dt-inline">
        <Icon name="plus" size={14} className="dt-inline__icon" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Görev yaz, proje ve etap seç" aria-label="Görev" />
        <button type="submit" className="btn btn--xs btn--primary" disabled={!text.trim() || busy}>Ekle</button>
      </div>
      {!bar && (
        <div className="dt-todophase__pick">
          <select value={pid} onChange={(e) => { setPid(e.target.value); setPhase(""); }} aria-label="Proje"><option value="">Projesiz (kişisel)</option>{list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {proj ? (
            <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Etap"><option value="">Etap: Askıda</option>{phases.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
          ) : (
            <input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="Etiket (isteğe bağlı)" aria-label="Etiket" />
          )}
        </div>
      )}
      <Note note={note} />
    </form>
  );
}

/* ──────────────── müzik listesi ──────────────── */

export function MusicListTile({ tier, go, lines }) {
  const mp = useAppMusic();
  if (!mp) return <XsButton icon="music" label="Müzik" onClick={() => go("music")} />;
  const playing = mp.now?.status === "playing";
  const cur = mp.now?.track || mp.now?.item || null;
  if (tier === "xs") return <XsButton icon={playing ? "pause" : "play"} label={cur?.title ? String(cur.title).slice(0, 16) : "Çal"} tone={playing ? "red" : ""} onClick={() => mp.toggle()} />;
  const tracks = mp.tracks || [];
  return (
    <div className="dt-stack">
      <div className="dt-musicbar">
        <button type="button" className="icon-btn" onClick={() => mp.prev()} aria-label="Önceki"><Icon name="skipBack" size={14} /></button>
        <button type="button" className="icon-btn is-main" onClick={() => mp.toggle()} aria-label={playing ? "Duraklat" : "Çal"}><Icon name={playing ? "pause" : "play"} size={16} /></button>
        <button type="button" className="icon-btn" onClick={() => mp.next()} aria-label="Sonraki"><Icon name="skip" size={14} /></button>
        <span className="dt-musicbar__now">{cur?.title || (tracks.length ? "Çalmıyor" : "Liste boş")}</span>
      </div>
      {tier !== "s" && (tracks.length ? (
        <List>{tracks.slice(0, Math.max(2, lines - 1)).map((t) => <Row key={t.id} icon={t.kind === "playlist" ? "list" : "music"} title={t.title || t.url} sub={t.kind === "playlist" ? `Çalma listesi · ${t.items?.length || ""} parça` : t.artist || ""} tone={cur?.id === t.id ? "blue" : ""} onClick={() => mp.play(t)} />)}</List>
      ) : <div className="dt-empty"><Icon name="music" size={16} /><span>Müzik listesi boş.</span><button type="button" className="btn btn--xs" onClick={() => go("music")}>Müzik ekle</button></div>)}
    </div>
  );
}

/* ──────────────── muhasebe ön ayarı ──────────────── */

/** Tek tıkla kayıt: "Saha kirası 2.500 ₺". Orta ve üstünde tutar / açıklama değiştirilebilir. */
export function LedgerPresetTile({ tier, o, go, toast, bar }) {
  const preset = parseLedgerPreset(o.preset || "");
  const [amount, setAmount] = useState(preset ? String(preset.amount) : "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  useEffect(() => { if (preset) setAmount(String(preset.amount)); }, [o.preset]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!preset) return <div className="dt-empty"><Icon name="receipt" size={16} /><span>Ön ayar geçersiz.</span></div>;
  const run = async () => {
    if (busy) return;
    const v = parseAmountTr(amount);
    if (!(v > 0)) return;
    setBusy(true);
    const spec = `ledger:${preset.type === "income" ? "gelir" : "gider"}|${v}|${preset.description || ""}|${preset.category || ""}|${preset.method}`;
    const res = await runAction(spec, { go, toast, post });
    setBusy(false);
    if (res.ok) { setDone((n) => n + 1); refreshData("/api/tools"); refreshData("/api/finance"); }
  };
  const label = `${preset.description || (preset.type === "income" ? "Gelir" : "Gider")}`;
  const val = `${preset.amount.toLocaleString("tr-TR")} ₺`;
  if (tier === "xs") return <XsButton icon={preset.type === "income" ? "arrowDown" : "receipt"} value={val} label={label} tone={preset.type === "income" ? "green" : ""} busy={busy} onClick={run} title={`${label} ${val}: tek tıkla ${preset.type === "income" ? "gelir" : "gider"} kaydı`} />;
  if (tier === "s" || bar) return <button type="button" className={`dt-preset is-${preset.type}`} onClick={run} disabled={busy}><Icon name={preset.type === "income" ? "arrowDown" : "receipt"} size={18} /><span><b>{label}</b><small>{val}{preset.category ? ` · ${preset.category}` : ""}</small></span>{done ? <em className="dt-badge">{done}</em> : null}</button>;
  return (
    <div className={`dt-preset is-${preset.type} is-form`}>
      <span className="dt-preset__head"><Icon name={preset.type === "income" ? "arrowDown" : "receipt"} size={18} /><b>{label}</b><small>{preset.category || ""}</small></span>
      <div className="dt-inline">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Tutar" />
        <span>₺</span>
        <button type="button" className="btn btn--xs btn--primary" onClick={run} disabled={busy || !(parseAmountTr(amount) > 0)}>{preset.type === "income" ? "Gelir ekle" : "Gider ekle"}</button>
      </div>
      <small className="dt-hint">{done ? `Bugün ${done} kez eklendi · ` : ""}{preset.method === "bank" ? "Banka" : preset.method === "card" ? "Kart" : "Nakit"} · bugünün tarihiyle</small>
    </div>
  );
}

export const LoadingTile = () => <Loading />;
