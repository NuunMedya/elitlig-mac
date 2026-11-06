// "Yükleme günlüğü": ana sürecin her yükleme denemesi (studio.diagnostics().uploads,
// en yeni önce) — durum, uç, sunucu iletisi (Türkçe), zaman. Açıkken 5 sn'de bir yenilenir.
// "Sunucu sınaması": POST /api/admin/live-streams/uploads/self-test — sunucu küçük
// bir dosyayla yükleme zincirini (Spaces ayarı, tablolar, ön imzalı PUT, doğrulama,
// yayın adresi) dener; başarısız adım ve nedeni burada görünür.
import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { request } from "../../../api";

const KIND = { clip: "Gol klibi", highlight: "Özet", interview: "Röportaj", render: "Özet oluşturma", selftest: "Sunucu sınaması" };
const STEP = { config: "Spaces ayarı", schema: "Veritabanı tabloları", presign: "Ön imzalı adres", put: "Spaces'e yükleme", head: "Yüklemeyi doğrulama", public: "Sitede görünürlük", delete: "Sınama dosyasını silme" };

/** Öz-sınama yanıtı → Türkçe satırlar. */
export function selfTestLines(res) {
  if (!res) return [];
  if (!res.ok && !res.data) {
    const st = Number(res.error?.status);
    const msg = st === 404 && !res.error?.code ? "Sunucu güncel değil: yükleme sınaması ucu henüz yayında değil." : res.offline ? "Bağlantı yok." : res.error?.message || "Sınama çalıştırılamadı.";
    return [{ ok: false, label: "Sunucu sınaması", text: msg }];
  }
  const steps = Array.isArray(res.data?.steps) ? res.data.steps : [];
  return steps.map((x) => ({ ok: x.ok !== false, label: STEP[x.step] || x.step, text: x.ok === false ? [x.code, x.message].filter(Boolean).join(" · ") || "Başarısız" : `tamam${x.ms ? ` · ${x.ms} ms` : ""}` }));
}
const timeText = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export default function UploadLog({ defaultOpen = false, limit = 30 }) {
  const api = window.elitlig?.studio;
  const [open, setOpen] = useState(defaultOpen);
  const [st, setSt] = useState({ loading: false, list: [], error: null });
  const load = useCallback(async () => {
    if (!api?.diagnostics) return;
    setSt((s) => ({ ...s, loading: true }));
    try {
      const d = await api.diagnostics();
      setSt({ loading: false, list: Array.isArray(d?.uploads) ? d.uploads : [], error: null });
    } catch (e) { setSt({ loading: false, list: [], error: e?.message || "Günlük alınamadı." }); }
  }, [api]);
  const [test, setTest] = useState({ running: false, lines: null });
  const runTest = useCallback(async (e) => {
    e?.stopPropagation?.();
    setTest({ running: true, lines: null });
    let res;
    try { res = await request({ method: "POST", path: "/api/admin/live-streams/uploads/self-test", body: {}, cache: false, queue: false }); } catch (err) { res = { ok: false, error: { message: err?.message } }; }
    setTest({ running: false, lines: selfTestLines(res) });
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [open, load]);
  if (!api?.diagnostics) return null;
  const fails = st.list.filter((x) => x.ok === false).length;
  return (
    <section className={`md-ulog ${open ? "is-open" : ""}`}>
      <button type="button" className="md-ulog__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="upload" size={13} /><strong>Yükleme günlüğü</strong>
        {open && fails > 0 && <span className="pill pill--xs pill--red">{fails} hata</span>}
        <span className="st-top__spacer" />
        {open && <span role="button" tabIndex={0} className="icon-btn icon-btn--xs" title="Yenile" onClick={(e) => { e.stopPropagation(); load(); }}><Icon name="refresh" size={12} /></span>}
        <Icon name={open ? "chevronUp" : "chevronDown"} size={13} />
      </button>
      {open && (
        <div className="md-ulog__test">
          <button type="button" className="btn btn--xs" disabled={test.running} onClick={runTest} title="Sunucu, küçük bir dosyayla yükleme zincirini dener">
            <Icon name="refresh" size={12} /> {test.running ? "Sınanıyor…" : "Sunucu yükleme sınaması"}
          </button>
          {test.lines && (
            <ul className="md-ulog__list">
              {test.lines.map((l, i) => (
                <li key={`t-${i}`} className={l.ok ? "is-ok" : "is-fail"}>
                  <span className={`md-ulog__st ${l.ok ? "is-ok" : "is-fail"}`}>{l.ok ? "OK" : "HATA"}</span>
                  <span className="md-ulog__main"><b>{l.label}</b><small className={l.ok ? "muted" : "text-red"}>{l.text}</small></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {open && (
        <ul className="md-ulog__list">
          {st.error && <li className="text-red">{st.error}</li>}
          {!st.error && !st.list.length && <li className="st-hint">{st.loading ? "Yükleniyor…" : "Henüz yükleme yok."}</li>}
          {st.list.slice(0, limit).map((x, i) => (
            <li key={`${x.at}-${i}`} className={x.ok === false ? "is-fail" : x.ok ? "is-ok" : ""}>
              <span className={`md-ulog__st ${x.ok === false ? "is-fail" : "is-ok"}`}>{x.status || (x.ok ? "OK" : x.offline ? "ÇEVRİMDIŞI" : "HATA")}</span>
              <span className="md-ulog__main">
                <b>{KIND[x.kind] || x.kind || "Yükleme"}{x.matchId ? ` · maç ${x.matchId}` : ""}{x.eventId ? ` · olay ${x.eventId}` : ""}</b>
                <small title={x.endpoint}>{x.method ? `${x.method} ` : ""}{x.endpoint || ""}</small>
                {(x.message || x.code) && <small className={x.ok === false ? "text-red" : "muted"}>{[x.code, x.message].filter(Boolean).join(" · ")}</small>}
              </span>
              <time>{timeText(x.at)}{x.durationMs ? ` · ${(x.durationMs / 1000).toFixed(1)} sn` : ""}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
