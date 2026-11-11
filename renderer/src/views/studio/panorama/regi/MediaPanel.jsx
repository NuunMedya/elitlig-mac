// Panorama rejisi · MEDYA KUTUSU paneli: dışarıdan görsel / video (dosya seç, sürükle-bırak, web adresi),
// küçük resimli liste; her öğe: ÖNİZLEMEYE (sonra GEÇİŞ), DOĞRUDAN YAYINA (seçili geçişle), PiP / ÜST
// KATMAN (köşe ya da tam kaplama; solarak / kayarak), YUVAYA (bir sahnenin kamera yuvası). Video
// denetimi: oynat / duraklat / baştan / ilerleme, döngü, ses düzeyi, sessiz, giriş-çıkış noktası;
// görselde "N sn sonra önceki sahneye dön".
import React, { useState } from "react";
import { Icon, Kbd } from "../../../../components/ui";
import { OVERLAY_FX, PIP_PRESETS, fmtTime, kindFromUrl, mediaSceneId, moveItem, nameFromUrl, patchItem } from "../../../../lib/studio/panorama/mediaBin";
import { layoutOf } from "../../../../lib/studio/panorama/model";
import { hotkeyLabel, hotkeyMap } from "../../../../lib/studio/panorama/regi";
import { useRegi } from "./RegiCtx";

function Transport({ item }) {
  const R = useRegi();
  const st = R.mediaCtl.status(item.id);
  if (item.kind !== "video") return null;
  if (!st) return <small className="st-hint">Önizlemeye / yayına alınca oynatıcı açılır.</small>;
  return (
    <div className="pr-transport">
      <button type="button" className="icon-btn" onClick={() => R.mediaCtl.control(item.id, "toggle")} title={st.paused ? "Oynat" : "Duraklat"} data-act="media-play"><Icon name={st.paused ? "play" : "pause"} size={13} /></button>
      <button type="button" className="icon-btn" onClick={() => R.mediaCtl.control(item.id, "restart")} title="Giriş noktasından baştan"><Icon name="skipBack" size={13} /></button>
      <input type="range" min={0} max={Math.max(1, st.d)} step={0.1} value={Math.min(st.t, st.d || st.t)} onChange={(e) => R.mediaCtl.control(item.id, "seek", Number(e.target.value))} aria-label="İlerleme" />
      <code>{fmtTime(st.t)} / {fmtTime(st.d)}</code>
    </div>
  );
}

function ItemSettings({ item }) {
  const R = useRegi();
  const set = (patch) => R.setMedia((m) => patchItem(m, item.id, patch));
  const angles = R.pano.angles;
  const [slotA, setSlotA] = useState(angles[0]?.id || "");
  const [slotK, setSlotK] = useState(0);
  const slots = layoutOf(angles.find((a) => a.id === slotA)?.layout).slots || [];
  return (
    <div className="pr-ed" data-media-editor={item.id}>
      <label className="field pn-mini"><span>Ad</span><input className="input" value={item.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="pn-row2">
        <label className="field pn-mini"><span>Sığdırma</span><select className="input" value={item.fit} onChange={(e) => set({ fit: e.target.value })}><option value="contain">Sığdır (tamamı)</option><option value="cover">Doldur (kırp)</option></select></label>
        {item.kind === "image"
          ? <label className="field pn-mini"><span>Yayında tut (sn; 0 = elle)</span><input className="input" type="number" min={0} max={3600} value={item.holdSec} onChange={(e) => set({ holdSec: Number(e.target.value) || 0 })} data-field="media-hold" /></label>
          : <label className="pn-check"><input type="checkbox" checked={item.loop} onChange={(e) => set({ loop: e.target.checked })} /> Döngü</label>}
      </div>
      {item.kind === "video" && (
        <>
          <div className="pn-row2">
            <label className="field pn-mini"><span>Ses <b>{Math.round(item.volume * 100)}%</b></span><input type="range" min={0} max={100} value={Math.round(item.volume * 100)} onChange={(e) => set({ volume: Number(e.target.value) / 100 })} data-field="media-vol" /></label>
            <label className="pn-check"><input type="checkbox" checked={item.muted} onChange={(e) => set({ muted: e.target.checked })} /> Sessiz</label>
          </div>
          <div className="pn-row2">
            <label className="field pn-mini"><span>Giriş (sn)</span><input className="input" type="number" min={0} step={0.1} value={item.inSec} onChange={(e) => set({ inSec: Number(e.target.value) || 0 })} data-field="media-in" /></label>
            <label className="field pn-mini"><span>Çıkış (sn; 0 = sonu)</span><input className="input" type="number" min={0} step={0.1} value={item.outSec} onChange={(e) => set({ outSec: Number(e.target.value) || 0 })} data-field="media-out" /></label>
          </div>
          <div className="pr-bar">
            <button type="button" className="btn btn--xs" onClick={() => { const s = R.mediaCtl.status(item.id); if (s) set({ inSec: Math.round(s.t * 10) / 10 }); }} title="Oynatıcının konumu giriş noktası olsun">[ Giriş = şimdi</button>
            <button type="button" className="btn btn--xs" onClick={() => { const s = R.mediaCtl.status(item.id); if (s) set({ outSec: Math.round(s.t * 10) / 10 }); }}>Çıkış = şimdi ]</button>
          </div>
        </>
      )}
      <div className="pr-slotrow">
        <span>Yuvaya koy:</span>
        <select className="input" value={slotA} onChange={(e) => { setSlotA(e.target.value); setSlotK(0); }}>{angles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select className="input" value={slotK} onChange={(e) => setSlotK(Number(e.target.value))}>{slots.map((_, k) => <option key={k} value={k}>Yuva {k + 1}</option>)}</select>
        <button type="button" className="btn btn--xs" onClick={() => R.mediaOps.slot(slotA, slotK, item.id)} data-act="media-slot"><Icon name="layout" size={11} /> Koy</button>
      </div>
      <button type="button" className="btn btn--xs btn--danger-ghost" onClick={() => R.mediaOps.remove(item.id)}><Icon name="trash" size={11} /> Kutudan kaldır</button>
    </div>
  );
}

export default function MediaPanel() {
  const R = useRegi();
  const M = R.pano.media;
  const [open, setOpen] = useState(null);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const [pip, setPip] = useState({ mode: "pip", pip: "br", fx: "fade", ms: 450 });
  const keys = hotkeyMap(R.pano.regi.hotkeys);
  const ov = M.overlay && !M.overlay.hideAt ? M.overlay : null;
  const usedSlots = Object.entries(M.slots).flatMap(([aid, row]) => Object.entries(row).map(([k, id]) => ({ aid, k: Number(k), id })));
  const onDrop = async (e) => {
    e.preventDefault(); setDrag(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { await R.mediaOps.addFiles(files); return; }
    const u = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain");
    if (u && /^https?:\/\//i.test(u.trim())) R.mediaOps.addUrl(u.trim());
  };
  return (
    <div className={`pr-media ${drag ? "is-drag" : ""}`} data-panel="medya" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="pr-bar">
        <button type="button" className="btn btn--xs btn--primary" onClick={R.mediaOps.pick} data-act="media-pick"><Icon name="folder" size={11} /> Dosya ekle</button>
        <form className="pr-urlform" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//i.test(url.trim())) { R.mediaOps.addUrl(url.trim()); setUrl(""); } }}>
          <input className="input" value={url} placeholder="ya da görsel / video adresi (https://…)" onChange={(e) => setUrl(e.target.value)} data-field="media-url" />
          <button type="submit" className="btn btn--xs" disabled={!/^https?:\/\//i.test(url.trim())}>Ekle</button>
        </form>
      </div>
      <div className="pr-pipbar">
        <span>PiP / üst katman:</span>
        <select className="input" value={pip.mode} onChange={(e) => setPip({ ...pip, mode: e.target.value })} data-field="pip-mode"><option value="pip">Köşe kutusu (PiP)</option><option value="overlay">Tam kaplama</option></select>
        {pip.mode === "pip" && <select className="input" value={pip.pip} onChange={(e) => setPip({ ...pip, pip: e.target.value })} data-field="pip-pos">{PIP_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>}
        <select className="input" value={pip.fx} onChange={(e) => setPip({ ...pip, fx: e.target.value })} data-field="pip-fx">{OVERLAY_FX.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {ov && <button type="button" className="btn btn--xs btn--red" onClick={R.mediaOps.hideOverlay} data-act="overlay-hide"><Icon name="x" size={11} /> Katmanı kaldır <Kbd>{hotkeyLabel(keys.mediaStop)}</Kbd></button>}
      </div>
      {!M.items.length && (
        <div className="pr-drop"><Icon name="upload" size={26} /><b>Görsel ya da videoyu buraya sürükle</b><small>ya da “Dosya ekle” / web adresi. İstediğin an tam ekran, PiP ya da bir kamera yuvasına yayına verilir; kayda ve yayına gider.</small></div>
      )}
      <ul className="pr-bin">
        {M.items.map((it) => {
          const inPgm = R.config.programSceneId === mediaSceneId(it.id);
          const inPvw = R.config.previewSceneId === mediaSceneId(it.id);
          const isOv = ov?.id === it.id;
          const slotsOf = usedSlots.filter((s) => s.id === it.id);
          const air = R.mediaCtl.airIds.has(it.id);
          return (
            <li key={it.id} className={`${air ? "is-live" : ""} ${inPvw ? "is-pvw" : ""}`} data-media={it.id} data-media-kind={it.kind}>
              <div className="pr-bin__thumb">
                {it.thumb ? <img src={it.thumb} alt="" /> : <Icon name={it.kind === "video" ? "video" : "image"} size={22} />}
                <span className="pr-bin__kind">{it.kind === "video" ? `VİDEO${it.duration ? ` · ${fmtTime(it.duration)}` : ""}` : "GÖRSEL"}</span>
                {air && <span className="pr-bin__air">YAYINDA</span>}
                {inPvw && !air && <span className="pr-bin__pvw">ÖNİZLEME</span>}
              </div>
              <div className="pr-bin__body">
                <b title={it.name}>{it.name}</b>
                <div className="pr-bin__acts">
                  <button type="button" className={`btn btn--xs ${inPvw ? "is-pvw" : ""}`} onClick={() => R.mediaOps.cue(it.id)} title="Önizlemeye al (sonra GEÇİŞ)" data-act="media-cue"><Icon name="eye" size={11} /> Önizle</button>
                  <button type="button" className={`btn btn--xs ${inPgm ? "btn--red" : ""}`} onClick={() => R.mediaOps.air(it.id)} title="Seçili geçişle doğrudan yayına (tam ekran)" data-act="media-air"><Icon name="broadcast" size={11} /> Yayına</button>
                  <button type="button" className={`btn btn--xs ${isOv ? "btn--red" : ""}`} onClick={() => (isOv ? R.mediaOps.hideOverlay() : R.mediaOps.overlay(it.id, pip))} title="Bütün sahnelerin üstünde PiP / tam kaplama" data-act="media-overlay"><Icon name="layers" size={11} /> {isOv ? "Kaldır" : pip.mode === "pip" ? "PiP" : "Kapla"}</button>
                  <button type="button" className={`icon-btn ${open === it.id ? "is-on" : ""}`} onClick={() => setOpen(open === it.id ? null : it.id)} title="Ayarlar: ses, giriş-çıkış, yuva" data-act="media-settings"><Icon name="sliders" size={12} /></button>
                  <button type="button" className="icon-btn" onClick={() => R.setMedia((m) => moveItem(m, it.id, -1))} title="Yukarı"><Icon name="chevronUp" size={12} /></button>
                </div>
                {slotsOf.length > 0 && <div className="pr-bin__slots">{slotsOf.map((s) => <button key={`${s.aid}${s.k}`} type="button" className="pr-chip is-media" onClick={() => R.mediaOps.slot(s.aid, s.k, null)} title="Yuvadan çıkar">{R.pano.angles.find((a) => a.id === s.aid)?.name} · yuva {s.k + 1} ×</button>)}</div>}
                <Transport item={it} />
              </div>
              {open === it.id && <ItemSettings item={it} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Dosya / adres → medya öğesi taslağı. */
export function draftFromFile(f) {
  const kind = f.type === "video" || /^video\//.test(f.type || "") ? "video" : f.type === "image" || /^image\//.test(f.type || "") ? "image" : kindFromUrl(f.name || f.url);
  return kind ? { kind, name: f.name || nameFromUrl(f.url), url: f.url, mediaId: f.id } : null;
}
