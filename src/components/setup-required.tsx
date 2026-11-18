import Brand from "@/components/brand";

export default function SetupRequired({
  message,
  title = "Your study space needs a quick setup",
}: {
  message: string;
  title?: string;
}) {
  return (
    <main id="main-content" className="auth-scene">
      <header className="auth-header"><Brand /></header>
      <div className="auth-main">
        <section className="auth-card" aria-labelledby="setup-title">
          <span className="eyebrow">One-time setup</span>
          <h1 id="setup-title">{title}</h1>
          <p>Connect your secure study database to sign in and save your work.</p>
          <div className="warning-status" role="status">{message}</div>
          <p className="form-note" style={{ marginTop: 16 }}>
            Configure these server environment variable names in your deployment
            settings: <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
            <code>NEXT_PUBLIC_SITE_URL</code>. Never paste credentials into this page.
          </p>
        </section>
      </div>
      <footer className="auth-footer">Your study data stays private to your account.</footer>
    </main>
  );
}
