// Yayın Stüdyosu · KISAYOL SAHNE KUTULARI — görünüm seçeneği (düğme başına, ctx.setItemOpts):
//   display "list"  (varsayılan) yalnız İSİM; layout "v" (Dikey: alt alta) | "h" (Yatay: yan yana, kayar)
//   display "thumb" KÜÇÜK RESİM: sahnenin DURAĞAN tek karesi (kompozisyon bir kez çizilir),
//                   30 sn'de bir, kademeli ve yalnız görünürken yenilenir (video / rAF yok).
// Sahne (tek), Sahneler (ızgara / liste), Sahne bankası, Sahne ızgarası (mini) aynı alanları kullanır.
import React from "react";
import { useSnapshotCanvas } from "../useSnapshot";
import "./sceneDisplay.css";

export const SCENE_DISPLAYS = [["list", "Liste"], ["thumb", "Küçük resim"]];
export const SCENE_LAYOUTS = [["v", "Dikey"], ["h", "Yatay"]];
const LEGACY_THUMB_VIEWS = new Set(["grid", "strip", "big"]);

/** Öğe seçeneklerinden görünüm: { display: "list" | "thumb", layout: "v" | "h" }. */
export function sceneDisplayOf(opts = {}) {
  const o = opts || {};
  const display = o.display === "thumb" || o.display === "list" ? o.display : LEGACY_THUMB_VIEWS.has(o.view) ? "thumb" : "list";
  const layout = o.layout === "h" ? "h" : "v";
  return { display, layout };
}

/** Seçenek alanları (wOptions şeması). layout: liste yönü seçilebilir mi (tek sahnede yok). */
export function sceneDisplayFields({ layout = true } = {}) {
  return [
    { key: "display", label: "Görünüm", type: "select", def: "list", choices: SCENE_DISPLAYS, hint: "Küçük resim sahnenin durağan karesidir: 30 sn'de bir yenilenir (video değil)" },
    ...(layout ? [{ key: "layout", label: "Liste yönü", type: "select", def: "v", choices: SCENE_LAYOUTS, when: (v) => sceneDisplayOf(v).display === "list" }] : []),
  ];
}

/** Sahnenin durağan küçük resmi (ctx.sceneTile.paintStill; yoksa şema yer tutucusu). */
export function SceneSnap({ ctx, id, w = 160, h = 90, className = "ws-th" }) {
  const S = ctx?.sceneTile;
  const scene = (ctx?.sceneOps?.list || []).find((s) => s.id === id) || null;
  const ref = useSnapshotCanvas(
    (c) => (S?.paintStill ? S.paintStill(c, id) : false),
    scene || id,
    { placeholder: (c) => S?.paintPlaceholder?.(c, id) },
  );
  return <canvas ref={ref} className={className} width={w} height={h} data-snap="scene" />;
}

const tallyOf = (S, id) => (S?.programId === id ? "air" : S?.previewId === id ? "pvw" : null);

/**
 * Sahne İSİM listesi: Dikey (alt alta) ya da Yatay (yan yana, sığmazsa kayar). Numara, ad,
 * YAYINDA / ÖNİZLEME. Tık: önizleme (ya da onTap) · çift tık: yayın.
 */
export function SceneNameList({ ctx, scenes, layout = "v", onTap = null, numbered = true, className = "" }) {
  const S = ctx?.sceneTile;
  return (
    <div className={`wsn ${layout === "h" ? "is-h" : "is-v"} ${className}`} role="list">
      {scenes.map((s, i) => {
        const t = tallyOf(S, s.id);
        return (
          <button key={s.id} type="button" role="listitem" className={`wsn__r ${t ? `is-${t}` : ""}`}
            onClick={() => (onTap ? onTap(s.id) : S?.onPreview(s.id))} onDoubleClick={() => S?.onProgram(s.id)}
            title={`${s.name} — tık: önizleme · çift tık: yayın`}>
            {numbered && <b>{i + 1}</b>}
            <span>{s.name}</span>
            {t && <em className={`is-${t}`}>{t === "air" ? "YAYINDA" : "ÖNİZLEME"}</em>}
          </button>
        );
      })}
      {!scenes.length && <span className="st-w__empty">Sahne yok.</span>}
    </div>
  );
}
