# 🚀 Panduan Deployment — Intek Solution

## Status Build

| Komponen | Status |
|---|---|
| Backend TypeScript | ✅ 0 error |
| Frontend Vite Build | ✅ Berhasil (910 kB JS) |
| Backend scripts (build/start) | ✅ Siap |

---

## Prasyarat Server (Linux)

- Node.js >= 18 (rekomendasi: Node 20 LTS)
- PNPM >= 10: `npm install -g pnpm`
- PostgreSQL >= 14
- PM2 (process manager): `npm install -g pm2`
- Nginx (reverse proxy)

---

## Struktur Deployment

```
/var/www/intek/
├── backend/          ← Source backend
│   ├── dist/         ← Hasil build TypeScript
│   ├── prisma/
│   ├── uploads/      ← Buat folder ini manual
│   ├── eng.traineddata
│   ├── ind.traineddata
│   └── .env
└── frontend/
    └── dist/         ← Hasil build Vite → serve via Nginx
```

---

## Langkah 1 — Siapkan Database PostgreSQL

```bash
sudo -u postgres psql
CREATE DATABASE nota_db;
CREATE USER nota_user WITH PASSWORD 'password_anda';
GRANT ALL PRIVILEGES ON DATABASE nota_db TO nota_user;
\q
```

---

## Langkah 2 — Deploy Backend

```bash
cd /var/www/intek/backend

# 1. Install dependencies (otomatis jalankan prisma generate)
pnpm install --prod

# 2. Buat file .env
cp .env.example .env
nano .env
```

Isi `.env` untuk production:
```env
DATABASE_URL="postgresql://nota_user:password_anda@localhost:5432/nota_db"
JWT_SECRET="ganti_dengan_secret_panjang_random_minimal_32_karakter"
PORT=4000
OCR_REQUEST_TIMEOUT_MS=600000

# API Keys OCR
GEMINI_API_KEY_1=your_key
GEMINI_API_KEY_2=your_key
GEMINI_API_KEY_3=your_key
GEMINI_API_KEY_4=your_key
GROQ_API_KEY=your_key
GROQ_API_KEY_2=your_key
MISTRAL_API_KEY=your_key
OPENROUTER_API_KEY=your_key

# Optional: N8N Webhook
N8N_WEBHOOK_URL=
```

```bash
# 3. Jalankan database migrations
pnpm run migrate

# 4. Seed data awal (admin user + kategori)
pnpm run db:seed

# 5. Build TypeScript → dist/
pnpm run build

# 6. Buat folder uploads (untuk backward compat)
mkdir -p uploads

# 7. Start dengan PM2
pm2 start dist/app.js --name "intek-backend"
pm2 save
pm2 startup
```

---

## Langkah 3 — Deploy Frontend

```bash
cd /var/www/intek/frontend

# 1. Buat .env.production
echo 'VITE_API_BASE_URL=/api' > .env.production

# 2. Install dependencies
pnpm install

# 3. Build
pnpm run build

# Hasil build ada di frontend/dist/
```

---

## Langkah 4 — Konfigurasi Nginx

```bash
sudo nano /etc/nginx/sites-available/intek
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Timeout panjang untuk proses OCR (10 menit)
    proxy_read_timeout    600s;
    proxy_send_timeout    600s;
    proxy_connect_timeout 60s;

    # ─── Frontend (React SPA) ────────────────────────────────
    location / {
        root /var/www/intek/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # ─── Backend API ─────────────────────────────────────────
    location /api/ {
        proxy_pass         http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        
        # Timeout panjang untuk OCR AI
        proxy_read_timeout    600s;
        proxy_send_timeout    600s;
        
        # Upload file max 10MB
        client_max_body_size 10m;
    }

    # ─── Static uploads (backward compat) ────────────────────
    location /uploads/ {
        alias /var/www/intek/backend/uploads/;
        expires 30d;
    }
}
```

```bash
# Aktifkan config
sudo ln -s /etc/nginx/sites-available/intek /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### HTTPS dengan Certbot (Opsional tapi sangat dianjurkan)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Langkah 5 — Verifikasi Deployment

```bash
# Cek backend berjalan
curl http://localhost:4000/api/health

# Cek PM2
pm2 status
pm2 logs intek-backend --lines 50
```

---

## Update / Redeploy

```bash
cd /var/www/intek

# Pull kode terbaru
git pull

# Backend
cd backend
pnpm install
pnpm run build
pm2 restart intek-backend

# Frontend
cd ../frontend
pnpm install
pnpm run build
# Nginx langsung serving dari dist/ — tidak perlu restart
```

---

## Catatan Penting

### ⚠️ File Tesseract (OCR Fallback)
File `eng.traineddata` dan `ind.traineddata` di folder `backend/` **wajib ada** di server. Jangan lupa copy saat deployment:
```bash
scp backend/eng.traineddata backend/ind.traineddata user@server:/var/www/intek/backend/
```

### ⚠️ JWT Secret
Gunakan secret yang panjang dan random, bukan default. Generate dengan:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### ⚠️ Database Backup
Backup database secara rutin:
```bash
pg_dump nota_db > backup_$(date +%Y%m%d).sql
```

### 🔍 Monitor Logs
```bash
pm2 logs intek-backend           # Live logs backend
pm2 logs intek-backend --err     # Error saja
sudo tail -f /var/log/nginx/error.log  # Nginx errors
```
