// Masaüstü araç takımı paneli (Mac ⌃⌥B, Windows Ctrl+Alt+Boşluk ya da menü çubuğu simgesi): küçük,
// çerçevesiz pencere; odak kaybedince gizlenir. Üstte hızlı işler (hızlı not / görev, pano, ekran
// görüntüsü, widget'lar, ekranı uyanık tut, müzik), altta sekmeli araçlar. Ana süreç: app/toolkit.js.
// Araçların tam sayfa hâli uygulama içinde "Araç Takımı" (ToolkitPage.jsx) — aynı bileşenler.
import React, { Suspense, useEffect, useRef, useState } from "react";
import { Icon, isMac, useToast } from "../../components/ui";
import { clock, isPlayingStatus } from "../../music/musicApp";
import { acceleratorLabel } from "./shortcutUtils";
import { deskkit, useStored } from "./toolkitUi";
import LayoutTool from "./LayoutTool";
import { TOOLS } from "./toolRegistry";
import "./toolkit.css";

export { TOOLS };
const AWAKE_OPTIONS = [{ m: 0, label: "Süresiz" }, { m: 30, label: "30 dk" }, { m: 60, label: "1 saat" }, { m: 120, label: "2 saat" }];

export default function Toolkit() {
  const toast = useToast();
  const [tab, setTab] = useStored("toolkit.tab", "layout");
  const [info, setInfo] = useState(null);
  const [awake, setAwake] = useState({ on: false, until: null });
  const [music, setMusic] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [awakeMenu, setAwakeMenu] = useState(false);
  const dk = deskkit();

  useEffect(() => {
    document.documentElement.dataset.window = "toolkit";
    if (!dk) return undefined;
    dk.settings().then(setInfo).catch(() => {});
    dk.awake().then(setAwake).catch(() => {});
    window.elitlig.music?.state().then(setMusic).catch(() => {});
    const offs = [
      dk.onSettings(setInfo),
      dk.onAwake(setAwake),
      dk.onPanelOpen((p) => { if (p?.tab && TOOLS.some((t) => t.key === p.tab)) setTab(p.tab); dk.settings().then(setInfo).catch(() => {}); }),
      window.elitlig.music?.onState(setMusic),
    ].filter(Boolean);
    return () => offs.forEach((off) => off());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Seçili sekme görünür alana kaydırılır (sekmeler yatay kayar).
  const tabsRef = useRef(null);
  useEffect(() => { tabsRef.current?.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [tab]);

  // Kısa yollar: Esc gizle, ⌘1…9 sekme.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); dk?.hidePanel(); }
      if ((isMac() ? e.metaKey : e.ctrlKey) && /^[1-9]$/.test(e.key) && TOOLS[Number(e.key) - 1]) { e.preventDefault(); setTab(TOOLS[Number(e.key) - 1].key); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dk, setTab]);

  const pin = async () => { const v = await dk?.pinPanel(!pinned); setPinned(Boolean(v)); };
  const toggleAwake = async (minutes = 0) => { setAwakeMenu(false); setAwake(await dk.setAwake({ on: !awake.on || minutes > 0, minutes })); };
  const openShelf = async () => {
    try { await dk.openShelf(); dk.hidePanel(); } catch { toast("Pano ve ekran görüntüsü geçmişi bu sürümde henüz yok.", { tone: "info" }); }
  };
  const quick = (kind) => { window.elitlig.quick.show(kind); };
  // Ekran görüntüsü: Raflar'ın yakalaması (⌃⌥A ile aynı, app/shelf "shelf:capture"); panel önce gizlenir.
  const capture = async () => {
    await dk?.hidePanel();
    await new Promise((r) => setTimeout(r, 300));
    const res = await window.elitlig.shelf?.capture?.().catch((e) => ({ ok: false, error: { message: e?.message } }));
    if (!res) toast("Ekran yakalama bu sürümde yok.", { tone: "info" });
    else if (!res.ok) toast(res.error?.message || "Ekran yakalanamadı.", { tone: "error", timeout: 6000 });
  };
  const toggleWidgets = async () => {
    const st = await window.elitlig.widgets?.state();
    if (!st?.items?.length) { window.elitlig.app.showMain("toolkit:widgets"); dk?.hidePanel(); return; }
    await window.elitlig.widgets.toggle();
  };
  const mac = isMac();
  const awakeLeft = awake.on && awake.until ? Math.max(1, Math.round((awake.until - Date.now()) / 60000)) : null;
  const playing = isPlayingStatus(music?.status);
  const hasMusic = music && (music.trackCount > 0 || music.status !== "idle");

  return (
    <div className="toolkit">
      <header className="tk-head">
        <span className="tk-head__brand"><Icon name="toolbox" size={15} /> Araç takımı</span>
        {info?.settings?.toolkit?.shortcut && <kbd className="tk-head__kbd">{acceleratorLabel(info.settings.toolkit.shortcut, mac)}</kbd>}
        <span className="tk-grow" />
        <button type="button" className={`tk-ib${pinned ? " is-on" : ""}`} onClick={pin} aria-pressed={pinned} aria-label="Açık tut" title={pinned ? "Odak gidince gizlensin" : "Açık tut (odak gidince gizlenmesin)"}><Icon name="pin" size={14} /></button>
        <button type="button" className="tk-ib" onClick={() => { window.elitlig.app.showMain(`toolkit:${tab}`); dk?.hidePanel(); }} aria-label="Tam sayfa aç" title="Araç Takımı'nı uygulamada tam sayfa aç"><Icon name="external" size={14} /></button>
        <button type="button" className="tk-ib" onClick={() => { window.elitlig.app.showMain("desk"); dk?.hidePanel(); }} aria-label="Ayarlar" title="Masaüstü araçları ayarları"><Icon name="sliders" size={14} /></button>
        <button type="button" className="tk-ib" onClick={() => dk?.hidePanel()} aria-label="Kapat" title="Kapat (Esc)"><Icon name="x" size={14} /></button>
      </header>

      <div className="tk-quick" role="group" aria-label="Hızlı işler">
        <button type="button" className="tk-qa" onClick={() => quick("note")} title="Hızlı not (⌃⌥N)"><Icon name="note" size={15} /><span>Not</span></button>
        <button type="button" className="tk-qa" onClick={() => quick("task")} title="Hızlı görev"><Icon name="checkSquare" size={15} /><span>Görev</span></button>
        <button type="button" className="tk-qa" onClick={openShelf} title="Pano ve ekran görüntüleri (⌃⌥T)"><Icon name="clipboard" size={15} /><span>Pano</span></button>
        <button type="button" className="tk-qa" onClick={capture} title="Ekran görüntüsü al (⌃⌥A) — Raflar'a eklenir"><Icon name="camera" size={15} /><span>Yakala</span></button>
        <button type="button" className="tk-qa" onClick={toggleWidgets} title="Masaüstü widget'larını göster / gizle"><Icon name="grid" size={15} /><span>Widget</span></button>
        <div className="tk-qa-wrap">
          <button type="button" className={`tk-qa${awake.on ? " is-on" : ""}`} onClick={() => (awake.on ? toggleAwake(0) : setAwakeMenu((v) => !v))} aria-pressed={awake.on} aria-expanded={awakeMenu}
            title={awake.on ? "Ekran uyanık — kapatmak için tıklayın" : "Ekranı uyanık tut (uyku / ekran koruyucu engellenir)"}>
            <Icon name="coffee" size={15} /><span>{awake.on ? (awakeLeft ? `${awakeLeft} dk` : "Uyanık") : "Uyanık tut"}</span>
          </button>
          {awakeMenu && (
            <div className="tk-pop" role="menu">
              {AWAKE_OPTIONS.map((o) => <button key={o.m} type="button" role="menuitem" onClick={() => toggleAwake(o.m)}>{o.label}</button>)}
            </div>
          )}
        </div>
      </div>

      {hasMusic && (
        <div className={`tk-music${playing ? " is-playing" : ""}`} aria-label="Müzik">
          <button type="button" className="tk-music__info" onClick={() => { window.elitlig.music.command("show"); dk?.hidePanel(); }} title="Müzik görünümünü aç">
            <Icon name="music" size={14} />
            <span><strong>{music.status === "idle" ? "Müzik" : music.title || "Parça"}</strong><small>{music.status === "idle" ? `${music.trackCount} giriş · çalmak için ▶` : music.status === "paused" ? (music.pausedByStudio ? "Stüdyo açık · duraklatıldı" : "Duraklatıldı") : `${clock(music.elapsedSec)}${music.lengthSec ? ` / ${clock(music.lengthSec)}` : ""}`}</small></span>
          </button>
          <button type="button" className="tk-ib" onClick={() => window.elitlig.music.command("prev")} aria-label="Önceki parça"><Icon name="skipBack" size={14} /></button>
          <button type="button" className="tk-ib is-main" onClick={() => window.elitlig.music.command("toggle")} aria-label={playing ? "Duraklat" : "Çal"}><Icon name={playing ? "pause" : "play"} size={14} strokeWidth={2.4} /></button>
          <button type="button" className="tk-ib" onClick={() => window.elitlig.music.command("next")} aria-label="Sonraki parça"><Icon name="skip" size={14} /></button>
        </div>
      )}

      <nav className="tk-tabs" role="tablist" aria-label="Araçlar" ref={tabsRef}>
        {TOOLS.map((t, i) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-active" : ""} onClick={() => setTab(t.key)} title={`${t.title}${i < 9 ? ` (${mac ? "⌘" : "Ctrl+"}${i + 1})` : ""}`}>
            <Icon name={t.icon} size={16} /><span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="tk-body" role="tabpanel">
        <Suspense fallback={<p className="muted tk-pad">Yükleniyor…</p>}>
          {tab === "layout" ? <LayoutTool info={info} onPermission={(p) => p && setInfo((x) => (x ? { ...x, permission: p } : x))} /> : (() => {
            const T = (TOOLS.find((t) => t.key === tab) || TOOLS[1]).component;
            return T ? <T /> : null;
          })()}
        </Suspense>
      </main>
    </div>
  );
}
