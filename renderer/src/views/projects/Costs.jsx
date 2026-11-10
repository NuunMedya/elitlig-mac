// Maliyet hesabı: kalem bazlı gider / gelir (miktar × birim fiyat, KDV,
// sabit / katılımcı / takım başı, tedarikçi, tahmini ↔ gerçekleşen, durum),
// hesap ayarları, satış fiyatı, başabaş noktası, senaryolar ve kategori
// dağılımı. "Muhasebeye işle" kalemi projenin bütçesine (Bütçe sekmesi →
// hesap) yazar; kayıt ödenince gerçekleşen kendiliğinden gelir.
import ExportButton from "../../components/ExportButton";
import { matrixReport } from "../../lib/export/reports";
import React, { useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, MenuButton, Modal, Segmented, Spinner, useConfirm } from "../../components/ui";
import { useCommand } from "../../api";
import { COST_EXPORT, COST_STATUS_COLORS, costLine, money, num, pct } from "../../lib/lifecycleUtils";
import { FINANCE_EVENT, saveRowsCsv, saveRowsXlsx } from "./common";
import { useProjectFinance } from "./Budget";
import { useCosts } from "./useLifecycle";
import "./lifecycle.css";

export const parseNum = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/\s|₺/g, "");
  const n = Number(s.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

function ItemDialog({ item, kind, meta, suppliers, summary, onSave, onClose }) {
  const [f, setF] = useState(() => ({
    kind: item?.kind || kind || "cost", name: item?.name || "", category: item?.category || "", basis: item?.basis || "fixed",
    quantity: item?.quantity ?? 1, unit: item?.unit || "", unit_price: item?.unit_price ?? "", vat_rate: item?.vat_rate ?? 20,
    vat_included: Boolean(item?.vat_included), status: item?.status || "draft", lead_id: item?.lead_id || "", actual: item?.actual ?? "", note: item?.note || "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const revenue = f.kind === "revenue";
  const pv = useMemo(() => {
    const mult = f.basis === "per_participant" ? summary?.participants || 0 : f.basis === "per_team" ? summary?.teams || 0 : 1;
    const rate = Number(f.vat_rate) || 0;
    const price = parseNum(f.unit_price) || 0;
    const unitNet = f.vat_included ? price / (1 + rate / 100) : price;
    const net = unitNet * (parseNum(f.quantity) || 0) * mult;
    return { net, vat: net * (rate / 100), gross: net * (1 + rate / 100), mult };
  }, [f, summary]);
  const submit = async (e) => {
    e?.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    const ok = await onSave({ ...f, name: f.name.trim(), quantity: parseNum(f.quantity) ?? 1, unit_price: parseNum(f.unit_price), actual: parseNum(f.actual), vat_rate: Number(f.vat_rate) || 0, lead_id: f.lead_id ? Number(f.lead_id) : null });
    setBusy(false);
    if (ok) onClose();
  };
  const cats = revenue ? meta.revenue_categories : meta.cost_categories;
  return (
    <Modal title={item ? "Kalemi düzenle" : revenue ? "Gelir kalemi ekle" : "Gider kalemi ekle"} onClose={onClose} width={720}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="lc-item" className="btn btn--primary" disabled={busy || !f.name.trim()}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></>}>
      <form id="lc-item" className="lc-itemform" onSubmit={submit}>
        <Segmented size="sm" value={f.kind} onChange={(v) => setF((x) => ({ ...x, kind: v }))} options={meta.kinds.map((k) => ({ value: k.key, label: k.label }))} ariaLabel="Kalem türü" />
        <div className="form-grid">
          <Field label="Kalem"><input value={f.name} onChange={set("name")} placeholder={revenue ? "ör. Takım katılım ücreti" : "ör. Saha kirası"} autoFocus /></Field>
          <Field label="Kategori"><input list="lc-cats" value={f.category} onChange={set("category")} placeholder="Seçin ya da yazın" /><datalist id="lc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
        </div>
        <div className="form-grid lc-grid4">
          <Field label="Hesap tabanı"><select value={f.basis} onChange={set("basis")}>{meta.bases.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></Field>
          <Field label="Miktar"><input inputMode="decimal" value={f.quantity} onChange={set("quantity")} /></Field>
          <Field label="Birim"><input value={f.unit} onChange={set("unit")} placeholder="adet, gün, saat…" /></Field>
          <Field label="Birim fiyat (₺)"><input inputMode="decimal" value={f.unit_price} onChange={set("unit_price")} /></Field>
        </div>
        <div className="form-grid lc-grid4">
          <Field label="KDV oranı"><select value={f.vat_rate} onChange={set("vat_rate")}>{[...new Set([...meta.vat_rates, Number(f.vat_rate) || 0])].map((r) => <option key={r} value={r}>%{r}</option>)}</select></Field>
          <label className="lc-check lc-check--field"><input type="checkbox" checked={f.vat_included} onChange={set("vat_included")} /> Fiyata KDV dahil</label>
          <Field label="Durum"><select value={f.status} onChange={set("status")}>{meta.statuses.map((s) => <option key={s.key} value={s.key}>{revenue ? s.revenue_label : s.label}</option>)}</select></Field>
          <Field label={revenue ? "Tahsil edilen (₺)" : "Gerçekleşen (₺)"}><input inputMode="decimal" value={f.actual} onChange={set("actual")} placeholder="KDV dahil" /></Field>
        </div>
        {!revenue && (
          <Field label="Tedarikçi (görüşmelerden)">
            <select value={f.lead_id} onChange={set("lead_id")}><option value="">Bağlı değil</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company || s.name}{s.item ? ` · ${s.item}` : ""}{s.value != null ? ` · ${money(s.value)}` : ""}</option>)}</select>
          </Field>
        )}
        <Field label="Not"><textarea rows={2} value={f.note} onChange={set("note")} /></Field>
        <div className="lc-preview" aria-live="polite">
          <span>KDV hariç <b>{money(pv.net)}</b></span><span>KDV <b>{money(pv.vat)}</b></span><span>Toplam <b>{money(pv.gross)}</b></span>
          {f.basis !== "fixed" && <small>× {num(pv.mult)} {f.basis === "per_team" ? "takım" : "katılımcı"} (hesap ayarlarından)</small>}
        </div>
      </form>
    </Modal>
  );
}

function PostDialog({ item, projectId, onPost, onClose }) {
  const fin = useProjectFinance(projectId);
  const [f, setF] = useState({ status: item.status === "paid" ? "paid" : item.status === "approved" ? "pending" : "planned", account_id: "" });
  useEffect(() => { if (fin.data?.default_account_id) setF((x) => ({ ...x, account_id: x.account_id || fin.data.default_account_id })); }, [fin.data]);
  const revenue = item.kind === "revenue";
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Muhasebeye işle" onClose={onClose} width={460}
      footer={<><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" disabled={busy} onClick={async () => { setBusy(true); const ok = await onPost({ status: f.status, account_id: f.account_id ? Number(f.account_id) : null }); setBusy(false); if (ok) onClose(); }}>{item.entry_id ? "Kaydı güncelle" : "İşle"}</button></>}>
      <p className="muted"><b>{item.name}</b> · {money(item.actual ?? item.gross)} projenin bütçesine {revenue ? "gelir" : "gider"} kaydı olarak {item.entry_id ? "güncellenir" : "yazılır"}.</p>
      <div className="form-grid">
        <Field label="Durum"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="planned">Tahmin / planlandı</option><option value="pending">Bekliyor</option><option value="paid">{revenue ? "Tahsil edildi" : "Ödendi"}</option></select></Field>
        <Field label="Hesap" hint="Ödenince bakiyeye yansır"><select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}><option value="">Hesapsız (yalnız proje bütçesi)</option>{(fin.data?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function NumInput({ value, onCommit, label, suffix, disabled, placeholder }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <span className="lc-numin">
      <input inputMode="decimal" aria-label={label} value={v} disabled={disabled} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (String(v) !== String(value ?? "")) onCommit(v === "" ? null : v); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

export default function Costs({ ctx }) {
  const { project, canEdit } = ctx;
  const costs = useCosts(project.id);
  const confirm = useConfirm();
  const [dialog, setDialog] = useState(null);
  const [posting, setPosting] = useState(null);
  const [filter, setFilter] = useState("all");
  useCommand("new", () => { if (canEdit) setDialog({ kind: "cost" }); });
  const data = costs.data;

  if (!data) return costs.loading ? <Spinner /> : <ErrorNote error={costs.error?.status === 404 ? { message: "Maliyet hesabı için sunucu güncellemesi henüz yayında değil." } : costs.error} onRetry={costs.reload} />;
  const { summary: s, meta, costing } = data;
  const editable = canEdit && data.can_edit !== false;
  const statusLabel = (i) => { const st = meta.statuses.find((x) => x.key === i.status); return i.kind === "revenue" ? st?.revenue_label : st?.label; };
  const basisLabel = (k) => meta.bases.find((b) => b.key === k)?.label || k;
  const exportRows = (fmt) => {
    const cols = COST_EXPORT(statusLabel, basisLabel);
    const rows = [cols.map((c) => c[0]), ...data.items.map((i) => cols.map(([, g]) => g(i) ?? ""))];
    const name = `${project.name}-Maliyet`.replace(/[\\/:*?"<>|]/g, "-");
    const widths = Object.fromEntries(cols.map((c, idx) => [String.fromCharCode(65 + idx), c[2]]));
    return fmt === "csv" ? saveRowsCsv(name, rows) : saveRowsXlsx(name, rows, "Maliyet", widths);
  };
  const setCosting = (body) => costs.call("PUT", "/settings", body);
  const pending = data.suppliers.filter((x) => !x.linked && x.value != null);
  const unposted = data.items.filter((i) => !i.entry_id && i.status !== "cancelled" && i.gross > 0).length;
  const be = s.break_even;
  const maxCat = Math.max(1, ...s.by_category.map((x) => x.planned));
  const groups = [["cost", "Giderler", s.cost], ["revenue", "Gelirler", s.revenue]].filter(([k]) => filter === "all" || filter === k);
  const changedFinance = () => window.dispatchEvent(new Event(FINANCE_EVENT));

  return (
    <div className="proj-section lc-costs">
      {costs.offline && <div className="offline-note"><Icon name="cloudOff" size={14} /> Çevrimdışı: maliyet hesabı önbellekten gösteriliyor; değişiklik için bağlantı gerekir.</div>}
      <div className="filters">
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "Tümü" }, { value: "cost", label: "Giderler", count: s.count.cost }, { value: "revenue", label: "Gelirler", count: s.count.revenue }]} ariaLabel="Kalem türü" />
        <span className="spacer" />
        {editable && <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ kind: "cost" })}><Icon name="plus" size={13} /> Gider kalemi</button>}
        {editable && <button type="button" className="btn btn--sm" onClick={() => setDialog({ kind: "revenue" })}><Icon name="plus" size={13} /> Gelir kalemi</button>}
        <ExportButton id="project-costs-table" title={`${project.name} — Maliyet`} text="" report={() => {
          const cols = COST_EXPORT(statusLabel, basisLabel);
          const items = data.items.filter((i) => filter === "all" || i.kind === filter);
          const r = matrixReport(`${project.name} — Maliyet tablosu`, cols.map((c) => c[0]), items.map((i) => cols.map(([, g]) => g(i) ?? "")), {
            filters: filter === "all" ? [] : [filter === "cost" ? "Giderler" : "Gelirler"],
            summary: [{ label: "Toplam gider", value: s.cost?.total ?? s.cost, type: "money", tone: "red" }, { label: "Toplam gelir", value: s.revenue?.total ?? s.revenue, type: "money", tone: "green" }, { label: "Kâr / zarar", value: s.profit, type: "money" }].filter((x) => typeof x.value === "number"),
          });
          r.sections[0].groupBy = "c0";
          return r;
        }} />
        <MenuButton label="Maliyet işlemleri" items={[
          editable && { label: `Tedarik tekliflerinden ekle${pending.length ? ` (${pending.length})` : ""}`, icon: "handshake", disabled: !pending.length, onClick: () => costs.call("POST", "/import-suppliers", {}, (r) => `${r.created} kalem eklendi.`) },
          editable && { label: `Tümünü muhasebeye işle${unposted ? ` (${unposted})` : ""}`, icon: "wallet", disabled: !unposted, onClick: async () => { if (await costs.call("POST", "/post-all", {}, (r) => `${r.posted} kalem muhasebeye işlendi.`)) changedFinance(); } },
          editable && "-",
          { label: "Excel'e aktar (.xlsx)", icon: "grid", disabled: !data.items.length, onClick: () => exportRows("xlsx") },
          { label: "CSV olarak kaydet", icon: "download", disabled: !data.items.length, onClick: () => exportRows("csv") },
        ].filter(Boolean)} />
      </div>

      <div className="kpis kpis--six">
        <div className="kpi kpi--hero"><span>Planlanan maliyet</span><strong>{money(s.cost.total)}</strong><small>KDV dahil{s.cost.contingency ? ` · ${money(s.cost.contingency)} beklenmeyen pay` : ""}</small></div>
        <div className="kpi"><span>Gerçekleşen</span><strong>{money(s.actual.cost)}</strong><small>{s.actual.variance ? <span className={s.actual.variance > 0 ? "text-red" : "text-green"}>{s.actual.variance > 0 ? "+" : ""}{money(s.actual.variance)} fark</span> : `${money(s.remaining_to_pay)} kalan ödeme`}</small></div>
        <div className="kpi kpi--blue"><span>Planlanan gelir</span><strong>{money(s.revenue.total)}</strong><small>{money(s.actual.revenue)} tahsil edildi</small></div>
        <div className={`kpi ${s.profit < 0 ? "kpi--alert" : "kpi--green"}`}><span>Kâr / zarar</span><strong>{money(s.profit)}</strong><small>Marj {pct(s.margin)}</small></div>
        <div className="kpi"><span>Katılımcı başı</span><strong>{s.per_participant != null ? money(s.per_participant) : "—"}</strong><small>{num(s.participants)} katılımcı</small></div>
        <div className="kpi"><span>Takım başı</span><strong>{s.per_team != null ? money(s.per_team) : "—"}</strong><small>{num(s.teams)} takım</small></div>
      </div>

      <div className="lc-costgrid">
        <div className="lc-costmain">
          {!data.items.length ? (
            <div className="card"><Empty icon="calculator" title="Henüz kalem yok" text="Saha, ekipman, ödül, personel… her kalemi miktar × birim fiyat olarak girin; katılım ücreti ve sponsorluk gibi gelirleri de ekleyin." action={editable ? <button type="button" className="btn btn--primary btn--sm" onClick={() => setDialog({ kind: "cost" })}>İlk kalemi ekle</button> : null} /></div>
          ) : groups.map(([kind, title, tot]) => {
            const rows = data.items.filter((i) => i.kind === kind);
            return (
              <section key={kind} className="card">
                <header className="card__head"><h2 className="card__title"><Icon name={kind === "cost" ? "arrowDown" : "trend"} /> {title} <span className="pill">{rows.length}</span></h2><b>{money(tot.gross)}</b></header>
                {!rows.length ? <p className="muted small">Kalem yok.</p> : (
                  <div className="lc-tablewrap">
                    <table className="lc-table">
                      <thead><tr><th>Kalem</th><th>Hesap</th><th className="num">Tahmini</th><th className="num">Gerçekleşen</th><th>Durum</th><th aria-label="İşlemler" /></tr></thead>
                      <tbody>
                        {rows.map((i) => {
                          const locked = Boolean(i.entry && i.entry.status === "paid");
                          return (
                            <tr key={i.id} className={i.status === "cancelled" ? "is-cancelled" : ""}>
                              <td><strong>{i.name}</strong><small>{[i.category, i.supplier].filter(Boolean).join(" · ") || "—"}</small></td>
                              <td className="lc-table__calc">{costLine(i, s)}</td>
                              <td className="num"><b>{money(i.gross)}</b><small>KDV {money(i.vat)}</small></td>
                              <td className="num">
                                <NumInput value={i.actual ?? ""} label={`${i.name} gerçekleşen`} disabled={!editable || locked} placeholder="—" onCommit={(v) => costs.call("PATCH", `/${i.id}`, { actual: v }, "Gerçekleşen kaydedildi.")} />
                                {i.variance != null && <small className={i.variance > 0 ? "text-red" : "text-green"}>{i.variance > 0 ? "+" : ""}{money(i.variance)}</small>}
                              </td>
                              <td>
                                {editable && !locked ? (
                                  <select className="select-sm lc-status" style={{ "--pc": COST_STATUS_COLORS[i.status] }} value={i.status} onChange={(e) => costs.call("PATCH", `/${i.id}`, { status: e.target.value })} aria-label={`${i.name} durumu`}>
                                    {meta.statuses.map((st) => <option key={st.key} value={st.key}>{kind === "revenue" ? st.revenue_label : st.label}</option>)}
                                  </select>
                                ) : <span className="pill" style={{ color: COST_STATUS_COLORS[i.status] }}>{statusLabel(i)}</span>}
                                {i.entry_id && <small className="lc-posted"><Icon name="link" size={10} /> Muhasebede</small>}
                              </td>
                              <td>{editable && <MenuButton label={`${i.name} işlemleri`} items={[
                                { label: "Düzenle", icon: "pencil", onClick: () => setDialog({ item: i, kind: i.kind }) },
                                { label: i.entry_id ? "Muhasebe kaydını güncelle" : "Muhasebeye işle", icon: "wallet", onClick: () => setPosting(i) },
                                "-",
                                { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Kalemi sil", message: i.entry_id ? "Muhasebeye işlenmiş kayıt proje bütçesinde ve hesapta kalır; yalnız maliyet kalemi silinir." : `"${i.name}" kalemi silinsin mi?`, confirmLabel: "Sil", danger: true })) costs.call("DELETE", `/${i.id}`, undefined, "Kalem silindi."); } },
                              ]} />}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
          <p className="muted small">Muhasebeye işlenen kalemler <button type="button" className="link-btn" onClick={() => ctx.setTab("budget")}>Bütçe</button> sekmesinde ve bağlı hesapta görünür. Bütçedeki tüm kayıtlar: gider {money(data.finance.estimate_expense)} · gelir {money(data.finance.estimate_income)} · ödenen {money(data.finance.paid_expense)}.</p>
        </div>

        <aside className="lc-costside">
          <section className="card">
            <header className="card__head"><h2 className="card__title"><Icon name="sliders" /> Hesap ayarları</h2></header>
            <div className="lc-settings">
              <label>Katılımcı <NumInput value={costing.participants ?? ""} placeholder={data.defaults.participants != null ? `${data.defaults.participants} (künye)` : "—"} label="Katılımcı sayısı" disabled={!editable} onCommit={(v) => setCosting({ participants: v })} /></label>
              <label>Takım <NumInput value={costing.teams ?? ""} placeholder={data.defaults.teams != null ? `${data.defaults.teams} (künye)` : "—"} label="Takım sayısı" disabled={!editable} onCommit={(v) => setCosting({ teams: v })} /></label>
              <label>Hedef kâr marjı <NumInput value={costing.margin_pct} suffix="%" label="Hedef kâr marjı" disabled={!editable} onCommit={(v) => setCosting({ margin_pct: v ?? 0 })} /></label>
              <label>Beklenmeyen gider payı <NumInput value={costing.contingency_pct} suffix="%" label="Beklenmeyen gider payı" disabled={!editable} onCommit={(v) => setCosting({ contingency_pct: v ?? 0 })} /></label>
              <label>Sponsor paketi <NumInput value={costing.sponsor_price ?? ""} suffix="₺" placeholder={be.sponsors?.price ? String(be.sponsors.price) : "—"} label="Sponsor paketi fiyatı" disabled={!editable} onCommit={(v) => setCosting({ sponsor_price: v })} /></label>
            </div>
            <p className="muted small">Boş bırakılan katılımcı / takım sayısı künyedeki beklenen değerden alınır.</p>
          </section>
          <section className="card">
            <header className="card__head"><h2 className="card__title"><Icon name="tag" /> Satış fiyatı</h2></header>
            <p className="lc-big">{s.pricing.price_per_team != null ? <>{money(s.pricing.price_per_team)} <small>/ takım</small></> : s.pricing.price_per_participant != null ? <>{money(s.pricing.price_per_participant)} <small>/ katılımcı</small></> : "—"}</p>
            <p className="muted small">%{num(s.pricing.margin_pct)} kâr marjı için gereken gelir {money(s.pricing.required_revenue)}{s.pricing.other_revenue ? ` (sabit gelirler ${money(s.pricing.other_revenue)} düşüldü)` : ""}.{s.pricing.price_per_team != null && s.pricing.price_per_participant != null ? ` Katılımcı başı: ${money(s.pricing.price_per_participant)}.` : ""}</p>
          </section>
          <section className="card">
            <header className="card__head"><h2 className="card__title"><Icon name="arrows" /> Başabaş noktası</h2></header>
            <ul className="lc-be">
              {be.participants && <li><span>Katılımcı</span><b>{be.participants.units != null ? num(be.participants.units) : "—"}</b><small>{be.participants.units != null ? `birim katkı ${money(be.participants.unit_revenue - be.participants.unit_cost)}` : be.participants.reason}</small></li>}
              {be.teams && <li><span>Takım</span><b>{be.teams.units != null ? num(be.teams.units) : "—"}</b><small>{be.teams.units != null ? `birim katkı ${money(be.teams.unit_revenue - be.teams.unit_cost)}` : be.teams.reason}</small></li>}
              {be.sponsors && <li><span>Sponsor</span><b>{num(be.sponsors.units)}</b><small>{money(be.sponsors.price)} paketle {money(be.sponsors.gap)} açık</small></li>}
              {!be.participants && !be.teams && !be.sponsors && <li className="muted small">Katılımcı / takım başı gelir ya da sponsorluk kalemi ekleyince hesaplanır.</li>}
            </ul>
          </section>
          <section className="card">
            <header className="card__head"><h2 className="card__title"><Icon name="layers" /> Senaryolar</h2></header>
            <table className="lc-scen">
              <thead><tr><th /><th>Maliyet</th><th>Katılım</th><th className="num">Kâr</th></tr></thead>
              <tbody>
                {s.scenarios.map((sc) => (
                  <tr key={sc.key} className={`is-${sc.key}`}>
                    <th>{sc.label}</th>
                    <td>{sc.key === "realistic" ? "—" : <NumInput value={sc.cost_pct} suffix="%" label={`${sc.label} maliyet değişimi`} disabled={!editable} onCommit={(v) => setCosting({ scenarios: { [sc.key]: { cost_pct: v ?? 0 } } })} />}</td>
                    <td>{sc.key === "realistic" ? "—" : <NumInput value={sc.participants_pct} suffix="%" label={`${sc.label} katılım değişimi`} disabled={!editable} onCommit={(v) => setCosting({ scenarios: { [sc.key]: { participants_pct: v ?? 0 } } })} />}</td>
                    <td className={`num ${sc.profit < 0 ? "text-red" : "text-green"}`}><b>{money(sc.profit)}</b><small>{sc.margin != null ? `marj %${num(sc.margin)}` : ""}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {s.by_category.length > 0 && (
            <section className="card">
              <header className="card__head"><h2 className="card__title"><Icon name="grid" /> Kategori dağılımı</h2></header>
              <ul className="lc-cats">
                {s.by_category.map((x) => (
                  <li key={`${x.kind}-${x.category}`}>
                    <span>{x.category} {x.kind === "revenue" && <em>gelir</em>}</span>
                    <span className="lc-cats__bar"><span className={x.kind === "revenue" ? "is-rev" : ""} style={{ width: `${(x.planned / maxCat) * 100}%` }} />{x.actual > 0 && <i style={{ left: `${Math.min(100, (x.actual / maxCat) * 100)}%` }} title={`Gerçekleşen ${money(x.actual)}`} />}</span>
                    <b>{money(x.planned)}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {dialog && <ItemDialog item={dialog.item} kind={dialog.kind} meta={meta} suppliers={data.suppliers} summary={s} onClose={() => setDialog(null)}
        onSave={(body) => costs.call(dialog.item ? "PATCH" : "POST", dialog.item ? `/${dialog.item.id}` : "", body, dialog.item ? "Kalem güncellendi." : "Kalem eklendi.")} />}
      {posting && <PostDialog item={posting} projectId={project.id} onClose={() => setPosting(null)}
        onPost={async (body) => { const r = await costs.call("POST", `/${posting.id}/post`, body, (res) => (res.entry?.account_name ? `Muhasebeye işlendi: ${res.entry.account_name}` : "Proje bütçesine işlendi.")); if (r) changedFinance(); return r; }} />}
    </div>
  );
}
