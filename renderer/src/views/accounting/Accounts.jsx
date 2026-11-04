// Hesaplar ve Virman: kişisel, il ve Türkiye geneli kasa/banka hesapları;
// bakiyeler, hesaplar arası aktarma ve hesap ekstresi.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { del, patch, post, useResource } from "../../api";
import { formatDate, isoDay } from "../../lib/helpers";
import { ACCOUNT_COLORS, ACCOUNT_KINDS, Kpi, SCOPE_LABEL, TransferDialog, money, signed } from "./common";

export default function Accounts({ accountsRes }) {
  const result = useResult();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [statement, setStatement] = useState(null);
  const [scopeFilter, setScopeFilter] = useState("all");
  const transfers = useResource("/api/finance/transfers");
  const d = accountsRes.data;
  const accounts = useMemo(() => (d?.items || []).filter((a) => !a.archived), [d]);
  const shown = accounts.filter((a) => scopeFilter === "all" || a.scope === scopeFilter);
  const reload = () => { accountsRes.reload({ quiet: true }); transfers.reload({ quiet: true }); };

  if (accountsRes.loading && !d) return <Spinner />;
  if (accountsRes.error && !d) return <ErrorNote error={accountsRes.error} onRetry={accountsRes.reload} />;

  const scopes = ["personal", "city", "national"].filter((s) => d?.access?.[s]?.view);
  const canCreate = scopes.some((s) => d.access[s].manage);

  return (
    <div className="acc-section">
      <div className="kpis">
        <Kpi hero label="Toplam bakiye" value={money(d.totals?.all || 0)} hint={`${accounts.length} hesap`} icon="bank" />
        {scopes.map((s) => <Kpi key={s} label={`${SCOPE_LABEL[s]} hesaplar`} value={money(d.totals?.[s] || 0)} tone={s === "personal" ? "blue" : s === "city" ? "green" : "amber"} />)}
      </div>

      <div className="filters">
        <Segmented value={scopeFilter} onChange={setScopeFilter} size="sm" options={[{ value: "all", label: "Tümü", count: accounts.length }, ...scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s], count: accounts.filter((a) => a.scope === s).length }))]} />
        <span className="spacer" />
        <button type="button" className="btn btn--soft" disabled={accounts.filter((a) => a.can_manage).length < 2} onClick={() => setTransfer({})}><Icon name="swap" /> Virman yap</button>
        {canCreate && <button type="button" className="btn btn--primary" onClick={() => setEditing({})}><Icon name="plus" /> Hesap aç</button>}
      </div>

      {shown.length ? (
        <div className="account-grid">
          {shown.map((a) => (
            <article key={a.id} className="account-card" style={{ "--ac": a.color || "#7c3aed" }}>
              <header>
                <span className="account-card__icon"><Icon name={ACCOUNT_KINDS[a.kind]?.icon || "wallet"} size={18} /></span>
                <div>
                  <strong>{a.name}</strong>
                  <small>{SCOPE_LABEL[a.scope]}{a.city_name ? ` · ${a.city_name}` : ""} · {ACCOUNT_KINDS[a.kind]?.label}</small>
                </div>
                {a.can_manage && <MenuButton items={[
                  { label: "Ekstre", icon: "list", onClick: () => setStatement(a) },
                  { label: "Buradan virman", icon: "swap", onClick: () => setTransfer({ defaults: { from: a.id } }) },
                  { label: "Buraya virman", icon: "swap", onClick: () => setTransfer({ defaults: { to: a.id } }) },
                  { label: "Düzenle", icon: "sliders", onClick: () => setEditing(a) },
                  "-",
                  { label: "Sil / arşivle", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Hesabı kaldır", message: "Virman geçmişi olan hesap arşivlenir, olmayan silinir.", confirmLabel: "Kaldır", danger: true }) && result(await del(`/api/finance/accounts/${a.id}`), "Hesap kaldırıldı.")) reload(); } },
                ]} />}
              </header>
              <button type="button" className="account-card__balance" onClick={() => setStatement(a)}>
                <span>Bakiye</span>
                <strong className={a.balance < 0 ? "text-red" : ""}>{money(a.balance)}</strong>
              </button>
              <dl className="account-card__parts">
                <div><dt>Açılış</dt><dd>{money(a.opening, 0)}</dd></div>
                <div><dt>Defter</dt><dd className={a.linked < 0 ? "text-red" : a.linked > 0 ? "text-green" : ""}>{signed(a.linked)}</dd></div>
                <div><dt>Virman</dt><dd>{signed(a.transfersIn - a.transfersOut)}</dd></div>
              </dl>
              {a.linked_method ? <span className="pill pill--tool"><Icon name="link" size={11} /> {(d.methods?.[a.scope] || []).find((m) => m.key === a.linked_method)?.label} hareketleri bağlı</span> : <span className="pill">Yalnız açılış + virman</span>}
            </article>
          ))}
        </div>
      ) : (
        <Empty icon="bank" title="Henüz hesap yok" text="Kasa, banka ya da kart hesabı açın. Hesabı bir ödeme yöntemine bağlarsanız o defterdeki ödenmiş kayıtlar bakiyeye kendiliğinden yansır." action={canCreate && <button type="button" className="btn btn--primary" onClick={() => setEditing({})}><Icon name="plus" /> İlk hesabı aç</button>} />
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
      {statement && <StatementDialog account={statement} onClose={() => setStatement(null)} />}
    </div>
  );
}

function AccountEditor({ account, meta, onClose, onSaved }) {
  const result = useResult();
  const scopes = ["personal", "city", "national"].filter((s) => meta.access?.[s]?.manage);
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
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const used = new Set((meta.items || []).filter((a) => !a.archived && a.scope === form.scope && a.id !== account?.id && (form.scope !== "city" || String(a.city_id) === form.city_id) && a.linked_method).map((a) => a.linked_method));
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = { ...form, city_id: form.scope === "city" ? Number(form.city_id) : undefined, linked_method: form.linked_method || null };
    if (account) { delete body.scope; delete body.city_id; }
    const res = account ? await patch(`/api/finance/accounts/${account.id}`, body) : await post("/api/finance/accounts", body, { queue: false });
    setBusy(false);
    if (result(res, account ? "Hesap güncellendi." : "Hesap açıldı.")) onSaved();
  };
  return (
    <Modal title={account ? "Hesabı düzenle" : "Yeni hesap"} onClose={onClose} width={600} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="account-form" className="btn btn--primary" disabled={busy || !form.name.trim()}>Kaydet</button>
    </>}>
      <form id="account-form" className="form-grid" onSubmit={save}>
        {!account && (
          <div className="span2">
            <span className="field__label">Hangi defterin hesabı?</span>
            <Segmented value={form.scope} onChange={(v) => setForm({ ...form, scope: v, linked_method: "" })} options={scopes.map((s) => ({ value: s, label: s === "personal" ? "Kişisel (Ön Muhasebe)" : s === "city" ? "İl (Maç Muhasebesi)" : "Türkiye geneli" }))} />
          </div>
        )}
        {!account && form.scope === "city" && (
          <Field label="İl" className="span2"><select value={form.city_id} onChange={set("city_id")}>{(meta.cities || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        )}
        <Field label="Hesap adı"><input autoFocus value={form.name} onChange={set("name")} placeholder="örn. Ankara il kasası" /></Field>
        <Field label="Tür"><select value={form.kind} onChange={set("kind")}>{(meta.kinds || []).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
        <Field label="Defterden bağlanan ödeme yöntemi" className="span2" hint="Seçilen yöntemle ödenmiş/tahsil edilmiş kayıtlar bu hesabın bakiyesine eklenir. Bir yöntem tek hesaba bağlanabilir.">
          <select value={form.linked_method} onChange={set("linked_method")}>
            <option value="">Bağlama (yalnız açılış + virman)</option>
            {(meta.methods?.[form.scope] || []).map((m) => <option key={m.key} value={m.key} disabled={used.has(m.key)}>{m.label}{used.has(m.key) ? " (başka hesaba bağlı)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Açılış bakiyesi (₺)"><input inputMode="decimal" value={form.opening_balance} onChange={set("opening_balance")} /></Field>
        <Field label="Açılış tarihi" hint="Bu tarihten önceki defter kayıtları sayılmaz."><input type="date" value={form.opening_date || ""} onChange={set("opening_date")} /></Field>
        <Field label="Renk" className="span2"><div className="color-dots color-dots--lg">{ACCOUNT_COLORS.map((c) => <button key={c} type="button" className={form.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />)}</div></Field>
        <Field label="Not" className="span2"><input value={form.note} onChange={set("note")} placeholder="IBAN, şube, sorumlu…" /></Field>
      </form>
    </Modal>
  );
}

function StatementDialog({ account, onClose }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const res = useResource(`/api/finance/accounts/${account.id}/statement`, { from: range.from || undefined, to: range.to || undefined });
  const st = res.data;
  const SOURCE = { ledger: "Ön muhasebe", accounting: "Maç muhasebesi", national: "Türkiye geneli", transfer: "Virman" };
  return (
    <Modal title={`${account.name} — ekstre`} onClose={onClose} width={860} className="modal--wide">
      <div className="filters">
        <input type="date" className="select-sm" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span className="muted">–</span>
        <input type="date" className="select-sm" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <span className="spacer" />
        {st && <><span className="pill">Devreden {money(st.opening)}</span><span className="pill pill--tool">Kapanış {money(st.closing)}</span></>}
      </div>
      {!st ? <Spinner /> : st.items.length ? (
        <div className="table-wrap" style={{ maxHeight: 460 }}>
          <table className="table">
            <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kaynak</th><th className="num">Tutar</th><th className="num">Bakiye</th></tr></thead>
            <tbody>
              {st.items.map((m, i) => (
                <tr key={`${m.source}-${m.ref}-${i}`}>
                  <td>{formatDate(m.date)}</td>
                  <td><strong>{m.title}</strong>{m.note && <small className="muted"> · {m.note}</small>}</td>
                  <td><span className={`pill ${m.source === "transfer" ? "pill--tool" : ""}`}>{SOURCE[m.source] || m.source}</span></td>
                  <td className={`num ${m.amount >= 0 ? "text-green" : "text-red"}`}>{signed(m.amount)}</td>
                  <td className="num"><strong>{money(m.balance)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon="list" title="Bu aralıkta hareket yok" />}
    </Modal>
  );
}
