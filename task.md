# ITSPress — Task List

Daftar pekerjaan yang perlu diselesaikan sebelum demo / sidang Tugas Akhir.
Status: `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai

---

## Prioritas Tinggi

### 1. Simulasi Payment Gateway (Skenario Realistis)
**Tujuan:** Menggantikan transaksi *instant-success* dengan alur pembayaran yang tampak nyata saat demo.

**Pendekatan yang direkomendasikan — Midtrans Sandbox:**
- Daftar akun di [sandbox.midtrans.com](https://sandbox.midtrans.com) (gratis, tidak perlu bisnis nyata)
- Gunakan library `midtrans-go` di backend untuk membuat *Snap payment token*
- Frontend redirect ke halaman pembayaran Midtrans (UI kartu kredit/transfer bank muncul sungguhan)
- Midtrans mengirim *webhook callback* ke backend untuk update status transaksi → `success` / `failed`
- User tetap bisa bayar dengan nomor kartu uji coba Midtrans, tapi tampilannya persis seperti asli

**Sub-task Backend:**
- [x] Tambah dependency `github.com/midtrans/midtrans-go` di `go.mod`
- [x] Tambah env var `SERVER_KEY`, `CLIENT_KEY`, `MERCHANT_ID` di `.env` (root project)
- [x] Refaktor `Purchase()` di `transaction_controller.go`: set status awal `pending`, lalu request Snap token ke Midtrans
- [x] Tambah endpoint `POST /transactions/notification` (webhook Midtrans) — update status ke `success`/`failed`
- [x] Tambah endpoint `GET /transactions/:id/status` — cek status transaksi + sync otomatis dari Midtrans API
- [x] Update model `Transaction`: tambah kolom `snap_token`, `payment_url`, `midtrans_order_id`

**Sub-task Frontend:**
- [x] Halaman konfirmasi pembelian: tampilkan detail buku + harga sebelum bayar
- [x] Setelah `POST /transactions`, buka Snap modal Midtrans (`window.snap.pay`) — fallback ke `payment_url` jika Snap.js belum siap
- [x] Halaman `/payment/success` dan `/payment/pending` sebagai callback URL dari Midtrans
- [x] Polling status transaksi di dashboard setiap 5 detik selama ada transaksi `pending`
- [x] Tombol "Lanjutkan Bayar" untuk transaksi pending, "Aktifkan Lisensi" hanya untuk status `success`

> **Alternatif jika Midtrans terlalu rumit untuk deadline:** Buat halaman pembayaran mock sendiri
> (`/payment/:transaction_id`) dengan form kartu kredit palsu (nomor, expired, CVV) dan tombol
> "Bayar Sekarang" yang setelah 2 detik update status ke `success`. Masih terlihat realistis saat demo.

---

### 2. Keranjang Belanja (Cart)
**Tujuan:** User mengumpulkan e-book di keranjang sebelum melakukan pembayaran, menggantikan alur "beli langsung satu buku" menjadi pengalaman belanja yang lebih lengkap.
> Dependensi: task ini harus diselesaikan **bersamaan atau setelah** task 1 (Payment Gateway), karena tombol checkout di cart akan memicu alur pembayaran Midtrans.

**Alur yang diusulkan:**
```
User klik "Tambah ke Keranjang" di halaman katalog / detail buku
  → Item masuk ke cart (disimpan di database, bukan localStorage)
  → Icon cart di Navbar menampilkan badge jumlah item
  → User buka halaman /cart → lihat semua item + subtotal
  → Klik "Checkout" → untuk setiap item buat transaksi (status pending)
  → Redirect ke halaman pembayaran Midtrans
  → Setelah bayar sukses → cart dikosongkan otomatis
```

**Sub-task Backend:**
- [x] Buat model `CartItem`: `id`, `user_id` (FK), `book_id` (FK), timestamps — pastikan `(user_id, book_id)` unique
- [x] Endpoint `POST /cart` — tambah buku ke cart (cegah duplikat & buku yang sudah dibeli)
- [x] Endpoint `GET /cart` — ambil semua item cart user beserta detail buku (preload Book)
- [x] Endpoint `DELETE /cart/:book_id` — hapus satu item dari cart
- [x] Endpoint `POST /cart/checkout` — buat transaksi `pending` untuk setiap item di cart, kembalikan daftar `transaction_id` + `payment_url` (integrasi Midtrans dari task 1)
- [x] Setelah pembayaran sukses (webhook Midtrans): hapus otomatis item yang sudah terbayar dari cart

**Sub-task Frontend:**
- [x] Tombol "Tambah ke Keranjang" di halaman katalog dan halaman detail buku
  - Jika buku sudah ada di cart: ganti label tombol menjadi "Sudah di Keranjang"
  - Jika buku sudah dibeli: ganti label menjadi "Sudah Dimiliki"
- [x] Icon keranjang di Navbar dengan badge angka jumlah item (update realtime)
- [x] Halaman `/cart`:
  - Tabel/grid item: cover thumbnail, judul, nama publisher, format, harga
  - Tombol hapus per item
  - Total harga di bagian bawah
  - Tombol "Checkout Semua" → proses pembayaran
- [x] Kosongkan tampilan cart setelah checkout berhasil
- [x] Pesan informatif jika cart kosong: "Keranjang Anda masih kosong. Jelajahi katalog kami."

---

### 3. Forgot Password
**Tujuan:** Fitur reset password bagi user yang lupa kredensial login.

**Alur yang diusulkan:**
```
User masukkan email di halaman Forgot Password
  → Backend generate reset token (UUID, expire 1 jam)
  → Simpan token di DB (tabel baru: password_reset_tokens)
  → Kirim email berisi link reset (atau tampilkan token di console untuk demo)
  → User klik link → halaman Reset Password
  → User masukkan password baru
  → Backend validasi token → update password → hapus token
```

**Sub-task Backend:**
- [x] Buat model `PasswordResetToken`: `id`, `user_id`, `token` (UUID), `expires_at`, `used`
- [x] Endpoint `POST /auth/forgot-password` — terima email, generate & simpan token, kirim email
- [x] Endpoint `POST /auth/reset-password` — verifikasi token, update password, tandai token `used`
- [x] Konfigurasi pengiriman email via SMTP (Gmail App Password direkomendasikan):
  - Tambah env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL`
  - Gunakan package `net/smtp` (stdlib Go, tanpa dependency tambahan)
- [x] Validasi: token sudah expired / sudah dipakai → tolak dengan pesan jelas

**Sub-task Frontend:**
- [x] Halaman `/forgot-password`: form input email + tombol kirim
- [x] Tampilkan pesan sukses "Link reset telah dikirim ke email Anda" setelah submit
- [x] Halaman `/reset-password?token=xxx`: form password baru + konfirmasi password
- [x] Tambah link "Lupa password?" di halaman `/login`
- [x] Validasi: password baru minimal 6 karakter, konfirmasi harus cocok

---

## Prioritas Menengah

### 4. Penguatan Hak Digital (DRM Rights)
**Tujuan:** Menutup celah keamanan yang ditemukan saat pengujian di Thorium Reader — print, copy-paste, dan screenshot.

---

#### Yang BISA diperbaiki lewat LCP Rights

Root cause ada di `backend-cms/controllers/license_controller.go` baris 113–114:
```go
"rights": map[string]interface{}{
    "print": 10,    // ← mengizinkan cetak hingga 10 halaman
    "copy":  2048,  // ← mengizinkan salin teks hingga 2048 karakter
    ...
}
```
Thorium Reader **sepenuhnya menghormati** nilai-nilai ini — jika diset `0`, tombol print dinonaktifkan dan text selection diblokir di dalam reader.

**Copy-Paste (Salin Teks)**
- [x] Ubah `"copy": 2048` → `"copy": 0` di `GenerateLicense()` untuk menonaktifkan sepenuhnya
- Atau set nilai kecil (misal `100`) jika ingin izinkan salin terbatas untuk aksesibilitas

**Print (Cetak)**
- [x] Ubah `"print": 10` → `"print": 0` di `GenerateLicense()` untuk menonaktifkan sepenuhnya

---

#### Yang TIDAK BISA dicegah oleh LCP (dan penjelasannya untuk laporan TA)

**Screenshot**

Ini adalah **"Analog Hole Problem"** — keterbatasan fundamental yang berlaku pada **semua sistem DRM berbasis software**, termasuk Adobe DRM, Apple FairPlay, Google Widevine, dan Readium LCP.

Alasannya bersifat teknis:
- Di Windows dan macOS, tidak ada mekanisme OS yang memblokir screenshot dari aplikasi lain
- API screenshot beroperasi di level kernel/compositor, di luar jangkauan aplikasi user-space
- Satu-satunya platform yang mendukung pencegahan screenshot adalah **Android** (via `FLAG_SECURE`), itupun hanya memblokir screenshot OS — bukan screen recording dari perangkat lain
- Thorium Reader (open source) tidak mengimplementasikan perlindungan screenshot karena memang tidak mungkin secara andal di desktop

**Mitigasi yang realistis — Social/Forensic Watermarking:**
- [ ] Embed informasi user (nama, email, ID) secara tak kasat mata ke dalam file PDF terenkripsi sebelum enkripsi LCP
- [ ] Jika konten bocor melalui screenshot/foto kamera, watermark pada teks asli tetap ada dan bisa dilacak ke pembeli asal
- Catatan: ini implementasi non-trivial, bisa cukup dijadikan bagian **pembahasan keterbatasan sistem** di laporan TA tanpa harus diimplementasikan

> **Untuk laporan / sidang:** Jelaskan bahwa ITSPress menggunakan standar industri Readium LCP yang dipakai oleh 40+ distributor buku digital global (Feedbooks, De Marque, dll.). Keterbatasan screenshot adalah keterbatasan yang diakui oleh standar LCP sendiri dan diselesaikan dengan pendekatan legal (lisensi pengguna) bukan teknikal.

---

### 5. Halaman Detail Buku
**Tujuan:** Saat ini klik buku di katalog belum ada halaman detail tersendiri.

- [x] Buat halaman `/catalog/[id]` di frontend Next.js
- [x] Tampilkan: cover, judul, deskripsi, nama publisher, format, harga
- [x] Tampilkan tombol "Tambah ke Keranjang" (redirect ke login jika belum auth)
- [x] Jika buku sudah ada di cart: tampilkan "Sudah di Keranjang" + link ke `/cart`
- [x] Jika sudah dibeli: tampilkan "Sudah Dimiliki" + link ke dashboard

---

### 6. Lengkapi Dukungan Bahasa Inggris (i18n)
**Tujuan:** Fitur bahasa Inggris sudah ada toggle-nya di frontend tapi terjemahan belum lengkap.

- [ ] Audit semua string UI di `src/lib/i18n.ts` — tandai yang masih kosong / pakai bahasa Indonesia
- [ ] Lengkapi terjemahan Inggris untuk semua halaman: login, register, catalog, dashboard, settings, publisher
- [ ] Pastikan pesan error dari backend juga bisa ditampilkan dalam bahasa yang dipilih
- [ ] Test toggle bahasa: semua teks harus berganti tanpa reload halaman

---

### 7. Admin Panel (Basic)
**Tujuan:** Saat ini role `admin` ada di database tapi tidak ada UI sama sekali.

- [x] Halaman `/admin/dashboard` — hanya bisa diakses role `admin`
- [x] Tab **Users**: daftar semua user, filter by role, nonaktifkan akun (soft delete)
- [x] Tab **Books**: daftar semua buku dari semua publisher, hapus konten bermasalah
- [x] Tab **Transactions**: riwayat semua transaksi, filter by status
- [x] Backend: tambah middleware `RequireAdmin` dan endpoint-endpoint admin di router

---

### 8. Dukungan Semua Tipe File Enkripsi LCP
**Tujuan:** Saat ini enkripsi hanya menangani `.epub` dan `.pdf`. Namun `lcpencrypt` (dari repo `readium-lcp-server`) mendukung 7 format publikasi digital — semua harus bisa diupload dan dienkripsi.

> ⚠️ **Status: Implementasi selesai — belum dilakukan testing manual** dengan file format selain `.epub` dan `.pdf`. Perlu diuji dengan file `.audiobook`, `.divina`, `.lpf`, `.webpub`, atau `.rpf` sungguhan untuk memastikan lcpencrypt menghasilkan output yang benar dan Thorium Reader dapat membukanya.

**Format yang didukung lcpencrypt** (referensi: `readium-lcp-server/encrypt/process_encrypt.go`):

| Input | Output Terenkripsi | Content-Type |
|---|---|---|
| `.epub` | `.epub` | `application/epub+zip` ✅ sudah jalan |
| `.pdf` | `.lcpdf` | `application/pdf+lcp` ✅ sudah jalan |
| `.lpf` | `.webpub` | `application/webpub+lcp` ✅ kode selesai, belum ditest |
| `.audiobook` | `.lcpa` | `application/audiobook+lcp` ✅ kode selesai, belum ditest |
| `.divina` | `.lcpdi` | `application/divina+lcp` ✅ kode selesai, belum ditest |
| `.webpub` | `.webpub` | `application/webpub+lcp` ✅ kode selesai, belum ditest |
| `.rpf` | `.webpub` | `application/webpub+lcp` ✅ kode selesai, belum ditest |

**Sub-task Backend (`book_controller.go`):**
- [x] Update `EncryptBook()`: perluas mapping `outExt` agar semua 7 format menghasilkan ekstensi output yang benar (`.lcpa`, `.lcpdi`, `.webpub`, dll.)
- [x] Update `UploadBook()`: hapus pembatasan format hanya `epub`/`pdf`; terima semua ekstensi yang didukung lcpencrypt
- [x] Update `ServeContent()`: set header `Content-Type` yang benar berdasarkan ekstensi file terenkripsi
- [x] Update cover generation di `UploadBook()`: skip ekstraksi cover otomatis untuk format yang bukan PDF; tetap izinkan upload cover manual

**Sub-task Model:**
- [x] Update field `Format` di `models/book.go`: mencantumkan semua 7 format yang didukung

**Sub-task Frontend:**
- [x] Update atribut `accept` di `<input type="file">` form upload publisher: tambahkan `.lpf,.audiobook,.divina,.webpub,.rpf` selain `.epub,.pdf`
- [x] Tampilkan label format yang benar di katalog dan dashboard via shared util `src/lib/format.ts` ("Audiobook LCP", "Divina", "Web Publication", dll.)
- [x] Warna badge format dibedakan: EPUB (ungu), Audiobook (oranye), format lain (hijau)

**Yang masih perlu dilakukan:**
- [ ] Testing manual upload + enkripsi file `.audiobook` / `.divina` / `.lpf` / `.webpub` / `.rpf`
- [ ] Verifikasi file hasil enkripsi dapat dibuka di Thorium Reader

---

## Prioritas Rendah (Nice to Have)

### 9. Cover Otomatis untuk EPUB dan Format Lain
**Tujuan:** Saat ini cover otomatis hanya diekstrak dari PDF via `mutool`. Untuk EPUB dan format lain, cover dibiarkan kosong kecuali publisher upload manual.

> **Catatan:** `lcpencrypt` mendukung ekstraksi cover dari EPUB dan RPF secara native via flag `-cover` (bukan `-extractcover`).

- [x] Tambah flag `-cover` saat memanggil `lcpencrypt` untuk EPUB, RPF, dan PDF
- [x] Tangkap file cover hasil ekstraksi dari direktori tmp WSL, salin ke `storage/covers/`, simpan URL ke DB
- [x] Izinkan publisher upload gambar cover manual saat upload buku (override cover otomatis)
- [ ] Fallback: jika tidak ada cover, gunakan cover placeholder default (gambar generik)

---

### 10. UX & Polish Frontend
**Tujuan:** Perbaikan kecil yang membuat aplikasi terasa lebih profesional saat demo.

- [x] Loading spinner di semua operasi async (upload buku, generate lisensi, pembelian)
- [x] Konfirmasi modal sebelum aksi penting (batalkan transaksi, ubah password, ubah passphrase) — komponen `ConfirmModal` reusable
- [x] Halaman 404 custom (`not-found.tsx`)
- [x] Pesan kosong yang informatif jika katalog/riwayat masih kosong
- [x] Page transition slide-in dari kanan saat masuk halaman detail buku (`template.tsx` + CSS animation)

---

### 11. Keamanan & Kesiapan Produksi
**Tujuan:** Bukan wajib untuk demo, tapi perlu dicatat untuk kelengkapan laporan TA.

- [ ] Batasi CORS: ganti `AllowAllOrigins()` dengan whitelist domain frontend di production
- [ ] Rate limiting pada endpoint login dan forgot-password (cegah brute force)
- [ ] Validasi tipe dan ukuran file upload (max 50MB, hanya format yang didukung lcpencrypt)
- [ ] Tambah HTTPS / TLS di production deployment
- [ ] Dokumentasi API (Swagger/OpenAPI) — bisa generate dari komentar Gin

---

## Catatan

- **Untuk demo Tugas Akhir**, prioritaskan task 1 (payment), 2 (cart), 3 (forgot password), dan 4 (DRM rights) karena paling terlihat oleh penguji.
- Task 2 (cart) dan task 1 (payment) harus dikerjakan beriringan — cart butuh endpoint checkout yang terintegrasi Midtrans.
- Task 4 (DRM rights): perbaikan `print`/`copy` di `license_controller.go` hanya 2 baris kode — lakukan lebih awal.
- Task 4 (screenshot): jangan coba diperbaiki secara teknis — dokumentasikan sebagai keterbatasan standar LCP untuk laporan TA.
- Task 8 (multi-format) bisa didemokan dengan upload file `.audiobook` atau `.divina` yang sudah dikemas dalam format Readium Package.
- Midtrans Sandbox bisa diakses penguji langsung dengan nomor kartu uji: `4811 1111 1111 1114` (Visa sukses).
- Forgot password untuk demo bisa pakai Gmail SMTP dengan *App Password* — tidak perlu server email sendiri.
