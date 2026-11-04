// Ayarlar: proje bilgileri, bütçe ve muhasebe (varsayılan hesap, hesap
// yetkilileri), kişi ve tedarik aşamaları / görüşme sonuçları, roller → kişi,
// listeler, üyeler, saha ve maç planlama (proje sahaları, lig / sezon, maç
// hesabı, maç ücretleri, maç kontrol listesi); şablon olarak kaydet, kopyala,
// sil / ayrıl.
import React, { useEffect, useState } from "react";
import { Field, Icon, Modal, useConfirm } from "../../components/ui";
import { del, post, put, request, useResource } from "../../api";
import { PROJECT_COLORS, PROJECT_ICONS, leadsOfKind, slugKey } from "../../lib/projectUtils";
import { aclPayload, aclUpsert, projectTeamLevel } from "../../lib/financeUtils";
import { formatMoney } from "../../lib/helpers";
import { AccountSelectField, AclEditor } from "../../components/finance";
import { Avatar, BASE, FINANCE_EVENT, PromptDialog, ROLE_LABEL, TagEditor, useRun } from "./common";
import { useProjectFinance } from "./Budget";
import { parseAmount } from "../../lib/ledgerUtils";

export default function Settings({ ctx, onDeleted, openProject }) {
  const { canEdit, isOwner } = ctx;
  return (
    <div className="proj-section">
      {!canEdit && <div className="notice notice--warn"><Icon name="eye" size={14} /> Bu projeyi yalnız görüntüleyebilirsiniz; ayarları proje sahibi ya da düzenleyiciler değiştirir.</div>}
      <div className="settings-grid">
        <ProjectInfo ctx={ctx} />
        <FinanceSettings ctx={ctx} />
        <MatchPlanningSettings ctx={ctx} />
        <StagesEditor ctx={ctx} />
        <OutcomesEditor ctx={ctx} />
        <StagesEditor ctx={ctx} kind="supplier" />
        <OutcomesEditor ctx={ctx} kind="supplier" />
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

const KIND_KEYS = {
  customer: { stages: "lead_stages", outcomes: "outcomes", move: "move_stage_to", title: "Kişi aşamaları", sub: "CRM hunisi ve pano sütunları", icon: "users", noun: "kişi", outTitle: "Görüşme sonuçları", outSub: "Kişide tek tıkla kayıt düğmeleri" },
  supplier: { stages: "supplier_stages", outcomes: "supplier_outcomes", move: "move_supplier_stage_to", title: "Tedarik aşamaları", sub: "Fiyat al → değerlendir → anlaş", icon: "handshake", noun: "tedarikçi", outTitle: "Tedarik görüşme sonuçları", outSub: "Fiyat istendi, alındı, pazarlık…" },
};

function StagesEditor({ ctx, kind = "customer" }) {
  const { settings, canEdit, actions } = ctx;
  const K = KIND_KEYS[kind];
  const leads = leadsOfKind(ctx.leads, kind);
  const [stages, setStages, dirty, reset] = useDraft(settings[K.stages] || []);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(null);
  const set = (i, patch) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = async (moveTo) => {
    setBusy(true);
    // Silinen aşamaya giden görüşme sonuçları da güncellenir (yoksa sonuç kişiyi olmayan aşamaya taşır).
    const keys = new Set(stages.map((s) => s.key));
    const outcomes = (settings[K.outcomes] || []).map((o) => (!o.stage || keys.has(o.stage) ? o : { ...o, stage: moveTo || undefined }));
    const r = await actions.updateProject({ settings: { [K.stages]: stages, [K.outcomes]: outcomes }, ...(moveTo ? { [K.move]: moveTo } : {}) });
    setBusy(false);
    if (r?.error?.code === "STAGE_IN_USE") setConflict(r.error.message);
    else if (r?.ok) setConflict(null);
  };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name={K.icon} /> {K.title}</h2><span className="muted small">{K.sub}</span></header>
      <ul className="edit-list">
        {stages.map((s, i) => (
          <li key={s.key}>
            <input type="color" value={s.color || "#64748b"} disabled={!canEdit} onChange={(e) => set(i, { color: e.target.value })} aria-label="Renk" />
            <input value={s.label} disabled={!canEdit} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} />
            <small className="muted edit-list__count">{leads.filter((l) => l.stage === s.key).length} {K.noun}</small>
            <label className={`flag ${s.won ? "is-won" : ""}`} title={kind === "supplier" ? "Anlaşıldı aşaması" : "Kazanıldı aşaması"}><input type="checkbox" checked={Boolean(s.won)} disabled={!canEdit} onChange={(e) => set(i, { won: e.target.checked || undefined, lost: e.target.checked ? undefined : s.lost })} /> {kind === "supplier" ? "Anlaşıldı" : "Kazanıldı"}</label>
            <label className={`flag ${s.lost ? "is-lost" : ""}`} title={kind === "supplier" ? "Vazgeçildi aşaması" : "Kaybedildi aşaması"}><input type="checkbox" checked={Boolean(s.lost)} disabled={!canEdit} onChange={(e) => set(i, { lost: e.target.checked || undefined, won: e.target.checked ? undefined : s.won })} /> {kind === "supplier" ? "Vazgeçildi" : "Kayıp"}</label>
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
      {conflict && <MoveStageDialog message={conflict} stages={stages} noun={K.noun} onClose={() => setConflict(null)} onConfirm={(to) => save(to)} />}
    </section>
  );
}

function MoveStageDialog({ message, stages, noun = "kişi", onClose, onConfirm }) {
  const [to, setTo] = useState(stages[0]?.key || "");
  return (
    <Modal title={`Silinen aşamada ${noun === "kişi" ? "kişiler" : "tedarikçiler"} var`} onClose={onClose} width={440} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={() => onConfirm(to)}>Taşı ve kaydet</button></>}>
      <p className="muted">{message}</p>
      <Field label={`${noun === "kişi" ? "Kişiler" : "Tedarikçiler"} şu aşamaya taşınsın`}><select value={to} onChange={(e) => setTo(e.target.value)}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
    </Modal>
  );
}

function OutcomesEditor({ ctx, kind = "customer" }) {
  const { settings, canEdit, actions } = ctx;
  const K = KIND_KEYS[kind];
  const stagesList = settings[K.stages] || [];
  const [outcomes, setOutcomes, dirty, reset] = useDraft(settings[K.outcomes] || []);
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setOutcomes(outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const save = async () => { setBusy(true); await actions.updateProject({ settings: { [K.outcomes]: outcomes.map((o) => ({ ...o, next_days: o.next_days === "" ? null : o.next_days })) } }); setBusy(false); };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="zap" /> {K.outTitle}</h2><span className="muted small">{K.outSub}</span></header>
      <p className="muted small">{kind === "supplier" ? "Her sonuç tedarikçiyi seçilen aşamaya taşır ve sonraki dönüşü planlar. “Fiyat alındı” teklif tutarını sorar." : "Her sonuç kişiyi seçilen aşamaya taşır ve sonraki aramayı “gün sonra” saat 10:00'a planlar."}</p>
      <ul className="edit-list edit-list--outcomes">
        {outcomes.map((o, i) => (
          <li key={o.key}>
            <input value={o.label} disabled={!canEdit} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} aria-label="Sonuç adı" />
            <select value={o.stage || ""} disabled={!canEdit} onChange={(e) => set(i, { stage: e.target.value || undefined })} aria-label="Aşama"><option value="">Aşama değişmez</option>{stagesList.map((s) => <option key={s.key} value={s.key}>→ {s.label}</option>)}</select>
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

/**
 * Bütçe ve muhasebe: varsayılan proje hesabı ("Ödendi" yapılan kalemler buraya
 * işlenir) ve bu hesap(lar)ın yetkilileri — yönetebildiğiniz hesapta yetki
 * listesi burada da düzenlenir (Muhasebe → Yetkiler ile aynı).
 */
function FinanceSettings({ ctx }) {
  const { project, settings, canEdit, actions } = ctx;
  const run = useRun();
  const fin = useProjectFinance(project.id);
  const all = useResource("/api/finance/accounts", null, { enabled: canEdit });
  const options = useResource("/api/finance/access-options", null, { enabled: canEdit });
  const [busy, setBusy] = useState(false);
  const postable = fin.data?.accounts || [];
  const defaultId = settings.default_account_id ? String(settings.default_account_id) : "";
  const linkedIds = new Set([settings.default_account_id, ...(fin.data?.items || []).map((e) => e.account_id)].filter(Boolean).map(Number));
  const manageable = (all.data?.items || []).filter((a) => linkedIds.has(Number(a.id)) && !a.archived);
  const canCreateShared = Boolean(all.data?.access?.shared?.manage);
  const setDefault = async (v) => { setBusy(true); await actions.updateProject({ settings: { default_account_id: v ? Number(v) : null } }); setBusy(false); window.dispatchEvent(new Event(FINANCE_EVENT)); };
  const createAccount = async () => {
    setBusy(true);
    const r = await post("/api/finance/accounts", { scope: "shared", name: `${project.name} hesabı`.slice(0, 80), kind: "kasa", color: project.color, acl: [{ type: "project", id: project.id, level: "post" }] }, { queue: false });
    if (run(r, "Proje hesabı açıldı; proje ekibi bu hesaba kayıt girebilir.")) {
      await actions.updateProject({ settings: { default_account_id: r.data.item.id } });
      all.reload({ quiet: true }); fin.reload({ quiet: true });
    }
    setBusy(false);
  };
  return (
    <section className="card card--span2 finance-settings">
      <header className="card__head"><h2 className="card__title"><Icon name="wallet" /> Bütçe ve muhasebe</h2><span className="muted small">“Ödendi / tahsil edildi” yapılan kalemler hesaba işlenir</span></header>
      <div className="finance-settings__grid">
        <div className="finance-settings__default">
          <AccountSelectField accounts={postable} value={defaultId} onChange={setDefault} disabled={!canEdit || busy} label="Varsayılan proje hesabı" emptyLabel="Seçilmedi (kalemler hesaba işlenmez)"
            hint="Yeni bütçe kalemleri ve tedarik / satış kapanışları bu hesaba bağlanır. Yalnız kayıt girebildiğiniz hesaplar listelenir." />
          {canEdit && canCreateShared && <button type="button" className="info-box info-box--btn" disabled={busy} onClick={createAccount}><Icon name="plus" /><div><strong>Bu proje için ortak hesap aç</strong><span className="muted small">“{project.name} hesabı” açılır; yalnız siz, admin ve proje ekibi (kayıt girebilir) görür. Diğer muhasebe yetkilileri görmez.</span></div></button>}
          {!postable.length && !fin.loading && <p className="muted small"><Icon name="lock" size={12} /> Kayıt girebileceğiniz muhasebe hesabı yok. Muhasebe → Hesaplar'da hesap yöneticisi size ya da proje ekibine yetki verebilir.</p>}
        </div>
        <div className="finance-settings__acl">
          <span className="field__label">Muhasebe yetkilileri</span>
          {all.error ? <p className="muted small">Hesap yetkilerini yalnız muhasebe hesaplarına erişimi olan yönetim kullanıcıları görür.</p>
            : manageable.length ? manageable.map((a) => <AccountAclCard key={a.id} account={a} project={project} options={options.data} run={run} onSaved={() => all.reload({ quiet: true })} isDefault={String(a.id) === defaultId} />)
              : <p className="muted small">{linkedIds.size ? "Bu projenin hesaplarını yönetme yetkiniz yok; yetkileri hesabı yöneten kişi Muhasebe → Hesaplar → Yetkiler'den verir." : "Varsayılan hesap seçince o hesabın yetkililerini buradan yönetebilirsiniz."}</p>}
        </div>
      </div>
    </section>
  );
}

function AccountAclCard({ account, project, options, run, onSaved, isDefault }) {
  const can = account.can_manage;
  const [acl, setAcl] = useState(account.acl || []);
  const [busy, setBusy] = useState(false);
  useEffect(() => setAcl(account.acl || []), [JSON.stringify(account.acl || [])]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(aclPayload(acl)) !== JSON.stringify(aclPayload(account.acl || []));
  const team = projectTeamLevel(acl, project.id);
  const toggleTeam = (on) => setAcl(on ? aclUpsert(acl, { type: "project", id: project.id, level: "post", label: `${project.name} ekibi` }) : acl.filter((e) => !(e.type === "project" && Number(e.id) === Number(project.id))));
  const save = async () => {
    setBusy(true);
    const r = await put(`/api/finance/accounts/${account.id}/access`, { acl: aclPayload(acl) });
    setBusy(false);
    if (run(r, `${account.name}: yetkiler kaydedildi.`)) onSaved();
  };
  return (
    <div className="acl-card" style={{ "--ac": account.color || "#7c3aed" }}>
      <header>
        <span className="account-chip__icon"><Icon name={account.visibility === "restricted" ? "lock" : "bank"} size={13} /></span>
        <span><strong>{account.name}</strong><small>{isDefault ? "Varsayılan proje hesabı · " : ""}{account.visibility === "restricted" ? "Yalnız yetkililer görür" : "Kapsam yetkisine göre"} · {formatMoney(account.balance)}</small></span>
        <span className="spacer" />
        {can && <label className="toggle"><input type="checkbox" checked={Boolean(team)} onChange={(e) => toggleTeam(e.target.checked)} /> Proje ekibine yetki ver{team ? ` (${team === "view" ? "görür" : team === "post" ? "kayıt girer" : "yönetir"})` : ""}</label>}
      </header>
      {can ? <AclEditor value={acl} onChange={setAcl} options={options} compact /> : <p className="muted small">Bu hesabın yetkilerini yalnız hesabı yöneten değiştirir.</p>}
      {can && <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setAcl(account.acl || [])} />}
    </div>
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
  const [lists, setLists, dirty, reset] = useDraft({ portfolio_categories: settings.portfolio_categories, lead_sources: settings.lead_sources, supplier_categories: settings.supplier_categories || [], finance_categories: settings.finance_categories || [], question_categories: settings.question_categories });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); await actions.updateProject({ settings: lists }); setBusy(false); };
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name="tag" /> Listeler</h2></header>
      <Field label="Portföy kategorileri"><TagEditor value={lists.portfolio_categories} disabled={!canEdit} onChange={(v) => setLists({ ...lists, portfolio_categories: v })} /></Field>
      <Field label="Kişi kaynakları"><TagEditor value={lists.lead_sources} disabled={!canEdit} onChange={(v) => setLists({ ...lists, lead_sources: v })} /></Field>
      <Field label="Tedarik kategorileri"><TagEditor value={lists.supplier_categories} disabled={!canEdit} onChange={(v) => setLists({ ...lists, supplier_categories: v })} /></Field>
      <Field label="Bütçe (gelir / gider) kategorileri"><TagEditor value={lists.finance_categories} disabled={!canEdit} onChange={(v) => setLists({ ...lists, finance_categories: v })} /></Field>
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

/**
 * Saha ve maç planlama: sekmeyi açar; projenin sahaları (sitedeki saha ve maç
 * planlama sahaları), ili, ligleri / sezonları, lig maçlarının dahil edilmesi,
 * maç hesabı (ayrı muhasebe hesabı), maç başı ücretler ve maç kontrol listesi.
 */
function MatchPlanningSettings({ ctx }) {
  const { project, settings, canEdit, actions } = ctx;
  const run = useRun();
  const opts = useResource(`${BASE}/match-options`);
  const fin = useProjectFinance(project.id);
  const all = useResource("/api/finance/accounts", null, { enabled: canEdit });
  const src = settings.match_planning || {};
  const [mp, setMp, dirty, reset] = useDraft({
    enabled: Boolean(src.enabled), venue_ids: src.venue_ids || [], league_ids: src.league_ids || [], season_ids: src.season_ids || [], city_id: src.city_id || null,
    account_id: src.account_id || null, include_league_matches: src.include_league_matches !== false,
    fees: (src.fees || []).map((f) => ({ ...f, amount: f.amount == null ? "" : String(f.amount).replace(".", ",") })), checklist: src.checklist || [],
  });
  const [busy, setBusy] = useState(false);
  const o = opts.data || {};
  const perPer = o.fee_per || [{ key: "match", label: "Maç başı" }, { key: "home", label: "Ev sahibi takım" }, { key: "away", label: "Deplasman takımı" }, { key: "team", label: "Her iki takım (ayrı ayrı)" }];
  const toggleId = (key, id) => setMp({ ...mp, [key]: mp[key].map(Number).includes(Number(id)) ? mp[key].filter((x) => Number(x) !== Number(id)) : [...mp[key], Number(id)] });
  const venues = (o.venues || []).filter((v) => !mp.city_id || !v.city_id || Number(v.city_id) === Number(mp.city_id) || mp.venue_ids.map(Number).includes(Number(v.id)));
  const leagues = (o.leagues || []).filter((l) => !mp.city_id || !l.city_id || Number(l.city_id) === Number(mp.city_id) || mp.league_ids.map(Number).includes(Number(l.id)));
  const seasons = (o.seasons || []).filter((s) => (!mp.league_ids.length ? leagues.some((l) => Number(l.id) === Number(s.league_id)) || !s.league_id : mp.league_ids.map(Number).includes(Number(s.league_id))) || mp.season_ids.map(Number).includes(Number(s.id)));
  const setFee = (i, patchFee) => setMp({ ...mp, fees: mp.fees.map((f, j) => (j === i ? { ...f, ...patchFee } : f)) });
  const save = async () => {
    setBusy(true);
    await actions.updateProject({ settings: { match_planning: { ...mp, fees: mp.fees.map((f) => ({ ...f, amount: f.amount === "" ? 0 : parseAmount(f.amount) || 0 })) } } });
    setBusy(false);
  };
  const createAccount = async () => {
    setBusy(true);
    const r = await post("/api/finance/accounts", { scope: "shared", name: `${project.name} maç kasası`.slice(0, 80), kind: "kasa", color: project.color, acl: [{ type: "project", id: project.id, level: "post" }] }, { queue: false });
    if (run(r, "Maç kasası açıldı; maç ücretleri bu hesaba işlenir.")) {
      await actions.updateProject({ settings: { match_planning: { account_id: r.data.item.id } } });
      fin.reload({ quiet: true }); all.reload({ quiet: true });
    }
    setBusy(false);
  };
  const perms = o.permissions || {};
  return (
    <section className="card card--span2 match-settings">
      <header className="card__head"><h2 className="card__title"><Icon name="ball" /> Saha ve maç planlama</h2><span className="muted small">Sitedeki saha ve maç planlama (çağrı merkezi) bu projede</span></header>
      <label className="toggle"><input type="checkbox" checked={mp.enabled} disabled={!canEdit} onChange={(e) => setMp({ ...mp, enabled: e.target.checked })} /> <strong>“Saha ve maç” sekmesini aç</strong> — sahalar, program, talepler, takımlar ve projenin maçları</label>
      {!perms.venues_view && opts.data && <p className="notice notice--warn small"><Icon name="lock" size={12} /> Sahaları ve programı görmek için “Saha ve maç planlama” (venues.view) yetkisi gerekir; projenin maç listesi yetki olmadan da görünür.</p>}
      {mp.enabled && (
        <div className="match-settings__grid">
          <div>
            <Field label="İl"><select value={mp.city_id || ""} disabled={!canEdit} onChange={(e) => setMp({ ...mp, city_id: e.target.value ? Number(e.target.value) : null })}><option value="">Tüm iller</option>{(o.cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <span className="field__label">Proje sahaları <small className="muted">({mp.venue_ids.length} seçili)</small></span>
            <div className="chips match-settings__chips">{venues.map((v) => <button key={v.id} type="button" disabled={!canEdit} className={`chip ${mp.venue_ids.map(Number).includes(Number(v.id)) ? "" : "chip--off"}`} onClick={() => toggleId("venue_ids", v.id)}><Icon name="map" size={10} /> {v.name}{v.city ? ` · ${v.city}` : ""}{v.status !== "active" ? " (pasif)" : ""}</button>)}{!venues.length && <span className="muted small">{opts.loading ? "Yükleniyor…" : "Saha yok; Saha ve maç → Program → Sahalar'dan ekleyin."}</span>}</div>
            <span className="field__label">Ligler</span>
            <div className="chips match-settings__chips">{leagues.map((l) => <button key={l.id} type="button" disabled={!canEdit} className={`chip ${mp.league_ids.map(Number).includes(Number(l.id)) ? "" : "chip--off"}`} onClick={() => toggleId("league_ids", l.id)}>{l.name}</button>)}</div>
            <span className="field__label">Sezonlar</span>
            <div className="chips match-settings__chips">{seasons.map((s) => <button key={s.id} type="button" disabled={!canEdit} className={`chip ${mp.season_ids.map(Number).includes(Number(s.id)) ? "" : "chip--off"}`} onClick={() => toggleId("season_ids", s.id)}>{[s.league_name, s.name].filter(Boolean).join(" · ")}</button>)}</div>
            <label className="toggle"><input type="checkbox" checked={mp.include_league_matches} disabled={!canEdit} onChange={(e) => setMp({ ...mp, include_league_matches: e.target.checked })} /> Seçilen lig / sezonun proje tarihlerindeki bütün maçları projeye dahil olsun</label>
            <AccountSelectField accounts={fin.data?.accounts || []} value={mp.account_id ? String(mp.account_id) : ""} onChange={(v) => setMp({ ...mp, account_id: v ? Number(v) : null })} disabled={!canEdit} label="Maç hesabı (ayrı muhasebe hesabı)" emptyLabel="Varsayılan proje hesabı" hint="Maç ücretleri bu hesaba bağlanır; ödendi / tahsil edildi olunca bakiyeye işlenir." />
            {canEdit && all.data?.access?.shared?.manage && <button type="button" className="info-box info-box--btn" disabled={busy} onClick={createAccount}><Icon name="plus" /><div><strong>Bu proje için maç hesabı aç</strong><span className="muted small">“{project.name} maç kasası” ortak hesabı açılır ve proje ekibi kayıt girebilir.</span></div></button>}
          </div>
          <div>
            <span className="field__label">Maç ücretleri <small className="muted">(“Ücretleri bütçeye yaz” bu kalemleri yazar)</small></span>
            <ul className="edit-list fee-list">
              {mp.fees.map((f, i) => (
                <li key={f.key || i}>
                  <input value={f.label} disabled={!canEdit} maxLength={60} onChange={(e) => setFee(i, { label: e.target.value })} aria-label="Kalem adı" />
                  <select value={f.type} disabled={!canEdit} onChange={(e) => setFee(i, { type: e.target.value })} aria-label="Tür"><option value="income">Gelir</option><option value="expense">Gider</option></select>
                  <input className="fee-list__amount" inputMode="decimal" value={f.amount} disabled={!canEdit} placeholder="0" onChange={(e) => setFee(i, { amount: e.target.value })} aria-label="Tutar" />
                  <select value={f.per} disabled={!canEdit} onChange={(e) => setFee(i, { per: e.target.value })} aria-label="Kime">{perPer.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
                  {canEdit && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setMp({ ...mp, fees: mp.fees.filter((_, j) => j !== i) })} aria-label="Sil"><Icon name="trash" size={12} /></button>}
                </li>
              ))}
            </ul>
            {canEdit && mp.fees.length < 20 && <button type="button" className="board__addbtn" onClick={() => setMp({ ...mp, fees: [...mp.fees, { key: slugKey("Yeni ücret", mp.fees.map((f) => f.key)).replace(/-/g, "_"), label: "Yeni ücret", type: "income", amount: "", per: "match" }] })}><Icon name="plus" size={13} /> Ücret kalemi ekle</button>}
            <Field label="Maç kontrol listesi (her maçta işaretlenir)"><TagEditor value={mp.checklist} disabled={!canEdit} onChange={(v) => setMp({ ...mp, checklist: v })} placeholder="Madde ekle ve ↩" /></Field>
          </div>
        </div>
      )}
      {canEdit && <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />}
    </section>
  );
}
