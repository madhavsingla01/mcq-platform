import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IQuestionStat {
  questionId: string;
  questionNumber?: number;
  questionIndex?: number;
  questionText?: string;
  reachedCount: number;
  dropOffCount: number;
  correctCount: number;
  totalAnswered: number;
  totalTimeMs: number;
}

export interface IDailyQuizMetric extends Document {
  date: string; // YYYY-MM-DD
  quizId: string;
  creatorId: string;
  title: string;
  category: string;
  difficulty: string;
  starts: number;
  completions: number;
  abandonments: number;
  totalScore: number;
  totalMaxScore: number;
  totalQuestions: number;
  totalTimeSeconds: number;
  totalAnswersGiven: number;
  totalCorrectAnswers: number;
  questionStats: IQuestionStat[];
  uniqueLearners: string[];
  createdAt: Date;
  updatedAt: Date;
}

const QuestionStatSchema = new Schema<IQuestionStat>(
  {
    questionId: { type: String, required: true },
    questionNumber: { type: Number },
    questionIndex: { type: Number },
    questionText: { type: String, default: '' },
    reachedCount: { type: Number, default: 0 },
    dropOffCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    totalAnswered: { type: Number, default: 0 },
    totalTimeMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const DailyQuizMetricSchema = new Schema<IDailyQuizMetric>(
  {
    date: { type: String, required: true, index: true },
    quizId: { type: String, required: true, index: true },
    creatorId: { type: String, required: true, index: true },
    title: { type: String, default: '' },
    category: { type: String, default: 'General' },
    difficulty: { type: String, default: 'Intermediate' },
    starts: { type: Number, default: 0, min: 0 },
    completions: { type: Number, default: 0, min: 0 },
    abandonments: { type: Number, default: 0, min: 0 },
    totalScore: { type: Number, default: 0 },
    totalMaxScore: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    totalTimeSeconds: { type: Number, default: 0 },
    totalAnswersGiven: { type: Number, default: 0 },
    totalCorrectAnswers: { type: Number, default: 0 },
    questionStats: { type: [QuestionStatSchema], default: [] },
    uniqueLearners: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: 'daily_quiz_metrics',
  }
);

DailyQuizMetricSchema.index({ date: 1, quizId: 1 }, { unique: true });
DailyQuizMetricSchema.index({ creatorId: 1, date: -1 });
DailyQuizMetricSchema.index({ quizId: 1, date: -1 });

export const DailyQuizMetric: Model<IDailyQuizMetric> =
  mongoose.models.DailyQuizMetric ||
  mongoose.model<IDailyQuizMetric>('DailyQuizMetric', DailyQuizMetricSchema, 'daily_quiz_metrics');

export default DailyQuizMetric;
