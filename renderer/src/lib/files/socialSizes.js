// Sosyal medya görsel boyutları ve "kırparak doldur / sığdır" hesabı (Dosya Araçları → Yeniden
// boyutlandır → Sosyal medya; Araç Takımı → Sosyal medya boyutları).


/** Dosya Araçları → Yeniden boyutlandır'daki ön ayarlar (kırparak doldurur). */
export const SOCIAL_SIZES = [
  { key: "ig-square", label: "Instagram gönderi (kare)", w: 1080, h: 1080 },
  { key: "ig-portrait", label: "Instagram gönderi (dikey 4:5)", w: 1080, h: 1350 },
  { key: "story", label: "Hikâye / Reels / TikTok (9:16)", w: 1080, h: 1920 },
  { key: "yt-thumb", label: "YouTube kapak (16:9)", w: 1280, h: 720 },
  { key: "yt-banner", label: "YouTube kanal kapağı", w: 2560, h: 1440 },
  { key: "x-post", label: "X (Twitter) gönderi", w: 1600, h: 900 },
  { key: "x-header", label: "X (Twitter) kapak", w: 1500, h: 500 },
  { key: "fb-post", label: "Facebook gönderi", w: 1200, h: 630 },
  { key: "fb-cover", label: "Facebook kapak", w: 851, h: 315 },
  { key: "li-post", label: "LinkedIn gönderi", w: 1200, h: 627 },
  { key: "wa-status", label: "WhatsApp durum", w: 1080, h: 1920 },
  { key: "hd", label: "Full HD ekran / yayın (16:9)", w: 1920, h: 1080 },
];

/** Kaynağı hedefe "kırparak doldur" (cover) ya da "sığdır" (contain) için kaynak dikdörtgeni / ölçek. */
export function coverRect(sw, sh, tw, th, mode = "cover") {
  const scale = mode === "cover" ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh);
  if (mode === "cover") {
    const cw = tw / scale;
    const ch = th / scale;
    return { sx: (sw - cw) / 2, sy: (sh - ch) / 2, sw: cw, sh: ch, dx: 0, dy: 0, dw: tw, dh: th };
  }
  const dw = sw * scale;
  const dh = sh * scale;
  return { sx: 0, sy: 0, sw, sh, dx: (tw - dw) / 2, dy: (th - dh) / 2, dw, dh };
}
