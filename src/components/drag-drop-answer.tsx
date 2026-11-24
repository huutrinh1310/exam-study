"use client";

import { useState, type DragEvent } from "react";
import type { QuestionAnswer } from "@/lib/quiz";
import type { StudyAttempt } from "@/lib/study";
import { applyChoiceDrop, applyYesNoDrop } from "@/lib/drag-drop";

export type DragDropAnswerProps = {
  question: StudyAttempt["questions"][number];
  value: QuestionAnswer | null;
  disabled: boolean;
  onChange(response: QuestionAnswer): void;
};

export default function DragDropAnswer({
  question,
  value,
  disabled,
  onChange,
}: DragDropAnswerProps) {
  const [error, setError] = useState("");

  function applyChoice(label: string) {
    if (disabled) return;
    const result = applyChoiceDrop(question, value, label);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    onChange(result.response);
  }

  function applyYesNo(label: string, nextValue: boolean) {
    if (disabled) return;
    const result = applyYesNoDrop(question, value, label, nextValue);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    onChange(result.response);
  }

  function startChoiceDrag(event: DragEvent<HTMLButtonElement>, label: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", label);
  }

  function dropChoice(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    applyChoice(event.dataTransfer.getData("text/plain"));
  }

  function startYesNoDrag(event: DragEvent<HTMLButtonElement>, label: string, nextValue: boolean) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `${label}:${nextValue}`);
  }

  function dropYesNo(event: DragEvent<HTMLDivElement>, label: string) {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    const [dataLabel, rawValue] = data.split(":");
    if (dataLabel !== label || (rawValue !== "true" && rawValue !== "false")) {
      setError("Drop the True or False token into its matching statement target.");
      return;
    }
    applyYesNo(label, rawValue === "true");
  }

  if (question.kind === "yes_no") {
    const current = value && !Array.isArray(value) ? value : {};
    return (
      <div className="drag-drop-answer" aria-label="Drag and drop yes/no answers">
        {question.choices.map((choice) => {
          const selected = current[choice.label];
          return (
            <div className="drag-yes-no-row" key={choice.label}>
              <div className="drag-yes-no-statement">
                <span className="drag-choice-key">{choice.label}</span>
                <span>{choice.text}</span>
              </div>
              <div
                className="drag-drop-target drag-yes-no-target"
                onDragOver={(event) => !disabled && event.preventDefault()}
                onDrop={(event) => dropYesNo(event, choice.label)}
                role="group"
                aria-label={`Drop True or False for ${choice.label}: ${choice.text}`}
              >
                <span>Drop target</span>
                <strong>{typeof selected === "boolean" ? (selected ? "True" : "False") : "Not set"}</strong>
              </div>
              <div className="drag-token-row" aria-label={`Answer controls for ${choice.label}`}>
                {([true, false] as const).map((nextValue) => (
                  <button
                    key={String(nextValue)}
                    type="button"
                    className={`drag-token${selected === nextValue ? " is-selected" : ""}`}
                    draggable={!disabled}
                    disabled={disabled}
                    aria-pressed={selected === nextValue}
                    onDragStart={(event) => startYesNoDrag(event, choice.label, nextValue)}
                    onClick={() => applyYesNo(choice.label, nextValue)}
                  >
                    {nextValue ? "True" : "False"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {error ? <p className="error-status" role="alert">{error}</p> : null}
      </div>
    );
  }

  const selected = Array.isArray(value) ? value : [];
  return (
    <div className="drag-drop-answer" aria-label="Drag and drop answer choices">
      <div className="drag-choice-tokens" aria-label="Available choices">
        {question.choices.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className={`drag-choice-token${selected.includes(choice.label) ? " is-selected" : ""}`}
            draggable={!disabled}
            disabled={disabled}
            aria-pressed={selected.includes(choice.label)}
            onDragStart={(event) => startChoiceDrag(event, choice.label)}
            onClick={() => applyChoice(choice.label)}
          >
            <span className="drag-choice-key">{choice.label}</span>
            <span>{choice.text}</span>
          </button>
        ))}
      </div>

      <div
        className="drag-drop-target drag-choice-target"
        onDragOver={(event) => !disabled && event.preventDefault()}
        onDrop={dropChoice}
        role="group"
        aria-label={question.kind === "single" ? "Selected answer drop target" : "Selected answers drop target"}
      >
        <span>{question.kind === "single" ? "Selected answer" : "Selected answers"}</span>
        <div className="drag-selected-list">
          {selected.length === 0 ? (
            <strong>Drop a choice here</strong>
          ) : (
            selected.map((label) => {
              const choice = question.choices.find((item) => item.label === label);
              return (
                <button
                  key={label}
                  type="button"
                  className="drag-selected-token"
                  disabled={disabled}
                  onClick={() => applyChoice(label)}
                  aria-label={`Remove ${label}: ${choice?.text ?? "choice"}`}
                >
                  <span>{label}</span>
                  {choice ? <small>{choice.text}</small> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
      {error ? <p className="error-status" role="alert">{error}</p> : null}
    </div>
  );
}
