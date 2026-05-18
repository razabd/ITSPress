# ITSPress — Platform Distribusi E-Book Digital

Platform distribusi e-book digital berbasis web dengan perlindungan konten DRM (Digital Rights Management) menggunakan standar **Readium LCP (Licensed Content Protection)**. Dibangun sebagai Tugas Akhir, sistem ini mendukung tiga peran pengguna: **pelanggan**, **publisher**, dan **admin**.

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Struktur Direktori](#struktur-direktori)
- [Prasyarat](#prasyarat)
- [Instalasi & Menjalankan Lokal](#instalasi--menjalankan-lokal)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Alur Bisnis](#alur-bisnis)
- [Deployment (VPS)](#deployment-vps)

---

## Fitur Utama

### Pelanggan
- Registrasi & login dengan verifikasi email
- Browse katalog e-book yang tersedia
- Preview beberapa halaman sebelum membeli
- Keranjang belanja & pembayaran via **Midtrans Snap**
- Generate & download lisensi `.lcpl` untuk dibaca di **Thorium Reader**
- Riwayat pembelian dan daftar lisensi aktif

### Publisher
- Upload e-book (format EPUB / PDF)
- Enkripsi konten dengan standar **AES-256 Readium LCP**
- Manajemen katalog (withdraw / relist)
- Dashboard statistik penjualan

### Admin
- Manajemen pengguna (nonaktifkan / aktifkan kembali)
- Manajemen seluruh katalog buku
- Generate halaman preview untuk buku
- Pantau seluruh transaksi

---

## Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript | SSR/CSR, port 3000 |
| **Backend** | Go 1.25, Gin, GORM | REST API, port 8081 |
| **Database** | PostgreSQL 16 | Via Docker |
| **DRM** | Readium LCP Server | Enkripsi AES-256, port 8989 |
| **Payment** | Midtrans Snap API | Pembayaran online |
| **Email** | SMTP Gmail | Verifikasi email & reset password |
| **Auth** | JWT (24 jam) + bcrypt | Bearer token, password hashing |

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│  Browser / Thorium Reader                                   │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────────────────────┐
│  Frontend  Next.js 16 (port 3000)                           │
│  - React 19 + TypeScript                                    │
│  - Context: Auth, Cart, i18n                                │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API (Bearer JWT)
┌────────────────────▼────────────────────────────────────────┐
│  Backend  Go + Gin (port 8081)                              │
│  - Middleware: JWT Auth, RBAC, Rate Limiter                 │
│  - Controllers: Auth, Book, Transaction, License, Cart      │
│  - GORM → PostgreSQL                                        │
└──────┬──────────────────────────────┬───────────────────────┘
       │                              │
┌──────▼──────┐              ┌────────▼────────┐
│ PostgreSQL  │              │  Readium LCP    │
│ (port 5432) │              │  Server         │
│             │              │  (port 8989,    │
│             │              │   WSL Ubuntu)   │
└─────────────┘              └─────────────────┘
```

**Alur baca e-book (Thorium Reader):**
1. User beli buku → generate lisensi `.lcpl`
2. Thorium import `.lcpl` → fetch konten terenkripsi via `GET /content/{id}`
3. Backend serve file AES-256 dari `storage/encrypted/`
4. Thorium dekripsi menggunakan passphrase user

---

## Struktur Direktori

```
ITSPress/
├── backend-cms/
│   ├── config/          # Konfigurasi database & environment
│   ├── controllers/     # Handler endpoint API
│   ├── middlewares/     # JWT auth, rate limiter, token blacklist
│   ├── models/          # Struct GORM (User, Book, Transaction, License, Cart)
│   ├── routes/          # Definisi router Gin
│   ├── services/        # Business logic (email, LCP, dsb)
│   ├── utils/           # Helper functions
│   ├── seed.go          # Seed data awal (admin default)
│   └── main.go          # Entry point
│
├── frontend/
│   └── src/
│       ├── app/         # Next.js App Router (pages)
│       │   ├── catalog/         # Halaman katalog & detail buku
│       │   ├── dashboard/       # Dashboard pelanggan
│       │   ├── publisher/       # Dashboard publisher
│       │   ├── admin/           # Panel admin
│       │   ├── cart/            # Keranjang belanja
│       │   └── ...              # Auth pages (login, register, verify, dsb)
│       ├── components/  # Reusable UI components
│       ├── context/     # React Context (Auth, Cart, Lang)
│       ├── lib/         # Utilities (api, i18n, format, redirect)
│       └── types/       # TypeScript interfaces
│
├── SETUP/
│   ├── SETUP_GUIDE.md       # Panduan instalasi lokal (WSL + LCP Server)
│   └── VPS_DEPLOYMENT.md    # Panduan deployment ke VPS
│
├── docker-compose.yml       # PostgreSQL container
└── .env                     # Environment variables (tidak di-commit)
```

---

## Prasyarat

| Kebutuhan | Versi | Keterangan |
|---|---|---|
| Go | ≥ 1.21 | Backend runtime |
| Node.js | ≥ 18 | Frontend runtime |
| Docker & Docker Compose | — | Menjalankan PostgreSQL |
| WSL2 (Ubuntu) | — | Menjalankan LCP Server & `lcpencrypt` binary |
| Readium LCP Server | — | Lihat [SETUP_GUIDE.md](SETUP/SETUP_GUIDE.md) |

---

## Instalasi & Menjalankan Lokal

### 1. Clone Repo

```bash
git clone <repo-url>
cd ITSPress
```

### 2. Jalankan PostgreSQL

```bash
docker compose up -d
```

PostgreSQL akan berjalan di `localhost:5432`, database `itspress`.

### 3. Setup LCP Server (WSL)

Ikuti panduan lengkap di [`SETUP/SETUP_GUIDE.md`](SETUP/SETUP_GUIDE.md).  
Pastikan `lcpencrypt` tersedia di PATH dalam environment WSL.

### 4. Konfigurasi Environment

Buat file `.env` di root direktori (lihat bagian [Environment Variables](#environment-variables)).

### 5. Jalankan Backend

```bash
cd backend-cms
go mod tidy
go run main.go
```

Backend berjalan di `http://localhost:8081`.  
Database di-migrate otomatis saat pertama kali dijalankan.  
Seed admin default juga dibuat secara otomatis.

### 6. Jalankan Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # sesuaikan isi file
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

# Midtrans
MERCHANT_ID=<Midtrans Merchant ID>
CLIENT_KEY=<Midtrans Client Key>
SERVER_KEY=<Midtrans Server Key>

# Email (SMTP Gmail dengan App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=<Gmail App Password>

# URL
FRONTEND_URL=http://localhost:3000
BACKEND_PUBLIC_URL=http://127.0.0.1:8081
```

### Frontend — `.env.local`

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

### Buku
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/books` | Public | Katalog buku tersedia |
| GET | `/books/:id` | Public | Detail buku |
| POST | `/books` | Publisher | Upload buku baru |
| GET | `/books/my` | Publisher | Buku milik publisher |
| GET | `/books/my/stats` | Publisher | Statistik penjualan |
| PUT | `/books/:id` | Publisher | Update metadata |
| POST | `/books/:id/encrypt` | Publisher | Enkripsi dengan LCP |
| POST | `/books/:id/withdraw` | Publisher | Tarik dari katalog |
| POST | `/books/:id/relist` | Publisher | Listing ulang |

### Transaksi & Pembayaran
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/transactions` | Pelanggan | Beli buku |
| GET | `/transactions` | Pelanggan | Riwayat transaksi |
| GET | `/transactions/:id/status` | Pelanggan | Status transaksi |
| DELETE | `/transactions/:id` | Pelanggan | Batalkan transaksi pending |
| POST | `/transactions/notification` | Midtrans Webhook | Update status pembayaran |

### Lisensi & Cart
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/licenses/generate/:tx_id` | Pelanggan | Generate file `.lcpl` |
| GET | `/licenses` | Pelanggan | Daftar lisensi aktif |
| GET | `/licenses/:id/download` | Pelanggan | Download `.lcpl` |
| POST | `/cart` | Pelanggan | Tambah ke keranjang |
| GET | `/cart` | Pelanggan | Lihat keranjang |
| DELETE | `/cart/:book_id` | Pelanggan | Hapus dari keranjang |
| POST | `/cart/checkout` | Pelanggan | Checkout & buat transaksi |

### Admin
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/admin/users` | Daftar semua user |
| DELETE | `/admin/users/:id` | Nonaktifkan user |
| POST | `/admin/users/:id/reactivate` | Aktifkan kembali user |
| GET | `/admin/books` | Semua buku |
| DELETE | `/admin/books/:id` | Hapus buku |
| POST | `/admin/books/:id/generate-preview` | Generate preview halaman |
| GET | `/admin/transactions` | Semua transaksi |

### Content Delivery (untuk Thorium Reader)
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/content/*content_id` | Serve file terenkripsi |
| GET | `/covers/:filename` | Serve cover buku |
| GET | `/previews/:bookID/:page` | Serve halaman preview |
| GET | `/lcp-hint` | Passphrase hint page |

---

## Alur Bisnis

### Publisher — Upload & Enkripsi Buku

```
Upload EPUB/PDF
      │
      ▼
Simpan ke storage/raw/ + Extract cover (PDF → mutool)
      │
      ▼
Trigger enkripsi: POST /books/:id/encrypt
      │
      ▼
Backend exec: wsl bash -c "lcpencrypt ..."
      │
      ▼
File terenkripsi → storage/encrypted/
Book.lcp_content_id di-set → Buku siap dijual
```

### Pelanggan — Beli & Baca

```
Browse katalog → Tambah ke cart
      │
      ▼
Checkout → Midtrans Snap Payment
      │
      ▼ (webhook Midtrans)
Transaction status: pending → success
      │
      ▼
Generate lisensi: POST /licenses/generate/:tx_id
Backend request ke LCP Server → terima .lcpl
      │
      ▼
Download .lcpl → Import ke Thorium Reader
      │
      ▼
Thorium fetch konten via GET /content/{id}
Dekripsi dengan passphrase user → Buku terbuka
```

---

## Deployment (VPS)

Panduan lengkap tersedia di [`SETUP/VPS_DEPLOYMENT.md`](SETUP/VPS_DEPLOYMENT.md).

**Ringkasan langkah:**

1. Install Go, Node.js, PostgreSQL di VPS
2. Build backend: `go build -o itspress-backend`
3. Buat `.env` dengan URL production
4. Build frontend: `npm run build` (env production harus di-set sebelum build)
5. Jalankan backend & frontend sebagai service (systemd)
6. Setup LCP Server (opsional, jika VPS support)

---

## Lisensi

Proyek ini dibuat untuk keperluan akademik (Tugas Akhir). Penggunaan ulang harus menyertakan atribusi kepada penulis.
