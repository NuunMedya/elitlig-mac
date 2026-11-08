// Yayın Stüdyosu · PANEL AÇMA DÜĞMELERİ: "REJİ PANELİ", "TEKRAR PANELİ", "SAHNELER", "SES",
// "YAYIN", "LED", "VAR", "RÖPORTAJ", "ÖZET", "MAÇ YÖNETİMİ", "KONTROL MERKEZİ" …
//
// Tık: panel ekrandaysa öne gelir; kaldırılmışsa SON YERİNE (aynı sekme grubu ya da ızgara
// komşusunun yanı), hiç yoksa seçili hazır düzendeki yerine konur. Seçenek (sağ tık):
// "Nerede açılsın" → Kontrol merkezinde (yerleşim değişmez). ctx.openPanel(key, where).
import React from "react";
import { Icon } from "../../../components/ui";
import { Shell } from "./wkit";
import { optMenu, optsOf, withOptions } from "./wOptions";
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

const WHERE = [["layout", "Ekranda (yerleşimde)"], ["kontrol", "Kontrol merkezinde"]];
const FIELDS = [{ key: "where", label: "Nerede açılsın", type: "select", def: "layout", choices: WHERE, hint: "Ekranda: panel kaldırıldıysa son yerine geri konur." }];

function PanelButton({ ctx, item, w, h, togglePop, def }) {
  const o = optsOf(item, FIELDS);
  const isCc = def.panel === "kontrol";
  const where = isCc ? "kontrol" : o.where;
  const on = isCc ? Boolean(ctx.controlOpen) : where === "layout" && Boolean(ctx.hasPanel?.(def.panel));
  const sub = isCc ? (ctx.controlOpen ? "açık" : def.sub) : where === "kontrol" ? "Kontrol merkezinde açar" : on ? "ekranda · öne getir" : "ekranda değil · yerine koyar";
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
    </Shell>
  );
}

/** Genel "Panel aç" düğmesi: panel seçenekten seçilir. */
const ANY_FIELDS = [
  { key: "panel", label: "Panel", type: "select", def: "yonetimReji", choices: Object.values(PANEL_BUTTONS).filter((d) => d.panel !== "kontrol").map((d) => [d.panel, d.label]) },
  ...FIELDS,
];
function AnyPanel(p) {
  const o = optsOf(p.item, ANY_FIELDS);
  const def = Object.values(PANEL_BUTTONS).find((d) => d.panel === o.panel) || PANEL_BUTTONS.openReji;
  return <PanelButton {...p} def={def} />;
}

export const PANEL_WIDGETS = {
  ...Object.fromEntries(Object.entries(PANEL_BUTTONS).map(([type, def]) => [type, def.panel === "kontrol"
    ? withOptions({ render: (p) => <PanelButton {...p} def={def} /> }, [], { note: "Kontrol merkezi: üst çubuktaki düğmeyle de açılır; iğnelenirse yerleşimin yanında açık kalır." })
    : withOptions({ render: (p) => <PanelButton {...p} def={def} /> }, FIELDS)])),
  openPanel: withOptions({ render: (p) => <AnyPanel {...p} /> }, ANY_FIELDS),
};
