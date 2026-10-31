/**
 * BaseQuestionEvaluator (SOLID: Single Responsibility & Open/Closed Principle)
 * Interface for question evaluation strategies.
 */
export class BaseQuestionEvaluator {
  /**
   * Checks if this evaluator handles the given question type.
   * @param {Object} question
   * @returns {boolean}
   */
  supports(question) {
    throw new Error('supports(question) must be implemented');
  }

  /**
   * Evaluate a student/user response against the question rules.
   * @param {Object} params
   * @param {Object} params.question - Question document or object
   * @param {string|string[]} params.userResponse - Selected answer or answers
   * @param {Object} [params.options] - Settings like negative marking
   * @returns {Object} EvaluationResult { isCorrect, isPartiallyCorrect, marksAwarded, selectedOptionId, correctOptionId, feedback }
   */
  evaluate({ question, userResponse, options = {} }) {
    throw new Error('evaluate(...) must be implemented');
  }
}
