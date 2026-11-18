"use client";

import Link from "next/link";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="global-error">
      <section className="global-error-card">
        <span className="eyebrow">A momentary pause</span>
        <h1>We couldn’t load this page.</h1>
        <p>Your saved study data hasn’t been changed. Try again, or return to your library.</p>
        <div className="completion-actions">
          <button type="button" className="button" onClick={reset}>Try again</button>
          <Link className="button secondary" href="/library">Go to library</Link>
        </div>
      </section>
    </main>
  );
}
