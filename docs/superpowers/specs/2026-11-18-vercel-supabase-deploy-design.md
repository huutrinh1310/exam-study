# Vercel and Supabase Deployment Design

## Intent

Publish the existing Clearstudy Next.js application and connect it to a new
Supabase project so visitors can use its account and exam-study features.

## Goals

- Preserve the existing local Git history and make a deployment-preparation
  commit on an isolated local branch.
- Connect the existing GitHub repository `huutrinh1310/exam-study` to Vercel
  and enable automatic deployments from `main`.
- Create a new Supabase project and apply the existing initial migration.
- Configure the app's Supabase URL, public anon key, and production site URL.
- Configure Supabase Auth's production site and callback URLs.
- Keep credentials out of source control and chat.
- Deploy the website and database first; production SMTP is explicitly deferred
  for the user to configure later.

## Non-goals

- Creating another GitHub repository.
- Adding a new database schema or changing application features.
- Deploying paid infrastructure without the user's approval.
- Treating Supabase's default email delivery as production-ready SMTP.

## Approaches

1. **Private GitHub repository with Vercel Git integration.** Provides automatic
   deploys on pushes but was initially declined.
2. **Local Git plus Vercel CLI.** Deploys directly from the working copy with
   manual releases; also initially selected.
3. **Connect the existing GitHub repository `huutrinh1310/exam-study` to Vercel
   (selected).** A later user decision changed the route to keep this integration
   and deploy pushes to `main`.
4. **Manual dashboard upload.** Avoids CLI setup but is less repeatable and is
   not the route the user selected.

## Design

- Use the project's existing Next.js 16 and npm setup. The README specifies
  Node.js 24 LTS and `npm ci`; retain those runtime and build expectations.
- Preserve the existing `main` history. The deployment-preparation changes
  remain on local branch `deploy/vercel-supabase`; do not push them without
  separate explicit authorization. Vercel's CLI connected the existing GitHub
  repository as `origin`. Respect `.gitignore`, especially `.env*`,
  `node_modules`, `.next`, and `.worktrees/`; do not commit secrets or generated
  local artifacts.
- Create a new Supabase project on the free tier if available; do not choose a
  paid plan or add paid services without confirmation. Use the user's preferred
  region, or ask before choosing if it is not clear in the dashboard.
- Create resources under the account/team the user authenticates into, and
  confirm the displayed ownership before finalizing resource creation.
- Apply `supabase/migrations/202611180001_initial.sql` exactly once to the new
  project's database. Do not apply it to any other project. Configure the
  existing email/password and email-confirmation flow.
- Keep the Vercel project connected to the existing GitHub `main` branch so
  future pushes there trigger deployments. The initial production deployment
  was made directly from the local worktree because no GitHub push was
  authorized.
  Supply `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `NEXT_PUBLIC_SITE_URL` through Vercel's project environment configuration.
  Use the public anon key only; never use a Supabase service-role key in the
  browser or a `NEXT_PUBLIC_` variable.
- Once the production URL exists, set it as the Supabase Site URL and allow
  `<production-origin>/auth/callback` as a redirect URL. Ensure
  `NEXT_PUBLIC_SITE_URL` matches the HTTPS production origin, then redeploy so
  Next.js builds with the production public environment values.
- Use `https://vercel-supabase-deploy-one.vercel.app` unless the user later
  requests a custom domain.
- Production email confirmation and password recovery require a suitable SMTP
  provider. SMTP is outside this deployment and remains a follow-up; until
  configured in Supabase, real member sign-up and password recovery may not
  reliably deliver email.

## Acceptance criteria

- The existing local Git history is preserved. Vercel is connected to GitHub
  `main` for future automatic deployments; no code was pushed in this task.
- The Vercel production URL serves the app successfully.
- The app can connect to the new Supabase project without exposing a
  service-role key.
- The initial schema exists in the new Supabase project, and Auth redirects
  point only to the production origin and the intended callback.
- The final Vercel deployment uses the production site URL and Supabase public
  settings; the deferred SMTP limitation is reported clearly.

## Remaining builder choices

- Keep all environment values in Vercel/Supabase settings or a local ignored
  environment file; never stage an environment file.
- The Vercel project was created under `huutrinh1310's projects` and connected
  to `huutrinh1310/exam-study`, production branch `main`.
- The production origin is `https://vercel-supabase-deploy-one.vercel.app`.
- Ask before pushing any changes to the shared GitHub branch; do not ask the
  user to paste access tokens or database passwords into chat.
- Verify the local production build and the deployed URL before reporting
  completion.
