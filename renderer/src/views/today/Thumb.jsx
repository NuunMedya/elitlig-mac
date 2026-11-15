// Kütüphane kartının STATİK küçük resmi: bileşenin türüne göre (düğme, sayı, liste, grafik, pasta,
// takvim, klasör, metin…) yalnız CSS ile çizilir — veri çekmez, zamanlayıcı kurmaz, ölçüm yapmaz.
import React from "react";
import { Icon } from "../../components/ui";
import { describeAction, parseButtonLines } from "./actions";

const KIND_BY_ID = {
  matches: "list", livematch: "kpi", standings: "table", staffmatches: "list", studio: "kpi", balance: "stats", trend: "bars", recurring: "list", budget: "bars", accounts: "list",
  receivables: "list", ledgerlist: "list", rates: "kpi", stages: "stages", projects: "list", followups: "list", gantt: "gantt", todos: "list", upcoming: "list", agenda: "list",
  week: "cal", month: "month", notes: "list", pinned: "note", scratch: "note", equipment: "stats", counts: "stats", messages: "chat", requests: "list", contacts: "list", sync: "kpi",
  hero: "hero", clock: "clock", weather: "kpi", focus: "ring", timer: "ring", music: "music", clipboard: "list", system: "ring", route: "button", link: "list", launcher: "grid",
  toolkit: "strip", download: "input", jobs: "list", quicktodo: "input", quicknote: "note", quickledger: "input", newproject: "input", screenshot: "button", calc: "input", action: "button", countdown: "kpi",
};
export function thumbKind(meta) {
  if (!meta) return "icon";
  if (meta.impl === "button") return "button";
  if (meta.impl === "bar") return "bar";
  if (meta.impl === "folder") return "folder";
  if (meta.impl === "preset") return "preset";
  if (meta.impl === "data") return meta.view || "list";
  if (meta.impl === "text") return "note";
  if (meta.impl === "heading") return "heading";
  if (meta.impl === "spacer") return "spacer";
  if (meta.impl === "image") return "image";
  if (meta.impl === "date") return "date";
  if (meta.impl === "checklist" || meta.impl === "notechecklist") return "checks";
  if (meta.impl === "pinnote") return "note";
  if (meta.impl === "bsearch" || meta.impl === "todophase") return "input";
  if (meta.impl === "bvideo") return "video";
  if (meta.impl === "musiclist") return "music";
  if (meta.impl === "messages") return "chat";
  if (meta.embed === "clock") return "clock";
  if (meta.embed === "month") return "month";
  return KIND_BY_ID[meta.id] || (meta.embed ? "kpi" : "icon");
}
const BTN_STYLE = (meta) => meta.options?.find((o) => o.key === "style")?.def || "filled";
const BTN_DEF = (meta) => meta.options?.find((o) => o.key === "action")?.def || "";

export default function Thumb({ meta, big = false }) {
  const kind = thumbKind(meta);
  const style = { "--accent": meta.tint || "#7c3aed" };
  let inner;
  switch (kind) {
    case "button": { const d = describeAction(BTN_DEF(meta)); inner = <span className={`th-btn is-${BTN_STYLE(meta)}`}><Icon name={meta.icon || d.icon} size={big ? 26 : 18} /><b>{meta.label}</b></span>; break; }
    case "bar": case "folder": {
      const list = parseButtonLines(meta.options?.find((o) => o.key === "buttons")?.def || "").slice(0, kind === "bar" ? 4 : 6);
      inner = <span className={`th-${kind}`}>{list.map((b, i) => <i key={i}><Icon name={b.icon} size={big ? 16 : 11} /></i>)}</span>;
      break;
    }
    case "preset": inner = <span className="th-preset"><Icon name={meta.icon} size={big ? 22 : 15} /><b>{meta.label}</b></span>; break;
    case "kpi": case "stats": inner = <span className={`th-kpi${kind === "stats" ? " is-stats" : ""}`}><b>{kind === "stats" ? "₺ 12" : "128"}</b><i /><i /></span>; break;
    case "gauge": case "ring": inner = <span className="th-ring"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="6" /><circle cx="21" cy="21" r="15.9" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="64 36" strokeDashoffset="25" /></svg></span>; break;
    case "bars": inner = <span className="th-bars">{[46, 70, 38, 88, 60, 74].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</span>; break;
    case "pie": inner = <span className="th-pie" />; break;
    case "list": inner = <span className="th-list">{[0, 1, 2].map((i) => <i key={i}><Icon name={meta.icon} size={big ? 14 : 10} /><em /><b /></i>)}</span>; break;
    case "table": inner = <span className="th-table">{[0, 1, 2, 3].map((i) => <i key={i}><em /><em /><em /></i>)}</span>; break;
    case "cal": inner = <span className="th-cal">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} className={i === 0 ? "is-on" : i % 3 === 1 ? "has" : ""} />)}</span>; break;
    case "month": inner = <span className="th-month">{Array.from({ length: 28 }, (_, i) => <i key={i} className={i === 10 ? "is-on" : i % 6 === 2 ? "has" : ""} />)}</span>; break;
    case "thumbs": inner = <span className="th-thumbs">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</span>; break;
    case "chat": inner = <span className="th-chat"><i /><i className="is-me" /><i /></span>; break;
    case "input": inner = <span className="th-input"><i /><b /></span>; break;
    case "note": inner = <span className="th-note"><i /><i /><i /></span>; break;
    case "checks": inner = <span className="th-checks">{[1, 1, 0, 0].map((d, i) => <i key={i} className={d ? "is-done" : ""} />)}</span>; break;
    case "heading": inner = <span className="th-heading"><b>{meta.label}</b><i /></span>; break;
    case "spacer": inner = <span className="th-spacer" />; break;
    case "image": inner = <span className="th-image"><Icon name="image" size={big ? 30 : 20} /></span>; break;
    case "date": inner = <span className="th-date"><small>KAS</small><b>11</b></span>; break;
    case "video": inner = <span className="th-video"><Icon name="play" size={big ? 22 : 14} /></span>; break;
    case "music": inner = <span className="th-music"><Icon name="music" size={big ? 20 : 13} /><i /><i /></span>; break;
    case "clock": inner = <span className="th-clock"><b>14:30</b></span>; break;
    case "hero": inner = <span className="th-hero"><b>Günaydın</b><i /><i /></span>; break;
    case "stages": inner = <span className="th-stages">{[100, 70, 30, 0].map((p, i) => <i key={i}><em style={{ width: `${p}%` }} /></i>)}</span>; break;
    case "gantt": inner = <span className="th-gantt">{[[0, 50], [20, 60], [45, 40]].map(([l, w], i) => <i key={i} style={{ marginLeft: `${l}%`, width: `${w}%` }} />)}</span>; break;
    case "grid": case "strip": inner = <span className="th-grid">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</span>; break;
    default: inner = <span className="th-icon"><Icon name={meta.icon} size={big ? 30 : 20} /></span>;
  }
  return <span className={`th${big ? " is-big" : ""} th--${kind}`} style={style} aria-hidden="true">{inner}</span>;
}
