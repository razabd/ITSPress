# Panduan Deployment ITSPress ke VPS (Docker)

Panduan ini menuntun deployment dari VPS kosong hingga aplikasi berjalan dengan HTTPS. Seluruh komponen (PostgreSQL, backend, frontend, LCP Server, LSD Server, Nginx, Certbot) berjalan sebagai container Docker.

**Asumsi:** VPS Ubuntu 22.04+ dengan akses root, satu domain (contoh di sini ditulis `yourdomain.com`), dan kredensial Midtrans + Gmail App Password sudah tersedia.

---

## Step 0 — Siapkan Domain (DNS)

Di panel pengelola domain, buat A record yang mengarah ke IP VPS:

```
Type: A    Name: @ (atau subdomain, mis. itspress)    Value: IP_VPS_ANDA
```

Tunggu propagasi DNS, lalu verifikasi:

```bash
dig +short yourdomain.com    # harus mengembalikan IP VPS
```

> Midtrans production dan Thorium Reader membutuhkan URL HTTPS yang valid, sehingga domain wajib ada.

---

## Step 1 — Siapkan VPS

```bash
apt update && apt upgrade -y
apt install -y git curl apache2-utils ufw

# Firewall: izinkan SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

---

## Step 2 — Clone Repo

```bash
cd /root
git clone https://github.com/razabd/ITSPress.git itspress
cd itspress

# readium-lcp-server di-gitignore, clone terpisah ke dalam root repo
git clone https://github.com/readium/readium-lcp-server.git
```

---

## Step 3 — Siapkan Kredensial LCP Server

### 3a. File htpasswd

Kredensial ini dipakai backend dan antar-server LCP/LSD. Jangan gunakan karakter `@` di password karena merusak URL autentikasi.

```bash
htpasswd -cb docker/lcp/htpasswd admin PASSWORD_LCP_ANDA
```

### 3b. Sertifikat penandatangan lisensi

Untuk pengembangan/TA gunakan test certificate bawaan Readium. Produksi komersial membutuhkan sertifikat resmi dari EDRLab.

```bash
cp readium-lcp-server/test/cert/cert-edrlab-test.pem docker/lcp/cert.pem
cp readium-lcp-server/test/cert/privkey-edrlab-test.pem docker/lcp/privkey.pem
```

### 3c. Edit config LCP

```bash
sed -i 's/yourdomain.com/DOMAIN_ANDA/g' docker/lcp/config.yaml
nano docker/lcp/config.yaml
# Ganti lsd_notify_auth.password sesuai PASSWORD_LCP_ANDA (Step 3a)
```

---

## Step 4 — Buat `.env`

```bash
cp .env.example .env
nano .env
```

Isi minimal yang wajib diganti:

```env
# Docker Compose
DOMAIN=yourdomain.com
POSTGRES_PASSWORD=password_db_yang_kuat

# Server
GIN_MODE=release
FRONTEND_URL=https://yourdomain.com
BACKEND_PUBLIC_URL=https://yourdomain.com

# JWT — generate: openssl rand -hex 64
JWT_SECRET=hasil_openssl_rand_hex_64

# SMTP (Gmail + App Password)
SMTP_USER=email_anda@gmail.com
SMTP_PASS=app_password_gmail

# Midtrans
MIDTRANS_ENV=sandbox            # ganti "production" jika sudah live
MERCHANT_ID=...
CLIENT_KEY=Mid-client-...
SERVER_KEY=Mid-server-...

# LCP (harus sama dengan htpasswd di Step 3a)
LCP_SERVER_LOGIN=admin
LCP_SERVER_PASSWORD=PASSWORD_LCP_ANDA
LSD_SERVER_LOGIN=admin
LSD_SERVER_PASSWORD=PASSWORD_LCP_ANDA
LCP_PROVIDER=https://yourdomain.com

# Seed akun awal
SEED_ADMIN_EMAIL=admin@yourdomain.com
SEED_ADMIN_PASSWORD=password_admin_kuat
SEED_PUBLISHER_EMAIL=publisher@yourdomain.com
SEED_PUBLISHER_PASSWORD=password_publisher_kuat
```

> `DATABASE_URL`, `LCP_SERVER_URL`, `LSD_SERVER_URL`, dan `LCP_ENCRYPT_BIN` tidak perlu diubah. Docker Compose meng-override nilai tersebut agar mengarah ke container yang sesuai.

---

## Step 5 — Edit Config Nginx

```bash
sed -i 's/yourdomain.com/DOMAIN_ANDA/g' docker/nginx/itspress-http.conf docker/nginx/itspress.conf

# Aktifkan config tahap 1 (HTTP saja, sebelum sertifikat SSL terbit)
cp docker/nginx/itspress-http.conf docker/nginx/active.conf
```

---

## Step 6 — Build dan Jalankan

```bash
docker compose up -d --build
```

Build pertama memakan waktu 10–20 menit (kompilasi Go dan build Next.js). Pantau:

```bash
docker compose ps            # semua service harus "running"
docker compose logs -f backend
```

Tes akses HTTP:

```bash
curl http://yourdomain.com/api/v1/books    # harus mengembalikan JSON
```

---

## Step 7 — Terbitkan Sertifikat SSL

```bash
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com \
  --email email_anda@gmail.com --agree-tos --no-eff-email
```

Setelah sukses, aktifkan config HTTPS dan reload Nginx:

```bash
cp docker/nginx/itspress.conf docker/nginx/active.conf
docker compose exec nginx nginx -s reload
```

Verifikasi: buka `https://yourdomain.com` di browser. Container `certbot` otomatis memperpanjang sertifikat setiap 12 jam pengecekan.

---

## Step 8 — Seed Akun Awal

Membuat akun admin dan publisher sesuai `SEED_*` di `.env`:

```bash
docker compose exec backend /app/itspress-seed
```

---

## Step 9 — Konfigurasi Midtrans

Di [Midtrans Dashboard](https://dashboard.midtrans.com) (sesuaikan sandbox/production):

1. **Settings → Configuration → Payment Notification URL:**
   `https://yourdomain.com/api/v1/transactions/notification`
2. **Settings → Snap Preferences → Finish/Unfinish/Error Redirect URL:**
   `https://yourdomain.com/dashboard`

---

## Step 10 — Uji End-to-End

1. Buka `https://yourdomain.com`, daftar akun pelanggan, cek email verifikasi masuk.
2. Login sebagai publisher (akun seed), upload satu EPUB/PDF, tunggu status terenkripsi dan preview muncul.
3. Login sebagai pelanggan, beli buku via Midtrans (sandbox: kartu tes `4811 1111 1111 1114`).
4. Generate dan unduh `.lcpl`, import ke Thorium Reader, masukkan passphrase, pastikan buku terbuka.
5. Login sebagai admin, revoke lisensi tersebut, lalu pastikan Thorium menolak akses saat sinkronisasi status.

---

## Operasional

### Update aplikasi

```bash
cd /root/itspress
git pull
docker compose up -d --build
```

### Log dan monitoring

```bash
docker compose logs -f backend      # log backend
docker compose logs -f lcpserver    # log LCP server
docker compose ps                   # status semua container
```

### Backup

Data persisten berada di tiga tempat:

```bash
# 1. File e-book (bind mount)
tar czf backup-storage-$(date +%F).tar.gz data/backend-storage

# 2. Database PostgreSQL
docker compose exec postgres pg_dump -U itspress itspress > backup-db-$(date +%F).sql

# 3. Database sqlite LCP/LSD (named volume)
docker run --rm -v itspress_lcp-db:/db -v $(pwd):/backup alpine \
  tar czf /backup/backup-lcpdb-$(date +%F).tar.gz /db
```

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Enkripsi gagal, log `connection refused` ke lcpserver | LCP server belum siap atau htpasswd tidak cocok | Cek `docker compose logs lcpserver`, pastikan `LCP_SERVER_PASSWORD` = password htpasswd |
| URL auth LCP mengandung `@@` | Password LCP mengandung `@` | Ganti password htpasswd tanpa karakter `@`, update `.env`, restart |
| `DATABASE_URL` error dengan password ber-simbol | Karakter `@` dll. di password DB | URL-encode (mis. `@` menjadi `%40`) atau gunakan password alfanumerik |
| Thorium tidak bisa unduh konten | `BACKEND_PUBLIC_URL` / link di `config.yaml` bukan URL publik HTTPS | Pastikan semua link memakai `https://yourdomain.com`, generate ulang lisensi |
| Webhook Midtrans tidak masuk | Notification URL salah atau HTTPS belum aktif | Cek Step 9, tes dengan fitur "Test Notification" di dashboard Midtrans |
| Certbot gagal verifikasi | DNS belum propagasi atau port 80 tertutup | Cek `dig +short yourdomain.com` dan `ufw status` |
| Frontend tidak memuat Snap Midtrans | `CLIENT_KEY` salah saat build | Perbaiki `.env`, lalu `docker compose up -d --build frontend` |

> Catatan: mengganti `DOMAIN` atau `CLIENT_KEY` membutuhkan rebuild frontend karena variabel `NEXT_PUBLIC_*` di-bake saat build image.
