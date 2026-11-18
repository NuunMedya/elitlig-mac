// Elitlig Araçlar · "Yayın Stüdyosu" girişi (2.36.0).
//
// Yayın Stüdyosu artık ayrı bir uygulama: Elitlig Stüdyo (app/studio-app). Bu giriş:
//   - Elitlig Stüdyo kuruluysa "Elitlig Stüdyo'yu aç": ayarlar dışa aktarılır (sahneler, yerleşim,
//     kısayollar …), oturum şifreli devirle verilir — Stüdyo'da yeniden giriş gerekmez.
//   - Kurulu değilse indirme bağlantısı.
//   - Geçiş sürümü için yerleşik stüdyo da açılabilir ("Bu sefer yerleşik stüdyoyu aç" ya da
//     "Her zaman yerleşik stüdyoyu kullan"). Yerleşik stüdyonun kodu ve ana süreç IPC'si yalnız
//     açılınca yüklenir (studio.ensure → main.js ensureStudio).
import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Icon, Spinner, useToast } from "../../components/ui";
import { collectStudioEntries } from "../../lib/studioMigration";

// Yerleşik stüdyo: önce ana süreçte stüdyo kurulur (IPC, ffmpeg yolu), sonra arayüz kodu yüklenir.
const Studio = lazy(async () => {
  try { await window.elitlig?.studio?.ensure?.(); } catch { /* eski ana süreç: zaten kurulu */ }
  return import("./Studio");
});

export const BUILTIN_KEY = "araclar.studioBuiltin";
const readBuiltin = () => { try { return localStorage.getItem(BUILTIN_KEY) === "1"; } catch { return false; } };

/** Stüdyo ayarlarını ortak klasöre yazar (Elitlig Stüdyo ilk açılışta alır). */
export async function exportStudioState() {
  try { return await window.elitlig?.studioLink?.exportState?.(collectStudioEntries(window.localStorage)); } catch { return null; }
}

export default function StudioGate(props) {
  const toast = useToast();
  const [builtin, setBuiltin] = useState(() => readBuiltin() || !window.elitlig?.studioLink);
  const [always, setAlways] = useState(readBuiltin);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (builtin) return undefined;
    let alive = true;
    const check = () => window.elitlig.studioLink.status().then((s) => { if (alive) setStatus(s); }).catch(() => { if (alive) setStatus({ installed: false }); });
    check();
    // İndirip kurduktan sonra pencereye dönülünce düğme kendiliğinden "Aç" olur.
    window.addEventListener("focus", check);
    return () => { alive = false; window.removeEventListener("focus", check); };
  }, [builtin]);

  const openApp = useCallback(async () => {
    setBusy(true);
    await exportStudioState();
    const res = await window.elitlig.studioLink.open().catch((e) => ({ ok: false, error: e?.message }));
    setBusy(false);
    if (res?.ok) toast("Elitlig Stüdyo açılıyor…", { tone: "success", timeout: 3500 });
    else if (res?.installed === false) { setStatus((s) => ({ ...(s || {}), installed: false })); toast("Elitlig Stüdyo bu bilgisayarda bulunamadı.", { tone: "warn" }); }
    else toast(`Elitlig Stüdyo açılamadı${res?.error ? `: ${res.error}` : ""}.`, { tone: "error" });
  }, [toast]);
  const openBuiltin = useCallback(() => {
    try { localStorage.setItem(BUILTIN_KEY, always ? "1" : "0"); } catch { /* yoksay */ }
    setBuiltin(true);
  }, [always]);

  if (builtin) {
    return <Suspense fallback={<div className="boot"><Spinner label="Yayın Stüdyosu yükleniyor…" /></div>}><Studio {...props} /></Suspense>;
  }
  const installed = Boolean(status?.installed);
  return (
    <div className="studio-gate">
      <button type="button" className="btn btn--ghost studio-gate__back" onClick={() => props.go?.("today")}><Icon name="chevronLeft" size={14} /> Elitlig Araçlar'a dön</button>
      <div className="studio-gate__card">
        <Icon name="broadcast" size={34} strokeWidth={2} />
        <h1>Yayın Stüdyosu artık ayrı bir uygulama: Elitlig Stüdyo</h1>
        <p>Yalnız yayın için hafif bir uygulama: Elitlig Araçlar'ın sekmeleri, mesajları ve araçları yayın sırasında bellek ve işlemci harcamaz. Sahneleriniz, yerleşiminiz, kısayollarınız ve ön ayarlarınız aktarılır; Elitlig Araçlar'dan açınca yeniden giriş gerekmez. İki uygulama yan yana çalışabilir.</p>
        {!status ? <Spinner label="Denetleniyor…" /> : installed ? (
          <button type="button" className="btn btn--primary btn--lg" onClick={openApp} disabled={busy}><Icon name="broadcast" size={15} /> Elitlig Stüdyo'yu aç</button>
        ) : (
          <>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => window.elitlig.studioLink.download()}><Icon name="download" size={15} /> Elitlig Stüdyo'yu indir</button>
            <p className="studio-gate__fine">Sürüm sayfasından {window.elitlig?.platform === "win32" ? "Elitlig-Studyo-Setup-<sürüm>.exe" : "Elitlig-Studyo-<sürüm>.dmg"} dosyasını indirip kurun, sonra bu sayfaya dönün.</p>
          </>
        )}
        <div className="studio-gate__alt">
          <button type="button" className="btn btn--ghost" onClick={openBuiltin}>{always ? "Yerleşik stüdyoyu aç" : "Bu sefer yerleşik stüdyoyu aç"}</button>
          <label className="studio-gate__check"><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> Her zaman yerleşik stüdyoyu kullan</label>
        </div>
        <p className="studio-gate__fine">Yerleşik stüdyo bu sürümde yedek olarak duruyor; ayarları Elitlig Stüdyo ile ortak değildir (aktarım tek yönlü, Elitlig Araçlar → Elitlig Stüdyo).</p>
      </div>
    </div>
  );
}
