// Yayın Stüdyosu · SES sekmesi — vMix / OBS benzeri KARIŞTIRICI.
//
//   Şeritler   Mikrofon · ek girişler (kamera sesi / yakalama kartı) · Tekrar / Video ·
//              Özet · Müzik: kazanç (trim), dikey fader (dB ölçekli), stereo ölçer
//              (tepe tutma), SESSİZ (M), SOLO / dinle (kulaklık), barası ve
//              o an yayına gidip gitmediği
//   Program    master fader, stereo ölçer, sınırlayıcı, "programı dinle"
//   Yönlendirme  YAYINA GİDEN SES matrisi: bağlam (canlı / tekrar & VAR / video /
//              özet) × (canlı mikrofon / video-tekrar sesi / müzik); anında uygulanır
//   Ayarlar    mikrofon aygıtı + gürültü azaltma, ek girişler, müzik çalar
// Ölçerler tek rAF döngüsünde DOM'u doğrudan günceller (React çizimi yok).
import React, { useCallback, useEffect, useRef } from "react";
import { Field, Icon, Kbd } from "../../components/ui";
import { levelFromSamples } from "../../lib/studio/compose";
import {
  FADER_TICKS, METER_TICKS, PLAYBACK_CONTEXTS, ROUTE_GROUPS, dbText, dbToFader, faderToDb, meterBallistics, meterFraction, peakHold, routingFor, samplesLevel,
} from "../../lib/studio/audio";
import { uid } from "../../lib/studio/layouts";
import "./modes/modes.css";

/** Eski tek çubuk ölçer (üst çubuk): DOM'u doğrudan günceller. */
export function LevelMeter({ getAnalyser, muted, compact = false }) {
  const bar = useRef(null);
  const ref = useRef(getAnalyser);
  ref.current = getAnalyser;
  useEffect(() => {
    let raf = 0;
    let buf = null;
    let peak = 0;
    const loop = () => {
      const a = ref.current?.();
      let pct = 0;
      if (a) {
        if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf);
        pct = levelFromSamples(buf).pct;
      }
      peak = Math.max(pct, peak - 1.5);
      if (bar.current) {
        bar.current.style.setProperty("--lvl", `${pct.toFixed(1)}%`);
        bar.current.style.setProperty("--peak", `${peak.toFixed(1)}%`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={bar} className={`st-meter ${muted ? "is-muted" : ""} ${compact ? "st-meter--compact" : ""}`} aria-hidden="true"><i /><b /></span>;
}

/* ───────── ölçer bankası: tek döngü ───────── */
function useMeterBank() {
  const items = useRef(new Map()); // key → { get, el, state }
  useEffect(() => {
    let raf = 0;
    let buf = null;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      for (const it of items.current.values()) {
        const tap = it.get?.();
        const el = it.el;
        if (!el) continue;
        const chans = tap ? [tap.L, tap.R] : [null, null];
        chans.forEach((a, i) => {
          let db = -Infinity;
          if (a) {
            if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
            a.getFloatTimeDomainData(buf);
            db = samplesLevel(buf).peakDb;
          }
          const st = it.state[i];
          st.db = meterBallistics(st.db, db, dt, 26);
          st.peak = peakHold(st.peak, db, now, { holdMs: 1500, decayDbPerSec: 18 });
          el.style.setProperty(`--l${i}`, `${(meterFraction(st.db) * 100).toFixed(1)}%`);
          el.style.setProperty(`--p${i}`, `${(meterFraction(st.peak.db) * 100).toFixed(1)}%`);
          if (i === 0 && it.readout) {
            const pk = Math.max(st.peak.db, it.state[1].peak?.db ?? -Infinity);
            const txt = Number.isFinite(pk) && pk > -60 ? dbText(pk) : "−∞";
            if (it.readout.textContent !== txt) it.readout.textContent = txt;
            it.readout.classList.toggle("is-clip", pk > -1);
          }
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return useCallback((key, get) => (el) => {
    if (!el) { const it = items.current.get(key); if (it) it.el = null; return; }
    const prev = items.current.get(key);
    items.current.set(key, { get, el, readout: el.querySelector(".mx-meter__pk"), state: prev?.state || [{ db: -Infinity, peak: null }, { db: -Infinity, peak: null }] });
  }, []);
}

function Meter({ bind, id, get, tall = false }) {
  return (
    <div className={`mx-meter ${tall ? "is-tall" : ""}`} ref={bind(id, get)}>
      <span className="mx-meter__pk">−∞</span>
      <div className="mx-meter__bars">
        <i className="mx-bar" style={{ "--lv": "var(--l0)", "--pk": "var(--p0)" }}><b /><s /></i>
        <i className="mx-bar" style={{ "--lv": "var(--l1)", "--pk": "var(--p1)" }}><b /><s /></i>
        <ul className="mx-scale">{METER_TICKS.map((t) => <li key={t} style={{ bottom: `${meterFraction(t) * 100}%` }}>{t === 0 ? "0" : t}</li>)}</ul>
      </div>
    </div>
  );
}

const Phones = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
  </svg>
);

function Fader({ db, onChange, label }) {
  const pos = Math.round(dbToFader(db) * 1000);
  return (
    <div className="mx-fader">
      <ul className="mx-fader__scale">{FADER_TICKS.map((t) => <li key={t} style={{ bottom: `${dbToFader(t) * 100}%` }}>{t > 0 ? `+${t}` : t}</li>)}<li style={{ bottom: 0 }}>∞</li></ul>
      <input type="range" min={0} max={1000} step={1} value={pos} aria-label={`${label} seviye`}
        onChange={(e) => onChange(Math.round(faderToDb(Number(e.target.value) / 1000) * 10) / 10)}
        onDoubleClick={() => onChange(0)} title="Çift tık: 0 dB" />
    </div>
  );
}

const GROUP_SHORT = Object.fromEntries(ROUTE_GROUPS.map((g) => [g.key, g.short]));

function Strip({ strip, st, audio, bind, status }) {
  const onAir = audio.routeNow?.[strip.group];
  const set = (patch) => audio.setStrip(strip.id, patch);
  return (
    <div className={`mx-strip is-${strip.kind} ${st.mute ? "is-muted" : ""} ${st.solo ? "is-solo" : ""}`}>
      <header className="mx-strip__head" title={strip.label}>
        <Icon name={strip.icon} size={13} />
        <strong>{strip.label}</strong>
        {status && <i className={`mx-dot is-${status}`} title={status === "live" ? "Bağlı" : status} />}
      </header>
      <div className="mx-trim" title="Kazanç (trim)">
        <span>KAZANÇ</span>
        <input type="range" min={-18} max={18} step={0.5} value={st.trim} onChange={(e) => set({ trim: Number(e.target.value) })} onDoubleClick={() => set({ trim: 0 })} aria-label={`${strip.label} kazanç`} />
        <em>{dbText(st.trim)} dB</em>
      </div>
      <div className="mx-strip__body">
        <Fader db={st.fader} onChange={(fader) => set({ fader })} label={strip.label} />
        <Meter bind={bind} id={strip.id} get={() => audio.analyser(strip.id)} />
      </div>
      <div className="mx-strip__db">{dbText(st.fader)} dB</div>
      <div className="mx-strip__btns">
        <button type="button" className={`mx-btn is-mute ${st.mute ? "is-on" : ""}`} onClick={() => set({ mute: !st.mute })} title={strip.id === "mic" ? "Sessiz (M)" : "Sessiz"}>M</button>
        <button type="button" className={`mx-btn is-solo ${st.solo ? "is-on" : ""}`} onClick={() => set({ solo: !st.solo })} title="Solo / kulaklıkla dinle"><Phones /></button>
      </div>
      <footer className={`mx-strip__bus ${onAir && !st.mute ? "is-air" : ""}`} title={onAir ? "Bu bara şu an yayına gidiyor" : "Bu bara şu an yayına GİTMİYOR (yönlendirme)"}>
        {GROUP_SHORT[strip.group]} · {onAir ? "YAYINDA" : "KAPALI"}
      </footer>
    </div>
  );
}

function MasterStrip({ audio, bind }) {
  const m = audio.settings.master;
  const mon = audio.settings.monitor;
  return (
    <div className="mx-strip is-master">
      <header className="mx-strip__head"><Icon name="broadcast" size={13} /><strong>PROGRAM</strong></header>
      <div className="mx-strip__body">
        <Fader db={m.fader} onChange={(fader) => audio.setMaster({ fader })} label="Program" />
        <Meter bind={bind} id="__master" get={() => audio.masterAnalyser()} tall />
      </div>
      <div className="mx-strip__db">{dbText(m.fader)} dB</div>
      <button type="button" className={`mx-btn is-wide ${m.limiter ? "is-on is-lim" : ""}`} onClick={() => audio.setMaster({ limiter: !m.limiter })} title="Sınırlayıcı: −1,5 dBFS üstünü keser (bozulmayı önler)">SINIRLAYICI</button>
      <button type="button" className={`mx-btn is-wide ${mon.program ? "is-on" : ""}`} onClick={() => audio.setMonitor({ program: !mon.program })} title="Programı kulaklıktan dinle (solo yoksa)"><Phones /> DİNLE</button>
      <label className="mx-mon" title="Kulaklık düzeyi"><Phones /><input type="range" min={0} max={100} value={mon.volume} onChange={(e) => audio.setMonitor({ volume: Number(e.target.value) })} /></label>
    </div>
  );
}

function RoutingMatrix({ audio }) {
  return (
    <section className="st-card mx-matrix">
      <header className="st-card__head"><Icon name="sliders" size={15} /><strong>Yayına giden ses</strong><small className="muted">o an oynayan içeriğe göre — anında uygulanır</small></header>
      <table>
        <thead><tr><th />{ROUTE_GROUPS.map((g) => <th key={g.key} title={g.hint}><Icon name={g.icon} size={12} /> {g.label}</th>)}</tr></thead>
        <tbody>
          {PLAYBACK_CONTEXTS.map((c) => {
            const r = routingFor(c.key, audio.routing);
            const active = audio.playback === c.key;
            return (
              <tr key={c.key} className={active ? "is-active" : ""}>
                <th title={c.hint}>{active && <span className="md-live-dot">ŞU AN</span>} {c.label}</th>
                {ROUTE_GROUPS.map((g) => (
                  <td key={g.key}>
                    <button type="button" className={`mx-cell ${r[g.key] ? "is-on" : ""}`} onClick={() => audio.setRoute(c.key, g.key, !r[g.key])} aria-pressed={r[g.key]}>{r[g.key] ? "AÇIK" : "—"}</button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="st-hint">Varsayılan: tekrar / VAR → yalnız canlı mikrofon; video ve özet → yalnız kendi sesi. Önizlemedeki klibin sesi hiçbir zaman yayına gitmez.</p>
    </section>
  );
}

const MIC_STATUS = {
  waiting: "Mikrofon açılıyor…",
  live: "",
  denied: "Mikrofon izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Mikrofon.",
  missing: "Seçili mikrofon takılı değil.",
  ended: "Mikrofon bağlantısı koptu.",
  error: "Mikrofon açılamadı.",
  off: "Mikrofon kapalı.",
};

const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;

function MusicCard({ audio }) {
  const m = audio.music;
  const file = useRef(null);
  return (
    <section className="st-card mx-music">
      <header className="st-card__head"><Icon name="music" size={15} /><strong>Müzik / arka plan</strong></header>
      <input ref={file} type="file" accept="audio/*,video/mp4" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) m.load(f); e.target.value = ""; }} />
      <div className="st-row">
        <button type="button" className="btn btn--sm" onClick={() => file.current?.click()}><Icon name="folder" size={12} /> Dosya seç</button>
        <span className="mx-music__name">{m.name || (m.savedName ? `${m.savedName} (yeniden seç)` : "Dosya yok")}</span>
      </div>
      <div className="st-row">
        <button type="button" className="icon-btn" disabled={!m.url} onClick={m.playing ? m.pause : m.play} title={m.playing ? "Duraklat" : "Çal"}><Icon name={m.playing ? "pause" : "play"} size={14} /></button>
        <button type="button" className="icon-btn" disabled={!m.url} onClick={m.stop} title="Durdur"><Icon name="stop" size={14} /></button>
        <input type="range" min={0} max={Math.max(1, m.duration)} step={0.1} value={m.time} disabled={!m.url} onChange={(e) => m.seek(Number(e.target.value))} aria-label="Konum" />
        <small className="muted">{mmss(m.time)} / {mmss(m.duration)}</small>
        <label className="toggle small"><input type="checkbox" checked={m.loop} onChange={(e) => m.setLoop(e.target.checked)} /> Döngü</label>
      </div>
    </section>
  );
}

/**
 * audio / mixer: useStudioAudio sonucu. Eski çağrı (audio = prefs.audio, setAudio, mixer) da çalışır.
 */
export default function AudioPanel({ audio: audioProp, mixer, devices = { audio: [] }, onRequestMic }) {
  const audio = audioProp?.setStrip ? audioProp : mixer;
  const bind = useMeterBank();
  if (!audio?.settings) return <p className="st-hint st-pad">Ses karıştırıcı hazır değil.</p>;
  const a = audio.settings;
  const mic = a.mic;
  const setMicCfg = (patch) => audio.update((x) => ({ ...x, mic: { ...x.mic, ...patch } }));
  const addInput = () => {
    const used = new Set([mic.deviceId, ...a.inputs.map((i) => i.deviceId)]);
    const dev = devices.audio.find((d) => d.deviceId && !used.has(d.deviceId)) || devices.audio[0];
    audio.update((x) => ({ ...x, inputs: [...x.inputs, { id: uid("ain"), deviceId: dev?.deviceId || "", name: dev?.label || "Ses girişi", volume: 100, muted: false }] }));
  };
  const setInput = (id, patch) => audio.update((x) => ({ ...x, inputs: x.inputs.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const removeInput = (id) => audio.update((x) => ({ ...x, inputs: x.inputs.filter((i) => i.id !== id) }));
  const status = audio.micStatus.status;
  const ctxLabel = PLAYBACK_CONTEXTS.find((c) => c.key === audio.playback)?.label || "Canlı yayın";
  const now = audio.routeNow || {};

  return (
    <div className="mx">
      {!audio.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> Ses karıştırıcı açılamadı; yayın sessiz gider.</div>}
      <div className="mx-status">
        <span className="mx-status__ctx">Şu an: <b>{ctxLabel}</b></span>
        <span className="mx-status__route">Yayına giden: {ROUTE_GROUPS.filter((g) => now[g.key]).map((g) => <em key={g.key}>{g.label}</em>)}{!ROUTE_GROUPS.some((g) => now[g.key]) && <em className="is-none">hiçbiri</em>}</span>
        <span className="st-top__spacer" />
        <button type="button" className={`btn btn--sm st-mic-mini ${mic.muted ? "is-off" : ""}`} onClick={audio.toggleMic}>{mic.muted ? "MİKROFON KAPALI" : "MİKROFON AÇIK"} <Kbd>M</Kbd></button>
      </div>
      <div className="mx-console">
        <div className="mx-strips">
          {audio.strips.map((s) => (
            <Strip key={s.id} strip={s} st={a.strips[s.id]} audio={audio} bind={bind}
              status={s.kind === "mic" ? (status === "live" ? "live" : status === "waiting" ? "wait" : "err") : s.kind === "input" ? ({ live: "live", waiting: "wait", error: "err" }[audio.inputStatus[s.id]] || null) : s.kind === "music" ? (audio.music.playing ? "live" : null) : null} />
          ))}
        </div>
        <MasterStrip audio={audio} bind={bind} />
      </div>
      <div className="mx-cards">
        <RoutingMatrix audio={audio} />
        <section className="st-card">
          <header className="st-card__head"><Icon name="mic" size={15} /><strong>Mikrofon</strong></header>
          <Field label="Aygıt">
            <select value={mic.deviceId || ""} onChange={(e) => setMicCfg({ deviceId: e.target.value || null })}>
              <option value="">Sistem varsayılanı</option>
              {devices.audio.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
            </select>
          </Field>
          <label className="toggle"><input type="checkbox" checked={mic.noiseSuppression} onChange={(e) => setMicCfg({ noiseSuppression: e.target.checked })} /> Gürültü azaltma (rüzgâr, uğultu)</label>
          {MIC_STATUS[status] && <p className={`st-hint ${status === "denied" || status === "error" || status === "ended" ? "text-red" : ""}`}>{MIC_STATUS[status]}</p>}
          {(status === "denied" || status === "error" || status === "ended" || status === "missing") && onRequestMic && (
            <button type="button" className="btn btn--sm" onClick={onRequestMic}><Icon name="refresh" size={12} /> {status === "denied" ? "Mikrofon izni iste" : "Yeniden bağlan"}</button>
          )}
          <header className="st-card__head mx-sub"><Icon name="plus" size={13} /><strong>Ek ses girişleri</strong>
            <button type="button" className="btn btn--xs" onClick={addInput} disabled={!devices.audio.length}><Icon name="plus" size={11} /> Ekle</button>
          </header>
          <p className="st-hint">Kamera sesi, yakalama kartı ya da ikinci mikrofon: her biri ayrı şerit (Canlı mikrofon barası).</p>
          {a.inputs.map((input) => (
            <div key={input.id} className="st-row">
              <select value={input.deviceId || ""} onChange={(e) => setInput(input.id, { deviceId: e.target.value, name: devices.audio.find((d) => d.deviceId === e.target.value)?.label || "Ses girişi" })}>
                {devices.audio.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Ses girişi ${i + 1}`}</option>)}
              </select>
              <button type="button" className="icon-btn" title="Kaldır" onClick={() => removeInput(input.id)}><Icon name="trash" size={14} /></button>
              {audio.inputStatus[input.id] === "error" && <small className="text-red">açılamadı</small>}
            </div>
          ))}
        </section>
        <MusicCard audio={audio} />
      </div>
    </div>
  );
}
