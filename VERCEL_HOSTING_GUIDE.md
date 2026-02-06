# Vercel Hosting Guide & Fixes

## 🚨 Critical Fix for "Redirect to Localhost"

The issue where visiting `betterimdb.vercel.app` redirects you to `localhost:3000` is caused by **Environment Variables** configuration in Vercel.

### Step 1: Update Vercel Environment Variables
Go to your project settings on [Vercel](https://vercel.com) > **Settings** > **Environment Variables**.

1.  **Find `AUTH_URL`**:
    *   If it is set to `http://localhost:3000`, **DELETE IT**.
    *   NextAuth v5 on Vercel automatically detects the correct URL. You do not need this variable in production usually.
    *   *Alternative*: Set it strictly to `https://betterimdb.vercel.app`.

2.  **Find `NEXT_PUBLIC_APP_URL`**:
    *   Update it to: `https://betterimdb.vercel.app`
    *   (Currently, it's likely forcing the client to think it's on localhost).

3.  **Generate `AUTH_SECRET`**:
    *   Ensure you have a random string for `AUTH_SECRET`. You can generate one with `openssl rand -base64 32` or just type a long random string.

### Step 2: Update GitHub OAuth App
Your login will fail if GitHub keeps redirecting to localhost after authentication.

1.  Go to **GitHub Developer Settings** > **OAuth Apps** > Select your App.
2.  Update **Homepage URL** to: `https://betterimdb.vercel.app`
3.  Update **Authorization callback URL** to: `https://betterimdb.vercel.app/api/auth/callback/github`

---

## ⚠️ Important Warning: Database on Vercel

Your project currently uses **SQLite (`better-imdb.db`)** which stores data in a local file.

**Vercel is Serverless.** This means:
*   The filesystem is **ephemeral** (temporary).
*   Any account you create or list you make will **disappear** when the server sleeps or you redeploy.
*   **Recommendation:** For a real deployment, you must switch to a persistent database provider like **Turso (LibSQL)**, **Vercel Postgres**, or **Supabase**.

If you just want to preview the UI, the current setup works, but data will reset frequently.

---

## checklist for Vercel Deployment

- [ ] `GITHUB_TOKEN` is set in Vercel (for AI features).
- [ ] `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are set in Vercel.
- [ ] `AUTH_URL` is REMOVED or set to the production URL.
- [ ] GitHub OAuth App settings are updated.
