// Yayın Stüdyosu · SAHNELER (basit mantık):
//
//   Sahneler sekmesi   sahne kartları: tık → SEÇ + önizleme, çift tık → yayın, kalem → DÜZENLE
//                      (büyük açılır pencere: ./SceneEditorModal), "Yayına al", "LED'e ver".
//                      Şablonlar YALNIZ "Yeni sahne ekle" ile açılan pencerede (TemplateGallery).
//   Yandaki panel      SceneInlineEditor — İSTEĞE BAĞLI ("Sahne katmanlarını yanda göster" ayarı):
//                      seçili sahnenin katmanları kartların yanında, küçük tuvalde taşı / boyutla.
//   Sahne düzenleyici  ./SceneEditorModal: büyük tuval, katmanlar, özellikler, sahne ayarları,
//                      geri al / yinele (bu dosya parçalarını ve tuval kancasını verir).
//                      Her sahne kartında "Kaynak ekle ▾": var olan kaynak ya da yeni kaynak
//                      (SourceDialog) doğrudan o sahneye katman olur. Sağda KAYNAKLAR listesi
//                      (durum, ayarlar, yeniden bağlan, sil) — ayrı Kaynaklar sekmesi yok.
//   SceneRail          dikey sahne listesi (eski "Büyük program" düzeni)
//   SourceRows         kaynak listesi (Sahneler sekmesi ve sahne düzenleyicisi)
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field, Icon, MenuButton, Modal } from "../../../components/ui";
import { FITS, TEMPLATE_CATEGORIES, layersTopFirst, sourceKindIcon, sourceKindLabel, sourceUsage, templateOf, templatePreview, templateSourceIds, templatesOfCategory, uiIndexToArray } from "../../../lib/studio/scenes";
import { centerLayer, fitToScreen, fromPixels, normAspect, stretchToScreen, toPixels } from "../../../lib/studio/scenesTransform";
import { drawScene, naturalSize } from "../draw";
import { Tile, tileWarning } from "../Multiview";
import { BAD, FX_KINDS, STATUS_TEXT, SourceThumb } from "../SourcesPanel";
import SceneEditOverlay from "./SceneEditOverlay";
import Monitor from "./Monitor";
import "./scenes.css";

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

/** Şablonun küçük çizimi (yuvalar, zemin, bantlar, yazılar, saat). */
export function TemplatePic({ tpl, large = false }) {
  const parts = templatePreview(tpl);
  return (
    <span className={`st-tpl__pic stp ${large ? "is-lg" : ""}`}>
      {parts.map((b, i) => (
        <b key={i} className={`is-${b.kind}`} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, ...(b.kind === "color" && b.color ? { background: b.w >= 1 && b.h >= 1 ? `linear-gradient(135deg, ${b.color}, #54009c)` : b.color } : {}) }}>
          {b.kind === "clock" ? "00:00" : b.kind === "slot" && (tpl.slots || 0) > 1 ? b.n : null}
        </b>
      ))}
      {tpl.key === "empty" && <Icon name="plus" size={large ? 18 : 14} />}
    </span>
  );
}

/** Menü öğeleri: "Sahne ekle ▸ şablon" (kategorilere ayrılmış). */
export const templateMenu = (onTemplate) => TEMPLATE_CATEGORIES.flatMap((c, i) => [
  ...(i ? ["-"] : []),
  ...templatesOfCategory(c.key).map((t) => ({ label: t.label, icon: t.icon, hint: t.hint, onClick: () => onTemplate(t.key) })),
]);

/**
 * "Yeni sahne ekle" açılır penceresi: solda kategoriler, sağda büyük önizlemeli şablonlar.
 * anchor: düğme öğesi (konum ona göre); dışarı tık / Esc kapatır.
 */
export function TemplateGallery({ anchor, onTemplate, onClose }) {
  const ref = useRef(null);
  const [cat, setCat] = useState(() => { try { return localStorage.getItem("studio.tplcat") || "kamera"; } catch { return "kamera"; } });
  const [pos, setPos] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const a = anchor?.getBoundingClientRect?.();
    const m = ref.current?.getBoundingClientRect?.();
    if (!m) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = a ? a.left : (vw - m.width) / 2;
    let top = a ? a.bottom + 6 : (vh - m.height) / 2;
    if (left + m.width > vw - 8) left = Math.max(8, vw - m.width - 8);
    if (top + m.height > vh - 8) top = a ? Math.max(8, a.top - m.height - 6) : 8;
    setPos({ left, top });
  }, [anchor, cat]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !anchor?.contains?.(e.target)) closeRef.current?.(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current?.(); } };
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", down, true); window.removeEventListener("keydown", key, true); };
  }, [anchor]);
  const pick = (c) => { setCat(c); try { localStorage.setItem("studio.tplcat", c); } catch { /* yoksay */ } };
  const list = templatesOfCategory(cat);
  return createPortal(
    <div ref={ref} className="st-pop stg-gallery studio-pop" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }} role="dialog" aria-label="Yeni sahne ekle">
      <header className="stg-gallery__head"><Icon name="plus" size={14} /><strong>Yeni sahne ekle</strong><span>şablon seç · sonra kaynakları ve yazıları düzenle</span><button type="button" className="st-pop__x" onClick={onClose} aria-label="Kapat">×</button></header>
      <div className="stg-gallery__body">
        <nav className="stg-gallery__cats" aria-label="Kategoriler">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button key={c.key} type="button" className={cat === c.key ? "is-on" : ""} onClick={() => pick(c.key)}>
              <Icon name={c.icon} size={13} /> <span>{c.label}</span> <em>{templatesOfCategory(c.key).length}</em>
            </button>
          ))}
        </nav>
        <div className="stg-gallery__grid">
          {list.map((t) => (
            <button key={t.key} type="button" className="stg-gallery__tpl" onClick={() => { onTemplate(t.key); onClose(); }} title={t.hint}>
              <TemplatePic tpl={t} large />
              <b>{t.label}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Şablon penceresi: ad + kaynak seçimi + (varsa) başlık / alt satır / geri sayım. */
export function TemplateDialog({ tplKey, config, onCreate, onClose }) {
  const tpl = templateOf(tplKey);
  const [name, setName] = useState(tpl?.label || "");
  const [ids, setIds] = useState(() => templateSourceIds(config, tpl?.slots || 0, tpl?.prefer));
  const [title, setTitle] = useState(tpl?.title || "");
  const [subtitle, setSubtitle] = useState(tpl?.subtitle || "");
  const [minutes, setMinutes] = useState(tpl?.minutes ?? 0);
  if (!tpl) return null;
  const slotNames = tpl.slotNames || ["Kaynak"];
  const visual = config.sources.filter((s) => s.kind !== "audio");
  const noSources = tpl.slots > 0 && !visual.length;
  const create = () => onCreate(tpl.key, { name, sourceIds: ids, title, subtitle, minutes: Number(minutes) || 0 });
  const multiline = String(tpl.subtitle || "").includes("\n");
  return (
    <Modal title={`Yeni sahne · ${tpl.label}`} onClose={onClose} width={560} className="st-modal"
      footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={noSources} onClick={create}><Icon name="plus" size={13} /> Sahneyi oluştur</button></>}>
      <div className="st-tpl__dlg">
        <TemplatePic tpl={tpl} large />
        <div className="st-stack">
          <Field label="Sahne adı"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} /></Field>
          {tpl.slots > 0 && (noSources
            ? <p className="st-hint is-armed">Önce bir kaynak ekle: Sahneler sekmesinde bir sahnenin “Kaynak ekle” menüsü ya da sağdaki Kaynaklar listesi.</p>
            : Array.from({ length: tpl.slots }, (_, i) => (
              <Field key={i} label={slotNames[i] || `Kaynak ${i + 1}`}>
                <select value={ids[i] || ""} onChange={(e) => setIds((cur) => { const n = [...cur]; n[i] = e.target.value; return n; })}>
                  {visual.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )))}
          {tpl.title != null && <Field label={tpl.key === "interview" ? "Konuk 1 adı" : "Başlık"}><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field>}
          {(tpl.subtitle != null || tpl.ready) && (
            <Field label={tpl.key === "interview" ? "Konuk 2 adı" : multiline ? "Satırlar" : "Alt satır (isteğe bağlı)"}>
              {multiline ? <textarea rows={4} value={subtitle} maxLength={200} onChange={(e) => setSubtitle(e.target.value)} /> : <input value={subtitle} maxLength={60} onChange={(e) => setSubtitle(e.target.value)} />}
            </Field>
          )}
          {tpl.minutes != null && (
            <Field label="Geri sayım (dakika · 0 = yok)" hint="Geri sayım sahne yayına alındığında başlar.">
              <input type="number" min={0} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          )}
          <p className="st-hint">{tpl.hint}. Sonra sahne kutusundaki kalemle katmanlarını düzenleyebilirsin.</p>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ kaynak listesi ------------------------------ */

const SYNTHETIC = new Set(["color", "text", "clock"]);

/** "Kaynak ekle ▾" menüsü: var olan kaynaklar (sahnede olmayanlar önce) + yeni kaynak. */
export function sourceMenu(config, sceneId, { onAddLayer, onNewSource }) {
  const scene = config.scenes.find((s) => s.id === sceneId);
  const inScene = new Set((scene?.layers || []).map((l) => l.sourceId));
  return [
    { label: "Yeni kaynak… (kamera, ekran, görsel, video, metin, saat)", icon: "plus", onClick: () => onNewSource({ toScene: sceneId }) },
    ...(config.sources.length ? ["-"] : []),
    ...config.sources.map((s) => ({ label: `${s.name}${inScene.has(s.id) ? " · sahnede" : ""}`, icon: sourceKindIcon(s.kind), onClick: () => onAddLayer(sceneId, s.id) })),
  ];
}

/** Kaynak satırları: küçük resim, durum, kullanım; ayarlar / yeniden bağlan / sil / sahneye ekle. */
function SourceRowsInner({ config, runtimeRef, version, actions, sceneId = null, title = "Kaynaklar" }) {
  void version;
  const { onNewSource, onEditSource, onRemoveSource, onReacquire, onRequestAccess, onAddToScene } = actions;
  return (
    <section className="st-srows">
      <header className="st-col__head">
        <h4>{title}</h4><span className="st-col__count">{config.sources.length}</span>
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--xs" onClick={() => onNewSource(sceneId ? { toScene: sceneId } : undefined)}><Icon name="plus" size={11} /> Yeni</button>
      </header>
      <ul className="st-srows__list">
        {config.sources.map((src) => {
          const rt = runtimeRef.current.get(src.id);
          const st = SYNTHETIC.has(src.kind) ? "live" : rt?.status || "waiting";
          const bad = BAD.includes(st);
          const used = sourceUsage(config, src.id);
          const inScene = sceneId ? config.scenes.find((x) => x.id === sceneId)?.layers.some((l) => l.sourceId === src.id) : false;
          return (
            <li key={src.id} className={`st-srow ${bad ? "is-bad" : ""}`}>
              <button type="button" className="st-srow__thumb" onClick={() => onEditSource(src)} title="Kaynak ayarları"><SourceThumb source={src} runtimeRef={runtimeRef} width={96} /></button>
              <span className="st-srow__text">
                <strong title={src.name}><Icon name={sourceKindIcon(src.kind)} size={11} /> {src.name}</strong>
                <small><span className={`st-dot is-${st}`} /> {st === "live" ? (rt?.label || "Hazır") : STATUS_TEXT[st] || st} · <span title={used.join(", ") || "Hiçbir sahnede değil"}>{used.length ? `${used.length} sahnede` : sourceKindLabel(src.kind)}</span></small>
              </span>
              <span className="st-srow__tools">
                {st === "denied" && (src.kind === "camera" || src.kind === "screen" || src.kind === "window") && <button type="button" className="btn btn--xs" onClick={() => onRequestAccess(src.kind === "camera" ? "camera" : "screen")}>İzin</button>}
                {bad && st !== "denied" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => (st === "file" ? onEditSource(src) : onReacquire(src))} title={st === "file" ? "Dosya seç" : "Yeniden dene"}><Icon name="refresh" size={12} /></button>}
                {sceneId && !inScene && <button type="button" className="btn btn--xs btn--soft" onClick={() => onAddToScene(src, sceneId)} title="Bu sahneye katman olarak ekle"><Icon name="plus" size={11} /> Ekle</button>}
                <MenuButton label="Kaynak" size={13} items={[
                  { label: "Ayarlar…", icon: "sliders", onClick: () => onEditSource(src) },
                  ...(FX_KINDS.has(src.kind) && actions.onFx ? [{ label: "Görüntü ayarları… (canlı)", icon: "palette", onClick: () => actions.onFx(src.id) }] : []),
                  ...config.scenes.map((sc) => ({ label: `“${sc.name}” sahnesine ekle`, icon: "layers", onClick: () => onAddToScene(src, sc.id) })),
                  { label: "Bu kaynaktan sahne oluştur", icon: "layers", onClick: () => actions.onSceneFromSource(src.id) },
                  { label: "Yeniden bağlan", icon: "refresh", onClick: () => onReacquire(src) },
                  "-",
                  { label: "Kaynağı sil", icon: "trash", danger: true, onClick: () => onRemoveSource(src) },
                ]} />
              </span>
            </li>
          );
        })}
        {!config.sources.length && <li className="st-hint st-pad-sm">Henüz kaynak yok. Bir sahnenin “Kaynak ekle” menüsünden kamera, ekran, görsel… ekle.</li>}
      </ul>
    </section>
  );
}
export const SourceRows = memo(SourceRowsInner);

/* ------------------------------ Sahneler sekmesi ------------------------------ */

/**
 * Seçili sahnenin katmanları sahne listesinin YANINDA (açılır pencere yok):
 * katman ekle / çıkar / sırala / gizle / kilitle, küçük tuvalde taşı / boyutla,
 * dönüşüm alanları. Hassas konumlama için "Tam ekran" düzenleyici isteğe bağlı.
 */
function SceneInlineEditorInner({ config, configRef, runtimeRef, scene, selectedLayerId, onSelectLayer, outW, outH, overrideRef, matchClockRef, isProgram, isPreview, actions, onClose }) {
  const canvas = useEditorCanvas(configRef, runtimeRef, scene.id, overrideRef, matchClockRef, outW, outH, 640);
  const layer = scene.layers.find((l) => l.id === selectedLayerId) || null;
  const sourceName = useCallback((id) => configRef.current.sources.find((s) => s.id === id)?.name || "?", [configRef]);
  const commit = useCallback((layerId, patch) => actions.onUpdateLayer(scene.id, layerId, patch), [actions, scene.id]);
  const remove = useCallback((layerId) => actions.onRemoveLayer(scene.id, layerId), [actions, scene.id]);
  return (
    <section className={`sie ${isProgram ? "is-program" : isPreview ? "is-preview" : ""}`} aria-label={`Sahne katmanları: ${scene.name}`}>
      <header className="sie__head">
        <Icon name="layers" size={13} />
        <SceneNameEdit scene={scene} onRename={actions.onRenameScene} />
        {isProgram && <span className="st-tag is-live" title="Değişiklikler yayında anında görünür">YAYINDA</span>}
        {isPreview && !isProgram && <span className="st-tag is-pvw">ÖNİZLEME</span>}
        <span className="st-top__spacer" />
        {!isPreview && !isProgram && <button type="button" className="btn btn--xs" onClick={() => actions.onPreview(scene.id)} title="Önizlemeye al"><Icon name="eye" size={11} /> Önizle</button>}
        {!isProgram && <button type="button" className="btn btn--xs btn--red" onClick={() => actions.onProgram(scene.id)} title="Yayına al (geçişle)"><Icon name="play" size={11} /> Yayına al</button>}
        {actions.onEditFull && <button type="button" className="btn btn--xs" onClick={() => actions.onEditFull(scene.id)} title="Büyük düzenleyici: tuval, katmanlar, görünüm, sahne ayarları, geri al"><Icon name="overview" size={11} /> Büyük düzenleyici</button>}
        <button type="button" className="icon-btn icon-btn--xs" onClick={onClose} title="Paneli kapat" aria-label="Paneli kapat"><Icon name="x" size={13} /></button>
      </header>
      <div className="sie__body">
        <LayersList config={config} scene={scene} selectedId={selectedLayerId} actions={{ ...actions, onSelectLayer }} compact />
        <div className="sie__right">
          <div className="sie__stage">
            <Monitor canvas={canvas} className={`st-editor__screen ${isProgram ? "is-program" : ""}`}>
              <SceneEditOverlay scene={scene} selectedId={selectedLayerId} onSelect={onSelectLayer} onCommit={commit} onRemove={remove}
                overrideRef={overrideRef} sourceName={sourceName} outW={outW} outH={outH} />
            </Monitor>
          </div>
          <LayerProps config={config} scene={scene} layer={layer} runtimeRef={runtimeRef} outW={outW} outH={outH} actions={actions} />
        </div>
      </div>
    </section>
  );
}
export const SceneInlineEditor = memo(SceneInlineEditorInner);

function ScenesTabInner({ config, configRef, runtimeRef, register, version, studioMode, ledId, actions, libActions, selectedSceneId, onSelectScene, selectedLayerId, onSelectLayer, outW = 1920, outH = 1080, overrideRef, matchClockRef, onAddScene, inline = false, onInline = null }) {
  const { onPreview, onProgram, onToLed, tileMenu } = actions;
  const byId = new Map(config.sources.map((s) => [s.id, s]));
  const scene = config.scenes.find((s) => s.id === selectedSceneId) || null;
  const showInline = Boolean(inline && scene);
  // Kart tıklaması: seç + önizlemeye al; kalem / katman satırı: düzenleyici (büyük pencere,
  // "Sahne katmanlarını yanda göster" açıksa yandaki panel).
  const select = useCallback((id) => { onSelectScene(id); }, [onSelectScene]);
  const edit = useCallback((id) => { onSelectScene(id); actions.onEdit?.(id); }, [actions, onSelectScene]);
  const pick = useCallback((id) => { onSelectScene(id); onPreview(id); }, [onPreview, onSelectScene]);
  return (
    <div className={`st-scenetab is-v2 ${showInline ? "has-edit" : ""} ${libActions ? "has-lib" : ""}`}>
      <div className="st-scenetab__main">
        <header className="st-scenetab__bar">
          <h4>Sahneler</h4><span className="st-col__count">{config.scenes.length}</span>
          <span className="st-hint">tıkla: seç + önizleme · çift tık: yayına al · kalem: düzenle</span>
          <span className="st-top__spacer" />
          {onInline && (
            <label className="st-scenetab__inline" title="Seçili sahnenin katmanlarını kartların yanında küçük bir panelde göster (kapalıyken kalem büyük düzenleyiciyi açar)">
              <input type="checkbox" checked={Boolean(inline)} onChange={(e) => onInline(e.target.checked)} /> Katmanlar yanda
            </label>
          )}
          <button type="button" className="btn btn--sm btn--primary" onClick={(e) => onAddScene(e.currentTarget)} title="Şablondan yeni sahne: kamera düzenleri, çoklu görüntü, başlıyor / ara / bitti, bilgi ekranları, maç anları, LED">
            <Icon name="plus" size={13} /> Yeni sahne ekle
          </button>
        </header>
        <section className="st-scenegrid" aria-label="Sahneler">
          {config.scenes.map((sc, i) => {
            const t = { id: sc.id, kind: "scene", name: sc.name, hotkey: i < 9 ? i + 1 : null };
            const names = sc.layers.map((l) => byId.get(l.sourceId)?.name).filter(Boolean);
            return (
              <div key={sc.id} className={`st-scard ${sc.id === selectedSceneId ? "is-selected" : ""}`}>
                <Tile tile={t} size="grid" register={register} studioMode={studioMode}
                  onAir={sc.id === config.programSceneId} inPreview={studioMode && sc.id === config.previewSceneId && sc.id !== config.programSceneId} onLed={sc.id === ledId}
                  bad={tileWarning(config, runtimeRef.current, t)} onPreview={pick} onProgram={onProgram} onToLed={onToLed} onEdit={edit} menu={tileMenu(t)} />
                <div className="st-scard__foot">
                  <button type="button" className="st-scard__layers" onClick={() => (inline ? select(sc.id) : edit(sc.id))} title={`${names.join(", ") || "Boş sahne"} — tıkla: katmanları düzenle`}><Icon name="layers" size={11} /> {names.length ? `${names.length} katman · ${names.join(" · ")}` : "boş — katman ekle"}</button>
                  <MenuButton label="Kaynak ekle" icon="plus" text="Kaynak" size={12} className="st-menu-sm" align="end" items={sourceMenu(config, sc.id, actions)} />
                </div>
              </div>
            );
          })}
          <button type="button" className="st-scard is-add" onClick={(e) => onAddScene(e.currentTarget)}><Icon name="plus" size={18} /><span>Yeni sahne ekle</span><small>şablonlar ve hazır ekranlar</small></button>
        </section>
      </div>
      {showInline && (
        <SceneInlineEditor config={config} configRef={configRef} runtimeRef={runtimeRef} scene={scene} selectedLayerId={selectedLayerId} onSelectLayer={onSelectLayer}
          outW={outW} outH={outH} overrideRef={overrideRef} matchClockRef={matchClockRef}
          isProgram={scene.id === config.programSceneId} isPreview={studioMode && scene.id === config.previewSceneId} actions={actions} onClose={() => onSelectScene(null)} />
      )}
      {libActions && <aside className="st-scenetab__side"><SourceRows config={config} runtimeRef={runtimeRef} version={version} sceneId={scene?.id || null} actions={{ ...libActions, onSceneFromSource: actions.onSceneFromSource }} /></aside>}
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

/** Düzenleyicinin kendi tuvali (önizleme çözünürlüğünde, ~30 fps). extraRef.current?.(ctx, w, h, now): üst çizim (grafikler). */
export function useEditorCanvas(configRef, runtimeRef, sceneId, overrideRef, matchClockRef, W, H, maxW = 1280, extraRef = null) {
  const canvas = useMemo(() => document.createElement("canvas"), []);
  useEffect(() => {
    const w = Math.min(maxW, W);
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
  }, [canvas, W, H, maxW]);
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
      if (extraRef?.current) { ctx.save(); try { extraRef.current(ctx, canvas.width, canvas.height, now); } catch { /* yoksay */ } ctx.restore(); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvas, configRef, extraRef, matchClockRef, overrideRef, runtimeRef, sceneId]);
  return canvas;
}

export function SceneNameEdit({ scene, onRename }) {
  const [name, setName] = useState(scene.name);
  useEffect(() => setName(scene.name), [scene.name]);
  const done = () => { if (name.trim() && name !== scene.name) onRename(scene.id, name); else setName(scene.name); };
  return <input className="st-editor__name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); e.stopPropagation(); }} aria-label="Sahne adı" />;
}
