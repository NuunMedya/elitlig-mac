// Ekipman (masaüstü) pencereleri: kart formu, zimmet / çıkış, iade, süre
// uzatma, rezervasyon, bakım, arıza, toplu değer, içe aktarma ve etiket.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, Modal, Segmented, useResult } from "../../components/ui";
import { get, patch, post, tempId, useDebounced, useResource } from "../../api";
import {
  CONDITIONS, IMPORT_TEMPLATE, MAINTENANCE_KINDS, MANUAL_STATUSES, STATUS_META, UNITS, amountInput, code39Text, dayIso, holderPayload, localInput, money, num, parseAmount, previewValue, rowsToObjects,
} from "../../lib/equipmentUtils";
import { pickSheetRows, saveRowsXlsx } from "../projects/common";
import { BASE, Thumb, printLabels } from "./common";

const setter = (set, key) => (e) => set((p) => ({ ...p, [key]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
const Foot = ({ onClose, busy, label = "Kaydet", danger = false, disabled = false, form = "eq-form" }) => (
  <>
    <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
    <button type="submit" form={form} className={`btn btn--primary ${danger ? "btn--danger" : ""}`} disabled={busy || disabled}>{busy ? "Kaydediliyor…" : label}</button>
  </>
);
const ErrorLine = ({ text }) => (text ? <div className="error-note span3"><span>{text}</span></div> : null);

/* --------------------------------- kişi seçici --------------------------------- */

export function PersonPicker({ value, onChange, freeName, onFreeName, phone, onPhone, label = "Teslim alan" }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q, 200);
  const res = useResource(`${BASE}/people`, { q: query });
  const items = res.data?.items || [];
  if (value) {
    return (
      <div className="field span3">
        <span className="field__label">{label}</span>
        <div className="eq-picked"><Icon name={value.type === "staff" ? "shield" : "user"} /><strong>{value.name} <span className="muted small">· {value.subtitle}</span></strong><button type="button" className="btn btn--sm" onClick={() => onChange(null)}>Değiştir</button></div>
        <input value={phone} onChange={(e) => onPhone(e.target.value)} placeholder={value.phone || "Telefon (isteğe bağlı)"} aria-label="Telefon" style={{ marginTop: 6 }} />
      </div>
    );
  }
  return (
    <div className="field span3">
      <span className="field__label">{label} · yönetim ekibi, personel ya da serbest ad</span>
      <input value={q} onChange={(e) => { setQ(e.target.value); onFreeName(e.target.value); }} placeholder="Ad yazın ya da listeden seçin" aria-label={`${label} ara`} autoFocus />
      <ul className="eq-people" aria-label="Kişiler">
        {items.slice(0, 40).map((p) => <li key={p.key}><button type="button" onClick={() => onChange(p)}><Icon name={p.type === "staff" ? "shield" : "user"} size={14} /><span><b>{p.name}</b><small>{p.subtitle}</small></span></button></li>)}
        {!items.length && <li className="muted small" style={{ padding: 8 }}>{res.loading ? "Yükleniyor…" : q ? `Listede yok; "${q}" adıyla serbest kayıt açılır.` : "Kayıtlı kişi yok."}</li>}
      </ul>
      {freeName.trim() && <input value={phone} onChange={(e) => onPhone(e.target.value)} placeholder="Telefon (isteğe bağlı)" aria-label="Telefon" style={{ marginTop: 6 }} />}
    </div>
  );
}

function LinkFields({ form, setForm }) {
  const links = useResource(`${BASE}/links`);
  return (
    <>
      <Field label="Proje (isteğe bağlı)"><select value={form.project_id || ""} onChange={setter(setForm, "project_id")}><option value="">Proje yok</option>{(links.data?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Maç (isteğe bağlı)"><select value={form.match_id || ""} onChange={setter(setForm, "match_id")}><option value="">Maç yok</option>{(links.data?.matches || []).map((m) => <option key={m.id} value={m.id}>{m.date} {m.time} · {m.label}</option>)}</select></Field>
    </>
  );
}

const Conflicts = ({ list }) => (list?.length ? (
  <div className="eq-conflicts span3" role="alert"><b>Çakışma var</b><ul>{list.map((c, i) => <li key={`${c.item_id}-${c.id}-${i}`}>{c.item_name ? `${c.item_name}: ` : ""}{c.label}{c.start_at ? ` (${new Date(c.start_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}</li>)}</ul></div>
) : null);

/* --------------------------------- kart formu --------------------------------- */

const BLANK = { name: "", category_id: "", asset_tag: "", brand: "", model: "", serial_no: "", barcode: "", tracking: "unit", quantity: "1", unit: "adet", min_quantity: "", status: "in_stock", condition: "good", location_id: "", parent_id: "", photo_url: "", purchase_date: "", purchase_price: "", currency: "TRY", supplier: "", invoice_no: "", warranty_until: "", life_years: "", salvage_value: "", insurance_policy: "", insurance_company: "", insurance_until: "", maintenance_days: "", last_maintenance_at: "", next_maintenance_at: "", tags: "", notes: "", links: [] };

export function ItemForm({ item, meta, onClose, onSaved }) {
  const editing = Boolean(item?.id);
  const result = useResult();
  const [form, setForm] = useState(() => (item ? {
    ...BLANK, ...Object.fromEntries(Object.entries(item).filter(([k]) => k in BLANK).map(([k, v]) => [k, v == null ? "" : v])),
    quantity: String(item.quantity ?? 1), purchase_price: amountInput(item.purchase_price), salvage_value: amountInput(item.salvage_value), tags: (item.tags || []).join(", "), links: item.links || [],
  } : { ...BLANK }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parents = useResource(`${BASE}/items`, { page_size: 500, tracking: "unit" });
  const parentOptions = (parents.data?.items || []).filter((p) => !p.parent_id && p.id !== item?.id);
  const life = useMemo(() => {
    const byId = new Map((meta?.categories || []).map((c) => [c.id, c]));
    let c = byId.get(Number(form.category_id));
    for (let g = 0; c && g < 8; g += 1) { if (c.life_years) return c.life_years; c = c.parent_id ? byId.get(c.parent_id) : null; }
    return null;
  }, [form.category_id, meta]);
  const preview = previewValue(form, life);
  const locked = editing && ["assigned", "in_use"].includes(item.status);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Ekipmana bir ad verin."); return; }
    const body = { ...form, category_id: form.category_id || null, location_id: form.location_id || null, parent_id: form.parent_id || null, quantity: form.tracking === "bulk" ? form.quantity : 1, links: (form.links || []).filter((l) => l.url) };
    if (editing) { delete body.status; if (MANUAL_STATUSES.includes(form.status) && form.status !== item.status) body.status = form.status; }
    setBusy(true);
    setError("");
    const res = editing ? await patch(`${BASE}/items/${item.id}`, body) : await post(`${BASE}/items`, body, { tempId: tempId() });
    setBusy(false);
    if (!res.ok) { setError(res.error?.message || "Kaydedilemedi."); return; }
    result(res, editing ? "Kaydedildi." : res.data?.item ? `${res.data.item.asset_tag} eklendi.` : null);
    onSaved?.(res.data?.item || null, editing);
  };
  const opt = (list) => list.map((x) => <option key={x.id} value={x.id}>{"  ".repeat(x.depth)}{x.name}</option>);
  return (
    <Modal title={editing ? `${item.asset_tag} · Düzenle` : "Yeni ekipman"} onClose={onClose} width={760} footer={<Foot onClose={onClose} busy={busy} label={editing ? "Kaydet" : "Ekle"} />}>
      <form id="eq-form" className="form-grid" onSubmit={submit} noValidate>
        <ErrorLine text={error} />
        <span className="eq-form-title">Temel bilgiler</span>
        <Field label="Ekipman adı" className="span3"><input value={form.name} onChange={setter(setForm, "name")} placeholder="ör. Sony PXW-Z190 kamera, Maç topu, LED ekran" autoFocus /></Field>
        <Field label="Kategori"><select value={form.category_id} onChange={setter(setForm, "category_id")}><option value="">Kategorisiz</option>{opt(meta?.categories || [])}</select></Field>
        <Field label="Etiket / demirbaş no" hint={editing ? null : "Boşsa EQ-0042 gibi verilir"}><input value={form.asset_tag} onChange={setter(setForm, "asset_tag")} placeholder="Otomatik" /></Field>
        <Field label="Marka"><input value={form.brand} onChange={setter(setForm, "brand")} /></Field>
        <Field label="Model"><input value={form.model} onChange={setter(setForm, "model")} /></Field>
        <Field label="Seri no"><input value={form.serial_no} onChange={setter(setForm, "serial_no")} /></Field>
        <Field label="Barkod"><input value={form.barcode} onChange={setter(setForm, "barcode")} /></Field>
        <Field label="Takip türü"><Segmented size="sm" value={form.tracking} onChange={(v) => !locked && setForm((p) => ({ ...p, tracking: v }))} options={[{ value: "unit", label: "Tekil" }, { value: "bulk", label: "Adetli stok" }]} ariaLabel="Takip türü" /></Field>
        {form.tracking === "bulk" ? (
          <Field label="Miktar ve birim"><div style={{ display: "flex", gap: 6 }}><input value={form.quantity} onChange={setter(setForm, "quantity")} inputMode="decimal" aria-label="Miktar" /><select value={form.unit} onChange={setter(setForm, "unit")} aria-label="Birim">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div></Field>
        ) : <Field label="Bağlı olduğu ana ekipman"><select value={form.parent_id} onChange={setter(setForm, "parent_id")}><option value="">Bağımsız</option>{parentOptions.map((p) => <option key={p.id} value={p.id}>{p.asset_tag} · {p.name}</option>)}</select></Field>}
        {form.tracking === "bulk" && <Field label="Minimum stok" hint="Altına düşünce uyarı"><input value={form.min_quantity} onChange={setter(setForm, "min_quantity")} inputMode="decimal" /></Field>}
        <Field label="Konum"><select value={form.location_id} onChange={setter(setForm, "location_id")}><option value="">Konum yok</option>{opt((meta?.locations || []).filter((l) => l.active))}</select></Field>
        <Field label="Durum"><select value={form.status} onChange={setter(setForm, "status")} disabled={locked}>{locked && <option value={item.status}>{STATUS_META[item.status].label} (iade ile değişir)</option>}{MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select></Field>
        <Field label="Kondisyon"><select value={form.condition} onChange={setter(setForm, "condition")}>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Fotoğraf bağlantısı" className="span2" hint="Fotoğraf yüklemek için web panelini kullanabilirsiniz"><input value={form.photo_url} onChange={setter(setForm, "photo_url")} placeholder="https://…" /></Field>

        <span className="eq-form-title">Satın alma ve değer</span>
        <Field label="Alış tarihi"><input type="date" value={form.purchase_date} onChange={setter(setForm, "purchase_date")} /></Field>
        <Field label={form.tracking === "bulk" ? "Birim alış fiyatı" : "Alış fiyatı"}><div style={{ display: "flex", gap: 6 }}><input value={form.purchase_price} onChange={setter(setForm, "purchase_price")} inputMode="decimal" placeholder="0,00" aria-label="Alış fiyatı" /><select value={form.currency} onChange={setter(setForm, "currency")} style={{ width: 80 }} aria-label="Para birimi">{["TRY", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div></Field>
        <Field label="Tedarikçi"><input value={form.supplier} onChange={setter(setForm, "supplier")} /></Field>
        <Field label="Fatura no"><input value={form.invoice_no} onChange={setter(setForm, "invoice_no")} /></Field>
        <Field label="Garanti bitişi"><input type="date" value={form.warranty_until} onChange={setter(setForm, "warranty_until")} /></Field>
        <Field label="Amortisman ömrü (yıl)" hint={life ? `Boşsa kategoriden ${life} yıl` : "Boşsa amortisman yok"}><input value={form.life_years} onChange={setter(setForm, "life_years")} inputMode="decimal" /></Field>
        <Field label="Hurda değeri"><input value={form.salvage_value} onChange={setter(setForm, "salvage_value")} inputMode="decimal" placeholder="0,00" /></Field>
        {preview && <div className="eq-preview span3" aria-live="polite"><span>Alış değeri <b>{money(preview.purchase, form.currency)}</b></span><span>Güncel değer <b>{money(preview.book, form.currency)}</b></span><span>{preview.life ? `Ömür ${num(preview.life)} yıl${preview.used != null ? ` · %${Math.round(preview.used * 100)} kullanıldı` : ""}` : "Amortisman uygulanmıyor"}</span></div>}

        <span className="eq-form-title">Sigorta ve bakım</span>
        <Field label="Sigorta poliçesi"><input value={form.insurance_policy} onChange={setter(setForm, "insurance_policy")} /></Field>
        <Field label="Sigorta şirketi"><input value={form.insurance_company} onChange={setter(setForm, "insurance_company")} /></Field>
        <Field label="Sigorta bitişi"><input type="date" value={form.insurance_until} onChange={setter(setForm, "insurance_until")} /></Field>
        <Field label="Bakım aralığı (gün)"><input value={form.maintenance_days} onChange={setter(setForm, "maintenance_days")} inputMode="numeric" placeholder="ör. 90" /></Field>
        <Field label="Son bakım"><input type="date" value={form.last_maintenance_at} onChange={setter(setForm, "last_maintenance_at")} /></Field>
        <Field label="Sonraki bakım" hint="Boşsa son bakım + aralık"><input type="date" value={form.next_maintenance_at} onChange={setter(setForm, "next_maintenance_at")} /></Field>

        <span className="eq-form-title">Notlar ve belgeler</span>
        <Field label="Etiketler (virgülle)" className="span3"><input value={form.tags} onChange={setter(setForm, "tags")} placeholder="ör. 4K, yayın, yedek" /></Field>
        <div className="field span3">
          <span className="field__label">Belgeler ve bağlantılar</span>
          {(form.links || []).map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input style={{ maxWidth: 180 }} value={l.label} onChange={(e) => setForm((p) => ({ ...p, links: p.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} placeholder="Ad" aria-label="Belge adı" />
              <input value={l.url} onChange={(e) => setForm((p) => ({ ...p, links: p.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))} placeholder="https://…" aria-label="Belge bağlantısı" />
              <button type="button" className="icon-btn" onClick={() => setForm((p) => ({ ...p, links: p.links.filter((_, j) => j !== i) }))} aria-label="Kaldır"><Icon name="x" /></button>
            </div>
          ))}
          <button type="button" className="btn btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setForm((p) => ({ ...p, links: [...(p.links || []), { label: "", url: "" }] }))}><Icon name="plus" size={13} /> Bağlantı ekle</button>
        </div>
        <Field label="Notlar" className="span3"><textarea rows={3} value={form.notes} onChange={setter(setForm, "notes")} /></Field>
      </form>
    </Modal>
  );
}

/* ------------------------------- zimmet / çıkış ------------------------------- */

export function AssignDialog({ items, kind: initialKind = "assignment", onClose, onDone }) {
  const [form, setForm] = useState({ kind: initialKind, start_at: localInput(new Date()), due_at: "", condition: "", purpose: "", note: "", project_id: "", match_id: "" });
  const [person, setPerson] = useState(null);
  const [freeName, setFreeName] = useState("");
  const [phone, setPhone] = useState("");
  const [qty, setQty] = useState(() => Object.fromEntries(items.filter((i) => i.tracking === "bulk").map((i) => [i.id, "1"])));
  const [kids, setKids] = useState(true);
  const [conflicts, setConflicts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checkout = form.kind === "checkout";
  const submit = async (e) => {
    e.preventDefault();
    if (!person && !freeName.trim()) { setError("Teslim alan kişiyi seçin ya da adını yazın."); return; }
    if (checkout && !form.due_at) { setError("Çıkış için dönüş tarihini girin."); return; }
    setBusy(true);
    setError("");
    const res = await post(`${BASE}/assign`, {
      item_ids: items.map((i) => i.id), kind: form.kind, ...holderPayload(person, freeName, phone), start_at: form.start_at ? new Date(form.start_at).toISOString() : undefined,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null, condition: form.condition || undefined, purpose: form.purpose, note: form.note, project_id: form.project_id || null, match_id: form.match_id || null,
      quantities: Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, parseAmount(v)])), include_children: kids, allow_conflict: Boolean(conflicts?.length),
    }, { queue: false });
    setBusy(false);
    if (res.ok) { onDone?.(res.data); return; }
    if (res.error?.code === "RESERVATION_CONFLICT") setConflicts(res.error.details?.conflicts || []);
    else setError(res.offline ? "Zimmet için bağlantı gerekir (stok ve çakışma sunucuda denetlenir)." : res.error?.message || "Kaydedilemedi.");
  };
  return (
    <Modal title={checkout ? "Çıkış yap (etkinlik / maç)" : "Zimmetle"} onClose={onClose} width={680} footer={<Foot onClose={onClose} busy={busy} label={conflicts?.length ? "Yine de teslim et" : checkout ? "Çıkışı kaydet" : "Zimmeti kaydet"} />}>
      <form id="eq-form" className="form-grid" onSubmit={submit} noValidate>
        <ErrorLine text={error} />
        <div className="span3"><Segmented value={form.kind} onChange={(v) => setForm((p) => ({ ...p, kind: v }))} options={[{ value: "assignment", label: "Zimmet (kişiye)", icon: "user" }, { value: "checkout", label: "Çıkış (etkinlik / maç)", icon: "external" }]} ariaLabel="Teslim türü" /></div>
        <ul className="eq-items span3">{items.map((i) => (
          <li key={i.id}><Thumb item={i} /><span><b className="eq-tag">{i.asset_tag}</b> {i.name}{i.child_count ? <span className="muted"> · {i.child_count} aksesuar</span> : null}</span>
            {i.tracking === "bulk" && <><input value={qty[i.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} inputMode="decimal" aria-label={`${i.name} miktarı`} /><span className="muted small">/ {num(i.available_quantity)} {i.unit}</span></>}
          </li>
        ))}</ul>
        {items.some((i) => i.child_count) && <label className="span3 small" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} /> Depodaki aksesuarları da aynı tutanakla teslim et</label>}
        <PersonPicker value={person} onChange={setPerson} freeName={freeName} onFreeName={setFreeName} phone={phone} onPhone={setPhone} />
        <Field label="Teslim tarihi"><input type="datetime-local" value={form.start_at} onChange={setter(setForm, "start_at")} /></Field>
        <Field label={checkout ? "Dönüş tarihi (zorunlu)" : "Beklenen iade (boş: süresiz)"}><input type="datetime-local" value={form.due_at} onChange={setter(setForm, "due_at")} /></Field>
        <Field label="Teslim kondisyonu"><select value={form.condition} onChange={setter(setForm, "condition")}><option value="">Karttaki</option>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Amaç / etkinlik" className="span2"><input value={form.purpose} onChange={setter(setForm, "purpose")} placeholder="ör. Final maçı yayını" /></Field>
        <LinkFields form={form} setForm={setForm} />
        <Field label="Teslim notu" className="span3"><textarea rows={2} value={form.note} onChange={setter(setForm, "note")} placeholder="Çantası, şarj aleti ve 2 batarya ile…" /></Field>
        <Conflicts list={conflicts} />
      </form>
    </Modal>
  );
}

export function ReturnDialog({ assignment: a, meta, onClose, onDone }) {
  const bulk = a.item_tracking === "bulk";
  const [form, setForm] = useState({ status: "returned", condition: a.condition_out || "good", quantity: bulk ? String(a.quantity) : "", to_status: "in_stock", location_id: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lost = form.status === "lost";
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post(`${BASE}/assignments/${a.id}/return`, { ...form, quantity: bulk ? parseAmount(form.quantity) : undefined, location_id: form.location_id || undefined, to_status: bulk ? undefined : form.to_status }, { queue: false });
    setBusy(false);
    if (res.ok) onDone?.();
    else setError(res.offline ? "İade için bağlantı gerekir." : res.error?.message || "Kaydedilemedi.");
  };
  return (
    <Modal title="İade al" onClose={onClose} width={520} footer={<Foot onClose={onClose} busy={busy} danger={lost} label={lost ? "Kayıp olarak kapat" : "İadeyi kaydet"} />}>
      <form id="eq-form" className="form-grid" onSubmit={submit} noValidate>
        <ErrorLine text={error} />
        <p className="span3 muted"><b className="eq-tag">{a.asset_tag}</b> {a.item_name} · <b>{a.holder_name}</b>{bulk ? ` · ${num(a.quantity)} ${a.item_unit}` : ""}</p>
        <div className="span3"><Segmented value={form.status} onChange={(v) => setForm((p) => ({ ...p, status: v }))} options={[{ value: "returned", label: "İade edildi" }, { value: "lost", label: bulk ? "Kayıp / tüketildi" : "Kayıp" }]} ariaLabel="İade sonucu" /></div>
        {bulk && <Field label={lost ? "Kayıp / tüketilen miktar" : "İade edilen miktar"}><input value={form.quantity} onChange={setter(setForm, "quantity")} inputMode="decimal" /></Field>}
        {!lost && <Field label="İade kondisyonu"><select value={form.condition} onChange={setter(setForm, "condition")}>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
        {!lost && !bulk && <Field label="İade sonrası"><select value={form.to_status} onChange={setter(setForm, "to_status")}><option value="in_stock">Depoya al</option><option value="maintenance">Bakıma gönder</option><option value="broken">Arızalı (kayıt açılır)</option></select></Field>}
        {!lost && <Field label="Kaldırıldığı konum"><select value={form.location_id} onChange={setter(setForm, "location_id")}><option value="">Değişmesin</option>{(meta?.locations || []).filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}</select></Field>}
        <Field label={lost ? "Açıklama" : "İade notu"} className="span3"><textarea rows={2} value={form.note} onChange={setter(setForm, "note")} /></Field>
      </form>
    </Modal>
  );
}

export function ExtendDialog({ assignment, onClose, onDone }) {
  const [due, setDue] = useState(localInput(assignment.due_at));
  const result = useResult();
  const submit = async (e) => {
    e.preventDefault();
    if (result(await patch(`${BASE}/assignments/${assignment.id}`, { due_at: due ? new Date(due).toISOString() : null }), "İade tarihi güncellendi.")) onDone?.();
  };
  return (
    <Modal title="İade tarihini değiştir" onClose={onClose} width={400} footer={<Foot onClose={onClose} />}>
      <form id="eq-form" onSubmit={submit}><Field label="Beklenen iade (boş: süresiz)"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} autoFocus /></Field></form>
    </Modal>
  );
}

/* -------------------------------- rezervasyon -------------------------------- */

export function ReserveDialog({ items, reservation = null, onClose, onDone }) {
  const editing = Boolean(reservation?.id);
  const base = new Date(Date.now() + 86400000);
  base.setHours(9, 0, 0, 0);
  const [form, setForm] = useState({ title: reservation?.title || "", start_at: localInput(reservation?.start_at || base), end_at: localInput(reservation?.end_at || new Date(base.getTime() + 10 * 3600000)), holder_name: reservation?.holder_name || "", note: reservation?.note || "", project_id: reservation?.project_id || "", match_id: reservation?.match_id || "" });
  const [qty, setQty] = useState(() => Object.fromEntries(items.filter((i) => i.tracking === "bulk").map((i) => [i.id, String(reservation?.quantity || 1)])));
  const [check, setCheck] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const range = useDebounced(`${form.start_at}|${form.end_at}`, 300);
  useEffect(() => {
    const [s, en] = range.split("|");
    if (!s || !en || new Date(en) <= new Date(s)) { setCheck(null); return; }
    get(`${BASE}/availability`, { item_ids: items.map((i) => i.id).join(","), start_at: new Date(s).toISOString(), end_at: new Date(en).toISOString(), exclude: reservation?.id }).then((r) => setCheck(r.ok && !r.offline ? r.data.items : null));
  }, [range, items, reservation?.id]);
  const live = (check || []).filter((c) => !c.ok).flatMap((c) => c.conflicts.map((x) => ({ ...x, item_name: c.name })));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Rezervasyona bir ad verin."); return; }
    if (new Date(form.end_at) <= new Date(form.start_at)) { setError("Bitiş başlangıçtan sonra olmalıdır."); return; }
    setBusy(true);
    setError("");
    const body = { ...form, start_at: new Date(form.start_at).toISOString(), end_at: new Date(form.end_at).toISOString(), project_id: form.project_id || null, match_id: form.match_id || null, allow_conflict: Boolean(conflicts?.length) };
    const res = editing
      ? await patch(`${BASE}/reservations/${reservation.id}`, { ...body, quantity: items[0]?.tracking === "bulk" ? parseAmount(qty[items[0].id]) : undefined })
      : await post(`${BASE}/reservations`, { ...body, item_ids: items.map((i) => i.id), quantities: Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, parseAmount(v)])) }, { queue: false });
    setBusy(false);
    if (res.ok) { onDone?.(); return; }
    if (res.error?.code === "RESERVATION_CONFLICT") setConflicts(res.error.details?.conflicts || []);
    else setError(res.offline ? "Rezervasyon için bağlantı gerekir (çakışma sunucuda denetlenir)." : res.error?.message || "Kaydedilemedi.");
  };
  return (
    <Modal title={editing ? "Rezervasyonu düzenle" : "Rezerve et"} onClose={onClose} width={640} footer={<Foot onClose={onClose} busy={busy} label={conflicts?.length ? "Çakışmaya rağmen kaydet" : editing ? "Kaydet" : "Rezerve et"} />}>
      <form id="eq-form" className="form-grid" onSubmit={submit} noValidate>
        <ErrorLine text={error} />
        <ul className="eq-items span3">{items.map((i) => (
          <li key={i.id}><Thumb item={i} /><span><b className="eq-tag">{i.asset_tag}</b> {i.name}</span>{i.tracking === "bulk" && <><input value={qty[i.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} aria-label={`${i.name} miktarı`} /><span className="muted small">/ {num(i.quantity)} {i.unit}</span></>}</li>
        ))}</ul>
        <Field label="Etkinlik / amaç" className="span3"><input value={form.title} onChange={setter(setForm, "title")} placeholder="ör. Süper Lig finali yayını" autoFocus /></Field>
        <Field label="Başlangıç"><input type="datetime-local" value={form.start_at} onChange={setter(setForm, "start_at")} /></Field>
        <Field label="Bitiş"><input type="datetime-local" value={form.end_at} onChange={setter(setForm, "end_at")} /></Field>
        <Field label="Sorumlu"><input value={form.holder_name} onChange={setter(setForm, "holder_name")} /></Field>
        <LinkFields form={form} setForm={setForm} />
        <Field label="Not"><input value={form.note} onChange={setter(setForm, "note")} /></Field>
        {conflicts?.length ? <Conflicts list={conflicts} /> : live.length ? <Conflicts list={live} /> : check ? <div className="eq-ok span3">Seçilen aralıkta çakışma yok.</div> : null}
      </form>
    </Modal>
  );
}

/* ----------------------------------- bakım ----------------------------------- */

export function MaintenanceDialog({ item, record = null, closing = false, onClose, onDone }) {
  const [form, setForm] = useState({ kind: record?.kind || "maintenance", status: closing ? "done" : record?.status || "done", title: record?.title || "", description: record?.description || "", performed_at: record?.performed_at || dayIso(), cost: amountInput(record?.cost), vendor: record?.vendor || "", invoice_no: record?.invoice_no || "", next_maintenance_at: "", condition: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useResult();
  const done = form.status === "done";
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...form, cost: form.cost === "" ? null : parseAmount(form.cost), next_maintenance_at: form.next_maintenance_at || undefined, condition: form.condition || undefined };
    const res = record?.id ? await patch(`${BASE}/maintenance/${record.id}`, body) : await post(`${BASE}/items/${item.id}/maintenance`, body);
    setBusy(false);
    if (res.ok) { result(res, res.queued ? null : "Bakım kaydedildi."); onDone?.(); } else setError(res.error?.message || "Kaydedilemedi.");
  };
  return (
    <Modal title={closing ? "Bakımı / onarımı tamamla" : "Bakım / onarım kaydı"} onClose={onClose} width={560} footer={<Foot onClose={onClose} busy={busy} />}>
      <form id="eq-form" className="form-grid" onSubmit={submit} noValidate>
        <ErrorLine text={error} />
        {item && <p className="span3 muted"><b className="eq-tag">{item.asset_tag}</b> {item.name}</p>}
        <Field label="Tür"><select value={form.kind} onChange={setter(setForm, "kind")} disabled={closing}>{Object.entries(MAINTENANCE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Durum"><select value={form.status} onChange={setter(setForm, "status")}><option value="open">Bildirildi / planlandı</option><option value="in_progress">Serviste</option><option value="done">Tamamlandı</option>{record && <option value="cancelled">İptal</option>}</select></Field>
        <Field label="Başlık" className="span3"><input value={form.title} onChange={setter(setForm, "title")} placeholder={MAINTENANCE_KINDS[form.kind]} autoFocus /></Field>
        <Field label="Tarih"><input type="date" value={form.performed_at} onChange={setter(setForm, "performed_at")} /></Field>
        <Field label="Maliyet"><input value={form.cost} onChange={setter(setForm, "cost")} inputMode="decimal" placeholder="0,00" /></Field>
        <Field label="Servis / firma"><input value={form.vendor} onChange={setter(setForm, "vendor")} /></Field>
        <Field label="Fatura no"><input value={form.invoice_no} onChange={setter(setForm, "invoice_no")} /></Field>
        {done && <Field label="Sonraki bakım" hint="Boşsa aralıktan"><input type="date" value={form.next_maintenance_at} onChange={setter(setForm, "next_maintenance_at")} /></Field>}
        {done && <Field label="Bakım sonrası kondisyon"><select value={form.condition} onChange={setter(setForm, "condition")}><option value="">Değişmesin</option>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
        <Field label="Yapılan iş / açıklama" className="span3"><textarea rows={3} value={form.description} onChange={setter(setForm, "description")} /></Field>
      </form>
    </Modal>
  );
}

export function FaultDialog({ item, onClose, onDone }) {
  const [text, setText] = useState("");
  const result = useResult();
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (result(await post(`${BASE}/items/${item.id}/fault`, { description: text }), "Arıza bildirildi.")) onDone?.();
  };
  return (
    <Modal title="Arıza bildir" onClose={onClose} width={460} footer={<Foot onClose={onClose} label="Bildir" disabled={!text.trim()} />}>
      <form id="eq-form" onSubmit={submit} className="form-grid">
        <p className="span3 muted"><b className="eq-tag">{item.asset_tag}</b> {item.name} · depodaysa "Arızalı"ya alınır. Bağlantı yoksa bildirim eşitlenince gönderilir.</p>
        <Field label="Arıza" className="span3"><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ne oldu? Hangi parça?" autoFocus /></Field>
      </form>
    </Modal>
  );
}

export function BulkDialog({ action, meta, count, onClose, onSubmit }) {
  const [value, setValue] = useState(action === "status" ? "in_stock" : action === "condition" ? "good" : "");
  const titles = { location: "Konum değiştir", status: "Durum değiştir", category: "Kategori değiştir", condition: "Kondisyon değiştir", tags_add: "Etiket ekle" };
  const submit = (e) => { e.preventDefault(); onSubmit(["location", "category"].includes(action) ? value || null : value); };
  return (
    <Modal title={`${titles[action]} · ${count} ekipman`} onClose={onClose} width={420} footer={<Foot onClose={onClose} label="Uygula" />}>
      <form id="eq-form" onSubmit={submit}>
        <Field label={titles[action]}>
          {action === "location" ? <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus><option value="">Konum yok</option>{(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}</select>
            : action === "category" ? <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus><option value="">Kategorisiz</option>{(meta?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}</select>
              : action === "status" ? <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>{MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select>
                : action === "condition" ? <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  : <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="virgülle ayırın" autoFocus />}
        </Field>
      </form>
    </Modal>
  );
}

export function ImportDialog({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async () => {
    setError("");
    try {
      const picked = await pickSheetRows();
      if (!picked) return;
      const objects = rowsToObjects(picked.sheets[0]?.rows || []);
      if (!objects.length) { setError("Dosyada başlık satırı ve en az bir kayıt bulunamadı."); return; }
      setRows(objects);
      setName(picked.name);
    } catch (e) { setError(e.message || "Dosya okunamadı."); }
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post(`${BASE}/items/import`, { rows }, { queue: false });
    setBusy(false);
    if (res.ok) { setResult(res.data); if (res.data.created) onDone?.(); } else setError(res.offline ? "İçe aktarma için bağlantı gerekir." : res.error?.message || "Aktarılamadı.");
  };
  const template = () => saveRowsXlsx("Ekipman-ice-aktarma-sablonu", IMPORT_TEMPLATE, "Ekipman", { A: 220, B: 220, J: 200 });
  return (
    <Modal title="Excel / CSV'den içe aktar" onClose={onClose} width={620} footer={result ? <button type="button" className="btn btn--primary" onClick={onClose}>Kapat</button> : <Foot onClose={onClose} busy={busy} disabled={!rows} label={rows ? `${rows.length} satırı aktar` : "Aktar"} />}>
      <form id="eq-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <div className="error-note"><span>{error}</span></div>}
        <p className="muted small">İlk satır başlık olmalı: Ekipman adı, Kategori ("Üst &gt; Alt"), Marka, Model, Seri no, Barkod, Adet, Birim, Durum, Kondisyon, Konum ("Depo &gt; Raf"), Alış tarihi, Alış fiyatı, Tedarikçi, Fatura no, Garanti bitişi, Notlar. Olmayan kategori ve konumlar oluşturulur.</p>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn--primary" onClick={pick}><Icon name="upload" size={14} /> Dosya seç</button><button type="button" className="btn" onClick={template}><Icon name="download" size={14} /> Örnek şablon</button></div>
        {rows && !result && <p className="small"><b>{name}</b> · {rows.length} satır · sütunlar: {Object.keys(rows[0]).join(", ")}</p>}
        {result && <><div className="eq-ok">{result.created} ekipman eklendi.</div>{result.errors?.length > 0 && <div className="eq-conflicts"><b>{result.errors.length} satır aktarılamadı</b><ul>{result.errors.slice(0, 15).map((x) => <li key={x.row}>Satır {x.row + 1}: {x.message}</li>)}</ul></div>}</>}
      </form>
    </Modal>
  );
}

export function LabelDialog({ items, onClose }) {
  const [size, setSize] = useState("small");
  const bad = items.filter((i) => !code39Text(i.asset_tag)).length;
  return (
    <Modal title={`Etiket yazdır · ${items.length} ekipman`} onClose={onClose} width={460} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn" onClick={() => { printLabels(items, size, true); onClose(); }}><Icon name="download" size={14} /> PDF</button>
      <button type="button" className="btn btn--primary" onClick={() => { printLabels(items, size); onClose(); }} autoFocus><Icon name="printer" size={14} /> Yazdır</button>
    </>}>
      <Segmented value={size} onChange={setSize} options={[{ value: "small", label: "Küçük · A4'te 24" }, { value: "large", label: "Büyük · A4'te 10" }]} ariaLabel="Etiket boyutu" />
      <p className="muted small" style={{ marginTop: 10 }}>Etikette büyük etiket no, ad, el tipi okuyucuların okuduğu Code 39 barkodu ve kısa bağlantı bulunur. Okutulan etiket "Etiket / barkod" kutusundan kartı açar.{bad ? ` ${bad} etiket no barkoda uygun değil; yalnız yazıyla basılır.` : ""}</p>
    </Modal>
  );
}
