import ImportForm from "@/components/import-form";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { getAccount } from "@/lib/data";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { connection } from "next/server";

export default async function ImportPage() {
  await connection();
  const config = getSupabaseConfig();
  if (!config.ok) {
    return <SetupRequired message={config.error} />;
  }

  const { user } = await getAccount("/import");
  return (
    <WorkspaceShell active="/import" email={user.email ?? ""}>
      <span className="eyebrow">Bring your questions</span>
      <h1 className="page-title">Import a workbook</h1>
      <p className="page-intro">
        Preview what will be saved before adding it to your private library.
      </p>
      <ImportForm />
    </WorkspaceShell>
  );
}
