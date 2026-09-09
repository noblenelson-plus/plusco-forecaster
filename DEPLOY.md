# Deploying the Forecaster app — a guide for Noble

This is the full runbook for shipping your changes to real users: how to handle
git, how to actually deploy, what can go wrong, and how to recover. Read the
**Risks** section at least once before your first deploy — there are a couple of
sharp edges that can affect data, not just the UI.

---

## 1. What you're actually deploying

| Thing | Value |
|-------|-------|
| App | `plusco-forecaster` — Next.js 16 (App Router) + React 19, server-rendered |
| Hosting | **Firebase Hosting** with the web-frameworks backend (SSR runs as a Cloud Function in `us-central1`) |
| Firebase project | `pluscoops` |
| Live URL | **https://pluscoops.web.app** (also `https://pluscoops.firebaseapp.com`) |
| Repo | `github.com/noblenelson-plus/plusco-forecaster` |
| Branch that ships | **`master`** — production is built from whatever is on `master` |

There is **only one Firebase project** — no separate staging/prod. When you
deploy, you deploy straight to the URL your users are on. That single fact drives
most of the caution below.

---

## 2. One-time setup (do this once per machine)

1. **Install the Firebase CLI** (it is not in the project's dependencies):
   ```bash
   npm install -g firebase-tools
   ```

2. **Log in** with a Google account that has access to the `pluscoops` Firebase
   project (ask Tristan to add you if `firebase projects:list` doesn't show it):
   ```bash
   firebase login
   firebase projects:list        # you should see "pluscoops"
   ```
   The project is already selected for you via `.firebaserc` (`default: pluscoops`),
   so you don't need to run `firebase use`.

3. **Get the environment files.** `.env` and `.env.local` are **gitignored** —
   they are NOT in the repo and they hold secrets (Firebase Admin private key,
   Google OAuth client, MediaBox refresh secret). Get them directly from Tristan
   and drop them in the project root. Without them, local build and server-side
   features (BigQuery, admin SDK) won't work.
   > ⚠️ Never commit `.env*`. Never paste these values into Slack, a PR, or a
   > chat with an AI tool. If a key leaks, it has to be rotated.

4. Install dependencies:
   ```bash
   npm install
   ```

---

## 3. The everyday git workflow

**Never commit straight to `master`.** The team works branch → Pull Request →
merge → deploy. Here's the full loop.

### 3.1 Start from a clean, up-to-date master
```bash
git checkout master
git pull origin master
```

### 3.2 Create a feature branch
Use a short, descriptive name (look at existing branches for the style:
`exec-kpis-polish`, `flag-context-options`, `forecast-sheets-roundtrip`):
```bash
git checkout -b my-feature-name
```

### 3.3 Do your work, then commit in logical chunks
```bash
git status                     # see what changed
git add -p                     # stage hunks deliberately (or: git add <file>)
git commit -m "feat(forecast): short description of what changed"
```
Keep commits focused. Message style in this repo mirrors the existing log:
`feat(area): ...`, `fix(area): ...`, etc.

### 3.4 Push your branch
```bash
git push -u origin my-feature-name
```

### 3.5 Open a Pull Request
On GitHub, open a PR from `my-feature-name` → `master`. This is where changes get
reviewed before they can reach users. Describe **what** changed and **why**, and
call out anything touching Firestore rules, data shape, or access control.

Get Tristan's review. Once approved, **merge the PR on GitHub** (this updates
`origin/master`).

### 3.6 Pull the merged master back locally — this is the version you deploy
```bash
git checkout master
git pull origin master
git log --oneline -5           # confirm your merge is at the top
```

> 🔑 **Golden rule: you only ever deploy `master`, and only after pulling it.**
> The deploy command builds from your local working copy, so what's on your disk
> *is* what goes live. If your local `master` is stale or has uncommitted
> experiments, you'd ship the wrong thing.

Sanity check before deploying — this must print nothing:
```bash
git status                     # must say "working tree clean"
git log origin/master..master  # must be empty (local == remote)
```

---

## 4. Deploy: the actual publish step

### 4.1 First, build locally and make sure it's green
Never deploy a build you haven't seen succeed. From the project root:
```bash
npm run build
```
If the build fails (TypeScript error, lint error, etc.), **fix it before
deploying** — a broken build must not go out. You can also smoke-test the real
production build locally:
```bash
npm run start          # serves the production build at http://localhost:3000
```
Click through the areas you changed.

### 4.2 Deploy — and be deliberate about WHAT you deploy

⚠️ **The most important thing in this whole document.** The `firebase.json` in
this repo defines three things: **hosting**, **Firestore rules**, and **Storage
rules**. A bare `firebase deploy` pushes **all three**. That means a plain deploy
can silently change your database security rules — which is how data gets exposed
or how users get locked out.

**For a normal code/UI change, deploy hosting ONLY:**
```bash
firebase deploy --only hosting
```

Deploy the security rules **only when you deliberately changed them**, and as a
separate, conscious step:
```bash
firebase deploy --only firestore:rules     # after editing firestoreRules.txt
firebase deploy --only storage             # after editing storage.rules
```

Deploying is not instant — the web-frameworks backend rebuilds and redeploys the
Cloud Function; give it a few minutes. When it finishes, the CLI prints the
**Hosting URL**.

### 4.3 Verify it's actually live
1. Open **https://pluscoops.web.app** in a **private/incognito window** (to dodge
   cached assets).
2. Check the specific thing you changed.
3. Do a quick pass on the core flows (login, load a client, a forecast sheet).
4. Open the browser dev console and confirm there are no new red errors.

If it looks wrong, go straight to **Rollback** (section 6). Don't try to
hot-patch under pressure.

---

## 5. Risks & things that will bite you

These are specific to *this* app — worth internalizing.

- **One environment = no safety net.** There is no staging. Every deploy is to
  production. The local `npm run build && npm run start` smoke test is your only
  pre-prod check, so actually do it.

- **Firestore rules ARE the security boundary — and they're deployed from a
  file.** Route/role checks in the React code are **UX only**, not security
  (`middleware.ts` is intentionally a no-op; auth lives in localStorage, not
  cookies). The real access control is `firestoreRules.txt`. Consequences:
  - A wrong rule change can **expose every client's data** or **lock everyone
    out**. Treat rule edits with far more care than UI edits.
  - Rules are edited **by hand** and kept in sync manually. If you change what a
    collection stores or who may read/write it, update `firestoreRules.txt` in
    the same PR.
  - Deploy rules as their own `--only firestore:rules` step so it's a conscious
    action, never a side effect of shipping a button color.

- **Secrets live outside git.** `.env.local` holds the Firebase Admin private
  key and OAuth client. It's gitignored on purpose. If you ever find yourself
  about to `git add` a `.env` file, stop. If server-side features (BigQuery,
  admin actions) work locally but not in production after a deploy, the
  production backend may be missing an env var — **flag this to Tristan** rather
  than guessing, since how server secrets reach the Firebase backend is a
  project-config concern, not something to improvise.

- **`NEXT_PUBLIC_*` values are baked into the build.** They're inlined at
  `npm run build` time, so if you change one you must rebuild and redeploy for it
  to take effect. (The Firebase *client* config in `lib/firebase.ts` is
  hardcoded and public — that's normal and fine.)

- **You deploy your local working copy, not what's on GitHub.** Firebase builds
  from disk. If your tree is dirty or on the wrong branch, you ship that. Always
  do the `git status` / `git log origin/master..master` check from section 3.6.

- **Caching.** Users may not see changes instantly, and you may see a stale
  version. Verify in incognito.

---

## 6. Rollback — when a deploy goes bad

Firebase Hosting keeps previous releases, so rolling back is fast and is your
first move if production breaks.

**Fastest (Firebase Console):**
1. Go to the [Firebase Console](https://console.firebase.google.com/) → project
   `pluscoops` → **Hosting**.
2. Find the **Release history** for site `pluscoops`.
3. On the previous good release, click the ⋮ menu → **Rollback**. Users are back
   on the old version in seconds — no rebuild needed.

**Then fix forward in git:** once the site is stable again, fix the problem on a
branch, open a PR, merge, and redeploy properly. Don't leave `master` in a state
you can't deploy.

> Rolling back **hosting** does not roll back **Firestore rules**. If a bad
> *rules* deploy is the problem, you must redeploy the correct
> `firestoreRules.txt` with `firebase deploy --only firestore:rules`. Keep the
> file's git history clean so you can always recover the last-known-good rules.

---

## 7. Quick cheat-sheet

```bash
# --- ship a normal code change ---
git checkout master && git pull origin master   # after your PR is merged
git status                                       # must be clean
npm run build                                    # must succeed
firebase deploy --only hosting                   # publish
# then verify https://pluscoops.web.app in incognito

# --- ship a Firestore rules change (deliberate!) ---
firebase deploy --only firestore:rules

# --- emergency ---
# Firebase Console -> Hosting -> Release history -> Rollback
```

**If you're ever unsure whether something is safe to deploy — especially
anything touching `firestoreRules.txt`, `storage.rules`, access/roles, or data
shape — ask Tristan before running the deploy, not after.**
