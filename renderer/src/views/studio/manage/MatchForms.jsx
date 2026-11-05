// Maç yönetimi · maç oluşturma ve düzenleme pencereleri.
//
// OLUŞTUR (mobil mac-olustur): kapsam (il → lig → sezon → grup) → ev / deplasman
//   → tarih, saat, saha → başlangıç durumu → görevlendirme (isteğe bağlı).
//   POST /maclar/add-fikstur (daima taslak açar) → PATCH /maclar/:id { mac_durumu }
//   → PUT /api/staff/matches/:id { görev: personelId }
// DÜZENLE (mobil InfoStep): PATCH /maclar/:id yalnız değişen alanlar + görevlendirme.
import React, { useMemo, useState } from "react";
import { Icon, Modal, Spinner, useConfirm } from "../../../components/ui";
import { isoDay } from "../../../lib/studio/match";
import { friendlyError } from "../../../lib/studio/manage";
import { FALLBACK_DUTIES, MATCH_STATUS_OPTIONS, asArray, fixtureCreatePayload, isHttpUrl, isNationwide, matchToForm, matchUpdatePayload, readAssignments, validateFixture } from "../../../lib/studio/manageMatches";
import * as api from "./manageApi";
import { EMPTY_SCOPE, ScopeFields, TeamSelect } from "./pickers";
import { useLoad, useRun } from "./useManage";

function VenueInput({ value, onChange, city }) {
  const venues = useLoad(() => api.getVenues(), []);
  const list = useMemo(() => {
    const wanted = String(city || "").toLocaleLowerCase("tr-TR");
    return asArray(venues.data).filter((v) => v.name && (!wanted || !v.city || v.city.toLocaleLowerCase("tr-TR") === wanted));
  }, [venues.data, city]);
  return (
    <label className="mg-field mg-grow"><span>Saha</span>
      <input list="mg-venues" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Saha seç ya da yaz" />
      <datalist id="mg-venues">{list.map((v) => <option key={v.id || v.name} value={v.name}>{v.location || ""}</option>)}</datalist>
    </label>
  );
}

function StaffFields({ duties, staff, value, onChange, error }) {
  if (error) return <p className="mg-muted">Personel listesi okunamadı ({error}); görevlendirme sonra yapılabilir.</p>;
  return (
    <div className="mg-grid-auto">
      {duties.map((d) => (
        <label key={d.key} className="mg-field"><span>{d.label}</span>
          <select value={value[d.key] || ""} onChange={(e) => onChange({ ...value, [d.key]: e.target.value })}>
            <option value="">Görevli yok</option>
            {value[d.key] && !staff.some((p) => String(p.id) === String(value[d.key])) && <option value={value[d.key]}>Personel #{value[d.key]}</option>}
            {staff.map((p) => <option key={p.id} value={p.id}>{p.fullName}{p.duty && p.duty !== d.key ? ` · ${p.duty}` : ""}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------- oluştur ------------------------------- */

export function CreateMatchModal({ user, onClose, onCreated, onOpen }) {
  const { run, busy, toast } = useRun();
  const nationwide = isNationwide(user);
  const [scope, setScope] = useState({ ...EMPTY_SCOPE, city: nationwide ? "" : user?.city || "" });
  const [hasGroups, setHasGroups] = useState(false);
  const [form, setForm] = useState({ home: null, away: null, date: isoDay(), time: "20:00", venue: "", status: "taslak" });
  const [assign, setAssign] = useState({});
  const [showStaff, setShowStaff] = useState(false);
  const teams = useLoad(() => api.getTeams(scope.city || null), [scope.city], { enabled: Boolean(scope.city) });
  const staff = useLoad(() => api.getStaffOptions({ city: scope.city || undefined }), [scope.city, showStaff], { enabled: showStaff });
  const duties = staff.data?.duties?.length ? staff.data.duties : FALLBACK_DUTIES;

  const full = { ...form, city: scope.city, leagueId: scope.leagueId, leagueLabel: scope.leagueLabel, seasonId: scope.seasonId, seasonLabel: scope.seasonLabel, groupId: scope.groupId };
  const problem = validateFixture(full, { hasGroups });
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const submit = async () => {
    if (problem) return;
    const created = await run(() => api.createFixture(fixtureCreatePayload(full, { hasGroups })), { quiet: true, fail: "Maç oluşturulamadı." });
    const id = Number(created?.id);
    if (!created) return;
    if (!id) { toast("Maç oluşturuldu ama kimliği alınamadı; listeden kontrol et.", { tone: "warn" }); onClose(); return; }
    const warnings = [];
    if (form.status !== "taslak") {
      const r = await api.updateMatch(id, { mac_durumu: form.status });
      if (!r.ok) warnings.push(`durum (${friendlyError(r, "kaydedilemedi")})`);
    }
    const picked = Object.fromEntries(Object.entries(assign).filter(([, v]) => v));
    if (Object.keys(picked).length) {
      const r = await api.saveMatchAssignments(id, picked);
      if (!r.ok) warnings.push(`görevlendirme (${friendlyError(r, "kaydedilemedi")})`);
    }
    toast(warnings.length ? `Maç oluşturuldu; ${warnings.join(", ")} yazılamadı.` : `Maç oluşturuldu: ${form.home.name} – ${form.away.name}.`, { tone: warnings.length ? "warn" : "success", timeout: 8000, action: onOpen ? { label: "Stüdyoda aç", run: () => onOpen(id) } : undefined });
    onCreated?.(id);
  };

  return (
    <Modal title="Yeni maç" onClose={() => !busy && onClose()} width={760} className="st-modal mg-modal"
      footer={<>
        {problem && <span className="mg-error">{problem}</span>}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || Boolean(problem)}><Icon name="check" size={14} /> Maçı kaydet</button>
      </>}>
      <div className="mg-stack">
        <h6 className="mg-sidehead">Kapsam</h6>
        <ScopeFields value={scope} onChange={(next) => { if (next.city !== scope.city) set({ home: null, away: null, venue: "" }); setScope(next); }} withGroup onGroupsLoaded={setHasGroups} lockCity={!nationwide && Boolean(user?.city)} />
        <h6 className="mg-sidehead">Eşleşme</h6>
        <div className="mg-grid2">
          <TeamSelect label="Ev sahibi" teams={teams.data} loading={teams.loading} value={form.home} exclude={form.away?.id} onChange={(t) => set({ home: t })} />
          <TeamSelect label="Deplasman" teams={teams.data} loading={teams.loading} value={form.away} exclude={form.home?.id} onChange={(t) => set({ away: t })} />
        </div>
        {teams.error && <p className="mg-error">{teams.error}</p>}
        <h6 className="mg-sidehead">Zaman, saha, durum</h6>
        <div className="mg-inline mg-wrap">
          <label className="mg-field"><span>Tarih</span><input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <label className="mg-field"><span>Saat</span><input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} /></label>
          <VenueInput value={form.venue} onChange={(v) => set({ venue: v })} city={scope.city} />
          <label className="mg-field"><span>Başlangıç durumu</span>
            <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="taslak">Taslak (sitede görünmez)</option>
              <option value="zamanlanmis">Zamanlandı (fikstürde)</option>
            </select>
          </label>
        </div>
        <button type="button" className="link-btn" onClick={() => setShowStaff((v) => !v)}>{showStaff ? "Görevlendirmeyi gizle" : "Görevlendirme ekle (spiker, reji, hakem…)"}</button>
        {showStaff && (staff.loading ? <Spinner label="Personel yükleniyor…" /> : <StaffFields duties={duties} staff={staff.data?.items || []} value={assign} onChange={setAssign} error={staff.error} />)}
      </div>
    </Modal>
  );
}

/* ------------------------------- düzenle ------------------------------- */

export function EditMatchModal({ matchId, onClose, onSaved, onDeleted }) {
  const { run, busy } = useRun();
  const confirm = useConfirm();
  const rec = useLoad(() => api.getAdminMatch(matchId), [matchId], { fallback: "Maç okunamadı." });
  const assignments = useLoad(() => api.getMatchAssignments(matchId), [matchId]);
  const staff = useLoad(() => api.getStaffOptions({ matchId }), [matchId]);
  const [form, setForm] = useState(null);
  const [assign, setAssign] = useState(null);
  const base = rec.data ? matchToForm(rec.data) : null;
  const value = form || base;
  const assignValue = assign || readAssignments(assignments.data);
  const duties = staff.data?.duties?.length ? staff.data.duties : assignments.data?.duties?.length ? assignments.data.duties : FALLBACK_DUTIES;
  const set = (p) => setForm((f) => ({ ...(f || base), ...p }));

  const changes = value && rec.data ? matchUpdatePayload(value, rec.data) : {};
  const assignChanged = assign && JSON.stringify(assign) !== JSON.stringify(readAssignments(assignments.data));
  const problem = value?.video && !isHttpUrl(value.video) ? "Yayın bağlantısı http:// ya da https:// ile başlamalı." : "";

  const save = async () => {
    let ok = true;
    if (Object.keys(changes).length) ok = Boolean(await run(() => api.updateMatch(matchId, changes), { ok: "Maç bilgileri kaydedildi.", fail: "Maç bilgileri kaydedilemedi." }));
    if (ok && assignChanged) ok = Boolean(await run(() => api.saveMatchAssignments(matchId, assign), { ok: "Görevlendirmeler kaydedildi.", fail: "Görevlendirmeler kaydedilemedi." }));
    if (ok) { onSaved?.(); onClose(); }
  };
  const remove = async () => {
    const title = rec.data ? `${rec.data.first_team_name} – ${rec.data.second_team_name}` : `#${matchId}`;
    if (!(await confirm({ title: "Maç silinsin mi?", message: `${title}: maç, kadro ve istatistikler çöp kutusuna taşınır.`, danger: true, confirmLabel: "Maçı sil" }))) return;
    if (await run(() => api.deleteMatch(matchId), { ok: "Maç silindi.", fail: "Maç silinemedi." })) { onDeleted?.(matchId); onClose(); }
  };

  return (
    <Modal title={rec.data ? `Maçı düzenle · ${rec.data.first_team_name} – ${rec.data.second_team_name}` : "Maçı düzenle"} onClose={() => !busy && onClose()} width={720} className="st-modal mg-modal"
      footer={<>
        <button type="button" className="btn btn--danger-ghost" onClick={remove} disabled={busy || !rec.data}><Icon name="trash" size={13} /> Sil</button>
        <span className="mg-grow" />
        {problem && <span className="mg-error">{problem}</span>}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy || Boolean(problem) || (!Object.keys(changes).length && !assignChanged)}>Kaydet</button>
      </>}>
      {rec.error && !rec.data ? <p className="mg-error">{rec.error}</p> : !value ? <Spinner /> : (
        <div className="mg-stack">
          <p className="mg-muted">{[rec.data.league_name, rec.data.match_season, rec.data.city].filter(Boolean).join(" · ")} · #{matchId}</p>
          <div className="mg-inline mg-wrap">
            <label className="mg-field"><span>Tarih</span><input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} /></label>
            <label className="mg-field"><span>Saat</span><input type="time" value={value.time} onChange={(e) => set({ time: e.target.value })} /></label>
            <VenueInput value={value.venue} onChange={(v) => set({ venue: v })} city={rec.data.city} />
            <label className="mg-field"><span>Durum</span>
              <select value={value.status} onChange={(e) => set({ status: e.target.value })}>
                {MATCH_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
              </select>
            </label>
          </div>
          <div className="mg-inline mg-wrap">
            <label className="mg-field mg-grow"><span>Manşet</span><input value={value.title} maxLength={255} onChange={(e) => set({ title: e.target.value })} placeholder="Maçın manşeti" /></label>
            <label className="mg-field mg-grow"><span>Canlı yayın bağlantısı</span><input value={value.video} onChange={(e) => set({ video: e.target.value })} placeholder="https://youtube.com/live/…" /></label>
          </div>
          <h6 className="mg-sidehead">Görevlendirme</h6>
          {assignments.loading || staff.loading ? <Spinner label="Görevliler yükleniyor…" /> : (
            <StaffFields duties={duties} staff={staff.data?.items || []} value={assignValue} onChange={setAssign} error={staff.error || assignments.error} />
          )}
        </div>
      )}
    </Modal>
  );
}
