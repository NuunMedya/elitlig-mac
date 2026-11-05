// Yayın Stüdyosu · maç seçici: günün maçları (kullanıcının kapsamı,
// GET /api/chat/content/matches?date=) — "ANG – KAR · 21:00".
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { getDayMatches } from "./studioApi";
import { isoDay, matchOptionLabel, shiftDay, sortDayMatches } from "../../lib/studio/match";

const dayText = (day) => {
  const today = isoDay();
  if (day === today) return "Bugün";
  if (day === shiftDay(today, -1)) return "Dün";
  if (day === shiftDay(today, 1)) return "Yarın";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
};

export default function MatchSelect({ matchId, onChange, disabled, current }) {
  const [day, setDay] = useState(isoDay);
  const [state, setState] = useState({ loading: true, items: [], error: null });

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    getDayMatches(day).then((r) => {
      if (!live) return;
      setState({ loading: false, items: r.ok ? sortDayMatches(r.data?.items) : [], error: r.ok ? null : r.error?.message || "Maçlar alınamadı." });
    });
    return () => { live = false; };
  }, [day]);

  const known = state.items.some((m) => Number(m.id) === Number(matchId));
  return (
    <div className="st-match-select">
      <button type="button" className="icon-btn icon-btn--xs" title="Önceki gün" disabled={disabled} onClick={() => setDay((d) => shiftDay(d, -1))}><Icon name="chevronLeft" size={13} /></button>
      <button type="button" className="st-match-select__day" disabled={disabled} onClick={() => setDay(isoDay())} title="Bugüne dön">{dayText(day)}</button>
      <button type="button" className="icon-btn icon-btn--xs" title="Sonraki gün" disabled={disabled} onClick={() => setDay((d) => shiftDay(d, 1))}><Icon name="chevronRight" size={13} /></button>
      <select value={matchId ? String(matchId) : ""} disabled={disabled} onChange={(e) => onChange(Number(e.target.value) || null)} title={disabled ? "Yayın sürerken maç değiştirilemez" : "Maç seç"}>
        <option value="">{state.loading ? "Maçlar yükleniyor…" : state.error ? state.error : state.items.length ? "Maç seç…" : "Bu gün maç yok"}</option>
        {matchId && !known && <option value={String(matchId)}>{current ? matchOptionLabel(current) : `Maç #${matchId}`}</option>}
        {state.items.map((m) => <option key={m.id} value={String(m.id)}>{matchOptionLabel(m)}{m.field ? ` · ${m.field}` : ""}</option>)}
      </select>
    </div>
  );
}
