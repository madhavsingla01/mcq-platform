import { describe, it, expect } from '@jest/globals';
import { ParserRegistry } from '../src/services/parser/strategies/ParserRegistry.js';
import { BaseParserStrategy } from '../src/services/parser/strategies/BaseParserStrategy.js';
import { QuestionEvaluationRegistry } from '../src/services/quiz/scoring/QuestionEvaluationRegistry.js';
import { BaseQuestionEvaluator } from '../src/services/quiz/scoring/BaseQuestionEvaluator.js';
import { TimerStrategyFactory } from '../src/services/quiz/timer/TimerStrategyFactory.js';
import { StrictTimerStrategy } from '../src/services/quiz/timer/StrictTimerStrategy.js';
import { SoftTimerStrategy } from '../src/services/quiz/timer/SoftTimerStrategy.js';
import { NoTimerStrategy } from '../src/services/quiz/timer/NoTimerStrategy.js';

describe('SOLID Architecture Verification', () => {
  describe('Open/Closed Principle (OCP) - Parser Strategy Engine', () => {
    it('should resolve built-in strategies for xlsx, csv, and json', () => {
      expect(ParserRegistry.getStrategy('xlsx')).toBeDefined();
      expect(ParserRegistry.getStrategy('csv')).toBeDefined();
      expect(ParserRegistry.getStrategy('json')).toBeDefined();
    });

    it('should throw AppError when an unsupported type is requested', () => {
      expect(() => ParserRegistry.getStrategy('unknown_xyz')).toThrow(/unsupported file type/i);
    });

    it('should allow registering new parser strategies without modifying existing codebase', () => {
      class MarkdownParserStrategy extends BaseParserStrategy {
        supports(fileType) {
          return fileType === 'md' || fileType === 'markdown';
        }
        async parse(filePath) {
          return { headers: ['question', 'answer'], rows: [{ question: 'Sample MD?', answer: 'A' }] };
        }
      }

      ParserRegistry.register(new MarkdownParserStrategy());

      const strategy = ParserRegistry.getStrategy('md');
      expect(strategy).toBeDefined();
      expect(strategy).toBeInstanceOf(MarkdownParserStrategy);
    });
  });

  describe('Single Responsibility & OCP - Question Evaluation Strategy Engine', () => {
    it('should correctly evaluate standard single-choice question', () => {
      const question = {
        type: 'single_choice',
        correctAnswer: 'A',
        marks: 2,
        negativeMarks: 0.5,
        options: [
          { _id: 'opt_1', label: 'A', text: 'Option A' },
          { _id: 'opt_2', label: 'B', text: 'Option B' },
        ],
      };

      // Correct answer
      const resCorrect = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: 'A',
      });
      expect(resCorrect.isCorrect).toBe(true);
      expect(resCorrect.marksAwarded).toBe(2);
      expect(resCorrect.selectedOptionId).toBe('opt_1');

      // Incorrect answer
      const resIncorrect = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: 'B',
      });
      expect(resIncorrect.isCorrect).toBe(false);
      expect(resIncorrect.marksAwarded).toBe(-0.5);

      // Skipped question
      const resSkipped = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: null,
      });
      expect(resSkipped.isSkipped).toBe(true);
      expect(resSkipped.marksAwarded).toBe(0);
    });

    it('should evaluate multiple choice question with partial credit', () => {
      const question = {
        type: 'multiple_choice',
        marks: 4,
        options: [
          { label: 'A', isCorrect: true },
          { label: 'B', isCorrect: true },
          { label: 'C', isCorrect: false },
        ],
      };

      // Full credit
      const fullRes = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: ['A', 'B'],
      });
      expect(fullRes.isCorrect).toBe(true);
      expect(fullRes.marksAwarded).toBe(4);

      // Partial credit (selected 1 out of 2 correct)
      const partialRes = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: ['A'],
        options: { allowPartialCredit: true },
      });
      expect(partialRes.isPartiallyCorrect).toBe(true);
      expect(partialRes.marksAwarded).toBe(2);
    });

    it('should evaluate true/false boolean question', () => {
      const question = {
        type: 'true_false',
        correctAnswer: 'True',
        marks: 1,
      };

      const correctRes = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: 'true',
      });
      expect(correctRes.isCorrect).toBe(true);

      const incorrectRes = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: 'false',
      });
      expect(incorrectRes.isCorrect).toBe(false);
    });

    it('should evaluate text match / fill-in-blank question', () => {
      const question = {
        type: 'fill_in_blank',
        correctAnswer: 'Mitochondria',
        acceptableAnswers: ['mitochondrion'],
        marks: 3,
      };

      const correctRes = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: '  mitochondria  ',
      });
      expect(correctRes.isCorrect).toBe(true);
      expect(correctRes.marksAwarded).toBe(3);

      const alternativeRes = QuestionEvaluationRegistry.evaluate({
        question,
        userResponse: 'mitochondrion',
      });
      expect(alternativeRes.isCorrect).toBe(true);
    });

    it('should allow registering new question type evaluator without modifying existing evaluators', () => {
      class NumericalToleranceEvaluator extends BaseQuestionEvaluator {
        supports(q) {
          return q?.type === 'numerical';
        }
        evaluate({ question, userResponse }) {
          const val = Number(userResponse);
          const target = Number(question.targetValue);
          const tol = Number(question.tolerance || 0);
          const isCorrect = Math.abs(val - target) <= tol;
          return { isCorrect, marksAwarded: isCorrect ? 1 : 0 };
        }
      }

      QuestionEvaluationRegistry.register(new NumericalToleranceEvaluator());

      const res = QuestionEvaluationRegistry.evaluate({
        question: { type: 'numerical', targetValue: 10, tolerance: 1 },
        userResponse: 10.5,
      });
      expect(res.isCorrect).toBe(true);
    });
  });

  describe('Liskov Substitution & Single Responsibility - Timer Strategy Factory', () => {
    it('should resolve the correct strategy instance for each mode', () => {
      expect(TimerStrategyFactory.getStrategy('none')).toBeInstanceOf(NoTimerStrategy);
      expect(TimerStrategyFactory.getStrategy('strict')).toBeInstanceOf(StrictTimerStrategy);
      expect(TimerStrategyFactory.getStrategy('soft')).toBeInstanceOf(SoftTimerStrategy);
    });

    it('should accurately detect late submission under strict timer mode', () => {
      const strategy = TimerStrategyFactory.getStrategy('strict');
      const pastDeadline = new Date(Date.now() - 5000);
      const attempt = { deadlineAt: pastDeadline };

      const check = strategy.validateSubmission({ attempt });
      expect(check.isLate).toBe(true);
      expect(check.flags.length).toBeGreaterThan(0);
      expect(check.flags[0].code).toBe('LATE_SUBMISSION');
    });

    it('should allow on-time submission under strict timer mode', () => {
      const strategy = TimerStrategyFactory.getStrategy('strict');
      const futureDeadline = new Date(Date.now() + 60000);
      const attempt = { deadlineAt: futureDeadline };

      const check = strategy.validateSubmission({ attempt });
      expect(check.isLate).toBe(false);
      expect(check.flags.length).toBe(0);
    });
  });
});
