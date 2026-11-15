// Yayın Stüdyosu — AÇIK TEMALAR KONTRAST DENETİMİ (Playwright / Chromium).
//
// Hata (2.23.0): açık temada (Açık, Kağıt, Buz) bazı düğme / çip / parçacıklarda simge ya da yazı
// zeminle aynı renkteydi (ör. dolu biçimli parçacıkta seçili çip beyaz üstüne beyaz, sarı renkli
// parçacıkta beyaz yazı, açı küçük resminde koyu simge siyah zeminde, "YAYINDA" hapında koyu yazı).
//
// Her açık temada şu ekranlar açılır ve görünür her simge (svg.ic, currentColor) ile yazının ETKİN
// zemine karşı kontrastı ölçülür (fixtures/contrast-audit.js: ata zincirindeki yarı saydam renkler ve
// gradyan katmanları; en kötüsü): simge ≥ 3:1, yazı ≥ 4,5:1 (büyük yazı ≥ 3:1). Etkin olmayanlar sayılmaz.
//   · varsayılan stüdyo (+ düğme / sekme / çip üzerine gelme: CSS :hover zorlanır)
//   · TÜM parçacık kataloğu: varsayılan, dolu (tema rengi), çerçeve (sarı), yumuşak (mavi), dolu (sarı)
//   · Kontrol merkezi, Ayarlar (Görünüm, Reji / Maç, Makrolar, Klavye kısayolları), müzik çalar
//
// Derlenmiş arayüz (renderer/dist, `npm run build`) ve Playwright gerekir; yoksa atlanır.
"use strict";

// [2.33] Temalar ayrı dosyalarda: her biri test zaman sınırının (240 sn) rahatça altında.
require("./fixtures/contrast-suite")(["acik"]); // Açık
