// Maç yönetimi — küçük ortak seçiciler: kapsam (il → lig → sezon → grup),
// aramalı takım seçici, kadrodan oyuncu seçici, sunucuda oyuncu araması ve
// kopyalanabilir bağlantı satırı.
import React, { useEffect, useMemo, useState } from "react";
import { useDebounced } from "../../../api";
import { Icon } from "../../../components/ui";
import { asArray, filterTeams } from "../../../lib/studio/manageMatches";
import * as api from "./manageApi";
import { copyText, useLoad } from "./useManage";

export const EMPTY_SCOPE = { cityId: null, city: "", leagueId: null, leagueLabel: "", seasonId: null, seasonLabel: "", groupId: null, groupLabel: "" };

const sel = (list, id) => list.find((x) => String(x.id) === String(id));

/** İl → lig → sezon (+ grup). value: EMPTY_SCOPE biçimi. */
export function ScopeFields({ value, onChange, withGroup = false, onGroupsLoaded, lockCity = false, compact = false }) {
  const cities = useLoad(() => api.getCities(), []);
  const leagues = useLoad(() => api.getLeagues(value.cityId), [value.cityId], { enabled: Boolean(value.cityId) });
  const seasons = useLoad(() => api.getSeasons(value.cityId, value.leagueId), [value.cityId, value.leagueId], { enabled: Boolean(value.cityId && value.leagueId) });
  const groups = useLoad(() => api.getSeasonGroups(value.seasonId), [value.seasonId], { enabled: Boolean(withGroup && value.seasonId) });
  const cityList = cities.data?.cities || [];
  const leagueList = leagues.data?.leagues || [];
  const seasonList = seasons.data?.seasons || [];
  const groupList = asArray(groups.data, "groups");

  // Kullanıcının ili adla verildiyse kimliği listeden çöz.
  useEffect(() => {
    if (value.cityId || !value.city || !cityList.length) return;
    const hit = cityList.find((c) => c.label.toLocaleLowerCase("tr-TR") === value.city.toLocaleLowerCase("tr-TR"));
    if (hit) onChange({ ...value, cityId: hit.id, city: hit.label });
  }, [cityList, value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (withGroup) onGroupsLoaded?.(groupList.length > 0); }, [groupList.length, withGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`mg-scope${compact ? " is-compact" : ""}`}>
      <label className="mg-field"><span>İl</span>
        <select value={value.cityId || ""} disabled={lockCity} onChange={(e) => { const c = sel(cityList, e.target.value); onChange({ ...EMPTY_SCOPE, cityId: c?.id || null, city: c?.label || "" }); }}>
          <option value="">{cities.loading ? "Yükleniyor…" : "İl seç"}</option>
          {cityList.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="mg-field"><span>Lig</span>
        <select value={value.leagueId || ""} disabled={!value.cityId} onChange={(e) => { const l = sel(leagueList, e.target.value); onChange({ ...value, leagueId: l?.id || null, leagueLabel: l?.label || "", seasonId: null, seasonLabel: "", groupId: null, groupLabel: "" }); }}>
          <option value="">{leagues.loading ? "Yükleniyor…" : "Tüm ligler"}</option>
          {leagueList.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <label className="mg-field"><span>Sezon</span>
        <select value={value.seasonId || ""} disabled={!value.leagueId} onChange={(e) => { const s = sel(seasonList, e.target.value); onChange({ ...value, seasonId: s?.id || null, seasonLabel: s?.label || "", groupId: null, groupLabel: "" }); }}>
          <option value="">{seasons.loading ? "Yükleniyor…" : "Tüm sezonlar"}</option>
          {seasonList.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      {withGroup && groupList.length > 0 && (
        <label className="mg-field"><span>Grup</span>
          <select value={value.groupId || ""} onChange={(e) => { const g = sel(groupList, e.target.value); onChange({ ...value, groupId: g?.id || null, groupLabel: g?.group_name || "" }); }}>
            <option value="">Grup seç</option>
            {groupList.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** Aramalı takım seçici. teams: /takimlar satırları; value: { id, name } | null. */
export function TeamSelect({ label, teams, value, onChange, exclude, loading }) {
  const [q, setQ] = useState("");
  const options = useMemo(() => filterTeams(teams, q).filter((t) => Number(t.id) !== Number(exclude) && t.active !== false && t.active !== 0 && t.active !== "0").slice(0, 200), [teams, q, exclude]);
  return (
    <div className="mg-field">
      <span>{label}</span>
      <div className="mg-teamsel">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" aria-label={`${label} ara`} />
        <select value={value?.id || ""} onChange={(e) => { const t = options.find((x) => String(x.id) === e.target.value); onChange(t ? { id: Number(t.id), name: t.team_name } : null); }}>
          <option value="">{loading ? "Takımlar yükleniyor…" : `Takım seç (${options.length})`}</option>
          {value?.id && !options.some((t) => Number(t.id) === Number(value.id)) && <option value={value.id}>{value.name}</option>}
          {options.map((t) => <option key={t.id} value={t.id}>{t.team_name}{t.current_league ? ` · ${t.current_league}` : ""}</option>)}
        </select>
      </div>
    </div>
  );
}

const playerText = (p) => `${p.number ? `#${p.number} ` : ""}${p.name}${p.captain ? " (K)" : ""}`;

/**
 * Kadrodan oyuncu seçici. groups: [{ label, players }] — boş gruplar atlanır.
 * value: oyuncu kimliği (metin), "" = seçilmedi.
 */
export function PlayerSelect({ label, groups, value, onChange, emptyLabel = "Oyuncu seç", disabled }) {
  const known = groups.some((g) => g.players.some((p) => p.id === String(value)));
  return (
    <label className="mg-field"><span>{label}</span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{emptyLabel}</option>
        {value && !known && <option value={value}>Oyuncu #{value}</option>}
        {groups.filter((g) => g.players.length).map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.players.map((p) => <option key={p.id} value={p.id}>{playerText(p)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** Sunucuda oyuncu araması (GET /api/players/admin-list); onPick(oyuncu). */
export function PlayerSearch({ scopeCity, onPick, actionLabel = "Ekle", isPicked, placeholder = "Oyuncu adı yaz (en az 2 harf)…" }) {
  const [q, setQ] = useState("");
  const needle = useDebounced(q.trim(), 350);
  const res = useLoad(() => api.searchPlayers({ q: needle, scopeCity }), [needle, scopeCity], { enabled: needle.length >= 2, fallback: "Oyuncu araması yapılamadı." });
  const items = asArray(res.data, "players");
  return (
    <div className="mg-psearch">
      <div className="mg-search"><Icon name="search" size={13} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} /></div>
      {needle.length >= 2 && (
        <ul className="mg-rows mg-rows--scroll">
          {res.loading && <li className="mg-muted">Aranıyor…</li>}
          {res.error && <li className="mg-error">{res.error}</li>}
          {!res.loading && !res.error && !items.length && <li className="mg-muted">Eşleşen oyuncu yok.</li>}
          {items.map((p) => {
            const picked = isPicked?.(p);
            return (
              <li key={p.id} className="mg-row">
                <span className="mg-row__main"><strong>{p.player_name}</strong><small>{[p.team_name, p.player_position, p.city].filter(Boolean).join(" · ") || `#${p.id}`}</small></span>
                <button type="button" className="btn btn--xs" disabled={picked} onClick={() => onPick(p)}>{picked ? "Eklendi" : actionLabel}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bağlantı satırı: kopyala + tarayıcıda aç. */
export function LinkRow({ label, hint, url, toast }) {
  return (
    <li className="mg-row">
      <span className="mg-row__main"><strong>{label}</strong><small className="mg-mono">{url}</small>{hint && <small>{hint}</small>}</span>
      <button type="button" className="btn btn--xs" onClick={async () => { const ok = await copyText(url); toast(ok ? `${label} bağlantısı kopyalandı.` : "Kopyalanamadı; adresi elle seç.", { tone: ok ? "success" : "error" }); }}><Icon name="copy" size={12} /> Kopyala</button>
      <button type="button" className="icon-btn icon-btn--xs" title="Tarayıcıda aç" onClick={() => window.elitlig?.app?.openExternal?.(url)}><Icon name="external" size={12} /></button>
    </li>
  );
}

/** Sekmenin maç seçilmeden açılmadığı durum. */
export const NeedMatch = ({ text = "Bu sekme için önce bir maç seç." }) => (
  <div className="mg-empty"><Icon name="ball" size={22} /><p>{text}</p></div>
);
