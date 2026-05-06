# Iron Platform — Trainer Portal (v0.2)

## What this is

Iron Platform is a white-label SaaS trainer portal built for GLP-1 fitness coaches. v0.2 is the dogfood phase: a Supabase-backed, multi-tenant web portal where trainers manage clients, build exercise programs, assign workouts, and generate physician-ready PDF summaries — all behind row-level security with zero PHI stored. The client-facing workout PWA is a separate surface; this repo is the trainer portal only.

## Stack

- **Frontend**: Vanilla HTML / JS / CSS — no framework, no build step, ships directly to Cloudflare Pages
- **Backend**: Supabase (PostgreSQL + Row Level Security + Auth + Storage)
- **Supabase JS client**: v2 via CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)
- **Hosting**: Cloudflare Pages (free tier, global CDN, no server to manage)

## Setup — Michael's 5-Minute Task

1. Sign up at https://supabase.com (free tier — no credit card required)
2. Create a new project: name it `iron-platform`, region `us-east-1`, set a strong DB password and save it in 1Password
3. Wait ~2 minutes for the project to finish provisioning
4. Go to **Settings → API**: copy the `Project URL` and the `anon public` key — you'll need these in step 9
5. Go to **SQL Editor → New query**, paste the contents of `schema/001_initial.sql`, and click **Run**
6. Go to **SQL Editor → New query**, paste the contents of `seed/exercises.sql`, and click **Run**
7. Go to **SQL Editor → New query**, paste the contents of `seed/glp1-program.sql`, and click **Run**
8. Go to **Authentication → URL Configuration**: add `http://localhost:8080` and `https://iron-portal.pages.dev` to the **Redirect URLs** list
9. Paste the Project URL and anon key back to Joe — he'll substitute them into the portal config

## Local Dev

Run a simple static file server from the `iron-portal/` directory:

```bash
cd iron-portal
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser. No build step, no node_modules, no install.

## Env Vars

Two placeholders must be substituted before the portal connects to Supabase:

| Placeholder | Description |
|---|---|
| `SUPABASE_URL` | Project URL from Supabase Settings → API (e.g., `https://xyzxyz.supabase.co`) |
| `SUPABASE_ANON_KEY` | `anon public` key from Supabase Settings → API |

These are embedded directly in the portal JS config (not a `.env` file — this is a static site). The anon key is safe to expose client-side; RLS policies enforce all data isolation.

## Deploy

1. Push this repo to GitHub (or Cloudflare Pages can connect to your existing WMW561 repo)
2. In [Cloudflare Pages](https://pages.cloudflare.com), click **Create a project → Connect to Git**
3. Select the repo and set the **root directory** to `iron-portal/`
4. Build command: *(leave blank — no build step)*; output directory: `/`
5. Under **Settings → Environment variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`
6. Deploy — Cloudflare assigns a `*.pages.dev` URL automatically
7. Add that URL to Supabase Authentication → URL Configuration (see Setup step 8)

## Phase 2 — Bootstrap your own trainer account (one-time, after schema is applied)

Because v0.2 is dogfood-only and self-service signup is deferred to Phase 3, the first trainer account (yours) gets provisioned manually. Two short SQL snippets in the Supabase SQL Editor:

1. **Sign in via the portal magic link first.** Open the portal `index.html` in a browser, enter `michael@willisedge.com`, click "Send magic link," check email, click the link. This creates an `auth.users` row in Supabase but no `trainers` row yet — the portal will redirect you to a "complete profile" state (or 404 the dashboard query gracefully).

2. **Create your `trainers` row** (Supabase SQL Editor → New query):

   ```sql
   INSERT INTO trainers (id, email, full_name, business_name, brand_name, brand_color, notify_email)
   VALUES (
     auth.uid(),                    -- pulls your authenticated UUID
     'michael@willisedge.com',
     'Michael Willis',
     'Willis Edge LLC',
     'Iron',
     '#1E3A5F',
     'michael@willisedge.com'
   );
   ```

   (Run this **while signed in to the Supabase dashboard with the same auth session** — `auth.uid()` resolves correctly. If it returns NULL, paste your auth user UUID from Authentication → Users instead.)

3. **Seed your default GLP-1 Protocol program** (so Day 1 you have a program to assign):

   ```sql
   SELECT seed_glp1_program_for_trainer(auth.uid());
   ```

4. **Reload the portal.** Dashboard now shows your trainer profile. Add yourself as your first client (Clients → + Add Client → "Michael Willis," check `on_glp1`), assign the GLP-1 Protocol program, and copy the PWA access URL (Client Detail → "PWA link") to your phone.

You're now dogfooding. The same Supabase project handles future beta testers — repeat steps 1–3 with their email/UUID when you're ready to invite them.
