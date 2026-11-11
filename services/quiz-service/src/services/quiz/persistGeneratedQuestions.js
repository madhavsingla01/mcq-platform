import Quiz from '../../models/Quiz.model.js';
import Question from '../../models/Question.model.js';
import { logger } from '../../utils/logger.js';

export const persistGeneratedQuestions = async (quiz, questions) => {
  try {
    return await Question.insertMany(
      questions.map((question) => ({
        ...question,
        quizId: quiz._id,
      }))
    );
  } catch (insertError) {
    const cleanupResults = await Promise.allSettled([
      Question.deleteMany({ quizId: quiz._id }),
      Quiz.deleteOne({ _id: quiz._id }),
    ]);
    const cleanupErrors = cleanupResults
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);

    if (cleanupErrors.length) {
      logger.error(`Failed to clean up incomplete generated quiz ${quiz._id}`, cleanupErrors);
      throw new AggregateError(
        [insertError, ...cleanupErrors],
        `Question insertion and cleanup both failed for generated quiz ${quiz._id}`
      );
    }
    throw insertError;
  }
};
