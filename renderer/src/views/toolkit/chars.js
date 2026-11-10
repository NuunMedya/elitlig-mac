// Emoji ve özel karakter seçici verisi: [karakter, Türkçe ad / arama sözcükleri].

export const CHAR_GROUPS = [
  { key: "tr", label: "Türkçe", items: [
    ["ç", "c çe"], ["Ç", "c büyük çe"], ["ğ", "g yumuşak ge"], ["Ğ", "g büyük yumuşak ge"], ["ı", "i noktasız ı"], ["İ", "i büyük noktalı"],
    ["ö", "o"], ["Ö", "o büyük"], ["ş", "s şe"], ["Ş", "s büyük şe"], ["ü", "u"], ["Ü", "u büyük"],
    ["â", "a şapkalı"], ["Â", "a büyük şapkalı"], ["î", "i şapkalı"], ["û", "u şapkalı"],
  ] },
  { key: "sym", label: "Para ve sembol", items: [
    ["₺", "türk lirası tl para"], ["€", "avro euro para"], ["$", "dolar para"], ["£", "sterlin pound para"], ["¥", "yen yuan para"], ["₿", "bitcoin"],
    ["©", "telif copyright"], ["®", "tescilli registered"], ["™", "ticari marka trademark"], ["°", "derece"], ["±", "artı eksi"], ["×", "çarpı"],
    ["÷", "bölü"], ["≈", "yaklaşık"], ["≠", "eşit değil"], ["≤", "küçük eşit"], ["≥", "büyük eşit"], ["∞", "sonsuz"], ["‰", "binde"], ["%", "yüzde"],
    ["§", "paragraf madde"], ["¶", "pilcrow paragraf"], ["•", "madde imi nokta"], ["·", "orta nokta"], ["…", "üç nokta"], ["–", "kısa tire en dash"],
    ["—", "uzun tire em dash"], ["«", "tırnak açılış"], ["»", "tırnak kapanış"], ["“", "çift tırnak açılış"], ["”", "çift tırnak kapanış"], ["‘", "tek tırnak açılış"],
    ["’", "kesme işareti apostrof"], ["½", "yarım"], ["¼", "çeyrek"], ["¾", "dörtte üç"], ["²", "kare üst iki"], ["³", "küp üst üç"], ["µ", "mikro"], ["№", "numara"],
  ] },
  { key: "arrow", label: "Ok ve işaret", items: [
    ["←", "sol ok"], ["→", "sağ ok"], ["↑", "yukarı ok"], ["↓", "aşağı ok"], ["↔", "çift yön"], ["⇒", "çift ok sağ ise"], ["⇐", "çift ok sol"], ["↩", "geri dönüş enter"],
    ["✓", "onay tik"], ["✔", "kalın onay"], ["✗", "çarpı hayır"], ["✘", "kalın çarpı"], ["★", "dolu yıldız"], ["☆", "boş yıldız"], ["♥", "kalp"], ["☎", "telefon"],
    ["✉", "zarf e-posta"], ["⌘", "command komut"], ["⌥", "option alt"], ["⌃", "control"], ["⇧", "shift"], ["⏎", "return"], ["⌫", "geri sil"], ["⎋", "escape"],
  ] },
  { key: "sport", label: "Spor ve yayın", items: [
    ["⚽", "futbol top maç"], ["🏆", "kupa şampiyon"], ["🥇", "altın madalya birinci"], ["🥈", "gümüş madalya ikinci"], ["🥉", "bronz madalya üçüncü"], ["🎯", "hedef"],
    ["🏟️", "stadyum saha"], ["🧤", "eldiven kaleci"], ["👟", "ayakkabı krampon"], ["🟨", "sarı kart"], ["🟥", "kırmızı kart"], ["⏱️", "kronometre süre"],
    ["📣", "megafon duyuru"], ["🎥", "kamera çekim"], ["📺", "televizyon yayın"], ["🔴", "canlı kırmızı"], ["🎙️", "mikrofon"], ["📸", "fotoğraf"],
    ["🏃", "koşu"], ["💪", "güç kas"], ["🔥", "ateş"], ["⚡", "şimşek hızlı"], ["🎉", "kutlama"], ["👏", "alkış"],
  ] },
  { key: "face", label: "Yüz ve el", items: [
    ["😀", "gülen"], ["😂", "gözyaşı gülme"], ["😊", "mutlu"], ["😍", "aşık"], ["🤩", "hayran yıldız"], ["😎", "havalı gözlük"], ["🤔", "düşünen"], ["😮", "şaşkın"],
    ["😢", "üzgün ağlayan"], ["😡", "kızgın"], ["🙈", "utangaç maymun"], ["🥳", "parti"], ["👍", "beğen başparmak"], ["👎", "beğenme"], ["🙏", "teşekkür rica"], ["👋", "el sallama selam"],
    ["🤝", "anlaşma tokalaşma"], ["✌️", "zafer barış"], ["👀", "gözler bak"], ["❤️", "kalp sevgi"], ["💙", "mavi kalp"], ["💛", "sarı kalp"], ["💯", "yüz tam"], ["✨", "parıltı"],
  ] },
  { key: "work", label: "İş ve nesne", items: [
    ["✅", "tamam onay"], ["❌", "hata iptal"], ["⚠️", "uyarı dikkat"], ["❗", "ünlem önemli"], ["❓", "soru"], ["📌", "raptiye sabitle"], ["📎", "ataş ek"], ["📅", "takvim tarih"],
    ["⏰", "alarm saat"], ["💡", "fikir ampul"], ["📈", "artış grafik"], ["📉", "düşüş grafik"], ["💰", "para kese"], ["💳", "kredi kartı"], ["🧾", "fiş fatura"], ["📝", "not yaz"],
    ["📁", "klasör"], ["🔒", "kilit"], ["🔑", "anahtar"], ["🔗", "bağlantı link"], ["📞", "telefon arama"], ["📍", "konum"], ["🚗", "araba"], ["🎁", "hediye"],
  ] },
];

const norm = (s) => String(s || "").toLocaleLowerCase("tr-TR");
/** Ada göre ara (tüm gruplar). */
export function searchChars(q) {
  const t = norm(q).trim();
  if (!t) return [];
  const out = [];
  for (const g of CHAR_GROUPS) for (const [c, name] of g.items) if (norm(name).includes(t) || c === q.trim()) out.push([c, name]);
  return out;
}

/** Karakterin Unicode kod noktaları ("U+20BA"). */
export const codePoints = (c) => [...String(c)].map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
