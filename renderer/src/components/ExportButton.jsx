// Ortak "Dışa aktar" düğmesi (masaüstü). Tek tıkla menü: PDF / Excel / Word / CSV /
// Markdown / Yazdır; seçim yazdırma stüdyosunu (lib/export/ExportDialog) açar: sütun /
// bölüm seçimi, 6 görünüm, 7 tasarım (Siyah-Beyaz dahil), canlı sayfalı önizleme.
// Kaydedince "Finder'da göster" eylemli bildirim çıkar. ⌘P (Dosya ▸ Yazdır…) sayfadaki
// birincil düğmenin penceresini açar (lib/export/exportRegistry; `primary` ile seçilir).
//
//   import ExportButton from "../components/ExportButton";
//   <ExportButton id="todos" title="Yapılacaklar"
//     report={({ scope }) => ({ title: "Yapılacaklar", sections: [{ columns, rows: scope === "all" ? all : shown }] })}
//     scopes={[{ value: "view", label: "Şu anki görünüm" }, { value: "all", label: "Tümü" }]} />
//
// Rapor modelinin tamamı: lib/export/exportCore.js başındaki açıklama.
// Programatik kullanım: <ExportDialog> (lib/export/ExportDialog) doğrudan da açılabilir.
import { useCallback, useEffect, useRef, useState } from "react";
import { MenuButton, isMac, useToast } from "./ui";
import ExportDialog from "../lib/export/ExportDialog";
import { formatInfo } from "../lib/export";
import { registerExport } from "../lib/export/exportRegistry";
import { reveal } from "../lib/export/platform";

const DEFAULT = ["pdf", "xlsx", "docx", "csv", "md"];
const REVEAL = () => (isMac() ? "Finder'da göster" : "Klasörde göster");

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
 * print (true: "Yazdır…" öğesi — stüdyoyu yazdırma için açar), className,
 * defaultDesign (görünüm / tema varsayılanı), primary (⌘P bu düğmeyi açsın).
 */
export default function ExportButton({ id, title, report, scopes, formats = DEFAULT, label = "Dışa aktar", text = "Dışa aktar", extraItems = [], print = true, className = "", defaultDesign, primary = false }) {
  const [open, setOpen] = useState(null);
  const done = useExportDone();
  const anchor = useRef(null);
  const fmtKey = formats.join(",");
  useEffect(() => {
    const list = fmtKey.split(",");
    return registerExport({
      el: () => anchor.current?.nextElementSibling || anchor.current?.parentElement,
      open: (fmt) => setOpen(list.includes(fmt) ? fmt : list[0]),
      primary,
      title,
    });
  }, [fmtKey, primary, title]);
  const items = [
    ...formats.map((key) => { const f = formatInfo(key); return { label: `${f.label} (.${f.ext})`, icon: f.icon, hint: f.hint, onClick: () => setOpen(key) }; }),
    ...(print ? [{ label: "Yazdır…", icon: "printer", onClick: () => setOpen(formats.includes("pdf") ? "pdf" : formats[0]) }] : []),
    ...(extraItems.length ? ["-", ...extraItems] : []),
  ];
  return (
    <>
      <span ref={anchor} hidden className="xp-anchor" data-export-id={id || "rapor"} />
      <MenuButton icon="download" label={label} text={text} items={items} className={`export-btn export-btn--${id || "rapor"} ${className}`} />
      {open && <ExportDialog id={id} title={title} report={report} scopes={scopes} formats={formats} initialFormat={open} defaultDesign={defaultDesign} onClose={() => setOpen(null)} onDone={done} />}
    </>
  );
}
