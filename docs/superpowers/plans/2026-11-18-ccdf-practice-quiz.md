# CCDF Practice Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable 10-question original CCDF practice workbook and save it as a private quiz through the authenticated Clearstudy import flow.

**Architecture:** Add an XLSX fixture under `test-data/` using the existing import format, and extend the importer unit tests to prove it parses without row errors and covers all supported question kinds. After local validation, use the normal app import screen to preview and save the workbook to the signed-in user's private library.

**Tech Stack:** Next.js, TypeScript, ExcelJS, Vitest, Supabase-backed authenticated import.

**Spec:** `docs/superpowers/specs/2026-11-18-ccdf-practice-quiz-design.md`

## Global Constraints

- The workbook contains 10 original questions and uses all supported types: single-answer, multiple-answer, and per-choice yes/no.
- Treat the material as general Claude development fundamentals, not official exam questions or guaranteed blueprint coverage.
- Save only through the authenticated app import flow; do not write directly to production tables or create a seed script.
- Keep the quiz private and do not create or verify an account on the user's behalf.
- Do not commit or push changes unless separately requested.

## Review Focus

- **Workbook header/answer format:** parser must accept the exact headers and answer-key syntax; test the workbook fixture with `parseWorkbook`.
- **Question-kind coverage:** fixture must include all three supported kinds; assert counts by kind.
- **Invalid content or missing answers:** parsed result must contain exactly 10 questions and zero errors before upload.
- **Production ownership:** save through the authenticated importer and verify the resulting quiz is private in the signed-in user's library.

---

### Task 1: Create and validate the CCDF workbook fixture

**Files:**
- Create: `test-data/ccdf-practice-mock.xlsx`
- Modify: `tests/import.test.ts`

**Interfaces:**
- Consumes: `parseWorkbook(buffer: ArrayBuffer): Promise<ImportResult>` from `src/lib/import.ts`.
- Produces: a workbook with 10 original practice questions and a regression test that confirms all rows parse cleanly.

- [x] **Step 1: Add a fixture regression test**

Add a test named `imports the CCDF practice workbook with all supported question kinds` in `tests/import.test.ts`. Read the fixture from `test-data/ccdf-practice-mock.xlsx`, pass its bytes to `parseWorkbook`, and assert:

```ts
expect(result.errors).toEqual([]);
expect(result.questions).toHaveLength(10);
expect(result.questions.filter(({ kind }) => kind === "single")).toHaveLength(5);
expect(result.questions.filter(({ kind }) => kind === "multiple")).toHaveLength(3);
expect(result.questions.filter(({ kind }) => kind === "yes_no")).toHaveLength(2);
```

- [x] **Step 2: Run the focused test and confirm it fails because the fixture is not present**

Run: `npm.cmd test -- tests/import.test.ts`

Expected: the new fixture test fails because `test-data/ccdf-practice-mock.xlsx` does not yet exist.

- [x] **Step 3: Create the workbook fixture**

Create one worksheet with these columns in order: `No`, `Category`, `Question`, `Choice A`, `Choice B`, `Choice C`, `Choice D`, `Choice E`, `Choice F`, `Correct Answer`, `Answer explanation`. Include exactly 10 nonempty rows, 2–6 choices per question, five single-answer rows (`A` form), three multiple-answer rows (`A, C` form), and two per-choice yes/no rows (for example `A-YES, B-NO, C-YES`). Leave unused choice cells blank. Use concise, original questions and explanations about Claude developer fundamentals; do not present them as official exam content.

- [x] **Step 4: Run the focused importer tests**

Run: `npm.cmd test -- tests/import.test.ts`

Expected: all importer tests pass, including the 10-question fixture test.

- [x] **Step 5: Preview and save through the app**

The production import preview accepted all 10 questions with zero row issues
and showed the expected 5/3/2 question-kind counts. The quiz was saved
successfully and appeared in the signed-in user's private library.

Sign in to the user's already verified account in the shared browser. Open `/import`, title the quiz `CCDF - Practice Mock (Original Questions)`, upload `test-data/ccdf-practice-mock.xlsx`, and preview it.

Expected: preview reports 10 accepted questions, no row issues, and the counts 5 single, 3 multiple, and 2 yes/no. Save only after confirming the preview, then verify the private quiz appears in the user's library with 10 questions.

## Completion

After the user requested a PR, the quiz-only change was committed as
`2ed9319` on `feature/ccdf` and pushed to GitHub. PR #1 targets `main`; no
changes were pushed directly to `main`. Report the quiz title and import
result.
