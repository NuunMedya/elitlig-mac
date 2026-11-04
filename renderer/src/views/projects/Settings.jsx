// Ayarlar: proje bilgileri, kişi aşamaları, görüşme sonuçları, roller → kişi,
// listeler, üyeler; şablon olarak kaydet, kopyala, sil / ayrıl.
import React, { useEffect, useState } from "react";
import { Field, Icon, Modal, useConfirm } from "../../components/ui";
import { del, put, request, useResource } from "../../api";
import { PROJECT_COLORS, PROJECT_ICONS, slugKey } from "../../lib/projectUtils";
import { Avatar, BASE, PromptDialog, ROLE_LABEL, TagEditor, useRun } from "./common";

export default function Settings({ ctx, onDeleted, openProject }) {
  const { canEdit, isOwner } = ctx;
  return (
    <div className="proj-section">
      {!canEdit && <div className="notice notice--warn"><Icon name="eye" size={14} /> Bu projeyi yalnız görüntüleyebilirsiniz; ayarları proje sahibi ya da düzenleyiciler değiştirir.</div>}
      <div className="settings-grid">
        <ProjectInfo ctx={ctx} />
        <StagesEditor ctx={ctx} />
        <OutcomesEditor ctx={ctx} />
        <RolesEditor ctx={ctx} />
        <ListsEditor ctx={ctx} />
        <Members ctx={ctx} />
        <Danger ctx={ctx} isOwner={isOwner} onDeleted={onDeleted} openProject={openProject} />
      </div>
    </div>
  );
}

const SaveBar = ({ dirty, onSave, onReset, busy }) => (dirty ? (
  <div className="save-bar"><span className="muted small">Kaydedilmemiş değişiklik</span><span className="spacer" /><button type="button" className="btn btn--sm btn--ghost" onClick={onReset}>Geri al</button><button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={onSave}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
) : null);

function ProjectInfo({ ctx }) {
  const { project, meta, canEdit, actions } = ctx;
  const pick = () => ({ name: project.name, description: project.description, status: project.status, start_date: project.start_date || "", end_date: project.end_date || "", color: project.color, icon: project.icon, archived: project.archived });
  const [f, setF] = useState(pick);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(pick()), [project.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(pick());
  const save = async () => { setBusy(true); await actions.updateProject({ ...f, start_date: f.start_date || null, end_date: f.end_date || null }); setBusy(false); };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="layers" /> Proje bilgileri</h2></header>
      <div className="form-grid">
        <Field label="Ad" className="span2"><input value={f.name} disabled={!canEdit} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></Field>
        <Field label="Açıklama" className="span2"><textarea rows={2} value={f.description} disabled={!canEdit} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Durum"><select value={f.status} disabled={!canEdit} onChange={(e) => setF({ ...f, status: e.target.value })}>{meta.project_statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Arşiv"><label className="toggle"><input type="checkbox" checked={f.archived} disabled={!canEdit} onChange={(e) => setF({ ...f, archived: e.target.checked })} /> Projeyi arşivle</label></Field>
        <Field label="Başlangıç"><input type="date" value={f.start_date} disabled={!canEdit} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="Bitiş"><input type="date" value={f.end_date} disabled={!canEdit} min={f.start_date || undefined} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label="Renk" className="span2"><div className="color-dots color-dots--lg">{PROJECT_COLORS.map((c) => <button key={c} type="button" disabled={!canEdit} className={f.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />)}</div></Field>
        <Field label="Simge" className="span2"><div className="icon-pick">{PROJECT_ICONS.map((ic) => <button key={ic} type="button" disabled={!canEdit} className={f.icon === ic ? "is-on" : ""} style={{ "--pc": f.color }} onClick={() => setF({ ...f, icon: ic })} aria-label={ic}><Icon name={ic} size={15} /></button>)}</div></Field>
      </div>
      {canEdit && <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setF(pick())} />}
    </section>
  );
}

/** Ayarlar listesinin taslağı: kaydedilene kadar yerel. */
function useDraft(source) {
  const [draft, setDraft] = useState(source);
  const key = JSON.stringify(source);
  useEffect(() => setDraft(JSON.parse(key)), [key]);
  return [draft, setDraft, JSON.stringify(draft) !== key, () => setDraft(JSON.parse(key))];
}
const move = (list, i, dir) => { const j = i + dir; if (j < 0 || j >= list.length) return list; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next; };

function StagesEditor({ ctx }) {
  const { settings, canEdit, actions, leads } = ctx;
  const [stages, setStages, dirty, reset] = useDraft(settings.lead_stages);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(null);
  const set = (i, patch) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = async (moveTo) => {
    setBusy(true);
    // Silinen aşamaya giden görüşme sonuçları da güncellenir (yoksa sonuç kişiyi olmayan aşamaya taşır).
    const keys = new Set(stages.map((s) => s.key));
    const outcomes = settings.outcomes.map((o) => (!o.stage || keys.has(o.stage) ? o : { ...o, stage: moveTo || undefined }));
    const r = await actions.updateProject({ settings: { lead_stages: stages, outcomes }, ...(moveTo ? { move_stage_to: moveTo } : {}) });
    setBusy(false);
    if (r?.error?.code === "STAGE_IN_USE") setConflict(r.error.message);
    else if (r?.ok) setConflict(null);
  };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="users" /> Kişi aşamaları</h2><span className="muted small">CRM hunisi ve pano sütunları</span></header>
      <ul className="edit-list">
        {stages.map((s, i) => (
          <li key={s.key}>
            <input type="color" value={s.color || "#64748b"} disabled={!canEdit} onChange={(e) => set(i, { color: e.target.value })} aria-label="Renk" />
            <input value={s.label} disabled={!canEdit} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} />
            <small className="muted edit-list__count">{leads.filter((l) => l.stage === s.key).length} kişi</small>
            <label className={`flag ${s.won ? "is-won" : ""}`} title="Kazanıldı aşaması"><input type="checkbox" checked={Boolean(s.won)} disabled={!canEdit} onChange={(e) => set(i, { won: e.target.checked || undefined, lost: e.target.checked ? undefined : s.lost })} /> Kazanıldı</label>
            <label className={`flag ${s.lost ? "is-lost" : ""}`} title="Kaybedildi aşaması"><input type="checkbox" checked={Boolean(s.lost)} disabled={!canEdit} onChange={(e) => set(i, { lost: e.target.checked || undefined, won: e.target.checked ? undefined : s.won })} /> Kayıp</label>
            {canEdit && <span className="edit-list__tools">
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setStages(move(stages, i, -1))} disabled={i === 0} aria-label="Yukarı"><Icon name="chevronUp" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setStages(move(stages, i, 1))} disabled={i === stages.length - 1} aria-label="Aşağı"><Icon name="chevronDown" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setStages(stages.filter((_, j) => j !== i))} disabled={stages.length < 2} aria-label="Sil"><Icon name="trash" size={12} /></button>
            </span>}
          </li>
        ))}
      </ul>
      {canEdit && stages.length < 20 && <button type="button" className="board__addbtn" onClick={() => setStages([...stages, { key: slugKey("Yeni aşama", stages.map((s) => s.key)), label: "Yeni aşama", color: PROJECT_COLORS[stages.length % PROJECT_COLORS.length] }])}><Icon name="plus" size={13} /> Aşama ekle</button>}
      {canEdit && <SaveBar dirty={dirty} busy={busy} onSave={() => save()} onReset={reset} />}
      {conflict && <MoveStageDialog message={conflict} stages={stages} onClose={() => setConflict(null)} onConfirm={(to) => save(to)} />}
    </section>
  );
}

function MoveStageDialog({ message, stages, onClose, onConfirm }) {
  const [to, setTo] = useState(stages[0]?.key || "");
  return (
    <Modal title="Silinen aşamada kişiler var" onClose={onClose} width={440} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={() => onConfirm(to)}>Taşı ve kaydet</button></>}>
      <p className="muted">{message}</p>
      <Field label="Kişiler şu aşamaya taşınsın"><select value={to} onChange={(e) => setTo(e.target.value)}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
    </Modal>
  );
}

function OutcomesEditor({ ctx }) {
  const { settings, canEdit, actions } = ctx;
  const [outcomes, setOutcomes, dirty, reset] = useDraft(settings.outcomes);
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setOutcomes(outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const save = async () => { setBusy(true); await actions.updateProject({ settings: { outcomes: outcomes.map((o) => ({ ...o, next_days: o.next_days === "" ? null : o.next_days })) } }); setBusy(false); };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="zap" /> Görüşme sonuçları</h2><span className="muted small">Kişide tek tıkla kayıt düğmeleri</span></header>
      <p className="muted small">Her sonuç kişiyi seçilen aşamaya taşır ve sonraki aramayı “gün sonra” saat 10:00'a planlar.</p>
      <ul className="edit-list edit-list--outcomes">
        {outcomes.map((o, i) => (
          <li key={o.key}>
            <input value={o.label} disabled={!canEdit} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} aria-label="Sonuç adı" />
            <select value={o.stage || ""} disabled={!canEdit} onChange={(e) => set(i, { stage: e.target.value || undefined })} aria-label="Aşama"><option value="">Aşama değişmez</option>{settings.lead_stages.map((s) => <option key={s.key} value={s.key}>→ {s.label}</option>)}</select>
            <span className="days-input"><input type="number" min={0} max={90} value={o.next_days ?? ""} disabled={!canEdit} onChange={(e) => set(i, { next_days: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" aria-label="Kaç gün sonra" /><small>gün</small></span>
            {canEdit && <span className="edit-list__tools">
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setOutcomes(move(outcomes, i, -1))} disabled={i === 0} aria-label="Yukarı"><Icon name="chevronUp" size={12} /></button>
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setOutcomes(outcomes.filter((_, j) => j !== i))} aria-label="Sil"><Icon name="trash" size={12} /></button>
            </span>}
          </li>
        ))}
      </ul>
      {canEdit && outcomes.length < 20 && <button type="button" className="board__addbtn" onClick={() => setOutcomes([...outcomes, { key: slugKey("Yeni sonuç", outcomes.map((o) => o.key)), label: "Yeni sonuç", next_days: 1 }])}><Icon name="plus" size={13} /> Sonuç ekle</button>}
      {canEdit && <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />}
    </section>
  );
}

function RolesEditor({ ctx }) {
  const { settings, canEdit, actions, steps } = ctx;
  const people = useResource(`${BASE}/people`);
  const team = people.data?.items || [];
  const [roles, setRoles, dirty, reset] = useDraft(settings.roles);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const set = (i, patch) => setRoles(roles.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => { setBusy(true); await actions.updateProject({ settings: { roles } }); setBusy(false); };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="team" /> Roller → kişiler</h2><span className="muted small">Adımlardaki sorumlu rolleri kime denk geliyor?</span></header>
      <ul className="edit-list">
        {roles.map((r, i) => (
          <li key={`${r.name}${i}`}>
            <strong className="role-chip role-chip--lg">{r.name}</strong>
            <small className="muted edit-list__count">{steps.filter((s) => s.responsible.includes(r.name)).length} adım</small>
            <select value={r.user_id || ""} disabled={!canEdit} onChange={(e) => set(i, { user_id: e.target.value ? Number(e.target.value) : null })} aria-label="Kullanıcı"><option value="">Kullanıcı seçin</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.city ? ` · ${u.city}` : ""}</option>)}</select>
            <input value={r.person || ""} disabled={!canEdit} onChange={(e) => set(i, { person: e.target.value })} placeholder="ya da isim yazın" maxLength={80} />
            {canEdit && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setRoles(roles.filter((_, j) => j !== i))} aria-label="Sil"><Icon name="trash" size={12} /></button>}
          </li>
        ))}
        {!roles.length && <li className="muted small">Rol yok. Adımlara sorumlu yazdıkça burada eşleyebilirsiniz.</li>}
      </ul>
      {canEdit && <form className="inline-add" onSubmit={(e) => { e.preventDefault(); const n = name.trim().toLocaleUpperCase("tr-TR"); if (n && !roles.some((r) => r.name === n)) setRoles([...roles, { name: n, user_id: null, person: null }]); setName(""); }}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rol ekle (ör. SAHA SORUMLUSU) ve ↩" maxLength={60} /></form>}
      {canEdit && <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />}
    </section>
  );
}

function ListsEditor({ ctx }) {
  const { settings, canEdit, actions } = ctx;
  const [lists, setLists, dirty, reset] = useDraft({ portfolio_categories: settings.portfolio_categories, lead_sources: settings.lead_sources, question_categories: settings.question_categories });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); await actions.updateProject({ settings: lists }); setBusy(false); };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="tag" /> Listeler</h2></header>
      <Field label="Portföy kategorileri"><TagEditor value={lists.portfolio_categories} disabled={!canEdit} onChange={(v) => setLists({ ...lists, portfolio_categories: v })} /></Field>
      <Field label="Kişi kaynakları"><TagEditor value={lists.lead_sources} disabled={!canEdit} onChange={(v) => setLists({ ...lists, lead_sources: v })} /></Field>
      <Field label="Soru kategorileri"><TagEditor value={lists.question_categories} disabled={!canEdit} onChange={(v) => setLists({ ...lists, question_categories: v })} /></Field>
      {canEdit && <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />}
    </section>
  );
}

function Members({ ctx }) {
  const { members, isOwner, project, actions } = ctx;
  const run = useRun();
  const people = useResource(`${BASE}/people`, null, { enabled: isOwner });
  const [list, setList, dirty, reset] = useDraft(members.map((m) => ({ user_id: m.user_id, role: m.role, name: m.name })));
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = (people.data?.items || []).filter((u) => u.id !== project.owner_id && !list.some((m) => m.user_id === u.id));
  const save = async () => {
    setBusy(true);
    const r = await put(`${BASE}/${project.id}/members`, { members: list.map(({ user_id, role }) => ({ user_id, role })) });
    setBusy(false);
    if (run(r, "Üyeler kaydedildi.")) actions.reload();
  };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="users" /> Üyeler</h2><span className="muted small">{list.length + 1} kişi</span></header>
      <ul className="member-list">
        <li><Avatar name={project.owner_name || "?"} size={28} /><span><strong>{project.owner_name}</strong><small>Proje sahibi</small></span><span className="pill pill--tool">{ROLE_LABEL.owner}</span></li>
        {list.map((m, i) => (
          <li key={m.user_id}>
            <Avatar name={m.name || "?"} size={28} />
            <span><strong>{m.name || `#${m.user_id}`}</strong><small>{m.role === "viewer" ? "Yalnız görür" : "Adım, kişi ve soru düzenler"}</small></span>
            {isOwner ? <select className="select-sm" value={m.role} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}><option value="editor">{ROLE_LABEL.editor}</option><option value="viewer">{ROLE_LABEL.viewer}</option></select> : <span className="pill">{ROLE_LABEL[m.role]}</span>}
            {isOwner && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Çıkar"><Icon name="x" size={12} /></button>}
          </li>
        ))}
      </ul>
      {isOwner ? (<>
        <div className="input-with-btn">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Üye ekle"><option value="">Yönetim kullanıcısı ekle…</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name}{u.city ? ` · ${u.city}` : ""}</option>)}</select>
          <button type="button" className="btn btn--sm" disabled={!adding} onClick={() => { const u = candidates.find((x) => String(x.id) === adding); if (u) setList([...list, { user_id: u.id, role: "editor", name: u.name }]); setAdding(""); }}>Ekle</button>
        </div>
        <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />
      </>) : <p className="muted small">Üyeleri yalnız proje sahibi değiştirir.</p>}
    </section>
  );
}

function Danger({ ctx, isOwner, onDeleted, openProject }) {
  const { project } = ctx;
  const run = useRun();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState(null);
  const saveTemplate = async (name) => { if (!name) return; if (run(await request({ method: "POST", path: `${BASE}/templates`, body: { project_id: project.id, name }, queue: false }), "Şablon kaydedildi; yeni projede seçebilirsiniz.")) setDialog(null); };
  const duplicate = async (name) => { const r = await request({ method: "POST", path: `${BASE}/${project.id}/duplicate`, body: { name: name || undefined }, queue: false }); if (run(r, "Kopya oluşturuldu.")) { setDialog(null); openProject(r.data.item.id); } };
  const remove = async () => {
    if (!(await confirm({ title: "Projeyi sil", message: `“${project.name}” ve tüm aşama, adım, kişi, soru ve iletişim kayıtları kalıcı olarak silinir. Portföy kayıtları silinmez.`, confirmLabel: "Projeyi sil", danger: true }))) return;
    if (run(await del(`${BASE}/${project.id}`), "Proje silindi.")) onDeleted();
  };
  const leave = async () => {
    if (!(await confirm({ title: "Projeden ayrıl", message: "Projeyi artık göremeyeceksiniz.", confirmLabel: "Ayrıl", danger: true }))) return;
    if (run(await del(`${BASE}/${project.id}/members/me`), "Projeden ayrıldınız.")) onDeleted();
  };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="copy" /> İşlemler</h2></header>
      <div className="action-list">
        <button type="button" className="info-box info-box--btn" onClick={() => setDialog("template")}><Icon name="layers" /><div><strong>Şablon olarak kaydet</strong><span className="muted small">Aşamalar, adımlar, roller ve ayarlar yeni projelerde kullanılır (kişiler ve kayıtlar alınmaz).</span></div></button>
        <button type="button" className="info-box info-box--btn" onClick={() => setDialog("duplicate")}><Icon name="copy" /><div><strong>Kopyasını oluştur</strong><span className="muted small">Aynı süreçle yeni bir proje açılır; durumlar sıfırlanır.</span></div></button>
        {isOwner ? <button type="button" className="info-box info-box--btn info-box--danger" onClick={remove}><Icon name="trash" /><div><strong>Projeyi sil</strong><span className="muted small">Geri alınamaz. Portföy kayıtları korunur.</span></div></button>
          : <button type="button" className="info-box info-box--btn info-box--danger" onClick={leave}><Icon name="logout" /><div><strong>Projeden ayrıl</strong><span className="muted small">Üyelikten çıkarsınız.</span></div></button>}
      </div>
      {dialog === "template" && <PromptDialog title="Şablon olarak kaydet" label="Şablon adı" initial={`${project.name} şablonu`} onClose={() => setDialog(null)} onSubmit={saveTemplate} />}
      {dialog === "duplicate" && <PromptDialog title="Kopyasını oluştur" label="Yeni projenin adı" initial={`${project.name} (kopya)`} confirmLabel="Oluştur" onClose={() => setDialog(null)} onSubmit={duplicate} />}
    </section>
  );
}
