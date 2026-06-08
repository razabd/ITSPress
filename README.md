# ITSPress — Platform Distribusi E-Book Digital

Platform distribusi e-book digital berbasis web dengan perlindungan konten DRM menggunakan standar Readium LCP (Licensed Content Protection). Sistem mendukung tiga peran pengguna: pelanggan, publisher, dan admin. Dibangun sebagai Tugas Akhir di Institut Teknologi Sepuluh Nopember.

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Struktur Direktori](#struktur-direktori)
- [Prasyarat](#prasyarat)
- [Instalasi dan Menjalankan Lokal](#instalasi-dan-menjalankan-lokal)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Alur Bisnis](#alur-bisnis)
- [Deployment (VPS)](#deployment-vps)

---

## Fitur Utama

### Pelanggan

- Registrasi dan login dengan verifikasi email
- Browse katalog e-book yang tersedia dengan preview beberapa halaman
- Keranjang belanja dan pembayaran via Midtrans Snap
- **Web Reader bawaan** — baca langsung di browser tanpa aplikasi tambahan:
  - Format PDF: dekripsi di browser via AES-256-CBC, dirender dengan PDF.js (lazy loading, zoom, navigasi halaman, text search)
  - Format EPUB: dekripsi setiap resource EPUB di browser, dirender dengan epub.js (continuous scroll, text search, navigasi bab, keyboard shortcut)
  - Passphrase diverifikasi di sisi klien sebelum konten ditampilkan
- Web reader mendukung mode online; **web reader offline** (service worker + cache) direncanakan sebagai pengembangan lanjutan
- Riwayat pembelian dan daftar lisensi aktif
- Pengaturan passphrase LCP dan ganti password

### Publisher

- Upload e-book format **EPUB** dan **PDF**
- Cover di-generate otomatis saat upload:
  - PDF: ekstraksi halaman pertama via MuPDF
  - EPUB: parsing OPF manifest (EPUB2/3) dan ekstraksi gambar cover dari ZIP secara langsung
- Enkripsi konten berjalan otomatis di background setelah upload (AES-256 Readium LCP via `lcpencrypt`)
- Preview halaman di-generate otomatis bersamaan dengan enkripsi
- Manajemen katalog (withdraw / relist)
- Dashboard statistik penjualan

### Admin

- Manajemen pengguna (nonaktifkan / aktifkan kembali)
- Manajemen seluruh katalog buku
- Manajemen lisensi (list, detail, revoke, reissue) via LSD Server
- Pantau seluruh transaksi

---

## Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript | SSR/CSR, port 3000 |
| Backend | Go 1.25, Gin, GORM | REST API, port 8081 |
| Database | PostgreSQL 16 | Koneksi via `DATABASE_URL` |
| DRM | Readium LCP Server + LSD Server | Enkripsi AES-256, port 8989 (LCP) dan 8990 (LSD) |
| Payment | Midtrans Snap API | Pembayaran online |
| Email | SMTP Gmail | Verifikasi email dan reset password |
| Auth | JWT (24 jam) + bcrypt | Bearer token, password hashing |

### Dependensi Frontend Kunci

| Library | Kegunaan |
|---|---|
| `pdfjs-dist` | Render PDF terenkripsi di browser (PDF web reader) |
| `epubjs` | Render EPUB terenkripsi di browser (EPUB web reader) |
| `aes-js` | Dekripsi AES-256-CBC di sisi klien (W3C padding scheme LCP) |
| `jszip` | Buka dan susun ulang EPUB ZIP setelah dekripsi |

---

## Struktur Direktori

```
ITSPress/
|-- backend-cms/
|   |-- config/          # Konfigurasi database dan environment
|   |-- controllers/     # Handler endpoint API
|   |-- middlewares/     # JWT auth, rate limiter, token blacklist
|   |-- models/          # Struct GORM (User, Book, Transaction, License, CartItem)
|   |-- routes/          # Definisi router Gin
|   |-- services/        # Business logic (enkripsi LCP, preview halaman)
|   |-- utils/           # Helper: JWT, file I/O, GeneratePDFCover, ExtractEPUBCover
|   |-- seed.go          # Seed data awal (admin default)
|   +-- main.go          # Entry point
|
|-- frontend/
|   +-- src/
|       |-- app/                    # Next.js App Router
|       |   |-- catalog/            # Katalog dan detail buku
|       |   |-- dashboard/          # Dashboard pelanggan (lisensi, riwayat)
|       |   |-- publisher/          # Dashboard publisher (upload, manajemen buku)
|       |   |-- admin/              # Panel admin
|       |   |-- cart/               # Keranjang belanja
|       |   |-- read/[licenseId]/   # Web reader (PDF dan EPUB)
|       |   |-- payment/            # Halaman pasca-pembayaran (pending, success)
|       |   |-- settings/           # Pengaturan akun dan passphrase
|       |   |-- about/              # Halaman tentang
|       |   +-- ...                 # Auth pages (login, register, verify, dsb)
|       |-- components/   # Reusable UI components
|       |-- context/      # React Context (Auth, Cart)
|       |-- lib/          # Utilities: api client, lcpDecrypt (AES+EPUB+PDF pipeline)
|       +-- types/        # TypeScript interfaces
|
|-- readium-lcp-server/   # Readium LCP Server dan LSD Server (submodul/binary)
|
|-- SETUP/
|   |-- SETUP_GUIDE.md        # Panduan instalasi lokal (WSL + LCP Server)
|   +-- VPS_DEPLOYMENT.md     # Panduan deployment ke VPS
|
+-- .env                       # Environment variables (tidak di-commit)
```

---

## Prasyarat

| Kebutuhan | Versi | Keterangan |
|---|---|---|
| Go | >= 1.25 | Backend runtime |
| Node.js | >= 18 | Frontend runtime |
| PostgreSQL | 16 | Database (lokal atau Docker) |
| WSL2 (Ubuntu) | — | Menjalankan LCP Server, LSD Server, dan `lcpencrypt` |
| MuPDF (`mutool`) | — | Generate cover PDF; install di WSL: `apt install mupdf-tools` |
| Readium LCP Server | — | Lihat [SETUP_GUIDE.md](SETUP/SETUP_GUIDE.md) |

---

## Instalasi dan Menjalankan Lokal

### 1. Clone Repo

```bash
git clone <repo-url>
cd ITSPress
```

### 2. Setup PostgreSQL

Pastikan PostgreSQL berjalan di `localhost:5432`. Buat database:

```sql
CREATE DATABASE itspress;
```

### 3. Setup LCP Server dan LSD Server (WSL)

Ikuti panduan lengkap di [`SETUP/SETUP_GUIDE.md`](SETUP/SETUP_GUIDE.md).
Pastikan `lcpencrypt` dan `mutool` tersedia di PATH dalam environment WSL.

### 4. Konfigurasi Environment

Buat file `.env` di root direktori (lihat [Environment Variables](#environment-variables)) dan `frontend/.env.local`.

### 5. Jalankan Backend

```bash
cd backend-cms
go mod tidy
go run main.go
```

Backend berjalan di `http://localhost:8081`. Database di-migrate dan seed admin default dibuat otomatis saat pertama kali dijalankan.

### 6. Jalankan Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend berjalan di `http://localhost:3000`.

---

## Environment Variables

### Backend — `.env`

```env
# Database
DATABASE_URL=postgres://postgres:admin123@localhost:5432/itspress?sslmode=disable

# JWT
JWT_SECRET=<64-char hex random string>

# LCP Server
LCP_SERVER_URL=http://localhost:8989
LCP_SERVER_LOGIN=admin
LCP_SERVER_PASSWORD=admin123
LCP_ENCRYPT_BIN=lcpencrypt
LCP_PROVIDER=https://itspress.its.ac.id

# LSD Server
LSD_SERVER_URL=http://localhost:8990
LSD_SERVER_LOGIN=admin
LSD_SERVER_PASSWORD=admin123

# Midtrans
MERCHANT_ID=<Midtrans Merchant ID>
CLIENT_KEY=<Midtrans Client Key>
SERVER_KEY=<Midtrans Server Key>
MIDTRANS_ENV=sandbox

# Email (SMTP Gmail dengan App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=<Gmail App Password>

# URL
FRONTEND_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://localhost:8081

# Server (opsional)
PORT=8081
GIN_MODE=debug
```

Catatan CORS: saat `GIN_MODE=release`, backend hanya menerima request dari `FRONTEND_URL`. Di mode debug, `localhost:3000` dan `localhost:3001` otomatis diizinkan.

### Frontend — `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8081/api/v1
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=<Midtrans Client Key>
NEXT_PUBLIC_MIDTRANS_ENV=sandbox
```

---

## API Endpoints

Base URL: `/api/v1`

### Auth (Public)

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/auth/register` | Daftar akun baru |
| POST | `/auth/login` | Login, return JWT |
| POST | `/auth/verify-email` | Verifikasi email |
| POST | `/auth/forgot-password` | Kirim link reset password |
| POST | `/auth/reset-password` | Reset password dengan token |
| POST | `/auth/logout` | Logout (blacklist token) |

Semua endpoint auth dibatasi 10 request/menit per IP.

### Profil dan Akun (Login required)

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/profile` | Ambil data profil user |
| PUT | `/auth/password` | Ganti password |
| PUT | `/auth/passphrase` | Ganti passphrase LCP (Pelanggan) |

### Buku

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/books` | Public | Katalog buku tersedia |
| GET | `/books/:id` | Public | Detail buku |
| POST | `/books` | Publisher | Upload buku baru (enkripsi otomatis di background) |
| GET | `/books/my` | Publisher | Buku milik publisher |
| GET | `/books/my/stats` | Publisher | Statistik penjualan |
| PUT | `/books/:id` | Publisher | Update metadata atau ganti file |
| POST | `/books/:id/encrypt` | Publisher | Trigger ulang enkripsi LCP |
| POST | `/books/:id/withdraw` | Publisher | Tarik dari katalog |
| POST | `/books/:id/relist` | Publisher | Listing ulang |

### Transaksi dan Pembayaran

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/transactions` | Pelanggan | Beli buku |
| GET | `/transactions` | Pelanggan | Riwayat transaksi |
| GET | `/transactions/:id/status` | Pelanggan | Status transaksi |
| DELETE | `/transactions/:id` | Pelanggan | Batalkan transaksi pending |
| POST | `/transactions/notification` | Midtrans Webhook | Update status pembayaran |

### Lisensi dan Cart

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/licenses/generate/:transaction_id` | Pelanggan | Generate lisensi `.lcpl` |
| GET | `/licenses` | Pelanggan | Daftar lisensi aktif |
| GET | `/licenses/:id/download` | Pelanggan | Ambil data lisensi `.lcpl` (dipakai web reader) |
| POST | `/cart` | Pelanggan | Tambah ke keranjang |
| GET | `/cart` | Pelanggan | Lihat keranjang |
| DELETE | `/cart/:book_id` | Pelanggan | Hapus dari keranjang |
| POST | `/cart/checkout` | Pelanggan | Checkout dan buat transaksi |

### Admin

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/admin/users` | Daftar semua user. Query: `?role=`, `?page=`, `?limit=` |
| DELETE | `/admin/users/:id` | Nonaktifkan akun |
| POST | `/admin/users/:id/reactivate` | Aktifkan kembali akun |
| GET | `/admin/books` | Semua buku. Query: `?page=`, `?limit=` |
| DELETE | `/admin/books/:id` | Hapus buku (soft delete) |
| GET | `/admin/transactions` | Semua transaksi. Query: `?status=`, `?page=`, `?limit=` |
| GET | `/admin/licenses` | Daftar semua lisensi. Query: `?email=`, `?revoked=`, `?book_id=`, `?page=`, `?per_page=` |
| GET | `/admin/licenses/:id` | Detail lisensi (termasuk status dari LSD Server) |
| POST | `/admin/licenses/:id/revoke` | Revoke lisensi via LSD Server |
| POST | `/admin/licenses/:id/reissue` | Reissue lisensi yang sudah di-revoke |

### Content Delivery

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/content/*content_id` | Serve file terenkripsi (`.epub` atau `.lcpdf`) |
| GET | `/covers/:filename` | Serve cover buku |
| GET | `/previews/:bookID/:page` | Serve halaman preview |
| GET | `/lcp-hint` | Passphrase hint page |

---

## Alur Bisnis

### Publisher — Upload Buku

```
Upload file (EPUB atau PDF) + metadata
      |
      v
Backend: simpan ke storage/raw/
Extract cover otomatis:
  - PDF  → MuPDF (mutool) ekstrak halaman pertama sebagai PNG
  - EPUB → parse OPF manifest, salin cover image dari ZIP
      |
      v
Enkripsi LCP berjalan otomatis di background (goroutine):
  - lcpencrypt dipanggil via WSL
  - Output: storage/encrypted/{contentID}.epub atau .lcpdf
  - Book.lcp_content_id di-set di database
  - Preview halaman di-generate otomatis (hingga 10 halaman)
      |
      v
Buku muncul di katalog (lcp_content_id tidak kosong dan is_withdrawn = false)
```

Jika enkripsi gagal atau cover tidak dihasilkan oleh `lcpencrypt`, backend memiliki fallback: `ExtractEPUBCover()` membaca langsung dari ZIP EPUB menggunakan parser OPF Go standar.

### Pelanggan — Beli dan Baca

```
Browse katalog → tambah ke cart
      |
      v
Checkout → Midtrans Snap Payment
      |
      v (webhook Midtrans)
Transaction status: pending → success
      |
      v
Generate lisensi: POST /licenses/generate/:tx_id
Backend request ke LCP Server → terima .lcpl
      |
      v
      +-- Web Reader (browser) ----------------------------+
          Buka /read/{licenseId}
          Download .lcpl via GET /licenses/:id/download
          Download file terenkripsi dari content URL
          Dekripsi AES-256-CBC di browser (aes-js)
          PDF  → PDF.js: scroll, zoom, search, halaman
          EPUB → epub.js: scroll, search, navigasi bab
          +------------------------------------------------+

Web reader saat ini mendukung mode online. Kemampuan baca offline
(service worker + cache lokal) direncanakan sebagai pengembangan lanjutan.
```

### Admin — Manajemen Lisensi

Admin dapat memantau status lisensi secara real-time melalui LSD Server: melihat daftar dan detail lisensi, revoke lisensi yang melanggar ketentuan, serta reissue lisensi yang sudah di-revoke.

---

## Deployment (VPS)

Panduan lengkap tersedia di [`SETUP/VPS_DEPLOYMENT.md`](SETUP/VPS_DEPLOYMENT.md).

Ringkasan langkah:

1. Install Go, Node.js, PostgreSQL, MuPDF di VPS.
2. Build backend: `go build -o itspress-backend`.
3. Buat `.env` dengan URL production.
4. Build frontend: `npm run build` (set env production sebelum build).
5. Jalankan backend dan frontend sebagai service (systemd).
6. Setup LCP Server dan LSD Server (jalankan sebagai service).

---

## Lisensi

Proyek ini dibuat untuk keperluan akademik (Tugas Akhir). Penggunaan ulang harus menyertakan atribusi kepada penulis.
