// Bağlantıdan indir penceresi: site tanıma (ana süreçteki ytdlpArgs.siteOf ile aynı
// anahtarlar), oynatma listesi algılama, tarayıcı çerezi seçenekleri.
import { describe, expect, it } from "vitest";
import { cookieBrowsers, siteOfUrl } from "../src/views/files/DownloadDialog";

describe("Bağlantıdan indir", () => {
  it("siteleri tanır", () => {
    expect(siteOfUrl("https://www.youtube.com/watch?v=a").key).toBe("youtube");
    expect(siteOfUrl("https://youtu.be/a").key).toBe("youtube");
    expect(siteOfUrl("https://www.instagram.com/p/X/").key).toBe("instagram");
    expect(siteOfUrl("https://x.com/a/status/1").label).toBe("X (Twitter)");
    expect(siteOfUrl("https://www.tiktok.com/@a/video/1").key).toBe("tiktok");
    expect(siteOfUrl("https://fb.watch/x").key).toBe("facebook");
    expect(siteOfUrl("https://ornek.com/v")).toMatchObject({ key: "other", label: "ornek.com" });
    expect(siteOfUrl("javascript:alert(1)")).toBeNull();
    expect(siteOfUrl("merhaba")).toBeNull();
  });
  it("YouTube oynatma listesini algılar", () => {
    expect(siteOfUrl("https://www.youtube.com/watch?v=a&list=PL1").playlist).toBe(true);
    expect(siteOfUrl("https://www.youtube.com/playlist?list=PL1").playlist).toBe(true);
    expect(siteOfUrl("https://www.youtube.com/watch?v=a").playlist).toBe(false);
    expect(siteOfUrl("https://www.instagram.com/p/X/?list=1").playlist).toBe(false);
  });
  it("Safari çerezleri yalnız Mac'te sunulur; değerler ana süreçteki izin listesinde", () => {
    const allowed = ["", "chrome", "safari", "firefox", "edge", "brave"];
    expect(cookieBrowsers(true).map(([v]) => v)).toContain("safari");
    expect(cookieBrowsers(false).map(([v]) => v)).not.toContain("safari");
    for (const [v] of cookieBrowsers(true)) expect(allowed).toContain(v);
  });
});

describe("Görsel sıkıştırma biçimi", () => {
  it("PNG / GIF / BMP 'otomatik'te WEBP'ye, JPG / WEBP aynı biçimde sıkıştırılır", async () => {
    const { compressFormat } = await import("../src/lib/files/runClient");
    expect(compressFormat("png")).toBe("webp");
    expect(compressFormat("PNG")).toBe("webp");
    expect(compressFormat("bmp")).toBe("webp");
    expect(compressFormat("jpg")).toBe("jpg");
    expect(compressFormat("jpeg")).toBe("jpg");
    expect(compressFormat("webp")).toBe("webp");
  });
});
