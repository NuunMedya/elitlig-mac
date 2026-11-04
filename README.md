# Elitlig Araçlar — Mac uygulaması

Elitlig yönetim panelindeki **Araçlar** bölümünün Mac için yazılmış bağımsız uygulaması.
Siteyi bir pencerede açmaz: kendi arayüzü vardır ve Elitlig sunucusuyla doğrudan konuşur.
Veriler sitedekiyle aynıdır; uygulamada yapılan her değişiklik sitede, sitede yapılan her değişiklik
uygulamada görünür.

## Araçlar

| Kısayol | Araç | Uygulamada |
| --- | --- | --- |
| ⌘1 | **Bugün** | Gecikmiş ve bugünkü işler, önümüzdeki 7 gün, bu ayın gelir-gideri, son notlar, odak istatistiği; tek satırda görev ekleme |
| ⌘2 | **Yapılacaklar** | Gruplu liste, sürükle-bırak pano, atadıklarım; ayrıntı panelinde aşamalar, etiketler, cevap, son tarih; ekibe görev atama; maç görevleri ve paylaşılan tablo kartları |
| ⌘3 | **Ajanda** | Ay / hafta / gün / liste; etkinliği sürükleyip başka güne taşıma; tekrar eden etkinlikler; son tarihli görevler takvimde; Mac Takvim'ine `.ics` aktarma |
| ⌘4 | **Not Defteri** | Yazdıkça kaydedilen notlar, işaretlenebilir listeler, renk, etiket, sabitleme, arşiv; Markdown dışa aktarma |
| ⌘5 | **Ön Muhasebe** | Dönem seçimi, gelir/gider/net, alacak/borç, KDV dengesi, vadesi geçenler; 12 aylık grafik, cari bakiyeler, kategori dağılımı; Excel, CSV, PDF ve yazdırma |
| ⌘6 | **Tablolar** | Formüllü hesap tablosu (TOPLA, EĞER, DÜŞEYARA, ETOPLA…), çoklu sayfa, biçimlendirme, sıralama, doldurma, satır/sütun işlemleri; Excel/CSV içe ve dışa aktarma; paylaşım ve eşzamanlı düzenlemede otomatik birleştirme |
| ⌘7 | **Rehber** | Kişi/cari kartları ve siteye kaydolan üyelerin canlı rehberi; tek tıkla arama, WhatsApp, e-posta; Mac Kişiler'e `.vcf` aktarma |
| ⌘8 | **Hesap Araçları** | Hesap makinesi (geçmişiyle), KDV, yüzde, iskonto zinciri, masraf bölüştürme, taksit, tarih farkı |
| ⌘9 | **Odak Sayacı** | Pomodoro, geri sayım, kronometre; maç süresi için hızlı geri sayım |

## Web sitesinde olmayan masaüstü özellikleri

- **Bir kez giriş, 3 ay kullanım.** Oturum 90 gün açık kalır. Oturum bilgisi Mac'in Anahtar Zinciri
  ile şifrelenir; diskte düz metin olarak durmaz.
- **İnternet yokken de çalışır.** Son görülen veriler diskte saklanır. Bağlantı yokken eklenen not,
  görev, etkinlik, muhasebe kaydı ve kişiler kuyruğa alınır; bağlantı gelince sırayla gönderilir.
- **Her yerden hızlı kayıt: ⌃⌥N.** Hangi uygulamada olursanız olun küçük bir pencere açılır:
  görev, not, etkinlik ya da gider tek satırda kaydedilir. “yarın 14:00 sahayı ara !” gibi yazılan
  tarih, saat ve öncelik kendiliğinden anlaşılır.
- **Mac bildirimleri.** Ajanda hatırlatmaları ve zamanı gelen görevler pencere kapalıyken de bildirim olarak gelir.
- **Menü çubuğu simgesi.** Çalışan odak sayacının kalan süresi, yaklaşan etkinlikler ve açık iş sayısı.
- **Dock rozeti.** Bugün ve gecikmiş iş sayısı.
- **Komut paleti: ⌘K.** Araçlara geçiş, hızlı eylemler ve görev, not, kişi, tablo ve muhasebe kayıtlarında arama.
- **Dosyalar doğrudan Mac'e.** Excel, CSV, PDF, `.ics`, `.vcf` ve Markdown dışa aktarma; Excel ve CSV açma.

## Kurulum

1. [Releases](../../releases/latest) sayfasından `Elitlig-Araclar-<sürüm>.dmg` dosyasını indirin.
2. Dosyayı açın ve **Elitlig Araçlar**'ı **Applications** klasörüne sürükleyin.
3. Uygulama Apple Developer sertifikasıyla imzalı olmadığı için macOS ilk açılışta engeller. Bir kez şunu yapın:

   ```bash
   xattr -cr "/Applications/Elitlig Araclar.app"
   ```

   ya da uygulamayı açmayı deneyip **Sistem Ayarları → Gizlilik ve Güvenlik → Yine de Aç**.
4. Elitlig yönetim hesabınızla giriş yapın.

Apple Silicon ve Intel Mac'lerde çalışır (evrensel uygulama). macOS 12 ve üzeri gerekir.

## Oturum süresi

Uygulama girişte sunucuya `client: "desktop"` ve `X-Client-Platform: desktop` gönderir. Sunucu bu
girişlere 90 günlük jeton verir (`elitlig-server` → `routes/User.js`, `DESKTOP_SESSION_DAYS`).
Sunucudaki bu değişiklik yayına alınmadan önce jeton 24 saatliktir; uygulama jetonu süresinin
yarısı geçince yeniler, yine de 24 saatten uzun kapalı kalırsa yeniden giriş ister.

Oturum şu durumlarda kapanır: 90 gün dolunca, **Elitlig Araçlar → Oturumu Kapat** seçilince,
şifre değiştirildiğinde ya da hesap askıya alındığında.

## Geliştirme

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

Yapı:

- `app/`: Electron ana süreci. API istemcisi, çevrimdışı önbellek ve kuyruk (`api.js`), oturum
  (`session.js`), odak sayacı (`focus.js`), bildirimler (`reminders.js`), pencereler, menüler ve
  menü çubuğu (`main.js`).
- `renderer/`: React arayüzü (Vite). `renderer/src/lib/sheets` içindeki formül motoru ve Excel
  dönüştürücüleri web sitesiyle (`elitlig-client`) aynıdır; testleri `renderer/test` altındadır.

Kurulum dosyasını macOS'ta üretmek için:

```bash
npm run dist
```

Her push'ta GitHub Actions (`.github/workflows/build-mac.yml`) macOS'ta testleri çalıştırır, evrensel
`.dmg` ve `.zip` üretir, ad-hoc imzalar, uygulamanın çökmeden açıldığını denetler ve dosyaları
`package.json` sürümüyle adlanan GitHub Release'e yükler.
