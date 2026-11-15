// Hızlı işlemler: bağlantıdan indir, dosya işleri, hızlı görev / not / gelir-gider, yeni proje,
// ekran görüntüsü, hızlı hesap, yeni kayıt düğmesi, geri sayım.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { post, request, tempId } from "../../../api";
import { formatMoney, formatTime, isoDay, parseQuickTask, relativeDay } from "../../../lib/helpers";
import { PRESET_CATEGORIES, parseAmount } from "../../../lib/ledgerUtils";
import { evaluate } from "../../../lib/calcUtils";
import { siteOfUrl } from "../../files/DownloadDialog";
import { ACTION_CHOICES } from "../registry";
import { refreshData, useBridge, useData } from "../data";
import { Actions, Bar, Big, List, Note, Row, State, XsButton } from "../parts";

const ft = () => window.elitlig.fileTools;
const ACTIVE = new Set(["queued", "running"]);
const useNote = () => {
  const [note, setNote] = useState(null);
  useEffect(() => { if (!note || note.sticky) return undefined; const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); }, [note]);
  return [note, setNote];
};

/* ------------------------------ bağlantıdan indir ------------------------------ */

function useJobs(limit = 8) {
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    const api = ft();
    if (!api) { setJobs([]); return undefined; }
    const load = () => api.jobs().then((r) => setJobs(r?.ok ? r.items : [])).catch(() => setJobs([]));
    load();
    const offJob = api.onJob?.((job) => setJobs((list) => {
      const cur = list || [];
      const i = cur.findIndex((j) => j.id === job.id);
      if (i < 0) return [job, ...cur].slice(0, 40);
      const next = [...cur];
      next[i] = { ...next[i], ...job };
      return next;
    }));
    const offLib = api.onLibrary?.(load);
    return () => { offJob?.(); offLib?.(); };
  }, []);
  return useMemo(() => (jobs ? jobs.slice(0, limit) : null), [jobs, limit]);
}

function JobRow({ job }) {
  const active = ACTIVE.has(job.status);
  const pct = Math.round((job.progress || 0) * 100);
  const out = job.outputs || [];
  const name = (job.inputs || [])[0]?.name || job.options?.url || "";
  return (
    <li className={`dt-job is-${job.status}`}>
      <Icon name={job.status === "done" ? "check" : job.status === "error" ? "alert" : job.op === "webDownload" ? "download" : "file"} size={13} />
      <span className="dt-job__text">
        <strong>{job.label}</strong>
        <small title={name}>{job.status === "error" ? job.error : job.status === "done" ? `${out.length} dosya hazır` : active ? (job.status === "queued" ? "Sırada" : job.indeterminate ? "Sürüyor…" : `%${pct}`) : name}</small>
        {active && <Bar pct={job.indeterminate ? 100 : pct} label={`${job.label} ilerlemesi`} />}
      </span>
      {active && <button type="button" className="icon-btn icon-btn--xs" onClick={() => ft().cancel(job.id)} aria-label="İptal" title="İptal"><Icon name="x" size={12} /></button>}
      {job.status === "done" && out[0] && <button type="button" className="icon-btn icon-btn--xs" onClick={() => ft().reveal(out[0].path)} aria-label="Klasörde göster" title="Klasörde göster"><Icon name="folder" size={12} /></button>}
      {job.status === "done" && out[0] && <button type="button" className="icon-btn icon-btn--xs" onClick={() => ft().openPath(out[0].path)} aria-label="Aç" title="Aç"><Icon name="external" size={12} /></button>}
    </li>
  );
}

export function DownloadTile({ tier, o, set, go, bar, lines }) {
  const [url, setUrl] = useState("");
  const [tool, setTool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [note, setNote] = useNote();
  const jobs = useJobs(tier === "xl" ? 8 : 4);
  const mode = o.mode || "video";
  const quality = o.quality || "best";
  const site = siteOfUrl(url);
  useEffect(() => {
    if (!ft()) return undefined;
    ft().ytdlp.status().then((r) => r?.ok && setTool(r)).catch(() => {});
    return ft().ytdlp.onProgress?.((p) => setInstalling(p.phase !== "done"));
  }, []);
  if (!ft()) return <State empty="Dosya araçları bu sürümde yok." emptyIcon="alert" />;

  const start = async (link) => {
    const target = String(link || "").trim();
    if (!siteOfUrl(target)) { setNote({ tone: "red", text: "Geçerli bir bağlantı (https://…) yapıştırın." }); return false; }
    if (tool && !tool.available) { setNote({ tone: "amber", text: "Önce indirme aracını (yt-dlp) kurun." }); return false; }
    setBusy(true);
    const res = await ft().run({ op: "webDownload", ids: [], options: { url: target, mode, quality, audioFormat: "mp3", playlist: false, withImages: mode === "video" && siteOfUrl(target)?.key === "instagram", cookiesBrowser: null } });
    setBusy(false);
    if (res?.ok) { setUrl(""); setNote({ tone: "green", text: `İndirme başladı: ${siteOfUrl(target).label}` }); return true; }
    setNote({ tone: "red", text: res?.error?.message || "İndirme başlatılamadı." });
    return false;
  };
  const fromClipboard = async () => {
    const r = await ft().clipboardLink().catch(() => null);
    if (r?.ok && r.url) { setUrl(r.url); return r.url; }
    setNote({ tone: "amber", text: "Panoda bağlantı yok." });
    return null;
  };
  const install = async () => {
    setInstalling(true);
    const r = await ft().ytdlp.update().catch((e) => ({ ok: false, error: { message: String(e?.message || e) } }));
    setInstalling(false);
    if (r?.ok) { setTool(r.status); setNote({ tone: "green", text: `yt-dlp ${r.version} hazır.` }); } else setNote({ tone: "red", text: r?.error?.message || "yt-dlp indirilemedi." });
  };
  const running = (jobs || []).filter((j) => ACTIVE.has(j.status) && j.op === "webDownload").length;

  if (tier === "xs") {
    return <XsButton icon="download" label="İndir" badge={running} busy={busy} title="Panodaki bağlantıyı indir" onClick={async () => { const u = await fromClipboard(); if (u) start(u); }} />;
  }
  const form = (
    <form className={`dt-inline${bar ? " is-bar" : ""}`} onSubmit={(e) => { e.preventDefault(); start(url); }}>
      <Icon name="link" size={14} className="dt-inline__icon" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Bağlantıyı yapıştırın: https://…" aria-label="İndirilecek bağlantı" spellCheck={false} />
      {site && <span className="pill">{site.label}</span>}
      <button type="button" className="icon-btn icon-btn--xs" onClick={fromClipboard} title="Panodan yapıştır" aria-label="Panodan yapıştır"><Icon name="clipboard" size={13} /></button>
      <button type="submit" className="btn btn--primary btn--xs" disabled={busy || !url.trim()}>{busy ? "…" : "İndir"}</button>
    </form>
  );
  if (bar || tier === "s") return <div className="dt-stack">{form}<Note note={note} />{!bar && tool && !tool.available && <button type="button" className="btn btn--xs" onClick={install} disabled={installing}>{installing ? "Kuruluyor…" : "yt-dlp'yi kur"}</button>}</div>;
  return (
    <div className="dt-stack">
      {form}
      <div className="dt-chips" role="radiogroup" aria-label="Ne indirilsin">
        {[["video", "Video"], ["audio", "Yalnız ses (MP3)"], ["images", "Görseller"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={mode === v} className={mode === v ? "is-on" : ""} onClick={() => set({ mode: v })}>{l}</button>)}
        {mode === "video" && <select value={quality} onChange={(e) => set({ quality: e.target.value })} aria-label="Kalite"><option value="best">En iyi</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select>}
      </div>
      {tool && !tool.available && <p className="dt-warn">İndirme aracı (yt-dlp) yok. <button type="button" className="link-btn" onClick={install} disabled={installing}>{installing ? "Kuruluyor…" : "Şimdi kur (~35 MB)"}</button></p>}
      <Note note={note} />
      {(tier === "l" || tier === "xl") && (
        <List className="dt-jobs">{(jobs || []).filter((j) => j.op === "webDownload").slice(0, Math.max(1, lines - 4)).map((j) => <JobRow key={j.id} job={j} />)}</List>
      )}
      <Actions><button type="button" className="link-btn" onClick={() => go("files")}>Dosya Araçları →</button></Actions>
    </div>
  );
}

export function JobsTile({ tier, go, lines }) {
  const jobs = useJobs(tier === "xl" ? 12 : 6);
  if (!ft()) return <State empty="Dosya araçları bu sürümde yok." emptyIcon="alert" />;
  const active = (jobs || []).filter((j) => ACTIVE.has(j.status));
  if (tier === "xs") return <XsButton icon="folder" label="İşler" badge={active.length} onClick={() => go("files")} />;
  if (tier === "s") {
    const top = active[0] || (jobs || [])[0];
    return <Big value={active.length} label={active.length ? "iş sürüyor" : "süren iş yok"} sub={top ? `${top.label}${ACTIVE.has(top.status) && !top.indeterminate ? ` · %${Math.round((top.progress || 0) * 100)}` : ""}` : "Dosya Araçları"} onClick={() => go("files")} />;
  }
  return (
    <State need={false} empty={jobs && !jobs.length ? "Henüz dosya işi yok. İndirme ve dönüştürmeler burada görünür." : null} emptyIcon="folder">
      <List className="dt-jobs">{(jobs || []).slice(0, Math.max(2, lines)).map((j) => <JobRow key={j.id} job={j} />)}</List>
    </State>
  );
}

/* ------------------------------ hızlı görev ------------------------------ */

export function QuickTodoTile({ tier, go, bar, lines, result }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const todos = useData("/api/todos", { view: "mine", status: "active" }, { enabled: tier === "l" || tier === "xl" });
  const parsed = parseQuickTask(text);
  if (tier === "xs") return <XsButton icon="checkSquare" label="Görev" title="Yeni görev (hızlı kayıt)" onClick={() => window.elitlig.quick.show("task")} />;
  const add = async (e) => {
    e.preventDefault();
    if (!parsed.title || busy) return;
    setBusy(true);
    const res = await post("/api/todos", { kind: parsed.dueAt ? "reminder" : "task", title: parsed.title, due_at: parsed.dueAt, priority: parsed.priority }, { tempId: tempId() });
    setBusy(false);
    if (result(res, "Görev eklendi.")) { setText(""); refreshData("/api/todos"); window.dispatchEvent(new Event("elitlig:todos-changed")); }
  };
  const form = (
    <form className={`dt-inline${bar ? " is-bar" : ""}`} onSubmit={add}>
      <Icon name="plus" size={14} className="dt-inline__icon" />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Görev ekle — örn. “yarın 14:00 sahayı ara !”" aria-label="Hızlı görev" />
      {parsed.dueAt && <span className="pill">{relativeDay(parsed.dueAt)} {formatTime(parsed.dueAt)}</span>}
      {parsed.priority === "high" && <span className="pill pill--red">Önemli</span>}
      {!bar && <button type="submit" className="btn btn--primary btn--xs" disabled={!parsed.title || busy}>Ekle</button>}
    </form>
  );
  if (bar || tier === "s" || tier === "m") return <div className="dt-stack">{form}{!bar && <p className="dt-hint">“bugün / yarın / cuma”, “14:30” ve “!” anlaşılır.</p>}</div>;
  const items = (todos.data?.items || []).filter((t) => t.status !== "done").slice(0, Math.max(2, lines - 2));
  return (
    <div className="dt-stack">
      {form}
      <State q={todos}>
        <List>{items.map((t) => <Row key={t.id} icon={t.priority === "high" ? "flag" : "circle"} title={t.title} right={t.dueAt ? relativeDay(t.dueAt) : ""} onClick={() => go(`todos:${t.id}`)} />)}</List>
      </State>
    </div>
  );
}

/* ------------------------------ hızlı not ------------------------------ */

export function QuickNoteTile({ tier, go, lines, result }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const overview = useData("/api/tools/overview", null, { enabled: tier === "l" || tier === "xl" });
  if (tier === "xs") return <XsButton icon="note" label="Not" title="Yeni not (hızlı kayıt)" onClick={() => window.elitlig.quick.show("note")} />;
  const save = async (e) => {
    e?.preventDefault();
    const t = title.trim(), b = body.trim();
    if ((!t && !b) || busy) return;
    setBusy(true);
    const [first, ...rest] = (t ? `${t}\n${b}` : b).split(/\n/);
    const res = await post("/api/tools/notes", { title: first.slice(0, 120), body: rest.join("\n") }, { tempId: tempId() });
    setBusy(false);
    if (result(res, "Not kaydedildi.")) { setTitle(""); setBody(""); refreshData("/api/tools"); }
  };
  return (
    <form className="dt-stack dt-noteform" onSubmit={save}>
      {tier !== "s" && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık" aria-label="Not başlığı" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tier === "s" ? "Not yazın… (⌘↵ kaydet)" : "Not metni"} aria-label="Not metni"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(e); }} />
      <Actions>
        <button type="submit" className="btn btn--primary btn--xs" disabled={busy || (!title.trim() && !body.trim())}>Kaydet</button>
        {tier !== "s" && <button type="button" className="link-btn" onClick={() => go("notes")}>Not Defteri →</button>}
      </Actions>
      {(tier === "l" || tier === "xl") && overview.data?.notes?.length > 0 && (
        <List>{overview.data.notes.slice(0, Math.max(1, lines - 6)).map((n) => <Row key={n.id} icon={n.pinned ? "pin" : "note"} title={n.title || String(n.body || "Not").slice(0, 50)} onClick={() => go(`notes:${n.id}`)} />)}</List>
      )}
    </form>
  );
}

/* ------------------------------ hızlı gelir / gider ------------------------------ */

export function QuickLedgerTile({ tier, go, lines, result, bar }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("paid");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useNote();
  const big = tier === "l" || tier === "xl";
  const accounts = useData("/api/finance/accounts", null, { enabled: tier !== "xs" && tier !== "s" && !bar });
  const recent = useData("/api/tools/ledger", null, { enabled: big });
  if (tier === "xs") return <XsButton icon="receipt" label="Gider" title="Yeni gider (hızlı kayıt)" onClick={() => window.elitlig.quick.show("expense")} />;
  const save = async (e) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!(value > 0)) { setNote({ tone: "red", text: "Tutarı yazın." }); return; }
    setBusy(true);
    const body = { type, amount: value, description: desc.trim() || null, category: category || null, entry_date: isoDay(), status, method: "cash", vat_rate: 0, ...(account ? { account_id: Number(account) } : {}) };
    const res = await post("/api/tools/ledger", body, { tempId: tempId() });
    setBusy(false);
    if (result(res)) {
      setNote({ tone: "green", text: `${type === "income" ? "Gelir" : "Gider"} kaydedildi: ${formatMoney(value, 0)}${res.queued ? " (çevrimdışı, sırada)" : ""}` });
      setAmount(""); setDesc("");
      refreshData("/api/tools"); refreshData("/api/finance");
    }
  };
  const accItems = (accounts.data?.items || []).filter((a) => !a.archived);
  const items = (recent.data?.items || []).slice(0, Math.max(2, lines - 7));
  return (
    <div className="dt-stack">
      <form className={`dt-ledgerform${bar ? " is-bar" : ""}`} onSubmit={save}>
        <div className="dt-seg" role="radiogroup" aria-label="Tür">
          <button type="button" role="radio" aria-checked={type === "expense"} className={type === "expense" ? "is-on is-red" : ""} onClick={() => setType("expense")}>Gider</button>
          <button type="button" role="radio" aria-checked={type === "income"} className={type === "income" ? "is-on is-green" : ""} onClick={() => setType("income")}>Gelir</button>
        </div>
        <input className="dt-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tutar ₺" inputMode="decimal" aria-label="Tutar" />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Açıklama" aria-label="Açıklama" />
        {!bar && tier !== "s" && (
          <>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori"><option value="">Kategori</option>{PRESET_CATEGORIES[type].map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum"><option value="paid">{type === "income" ? "Tahsil edildi" : "Ödendi"}</option><option value="pending">{type === "income" ? "Tahsil edilecek" : "Ödenecek"}</option></select>
            {accItems.length > 0 && <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Hesap"><option value="">Hesap yok</option>{accItems.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
          </>
        )}
        <button type="submit" className="btn btn--primary btn--xs" disabled={busy}>{busy ? "…" : "Kaydet"}</button>
      </form>
      <Note note={note} />
      {big && (
        <State q={recent}>
          <List>{items.map((e) => <Row key={e.id} icon={e.type === "income" ? "arrowDown" : "receipt"} title={e.description || e.category || (e.type === "income" ? "Gelir" : "Gider")} sub={`${e.entry_date}${e.status === "pending" ? " · bekliyor" : ""}`} right={`${e.type === "income" ? "+" : "−"}${formatMoney(e.amount, 0)}`} tone={e.type === "income" ? "green" : "red"} onClick={() => go("ledger")} />)}</List>
        </State>
      )}
    </div>
  );
}

/* ------------------------------ yeni proje ------------------------------ */

export function NewProjectTile({ tier, go, lines, result }) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const tpls = useData("/api/tools/projects/templates", null, { enabled: tier === "m" || tier === "l", ttl: 300000 });
  const list = useData("/api/tools/projects", null, { enabled: tier === "l" });
  if (tier === "xs") return <XsButton icon="layers" label="Proje" title="Yeni proje" onClick={() => go("projects:new")} />;
  const create = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const res = await request({ method: "POST", path: "/api/tools/projects", body: { name: name.trim(), ...(template ? { template } : {}) }, queue: false });
    setBusy(false);
    if (result(res, "Proje oluşturuldu.")) { setName(""); refreshData("/api/tools/projects"); const id = res.data?.item?.id; if (id && tier === "s") go("projects", { id }); }
  };
  const templates = tpls.data?.items || tpls.data?.templates || [];
  return (
    <div className="dt-stack">
      <form className="dt-inline" onSubmit={create}>
        <Icon name="layers" size={14} className="dt-inline__icon" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Proje adı" aria-label="Proje adı" />
        <button type="submit" className="btn btn--primary btn--xs" disabled={busy || !name.trim()}>Oluştur</button>
      </form>
      {tier !== "s" && templates.length > 0 && (
        <select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Şablon">
          <option value="">Şablonsuz (boş proje)</option>
          {templates.map((t) => <option key={t.key || t.id} value={t.key || t.id}>{t.name}{t.phase_count ? ` · ${t.phase_count} aşama` : ""}</option>)}
        </select>
      )}
      {tier === "l" && (
        <State q={list}>
          <List>{(list.data?.items || []).slice(0, Math.max(1, lines - 4)).map((p) => <Row key={p.id} color={p.color} title={p.name} sub={p.status_label || p.status} onClick={() => go("projects", { id: p.id })} />)}</List>
        </State>
      )}
      {tier !== "s" && <Actions><button type="button" className="link-btn" onClick={() => go("projects:new")}>Ayrıntılı oluştur →</button></Actions>}
    </div>
  );
}

/* ------------------------------ ekran görüntüsü ------------------------------ */

export function ScreenshotTile({ tier, go, lines }) {
  const shelf = window.elitlig.shelf;
  const [items, setItems] = useState(null);
  const big = tier === "m" || tier === "l";
  useEffect(() => {
    if (!shelf || !big) return undefined;
    const load = () => shelf.list({ kind: "image" }, { limit: 8 }).then((r) => setItems(r?.ok ? r.items : [])).catch(() => setItems([]));
    load();
    return shelf.onChange?.(() => load());
  }, [shelf, big]);
  if (!shelf) return <State empty="Raflar bu sürümde yok." emptyIcon="alert" />;
  const capture = () => shelf.capture();
  if (tier === "xs") return <XsButton icon="camera" label="Yakala" title="Ekran görüntüsü al (⌃⌥A)" onClick={capture} />;
  if (tier === "s") {
    return (
      <div className="dt-stack is-center">
        <button type="button" className="btn btn--primary" onClick={capture}><Icon name="camera" size={14} /> Ekran görüntüsü</button>
        <button type="button" className="link-btn" onClick={() => shelf.show()}>Raflar →</button>
      </div>
    );
  }
  const imgs = (items || []).filter((x) => x.thumbUrl).slice(0, tier === "l" ? Math.max(4, lines * 2) : 4);
  return (
    <div className="dt-stack">
      <Actions>
        <button type="button" className="btn btn--primary btn--xs" onClick={capture}><Icon name="camera" size={12} /> Yakala</button>
        <button type="button" className="btn btn--xs" onClick={() => shelf.show()}><Icon name="clipboard" size={12} /> Raflar</button>
        <button type="button" className="link-btn" onClick={() => go("shelf")}>Kütüphane →</button>
      </Actions>
      {imgs.length ? <div className="dt-thumbs">{imgs.map((x) => <button key={x.id} type="button" onClick={() => shelf.copy([x.id])} title="Panoya kopyala"><img src={x.thumbUrl} alt={x.title || "Ekran görüntüsü"} /></button>)}</div>
        : <p className="dt-hint">{items ? "Henüz ekran görüntüsü yok." : "Yükleniyor…"}</p>}
    </div>
  );
}

/* ------------------------------ hızlı hesap ------------------------------ */

const fmtNum = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("tr-TR", { maximumFractionDigits: 6 }));
export function CalcTile({ tier, go }) {
  const [expr, setExpr] = useState("");
  const [hist, setHist] = useState([]);
  const value = useMemo(() => (expr.trim() ? evaluate(expr) : null), [expr]);
  if (tier === "xs") return <XsButton icon="calculator" label="Hesap" onClick={() => go("calc")} />;
  const commit = (e) => {
    e.preventDefault();
    if (value == null) return;
    setHist((h) => [{ expr, value }, ...h].slice(0, 6));
    setExpr(String(value).replace(".", ","));
  };
  const vat = value != null && tier !== "s" ? [["KDV %20 dahil", value * 1.2], ["KDV %20 hariç", value / 1.2], ["%10 dahil", value * 1.1]] : [];
  return (
    <div className="dt-stack">
      <form className="dt-calc" onSubmit={commit}>
        <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="ör. 1250*3 + 18%" aria-label="Hesap ifadesi" spellCheck={false} />
        <output className={value == null && expr.trim() ? "is-err" : ""} aria-live="polite">= {expr.trim() ? fmtNum(value) : "0"}</output>
      </form>
      {vat.length > 0 && <div className="dt-kv">{vat.map(([k, v]) => <button key={k} type="button" onClick={() => navigator.clipboard?.writeText(String(Math.round(v * 100) / 100))} title="Kopyala"><span>{k}</span><b>{fmtNum(Math.round(v * 100) / 100)}</b></button>)}</div>}
      {tier === "l" && hist.length > 0 && <List>{hist.map((h, n) => <Row key={n} title={h.expr} right={fmtNum(h.value)} onClick={() => setExpr(h.expr)} />)}</List>}
    </div>
  );
}

/* ------------------------------ yeni kayıt düğmesi ------------------------------ */

export function ActionTile({ tier, o }) {
  const id = o.action || "new-task";
  const [, label, icon] = ACTION_CHOICES.find(([k]) => k === id) || ACTION_CHOICES[0];
  const run = () => window.elitlig.launcher.action(id);
  const short = label.replace(/^Yeni /, "");
  if (tier === "xs") return <XsButton icon={icon} label={short.charAt(0).toLocaleUpperCase("tr-TR") + short.slice(1)} title={label} onClick={run} />;
  if (tier === "s") return <XsButton icon={icon} label={label} wide onClick={run} />;
  return (
    <div className="dt-actiongrid">
      {ACTION_CHOICES.map(([k, l, ic]) => <button key={k} type="button" className={k === id ? "is-main" : ""} onClick={() => window.elitlig.launcher.action(k)}><Icon name={ic} size={15} /><span>{l}</span></button>)}
    </div>
  );
}

/* ------------------------------ geri sayım ------------------------------ */

export function CountdownTile({ tier, o, openSettings }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const target = o.date ? new Date(`${o.date}T00:00:00`) : null;
  if (!target || Number.isNaN(target.getTime())) {
    return tier === "xs" ? <XsButton icon="flag" label="Tarih seç" onClick={openSettings} /> : <div className="dt-empty"><Icon name="flag" size={18} /><span>Geri sayım için tarih seçin.</span><button type="button" className="btn btn--xs" onClick={openSettings}>Ayarla</button></div>;
  }
  const days = Math.ceil((target - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const label = days > 0 ? "gün kaldı" : days === 0 ? "bugün!" : "gün geçti";
  if (tier === "xs") return <XsButton icon="flag" value={Math.abs(days)} label={o.label || "gün"} tone={days <= 3 && days >= 0 ? "red" : ""} onClick={openSettings} />;
  const weeks = Math.floor(Math.abs(days) / 7);
  return <Big value={Math.abs(days)} label={`${o.label || "Hedef"} · ${label}`} sub={`${target.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: tier === "m" ? "long" : undefined })}${tier === "m" && weeks ? ` · ${weeks} hafta` : ""}`} tone={days <= 3 && days >= 0 ? "red" : ""} />;
}
