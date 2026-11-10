// Ekipman (masaüstü): bağlam, rozetler, küçük görsel ve yazdırma.
import React, { createContext, useContext } from "react";
import { Icon } from "../../components/ui";
import { CONDITIONS, CONDITION_COLORS, STATUS_META, labelSheetHtml, receiptHtml } from "../../lib/equipmentUtils";

export const BASE = "/api/tools/equipment";
export const EquipmentContext = createContext(null);
export const useEq = () => useContext(EquipmentContext);

export const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status, color: "#64748b", icon: "circle" };
  return <span className="eq-status" style={{ "--sc": m.color }}><Icon name={m.icon} size={11} strokeWidth={2.2} />{m.label}</span>;
};
export const CondBadge = ({ condition }) => (condition ? <span className="eq-cond" style={{ "--cc": CONDITION_COLORS[condition] }}>{CONDITIONS[condition]}</span> : null);

const CAT_ICONS = { video: "video", mic: "mic", monitor: "grid", sun: "sun", ball: "ball", shirt: "shirt", trophy: "trophy", layers: "layers", shield: "shield", map: "map" };
export const Thumb = ({ item, large = false }) => (
  <span className={`eq-thumb${large ? " eq-thumb--lg" : ""}`} style={item?.category_color ? { "--eqc": item.category_color } : undefined} aria-hidden="true">
    {item?.photo_url ? <img src={item.photo_url} alt="" loading="lazy" /> : <Icon name={CAT_ICONS[item?.category_icon] || "box"} size={large ? 26 : 16} strokeWidth={2} />}
  </span>
);

export function Flags({ item }) {
  const f = [];
  if (item.holder?.overdue) f.push(["İade gecikti", "red"]);
  if (item.low_stock) f.push(["Düşük stok", "amber"]);
  if (item.maintenance?.state === "overdue") f.push(["Bakım gecikti", "red"]);
  else if (item.maintenance?.state === "due_soon") f.push([`Bakım ${item.maintenance.days_left} gün`, "amber"]);
  if (item.warranty?.state === "soon") f.push(["Garanti bitiyor", "amber"]);
  if (item.insurance?.state === "expired") f.push(["Sigorta bitti", "red"]);
  else if (item.insurance?.state === "soon") f.push(["Sigorta bitiyor", "amber"]);
  if (item.next_reservation) f.push(["Rezerve", "blue"]);
  return f.length ? <span className="eq-flags">{f.map(([l, t]) => <span key={l} className={`pill pill--xs pill--${t}`}>{l}</span>)}</span> : null;
}

/** Tutanak / etiket: ana süreç gizli pencerede yazdırır ya da PDF kaydeder. */
export const printReceipt = (assignments, { pdf = false, giver = "" } = {}) => {
  const html = receiptHtml({ assignments, giver });
  const title = `Zimmet-tutanagi-${String(assignments[0]?.holder_name || "").replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, "-")}`;
  return pdf ? window.elitlig.pdf(html, title) : window.elitlig.print(html, title);
};
export const printLabels = async (items, size = "small", pdf = false) => {
  let origin = "";
  try { origin = (await window.elitlig.app.info())?.siteOrigin || ""; } catch { /* yoksay */ }
  const html = labelSheetHtml(items, { size, origin });
  return pdf ? window.elitlig.pdf(html, "Ekipman-etiketleri") : window.elitlig.print(html, "Ekipman etiketleri");
};
