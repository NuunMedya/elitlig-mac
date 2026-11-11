// ⌘P (Dosya ▸ Yazdır…) çalışma alanında: birincil dışa aktarma ya da genel sayfa raporu YALNIZ
// odaktaki bölmeden. Yan yana görünen diğer bölmeler o an için "inert" işaretlenir (dışa aktarma
// kayıt defteri görünür + inert olmayan düğmeyi seçer); genel rapor odaktaki bölmenin içeriğinden.
import React, { useEffect, useRef, useState } from "react";
import ExportDialog from "../lib/export/ExportDialog";
import { handlePrintCommand } from "../lib/export/exportRegistry";
import { pageReport } from "../lib/export/PagePrint";

export function WorkspacePrintHost({ subscribe }) {
  const [model, setModel] = useState(null);
  const open = useRef(null);
  open.current = () => {
    const target = document.querySelector(".ws-body.is-target");
    try { setModel(pageReport(target || undefined)); } catch { /* yoksay */ }
  };
  useEffect(() => (subscribe ? subscribe(() => {
    const others = [...document.querySelectorAll(".ws-area.is-multi .ws-body:not(.is-target)")];
    others.forEach((el) => el.setAttribute("inert", ""));
    setTimeout(() => others.forEach((el) => el.removeAttribute("inert")), 60);
    handlePrintCommand(() => open.current());
  }) : undefined), [subscribe]);
  return model ? (
    <ExportDialog id="page-print" title={model.title} report={model} formats={["pdf", "docx", "md"]} initialFormat="pdf" onClose={() => setModel(null)} />
  ) : null;
}
