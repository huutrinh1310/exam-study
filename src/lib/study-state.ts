import type { QuestionAnswer } from "./quiz";
import type {
  FlashcardDeck,
  FlashcardRating,
  FlashcardReveal,
  FullTestResponse,
  StudyActionResult,
  StudyAttempt,
  SubmissionFeedback,
} from "./study";
import type { DraftAnswer } from "./test-draft";

export type FlashcardSessionState = {
  questions: FlashcardDeck["questions"];
  index: number;
  reveal: FlashcardReveal | null;
  error: string;
};

type StudyQuestion = StudyAttempt["questions"][number];
type SingleQuestion = Extract<StudyQuestion, { kind: "single" }>;
type MultipleQuestion = Extract<StudyQuestion, { kind: "multiple" }>;
type YesNoQuestion = Extract<StudyQuestion, { kind: "yes_no" }>;

export function canSubmitAnswer(
  question: StudyQuestion,
  answer: DraftAnswer | null,
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

export function buildFullTestResponses(
  attempt: StudyAttempt,
  drafts: Record<string, DraftAnswer>,
): FullTestResponse[] | null {
  if (
    attempt.mode !== "full_test" ||
    attempt.questions.length === 0 ||
    Object.keys(drafts).some(
      (questionId) =>
        !attempt.questions.some((question) => question.id === questionId),
    )
  ) {
    return null;
  }

  const responses: FullTestResponse[] = [];
  for (const question of attempt.questions) {
    const draft = drafts[question.id];
    if (question.response !== null || !canSubmitAnswer(question, draft ?? null)) {
      return null;
    }
    responses.push({
      question_id: question.id,
      response: draft as QuestionAnswer,
    });
  }
  return responses;
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

export function applyFlashcardReveal(
  state: FlashcardSessionState,
  questionId: string,
  result: StudyActionResult<FlashcardReveal>,
): FlashcardSessionState {
  const activeQuestion = state.questions[state.index];
  if (!activeQuestion || activeQuestion.id !== questionId) {
    return state;
  }
  if (!result.ok) {
    return { ...state, error: result.error };
  }
  if (result.value.question_id !== questionId) {
    return { ...state, error: "The answer returned for a different question." };
  }

  return { ...state, reveal: result.value, error: "" };
}

export function applyFlashcardRating(
  state: FlashcardSessionState,
  questionId: string,
  result: StudyActionResult<FlashcardRating>,
): FlashcardSessionState {
  const activeQuestion = state.questions[state.index];
  if (
    !activeQuestion ||
    activeQuestion.id !== questionId ||
    state.reveal?.question_id !== questionId
  ) {
    return state;
  }
  if (!result.ok) {
    return { ...state, error: result.error };
  }

  return {
    ...state,
    questions: state.questions.map((question) =>
      question.id === questionId
        ? { ...question, rating: result.value }
        : question,
    ),
    index: state.index + 1,
    reveal: null,
    error: "",
  };
}
