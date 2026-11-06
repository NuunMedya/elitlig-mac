// Üst çubuk: DÜZENLE (yerleşim düzenleme kipi), Kutu ekle, Yeni sekme, Hazır düzen.
import React from "react";
import { Icon, MenuButton } from "../../../components/ui";
import { LAYOUT_PRESETS } from "./layoutModel";

export default function LayoutToolbar({ edit, setEdit, ctrlRef, preset, onSettings }) {
  const c = () => ctrlRef.current;
  const presets = [
    ...LAYOUT_PRESETS.map((p) => ({ label: `${p.label}${preset === p.key ? " ✓" : ""}`, icon: p.icon, hint: p.hint, onClick: () => c()?.applyPreset(p.key) })),
    "-",
    { label: "Yerleşim ayarları…", icon: "sliders", onClick: onSettings },
  ];
  return (
    <span className="lw-topedit">
      {edit && (
        <>
          <button type="button" className="btn btn--sm" onClick={() => c()?.openCatalog({})} title="Panel, bileşen ya da düğme ekle (kaldırılanlar en üstte)"><Icon name="plus" size={13} /> Kutu ekle</button>
          <button type="button" className="btn btn--sm" onClick={() => c()?.newBoard({})} title="Kendi sekmeni oluştur (boş pano)"><Icon name="grid" size={13} /> Yeni sekme</button>
        </>
      )}
      <MenuButton items={presets} text="Hazır düzen" icon="board" label="Hazır düzenler" align="end" />
      <button type="button" className={`btn btn--sm ${edit ? "is-on" : ""}`} onClick={() => setEdit(!edit)} aria-pressed={edit}
        title={edit ? "Düzenlemeyi bitir" : "Yerleşimi düzenle: sekmeleri sürükle, böl, birleştir, kaldır; panolarda bileşenleri taşı / boyutla"}>
        <Icon name={edit ? "check" : "pencil"} size={13} /> {edit ? "Bitti" : "Düzenle"}
      </button>
    </span>
  );
}
