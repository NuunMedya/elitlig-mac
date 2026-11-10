// Hesaplar ve Virman: kişisel, il, Türkiye geneli ve ortak / proje kasa-banka
// hesapları; bakiyeler, hesaba doğrudan gelir / gider (tahmin → bekliyor →
// ödendi), hesap bazlı yetkiler, hesaplar arası aktarma ve hesap ekstresi.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { AccessDialog, AclEditor, EntryDialog, EntryStatusPill, LevelLegend } from "../../components/finance";
import { del, patch, post, tempId, useResource } from "../../api";
import { formatDate, isoDay } from "../../lib/helpers";
import { SCOPE_ORDER, accessBadge, accountActions, aclPayload, entryTotals, filterFinanceEntries, markPaidPatch, payLabel } from "../../lib/financeUtils";
import { ACCOUNT_COLORS, ACCOUNT_KINDS, Kpi, SCOPE_LABEL, TransferDialog, money, signed } from "./common";

const SCOPE_TONE = { personal: "blue", city: "green", national: "amber", shared: "" };

export default function Accounts({ accountsRes }) {
  const result = useResult();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [detail, setDetail] = useState(null); // { account, tab }
  const [entry, setEntry] = useState(null); // { account, draft }
  const [access, setAccess] = useState(null);
  const [scopeFilter, setScopeFilter] = useState("all");
  const transfers = useResource("/api/finance/transfers");
  const d = accountsRes.data;
  const accounts = useMemo(() => (d?.items || []).filter((a) => !a.archived), [d]);
  const postable = useMemo(() => accounts.filter((a) => a.can_post), [accounts]);
  const shown = accounts.filter((a) => scopeFilter === "all" || a.scope === scopeFilter);
  const reload = () => { accountsRes.reload({ quiet: true }); transfers.reload({ quiet: true }); };

  if (accountsRes.loading && !d) return <Spinner />;
  if (accountsRes.error && !d) return <ErrorNote error={accountsRes.error} onRetry={accountsRes.reload} />;

  // Yalnız görülebilen hesapların kapsamları gösterilir (sunucu zaten süzer).
  const scopes = SCOPE_ORDER.filter((s) => accounts.some((a) => a.scope === s) || (s !== "shared" && d?.access?.[s]?.view));
  const creatable = SCOPE_ORDER.filter((s) => d?.access?.[s]?.manage);
  const pending = accounts.reduce((t, a) => ({ income: t.income + (a.pending?.income || 0), expense: t.expense + (a.pending?.expense || 0) }), { income: 0, expense: 0 });
  const categories = [...new Set(["Sponsorluk", "Katılım ücreti", "Aidat", "Bilet / satış", "Tesis / saha", "Hakem", "Personel", "Ekipman", "Ödül", "Reklam / tanıtım", "Ulaşım", "Diğer"])];

  const saveEntry = async (body, current) => {
    const res = current?.id ? await patch(`/api/finance/entries/${current.id}`, body) : await post("/api/finance/entries", body, { tempId: tempId() });
    const acc = accounts.find((a) => String(a.id) === String(body.account_id));
    const ok = result(res, current?.id ? "Kayıt güncellendi." : body.status === "paid" && acc ? `Hesaba işlendi: ${acc.name}` : "Kayıt eklendi.");
    if (ok) reload();
    return ok;
  };
  const removeAccount = async (a) => {
    if (await confirm({ title: "Hesabı kaldır", message: "Hareketi ya da virmanı olan hesap arşivlenir, olmayan silinir.", confirmLabel: "Kaldır", danger: true }) && result(await del(`/api/finance/accounts/${a.id}`), "Hesap kaldırıldı.")) reload();
  };

  return (
    <div className="acc-section">
      <div className="kpis">
        <Kpi hero label="Toplam bakiye" value={money(d.totals?.all || 0)} hint={`${accounts.length} hesap`} icon="bank" />
        {scopes.map((s) => <Kpi key={s} label={`${SCOPE_LABEL[s]} hesaplar`} value={money(d.totals?.[s] || 0)} tone={SCOPE_TONE[s]} hint={`${accounts.filter((a) => a.scope === s).length} hesap`} />)}
        {(pending.income > 0 || pending.expense > 0) && <Kpi label="Bekleyen / tahmin" value={signed(pending.income - pending.expense)} hint={`+${money(pending.income, 0)} gelir · −${money(pending.expense, 0)} gider`} icon="clock" />}
      </div>

      <div className="filters">
        <Segmented value={scopeFilter} onChange={setScopeFilter} size="sm" options={[{ value: "all", label: "Tümü", count: accounts.length }, ...scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s], count: accounts.filter((a) => a.scope === s).length }))]} />
        <span className="spacer" />
        {postable.length > 0 && <>
          <button type="button" className="btn btn--green" onClick={() => setEntry({ draft: { type: "income", account_id: shown.find((a) => a.can_post)?.id } })}><Icon name="plus" /> Gelir</button>
          <button type="button" className="btn btn--red" onClick={() => setEntry({ draft: { type: "expense", account_id: shown.find((a) => a.can_post)?.id } })}><Icon name="plus" /> Gider</button>
        </>}
        <button type="button" className="btn btn--soft" disabled={accounts.filter((a) => a.can_manage).length < 2} onClick={() => setTransfer({})}><Icon name="swap" /> Virman yap</button>
        {creatable.length > 0 && <button type="button" className="btn btn--primary" onClick={() => setEditing({})}><Icon name="plus" /> Hesap aç</button>}
      </div>

      {shown.length ? (
        <div className="account-grid">
          {shown.map((a) => {
            const can = accountActions(a);
            const badge = accessBadge(a);
            const hasPending = (a.pending?.income || 0) + (a.pending?.expense || 0) > 0;
            return (
              <article key={a.id} className="account-card" style={{ "--ac": a.color || "#7c3aed" }}>
                <header>
                  <span className="account-card__icon"><Icon name={ACCOUNT_KINDS[a.kind]?.icon || "wallet"} size={18} /></span>
                  <div>
                    <strong>{a.name}</strong>
                    <small>{SCOPE_LABEL[a.scope]}{a.city_name ? ` · ${a.city_name}` : ""} · {ACCOUNT_KINDS[a.kind]?.label}</small>
                  </div>
                  <MenuButton label="Hesap işlemleri" items={[
                    can.post && { label: "Gelir ekle", icon: "plus", onClick: () => setEntry({ draft: { type: "income", account_id: a.id } }) },
                    can.post && { label: "Gider ekle", icon: "receipt", onClick: () => setEntry({ draft: { type: "expense", account_id: a.id } }) },
                    { label: "Hareketler", icon: "list", onClick: () => setDetail({ account: a, tab: "entries" }) },
                    { label: "Ekstre", icon: "printer", onClick: () => setDetail({ account: a, tab: "statement" }) },
                    can.transfer && "-",
                    can.transfer && { label: "Buradan virman", icon: "swap", onClick: () => setTransfer({ defaults: { from: a.id } }) },
                    can.transfer && { label: "Buraya virman", icon: "swap", onClick: () => setTransfer({ defaults: { to: a.id } }) },
                    can.edit && "-",
                    can.edit && { label: "Düzenle", icon: "sliders", onClick: () => setEditing(a) },
                    can.access && { label: "Yetkiler", icon: "lock", onClick: () => setAccess(a) },
                    can.remove && "-",
                    can.remove && { label: "Arşivle / sil", icon: "trash", danger: true, onClick: () => removeAccount(a) },
                  ]} />
                </header>
                <button type="button" className="account-card__balance" onClick={() => setDetail({ account: a, tab: "entries" })}>
                  <span>Bakiye</span>
                  <strong className={a.balance < 0 ? "text-red" : ""}>{money(a.balance)}</strong>
                </button>
                <dl className="account-card__parts">
                  <div><dt>Gelir</dt><dd className={a.income ? "text-green" : ""}>{money(a.income || 0, 0)}</dd></div>
                  <div><dt>Gider</dt><dd className={a.expense ? "text-red" : ""}>{money(a.expense || 0, 0)}</dd></div>
                  <div><dt>Virman</dt><dd>{signed(a.transfersIn - a.transfersOut)}</dd></div>
                </dl>
                {hasPending && (
                  <button type="button" className="account-card__pending" onClick={() => setDetail({ account: a, tab: "entries", status: "open" })} title="Tahmin ve bekleyen kayıtlar bakiyeye henüz yansımadı">
                    <Icon name="clock" size={12} /> Bekleyen / tahmin
                    {a.pending.income > 0 && <b className="text-green">+{money(a.pending.income, 0)}</b>}
                    {a.pending.expense > 0 && <b className="text-red">−{money(a.pending.expense, 0)}</b>}
                  </button>
                )}
                <div className="account-card__foot">
                  {a.linked_method ? <span className="pill pill--tool"><Icon name="link" size={11} /> {(d.methods?.[a.scope] || []).find((m) => m.key === a.linked_method)?.label} bağlı</span> : <span className="pill">Doğrudan kayıt</span>}
                  {badge && <button type="button" className={`pill pill--${badge.tone}`} disabled={!can.access} onClick={() => setAccess(a)} title="Yetkiler"><Icon name={badge.icon} size={10} /> {badge.text}</button>}
                  {a.level !== "manage" && <span className="pill pill--xs" title="Bu hesaptaki yetkiniz">{a.level === "post" ? "Kayıt girebilirsiniz" : "Yalnız görüntüleme"}</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty icon="bank" title="Henüz hesap yok" text="Kasa, banka ya da kart hesabı açın. Gelir ve giderleri doğrudan hesaba girebilir ya da hesabı bir ödeme yöntemine bağlayabilirsiniz." action={creatable.length > 0 && <button type="button" className="btn btn--primary" onClick={() => setEditing({})}><Icon name="plus" /> İlk hesabı aç</button>} />
      )}

      <section className="card">
        <header className="card__head"><h3 className="card__title"><span className="card__icon"><Icon name="swap" size={15} /></span> Son virmanlar</h3></header>
        {transfers.data?.items?.length ? (
          <div className="table-wrap card--flat" style={{ boxShadow: "none" }}>
            <table className="table">
              <thead><tr><th>Tarih</th><th>Kaynak</th><th /><th>Hedef</th><th>Açıklama</th><th className="num">Tutar</th><th /></tr></thead>
              <tbody>
                {transfers.data.items.slice(0, 50).map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.transfer_date)}</td>
                    <td><strong>{t.from_name}</strong></td>
                    <td className="muted"><Icon name="chevronRight" size={14} /></td>
                    <td><strong>{t.to_name}</strong></td>
                    <td className="muted">{t.note || ""}</td>
                    <td className="num"><strong>{money(t.amount)}</strong></td>
                    <td className="row-actions">
                      <MenuButton items={[
                        { label: "Düzenle", icon: "sliders", onClick: () => setTransfer({ transfer: t }) },
                        { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Virmanı sil", message: `${money(t.amount)} tutarındaki virman silinsin mi? Bakiyeler geri alınır.`, confirmLabel: "Sil", danger: true }) && result(await del(`/api/finance/transfers/${t.id}`), "Virman silindi.")) reload(); } },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted small">Henüz virman yok.</p>}
      </section>

      {editing && <AccountEditor account={editing.id ? editing : null} meta={d} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {transfer && <TransferDialog accounts={accounts} transfer={transfer.transfer} defaults={transfer.defaults} onClose={() => setTransfer(null)} onSaved={() => { setTransfer(null); reload(); }} />}
      {detail && <AccountDetail account={accounts.find((a) => a.id === detail.account.id) || detail.account} initialTab={detail.tab} initialStatus={detail.status} postable={postable} categories={categories} onChanged={reload} onClose={() => setDetail(null)} onAccess={(a) => setAccess(a)} />}
      {entry && <EntryDialog draft={entry.draft} entry={entry.entry} accounts={postable} categories={categories} onClose={() => setEntry(null)} onSave={(body) => saveEntry(body, entry.entry)} />}
      {access && <AccessDialog account={access} run={result} onClose={() => setAccess(null)} onSaved={() => { setAccess(null); reload(); }} />}
    </div>
  );
}

function AccountEditor({ account, meta, onClose, onSaved }) {
  const result = useResult();
  const scopes = SCOPE_ORDER.filter((s) => meta.access?.[s]?.manage);
  const options = useResource("/api/finance/access-options", null, { enabled: !account });
  const [form, setForm] = useState({
    scope: account?.scope || scopes[0] || "personal",
    city_id: String(account?.city_id || meta.cities?.[0]?.id || ""),
    name: account?.name || "",
    kind: account?.kind || "kasa",
    linked_method: account?.linked_method || "",
    opening_balance: account ? String(account.opening_balance).replace(".", ",") : "0",
    opening_date: account?.opening_date || isoDay(),
    color: account?.color || ACCOUNT_COLORS[0],
    note: account?.note || "",
  });
  const [acl, setAcl] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const methods = meta.methods?.[form.scope] || [];
  const used = new Set((meta.items || []).filter((a) => !a.archived && a.scope === form.scope && a.id !== account?.id && (form.scope !== "city" || String(a.city_id) === form.city_id) && a.linked_method).map((a) => a.linked_method));
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = { ...form, city_id: form.scope === "city" ? Number(form.city_id) : undefined, linked_method: form.linked_method || null };
    if (account) { delete body.scope; delete body.city_id; } else if (acl.length) body.acl = aclPayload(acl);
    const res = account ? await patch(`/api/finance/accounts/${account.id}`, body) : await post("/api/finance/accounts", body, { queue: false });
    setBusy(false);
    if (result(res, account ? "Hesap güncellendi." : "Hesap açıldı.")) onSaved();
  };
  const SCOPE_TEXT = { personal: "Kişisel", city: "İl", national: "Türkiye geneli", shared: "Ortak / proje" };
  const SCOPE_HINT = {
    personal: "Ön Muhasebe defterinin hesabı; yalnız siz görürsünüz.",
    city: "Maç Muhasebesi (il defteri) hesabı; ilin muhasebe yetkilileri görür.",
    national: "Türkiye geneli muhasebe hesabı; Türkiye geneli yetkilileri görür.",
    shared: "Yalnız yetki verilenler görür — ör. bir organizasyonun (Elit Junior Cup) hesabı. İl ya da Türkiye geneli muhasebe yetkisi bu hesabı göstermez.",
  };
  return (
    <Modal title={account ? "Hesabı düzenle" : "Yeni hesap"} onClose={onClose} width={640} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="account-form" className="btn btn--primary" disabled={busy || !form.name.trim()}>Kaydet</button>
    </>}>
      <form id="account-form" className="form-grid" onSubmit={save}>
        {!account && (
          <div className="span2 account-form__scope">
            <span className="field__label">Hangi defterin hesabı?</span>
            <Segmented value={form.scope} onChange={(v) => setForm({ ...form, scope: v, linked_method: "" })} options={scopes.map((s) => ({ value: s, label: SCOPE_TEXT[s], icon: s === "shared" ? "lock" : undefined }))} />
            <p className="field__hint account-form__scope-hint">{SCOPE_HINT[form.scope]}</p>
          </div>
        )}
        {!account && form.scope === "city" && (
          <Field label="İl" className="span2"><select value={form.city_id} onChange={set("city_id")}>{(meta.cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        )}
        <Field label="Hesap adı"><input autoFocus value={form.name} onChange={set("name")} placeholder={form.scope === "shared" ? "örn. Elit Junior Cup kasası" : "örn. Ankara il kasası"} /></Field>
        <Field label="Tür"><select value={form.kind} onChange={set("kind")}>{(meta.kinds || []).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
        {methods.length > 0 && (
          <Field label="Defterden bağlanan ödeme yöntemi" className="span2" hint="Seçilen yöntemle ödenmiş/tahsil edilmiş defter kayıtları bu hesabın bakiyesine eklenir. Bir yöntem tek hesaba bağlanabilir. Hesaba doğrudan gelir / gider de girebilirsiniz.">
            <select value={form.linked_method} onChange={set("linked_method")}>
              <option value="">Bağlama (doğrudan kayıt + virman)</option>
              {methods.map((m) => <option key={m.key} value={m.key} disabled={used.has(m.key)}>{m.label}{used.has(m.key) ? " (başka hesaba bağlı)" : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Açılış bakiyesi (₺)"><input inputMode="decimal" value={form.opening_balance} onChange={set("opening_balance")} /></Field>
        <Field label="Açılış tarihi" hint="Bu tarihten önceki kayıtlar sayılmaz."><input type="date" value={form.opening_date || ""} onChange={set("opening_date")} /></Field>
        <Field label="Renk" className="span2"><div className="color-dots color-dots--lg">{ACCOUNT_COLORS.map((c) => <button key={c} type="button" className={form.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={`Renk ${c}`} aria-pressed={form.color === c} />)}</div></Field>
        <Field label="Not" className="span2"><input value={form.note} onChange={set("note")} placeholder="IBAN, şube, sorumlu…" /></Field>
        {!account && (
          <div className="span2 account-form__acl">
            <span className="field__label">{form.scope === "shared" ? "Kimler görebilsin?" : "Ek yetkiler (isteğe bağlı)"}</span>
            <AclEditor value={acl} onChange={setAcl} options={options.data} compact />
            {form.scope === "shared" && <LevelLegend />}
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Hesap ayrıntısı: Hareketler (gelir / gider kayıtları) ve Ekstre (yürüyen bakiye). */
function AccountDetail({ account, initialTab = "entries", initialStatus = "", postable, categories, onChanged, onClose, onAccess }) {
  const [tab, setTab] = useState(initialTab);
  const can = accountActions(account);
  return (
    <Modal title={account.name} onClose={onClose} width={960} className="modal--wide account-detail">
      <div className="account-detail__head" style={{ "--ac": account.color || "#7c3aed" }}>
        <span className="account-card__icon"><Icon name={ACCOUNT_KINDS[account.kind]?.icon || "wallet"} size={18} /></span>
        <div><small>{SCOPE_LABEL[account.scope]}{account.city_name ? ` · ${account.city_name}` : ""} · Bakiye</small><strong className={account.balance < 0 ? "text-red" : ""}>{money(account.balance)}</strong></div>
        <dl className="account-detail__facts">
          <div><dt>Gelir</dt><dd className="text-green">{money(account.income || 0, 0)}</dd></div>
          <div><dt>Gider</dt><dd className="text-red">{money(account.expense || 0, 0)}</dd></div>
          <div><dt>Bekleyen gelir</dt><dd>{money(account.pending?.income || 0, 0)}</dd></div>
          <div><dt>Bekleyen gider</dt><dd>{money(account.pending?.expense || 0, 0)}</dd></div>
        </dl>
        <span className="spacer" />
        {can.access && <button type="button" className="btn btn--sm btn--ghost" onClick={() => onAccess(account)}><Icon name="lock" size={13} /> Yetkiler</button>}
      </div>
      <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "entries", label: "Hareketler", icon: "list" }, { value: "statement", label: "Ekstre", icon: "printer" }]} />
      {tab === "entries" ? <AccountEntries account={account} initialStatus={initialStatus} postable={postable} categories={categories} onChanged={onChanged} /> : <Statement account={account} />}
    </Modal>
  );
}

function AccountEntries({ account, initialStatus, postable, categories, onChanged }) {
  const result = useResult();
  const confirm = useConfirm();
  const res = useResource("/api/finance/entries", { account_id: account.id });
  const [f, setF] = useState({ type: "", status: initialStatus || "", q: "" });
  const [editing, setEditing] = useState(null);
  const can = accountActions(account);
  const items = res.data?.items || [];
  const shown = filterFinanceEntries(items, f);
  const totals = entryTotals(items);
  const refresh = () => { res.reload({ quiet: true }); onChanged(); };
  const markPaid = async (e) => {
    res.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === e.id ? markPaidPatch(x, isoDay()) : x)) }));
    const r = await patch(`/api/finance/entries/${e.id}`, { status: "paid" });
    if (!result(r, `Hesaba işlendi: ${account.name}`)) res.reload({ quiet: true });
    else if (!r.queued) refresh();
  };
  const remove = async (e) => {
    if (!(await confirm({ title: "Kaydı sil", message: `${money(e.effective)} tutarındaki kayıt silinsin mi?${e.status === "paid" ? " Bakiye geri alınır." : ""}`, confirmLabel: "Sil", danger: true }))) return;
    if (result(await del(`/api/finance/entries/${e.id}`), "Kayıt silindi.")) { setEditing(null); refresh(); }
  };
  const save = async (body) => {
    const current = editing?.entry;
    const tmp = current ? null : tempId();
    const r = current ? await patch(`/api/finance/entries/${current.id}`, body) : await post("/api/finance/entries", body, { tempId: tmp });
    const ok = result(r, current ? "Kayıt güncellendi." : body.status === "paid" ? `Hesaba işlendi: ${account.name}` : "Kayıt eklendi.");
    if (ok && r.queued) {
      const local = { ...(current || {}), ...body, id: current?.id || tmp, effective: Number(body.amount ?? body.estimate ?? 0), can_edit: true };
      res.setData((d) => ({ ...d, items: current ? d.items.map((x) => (x.id === current.id ? local : x)) : [local, ...(d?.items || [])] }));
    } else if (ok) refresh();
    return ok;
  };
  return (
    <div className="account-entries">
      <div className="kpis kpis--compact">
        <div className="kpi kpi--green"><span>Tahsil edilen</span><strong>{money(totals.paid_income)}</strong><small>bu hesaba doğrudan</small></div>
        <div className="kpi kpi--red"><span>Ödenen</span><strong>{money(totals.paid_expense)}</strong><small>bu hesaptan doğrudan</small></div>
        <div className="kpi kpi--amber"><span>Bekleyen</span><strong>{signed(totals.pending_income - totals.pending_expense)}</strong><small>+{money(totals.pending_income, 0)} · −{money(totals.pending_expense, 0)}</small></div>
        <div className="kpi kpi--blue"><span>Tahmin</span><strong>{signed(totals.planned_income - totals.planned_expense)}</strong><small>+{money(totals.planned_income, 0)} · −{money(totals.planned_expense, 0)}</small></div>
      </div>
      <div className="filters">
        <div className="search-box"><Icon name="search" size={14} /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Açıklama, cari, kategori…" /></div>
        <select className="select-sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Tür"><option value="">Gelir ve gider</option><option value="income">Gelir</option><option value="expense">Gider</option></select>
        <select className="select-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Durum"><option value="">Tüm durumlar</option><option value="open">Açık (tahmin + bekleyen)</option><option value="planned">Tahmin</option><option value="pending">Bekliyor</option><option value="paid">Ödendi / tahsil edildi</option><option value="cancelled">İptal</option></select>
        <span className="spacer" />
        {can.post && <>
          <button type="button" className="btn btn--sm btn--green" onClick={() => setEditing({ draft: { type: "income", account_id: account.id } })}><Icon name="plus" size={13} /> Gelir</button>
          <button type="button" className="btn btn--sm btn--red" onClick={() => setEditing({ draft: { type: "expense", account_id: account.id } })}><Icon name="plus" size={13} /> Gider</button>
        </>}
      </div>
      {res.loading && !res.data ? <Spinner /> : res.error && !res.data ? <ErrorNote error={res.error} onRetry={res.reload} /> : shown.length ? (
        <div className="table-wrap" style={{ maxHeight: 400 }}>
          <table className="table">
            <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Durum</th><th className="num">Tutar</th><th /></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className={e.status === "cancelled" ? "is-muted" : ""} onDoubleClick={() => e.can_edit !== false && setEditing({ entry: e })}>
                  <td>{formatDate(e.status === "paid" ? e.paid_date || e.entry_date : e.due_date || e.entry_date)}<small className="muted entry-when">{e.status === "paid" ? (e.type === "income" ? "tahsil" : "ödeme") : e.due_date ? "vade" : "kayıt"}</small></td>
                  <td><strong>{e.description || e.party || "—"}</strong><small className="muted entry-sub">{[e.party && e.description ? e.party : null, e.project_id ? "Proje bütçesi" : null, e.document_no].filter(Boolean).join(" · ")}</small></td>
                  <td>{e.category || <span className="muted">—</span>}</td>
                  <td><EntryStatusPill entry={e} />{e.amount == null && e.estimate != null && <small className="muted"> tahmini</small>}</td>
                  <td className={`num ${e.type === "income" ? "text-green" : "text-red"}`}>{e.type === "income" ? "+" : "−"}{money(e.effective)}</td>
                  <td className="row-actions">
                    {can.post && e.can_edit !== false && ["planned", "pending"].includes(e.status) && <button type="button" className="btn btn--xs btn--soft" onClick={() => markPaid(e)}><Icon name="check" size={11} /> {payLabel(e.type)}</button>}
                    {e.can_edit !== false && <MenuButton items={[
                      { label: "Düzenle", icon: "sliders", onClick: () => setEditing({ entry: e }) },
                      { label: "Kopyala (yeni kayıt)", icon: "copy", onClick: () => setEditing({ draft: { ...e, id: undefined, status: "pending", paid_date: null, entry_date: isoDay() } }) },
                      "-",
                      { label: "Sil", icon: "trash", danger: true, onClick: () => remove(e) },
                    ]} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="receipt" title={items.length ? "Süzgece uyan kayıt yok" : "Bu hesapta doğrudan kayıt yok"} text={items.length ? "" : "Gelir ya da gider ekleyin. Tahmin ve bekleyen kayıtlar bakiyeyi etkilemez; “Ödendi” yapılınca bakiyeye işlenir."} />}
      {editing && <EntryDialog entry={editing.entry} draft={editing.draft} accounts={postable} categories={categories} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}

function Statement({ account }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const res = useResource(`/api/finance/accounts/${account.id}/statement`, { from: range.from || undefined, to: range.to || undefined });
  const st = res.data;
  const SOURCE = { ledger: "Ön muhasebe", accounting: "Maç muhasebesi", national: "Türkiye geneli", transfer: "Virman", entry: "Hesap kaydı" };
  return (<>
    <div className="filters">
      <input type="date" className="select-sm" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="Başlangıç" />
      <span className="muted">–</span>
      <input type="date" className="select-sm" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="Bitiş" />
      <span className="spacer" />
      {st && <><span className="pill">Devreden {money(st.opening)}</span><span className="pill pill--tool">Kapanış {money(st.closing)}</span></>}
    </div>
    {!st ? (res.error ? <ErrorNote error={res.error} onRetry={res.reload} /> : <Spinner />) : st.items.length ? (
      <div className="table-wrap" style={{ maxHeight: 440 }}>
        <table className="table">
          <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kaynak</th><th className="num">Tutar</th><th className="num">Bakiye</th></tr></thead>
          <tbody>
            {st.items.map((m, i) => (
              <tr key={`${m.source}-${m.ref}-${i}`}>
                <td>{formatDate(m.date)}</td>
                <td><strong>{m.title}</strong>{(m.party || m.note) && <small className="muted"> · {m.note || m.party}</small>}</td>
                <td><span className={`pill ${m.source === "transfer" ? "pill--tool" : m.source === "entry" ? "pill--blue" : ""}`}>{SOURCE[m.source] || m.source}{m.projectId ? " · proje" : ""}</span></td>
                <td className={`num ${m.amount >= 0 ? "text-green" : "text-red"}`}>{signed(m.amount)}</td>
                <td className="num"><strong>{money(m.balance)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : <Empty icon="list" title="Bu aralıkta hareket yok" />}
  </>);
}
