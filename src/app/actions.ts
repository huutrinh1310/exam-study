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
import { submissionSchema, type SubmissionFeedback } from "@/lib/study";

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
