# ScrapNet

Dashboard berbahasa Indonesia untuk menemukan website provider internet lewat Google, mengambil kandidat harga, dan membandingkan paket. React + Next.js App Router + TypeScript + Neon PostgreSQL. Disiapkan untuk Vercel.

## Menjalankan lokal

Gunakan Node.js 22 atau lebih baru.

```powershell
cd D:\ME\PRODUCT\ScrapNet
npm install
Copy-Item .env.example .env.local
npm run dev
```

Buka http://localhost:3000. Tanpa DATABASE_URL, aplikasi menggunakan data ilustrasi berlabel jelas. Pencarian dan perubahan data dinonaktifkan pada mode contoh. Tidak ada harga provider nyata yang di-seed.

## Mengaktifkan data nyata

1. Buat Neon PostgreSQL dari Vercel Marketplace (Storage → Connect Database → Neon), atau langsung di Neon. Isi `DATABASE_URL` di `.env.local`.
2. Buat akun Serper di https://serper.dev dan salin key ke `SERPER_API_KEY`. API ini menyediakan hasil pencarian Google; penggunaan mengikuti kuota akun.
3. Buat dua rahasia acak berbeda, minimal 24 karakter, untuk `ADMIN_SECRET` dan `CRON_SECRET`. Misalnya jalankan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` untuk masing-masing.
4. Jalankan `npm run db:push` untuk membuat tabel. Perintah ini memakai transaksi dan tidak menghapus tabel.
5. Mulai ulang server. Di tab Pengaturan, masukkan ADMIN_SECRET. Kunci hanya berada di memori tab, tidak di localStorage atau URL.
6. Temukan provider berdasarkan kota → periksa tautan sumber → setujui website → Ambil paket → buka Detail → periksa harga/kecepatan pada sumber → tandai sudah diperiksa atau hapus kandidat.

Semua pengunjung dapat membaca dashboard dan data sumber. Hanya pemegang kunci admin dapat menjalankan operasi. Ini model admin tunggal, bukan autentikasi multi-pengguna. Jangan memberikan kunci admin kepada pengunjung umum.

## Deploy ke Vercel

1. Push folder proyek ini ke repository Git dan import ke Vercel. Framework preset: Next.js. Root directory: root proyek. Build: `npm run build`.
2. Hubungkan Neon dan tambahkan empat environment variable di atas pada environment yang diinginkan. Jangan memakai prefix `NEXT_PUBLIC_` untuk rahasia.
3. Jalankan migrasi terhadap database produksi menggunakan `npm run db:push` dan `.env.local` yang menunjuk database tersebut. Untuk preview gunakan database/branch terpisah.
4. Deploy/redeploy. Buka Pengaturan dan uji pencarian satu kota, persetujuan satu website, dan pengambilan satu halaman.
5. `vercel.json` mengatur cron pukul 23.00 UTC / 06.00 WIB setiap hari. Vercel mengirim `Authorization: Bearer CRON_SECRET`. Pastikan fitur cron tersedia pada paket akun.

Cron mengambil **satu provider yang paling lama diperiksa per hari**, bergiliran. Ini bukan pembaruan semua provider setiap hari. Batas ini sengaja membatasi durasi dan beban pada tahap awal; tingkatkan arsitektur dengan antrean/worker untuk skala besar. Provider gagal tetap diputar dan kesalahannya dicatat. Discovery saat ini dipicu manual per wilayah; penarikan harga terjadwal otomatis setelah website disetujui.

## Perilaku scraper dan batasan

- Search menyimpan maksimal 10 hasil per permintaan dan deduplikasi domain + kota. Status kandidat bukan bukti situs resmi. Artikel dan reseller masih mungkin muncul dan harus dilewati pengelola.
- Menghormati robots.txt; gagal mengambil robots dianggap gagal tertutup. Tidak melewati CAPTCHA atau login.
- Mengambil HTML statis HTTPS, kemudian maksimal dua tautan paket pada origin yang sama bila tidak menemukan paket. Redirect lintas origin ditolak dan URL perlu dicek manual.
- Melindungi akses server dari SSRF dengan validasi protokol/port/credential, penolakan IP privat/reserved, pemeriksaan semua hasil DNS dan pinning alamat koneksi. Setiap redirect diperiksa lagi. Timeout 8 detik per halaman dan batas 2 MB.
- Parser hanya menerima blok dengan satu kecepatan dan satu harga Rp yang menyebut bulan. Semua hasil tetap perlu review; pajak, biaya pemasangan, kontrak, promo, dan cakupan alamat tidak ditebak. Website berbasis JavaScript, gambar, atau format kompleks memerlukan adapter/worker browser tambahan; Playwright scraping produksi belum diimplementasikan.
- Scrape berhasil mengganti kandidat lama secara atomik; paket terverifikasi tetap disimpan sebagai riwayat. Paket identik yang sudah terverifikasi tidak diduplikasi. Dashboard menampilkan snapshot terbaru per provider, URL, kecepatan, dan status; paket bernama berbeda dengan URL/kecepatan sama bisa tergabung. Cuplikan sumber disimpan sebagai bukti, bukan seluruh halaman.
- Harga yang berubah menjadi kandidat review baru; harga terverifikasi sebelumnya tetap terlihat dengan timestamp sumber. Tidak ada klaim harga real-time atau jaminan cakupan berdasarkan kota pencarian.
- Kunci server tidak dikirim ke browser. Mutasi dan cron membutuhkan bearer secret dan dikunci di PostgreSQL agar tidak tumpang tindih. Tidak ada pembatasan laju multi-user selain satu operasi aktif; tambahkan WAF/rate limit bila membagikan akses admin secara luas.
- Riwayat aktivitas pada UI dibatasi 100; daftar provider 300 dan paket 1000. Pagination, retention job, worker browser, dan auth multi-pengguna adalah pengembangan berikutnya.

## Verifikasi

```powershell
npm test
npm run build
```

Tes mencakup parser harga, blok ambigu, filtering tautan, validasi URL/IP, dan autentikasi. Koneksi Neon/Serper serta deployment produksi memerlukan kredensial akun sendiri dan belum bisa diverifikasi tanpa konfigurasi tersebut.

Referensi: https://vercel.com/docs/postgres · https://vercel.com/integrations/neon · https://serper.dev
