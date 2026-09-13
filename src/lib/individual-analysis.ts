import { type Exam, type ExamAttempt, type ExamAttemptEvidence } from "@/lib/exams";
import { getInsightExamAttemptEvidence } from "@/lib/backend/insights-gateway";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export interface IndividualQuestionEvidence {
  id: string;
  order: number;
  type: string;
  statement: string;
  answer: string;
  correct_answer: string;
  correct: boolean;
}

export interface IndividualAttemptEvidence extends Omit<ExamAttemptEvidence, "questions"> {
  questions: IndividualQuestionEvidence[];
}

function expectedAnswer(exam: Exam, questionId: string) {
  const question = exam.questions.find((item) => item.id === questionId);
  if (!question) return "Resposta de referência não localizada";
  if (question.type === "Múltipla escolha") {
    return question.options[question.correct_index] ?? "Resposta de referência não localizada";
  }
  return question.model_answer?.trim() || "Resposta discursiva sem modelo cadastrado";
}

function productionEvidence(evidence: ExamAttemptEvidence, exam: Exam): IndividualAttemptEvidence {
  const canResolveReference = Array.isArray(exam.questions) && exam.questions.length > 0;
  return {
    ...evidence,
    questions: evidence.questions.map((question) => ({
      ...question,
      correct_answer: canResolveReference
        ? expectedAnswer(exam, question.id)
        : "Resposta de referência restrita ao gestor de provas",
    })),
  };
}

function wrongOption(exam: Exam, questionId: string) {
  const question = exam.questions.find((item) => item.id === questionId);
  if (!question) return "Resposta demonstrativa";
  if (question.type !== "Múltipla escolha") return "Resposta demonstrativa divergente do modelo";
  const candidate = question.options.find((_, index) => index !== question.correct_index);
  return candidate ?? "Resposta demonstrativa";
}

function demoEvidence(attempt: ExamAttempt, exam: Exam): IndividualAttemptEvidence {
  const total = exam.questions.length;
  const score = Math.max(0, Math.min(10, Number(attempt.score || 0)));
  const targetCorrect = total ? Math.max(0, Math.min(total, Math.round((score / 10) * total))) : 0;
  const questions: IndividualQuestionEvidence[] = exam.questions.map((question, index) => {
    const correct = index < targetCorrect;
    const correctAnswer = expectedAnswer(exam, question.id);
    return {
      id: question.id,
      order: index + 1,
      type: question.type,
      statement: question.statement,
      answer: correct ? correctAnswer : wrongOption(exam, question.id),
      correct_answer: correctAnswer,
      correct,
    };
  });
  const correctCount = questions.filter((question) => question.correct).length;
  return {
    attempt_id: attempt.id,
    exam_id: attempt.exam_id,
    exam_title: exam.title,
    employee_name: "Profissional demonstrativo",
    matricula: attempt.matricula,
    sector: "Demonstração",
    score,
    passed: attempt.passed,
    certificate_code: attempt.certificate_code,
    finished_at: attempt.finished_at,
    signed_at: attempt.signed_at,
    signature_name: attempt.signature_name,
    total_questions: total,
    correct_count: correctCount,
    accuracy_pct: total ? Math.round((correctCount / total) * 100) : 0,
    questions,
  };
}

export async function getIndividualAttemptEvidence(attempt: ExamAttempt, exam: Exam): Promise<IndividualAttemptEvidence> {
  if (isDemoModeEnabled()) return demoEvidence(attempt, exam);
  const evidence = await getInsightExamAttemptEvidence(attempt.id);
  return productionEvidence(evidence, exam);
}
