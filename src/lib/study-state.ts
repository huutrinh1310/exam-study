import type { QuestionAnswer } from "./quiz";
import type {
  StudyAttempt,
  SubmissionFeedback,
} from "./study";

type StudyQuestion = StudyAttempt["questions"][number];
type SingleQuestion = Extract<StudyQuestion, { kind: "single" }>;
type MultipleQuestion = Extract<StudyQuestion, { kind: "multiple" }>;
type YesNoQuestion = Extract<StudyQuestion, { kind: "yes_no" }>;

export function canSubmitAnswer(
  question: StudyQuestion,
  answer: QuestionAnswer | null,
): boolean {
  if (answer === null) {
    return false;
  }

  if (question.kind === "yes_no") {
    if (typeof answer !== "object" || Array.isArray(answer)) {
      return false;
    }

    const labels = question.choices.map(({ label }) => label);
    const keys = Object.keys(answer);
    return (
      keys.length === labels.length &&
      labels.every(
        (label) =>
          Object.hasOwn(answer, label) && typeof answer[label] === "boolean",
      ) &&
      keys.every((label) => labels.includes(label as (typeof labels)[number]))
    );
  }

  if (!Array.isArray(answer) || answer.length === 0) {
    return false;
  }

  const labels = question.choices.map(({ label }) => label);
  return (
    (question.kind !== "single" || answer.length === 1) &&
    new Set(answer).size === answer.length &&
    answer.every((label) => labels.includes(label))
  );
}

export function applySubmission(
  attempt: StudyAttempt,
  questionId: string,
  response: QuestionAnswer,
  feedback: SubmissionFeedback,
): StudyAttempt {
  const question = attempt.questions.find(({ id }) => id === questionId);
  if (
    !question ||
    question.response !== null ||
    !canSubmitAnswer(question, response)
  ) {
    return attempt;
  }

  function updateQuestion(current: StudyQuestion): StudyQuestion {
    if (current.id !== questionId) return current;
    if (current.kind === "single") {
      return {
        ...current,
        response: response as SingleQuestion["response"],
        feedback: feedback as SingleQuestion["feedback"],
      };
    }
    if (current.kind === "multiple") {
      return {
        ...current,
        response: response as MultipleQuestion["response"],
        feedback: feedback as MultipleQuestion["feedback"],
      };
    }
    return {
      ...current,
      response: response as YesNoQuestion["response"],
      feedback: feedback as YesNoQuestion["feedback"],
    };
  }

  return {
    ...attempt,
    answered: attempt.answered + 1,
    correct: attempt.correct + Number(feedback.correct),
    questions: attempt.questions.map(updateQuestion),
  };
}
