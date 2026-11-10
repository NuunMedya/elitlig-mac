// Ekipman (masaüstü): organizasyonun ortak demirbaş envanteri — konum, değer
// (doğrusal amortismanla güncel değer), zimmet, rezervasyon, bakım ve hareket
// geçmişi. Sunucu: /api/tools/equipment (yetki equipment.view / assign / manage).
//
// Çevrimdışı: tüm okumalar önbellekten gelir; kart ekleme / alan güncellemesi,
// bakım kaydı ve arıza bildirimi kuyruğa alınır (app/api.js). Zimmet / iade ve
// rezervasyon stok ve çakışma denetimi gerektirdiği için bağlantı ister.
// Bildirimler: iade tarihi gelen zimmetim ve bakım zamanı (app/equipmentFeed.js).
//
// Kısayollar: ⌘N yeni ekipman, ⌘F ara, ⌘E dışa aktar, ⌘P etiket / tutanak.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorNote, Icon, OfflineNote, Segmented, Spinner, useResult, useToast, Empty } from "../../components/ui";
import { get, post, useCommand, useResource } from "../../api";
import "./equipment.css";
import { BASE, EquipmentContext, printReceipt } from "./common";
import Inventory from "./Inventory";
import ItemPanel from "./ItemPanel";
import { Dashboard, History, Holders, Maintenance, Reservations, Settings } from "./sections";
import { AssignDialog, FaultDialog, ImportDialog, ItemForm, LabelDialog, MaintenanceDialog, ReserveDialog, ReturnDialog } from "./dialogs";

const SECTIONS = [
  { value: "pano", label: "Pano", icon: "overview" },
  { value: "envanter", label: "Envanter", icon: "box" },
  { value: "zimmet", label: "Kimde ne var", icon: "user" },
  { value: "rezervasyon", label: "Rezervasyon", icon: "calendar" },
  { value: "bakim", label: "Bakım", icon: "wrench" },
  { value: "gecmis", label: "Hareketler", icon: "activity" },
  { value: "ayarlar", label: "Kategori ve konum", icon: "layers", manage: true },
];
const SECTION_KEY = "equipment:section";
const readSection = () => { try { return localStorage.getItem(SECTION_KEY) || "pano"; } catch { return "pano"; } };

export default function Equipment({ arg }) {
  const toast = useToast();
  const result = useResult();
  const metaRes = useResource(`${BASE}/meta`);
  const holdersRes = useResource(`${BASE}/holders`);
  const meta = metaRes.data;
  const perms = meta?.permissions || { view: false, assign: false, manage: false };
  const [section, setSection] = useState(() => (typeof arg === "string" && SECTIONS.some((s) => s.value === arg) ? arg : readSection()));
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState(typeof arg === "object" && arg?.id ? arg.id : null);
  const [dialog, setDialog] = useState(null);
  const [preset, setPreset] = useState(null);
  const [scan, setScan] = useState("");
  const scanRef = useRef(null);

  const go = useCallback((key) => { setSection(key); try { localStorage.setItem(SECTION_KEY, key); } catch { /* yoksay */ } }, []);
  useEffect(() => {
    if (typeof arg === "string" && SECTIONS.some((s) => s.value === arg)) go(arg);
    if (arg && typeof arg === "object" && arg.id) setOpenId(arg.id);
    if (arg === "new") setDialog({ type: "form", item: null });
  }, [arg, go]);
  const bump = useCallback(() => { setVersion((v) => v + 1); holdersRes.reload({ quiet: true }); }, [holdersRes]);
  const offerReceipt = useCallback((items) => toast(`${items.length} kalem teslim edildi.`, { tone: "success", timeout: 8000, action: { label: "Tutanağı yazdır", run: () => printReceipt(items) } }), [toast]);
  const openByCode = async (code) => {
    const c = String(code || "").trim();
    if (!c) return;
    const r = await get(`${BASE}/lookup`, { code: c });
    if (r.ok) { setOpenId(r.data.id); setScan(""); if (section !== "envanter") go("envanter"); } else toast(r.error?.message || "Ekipman bulunamadı.", { tone: "error" });
  };

  const close = () => setDialog(null);
  const ctx = useMemo(() => ({
    meta, perms, version, bump, go, reloadMeta: () => metaRes.reload({ quiet: true }),
    holders: (holdersRes.data?.items || []).map((h) => ({ key: h.holder_user_id ? `u${h.holder_user_id}` : h.holder_staff_id ? `s${h.holder_staff_id}` : h.name, name: h.name })),
    openItem: (id) => setOpenId(id),
    edit: (item) => setDialog({ type: "form", item }),
    assign: (items, kind) => setDialog({ type: "assign", items, kind }),
    returnA: (assignment) => setDialog({ type: "return", assignment }),
    reserve: (items, reservation = null) => setDialog({ type: "reserve", items, reservation }),
    maintain: (item, record = null, closing = false) => setDialog({ type: "maint", item, record, closing }),
    fault: (item) => setDialog({ type: "fault", item }),
    labels: (items) => setDialog({ type: "labels", items }),
    openImport: () => setDialog({ type: "import" }),
    offerReceipt,
    goInventory: (filter = {}, hint = "") => { setPreset({ ...filter, _t: Date.now() }); go("envanter"); if (hint) toast(hint, { tone: "info" }); },
    seedCategories: async () => { const r = await post(`${BASE}/categories/defaults`, {}, { queue: false }); if (result(r, r.ok ? (r.data.added ? `${r.data.added} kategori eklendi.` : "Önerilen kategoriler zaten var.") : null)) metaRes.reload({ quiet: true }); },
  }), [meta, perms, version, bump, go, metaRes, holdersRes.data, offerReceipt, toast, result]);

  useCommand("new", () => { if (perms.manage) setDialog({ type: "form", item: null }); });
  useCommand("print", () => { if (openId) setDialog({ type: "labels", items: [{ id: openId, asset_tag: "", name: "" }] }); });

  const denied = metaRes.error?.status === 403;
  const notDeployed = metaRes.error?.status === 404;
  const sections = SECTIONS.filter((s) => !s.manage || perms.manage);
  const done = (message) => (data) => { close(); if (message) toast(message, { tone: "success" }); bump(); if (data?.group_id && data.items?.length) offerReceipt(data.items); };

  return (
    <EquipmentContext.Provider value={ctx}>
      <div className="view view--split" data-tool="equipment">
        <div className="split__main">
          <header className="view-head">
            <span className="view-head__badge"><Icon name="box" size={22} strokeWidth={2} /></span>
            <div className="view-head__text">
              <h1>Ekipman</h1>
              <p>{meta ? `${meta.scope?.nationwide ? "Türkiye geneli" : `${meta.scope?.city_name || "İl"} + genel`} envanter · konum, değer, zimmet, rezervasyon ve bakım` : "Demirbaş envanteri, zimmet ve bakım takibi"}</p>
            </div>
            <div className="view-head__tools">
              <form className="eq-scan" role="search" onSubmit={(e) => { e.preventDefault(); openByCode(scan); }}>
                <Icon name="barcode" size={14} />
                <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Etiket / barkod okut" aria-label="Etiket no, barkod ya da seri no ile ekipman aç" />
              </form>
              {perms.manage && <button type="button" className="btn btn--primary" onClick={() => setDialog({ type: "form", item: null })}><Icon name="plus" /> Yeni ekipman</button>}
            </div>
          </header>
          <OfflineNote offline={metaRes.offline} savedAt={metaRes.savedAt} />
          {denied ? <Empty icon="lock" title="Ekipman aracına erişiminiz yok" text="Kullanıcı yetkilendirme ekranından &quot;Ekipman › Envanteri görüntüleme&quot; yetkisi verilmelidir." />
            : notDeployed ? <div className="error-note"><span>Ekipman aracı için sunucu güncellemesi henüz yayında değil.</span></div>
              : !meta ? (metaRes.error ? <ErrorNote error={metaRes.error} onRetry={metaRes.reload} /> : <Spinner />) : (
                <>
                  <div className="eq-sections"><Segmented value={section} onChange={go} ariaLabel="Ekipman bölümleri" options={sections} /></div>
                  {section === "pano" && <Dashboard />}
                  {section === "envanter" && <Inventory preset={preset} openId={openId} />}
                  {section === "zimmet" && <Holders />}
                  {section === "rezervasyon" && <Reservations />}
                  {section === "bakim" && <Maintenance />}
                  {section === "gecmis" && <History />}
                  {section === "ayarlar" && perms.manage && <Settings />}
                </>
              )}
        </div>
        {openId && meta && <ItemPanel key={openId} id={openId} onClose={() => setOpenId(null)} />}
      </div>
      {dialog?.type === "form" && <ItemForm item={dialog.item} meta={meta} onClose={close} onSaved={(item, editing) => { close(); bump(); metaRes.reload({ quiet: true }); if (item && !editing) setOpenId(item.id); }} />}
      {dialog?.type === "assign" && <AssignDialog items={dialog.items} kind={dialog.kind} onClose={close} onDone={done()} />}
      {dialog?.type === "return" && <ReturnDialog assignment={dialog.assignment} meta={meta} onClose={close} onDone={done("İade kaydedildi.")} />}
      {dialog?.type === "reserve" && <ReserveDialog items={dialog.items} reservation={dialog.reservation} onClose={close} onDone={done(dialog.reservation ? "Rezervasyon güncellendi." : "Rezervasyon kaydedildi.")} />}
      {dialog?.type === "maint" && <MaintenanceDialog item={dialog.item} record={dialog.record} closing={dialog.closing} onClose={close} onDone={done()} />}
      {dialog?.type === "fault" && <FaultDialog item={dialog.item} onClose={close} onDone={done()} />}
      {dialog?.type === "labels" && <LabelsFor items={dialog.items} onClose={close} />}
      {dialog?.type === "import" && <ImportDialog onClose={close} onDone={() => { bump(); metaRes.reload({ quiet: true }); }} />}
    </EquipmentContext.Provider>
  );
}

/** ⌘P açık kart için yalnız kimlik bilinirken: kartı okuyup etiket penceresini açar. */
function LabelsFor({ items, onClose }) {
  const needsLoad = items.length === 1 && !items[0].asset_tag;
  const res = useResource(needsLoad ? `${BASE}/items/${items[0].id}` : null, undefined, { enabled: needsLoad });
  if (needsLoad && !res.data) return null;
  return <LabelDialog items={needsLoad ? [res.data.item] : items} onClose={onClose} />;
}
