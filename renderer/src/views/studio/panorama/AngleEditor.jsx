// Panorama · AÇI DÜZENLEYİCİ ve DÜZEN EDİTÖRÜ.
//
// AngleEditor: açının düzeni (40+ hazır + kendi düzenlerin), köşe / yön (ayna), tüm yuvalara stil
// (boşluk, köşe, kenarlık, gölge, maske), yuvalara kaynak ve her kaynağın konumu için sürükle-bırak
// ince ayar (x / y / genişlik / yükseklik, kırpma, maske) — 16:9 sahne üzerinde.
// LayoutEditor: kendi düzenini kur (yuva ekle / sil, sürükle, boyutlandır, maske, kart kutusu).
import React, { useMemo, useRef, useState } from "react";
import { Icon, Modal } from "../../../components/ui";
import { LAYOUT_GROUPS, MASKS, allLayouts, angleGeometry, layoutDraftFrom, layoutFromAngle, layoutOf, normalizeCustomLayout } from "../../../lib/studio/panorama/layouts";
import { fillSlots, normalizeAngle } from "../../../lib/studio/panorama/model";

const r3 = (v) => Math.round(v * 1000) / 1000;
const snap = (v) => Math.round(v * 200) / 200; // %0,5
const pct = (v) => Math.round(v * 1000) / 10;

/** Düzen simgesi: yuvalar ve kart kutusu (küçük çizim). */
export function LayoutPic({ layout, active = false, geometry = null }) {
  const L = layoutOf(layout);
  const slots = geometry ? geometry.slots : L.slots;
  const card = geometry ? geometry.card : L.card;
  const shape = (m) => (m === "circle" || m === "ellipse" ? "50%" : null);
  return (
    <span className={`pn-lpic ${active ? "is-on" : ""}`} aria-hidden="true">
      {card && <i className="is-card" style={{ left: `${card.x * 100}%`, top: `${card.y * 100}%`, width: `${card.w * 100}%`, height: `${card.h * 100}%` }} />}
      {slots.map((b, i) => <i key={i} className={b.mask && b.mask !== "rect" ? `is-${b.mask}` : ""} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, zIndex: 1 + (b.z || 0), ...(shape(b.mask) ? { borderRadius: shape(b.mask) } : {}) }}><b>{i + 1}</b></i>)}
    </span>
  );
}

/**
 * 16:9 sahne: kutuları sürükle (taşı) ve sağ alt tutamaçtan boyutlandır. boxes: [{ x, y, w, h, mask, label, kind }]
 * onChange(i, kutu) — kutu 0…1 (yarım yüzde adımlı).
 */
export function BoxStage({ boxes, selected, onSelect, onChange }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const down = (e, i, mode) => {
    e.preventDefault(); e.stopPropagation();
    onSelect(i);
    const r = ref.current.getBoundingClientRect();
    drag.current = { i, mode, sx: e.clientX, sy: e.clientY, w: r.width, h: r.height, box: { ...boxes[i] } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.w; const dy = (e.clientY - d.sy) / d.h;
    const b = d.box;
    const nb = d.mode === "move" ? { ...b, x: snap(b.x + dx), y: snap(b.y + dy) } : { ...b, w: Math.max(0.02, snap(b.w + dx)), h: Math.max(0.02, snap(b.h + dy)) };
    onChange(d.i, nb);
  };
  const up = () => { drag.current = null; };
  return (
    <div className="pn-stage" ref={ref} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerDown={() => onSelect(null)} data-stage="">
      {boxes.map((b, i) => (
        <div key={i} className={`pn-stage__box is-${b.kind || "slot"} ${selected === i ? "is-sel" : ""} ${b.mask && b.mask !== "rect" ? `is-${b.mask}` : ""}`}
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, zIndex: 2 + (b.z || 0) + (selected === i ? 20 : 0) }}
          onPointerDown={(e) => down(e, i, "move")} data-box={i}>
          <span>{b.label}</span>
          <i className="pn-stage__grip" onPointerDown={(e) => down(e, i, "size")} title="Boyutlandır" />
        </div>
      ))}
    </div>
  );
}

function BoxFields({ box, onChange, crop = false, extra = null }) {
  const num = (k, label) => (
    <label className="field pn-mini"><span>{label} %</span><input className="input" type="number" step={0.5} value={pct(box[k])} onChange={(e) => onChange({ ...box, [k]: r3((Number(e.target.value) || 0) / 100) })} data-boxfield={k} /></label>
  );
  const c = box.crop || { l: 0, t: 0, r: 0, b: 0 };
  return (
    <div className="pn-boxfields">
      <div className="pn-row4">{num("x", "X")}{num("y", "Y")}{num("w", "Genişlik")}{num("h", "Yükseklik")}</div>
      {crop && (
        <div className="pn-row4">{[["l", "Kırp sol"], ["t", "Kırp üst"], ["r", "Kırp sağ"], ["b", "Kırp alt"]].map(([k, l]) => (
          <label key={k} className="field pn-mini pn-range"><span>{l} <b>{pct(c[k])}%</b></span><input type="range" min={0} max={0.45} step={0.005} value={c[k]} onChange={(e) => onChange({ ...box, crop: { ...c, [k]: Number(e.target.value) } })} data-crop={k} /></label>
        ))}</div>
      )}
      {extra}
    </div>
  );
}

const MaskSel = ({ value, onChange, inherit = false }) => (
  <label className="field pn-mini"><span>Maske / şekil</span>
    <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value || null)} data-field="mask">
      {inherit && <option value="">Düzenin şekli</option>}
      {MASKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  </label>
);

/** Düzen seçici (gruplu; kendi düzenlerin en sonda). */
function LayoutChooser({ value, onPick }) {
  const list = allLayouts();
  const groups = [...LAYOUT_GROUPS, "Benim düzenlerim"].map((g) => [g, list.filter((l) => l.group === g)]).filter(([, l]) => l.length);
  return (
    <div className="pn-layoutgroups">{groups.map(([g, items]) => (
      <div key={g} className="pn-layoutgroup"><small>{g}</small>
        <div className="pn-layouts">{items.map((l) => (
          <button key={l.key} type="button" className={`pn-layoutbtn ${value === l.key ? "is-on" : ""}`} onClick={() => onPick(l.key)} title={l.hint} data-layout={l.key}>
            <LayoutPic layout={l.key} active={value === l.key} /><small>{l.label}</small>
          </button>
        ))}</div>
      </div>
    ))}</div>
  );
}

export function AngleEditor({ angle, sources, onSave, onDelete, onClose, onSaveLayout, onEditLayout }) {
  const [a, setA] = useState(() => normalizeAngle(angle));
  const [sel, setSel] = useState(null);
  const L = layoutOf(a.layout);
  const g = useMemo(() => angleGeometry(a), [a]);
  const visual = sources.filter((s) => s.kind !== "audio");
  const names = new Map(sources.map((s) => [s.id, s.name]));
  const setLayout = (key) => { setSel(null); setA((x) => normalizeAngle({ ...x, layout: key, boxes: {}, cardBox: null, name: x.name === layoutOf(x.layout).label ? layoutOf(key).label : x.name, slots: fillSlots(key, sources).map((id, i) => x.slots[i] || id) })); };
  const setStyle = (patch) => setA((x) => normalizeAngle({ ...x, style: { ...(x.style || {}), ...patch } }));
  const boxes = [
    ...g.slots.map((b, i) => ({ ...b, label: `${i + 1}. ${names.get(a.slots[i]) || "boş"}`, kind: "slot" })),
    ...(g.card ? [{ ...g.card, label: "İçerik kartı", kind: "card" }] : []),
  ];
  const changeBox = (i, nb) => setA((x) => {
    if (i >= g.slots.length) return normalizeAngle({ ...x, cardBox: { x: nb.x, y: nb.y, w: nb.w, h: nb.h } });
    const cur = x.boxes?.[i] || {};
    return normalizeAngle({ ...x, boxes: { ...(x.boxes || {}), [i]: { ...cur, x: nb.x, y: nb.y, w: nb.w, h: nb.h, ...(nb.crop ? { crop: nb.crop } : {}), ...(nb.mask !== undefined ? { mask: nb.mask } : {}) } } });
  });
  const resetBox = (i) => setA((x) => { if (i >= g.slots.length) return normalizeAngle({ ...x, cardBox: null }); const b = { ...(x.boxes || {}) }; delete b[i]; return normalizeAngle({ ...x, boxes: b }); });
  const selBox = sel != null ? boxes[sel] : null;
  const st = a.style || {};
  return (
    <Modal title="Açıyı düzenle" onClose={onClose} width={1240} className="st-modal pn-modal pn-modal--angle">
      <div className="pn-form">
        <div className="pn-row2">
          <label className="field"><span>Ad</span><input className="input" value={a.name} maxLength={40} onChange={(e) => setA({ ...a, name: e.target.value })} /></label>
          <div className="pn-field"><span>Köşe / yön</span>
            <div className="pn-seg">
              <button type="button" className={a.mirror ? "is-on" : ""} onClick={() => setA(normalizeAngle({ ...a, mirror: !a.mirror }))} data-act="mirror" title="Yatay ayna: sol ↔ sağ (resim içinde resmin köşesi)">↔ Ayna</button>
              <button type="button" className={a.flip ? "is-on" : ""} onClick={() => setA(normalizeAngle({ ...a, flip: !a.flip }))} data-act="flip" title="Dikey: üst ↔ alt">↕ Çevir</button>
            </div>
          </div>
        </div>
        <div className="pn-angle-ed">
        <div className="pn-angle-ed__col">
        <div className="pn-field"><span>Düzen (kamera açısı)</span><LayoutChooser value={a.layout} onPick={setLayout} /></div>
        {L.slots.length > 0 && (
          <div className="pn-field"><span>Kameralar / kaynaklar</span>
            <div className="pn-slots">
              {L.slots.map((_, i) => (
                <label key={i} className="field"><span>{i + 1}. yer</span>
                  <select className="input" value={a.slots[i] || ""} onChange={(e) => setA({ ...a, slots: a.slots.map((s, k) => (k === i ? e.target.value || null : s)) })}>
                    <option value="">— boş —</option>
                    {visual.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="pn-field"><span>Görünüm (tüm kameralar)</span>
          <div className="pn-row4">
            <label className="field pn-mini pn-range"><span>Boşluk <b>{pct(st.gap || 0)}%</b></span><input type="range" min={0} max={0.06} step={0.002} value={st.gap || 0} onChange={(e) => setStyle({ gap: Number(e.target.value) })} data-style="gap" /></label>
            <label className="field pn-mini pn-range"><span>Köşe <b>{st.radius != null ? pct(st.radius) : "oto"}</b></span><input type="range" min={0} max={0.5} step={0.005} value={st.radius ?? 0.035} onChange={(e) => setStyle({ radius: Number(e.target.value) })} data-style="radius" /></label>
            <label className="field pn-mini pn-range"><span>Kenarlık <b>{st.border ?? "oto"}</b></span><input type="range" min={0} max={20} value={st.border ?? 3} onChange={(e) => setStyle({ border: Number(e.target.value) })} data-style="border" /></label>
            <label className="field pn-mini pn-range"><span>Gölge <b>{st.shadow ?? "oto"}</b></span><input type="range" min={0} max={80} value={st.shadow ?? 24} onChange={(e) => setStyle({ shadow: Number(e.target.value) })} data-style="shadow" /></label>
          </div>
          <div className="pn-row4">
            <label className="field pn-mini"><span>Kenarlık rengi</span><input type="color" className="input" value={st.borderColor || "#c026d3"} onChange={(e) => setStyle({ borderColor: e.target.value })} /></label>
            <MaskSel value={st.mask} inherit onChange={(m) => setStyle({ mask: m })} />
            <button type="button" className="btn btn--sm" onClick={() => setA(normalizeAngle({ ...a, style: {} }))}>Stili sıfırla</button>
          </div>
        </div>
        </div>
        <div className="pn-angle-ed__col">
        <div className="pn-field"><span>İnce ayar — kutuyu sürükle, sağ alt köşeden boyutlandır</span>
          <BoxStage boxes={boxes} selected={sel} onSelect={setSel} onChange={changeBox} />
          {selBox ? (
            <div className="pn-selbox">
              <b>{selBox.label}</b>
              <BoxFields box={{ ...selBox, crop: selBox.crop || (sel < g.slots.length ? a.boxes?.[sel]?.crop : null) }} crop={sel < g.slots.length} onChange={(nb) => changeBox(sel, nb)}
                extra={sel < g.slots.length ? <div className="pn-row2"><MaskSel value={a.boxes?.[sel]?.mask || ""} inherit onChange={(m) => setA((x) => normalizeAngle({ ...x, boxes: { ...(x.boxes || {}), [sel]: { ...(x.boxes?.[sel] || {}), mask: m || undefined } } }))} /><button type="button" className="btn btn--sm" onClick={() => resetBox(sel)}>Bu kutuyu sıfırla</button></div> : <button type="button" className="btn btn--sm" onClick={() => resetBox(sel)}>Kartı sıfırla</button>} />
            </div>
          ) : <p className="st-hint">Bir kutuya tıkla: konum, boyut, kırpma ve maske ayarları.</p>}
        </div>
        <div className="pn-checks">
          {L.card && <label><input type="checkbox" checked={a.card} onChange={(e) => setA({ ...a, card: e.target.checked })} /> İçerik kartı</label>}
          <label><input type="checkbox" checked={a.ticker} onChange={(e) => setA({ ...a, ticker: e.target.checked })} /> Alt bant (kayan yazı)</label>
          <label><input type="checkbox" checked={a.header} onChange={(e) => setA({ ...a, header: e.target.checked })} /> Künye (logo, başlık, saat)</label>
          {L.slots.length > 1 && <label><input type="checkbox" checked={a.names} onChange={(e) => setA({ ...a, names: e.target.checked })} /> İsim bantları</label>}
        </div>
        </div>
        </div>
      </div>
      <footer className="pn-modal__foot">
        {onDelete && <button type="button" className="btn btn--danger" onClick={onDelete}><Icon name="trash" size={13} /> Açıyı sil</button>}
        {onSaveLayout && <button type="button" className="btn" onClick={() => onSaveLayout(layoutFromAngle(a, `${a.name} düzeni`))} title="Bu açının (ince ayarlı) geometrisini kendi düzenlerine ekle" data-act="save-layout"><Icon name="layout" size={13} /> Düzen olarak kaydet</button>}
        {onEditLayout && <button type="button" className="btn" onClick={() => onEditLayout(L.custom ? L : layoutDraftFrom(L.key))} data-act="edit-layout"><Icon name="grid" size={13} /> {L.custom ? "Düzeni düzenle" : "Bu düzenden yeni düzen"}</button>}
        <span className="st-top__spacer" />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={() => onSave(normalizeAngle(a))} data-act="angle-save"><Icon name="check" size={13} /> Kaydet</button>
      </footer>
    </Modal>
  );
}

/** Kendi düzenini oluştur / düzenle. */
export function LayoutEditor({ layout, onSave, onDelete, onClose }) {
  const [l, setL] = useState(() => normalizeCustomLayout(layout || { label: "Benim düzenim", slots: [{ x: 0.03, y: 0.12, w: 0.4, h: 0.6 }], card: { x: 0.46, y: 0.115, w: 0.5, h: 0.775 } }));
  const [sel, setSel] = useState(0);
  const boxes = [...l.slots.map((b, i) => ({ ...b, label: `${i + 1}. kamera`, kind: "slot" })), ...(l.card ? [{ ...l.card, label: "İçerik kartı", kind: "card" }] : [])];
  const set = (patch) => setL((x) => normalizeCustomLayout({ ...x, ...patch, key: x.key }));
  const change = (i, nb) => setL((x) => (i >= x.slots.length ? normalizeCustomLayout({ ...x, card: nb }) : normalizeCustomLayout({ ...x, slots: x.slots.map((b, k) => (k === i ? { ...b, ...nb } : b)) })));
  const addSlot = () => { set({ slots: [...l.slots, { x: 0.7, y: 0.6, w: 0.25, h: 0.25, z: 2 }] }); setSel(l.slots.length); };
  const delSlot = () => { if (sel == null || sel >= l.slots.length) return; set({ slots: l.slots.filter((_, k) => k !== sel) }); setSel(null); };
  const selBox = sel != null ? boxes[sel] : null;
  const isSlot = sel != null && sel < l.slots.length;
  return (
    <Modal title="Düzen editörü" onClose={onClose} width={980} className="st-modal pn-modal pn-modal--layout">
      <div className="pn-form">
        <div className="pn-row2">
          <label className="field"><span>Düzen adı</span><input className="input" value={l.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} data-field="layout-name" /></label>
          <div className="pn-checks">
            <label><input type="checkbox" checked={Boolean(l.card)} onChange={(e) => set({ card: e.target.checked ? { x: 0.46, y: 0.115, w: 0.5, h: 0.775 } : null })} /> İçerik kartı</label>
            <label><input type="checkbox" checked={Boolean(l.full)} onChange={(e) => set({ full: e.target.checked })} /> Zemin yok (ilk kamera tam ekran)</label>
            <label><input type="checkbox" checked={l.band === "scores"} onChange={(e) => set({ band: e.target.checked ? "scores" : null })} /> Skor bandı</label>
          </div>
        </div>
        <BoxStage boxes={boxes} selected={sel} onSelect={setSel} onChange={change} />
        <div className="pn-brandbar">
          <button type="button" className="btn btn--sm" onClick={addSlot} disabled={l.slots.length >= 16} data-act="add-slot"><Icon name="plus" size={12} /> Kamera yeri ekle</button>
          <button type="button" className="btn btn--sm" onClick={delSlot} disabled={!isSlot}><Icon name="trash" size={12} /> Seçili yeri sil</button>
          <span className="st-hint">{l.slots.length} kamera yeri{l.card ? " + kart" : ""}</span>
        </div>
        {selBox && (
          <div className="pn-selbox"><b>{selBox.label}</b>
            <BoxFields box={selBox} onChange={(nb) => change(sel, nb)} extra={isSlot ? (
              <div className="pn-row4">
                <MaskSel value={selBox.mask || "rect"} onChange={(m) => change(sel, { ...selBox, mask: m })} />
                <label className="field pn-mini pn-range"><span>Köşe <b>{pct(selBox.radius || 0)}</b></span><input type="range" min={0} max={0.5} step={0.005} value={selBox.radius || 0} onChange={(e) => change(sel, { ...selBox, radius: Number(e.target.value) })} /></label>
                <label className="field pn-mini"><span>Katman (öne)</span><input className="input" type="number" min={0} max={9} value={selBox.z || 0} onChange={(e) => change(sel, { ...selBox, z: Number(e.target.value) || 0 })} /></label>
              </div>
            ) : null} />
          </div>
        )}
      </div>
      <footer className="pn-modal__foot">
        {onDelete && <button type="button" className="btn btn--danger" onClick={() => onDelete(l)}><Icon name="trash" size={13} /> Düzeni sil</button>}
        <span className="st-top__spacer" />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={() => onSave(l)} data-act="layout-save"><Icon name="check" size={13} /> Düzeni kaydet</button>
      </footer>
    </Modal>
  );
}
