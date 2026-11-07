// Yayın Stüdyosu · SAHNE DÜZENLEYİCİ (açılır büyük pencere).
//
// Sahne kutusundaki kalem, önizleme monitöründeki "Düzenle", sağ tık menüsü ve Sahneler
// panelindeki "Düzenle" bu pencereyi açar (ekranın ~%90'ı; köşeden boyutlanır, büyütülür).
//
//   Sol      KATMANLAR: göz (gizle), kilit, ad (çift tık: yeniden adlandır), çoğalt, yukarı /
//            aşağı, sürükleyerek sırala, çıkar; "+ Kaynak" (var olan ya da yeni kaynak);
//            altında kaynak kitaplığı (durum, ayarlar, sahneye ekle)
//   Orta     büyük tuval: tıkla → seç, sürükle → taşı (kenar, orta ve öbür katmanlara yapışır,
//            kılavuz çizgileri), köşe → boyutla (Shift oranı korur), Alt + köşe → kırp, üstteki
//            nokta → döndür; araç çubuğu: hizala, yapışma, grafikleri göster (canlı sonuç)
//   Sağ      KATMAN: konum / boyut (px), açı, kırpma, kutu içinde (sığdırma), saydamlık, köşe,
//            çerçeve, gölge, katman sesi · SAHNE: ad, zemin, bu sahnenin geçişi, yayın
//            grafiklerinin bu sahnede görünürlüğü, sahne başına ses
//   Üst      geri al / yinele (Ctrl/⌘+Z, Shift+Ctrl/⌘+Z), "Önizlemeye al", "Yayına al",
//            büyüt / eski boyut, Kapat (Esc)
//
// Değişiklikler anında yapılandırmaya yazılır (yayındaki sahnede canlı görünür).
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, MenuButton } from "../../../components/ui";
import { layersTopFirst, sourceKindIcon, uiIndexToArray } from "../../../lib/studio/scenes";
import { alignLayer } from "../../../lib/studio/scenesTransform";
import { TRANSITION_KINDS, transitionMs } from "../../../lib/studio/transitions";
import { VISIBILITY_KEYS, VISIBILITY_LABELS, toggleSceneVisibility } from "../../../lib/studio/graphics/visibility";
import { LayerProps, SceneNameEdit, SourceRows, sourceMenu, useEditorCanvas } from "./ScenesPanel";
import SceneEditOverlay from "./SceneEditOverlay";
import Monitor from "./Monitor";
import "./sceneEditor.css";

const WIN_KEY = "studio.sceneEditor.win";
const readWin = () => { try { const v = JSON.parse(localStorage.getItem(WIN_KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const writeWin = (v) => { try { localStorage.setItem(WIN_KEY, JSON.stringify(v)); } catch { /* yoksay */ } };
const typing = (el) => Boolean(el?.closest?.("input, textarea, select, [contenteditable='true']"));

/* ───────────────────────── geri al / yinele ───────────────────────── */

/**
 * Sahnenin her değişikliği geçmişe yazılır (art arda gelen küçük değişiklikler — ok tuşu,
 * alan yazımı — 450 ms içinde birleşir). undo / redo sahneyi olduğu gibi geri koyar.
 */
export function useSceneHistory(scene, replace) {
  const h = useRef({ past: [], future: [], last: scene, skip: 0, at: 0 });
  const [, tick] = useState(0);
  useEffect(() => {
    const s = h.current;
    if (!scene || s.last === scene) return;
    if (s.skip) { s.skip -= 1; s.last = scene; tick((n) => n + 1); return; }
    const now = Date.now();
    if (!(now - s.at < 450 && s.past.length)) { s.past.push(s.last); if (s.past.length > 120) s.past.shift(); }
    s.future = [];
    s.last = scene;
    s.at = now;
    tick((n) => n + 1);
  }, [scene]);
  const undo = useCallback(() => {
    const s = h.current;
    if (!s.past.length) return;
    const prev = s.past.pop();
    s.future.push(s.last);
    s.skip += 1; s.at = 0;
    replace(prev);
  }, [replace]);
  const redo = useCallback(() => {
    const s = h.current;
    if (!s.future.length) return;
    const next = s.future.pop();
    s.past.push(s.last);
    s.skip += 1; s.at = 0;
    replace(next);
  }, [replace]);
  return { undo, redo, canUndo: h.current.past.length > 0, canRedo: h.current.future.length > 0 };
}

/* ───────────────────────── katmanlar ───────────────────────── */

function LayerName({ layer, source, onRename }) {
  const [edit, setEdit] = useState(false);
  const label = layer.name || source?.name || "?";
  if (!edit) return <span className="sem-lyr__name" title={`${label} — çift tık: yeniden adlandır`} onDoubleClick={(e) => { e.stopPropagation(); setEdit(true); }}>{label}{layer.name && source?.name && layer.name !== source.name ? <small> · {source.name}</small> : null}</span>;
  return (
    <input className="sem-lyr__input" autoFocus defaultValue={layer.name || source?.name || ""} maxLength={40} aria-label="Katman adı"
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdit(false); }}
      onBlur={(e) => { setEdit(false); const v = e.currentTarget.value.trim(); onRename(v && v !== source?.name ? v : ""); }} />
  );
}

const SemLayers = memo(function SemLayers({ config, scene, selectedId, onSelect, actions }) {
  const list = layersTopFirst(scene);
  const byId = new Map(config.sources.map((s) => [s.id, s]));
  const [over, setOver] = useState(null);
  const n = list.length;
  const move = (layerId, ui) => actions.onMoveLayer(scene.id, layerId, uiIndexToArray(n, Math.max(0, Math.min(n - 1, ui))));
  const set = (layerId, patch) => actions.onUpdateLayer(scene.id, layerId, patch);
  return (
    <section className="sem-card sem-layers" aria-label="Katmanlar">
      <header className="sem-card__head">
        <h4><Icon name="layers" size={13} /> Katmanlar <small>{n}</small></h4>
        <span className="st-top__spacer" />
        <MenuButton label="Kaynak ekle" icon="plus" text="Kaynak ekle" size={12} className="st-menu-sm" align="end" items={sourceMenu(config, scene.id, actions)} />
      </header>
      <ul className="sem-lyr">
        {list.map((l, i) => {
          const src = byId.get(l.sourceId);
          return (
            <li key={l.id} draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/sem-index", String(i)); }}
              onDragOver={(e) => { if ([...e.dataTransfer.types].includes("text/sem-index")) { e.preventDefault(); setOver(i); } }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const from = Number(e.dataTransfer.getData("text/sem-index")); if (Number.isFinite(from) && from !== i) move(list[from].id, i); }}
              onDragEnd={() => setOver(null)}
              className={`sem-lyr__row ${l.id === selectedId ? "is-on" : ""} ${!l.visible ? "is-hidden" : ""} ${l.locked ? "is-locked" : ""} ${over === i ? "is-over" : ""}`}
              onClick={() => onSelect(l.id)}>
              <span className="st-grip" title="Sürükle: sırala"><Icon name="grip" size={12} /></span>
              <button type="button" className={`sem-ib ${l.visible ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); set(l.id, { visible: !l.visible }); }} title={l.visible ? "Gizle" : "Göster"} aria-pressed={l.visible} aria-label={`${src?.name || "Katman"} ${l.visible ? "gizle" : "göster"}`}><Icon name="eye" size={13} /></button>
              <button type="button" className={`sem-ib ${l.locked ? "is-lock" : ""}`} onClick={(e) => { e.stopPropagation(); set(l.id, { locked: !l.locked }); }} title={l.locked ? "Kilidi aç" : "Kilitle (tuvalde taşınmaz)"} aria-pressed={l.locked}><Icon name="lock" size={12} /></button>
              <Icon name={sourceKindIcon(src?.kind)} size={12} />
              <LayerName layer={l} source={src} onRename={(name) => set(l.id, { name })} />
              {l.muted && <Icon name="micOff" size={11} title="Ses kapalı" />}
              <span className="sem-lyr__tools">
                <button type="button" className="sem-ib" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(l.id, i - 1); }} title="Yukarı (öne)"><Icon name="chevronUp" size={12} /></button>
                <button type="button" className="sem-ib" disabled={i === n - 1} onClick={(e) => { e.stopPropagation(); move(l.id, i + 1); }} title="Aşağı (arkaya)"><Icon name="chevronDown" size={12} /></button>
                <button type="button" className="sem-ib" onClick={(e) => { e.stopPropagation(); actions.onDuplicateLayer?.(scene.id, l.id); }} title="Çoğalt"><Icon name="copy" size={12} /></button>
                <button type="button" className="sem-ib is-danger" onClick={(e) => { e.stopPropagation(); actions.onRemoveLayer(scene.id, l.id); }} title="Sahneden çıkar (kaynak kitaplıkta kalır)"><Icon name="x" size={12} /></button>
              </span>
            </li>
          );
        })}
        {!n && <li className="st-hint">Boş sahne. “Kaynak ekle” ile kamera, görsel, metin, saat… ekle.</li>}
      </ul>
    </section>
  );
});

/* ───────────────────────── katman görünümü ───────────────────────── */

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="sem-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <em>{value}{suffix}</em>
    </label>
  );
}

function StyleProps({ layer, source, set }) {
  const border = layer.border || { width: 0, color: "#ffffff" };
  const shadow = layer.shadow || { blur: 0, color: "#000000" };
  const media = source && (source.kind === "video" || source.kind === "camera" || source.kind === "replay");
  return (
    <section className="sem-card" aria-label="Görünüm">
      <header className="sem-card__head"><h4><Icon name="palette" size={13} /> Görünüm</h4>
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--xs" onClick={() => set({ opacity: 1, radius: 0, border: null, shadow: null })} title="Saydamlık, köşe, çerçeve ve gölge sıfır">Sıfırla</button>
      </header>
      <Slider label="Saydamlık" value={Math.round((layer.opacity ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(v) => set({ opacity: v / 100 })} />
      <Slider label="Köşe" value={Math.round((layer.radius || 0) * 200)} min={0} max={100} suffix="%" onChange={(v) => set({ radius: v / 200 })} />
      <div className="sem-row2">
        <Slider label="Çerçeve" value={border.width} min={0} max={40} suffix=" px" onChange={(v) => set({ border: { ...border, width: v } })} />
        <input type="color" value={border.color} onChange={(e) => set({ border: { width: border.width || 4, color: e.target.value } })} aria-label="Çerçeve rengi" title="Çerçeve rengi" />
      </div>
      <div className="sem-row2">
        <Slider label="Gölge" value={shadow.blur} min={0} max={80} suffix=" px" onChange={(v) => set({ shadow: { ...shadow, blur: v } })} />
        <input type="color" value={shadow.color} onChange={(e) => set({ shadow: { blur: shadow.blur || 24, color: e.target.value } })} aria-label="Gölge rengi" title="Gölge rengi" />
      </div>
      {media && (
        <label className="sem-check">
          <input type="checkbox" checked={!layer.muted} onChange={(e) => set({ muted: !e.target.checked })} />
          <span><b>Bu katmanın sesi yayına gitsin</b><small>{source.kind === "video" ? "Video dosyasının sesi (sahne yayındayken)" : "Kaynağın kendi sesi varsa"} · kapalıyken görüntü kalır, ses gitmez</small></span>
        </label>
      )}
    </section>
  );
}

/* ───────────────────────── sahne ayarları ───────────────────────── */

function SceneSettings({ config, scene, actions, graphics, audio }) {
  const tr = scene.transition || null;
  const kind = TRANSITION_KINDS.find((t) => t.key === tr?.kind) || null;
  const allIds = config.scenes.map((s) => s.id);
  const strips = (audio?.strips || []).filter((s) => s.kind === "mic" || s.kind === "input" || s.kind === "file");
  return (
    <div className="sem-stack">
      <section className="sem-card" aria-label="Sahne">
        <header className="sem-card__head"><h4><Icon name="sliders" size={13} /> Sahne</h4></header>
        <label className="sem-field"><span>Ad</span><SceneNameEdit scene={scene} onRename={actions.onRenameScene} /></label>
        <div className="sem-field">
          <span>Zemin</span>
          <div className="sem-inline">
            <input type="color" value={scene.bg || "#000000"} onChange={(e) => actions.onUpdateScene?.(scene.id, { bg: e.target.value })} aria-label="Sahne zemin rengi" />
            <code>{scene.bg || "#000000"}</code>
            {scene.bg && <button type="button" className="btn btn--xs" onClick={() => actions.onUpdateScene?.(scene.id, { bg: null })}>Siyaha dön</button>}
          </div>
        </div>
        <label className="sem-field"><span>Yayına alınırken geçiş</span>
          <select value={tr?.kind || ""} onChange={(e) => actions.onUpdateScene?.(scene.id, { transition: e.target.value ? { kind: e.target.value } : null })}>
            <option value="">Seçili geçiş (Geçiş panelindeki)</option>
            {TRANSITION_KINDS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        {kind && kind.max > 0 && (
          <Slider label="Süre" value={tr.ms ?? transitionMs(kind.key, {})} min={kind.min} max={kind.max} step={50} suffix=" ms" onChange={(v) => actions.onUpdateScene?.(scene.id, { transition: { kind: kind.key, ms: v } })} />
        )}
      </section>
      <section className="sem-card" aria-label="Yayın grafikleri bu sahnede">
        <header className="sem-card__head"><h4><Icon name="trophy" size={13} /> Grafikler bu sahnede</h4></header>
        {graphics?.setVisibility ? VISIBILITY_KEYS.map((k) => {
          const v = graphics.visibility?.[k] ?? "all";
          const on = !Array.isArray(v) || v.map(String).includes(String(scene.id));
          return (
            <label key={k} className="sem-check">
              <input type="checkbox" checked={on} onChange={() => graphics.setVisibility(k, toggleSceneVisibility(v, scene.id, allIds))} />
              <span><b>{VISIBILITY_LABELS[k]}</b><small>{on ? "bu sahnede görünür" : "bu sahnede gizli"}</small></span>
            </label>
          );
        }) : <p className="st-hint">Grafik görünürlüğü maç açıkken ayarlanır (yalnız o maç için).</p>}
      </section>
      <section className="sem-card" aria-label="Sahne başına ses">
        <header className="sem-card__head"><h4><Icon name="mic" size={13} /> Ses bu sahnede</h4></header>
        {audio?.setScene && strips.length ? strips.map((r) => {
          const list = audio.scenesOf?.(r.id);
          const on = !Array.isArray(list) || list.includes(scene.id);
          return (
            <label key={r.id} className="sem-check">
              <input type="checkbox" checked={on} onChange={(e) => audio.setScene(r.id, scene.id, e.target.checked)} />
              <span><b>{r.label}</b><small>{on ? "bu sahnede yayına gider" : "bu sahnede kapalı"}</small></span>
            </label>
          );
        }) : <p className="st-hint">Ses kanalları (mikrofon, girişler) Ses panelinden eklenir.</p>}
      </section>
    </div>
  );
}

/* ───────────────────────── pencere ───────────────────────── */

const ALIGN = [
  ["left", "alignLeft", "Sola hizala"], ["hcenter", "alignCenter", "Yatayda ortala"], ["right", "alignRight", "Sağa hizala"],
  ["top", "chevronUp", "Üste hizala"], ["vcenter", "arrows", "Dikeyde ortala"], ["bottom", "chevronDown", "Alta hizala"],
];

export default function SceneEditorModal({
  config, configRef, runtimeRef, sceneId, selectedLayerId, onSelectLayer, outW, outH, overrideRef, matchClockRef,
  isProgram, isPreview, actions, libActions = null, graphics = null, audio = null, overlayRef = null, onClose,
}) {
  const scene = config.scenes.find((s) => s.id === sceneId) || null;
  const [win, setWin] = useState(readWin);
  const [tab, setTab] = useState("layer");
  const [snap, setSnap] = useState(() => win.snap !== false);
  const [gfx, setGfx] = useState(() => Boolean(win.gfx));
  const gfxRef = useRef(null);
  gfxRef.current = gfx && overlayRef ? (ctx, w, h, now) => { try { overlayRef.current?.(ctx, { width: w, height: h, now, target: "preview", sceneId }); } catch { /* yoksay */ } } : null;
  const canvas = useEditorCanvas(configRef, runtimeRef, sceneId, overrideRef, matchClockRef, outW, outH, 1600, gfxRef);
  const layer = scene?.layers.find((l) => l.id === selectedLayerId) || null;
  const source = layer ? config.sources.find((s) => s.id === layer.sourceId) : null;
  const sourceName = useCallback((id) => configRef.current.sources.find((s) => s.id === id)?.name || "?", [configRef]);
  const layerName = useCallback((l) => l.name || null, []);
  const commit = useCallback((layerId, patch) => actions.onUpdateLayer(sceneId, layerId, patch), [actions, sceneId]);
  const remove = useCallback((layerId) => actions.onRemoveLayer(sceneId, layerId), [actions, sceneId]);
  const replace = useCallback((sc) => actions.onReplaceScene?.(sceneId, sc), [actions, sceneId]);
  const hist = useSceneHistory(scene, replace);
  const histRef = useRef(hist);
  histRef.current = hist;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => { writeWin({ ...win, snap, gfx }); }, [win, snap, gfx]);
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector(".modal-backdrop, .menu__list")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z" || e.key === "y") && !typing(e.target)) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === "y" || e.shiftKey) histRef.current.redo(); else histRef.current.undo();
        return;
      }
      if (e.key === "Escape" && !typing(e.target) && !e.target?.closest?.(".st-edit")) { e.stopPropagation(); closeRef.current?.(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Köşeden boyutla (en küçük 760 × 480; ekrandan büyük olmaz).
  const resizing = useRef(null);
  const onResizeDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const box = e.currentTarget.parentElement.getBoundingClientRect();
    resizing.current = { x: e.clientX, y: e.clientY, w: box.width, h: box.height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onResizeMove = (e) => {
    const r = resizing.current;
    if (!r) return;
    // Pencere ortada durur: kenar iki yana büyür.
    const w = Math.max(760, Math.min(window.innerWidth - 16, r.w + (e.clientX - r.x) * 2));
    const h = Math.max(480, Math.min(window.innerHeight - 16, r.h + (e.clientY - r.y) * 2));
    setWin((v) => ({ ...v, max: false, w: Math.round(w), h: Math.round(h) }));
  };
  const onResizeUp = () => { resizing.current = null; };
  const style = win.max ? null : { width: win.w ? `min(${win.w}px, calc(100vw - 16px))` : undefined, height: win.h ? `min(${win.h}px, calc(100vh - 16px))` : undefined };

  const align = useMemo(() => (how) => { if (layer && !layer.locked) { const p = alignLayer(layer, how); if (p) commit(layer.id, p); } }, [commit, layer]);
  if (!scene) return null;
  return (
    <div className="sem-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !win.max) { /* dışarı tık kapatmaz: yanlışlıkla kaybolmasın */ } }}>
      <div className={`sem ${win.max ? "is-max" : ""} ${isProgram ? "is-program" : ""}`} style={style || undefined} role="dialog" aria-modal="true" aria-label={`Sahne düzenle: ${scene.name}`}>
        <header className="sem__head" onDoubleClick={(e) => { if (!e.target.closest("button, input, select")) setWin((v) => ({ ...v, max: !v.max })); }}>
          <Icon name="pencil" size={15} />
          <span className="sem__kicker">Sahne düzenle</span>
          <SceneNameEdit scene={scene} onRename={actions.onRenameScene} />
          {isProgram && <span className="st-tag is-live" title="Değişiklikler yayında anında görünür">YAYINDA · canlı</span>}
          {isPreview && !isProgram && <span className="st-tag is-pvw">ÖNİZLEMEDE</span>}
          <span className="st-top__spacer" />
          <div className="sem__grp" role="group" aria-label="Geçmiş">
            <button type="button" className="icon-btn" disabled={!hist.canUndo} onClick={hist.undo} title="Geri al (Ctrl/⌘ + Z)" aria-label="Geri al"><Icon name="undo" size={15} /></button>
            <button type="button" className="icon-btn" disabled={!hist.canRedo} onClick={hist.redo} title="Yinele (Shift + Ctrl/⌘ + Z)" aria-label="Yinele"><Icon name="redo" size={15} /></button>
          </div>
          <button type="button" className="btn btn--sm" disabled={isPreview || isProgram} onClick={() => actions.onPreview(scene.id)} title="Bu sahneyi önizlemeye yükle"><Icon name="eye" size={13} /> Önizlemeye al</button>
          <button type="button" className="btn btn--sm btn--red" disabled={isProgram} onClick={() => actions.onProgram(scene.id)} title="Bu sahneyi yayına al (geçişle)"><Icon name="play" size={13} /> Yayına al</button>
          <span className="sem__sep" />
          <button type="button" className="icon-btn" onClick={() => setWin((v) => ({ ...v, max: !v.max }))} title={win.max ? "Eski boyutuna dön" : "Büyüt (tüm pencere)"} aria-pressed={Boolean(win.max)} aria-label="Büyüt"><Icon name="overview" size={15} /></button>
          <button type="button" className="btn btn--sm btn--primary" onClick={onClose} title="Kapat (Esc) — değişiklikler kaydedildi"><Icon name="check" size={13} /> Kapat</button>
        </header>
        <div className="sem__body">
          <aside className="sem__side">
            <SemLayers config={config} scene={scene} selectedId={selectedLayerId} onSelect={onSelectLayer} actions={actions} />
            {libActions && (
              <details className="sem-lib" open={win.lib !== false} onToggle={(e) => { const open = e.currentTarget.open; setWin((v) => (v.lib === open ? v : { ...v, lib: open })); }}>
                <summary><Icon name="video" size={12} /> Kaynak kitaplığı <small>{config.sources.length}</small></summary>
                <SourceRows config={config} runtimeRef={runtimeRef} actions={{ ...libActions, onSceneFromSource: actions.onSceneFromSource }} sceneId={scene.id} title="Kaynaklar" />
              </details>
            )}
          </aside>
          <div className="sem__stage">
            <div className="sem__tools" role="toolbar" aria-label="Tuval araçları">
              <span className="sem__tlabel">Hizala</span>
              {ALIGN.map(([how, icon, label]) => <button key={how} type="button" className="icon-btn icon-btn--xs" disabled={!layer || layer.locked} onClick={() => align(how)} title={label} aria-label={label}><Icon name={icon} size={13} /></button>)}
              <span className="sem__sep" />
              <label className="sem-tog"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Yapış (kenar, orta, katmanlar)</label>
              {overlayRef && <label className="sem-tog"><input type="checkbox" checked={gfx} onChange={(e) => setGfx(e.target.checked)} /> Yayın grafiklerini göster</label>}
              <span className="st-top__spacer" />
              <span className="sem__res">{outW}×{outH}</span>
            </div>
            <Monitor canvas={canvas} className={`sem__screen ${isProgram ? "is-program" : ""}`}>
              <SceneEditOverlay scene={scene} selectedId={selectedLayerId} onSelect={onSelectLayer} onCommit={commit} onRemove={remove}
                overrideRef={overrideRef} sourceName={sourceName} layerName={layerName} outW={outW} outH={outH} snap={snap} />
            </Monitor>
            <p className="sem__hint">Tıkla: seç · sürükle: taşı (Ctrl/⌘: yapışmadan) · köşe: boyutla (Shift: oranı koru) · Alt + köşe: kırp · üstteki nokta: döndür · ok tuşları: kaydır (Shift 10 px) · Delete: çıkar</p>
          </div>
          <aside className="sem__side is-right">
            <nav className="sem-tabs" role="tablist" aria-label="Özellikler">
              <button type="button" role="tab" aria-selected={tab === "layer"} className={tab === "layer" ? "is-on" : ""} onClick={() => setTab("layer")}><Icon name="layers" size={12} /> Katman</button>
              <button type="button" role="tab" aria-selected={tab === "scene"} className={tab === "scene" ? "is-on" : ""} onClick={() => setTab("scene")}><Icon name="sliders" size={12} /> Sahne</button>
            </nav>
            {tab === "layer" ? (
              <div className="sem-stack">
                <LayerProps config={config} scene={scene} layer={layer} runtimeRef={runtimeRef} outW={outW} outH={outH} actions={actions} />
                {layer && <StyleProps layer={layer} source={source} set={(patch) => commit(layer.id, patch)} />}
              </div>
            ) : <SceneSettings config={config} scene={scene} actions={actions} graphics={graphics} audio={audio} />}
          </aside>
        </div>
        {!win.max && <i className="sem__resize" title="Sürükle: pencereyi boyutla" onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp} />}
      </div>
    </div>
  );
}
