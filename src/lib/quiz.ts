import { z } from "zod";

export const choiceLabels = ["A", "B", "C", "D", "E", "F"] as const;

const choiceLabelSchema = z.enum(choiceLabels);
const questionText = z.string().trim().min(1).max(10_000);
const choiceSchema = z.object({
  label: choiceLabelSchema,
  text: z.string().trim().min(1).max(5_000),
});

const questionFields = {
  category: z.string().trim().min(1).max(100),
  prompt: questionText,
  choices: z.array(choiceSchema).min(2).max(6),
  explanation: z.string().trim().max(20_000),
};

const answerArray = z.array(choiceLabelSchema);

const questionUnion = z.discriminatedUnion("kind", [
  z.object({
    ...questionFields,
    kind: z.literal("single"),
    answer: answerArray.length(1),
  }),
  z.object({
    ...questionFields,
    kind: z.literal("multiple"),
    answer: answerArray.min(2),
  }),
  z.object({
    ...questionFields,
    kind: z.literal("yes_no"),
    answer: z.record(z.string(), z.boolean()),
  }),
]);

export const questionSchema = questionUnion.superRefine((question, context) => {
  const choiceLabelsInQuestion = question.choices.map(({ label }) => label);
  const availableLabels = new Set(choiceLabelsInQuestion);

  if (availableLabels.size !== choiceLabelsInQuestion.length) {
    context.addIssue({
      code: "custom",
      path: ["choices"],
      message: "Choice labels must be distinct.",
    });
  }

  if (question.kind === "yes_no") {
    const answerLabels = Object.keys(question.answer);
    const answerLabelSet = new Set(answerLabels);
    const hasUnknownLabel = answerLabels.some(
      (label) => !choiceLabels.includes(label as (typeof choiceLabels)[number]),
    );
    const hasMissingChoice = choiceLabelsInQuestion.some(
      (label) => !answerLabelSet.has(label),
    );

    if (
      hasUnknownLabel ||
      hasMissingChoice ||
      answerLabels.length !== choiceLabelsInQuestion.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["answer"],
        message: "Yes/no answers must include one boolean for every choice.",
      });
    }

    return;
  }

  const hasUnknownAnswer = question.answer.some(
    (label) => !availableLabels.has(label),
  );
  const hasDuplicateAnswer =
    new Set(question.answer).size !== question.answer.length;

  if (hasUnknownAnswer || hasDuplicateAnswer) {
    context.addIssue({
      code: "custom",
      path: ["answer"],
      message: "Answers must reference distinct labels from the choices.",
    });
  }
});

export type QuestionInput = z.infer<typeof questionSchema>;
export type QuestionChoice = QuestionInput["choices"][number];
export type QuestionAnswer = QuestionInput["answer"];

export function parseQuestionInput(input: unknown): QuestionInput {
  return questionSchema.parse(input);
}

export function safeParseQuestionInput(input: unknown) {
  return questionSchema.safeParse(input);
}

export function scoreQuestion(
  question: QuestionInput,
  response: QuestionAnswer,
): boolean {
  if (question.kind === "yes_no") {
    if (
      typeof response !== "object" ||
      response === null ||
      Array.isArray(response)
    ) {
      return false;
    }

    const expected = question.answer;
    const actual = response as Record<string, boolean>;
    const expectedLabels = Object.keys(expected);
    const actualLabels = Object.keys(actual);

    return (
      expectedLabels.length === actualLabels.length &&
      expectedLabels.every(
        (label) =>
          Object.hasOwn(actual, label) && actual[label] === expected[label],
      )
    );
  }

  if (!Array.isArray(response) || response.length !== question.answer.length) {
    return false;
  }

  const expected = new Set(question.answer);
  const actual = new Set(response);

  return (
    actual.size === response.length &&
    actual.size === expected.size &&
    [...expected].every((label) => actual.has(label))
  );
}
