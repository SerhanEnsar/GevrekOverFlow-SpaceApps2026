# Go/No-Go — Muğla–Fethiye yangını, NISAR L-bant (2026-11-14)

**Karar ölçütü (plan, Task 2):** Yanık alandaki HV düşüşü, kontrol alanındaki düşüşten en az **2 dB** fazla ise GO.
**Sonuç: NO-GO.** Yanık alan ile kontrol alanı arasındaki fark yaklaşık 0,2 dB, ve yön beklenenin tersi (HV düşmemiş).

## Veri
- NISAR L2 GCOV (provisional), geometri `036D070` (descending), bölgeyi %100 kapsıyor.
- Önce: `NISAR_L2_PR_GCOV_026_036_D_070_..._20260722T165721` · Sonra: `NISAR_L2_PR_GCOV_028_036_D_070_..._20260815T165720`
- Bölgeye kırpıldı, 20 m piksel, GCOV `mask` katmanı uygulandı (0 ve 255 → veri yok), 5×5 speckle filtresi.
- Olay: NASA EONET `EONET_21928` "Wildfire in Türkiye 1029896" (kaynak GDACS), 2026-07-28, 6.534 ha, nokta 36,6637°K 29,4383°D.

## Yangının yeri bağımsız olarak doğrulandı
- **VIIRS NOAA-20/21 aktif yangın (Worldview, 2026-07-29):** EONET noktasında yoğun ateş noktası kümesi ve batıya uzanan duman.
- **VIIRS gerçek renk (2026-08-04):** Yaklaşık 29,39–29,47°D, 36,61–36,70°K aralığında koyu yanık izi.

## Ölçümler (ΔX = 15 Ağu − 22 Tem, dB)

| Alan | ΔHH | ΔHV | HH−HV önce → sonra |
|---|---|---|---|
| Optik yanık izi kutusu (29,39–29,47°D, 36,61–36,70°K) | +0,70 | +0,13 | 5,22 → 5,78 |
| Kontrol kutusu (29,52–29,58°D, 36,72–36,78°K) | +1,04 | +0,30 | 5,83 → 6,58 |

| Yangın noktasına uzaklık | ortalama ΔHV | ≤ −3 dB oranı |
|---|---|---|
| 0–1 km | +0,02 | %0,0 |
| 1–2 km | +0,11 | %0,0 |
| 2–3 km | +0,15 | %0,0 |
| 3–5 km | +0,30 | %0,0 |
| 5–8 km | +0,15 | %0,0 |
| Kontrol 10–14 km | +0,12 | %0,0 |

Bölge genelinde ΔHV ≤ −3 dB olan alan: 18 ha (EONET yanık alanı: 6.534 ha).

**İşleme hatası kontrolü:** İki tarihin HV pikselleri arasında r = 0,883, özdeş piksel %0,00 (farklı görüntüler). Konum optik yanık iziyle örtüşüyor.

## Yorum (hipotez, literatürle henüz doğrulanmadı)
L-bant (≈24 cm) dalgası esas olarak gövde ve kalın dallarla etkileşir. Kızılçam ormanlarında yangın sonrası kömürleşmiş gövdeler çoğunlukla ayakta kalır; bu durumda HV saçılması belirgin şekilde değişmeyebilir. Optik görüntüde yanık izi belirgin, radarda değil.

## Seçenekler (ekip kararı)
1. Aynı yangında ascending geometri `028A020` ile tekrar (aynı tarihler, farklı bakış açısı).
2. Daha büyük ve gövdeyi de yok eden bir yangınla tekrar (ör. İspanya 2026-07-17, 31.297 ha).
3. Vitrini L-bandın güçlü olduğu bir değişime kaydırmak (tarım döngüsü, su/taşkın).
4. Bulguyu hikâyenin parçası yapmak: "Radar her şeyi görmez: L-bant bu yangını neden göremedi?" (challenge'ın istediği hipotez bölümüne doğrudan uyar).
