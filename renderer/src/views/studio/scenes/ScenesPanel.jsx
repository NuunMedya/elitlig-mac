// Yayın Stüdyosu · SAHNELER sekmesi (OBS düzeni):
//
//   Sahneler     sıralı liste (1–9 kısayolu), ekle / yeniden adlandır (çift tık) /
//                çoğalt / sil / sürükleyerek sırala; tık → önizleme, çift tık → yayın
//   Katmanlar    önizlemedeki sahnenin katmanları (üstte = en üstte çizilir):
//                göz (görünürlük), kilit, sürükleyerek sırala, çıkar, + kaynak
//   Dönüşüm      seçili katman: X / Y / G / Y (çıkış pikseli), döndürme, kırpma,
//                sığdırma, "Ekrana sığdır / Uzat / Ortala"
//   Kitaplık     genel kaynak listesi (SourcesPanel.SourceLibrary)
//
// Düzenleme önizleme ekranında da yapılır (SceneEditOverlay): seçim iki yerde ortak.
import React, { memo, useEffect, useState } from "react";
import { Field, Icon, MenuButton } from "../../../components/ui";
import { FITS, isSourceSceneId, layersTopFirst, sceneHotkey, sourceKindIcon, uiIndexToArray } from "../../../lib/studio/scenes";
import { centerLayer, fitToScreen, fromPixels, normAspect, stretchToScreen, toPixels } from "../../../lib/studio/scenesTransform";
import { naturalSize } from "../draw";
import { SourceLibrary } from "../SourcesPanel";

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

function SceneName({ scene, onRename }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(scene.name);
  useEffect(() => setName(scene.name), [scene.name]);
  if (!edit) return <span className="st-scn__name" onDoubleClick={(e) => { e.stopPropagation(); setEdit(true); }} title={`${scene.name} — çift tık: yeniden adlandır`}>{scene.name}</span>;
  const done = () => { setEdit(false); if (name.trim() && name !== scene.name) onRename(scene.id, name); else setName(scene.name); };
  return <input className="st-scn__input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={done} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { if (e.key === "Enter") done(); if (e.key === "Escape") { setName(scene.name); setEdit(false); } e.stopPropagation(); }} maxLength={60} />;
}

export const ScenesList = memo(function ScenesList({ config, actions, compact = false }) {
  const { onPreview, onProgram, onAddScene, onRenameScene, onDuplicateScene, onRemoveScene, onMoveScene } = actions;
  const { over, props } = useDragSort((from, to) => onMoveScene(config.scenes[from].id, to));
  return (
    <section className={`st-col ${compact ? "is-compact" : ""}`}>
      <header className="st-col__head">
        <h4>Sahneler</h4>
        <span className="st-col__count">{config.scenes.length}</span>
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--xs btn--soft" onClick={() => onAddScene()} title="Boş sahne ekle"><Icon name="plus" size={12} /> Sahne</button>
      </header>
      <ul className="st-scn">
        {config.scenes.map((sc, i) => {
          const hk = sceneHotkey(config, sc.id);
          const pgm = sc.id === config.programSceneId;
          const pvw = sc.id === config.previewSceneId;
          return (
            <li key={sc.id} {...props(i)} className={`st-scn__row ${pgm ? "is-program" : ""} ${pvw ? "is-preview" : ""} ${over === i ? "is-over" : ""}`}
              onClick={() => onPreview(sc.id)} onDoubleClick={() => onProgram(sc.id)} title="Tık: önizleme · çift tık: yayına · sürükle: sırala">
              <span className="st-grip"><Icon name="grip" size={12} /></span>
              <b className="st-tile__no">{hk || "·"}</b>
              <SceneName scene={sc} onRename={onRenameScene} />
              {pgm && <span className="st-mini is-live">PGM</span>}
              {pvw && !pgm && <span className="st-mini is-pvw">PVW</span>}
              <small className="muted">{sc.layers.length}</small>
              <MenuButton label="Sahne" size={13} items={[
                { label: "Önizlemeye al", icon: "eye", onClick: () => onPreview(sc.id) },
                { label: "Yayına ver", icon: "play", onClick: () => onProgram(sc.id) },
                "-",
                { label: "Çoğalt", icon: "copy", onClick: () => onDuplicateScene(sc.id) },
                { label: "Yukarı taşı", icon: "chevronUp", disabled: i === 0, onClick: () => onMoveScene(sc.id, i - 1) },
                { label: "Aşağı taşı", icon: "chevronDown", disabled: i === config.scenes.length - 1, onClick: () => onMoveScene(sc.id, i + 1) },
                "-",
                { label: "Sahneyi sil", icon: "trash", danger: true, disabled: config.scenes.length <= 1, onClick: () => onRemoveScene(sc) },
              ]} />
            </li>
          );
        })}
      </ul>
    </section>
  );
});

export const LayersList = memo(function LayersList({ config, scene, selectedId, actions, compact = false }) {
  const { onSelectLayer, onUpdateLayer, onRemoveLayer, onMoveLayer, onAddLayer, onNewSource, onSceneFromSource } = actions;
  const list = layersTopFirst(scene);
  const byId = new Map(config.sources.map((s) => [s.id, s]));
  const { over, props } = useDragSort((from, to) => onMoveLayer(scene.id, list[from].id, uiIndexToArray(list.length, to)));
  const virtual = scene && isSourceSceneId(scene.id);
  return (
    <section className={`st-col ${compact ? "is-compact" : ""}`}>
      <header className="st-col__head">
        <h4>Katmanlar</h4>
        {scene && <span className="st-col__sub" title={scene.name}>{scene.name}</span>}
        <span className="st-top__spacer" />
        {scene && !virtual && (
          <MenuButton label="Katman ekle" icon="plus" text="Kaynak" size={12} className="st-menu-sm" items={[
            ...config.sources.map((s) => ({ label: s.name, icon: sourceKindIcon(s.kind), onClick: () => onAddLayer(scene.id, s.id) })),
            ...(config.sources.length ? ["-"] : []),
            { label: "Yeni kaynak…", icon: "plus", onClick: () => onNewSource({ toScene: scene.id }) },
          ]} />
        )}
      </header>
      {!scene ? <p className="st-hint">Önizlemede sahne yok.</p> : virtual ? (
        <div className="st-hint st-pad-sm">
          Önizlemede tek bir kaynak var (“{scene.name}”). Katman düzenlemek için soldan bir sahne seç
          <button type="button" className="btn btn--xs" style={{ marginLeft: 6 }} onClick={() => onSceneFromSource(scene.sourceId)}>Bu kaynaktan sahne oluştur</button>
        </div>
      ) : (
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

/** Sekmenin tamamı: dört sütun. */
function ScenesPanel({ config, editScene, selectedLayerId, runtimeRef, version, outW, outH, actions, libActions }) {
  const layer = editScene?.layers.find((l) => l.id === selectedLayerId) || null;
  const editable = editScene && !isSourceSceneId(editScene.id) ? editScene.id : null;
  return (
    <div className="st-scenes">
      <ScenesList config={config} actions={actions} />
      <LayersList config={config} scene={editScene} selectedId={selectedLayerId} actions={actions} />
      <LayerProps config={config} scene={editScene} layer={layer} runtimeRef={runtimeRef} outW={outW} outH={outH} actions={actions} />
      <SourceLibrary config={config} runtimeRef={runtimeRef} version={version} editableSceneId={editable} actions={libActions} />
    </div>
  );
}

export default memo(ScenesPanel);
