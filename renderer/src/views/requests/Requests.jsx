// Talepler (⇧⌘T): yönetime gelen onay bekleyen talepler (onay merkezi).
// Profil değişikliği, sahiplenme, yeni üye, transfer, kadro onayı, maç
// talebi, savunma… artık sohbete mesaj olarak düşmez; burada kategori
// sekmeleriyle listelenir (/api/admin/requests). Karttaki düğmeler sunucunun
// verdiği eylemlerdir: API eylemi onay penceresinden sonra çağrılır ve talep
// sunucuda kendiliğinden kapanır (liste yeniden okunur); site eylemi ilgili
// sayfayı tarayıcıda açar. "Kapat" talebi elle sonuçlandırır.
// Yeni / sonuçlanan talep socket'ten ("admin:requests") gelir.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, OfflineNote, Segmented, Spinner, ViewHeader, useConfirm, useToast } from "../../components/ui";
import { request, useCommand, useDebounced, useResource } from "../../api";
import ExportButton from "../../components/ExportButton";
import { requestsReport } from "../../lib/export/reports";
import {
  REQUEST_STATUSES, actionResultText, actorTarget, categoryIcon, categoryTabs, dismissBody, groupRequestsByDay, requestTime, splitActions,
} from "../../lib/requestUtils";
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
  const list = useResource(R, { category: category || undefined, status, q: query.trim() || undefined, limit });
  const items = list.data?.items || [];

  useEffect(() => { if (typeof arg === "string") setCategory(arg); }, [arg]);
  useEffect(() => { setLimit(PAGE); }, [category, status, query]);
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
  const groups = useMemo(() => groupRequestsByDay(items), [items]);
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
      </div>

      <OfflineNote offline={list.offline} savedAt={list.savedAt} />
      {!denied && <ErrorNote error={list.error && !list.data ? list.error : null} onRetry={list.reload} />}

      {list.loading && !list.data ? <Spinner /> : denied ? (
        <Empty icon="lock" title="Talepler yönetim hesaplarına açıktır" text="Bu hesabın talepleri görme yetkisi yok." />
      ) : !items.length ? (
        <Empty icon={status === "open" ? "checks" : "inbox"} title={status === "open" ? "Bekleyen talep yok" : status === "info" ? "Bilgilendirme yok" : "Sonuçlanan talep yok"}
          text={status === "open" ? "Takım ve üyelerden yeni bir talep gelince burada ve bildirimde görünür." : q ? `“${q}” ile eşleşen talep yok.` : null} />
      ) : (
        <div className="rq-list">
          {groups.map((g) => (
            <section key={g.key} className="rq-day">
              <h3 className="rq-day__label">{g.label}</h3>
              {g.items.map((item) => <RequestCard key={item.id} item={item} busy={busy} onAction={runAction} onDismiss={dismiss} onActor={openActor} showCategory={!category} label={(summary?.categories || []).find((c) => c.key === item.category)?.label} />)}
            </section>
          ))}
          {list.data?.has_more && <button type="button" className="btn rq-more" onClick={() => setLimit((n) => n + PAGE)}>Daha fazla göster ({items.length} / {list.data.total})</button>}
        </div>
      )}
    </div>
  );
}

function RequestCard({ item, busy, onAction, onDismiss, onActor, showCategory, label }) {
  const { api, web } = splitActions(item.actions);
  const actor = actorTarget(item);
  const open = item.status === "open";
  const info = item.status === "info";
  return (
    <article className={`rq-card rq-card--${item.status}`} data-rid={item.id} data-cat={item.category}>
      <span className={`rq-card__icon rq-cat--${item.category}`}><Icon name={categoryIcon(item.category)} size={18} /></span>
      <div className="rq-card__main">
        <header className="rq-card__head">
          <strong>{item.title || "Talep"}</strong>
          {showCategory && label && <span className="rq-pill">{label}</span>}
          {info && <span className="rq-pill rq-pill--info">Bilgilendirme</span>}
          <time>{requestTime(item.created_at)}</time>
        </header>
        {item.description && <p className="rq-card__desc">{item.description}</p>}
        <div className="rq-card__meta">
          {actor && <button type="button" className="rq-who" onClick={() => onActor(item)} title={actor.kind === "team" ? "Takım kartını aç" : "Üye kartını sitede aç"}><Icon name={actor.kind === "team" ? "team" : "user"} size={12} /> {actor.label}</button>}
          {item.city && <span><Icon name="map" size={12} /> {item.city}</span>}
          {item.status === "resolved" && <span className="rq-resolved"><Icon name="check" size={12} /> {item.resolved_label || "Sonuçlandı"}{item.resolved_at ? ` · ${requestTime(item.resolved_at)}` : ""}</span>}
        </div>
        {(api.length > 0 || web.length > 0 || open || info) && (
          <div className="rq-card__actions">
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
        )}
      </div>
    </article>
  );
}
