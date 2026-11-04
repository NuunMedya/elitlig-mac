# Elitlig Araçlar — Mac uygulaması

Elitlig yönetim panelindeki **Araçlar** bölümünün Mac için yazılmış bağımsız uygulaması.
Siteyi bir pencerede açmaz: kendi arayüzü vardır ve Elitlig sunucusuyla doğrudan konuşur.
Veriler sitedekiyle aynıdır; uygulamada yapılan her değişiklik sitede, sitede yapılan her değişiklik
uygulamada görünür.

## Araçlar

| Kısayol | Araç | Uygulamada |
| --- | --- | --- |
| ⌘1 | **Bugün** | Gecikmiş ve bugünkü işler, önümüzdeki 7 gün, bu ayın gelir-gideri, son notlar, odak istatistiği; tek satırda görev ekleme |
| ⌘2 | **Yapılacaklar** | Web'deki tüm özellikler: Bugün / Yaklaşan / Tüm işler / Bana atananlar / Atadıklarım / Maç görevleri / Ekip takibi / etiket görünümleri; gruplu liste ve sürükle-bırak pano; maç masası (aşamalar, takım iletişimi, WhatsApp ile kadro talebi, gol müziği, maç görevlileri); Haftanın Enleri aday önerisi ve koordinasyonu (oylar, saha dizilimi, kaydet, yayınla); ekibe görev atama, maç görevlendirme, oyuncu/takım/maç bağlama, geri alma |
| ⌘3 | **Ajanda** | Ay / hafta / gün / liste; etkinliği sürükleyip başka güne taşıma; tekrar eden etkinlikler; son tarihli görevler takvimde; Mac Takvim'ine `.ics` aktarma |
| ⌘4 | **Not Defteri** | Yazdıkça kaydedilen notlar, işaretlenebilir listeler, renk, etiket, sabitleme, arşiv; Markdown dışa aktarma |
| ⌘0 | **Projeler** | Uçtan uca süreç ve satış takibi: hazır şablonlar (Organizasyon sezonu: 19 aşama, 208 adım), tamamen düzenlenebilir aşama ve adımlar, sorumlu rol → kişi eşleme, sonuç/cevap, kontrol listesi, bağlantılar; Kişiler (CRM): müşteri ve **tedarik görüşmeleri** (fiyat al, karşılaştır, anlaş → gidere yaz), tablo ve pano, tek tıkla görüşme sonucu, sonraki arama planı; **Bütçe** (gelir/gider kalemleri tahmin → bekliyor → ödendi, ödenince muhasebe hesabına işlenir); **Rehberden aktarma** (Rehberim, Elitlig üye rehberi, portföy → proje listesi); soru-cevap, iletişim geçmişi, portföy; adımın aracı adımın içinde açılır; Excel'den adım ve kişi aktarma, Excel/CSV dışa aktarma |
| ⌘5 | **Muhasebe** | Dört bölüm: **Hesaplar ve Virman** (kasa/banka/kart ve ortak/proje hesapları, hesaba doğrudan gelir/gider — tahmin, bekliyor, ödendi —, defterlere bağlı canlı bakiye, **hesap bazlı yetki** (kullanıcı, rol ya da proje ekibi: görüntüler / kayıt girer / yönetir), hesaplar ve defterler arası virman, ekstre); **Ön Muhasebe** (kişisel gelir-gider, kayıt girerken hesap seçimi, KDV, cari, vade takibi, Excel/CSV/PDF); **Maç Muhasebesi** (il defteri: maç maç gelir/gider kutucukları, genel kayıtlar, raporlar, personel ödemeleri, takım tahsilatları, eksikler, ayarlar); **Türkiye Geneli** (illerden tahakkuk, tahsilat, ek kalem, tutar düzeltme, maç başı ücret tarifeleri) |
| ⌘6 | **Tablolar** | Formüllü hesap tablosu (TOPLA, EĞER, DÜŞEYARA, ETOPLA…), çoklu sayfa, biçimlendirme, sıralama, doldurma, satır/sütun işlemleri; Excel/CSV içe ve dışa aktarma; paylaşım ve eşzamanlı düzenlemede otomatik birleştirme |
| ⌘7 | **Rehber** | Siteye kaydolan üyeler ve elle eklenen kişiler tek listede; Üye / Oyuncu / Takım başkanı / Yönetim / Manuel / Favoriler; üyeye kişisel not ve favori; arama, WhatsApp, e-posta; `.vcf` ve CSV |
| ⌘8 | **Hesap Araçları** | Hesap makinesi (geçmişiyle), KDV, yüzde, iskonto zinciri, masraf bölüştürme, taksit, tarih farkı |
| ⌘9 | **Odak Sayacı** | Pomodoro, geri sayım, kronometre; maç süresi için hızlı geri sayım |

## Web sitesinde olmayan masaüstü özellikleri

- **Bir kez giriş, 3 ay kullanım.** Oturum 90 gün açık kalır. Oturum bilgisi Mac'in Anahtar Zinciri
  ile şifrelenir; diskte düz metin olarak durmaz.
- **İnternet yokken de çalışır.** Son görülen veriler diskte saklanır. Bağlantı yokken eklenen not,
  görev, etkinlik, muhasebe kaydı, kişiler ve projelerdeki görüşme sonuçları kuyruğa alınır; bağlantı gelince sırayla gönderilir.
- **Her yerden hızlı kayıt: ⌃⌥N.** Hangi uygulamada olursanız olun küçük bir pencere açılır:
  görev, not, etkinlik ya da gider tek satırda kaydedilir. “yarın 14:00 sahayı ara !” gibi yazılan
  tarih, saat ve öncelik kendiliğinden anlaşılır.
- **Mac bildirimleri.** Ajanda hatırlatmaları ve zamanı gelen görevler pencere kapalıyken de bildirim olarak gelir.
- **Menü çubuğu simgesi.** Çalışan odak sayacının kalan süresi, yaklaşan etkinlikler ve açık iş sayısı.
- **Dock rozeti.** Bugün ve gecikmiş iş sayısı.
- **Komut paleti: ⌘K.** Araçlara geçiş, hızlı eylemler ve görev, not, kişi, proje, aranacak kişi, tablo ve muhasebe kayıtlarında arama.
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

## Projeler

Bir projenin tüm ihtiyaçları, süreçleri ve cevapları tek yerde: kimin aradığı, ne cevap alındığı,
kimin tekrar aranacağı, satışı kapananlar ve her adımın durumu. Veriler sitedeki **Araçlar → Projeler**
ile aynıdır (`/api/tools/projects`).

- **Şablonlar.** Yeni projede şablon seçilir: **Organizasyon sezonu** (kendi iş akışı tablonuzdaki
  208 görev, 19 aşamada, “Ana Sorumlu Personel” rolleriyle), **Satış süreci** ya da **Boş proje**.
  Hiçbir adım sabit değildir: aşama ve adım eklenir, yeniden adlandırılır, renklendirilir, sürükle-bırakla
  aşama içinde ve aşamalar arasında taşınır, silinir. Bir proje **şablon olarak kaydedilip** yeni
  projelerde kullanılabilir ya da kopyalanabilir.
- **Süreç.** Aşamalara göre gruplu adımlar; hızlı durum (Bekliyor, Devam ediyor, Yanıt bekleniyor,
  Takıldı, Tamamlandı, Gerek yok), sorumlu roller, atanan kişi, son tarih (geciken kırmızı), öncelik,
  kontrol listesi ve soru sayısı. Adım çekmecesinde her alan düzenlenir: **Sonuç / cevap**, açıklama,
  bağlantılar (site yolları — ör. `/editor/maclar` — tarayıcıda elitlig.com'da açılır), adımın soruları,
  notları ve geçmişi. “Yapılacaklara gönder” adımı göreve çevirir.
- **Araçlar adımın içinde.** Adıma bir araç bağlanır. “Potansiyel müşterilerin aranması” gibi bir
  adımda **Aracı aç**, Kişiler (CRM) panelini o adımın üstünde, ilgili aşamaya süzülmüş olarak açar:
  adımdan çıkmadan kişi eklenir, aranır, sonucu kaydedilir. Soru-cevap, portföy ve iletişim geçmişi de
  aynı biçimde açılır; Yapılacaklar, Ajanda, Not Defteri, Tablolar, Muhasebe, Rehber, Hesap Araçları ve
  Odak Sayacı bağlı adımlarda ilgili araca geçilir.
- **Kişiler (CRM) ve görüşme sonuçları.** Tablo ya da aşama panosu (sürükleyip aşama değiştirme),
  “Bugün aranacak / Gecikmiş / Aksiyonsuz” süzgeçleri, hızlı ekleme. Kişi çekmecesinde tek tıkla
  **Ara**, **WhatsApp** (wa.me/90…), **E-posta**; **hızlı sonuç düğmeleri** (“Ulaşılamadı”, “Geri
  dönecek”, “Tekrar aranacak”…) aramayı tek tıkla kaydeder, kişiyi ilgili aşamaya taşır ve sonraki
  aramayı planlar (sonuçlar ve gün sayıları proje ayarlarından düzenlenir). Sonraki aksiyon Ajanda'ya
  eklenebilir. Tüm projelerin aranacakları, adımlarım ve açık sorular **Takip** bölümünde ve Bugün
  ekranındaki “Projelerde bugün” kartında toplanır.
- **Tedarik görüşmeleri.** Kişiler sekmesinde “Müşteri görüşmeleri | Tedarik görüşmeleri” anahtarı.
  Tedarikçiler (tesis, kupa/madalya, baskı, yayın…) kendi aşamalarıyla (Tedarikçi adayı → Fiyat istendi
  → Fiyat alındı → Değerlendiriliyor → Pazarlık → Anlaşıldı / Vazgeçildi) izlenir; “Fiyat alındı”
  teklif tutarını sorar. Aynı konudaki teklifler çekmecede **fiyat karşılaştırması** olarak ucuzdan
  pahalıya sıralanır, en uygunu işaretlenir. “İşlemi tamamla → Gidere yaz” anlaşılan tutarı projenin
  bütçesine gider olarak yazar (hesap, Bekliyor/Ödendi, vade). Adımdaki “Tedarik görüşmeleri” aracı
  (ör. “Tesis araştırması”, “Ödül / kupa / madalya siparişlerinin verilmesi”) listeyi adımın içinde açar.
- **Bütçe.** Projenin gelir ve gider kalemleri: tahmini/gerçek tutar, durum (Tahmin, Bekliyor, Ödendi /
  Tahsil edildi, İptal), vade, kategori, bağlı kişi/tedarikçi ve adım. Tek tıkla “Ödendi / Tahsil
  edildi” kalemi bağlı muhasebe hesabına işler (“Hesaba işlendi: …”) ve hesap bakiyesi anında değişir.
  Varsayılan proje hesabı ve bu hesabın yetkilileri (“Proje ekibine yetki ver” dahil) Ayarlar → Bütçe ve
  muhasebe'den yönetilir; buradan projeye özel ortak hesap da açılır. Bütçe adımları (“Tahmini gider
  bütçesinin hazırlanması”…) Bütçe panelini o adıma süzülmüş açar.
- **Portföy.** “Satışı kapat” kişiyi kazanıldı aşamasına alır, portföye yazar (kategori, tutar) ve
  istenirse bütçeye gelir kaydı açar. Portföy proje içinde ve tüm projelerde (genel) görülür; elle de
  eklenir.
- **Rehberden ekle.** Rehberim, Elitlig üye rehberi (“Üyeleri görüntüleme” yetkisiyle) ve portföyden
  arama, kategori süzgeci ve çoklu seçimle kayıtlar projenin müşteri ya da tedarik listesine
  kopyalanır; listede olanlar işaretlenir. Proje listesi Rehber'e yazılmaz, Rehber de proje listesine
  karışmaz.
- **Excel.** “Excel'den adım aktar” kendi tablonuzu okur: **Görev / İş Kalemi**, **Ana Sorumlu
  Personel** ve isteğe bağlı **Aşama** sütunları (aşama sütunu yoksa BÜYÜK HARFLİ başlık satırları
  aşama sayılır). Kişiler de Excel/CSV'den aktarılır (aynı telefon/e-posta atlanır).
  Adımlar, kişiler ve portföy Excel/CSV olarak dışa aktarılır.
- **Ekip.** Proje sahibi yönetim kullanıcılarını düzenleyici ya da izleyici olarak ekler; izleyiciler
  yalnız görür.
- **Çevrimdışı.** Projeler ve son görülen hâlleri önbellekten açılır. Bağlantı yokken görüşme sonucu,
  not, soru ekleme/cevaplama ve adım/kişi güncellemeleri kuyruğa alınır (kişinin aşaması ve sonraki
  araması ekranda hemen güncellenir); bütçe kalemi ekleme ve “Ödendi” yapma da kuyruğa alınır.
  Proje, aşama, adım ve kişi oluşturma ya da silme, görüşme kapanışı ve rehberden aktarma bağlantı
  ister ve açık bir uyarı verir.

## Hesaplar ve virman

Elitlig'in muhasebe sistemlerinde kasa/banka hesabı kavramı yoktu. `elitlig-server`'a eklenen
`/api/finance` modülü kişisel, il ve Türkiye geneli kapsamlı hesaplar tanımlar. Bir hesap o defterin
bir ödeme yöntemine (ör. il defterindeki "Nakit") bağlanırsa ödenmiş kayıtlar bakiyeye kendiliğinden
yansır. Hesaplar arasında (ör. il kasasından merkez banka hesabına) virman yapılır; virmanlar
defterlerin gelir/gider toplamlarını bozmaz. Bu özellik sunucudaki değişiklik yayına alınınca çalışır.

- **Hesaba gelir / gider.** Her hesap kartının menüsünden (Gelir ekle, Gider ekle, Hareketler, Ekstre,
  Virman, Düzenle, Yetkiler, Arşivle) doğrudan kayıt girilir: tutar ya da tahmini tutar, durum (Tahmin,
  Bekliyor, Ödendi / Tahsil edildi), kayıt / vade / ödeme tarihi, kategori, cari, belge no. Yalnız
  ödenmiş kayıtlar bakiyeye yansır; tahmin ve bekleyenler kartta ayrıca gösterilir. Hareketler
  sekmesinde kayıtlar süzülür, tek tıkla ödendi yapılır, düzenlenir ya da silinir. Ön Muhasebe'de kayıt
  girerken hesap seçilirse kayıt yalnız o hesaba işlenir; Projeler'in bütçe kalemleri de seçilen hesaba
  düşer.
- **Hesap bazlı yetki.** “Yetkiler” penceresinde hesabın kimlere görüneceği seçilir: kapsam yetkisine
  göre ya da **yalnız seçilen kişiler**; listeye kullanıcı (aranabilir), rol ya da proje ekibi
  eklenir ve düzey verilir: Görüntüleyebilir, Kayıt girebilir, Yönetebilir. **Ortak / proje hesabı**
  (ör. “Elit Junior Cup kasası”) her zaman kısıtlıdır: yalnız açan kişi, admin ve yetki verilenler görür;
  bu hesaba yetkili kişi başka hesapları görmez. Kartlardaki menüler yalnız yetkinin izin verdiği
  işlemleri gösterir.
- **Çevrimdışı.** Hesap hareketi ekleme ve “Ödendi” yapma kuyruğa alınır; hesap açma, virman, yetki
  değişikliği ve kayıt silme bağlantı ister.

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
