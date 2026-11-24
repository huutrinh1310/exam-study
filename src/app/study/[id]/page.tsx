import { notFound } from "next/navigation";
import { connection } from "next/server";
import StudySession from "@/components/study-session";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { getAccount, getAttempt } from "@/lib/data";
import { isUuid } from "@/lib/auth-validation";
import { getSupabaseConfig } from "@/lib/supabase/config";

type StudyPageProps = { params: Promise<{ id: string }> };

export default async function StudyPage({ params }: StudyPageProps) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const config = getSupabaseConfig();
  if (!config.ok) return <SetupRequired message={config.error} />;

  const [attempt, account] = await Promise.all([
    getAttempt(id),
    getAccount(`/study/${id}`),
  ]);
  if (!account.user.email) {
    return <SetupRequired title="We couldn’t verify your account" message="Please sign in again to continue this private study attempt." />;
  }

  return (
    <WorkspaceShell email={account.user.email}>
      <StudySession
        key={attempt.id}
        initialAttempt={attempt}
        userId={account.user.id}
      />
    </WorkspaceShell>
  );
}
