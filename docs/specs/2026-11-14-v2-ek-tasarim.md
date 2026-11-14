# Tasarım eki v2 — son sürüm kapsamı

> Ana spec: `2026-11-14-nisar-zaman-makinesi-design.md`. Bu ek, 14.11.2026 planlama turunda ekibin aldığı kararları toplar.
> Teslim: 15.11.2026 23:59. Arayüz İngilizce. Yalnızca masaüstü.

## 1. Ekibin kararları

| # | Konu | Karar |
|---|---|---|
| 1 | Radar renkleri | Standart dual-pol kompozit: R=HH, G=HV, B=HH−HV (dB). Değişmiyor. |
| 2 | Veri kapsamı | İspanya'ya 20.01.2026 sahnesi (159A022) eklenir. Zaman çizelgesinde farklı işaretlenir: "different orbit — only HV comparable". Grafikte o tarih için HH gösterilmez. |
| 3 | Yorum altyapısı | Tüm eşikler ve metinler tek `web/rules.json` dosyasında. Kural motoru iki kaynaktan gelen girdiyle çalışır: vitrin (20 m, ölçülmüş dB) ve küresel GIBS (~500 m, renkten tahmin edilen dB). Her sonuç bir güven etiketi taşır. |
| 4 | Küresel yorum | Vitrin kutularının dışında GIBS NISAR katmanından (zoom ≤ 8) piksel okunur ve dB tahmin edilir. Sınıf ve **deneysel** değişim verilir. |
| 5 | Etkileşim | İmleç gezerken kısa balon, tıklayınca detaylı kart. |
| 6 | Küresel kart | Sınıf, sade açıklama ve güven · iki tarih seçici (NISAR'ın o noktadan geçtiği günler) · mini önce/sonra görüntü · değişim sayısı ("experimental") · 50 km içindeki EONET yangınları · katlanır "Details" bölümü (tahmini HH/HV, formül, kalibrasyon hatası). |
| 7 | Vitrin paneli | Mevcut özellikler + renk lejantı · katman seçici (radar / değişim haritası) · bölge özet kutusu · tıklanan noktanın zaman serisini CSV olarak indirme. |
| 8 | Açılış küresi | NISAR radar görüntüsü (GIBS) · son 12 günün geçiş izleri · EONET yangınları · vitrin noktaları · yıldızlı arka plan ve atmosfer parlaması. |
| 9 | Yangın zamanı | Alt şeritte EONET çubuğu (7 g · 30 g · 90 g · 1 y) · "Last fire" butonu · ◀ ▶ ile olaydan olaya atlama · "NISAR imaged after" filtresi · inişte küresel kartın tarihleri hazır seçili. |
| 10 | Uydu | TLE verisi (api.nasa.gov kataloğundaki TLE API; kaynak CelesTrak / US Space Force) **yalnızca görselleştirme için** kullanılır ve sitede ile README'de belirtilir. `satellite.js` ile saniyede bir konum. Eğik ışın çizgisi (yan bakış açısıyla) ve çizginin ucunda 747 km'de uydu; MapLibre fill-extrusion ile, three.js yok. Önce 30 dakikalık bir deneme; olmazsa yüzeyde ikon, iz ve şerit. |
| 11 | FIRMS | Şimdilik yok. Zaman kalırsa 3 saatte bir çalışan GitHub Action ile eklenir (P3). |
| 12 | Yöntem | Yan panelden açılan çekmece "How we measured": Radar nasıl görür · HH ve HV (polarizasyon) · kurallar tablosu (`rules.json`'dan otomatik) · bulgular (İspanya, Muğla hipotezi, Ocak testi, GIBS kalibrasyonu) · sınırlar · kaynaklar. |
| 13 | Görsel stil | Koyu ve sade bilimsel arayüz + sinematik uzay dokunuşu (yalnızca küre görünümünde yıldızlar, atmosfer parlaması, yumuşak geçişler). |
| 14 | Yerleşim | C: sol panel + altta birleşik zaman şeridi (radar tarihleri ve yangın çubuğu) + sağdan yöntem çekmecesi + tıklama kartı. |
| 15 | Hikâye modu | Kalır ve ilk açılışta otomatik başlar ("Explore freely" ile çıkılır). Metinleri ekip yazar. |
| 16 | Kalite hedefleri | Konsolda sıfır hata · GIBS, EONET ya da TLE erişilemezse site çökmez ve zarif bir mesaj gösterir · ilk açılış < 3 sn, vitrin yükleme < 2 sn. |
| 17 | Demo | En fazla 7 slayt; içeriği tamamen ekip hazırlar. |
| 18 | Yayın | Cila bitince depo public yapılır ve GitHub Pages açılır (önce kullanıcı onayı alınır). |

## 2. Doğrulanmış teknik dayanaklar (14.11.2026 ölçümleri)

- **Farklı yörünge (Ocak, 159A022 ↔ Temmuz, 095D068), değişmeyen alan:** HV r=0,90, fark +0,31 dB · HH r=0,76, fark −2,28 dB → yalnızca HV karşılaştırılabilir.
- **İspanya yanık alanı (≥3 dB düşüş, ~2.119 ha), HV:** Oca −15,0 · 14 Tem −14,8 · 26 Tem −18,9 · 19 Ağu −19,4 · 18 Eki −20,1. Kontrol alanı ≈ −15,1 dB'de sabit → 3 ayda iyileşme yok.
- **GIBS `NISAR_L2_Geocoded_Polarimetric_Covariance`:** CORS açık. Zoom ≤ 8 sağlıklı; zoom ≥ 9 karoları bozuk ya da siyah. Bazı günlerde karolar boş.
- **GIBS renk→dB (log1p kanalları üzerinde doğrusal model, İspanya 26 Tem ile kalibre):**
  - HV = −61,017 + 9,329·ln(1+G) + 0,071·ln(1+R)
  - HH = −50,065 + 7,047·ln(1+G) + 1,436·ln(1+R)
  - Doğrulama: İspanya 18 Eki → HV ±0,80 dB, HH ±0,95 dB · Muğla → HV ±1,0 dB (sapma −0,7).
- **GIBS sınıf tutarlılığı:** %85 (orman %95, çalı %83, açık alan %82, yerleşim %0 — ~500 m'de seçilemiyor).
- **GIBS değişim (−2 dB eşiği):** gerçek yanığın %96'sı yakalanıyor; değişmeyen alanda yanlış alarm %0,7; kesinlik %23 (karışık pikseller) → "experimental".
- **FIRMS CSV:** CORS yok. GIBS FIRMS MVT karoları 404 → tarayıcıdan doğrudan kullanılamıyor.
- **EONET:** CORS açık, wildfire geçmişi var (limit parametresiyle sayfalama).
- **TLE API:** CORS açık; NISAR (NORAD 65053) güncel.

## 3. Öncelik ve sıra

| Öncelik | İş |
|---|---|
| P0 | `rules.json` ve kural motoru (explain.js'in yerine) · yerleşim C · lejant · katman seçici · özet kutusu · CSV · Ocak sahnesi · yöntem çekmecesi · hata dayanıklılığı · performans · hikâyenin otomatik başlaması |
| P1 | Küresel GIBS yorumu (balon + kart + tarih seçici + mini görüntü + değişim + yakındaki EONET) · EONET yangın çubuğu + ışınlanma |
| P2 | Uydu: TLE + eğik ışın (önce deneme) |
| P3 | FIRMS Action |
| Son | Testler · README (TLE beyanı dahil) · public + Pages · slaytlar (ekip) |

## 4. Kapsam dışı

Mobil uyum · sunucu tarafı işleme (slaytta gelecek vizyonu) · hesaplar, bildirimler · FIRMS (P3'e kadar).
