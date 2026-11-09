import Attempt from '../models/Attempt.model.js';
import Question from '../models/Question.model.js';
import { randomInt } from 'node:crypto';

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export function createQuestionSnapshot(questions, settings = {}) {
  const snapshot = questions.map(question => question.toObject ? question.toObject() : { ...question });
  if (settings.shuffleOptions) {
    for (const question of snapshot) {
      if (['multiple_choice', 'checkboxes', 'dropdown'].includes(question.questionType) && question.options?.length > 1) {
        question.options = shuffled(question.options);
      }
    }
  }
  return settings.shuffleQuestions ? shuffled(snapshot) : snapshot;
}

export async function questionsForAttempt(quizId, attempt = null) {
  if (attempt) {
    if (attempt.questionSnapshot?.length) return attempt.questionSnapshot;
    const stored = await Attempt.findById(attempt._id).select('+questionSnapshot').lean();
    if (stored?.questionSnapshot?.length) return stored.questionSnapshot;
  }
  const questions = await Question.find({ quizId }).select('-metadata -createdAt -updatedAt -__v').sort({ orderIndex: 1, questionNumber: 1 });
  if (!attempt) return questions;
  const snapshot = createQuestionSnapshot(questions);
  // Legacy attempts can only freeze the current version at their first use.
  const result = await Attempt.updateOne({ _id: attempt._id, questionSnapshot: { $exists: false } }, { $set: { questionSnapshot: snapshot } });
  if (result.modifiedCount) return snapshot;
  return (await Attempt.findById(attempt._id).select('+questionSnapshot').lean())?.questionSnapshot || snapshot;
}
