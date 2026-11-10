// Ekipman kartı (sağ panel): değer, zimmet, rezervasyon, bakım ve hareketler.
import React, { useEffect, useState } from "react";
import { Icon, MenuButton, OfflineNote, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { del, post, useResource } from "../../api";
import { CONDITIONS, EVENT_ICONS, EVENT_LABELS, code39Svg, daysLabel, fmtDateTime, fmtDay, money, num, qtyText } from "../../lib/equipmentUtils";
import { BASE, CondBadge, Flags, StatusBadge, Thumb, printReceipt, useEq } from "./common";

const Row = ({ label, children, wide }) => (children == null || children === "" || children === "—" ? null : <div className={wide ? "is-wide" : undefined}><dt>{label}</dt><dd>{children}</dd></div>);

export default function ItemPanel({ id, onClose }) {
  const eq = useEq();
  const confirm = useConfirm();
  const result = useResult();
  const res = useResource(`${BASE}/items/${id}`);
  const [tab, setTab] = useState("info");
  useEffect(() => { res.reload({ quiet: true }); }, [eq.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const d = res.data;
  const item = d?.item;
  if (!d) return <aside className="split__side drawer eq-panel-side" aria-label="Ekipman">{res.error ? <div className="error-note"><span>{res.error.message}</span></div> : <Spinner />}</aside>;
  const can = { assign: eq.perms.assign && item.can_edit, manage: eq.perms.manage && item.can_edit };
  const open = d.assignments.filter((a) => a.status === "open");
  const available = item.tracking === "bulk" ? item.available_quantity > 0 : item.status === "in_stock";
  const group = (a) => (a.group_id ? d.assignments.filter((x) => x.group_id === a.group_id) : [a]);
  const remove = async () => {
    if (!(await confirm({ title: "Ekipmanı sil", message: `${item.asset_tag} · ${item.name} kalıcı olarak silinsin mi? Kullanılmayan ekipman için "Emekli / hurda" önerilir.`, confirmLabel: "Sil", danger: true }))) return;
    if (result(await del(`${BASE}/items/${item.id}`), "Silindi.")) { eq.bump(); onClose(); }
  };
  const duplicate = async () => {
    const r = await post(`${BASE}/items/${item.id}/duplicate`, { count: 1 }, { queue: false });
    if (result(r, r.ok ? `${r.data.items[0].asset_tag} olarak kopyalandı.` : null)) { eq.bump(); eq.openItem(r.data.items[0].id); }
  };
  const barcode = code39Svg(item.asset_tag, { height: 38 });

  return (
    <aside className="split__side drawer eq-panel-side" aria-label={`${item.asset_tag} ${item.name}`}>
      <div className="drawer__head">
        <span className="eq-tag">{item.asset_tag}</span>
        <span className="spacer" />
        <MenuButton label="Diğer işlemler" items={[
          { label: "Etiket yazdır", icon: "printer", onClick: () => eq.labels([item]) },
          { label: "Arıza bildir", icon: "alert", onClick: () => eq.fault(item) },
          can.manage && { label: "Kopyala", icon: "copy", onClick: duplicate },
          can.manage && "-",
          can.manage && { label: "Sil", icon: "trash", danger: true, onClick: remove },
        ]} />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat" title="Kapat (esc)"><Icon name="x" /></button>
      </div>
      <OfflineNote offline={res.offline} savedAt={res.savedAt} />
      <div className="eq-head">
        <Thumb item={item} large />
        <div style={{ minWidth: 0 }}>
          <h2>{item.name}</h2>
          <div className="eq-flags"><StatusBadge status={item.status} /><CondBadge condition={item.condition} />{item.tracking === "bulk" && <span className="pill">{num(item.available_quantity)} / {qtyText(item)} depoda</span>}</div>
          <div style={{ marginTop: 4 }}><Flags item={item} /></div>
        </div>
      </div>
      <div className="eq-actions">
        {can.assign && available && <button type="button" className="btn btn--primary btn--sm" onClick={() => eq.assign([item])}><Icon name="user" size={13} /> Zimmetle / çıkış</button>}
        {can.assign && open.length === 1 && <button type="button" className="btn btn--primary btn--sm" onClick={() => eq.returnA(open[0])}><Icon name="undo" size={13} /> İade al</button>}
        {can.assign && <button type="button" className="btn btn--sm" onClick={() => eq.reserve([item])}><Icon name="calendar" size={13} /> Rezerve et</button>}
        {can.assign && <button type="button" className="btn btn--sm" onClick={() => eq.maintain(item)}><Icon name="wrench" size={13} /> Bakım</button>}
        {can.manage && <button type="button" className="btn btn--sm" onClick={() => eq.edit(item)}><Icon name="pencil" size={13} /> Düzenle</button>}
        {!can.assign && <button type="button" className="btn btn--sm" onClick={() => eq.fault(item)}><Icon name="alert" size={13} /> Arıza bildir</button>}
      </div>
      {!item.can_edit && <p className="muted small">Başka bir ilin ya da genel envanterin kaydı: görüntüleyebilir ve arıza bildirebilirsiniz.</p>}
      {open.map((a) => (
        <div key={a.id} className="eq-holder">
          <Icon name={a.kind === "checkout" ? "external" : "user"} />
          <div><strong>{a.holder_name}{item.tracking === "bulk" ? ` · ${num(a.quantity)} ${item.unit}` : ""}</strong><small>{a.kind_label} · {fmtDay(a.start_at)}{a.due_at ? ` → ${fmtDay(a.due_at)}` : " · süresiz"}{a.holder_phone ? ` · ${a.holder_phone}` : ""}</small>{a.overdue && <span className="pill pill--xs pill--red">İade gecikti</span>}</div>
          <button type="button" className="btn btn--sm" onClick={() => printReceipt(group(a))} title="Zimmet tutanağı"><Icon name="printer" size={13} /></button>
          {can.assign && open.length > 1 && <button type="button" className="btn btn--sm" onClick={() => eq.returnA(a)}>İade</button>}
        </div>
      ))}
      <Segmented size="sm" value={tab} onChange={setTab} ariaLabel="Ekipman bölümleri" options={[
        { value: "info", label: "Genel" },
        { value: "assign", label: "Zimmet", count: d.assignments.length || undefined },
        { value: "res", label: "Rezervasyon", count: d.reservations.filter((r) => r.status === "active").length || undefined },
        { value: "maint", label: "Bakım", count: d.maintenance.length || undefined },
        { value: "log", label: "Geçmiş" },
      ]} />

      {tab === "info" && (<>
        <div className="eq-value">
          <div className="eq-value__row"><span className="muted">Güncel değer</span><span className="muted">Alış değeri</span></div>
          <div className="eq-value__row"><span className="eq-value__big">{money(item.book_value, item.currency)}</span><span className="eq-value__big" style={{ opacity: 0.5 }}>{money(item.purchase_value, item.currency)}</span></div>
          {item.effective_life_years ? (<>
            <div className="eq-meter" aria-label={`Ömrün yüzde ${item.depreciation_ratio || 0} kullanıldı`}><span style={{ width: `${item.depreciation_ratio || 0}%` }} /></div>
            <span className="muted small">Doğrusal amortisman · {num(item.effective_life_years)} yıl · %{num(item.depreciation_ratio || 0)} kullanıldı{item.fully_depreciated ? " · tam amortisman" : ""}</span>
          </>) : <span className="muted small">Amortisman ömrü yok; güncel değer alış fiyatına eşit.</span>}
        </div>
        <dl className="eq-dl">
          <Row label="Kategori">{item.category_path || "—"}</Row>
          <Row label="Konum">{item.location_path || "—"}</Row>
          <Row label="Marka / model">{[item.brand, item.model].filter(Boolean).join(" ") || "—"}</Row>
          <Row label="Seri no">{item.serial_no || "—"}</Row>
          <Row label="Barkod">{item.barcode || "—"}</Row>
          <Row label="Miktar">{item.tracking === "bulk" ? `${qtyText(item)} · zimmette ${num(item.assigned_quantity)}${item.min_quantity != null ? ` · min ${num(item.min_quantity)}` : ""}` : "Tekil"}</Row>
          <Row label="Alış">{item.purchase_date ? fmtDay(item.purchase_date) : "—"}</Row>
          <Row label="Fiyat">{item.purchase_price != null ? money(item.purchase_price, item.currency) : "—"}</Row>
          <Row label="Tedarikçi">{item.supplier || "—"}</Row>
          <Row label="Fatura no">{item.invoice_no || "—"}</Row>
          <Row label="Garanti">{item.warranty_until ? `${fmtDay(item.warranty_until)} (${daysLabel(item.warranty.days_left)})` : "—"}</Row>
          <Row label="Sigorta">{item.insurance_until || item.insurance_policy ? `${[item.insurance_company, item.insurance_policy].filter(Boolean).join(" · ")}${item.insurance_until ? ` · ${fmtDay(item.insurance_until)}` : ""}` : "—"}</Row>
          <Row label="Bakım" wide>{item.maintenance?.next_at || item.maintenance?.interval_days ? `${item.maintenance.interval_days ? `Her ${item.maintenance.interval_days} gün` : "Planlı"}${item.last_maintenance_at ? ` · son ${fmtDay(item.last_maintenance_at)}` : ""}${item.maintenance.next_at ? ` · sonraki ${fmtDay(item.maintenance.next_at)} (${daysLabel(item.maintenance.days_left)})` : ""}` : "—"}</Row>
          {item.tags?.length > 0 && <Row label="Etiketler" wide>{item.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</Row>}
          {item.notes && <Row label="Notlar" wide><span style={{ whiteSpace: "pre-wrap" }}>{item.notes}</span></Row>}
        </dl>
        {item.links?.length > 0 && <div className="drawer__section"><h4>Belgeler</h4>{item.links.map((l, i) => <button key={i} type="button" className="link-btn" style={{ textAlign: "left" }} onClick={() => window.elitlig.app.openExternal(l.url)}><Icon name="paperclip" size={12} /> {l.label || l.url}</button>)}</div>}
        {(d.parent || d.children.length > 0) && (
          <div className="drawer__section">
            <h4>{d.parent ? "Ana ekipman" : `Kit / aksesuarlar (${d.children.length})`}</h4>
            {d.parent && <button type="button" className="eq-rec" style={{ textAlign: "left" }} onClick={() => eq.openItem(d.parent.id)}><div><strong>{d.parent.name}</strong><small>{d.parent.asset_tag}</small></div></button>}
            {d.children.map((c) => <button key={c.id} type="button" className="eq-rec" style={{ textAlign: "left" }} onClick={() => eq.openItem(c.id)}><div><strong>{c.name}</strong><small>{c.asset_tag}{c.serial_no ? ` · SN ${c.serial_no}` : ""}</small></div><StatusBadge status={c.status} /></button>)}
          </div>
        )}
        {barcode && <div className="eq-barcode"><span dangerouslySetInnerHTML={{ __html: barcode }} /><span>{item.asset_tag}</span></div>}
        <p className="muted small">Eklendi {fmtDateTime(item.created_at)} · son değişiklik {fmtDateTime(item.updated_at)}</p>
      </>)}

      {tab === "assign" && (d.assignments.length ? d.assignments.map((a) => (
        <div key={a.id} className="eq-rec">
          <div><strong>{a.holder_name}{item.tracking === "bulk" ? ` · ${num(a.quantity)} ${item.unit}` : ""}</strong>
            <small>{a.kind_label} · {fmtDateTime(a.start_at)} → {a.returned_at ? fmtDateTime(a.returned_at) : a.due_at ? `beklenen ${fmtDay(a.due_at)}` : "süresiz"}</small>
            {(a.purpose || a.match_label || a.project_name) && <small>{[a.purpose, a.match_label, a.project_name].filter(Boolean).join(" · ")}</small>}
            {(a.note_out || a.note_in) && <small>{[a.note_out && `Teslim: ${a.note_out}`, a.note_in && `İade: ${a.note_in}`].filter(Boolean).join(" · ")}</small>}</div>
          <div className="eq-rec__side">
            <span className={`pill pill--xs ${a.status === "open" ? (a.overdue ? "pill--red" : "pill--blue") : a.status === "lost" ? "pill--red" : "pill--green"}`}>{a.status === "open" ? (a.overdue ? "Gecikti" : "Açık") : a.status === "lost" ? "Kayıp" : "İade"}</span>
            {(a.condition_out || a.condition_in) && <small>{CONDITIONS[a.condition_out] || "—"} → {CONDITIONS[a.condition_in] || "—"}</small>}
            <button type="button" className="btn btn--sm" onClick={() => printReceipt(group(a))}><Icon name="printer" size={12} /> Tutanak</button>
          </div>
        </div>
      )) : <p className="muted">Henüz zimmet yok.</p>)}

      {tab === "res" && (d.reservations.length ? d.reservations.map((r) => (
        <div key={r.id} className="eq-rec"><div><strong>{r.title}</strong><small>{fmtDateTime(r.start_at)} – {fmtDateTime(r.end_at)}{r.holder_name ? ` · ${r.holder_name}` : ""}</small>{(r.match_label || r.project_name) && <small>{[r.match_label, r.project_name].filter(Boolean).join(" · ")}</small>}</div>
          <span className={`pill pill--xs ${r.status === "active" ? "pill--blue" : ""}`}>{r.status === "active" ? "Etkin" : r.status === "fulfilled" ? "Çıkış yapıldı" : "İptal"}</span></div>
      )) : <p className="muted">Rezervasyon yok.</p>)}

      {tab === "maint" && (d.maintenance.length ? d.maintenance.map((m) => (
        <div key={m.id} className="eq-rec"><div><strong>{m.title}</strong><small>{m.kind_label} · {fmtDay(m.performed_at || m.created_at)}{m.vendor ? ` · ${m.vendor}` : ""}</small>{m.description && <small>{m.description}</small>}</div>
          <div className="eq-rec__side"><span className={`pill pill--xs ${m.status === "done" ? "pill--green" : m.status === "cancelled" ? "" : "pill--amber"}`}>{m.status_label}</span>{m.cost != null && <b>{money(m.cost)}</b>}
            {can.assign && ["open", "in_progress"].includes(m.status) && <button type="button" className="btn btn--sm" onClick={() => eq.maintain(item, m, true)}>Tamamla</button>}</div></div>
      )) : <p className="muted">Bakım kaydı yok.</p>)}

      {tab === "log" && (d.events.length ? (
        <ul className="eq-timeline">{d.events.map((e) => <li key={e.id}><span className="eq-timeline__icon"><Icon name={EVENT_ICONS[e.action] || "circle"} size={13} /></span><div><b>{EVENT_LABELS[e.action] || e.action}</b> · {e.summary}<small>{e.user_name} · {fmtDateTime(e.created_at)}</small></div></li>)}</ul>
      ) : <p className="muted">Hareket yok.</p>)}
    </aside>
  );
}
