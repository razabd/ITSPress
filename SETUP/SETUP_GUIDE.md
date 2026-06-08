# Panduan Setup Readium LCP Server (Windows)

Panduan ini menjelaskan cara menyiapkan dan menjalankan LCP Server serta LSD Server di Windows agar dapat bekerja bersama backend CMS ITSPress.

> **Semua perintah di halaman ini dijalankan di PowerShell Windows, kecuali disebutkan sebaliknya.**

---

## Prasyarat

| Kebutuhan | Versi | Keterangan |
|---|---|---|
| Go | >= 1.21 | Diinstal di Windows; verifikasi dengan `go version` |
| Node.js | >= 18 | Untuk menjalankan frontend |
| PostgreSQL | 16 | Database (lokal atau Docker) |
| MuPDF (`mutool`) | — | Hanya diperlukan untuk generate cover PDF; install di WSL: `sudo apt install mupdf-tools` |

> **Catatan:** LCP Server dan LSD Server dikompilasi sebagai binary Windows murni (`CGO_ENABLED=0`, tanpa MinGW/GCC). WSL tidak dibutuhkan untuk menjalankan server.

---

## Langkah 1 — Build Binary (Satu Kali)

Buka PowerShell, lalu masuk ke folder `readium-lcp-server` di dalam repo:

```powershell
cd readium-lcp-server
.\windows-setup.ps1
```

Script ini menjalankan `go mod tidy` lalu mengompilasi tiga binary ke folder `bin\`:

| Binary | Kegunaan |
|---|---|
| `bin\lcpserver.exe` | LCP Server — penerbitan lisensi (port 8989) |
| `bin\lsdserver.exe` | LSD Server — manajemen status lisensi (port 8990) |
| `bin\lcpencrypt.exe` | Tool enkripsi buku, dipanggil backend saat upload |

Build hanya perlu dijalankan sekali. Ulangi hanya jika ada perubahan pada source `readium-lcp-server`.

---

## Langkah 2 — Konfigurasi `run/config.yaml`

File konfigurasi utama ada di `readium-lcp-server\run\config.yaml`. Berikut penjelasan setiap blok:

```yaml
profile: "basic"
```

Profil enkripsi LCP. Gunakan `"basic"` untuk pengembangan.

---

```yaml
lcp:
    port: 8989
    public_base_url: "http://localhost:8989"
    database: "sqlite3://file:run/db/lcp.sqlite?cache=shared&mode=rwc"
    auth_file: "run/htpasswd"
```

- `port` — port LCP Server.
- `public_base_url` — URL publik yang digunakan untuk link di dalam lisensi. Ganti ke URL VPS saat deployment.
- `database` — path SQLite relatif terhadap lokasi binary dijalankan (yaitu folder `readium-lcp-server`).
- `auth_file` — file `htpasswd` berisi username:password yang dipakai backend untuk autentikasi ke LCP Server. Nilai ini harus sama dengan `LCP_SERVER_LOGIN` dan `LCP_SERVER_PASSWORD` di file `.env` backend.

---

```yaml
lsd:
    port: 8990
    public_base_url: "http://localhost:8990"
    database: "sqlite3://file:run/db/lsd.sqlite?cache=shared&mode=rwc"
    auth_file: "run/htpasswd"
    license_link_url: "http://localhost:8989/licenses/{license_id}"
```

- `port` — port LSD Server.
- `public_base_url` — URL publik LSD Server. Ganti saat deployment.
- `license_link_url` — template URL yang digunakan LSD Server untuk merujuk ke data lisensi di LCP Server. Biarkan `{license_id}` apa adanya (ini adalah template, bukan literal).

---

```yaml
lcp_update_auth:
    username: "..."
    password: "..."

lsd_notify_auth:
    username: "..."
    password: "..."
```

Kredensial internal yang digunakan LSD Server untuk memberi tahu LCP Server (dan sebaliknya) saat status lisensi berubah. Nilainya harus cocok dengan entri di `run/htpasswd`.

---

```yaml
certificate:
    cert: "run/cert-itspress.pem"
    private_key: "run/privkey-itspress.pem"
```

Sertifikat TLS yang digunakan untuk menandatangani lisensi LCP. Folder `run\` sudah berisi sertifikat mandiri ITSPress. Untuk pengembangan lokal, tidak perlu diubah.

---

```yaml
license:
    links:
        status: "http://localhost:8990/licenses/{license_id}/status"
        hint: "http://localhost:8989/hint"
```

- `status` — URL yang ditanam di dalam setiap file lisensi `.lcpl` agar web reader dapat memeriksa status lisensi ke LSD Server.
- `hint` — halaman petunjuk passphrase. Backend CMS menyediakan endpoint ini di `/api/v1/lcp-hint`.

---

```yaml
storage:
    filesystem:
        directory: "run/storage"
        url: "http://localhost:8989/files"
```

Direktori penyimpanan file terenkripsi yang dikelola LCP Server. Path relatif terhadap folder `readium-lcp-server`.

---

## Langkah 3 — Konfigurasi Backend `.env`

Pastikan file `.env` di root repo memiliki nilai berikut yang sesuai dengan `run/config.yaml`:

```env
LCP_SERVER_URL=http://localhost:8989
LCP_SERVER_LOGIN=<username di run/htpasswd>
LCP_SERVER_PASSWORD=<password di run/htpasswd>
LCP_ENCRYPT_BIN=../readium-lcp-server/bin/lcpencrypt.exe
LSD_SERVER_URL=http://localhost:8990
LSD_SERVER_LOGIN=<username di run/htpasswd>
LSD_SERVER_PASSWORD=<password di run/htpasswd>
LCP_PROVIDER=https://itspress.its.ac.id
```

`LCP_ENCRYPT_BIN` menentukan path ke binary `lcpencrypt.exe`. Path relatif dihitung dari folder `backend-cms` (tempat backend dijalankan).

---

## Langkah 4 — Jalankan Server

Dari folder `readium-lcp-server`, jalankan:

```powershell
.\run-lcp.ps1
```

Script ini membuka dua window PowerShell terpisah — satu untuk LCP Server (port 8989) dan satu untuk LSD Server (port 8990) — lalu memeriksa apakah LCP Server merespons.

**Kedua window harus tetap terbuka** selama menggunakan ITSPress.

---

## Urutan Menjalankan Seluruh Stack

Setiap kali memulai sesi pengembangan:

```powershell
# 1. Jalankan LCP Server + LSD Server (dari folder readium-lcp-server)
.\run-lcp.ps1

# 2. Jalankan backend (dari folder backend-cms)
go run main.go

# 3. Jalankan frontend (dari folder frontend)
npm run dev
```

---

## Troubleshooting

### `go: command not found` saat menjalankan `windows-setup.ps1`

Go belum terinstal atau belum ada di PATH. Download dari [go.dev/dl](https://go.dev/dl) lalu buka ulang PowerShell.

---

### `port already in use` saat menjalankan server

```powershell
# Temukan proses yang menggunakan port 8989 atau 8990
netstat -ano | findstr :8989
netstat -ano | findstr :8990

# Hentikan proses (ganti PID dengan nomor yang muncul)
taskkill /PID <PID> /F
```

---

### `lcpencrypt: command not found` atau enkripsi buku gagal

Pastikan `LCP_ENCRYPT_BIN` di `.env` menunjuk ke path yang benar:

```env
LCP_ENCRYPT_BIN=../readium-lcp-server/bin/lcpencrypt.exe
```

Verifikasi file ada:

```powershell
Test-Path ..\readium-lcp-server\bin\lcpencrypt.exe
```

---

### Fitur manajemen lisensi admin tidak berfungsi

Pastikan LSD Server (port 8990) berjalan. Cek dari PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:8990/" -UseBasicParsing
```

Jika error, jalankan kembali `run-lcp.ps1`.

---

### Database corrupt atau lisensi error tak terduga

```powershell
# Hentikan kedua server (tutup window PowerShell-nya)
# Hapus file database
Remove-Item readium-lcp-server\run\db\lcp.sqlite -ErrorAction SilentlyContinue
Remove-Item readium-lcp-server\run\db\lsd.sqlite -ErrorAction SilentlyContinue

# Jalankan ulang
cd readium-lcp-server
.\run-lcp.ps1
```

> **Perhatian:** Menghapus database akan menghapus semua konten dan lisensi yang terdaftar. Semua buku di backend perlu dienkripsi ulang dan semua lisensi pelanggan perlu di-generate ulang.

---

### Web reader: passphrase ditolak

Pastikan passphrase yang dimasukkan **sama persis** (case-sensitive) dengan yang diisi saat registrasi akun pelanggan. Jika lupa, ubah passphrase lewat halaman **Pengaturan** di frontend ITSPress, lalu generate ulang lisensi dari **Dashboard**.
