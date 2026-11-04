# Elitlig Araçlar — Mac masaüstü uygulaması

elitlig.com'daki **Araçlar** bölümünün tamamını Mac'te ayrı bir uygulama olarak açar:

| Kısayol | Araç |
| --- | --- |
| ⌘0 | Araçlar Merkezi (bugünün özeti, önümüzdeki 7 gün, hızlı not) |
| ⌘1 | Yapılacaklar Listesi (görevler, maç görevleri, pano) |
| ⌘2 | Ajanda ve Takvim |
| ⌘3 | Not Defteri |
| ⌘4 | Ön Muhasebe (gelir-gider, KDV, cari, vade, Excel) |
| ⌘5 | Tablolar (formüllü hesap tabloları, paylaşım, .xlsx içe/dışa aktarma, yazdırma) |
| ⌘6 | Rehber (kişi/cari kartları ve siteye kaydolan üyelerin canlı rehberi) |
| ⌘7 | Hesap Araçları |
| ⌘8 | Odak Sayacı |

Uygulama sitenin canlı Araçlar sayfalarını kullanır; bu yüzden sitedeki **tüm özellikler ve
araçların bağlı olduğu tüm veriler** (görevler, maç görevleri, ajanda, notlar, muhasebe kayıtları,
paylaşılan tablolar, üye rehberi…) her zaman güncel haliyle gelir. Sitede yapılan her yenilik
uygulamaya kendiliğinden yansır; uygulamayı güncellemek gerekmez.

## Kurulum

1. [Releases](../../releases/latest) sayfasından `Elitlig-Araclar-<sürüm>.dmg` dosyasını indirin.
2. Dosyaya çift tıklayın, açılan pencerede **Elitlig Araçlar** simgesini **Applications** klasörüne sürükleyin.
3. İlk açılış (uygulama Apple Developer sertifikasıyla imzalı olmadığı için bir kereye mahsus):
   Uygulamalar klasöründe **Elitlig Araçlar**'a **sağ tıklayın → Aç → Aç**.
   macOS 15 (Sequoia) ve sonrasında: önce açmayı deneyin, sonra
   **Sistem Ayarları → Gizlilik ve Güvenlik → "Yine de Aç"** düğmesine basın.
4. Yönetim hesabınızla giriş yapın.

Apple Silicon (M1–M4) ve Intel Mac'lerde çalışır (evrensel uygulama), macOS 11 ve üzeri.

## Oturum: bir kez giriş, 3 ay kullanım

Uygulama kendini sunucuya `ElitligDesktop/<sürüm>` imiyle tanıtır; sunucu bu girişlere
**90 günlük** oturum verir (`elitlig-server` → `routes/User.js`, `DESKTOP_SESSION_DAYS`).
Oturum çerezi ve yerel veriler uygulamanın kalıcı deposunda saklanır; uygulamayı kapatıp
açsanız da, Mac'i yeniden başlatsanız da 3 ay boyunca yeniden giriş istenmez.

Oturum yalnız şu durumlarda kapanır: 90 gün dolunca, menüden **Elitlig Araçlar → Oturumu Kapat**
seçilince, şifre değiştirildiğinde/sıfırlandığında ya da hesap askıya alındığında.

> Sunucu tarafındaki 90 günlük oturum `elitlig-server` deposundaki değişiklik yayına alındığında
> etkinleşir. O zamana kadar uygulama çalışır ama oturum sitedeki gibi 24 saat sürer.
> Süre Heroku'da `DESKTOP_SESSION_DAYS` ayarıyla değiştirilebilir.

## Masaüstü özellikleri

- Menü çubuğunda **Araçlar** menüsü ve ⌘0–⌘8 kısayolları; Dock simgesine sağ tıklayınca araç listesi.
- Site menüsü masaüstünde yalnız Araçlar'ı gösterir (`elitlig-client` → `src/utils/desktopApp.js`).
- Son açık araç ve pencere boyutu hatırlanır.
- İnternet koparsa bilgi ekranı çıkar; bağlantı gelince kaldığınız sayfa kendiliğinden açılır.
- WhatsApp, telefon, e-posta ve dış bağlantılar Mac'in varsayılan uygulamasında açılır.
- Excel dışa aktarmaları İndirilenler'e kaydedilir; yazdırma, bildirimler, sağ tık kopyala/yapıştır çalışır.
- Kırmızı düğme pencereyi gizler, uygulama Dock'ta açık kalır (Mac alışkanlığı).

## Geliştirme

```bash
npm install
```

```bash
npm start
```

Kurulum dosyası (.dmg) macOS'ta üretilir:

```bash
npm run dist
```

Her push'ta GitHub Actions (`.github/workflows/build-mac.yml`) macOS üzerinde evrensel `.dmg`
ve `.zip` derler, ad-hoc imzalar ve `package.json` sürümüyle adlanan GitHub Release'e yükler.
Yeni sürüm için `package.json` içindeki `version` alanını artırmak yeterlidir.
