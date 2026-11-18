# Vercel and Supabase Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Completed steps are checked off below.

**Goal:** Deploy Clearstudy from GitHub `main` to Vercel and connect it to a new Supabase project.

**Architecture:** Keep the existing Next.js 16 app and Supabase schema. Vercel is connected to `huutrinh1310/exam-study` and deploys pushes to `main`. Configure a new Supabase project and production environment values in Vercel. Do not push changes to GitHub without separate explicit authorization.

**Tech Stack:** Next.js 16, Node.js 24 LTS, npm, Vercel CLI, Supabase PostgreSQL/Auth.

**Spec:** `docs/superpowers/specs/2026-11-18-vercel-supabase-deploy-design.md`

## Global Constraints

- Use Node.js 24 LTS and `npm ci`.
- Use the existing GitHub repository `huutrinh1310/exam-study` and branch `main`.
- Do not push changes to GitHub without separate explicit authorization.
- Use a free tier where available; do not create paid resources without user approval.
- Do not stage or commit secrets; do not ask for passwords, access tokens, or service-role keys in chat.
- Apply `supabase/migrations/202611180001_initial.sql` only to the new Supabase project, exactly once.
- Use only the Supabase public anon key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Use `https://vercel-supabase-deploy-one.vercel.app` unless the user later requests a custom domain.
- Production SMTP is deferred; report that verification and password-recovery email delivery may not work reliably until configured.

## Review Focus

- **Unexpected or secret files in the initial commit:** inspect the staged file list and confirm `.env*`, `node_modules`, `.next`, and test output are excluded before committing.
- **Wrong Supabase project or duplicate schema migration:** confirm the new project identity before applying the migration; verify expected database objects afterward.
- **Invalid production origin or callback:** ensure `NEXT_PUBLIC_SITE_URL` is the exact HTTPS origin and Supabase allows only that origin's `/auth/callback`.
- **Wrong account/team or paid tier:** verify ownership and plan in each dashboard before project creation.
- **SMTP is deferred:** do not report email confirmation or password recovery as ready; state the limitation after the site smoke test.

---

### Task 1: Prepare an isolated local deployment branch

**Files:**
- Modify: `.gitignore` (ignore the approved local worktree directory)
- Modify: `package-lock.json` only if needed to restore a clean npm install
- Include in preparation commit: approved deployment docs and required config

**Interfaces:**
- Consumes: the existing local repository on `main`; Vercel later connected the GitHub remote.
- Produces: a deployment-preparation commit on `deploy/vercel-supabase`.

- [x] **Step 1: Run the existing project checks**

Run: `npm.cmd ci`
Expected: dependencies install from `package-lock.json`. If npm reports that
the lockfile is out of sync, run
`npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund`,
inspect the resulting lockfile diff, then rerun `npm.cmd ci`.

Run: `npm.cmd run typecheck`
Expected: exit code 0.

Run: `npm.cmd run lint`
Expected: exit code 0.

Run: `npm.cmd run build`
Expected: production build succeeds.

- [x] **Step 2: Create the local deployment branch and inspect staged paths**

Create branch `deploy/vercel-supabase` from the existing `main` commit and
switch to it before staging the deployment-preparation changes.

Stage only `.gitignore`, `package-lock.json` if it changed, the approved
deployment design and plan, and any other explicitly required source change.
Do not stage `next-env.d.ts` if it changed only because `next build` refreshed
generated route-type references.

Run: `git diff --cached --check`
Run: `git diff --cached --name-only`

Expected: no whitespace errors; staged paths contain only the intended
deployment-preparation files and no `.env*`, `node_modules`, `.next`,
`test-results`, or other generated artifacts.

- [x] **Step 3: Commit the deployment-preparation changes**

Run:

```powershell
git commit -m "chore: prepare Clearstudy for Vercel deployment" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: the deployment branch contains the preparation commit. If Git author identity is missing, ask the user to configure it; do not invent an identity.

- [x] **Step 4: Create the approved isolated worktree**

Switch the original checkout back to `main`, then add worktree
`.worktrees/vercel-supabase-deploy` on `deploy/vercel-supabase`. Run subsequent
deployment tasks from the worktree.

Expected: worktree is on `deploy/vercel-supabase`, and `.worktrees/` remains
ignored by Git.

### Task 2: Provision the new Supabase project and schema

**Files:**
- Apply: `supabase/migrations/202611180001_initial.sql`

**Interfaces:**
- Consumes: a new Supabase project owned by the account/team the user authenticates into.
- Produces: the project's URL and public anon key, plus the migrated database.

- [x] **Step 1: Create a Supabase project**

Use the Supabase dashboard under the user's authenticated account. Confirm the displayed account/team, select the free tier if available, and ask the user to choose a region if the appropriate one is unclear. The user enters the database password directly in Supabase.

Expected: a newly created project; no paid plan or add-on is enabled.

- [x] **Step 2: Apply the initial migration exactly once**

Paste and run `supabase/migrations/202611180001_initial.sql` in the SQL editor for that new project only.

Expected: the migration succeeds and the expected tables, policies, and functions are visible in the project. Stop on any SQL error; do not rerun a partially applied migration blindly.

- [x] **Step 3: Record public project settings for Vercel**

Retrieve the project URL and public anon key in the Supabase dashboard. Keep values out of chat and source control; enter them directly into Vercel project settings in Task 3. Never use the service-role key.

### Task 3: Configure and deploy the GitHub-linked Vercel project

**Files:**
- Local-only generated link: `.vercel/` (already ignored by `.gitignore`)

**Interfaces:**
- Consumes: GitHub `huutrinh1310/exam-study` branch `main` and the Supabase project URL/public anon key.
- Produces: the Vercel production URL and a ready production deployment.

- [x] **Step 1: Authenticate and link the Vercel project**

Vercel CLI authenticated as `huutrinh1310` and created `vercel-supabase-deploy` under `huutrinh1310's projects`, connected to `huutrinh1310/exam-study` with production branch `main`. Confirm the project settings show that repository and branch.

Expected: `.vercel/` is present and ignored; Vercel's Git integration points at the requested repository and branch.

- [x] **Step 2: Configure production settings**

In Vercel project settings, choose Node.js 24.x and set production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the new Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: that project's public anon key.
- `NEXT_PUBLIC_SITE_URL`: `https://vercel-supabase-deploy-one.vercel.app`.

Enter values directly in Vercel; do not paste them into chat or a tracked file. Ensure values are available to the Production environment before the production build.

- [x] **Step 3: Deploy to production**

Vercel CLI deployed the intended local worktree to production after environment settings were saved. The user chose to keep GitHub `main` connected for future automatic deployments, but no code was pushed.

Expected: deployment is Ready at `https://vercel-supabase-deploy-one.vercel.app`. If the build fails, read the specific deployment logs and correct the cause before retrying.

### Task 4: Configure Supabase Auth and smoke-test production

**Files:**
- No application code changes.

**Interfaces:**
- Consumes: the Vercel production origin and the migrated Supabase project.
- Produces: production redirect settings and a verified public site.

- [x] **Step 1: Configure production Auth URLs**

Supabase Authentication URL settings use `https://vercel-supabase-deploy-one.vercel.app` as Site URL and allow `https://vercel-supabase-deploy-one.vercel.app/auth/callback`.

Expected: production Site URL and callback match the Vercel deployment exactly.

- [x] **Step 2: Redeploy if environment values changed**

If `NEXT_PUBLIC_SITE_URL` or any public Supabase value is changed after the build, redeploy from Vercel so the production bundle uses the final values. This was done after setting the production origin.

Expected: the Ready production deployment was built with the final values.

- [x] **Step 3: Verify the deployed site**

Open the production URL and confirm the landing page loads without browser errors. Open the authentication page and confirm the app reaches its configured state. Check Vercel deployment status and Supabase database objects.

Expected: site is live and configured against the new Supabase project. Landing and sign-up pages returned HTTP 200. Email verification/password recovery remain dependent on the user's deferred SMTP setup.

## Completed deployment notes

- Supabase project `clearstudy` was created on the free tier, and the initial migration was applied once. Verification found the expected five tables, RLS enabled on all five, and seven application functions.
- Vercel project `vercel-supabase-deploy` is connected to GitHub `huutrinh1310/exam-study`, production branch `main`, and uses Node.js 24.x.
- Production environment variables are configured with the Supabase project URL, its public publishable key, and the production origin. No service-role key is used by the app.
- The production deployment is Ready at `https://vercel-supabase-deploy-one.vercel.app`; landing and sign-up smoke tests returned HTTP 200.
- The initial deployment was made from the local deployment worktree. No code was pushed to GitHub; future pushes to `main` are configured to deploy automatically.
- SMTP remains deferred. GitHub `main` does not yet include the local lockfile repair committed on `deploy/vercel-supabase`.
