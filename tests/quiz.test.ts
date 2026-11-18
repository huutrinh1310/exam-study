import { describe, expect, it } from "vitest";
import {
  questionSchema,
  scoreQuestion,
  type QuestionInput,
} from "../src/lib/quiz";

const question = (overrides: Partial<QuestionInput> = {}): QuestionInput => ({
  category: "Cloud",
  prompt: "Which option is correct?",
  choices: [
    { label: "A", text: "First choice" },
    { label: "B", text: "Second choice" },
    { label: "C", text: "Third choice" },
  ],
  kind: "single",
  answer: ["B"],
  explanation: "The second choice is correct.",
  ...overrides,
}) as QuestionInput;

describe("questionSchema", () => {
  it("accepts a single-answer question with valid referenced choices", () => {
    expect(questionSchema.safeParse(question()).success).toBe(true);
  });

  it("rejects duplicated choice labels and empty choice text", () => {
    const duplicated = question({
      choices: [
        { label: "A", text: "First" },
        { label: "A", text: "Repeated label" },
      ],
    });
    const emptyChoice = question({
      choices: [
        { label: "A", text: "First" },
        { label: "B", text: "   " },
      ],
    });

    expect(questionSchema.safeParse(duplicated).success).toBe(false);
    expect(questionSchema.safeParse(emptyChoice).success).toBe(false);
  });

  it("requires between two and six choices", () => {
    const oneChoice = question({
      choices: [{ label: "A", text: "Only choice" }],
    });
    const sevenChoices = question({
      choices: [
        { label: "A", text: "A" },
        { label: "B", text: "B" },
        { label: "C", text: "C" },
        { label: "D", text: "D" },
        { label: "E", text: "E" },
        { label: "F", text: "F" },
        { label: "F", text: "G" },
      ],
    });

    expect(questionSchema.safeParse(oneChoice).success).toBe(false);
    expect(questionSchema.safeParse(sevenChoices).success).toBe(false);
  });

  it("enforces single and multiple answer cardinality", () => {
    expect(
      questionSchema.safeParse(question({ answer: ["A", "B"] })).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse(question({ kind: "multiple", answer: ["A"] }))
        .success,
    ).toBe(false);
    expect(
      questionSchema.safeParse(
        question({ kind: "multiple", answer: ["A", "C"] }),
      ).success,
    ).toBe(true);
  });

  it("rejects duplicate or unreferenced answer labels", () => {
    expect(
      questionSchema.safeParse(question({ answer: ["B", "B"] })).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse(question({ answer: ["D"] })).success,
    ).toBe(false);
  });

  it("requires yes/no answers to cover each choice exactly once", () => {
    const valid = question({
      kind: "yes_no",
      answer: { A: true, B: false, C: true },
    });
    const missingChoice = question({
      kind: "yes_no",
      answer: { A: true, B: false },
    });
    const unknownChoice = question({
      kind: "yes_no",
      answer: { A: true, B: false, D: true },
    });

    expect(questionSchema.safeParse(valid).success).toBe(true);
    expect(questionSchema.safeParse(missingChoice).success).toBe(false);
    expect(questionSchema.safeParse(unknownChoice).success).toBe(false);
  });

  it("rejects answer formats that do not match the question kind", () => {
    expect(
      questionSchema.safeParse(
        question({
          kind: "yes_no",
          answer: ["A"],
        } as unknown as Partial<QuestionInput>),
      ).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse(
        question({ answer: { A: true } } as unknown as Partial<QuestionInput>),
      ).success,
    ).toBe(false);
  });

  it("bounds and requires nonempty question text", () => {
    expect(questionSchema.safeParse(question({ prompt: " " })).success).toBe(
      false,
    );
    expect(
      questionSchema.safeParse(question({ prompt: "q".repeat(10_001) })).success,
    ).toBe(false);
  });
});

describe("scoreQuestion", () => {
  it("scores single and multiple answers independent of answer order", () => {
    expect(scoreQuestion(question(), ["B"])).toBe(true);
    expect(
      scoreQuestion(
        question({ kind: "multiple", answer: ["A", "C"] }),
        ["C", "A"],
      ),
    ).toBe(true);
    expect(
      scoreQuestion(
        question({ kind: "multiple", answer: ["A", "C"] }),
        ["A"],
      ),
    ).toBe(false);
  });

  it("scores yes/no answers by exact key and boolean match", () => {
    const yesNo = question({
      kind: "yes_no",
      answer: { A: true, B: false, C: true },
    });

    expect(scoreQuestion(yesNo, { A: true, B: false, C: true })).toBe(true);
    expect(scoreQuestion(yesNo, { A: true, B: true, C: true })).toBe(false);
    expect(scoreQuestion(yesNo, { A: true, B: false })).toBe(false);
  });
});
