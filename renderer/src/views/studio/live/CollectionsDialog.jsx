// Yayın Stüdyosu — SAHNE KOLEKSİYONLARI penceresi (OBS "Sahne Koleksiyonu").
// Şimdiki sahneler + kaynaklar adla kaydedilir; başka koleksiyona geçince etkin olan
// önce güncel hâliyle saklanır. Dışa / içe aktarma: .json dosyası.
import React, { useRef, useState } from "react";
import { Icon, Modal } from "../../../components/ui";
import { exportCollection, importCollection, loadCollections, removeCollection, renameCollection, saveAsCollection, saveCollections, switchCollection } from "../../../lib/studio/collections";
import "./live.css";

const fmt = (ms) => { try { return new Date(ms).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } };

export default function CollectionsDialog({ config, onLoad, onClose, onAir = false, ask = null }) {
  const [cols, setColsState] = useState(() => loadCollections(localStorage));
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef(null);
  const setCols = (c) => { setColsState(c); saveCollections(localStorage, c); };
  const saveAs = () => {
    const { cols: next, item } = saveAsCollection(cols, config, name);
    setCols(next);
    setName("");
    setNote(`“${item.name}” kaydedildi (${config.scenes.length} sahne, ${config.sources.length} kaynak).`);
  };
  const load = async (id) => {
    const target = cols.items.find((i) => i.id === id);
    if (!target) return;
    if (onAir && ask && !(await ask({ title: "Koleksiyona geç", message: `Yayın sürüyor. “${target.name}” yüklenirse sahneler ve kaynaklar değişir (kameralar yeniden açılır).`, confirmLabel: "Geç" }))) return;
    const { cols: next, config: cfg } = switchCollection(cols, config, id);
    if (!cfg) return;
    setCols(next);
    onLoad(cfg);
    onClose();
  };
  const exp = (item) => {
    const blob = new Blob([exportCollection(item)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${item.name.replace(/[^\p{L}\p{N} _-]/gu, "_")}.elitlig-sahneler.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const imp = async (file) => {
    if (!file) return;
    const text = await file.text();
    const r = importCollection(cols, text);
    if (r.error) { setNote(r.error); return; }
    setCols(r.cols);
    setNote(`“${r.item.name}” içe aktarıldı. Yüklemek için “Yükle”ye bas.`);
  };
  return (
    <Modal title="Sahne koleksiyonları" onClose={onClose} width={560} className="st-modal">
      <div className="col-menu">
        <p className="st-hint">Koleksiyon = sahnelerin ve kaynakların tamamı. Farklı yayın türleri için ayrı takımlar tut (ör. “Lig maçı”, “Turnuva finali”, “Röportaj”). Geçerken etkin koleksiyon kendiliğinden güncellenir.</p>
        <div className="st-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yeni koleksiyon adı (ör. Lig maçı)" maxLength={60} onKeyDown={(e) => { if (e.key === "Enter") saveAs(); }} />
          <button type="button" className="btn btn--primary btn--sm" onClick={saveAs}><Icon name="plus" size={12} /> Şimdikini kaydet</button>
        </div>
        {note && <div className="st-note">{note}</div>}
        {cols.items.length ? (
          <ul className="col-list">
            {cols.items.map((i) => (
              <li key={i.id} className={i.id === cols.activeId ? "is-active" : ""}>
                <Icon name="folder" size={14} />
                <span>
                  <strong>{i.name}{i.id === cols.activeId ? " · etkin" : ""}</strong>
                  <small>{i.config.scenes.length} sahne · {i.config.sources.length} kaynak · {fmt(i.savedAt)}</small>
                </span>
                {i.id !== cols.activeId && <button type="button" className="btn btn--xs btn--primary" onClick={() => load(i.id)}>Yükle</button>}
                <button type="button" className="btn btn--xs" title="Yeniden adlandır" onClick={() => { const n = window.prompt?.("Yeni ad", i.name); if (n) setCols(renameCollection(cols, i.id, n)); }}><Icon name="pencil" size={11} /></button>
                <button type="button" className="btn btn--xs" title="Dışa aktar (.json)" onClick={() => exp(i)}><Icon name="download" size={11} /></button>
                <button type="button" className="btn btn--xs" title="Sil" onClick={() => setCols(removeCollection(cols, i.id))}><Icon name="trash" size={11} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="st-hint">Henüz koleksiyon yok. Şimdiki sahneleri bir adla kaydet.</p>}
        <div className="st-row">
          <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={12} /> İçe aktar (.json)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { imp(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
    </Modal>
  );
}
