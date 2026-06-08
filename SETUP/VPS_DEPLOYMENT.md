# Panduan Deployment ITSPress ke VPS

**OS:** Ubuntu (root user)  
**Stack:** Go backend, Next.js frontend, PostgreSQL, Readium LCP Server

---

## Prasyarat (sudah terinstall di Step awal)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx postgresql postgresql-contrib mupdf-tools certbot python3-certbot-nginx curl wget build-essential apache2-utils sqlite3
```

### Install Go 1.22+
```bash
wget https://go.dev/dl/go1.22.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

### Install Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Step 1 — Setup PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER itspress WITH PASSWORD 'PASSWORD_ANDA';"
sudo -u postgres psql -c "CREATE DATABASE itspress OWNER itspress;"
```

> **Perhatian:** Jika password mengandung karakter `@`, gunakan `%40` di `DATABASE_URL`.  
> Contoh: password `abc@123` → `DATABASE_URL=postgres://itspress:abc%40123@localhost:5432/itspress`

---

## Step 2 — Clone Repo

```bash
cd /root
git clone <REPO_URL> itspress
```

---

## Step 3 — Buat `.env`

```bash
cat > /root/itspress/.env << 'EOF'
DATABASE_URL=postgres://itspress:<DB_PASSWORD>@localhost:5432/itspress?sslmode=disable

MERCHANT_ID=<MIDTRANS_MERCHANT_ID>
CLIENT_KEY=<MIDTRANS_CLIENT_KEY>
SERVER_KEY=<MIDTRANS_SERVER_KEY>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<GMAIL_ADDRESS>
SMTP_PASS=<GMAIL_APP_PASSWORD>
FRONTEND_URL=http://<VPS_IP>:3000

JWT_SECRET=<64_CHAR_HEX_RANDOM>

LCP_SERVER_LOGIN=admin
LCP_SERVER_PASSWORD=<LCP_HTPASSWD_PASSWORD>
LSD_SERVER_LOGIN=admin
LSD_SERVER_PASSWORD=<LCP_HTPASSWD_PASSWORD>

BACKEND_PUBLIC_URL=http://<VPS_IP>:8081
LCP_SERVER_URL=http://localhost:8989
LSD_SERVER_URL=http://localhost:8990
LCP_ENCRYPT_BIN=lcpencrypt
LCP_PROVIDER=https://itspress.its.ac.id
EOF
```

> **Penting:** `LCP_SERVER_PASSWORD` harus sama persis dengan password yang digunakan saat `htpasswd`.  
> Jangan gunakan karakter `@` di password LCP Server karena akan merusak URL autentikasi.

---

## Step 4 — Build Frontend

```bash
cat > /root/itspress/frontend/.env.production << 'EOF'
NEXT_PUBLIC_API_URL=http://<VPS_IP>:8081/api/v1
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=<MIDTRANS_CLIENT_KEY>
NEXT_PUBLIC_MIDTRANS_ENV=sandbox
EOF

cd /root/itspress/frontend
npm install
npm run build
```

> **Penting:** `.env.production` harus dibuat **sebelum** `npm run build` karena Next.js mem-bake env var saat build.

---

## Step 5 — Build Backend

```bash
cd /root/itspress/backend-cms
go build -o itspress-backend .
```

---

## Step 6 — Setup LCP Server

```bash
# Clone dan build
cd ~
git clone https://github.com/readium/readium-lcp-server.git
cd readium-lcp-server
go build -o lcpsrv_bin ./lcpserver
go build -o lsdsrv_bin ./lsdserver
go build -o lcpencrypt_bin ./lcpencrypt

# Tambah ke PATH
sudo cp lcpencrypt_bin /usr/local/bin/lcpencrypt

# Buat direktori
sudo mkdir -p /root/itspress/lcp-server/{db,config,files/storage}

# Salin sertifikat test EDRLab
cp test/cert/cert-edrlab-test.pem /root/itspress/lcp-server/config/
cp test/cert/privkey-edrlab-test.pem /root/itspress/lcp-server/config/

# Buat file autentikasi (jangan gunakan karakter @ di password)
htpasswd -cb /root/itspress/lcp-server/config/htpasswd admin PASSWORD_HTPASSWD
```

Buat `config.yaml`:

```bash
cat > ~/readium-lcp-server/config.yaml << 'EOF'
profile: "basic"

lcp:
  host: "<VPS_IP>"
  port: 8989
  database: "sqlite3://file:/root/itspress/lcp-server/db/lcp.sqlite?cache=shared&mode=rwc"
  auth_file: "/root/itspress/lcp-server/config/htpasswd"

storage:
  filesystem:
    directory: "/root/itspress/lcp-server/files/storage"

certificate:
  cert: "/root/itspress/lcp-server/config/cert-edrlab-test.pem"
  private_key: "/root/itspress/lcp-server/config/privkey-edrlab-test.pem"

license:
  links:
    hint: "http://<VPS_IP>:8081/api/v1/lcp-hint"
    publication: "http://<VPS_IP>:8081/api/v1/content/{publication_id}"
    status: "http://<VPS_IP>:8990/licenses/{license_id}/status"

lsd:
  port: 8990
  public_base_url: "http://<VPS_IP>:8990"
  database: "sqlite3:///root/itspress/lcp-server/db/lsd.sqlite?cache=shared&mode=rwc"
  auth_file: "/root/itspress/lcp-server/config/htpasswd"
  license_link_url: "http://<VPS_IP>:8990/{license_id}"

license_status:
  register: true
EOF
```

> **Penting:** File `config.yaml` harus berisi **satu blok saja**. Jangan copy-paste dari `SETUP/config.yaml` yang berisi tiga blok.

---

## Step 7 — Jalankan dengan Systemd (permanen)

```bash
# Backend
cat > /etc/systemd/system/itspress-backend.service << 'EOF'
[Unit]
Description=ITSPress Backend
After=network.target postgresql.service

[Service]
WorkingDirectory=/root/itspress/backend-cms
ExecStart=/root/itspress/backend-cms/itspress-backend
EnvironmentFile=/root/itspress/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# LCP Server
cat > /etc/systemd/system/itspress-lcp.service << 'EOF'
[Unit]
Description=ITSPress LCP Server
After=network.target

[Service]
WorkingDirectory=/root/readium-lcp-server
ExecStart=/root/readium-lcp-server/lcpsrv_bin -config /root/readium-lcp-server/config.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# LSD Server
cat > /etc/systemd/system/itspress-lsd.service << 'EOF'
[Unit]
Description=ITSPress LSD Server
After=network.target itspress-lcp.service

[Service]
WorkingDirectory=/root/readium-lcp-server
ExecStart=/root/readium-lcp-server/lsdsrv_bin -config /root/readium-lcp-server/config.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Frontend
cat > /etc/systemd/system/itspress-frontend.service << 'EOF'
[Unit]
Description=ITSPress Frontend
After=network.target

[Service]
WorkingDirectory=/root/itspress/frontend
ExecStart=/usr/bin/node /root/itspress/frontend/node_modules/.bin/next start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Aktifkan semua
sudo systemctl daemon-reload
sudo systemctl enable itspress-backend itspress-lcp itspress-lsd itspress-frontend
sudo systemctl start itspress-backend itspress-lcp itspress-lsd itspress-frontend
```

---

## Step 8 — Buat Akun Admin

```bash
cd /root/itspress/backend-cms
go run seed_admin.go <ADMIN_EMAIL> <ADMIN_PASSWORD> "Administrator"
```

---

## Akses

| Service | URL |
|---|---|
| Frontend | `http://<VPS_IP>:3000` |
| Backend API | `http://<VPS_IP>:8081` |
| LCP Server | `http://<VPS_IP>:8989` |
| LSD Server | `http://<VPS_IP>:8990` |

---

## Perintah Berguna

```bash
# Cek status semua service
sudo systemctl status itspress-backend itspress-lcp itspress-lsd itspress-frontend

# Lihat log real-time
journalctl -u itspress-backend -f
journalctl -u itspress-lcp -f
journalctl -u itspress-lsd -f
journalctl -u itspress-frontend -f

# Restart service
sudo systemctl restart itspress-backend
sudo systemctl restart itspress-lcp
sudo systemctl restart itspress-lsd
sudo systemctl restart itspress-frontend

# Update kode (setelah git pull)
cd /root/itspress/backend-cms && go build -o itspress-backend . && sudo systemctl restart itspress-backend

# Rebuild frontend (setelah perubahan)
cd /root/itspress/frontend && rm -rf .next && npm run build && sudo systemctl restart itspress-frontend
```

---

## Bug yang Sudah Diperbaiki

| Bug | Penyebab | Fix |
|---|---|---|
| URL lisensi `127.0.0.1` | `contentURL` hardcoded di `book_controller.go` | Ganti dengan env var `BACKEND_PUBLIC_URL` |
| Provider lisensi `localhost` | `provider` hardcoded di `license_controller.go` | Ganti dengan `backendPublicURL()` |
| LCP Server auth URL double `@@` | Password mengandung `@` di URL | Jangan gunakan `@` di `LCP_SERVER_PASSWORD` |
| File enkripsi tidak ditemukan di Linux | Copy step hanya untuk Windows | Tambah copy step untuk Linux |
| Forgot password loading terus | `smtp.SendMail` tidak punya timeout | Tambah timeout 15 detik + kirim async (goroutine) |
| Frontend panggil `localhost:8081` | `NEXT_PUBLIC_API_URL` tidak di-set | Buat `.env.production` sebelum build |
| CORS 403 | `FRONTEND_URL` di `.env` tidak include port | Tambah `:3000` di `FRONTEND_URL` |

---

## Catatan Penting

- **Password dengan karakter spesial** (`@`, `#`, dll): gunakan URL encoding (`%40` untuk `@`) di `DATABASE_URL`, dan **hindari** karakter spesial di `LCP_SERVER_PASSWORD`
- **LCP config.yaml**: harus satu blok saja, jangan pakai file dari `SETUP/config.yaml` yang berisi tiga blok
- **Frontend env**: `.env.production` dibuat di `/root/itspress/frontend/`, bukan di root repo
- **Enkripsi buku** lebih lambat di VPS dibanding laptop karena perbedaan CPU
- **Lisensi lama**: jika URL di `.lcpl` salah, hapus license di DB dan generate ulang — jangan hapus transaksi

---

## Bug Terbuka

Lihat `task_production_bug.md` untuk daftar bug yang belum diselesaikan.
