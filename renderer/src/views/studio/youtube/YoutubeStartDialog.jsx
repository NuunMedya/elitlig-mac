// YouTube YAYIN AYARLARI penceresi — "Yayını başlat"tan önce (ve yayın sürerken
// "YouTube ayarlarını düzenle" ile).
//
//   Ön dolum   sunucu taslağı (GET /matches/:id/youtube-draft) → yoksa varsayılan ön
//              ayar → yoksa maç adı. Pencere açılır açılmaz "Hemen başlat" (Enter) hazır.
//   Alanlar    başlık, açıklama, gizlilik (Herkese açık / Liste dışı / Özel), etiketler,
//              gecikme, DVR, çocuklara yönelik. Yer tutucular ({home} {away} {date} …)
//              yazılabilir: altta maçın verisiyle canlı önizleme.
//   Ön ayarlar sunucuda ortak (başka maçlarda da): seç, "ön ayar olarak kaydet",
//              güncelle, sil, varsayılan yap. Sunucu uçları yoksa bu bilgisayarda.
// mode "edit": yayın sürerken PATCH /matches/:id/youtube (gecikme / DVR / çocuk değişmez).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Field, Icon, Kbd, Modal } from "../../../components/ui";
import {
  LATENCY_OPTIONS, PLACEHOLDERS, PRIVACY_OPTIONS, TITLE_MAX, defaultTitle, normalizeSettings, parseTags, presetFromSettings, readTitleUpper, renderTemplate,
  settingsFromPreset, tagsText, templateVars, upperTr, validateSettings, writeTitleUpper,
} from "./templates";
import { useYoutubePresets } from "./useYoutubePresets";
import { CoverStartRow } from "./cover/CoverDialog"; // [kapak]
import { useAutoCover } from "./cover/useCoverUpload"; // [kapak]
import "./youtube.css";

const hasPlaceholder = (s) => /\{\w+\}/.test(String(s || ""));

/** Formdaki (yer tutuculu olabilir) değerler → gönderilecek ayarlar. */
export function resolveForm(form, vars, { upper = false } = {}) {
  const title = renderTemplate(form.title, vars);
  return normalizeSettings({
    ...form,
    title: upper ? upperTr(title) : title,
    description: renderTemplate(form.description, vars),
    tags: parseTags(form.tagsText).map((t) => renderTemplate(t, vars)).filter(Boolean),
  });
}

const toForm = (s) => {
  const n = normalizeSettings(s);
  return { ...n, title: String(s?.title ?? n.title), description: String(s?.description ?? n.description), tagsText: tagsText(n.tags) };
};

export default function YoutubeStartDialog({ mode = "start", yt, match, homeName, awayName, onStart, onSaved, onClose, toast }) {
  const edit = mode === "edit";
  const presets = useYoutubePresets();
  const vars = useMemo(() => templateVars(match, { homeName, awayName, matchId: yt?.matchId }), [match, homeName, awayName, yt?.matchId]);
  // "Başlığı büyük harf yap" (varsayılan açık): gönderilen başlık Türkçe büyük harfe çevrilir.
  const [upper, setUpperState] = useState(() => readTitleUpper());
  const setUpper = (on) => { setUpperState(on); writeTitleUpper(on); };
  // Varsayılan biçim: "<LİG / TURNUVA> <SEZON> <TUR> · ELİTLİG" (sunucu taslağı / ön ayar yoksa).
  const fallbackTitle = defaultTitle(vars, { upper });
  const [form, setForm] = useState(() => toForm({ title: fallbackTitle, privacy: yt?.privacy || "public" }));
  const [presetId, setPresetId] = useState("");
  const [source, setSource] = useState("loading"); // loading | draft | preset | stream | fallback
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState(null); // null: kapalı, "": ad yazılıyor
  const focusRef = useRef("title");
  const set = (patch) => { setTouched(true); setForm((f) => ({ ...f, ...patch })); };

  // Ön dolum: (düzenle: yayının kendi ayarları) → sunucu taslağı → varsayılan ön ayar → maç adı.
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = yt?.stream;
      if (edit && s && (s.title || s.description)) {
        if (alive && !touched) { setForm(toForm({ title: s.title, description: s.description, privacy: s.privacy || yt.privacy, tags: s.tags })); setSource("stream"); }
        return;
      }
      const draft = await yt?.loadDraft?.().catch(() => null);
      if (!alive) return;
      if (draft && (draft.title || draft.description)) {
        if (!touched) { setForm(toForm(draft)); setSource("draft"); if (draft.preset_id != null) setPresetId(String(draft.preset_id)); }
        return;
      }
      setSource((cur) => (cur === "loading" ? "fallback" : cur));
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Taslak / ön ayar yoksa: maç verisi sonradan gelirse (lig, sezon, tur) varsayılan başlık güncellenir.
  useEffect(() => {
    if (!edit && source === "fallback" && !touched) setForm((f) => (f.title === fallbackTitle ? f : { ...f, title: fallbackTitle }));
  }, [fallbackTitle, source, touched, edit]);
  // Taslak yoksa varsayılan ön ayar.
  useEffect(() => {
    if (source !== "fallback" || touched || presets.loading) return;
    const def = presets.items.find((p) => p.is_default);
    if (def) { setForm(toForm(settingsFromPreset(def, vars))); setPresetId(def.id); setSource("preset"); setUpperState(def.uppercase !== false); }
  }, [source, touched, presets.loading, presets.items, vars]);

  const resolved = useMemo(() => resolveForm(form, vars, { upper }), [form, vars, upper]);
  const problems = validateSettings({ ...resolved, title: resolved.title || fallbackTitle });
  const blocking = problems.filter((p) => !p.startsWith("Başlık boş"));
  const showPreview = hasPlaceholder(form.title) || hasPlaceholder(form.description) || hasPlaceholder(form.tagsText) || (upper && resolved.title !== form.title.trim());
  const selected = presets.items.find((p) => p.id === presetId) || null;

  const applyPreset = (id) => {
    setPresetId(id);
    const p = presets.items.find((x) => x.id === id);
    if (p) { setTouched(true); setForm(toForm(settingsFromPreset(p, vars))); setUpperState(p.uppercase !== false); }
  };
  const insert = (key) => {
    const field = focusRef.current === "description" ? "description" : focusRef.current === "tags" ? "tagsText" : "title";
    set({ [field]: `${form[field] || ""}${form[field] && !/\s$/.test(form[field]) ? " " : ""}{${key}}` });
  };
  const run = async (fn, ok) => {
    setSaving(true);
    try { await fn(); if (ok) toast?.(ok, { tone: "success" }); } catch (e) { toast?.(e?.message || "İşlem yapılamadı.", { tone: "error", timeout: 5000 }); } finally { setSaving(false); }
  };
  const savePreset = () => run(async () => {
    const item = await presets.create(presetFromSettings(newName || form.title || "Ön ayar", { ...form, uppercase: upper, tags: parseTags(form.tagsText) }, vars));
    if (item?.id) setPresetId(String(item.id));
    setNewName(null);
  }, presets.local ? "Ön ayar bu bilgisayara kaydedildi." : "Ön ayar kaydedildi (tüm maçlarda kullanılabilir).");
  const updatePreset = () => selected && run(() => presets.update(selected.id, { ...presetFromSettings(selected.name, { ...form, uppercase: upper, tags: parseTags(form.tagsText) }, vars), is_default: selected.is_default }), "Ön ayar güncellendi.");
  const removePreset = () => selected && run(async () => { await presets.remove(selected.id); setPresetId(""); }, "Ön ayar silindi.");
  const toggleDefault = () => selected && run(() => presets.setDefault(selected.is_default ? null : selected.id), selected.is_default ? "Varsayılan kaldırıldı." : `“${selected.name}” varsayılan yapıldı.`);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (blocking.length || saving) return;
    const out = { ...resolved, title: resolved.title || fallbackTitle };
    if (edit) {
      setSaving(true);
      try { await yt.updateSettings(out); toast?.("YouTube ayarları güncellendi.", { tone: "success" }); onSaved?.(out); onClose?.(); } catch (err) { toast?.(err?.message || "YouTube ayarları kaydedilemedi.", { tone: "error", timeout: 6000 }); } finally { setSaving(false); }
      return;
    }
    onClose?.();
    onStart?.(out);
  };
  // Enter (çok satırlı alan dışında) → başlat / kaydet.
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT" && e.target.tagName !== "BUTTON" && newName == null) submit(e);
  };

  const footer = (
    <>
      <span className="yt-src muted">{source === "loading" ? "Sunucu taslağı alınıyor…" : source === "draft" ? "Sunucu taslağından" : source === "preset" ? "Varsayılan ön ayardan" : source === "stream" ? "Yayının ayarları" : "Maç adından"}</span>
      <span style={{ flex: 1 }} />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className={`btn ${edit ? "btn--primary" : "btn--red"} yt-go`} disabled={Boolean(blocking.length) || saving} onClick={submit}>
        <Icon name={edit ? "check" : "broadcast"} size={14} /> {edit ? "YouTube'a kaydet" : "Hemen başlat"} <Kbd>↩</Kbd>
      </button>
    </>
  );

  return (
    <Modal title={edit ? "YouTube ayarlarını düzenle" : "YouTube'da yayını başlat"} onClose={onClose} width={720} className="st-modal yt-dialog" footer={footer}>
      <form className="yt-form" onSubmit={submit} onKeyDown={onKeyDown}>
        <div className="yt-presets">
          <Icon name="star" size={13} />
          <select value={presetId} onChange={(e) => (e.target.value ? applyPreset(e.target.value) : setPresetId(""))} aria-label="Ön ayar" disabled={presets.loading}>
            <option value="">{presets.loading ? "Ön ayarlar yükleniyor…" : presets.items.length ? "Ön ayar seç…" : "Ön ayar yok"}</option>
            {presets.items.map((p) => <option key={p.id} value={p.id}>{p.is_default ? "★ " : ""}{p.name}</option>)}
          </select>
          {selected && (
            <>
              <button type="button" className={`btn btn--xs ${selected.is_default ? "is-on" : ""}`} disabled={saving} onClick={toggleDefault} title="Yeni maçlarda pencere bu ön ayarla dolsun">{selected.is_default ? "★ Varsayılan" : "☆ Varsayılan yap"}</button>
              <button type="button" className="btn btn--xs" disabled={saving} onClick={updatePreset} title="Seçili ön ayarı bu ayarlarla güncelle">Güncelle</button>
              <button type="button" className="icon-btn icon-btn--xs" disabled={saving} onClick={removePreset} title="Ön ayarı sil"><Icon name="trash" size={12} /></button>
            </>
          )}
          <span className="st-top__spacer" />
          {newName == null
            ? <button type="button" className="btn btn--xs btn--soft" onClick={() => setNewName("")} title="Bu ayarları adlandırıp sakla (maç adları {home} / {away} olarak saklanır)"><Icon name="plus" size={11} /> Ön ayar olarak kaydet</button>
            : (
              <span className="yt-newpreset">
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ön ayar adı (ör. Süper Lig maçı)" maxLength={60}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); savePreset(); } if (e.key === "Escape") { e.stopPropagation(); setNewName(null); } }} />
                <button type="button" className="btn btn--xs btn--primary" disabled={saving} onClick={savePreset}>Kaydet</button>
                <button type="button" className="btn btn--xs btn--ghost" onClick={() => setNewName(null)}>Vazgeç</button>
              </span>
            )}
        </div>
        {presets.local && <p className="st-hint yt-local">{presets.error || "Sunucuda ön ayar desteği yok: ön ayarlar bu bilgisayarda saklanıyor."}</p>}

        <Field label={`Başlık · ${resolved.title.length || fallbackTitle.length}/${TITLE_MAX}`}>
          <input autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} onFocus={() => { focusRef.current = "title"; }} placeholder={fallbackTitle} maxLength={300} spellCheck={false} />
        </Field>
        <label className="toggle yt-upper" title="Gönderilen başlık Türkçe büyük harfe çevrilir (i → İ): “OSTİM FUTBOL TURNUVASI 1. SEZON SON 16 TURU · ELİTLİG”">
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} data-yt-upper="" /> Başlığı büyük harf yap
        </label>
        <Field label="Açıklama">
          <textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} onFocus={() => { focusRef.current = "description"; }} placeholder="Maçın açıklaması, bağlantılar… (bölümler yayında kendiliğinden eklenir)" />
        </Field>
        <div className="yt-ph">
          <span className="muted">Yer tutucu ekle:</span>
          {PLACEHOLDERS.map((p) => <button key={p.key} type="button" className="st-chip" onClick={() => insert(p.key)} title={`${p.label}: ${vars[p.key] || "—"}`}>{`{${p.key}}`}</button>)}
        </div>

        <div className="yt-row">
          <Field label="Gizlilik">
            <div className="st-seg yt-privacy" role="radiogroup" aria-label="Gizlilik">
              {PRIVACY_OPTIONS.map((p) => <button key={p.key} type="button" role="radio" aria-checked={form.privacy === p.key} className={form.privacy === p.key ? "is-on" : ""} onClick={() => set({ privacy: p.key })} title={p.hint}>{p.label}</button>)}
            </div>
          </Field>
          {!edit && (
            <Field label="Gecikme">
              <select value={form.latency} onChange={(e) => set({ latency: e.target.value, ...(e.target.value === "ultraLow" ? { dvr: false } : {}) })}>
                {LATENCY_OPTIONS.map((l) => <option key={l.key} value={l.key} title={l.hint}>{l.label}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Etiketler" hint="Virgülle ayır (en çok 500 karakter).">
          <input value={form.tagsText} onChange={(e) => set({ tagsText: e.target.value })} onFocus={() => { focusRef.current = "tags"; }} placeholder="elitlig, futbol, {home}, {away}" spellCheck={false} />
        </Field>
        {!edit && (
          <div className="yt-row yt-toggles">
            <label className="toggle" title={form.latency === "ultraLow" ? "Çok düşük gecikmede DVR kullanılamaz" : "İzleyiciler canlıda geri sarabilir"}><input type="checkbox" checked={form.dvr && form.latency !== "ultraLow"} disabled={form.latency === "ultraLow"} onChange={(e) => set({ dvr: e.target.checked })} /> DVR (geri sarma)</label>
            <label className="toggle" title="YouTube kuralı: çocuklara yönelik içerikte yorumlar ve bazı özellikler kapanır"><input type="checkbox" checked={form.made_for_kids} onChange={(e) => set({ made_for_kids: e.target.checked })} /> Çocuklara yönelik</label>
          </div>
        )}
        {edit && <p className="st-hint">Gecikme, DVR ve “çocuklara yönelik” yayın başladıktan sonra değişmez.</p>}

        <CoverStartRow yt={yt} match={match} homeName={homeName} awayName={awayName} toast={toast} />{/* [kapak] */}
        {showPreview && (
          <section className="yt-preview" aria-label="Önizleme">
            <h5>Önizleme <small className="muted">(bu maçın verisiyle)</small></h5>
            <strong>{resolved.title || fallbackTitle}</strong>
            {resolved.description && <pre>{resolved.description}</pre>}
            {resolved.tags.length > 0 && <p className="yt-preview__tags">{resolved.tags.map((t) => <span key={t}>#{t}</span>)}</p>}
          </section>
        )}
        {problems.length > 0 && <ul className="yt-problems">{problems.map((p) => <li key={p} className={blocking.includes(p) ? "text-red" : "muted"}>{p}</li>)}</ul>}
      </form>
    </Modal>
  );
}

/**
 * Başlatma akışı (Studio): request() → pencere (açık yayına devam ediliyorsa doğrudan),
 * "Hemen başlat" → onStart(settings). dialog: çizilecek pencere (ya da null).
 */
export function useYoutubeStart({ yt, matchId, match, homeName, awayName, onStart, toast, canResume }) {
  const [open, setOpen] = useState(false);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  // [kapak] Yayın açıldıktan sonra (ayar açıksa) kapak üretilip YouTube'a yüklenir.
  const autoCover = useAutoCover({ yt, matchId, match, homeName, awayName, toast });
  const request = () => {
    if (!matchId) { toast?.("Önce Maç yönetimi sekmesinden maç aç.", { tone: "warn" }); return; }
    // Açık yayına devam (yeniden bağlanma): ayarlar zaten YouTube'da, pencere sorulmaz.
    if (canResume) { onStartRef.current?.(null); return; }
    setOpen(true);
  };
  const dialog = open
    ? <YoutubeStartDialog yt={yt} match={match} homeName={homeName} awayName={awayName} toast={toast} onStart={async (s) => { await onStartRef.current?.(s); autoCover.afterStart(); }} onClose={() => setOpen(false)} />
    : null;
  return { request, dialog, open };
}
