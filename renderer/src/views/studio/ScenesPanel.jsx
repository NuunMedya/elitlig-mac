// Yayın Stüdyosu · Sahneler: tıkla → önizlemeye al, çift tıkla → yayına ver,
// 1–9 kısayolları, yeniden adlandır / çoğalt / sırala / sil.
import React, { useState } from "react";
import { Icon, Kbd, MenuButton } from "../../components/ui";

export default function ScenesPanel({ scenes, previewId, programId, onPreview, onProgram, onAdd, onRename, onDuplicate, onMove, onRemove }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const begin = (sc) => { setEditing(sc.id); setName(sc.name); };
  const commit = () => { if (editing) onRename(editing, name); setEditing(null); };

  return (
    <section className="st-panel st-scenes">
      <header className="st-panel__head">
        <h4>Sahneler</h4>
        <button type="button" className="icon-btn icon-btn--xs" title="Sahne ekle" onClick={onAdd}><Icon name="plus" size={14} /></button>
      </header>
      <ul className="st-list">
        {scenes.map((sc, i) => (
          <li key={sc.id} className={`st-list__item ${sc.id === previewId ? "is-preview" : ""} ${sc.id === programId ? "is-program" : ""}`}
            onClick={() => onPreview(sc.id)} onDoubleClick={() => onProgram(sc.id)} title="Tıkla: önizleme · çift tıkla: yayına ver">
            {i < 9 ? <Kbd>{i + 1}</Kbd> : <span className="st-list__pad" />}
            {editing === sc.id ? (
              <input className="st-list__input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
                onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
            ) : <span className="st-list__name">{sc.name}</span>}
            {sc.id === programId && <span className="st-tag is-live">YAYINDA</span>}
            {sc.id === previewId && sc.id !== programId && <span className="st-tag">ÖNİZLEME</span>}
            <MenuButton label="Sahne" size={14} items={[
              { label: "Yayına ver", icon: "play", onClick: () => onProgram(sc.id) },
              { label: "Yeniden adlandır", icon: "pencil", onClick: () => begin(sc) },
              { label: "Çoğalt", icon: "copy", onClick: () => onDuplicate(sc.id) },
              "-",
              { label: "Yukarı taşı", icon: "chevronUp", disabled: i === 0, onClick: () => onMove(sc.id, -1) },
              { label: "Aşağı taşı", icon: "chevronDown", disabled: i === scenes.length - 1, onClick: () => onMove(sc.id, 1) },
              "-",
              { label: "Sil", icon: "trash", danger: true, disabled: scenes.length <= 1, onClick: () => onRemove(sc) },
            ]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
