// Yayın Stüdyosu · PANEL AÇMA DÜĞMELERİ: "REJİ PANELİ", "TEKRAR PANELİ", "SAHNELER", "SES",
// "YAYIN", "LED", "VAR", "RÖPORTAJ", "ÖZET", "MAÇ YÖNETİMİ", "KONTROL MERKEZİ" …
//
// Tık: panel ekrandaysa öne gelir; kaldırılmışsa SON YERİNE (aynı sekme grubu ya da ızgara
// komşusunun yanı), hiç yoksa seçili hazır düzendeki yerine konur. Seçenek (sağ tık):
// "Nerede açılsın" → Kontrol merkezinde (yerleşim değişmez) ya da yüzen pencerede. ctx.openPanel(key, where).
//
// HEDEF DÜĞMELERİ ("go:<hedef>"): layoutModel.OPEN_TARGETS'tan üretilir — her panel, her panel
// parçası (Maç yönetimi › Kadro, Reji › skor ve saat, Tekrar › liste, Yayın › bölümler…), her
// Kontrol merkezi ve Ayarlar bölümü için ayrı düğme. ctx.openTarget(id, where).
import React from "react";
import { Icon } from "../../../components/ui";
import { Shell } from "./wkit";
import { optMenu, optsOf, withOptions } from "./wOptions";
import { OPEN_GROUPS, OPEN_TARGETS, openTargetPanelId, openWheres } from "../layout/layoutModel";
import "./wPanels.css";

/** type → { panel, label, icon, sub } (panel: layoutModel panel anahtarı; "kontrol": Kontrol merkezi). */
export const PANEL_BUTTONS = {
  openReji: { panel: "yonetimReji", label: "REJİ PANELİ", icon: "zap", sub: "gol · kart · değişiklik · saat" },
  openYonetim: { panel: "yonetim", label: "MAÇ YÖNETİMİ", icon: "board", sub: "maçlar · reji · kadro · maç sonu" },
  openTekrar: { panel: "tekrar", label: "TEKRAR PANELİ", icon: "repeat", sub: "liste · açılar · kuyruk" },
  openSahne: { panel: "sahne", label: "SAHNELER", icon: "layers", sub: "sahneler · katmanlar · kaynaklar" },
  openSes: { panel: "ses", label: "SES", icon: "sliders", sub: "karıştırıcı · yönlendirme" },
  openYayin: { panel: "yayin", label: "YAYIN", icon: "broadcast", sub: "YouTube · RTMP · kayıt" },
  openLed: { panel: "led", label: "LED", icon: "overview", sub: "LED çıkışı · içerik" },
  openVar: { panel: "var", label: "VAR", icon: "target", sub: "inceleme · karar" },
  openRoportaj: { panel: "roportaj", label: "RÖPORTAJ", icon: "users", sub: "konuk · bant · kayıt" },
  openOzet: { panel: "ozet", label: "ÖZET", icon: "sparkles", sub: "oluştur · önizle · yükle" },
  openOlay: { panel: "olaylar", label: "OLAY GİR", icon: "pencil", sub: "olay paneli" },
  openKontrol: { panel: "kontrol", label: "KONTROL MERKEZİ", icon: "command", sub: "tüm paneller tek yerde" },
};

const WHERE = [["layout", "Ekranda (yerleşimde)"], ["kontrol", "Kontrol merkezinde"], ["float", "Yüzen pencerede"]];
const FIELDS = [{ key: "where", label: "Nerede açılsın", type: "select", def: "layout", choices: WHERE, hint: "Ekranda: panel kaldırıldıysa son yerine geri konur. Yüzen: ayrı, taşınabilir pencere." }];

function PanelButton({ ctx, item, w, h, togglePop, def }) {
  const o = optsOf(item, FIELDS);
  const isCc = def.panel === "kontrol";
  const where = isCc ? "kontrol" : o.where;
  const on = isCc ? Boolean(ctx.controlOpen) : where === "layout" && Boolean(ctx.hasPanel?.(def.panel));
  const sub = isCc ? (ctx.controlOpen ? "açık" : def.sub) : where === "kontrol" ? "Kontrol merkezinde açar" : where === "float" ? "yüzen pencerede açar" : on ? "ekranda · öne getir" : "ekranda değil · yerine koyar";
  const open = () => ctx.openPanel?.(def.panel, where);
  return (
    <Shell as="button" tone={isCc ? "violet" : "plain"} w={w} h={h} state={on ? "pvw" : null} className={`wp-open ${on ? "is-on" : ""}`} onClick={open}
      title={`${def.label} — ${sub} (sağ tık: seçenekler)`} {...(isCc ? {} : optMenu(item, togglePop))} aria-label={def.label}>
      <span className="wp-open__ic"><Icon name={def.icon} size={w >= 2 || h >= 2 ? 22 : 17} strokeWidth={2.1} /></span>
      <span className="wp-open__t">
        <strong>{def.label}</strong>
        {(w >= 2 || h >= 2) && <small>{def.sub}</small>}
        {!(isCc && !ctx.controlOpen) && <em className={on ? "is-on" : ""}>{sub}</em>}
      </span>
      {where === "kontrol" && !isCc && <Icon name="command" size={11} className="wp-open__cc" />}
      {where === "float" && <Icon name="external" size={11} className="wp-open__cc" />}
    </Shell>
  );
}

/** Genel "Panel aç" düğmesi: panel seçenekten seçilir. */
const ANY_FIELDS = [
  { key: "panel", label: "Panel", type: "select", def: "yonetimReji", choices: OPEN_TARGETS.filter((t) => t.kind === "panel").map((t) => [t.id, t.label]) },
  ...FIELDS,
];
function AnyPanel(p) {
  const o = optsOf(p.item, ANY_FIELDS);
  const t = OPEN_TARGETS.find((x) => x.id === o.panel);
  const def = Object.values(PANEL_BUTTONS).find((d) => d.panel === o.panel) || (t ? { panel: t.id, label: t.label.toLocaleUpperCase("tr"), icon: t.icon, sub: t.hint } : PANEL_BUTTONS.openReji);
  return <PanelButton {...p} def={def} />;
}

/* ───────── hedef düğmeleri (her panel / parça / bölüm) ───────── */

const WHERE_SUB = { layout: "yerinde açar", kontrol: "Kontrol merkezinde açar", float: "yüzen pencerede açar", ayarlar: "Ayarlar'da açar" };
const groupLabel = (g) => OPEN_GROUPS.find((x) => x.key === g)?.label || "";
/** "Maç yönetimi › Kadro" → { top: "Maç yönetimi", main: "Kadro" }. */
function splitLabel(label) {
  const parts = String(label).split(/\s+[›·]\s+/);
  return parts.length > 1 ? { main: parts.slice(1).join(" · "), top: parts[0] } : { main: label, top: null };
}
function TargetButton({ ctx, item, w, h, togglePop, t, fields }) {
  const o = optsOf(item, fields);
  const wheres = openWheres(t);
  const where = wheres.some(([k]) => k === o.where) ? o.where : wheres[0][0];
  const pid = openTargetPanelId(t);
  const ccKey = t.kind === "cc" ? t.section : t.kind === "ayar" ? `ayar:${t.section}` : pid;
  const on = where === "kontrol" ? Boolean(ccKey) && ctx.controlSection === ccKey
    : where === "ayarlar" ? ctx.settingsSection === t.section
    : Boolean(pid && ctx.hasPanel?.(pid));
  const { main, top } = splitLabel(t.label);
  const sub = on ? (where === "layout" || where === "float" ? "ekranda · öne getir" : "açık") : WHERE_SUB[where];
  return (
    <Shell as="button" tone={t.kind === "cc" ? "violet" : "plain"} w={w} h={h} state={on ? "pvw" : null} className={`wp-open is-target is-${t.kind} ${on ? "is-on" : ""}`}
      onClick={() => ctx.openTarget?.(t.id, where)} title={`${t.label} — ${sub}${t.hint ? ` · ${t.hint}` : ""} (sağ tık: nerede açılsın)`} {...optMenu(item, togglePop)} aria-label={`${t.label} aç`}>
      <span className="wp-open__ic"><Icon name={t.icon || "board"} size={w >= 2 || h >= 2 ? 22 : 17} strokeWidth={2.1} /></span>
      <span className="wp-open__t">
        {top && <small className="wp-open__top">{top}</small>}
        <strong>{main.toLocaleUpperCase("tr")}</strong>
        {(w >= 2 || h >= 2) && !top && <small>{groupLabel(t.group)}</small>}
        <em className={on ? "is-on" : ""}>{sub}</em>
      </span>
      {where === "kontrol" && t.kind !== "cc" && <Icon name="command" size={11} className="wp-open__cc" />}
      {where === "float" && <Icon name="external" size={11} className="wp-open__cc" />}
      {where === "ayarlar" && <Icon name="sliders" size={11} className="wp-open__cc" />}
    </Shell>
  );
}
/** "go:<id>" → parçacık (seçenek: nerede açılsın; hedefin desteklediği yerler). */
export const TARGET_WIDGETS = Object.fromEntries(OPEN_TARGETS.map((t) => {
  const wheres = openWheres(t);
  const fields = wheres.length > 1 ? [{ key: "where", label: "Nerede açılsın", type: "select", def: wheres[0][0], choices: wheres, hint: t.kind === "part" ? "Yerinde: parça kendi paneli olarak ekrana gelir (ana panelinin yanına)." : "" }] : [];
  return [`go:${t.id}`, withOptions({ render: (p) => <TargetButton {...p} t={t} fields={fields} /> }, fields, fields.length ? {} : { note: "Kontrol merkezinde bu bölümü açar." })];
}));

export const PANEL_WIDGETS = {
  ...Object.fromEntries(Object.entries(PANEL_BUTTONS).map(([type, def]) => [type, def.panel === "kontrol"
    ? withOptions({ render: (p) => <PanelButton {...p} def={def} /> }, [], { note: "Kontrol merkezi: üst çubuktaki düğmeyle de açılır; iğnelenirse yerleşimin yanında açık kalır." })
    : withOptions({ render: (p) => <PanelButton {...p} def={def} /> }, FIELDS)])),
  openPanel: withOptions({ render: (p) => <AnyPanel {...p} /> }, ANY_FIELDS),
  ...TARGET_WIDGETS,
};
