// Yayın Stüdyosu · LED EKRAN düğmeleri: ekran başına aç / kapat, içerik (sahne · program
// aynası · yalnız skorbord · sponsor döngüsü · metin · saat · geri sayım · site sayfası),
// parlaklık / ölçek / konum, dondur / karart, kayan yazı, tekrarı LED'de göster, LED ön
// ayarları (A–D), ekran seçici, saat / geri sayım. Hepsi ctx.led'in (useLed) işlevleriyle:
// open / openOn / close / setRoute / setPref / setFx — LED penceresi (LedOutput) çizer.
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import {
  COUNTDOWN_MINUTES, LED_CONTENTS, LED_PRESET_SLOTS, LED_TEXT_PRESETS, LED_TICKER_PRESETS, TICKER_SPEEDS, countdownText, ledContentOf, ledPresetPatch, ledPresetSnapshot,
} from "../led/ledFx";
import { Chip, FlowNote, Head, Pill, Ring, Shell, openPop, useNow, usePress } from "./wkit";
import { useLocal } from "./localStore";
import { optMenu, withOptions } from "./wOptions";

const noLed = (w, h, label = "LED") => <Shell tone="blue" w={w} h={h}><Head icon="overview" label={label} /><span className="st-w__empty">LED çıkışı yok.</span></Shell>;
const dispName = (d) => (d ? d.label || `Ekran ${d.id}` : "ekran seç");
const dispRes = (d) => (d?.bounds ? `${d.bounds.width}×${d.bounds.height}` : "");
const isOpenOn = (L, id) => Boolean(L.status?.open) && String(L.status.displayId) === String(id);
const routeLabel = (L, scenes) => {
  const p = L.prefs || {};
  if (p.web) return "Site sayfası";
  if (p.route === "preview") return "Önizleme";
  if (p.route === "off") return "Kapalı";
  if (p.route === "scene") return scenes.find((s) => s.id === p.sceneId)?.name || "Sahne";
  return "Program";
};
const contentLabel = (L, scenes) => (L.fx.content === "scene" ? routeLabel(L, scenes) : ledContentOf(L.fx.content).label);

/* ═════════════════════════ AÇ / KAPAT · EKRAN ═════════════════════════ */

function LedPower({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  const press = usePress(() => {
    if (!L) return;
    if (L.status?.open) { if (item.opts?.confirmClose && ctx.ask) ctx.ask({ title: "LED kapatılsın mı?", message: "LED ekran penceresi kapanır.", confirmLabel: "Kapat" }).then((ok) => ok && L.close()); else L.close(); } else L.open();
  }, () => openPop(item, togglePop, { mode: "options" }));
  if (!L) return noLed(w, h);
  const open = Boolean(L.status?.open);
  const cur = L.displays.find((d) => String(d.id) === String(open ? L.status.displayId : L.prefs.displayId));
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={open ? "air" : null} className="wx-tile" disabled={!L.available || (!open && L.prefs.displayId == null)} {...press} title="Tık: LED aç / kapat · sağ tık: seçenekler">
        <Icon name="overview" size={20} strokeWidth={2.2} />
        <strong className="wx-t">{open ? "LED AÇIK" : "LED KAPALI"}</strong>
        <small className="wx-s">{dispName(cur)}</small>
      </Shell>
    );
  }
  const list = L.displays.slice(0, h >= 2 ? 6 : 2);
  return (
    <Shell tone="blue" w={w} h={h} state={open ? "air" : null} className="wl-pw">
      <Head icon="overview" label="LED ÇIKIŞI" right={<button type="button" className={`wx-sw ${open ? "is-on" : ""}`} disabled={!L.available || (!open && L.prefs.displayId == null)} {...press}>{open ? "AÇIK" : "KAPALI"}</button>} />
      <div className={`wl-disp ${w >= 3 ? "is-c3" : h >= 2 ? "is-c1" : "is-c2"}`}>
        {list.map((d) => {
          const on = isOpenOn(L, d.id);
          return (
            <button key={d.id} type="button" className={`wl-disp__b ${on ? "is-on" : ""} ${String(L.prefs.displayId) === String(d.id) ? "is-sel" : ""}`} onClick={() => (on ? L.close() : L.openOn(d.id))} title={on ? "Bu ekrandaki LED'i kapat" : "LED'i bu ekranda aç"}>
              <i className={on ? "is-on" : ""} /><span>{dispName(d)}</span>{(h >= 2 || w >= 3) && <small>{dispRes(d)}{d.primary ? " · ana" : ""}</small>}
            </button>
          );
        })}
        {!list.length && <span className="st-w__empty">Ekran bulunamadı.</span>}
      </div>
      {h >= 2 && <small className="wx-s">{open ? `Gösteriyor: ${contentLabel(L, ctx.scenes || [])}` : L.error || "Ekrana dokun: o ekranda aç"}</small>}
    </Shell>
  );
}

/* ═════════════════════════ İÇERİK ═════════════════════════ */

const ROUTES = [["program", "Program"], ["preview", "Önizleme"], ["off", "Kapalı"]];
function setContent(ctx, key) {
  const L = ctx.led;
  if (!L) return;
  if (key === "web") { L.setPref({ web: true }); L.setFx({ content: "scene" }); return; }
  if (L.prefs.web) L.setPref({ web: false });
  const ops = ctx.ops?.led || {};
  if (key === "countdown" && !L.fx.countdownEndsAt) L.setFx({ content: key, countdownEndsAt: Date.now() + (L.fx.countdownMin || ops.countdownMin || 5) * 60_000 });
  else if (key === "sponsor" && !L.fx.sponsors.length) L.setFx({ content: key, sponsors: sponsorsOf(ctx) });
  else L.setFx({ content: key });
}
const sponsorsOf = (ctx) => (ctx.g?.desk?.sponsors || []).map((s) => ({ name: s.name || "", logo: s.images?.logo || s.images?.corner || s.logo || null })).filter((s) => s.name || s.logo);

function ContentFlow({ ctx, onClose, setWide }) {
  const L = ctx.led;
  const [text, setText] = useState(L?.fx.text || "");
  React.useEffect(() => { setWide?.(true); }, [setWide]);
  if (!L) return <FlowNote tone="warn">LED çıkışı yok.</FlowNote>;
  const fx = L.fx;
  return (
    <div className="wx-flow">
      <section className="wx-flow__sec"><h6>İçerik</h6>
        <div className="wx-grid is-4">{LED_CONTENTS.map((c) => <Chip key={c.key} icon={c.icon} on={!L.prefs.web && fx.content === c.key} onClick={() => setContent(ctx, c.key)} title={c.hint}>{c.label}</Chip>)}
          <Chip icon="globe" on={Boolean(L.prefs.web)} onClick={() => setContent(ctx, "web")}>Site sayfası</Chip></div>
      </section>
      {fx.content === "scene" && !L.prefs.web && (
        <section className="wx-flow__sec"><h6>Sahne yönlendirmesi</h6>
          <div className="wx-grid is-4">{ROUTES.map(([k, l]) => <Chip key={k} on={L.prefs.route === k} onClick={() => L.setRoute({ route: k })}>{l}</Chip>)}
            {(ctx.scenes || []).map((s) => <Chip key={s.id} icon="layers" on={L.prefs.route === "scene" && L.prefs.sceneId === s.id} onClick={() => L.setRoute({ route: "scene", sceneId: s.id })}>{s.name}</Chip>)}</div>
        </section>
      )}
      {fx.content === "text" && (
        <section className="wx-flow__sec"><h6>Metin <small>Enter: satır · Uygula</small></h6>
          <textarea className="wl-ta" rows={3} value={text} maxLength={240} onChange={(e) => setText(e.target.value)} />
          <div className="wx-row is-actions">
            <input type="color" value={fx.textColor} onChange={(e) => L.setFx({ textColor: e.target.value })} title="Yazı rengi" />
            <input type="color" value={fx.bg} onChange={(e) => L.setFx({ bg: e.target.value })} title="Zemin rengi" />
            <button type="button" className="wx-primary is-sm" onClick={() => { L.setFx({ text }); onClose(); }}><Icon name="check" size={12} /> Uygula</button>
          </div>
          <div className="wx-grid is-3">{LED_TEXT_PRESETS.map((t) => <Chip key={t} onClick={() => { setText(t); L.setFx({ text: t }); }}>{t}</Chip>)}</div>
        </section>
      )}
      {fx.content === "countdown" && (
        <section className="wx-flow__sec"><h6>Geri sayım · {countdownText(fx.countdownEndsAt)}</h6>
          <div className="wx-grid is-4">{COUNTDOWN_MINUTES.map((m) => <Chip key={m} onClick={() => L.setFx({ countdownMin: m, countdownEndsAt: Date.now() + m * 60_000 })}>{m} dk</Chip>)}</div>
          <div className="wx-row is-text"><input value={fx.countdownLabel} maxLength={60} placeholder="Başlık" onChange={(e) => L.setFx({ countdownLabel: e.target.value })} /></div>
        </section>
      )}
      {fx.content === "sponsor" && (
        <section className="wx-flow__sec"><h6>Sponsorlar · {fx.sponsors.length} · her {fx.sponsorSec} sn</h6>
          <div className="wx-row is-actions">
            <button type="button" className="wx-btn" onClick={() => L.setFx({ sponsors: sponsorsOf(ctx) })}><Icon name="refresh" size={12} /> Maçın sponsorlarını al</button>
            {[5, 8, 12, 20].map((s) => <button key={s} type="button" className={`wx-btn ${fx.sponsorSec === s ? "is-pvw" : ""}`} onClick={() => L.setFx({ sponsorSec: s })}>{s} sn</button>)}
          </div>
          {!fx.sponsors.length && <FlowNote tone="warn">Bu maçta sponsor yok: sponsor adları yerine “SPONSOR” yazar.</FlowNote>}
        </section>
      )}
      <button type="button" className="st-link" onClick={() => { ctx.openLedTab?.(); onClose(); }}>LED ekran sekmesi →</button>
    </div>
  );
}

function LedContent({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.led;
  const press = usePress(() => openPop(item, togglePop, {}), () => openPop(item, togglePop, { mode: "options" }));
  if (!L) return noLed(w, h, "LED İÇERİK");
  const fx = L.fx;
  const open = Boolean(L.status?.open);
  const cur = L.prefs.web ? "web" : fx.content;
  const icon = L.prefs.web ? "globe" : ledContentOf(fx.content).icon;
  if (w === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={open ? "air" : popOpen ? "armed" : null} className="wx-tile" {...press} title="İçerik seç · sağ tık: seçenekler">
        <Icon name={icon} size={h >= 2 ? 24 : 20} strokeWidth={2.2} />
        <strong className="wx-t">LED İÇERİK</strong>
        <small className="wx-s">{L.prefs.web ? "Site sayfası" : contentLabel(L, ctx.scenes || [])}</small>
      </Shell>
    );
  }
  const quick = (item.opts?.quick || ["scene", "mirror", "scoreboard", "sponsor", "text", "clock", "countdown", "web"]).slice(0, h >= 2 ? (w >= 3 ? 8 : 6) : w >= 3 ? 4 : 3);
  return (
    <Shell tone="blue" w={w} h={h} state={open ? "air" : popOpen ? "armed" : null} className="wl-ct">
      <Head icon={icon} label="LED İÇERİK" right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Tüm içerikler, metin, geri sayım, sahne"><Icon name="pencil" size={11} /></button>} />
      <div className={`wx-chips is-wrap is-c${w >= 3 ? 4 : 3}`}>
        {quick.map((k) => {
          const c = k === "web" ? { key: "web", label: "Site" } : ledContentOf(k);
          return <button key={k} type="button" className={cur === k ? "is-on" : ""} onClick={() => setContent(ctx, k)} title={c.hint}>{c.label.replace("Program aynası", "Ayna").replace("Yalnız skorbord", "Skorbord").replace("Sponsor döngüsü", "Sponsor")}</button>;
        })}
      </div>
      {h >= 2 && fx.content === "scene" && !L.prefs.web && (
        <div className="wx-row">{ROUTES.map(([k, l]) => <button key={k} type="button" className={L.prefs.route === k ? "is-on" : ""} onClick={() => L.setRoute({ route: k })}>{l}</button>)}</div>
      )}
      {h >= 2 && fx.content !== "scene" && <small className="wx-s">{fx.content === "text" ? `“${fx.text}”` : fx.content === "countdown" ? `${countdownText(fx.countdownEndsAt)} · ${fx.countdownLabel}` : ledContentOf(fx.content).hint}</small>}
    </Shell>
  );
}

/* ═════════════════════════ PARLAKLIK · ÖLÇEK · KONUM ═════════════════════════ */

function LedAdjust({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  if (!L) return noLed(w, h, "LED AYAR");
  const fx = L.fx;
  const st = Number(item.opts?.step) || 2;
  const nudge = (dx, dy) => L.setFx({ offX: fx.offX + dx * st, offY: fx.offY + dy * st });
  const om = optMenu(item, togglePop);
  const changed = fx.brightness !== 100 || fx.scale !== 100 || fx.offX || fx.offY;
  const reset = <button type="button" className="wx-gear" disabled={!changed} onClick={() => L.setFx({ brightness: 100, scale: 100, offX: 0, offY: 0 })} title="Sıfırla (100 %, ortada)"><Icon name="undo" size={11} /></button>;
  const bright = (
    <label className="wl-sl" title="Parlaklık">
      <Icon name="sun" size={12} />
      <input type="range" min={10} max={100} step={5} value={fx.brightness} onChange={(e) => L.setFx({ brightness: Number(e.target.value) })} aria-label="Parlaklık" />
      <b>{fx.brightness}</b>
    </label>
  );
  if (w === 1) {
    return (
      <Shell tone="blue" w={w} h={h} className="wl-adj is-v" {...om}>
        <Head icon="sun" label="LED" right={reset} />
        <input type="range" className="wl-vsl" min={10} max={100} step={5} value={fx.brightness} onChange={(e) => L.setFx({ brightness: Number(e.target.value) })} aria-label="Parlaklık" />
        <small className="wx-s">%{fx.brightness}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} className="wl-adj" {...om}>
      <Head icon="sun" label="LED GÖRÜNTÜ" right={reset} />
      {bright}
      {(h >= 2 || w >= 3) && (
        <label className="wl-sl" title="Ölçek">
          <Icon name="overview" size={12} />
          <input type="range" min={50} max={150} step={5} value={fx.scale} onChange={(e) => L.setFx({ scale: Number(e.target.value) })} aria-label="Ölçek" />
          <b>{fx.scale}</b>
        </label>
      )}
      {h >= 2 && (
        <div className="wl-pad">
          <button type="button" onClick={() => nudge(-1, 0)} title="Sola"><Icon name="chevronLeft" size={12} /></button>
          <button type="button" onClick={() => nudge(0, -1)} title="Yukarı"><Icon name="chevronUp" size={12} /></button>
          <button type="button" onClick={() => nudge(0, 1)} title="Aşağı"><Icon name="chevronDown" size={12} /></button>
          <button type="button" onClick={() => nudge(1, 0)} title="Sağa"><Icon name="chevronRight" size={12} /></button>
          <small>{fx.offX},{fx.offY}</small>
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ DONDUR / KARART ═════════════════════════ */

function LedFreeze({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  const mode = item.opts?.mode || "freeze";
  const press = usePress(() => L?.setFx({ [mode]: !L.fx[mode] }), () => openPop(item, togglePop, { mode: "options" }));
  if (!L) return noLed(w, h, "LED");
  const fx = L.fx;
  if (w === 1 && h === 1) {
    const on = fx[mode];
    return (
      <Shell as="button" tone={mode === "black" ? "plain" : "blue"} w={w} h={h} state={on ? "air" : null} className="wx-tile" {...press} title="Tık: aç / kapat · sağ tık: dondur ya da karart">
        <Icon name={mode === "black" ? "eye" : "pause"} size={20} strokeWidth={2.2} />
        <strong className="wx-t">{on ? (mode === "black" ? "LED SİYAH" : "LED DONDU") : mode === "black" ? "LED KARART" : "LED DONDUR"}</strong>
        <small className="wx-s">{on ? "tık: devam" : "son kare kalır"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} state={fx.freeze || fx.black ? "air" : null} className="wx-split">
      {h >= 2 && <Head icon="overview" label="LED ANLIK" />}
      <div className={`wx-split__row ${w === 1 ? "is-col" : ""}`}>
        <button type="button" className={`wl-big ${fx.freeze ? "is-on" : ""}`} onClick={() => L.setFx({ freeze: !fx.freeze })} title="Son kare LED'de kalır"><Icon name="pause" size={14} /><strong>{fx.freeze ? "DEVAM" : "DONDUR"}</strong></button>
        <button type="button" className={`wl-big is-black ${fx.black ? "is-on" : ""}`} onClick={() => L.setFx({ black: !fx.black })} title="LED siyah (pencere açık kalır)"><Icon name="eye" size={14} /><strong>{fx.black ? "AÇ" : "KARART"}</strong></button>
      </div>
    </Shell>
  );
}

/* ═════════════════════════ KAYAN YAZI ═════════════════════════ */

function TickerFlow({ ctx, onClose }) {
  const L = ctx.led;
  const [text, setText] = useState(L?.fx.ticker.text || "");
  if (!L) return <FlowNote tone="warn">LED çıkışı yok.</FlowNote>;
  const t = L.fx.ticker;
  const apply = (x) => { L.setFx({ ticker: { text: x, on: true } }); onClose(); };
  return (
    <div className="wx-flow">
      <div className="wx-row is-text">
        <input autoFocus value={text} maxLength={300} placeholder="Kayan yazı, Enter: LED'de" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) apply(text.trim()); }} />
        <button type="button" className="wx-primary is-sm" disabled={!text.trim()} onClick={() => apply(text.trim())}>LED'de göster</button>
      </div>
      <div className="wx-row is-dur"><span>Hız</span>{TICKER_SPEEDS.map((s, i) => <button key={s} type="button" className={t.speed === s ? "is-on" : ""} onClick={() => L.setFx({ ticker: { speed: s } })}>{["Çok yavaş", "Yavaş", "Orta", "Hızlı", "Çok hızlı"][i]}</button>)}</div>
      <div className="wx-row is-actions">
        <label className="wx-field">Yazı <input type="color" value={t.color} onChange={(e) => L.setFx({ ticker: { color: e.target.value } })} /></label>
        <label className="wx-field">Bant <input type="color" value={t.bg} onChange={(e) => L.setFx({ ticker: { bg: e.target.value } })} /></label>
      </div>
      <div className="wx-grid">{[...LED_TICKER_PRESETS, ctx.ops?.led?.tickerText].filter((x, i, a) => x && a.indexOf(x) === i).map((p) => <Chip key={p} onClick={() => apply(p)}>{p}</Chip>)}</div>
    </div>
  );
}
function LedTicker({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.led;
  const [text, setText] = useState("");
  if (!L) return noLed(w, h, "KAYAN YAZI");
  const t = L.fx.ticker;
  const sw = <button type="button" className={`wx-sw ${t.on ? "is-on" : ""}`} onClick={() => L.setFx({ ticker: { on: !t.on } })}>{t.on ? "AKIYOR" : "KAPALI"}</button>;
  return (
    <Shell tone="blue" w={w} h={h} state={t.on ? "air" : popOpen ? "armed" : null} className="wl-tk">
      <Head icon="list" label="LED KAYAN YAZI" right={<>{sw}<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Metin, hız, renkler"><Icon name="pencil" size={11} /></button></>} />
      {h >= 2 && w >= 3 && (
        <div className="wx-row is-text"><input value={text} maxLength={300} placeholder={t.text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { L.setFx({ ticker: { text: text.trim(), on: true } }); setText(""); } }} /></div>
      )}
      <div className="wl-tk__run" title={t.text}><span className={t.on ? "is-on" : ""}>{t.text}</span></div>
      {h >= 2 && item.opts?.presets !== false && <div className={`wx-chips is-wrap is-c${w >= 3 ? 3 : 2}`}>{LED_TICKER_PRESETS.slice(0, w >= 3 ? 3 : 2).map((p) => <button key={p} type="button" className={t.text === p ? "is-on" : ""} onClick={() => L.setFx({ ticker: { text: p, on: true } })}>{p}</button>)}</div>}
    </Shell>
  );
}

/* ═════════════════════════ TEKRAR LED'DE (AYNA) ═════════════════════════ */

const mirrorMem = { prev: "scene" };
function LedReplay({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  const press = usePress(() => toggle(), () => openPop(item, togglePop, { mode: "options" }));
  if (!L) return noLed(w, h, "TEKRAR LED'DE");
  const on = L.fx.content === "mirror";
  function toggle() {
    if (on) L.setFx({ content: item.opts?.restore === "scene" ? "scene" : mirrorMem.prev || "scene" });
    else { mirrorMem.prev = L.fx.content; if (L.prefs.web) L.setPref({ web: false }); L.setFx({ content: "mirror" }); }
  }
  const replaying = Boolean(ctx.replay?.playing);
  if (w === 1) {
    return (
      <Shell as="button" tone="violet" w={w} h={h} state={on ? "air" : null} className="wx-tile" {...press} title="Program aynası: tekrar / VAR / özel kipler LED'de de görünür">
        <Icon name="repeat" size={20} strokeWidth={2.2} />
        <strong className="wx-t">{on ? "LED AYNADA" : "TEKRAR LED'DE"}</strong>
        <small className="wx-s">{on ? (replaying ? "tekrar oynuyor" : "program") : "aynayı aç"}</small>
      </Shell>
    );
  }
  const auto = Boolean(ctx.ops?.led?.mirrorOnReplay);
  return (
    <Shell tone="violet" w={w} h={h} state={on ? "air" : null} className="wl-mr">
      <Head icon="repeat" label="TEKRAR LED'DE" right={replaying ? <Pill tone="danger">TEKRAR</Pill> : null} />
      <button type="button" className={`wx-primary ${on ? "is-live" : ""}`} {...press}><Icon name={on ? "stop" : "repeat"} size={13} /> {on ? "Aynayı kapat" : "Programı LED'e ayna"}</button>
      {h >= 2 && ctx.setOps && (
        <button type="button" className={`wx-wide ${auto ? "is-on" : ""}`} onClick={() => ctx.setOps("led", { mirrorOnReplay: !auto })} title="Tekrar yayına çıkınca LED kendiliğinden aynaya geçer, bitince geri döner">
          <Icon name="zap" size={12} /> Tekrarda otomatik: {auto ? "AÇIK" : "KAPALI"}
        </button>
      )}
      {h >= 2 && <small className="wx-s">{L.fx.mirrorFps} kare/sn · {L.status?.open ? "LED açık" : "LED kapalı"}</small>}
    </Shell>
  );
}

/* ═════════════════════════ LED ÖN AYARLARI ═════════════════════════ */

function LedPresets({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  const [presets, setPresets] = useLocal("ledPresets", {});
  if (!L) return noLed(w, h, "LED ÖN AYAR");
  const save = async (slot) => {
    const name = `${slot} · ${contentLabel(L, ctx.scenes || [])}`;
    setPresets((p) => ({ ...(p || {}), [slot]: ledPresetSnapshot(L.prefs, { name }) }));
    ctx.toast?.(`LED ön ayarı ${slot} kaydedildi (${name}).`, { tone: "success", timeout: 2200 });
  };
  const recall = (slot) => {
    const patch = ledPresetPatch(L.prefs, presets?.[slot]);
    if (!patch) { save(slot); return; }
    L.setPref({ route: patch.route, sceneId: patch.sceneId, web: patch.web });
    L.setFx(patch.fx);
    ctx.toast?.(`LED ön ayarı ${slot}.`, { tone: "info", timeout: 1500 });
  };
  const slots = LED_PRESET_SLOTS.slice(0, w === 1 && h === 1 ? 2 : Number(item.opts?.slots) || 4);
  return (
    <Shell tone="blue" w={w} h={h} className="wl-pr" {...optMenu(item, togglePop)}>
      {(h >= 2 || w >= 2) && <Head icon="overview" label="LED ÖN AYAR" right={<small className="wx-head__r">sağ tık: kaydet</small>} />}
      <div className={`wl-pr__g ${w === 1 ? "is-col" : h >= 2 ? "is-2x2" : ""}`}>
        {slots.map((s) => <PresetBtn key={s} slot={s} p={presets?.[s]} onRecall={() => recall(s)} onSave={() => save(s)} />)}
      </div>
    </Shell>
  );
}
function PresetBtn({ slot, p, onRecall, onSave }) {
  const press = usePress(onRecall, onSave);
  return (
    <button type="button" className={`wl-pr__b ${p ? "is-made" : ""}`} {...press} title={p ? `${p.name} · tık: çağır · sağ tık: üzerine yaz` : "Boş · tık / sağ tık: şimdiki LED durumunu kaydet"}>
      <b>{slot}</b><span>{p ? p.name.replace(/^[A-D] · /, "") : "boş"}</span>
    </button>
  );
}

/* ═════════════════════════ EKRAN SEÇİCİ ═════════════════════════ */

function LedDisplay({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  if (!L) return noLed(w, h, "EKRAN");
  const list = L.displays;
  return (
    <Shell tone="blue" w={w} h={h} className="wl-dp" {...optMenu(item, togglePop)}>
      <Head icon="overview" label="LED EKRANI" right={<button type="button" className="wx-gear" onClick={L.refreshDisplays} title="Ekranları yenile"><Icon name="refresh" size={11} /></button>} />
      <div className="wl-dp__list">
        {list.map((d) => {
          const sel = String(L.prefs.displayId) === String(d.id);
          const on = isOpenOn(L, d.id);
          return (
            <button key={d.id} type="button" className={`wl-dp__b ${sel ? "is-sel" : ""} ${on ? "is-on" : ""}`} onClick={() => (on ? null : sel ? L.openOn(d.id) : L.status?.open || item.opts?.openOnPick ? L.openOn(d.id) : L.setPref({ displayId: d.id }))} title={on ? "LED bu ekranda açık" : sel ? "Bu ekranda aç" : "Bu ekranı seç"}>
              <span className="wl-dp__ic"><Icon name="overview" size={13} />{on && <i />}</span>
              <span className="wl-dp__t"><strong>{dispName(d)}</strong>{h >= 2 && <small>{dispRes(d)}{d.scaleFactor > 1 ? ` @${d.scaleFactor}x` : ""}{d.primary ? " · ana ekran" : ""}</small>}</span>
              {sel && <Icon name="check" size={12} />}
            </button>
          );
        })}
        {!list.length && <span className="st-w__empty">Ekran yok.</span>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ SAAT / GERİ SAYIM ═════════════════════════ */

function LedClock({ ctx, item, w, h, togglePop }) {
  const L = ctx.led;
  const fx = L?.fx;
  const running = Boolean(fx?.content === "countdown" && fx.countdownEndsAt && fx.countdownEndsAt > Date.now());
  const now = useNow(Boolean(L && (fx.content === "countdown" || fx.content === "clock")), 500);
  const mins = Number(item.opts?.minutes) || ctx.ops?.led?.countdownMin || 5;
  const start = () => { if (L.prefs.web) L.setPref({ web: false }); L.setFx({ content: "countdown", countdownMin: mins, countdownEndsAt: Date.now() + mins * 60_000 }); };
  const press = usePress(() => (running ? L.setFx({ content: "scene" }) : start()), () => openPop(item, togglePop, { mode: "options" }));
  if (!L) return noLed(w, h, "LED SAAT");
  const left = fx.countdownEndsAt ? Math.max(0, fx.countdownEndsAt - now) : 0;
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={running ? "air" : null} className="wx-tile" {...press} title={`Tık: ${mins} dk geri sayım LED'de · sağ tık: süre`}>
        <Ring frac={running ? left / (fx.countdownMin * 60_000) : 1} size={32} tone={running ? "air" : "c"}><Icon name="timer" size={13} /></Ring>
        <strong className="wx-t">{running ? countdownText(fx.countdownEndsAt, now) : "GERİ SAYIM"}</strong>
        <small className="wx-s">{running ? "tık: durdur" : `${mins} dk · LED`}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} state={running || fx.content === "clock" ? "air" : null} className="wl-ck">
      <Head icon="timer" label="LED SAAT" right={<em className="wx-tc">{fx.content === "clock" ? new Date(now).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : countdownText(fx.countdownEndsAt, now)}</em>} />
      <div className="wx-row is-actions">
        <button type="button" className={fx.content === "clock" ? "is-on" : ""} onClick={() => setContent(ctx, fx.content === "clock" ? "scene" : "clock")}><Icon name="clock" size={11} /> Saat</button>
        <button type="button" className={running ? "is-on" : ""} onClick={() => (running ? L.setFx({ content: "scene" }) : start())}><Icon name={running ? "stop" : "timer"} size={11} /> {running ? "Bitir" : `${mins} dk`}</button>
        {running && <button type="button" onClick={() => L.setFx({ countdownEndsAt: fx.countdownEndsAt + 60_000 })}>+1 dk</button>}
      </div>
      {h >= 2 && <div className={`wx-chips is-c${w >= 3 ? 7 : 4}`}>{COUNTDOWN_MINUTES.slice(0, w >= 3 ? 7 : 4).map((m) => <button key={m} type="button" onClick={() => { if (L.prefs.web) L.setPref({ web: false }); L.setFx({ content: "countdown", countdownMin: m, countdownEndsAt: Date.now() + m * 60_000 }); }}>{m} dk</button>)}</div>}
    </Shell>
  );
}

export const LED_WIDGETS = {
  ledPower: withOptions({ render: (p) => <LedPower {...p} /> }, [{ key: "confirmClose", label: "Kapatmadan önce sor", type: "bool", def: false }]),
  ledContent: withOptions({ popTitle: "LED içeriği", popover: (p) => <ContentFlow {...p} />, render: (p) => <LedContent {...p} /> }, [
    { key: "quick", label: "Kartta görünen içerikler (sırayla)", type: "select", def: ["scene", "mirror", "scoreboard", "sponsor", "text", "clock", "countdown", "web"],
      choices: [[["scene", "mirror", "scoreboard", "sponsor", "text", "clock", "countdown", "web"], "Tümü"], [["scene", "mirror", "scoreboard", "text"], "Yayın odaklı"], [["sponsor", "text", "clock", "countdown"], "Ara ekranlar"]] },
  ]),
  ledAdjust: withOptions({ render: (p) => <LedAdjust {...p} /> }, [{ key: "step", label: "Konum adımı (% ekran)", type: "select", def: 2, choices: [[1, "1 %"], [2, "2 %"], [5, "5 %"], [10, "10 %"]] }]),
  ledFreeze: withOptions({ render: (p) => <LedFreeze {...p} /> }, [{ key: "mode", label: "Küçük düğmenin işi", type: "select", def: "freeze", choices: [["freeze", "Dondur"], ["black", "Karart"]] }]),
  ledTicker: withOptions({ popTitle: "LED kayan yazı", popover: (p) => <TickerFlow {...p} />, render: (p) => <LedTicker {...p} /> }, [{ key: "presets", label: "Kartta hazır metinler", type: "bool", def: true }]),
  ledReplay: withOptions({ render: (p) => <LedReplay {...p} /> }, [{ key: "restore", label: "Ayna kapanınca", type: "select", def: "prev", choices: [["prev", "Önceki içeriğe dön"], ["scene", "Sahneye (Program) dön"]] }],
    { note: "Ayna kare hızı ve “tekrarda otomatik ayna” Ayarlar › LED ekranda." }),
  ledPresets: withOptions({ render: (p) => <LedPresets {...p} /> }, [{ key: "slots", label: "Yuva sayısı", type: "select", def: 4, choices: [[2, "2 (A–B)"], [4, "4 (A–D)"]] }]),
  ledDisplay: withOptions({ render: (p) => <LedDisplay {...p} /> }, [{ key: "openOnPick", label: "Ekranı seçince LED'i hemen aç", type: "bool", def: false }]),
  ledClock: withOptions({ render: (p) => <LedClock {...p} /> }, [{ key: "minutes", label: "Geri sayım (dk)", type: "select", def: 5, choices: COUNTDOWN_MINUTES.map((m) => [m, `${m} dk`]) }]),
};
