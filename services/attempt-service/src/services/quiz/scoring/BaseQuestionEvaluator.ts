import type { Types } from 'mongoose';

type OptionId = string | Types.ObjectId;
type Answer = string | number | boolean | readonly string[] | null;

interface ScoringQuestion {
  questionType?: string;
  type?: string;
  marks?: number | string | null;
  negativeMarks?: number | string | null;
  correctAnswer?: Answer;
  acceptableAnswers?: readonly string[];
  isCaseSensitive?: boolean;
  options?: readonly { _id?: OptionId; label?: string; key?: string; isCorrect?: boolean }[];
}

export interface EvaluationInput {
  question: ScoringQuestion | null | undefined;
  userResponse: Answer | undefined;
  options?: {
    negativeMarking?: boolean;
    negativeMarkValue?: number;
    allowPartialCredit?: boolean;
    isCaseSensitive?: boolean;
  };
}

interface EvaluationResult {
  isCorrect: boolean;
  isPartiallyCorrect: boolean;
  isSkipped: boolean;
  marksAwarded: number;
  selectedOptionId?: OptionId | null;
  correctOptionId?: OptionId | null;
  feedback: string;
}

export abstract class BaseQuestionEvaluator {
  abstract supports(question: EvaluationInput['question']): boolean;
  abstract evaluate(input: EvaluationInput): EvaluationResult;
}
