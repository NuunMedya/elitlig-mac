// Panorama rejisi · BUTON IZGARASI (stream deck benzeri): sahne, geçiş, kes, FTB, alt yazı, tam ekran
// kart, medya (önizleme / yayın / PiP), bant, CANLI, tema, hazır ayar, sonraki kart… Durum ışıkları
// (yayında kırmızı, önizlemede yeşil, açık grafik mavi). Düzenle: buton ekle (tür + hedef + etiket +
// renk), sırala, sil; sütun sayısı. Kullanıcı ızgarası yoksa durumdan varsayılan ızgara üretilir.
import React, { useMemo, useState } from "react";
import { Icon } from "../../../../components/ui";
import { BUTTON_COLORS, BUTTON_TYPES, TAKE_KINDS, defaultButtons, regiId } from "../../../../lib/studio/panorama/regi";
import { BUILTIN_BRANDS } from "../../../../lib/studio/panorama/brands";
import { mediaSceneId } from "../../../../lib/studio/panorama/mediaBin";
import { TRANSITION_KINDS } from "../../../../lib/studio/transitions";
import { useRegi } from "./RegiCtx";

const REF_LISTS = {
  scene: (R) => R.pano.angles.map((a) => [a.id, a.name]),
  sceneAir: (R) => R.pano.angles.map((a) => [a.id, a.name]),
  lower: (R) => R.pano.gfx.lowers.map((l) => [l.id, l.title || l.kicker || "Alt yazı"]),
  title: (R) => R.pano.gfx.titles.map((l) => [l.id, l.title]),
  media: (R) => R.pano.media.items.map((m) => [m.id, m.name]),
  mediaAir: (R) => R.pano.media.items.map((m) => [m.id, m.name]),
  overlay: (R) => R.pano.media.items.map((m) => [m.id, m.name]),
  theme: (R) => [...R.brands, ...BUILTIN_BRANDS].map((b) => [b.id, b.name]),
  preset: (R) => R.presetData.list.map((p) => [p.id, p.name]),
  transition: () => TAKE_KINDS.map((k) => [k, TRANSITION_KINDS.find((t) => t.key === k)?.label || k]),
};

/** Butonun görünümü + durumu. */
export function buttonView(R, b) {
  const lookup = (k) => (REF_LISTS[k] ? REF_LISTS[k](R).find(([id]) => id === b.ref)?.[1] : null);
  const t = BUTTON_TYPES.find(([k]) => k === b.type)?.[1] || b.type;
  const g = R.pano.gfx;
  const on = (o, id) => Boolean(o && !o.hideAt && (!id || o.id === id));
  let label = b.label; let sub = ""; let state = ""; let icon = "zap";
  switch (b.type) {
    case "take": label ||= "GEÇİŞ"; icon = "chevronRight"; break;
    case "cut": label ||= "KES"; icon = "zap"; break;
    case "ftb": label ||= "FTB"; icon = "moon"; state = R.comp.programFx().ftb ? "live" : ""; break;
    case "scene": case "sceneAir": { const i = R.pano.angles.findIndex((a) => a.id === b.ref); label ||= lookup(b.type) || "Sahne"; sub = b.type === "sceneAir" ? "doğrudan yayın" : i >= 0 ? `${i + 1}` : ""; icon = "video"; state = R.config.programSceneId === b.ref ? "live" : R.config.previewSceneId === b.ref ? "pvw" : ""; break; }
    case "lower": label ||= lookup("lower") || "Alt yazı"; sub = "alt yazı"; icon = "type"; state = on(g.lowerOn, b.ref) ? "on" : ""; break;
    case "lowerNext": label ||= "Sıradaki"; sub = "alt yazı"; icon = "skip"; break;
    case "lowerHide": label ||= "Alt yazı gizle"; icon = "eye"; state = on(g.lowerOn) ? "on" : ""; break;
    case "title": label ||= lookup("title") || "Kart"; sub = "tam ekran"; icon = "monitor"; state = on(g.titleOn, b.ref) ? "on" : ""; break;
    case "media": case "mediaAir": label ||= lookup("media") || "Medya"; sub = b.type === "mediaAir" ? "yayına" : "önizleme"; icon = "image"; state = R.config.programSceneId === mediaSceneId(b.ref) ? "live" : R.config.previewSceneId === mediaSceneId(b.ref) ? "pvw" : ""; break;
    case "overlay": label ||= lookup("overlay") || "PiP"; sub = "PiP / katman"; icon = "layers"; state = R.pano.media.overlay?.id === b.ref && !R.pano.media.overlay.hideAt ? "live" : ""; break;
    case "mediaStop": label ||= "Medyayı kaldır"; icon = "x"; state = R.pano.media.overlay && !R.pano.media.overlay.hideAt ? "on" : ""; break;
    case "ticker": label ||= "Kayan bant"; icon = "list"; state = g.tickerOn ? "on" : ""; break;
    case "live": label ||= R.tokens.liveBug?.text || "CANLI"; sub = "rozet"; icon = "broadcast"; state = g.live ? "live" : ""; break;
    case "theme": label ||= lookup("theme") || "Tema"; sub = "tema"; icon = "palette"; state = R.pano.brandId === b.ref ? "on" : ""; break;
    case "preset": label ||= lookup("preset") || "Hazır ayar"; sub = "gösteri"; icon = "grid"; state = R.pano.presetId === b.ref ? "on" : ""; break;
    case "cardNext": label ||= "Sonraki kart"; icon = "chevronRight"; break;
    case "transition": label ||= lookup("transition") || "Geçiş"; sub = "geçiş türü"; icon = "swap"; state = R.prefs.transition === b.ref ? "on" : ""; break;
    default: label ||= t;
  }
  return { label, sub, state, icon };
}

export default function ButtonGrid() {
  const R = useRegi();
  const regi = R.pano.regi;
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({ type: "scene", ref: "", label: "", color: "" });
  const list = useMemo(() => regi.buttons || defaultButtons({ angles: R.pano.angles, lowers: R.pano.gfx.lowers, titles: R.pano.gfx.titles }), [regi.buttons, R.pano.angles, R.pano.gfx.lowers, R.pano.gfx.titles]);
  const setList = (fn) => R.setRegi((r) => ({ ...r, buttons: fn(r.buttons || list) }));
  const refs = REF_LISTS[draft.type]?.(R) || null;
  return (
    <div className="pr-deck" data-panel="butonlar">
      <div className="pr-bar">
        <small className="st-hint">{regi.buttons ? `${list.length} buton` : "Varsayılan ızgara"}</small>
        <span className="st-top__spacer" />
        <label className="pr-inline">sütun <input className="input" type="number" min={2} max={8} value={regi.buttonCols} onChange={(e) => R.setRegi((r) => ({ ...r, buttonCols: Math.max(2, Math.min(8, Number(e.target.value) || 4)) }))} /></label>
        <button type="button" className={`btn btn--xs ${edit ? "btn--primary" : ""}`} onClick={() => setEdit(!edit)} data-act="deck-edit"><Icon name="pencil" size={11} /> {edit ? "Bitti" : "Düzenle"}</button>
      </div>
      <div className="pr-deck__grid" style={{ gridTemplateColumns: `repeat(${regi.buttonCols}, minmax(0, 1fr))` }}>
        {list.map((b, i) => {
          const v = buttonView(R, b);
          return (
            <div key={b.id} className={`pr-key is-${v.state || "idle"}`} style={b.color ? { "--key": b.color } : undefined} data-key-type={b.type}>
              <button type="button" className="pr-key__btn" onClick={() => R.fireButton(b)} title={`${v.label}${v.sub ? ` · ${v.sub}` : ""}`}>
                <Icon name={v.icon} size={18} /><b>{v.label}</b>{v.sub && <small>{v.sub}</small>}
              </button>
              {edit && (
                <span className="pr-key__ed">
                  <button type="button" onClick={() => setList((l) => { const a = [...l]; if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })} aria-label="Öne"><Icon name="chevronLeft" size={10} /></button>
                  <button type="button" onClick={() => setList((l) => l.filter((x) => x.id !== b.id))} aria-label="Sil"><Icon name="x" size={10} /></button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {edit && (
        <div className="pr-ed pr-deck__add">
          <div className="pn-row2">
            <label className="field pn-mini"><span>Tür</span><select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value, ref: "" })} data-field="key-type">{BUTTON_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {refs && <label className="field pn-mini"><span>Hedef</span><select className="input" value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value })} data-field="key-ref"><option value="">Seç…</option>{refs.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>}
          </div>
          <div className="pn-row2">
            <label className="field pn-mini"><span>Etiket (boş: otomatik)</span><input className="input" value={draft.label} maxLength={28} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
            <div className="field pn-mini"><span>Renk</span><span className="pr-swatches">{BUTTON_COLORS.map((c) => <button key={c || "x"} type="button" className={draft.color === c ? "is-on" : ""} style={{ background: c || "var(--surface-3)" }} onClick={() => setDraft({ ...draft, color: c })} aria-label={c || "Renksiz"} />)}</span></div>
          </div>
          <div className="pr-bar">
            <button type="button" className="btn btn--xs btn--primary" disabled={Boolean(refs) && !draft.ref} onClick={() => { setList((l) => [...l, { ...draft, id: regiId("bt") }]); setDraft({ ...draft, label: "" }); }} data-act="key-add"><Icon name="plus" size={11} /> Buton ekle</button>
            <button type="button" className="btn btn--xs" onClick={() => R.setRegi((r) => ({ ...r, buttons: null }))}>Varsayılana dön</button>
          </div>
        </div>
      )}
    </div>
  );
}
