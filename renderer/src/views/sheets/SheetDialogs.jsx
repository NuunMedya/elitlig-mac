// Tablolar iletişim kutuları: Hücreleri Biçimlendir (⌘1), Bul ve Değiştir,
// Koşullu biçimlendirme, Veri doğrulama, Satır/sütun boyutu, Özel sıralama,
// Git ve süzgeç açılır menüsü.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Field, Modal } from "../../components/ui";
import { NUMBER_FORMATS, colName, formatValue } from "../../lib/sheets/sheetEngine";
import { BORDER_STYLES, CF_PRESETS, CF_TYPES, FONT_FAMILIES, FONT_SIZES } from "../../lib/sheets/sheetModel";
import { ColorGrid, Popover, SIcon } from "./sheetUi";

const SAMPLE = 1234.5678;

/* ---------------------------- Hücreleri Biçimlendir ---------------------------- */

export function FormatCellsDialog({ style, initialTab = "number", onApply, onClose }) {
  const [tab, setTab] = useState(initialTab);
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(style || {})));
  const set = (patch) => setS((cur) => {
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === false || v === "") delete next[k]; else next[k] = v; }
    return next;
  });
  const [line, setLine] = useState({ s: "thin", c: "#000000" });
  const side = (k) => {
    const bd = { ...(s.bd || {}) };
    if (bd[k] && bd[k].s === line.s && bd[k].c === line.c) delete bd[k]; else bd[k] = { ...line };
    set({ bd: Object.keys(bd).length ? bd : null });
  };
  const apply = () => {
    // Yalnız değişen anahtarlar gönderilir; kaldırılanlar null.
    const patch = {};
    for (const k of new Set([...Object.keys(style || {}), ...Object.keys(s)])) {
      if (JSON.stringify(style?.[k]) !== JSON.stringify(s[k])) patch[k] = s[k] ?? null;
    }
    onApply(patch);
    onClose();
  };
  const preview = formatValue(s.f === "text" ? "Metin" : s.f === "date" || s.f === "dateLong" || s.f === "datetime" || s.f === "time" ? { date: 46341.6 } : SAMPLE, s);
  const tabs = [["number", "Sayı"], ["align", "Hizalama"], ["font", "Yazı tipi"], ["border", "Kenarlık"], ["fill", "Dolgu"]];
  const bdCss = (k) => (s.bd?.[k] ? `${s.bd[k].s === "thick" ? 3 : s.bd[k].s === "medium" || s.bd[k].s === "double" ? 2 : 1}px ${s.bd[k].s === "dashed" ? "dashed" : s.bd[k].s === "dotted" ? "dotted" : s.bd[k].s === "double" ? "double" : "solid"} ${s.bd[k].c}` : "1px dashed var(--border-strong)");
  return (
    <Modal title="Hücreleri biçimlendir" onClose={onClose} width={600} className="sx-dialog" footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" onClick={apply}>Tamam</button>
    </>}>
      <div className="sx-dtabs" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "number" && (
        <div className="sx-fmt">
          <ul className="sx-fmt__list" role="listbox">
            {NUMBER_FORMATS.map(([k, l]) => <li key={k}><button type="button" className={(s.f || "general") === k ? "is-active" : ""} onClick={() => set({ f: k === "general" ? null : k })}>{l}</button></li>)}
          </ul>
          <div className="sx-fmt__opts">
            <div className="sx-fmt__preview"><small>Örnek</small><b>{preview}</b></div>
            {["number", "money", "percent", "sci"].includes(s.f) && (
              <Field label="Ondalık basamak"><input type="number" min={0} max={10} value={s.d ?? (s.f === "percent" ? 0 : 2)} onChange={(e) => set({ d: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} /></Field>
            )}
            {(s.f === "number" || s.f === "money" || s.f === "percent") && (
              <label className="sx-check"><input type="checkbox" checked={!s.ng} onChange={(e) => set({ ng: !e.target.checked })} /> Binlik ayracı kullan (1.000)</label>
            )}
            {s.f === "time" && <label className="sx-check"><input type="checkbox" checked={s.d > 0} onChange={(e) => set({ d: e.target.checked ? 1 : null })} /> Saniyeyi göster</label>}
            <p className="muted small">{{ general: "Genel biçimli hücrelerin belirli bir sayı biçimi yoktur.", number: "Sayıların genel gösterimi; binlik ayracı ve ondalık basamak seçilebilir.", money: "Türk lirası (₺) ile parasal değerler.", percent: "Değeri 100 ile çarpıp % ile gösterir.", date: "Seri gün sayısını kısa tarih olarak gösterir (31.12.2026).", dateLong: "Uzun tarih (31 Aralık 2026).", time: "Saat (14:30).", datetime: "Tarih ve saat.", sci: "Bilimsel gösterim (1,23E+03).", text: "Değer yazıldığı gibi metin olarak kalır; formüller de hesaplanmaz." }[s.f || "general"]}</p>
          </div>
        </div>
      )}
      {tab === "align" && (
        <div className="sx-grid2">
          <Field label="Yatay"><select value={s.al || ""} onChange={(e) => set({ al: e.target.value || null })}><option value="">Genel</option><option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option></select></Field>
          <Field label="Dikey"><select value={s.va || ""} onChange={(e) => set({ va: e.target.value || null })}><option value="">Alt</option><option value="middle">Orta</option><option value="top">Üst</option></select></Field>
          <Field label="Girinti"><input type="number" min={0} max={15} value={s.ind || 0} onChange={(e) => set({ ind: Math.max(0, Math.min(15, Number(e.target.value) || 0)) || null })} /></Field>
          <Field label="Yönlendirme (derece)"><input type="number" min={-90} max={90} value={s.rot || 0} onChange={(e) => set({ rot: Math.max(-90, Math.min(90, Number(e.target.value) || 0)) || null })} /></Field>
          <label className="sx-check"><input type="checkbox" checked={Boolean(s.wr)} onChange={(e) => set({ wr: e.target.checked })} /> Metni kaydır</label>
        </div>
      )}
      {tab === "font" && (
        <div className="sx-grid2">
          <Field label="Yazı tipi"><select value={s.ff || ""} onChange={(e) => set({ ff: e.target.value || null })}>{FONT_FAMILIES.map((f) => <option key={f || "d"} value={f}>{f || "Varsayılan"}</option>)}</select></Field>
          <Field label="Boyut (pt)"><select value={s.fs || 10} onChange={(e) => set({ fs: Number(e.target.value) === 10 ? null : Number(e.target.value) })}>{[...new Set([...FONT_SIZES, s.fs || 10])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <div className="sx-checks">
            <label className="sx-check"><input type="checkbox" checked={Boolean(s.b)} onChange={(e) => set({ b: e.target.checked })} /> Kalın</label>
            <label className="sx-check"><input type="checkbox" checked={Boolean(s.i)} onChange={(e) => set({ i: e.target.checked })} /> İtalik</label>
            <label className="sx-check"><input type="checkbox" checked={Boolean(s.u)} onChange={(e) => set({ u: e.target.checked })} /> Altı çizili</label>
            <label className="sx-check"><input type="checkbox" checked={Boolean(s.st)} onChange={(e) => set({ st: e.target.checked })} /> Üstü çizili</label>
          </div>
          <div><div className="sx-colors__label">Renk</div><ColorGrid value={s.c} onPick={(c) => set({ c })} /></div>
          <div className="sx-fontpreview" style={{ fontWeight: s.b ? 700 : 400, fontStyle: s.i ? "italic" : "normal", textDecoration: [s.u && "underline", s.st && "line-through"].filter(Boolean).join(" ") || "none", fontSize: `${(s.fs || 10) * 4 / 3}px`, fontFamily: s.ff || undefined, color: s.c, background: s.bg }}>AaBbÇçĞğ 123</div>
        </div>
      )}
      {tab === "border" && (
        <div className="sx-bordertab">
          <div>
            <div className="sx-colors__label">Stil</div>
            <div className="sx-borders__styles sx-borders__styles--col">{BORDER_STYLES.map((st) => <button key={st} type="button" className={`sx-line sx-line--${st} ${line.s === st ? "is-on" : ""}`} onClick={() => setLine({ ...line, s: st })}><i /></button>)}</div>
            <div className="sx-colors__label">Renk</div>
            <ColorGrid value={line.c} noneLabel="Otomatik (siyah)" onPick={(c) => setLine({ ...line, c: c || "#000000" })} />
          </div>
          <div className="sx-borderbox">
            <div className="sx-borderbox__presets">
              <button type="button" className="btn btn--sm" onClick={() => set({ bd: null })}><SIcon name="borderNone" /> Yok</button>
              <button type="button" className="btn btn--sm" onClick={() => set({ bd: { t: { ...line }, r: { ...line }, b: { ...line }, l: { ...line } } })}><SIcon name="borderOuter" /> Dış</button>
            </div>
            <div className="sx-borderbox__sample" style={{ borderTop: bdCss("t"), borderRight: bdCss("r"), borderBottom: bdCss("b"), borderLeft: bdCss("l") }}>
              <button type="button" className="sx-borderbox__t" onClick={() => side("t")} aria-label="Üst" />
              <button type="button" className="sx-borderbox__r" onClick={() => side("r")} aria-label="Sağ" />
              <button type="button" className="sx-borderbox__b" onClick={() => side("b")} aria-label="Alt" />
              <button type="button" className="sx-borderbox__l" onClick={() => side("l")} aria-label="Sol" />
              <span>Metin</span>
            </div>
            <p className="muted small">Kenara tıklayarak seçili stil ve renkle çizin ya da kaldırın.</p>
          </div>
        </div>
      )}
      {tab === "fill" && (
        <div className="sx-grid2">
          <div><div className="sx-colors__label">Arka plan rengi</div><ColorGrid value={s.bg} noneLabel="Renk yok" onPick={(bg) => set({ bg })} /></div>
          <div className="sx-fontpreview" style={{ background: s.bg || "transparent", color: s.c }}>Örnek</div>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------- Bul ve Değiştir -------------------------------- */

export function FindPanel({ mode: initialMode, readOnly, onFind, onReplace, onReplaceAll, onClose, status }) {
  const [mode, setMode] = useState(initialMode);
  const [q, setQ] = useState("");
  const [r, setR] = useState("");
  const [opts, setOpts] = useState({ matchCase: false, whole: false, formulas: false, byColumns: false });
  const inputRef = useRef(null);
  useEffect(() => { setMode(initialMode); inputRef.current?.focus(); inputRef.current?.select(); }, [initialMode]);
  const go = (dir = 1) => onFind(q, opts, dir);
  return (
    <div className="sx-find" role="dialog" aria-label="Bul ve değiştir" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="sx-find__tabs">
        <button type="button" className={mode === "find" ? "is-active" : ""} onClick={() => setMode("find")}>Bul</button>
        {!readOnly && <button type="button" className={mode === "replace" ? "is-active" : ""} onClick={() => setMode("replace")}>Değiştir</button>}
        <span className="spacer" />
        <button type="button" className="sx-btn" onClick={onClose} aria-label="Kapat"><SIcon name="x" /></button>
      </div>
      <div className="sx-find__row">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Aranan" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(e.shiftKey ? -1 : 1); } }} />
        <button type="button" className="sx-btn" title="Önceki (⇧Enter)" onClick={() => go(-1)}><SIcon name="chevronLeft" /></button>
        <button type="button" className="sx-btn" title="Sonraki (Enter)" onClick={() => go(1)}><SIcon name="chevronRight" /></button>
      </div>
      {mode === "replace" && (
        <div className="sx-find__row">
          <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Yeni değer" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onReplace(q, r, opts); } }} />
          <button type="button" className="btn btn--xs" onClick={() => onReplace(q, r, opts)}>Değiştir</button>
          <button type="button" className="btn btn--xs" onClick={() => onReplaceAll(q, r, opts)}>Tümünü</button>
        </div>
      )}
      <div className="sx-find__opts">
        <label><input type="checkbox" checked={opts.matchCase} onChange={(e) => setOpts({ ...opts, matchCase: e.target.checked })} /> Büyük/küçük harf</label>
        <label><input type="checkbox" checked={opts.whole} onChange={(e) => setOpts({ ...opts, whole: e.target.checked })} /> Hücrenin tamamı</label>
        <label><input type="checkbox" checked={opts.formulas} onChange={(e) => setOpts({ ...opts, formulas: e.target.checked })} /> Formüllerde ara</label>
      </div>
      {status && <div className="sx-find__status">{status}</div>}
    </div>
  );
}

/* ----------------------------- Koşullu biçimlendirme ----------------------------- */

const CF_LABEL = Object.fromEntries(CF_TYPES);
export const cfSummary = (rule) => {
  const t = CF_LABEL[rule.type] || rule.type;
  if (rule.type === "between") return `${t} ${rule.a} ve ${rule.b}`;
  if (["gt", "lt", "eq", "neq", "contains", "notContains", "begins", "ends", "top", "bottom"].includes(rule.type)) return `${t}: ${rule.a}`;
  return t;
};

export function CfDialog({ type, rangeLabel: target, rules, onAdd, onRemove, onClose }) {
  const [kind, setKind] = useState(type || "gt");
  const [a, setA] = useState(type === "top" ? "10" : "");
  const [b, setB] = useState("");
  const [preset, setPreset] = useState("red");
  const [custom, setCustom] = useState(null);
  const manage = type == null;
  const needsA = ["gt", "lt", "eq", "neq", "between", "contains", "notContains", "begins", "ends", "top", "bottom"].includes(kind);
  const style = custom || CF_PRESETS.find((p) => p.key === preset)?.style || {};
  const add = () => {
    if (kind === "scale") onAdd({ type: "scale", colors: ["#f8696b", "#ffeb84", "#63be7b"] });
    else if (kind === "bar") onAdd({ type: "bar", colors: ["#638ec6"] });
    else onAdd({ type: kind, ...(needsA ? { a } : {}), ...(kind === "between" ? { b } : {}), style });
    onClose();
  };
  return (
    <Modal title={manage ? "Koşullu biçimlendirme kuralları" : "Koşullu biçimlendirme"} onClose={onClose} width={560} footer={<>
      <button type="button" className="btn" onClick={onClose}>{manage ? "Kapat" : "Vazgeç"}</button>
      <button type="button" className="btn btn--primary" onClick={add} disabled={needsA && a === "" && kind !== "top"}>Kural ekle</button>
    </>}>
      <p className="muted small">Uygulanacak aralık: <b>{target}</b></p>
      <div className="sx-grid2">
        <Field label="Kural"><select value={kind} onChange={(e) => setKind(e.target.value)}>{CF_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {needsA && <Field label={kind === "top" || kind === "bottom" ? "Öğe sayısı" : kind === "between" ? "En az" : "Değer"}><input value={a} onChange={(e) => setA(e.target.value)} autoFocus /></Field>}
        {kind === "between" && <Field label="En çok"><input value={b} onChange={(e) => setB(e.target.value)} /></Field>}
        {kind !== "scale" && kind !== "bar" && (
          <Field label="Biçim">
            <select value={custom ? "custom" : preset} onChange={(e) => { if (e.target.value === "custom") setCustom({ bg: "#fde68a" }); else { setCustom(null); setPreset(e.target.value); } }}>
              {CF_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="custom">Özel dolgu rengi…</option>
            </select>
          </Field>
        )}
      </div>
      {custom && <ColorGrid value={custom.bg} noneLabel="Renk yok" onPick={(bg) => setCustom({ ...custom, bg })} />}
      {kind !== "scale" && kind !== "bar" && <div className="sx-cfpreview" style={{ background: style.bg, color: style.c, fontWeight: style.b ? 700 : 400 }}>AaBbCc 123</div>}
      {rules.length > 0 && (<>
        <h4 className="sx-subhead">Bu sayfadaki kurallar</h4>
        <ul className="sx-rules">
          {rules.map((rule) => (
            <li key={rule.id}>
              <span className="sx-rules__sw" style={{ background: rule.type === "scale" ? `linear-gradient(90deg, ${(rule.colors || []).join(",")})` : rule.type === "bar" ? rule.colors?.[0] : rule.style?.bg || "transparent", color: rule.style?.c }}>{rule.type === "scale" || rule.type === "bar" ? "" : "Aa"}</span>
              <span>{cfSummary(rule)}</span>
              <code>{rule.ref}</code>
              <button type="button" className="sx-btn" aria-label="Kuralı sil" onClick={() => onRemove(rule.id)}><SIcon name="trash" /></button>
            </li>
          ))}
        </ul>
      </>)}
    </Modal>
  );
}

/* --------------------------------- Veri doğrulama --------------------------------- */

export function ValidationDialog({ rule, rangeLabel: target, onSave, onRemove, onClose }) {
  const [source, setSource] = useState(rule?.source ? "range" : "list");
  const [list, setList] = useState((rule?.list || []).join("; "));
  const [ref, setRef] = useState(rule?.source || "");
  const [strict, setStrict] = useState(rule ? Boolean(rule.strict) : true);
  const save = () => {
    const items = list.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
    if (source === "list" && !items.length) return;
    onSave(source === "list" ? { type: "list", list: items.slice(0, 500), strict } : { type: "list", source: ref.startsWith("=") ? ref : `=${ref}`, strict });
    onClose();
  };
  return (
    <Modal title="Veri doğrulama — açılır liste" onClose={onClose} width={500} footer={<>
      {rule && <button type="button" className="btn btn--ghost is-danger" onClick={() => { onRemove(); onClose(); }}>Kaldır</button>}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" onClick={save}>Kaydet</button>
    </>}>
      <p className="muted small">Uygulanacak aralık: <b>{target}</b>. Hücre seçildiğinde yanında açılır liste düğmesi görünür.</p>
      <div className="sx-seg">
        <label><input type="radio" checked={source === "list"} onChange={() => setSource("list")} /> Seçenekleri yaz</label>
        <label><input type="radio" checked={source === "range"} onChange={() => setSource("range")} /> Hücre aralığından</label>
      </div>
      {source === "list"
        ? <Field label="Seçenekler" hint="Noktalı virgülle ya da satır satır ayırın: Ödendi; Bekliyor; İptal"><textarea rows={4} value={list} onChange={(e) => setList(e.target.value)} autoFocus /></Field>
        : <Field label="Kaynak aralık" hint="Örn. $H$2:$H$10"><input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="=$H$2:$H$10" autoFocus /></Field>}
      <label className="sx-check"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /> Listede olmayan değerleri reddet</label>
    </Modal>
  );
}

/* ------------------------------ satır / sütun boyutu ------------------------------ */

export function SizeDialog({ axis, value, onSave, onClose }) {
  const [v, setV] = useState(String(Math.round(value)));
  const save = () => { const n = Number(v); if (n > 0) { onSave(n); onClose(); } };
  return (
    <Modal title={axis === "row" ? "Satır yüksekliği" : "Sütun genişliği"} onClose={onClose} width={340} footer={<>
      <button type="button" className="btn" onClick={() => { onSave(null); onClose(); }}>Varsayılan</button>
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" onClick={save}>Tamam</button>
    </>}>
      <Field label={`${axis === "row" ? "Yükseklik" : "Genişlik"} (piksel)`}>
        <input type="number" min={4} max={axis === "row" ? 800 : 1200} value={v} onChange={(e) => setV(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      </Field>
    </Modal>
  );
}

/* --------------------------------- özel sıralama --------------------------------- */

export function SortDialog({ range, headerGuess, headerLabels, onSort, onClose }) {
  const [header, setHeader] = useState(headerGuess);
  const cols = useMemo(() => Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => range.c1 + i), [range]);
  const label = (c) => (header && headerLabels[c] ? `${headerLabels[c]} (${colName(c)})` : `Sütun ${colName(c)}`);
  const [keys, setKeys] = useState([{ col: range.c1, asc: true }]);
  return (
    <Modal title="Özel sıralama" onClose={onClose} width={480} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" onClick={() => { onSort(keys, header); onClose(); }}>Sırala</button>
    </>}>
      <label className="sx-check"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> Verilerimde başlık var</label>
      <ul className="sx-sortkeys">
        {keys.map((k, i) => (
          <li key={i}>
            <span className="muted small">{i ? "Sonra" : "Sırala"}</span>
            <select value={k.col} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, col: Number(e.target.value) } : x)))}>{cols.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
            <select value={k.asc ? "asc" : "desc"} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, asc: e.target.value === "asc" } : x)))}><option value="asc">A → Z (küçükten büyüğe)</option><option value="desc">Z → A (büyükten küçüğe)</option></select>
            {keys.length > 1 && <button type="button" className="sx-btn" aria-label="Düzeyi sil" onClick={() => setKeys(keys.filter((_, j) => j !== i))}><SIcon name="x" /></button>}
          </li>
        ))}
      </ul>
      {keys.length < 4 && <button type="button" className="btn btn--sm" onClick={() => setKeys([...keys, { col: cols.find((c) => !keys.some((k) => k.col === c)) ?? range.c1, asc: true }])}><SIcon name="plus" /> Düzey ekle</button>}
    </Modal>
  );
}

/* ---------------------------------------- Git ---------------------------------------- */

export function GoToDialog({ onGo, onClose }) {
  const [v, setV] = useState("");
  return (
    <Modal title="Git" onClose={onClose} width={340} footer={<>
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" onClick={() => { if (onGo(v)) onClose(); }}>Git</button>
    </>}>
      <Field label="Başvuru" hint="Örn. B12 ya da A1:D20"><input value={v} onChange={(e) => setV(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter" && onGo(v)) onClose(); }} /></Field>
    </Modal>
  );
}

/* ------------------------------- süzgeç açılır menüsü ------------------------------- */

const FILTER_OPS = [["", "Koşul yok"], ["gt", "Büyüktür"], ["ge", "Büyük ya da eşit"], ["lt", "Küçüktür"], ["le", "Küçük ya da eşit"], ["between", "Arasında"], ["eq", "Eşittir"], ["neq", "Eşit değildir"], ["contains", "İçerir"], ["notContains", "İçermez"], ["begins", "İle başlar"], ["blank", "Boş"], ["notBlank", "Boş değil"]];

export function FilterMenu({ anchor, values, crit, title, onApply, onSort, onClose }) {
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState(() => new Set((crit?.hide || []).map((x) => x.toLocaleLowerCase("tr-TR"))));
  const [op, setOp] = useState(crit?.op || "");
  const [a, setA] = useState(crit?.a ?? "");
  const [b, setB] = useState(crit?.b ?? "");
  const shown = values.filter((v) => !q || v.text.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
  const allOn = shown.every((v) => !hidden.has(v.key));
  const toggleAll = () => {
    const next = new Set(hidden);
    for (const v of shown) { if (allOn) next.add(v.key); else next.delete(v.key); }
    setHidden(next);
  };
  const apply = () => {
    const hide = values.filter((v) => hidden.has(v.key)).map((v) => v.text);
    onApply({ ...(hide.length ? { hide } : {}), ...(op ? { op, a, ...(op === "between" ? { b } : {}) } : {}) });
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="sx-filter" width={280}>
      <div className="sx-filter__title">{title}</div>
      <button type="button" className="sx-filter__act" onClick={() => { onSort(true); onClose(); }}><SIcon name="sortAsc" /> A'dan Z'ye sırala</button>
      <button type="button" className="sx-filter__act" onClick={() => { onSort(false); onClose(); }}><SIcon name="sortDesc" /> Z'den A'ya sırala</button>
      <hr />
      <div className="sx-filter__cond">
        <select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Koşul">{FILTER_OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {op && op !== "blank" && op !== "notBlank" && <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Değer" />}
        {op === "between" && <input value={b} onChange={(e) => setB(e.target.value)} placeholder="ve" />}
      </div>
      <input className="sx-filter__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara" />
      <div className="sx-filter__list">
        <label className="sx-filter__all"><input type="checkbox" checked={allOn} onChange={toggleAll} /> (Tümünü seç)</label>
        {shown.slice(0, 1000).map((v) => (
          <label key={v.key}><input type="checkbox" checked={!hidden.has(v.key)} onChange={() => { const next = new Set(hidden); if (next.has(v.key)) next.delete(v.key); else next.add(v.key); setHidden(next); }} />
            <span>{v.text === "" ? "(Boş)" : v.text}</span><small>{v.count}</small></label>
        ))}
      </div>
      <div className="sx-filter__foot">
        <button type="button" className="btn btn--sm" onClick={() => { onApply(null); onClose(); }}>Temizle</button>
        <span className="spacer" />
        <button type="button" className="btn btn--sm" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--sm btn--primary" onClick={apply}>Tamam</button>
      </div>
    </Popover>
  );
}

/** Veri doğrulama listesinin açılır seçenekleri. */
export function ListPicker({ anchor, items, value, onPick, onClose }) {
  return (
    <Popover anchor={anchor} onClose={onClose} className="sx-listpick">
      <div className="sx-menu">
        {items.length ? items.map((it) => (
          <button key={it} type="button" className={it === value ? "is-checked" : ""} onClick={() => { onPick(it); onClose(); }}><span className="sx-menu__ic">{it === value ? <SIcon name="check" size={14} /> : null}</span><span className="sx-menu__label">{it}</span></button>
        )) : <div className="sx-menu__head">Liste boş</div>}
      </div>
    </Popover>
  );
}
