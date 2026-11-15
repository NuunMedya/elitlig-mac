// Kısayollar: bölüm düğmesi, web bağlantıları, araç başlatıcı, Araç Takımı şeridi.
import React from "react";
import { Icon } from "../../../components/ui";
import ToolkitStrip from "../../toolkit/ToolkitStrip";
import { ROUTE_CHOICES, routeInfo } from "../registry";
import { XsButton } from "../parts";

const LAUNCH = [
  ["todos", "checkSquare", "Yapılacaklar", "Görev, pano, maç masası"], ["agenda", "calendar", "Ajanda", "Takvim ve hatırlatmalar"], ["notes", "note", "Not Defteri", "Notlar ve listeler"],
  ["projects", "layers", "Projeler", "Süreç, kişiler, portföy"], ["ledger", "wallet", "Muhasebe", "Hesaplar, düzenli ödemeler, bütçe"], ["sheets", "grid", "Tablolar", "Formüllü tablolar"],
  ["contacts", "users", "Rehber", "Üyeler ve kişiler"], ["messages", "message", "Mesajlar", "Sohbetler ve üye mesajları"], ["equipment", "box", "Ekipman", "Zimmet ve bakım"],
  ["planning", "ball", "Saha ve maç", "Fikstür ve saha planı"], ["files", "folder", "Dosya Araçları", "Dönüştür, indir, düzenle"], ["toolkit", "toolbox", "Araç Takımı", "Tüm araçlar"],
];

export function RouteTile({ tier, o, go }) {
  const r = routeInfo(o.route || "agenda") || routeInfo("agenda");
  const open = () => { const [base, sub] = r.key.split(":"); go(sub ? `${base}:${sub}` : base); };
  if (tier === "xs") return <XsButton icon={r.icon} label={r.label} onClick={open} />;
  return (
    <button type="button" className={`dt-route is-${tier}`} onClick={open} data-route={r.key}>
      <span className="dt-route__icon"><Icon name={r.icon} size={tier === "m" ? 26 : 20} strokeWidth={2} /></span>
      <span className="dt-route__text"><b>{r.label}</b>{tier === "m" && <small>{ROUTE_CHOICES.find(([k]) => k === r.key) ? "Uygulama bölümü" : r.key}</small>}</span>
      <Icon name="chevronRight" size={14} />
    </button>
  );
}

/** "Ad | adres" satırları → bağlantılar. "/yol" elitlig.com sayfasıdır (uygulama oturumuyla açılır). */
export function parseLinks(text) {
  return String(text || "").split(/\n+/).map((line) => {
    const [a, b] = line.includes("|") ? line.split("|") : [null, line];
    const url = String(b || "").trim();
    if (!url) return null;
    const label = String(a || "").trim() || url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    if (url.startsWith("/")) return { label, url, web: true };
    if (!/^https?:\/\//i.test(url)) return null;
    return { label, url, web: false };
  }).filter(Boolean).slice(0, 24);
}
const openLink = (l) => (l.web ? window.elitlig.app.openWeb(l.url) : window.elitlig.app.openExternal(l.url));

export function LinkTile({ tier, o, openSettings }) {
  const links = parseLinks(o.links);
  if (!links.length) return tier === "xs" ? <XsButton icon="link" label="Bağlantı ekle" onClick={openSettings} /> : <div className="dt-empty"><Icon name="link" size={18} /><span>Bağlantı ekleyin.</span><button type="button" className="btn btn--xs" onClick={openSettings}>Ayarla</button></div>;
  if (tier === "xs") return <XsButton icon="globe" label={links[0].label} title={links[0].url} onClick={() => openLink(links[0])} />;
  return (
    <div className={`dt-links is-${tier}`}>
      {links.slice(0, tier === "s" ? 3 : 24).map((l) => (
        <button key={`${l.label}${l.url}`} type="button" onClick={() => openLink(l)} title={l.url}>
          <Icon name={l.web ? "globe" : "external"} size={13} /><span><b>{l.label}</b>{tier !== "s" && <small>{l.web ? `elitlig.com${l.url}` : l.url.replace(/^https?:\/\//, "")}</small>}</span>
        </button>
      ))}
    </div>
  );
}

export function LauncherTile({ tier, go, w, h, px }) {
  if (tier === "xs") return <XsButton icon="search" label="Hızlı geçiş" title="Hızlı geçiş (⌃⌥O): araç ya da kayıt ara" onClick={() => window.elitlig.launcher.show()} />;
  // Bir satıra sığan düğme (büyükte ipuçlu, ~1,7 sütun; küçükte ~1,2 sütun) × satır sayısı.
  const rich = (tier === "l" || tier === "xl") && (!px || px >= 700);
  const perRow = Math.max(1, Math.min(LAUNCH.length, px ? Math.floor(px / (rich ? 136 : 96)) : Math.round(w / (rich ? 1.7 : tier === "s" ? 1.5 : 1.3))));
  const rows = Math.max(1, Math.floor(h / (rich ? 2 : 1)));
  const items = LAUNCH.slice(0, Math.min(LAUNCH.length, perRow * rows));
  return (
    <nav className={`launcher dt-launcher is-${tier}`} aria-label="Araçlar" style={{ "--per": Math.min(perRow, items.length), "--rows": Math.ceil(items.length / perRow) }}>
      {items.map(([key, icon, label, hint]) => (
        <button key={key} type="button" data-tool={key} onClick={() => go(key)} title={hint}>
          <span className="nav-item__icon"><Icon name={icon} size={15} strokeWidth={2} /></span>
          <strong>{label}</strong>{(tier === "l" || tier === "xl") && <small>{hint}</small>}
        </button>
      ))}
    </nav>
  );
}

export function ToolkitTile({ tier, go }) {
  if (tier === "xs") return <XsButton icon="toolbox" label="Araç Takımı" onClick={() => go("toolkit")} />;
  if (tier === "s") {
    return (
      <div className="dt-actiongrid is-4">
        {[["toolkit:calc", "calculator", "Hesap"], ["toolkit:percent", "percent", "KDV"], ["files", "folder", "Dosya"], ["toolkit", "toolbox", "Tümü"]].map(([k, ic, l]) => <button key={k} type="button" onClick={() => go(k)}><Icon name={ic} size={15} /><span>{l}</span></button>)}
      </div>
    );
  }
  return <div className="dt-strip"><ToolkitStrip go={go} /></div>;
}
