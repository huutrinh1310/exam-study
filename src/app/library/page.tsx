import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Icon from "@/components/icon";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { getAccount, getLibrary } from "@/lib/data";
import { getSupabaseConfig } from "@/lib/supabase/config";

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function LibraryPage() {
  await connection();
  const config = getSupabaseConfig();
  if (!config.ok) {
    return <SetupRequired message={config.error} />;
  }

  const [quizzes, account] = await Promise.all([
    getLibrary(),
    getAccount("/library"),
  ]);
  if (!account.user.email) redirect("/auth?mode=login&next=%2Flibrary");

  if (!quizzes.length) {
    return (
      <WorkspaceShell active="/library" email={account.user.email}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your workspace</span>
            <h1 className="page-title">My library</h1>
            <p className="page-intro">Your questions, ready when you are.</p>
          </div>
        </div>
        <section className="card empty-state">
          <span className="empty-icon"><Icon name="book" /></span>
          <h2>Your library starts with a workbook</h2>
          <p>
            Import an .xlsx question set to create your first quiz. You’ll get a
            preview and can check every question before saving.
          </p>
          <Link className="button" href="/import">
            <Icon name="upload" />
            Import a workbook
          </Link>
        </section>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell active="/library" email={account.user.email}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your workspace</span>
          <h1 className="page-title">My library</h1>
          <p className="page-intro">Your questions, ready when you are.</p>
        </div>
        <Link className="button" href="/import">
          <Icon name="plus" />
          Import a quiz
        </Link>
      </div>
      <div className="library-toolbar">
        <span className="toolbar-note">{quizzes.length} {quizzes.length === 1 ? "quiz" : "quizzes"}</span>
        <span className="toolbar-note">Only you can see your library.</span>
      </div>
      <div className="content-grid">
        {quizzes.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div className="quiz-card-top">
              <span className="badge teal"><Icon name="book" /> Quiz</span>
              {quiz.is_shared ? <span className="badge">Shared</span> : null}
            </div>
            <div>
              <h2>{quiz.title}</h2>
              <p>{quiz.question_count} {quiz.question_count === 1 ? "question" : "questions"} · Added {formattedDate(quiz.created_at)}</p>
            </div>
            <div className="quiz-card-footer">
              <span className="muted">Build a little momentum.</span>
              <Link className="button secondary" href={`/quiz/${quiz.id}`}>
                Open quiz <Icon name="arrow" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </WorkspaceShell>
  );
}
