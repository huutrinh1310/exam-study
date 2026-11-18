"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerQuestion } from "@/app/actions";
import Icon from "@/components/icon";
import type { QuestionAnswer } from "@/lib/quiz";
import type { StudyAttempt } from "@/lib/study";
import { applySubmission, canSubmitAnswer } from "@/lib/study-state";

function firstReviewIndex(attempt: StudyAttempt) {
  if (attempt.answered === attempt.total) return 0;
  const unanswered = attempt.questions.findIndex(({ response }) => response === null);
  return unanswered >= 0 ? unanswered : 0;
}

function answerText(
  question: StudyAttempt["questions"][number],
  answer: QuestionAnswer | null,
) {
  if (answer === null) return "Not answered";
  if (Array.isArray(answer)) {
    return question.choices
      .filter(({ label }) => answer.includes(label))
      .map(({ label, text }) => `${label} · ${text}`)
      .join("; ");
  }
  return question.choices
    .map(({ label, text }) => `${label} ${answer[label] ? "Yes" : "No"} · ${text}`)
    .join("; ");
}

function SelectionInput({
  type,
  name,
  value,
  checked,
  disabled,
  label,
  onChange,
}: {
  type: "checkbox" | "radio";
  name: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={`answer-option${checked ? " is-selected" : ""}`}>
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="answer-option-key">{value}</span>
      <span>{label}</span>
    </label>
  );
}

function Feedback({
  question,
}: {
  question: StudyAttempt["questions"][number];
}) {
  if (!question.feedback) return null;
  const response = question.response;
  const expected = question.feedback.answer;

  return (
    <section
      className={`feedback-card ${question.feedback.correct ? "correct" : "incorrect"}`}
      aria-live="polite"
      aria-labelledby={`feedback-heading-${question.id}`}
    >
      <h3 id={`feedback-heading-${question.id}`}>
        <Icon name={question.feedback.correct ? "check" : "spark"} />
        {question.feedback.correct ? "That’s correct." : "Not quite. Here’s the right answer."}
      </h3>
      <p><strong>Your answer:</strong> {answerText(question, response)}</p>
      <p className="feedback-answer"><strong>Correct answer:</strong> {answerText(question, expected)}</p>
      <p><strong>Explanation:</strong> {question.feedback.explanation || "No explanation was provided for this question."}</p>
    </section>
  );
}

export default function StudySession({
  initialAttempt,
}: {
  initialAttempt: StudyAttempt;
}) {
  const router = useRouter();
  const [localAttempt, setLocalAttempt] = useState(initialAttempt);
  const attempt =
    initialAttempt.id === localAttempt.id &&
    (initialAttempt.answered > localAttempt.answered ||
      (initialAttempt.answered === localAttempt.answered &&
        initialAttempt.completed_at !== null &&
        localAttempt.completed_at === null))
      ? initialAttempt
      : localAttempt;
  const [activeIndex, setActiveIndex] = useState(() => firstReviewIndex(initialAttempt));
  const [drafts, setDrafts] = useState<Record<string, QuestionAnswer>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const question = attempt.questions[activeIndex];
  const draft = question
    ? drafts[question.id] ?? question.response
    : null;
  const isComplete = attempt.answered === attempt.total;

  function setDraft(next: QuestionAnswer) {
    if (!question || question.response !== null || pending) return;
    setDrafts((current) => ({ ...current, [question.id]: next }));
    setError("");
  }

  function submitAnswer() {
    if (
      !question ||
      question.response !== null ||
      !canSubmitAnswer(question, draft)
    ) {
      return;
    }

    const submittedResponse = draft;
    if (!submittedResponse) return;
    setError("");
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof answerQuestion>>;
      try {
        result = await answerQuestion(attempt.id, question.id, submittedResponse);
      } catch {
        setError("We couldn’t submit your answer. Check your connection and try again.");
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLocalAttempt((current) =>
        applySubmission(current, question.id, submittedResponse, result.feedback),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      if (result.feedback.completed) router.refresh();
    });
  }

  if (!question) {
    return (
      <section className="card completion-card">
        <span className="empty-icon"><Icon name="check" /></span>
        <h1>This study set has no questions</h1>
        <p>Return to the quiz overview to choose another study set.</p>
        <div className="completion-actions">
          <Link className="button" href={`/quiz/${attempt.quiz_id}`}>Quiz overview</Link>
          <Link className="button secondary" href="/history">Study history</Link>
        </div>
      </section>
    );
  }

  const isSubmitted = question.response !== null;
  const canSubmit = canSubmitAnswer(question, draft);

  return (
    <>
      {isComplete ? (
        <section className="card completion-card" aria-labelledby="completion-title">
          <span className="empty-icon"><Icon name="check" /></span>
          <span className="eyebrow">Round complete</span>
          <h1 id="completion-title">You made it through.</h1>
          <div className="completion-score">{attempt.correct} / {attempt.total} correct</div>
          <p>
            Every submitted answer is saved. Review any question below or start another round from the quiz overview.
          </p>
          <div className="completion-actions">
            <button type="button" className="button secondary" onClick={() => setActiveIndex(0)}>
              Review answers
            </button>
            <Link className="button" href={`/quiz/${attempt.quiz_id}`}>New attempt</Link>
            <Link className="button quiet" href="/history">Study history</Link>
          </div>
        </section>
      ) : null}
      <div className="study-layout" id="question-review">
        <div className="study-main">
          <div className="study-heading">
            <div>
              <Link className="muted" href={`/quiz/${attempt.quiz_id}`}>← Quiz overview</Link>
              <h1>{attempt.title}</h1>
              <p>{attempt.answered} of {attempt.total} answers submitted</p>
            </div>
            <span className="badge">{question.kind === "yes_no" ? "Yes / no" : question.kind === "multiple" ? "Choose all that apply" : "Choose one"}</span>
          </div>

          <article className="card question-card" aria-labelledby={`question-title-${question.id}`}>
            <div className="question-meta">
              <span>Question {activeIndex + 1} of {attempt.total}</span>
              <span className="badge">{question.category}</span>
            </div>
            <h2 id={`question-title-${question.id}`}>{question.prompt}</h2>
            {question.kind === "yes_no" ? (
              <div className="answer-options" role="group" aria-label="Answer each statement true or false">
                {question.choices.map((choice) => {
                  const current = draft && !Array.isArray(draft) ? draft[choice.label] : undefined;
                  return (
                    <div
                      className="yes-no-row"
                      key={choice.label}
                      role="group"
                      aria-labelledby={`yes-no-prompt-${question.id}-${choice.label}`}
                    >
                      <span id={`yes-no-prompt-${question.id}-${choice.label}`} className="yes-no-statement">{choice.text}</span>
                      <div className="yes-no-choices">
                        {([true, false] as const).map((value) => (
                          <label key={String(value)}>
                            <input
                              type="radio"
                              name={`yes-no-${question.id}-${choice.label}`}
                              value={String(value)}
                              checked={current === value}
                              disabled={isSubmitted || pending}
                              onChange={() => {
                                const next =
                                  draft && !Array.isArray(draft)
                                    ? { ...draft }
                                    : {};
                                next[choice.label] = value;
                                setDraft(next);
                              }}
                            />
                            {value ? "True" : "False"}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="answer-options"
                role={question.kind === "single" ? "radiogroup" : "group"}
                aria-labelledby={`question-title-${question.id}`}
              >
                {question.choices.map((choice) => {
                  const selected =
                    Array.isArray(draft) && draft.includes(choice.label);
                  return (
                    <SelectionInput
                      key={choice.label}
                      type={question.kind === "single" ? "radio" : "checkbox"}
                      name={`answer-${question.id}`}
                      value={choice.label}
                      label={choice.text}
                      checked={selected}
                      disabled={isSubmitted || pending}
                      onChange={() => {
                        if (question.kind === "single") {
                          setDraft([choice.label]);
                        } else {
                          const selections = Array.isArray(draft) ? draft : [];
                          setDraft(
                            selected
                              ? selections.filter((label) => label !== choice.label)
                              : [...selections, choice.label],
                          );
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}

            {error ? <p className="error-status" role="alert">{error}</p> : null}
            {isSubmitted ? <Feedback question={question} /> : null}

            <div className="question-actions">
              <button
                type="button"
                className="button secondary"
                disabled={pending || activeIndex === 0}
                onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
              >
                <Icon name="back" /> Previous
              </button>
              <div className="question-actions-group">
                {!isSubmitted ? (
                  <button
                    type="button"
                    className="button"
                    disabled={pending || !canSubmit}
                    onClick={submitAnswer}
                  >
                    {pending ? "Saving answer…" : "Submit answer"}
                  </button>
                ) : (
                  <span className="badge teal"><Icon name="check" /> Answer saved</span>
                )}
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending || activeIndex >= attempt.total - 1}
                  onClick={() =>
                    setActiveIndex((index) => Math.min(attempt.total - 1, index + 1))
                  }
                >
                  Next <Icon name="arrow" />
                </button>
              </div>
            </div>
          </article>
        </div>

        <aside className="card study-aside" aria-label="Study progress">
          <h2>Round progress</h2>
          <div className="study-counts">
            <div className="study-count"><strong>{attempt.answered}</strong><span>Submitted</span></div>
            <div className="study-count"><strong>{attempt.total - attempt.answered}</strong><span>Remaining</span></div>
            <div className="study-count"><strong>{attempt.correct}</strong><span>Correct</span></div>
            <div className="study-count"><strong>{attempt.total}</strong><span>Total</span></div>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`${attempt.answered} of ${attempt.total} submitted`}
            aria-valuemin={0}
            aria-valuemax={attempt.total}
            aria-valuenow={attempt.answered}
          >
            <span style={{ width: `${attempt.total ? (attempt.answered / attempt.total) * 100 : 0}%` }} />
          </div>
          <h2 style={{ marginTop: 19 }}>Jump to question</h2>
          <div className="navigator-grid">
            {attempt.questions.map((item, index) => {
              const status = item.feedback
                ? item.feedback.correct
                  ? "correct"
                  : "incorrect"
                : item.response
                  ? "answered"
                  : "";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${status}${index === activeIndex ? " current" : ""}`}
                  aria-label={`Question ${index + 1}${item.response ? ", submitted" : ", not submitted"}${index === activeIndex ? ", current" : ""}`}
                  aria-current={index === activeIndex ? "step" : undefined}
                  disabled={pending}
                  onClick={() => {
                    setError("");
                    setActiveIndex(index);
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <p className="study-draft-note">
            Unsubmitted choices aren’t saved if you leave or refresh. Submit an answer to keep it for your next study session.
          </p>
        </aside>
      </div>
    </>
  );
}
