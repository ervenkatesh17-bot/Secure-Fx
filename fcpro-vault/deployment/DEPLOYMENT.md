# FCPro Vault Production Deployment Guide

This guide describes a production deployment for the FCPro Vault NestJS API,
PostgreSQL, Redis, NGINX TLS proxy, S3 project storage, KMS envelope encryption,
Razorpay webhooks, and signed Electron releases.

## 1. AWS Setup

### Create the KMS key and alias

```bash
aws kms create-key \
  --description "FCPro Vault license envelope encryption key" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS \
  --tags TagKey=app,TagValue=fcpro-vault
```

Capture the returned `KeyId`, then create the alias required by the app:

```bash
aws kms create-alias \
  --alias-name alias/fcp-license-kek \
  --target-key-id <KEY_ID>
```

Enable key rotation:

```bash
aws kms enable-key-rotation --key-id alias/fcp-license-kek
```

### Create the S3 bucket with public access blocked

```bash
export AWS_REGION=ap-south-1
export S3_BUCKET_NAME=fcpro-vault-prod-projects

aws s3api create-bucket \
  --bucket "$S3_BUCKET_NAME" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-public-access-block \
  --bucket "$S3_BUCKET_NAME" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### Enable S3 versioning and default KMS encryption

```bash
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET_NAME" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$S3_BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms",
          "KMSMasterKeyID": "alias/fcp-license-kek"
        },
        "BucketKeyEnabled": true
      }
    ]
  }'
```

### Minimal IAM policy

Attach this policy to the IAM role/user used by the API. Replace the account ID,
region, and bucket name.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KmsEnvelopeEncryption",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:ap-south-1:123456789012:key/<KEY_ID>"
    },
    {
      "Sid": "ProjectObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::fcpro-vault-prod-projects/projects/*"
    }
  ]
}
```

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
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
S3_BUCKET_NAME=fcpro-vault-prod-projects
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
- All database, Redis, AWS, Razorpay, and certificate passwords are
  unique and at least 32 characters.
- S3 bucket has zero public access and no public bucket policies.
- KMS key rotation is enabled.
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
