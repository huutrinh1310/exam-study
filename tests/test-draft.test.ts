import { describe, expect, it } from "vitest";
import {
  clearTestDraft,
  loadTestDraft,
  saveTestDraft,
  type DraftStorage,
} from "../src/lib/test-draft";
import type { DraftAnswer, DraftQuestion } from "../src/lib/test-draft";

const userId = "user-1";
const attemptId = "attempt-1";
const questions: DraftQuestion[] = [
  {
    id: "question-single",
    kind: "single",
    choices: [{ label: "A", text: "First" }, { label: "B", text: "Second" }],
  },
  {
    id: "question-multiple",
    kind: "multiple",
    choices: [
      { label: "A", text: "First" },
      { label: "B", text: "Second" },
      { label: "C", text: "Third" },
    ],
  },
  {
    id: "question-yes-no",
    kind: "yes_no",
    choices: [{ label: "A", text: "First" }, { label: "B", text: "Second" }],
  },
];

function memoryStorage(): DraftStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("full-test browser drafts", () => {
  it("round-trips drafts scoped to the same user and attempt", () => {
    const storage = memoryStorage();
    const draft: Record<string, DraftAnswer> = {
      "question-single": ["B"],
      "question-multiple": ["A", "C"],
      "question-yes-no": { A: false },
    };

    expect(
      saveTestDraft(storage, userId, attemptId, questions, draft),
    ).toEqual({ ok: true, value: undefined });
    expect(loadTestDraft(storage, userId, attemptId, questions)).toEqual({
      ok: true,
      value: draft,
    });
    expect(loadTestDraft(storage, "another-user", attemptId, questions)).toEqual({
      ok: true,
      value: {},
    });
    expect(loadTestDraft(storage, userId, "another-attempt", questions)).toEqual({
      ok: true,
      value: {},
    });
  });

  it("rejects malformed stored JSON", () => {
    const storage = memoryStorage();
    storage.values.set(storedKeyFor(userId, attemptId), "{");
    const result = loadTestDraft(storage, userId, attemptId, questions);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/corrupt|invalid/i);
  });

  it.each([
    ["different user", { version: 1, userId: "other", attemptId, answers: {} }],
    ["different attempt", { version: 1, userId, attemptId: "other", answers: {} }],
  ])("rejects %s metadata", (_description, metadata) => {
    const storage = memoryStorage();
    storage.values.set(storedKeyFor(userId, attemptId), JSON.stringify(metadata));

    const result = loadTestDraft(storage, userId, attemptId, questions);

    expect(result.ok).toBe(false);
  });

  it.each([
    ["unknown question ID", { unknown: { kind: "single", answer: ["A"] } }],
    ["invalid choice label", { "question-single": { kind: "single", answer: ["Z"] } }],
    ["duplicate choice labels", { "question-multiple": { kind: "multiple", answer: ["A", "A"] } }],
    ["question-kind mismatch", { "question-single": { kind: "multiple", answer: ["A", "B"] } }],
    ["invalid yes/no value", { "question-yes-no": { kind: "yes_no", answer: { A: "yes" } } }],
  ])("rejects %s", (_description, answers) => {
    const storage = memoryStorage();
    storage.values.set(
      storedKeyFor(userId, attemptId),
      JSON.stringify({ version: 1, userId, attemptId, answers }),
    );

    const result = loadTestDraft(storage, userId, attemptId, questions);

    expect(result.ok).toBe(false);
  });

  it("rejects invalid answers before persisting them", () => {
    const storage = memoryStorage();

    const result = saveTestDraft(storage, userId, attemptId, questions, {
      "question-single": ["A", "B"],
    });

    expect(result.ok).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it("reports storage read, write, and removal failures", () => {
    const storageErrors = {
      getItem: () => {
        throw new Error("read denied");
      },
      setItem: () => {
        throw new Error("write denied");
      },
      removeItem: () => {
        throw new Error("remove denied");
      },
    };

    const readResult = loadTestDraft(storageErrors, userId, attemptId, questions);
    const writeResult = saveTestDraft(
      storageErrors,
      userId,
      attemptId,
      questions,
      {},
    );
    const clearResult = clearTestDraft(storageErrors, userId, attemptId);

    expect(readResult).toMatchObject({ ok: false, error: expect.any(String) });
    expect(writeResult).toMatchObject({ ok: false, error: expect.any(String) });
    expect(clearResult).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("keeps a failed submission's draft until explicitly cleared after success", () => {
    const storage = memoryStorage();
    const response = { "question-yes-no": { A: false } };
    saveTestDraft(storage, userId, attemptId, questions, response);

    // A failed submit does not call clearTestDraft, so the draft remains recoverable.
    expect(loadTestDraft(storage, userId, attemptId, questions)).toEqual({
      ok: true,
      value: response,
    });

    expect(clearTestDraft(storage, userId, attemptId)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(loadTestDraft(storage, userId, attemptId, questions)).toEqual({
      ok: true,
      value: {},
    });
  });
});

function storedKeyFor(user: string, attempt: string) {
  return `study-test-draft:v1:${encodeURIComponent(user)}:${encodeURIComponent(attempt)}`;
}
