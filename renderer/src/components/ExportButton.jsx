// Ortak "Dışa aktar" düğmesi (masaüstü). Tek tıkla menü: PDF / Excel / Word / CSV /
// Markdown / Yazdır; seçim "Ne aktarılsın?" penceresini (lib/export/ExportDialog) açar.
// Kaydedince "Finder'da göster" eylemli bildirim çıkar.
//
//   import ExportButton from "../components/ExportButton";
//   <ExportButton id="todos" title="Yapılacaklar"
//     report={({ scope }) => ({ title: "Yapılacaklar", sections: [{ columns, rows: scope === "all" ? all : shown }] })}
//     scopes={[{ value: "view", label: "Şu anki görünüm" }, { value: "all", label: "Tümü" }]} />
//
// Rapor modelinin tamamı: lib/export/exportCore.js başındaki açıklama.
// Programatik kullanım: <ExportDialog> (lib/export/ExportDialog) doğrudan da açılabilir.
import { useCallback, useState } from "react";
import { MenuButton, isMac, useToast } from "./ui";
import ExportDialog from "../lib/export/ExportDialog";
import { formatInfo, renderReport } from "../lib/export";
import { getLogo, printExport, reveal } from "../lib/export/platform";

const REVEAL = () => (isMac() ? "Finder'da göster" : "Klasörde göster");
const DEFAULT = ["pdf", "xlsx", "docx", "csv", "md"];

/** Kaydedildi bildirimi ("Finder'da göster" eylemli) — ExportDialog onDone için. */
export function useExportDone() {
  const toast = useToast();
  return useCallback((res) => {
    if (res?.ok && res.path) toast(`${formatInfo(res.format).label} kaydedildi: ${res.fileName}`, { tone: "success", timeout: 7000, action: { label: REVEAL(), run: () => reveal(res.path) } });
  }, [toast]);
}

/**
 * props: id, title, report, scopes, formats, label ("Dışa aktar"), text (düğme yazısı; boşsa
 * yalnız simge), extraItems (menüye eklenecek eski öğeler: [{ label, icon, onClick }]),
 * print (true: "Yazdır" öğesi), className.
 */
export default function ExportButton({ id, title, report, scopes, formats = DEFAULT, label = "Dışa aktar", text = "Dışa aktar", extraItems = [], print = true, className = "" }) {
  const [open, setOpen] = useState(null);
  const done = useExportDone();
  const toast = useToast();
  const doPrint = async () => {
    try {
      const model = typeof report === "function" ? await report({ scope: scopes?.[0]?.value || "view" }) : report;
      printExport(renderReport(model, "pdf", { ...(await getLogo()) }));
    } catch (e) { toast(e?.message || "Yazdırılamadı.", { tone: "error" }); }
  };
  const items = [
    ...formats.map((key) => { const f = formatInfo(key); return { label: `${f.label} (.${f.ext})`, icon: f.icon, hint: f.hint, onClick: () => setOpen(key) }; }),
    ...(print ? [{ label: "Yazdır…", icon: "printer", onClick: doPrint }] : []),
    ...(extraItems.length ? ["-", ...extraItems] : []),
  ];
  return (
    <>
      <MenuButton icon="download" label={label} text={text} items={items} className={`export-btn export-btn--${id || "rapor"} ${className}`} />
      {open && <ExportDialog id={id} title={title} report={report} scopes={scopes} formats={formats} initialFormat={open} onClose={() => setOpen(null)} onDone={done} />}
    </>
  );
}
