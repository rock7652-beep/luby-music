# Admin security and Git deployment

## Required Vercel environment variables

Set both values for Production and Preview. The admin endpoint deliberately returns HTTP 503 when either value is missing.

- `ADMIN_PASSWORD_HASH`: `<random-salt>:<64-character-scrypt-hash>`
- `ADMIN_SESSION_SECRET`: a dedicated random value of at least 32 characters

Generate values locally without sending the password to GitHub:

```bash
node -e "const c=require('node:crypto');const p=process.argv[1];const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(p,s,32).toString('hex'))" 'YOUR_PASSWORD'
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Do not reuse `APPS_SCRIPT_TOKEN`, do not commit either value, and do not store a plaintext password in Vercel.

## Git deployment flow

- Production branch: `vercel-production`
- Changes start in a separate branch and a Draft PR.
- Every PR must receive a Vercel Preview deployment.
- Merge only after Preview checks pass.
- Vercel deploys Production from `vercel-production`.
- Keep the preceding Production deployment available for rollback.

## Admin security behavior

- The password is verified only inside the Vercel serverless function.
- The browser receives an HttpOnly, Secure, SameSite=Strict signed cookie.
- Sessions expire after two hours.
- Five failed attempts within 15 minutes return HTTP 429.
- Cross-origin login and logout requests are rejected.
- Missing security configuration fails closed.
