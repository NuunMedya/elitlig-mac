// Kart ayrıntısı: durum, öncelik, son tarih, açıklama, türüne göre maç
// masası / haftanın enleri / maç anı / paylaşılan tablo, etiketler,
// aşamalar, cevap ve işlemler.
import React, { useEffect, useMemo, useState } from "react";
import { Icon, MenuButton, Segmented, useConfirm } from "../../components/ui";
import { formatDate, formatTime, relativeDay } from "../../lib/helpers";
import MatchDesk from "./MatchDesk";
import { AwardBoard, AwardProposal } from "./Award";
import { KIND_ICON, LABEL_COLORS, MOMENT_PERIOD, STATUSES } from "./todoUtils";

export default function Drawer({ task, catalog, allLabels, onClose, onUpdate, onDelete, onEdit, onReplace, go }) {
  const confirm = useConfirm();
  const [response, setResponse] = useState(task.response || "");
  const [step, setStep] = useState("");
  const [label, setLabel] = useState({ text: "", color: "blue" });
  useEffect(() => setResponse(task.response || ""), [task.id, task.response]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const can = task.permissions || {};
  const canTag = can.isOwner || can.canEdit;
  const checklist = task.checklist || [];
  const setChecklist = (next) => onUpdate(task, { checklist: next.map((c) => ({ ...(c.id ? { id: c.id } : {}), text: c.text, done: c.done })) });
  const suggestions = useMemo(() => allLabels.filter((l) => !(task.labels || []).some((x) => x.text === l.text)).slice(0, 8), [allLabels, task.labels]);
  const momentCat = task.moment ? (catalog?.moments || []).find((m) => m.key === task.moment.category)?.label || task.moment.category : null;

  return (
    <aside className="split__side drawer">
      <header className="drawer__head">
        <span className="pill pill--tool"><Icon name={KIND_ICON[task.kind] || "checkSquare"} size={11} /> {task.dutyLabel ? `${task.dutyLabel} görevi` : task.kindLabel}</span>
        <div className="row-gap">
          {can.isOwner && <button type="button" className={`icon-btn ${task.pinned ? "is-on" : ""}`} title={task.pinned ? "Sabitlendi" : "Sabitle"} onClick={() => onUpdate(task, { pinned: !task.pinned })}><Icon name="pin" /></button>}
          <MenuButton items={[
            can.canEdit && { label: "Düzenle", icon: "sliders", onClick: () => onEdit(task) },
            can.isOwner && task.status === "done" && { label: "Arşivle", icon: "archive", onClick: () => { onUpdate(task, { archived: true }); onClose(); } },
            task.match && { label: "Maçı web'de aç", icon: "external", onClick: () => window.elitlig.app.openWeb(`/editor/maclar/${task.match.id}/oncesi`) },
            can.canDelete && "-",
            can.canDelete && { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Kartı sil", message: `“${task.title}” silinsin mi?`, confirmLabel: "Sil", danger: true })) onDelete(task); } },
          ]} />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
      </header>

      <h2 className="drawer__title">{task.title}</h2>
      <div className="chips">
        {task.match && <span className="chip"><Icon name="ball" size={11} /> {task.match.label}{task.match.startsAt ? ` · ${relativeDay(task.match.startsAt)} ${formatTime(task.match.startsAt)}` : ""}{task.match.field ? ` · ${task.match.field}` : ""}</span>}
        {task.dueAt && task.kind !== "match_duty" && <span className={`chip ${task.overdue ? "chip--red" : ""}`}><Icon name="clock" size={11} /> {task.overdue ? "Gecikti · " : "Son: "}{relativeDay(task.dueAt)} {formatTime(task.dueAt)}</span>}
        {task.priority === "high" && <span className="chip chip--red"><Icon name="flag" size={11} /> Yüksek öncelik</span>}
        {task.assignedBy && <span className="chip chip--off">Atayan: {task.assignedBy.name}</span>}
        {!can.isOwner && task.owner && <span className="chip chip--off">Atanan: {task.owner.name}</span>}
      </div>

      {can.canChangeStatus ? (
        <Segmented value={task.status} onChange={(v) => onUpdate(task, { status: v })} options={STATUSES.map((s) => ({ value: s.key, label: s.label }))} />
      ) : <div className="notice notice--info">{task.owner?.name} yürütüyor; durumu yalnızca o değiştirir. Şu an: <strong>{STATUSES.find((s) => s.key === task.status)?.label}</strong></div>}

      {task.body && <p className="drawer__body selectable">{task.body}</p>}
      {task.player && <div className="info-box"><Icon name="user" /><div><strong>{task.player.name}</strong><span className="muted small">{task.player.teamName}</span></div></div>}
      {task.team && <div className="info-box"><Icon name="shirt" /><div><strong>{task.team.name}</strong></div></div>}

      {task.kind === "match_moment" && task.moment && (
        <div className="info-box"><Icon name="flag" /><div>
          <strong>{task.moment.minute}' · {momentCat}</strong>
          <span className="muted small">{MOMENT_PERIOD[task.moment.period] || ""}</span>
          {task.match && <div className="row-gap"><button type="button" className="btn btn--xs" onClick={() => window.elitlig.app.openWeb(`/editor/maclar/${task.match.id}/canli-akis`)}>Canlı akış</button><button type="button" className="btn btn--xs" onClick={() => window.elitlig.app.openWeb(`/editor/maclar/${task.match.id}/mac-sonu`)}>Maç sonu</button></div>}
        </div></div>
      )}
      {task.kind === "sheet_share" && task.sheet && (
        <button type="button" className="info-box info-box--btn" onClick={() => go(`sheets:${task.sheet.id}`)}><Icon name="grid" /><div><strong>{task.sheet.title}</strong><span className="muted small">{task.sheet.sharedBy} paylaştı · {task.sheet.role === "editor" ? "düzenleyebilirsiniz" : "görüntüleyebilirsiniz"}</span><span className="link-btn small">Tabloyu aç →</span></div></button>
      )}
      {task.kind === "match_duty" && <MatchDesk task={task} onChanged={() => onReplace(null)} />}
      {task.kind === "award_nomination" && <AwardProposal key={task.id} task={task} onUpdated={(item) => item && onReplace(item)} />}
      {task.kind === "award_coordination" && <AwardBoard key={task.id} task={task} onUpdated={(item) => item && onReplace(item)} />}

      <section className="drawer__section">
        <h4>Etiketler</h4>
        <div className="labels">
          {(task.labels || []).map((l) => (
            <span key={l.text} className="label-chip" style={{ "--c": LABEL_COLORS[l.color] || "#6b7280" }}>{l.text}{canTag && <button type="button" onClick={() => onUpdate(task, { labels: task.labels.filter((x) => x.text !== l.text) })}>×</button>}</span>
          ))}
          {!task.labels?.length && <span className="muted small">Etiket yok</span>}
        </div>
        {canTag && (<>
          {suggestions.length > 0 && <div className="chips">{suggestions.map((l) => <button key={l.text} type="button" className="chip chip--off" onClick={() => onUpdate(task, { labels: [...(task.labels || []), l] })}>+ {l.text}</button>)}</div>}
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!label.text.trim()) return; onUpdate(task, { labels: [...(task.labels || []), { text: label.text.trim(), color: label.color }] }); setLabel({ ...label, text: "" }); }}>
            <input value={label.text} maxLength={24} onChange={(e) => setLabel({ ...label, text: e.target.value })} placeholder="Yeni etiket" />
            <div className="color-dots">{Object.keys(LABEL_COLORS).map((c) => <button key={c} type="button" className={label.color === c ? "is-on" : ""} style={{ background: LABEL_COLORS[c] }} onClick={() => setLabel({ ...label, color: c })} aria-label={c} />)}</div>
          </form>
        </>)}
      </section>

      <section className="drawer__section">
        <h4>Aşamalar {checklist.length > 0 && <span className="muted">{checklist.filter((c) => c.done).length}/{checklist.length}</span>}</h4>
        {checklist.length > 0 && <div className="progress"><span style={{ width: `${(checklist.filter((c) => c.done).length / checklist.length) * 100}%` }} /></div>}
        <ul className="checklist">
          {checklist.map((c) => (
            <li key={c.id}>
              <input type="checkbox" checked={c.done} disabled={!canTag} onChange={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
              <span className={c.done ? "is-done" : ""}>{c.text}</span>
              {canTag && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} aria-label="Sil"><Icon name="x" size={12} /></button>}
            </li>
          ))}
        </ul>
        {canTag && <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; setChecklist([...checklist, { text: step.trim().slice(0, 200), done: false }]); setStep(""); }}><input value={step} onChange={(e) => setStep(e.target.value)} placeholder="Aşama ekle ve ↩" /></form>}
      </section>

      {task.assignedBy && !String(task.kind).startsWith("award") && (can.isOwner ? (
        <section className="drawer__section">
          <h4>Cevabınız <span className="muted small">(atayan kişi görür)</span></h4>
          <textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Ne yapıldı, nerede kalındı…" />
          <button type="button" className="btn btn--sm btn--primary" disabled={response === (task.response || "")} onClick={() => onUpdate(task, { response })}>Cevabı kaydet</button>
        </section>
      ) : task.response ? <div className="note-box"><strong className="small">Cevap:</strong> {task.response}</div> : null)}
      {!task.assignedBy && !can.isOwner && task.response && <div className="note-box"><strong className="small">Cevap:</strong> {task.response}</div>}

      <p className="muted small">
        {task.owner && <>Sahibi {task.owner.name} · </>}
        {task.createdAt && <>Oluşturuldu {formatDate(task.createdAt)}</>}
        {task.completedAt && <> · Tamamlandı {formatDate(task.completedAt)}</>}
      </p>
    </aside>
  );
}
