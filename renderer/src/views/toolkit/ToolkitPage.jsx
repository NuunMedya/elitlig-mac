// Araç Takımı (tam sayfa, ⇧⌘A): panelin (#toolkit) tüm araçları + widget galerisi + hızlı işler,
// uygulamanın içinde. Araç bileşenleri panelle ortaktır (toolRegistry.jsx).
import React, { Suspense, useEffect, useState } from "react";
import { Icon, ViewHeader, isMac, useToast } from "../../components/ui";
import LayoutTool from "./LayoutTool";
import ToolkitIntro from "./ToolkitIntro";
import WidgetGallery from "./WidgetGallery";
import { TOOLS, TOOL_GROUPS, TOOL_KEYS } from "./toolRegistry";
import { acceleratorLabel } from "./shortcutUtils";
import { deskkit, useStored } from "./toolkitUi";
import "./toolkit.css";

const PAGE_KEYS = new Set(["widgets", ...TOOL_KEYS]);

export default function ToolkitPage({ arg, go }) {
  const toast = useToast();
  const [tab, setTab] = useStored("toolkitPage.tab", "widgets");
  const [info, setInfo] = useState(null);
  const [awake, setAwake] = useState({ on: false, until: null });
  const [widgetsOn, setWidgetsOn] = useState(null);
  const dk = deskkit();
  const mac = isMac();
  useEffect(() => { if (arg && PAGE_KEYS.has(arg)) setTab(arg); }, [arg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dk) return undefined;
    dk.settings().then(setInfo).catch(() => {});
    dk.awake().then(setAwake).catch(() => {});
    window.elitlig.widgets?.state().then(setWidgetsOn).catch(() => {});
    const offs = [dk.onSettings(setInfo), dk.onAwake(setAwake), window.elitlig.widgets?.onChange(setWidgetsOn)].filter(Boolean);
    return () => offs.forEach((off) => off());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = tab === "widgets" ? { key: "widgets", title: "Masaüstü widget'ları", hint: "Masaüstünüzde duran küçük pencereler: saat, ajanda, yapılacaklar, hava, maçlar, sistem…", icon: "grid" } : TOOLS.find((t) => t.key === tab) || TOOLS[0];
  const Comp = current.component;
  const panelKey = info?.settings?.toolkit?.shortcut;
  const widgetKey = info?.settings?.widgets?.shortcut;

  const capture = async () => {
    const res = await window.elitlig.shelf?.capture?.().catch((e) => ({ ok: false, error: { message: e?.message } }));
    if (!res) toast("Ekran yakalama bu sürümde yok.", { tone: "info" });
    else if (res.ok) toast("Ekran görüntüsü Raflar'a eklendi.", { tone: "success", action: { label: "Aç", run: () => go("shelf") } });
    else toast(res.error?.message || "Ekran yakalanamadı.", { tone: "error", timeout: 6000 });
  };
  const toggleAwake = async () => setAwake(await dk.setAwake({ on: !awake.on }));

  return (
    <div className="view view--toolkit">
      <ViewHeader icon="toolbox" title="Araç Takımı" subtitle="Günlük pratik araçlar ve masaüstü widget'ları. Aynı araçlar her yerden açılan küçük panelde ve menü çubuğu simgesinde de var.">
        <button type="button" className="btn" onClick={() => dk?.showPanel(tab === "widgets" ? null : tab)} title="Küçük paneli aç (her yerden kısayolla da açılır)">
          <Icon name="zap" size={14} /> Panel {panelKey && <kbd className="kbd">{acceleratorLabel(panelKey, mac)}</kbd>}
        </button>
        <button type="button" className="btn" onClick={() => (widgetsOn?.items?.length ? window.elitlig.widgets.toggle() : setTab("widgets"))}>
          <Icon name="grid" size={14} /> {widgetsOn?.items?.length ? (widgetsOn.visible ? "Widget'ları gizle" : "Widget'ları göster") : "Widget ekle"} {widgetKey && <kbd className="kbd">{acceleratorLabel(widgetKey, mac)}</kbd>}
        </button>
        <button type="button" className="icon-btn" onClick={() => go("desk")} aria-label="Masaüstü araçları ayarları" title={`Kısayollar ve ayarlar (${mac ? "⌘," : "Ctrl+,"})`}><Icon name="sliders" size={16} /></button>
      </ViewHeader>

      <ToolkitIntro go={go} compact />

      <div className="tkp-quick" role="group" aria-label="Hızlı işler">
        <button type="button" className="tkp-qa" onClick={() => window.elitlig.quick.show("note")}><Icon name="note" size={16} /><span>Hızlı not</span><kbd className="kbd">{mac ? "⌃⌥N" : "Ctrl+Alt+N"}</kbd></button>
        <button type="button" className="tkp-qa" onClick={() => window.elitlig.quick.show("task")}><Icon name="checkSquare" size={16} /><span>Hızlı görev</span></button>
        <button type="button" className="tkp-qa" onClick={capture}><Icon name="camera" size={16} /><span>Ekran görüntüsü</span><kbd className="kbd">{mac ? "⌃⌥A" : "Ctrl+Alt+A"}</kbd></button>
        <button type="button" className="tkp-qa" onClick={() => window.elitlig.shelf?.show?.()}><Icon name="clipboard" size={16} /><span>Pano rafı</span><kbd className="kbd">{mac ? "⌃⌥T" : "Ctrl+Alt+T"}</kbd></button>
        <button type="button" className={`tkp-qa${awake.on ? " is-on" : ""}`} onClick={toggleAwake} aria-pressed={awake.on}><Icon name="coffee" size={16} /><span>{awake.on ? "Ekran uyanık" : "Ekranı uyanık tut"}</span></button>
        <button type="button" className="tkp-qa" onClick={() => go("music")}><Icon name="music" size={16} /><span>Müzik</span><kbd className="kbd">{mac ? "⇧⌘J" : "Ctrl+Shift+J"}</kbd></button>
      </div>

      <div className="tkp">
        <nav className="tkp-nav" aria-label="Araçlar">
          <button type="button" className={`tkp-nav__item${tab === "widgets" ? " is-active" : ""}`} onClick={() => setTab("widgets")} aria-current={tab === "widgets" ? "page" : undefined}>
            <Icon name="grid" size={15} /><span>Widget'lar</span>{widgetsOn?.items?.length ? <em>{widgetsOn.items.length}</em> : null}
          </button>
          {TOOL_GROUPS.map((g) => (
            <React.Fragment key={g}>
              <div className="tkp-nav__group" role="presentation">{g}</div>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <button key={t.key} type="button" data-tool-key={t.key} className={`tkp-nav__item${tab === t.key ? " is-active" : ""}`} onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined} title={t.hint}>
                  <Icon name={t.icon} size={15} /><span>{t.title}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
          <div className="tkp-nav__group" role="presentation">Diğer araçlar</div>
          <button type="button" className="tkp-nav__item" onClick={() => go("calc")}><Icon name="calculator" size={15} /><span>Hesap Araçları</span><Icon name="chevronRight" size={12} /></button>
          <button type="button" className="tkp-nav__item" onClick={() => go("files")}><Icon name="folder" size={15} /><span>Dosya Araçları</span><Icon name="chevronRight" size={12} /></button>
          <button type="button" className="tkp-nav__item" onClick={() => go("focus")}><Icon name="timer" size={15} /><span>Odak Sayacı</span><Icon name="chevronRight" size={12} /></button>
        </nav>
        <section className="tkp-body card" aria-label={current.title}>
          <header className="tkp-body__head">
            <span className="tkp-body__icon"><Icon name={current.icon} size={18} /></span>
            <div><h2>{current.title}</h2><p className="muted">{current.hint}</p></div>
          </header>
          <div className="tkp-body__tool">
            <Suspense fallback={<p className="muted">Yükleniyor…</p>}>
              {tab === "widgets" ? <WidgetGallery /> : tab === "layout" ? <LayoutTool info={info} inPanel={false} onPermission={(p) => p && setInfo((x) => (x ? { ...x, permission: p } : x))} /> : Comp ? <Comp onOpenCalc={() => go("calc")} /> : null}
            </Suspense>
          </div>
          {tab === "layout" && <p className="tk-note"><Icon name="info" size={12} /> Buradaki ızgara bu pencereye uygulanır. Başka uygulamaların pencereleri için kısayolları ({info?.settings?.layouts?.shortcuts?.leftHalf ? acceleratorLabel(info.settings.layouts.shortcuts.leftHalf, mac) : "⌃⌥←"} …) ya da paneli kullanın.</p>}
        </section>
      </div>
    </div>
  );
}
