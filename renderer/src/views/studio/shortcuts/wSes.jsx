// Yayın Stüdyosu · SES ve MÜZİK düğmeleri: kanal fader'ı (sessiz, solo, seviye, ölçer;
// kanal seçeneklerden), mini karıştırıcı (2–6 kanal), ana çıkış + tümünü kapat,
// kısmalı mikrofon (mikrofon açılınca müzik kısılır), yayına giden ses (bağlam × grup),
// ses ön ayarları (karıştırıcı anlık görüntüsü kaydet / çağır), "Sessize al N sn",
// müzik çalar, gol müziği.
//
// Hepsi karıştırıcının kendi işlevleriyle çalışır (ctx.mixer = useStudioAudio:
// setStrip, setMaster, setKillAll, setRoute, setScene, music, update) — kopya kural yok.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { FADER_MAX_DB, FADER_MIN_DB, PLAYBACK_CONTEXTS, ROUTE_GROUPS, dbText, patchStrip, routingFor } from "../../../lib/studio/audio";
import { levelFromSamples } from "../../../lib/studio/compose";
import { DUCK_DEPTHS, PRESET_SLOTS, applyMixerSnapshot, duckedDb, dumpLeft, loadPresets, mixerSnapshot, pickStrips, savePresets } from "./flowLogic";
import { Chip, FlowNote, Head, Kbd, Pill, Ring, Shell, hk, openPop, startTimer, stopTimer, timerOf, useNow, usePress } from "./wkit";

const store = () => { try { return window.localStorage; } catch { return null; } };
const noMixer = (w, h, label = "SES") => <Shell tone="green" w={w} h={h}><Head icon="sliders" label={label} /><span className="st-w__empty">Karıştırıcı hazır değil.</span></Shell>;
const faderOf = (A, id) => { const f = A.settings?.strips?.[id]?.fader; return Number.isFinite(f) ? f : FADER_MIN_DB; };

/** Seviye ölçeri (yatay ya da dikey), kendi rAF döngüsüyle. */
export function Meter({ getAnalyser, muted, vertical = false }) {
  const ref = useRef(null);
  const get = useRef(getAnalyser);
  get.current = getAnalyser;
  useEffect(() => {
    let raf = 0; let buf = null; let peak = 0;
    const loop = () => {
      const a = get.current?.();
      let pct = 0;
      if (a) { if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize); a.getFloatTimeDomainData(buf); pct = levelFromSamples(buf).pct; }
      peak = Math.max(pct, peak - 1.5);
      if (ref.current) { ref.current.style.setProperty("--lvl", `${pct.toFixed(1)}%`); ref.current.style.setProperty("--peak", `${peak.toFixed(1)}%`); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref} className={`wx-meter ${vertical ? "is-v" : ""} ${muted ? "is-muted" : ""}`} aria-hidden="true"><i /><b /></span>;
}

/** Fader (yatay ya da dikey kaydırıcı); çift tık 0 dB. */
function Fader({ value, onChange, vertical, label }) {
  const v = Math.max(FADER_MIN_DB, Number.isFinite(value) ? value : FADER_MIN_DB);
  return (
    <input type="range" className={`wx-fader ${vertical ? "is-v" : ""}`} min={FADER_MIN_DB} max={FADER_MAX_DB} step={0.5} value={v} aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(0)} title={`${label}: ${dbText(v)} dB · çift tık: 0 dB`} />
  );
}

/* ═════════════════════════ KANAL FADER'I ═════════════════════════ */

function StripOptions({ ctx, item, onClose, multi = false }) {
  const A = ctx.mixer;
  const cur = multi ? (item.opts?.strips || []) : [item.opts?.strip || "mic"];
  const [sel, setSel] = useState(cur);
  if (!A?.strips) return <FlowNote tone="warn">Karıştırıcı hazır değil.</FlowNote>;
  const set = (patch) => (ctx.setItemOpts ? ctx.setItemOpts(item.id, patch) : ctx.toast?.("Seçim bu panoda kaydedilemiyor.", { tone: "warn" }));
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : [...s, id]));
  return (
    <div className="wx-flow">
      <FlowNote icon="sliders">{multi ? "Gösterilecek kanallar (en çok 6, sırayla):" : "Bu düğme hangi kanalı yönetsin?"}</FlowNote>
      <div className="wx-grid is-2">
        {A.strips.map((s) => (
          <Chip key={s.id} icon={s.icon || "mic"} on={sel.includes(s.id)} onClick={() => (multi ? toggle(s.id) : (set({ strip: s.id }), onClose()))} sub={multi && sel.includes(s.id) ? `${sel.indexOf(s.id) + 1}.` : null}>{s.label}</Chip>
        ))}
      </div>
      {multi && <button type="button" className="wx-primary" onClick={() => { set({ strips: sel }); onClose(); }}><Icon name="check" size={13} /> Kaydet ({sel.length || "ilk kanallar"})</button>}
    </div>
  );
}

function FaderTile({ ctx, item, w, h, togglePop }) {
  const A = ctx.mixer;
  const opts = () => openPop(item, togglePop, { mode: "options" });
  const press = usePress(() => { if (A?.setStrip && s) A.setStrip(s.id, { mute: !st.mute }); }, opts);
  if (!A?.strips || !A.setStrip) return noMixer(w, h, "KANAL");
  const s = A.strips.find((x) => x.id === (item.opts?.strip || "mic")) || A.strips[0];
  const st = A.settings?.strips?.[s.id] || {};
  const onAir = Boolean(A.airOf?.(s.id)?.onAir);
  const meter = <Meter getAnalyser={() => A.analyser?.(s.id)?.L || null} muted={st.mute} vertical={h >= 2} />;
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone={st.mute ? "danger" : "green"} w={w} h={h} state={st.mute ? null : onAir ? "pvw" : null} className="wx-tile wx-fd1" {...press} title={`${s.label}: tık sessiz · sağ tık / basılı tut: kanal seç`}>
        <Icon name={st.mute ? "micOff" : s.icon || "mic"} size={20} strokeWidth={2.2} />
        <strong className="wx-t">{st.mute ? "SESSİZ" : s.label}</strong>
        <small className="wx-s">{st.mute ? s.label : `${dbText(faderOf(A, s.id))} dB`}</small>
        {meter}
      </Shell>
    );
  }
  return (
    <Shell tone="green" w={w} h={h} state={st.mute ? null : st.solo ? "armed" : null} className={`wx-fd ${h >= 2 ? "is-v" : "is-h"} ${st.mute ? "is-muted" : ""}`} onContextMenu={(e) => { e.preventDefault(); opts(); }}>
      <Head icon={s.icon || "mic"} label={s.label} right={<button type="button" className="wx-gear" onClick={opts} title="Kanal seç"><Icon name="sliders" size={11} /></button>} />
      <div className="wx-fd__body">
        {h >= 2 && <span className="wx-fd__mtr">{meter}</span>}
        <Fader value={faderOf(A, s.id)} vertical={h >= 2} label={s.label} onChange={(v) => A.setStrip(s.id, { fader: v })} />
        <div className="wx-fd__btns">
          <button type="button" className={`wx-ms is-m ${st.mute ? "is-on" : ""}`} onClick={() => A.setStrip(s.id, { mute: !st.mute })} title="Sessiz">M</button>
          <button type="button" className={`wx-ms is-s ${st.solo ? "is-on" : ""}`} onClick={() => A.setStrip(s.id, { solo: !st.solo })} title="Solo (yalnız kulaklıkta dinle)">S</button>
          <em className="wx-db">{dbText(faderOf(A, s.id))}</em>
        </div>
      </div>
      {h === 1 && meter}
    </Shell>
  );
}

/* ═════════════════════════ MİNİ KARIŞTIRICI ═════════════════════════ */

const mixN = (w, h) => (w >= 4 ? 6 : w >= 3 ? 4 : w === 2 && h === 2 ? 3 : 2);
function MiniMixer({ ctx, item, w, h, togglePop }) {
  const A = ctx.mixer;
  if (!A?.strips || !A.setStrip) return noMixer(w, h, "KARIŞTIRICI");
  const list = pickStrips(A.strips, item.opts?.strips, mixN(w, h));
  const opts = () => openPop(item, togglePop, { mode: "options" });
  return (
    <Shell tone="green" w={w} h={h} state={A.killAll ? "air" : null} className={`wx-mm ${h >= 2 ? "is-v" : "is-h"}`} onContextMenu={(e) => { e.preventDefault(); opts(); }}>
      <Head icon="sliders" label="KARIŞTIRICI" right={<>{A.killAll && <Pill tone="danger">TÜMÜ KAPALI</Pill>}<button type="button" className="wx-gear" onClick={opts} title="Kanalları seç"><Icon name="sliders" size={11} /></button></>} />
      <div className="wx-mm__strips" style={{ "--n": list.length }}>
        {list.map((s) => {
          const st = A.settings?.strips?.[s.id] || {};
          return (
            <div key={s.id} className={`wx-mm__ch ${st.mute ? "is-muted" : ""} ${st.solo ? "is-solo" : ""}`}>
              <span className="wx-mm__n" title={s.label}>{s.label}</span>
              {h >= 2 && <span className="wx-mm__mtr"><Meter getAnalyser={() => A.analyser?.(s.id)?.L || null} muted={st.mute} vertical /></span>}
              <Fader value={faderOf(A, s.id)} vertical={h >= 2} label={s.label} onChange={(v) => A.setStrip(s.id, { fader: v })} />
              <span className="wx-mm__b">
                <button type="button" className={`wx-ms is-m ${st.mute ? "is-on" : ""}`} onClick={() => A.setStrip(s.id, { mute: !st.mute })} title={`${s.label}: sessiz`}>M</button>
                {(h >= 2 || w >= 3) && <button type="button" className={`wx-ms is-s ${st.solo ? "is-on" : ""}`} onClick={() => A.setStrip(s.id, { solo: !st.solo })} title={`${s.label}: solo`}>S</button>}
              </span>
              {h === 1 && <Meter getAnalyser={() => A.analyser?.(s.id)?.L || null} muted={st.mute} />}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ ANA ÇIKIŞ + TÜMÜNÜ KAPAT ═════════════════════════ */

function MasterKill({ ctx, w, h }) {
  const A = ctx.mixer;
  if (!A?.setKillAll) return noMixer(w, h, "ANA ÇIKIŞ");
  const kill = Boolean(A.killAll);
  const killBtn = (
    <button type="button" className={`wx-kill ${kill ? "is-on" : ""}`} onClick={() => A.setKillAll(!kill)} title={kill ? "Sesleri yeniden yayına ver" : "Yayına hiç ses gitmesin (şerit ayarları korunur)"}>
      <Icon name={kill ? "micOff" : "mic"} size={w === 1 && h === 1 ? 20 : 15} strokeWidth={2.3} />
      <span>{kill ? "SES KAPALI · AÇ" : "TÜMÜNÜ KAPAT"}</span>
    </button>
  );
  if (w === 1 && h === 1) return <Shell tone="danger" w={w} h={h} state={kill ? "air" : null} className="wx-mk1">{killBtn}<Meter getAnalyser={() => A.masterAnalyser?.()?.L || null} muted={kill} /></Shell>;
  const mf = Number.isFinite(A.settings?.master?.fader) ? A.settings.master.fader : 0;
  return (
    <Shell tone="danger" w={w} h={h} state={kill ? "air" : null} className={`wx-mk ${h >= 2 ? "is-v" : "is-h"}`}>
      <Head icon="broadcast" label="ANA ÇIKIŞ" right={<em className="wx-db">{dbText(mf)} dB</em>} />
      <div className="wx-mk__body">
        {h >= 2 && <span className="wx-fd__mtr is-2"><Meter getAnalyser={() => A.masterAnalyser?.()?.L || null} muted={kill} vertical /><Meter getAnalyser={() => A.masterAnalyser?.()?.R || null} muted={kill} vertical /></span>}
        <Fader value={mf} vertical={h >= 2} label="Ana çıkış" onChange={(v) => A.setMaster?.({ fader: v })} />
      </div>
      {h === 1 && <Meter getAnalyser={() => A.masterAnalyser?.()?.L || null} muted={kill} />}
      {killBtn}
    </Shell>
  );
}

/* ═════════════════════════ KISMALI MİKROFON ═════════════════════════ */

const duckMem = { prev: null };
function DuckOptions({ ctx, item, onClose }) {
  const cur = Number(item.opts?.depth) || 12;
  return (
    <div className="wx-flow">
      <FlowNote icon="music">Mikrofon açılınca müzik ne kadar kısılsın?</FlowNote>
      <div className="wx-grid is-4">{DUCK_DEPTHS.map((d) => <Chip key={d} on={cur === d} onClick={() => { ctx.setItemOpts?.(item.id, { depth: d }); onClose(); }}>−{d} dB</Chip>)}</div>
    </div>
  );
}
function MicDuck({ ctx, item, w, h, togglePop }) {
  const A = ctx.mixer;
  const M = ctx.mic;
  const depth = Number(item.opts?.depth) || 12;
  const ducked = duckMem.prev != null;
  const toggle = () => {
    const opening = M.muted;
    M.toggle();
    if (!A?.setStrip || !A.settings?.strips?.music) return;
    if (opening && duckMem.prev == null) { duckMem.prev = faderOf(A, "music"); A.setStrip("music", { fader: duckedDb(duckMem.prev, depth) }); }
    else if (!opening && duckMem.prev != null) { A.setStrip("music", { fader: duckMem.prev }); duckMem.prev = null; }
  };
  const press = usePress(toggle, () => openPop(item, togglePop, { mode: "options" }));
  const on = !M.muted;
  return (
    <Shell as="button" tone={on ? "green" : "plain"} w={w} h={h} state={on ? "air" : null} className="wx-tile wx-duck" {...press} title={`Mikrofon aç / kapat · açıkken müzik −${depth} dB kısılır · sağ tık: kısma miktarı`}>
      <Kbd k={hk(ctx, "mic")} />
      <Icon name={on ? "mic" : "micOff"} size={h >= 2 ? 28 : 20} strokeWidth={2.2} />
      <strong className="wx-t">{on ? "KONUŞUYOR" : "MİK + KISMA"}</strong>
      <small className="wx-s">{on && ducked ? `müzik −${depth} dB` : `müzik −${depth} dB kısılır`}</small>
      {(w >= 2 || h >= 2) && <Meter getAnalyser={M.analyser} muted={M.muted} />}
    </Shell>
  );
}

/* ═════════════════════════ YAYINA GİDEN SES ═════════════════════════ */

function RouteTile({ ctx, w, h }) {
  const A = ctx.mixer;
  if (!A?.setRoute) return noMixer(w, h, "YAYINA GİDEN SES");
  const curCtx = A.playback || "live";
  const rows = h >= 2 ? PLAYBACK_CONTEXTS : PLAYBACK_CONTEXTS.filter((c) => c.key === curCtx);
  const progId = A.programSceneId;
  const micScenes = A.scenesOf?.("mic");
  const micHere = !Array.isArray(micScenes) || (progId && micScenes.includes(progId));
  return (
    <Shell tone="green" w={w} h={h} className="wx-route">
      <Head icon="grid" label="YAYINA GİDEN SES" right={<Pill tone="green">{PLAYBACK_CONTEXTS.find((c) => c.key === curCtx)?.label || "Canlı"}</Pill>} />
      <div className="wx-route__g" style={{ "--cols": ROUTE_GROUPS.length }}>
        {rows.map((c) => {
          const r = routingFor(c.key, A.routing);
          return (
            <div key={c.key} className={`wx-route__r ${c.key === curCtx ? "is-now" : ""}`}>
              {(h >= 2 || w >= 3) && <span className="wx-route__l" title={c.hint}>{c.label}</span>}
              {ROUTE_GROUPS.map((g) => <button key={g.key} type="button" className={r[g.key] ? "is-on" : ""} onClick={() => A.setRoute(c.key, g.key, !r[g.key])} title={`${c.label} sırasında ${g.label}: ${r[g.key] ? "yayında" : "kapalı"}`}>{g.short}</button>)}
            </div>
          );
        })}
      </div>
      {w >= 3 && h >= 2 && A.setScene && progId && (
        <button type="button" className={`wx-wide ${micHere ? "is-on" : ""}`} onClick={() => A.setScene("mic", progId, !micHere)} title="Sahne başına ses: mikrofon bu (yayındaki) sahnede yayına gitsin mi">
          <Icon name="mic" size={12} /> Mikrofon bu sahnede {micHere ? "AÇIK" : "KAPALI"}
        </button>
      )}
    </Shell>
  );
}

/* ═════════════════════════ SES ÖN AYARLARI ═════════════════════════ */

function usePresets() {
  const [p, setP] = useState(() => loadPresets(store()));
  const put = (next) => { setP(next); savePresets(store(), next); };
  return [p, put];
}
function PresetOptions({ ctx, onClose }) {
  const A = ctx.mixer;
  const [p, put] = usePresets();
  const [names, setNames] = useState(() => Object.fromEntries(PRESET_SLOTS.map((k) => [k, p[k]?.name || ""])));
  if (!A?.settings) return <FlowNote tone="warn">Karıştırıcı hazır değil.</FlowNote>;
  const saveSlot = (k) => { put({ ...p, [k]: mixerSnapshot(A.settings, { name: names[k] || `Ön ayar ${k}` }) }); ctx.toast?.(`Ses ön ayarı ${k} kaydedildi.`, { tone: "success", timeout: 2000 }); };
  const del = (k) => { const n = { ...p }; delete n[k]; put(n); };
  return (
    <div className="wx-flow wx-presets">
      <FlowNote icon="sliders">Şimdiki karıştırıcıyı (fader, sessiz, solo, ana çıkış) bir yuvaya kaydet.</FlowNote>
      {PRESET_SLOTS.map((k) => (
        <div key={k} className="wx-row is-preset">
          <b className="wx-slot">{k}</b>
          <input value={names[k]} placeholder={`Ön ayar ${k}`} onChange={(e) => setNames((x) => ({ ...x, [k]: e.target.value }))} />
          <button type="button" className="wx-primary is-sm" onClick={() => saveSlot(k)}>{p[k] ? "Üzerine yaz" : "Kaydet"}</button>
          <button type="button" className="wx-icon" disabled={!p[k]} onClick={() => del(k)} title="Sil"><Icon name="trash" size={12} /></button>
        </div>
      ))}
      <button type="button" className="wx-link" onClick={onClose}>Kapat</button>
    </div>
  );
}
function PresetTile({ ctx, item, w, h, togglePop }) {
  const A = ctx.mixer;
  const [p] = usePresets();
  const [last, setLast] = useState(null);
  if (!A?.update) return noMixer(w, h, "SES ÖN AYARI");
  const opts = () => openPop(item, togglePop, { mode: "options" });
  const recall = (k) => {
    if (!p[k]) { opts(); return; }
    A.update((cur) => applyMixerSnapshot(cur, p[k], patchStrip));
    setLast(k);
    ctx.toast?.(`Ses ön ayarı ${k}${p[k].name ? ` · ${p[k].name}` : ""} çağrıldı.`, { tone: "success", timeout: 2000 });
  };
  const slots = PRESET_SLOTS.slice(0, w === 1 && h === 1 ? 2 : 4);
  return (
    <Shell tone="green" w={w} h={h} className="wx-pre" onContextMenu={(e) => { e.preventDefault(); opts(); }}>
      {(h >= 2 || w >= 2) && <Head icon="sliders" label="SES ÖN AYARI" right={<button type="button" className="wx-gear" onClick={opts} title="Kaydet / üzerine yaz"><Icon name="pencil" size={11} /></button>} />}
      <div className={`wx-pre__g is-n${slots.length} ${h >= 2 ? "is-tall" : ""}`}>
        {slots.map((k) => (
          <button key={k} type="button" className={`wx-pre__b ${p[k] ? "is-saved" : ""} ${last === k ? "is-on" : ""}`} onClick={() => recall(k)} title={p[k] ? `Çağır: ${p[k].name || k}` : `${k} boş: tık kaydetme penceresini açar`}>
            <b>{k}</b>{(h >= 2 || w >= 3) && <small>{p[k]?.name || "boş"}</small>}
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ SESSİZE AL N SN ═════════════════════════ */

const DUMP_SECS = [3, 5, 10, 15];
function DumpOptions({ ctx, item, onClose }) {
  const cur = Number(item.opts?.sec) || 5;
  return (
    <div className="wx-flow">
      <FlowNote icon="micOff">Yayına giden ses kaç saniye kesilsin?</FlowNote>
      <div className="wx-grid is-4">{DUMP_SECS.map((s) => <Chip key={s} on={cur === s} onClick={() => { ctx.setItemOpts?.(item.id, { sec: s }); onClose(); }}>{s} sn</Chip>)}</div>
    </div>
  );
}
function DumpTile({ ctx, item, w, h, togglePop }) {
  const A = ctx.mixer;
  const sec = Number(item.opts?.sec) || 5;
  const key = `dump:${item.id}`;
  const t = timerOf(key);
  const now = useNow(Boolean(t), 100);
  const d = dumpLeft(t?.endsAt, t?.ms, now);
  const go = () => {
    if (!A?.setKillAll) return;
    if (d.active) { stopTimer(key, true, () => A.setKillAll(false)); return; }
    const before = Boolean(A.killAll);
    A.setKillAll(true);
    startTimer(key, sec * 1000, () => { if (!before) A.setKillAll(false); });
  };
  const press = usePress(go, () => openPop(item, togglePop, { mode: "options" }));
  return (
    <Shell as="button" tone="danger" w={w} h={h} state={d.active ? "air" : null} className="wx-tile wx-dump" disabled={!A?.setKillAll} {...press} title={`Yayına giden sesi ${sec} sn kes (tekrar tık: hemen aç) · sağ tık: süre`}>
      <Ring frac={d.active ? d.frac : 1} size={h >= 2 ? 46 : 32} tone={d.active ? "air" : "c"}><Icon name="micOff" size={h >= 2 ? 18 : 13} strokeWidth={2.3} /></Ring>
      <strong className="wx-t">{d.active ? `${Math.ceil(d.left / 1000)} SN` : `SESSİZ ${sec} SN`}</strong>
      <small className="wx-s">{d.active ? "tık: hemen aç" : "yayın sesi kesilir"}</small>
    </Shell>
  );
}

/* ═════════════════════════ MÜZİK ÇALAR ═════════════════════════ */

function MusicTile({ ctx, w, h }) {
  const A = ctx.mixer;
  const fileRef = useRef(null);
  const Mu = A?.music;
  if (!Mu?.play) return noMixer(w, h, "MÜZİK");
  const has = Boolean(Mu.url);
  const frac = Mu.duration ? Mu.time / Mu.duration : 0;
  const pick = () => fileRef.current?.click();
  const input = <input ref={fileRef} type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) Mu.load(f); e.target.value = ""; }} />;
  const playBtn = (
    <button type="button" className={`wx-play ${Mu.playing ? "is-on" : ""}`} onClick={() => (!has ? pick() : Mu.playing ? Mu.pause() : Mu.play())} title={!has ? "Müzik dosyası seç" : Mu.playing ? "Duraklat" : "Çal"}>
      <Icon name={!has ? "folder" : Mu.playing ? "pause" : "play"} size={w === 1 && h === 1 ? 18 : 16} strokeWidth={2.3} />
    </button>
  );
  if (w === 1 && h === 1) {
    return <Shell tone="violet" w={w} h={h} state={Mu.playing ? "air" : null} className="wx-mu1">{input}<Ring frac={frac} size={44}>{playBtn}</Ring><small className="wx-s">{Mu.name || Mu.savedName || "müzik yok"}</small></Shell>;
  }
  return (
    <Shell tone="violet" w={w} h={h} state={Mu.playing ? "air" : null} className={`wx-mu ${h >= 2 ? "is-tall" : ""}`}>
      {input}
      <Head icon="music" label="MÜZİK" right={Mu.playing ? <Pill tone="danger">ÇALIYOR</Pill> : null} />
      <div className="wx-mu__row">
        {playBtn}
        <button type="button" className="wx-icon" disabled={!has} onClick={Mu.stop} title="Durdur (başa sar)"><Icon name="stop" size={13} /></button>
        <span className="wx-mu__n" title={Mu.name || Mu.savedName}>{Mu.name || (Mu.savedName ? `${Mu.savedName} (yeniden seç)` : "Dosya seç")}</span>
        <button type="button" className="wx-icon" onClick={pick} title="Dosya seç"><Icon name="folder" size={13} /></button>
      </div>
      <span className="wx-prog"><i style={{ width: `${frac * 100}%` }} /></span>
      {h >= 2 && (
        <div className="wx-row is-vol">
          <Icon name="sliders" size={12} />
          <Fader value={faderOf(A, "music")} label="Müzik seviyesi" onChange={(v) => A.setStrip("music", { fader: v })} />
          <button type="button" className={`wx-ms ${Mu.loop ? "is-on" : ""}`} onClick={() => Mu.setLoop?.(!Mu.loop)} title="Döngü"><Icon name="repeat" size={11} /></button>
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ GOL MÜZİĞİ ═════════════════════════ */

function GoalMusicTile({ ctx, w, h }) {
  const gm = ctx.goalMusic;
  if (!gm) return <Shell tone="amber" w={w} h={h}><Head icon="music" label="GOL MÜZİĞİ" /><span className="st-w__empty">Gol müziği için maç aç.</span></Shell>;
  const playing = Boolean(gm.playing);
  const nm = (s) => (s === "home" ? ctx.event?.homeName : ctx.event?.awayName) || (s === "home" ? "Ev" : "Dep.");
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="amber" w={w} h={h} state={playing ? "air" : null} className="wx-tile" onClick={() => (playing ? gm.stop?.() : gm.play?.())}>
        <Kbd k={hk(ctx, "goalMusic")} />
        <Icon name={playing ? "stop" : "music"} size={20} strokeWidth={2.2} /><strong className="wx-t">{playing ? "MÜZİĞİ KES" : "GOL MÜZİĞİ"}</strong>
        <small className="wx-s">{gm.autoOnGoal ? "golde otomatik" : "elle"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="amber" w={w} h={h} state={playing ? "air" : null} className="wx-gm">
      <Head icon="music" label="GOL MÜZİĞİ" right={playing ? <Pill tone="danger">ÇALIYOR</Pill> : <small className="wx-head__r">yalnız hoparlör</small>} />
      <div className="wx-split__row">
        {["home", "away"].map((s) => <button key={s} type="button" className={`wx-half is-${s}`} onClick={() => gm.play?.(s)}><Icon name="play" size={12} /><strong>{nm(s)}</strong></button>)}
      </div>
      {h >= 2 && (
        <div className="wx-row is-vol">
          <Icon name="sliders" size={12} />
          <input type="range" min={0} max={100} value={Number(gm.volume) || 0} onChange={(e) => gm.setVolume?.(Number(e.target.value))} aria-label="Gol müziği sesi" />
          <button type="button" className={`wx-ms ${gm.autoOnGoal ? "is-on" : ""}`} onClick={() => gm.setAutoOnGoal?.(!gm.autoOnGoal)} title="Golde otomatik çal">OTO</button>
        </div>
      )}
      <button type="button" className={`wx-kill ${playing ? "is-on" : ""}`} disabled={!playing} onClick={() => gm.stop?.()}><Icon name="stop" size={13} /> <span>MÜZİĞİ KES</span></button>
    </Shell>
  );
}

export const SES_WIDGETS = {
  fader: { popTitle: "Kanal seç", popover: (p) => <StripOptions {...p} />, render: (p) => <FaderTile {...p} /> },
  miniMixer: { popTitle: "Karıştırıcı kanalları", popover: (p) => <StripOptions {...p} multi />, render: (p) => <MiniMixer {...p} /> },
  masterKill: { render: (p) => <MasterKill {...p} /> },
  micDuck: { popTitle: "Müzik kısma miktarı", popover: (p) => <DuckOptions {...p} />, render: (p) => <MicDuck {...p} /> },
  audioRoute: { render: (p) => <RouteTile {...p} /> },
  audioPreset: { popTitle: "Ses ön ayarları", popover: (p) => <PresetOptions {...p} />, render: (p) => <PresetTile {...p} /> },
  dump: { popTitle: "Sessize alma süresi", popover: (p) => <DumpOptions {...p} />, render: (p) => <DumpTile {...p} /> },
  musicPlayer: { render: (p) => <MusicTile {...p} /> },
  goalMusicPro: { render: (p) => <GoalMusicTile {...p} /> },
};
