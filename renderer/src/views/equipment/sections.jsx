// Ekipman (masaüstü) bölümleri: Pano, Kimde ne var, Rezervasyon, Bakım,
// Hareketler, Kategori ve konum. Okumalar useResource ile (çevrimdışı önbellek).
import React, { useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, Segmented, Spinner, useConfirm, useResult } from "../../components/ui";
import { del, patch, post, useResource } from "../../api";
import { EVENT_ICONS, EVENT_LABELS, LOCATION_KINDS, daysFrom, daysLabel, fmtDateTime, fmtDay, includesFold, money, num } from "../../lib/equipmentUtils";
import { BASE, printReceipt, useEq } from "./common";
import { ExtendDialog } from "./dialogs";

const useVersioned = (res) => {
  const eq = useEq();
  useEffect(() => { res.reload({ quiet: true }); }, [eq.version]); // eslint-disable-line react-hooks/exhaustive-deps
  return res;
};

const Kpi = ({ label, value, hint, tone = "", hero = false, onClick }) => {
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} className={`kpi ${hero ? "kpi--hero" : ""} ${tone === "alert" ? "kpi--alert" : tone ? `kpi--${tone}` : ""}`} onClick={onClick}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</Tag>;
};

const Bars = ({ rows, measure = (r) => r.value, text = (r) => money(r.value), onPick }) => {
  const max = Math.max(1, ...rows.map(measure));
  return <div className="eq-bars">{rows.map((r) => (
    <button key={r.key} type="button" className="eq-bar" onClick={() => onPick?.(r)} title={`${r.label}: ${r.count} kart`}>
      <span className="eq-bar__label">{r.label}</span><span className="eq-bar__track"><span style={{ width: `${Math.max(3, (measure(r) / max) * 100)}%` }} /></span><span className="eq-bar__val">{r.count} · {text(r)}</span>
    </button>
  ))}</div>;
};

function AlertCard({ title, icon, rows, empty, more }) {
  const eq = useEq();
  return (
    <section className="card">
      <header className="card__head"><h2 className="card__title"><Icon name={icon} /> {title}{rows.length ? <span className="pill">{rows.length}</span> : null}</h2>{more && <button type="button" className="link-btn" onClick={more}>Tümü →</button>}</header>
      {rows.length ? <ul className="eq-list">{rows.slice(0, 6).map((r) => (
        <li key={r.key}><button type="button" className="eq-list__main" onClick={() => eq.openItem(r.id)}><strong>{r.title}</strong><small>{r.sub}</small></button><span className={`eq-list__when ${r.late ? "is-late" : ""}`}>{r.when}</span></li>
      ))}</ul> : <p className="muted small">{empty}</p>}
    </section>
  );
}

/* ----------------------------------- pano ----------------------------------- */

export function Dashboard() {
  const eq = useEq();
  const dash = useVersioned(useResource(`${BASE}/dashboard`));
  const mine = useVersioned(useResource(`${BASE}/mine`));
  const d = dash.data;
  if (!d) return dash.error ? <ErrorNote error={dash.error} onRetry={dash.reload} /> : <Spinner />;
  const t = d.totals;
  const go = (preset) => eq.goInventory(preset);
  if (!t.items && !t.retired && !t.lost) {
    return <Empty icon="box" title="Envanter henüz boş" text="Organizasyonun tüm ekipmanını tek yerde izleyin: nerede, kimde, ne kadar değerli, bakımı ne zaman."
      action={eq.perms.manage ? <div style={{ display: "flex", gap: 8, justifyContent: "center" }}><button type="button" className="btn btn--primary" onClick={() => eq.edit(null)}><Icon name="plus" /> Yeni ekipman</button>{!eq.meta?.categories?.length && <button type="button" className="btn" onClick={eq.seedCategories}><Icon name="sparkles" /> Önerilen kategoriler</button>}<button type="button" className="btn" onClick={eq.openImport}><Icon name="upload" /> Excel'den aktar</button></div> : null} />;
  }
  const a = d.alerts;
  return (
    <>
      <div className="eq-kpis">
        <Kpi hero label="Toplam ekipman" value={num(t.items)} hint={`${num(t.units)} birim · ${t.holders} kişide`} onClick={() => go({})} />
        <Kpi label="Alış değeri" value={money(t.purchase_value)} />
        <Kpi label="Güncel değer" value={money(t.book_value)} hint={`Amortisman ${money(t.depreciation)}`} tone="blue" />
        <Kpi label="Zimmetli / kullanımda" value={`${t.assigned} / ${t.in_use}`} hint={`${t.open_assignments} açık teslim`} onClick={() => go({ holder: "any" })} />
        <Kpi label="Depoda" value={num(t.in_stock)} tone="green" onClick={() => go({ status: ["in_stock"] })} />
        <Kpi label="Bakımda / arızalı" value={`${t.maintenance} / ${t.broken}`} tone={t.broken ? "alert" : "amber"} onClick={() => go({ status: ["maintenance", "broken"] })} />
        <Kpi label="Geciken iade" value={num(t.overdue_returns)} tone={t.overdue_returns ? "alert" : ""} onClick={() => go({ alert: "overdue" })} />
        <Kpi label="Bakım zamanı" value={num(t.maintenance_due)} hint={t.maintenance_overdue ? `${t.maintenance_overdue} gecikti` : "14 gün içinde"} tone={t.maintenance_overdue ? "alert" : ""} onClick={() => eq.go("bakim")} />
        <Kpi label="Garanti / sigorta" value={`${t.warranty_soon} / ${t.insurance_soon}`} hint="30 gün içinde bitiyor" onClick={() => go({ alert: "warranty" })} />
        <Kpi label="Düşük stok" value={num(t.low_stock)} tone={t.low_stock ? "alert" : ""} onClick={() => go({ alert: "low_stock" })} />
      </div>
      {mine.data?.items?.length > 0 && (
        <section className="card">
          <header className="card__head"><h2 className="card__title"><Icon name="user" /> Benim üzerimdeki ekipman ({mine.data.items.length})</h2><button type="button" className="btn btn--sm" onClick={() => printReceipt(mine.data.items)}><Icon name="printer" size={13} /> Tutanak</button></header>
          <ul className="eq-list">{mine.data.items.map((x) => (
            <li key={x.id}><button type="button" className="eq-list__main" onClick={() => eq.openItem(x.item_id)}><strong>{x.item_name}</strong><small>{x.asset_tag} · {x.kind_label}</small></button><span className={`eq-list__when ${x.overdue ? "is-late" : ""}`}>{x.due_at ? `iade ${fmtDay(x.due_at)}` : "süresiz"}</span></li>
          ))}</ul>
        </section>
      )}
      <div className="eq-grid2">
        <section className="card"><header className="card__head"><h2 className="card__title"><Icon name="layers" /> Kategoriye göre değer</h2></header>{d.by_category.length ? <Bars rows={d.by_category} onPick={(r) => go({ category_id: r.key && r.key !== "none" ? String(r.key) : "none" })} /> : <p className="muted small">Veri yok.</p>}</section>
        <section className="card"><header className="card__head"><h2 className="card__title"><Icon name="map" /> Konuma göre dağılım</h2></header>{d.by_location.length ? <Bars rows={d.by_location} measure={(r) => r.count} onPick={(r) => go({ location_id: r.key && r.key !== "none" ? String(r.key) : "none" })} /> : <p className="muted small">Veri yok.</p>}</section>
        <AlertCard title="Geciken iadeler" icon="clock" empty="Geciken iade yok." rows={a.overdue_returns.map((x) => ({ key: x.id, id: x.item_id, title: x.item_name, sub: `${x.asset_tag} · ${x.holder_name}`, when: `${x.days_late} gün gecikti`, late: true }))} />
        <AlertCard title="Bakım takvimi" icon="wrench" empty="Yaklaşan bakım yok." more={() => eq.go("bakim")} rows={a.maintenance.map((m) => ({ key: m.id, id: m.id, title: m.name, sub: m.asset_tag, when: daysLabel(m.days_left), late: m.state === "overdue" }))} />
        <AlertCard title="Garanti ve sigorta" icon="shield" empty="30 günde biten garanti / sigorta yok." rows={[...a.warranty.map((w) => ({ key: `w${w.id}`, id: w.id, title: w.name, sub: `${w.asset_tag} · garanti`, when: daysLabel(w.days_left) })), ...a.insurance.map((w) => ({ key: `i${w.id}`, id: w.id, title: w.name, sub: `${w.asset_tag} · sigorta`, when: daysLabel(w.days_left), late: w.state === "expired" }))]} />
        <AlertCard title="Düşük stok" icon="box" empty="Minimum stok altında ürün yok." rows={a.low_stock.map((s) => ({ key: s.id, id: s.id, title: s.name, sub: `${s.asset_tag} · min ${num(s.min_quantity)}`, when: `${num(s.available)} kaldı`, late: true }))} />
        <AlertCard title="Açık arıza / servis" icon="alert" empty="Açık arıza yok." more={() => eq.go("bakim")} rows={a.faults.map((x) => ({ key: x.id, id: x.item_id, title: x.item_name, sub: x.title, when: fmtDay(x.created_at), late: x.status === "open" }))} />
        <AlertCard title="Yaklaşan rezervasyonlar" icon="calendar" empty="Rezervasyon yok." more={() => eq.go("rezervasyon")} rows={d.reservations.map((r) => ({ key: r.id, id: r.item_id, title: r.title, sub: r.item_name, when: fmtDay(r.start_at) }))} />
        <section className="card">
          <header className="card__head"><h2 className="card__title"><Icon name="activity" /> Son hareketler</h2><button type="button" className="link-btn" onClick={() => eq.go("gecmis")}>Tümü →</button></header>
          {d.recent.length ? <ul className="eq-timeline">{d.recent.slice(0, 7).map((e) => <li key={e.id}><span className="eq-timeline__icon"><Icon name={EVENT_ICONS[e.action] || "circle"} size={13} /></span><div><b>{e.item_name}</b> · {e.summary}<small>{e.user_name} · {fmtDateTime(e.created_at)}</small></div></li>)}</ul> : <p className="muted small">Henüz hareket yok.</p>}
        </section>
      </div>
    </>
  );
}

/* ------------------------------- kimde ne var ------------------------------- */

export function Holders() {
  const eq = useEq();
  const confirm = useConfirm();
  const result = useResult();
  const res = useVersioned(useResource(`${BASE}/holders`));
  const [q, setQ] = useState("");
  const [late, setLate] = useState(false);
  const [extend, setExtend] = useState(null);
  const list = useMemo(() => (res.data?.items || []).filter((h) => (!late || h.overdue) && (!q || includesFold(`${h.name} ${h.items.map((i) => `${i.item_name} ${i.asset_tag}`).join(" ")}`, q))), [res.data, q, late]);
  const returnAll = async (h, gid) => {
    if (!(await confirm({ title: "Tümünü iade al", message: `${h.name} üzerindeki bu teslimdeki kalemler "İyi" kondisyonla depoya alınacak.`, confirmLabel: "İade al" }))) return;
    if (result(await post(`${BASE}/groups/${gid}/return`, { condition: "good" }, { queue: false }), "İade alındı.")) eq.bump();
  };
  return (
    <>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi ya da ekipman ara" aria-label="Kişi ya da ekipman ara" style={{ flex: "1 1 240px" }} />
        <button type="button" className={`chip ${late ? "" : "chip--off"}`} aria-pressed={late} onClick={() => setLate((v) => !v)}><Icon name="clock" size={11} /> Yalnız gecikenler</button>
      </div>
      <ErrorNote error={res.error && !res.data ? res.error : null} onRetry={res.reload} />
      {!res.data ? <Spinner /> : !list.length ? <Empty icon="user" title={res.data.items.length ? "Eşleşen kişi yok" : "Kimsede zimmetli ekipman yok"} text="Envanterden ekipman seçip Zimmetle ile kişiye teslim edin." /> : (
        <div className="eq-holders">{list.map((h) => {
          const groups = [...new Set(h.items.map((i) => i.group_id).filter(Boolean))];
          return (
            <section key={h.key} className="card">
              <header className="card__head"><h2 className="card__title"><span className="avatar">{(h.name[0] || "?").toLocaleUpperCase("tr-TR")}</span><span>{h.name}<small className="muted" style={{ display: "block", fontWeight: 500, fontSize: 11 }}>{h.holder_type === "user" ? "Yönetim" : h.holder_type === "staff" ? "Personel" : "Dış kişi"} · {h.count} kalem · {money(h.value)}{h.phone ? ` · ${h.phone}` : ""}</small></span></h2>{h.overdue > 0 && <span className="pill pill--red">{h.overdue} gecikti</span>}</header>
              <ul className="eq-list">{h.items.map((x) => (
                <li key={x.id}>
                  <button type="button" className="eq-list__main" onClick={() => eq.openItem(x.item_id)}><strong>{x.item_name}{x.item_tracking === "bulk" ? ` · ${num(x.quantity)} ${x.item_unit}` : ""}</strong><small>{x.asset_tag} · {x.kind_label} · {fmtDay(x.start_at)}{x.due_at ? ` → ${fmtDay(x.due_at)}` : ""}</small></button>
                  {x.overdue && <span className="eq-list__when is-late">{daysLabel(daysFrom(x.due_at))}</span>}
                  {eq.perms.assign && <button type="button" className="icon-btn" onClick={() => setExtend(x)} aria-label="İade tarihini değiştir" title="İade tarihini değiştir"><Icon name="clock" size={14} /></button>}
                  {eq.perms.assign && <button type="button" className="btn btn--sm" onClick={() => eq.returnA(x)}>İade al</button>}
                </li>
              ))}</ul>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn--sm" onClick={() => printReceipt(h.items)}><Icon name="printer" size={12} /> Tutanak</button>
                <button type="button" className="btn btn--sm" onClick={() => printReceipt(h.items, { pdf: true })}><Icon name="download" size={12} /> PDF</button>
                {eq.perms.assign && groups.length === 1 && h.items.length > 1 && <button type="button" className="btn btn--sm" onClick={() => returnAll(h, groups[0])}><Icon name="undo" size={12} /> Tümünü iade al</button>}
              </div>
            </section>
          );
        })}</div>
      )}
      {extend && <ExtendDialog assignment={extend} onClose={() => setExtend(null)} onDone={() => { setExtend(null); eq.bump(); }} />}
    </>
  );
}

/* -------------------------------- rezervasyon -------------------------------- */

export function Reservations() {
  const eq = useEq();
  const confirm = useConfirm();
  const result = useResult();
  const [range, setRange] = useState("upcoming");
  const today = new Date().toISOString().slice(0, 10);
  const res = useVersioned(useResource(`${BASE}/reservations`, range === "past" ? { status: "all", to: today } : range === "all" ? { status: "all" } : { status: "active", from: today }));
  const groups = useMemo(() => {
    const m = new Map();
    (res.data?.items || []).forEach((r) => { const k = String(r.start_at).slice(0, 10); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()].sort((a, b) => (range === "past" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
  }, [res.data, range]);
  const checkout = async (r) => {
    const x = await post(`${BASE}/reservations/${r.id}/checkout`, { holder_name: r.holder_name || r.title }, { queue: false });
    if (result(x, "Çıkış yapıldı.")) { eq.bump(); if (x.data?.items?.length) eq.offerReceipt(x.data.items); }
  };
  const cancel = async (r) => {
    if (!(await confirm({ title: "Rezervasyonu iptal et", message: `${r.title} · ${r.item_name}`, confirmLabel: "İptal et", danger: true }))) return;
    if (result(await patch(`${BASE}/reservations/${r.id}`, { status: "cancelled" }), "İptal edildi.")) eq.bump();
  };
  return (
    <>
      <div className="filters">
        <Segmented size="sm" value={range} onChange={setRange} ariaLabel="Aralık" options={[{ value: "upcoming", label: "Yaklaşan" }, { value: "past", label: "Geçmiş" }, { value: "all", label: "Tümü" }]} />
        <span className="spacer" />
        {eq.perms.assign && <button type="button" className="btn btn--sm btn--primary" onClick={() => eq.goInventory({}, "Rezerve edilecek ekipmanı seçip Rezerve et'e basın.")}><Icon name="plus" size={13} /> Yeni rezervasyon</button>}
      </div>
      <ErrorNote error={res.error && !res.data ? res.error : null} onRetry={res.reload} />
      {!res.data ? <Spinner /> : !groups.length ? <Empty icon="calendar" title="Rezervasyon yok" text="Maç, turnuva ya da etkinlik için ekipmanı önceden ayırın; çakışmalar uyarılır." /> : groups.map(([day, rows]) => (
        <div key={day} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eq-day">{fmtDay(day, { weekday: "long", day: "numeric", month: "long" })}</span>
          {rows.map((r) => (
            <div key={r.id} className="eq-rec">
              <div><strong>{r.title}</strong><small><button type="button" className="link-btn" onClick={() => eq.openItem(r.item_id)}>{r.asset_tag} · {r.item_name}</button>{r.item_tracking === "bulk" ? ` · ${num(r.quantity)} ${r.item_unit}` : ""}</small><small>{fmtDateTime(r.start_at)} – {fmtDateTime(r.end_at)}{r.holder_name ? ` · ${r.holder_name}` : ""}{r.match_label ? ` · ${r.match_label}` : ""}{r.project_name ? ` · ${r.project_name}` : ""}</small></div>
              <div className="eq-rec__side">
                <span className={`pill pill--xs ${r.status === "active" ? "pill--blue" : ""}`}>{r.status === "active" ? "Etkin" : r.status === "fulfilled" ? "Çıkış yapıldı" : "İptal"}</span>
                {eq.perms.assign && r.status === "active" && <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => checkout(r)}>Çıkış yap</button>
                  <button type="button" className="btn btn--sm" onClick={() => eq.reserve([{ id: r.item_id, name: r.item_name, asset_tag: r.asset_tag, tracking: r.item_tracking, unit: r.item_unit, quantity: r.quantity }], r)}>Düzenle</button>
                  <button type="button" className="btn btn--sm" onClick={() => cancel(r)}>İptal</button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/* ----------------------------------- bakım ----------------------------------- */

export function Maintenance() {
  const eq = useEq();
  const result = useResult();
  const [days, setDays] = useState(60);
  const res = useVersioned(useResource(`${BASE}/maintenance`, { days }));
  const d = res.data;
  const setStatus = async (m, status) => { if (result(await patch(`${BASE}/maintenance/${m.id}`, { status }), status === "in_progress" ? "Servise alındı." : "İptal edildi.")) eq.bump(); };
  if (!d) return res.error ? <ErrorNote error={res.error} onRetry={res.reload} /> : <Spinner />;
  return (
    <div className="eq-grid2">
      <section className="card">
        <header className="card__head"><h2 className="card__title"><Icon name="calendar" /> Bakım takvimi</h2><select className="select-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Aralık"><option value={14}>14 gün</option><option value={30}>30 gün</option><option value={60}>60 gün</option><option value={180}>6 ay</option><option value={365}>1 yıl</option></select></header>
        {d.due.length ? <ul className="eq-list">{d.due.map((m) => (
          <li key={m.id}><button type="button" className="eq-list__main" onClick={() => eq.openItem(m.id)}><strong>{m.name}</strong><small>{m.asset_tag}{m.interval_days ? ` · her ${m.interval_days} gün` : ""}{m.last_at ? ` · son ${fmtDay(m.last_at)}` : ""}</small></button>
            <span className={`eq-list__when ${m.state === "overdue" ? "is-late" : ""}`}>{fmtDay(m.next_at)} · {daysLabel(m.days_left)}</span>
            {eq.perms.assign && <button type="button" className="btn btn--sm" onClick={() => eq.maintain({ id: m.id, name: m.name, asset_tag: m.asset_tag })}>Yapıldı</button>}</li>
        ))}</ul> : <p className="muted small">Bu aralıkta planlı bakım yok. Karta ya da kategoriye bakım aralığı girin.</p>}
      </section>
      <section className="card">
        <header className="card__head"><h2 className="card__title"><Icon name="alert" /> Açık arıza ve servis{d.open.length ? <span className="pill pill--red">{d.open.length}</span> : null}</h2></header>
        {d.open.length ? d.open.map((m) => (
          <div key={m.id} className="eq-rec"><div><strong>{m.title}</strong><small><button type="button" className="link-btn" onClick={() => eq.openItem(m.item_id)}>{m.asset_tag} · {m.item_name}</button> · {m.kind_label} · {fmtDay(m.created_at)}{m.reported_by_name ? ` · ${m.reported_by_name}` : ""}</small>{m.description && <small>{m.description}</small>}</div>
            <div className="eq-rec__side"><span className={`pill pill--xs ${m.status === "in_progress" ? "pill--amber" : "pill--red"}`}>{m.status_label}</span>
              {eq.perms.assign && <div style={{ display: "flex", gap: 4 }}>{m.status === "open" && <button type="button" className="btn btn--sm" onClick={() => setStatus(m, "in_progress")}>Servise al</button>}<button type="button" className="btn btn--sm btn--primary" onClick={() => eq.maintain({ id: m.item_id, name: m.item_name, asset_tag: m.asset_tag }, m, true)}>Tamamla</button><button type="button" className="btn btn--sm" onClick={() => setStatus(m, "cancelled")}>İptal</button></div>}</div></div>
        )) : <p className="muted small">Açık arıza kaydı yok.</p>}
      </section>
      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <header className="card__head"><h2 className="card__title"><Icon name="checks" /> Son bakım kayıtları</h2><span className="muted small">Bu yıl gider: <b>{money(d.cost_year)}</b></span></header>
        {d.recent.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Tarih</th><th>Ekipman</th><th>İş</th><th>Servis</th><th style={{ textAlign: "right" }}>Maliyet</th></tr></thead>
          <tbody>{d.recent.map((m) => <tr key={m.id} onClick={() => eq.openItem(m.item_id)}><td>{fmtDay(m.performed_at)}</td><td><span className="eq-tag">{m.asset_tag}</span> {m.item_name}</td><td>{m.title}</td><td>{m.vendor || "—"}</td><td style={{ textAlign: "right" }}>{m.cost != null ? money(m.cost) : "—"}</td></tr>)}</tbody></table></div> : <p className="muted small">Henüz tamamlanmış bakım yok.</p>}
      </section>
    </div>
  );
}

/* --------------------------------- hareketler --------------------------------- */

export function History() {
  const eq = useEq();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const res = useVersioned(useResource(`${BASE}/events`, { limit: 300, action: action || undefined }));
  const list = (res.data?.items || []).filter((e) => !q || includesFold(`${e.item_name} ${e.summary} ${e.user_name}`, q));
  return (
    <section className="card">
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ekipman, kişi ya da işlem ara" aria-label="Hareketlerde ara" style={{ flex: "1 1 240px" }} />
        <select className="select-sm" value={action} onChange={(e) => setAction(e.target.value)} aria-label="İşlem türü"><option value="">Tüm işlemler</option>{Object.entries(EVENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <ErrorNote error={res.error && !res.data ? res.error : null} onRetry={res.reload} />
      {!res.data ? <Spinner /> : list.length ? <ul className="eq-timeline">{list.map((e) => (
        <li key={e.id}><span className="eq-timeline__icon"><Icon name={EVENT_ICONS[e.action] || "circle"} size={13} /></span><div>{e.item_id ? <button type="button" className="link-btn" onClick={() => eq.openItem(e.item_id)}>{e.item_name}</button> : <b>{e.item_name}</b>} · <b>{EVENT_LABELS[e.action] || e.action}</b> · {e.summary}<small>{e.user_name} · {fmtDateTime(e.created_at)}</small></div></li>
      ))}</ul> : <p className="muted small">Hareket yok.</p>}
    </section>
  );
}

/* ----------------------------- kategori / konum ----------------------------- */

export function Settings() {
  const eq = useEq();
  const confirm = useConfirm();
  const result = useResult();
  const meta = eq.meta;
  const [cat, setCat] = useState({ name: "", parent_id: "", life_years: "", maintenance_days: "" });
  const [loc, setLoc] = useState({ name: "", parent_id: "", kind: "warehouse", address: "" });
  const [edit, setEdit] = useState(null);
  const done = (ok) => { if (ok) { eq.reloadMeta(); eq.bump(); } return ok; };
  const addCat = async (e) => { e.preventDefault(); if (done(result(await post(`${BASE}/categories`, { ...cat, parent_id: cat.parent_id || null }, { queue: false }), "Kategori eklendi."))) setCat((c) => ({ ...c, name: "", life_years: "", maintenance_days: "" })); };
  const addLoc = async (e) => { e.preventDefault(); if (done(result(await post(`${BASE}/locations`, { ...loc, parent_id: loc.parent_id || null }, { queue: false }), "Konum eklendi."))) setLoc((l) => ({ ...l, name: "", address: "" })); };
  const save = async (e) => {
    e.preventDefault();
    const { type, id, ...body } = edit;
    if (done(result(await patch(`${BASE}/${type === "cat" ? "categories" : "locations"}/${id}`, { ...body, parent_id: body.parent_id || null }), "Kaydedildi."))) setEdit(null);
  };
  const remove = async (type, row) => {
    if (!(await confirm({ title: type === "cat" ? "Kategoriyi sil" : "Konumu sil", message: `"${row.path}" silinsin mi? İçindeki ${row.item_count} ekipman bir üst düzeye taşınır.`, confirmLabel: "Sil", danger: true }))) return;
    done(result(await del(`${BASE}/${type === "cat" ? "categories" : "locations"}/${row.id}`), "Silindi."));
  };
  if (!meta) return null;
  const editRow = (type, row, list) => (
    <li key={row.id}><form onSubmit={save} style={{ display: "flex", gap: 6, flex: 1 }}>
      <input value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} aria-label="Ad" autoFocus />
      <select value={edit.parent_id || ""} onChange={(e) => setEdit((p) => ({ ...p, parent_id: e.target.value }))} aria-label="Üst düzey"><option value="">Üst düzey yok</option>{list.filter((x) => x.id !== row.id).map((x) => <option key={x.id} value={x.id}>{x.path}</option>)}</select>
      <button type="submit" className="btn btn--sm btn--primary">Kaydet</button><button type="button" className="btn btn--sm" onClick={() => setEdit(null)}>Vazgeç</button>
    </form></li>
  );
  return (
    <div className="eq-grid2">
      <section className="card">
        <header className="card__head"><h2 className="card__title"><Icon name="layers" /> Kategoriler</h2><button type="button" className="btn btn--sm" onClick={eq.seedCategories}><Icon name="sparkles" size={13} /> Önerilenleri ekle</button></header>
        <p className="muted small">Amortisman ömrü ve bakım aralığı alt kategorilere ve kartlara devredilir.</p>
        <ul className="eq-tree">{meta.categories.map((c) => (edit?.type === "cat" && edit.id === c.id ? editRow("cat", c, meta.categories) : (
          <li key={c.id} style={{ paddingLeft: 4 + c.depth * 16 }}><span>{c.name}<small>{c.item_count ? ` · ${c.item_count} kart` : ""}{c.life_years ? ` · ${num(c.life_years)} yıl` : ""}{c.maintenance_days ? ` · bakım ${c.maintenance_days} gün` : ""}</small></span>
            <button type="button" className="icon-btn" onClick={() => setEdit({ type: "cat", id: c.id, name: c.name, parent_id: c.parent_id || "", life_years: c.life_years ?? "", maintenance_days: c.maintenance_days ?? "" })} aria-label={`${c.name} düzenle`}><Icon name="pencil" size={13} /></button>
            <button type="button" className="icon-btn" onClick={() => remove("cat", c)} aria-label={`${c.name} sil`}><Icon name="trash" size={13} /></button></li>
        )))}</ul>
        <form className="form-grid" onSubmit={addCat}>
          <input value={cat.name} onChange={(e) => setCat((p) => ({ ...p, name: e.target.value }))} placeholder="Yeni kategori" aria-label="Yeni kategori adı" />
          <select value={cat.parent_id} onChange={(e) => setCat((p) => ({ ...p, parent_id: e.target.value }))} aria-label="Üst kategori"><option value="">Ana kategori</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}</select>
          <input value={cat.life_years} onChange={(e) => setCat((p) => ({ ...p, life_years: e.target.value }))} placeholder="Amortisman ömrü (yıl)" aria-label="Amortisman ömrü" />
          <input value={cat.maintenance_days} onChange={(e) => setCat((p) => ({ ...p, maintenance_days: e.target.value }))} placeholder="Bakım aralığı (gün)" aria-label="Bakım aralığı" />
          <button type="submit" className="btn btn--primary span3" disabled={!cat.name.trim()}><Icon name="plus" size={13} /> Kategori ekle</button>
        </form>
      </section>
      <section className="card">
        <header className="card__head"><h2 className="card__title"><Icon name="map" /> Konumlar</h2></header>
        <p className="muted small">Şehir › depo › raf; araç ve saha da konum olabilir.{meta.scope?.nationwide ? "" : ` Yeni konumlar ${meta.scope?.city_name || "ilinize"} bağlanır.`}</p>
        <ul className="eq-tree">{meta.locations.map((l) => (edit?.type === "loc" && edit.id === l.id ? editRow("loc", l, meta.locations) : (
          <li key={l.id} style={{ paddingLeft: 4 + l.depth * 16 }}><span>{l.name}<small> · {LOCATION_KINDS[l.kind] || l.kind}{l.item_count ? ` · ${l.item_count} kart` : ""}{l.address ? ` · ${l.address}` : ""}</small></span>
            {l.can_edit && <><button type="button" className="icon-btn" onClick={() => setEdit({ type: "loc", id: l.id, name: l.name, parent_id: l.parent_id || "", kind: l.kind, address: l.address })} aria-label={`${l.name} düzenle`}><Icon name="pencil" size={13} /></button>
              <button type="button" className="icon-btn" onClick={() => remove("loc", l)} aria-label={`${l.name} sil`}><Icon name="trash" size={13} /></button></>}</li>
        )))}</ul>
        <form className="form-grid" onSubmit={addLoc}>
          <input value={loc.name} onChange={(e) => setLoc((p) => ({ ...p, name: e.target.value }))} placeholder="ör. Ankara Depo, Raf B3" aria-label="Yeni konum adı" />
          <select value={loc.parent_id} onChange={(e) => setLoc((p) => ({ ...p, parent_id: e.target.value }))} aria-label="Üst konum"><option value="">Üst konum yok</option>{meta.locations.map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}</select>
          <select value={loc.kind} onChange={(e) => setLoc((p) => ({ ...p, kind: e.target.value }))} aria-label="Konum türü">{Object.entries(LOCATION_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input value={loc.address} onChange={(e) => setLoc((p) => ({ ...p, address: e.target.value }))} placeholder="Adres (isteğe bağlı)" aria-label="Adres" />
          <button type="submit" className="btn btn--primary span3" disabled={!loc.name.trim()}><Icon name="plus" size={13} /> Konum ekle</button>
        </form>
      </section>
    </div>
  );
}
