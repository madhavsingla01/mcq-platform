import { BaseQuestionEvaluator, type EvaluationInput } from './BaseQuestionEvaluator.js';

export class SingleChoiceEvaluator extends BaseQuestionEvaluator {
  override supports(question: EvaluationInput['question']) {
    const type = question?.type;
    return question?.questionType !== 'checkboxes' && question?.questionType !== 'short_answer'
      && (!type || type === 'single_choice' || type === 'mcq');
  }

  override evaluate({ question, userResponse, options = {} }: EvaluationInput) {
    const defaultMarks = Number.isFinite(Number(question?.marks)) ? Number(question?.marks) : 1;
    const defaultNegativeMarks = Number.isFinite(Number(question?.negativeMarks))
      ? Number(question?.negativeMarks)
      : (options.negativeMarking ? (options.negativeMarkValue || 0.25) : 0);

    const selectedAnswer = userResponse ? String(userResponse).trim() : null;
    const isSkipped = !selectedAnswer;

    if (isSkipped) {
      return {
        isCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
        marksAwarded: 0,
        selectedOptionId: null,
        correctOptionId: this._getCorrectOptionId(question),
        feedback: 'Question skipped',
      };
    }

    const correctAnswer = String(question?.correctAnswer || '').trim();
    const isCorrect = Boolean(selectedAnswer) && selectedAnswer.toLowerCase() === correctAnswer.toLowerCase();

    const selectedOption = (question?.options || []).find(
      (opt) => opt.label === selectedAnswer || opt.key === selectedAnswer || String(opt._id) === selectedAnswer
    );
    const correctOption = (question?.options || []).find(
      (opt) => opt.label === correctAnswer || opt.key === correctAnswer || String(opt._id) === correctAnswer || opt.isCorrect === true
    );

    const marksAwarded = isCorrect ? defaultMarks : -defaultNegativeMarks;

    return {
      isCorrect,
      isPartiallyCorrect: false,
      isSkipped: false,
      marksAwarded,
      selectedOptionId: selectedOption?._id || null,
      correctOptionId: correctOption?._id || null,
      feedback: isCorrect ? 'Correct answer' : 'Incorrect answer',
    };
  }

  _getCorrectOptionId(question: EvaluationInput['question']) {
    const correctAnswer = String(question?.correctAnswer || '').trim();
    const opt = (question?.options || []).find(
      (o) => o.label === correctAnswer || o.key === correctAnswer || o.isCorrect === true
    );
    return opt?._id || null;
  }
}
