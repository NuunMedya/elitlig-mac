// Rehberden ekle: kişisel Rehber kartları, Elitlig üye rehberi (yetkiyle) ve
// portföyden seçilen kayıtlar projenin arama listesine KOPYALANIR. Proje
// listesi Rehber'e yazılmaz; Rehber de proje listesine karışmaz.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, ErrorNote, Field, Icon, Modal, Spinner } from "../../components/ui";
import { get, useDebounced } from "../../api";
import { prettyPhone } from "../../lib/helpers";
import { kindSettings } from "../../lib/projectUtils";
import { Avatar, BASE } from "./common";

const SOURCE_INFO = {
  contacts: { icon: "user", hint: "Kendi Rehber kartlarınız" },
  members: { icon: "users", hint: "Siteye kayıtlı üyeler, oyuncular, takım başkanları" },
  portfolio: { icon: "briefcase", hint: "Erişebildiğiniz projelerin portföyü" },
};
const MEMBER_CATEGORIES = [["", "Tüm üyeler"], ["oyuncu", "Oyuncu"], ["takim_baskani", "Takım başkanı"], ["uye", "Üye"], ["yonetim", "Yönetim"]];
const rowKey = (r) => `${r.source}:${r.ref_id}`;

export default function DirectoryImport({ ctx, kind: initialKind = "customer", stage: initialStage = "", onClose }) {
  const { project, settings, actions } = ctx;
  const [source, setSource] = useState("contacts");
  const [q, setQ] = useState("");
  const query = useDebounced(q, 250);
  const [category, setCategory] = useState("");
  const [state, setState] = useState({ items: [], sources: null, hasMore: false, page: 1, loading: true, error: null });
  const [picked, setPicked] = useState(() => new Map());
  const [kind, setKind] = useState(initialKind);
  const stages = kindSettings(settings, kind).lead_stages;
  const [stage, setStage] = useState(initialStage && stages.some((s) => s.key === initialStage) ? initialStage : stages[0]?.key || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!stages.some((s) => s.key === stage)) setStage(stages[0]?.key || ""); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (page = 1) => {
    setState((s) => ({ ...s, loading: true, error: null, ...(page === 1 ? { items: [] } : {}) }));
    const r = await get(`${BASE}/${project.id}/directory`, { source, q: query || undefined, category: source === "members" ? category || undefined : undefined, page });
    setState((s) => ({
      items: r.ok ? (page === 1 ? r.data.items : [...s.items, ...r.data.items]) : s.items,
      sources: r.ok ? r.data.sources : s.sources,
      hasMore: Boolean(r.ok && r.data.has_more),
      page,
      loading: false,
      error: r.ok ? null : r.offline ? { message: "Çevrimdışısınız: Rehber'den aktarmak için internet bağlantısı gerekir." } : r.error,
    }));
  };
  useEffect(() => { load(1); }, [source, query, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = state.sources || [{ key: "contacts", label: "Rehberim", available: true }, { key: "members", label: "Elitlig üye rehberi", available: true }, { key: "portfolio", label: "Portföy", available: true }];
  const current = sources.find((s) => s.key === source);
  const selectable = state.items.filter((r) => !r.in_project);
  const allOn = selectable.length > 0 && selectable.every((r) => picked.has(rowKey(r)));
  const toggle = (r) => setPicked((m) => { const n = new Map(m); if (n.has(rowKey(r))) n.delete(rowKey(r)); else n.set(rowKey(r), r); return n; });
  const toggleAll = () => setPicked((m) => { const n = new Map(m); selectable.forEach((r) => (allOn ? n.delete(rowKey(r)) : n.set(rowKey(r), r))); return n; });
  const bySource = useMemo(() => [...picked.values()].reduce((acc, r) => ({ ...acc, [r.source]: (acc[r.source] || 0) + 1 }), {}), [picked]);

  const submit = async () => {
    setBusy(true);
    const r = await actions.importDirectory({ items: [...picked.values()].map((x) => ({ source: x.source, ref_id: x.ref_id })), kind, stage: stage || undefined });
    setBusy(false);
    if (r) onClose();
  };

  return (
    <Modal title="Rehberden ekle" onClose={onClose} width={980} className="modal--wide dir-import"
      footer={<>
        <span className="muted small spacer"><Icon name="lock" size={12} /> Proje listesi Rehber'e eklenmez: seçilenler yalnız bu projenin {kind === "supplier" ? "tedarik" : "arama"} listesine kopyalanır.</span>
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={!picked.size || busy} onClick={submit}><Icon name="chevronRight" size={13} /> {busy ? "Taşınıyor…" : `Seçilenleri listeye taşı (${picked.size})`}</button>
      </>}>
      <div className="dir-import__layout">
        <nav className="dir-sources" aria-label="Kaynak">
          {sources.map((s) => (
            <button key={s.key} type="button" className={`dir-source ${source === s.key ? "is-active" : ""}`} disabled={!s.available} onClick={() => { setSource(s.key); setCategory(""); }} title={s.available ? SOURCE_INFO[s.key]?.hint : "Üye rehberini görmek için “Üyeleri görüntüleme” yetkisi gerekir."}>
              <span className="dir-source__icon"><Icon name={SOURCE_INFO[s.key]?.icon || "user"} size={15} /></span>
              <span><strong>{s.label}</strong><small>{s.available ? SOURCE_INFO[s.key]?.hint : "Yetkiniz yok · “Üyeleri görüntüleme” gerekir"}</small></span>
              {bySource[s.key] ? <span className="pill pill--tool pill--xs">{bySource[s.key]}</span> : !s.available ? <Icon name="lock" size={12} /> : null}
            </button>
          ))}
          <div className="dir-target">
            <span className="field__label">Hedef liste</span>
            <div className="seg seg--sm dir-target__kind">
              {[["customer", "Müşteri"], ["supplier", "Tedarik"]].map(([k, l]) => <button key={k} type="button" className={kind === k ? "is-active" : ""} onClick={() => setKind(k)}>{l}</button>)}
            </div>
            <Field label="Aşama"><select value={stage} onChange={(e) => setStage(e.target.value)}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
            <small className="muted">Aynı telefon ya da e-postayla listede olanlar atlanır.</small>
          </div>
        </nav>
        <div className="dir-results">
          <div className="filters">
            <div className="search-box search-box--full"><Icon name="search" size={14} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={source === "members" ? "Üye adı, telefon, takım…" : "Ad, firma, telefon, e-posta, şehir…"} aria-label="Ara" /></div>
            {source === "members" && <select className="select-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Üye kategorisi">{MEMBER_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
          </div>
          {current && !current.available ? (
            <Empty icon="lock" title="Üye rehberine erişiminiz yok" text="Elitlig üye rehberinden kişi aktarmak için “Üyeleri görüntüleme” yetkisi gerekir. Rehberim ve Portföy'den aktarabilirsiniz." />
          ) : (<>
            <div className="dir-results__bar">
              <label className="toggle"><input type="checkbox" checked={allOn} disabled={!selectable.length} onChange={toggleAll} /> Görünenlerin tümünü seç</label>
              <span className="spacer" />
              <small className="muted">{state.items.length} kayıt{state.items.some((r) => r.in_project) ? ` · ${state.items.filter((r) => r.in_project).length} zaten listede` : ""}</small>
            </div>
            <ErrorNote error={state.error} onRetry={() => load(1)} />
            <div className="pick-rows dir-rows">
              {state.items.map((r) => {
                const on = picked.has(rowKey(r));
                return (
                  <label key={rowKey(r)} className={`pick-row ${on ? "is-on" : ""} ${r.in_project ? "is-dup" : ""}`}>
                    <input type="checkbox" checked={on} disabled={Boolean(r.in_project)} onChange={() => toggle(r)} />
                    <Avatar name={r.name} size={28} />
                    <span><strong>{r.name}</strong><small>{[r.company, r.title && r.title !== r.category ? r.title : null, prettyPhone(r.phone), r.email, r.city].filter(Boolean).join(" · ") || "—"}</small></span>
                    {r.category && <span className="pill pill--xs">{r.category}</span>}
                    {r.in_project && <span className="pill pill--green pill--xs"><Icon name="check" size={9} strokeWidth={3} /> Listede</span>}
                  </label>
                );
              })}
              {!state.loading && !state.items.length && !state.error && <Empty icon="search" title={q ? "Sonuç yok" : "Kayıt yok"} text={source === "contacts" ? "Rehber'e eklediğiniz kişiler burada görünür." : source === "portfolio" ? "Portföy kayıtları burada görünür." : ""} />}
              {state.loading && <Spinner label="Yükleniyor…" />}
              {state.hasMore && !state.loading && <button type="button" className="btn btn--sm btn--ghost" onClick={() => load(state.page + 1)}>Daha fazla göster</button>}
            </div>
          </>)}
        </div>
      </div>
    </Modal>
  );
}
