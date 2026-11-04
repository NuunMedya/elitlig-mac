// Süreç: aşamalara göre adımlar. Hızlı durum, satır içi ekleme, sürükle-bırak
// (aşama içinde ve aşamalar arası), aşama yönetimi, süzgeçler, Excel'den aktarma.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Field, Icon, MenuButton, Modal, useConfirm } from "../../components/ui";
import { useCommand } from "../../api";
import { checklistCount, dayKey, dueLabel, filterSteps, groupStepsByPhase, isFiltering, isStepOverdue, moveStep, parseStepRows, PROJECT_COLORS, rolesOf, shiftPhase } from "../../lib/projectUtils";
import { Avatar, Progress, StatusSelect, TOOL_ICONS, label, pickSheetRows, saveRowsXlsx } from "./common";

const store = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yoksay */ } };

export default function Process({ ctx, selectedId, focusPhase, initialFilter }) {
  const { project, phases, steps, meta, people, canEdit, actions, me } = ctx;
  const confirm = useConfirm();
  const [filter, setFilter] = useState(() => ({ status: "", role: "", assignee: "", q: "", hideDone: false, ...(initialFilter || {}) }));
  const ckey = `proj:${project.id}:collapsed`;
  const [collapsed, setCollapsed] = useState(() => store(ckey, null));
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null); // { phase, before }
  const [phaseDialog, setPhaseDialog] = useState(null); // { phase? }
  const [phaseDelete, setPhaseDelete] = useState(null);
  const [importing, setImporting] = useState(false);
  const addRefs = useRef({});
  const today = dayKey();
  const filtering = isFiltering(filter);
  const shownSteps = useMemo(() => filterSteps(steps, filter, { meId: me, today }), [steps, filter, me, today]);
  const groups = useMemo(() => groupStepsByPhase(phases, shownSteps, { allSteps: steps, today, keepEmpty: !filtering }), [phases, shownSteps, steps, today, filtering]);
  const roles = useMemo(() => rolesOf(project.settings, steps), [project.settings, steps]);
  const assignees = useMemo(() => [...new Set(steps.map((s) => s.assignee_id).filter(Boolean))].map((id) => ({ id, name: people[id]?.name || `#${id}` })), [steps, people]);

  // Varsayılan açık aşamalar: büyük süreçlerde yalnız sürenler ve ilk açık aşama.
  const defaultCollapsed = useMemo(() => {
    const all = groupStepsByPhase(phases, steps, { today });
    if (steps.length <= 40) return {};
    const out = {};
    let firstOpen = null;
    for (const g of all) {
      const active = g.steps.some((s) => ["doing", "waiting", "blocked"].includes(s.status) || isStepOverdue(s, today));
      const open = g.steps.some((s) => !["done", "skipped"].includes(s.status));
      if (open && firstOpen == null) firstOpen = g.key;
      out[g.key] = !(active || g.key === firstOpen);
    }
    return out;
  }, [phases, steps, today]);
  const isCollapsed = (key) => !filtering && (collapsed?.[key] ?? defaultCollapsed[key] ?? false);
  const toggle = (key) => { const next = { ...defaultCollapsed, ...(collapsed || {}), [key]: !isCollapsed(key) }; setCollapsed(next); save(ckey, next); };
  const setAll = (value) => { const next = Object.fromEntries(groups.map((g) => [g.key, value])); setCollapsed(next); save(ckey, next); };

  // Açılan adım / aşama görünür olsun.
  useEffect(() => {
    const step = selectedId ? steps.find((s) => String(s.id) === String(selectedId)) : null;
    const key = step ? String(step.phase_id ?? "none") : focusPhase ? String(focusPhase) : null;
    if (!key) return;
    if (isCollapsed(key)) { const next = { ...defaultCollapsed, ...(collapsed || {}), [key]: false }; setCollapsed(next); save(ckey, next); }
    setTimeout(() => document.querySelector(step ? `[data-step="${step.id}"]` : `[data-phase="${key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }, [selectedId, focusPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusAdd = () => {
    const g = groups.find((x) => !isCollapsed(x.key)) || groups[0];
    if (!g) { setPhaseDialog({}); return; }
    if (isCollapsed(g.key)) toggle(g.key);
    setTimeout(() => addRefs.current[g.key]?.focus(), 30);
  };
  useCommand("new", () => { if (canEdit) focusAdd(); });
  useCommand("find", () => document.getElementById("step-search")?.focus());
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || !canEdit) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".modal")) return;
      e.preventDefault();
      focusAdd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDrop = (phaseKey, beforeId) => {
    const id = drag;
    setDrag(null);
    setOver(null);
    if (!id || !canEdit) return;
    const { steps: next, payload } = moveStep(steps, id, phaseKey === "none" ? null : Number(phaseKey), beforeId);
    if (payload) actions.reorder(payload, next);
  };
  const rowDragOver = (e, g, s, i) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2 ? s.id : g.steps[i + 1]?.id ?? null;
    if (over?.phase !== g.key || over?.before !== before) setOver({ phase: g.key, before });
  };

  const movePhase = (phase, dir) => {
    const ids = shiftPhase(phases, phase.id, dir);
    if (ids) actions.reorder({ phases: ids }, null).then(actions.reload);
  };

  return (
    <div className="proj-section">
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input id="step-search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Adım, sonuç, sorumlu ara" /></div>
        <select className="select-sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Durum">
          <option value="">Tüm durumlar</option><option value="open">Açık adımlar</option><option value="overdue">Gecikenler</option>
          {(meta.step_statuses || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="select-sm" value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value })} aria-label="Sorumlu">
          <option value="">Tüm sorumlular</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="select-sm" value={filter.assignee} onChange={(e) => setFilter({ ...filter, assignee: e.target.value })} aria-label="Atanan">
          <option value="">Herkes</option><option value="me">Bana atananlar</option><option value="none">Atanmamış</option>
          {assignees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="toggle"><input type="checkbox" checked={filter.hideDone} onChange={(e) => setFilter({ ...filter, hideDone: e.target.checked })} /> Tamamlananları gizle</label>
        {filtering && <button type="button" className="link-btn small" onClick={() => setFilter({ status: "", role: "", assignee: "", q: "", hideDone: false })}>Temizle · {shownSteps.length} adım</button>}
        <span className="spacer" />
        {!filtering && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(!groups.every((g) => isCollapsed(g.key)))}>{groups.every((g) => isCollapsed(g.key)) ? "Tümünü aç" : "Tümünü kapat"}</button>}
        {canEdit && <button type="button" className="btn btn--sm" onClick={() => setImporting(true)}><Icon name="upload" size={13} /> Excel'den adım aktar</button>}
        {canEdit && <button type="button" className="btn btn--soft btn--sm" onClick={() => setPhaseDialog({})}><Icon name="plus" size={13} /> Aşama</button>}
      </div>

      {!groups.length && <Empty icon="search" title="Eşleşen adım yok" text="Süzgeçleri değiştirin." />}
      <div className="phases">
        {groups.map((g, gi) => {
          const closed = isCollapsed(g.key);
          const color = g.phase?.color || "#94a3b8";
          return (
            <section key={g.key} data-phase={g.key} className={`phase ${closed ? "is-closed" : ""} ${over?.phase === g.key && over.before == null ? "is-drop-end" : ""}`} style={{ "--ph": color }}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (over?.phase !== g.key || over?.before != null) { if (closed || !g.steps.length) setOver({ phase: g.key, before: null }); } }}
              onDrop={(e) => { e.preventDefault(); onDrop(g.key, over?.phase === g.key ? over.before : null); }}>
              <header className="phase__head">
                <button type="button" className="phase__toggle" onClick={() => toggle(g.key)} aria-expanded={!closed}>
                  <Icon name={closed ? "chevronRight" : "chevronDown"} size={14} />
                  <span className="phase__num">{g.phase ? gi + 1 : "–"}</span>
                  <span className="phase__name">{g.phase?.name || "Aşamasız adımlar"}</span>
                  <span className="phase__count">{g.stats.done}/{g.stats.total - g.stats.skipped}</span>
                </button>
                <span className="phase__progress"><Progress value={g.stats.progress} color={color} thin /><small>%{g.stats.progress}</small></span>
                {g.stats.overdue > 0 && <span className="pill pill--red pill--xs">{g.stats.overdue} geciken</span>}
                <span className="spacer" />
                {canEdit && <button type="button" className="icon-btn icon-btn--xs" title="Adım ekle" onClick={() => { if (closed) toggle(g.key); setTimeout(() => addRefs.current[g.key]?.focus(), 30); }}><Icon name="plus" size={13} /></button>}
                {canEdit && g.phase && <MenuButton items={[
                  { label: "Yeniden adlandır / renk", icon: "palette", onClick: () => setPhaseDialog({ phase: g.phase }) },
                  { label: "Yukarı taşı", icon: "chevronUp", onClick: () => movePhase(g.phase, -1), disabled: gi === 0 },
                  { label: "Aşağı taşı", icon: "chevronDown", onClick: () => movePhase(g.phase, 1), disabled: gi >= phases.length - 1 },
                  "-",
                  { label: "Aşamayı sil", icon: "trash", danger: true, onClick: () => setPhaseDelete(g.phase) },
                ]} />}
              </header>
              {g.phase?.note && !closed && <p className="phase__note">{g.phase.note}</p>}
              {!closed && (
                <ul className="slist" onDragOver={(e) => { if (drag && !g.steps.length) { e.preventDefault(); setOver({ phase: g.key, before: null }); } }}>
                  {g.steps.map((s, i) => (
                    <StepRow key={s.id} s={s} ctx={ctx} active={String(selectedId) === String(s.id)} today={today}
                      dragging={drag === s.id} dropBefore={over?.phase === g.key && over.before === s.id}
                      onDragStart={() => setDrag(s.id)} onDragEnd={() => { setDrag(null); setOver(null); }} onDragOver={(e) => rowDragOver(e, g, s, i)} />
                  ))}
                  {over?.phase === g.key && over.before == null && drag && <li className="slist__drop" />}
                  {canEdit && <li className="slist__add"><InlineAdd inputRef={(el) => { addRefs.current[g.key] = el; }} onAdd={(title) => actions.createStep({ title, phase_id: g.phase?.id ?? null })} /></li>}
                  {!g.steps.length && !canEdit && <li className="slist__empty muted small">Bu aşamada adım yok.</li>}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {!steps.length && !phases.length && (
        <Empty icon="list" title="Süreç boş" text="Aşama ekleyin, adımları yazın ya da kendi iş akışı tablonuzu Excel'den aktarın."
          action={canEdit && <div className="row-gap"><button type="button" className="btn btn--primary" onClick={() => setPhaseDialog({})}><Icon name="plus" /> Aşama ekle</button><button type="button" className="btn" onClick={() => setImporting(true)}><Icon name="upload" /> Excel'den aktar</button></div>} />
      )}

      {phaseDialog && <PhaseDialog phase={phaseDialog.phase} onClose={() => setPhaseDialog(null)} onSave={async (body) => { if (phaseDialog.phase) await actions.updatePhase(phaseDialog.phase, body); else await actions.createPhase(body); setPhaseDialog(null); }} />}
      {phaseDelete && <DeletePhase phase={phaseDelete} phases={phases} count={steps.filter((s) => s.phase_id === phaseDelete.id).length} onClose={() => setPhaseDelete(null)}
        onConfirm={async (query) => {
          if (query.delete_steps && !(await confirm({ title: "Adımlarla birlikte sil", message: "Aşamadaki tüm adımlar kalıcı olarak silinir.", confirmLabel: "Sil", danger: true }))) return;
          await actions.deletePhase(phaseDelete, query); setPhaseDelete(null);
        }} />}
      {importing && <ImportSteps ctx={ctx} onClose={() => setImporting(false)} />}
    </div>
  );
}

function InlineAdd({ onAdd, inputRef }) {
  const [text, setText] = useState("");
  return (
    <form className="srow-add" onSubmit={async (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(""); await onAdd(t.slice(0, 200)); }}>
      <Icon name="plus" size={14} />
      <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setText(""); e.currentTarget.blur(); } }} placeholder="Adım ekle ve ↩  (N)" maxLength={200} />
    </form>
  );
}

function StepRow({ s, ctx, active, today, dragging, dropBefore, onDragStart, onDragEnd, onDragOver }) {
  const { meta, people, canEdit, actions, questions, settings } = ctx;
  const cl = checklistCount(s);
  const qCount = questions.filter((q) => q.step_id === s.id && q.status === "open").length;
  const overdue = isStepOverdue(s, today);
  const toolStage = s.tool === "leads" && s.tool_ref ? settings.lead_stages.find((x) => x.key === s.tool_ref) : null;
  return (
    <li data-step={s.id} className={`srow ${active ? "is-active" : ""} ${dragging ? "is-dragging" : ""} ${dropBefore ? "is-drop-before" : ""} ${["done", "skipped"].includes(s.status) ? `is-${s.status}` : ""} ${["high", "urgent"].includes(s.priority) ? `is-${s.priority}` : ""}`}
      draggable={canEdit} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(s.id)); onDragStart(); }} onDragEnd={onDragEnd} onDragOver={onDragOver}>
      {canEdit && <span className="srow__grip" aria-hidden><Icon name="grip" size={14} strokeWidth={3} /></span>}
      <StatusSelect size="sm" value={s.status} statuses={meta.step_statuses} disabled={!canEdit} onChange={(v) => actions.updateStep(s, { status: v })} />
      <button type="button" className="srow__main" onClick={() => ctx.openStep(s.id)}>
        <span className="srow__title">{["high", "urgent"].includes(s.priority) && <Icon name="flag" size={12} className={s.priority === "urgent" ? "text-red" : "text-amber"} />}{s.title}</span>
        {(s.result || cl || qCount || s.links.length || s.description) && (
          <span className="srow__meta">
            {cl && <span className={cl.done === cl.total ? "text-green" : ""}><Icon name="checkSquare" size={11} /> {cl.done}/{cl.total}</span>}
            {qCount > 0 && <span className="text-amber"><Icon name="help" size={11} /> {qCount} açık soru</span>}
            {s.links.length > 0 && <span><Icon name="link" size={11} /> {s.links.length}</span>}
            {s.result ? <span className="srow__result"><Icon name="message" size={11} /> {s.result}</span> : s.description ? <span className="srow__result muted"><Icon name="note" size={11} /> {s.description}</span> : null}
          </span>
        )}
      </button>
      <span className="srow__roles">{s.responsible.slice(0, 2).map((r) => <span key={r} className="role-chip" title={r}>{r}</span>)}{s.responsible.length > 2 && <span className="role-chip">+{s.responsible.length - 2}</span>}</span>
      <span className="srow__who">{s.assignee_id ? <Avatar name={people[s.assignee_id]?.name || "?"} size={22} /> : null}</span>
      {s.tool ? (
        <button type="button" className="tool-btn" title={`Aracı aç: ${label(meta.tools, s.tool)}${toolStage ? ` · ${toolStage.label}` : ""}`} onClick={() => ctx.openTool(s.tool, s)}>
          <Icon name={TOOL_ICONS[s.tool]} size={12} /><span className="tool-btn__label">{label(meta.tools, s.tool).split(" /")[0]}</span>
        </button>
      ) : <span className="tool-btn tool-btn--none" />}
      <span className={`srow__due ${overdue ? "is-late" : ""}`}>{s.due_date ? dueLabel(s.due_date) : ""}</span>
    </li>
  );
}

function PhaseDialog({ phase, onClose, onSave }) {
  const [name, setName] = useState(phase?.name || "");
  const [color, setColor] = useState(phase?.color || PROJECT_COLORS[0]);
  const [note, setNote] = useState(phase?.note || "");
  return (
    <Modal title={phase ? "Aşamayı düzenle" : "Yeni aşama"} onClose={onClose} width={460} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="phase-form" className="btn btn--primary" disabled={!name.trim()}>Kaydet</button></>}>
      <form id="phase-form" className="composer" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), color, note: note.trim() || null }); }}>
        <Field label="Aşama adı"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="örn. Satış ve Müşteri İlişkileri" maxLength={120} /></Field>
        <Field label="Renk"><div className="color-dots color-dots--lg">{PROJECT_COLORS.map((c) => <button key={c} type="button" className={color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div></Field>
        <Field label="Not"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğe bağlı açıklama" /></Field>
      </form>
    </Modal>
  );
}

function DeletePhase({ phase, phases, count, onClose, onConfirm }) {
  const others = phases.filter((p) => p.id !== phase.id);
  const [mode, setMode] = useState(count ? (others.length ? "move" : "none") : "none");
  const [target, setTarget] = useState(others[0]?.id || "");
  return (
    <Modal title={`“${phase.name}” aşamasını sil`} onClose={onClose} width={460} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary btn--danger" onClick={() => onConfirm(mode === "move" ? { move_to: String(target) } : mode === "delete" ? { delete_steps: "1" } : {})}>Aşamayı sil</button></>}>
      {count ? (<>
        <p className="muted">Bu aşamada {count} adım var. Adımlar ne olsun?</p>
        <div className="radio-list">
          {others.length > 0 && <label><input type="radio" checked={mode === "move"} onChange={() => setMode("move")} /> Şu aşamaya taşı: <select className="select-sm" value={target} onChange={(e) => { setTarget(e.target.value); setMode("move"); }}>{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          <label><input type="radio" checked={mode === "none"} onChange={() => setMode("none")} /> Aşamasız bırak</label>
          <label className="text-red"><input type="radio" checked={mode === "delete"} onChange={() => setMode("delete")} /> Adımlarla birlikte sil</label>
        </div>
      </>) : <p className="muted">Aşamada adım yok; aşama silinecek.</p>}
    </Modal>
  );
}

const COL_NAMES = { title: "Görev / İş Kalemi", responsible: "Ana Sorumlu Personel", phase: "Aşama", description: "Açıklama", due_date: "Son tarih", priority: "Öncelik", result: "Sonuç" };
const colLetter = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Excel / CSV'den adım aktarma: kullanıcının iş akışı tablosu biçimi. */
function ImportSteps({ ctx, onClose }) {
  const { phases, actions } = ctx;
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(0);
  const [phaseId, setPhaseId] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (file ? parseStepRows(file.sheets[sheet]?.rows || []) : null), [file, sheet]);
  const newPhases = parsed ? parsed.phases.filter((n) => !phases.some((p) => p.name.toLocaleLowerCase("tr-TR") === n.toLocaleLowerCase("tr-TR"))) : [];
  const choose = async () => {
    setError(null);
    try {
      const f = await pickSheetRows();
      if (!f) return;
      if (!f.sheets.length) { setError("Dosyada veri bulunamadı."); return; }
      const best = f.sheets.findIndex((s) => parseStepRows(s.rows).items.length);
      setFile(f);
      setSheet(Math.max(0, best));
    } catch (e) { setError(e?.message || "Dosya okunamadı."); }
  };
  const sample = () => saveRowsXlsx("Surec-sablonu", [["Aşama", "Görev / İş Kalemi", "Ana Sorumlu Personel", "Son tarih", "Öncelik", "Açıklama"], ["Konsept ve Bütçe", "Organizasyon konseptinin belirlenmesi", "MÜDÜR", "", "Yüksek", ""], ["Satış ve Müşteri İlişkileri", "Potansiyel müşterilerin aranması", "PAZARLAMA SORUMLUSU", "", "", "Aranan kişiler Kişiler sekmesine"]], "Süreç", { A: 200, B: 320, C: 220 });
  const submit = async () => {
    setBusy(true);
    const r = await actions.bulkSteps({ phase_id: phaseId || null, items: parsed.items });
    setBusy(false);
    if (r) onClose();
  };
  return (
    <Modal title="Excel'den adım aktar" onClose={onClose} width={820} className="modal--wide"
      footer={<>
        {parsed && !parsed.error && <span className="muted small spacer">{parsed.items.length} adım{newPhases.length ? ` · ${newPhases.length} yeni aşama açılacak` : ""}{parsed.skipped ? ` · ${parsed.skipped} satır atlandı` : ""}</span>}
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={!parsed?.items.length || busy} onClick={submit}>{busy ? "Aktarılıyor…" : `${parsed?.items.length || 0} adımı ekle`}</button>
      </>}>
      <div className="info-box"><Icon name="grid" /><div>
        <strong>Kendi iş akışı tablonuz</strong>
        <span className="muted small">Sütun başlıkları: <b>Görev / İş Kalemi</b> (zorunlu), <b>Ana Sorumlu Personel</b> (ör. “MÜDÜR & EDİTÖR”), isteğe bağlı <b>Aşama</b>, Son tarih, Öncelik, Açıklama. Aşama sütunu yoksa BÜYÜK HARFLE yazılmış başlık satırları aşama sayılır. Aynı adlı aşama varsa adımlar ona eklenir.</span>
        <span className="row-gap"><button type="button" className="btn btn--primary btn--sm" onClick={choose}><Icon name="upload" size={13} /> {file ? "Başka dosya seç" : "Dosya seç (.xlsx, .csv)"}</button><button type="button" className="link-btn small" onClick={sample}>Örnek tabloyu indir</button></span>
      </div></div>
      {error && <div className="error-note">{error}</div>}
      {file && (<>
        <div className="filters">
          <strong>{file.name}</strong>
          {file.sheets.length > 1 && <select className="select-sm" value={sheet} onChange={(e) => setSheet(Number(e.target.value))}>{file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select>}
          <span className="spacer" />
          <label className="toggle">Aşaması olmayanlar: <select className="select-sm" value={phaseId} onChange={(e) => setPhaseId(e.target.value)}><option value="">Aşamasız</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
        {parsed.error ? <div className="error-note">{parsed.error}</div> : (<>
          <div className="chips">{Object.entries(parsed.map).map(([k, c]) => <span key={k} className="chip chip--off">{COL_NAMES[k] || k} → {colLetter(c)} sütunu</span>)}</div>
          {newPhases.length > 0 && <p className="small muted">Yeni aşamalar: {newPhases.join(" · ")}</p>}
          <div className="table-wrap import-preview">
            <table className="table">
              <thead><tr><th>#</th><th>Aşama</th><th>Görev / İş Kalemi</th><th>Sorumlu</th><th>Son tarih</th></tr></thead>
              <tbody>{parsed.items.slice(0, 60).map((it, i) => <tr key={i}><td className="muted">{i + 1}</td><td>{it.phase || <span className="muted">—</span>}</td><td>{it.title}</td><td>{it.responsible || ""}</td><td>{it.due_date || ""}</td></tr>)}</tbody>
            </table>
          </div>
          {parsed.items.length > 60 && <p className="muted small">… ve {parsed.items.length - 60} adım daha.</p>}
        </>)}
      </>)}
    </Modal>
  );
}

