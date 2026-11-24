"use client";

import Link from "next/link";
import { useState } from "react";
import { rateFlashcard, revealFlashcard } from "@/app/actions";
import type { FlashcardDeck, FlashcardRating } from "@/lib/study";
import {
  applyFlashcardRating,
  applyFlashcardReveal,
  type FlashcardSessionState,
} from "@/lib/study-state";

type FlashcardSessionProps = {
  deck: FlashcardDeck;
  categories: string[];
  shuffle: boolean;
  reviewOnly: boolean;
};

function flashcardsHref(
  quizId: string,
  categories: string[],
  shuffle: boolean,
  reviewOnly: boolean,
): string {
  const params = new URLSearchParams();
  for (const category of categories) {
    params.append("categories", category);
  }
  params.set("shuffle", String(shuffle));
  params.set("reviewOnly", String(reviewOnly));
  return `/flashcards/${quizId}?${params.toString()}`;
}

function answerText(
  answer: NonNullable<FlashcardSessionState["reveal"]>["answer"],
  choices: FlashcardDeck["questions"][number]["choices"],
): string[] {
  if (Array.isArray(answer)) {
    return answer.map((label) => {
      const choice = choices.find((item) => item.label === label);
      return choice ? `${label}. ${choice.text}` : label;
    });
  }

  return Object.entries(answer).map(([label, value]) => {
    const choice = choices.find((item) => item.label === label);
    return `${choice?.text ?? label}: ${value ? "True" : "False"}`;
  });
}

export default function FlashcardSession({
  deck,
  categories,
  shuffle,
  reviewOnly,
}: FlashcardSessionProps) {
  const [state, setState] = useState<FlashcardSessionState>({
    questions: deck.questions,
    index: 0,
    reveal: null,
    error: "",
    reviewOnly,
  });
  const [pending, setPending] = useState<"reveal" | "rating" | null>(null);
  const question = state.questions[state.index];
  const allCardsHref = flashcardsHref(deck.quiz_id, categories, shuffle, false);
  const reviewCardsHref = flashcardsHref(deck.quiz_id, categories, shuffle, true);

  async function revealAnswer(questionId: string) {
    setPending("reveal");
    try {
      const result = await revealFlashcard(questionId);
      setState((current) =>
        applyFlashcardReveal(current, questionId, result),
      );
    } catch {
      setState((current) =>
        applyFlashcardReveal(current, questionId, {
          ok: false,
          error: "Could not reveal this flashcard. Please try again.",
        }),
      );
    } finally {
      setPending(null);
    }
  }

  async function saveRating(questionId: string, rating: FlashcardRating) {
    setPending("rating");
    try {
      const result = await rateFlashcard(questionId, rating);
      setState((current) =>
        applyFlashcardRating(current, questionId, result),
      );
    } catch {
      setState((current) =>
        applyFlashcardRating(current, questionId, {
          ok: false,
          error: "Could not save your flashcard rating. Please try again.",
        }),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Link className="back-link" href={`/quiz/${deck.quiz_id}`}>
        ← Back to study set
      </Link>
      <div className="flashcard-heading">
        <div>
          <span className="eyebrow">{reviewOnly ? "Review again" : "Flashcards"}</span>
          <h1 className="page-title">{deck.title}</h1>
          <p className="page-intro">
            Reveal an answer only when you’re ready. Your “Know it” or “Review
            again” rating is saved to your account.
          </p>
        </div>
        <div className="flashcard-shortcuts">
          {reviewOnly ? (
            <Link className="button secondary" href={allCardsHref}>
              Study all cards
            </Link>
          ) : (
            <Link className="button secondary" href={reviewCardsHref}>
              Review cards again
            </Link>
          )}
        </div>
      </div>

      {state.questions.length === 0 ? (
        <section className="card empty-state flashcard-empty">
          <h2>{reviewOnly ? "No cards need review" : "No flashcards found"}</h2>
          <p>
            {reviewOnly
              ? "Cards you mark “Review again” will appear here."
              : "There are no flashcards for these study options."}
          </p>
          {reviewOnly ? (
            <Link className="button secondary" href={allCardsHref}>
              Study all flashcards
            </Link>
          ) : null}
        </section>
      ) : question ? (
        <section className="card flashcard-card" aria-labelledby="flashcard-prompt">
          <div className="flashcard-meta">
            <span className="badge teal">
              Card {state.index + 1} of {state.questions.length}
            </span>
            <span className="badge">{question.category}</span>
            {question.rating ? (
              <span className="badge">
                Previously marked {question.rating === "known" ? "known" : "review"}
              </span>
            ) : null}
          </div>
          <h2 id="flashcard-prompt">{question.prompt}</h2>
          <ul className="flashcard-choices">
            {question.choices.map(({ label, text }) => (
              <li key={label}>
                <span className="answer-option-key">{label}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          {state.error ? (
            <p className="error-status" role="alert">{state.error}</p>
          ) : null}
          {state.reveal ? (
            <div className="flashcard-answer" id="flashcard-answer" aria-live="polite">
              <h3>Answer</h3>
              <ul>
                {answerText(state.reveal.answer, question.choices).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <h3>Explanation</h3>
              <p>{state.reveal.explanation}</p>
            </div>
          ) : (
            <button
              type="button"
              className="button"
              disabled={pending !== null}
              onClick={() => revealAnswer(question.id)}
            >
              {pending === "reveal" ? "Revealing…" : "Reveal answer"}
            </button>
          )}

          {state.reveal ? (
            <div className="flashcard-rating">
              <p>Your rating is saved to your account and can be changed the next time you study this card.</p>
              <div className="flashcard-rating-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending !== null}
                  onClick={() => saveRating(question.id, "review")}
                >
                  {pending === "rating" ? "Saving…" : "Review again"}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={pending !== null}
                  onClick={() => saveRating(question.id, "known")}
                >
                  {pending === "rating" ? "Saving…" : "Know it"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="card empty-state flashcard-empty">
          <h2>You’re all done</h2>
          <p>You’ve reached the end of this flashcard deck.</p>
          <div className="flashcard-completion-actions">
            {reviewOnly ? (
              <Link className="button secondary" href={allCardsHref}>Study all cards</Link>
            ) : (
              <Link className="button secondary" href={reviewCardsHref}>Review cards again</Link>
            )}
            <Link className="button" href={`/quiz/${deck.quiz_id}`}>Back to study set</Link>
          </div>
        </section>
      )}
    </>
  );
}
