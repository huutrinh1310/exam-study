import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import Icon from "@/components/icon";
import QuizActions from "@/components/quiz-actions";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { getAccount, getQuiz } from "@/lib/data";
import { isUuid } from "@/lib/auth-validation";
import { getSupabaseConfig } from "@/lib/supabase/config";

type QuizPageProps = { params: Promise<{ id: string }> };

export default async function QuizPage({ params }: QuizPageProps) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const config = getSupabaseConfig();
  if (!config.ok) return <SetupRequired message={config.error} />;

  const [quiz, account] = await Promise.all([
    getQuiz(id),
    getAccount(`/quiz/${id}`),
  ]);
  if (!account.user.email) notFound();

  return (
    <WorkspaceShell active="/library" email={account.user.email}>
      <div className="quiz-detail">
        <Link className="back-link" href="/library">← Back to library</Link>
        <div className="quiz-detail-head">
          <div>
            <span className="eyebrow">Study set</span>
            <h1>{quiz.title}</h1>
            <p className="page-intro">
              Choose a topic to focus on, or practice the whole set at your pace.
            </p>
            <div className="quiz-stats">
              <span className="badge teal"><Icon name="book" /> {quiz.question_count} questions</span>
              <span className="badge">{quiz.categories.length} {quiz.categories.length === 1 ? "topic" : "topics"}</span>
              {quiz.is_shared ? <span className="badge lime">Member link enabled</span> : null}
            </div>
          </div>
        </div>
        <QuizActions
          quizId={quiz.id}
          title={quiz.title}
          categories={quiz.categories}
          questionCount={quiz.question_count}
          isOwner={quiz.owner_id === account.user.id}
          initiallyShared={quiz.is_shared}
        />
      </div>
    </WorkspaceShell>
  );
}
