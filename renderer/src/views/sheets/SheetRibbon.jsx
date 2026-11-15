// Tablolar: Excel'in şeridine benzeyen, sıkı (tek satırlık) araç çubuğu.
// Sekmeler: Giriş (pano, yazı tipi, hizalama, sayı, biçimler, hücreler,
// düzenleme) · Formüller · Veri · Görünüm.
import React, { useEffect, useState } from "react";
import { keyLabel } from "../../components/ui";
import { NUMBER_FORMATS } from "../../lib/sheets/sheetEngine";
import { BORDER_STYLES, FONT_FAMILIES, FONT_SIZES } from "../../lib/sheets/sheetModel";
import { ColorButton, ColorGrid, Drop, MenuList, SIcon } from "./sheetUi";

const TABS = [["home", "Giriş"], ["formulas", "Formüller"], ["data", "Veri"], ["view", "Görünüm"]];
const BORDER_LABELS = { thin: "İnce", medium: "Orta", thick: "Kalın", dashed: "Kesikli", dotted: "Noktalı", double: "Çift" };
export const CELL_STYLES = [
  { label: "Başlık", style: { b: true, fs: 15, c: "#1f3864" } },
  { label: "Başlık satırı", style: { b: true, bg: "#d9e1f2", bd: { b: { s: "medium", c: "#4472c4" } } } },
  { label: "Toplam", style: { b: true, bd: { t: { s: "thin", c: "#4472c4" }, b: { s: "double", c: "#4472c4" } } } },
  { label: "İyi", style: { bg: "#c6efce", c: "#006100" } },
  { label: "Kötü", style: { bg: "#ffc7ce", c: "#9c0006" } },
  { label: "Nötr", style: { bg: "#ffeb9c", c: "#9c5700" } },
  { label: "Giriş", style: { bg: "#ffcc99", c: "#3f3f76", bd: { t: { s: "thin", c: "#7f7f7f" }, r: { s: "thin", c: "#7f7f7f" }, b: { s: "thin", c: "#7f7f7f" }, l: { s: "thin", c: "#7f7f7f" } } } },
  { label: "Not", style: { bg: "#ffffcc", bd: { t: { s: "thin", c: "#b2b2b2" }, r: { s: "thin", c: "#b2b2b2" }, b: { s: "thin", c: "#b2b2b2" }, l: { s: "thin", c: "#b2b2b2" } } } },
  { label: "Vurgu", style: { bg: "#4472c4", c: "#ffffff", b: true } },
];
const FN_GROUPS = [
  ["Mantıksal", ["EĞER", "ÇOKEĞER", "VE", "YADA", "DEĞİL", "EĞERHATA", "EĞERYOKSA", "İLKEŞLEŞEN"]],
  ["Metin", ["BİRLEŞTİR", "METİNBİRLEŞTİR", "SOLDAN", "SAĞDAN", "PARÇAAL", "UZUNLUK", "KIRP", "BÜYÜKHARF", "KÜÇÜKHARF", "YAZIM.DÜZENİ", "YERİNEKOY", "BUL", "MBUL", "METNEÇEVİR", "SAYIYAÇEVİR"]],
  ["Tarih ve saat", ["BUGÜN", "ŞİMDİ", "TARİH", "ZAMAN", "YIL", "AY", "GÜN", "SAAT", "DAKİKA", "HAFTANINGÜNÜ", "SERİTARİH", "SERİAY", "GÜNSAY", "TAMİŞGÜNÜ", "İŞGÜNÜ", "ETARİHLİ"]],
  ["Arama ve başvuru", ["DÜŞEYARA", "YATAYARA", "ÇAPRAZARA", "İNDİS", "KAÇINCI", "ELEMAN", "SATIRSAY", "SÜTUNSAY"]],
  ["Matematik", ["TOPLA", "ETOPLA", "ÇOKETOPLA", "TOPLA.ÇARPIM", "ÇARPIM", "YUVARLA", "YUKARIYUVARLA", "AŞAĞIYUVARLA", "TAMSAYI", "MOD", "MUTLAK", "KAREKÖK", "KUVVET", "TAVANAYUVARLA", "TABANAYUVARLA", "RASTGELEARADA"]],
  ["İstatistik", ["ORTALAMA", "EĞERORTALAMA", "ÇOKEĞERORTALAMA", "BAĞ_DEĞ_SAY", "BAĞ_DEĞ_DOLU_SAY", "EĞERSAY", "ÇOKEĞERSAY", "MİN", "MAK", "ÇOKEĞERMAK", "ÇOKEĞERMİN", "ORTANCA", "BÜYÜK", "KÜÇÜK", "RANK", "STDSAPMA"]],
];

function Btn({ icon, label, title, on, onClick, disabled, wideLabel }) {
  return (
    <button type="button" className={`sx-btn ${on ? "is-on" : ""} ${wideLabel ? "sx-btn--label" : ""}`} title={title} aria-label={title} aria-pressed={on || undefined} onClick={onClick} disabled={disabled}>
      {icon && <SIcon name={icon} />}{label && <span>{label}</span>}
    </button>
  );
}
const Group = ({ label, children }) => <div className="sx-group" role="group" aria-label={label} title={label}>{children}</div>;

export default function SheetRibbon({ api }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("sheets.ribbonTab") || "home"; } catch { return "home"; } });
  useEffect(() => { try { localStorage.setItem("sheets.ribbonTab", tab); } catch { /* yoksay */ } }, [tab]);
  const s = api.style;
  const ro = api.readOnly;
  const [borderSpec, setBorderSpec] = useState({ s: "thin", c: "#000000" });
  const [fontSize, setFontSize] = useState(String(s.fs || 10));
  useEffect(() => setFontSize(String(s.fs || 10)), [s.fs]);
  const applySize = () => { const n = Number(String(fontSize).replace(",", ".")); if (n >= 1 && n <= 409) api.setStyle({ fs: n === 10 ? null : n }); else setFontSize(String(s.fs || 10)); };

  const borders = [
    ["all", "borderAll", "Tüm kenarlıklar"], ["outer", "borderOuter", "Dış kenarlıklar"], ["inner", "borderInner", "İç kenarlıklar"],
    ["bottom", "borderBottom", "Alt kenarlık"], ["top", "borderTop", "Üst kenarlık"], ["left", "borderLeft", "Sol kenarlık"], ["right", "borderRight", "Sağ kenarlık"],
    ["thickOuter", "borderOuter", "Kalın dış kenarlık"], ["bottomDouble", "borderBottom", "Çift alt kenarlık"], ["bottomThick", "borderBottom", "Kalın alt kenarlık"],
    ["none", "borderNone", "Kenarlık yok"],
  ];

  return (
    <div className="sx-ribbon">
      <div className="sx-tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sx-tab ${tab === k ? "is-active" : ""}`} onClick={() => setTab(k)}>{label}</button>)}
        <span className="sx-tabs__spacer" />
        <Btn icon="undo" title={keyLabel("Geri al (⌘Z)")} onClick={api.undo} disabled={ro || !api.canUndo} />
        <Btn icon="redo" title={keyLabel("Yinele (⌘Y)")} onClick={api.redo} disabled={ro || !api.canRedo} />
      </div>
      <div className="sx-bar" role="toolbar" aria-label="Araç çubuğu">
        {tab === "home" && (<>
          <Group label="Pano">
            <Drop split icon="paste" title={keyLabel("Yapıştır (⌘V)")} onMain={() => api.paste("all")} disabled={ro} menu={[
              { label: "Yapıştır", icon: "paste", hint: keyLabel("⌘V"), onClick: () => api.paste("all") },
              { label: "Değerleri yapıştır", hint: keyLabel("⇧⌘V"), onClick: () => api.paste("values") },
              { label: "Formülleri yapıştır", onClick: () => api.paste("formulas") },
              { label: "Biçimleri yapıştır", onClick: () => api.paste("formats") },
              { label: "Satır ve sütunları çevirerek", onClick: () => api.paste("transpose") },
            ]} />
            <Btn icon="cut" title={keyLabel("Kes (⌘X)")} onClick={api.cut} disabled={ro} />
            <Btn icon="copy" title={keyLabel("Kopyala (⌘C)")} onClick={api.copy} />
            <Btn icon="painter" title="Biçim boyacısı (çift tık: kilitli)" on={api.painterOn} onClick={() => api.painter(false)} disabled={ro} />
          </Group>
          <Group label="Yazı tipi">
            <select className="sx-select sx-select--font" value={s.ff || ""} onChange={(e) => api.setStyle({ ff: e.target.value || null })} disabled={ro} title="Yazı tipi" aria-label="Yazı tipi">
              {FONT_FAMILIES.map((f) => <option key={f || "def"} value={f} style={f ? { fontFamily: f } : undefined}>{f || "Varsayılan"}</option>)}
            </select>
            <input className="sx-input sx-input--size" list="sx-font-sizes" value={fontSize} disabled={ro} title="Yazı boyutu" aria-label="Yazı boyutu"
              onChange={(e) => setFontSize(e.target.value)} onBlur={applySize} onKeyDown={(e) => { if (e.key === "Enter") { applySize(); api.focusGrid(); } }} />
            <datalist id="sx-font-sizes">{FONT_SIZES.map((n) => <option key={n} value={n} />)}</datalist>
            <Btn label="A⁺" title="Yazı tipi boyutunu büyüt" onClick={() => api.growFont(1)} disabled={ro} />
            <Btn label="A⁻" title="Yazı tipi boyutunu küçült" onClick={() => api.growFont(-1)} disabled={ro} />
            <Btn icon="bold" title={keyLabel("Kalın (⌘B)")} on={s.b} onClick={() => api.toggle("b")} disabled={ro} />
            <Btn icon="italic" title={keyLabel("İtalik (⌘I)")} on={s.i} onClick={() => api.toggle("i")} disabled={ro} />
            <Btn icon="underline" title={keyLabel("Altı çizili (⌘U)")} on={s.u} onClick={() => api.toggle("u")} disabled={ro} />
            <Btn icon="strike" title={keyLabel("Üstü çizili (⌘5)")} on={s.st} onClick={() => api.toggle("st")} disabled={ro} />
            <Drop split icon={borders.find((b) => b[0] === api.lastBorder)?.[1] || "borderBottom"} title="Kenarlıklar" onMain={() => api.borders(api.lastBorder || "bottom", borderSpec)} disabled={ro} wide>
              {(close) => (
                <div className="sx-borders">
                  <MenuList onClose={close} items={borders.map(([mode, icon, label]) => ({ label, icon, onClick: () => api.borders(mode, borderSpec) }))} />
                  <div className="sx-borders__opts">
                    <div className="sx-colors__label">Çizgi stili</div>
                    <div className="sx-borders__styles">
                      {BORDER_STYLES.map((st) => <button key={st} type="button" className={`sx-line sx-line--${st} ${borderSpec.s === st ? "is-on" : ""}`} title={BORDER_LABELS[st]} onClick={() => setBorderSpec({ ...borderSpec, s: st })}><i /></button>)}
                    </div>
                    <div className="sx-colors__label">Çizgi rengi</div>
                    <ColorGrid value={borderSpec.c} noneLabel="Otomatik (siyah)" onPick={(c) => setBorderSpec({ ...borderSpec, c: c || "#000000" })} />
                  </div>
                </div>
              )}
            </Drop>
            <ColorButton icon="fillColor" title="Dolgu rengi" color={s.bg} lastColor={api.lastFill} noneLabel="Dolgu yok" onApply={(c) => api.fillColor(c)} disabled={ro} />
            <ColorButton icon="textColor" title="Yazı rengi" color={s.c} lastColor={api.lastText} noneLabel="Otomatik" onApply={(c) => api.textColor(c)} disabled={ro} />
          </Group>
          <Group label="Hizalama">
            <Btn icon="alignTop" title="Üste hizala" on={s.va === "top"} onClick={() => api.setStyle({ va: s.va === "top" ? null : "top" })} disabled={ro} />
            <Btn icon="alignMiddle" title="Ortala (dikey)" on={s.va === "middle"} onClick={() => api.setStyle({ va: s.va === "middle" ? null : "middle" })} disabled={ro} />
            <Btn icon="alignBottom" title="Alta hizala" on={!s.va || s.va === "bottom"} onClick={() => api.setStyle({ va: null })} disabled={ro} />
            <Btn icon="alignLeft" title="Sola hizala" on={s.al === "left"} onClick={() => api.setStyle({ al: s.al === "left" ? null : "left" })} disabled={ro} />
            <Btn icon="alignCenter" title="Ortala" on={s.al === "center"} onClick={() => api.setStyle({ al: s.al === "center" ? null : "center" })} disabled={ro} />
            <Btn icon="alignRight" title="Sağa hizala" on={s.al === "right"} onClick={() => api.setStyle({ al: s.al === "right" ? null : "right" })} disabled={ro} />
            <Drop icon="rotate" title="Yönlendirme" caret disabled={ro} menu={[
              { label: "Saat yönünün tersine açı", onClick: () => api.setStyle({ rot: 45 }), checked: s.rot === 45 },
              { label: "Saat yönünde açı", onClick: () => api.setStyle({ rot: -45 }), checked: s.rot === -45 },
              { label: "Metni yukarı döndür", onClick: () => api.setStyle({ rot: 90 }), checked: s.rot === 90 },
              { label: "Metni aşağı döndür", onClick: () => api.setStyle({ rot: -90 }), checked: s.rot === -90 },
              { label: "Döndürmeyi kaldır", onClick: () => api.setStyle({ rot: null }), checked: !s.rot },
            ]} />
            <Btn icon="indentLess" title="Girintiyi azalt" onClick={() => api.indent(-1)} disabled={ro} />
            <Btn icon="indentMore" title="Girintiyi artır" onClick={() => api.indent(1)} disabled={ro} />
            <Btn icon="wrap" label="Kaydır" wideLabel title="Metni kaydır" on={s.wr} onClick={() => api.toggle("wr")} disabled={ro} />
            <Drop split icon="merge" label="Birleştir" title="Birleştir ve ortala" active={api.merged} onMain={() => (api.merged ? api.unmerge() : api.merge("center"))} disabled={ro} menu={[
              { label: "Birleştir ve ortala", icon: "merge", onClick: () => api.merge("center") },
              { label: "Yatay birleştir", onClick: () => api.merge("across") },
              { label: "Hücreleri birleştir", onClick: () => api.merge("merge") },
              { label: "Hücreleri ayır", onClick: api.unmerge },
            ]} />
          </Group>
          <Group label="Sayı">
            <select className="sx-select sx-select--fmt" value={s.f || "general"} onChange={(e) => api.setStyle({ f: e.target.value === "general" ? null : e.target.value })} disabled={ro} title="Sayı biçimi" aria-label="Sayı biçimi">
              {NUMBER_FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Btn label="₺" title="Para birimi (₺)" on={s.f === "money"} onClick={() => api.setStyle({ f: s.f === "money" ? null : "money" })} disabled={ro} />
            <Btn icon="percent" title="Yüzde stili" on={s.f === "percent"} onClick={() => api.setStyle({ f: s.f === "percent" ? null : "percent" })} disabled={ro} />
            <Btn label="000" title="Binlik ayracı" on={(s.f === "number" || s.f === "money") && !s.ng} onClick={api.thousands} disabled={ro} />
            <Btn icon="decInc" title="Ondalık artır" onClick={() => api.decimals(1)} disabled={ro} />
            <Btn icon="decDec" title="Ondalık azalt" onClick={() => api.decimals(-1)} disabled={ro} />
          </Group>
          <Group label="Stiller">
            <Drop icon="cond" label="Koşullu" title="Koşullu biçimlendirme" disabled={ro} menu={[
              { heading: "Hücre kurallarını vurgula" },
              { label: "Büyüktür…", onClick: () => api.openCf("gt") },
              { label: "Küçüktür…", onClick: () => api.openCf("lt") },
              { label: "Arasında…", onClick: () => api.openCf("between") },
              { label: "Eşittir…", onClick: () => api.openCf("eq") },
              { label: "Metin içerir…", onClick: () => api.openCf("contains") },
              { label: "Yinelenen değerler…", onClick: () => api.openCf("dup") },
              { heading: "İlk / son kurallar" },
              { label: "İlk 10 öğe…", onClick: () => api.openCf("top") },
              { label: "Ortalamanın üstü…", onClick: () => api.openCf("aboveAvg") },
              { heading: "Ölçekler" },
              { label: "Renk ölçeği (kırmızı-sarı-yeşil)", icon: "scale", onClick: () => api.addCf({ type: "scale", colors: ["#f8696b", "#ffeb84", "#63be7b"] }) },
              { label: "Renk ölçeği (beyaz-yeşil)", onClick: () => api.addCf({ type: "scale", colors: ["#ffffff", "#63be7b"] }) },
              { label: "Veri çubukları", onClick: () => api.addCf({ type: "bar", colors: ["#638ec6"] }) },
              "-",
              { label: "Kuralları yönet…", onClick: () => api.openCf(null) },
              { label: "Seçili hücrelerden kuralları temizle", onClick: () => api.clearCf("selection") },
              { label: "Tüm sayfadan kuralları temizle", onClick: () => api.clearCf("sheet") },
            ]} />
            <Drop label="Stiller" title="Hücre stilleri" disabled={ro}>
              {(close) => (
                <div className="sx-styles">
                  {CELL_STYLES.map((cs) => (
                    <button key={cs.label} type="button" className="sx-styles__item" onClick={() => { api.applyCellStyle(cs.style); close(); }}
                      style={{ background: cs.style.bg, color: cs.style.c, fontWeight: cs.style.b ? 700 : 400, borderBottom: cs.style.bd?.b ? `2px solid ${cs.style.bd.b.c}` : undefined }}>{cs.label}</button>
                  ))}
                  <button type="button" className="sx-styles__item sx-styles__item--plain" onClick={() => { api.clear("formats"); close(); }}>Normal</button>
                </div>
              )}
            </Drop>
          </Group>
          <Group label="Hücreler">
            <Drop icon="insertRow" label="Ekle" title="Ekle" disabled={ro} menu={[
              { label: "Üste satır ekle", icon: "insertRow", hint: keyLabel("⌘⇧+"), onClick: () => api.insert("row", false) },
              { label: "Alta satır ekle", onClick: () => api.insert("row", true) },
              { label: "Sola sütun ekle", icon: "insertCol", onClick: () => api.insert("col", false) },
              { label: "Sağa sütun ekle", onClick: () => api.insert("col", true) },
              "-",
              { label: "Sayfa ekle", icon: "sheet", onClick: api.addSheet },
            ]} />
            <Drop icon="deleteRow" label="Sil" title="Sil" disabled={ro} menu={[
              { label: "Satırları sil", icon: "deleteRow", hint: keyLabel("⌘-"), onClick: () => api.remove("row") },
              { label: "Sütunları sil", icon: "deleteCol", onClick: () => api.remove("col") },
              "-",
              { label: "Sayfayı sil", icon: "trash", danger: true, onClick: api.deleteSheet, disabled: !api.canDeleteSheet },
            ]} />
            <Drop icon="rowHeight" label="Biçim" title="Biçim" disabled={ro} menu={[
              { heading: "Hücre boyutu" },
              { label: "Satır yüksekliği…", icon: "rowHeight", onClick: () => api.sizeDialog("row") },
              { label: "Satır yüksekliğini otomatik sığdır", onClick: () => api.autofit("row") },
              { label: "Sütun genişliği…", icon: "colWidth", onClick: () => api.sizeDialog("col") },
              { label: "Sütun genişliğini otomatik sığdır", onClick: () => api.autofit("col") },
              { heading: "Görünürlük" },
              { label: "Satırları gizle", hint: keyLabel("⌘9"), onClick: () => api.hide("row", true) },
              { label: "Satırları göster", hint: keyLabel("⌘⇧9"), onClick: () => api.hide("row", false) },
              { label: "Sütunları gizle", hint: keyLabel("⌘0"), onClick: () => api.hide("col", true) },
              { label: "Sütunları göster", hint: keyLabel("⌘⇧0"), onClick: () => api.hide("col", false) },
              { heading: "Sayfa" },
              { label: "Sayfayı yeniden adlandır", icon: "pencil", onClick: api.renameSheet },
              { label: "Sayfayı çoğalt", icon: "duplicate", onClick: api.duplicateSheet },
              "-",
              { label: "Hücreleri biçimlendir…", hint: keyLabel("⌘1"), onClick: () => api.formatDialog() },
            ]} />
          </Group>
          <Group label="Düzenleme">
            <Drop split icon="sum" label="Toplam" title={keyLabel("Otomatik toplam (⌥=)")} onMain={() => api.autoSum("TOPLA")} disabled={ro} menu={[
              { label: "Topla", icon: "sum", onClick: () => api.autoSum("TOPLA") },
              { label: "Ortalama", onClick: () => api.autoSum("ORTALAMA") },
              { label: "Say", onClick: () => api.autoSum("BAĞ_DEĞ_SAY") },
              { label: "En büyük", onClick: () => api.autoSum("MAK") },
              { label: "En küçük", onClick: () => api.autoSum("MİN") },
              "-",
              { label: "Diğer işlevler…", icon: "fx", onClick: api.openFunctions },
            ]} />
            <Drop label="Doldur" title="Doldur" disabled={ro} menu={[
              { label: "Aşağı", hint: keyLabel("⌘D"), onClick: () => api.fill("down") },
              { label: "Sağa", onClick: () => api.fill("right") },
              { label: "Seri (1, 2, 3…)", onClick: () => api.fill("series") },
            ]} />
            <Drop icon="eraser" title="Temizle" disabled={ro} menu={[
              { label: "Tümünü temizle", onClick: () => api.clear("all") },
              { label: "Biçimleri temizle", onClick: () => api.clear("formats") },
              { label: "İçeriği temizle", hint: "Del", onClick: () => api.clear("contents") },
            ]} />
            <Drop icon="sortAsc" label="Sırala ve filtre" title="Sırala ve filtre uygula" menu={[
              { label: "A'dan Z'ye sırala", icon: "sortAsc", onClick: () => api.sort(true), disabled: ro },
              { label: "Z'den A'ya sırala", icon: "sortDesc", onClick: () => api.sort(false), disabled: ro },
              { label: "Özel sıralama…", onClick: api.openSort, disabled: ro },
              "-",
              { label: api.filterOn ? "Filtreyi kaldır" : "Filtre", icon: "filter", hint: keyLabel("⌘⇧L"), onClick: api.toggleFilter, disabled: ro },
              { label: "Filtreleri temizle", onClick: api.clearFilter, disabled: ro || !api.filterActive },
            ]} />
            <Drop icon="find" label="Bul" title="Bul ve seç" menu={[
              { label: "Bul…", icon: "find", hint: keyLabel("⌘F"), onClick: () => api.find("find") },
              { label: "Değiştir…", hint: keyLabel("⌘H"), onClick: () => api.find("replace"), disabled: ro },
              { label: "Git…", hint: "F5", onClick: api.goTo },
            ]} />
          </Group>
        </>)}

        {tab === "formulas" && (<>
          <Group label="İşlev kitaplığı">
            <Btn icon="fx" label="İşlev ekle" wideLabel title="İşlev ekle" onClick={api.openFunctions} disabled={ro} />
            <Drop split icon="sum" label="Otomatik toplam" title="Otomatik toplam" onMain={() => api.autoSum("TOPLA")} disabled={ro} menu={[
              { label: "Topla", onClick: () => api.autoSum("TOPLA") }, { label: "Ortalama", onClick: () => api.autoSum("ORTALAMA") },
              { label: "Say", onClick: () => api.autoSum("BAĞ_DEĞ_SAY") }, { label: "En büyük", onClick: () => api.autoSum("MAK") }, { label: "En küçük", onClick: () => api.autoSum("MİN") },
            ]} />
            {FN_GROUPS.map(([label, names]) => (
              <Drop key={label} label={label} title={label} disabled={ro} menu={names.map((n) => ({ label: n, onClick: () => api.insertFunction(n) }))} />
            ))}
          </Group>
          <Group label="Formül denetimi">
            <Btn icon="eye" label="Formülleri göster" wideLabel title={keyLabel("Formülleri göster (⌘`)")} on={api.showFormulas} onClick={api.toggleFormulas} />
          </Group>
        </>)}

        {tab === "data" && (<>
          <Group label="Sırala ve filtre uygula">
            <Btn icon="sortAsc" label="A→Z" title="Artan sırala" onClick={() => api.sort(true)} disabled={ro} />
            <Btn icon="sortDesc" label="Z→A" title="Azalan sırala" onClick={() => api.sort(false)} disabled={ro} />
            <Btn label="Özel sıralama…" wideLabel title="Özel sıralama" onClick={api.openSort} disabled={ro} />
            <Btn icon="filter" label="Filtre" wideLabel title={keyLabel("Filtre (⌘⇧L)")} on={api.filterOn} onClick={api.toggleFilter} disabled={ro} />
            <Btn label="Temizle" wideLabel title="Filtreleri temizle" onClick={api.clearFilter} disabled={ro || !api.filterActive} />
          </Group>
          <Group label="Veri araçları">
            <Btn icon="validate" label="Veri doğrulama" wideLabel title="Açılır liste / veri doğrulama" onClick={api.openValidation} disabled={ro} />
            <Btn icon="duplicate" label="Yinelenenleri kaldır" wideLabel title="Yinelenen satırları kaldır" onClick={api.removeDuplicates} disabled={ro} />
          </Group>
          <Group label="Veri al">
            <Btn icon="upload" label="Excel / CSV'den sayfa" wideLabel title="Excel ya da CSV dosyasının sayfalarını ekle" onClick={api.importSheets} disabled={ro} />
          </Group>
        </>)}

        {tab === "view" && (<>
          <Group label="Bölmeler">
            <Drop icon="freeze" label="Bölmeleri dondur" title="Bölmeleri dondur" menu={[
              { label: "Bölmeleri dondur", hint: "seçili hücreye göre", onClick: api.freezeAtCell, disabled: ro },
              { label: "Üst satırı dondur", onClick: () => api.freeze(1, 0), disabled: ro },
              { label: "İlk sütunu dondur", onClick: () => api.freeze(0, 1), disabled: ro },
              { label: "Bölmeleri çöz", onClick: () => api.freeze(0, 0), disabled: ro || (!api.frozen.r && !api.frozen.c) },
            ]} />
          </Group>
          <Group label="Göster">
            <Btn icon="grid" label="Kılavuz çizgileri" wideLabel title="Kılavuz çizgilerini göster/gizle" on={!api.noGrid} onClick={api.toggleGrid} disabled={ro} />
            <Btn icon="eye" label="Formüller" wideLabel title="Formülleri göster" on={api.showFormulas} onClick={api.toggleFormulas} />
          </Group>
          <Group label="Yakınlaştır">
            <Btn icon="zoomOut" title="Uzaklaştır" onClick={() => api.zoomStep(-1)} />
            <Drop label={`%${Math.round(api.zoom * 100)}`} title="Yakınlaştırma" menu={[200, 150, 125, 100, 90, 75, 50, 25].map((z) => ({ label: `%${z}`, checked: Math.round(api.zoom * 100) === z, onClick: () => api.setZoom(z / 100) })).concat(["-", { label: "Seçime sığdır", onClick: api.zoomToSelection }])} />
            <Btn icon="zoomIn" title="Yakınlaştır" onClick={() => api.zoomStep(1)} />
            <Btn label="%100" title="%100" onClick={() => api.setZoom(1)} />
          </Group>
        </>)}
      </div>
    </div>
  );
}
