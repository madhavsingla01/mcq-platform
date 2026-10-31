import Activity from '../../models/Activity.model.js';
import Notification from '../../models/Notification.model.js';
import QuizInteraction from '../../models/QuizInteraction.model.js';
import QuizComment from '../../models/QuizComment.model.js';
import QuizShare from '../../models/QuizShare.model.js';
import Quiz from '../../models/Quiz.model.js';
import User from '../../models/User.model.js';
import Message from '../../models/Message.model.js';
import Conversation from '../../models/Conversation.model.js';

const toId = (value) => (value?._id ? value._id : value);
const sameId = (left, right) => String(toId(left) || '') === String(toId(right) || '');

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

  const activity = await Activity.create({
    actor: actorId,
    verb,
    quiz: quizId || null,
    targetUser: targetUserId || null,
    comment: commentId || null,
    visibility,
    metadata,
  });

  await User.findByIdAndUpdate(actorId, { $inc: { activityCount: 1 } });

  const recipientId = notifyRecipientId || targetUserId;
  if (recipientId && !sameId(actorId, recipientId)) {
    // Instagram style: Notifications strictly for likes and comments
    const notificationVerb = ['quiz_liked', 'commented', 'comment_liked'].includes(verb)
      ? verb
      : null;

    if (notificationVerb) {
      await Notification.create({
        recipient: recipientId,
        actor: actorId,
        verb: notificationVerb,
        quiz: quizId || null,
        comment: commentId || null,
        metadata,
      });
    }
  }

  return activity;
};

export const decorateQuizzesForViewer = async (quizzes, viewerId) => {
  const quizIds = quizzes.map((quiz) => toId(quiz)).filter(Boolean);
  const interactionState = new Map();

  if (viewerId && quizIds.length) {
    const interactions = await QuizInteraction.find({
      user: viewerId,
      quiz: { $in: quizIds },
      type: { $in: ['like', 'bookmark'] },
    }).lean();

    for (const interaction of interactions) {
      const quizId = String(interaction.quiz);
      const state = interactionState.get(quizId) || {};
      if (interaction.type === 'like') state.likedByMe = true;
      if (interaction.type === 'bookmark') state.bookmarkedByMe = true;
      interactionState.set(quizId, state);
    }
  }

  return quizzes.map((quiz) => {
    const plainQuiz = typeof quiz.toObject === 'function' ? quiz.toObject() : quiz;
    const state = interactionState.get(String(plainQuiz._id)) || {};

    return {
      ...plainQuiz,
      social: {
        likeCount: plainQuiz.likeCount || 0,
        commentCount: plainQuiz.commentCount || 0,
        bookmarkCount: plainQuiz.bookmarkCount || 0,
        shareCount: plainQuiz.shareCount || 0,
        likedByMe: state.likedByMe === true,
        bookmarkedByMe: state.bookmarkedByMe === true,
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
  const comments = await QuizComment.find({ quiz: quizId }).select('_id').lean();
  const commentIds = comments.map((c) => c._id);

  await Promise.all([
    QuizInteraction.deleteMany({ quiz: quizId }),
    QuizComment.deleteMany({ quiz: quizId }),
    QuizShare.deleteMany({ quiz: quizId }),
    Message.updateMany({ quiz: quizId }, { $set: { quiz: null, text: '[Shared quiz was deleted]' } }),
    Activity.deleteMany({
      $or: [{ quiz: quizId }, { comment: { $in: commentIds } }],
    }),
    Notification.deleteMany({
      $or: [{ quiz: quizId }, { comment: { $in: commentIds } }],
    }),
  ]);
};

export const deleteUserSocialData = async (userId) => {
  await Promise.all([
    QuizInteraction.deleteMany({ user: userId }),
    QuizComment.updateMany({ author: userId }, { status: 'deleted', body: '[deleted]' }),
    QuizShare.deleteMany({ user: userId }),
    Message.deleteMany({ sender: userId }),
    Conversation.deleteMany({ participants: userId }),
    Activity.deleteMany({ $or: [{ actor: userId }, { targetUser: userId }] }),
    Notification.deleteMany({ $or: [{ actor: userId }, { recipient: userId }] }),
  ]);
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
