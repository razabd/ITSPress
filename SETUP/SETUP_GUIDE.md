# Panduan Setup LCP Server di WSL

Panduan ini menjelaskan cara menginstal dan menjalankan LCP Server + LSD Server (Readium) di WSL agar dapat bekerja bersama backend CMS ITSPress.

> **Semua perintah di halaman ini dijalankan di terminal WSL (Ubuntu), kecuali disebutkan sebaliknya.**

---

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Windows 10/11 | WSL2 aktif dengan distro Ubuntu |
| Go ≥ 1.25 | Diinstal di dalam WSL |
| Git | Diinstal di dalam WSL |
| OpenSSL | Untuk generate sertifikat LCP mandiri (Langkah 5) |
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
sudo apt-get install -y golang git build-essential apache2-utils openssl
```

Verifikasi Go sudah terinstal:

```bash
go version   # harus menampilkan go1.25 atau lebih baru
```

---

## Langkah 2 — Clone dan Build LCP Server

Clone versi yang dipakai proyek ini ([v1.13.4](https://github.com/readium/readium-lcp-server/releases/tag/v1.13.4)), bukan branch terbaru, agar perilaku LCP/LSD Server konsisten dengan yang sudah diuji:

```bash
cd ~
git clone --branch v1.13.4 --depth 1 https://github.com/readium/readium-lcp-server.git
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

## Langkah 5 — Menyiapkan Sertifikat LCP Mandiri

ITSPress **tidak** menggunakan sertifikat uji EDRLab (`cert-edrlab-test.pem`) — proyek ini menandatangani lisensi dengan hierarki sertifikat X.509 mandiri (Root CA + sertifikat penerbit yang ditandatangani Root CA), sama seperti yang dipakai pada deployment Docker. Perintah lengkap juga didokumentasikan di README repo, bagian **"Generate Sertifikat LCP Mandiri (cert.pem)"**.

Generate di dalam WSL, langsung ke folder config LCP Server:

```bash
cd ~/readium-lcp-server/config

# 1. Root CA (private key RSA 4096-bit + sertifikat self-signed, 10 tahun)
openssl genrsa -out root-ca.key 4096
openssl req -x509 -new -nodes -key root-ca.key -sha256 -days 3650 \
  -subj "/C=ID/O=ITSPress/CN=ITSPress Root CA" \
  -out root-ca.crt

# 2. Sertifikat penerbit, ditandatangani Root CA (3 tahun)
openssl genrsa -out publisher.key 4096
openssl req -new -key publisher.key -sha256 \
  -subj "/C=ID/O=ITSPress/CN=ITSPress LCP Publisher" \
  -out publisher.csr
openssl x509 -req -in publisher.csr -CA root-ca.crt -CAkey root-ca.key \
  -CAcreateserial -sha256 -days 1095 \
  -out publisher.crt

# 3. Susun sebagai cert.pem (sertifikat) + privkey.pem (kunci privat) —
#    dua berkas terpisah, mengikuti struktur config LCP/LSD Server
cp publisher.crt cert.pem
cp publisher.key privkey.pem
```

> **Penting:** `root-ca.key` dan `publisher.key`/`privkey.pem` adalah kunci privat — jangan pernah commit ke repository. Berkas `*.key`, `*.pem`, dan `*.csr` sudah tercakup dalam `.gitignore` proyek ini.

Jika Web Reader di frontend perlu diverifikasi ulang terhadap sertifikat baru ini (misalnya karena Anda generate ulang, bukan memakai sertifikat tim yang sudah ada), ekstrak public key-nya dan sematkan ke frontend — lihat bagian "Generate Sertifikat LCP Mandiri" di README untuk perintahnya.

---

## Langkah 6 — Buat File Autentikasi

LCP Server dan LSD Server membutuhkan file `htpasswd` untuk autentikasi basic. Buat dua entri: satu untuk backend CMS mengakses LCP Server (`admin`), satu untuk LCP Server menotifikasi LSD Server (`readium`) — kredensial ini harus cocok dengan yang dipakai di `config.yaml` (Langkah 7).

```bash
# Entri "admin" — dipakai backend CMS untuk mengakses LCP/LSD Server
# Anda akan diminta memasukkan password — gunakan: admin123
htpasswd -c ~/readium-lcp-server/config/htpasswd admin

# Entri "readium" — dipakai LCP Server untuk menotifikasi LSD Server (lsd_notify_auth)
# Gunakan password: readium123
htpasswd ~/readium-lcp-server/config/htpasswd readium
```

Kredensial `admin` dikonfigurasi di backend CMS lewat variabel environment `LCP_SERVER_LOGIN` / `LCP_SERVER_PASSWORD` dan `LSD_SERVER_LOGIN` / `LSD_SERVER_PASSWORD` pada `.env`. Jika Anda menggunakan password lain dari contoh di atas, sesuaikan nilainya di `.env`.

---

## Langkah 7 — Salin dan Edit File Konfigurasi

Salin template konfigurasi dari repo ITSPress (berkas ini memuat konfigurasi LCP Server **dan** LSD Server sekaligus):

```bash
# Ganti sesuai lokasi repo ITSPress di Windows Anda
REPO_PATH="/mnt/c/Users/<NamaUser>/<path-ke-repo>/ITSPress"

cp "$REPO_PATH/SETUP/config.yaml" ~/readium-lcp-server/config.yaml
```

Template ini masih memuat path contoh `/root/...` dan sertifikat uji EDRLab — sesuaikan dengan `sed` atau edit manual dengan `nano`:

```bash
WSL_USER=$(whoami)

# 1. Ganti path /root/ menjadi home direktori WSL Anda
sed -i "s#/root/#/home/$WSL_USER/#g" ~/readium-lcp-server/config.yaml

# 2. Ganti sertifikat uji EDRLab dengan sertifikat mandiri hasil Langkah 5
sed -i "s/cert-edrlab-test\.pem/cert.pem/g; s/privkey-edrlab-test\.pem/privkey.pem/g" \
  ~/readium-lcp-server/config.yaml
```

Terakhir, buka `nano ~/readium-lcp-server/config.yaml` dan pastikan bagian `lsd_notify_auth` cocok dengan entri `readium` yang dibuat di Langkah 6:

```yaml
lsd_notify_auth:
    username: "readium"
    password: "readium123"
```

Setelah disesuaikan, bagian utama `config.yaml` harus terlihat seperti ini (contoh untuk user `razan`):

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
  cert: "/home/razan/readium-lcp-server/config/cert.pem"
  private_key: "/home/razan/readium-lcp-server/config/privkey.pem"

license:
  links:
    hint: "http://localhost:8081/api/v1/lcp-hint"
    publication: "http://localhost:8081/api/v1/content/{publication_id}"
    status: "http://localhost:8990/licenses/{license_id}/status"

lsd:
  port: 8990
  public_base_url: "http://localhost:8990"
  database: "sqlite3:///home/razan/readium-lcp-server/db/lsd.sqlite?cache=shared&mode=rwc"
  auth_file: "/home/razan/readium-lcp-server/config/htpasswd"
  license_link_url: "http://localhost:8990/{license_id}"

lsd_notify_auth:
  username: "readium"
  password: "readium123"
```

> **Penting:** Field sertifikat yang benar adalah `private_key` (bukan `key`). Kesalahan nama field ini menyebabkan error `Missing private key in the configuration`.

---

## Langkah 8 — Jalankan LCP Server dan LSD Server

Kedua server perlu berjalan bersamaan di dua terminal WSL terpisah — LSD Server dibutuhkan untuk fitur revoke/reissue lisensi di sisi admin.

```bash
# Terminal A — LCP Server
cd ~/readium-lcp-server
./lcpsrv_bin -config config.yaml
```

```bash
# Terminal B — LSD Server
cd ~/readium-lcp-server
./lsdsrv_bin -config config.yaml
```

Output yang diharapkan pada masing-masing terminal:

```
[GIN-debug] Listening and serving HTTP on :8989   # LCP Server
[GIN-debug] Listening and serving HTTP on :8990   # LSD Server
```

**Biarkan kedua terminal ini tetap terbuka.** LCP Server dan LSD Server harus tetap berjalan selama menggunakan ITSPress.

---

## Menjalankan Ulang Setelah Restart WSL

LCP/LSD Server tidak berjalan otomatis setelah WSL restart. Setiap kali mulai bekerja, jalankan kembali dalam urutan ini:

```bash
# Terminal 1 — WSL: LCP Server
cd ~/readium-lcp-server && ./lcpsrv_bin -config config.yaml

# Terminal 2 — WSL: LSD Server
cd ~/readium-lcp-server && ./lsdsrv_bin -config config.yaml

# Terminal 3 — Windows: Backend CMS
cd <path-ke-repo>\ITSPress\backend-cms
go run main.go

# Terminal 4 — Windows: Frontend (jika diperlukan)
cd <path-ke-repo>\ITSPress\frontend
npm run dev
```

### Opsional: Script otomatis

Buat script untuk menjalankan LCP Server dan LSD Server sekaligus di background, agar tidak perlu mengetik ulang setiap sesi:

```bash
cat > ~/readium-lcp-server/start.sh << 'EOF'
#!/bin/bash
cd ~/readium-lcp-server
./lcpsrv_bin -config config.yaml &
./lsdsrv_bin -config config.yaml &
wait
EOF

chmod +x ~/readium-lcp-server/start.sh
```

Lalu cukup jalankan `~/readium-lcp-server/start.sh` setiap memulai sesi (`Ctrl+C` menghentikan keduanya).

---

## Troubleshooting

### `Missing private key in the configuration`

Field di `config.yaml` harus `private_key`, bukan `key`.

```yaml
certificate:
  cert: "/home/.../cert.pem"
  private_key: "/home/.../privkey.pem"   # ← bukan "key:"
```

---

### `port already in use` saat menjalankan server

```bash
# Cari proses yang menggunakan port 8989 (LCP) atau 8990 (LSD)
lsof -i :8989
lsof -i :8990

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

### Admin tidak bisa revoke/reissue lisensi (`Tidak dapat menghubungi LSD Server`)

Pastikan LSD Server juga berjalan (Terminal B pada Langkah 8), bukan hanya LCP Server. Cek dari WSL:

```bash
curl http://localhost:8990/
```

Jika error `unauthorized` saat LCP Server menotifikasi LSD Server, cek kembali bahwa kredensial di `lsd_notify_auth` (`config.yaml`) sama persis dengan entri `readium` pada `htpasswd` (Langkah 6).

---

### Database LCP/LSD Server corrupt atau lisensi error tak terduga

```bash
# Hentikan kedua server, hapus database, jalankan ulang
cd ~/readium-lcp-server
rm -f db/lcp.sqlite db/lsd.sqlite
./lcpsrv_bin -config config.yaml &
./lsdsrv_bin -config config.yaml &
```

> **Perhatian:** Menghapus database akan menghapus semua konten dan lisensi yang terdaftar. Semua buku di backend perlu dienkripsi ulang dan semua lisensi pelanggan perlu di-generate ulang.

---

### Thorium Reader: passphrase ditolak

Pastikan passphrase yang dimasukkan **sama persis** (case-sensitive) dengan yang diisi saat registrasi akun pelanggan. Jika lupa, ubah passphrase lewat halaman **Pengaturan** di frontend ITSPress, lalu generate ulang lisensi dari **Dashboard**.

> Perlu diingat: lisensi yang ditandatangani dengan sertifikat X.509 mandiri (bukan sertifikat resmi EDRLab) hanya terbuka penuh di Web Reader ITSPress. Untuk format PDF, Thorium Reader tetap kompatibel; untuk EPUB, Thorium Reader tidak mengenali rantai kepercayaan sertifikat mandiri ini.
