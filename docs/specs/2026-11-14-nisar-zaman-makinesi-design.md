# Tasarım Belgesi — NISAR Zaman Makinesi (çalışma adı)

> Takım: **GevrekOverFlow** · NASA Space Apps 2026 · Challenge: **Dancing with the SARs**
> Durum: **İnceleme bekliyor** · Tarih: 2026-11-14 · Teslim: 2026-11-15 23:59 (yerel etkinlik saati)
> Kaynak belgeler: `docs/01-why-kanit.md` (problem kanıtı), `docs/03-mevcut-araclar.md` (mevcut araçlar ve boşluklar)

---

## 1. Amaç

Challenge'ın tanımladığı problem: Dünya yüzeyindeki değişimler (yangın, tarım, sulak alan, buzul, deformasyon) **görselleştirilmesi, anlaşılması ve anlatılması zor**. NISAR bu değişimleri ölçüyor, ama verisi geniş kitle için erişilebilir değil.

Ekibin hedefi: Mevcut araçların **yapmadığı** şeyleri yapan, kullanımı kolay ve görsel olarak güçlü bir arayüz. Arayüz, NISAR'ın gördüğü değişimi şu yollarla anlamlı hale getirir:
- karşılaştırılabilir tarihleri kendisi bulur,
- seçilen her yerin zaman serisini çizer,
- renklerin ne demek olduğunu ekranda anlatır.

**Başarı ölçütleri**
1. Radar bilmeyen biri 2 dakika içinde "Muğla'da yangında ne oldu, tarlalarda ne oluyor?" sorusunu arayüzden cevaplayabilir.
2. Bir SAR araştırmacısı, uzman modunda seçtiği bir noktanın NISAR zaman serisini dB cinsinden CSV olarak alabilir.
3. Challenge'ın zorunlu öğeleri karşılanır: NISAR verisi, değişim görselleştirmesi, etkileşim, fiziksel nedenler hakkında hipotez, polarizasyon tartışması, açık kaynak.

## 2. Ekip kararları

| # | Karar |
|---|---|
| K1 | Challenge değişmiyor: Dancing with the SARs |
| K2 | Yeniliğin çekirdeği kategoriden bağımsız boşlukları kapatan arayüz: **G1** NISAR zaman serisi · **G2** karşılaştırılabilir tarihleri bulma · **G3** renkleri ve polarizasyonu yerinde açıklama · **G6** anlatı ile etkileşimin birlikte olması · **G7** geçiş takvimi |
| K3 | Tek alanla başlanır, mimari modülerdir. **İlk vitrin: Muğla–Fethiye yangını (28.07.2026) ve çevresindeki tarlalar** |
| K4 | Arayüz katmanlı: varsayılan **sade mod** (halk, öğrenci) ve açılabilir **uzman modu** (araştırmacı) |
| K5 | Kapsam dışı: abonelik, kullanıcı hesabı, uyarı sistemi, dünyanın her yerinde canlı işleme, diğer kategoriler (bunlar gelecek vizyonu) |
| K6 | Yalnızca NASA veri kaynakları kullanılır |
| K7 | Her şey bir GitHub deposunda olacak; depoda kişisel bilgi bulunmayacak |

## 3. Mevcut araçlardan farkımız (özet; ayrıntı `docs/03-mevcut-araclar.md`'de)

| Boşluk | Bugün (doğrulandı) | Bizde |
|---|---|---|
| G1 | Worldview'un grafik özelliği NISAR'da çalışmıyor; Vertex'te görselleştirme yok | Tıklanan noktanın NISAR HH/HV zaman serisi |
| G2 | Worldview karşılaştırmasında seçilen tarih bölgede boş çıkabiliyor | Zaman çizelgesinde yalnızca aynı geometriden tarihler |
| G3 | Katman bilgisi yalnızca teknik metin | İmleç altındaki renk sade dille açıklanıyor |
| G6 | StoryMaps statik, Worldview'da anlatı yok | Etkileşimli, rehberli hikâye modu |
| G7 | Yörünge izi katmanı var ama takvim yok | Bölge için NISAR geçiş takvimi |

Worldview'da **karşılaştırma, animasyon ve küre zaten var**; bunlar tek başına yenilik sayılmaz.

## 4. Kullanıcı akışı

1. **Küre:** Dünya dönüyor, üzerinde NISAR yörünge izleri görünüyor. Vitrin noktası işaretli. Tıklanınca kamera Muğla'ya uçuyor.
2. **Zaman makinesi:** Alttaki zaman çizelgesi yalnızca karşılaştırılabilir tarihleri gösteriyor. Kaydırınca NISAR kareleri akıyor; yangın günü çizelgede işaretli.
3. **Bir yere dokun:** Tıklanan noktanın radar eğrisi açılıyor. Eğri üzerinde yangın günü (FIRMS) ve optik görüntü günleri işaretli. Ormanın ani düşüşü, tarlanın ritmik iniş çıkışı görünüyor.
4. **"Bu ne demek?":** İmlecin altındaki renk ve sınıf sade dille açıklanıyor.
5. **Hikâye modu:** "Muğla'nın 2026 yazı" adlı 5–6 adımlık rehberli tur; harita ve grafik her adımda etkileşimli. 30 saniyelik demo videosunun iskeleti bu olacak.

| | Sade mod (varsayılan) | Uzman modu |
|---|---|---|
| Dil | Gündelik cümleler | dB, HH/HV, oranlar |
| Zaman çizelgesi | Otomatik seçilmiş tek bir geometri | Track ve yön seçimi; geometri kimliği görünür |
| Karşılaştırma | Önce/sonra kaydırıcısı | Herhangi iki tarih + fark haritası |
| Veri | — | Zaman serisini CSV olarak indirme; kaynak dosya adları |

## 5. Mimari

**Temel ilke:** Ağır işlemler vitrin bölgesi için önceden yapılır; site statiktir. Sunucu yok, hesap yok; tıklanan konum tarayıcıdan dışarı çıkmaz.

```
NASA CMR / ASF ──► pipeline/ (Python, önceden çalışır) ──► web/data/<bölge>/ ──► web/ (statik site, GitHub Pages)
                          │
                          └── docs/ (kanıt, doğrulama raporları)
```

### 5.1 Pipeline işlemleri

| # | İşlem | Girdi → çıktı | Öncelik |
|---|---|---|---|
| P1 | Sahne keşfi ve geometri gruplama | CMR/asf_search → geometri grupları + karşılaştırılabilir tarihler takvimi | Zorunlu |
| P3 | İndirme ve kırpma | GCOV `.h5` → bölge GeoTIFF'leri (HH, HV dB); ham dosya silinir | Zorunlu |
| P4 | Zaman küpü | GeoTIFF'ler → ortak ızgarada tarih × y × x | Zorunlu |
| P5 | Speckle azaltma | Küp → filtrelenmiş küp (hafif mekânsal filtre) | Zorunlu |
| P6 | Görsel kareler | Küp → her tarih için RGB kompozit (HH, HV, HV/HH) + çok tarihli RGB | Zorunlu |
| P7 | Değişim haritaları | Küp → önceki tarihe ve yangın öncesi temele göre log-ratio; yanık izi | Zorunlu |
| P13 | Web'e aktarım | Kareler → harita karoları; zaman serisi → tarayıcıda sorgulanabilir küçük ikili dosyalar | Zorunlu |
| P8 | Arazi sınıfı | Zaman serisi istatistiği → orman, maki, tarla, çıplak toprak, su, yerleşim | İkinci |
| P9 | Bağlam katmanları | FIRMS noktaları → olay işaretleri; OPERA DIST/HLS → doğrulama | İkinci |
| P10 | Açıklama kuralları | Piksel değerleri + sınıf + değişim → sade ve uzman cümle şablonları | İkinci |
| P2 | Geçiş takvimi (geçmiş + gelecek) | CMR; gelecek geçişler için `NISAR_COP` (**doğrulanmadı**) | Son |
| P11 | Güven maskesi | Dağlık yamaçlarda layover/gölge → düşük güven işareti | Son |
| P12 | Doğrulama | Yanık izi ↔ OPERA DIST/optik örtüşmesi; tarla döngüsü ↔ NDVI | Son |

**Vitrin verisi:** Muğla için `108D070` geometrisi (yangından önce 4, sonra 6 sahne). Ascending karşılaştırması gerekirse `129A020` kullanılır.

### 5.2 Tarayıcı bileşenleri

| Bileşen | Tek sorumluluğu | Veri kaynağı | Öncelik |
|---|---|---|---|
| Küre ve uçuş | Açılış ve bölgeye geçiş | GIBS (yörünge izleri, hesapsız) | Zorunlu |
| Zaman makinesi | Karşılaştırılabilir tarihlerde gezinme ve animasyon | P1 + P6 | Zorunlu |
| Zaman serisi paneli | Tıklanan nokta/alanın eğrisi ve olay işaretleri | P13 + P9 | Zorunlu |
| Önce/sonra kaydırıcısı | İki tarihi yan yana gösterme | P6 | Zorunlu |
| Açıklama balonu | İmlecin altındaki pikseli anlatma | P10 | İkinci |
| Hikâye modu | Rehberli tur | Önceden yazılmış adımlar | İkinci |
| Uzman modu | Fark haritası, geometri seçimi, CSV | P4, P7, P13 | Son |

### 5.3 Genişleme
- **Yeni bölge:** Pipeline'a yeni bir yapılandırma eklenir (bölge sınırı, olay tarihi, geometri).
- **Yeni kategori:** Kendi sınıf kurallarını, açıklama şablonlarını ve hikâyesini getiren bir modül.
- **Arka plan işleme (gelecek):** Pipeline, yeni NISAR geçişlerinde GitHub Actions gibi bir zamanlanmış çalıştırıcıyla güncellenebilir. Disk ve süre sınırları doğrulanmalı (bkz. açık sorular).

## 6. Hata durumları

| Durum | Davranış |
|---|---|
| Bir tarihte sahne bölgeyi kapsamıyor | P1 o tarihi takvime almaz |
| Pikselde veri yok (NaN) | Zaman serisinde boşluk bırakılır, enterpolasyon yapılmaz |
| Düşük güvenli piksel (P11) | Açıklama balonunda "radar bu yamaçta güvenilir değil" uyarısı |
| GIBS katmanı yüklenemedi | Küre altlık olmadan çalışır; vitrin kendi verisiyle devam eder |
| Earthdata hesabı yok | Pipeline P3'te durur ve açık bir mesaj verir |

## 7. Test ve doğrulama

- **Go/no-go (ilk iş):** Yangın öncesi (27.07) ve sonrası (20.08) iki sahnede yanık izi HV'de belirgin mi?
- **Bilimsel:** Yanık izi ile OPERA DIST arasındaki örtüşme oranı; tarla döngüsü ile NDVI arasındaki uyum. Sonuçlar `docs/` altında raporlanır.
- **Arayüz:** Tarayıcıda şu akışlar denenir: küre → uçuş → zaman makinesi → nokta seçimi → açıklama → hikâye modu.
- **Yayın:** GitHub Pages linki gizli pencerede, giriş yapmadan açılır.

## 8. Riskler

| Risk | Önlem |
|---|---|
| Provisional verinin kalitesi | Go/no-go testi |
| Earthdata hesabı yok | Ekip açacak; olmadan veri hattı çalışmaz |
| Disk (~19 sahne × 1,85 GB) | İndir, kırp, sil döngüsü |
| Gelecek geçişler doğrulanmadı (P2) | Yalnızca geçmiş geçişler gösterilir |
| Kapsam (2 kişi, ~1 gün) | Öncelik sırasına uyulur; "ikinci" ve "son" maddeler zaman kalırsa yapılır |

## 9. Teslim gereksinimleri (resmi kılavuzdan)

- 30 saniyelik demo videosu, İngilizce altyazılı. Arayüz ve teslim formu İngilizce.
- Herkese açık, giriş gerektirmeyen linkler (GitHub, GitHub Pages, YouTube).
- Teslim formunda NASA Data, References ve yapay zekâ kullanımı alanları doldurulacak. Beyan (README ile aynı): fikir ve kararlar ekibe ait; yapay zekâ araçları teknik kod ve yazımda destek olarak kullanıldı.
- NASA logosu ve marka unsurları kullanılmayacak.

## 10. Açık sorular

1. GitHub deposunun sahibi ve görünürlüğü (kişisel hesap mı, `GevrekOverFlow` organizasyonu mu; açık mı, gizli mi).
2. Commit'lerde kullanılacak git kimliği (ad ve e-posta).
3. Daha önce yazılmış `web/` ve `pipeline/` iskeletinin depoya alınıp alınmayacağı. Bu iskelet eski "kişisel skor kartı" fikrine göre yazıldı; bu spec'e göre yeniden düzenlenmesi gerekiyor.
4. Arka plan işleme için GitHub Actions'ın disk ve süre sınırlarının NISAR verisi için yeterli olup olmadığı. Hackathon sonrası için.
