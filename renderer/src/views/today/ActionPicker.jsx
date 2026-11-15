// Ayar alanları: düğme eylemi seçici ("tür:hedef"), simge seçici, klasör / grup düğme düzenleyicisi,
// lig, not ve görsel seçicileri (TileSettings kullanır).
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { useData, useBridge } from "./data";
import {
  ACTION_KINDS, BROWSER_CMDS, COMMANDS, FOCUS_CMDS, HUB_ACTION_CHOICES, MUSIC_CMDS, NEW_ACTIONS, QUICK_KINDS, ROUTE_LIST, SHORTCUTS, TOOL_CHOICES,
  describeAction, formatAction, parseAction, parseButtonLines, parseLedgerPreset,
} from "./actions";

export const ICONS = ["zap", "star", "sun", "calendar", "checkSquare", "note", "receipt", "wallet", "bank", "trend", "target", "repeat", "ball", "trophy", "flag", "broadcast", "video", "camera", "image", "music", "play", "pause", "timer", "clock", "message", "send", "users", "user", "phone", "mail", "inbox", "bell", "layers", "briefcase", "box", "wrench", "folder", "download", "upload", "link", "globe", "external", "search", "copy", "clipboard", "grid", "list", "tag", "pin", "map", "calculator", "percent", "qr", "key", "lock", "shield", "coffee", "monitor", "activity", "command", "sparkles", "award", "team", "shirt", "handshake", "printer", "type", "palette", "droplet", "toolbox", "sliders", "help", "alert", "check", "plus"].filter(Boolean);

/** Türüne göre hedef seçenekleri ([değer, ad]). Serbest metinli türlerde null. */
function targetChoices(kind) {
  switch (kind) {
    case "route": return ROUTE_LIST.map(([k, l]) => [k, l]);
    case "tool": return TOOL_CHOICES.map(([k, l]) => [k, l]);
    case "act": return HUB_ACTION_CHOICES.map(([k, l]) => [k, l]);
    case "cmd": return COMMANDS.map((c) => [c.key, c.label]);
    case "new": return NEW_ACTIONS.map(([k, l]) => [k, l]);
    case "focus": return FOCUS_CMDS.map(([k, l]) => [k, l]);
    case "music": return MUSIC_CMDS.map(([k, l]) => [k, l]);
    case "quick": return QUICK_KINDS.map(([k, l]) => [k, l]);
    case "browser": return BROWSER_CMDS.map(([k, l]) => [k, l]);
    case "key": return SHORTCUTS.map(([k, l]) => [k, `${k} — ${l}`]);
    default: return null;
  }
}
const PLACEHOLDER = { web: "https://www.youtube.com/…", ext: "https://…", site: "/puan-durumu", copy: "Kopyalanacak metin (IBAN, adres, duyuru…)" };

function RecordPick({ kind, value, onChange }) {
  const path = { project: "/api/tools/projects", contact: "/api/tools/contacts", note: "/api/tools/notes", chat: "/api/chat/conversations", todo: "/api/todos" }[kind];
  const q = useData(path, kind === "todo" ? { view: "mine", status: "active" } : null, { ttl: 60000 });
  const list = kind === "chat" ? q.data?.conversations || [] : q.data?.items || [];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="Kayıt">
      <option value="">Seçin…</option>
      {list.slice(0, 300).map((x) => <option key={x.id} value={x.id}>{x.name || x.title || String(x.body || "").slice(0, 40) || `#${x.id}`}</option>)}
    </select>
  );
}

function LedgerFields({ value, onChange }) {
  const p = parseLedgerPreset(value) || { type: "expense", amount: "", description: "", category: "", method: "cash" };
  const [s, setS] = useState({ type: p.type, amount: p.amount || "", description: p.description || "", category: p.category || "", method: p.method || "cash" });
  const push = (next) => { setS(next); onChange(`${next.type === "income" ? "gelir" : "gider"}|${next.amount}|${next.description}|${next.category}|${next.method}`); };
  return (
    <div className="dt-ledgerpick">
      <select value={s.type} onChange={(e) => push({ ...s, type: e.target.value })} aria-label="Tür"><option value="expense">Gider</option><option value="income">Gelir</option></select>
      <input value={s.amount} onChange={(e) => push({ ...s, amount: e.target.value })} placeholder="Tutar" inputMode="decimal" aria-label="Tutar" />
      <input value={s.description} onChange={(e) => push({ ...s, description: e.target.value })} placeholder="Açıklama (ör. Saha kirası)" aria-label="Açıklama" />
      <input value={s.category} onChange={(e) => push({ ...s, category: e.target.value })} placeholder="Kategori" aria-label="Kategori" />
      <select value={s.method} onChange={(e) => push({ ...s, method: e.target.value })} aria-label="Yöntem"><option value="cash">Nakit</option><option value="bank">Banka</option><option value="card">Kart</option><option value="other">Diğer</option></select>
    </div>
  );
}

/** "tür:hedef" seçici: tür → hedef (liste ya da serbest metin). */
export function SpecField({ value, onChange }) {
  const cur = parseAction(value);
  const [kind, setKind] = useState(cur?.kind || "route");
  const [target, setTarget] = useState(cur?.target || "");
  useEffect(() => { const c = parseAction(value); if (c) { setKind(c.kind); setTarget(c.target); } }, [value]);
  const choices = targetChoices(kind);
  const set = (k, t) => { setKind(k); setTarget(t); if (t) onChange(formatAction(k, t)); };
  const d = describeAction(value);
  return (
    <div className="dt-specpick">
      <div className="dt-specpick__kinds" role="radiogroup" aria-label="Eylem türü">
        {ACTION_KINDS.map((k) => <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} className={kind === k.key ? "is-on" : ""} onClick={() => set(k.key, (targetChoices(k.key) || [])[0]?.[0] || "")} title={k.hint}><Icon name={k.icon} size={12} /> {k.label}</button>)}
      </div>
      {kind === "ledger" ? <LedgerFields value={target} onChange={(t) => set("ledger", t)} />
        : ["project", "contact", "note", "chat", "todo"].includes(kind) ? <RecordPick kind={kind} value={target} onChange={(t) => set(kind, t)} />
          : choices ? <select value={target} onChange={(e) => set(kind, e.target.value)} aria-label="Hedef">{choices.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            : <input value={target} onChange={(e) => set(kind, e.target.value)} placeholder={PLACEHOLDER[kind] || ""} aria-label="Hedef" />}
      <p className={`dt-specpick__now${d.valid ? "" : " is-bad"}`}><Icon name={d.icon} size={13} /> {d.valid ? `${d.label} · ${d.hint}` : "Eylem tamamlanmadı"}</p>
    </div>
  );
}

export function IconField({ value, onChange }) {
  return (
    <div className="dt-iconpick" role="radiogroup" aria-label="Simge">
      <button type="button" className={!value ? "is-on" : ""} onClick={() => onChange("")} title="Otomatik">A</button>
      {ICONS.map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? "is-on" : ""} onClick={() => onChange(n)} title={n}><Icon name={n} size={15} /></button>)}
    </div>
  );
}

/** Klasör / grup düğmeleri: satır ekle, sırala, kaldır; her satırda etiket + eylem + simge. */
export function ButtonsField({ value, onChange }) {
  const list = useMemo(() => parseButtonLines(value), [value]);
  const [open, setOpen] = useState(null);
  const write = (next) => onChange(next.map((b) => [b.label, b.spec, ...(b.icon ? [b.icon] : []), ...(b.color ? [b.color] : [])].join(" | ")).join("\n"));
  const upd = (i, patch) => write(list.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const move = (i, d) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; write(n); };
  return (
    <div className="dt-btnsedit">
      {list.map((b, i) => (
        <div key={i} className="dt-btnsedit__row">
          <span className="dt-btnsedit__ic"><Icon name={b.icon} size={14} /></span>
          <input value={b.label} onChange={(e) => upd(i, { label: e.target.value })} aria-label={`Düğme ${i + 1} etiketi`} />
          <button type="button" className="btn btn--xs" onClick={() => setOpen(open === i ? null : i)} title="Eylemi değiştir">{describeAction(b.spec).hint || "Eylem"}</button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => move(i, -1)} aria-label="Yukarı"><Icon name="chevronUp" size={12} /></button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => move(i, 1)} aria-label="Aşağı"><Icon name="chevronDown" size={12} /></button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => write(list.filter((_, k) => k !== i))} aria-label="Kaldır"><Icon name="x" size={12} /></button>
          {open === i && <div className="dt-btnsedit__spec"><SpecField value={b.spec} onChange={(spec) => upd(i, { spec, icon: describeAction(spec).icon })} /><IconField value={b.icon} onChange={(icon) => upd(i, { icon })} /></div>}
        </div>
      ))}
      <button type="button" className="btn btn--xs" onClick={() => { write([...list, { label: "Yeni düğme", spec: "route:today", icon: "sun" }]); setOpen(list.length); }}><Icon name="plus" size={11} /> Düğme ekle</button>
      <details className="dt-btnsedit__raw"><summary>Metin olarak düzenle</summary><textarea rows={6} value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="Düğmeler (metin)" /><small>Her satır: Etiket | eylem | simge | #renk — ör. “Saha kirası | ledger:gider|2500|Saha kirası|Saha”</small></details>
    </div>
  );
}

export function LeagueField({ value, onChange }) {
  const [res] = useBridge(() => window.elitlig?.widgets?.leagues?.(), null, []);
  const list = res?.leagues || [];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="Lig">
      <option value="">İlk lig</option>
      {list.map((l) => <option key={l.id} value={l.id}>{l.name}{l.city ? ` · ${l.city}` : ""}</option>)}
    </select>
  );
}

export function NoteField({ value, onChange }) {
  const q = useData("/api/tools/notes", null, { ttl: 60000 });
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="Not">
      <option value="">Otomatik</option>
      {(q.data?.items || []).map((n) => <option key={n.id} value={n.id}>{n.title || String(n.body || "Not").slice(0, 40)}</option>)}
    </select>
  );
}

/** Görsel: adres ya da bilgisayardan dosya (küçültülüp veri adresi olarak saklanır). */
export function ImageField({ value, onChange }) {
  const [err, setErr] = useState("");
  const pickFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 320 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL("image/webp", 0.8);
        if (url.length > 100000) url = c.toDataURL("image/jpeg", 0.5);
        if (url.length > 100000) { setErr("Görsel çok büyük; bir web adresi kullanın."); return; }
        setErr(""); onChange(url);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="dt-imgpick">
      <input value={/^data:/.test(value || "") ? "(dosyadan)" : value || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…/logo.png" aria-label="Görsel adresi" />
      <label className="btn btn--xs">Dosya seç<input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} /></label>
      {err && <small className="text-red">{err}</small>}
    </div>
  );
}
