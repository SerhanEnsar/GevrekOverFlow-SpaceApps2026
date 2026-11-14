# Aşama 3 — Mevcut Araçlar: Özellik Envanteri ve Boşluk Analizi

> 2026-11-14 · Ekip kararı: Dancing with the SARs'ta kalınacak; mevcut araçların yapmadığı şeyler bulunup tasarım onların üzerine kurulacak.
> **Doğrulama:** ✔ = araç bugün açılıp denendi · D = dokümantasyon ve genel bilgiye dayanıyor, bugün denenmedi · ✗ = yok · ~ = kısmen

## Özellik matrisi

| Özellik | NASA Worldview | ASF Vertex | Copernicus Browser (ESA) | Global Forest Watch | Google Earth Timelapse | NISAR StoryMaps |
|---|---|---|---|---|---|---|
| NISAR verisi | ✔ sahte renk görüntü (GIBS) | ✔ arama ve indirme | ✗ (D) | ✗ (D) | ✗ (D) | ✔ (hazır örnekler, D) |
| Küresel harita / küre | ✔ 2B + küre modu (D) | ✔ 2B | ✔ 2B + 3B arazi (D) | ✔ 2B (D) | ✔ (D) | ~ hikâye haritası |
| Tarih kaydırıcısı ve animasyon | ✔ zaman çizelgesi + GIF | ✗ | ✔ timelapse (D) | ~ (D) | ✔ yıllık optik (D) | ✗ |
| Önce/sonra karşılaştırma | ✔ swipe / opacity / spy | ✗ | ✔ (D) | ~ (D) | ✗ | ~ statik |
| **NISAR için** nokta/alan zaman serisi grafiği | ✗ ✔ (grafik yalnızca renk paletli katmanlarda: *"Add a layer with a color palette to create a time-series chart"*) | ✗ | ~ yalnızca Sentinel-1 ve optik indisler (D) | ~ hazır uyarı istatistikleri (D) | ✗ | ✗ |
| Aynı yörünge/geometriden tarihleri eşleştirme | ✗ ✔ (A: 27 Tem dolu, B: 20 Tem boş; kullanıcı deneme-yanılmayla buluyor) | ~ Baseline/SBAS araçları (uzman için) ✔ | ✗ (D) | — | — | — |
| Radar renklerinin ve polarizasyonun **yerinde** açıklanması | ✗ ✔ | ✗ ✔ | ✗ (D) | — | — | ~ anlatı metni (D) |
| Hazır değişim tespiti çıktısı | ~ OPERA DIST (optik), DSWx (su) katmanları ✔ | ✗ | ~ kullanıcı betiği ile (D) | ✔ RADD (Sentinel-1 C-bant), GLAD, DIST uyarıları (D) | ✗ | ✗ |
| Birden çok sensörün karşılaştırılması ve uyum ölçümü | ~ katmanları üst üste koymak ✔, ölçüm yok | ✗ | ✗ (D) | ~ (D) | ✗ | ✗ |
| Hikâye + etkileşimli veri birlikte | ✗ | ✗ | ✗ | ~ "stories" (D) | ~ (D) | ~ hikâye var, etkileşimli analiz yok |
| Alan aboneliği / uyarı | ✗ | ✗ | ✗ | ✔ (D) | ✗ | ✗ |
| Hesap gerektirmeden kullanım | ✔ | ✔ arama · indirme için hesap | ~ (D) | ✔ (D) | ✔ | ✔ |
| Hedef kitle | Bilim ve meraklı kullanıcı | SAR uzmanı | Uzman–orta düzey | Orman yöneticisi, STK | Halk | Halk, eğitimci |

## Boşluklar (hiçbir aracın yapmadığı ya da yalnızca uzmanın yapabildiği)

| # | Boşluk | Kanıt |
|---|---|---|
| **G1** | **NISAR'ın sayısal zaman serisi** bir nokta ya da alan için görülemiyor | Worldview grafiği NISAR'da kapalı ✔; Vertex'te görselleştirme yok ✔ |
| **G2** | **Karşılaştırılabilir tarihleri bulmak** (aynı track/yön/frame) kullanıcıya bırakılmış | Worldview karşılaştırmasında boş B tarihi ✔; Muğla'da 4 geometri grubu ayrı ayrı (CMR) ✔ |
| **G3** | Radar renklerinin ve HH/HV polarizasyonunun **ekranda, yerinde** anlamlandırılması yok | Worldview ve Vertex'te katman bilgisi yalnızca teknik metin ✔ |
| **G4** | **L-bant (NISAR)** tabanlı hazır değişim tespiti yok; mevcut uyarılar C-bant (RADD) veya optik (DIST) | GFW (D), Worldview OPERA katmanları ✔ |
| **G5** | NISAR, optik ve yangın noktaları **aynı ekranda uyum ölçüsüyle** karşılaştırılamıyor | Worldview yalnızca üst üste koyuyor ✔ |
| **G6** | **Anlatı ile etkileşimli verinin birleşimi** yok: StoryMaps statik, Worldview anlatısız | ✔/D |
| **G7** | "Bu bölgede NISAR ne zaman geçti, ne zaman geçecek?" bilgisi kullanıcı için bir **takvim** olarak sunulmuyor | GIBS'te yörünge izi katmanı var ✔, ama takvim yok |

## Sınırlılık
Copernicus Browser, Global Forest Watch, Google Earth Timelapse ve StoryMaps bugün açılıp denenmedi (D). Tasarım bu araçlara karşı bir iddia içerirse (ör. "hiçbiri X yapmıyor"), önce ilgili araç açılıp doğrulanmalı.
