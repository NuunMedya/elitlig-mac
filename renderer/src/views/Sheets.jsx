// Tablolar: dosya listesi (kendi + benimle paylaşılan), şablonlar, Excel/CSV
// içe aktarma. Bir dosya açılınca hesap tablosu düzenleyicisi gelir.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, Modal, OfflineNote, Spinner, ViewHeader, useConfirm, useResult, useToast } from "../components/ui";
import { del, patch, post, useCommand, useResource } from "../api";
import { TEMPLATES } from "../lib/sheets/sheetOps";
import { XlsxImportError, xlsxToWorkbook } from "../lib/sheets/xlsxImport";
import { addr, parseCsv } from "../lib/sheets/sheetEngine";
import { includesTr, relativeTime } from "../lib/helpers";
import SheetEditor from "./SheetEditor";

const TEMPLATE_ICONS = { blank: "grid", dues: "users", budget: "wallet", standings: "star", attendance: "checkSquare" };

export default function Sheets({ arg, go }) {
  const [openId, setOpenId] = useState(arg && arg !== "new" ? arg : null);
  const [picker, setPicker] = useState(arg === "new");
  const [query, setQuery] = useState("");
  const list = useResource("/api/tools/sheets", undefined, { enabled: !openId });
  const result = useResult();
  const toast = useToast();
  const confirm = useConfirm();

  useCommand("new", () => { if (!openId) setPicker(true); });

  const items = useMemo(() => (list.data?.items || []).filter((s) => includesTr(s.title, query)), [list.data, query]);
  const mine = items.filter((s) => s.access === "owner");
  const shared = items.filter((s) => s.access !== "owner");

  const create = async (title, data) => {
    const res = await post("/api/tools/sheets", { title, data }, { queue: false });
    if (!result(res)) return;
    setPicker(false);
    setOpenId(res.data.item.id);
  };

  const importFile = async () => {
    const file = await window.elitlig.files.open([{ name: "Excel / CSV", extensions: ["xlsx", "xlsm", "csv", "txt"] }]);
    if (!file.ok) return;
    const title = file.name.replace(/\.(xlsx|xlsm|csv|txt)$/i, "");
    try {
      if (/\.csv$|\.txt$/i.test(file.name)) {
        const text = new TextDecoder("utf-8").decode(file.data);
        const rows = parseCsv(text);
        const cells = {};
        rows.slice(0, 1000).forEach((row, r) => row.slice(0, 52).forEach((v, c) => { if (v !== "") cells[addr(c, r)] = { v }; }));
        await create(title, { sheets: [{ name: "Sayfa1", rows: Math.max(100, Math.min(1000, rows.length + 20)), cols: Math.max(26, Math.min(52, Math.max(...rows.map((r) => r.length)))), cells, colW: {} }] });
      } else {
        const { workbook, warnings } = await xlsxToWorkbook(file.data);
        await create(title, workbook);
        if (warnings?.length) toast(`İçe aktarıldı. Not: ${warnings.slice(0, 2).join(" · ")}`, { tone: "warn", timeout: 7000 });
      }
    } catch (error) {
      toast(error instanceof XlsxImportError ? error.message : "Dosya okunamadı.", { tone: "error" });
    }
  };

  if (openId) return <SheetEditor id={openId} go={go} onClose={() => { setOpenId(null); list.reload({ quiet: true }); }} />;

  const row = (s) => (
    <li key={s.id} className="file-row">
      <button type="button" className="file-row__main" onClick={() => setOpenId(s.id)}>
        <span className="file-icon"><Icon name="grid" /></span>
        <span>
          <strong>{s.starred && <Icon name="star" size={12} className="text-amber" />} {s.title}</strong>
          <small className="muted">
            {s.sheet_count || 1} sayfa · {s.cell_count || 0} hücre · {relativeTime(s.updatedAt)}{s.updated_by_name ? ` · ${s.updated_by_name}` : ""}
            {s.access !== "owner" && ` · ${s.owner?.name || "paylaşıldı"} (${s.access === "editor" ? "düzenleyebilirsiniz" : "yalnız görüntüleme"})`}
            {s.share_count ? ` · ${s.share_count} kişiyle paylaşıldı` : ""}
          </small>
        </span>
      </button>
      <MenuButton items={s.access === "owner" ? [
        { label: s.starred ? "Yıldızı kaldır" : "Yıldızla", icon: "star", onClick: async () => { if (result(await patch(`/api/tools/sheets/${s.id}`, { starred: !s.starred }))) list.reload({ quiet: true }); } },
        { label: "Sil", icon: "trash", danger: true, onClick: async () => { if (await confirm({ title: "Tabloyu sil", message: `“${s.title}” ve paylaşımları silinsin mi?`, confirmLabel: "Sil", danger: true }) && result(await del(`/api/tools/sheets/${s.id}`), "Tablo silindi.")) list.reload({ quiet: true }); } },
      ] : [
        { label: "Paylaşımdan ayrıl", icon: "logout", danger: true, onClick: async () => { if (result(await del(`/api/tools/sheets/${s.id}/shares/me`), "Paylaşımdan ayrıldınız.")) list.reload({ quiet: true }); } },
      ]} />
    </li>
  );

  return (
    <div className="view">
      <ViewHeader title="Tablolar" subtitle="Formüllü hesap tabloları — TOPLA, EĞER, DÜŞEYARA, ETOPLA…">
        <div className="search-box"><Icon name="search" size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Dosya ara" /></div>
        <button type="button" className="btn" onClick={importFile}><Icon name="upload" /> Excel / CSV aç</button>
        <button type="button" className="btn btn--primary" onClick={() => setPicker(true)}><Icon name="plus" /> Yeni tablo</button>
      </ViewHeader>
      <OfflineNote offline={list.offline} savedAt={list.savedAt} />
      <ErrorNote error={list.error && !list.data ? list.error : null} onRetry={list.reload} />
      {list.loading && !list.data ? <Spinner /> : (<>
        <section className="templates">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="template" onClick={() => create(t.key === "blank" ? "Adsız tablo" : t.name, t.build())}>
              <span className="template__icon"><Icon name={TEMPLATE_ICONS[t.key] || "grid"} size={20} /></span>
              <strong>{t.name}</strong><small>{t.description}</small>
            </button>
          ))}
        </section>
        {mine.length > 0 && <><h3 className="section-title">Dosyalarım</h3><ul className="file-list">{mine.map(row)}</ul></>}
        {shared.length > 0 && <><h3 className="section-title">Benimle paylaşılanlar</h3><ul className="file-list">{shared.map(row)}</ul></>}
        {!items.length && <Empty icon="grid" title={query ? "Eşleşen tablo yok" : "Henüz tablo yok"} text="Bir şablonla başlayın ya da Excel dosyası açın." />}
      </>)}
      {picker && (
        <Modal title="Yeni tablo" onClose={() => setPicker(false)} width={640}>
          <section className="templates templates--modal">
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" className="template" onClick={() => create(t.key === "blank" ? "Adsız tablo" : t.name, t.build())}>
                <span className="template__icon"><Icon name={TEMPLATE_ICONS[t.key] || "grid"} size={20} /></span>
                <strong>{t.name}</strong><small>{t.description}</small>
              </button>
            ))}
            <button type="button" className="template" onClick={() => { setPicker(false); importFile(); }}>
              <span className="template__icon"><Icon name="upload" size={20} /></span><strong>Excel / CSV'den</strong><small>.xlsx ya da .csv dosyasını içe aktarın.</small>
            </button>
          </section>
        </Modal>
      )}
    </div>
  );
}

