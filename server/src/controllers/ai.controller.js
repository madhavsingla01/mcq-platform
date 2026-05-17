import { catchAsync } from '../middleware/error.middleware.js';
import { recordAIInteraction } from '../services/activity/activity.service.js';

const buildStoredExplanation = ({ question, options = [], correctAnswer, prompt }) => {
  const normalizedQuestion = String(question || '').trim();
  const normalizedPrompt = String(prompt || '').trim();
  const correctOption = Array.isArray(options)
    ? options.find((option) => option?.label === correctAnswer)
    : null;
  const correctText = correctOption?.text || correctAnswer || 'the correct option';

  if (normalizedPrompt) {
    return [
      `Question: ${normalizedQuestion || 'Current quiz question'}`,
      `Correct answer: ${correctText}`,
      `Response: ${normalizedPrompt}`,
      'Use the question wording, the selected answer history, and the stored correct answer to review the concept carefully.',
    ].join('\n\n');
  }

  return [
    `The correct answer is ${correctText}.`,
    normalizedQuestion ? `Review the question: ${normalizedQuestion}` : '',
    'Compare each option against the wording of the question and eliminate choices that do not satisfy the full condition.',
  ].filter(Boolean).join('\n\n');
};

export const getExplanation = catchAsync(async (req, res) => {
  const { question, options, correctAnswer, quizId, questionId, attemptId, prompt } = req.body;
  const requestPrompt = String(prompt || question || '').trim();
  const explanation = buildStoredExplanation({ question, options, correctAnswer, prompt });

  const interaction = await recordAIInteraction({
    req,
    quizId,
    questionId,
    attemptId,
    interactionType: prompt ? 'follow_up' : 'explanation',
    prompt: requestPrompt,
    response: explanation,
    provider: 'stub',
    metadata: {
      question,
      options,
      correctAnswer,
    },
  });

  res.json({
    success: true,
    data: {
      explanation,
      source: 'stub',
      interactionId: interaction?._id || null,
    },
  });
});

export const getGoogleSearchUrl = catchAsync(async (req, res) => {
  const { question, quizId, questionId, attemptId } = req.body;
  const query = encodeURIComponent(question);
  const url = `https://www.google.com/search?q=${query}`;

  await recordAIInteraction({
    req,
    quizId,
    questionId,
    attemptId,
    interactionType: 'search',
    prompt: question,
    response: url,
    provider: 'google',
  });

  res.json({
    success: true,
    data: { url },
  });
});
