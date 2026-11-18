# Vercel and Supabase Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Clearstudy from a local Git repository to Vercel and connect it to a new Supabase project.

**Architecture:** Keep the existing Next.js 16 app and Supabase schema. Initialize Git locally without a remote, provision a new Supabase project, then deploy the working copy directly through the Vercel CLI with production environment variables.

**Tech Stack:** Next.js 16, Node.js 24 LTS, npm, Vercel CLI, Supabase PostgreSQL/Auth.

**Spec:** `docs/superpowers/specs/2026-11-18-vercel-supabase-deploy-design.md`

## Global Constraints

- Use Node.js 24 LTS and `npm ci`.
- Do not create a GitHub repository or configure a Git remote.
- Use a free tier where available; do not create paid resources without user approval.
- Do not stage or commit secrets; do not ask for passwords, access tokens, or service-role keys in chat.
- Apply `supabase/migrations/202611180001_initial.sql` only to the new Supabase project, exactly once.
- Use only the Supabase public anon key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Use the Vercel-provided `vercel.app` production URL unless the user later requests a custom domain.
- Production SMTP is deferred; report that verification and password-recovery email delivery may not work reliably until configured.

## Review Focus

- **Unexpected or secret files in the initial commit:** inspect the staged file list and confirm `.env*`, `node_modules`, `.next`, and test output are excluded before committing.
- **Wrong Supabase project or duplicate schema migration:** confirm the new project identity before applying the migration; verify expected database objects afterward.
- **Invalid production origin or callback:** ensure `NEXT_PUBLIC_SITE_URL` is the exact HTTPS origin and Supabase allows only that origin's `/auth/callback`.
- **Wrong account/team or paid tier:** verify ownership and plan in each dashboard before project creation.
- **SMTP is deferred:** do not report email confirmation or password recovery as ready; state the limitation after the site smoke test.

---

### Task 1: Initialize and verify the local Git repository

**Files:**
- Read: `.gitignore`
- Include in initial commit: existing project files and approved deployment docs

**Interfaces:**
- Consumes: the existing working directory; no Git remote.
- Produces: a local Git repository with an initial commit.

- [ ] **Step 1: Run the existing project checks**

Run: `npm.cmd ci`
Expected: dependencies install from `package-lock.json`.

Run: `npm.cmd run typecheck`
Expected: exit code 0.

Run: `npm.cmd run lint`
Expected: exit code 0.

Run: `npm.cmd run build`
Expected: production build succeeds.

- [ ] **Step 2: Initialize Git and inspect the staged paths**

Run: `git init`
Run: `git add -A`
Run: `git diff --cached --check`
Run: `git diff --cached --name-only`

Expected: no whitespace errors; staged paths contain the project and approved docs but no `.env*`, `node_modules`, `.next`, `test-results`, or other generated artifacts.

- [ ] **Step 3: Create the initial commit**

Run:

```powershell
git commit -m "chore: initialize Clearstudy deployment repository" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: one initial commit exists and `git remote -v` prints no remotes. If Git author identity is missing, ask the user to configure it; do not invent an identity.

### Task 2: Provision the new Supabase project and schema

**Files:**
- Apply: `supabase/migrations/202611180001_initial.sql`

**Interfaces:**
- Consumes: a new Supabase project owned by the account/team the user authenticates into.
- Produces: the project's URL and public anon key, plus the migrated database.

- [ ] **Step 1: Create a Supabase project**

Use the Supabase dashboard under the user's authenticated account. Confirm the displayed account/team, select the free tier if available, and ask the user to choose a region if the appropriate one is unclear. The user enters the database password directly in Supabase.

Expected: a newly created project; no paid plan or add-on is enabled.

- [ ] **Step 2: Apply the initial migration exactly once**

Paste and run `supabase/migrations/202611180001_initial.sql` in the SQL editor for that new project only.

Expected: the migration succeeds and the expected tables, policies, and functions are visible in the project. Stop on any SQL error; do not rerun a partially applied migration blindly.

- [ ] **Step 3: Record public project settings for Vercel**

Retrieve the project URL and public anon key in the Supabase dashboard. Keep values out of chat and source control; enter them directly into Vercel project settings in Task 3. Never use the service-role key.

### Task 3: Link and deploy the app with Vercel CLI

**Files:**
- Local-only generated link: `.vercel/` (already ignored by `.gitignore`)

**Interfaces:**
- Consumes: the initial local Git commit and Supabase project URL/public anon key.
- Produces: the Vercel production URL and a ready production deployment.

- [ ] **Step 1: Authenticate and link the Vercel project**

Run `npx.cmd --yes vercel login` and complete the browser authentication directly. Confirm the account/team before creating the project. Run `npx.cmd --yes vercel link` from the project root and create/select a project without importing a Git repository.

Expected: `.vercel/` is present and ignored; `git status --short` shows no generated Vercel metadata.

- [ ] **Step 2: Configure production settings**

In Vercel project settings, choose Node.js 24.x and set production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`: the new Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: that project's public anon key.
- `NEXT_PUBLIC_SITE_URL`: the exact HTTPS `vercel.app` production origin.

Enter values directly in Vercel; do not paste them into chat or a tracked file. Ensure values are available to the Production environment before the production build.

- [ ] **Step 3: Deploy to production**

Run: `npx.cmd --yes vercel --prod`

Expected: CLI reports a production deployment URL and Ready status. If the build fails, read the specific deployment logs and correct the cause before retrying.

### Task 4: Configure Supabase Auth and smoke-test production

**Files:**
- No application code changes.

**Interfaces:**
- Consumes: the Vercel production origin and the migrated Supabase project.
- Produces: production redirect settings and a verified public site.

- [ ] **Step 1: Configure production Auth URLs**

In Supabase Authentication URL settings, set Site URL to the exact Vercel production origin and add `<production-origin>/auth/callback` to the allowed redirect URLs. Keep redirects limited to the intended production origin.

Expected: production Site URL and callback match the Vercel deployment exactly.

- [ ] **Step 2: Redeploy if environment values changed**

If `NEXT_PUBLIC_SITE_URL` or any public Supabase value was changed after the build, run `npx.cmd --yes vercel --prod` again.

Expected: the Ready production deployment was built with the final values.

- [ ] **Step 3: Verify the deployed site**

Open the production URL and confirm the landing page loads without browser errors. Open the authentication page and confirm the app reaches its configured state. Check Vercel deployment status and Supabase database objects.

Expected: site is live and configured against the new Supabase project. Report that email verification/password recovery remain dependent on the user's deferred SMTP setup.
