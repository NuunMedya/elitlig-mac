// Kart oluşturma / düzenleme ve bağlantı seçici.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, Modal, Segmented, useResult } from "../../components/ui";
import { get, patch, post, tempId, useDebounced } from "../../api";
import { includesTr, localInput } from "../../lib/helpers";
import { ALL_AWARD, PRIORITIES, endOfDay } from "./todoUtils";
import { UNLABELED_LONG, phasePayload, phasesOf } from "../../lib/projectPhases";

/** Oyuncu / takım / maç arama (/api/todos/lookup). */
export function LinkPicker({ types = ["player", "team", "match"], value, onChange, placeholder }) {
  const [type, setType] = useState(value?.type || types[0]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const query = useDebounced(q, 250);
  useEffect(() => {
    if (query.trim().length < 2) { setItems([]); return; }
    get("/api/todos/lookup", { type, q: query.trim() }).then((res) => res.ok && setItems(res.data?.items || []));
  }, [type, query]);
  if (value?.id) {
    return (
      <div className="link-chosen">
        <Icon name={value.type === "match" ? "ball" : value.type === "team" ? "shirt" : "user"} size={14} />
        <strong>{value.label}</strong>{value.sub && <small className="muted">{value.sub}</small>}
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => onChange(null)} aria-label="Kaldır"><Icon name="x" size={12} /></button>
      </div>
    );
  }
  return (
    <div className="link-picker">
      <div className="row-gap">
        {types.length > 1 && <Segmented size="sm" value={type} onChange={(v) => { setType(v); setItems([]); }} options={types.map((t) => ({ value: t, label: t === "player" ? "Oyuncu" : t === "team" ? "Takım" : "Maç" }))} />}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || "En az 2 harf yazın…"} style={{ flex: 1 }} />
      </div>
      {items.length > 0 && (
        <div className="pick-list">
          {items.map((it) => <button key={it.id} type="button" onClick={() => { onChange({ type, id: it.id, label: it.label, sub: it.sub }); setQ(""); setItems([]); }}>{it.label}<small>{it.sub}</small></button>)}
        </div>
      )}
    </div>
  );
}

const linkOf = (task) => (task?.match ? { type: "match", id: task.match.id, label: task.match.label } : task?.team ? { type: "team", id: task.team.id, label: task.team.name } : task?.player ? { type: "player", id: task.player.id, label: task.player.name, sub: task.player.teamName } : null);

const lastWeek = () => {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(monday), end: iso(sunday) };
};

export function AwardScope({ value, onChange }) {
  const leagues = useLeagues();
  const [seasons, setSeasons] = useState([]);
  useEffect(() => {
    if (!value.league_id) { setSeasons([]); return; }
    get("/api/admin/weekly-awards/seasons", { leagueId: value.league_id }).then((res) => res.ok && setSeasons(res.data?.items || []));
  }, [value.league_id]);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="form-grid">
      <Field label="Hafta adı"><input value={value.week || ""} onChange={set("week")} placeholder="örn. 12. hafta" /></Field>
      <Field label="Kadro"><select value={value.squad_size || 7} onChange={(e) => onChange({ ...value, squad_size: Number(e.target.value) })}><option value={7}>7'li</option><option value={8}>8'li</option></select></Field>
      <Field label="Lig"><select value={value.league_id || ""} onChange={(e) => onChange({ ...value, league_id: e.target.value, season_id: "" })}><option value="">Seçin…</option>{leagues.map((l) => <option key={l.id} value={l.id}>{l.label || l.name}</option>)}</select></Field>
      <Field label="Sezon"><select value={value.season_id || ""} onChange={set("season_id")}><option value="">Seçin…</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.label || s.name || s.seasonName}</option>)}</select></Field>
      <Field label="Başlangıç"><input type="date" value={value.start_date || ""} onChange={set("start_date")} /></Field>
      <Field label="Bitiş"><input type="date" value={value.end_date || ""} onChange={set("end_date")} /></Field>
      <div className="span2">
        <span className="field__label">Kategoriler</span>
        <div className="chips">{ALL_AWARD.map((c) => {
          const on = (value.categories || []).includes(c.key);
          return <button key={c.key} type="button" className={`chip ${on ? "" : "chip--off"}`} onClick={() => onChange({ ...value, categories: on ? value.categories.filter((k) => k !== c.key) : [...(value.categories || []), c.key] })}>{on ? "✓ " : ""}{c.label}</button>;
        })}</div>
      </div>
    </div>
  );
}

let leagueCache = null;
function useLeagues() {
  const [items, setItems] = useState(leagueCache || []);
  useEffect(() => {
    if (leagueCache) return;
    get("/api/admin/weekly-awards/leagues").then((res) => { if (res.ok) { leagueCache = res.data?.items || []; setItems(leagueCache); } });
  }, []);
  return items;
}

export default function Composer({ catalog, task, initial = {}, projects = [], onClose, onSaved }) {
  const result = useResult();
  const editing = Boolean(task);
  const canAssign = Boolean(catalog?.canAssign) && !editing;
  const [audience, setAudience] = useState(initial.audience || "me");
  const [form, setForm] = useState({
    kind: task?.kind || initial.kind || "task",
    title: task?.title || initial.title || "",
    body: task?.body || "",
    priority: task?.priority || initial.priority || "normal",
    due_at: task?.dueAt ? localInput(task.dueAt) : initial.due_at ? localInput(initial.due_at) : "",
    checklist: "",
    project_id: task ? task.project?.id ?? null : initial.project_id ?? null,
    // Etap etiketi: "" Askıda, id var olan etap, "new" yeni etap (phase_name)
    phase: task?.project?.phase?.id ?? "",
    phase_name: "",
  });
  // Bağlanabilecek projeler; düzenlenen kartın projesi listede yoksa da seçenek olarak kalır.
  const projectChoices = useMemo(() => {
    const list = [...projects];
    if (task?.project && !list.some((p) => Number(p.id) === Number(task.project.id))) list.push(task.project);
    return list;
  }, [projects, task]);
  // Görüşme takibi kartının projesi değişmez; proje adımı kartı başka projeye taşınabilir ya da projeden çıkarılabilir.
  const projectLinked = task?.kind === "project_followup";
  const [link, setLink] = useState(linkOf(task));
  const [assignees, setAssignees] = useState([]);
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [award, setAward] = useState(() => ({ ...lastWeek(), start_date: lastWeek().start, end_date: lastWeek().end, categories: ALL_AWARD.map((c) => c.key), squad_size: 7, week: "" }));
  const [busy, setBusy] = useState(false);
  const isAward = form.kind === "award_nomination";

  useEffect(() => { if (canAssign) get("/api/todos/assignees").then((res) => res.ok && setPeople(res.data?.items || [])); }, [canAssign]);
  const shownPeople = useMemo(() => people.filter((p) => !search || includesTr(`${p.name} ${p.city}`, search)), [people, search]);
  const kinds = audience === "team" ? [["task", "Görev"], ["reminder", "Hatırlatma"], ["award_nomination", "Haftanın enleri"]] : [["task", "Görev"], ["reminder", "Hatırlatma"], ["note", "Kişisel not"]];
  useEffect(() => { if (!kinds.some(([k]) => k === form.kind) && !editing) setForm((f) => ({ ...f, kind: kinds[0][0] })); }, [audience]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const quickDue = (offset) => setForm({ ...form, due_at: offset == null ? "" : localInput(endOfDay(offset)) });
  const valid = (isAward ? award.categories.length > 0 && award.league_id && award.season_id : form.title.trim()) && (audience !== "team" || assignees.length > 0);

  const submit = async (e) => {
    e?.preventDefault();
    if (!valid) return;
    setBusy(true);
    const links = { player_id: link?.type === "player" ? link.id : null, team_id: link?.type === "team" ? link.id : null, match_id: link?.type === "match" ? link.id : null };
    if (projectChoices.length && !projectLinked && !isAward) links.project_id = form.project_id || null;
    if (form.project_id && !isAward && !projectLinked) {
      const sameProject = editing && Number(task?.project?.id) === Number(form.project_id);
      Object.assign(links, phasePayload(form.phase, form.phase_name, sameProject ? task?.project?.phase?.id ?? null : undefined));
    }
    let res;
    if (editing) {
      res = await patch(`/api/todos/${task.id}`, { title: form.title.trim(), body: form.body || null, priority: form.priority, due_at: form.due_at ? new Date(form.due_at).toISOString() : null, ...links });
    } else {
      const checklist = form.checklist.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false }));
      res = await post("/api/todos", {
        kind: form.kind,
        title: isAward ? undefined : form.title.trim(),
        body: form.body || null,
        priority: form.priority,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        ...(isAward ? {} : links),
        ...(checklist.length ? { checklist } : {}),
        ...(audience === "team" ? { assignee_ids: assignees.map((a) => a.id) } : {}),
        ...(initial.labels ? { labels: initial.labels } : {}),
        ...(initial.status ? { status: initial.status } : {}),
        ...(isAward ? { week: award.week || null, league_id: Number(award.league_id), season_id: Number(award.season_id), start_date: award.start_date, end_date: award.end_date, categories: award.categories, squad_size: award.squad_size } : {}),
      }, { tempId: tempId() });
    }
    setBusy(false);
    if (result(res, editing ? "Kart güncellendi." : audience === "team" ? `${assignees.length} kişiye atandı.` : "Kart eklendi.")) onSaved(editing ? res.data?.item : res.data?.items);
  };

  return (
    <Modal title={editing ? "Kartı düzenle" : audience === "team" ? "Ekibe görev ata" : "Yeni iş"} onClose={onClose} width={640} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="todo-composer" className="btn btn--primary" disabled={busy || !valid}>{busy ? "Kaydediliyor…" : editing ? "Kaydet" : audience === "team" ? (assignees.length ? `${assignees.length} kişiye ata` : "Kişi seçin") : "Ekle"}</button>
    </>}>
      <form id="todo-composer" className="composer" onSubmit={submit}>
        {canAssign && <Segmented value={audience} onChange={setAudience} options={[{ value: "me", label: "Kendim için", icon: "user" }, { value: "team", label: "Ekibe ata", icon: "team" }]} />}
        {!editing && <div className="kind-pick">{kinds.map(([k, l]) => <button key={k} type="button" className={form.kind === k ? "is-on" : ""} onClick={() => setForm({ ...form, kind: k })}>{l}</button>)}</div>}
        {!isAward && <input className="composer__title" autoFocus value={form.title} maxLength={200} onChange={set("title")} placeholder="Ne yapılacak?" />}
        {isAward && <div className="notice notice--info"><Icon name="award" size={14} /> Seçtiğiniz her kişiye bir aday önerisi kartı, size de önerileri toplayıp listeyi oluşturacağınız koordinasyon kartı düşer.</div>}
        <div className="due-pick">
          <span className="field__label">Ne zaman</span>
          <div className="row-gap">
            <button type="button" className={`chip ${!form.due_at ? "" : "chip--off"}`} onClick={() => quickDue(null)}>Tarihsiz</button>
            <button type="button" className="chip chip--off" onClick={() => quickDue(0)}>Bugün</button>
            <button type="button" className="chip chip--off" onClick={() => quickDue(1)}>Yarın</button>
            <button type="button" className="chip chip--off" onClick={() => quickDue(7)}>Haftaya</button>
            <input type="datetime-local" value={form.due_at} onChange={set("due_at")} style={{ width: 210 }} />
          </div>
        </div>
        <Segmented size="sm" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} />
        <Field label="Açıklama"><textarea rows={3} value={form.body} onChange={set("body")} /></Field>
        {!editing && !isAward && <Field label="Aşamalar (her satır bir aşama)"><textarea rows={3} value={form.checklist} onChange={set("checklist")} placeholder={"Sahayı ara\nHakemi teyit et"} /></Field>}
        {projectChoices.length > 0 && !isAward && !projectLinked && (
          <Field label="Proje (isteğe bağlı)">
            <select value={form.project_id || ""} onChange={(e) => setForm({ ...form, project_id: e.target.value ? Number(e.target.value) : null })} aria-label="Projeye bağla">
              <option value="">Kişisel (projesiz)</option>
              {projectChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {form.project_id && !isAward && !projectLinked && (
          <Field label="Etap etiketi (projedeki aşama)">
            <select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} aria-label="Etap etiketi">
              <option value="">{UNLABELED_LONG}</option>
              {phasesOf(projectChoices, form.project_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="new">+ Yeni etap…</option>
            </select>
            {form.phase === "new" && <input value={form.phase_name} maxLength={120} onChange={set("phase_name")} placeholder="Yeni etap adı (projede aşama açılır)" aria-label="Yeni etap adı" />}
            <span className="muted small">Kart projede bu etabın altında adım olur; etiketsizler “Askıda” grubundadır.</span>
          </Field>
        )}
        {!isAward && <div><span className="field__label">Oyuncu / takım / maç bağla</span><LinkPicker value={link} onChange={setLink} /></div>}
        {isAward && <AwardScope value={award} onChange={setAward} />}
        {audience === "team" && (
          <div className="assignees">
            <span className="field__label">Kime atanacak? ({assignees.length})</span>
            <div className="chips">{assignees.map((a) => <span key={a.id} className="chip">{a.name}<button type="button" onClick={() => setAssignees(assignees.filter((x) => x.id !== a.id))}>×</button></span>)}</div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad ya da il ara…" />
            <div className="pick-list pick-list--tall">
              {shownPeople.map((p) => {
                const on = assignees.some((a) => a.id === p.id);
                return <label key={p.id} className={`person-pick ${on ? "is-on" : ""}`}><input type="checkbox" checked={on} onChange={() => setAssignees(on ? assignees.filter((a) => a.id !== p.id) : [...assignees, p])} /><span className="avatar">{(p.name || "?")[0]}</span><span>{p.name}{p.isSelf ? " (ben)" : ""}<small>{p.city}</small></span></label>;
              })}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
