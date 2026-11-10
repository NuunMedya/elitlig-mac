// Bugün ekranındaki Araç Takımı kısayol şeridi: sık kullanılan araçlar tek tıkla (tam sayfa açılır),
// küçük panel, ekran görüntüsü ve widget'lar.
import React from "react";
import { Icon, isMac } from "../../components/ui";
import { deskkit } from "./toolkitUi";
import "./toolkit.css";

// Adresler birleşik Araç Takımı'nın içindedir (hub/catalog.js): "toolkit:<araç>" ya da bölüm rotası.
const ITEMS = [
  ["toolkit:calc", "calculator", "Hesap ve döviz"],
  ["toolkit:percent", "percent", "Yüzde / KDV"],
  ["toolkit:fixture", "calendar", "Fikstür"],
  ["toolkit:standings", "list", "Puan durumu"],
  ["toolkit:draw", "sparkles", "Kura"],
  ["toolkit:salary", "briefcase", "Maaş"],
  ["files", "folder", "Dosya Araçları"],
  ["toolkit:qr", "qr", "QR"],
];

export default function ToolkitStrip({ go }) {
  const mac = isMac();
  const capture = () => window.elitlig.shelf?.capture?.();
  return (
    <nav className="tk-strip" aria-label="Araç Takımı kısayolları">
      <button type="button" className="tk-strip__head" onClick={() => go("toolkit")} title={`Araç Takımı (${mac ? "⇧⌘A" : "Ctrl+Shift+A"})`}>
        <Icon name="toolbox" size={15} /><strong>Araç Takımı</strong><Icon name="chevronRight" size={12} />
      </button>
      <div className="tk-strip__items">
        {ITEMS.map(([key, icon, label]) => (
          <button key={key} type="button" className="tk-strip__item" data-tool-key={key.replace(/^toolkit:/, "")} onClick={() => go(key)}><Icon name={icon} size={14} /><span>{label}</span></button>
        ))}
        <button type="button" className="tk-strip__item" onClick={capture} title={mac ? "⌃⌥A" : "Ctrl+Alt+A"}><Icon name="camera" size={14} /><span>Ekran görüntüsü</span></button>
        <button type="button" className="tk-strip__item is-accent" onClick={() => go("toolkit:widgets")}><Icon name="grid" size={14} /><span>Widget'lar</span></button>
        <button type="button" className="tk-strip__item is-accent" onClick={() => deskkit()?.showPanel()} title="Her yerden açılan küçük panel"><Icon name="zap" size={14} /><span>Panel</span></button>
      </div>
    </nav>
  );
}
