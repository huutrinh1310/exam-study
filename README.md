# Clearstudy

A responsive exam-practice website built with Next.js, Supabase and PostgreSQL.
Members can import XLSX quizzes, study single-answer, multiple-answer and
per-statement YES/NO questions, resume submitted progress, review history, and
share quizzes through revocable member-only links.

## Run locally

Use Node.js 24 LTS and npm. On Windows PowerShell, use `npm.cmd` if script
execution policy prevents running `npm`.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000. The landing page works without service configuration;
account and study pages explicitly report missing configuration, not demo data.

## Configure Supabase

1. Create a Supabase project that you own. Use a separate project for testing.
2. Apply [the initial migration](supabase/migrations/202611180001_initial.sql)
   using the Supabase SQL editor or your normal migration workflow. It creates
   quiz/attempt tables, private answer keys, row-level policies and transactional
   study functions. It is an initial migration, not an idempotent seed script.
3. Configure these environment variables in your local development environment
   and Vercel project settings. Restart/rebuild after changing configuration.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project's HTTPS origin |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Its public anon key (not the service-role key) |
| `NEXT_PUBLIC_SITE_URL` | Your website's origin, without a path |

For development, the site origin can be `http://localhost:3000`. Production
requires HTTPS. The public key is intended for browser use; authorization is
enforced by database policies and access-checked functions. Never put a
service-role key in the application or a `NEXT_PUBLIC_` variable.

4. In Supabase Authentication, enable email/password sign-up and email
   confirmation. Set the Site URL to your website origin. Allow the callback
   URL `<your-origin>/auth/callback` for email verification and password recovery,
   including its `next` query parameter. Configure localhost separately for
   development; constrain production redirects to origins you control.
5. Configure a production SMTP provider and review Supabase email/rate limits.
   The default development email service is not suitable for a public launch.
6. Confirm a new account can verify its email, sign in, reset its password and
   sign out before inviting other members.

Environment files must remain private and are ignored by Git. This project
does not include a generated environment-file template.

## Import exams

Uploads must be `.xlsx`, at most **4 MiB** and **1,000 questions**. The application
limit leaves space for multipart overhead within Vercel's request-size limit.
The low-level parser separately rejects inputs larger than 5 MiB.

Put all of these headers within the first 20 rows of each question worksheet:

`No`, `Category`, `Question`, `Choice A`, `Choice B`, `Choice C`, `Choice D`,
`Choice E`, `Choice F`, `Correct Answer`, `Answer explanation`.

Use 2–6 nonempty choices. The last two choices may be blank. A straightforward
format uses one row per question and these answer keys:

- Single answer: `A`
- Multiple answers: `A, C`
- Per-statement answers: `A-YES, B-NO, C-YES` (one value for every choice)

The supplied samples' paired `Question`/`Answer` rows and recognized explicit
choice marks are also supported. Formula cells are never evaluated; recognized
answer-row marks are parsed independently. Unsupported or incomplete data
produces row-specific errors. Correct **every** reported error before saving.
There is no partial import or guessing of missing answers.

The initial sample check accepted all 97 CCDV-F questions. CCAR-P has six rows
with incomplete or unsupported categorical answer encodings; these require
source corrections before its 116-question workbook can be saved.

## Privacy and studying

- Quizzes are private until their owner enables sharing. There is no public
  quiz directory. Any signed-in member with an enabled link can study it.
- Recipients cannot edit quizzes or view another member's attempts.
- Revoking sharing prevents recipients from loading or submitting those quiz
  questions, including in an existing attempt. Their history metadata remains.
- Correct answers and explanations are returned only after submitting that
  question. Answers are immutable after submission; exact matches are required
  for multiple-answer and YES/NO scoring.
- Only **submitted answers** are saved. Unsubmitted selections are drafts.
- Uploaded workbook files are not retained; validated question data is stored.
- DOCX import, timed exams, payments and a public quiz directory are not included.

## Verify

```powershell
npm.cmd test
npm.cmd run db:test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd exec -- playwright install chromium
npm.cmd run test:browser
```

`db:test` runs the real migration and access/scoring assertions in isolated
embedded PostgreSQL (PGlite), with minimal Supabase Auth stubs. It does not
connect to a hosted project or prove email delivery, PostgREST integration or
concurrent multi-connection behavior. To test against a disposable Supabase
database, first apply the migration, then execute
[the transactional access tests](supabase/tests/access.sql) as an administrative
test role. Never run fixture tests against production.

Browser tests start and stop a production server on port 3187. They check
desktop/mobile public navigation, rendering errors and horizontal overflow.
A production build must exist first.

On a managed Windows network, a browser download may need Node's system
certificate store: set `$env:NODE_USE_SYSTEM_CA = '1'` in the same PowerShell
process before running the browser installation command. Do not disable TLS
certificate verification.

The initial dependency audit reported 16 high-severity development-toolchain
findings associated with `picomatch`; the production dependency audit was clean.
Review current advisories and compatible fixes before using untrusted tooling
inputs. Do not apply a forced audit downgrade of Next.js blindly.

## Publish on Vercel

1. Put this project in your own Git repository and connect it to Vercel, or
   deploy from your authenticated Vercel CLI. Do not commit environment files.
2. Select the Next.js preset and Node.js 24. Use `npm run build`.
3. Configure the three variables above before building. Use your final HTTPS
   domain for `NEXT_PUBLIC_SITE_URL`, not localhost or someone else's domain.
4. Apply the migration in the production Supabase project. Configure Auth
   callback allowlists and production SMTP for the final domain.
5. Deploy, then test with **two real member accounts**: import, all answer types,
   reload/resume, completion/history, share, revoke and direct-link access.
6. Review provider quotas, spending limits, backups, SMTP delivery, privacy
   obligations and abuse monitoring before opening registration broadly.

Building locally does **not** publish the website. Supabase/Vercel project
configuration, live account testing and public deployment require your accounts.
