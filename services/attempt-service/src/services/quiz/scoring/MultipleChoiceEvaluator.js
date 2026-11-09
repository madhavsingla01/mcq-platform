import { BaseQuestionEvaluator } from './BaseQuestionEvaluator.js';

export class MultipleChoiceEvaluator extends BaseQuestionEvaluator {
  supports(question) {
    return question?.questionType === 'checkboxes' || question?.type === 'multiple_choice' || question?.type === 'multi_select';
  }

  evaluate({ question, userResponse, options = {} }) {
    const defaultMarks = Number.isFinite(Number(question?.marks)) ? Number(question.marks) : 1;
    const defaultNegativeMarks = Number.isFinite(Number(question?.negativeMarks))
      ? Number(question.negativeMarks)
      : (options.negativeMarking ? (options.negativeMarkValue || 0.25) : 0);

    const userAnswers = (Array.isArray(userResponse) ? userResponse : String(userResponse || '').split(','))
      .map(answer => String(answer).trim().toLowerCase())
      .filter(Boolean);

    if (userAnswers.length === 0) {
      return {
        isCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
        marksAwarded: 0,
        selectedOptionId: null,
        correctOptionId: null,
        feedback: 'Question skipped',
      };
    }

    // Determine correct answers from question.options or correctAnswer array/string
    const correctAnswers = (question?.options || [])
      .filter((opt) => opt.isCorrect === true)
      .map((opt) => String(opt.label || opt.key).trim().toLowerCase());

    if (correctAnswers.length === 0 && question?.correctAnswer) {
      const split = String(question.correctAnswer)
        .split(/[,;|]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      correctAnswers.push(...split);
    }

    const correctSelected = userAnswers.filter((ans) => correctAnswers.includes(ans));
    const incorrectSelected = userAnswers.filter((ans) => !correctAnswers.includes(ans));

    const isFullyCorrect = correctSelected.length === correctAnswers.length && incorrectSelected.length === 0;
    const isPartiallyCorrect = !isFullyCorrect && correctSelected.length > 0 && incorrectSelected.length === 0;

    let marksAwarded = 0;
    if (isFullyCorrect) {
      marksAwarded = defaultMarks;
    } else if (isPartiallyCorrect && options.allowPartialCredit !== false) {
      marksAwarded = Number(((correctSelected.length / correctAnswers.length) * defaultMarks).toFixed(2));
    } else {
      marksAwarded = -defaultNegativeMarks;
    }

    return {
      isCorrect: isFullyCorrect,
      isPartiallyCorrect,
      isSkipped: false,
      marksAwarded,
      feedback: isFullyCorrect
        ? 'All correct options selected'
        : isPartiallyCorrect
        ? `Partially correct (${correctSelected.length}/${correctAnswers.length})`
        : 'Incorrect options selected',
    };
  }
}
