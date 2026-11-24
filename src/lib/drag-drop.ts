import type { QuestionAnswer } from "./quiz";
import type { StudyAttempt } from "./study";

export type DropResult =
  | { ok: true; response: QuestionAnswer }
  | { ok: false; error: string };

type StudyQuestion = StudyAttempt["questions"][number];

function invalid(error: string): DropResult {
  return { ok: false, error };
}

export function applyChoiceDrop(
  question: StudyQuestion,
  current: QuestionAnswer | null,
  label: string,
): DropResult {
  if (question.kind === "yes_no") {
    return invalid("Choice drops are not valid for yes/no questions.");
  }

  const available = question.choices.map((choice) => choice.label);
  if (!available.includes(label as (typeof available)[number])) {
    return invalid(`Unknown choice label: ${label}`);
  }

  if (current !== null && (!Array.isArray(current) || current.some((item) => typeof item !== "string"))) {
    return invalid("The current answer is incompatible with this choice question.");
  }

  if (Array.isArray(current)) {
    if (question.kind === "single" && current.length !== 1) {
      return invalid("The current answer must contain exactly one choice label.");
    }

    if (
      new Set(current).size !== current.length ||
      current.some((item) => !available.includes(item as (typeof available)[number]))
    ) {
      return invalid("The current answer contains invalid or duplicate choice labels.");
    }
  }

  if (question.kind === "single") {
    return { ok: true, response: [label] as QuestionAnswer };
  }

  const selections = Array.isArray(current) ? current : [];
  const next = selections.includes(label as (typeof selections)[number])
    ? selections.filter((item) => item !== label)
    : [...selections, label];

  return { ok: true, response: next as QuestionAnswer };
}

export function applyYesNoDrop(
  question: StudyQuestion,
  current: QuestionAnswer | null,
  label: string,
  value: boolean,
): DropResult {
  if (question.kind !== "yes_no") {
    return invalid("True/False drops are only valid for yes/no questions.");
  }

  const available = question.choices.map((choice) => choice.label);
  if (!available.includes(label as (typeof available)[number])) {
    return invalid(`Unknown choice label: ${label}`);
  }
  if (typeof value !== "boolean") {
    return invalid("Yes/no drops require a boolean value.");
  }

  if (current !== null && (Array.isArray(current) || typeof current !== "object")) {
    return invalid("The current answer is incompatible with this yes/no question.");
  }

  const base = current === null ? {} : current;
  const keys = Object.keys(base);
  if (
    keys.some((key) => !available.includes(key as (typeof available)[number])) ||
    keys.some((key) => typeof (base as Record<string, unknown>)[key] !== "boolean")
  ) {
    return invalid("The current answer contains invalid yes/no values.");
  }

  return {
    ok: true,
    response: { ...base, [label]: value } as QuestionAnswer,
  };
}
