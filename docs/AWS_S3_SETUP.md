# AWS S3 Setup — Client Document Storage (Console Walkthrough)

This is the click-through version of `backend/scripts/aws-setup-wizard.sh` for anyone
who'd rather do it in the AWS Console than the CLI. Same end result: a private bucket,
CORS for direct browser uploads, a cleanup rule for abandoned multipart uploads, and a
narrowly-scoped IAM user for the app to authenticate as.

Where these four values go afterwards is **not** GitHub Secrets — see
[Where the values go](#where-the-values-go) at the bottom before you start; it explains
why and saves you doing this twice.

Takes about 10 minutes. You'll end up with:

```
AWS_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=...
```

---

## 1. Create the bucket

1. Open the S3 console: **https://console.aws.amazon.com/s3/**
2. Click **Create bucket**.
3. **Bucket name** — must be globally unique across *all* AWS accounts, not just
   yours. Something like `manzil-client-docs-<a few random digits>` works well —
   e.g. `manzil-client-docs-8214`.
4. **AWS Region** — pick one close to your users, e.g. `eu-west-2` (London). Write
   this down — it's your `AWS_REGION`.
5. **Object Ownership** — leave as **ACLs disabled** (default).
6. **Block Public Access settings** — leave **all four checkboxes ON** (the
   default). This bucket must never be public; every access goes through a
   short-lived presigned URL the backend generates.
7. **Bucket Versioning** — Disable (default is fine; not needed here).
8. **Default encryption** — leave as **SSE-S3** (Amazon S3 managed keys), the
   default.
9. Click **Create bucket**.

Your `S3_BUCKET_NAME` is exactly the name you chose in step 3.

---

## 2. Allow the browser to upload directly (CORS)

The app uploads files straight from the browser to S3 using presigned URLs — your own
server never touches the file bytes. For that to work across origins, the bucket needs
a CORS policy that also **exposes the `ETag` header**, which the browser must read back
per part when uploading a large file in parallel chunks (skip this and large uploads
will fail silently with no ETag to report back).

1. Open your new bucket → **Permissions** tab.
2. Scroll to **Cross-origin resource sharing (CORS)** → **Edit**.
3. Paste this, replacing/adding origins as needed (keep `http://localhost:5173` for
   local development; add your real production frontend URL once you have one):

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173", "https://dashboard.manzilconsultancy.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

4. **Save changes**.

You can come back and edit this any time you add another environment/domain.

---

## 3. Clean up abandoned uploads automatically

If someone closes the tab mid-upload on a large file, S3 is left holding the parts
already sent. Left alone, those quietly count against your storage. A lifecycle rule
clears them out after a day.

1. Same bucket → **Management** tab → **Create lifecycle rule**.
2. **Lifecycle rule name**: `abort-incomplete-multipart-uploads`.
3. **Choose a rule scope**: **Apply to all objects in the bucket**.
4. Under **Lifecycle rule actions**, check **Delete expired object delete markers or
   incomplete multipart uploads**.
5. It reveals **Number of days**: set to `1`.
6. **Create rule**.

---

## 4. Create a least-privilege IAM policy

The backend should hold a credential that can only touch this one bucket, and only do
exactly what the upload/download/delete flow needs — nothing account-wide.

1. Open IAM: **https://console.aws.amazon.com/iam/**
2. **Policies** (left sidebar) → **Create policy**.
3. Click the **JSON** tab and paste (replace `YOUR-BUCKET-NAME` with the bucket name
   from step 1, twice):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ListBucketOnly",
         "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
       },
       {
         "Sid": "ObjectAndMultipartOps",
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:AbortMultipartUpload",
           "s3:ListMultipartUploadParts"
         ],
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
       }
     ]
   }
   ```

4. **Next**. Name it `manzil-app-s3-policy`. **Create policy**.

---

## 5. Create the app's IAM user + access key

This is a separate, narrow identity — not your own AWS login, and not an
administrator. It's the credential the Node backend authenticates to S3 with.

1. IAM → **Users** → **Create user**.
2. User name: `manzil-app-s3`.
3. **Do not** check "Provide user access to the AWS Management Console" — this user
   only ever needs API access, never a browser login.
4. **Next** → **Attach policies directly** → search `manzil-app-s3-policy` → check it
   → **Next** → **Create user**.
5. Open the user you just created → **Security credentials** tab → **Create access
   key**.
6. Use case: **Application running outside AWS** (or "Command Line Interface (CLI)"
   if that's the only option shown) → acknowledge the note → **Next** → **Create
   access key**.
7. Copy both values shown — **this is the only time the secret is ever shown**:
   - **Access key ID** → this is `AWS_ACCESS_KEY_ID`
   - **Secret access key** → this is `AWS_SECRET_ACCESS_KEY`

If you lose the secret later, you can't recover it — delete that key and create a new
one from the same **Security credentials** tab.

---

## Where the values go

**Not GitHub Secrets.** This app's deployment is deliberately built so application
secrets (database URL, JWT signing keys, and now these AWS keys) *never pass through
GitHub Actions at all* — only the SSH login used to reach the server does. See
`docs/DEPLOYMENT.md` §3.1 for the full reasoning; the four AWS values belong in the
same place every other backend secret already lives:

- **Local development** → `backend/.env` (already has the four keys as empty
  placeholders — just fill them in). This file is gitignored.
- **Production** → the server's persistent `/opt/manzil/shared/backend/.env`
  (symlinked into every release, never overwritten by a deploy — see
  `docs/DEPLOYMENT.md` §1.6, which now includes these four keys too). Edit it once,
  on the server, over SSH:

  ```bash
  ssh deploy@your-server -p <port>
  nano /opt/manzil/shared/backend/.env
  # paste in AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET_NAME
  pm2 reload manzil-backend --update-env
  ```

  (`--update-env` matters — PM2 otherwise keeps the environment it was first started
  with.)

GitHub Actions only ever needs enough to SSH in and rsync the build; it never sees or
needs your AWS credentials.

---

## Free Tier limits

For your account's first 12 months:

- **5 GB** of S3 Standard storage
- **20,000** GET requests / month
- **2,000** PUT/COPY/POST/LIST requests / month

At ~7-10 documents per client, a couple MB each, that's several hundred clients'
worth of storage before you'd approach the 5 GB line. PUT requests (one per file, or
per part on a large multipart upload) are the more likely thing to watch if upload
volume gets heavy. Consider a budget alert: **https://console.aws.amazon.com/billing/home#/budgets**
