export const buildExplanationPrompt = (question, options, correctAnswer) => {
  return `Explain why "${correctAnswer}" is correct for: ${question}\nOptions: ${options.map(o => `${o.label}) ${o.text}`).join(', ')}`;
};
