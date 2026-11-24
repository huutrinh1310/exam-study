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

Only the five brief-listed source/test files were modified, plus this requested report. Existing untracked `.superpowers/` and `docs/superpowers/` files in the worktree were left untouched.

`attemptSchema` and the server data adapter enforce a required `StudyMode`. The exported `StudyAttempt` state type keeps `mode` optional to retain compatibility with the existing mode-less in-memory study-state test fixture, which is outside the brief's allowed file list; the stricter parsed type is `ParsedStudyAttempt`.

No dependencies were added. Nothing was pushed or deployed.
