// Hızlı kayıt penceresi (⌃⌥N): hangi uygulamada olursanız olun açılır.
// Görev, not, etkinlik ya da gider tek satırda kaydedilir.
import React, { useEffect, useRef, useState } from "react";
import { Icon, Kbd, Segmented, useToast } from "../components/ui";
import { get, post, tempId } from "../api";
import { notebookTree, quickNote } from "../lib/noteCore";
import { isoDay, parseQuickTask, formatDate, formatTime } from "../lib/helpers";
import { parseAmount } from "../lib/ledgerUtils";

const KINDS = [
  { value: "task", label: "Görev", icon: "checkSquare" },
  { value: "note", label: "Not", icon: "note" },
  { value: "event", label: "Etkinlik", icon: "calendar" },
  { value: "expense", label: "Gider", icon: "receipt" },
];

const PLACEHOLDER = {
  task: "örn. yarın 14:00 sahayı ara !",
  note: "Aklınıza geleni yazın… İlk satır başlık olur; #etiket, - [ ] yapılacak yazabilirsiniz.",
  event: "örn. cuma 20:30 Hakem toplantısı",
  expense: "örn. 1.250 hakem ücreti",
};

export default function Quick() {
  const toast = useToast();
  const [kind, setKind] = useState("task");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const ref = useRef(null);
  const [notebooks, setNotebooks] = useState([]);
  const [notebook, setNotebook] = useState(() => { try { return localStorage.getItem("quick:notebook") || ""; } catch { return ""; } });
  useEffect(() => {
    if (kind !== "note" || !signedIn) return;
    get("/api/tools/notes/notebooks").then((r) => { if (r.ok) setNotebooks(notebookTree(r.data.items || [])); });
  }, [kind, signedIn]);
  const pickNotebook = (value) => { setNotebook(value); try { localStorage.setItem("quick:notebook", value); } catch { /* yoksay */ } };

  useEffect(() => {
    window.elitlig.auth.state().then((s) => setSignedIn(s.signedIn));
    return window.elitlig.quick.onOpen(({ kind: k }) => {
      if (k) setKind(k);
      window.elitlig.auth.state().then((s) => setSignedIn(s.signedIn));
      setTimeout(() => ref.current?.focus(), 30);
    });
  }, []);
  useEffect(() => { ref.current?.focus(); }, [kind]);

  const close = () => { setText(""); window.elitlig.quick.hide(); };
  const parsed = kind === "task" || kind === "event" ? parseQuickTask(text) : null;

  const save = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    let res;
    if (kind === "task") {
      res = await post("/api/todos", { kind: parsed.dueAt ? "reminder" : "task", title: parsed.title || value, due_at: parsed.dueAt, priority: parsed.priority }, { tempId: tempId() });
    } else if (kind === "note") {
      // İlk satır başlık; #etiketler etiket olur; seçili deftere kaydedilir.
      const note = quickNote(value);
      res = await post("/api/tools/notes", { ...note, notebook_id: notebook ? Number(notebook) : null }, { tempId: tempId() });
    } else if (kind === "event") {
      const start = parsed.dueAt ? new Date(parsed.dueAt) : new Date(Date.now() + 3600000);
      res = await post("/api/tools/events", { title: parsed.title || value, start_at: start.toISOString(), end_at: new Date(start.getTime() + 3600000).toISOString(), all_day: false, category: "general", remind_minutes: 30 }, { tempId: tempId() });
    } else {
      const m = value.match(/^([\d.,]+)\s*(?:tl|₺)?\s*(.*)$/i);
      const amount = m ? parseAmount(m[1]) : 0;
      if (!amount) { setBusy(false); toast("Tutarı başa yazın: örn. 1.250 hakem ücreti", { tone: "error" }); return; }
      res = await post("/api/tools/ledger", { type: "expense", amount, description: m[2] || null, entry_date: isoDay(), status: "paid", method: "cash", vat_rate: 0 }, { tempId: tempId() });
    }
    setBusy(false);
    if (!res.ok) { toast(res.error?.message || "Kaydedilemedi.", { tone: "error" }); return; }
    toast(res.queued ? "Çevrimdışı kaydedildi; bağlantı gelince eşitlenecek." : "Kaydedildi.", { tone: "success" });
    setText("");
    setTimeout(close, 600);
  };

  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && (kind !== "note" || (e.metaKey || e.ctrlKey))) { e.preventDefault(); save(); }
    if ((e.metaKey || e.ctrlKey) && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); setKind(KINDS[Number(e.key) - 1].value); }
  };

  if (!signedIn) {
    return (
      <div className="quick">
        <p className="quick__signin">Hızlı kayıt için önce uygulamada giriş yapın.</p>
        <button type="button" className="btn btn--primary" onClick={() => { window.elitlig.app.showMain(); close(); }}>Uygulamayı aç</button>
      </div>
    );
  }

  return (
    <div className="quick" onKeyDown={onKey}>
      <div className="quick__head">
        <Segmented value={kind} onChange={setKind} options={KINDS} size="sm" ariaLabel="Kayıt türü" />
        <span className="quick__hint"><Kbd>⌘1–4</Kbd> tür · <Kbd>{kind === "note" ? "⌘↩" : "↩"}</Kbd> kaydet · <Kbd>esc</Kbd></span>
      </div>
      {kind === "note" ? (
        <textarea ref={ref} className="quick__input quick__input--multi" value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER.note} rows={4} />
      ) : (
        <input ref={ref} className="quick__input" value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER[kind]} />
      )}
      <div className="quick__foot">
        <span className="muted">
          {parsed?.dueAt && <><Icon name="clock" size={13} /> {formatDate(parsed.dueAt, { weekday: "long", day: "numeric", month: "long" })} {formatTime(parsed.dueAt)}</>}
          {parsed?.priority === "high" && <span className="pill pill--red">Yüksek öncelik</span>}
          {kind === "expense" && "Bugünün tarihiyle, nakit ödendi olarak kaydedilir."}
          {kind === "note" && (
            <>
              <select className="select-sm" value={notebook} onChange={(e) => pickNotebook(e.target.value)} aria-label="Defter">
                <option value="">Defter yok</option>
                {notebooks.map((nb) => <option key={nb.id} value={nb.id}>{`${"  ".repeat(nb.depth)}${nb.emoji ? `${nb.emoji} ` : ""}${nb.name}`}</option>)}
              </select>
              {quickNote(text).tags.length > 0 && <span className="quick__tags">{quickNote(text).tags.map((t) => `#${t}`).join(" ")}</span>}
            </>
          )}
        </span>
        <button type="button" className="btn btn--primary btn--sm" disabled={!text.trim() || busy} onClick={save}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </div>
    </div>
  );
}
