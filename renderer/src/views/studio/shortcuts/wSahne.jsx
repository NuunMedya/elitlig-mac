// Yayın Stüdyosu · SAHNE düğmeleri: sahne ızgarası çeşitleri (ızgara · liste · şerit · büyük
// küçük resim + tally), A/B veriyolu (PGM / PVW sıraları, KES / GEÇİŞ), otomatik kamera
// dönüşü (her N sn), PiP aç / kapat, sahne başına katman aç / kapat, siyah / bekleme kartı,
// programı dondur. Sahneler ctx.sceneTile (önizleme / yayın, canlı küçük resim kaydı),
// katmanlar ctx.sceneOps (setLayerVisible), program durumu ctx.pgmFx (useCompositor).
import React, { useCallback, useEffect, useRef } from "react";
import { Icon } from "../../../components/ui";
import { Head, Pill, Ring, Shell, openPop, useNow, usePress } from "./wkit";
import { useLocal } from "./localStore";
import { ROTATE_SECONDS, nextInRotation, pipLayers } from "./opsLogic";
import { optMenu, withOptions } from "./wOptions";

/** Canlı küçük resim (sahne kutusu çizicisine kayıtlı tuval). */
function Thumb({ ctx, id, w = 160, h = 90, preview }) {
  const register = ctx.sceneTile?.register;
  const ref = useRef(null);
  const setRef = useCallback((el) => { if (preview || !register) return; register(id, el, ref.current); ref.current = el; }, [register, id, preview]);
  useEffect(() => () => { if (ref.current && register && !preview) register(id, null, ref.current); }, [register, id, preview]);
  if (preview) return <span className="ws-th is-ph" />;
  return <canvas ref={setRef} className="ws-th" width={w} height={h} />;
}
const tallyOf = (S, id) => (S.programId === id ? "air" : S.previewId === id ? "pvw" : null);

/* ═════════════════════════ SAHNE IZGARASI · ÇEŞİTLER ═════════════════════════ */

const VIEWS = [["grid", "Izgara"], ["list", "Liste"], ["strip", "Şerit"], ["big", "Büyük + tally"]];
function SceneGridPro({ ctx, item, w, h, togglePop, preview }) {
  const S = ctx.sceneTile;
  const scenes = ctx.scenes || [];
  const view = item.opts?.view || (w === 1 ? "list" : h === 1 ? "strip" : "grid");
  const pick = item.opts?.ids?.length ? scenes.filter((s) => item.opts.ids.includes(s.id)) : scenes;
  const cols = view === "big" ? Math.max(1, Math.min(w, 2)) : view === "grid" ? (w >= 4 ? 4 : w >= 3 ? 3 : 2) : 1;
  const max = view === "list" ? 12 : view === "strip" ? 12 : view === "big" ? cols * (h >= 2 ? 2 : 1) : cols * (h >= 2 ? 3 : 1);
  const dbl = item.opts?.click === "program";
  const tap = (id) => (dbl ? S.onProgram(id) : S.onPreview(id));
  return (
    <Shell tone="plain" w={w} h={h} className={`ws-sg is-${view}`} {...optMenu(item, togglePop)}>
      {view !== "strip" && h >= 2 && <Head icon="layers" label="SAHNELER" right={<small className="wx-head__r">{dbl ? "tık: yayın" : "tık: önizleme · çift: yayın"}</small>} />}
      <div className={`ws-sg__g is-c${cols}`}>
        {pick.slice(0, max).map((s, i) => {
          const t = tallyOf(S, s.id);
          return (
            <button key={s.id} type="button" className={`ws-sg__c ${t ? `is-${t}` : ""}`} onClick={() => tap(s.id)} onDoubleClick={() => S.onProgram(s.id)} title={`${s.name} — ${dbl ? "tık: yayın" : "tık: önizleme · çift tık: yayın"}`}>
              {view !== "list" && <Thumb ctx={ctx} id={s.id} preview={preview} w={view === "big" ? 320 : 160} h={view === "big" ? 180 : 90} />}
              <span className="ws-sg__n"><b>{i + 1}</b><span>{s.name}</span>{t && <em className={`is-${t}`}>{t === "air" ? "YAYINDA" : "ÖNİZLEME"}</em>}</span>
            </button>
          );
        })}
        {!pick.length && <span className="st-w__empty">Sahne yok.</span>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ A/B VERİYOLU ═════════════════════════ */

function AbBus({ ctx, item, w, h, togglePop }) {
  const S = ctx.sceneTile;
  const T = ctx.transition;
  const scenes = (item.opts?.ids?.length ? (ctx.scenes || []).filter((s) => item.opts.ids.includes(s.id)) : ctx.scenes || []).slice(0, w >= 4 ? 8 : w >= 3 ? 6 : 4);
  const row = (bus) => (
    <div className={`ws-ab__row is-${bus}`}>
      <span className="ws-ab__lbl">{bus === "pgm" ? "PGM" : "PVW"}</span>
      {scenes.map((s, i) => {
        const on = bus === "pgm" ? S.programId === s.id : S.previewId === s.id;
        return <button key={s.id} type="button" className={on ? "is-on" : ""} onClick={() => (bus === "pgm" ? S.onProgram(s.id) : S.onPreview(s.id))} title={`${s.name} → ${bus === "pgm" ? "doğrudan yayına (kesme)" : "önizlemeye"}`}><b>{i + 1}</b><span>{s.name}</span></button>;
      })}
    </div>
  );
  return (
    <Shell tone="violet" w={w} h={h} className="ws-ab" {...optMenu(item, togglePop)}>
      {row("pgm")}
      <div className="ws-ab__mid">
        <button type="button" className="ws-ab__cut" disabled={!S.previewId} onClick={() => S.previewId && S.onProgram(S.previewId)} title="Önizlemeyi geçişsiz yayına al">KES</button>
        <button type="button" className="ws-ab__auto" disabled={!T?.canTake} onClick={() => T.take()} title={`Önizlemeyi ${T?.kind?.label || "geçişle"} yayına al`}>GEÇİŞ <small>{T?.kind?.label}</small></button>
      </div>
      {row("pvw")}
    </Shell>
  );
}

/* ═════════════════════════ OTOMATİK KAMERA DÖNÜŞÜ ═════════════════════════ */

const auto = { t: null, ctx: null, nextAt: 0 };
function stopAuto(set) { clearInterval(auto.t); auto.t = null; auto.nextAt = 0; set?.((s) => ({ ...(s || {}), on: false })); }
function startAuto(state, set) {
  clearInterval(auto.t);
  const ms = Math.max(2, Number(state.sec) || 10) * 1000;
  auto.nextAt = Date.now() + ms;
  auto.t = setInterval(() => {
    const c = auto.ctx;
    if (!c) return;
    const ids = (state.ids?.length ? state.ids : (c.scenes || []).map((s) => s.id)).filter((id) => (c.scenes || []).some((s) => s.id === id));
    const next = nextInRotation(ids, c.sceneTile?.programId);
    if (next && next !== c.sceneTile?.programId) {
      if (state.mode === "take") { c.sceneTile.onPreview(next); setTimeout(() => auto.ctx?.transition?.take?.(), 60); } else c.sceneTile.onProgram(next);
    }
    auto.nextAt = Date.now() + ms;
  }, ms);
  set((s) => ({ ...(s || {}), ...state, on: true }));
}
function AutoSwitch({ ctx, item, w, h, togglePop }) {
  const [st, setSt] = useLocal("autoSwitch", { on: false, sec: 10, ids: [], mode: "cut" }, false);
  auto.ctx = ctx;
  const on = Boolean(st?.on && auto.t);
  const now = useNow(on, 250);
  const sec = Number(item.opts?.sec) || st?.sec || 10;
  const ids = item.opts?.ids || st?.ids || [];
  const mode = item.opts?.mode || st?.mode || "cut";
  const toggle = () => (on ? stopAuto(setSt) : startAuto({ sec, ids, mode }, setSt));
  const press = usePress(toggle, () => openPop(item, togglePop, { mode: "options" }));
  const left = on ? Math.max(0, auto.nextAt - now) : 0;
  const n = (ids.length ? ids.length : (ctx.scenes || []).length);
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="violet" w={w} h={h} state={on ? "air" : null} className="wx-tile" {...press} title="Tık: başlat / durdur · sağ tık: süre, sahneler, kesme / geçiş">
        <Ring frac={on ? 1 - left / (sec * 1000) : 0} size={32} tone={on ? "air" : "c"}><Icon name={on ? "stop" : "repeat"} size={13} /></Ring>
        <strong className="wx-t">{on ? `${Math.ceil(left / 1000)} SN` : "OTO DÖNÜŞ"}</strong><small className="wx-s">her {sec} sn · {n} sahne</small>
      </Shell>
    );
  }
  return (
    <Shell tone="violet" w={w} h={h} state={on ? "air" : null} className="ws-au" {...optMenu(item, togglePop)}>
      <Head icon="repeat" label="OTOMATİK DÖNÜŞ" right={on ? <Pill tone="danger">{Math.ceil(left / 1000)} sn</Pill> : <small className="wx-head__r">{n} sahne</small>} />
      <div className={`wx-chips is-c${w >= 3 ? 7 : 4}`}>
        {ROTATE_SECONDS.slice(0, w >= 3 ? 7 : 4).map((s) => <button key={s} type="button" className={sec === s ? "is-on" : ""} onClick={() => { ctx.setItemOpts?.(item.id, { sec: s }); if (on) startAuto({ sec: s, ids, mode }, setSt); }}>{s} sn</button>)}
      </div>
      {h >= 2 && <div className="wx-row">{[["cut", "Kesme"], ["take", "Geçişle"]].map(([k, l]) => <button key={k} type="button" className={mode === k ? "is-on" : ""} onClick={() => ctx.setItemOpts?.(item.id, { mode: k })}>{l}</button>)}</div>}
      <button type="button" className={`wx-primary ${on ? "is-live" : ""}`} onClick={toggle}><Icon name={on ? "stop" : "play"} size={12} /> {on ? "Durdur" : "Başlat"}</button>
    </Shell>
  );
}

/* ═════════════════════════ PiP · KATMANLAR ═════════════════════════ */

const sceneOf = (ctx, id) => (ctx.sceneOps?.list || []).find((s) => s.id === (id || ctx.sceneTile?.programId)) || null;
const srcName = (ctx, l) => l.name || (ctx.sceneOps?.sources || []).find((s) => s.id === l.sourceId)?.name || "Katman";

function PipToggle({ ctx, item, w, h, togglePop }) {
  const sc = sceneOf(ctx, item.opts?.sceneId);
  const pips = pipLayers(sc);
  const on = pips.some((l) => l.visible !== false);
  const toggle = () => { if (!sc) return; for (const l of pips) ctx.sceneOps.setLayerVisible(sc.id, l.id, !on); };
  const press = usePress(toggle, () => openPop(item, togglePop, { mode: "options" }));
  if (!ctx.sceneOps) return <Shell tone="plain" w={w} h={h}><Head icon="layers" label="PiP" /><span className="st-w__empty">Sahne yok.</span></Shell>;
  if (w === 1 || h === 1) {
    return (
      <Shell as="button" tone="violet" w={w} h={h} state={on && pips.length ? "air" : null} className="wx-tile" disabled={!pips.length} {...press} title="Tık: resim içinde resmi aç / kapat · sağ tık: sahne">
        <Icon name="layers" size={20} strokeWidth={2.2} />
        <strong className="wx-t">{pips.length ? (on ? "PiP AÇIK" : "PiP KAPALI") : "PiP YOK"}</strong>
        <small className="wx-s">{sc?.name || "program"}{pips.length > 1 ? ` · ${pips.length}` : ""}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="violet" w={w} h={h} state={on && pips.length ? "air" : null} className="ws-ly" {...optMenu(item, togglePop)}>
      <Head icon="layers" label={`PiP · ${sc?.name || "—"}`} right={<button type="button" className={`wx-sw ${on ? "is-on" : ""}`} disabled={!pips.length} onClick={toggle}>{on ? "AÇIK" : "KAPALI"}</button>} />
      <LayerList ctx={ctx} sc={sc} list={pips} />
    </Shell>
  );
}
function LayerList({ ctx, sc, list }) {
  return (
    <div className="ws-ly__l">
      {list.map((l) => (
        <button key={l.id} type="button" className={l.visible !== false ? "is-on" : ""} onClick={() => ctx.sceneOps.setLayerVisible(sc.id, l.id, l.visible === false)} title={l.visible !== false ? "Gizle" : "Göster"}>
          <Icon name={l.visible !== false ? "eye" : "x"} size={11} /><span>{srcName(ctx, l)}</span>
        </button>
      ))}
      {!list.length && <span className="st-w__empty">Katman yok.</span>}
    </div>
  );
}
function LayerToggles({ ctx, item, w, h, togglePop }) {
  if (!ctx.sceneOps) return <Shell tone="plain" w={w} h={h}><Head icon="layers" label="KATMANLAR" /><span className="st-w__empty">Sahne yok.</span></Shell>;
  const sc = sceneOf(ctx, item.opts?.sceneId);
  const list = [...(sc?.layers || [])].reverse();
  return (
    <Shell tone="plain" w={w} h={h} state={sc && sc.id === ctx.sceneTile?.programId ? "air" : null} className="ws-ly" {...optMenu(item, togglePop)}>
      <Head icon="layers" label={`KATMAN · ${sc?.name || "—"}`} right={sc && sc.id === ctx.sceneTile?.programId ? <Pill tone="danger">YAYINDA</Pill> : null} />
      <LayerList ctx={ctx} sc={sc} list={list} />
    </Shell>
  );
}

/* ═════════════════════════ SİYAH / BEKLEME KARTI / DONDUR ═════════════════════════ */

function BlackStill({ ctx, item, w, h, togglePop }) {
  const F = ctx.pgmFx;
  const kind = F?.kind || null;
  const one = item.opts?.kind || "black";
  const press = usePress(() => F?.set(kind === one ? null : one, { text: item.opts?.text }), () => openPop(item, togglePop, { mode: "options" }));
  if (!F) return <Shell tone="plain" w={w} h={h}><Head icon="eye" label="PROGRAM" /><span className="st-w__empty">Kullanılamıyor.</span></Shell>;
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="plain" w={w} h={h} state={kind === one ? "air" : null} className="wx-tile" {...press} title="Tık: aç / kapat · sağ tık: siyah ya da bekleme kartı">
        <Icon name={one === "slate" ? "image" : "eye"} size={20} strokeWidth={2.2} />
        <strong className="wx-t">{kind === one ? "NORMALE DÖN" : one === "slate" ? "BEKLEME KARTI" : "SİYAH"}</strong>
        <small className="wx-s">{kind ? "programda" : "program"}</small>
      </Shell>
    );
  }
  const btn = (k, icon, label) => <button key={k} type="button" className={`wl-big ${k === "black" ? "is-black" : ""} ${kind === k ? "is-on" : ""}`} onClick={() => F.set(kind === k ? null : k, { text: item.opts?.text })}><Icon name={icon} size={14} /><strong>{kind === k ? "NORMAL" : label}</strong></button>;
  return (
    <Shell tone="plain" w={w} h={h} state={kind ? "air" : null} className="wx-split" {...optMenu(item, togglePop)}>
      {h >= 2 && <Head icon="eye" label="PROGRAM" right={kind ? <Pill tone="danger">{kind === "black" ? "SİYAH" : kind === "freeze" ? "DONDU" : "KART"}</Pill> : null} />}
      <div className={`wx-split__row ${w === 1 ? "is-col" : ""}`}>{btn("black", "eye", "SİYAH")}{btn("slate", "image", "KART")}</div>
    </Shell>
  );
}
function FreezePgm({ ctx, item, w, h, togglePop }) {
  const F = ctx.pgmFx;
  const on = F?.kind === "freeze";
  const press = usePress(() => F?.set(on ? null : "freeze"), () => openPop(item, togglePop, { mode: "options" }));
  if (!F) return <Shell tone="plain" w={w} h={h}><Head icon="pause" label="DONDUR" /><span className="st-w__empty">Kullanılamıyor.</span></Shell>;
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={on ? "air" : null} className="wx-tile" {...press} title="Program son karede kalır (yayın sürer); tekrar: devam">
      <Icon name={on ? "play" : "pause"} size={20} strokeWidth={2.2} />
      <strong className="wx-t">{on ? "DEVAM ET" : "PROGRAMI DONDUR"}</strong>
      <small className="wx-s">{on ? "program donuk" : "son kare kalır"}</small>
    </Shell>
  );
}

export const SAHNE_WIDGETS = {
  sceneGridPro: withOptions({ noPreview: false, render: (p) => <SceneGridPro {...p} /> }, [
    { key: "view", label: "Görünüm", type: "select", def: null, choices: [[null, "Boyuta göre"], ...VIEWS] },
    { key: "click", label: "Tek tık", type: "select", def: "preview", choices: [["preview", "Önizlemeye"], ["program", "Doğrudan yayına"]] },
    { key: "ids", label: "Gösterilecek sahneler (boş: hepsi)", type: "scenes", def: [] },
  ]),
  abBus: withOptions({ render: (p) => <AbBus {...p} /> }, [{ key: "ids", label: "Veriyolundaki sahneler (boş: ilk sahneler)", type: "scenes", def: [] }]),
  autoSwitch: withOptions({ render: (p) => <AutoSwitch {...p} /> }, [
    { key: "sec", label: "Dönüş aralığı", type: "select", def: null, choices: [[null, "Karttaki"], ...ROTATE_SECONDS.map((s) => [s, `${s} sn`])] },
    { key: "mode", label: "Geçiş", type: "select", def: null, choices: [[null, "Karttaki"], ["cut", "Kesme"], ["take", "Seçili geçişle"]] },
    { key: "ids", label: "Dönecek sahneler (boş: hepsi)", type: "scenes", def: [] },
  ]),
  pipToggle: withOptions({ render: (p) => <PipToggle {...p} /> }, [{ key: "sceneId", label: "Sahne", type: "scene", def: null, emptyLabel: "Yayındaki sahne" }]),
  layerToggles: withOptions({ render: (p) => <LayerToggles {...p} /> }, [{ key: "sceneId", label: "Sahne", type: "scene", def: null, emptyLabel: "Yayındaki sahne" }]),
  blackStill: withOptions({ render: (p) => <BlackStill {...p} /> }, [
    { key: "kind", label: "Küçük düğmenin işi", type: "select", def: "black", choices: [["black", "Siyah"], ["slate", "Bekleme kartı"]] },
    { key: "text", label: "Bekleme kartı yazısı", type: "text", def: "", placeholder: "Yayın birazdan devam edecek" },
  ]),
  freezePgm: withOptions({ render: (p) => <FreezePgm {...p} /> }, [], { note: "Dondurulmuş program yayına gitmeye devam eder; ses akmaya devam eder." }),
};
