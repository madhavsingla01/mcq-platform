import { BaseQuestionEvaluator } from './BaseQuestionEvaluator.js';

export class TrueFalseEvaluator extends BaseQuestionEvaluator {
  supports(question) {
    return question?.type === 'true_false' || question?.type === 'boolean';
  }

  evaluate({ question, userResponse, options = {} }) {
    const defaultMarks = Number.isFinite(Number(question?.marks)) ? Number(question.marks) : 1;
    const defaultNegativeMarks = Number.isFinite(Number(question?.negativeMarks))
      ? Number(question.negativeMarks)
      : (options.negativeMarking ? (options.negativeMarkValue || 0.25) : 0);

    if (userResponse === undefined || userResponse === null || userResponse === '') {
      return {
        isCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
        marksAwarded: 0,
        feedback: 'Question skipped',
      };
    }

    const normalizeBool = (val) => {
      const s = String(val).trim().toLowerCase();
      if (s === 'true' || s === 't' || s === 'yes' || s === '1') return true;
      if (s === 'false' || s === 'f' || s === 'no' || s === '0') return false;
      return null;
    };

    const userBool = normalizeBool(userResponse);
    const correctBool = normalizeBool(question?.correctAnswer);

    const isCorrect = userBool !== null && userBool === correctBool;
    const marksAwarded = isCorrect ? defaultMarks : -defaultNegativeMarks;

    return {
      isCorrect,
      isPartiallyCorrect: false,
      isSkipped: false,
      marksAwarded,
      feedback: isCorrect ? 'Correct' : 'Incorrect',
    };
  }
}
