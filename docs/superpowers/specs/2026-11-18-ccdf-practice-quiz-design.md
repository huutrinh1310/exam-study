# CCDF Practice Quiz Design

## Intent

Create a small, original Claude Certified Developer Foundation (CCDF) practice
quiz so the user can test Clearstudy's real quiz-import and study flow.

## Design

- Create a 10-question `.xlsx` workbook in the format accepted by Clearstudy's
  importer, including answer keys and concise explanations.
- Cover general Claude development fundamentals such as API usage, prompt and
  system instructions, tool use, safety, and testing. Questions are original
  study material, not official exam questions and not a claim of alignment to
  an official exam blueprint.
- Include single-answer, multiple-answer, and per-choice yes/no questions to
  exercise each supported quiz type.
- Preview and save through the app's authenticated import flow so normal
  validation and quiz ownership apply. Keep the saved quiz private. Do not write
  directly to production tables or create a seed script.
- Use a verified account session supplied by the user. If the session is not
  authenticated, stop at the workbook and ask the user to sign in; do not
  attempt account creation or bypass email verification.

## Approaches

1. **Import an `.xlsx` through Clearstudy (selected):** exercises the normal
   upload, validation, persistence, and study flow and keeps ownership correct.
2. **Insert rows directly into Supabase:** rejected because it bypasses the
   application's validated creation path and creates unnecessary production
   database risk.
3. **Add a repository seed fixture only:** rejected for this request because it
   would not create the quiz in the user's library or test the live flow.

## Scope and safeguards

- The quiz is private and is added to the user's account only after an explicit
  save in the normal import flow.
- No application code, schema, or production configuration changes are needed.
- The workbook may remain available as a local reusable artifact; it contains
  no account credentials or private user data.
