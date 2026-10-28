# Profil Tanıma

Alüminyum profil kataloğunu (Excel'in videosundan çıkarılmış ~1130 profil) ezberlemek ve
profilin ucunu kamerayla çekip numarasını bulmak için telefonda çalışan uygulama.
İnternet olmadan çalışır (bir kez "Hepsini indir" dedikten sonra).

## Bölümler
- **Tanı:** Profilin ucunu tam karşıdan çek, sarı çerçeveyi kesitin etrafına daralt, "Tanı"ya bas.
  En yakın 5 aday çıkar; doğrusuna "✓ Bu" dersen uygulama o fotoğrafı öğrenir ve sonraki çekimlerde daha iyi bulur.
- **Ezber:** Resimden numara, numaradan resim veya numarayı yazarak çalışma. Bilemediklerin daha sık sorulur.
- **Liste:** Numara ile arama; her profilin videodaki Excel satırı. Yanlış okunmuş numara buradan düzeltilebilir.
- **Ayarlar:** Çevrimdışı indirme, düzeltme listesini dışa aktarma, öğrenilen fotoğrafları silme.

## Telefona kurulum
Uygulama GitHub Pages ile yayınlanır (kamera için HTTPS gerekir):
Repo → Settings → Pages → *Deploy from a branch* → bu dal ve `/ (root)`.
Açılan adresi Chrome'da aç → menü → **Ana ekrana ekle**.

## Veri nasıl üretildi
`tools/video/` içindeki betikler videoyu karelere ayırır, numara sütununu bulur, numaraları
kendi rakam tanıyıcısıyla okur, aynı numaranın tekrarlarını tek kayda indirir ve aynı satırın
birkaç karesini üst üste koyup ekran çizgilenmesini (moiré) temizler.
`tools/export_data.py` sonucu `data/` klasörüne yazar:
`data/profiles.json` (numara, çizim noktaları), `data/row/` (Excel satırı), `data/pic/` (yalnız çizim).

## Ezber yöntemi
- **Aralıklı tekrar:** Bilinen profiller giderek seyrek (1 gün → 3 gün → 1 hafta → 1 ay…), unutulanlar hemen tekrar sorulur.
- **Günlük yeni profil sayısı** Ezber ayarlarından seçilir (5–50).
- **Tanıtım:** Her yeni profil önce numarasıyla, döndürülmüş/aynalanmış halleriyle ve karıştırılabileceği benzerleriyle gösterilir.
- **Gerçekteki gibi soru:** Resim rastgele döndürülüp ters çevrilir; cevap yazılarak verilir (en kalıcısı), süre ölçülür.
- **Benzerleri ayırt etme:** Şıklar ve "karıştırma" listesi şekilce en çok benzeyen profillerden gelir (`tools/similar.py` → `data/similar.json`).
- **Hızlı tekrar / Zayıflarım:** Çalışılmış profillerden karışık veya çok unutulan / yavaş bilinenlerden sorular.

## Elle çizim, üstünden çizme, yeni profil
- **✏️ Çiz:** Kesiti parmakla çiz, en çok benzeyen profiller numaralarıyla sıralanır.
- **Üstünden çiz:** Çapraz ya da arkası karışık fotoğraflarda kesiti fotoğrafın üstünden çizip öyle tanıt.
- **Çapraz çekim:** Tanıma, kesitin döndürülmüş ve bir yönde basık (eğik bakılmış) hallerini de dener.
- **➕ Yeni profil ekle:** Katalogda olmayan profilin fotoğrafını numarasıyla kaydet; liste, ezber ve tanımaya katılır (telefonda saklanır).
