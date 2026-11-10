// Masaüstü widget'ı (#widget=<tür>&id=<kimlik>): çerçevesiz, şeffaf küçük pencere. Ana süreç
// app/widgets/index.js. Üst şerit sürükleme alanıdır (kilitliyken değil); ⋯ ya da sağ tık: ayarlar.
// Yeni widget gövdeleri ./bodies/*; ortak parçalar ./common.jsx; saf hesaplar ./widgetModel.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { clock as fmtSec, isPlayingStatus } from "../music/musicApp";
import { formatClock } from "../lib/helpers";
import { ZONES, diffLabel, normalizeZones, zoneLabel, zoneNow } from "../views/toolkit/worldClock";
import { CURRENCIES } from "../views/toolkit/units";
import { Err, NeedSession, W, dayStart, usePoll, useSignedIn } from "./common";
import { MessagesWidget, RequestsWidget } from "./bodies/comm";
import { ContactsWidget, EquipmentWidget, LedgerWidget, PinnedNotesWidget, ProjectsWidget, QuickAddWidget, TodayWidget, TodosWidget } from "./bodies/work";
import { FocusWidget, MonthWidget, WeekWidget } from "./bodies/time";
import { LiveMatchWidget, StandingsWidget } from "./bodies/sport";
import { DockWidget, LauncherWidget, StudioWidget } from "./bodies/access";
import "./widgets.css";

export const LABELS = {
  clock: "Saat", agenda: "Ajanda", todos: "Yapılacaklar", note: "Karalama", music: "Müzik", clipboard: "Pano", timer: "Sayaç", system: "Sistem", weather: "Hava durumu", matches: "Maçlar", rates: "Döviz",
  messages: "Mesajlar", requests: "Talepler", projects: "Projeler", ledger: "Muhasebe", equipment: "Ekipman", today: "Bugün", contacts: "Rehber", notes: "Sabit notlar", quickadd: "Hızlı kayıt",
  focus: "Odak", week: "Bu hafta", month: "Takvim", livematch: "Canlı maç", standings: "Puan durumu", studio: "Yayın Stüdyosu", launcher: "Başlatıcı", dock: "Araçlar",
};
export const ICONS = {
  clock: "clock", agenda: "calendar", todos: "checkSquare", note: "note", music: "music", clipboard: "clipboard", timer: "timer", system: "activity", weather: "sun", matches: "ball", rates: "swap",
  messages: "message", requests: "inbox", projects: "layers", ledger: "wallet", equipment: "box", today: "sun", contacts: "users", notes: "pin", quickadd: "zap",
  focus: "target", week: "calendar", month: "calendar", livematch: "ball", standings: "trophy", studio: "broadcast", launcher: "grid", dock: "toolbox",
};

/* ------------------------------ saat ------------------------------ */

function ClockWidget({ item, size, settings, update }) {
  const [now, setNow] = useState(() => new Date());
  const sec = item.options.seconds;
  useEffect(() => { const t = setInterval(() => setNow(new Date()), sec ? 1000 : 5000); return () => clearInterval(t); }, [sec]);
  const zones = normalizeZones(item.options.zones || []);
  const local = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Istanbul"; } })();
  if (settings) {
    return (
      <div className="wg-settings">
        <label className="wg-check"><input type="checkbox" checked={sec} onChange={(e) => update({ options: { seconds: e.target.checked } })} /> Saniyeyi göster</label>
        <p className="wg-muted">Dünya saatleri (orta boyutta görünür, en çok 4):</p>
        <div className="wg-zones">{ZONES.filter((z) => z.tz !== local).map((z) => (
          <label key={z.tz} className="wg-check"><input type="checkbox" checked={zones.includes(z.tz)} disabled={!zones.includes(z.tz) && zones.length >= 4}
            onChange={(e) => update({ options: { zones: e.target.checked ? [...zones, z.tz] : zones.filter((x) => x !== z.tz) } })} /> {z.label}</label>
        ))}</div>
      </div>
    );
  }
  return (
    <div className="wg-clock">
      <div className="wg-clock__time">{now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", ...(sec ? { second: "2-digit" } : {}) })}</div>
      <div className="wg-clock__date">{now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</div>
      {size === "medium" && zones.length > 0 && (
        <ul className="wg-zonelist">{zones.map((tz) => { const z = zoneNow(tz, now); return <li key={tz}><Icon name={z.night ? "moon" : "sun"} size={11} /><span>{zoneLabel(tz)}</span><small>{diffLabel(tz, local, now)}</small><b>{z.time}</b></li>; })}</ul>
      )}
    </div>
  );
}

/* ------------------------------ ajanda ------------------------------ */

function AgendaWidget({ size }) {
  const signed = useSignedIn();
  const q = usePoll(async () => {
    if (!signed) return null;
    const now = new Date();
    const res = await W().request({ path: "/api/tools/events", query: { from: dayStart(now).toISOString(), to: dayStart(now, 2).toISOString(), todos: "0" } });
    if (!res.ok) throw new Error(res.error?.message || "Ajanda alınamadı.");
    return res.data;
  }, 5 * 60000, [signed]);
  useEffect(() => W().onDataChanged?.((p) => { if (String(p?.path || "").includes("/events")) q.reload(); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (signed === false) return <NeedSession />;
  if (q.error && !q.data) return <Err text={q.error} onRetry={q.reload} />;
  const items = [...(q.data?.items || []), ...(q.data?.projects || []).filter((p) => p.occurrence_start || p.start_at)];
  const startOf = (it) => new Date(it.occurrence_start || it.start_at);
  const today = dayStart(new Date());
  const groups = [["Bugün", 0], ["Yarın", 1]].map(([label, n]) => ({
    label,
    items: items.filter((it) => { const s = startOf(it); return s >= dayStart(today, n) && s < dayStart(today, n + 1); }).sort((a, b) => (a.all_day === b.all_day ? startOf(a) - startOf(b) : a.all_day ? -1 : 1)),
  }));
  const max = size === "medium" ? 7 : 4;
  return (
    <div className="wg-list">
      {groups.map((g) => (
        <section key={g.label}>
          <h5>{g.label}{g.label === "Bugün" ? ` · ${today.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}` : ""}</h5>
          {g.items.length ? g.items.slice(0, max).map((it) => (
            <button key={`${it.id}-${it.occurrence_start || it.start_at}`} type="button" className="wg-row" onClick={() => W().widgets.open("agenda")}>
              <span className="wg-row__time">{it.all_day ? "Gün boyu" : startOf(it).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="wg-row__text">{it.title}</span>
            </button>
          )) : <p className="wg-muted">{q.loading ? "Yükleniyor…" : "Plan yok"}</p>}
          {g.items.length > max && <p className="wg-muted">+{g.items.length - max} etkinlik daha</p>}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------ not ------------------------------ */

const stripMd = (s) => String(s || "").replace(/[#*_`>[\]-]+/g, " ").replace(/\s+/g, " ").trim();
function NoteWidget({ item, size, update }) {
  const [text, setText] = useState(item.options.text || "");
  const timer = useRef(null);
  const signed = useSignedIn();
  const q = usePoll(async () => {
    if (!signed || size !== "medium") return null;
    const res = await W().request({ path: "/api/tools/notes", query: { view: "all" } });
    return res.ok ? (res.data?.items || []).slice().sort((a, b) => String(b.updatedAt || b.updated_at || "").localeCompare(String(a.updatedAt || a.updated_at || ""))).slice(0, 3) : null;
  }, 5 * 60000, [signed, size]);
  useEffect(() => { setText(item.options.text || ""); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v) => {
    setText(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ options: { text: v } }), 600);
  };
  return (
    <div className="wg-note">
      <textarea value={text} onChange={(e) => change(e.target.value)} placeholder="Karalama… (bu bilgisayarda saklanır)" aria-label="Karalama" />
      {size === "medium" && q.data?.length > 0 && (
        <ul className="wg-notes">{q.data.map((n) => <li key={n.id}><button type="button" onClick={() => W().widgets.open(`notes:${n.id}`)}>{n.title || stripMd(n.body).slice(0, 40) || "Not"}</button></li>)}</ul>
      )}
      <div className="wg-bar">
        <button type="button" className="wg-btn" onClick={() => W().quick.show("note")}><Icon name="plus" size={11} /> Yeni not</button>
        {signed && <button type="button" className="wg-btn is-ghost" onClick={() => W().widgets.open("notes")}>Not Defteri</button>}
        {text && <button type="button" className="wg-btn is-ghost" onClick={() => navigator.clipboard.writeText(text)} title="Kopyala"><Icon name="copy" size={11} /></button>}
      </div>
    </div>
  );
}

/* ------------------------------ müzik ------------------------------ */

function MusicWidget({ size }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    W().music?.state().then(setS).catch(() => {});
    return W().music?.onState(setS);
  }, []);
  const cmd = (n) => W().music.command(n);
  const playing = isPlayingStatus(s?.status);
  const has = s && (s.trackCount > 0 || s.status !== "idle");
  return (
    <div className={`wg-music${playing ? " is-playing" : ""}`}>
      <div className="wg-music__info">
        <span className="wg-music__disc"><Icon name="music" size={16} /></span>
        <span><strong>{!has ? "Müzik listesi boş" : s.status === "idle" ? "Çalmaya hazır" : s.title || "Parça"}</strong>
          <small>{!has ? "Müzik görünümünden ekleyin" : s.status === "idle" ? `${s.trackCount} giriş` : s.status === "paused" ? "Duraklatıldı" : `${fmtSec(s.elapsedSec)}${s.lengthSec ? ` / ${fmtSec(s.lengthSec)}` : ""}`}</small></span>
      </div>
      {size === "medium" && s?.lengthSec ? <div className="wg-progress"><i style={{ width: `${Math.min(100, (s.elapsedSec / s.lengthSec) * 100)}%` }} /></div> : null}
      <div className="wg-music__ctl">
        <button type="button" className="wg-ib" onClick={() => cmd("prev")} disabled={!has} aria-label="Önceki"><Icon name="skipBack" size={14} /></button>
        <button type="button" className="wg-ib is-main" onClick={() => (has ? cmd("toggle") : cmd("show"))} aria-label={playing ? "Duraklat" : "Çal"}><Icon name={playing ? "pause" : "play"} size={15} strokeWidth={2.4} /></button>
        <button type="button" className="wg-ib" onClick={() => cmd("next")} disabled={!has} aria-label="Sonraki"><Icon name="skip" size={14} /></button>
        <button type="button" className="wg-ib" onClick={() => cmd("show")} aria-label="Müzik görünümü" title="Müzik görünümü"><Icon name="external" size={13} /></button>
      </div>
    </div>
  );
}

/* ------------------------------ pano ------------------------------ */

function ClipboardWidget({ size }) {
  const shelf = W().shelf;
  const [items, setItems] = useState(null);
  const [copied, setCopied] = useState(null);
  const load = useCallback(() => shelf?.list({}, { limit: size === "medium" ? 7 : 4 }).then((r) => setItems(r?.ok ? r.items : [])).catch(() => setItems([])), [shelf, size]);
  useEffect(() => { load(); const off = shelf?.onChange?.(() => load()); return off; }, [load, shelf]);
  if (!shelf) return <Err text="Pano rafı bu sürümde yok." />;
  const copy = async (it) => { const r = await shelf.copy([it.id]); if (r?.ok) { setCopied(it.id); setTimeout(() => setCopied(null), 1200); } };
  return (
    <div className="wg-list">
      {items?.length ? items.map((it) => (
        <button key={it.id} type="button" className={`wg-clip${copied === it.id ? " is-copied" : ""}`} onClick={() => copy(it)} title="Tıkla: yeniden kopyala">
          {it.kind === "image" && it.thumbUrl ? <img src={it.thumbUrl} alt="" /> : <Icon name={it.kind === "link" ? "link" : "type"} size={13} />}
          <span className="wg-row__text">{copied === it.id ? "Kopyalandı ✓" : it.kind === "image" ? (it.title || "Ekran görüntüsü") : it.kind === "link" ? (it.title || it.url) : String(it.text || "").replace(/\s+/g, " ").slice(0, 120)}</span>
        </button>
      )) : <p className="wg-muted">{items ? "Henüz kopyalanan yok (pano izleme Raflar ayarlarında)." : "Yükleniyor…"}</p>}
      <div className="wg-bar">
        <button type="button" className="wg-btn" onClick={() => shelf.show()}><Icon name="clipboard" size={11} /> Raflar</button>
        <button type="button" className="wg-btn is-ghost" onClick={() => shelf.capture()}><Icon name="camera" size={11} /> Yakala</button>
      </div>
    </div>
  );
}

/* ------------------------------ sayaç ------------------------------ */

function TimerWidget({ size }) {
  const focus = W().focus;
  const [s, setS] = useState(null);
  useEffect(() => { focus.state().then(setS); return focus.onState(setS); }, [focus]);
  const cmd = (n, a) => focus.command(n, a).then(setS);
  const startTimer = async (min) => { await focus.command("mode", { mode: "timer" }); await focus.command("settings", { timer: min }); cmd("start"); };
  const ms = s ? (s.mode === "stopwatch" ? s.elapsedMs : s.remainingMs) : 0;
  const label = s ? (s.mode === "stopwatch" ? "Kronometre" : s.mode === "timer" ? "Zamanlayıcı" : s.phase === "focus" ? "Odak" : "Mola") : "";
  return (
    <div className={`wg-timer${s?.running ? " is-on" : ""}`}>
      <small>{label}</small>
      <strong>{formatClock(ms)}</strong>
      <div className="wg-bar is-center">
        <button type="button" className="wg-ib is-main" onClick={() => cmd("toggle")} aria-label={s?.running ? "Duraklat" : "Başlat"}><Icon name={s?.running ? "pause" : "play"} size={14} strokeWidth={2.4} /></button>
        <button type="button" className="wg-ib" onClick={() => cmd("reset")} aria-label="Sıfırla"><Icon name="rotate" size={13} /></button>
      </div>
      {size === "medium" && <div className="wg-bar is-center">{[5, 15, 25, 45].map((m) => <button key={m} type="button" className="wg-btn is-ghost" onClick={() => startTimer(m)}>{m} dk</button>)}</div>}
    </div>
  );
}

/* ------------------------------ sistem ------------------------------ */

const gb = (b) => `${(b / 1073741824).toLocaleString("tr-TR", { maximumFractionDigits: b > 100 * 1073741824 ? 0 : 1 })} GB`;
function Meter({ label, pct, detail }) {
  const tone = pct == null ? "" : pct >= 90 ? " is-red" : pct >= 75 ? " is-amber" : "";
  return (
    <div className="wg-meter">
      <span>{label}</span><b>{pct == null ? "—" : `%${pct}`}</b>
      <div className={`wg-progress${tone}`}><i style={{ width: `${pct || 0}%` }} /></div>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function SystemWidget({ size }) {
  const q = usePoll(() => W().widgets.system(), 3000);
  const [bat, setBat] = useState(null);
  useEffect(() => {
    let b = null;
    const read = () => b && setBat({ level: Math.round(b.level * 100), charging: b.charging });
    navigator.getBattery?.().then((x) => { b = x; read(); x.addEventListener("levelchange", read); x.addEventListener("chargingchange", read); }).catch(() => {});
    return () => { if (b) { b.removeEventListener("levelchange", read); b.removeEventListener("chargingchange", read); } };
  }, []);
  const d = q.data;
  if (!d) return <p className="wg-muted">Ölçülüyor…</p>;
  // Masaüstü bilgisayarda pil yok: Chromium tam dolu + şarjda bildirir; gösterilmez.
  const hasBattery = bat && !(bat.level === 100 && bat.charging);
  return (
    <div className="wg-system">
      <Meter label="İşlemci" pct={d.cpu} detail={size === "medium" ? `${d.cores} çekirdek` : null} />
      <Meter label="Bellek" pct={d.memory.percent} detail={size === "medium" ? `${gb(d.memory.total - d.memory.free)} / ${gb(d.memory.total)}` : null} />
      {d.disk && <Meter label="Disk" pct={d.disk.percent} detail={size === "medium" ? `${gb(d.disk.free)} boş` : null} />}
      {hasBattery && <Meter label={bat.charging ? "Pil ⚡" : "Pil"} pct={bat.level} />}
      {size === "medium" && <p className="wg-muted">{d.host} · açık {Math.floor(d.uptime / 86400) ? `${Math.floor(d.uptime / 86400)} g ` : ""}{Math.floor((d.uptime % 86400) / 3600)} sa</p>}
    </div>
  );
}

/* ------------------------------ hava durumu ------------------------------ */

const WX = { clear: "☀️", partly: "⛅", cloudy: "☁️", fog: "🌫️", drizzle: "🌦️", rain: "🌧️", snow: "❄️", storm: "⛈️", unknown: "🌡️" };
const NIGHT = { clear: "🌙", partly: "☁️" };
function WeatherWidget({ item, size, settings, update, closeSettings }) {
  const city = item.options.city;
  const q = usePoll(async () => {
    const r = await W().widgets.weather(city);
    if (!r?.ok) throw new Error(r?.error || "Hava durumu alınamadı.");
    return r;
  }, 20 * 60000, [city]);
  const [draft, setDraft] = useState(city);
  if (settings) {
    return (
      <form className="wg-settings" onSubmit={(e) => { e.preventDefault(); update({ options: { city: draft } }); closeSettings(); }}>
        <label>Şehir <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ankara" autoFocus /></label>
        <button type="submit" className="wg-btn">Kaydet</button>
        <p className="wg-muted">Kaynak: Open-Meteo (anahtarsız); erişilemezse wttr.in.</p>
      </form>
    );
  }
  const d = q.data;
  if (q.error && !d) return <Err text={q.error} onRetry={q.reload} />;
  if (!d) return <p className="wg-muted">Yükleniyor…</p>;
  const icon = (k, day = true) => (!day && NIGHT[k]) || WX[k] || WX.unknown;
  return (
    <div className="wg-weather">
      <div className="wg-weather__now">
        <span className="wg-weather__icon" aria-hidden="true">{icon(d.kind, d.isDay)}</span>
        <span><strong>{d.temp}°</strong><small>{d.place}</small></span>
      </div>
      <p className="wg-weather__text">{d.text}{size === "medium" && d.humidity != null ? ` · nem %${d.humidity} · rüzgâr ${d.wind} km/sa` : ""}</p>
      {size === "medium" && (
        <ul className="wg-weather__days">{d.days.map((x, i) => (
          <li key={x.date}><span>{i === 0 ? "Bugün" : new Date(`${x.date}T12:00`).toLocaleDateString("tr-TR", { weekday: "short" })}</span><b>{icon(x.kind)}</b><span>{x.max}° / {x.min}°</span></li>
        ))}</ul>
      )}
      {d.stale && <p className="wg-muted">Çevrimdışı · son veri</p>}
    </div>
  );
}

/* ------------------------------ maçlar ------------------------------ */

function MatchesWidget({ item, size, settings, update, closeSettings }) {
  const city = item.options.city || "";
  const q = usePoll(async () => {
    const r = await W().widgets.matches({ city });
    if (!r?.ok) throw new Error(r?.error || "Maçlar alınamadı.");
    return r;
  }, 2 * 60000, [city]);
  const [draft, setDraft] = useState(city);
  if (settings) {
    return (
      <form className="wg-settings" onSubmit={(e) => { e.preventDefault(); update({ options: { city: draft } }); closeSettings(); }}>
        <label>Şehir (boş: tümü) <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ankara" autoFocus /></label>
        <button type="submit" className="wg-btn">Kaydet</button>
      </form>
    );
  }
  const d = q.data;
  if (q.error && !d) return <Err text={q.error} onRetry={q.reload} />;
  if (!d) return <p className="wg-muted">Yükleniyor…</p>;
  const max = size === "medium" ? 7 : 4;
  const rows = [...d.live, ...d.upcoming].slice(0, max);
  const when = (m) => {
    const t = new Date(m.start);
    const today = dayStart(new Date());
    const day = dayStart(t) - today === 0 ? "Bugün" : dayStart(t) - dayStart(today, 1) === 0 ? "Yarın" : t.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    return `${day} ${t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  };
  return (
    <div className="wg-list">
      {rows.length ? rows.map((m) => (
        <button key={`${m.live ? "l" : "f"}${m.id}`} type="button" className={`wg-match${m.live ? " is-live" : ""}`} onClick={() => W().app.openWeb(m.id && m.city ? `/${String(m.city).toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}/mac/${m.id}` : "/")} title={[m.league, m.field, m.city].filter(Boolean).join(" · ")}>
          <span className="wg-match__teams"><b>{m.home}</b><b>{m.away}</b></span>
          {m.live ? <span className="wg-match__score"><i>CANLI</i>{m.homeScore}–{m.awayScore}</span> : <span className="wg-match__when">{when(m)}{size === "medium" && m.field ? <small>{m.field}</small> : null}</span>}
        </button>
      )) : <p className="wg-muted">Önümüzdeki günlerde maç yok{city ? ` (${city})` : ""}.</p>}
      {d.stale && <p className="wg-muted">Çevrimdışı · son liste</p>}
    </div>
  );
}

/* ------------------------------ döviz ------------------------------ */

function RatesWidget({ item, size, settings, update }) {
  const q = usePoll(async () => {
    const r = await W().widgets.rates(false);
    if (!r?.ok) throw new Error(r?.error || "Kur alınamadı.");
    return r;
  }, 30 * 60000);
  const codes = item.options.codes?.length ? item.options.codes : ["USD", "EUR", "GBP"];
  if (settings) {
    return (
      <div className="wg-settings">
        <p className="wg-muted">Gösterilecek para birimleri (₺ karşılığı, en çok 6):</p>
        <div className="wg-zones">{CURRENCIES.filter((c) => c.code !== "TRY").map((c) => (
          <label key={c.code} className="wg-check"><input type="checkbox" checked={codes.includes(c.code)} disabled={!codes.includes(c.code) && codes.length >= 6}
            onChange={(e) => update({ options: { codes: e.target.checked ? [...codes, c.code] : codes.filter((x) => x !== c.code) } })} /> {c.code}</label>
        ))}</div>
      </div>
    );
  }
  const r = q.data;
  if (q.error && !r) return <Err text={q.error} onRetry={q.reload} />;
  if (!r) return <p className="wg-muted">Yükleniyor…</p>;
  const tl = (c) => (r.rates.TRY && r.rates[c] ? r.rates.TRY / r.rates[c] : null);
  return (
    <div className="wg-rates">
      {codes.slice(0, size === "medium" ? 6 : 3).map((c) => (
        <div key={c} className="wg-rate"><span>{c}</span><b>{tl(c) == null ? "—" : `${tl(c).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: tl(c) < 1 ? 4 : 2 })} ₺`}</b></div>
      ))}
      <p className="wg-muted">{r.date || ""}{r.stale ? " · çevrimdışı" : ""}{size === "medium" ? ` · ${r.source}` : ""}</p>
    </div>
  );
}

export const BODIES = {
  clock: ClockWidget, agenda: AgendaWidget, todos: TodosWidget, note: NoteWidget, music: MusicWidget, clipboard: ClipboardWidget, timer: TimerWidget, system: SystemWidget, weather: WeatherWidget, matches: MatchesWidget, rates: RatesWidget,
  messages: MessagesWidget, requests: RequestsWidget, projects: ProjectsWidget, ledger: LedgerWidget, equipment: EquipmentWidget, today: TodayWidget, contacts: ContactsWidget, notes: PinnedNotesWidget, quickadd: QuickAddWidget,
  focus: FocusWidget, week: WeekWidget, month: MonthWidget, livematch: LiveMatchWidget, standings: StandingsWidget, studio: StudioWidget, launcher: LauncherWidget, dock: DockWidget,
};
// Ayarlar paneli olan türler (ana süreçteki katalogla aynı: app/widgets/catalog.js "settings").
export const WITH_SETTINGS = new Set(["clock", "weather", "rates", "matches", "messages", "todos", "livematch", "standings", "launcher", "dock"]);

/* ------------------------------ kabuk ------------------------------ */

export default function Widget() {
  const params = useMemo(() => new URLSearchParams(window.location.hash.slice(1)), []);
  const type = params.get("widget");
  const [cfg, setCfg] = useState(null);
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.window = "widget";
    W().widgets.self().then((r) => r?.ok && setCfg({ item: r.item, theme: r.theme }));
    const a = W().widgets.onConfig((c) => c?.item && setCfg(c));
    const b = W().widgets.onSettings(() => setSettings(true));
    return () => { a(); b(); };
  }, []);
  useEffect(() => {
    if (cfg?.theme) document.documentElement.dataset.wtheme = cfg.theme;
  }, [cfg?.theme]);
  const update = useCallback((patch) => W().widgets.update(cfg?.item?.id, patch), [cfg?.item?.id]);
  const onContext = (e) => {
    if (e.target.closest("input, textarea")) return;
    e.preventDefault();
    W().widgets.menu();
  };
  const Body = BODIES[type];
  if (!Body) return null;
  const item = cfg?.item;
  return (
    <div className={`wg wg--${type} wg--${item?.size || "small"}${item?.locked ? " is-locked" : ""}`} style={{ "--wg-alpha": (item?.opacity ?? 92) / 100 }} onContextMenu={onContext} data-widget={type} data-ready={item ? "1" : undefined}>
      <header className="wg__head">
        <Icon name={ICONS[type]} size={12} /><span>{LABELS[type]}</span>
        {item?.locked && <Icon name="lock" size={10} />}
        <span className="wg__grow" />
        {settings && <button type="button" className="wg__hb" onClick={() => setSettings(false)} aria-label="Ayarları kapat"><Icon name="check" size={12} /></button>}
        {!settings && WITH_SETTINGS.has(type) && <button type="button" className="wg__hb" onClick={() => setSettings(true)} aria-label="Ayarlar" title="Ayarlar"><Icon name="sliders" size={11} /></button>}
        <button type="button" className="wg__hb" onClick={() => W().widgets.menu()} aria-label="Widget menüsü" title="Boyut, saydamlık, katman, kilit, kaldır"><Icon name="more" size={13} /></button>
      </header>
      <main className="wg__body">
        {item ? <Body item={item} size={item.size} settings={settings && WITH_SETTINGS.has(type)} update={update} closeSettings={() => setSettings(false)} /> : null}
      </main>
    </div>
  );
}

/**
 * Galeri önizlemesi (views/toolkit/WidgetGallery.jsx): widget'ın gerçek gövdesi, gerçek veriyle,
 * katalogdaki boyutta; ayar değişiklikleri yalnız önizlemede kalır (masaüstüne eklenmez).
 */
export function WidgetPreview({ type, size = "small", width, height }) {
  const [item, setItem] = useState(() => ({ id: "preview", type, size, opacity: 96, locked: false, level: "normal", options: {} }));
  useEffect(() => { setItem((it) => ({ ...it, type, size, options: it.type === type ? it.options : {} })); }, [type, size]);
  const Body = BODIES[type];
  if (!Body) return null;
  const update = (patch) => setItem((it) => ({ ...it, options: { ...it.options, ...(patch?.options || {}) } }));
  return (
    <div className={`wg wg-preview wg--${type} wg--${size}`} style={{ width, height, "--wg-alpha": 0.96 }} data-widget={type} aria-label={`${LABELS[type] || type} önizlemesi`}>
      <header className="wg__head"><Icon name={ICONS[type]} size={12} /><span>{LABELS[type]}</span><span className="wg__grow" /></header>
      <main className="wg__body"><Body item={item} size={size} settings={false} update={update} closeSettings={() => {}} /></main>
    </div>
  );
}
