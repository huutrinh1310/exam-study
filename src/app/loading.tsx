export default function Loading() {
  return (
    <main id="main-content" className="loading-layout" aria-label="Loading workspace">
      <div className="skeleton" style={{ width: "34%" }} />
      <div className="skeleton" style={{ width: "58%", height: 38, marginTop: 24 }} />
      <div className="skeleton" style={{ width: "76%" }} />
      <div className="content-grid" style={{ marginTop: 36 }}>
        <div className="card" style={{ padding: 26 }}>
          <div className="skeleton" style={{ width: "40%" }} />
          <div className="skeleton" style={{ width: "88%", marginTop: 22 }} />
          <div className="skeleton" style={{ width: "70%" }} />
        </div>
        <div className="card" style={{ padding: 26 }}>
          <div className="skeleton" style={{ width: "48%" }} />
          <div className="skeleton" style={{ width: "82%", marginTop: 22 }} />
          <div className="skeleton" style={{ width: "67%" }} />
        </div>
      </div>
    </main>
  );
}
