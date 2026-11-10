// Bugün ekranındaki küçük ekipman özeti: benim zimmetim, geciken iadeler,
// bugün / yakında bakım. Yetkisi olmayan hesapta hiç görünmez.
import React from "react";
import { Icon, Spinner } from "../../components/ui";
import { useResource } from "../../api";
import { todaySummary } from "../../lib/equipmentUtils";
import "./equipment.css";

export default function EquipmentToday({ go }) {
  const dash = useResource("/api/tools/equipment/dashboard");
  const mine = useResource("/api/tools/equipment/mine");
  if ((dash.error && !dash.data) || (!dash.loading && !dash.data)) return null;
  const s = todaySummary(dash.data, mine.data?.items || []);
  const open = (id) => go("equipment", { id });
  return (
    <section className="card today-eq" data-tool="equipment">
      <header className="card__head">
        <h2 className="card__title"><Icon name="box" /> Ekipman</h2>
        <button type="button" className="link-btn" onClick={() => go("equipment")}>Aç →</button>
      </header>
      {!s ? <Spinner /> : (<>
        <div className="counts">
          <button type="button" onClick={() => go("equipment:zimmetim")}><strong className={s.myLate ? "text-red" : ""}>{s.myCount}</strong><span>zimmetimdekiler</span></button>
          <button type="button" onClick={() => go("equipment:zimmet")}><strong className={s.overdue ? "text-red" : ""}>{s.overdue}</strong><span>geciken iade</span></button>
          <button type="button" onClick={() => go("equipment:bakim")}><strong className={s.maintenance ? "text-red" : ""}>{s.maintenance}</strong><span>bakım zamanı</span></button>
        </div>
        {s.rows.length ? (
          <ul className="task-mini">{s.rows.slice(0, 4).map((r) => (
            <li key={r.key}><button type="button" className="task-mini__title" onClick={() => open(r.id)}><Icon name="box" size={13} className="text-tool" /><span className="today-proj__text"><span>{r.title}</span><small>{r.sub}</small></span></button><span className={`task-mini__due ${r.late ? "text-red" : ""}`}>{r.when}</span></li>
          ))}</ul>
        ) : <p className="muted small">{s.items} ekipman · {s.assigned} kişide / çıkışta · bugün dikkat isteyen yok.</p>}
      </>)}
    </section>
  );
}
