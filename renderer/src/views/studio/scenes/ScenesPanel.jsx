// Yayın Stüdyosu · SAHNELER (basit mantık):
//
//   Sahneler sekmesi   şablondan sahne ekle (Boş, Tek kaynak, Resim içinde resim, Yan yana,
//                      Üçlü, Başlangıç / Devre arası / Bitiş ekranı) + sahne kartları:
//                      tık → önizleme, çift tık → yayın, "Düzenle", "Yayına al", "LED'e ver"
//   Sahne düzenleyici  YALNIZ "Düzenle" ile açılır: katmanlar (üstte = en üstte çizilir:
//                      göz, kilit, sürükleyerek sırala, çıkar, + kaynak), büyük tuvalde
//                      taşı / boyutla / kırp / döndür, dönüşüm alanları
//   SceneRail          "Büyük program" düzeninde dikey sahne listesi
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field, Icon, MenuButton, Modal } from "../../../components/ui";
import { FITS, SCENE_TEMPLATES, TEMPLATE_LAYOUTS, layersTopFirst, pipBox, sourceKindIcon, templateOf, templateSourceIds, uiIndexToArray } from "../../../lib/studio/scenes";
import { centerLayer, fitToScreen, fromPixels, normAspect, stretchToScreen, toPixels } from "../../../lib/studio/scenesTransform";
import { drawScene, naturalSize } from "../draw";
import { Tile, tileWarning } from "../Multiview";
import SceneEditOverlay from "./SceneEditOverlay";
import Monitor from "./Monitor";

/** Sürükle-bırak sıralama yardımcısı (HTML5). */
function useDragSort(onDrop) {
  const [over, setOver] = useState(null);
  const props = (index) => ({
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/st-index", String(index)); },
    onDragOver: (e) => { if ([...e.dataTransfer.types].includes("text/st-index")) { e.preventDefault(); setOver(index); } },
    onDragLeave: () => setOver((o) => (o === index ? null : o)),
    onDrop: (e) => {
      e.preventDefault();
      setOver(null);
      const from = Number(e.dataTransfer.getData("text/st-index"));
      if (Number.isFinite(from) && from !== index) onDrop(from, index);
    },
    onDragEnd: () => setOver(null),
  });
  return { over, props };
}

export const LayersList = memo(function LayersList({ config, scene, selectedId, actions, compact = false }) {
  const { onSelectLayer, onUpdateLayer, onRemoveLayer, onMoveLayer, onAddLayer, onNewSource } = actions;
  const list = layersTopFirst(scene);
  const byId = new Map(config.sources.map((s) => [s.id, s]));
  const { over, props } = useDragSort((from, to) => onMoveLayer(scene.id, list[from].id, uiIndexToArray(list.length, to)));
  return (
    <section className={`st-col ${compact ? "is-compact" : ""}`}>
      <header className="st-col__head">
        <h4>Katmanlar</h4>
        {scene && <span className="st-col__sub" title={scene.name}>{scene.name}</span>}
        <span className="st-top__spacer" />
        {scene && (
          <MenuButton label="Katman ekle" icon="plus" text="Kaynak" size={12} className="st-menu-sm" items={[
            ...config.sources.map((s) => ({ label: s.name, icon: sourceKindIcon(s.kind), onClick: () => onAddLayer(scene.id, s.id) })),
            ...(config.sources.length ? ["-"] : []),
            { label: "Yeni kaynak…", icon: "plus", onClick: () => onNewSource({ toScene: scene.id }) },
          ]} />
        )}
      </header>
      {!scene ? <p className="st-hint">Sahne yok.</p> : (
        <ul className="st-lyr">
          {list.map((l, i) => {
            const src = byId.get(l.sourceId);
            return (
              <li key={l.id} {...props(i)} className={`st-lyr__row ${l.id === selectedId ? "is-on" : ""} ${!l.visible ? "is-hidden" : ""} ${over === i ? "is-over" : ""}`} onClick={() => onSelectLayer(l.id)}>
                <span className="st-grip"><Icon name="grip" size={12} /></span>
                <button type="button" className={`st-lyr__btn ${l.visible ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); onUpdateLayer(scene.id, l.id, { visible: !l.visible }); }} title={l.visible ? "Gizle" : "Göster"} aria-pressed={l.visible}>
                  <Icon name="eye" size={13} />
                </button>
                <button type="button" className={`st-lyr__btn ${l.locked ? "is-locked" : ""}`} onClick={(e) => { e.stopPropagation(); onUpdateLayer(scene.id, l.id, { locked: !l.locked }); }} title={l.locked ? "Kilidi aç" : "Kilitle (taşınmaz)"} aria-pressed={l.locked}>
                  <Icon name="lock" size={12} />
                </button>
                <Icon name={sourceKindIcon(src?.kind)} size={12} />
                <span className="st-lyr__name" title={src?.name}>{src?.name || "?"}</span>
                <button type="button" className="icon-btn icon-btn--xs" onClick={(e) => { e.stopPropagation(); onRemoveLayer(scene.id, l.id); }} title="Sahneden çıkar (kaynak kitaplıkta kalır)"><Icon name="x" size={12} /></button>
              </li>
            );
          })}
          {!list.length && <li className="st-hint">Boş sahne. “+ Kaynak” ile kamera, görsel, metin … ekle.</li>}
        </ul>
      )}
    </section>
  );
});

function NumField({ label, value, onCommit, min, max, step = 1, suffix }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => { const v = Number(text); if (Number.isFinite(v) && v !== value) onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); else setText(String(value)); };
  return (
    <label className="st-num">
      <span>{label}</span>
      <input type="number" value={text} step={step} min={min} max={max} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); e.stopPropagation(); }} />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

export const LayerProps = memo(function LayerProps({ config, scene, layer, runtimeRef, outW, outH, actions }) {
  const { onUpdateLayer, onEditSource } = actions;
  if (!scene || !layer) {
    return (
      <section className="st-col">
        <header className="st-col__head"><h4>Dönüşüm</h4></header>
        <p className="st-hint">Bir katman seç: önizlemede tıkla ya da listeden seç. Sürükle → taşı, köşeler → boyutla (Shift oranı korur), Alt + köşe → kırp.</p>
      </section>
    );
  }
  const src = config.sources.find((s) => s.id === layer.sourceId);
  const px = toPixels(layer, outW, outH);
  const set = (patch) => onUpdateLayer(scene.id, layer.id, patch);
  const nat = naturalSize(src, runtimeRef.current.get(layer.sourceId));
  const aspect = nat ? normAspect(nat.w, nat.h, layer.crop, outW, outH) : 1;
  const crop = layer.crop || { l: 0, t: 0, r: 0, b: 0 };
  return (
    <section className="st-col">
      <header className="st-col__head">
        <h4>Dönüşüm</h4>
        <span className="st-col__sub" title={src?.name}>{src?.name}</span>
        <span className="st-top__spacer" />
        {src && <button type="button" className="btn btn--xs" onClick={() => onEditSource(src)} title="Kaynağın kendi ayarları"><Icon name="sliders" size={11} /> Kaynak</button>}
      </header>
      {layer.locked && <p className="st-hint is-armed"><Icon name="lock" size={11} /> Kilitli: önizlemede taşınmaz (alanlar yine düzenlenir).</p>}
      <div className="st-quick">
        <button type="button" className="btn btn--xs" onClick={() => set({ ...fitToScreen(aspect), fit: "stretch" })} title="Kaynağın oranıyla ekrana sığdır">Ekrana sığdır</button>
        <button type="button" className="btn btn--xs" onClick={() => set({ ...stretchToScreen(), fit: "stretch" })} title="Tam ekrana uzat">Uzat</button>
        <button type="button" className="btn btn--xs" onClick={() => set(centerLayer(layer))} title="Ekranın ortasına al">Ortala</button>
        <button type="button" className="btn btn--xs" onClick={() => set({ ...stretchToScreen(), rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, fit: "cover" })} title="Tam ekran, kırpma ve döndürme sıfır">Sıfırla</button>
      </div>
      <div className="st-nums">
        <NumField label="X" value={px.x} onCommit={(v) => set(fromPixels({ x: v }, outW, outH))} suffix="px" />
        <NumField label="Y" value={px.y} onCommit={(v) => set(fromPixels({ y: v }, outW, outH))} suffix="px" />
        <NumField label="G" value={px.w} min={4} onCommit={(v) => set(fromPixels({ w: v }, outW, outH))} suffix="px" />
        <NumField label="Yük" value={px.h} min={4} onCommit={(v) => set(fromPixels({ h: v }, outW, outH))} suffix="px" />
        <NumField label="Açı" value={Math.round(layer.rot || 0)} min={-360} max={360} onCommit={(v) => set({ rot: ((v % 360) + 360) % 360 })} suffix="°" />
      </div>
      <div className="st-nums">
        {[["l", "Sol"], ["t", "Üst"], ["r", "Sağ"], ["b", "Alt"]].map(([k, l]) => (
          <NumField key={k} label={`Kırp ${l}`} value={Math.round(crop[k] * 100)} min={0} max={90} onCommit={(v) => set({ crop: { [k]: v / 100 } })} suffix="%" />
        ))}
      </div>
      <Field label="Kutu içinde">
        <div className="st-seg">
          {FITS.map((f) => <button key={f.key} type="button" className={layer.fit === f.key ? "is-on" : ""} onClick={() => set({ fit: f.key })}>{f.label}</button>)}
        </div>
      </Field>
    </section>
  );
});


/* ------------------------------ şablonlar ------------------------------ */

/** Şablonun küçük çizimi (kutular). */
export function TemplatePic({ tpl }) {
  if (tpl.ready) return <span className={`st-tpl__pic is-ready is-${tpl.key}`}><b /><i />{tpl.minutes ? <em>{String(tpl.minutes).padStart(2, "0")}:00</em> : null}</span>;
  const boxes = (TEMPLATE_LAYOUTS[tpl.key] || []).map((b, i) => b || (tpl.key === "pip" && i === 1 ? pipBox("br", 0.3) : null)).filter(Boolean);
  return (
    <span className={`st-tpl__pic is-${tpl.key}`}>
      {boxes.map((b, i) => <b key={i} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />)}
      {tpl.key === "empty" && <Icon name="plus" size={14} />}
    </span>
  );
}

/** Menü öğeleri: "Sahne ekle ▸ şablon". */
export const templateMenu = (onTemplate) => SCENE_TEMPLATES.map((t) => ({ label: t.label, icon: t.icon, hint: t.hint, onClick: () => onTemplate(t.key) }));

/** Şablon penceresi: ad + kaynak seçimi (ya da başlık / geri sayım). */
export function TemplateDialog({ tplKey, config, onCreate, onClose }) {
  const tpl = templateOf(tplKey);
  const [name, setName] = useState(tpl?.label || "");
  const [ids, setIds] = useState(() => templateSourceIds(config, tpl?.slots || 0));
  const [title, setTitle] = useState(tpl?.title || "");
  const [subtitle, setSubtitle] = useState(tpl?.subtitle || "");
  const [minutes, setMinutes] = useState(tpl?.minutes ?? 0);
  if (!tpl) return null;
  const slotNames = tpl.key === "pip" ? ["Büyük görüntü", "Köşedeki kutu"] : tpl.key === "triple" ? ["Büyük görüntü", "Sağ üst", "Sağ alt"] : tpl.key === "sbs" ? ["Sol", "Sağ"] : ["Kaynak"];
  const noSources = tpl.slots > 0 && !config.sources.length;
  const create = () => onCreate(tpl.key, { name, sourceIds: ids, title, subtitle, minutes: Number(minutes) || 0 });
  return (
    <Modal title={`Yeni sahne · ${tpl.label}`} onClose={onClose} width={520} className="st-modal"
      footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={noSources} onClick={create}><Icon name="plus" size={13} /> Sahneyi oluştur</button></>}>
      <div className="st-tpl__dlg">
        <TemplatePic tpl={tpl} />
        <div className="st-stack">
          <Field label="Sahne adı"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></Field>
          {tpl.slots > 0 && (noSources
            ? <p className="st-hint is-armed">Önce Kaynaklar sekmesinden bir kaynak (kamera, görsel…) ekle.</p>
            : Array.from({ length: tpl.slots }, (_, i) => (
              <Field key={i} label={slotNames[i] || `Kaynak ${i + 1}`}>
                <select value={ids[i] || ""} onChange={(e) => setIds((cur) => { const n = [...cur]; n[i] = e.target.value; return n; })}>
                  {config.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )))}
          {tpl.ready && (
            <>
              <Field label="Başlık"><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Alt satır (isteğe bağlı)"><input value={subtitle} maxLength={60} onChange={(e) => setSubtitle(e.target.value)} /></Field>
              <Field label="Geri sayım (dakika · 0 = yok)" hint="Geri sayım sahne yayına alındığında başlar.">
                <input type="number" min={0} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </Field>
            </>
          )}
          <p className="st-hint">{tpl.hint}. Sonra “Düzenle” ile katmanları taşıyıp boyutlayabilirsin.</p>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Sahneler sekmesi ------------------------------ */

function ScenesTabInner({ config, runtimeRef, register, version, studioMode, ledId, actions }) {
  void version;
  const { onPreview, onProgram, onToLed, onEdit, onTemplate, tileMenu } = actions;
  return (
    <div className="st-scenetab">
      <section className="st-tpl">
        <header className="st-col__head"><h4>Yeni sahne</h4><span className="st-hint">şablondan başla</span></header>
        <div className="st-tpl__row">
          {SCENE_TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="st-tpl__btn" onClick={() => onTemplate(t.key)} title={t.hint}>
              <TemplatePic tpl={t} /><span>{t.label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="st-scenegrid" aria-label="Sahneler">
        {config.scenes.map((sc, i) => {
          const t = { id: sc.id, kind: "scene", name: sc.name, hotkey: i < 9 ? i + 1 : null };
          return (
            <Tile key={sc.id} tile={t} size="grid" register={register} studioMode={studioMode}
              onAir={sc.id === config.programSceneId} inPreview={studioMode && sc.id === config.previewSceneId && sc.id !== config.programSceneId} onLed={sc.id === ledId}
              bad={tileWarning(config, runtimeRef.current, t)} onPreview={onPreview} onProgram={onProgram} onToLed={onToLed} onEdit={onEdit} menu={tileMenu(t)} />
          );
        })}
      </section>
    </div>
  );
}
export const ScenesTab = memo(ScenesTabInner);

/** "Büyük program" düzeni: dikey sahne listesi. */
function SceneRailInner({ config, runtimeRef, register, version, studioMode, previewId, programId, ledId, actions, addMenu }) {
  void version;
  const { onPreview, onProgram, onToLed, onEdit, tileMenu } = actions;
  return (
    <section className="st-rail__list" aria-label="Sahneler">
      <header className="st-col__head"><h4>Sahneler</h4><span className="st-col__count">{config.scenes.length}</span><span className="st-top__spacer" />
        <MenuButton label="Sahne ekle" icon="plus" size={13} items={addMenu} />
      </header>
      <div className="st-rail__scroll">
        {config.scenes.map((sc, i) => {
          const t = { id: sc.id, kind: "scene", name: sc.name, hotkey: i < 9 ? i + 1 : null };
          return (
            <Tile key={sc.id} tile={t} size="row" register={register} studioMode={studioMode}
              onAir={sc.id === programId} inPreview={studioMode && sc.id === previewId && sc.id !== programId} onLed={sc.id === ledId}
              bad={tileWarning(config, runtimeRef.current, t)} onPreview={onPreview} onProgram={onProgram} onToLed={onToLed} onEdit={onEdit} menu={tileMenu(t)} />
          );
        })}
      </div>
    </section>
  );
}
export const SceneRail = memo(SceneRailInner);

/* ------------------------------ sahne düzenleyici ------------------------------ */

/** Düzenleyicinin kendi tuvali (önizleme çözünürlüğünde, ~30 fps). */
function useEditorCanvas(configRef, runtimeRef, sceneId, overrideRef, matchClockRef, W, H) {
  const canvas = useMemo(() => document.createElement("canvas"), []);
  useEffect(() => {
    const w = Math.min(1280, W);
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
  }, [canvas, W, H]);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 32) return;
      last = now;
      const cfg = configRef.current;
      const sc = cfg?.scenes.find((x) => x.id === sceneId) || null;
      const ctx = canvas.getContext("2d", { alpha: false });
      drawScene(ctx, sc, cfg?.sources || [], runtimeRef.current, canvas.width, canvas.height, { now, placeholders: true, override: overrideRef.current, matchClockMs: matchClockRef?.current?.() ?? null });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvas, configRef, matchClockRef, overrideRef, runtimeRef, sceneId]);
  return canvas;
}

function SceneNameEdit({ scene, onRename }) {
  const [name, setName] = useState(scene.name);
  useEffect(() => setName(scene.name), [scene.name]);
  const done = () => { if (name.trim() && name !== scene.name) onRename(scene.id, name); else setName(scene.name); };
  return <input className="st-editor__name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); e.stopPropagation(); }} aria-label="Sahne adı" />;
}

/**
 * Sahne düzenleyici (tam sayfa katman): yalnız "Düzenle" ile açılır.
 * Yayındaki sahne düzenlenirse değişiklik canlı görünür (uyarı gösterilir).
 */
export function SceneEditor({ config, configRef, runtimeRef, sceneId, selectedLayerId, onSelectLayer, outW, outH, overrideRef, matchClockRef, isProgram, isPreview, actions, onClose }) {
  const scene = config.scenes.find((s) => s.id === sceneId) || null;
  const canvas = useEditorCanvas(configRef, runtimeRef, sceneId, overrideRef, matchClockRef, outW, outH);
  const layer = scene?.layers.find((l) => l.id === selectedLayerId) || null;
  const sourceName = useCallback((id) => configRef.current.sources.find((s) => s.id === id)?.name || "?", [configRef]);
  const commit = useCallback((layerId, patch) => actions.onUpdateLayer(sceneId, layerId, patch), [actions, sceneId]);
  const remove = useCallback((layerId) => actions.onRemoveLayer(sceneId, layerId), [actions, sceneId]);
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop, .menu__list") && !e.target?.closest?.(".st-edit")) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!scene) return null;
  return (
    <div className="st-editor" ref={ref} role="dialog" aria-label={`Sahne düzenle: ${scene.name}`}>
      <header className="st-editor__head">
        <Icon name="pencil" size={15} />
        <span className="st-editor__kicker">Sahne düzenle</span>
        <SceneNameEdit scene={scene} onRename={actions.onRenameScene} />
        {isProgram && <span className="st-tag is-live">YAYINDA · değişiklikler canlı görünür</span>}
        {isPreview && !isProgram && <span className="st-tag is-pvw">ÖNİZLEMEDE</span>}
        <span className="st-top__spacer" />
        {!isPreview && !isProgram && <button type="button" className="btn btn--sm" onClick={() => actions.onPreview(scene.id)}><Icon name="eye" size={13} /> Önizlemeye al</button>}
        {!isProgram && <button type="button" className="btn btn--sm btn--red" onClick={() => actions.onProgram(scene.id)}><Icon name="play" size={13} /> Yayına al</button>}
        <button type="button" className="btn btn--sm btn--primary" onClick={onClose}><Icon name="check" size={13} /> Düzenlemeyi bitir</button>
      </header>
      <div className="st-editor__body">
        <aside className="st-editor__side">
          <LayersList config={config} scene={scene} selectedId={selectedLayerId} actions={{ ...actions, onSelectLayer }} />
          <p className="st-hint st-pad-sm">Tuvalde tıkla: seç · sürükle: taşı · köşe: boyutla (Shift oranı korur) · Alt + köşe: kırp · üstteki nokta: döndür · ok tuşları: kaydır · Delete: çıkar</p>
        </aside>
        <div className="st-editor__stage">
          <Monitor canvas={canvas} className={`st-editor__screen ${isProgram ? "is-program" : ""}`}>
            <SceneEditOverlay scene={scene} selectedId={selectedLayerId} onSelect={onSelectLayer} onCommit={commit} onRemove={remove}
              overrideRef={overrideRef} sourceName={sourceName} outW={outW} outH={outH} />
          </Monitor>
        </div>
        <aside className="st-editor__side is-right">
          <LayerProps config={config} scene={scene} layer={layer} runtimeRef={runtimeRef} outW={outW} outH={outH} actions={actions} />
        </aside>
      </div>
    </div>
  );
}
