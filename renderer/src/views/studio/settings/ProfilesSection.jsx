// Ayarlar › AYAR ŞABLONLARI: tüm stüdyo ayarlarını adlandırılmış şablon olarak kaydet,
// uygula, .json dosyasına aktar ve başka bilgisayarda içe aktar (doğrula → neyin
// değişeceğini göster → uygula). Model: ./profiles.js.
import React, { useMemo, useRef, useState } from "react";
import { Icon, Modal } from "../../../components/ui";
import {
  DEFAULT_GROUPS, PROFILE_GROUPS, applyProfile, collectProfile, diffProfile, loadProfiles, newProfileId, profileFileName, profileSummary,
  saveProfiles, validateProfile,
} from "./profiles";

const store = () => { try { return window.localStorage; } catch { return null; } };
const dateText = (iso) => { try { return new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

/** Dosyaya yaz: Electron kaydetme penceresi (window.elitlig.files.save) ya da tarayıcı indirmesi. */
async function downloadJson(name, text) {
  const save = window.elitlig?.files?.save;
  if (save) {
    const r = await save(name, text, [{ name: "Ayar şablonu", extensions: ["json"] }]);
    return r?.ok ? { ok: true, path: r.path } : { ok: false, canceled: true };
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true };
}

function GroupChecks({ value, onChange, available = null }) {
  return (
    <div className="st-prof__groups">
      {PROFILE_GROUPS.filter((g) => !available || available.includes(g.key)).map((g) => (
        <label key={g.key} className={`st-prof__group ${value.includes(g.key) ? "is-on" : ""}`} title={g.hint}>
          <input type="checkbox" checked={value.includes(g.key)} onChange={(e) => onChange(e.target.checked ? [...value, g.key] : value.filter((k) => k !== g.key))} />
          <span><strong>{g.label}</strong><small>{g.hint}</small></span>
        </label>
      ))}
    </div>
  );
}

/** Uygulama önizlemesi: grup başına ne değişecek, hangi gruplar uygulansın. */
function ApplyDialog({ profile, source, onClose, onApply, onSaveCopy }) {
  const rows = useMemo(() => diffProfile(store(), profile), [profile]);
  const [groups, setGroups] = useState(() => rows.filter((r) => !r.same).map((r) => r.key));
  const [replace, setReplace] = useState(false);
  const live = rows.filter((r) => groups.includes(r.key) && !r.live);
  return (
    <Modal title={`Şablonu uygula · ${profile.name}`} onClose={onClose} width={640} className="st-modal"
      footer={(
        <>
          {onSaveCopy && <button type="button" className="btn btn--ghost" onClick={onSaveCopy}><Icon name="download" size={13} /> Şablonlara kaydet</button>}
          <span className="st-top__spacer" />
          <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn btn--primary" disabled={!groups.length} onClick={() => onApply(groups, replace)}><Icon name="check" size={13} /> {groups.length} grubu uygula</button>
        </>
      )}>
      <p className="st-hint">{source === "file" ? "Dosya doğrulandı." : "Kayıtlı şablon."} {profile.createdAt ? `Oluşturulma: ${dateText(profile.createdAt)}.` : ""} Uygulanacak grupları seç; değişenler aşağıda.</p>
      <ul className="st-prof__diff">
        {rows.map((r) => (
          <li key={r.key} className={r.same ? "is-same" : ""}>
            <label>
              <input type="checkbox" checked={groups.includes(r.key)} onChange={(e) => setGroups((g) => (e.target.checked ? [...g, r.key] : g.filter((k) => k !== r.key)))} />
              <strong>{r.label}</strong>
            </label>
            <span className="st-prof__diffnum">
              {r.same ? <em>aynı</em> : <>
                {r.changed > 0 && <b className="is-chg">{r.changed} değişir</b>}
                {r.added > 0 && <b className="is-add">{r.added} eklenir</b>}
                {replace && r.removed > 0 && <b className="is-del">{r.removed} silinir</b>}
              </>}
            </span>
            {r.fields.length > 0 && <small className="st-prof__fields">{r.fields.join(" · ")}</small>}
          </li>
        ))}
      </ul>
      <label className="toggle small"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Gruptaki şablonda olmayan kayıtları sil (ör. başka maçların grafik ayarları)</label>
      {live.length > 0 && <p className="st-note is-warn"><Icon name="info" size={13} /> {live.map((r) => r.label).join(", ")}: stüdyo yeniden yüklenince tam uygulanır.</p>}
    </Modal>
  );
}

export default function ProfilesSection({ Section, onApplied, canReload = true, toast }) {
  const [items, setItemsRaw] = useState(() => loadProfiles(store()));
  const setItems = (fn) => setItemsRaw((cur) => { const next = typeof fn === "function" ? fn(cur) : fn; saveProfiles(store(), next); return next; });
  const [name, setName] = useState("");
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [pending, setPending] = useState(null); // { profile, source }
  const [needsReload, setNeedsReload] = useState(false);
  const [importError, setImportError] = useState(null);
  const fileRef = useRef(null);
  const say = (m, tone = "success") => toast?.(m, { tone });

  const saveCurrent = () => {
    const nm = name.trim() || `Şablon ${items.length + 1}`;
    const profile = collectProfile(store(), { name: nm, groups });
    if (!Object.keys(profile.groups).length) { say("Seçilen gruplarda kaydedilecek ayar yok.", "warn"); return; }
    setItems((cur) => [{ id: newProfileId(), profile }, ...cur]);
    setName("");
    say(`“${nm}” şablonu kaydedildi.`);
  };
  const overwrite = (it) => {
    const profile = collectProfile(store(), { name: it.profile.name, groups: Object.keys(it.profile.groups) });
    setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, profile } : x)));
    say(`“${it.profile.name}” şu anki ayarlarla güncellendi.`);
  };
  const exportOne = async (profile) => {
    const r = await downloadJson(profileFileName(profile.name), JSON.stringify(profile, null, 2));
    if (r.ok) say(r.path ? `Dışa aktarıldı: ${r.path}` : "Şablon dosyası indirildi.");
  };
  const exportCurrent = () => exportOne(collectProfile(store(), { name: name.trim() || "Şu anki ayarlar", groups }));
  const readFile = (text) => {
    const v = validateProfile(text);
    if (!v.ok) { setImportError(v.error); say(v.error, "error"); return; }
    setImportError(null);
    setPending({ profile: v.profile, source: "file" });
  };
  const importFile = async () => {
    const open = window.elitlig?.files?.open;
    if (open) {
      const r = await open([{ name: "Ayar şablonu", extensions: ["json"] }]);
      if (!r?.ok) return;
      readFile(new TextDecoder().decode(r.data));
      return;
    }
    fileRef.current?.click();
  };
  const apply = (profile, chosen, replace) => {
    const res = applyProfile(store(), profile, { groups: chosen, replaceGroup: replace });
    setPending(null);
    const reload = onApplied?.(res.applied) ?? true;
    setNeedsReload(Boolean(reload));
    say(`“${profile.name}” uygulandı (${res.keys} ayar).`);
  };

  return (
    <>
      {needsReload && (
        <div className="st-set__wide st-note is-warn st-prof__reload">
          <Icon name="refresh" size={14} /> Bazı ayarlar (grafik, gol müziği, YouTube, sahneler…) stüdyo yeniden yüklenince tam uygulanır.
          <span className="st-top__spacer" />
          <button type="button" className="btn btn--sm" disabled={!canReload} title={canReload ? "Stüdyoyu yeniden yükle" : "Yayın / kayıt sürerken yeniden yüklenemez"} onClick={() => window.location.reload()}><Icon name="refresh" size={12} /> Şimdi yeniden yükle</button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => setNeedsReload(false)} title="Kapat"><Icon name="x" size={12} /></button>
        </div>
      )}
      <Section title="Şu anki ayarları şablon olarak kaydet" sub="Tercihler, ayarlar, kısayol şeridi, alt panel düzeni, gizli parçalar, LED, grafik ve gol müziği ayarları — seçtiğin gruplar.">
        <div className="st-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Şablon adı (ör. Hafta sonu maçı, Tek kamera)" maxLength={80} onKeyDown={(e) => { if (e.key === "Enter") saveCurrent(); }} />
          <button type="button" className="btn btn--primary btn--sm" onClick={saveCurrent}><Icon name="plus" size={13} /> Kaydet</button>
        </div>
        <GroupChecks value={groups} onChange={setGroups} />
        <div className="st-row st-row--wrap">
          <button type="button" className="btn btn--sm" onClick={exportCurrent}><Icon name="download" size={13} /> Şu anki ayarları dosyaya aktar (.json)</button>
          <button type="button" className="btn btn--sm" onClick={importFile}><Icon name="upload" size={13} /> Dosyadan içe aktar…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readFile(await f.text()); }} />
        </div>
        {importError && <p className="st-hint text-red">{importError}</p>}
      </Section>

      <Section title={`Hazır ayar kayıtları (${items.length})`} sub="Uygula: önce neyin değişeceği gösterilir. Dışa aktar: dosyayı başka bilgisayara taşı, orada “Dosyadan içe aktar”.">
        {!items.length && <p className="st-hint">Henüz şablon yok. Yukarıdan şu anki ayarları kaydet.</p>}
        <ul className="st-prof__list">
          {items.map((it) => {
            const sum = profileSummary(it.profile);
            return (
              <li key={it.id}>
                <span className="st-prof__icon"><Icon name="sliders" size={15} /></span>
                <span className="st-prof__name"><strong>{it.profile.name}</strong><small>{dateText(it.profile.createdAt)} · {sum.keys} ayar · {sum.labels.join(", ")}</small></span>
                <button type="button" className="btn btn--xs btn--primary" onClick={() => setPending({ profile: it.profile, source: "saved" })}><Icon name="check" size={11} /> Uygula</button>
                <button type="button" className="btn btn--xs" onClick={() => exportOne(it.profile)} title="Dosyaya aktar (.json)"><Icon name="download" size={11} /> Dışa aktar</button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => overwrite(it)} title="Şu anki ayarlarla güncelle"><Icon name="refresh" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} title="Sil"><Icon name="trash" size={12} /></button>
              </li>
            );
          })}
        </ul>
      </Section>

      {pending && (
        <ApplyDialog profile={pending.profile} source={pending.source} onClose={() => setPending(null)}
          onApply={(g, replace) => apply(pending.profile, g, replace)}
          onSaveCopy={pending.source === "file" ? () => { setItems((cur) => [{ id: newProfileId(), profile: pending.profile }, ...cur]); say(`“${pending.profile.name}” şablonlara eklendi.`); } : null} />
      )}
    </>
  );
}
