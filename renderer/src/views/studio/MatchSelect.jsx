// Yayın Stüdyosu · maç seçici — "ANG – KAR · 21:00".
//
// KAYNAKLAR (biri hata verse de liste dolar):
//   1. GET /api/chat/content/matches?date=  seçilen günün maçları (kullanıcının il kapsamı)
//   2. GET /maclar?mac_durumu=canli          o an canlı olan maçlar — gün ne olursa olsun en üstte
//   3. GET /maclar?limit=500                 1. uç hata verirse / boş dönerse: genel listeden o günün maçları
// Listede olmayan bir maç "Maç no" alanına numarası yazılarak da açılır.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import { request } from "../../api";
import { getDayMatches } from "./studioApi";
import { buildMatchOptions, isoDay, matchOptionLabel, shiftDay } from "../../lib/studio/match";

const dayText = (day) => {
  const today = isoDay();
  if (day === today) return "Bugün";
  if (day === shiftDay(today, -1)) return "Dün";
  if (day === shiftDay(today, 1)) return "Yarın";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" });
};

const listMatches = (query) => request({ path: "/maclar", query: { includeDraft: 1, ...query }, cache: true });
const rowsOf = (res) => (res?.ok ? (Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : []) : []);

export default function MatchSelect({ matchId, onChange, disabled, current }) {
  const [day, setDay] = useState(isoDay);
  const [state, setState] = useState({ loading: true, live: [], ofDay: [], error: null });
  const [reload, setReload] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [dayRes, liveRes] = await Promise.all([getDayMatches(day), listMatches({ mac_durumu: "canli", limit: 60 })]);
      const dayItems = dayRes?.ok ? dayRes.data?.items || [] : [];
      let listItems = rowsOf(liveRes);
      // Günün maçları ucu hata verdiyse ya da boşsa genel listeden o günü süz.
      if (!dayItems.length) listItems = listItems.concat(rowsOf(await listMatches({ limit: 500 })));
      if (!alive) return;
      const { live, ofDay } = buildMatchOptions({ day, dayItems, listItems });
      const failed = !dayRes?.ok && !liveRes?.ok;
      setState({
        loading: false,
        live,
        ofDay,
        error: failed ? dayRes?.error?.message || liveRes?.error?.message || "Maçlar alınamadı." : null,
      });
    })();
    return () => { alive = false; };
  }, [day, reload]);

  const all = [...state.live, ...state.ofDay];
  const known = all.some((m) => m.id === Number(matchId));
  const placeholder = state.loading ? "Maçlar yükleniyor…" : state.error ? `Maçlar alınamadı: ${state.error}` : all.length ? "Maç seç…" : `${dayText(day)} maç yok`;

  const openTyped = () => {
    const id = Number(String(typed).replace(/\D/g, ""));
    if (id > 0) { onChange(id); setTyped(""); }
  };

  return (
    <div className="st-match-select">
      <button type="button" className="icon-btn icon-btn--xs" title="Önceki gün" disabled={disabled} onClick={() => setDay((d) => shiftDay(d, -1))}><Icon name="chevronLeft" size={13} /></button>
      <button type="button" className="st-match-select__day" disabled={disabled} onClick={() => setDay(isoDay())} title="Bugüne dön">{dayText(day)}</button>
      <button type="button" className="icon-btn icon-btn--xs" title="Sonraki gün" disabled={disabled} onClick={() => setDay((d) => shiftDay(d, 1))}><Icon name="chevronRight" size={13} /></button>
      <select value={matchId ? String(matchId) : ""} disabled={disabled} onChange={(e) => onChange(Number(e.target.value) || null)} title={disabled ? "Yayın sürerken maç değiştirilemez" : "Maç seç"}>
        <option value="">{placeholder}</option>
        {matchId && !known && <option value={String(matchId)}>{current ? matchOptionLabel(current) : `Maç #${matchId}`}</option>}
        {state.live.length > 0 && (
          <optgroup label="Şu an canlı">
            {state.live.map((m) => <option key={m.id} value={String(m.id)}>{matchOptionLabel(m)}{m.field ? ` · ${m.field}` : ""}</option>)}
          </optgroup>
        )}
        {state.ofDay.length > 0 && (
          <optgroup label={dayText(day)}>
            {state.ofDay.map((m) => <option key={m.id} value={String(m.id)}>{matchOptionLabel(m)}{m.field ? ` · ${m.field}` : ""}</option>)}
          </optgroup>
        )}
      </select>
      <button type="button" className="icon-btn icon-btn--xs" title="Listeyi yenile" disabled={disabled || state.loading} onClick={() => setReload((n) => n + 1)}><Icon name="refresh" size={13} /></button>
      <input
        className="st-match-select__id"
        value={typed}
        disabled={disabled}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") openTyped(); }}
        onBlur={openTyped}
        placeholder="Maç no"
        inputMode="numeric"
        aria-label="Maç numarasıyla aç"
        title="Listede yoksa maç numarasını yazıp Enter'a bas"
      />
    </div>
  );
}
