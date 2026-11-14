import { BaseQuestionEvaluator, type EvaluationInput } from './BaseQuestionEvaluator.js';

export class TextMatchEvaluator extends BaseQuestionEvaluator {
  override supports(question: EvaluationInput['question']) {
    const type = question?.questionType || question?.type;
    return type === 'fill_in_blank' || type === 'short_answer' || type === 'text';
  }

  override evaluate({ question, userResponse, options = {} }: EvaluationInput) {
    const defaultMarks = Number.isFinite(Number(question?.marks)) ? Number(question?.marks) : 1;
    const defaultNegativeMarks = Number.isFinite(Number(question?.negativeMarks))
      ? Number(question?.negativeMarks)
      : (options.negativeMarking ? (options.negativeMarkValue || 0.25) : 0);

    const userText = String(userResponse || '').trim();
    if (!userText) {
      return {
        isCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
        marksAwarded: 0,
        feedback: 'Question skipped',
      };
    }

    const acceptableAnswers = [
      question?.correctAnswer,
      ...(question?.acceptableAnswers || []),
    ].filter(Boolean).map((a) => String(a).trim().toLowerCase());

    const isCaseSensitive = Boolean(question?.isCaseSensitive || options.isCaseSensitive);
    const comparisonText = isCaseSensitive ? userText : userText.toLowerCase();

    const isCorrect = acceptableAnswers.some((ans) => {
      const target = isCaseSensitive ? ans : ans.toLowerCase();
      return comparisonText === target;
    });

    const marksAwarded = isCorrect ? defaultMarks : -defaultNegativeMarks;

    return {
      isCorrect,
      isPartiallyCorrect: false,
      isSkipped: false,
      marksAwarded,
      feedback: isCorrect ? 'Correct answer' : 'Incorrect answer',
    };
  }
}
