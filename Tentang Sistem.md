# ITSPress

## 1. Latar Belakang & Tujuan

ITS Press adalah penerbit akademik resmi Institut Teknologi Sepuluh Nopember. Saat ini distribusi e-book dilakukan secara manual — publisher mengirim file, pembeli menerima file tanpa perlindungan apapun. File tersebut bisa disalin dan disebarkan bebas.

**ITSPress** adalah sistem distribusi e-book digital yang dibangun untuk mengatasi masalah ini dengan tiga tujuan utama:

1. **Melindungi hak cipta** — file e-book dienkripsi dan hanya bisa dibuka oleh pembeli yang sah
2. **Mempermudah distribusi** — publisher upload sekali, sistem menangani enkripsi dan distribusi otomatis
3. **Memberikan pengalaman belanja** yang modern kepada pembaca — katalog, keranjang, pembayaran online

---

## 2. Arsitektur Sistem

Sistem terdiri dari tiga lapisan utama yang bekerja bersama:

```
┌─────────────────────────────────────────────────┐
│              PENGGUNA (Browser)                 │
│         Tampilan Web — Next.js 14               │
└────────────────────┬────────────────────────────┘
                     │ HTTP/API
┌────────────────────▼────────────────────────────┐
│            BACKEND / SERVER UTAMA               │
│         Go + Gin Framework + SQLite             │
│  • Autentikasi & otorisasi pengguna             │
│  • Manajemen buku, transaksi, lisensi           │
│  • Integrasi pembayaran (Midtrans)              │
└────────────────────┬────────────────────────────┘
                     │ Enkripsi
┌────────────────────▼────────────────────────────┐
│           SERVER ENKRIPSI LCP                   │
│        Readium LCP Server (open source)         │
│  • Mengenkripsi file e-book                     │
│  • Menerbitkan lisensi digital (.lcpl)          │
└─────────────────────────────────────────────────┘
```

### Tiga Peran Pengguna

| Peran | Akses |
|---|---|
| **Admin** | Menyetujui/menolak buku, mengelola semua pengguna dan transaksi |
| **Publisher** | Mengunggah buku, memantau statistik penjualan, menarik buku dari katalog |
| **Pelanggan** | Menelusuri katalog, membeli buku, mengunduh lisensi, membaca di Thorium Reader |

---

## 3. Alur Kerja Sistem

### Alur Publisher → Buku Tersedia di Katalog

```
Publisher upload buku (PDF/EPUB)
    ↓
Admin meninjau & menyetujui
    ↓
Sistem otomatis mengenkripsi file (Readium LCP)
    ↓
Buku muncul di katalog untuk dibeli pelanggan
```

### Alur Pelanggan → Membaca E-Book

```
Pelanggan pilih buku → tambah ke keranjang
    ↓
Checkout → halaman pembayaran Midtrans (kartu kredit / transfer bank)
    ↓
Pembayaran sukses → sistem otomatis membuat lisensi digital (.lcpl)
    ↓
Pelanggan unduh file .lcpl dari dashboard
    ↓
Buka di Thorium Reader → masukkan passphrase → baca e-book
```

---

## 4. Teknologi yang Digunakan

| Komponen | Teknologi | Alasan Pemilihan |
|---|---|---|
| Frontend (tampilan) | Next.js 14 (React) | Framework modern, performa tinggi, SEO-friendly |
| Backend (logika bisnis) | Go + Gin | Cepat, ringan, cocok untuk API |
| Database | SQLite | Cukup untuk skala demo/prototype, mudah di-deploy |
| Pembayaran | Midtrans | Payment gateway Indonesia terpercaya, ada sandbox gratis |
| Proteksi e-book | Readium LCP | Standar industri terbuka, dipakai 40+ distributor global |
| Reader e-book | Thorium Reader | Gratis, open source, mendukung Readium LCP |

---

## 5. Proteksi Hak Digital (DRM) — Readium LCP

Readium LCP (*Licensed Content Protection*) adalah standar perlindungan e-book terbuka yang dikelola oleh **EDRLab** (European Digital Reading Lab) dan digunakan oleh distributor buku digital internasional.

Daftar lengkap aplikasi dan layanan yang telah mengimplementasikan LCP dapat dilihat di:
**https://www.edrlab.org/readium-lcp/certified-apps-servers/**

### Cara Kerja Singkat

1. File e-book dienkripsi menggunakan algoritma AES-256
2. Setiap pembeli mendapat file lisensi unik (`.lcpl`) yang berisi kunci dekripsi
3. Kunci tersebut dilindungi oleh *passphrase* yang hanya diketahui pembeli
4. Tanpa file lisensi yang sesuai, file e-book tidak bisa dibuka

### Algoritma Kriptografi yang Digunakan

| Algoritma | Digunakan Untuk | Lokasi dalam Sistem |
|---|---|---|
| **AES-256-CBC** | Enkripsi isi file e-book (EPUB/PDF) | `lcpencrypt` dijalankan oleh backend saat admin menyetujui buku |
| **SHA-256** | Hashing passphrase pengguna sebagai kunci lisensi | `auth_controller.go` — disimpan sebagai `lcp_passphrase_hash`, dikirim ke LCP Server saat pembuatan lisensi |

**Mengapa dua algoritma berbeda?**

- **AES-256-CBC** dipilih karena merupakan standar enkripsi simetris yang ditetapkan oleh spesifikasi Readium LCP (URI resmi: `http://www.w3.org/2001/04/xmlenc#aes256-cbc`). Ukuran kunci 256-bit memberikan keamanan yang sangat tinggi untuk konten buku.
- **SHA-256** digunakan (bukan bcrypt) karena passphrase LCP bukan password biasa — nilainya perlu *deterministik* (input sama → output selalu sama) agar Thorium Reader di sisi klien bisa menghitung hash yang identik untuk mendekripsi CEK. Bcrypt tidak bisa dipakai di sini karena menggunakan salt acak sehingga outputnya berbeda setiap kali.

### Alur Enkripsi Detail (Cara Sistem Ini Bekerja)

Berikut adalah alur teknis lengkap dari saat publisher mengunggah buku hingga pelanggan berhasil membacanya:

```
TAHAP 1 — Upload & Persetujuan
──────────────────────────────
Publisher mengunggah file e-book (EPUB/PDF) + metadata
    ↓
File disimpan sementara di server (storage/books/)
Status buku: "pending" — belum terlihat di katalog
    ↓
Admin menerima notifikasi, mengunduh file, meninjau isi
Admin menyetujui → status berubah ke "approved"


TAHAP 2 — Enkripsi Otomatis (berjalan di background)
─────────────────────────────────────────────────────
Server mendeteksi status "approved" → memulai proses enkripsi otomatis

[2a] Memanggil program lcpencrypt dengan parameter:
     - Path file asli
     - Content ID unik (UUID yang dibuat sistem)
     - Output path untuk file terenkripsi

[2b] lcpencrypt melakukan:
     - Membangkitkan Content Encryption Key (CEK):
         • Menggunakan crypto/rand.Read() — CSPRNG (Cryptographically Secure
           Pseudo-Random Number Generator) yang disediakan langsung oleh OS
         • Di Linux/WSL: membaca dari /dev/urandom atau syscall getrandom()
         • Di Windows: menggunakan CryptGenRandom dari Windows CryptoAPI
         • Ukuran: 256-bit (32 byte) — unik untuk setiap buku
     - Membangkitkan IV (Initialization Vector) secara acak (128-bit / 16 byte)
       menggunakan metode yang sama; ditulis di awal file sebelum ciphertext
     - Mengenkripsi seluruh isi file menggunakan AES-256-CBC dengan CEK + IV tersebut
       (algoritma standar: http://www.w3.org/2001/04/xmlenc#aes256-cbc)
     - Mendaftarkan CEK ke LCP Server (server enkripsi terpisah)
     - Menghasilkan file terenkripsi baru (mis. .epub → .epub terenkripsi, .pdf → .lcpdf)

[2c] LCP Server menyimpan CEK, terikat pada Content ID
     File asli dihapus, hanya file terenkripsi yang disimpan
     Status buku diperbarui dengan Content ID → buku muncul di katalog


TAHAP 3 — Pembelian & Pembuatan Lisensi
────────────────────────────────────────
Pelanggan membayar → transaksi berhasil (status: success)
    ↓
Sistem otomatis membuat lisensi digital:

[3a] Sistem mengirim permintaan ke LCP Server:
     - Content ID buku yang dibeli
     - Hash SHA-256 dari passphrase pengguna (passphrase tidak pernah dikirim polos;
       hashing dilakukan di backend sebelum dikirim ke LCP Server)
     - Hak akses (copy: 0, print: 0 — tidak boleh salin/cetak)
     - Masa berlaku lisensi (opsional)

[3b] LCP Server:
     - Mengambil CEK buku dari database-nya
     - Mengenkripsi CEK menggunakan hash SHA-256 passphrase pengguna
     → CEK kini hanya bisa dibuka oleh pengguna yang tahu passphrase-nya

[3c] LCP Server mengembalikan file .lcpl (License Document):
     - Berisi CEK yang sudah terenkripsi dengan passphrase pengguna
     - Berisi link ke file e-book terenkripsi di server
     - Berisi hak akses (tidak bisa print, tidak bisa copy)
     - Ditandatangani secara kriptografis oleh LCP Server

File .lcpl disimpan di server, siap diunduh oleh pelanggan


TAHAP 4 — Membaca E-Book
─────────────────────────
Pelanggan mengunduh file .lcpl dari dashboard
    ↓
Membuka .lcpl di Thorium Reader
    ↓
Thorium Reader:
  [4a] Membaca .lcpl → mengikuti link → mengunduh file e-book terenkripsi
  [4b] Meminta pengguna memasukkan passphrase
  [4c] Menghitung hash SHA-256 passphrase → mendekripsi CEK dari .lcpl
  [4d] Menggunakan CEK untuk mendekripsi isi e-book (AES-256-CBC) → menampilkan konten

Tanpa passphrase yang benar → dekripsi gagal → buku tidak bisa dibuka
Tanpa file .lcpl → tidak ada CEK → buku tidak bisa dibuka
```

### Yang Berhasil Dicegah

- **Berbagi file terenkripsi**: File terenkripsi tidak berguna tanpa lisensi (.lcpl) yang sesuai
- **Berbagi file .lcpl**: Lisensi terikat passphrase pemilik — orang lain tidak tahu passphrase-nya
- **Copy-paste teks**: Dinonaktifkan melalui pengaturan hak (*rights*) di lisensi (`copy: 0`)
- **Cetak halaman**: Dinonaktifkan melalui pengaturan hak lisensi (`print: 0`)

### Keterbatasan yang Diakui Standar LCP

- **Screenshot**: Tidak bisa dicegah secara teknis di semua platform desktop. Ini adalah masalah *"Analog Hole"* yang berlaku pada **semua sistem DRM di dunia** termasuk Adobe DRM, Apple FairPlay, dan Google Widevine. Satu-satunya mitigasi yang realistis adalah watermarking forensik (menanamkan identitas pembeli secara tersembunyi di dalam konten).

### Syarat Komersialisasi — Perjanjian dengan EDRLab

Sistem ini saat ini berjalan menggunakan server LCP dalam mode **pengembangan/riset** (*open-source, self-hosted*) yang **tidak memerlukan perjanjian komersial**.

Namun, jika ITSPress ingin dikomersialkan secara resmi, ada kewajiban yang harus dipenuhi:

1. **Sertifikasi EDRLab** — Setiap layanan yang menerbitkan lisensi LCP secara komersial wajib disertifikasi oleh EDRLab untuk memastikan implementasinya memenuhi spesifikasi keamanan dan interoperabilitas standar

2. **Infrastruktur PKI** — EDRLab mengelola *Public Key Infrastructure* (semacam otoritas sertifikat digital) untuk seluruh ekosistem LCP. Untuk bergabung, organisasi mendapatkan sertifikat X.509 dan kunci privat dari EDRLab yang digunakan untuk menandatangani lisensi secara sah

3. **Biaya tahunan** — Ada biaya sertifikasi tahunan yang dibayarkan ke EDRLab sebagai kontribusi untuk pemeliharaan ekosistem dan verifikasi kesesuaian

4. **Perjanjian lisensi** — Organisasi harus menandatangani perjanjian yang berisi komitmen untuk mematuhi spesifikasi DRM dan membangun sistem yang aman serta interoperable

Informasi lengkap: **https://www.edrlab.org/projects/readium-lcp/become-lcp-license-provider/**

> **Relevansi untuk TA:** Untuk keperluan penelitian dan demo akademik, sistem ini sudah berfungsi penuh tanpa perjanjian komersial. Komersialisasi resmi menjadi langkah lanjutan jika ITS Press ingin mengadopsi sistem ini secara institusional.

---

## 6. Fitur yang Sudah Diimplementasikan

### Pelanggan
- Katalog e-book dengan halaman detail buku
- Keranjang belanja (bisa tambah beberapa buku sekaligus)
- Pembayaran via Midtrans (kartu kredit, transfer bank) — mode sandbox
- Dashboard: riwayat pembelian, unduh lisensi, pencarian e-book yang dimiliki
- Lupa password via email (SMTP)
- Pengaturan passphrase LCP

### Publisher
- Upload buku (EPUB, PDF, dan 5 format lainnya)
- Dashboard statistik: total buku, total pembelian, pendapatan per buku
- Edit judul/deskripsi buku (butuh persetujuan ulang admin)
- Tarik buku dari katalog / ajukan ulang

### Admin
- Tinjau dan setujui/tolak buku sebelum masuk katalog
- Unduh file buku untuk ditinjau isi sebelum menyetujui
- Kelola semua pengguna (aktifkan/nonaktifkan akun)
- Pantau semua transaksi
- Setujui/tolak pendaftaran publisher

---

## 7. Kelebihan Sistem

1. **Berbasis standar terbuka** — Readium LCP adalah standar industri yang diakui secara internasional, bukan solusi proprietary buatan sendiri

2. **Otomatisasi penuh** — setelah admin menyetujui buku, enkripsi dan pembuatan lisensi berjalan otomatis tanpa intervensi manual

3. **Pemisahan peran yang jelas** — admin, publisher, dan pelanggan memiliki akses yang sesuai perannya

4. **Pembayaran terintegrasi** — menggunakan Midtrans yang sudah dipercaya di ekosistem Indonesia

5. **Multi-format** — mendukung EPUB, PDF, Audiobook LCP, dan 4 format publikasi digital lainnya

6. **Portabilitas** — pembeli bisa membaca di berbagai perangkat yang mendukung Thorium Reader (Windows, Mac, Linux, iOS, Android)

---

## 8. Keterbatasan & Hal yang Perlu Dikerjakan

### Keterbatasan Teknis (Sudah Diketahui)

| Keterbatasan | Penjelasan | Status |
|---|---|---|
| Screenshot | Tidak bisa dicegah — keterbatasan fundamental semua DRM | Didokumentasikan sebagai batasan standar |
| SQLite | Database file-based, tidak cocok untuk traffic tinggi di produksi | Cukup untuk skala TA, dapat diganti PostgreSQL |
| Deployment | Belum ada setup untuk server produksi | Di luar scope TA |

### Fitur yang Belum Selesai

| Fitur | Prioritas | Keterangan |
|---|---|---|
| Terjemahan Bahasa Inggris lengkap | Menengah | Toggle bahasa sudah ada, terjemahan belum lengkap |
| Watermarking forensik | Rendah | Mitigasi screenshot — bisa jadi saran pengembangan lanjut |
| Rate limiting (keamanan) | Rendah | Penting untuk produksi, tidak wajib untuk demo |
| Testing format non-EPUB/PDF | Menengah | Kode sudah ada, belum diuji dengan file nyata |

---

## 9. Hal-hal Lain yang Relevan untuk Disampaikan

### Mengapa Readium LCP, bukan enkripsi sendiri?

Membangun sistem enkripsi DRM dari nol adalah pekerjaan bertahun-tahun dan rentan celah keamanan. Menggunakan standar yang sudah ada (*Readium LCP*) memungkinkan fokus pada masalah bisnis (distribusi e-book ITS) alih-alih masalah kriptografi. Pendekatan ini juga lazim di industri perangkat lunak (*"don't reinvent the wheel"*).

### Skalabilitas

Saat ini sistem menggunakan SQLite yang menyimpan data dalam satu file. Untuk skala universitas penuh, database dapat diganti ke PostgreSQL tanpa mengubah kode bisnis apapun — hanya konfigurasi koneksi yang berubah. Arsitektur sudah dipersiapkan untuk ini.

### Kepatuhan Hak Cipta

Setiap lisensi yang diterbitkan terikat pada satu akun pengguna. Jika e-book bocor, sistem dapat mengidentifikasi akun mana yang lisensinya digunakan — pendekatan yang sama dengan yang dipakai platform distribusi buku digital komersial.

### Perbandingan dengan Alternatif

| Platform | DRM | Multi-publisher | Kontrol penuh |
|---|---|---|---|
| Google Play Books | Proprietary | Tidak | Tidak |
| Amazon KDP | Proprietary | Tidak | Tidak |
| **ITSPress** | Readium LCP (standar terbuka) | Ya | Ya (self-hosted) |

Memiliki platform sendiri berarti ITS Press tidak bergantung pada kebijakan pihak ketiga dan data transaksi tetap di dalam kendali institusi.

---

*Dokumen ini dibuat untuk keperluan bimbingan Tugas Akhir — ITSPress Platform, 2026.*
