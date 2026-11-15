// Ekipman (masaüstü): sistemle bağlar — web ile aynı davranış.
//   Gruplu kişi seçici (son verilenler, yönetim ekibi rol rozetiyle, personel
//   görev rozetiyle, Rehber), maç seçici (fikstür), konum seçicide sistem
//   sahaları / il depoları, tedarikçi ve sorumlu seçici, gider işleme,
//   amortisman raporu, "Zimmetimdekiler", projeye / maça ayrılmış ekipman.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, Field, Icon, Modal, Segmented, Spinner, useResult } from "../../components/ui";
import { post, useDebounced, useResource } from "../../api";
import { daysLabel, depreciationRows, fmtDateTime, fmtDay, money, num, personTone } from "../../lib/equipmentUtils";
import { BASE, useEq } from "./common";

const GROUP_ICONS = { recent: "clock", users: "shield", staff: "user", contacts: "users" };
const GROUP_LABELS = { users: "Yönetim ekibi", staff: "Personel", contacts: "Rehber kişileri" };
const GROUP_LIMIT = 60;
const groupsFromItems = (items) => ["users", "staff", "contacts"].map((key) => ({ key, label: GROUP_LABELS[key], items: items.filter((p) => (p.group || (p.type === "user" ? "users" : p.type === "staff" ? "staff" : "contacts")) === key) }));

export const PersonAvatar = ({ person, size = 28 }) => (
  <span className="eq-pav" style={{ "--pav": person?.role_color || personTone(person?.name), width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{person?.initials || "?"}</span>
);

/* --------------------------------- kişi seçici --------------------------------- */

export function PersonPicker({ value, onChange, freeName, onFreeName, phone, onPhone, label = "Teslim alan" }) {
  const [q, setQ] = useState("");
  const [cityId, setCityId] = useState("");
  const [open, setOpen] = useState({});
  const query = useDebounced(q, 200);
  const res = useResource(`${BASE}/people`, { q: query, city_id: cityId || undefined });
  const data = res.data;
  if (value) {
    return (
      <div className="field span3">
        <span className="field__label">{label}</span>
        <div className="eq-picked"><PersonAvatar person={value} /><strong>{value.name} <span className="muted small">· {value.subtitle}</span></strong><button type="button" className="btn btn--sm" onClick={() => onChange(null)}>Değiştir</button></div>
        <input value={phone} onChange={(e) => onPhone(e.target.value)} placeholder={value.phone || "Telefon (isteğe bağlı)"} aria-label="Telefon" style={{ marginTop: 6 }} />
      </div>
    );
  }
  const groups = (data?.groups || groupsFromItems(data?.items || [])).filter((g) => g.items.length);
  const typed = q.trim();
  return (
    <div className="field span3">
      <span className="field__label">{label} · yönetim ekibi, personel, Rehber ya da serbest ad</span>
      <div className="eq-pp__bar">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); onFreeName(e.target.value); }} placeholder="Ad, rol, görev, telefon ara…" aria-label={`${label} ara`} autoFocus />
        {data?.city_filter && data.cities?.length > 0 && (
          <select value={cityId} onChange={(e) => setCityId(e.target.value)} aria-label="İl süzgeci" style={{ maxWidth: 160 }}>
            <option value="">Tüm iller</option>{data.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {res.error && !data && <p className="error-note small">{res.error.message || "Kişi listesi alınamadı."}</p>}
      <div className="eq-pp" aria-label="Kişiler">
        {groups.map((g) => {
          const all = open[g.key] || typed;
          return (
            <div className="eq-pp__group" key={g.key} role="group" aria-label={g.label}>
              <div className="eq-pp__head"><Icon name={GROUP_ICONS[g.key] || "user"} size={12} /> {g.label} <span className="pill pill--xs">{g.items.length}</span></div>
              {(all ? g.items : g.items.slice(0, GROUP_LIMIT)).map((p) => (
                <button key={`${g.key}-${p.key}`} type="button" className="eq-pp__row" onClick={() => onChange(p)}>
                  <PersonAvatar person={p} />
                  <span className="eq-pp__main"><b>{p.name}</b><small>{[p.type === "contact" ? [p.company, p.title].filter(Boolean).join(" · ") : null, p.nationwide ? "Türkiye geneli" : p.no_city ? "İl atanmamış" : p.city, p.phone].filter(Boolean).join(" · ")}</small></span>
                  <span className="eq-pp__badges">
                    {p.type === "user" && <span className="eq-badge" style={{ "--bc": p.role_color || "#475569" }}>{p.role_label}</span>}
                    {(p.duties || []).slice(0, 3).map((d) => <span key={d} className="eq-badge eq-badge--duty">{d}</span>)}
                    {p.type === "contact" && <span className="eq-badge eq-badge--contact">{p.company ? "Firma" : "Rehber"}</span>}
                    {p.pending && <span className="eq-badge eq-badge--warn">Onay bekliyor</span>}
                  </span>
                </button>
              ))}
              {!all && g.items.length > GROUP_LIMIT && <button type="button" className="eq-pp__more" onClick={() => setOpen((o) => ({ ...o, [g.key]: true }))}>+{g.items.length - GROUP_LIMIT} kişi daha göster</button>}
            </div>
          );
        })}
        {!groups.length && <p className="muted small" style={{ padding: 8 }}>{res.loading ? "Yükleniyor…" : typed ? `Listede yok; "${typed}" adıyla serbest kayıt açılır.` : "Kayıtlı kişi yok."}</p>}
        {typed && groups.length > 0 && <p className="muted small" style={{ padding: "4px 8px" }}>Listede değilse "{typed}" adıyla serbest kayıt açılır.</p>}
      </div>
      {freeName.trim() && <input value={phone} onChange={(e) => onPhone(e.target.value)} placeholder="Telefon (isteğe bağlı)" aria-label="Telefon" style={{ marginTop: 6 }} />}
    </div>
  );
}

/* ---------------------------------- maç seçici ---------------------------------- */

const shiftDay = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

export function MatchPicker({ value, onChange }) {
  const eq = useEq();
  const [range, setRange] = useState({ from: shiftDay(-7), to: shiftDay(60), city_id: "", q: "" });
  const q = useDebounced(range.q, 200);
  const res = useResource(`${BASE}/matches`, { from: range.from, to: range.to, city_id: range.city_id || undefined, q: q || undefined });
  const cities = useResource(eq?.meta?.scope?.nationwide ? `${BASE}/people` : null, { q: "~" }, { enabled: Boolean(eq?.meta?.scope?.nationwide) });
  const list = res.data?.items || [];
  const set = (k) => (e) => setRange((r) => ({ ...r, [k]: e.target.value }));
  return (
    <div className="field span3">
      <span className="field__label">Maç · isteğe bağlı, fikstürden</span>
      <div className="eq-match__bar">
        <input type="date" value={range.from} onChange={set("from")} aria-label="Maç tarihi başlangıç" />
        <input type="date" value={range.to} onChange={set("to")} aria-label="Maç tarihi bitiş" />
        {cities.data?.cities?.length > 0 && <select value={range.city_id} onChange={set("city_id")} aria-label="İl" style={{ maxWidth: 140 }}><option value="">Tüm iller</option>{cities.data.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <input type="search" value={range.q} onChange={set("q")} placeholder="Takım, lig, saha ara" aria-label="Maç ara" />
      </div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value, list.find((m) => String(m.id) === e.target.value) || null)} aria-label="Maç">
        <option value="">{res.loading && !res.data ? "Yükleniyor…" : list.length ? "Maç yok" : "Bu aralıkta maç yok"}</option>
        {value && !list.some((m) => String(m.id) === String(value)) && <option value={value}>Seçili maç</option>}
        {list.map((m) => <option key={m.id} value={m.id}>{fmtDay(m.date, { day: "numeric", month: "short" })} {m.time} · {m.label}{m.field ? ` · ${m.field}` : ""}{m.equipment_count ? ` · ${m.equipment_count} ekipman` : ""}</option>)}
      </select>
    </div>
  );
}

export function LinkFields({ form, setForm, onMatch }) {
  const links = useResource(`${BASE}/links`);
  return (
    <>
      <Field label="Proje (isteğe bağlı)"><select value={form.project_id || ""} onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}><option value="">Proje yok</option>{(links.data?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <MatchPicker value={form.match_id} onChange={(v, m) => { setForm((p) => ({ ...p, match_id: v })); if (m) onMatch?.(m); }} />
    </>
  );
}

/* --------------------------------- konum seçici --------------------------------- */

export function LocationSelect({ value, onChange, label = "Konum" }) {
  const eq = useEq();
  const canLink = Boolean(eq?.perms?.manage);
  const src = useResource(canLink ? `${BASE}/location-sources` : null, undefined, { enabled: canLink });
  const [error, setError] = useState("");
  const venues = (src.data?.venues || []).filter((v) => !v.location_id);
  const depots = (src.data?.depots || []).filter((d) => !d.location_id);
  const pick = async (raw) => {
    setError("");
    if (!raw.startsWith("src:")) { onChange(raw); return; }
    const r = await post(`${BASE}/locations/link`, { source: raw.slice(4) }, { queue: false });
    if (!r.ok) { setError(r.offline ? "Bağlamak için bağlantı gerekir." : r.error?.message || "Konum bağlanamadı."); return; }
    await eq.reloadMeta?.();
    src.reload({ quiet: true });
    onChange(String(r.data.item.id));
  };
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <select value={value || ""} onChange={(e) => pick(e.target.value)} aria-label={label}>
        <option value="">Konum yok</option>
        <optgroup label="Konumlar">{(eq?.meta?.locations || []).filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{"  ".repeat(l.depth)}{l.name}</option>)}</optgroup>
        {venues.length > 0 && <optgroup label="Sistem sahaları (bağlanır)">{venues.map((v) => <option key={v.key} value={`src:${v.key}`}>Saha: {v.name}{v.city ? ` · ${v.city}` : ""}</option>)}</optgroup>}
        {depots.length > 0 && <optgroup label="İl depoları (bağlanır)">{depots.map((d) => <option key={d.key} value={`src:${d.key}`}>{d.name}</option>)}</optgroup>}
      </select>
      {error && <span className="small text-red">{error}</span>}
    </div>
  );
}

export function LinkSourcesPanel() {
  const eq = useEq();
  const result = useResult();
  const res = useResource(`${BASE}/location-sources`);
  useEffect(() => { res.reload({ quiet: true }); }, [eq.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = async (key) => {
    if (result(await post(`${BASE}/locations/link`, { source: key }, { queue: false }), "Konum ağacına bağlandı.")) { await eq.reloadMeta(); eq.bump(); }
  };
  const row = (s) => (
    <li key={s.key}>
      <span className="eq-tree__name"><Icon name={s.kind === "venue" ? "ball" : "box"} size={13} className="text-tool" /> {s.kind === "venue" ? `Saha: ${s.name}` : s.name}<small> · {[s.city, s.detail, s.source].filter(Boolean).join(" · ")}</small></span>
      {s.location_id ? <span className="pill pill--xs pill--blue">Bağlı</span> : <button type="button" className="btn btn--sm" onClick={() => link(s.key)}><Icon name="link" size={12} /> Bağla</button>}
    </li>
  );
  return (
    <section className="card" style={{ gridColumn: "1 / -1" }} aria-label="Sistem sahaları ve il depoları">
      <header className="card__head"><h2 className="card__title"><Icon name="link" /> Sistem sahaları ve il depoları</h2></header>
      <p className="muted small">Saha ve Maç Planlama'daki sahalar ile iller konum ağacına bağlanır; ad sahadan gelir. Saha ve il deposu, ilin düğümü altına yerleşir.</p>
      {!res.data ? <Spinner /> : (
        <div className="eq-grid2">
          <div><h3 className="eq-mini">Sahalar ({res.data.venues.length})</h3><ul className="eq-tree">{res.data.venues.map(row)}</ul>{!res.data.venues.length && <p className="muted small">Kapsamınızda saha yok.</p>}</div>
          <div><h3 className="eq-mini">İl depoları</h3><ul className="eq-tree">{res.data.depots.map(row)}</ul></div>
        </div>
      )}
    </section>
  );
}

/* ----------------------------- tedarikçi / sorumlu ----------------------------- */

export function SupplierField({ name, refValue, onChange }) {
  const [open, setOpen] = useState(false);
  const q = useDebounced(name, 200);
  const res = useResource(open ? `${BASE}/suppliers` : null, { q: q || undefined }, { enabled: open });
  const list = res.data?.items;
  return (
    <div className="field eq-sup">
      <span className="field__label">Tedarikçi{refValue ? <span className="eq-linked small"> · <Icon name="link" size={11} /> {refValue.startsWith("lead:") ? "proje tedarikine bağlı" : "Rehber'e bağlı"}</span> : null}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={name} onChange={(e) => onChange({ supplier: e.target.value, supplier_ref: null })} onFocus={() => setOpen(true)} aria-label="Tedarikçi" placeholder="Firma ya da kişi" />
        <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Tedarikçi listesi" aria-expanded={open}><Icon name="users" /></button>
      </div>
      {open && (
        <ul className="eq-people eq-sup__list" aria-label="Tedarikçiler">
          {!list && <li className="muted small" style={{ padding: 8 }}>Yükleniyor…</li>}
          {(list || []).map((s) => (
            <li key={s.ref}><button type="button" onClick={() => { onChange({ supplier: s.name, supplier_ref: s.ref }); setOpen(false); }}>
              <Icon name={s.ref.startsWith("lead:") ? "handshake" : "users"} size={14} /><span><b>{s.name}</b><small>{[s.person, s.title, s.phone, s.source].filter(Boolean).join(" · ")}</small></span>
            </button></li>
          ))}
          {list && !list.length && <li className="muted small" style={{ padding: 8 }}>Rehber'de ya da proje tedarik görüşmelerinde eşleşen yok.</li>}
        </ul>
      )}
    </div>
  );
}

export function ResponsibleSelect({ value, onChange }) {
  const res = useResource(`${BASE}/people`, {});
  const users = res.data?.groups?.find((g) => g.key === "users")?.items || (res.data?.items || []).filter((p) => p.type === "user");
  return (
    <Field label="Sorumlu" hint="Bakım ve iade kartları Yapılacaklar'ına düşer">
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="Sorumlu">
        <option value="">{res.data ? "Sorumlu yok" : "Yükleniyor…"}</option>
        {value && res.data && !users.some((u) => String(u.id) === String(value)) && <option value={value}>Seçili kişi</option>}
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role_label ? ` · ${u.role_label}` : ""}</option>)}
      </select>
    </Field>
  );
}

/* ----------------------------------- muhasebe ----------------------------------- */

export function ExpenseDialog({ source, item, record, onClose, onDone }) {
  const amount = source === "purchase" ? (item.tracking === "bulk" ? (item.purchase_price || 0) * (item.quantity || 1) : item.purchase_price) : record.cost;
  const [form, setForm] = useState({ target: "ledger", account_id: "", status: "paid", entry_date: source === "purchase" ? item.purchase_date || "" : record.performed_at || "" });
  const accounts = useResource("/api/finance/accounts", { postable: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (form.target === "account" && !form.account_id) { setError("Gideri işleyeceğiniz hesabı seçin."); return; }
    setBusy(true);
    setError("");
    const r = await post(`${BASE}/expense`, { source, id: source === "purchase" ? item.id : record.id, target: form.target, account_id: form.account_id || undefined, status: form.status, entry_date: form.entry_date || undefined }, { queue: false });
    setBusy(false);
    if (r.ok) onDone?.(r.data);
    else setError(r.offline ? "Gider işlemek için bağlantı gerekir." : r.error?.message || "Gider işlenemedi.");
  };
  return (
    <Modal title={source === "purchase" ? "Alışı gider olarak işle" : "Bakım maliyetini gider olarak işle"} onClose={onClose} width={520} footer={(
      <><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="eq-expense-form" className="btn btn--primary" disabled={busy}>{busy ? "İşleniyor…" : "Gider olarak işle"}</button></>
    )}>
      <form id="eq-expense-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <div className="error-note span3"><span>{error}</span></div>}
        <p className="span3"><b className="eq-tag">{item.asset_tag}</b> {item.name}{source === "maintenance" ? ` · ${record.title}` : ""} · <b>{money(amount)}</b></p>
        <div className="span3"><Segmented value={form.target} onChange={(v) => setForm((p) => ({ ...p, target: v }))} options={[{ value: "ledger", label: "Ön Muhasebe", icon: "receipt" }, { value: "account", label: "Hesap (kasa / banka)", icon: "bank" }]} ariaLabel="Nereye" /></div>
        <Field label={form.target === "ledger" ? "Hesaba da bağla (isteğe bağlı)" : "Hesap"}>
          <select value={form.account_id} onChange={(e) => setForm((p) => ({ ...p, account_id: e.target.value }))} aria-label="Hesap">
            <option value="">{!accounts.data ? "Yükleniyor…" : form.target === "ledger" ? "Hesap yok" : "Hesap seçin"}</option>
            {(accounts.data?.items || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Durum"><select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}><option value="paid">Ödendi</option><option value="pending">Bekliyor (borç)</option></select></Field>
        <Field label="Tarih"><input type="date" value={form.entry_date} onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))} /></Field>
        <p className="span3 muted small">Kayıt bir kez işlenir; aynı alış / bakım ikinci kez gider yazılmaz. Gider kaydı silinirse yeniden işleyebilirsiniz.</p>
      </form>
    </Modal>
  );
}

export function ExpenseBadge({ expense, onPost, can }) {
  if (expense && !expense.missing) return <span className="pill pill--xs pill--blue" title={expense.entry_date || ""}><Icon name="check" size={11} /> {expense.target === "ledger" ? "Ön Muhasebe'ye" : "Hesaba"} işlendi · {money(expense.amount)}</span>;
  return can ? <button type="button" className="btn btn--sm" onClick={onPost}><Icon name="receipt" size={12} /> Gider olarak işle</button> : null;
}

export function DepreciationReport({ onExport }) {
  const eq = useEq();
  const [year, setYear] = useState(new Date().getFullYear());
  const res = useResource(`${BASE}/depreciation`, { year });
  useEffect(() => { res.reload({ quiet: true }); }, [eq.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const years = useMemo(() => { const y = new Date().getFullYear(); return [y + 1, y, y - 1, y - 2, y - 3, y - 4]; }, []);
  const d = res.data;
  return (
    <section className="card" aria-label="Amortisman raporu">
      <header className="card__head">
        <h2 className="card__title"><Icon name="trend" /> Amortisman raporu</h2>
        <span style={{ display: "flex", gap: 6 }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Yıl">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <button type="button" className="btn btn--sm" disabled={!d?.rows?.length} onClick={() => onExport?.(`Amortisman-${year}`, depreciationRows(d))}><Icon name="download" size={13} /> Excel</button>
        </span>
      </header>
      {!d ? <Spinner /> : !d.rows.length ? <Empty icon="trend" title="Alış fiyatı girilmiş ekipman yok" text="Kartlara alış tarihi, fiyatı ve amortisman ömrü girildiğinde rapor oluşur." /> : (
        <>
          <div className="eq-kpis">
            <div className="kpi"><span>Alış değeri</span><strong>{money(d.totals.purchase_value)}</strong><small>{d.totals.count} kalem</small></div>
            <div className="kpi"><span>{year} amortismanı</span><strong>{money(d.totals.year_depreciation)}</strong></div>
            <div className="kpi"><span>Birikmiş</span><strong>{money(d.totals.accumulated)}</strong></div>
            <div className="kpi kpi--hero"><span>Yıl sonu defter değeri</span><strong>{money(d.totals.book_value)}</strong></div>
          </div>
          <div className="table-wrap">
            <table className="table eq-dep">
              <thead><tr><th>Etiket</th><th>Ekipman</th><th>Kategori</th><th>Alış</th><th>Ömür</th><th className="num">Alış değeri</th><th className="num">{year}</th><th className="num">Birikmiş</th><th className="num">Defter</th><th>Gider</th></tr></thead>
              <tbody>{d.rows.map((r) => (
                <tr key={r.id} onClick={() => eq.openItem(r.id)} style={{ cursor: "pointer" }}>
                  <td className="eq-tag">{r.asset_tag}</td><td>{r.name}</td><td>{r.category || "—"}</td><td>{r.purchase_date ? fmtDay(r.purchase_date) : "—"}</td><td>{r.life_years ? `${num(r.life_years)} yıl` : "—"}</td>
                  <td className="num">{money(r.purchase_value)}</td><td className="num">{money(r.year_depreciation)}</td><td className="num">{money(r.accumulated)}</td><td className="num">{money(r.book_value)}</td>
                  <td>{r.expensed ? <span className="pill pill--xs pill--blue">İşlendi</span> : <span className="muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* --------------------------------- zimmetimdekiler --------------------------------- */

export function MineSection({ onPrint }) {
  const eq = useEq();
  const res = useResource(`${BASE}/mine`);
  useEffect(() => { res.reload({ quiet: true }); }, [eq.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = res.data?.items;
  if (!list) return <Spinner />;
  if (!list.length) return <Empty icon="user" title="Üzerinizde ekipman yok" text="Size zimmetlenen ya da çıkışı yapılan ekipman burada görünür; iade tarihleri Yapılacaklar listenize de düşer." />;
  const overdue = list.filter((a) => a.overdue).length;
  return (
    <section className="card" aria-label="Zimmetimdekiler">
      <header className="card__head">
        <h2 className="card__title"><Icon name="user" /> Zimmetimdekiler ({list.length}){overdue ? <span className="pill pill--xs pill--red">{overdue} iade gecikti</span> : null}</h2>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn--sm" onClick={() => eq.goTodos?.()}><Icon name="checkSquare" size={13} /> Yapılacaklar</button>
          <button type="button" className="btn btn--sm" onClick={() => onPrint(list)}><Icon name="printer" size={13} /> Tutanak</button>
        </span>
      </header>
      <ul className="eq-list">{list.map((a) => (
        <li key={a.id}>
          <button type="button" className="eq-list__main" onClick={() => eq.openItem(a.item_id)}>
            <strong>{a.item_name}{a.item_tracking === "bulk" ? ` · ${num(a.quantity)} ${a.item_unit}` : ""}</strong>
            <small>{a.asset_tag} · {a.kind_label} · {fmtDateTime(a.start_at)}{a.created_by_name ? ` · veren ${a.created_by_name}` : ""}{a.match_label ? ` · ${a.match_label}` : ""}{a.project_name ? ` · ${a.project_name}` : ""}</small>
          </button>
          <span className={`eq-list__when ${a.overdue ? "is-late" : ""}`}>{a.due_at ? `${fmtDay(a.due_at)} (${daysLabel(Math.round((new Date(a.due_at) - Date.now()) / 86400000))})` : "süresiz"}</span>
        </li>
      ))}</ul>
    </section>
  );
}

/* --------------------------- proje / maç için ekipman özeti --------------------------- */

const STATE_PILL = { reserved: "blue", out: "amber", overdue: "red", returned: "green", cancelled: "" };

export function AllocatedList({ data, empty }) {
  if (!data) return <Spinner />;
  if (!data.lines?.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="eq-alloc">{data.lines.map((l) => (
      <li key={l.key}>
        <span className="eq-tag">{l.asset_tag}</span>
        <span className="eq-alloc__main"><b>{l.item_name}{l.quantity && l.quantity !== 1 ? ` · ${num(l.quantity)} ${l.unit || ""}` : ""}</b><small>{[l.holder_name, l.start_at ? fmtDateTime(l.start_at) : null, l.end_at ? `→ ${fmtDateTime(l.end_at)}` : null].filter(Boolean).join(" · ")}</small></span>
        <span className={`pill pill--xs ${STATE_PILL[l.state] ? `pill--${STATE_PILL[l.state]}` : ""}`}>{l.state_label}</span>
      </li>
    ))}</ul>
  );
}

/** Projeler / maç masası için: veriyi kendisi çeker, yetki yoksa gizlenir. */
export function AllocatedCard({ kind, id, go, title = "Ekipman" }) {
  const path = id ? `${BASE}/${kind === "match" ? "matches" : "projects"}/${id}` : null;
  const res = useResource(path, undefined, { enabled: Boolean(id) });
  if (!id || (res.error && !res.data)) return null;
  if (kind === "match" && res.data && !res.data.lines?.length) return null;
  return (
    <section className="card eq-embed" data-tool="equipment" aria-label={kind === "match" ? "Maça ayrılmış ekipman" : "Projeye ayrılmış ekipman"}>
      <header className="card__head">
        <h2 className="card__title"><Icon name="toolbox" /> {title}{res.data?.total ? <span className="pill">{res.data.total}</span> : null}</h2>
        {go && <button type="button" className="link-btn" onClick={() => go("equipment:rezervasyon")}>Ekipman →</button>}
      </header>
      <AllocatedList data={res.data} empty={kind === "match" ? "Bu maça ayrılmış ekipman yok." : "Bu projeye ayrılmış ekipman yok. Ekipman › Rezerve et / Zimmetle penceresinde projeyi seçin."} />
    </section>
  );
}

