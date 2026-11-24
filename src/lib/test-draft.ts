import type { ChoiceLabel, StudyAttempt } from "./study";

export type DraftAnswer =
  | ChoiceLabel[]
  | Partial<Record<ChoiceLabel, boolean>>;
export type DraftStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export type DraftQuestion = Pick<
  StudyAttempt["questions"][number],
  "id" | "kind" | "choices"
>;
export type TestDraftResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type StoredDraft = {
  version: 1;
  userId: string;
  attemptId: string;
  answers: Record<string, { kind: DraftQuestion["kind"]; answer: DraftAnswer }>;
};

function draftKey(userId: string, attemptId: string) {
  return `study-test-draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(attemptId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDraftAnswer(
  question: DraftQuestion,
  answer: unknown,
): answer is DraftAnswer {
  const labels = question.choices.map(({ label }) => label);
  if (question.kind === "yes_no") {
    if (!isRecord(answer)) return false;
    return Object.entries(answer).every(
      ([label, value]) => labels.includes(label as ChoiceLabel) && typeof value === "boolean",
    );
  }

  if (!Array.isArray(answer)) return false;
  return (
    answer.length <= labels.length &&
    (question.kind !== "single" || answer.length <= 1) &&
    new Set(answer).size === answer.length &&
    answer.every(
      (label) =>
        typeof label === "string" && labels.includes(label as ChoiceLabel),
    )
  );
}

function questionMap(questions: DraftQuestion[]) {
  return new Map(questions.map((question) => [question.id, question]));
}

function validateAnswers(
  answers: unknown,
  questions: DraftQuestion[],
): TestDraftResult<Record<string, DraftAnswer>> {
  if (!isRecord(answers)) {
    return { ok: false, error: "The saved study draft is invalid." };
  }
  const available = questionMap(questions);
  const result: Record<string, DraftAnswer> = {};
  for (const [questionId, entry] of Object.entries(answers)) {
    const question = available.get(questionId);
    if (!question || !isRecord(entry) || entry.kind !== question.kind) {
      return {
        ok: false,
        error: "The saved study draft does not match this attempt.",
      };
    }
    if (!validDraftAnswer(question, entry.answer)) {
      return {
        ok: false,
        error: `The saved answer for question ${questionId} is invalid.`,
      };
    }
    result[questionId] = entry.answer;
  }
  return { ok: true, value: result };
}

export function loadTestDraft(
  storage: DraftStorage,
  userId: string,
  attemptId: string,
  questions: DraftQuestion[],
): TestDraftResult<Record<string, DraftAnswer>> {
  let serialized: string | null;
  try {
    serialized = storage.getItem(draftKey(userId, attemptId));
  } catch {
    return { ok: false, error: "Browser storage is unavailable; the draft could not be loaded." };
  }
  if (serialized === null) return { ok: true, value: {} };

  let stored: unknown;
  try {
    stored = JSON.parse(serialized);
  } catch {
    return { ok: false, error: "The saved study draft is corrupt and could not be loaded." };
  }
  if (
    !isRecord(stored) ||
    stored.version !== 1 ||
    stored.userId !== userId ||
    stored.attemptId !== attemptId ||
    !isRecord(stored.answers)
  ) {
    return { ok: false, error: "The saved study draft metadata is invalid or does not match this attempt." };
  }
  return validateAnswers(stored.answers, questions);
}

export function saveTestDraft(
  storage: DraftStorage,
  userId: string,
  attemptId: string,
  questions: DraftQuestion[],
  responses: Record<string, DraftAnswer>,
): TestDraftResult<void> {
  const entries: Record<string, { kind: DraftQuestion["kind"]; answer: DraftAnswer }> = {};
  const available = questionMap(questions);
  for (const [questionId, answer] of Object.entries(responses)) {
    const question = available.get(questionId);
    if (!question || !validDraftAnswer(question, answer)) {
      return {
        ok: false,
        error: `The draft answer for question ${questionId} is invalid.`,
      };
    }
    entries[questionId] = { kind: question.kind, answer };
  }
  const value: StoredDraft = {
    version: 1,
    userId,
    attemptId,
    answers: entries,
  };
  try {
    storage.setItem(draftKey(userId, attemptId), JSON.stringify(value));
  } catch {
    return { ok: false, error: "Browser storage is unavailable; the draft could not be saved." };
  }
  return { ok: true, value: undefined };
}

export function clearTestDraft(
  storage: DraftStorage,
  userId: string,
  attemptId: string,
): TestDraftResult<void> {
  try {
    storage.removeItem(draftKey(userId, attemptId));
  } catch {
    return { ok: false, error: "Browser storage is unavailable; the draft could not be cleared." };
  }
  return { ok: true, value: undefined };
}
