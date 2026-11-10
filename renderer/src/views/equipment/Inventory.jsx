// Ekipman → Envanter (masaüstü): arama, süzgeçler, tablo / kart, toplu işlem,
// Excel / CSV dışa aktarma. Liste çevrimdışıyken önbellekten gelir.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { get, post, useCommand, useDebounced, useResource } from "../../api";
import { ALERTS, CONDITIONS, EXPORT_COLUMNS, STATUS_META, filterParams, fmtDay, money, num, qtyText, selectionSummary } from "../../lib/equipmentUtils";
import { saveRowsCsv, saveRowsXlsx } from "../projects/common";
import { BASE, CondBadge, Flags, StatusBadge, Thumb, useEq } from "./common";
import { BulkDialog } from "./dialogs";

const VIEW_KEY = "equipment:view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || "table"; } catch { return "table"; } };

export default function Inventory({ preset, openId }) {
  const eq = useEq();
  const confirm = useConfirm();
  const result = useResult();
  const searchRef = useRef(null);
  const [f, setF] = useState(() => ({ q: "", status: [], category_id: "", location_id: "", holder: "", alert: "", condition: "", tracking: "", tag: "", sort: "tag", include_retired: false, ...(preset || {}) }));
  useEffect(() => { if (preset) setF((x) => ({ ...x, status: [], category_id: "", location_id: "", holder: "", alert: "", ...preset })); }, [preset]);
  const [view, setView] = useState(readView);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(null);
  const q = useDebounced(f.q, 250);
  const params = useMemo(() => ({ ...filterParams({ ...f, q }), page_size: 500 }), [f, q]);
  const res = useResource(`${BASE}/items`, params);
  useEffect(() => { res.reload({ quiet: true }); }, [eq.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = res.data?.items || [];
  useEffect(() => setSelected((s) => s.filter((id) => items.some((i) => i.id === id))), [res.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useCommand("find", () => searchRef.current?.focus());
  useCommand("export", () => exportRows("xlsx"));

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const toggleStatus = (s) => setF((x) => ({ ...x, status: x.status.includes(s) ? x.status.filter((y) => y !== s) : [...x.status, s] }));
  const chooseView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* yoksay */ } };
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const all = items.length > 0 && items.every((i) => selected.includes(i.id));
  const sel = selectionSummary(items, selected);
  const picked = items.filter((i) => selected.includes(i.id));
  const filtered = ["category_id", "location_id", "holder", "alert", "condition", "tracking", "tag"].some((k) => f[k]) || f.status.length > 0 || Boolean(f.q);

  async function exportRows(kind) {
    const r = await get(`${BASE}/items`, { ...filterParams(f), export: 1 });
    const list = r.ok ? r.data.items : items;
    const rows = [EXPORT_COLUMNS.map((c) => c[0]), ...list.map((i) => EXPORT_COLUMNS.map(([, fn]) => { const v = fn(i); return v == null ? "" : String(v); }))];
    const name = `Ekipman-envanteri-${new Date().toISOString().slice(0, 10)}`;
    if (kind === "csv") saveRowsCsv(name, rows); else saveRowsXlsx(name, rows, "Envanter", { A: 90, B: 220, C: 200, M: 200, N: 180 });
  }
  const runBulk = async (action, value) => {
    const r = await post(`${BASE}/items/bulk`, { ids: selected, action, value }, { queue: false });
    if (result(r, r.ok ? `${r.data.updated} ekipman güncellendi${r.data.skipped?.length ? `, ${r.data.skipped.length} atlandı` : ""}.` : null)) {
      setBulk(null);
      if (action === "delete") setSelected([]);
      eq.bump();
    }
  };
  const bulkDelete = async () => {
    if (await confirm({ title: `${selected.length} ekipmanı sil`, message: "Seçilen kartlar kalıcı olarak silinir; zimmetteki ekipman atlanır.", confirmLabel: "Sil", danger: true })) runBulk("delete");
  };

  return (
    <>
      <div className="filters">
        <div className="search-input" style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 6 }}>
          <input ref={searchRef} type="search" value={f.q} onChange={set("q")} placeholder="Ara: ad, etiket, seri no, marka, kişi… (⌘F)" aria-label="Envanterde ara" />
        </div>
        <select className="select-sm" value={f.category_id} onChange={set("category_id")} aria-label="Kategori"><option value="">Tüm kategoriler</option>{(eq.meta?.categories || []).map((c) => <option key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.name}</option>)}<option value="none">Kategorisiz</option></select>
        <select className="select-sm" value={f.location_id} onChange={set("location_id")} aria-label="Konum"><option value="">Tüm konumlar</option>{(eq.meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{"  ".repeat(l.depth)}{l.name}</option>)}<option value="none">Konumsuz</option></select>
        <select className="select-sm" value={f.holder} onChange={set("holder")} aria-label="Zimmet"><option value="">Zimmet: hepsi</option><option value="any">Zimmette / çıkışta</option><option value="none">Kimsede değil</option>{(eq.holders || []).map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}</select>
        <select className="select-sm" value={f.alert} onChange={set("alert")} aria-label="Uyarı"><option value="">Uyarı: hepsi</option>{Object.entries(ALERTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="select-sm" value={f.sort} onChange={set("sort")} aria-label="Sıralama">{[["tag", "Etiket no"], ["name", "Ad"], ["value_desc", "Değer"], ["newest", "En yeni"], ["updated", "Son değişen"], ["location", "Konum"], ["category", "Kategori"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <Segmented size="sm" value={view} onChange={chooseView} ariaLabel="Görünüm" options={[{ value: "table", icon: "list", label: "Tablo" }, { value: "grid", icon: "grid", label: "Kart" }]} />
        <MenuButton icon="download" label="Dışa aktar (⌘E)" items={[{ label: "Excel (.xlsx)", icon: "download", onClick: () => exportRows("xlsx") }, { label: "CSV", icon: "download", onClick: () => exportRows("csv") }]} />
        {eq.perms.manage && <button type="button" className="btn btn--sm" onClick={eq.openImport}><Icon name="upload" size={13} /> İçe aktar</button>}
      </div>
      <div className="filters">
        {Object.entries(STATUS_META).map(([k, m]) => (
          <button key={k} type="button" className={`chip ${f.status.includes(k) ? "" : "chip--off"}`} style={f.status.includes(k) ? { background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color } : undefined} aria-pressed={f.status.includes(k)} onClick={() => toggleStatus(k)}><Icon name={m.icon} size={11} /> {m.label}</button>
        ))}
        <select className="select-sm" value={f.condition} onChange={set("condition")} aria-label="Kondisyon"><option value="">Kondisyon</option>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="select-sm" value={f.tracking} onChange={set("tracking")} aria-label="Takip türü"><option value="">Tekil + adetli</option><option value="unit">Tekil</option><option value="bulk">Adetli stok</option></select>
        {res.data?.tags?.length > 0 && <select className="select-sm" value={f.tag} onChange={set("tag")} aria-label="Etiket"><option value="">#etiket</option>{res.data.tags.map((t) => <option key={t} value={t}>#{t}</option>)}</select>}
        {filtered && <button type="button" className="link-btn small" onClick={() => setF((x) => ({ ...x, q: "", status: [], category_id: "", location_id: "", holder: "", alert: "", condition: "", tracking: "", tag: "" }))}>Süzgeçleri temizle</button>}
      </div>

      {selected.length > 0 && (
        <div className="eq-bulk" role="region" aria-label="Toplu işlemler">
          <strong>{sel.count} seçili · {money(sel.value)}</strong>
          {eq.perms.assign && <button type="button" className="btn btn--sm" disabled={!sel.assignable.length} onClick={() => eq.assign(items.filter((i) => sel.assignable.includes(i.id)))}>Toplu zimmet{sel.assignable.length !== sel.count ? ` (${sel.assignable.length})` : ""}</button>}
          {eq.perms.assign && <button type="button" className="btn btn--sm" onClick={() => eq.reserve(picked)}>Rezerve et</button>}
          {eq.perms.manage && <>
            <button type="button" className="btn btn--sm" onClick={() => setBulk("location")}>Konum</button>
            <button type="button" className="btn btn--sm" onClick={() => setBulk("status")}>Durum</button>
            <button type="button" className="btn btn--sm" onClick={() => setBulk("category")}>Kategori</button>
            <button type="button" className="btn btn--sm" onClick={() => setBulk("tags_add")}>#Etiket</button>
          </>}
          <button type="button" className="btn btn--sm" onClick={() => eq.labels(picked)}><Icon name="printer" size={12} /> Etiket</button>
          {eq.perms.manage && <button type="button" className="btn btn--sm" onClick={bulkDelete}><Icon name="trash" size={12} /> Sil</button>}
          <span className="spacer" />
          <button type="button" className="btn btn--sm" onClick={() => setSelected([])}>Seçimi kaldır</button>
        </div>
      )}
      <ErrorNote error={res.error && !res.data ? res.error : null} onRetry={res.reload} />
      {res.data && <div className="eq-totals" aria-live="polite"><span><b>{res.data.total}</b> kart</span><span><b>{num(res.data.totals.units)}</b> birim</span><span>Alış <b>{money(res.data.totals.purchase_value)}</b></span><span>Güncel <b>{money(res.data.totals.book_value)}</b></span>
        {!f.include_retired && <button type="button" className="link-btn small" onClick={() => setF((x) => ({ ...x, include_retired: true }))}>Kayıp / emekli olanları da göster</button>}</div>}

      {res.loading && !res.data ? <Spinner /> : res.data && !items.length ? (
        <Empty icon="box" title={filtered ? "Bu süzgeçlerle ekipman yok" : "Envanter boş"} text={filtered ? "Süzgeçleri temizleyip yeniden deneyin." : "Kamera, bilgisayar, ses ekipmanı, LED ekran, top, forma, kupa… ilk ekipmanı ekleyin (⌘N) ya da Excel'den aktarın."}
          action={!filtered && eq.perms.manage ? <button type="button" className="btn btn--primary" onClick={() => eq.edit(null)}><Icon name="plus" /> Yeni ekipman</button> : null} />
      ) : view === "grid" ? (
        <div className="eq-cards">{items.map((i) => (
          <div key={i.id} className={`eq-card ${selected.includes(i.id) ? "is-selected" : ""}`} role="button" tabIndex={0} aria-label={`${i.asset_tag} ${i.name}`} onClick={() => eq.openItem(i.id)} onKeyDown={(e) => { if (e.key === "Enter") eq.openItem(i.id); }}>
            <div className="eq-card__media" style={i.category_color ? { "--eqc": i.category_color } : undefined}>{i.photo_url ? <img src={i.photo_url} alt="" /> : <Thumb item={i} large />}</div>
            <label className="eq-card__check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`${i.name} seç`} /></label>
            <div className="eq-card__body">
              <span className="muted"><span className="eq-tag">{i.asset_tag}</span> {i.category_path.split(" › ").pop()}</span>
              <strong>{i.name}</strong>
              <span className="muted">{i.location_path || "Konum yok"}</span>
              {(i.holder || i.holders.length > 0) && <span className="muted"><Icon name="user" size={11} /> {i.holder?.name || i.holders.map((h) => h.name).join(", ")}</span>}
              <div className="eq-card__row"><StatusBadge status={i.status} /><b>{i.tracking === "bulk" ? `${num(i.available_quantity)}/${qtyText(i)}` : money(i.book_value, i.currency)}</b></div>
              <Flags item={i} />
            </div>
          </div>
        ))}</div>
      ) : (
        <div className="table-wrap">
          <table className="table eq-table">
            <thead><tr>
              <th style={{ width: 30 }}><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : items.map((i) => i.id))} aria-label="Tümünü seç" /></th>
              <th>Ekipman</th><th>Durum</th><th>Konum</th><th>Zimmet / kullanan</th><th>Kondisyon</th><th>Miktar</th><th style={{ textAlign: "right" }}>Güncel değer</th><th>Sonraki bakım</th>
            </tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id} className={openId === i.id ? "is-open" : ""} tabIndex={0} aria-label={`${i.asset_tag} ${i.name}`} onClick={() => eq.openItem(i.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) eq.openItem(i.id); }}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`${i.name} seç`} /></td>
                <td><div className="eq-name"><Thumb item={i} /><div><strong>{i.name}</strong><small><span className="eq-tag">{i.asset_tag}</span> {i.category_path}</small><Flags item={i} /></div></div></td>
                <td><StatusBadge status={i.status} /></td>
                <td className="eq-clip" title={i.location_path || undefined}>{i.location_path || <span className="muted">—</span>}</td>
                <td className="eq-clip">{i.holder ? <>{i.holder.name}{i.holder.due_at && <small className={i.holder.overdue ? "text-red" : "muted"} style={{ display: "block" }}>iade {fmtDay(i.holder.due_at)}</small>}</> : i.holders.length ? i.holders.map((h) => `${h.name} (${num(h.quantity)})`).join(", ") : <span className="muted">—</span>}</td>
                <td><CondBadge condition={i.condition} /></td>
                <td>{i.tracking === "bulk" ? <><b>{num(i.available_quantity)}</b> / {qtyText(i)}</> : "1"}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i.book_value != null ? money(i.book_value, i.currency) : <span className="muted">—</span>}</td>
                <td>{i.maintenance?.next_at ? <span className={i.maintenance.state === "overdue" ? "text-red" : ""}>{fmtDay(i.maintenance.next_at)}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {res.data && items.length < res.data.total && <p className="muted small">İlk {items.length} kart gösteriliyor; aramayı daraltın.</p>}
      {bulk && <BulkDialog action={bulk} meta={eq.meta} count={selected.length} onClose={() => setBulk(null)} onSubmit={(v) => runBulk(bulk, v)} />}
    </>
  );
}
