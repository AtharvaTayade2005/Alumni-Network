# Production Backend Deployment Guide

This guide covers deploying the **Alumni Network Portal** backend to a production environment.

---

## 1. Prerequisites & Topology

- **Runtime**: Node.js >= 20.x LTS
- **Database**: PostgreSQL 15+ (with `pg_trgm` extension enabled)
- **Object Storage**: S3-compatible bucket (AWS S3, MinIO, or Cloudflare R2)
- **Reverse Proxy**: NGINX / Caddy with HTTPS & WebSocket support
- **Process Manager**: PM2, Systemd, or Container (Docker / Kubernetes)

```text
               Internet (HTTPS / WSS)
                         │
                         ▼
             [ Reverse Proxy (NGINX / Caddy) ]
             ├── /api        ─▶ Express REST API (Port 5000)
             ├── /socket.io  ─▶ Socket.IO Engine
             └── /           ─▶ Static Client Assets (SPA)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ PostgreSQL Database ]         [ S3 Object Storage ]
 (Migrations 001 - 014)           (Resumes & Photos)
```

---

## 2. Environment Variables

Create `.env` in the server root:

```env
# Application
NODE_ENV=production
PORT=5000
CLIENT_URL=https://alumni.yourdomain.edu
SERVER_URL=https://api-alumni.yourdomain.edu

# Database
DATABASE_URL=postgres://alumni_admin:StrongPassword@postgres-host:5432/alumni_network?sslmode=require
DB_SSL=true
DB_POOL_MAX=20

# Authentication (Minimum 32 random characters each)
JWT_SECRET=production_access_token_secret_random_64_characters
JWT_REFRESH_SECRET=production_refresh_token_secret_random_64_characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=alumni-network-portal
BCRYPT_ROUNDS=12

# File Storage (S3 / Local)
STORAGE_DRIVER=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=alumni-portal-uploads-prod
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
UPLOAD_MAX_BYTES=5242880

# Email (Transactional SMTP)
MAIL_DRIVER=smtp
MAIL_FROM_EMAIL=no-reply@alumni.yourdomain.edu
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@alumni.yourdomain.edu
SMTP_PASSWORD=...

# Stripe Payment Integration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 3. Database Initialization & Migrations

Run database migrations to apply the complete schema (Migrations 001 through 014):

```bash
# Verify connection and migration status
npm run migrate:status

# Execute all sequential migrations
npm run migrate

# (Optional) Verify migration rollback and index constraints
npm run verify:migrations
```

---

## 4. Reverse Proxy Configuration (NGINX Example)

```nginx
server {
    listen 443 ssl http2;
    server_name alumni.yourdomain.edu;

    ssl_certificate /etc/letsencrypt/live/alumni.yourdomain.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/alumni.yourdomain.edu/privkey.pem;

    # REST API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }

    # Socket.IO WebSocket Proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Frontend Single Page App
    location / {
        root /var/www/alumni-client/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 5. Process Management (PM2)

```bash
# Start cluster mode
pm2 start server.js --name "alumni-api" -i max --env production

# Enable automatic reboot restart
pm2 startup
pm2 save
```

---

## 6. Health & Monitoring

- **Liveness & Readiness**: `GET /api/health`
- **Expected response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2026-10-06T18:00:00.000Z"
  }
}
```
