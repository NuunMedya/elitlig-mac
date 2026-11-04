// Tablolar: dosya listesi (kendi + benimle paylaşılan), şablonlar, Excel/CSV
// içe aktarma. Bir dosya açılınca hesap tablosu düzenleyicisi gelir.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, Modal, OfflineNote, Spinner, ViewHeader, useConfirm, useResult, useToast } from "../components/ui";
import { del, patch, post, useCommand, useResource } from "../api";
import { TEMPLATES } from "../lib/sheets/sheetOps";
import { importFile as readSheetFile } from "../lib/sheets/importFile";
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

  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const importData = async (name, data) => {
    setBusy(true);
    try {
      const { title, book, warnings } = await readSheetFile(name, data);
      await create(title, book);
      if (warnings.length) toast(`İçe aktarıldı. Not: ${warnings.slice(0, 2).join(" · ")}`, { tone: "warn", timeout: 8000 });
      else toast(`“${title}” içe aktarıldı.`, { tone: "success" });
    } catch (error) {
      toast(error?.message || "Dosya okunamadı.", { tone: "error", timeout: 7000 });
    } finally {
      setBusy(false);
    }
  };
  const importFile = async () => {
    const file = await window.elitlig.files.open([{ name: "Excel / CSV", extensions: ["xlsx", "xlsm", "csv", "tsv", "txt"] }]);
    if (file.ok) await importData(file.name, file.data);
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await importData(file.name, new Uint8Array(await file.arrayBuffer()));
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
    <div className="view" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={onDrop}>
      {dragging && <div className="drop-overlay">Excel ya da CSV dosyasını bırakın</div>}
      <ViewHeader icon="grid" title="Tablolar" subtitle="Formüllü hesap tabloları — TOPLA, EĞER, DÜŞEYARA, ETOPLA…">
        <div className="search-box"><Icon name="search" size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Dosya ara" /></div>
        <button type="button" className="btn" onClick={importFile} disabled={busy}><Icon name="upload" /> {busy ? "Aktarılıyor…" : "Excel / CSV içe aktar"}</button>
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

