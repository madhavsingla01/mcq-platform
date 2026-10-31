import { SingleChoiceEvaluator } from './SingleChoiceEvaluator.js';
import { MultipleChoiceEvaluator } from './MultipleChoiceEvaluator.js';
import { TrueFalseEvaluator } from './TrueFalseEvaluator.js';
import { TextMatchEvaluator } from './TextMatchEvaluator.js';

/**
 * QuestionEvaluationRegistry (SOLID: Open/Closed Principle & Single Responsibility)
 * Resolves the appropriate evaluation strategy based on question metadata.
 * New question types (e.g., Code, Audio, Drag-and-Drop) can be registered here
 * without modifying existing attempt or scoring logic.
 */
class QuestionEvaluationRegistryImpl {
  constructor() {
    this.evaluators = [];
    this.fallbackEvaluator = new SingleChoiceEvaluator();

    // Register built-in evaluators in order of priority
    this.register(new MultipleChoiceEvaluator());
    this.register(new TrueFalseEvaluator());
    this.register(new TextMatchEvaluator());
    this.register(this.fallbackEvaluator);
  }

  /**
   * Register a new question evaluation strategy.
   * @param {BaseQuestionEvaluator} evaluator
   */
  register(evaluator) {
    if (!evaluator || typeof evaluator.supports !== 'function' || typeof evaluator.evaluate !== 'function') {
      throw new Error('Evaluator must implement BaseQuestionEvaluator interface (supports, evaluate)');
    }
    this.evaluators.unshift(evaluator);
  }

  /**
   * Resolve evaluator for a question.
   * @param {Object} question
   * @returns {BaseQuestionEvaluator}
   */
  getEvaluator(question) {
    const found = this.evaluators.find((e) => e.supports(question));
    return found || this.fallbackEvaluator;
  }

  /**
   * Evaluate a question response using the registered strategy.
   * @param {Object} params
   */
  evaluate({ question, userResponse, options = {} }) {
    const evaluator = this.getEvaluator(question);
    return evaluator.evaluate({ question, userResponse, options });
  }
}

export const QuestionEvaluationRegistry = new QuestionEvaluationRegistryImpl();
export default QuestionEvaluationRegistry;
