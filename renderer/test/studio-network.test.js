import { describe, expect, it } from "vitest";
import { backupIngestUrl, networkSummary, streamHealth } from "../src/lib/studio/broadcast";
import { ledStateKey, shouldSendLed, KEEPALIVE_MS } from "../src/views/studio/led/useLed";

describe("yedek giriş adresi (YouTube backup ingest)", () => {
  it("sunucunun tam adresini (backup_ingest_url) kullanır; taban adrese anahtarı ekler; aynı / geçersizse null", () => {
    const s = { rtmp_url: "rtmp://a.rtmp.youtube.com/live2", stream_key: "abcd-efgh", backup_ingest_url: "rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-efgh" };
    expect(backupIngestUrl(s)).toBe("rtmp://b.rtmp.youtube.com/live2?backup=1/abcd-efgh");
    expect(backupIngestUrl({ rtmp_url: "rtmp://a/live2", stream_key: "k", backup_ingestion_address: "rtmp://b.rtmp.youtube.com/live2?backup=1" })).toBe("rtmp://b.rtmp.youtube.com/live2?backup=1/k");
    expect(backupIngestUrl({ rtmp_url: "rtmp://a/live2", stream_key: "k", backupIngestionAddress: "rtmp://b/live2" })).toBe("rtmp://b/live2/k");
    expect(backupIngestUrl({ rtmp_publish_url: "rtmp://a/live2/k", backup_ingest_url: "rtmp://a/live2/k" })).toBe(null);
    expect(backupIngestUrl({ backup_ingest_url: "https://x/y" })).toBe(null);
    expect(backupIngestUrl(null)).toBe(null);
    expect(backupIngestUrl({ rtmp_url: "rtmp://a/live2", stream_key: "k" })).toBe(null);
  });
});

describe("ağ sağlığı", () => {
  const network = { state: "down", attempt: 3, reconnects: 2, target: "backup", sentKbps: 4600, lastError: { code: "IO", message: "Yayın bağlantısı koptu." }, dropping: true };
  it("özet: gönderim, yeniden bağlanma, yedek sunucu, deneme, son hata", () => {
    expect(networkSummary({ network })).toBe("Gönderim 4,6 Mbps · 2 kez yeniden bağlandı · yedek sunucu · 3. deneme · Yayın bağlantısı koptu.");
    expect(networkSummary({ network: { state: "up", sentKbps: 2500, reconnects: 0 } })).toBe("Gönderim 2,5 Mbps");
    expect(networkSummary({})).toBe(null);
  });
  it("streamHealth: yeniden bağlanma iletisi, kare atlama uyarısı ve ağ alanları", () => {
    const h = streamHealth({ encoding: true, status: { state: "reconnecting", message: "Yeniden bağlanıyor… (3. deneme)", network }, draw: { fps: 30 } });
    expect(h.tone).toBe("bad");
    expect(h.warnings[0]).toBe("Yeniden bağlanıyor… (3. deneme)");
    expect(h.warnings.some((w) => /kareler atlanıyor/.test(w))).toBe(true);
    expect(h.reconnects).toBe(2);
    expect(h.sentKbps).toBe(4600);
    expect(h.lastError).toBe("Yayın bağlantısı koptu.");
  });
});

describe("LED durum gönderimi", () => {
  it("değişmeyen durum (sentAt hariç) yeniden gönderilmez; canlı tutma süresi dolunca gönderilir", () => {
    const a = ledStateKey({ v: 2, sentAt: 1, scene: { id: "s1" } });
    const b = ledStateKey({ v: 2, sentAt: 999, scene: { id: "s1" } });
    const c = ledStateKey({ v: 2, sentAt: 999, scene: { id: "s2" } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(shouldSendLed(a, null, 0)).toBe(true);
    expect(shouldSendLed(b, { key: a, at: 0 }, 100)).toBe(false);
    expect(shouldSendLed(c, { key: a, at: 0 }, 100)).toBe(true);
    expect(shouldSendLed(b, { key: a, at: 0 }, KEEPALIVE_MS)).toBe(true);
  });
});
