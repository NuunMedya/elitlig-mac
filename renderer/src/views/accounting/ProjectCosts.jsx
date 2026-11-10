// Muhasebe → Proje maliyetleri: erişilen her proje için planlanan ↔ gerçekleşen
// gider / gelir ve fark. Planlanan: projenin maliyet hesabı (kalemler +
// beklenmeyen pay) varsa o, yoksa proje bütçesi kayıtlarının tahmini.
// Gerçekleşen: bütçenin ödenen kayıtları + muhasebeye işlenmemiş kalemlerin
// gerçekleşeni. Sunucu: services/projectCosts.js financeReport.
import React, { useState } from "react";
import { Empty, ErrorNote, Icon, Spinner } from "../../components/ui";
import { useResource } from "../../api";
import { saveRowsCsv, saveRowsXlsx } from "../projects/common";
import { money } from "./common";
import ExportButton from "../../components/ExportButton";
import { matrixReport } from "../../lib/export/reports";
import "../projects/lifecycle.css";

const Diff = ({ value, inverse = false }) => {
  if (!value) return <span className="muted">—</span>;
  const bad = inverse ? value < 0 : value > 0;
  return <span className={bad ? "text-red" : "text-green"}>{value > 0 ? "+" : ""}{money(value, 0)}</span>;
};
const COLS = [
  ["Proje", (p) => p.name, 220], ["Kaynak", (p) => (p.source === "costs" ? "Maliyet hesabı" : "Bütçe kayıtları"), 120],
  ["Planlanan gider", (p) => p.planned_expense, 120], ["Gerçekleşen gider", (p) => p.actual_expense, 120], ["Gider farkı", (p) => p.expense_diff, 110],
  ["Planlanan gelir", (p) => p.planned_income, 120], ["Gerçekleşen gelir", (p) => p.actual_income, 120], ["Gelir farkı", (p) => p.income_diff, 110],
  ["Planlanan net", (p) => p.planned_net, 110], ["Gerçekleşen net", (p) => p.actual_net, 110], ["Bütçe tavanı", (p) => p.budget_limit ?? "", 110],
  ["Katılımcı başı maliyet", (p) => p.per_participant ?? "", 130],
];

export default function ProjectCosts({ go }) {
  const [archived, setArchived] = useState(false);
  const res = useResource("/api/tools/projects/finance-report", archived ? { archived: "all" } : null);
  const d = res.data;
  if (!d) return res.loading ? <Spinner /> : <ErrorNote error={res.error?.status === 404 ? { message: "Proje maliyet raporu için sunucu güncellemesi henüz yayında değil." } : res.error} onRetry={res.reload} />;
  const t = d.totals;
  const rows = () => [COLS.map((c) => c[0]), ...d.items.map((p) => COLS.map(([, g]) => g(p) ?? ""))];
  const widths = Object.fromEntries(COLS.map((c, i) => [String.fromCharCode(65 + i), c[2]]));
  return (
    <div className="proj-section lc-report">
      <div className="kpis">
        <div className="kpi kpi--hero"><span>Planlanan gider</span><strong>{money(t.planned_expense, 0)}</strong><small>{t.count} proje</small></div>
        <div className="kpi"><span>Gerçekleşen gider</span><strong>{money(t.actual_expense, 0)}</strong><small>Fark <Diff value={t.expense_diff} /></small></div>
        <div className="kpi kpi--blue"><span>Planlanan gelir</span><strong>{money(t.planned_income, 0)}</strong><small>Gerçekleşen {money(t.actual_income, 0)}</small></div>
        <div className={`kpi ${t.actual_net < 0 ? "kpi--alert" : "kpi--green"}`}><span>Gerçekleşen net</span><strong>{money(t.actual_net, 0)}</strong><small>Plan {money(t.planned_net, 0)}</small></div>
      </div>
      <div className="filters">
        <label className="lc-check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Arşivdeki projeler de</label>
        <span className="spacer" />
        <ExportButton id="project-costs" title="Proje maliyetleri" report={() => { const r = rows(); return matrixReport("Proje maliyetleri", r[0], r.slice(1), { filters: archived ? ["Arşiv dahil"] : [], summary: [{ label: "Planlanan gider", value: t.planned_expense, type: "money" }, { label: "Gerçekleşen gider", value: t.actual_expense, type: "money", tone: "red" }, { label: "Planlanan gelir", value: t.planned_income, type: "money" }, { label: "Gerçekleşen net", value: t.actual_net, type: "money", tone: t.actual_net < 0 ? "red" : "green" }] }); }}
          extraItems={[
          { label: "Excel (.xlsx)", icon: "grid", disabled: !d.items.length, onClick: () => saveRowsXlsx("Proje-maliyetleri", rows(), "Proje maliyetleri", widths) },
          { label: "CSV", icon: "download", disabled: !d.items.length, onClick: () => saveRowsCsv("Proje-maliyetleri", rows()) },
        ]} />
      </div>
      {res.offline && <div className="offline-note"><Icon name="cloudOff" size={14} /> Çevrimdışı: son eşitlenen rapor gösteriliyor.</div>}
      {!d.items.length ? <div className="card"><Empty icon="layers" title="Proje yok" text="Projelerdeki maliyet hesabı ve bütçe kayıtları burada proje bazında karşılaştırılır." /></div> : (
        <section className="card">
          <div className="lc-tablewrap">
            <table className="lc-table">
              <thead><tr><th>Proje</th><th className="num">Planlanan gider</th><th className="num">Gerçekleşen</th><th className="num">Fark</th><th className="num">Planlanan gelir</th><th className="num">Gerçekleşen</th><th className="num">Fark</th><th className="num">Net</th></tr></thead>
              <tbody>
                {d.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="link-btn" style={{ color: p.color }} onClick={() => go?.("projects", { id: p.id, tab: "costs" })}><strong>{p.name}</strong></button>
                      <small>{p.source === "costs" ? "Maliyet hesabından" : "Bütçe kayıtlarından"}{p.budget_limit != null ? ` · tavan ${money(p.budget_limit, 0)}` : ""}{p.per_participant != null ? ` · katılımcı başı ${money(p.per_participant, 0)}` : ""}</small>
                    </td>
                    <td className="num">{money(p.planned_expense, 0)}</td>
                    <td className="num">{money(p.actual_expense, 0)}</td>
                    <td className="num"><Diff value={p.expense_diff} /></td>
                    <td className="num">{money(p.planned_income, 0)}</td>
                    <td className="num">{money(p.actual_income, 0)}</td>
                    <td className="num"><Diff value={p.income_diff} inverse /></td>
                    <td className="num"><b className={p.actual_net < 0 ? "text-red" : ""}>{money(p.actual_net, 0)}</b><small>plan {money(p.planned_net, 0)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
