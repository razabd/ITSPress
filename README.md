# ITSPress — Platform Distribusi E-Book Digital

Platform distribusi e-book berbasis web dengan perlindungan konten DRM menggunakan standar Readium LCP (Licensed Content Protection). Sistem melayani tiga peran pengguna: pelanggan, publisher, dan admin. Proyek ini dikembangkan sebagai Tugas Akhir di Institut Teknologi Sepuluh Nopember.

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Arsitektur](#arsitektur)
- [Struktur Direktori](#struktur-direktori)
- [Menjalankan Secara Lokal (Development)](#menjalankan-secara-lokal-development)
- [Generate Sertifikat LCP Mandiri (cert.pem)](#generate-sertifikat-lcp-mandiri-certpem)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Alur Bisnis](#alur-bisnis)
- [Deployment ke VPS (Docker)](#deployment-ke-vps-docker)

---

## Fitur Utama

### Pelanggan

- Registrasi dan login dengan verifikasi email
- Browse katalog e-book dan preview beberapa halaman sebelum membeli
- Keranjang belanja dan pembayaran melalui Midtrans Snap
- Generate dan unduh lisensi `.lcpl` untuk dibaca di Thorium Reader
- Riwayat pembelian, daftar lisensi aktif, pengaturan passphrase LCP

### Publisher

- Upload e-book (EPUB atau PDF) dengan enkripsi AES-256 otomatis setelah upload
- Preview halaman di-generate otomatis bersamaan dengan proses enkripsi
- Manajemen katalog (withdraw, relist) dan dashboard statistik penjualan

### Admin

- Manajemen pengguna (nonaktifkan, aktifkan kembali)
- Manajemen seluruh katalog buku dan pemantauan transaksi
- Manajemen lisensi: list, detail, revoke, dan reissue melalui LSD Server

---

## Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript | SSR/CSR, port 3000 |
| Backend | Go 1.25, Gin, GORM | REST API, port 8081 |
| Database | PostgreSQL 16 | Koneksi via `DATABASE_URL` |
| DRM | [Readium LCP Server v1.13.4](https://github.com/readium/readium-lcp-server/releases/tag/v1.13.4) + LSD Server | Enkripsi AES-256, port 8989 (LCP) dan 8990 (LSD) |
| Payment | Midtrans Snap API | Pembayaran online |
| Email | SMTP Gmail | Verifikasi email dan reset password |
| Auth | JWT (24 jam) + bcrypt | Bearer token, password hashing |
| Preview | MuPDF (`mutool`) | Render halaman preview dan cover PDF |
| Deployment | Docker Compose + Nginx + Certbot | Full stack dalam container, HTTPS Let's Encrypt |

---

## Arsitektur

Seluruh komponen production berjalan sebagai container Docker di satu VPS. Nginx menjadi satu-satunya pintu masuk publik (port 80/443) dan meneruskan request ke tiga tujuan: frontend Next.js, backend Go, dan LSD Server.

```
                        Internet
                           |
                    Nginx (80/443)
          /            /api/           /lsd/
          |              |               |
   frontend:3000    backend:8081    lsdserver:8990
                         |               |
                    postgres:5432   lcpserver:8989
                         |               |
                  (storage e-book)  (sqlite + storage LCP)
```

Backend memanggil binary `lcpencrypt` (di dalam container backend) untuk mengenkripsi e-book, lalu menotifikasi LCP Server. Lisensi `.lcpl` yang diunduh pelanggan memuat URL publik, sehingga Thorium Reader mengambil konten terenkripsi dan status lisensi melalui Nginx.

---

## Struktur Direktori

```
ITSPress/
|-- backend-cms/
|   |-- config/          # Koneksi database dan migrasi
|   |-- controllers/     # Handler endpoint API
|   |-- middlewares/     # JWT auth, rate limiter, token blacklist
|   |-- models/          # Struct GORM (User, Book, Transaction, License, CartItem)
|   |-- routes/          # Definisi router Gin
|   |-- services/        # Business logic (enkripsi, preview)
|   |-- utils/           # Helper functions
|   |-- seed.go          # Seed akun admin dan publisher (kredensial via env)
|   +-- main.go          # Entry point
|
|-- frontend/
|   +-- src/
|       |-- app/         # Next.js App Router (catalog, dashboard, publisher, admin, cart, ...)
|       |-- components/  # Reusable UI components
|       |-- context/     # React Context (Auth, Cart, Lang)
|       |-- lib/         # Utilities (api, i18n, format, redirect)
|       +-- types/       # TypeScript interfaces
|
|-- docker/
|   |-- backend.Dockerfile    # Build backend Go + lcpencrypt + mutool
|   |-- frontend.Dockerfile   # Build Next.js (output standalone)
|   |-- lcp.Dockerfile        # Build LCP Server + LSD Server dari source
|   |-- lcp/config.yaml       # Config LCP/LSD (template, edit domain)
|   +-- nginx/                # Config Nginx tahap HTTP dan HTTPS
|
|-- readium-lcp-server/       # Clone terpisah v1.13.4 (di-gitignore), dibutuhkan saat build Docker
|
|-- SETUP/
|   +-- VPS_DEPLOYMENT.md     # Panduan deployment VPS berbasis Docker (step by step)
|
|-- docker-compose.yml
|-- .env.example              # Template environment variables
+-- .env                      # Environment variables (tidak di-commit)
```

---

## Menjalankan Secara Lokal (Development)

Pengembangan lokal dilakukan tanpa Docker. Readium LCP hanya bekerja pada Linux, sehingga pengembangan di Windows menjalankan LCP Server, LSD Server, dan `lcpencrypt` melalui WSL. Kode backend memuat cabang khusus Windows/WSL untuk keperluan ini dan cabang tersebut tidak aktif di production Linux.

### 1. Prasyarat

| Kebutuhan | Versi | Keterangan |
|---|---|---|
| Go | >= 1.25 | Backend runtime |
| Node.js | >= 18 | Frontend runtime |
| PostgreSQL | 16 | Database |
| WSL2 (Ubuntu) | - | Hanya untuk development di Windows |
| Readium LCP Server | [v1.13.4](https://github.com/readium/readium-lcp-server/releases/tag/v1.13.4) | Clone dari repo resmi Readium |
| MuPDF (`mutool`) | - | Generate preview dan cover PDF |
| OpenSSL | - | Generate sertifikat LCP mandiri (lihat [bagian berikut](#generate-sertifikat-lcp-mandiri-certpem)) |

### 2. Setup

```bash
git clone <repo-url>
cd ITSPress

# Database
psql -U postgres -c "CREATE DATABASE itspress;"

# Environment
cp .env.example .env    # lalu isi sesuai lingkungan lokal

# Backend
cd backend-cms
go mod tidy
go run main.go          # berjalan di http://localhost:8081

# Seed akun admin dan publisher (opsional, kredensial dari env SEED_*)
go run seed.go

# Frontend (terminal terpisah)
cd frontend
npm install
npm run dev             # berjalan di http://localhost:3000
```

Database di-migrate otomatis saat backend pertama kali dijalankan.

---

## Generate Sertifikat LCP Mandiri (cert.pem)

ITSPress tidak menggunakan sertifikat resmi dari EDRLab sebagai Certificate Authority (yang mensyaratkan biaya lisensi tahunan). Sebagai gantinya, LCP Server ditandatangani menggunakan hierarki sertifikat X.509 mandiri (self-signed) dalam dua tingkat: Root CA dan sertifikat penerbit (publisher) yang ditandatangani oleh Root CA tersebut.

### 1. Generate Root CA

```bash
# Private key Root CA (RSA 4096-bit)
openssl genrsa -out root-ca.key 4096

# Sertifikat Root CA, self-signed, masa berlaku 10 tahun (3650 hari)
openssl req -x509 -new -nodes -key root-ca.key -sha256 -days 3650 \
  -subj "/C=ID/O=ITSPress/CN=ITSPress Root CA" \
  -out root-ca.crt
```

### 2. Generate Sertifikat Penerbit (ditandatangani Root CA)

```bash
# Private key sertifikat penerbit
openssl genrsa -out publisher.key 4096

# Certificate Signing Request (CSR)
openssl req -new -key publisher.key -sha256 \
  -subj "/C=ID/O=ITSPress/CN=ITSPress LCP Publisher" \
  -out publisher.csr

# Tanda tangani CSR dengan Root CA, masa berlaku 3 tahun (1095 hari)
openssl x509 -req -in publisher.csr -CA root-ca.crt -CAkey root-ca.key \
  -CAcreateserial -sha256 -days 1095 \
  -out publisher.crt
```

### 3. Gabungkan Menjadi cert.pem

LCP Server (`config.yaml`) membutuhkan satu berkas `.pem` yang memuat private key dan sertifikat penerbit sekaligus, dipakai untuk menandatangani setiap lisensi `.lcpl` yang diterbitkan:

```bash
cat publisher.key publisher.crt > cert.pem
```

Tempatkan `cert.pem` sesuai path yang dirujuk pada `docker/lcp/config.yaml` (Docker) atau konfigurasi LCP Server lokal di WSL (bagian `certificate`).

### 4. Ekstrak Public Key (SPKI) untuk Frontend

Public key dari sertifikat penerbit perlu disematkan pada kode frontend Web Reader agar dapat memverifikasi tanda tangan lisensi tanpa bergantung pada rantai kepercayaan EDRLab:

```bash
openssl x509 -in publisher.crt -pubkey -noout > publisher-public.pem
```

Salin isi `publisher-public.pem` ke konstanta public key di frontend (Web Reader).

> **Catatan:** `root-ca.key` adalah kunci privat Root CA — simpan secara aman dan jangan pernah di-commit ke repository. Berkas `cert.pem`, `root-ca.key`, `publisher.key`, dan `*.csr` semuanya sudah tercakup dalam pola `.gitignore` proyek ini.

---

## Environment Variables

Template lengkap tersedia di [`.env.example`](.env.example). Ringkasan variabel backend:

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | DSN PostgreSQL. Saat deploy Docker, otomatis di-override ke container postgres |
| `PORT`, `GIN_MODE` | Port backend (default 8081) dan mode Gin (`debug`/`release`) |
| `FRONTEND_URL`, `BACKEND_PUBLIC_URL` | URL publik frontend dan backend. Dipakai untuk CORS, link email, dan link konten di lisensi |
| `JWT_SECRET` | Secret JWT. Generate dengan `openssl rand -hex 64` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP Gmail dengan App Password |
| `MERCHANT_ID`, `CLIENT_KEY`, `SERVER_KEY`, `MIDTRANS_ENV` | Kredensial Midtrans (`sandbox`/`production`) |
| `LCP_SERVER_URL`, `LCP_SERVER_LOGIN`, `LCP_SERVER_PASSWORD` | Alamat dan kredensial LCP Server |
| `LSD_SERVER_URL`, `LSD_SERVER_LOGIN`, `LSD_SERVER_PASSWORD` | Alamat dan kredensial LSD Server |
| `LCP_ENCRYPT_BIN` | Path binary `lcpencrypt`. Di Windows dev bisa berupa `wsl /path/to/lcpencrypt` |
| `LCP_PROVIDER` | URI provider yang tertanam di lisensi LCP |
| `SEED_ADMIN_*`, `SEED_PUBLISHER_*` | Kredensial akun seed (dipakai `go run seed.go`) |
| `DOMAIN`, `POSTGRES_PASSWORD` | Khusus Docker Compose: domain publik dan password database |

Variabel frontend (`frontend/.env.local` saat dev, build args saat Docker):

```env
NEXT_PUBLIC_API_URL=http://localhost:8081/api/v1
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=<Midtrans Client Key>
NEXT_PUBLIC_MIDTRANS_ENV=sandbox
```

Catatan CORS: saat `GIN_MODE=release`, backend hanya menerima request dari `FRONTEND_URL`. Di mode debug, `localhost:3000` dan `localhost:3001` otomatis diizinkan.

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
| POST | `/books` | Publisher | Upload buku baru (enkripsi otomatis) |
| GET | `/books/my` | Publisher | Buku milik publisher |
| GET | `/books/my/stats` | Publisher | Statistik penjualan |
| PUT | `/books/:id` | Publisher | Update metadata |
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
| POST | `/licenses/generate/:transaction_id` | Pelanggan | Generate file `.lcpl` |
| GET | `/licenses` | Pelanggan | Daftar lisensi aktif |
| GET | `/licenses/:id/download` | Pelanggan | Download `.lcpl` |
| POST | `/cart` | Pelanggan | Tambah ke keranjang |
| GET | `/cart` | Pelanggan | Lihat keranjang |
| DELETE | `/cart/:book_id` | Pelanggan | Hapus dari keranjang |
| POST | `/cart/checkout` | Pelanggan | Checkout dan buat transaksi |

### Admin

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/admin/users` | Daftar semua user. Query: `?role=`, `?page=`, `?limit=` |
| DELETE | `/admin/users/:id` | Nonaktifkan akun pelanggan |
| POST | `/admin/users/:id/reactivate` | Aktifkan kembali akun yang dinonaktifkan |
| GET | `/admin/books` | Semua buku. Query: `?page=`, `?limit=` |
| DELETE | `/admin/books/:id` | Hapus buku (soft delete) |
| GET | `/admin/transactions` | Semua transaksi. Query: `?status=`, `?page=`, `?limit=` |
| GET | `/admin/licenses` | Daftar semua lisensi. Query: `?email=`, `?revoked=`, `?book_id=`, `?page=`, `?per_page=` |
| GET | `/admin/licenses/:id` | Detail lisensi (termasuk status dari LSD Server) |
| POST | `/admin/licenses/:id/revoke` | Revoke lisensi via LSD Server |
| POST | `/admin/licenses/:id/reissue` | Reissue lisensi yang sudah di-revoke |

### Content Delivery (untuk Thorium Reader)

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/content/*content_id` | Serve file terenkripsi |
| GET | `/covers/:filename` | Serve cover buku |
| GET | `/previews/:bookID/:page` | Serve halaman preview |
| GET | `/lcp-hint` | Passphrase hint page |

---

## Alur Bisnis

### Publisher: Upload Buku (Enkripsi Otomatis)

```
Upload EPUB/PDF + metadata
      |
      v
Simpan ke storage/raw/
Extract cover otomatis (PDF via MuPDF, EPUB via lcpencrypt)
      |
      v
Enkripsi berjalan otomatis di background (goroutine):
  - lcpencrypt mengenkripsi file dan menotifikasi LCP Server
  - File terenkripsi disimpan ke storage/encrypted/
  - Book.lcp_content_id di-set
  - Preview halaman di-generate otomatis (hingga 10 halaman)
      |
      v
Buku muncul di katalog (lcp_content_id terisi dan is_withdrawn = false)
```

Endpoint `POST /books/:id/encrypt` memicu ulang enkripsi jika proses gagal.

### Pelanggan: Beli dan Baca

```
Browse katalog --> Tambah ke cart
      |
      v
Checkout --> Midtrans Snap Payment
      |
      v (webhook Midtrans)
Transaction status: pending --> success
      |
      v
Generate lisensi: POST /licenses/generate/:tx_id
Backend request ke LCP Server --> terima .lcpl
      |
      v
Download .lcpl --> Import ke Thorium Reader
      |
      v
Thorium fetch konten via GET /content/{id}
Dekripsi dengan passphrase user --> Buku terbuka
```

### Admin: Manajemen Lisensi

Admin memantau status lisensi melalui LSD Server. Fitur yang tersedia meliputi daftar dan detail lisensi, revoke terhadap lisensi yang melanggar ketentuan, serta reissue untuk lisensi yang sudah di-revoke.

---

## Deployment ke VPS (Docker)

Seluruh stack di-deploy sebagai container melalui Docker Compose. Panduan lengkap dari VPS kosong hingga aplikasi berjalan dengan HTTPS tersedia di [`SETUP/VPS_DEPLOYMENT.md`](SETUP/VPS_DEPLOYMENT.md).

Ringkasan langkah:

1. Siapkan VPS (Ubuntu), arahkan DNS domain ke IP VPS, install Docker.
2. Clone repo ini, lalu clone [`readium-lcp-server` v1.13.4](https://github.com/readium/readium-lcp-server/releases/tag/v1.13.4) ke dalam root repo.
3. Siapkan kredensial LCP: file `htpasswd` dan sertifikat penandatangan (`cert.pem`) di `docker/lcp/` — lihat [Generate Sertifikat LCP Mandiri](#generate-sertifikat-lcp-mandiri-certpem) kalau belum punya.
4. Salin `.env.example` ke `.env` dan isi seluruh kredensial production.
5. Ganti `yourdomain.com` di `docker/lcp/config.yaml` dan `docker/nginx/*.conf`.
6. Jalankan `docker compose up -d --build` dengan config Nginx tahap HTTP.
7. Terbitkan sertifikat SSL via certbot, ganti ke config Nginx HTTPS, reload.
8. Jalankan seed akun dan atur webhook Midtrans ke URL production.

---
