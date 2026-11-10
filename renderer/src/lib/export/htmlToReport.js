// Hazır HTML belgeyi (teklif, sunum, proje özeti) Word'e aktarmak için rapor modeline çevirir.
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR. Tarayıcıda (DOMParser) çalışır.
//
//   const report = htmlToReport(doc.html, "Teklif");
//   renderReport(report, "docx")
//
// Başlıklar (h1-h4), paragraflar, listeler, alıntılar ve tablolar korunur; her tablo ayrı
// bir tablo bölümü olur, aradaki metin Markdown metin bölümlerine toplanır. Görseller,
// betikler ve stiller atlanır. Slayt/bölüm sınırları (section, .slide, .page) ayraç olur.

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

function inlineMd(node) {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, " "); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (["script", "style", "svg", "img", "noscript"].includes(tag)) return;
    if (tag === "br") { out += "\n"; return; }
    const inner = inlineMd(n);
    if (!clean(inner)) { out += inner; return; }
    if (tag === "b" || tag === "strong") out += `**${clean(inner)}**`;
    else if (tag === "i" || tag === "em") out += `*${clean(inner)}*`;
    else if (tag === "a" && /^(https?:|mailto:)/i.test(n.getAttribute("href") || "")) out += `[${clean(inner)}](${n.getAttribute("href")})`;
    else out += inner;
  });
  return out;
}

const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "main", "aside", "li", "ul", "ol", "table", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "figure", "dl", "hr"]);
const hasBlockChild = (el) => [...el.children].some((c) => BLOCK.has(c.tagName.toLowerCase()));

/** html: tam belge ya da parça. Dönen rapor exportCore modelindedir. */
export function htmlToReport(html, title = "Belge", { subtitle = "", filters = [] } = {}) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
  const sections = [];
  let text = [];
  let docTitle = "";
  const flush = () => { const t = text.join("\n\n").trim(); if (t) sections.push({ id: `t${sections.length}`, kind: "text", text: t }); text = []; };
  const walk = (el) => {
    [...el.children].forEach((n) => {
      const tag = n.tagName.toLowerCase();
      if (["script", "style", "svg", "img", "noscript", "button", "iframe", "video", "audio"].includes(tag)) return;
      if (/^h[1-6]$/.test(tag)) {
        const t = clean(n.textContent);
        if (!t) return;
        if (!docTitle && tag === "h1") { docTitle = t; return; }
        text.push(`${"#".repeat(Math.min(3, Number(tag[1]) - 1 || 1))} ${t}`);
      } else if (tag === "table") {
        flush();
        const rows = [...n.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => clean(c.textContent)));
        if (!rows.length) return;
        const headIsTh = n.querySelector("thead") || [...(n.querySelector("tr")?.children || [])].every((c) => c.tagName === "TH");
        // İki sütunlu, başlıksız tablolar (künye) anahtar/değer olarak yazılır.
        if (!headIsTh && rows.every((r) => r.length === 2)) { sections.push({ id: `kv${sections.length}`, kind: "keyvalue", items: rows.map(([label, value]) => ({ label, value })) }); return; }
        const head = headIsTh ? rows[0] : rows[0].map((_, i) => `Sütun ${i + 1}`);
        const body = headIsTh ? rows.slice(1) : rows;
        const width = Math.max(head.length, ...body.map((r) => r.length));
        const columns = Array.from({ length: width }, (_, i) => ({ key: `c${i}`, label: head[i] || `Sütun ${i + 1}` }));
        sections.push({ id: `tb${sections.length}`, columns, rows: body.map((r) => Object.fromEntries(columns.map((c, i) => [c.key, r[i] ?? ""]))), totals: false });
      } else if (tag === "ul" || tag === "ol") {
        const items = [...n.children].filter((li) => li.tagName === "LI").map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${clean(inlineMd(li))}`);
        if (items.length) text.push(items.join("\n"));
      } else if (tag === "blockquote") {
        const t = clean(inlineMd(n));
        if (t) text.push(`> ${t}`);
      } else if (tag === "pre") {
        text.push(`\`\`\`\n${n.textContent.trim()}\n\`\`\``);
      } else if (tag === "hr") {
        text.push("---");
      } else if (hasBlockChild(n)) {
        const boundary = tag === "section" || /\b(slide|page)\b/.test(n.className || "");
        if (boundary && text.length) text.push("---");
        walk(n);
      } else {
        const t = inlineMd(n).replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();
        if (t) text.push(t);
      }
    });
  };
  walk(doc.body);
  flush();
  return { title: docTitle || clean(doc.title) || title, subtitle, filters, orientation: "portrait", sections };
}
