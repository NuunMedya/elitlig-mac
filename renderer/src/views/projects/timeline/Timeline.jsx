// Proje takvimi (Gantt / zaman çizelgesi) — masaüstü.
//
// Çoklu görünüm (Projeler → Takvim): her proje bir satır, dönemleri renkli
// çubuklar (çakışanlar alt alta), kilometre taşları elmas. Tek proje görünümü
// (proje → Takvim sekmesi): her dönem ayrı satır, altında o dönemin adımları;
// dönem dışına taşan adım kırmızı çerçeveli, uyarılar üstte.
//
// Fare: çubuğu sürükle → taşı, kenarından sürükle → uzat / kısalt, boş alanda
// sürükle → yeni dönem aralığı, tıkla → düzenle. Ölçek hafta / ay / çeyrek /
// yıl; bugün çizgisi; yoğunluk şeridi (aynı günlerde kaç projenin organizasyon
// evresi var); proje / evre / sorumlu süzgeci; planı N gün kaydır; yazdır / PDF
// (yatay A4 / A3) ve Excel (dönem listesi). Sunucu: services/projectTimeline.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorNote, Field, Icon, MenuButton, Modal, Segmented, Spinner, useConfirm, useToast } from "../../../components/ui";
import { get, request } from "../../../api";
import { PROJECT_COLORS } from "../../../lib/projectUtils";
import {
  PERIOD_COLUMNS, SCALES, SCALE_KEYS, STAGE_LABELS, addDays, clip, computeLoad, diffDays, dragResult, filterProjects, formatRange,
  ganttHtml, headerUnits, packLanes, periodRows, rangeFromIndexes, shiftAnchor, stepsOutside, todayDay, windowFor,
} from "../../../lib/timelineUtils";
import { BASE, saveRowsXlsx } from "../common";
import "./timeline.css";

const LABEL_W = 220;
const LANE_H = 26;
const MS_H = 22;
const STEP_H = 12;
const SCALE_KEY = "projects:timeline:scale";
const readScale = () => { try { const v = localStorage.getItem(SCALE_KEY); return SCALE_KEYS.includes(v) ? v : "month"; } catch { return "month"; } };
const stageOptions = (meta) => meta?.stages || Object.entries(STAGE_LABELS).map(([key, label]) => ({ key, label }));
const send = (method, path, body) => request({ method, path, body, queue: false });
const errText = (r, fallback) => (r?.offline ? "Çevrimdışısınız: proje takvimi için internet bağlantısı gerekir." : r?.error?.message || fallback);

/* ---------------------------------- çubuklar ---------------------------------- */

function Bar({ period, left, width, top, editable, onStart, warn }) {
  const label = `${period.name}: ${formatRange(period.start_date, period.end_date)}`;
  return (
    <div className={`ptl-bar${editable ? " is-editable" : ""}${warn ? " is-warn" : ""}`} style={{ left, width: Math.max(4, width), top, "--bc": period.color }}
      role="button" tabIndex={0} aria-label={label} data-period-id={period.id}
      title={`${label}${period.progress ? ` · %${period.progress}` : ""}${period.description ? `\n${period.description}` : ""}`}
      onMouseDown={(e) => onStart(e, period, "move")} onKeyDown={(e) => { if (e.key === "Enter") onStart(e, period, "click"); }}>
      {period.progress > 0 && <span className="ptl-bar__progress" style={{ width: `${period.progress}%` }} />}
      <span className="ptl-bar__text">{period.name}</span>
      {editable && <>
        <span className="ptl-bar__handle is-start" data-handle="start" onMouseDown={(e) => onStart(e, period, "start")} />
        <span className="ptl-bar__handle is-end" data-handle="end" onMouseDown={(e) => onStart(e, period, "end")} />
      </>}
    </div>
  );
}

function Diamond({ period, left, top, onStart, compact }) {
  return (
    <div className="ptl-ms" style={{ left, top, "--bc": period.color }} role="button" tabIndex={0} data-period-id={period.id}
      aria-label={`${period.name}: ${formatRange(period.start_date, period.start_date)}`} title={`${period.name} · ${formatRange(period.start_date, period.start_date)}`}
      onMouseDown={(e) => onStart(e, period, "move")} onKeyDown={(e) => { if (e.key === "Enter") onStart(e, period, "click"); }}>
      <span className="ptl-ms__shape" />
      {!compact && <span className="ptl-ms__text">{period.name}</span>}
    </div>
  );
}

/* ------------------------------ düzenleme penceresi ------------------------------ */

function PeriodEditor({ draft, projects, meta, people, onClose, onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !draft.id;
  const [form, setForm] = useState(() => ({
    project_id: String(draft.project_id || projects[0]?.id || ""), kind: draft.kind || "period", preset: draft.preset || "", name: draft.name || "",
    stage: draft.stage || "", color: draft.color || "", start_date: draft.start_date || todayDay(), end_date: draft.end_date || draft.start_date || todayDay(),
    responsible_id: draft.responsible_id ? String(draft.responsible_id) : "", responsible: draft.responsible || "", progress: draft.progress || 0,
    depends_on: draft.depends_on ? String(draft.depends_on) : "", phase_ids: draft.phase_ids || [], description: draft.description || "",
  }));
  const [extra, setExtra] = useState({ phases: [], periods: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const presets = form.kind === "milestone" ? meta?.milestones || [] : meta?.presets || [];

  useEffect(() => {
    if (!form.project_id) return undefined;
    let alive = true;
    get(`${BASE}/${form.project_id}/periods`).then((r) => { if (alive && r.ok) setExtra({ phases: r.data.phases || [], periods: r.data.items || [] }); });
    return () => { alive = false; };
  }, [form.project_id]);

  const pickPreset = (key) => {
    const p = presets.find((x) => x.key === key);
    setForm((f) => ({ ...f, preset: key, name: p && (!f.name || presets.some((x) => x.label === f.name)) ? p.label : f.name, stage: p?.stage || f.stage, color: p?.color || f.color }));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.project_id) { setError("Proje seçin."); return; }
    setBusy(true);
    setError("");
    const body = {
      kind: form.kind, preset: form.preset || null, name: form.name, stage: form.stage || null, color: form.color || null,
      start_date: form.start_date, end_date: form.kind === "milestone" ? form.start_date : form.end_date,
      responsible_id: form.responsible_id ? Number(form.responsible_id) : null, responsible: form.responsible || null, progress: Number(form.progress) || 0,
      depends_on: form.depends_on ? Number(form.depends_on) : null, phase_ids: form.phase_ids, description: form.description || null,
    };
    const r = isNew ? await send("POST", `${BASE}/${form.project_id}/periods`, body) : await send("PATCH", `${BASE}/${form.project_id}/periods/${draft.id}`, body);
    setBusy(false);
    if (!r.ok) { setError(errText(r, "Dönem kaydedilemedi.")); return; }
    onSaved(Number(form.project_id), r.data, "Dönem kaydedildi.");
  };
  const remove = async () => {
    if (!(await confirm({ title: "Dönemi sil", message: `“${draft.name}” takvimden kaldırılsın mı? Adımlar silinmez.`, confirmLabel: "Sil", danger: true }))) return;
    const r = await send("DELETE", `${BASE}/${draft.project_id}/periods/${draft.id}`);
    if (!r.ok) { toast(errText(r, "Silinemedi."), { tone: "error" }); return; }
    onSaved(Number(draft.project_id), r.data, "Dönem silindi.");
  };
  const others = extra.periods.filter((p) => p.id !== draft.id && p.kind === "period");

  return (
    <Modal title={isNew ? (form.kind === "milestone" ? "Yeni kilometre taşı" : "Yeni dönem") : `${draft.name} düzenle`} onClose={onClose} width={640}
      footer={<>
        {!isNew && <button type="button" className="btn btn--danger" onClick={remove}><Icon name="trash" size={13} /> Sil</button>}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="submit" form="ptl-period" className="btn btn--primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </>}>
      <form id="ptl-period" className="ptl-form" onSubmit={submit}>
        {error && <p className="error-note" role="alert">{error}</p>}
        <div className="ptl-form__grid">
          {isNew && projects.length > 1 && (
            <Field label="Proje"><select value={form.project_id} onChange={set("project_id")} aria-label="Proje">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          )}
          <div className="field"><span className="field__label">Tür</span>
            <Segmented size="sm" value={form.kind} onChange={(k) => setForm((f) => ({ ...f, kind: k, preset: "" }))} options={[{ value: "period", label: "Dönem" }, { value: "milestone", label: "Kilometre taşı" }]} ariaLabel="Tür" />
          </div>
          <Field label="Hazır tür">
            <select value={form.preset} onChange={(e) => pickPreset(e.target.value)} aria-label="Hazır tür">
              <option value="">Serbest</option>
              {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Ad"><input value={form.name} onChange={set("name")} placeholder="Ör. Hazırlık" aria-label="Ad" autoFocus /></Field>
          <Field label="Evre">
            <select value={form.stage} onChange={set("stage")} aria-label="Evre"><option value="">—</option>{stageOptions(meta).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          </Field>
          <Field label={form.kind === "milestone" ? "Tarih" : "Başlangıç"}><input type="date" value={form.start_date} onChange={set("start_date")} aria-label="Başlangıç" /></Field>
          {form.kind !== "milestone" && <Field label="Bitiş"><input type="date" value={form.end_date} min={form.start_date} onChange={set("end_date")} aria-label="Bitiş" /></Field>}
          <Field label="Sorumlu">
            <select value={form.responsible_id} onChange={set("responsible_id")} aria-label="Sorumlu"><option value="">—</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </Field>
          <Field label="Sorumlu (rol / not)"><input value={form.responsible} onChange={set("responsible")} placeholder="Ör. Organizasyon ekibi" /></Field>
          {form.kind !== "milestone" && <Field label={`İlerleme: %${form.progress}`}><input type="range" min="0" max="100" step="5" value={form.progress} onChange={set("progress")} aria-label="İlerleme" /></Field>}
          {form.kind !== "milestone" && (
            <Field label="Önce bitmeli (bağımlılık)">
              <select value={form.depends_on} onChange={set("depends_on")} aria-label="Önce bitmeli">
                <option value="">— yok —</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatRange(p.start_date, p.end_date)})</option>)}
              </select>
            </Field>
          )}
          <div className="field"><span className="field__label">Renk</span>
            <div className="color-dots">{PROJECT_COLORS.map((c) => <button key={c} type="button" className={form.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setForm((f) => ({ ...f, color: c }))} aria-label={`Renk ${c}`} />)}</div>
          </div>
        </div>
        {form.kind !== "milestone" && extra.phases.length > 0 && (
          <div className="field"><span className="field__label">Kapsadığı aşamalar (adımları bu dönemin altında görünür)</span>
            <div className="ptl-phases">
              {extra.phases.map((ph) => (
                <label key={ph.id} className="ptl-check"><input type="checkbox" checked={form.phase_ids.includes(ph.id)} onChange={(e) => setForm((f) => ({ ...f, phase_ids: e.target.checked ? [...f.phase_ids, ph.id] : f.phase_ids.filter((x) => x !== ph.id) }))} />{ph.name}</label>
              ))}
            </div>
          </div>
        )}
        <Field label="Açıklama"><textarea rows={2} value={form.description} onChange={set("description")} /></Field>
      </form>
    </Modal>
  );
}

function ShiftDialog({ project, onClose, onDone }) {
  const [days, setDays] = useState("7");
  const [steps, setSteps] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Math.round(Number(days)) || 0;
  const submit = async (e) => {
    e.preventDefault();
    if (!n) { setError("Gün sayısı girin (geri almak için eksi)."); return; }
    setBusy(true);
    const r = await send("POST", `${BASE}/${project.id}/periods/shift`, { days: n, steps });
    setBusy(false);
    if (!r.ok) { setError(errText(r, "Plan kaydırılamadı.")); return; }
    onDone(project.id, r.data);
  };
  return (
    <Modal title={`${project.name}: planı kaydır`} onClose={onClose} width={420}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="ptl-shift" className="btn btn--primary" disabled={busy}>{busy ? "…" : "Kaydır"}</button></>}>
      <form id="ptl-shift" className="ptl-form" onSubmit={submit}>
        {error && <p className="error-note" role="alert">{error}</p>}
        <Field label="Kaç gün? (geri için eksi)"><input type="number" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Gün sayısı" autoFocus /></Field>
        <label className="ptl-check"><input type="checkbox" checked={steps} onChange={(e) => setSteps(e.target.checked)} /> Tarihli adımları da kaydır (Yapılacaklar kartları güncellenir)</label>
        {n !== 0 && <p className="muted small">Tüm dönemler, kilometre taşları ve proje tarihleri {n > 0 ? `${n} gün ileri` : `${-n} gün geri`} alınır.</p>}
      </form>
    </Modal>
  );
}

/* --------------------------------- ana bileşen --------------------------------- */

export default function Timeline({ projectId = null, onOpenProject }) {
  const single = projectId != null;
  const toast = useToast();
  const [scale, setScaleState] = useState(readScale);
  const setScale = (v) => { setScaleState(v); try { localStorage.setItem(SCALE_KEY, v); } catch { /* yoksay */ } };
  const [anchor, setAnchor] = useState(todayDay);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [people, setPeople] = useState([]);
  const [filters, setFilters] = useState({ projectId: "", stage: "", responsibleId: "" });
  const [loadStage, setLoadStage] = useState("execution");
  const [showSteps, setShowSteps] = useState(true);
  const [preview, setPreview] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [editor, setEditor] = useState(null);
  const [shifting, setShifting] = useState(null);
  const dragRef = useRef(null);
  const offs = useRef([]);
  useEffect(() => () => offs.current.slice().forEach((off) => off()), []);
  const listen = (move, up) => {
    const off = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); offs.current = offs.current.filter((x) => x !== off); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    offs.current.push(off);
    return off;
  };

  const load = useCallback(async () => {
    const r = await get(single ? `${BASE}/${projectId}/periods` : `${BASE}/timeline`);
    if (!r.ok) { setError(r.error || { message: errText(r, "Proje takvimi yüklenemedi.") }); return; }
    setError(null);
    const body = r.data;
    if (single) setData({ projects: [{ ...body.project, can_edit: body.access?.can_edit !== false, periods: body.items }], steps: body.steps || [], warnings: body.warnings || [], people: body.people || {}, meta: body.meta });
    else setData({ projects: body.projects || [], people: body.people || {}, meta: body.meta, steps: [], warnings: [] });
  }, [single, projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { get(`${BASE}/people`).then((r) => { if (r.ok) setPeople(r.data?.items || []); }); }, []);

  const apply = useCallback((pid, body) => {
    setData((d) => (d ? {
      ...d,
      projects: d.projects.map((p) => (p.id === pid ? { ...p, periods: body.items || p.periods, start_date: body.project?.start_date ?? p.start_date, end_date: body.project?.end_date ?? p.end_date } : p)),
      ...(single ? { steps: body.steps || d.steps, warnings: body.warnings || [] } : {}),
      people: { ...d.people, ...(body.people || {}) },
    } : d));
    const warn = (body.warnings || []).filter((w) => w.type !== "stage");
    if (warn.length) toast(`Uyarı: ${warn[0].message}${warn.length > 1 ? ` (+${warn.length - 1})` : ""}`, { tone: "warn", timeout: 6000 });
    return warn.length;
  }, [single, toast]);

  const win = useMemo(() => windowFor(scale, anchor), [scale, anchor]);
  const px = SCALES[scale].px;
  const width = win.days * px;
  const meta = data?.meta;
  const visible = useMemo(() => {
    if (!data) return [];
    return filterProjects(data.projects.map((p) => ({ ...p, periods: p.periods.map((x) => (preview && x.id === preview.id ? { ...x, ...preview } : x)) })), filters);
  }, [data, filters, preview]);
  const load2 = useMemo(() => computeLoad(visible, { stage: loadStage || null, from: win.from, to: win.to }), [visible, loadStage, win]);
  const header = useMemo(() => headerUnits(scale, win.from, win.days), [scale, win]);
  const peopleNames = useMemo(() => ({ ...Object.fromEntries(people.map((u) => [u.id, u.name])), ...(data?.people || {}) }), [people, data]);
  const responsibleOptions = useMemo(() => {
    const ids = new Set((data?.projects || []).flatMap((p) => p.periods.map((x) => x.responsible_id).filter(Boolean)));
    return [...ids].map((id) => ({ id, name: peopleNames[id] || `#${id}` }));
  }, [data, peopleNames]);

  const startDrag = (event, period, mode) => {
    const project = data.projects.find((p) => p.id === period.project_id);
    if (!project?.can_edit) { if (mode === "click" || event.button === 0) toast("Bu projeyi yalnız görüntüleyebilirsiniz."); return; }
    if (mode === "click") { setEditor({ ...period }); return; }
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { period, mode, x: event.clientX, moved: false };
    const onMove = (e) => {
      const st = dragRef.current;
      if (!st) return;
      const delta = Math.round((e.clientX - st.x) / px);
      if (delta !== 0) st.moved = true;
      if (st.moved) setPreview({ id: st.period.id, ...dragResult(st.period, st.mode, delta) });
    };
    const onUp = async (e) => {
      off();
      const st = dragRef.current;
      dragRef.current = null;
      if (!st) return;
      const delta = Math.round((e.clientX - st.x) / px);
      if (!st.moved || delta === 0) { setPreview(null); setEditor({ ...st.period }); return; }
      const next = dragResult(st.period, st.mode, delta);
      const r = await send("PATCH", `${BASE}/${st.period.project_id}/periods/${st.period.id}`, next);
      if (r.ok) { if (!apply(st.period.project_id, r.data)) toast(`${st.period.name}: ${formatRange(next.start_date, next.end_date)}`); } else toast(errText(r, "Tarih güncellenemedi."), { tone: "error" });
      setPreview(null);
    };
    const off = listen(onMove, onUp);
  };

  const indexAt = (event, el) => Math.max(0, Math.min(win.days - 1, Math.floor((event.clientX - el.getBoundingClientRect().left) / px)));
  const startSelect = (event, project, rowKey) => {
    if (event.button !== 0 || !project.can_edit || event.target !== event.currentTarget) return;
    event.preventDefault();
    const el = event.currentTarget;
    const a = indexAt(event, el);
    setSelecting({ rowKey, a, b: a });
    const onMove = (e) => setSelecting((s) => (s ? { ...s, b: indexAt(e, el) } : s));
    const onUp = (e) => {
      off();
      const b = indexAt(e, el);
      setSelecting(null);
      const range = a === b ? { start_date: addDays(win.from, a), end_date: addDays(win.from, a + 6) } : rangeFromIndexes(win.from, a, b);
      setEditor({ project_id: project.id, kind: "period", ...range });
    };
    const off = listen(onMove, onUp);
  };

  const exportExcel = async () => {
    const rows = periodRows(visible, peopleNames);
    if (!rows.length) { toast("Dışa aktarılacak dönem yok.", { tone: "warn" }); return; }
    const name = single ? `${visible[0]?.name || "Proje"} takvimi` : "Proje takvimi";
    await saveRowsXlsx(name.replace(/[\\/:*?"<>|]/g, "-"), [PERIOD_COLUMNS.map((c) => c[0]), ...rows.map((r) => PERIOD_COLUMNS.map(([, g]) => g(r)))], "Proje takvimi",
      Object.fromEntries(PERIOD_COLUMNS.map(([, , w], i) => [String.fromCharCode(65 + i), w])));
  };
  const printOut = (paper, pdf) => {
    const title = single ? `${visible[0]?.name || "Proje"} - proje takvimi` : "Proje takvimi";
    const html = ganttHtml({ projects: visible, scale, from: win.from, to: win.to, paper, title, people: peopleNames });
    const file = title.replace(/[\\/:*?"<>|]/g, "-");
    if (pdf) window.elitlig.pdf(html, file, { landscape: true, pageSize: paper }); else window.elitlig.print(html, file, { landscape: true, pageSize: paper });
  };

  const today = todayDay();
  const todayIndex = diffDays(win.from, today);
  const warnIds = new Set((data?.warnings || []).filter((w) => w.period_id).map((w) => w.period_id));
  const xOf = (day) => diffDays(win.from, day) * px;
  const rows = [];
  for (const p of visible) {
    const ranged = p.periods.filter((x) => x.kind !== "milestone");
    const stones = p.periods.filter((x) => x.kind === "milestone");
    if (single) {
      if (stones.length) rows.push({ key: `ms-${p.id}`, project: p, label: "Kilometre taşları", stones, lanes: [], height: MS_H + 8 });
      for (const per of ranged) {
        rows.push({ key: `per-${per.id}`, project: p, label: per.name, sub: STAGE_LABELS[per.stage] || "", color: per.color, lanes: [{ ...per, lane: 0 }], height: LANE_H + 10 });
        const steps = (data.steps || []).filter((s) => s.period_id === per.id && (s.start_date || s.due_date));
        if (showSteps && steps.length) {
          const packed = packLanes(steps.map((s) => { const a = s.start_date || s.due_date; const b = s.due_date || s.start_date; return { ...s, start_date: a < b ? a : b, end_date: a < b ? b : a }; }));
          rows.push({ key: `steps-${per.id}`, project: p, label: `${steps.length} adım`, steps: packed.items, outside: new Set(stepsOutside(per, data.steps).map((s) => s.id)), height: packed.lanes * (STEP_H + 3) + 6, isSteps: true });
        }
      }
      if (!ranged.length) rows.push({ key: `empty-${p.id}`, project: p, label: "Dönem ekleyin", lanes: [], height: LANE_H + 10 });
    } else {
      const packed = packLanes(ranged);
      const msTrack = stones.length ? MS_H : 0;
      rows.push({ key: `pr-${p.id}`, project: p, label: p.name, color: p.color, lanes: packed.items, stones, msTrack, height: msTrack + packed.lanes * LANE_H + 10 });
    }
  }
  const canEditAny = data?.projects.some((p) => p.can_edit);
  const newDraft = (kind) => ({ project_id: single ? projectId : filters.projectId || undefined, kind, start_date: today, end_date: kind === "milestone" ? today : addDays(today, 13) });

  return (
    <div className="ptl" style={{ "--ptl-label": `${LABEL_W}px` }}>
      <div className="ptl-toolbar" role="toolbar" aria-label="Proje takvimi araçları">
        <div className="ptl-nav">
          <button type="button" className="icon-btn" onClick={() => setAnchor((a) => shiftAnchor(scale, a, -1))} aria-label="Önceki"><Icon name="chevronLeft" /></button>
          <button type="button" className="btn btn--sm" onClick={() => setAnchor(todayDay())}>Bugün</button>
          <button type="button" className="icon-btn" onClick={() => setAnchor((a) => shiftAnchor(scale, a, 1))} aria-label="Sonraki"><Icon name="chevronRight" /></button>
          <strong className="ptl-range">{formatRange(win.from, win.to)}</strong>
        </div>
        <Segmented size="sm" value={scale} onChange={setScale} ariaLabel="Ölçek" options={SCALE_KEYS.map((k) => ({ value: k, label: SCALES[k].label }))} />
        {!single && (
          <select className="select-sm" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))} aria-label="Proje süzgeci">
            <option value="">Tüm projeler</option>
            {(data?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select className="select-sm" value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))} aria-label="Evre süzgeci">
          <option value="">Tüm evreler</option>
          {stageOptions(meta).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="select-sm" value={filters.responsibleId} onChange={(e) => setFilters((f) => ({ ...f, responsibleId: e.target.value }))} aria-label="Sorumlu süzgeci">
          <option value="">Tüm sorumlular</option>
          {responsibleOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {single && <label className="ptl-check"><input type="checkbox" checked={showSteps} onChange={(e) => setShowSteps(e.target.checked)} /> Adımlar</label>}
        <span className="spacer" />
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditor(newDraft("period"))} disabled={!canEditAny}><Icon name="plus" size={13} /> Dönem</button>
        <button type="button" className="btn btn--sm" onClick={() => setEditor(newDraft("milestone"))} disabled={!canEditAny}><Icon name="flag" size={13} /> Kilometre taşı</button>
        {single && data?.projects[0]?.can_edit && <button type="button" className="btn btn--sm" onClick={() => setShifting(data.projects[0])}><Icon name="arrows" size={13} /> Planı kaydır</button>}
        <MenuButton text="Dışa aktar" icon="download" label="Dışa aktar" items={[
          { label: "Yazdır (yatay A4)", icon: "printer", onClick: () => printOut("A4", false) },
          { label: "Yazdır (yatay A3)", icon: "printer", onClick: () => printOut("A3", false) },
          { label: "PDF olarak kaydet (A4 yatay)", icon: "file", onClick: () => printOut("A4", true) },
          { label: "PDF olarak kaydet (A3 yatay)", icon: "file", onClick: () => printOut("A3", true) },
          { label: "Excel'e aktar (dönem listesi)", icon: "grid", onClick: exportExcel },
        ]} />
      </div>

      <ErrorNote error={error} onRetry={load} />
      {single && (data?.warnings || []).length > 0 && (
        <ul className="ptl-warnings" aria-label="Takvim uyarıları">
          {data.warnings.map((w, i) => (
            <li key={`${w.type}-${i}`}><Icon name="alert" size={13} /> {w.message}
              {w.type === "project_range" && data.projects[0]?.can_edit && (
                <button type="button" className="btn btn--sm" onClick={async () => { const r = await send("POST", `${BASE}/${projectId}/periods/sync-dates`); if (r.ok) { apply(projectId, r.data); toast("Proje tarihleri dönemlere eşitlendi."); } else toast(errText(r, "Eşitlenemedi."), { tone: "error" }); }}>Proje tarihlerini eşitle</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!data && !error ? <Spinner /> : data && (
        <div className="ptl-scroll">
          <div className="ptl-grid" style={{ width: LABEL_W + width }}>
            <div className="ptl-head">
              <div className="ptl-label ptl-label--head">{single ? "Dönem" : "Proje"}</div>
              <div className="ptl-scale" style={{ width }}>
                <div className="ptl-scale__row">{header.top.map((u) => <span key={u.key} style={{ left: u.start * px, width: u.span * px }}>{u.span * px > 40 ? u.label : ""}</span>)}</div>
                <div className="ptl-scale__row is-bottom">{header.bottom.map((u) => <span key={u.key} style={{ left: u.start * px, width: u.span * px }}>{u.span * px > 18 ? u.label : ""}</span>)}</div>
              </div>
            </div>
            <div className="ptl-row ptl-row--load">
              <div className="ptl-label">
                <span>Yoğunluk</span>
                <select className="ptl-mini" value={loadStage} onChange={(e) => setLoadStage(e.target.value)} aria-label="Yoğunluk evresi">
                  <option value="execution">Organizasyon evresi</option>
                  {stageOptions(meta).filter((s) => s.key !== "execution").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  <option value="">Tüm dönemler</option>
                </select>
              </div>
              <div className="ptl-canvas" style={{ width, height: 22 }}>
                {load2.map((seg) => {
                  const c = clip(seg.from, seg.to, win.from, win.days);
                  if (!c) return null;
                  const names = seg.project_ids.map((id) => data.projects.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
                  return <span key={`${seg.from}-${seg.count}`} className={`ptl-load${seg.count > 1 ? " is-conflict" : ""}`} data-count={seg.count} style={{ left: c.start * px, width: c.span * px, "--lv": Math.min(1, 0.25 + seg.count * 0.2) }} title={`${formatRange(seg.from, seg.to)}: ${seg.count} proje (${names})`}>{c.span * px > 22 ? seg.count : ""}</span>;
                })}
              </div>
            </div>
            <div className="ptl-body">
              <div className="ptl-lines" style={{ left: LABEL_W, width }} aria-hidden="true">
                {header.bottom.map((u) => <span key={u.key} style={{ left: u.start * px }} />)}
                {todayIndex >= 0 && todayIndex < win.days && <i className="ptl-today" style={{ left: todayIndex * px + px / 2 }} />}
              </div>
              {rows.length === 0 && <p className="muted ptl-empty">Gösterilecek proje yok. Süzgeçleri değiştirin ya da bir projeye dönem ekleyin.</p>}
              {rows.map((row) => (
                <div key={row.key} className={`ptl-row${row.isSteps ? " ptl-row--steps" : ""}`} style={{ height: row.height }}>
                  <div className="ptl-label" style={row.color ? { "--rc": row.color } : undefined}>
                    {row.color && <span className="ptl-dot" />}
                    <span className="ptl-label__text">
                      {!single && onOpenProject
                        ? <button type="button" className="ptl-label__name" onClick={() => onOpenProject(row.project.id)} title={`${row.project.name} projesini aç`}>{row.label}</button>
                        : <span className="ptl-label__name" title={row.label}>{row.label}</span>}
                      {row.sub && <small>{row.sub}</small>}
                      {!single && <small>{row.project.span ? formatRange(row.project.span.start, row.project.span.end) : "Plan yok — boş alanda sürükleyin"}</small>}
                    </span>
                    {!single && row.project.can_edit && <button type="button" className="icon-btn ptl-label__act" onClick={() => setShifting(row.project)} aria-label={`${row.project.name}: planı kaydır`} title="Planı kaydır"><Icon name="arrows" size={13} /></button>}
                  </div>
                  <div className={`ptl-canvas${row.project.can_edit && !row.isSteps ? " is-editable" : ""}`} style={{ width, height: row.height }} data-row={row.key}
                    onMouseDown={row.isSteps ? undefined : (e) => startSelect(e, row.project, row.key)}>
                    {selecting && selecting.rowKey === row.key && (
                      <span className="ptl-select" style={{ left: Math.min(selecting.a, selecting.b) * px, width: (Math.abs(selecting.b - selecting.a) + 1) * px }}>
                        {(() => { const r = rangeFromIndexes(win.from, selecting.a, selecting.b); return formatRange(r.start_date, r.end_date); })()}
                      </span>
                    )}
                    {(row.lanes || []).map((per) => {
                      const c = clip(per.start_date, per.end_date, win.from, win.days);
                      return c && <Bar key={per.id} period={per} left={c.start * px} width={c.span * px} top={(row.msTrack || 0) + per.lane * LANE_H + 5} editable={row.project.can_edit} onStart={startDrag} warn={warnIds.has(per.id)} />;
                    })}
                    {(row.stones || []).filter((ms) => clip(ms.start_date, ms.start_date, win.from, win.days)).sort((x, y) => x.start_date.localeCompare(y.start_date)).map((ms, i, list) => {
                      const room = list[i + 1] ? xOf(list[i + 1].start_date) - xOf(ms.start_date) : Infinity;
                      return <Diamond key={ms.id} period={ms} left={xOf(ms.start_date) + px / 2} top={single ? 4 : 2} onStart={startDrag} compact={room < ms.name.length * 6.5 + 22} />;
                    })}
                    {(row.steps || []).map((s) => {
                      const c = clip(s.start_date, s.end_date, win.from, win.days);
                      if (!c) return null;
                      return <span key={s.id} className={`ptl-step${row.outside.has(s.id) ? " is-outside" : ""}${["done", "skipped"].includes(s.status) ? " is-done" : ""}`} style={{ left: c.start * px, width: Math.max(6, c.span * px), top: s.lane * (STEP_H + 3) + 3 }} title={`${s.title} · ${formatRange(s.start_date, s.end_date)}${row.outside.has(s.id) ? " · dönem dışında" : ""}`}>{c.span * px > 60 ? s.title : ""}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <p className="muted small ptl-hint">Çubuğu sürükleyerek taşıyın, kenarından uzatıp kısaltın; boş alanda sürükleyerek yeni dönem aralığı seçin. Kırmızı yoğunluk: aynı günlerde birden çok projenin organizasyon evresi var.</p>

      {editor && <PeriodEditor draft={editor} projects={(data?.projects || []).filter((p) => p.can_edit)} meta={meta} people={people} onClose={() => setEditor(null)}
        onSaved={(pid, body, msg) => { setEditor(null); if (!apply(pid, body)) toast(msg); }} />}
      {shifting && <ShiftDialog project={shifting} onClose={() => setShifting(null)} onDone={(pid, body) => {
        setShifting(null); apply(pid, body);
        toast(`Plan ${body.shifted?.days > 0 ? `${body.shifted.days} gün ileri` : `${-(body.shifted?.days || 0)} gün geri`} kaydırıldı (${body.shifted?.periods || 0} dönem, ${body.shifted?.steps || 0} adım).`);
      }} />}
    </div>
  );
}
