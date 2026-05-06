# FCPro Vault Production Deployment Guide

This guide describes a production deployment for the FCPro Vault NestJS API,
PostgreSQL, Redis, NGINX TLS proxy, WD My Cloud WebDAV project storage, local
KEK envelope encryption, Razorpay webhooks, and signed Electron releases.

## 1. WD My Cloud Storage + Local KEK Setup

### Provision the WD My Cloud WebDAV share

1. Put the WD My Cloud device on a private trusted network segment.
2. Enable WebDAV access for a dedicated `fcpro-vault` user.
3. Grant that user read/write access only to the vault share.
4. Prefer HTTPS WebDAV if the NAS firmware supports it; otherwise keep access
   limited to the private LAN/VPN.
5. Confirm the base URL from the API host:

```bash
curl -u "$WD_CLOUD_USERNAME:$WD_CLOUD_PASSWORD" \
  "$WD_CLOUD_URL/fcpro-vault/projects/"
```

### Generate the local Key Encryption Key

The API uses `KEK_MASTER_KEY`, a 64-character hex string representing a 256-bit
Key Encryption Key. Generate it once and store it only in your production secret
manager:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not commit this key, log it, store it in the database, or send it to clients.
Rotate it with a planned re-encryption migration for existing project envelopes.

## 2. Backend Deployment (Railway or Docker)

### Required environment

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Create a production `.env` file or platform secrets with:

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://fcpro_vault:<password>@postgres:5432/fcpro_vault
JWT_SECRET=<64-byte-random-hex>
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<unique-32-char-min-password>
REDIS_TLS=false
KEK_MASTER_KEY=<64-char-hex-key>
WD_CLOUD_URL=http://wdmycloud.local/webdav
WD_CLOUD_USERNAME=<dedicated-webdav-user>
WD_CLOUD_PASSWORD=<unique-32-char-min-password>
RAZORPAY_KEY_ID=<razorpay-key-id>
RAZORPAY_KEY_SECRET=<razorpay-key-secret>
RAZORPAY_WEBHOOK_SECRET=<razorpay-webhook-secret>
IP_BINDING_STRICT=true
CORS_ORIGIN=https://fcprovault.example.com
```

### SSL certificate with Let's Encrypt

Install Certbot on the host and request a certificate:

```bash
sudo certbot certonly --standalone \
  -d api.fcprovault.example.com \
  --email ops@example.com \
  --agree-tos \
  --no-eff-email
```

Mount the resulting `/etc/letsencrypt` directory into NGINX as shown in the
deployment compose file. Renew certificates automatically:

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Docker deployment

From the repository root:

```bash
cd fcpro-vault
docker compose -f deployment/docker-compose.yml --env-file .env up -d
docker compose -f deployment/docker-compose.yml ps
```

Verify health:

```bash
curl -f https://api.fcprovault.example.com/health
```

For a private Railway deployment, use managed PostgreSQL and Redis services,
configure all environment variables as Railway secrets, expose only the API
service, and put NGINX/TLS at the platform edge or in front of the API service.

## 3. Razorpay Webhook Setup

Create a webhook in Razorpay Dashboard:

```text
https://api.fcprovault.example.com/payment/webhook/razorpay
```

Subscribe to these exact events:

```text
payment.captured
subscription.charged
subscription.cancelled
```

Set a strong webhook secret and copy it into `RAZORPAY_WEBHOOK_SECRET`.

## 4. Electron Build + Code Signing

Store signing credentials only in CI/CD secrets.

### macOS signing and notarization

Set:

```bash
CSC_LINK=<base64-or-url-to-macos-cert.p12>
CSC_KEY_PASSWORD=<p12-password>
APPLE_ID=<apple-id-email>
APPLE_APP_SPECIFIC_PASSWORD=<app-specific-password>
TEAM_ID=<apple-team-id>
```

Build:

```bash
cd electron-client
npm ci
npm run package:mac
```

### Windows signing

Set:

```bash
CSC_LINK=<base64-or-url-to-windows-cert.pfx>
CSC_KEY_PASSWORD=<pfx-password>
```

Build:

```bash
cd electron-client
npm ci
npm run package:win
```

## 5. Security Checklist (pre-launch)

- JWT_SECRET uses at least 64 bytes of cryptographic randomness.
- All database, Redis, WD Cloud, Razorpay, and certificate passwords are
  unique and at least 32 characters.
- WD My Cloud WebDAV user is dedicated to FCPro Vault and has no interactive admin privileges.
- `KEK_MASTER_KEY` is generated from 32 bytes of cryptographic randomness and stored only in secrets management.
- PostgreSQL has no external port exposed.
- Redis password is set and Redis is not exposed externally.
- TLS 1.2+ only; TLS 1.0 and TLS 1.1 disabled.
- HSTS preload is enabled.
- `/license/verify` is rate limited at NGINX and Redis guard layers.
- Audit logs are retained for at least 90 days.
- Razorpay webhook signatures are verified before processing.
- Electron app is code-signed for macOS and Windows.

## 6. Monitoring SQL Queries

### Suspicious IPs with many failures in one hour

```sql
SELECT
  "ipAddress",
  COUNT(*) AS failures
FROM audit_logs
WHERE action = 'verify_fail'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY "ipAddress"
HAVING COUNT(*) >= 10
ORDER BY failures DESC;
```

### Device limit hits for license sharing detection

```sql
SELECT
  "licenseId",
  COUNT(*) AS limit_hits,
  MAX("createdAt") AS last_seen
FROM audit_logs
WHERE action = 'device_limit'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY "licenseId"
ORDER BY limit_hits DESC;
```

### Top active licenses

```sql
SELECT
  id,
  email,
  "licenseKey",
  tier,
  "verificationCount",
  "lastVerifiedAt"
FROM licenses
WHERE status = 'active'
ORDER BY "verificationCount" DESC
LIMIT 25;
```
