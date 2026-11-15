// "Bu sayfayı yazdır": sayfanın birincil dışa aktarmasını açar; sayfada yoksa görünen
// içerikten (htmlToReport) genel bir rapor kurup aynı yazdırma stüdyosunu açar.
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
//   masaüstü: <PagePrintHost subscribe={(fn) => window.elitlig.onCommand((c) => c === "print" && fn())} />
//   web:      <PagePrintButton className="ash-icon-btn" />  (üst çubuk)
import React, { useCallback, useEffect, useRef, useState } from "react";
import ExportDialog from "./ExportDialog";
import { handlePrintCommand, openPrimaryExport } from "./exportRegistry";
import { htmlToReport } from "./htmlToReport";

const CONTENT = "main.content, .app-container > .content, main, [role='main']";
/** Sayfanın görünen içeriğinden rapor modeli (araç çubukları, düğmeler, formlar atlanır). */
export function pageReport(root) {
  const el = root || document.querySelector(CONTENT) || document.body;
  const clone = el.cloneNode(true);
  clone.querySelectorAll("button,input,select,textarea,nav,[role='toolbar'],[aria-hidden='true'],[hidden],.xp-trigger,.xp-layer,.content__drag,dialog").forEach((n) => n.remove());
  const heading = el.querySelector("h1, h2")?.textContent?.trim();
  const title = heading || String(document.title || "Sayfa").replace(/\s*[—|-]\s*Elitlig.*$/i, "") || "Sayfa";
  const r = htmlToReport(clone.innerHTML, title, { spaced: true });
  if (!r.sections.length) r.sections.push({ id: "t0", kind: "text", text: "_Bu sayfada yazdırılacak içerik bulunamadı._" });
  return { ...r, title: r.title || title, subtitle: "Sayfa görünümü" };
}

/** Pencere durumu: open() birincil dışa aktarmayı ya da genel sayfa raporunu açar. */
export function usePagePrint() {
  const [model, setModel] = useState(null);
  const openGeneric = useCallback(() => { try { setModel(pageReport()); } catch { /* yoksay */ } }, []);
  const open = useCallback(() => { if (!openPrimaryExport("pdf")) openGeneric(); }, [openGeneric]);
  const dialog = model ? (
    <ExportDialog id="page-print" title={model.title} report={model} formats={["pdf", "docx", "md"]} initialFormat="pdf"
      onClose={() => setModel(null)} />
  ) : null;
  return { open, openGeneric, dialog };
}

/** Masaüstü: ⌘P (Dosya ▸ Yazdır…) komutunu dinler. */
export function PagePrintHost({ subscribe }) {
  const { openGeneric, dialog } = usePagePrint();
  const ref = useRef(openGeneric);
  ref.current = openGeneric;
  useEffect(() => (subscribe ? subscribe(() => handlePrintCommand(() => ref.current())) : undefined), [subscribe]);
  return dialog;
}

/** Web: üst çubuk düğmesi. */
export function PagePrintButton({ className = "", children }) {
  const { open, dialog } = usePagePrint();
  return (
    <>
      <button type="button" className={className} onClick={open} aria-label="Bu sayfayı yazdır / PDF" title="Bu sayfayı yazdır / PDF">
        {children || <i className="fa-solid fa-print" aria-hidden="true" />}
      </button>
      {dialog}
    </>
  );
}
