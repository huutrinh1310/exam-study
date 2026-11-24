"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { answerQuestion, submitFullTest } from "@/app/actions";
import Icon from "@/components/icon";
import type { QuestionAnswer } from "@/lib/quiz";
import type { StudyAttempt } from "@/lib/study";
import {
  applySubmission,
  buildFullTestResponses,
  canSubmitAnswer,
} from "@/lib/study-state";
import {
  clearTestDraft,
  loadTestDraft,
  saveTestDraft,
  type DraftAnswer,
} from "@/lib/test-draft";

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
  userId,
}: {
  initialAttempt: StudyAttempt;
  userId: string;
}) {
  const router = useRouter();
  const [localAttempt, setLocalAttempt] = useState(initialAttempt);
  const isFullTest = initialAttempt.mode === "full_test";
  const attempt =
    initialAttempt.id === localAttempt.id &&
    (initialAttempt.answered > localAttempt.answered ||
      (initialAttempt.answered === localAttempt.answered &&
        initialAttempt.completed_at !== null &&
        localAttempt.completed_at === null))
      ? initialAttempt
      : localAttempt;
  const [activeIndex, setActiveIndex] = useState(() => firstReviewIndex(initialAttempt));
  const [drafts, setDrafts] = useState<Record<string, DraftAnswer>>({});
  const [draftLoaded, setDraftLoaded] = useState(
    !isFullTest || initialAttempt.completed_at !== null,
  );
  const [draftPersisted, setDraftPersisted] = useState(
    !isFullTest || initialAttempt.completed_at !== null,
  );
  const draftPersistedRef = useRef(
    !isFullTest || initialAttempt.completed_at !== null,
  );
  const [fullTestSubmitted, setFullTestSubmitted] = useState(false);
  const fullTestSubmitInFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isFullTest || attempt.completed_at !== null) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const result = loadTestDraft(
          window.localStorage,
          userId,
          attempt.id,
          attempt.questions,
        );
        if (result.ok) {
          setDrafts(result.value);
          draftPersistedRef.current = true;
          setDraftPersisted(true);
        } else {
          draftPersistedRef.current = false;
          setDraftPersisted(false);
          setError(result.error);
        }
      } catch {
        draftPersistedRef.current = false;
        setDraftPersisted(false);
        setError("Browser storage is unavailable; your saved draft could not be loaded.");
      } finally {
        if (active) setDraftLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [attempt.completed_at, attempt.id, attempt.questions, isFullTest, userId]);

  const question = attempt.questions[activeIndex];
  const draft = question
    ? isFullTest && attempt.completed_at !== null
      ? question.response
      : drafts[question.id] ?? question.response
    : null;
  const isComplete = attempt.answered === attempt.total;

  function setDraft(next: DraftAnswer) {
    if (
      !question ||
      question.response !== null ||
      pending ||
      fullTestSubmitted
    ) {
      return;
    }
    const updatedDrafts = { ...drafts, [question.id]: next };
    setDrafts(updatedDrafts);
    if (isFullTest) {
      try {
        const result = saveTestDraft(
          window.localStorage,
          userId,
          attempt.id,
          attempt.questions,
          updatedDrafts,
        );
        draftPersistedRef.current = result.ok;
        setDraftPersisted(result.ok);
        setError(result.ok ? "" : result.error);
      } catch {
        draftPersistedRef.current = false;
        setDraftPersisted(false);
        setError("Browser storage is unavailable; your draft could not be saved.");
      }
    } else {
      setError("");
    }
  }

  function submitFullTestAttempt() {
    const responses = buildFullTestResponses(
      attempt,
      drafts,
      draftPersistedRef.current,
    );
    if (
      !responses ||
      pending ||
      fullTestSubmitted ||
      fullTestSubmitInFlight.current ||
      !draftLoaded
    ) {
      return;
    }
    fullTestSubmitInFlight.current = true;
    setError("");
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof submitFullTest>>;
      try {
        result = await submitFullTest(attempt.id, responses);
      } catch {
        fullTestSubmitInFlight.current = false;
        setError("We couldn’t submit the full test. Check your connection and try again.");
        return;
      }
      if (!result.ok) {
        fullTestSubmitInFlight.current = false;
        setError(result.error);
        return;
      }

      setFullTestSubmitted(true);
      try {
        const cleared = clearTestDraft(window.localStorage, userId, attempt.id);
        if (!cleared.ok) setError(cleared.error);
      } catch {
        setError("Your test was submitted, but its local draft could not be cleared.");
      }
      router.refresh();
    });
  }

  function submitAnswer() {
    if (
      !question ||
      question.response !== null ||
      !canSubmitAnswer(question, draft)
    ) {
      return;
    }

    const submittedResponse = draft as QuestionAnswer;
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
  const fullTestResponses = isFullTest
    ? buildFullTestResponses(attempt, drafts, draftPersisted)
    : null;
  const fullTestAnswered =
    attempt.completed_at !== null
      ? attempt.answered
      : attempt.questions.filter((item) =>
          canSubmitAnswer(item, drafts[item.id] ?? null),
        ).length;

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
              <p>
                {isFullTest
                  ? `${fullTestAnswered} of ${attempt.total} questions answered`
                  : `${attempt.answered} of ${attempt.total} answers submitted`}
              </p>
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
                              disabled={isSubmitted || pending || fullTestSubmitted || (isFullTest && !draftLoaded)}
                              onChange={() => {
                                const next: Partial<Record<typeof choice.label, boolean>> =
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
                      disabled={isSubmitted || pending || fullTestSubmitted || (isFullTest && !draftLoaded)}
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
            {isSubmitted && (!isFullTest || isComplete) ? (
              <Feedback question={question} />
            ) : null}

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
                {isFullTest ? (
                  !isComplete ? (
                    <button
                      type="button"
                      className="button"
                      disabled={
                        pending ||
                        fullTestSubmitted ||
                        !draftLoaded ||
                        fullTestResponses === null
                      }
                      onClick={submitFullTestAttempt}
                    >
                      {pending ? "Submitting full test…" : "Submit full test"}
                    </button>
                  ) : null
                ) : !isSubmitted ? (
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
            <div className="study-count"><strong>{isFullTest ? fullTestAnswered : attempt.answered}</strong><span>{isFullTest ? "Answered" : "Submitted"}</span></div>
            <div className="study-count"><strong>{attempt.total - (isFullTest ? fullTestAnswered : attempt.answered)}</strong><span>Remaining</span></div>
            {!isFullTest || isComplete ? <div className="study-count"><strong>{attempt.correct}</strong><span>Correct</span></div> : null}
            <div className="study-count"><strong>{attempt.total}</strong><span>Total</span></div>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`${isFullTest ? fullTestAnswered : attempt.answered} of ${attempt.total} ${isFullTest ? "answered" : "submitted"}`}
            aria-valuemin={0}
            aria-valuemax={attempt.total}
            aria-valuenow={isFullTest ? fullTestAnswered : attempt.answered}
          >
            <span style={{ width: `${attempt.total ? ((isFullTest ? fullTestAnswered : attempt.answered) / attempt.total) * 100 : 0}%` }} />
          </div>
          <h2 style={{ marginTop: 19 }}>Jump to question</h2>
          <div className="navigator-grid">
            {attempt.questions.map((item, index) => {
              const showFeedback = !isFullTest || isComplete;
              const status = item.feedback && showFeedback
                ? item.feedback.correct
                  ? "correct"
                  : "incorrect"
                : item.response || drafts[item.id]
                  ? "answered"
                  : "";
              const hasAnswer = item.response !== null || drafts[item.id] !== undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${status}${index === activeIndex ? " current" : ""}`}
                  aria-label={`Question ${index + 1}${hasAnswer ? ", answered" : ", not answered"}${index === activeIndex ? ", current" : ""}`}
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
            {isFullTest
              ? "Your unsubmitted answers are saved only in this browser and will be graded together when you submit the full test."
              : "Unsubmitted choices aren’t saved if you leave or refresh. Submit an answer to keep it for your next study session."}
          </p>
        </aside>
      </div>
    </>
  );
}
