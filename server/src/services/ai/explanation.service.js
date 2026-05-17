export const generateExplanation = async (question, options, correctAnswer) => {
  const correctOption = Array.isArray(options)
    ? options.find((option) => option?.label === correctAnswer)
    : null;
  const answerText = correctOption?.text || correctAnswer || '';

  return {
    explanation: [
      answerText ? `Correct answer: ${answerText}` : '',
      question ? `Question: ${question}` : '',
      'Review each option against the question requirements and eliminate choices that do not match all conditions.',
    ].filter(Boolean).join('\n\n'),
    source: 'local',
  };
};
