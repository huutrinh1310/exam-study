"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { beginAttempt, toggleSharing } from "@/app/actions";
import type { ActionState } from "@/lib/action-types";
import Icon from "@/components/icon";

function StartAttemptForm({
  quizId,
  categories,
  questionCount,
}: {
  quizId: string;
  categories: string[];
  questionCount: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    beginAttempt,
    {},
  );

  return (
    <section className="card quiz-option-card">
      <span className="eyebrow">Make it yours</span>
      <h2>Set up a practice round</h2>
      {questionCount > 0 ? (
        <form action={formAction} className="form-stack">
          <input type="hidden" name="quizId" value={quizId} />
          {categories.length ? (
            <fieldset className="category-fieldset">
              <legend>Choose topics <span className="muted">(optional)</span></legend>
              <p className="form-note">Leave all topics unchecked to practice the full set.</p>
              <div className="category-list">
                {categories.map((category) => (
                  <label className="category-item" key={category}>
                    <input type="checkbox" name="categories" value={category} />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="check-row">
            <input type="checkbox" name="shuffle" />
            <span>Shuffle the questions in this attempt</span>
          </label>
          {state.error ? <p className="error-status" role="alert">{state.error}</p> : null}
          <button type="submit" className="button" disabled={pending}>
            {pending ? "Starting your round…" : "Start studying"}
            <Icon name="arrow" />
          </button>
        </form>
      ) : (
        <p className="warning-status">This quiz currently has no questions to practice.</p>
      )}
    </section>
  );
}

function SharingPanel({
  quizId,
  initiallyShared,
}: {
  quizId: string;
  initiallyShared: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    toggleSharing,
    {},
  );
  const [shareUrl, setShareUrl] = useState("");
  const [copyError, setCopyError] = useState("");
  const urlInput = useRef<HTMLInputElement>(null);
  const enabled = state.shareEnabled ?? initiallyShared;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShareUrl(enabled ? `${window.location.origin}/quiz/${quizId}` : "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, quizId]);

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyError("");
    } catch {
      setCopyError("Copy isn’t available here. Select and copy the link below.");
      urlInput.current?.focus();
      urlInput.current?.select();
    }
  }

  return (
    <section className="card quiz-option-card share-card">
      <span className="eyebrow">For your group</span>
      <h2>Share this quiz</h2>
      <p>
        {enabled
          ? "People with the member link can open the questions. This link is not listed publicly."
          : "Enable a member-only link for people you choose to share it with."}
      </p>
      <form action={formAction} className="form-stack">
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="shared" value={enabled ? "false" : "true"} />
        {state.error ? <p className="error-status" role="alert">{state.error}</p> : null}
        {state.message ? <p className="status" role="status">{state.message}</p> : null}
        {enabled ? (
          <>
            <p className="warning-status">
              Revoking access prevents existing members from opening questions. Their own study history remains theirs.
            </p>
            <label className="field-label" htmlFor={`share-link-${quizId}`}>Member link</label>
            <input
              ref={urlInput}
              id={`share-link-${quizId}`}
              className="share-url"
              type="url"
              readOnly
              value={shareUrl}
              placeholder="Preparing your link…"
              onFocus={(event) => event.currentTarget.select()}
            />
            {copyError ? <p className="error-status" role="status">{copyError}</p> : null}
            <div className="import-actions">
              <button type="button" className="button secondary" onClick={copyLink} disabled={!shareUrl}>
                <Icon name="copy" /> Copy link
              </button>
              <button type="submit" className="button danger" disabled={pending}>
                {pending ? "Revoking…" : "Revoke link"}
              </button>
            </div>
          </>
        ) : (
          <button type="submit" className="button secondary" disabled={pending}>
            {pending ? "Enabling…" : "Enable member link"}
          </button>
        )}
      </form>
    </section>
  );
}

export default function QuizActions({
  quizId,
  categories,
  questionCount,
  isOwner,
  initiallyShared,
}: {
  quizId: string;
  title: string;
  categories: string[];
  questionCount: number;
  isOwner: boolean;
  initiallyShared: boolean;
}) {
  return (
    <div className="quiz-detail-grid">
      <StartAttemptForm
        quizId={quizId}
        categories={categories}
        questionCount={questionCount}
      />
      {isOwner ? (
        <SharingPanel quizId={quizId} initiallyShared={initiallyShared} />
      ) : (
        <section className="card quiz-option-card">
          <span className="eyebrow">Shared with you</span>
          <h2>Start when you’re ready</h2>
          <p className="muted">
            You can practice this quiz, and any attempt history will stay private to your account.
          </p>
        </section>
      )}
    </div>
  );
}
