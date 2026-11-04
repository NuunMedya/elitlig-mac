// Açılır menülerin saf yardımcıları (ui.jsx MenuButton): öğe temizliği ve
// ekrana sığan konum hesabı. DOM'a bağlı değildir; testlerde doğrudan sınanır.

/** Boş / false öğeleri ve baştaki, sondaki, art arda gelen ayraçları ("-") atar. */
export function cleanMenuItems(items = []) {
  const out = [];
  for (const item of items || []) {
    if (!item) continue;
    if (item === "-") {
      if (!out.length || out[out.length - 1] === "-") continue;
      out.push(item);
    } else out.push(item);
  }
  while (out[out.length - 1] === "-") out.pop();
  return out;
}

/**
 * Menünün sabit (position: fixed) konumu.
 *   trigger:  düğmenin ekran dikdörtgeni { top, left, right, bottom }
 *   menu:     menünün ölçüsü { width, height }
 *   viewport: { width, height }
 *   align:    "end" (sağ kenarlar hizalı, varsayılan) | "start"
 * Altta yer yoksa ve üstte daha çok yer varsa yukarı açılır; yatayda ekrandan
 * taşmaz. Döner: { top, left, placement: "bottom"|"top", maxHeight }
 */
export function menuPosition(trigger, menu, viewport, { align = "end", gap = 4, margin = 8 } = {}) {
  const below = viewport.height - trigger.bottom - gap - margin;
  const above = trigger.top - gap - margin;
  const placement = menu.height > below && above > below ? "top" : "bottom";
  const room = Math.max(120, placement === "top" ? above : below);
  const height = Math.min(menu.height, room);
  let top = placement === "top" ? trigger.top - gap - height : trigger.bottom + gap;
  top = Math.max(margin, Math.min(top, viewport.height - margin - height));
  let left = align === "start" ? trigger.left : trigger.right - menu.width;
  // Sağa taşıyorsa sola, sola taşıyorsa sağa kaydır.
  if (left + menu.width > viewport.width - margin) left = viewport.width - margin - menu.width;
  if (left < margin) left = margin;
  return { top: Math.round(top), left: Math.round(left), placement, maxHeight: Math.floor(room) };
}
