// Zaman ve tarih: saat dilimi dönüştürücü, kronometre (tur), çoklu geri sayım. Mantık: ../lib/misc.js.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { useCopy, useStored } from "../toolkitUi";
import { ZONES, zoneLabel } from "../worldClock";
import { countdown } from "../dateTools";
import { fmtStopwatch, inZone, lapRows, zonedToUtc } from "../lib/misc";
import { ExportBar, Field, Table } from "./common";

const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul"; } catch { return "Europe/Istanbul"; } };
const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function useTick(ms = 1000, on = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return undefined; const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms, on]);
  return now;
}

/* ------------------------------- saat dilimi ------------------------------- */

export function TimezoneTool() {
  const copy = useCopy();
  const [from, setFrom] = useStored("tt.tz.from", localTz());
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState(() => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; });
  const [targets, setTargets] = useStored("tt.tz.targets", ["Europe/London", "America/New_York", "Asia/Dubai", "Asia/Tokyo"]);
  const [add, setAdd] = useState("");
  const utc = zonedToUtc(date, time, from);
  const fromDay = utc != null ? inZone(utc, from).dayKey : null;
  const lines = utc == null ? [] : [from, ...targets.filter((t) => t !== from)].map((tz) => ({ tz, ...inZone(utc, tz) }));
  const text = lines.map((l) => `${zoneLabel(l.tz)}: ${l.time} (${l.date})`).join("\n");
  return (
    <div className="tt">
      <div className="tt-cols3">
        <Field label="Kaynak dilim"><select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Kaynak saat dilimi">{ZONES.map((z) => <option key={z.tz} value={z.tz}>{z.label}</option>)}{!ZONES.some((z) => z.tz === from) && <option value={from}>{zoneLabel(from)}</option>}</select></Field>
        <Field label="Tarih"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tarih" /></Field>
        <Field label="Saat"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Saat" /></Field>
      </div>
      <div className="tt-zones" aria-label="Dönüşüm">
        {lines.map((l) => (
          <div key={l.tz} className="tt-zone">
            <span><strong>{zoneLabel(l.tz)}</strong> <small>{l.date}{l.dayKey !== fromDay ? (l.dayKey > fromDay ? " · ertesi gün" : " · önceki gün") : ""}</small></span>
            <b>{l.time}</b>
            {l.tz !== from ? <button type="button" className="icon-btn icon-btn--xs" onClick={() => setTargets(targets.filter((t) => t !== l.tz))} aria-label={`${zoneLabel(l.tz)} kaldır`}><Icon name="x" size={12} /></button> : <span className="tt-muted">kaynak</span>}
          </div>
        ))}
      </div>
      <div className="tt-row">
        <select value={add} onChange={(e) => { if (e.target.value) setTargets([...new Set([...targets, e.target.value])]); setAdd(""); }} aria-label="Dilim ekle"><option value="">+ Şehir ekle</option>{ZONES.filter((z) => !targets.includes(z.tz)).map((z) => <option key={z.tz} value={z.tz}>{z.label}</option>)}</select>
        <button type="button" className="btn btn--sm" onClick={() => copy(text, "Saatler kopyalandı")}><Icon name="copy" size={12} /> Kopyala</button>
      </div>
      <p className="tt-muted">Yaz saati geçişleri dahil (sistem saat dilimi veritabanı).</p>
    </div>
  );
}

/* ------------------------------- kronometre ------------------------------- */

export function StopwatchTool() {
  const [st, setSt] = useStored("tt.sw", { running: false, startedAt: 0, base: 0, laps: [] });
  const now = useTick(47, st.running);
  const elapsed = st.base + (st.running ? now - st.startedAt : 0);
  const toggle = () => setSt((s) => (s.running ? { ...s, running: false, base: s.base + Date.now() - s.startedAt } : { ...s, running: true, startedAt: Date.now() }));
  const lap = () => setSt((s) => ({ ...s, laps: [...s.laps, s.base + (s.running ? Date.now() - s.startedAt : 0)] }));
  const reset = () => setSt({ running: false, startedAt: 0, base: 0, laps: [] });
  const laps = lapRows(st.laps);
  return (
    <div className="tt">
      <div className="tt-sw" aria-label="Kronometre" aria-live="off">{fmtStopwatch(elapsed)}</div>
      <div className="tt-row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn btn--primary" onClick={toggle}><Icon name={st.running ? "pause" : "play"} size={13} /> {st.running ? "Durdur" : elapsed ? "Devam" : "Başlat"}</button>
        <button type="button" className="btn" onClick={lap} disabled={!st.running}><Icon name="flag" size={13} /> Tur</button>
        <button type="button" className="btn" onClick={reset} disabled={!elapsed}>Sıfırla</button>
      </div>
      {laps.length > 0 && (<>
        <Table rows={[["Tur", "Süre", "Toplam"], ...[...laps].reverse().map((l) => [l.no, fmtStopwatch(l.lap), fmtStopwatch(l.total)])]} highlight={(r) => { const l = laps[r[0] - 1]; return l?.best ? "is-best" : l?.worst ? "is-worst" : ""; }} />
        <ExportBar title="Kronometre turları" rows={() => [["Tur", "Süre", "Toplam"], ...laps.map((l) => [l.no, fmtStopwatch(l.lap), fmtStopwatch(l.total)])]} />
      </>)}
      <p className="tt-muted">Pencere kapansa da kaldığı yerden sürer. Odak Sayacı'ndan bağımsızdır.</p>
    </div>
  );
}

/* ------------------------------- çoklu geri sayım ------------------------------- */

export function CountdownsTool() {
  const [items, setItems] = useStored("tt.countdowns", []);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState("20:00");
  const now = useTick(1000);
  const sorted = useMemo(() => [...items].sort((a, b) => a.at - b.at), [items]);
  const addItem = (e) => {
    e.preventDefault();
    const [y, mo, d] = date.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    const at = new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
    if (!Number.isFinite(at)) return;
    setItems([...items, { id: `${Date.now()}`, title: title.trim() || "Etkinlik", at }]);
    setTitle("");
  };
  return (
    <div className="tt">
      <form className="tt-row" onSubmit={addItem}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ad: Final maçı, kayıt son günü…" aria-label="Geri sayım adı" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tarih" style={{ flex: "0 0 auto" }} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Saat" style={{ flex: "0 0 auto" }} />
        <button type="submit" className="btn btn--sm btn--primary"><Icon name="plus" size={12} /> Ekle</button>
      </form>
      {!sorted.length && <p className="tt-muted">Henüz geri sayım yok. Maç, son başvuru, organizasyon günü ekleyin.</p>}
      <div className="tt-cds" aria-label="Geri sayımlar">
        {sorted.map((it) => {
          const c = countdown(it.at, now);
          const done = it.at <= now;
          return (
            <div key={it.id} className={`tt-cd${done ? " is-done" : ""}`}>
              <span><strong>{it.title}</strong><small>{new Date(it.at).toLocaleString("tr-TR", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</small></span>
              <b>{done ? "Geldi ✓" : `${c.days ? `${c.days} g ` : ""}${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`}</b>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setItems(items.filter((x) => x.id !== it.id))} aria-label={`${it.title} sil`}><Icon name="x" size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
