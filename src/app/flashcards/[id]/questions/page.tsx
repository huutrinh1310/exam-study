import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import SetupRequired from "@/components/setup-required";
import WorkspaceShell from "@/components/workspace-shell";
import { isUuid } from "@/lib/auth-validation";
import { getAccount, getFlashcardAnswerSheet, getFlashcardDeck } from "@/lib/data";
import type { FlashcardAnswer, FlashcardDeck } from "@/lib/study";
import { getSupabaseConfig } from "@/lib/supabase/config";

type FlashcardQuestionsPageProps = {
  params: Promise<{ id: string }>;
};

function formatAnswer(
  answer: FlashcardAnswer["answer"],
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

export default async function FlashcardQuestionsPage({
  params,
}: FlashcardQuestionsPageProps) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const config = getSupabaseConfig();
  if (!config.ok) return <SetupRequired message={config.error} />;

  const account = await getAccount(`/flashcards/${id}/questions`);
  if (!account.user.email) notFound();

  const [deck, answerSheet] = await Promise.all([
    getFlashcardDeck(id, [], false, false),
    getFlashcardAnswerSheet(id),
  ]);
  const answerByQuestionId = new Map(
    answerSheet.map(({ question_id, answer }) => [question_id, answer]),
  );
  if (
    deck.questions.length !== answerByQuestionId.size ||
    deck.questions.some(({ id: questionId }) => !answerByQuestionId.has(questionId))
  ) {
    throw new Error("Could not load all answers for the flashcard questions.");
  }

  return (
    <WorkspaceShell active="/library" email={account.user.email}>
      <div className="quiz-detail flashcard-questions-page">
        <Link className="back-link" href={`/flashcards/${id}`}>
          ← Back to flashcards
        </Link>
        <div className="quiz-detail-head">
          <div>
            <span className="eyebrow">Flashcards</span>
            <h1>{deck.title}</h1>
            <p className="page-intro">
              All {deck.total} {deck.total === 1 ? "question" : "questions"} in
              this quiz, with answers beside each question.
            </p>
          </div>
        </div>
        {deck.questions.length > 0 ? (
          <ol className="flashcard-question-list">
            {deck.questions.map((question, index) => {
              const answer = answerByQuestionId.get(question.id);
              if (!answer) {
                throw new Error("Could not load an answer for a flashcard question.");
              }

              return (
                <li className="card flashcard-question-item" key={question.id}>
                  <div className="flashcard-question-meta">
                    <span className="badge teal">Question {index + 1}</span>
                    <span className="badge">{question.category}</span>
                  </div>
                  <div className="flashcard-question-content">
                    <div>
                      <h2>{question.prompt}</h2>
                      <ul className="flashcard-choices">
                        {question.choices.map(({ label, text }) => (
                          <li key={label}>
                            <span className="answer-option-key">{label}</span>
                            <span>{text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <aside className="flashcard-question-answer">
                      <h3>Answer</h3>
                      <ul>
                        {formatAnswer(answer, question.choices).map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    </aside>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <section className="card empty-state flashcard-empty">
            <h2>No questions found</h2>
            <p>This quiz does not have any flashcard questions yet.</p>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
