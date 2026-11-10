// İş aracı widget'ları: Yapılacaklar (süzgeçli), Projeler, Muhasebe, Ekipman, Bugün özeti, Rehber,
// Sabit notlar, Hızlı kayıt. Veriler masaüstü uygulamasının API köprüsünden (çevrimdışı önbellek ve
// giden kutusu kuralları geçerli: app/api.js).
import React, { useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { greeting, groupTodos, includesTr, prettyPhone, waNumber } from "../../lib/helpers";
import { Avatar, Chips, W, dayStart, dueLabel, fetchData, gate, money, openApp, shortMoney, useDataChanged, usePoll, useSignedIn } from "../common";
import { activeProjects, filterTodos, projectDigest, quickRecord, todoCounts, upcomingPayments } from "../widgetModel";

const timeOf = (iso) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** Bir işi tamamlandı işaretle (iyimser) — Yapılacaklar ve Bugün özeti. */
function useTodoCheck(reload) {
  const [done, setDone] = useState(() => new Set());
  const check = async (t) => {
    setDone((s) => new Set(s).add(t.id));
    const res = await W().request({ method: "PATCH", path: `/api/todos/${t.id}`, body: { status: "done" } });
    if (!res.ok) setDone((s) => { const n = new Set(s); n.delete(t.id); return n; });
    setTimeout(() => reload(), 700);
  };
  return [done, check];
}

function TodoRow({ t, done, onCheck }) {
  return (
    <label className={`wg-todo${done ? " is-done" : ""}${t.late ? " is-late" : ""}`}>
      <input type="checkbox" checked={done} onChange={() => onCheck(t)} aria-label={`${t.title} tamamlandı`} />
      <span className="wg-row__text">{t.title}{t.project?.name ? <i className="wg-tag" style={t.project.color ? { "--tag": t.project.color } : undefined}>{t.project.name}</i> : null}</span>
      {t.dueAt && <small>{t.late ? "gecikti" : new Date(t.dueAt).toDateString() === new Date().toDateString() ? timeOf(t.dueAt) : new Date(t.dueAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</small>}
    </label>
  );
}

/* ------------------------------ yapılacaklar ------------------------------ */

export function TodosWidget({ item, size, settings, update, closeSettings }) {
  const signed = useSignedIn();
  const [title, setTitle] = useState("");
  const filter = item.options.filter || "today";
  const project = item.options.project || null;
  const q = usePoll(async () => {
    if (!signed) return null;
    const [list, projects] = await Promise.all([
      fetchData("/api/todos", { view: "mine", status: "active" }, "İşler alınamadı."),
      W().request({ path: "/api/todos/projects" }),
    ]);
    return { items: list?.items || [], projects: projects.ok ? projects.data?.items || [] : [] };
  }, 3 * 60000, [signed]);
  const [done, check] = useTodoCheck(q.reload);
  useDataChanged("/todos", q.reload);
  if (settings) {
    return (
      <div className="wg-settings">
        <label>Proje süzgeci
          <select value={project || ""} onChange={(e) => update({ options: { project: e.target.value ? Number(e.target.value) : null } })} aria-label="Proje">
            <option value="">Tüm işler</option>
            {(q.data?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button type="button" className="wg-btn" onClick={closeSettings}>Tamam</button>
      </div>
    );
  }
  const g = gate(signed, q);
  if (g) return g;
  const list = filterTodos(q.data.items, { filter, project });
  const counts = todoCounts(q.data.items, project);
  const max = size === "medium" ? 8 : 4;
  const projName = project ? q.data.projects.find((p) => Number(p.id) === Number(project))?.name : null;
  const add = async (e) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    const end = new Date();
    end.setHours(23, 59, 0, 0);
    setTitle("");
    await W().request({ method: "POST", path: "/api/todos", body: { kind: "task", title: v, due_at: filter === "all" || filter === "upcoming" ? null : end.toISOString(), ...(project ? { project_id: project } : {}) } });
    q.reload();
  };
  return (
    <div className="wg-list">
      <Chips label="Süzgeç" value={filter} onChange={(v) => update({ options: { filter: v } })}
        options={[["today", "Bugün", counts.today], ["overdue", "Geciken", counts.overdue], ["upcoming", "Yaklaşan"], ["all", "Tümü"]]} />
      {projName && <button type="button" className="wg-pill" onClick={() => update({ options: { project: null } })} title="Proje süzgecini kaldır"><Icon name="layers" size={10} /> {projName} <Icon name="x" size={10} /></button>}
      {list.length ? list.slice(0, max).map((t) => <TodoRow key={t.id} t={t} done={done.has(t.id)} onCheck={check} />)
        : <p className="wg-muted">{filter === "overdue" ? "Geciken iş yok ✓" : filter === "today" ? "Bugün için iş yok 🎉" : "İş yok."}</p>}
      {list.length > max && <button type="button" className="wg-link" onClick={() => openApp("todos")}>+{list.length - max} iş daha</button>}
      <form className="wg-add" onSubmit={add}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={filter === "all" || filter === "upcoming" ? "İş ekle…" : "Bugüne iş ekle…"} aria-label="Yeni iş" /></form>
    </div>
  );
}

/* ------------------------------ projeler ------------------------------ */

export function ProjectsWidget({ size }) {
  const signed = useSignedIn();
  const max = size === "medium" ? 4 : 2;
  const q = usePoll(async () => {
    if (!signed) return null;
    const list = activeProjects((await fetchData("/api/tools/projects", {}, "Projeler alınamadı."))?.items || []);
    const top = list.slice(0, max);
    const details = await Promise.all(top.map((p) => W().request({ path: `/api/tools/projects/${p.id}` })));
    return { total: list.length, items: top.map((p, i) => ({ ...p, digest: details[i]?.ok ? projectDigest(details[i].data) : null })) };
  }, 5 * 60000, [signed, max]);
  useDataChanged("/projects", q.reload);
  const g = gate(signed, q);
  if (g) return g;
  return (
    <div className="wg-list">
      {q.data.items.length ? q.data.items.map((p) => {
        const s = p.stats?.steps || {};
        const d = p.digest;
        const next = d?.upcoming?.[0] || (p.stats?.next_due ? { title: p.stats.next_due.title, due: p.stats.next_due.due_date, overdue: p.stats.next_due.overdue } : null);
        return (
          <button key={p.id} type="button" className="wg-proj" onClick={() => openApp(`projects:${p.id}`)} style={{ "--pc": p.color || "var(--w-accent)" }} data-pid={p.id}>
            <span className="wg-proj__top"><i className="wg-dot" /><b>{p.name}</b><small>%{s.progress ?? 0}</small></span>
            <span className="wg-progress"><i style={{ width: `${s.progress ?? 0}%` }} /></span>
            <span className="wg-proj__meta">
              {d?.phase && <span className="wg-tag" style={d.phase.color ? { "--tag": d.phase.color } : undefined}>Evre {d.phase.index}/{d.phase.total}: {d.phase.name}</span>}
              <small>{s.done ?? 0}/{s.total ?? 0} adım{d?.overdue ? ` · ${d.overdue} gecikmiş` : ""}</small>
            </span>
            {next && <span className={`wg-proj__next${next.overdue ? " is-late" : ""}`}><Icon name="flag" size={10} /> {next.title} · {dueLabel(next.due)}</span>}
            {size === "medium" && d?.upcoming?.slice(1, 3).map((u) => <span key={u.id} className={`wg-proj__next${u.overdue ? " is-late" : ""}`}><Icon name="circle" size={8} /> {u.title} · {dueLabel(u.due)}</span>)}
          </button>
        );
      }) : <p className="wg-muted">Aktif proje yok.</p>}
      <div className="wg-bar">
        {q.data.total > q.data.items.length && <button type="button" className="wg-link" onClick={() => openApp("projects")}>+{q.data.total - q.data.items.length} proje</button>}
        <span className="wg__grow" />
        <button type="button" className="wg-btn is-ghost" onClick={() => openApp("projects:new")}><Icon name="plus" size={11} /> Proje</button>
      </div>
    </div>
  );
}

/* ------------------------------ muhasebe ------------------------------ */

export function LedgerWidget({ size }) {
  const signed = useSignedIn();
  const q = usePoll(async () => {
    if (!signed) return null;
    const [ov, rec] = await Promise.all([fetchData("/api/tools/overview", {}, "Muhasebe özeti alınamadı."), W().request({ path: "/api/tools/recurring" })]);
    return { ledger: ov?.ledger || {}, bills: ov?.recurring || null, payments: rec.ok ? upcomingPayments(rec.data, { days: 30, limit: size === "medium" ? 4 : 2 }) : [] };
  }, 5 * 60000, [signed, size]);
  useDataChanged(["/ledger", "/recurring", "/finance"], q.reload);
  const g = gate(signed, q);
  if (g) return g;
  const l = q.data.ledger;
  const month = new Date().toLocaleDateString("tr-TR", { month: "long" });
  return (
    <div className="wg-ledger">
      <div className="wg-kpis">
        <button type="button" className="wg-kpi is-green" onClick={() => openApp("ledger")}><small>Gelir · {month}</small><b data-testid="income">{shortMoney(l.income)}</b></button>
        <button type="button" className="wg-kpi is-red" onClick={() => openApp("ledger")}><small>Gider</small><b data-testid="expense">{shortMoney(l.expense)}</b></button>
        <button type="button" className={`wg-kpi${Number(l.net) < 0 ? " is-red" : ""}`} onClick={() => openApp("ledger")}><small>Net</small><b data-testid="net">{shortMoney(l.net)}</b></button>
      </div>
      <div className="wg-ledger__open">
        <span><small>Bekleyen alacak</small><b className="is-green">{money(l.receivable)}</b></span>
        <span><small>Bekleyen borç</small><b className="is-red">{money(l.payable)}</b></span>
        {l.overdue ? <span><small>Vadesi geçen</small><b className="is-red">{money(l.overdue)}</b></span> : null}
      </div>
      {q.data.payments.length > 0 && (
        <section><h5>Yaklaşan düzenli ödemeler</h5>
          {q.data.payments.map((p) => (
            <button key={p.key} type="button" className={`wg-row${p.late ? " is-late" : ""}`} onClick={() => openApp("ledger:duzenli")}>
              <span className="wg-row__time">{dueLabel(p.due)}</span><span className="wg-row__text">{p.name}</span><b className="wg-num">{money(p.amount)}</b>
            </button>
          ))}
        </section>
      )}
      <div className="wg-bar">
        <button type="button" className="wg-btn" onClick={() => W().quick.show("expense")}><Icon name="plus" size={11} /> Gider</button>
        <button type="button" className="wg-btn is-ghost" onClick={() => openApp("ledger:new")}>Gelir / gider</button>
        <button type="button" className="wg-btn is-ghost" onClick={() => openApp("ledger:duzenli")}>Düzenli</button>
      </div>
    </div>
  );
}

/* ------------------------------ ekipman ------------------------------ */

export function EquipmentWidget({ size }) {
  const signed = useSignedIn();
  const q = usePoll(async () => {
    if (!signed) return null;
    const [mine, plan] = await Promise.all([W().request({ path: "/api/tools/equipment/mine" }), W().request({ path: "/api/tools/equipment/maintenance", query: { days: 14 } })]);
    if (!mine.ok && [403, 404].includes(mine.error?.status)) return { denied: true };
    if (!mine.ok) throw new Error(mine.error?.message || "Ekipman alınamadı.");
    const open = (mine.data?.items || []).filter((a) => !a.status || a.status === "open");
    return { mine: open.sort((a, b) => Boolean(b.overdue) - Boolean(a.overdue) || String(a.due_at || "9").localeCompare(String(b.due_at || "9"))), maint: plan.ok ? plan.data?.due || [] : [] };
  }, 10 * 60000, [signed]);
  useDataChanged("/equipment", q.reload);
  const g = gate(signed, q);
  if (g) return g;
  if (q.data.denied) return <div className="wg-empty"><Icon name="lock" size={15} /><span>Ekipman görüntüleme yetkiniz yok.</span></div>;
  const late = q.data.mine.filter((a) => a.overdue);
  const max = size === "medium" ? 5 : 3;
  return (
    <div className="wg-list">
      <div className="wg-msgs__sum">
        <button type="button" className="wg-count" onClick={() => openApp("equipment:zimmet")}><b data-testid="mine">{q.data.mine.length}</b><span>zimmetim</span></button>
        {late.length > 0 && <span className="wg-pill is-alert">{late.length} iade gecikti</span>}
        {q.data.maint.length > 0 && <button type="button" className="wg-pill" onClick={() => openApp("equipment:bakim")}><Icon name="wrench" size={10} /> {q.data.maint.length} bakım</button>}
      </div>
      {q.data.mine.slice(0, max).map((a) => (
        <button key={a.id} type="button" className={`wg-row${a.overdue ? " is-late" : ""}`} onClick={() => openApp("equipment", { id: a.item_id })}>
          <span className="wg-row__text">{a.asset_tag ? <i className="wg-tag">{a.asset_tag}</i> : null}{a.item_name}{a.item_tracking === "bulk" ? ` ×${a.quantity}` : ""}</span>
          {a.due_at && <small>{a.overdue ? "gecikti" : `iade ${dueLabel(a.due_at.slice(0, 10))}`}</small>}
        </button>
      ))}
      {!q.data.mine.length && <p className="wg-muted">Üzerinizde zimmetli ekipman yok.</p>}
      {size === "medium" && q.data.maint.slice(0, 3).map((m) => (
        <button key={`m${m.id}`} type="button" className={`wg-row${m.state === "overdue" ? " is-late" : ""}`} onClick={() => openApp("equipment:bakim")}>
          <span className="wg-row__time"><Icon name="wrench" size={10} /></span><span className="wg-row__text">{m.name}</span><small>{m.state === "overdue" ? `${-m.days_left} gün gecikti` : m.days_left === 0 ? "bugün" : `${m.days_left} gün`}</small>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ bugün özeti ------------------------------ */

export function TodayWidget({ size }) {
  const signed = useSignedIn();
  const q = usePoll(async () => {
    if (!signed) return null;
    const now = new Date();
    const [todos, events, rec, me] = await Promise.all([
      fetchData("/api/todos", { view: "mine", status: "active" }, "İşler alınamadı."),
      W().request({ path: "/api/tools/events", query: { from: dayStart(now).toISOString(), to: dayStart(now, 1).toISOString(), todos: "0" } }),
      W().request({ path: "/api/tools/recurring" }),
      W().auth.state(),
    ]);
    const evs = events.ok ? [...(events.data?.items || []), ...(events.data?.projects || []).filter((p) => p.occurrence_start)] : [];
    return { todos: todos?.items || [], events: evs.sort((a, b) => String(a.occurrence_start || a.start_at).localeCompare(String(b.occurrence_start || b.start_at))), pays: rec.ok ? upcomingPayments(rec.data, { days: 3, limit: 3 }) : [], name: me?.user?.fullName || me?.user?.username || "" };
  }, 5 * 60000, [signed]);
  const [done, check] = useTodoCheck(q.reload);
  useDataChanged(["/todos", "/events", "/recurring"], q.reload);
  const g = gate(signed, q);
  if (g) return g;
  const grp = groupTodos(q.data.todos, new Date());
  const work = [...grp.overdue.map((t) => ({ ...t, late: true })), ...grp.today];
  const maxT = size === "medium" ? 5 : 3;
  const maxE = size === "medium" ? 4 : 2;
  const now = new Date();
  return (
    <div className="wg-list wg-today">
      <p className="wg-today__hi">{greeting(now.getHours())}{q.data.name ? `, ${q.data.name.split(" ")[0]}` : ""} · <small>{now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</small></p>
      <section><h5><Icon name="checkSquare" size={10} /> İşler <em>{work.length}</em>{grp.overdue.length ? <em className="is-alert">{grp.overdue.length} gecikmiş</em> : null}</h5>
        {work.length ? work.slice(0, maxT).map((t) => <TodoRow key={t.id} t={t} done={done.has(t.id)} onCheck={check} />) : <p className="wg-muted">Bugün için iş yok 🎉</p>}
      </section>
      <section><h5><Icon name="calendar" size={10} /> Etkinlikler <em>{q.data.events.length}</em></h5>
        {q.data.events.length ? q.data.events.slice(0, maxE).map((e) => (
          <button key={`${e.id}-${e.occurrence_start || e.start_at}`} type="button" className="wg-row" onClick={() => openApp("agenda")}>
            <span className="wg-row__time">{e.all_day ? "Gün boyu" : timeOf(e.occurrence_start || e.start_at)}</span><span className="wg-row__text">{e.title}</span>
          </button>
        )) : <p className="wg-muted">Plan yok</p>}
      </section>
      {q.data.pays.length > 0 && (
        <section><h5><Icon name="wallet" size={10} /> Ödemeler</h5>
          {q.data.pays.map((p) => (
            <button key={p.key} type="button" className={`wg-row${p.late ? " is-late" : ""}`} onClick={() => openApp("ledger:duzenli")}>
              <span className="wg-row__time">{dueLabel(p.due)}</span><span className="wg-row__text">{p.name}</span><b className="wg-num">{money(p.amount)}</b>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

/* ------------------------------ rehber ------------------------------ */

export function ContactsWidget({ size }) {
  const signed = useSignedIn();
  const [term, setTerm] = useState("");
  const q = usePoll(async () => (signed ? (await fetchData("/api/tools/contacts", {}, "Rehber alınamadı."))?.items || [] : null), 15 * 60000, [signed]);
  useDataChanged("/contacts", q.reload);
  const list = useMemo(() => {
    const all = q.data || [];
    if (term.trim()) return all.filter((c) => includesTr(`${c.name} ${c.company || ""} ${c.phone || ""} ${c.email || ""}`, term));
    const fav = all.filter((c) => c.favorite);
    return fav.length ? fav : all;
  }, [q.data, term]);
  const g = gate(signed, q);
  if (g) return g;
  const ext = (url) => W().app.openExternal(url);
  const max = size === "medium" ? 6 : 3;
  return (
    <div className="wg-list">
      <input className="wg-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Kişi ara…" aria-label="Kişi ara" />
      {!term && <h5>{(q.data || []).some((c) => c.favorite) ? "Favoriler" : "Kişiler"}</h5>}
      {list.slice(0, max).map((c) => (
        <div key={c.id} className="wg-contact">
          <button type="button" className="wg-contact__main" onClick={() => openApp(`contacts:${c.id}`)} title="Rehberde aç">
            <Avatar name={c.name} id={c.id} size={26} />
            <span className="wg-chat__text"><b>{c.name}</b><small>{c.company || prettyPhone(c.phone) || c.email || ""}</small></span>
          </button>
          {c.phone && <button type="button" className="wg-ib is-sm" onClick={() => ext(`tel:${String(c.phone).replace(/\s/g, "")}`)} aria-label={`${c.name} ara`} title="Ara"><Icon name="phone" size={12} /></button>}
          {c.phone && <button type="button" className="wg-ib is-sm is-wa" onClick={() => ext(`https://wa.me/${waNumber(c.phone)}`)} aria-label={`${c.name} WhatsApp`} title="WhatsApp"><Icon name="message" size={12} /></button>}
          {size === "medium" && c.email && <button type="button" className="wg-ib is-sm" onClick={() => ext(`mailto:${c.email}`)} aria-label={`${c.name} e-posta`} title="E-posta"><Icon name="mail" size={12} /></button>}
        </div>
      ))}
      {!list.length && <p className="wg-muted">{term ? "Bulunamadı." : "Rehber boş."}</p>}
      {list.length > max && <button type="button" className="wg-link" onClick={() => openApp("contacts")}>+{list.length - max} kişi</button>}
    </div>
  );
}

/* ------------------------------ sabit notlar ------------------------------ */

const stripMd = (s) => String(s || "").replace(/[#*_`>[\]-]+/g, " ").replace(/\s+/g, " ").trim();
export function PinnedNotesWidget({ size }) {
  const signed = useSignedIn();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  const q = usePoll(async () => {
    if (!signed) return null;
    const items = (await fetchData("/api/tools/notes", { view: "all" }, "Notlar alınamadı."))?.items || [];
    const sorted = items.filter((n) => !n.archived && !n.deleted_at).sort((a, b) => Boolean(b.pinned) - Boolean(a.pinned) || String(b.updatedAt || b.updated_at || "").localeCompare(String(a.updatedAt || a.updated_at || "")));
    return { pinned: sorted.filter((n) => n.pinned), recent: sorted.filter((n) => !n.pinned) };
  }, 5 * 60000, [signed]);
  useDataChanged("/notes", q.reload);
  const g = gate(signed, q);
  if (g) return g;
  const max = size === "medium" ? 5 : 3;
  const list = q.data.pinned.length ? q.data.pinned : q.data.recent;
  const save = async (e) => {
    e.preventDefault();
    const r = quickRecord("note", text);
    if (r.error) return;
    setText("");
    const res = await W().request({ method: "POST", path: r.path, body: r.body });
    setMsg(res.ok ? (res.queued ? "Çevrimdışı kaydedildi." : "Not eklendi ✓") : res.error?.message || "Kaydedilemedi.");
    setTimeout(() => setMsg(null), 3000);
    q.reload();
  };
  return (
    <div className="wg-list">
      {!q.data.pinned.length && list.length > 0 && <h5>Son notlar (sabit not yok)</h5>}
      {list.slice(0, max).map((n) => (
        <button key={n.id} type="button" className="wg-noteitem" onClick={() => openApp(`notes:${n.id}`)} style={n.color ? { "--nc": n.color } : undefined}>
          <b>{n.pinned && <Icon name="pin" size={10} />} {n.title || stripMd(n.body).slice(0, 40) || "Not"}</b>
          {size === "medium" && n.body && <small>{stripMd(n.body).slice(0, 90)}</small>}
        </button>
      ))}
      {!list.length && <p className="wg-muted">Henüz not yok.</p>}
      <form className="wg-add" onSubmit={save}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Hızlı not yaz, ↵ kaydet…" aria-label="Hızlı not" /></form>
      {msg && <p className="wg-note-line" role="status">{msg}</p>}
    </div>
  );
}

/* ------------------------------ hızlı kayıt ------------------------------ */

const KINDS = [["task", "Görev", "checkSquare"], ["note", "Not", "note"], ["expense", "Gider", "receipt"]];
const PH = { task: "yarın 14:00 sahayı ara !", note: "Not başlığı…", expense: "250 kırtasiye" };
export function QuickAddWidget({ size }) {
  const signed = useSignedIn();
  const [kind, setKind] = useState("task");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (signed === false) return gate(false, {});
  const r = text.trim() ? quickRecord(kind, text) : null;
  const save = async (e) => {
    e.preventDefault();
    if (!r || r.error || busy) { if (r?.error) setMsg({ tone: "red", text: r.error }); return; }
    setBusy(true);
    const res = await W().request({ method: "POST", path: r.path, body: r.body });
    setBusy(false);
    if (res.ok) { setText(""); setMsg({ tone: "green", text: res.queued ? `${r.label}: çevrimdışı kaydedildi, sonra eşitlenecek.` : `${r.label} kaydedildi ✓` }); }
    else setMsg({ tone: "red", text: res.error?.message || "Kaydedilemedi." });
    setTimeout(() => setMsg(null), 3500);
  };
  return (
    <form className="wg-quick" onSubmit={save}>
      <div className="wg-seg" role="radiogroup" aria-label="Kayıt türü">
        {KINDS.map(([v, l, ic]) => <button key={v} type="button" role="radio" aria-checked={kind === v} className={kind === v ? "is-on" : ""} onClick={() => setKind(v)}><Icon name={ic} size={11} /> {l}</button>)}
      </div>
      <div className="wg-reply__row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={PH[kind]} aria-label="Hızlı kayıt" />
        <button type="submit" className="wg-ib is-main is-sm" disabled={!text.trim() || busy} aria-label="Kaydet"><Icon name="check" size={12} /></button>
      </div>
      <p className={`wg-note-line is-${msg?.tone || "muted"}`} role="status">{msg ? msg.text : r?.error ? r.error : r?.dueAt ? `Son tarih: ${new Date(r.dueAt).toLocaleString("tr-TR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : kind === "expense" ? "Bugünün tarihiyle, nakit ödendi." : size === "medium" ? "↵ kaydet · uzun not için ⌃⌥N" : " "}</p>
    </form>
  );
}
