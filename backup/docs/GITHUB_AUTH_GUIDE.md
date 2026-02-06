# GitHub Token Authentication Guide

After bundling Copilot API into the main app, we've added **two easy ways** to get a GitHub token without manually creating Personal Access Tokens!

## 🆕 Two Authentication Methods

### Method 1: CLI Command (Easiest)

No UI needed - authenticate directly from terminal:

```bash
npm run auth
```

**What happens:**
1. ✅ Terminal shows a GitHub authentication code
2. ✅ Browser opens GitHub verification page
3. ✅ You enter the code and authorize
4. ✅ App automatically saves token to `.env`
5. ✅ Start coding!

**Example output:**
```
🔐 GitHub Device Code Authentication
=====================================

📱 Requesting device code from GitHub...

✅ Got device code! Your authentication code is:

   ABCD-1234

📖 Instructions:
   1. Open your browser and go to: https://github.com/login/device
   2. Paste the code above when prompted
   3. Authorize the application

⏱️  This code expires in 900 seconds

🌐 Opening browser...

⏳ Waiting for authorization...............

✅ Authorization successful!

👤 Authenticated as: yourname

💾 Saving token to .env file...
✅ Token saved to .env file

✨ Setup complete!

Next steps:
1. Restart your dev server: npm run dev
2. Go to http://localhost:3000/ai and chat with Orb!
```

### Method 2: Browser UI Authentication

Visit the AI page without a token and get an in-app modal:

**Flow:**
1. Go to `http://localhost:3000/ai`
2. See: "GitHub Authentication" modal
3. Click "Open GitHub Authorization"
4. Enter the code shown in modal
5. ✅ Automatically logged in

**Modal features:**
- 🎨 Beautiful dark theme
- 📖 Step-by-step instructions
- 🔄 Real-time polling
- ✅ Shows your GitHub profile
- 🍪 Stores token in cookies

---

## 🔄 How It Works (Device Code Flow)

Both methods use **OAuth Device Code Grant** - no Personal Access Token needed!

```
1. Request Phase
   Your app → GitHub API → Get "device code" & "user code"

2. Authorization Phase
   You → GitHub website → Enter user code → Authorize app

3. Token Exchange Phase
   Your app ← Polls GitHub ← Detects authorization → Get access token

4. Storage Phase
   Save token → .env file (CLI) or cookies (Browser)
```

**Benefits:**
- ✅ No token creation needed
- ✅ Safe - only scope is `copilot`
- ✅ Works for everyone
- ✅ Can be revoked anytime

---

## 📋 Method Comparison

| Feature | CLI (`npm run auth`) | Browser Modal |
|---------|---|---|
| **Setup Time** | 2 minutes | 2 minutes |
| **Requires Token** | ❌ No | ❌ No |
| **Uses Browser** | ✅ Yes | ✅ Yes |
| **Stores Token** | `.env` file | Cookies + `.env` |
| **Best For** | First-time setup | Lost token recovery |
| **Integration** | Manual restart | Auto-reload |

---

## 🚀 Quick Start

### New User Setup

```bash
# 1. Clone and install
git clone ...
npm install

# 2. Authenticate
npm run auth

# 3. Start developing
npm run dev

# 4. Go to http://localhost:3000/ai
```

### Lost or Revoked Token

**Option A: CLI**
```bash
npm run auth
# Follow prompts, token is saved to .env
npm run dev
```

**Option B: Browser**
1. Go to http://localhost:3000/ai
2. Click "Authenticate with GitHub" button
3. Complete auth flow in modal
4. Page auto-reloads with new token

---

## 🔒 Security Details

### Token Storage

**CLI (`npm run auth`):**
- Saved to `.env` file
- Same as manual token entry
- ⚠️ **Never commit to git** - already in `.gitignore`

**Browser Modal:**
- Stored in **httpOnly cookies** (JavaScript can't access)
- Secure flag enabled (HTTPS only in production)
- Same-site strict (CSRF protection)
- 1-year expiration

**Both methods:**
- Token scope is **`copilot` only** (no user/repo access)
- Can be revoked anytime at https://github.com/settings/applications
- Valid for 1 year

### What Scopes Are Requested?

```
scope: copilot
```

That's it! Only needed for:
- Fetching Copilot token
- Verifying user identity

No access to:
- ❌ Code/repos
- ❌ User email
- ❌ Personal data

---

## 🐛 Troubleshooting

### "Authorization timeout"

**Cause:** Haven't completed GitHub authorization

**Fix:**
1. Check browser - is GitHub tab open?
2. Did you enter the code correctly?
3. Try `npm run auth` again

### "Failed to get device code"

**Cause:** Network issue or GitHub API down

**Fix:**
```bash
# Check GitHub status
curl -s https://api.github.com

# Try again
npm run auth
```

### "Token not found" on /ai page

**Cause:** CLI auth didn't restart the server

**Fix:**
```bash
# Kill the server (Ctrl+C)
# Then restart
npm run dev
```

### "Token expired" during chat

**Cause:** Token is old (shouldn't happen)

**Fix:**
```bash
# Get a new token
npm run auth

# Or use browser modal at /ai
```

---

## 📚 API Details (For Developers)

### Request Device Code

```javascript
POST /api/auth/github-device
{
  "action": "request-code"
}

Response:
{
  "success": true,
  "deviceCode": "XXXXXXX",
  "userCode": "ABCD-1234",
  "verificationUri": "https://github.com/login/device",
  "expiresIn": 900
}
```

### Poll for Token

```javascript
POST /api/auth/github-device
{
  "action": "poll-token",
  "deviceCode": "XXXXXXX"
}

Response:
{
  "success": true,
  "token": "ghu_XXXXX",
  "user": {
    "login": "USERNAME",
    "name": "Full Name",
    "avatar_url": "https://..."
  }
}

Set-Cookie: github_token=...; HttpOnly; Secure; SameSite=Strict
```

### Using in Code

**Frontend:**
```javascript
import GithubAuthModal from '@/components/ai/GithubAuthModal';

export default function MyPage() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <button onClick={() => setShowAuth(true)}>
        Login with GitHub
      </button>
      
      <GithubAuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={(token) => console.log('Logged in!', token)}
      />
    </>
  );
}
```

**CLI:**
```bash
npm run auth
```

---

## 🔗 Related Files

- **CLI Script:** `scripts/auth.js`
- **API Route:** `app/api/auth/github-device/route.js`
- **Auth Library:** `lib/github-auth.js`
- **Modal Component:** `components/ai/GithubAuthModal.js`
- **AI Page:** `app/ai/page.js` (checks for token)

---

## 🎯 What's Next?

After authentication:

1. ✅ Visit http://localhost:3000/ai
2. ✅ Chat with "Orb" (AI assistant)
3. ✅ Ask for movie recommendations
4. ✅ Create lists and rate titles
5. ✅ Enjoy AI-powered discovery!

---

## 📞 Support

**Common Questions:**

- **Where is my token stored?**
  - CLI: In `.env` file
  - Browser: In secure httpOnly cookies
  
- **Can I use the same token on another machine?**
  - Yes! Copy `.env` file (but don't share with others)
  - Or run `npm run auth` on the new machine

- **How do I revoke the token?**
  - Go to https://github.com/settings/applications
  - Find "Better IMDb" and disconnect it
  - Token becomes useless immediately

- **What if I forget my code?**
  - Just run `npm run auth` again
  - You get a new code (old one expires in 15 minutes)

---

**Happy coding! 🚀**
