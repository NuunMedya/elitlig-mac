// Not Defteri çekirdeği: Markdown benzeri biçim ayrıştırma, düzenleyici
// biçimlendirme komutları, [[Not adı]] bağlantıları ve geri bağlantılar,
// akıllı listeler, tam metin arama, şablonlar ve dışa aktarma.
//
// Saf JavaScript: React'a ve tarayıcıya bağlı değildir. Aynı dosya web panelinde
// (elitlig-client src/pages/management/tools/notes/noteCore.js) da kullanılır;
// birinde yapılan değişiklik ötekine de taşınmalıdır.

const LOCALE = "tr-TR";
export const lowerTr = (value) => String(value || "").toLocaleLowerCase(LOCALE);
const pad = (n) => String(n).padStart(2, "0");

/* ------------------------------- satır içi biçim ------------------------------ */

// Sıra önemli: kod önce (içi ayrıştırılmaz), sonra bağlantılar, sonra vurgular.
const INLINE_RE = /(`[^`\n]+`)|(\[\[[^\]\n]{1,200}\]\])|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:|tel:)[^)\s]+\))|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*|_[^_\n]+_)|((?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Satır içi biçimi parçalara ayırır: text, code, bold, italic, strike, link, wiki. */
export function parseInline(input = "") {
  const out = [];
  const src = String(input);
  let last = 0;
  src.replace(INLINE_RE, (match, code, wiki, link, bold, strike, italic, url, offset) => {
    if (offset > last) out.push({ type: "text", text: src.slice(last, offset) });
    if (code) out.push({ type: "code", text: code.slice(1, -1) });
    else if (wiki) {
      const inner = wiki.slice(2, -2);
      const [title, alias] = inner.split("|");
      out.push({ type: "wiki", title: title.trim(), text: (alias || title).trim() });
    } else if (link) {
      const m = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      out.push({ type: "link", href: m[2], children: parseInline(m[1]) });
    } else if (bold) out.push({ type: "bold", children: parseInline(bold.slice(2, -2)) });
    else if (strike) out.push({ type: "strike", children: parseInline(strike.slice(2, -2)) });
    else if (italic) out.push({ type: "italic", children: parseInline(italic.slice(1, -1)) });
    else if (url) out.push({ type: "link", href: url, children: [{ type: "text", text: url }] });
    last = offset + match.length;
    return match;
  });
  if (last < src.length) out.push({ type: "text", text: src.slice(last) });
  return out;
}

/** Biçim işaretlerinden arındırılmış düz metin (önizleme ve arama için). */
export function plainText(md = "") {
  const strip = (tokens) => tokens.map((t) => (t.children ? strip(t.children) : t.text)).join("");
  return String(md || "")
    .split("\n")
    // Tablo: ayraç satırı düşer, hücreler " · " ile birleşir.
    .filter((line) => !TABLE_SEP_RE.test(line) || !line.includes("-"))
    .map((line) => (TABLE_ROW_RE.test(line) ? tableCells(line).filter(Boolean).join(" · ") : line))
    .map((line) => strip(parseInline(line
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^\s*(?:```.*|---+|\*\*\*+)\s*$/, ""))))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------- blok ayrıştırma ------------------------------ */

const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s?(.*)$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s*```(.*)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const tableCells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/**
 * Metni bloklara ayırır. Her blok ilk satır numarasını (line) taşır; onay
 * kutusu maddelerinde satır numarası işaretlemeyi metne geri yazmak için kullanılır.
 */
export function parseBlocks(md = "") {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const fence = line.match(FENCE_RE);
    if (fence) {
      const start = i;
      const body = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: "code", lang: fence[1].trim(), text: body.join("\n"), line: start });
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, inline: parseInline(heading[2].trim()), text: heading[2].trim(), line: i }); i += 1; continue; }
    if (HR_RE.test(line)) { blocks.push({ type: "hr", line: i }); i += 1; continue; }
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const start = i;
      const header = tableCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) { rows.push(tableCells(lines[i])); i += 1; }
      blocks.push({ type: "table", header: header.map(parseInline), rows: rows.map((r) => header.map((_, c) => parseInline(r[c] || ""))), line: start });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const start = i;
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      blocks.push({ type: "quote", children: parseBlocks(body.join("\n")), line: start });
      continue;
    }
    if (TASK_RE.test(line) || BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const ordered = !TASK_RE.test(line) && !BULLET_RE.test(line);
      const start = i;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const task = l.match(TASK_RE);
        const bullet = !task && l.match(BULLET_RE);
        const num = !task && !bullet && l.match(ORDERED_RE);
        if (!task && !bullet && !num) break;
        if (Boolean(num) !== ordered) break;
        const indent = (task || bullet || num)[1].replace(/\t/g, "  ").length;
        if (task) items.push({ task: true, checked: task[2].toLowerCase() === "x", inline: parseInline(task[3]), text: task[3], line: i, depth: Math.floor(indent / 2) });
        else if (bullet) items.push({ inline: parseInline(bullet[2]), text: bullet[2], line: i, depth: Math.floor(indent / 2) });
        else items.push({ inline: parseInline(num[3]), text: num[3], line: i, depth: Math.floor(indent / 2), number: Number(num[2]) });
        i += 1;
      }
      blocks.push({ type: "list", ordered, items, line: start, start: ordered ? items[0].number : undefined });
      continue;
    }
    const start = i;
    const body = [];
    while (i < lines.length && lines[i].trim() && !HEADING_RE.test(lines[i]) && !FENCE_RE.test(lines[i]) && !HR_RE.test(lines[i]) && !/^\s*>/.test(lines[i]) && !TASK_RE.test(lines[i]) && !BULLET_RE.test(lines[i]) && !ORDERED_RE.test(lines[i]) && !(TABLE_ROW_RE.test(lines[i]) && TABLE_SEP_RE.test(lines[i + 1] || ""))) {
      body.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: body.map(parseInline), line: start });
  }
  return blocks;
}

/** Metindeki n. satırdaki onay kutusunu çevirir (önizlemeden işaretleme). */
export function toggleTaskLine(md = "", lineIndex) {
  const lines = String(md || "").split("\n");
  const m = lines[lineIndex]?.match(TASK_RE);
  if (!m) return md;
  lines[lineIndex] = lines[lineIndex].replace(/\[([ xX])\]/, m[2] === " " ? "[x]" : "[ ]");
  return lines.join("\n");
}

/** Görevler: metindeki `- [ ]` satırları + liste notunun maddeleri. */
export function taskStats(note = {}) {
  let open = 0;
  let done = 0;
  for (const line of String(note.body || "").split("\n")) {
    const m = line.match(TASK_RE);
    if (m) { if (m[2] === " ") open += 1; else done += 1; }
  }
  for (const item of note.checklist || []) { if (item.done) done += 1; else open += 1; }
  return { open, done, total: open + done };
}

/** Kelime, karakter ve okuma süresi (dakika, 200 kelime/dk). */
export function textStats(note = {}) {
  const text = [note.title, plainText(note.body), ...(note.checklist || []).map((c) => c.text)].filter(Boolean).join("\n");
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return { words, chars: text.replace(/\s/g, "").length, charsWithSpaces: text.length, minutes: Math.max(1, Math.round(words / 200)) };
}

/* --------------------------- düzenleyici komutları --------------------------- */

const lineBounds = (value, start, end = start) => {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", end);
  return { from, to: nl === -1 ? value.length : nl };
};

/**
 * Seçime biçim uygular. kind: bold | italic | strike | code | link | wiki |
 * h1 | h2 | h3 | bullet | number | task | quote | codeblock
 * Dönüş: { value, start, end } (yeni seçim).
 */
export function applyFormat(value = "", start = 0, end = start, kind) {
  const selected = value.slice(start, end);
  const wrap = (before, after = before, placeholder = "metin") => {
    // Zaten sarılıysa kaldır.
    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const inner = selected.slice(before.length, selected.length - after.length);
      return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
    }
    if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
      return { value: value.slice(0, start - before.length) + selected + value.slice(end + after.length), start: start - before.length, end: end - before.length };
    }
    const inner = selected || placeholder;
    return { value: value.slice(0, start) + before + inner + after + value.slice(end), start: start + before.length, end: start + before.length + inner.length };
  };
  if (kind === "bold") return wrap("**");
  if (kind === "italic") return wrap("*");
  if (kind === "strike") return wrap("~~");
  if (kind === "code") return wrap("`", "`", "kod");
  if (kind === "wiki") return wrap("[[", "]]", "Not adı");
  if (kind === "link") {
    const label = selected || "bağlantı";
    const isUrl = /^https?:\/\//.test(selected);
    const text = isUrl ? `[bağlantı](${selected})` : `[${label}](https://)`;
    const caret = isUrl ? start + 1 : start + label.length + 3;
    return { value: value.slice(0, start) + text + value.slice(end), start: caret, end: isUrl ? caret + 8 : caret + 8 };
  }
  if (kind === "codeblock") {
    const text = `\`\`\`\n${selected || ""}\n\`\`\``;
    return { value: value.slice(0, start) + text + value.slice(end), start: start + 4, end: start + 4 + selected.length };
  }
  const PREFIX = { h1: "# ", h2: "## ", h3: "### ", bullet: "- ", task: "- [ ] ", quote: "> " };
  if (PREFIX[kind] || kind === "number") {
    const { from, to } = lineBounds(value, start, end);
    const lines = value.slice(from, to).split("\n");
    const prefixOf = (i) => (kind === "number" ? `${i + 1}. ` : PREFIX[kind]);
    const stripRe = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/;
    // Satırda aynı işaret zaten varsa komut işareti kaldırır (aç / kapa).
    const markerOf = (l) => (l.match(stripRe)[2] || "").trim();
    const already = lines.every((l, i) => (kind === "number" ? /^\d+[.)]$/.test(markerOf(l)) : markerOf(l) === prefixOf(i).trim()));
    const next = lines.map((l, i) => {
      const [, indent] = l.match(stripRe);
      const body = l.replace(stripRe, "");
      return already ? indent + body : indent + prefixOf(i) + body;
    }).join("\n");
    const out = value.slice(0, from) + next + value.slice(to);
    const delta = next.length - (to - from);
    return { value: out, start: Math.max(from, start + (lines.length === 1 ? delta : 0)), end: end + delta };
  }
  return { value, start, end };
}

/**
 * Enter: liste satırındaysa yeni madde açar; boş maddede listeyi bitirir.
 * Dönüş null ise varsayılan davranış sürer.
 */
export function continueList(value = "", caret = 0) {
  const { from, to } = lineBounds(value, caret);
  if (caret !== to) return null;
  const line = value.slice(from, to);
  const task = line.match(TASK_RE);
  const bullet = !task && line.match(BULLET_RE);
  const num = !task && !bullet && line.match(ORDERED_RE);
  const quote = !task && !bullet && !num && line.match(/^(\s*)>\s?(.*)$/);
  let marker = null;
  let body = "";
  if (task) { marker = `${task[1]}- [ ] `; body = task[3]; }
  else if (bullet) { marker = `${bullet[1]}${line.trim()[0]} `; body = bullet[2]; }
  else if (num) { marker = `${num[1]}${Number(num[2]) + 1}. `; body = num[3]; }
  else if (quote) { marker = `${quote[1]}> `; body = quote[2]; }
  if (!marker) return null;
  if (!body.trim()) {
    // Boş madde: işaret silinir, liste biter.
    const out = value.slice(0, from) + value.slice(to);
    return { value: out, start: from, end: from };
  }
  const insert = `\n${marker}`;
  return { value: value.slice(0, caret) + insert + value.slice(caret), start: caret + insert.length, end: caret + insert.length };
}

/** Tab / Shift+Tab: seçili liste satırlarını içe / dışa kaydırır. */
export function indentLines(value = "", start = 0, end = start, outdent = false) {
  const { from, to } = lineBounds(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const next = lines.map((l) => (outdent ? l.replace(/^ {1,2}|^\t/, "") : `  ${l}`)).join("\n");
  const delta = next.length - (to - from);
  const firstDelta = (outdent ? (lines[0].match(/^ {1,2}|^\t/) || [""])[0].length * -1 : 2);
  return { value: value.slice(0, from) + next + value.slice(to), start: Math.max(from, start + firstDelta), end: end + delta };
}

/* ------------------------------- "/" komutları ------------------------------- */

const todayLong = (now) => now.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric", weekday: "long" });

export const SLASH_COMMANDS = [
  { key: "h1", label: "Başlık 1", hint: "Büyük bölüm başlığı", icon: "heading", keywords: "baslik başlık h1 heading", text: () => "# " },
  { key: "h2", label: "Başlık 2", hint: "Orta başlık", icon: "heading", keywords: "baslik başlık h2", text: () => "## " },
  { key: "h3", label: "Başlık 3", hint: "Küçük başlık", icon: "heading", keywords: "baslik başlık h3", text: () => "### " },
  { key: "task", label: "Yapılacak", hint: "Onay kutulu madde", icon: "check", keywords: "gorev görev todo yapilacak yapılacak onay checkbox", text: () => "- [ ] " },
  { key: "bullet", label: "Madde listesi", hint: "Noktalı liste", icon: "list", keywords: "liste madde bullet", text: () => "- " },
  { key: "number", label: "Numaralı liste", hint: "1. 2. 3.", icon: "listOl", keywords: "numara sirali sıralı ordered", text: () => "1. " },
  { key: "quote", label: "Alıntı", hint: "Vurgulu alıntı bloğu", icon: "quote", keywords: "alinti alıntı quote", text: () => "> " },
  { key: "code", label: "Kod bloğu", hint: "Eş aralıklı metin", icon: "code", keywords: "kod code", text: () => "```\n\n```", caret: 4 },
  { key: "table", label: "Tablo", hint: "3 sütunlu tablo", icon: "table", keywords: "tablo table", text: () => "| Başlık | Başlık | Başlık |\n| --- | --- | --- |\n|  |  |  |\n", caret: 2 },
  { key: "divider", label: "Ayraç", hint: "Yatay çizgi", icon: "minus", keywords: "ayrac ayraç cizgi çizgi divider hr", text: () => "---\n" },
  { key: "date", label: "Bugünün tarihi", hint: "Ör. 10 Kasım 2026 Salı", icon: "calendar", keywords: "tarih bugun bugün date", text: (now = new Date()) => todayLong(now) },
  { key: "time", label: "Şu anki saat", hint: "Ör. 14:05", icon: "clock", keywords: "saat time", text: (now = new Date()) => `${pad(now.getHours())}:${pad(now.getMinutes())}` },
  { key: "link", label: "Not bağlantısı", hint: "[[Not adı]]", icon: "link", keywords: "baglanti bağlantı link not wiki", text: () => "[[]]", caret: 2 },
];

/** "/" sonrası yazılana uyan komutlar. */
export function filterSlash(query = "") {
  const q = lowerTr(query).trim();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => lowerTr(`${c.label} ${c.keywords}`).includes(q));
}

/**
 * İmlecin hemen solunda satır başında ya da boşluktan sonra gelen "/sorgu"
 * varsa { from, query } döner.
 */
export function slashContext(value = "", caret = 0) {
  const before = value.slice(0, caret);
  const m = before.match(/(^|\s)\/([\p{L}\p{N}]{0,20})$/u);
  if (!m) return null;
  return { from: caret - m[2].length - 1, query: m[2] };
}

/** Komutu "/sorgu"nun yerine yerleştirir. */
export function runSlash(value = "", ctx, command, now = new Date()) {
  const text = command.text(now);
  const lineStart = value.lastIndexOf("\n", ctx.from - 1) + 1;
  const blockLike = ["h1", "h2", "h3", "task", "bullet", "number", "quote", "code", "table", "divider"].includes(command.key);
  // Blok komutu satır ortasında çağrıldıysa yeni satıra geçilir.
  const prefix = blockLike && value.slice(lineStart, ctx.from).trim() ? "\n" : "";
  const end = ctx.from + 1 + ctx.query.length;
  const out = value.slice(0, ctx.from) + prefix + text + value.slice(end);
  const caret = ctx.from + prefix.length + (command.caret ?? text.length);
  return { value: out, start: caret, end: caret };
}

/** "[[" yazılırken not adı tamamlaması için bağlam: { from, query }. */
export function wikiContext(value = "", caret = 0) {
  const before = value.slice(0, caret);
  const m = before.match(/\[\[([^\]\n[]{0,60})$/);
  return m ? { from: caret - m[1].length, query: m[1] } : null;
}

/* --------------------------- bağlantılar / geri bağlantılar --------------------------- */

const WIKI_RE = /\[\[([^\]\n|]{1,200})(?:\|[^\]\n]*)?\]\]/g;
const titleKey = (title) => lowerTr(title).trim().replace(/\s+/g, " ");

/** Notun içindeki [[bağlantı]] başlıkları (tekil). */
export function wikiLinks(body = "") {
  const out = [];
  const seen = new Set();
  String(body || "").replace(WIKI_RE, (_, title) => {
    const key = titleKey(title);
    if (key && !seen.has(key)) { seen.add(key); out.push(title.trim()); }
    return _;
  });
  return out;
}

/** Başlıktan nota: aynı başlıklı notlardan en son düzenlenen. */
export function findByTitle(notes = [], title = "") {
  const key = titleKey(title);
  if (!key) return null;
  return notes.filter((n) => !n.deleted_at && titleKey(n.title) === key)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

/** Bu nota [[bağlantı]] veren notlar ve bağlantının geçtiği satır. */
export function backlinks(notes = [], note) {
  const key = titleKey(note?.title);
  if (!key) return [];
  const out = [];
  for (const n of notes) {
    if (n.id === note.id || n.deleted_at) continue;
    const line = String(n.body || "").split("\n").find((l) => {
      let hit = false;
      l.replace(WIKI_RE, (m, t) => { if (titleKey(t) === key) hit = true; return m; });
      return hit;
    });
    if (line) out.push({ note: n, line: plainText(line).slice(0, 160) });
  }
  return out;
}

/** Not yeniden adlandırılınca diğer notlardaki [[eski]] bağlantıları [[yeni]] olur. */
export function renameLinks(body = "", oldTitle = "", newTitle = "") {
  const key = titleKey(oldTitle);
  if (!key || !newTitle.trim()) return body;
  return String(body || "").replace(/\[\[([^\]\n|]{1,200})(\|[^\]\n]*)?\]\]/g, (m, t, alias = "") => (titleKey(t) === key ? `[[${newTitle.trim()}${alias}]]` : m));
}

/* ---------------------------------- arama ---------------------------------- */

export const noteText = (note = {}) => [
  note.title,
  note.body,
  ...(note.checklist || []).map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`),
].filter(Boolean).join("\n");

/** Basit eşleşme (eski davranış): başlık, metin, maddeler ve etiketler. */
export const matchesQuery = (note, query = "") => {
  const q = lowerTr(query).trim();
  if (!q) return true;
  return lowerTr(`${noteText(note)} ${(note.tags || []).join(" ")}`).includes(q);
};

const terms = (query) => lowerTr(query).split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean);

/**
 * Tam metin arama: tüm kelimeler geçmeli (sıra önemsiz). Başlıkta geçen,
 * etiketle eşleşen ve yeni düzenlenen not öne çıkar. Her sonuçta vurgulu
 * önizleme satırı (snippet) döner.
 */
export function searchNotes(notes = [], query = "") {
  const words = terms(query);
  if (!words.length) return notes.map((note) => ({ note, score: 0, snippet: null }));
  const out = [];
  for (const note of notes) {
    const title = lowerTr(note.title);
    const body = lowerTr(plainText(note.body));
    const items = lowerTr((note.checklist || []).map((c) => c.text).join("\n"));
    const tags = (note.tags || []).map(lowerTr);
    let score = 0;
    let ok = true;
    for (const w of words) {
      const inTitle = title.includes(w);
      const inTag = tags.some((t) => t === w || t.startsWith(w));
      const inBody = body.includes(w) || items.includes(w);
      if (!inTitle && !inTag && !inBody) { ok = false; break; }
      score += (inTitle ? 10 : 0) + (inTag ? 6 : 0) + (inBody ? 2 : 0) + (title.startsWith(w) ? 4 : 0);
    }
    if (!ok) continue;
    if (note.pinned) score += 1;
    out.push({ note, score, snippet: snippetOf(note, words) });
  }
  return out.sort((a, b) => b.score - a.score || String(b.note.updatedAt || "").localeCompare(String(a.note.updatedAt || "")));
}

/** İlk eşleşmenin çevresinden kısa metin. */
export function snippetOf(note, words, radius = 60) {
  const source = [plainText(note.body), ...(note.checklist || []).map((c) => c.text)].join(" · ").replace(/\s+/g, " ");
  const low = lowerTr(source);
  let at = -1;
  for (const w of words) { const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return source.slice(0, radius * 2);
  const from = Math.max(0, at - radius);
  return `${from > 0 ? "…" : ""}${source.slice(from, at + radius * 1.5)}${at + radius * 1.5 < source.length ? "…" : ""}`;
}

/** Metni vurgulanacak parçalara böler: [{ text, hit }]. */
export function highlight(text = "", query = "") {
  const words = terms(query).filter((w) => w.length > 0);
  const src = String(text || "");
  if (!words.length || !src) return [{ text: src, hit: false }];
  const low = lowerTr(src);
  const marks = new Array(src.length).fill(false);
  for (const w of words) {
    let i = low.indexOf(w);
    while (i >= 0) { for (let k = i; k < i + w.length && k < src.length; k += 1) marks[k] = true; i = low.indexOf(w, i + w.length); }
  }
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += src[i];
    else out.push({ text: src[i], hit: marks[i] });
  }
  return out;
}

/* ------------------------------- akıllı listeler ------------------------------- */

const DAY = 86400000;
export const SMART_LISTS = [
  { key: "all", label: "Tüm notlar", icon: "notes" },
  { key: "pinned", label: "Sabitlenenler", icon: "pin" },
  { key: "recent", label: "Son düzenlenenler", icon: "clock", hint: "Son 7 gün" },
  { key: "tasks", label: "Görev içerenler", icon: "check", hint: "Açık görevi olan notlar" },
  { key: "shared", label: "Benimle paylaşılanlar", icon: "share" },
  { key: "archived", label: "Arşiv", icon: "archive" },
  { key: "trash", label: "Çöp kutusu", icon: "trash", hint: "30 gün sonra kalıcı silinir" },
];

/**
 * Seçili listeye / deftere / etikete uyan notlar.
 * scope: { list, notebookId, tag, includeSubNotebooks, notebooks }
 */
export function filterNotes(notes = [], { list = "all", notebookId = null, tag = "", notebooks = [], now = Date.now() } = {}) {
  let ids = null;
  if (notebookId != null) {
    ids = new Set([Number(notebookId), ...descendantIds(notebooks, notebookId)]);
  }
  return notes.filter((n) => {
    if (list === "trash") return Boolean(n.deleted_at);
    if (n.deleted_at) return false;
    if (list === "archived") return n.archived;
    if (n.archived) return false;
    if (list === "pinned" && !n.pinned) return false;
    if (list === "recent" && !(now - new Date(n.updatedAt || 0).getTime() < 7 * DAY)) return false;
    if (list === "tasks" && taskStats(n).open === 0) return false;
    if (list === "shared" && (n.access || "owner") === "owner") return false;
    if (ids && !ids.has(Number(n.notebook_id))) return false;
    if (tag && !(n.tags || []).some((t) => lowerTr(t) === lowerTr(tag))) return false;
    return true;
  });
}

export const SORTS = [
  { key: "updated", label: "Son düzenlenen" },
  { key: "created", label: "Oluşturulma" },
  { key: "title", label: "Başlık (A-Z)" },
];

export function sortNotes(notes = [], sort = "updated", { pinnedFirst = true } = {}) {
  return [...notes].sort((a, b) => {
    if (pinnedFirst && Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (sort === "title") return (a.title || "").localeCompare(b.title || "", "tr");
    const key = sort === "created" ? "createdAt" : "updatedAt";
    return String(b[key] || "").localeCompare(String(a[key] || ""));
  });
}

/* --------------------------------- defterler -------------------------------- */

export function descendantIds(notebooks = [], id) {
  const out = [];
  const walk = (pid) => notebooks.filter((nb) => Number(nb.parent_id) === Number(pid) && nb.parent_id != null).forEach((nb) => { out.push(Number(nb.id)); walk(nb.id); });
  walk(id);
  return out;
}

/** Defter ağacı düz liste olarak: [{ ...notebook, depth }] (sıra + ad). */
export function notebookTree(notebooks = []) {
  const byParent = new Map();
  const ids = new Set(notebooks.map((nb) => Number(nb.id)));
  for (const nb of notebooks) {
    const key = nb.parent_id != null && ids.has(Number(nb.parent_id)) ? Number(nb.parent_id) : null;
    byParent.set(key, [...(byParent.get(key) || []), nb]);
  }
  const out = [];
  const walk = (pid, depth, seen) => {
    const kids = (byParent.get(pid) || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name), "tr"));
    for (const nb of kids) {
      if (seen.has(Number(nb.id))) continue;
      out.push({ ...nb, depth });
      walk(Number(nb.id), depth + 1, new Set([...seen, Number(nb.id)]));
    }
  };
  walk(null, 0, new Set());
  return out;
}

/** "Projeler › Lig 2026" gibi defter yolu. */
export function notebookPath(notebooks = [], id) {
  const byId = new Map(notebooks.map((nb) => [Number(nb.id), nb]));
  const parts = [];
  let cur = byId.get(Number(id));
  const seen = new Set();
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); parts.unshift(cur.name); cur = cur.parent_id == null ? null : byId.get(Number(cur.parent_id)); }
  return parts.join(" › ");
}

/* --------------------------------- şablonlar -------------------------------- */

const dateLabel = (now) => now.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });

export const TEMPLATES = [
  {
    key: "blank", label: "Boş not", emoji: "", description: "Sıfırdan yazın.",
    build: () => ({ title: "", body: "" }),
  },
  {
    key: "meeting", label: "Toplantı notu", emoji: "🗓️", description: "Katılımcılar, gündem, kararlar ve görevler.",
    build: (now) => ({
      title: `Toplantı — ${dateLabel(now)}`,
      tags: ["toplantı"],
      body: "## Katılımcılar\n- \n\n## Gündem\n1. \n\n## Konuşulanlar\n\n\n## Kararlar\n- \n\n## Görevler\n- [ ] \n\n## Sonraki toplantı\n",
    }),
  },
  {
    key: "match", label: "Maç raporu", emoji: "⚽", description: "Skor, kadro, öne çıkanlar, kartlar ve notlar.",
    build: (now) => ({
      title: `Maç raporu — ${dateLabel(now)}`,
      tags: ["maç"],
      body: "**Maç:** Ev sahibi – Deplasman\n**Saha:** \n**Hakem:** \n\n## Skor\n| Takım | İlk yarı | Maç sonu |\n| --- | --- | --- |\n| Ev sahibi |  |  |\n| Deplasman |  |  |\n\n## Goller\n- \n\n## Kartlar\n- \n\n## Öne çıkanlar\n- \n\n## Saha ve organizasyon notları\n\n\n## Yapılacaklar\n- [ ] Maç sonucunu sisteme gir\n- [ ] Fotoğrafları paylaş\n",
    }),
  },
  {
    key: "site", label: "Saha keşif notu", emoji: "🏟️", description: "Saha bilgileri, olanaklar, fiyat ve iletişim.",
    build: (now) => ({
      title: `Saha keşfi — ${dateLabel(now)}`,
      tags: ["saha"],
      body: "**Saha adı:** \n**Adres:** \n**Yetkili:** \n\n## Olanaklar\n- [ ] Soyunma odası\n- [ ] Duş\n- [ ] Aydınlatma\n- [ ] Otopark\n- [ ] Kamera / yayın yeri\n- [ ] Tribün\n\n## Zemin ve ölçüler\n\n\n## Fiyat ve uygun saatler\n| Gün | Saat | Ücret |\n| --- | --- | --- |\n|  |  |  |\n\n## Değerlendirme\n> \n",
    }),
  },
  {
    key: "daily", label: "Günlük", emoji: "📔", description: "Bugünün öncelikleri, notlar ve yarına kalanlar.",
    build: (now) => ({
      title: now.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric", weekday: "long" }),
      tags: ["günlük"],
      body: "## Bugünün öncelikleri\n- [ ] \n- [ ] \n- [ ] \n\n## Notlar\n\n\n## Yarına kalanlar\n- \n",
    }),
  },
  {
    key: "idea", label: "Fikir", emoji: "💡", description: "Fikir, neden önemli, ilk adımlar.",
    build: () => ({
      title: "Yeni fikir",
      tags: ["fikir"],
      body: "## Fikir\n\n\n## Neden?\n- \n\n## Kimler için?\n- \n\n## İlk adımlar\n- [ ] \n\n## Riskler / sorular\n- \n",
    }),
  },
];

/** Şablondan not taslağı. */
export function fromTemplate(key, now = new Date()) {
  const tpl = TEMPLATES.find((t) => t.key === key) || TEMPLATES[0];
  const built = tpl.build(now);
  return { kind: "text", title: built.title || "", body: built.body || "", tags: built.tags || [], emoji: tpl.emoji || null, checklist: [] };
}

/* -------------------------------- dışa aktarma ------------------------------- */

/** Tek notun Markdown metni (liste notunda maddeler onay kutusu olur). */
export function noteToMarkdown(note = {}, { notebooks = [] } = {}) {
  const lines = [`# ${note.emoji ? `${note.emoji} ` : ""}${note.title || "Başlıksız not"}`];
  const meta = [];
  if (note.notebook_id != null && notebooks.length) meta.push(`Defter: ${notebookPath(notebooks, note.notebook_id)}`);
  if (note.tags?.length) meta.push(note.tags.map((t) => `#${t}`).join(" "));
  if (note.updatedAt) meta.push(`Son düzenleme: ${new Date(note.updatedAt).toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" })}`);
  if (meta.length) lines.push("", `_${meta.join(" · ")}_`);
  if (note.body && String(note.body).trim()) lines.push("", String(note.body).trim());
  if (note.checklist?.length) lines.push("", ...note.checklist.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`));
  return lines.join("\n");
}

export const notesToMarkdown = (notes = [], options) => notes.map((n) => noteToMarkdown(n, options)).join("\n\n---\n\n");

/** Dosya adı için güvenli başlık. */
export const fileSafe = (title = "") => (String(title || "not").replace(/[\\/:*?"<>|\n\r]+/g, " ").trim().slice(0, 80) || "not");

/** Eski not türleri: liste notunu metin + onay kutularına çevirir (düzenleyici tek tip). */
export function checklistToBody(note = {}) {
  const items = (note.checklist || []).map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n");
  return [String(note.body || "").trim(), items].filter(Boolean).join("\n\n");
}

/** Notun kısa önizlemesi (kart / liste). */
export function previewOf(note = {}, max = 160) {
  const text = note.kind === "checklist" && !String(note.body || "").trim()
    ? (note.checklist || []).map((c) => `${c.done ? "☑" : "☐"} ${c.text}`).join("  ")
    : plainText(note.body);
  return text.replace(/\s+/g, " ").slice(0, max);
}

/* -------------------------------- hızlı not -------------------------------- */

/** Hızlı not: ilk satır başlık, geri kalanı metin (Markdown); #etiketler etiket olur. */
export function quickNote(value = "") {
  const text = String(value || "").trim();
  const tags = [...new Set((text.match(/(?:^|\s)#([\p{L}\p{N}_-]{2,30})/gu) || []).map((m) => m.trim().slice(1)))].slice(0, 12);
  const [first, ...rest] = text.split("\n");
  return rest.length ? { title: first.trim().slice(0, 200), body: rest.join("\n").trim(), tags } : { title: null, body: first, tags };
}
