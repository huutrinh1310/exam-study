import Link from "next/link";
import Brand from "@/components/brand";
import Icon from "@/components/icon";

const steps = [
  {
    number: "01",
    title: "Bring what you already have",
    description:
      "Import your XLSX question workbook. Clearstudy checks each row and gives you a preview before anything is saved.",
  },
  {
    number: "02",
    title: "Choose your focus",
    description:
      "Pick the topics you want to practice, then start a fresh attempt with questions in a new order if you like.",
  },
  {
    number: "03",
    title: "Learn from every answer",
    description:
      "Submit when you’re ready. See the right answer and explanation, then come back to unfinished attempts any time.",
  },
];

export default function HomePage() {
  return (
    <main id="main-content" className="landing">
      <header className="landing-nav">
        <Brand />
        <nav className="landing-nav-actions" aria-label="Account">
          <Link className="button quiet" href="/auth?mode=login&next=%2Flibrary">
            Sign in
          </Link>
          <Link className="button" href="/auth?mode=signup&next=%2Flibrary">
            Get started
            <Icon name="arrow" />
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="hero-dot" /> A calmer way to prepare</span>
          <h1>Make your next exam feel <em>closer.</em></h1>
          <p>
            Turn the questions you already have into focused practice that fits
            your day. Clear feedback helps every answer move you forward.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/auth?mode=signup&next=%2Flibrary">
              Build your study space
              <Icon name="arrow" />
            </Link>
            <a className="button secondary" href="#how-it-works">See how it works</a>
          </div>
          <div className="hero-trust">
            <Icon name="shield" />
            Your quizzes and progress are private to your account.
          </div>
        </div>

        <div className="hero-art" aria-label="Illustrative practice question preview">
          <div className="practice-card">
            <div className="practice-topline">
              <span className="badge teal">Practice preview</span>
              <span className="practice-dots" aria-hidden="true"><span /><span /><span /></span>
            </div>
            <h2>Which layer routes traffic between networks?</h2>
            <p className="practice-question">Choose one answer to continue.</p>
            <div className="practice-choice"><span>A</span><span>Application layer</span></div>
            <div className="practice-choice selected"><span>B</span><span>Network layer</span></div>
            <div className="practice-choice"><span>C</span><span>Presentation layer</span></div>
            <div className="practice-feedback">
              <Icon name="check" />
              <span>Answer feedback includes the correct key and your explanation.</span>
            </div>
          </div>
          <p className="illustrative-label">Illustrative example · not a saved quiz or personal result</p>
        </div>
      </section>

      <section id="how-it-works" className="landing-section alt">
        <div className="landing-section-inner">
          <div className="landing-section-heading">
            <span className="eyebrow">From workbook to understanding</span>
            <h2>Study with a little more intention.</h2>
            <p>Keep your material, your practice, and your next steps in one quiet workspace.</p>
          </div>
          <div className="step-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-inner landing-cta">
          <div>
            <h2>Start with the questions you have.</h2>
            <p>Your first step is simply bringing your workbook along.</p>
          </div>
          <Link className="button" href="/auth?mode=signup&next=%2Flibrary">
            Create your account
            <Icon name="arrow" />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <Brand />
        <span>Focused practice. A little at a time.</span>
      </footer>
    </main>
  );
}
