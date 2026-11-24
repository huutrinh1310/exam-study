"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActionAccount } from "@/lib/action-account";
import type { ActionState, ImportState } from "@/lib/action-types";
import { isUuid, validateUploadFile } from "@/lib/auth-validation";
import { parseWorkbook, type ImportResult } from "@/lib/import";
import { toJson } from "@/lib/json";
import { choiceLabels, type QuestionAnswer } from "@/lib/quiz";
import {
  flashcardRatingSchema,
  flashcardRevealSchema,
  fullTestFeedbackSchema,
  fullTestResponsesSchema,
  studyModeSchema,
  submissionSchema,
  type FlashcardRating,
  type FlashcardReveal,
  type FullTestFeedback,
  type FullTestResponse,
  type StudyActionResult,
  type SubmissionFeedback,
} from "@/lib/study";

const titleSchema = z.string().trim().min(1).max(120);
const answerArraySchema = z
  .array(z.enum(choiceLabels))
  .min(1)
  .max(6)
  .refine((labels) => new Set(labels).size === labels.length);
const answerObjectSchema = z
  .record(z.string().regex(/^[A-F]$/), z.boolean())
  .refine(
    (answer) =>
      Object.keys(answer).length >= 1 && Object.keys(answer).length <= 6,
  );
const questionAnswerSchema = z.union([answerArraySchema, answerObjectSchema]);

type ParsedImportFile =
  | ({ ok: true; fileName: string } & ImportResult)
  | { ok: false; state: ImportState };

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
}

async function parseImportFile(
  formData: FormData,
): Promise<ParsedImportFile> {
  const upload = validateUploadFile(formData.get("file"));
  if (!upload.ok) {
    return { ok: false, state: { error: upload.error } };
  }

  try {
    const parsed = await parseWorkbook(await upload.file.arrayBuffer());
    return {
      ok: true,
      fileName: upload.file.name,
      ...parsed,
    };
  } catch (error) {
    return {
      ok: false,
      state: {
        error: errorText(error, "Could not read the uploaded workbook"),
      },
    };
  }
}

export async function previewImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const account = await getActionAccount();
  if (!account.ok) {
    return { error: account.error };
  }

  const parsed = await parseImportFile(formData);
  if (!parsed.ok) {
    return parsed.state;
  }

  return {
    fileName: parsed.fileName,
    questions: parsed.questions,
    errors: parsed.errors,
    ...(parsed.errors.length > 0
      ? { error: "Review and correct the workbook errors before saving." }
      : { message: "Workbook preview is ready." }),
  };
}

export async function saveImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const account = await getActionAccount();
  if (!account.ok) {
    return { error: account.error };
  }

  const titleResult = titleSchema.safeParse(formString(formData, "title"));
  if (!titleResult.success) {
    return { error: "Enter a quiz title of at most 120 characters." };
  }

  const parsed = await parseImportFile(formData);
  if (!parsed.ok) {
    return parsed.state;
  }
  if (parsed.errors.length > 0 || parsed.questions.length === 0) {
    return {
      error: "Correct all workbook errors and include at least one question before saving.",
      questions: parsed.questions,
      errors: parsed.errors,
      fileName: parsed.fileName,
    };
  }
  if (parsed.questions.length > 1_000) {
    return { error: "A quiz cannot contain more than 1,000 questions." };
  }

  let result;
  try {
    result = await account.client.rpc("create_quiz", {
      p_title: titleResult.data,
      p_questions: toJson(parsed.questions),
    });
  } catch (error) {
    return {
      error: errorText(error, "Could not save your quiz"),
      questions: parsed.questions,
      fileName: parsed.fileName,
    };
  }

  if (result.error) {
    return {
      error: `Could not save your quiz: ${result.error.message}`,
      questions: parsed.questions,
      fileName: parsed.fileName,
    };
  }
  if (!isUuid(result.data)) {
    return { error: "The database returned an invalid quiz ID." };
  }

  revalidatePath("/library");
  redirect(`/quiz/${result.data}`);
}

export async function toggleSharing(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const quizId = formString(formData, "quizId");
  if (!isUuid(quizId)) {
    return { error: "The quiz ID is invalid." };
  }

  const shared = formData.get("shared");
  if (shared !== "true" && shared !== "false") {
    return { error: "Choose whether sharing should be on or off." };
  }

  const account = await getActionAccount();
  if (!account.ok) {
    return { error: account.error };
  }

  let result;
  try {
    result = await account.client.rpc("set_quiz_sharing", {
      p_quiz_id: quizId,
      p_shared: shared === "true",
    });
  } catch (error) {
    return { error: errorText(error, "Could not update quiz sharing") };
  }
  if (result.error) {
    return { error: `Could not update quiz sharing: ${result.error.message}` };
  }

  revalidatePath("/library");
  revalidatePath(`/quiz/${quizId}`);
  return {
    shareEnabled: result.data,
    message: result.data ? "Quiz sharing is on." : "Quiz sharing is off.",
  };
}

export async function beginAttempt(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const quizId = formString(formData, "quizId");
  if (!isUuid(quizId)) {
    return { error: "The quiz ID is invalid." };
  }

  const modeValues = formData.getAll("mode");
  if (modeValues.length > 1) {
    return { error: "Choose one valid study mode." };
  }
  const modeResult =
    modeValues.length === 0
      ? studyModeSchema.safeParse("practice")
      : studyModeSchema.safeParse(modeValues[0]);
  if (!modeResult.success) {
    return { error: "Choose a valid study mode." };
  }

  const shuffleValues = formData.getAll("shuffle");
  if (
    shuffleValues.length > 1 ||
    (shuffleValues.length === 1 && shuffleValues[0] !== "on")
  ) {
    return { error: "Shuffle must be enabled or disabled." };
  }

  const rawCategories = formData.getAll("categories");
  if (
    rawCategories.length > 100 ||
    rawCategories.some((value) => typeof value !== "string")
  ) {
    return { error: "Choose no more than 100 valid categories." };
  }
  const categoriesResult = z
    .array(z.string().trim().min(1).max(100))
    .safeParse(rawCategories);
  if (!categoriesResult.success) {
    return { error: "Each category must contain between 1 and 100 characters." };
  }
  const categories = [...new Set(categoriesResult.data)];

  const account = await getActionAccount();
  if (!account.ok) {
    return { error: account.error };
  }

  let result;
  try {
    result = await account.client.rpc("start_attempt", {
      p_quiz_id: quizId,
      p_categories: categories.length > 0 ? categories : null,
      p_shuffle: shuffleValues.length === 1,
      p_mode: modeResult.data,
    });
  } catch (error) {
    return { error: errorText(error, "Could not start the study attempt") };
  }
  if (result.error) {
    return { error: `Could not start the study attempt: ${result.error.message}` };
  }
  if (!isUuid(result.data)) {
    return { error: "The database returned an invalid attempt ID." };
  }

  redirect(`/study/${result.data}`);
}

export async function answerQuestion(
  attemptId: string,
  questionId: string,
  response: QuestionAnswer,
): Promise<
  | { ok: true; feedback: SubmissionFeedback }
  | { ok: false; error: string }
> {
  if (!isUuid(attemptId) || !isUuid(questionId)) {
    return { ok: false, error: "The attempt or question ID is invalid." };
  }
  const parsedResponse = questionAnswerSchema.safeParse(response);
  if (!parsedResponse.success) {
    return { ok: false, error: "Choose a valid answer before submitting." };
  }

  const account = await getActionAccount();
  if (!account.ok) {
    return { ok: false, error: account.error };
  }

  let result;
  try {
    result = await account.client.rpc("submit_answer", {
      p_attempt_id: attemptId,
      p_question_id: questionId,
      p_response: toJson(parsedResponse.data),
    });
  } catch (error) {
    return {
      ok: false,
      error: errorText(error, "Could not submit your answer"),
    };
  }
  if (result.error) {
    return {
      ok: false,
      error: `Could not submit your answer: ${result.error.message}`,
    };
  }

  const feedback = submissionSchema.safeParse(result.data);
  if (!feedback.success) {
    return {
      ok: false,
      error: "The database returned invalid answer feedback.",
    };
  }
  return { ok: true, feedback: feedback.data };
}

export async function revealFlashcard(
  questionId: string,
): Promise<StudyActionResult<FlashcardReveal>> {
  if (!isUuid(questionId)) {
    return { ok: false, error: "The question ID is invalid." };
  }

  const account = await getActionAccount();
  if (!account.ok) {
    return { ok: false, error: account.error };
  }

  let result;
  try {
    result = await account.client.rpc("get_flashcard_answer", {
      p_question_id: questionId,
    });
  } catch (error) {
    return {
      ok: false,
      error: errorText(error, "Could not reveal this flashcard"),
    };
  }
  if (result.error) {
    return {
      ok: false,
      error: `Could not reveal this flashcard: ${result.error.message}`,
    };
  }

  const reveal = flashcardRevealSchema.safeParse(result.data);
  if (!reveal.success) {
    return {
      ok: false,
      error: `The database returned invalid flashcard reveal data: ${reveal.error.message}`,
    };
  }
  if (reveal.data.question_id !== questionId) {
    return {
      ok: false,
      error: "The database returned a reveal for a different question.",
    };
  }
  return { ok: true, value: reveal.data };
}

export async function rateFlashcard(
  questionId: string,
  rating: FlashcardRating,
): Promise<StudyActionResult<FlashcardRating>> {
  if (!isUuid(questionId)) {
    return { ok: false, error: "The question ID is invalid." };
  }
  const parsedRating = flashcardRatingSchema.safeParse(rating);
  if (!parsedRating.success) {
    return { ok: false, error: "Choose either known or review." };
  }

  const account = await getActionAccount();
  if (!account.ok) {
    return { ok: false, error: account.error };
  }

  let result;
  try {
    result = await account.client.rpc("rate_flashcard", {
      p_question_id: questionId,
      p_rating: parsedRating.data,
    });
  } catch (error) {
    return {
      ok: false,
      error: errorText(error, "Could not save your flashcard rating"),
    };
  }
  if (result.error) {
    return {
      ok: false,
      error: `Could not save your flashcard rating: ${result.error.message}`,
    };
  }

  const savedRating = flashcardRatingSchema.safeParse(result.data);
  if (!savedRating.success) {
    return {
      ok: false,
      error: `The database returned an invalid flashcard rating: ${savedRating.error.message}`,
    };
  }
  if (savedRating.data !== parsedRating.data) {
    return {
      ok: false,
      error: "The database saved a different flashcard rating than requested.",
    };
  }
  return { ok: true, value: savedRating.data };
}

export async function submitFullTest(
  attemptId: string,
  responses: FullTestResponse[],
): Promise<StudyActionResult<FullTestFeedback>> {
  if (!isUuid(attemptId)) {
    return { ok: false, error: "The attempt ID is invalid." };
  }
  const parsedResponses = fullTestResponsesSchema.safeParse(responses);
  if (!parsedResponses.success) {
    return {
      ok: false,
      error: `The full-test responses are invalid: ${parsedResponses.error.message}`,
    };
  }

  const account = await getActionAccount();
  if (!account.ok) {
    return { ok: false, error: account.error };
  }

  let result;
  try {
    result = await account.client.rpc("submit_full_test", {
      p_attempt_id: attemptId,
      p_responses: toJson(parsedResponses.data),
    });
  } catch (error) {
    return {
      ok: false,
      error: errorText(error, "Could not submit the full test"),
    };
  }
  if (result.error) {
    return {
      ok: false,
      error: `Could not submit the full test: ${result.error.message}`,
    };
  }

  const feedback = fullTestFeedbackSchema.safeParse(result.data);
  if (!feedback.success) {
    return {
      ok: false,
      error: `The database returned invalid full-test feedback: ${feedback.error.message}`,
    };
  }
  const responseIds = new Set(
    parsedResponses.data.map(({ question_id }) => question_id),
  );
  const feedbackIds = new Set(
    feedback.data.results.map(({ question_id }) => question_id),
  );
  if (
    responseIds.size !== feedbackIds.size ||
    [...responseIds].some((questionId) => !feedbackIds.has(questionId))
  ) {
    return {
      ok: false,
      error: "The database returned incomplete or mismatched full-test feedback.",
    };
  }
  return { ok: true, value: feedback.data };
}
