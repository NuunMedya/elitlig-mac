// Metin ve veri: karşılaştırma (diff), Markdown önizleme, CSV ↔ JSON ↔ tablo, regex testi,
// özet (MD5 / SHA, metin ya da dosya), toplantı notu şablonu. Mantık: ../lib/textData.js, misc.js.
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Segmented, useToast } from "../../../components/ui";
import { useCopy, useStored } from "../toolkitUi";
import { REGEX_PRESETS, csvToJson, diffLines, diffWords, hashAll, jsonToRows, markdownToHtml, parseCsv, regexTest, toCsv } from "../lib/textData";
import { MEETING_TEMPLATES, meetingNote } from "../lib/misc";
import { ExportBar, Field, Table, saveText } from "./common";

/* ------------------------------- karşılaştırma ------------------------------- */

export function DiffTool() {
  const [a, setA] = useStored("tt.diff.a", "Kartallar 2-1 Aslanlar\nKurtlar 0-0 Şahinler\nSaat: 20:00");
  const [b, setB] = useStored("tt.diff.b", "Kartallar 2-1 Aslanlar\nKurtlar 1-0 Şahinler\nSaat: 21:00\nHakem: Ali Veli");
  const [opts, setOpts] = useStored("tt.diff.opts", { ignoreCase: false, ignoreSpace: true });
  const d = useMemo(() => diffLines(a, b, opts), [a, b, opts]);
  const single = !a.includes("\n") && !b.includes("\n");
  const words = useMemo(() => (single ? diffWords(a, b) : null), [a, b, single]);
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label="Önceki"><textarea className="is-mono" value={a} onChange={(e) => setA(e.target.value)} aria-label="Önceki metin" /></Field>
        <Field label="Sonraki"><textarea className="is-mono" value={b} onChange={(e) => setB(e.target.value)} aria-label="Sonraki metin" /></Field>
      </div>
      <div className="tt-row">
        <label className="tk-check"><input type="checkbox" checked={opts.ignoreCase} onChange={(e) => setOpts({ ...opts, ignoreCase: e.target.checked })} /> Büyük/küçük harfi yok say</label>
        <label className="tk-check"><input type="checkbox" checked={opts.ignoreSpace} onChange={(e) => setOpts({ ...opts, ignoreSpace: e.target.checked })} /> Boşlukları yok say</label>
        <span className="tt-muted" data-testid="diff-summary">{d.added} eklendi · {d.removed} silindi · {d.same} aynı</span>
      </div>
      {words ? (
        <div className="tt-md tt-words">{words.map((p, i) => (p.op === "+" ? <ins key={i}>{p.value}</ins> : p.op === "-" ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>))}</div>
      ) : (
        <div className="tt-diff" aria-label="Farklar">{d.parts.map((p, i) => <div key={i} className={p.op === "+" ? "is-add" : p.op === "-" ? "is-del" : ""}>{p.value || " "}</div>)}</div>
      )}
    </div>
  );
}

/* ------------------------------- markdown ------------------------------- */

const MD_SAMPLE = "# Maç günü planı\n\n**Saha:** Ataşehir · **Saat:** 20:00\n\n## Yapılacaklar\n- [x] Hakem ataması\n- [ ] Yayın ekipmanı\n- [ ] Forma kontrolü\n\n| Görev | Kişi |\n|---|---|\n| Spiker | Ali |\n| Reji | Ayşe |\n\n> Not: Yağmur ihtimaline karşı yedek saha.";

export function MarkdownTool() {
  const copy = useCopy();
  const [md, setMd] = useStored("tt.md.text", MD_SAMPLE);
  const html = useMemo(() => markdownToHtml(md), [md]);
  const pdf = () => window.elitlig.pdf(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>body{font:13px -apple-system,"Segoe UI",Arial,sans-serif;margin:32px;line-height:1.55}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px}code{background:#f3f3f3;padding:1px 4px}blockquote{border-left:3px solid #7c3aed;margin:0;padding-left:10px;color:#444}</style></head><body>${html}</body></html>`, (md.match(/^#\s+(.+)$/m)?.[1] || "Not").replace(/[\\/:*?"<>|]/g, "-"));
  return (
    <div className="tt">
      <div className="tt-cols">
        <Field label="Markdown"><textarea className="is-mono" value={md} onChange={(e) => setMd(e.target.value)} aria-label="Markdown" style={{ minHeight: 260 }} /></Field>
        <div className="tt">
          <span className="tt-field"><span>Önizleme</span></span>
          {/* markdownToHtml HTML'i kaçışlar, yalnız http(s)/mailto bağlantılarına izin verir. */}
          <div className="tt-md" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      <div className="tt-row">
        <button type="button" className="btn btn--sm" onClick={() => copy(html, "HTML kopyalandı")}><Icon name="copy" size={12} /> HTML kopyala</button>
        <button type="button" className="btn btn--sm" onClick={() => saveText("not.md", md, "md", "Markdown")}><Icon name="download" size={12} /> .md kaydet</button>
        <button type="button" className="btn btn--sm" onClick={pdf}><Icon name="printer" size={12} /> PDF</button>
      </div>
    </div>
  );
}

/* ------------------------------- CSV ↔ JSON ------------------------------- */

export function CsvTool() {
  const copy = useCopy();
  const [mode, setMode] = useStored("tt.csv.mode", "csv2json");
  const [input, setInput] = useStored("tt.csv.input", "takım;oyuncu;gol\nKartallar;Ali Can;7\nAslanlar;Veli Er;5");
  const [delim, setDelim] = useStored("tt.csv.delim", "auto");
  const res = useMemo(() => {
    try {
      if (mode === "csv2json") {
        const rows = parseCsv(input, delim === "auto" ? null : delim);
        return { rows, out: JSON.stringify(csvToJson(input, { delimiter: delim === "auto" ? null : delim }), null, 2) };
      }
      const rows = jsonToRows(input);
      return { rows, out: toCsv(rows, delim === "auto" ? ";" : delim) };
    } catch (e) { return { error: e.message, rows: [] }; }
  }, [mode, input, delim]);
  return (
    <div className="tt">
      <div className="tt-row">
        <Segmented value={mode} onChange={setMode} size="sm" ariaLabel="Yön" options={[{ value: "csv2json", label: "CSV → JSON" }, { value: "json2csv", label: "JSON → CSV" }]} />
        <select value={delim} onChange={(e) => setDelim(e.target.value)} aria-label="Ayırıcı" style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="auto">Ayırıcı: otomatik</option><option value=",">Virgül (,)</option><option value=";">Noktalı virgül (;)</option><option value={"\t"}>Sekme</option><option value="|">Dikey çizgi (|)</option>
        </select>
      </div>
      <div className="tt-cols">
        <Field label={mode === "csv2json" ? "CSV (Excel'den yapıştırabilirsiniz)" : "JSON (nesne dizisi)"}><textarea className="is-mono" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Girdi" /></Field>
        <Field label={mode === "csv2json" ? "JSON" : "CSV"}><textarea className="is-mono" readOnly value={res.error ? "" : res.out} aria-label="Çıktı" /></Field>
      </div>
      {res.error && <p className="tk-err">{res.error}</p>}
      <div className="tt-row">
        <button type="button" className="btn btn--sm btn--primary" disabled={!res.out} onClick={() => copy(res.out, "Çıktı kopyalandı")}><Icon name="copy" size={12} /> Çıktıyı kopyala</button>
        <ExportBar title="Tablo" rows={() => res.rows} disabled={!res.rows?.length} />
      </div>
      {res.rows?.length > 0 && <Table rows={res.rows.slice(0, 101)} />}
    </div>
  );
}

/* ------------------------------- regex ------------------------------- */

export function RegexTool() {
  const [p, setP] = useStored("tt.regex", { pattern: "\\b(\\d{1,2})\\s*[-:]\\s*(\\d{1,2})\\b", flags: "g", text: "Kartallar 2-1 Aslanlar, Kurtlar 0:0 Şahinler", replace: "" });
  const set = (x) => setP({ ...p, ...x });
  const r = useMemo(() => regexTest(p.pattern, p.flags, p.text, p.replace || null), [p]);
  const highlighted = useMemo(() => {
    if (!r.ok || !r.matches.length) return [p.text];
    const out = [];
    let last = 0;
    r.matches.forEach((m, i) => { out.push(p.text.slice(last, m.index)); out.push(<mark key={i}>{m.text}</mark>); last = m.index + m.text.length; });
    out.push(p.text.slice(last));
    return out;
  }, [r, p.text]);
  return (
    <div className="tt">
      <div className="tt-row">
        <input className="is-mono" value={p.pattern} onChange={(e) => set({ pattern: e.target.value })} aria-label="Düzenli ifade" placeholder="desen" />
        <input className="is-mono" value={p.flags} onChange={(e) => set({ flags: e.target.value.replace(/[^gimsuy]/g, "") })} aria-label="Bayraklar" style={{ flex: "0 0 60px", minWidth: 60 }} />
      </div>
      <div className="tk-chips">{REGEX_PRESETS.map((x) => <button key={x.label} type="button" className="tk-chip" onClick={() => set({ pattern: x.pattern, flags: x.flags })}>{x.label}</button>)}</div>
      <Field label="Metin"><textarea value={p.text} onChange={(e) => set({ text: e.target.value })} aria-label="Sınanacak metin" style={{ minHeight: 80 }} /></Field>
      {!r.ok ? <p className="tk-err">{r.error}</p> : <>
        <div className="tt-md tt-matches" aria-label="Eşleşmeler" style={{ whiteSpace: "pre-wrap" }}>{highlighted}</div>
        <p className="tt-muted" data-testid="regex-count">{r.matches.length} eşleşme</p>
        {r.matches.length > 0 && <Table rows={[["#", "Eşleşme", "Konum", "Gruplar"], ...r.matches.slice(0, 200).map((m, i) => [i + 1, <code key="c">{m.text}</code>, m.index, m.groups.map((g, j) => `$${j + 1}=${g ?? ""}`).join("  ")])]} />}
      </>}
      <Field label="Değiştir (isteğe bağlı: $1, $2 …)"><input className="is-mono" value={p.replace} onChange={(e) => set({ replace: e.target.value })} aria-label="Değiştirme" /></Field>
      {p.replace && r.replaced != null && <textarea readOnly className="is-mono" value={r.replaced} aria-label="Değiştirilmiş metin" style={{ minHeight: 60 }} />}
    </div>
  );
}

/* ------------------------------- özet (hash) ------------------------------- */

export function HashTool() {
  const copy = useCopy();
  const toast = useToast();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [hashes, setHashes] = useState(null);
  const [compare, setCompare] = useState("");
  useEffect(() => {
    let alive = true;
    if (file) return undefined;
    hashAll(text).then((h) => alive && setHashes(h));
    return () => { alive = false; };
  }, [text, file]);
  const pickFile = async (f) => {
    if (!f) return;
    if (f.size > 512 * 1024 * 1024) { toast("Dosya çok büyük (en çok 512 MB).", { tone: "warn" }); return; }
    setFile({ name: f.name, size: f.size });
    setHashes(null);
    const bytes = new Uint8Array(await f.arrayBuffer());
    setHashes(await hashAll(bytes));
  };
  const cmp = compare.trim().toLowerCase();
  const match = cmp && hashes ? Object.entries(hashes).find(([, v]) => v === cmp)?.[0] : null;
  return (
    <div className="tt">
      <div className="tt-row">
        <label className="btn btn--sm"><Icon name="file" size={12} /> Dosya seç<input type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} /></label>
        {file && <span className="tt-muted">{file.name} · {(file.size / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB <button type="button" className="link-btn" onClick={() => setFile(null)}>metne dön</button></span>}
      </div>
      {!file && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Metin yazın ya da yapıştırın (UTF-8)" aria-label="Metin" style={{ minHeight: 70 }} />}
      {!hashes ? <p className="tt-muted">Hesaplanıyor…</p> : (
        <div className="tk-copies">
          {Object.entries(hashes).map(([k, v]) => (
            <button key={k} type="button" className="tk-copy" onClick={() => copy(v, `${k} kopyalandı`)} style={match === k ? { borderColor: "var(--green)" } : undefined}>
              <span className="tk-copy__label">{k}</span><span className="tk-copy__value is-mono" data-hash={k}>{v}</span><Icon name="copy" size={13} />
            </button>
          ))}
        </div>
      )}
      <input className="is-mono" value={compare} onChange={(e) => setCompare(e.target.value)} placeholder="Karşılaştırmak için beklenen özeti yapıştırın" aria-label="Beklenen özet" />
      {cmp && hashes && (match ? <p className="tk-ok">✓ {match} ile eşleşiyor.</p> : <p className="tk-err">Hiçbir özetle eşleşmiyor.</p>)}
    </div>
  );
}

/* ------------------------------- toplantı notu ------------------------------- */

export function MeetingTool() {
  const copy = useCopy();
  const toast = useToast();
  const today = new Date().toLocaleDateString("tr-TR");
  const [o, setO] = useStored("tt.meeting", { template: "league", title: "", date: today, place: "", attendees: "", fields: {} });
  const tpl = MEETING_TEMPLATES.find((t) => t.key === o.template) || MEETING_TEMPLATES[0];
  const md = meetingNote(o);
  const set = (p) => setO({ ...o, ...p });
  const toNotes = async () => {
    try {
      const { post } = await import("../../../api");
      const r = await post("/api/tools/notes", { title: o.title || tpl.label, body: md, tags: ["toplantı"] });
      if (r?.ok) toast("Not Defteri'ne kaydedildi.", { tone: "success" });
      else toast(r?.error?.message || "Kaydedilemedi (oturum ya da bağlantı).", { tone: "error" });
    } catch (e) { toast(e.message, { tone: "error" }); }
  };
  return (
    <div className="tt">
      <div className="tt-cols3">
        <Field label="Şablon"><select value={o.template} onChange={(e) => set({ template: e.target.value })} aria-label="Şablon">{MEETING_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        <Field label="Başlık"><input value={o.title} onChange={(e) => set({ title: e.target.value })} placeholder={tpl.label} aria-label="Başlık" /></Field>
        <Field label="Tarih"><input value={o.date} onChange={(e) => set({ date: e.target.value })} aria-label="Tarih" /></Field>
        <Field label="Yer"><input value={o.place} onChange={(e) => set({ place: e.target.value })} aria-label="Yer" /></Field>
      </div>
      <Field label="Katılımcılar"><input value={o.attendees} onChange={(e) => set({ attendees: e.target.value })} placeholder="Ali, Ayşe, Mehmet" aria-label="Katılımcılar" /></Field>
      <div className="tt-cols">
        {tpl.sections.map((sec) => (
          <Field key={sec} label={sec}><textarea value={o.fields[sec] || ""} onChange={(e) => set({ fields: { ...o.fields, [sec]: e.target.value } })} aria-label={sec} style={{ minHeight: 64 }} placeholder={sec === "Yapılacaklar" ? "Her satır bir görev: Ali – hakem listesi (Cuma)" : ""} /></Field>
        ))}
      </div>
      <div className="tt-row">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => copy(md, "Toplantı notu kopyalandı")}><Icon name="copy" size={12} /> Kopyala</button>
        <button type="button" className="btn btn--sm" onClick={toNotes}><Icon name="note" size={12} /> Not Defteri'ne kaydet</button>
        <button type="button" className="btn btn--sm" onClick={() => saveText(`${(o.title || tpl.label).replace(/[\\/:*?"<>|]/g, "-")}.md`, md, "md", "Markdown")}><Icon name="download" size={12} /> .md</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => set({ fields: {}, title: "", attendees: "", place: "", date: today })}>Temizle</button>
      </div>
      <details><summary className="tt-muted">Önizleme</summary><div className="tt-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(md) }} /></details>
    </div>
  );
}
