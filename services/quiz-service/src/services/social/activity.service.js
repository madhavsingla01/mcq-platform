import Quiz from '../../models/Quiz.model.js';
import User from '../../models/User.model.js';
import { logger } from '../../utils/logger.js';

const toId = (value) => (value?._id ? value._id : value);

export const publicQuizFilter = {
  visibility: { $ne: 'private' },
  $or: [{ visibility: 'public' }, { isPublic: true }],
  'metadata.savedAsDraft': { $ne: true },
};

export const isPublicQuiz = (quiz) => Boolean(
  quiz &&
  quiz.visibility !== 'private' &&
  (quiz.visibility === 'public' || quiz.isPublic === true) &&
  quiz.metadata?.savedAsDraft !== true
);

export const recordActivity = async ({
  actorId,
  verb,
  quizId = null,
  targetUserId = null,
  commentId = null,
  visibility = 'public',
  metadata = {},
  notifyRecipientId = null,
}) => {
  if (!actorId || !verb) return null;
  logger?.info?.(`[quiz-service:activity] ${verb} by ${actorId} on quiz ${quizId || 'N/A'}`);
  return { actor: actorId, verb, quiz: quizId, visibility, metadata };
};

export const decorateQuizzesForViewer = async (quizzes, viewerId) => {
  return quizzes.map((quiz) => {
    const plainQuiz = typeof quiz.toObject === 'function' ? quiz.toObject() : quiz;
    return {
      ...plainQuiz,
      social: {
        likeCount: plainQuiz.likeCount || 0,
        commentCount: plainQuiz.commentCount || 0,
        bookmarkCount: plainQuiz.bookmarkCount || 0,
        shareCount: plainQuiz.shareCount || 0,
        likedByMe: false,
        bookmarkedByMe: false,
      },
    };
  });
};

export const createQuizPublishedActivity = async ({ quiz, actorId }) => {
  if (!actorId || !isPublicQuiz(quiz)) return null;

  await Quiz.findByIdAndUpdate(quiz._id, {
    lastSocialActivityAt: new Date(),
  });

  return recordActivity({
    actorId,
    verb: 'quiz_published',
    quizId: quiz._id,
    visibility: 'public',
    metadata: {
      title: quiz.title,
      questionCount: quiz.questionCount,
    },
  });
};

export const deleteQuizSocialData = async (quizId) => {
  logger?.info?.(`[quiz-service] Cascading social data cleanup deferred to social-service for quiz ${quizId}`);
  return true;
};

export const deleteUserSocialData = async (userId) => {
  return true;
};

export const socialHelpers = {
  publicQuizFilter,
  isPublicQuiz,
  recordActivity,
  decorateQuizzesForViewer,
  createQuizPublishedActivity,
  deleteQuizSocialData,
  deleteUserSocialData,
};

export default socialHelpers;

