// Yayın grafikleri · "Hangi sahnelerde görünsün" seçici (çoklu seçim).
//   <SceneVisibility g={g} kind="scorebug" | "subtitle" | "interview" scenes={[{ id, name }]} />
// Değer g.visibility[kind] ("all" | [sceneId…]); yalnız bu maç için saklanır.
import React from "react";
import { Icon } from "../../../components/ui";
import { toggleSceneVisibility, visibilitySummary } from "../../../lib/studio/graphics/visibility";

export default function SceneVisibility({ g, kind, scenes = [], title = "Hangi sahnelerde görünsün" }) {
  if (!g?.setVisibility) return null;
  const value = g.visibility?.[kind] ?? "all";
  const list = (Array.isArray(scenes) ? scenes : []).filter((s) => s && s.id != null);
  const ids = list.map((s) => String(s.id));
  const all = !Array.isArray(value);
  const on = (id) => all || value.map(String).includes(String(id));
  return (
    <section className="gx-card gx-vis" aria-label={title}>
      <header className="gx-card__head">
        <h6><Icon name="eye" size={13} /> {title}</h6>
        <small className="gx-vis__sum">{visibilitySummary(value, list)}</small>
      </header>
      <div className="gx-vis__chips" role="group" aria-label={title}>
        <button type="button" className={`gx-chip${all ? " is-on" : ""}`} aria-pressed={all} onClick={() => { if (!all) g.setVisibility(kind, "all"); }}>
          {all && <Icon name="check" size={12} />} Tüm sahneler
        </button>
        {list.map((s) => (
          <button key={s.id} type="button" className={`gx-chip${!all && on(s.id) ? " is-on" : ""}${all ? " is-implied" : ""}`} aria-pressed={on(s.id)}
            onClick={() => g.setVisibility(kind, toggleSceneVisibility(value, s.id, ids))} title={on(s.id) ? "Bu sahnede gizle" : "Bu sahnede göster"}>
            {on(s.id) && <Icon name="check" size={12} />} {s.name || s.id}
          </button>
        ))}
      </div>
      {!list.length && <p className="mg-muted mg-small">Sahne listesi yok: grafik tüm sahnelerde görünür.</p>}
      {Array.isArray(value) && !value.length && <p className="mg-note">Hiçbir sahne seçili değil: bu grafik programda görünmez.</p>}
      <p className="mg-muted mg-small">Yalnız bu maç için geçerli.</p>
    </section>
  );
}
