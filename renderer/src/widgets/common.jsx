// Masaüstü widget'larının ortak parçaları: veri yoklama, oturum, boş / hata görünümü, avatar.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/ui";
import { initials, mediaUrl, senderColor } from "../lib/chatUtils";

export const W = () => window.elitlig;

/** Belirli aralıkla yenilenen eşzamansız veri. */
export function usePoll(fn, ms, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const ref = useRef(fn);
  ref.current = fn;
  const load = useCallback(async () => {
    try {
      const data = await ref.current();
      setState({ data, error: null, loading: false });
    } catch (e) { setState((s) => ({ data: s.data, error: e?.message || String(e), loading: false })); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

/** Oturum durumu (sunucu verisi gereken widget'lar için). */
export function useSignedIn() {
  const [signed, setSigned] = useState(null);
  useEffect(() => {
    const load = () => W().auth.state().then((s) => setSigned(Boolean(s?.signedIn))).catch(() => setSigned(false));
    load();
    return W().auth.onChange(load);
  }, []);
  return signed;
}

/** Oturum + yetkiler (app/access.js: inbox, requests, live…). */
export function useAuth() {
  const [auth, setAuth] = useState(null);
  useEffect(() => {
    const load = () => W().auth.state().then(setAuth).catch(() => setAuth({ signedIn: false }));
    load();
    return W().auth.onChange(load);
  }, []);
  return auth;
}

/** Bir veri yolunda değişiklik olunca (bu ya da başka pencere yazdı) yeniden yükle. */
export function useDataChanged(match, reload) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => W().onDataChanged?.((p) => { const path = String(p?.path || ""); if ((Array.isArray(match) ? match : [match]).some((m) => path.includes(m))) ref.current?.(); }), []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** API isteği → veri; hata fırlatır (usePoll içinde). */
export async function fetchData(path, query, message = "Veri alınamadı.") {
  const res = await W().request({ path, query });
  if (!res.ok) throw new Error(res.error?.message || message);
  return res.data;
}

export const NeedSession = () => (
  <div className="wg-empty"><Icon name="lock" size={16} /><span>Oturum açın</span>
    <button type="button" className="wg-btn" onClick={() => W().widgets.open()}>Uygulamayı aç</button>
  </div>
);
export const Err = ({ text, onRetry }) => <div className="wg-empty is-err"><Icon name="alert" size={15} /><span>{text}</span>{onRetry && <button type="button" className="wg-btn" onClick={onRetry}>Yeniden dene</button>}</div>;
export const Loading = () => <p className="wg-muted">Yükleniyor…</p>;

/** Oturum ister + veri yükleniyor / hata kalıbı. Dönen null değilse onu çiz. */
export function gate(signed, q) {
  if (signed === false) return <NeedSession />;
  if (q.error && !q.data) return <Err text={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  return null;
}

export const dayStart = (d, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
export const money = (v) => `${Math.round(Number(v) || 0).toLocaleString("tr-TR")} ₺`;
export const shortMoney = (v) => {
  const n = Math.abs(Number(v) || 0);
  const sign = Number(v) < 0 ? "−" : "";
  if (n >= 1e6) return `${sign}${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} mn ₺`;
  if (n >= 1e4) return `${sign}${(n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} bin ₺`;
  return `${sign}${Math.round(n).toLocaleString("tr-TR")} ₺`;
};
/** "2026-11-12" (gün) → o günün yerel öğlesi (saat dilimi kaymasın). */
export const dateOnly = (s) => new Date(String(s || "").length === 10 ? `${s}T12:00:00` : s);
export const daysFromToday = (s, now = new Date()) => Math.round((dayStart(dateOnly(s)) - dayStart(now)) / 86400000);
export const dueLabel = (s, now = new Date()) => {
  const d = daysFromToday(s, now);
  if (!Number.isFinite(d)) return "";
  if (d === 0) return "bugün";
  if (d === 1) return "yarın";
  if (d === -1) return "dün";
  if (d < 0) return `${-d} gün gecikti`;
  if (d < 7) return `${d} gün sonra`;
  return dateOnly(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

export function Avatar({ name, url, id, size = 28, group = false }) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? mediaUrl(url) : null;
  return (
    <span className="wg-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), "--av": senderColor(id ?? name) }}>
      {src ? <img src={src} alt="" onError={() => setBroken(true)} /> : group ? <Icon name="users" size={Math.round(size * 0.5)} strokeWidth={2} /> : initials(name)}
    </span>
  );
}

/** Sekme benzeri küçük süzgeç düğmeleri. */
export function Chips({ value, options, onChange, label }) {
  return (
    <div className="wg-chips" role="tablist" aria-label={label}>
      {options.map(([v, l, n]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
          {l}{n ? <em>{n}</em> : null}
        </button>
      ))}
    </div>
  );
}

/** Uygulamada bir görünümü aç (nesne bağımsız değişkenle de). */
export const openApp = (route, arg) => (arg ? W().launcher?.open(route, arg) : W().widgets.open(route));
