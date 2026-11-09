// [gol-klip] Pozisyon başına seçimin yüklemeye yansıması (goalClips.effectiveSelection) ve
// YAYIN ÖNCELİKLİ yükleme: sağlık, erteleme (geri çekilme), hız (AIMD) — lib/studio/uploadGuard.
import { describe, expect, it } from "vitest";
import { effectiveSelection, uploadPlanOf } from "../src/lib/studio/goalClips";
import {
  CALM_MS, DEFER_GIVE_UP_MS, UPLOAD_MIN_KBPS, backoffMs, deferDecision, healthText, isLiveStatus, nextUploadKbps, pushHealth, startKbps, streamHealth, uploadCapKbps,
} from "../src/lib/studio/uploadGuard";

const R = { id: "r1", angles: [{ angle: "program", url: "p" }, { angle: "cam1", url: "c1" }, { angle: "cam2", url: "c2" }] };
const live = (net = {}, extra = {}) => ({ state: "live", recordOnly: false, bitrateKbps: 4000, droppedFrames: 0, network: { state: "up", inKbps: 4000, sentKbps: 4000, pendingBytes: 0, dropEvents: 0, dropping: false, ...net }, ...extra });

describe("seçim → yükleme (pozisyon başına)", () => {
  it("seçim yoksa yayına verilen; o da yoksa program açısı", () => {
    expect(effectiveSelection({}, R)).toBe(null);
    expect(uploadPlanOf(R, effectiveSelection({}, R))).toEqual({ mode: "program", count: 0 });
    const aired = { angles: ["cam1"], segments: [{ angle: "cam1", inSec: 2, outSec: 7 }] };
    const e = effectiveSelection({ aired }, R);
    expect(e.aired).toBe(true);
    expect(e.segments).toEqual([{ angle: "cam1", inSec: 2, outSec: 7 }]);
  });
  it("seçim yüklemeyi belirler: sırayla; yayında kırpılan açının giriş / çıkışı korunur", () => {
    const aired = { angles: ["cam1", "program"], segments: [{ angle: "cam1", inSec: 2, outSec: 7 }, { angle: "program", inSec: 1, outSec: null }] };
    // yayından sonra operatör seçimi değiştirdi: program çıktı, cam2 eklendi (cam2 önce)
    const e = effectiveSelection({ aired, picks: ["cam2", "cam1"] }, R);
    expect(e.angles).toEqual(["cam2", "cam1"]);
    expect(e.segments).toEqual([{ angle: "cam2", inSec: 0, outSec: null }, { angle: "cam1", inSec: 2, outSec: 7 }]);
    expect(uploadPlanOf(R, e)).toMatchObject({ mode: "angles", count: 2 });
    // yalnız tüm program klibi seçili → program açısı (kurgu yok)
    expect(uploadPlanOf(R, effectiveSelection({ picks: ["program"] }, R)).mode).toBe("program");
    // olmayan açı atılır
    expect(effectiveSelection({ picks: ["cam9"] }, R)).toBe(null);
  });
});

describe("yayın sağlığı", () => {
  it("yayın yoksa (prova / kayıt / kapalı) sınır ve erteleme yok", () => {
    expect(isLiveStatus({ state: "recording", recordOnly: true })).toBe(false);
    expect(isLiveStatus({ state: "live", recordOnly: true })).toBe(false);
    expect(isLiveStatus(live())).toBe(true);
    const h = streamHealth({ state: "recording", recordOnly: true }, null, null, 0);
    expect(h.live).toBe(false);
    expect(deferDecision([h], { now: 0 })).toEqual({ go: true, kbps: 0 });
    expect(nextUploadKbps(500, h)).toEqual({ kbps: 0, paused: false });
  });
  it("kuyruk, büyüme, yetişememe, paket atma, yeniden bağlanma", () => {
    expect(streamHealth(live(), null, null, 0).level).toBe("ok");
    // 4000 kbit/sn'de 1 MB kuyruk ≈ 2 sn → risk
    const big = streamHealth(live({ pendingBytes: 1_000_000 }), null, null, 0);
    expect(big.bufferSec).toBe(2);
    expect(big.level).toBe("risk");
    expect(big.reasons).toContain("buffer");
    const warn = streamHealth(live({ pendingBytes: 450_000 }), null, null, 0);
    expect(warn.level).toBe("warn");
    const prev = streamHealth(live({ pendingBytes: 100_000 }), null, null, 0);
    const grow = streamHealth(live({ pendingBytes: 300_000 }), null, prev, 1000);
    expect(grow.reasons).toContain("growing");
    expect(streamHealth(live({ sentKbps: 2500 }), null, null, 0).reasons).toContain("behind");
    expect(streamHealth(live({ dropEvents: 3 }), null, streamHealth(live({ dropEvents: 2 }), null, null, 0), 1000).level).toBe("risk");
    expect(streamHealth(live({ dropping: true }), null, null, 0).level).toBe("risk");
    const rc = streamHealth(live({ state: "connecting" }, { state: "reconnecting" }), null, null, 0);
    expect(rc.level).toBe("risk");
    expect(healthText(rc)).toMatch(/^Yayın öncelikli: yayın yeniden bağlanıyor/);
    // taze aktarıcı durumu (studio.network) motor durumunun önüne geçer
    expect(streamHealth(live(), { state: "up", inKbps: 4000, sentKbps: 4000, pendingBytes: 1_200_000 }, null, 0).level).toBe("risk");
  });
});

describe("erteleme (yayın öncelikli)", () => {
  const ok = (at) => ({ ...streamHealth(live(), null, null, at) });
  const risk = (at) => ({ ...streamHealth(live({ pendingBytes: 1_500_000 }), null, null, at) });
  it("yayın riskteyse ertelenir; geri çekilme 10 → 20 → 40 sn … en çok 2 dk", () => {
    const d = deferDecision([ok(0), risk(1000)], { now: 1000 });
    expect(d.go).toBe(false);
    expect(d.retryAt).toBe(1000 + 10_000);
    expect(d.reason).toMatch(/kuyruğu/);
    expect(d.attempt).toBe(1);
    expect(deferDecision([risk(0)], { now: 0, attempt: 1 }).retryAt).toBe(20_000);
    expect(backoffMs(2)).toBe(40_000);
    expect(backoffMs(10)).toBe(120_000);
  });
  it("son birkaç saniye sakin değilse beklenir; sakinse yavaş hızla başlar", () => {
    const now = 10_000;
    // sağlıklı ama 2 sn önce risk vardı → bekle
    expect(deferDecision([risk(now - 2000), ok(now)], { now }).go).toBe(false);
    // CALM_MS içinde hep sağlıklı → başla (tavanın yarısı)
    const hist = [risk(now - CALM_MS - 500), ok(now - 2000), ok(now)];
    const d = deferDecision(hist, { now });
    expect(d.go).toBe(true);
    expect(d.kbps).toBe(startKbps(ok(now)));
    expect(d.kbps).toBeGreaterThanOrEqual(UPLOAD_MIN_KBPS);
  });
  it("çok uzun ertelemeden sonra yine de yüklenir (riskteyse duraklatılmış en düşük hızla)", () => {
    const now = DEFER_GIVE_UP_MS + 5;
    expect(deferDecision([risk(now)], { now, deferredSince: 0 })).toEqual({ go: true, kbps: UPLOAD_MIN_KBPS, paused: true });
    const warn = streamHealth(live({ pendingBytes: 450_000 }), null, null, now);
    expect(deferDecision([warn], { now, deferredSince: 0 }).go).toBe(true);
  });
  it("geçmiş: son 30 sn tutulur", () => {
    let h = [];
    for (let t = 0; t <= 60_000; t += 1000) h = pushHealth(h, ok(t));
    expect(h[0].at).toBe(30_000);
    expect(h[h.length - 1].at).toBe(60_000);
  });
});

describe("yükleme hızı (AIMD): boş kapasitenin %25'i, taban 256 kbit/sn", () => {
  it("tavan: kapasite bilinmiyorsa kodlayıcı hızının 1,5 katı hat varsayılır", () => {
    const h = streamHealth(live(), null, null, 0);
    expect(uploadCapKbps(h)).toBe(500); // (6000 − 4000) × 0,25
    expect(uploadCapKbps(h, 10_000)).toBe(1500); // görülen kapasite 10 Mbit/sn
    const slow = streamHealth({ ...live({ inKbps: 600, sentKbps: 600 }), bitrateKbps: 600 }, null, null, 0);
    expect(uploadCapKbps(slow)).toBe(UPLOAD_MIN_KBPS);
  });
  it("sağlıklı → %15 artış (tavana kadar) · uyarı → yarıya · risk → duraklat", () => {
    const ok = streamHealth(live(), null, null, 0);
    expect(nextUploadKbps(300, ok)).toEqual({ kbps: 345, paused: false });
    expect(nextUploadKbps(490, ok)).toEqual({ kbps: 500, paused: false });
    const warn = streamHealth(live({ pendingBytes: 450_000 }), null, null, 0);
    expect(nextUploadKbps(1000, warn)).toEqual({ kbps: 500, paused: false });
    expect(nextUploadKbps(300, warn).kbps).toBe(UPLOAD_MIN_KBPS);
    const risk = streamHealth(live({ dropping: true }), null, null, 0);
    expect(nextUploadKbps(800, risk)).toEqual({ kbps: 400, paused: true });
    // ilk değer yoksa yavaş başla
    expect(nextUploadKbps(0, ok).kbps).toBe(Math.round(Math.max(UPLOAD_MIN_KBPS, 500 / 2) * 1.15));
  });
});
