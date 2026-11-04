// Bugün: günün özeti. Gecikmiş ve bugünkü işler, önümüzdeki 7 gün, bu ayın
// muhasebe özeti, son notlar ve odak istatistiği tek ekranda.
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Empty, OfflineNote, ErrorNote, Spinner, useResult } from "../components/ui";
import { patch, post, tempId, useResource } from "../api";
import { formatMoney, formatTime, greeting, groupTodos, parseQuickTask, relativeDay, formatDate } from "../lib/helpers";
import { colorOf } from "../lib/agendaUtils";
import { dayKey, dueLabel, formatWhen, groupFollowups } from "../lib/projectUtils";
import { topCategories } from "../lib/requestUtils";

const useClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
};

export default function Today({ go, auth }) {
  const now = useClock();
  const result = useResult();
  const overview = useResource("/api/tools/overview");
  const todos = useResource("/api/todos", { view: "mine", status: "active" });
  const [focus, setFocus] = useState(null);
  const [quick, setQuick] = useState("");

  useEffect(() => {
    window.elitlig.focus.state().then(setFocus);
    return window.elitlig.focus.onState(setFocus);
  }, []);

  const groups = useMemo(() => groupTodos(todos.data?.items || [], now), [todos.data, now]);
  const focusList = [...groups.overdue, ...groups.today];
  const o = overview.data;
  const name = (auth.user?.fullName || auth.user?.username || "").split(" ")[0];

  const toggleDone = async (task) => {
    todos.setData((d) => ({ ...d, items: d.items.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)) }));
    const res = await patch(`/api/todos/${task.id}`, { status: "done" });
    if (!result(res)) todos.reload({ quiet: true });
  };

  const addQuick = async (e) => {
    e.preventDefault();
    const parsed = parseQuickTask(quick);
    if (!parsed.title) return;
    const res = await post("/api/todos", { kind: parsed.dueAt ? "reminder" : "task", title: parsed.title, due_at: parsed.dueAt, priority: parsed.priority }, { tempId: tempId() });
    if (result(res, "Görev eklendi.")) { setQuick(""); todos.reload({ quiet: true }); }
  };

  return (
    <div className="view view--today">
      <header className="hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <span className="eyebrow">{now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <h1>{greeting(now.getHours())}{name ? `, ${name}` : ""} 👋</h1>
          <p>{groups.overdue.length ? `${groups.overdue.length} gecikmiş işin var. ` : "Gecikmiş işin yok. "}Bugün {groups.today.length} iş ve 7 gün içinde {o?.upcoming?.length ?? 0} etkinlik seni bekliyor.</p>
          <div className="hero__stats">
            <button type="button" className="hero__stat" onClick={() => go("todos")}><strong>{groups.overdue.length + groups.today.length}</strong><span>bugünün işi</span></button>
            <button type="button" className="hero__stat" onClick={() => go("agenda")}><strong>{o?.upcoming?.length ?? "–"}</strong><span>yaklaşan etkinlik</span></button>
            <button type="button" className="hero__stat" onClick={() => go("ledger")}><strong>{o?.ledger ? formatMoney(o.ledger.net, 0) : "–"}</strong><span>bu ay net</span></button>
            <button type="button" className="hero__stat" onClick={() => go("focus")}><strong>{focus?.stats?.minutes || 0} dk</strong><span>bugün odak</span></button>
          </div>
        </div>
        <div className="hero__clock">{formatTime(now)}</div>
      </header>
      <nav className="launcher" aria-label="Araçlar">
        {[["todos", "checkSquare", "Yapılacaklar", "Görev, pano, maç masası"], ["agenda", "calendar", "Ajanda", "Takvim ve hatırlatmalar"], ["notes", "note", "Not Defteri", "Notlar ve listeler"], ["projects", "layers", "Projeler", "Süreç, kişiler, portföy"], ["ledger", "wallet", "Muhasebe", "Hesaplar, maç ve Türkiye geneli"], ["sheets", "grid", "Tablolar", "Formüllü tablolar"], ["contacts", "users", "Rehber", "Üyeler ve kişiler"]].map(([key, icon, label, hint]) => (
          <button key={key} type="button" data-tool={key} onClick={() => go(key)}>
            <span className="nav-item__icon"><Icon name={icon} size={15} strokeWidth={2} /></span>
            <strong>{label}</strong><small>{hint}</small>
          </button>
        ))}
      </nav>
      <OfflineNote offline={overview.offline || todos.offline} savedAt={overview.savedAt || todos.savedAt} />
      <ErrorNote error={overview.error && !overview.data ? overview.error : null} onRetry={overview.reload} />

      <form className="quick-add" onSubmit={addQuick}>
        <Icon name="plus" />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Görev ekle — örn. “yarın 14:00 sahayı ara !”" aria-label="Hızlı görev" />
        {quick && parseQuickTask(quick).dueAt && <span className="pill">{relativeDay(parseQuickTask(quick).dueAt)} {formatTime(parseQuickTask(quick).dueAt)}</span>}
      </form>

      <div className="today-grid">
        <section className="card card--span2">
          <header className="card__head">
            <h2 className="card__title"><Icon name="checkSquare" /> Odaktaki işler</h2>
            <button type="button" className="link-btn" onClick={() => go("todos")}>Tümü →</button>
          </header>
          {todos.loading && !todos.data ? <Spinner /> : focusList.length ? (
            <ul className="task-mini">
              {focusList.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button type="button" className="check" onClick={() => toggleDone(t)} aria-label="Tamamla" disabled={!t.permissions?.canChangeStatus} />
                  <button type="button" className="task-mini__title" onClick={() => go(`todos:${t.id}`)}>
                    {t.priority === "high" && <Icon name="flag" size={13} className="text-red" />}
                    {t.title}
                  </button>
                  <span className={`task-mini__due ${t.overdue ? "text-red" : ""}`}>{t.dueAt ? `${relativeDay(t.dueAt)} ${formatTime(t.dueAt)}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="check" title="Bugün için iş yok" text={groups.upcoming.length ? `Yaklaşan ${groups.upcoming.length} iş var.` : "Yukarıdan hızlıca görev ekleyebilirsiniz."} />
          )}
        </section>

        {auth.access?.requests !== false && <RequestsToday go={go} />}
        <ProjectsToday go={go} />

        <section className="card">
          <header className="card__head">
            <h2 className="card__title"><Icon name="calendar" /> Önümüzdeki 7 gün</h2>
            <button type="button" className="link-btn" onClick={() => go("agenda")}>Ajanda →</button>
          </header>
          {o?.upcoming?.length ? (
            <ul className="upcoming">
              {o.upcoming.map((item) => (
                <li key={item.occurrence_key}>
                  <span className="upcoming__bar" style={{ background: colorOf(item) }} />
                  <span className="upcoming__when">{relativeDay(item.occurrence_start)}<small>{item.all_day ? "Tüm gün" : formatTime(item.occurrence_start)}</small></span>
                  <span className="upcoming__title">{item.title}{item.location && <small><Icon name="map" size={11} /> {item.location}</small>}</span>
                </li>
              ))}
            </ul>
          ) : <Empty icon="calendar" title="Takvim boş" text="Maç, toplantı ya da ödeme günlerini ekleyin." />}
        </section>

        <section className="card">
          <header className="card__head">
            <h2 className="card__title"><Icon name="wallet" /> Bu ay</h2>
            <button type="button" className="link-btn" onClick={() => go("ledger")}>Muhasebe →</button>
          </header>
          {o?.ledger ? (
            <div className="stat-grid">
              <div className="stat"><span>Gelir</span><strong className="text-green">{formatMoney(o.ledger.income, 0)}</strong></div>
              <div className="stat"><span>Gider</span><strong className="text-red">{formatMoney(o.ledger.expense, 0)}</strong></div>
              <div className="stat"><span>Net</span><strong className={o.ledger.net >= 0 ? "text-green" : "text-red"}>{formatMoney(o.ledger.net, 0)}</strong></div>
              <div className="stat"><span>Bekleyen alacak</span><strong>{formatMoney(o.ledger.receivable, 0)}</strong></div>
              <div className="stat"><span>Bekleyen borç</span><strong>{formatMoney(o.ledger.payable, 0)}</strong></div>
              <div className="stat"><span>Vadesi geçen</span><strong className={o.ledger.overdue ? "text-red" : ""}>{o.ledger.overdue}</strong></div>
            </div>
          ) : <Spinner />}
        </section>

        <section className="card">
          <header className="card__head">
            <h2 className="card__title"><Icon name="note" /> Son notlar</h2>
            <button type="button" className="link-btn" onClick={() => go("notes")}>Not defteri →</button>
          </header>
          {o?.notes?.length ? (
            <div className="note-mini">
              {o.notes.map((n) => (
                <button key={n.id} type="button" className="note-mini__item" style={n.color ? { "--note": n.color } : undefined} onClick={() => go(`notes:${n.id}`)}>
                  {n.pinned && <Icon name="pin" size={12} />}
                  <strong>{n.title || (n.body || n.checklist?.[0]?.text || "Not").slice(0, 50)}</strong>
                  {n.body && n.title && <span>{n.body.slice(0, 80)}</span>}
                </button>
              ))}
            </div>
          ) : <Empty icon="note" title="Not yok" text="⌃⌥N ile her yerden not alın." />}
        </section>

        <section className="card">
          <header className="card__head">
            <h2 className="card__title"><Icon name="timer" /> Odak</h2>
            <button type="button" className="link-btn" onClick={() => go("focus")}>Sayaç →</button>
          </header>
          <div className="focus-mini">
            <div><strong>{focus?.stats?.sessions || 0}</strong><span>tur bugün</span></div>
            <div><strong>{focus?.stats?.minutes || 0}</strong><span>dakika</span></div>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => window.elitlig.focus.command("toggle")}>
              <Icon name={focus?.running ? "pause" : "play"} size={14} /> {focus?.running ? "Duraklat" : "Başlat"}
            </button>
          </div>
          <p className="muted small">Sayaç pencere kapalıyken de menü çubuğunda çalışır.</p>
        </section>

        <section className="card">
          <header className="card__head"><h2 className="card__title"><Icon name="grid" /> Kayıtlar</h2></header>
          <div className="counts">
            <button type="button" onClick={() => go("notes")}><strong>{o?.counts?.notes ?? "–"}</strong><span>not</span></button>
            <button type="button" onClick={() => go("contacts")}><strong>{o?.counts?.contacts ?? "–"}</strong><span>kişi</span></button>
            <button type="button" onClick={() => go("sheets")}><strong>{o?.counts?.sheets ?? "–"}</strong><span>tablo</span></button>
            <button type="button" onClick={() => go("todos")}><strong>{todos.data?.items?.length ?? "–"}</strong><span>açık iş</span></button>
          </div>
          {groups.upcoming.length > 0 && <p className="muted small">Sıradaki: {groups.upcoming[0].title} · {formatDate(groups.upcoming[0].dueAt)}</p>}
        </section>
      </div>
    </div>
  );
}

/** Bekleyen talepler: toplam ve en kalabalık kategoriler (Talepler'e kısa yol). */
function RequestsToday({ go }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    window.elitlig.requests.summary().then(setSummary);
    return window.elitlig.requests.onSummary(setSummary);
  }, []);
  if (summary?.denied) return null;
  const cats = topCategories(summary, 5);
  const total = Number(summary?.total) || 0;
  return (
    <section className="card today-req" data-tool="requests">
      <header className="card__head">
        <h2 className="card__title"><Icon name="inbox" /> Bekleyen talepler</h2>
        <button type="button" className="link-btn" onClick={() => go("requests")}>Talepler →</button>
      </header>
      {!summary ? <Spinner /> : total ? (<>
        <button type="button" className="today-req__total link-btn" onClick={() => go("requests")}><strong>{total}</strong><span>talep onay bekliyor</span></button>
        <div className="today-req__cats">
          {cats.map((c) => <button key={c.key} type="button" data-cat={c.key} onClick={() => go(`requests:${c.key}`)}><Icon name={c.icon} size={13} /> {c.label} <b>{c.open}</b></button>)}
        </div>
      </>) : <Empty icon="checks" title="Bekleyen talep yok" text="Takım ve üyelerden gelen onay talepleri burada görünür." />}
    </section>
  );
}

/** Projelerde bugün: aranacak kişiler, geciken ve bugün biten adımlar. */
function ProjectsToday({ go }) {
  const res = useResource("/api/tools/projects/followups", { days: 1 });
  const fu = useMemo(() => groupFollowups(res.data), [res.data]);
  if (res.error && !res.data) return null;
  const today = dayKey();
  const leads = [...fu.overdueLeads, ...fu.todayLeads];
  const steps = [...fu.overdueSteps, ...fu.steps.filter((s) => s.due_date && s.due_date <= today)];
  const rows = [
    ...leads.map((l) => ({ key: `l${l.id}`, icon: "phone", title: l.name, sub: `${l.project_name} · ${l.stage_label}${l.next_action ? ` · ${l.next_action}` : ""}`, when: fu.overdueLeads.includes(l) ? "Gecikti" : formatWhen(l.next_action_at).replace("Bugün ", ""), late: fu.overdueLeads.includes(l), color: l.project_color, open: () => go("projects", { id: l.project_id, tab: "leads", lead: l.id }) })),
    ...steps.map((s) => ({ key: `s${s.id}`, icon: "list", title: s.title, sub: s.project_name, when: dueLabel(s.due_date), late: fu.overdueSteps.includes(s), color: s.project_color, open: () => go("projects", { id: s.project_id, tab: "process", step: s.id }) })),
  ];
  return (
    <section className="card today-proj" data-tool="projects">
      <header className="card__head">
        <h2 className="card__title"><Icon name="layers" /> Projelerde bugün</h2>
        <button type="button" className="link-btn" onClick={() => go("projects", { section: "followups" })}>Takip →</button>
      </header>
      {res.loading && !res.data ? <Spinner /> : rows.length ? (<>
        <div className="counts counts--3">
          <button type="button" onClick={() => go("projects", { section: "followups" })}><strong>{leads.length}</strong><span>aranacak</span></button>
          <button type="button" onClick={() => go("projects", { section: "followups" })}><strong className={fu.overdueLeads.length + fu.overdueSteps.length ? "text-red" : ""}>{fu.overdueLeads.length + fu.overdueSteps.length}</strong><span>gecikmiş</span></button>
          <button type="button" onClick={() => go("projects", { section: "followups" })}><strong>{fu.questions.length}</strong><span>açık soru</span></button>
        </div>
        <ul className="task-mini">
          {rows.slice(0, 5).map((r) => (
            <li key={r.key}>
              <span className="upcoming__bar" style={{ background: r.color, alignSelf: "stretch" }} />
              <button type="button" className="task-mini__title" onClick={r.open}><Icon name={r.icon} size={13} className="text-tool" /><span className="today-proj__text"><span>{r.title}</span><small>{r.sub}</small></span></button>
              <span className={`task-mini__due ${r.late ? "text-red" : ""}`}>{r.when}</span>
            </li>
          ))}
        </ul>
        {rows.length > 5 && <p className="muted small">+{rows.length - 5} kayıt daha</p>}
      </>) : <Empty icon="layers" title="Projelerde bugün iş yok" text="Aranacak kişi ya da süresi dolan adım yok." />}
    </section>
  );
}
