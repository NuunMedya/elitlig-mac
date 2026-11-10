// Ortak dışa aktarma — tek giriş noktası.
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
//   import { renderReport } from ".../export";
//   const out = renderReport(report, "docx", { columns, from, to, groupBy, orientation });
//   // out = { data: string | Uint8Array, mime, ext, fileName, html? }
//
// PDF için `data` HTML'dir (out.html); platform katmanı onu PDF'e basar.
import { FORMATS, defaultFileName, formatInfo, prepareReport, reportToCsv, reportToJson, reportToMarkdown, safeFileName } from "./exportCore";
import { reportToHtml } from "./exportHtml";
import { reportToXlsx } from "./exportXlsx";
import { reportToDocx } from "./exportDocx";

export * from "./exportCore";
export { reportToHtml, markdownToHtml } from "./exportHtml";
export { reportToXlsx } from "./exportXlsx";
export { reportToDocx } from "./exportDocx";

/**
 * report: rapor modeli (exportCore.js başındaki açıklama), format: FORMATS anahtarı.
 * opts: prepareReport seçenekleri + { fileName, logo (data URL, PDF), logoPng (Uint8Array, Word) }
 */
export function renderReport(report, format, opts = {}) {
  const p = prepareReport(report, opts);
  const info = formatInfo(format);
  const base = safeFileName(opts.fileName || defaultFileName(p.title, p.generatedAt));
  const fileName = base.toLowerCase().endsWith(`.${info.ext}`) ? base : `${base}.${info.ext}`;
  let data;
  switch (info.key) {
    case "xlsx": data = reportToXlsx(p); break;
    case "docx": data = reportToDocx(p, opts); break;
    case "csv": data = reportToCsv(p); break;
    case "md": data = reportToMarkdown(p); break;
    case "json": data = reportToJson(p); break;
    default: data = reportToHtml(p, opts);
  }
  return { data, mime: info.mime, ext: info.ext, format: info.key, fileName, html: info.key === "pdf" ? data : undefined, prepared: p };
}

export { FORMATS };
