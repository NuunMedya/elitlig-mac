// Talepler (⇧⌘T): yönetime gelen onay bekleyen talepler (onay merkezi).
// Profil değişikliği, sahiplenme, yeni üye, transfer, kadro onayı, maç
// talebi, savunma… artık sohbete mesaj olarak düşmez; burada kategori
// sekmeleriyle listelenir (/api/admin/requests). Karttaki düğmeler sunucunun
// verdiği eylemlerdir: API eylemi onay penceresinden sonra çağrılır ve talep
// sunucuda kendiliğinden kapanır (liste yeniden okunur); site eylemi ilgili
// sayfayı tarayıcıda açar. "Kapat" talebi elle sonuçlandırır.
// Yeni / sonuçlanan talep socket'ten ("admin:requests") gelir.
// "İncele" sağda karar panelini açar (DecisionPanel: talep eden, oyuncu,
// takım, kurallar, Uyarılar, etki, zaman çizelgesi, gerekçeli onay / ret).
// Satırlarda uyarı / engel özeti (/insights); süzgeç, sıralama, toplu işlem
// (toplu onay yalnız engelsiz taleplere, toplu ret tek gerekçeyle).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, OfflineNote, Segmented, Spinner, ViewHeader, useConfirm, useToast } from "../../components/ui";
import { request, useCommand, useDebounced, useResource } from "../../api";
import ExportButton from "../../components/ExportButton";
import { requestsReport } from "../../lib/export/reports";
import {
  REQUEST_STATUSES, actionResultText, actorTarget, categoryIcon, categoryTabs, dismissBody, groupRequestsByDay, requestTime, splitActions,
} from "../../lib/requestUtils";
import DecisionPanel from "./DecisionPanel";
import { INSIGHT_FILTERS, SORTS, VERDICTS, arrangeRequests, bulkApprovable, bulkRejectable, daysSince, decisionRequest, splitDecision } from "../../lib/requestDecision";
import "./requests.css";

const R = "/api/admin/requests";
const PAGE = 50;

export default function Requests({ arg, go }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [category, setCategory] = useState(() => (typeof arg === "string" ? arg : ""));
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(null);
  const query = useDebounced(q, 300);
  const [summary, setSummary] = useState(null);
  const [inspect, setInspect] = useState(() => (arg && typeof arg === "object" && arg.requestId ? String(arg.requestId) : ""));
  const [insights, setInsights] = useState({});
  const [verdict, setVerdict] = useState("");
  const [sort, setSort] = useState("newest");
  const [picked, setPicked] = useState(() => new Set());
  const [bulkNote, setBulkNote] = useState("");
  const list = useResource(R, { category: category || undefined, status, q: query.trim() || undefined, limit });
  const items = list.data?.items || [];

  useEffect(() => { if (typeof arg === "string") setCategory(arg); else if (arg?.requestId) setInspect(String(arg.requestId)); }, [arg]);
  useEffect(() => { setLimit(PAGE); setPicked(new Set()); }, [category, status, query]);
  // Satır özetleri: açık taleplerin uyarı / engel sayıları (henüz alınmamışlar).
  useEffect(() => {
    const ids = items.filter((i) => i.status === "open" && !(i.id in insights)).map((i) => i.id).slice(0, 50);
    if (!ids.length) return undefined;
    let alive = true;
    request({ path: "/api/admin/requests/insights", query: { ids: ids.join(",") }, cache: false, queue: false }).then((res) => { if (alive && res?.ok && res.data?.items) setInsights((m) => ({ ...m, ...res.data.items })); });
    return () => { alive = false; };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!inspect) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal")) setInspect(""); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspect]);
  useEffect(() => {
    window.elitlig.requests.summary().then(setSummary);
    window.elitlig.requests.refresh().then(setSummary);
    return window.elitlig.requests.onSummary(setSummary);
  }, []);
  const reload = useCallback(() => { list.reload({ quiet: true }); window.elitlig.requests.refresh().then(setSummary); }, [list.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  // Gerçek zaman: yeni ya da sonuçlanan talep.
  useEffect(() => window.elitlig.requests.onChange(() => list.reload({ quiet: true })), [list.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useCommand("refresh", reload);
  useCommand("find", () => document.querySelector(".rq-search input")?.focus());

  const tabs = useMemo(() => categoryTabs(summary, category), [summary, category]);
  const denied = list.error?.status === 403;

  const runAction = async (item, entry) => {
    const { action, plan } = entry;
    if (plan.kind === "web") { window.elitlig.app.openWeb(plan.path); return; }
    if (!(await confirm({ ...plan.confirm }))) return;
    setBusy(`${item.id}:${action.key}`);
    const res = await request({ method: plan.method, path: plan.path, body: plan.body, queue: false, cache: false });
    setBusy(null);
    if (res.ok) {
      toast(actionResultText(action, res), { tone: "success" });
      // Talep sunucuda kendiliğinden kapanır; kart hemen listeden düşer.
      if (status === "open") list.setData((d) => (d ? { ...d, items: d.items.filter((r) => r.id !== item.id), total: Math.max(0, (d.total || 1) - 1) } : d));
      setTimeout(reload, 350);
    } else toast(res.offline ? "Bu işlem için internet bağlantısı gerekir." : res.error?.message || "İşlem yapılamadı.", { tone: "error", timeout: 6000 });
  };
  const dismiss = async (item) => {
    if (!(await confirm({ title: "Talep kapatılsın mı?", message: `“${item.title || "Talep"}” işlem yapılmadan sonuçlanan taleplere taşınır. Asıl kayıt (başvuru, teklif…) değişmez.`, confirmLabel: "Kapat" }))) return;
    setBusy(`${item.id}:dismiss`);
    const res = await request({ method: "POST", path: `${R}/${item.id}/dismiss`, body: dismissBody("Kapatıldı"), queue: false, cache: false });
    setBusy(null);
    if (res.ok) {
      toast("Talep kapatıldı.", { tone: "success" });
      list.setData((d) => (d ? { ...d, items: d.items.filter((r) => r.id !== item.id) } : d));
      setTimeout(reload, 300);
    } else toast(res.error?.message || "Kapatılamadı.", { tone: "error" });
  };
  const dropItem = (id) => {
    list.setData((d) => (d ? { ...d, items: d.items.filter((r) => r.id !== id), total: Math.max(0, (d.total || 1) - 1) } : d));
    setInsights((m) => { const n = { ...m }; delete n[id]; return n; });
  };
  const onDecided = (req) => { dropItem(req.id); setInspect(""); setTimeout(reload, 350); };
  const togglePick = (item, on) => setPicked((set) => { const n = new Set(set); if (on) n.add(item.id); else n.delete(item.id); return n; });
  const runBulk = async (mode) => {
    const chosen = items.filter((i) => picked.has(i.id));
    const targets = mode === "approve" ? bulkApprovable(chosen, insights) : mode === "reject" ? bulkRejectable(chosen) : chosen;
    if (!targets.length) { toast(mode === "approve" ? "Seçilenler arasında toplu onaya uygun (engelsiz, onay düğmeli) talep yok." : "Seçilenler arasında bu işleme uygun talep yok.", { tone: "error" }); return; }
    if (mode === "reject" && !bulkNote.trim()) { toast("Toplu ret için gerekçe yazın; gerekçe her talep sahibine iletilir.", { tone: "error" }); return; }
    const skipped = chosen.length - targets.length;
    const verb = { approve: "onaylansın", reject: "reddedilsin", dismiss: "kapatılsın" }[mode];
    const warned = mode === "approve" ? targets.filter((i) => insights[i.id]?.warn > 0).length : 0;
    if (!(await confirm({ title: "Toplu işlem", message: `${targets.length} talep ${verb} mı?${skipped ? ` (${skipped} talep uygun olmadığı için atlanacak.)` : ""}${warned ? ` ${warned} talepte dikkat uyarısı var; onaylamadan önce “İncele” ile bakabilirsiniz.` : ""}${mode === "reject" ? ` Gerekçe: “${bulkNote.trim()}”` : ""}`, confirmLabel: "Uygula", danger: mode !== "approve" }))) return;
    setBusy("bulk");
    let done = 0;
    const failed = [];
    for (const item of targets) {
      const { approve, reject } = splitDecision(item.actions);
      const req = mode === "dismiss" ? { method: "POST", path: `${R}/${item.id}/dismiss`, body: dismissBody("Toplu kapatıldı") } : decisionRequest(mode === "approve" ? approve[0] : reject[0], mode === "reject" ? bulkNote : "");
      // eslint-disable-next-line no-await-in-loop
      const res = await request({ ...req, queue: false, cache: false });
      if (res.ok) { done += 1; dropItem(item.id); } else failed.push(`${item.title || `#${item.id}`}: ${res.error?.message || "hata"}`);
    }
    setBusy(null);
    setPicked(new Set());
    setBulkNote("");
    toast(`${done} talep işlendi.${failed.length ? ` ${failed.length} hata: ${failed[0]}` : ""}`, { tone: failed.length ? "error" : "success", timeout: failed.length ? 7000 : 3500 });
    setTimeout(reload, 350);
  };
  const shown = useMemo(() => arrangeRequests(items, insights, { filter: status === "open" ? verdict : "", sort }), [items, insights, verdict, sort, status]);
  const shownGroups = useMemo(() => (sort === "newest" ? groupRequestsByDay(shown) : [{ key: sort, label: SORTS.find(([k]) => k === sort)?.[1] || "", items: shown }]), [shown, sort]);

  const openActor = (item) => {
    const t = actorTarget(item);
    if (!t) return;
    if (t.kind === "team") go("contacts", { tab: "teams", teamId: t.teamId });
    else window.elitlig.app.openWeb(t.path);
  };

  const total = summary?.total ?? null;
  return (
    <div className="view view--requests" data-tool="requests">
      <ViewHeader icon="inbox" title="Talepler" subtitle={total == null ? "Yönetime gelen onay bekleyen talepler" : total ? `${total} talep onay bekliyor · takım ve üyelerden gelen başvurular, değişiklikler ve onaylar` : "Onay bekleyen talep yok"}>
        <div className="search-box rq-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Talep ara…" onKeyDown={(e) => e.key === "Escape" && setQ("")} /></div>
        <ExportButton id="requests" title="Talepler" text="" report={() => requestsReport(items, {
          title: `Talepler — ${REQUEST_STATUSES.find(([v]) => v === status)?.[1] || ""}`,
          filters: [tabs.find((t) => t.active)?.label, query.trim() && `"${query.trim()}"`].filter(Boolean),
          statusLabel: (v) => REQUEST_STATUSES.find(([k]) => k === v)?.[1] || v,
          typeLabel: (k) => (summary?.categories || []).find((c) => c.key === k)?.label || tabs.find((t) => t.key === k)?.label || k,
        })} />
        <button type="button" className="btn btn--sm" onClick={reload} title="Yenile (⌘R)"><Icon name="refresh" size={14} /> Yenile</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => window.elitlig.app.openWeb("/yonetim/talepler")} title="Sitede aç"><Icon name="external" size={14} /> Sitede</button>
      </ViewHeader>

      <nav className="rq-tabs" aria-label="Kategoriler">
        {tabs.map((t) => (
          <button key={t.key || "all"} type="button" data-cat={t.key || "all"} className={`rq-tab ${t.active ? "is-active" : ""} ${t.muted ? "is-muted" : ""}`} onClick={() => setCategory(t.key)}>
            <Icon name={t.icon} size={14} /><span>{t.label}</span>{t.open > 0 && <b>{t.open > 99 ? "99+" : t.open}</b>}
          </button>
        ))}
      </nav>

      <div className="rq-bar">
        <Segmented value={status} onChange={setStatus} ariaLabel="Durum" options={REQUEST_STATUSES.map(([value, label]) => ({ value, label, count: value === status && list.data ? list.data.total : undefined }))} />
        {category && tabs.find((t) => t.key === category)?.path && (
          <button type="button" className="link-btn" onClick={() => window.elitlig.app.openWeb(tabs.find((t) => t.key === category).path)}><Icon name="external" size={13} /> İlgili sayfa</button>
        )}
        {status === "open" && (
          <div className="rq-bar2">
            <Segmented value={verdict} onChange={setVerdict} size="sm" ariaLabel="Denetim süzgeci" options={INSIGHT_FILTERS.map(([value, label]) => ({ value, label, count: value ? items.filter((i) => insights[i.id]?.verdict === value).length : undefined }))} />
            <select className="rq-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {items.length > 1 && <button type="button" className="link-btn" onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}>{picked.size === items.length ? "Seçimi kaldır" : "Tümünü seç"}</button>}
          </div>
        )}
      </div>

      {picked.size > 0 && (
        <div className="rq-bulk" data-bulk>
          <strong>{picked.size} talep seçildi</strong>
          <span className="muted">Toplu onaya uygun: {bulkApprovable(items.filter((i) => picked.has(i.id)), insights).length}</span>
          <button type="button" className="btn btn--sm btn--green" data-bulk-action="approve" disabled={busy === "bulk"} onClick={() => runBulk("approve")}><Icon name="checks" size={13} /> Engelsizleri onayla</button>
          <input value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} placeholder="Toplu ret gerekçesi…" />
          <button type="button" className="btn btn--sm btn--red" data-bulk-action="reject" disabled={busy === "bulk"} onClick={() => runBulk("reject")}><Icon name="x" size={13} /> Reddet</button>
          <button type="button" className="btn btn--sm btn--ghost" disabled={busy === "bulk"} onClick={() => runBulk("dismiss")}>Kapat</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPicked(new Set())}>Seçimi temizle</button>
        </div>
      )}

      <OfflineNote offline={list.offline} savedAt={list.savedAt} />
      {!denied && <ErrorNote error={list.error && !list.data ? list.error : null} onRetry={list.reload} />}

      {list.loading && !list.data ? <Spinner /> : denied ? (
        <Empty icon="lock" title="Talepler yönetim hesaplarına açıktır" text="Bu hesabın talepleri görme yetkisi yok." />
      ) : !items.length ? (
        <Empty icon={status === "open" ? "checks" : "inbox"} title={status === "open" ? "Bekleyen talep yok" : status === "info" ? "Bilgilendirme yok" : "Sonuçlanan talep yok"}
          text={status === "open" ? "Takım ve üyelerden yeni bir talep gelince burada ve bildirimde görünür." : q ? `“${q}” ile eşleşen talep yok.` : null} />
      ) : (
        <div className={`rq-split ${inspect ? "has-panel" : ""}`}>
        <div className="rq-list">
          {shownGroups.map((g) => (
            <section key={g.key} className="rq-day">
              <h3 className="rq-day__label">{g.label}</h3>
              {g.items.map((item) => <RequestCard key={item.id} item={item} busy={busy} onAction={runAction} onDismiss={dismiss} onActor={openActor} showCategory={!category} label={(summary?.categories || []).find((c) => c.key === item.category)?.label}
                insight={insights[item.id]} onInspect={() => setInspect(String(item.id))} active={String(item.id) === inspect} picked={picked.has(item.id)} onPick={status === "open" ? togglePick : null} />)}
            </section>
          ))}
          {!shown.length && <Empty icon="filter" title="Süzgeçle eşleşen talep yok" text="Denetim süzgecini “Tümü” yapın." />}
          {list.data?.has_more && <button type="button" className="btn rq-more" onClick={() => setLimit((n) => n + PAGE)}>Daha fazla göster ({items.length} / {list.data.total})</button>}
        </div>
        {inspect && <DecisionPanel key={inspect} id={inspect} onClose={() => setInspect("")} onDecided={onDecided} onOpen={(rid) => setInspect(String(rid))} go={go} />}
        </div>
      )}
    </div>
  );
}

function InsightRow({ item, insight }) {
  const age = daysSince(item.created_at);
  if (!insight) return age != null && age >= 3 && item.status === "open" ? <div className="rq-ins-row"><span className="rq-ins is-warn">{age} gündür bekliyor</span></div> : null;
  const v = VERDICTS[insight.verdict] || VERDICTS.clear;
  return (
    <div className="rq-ins-row" data-insight={insight.verdict}>
      <span className={`rq-ins v-${insight.verdict}`}><Icon name={v.icon} size={11} /> {v.label}</span>
      {insight.fail > 0 && <span className="rq-ins is-fail">{insight.fail} engel</span>}
      {insight.warn > 0 && <span className="rq-ins is-warn">{insight.warn} dikkat</span>}
      {(insight.top || []).map((t) => <span key={t.label} className="rq-ins is-soft">{t.label}</span>)}
      {insight.requester && <span className="rq-ins is-soft"><Icon name="user" size={10} /> {insight.requester.name}{insight.requester.role_label ? ` · ${insight.requester.role_label}` : ""}{insight.requester.verified ? " ✓" : ""}</span>}
      {insight.viewers > 0 && <span className="rq-ins is-soft" title="Karar panelinde bakan yönetici"><Icon name="eye" size={10} /> {insight.viewers}</span>}
    </div>
  );
}

function RequestCard({ item, busy, onAction, onDismiss, onActor, showCategory, label, insight, onInspect, active, picked, onPick }) {
  // Karar panelinin gizlediği düğmeler (ör. dolu saat varken "tüm saatleri onayla") kartta da gösterilmez.
  const omitted = insight?.omit_actions || [];
  const { api, web } = splitActions((item.actions || []).filter((a) => a && !omitted.includes(a.key)));
  const actor = actorTarget(item);
  const open = item.status === "open";
  const info = item.status === "info";
  return (
    <article className={`rq-card rq-card--${item.status} ${active ? "is-picked-active" : ""}`} data-rid={item.id} data-cat={item.category}>
      {onPick && item.status === "open" && <input type="checkbox" className="rq-card__pick" checked={Boolean(picked)} onChange={(e) => onPick(item, e.target.checked)} aria-label="Seç" />}
      <span className={`rq-card__icon rq-cat--${item.category}`}><Icon name={categoryIcon(item.category)} size={18} /></span>
      <div className="rq-card__main">
        <header className="rq-card__head">
          <strong>{item.title || "Talep"}</strong>
          {showCategory && label && <span className="rq-pill">{label}</span>}
          {info && <span className="rq-pill rq-pill--info">Bilgilendirme</span>}
          <time>{requestTime(item.created_at)}</time>
        </header>
        {item.description && <p className="rq-card__desc">{item.description}</p>}
        <InsightRow item={item} insight={insight} />
        <div className="rq-card__meta">
          {actor && <button type="button" className="rq-who" onClick={() => onActor(item)} title={actor.kind === "team" ? "Takım kartını aç" : "Üye kartını sitede aç"}><Icon name={actor.kind === "team" ? "team" : "user"} size={12} /> {actor.label}</button>}
          {item.city && <span><Icon name="map" size={12} /> {item.city}</span>}
          {item.status === "resolved" && <span className="rq-resolved"><Icon name="check" size={12} /> {item.resolved_label || "Sonuçlandı"}{item.resolved_at ? ` · ${requestTime(item.resolved_at)}` : ""}</span>}
        </div>
          <div className="rq-card__actions">
            <button type="button" className="btn btn--sm btn--primary" data-action="inspect" onClick={onInspect}><Icon name="search" size={13} /> İncele</button>
            {item.status !== "resolved" && api.map((e) => (
              <button key={e.action.key} type="button" data-action={e.action.key} className={`btn btn--sm ${e.action.style === "danger" ? "btn--red" : "btn--green"}`} disabled={Boolean(busy)} onClick={() => onAction(item, e)}>
                {busy === `${item.id}:${e.action.key}` ? <span className="spinner__dot" /> : <Icon name={e.action.style === "danger" ? "x" : "check"} size={13} />} {e.action.label}
              </button>
            ))}
            {web.map((e) => (
              <button key={e.action.key} type="button" data-action={e.action.key} className="btn btn--sm" onClick={() => onAction(item, e)} title="Sitede açılır"><Icon name="external" size={13} /> {e.action.label}</button>
            ))}
            {item.path && !web.some((e) => e.plan.path === item.path) && <button type="button" className="link-btn rq-link" onClick={() => window.elitlig.app.openWeb(item.path)}>İlgili sayfa →</button>}
            {(open || info) && <button type="button" className="btn btn--sm btn--ghost rq-dismiss" data-action="dismiss" disabled={Boolean(busy)} onClick={() => onDismiss(item)}>Kapat</button>}
          </div>
      </div>
    </article>
  );
}
