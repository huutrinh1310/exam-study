import Link from "next/link";
import { connection } from "next/server";
import Icon from "@/components/icon";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { getAccount, getHistory } from "@/lib/data";
import { getSupabaseConfig } from "@/lib/supabase/config";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function HistoryPage() {
  await connection();
  const config = getSupabaseConfig();
  if (!config.ok) return <SetupRequired message={config.error} />;

  const [attempts, account] = await Promise.all([
    getHistory(),
    getAccount("/history"),
  ]);
  if (!account.user.email) {
    return <SetupRequired title="We couldn’t verify your account" message="Please sign in again to view your private study history." />;
  }

  return (
    <WorkspaceShell active="/history" email={account.user.email}>
      <span className="eyebrow">Your practice, over time</span>
      <h1 className="page-title">Study history</h1>
      <p className="page-intro">
        Pick up unfinished attempts or revisit submitted answers and their explanations.
      </p>
      {attempts.length ? (
        <div className="history-list">
          {attempts.map((attempt) => {
            const completed = attempt.completed_at !== null;
            const percent = completed && attempt.total > 0
              ? Math.round((attempt.correct / attempt.total) * 100)
              : null;

            return (
              <article className="card history-item" key={attempt.id}>
                <div>
                  <h2 className="history-title">{attempt.title}</h2>
                  <div className="history-meta">
                    <span>{completed ? `Completed ${dateLabel(attempt.completed_at!)}` : `Started ${dateLabel(attempt.created_at)}`}</span>
                    <span>{attempt.answered} of {attempt.total} questions submitted</span>
                    {!completed ? <span className="badge">In progress</span> : <span className="badge teal">Completed</span>}
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`${attempt.answered} of ${attempt.total} questions answered`}
                    aria-valuemin={0}
                    aria-valuemax={attempt.total}
                    aria-valuenow={attempt.answered}
                    style={{ maxWidth: 340, marginTop: 13 }}
                  >
                    <span style={{ width: `${attempt.total ? (attempt.answered / attempt.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="history-item-end">
                  <div className="history-score">
                    {completed ? (
                      <>
                        <strong>{attempt.correct}/{attempt.total}</strong>
                        <span>{percent}% correct</span>
                      </>
                    ) : (
                      <>
                        <strong>{attempt.answered}/{attempt.total}</strong>
                        <span>submitted</span>
                      </>
                    )}
                  </div>
                  <Link className="button secondary" href={`/study/${attempt.id}`}>
                    {completed ? "Review answers" : "Resume"}
                    <Icon name="arrow" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="card empty-state" style={{ marginTop: 28 }}>
          <span className="empty-icon"><Icon name="history" /></span>
          <h2>Your study history will appear here</h2>
          <p>Start a practice round from a quiz in your library. Submitted answers and in-progress attempts will show up here.</p>
          <Link className="button" href="/library">Explore my library <Icon name="arrow" /></Link>
        </section>
      )}
    </WorkspaceShell>
  );
}
