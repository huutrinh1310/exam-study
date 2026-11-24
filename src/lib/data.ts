import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { isUuid, safeRedirectPath } from "./auth-validation";
import {
  attemptSchema,
  attemptSummarySchema,
  flashcardDeckSchema,
  quizOverviewSchema,
  type AttemptSummary,
  type FlashcardDeck,
  type ParsedStudyAttempt,
  type QuizOverview,
} from "./study";
import { createSupabaseServerClient } from "./supabase/server";
import { SupabaseConfigurationError } from "./supabase/config";

export type QuizRow = Pick<
  Database["public"]["Tables"]["quizzes"]["Row"],
  "id" | "title" | "created_at" | "is_shared" | "question_count" | "owner_id"
>;

const historySchema = z.array(attemptSummarySchema);

function dataError(operation: string, message: string): Error {
  return new Error(`${operation}: ${message}`);
}

type VerifiedAccount =
  | { ok: true; client: SupabaseClient<Database>; user: User }
  | { ok: false; reason: "missing" | "unverified" | "error"; message?: string };

const getVerifiedAccount = cache(async (): Promise<VerifiedAccount> => {
  let client: SupabaseClient<Database>;
  try {
    client = await createSupabaseServerClient();
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message:
        error instanceof SupabaseConfigurationError
          ? error.message
          : "Could not connect to your account.",
    };
  }

  const { data, error } = await client.auth.getUser();
  if (error) {
    if (
      error.name === "AuthSessionMissingError" ||
      error.status === 401 ||
      error.code === "session_not_found" ||
      error.code === "refresh_token_not_found"
    ) {
      return { ok: false, reason: "missing" };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  if (!data.user) {
    return { ok: false, reason: "missing" };
  }
  if (!data.user.email_confirmed_at) {
    return { ok: false, reason: "unverified" };
  }
  return { ok: true, client, user: data.user };
});

export async function getAccount(
  nextPath = "/library",
): Promise<{ client: SupabaseClient<Database>; user: User }> {
  const account = await getVerifiedAccount();
  if (!account.ok && (account.reason === "missing" || account.reason === "unverified")) {
    const next = encodeURIComponent(safeRedirectPath(nextPath, "/library"));
    const verification = account.reason === "unverified" ? "&error=verification-required" : "";
    redirect(`/auth?mode=login&next=${next}${verification}`);
  }
  if (!account.ok) {
    throw dataError("Could not verify your account", account.message ?? "Account verification failed.");
  }
  return account;
}

export async function getLibrary(): Promise<QuizRow[]> {
  const { client, user } = await getAccount("/library");
  const { data, error } = await client
    .from("quizzes")
    .select("id,title,created_at,is_shared,question_count,owner_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw dataError("Could not load your quiz library", error.message);
  }
  return data;
}

export async function getQuiz(id: string): Promise<QuizOverview> {
  if (!isUuid(id)) {
    throw dataError("Could not load quiz", "The quiz ID is invalid.");
  }

  const { client } = await getAccount(`/quiz/${id}`);
  const { data, error } = await client.rpc("get_quiz_for_study", {
    p_quiz_id: id,
  });
  if (error) {
    throw dataError("Could not load quiz", error.message);
  }

  const parsed = quizOverviewSchema.safeParse(data);
  if (!parsed.success) {
    throw dataError("Could not load quiz", "The database returned invalid quiz data.");
  }
  return parsed.data;
}

export async function getAttempt(id: string): Promise<ParsedStudyAttempt> {
  if (!isUuid(id)) {
    throw dataError("Could not load attempt", "The attempt ID is invalid.");
  }

  const { client } = await getAccount(`/study/${id}`);
  const { data, error } = await client.rpc("get_attempt", {
    p_attempt_id: id,
  });
  if (error) {
    throw dataError("Could not load attempt", error.message);
  }

  const parsed = attemptSchema.safeParse(data);
  if (!parsed.success) {
    throw dataError("Could not load attempt", "The database returned invalid attempt data.");
  }
  return parsed.data;
}

export async function getFlashcardDeck(
  quizId: string,
  categories: string[],
  reviewOnly: boolean,
  shuffle: boolean,
): Promise<FlashcardDeck> {
  if (!isUuid(quizId)) {
    throw dataError("Could not load flashcards", "The quiz ID is invalid.");
  }

  const parsedCategories = z
    .array(z.string().trim().min(1).max(100))
    .max(100)
    .safeParse(categories);
  if (
    !parsedCategories.success ||
    typeof reviewOnly !== "boolean" ||
    typeof shuffle !== "boolean"
  ) {
    throw dataError("Could not load flashcards", "The study options are invalid.");
  }

  const { client } = await getAccount(`/quiz/${quizId}`);
  const { data, error } = await client.rpc("get_flashcard_deck", {
    p_quiz_id: quizId,
    p_categories:
      parsedCategories.data.length > 0
        ? [...new Set(parsedCategories.data)]
        : null,
    p_review_only: reviewOnly,
    p_shuffle: shuffle,
  });
  if (error) {
    throw dataError("Could not load flashcards", error.message);
  }

  const parsed = flashcardDeckSchema.safeParse(data);
  if (!parsed.success) {
    throw dataError("Could not load flashcards", parsed.error.message);
  }
  if (parsed.data.quiz_id !== quizId) {
    throw dataError(
      "Could not load flashcards",
      "The database returned flashcards for a different quiz.",
    );
  }
  return parsed.data;
}

export async function getHistory(): Promise<AttemptSummary[]> {
  const { client } = await getAccount("/history");
  const { data, error } = await client.rpc("list_my_attempts");
  if (error) {
    throw dataError("Could not load study history", error.message);
  }

  const parsed = historySchema.safeParse(data);
  if (!parsed.success) {
    throw dataError("Could not load study history", "The database returned invalid history data.");
  }
  return parsed.data;
}
