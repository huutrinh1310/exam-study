import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import FlashcardSession from "@/components/flashcard-session";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { isUuid } from "@/lib/auth-validation";
import { getAccount, getFlashcardDeck } from "@/lib/data";
import { getSupabaseConfig } from "@/lib/supabase/config";

type SearchParams = Record<string, string | string[] | undefined>;
type FlashcardPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

const categoriesSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(100);

function parseBooleanParam(value: string | string[] | undefined): boolean | null {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export default async function FlashcardPage({
  params,
  searchParams,
}: FlashcardPageProps) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const rawCategories = query.categories;
  const parsedCategories = categoriesSchema.safeParse(
    rawCategories === undefined
      ? []
      : Array.isArray(rawCategories)
        ? rawCategories
        : [rawCategories],
  );
  const shuffle = parseBooleanParam(query.shuffle);
  const reviewOnly = parseBooleanParam(query.reviewOnly);
  if (!parsedCategories.success || shuffle === null || reviewOnly === null) {
    notFound();
  }

  const config = getSupabaseConfig();
  if (!config.ok) return <SetupRequired message={config.error} />;

  const categories = [...new Set(parsedCategories.data)];
  const [deck, account] = await Promise.all([
    getFlashcardDeck(id, categories, reviewOnly, shuffle),
    getAccount(`/flashcards/${id}`),
  ]);
  if (!account.user.email) {
    return (
      <SetupRequired
        title="We couldn’t verify your account"
        message="Please sign in again to continue this private flashcard session."
      />
    );
  }

  return (
    <WorkspaceShell active="/library" email={account.user.email}>
      <div className="quiz-detail">
        <FlashcardSession
          deck={deck}
          categories={categories}
          shuffle={shuffle}
          reviewOnly={reviewOnly}
        />
      </div>
    </WorkspaceShell>
  );
}
