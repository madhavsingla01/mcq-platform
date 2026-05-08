import { catchAsync } from '../middleware/error.middleware.js';

export const getExplanation = catchAsync(async (req, res) => {
  const { question, options, correctAnswer } = req.body;
  // Stub — will connect to OpenAI when API key is configured
  res.json({
    success: true,
    data: {
      explanation: 'AI explanations coming soon! Use the "Search on Google" button for now.',
      source: 'stub',
    },
  });
});

export const getGoogleSearchUrl = catchAsync(async (req, res) => {
  const { question } = req.body;
  const query = encodeURIComponent(question);
  res.json({
    success: true,
    data: { url: `https://www.google.com/search?q=${query}` },
  });
});
