// Yayın Stüdyosu — olayın oyuncusunu seçme penceresi (mobil PlayerPicker).
// Önce İlk 11, sonra yedekler; tek tık olayı kaydeder. "Oyuncusuz kaydet"
// olayı oyuncu bilgisi olmadan yazar. Klavye: rakam yazıp Enter → forma no.
// İsteğe bağlı `codes` / `code` / `onCode`: olay türü çipleri (ör. gol çeşidi).
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Modal } from "../../components/ui";

export default function PlayerPicker({ title, subtitle, players, side, busy, clipKey, onPick, onClose, codes = null, code = null, onCode = null }) {
  const [q, setQ] = useState("");
  const starters = players.filter((p) => p.role === "starter");
  const others = players.filter((p) => p.role !== "starter");
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  const filter = (list) => (needle ? list.filter((p) => p.number === needle || p.name.toLocaleLowerCase("tr-TR").includes(needle)) : list);
  const shown = useMemo(() => [...filter(starters), ...filter(others)], [needle, players]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setQ(""); }, [title]);

  const onKey = (e) => {
    if (e.key === "Enter" && shown.length === 1 && !busy) { e.preventDefault(); onPick(shown[0].id); }
  };

  const group = (label, list) => (list.length ? (
    <section className="st-picker__group">
      <h5>{label}</h5>
      <div className="st-picker__grid">
        {list.map((p) => (
          <button key={p.id} type="button" className="st-picker__cell" disabled={busy} onClick={() => onPick(p.id)} title={p.position || undefined}>
            <span className={`st-picker__no is-${side}`}>{p.number || "–"}</span>
            <span className="st-picker__name">{p.name}{p.captain ? " (K)" : ""}</span>
          </button>
        ))}
      </div>
    </section>
  ) : null);

  return (
    <Modal title={title} onClose={onClose} width={640} className="st-modal st-picker"
      footer={<>
        {clipKey ? <span className="muted small st-picker__clip"><Icon name="video" size={13} /> Gol anı klip olarak kaydedildi</span> : <span />}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={() => onPick(null)} disabled={busy}>Oyuncusuz kaydet</button>
      </>}>
      {subtitle && <p className="muted small st-picker__sub">{subtitle}</p>}
      {codes?.length > 0 && (
        <div className="st-picker__codes" role="radiogroup" aria-label="Olay türü">
          {codes.map((c) => (
            <button key={c.code} type="button" role="radio" aria-checked={code === c.code} className={`btn btn--xs${code === c.code ? " btn--primary" : ""}`} onClick={() => onCode?.(c.code)}>{c.label}</button>
          ))}
        </div>
      )}
      <input type="search" placeholder="Forma no ya da ad yaz…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus />
      {players.length ? (
        needle ? group("Eşleşenler", shown) : <>{group("İlk 11", starters)}{group("Yedekler", others)}</>
      ) : (
        <p className="muted small st-picker__empty">Bu takımın kadrosu girilmemiş. Olayı oyuncusuz kaydedebilirsin; golcü sonra maç sonu ekranından düzeltilir.</p>
      )}
    </Modal>
  );
}
