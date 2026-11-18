// Ayarlar › Performans (2.36.0): ekran kartı / öncelik bayrakları, güvenli mod, çökme günlüğü.
// Bayraklar ana süreçte (userData/performance.json, app/perfFlags.js): Chromium'a uygulama
// açılırken verildikleri için çoğu YENİDEN BAŞLATINCA geçerli olur.
import React, { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { readPerfPrefs, writePerfPrefs } from "../perf/perfPrefs";

const fmt = (iso) => { try { return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return iso; } };
const WHO = { GPU: "Ekran kartı süreci", renderer: "Arayüz süreci", Utility: "Yardımcı süreç", app: "Uygulama" };
const WHY = { crashed: "çöktü", oom: "bellek yetmedi", "launch-failed": "başlatılamadı", "abnormal-exit": "beklenmedik kapanma", "integrity-failure": "bütünlük hatası", killed: "sonlandırıldı", "clean-exit": "normal kapandı", "previous-session-not-closed": "önceki oturum düzgün kapanmadı" };

export default function PerfSection({ Section, Toggle, toast = null }) {
  const perf = typeof window !== "undefined" ? window.elitlig?.perf : null;
  const [st, setSt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [prefs, setPrefs] = useState(readPerfPrefs);
  const load = useCallback(() => { perf?.state?.().then(setSt).catch(() => setSt(null)); }, [perf]);
  useEffect(() => { load(); }, [load]);
  if (!perf) return <Section title="Performans"><p className="st-hint">Bu sürümde performans ayarları yok.</p></Section>;
  const win = st?.platform === "win32";
  const f = st?.flags || {};
  const launch = st?.launch || {};
  const setFlag = async (patch, needsRestart = true) => {
    await perf.set(patch);
    load();
    if (needsRestart) setDirty(true);
  };
  const setPref = (patch) => { const next = writePerfPrefs(patch); setPrefs(next); };
  const crashes = st?.crashes || [];
  return (
    <>
      <Section title="Bu açılış" sub="Sorun giderme: güvenli modda donanım hızlandırma kapalı açılır; çizim ana iş parçacığına geçer, ekran kartı zorlanmaz, ffmpeg normal öncelikte çalışır.">
        <p className={launch.safeMode ? "st-hint text-red" : "st-hint"}>
          <Icon name={launch.safeMode ? "alert" : "check"} size={13} /> {launch.safeMode ? `GÜVENLİ MOD açık (${launch.reason || "?"})` : "Normal mod"}
          {" · "}donanım hızlandırma {launch.hardwareAcceleration === false ? "KAPALI" : "açık"}
          {win ? ` · güçlü ekran kartı ${launch.highPerfGpu ? "isteniyor" : "istenmiyor"}` : ""}
        </p>
        <div className="st-row st-row--wrap">
          {launch.safeMode
            ? <button type="button" className="btn btn--sm" onClick={async () => { await perf.set({ safeMode: false }); perf.relaunch({ safeMode: false }); }}><Icon name="refresh" size={13} /> Normal modda yeniden başlat</button>
            : <button type="button" className="btn btn--sm" onClick={() => perf.relaunch({ safeMode: true })}><Icon name="alert" size={13} /> Güvenli modda yeniden başlat</button>}
          {dirty && <button type="button" className="btn btn--sm btn--primary" onClick={() => perf.relaunch({})}><Icon name="refresh" size={13} /> Değişiklikler için şimdi yeniden başlat</button>}
        </div>
        <p className="st-hint">Komut satırından: <code>--safe-mode</code> (ya da <code>--guvenli-mod</code>). Yayın sürerken yeniden başlatmayın.</p>
      </Section>
      <Section title="Ekran kartı ve kodlayıcı" sub="Varsayılanlar çoğu sistem için güvenlidir. Değişiklikler (ffmpeg önceliği hariç) yeniden başlatınca geçerli.">
        <Toggle checked={f.highPerfGpu !== false} onChange={(v) => setFlag({ highPerfGpu: v })} title={`Güçlü ekran kartını kullan${win ? "" : " (yalnız Windows)"}`}
          text="İki ekran kartlı dizüstülerde (Intel + NVIDIA / AMD) yayını güçlü karta verir. Tek kartlı masaüstünde etkisizdir. Siyah pencere / çökme görürseniz kapatın." />
        <Toggle checked={Boolean(f.ffmpegAboveNormal)} onChange={(v) => setFlag({ ffmpegAboveNormal: v }, false)} title={`Canlı kodlayıcı (ffmpeg) yüksek öncelikte${win ? "" : " (yalnız Windows)"}`}
          text="Yazılım kodlamada (x264) ön plandaki oyun / tarayıcı işlemciyi doldurduğunda yardımcı olur; donanım kodlayıcıda (NVENC / QSV / AMF) gerekmez. Varsayılan kapalı. Bir sonraki yayında geçerli." />
        <Toggle checked={f.hardwareAcceleration !== false} onChange={(v) => setFlag({ hardwareAcceleration: v })} title="Donanım hızlandırma"
          text="Kapatmak yalnız sorun gidermede önerilir: tüm çizim işlemciye biner (yayın ağırlaşır)." />
        <Toggle checked={Boolean(f.safeMode)} onChange={(v) => setFlag({ safeMode: v })} title="Her açılışta güvenli mod" text="Ekran kartı sürücüsü sorunu çözülene dek." />
      </Section>
      <Section title="Çizim" sub="Tekrar / VAR / röportaj / özet görüntüsündeki videolar program çizim işçisinde birleştirilir: arayüz yükü (panel açma, liste kaydırma) tekrar görüntüsünü takılttırmaz.">
        <Toggle checked={prefs.baseVideoWorker !== false} onChange={(v) => setPref({ baseVideoWorker: v })} title="Kip videolarını çizim işçisinde birleştir"
          text="Kapalıyken eski yol: video kareleri ana iş parçacığında çizilir. Stüdyo yeniden açılınca geçerli." />
        <Toggle checked={prefs.parkHidden !== false} onChange={(v) => setPref({ parkHidden: v })} title="Gizli sekmeleri dondur"
          text="Arkada kalan panel sekmeleri çizilmez; 10 sn gizli kalan paneller tamamen kapanır (görünce yeniden açılır)." />
      </Section>
      <Section title="Çökme günlüğü" sub="Ekran kartı (grafik) ya da arayüz süreci çökerse, ya da uygulama düzgün kapanmazsa burada görünür. Windows'un kurtarma moduna düşmesi genellikle ekran kartı sürücüsünün çökmesidir (TDR): aynı saatte bir 'Ekran kartı süreci çöktü' satırı varsa sürücüyü güncelleyin.">
        {st?.uncleanExit && <p className="st-hint text-red"><Icon name="alert" size={13} /> Önceki oturum ({st.uncleanExit.startedAt ? fmt(st.uncleanExit.startedAt) : "?"}, sürüm {st.uncleanExit.version || "?"}) düzgün kapanmadı.</p>}
        {crashes.length ? (
          <ul className="st-crashlog">
            {crashes.slice(0, 12).map((c, i) => (
              <li key={`${c.at}-${i}`}><b>{fmt(c.at)}</b> · {WHO[c.type] || c.type || c.kind} · {WHY[c.reason] || c.reason}{c.exitCode != null ? ` (kod ${c.exitCode})` : ""}{c.safeMode ? " · güvenli mod" : ""}</li>
            ))}
          </ul>
        ) : <p className="st-hint">Kayıt yok.</p>}
        <button type="button" className="btn btn--sm" onClick={async () => { const ok = await perf.revealCrashLog(); if (!ok) toast?.("Günlük klasörü açılamadı.", { tone: "warn" }); }}><Icon name="folder" size={13} /> Günlük dosyasını göster</button>
      </Section>
    </>
  );
}
