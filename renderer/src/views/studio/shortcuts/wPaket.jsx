// Yayın Stüdyosu · GRAFİK PAKETİ ve YAYIN BAĞLANTISI düğmeleri:
//   gfxPackage    grafik paketi seçici (tek dokunuş: bütün görünüm; seçenek: hemen / sonraki geçişte)
//   gfxPackageNext sıradaki pakete geç (1×1)
//   linkYoutube   YouTube yayınını aç   · seçenek: dokununca aç / kopyala / QR göster
//   linkYtStudio  YouTube Studio'da aç
//   linkMatch     Maç sayfasını aç (elitlig.com/sehir/:il/mac/:id)
//   linksBoard    üç bağlantı + kopyala + QR (2×2)
// ctx.pkg (usePackageControl) ve ctx.links (useBroadcastLinks) Studio'dan gelir.
import React from "react";
import { Icon } from "../../../components/ui";
import { PackageSwatches } from "../graphics/PackagesSection";
import { QR_DURATIONS } from "../../../lib/studio/links";
import { Head, Shell, openPop, usePress } from "./wkit";
import { optMenu, optsOf, withOptions } from "./wOptions";
import "../graphics/packages.css";
import "../links/links.css";

/* ═════════════════════════ GRAFİK PAKETİ ═════════════════════════ */

const PKG_FIELDS = [
  { key: "mode", label: "Uygulama", type: "select", def: "store", choices: [["store", "Ayarlardaki gibi"], ["fade", "Hemen (yumuşak)"], ["next", "Sonraki geçişte"]] },
  { key: "only", label: "Gösterilen paketler", type: "select", def: "all", choices: [["all", "Tümü"], ["custom", "Yalnız benim paketlerim"], ["builtin", "Yalnız hazır paketler"]] },
];
const modeOf = (o) => (o.mode === "store" ? null : o.mode);

function PackagePicker({ ctx, item, w, h, togglePop }) {
  const pk = ctx.pkg;
  const o = optsOf(item, PKG_FIELDS);
  if (!pk) return <Shell tone="plain" w={w} h={h}><Head icon="palette" label="GRAFİK PAKETİ" /><span className="st-w__empty">Grafik paketleri yok.</span></Shell>;
  const list = pk.list.filter((p) => (o.only === "custom" ? !p.builtin : o.only === "builtin" ? p.builtin : true));
  const active = pk.active;
  const pend = pk.pending ? pk.list.find((p) => p.id === pk.pending.id) : null;
  const cycle = () => {
    const i = list.findIndex((p) => p.id === active?.id);
    const next = list[(i + 1) % Math.max(1, list.length)];
    if (next) pk.apply(next.id, { mode: modeOf(o) });
  };
  if (w === 1 && h === 1) return <PackageNext ctx={ctx} item={item} w={w} h={h} togglePop={togglePop} onPress={cycle} />;
  return (
    <Shell tone="violet" w={w} h={h} className="wpk" {...optMenu(item, togglePop)}>
      <Head icon="palette" label="GRAFİK PAKETİ" right={pend ? <em className="wx-pill is-amber" title="Sonraki geçişte">SIRADA</em> : null} />
      <span className="wpk__now">{active ? <PackageSwatches pkg={active} /> : null}<span>{active ? active.name : "Paket seçilmedi"}{pend ? ` → ${pend.name}` : ""}</span></span>
      <div className="wpk__list">
        {list.map((p) => (
          <button key={p.id} type="button" className={`wpk__btn ${p.id === active?.id ? "is-on" : ""} ${pk.pending?.id === p.id ? "is-pend" : ""}`} onClick={() => pk.apply(p.id, { mode: modeOf(o) })} title={`${p.name}${p.desc ? ` — ${p.desc}` : ""}`}>
            <PackageSwatches pkg={p} /><span>{p.name}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

function PackageNext({ ctx, item, w, h, togglePop, onPress = null }) {
  const pk = ctx.pkg;
  const o = optsOf(item, PKG_FIELDS);
  const list = pk?.list || [];
  const go = onPress || (() => {
    const i = list.findIndex((p) => p.id === pk?.active?.id);
    const next = list[(i + 1) % Math.max(1, list.length)];
    if (next) pk.apply(next.id, { mode: modeOf(o) });
  });
  const press = usePress(() => pk && go(), () => openPop(item, togglePop, { mode: "options" }));
  const i = list.findIndex((p) => p.id === pk?.active?.id);
  const next = list[(i + 1) % Math.max(1, list.length)];
  return (
    <Shell as="button" tone="violet" w={w} h={h} className="wx-tile" disabled={!pk} {...press} title={next ? `Sıradaki paket: ${next.name} (sağ tık: seçenekler)` : "Grafik paketi"}>
      <Icon name="palette" size={20} strokeWidth={2.2} />
      <strong className="wx-t">PAKET</strong>
      <small className="wx-s">{pk?.active ? pk.active.name : "seçilmedi"}</small>
    </Shell>
  );
}

/* ═════════════════════════ BAĞLANTILAR ═════════════════════════ */

const LINK_FIELDS = [
  { key: "tap", label: "Dokununca", type: "select", def: "open", choices: [["open", "Tarayıcıda aç"], ["copy", "Bağlantıyı kopyala"], ["qr", "Programda QR göster"]] },
  { key: "qrSec", label: "QR süresi", type: "select", def: 20, choices: QR_DURATIONS.map((n) => [n, n ? `${n} sn` : "kaldırana kadar"]) },
];
const LINK_DEF = {
  linkYoutube: { key: "youtube", label: "YOUTUBE YAYINI", icon: "video" },
  linkYtStudio: { key: "studio", label: "YOUTUBE STUDIO", icon: "sliders" },
  linkMatch: { key: "match", label: "MAÇ SAYFASI", icon: "globe" },
};
const TAP_SUB = { open: "aç", copy: "kopyala", qr: "QR göster" };

function LinkButton({ ctx, item, w, h, togglePop, def }) {
  const L = ctx.links;
  const o = optsOf(item, LINK_FIELDS);
  const l = L?.list.find((x) => x.key === def.key) || null;
  const tap = def.key === "studio" && o.tap === "qr" ? "open" : o.tap;
  const run = (what) => (what === "copy" ? L.copy(def.key) : what === "qr" ? L.qr(def.key, Number(o.qrSec)) : L.open(def.key));
  const press = usePress(() => l?.url && run(tap), () => openPop(item, togglePop, { mode: "options" }));
  const qrOn = L?.qrOn === def.key;
  const tip = l?.url ? `${l.label} · dokun: ${TAP_SUB[tap]} · sağ tık: seçenekler` : l?.reason || "Bağlantı yok";
  if (w === 1 || h === 1) {
    return (
      <Shell as="button" tone={def.key === "match" ? "blue" : "danger"} w={w} h={h} className={`wx-tile ${!l?.url ? "is-off" : ""}`} state={qrOn ? "air" : null} aria-disabled={!l?.url} {...press} title={tip}>
        <Icon name={tap === "copy" ? "copy" : tap === "qr" ? "grid" : def.icon} size={20} strokeWidth={2.2} />
        <strong className="wx-t">{def.label}</strong>
        <small className="wx-s">{l?.url ? (qrOn ? "QR yayında" : TAP_SUB[tap]) : "yok"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone={def.key === "match" ? "blue" : "danger"} w={w} h={h} state={qrOn ? "air" : null} className="wl-link" {...optMenu(item, togglePop)} title={tip}>
      <Head icon={def.icon} label={def.label} />
      <div className="wx-row is-actions">
        <button type="button" disabled={!l?.url} onClick={() => L.open(def.key)} title={l?.url || l?.reason}><Icon name="external" size={11} /> Aç</button>
        <button type="button" disabled={!l?.url} onClick={() => L.copy(def.key)} title={l?.url ? "Bağlantıyı kopyala" : l?.reason}><Icon name="copy" size={11} /> Kopyala</button>
        {def.key !== "studio" && <button type="button" className={qrOn ? "is-on" : ""} disabled={!l?.url || !L.canQr} onClick={() => L.qr(def.key, Number(o.qrSec))} title={l?.url ? (qrOn ? "QR kartını kaldır" : "Programda QR göster") : l?.reason}><Icon name="grid" size={11} /> {qrOn ? "QR'ı kaldır" : "QR"}</button>}
      </div>
      <small className="wx-s">{l?.url ? l.url.replace(/^https?:\/\/(www\.)?/, "") : l?.reason}</small>
    </Shell>
  );
}

function LinksBoard({ ctx, item, w, h, togglePop }) {
  const L = ctx.links;
  const o = optsOf(item, LINK_FIELDS);
  if (!L) return <Shell tone="plain" w={w} h={h}><Head icon="link" label="BAĞLANTILAR" /></Shell>;
  return (
    <Shell tone="plain" w={w} h={h} className="wl-board" {...optMenu(item, togglePop)}>
      <Head icon="link" label="BAĞLANTILAR" right={L.qrOn ? <button type="button" className="wx-sw is-on" onClick={L.hideQr} title="QR kartını kaldır">QR ✕</button> : null} />
      {L.list.map((l) => (
        <div key={l.key} className="wl-board__row">
          <button type="button" className="wl-board__main" disabled={!l.url} onClick={() => L.open(l.key)} title={l.url || l.reason}><Icon name={l.icon} size={12} /> {l.label}</button>
          <button type="button" className="wl-board__ic" disabled={!l.url} onClick={() => L.copy(l.key)} title={l.url ? "Kopyala" : l.reason} aria-label={`${l.label}: kopyala`}><Icon name="copy" size={11} /></button>
          {l.key !== "studio" && <button type="button" className={`wl-board__ic ${L.qrOn === l.key ? "is-on" : ""}`} disabled={!l.url || !L.canQr} onClick={() => L.qr(l.key, Number(o.qrSec))} title={l.url ? "Programda QR" : l.reason} aria-label={`${l.label}: QR`}><Icon name="grid" size={11} /></button>}
        </div>
      ))}
    </Shell>
  );
}

export const PAKET_WIDGETS = {
  gfxPackage: withOptions({ render: (p) => <PackagePicker {...p} /> }, PKG_FIELDS, { note: "Paketleri Ayarlar › Grafikler › Grafik paketleri'nden düzenle." }),
  gfxPackageNext: withOptions({ render: (p) => <PackageNext {...p} /> }, PKG_FIELDS),
  ...Object.fromEntries(Object.entries(LINK_DEF).map(([type, def]) => [type, withOptions({ render: (p) => <LinkButton {...p} def={def} /> }, def.key === "studio" ? LINK_FIELDS.slice(0, 1).map((f) => ({ ...f, choices: f.choices.filter(([k]) => k !== "qr") })) : LINK_FIELDS)])),
  linksBoard: withOptions({ render: (p) => <LinksBoard {...p} /> }, LINK_FIELDS.slice(1)),
};
