import { describe, expect, it } from "vitest";
import type { QuestionAnswer } from "../src/lib/quiz";
import type { StudyAttempt } from "../src/lib/study";
import { applySubmission, canSubmitAnswer } from "../src/lib/study-state";

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
});
