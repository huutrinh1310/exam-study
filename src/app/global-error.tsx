"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f3", color: "#143531", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ width: "min(90%, 500px)", padding: 32, border: "1px solid #e0e9e3", borderRadius: 20, background: "white", textAlign: "center" }}>
          <h1>Clearstudy paused unexpectedly.</h1>
          <p>Try loading your page again. Your saved study data is unchanged.</p>
          <button type="button" onClick={reset} style={{ padding: "12px 18px", border: 0, borderRadius: 10, background: "#176f65", color: "white", font: "inherit", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
