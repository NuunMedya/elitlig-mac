// Masaüstü widget'ı (#widget=<tür>&id=<kimlik>): çerçevesiz, şeffaf küçük pencere. Ana süreç
// app/widgets/index.js. Görsel dil macOS masaüstü widget'ları: standart boyut ailesi (küçük / orta /
// büyük / ekstra büyük), 22 nokta köşe, cam malzeme, tek büyük ana değer + küçük ikincil satırlar.
// Arka plan sürükleme alanıdır (sabitliyken değil); ⋯ ya da sağ tık: boyut, katman, sabitle, düzenle.
// Düzenleme kipinde (macOS "Widget'ları Düzenle") her widget çerçevelenir, kaldır ve boyut düğmeleri çıkar.
// Yeni widget gövdeleri ./bodies/*; ortak parçalar ./common.jsx; saf hesaplar ./widgetModel.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { clock as fmtSec, isPlayingStatus } from "../music/musicApp";
import { formatClock } from "../lib/helpers";
import { ZONES, diffLabel, normalizeZones, zoneLabel, zoneNow } from "../views/toolkit/worldClock";
import { CURRENCIES } from "../views/toolkit/units";
import { Err, Hero, NeedSession, W, dayStart, pick, usePoll, useSignedIn } from "./common";
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
const SIZE_SHORT = { small: "K", medium: "O", large: "B", xlarge: "XL" };
const SIZE_NAMES = { small: "Küçük", medium: "Orta", large: "Büyük", xlarge: "Ekstra büyük" };
const hm = (d) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

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
  const time = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", ...(sec ? { second: "2-digit" } : {}) });
  if (size === "small") {
    return (
      <div className="wg-clock is-small">
        <span className="wg-clock__day">{now.toLocaleDateString("tr-TR", { weekday: "long" })}</span>
        <div className="wg-clock__time">{time}</div>
        <div className="wg-clock__date">{now.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}</div>
      </div>
    );
  }
  return (
    <div className="wg-clock is-wide">
      <div className="wg-clock__main"><div className="wg-clock__time">{time}</div><div className="wg-clock__date">{now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</div></div>
      {zones.length > 0 && (
        <ul className="wg-zonelist">{zones.slice(0, 3).map((tz) => { const z = zoneNow(tz, now); return <li key={tz} className={z.night ? "is-night" : ""}><span>{zoneLabel(tz)}</span><b>{z.time}</b><small>{diffLabel(tz, local, now)}</small></li>; })}</ul>
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
  const now = new Date();
  const today = dayStart(now);
  const groups = [["Bugün", 0], ["Yarın", 1]].map(([label, n]) => ({
    label,
    items: items.filter((it) => { const s = startOf(it); return s >= dayStart(today, n) && s < dayStart(today, n + 1); }).sort((a, b) => (a.all_day === b.all_day ? startOf(a) - startOf(b) : a.all_day ? -1 : 1)),
  }));
  const todayItems = groups[0].items;
  const next = todayItems.find((it) => it.all_day || startOf(it) >= now) || groups[1].items[0] || null;
  if (size === "small") {
    return (
      <button type="button" className="wg-cal-small" onClick={() => W().widgets.open("agenda")}>
        <span className="wg-cal-small__day">{now.toLocaleDateString("tr-TR", { weekday: "long" })}</span>
        <b className="wg-cal-small__num">{now.getDate()}</b>
        {next ? <span className="wg-evt"><i />{next.title}<small>{next.all_day ? "Gün boyu" : `${todayItems.includes(next) ? "" : "Yarın "}${hm(startOf(next))}`}</small></span> : <span className="wg-muted">{q.loading ? "…" : "Bugün plan yok"}</span>}
      </button>
    );
  }
  const max = pick(size, 2, 3, 6);
  return (
    <div className={`wg-agenda${size === "medium" ? " is-wide" : ""}`}>
      {size === "medium" && <div className="wg-agenda__date"><span>{now.toLocaleDateString("tr-TR", { weekday: "long" })}</span><b>{now.getDate()}</b><small>{now.toLocaleDateString("tr-TR", { month: "long" })}</small></div>}
      <div className="wg-list">
        {groups.filter((g) => size !== "medium" || g.label === "Bugün" || !todayItems.length).map((g) => (
          <section key={g.label}>
            <h5>{g.label}</h5>
            {g.items.length ? g.items.slice(0, max).map((it) => (
              <button key={`${it.id}-${it.occurrence_start || it.start_at}`} type="button" className="wg-evt is-row" style={it.color ? { "--ev": it.color } : undefined} onClick={() => W().widgets.open(it.project_id ? `projects:${it.project_id}` : "agenda")}>
                <i /><span className="wg-row__text">{it.title}</span><small>{it.all_day ? "Gün boyu" : hm(startOf(it))}</small>
              </button>
            )) : <p className="wg-muted">{q.loading ? "Yükleniyor…" : "Plan yok"}</p>}
            {g.items.length > max && <p className="wg-muted">+{g.items.length - max} etkinlik daha</p>}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ karalama ------------------------------ */

const stripMd = (s) => String(s || "").replace(/[#*_`>[\]-]+/g, " ").replace(/\s+/g, " ").trim();
function NoteWidget({ item, size, update }) {
  const [text, setText] = useState(item.options.text || "");
  const timer = useRef(null);
  const signed = useSignedIn();
  const q = usePoll(async () => {
    if (!signed || size !== "large") return null;
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
      {size === "large" && q.data?.length > 0 && (
        <ul className="wg-notes">{q.data.map((n) => <li key={n.id}><button type="button" onClick={() => W().widgets.open(`notes:${n.id}`)}>{n.title || stripMd(n.body).slice(0, 40) || "Not"}</button></li>)}</ul>
      )}
      {size !== "small" && (
        <div className="wg-bar">
          <button type="button" className="wg-btn" onClick={() => W().quick.show("note")}><Icon name="plus" size={11} /> Yeni not</button>
          {signed && <button type="button" className="wg-btn is-ghost" onClick={() => W().widgets.open("notes")}>Not Defteri</button>}
          {text && <button type="button" className="wg-btn is-ghost" onClick={() => navigator.clipboard.writeText(text)} title="Kopyala"><Icon name="copy" size={11} /></button>}
        </div>
      )}
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
    <div className={`wg-music is-${size}${playing ? " is-playing" : ""}`}>
      <div className="wg-music__info">
        <span className="wg-music__disc"><Icon name="music" size={size === "small" ? 22 : 18} /></span>
        <span><strong>{!has ? "Müzik listesi boş" : s.status === "idle" ? "Çalmaya hazır" : s.title || "Parça"}</strong>
          <small>{!has ? "Müzik görünümünden ekleyin" : s.status === "idle" ? `${s.trackCount} giriş` : s.status === "paused" ? "Duraklatıldı" : `${fmtSec(s.elapsedSec)}${s.lengthSec ? ` / ${fmtSec(s.lengthSec)}` : ""}`}</small></span>
      </div>
      {s?.lengthSec ? <div className="wg-progress"><i style={{ width: `${Math.min(100, (s.elapsedSec / s.lengthSec) * 100)}%` }} /></div> : null}
      <div className="wg-music__ctl">
        <button type="button" className="wg-ib" onClick={() => cmd("prev")} disabled={!has} aria-label="Önceki"><Icon name="skipBack" size={14} /></button>
        <button type="button" className="wg-ib is-main" onClick={() => (has ? cmd("toggle") : cmd("show"))} aria-label={playing ? "Duraklat" : "Çal"}><Icon name={playing ? "pause" : "play"} size={15} strokeWidth={2.4} /></button>
        <button type="button" className="wg-ib" onClick={() => cmd("next")} disabled={!has} aria-label="Sonraki"><Icon name="skip" size={14} /></button>
        {size !== "small" && <button type="button" className="wg-ib" onClick={() => cmd("show")} aria-label="Müzik görünümü" title="Müzik görünümü"><Icon name="external" size={13} /></button>}
      </div>
    </div>
  );
}

/* ------------------------------ pano ------------------------------ */

function ClipboardWidget({ size }) {
  const shelf = W().shelf;
  const [items, setItems] = useState(null);
  const [copied, setCopied] = useState(null);
  const load = useCallback(() => shelf?.list({}, { limit: pick(size, 3, 3, 8) }).then((r) => setItems(r?.ok ? r.items : [])).catch(() => setItems([])), [shelf, size]);
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
      {size !== "small" && <div className="wg-bar is-center">{[5, 15, 25, 45].map((m) => <button key={m} type="button" className="wg-btn is-ghost" onClick={() => startTimer(m)}>{m} dk</button>)}</div>}
    </div>
  );
}

/* ------------------------------ sistem ------------------------------ */

const gb = (b) => `${(b / 1073741824).toLocaleString("tr-TR", { maximumFractionDigits: b > 100 * 1073741824 ? 0 : 1 })} GB`;
function Ring({ label, pct, sub }) {
  const tone = pct == null ? "" : pct >= 90 ? " is-red" : pct >= 75 ? " is-amber" : "";
  const R = 24;
  const C2 = 2 * Math.PI * R;
  return (
    <div className={`wg-gauge${tone}`}>
      <span className="wg-gauge__ring">
        <svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r={R} className="wg-ring__bg" /><circle cx="30" cy="30" r={R} className="wg-ring__fg" strokeDasharray={C2} strokeDashoffset={C2 * (1 - (pct || 0) / 100)} transform="rotate(-90 30 30)" /></svg>
        <b>{pct == null ? "—" : pct}</b>
      </span>
      <small>{label}</small>{sub && <small className="wg-muted">{sub}</small>}
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
  const rings = [
    <Ring key="c" label="İşlemci" pct={d.cpu} sub={size !== "small" ? `${d.cores} çekirdek` : null} />,
    <Ring key="m" label="Bellek" pct={d.memory.percent} sub={size !== "small" ? gb(d.memory.total - d.memory.free) : null} />,
    d.disk && <Ring key="d" label="Disk" pct={d.disk.percent} sub={size !== "small" ? `${gb(d.disk.free)} boş` : null} />,
    hasBattery && <Ring key="b" label={bat.charging ? "Pil ⚡" : "Pil"} pct={bat.level} />,
  ].filter(Boolean);
  return (
    <div className={`wg-system is-${size}`}>
      <div className="wg-gauges">{rings.slice(0, size === "small" ? 4 : 4)}</div>
      {size !== "small" && <p className="wg-muted">{d.host} · açık {Math.floor(d.uptime / 86400) ? `${Math.floor(d.uptime / 86400)} g ` : ""}{Math.floor((d.uptime % 86400) / 3600)} sa</p>}
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
  const d = q.data;
  const sky = d ? `${d.isDay === false ? "night" : "day"}-${["rain", "drizzle", "storm"].includes(d.kind) ? "rain" : ["cloudy", "fog", "snow"].includes(d.kind) ? "cloud" : "clear"}` : "day-clear";
  if (settings) {
    return (
      <form className="wg-settings" onSubmit={(e) => { e.preventDefault(); update({ options: { city: draft } }); closeSettings(); }}>
        <label>Şehir <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ankara" autoFocus /></label>
        <button type="submit" className="wg-btn">Kaydet</button>
        <p className="wg-muted">Kaynak: Open-Meteo (anahtarsız); erişilemezse wttr.in.</p>
      </form>
    );
  }
  if (q.error && !d) return <Err text={q.error} onRetry={q.reload} />;
  if (!d) return <p className="wg-muted">Yükleniyor…</p>;
  const icon = (k, day = true) => (!day && NIGHT[k]) || WX[k] || WX.unknown;
  const today = d.days?.[0];
  // macOS Hava Durumu gibi gökyüzü degradesi (koşul ve gündüz / gece): data-sky.
  return (
    <div className={`wg-weather is-${size}`} data-sky={sky}>
      <div className="wg-weather__top">
        <span className="wg-weather__place">{d.place}</span>
        <strong className="wg-weather__temp">{d.temp}°</strong>
      </div>
      <div className="wg-weather__now">
        <span className="wg-weather__icon" aria-hidden="true">{icon(d.kind, d.isDay)}</span>
        <span className="wg-weather__text">{d.text}{today ? <small>Y:{today.max}° D:{today.min}°</small> : null}</span>
      </div>
      {size !== "small" && (
        <ul className="wg-weather__days">{d.days.map((x, i) => (
          <li key={x.date}><span>{i === 0 ? "Bugün" : new Date(`${x.date}T12:00`).toLocaleDateString("tr-TR", { weekday: "short" })}</span><b>{icon(x.kind)}</b><span>{x.max}° <small>{x.min}°</small></span></li>
        ))}</ul>
      )}
      {size === "large" && d.humidity != null && <p className="wg-weather__extra">Nem %{d.humidity} · Rüzgâr {d.wind} km/sa · {d.source}</p>}
      {d.stale && <p className="wg-weather__extra">Çevrimdışı · son veri</p>}
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
  const rows = [...d.live, ...d.upcoming];
  const when = (m) => {
    const t = new Date(m.start);
    const today = dayStart(new Date());
    const day = dayStart(t) - today === 0 ? "Bugün" : dayStart(t) - dayStart(today, 1) === 0 ? "Yarın" : t.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    return `${day} ${hm(t)}`;
  };
  const url = (m) => (m.id && m.city ? `/${String(m.city).toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}/mac/${m.id}` : "/");
  if (size === "small") {
    const m = rows[0];
    return m ? (
      <Hero label={m.live ? `${d.live.length} canlı maç` : "Sıradaki maç"} value={m.live ? `${m.homeScore}–${m.awayScore}` : hm(new Date(m.start))} tone={m.live ? "red" : ""} onClick={() => W().app.openWeb(url(m))}
        lines={[m.home, m.away, m.live ? m.league : when(m)]} />
    ) : <Hero label="Maç" value="—" lines={["Önümüzdeki günlerde maç yok"]} />;
  }
  const max = pick(size, 3, 3, 8);
  return (
    <div className="wg-list">
      {rows.length ? rows.slice(0, max).map((m) => (
        <button key={`${m.live ? "l" : "f"}${m.id}`} type="button" className={`wg-match${m.live ? " is-live" : ""}`} onClick={() => W().app.openWeb(url(m))} title={[m.league, m.field, m.city].filter(Boolean).join(" · ")}>
          <span className="wg-match__teams"><b>{m.home}</b><b>{m.away}</b></span>
          {m.live ? <span className="wg-match__score"><i>CANLI</i>{m.homeScore}–{m.awayScore}</span> : <span className="wg-match__when">{when(m)}{size === "large" && m.field ? <small>{m.field}</small> : null}</span>}
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
  const fmt = (v) => (v == null ? "—" : v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 }));
  return (
    <div className={`wg-rates is-${size}`}>
      {codes.slice(0, size === "small" ? 3 : 6).map((c) => (
        <div key={c} className="wg-rate"><span>{c}</span><b>{fmt(tl(c))}<small> ₺</small></b></div>
      ))}
      <p className="wg-muted">{r.date || ""}{r.stale ? " · çevrimdışı" : ""}{size !== "small" ? ` · ${r.source}` : ""}</p>
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
// Başlığı gövdenin içinde kendisi çizen türler: kabuk başlığı yalnız düğmeleri taşır.
const SELF_TITLED = new Set(["clock", "weather", "agenda", "month", "livematch", "dock"]);

/* ------------------------------ kabuk ------------------------------ */

/** Masaüstü katmanında yazı alanına tıklanınca pencere geçici odak alır (ana süreç: widgets:focus). */
const EDITABLE = "input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]";

function Head({ type, item, editing, settings, setSettings }) {
  const bare = SELF_TITLED.has(type);
  return (
    <header className={`wg__head${bare ? " is-bare" : ""}`}>
      {!bare && <><span className="wg__appicon"><Icon name={ICONS[type]} size={11} strokeWidth={2.2} /></span><span className="wg__title">{LABELS[type]}</span></>}
      {item?.locked && !editing && <span className="wg__pin" title="Masaüstüne sabitli"><Icon name="pin" size={9} /></span>}
      <span className="wg__grow" />
      {setSettings && !editing && settings && <button type="button" className="wg__hb" onClick={() => setSettings(false)} aria-label="Ayarları kapat"><Icon name="check" size={12} /></button>}
      {setSettings && !editing && !settings && WITH_SETTINGS.has(type) && <button type="button" className="wg__hb" onClick={() => setSettings(true)} aria-label="Ayarlar" title="Ayarlar"><Icon name="sliders" size={11} /></button>}
      {setSettings && !editing && <button type="button" className="wg__hb" onClick={() => W().widgets.menu()} aria-label="Widget menüsü" title="Boyut, katman, sabitle, düzenle, kaldır"><Icon name="more" size={13} /></button>}
    </header>
  );
}

export default function Widget() {
  const params = useMemo(() => new URLSearchParams(window.location.hash.slice(1)), []);
  const type = params.get("widget");
  const [cfg, setCfg] = useState(null);
  const [settings, setSettings] = useState(false);
  const [sizeKeys, setSizeKeys] = useState(null);
  useEffect(() => {
    document.documentElement.dataset.window = "widget";
    W().widgets.self().then((r) => r?.ok && setCfg(r));
    const a = W().widgets.onConfig((c) => c?.item && setCfg(c));
    const b = W().widgets.onSettings(() => setSettings(true));
    W().widgets.state().then((st) => setSizeKeys(st.catalog.find((c) => c.type === type)?.sizeKeys || null)).catch(() => {});
    return () => { a(); b(); };
  }, [type]);
  useEffect(() => {
    const root = document.documentElement;
    if (cfg?.theme) root.dataset.wtheme = cfg.theme;
    root.dataset.glass = cfg?.glass ? "1" : "0";
    root.dataset.dim = cfg?.dim ? "1" : "0";
    root.dataset.editing = cfg?.editing ? "1" : "0";
  }, [cfg?.theme, cfg?.glass, cfg?.dim, cfg?.editing]);
  // Düzenleme kipinde Esc: bitir.
  useEffect(() => {
    if (!cfg?.editing) return undefined;
    const onKey = (e) => { if (e.key === "Escape") W().widgets.edit(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cfg?.editing]);
  const update = useCallback((patch) => W().widgets.update(cfg?.item?.id, patch), [cfg?.item?.id]);
  const onContext = (e) => {
    if (e.target.closest("input, textarea")) return;
    e.preventDefault();
    W().widgets.menu();
  };
  // Masaüstü katmanı: yazı alanının üzerine gelince pencere odaklanabilir (tıklama klavyeyi alır),
  // ayrılınca geri (ana süreç odak almadıysa). Başka yere tıklama odak çalmaz.
  const overEditable = useRef(false);
  const onPointerOver = (e) => {
    if (cfg?.level !== "desktop") return;
    const on = Boolean(e.target.closest?.(EDITABLE));
    if (on !== overEditable.current) { overEditable.current = on; W().widgets.focusable?.(on); }
  };
  const onPointerLeave = () => { if (overEditable.current) { overEditable.current = false; W().widgets.focusable?.(false); } };
  const onPointerDown = (e) => {
    const el = e.target.closest?.(EDITABLE);
    // document.hasFocus() pencere odaklı değilken de true dönebilir (Linux); karar ana süreçte (isFocused).
    if (!el || cfg?.level !== "desktop") return;
    W().widgets.focus().then(() => setTimeout(() => el.focus(), 0));
  };
  const Body = BODIES[type];
  if (!Body) return null;
  const item = cfg?.item;
  const size = item?.size || "small";
  const editing = Boolean(cfg?.editing);
  return (
    <div className={`wg wg--${type} wg--${size}${item?.locked ? " is-locked" : ""}${editing ? " is-editing" : ""}${cfg?.glass ? " is-glass" : ""}`}
      style={{ "--wg-alpha": (item?.opacity ?? 92) / 100 }} onContextMenu={onContext} onPointerDownCapture={onPointerDown} onPointerOver={onPointerOver} onPointerLeave={onPointerLeave} data-widget={type} data-size={size} data-ready={item ? "1" : undefined}>
      <Head type={type} item={item} editing={editing} settings={settings} setSettings={setSettings} />
      <main className="wg__body">
        {item ? <Body item={item} size={size} settings={settings && WITH_SETTINGS.has(type)} update={update} closeSettings={() => setSettings(false)} /> : null}
      </main>
      {editing && item && (
        <>
          <button type="button" className="wg-edit__remove" onClick={() => W().widgets.remove(item.id)} aria-label={`${LABELS[type]} widget'ını kaldır`} title="Kaldır"><Icon name="x" size={11} strokeWidth={3} /></button>
          <div className="wg-edit__bar" role="toolbar" aria-label="Boyut ve sabitleme">
            {(sizeKeys || []).length > 1 && sizeKeys.map((k) => (
              <button key={k} type="button" className={k === size ? "is-on" : ""} onClick={() => update({ size: k })} aria-pressed={k === size} title={SIZE_NAMES[k] || k} data-size={k}>{SIZE_SHORT[k] || k}</button>
            ))}
            <button type="button" className={item.locked ? "is-on" : ""} onClick={() => update({ locked: !item.locked })} title="Masaüstüne sabitle (sürüklenmez)" aria-label="Masaüstüne sabitle" aria-pressed={item.locked}><Icon name="pin" size={10} /></button>
            <button type="button" className="is-done" onClick={() => W().widgets.edit(false)}>Bitti</button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Galeri önizlemesi (views/toolkit/WidgetGallery.jsx): widget'ın gerçek gövdesi, gerçek veriyle,
 * katalogdaki boyutta; ayar değişiklikleri yalnız önizlemede kalır (masaüstüne eklenmez).
 */
export function WidgetPreview({ type, size = "small", width, height }) {
  const [item, setItem] = useState(() => ({ id: "preview", type, size, opacity: 96, locked: false, level: "desktop", options: {} }));
  useEffect(() => { setItem((it) => ({ ...it, type, size, options: it.type === type ? it.options : {} })); }, [type, size]);
  const Body = BODIES[type];
  if (!Body) return null;
  const update = (patch) => setItem((it) => ({ ...it, options: { ...it.options, ...(patch?.options || {}) } }));
  return (
    <div className={`wg wg-preview wg--${type} wg--${size}`} style={{ width, height, "--wg-alpha": 0.96 }} data-widget={type} data-size={size} aria-label={`${LABELS[type] || type} önizlemesi`}>
      <Head type={type} item={item} editing={false} />
      <main className="wg__body"><Body item={item} size={size} settings={false} update={update} closeSettings={() => {}} /></main>
    </div>
  );
}
