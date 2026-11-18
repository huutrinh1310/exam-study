import Link from "next/link";
import Brand from "@/components/brand";

export default function NotFound() {
  return (
    <main id="main-content" className="auth-scene">
      <header className="auth-header"><Brand /></header>
      <div className="auth-main">
        <section className="auth-card">
          <span className="eyebrow">Not found</span>
          <h1>This page isn’t here.</h1>
          <p>The link may be outdated, or you may not have access to this quiz.</p>
          <Link className="button" href="/library">Go to my library</Link>
        </section>
      </div>
      <footer className="auth-footer">Clear answers. More confident exam days.</footer>
    </main>
  );
}
