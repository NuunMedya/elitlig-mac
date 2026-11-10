// İlk açılış tanıtımı: Araç Takımı ve masaüstü widget'ları nerede, kısayollar neler.
// Bugün ekranında ve Araç Takımı sayfasında bir kez gösterilir ("Anladım" ile kapanır).
import React, { useEffect, useState } from "react";
import { Icon, isMac } from "../../components/ui";
import { acceleratorLabel } from "./shortcutUtils";
import { deskkit } from "./toolkitUi";
// Bugün ekranında Araç Takımı sayfası açılmadan da gösterilir: stiller bileşenle birlikte yüklenmeli.
import "./toolkit.css";

const KEY = "toolkit.introSeen.v1";
export const introSeen = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, "1"); } catch { /* yoksay */ } };

export default function ToolkitIntro({ go, compact = false, onDone }) {
  const [hidden, setHidden] = useState(introSeen);
  const [keys, setKeys] = useState(null);
  const mac = isMac();
  useEffect(() => {
    if (hidden) return;
    deskkit()?.settings().then((v) => setKeys({ panel: v.settings.toolkit.shortcut, widgets: v.settings.widgets?.shortcut })).catch(() => {});
  }, [hidden]);
  if (hidden) return null;
  const close = () => { markSeen(); setHidden(true); onDone?.(); };
  const k = (acc, fallback) => <kbd className="kbd">{acc ? acceleratorLabel(acc, mac) : fallback}</kbd>;
  return (
    <section className={`tk-intro${compact ? " is-compact" : ""}`} aria-label="Araç Takımı tanıtımı">
      <div className="tk-intro__icon"><Icon name="toolbox" size={22} /></div>
      <div className="tk-intro__body">
        <strong>Araç Takımı ve masaüstü widget'ları burada</strong>
        <ol className="tk-intro__steps">
          <li><Icon name="toolbox" size={13} /> <span><b>Araç Takımı</b> kenar çubuğunda en üstte ({k(null, mac ? "⇧⌘A" : "Ctrl+Shift+A")}): hesap, yüzde/KDV, tarih, renk, QR, JSON, karakterler…</span></li>
          <li><Icon name="zap" size={13} /> <span>Her yerden küçük panel: {k(keys?.panel, mac ? "⌃⌥B" : "Ctrl+Alt+Boşluk")} ya da {mac ? "menü çubuğundaki" : "görev çubuğundaki"} Elitlig simgesi › <b>Araç Takımı paneli</b>.</span></li>
          <li><Icon name="grid" size={13} /> <span><b>Widget'lar</b>: saat, ajanda, yapılacaklar, hava, maçlar, sistem… masaüstüne yerleştirin; {k(keys?.widgets, mac ? "⌃⌥W" : "Ctrl+Alt+W")} göster/gizle.</span></li>
        </ol>
        <div className="tk-intro__acts">
          <button type="button" className="btn btn--sm btn--primary" onClick={() => { go?.("toolkit:widgets"); close(); }}><Icon name="plus" size={12} /> Widget ekle</button>
          <button type="button" className="btn btn--sm" onClick={() => deskkit()?.showPanel()}><Icon name="zap" size={12} /> Paneli dene</button>
          {!compact && <button type="button" className="btn btn--sm" onClick={() => { go?.("toolkit"); close(); }}><Icon name="toolbox" size={12} /> Araç Takımı'nı aç</button>}
          <button type="button" className="btn btn--sm btn--ghost" onClick={close}>Anladım</button>
        </div>
      </div>
    </section>
  );
}
