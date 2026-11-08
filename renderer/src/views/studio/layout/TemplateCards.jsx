// Yayın Stüdyosu · HAZIR PANEL kartları (Kutu ekle › Hazır panel ve Ayarlar › Yerleşim):
// her şablon küçük yerleşim çizimiyle; "Ekle" yeni sekme (pano) olarak açar.
import React from "react";
import { Icon } from "../../../components/ui";
import "./templates.css";
import { BOARD_TEMPLATES, TEMPLATE_AREAS } from "./boardTemplates";
import { componentOf } from "./layoutModel";

const toneOf = (t) => {
  const m = componentOf(t);
  const g = m?.group || "";
  if (g.includes("reji") || g === "w-reji") return "is-reji";
  if (g.includes("tekrar")) return "is-tekrar";
  if (g.includes("sahne")) return "is-sahne";
  if (g.includes("led")) return "is-led";
  if (g.includes("mac") || g === "macsonu") return "is-mac";
  return "is-x";
};

/** Şablonun küçük çizimi (ızgara birimleri → SVG). */
export function TemplatePic({ tpl }) {
  const rows = Math.max(...tpl.items.map((i) => i.y + i.h), 1);
  const W = 100, H = Math.max(40, Math.min(90, (rows / tpl.cols) * 100 * 0.55));
  const sx = W / tpl.cols, sy = H / rows;
  return (
    <svg className="lw-tpic" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {tpl.items.map((it, i) => <rect key={i} x={it.x * sx + 0.6} y={it.y * sy + 0.6} width={Math.max(1, it.w * sx - 1.2)} height={Math.max(1, it.h * sy - 1.2)} rx="1.4" className={toneOf(it.t)} />)}
    </svg>
  );
}

export default function TemplateCards({ onAdd, filter = "", has = () => false }) {
  const q = filter.toLocaleLowerCase("tr-TR");
  return (
    <>
      {TEMPLATE_AREAS.map((a) => {
        const list = BOARD_TEMPLATES.filter((t) => t.area === a.key && (!q || `${t.label} ${t.hint}`.toLocaleLowerCase("tr-TR").includes(q)));
        if (!list.length) return null;
        return (
          <section key={a.key} className="lw-cat__sec">
            <h6>Hazır panel · {a.label}</h6>
            <div className="lw-cat__grid is-tpl">
              {list.map((t) => (
                <div key={t.key} className="lw-card is-tpl">
                  <TemplatePic tpl={t} />
                  <span className="lw-card__t"><strong>{t.label}</strong><small>{t.hint} · {t.items.length} parça</small></span>
                  {has(t.key) && <em className="lw-card__on"><Icon name="check" size={11} /> var</em>}
                  <button type="button" className="btn btn--xs btn--primary" onClick={() => onAdd(t)}><Icon name="plus" size={11} /> Sekme olarak ekle</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
