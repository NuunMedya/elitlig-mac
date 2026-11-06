// Yayın grafikleri · ALTYAZI paneli (kendi sekmesi ya da Skorbord içinde):
//   yayına al / kaldır, satırlar (ekle / düzenle / sırala / kaldır), önizleme,
//   "hangi sahnelerde görünsün", gelişmiş ayarlar (bölümler, hız, sponsor, YZ).
//
//   <SubtitlePanel g={g} scenes={[{ id, name }]} embedded? />
// Satırlar ve ayarlar maçın yayın masasında (broadcast-state) — web /altyazi ile ortak.
import React, { useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import SubtitleDesk from "../manage/SubtitleDesk";
import GraphicsPreview from "./GraphicsPreview";
import { DeskError, GraphicsTabShell, GxCard, OnAirButton, useDeskPolling } from "./parts";
import SceneVisibility from "./SceneVisibility";

function SubtitleLines({ g }) {
  const [draft, setDraft] = useState({ tag: "", text: "" });
  const [edits, setEdits] = useState({});
  const lines = g.subtitle.lines;
  const add = async (e) => {
    e.preventDefault();
    if (await g.addLine(draft.tag, draft.text)) setDraft({ tag: draft.tag, text: "" });
  };
  return (
    <GxCard title="Satırlar" icon="list" aside={<small className="gx-count">{lines.length}/20</small>}>
      <form className="gx-addline" onSubmit={add}>
        <input className="gx-tag" value={draft.tag} maxLength={14} placeholder="ETİKET" aria-label="Etiket" onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value.toLocaleUpperCase("tr-TR") }))} />
        <input className="mg-grow" value={draft.text} maxLength={160} placeholder="Satır metni (ör. Maç sonu röportajları için yayında kalın)" aria-label="Satır metni" onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
        <button type="submit" className="btn btn--sm btn--primary" disabled={!draft.text.trim() || g.desk.saving}><Icon name="plus" size={13} /> Ekle</button>
      </form>
      {lines.length ? (
        <ol className="gx-lines">
          {lines.map((item, i) => (
            <li key={`${i}-${item.text}`}>
              <span className="gx-lines__no">{i + 1}</span>
              {item.tag ? <span className="mg-hl__tag">{item.tag}</span> : null}
              <input value={edits[i] ?? item.text} maxLength={160} aria-label="Satır metni" onChange={(e) => setEdits((m) => ({ ...m, [i]: e.target.value }))}
                onBlur={() => { const t = (edits[i] ?? item.text).trim(); setEdits((m) => { const n = { ...m }; delete n[i]; return n; }); if (t && t !== item.text) g.editLine(i, { text: t }); }} />
              <button type="button" className="icon-btn icon-btn--xs" title="Yukarı" disabled={i === 0} onClick={() => g.moveLine(i, -1)}><Icon name="chevronUp" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" title="Aşağı" disabled={i === lines.length - 1} onClick={() => g.moveLine(i, 1)}><Icon name="chevronDown" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" title="Kaldır" onClick={() => g.removeLine(i)}><Icon name="x" size={12} /></button>
            </li>
          ))}
        </ol>
      ) : <p className="mg-muted">Satır yok. Şeritte maçın skoru, golcüler ve yapay zekâ manşetleri yine kayar.</p>}
    </GxCard>
  );
}

/** Gövde (kabuksuz): başka bir sekmenin içine gömülebilir. */
export function SubtitleBody({ g, scenes = [] }) {
  const toast = useToast();
  const [advanced, setAdvanced] = useState(false);
  const desk = g.desk;
  return (
    <div className="gx-split">
      <div className="gx-split__main mg-stack">
        <DeskError desk={desk} />
        <SubtitleLines g={g} />
        <button type="button" className="btn btn--sm btn--ghost gx-adv" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
          <Icon name={advanced ? "chevronUp" : "chevronDown"} size={13} /> Gelişmiş: bölümler, hız, sponsor dönüşümü, yapay zekâ manşetleri
        </button>
        {advanced && (desk.loading ? <p className="mg-muted">Yükleniyor…</p> : <SubtitleDesk desk={desk} matchId={g.matchId} toast={toast} />)}
      </div>
      <aside className="gx-split__side">
        <GxCard title="Önizleme" icon="eye">
          <GraphicsPreview snapshot={{ ...g.snapshot, subtitle: { ...g.snapshot.subtitle, onAir: true } }} variant="off" width={300} fps={12} title="Altyazı önizlemesi" />
          <OnAirButton on={g.subtitle.onAir} onChange={g.setSubtitleOnAir} labelOn="Altyazıyı kaldır" labelOff="Altyazıyı yayına al" />
        </GxCard>
        <SceneVisibility g={g} kind="subtitle" scenes={scenes} title="Altyazı hangi sahnelerde görünsün" />
      </aside>
    </div>
  );
}

export default function SubtitlePanel({ g, scenes = [], embedded = false }) {
  useDeskPolling(g);
  if (embedded) return g?.matchId ? <SubtitleBody g={g} scenes={scenes} /> : null;
  return (
    <GraphicsTabShell g={g} title="Altyazı" icon="list"
      actions={g?.subtitle?.onAir ? <span className="pill pill--xs pill--red"><span className="gx-dot" /> Yayında</span> : null}>
      {g?.matchId && <SubtitleBody g={g} scenes={scenes} />}
    </GraphicsTabShell>
  );
}
