"use client";

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { previewImport, saveImport } from "@/app/actions";
import type { ImportState } from "@/lib/action-types";
import { MAX_FILE_BYTES } from "@/lib/auth-validation";

function countKinds(questions: NonNullable<ImportState["questions"]>) {
  return questions.reduce(
    (counts, question) => {
      counts[question.kind] += 1;
      return counts;
    },
    { single: 0, multiple: 0, yes_no: 0 },
  );
}

export default function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<ImportState | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setNotice(
      selected && selected.size > MAX_FILE_BYTES
        ? "This workbook is larger than the 4 MB upload limit."
        : "",
    );
  }

  function makeFormData(): FormData {
    const formData = new FormData();
    if (file) formData.set("file", file);
    formData.set("title", title);
    return formData;
  }

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setNotice("Choose an .xlsx workbook before previewing.");
      return;
    }

    setNotice("");
    startTransition(async () => {
      try {
        setPreview(await previewImport({}, makeFormData()));
      } catch {
        setNotice("We couldn’t preview the workbook. Check your connection and try again.");
      }
    });
  }

  function saveQuiz() {
    if (!isPreviewReady || !file) return;

    setNotice("");
    startTransition(async () => {
      try {
        const result = await saveImport({}, makeFormData());
        setPreview(result);
        if (result.error) setNotice(result.error);
      } catch {
        setNotice("We couldn’t save this quiz. Your workbook is still selected; please try again.");
      }
    });
  }

  const questions = preview?.questions ?? [];
  const errors = preview?.errors ?? [];
  const isPreviewReady =
    Boolean(file) &&
    questions.length > 0 &&
    errors.length === 0 &&
    !preview?.error &&
    !notice &&
    title.trim().length > 0;
  const counts = countKinds(questions);

  return (
    <div className="import-layout">
      <section className="card import-panel">
        <h2>Quiz details</h2>
        <p>Choose a title and an .xlsx workbook with your question rows.</p>
        <form className="form-stack" onSubmit={handlePreview}>
          <label>
            Quiz title
            <input
              name="title"
              type="text"
              autoComplete="off"
              maxLength={120}
              placeholder="For example, Network fundamentals"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            Workbook
            <input
              name="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFileChange}
              required
            />
          </label>
          <span className="form-note">.xlsx only · Up to 4 MB · 1,000 questions maximum</span>
          {file ? (
            <p className="status" role="status">
              Selected: <strong>{file.name}</strong> · {(file.size / 1024).toFixed(0)} KB
            </p>
          ) : null}
          {notice ? <p className="error-status" role="alert">{notice}</p> : null}
          {preview?.error && !notice ? (
            <p className="error-status" role="alert">{preview.error}</p>
          ) : null}
          {preview?.message ? <p className="status" role="status">{preview.message}</p> : null}
          <div className="import-actions">
            <button type="submit" className="button" disabled={pending || !file}>
              {pending ? "Checking workbook…" : "Preview questions"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={pending || !isPreviewReady}
              onClick={saveQuiz}
            >
              {pending ? "Saving…" : "Save quiz"}
            </button>
          </div>
        </form>

        {preview ? (
          <div className="import-preview" aria-live="polite">
            <h3>Workbook preview</h3>
            {preview.fileName ? <p className="muted">{preview.fileName}</p> : null}
            <div className="preview-counts">
              <span className="badge teal">{questions.length} accepted</span>
              <span className="badge">{counts.single} single choice</span>
              <span className="badge">{counts.multiple} multiple choice</span>
              <span className="badge">{counts.yes_no} yes / no</span>
              {errors.length ? <span className="badge">{errors.length} row issues</span> : null}
            </div>
            {errors.length ? (
              <ul className="import-errors" aria-label="Workbook row errors">
                {errors.map((error, index) => (
                  <li key={`${error.row}-${index}`}>
                    {error.row > 0 ? `Row ${error.row}: ` : ""}{error.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {questions.length ? (
              <div className="preview-questions" aria-label="First five accepted questions">
                {questions.slice(0, 5).map((question, index) => (
                  <article className="preview-question" key={`${index}-${question.prompt}`}>
                    <strong>{index + 1}. {question.prompt}</strong>
                    <p>{question.category} · {question.kind === "yes_no" ? "Yes / no" : question.kind === "multiple" ? "Multiple choice" : "Single choice"}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <aside className="card import-rules">
        <span className="empty-icon"><span aria-hidden="true">.xlsx</span></span>
        <h2>A careful preview, before save</h2>
        <ul>
          <li>Your workbook is checked on the server before it can be saved.</li>
          <li>Every row issue is listed so you can correct the source file.</li>
          <li>Saving rechecks the selected workbook; preview data is never trusted as saved content.</li>
          <li>Your unsaved workbook stays selected while you review it.</li>
        </ul>
      </aside>
    </div>
  );
}
