# Task 2: Typed Server-Side Study APIs

## Implementation

- Updated `Database` types for the attempt mode column, optional `start_attempt.p_mode`, and the four Task 1 RPCs: flashcard deck, answer reveal, rating, and full-test submission.
- Added study-mode and flashcard-rating enums, `ChoiceLabel`, answer, deck, reveal, full-test response/feedback, and action-result types with strict Zod validation.
- Added `mode` validation to attempts and attempt summaries. Flashcard deck entries are strict and reject answer-key fields. Full-test feedback validates all result fields and rejects duplicate IDs.
- Added `getFlashcardDeck`, which validates inputs, calls the authenticated RPC, validates the response, and rejects mismatched quiz IDs while preserving database and parse errors.
- Updated `beginAttempt` to default only an omitted mode to `practice`, reject invalid or repeated values, and pass the validated mode to `start_attempt`.
- Added `revealFlashcard`, `rateFlashcard`, and `submitFullTest` actions. Each validates inputs before RPC access, preserves RPC/parse errors, and only returns success for validated database results. Full-test results must correspond exactly to the submitted question IDs.
- Left the existing immediate-feedback `answerQuestion` behavior unchanged.

## TDD and Verification

1. Added schema tests first for supported/unknown modes, answer-key exclusion from decks, reveal validation, and batch feedback IDs/content.
2. Ran `npm.cmd test -- tests/study.test.ts` before implementation: **RED**, 7 failed and 4 passed; failures showed the missing mode contract and missing flashcard/full-test schemas.
3. Implemented the contracts and adapters.
4. Ran `npm.cmd test -- tests/study.test.ts`: **GREEN**, 11 tests passed.
5. Ran `npm.cmd test`: **GREEN**, 5 files and 69 tests passed.
6. Ran `npm.cmd run typecheck`: passed.
7. Ran ESLint on all changed TypeScript files and `git diff --check`: passed.

## Scope and Notes

The original implementation modified the five brief-listed source/test files, plus this requested report. The Round 1 fix also updates `tests/study-state.test.ts` to keep its in-memory fixture conformant and compile-time assert required mode. Existing untracked `.superpowers/` and `docs/superpowers/` files in the worktree were left untouched.

The exported `StudyAttempt` and `ParsedStudyAttempt` types now both require the `StudyMode` validated by `attemptSchema`.

No dependencies were added. Nothing was pushed or deployed.

## Round 1 Fix: Required Attempt Mode

- Made `StudyAttempt` directly infer from `attemptSchema`, so `mode` is required. Kept `ParsedStudyAttempt` as an alias for the existing data adapter's exported return type.
- Updated the in-memory study-state attempt fixture with `mode: "practice"` and added a compile-time assertion that `StudyAttempt.mode` is required.

### TDD and Verification

1. Added the required-mode type assertion and updated the test fixture.
2. Before changing the exported type, ran `npm.cmd run typecheck`: **RED**, with `tests/study-state.test.ts(8,3): error TS2344: Type 'false' does not satisfy the constraint 'true'.`
3. Updated `StudyAttempt` to the required schema-inferred type.
4. Ran `npm.cmd test -- tests/study.test.ts tests/study-state.test.ts`: **GREEN**, 2 files and 14 tests passed.
5. Ran `npm.cmd run typecheck`: **GREEN**, `tsc --noEmit` passed.
