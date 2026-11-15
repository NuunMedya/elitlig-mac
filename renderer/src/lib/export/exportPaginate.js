// Canlı önizleme: belge akışını gerçek sayfa ölçülerinde sayfalara böler (tarayıcı DOM'u).
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
//   const n = paginate(shadowRoot, reportHtmlParts(prepared, { design, logo }), "portrait");
//
// Yazdırmada sayfalamayı Chromium @page ile kendisi yapar; burada aynı CSS ile aynı
// ölçülerde (96 dpi) bloklar sırayla yerleştirilir: tablolar satır satır bölünür ve başlık
// satırı her sayfada tekrar eder, kart ızgaraları / listeler öğe öğe bölünür, bölüm
// başlıkları (data-keep) bir sonraki bloktan ayrılmaz. Ölçüm yapılamayan ortamda (jsdom)
// tek sayfa döner.
import { pageBox } from "./exportTheme";

export const MM_PX = 96 / 25.4;
const PREVIEW_CSS = `
:host{all:initial;display:block}
.xp-pages{display:flex;flex-direction:column;align-items:center;gap:18px;padding:18px 0 28px}
.xp-sheet{position:relative;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18),0 10px 30px -12px rgba(0,0,0,.35);overflow:hidden;flex:none}
.xp-sheet>.xd{position:absolute;overflow:hidden}
.xp-sheet .xd-wm{position:absolute;top:38%}
.xp-pf{position:absolute;display:flex;gap:10px;justify-content:space-between;align-items:center;font:7.5pt -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;white-space:nowrap}
.xp-pf span{overflow:hidden;text-overflow:ellipsis}
.xp-pf .c{flex:1;text-align:center}
.xp-pno{position:absolute;top:6px;right:8px;font:600 9px/1 -apple-system,"Segoe UI",sans-serif;color:#9ca3af;letter-spacing:.3px}
`;

/**
 * root: ShadowRoot ya da öğe. parts: reportHtmlParts çıktısı. orientation: prepared.orientation.
 * opts: { maxPages = 80, footInk } → { pages, truncated, width, height } (px, ölçeksiz)
 */
export function paginate(root, parts, orientation = "portrait", { maxPages = 80 } = {}) {
  const doc = root.ownerDocument || document;
  const box = pageBox(parts.design, orientation);
  const W = box.w * MM_PX;
  const H = box.h * MM_PX;
  const m = { t: box.margin.t * MM_PX, r: box.margin.r * MM_PX, b: box.margin.b * MM_PX, l: box.margin.l * MM_PX };
  while (root.firstChild) root.removeChild(root.firstChild);
  const style = doc.createElement("style");
  // @page kuralı gölge kökte etkisizdir; aynı CSS ekranda .xd altında uygulanır.
  style.textContent = PREVIEW_CSS + parts.css;
  root.appendChild(style);
  const wrap = doc.createElement("div");
  wrap.className = "xp-pages";
  root.appendChild(wrap);

  const src = doc.createElement("div");
  src.innerHTML = parts.flow;
  const blocks = [...src.children];
  const pages = [];
  let pb = null;
  let truncated = false;

  const newPage = () => {
    const sheet = doc.createElement("div");
    sheet.className = "xp-sheet";
    sheet.style.width = `${W}px`;
    sheet.style.height = `${H}px`;
    const body = doc.createElement("div");
    Object.entries(parts.attrs).forEach(([k, v]) => body.setAttribute(k, v));
    Object.assign(body.style, { left: `${m.l}px`, top: `${m.t}px`, width: `${W - m.l - m.r}px`, height: `${H - m.t - m.b}px` });
    sheet.appendChild(body);
    wrap.appendChild(sheet);
    pages.push(sheet);
    pb = body;
  };
  const fits = () => pb.scrollHeight <= pb.clientHeight + 1;
  const isEmpty = () => pb.childElementCount === 0;
  /** Sayfa sonundaki başlık(lar)ı (data-keep) yeni sayfaya taşıyarak sayfa açar. */
  const breakPage = () => {
    const carry = [];
    let el = pb.lastElementChild;
    while (el && el.hasAttribute("data-keep")) { carry.unshift(el); el = el.previousElementSibling; }
    if (carry.length === pb.childElementCount) carry.length = 0; // sayfada yalnız başlık varsa taşıma
    carry.forEach((el) => el.remove());
    newPage();
    carry.forEach((el) => pb.appendChild(el));
  };

  const shell = (block) => {
    const kind = block.getAttribute("data-split");
    const c = block.cloneNode(false);
    if (kind === "rows") {
      const head = block.tHead ? block.tHead.cloneNode(true) : null;
      if (head) c.appendChild(head);
      const tb = doc.createElement("tbody");
      c.appendChild(tb);
      return { el: c, target: tb };
    }
    return { el: c, target: c };
  };

  const place = (block) => {
    pb.appendChild(block);
    if (fits()) return;
    block.remove();
    const kind = block.getAttribute("data-split");
    if (!kind) {
      if (!isEmpty()) breakPage();
      pb.appendChild(block); // tek başına sığmıyorsa kırpılır
      return;
    }
    const items = kind === "rows" ? [...(block.tBodies[0]?.rows || [])] : [...block.children];
    let cur = shell(block);
    pb.appendChild(cur.el);
    let placed = 0;
    let real = 0; // başlık (data-keep) dışındaki yerleşen öğeler
    let index = 0;
    while (index < items.length) {
      if (pages.length > maxPages) { truncated = true; return; }
      const it = items[index];
      cur.target.appendChild(it);
      if (fits()) { placed += 1; if (!it.hasAttribute("data-keep")) real += 1; index += 1; continue; }
      it.remove();
      // Yalnız iç başlık sığdıysa (kayıt başlığı) o da sonraki sayfaya geçer.
      if (placed > 0 && real === 0) { index -= placed; placed = 0; }
      if (placed === 0) {
        cur.el.remove();
        if (isEmpty()) { // boş sayfaya bile sığmıyor: (başlığıyla) yine de koy, taşan kısım kırpılır
          pb.appendChild(cur.el);
          while (index < items.length) {
            const x = items[index];
            cur.target.appendChild(x);
            index += 1;
            placed += 1;
            if (!x.hasAttribute("data-keep")) { real += 1; break; }
          }
          continue;
        }
        breakPage();
      } else newPage();
      cur = shell(block);
      if (cur.el.tagName === "OL") cur.el.setAttribute("start", String(index + 1));
      pb.appendChild(cur.el);
      placed = 0;
      real = 0;
    }
  };

  newPage();
  for (const b of blocks) {
    if (pages.length > maxPages) { truncated = true; break; }
    place(b);
  }
  if (pages.length > maxPages) { truncated = true; pages.splice(maxPages).forEach((p) => p.remove()); }

  const total = pages.length;
  const ink = parts.footInk || "#6b7280";
  pages.forEach((sheet, i) => {
    if (parts.watermark) {
      const wm = doc.createElement("div");
      wm.className = "xd-wm";
      wm.textContent = parts.watermark;
      sheet.firstChild.appendChild(wm);
    }
    const f = doc.createElement("div");
    f.className = "xp-pf";
    Object.assign(f.style, { left: `${m.l}px`, right: `${m.r}px`, bottom: `${Math.max(4, m.b / 2 - 6)}px`, color: ink });
    const span = (cls, text) => { const s = doc.createElement("span"); s.className = cls; s.textContent = text; f.appendChild(s); };
    span("l", parts.foot.left || "");
    span("c", parts.foot.center || "");
    span("r", parts.foot.right ? `Sayfa ${i + 1} / ${truncated ? `${total}+` : total}` : "");
    sheet.appendChild(f);
    const no = doc.createElement("div");
    no.className = "xp-pno";
    no.textContent = String(i + 1);
    sheet.appendChild(no);
  });
  return { pages: total, truncated, width: W, height: H, wrap };
}
