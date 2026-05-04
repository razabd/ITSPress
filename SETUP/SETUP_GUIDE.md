# Panduan Setup LCP Server di WSL

Panduan ini menjelaskan cara menginstal dan menjalankan LCP Server (Readium) di WSL agar dapat bekerja bersama backend CMS ITSPress.

> **Semua perintah di halaman ini dijalankan di terminal WSL (Ubuntu), kecuali disebutkan sebaliknya.**

---

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Windows 10/11 | WSL2 aktif dengan distro Ubuntu |
| Go ≥ 1.21 | Diinstal di dalam WSL |
| Git | Diinstal di dalam WSL |
| Backend CMS ITSPress | Berjalan di `localhost:8081` |

### Cek WSL2 sudah aktif

Jalankan di **PowerShell Windows**:

```powershell
wsl --list --verbose
```

Pastikan ada distro dengan `VERSION 2`. Jika belum ada, install Ubuntu dari Microsoft Store lalu jalankan `wsl --set-default-version 2`.

---

## Langkah 1 — Install Dependensi

```bash
sudo apt-get update
sudo apt-get install -y golang git build-essential apache2-utils
```

Verifikasi Go sudah terinstal:

```bash
go version   # harus menampilkan go1.21 atau lebih baru
```

---

## Langkah 2 — Clone dan Build LCP Server

```bash
cd ~
git clone https://github.com/readium/readium-lcp-server.git
cd readium-lcp-server
```

Build binary yang dibutuhkan:

```bash
go build -o lcpsrv_bin  ./lcpserver
go build -o lsdsrv_bin  ./lsdserver
go build -o lcpencrypt  ./lcpencrypt
```

Verifikasi hasil build:

```bash
ls -la lcpsrv_bin lsdsrv_bin lcpencrypt
```

Ketiga file harus muncul dengan permission executable.

---

## Langkah 3 — Tambahkan lcpencrypt ke PATH

Backend CMS memanggil `lcpencrypt` via `wsl bash -c "lcpencrypt ..."`. Agar bisa ditemukan, tambahkan ke PATH:

```bash
echo 'export PATH="$HOME/readium-lcp-server:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verifikasi
lcpencrypt --help   # harus muncul daftar opsi
```

---

## Langkah 4 — Buat Direktori yang Dibutuhkan

```bash
mkdir -p ~/readium-lcp-server/files/storage
mkdir -p ~/readium-lcp-server/config
mkdir -p ~/readium-lcp-server/db
```

---

## Langkah 5 — Salin Sertifikat TLS

LCP Server membutuhkan sertifikat TLS. Repo ini sudah menyertakan sertifikat uji dari EDRLab yang dapat langsung digunakan untuk keperluan PoC:

```bash
# Ganti /mnt/c/Users/<NamaUser>/... sesuai lokasi repo ITSPress di Windows Anda
REPO_PATH="/mnt/c/Users/<NamaUser>/Documents/Kuliah/Tugas_Akhir/ITSPRESS"

cp "$REPO_PATH/readium-lcp-server-master/test/cert/cert-edrlab-test.pem" \
   ~/readium-lcp-server/config/

cp "$REPO_PATH/readium-lcp-server-master/test/cert/privkey-edrlab-test.pem" \
   ~/readium-lcp-server/config/
```

> Sertifikat ini hanya untuk pengembangan lokal dan tidak boleh digunakan di lingkungan produksi.

---

## Langkah 6 — Buat File Autentikasi

LCP Server membutuhkan file `htpasswd` untuk autentikasi basic. Username dan password ini juga dikonfigurasi di backend CMS.

```bash
# Buat file htpasswd dengan user "admin"
# Anda akan diminta memasukkan password — gunakan: admin123
htpasswd -c ~/readium-lcp-server/config/htpasswd admin
```

Password default yang dikonfigurasi di backend CMS adalah `admin123`. Jika Anda menggunakan password lain, sesuaikan variabel environment `LCP_SERVER_PASSWORD` saat menjalankan backend.

---

## Langkah 7 — Salin dan Edit File Konfigurasi

Salin template konfigurasi dari repo ITSPress:

```bash
REPO_PATH="/mnt/c/Users/<NamaUser>/Documents/Kuliah/Tugas_Akhir/ITSPRESS"

cp "$REPO_PATH/SETUP/lcp-server/config.yaml" \
   ~/readium-lcp-server/config.yaml
```

Buka file dan ganti **semua kemunculan** `YOUR_WSL_USERNAME` dengan username WSL Anda:

```bash
whoami   # tampilkan username WSL Anda

# Edit config.yaml
nano ~/readium-lcp-server/config.yaml
```

Atau lakukan penggantian otomatis:

```bash
WSL_USER=$(whoami)
sed -i "s/YOUR_WSL_USERNAME/$WSL_USER/g" ~/readium-lcp-server/config.yaml
```

Setelah diedit, bagian utama `config.yaml` harus terlihat seperti ini (contoh untuk user `razan`):

```yaml
profile: "basic"

lcp:
  port: 8989
  database: "sqlite3://file:/home/razan/readium-lcp-server/db/lcp.sqlite?cache=shared&mode=rwc"
  auth_file: "/home/razan/readium-lcp-server/config/htpasswd"

storage:
  filesystem:
    directory: "/home/razan/readium-lcp-server/files/storage"

certificate:
  cert: "/home/razan/readium-lcp-server/config/cert-edrlab-test.pem"
  private_key: "/home/razan/readium-lcp-server/config/privkey-edrlab-test.pem"

license:
  links:
    hint: "http://localhost:8081/api/v1/lcp-hint"
    publication: "http://localhost:8081/api/v1/content/{publication_id}"
```

> **Penting:** Field sertifikat yang benar adalah `private_key` (bukan `key`). Kesalahan nama field ini menyebabkan error `Missing private key in the configuration`.

---

## Langkah 8 — Jalankan LCP Server

```bash
cd ~/readium-lcp-server
./lcpsrv_bin -config config.yaml
```

Output yang diharapkan:

```
[GIN-debug] Listening and serving HTTP on :8989
```

**Biarkan terminal ini terbuka.** LCP Server harus tetap berjalan selama menggunakan ITSPress.

---

## Menjalankan Ulang Setelah Restart WSL

LCP Server tidak berjalan otomatis setelah WSL restart. Setiap kali mulai bekerja, jalankan kembali dalam urutan ini:

```bash
# Terminal 1 — WSL: LCP Server
cd ~/readium-lcp-server
./lcpsrv_bin -config config.yaml

# Terminal 2 — Windows: Backend CMS
cd C:\Users\<NamaUser>\Documents\Kuliah\Tugas_Akhir\ITSPRESS\backend-cms
go run main.go

# Terminal 3 — Windows: Frontend (jika diperlukan)
cd C:\Users\<NamaUser>\Documents\Kuliah\Tugas_Akhir\ITSPRESS\frontend
npm run dev
```

### Opsional: Script otomatis

Buat script `start.sh` agar tidak perlu mengetik ulang:

```bash
cat > ~/readium-lcp-server/start.sh << 'EOF'
#!/bin/bash
cd ~/readium-lcp-server
./lcpsrv_bin -config config.yaml
EOF

chmod +x ~/readium-lcp-server/start.sh
```

Lalu cukup jalankan `~/readium-lcp-server/start.sh` setiap memulai sesi.

---

## Troubleshooting

### `Missing private key in the configuration`

Field di `config.yaml` harus `private_key`, bukan `key`.

```yaml
certificate:
  cert: "/home/.../cert-edrlab-test.pem"
  private_key: "/home/.../privkey-edrlab-test.pem"   # ← bukan "key:"
```

---

### `port already in use` saat menjalankan server

```bash
# Cari proses yang menggunakan port 8989
lsof -i :8989

# Hentikan proses tersebut (ganti PID dengan nomor yang muncul)
kill <PID>
```

---

### `lcpencrypt: command not found` saat enkripsi buku

```bash
# Pastikan binary ada
ls ~/readium-lcp-server/lcpencrypt

# Pastikan PATH sudah diset
echo $PATH | grep readium

# Jika belum, tambahkan lagi
export PATH="$HOME/readium-lcp-server:$PATH"
source ~/.bashrc
```

---

### Backend CMS tidak bisa menghubungi LCP Server

**Gejala:** Endpoint `/encrypt` atau `/licenses/generate` mengembalikan error `Tidak dapat menghubungi LCP Server`.

Cek dari terminal WSL:

```bash
curl http://localhost:8989/
```

Jika `connection refused`, LCP Server belum berjalan — jalankan kembali (Langkah 8).

Jika LCP Server berjalan tapi backend tetap error, cek apakah firewall Windows memblokir port WSL:

```powershell
# Di PowerShell Windows
netstat -an | findstr 8989
```

---

### Database LCP Server corrupt atau lisensi error tak terduga

```bash
# Hentikan LCP Server, hapus database, jalankan ulang
cd ~/readium-lcp-server
rm -f db/lcp.sqlite db/lsd.sqlite
./lcpsrv_bin -config config.yaml
```

> **Perhatian:** Menghapus database akan menghapus semua konten dan lisensi yang terdaftar. Semua buku di backend perlu dienkripsi ulang dan semua lisensi pelanggan perlu di-generate ulang.

---

### Thorium Reader: passphrase ditolak

Pastikan passphrase yang dimasukkan **sama persis** (case-sensitive) dengan yang diisi saat registrasi akun pelanggan. Jika lupa, ubah passphrase lewat halaman **Pengaturan** di frontend ITSPress, lalu generate ulang lisensi dari **Dashboard**.
