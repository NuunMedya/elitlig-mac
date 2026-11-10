// Masaüstü araç takımı — saf modüller: renk, birim / para, metin, parola, dünya saatleri, kısayol, QR (Wi-Fi).
import { describe, expect, it } from "vitest";
import { contrast, formats, parseColor, pushRecent, readableOn, rgbToHsl, hslToRgb, shades, toHex } from "../src/views/toolkit/colorUtils";
import { convertCurrency, convertUnit, findUnit, formatNumber, parseNumber, parseQuery } from "../src/views/toolkit/units";
import { countText, fixTurkish, slugify, sortLines, stripTurkish, titleCase, sentenceCase, uniqueLines, upper, lower, TRANSFORMS } from "../src/views/toolkit/textTools";
import { generatePassword, randomInt, strength, SETS } from "../src/views/toolkit/password";
import { diffLabel, normalizeZones, offsetMinutes, zoneNow } from "../src/views/toolkit/worldClock";
import { acceleratorFromEvent, acceleratorLabel } from "../src/views/toolkit/shortcutUtils";
import { wifiText } from "../src/views/toolkit/QrTool";
import { qrEncode } from "../src/lib/studio/qr";

describe("renk", () => {
  it("HEX / RGB / HSL ayrıştırır ve çevirir", () => {
    expect(parseColor("#7c3aed")).toEqual({ r: 124, g: 58, b: 237, a: 1 });
    expect(parseColor("abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor("rgb(10, 20, 30)")).toMatchObject({ r: 10, g: 20, b: 30 });
    expect(parseColor("rgba(10 20 30 / 50%)")).toMatchObject({ a: 0.5 });
    expect(toHex(parseColor("hsl(0, 100%, 50%)"))).toBe("#FF0000");
    expect(parseColor("rgb(300, 0, 0)")).toBeNull();
    expect(parseColor("mavi")).toBeNull();
    const c = { r: 124, g: 58, b: 237 };
    const h = rgbToHsl(c);
    expect(h).toEqual({ h: 262, s: 83, l: 58 });
    const back = hslToRgb(h.h, h.s, h.l);
    expect(Math.abs(back.r - c.r) + Math.abs(back.g - c.g) + Math.abs(back.b - c.b)).toBeLessThan(6);
    expect(formats(c).map((f) => f.value)).toEqual(["#7C3AED", "rgb(124, 58, 237)", "hsl(262, 83%, 58%)", "--renk: #7C3AED;"]);
  });
  it("karşıtlık, okunur yazı rengi, tonlar ve son renkler", () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBe(21);
    expect(readableOn({ r: 255, g: 255, b: 0 }).color).toBe("#000000");
    expect(readableOn({ r: 30, g: 30, b: 120 }).color).toBe("#FFFFFF");
    const sh = shades({ r: 124, g: 58, b: 237 });
    expect(sh).toHaveLength(5);
    expect(sh.every((x) => /^#[0-9A-F]{6}$/.test(x))).toBe(true);
    let r = [];
    r = pushRecent(r, "#aaaaaa");
    r = pushRecent(r, "#BBBBBB");
    r = pushRecent(r, "#AAAAAA");
    expect(r).toEqual(["#AAAAAA", "#BBBBBB"]);
    expect(pushRecent(r, "çöp")).toEqual(r);
    expect(pushRecent(Array.from({ length: 12 }, (_, i) => `#00000${i.toString(16).toUpperCase()}`), "#FFFFFF")).toHaveLength(12);
  });
});

describe("birim ve para çevirici", () => {
  const rates = { EUR: 1, USD: 1.08, TRY: 37.8, GBP: 0.86 };
  it("birimler", () => {
    expect(convertUnit(5, "length", "km", "mi")).toBeCloseTo(3.10686, 4);
    expect(convertUnit(72, "temp", "f", "c")).toBeCloseTo(22.2222, 3);
    expect(convertUnit(0, "temp", "c", "k")).toBeCloseTo(273.15, 5);
    expect(convertUnit(2, "area", "donum", "m2")).toBe(2000);
    expect(convertUnit(1, "data", "gb", "mb")).toBe(1024);
    expect(convertUnit(1, "length", "km", "kg")).toBeNull();
  });
  it("para (EUR tabanlı kur tablosu)", () => {
    expect(convertCurrency(100, "USD", "TRY", rates)).toBeCloseTo(3500, 6);
    expect(convertCurrency(1, "EUR", "GBP", rates)).toBe(0.86);
    expect(convertCurrency(1, "USD", "XYZ", rates)).toBeNull();
    expect(convertCurrency(1, "USD", "TRY", null)).toBeNull();
  });
  it("hızlı satır: hesap, birim, para, Türkçe adlar", () => {
    expect(parseQuery("12*(4+3)")).toMatchObject({ kind: "calc", value: 84 });
    expect(parseQuery("200*18%")).toMatchObject({ kind: "calc", value: 36 });
    expect(parseQuery("5 km mi")).toMatchObject({ kind: "convert", from: "km", to: "mi" });
    expect(parseQuery("5km to mi").result).toBeCloseTo(3.10686, 4);
    expect(parseQuery("3 saat dk")).toMatchObject({ kind: "convert", result: 180 });
    expect(parseQuery("100 usd tl", rates)).toMatchObject({ kind: "convert", from: "USD", to: "TRY" });
    expect(parseQuery("100 dolar tl", rates).result).toBeCloseTo(3500, 6);
    expect(parseQuery("1.250 eur try", rates).result).toBeCloseTo(47250, 6);
    expect(parseQuery("100 usd tl", null)).toMatchObject({ kind: "error" });
    expect(parseQuery("5 km kg")).toMatchObject({ kind: "error" });
    expect(parseQuery("merhaba")).toBeNull();
    expect(parseQuery("")).toBeNull();
    expect(findUnit("xyz", rates)).toBeNull();
    expect(parseQuery("10 chf tl", rates)).toMatchObject({ kind: "error" });
    expect(findUnit("gbp", rates)).toEqual({ kind: "currency", code: "GBP" });
  });
  it("Türkçe sayı biçimleri", () => {
    expect(parseNumber("1.250,5")).toBe(1250.5);
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("12")).toBe(12);
    expect(parseNumber("abc")).toBeNull();
    expect(formatNumber(1234.5678)).toBe("1.234,57");
    expect(formatNumber(0.000123)).toBe("0,000123");
  });
});

describe("metin dönüştürücü", () => {
  it("Türkçe büyük / küçük harf ve başlık düzeni", () => {
    expect(upper("istanbul ılık")).toBe("İSTANBUL ILIK");
    expect(lower("İSTANBUL ILIK")).toBe("istanbul ılık");
    expect(titleCase("elitlig ve istanbul kupası")).toBe("Elitlig ve İstanbul Kupası");
    expect(titleCase("ve sonra")).toBe("Ve Sonra");
    expect(sentenceCase("BUGÜN MAÇ VAR. iyi şanslar!")).toBe("Bugün maç var. İyi şanslar!");
  });
  it("Türkçe karakter sil ve slug", () => {
    expect(stripTurkish("Çağrı Işık Öğün Şüküfe İnci")).toBe("Cagri Isik Ogun Sukufe Inci");
    expect(slugify("Elitlig Kupası 2026 – Final!")).toBe("elitlig-kupasi-2026-final");
    expect(slugify("  çok   boşluk  ")).toBe("cok-bosluk");
  });
  it("bozuk Türkçe karakterleri düzeltir (UTF-8 → Latin-1 ve Windows-1254 karışması)", () => {
    expect(fixTurkish("Ã§ok gÃ¼zel ÅŸarkÄ± Ä°stanbul").text).toBe("çok güzel şarkı İstanbul");
    expect(fixTurkish("ÝSTANBUL þiþe Ðazi aðaç").text).toBe("İSTANBUL şişe Ğazi ağaç");
    const ok = fixTurkish("Sağlam metin: çğıöşü");
    expect(ok.changed).toBe(false);
    expect(ok.text).toBe("Sağlam metin: çğıöşü");
  });
  it("satır işlemleri ve sayım", () => {
    expect(sortLines("şeker\ncam\nçay\nıhlamur\nincir\n10 elma\n2 armut")).toBe("2 armut\n10 elma\ncam\nçay\nıhlamur\nincir\nşeker");
    expect(uniqueLines("a\nA\nb\na", { ignoreCase: true })).toBe("a\nb");
    const c = countText("Merhaba dünya. Nasılsın?\n\nİkinci paragraf.");
    expect(c).toMatchObject({ words: 5, lines: 3, sentences: 3, paragraphs: 2 });
    expect(countText("").chars).toBe(0);
    expect(TRANSFORMS.length).toBeGreaterThan(10);
  });
});

describe("parola üretici", () => {
  // Belirlenimci "rastgele" kaynak (sınama için).
  const seq = (start = 1) => { let x = start; return (n) => Uint32Array.from({ length: n }, () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x; }); };
  it("uzunluk, her kümeden en az bir karakter, karışanlar çıkar", () => {
    for (let s = 1; s < 30; s += 1) {
      const pw = generatePassword({ length: 16 }, seq(s));
      expect(pw).toHaveLength(16);
      expect(/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)).toBe(true);
      expect(/[Il1O0o]/.test(pw)).toBe(false);
    }
    expect(generatePassword({ length: 10, upper: false, symbols: false, digits: false }, seq(3))).toMatch(/^[a-z]{10}$/);
    expect(generatePassword({ length: 2 }, seq()).length).toBe(4);
    expect(generatePassword({ lower: false, upper: false, digits: false, symbols: false, length: 8 }, seq())).toMatch(/^[a-z]{8}$/);
    expect(generatePassword({ length: 12 })).toHaveLength(12); // gerçek crypto
  });
  it("sapmasız aralık ve güç", () => {
    let calls = 0;
    const big = (n) => { calls += 1; return Uint32Array.from({ length: n }, () => (calls === 1 ? 0xffffffff : 5)); };
    expect(randomInt(10, big)).toBe(5); // sınır üstü reddedildi
    expect(strength("abc").level).toBe(0);
    expect(strength("Ab3$Ab3$Ab3$Ab3$Ab3$").level).toBeGreaterThanOrEqual(3);
    expect(SETS.digits).toBe("0123456789");
  });
});

describe("dünya saatleri", () => {
  const jan = new Date("2026-01-15T12:00:00Z");
  const jul = new Date("2026-07-15T12:00:00Z");
  it("UTC farkı ve yaz saati", () => {
    expect(offsetMinutes("Europe/Istanbul", jan)).toBe(180);
    expect(offsetMinutes("Europe/London", jan)).toBe(0);
    expect(offsetMinutes("Europe/London", jul)).toBe(60);
    expect(offsetMinutes("America/New_York", jan)).toBe(-300);
    expect(offsetMinutes("Asia/Kolkata", jan)).toBe(330);
    expect(diffLabel("Europe/London", "Europe/Istanbul", jan)).toBe("−3 sa");
    expect(diffLabel("Asia/Kolkata", "Europe/Istanbul", jan)).toBe("+2,5 sa");
    expect(diffLabel("Europe/Istanbul", "Europe/Istanbul", jan)).toBe("aynı saat");
    expect(zoneNow("Europe/Istanbul", jan)).toMatchObject({ time: "15:00", night: false });
    expect(zoneNow("Asia/Tokyo", jan).night).toBe(true);
  });
  it("liste temizlenir", () => {
    expect(normalizeZones(["Europe/Istanbul", "Yok/Böyle", "Europe/Istanbul", "UTC"])).toEqual(["Europe/Istanbul", "UTC"]);
    expect(normalizeZones(null).length).toBe(4);
  });
});

describe("kısayol kaydetme", () => {
  const ev = (code, mods = {}) => ({ code, key: code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  it("fiziksel tuştan hızlandırıcı (⌥ harfi değiştirse de)", () => {
    expect(acceleratorFromEvent({ ...ev("KeyU", { ctrlKey: true, altKey: true }), key: "¨" }, true)).toEqual({ accelerator: "Control+Alt+U" });
    expect(acceleratorFromEvent(ev("ArrowLeft", { ctrlKey: true, altKey: true }), true)).toEqual({ accelerator: "Control+Alt+Left" });
    expect(acceleratorFromEvent(ev("Enter", { ctrlKey: true, altKey: true }), true)).toEqual({ accelerator: "Control+Alt+Return" });
    expect(acceleratorFromEvent(ev("Space", { ctrlKey: true, altKey: true }), true)).toEqual({ accelerator: "Control+Alt+Space" });
    expect(acceleratorFromEvent(ev("ArrowRight", { ctrlKey: true, altKey: true, metaKey: true }), true)).toEqual({ accelerator: "Control+Alt+Command+Right" });
    expect(acceleratorFromEvent(ev("ArrowRight", { ctrlKey: true, metaKey: true }), false)).toEqual({ accelerator: "Control+Super+Right" });
    expect(acceleratorFromEvent(ev("F13"), true)).toEqual({ accelerator: "F13" });
    expect(acceleratorFromEvent(ev("KeyA"), true).error).toBeTruthy();
    expect(acceleratorFromEvent(ev("KeyA", { shiftKey: true }), true).error).toBeTruthy();
    expect(acceleratorFromEvent({ ...ev("AltLeft", { altKey: true }), key: "Alt" }, true)).toEqual({ pending: true });
  });
  it("etiketler", () => {
    expect(acceleratorLabel("Control+Alt+Left", true)).toBe("⌃⌥←");
    expect(acceleratorLabel("Control+Alt+Backspace", true)).toBe("⌃⌥⌫");
    expect(acceleratorLabel("Control+Alt+Return", false)).toBe("Ctrl+Alt+Enter");
    expect(acceleratorLabel("Control+Alt+Space", true)).toBe("⌃⌥Boşluk");
    expect(acceleratorLabel("", true)).toBe("");
  });
});

describe("QR: Wi-Fi", () => {
  it("özel karakterler kaçışlanır ve kodlanır", () => {
    expect(wifiText({ ssid: "Ev;Ağı", password: 'p:a"ss', security: "WPA" })).toBe('WIFI:T:WPA;S:Ev\\;Ağı;P:p\\:a\\"ss;;');
    expect(wifiText({ ssid: "Misafir", security: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Misafir;H:true;;");
    const qr = qrEncode(wifiText({ ssid: "Elitlig", password: "12345678" }));
    expect(qr.size).toBeGreaterThanOrEqual(21);
  });
});
