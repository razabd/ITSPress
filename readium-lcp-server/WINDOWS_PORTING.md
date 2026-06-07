# Porting Readium LCP Server ke Windows Native

Dokumen ini merangkum seluruh perubahan yang dilakukan agar `readium-lcp-server` dapat di-build dan dijalankan secara native di Windows **tanpa WSL, tanpa GCC/MinGW, dan tanpa `libmupdf.dll`**.

---

## Ringkasan Masalah

| # | Masalah | Penyebab |
|---|---|---|
| 1 | `go-sqlite3` tidak bisa dicompile di Windows tanpa GCC | Dependency CGO |
| 2 | `syscall.SIGQUIT` tidak ada di Windows | Signal Unix-only |
| 3 | `libmupdf.dll` tidak ditemukan saat server start | `go-fitz` load DLL di `init()` meski tidak dipakai |
| 4 | Driver `"sqlite3"` tidak dikenali | `glebarez/sqlite` mendaftarkan driver sebagai `"sqlite"` |

---

## Perubahan 1 — Ganti SQLite Driver (CGO → Pure Go)

**Masalah:** `github.com/mattn/go-sqlite3` membutuhkan CGO dan GCC untuk dikompilasi di Windows.

**Solusi:** Ganti dengan `github.com/glebarez/sqlite` — implementasi SQLite pure Go yang tidak membutuhkan C compiler.

### File: `go.mod`

```diff
- github.com/mattn/go-sqlite3 v1.14.32
+ github.com/glebarez/sqlite v1.11.0
```

### File: `lcpserver/lcpserver.go`, `lsdserver/lsdserver.go`, `frontend/frontend.go`

```diff
- _ "github.com/mattn/go-sqlite3"
+ _ "github.com/glebarez/sqlite"
```

---

## Perubahan 2 — Fix Driver Name Mismatch

**Masalah:** `glebarez/sqlite` mendaftarkan dirinya dengan nama driver `"sqlite"`, bukan `"sqlite3"`. Semua kode yang melakukan `sql.Open("sqlite3", ...)` atau `if driver == "sqlite3"` akan gagal.

**Solusi:** Tambahkan mapping di `GetDatabase()` dan update semua pengecekan string driver.

### File: `config/config.go`

Fungsi `GetDatabase()` sekarang memetakan `"sqlite3"` ke `"sqlite"` secara otomatis, sehingga URI di `config.yaml` tidak perlu diubah.

```go
func GetDatabase(uri string) (string, string) {
    if uri == "" {
        uri = "sqlite3://:memory:"
    }
    parts := strings.Split(uri, "://")
    driver := parts[0]

    // glebarez/sqlite registers the driver as "sqlite", not "sqlite3"
    if driver == "sqlite3" {
        driver = "sqlite"
    }
    if driver == "postgres" {
        return driver, uri
    }
    return driver, parts[1]
}
```

### File-file yang diupdate (pengecekan `driver == "sqlite3"` → `driver == "sqlite"`)

| File |
|---|
| `lcpserver/lcpserver.go` |
| `lsdserver/lsdserver.go` |
| `frontend/frontend.go` |
| `index/index.go` |
| `license/store.go` |
| `license_statuses/license_statuses.go` |
| `transactions/transactions.go` |
| `frontend/webuser/webuser.go` |
| `frontend/weblicense/weblicense.go` |
| `frontend/webpublication/webpublication.go` |
| `frontend/webpurchase/webpurchase.go` |

---

## Perubahan 3 — Fix `syscall.SIGQUIT` (Unix-only)

**Masalah:** `syscall.SIGQUIT` tidak terdefinisi di Windows. Ketiga binary server menggunakan signal ini untuk mencetak goroutine stack trace saat debugging. Kode ini ada di `HandleSignals()` pada masing-masing file main.

**Solusi:** Pisahkan `HandleSignals()` ke file platform-specific menggunakan Go build tags.

### File yang dihapus fungsinya

`HandleSignals()` dihapus dari:
- `lcpserver/lcpserver.go`
- `lsdserver/lsdserver.go`
- `frontend/frontend.go`

Import `"syscall"`, `"runtime"`, dan `"os/signal"` juga dihapus dari ketiga file tersebut (dipindah ke file platform-specific).

### File baru yang dibuat (6 file)

**`lcpserver/signals_unix.go`** dan **`lsdserver/signals_unix.go`** dan **`frontend/signals_unix.go`**
```go
//go:build !windows
// SIGQUIT + SIGINT + SIGTERM (full support, Linux/macOS)
```

**`lcpserver/signals_windows.go`** dan **`lsdserver/signals_windows.go`** dan **`frontend/signals_windows.go`**
```go
//go:build windows
// SIGINT + SIGTERM saja (tanpa SIGQUIT yang tidak ada di Windows)
```

Pada build Windows, Go otomatis memilih file `signals_windows.go` dan mengabaikan `signals_unix.go`.

---

## Perubahan 4 — Isolasi Dependency `go-fitz` / `libmupdf`

**Masalah:** `go-fitz` memanggil `loadLibrary("libmupdf.dll")` di dalam fungsi `init()` — fungsi yang dijalankan Go secara otomatis saat program start. Meskipun `lcpserver` dan `lsdserver` tidak pernah memanggil fungsi PDF processing, mereka tetap crash karena import chain:

```
lcpserver → pack → rwppackage.go → go-fitz (init() → panic)
```

**Solusi:** Pisahkan kode yang bergantung pada `go-fitz` ke file terpisah menggunakan build tag `nofitz`. Saat build dengan `-tags nofitz`, Go memilih file stub yang tidak mengimport `go-fitz` sama sekali, sehingga `init()` tidak pernah dipanggil.

### File: `pack/rwppackage.go`

- Dihapus: import `"github.com/gen2brain/go-fitz"`, `"image"`, `"image/jpeg"`, `"time"`
- Dihapus: fungsi `extractRWPInfo()` dan `renderPreview()`
- Dipindahkan ke file build-tag terpisah

### File baru: `pack/pdf_fitz.go`

```go
//go:build !nofitz
// Implementasi penuh: ekstrak metadata PDF dan cover image menggunakan go-fitz
```

Berisi `extractRWPInfo()` dan `renderPreview()` dengan import `go-fitz` aktif. Digunakan pada build Linux/macOS atau jika DLL tersedia.

### File baru: `pack/pdf_nofitz.go`

```go
//go:build nofitz
// Stub: ekstraksi metadata dilewati, enkripsi PDF tetap berfungsi normal
func extractRWPInfo(inputPath, coverPath string) (RWPInfo, error) {
    return RWPInfo{}, nil
}
```

Tidak mengimport `go-fitz` sama sekali. Digunakan pada Windows native build.

**Tradeoff:** Saat enkripsi PDF dengan `lcpencrypt -tags nofitz`, metadata (judul, pengarang) dan cover image tidak diekstrak otomatis dari file PDF. Enkripsi konten PDF tetap berjalan sempurna.

---

## File Runtime Baru

### Folder `run/`

Dibuat di dalam `readium-lcp-server/` sebagai tempat file konfigurasi dan data runtime, terpisah dari source code Go di folder `config/`.

```
readium-lcp-server/
└── run/
    ├── config.yaml               ← konfigurasi server
    ├── htpasswd                  ← file autentikasi (copy dari authentication/)
    ├── cert-edrlab-test.pem      ← test certificate (copy dari test/cert/)
    ├── privkey-edrlab-test.pem   ← test private key (copy dari test/cert/)
    ├── db/                       ← SQLite database (dibuat otomatis)
    └── storage/                  ← file epub/pdf terenkripsi
```

### `run/config.yaml`

Konfigurasi minimal untuk menjalankan LCP Server (port 8989) dan LSD Server (port 8990) menggunakan SQLite dan test certificate bawaan repo.

---

## Script Build dan Run

### `windows-setup.ps1`

Script satu kali untuk update dependency dan build semua binary. Menggunakan flag `-tags nofitz` agar tidak ada ketergantungan DLL.

```powershell
go mod tidy
go build -tags nofitz -o bin\lcpserver.exe .\lcpserver
go build -tags nofitz -o bin\lsdserver.exe .\lsdserver
go build -tags nofitz -o bin\lcpencrypt.exe .\lcpencrypt
```

Cara menjalankan:
```powershell
powershell -ExecutionPolicy Bypass -File .\windows-setup.ps1
```

### `run-lcp.ps1`

Script untuk menjalankan server setiap hari. Membuka dua window PowerShell terpisah untuk LCP Server dan LSD Server, lalu melakukan health check otomatis ke `/ping`.

```powershell
powershell -ExecutionPolicy Bypass -File .\run-lcp.ps1
```

---

## Persyaratan Build Windows

| Kebutuhan | Status |
|---|---|
| Go 1.21+ | Wajib |
| GCC / MinGW | Tidak diperlukan |
| `libmupdf.dll` | Tidak diperlukan |
| WSL | Tidak diperlukan |
| `CGO_ENABLED=0` | Disarankan (set di script) |

---

## Kompatibilitas Lintas Platform

Semua perubahan bersifat backward-compatible. Build di Linux atau macOS tetap menghasilkan binary yang identik dengan sebelumnya:

- Tanpa `-tags nofitz`: `pdf_fitz.go` aktif, metadata PDF diekstrak penuh via `go-fitz`
- Dengan `-tags nofitz` (Windows default): `pdf_nofitz.go` aktif, tanpa DLL dependency

Test file (`*_test.go`) yang masih mengimport `mattn/go-sqlite3` dibiarkan apa adanya karena tidak mempengaruhi build binary production.
