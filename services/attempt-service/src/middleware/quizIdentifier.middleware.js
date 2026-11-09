import Quiz from '../models/Quiz.model.js';
import { AppError, catchAsync } from './error.middleware.js';

// Preserve the symbolic identifiers accepted by the Quiz compatibility URLs.
export const resolveQuizIdentifier = catchAsync(async (req, res, next) => {
  const identifier = req.params.id || req.body?.quizId;
  if (typeof identifier !== 'string' || !/^([a-f\d]{24}|[!#]?[a-z\d_-]{3,30})$/i.test(identifier)) {
    throw new AppError('Invalid quiz identifier', 400);
  }
  if (/^[a-f\d]{24}$/i.test(identifier)) return next();
  const raw = identifier.toUpperCase();
  const code = '!' + raw.replace(/^[!#]/, '');
  const quiz = await Quiz.findOne({ quizCode: { $in: [code, raw, `!${raw}`] } }).select('_id').lean();
  if (!quiz) throw new AppError('Quiz not found', 404);
  if (req.params.id) req.params.id = String(quiz._id);
  else req.body.quizId = String(quiz._id);
  next();
});
