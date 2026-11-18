import { z } from "zod";
import { choiceLabels } from "./quiz";

const choiceLabelSchema = z.enum(choiceLabels);
const choiceSchema = z
  .object({
    label: choiceLabelSchema,
    text: z.string().trim().min(1).max(5_000),
  })
  .strict();

const answerArraySchema = z
  .array(choiceLabelSchema)
  .min(1)
  .refine((labels) => new Set(labels).size === labels.length);
const singleAnswerSchema = z.array(choiceLabelSchema).length(1);
const multipleAnswerSchema = z
  .array(choiceLabelSchema)
  .min(2)
  .refine((labels) => new Set(labels).size === labels.length);
const yesNoAnswerSchema = z.record(z.string(), z.boolean());
const categorySchema = z.string().trim().min(1).max(100);
const promptSchema = z.string().trim().min(1).max(10_000);
const titleSchema = z.string().trim().min(1).max(120);

const feedbackShape = {
  correct: z.boolean(),
  explanation: z.string().max(20_000),
};

const singleStudyQuestionSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().nonnegative(),
    category: categorySchema,
    prompt: promptSchema,
    choices: z.array(choiceSchema).min(2).max(6),
    kind: z.literal("single"),
    response: singleAnswerSchema.nullable(),
    feedback: z
      .object({
        ...feedbackShape,
        answer: singleAnswerSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((question, context) => {
    const labels = question.choices.map(({ label }) => label);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message: "Choice labels must be distinct.",
      });
    }

    for (const [field, values] of [
      ["response", question.response],
      ["feedback", question.feedback?.answer ?? null],
    ] as const) {
      if (values?.some((label) => !labels.includes(label))) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Answer labels must reference available choices.",
        });
      }
    }
  });

const multipleStudyQuestionSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().nonnegative(),
    category: categorySchema,
    prompt: promptSchema,
    choices: z.array(choiceSchema).min(2).max(6),
    kind: z.literal("multiple"),
    response: answerArraySchema.nullable(),
    feedback: z
      .object({
        ...feedbackShape,
        answer: multipleAnswerSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((question, context) => {
    const labels = question.choices.map(({ label }) => label);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message: "Choice labels must be distinct.",
      });
    }

    for (const [field, values] of [
      ["response", question.response],
      ["feedback", question.feedback?.answer ?? null],
    ] as const) {
      if (values?.some((label) => !labels.includes(label))) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Answer labels must reference available choices.",
        });
      }
    }
  });

const yesNoStudyQuestionSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().nonnegative(),
    category: categorySchema,
    prompt: promptSchema,
    choices: z.array(choiceSchema).min(2).max(6),
    kind: z.literal("yes_no"),
    response: yesNoAnswerSchema.nullable(),
    feedback: z
      .object({
        ...feedbackShape,
        answer: yesNoAnswerSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((question, context) => {
    const labels = question.choices.map(({ label }) => label);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message: "Choice labels must be distinct.",
      });
    }

    for (const [field, values] of [
      ["response", question.response],
      ["feedback", question.feedback?.answer ?? null],
    ] as const) {
      if (
        values !== null &&
        (Object.keys(values).length !== labels.length ||
          labels.some((label) => !Object.hasOwn(values, label)) ||
          Object.keys(values).some(
            (label) => !labels.includes(label as (typeof choiceLabels)[number]),
          ))
      ) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Yes/no values must cover every available choice.",
        });
      }
    }
  });

const studyQuestionSchema = z.discriminatedUnion("kind", [
  singleStudyQuestionSchema,
  multipleStudyQuestionSchema,
  yesNoStudyQuestionSchema,
]);

export const quizOverviewSchema = z
  .object({
    id: z.uuid(),
    title: titleSchema,
    owner_id: z.uuid(),
    is_shared: z.boolean(),
    question_count: z.number().int().nonnegative(),
    categories: z.array(categorySchema),
  })
  .strict()
  .superRefine((overview, context) => {
    if (
      overview.categories.length !== new Set(overview.categories).size ||
      overview.categories.some((category) => category.trim().length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Categories must be nonempty and distinct.",
      });
    }
  });

export type QuizOverview = z.infer<typeof quizOverviewSchema>;

const isoTimestampSchema = z.string().datetime({ offset: true });

export const attemptSchema = z
  .object({
    id: z.uuid(),
    quiz_id: z.uuid(),
    title: titleSchema,
    completed_at: isoTimestampSchema.nullable(),
    total: z.number().int().nonnegative(),
    answered: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    questions: z.array(studyQuestionSchema),
  })
  .strict()
  .superRefine((attempt, context) => {
    if (attempt.total !== attempt.questions.length) {
      context.addIssue({
        code: "custom",
        path: ["total"],
        message: "Total must match the number of questions.",
      });
    }

    const answered = attempt.questions.filter(
      ({ response }) => response !== null,
    ).length;
    const correct = attempt.questions.filter(
      ({ feedback }) => feedback?.correct === true,
    ).length;

    if (attempt.answered !== answered || attempt.correct !== correct) {
      context.addIssue({
        code: "custom",
        path: ["answered"],
        message: "Attempt counts must match submitted feedback.",
      });
    }

    if (attempt.correct > attempt.answered) {
      context.addIssue({
        code: "custom",
        path: ["correct"],
        message: "Correct answers cannot exceed answered questions.",
      });
    }

    attempt.questions.forEach((question, index) => {
      if ((question.response === null) !== (question.feedback === null)) {
        context.addIssue({
          code: "custom",
          path: ["questions", index, "feedback"],
          message: "Feedback must be present exactly when a response is present.",
        });
      }
    });

    if ((attempt.completed_at !== null) !== (attempt.answered === attempt.total)) {
      context.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "Completion timestamp must match the answered question count.",
      });
    }
  });

export type StudyAttempt = z.infer<typeof attemptSchema>;

const submissionAnswerSchema = z.union([
  singleAnswerSchema,
  multipleAnswerSchema,
  yesNoAnswerSchema,
]);

export const submissionSchema = z
  .object({
    correct: z.boolean(),
    answer: submissionAnswerSchema,
    explanation: z.string().max(20_000),
    completed: z.boolean(),
  })
  .strict();

export type SubmissionFeedback = z.infer<typeof submissionSchema>;

export const attemptSummarySchema = z
  .object({
    id: z.uuid(),
    quiz_id: z.uuid(),
    title: titleSchema,
    total: z.number().int().nonnegative(),
    answered: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    created_at: isoTimestampSchema,
    completed_at: isoTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.correct > summary.answered || summary.answered > summary.total) {
      context.addIssue({
        code: "custom",
        path: ["correct"],
        message: "Attempt summary counts are inconsistent.",
      });
    }
  });

export type AttemptSummary = z.infer<typeof attemptSummarySchema>;
