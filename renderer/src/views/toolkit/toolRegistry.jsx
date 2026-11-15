// Araç takımındaki araçların tek listesi: panel (#toolkit, ⌃⌥B / Ctrl+Alt+Boşluk) ve uygulama içindeki
// tam sayfa "Araç Takımı" (⇧⌘A) aynı bileşenleri kullanır.
import { lazy } from "react";

const extra = (name) => lazy(() => import("./ExtraTools").then((m) => ({ default: m[name] })));

/** group: tam sayfadaki bölüm. İlk 9 araç panelde ⌘1…⌘9 ile açılır (sıra 2.26.0 ile aynı başlar). */
export const TOOLS = [
  { key: "layout", label: "Düzen", title: "Pencere düzeni", icon: "layout", group: "Masaüstü", hint: "Pencereyi yarım, çeyrek, üçte bir ekrana yerleştir" },
  { key: "color", label: "Renk", title: "Renk seçici", icon: "droplet", group: "Tasarım ve geliştirici", hint: "HEX, RGB, HSL; palet ve kontrast", component: lazy(() => import("./ColorTool")) },
  { key: "calc", label: "Hesap", title: "Hızlı hesap ve çevirici", icon: "calculator", group: "Hesap", hint: "Hesap makinesi, birim ve döviz çevirici", component: lazy(() => import("./CalcTool")) },
  { key: "text", label: "Metin", title: "Metin dönüştürücü", icon: "type", group: "Metin", hint: "BÜYÜK/küçük harf, Türkçe karakter, sayım", component: lazy(() => import("./TextTool")) },
  { key: "qr", label: "QR", title: "QR kod", icon: "qr", group: "Tasarım ve geliştirici", hint: "Bağlantı, metin ya da Wi-Fi için QR", component: lazy(() => import("./QrTool")) },
  { key: "clock", label: "Saatler", title: "Dünya saatleri", icon: "globe", group: "Masaüstü", hint: "Şehirlerin saati ve saat farkı", component: lazy(() => import("./ClockTool")) },
  { key: "timer", label: "Sayaç", title: "Sayaç ve kronometre", icon: "timer", group: "Masaüstü", hint: "Zamanlayıcı, kronometre, pomodoro", component: lazy(() => import("./TimerTool")) },
  { key: "password", label: "Parola", title: "Parola üretici", icon: "key", group: "Tasarım ve geliştirici", hint: "Güçlü parola, güç ölçer", component: lazy(() => import("./PasswordTool")) },
  { key: "percent", label: "Yüzde", title: "Yüzde ve KDV", icon: "percent", group: "Hesap", hint: "Yüzde, değişim, KDV dahil/hariç", component: extra("PercentTool") },
  { key: "dates", label: "Tarih", title: "Tarih, iş günü, geri sayım", icon: "calendar", group: "Hesap", hint: "İki tarih arası, iş günü ekle, geri sayım", component: extra("DateTool") },
  { key: "chars", label: "Karakter", title: "Emoji ve özel karakter", icon: "smile", group: "Metin", hint: "ğ ş İ ₺ © → ⚽ — tıkla, kopyala", component: extra("CharsTool") },
  { key: "lorem", label: "Dolgu", title: "Dolgu metni (Lorem ipsum)", icon: "list", group: "Metin", hint: "Latince ya da Türkçe örnek metin", component: extra("LoremTool") },
  { key: "json", label: "JSON", title: "JSON biçimlendirici", icon: "command", group: "Tasarım ve geliştirici", hint: "Doğrula, biçimle, sıkıştır", component: extra("JsonTool") },
  { key: "encode", label: "Kodla", title: "Base64 / URL / HTML", icon: "link", group: "Tasarım ve geliştirici", hint: "Kodla ve çöz (UTF-8 güvenli)", component: extra("EncodeTool") },
  { key: "uuid", label: "UUID", title: "UUID üretici", icon: "barcode", group: "Tasarım ve geliştirici", hint: "Sürüm 4 UUID, toplu", component: extra("UuidTool") },
];
export const TOOL_KEYS = new Set(TOOLS.map((t) => t.key));
export const TOOL_GROUPS = ["Masaüstü", "Hesap", "Metin", "Tasarım ve geliştirici"];
