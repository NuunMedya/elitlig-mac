// Hesap hareketleri ve hesap yetkileri için ortak parçalar: Muhasebe (Hesaplar)
// ve Projeler (Bütçe, Ayarlar → Muhasebe yetkilileri) aynı bileşenleri kullanır.
import React, { useMemo, useState } from "react";
import { Field, Icon, Modal, Segmented, Spinner } from "./ui";
import { put, useResource } from "../api";
import { formatMoney, includesTr, isoDay } from "../lib/helpers";
import { parseAmount } from "../lib/ledgerUtils";
import { ENTRY_STATUS_TONE, LEVEL_HINT, LEVEL_LABEL, aclKey, aclPayload, aclUpsert, entryBody, entryStatusLabel, entryValid, groupAccounts } from "../lib/financeUtils";

export const EntryStatusPill = ({ entry, small = false }) => (
  <span className={`pill ${ENTRY_STATUS_TONE[entry.status] ? `pill--${ENTRY_STATUS_TONE[entry.status]}` : ""} ${small ? "pill--xs" : ""} ${entry.status === "cancelled" ? "is-struck" : ""}`}>{entryStatusLabel(entry)}</span>
);

/** Kapsama göre gruplu hesap seçici. emptyLabel verilirse "hesapsız" seçeneği olur. */
export function AccountSelectField({ accounts, value, onChange, label = "Hesap", emptyLabel = "Hesap seçin…", hint, className = "", disabled, showBalance = true }) {
  const groups = useMemo(() => groupAccounts(accounts, { postable: true }), [accounts]);
  const known = accounts.some((a) => String(a.id) === String(value));
  return (
    <Field label={label} hint={hint} className={className}>
      <select value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {value && !known && <option value={value}>Hesap #{value} (erişiminiz yok)</option>}
        {groups.map((g) => (
          <optgroup key={g.scope} label={g.label}>
            {g.items.map((a) => <option key={a.id} value={a.id}>{a.name}{a.city_name ? ` · ${a.city_name}` : ""}{showBalance && a.balance != null ? ` — ${formatMoney(a.balance)}` : ""}</option>)}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

/**
 * Gelir / gider kaydı (hesap hareketi ya da proje bütçe kalemi).
 * onSave(body) → Promise<boolean>; true dönerse pencere kapanır.
 * links: { leads: [{id, label}], steps: [{id, label}] } — proje bütçesinde.
 */
export function EntryDialog({ entry, draft = {}, accounts = [], categories = [], links = null, onClose, onSave, onDelete, accountRequired = true, accountHint }) {
  const src = entry || draft;
  const str = (v) => (v == null ? "" : String(v).replace(".", ","));
  const [form, setForm] = useState({
    type: src.type || "expense",
    amount: str(src.amount),
    estimate: str(src.estimate),
    status: src.status || (src.amount != null ? "pending" : "planned"),
    entry_date: src.entry_date || isoDay(),
    due_date: src.due_date || "",
    paid_date: src.paid_date || "",
    category: src.category || "",
    party: src.party || "",
    description: src.description || "",
    document_no: src.document_no || "",
    note: src.note || "",
    account_id: src.account_id ? String(src.account_id) : "",
    ...(links ? { lead_id: src.lead_id ? String(src.lead_id) : "", step_id: src.step_id ? String(src.step_id) : "" } : {}),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const body = entryBody(form, parseAmount);
  const account = accounts.find((a) => String(a.id) === form.account_id);
  const valid = entryValid(body) && (!accountRequired || body.account_id);
  const effective = body.amount ?? body.estimate ?? 0;
  const income = form.type === "income";
  const save = async (e) => {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSave(body);
    setBusy(false);
    if (ok) onClose();
  };
  const statuses = [
    { value: "planned", label: "Tahmin" },
    { value: "pending", label: "Bekliyor" },
    { value: "paid", label: income ? "Tahsil edildi" : "Ödendi" },
    ...(entry ? [{ value: "cancelled", label: "İptal" }] : []),
  ];
  return (
    <Modal title={entry ? `${income ? "Gelir" : "Gider"} kaydını düzenle` : income ? "Yeni gelir" : "Yeni gider"} onClose={onClose} width={640} className="entry-dialog"
      footer={<>
        {entry && onDelete && <button type="button" className="btn btn--danger-ghost" onClick={() => onDelete(entry)}><Icon name="trash" /> Sil</button>}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="submit" form="entry-form" className={`btn ${income ? "btn--green" : "btn--red"}`} disabled={!valid || busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
      </>}>
      <form id="entry-form" className="form-grid" onSubmit={save}>
        <div className="span2 entry-dialog__top">
          <Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: "income", label: "Gelir", icon: "trend" }, { value: "expense", label: "Gider", icon: "receipt" }]} ariaLabel="Tür" />
          <Segmented size="sm" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={statuses} ariaLabel="Durum" />
        </div>
        <Field label={form.status === "planned" ? "Tutar (₺, biliniyorsa)" : "Tutar (₺)"} hint={form.status === "paid" && !body.amount && body.estimate ? "Boş bırakılırsa tahmini tutar işlenir." : ""}>
          <input className="money-input" autoFocus inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0,00" />
        </Field>
        <Field label="Tahmini tutar (₺)" hint="Bütçe planı; gerçek tutar girilince o sayılır.">
          <input inputMode="decimal" value={form.estimate} onChange={set("estimate")} placeholder="0,00" />
        </Field>
        <AccountSelectField accounts={accounts} value={form.account_id} onChange={(v) => setForm({ ...form, account_id: v })} className="span2"
          emptyLabel={accountRequired ? "Hesap seçin…" : "Hesapsız (yalnız bütçede)"} hint={accountHint || (account ? `“Ödendi” olduğunda ${account.name} bakiyesine ${income ? "eklenir" : "düşer"}; tahmin ve bekleyenler bakiyeyi etkilemez.` : "")} />
        <Field label="Kayıt tarihi"><input type="date" value={form.entry_date} onChange={set("entry_date")} /></Field>
        {form.status === "paid"
          ? <Field label={income ? "Tahsil tarihi" : "Ödeme tarihi"} hint="Boşsa bugün."><input type="date" value={form.paid_date} onChange={set("paid_date")} /></Field>
          : <Field label="Vade tarihi"><input type="date" value={form.due_date} onChange={set("due_date")} /></Field>}
        <Field label="Kategori">
          <input list="entry-cats" value={form.category} onChange={set("category")} placeholder="Seçin ya da yazın" maxLength={60} />
          <datalist id="entry-cats">{[...new Set(categories)].map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Cari (kişi / kurum)"><input value={form.party} onChange={set("party")} placeholder={income ? "örn. Spor Mağazası" : "örn. Kupa Dünyası"} maxLength={160} /></Field>
        <Field label="Açıklama" className="span2"><input value={form.description} onChange={set("description")} placeholder={income ? "örn. Ana sponsor 1. taksit" : "örn. Kupa ve madalya siparişi"} maxLength={255} /></Field>
        {links && (<>
          <Field label="Bağlı kişi / tedarikçi"><select value={form.lead_id} onChange={set("lead_id")}><option value="">—</option>{links.leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></Field>
          <Field label="Bağlı adım"><select value={form.step_id} onChange={set("step_id")}><option value="">—</option>{links.steps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        </>)}
        <Field label="Belge no"><input value={form.document_no} onChange={set("document_no")} placeholder="Fatura / makbuz" maxLength={60} /></Field>
        <div className={`entry-dialog__sum ${income ? "is-income" : "is-expense"}`}>
          <small>{form.status === "paid" ? (income ? "Hesaba girecek" : "Hesaptan çıkacak") : "Bütçede"}</small>
          <strong>{income ? "+" : "−"}{formatMoney(effective)}</strong>
        </div>
        <Field label="Not" className="span2"><textarea rows={2} value={form.note} onChange={set("note")} /></Field>
      </form>
    </Modal>
  );
}

/* ------------------------------- yetkiler ------------------------------- */

const TYPE_TAG = { user: "Kullanıcı", role: "Rol", project: "Proje ekibi" };
const TYPE_ICON = { user: "user", role: "team", project: "folder" };

/** Yetki listesi düzenleyici: kullanıcı (aranabilir), rol ya da proje ekibi + düzey. */
export function AclEditor({ value = [], onChange, options, disabled = false, compact = false }) {
  const [type, setType] = useState("user");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");
  const [level, setLevel] = useState("view");
  const users = options?.users || [];
  const roles = options?.roles || [];
  const projects = options?.projects || [];
  const taken = new Set(value.map(aclKey));
  const userHits = useMemo(() => users.filter((u) => !u.me && !taken.has(`user:${u.id}`) && (!q || includesTr(`${u.name} ${u.username} ${u.role_label} ${u.city || ""}`, q))).slice(0, 8), [users, q, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (entry) => { onChange(aclUpsert(value, entry)); setQ(""); setPick(""); };
  const labelOf = (e) => e.label || (e.type === "user" ? users.find((u) => Number(u.id) === Number(e.id))?.name : e.type === "role" ? `${roles.find((r) => r.key === e.role)?.label || e.role} (rol)` : `${projects.find((p) => Number(p.id) === Number(e.id))?.name || "Proje"} ekibi`) || `#${e.id}`;
  return (
    <div className={`acl ${compact ? "acl--compact" : ""}`}>
      <ul className="acl__list">
        {value.map((e) => (
          <li key={aclKey(e)}>
            <span className="acl__icon"><Icon name={TYPE_ICON[e.type]} size={13} /></span>
            <span className="acl__name"><strong>{labelOf(e)}</strong><small>{TYPE_TAG[e.type]}</small></span>
            <select className="select-sm" value={e.level} disabled={disabled} onChange={(ev) => onChange(value.map((x) => (aclKey(x) === aclKey(e) ? { ...x, level: ev.target.value } : x)))} aria-label="Yetki düzeyi">
              {Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {!disabled && <button type="button" className="icon-btn icon-btn--xs" onClick={() => onChange(value.filter((x) => aclKey(x) !== aclKey(e)))} aria-label="Yetkiyi kaldır"><Icon name="x" size={12} /></button>}
          </li>
        ))}
        {!value.length && <li className="acl__empty muted small">Henüz kimseye özel yetki verilmedi.</li>}
      </ul>
      {!disabled && (
        <div className="acl__add">
          <Segmented size="sm" value={type} onChange={(v) => { setType(v); setPick(""); setQ(""); }} options={[{ value: "user", label: "Kullanıcı", icon: "user" }, { value: "role", label: "Rol", icon: "team" }, { value: "project", label: "Proje ekibi", icon: "folder" }]} ariaLabel="Yetki türü" />
          <div className="acl__row">
            {type === "user" && (
              <div className="acl__search">
                <div className="search-box search-box--full"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, kullanıcı adı, rol, il…" aria-label="Kullanıcı ara" /></div>
                {options ? (
                  <div className="pick-list acl__hits">
                    {userHits.map((u) => (
                      <button key={u.id} type="button" onClick={() => add({ type: "user", id: u.id, level, label: u.name })}>
                        <span><strong>{u.name}</strong> <small>{[u.role_label, u.city].filter(Boolean).join(" · ")}</small></span>
                        <span className="pill pill--xs pill--tool"><Icon name="plus" size={10} /> {LEVEL_LABEL[level]}</span>
                      </button>
                    ))}
                    {!userHits.length && <p className="muted small">{q ? "Eşleşen yönetim kullanıcısı yok." : "Tüm kullanıcılar eklendi."}</p>}
                  </div>
                ) : <Spinner label="Kullanıcılar yükleniyor…" />}
              </div>
            )}
            {type === "role" && (
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Rol"><option value="">Rol seçin…</option>{roles.filter((r) => !taken.has(`role:${r.key}`)).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
            )}
            {type === "project" && (
              projects.length
                ? <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Proje"><option value="">Proje seçin…</option>{projects.filter((p) => !taken.has(`project:${p.id}`)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                : <p className="muted small">Ekibine yetki verebileceğiniz (düzenleyebildiğiniz) proje yok.</p>
            )}
            <select className="acl__level" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Düzey">{Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {type !== "user" && <button type="button" className="btn btn--sm btn--primary" disabled={!pick} onClick={() => add(type === "role" ? { type, role: pick, level } : { type, id: Number(pick), level })}><Icon name="plus" size={12} /> Ekle</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export const LevelLegend = () => (
  <div className="level-legend">
    {Object.entries(LEVEL_LABEL).map(([k, l]) => <div key={k}><strong>{l}</strong><small>{LEVEL_HINT[k]}</small></div>)}
  </div>
);

/** Hesabın görünürlüğü ve yetki listesi (yalnız yönetebilen). onSaved(item) */
export function AccessDialog({ account, onClose, onSaved, run }) {
  const options = useResource("/api/finance/access-options");
  const [visibility, setVisibility] = useState(account.visibility === "restricted" ? "restricted" : "scope");
  const [acl, setAcl] = useState(account.acl || []);
  const [busy, setBusy] = useState(false);
  const shared = account.scope === "shared";
  const save = async () => {
    setBusy(true);
    const res = await put(`/api/finance/accounts/${account.id}/access`, { visibility: shared ? undefined : visibility, acl: aclPayload(acl) });
    setBusy(false);
    if (run(res, "Yetkiler kaydedildi.")) onSaved?.(res.data?.item);
  };
  const restricted = shared || visibility === "restricted";
  return (
    <Modal title={`${account.name} — yetkiler`} onClose={onClose} width={680} className="access-dialog"
      footer={<><span className="muted small spacer"><Icon name="lock" size={12} /> Yetkisi olmayanlar bu hesabı, bakiyesini ve hareketlerini hiç görmez.</span><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></>}>
      {shared ? (
        <div className="info-box"><Icon name="lock" /><div><strong>Ortak / proje hesabı</strong><span className="muted small">Bu hesabı yalnız açan kişi, admin ve aşağıda yetki verilenler görür. Kapsam (il / Türkiye geneli) yetkisi bu hesaba erişim vermez.</span></div></div>
      ) : (
        <div className="access-dialog__vis">
          <span className="field__label">Kimler görebilir?</span>
          <div className="vis-options">
            <button type="button" className={`vis-option ${visibility === "scope" ? "is-on" : ""}`} onClick={() => setVisibility("scope")}>
              <Icon name="users" size={16} /><strong>Kapsam yetkisine göre</strong>
              <small>{account.scope === "personal" ? "Siz ve aşağıdakiler." : `${account.scope === "city" ? "İlin" : "Türkiye geneli"} muhasebe yetkisi olanlar ve aşağıdakiler.`}</small>
            </button>
            <button type="button" className={`vis-option ${visibility === "restricted" ? "is-on" : ""}`} onClick={() => setVisibility("restricted")}>
              <Icon name="lock" size={16} /><strong>Yalnız seçilen kişiler</strong>
              <small>Hesabı açan, admin ve aşağıda yetki verilenler. Diğer muhasebe yetkilileri görmez.</small>
            </button>
          </div>
        </div>
      )}
      <div className="access-dialog__acl">
        <span className="field__label">Özel yetkiler {restricted ? "" : "(kapsam yetkisine ek)"}</span>
        <AclEditor value={acl} onChange={setAcl} options={options.data} />
      </div>
      <LevelLegend />
      {options.error && <p className="muted small">Kişi listesi alınamadı: {options.error.message}</p>}
    </Modal>
  );
}
