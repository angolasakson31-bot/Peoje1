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
