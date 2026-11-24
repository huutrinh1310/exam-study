import { describe, expect, it } from "vitest";
import type { QuestionAnswer } from "../src/lib/quiz";
import type {
  FlashcardDeck,
  FlashcardReveal,
  FlashcardRating,
  StudyActionResult,
  StudyAttempt,
} from "../src/lib/study";
import {
  applyFlashcardRating,
  applyFlashcardReveal,
  applySubmission,
  buildFullTestResponses,
  canSubmitAnswer,
  type FlashcardSessionState,
} from "../src/lib/study-state";
import type { DraftAnswer } from "../src/lib/test-draft";

type Assert<T extends true> = T;
type StudyAttemptModeIsRequired = Assert<
  Record<never, never> extends Pick<StudyAttempt, "mode"> ? false : true
>;
void (true as StudyAttemptModeIsRequired);

const questionIds = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
] as const;

const baseQuestion = {
  position: 0,
  category: "Networks",
  prompt: "Question",
  choices: [
    { label: "A" as const, text: "First choice" },
    { label: "B" as const, text: "Second choice" },
  ],
};

const yesNoQuestion: Extract<StudyAttempt["questions"][number], { kind: "yes_no" }> = {
  ...baseQuestion,
  id: questionIds[0],
  kind: "yes_no",
  response: null,
  feedback: null,
};

const multipleQuestion: Extract<StudyAttempt["questions"][number], { kind: "multiple" }> = {
  ...baseQuestion,
  id: questionIds[0],
  kind: "multiple",
  response: null,
  feedback: null,
};

function attemptFixture(): StudyAttempt {
  return {
    id: "00000000-0000-4000-8000-000000000013",
    quiz_id: "00000000-0000-4000-8000-000000000014",
    mode: "practice",
    title: "Network foundations",
    completed_at: null,
    total: 2,
    answered: 0,
    correct: 0,
    questions: questionIds.map((id, position) => ({
      id,
      position,
      category: "Networks",
      prompt: `Question ${position + 1}`,
      choices: [
        { label: "A", text: "First choice" },
        { label: "B", text: "Second choice" },
      ],
      kind: "single",
      response: null,
      feedback: null,
    })),
  };
}

const flashcardQuestions: FlashcardDeck["questions"] = questionIds.map(
  (id, position) => ({
    id,
    position,
    category: "Networks",
    prompt: `Question ${position + 1}`,
    choices: [
      { label: "A", text: "First choice" },
      { label: "B", text: "Second choice" },
    ],
    kind: "single",
    rating: null,
  }),
);

function flashcardState(): FlashcardSessionState {
  return {
    questions: flashcardQuestions,
    index: 0,
    reveal: null,
    error: "",
  };
}

describe("study state transitions", () => {
  it("requires an explicit true or false for every yes/no statement", () => {
    expect(
      canSubmitAnswer(yesNoQuestion, { A: false, B: true }),
    ).toBe(true);
    expect(canSubmitAnswer(yesNoQuestion, { A: false })).toBe(false);
  });

  it("accepts at least one selected multiple-answer choice", () => {
    expect(canSubmitAnswer(multipleQuestion, ["A"])).toBe(true);
    expect(canSubmitAnswer(multipleQuestion, [])).toBe(false);
  });

  it("updates only the submitted question and never counts a response twice", () => {
    const attempt = attemptFixture();
    const response: QuestionAnswer = ["A"];
    const feedback = {
      correct: true,
      answer: ["A"] as ["A"],
      explanation: "The first choice is correct.",
      completed: false,
    };

    const submitted = applySubmission(
      attempt,
      questionIds[1],
      response,
      feedback,
    );
    const repeated = applySubmission(
      submitted,
      questionIds[1],
      ["B"],
      { ...feedback, correct: false, answer: ["A"] },
    );

    expect(submitted.questions[0]).toEqual(attempt.questions[0]);
    expect(submitted.questions[1]).toMatchObject({
      response,
      feedback,
    });
    expect(submitted.answered).toBe(1);
    expect(submitted.correct).toBe(1);
    expect(repeated).toBe(submitted);
    expect(repeated.answered).toBe(1);
    expect(repeated.correct).toBe(1);
  });

  it.each([
    ["missing question", {}],
    ["empty single choice", { [questionIds[0]]: [], [questionIds[1]]: ["A", "B"] }],
    ["empty multiple choice", { [questionIds[0]]: ["A"], [questionIds[1]]: [] }],
  ])("does not build full-test responses for a %s", (_description, drafts) => {
    const original = attemptFixture();
    const attempt: StudyAttempt = {
      ...original,
      mode: "full_test",
      questions: original.questions.map((question, index) =>
        index === 1 ? { ...question, kind: "multiple" as const } : question,
      ) as StudyAttempt["questions"],
    };

    expect(
      buildFullTestResponses(attempt, drafts as Record<string, DraftAnswer>),
    ).toBeNull();
  });

  it("does not build full-test responses for a partially answered yes/no question", () => {
    const original = attemptFixture();
    const attempt: StudyAttempt = {
      ...original,
      mode: "full_test",
      questions: original.questions.map((question, index) =>
        index === 0 ? { ...question, kind: "yes_no" as const } : question,
      ) as StudyAttempt["questions"],
    };

    expect(
      buildFullTestResponses(attempt, {
        [questionIds[0]]: { A: true },
        [questionIds[1]]: ["A"],
      }),
    ).toBeNull();
  });

  it("builds complete full-test responses in attempt question order", () => {
    const original = attemptFixture();
    const attempt: StudyAttempt = {
      ...original,
      mode: "full_test",
      questions: original.questions.map((question, index) =>
        index === 0
          ? { ...question, kind: "yes_no" as const }
          : { ...question, kind: "multiple" as const },
      ) as StudyAttempt["questions"],
    };
    const drafts: Record<string, DraftAnswer> = {
      [questionIds[1]]: ["B", "A"],
      [questionIds[0]]: { B: false, A: true },
    };

    expect(buildFullTestResponses(attempt, drafts)).toEqual([
      { question_id: questionIds[0], response: { B: false, A: true } },
      { question_id: questionIds[1], response: ["B", "A"] },
    ]);
  });
});

describe("flashcard state transitions", () => {
  it("starts with the active card unrevealed", () => {
    const state = flashcardState();

    expect(state.index).toBe(0);
    expect(state.reveal).toBeNull();
    expect(state.questions[0].rating).toBeNull();
  });

  it("reveals answer and explanation only for the active card", () => {
    const reveal: FlashcardReveal = {
      question_id: questionIds[0],
      answer: ["B"],
      explanation: "The second choice is correct.",
    };
    const result: StudyActionResult<FlashcardReveal> = {
      ok: true,
      value: reveal,
    };

    const revealed = applyFlashcardReveal(
      flashcardState(),
      questionIds[0],
      result,
    );

    expect(revealed.reveal).toEqual(reveal);
    expect(revealed.index).toBe(0);
    expect(revealed.questions[0]).not.toHaveProperty("answer");
    expect(revealed.questions[1]).not.toHaveProperty("answer");
    expect(revealed.questions[1]).not.toHaveProperty("explanation");
  });

  it.each(["known", "review"] as const)(
    "records a successful %s rating and advances once",
    (rating) => {
      const state = {
        ...flashcardState(),
        reveal: {
          question_id: questionIds[0],
          answer: ["B"] as QuestionAnswer,
          explanation: "The second choice is correct.",
        },
      };
      const result: StudyActionResult<FlashcardRating> = {
        ok: true,
        value: rating,
      };

      const rated = applyFlashcardRating(state, questionIds[0], result);
      const repeated = applyFlashcardRating(rated, questionIds[0], result);

      expect(rated.index).toBe(1);
      expect(rated.questions[0].rating).toBe(rating);
      expect(rated.reveal).toBeNull();
      expect(repeated).toBe(rated);
    },
  );

  it("preserves the active card, reveal, and saved rating on rating failure", () => {
    const reveal: FlashcardReveal = {
      question_id: questionIds[0],
      answer: ["B"],
      explanation: "The second choice is correct.",
    };
    const state = {
      ...flashcardState(),
      questions: flashcardQuestions.map((question, index) =>
        index === 0 ? { ...question, rating: "review" as const } : question,
      ),
      reveal,
    };

    const failed = applyFlashcardRating(state, questionIds[0], {
      ok: false,
      error: "Could not save your rating.",
    });

    expect(failed.index).toBe(0);
    expect(failed.reveal).toEqual(reveal);
    expect(failed.questions[0].rating).toBe("review");
    expect(failed.error).toBe("Could not save your rating.");
  });

  it("does not apply a stale rating result to another active card", () => {
    const state = { ...flashcardState(), index: 1 };
    const staleResult: StudyActionResult<FlashcardRating> = {
      ok: true,
      value: "known",
    };

    const unchanged = applyFlashcardRating(state, questionIds[0], staleResult);

    expect(unchanged).toBe(state);
    expect(unchanged.index).toBe(1);
    expect(unchanged.questions[0].rating).toBeNull();
    expect(unchanged.questions[1].rating).toBeNull();
  });
});
