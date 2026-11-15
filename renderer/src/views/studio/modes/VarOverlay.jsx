// [2.33] VAR KİPİ — ÖNİZLEME (ve yayındayken PROGRAM) monitörünün üstünde, yalnız operatör görür
// (DOM katmanı; yayın tuvaline çizilmez). Ayrı VAR paneli yok:
//
//   Tekrar önizlemedeyken kaplamanın sağ altındaki [VAR] düğmesi → pozisyonun seçili açıları
//   (yoksa önizlemedeki açı) VAR çerçevelerine dizilir ve önizleme VAR kipine geçer.
//
//   ┌ VAR · ÖNİZLEMEDE   [Tek] [50/50] [Üst–alt] [PiP] [1+2] [2×2]                       ┐
//   │   ┌─ 1 · Kale arkası ▾ ─┐  ┌─ 2 · CANLI Ana kamera ▾ ─┐   ← çerçeveye tık: içerik seç  │
//   │   │                     │  │                          │      (açılar + canlı kameralar)│
//   └ [İNCELEME][KONTROL][KARAR ▾ GOL İPTAL]      [↩ Tekrara dön] [YAYINA AL]   [VAR ●]     ┘
//
// Çerçeve içeriği tek tıkla: tekrarın açılarından biri ya da canlı akıştaki bir kamera (kaynak).
// Düzenler VAR temasının çerçeveleri (lib/studio/var VAR_LAYOUTS: yan yana tekrarla aynı seçenekler).
// Yayına alma her zamanki GEÇİŞ yolu (Studio › take); programda değişiklikler anında yayında.
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { VAR_DECISIONS, VAR_LAYOUTS, VAR_STATES, normalizeVarV2, varLayoutOf } from "../../../lib/studio/var";
import { angleLabel, recordableSources, replayTitle } from "../../../lib/studio/replays";
import { varThemeLayout } from "../var/drawVar";
import "./varOverlay.css";

const REF_W = 1920;
const REF_H = 1080;

/** Çerçeve dikdörtgenleri (0…1, monitör kutusuna göre). */
export function varFrameRects(v) {
  const n = normalizeVarV2(v);
  const L = varThemeLayout(n.theme, n.layout, REF_W, REF_H);
  const count = varLayoutOf(n.layout).count;
  return L.panes.slice(0, count).map((p) => ({ x: p.rect.x / REF_W, y: p.rect.y / REF_H, w: p.rect.w / REF_W, h: p.rect.h / REF_H, inset: Boolean(p.inset) }));
}

/** Canlı kamera seçenekleri (çerçeveye konabilen canlı kaynaklar). */
export const liveCameraSources = (sources) => recordableSources(sources).filter((s) => s.kind !== "video");

/**
 * Önizlemedeki tekrardan VAR ayarı: açılar sırayla çerçevelere; düzen açı sayısına göre
 * (1 → Tek, 2 → 50/50, 3 → 1+2, 4 → 2×2). Var olan konu / durum korunur.
 */
export function varFromReplay(cur, replayId, angles) {
  const list = (angles || []).filter(Boolean).slice(0, 4);
  const n = normalizeVarV2(cur);
  const layout = list.length >= 4 ? "grid" : list.length === 3 ? "three" : list.length === 2 ? "two" : "single";
  const slots = list.map((a) => ({ kind: "replay", replayId, angle: a }));
  while (slots.length < 4) slots.push({ kind: "none" });
  return normalizeVarV2({ ...n, layout, slots, state: n.state === "decision" ? "review" : n.state, replayId });
}

/** Çerçeveye içerik ata (patch: { kind: "replay", replayId, angle } | { kind: "source", sourceId } | { kind: "none" }). */
export function setVarFrame(cur, i, patch) {
  const n = normalizeVarV2(cur);
  return normalizeVarV2({ ...n, slots: n.slots.map((s, k) => (k === i ? { kind: patch.kind, replayId: patch.replayId || null, angle: patch.angle || "program", sourceId: patch.sourceId || null } : s)) });
}

function FramePicker({ i, slot, replay, replays, sources, onPick, onClose, anchor }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains?.(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey, true); };
  }, [anchor, onClose]);
  const cams = liveCameraSources(sources);
  const others = (replays || []).filter((r) => r.id !== replay?.id && (r.angles || []).some((a) => a.url)).slice(0, 4);
  const isOn = (k, a, src) => slot?.kind === k && (k === "replay" ? slot.replayId === replay?.id && slot.angle === a : slot.sourceId === src);
  return (
    <div ref={ref} className="vo-pick" role="menu" aria-label={`${i + 1}. çerçeve`} onPointerDown={(e) => e.stopPropagation()}>
      <h6>{replay ? replayTitle(replay, {}) : "Tekrar"} · açılar</h6>
      <div className="vo-pick__g">
        {(replay?.angles || []).filter((a) => a.url).map((a) => (
          <button key={a.angle} type="button" role="menuitem" className={isOn("replay", a.angle) ? "is-on" : ""} onClick={() => onPick({ kind: "replay", replayId: replay.id, angle: a.angle })}>
            <Icon name="repeat" size={11} /> {angleLabel(a, sources)}
          </button>
        ))}
        {!replay && <small className="muted">Tekrar yok</small>}
      </div>
      <h6>Canlı kameralar</h6>
      <div className="vo-pick__g">
        {cams.map((s) => (
          <button key={s.id} type="button" role="menuitem" className={`is-live ${isOn("source", null, s.id) ? "is-on" : ""}`} onClick={() => onPick({ kind: "source", sourceId: s.id })}>
            <i className="vo-live" /> {s.name}
          </button>
        ))}
        {!cams.length && <small className="muted">Canlı kamera kaynağı yok</small>}
      </div>
      {others.length > 0 && (
        <>
          <h6>Başka pozisyon</h6>
          <div className="vo-pick__g">
            {others.map((r) => {
              const a = (r.angles || []).find((x) => x.url);
              return <button key={r.id} type="button" role="menuitem" onClick={() => onPick({ kind: "replay", replayId: r.id, angle: a.angle })}><Icon name="repeat" size={11} /> {replayTitle(r, {})}</button>;
            })}
          </div>
        </>
      )}
      <div className="vo-pick__g"><button type="button" role="menuitem" className={slot?.kind === "none" ? "is-on" : ""} onClick={() => onPick({ kind: "none" })}><Icon name="x" size={11} /> Boş bırak</button></div>
    </div>
  );
}

/**
 * vr: useVar (settings, set). target: "preview" | "program". onTake / onLive / onBack (tekrara dön).
 */
function VarOverlay({ vr, replays = [], sources = [], box, target = "preview", onTake, canTake = true, onLive, onBack }) {
  const v = vr?.settings || normalizeVarV2(null);
  const [pick, setPick] = useState(null); // { i, anchor }
  const rects = useMemo(() => varFrameRects(v), [v]);
  const slots = v.slots || [];
  const firstReplayId = slots.find((s) => s.kind === "replay")?.replayId || v.replayId || null;
  const replay = replays.find((r) => r.id === firstReplayId) || replays.find((r) => (r.angles || []).some((a) => a.url)) || null;
  const isPgm = target === "program";
  const compact = (box?.w || 0) > 0 && box.w < 640;
  const set = (patch) => vr?.set?.(patch);
  const nameOf = (s) => {
    if (!s || s.kind === "none") return "Boş";
    if (s.kind === "source") return sources.find((x) => x.id === s.sourceId)?.name || "Canlı kamera";
    const r = replays.find((x) => x.id === s.replayId);
    const a = r?.angles?.find((x) => x.angle === s.angle) || { angle: s.angle };
    return angleLabel(a, sources);
  };
  return (
    <div className={`vo ${isPgm ? "is-pgm" : "is-pvw"} ${compact ? "is-compact" : ""}`} data-var-overlay={target}>
      <div className="vo__top">
        <span className={`vo__tag ${isPgm ? "is-air" : ""}`}>{isPgm ? "● VAR YAYINDA" : "VAR · ÖNİZLEMEDE"}</span>
        <span className="vo__layouts" role="radiogroup" aria-label="VAR çerçeve düzeni">
          {VAR_LAYOUTS.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={v.layout === l.key} className={v.layout === l.key ? "is-on" : ""} onClick={() => set({ layout: l.key })} title={`${l.label}: ${l.hint}`} data-var-layout={l.key}>{l.short || l.label}</button>
          ))}
        </span>
      </div>
      {rects.map((r, i) => {
        const s = slots[i];
        return (
          <button key={i} type="button" className={`vo-frame ${s?.kind === "source" ? "is-live" : ""} ${s?.kind === "none" || !s ? "is-empty" : ""} ${pick?.i === i ? "is-open" : ""} ${r.inset ? "is-inset" : ""}`}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            onClick={(e) => setPick((p) => (p?.i === i ? null : { i, anchor: e.currentTarget }))} data-var-frame={i}
            title={`${i + 1}. çerçeve: ${nameOf(s)} — tık: açı ya da canlı kamera seç`}>
            <span className="vo-frame__lbl">{i + 1} · {s?.kind === "source" && <i className="vo-live" />}{nameOf(s)} <Icon name="chevronDown" size={10} /></span>
          </button>
        );
      })}
      {pick && (
        <div className="vo-pickwrap" style={{ left: `${Math.min(70, rects[pick.i]?.x * 100 || 0)}%`, top: `${(rects[pick.i]?.y || 0) * 100 + 4}%` }}>
          <FramePicker i={pick.i} slot={slots[pick.i]} replay={replay} replays={replays} sources={sources} anchor={pick.anchor}
            onPick={(patch) => { vr?.setSlot?.(pick.i, { kind: patch.kind, replayId: patch.replayId || null, angle: patch.angle || "program", sourceId: patch.sourceId || null }); setPick(null); }}
            onClose={() => setPick(null)} />
        </div>
      )}
      <div className="vo__bot" onPointerDown={(e) => e.stopPropagation()}>
        <span className="vo__states" role="radiogroup" aria-label="VAR durumu">
          {VAR_STATES.map((st) => (
            <button key={st.key} type="button" role="radio" aria-checked={v.state === st.key} className={`is-${st.tone} ${v.state === st.key ? "is-on" : ""}`} onClick={() => set({ state: st.key })}>{st.label}</button>
          ))}
          {v.state === "decision" && (
            <select className="select-xs" value={v.decision} onChange={(e) => set({ decision: e.target.value })} aria-label="Karar">
              {VAR_DECISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          )}
        </span>
        <span className="st-top__spacer" />
        {!isPgm && onBack && <button type="button" className="vo__btn" onClick={onBack} title="VAR'dan çık: önizleme tekrara döner"><Icon name="undo" size={12} />{compact ? "" : " Tekrara dön"}</button>}
        {!isPgm && onTake && <button type="button" className="vo__btn is-take" onClick={onTake} disabled={!canTake} title="VAR'ı yayına al (GEÇİŞ)"><Icon name="broadcast" size={12} /> {compact ? "YAYINA" : "YAYINA AL"}</button>}
        {isPgm && onLive && <button type="button" className="vo__btn is-live" onClick={onLive} title="Canlıya dön (V)"><Icon name="stop" size={12} /> {compact ? "CANLI" : "CANLIYA DÖN"}</button>}
        {!isPgm && <button type="button" className="vo__var is-on" onClick={onBack} aria-pressed="true" title="VAR açık · tık: tekrara dön">VAR</button>}
      </div>
    </div>
  );
}

export default memo(VarOverlay);
