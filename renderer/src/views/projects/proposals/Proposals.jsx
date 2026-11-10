// Teklifler sekmesi: numaralı teklifler (durum süzgeci, arama, geçerlilik),
// yeni teklif, şablonla e-posta ve gönderim günlüğü.
import React, { useMemo, useState } from "react";
import { Empty, ErrorNote, Icon, Spinner } from "../../../components/ui";
import { useResource } from "../../../api";
import { formatDate, includesTr } from "../../../lib/helpers";
import { PROPOSAL_STATUS, daysLeft, money } from "../../../lib/salesUtils";
import { StatusPill, salesPath, useSales } from "./salesCommon";
import ProposalEditor from "./ProposalEditor";
import MailComposer from "./MailComposer";
import "./proposals.css";

const OPEN = ["draft", "sent", "viewed", "revision"];
const TRANSPORT = { smtp: "Sunucudan", mailto: "Posta uygulaması", copy: "Kopyalandı" };

function MailLog({ pid, leads }) {
  const res = useResource(`${salesPath(pid)}/mail/log`);
  const items = res.data?.items || [];
  if (res.loading && !res.data) return <Spinner />;
  if (!items.length) return <p className="muted small">Henüz e-posta gönderilmedi.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Tarih</th><th>Alıcı</th><th>Konu</th><th>Yol</th><th>Durum</th></tr></thead>
        <tbody>
          {items.slice(0, 50).map((l) => (
            <tr key={l.id}>
              <td className="small">{new Date(l.created_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</td>
              <td>{l.to_name || leads.find((x) => Number(x.id) === Number(l.lead_id))?.name || "—"} <small className="muted">{l.to_email}</small></td>
              <td>{l.subject}</td>
              <td className="small">{TRANSPORT[l.transport] || l.transport}</td>
              <td>{l.status === "failed" ? <span className="pill pill--red" title={l.error}>Gönderilemedi</span> : <span className="pill pill--green">Gönderildi</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Proposals({ ctx }) {
  const pid = ctx.project.id;
  const res = useSales(pid);
  const sales = res.data;
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [mailing, setMailing] = useState(false);
  const [logKey, setLogKey] = useState(0);
  const list = useMemo(() => sales?.proposals || [], [sales]);
  const shown = useMemo(() => list.filter((p) => (!status || (status === "open" ? OPEN.includes(p.status) : status === "expired" ? p.expired : p.status === status))
    && (!q || includesTr(`${p.number} ${p.title} ${p.recipient_company} ${p.recipient_name}`, q))), [list, status, q]);
  if (!sales) return res.loading ? <Spinner /> : <ErrorNote error={res.error} onRetry={res.reload} />;
  const openList = list.filter((p) => OPEN.includes(p.status));
  const accepted = list.filter((p) => p.status === "accepted");
  const decided = list.filter((p) => ["accepted", "rejected"].includes(p.status));
  const counts = Object.fromEntries(Object.keys(PROPOSAL_STATUS).map((k) => [k, list.filter((p) => p.status === k).length]));

  return (
    <div className="proj-section sl-tab">
      <div className="kpis kpis--compact">
        <div className="kpi kpi--hero"><span><Icon name="file" size={12} /> Açık teklif</span><strong>{openList.length}</strong><small>{money(openList.reduce((n, p) => n + p.total, 0), { round: true })}</small></div>
        <div className="kpi kpi--green"><span>Kabul edilen</span><strong>{accepted.length}</strong><small>{money(sales.stats.accepted_value, { round: true })}</small></div>
        <div className="kpi kpi--blue"><span>Dönüşüm</span><strong>{decided.length ? `%${Math.round((accepted.length / decided.length) * 100)}` : "—"}</strong><small>karar verilenlerde</small></div>
        <div className="kpi kpi--amber"><span>Görüldü</span><strong>{list.filter((p) => p.viewed_at).length}</strong><small>bağlantıyı açan alıcı</small></div>
      </div>
      <section className="card sl-card">
        <header className="sl-card__head">
          <h3><Icon name="file" size={15} /> Teklifler <span className="muted">{list.length}</span></h3>
          {ctx.canEdit && <div className="row-gap"><button type="button" className="btn btn--sm" onClick={() => setMailing(true)}><Icon name="mail" size={12} /> Şablonla e-posta</button><button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen({ new: true })}><Icon name="plus" size={12} /> Yeni teklif</button></div>}
        </header>
        <div className="filters">
          <div className="contact-filters">
            <button type="button" className={!status ? "is-active" : ""} onClick={() => setStatus("")}>Tümü<span>{list.length}</span></button>
            <button type="button" className={status === "open" ? "is-active" : ""} onClick={() => setStatus("open")}>Açık<span>{openList.length}</span></button>
            {Object.entries(PROPOSAL_STATUS).filter(([k]) => counts[k]).map(([k, v]) => <button key={k} type="button" className={status === k ? "is-active" : ""} onClick={() => setStatus(status === k ? "" : k)}>{v.label}<span>{counts[k]}</span></button>)}
            {list.some((p) => p.expired) && <button type="button" className={status === "expired" ? "is-active" : ""} onClick={() => setStatus("expired")}>Süresi dolan<span>{list.filter((p) => p.expired).length}</span></button>}
          </div>
          <span className="spacer" />
          <div className="search-box"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="No, firma, başlık…" aria-label="Tekliflerde ara" /></div>
        </div>
        {!list.length ? (
          <Empty icon="file" title="Henüz teklif yok" text="Kişiler sekmesinden ya da buradan teklif hazırlayın: kalemler, sponsorluk paketleri, KDV, ödeme planı ve şartlarla numaralı bir teklif oluşur." action={ctx.canEdit && <button type="button" className="btn btn--primary" onClick={() => setOpen({ new: true })}><Icon name="plus" size={13} /> İlk teklifi hazırla</button>} />
        ) : !shown.length ? <p className="muted small">Bu süzgeçte teklif yok.</p> : (
          <ul className="sl-qlist">
            {shown.map((p) => {
              const st = PROPOSAL_STATUS[p.status];
              const left = daysLeft(p.valid_until);
              return (
                <li key={p.id}>
                  <button type="button" className="sl-qrow" style={{ "--sc": st.color }} onClick={() => setOpen({ id: p.id })}>
                    <span className="sl-qrow__no"><b>{p.display_number}</b><small>{formatDate(p.issue_date || p.created_at)}</small></span>
                    <span className="sl-qrow__main"><strong>{p.recipient_company || p.recipient_name || "Alıcı yok"}</strong><small>{p.title}</small></span>
                    <span className="sl-qrow__total">{money(p.total)}<small>KDV dahil</small></span>
                    <span><StatusPill color={st.color} icon={st.icon}>{st.label}</StatusPill></span>
                    <span className={`sl-qrow__valid ${p.expired ? "is-alert" : left != null && left <= 3 && OPEN.includes(p.status) ? "is-warn" : ""}`}>
                      {p.valid_until ? (p.expired ? "Süresi doldu" : OPEN.includes(p.status) ? (left === 0 ? "Bugün bitiyor" : `${left} gün kaldı`) : formatDate(p.valid_until)) : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="card sl-card">
        <header className="sl-card__head"><h3><Icon name="activity" size={15} /> E-posta gönderim günlüğü</h3></header>
        <MailLog key={logKey} pid={pid} leads={ctx.leads} />
      </section>
      {open && <ProposalEditor ctx={ctx} proposalId={open.id || null} onClose={() => { setOpen(null); setLogKey((k) => k + 1); }} />}
      {mailing && <MailComposer ctx={ctx} onClose={() => { setMailing(false); setLogKey((k) => k + 1); }} />}
    </div>
  );
}
