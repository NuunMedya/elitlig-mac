// Yayın sağlığı: darboğaz sınıflaması (Ağ yetmiyor / Kodlayıcı yetişmiyor / Çizim yetişmiyor /
// Bilgisayar meşgul), ağ kuyruğu ve "Bağlantı testi" önerisi.
import { bottleneckCause, networkQueueSec, speedTestAdvice } from "../src/lib/studio/broadcast";
import { RTMP_PUBLISHERS, normalizeSettings } from "../src/views/studio/settings/settings";

const up = (o = {}) => ({ state: "up", inKbps: 12300, sentKbps: 12200, uplinkKbps: 12200, ackKbps: 12100, pendingBytes: 0, dropping: false, ...o });
const wc = (o = {}) => ({ pipeline: "webcodecs", queue: 0, encodedFps: 60, hardware: true, ...o });

describe("darboğaz sınıflaması", () => {
  it("yayın kapalı / sorun yok", () => {
    expect(bottleneckCause({ encoding: false }).key).toBe("idle");
    expect(bottleneckCause({ status: { network: up() }, draw: { fps: 60, stalls: 0 }, enc: wc(), targetFps: 60, encoding: true }).key).toBe("ok");
  });
  it("ağ: kare atlama, büyüyen kuyruk ya da sunucuya ulaşan < üretilen", () => {
    const drop = bottleneckCause({ status: { network: up({ dropping: true }) }, draw: { fps: 60 }, enc: wc(), targetFps: 60, encoding: true });
    expect(drop).toMatchObject({ key: "network", label: "Ağ yetmiyor", tone: "bad" });
    // 12,3 Mbps üretiliyor, sunucu 6 Mbps onaylıyor, kuyruk 1,5 sn → ağ
    const behind = bottleneckCause({ status: { network: up({ ackKbps: 6000, pendingBytes: Math.round((12300 * 1000 * 1.5) / 8) }) }, draw: { fps: 60 }, enc: wc(), targetFps: 60, encoding: true });
    expect(behind.key).toBe("network");
    expect(behind.detail).toContain("6,0 Mbps");
    expect(behind.detail).toContain("12,3 Mbps");
    // kuyruk boşsa kısa düşüş ağ sayılmaz
    expect(bottleneckCause({ status: { network: up({ ackKbps: 6000 }) }, draw: { fps: 60 }, enc: wc(), targetFps: 60, encoding: true }).key).toBe("ok");
    expect(bottleneckCause({ status: { state: "reconnecting", network: up({ state: "down", lastError: { message: "koptu" } }) }, encoding: true }).key).toBe("network");
  });
  it("kodlayıcı: kuyruk ≥ 3 ya da kodlanan fps çizilenin altında; eski yolda hız < 0,95", () => {
    expect(bottleneckCause({ status: { network: up() }, draw: { fps: 60 }, enc: wc({ queue: 4 }), targetFps: 60, encoding: true }).key).toBe("encoder");
    expect(bottleneckCause({ status: { network: up() }, draw: { fps: 60 }, enc: wc({ encodedFps: 45 }), targetFps: 60, encoding: true }).label).toBe("Kodlayıcı yetişmiyor");
    expect(bottleneckCause({ status: { network: up(), speed: 0.8 }, draw: { fps: 30 }, enc: { pipeline: "legacy" }, targetFps: 30, encoding: true }).key).toBe("encoder");
  });
  it("bilgisayar meşgul (takılma) ve çizim yetişmiyor", () => {
    expect(bottleneckCause({ status: { network: up() }, draw: { fps: 58, stalls: 2, drawMs: 140 }, enc: wc({ encodedFps: 58 }), targetFps: 60, encoding: true }).label).toBe("Bilgisayar meşgul");
    // çizim 40 fps, kodlayıcı çizileni yetiştiriyor → çizim
    expect(bottleneckCause({ status: { network: up() }, draw: { fps: 40, stalls: 0 }, enc: wc({ encodedFps: 40 }), targetFps: 60, encoding: true }).label).toBe("Çizim yetişmiyor");
  });
  it("ağ kuyruğu saniyesi", () => {
    expect(networkQueueSec({ inKbps: 8000, pendingBytes: 2_000_000 })).toBe(2);
    expect(networkQueueSec(null)).toBe(0);
  });
});

describe("bağlantı testi önerisi", () => {
  it("ölçülen yüklemenin %75'ine sığan en yüksek hızlı ayar", () => {
    expect(speedTestAdvice({ ok: true, uploadKbps: 30000, rttMs: 20 })).toMatchObject({ key: "qhd", bitrateKbps: 18000 });
    expect(speedTestAdvice({ ok: true, uploadKbps: 18000 })).toMatchObject({ key: "ultra", bitrateKbps: 12000 });
    expect(speedTestAdvice({ ok: true, uploadKbps: 13000 })).toMatchObject({ key: "high", bitrateKbps: 9000 });
    expect(speedTestAdvice({ ok: true, uploadKbps: 9000 })).toMatchObject({ key: "balanced", bitrateKbps: 6000 });
    const low = speedTestAdvice({ ok: true, uploadKbps: 3000, rttMs: 35 });
    expect(low.bitrateKbps).toBe(2000);
    expect(low.text).toContain("35 ms");
    expect(speedTestAdvice({ ok: false })).toBe(null);
  });
});

describe("Ayarlar › Yayın › Gönderici", () => {
  it("varsayılan otomatik (Node); ffmpeg seçimi saklanır; geçersiz değer otomatiğe döner", () => {
    expect(normalizeSettings({}).stream.publisher).toBe("auto");
    expect(normalizeSettings({ stream: { publisher: "ffmpeg" } }).stream.publisher).toBe("ffmpeg");
    expect(normalizeSettings({ stream: { publisher: "xyz" } }).stream.publisher).toBe("auto");
    expect(RTMP_PUBLISHERS.map((p) => p.label)).toEqual(["Otomatik (yeni, hızlı)", "ffmpeg (eski)"]);
  });
});
