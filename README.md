# Dashboard Aging Stock

Dashboard interaktif aging stock untuk Kategori Sepatu dan Sandal Anak di 20 toko contoh sebuah peritel fashion (nama samaran: PT Ritel Fashion XYZ Tbk).

**Buka dashboard:** https://adzinzhalifunnas.github.io/dashboard-aging-stock/

## Isi

| Halaman | Pertanyaan yang dijawab |
|---|---|
| Ringkasan | Bagaimana kondisi stok saat ini? |
| Cegah aging baru | SKU baru mana yang berisiko jadi aging stock? (machine learning) |
| Atur alokasi toko | Apakah semua toko perlu dikirimi barang dengan cara yang sama? (graph analytics) |
| Pindahkan stok | Aging stock mana yang bisa dipindah ke toko lain? |
| Tentang data | Definisi istilah, metode singkat, dan sumber |

Nama toko, zona, dan product group di teks, tabel, dan grafik bisa diklik untuk memfilter seluruh dashboard.

## Data

- Hanya hasil ringkas dari notebook analisis; tidak ada data transaksi mentah.
- Kode toko (TOKO-xx), SKU, dan merek (MEREK-xx) sudah disamarkan. Nama perusahaan adalah nama samaran.
- Angka hanya berlaku untuk 20 toko contoh, posisi stok 30 September 2026.

## Teknis

HTML, CSS, dan JavaScript biasa tanpa library eksternal. Semua grafik digambar dengan SVG.
Untuk menjalankan di komputer sendiri, buka `index.html` di browser, atau jalankan:

```bash
python3 -m http.server 8765
```

lalu buka http://localhost:8765.
