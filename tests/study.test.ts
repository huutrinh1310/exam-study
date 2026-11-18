import { describe, expect, it } from "vitest";
import {
  attemptSchema,
  attemptSummarySchema,
  quizOverviewSchema,
  submissionSchema,
} from "../src/lib/study";

const overview = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Cloud basics",
  owner_id: "00000000-0000-4000-8000-000000000002",
  is_shared: true,
  question_count: 1,
  categories: ["Cloud"],
};

const attempt = {
  id: "00000000-0000-4000-8000-000000000003",
  quiz_id: overview.id,
  title: overview.title,
  completed_at: null,
  total: 1,
  answered: 0,
  correct: 0,
  questions: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      position: 0,
      category: "Cloud",
      prompt: "Choose the right answer",
      choices: [
        { label: "A", text: "First" },
        { label: "B", text: "Second" },
      ],
      kind: "single",
      response: null,
      feedback: null,
    },
  ],
};

const summary = {
  id: attempt.id,
  quiz_id: overview.id,
  title: overview.title,
  total: 1,
  answered: 0,
  correct: 0,
  created_at: "2026-11-18T05:00:00.000Z",
  completed_at: null,
};

describe("study output schemas", () => {
  it("accepts overview and unanswered learner data without exposing an answer", () => {
    expect(quizOverviewSchema.parse(overview)).toEqual(overview);
    expect(attemptSchema.parse(attempt)).toEqual(attempt);
  });

  it("accepts feedback for a submitted question in a completed attempt", () => {
    const completed = {
      ...attempt,
      completed_at: "2026-11-18T05:10:00.000Z",
      answered: 1,
      correct: 1,
      questions: [
        {
          ...attempt.questions[0],
          response: ["B"],
          feedback: {
            correct: true,
            answer: ["B"],
            explanation: "Second is correct.",
          },
        },
      ],
    };

    expect(attemptSchema.parse(completed)).toEqual(completed);
  });

  it("rejects malformed or leaked learner feedback", () => {
    expect(
      attemptSchema.safeParse({
        ...attempt,
        questions: [{ ...attempt.questions[0], answer: ["B"] }],
      }).success,
    ).toBe(false);
    expect(
      attemptSchema.safeParse({
        ...attempt,
        questions: [
          {
            ...attempt.questions[0],
            response: ["C"],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires feedback to appear only after a response", () => {
    expect(
      attemptSchema.safeParse({
        ...attempt,
        questions: [
          {
            ...attempt.questions[0],
            feedback: {
              correct: false,
              answer: ["B"],
              explanation: "Second is correct.",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces overview and question text bounds", () => {
    expect(
      quizOverviewSchema.safeParse({ ...overview, title: " " }).success,
    ).toBe(false);
    expect(
      attemptSchema.safeParse({
        ...attempt,
        questions: [
          { ...attempt.questions[0], prompt: "q".repeat(10_001) },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates submission feedback", () => {
    expect(
      submissionSchema.safeParse({
        correct: true,
        answer: ["B"],
        explanation: "Second is correct.",
        completed: true,
      }).success,
    ).toBe(true);

    expect(
      submissionSchema.safeParse({
        correct: true,
        answer: ["B", "B"],
        explanation: "Second is correct.",
        completed: true,
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent attempt summary counts", () => {
    expect(attemptSummarySchema.parse(summary)).toEqual(summary);
    expect(
      attemptSummarySchema.safeParse({
        ...summary,
        answered: 1,
        correct: 2,
      }).success,
    ).toBe(false);
  });
});
