export function parsePdfQuestions(text) {
  const questions = [];
  let current = null;
  let lastOption = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const question = /^(?:Q(?:uestion)?\s*)?\d+[.)\]:]\s*(.+)$/i.exec(line);
    if (question) {
      current = { questionText: question[1], options: [], correctAnswer: null };
      questions.push(current);
      lastOption = null;
      continue;
    }
    if (!current) continue;
    const answer = /^(?:correct\s+)?answer\s*[:=-]\s*([A-H])\b/i.exec(line);
    const option = /^([A-H])[.)]\s*(.+)$/i.exec(line);
    if (answer) {
      current.correctAnswer = answer[1].toUpperCase();
      lastOption = null;
    } else if (option) {
      lastOption = { label: option[1].toUpperCase(), text: option[2] };
      current.options.push(lastOption);
    } else if (lastOption) {
      lastOption.text += ' ' + line;
    } else if (!current.options.length) {
      current.questionText += ' ' + line;
    }
  }
  return questions;
}

export function isCompletePdfQuestion(question) {
  return question.options.length >= 2 &&
    new Set(question.options.map(option => option.label)).size === question.options.length &&
    question.options.some(option => option.label === question.correctAnswer);
}

export function toDraftPdfQuestion(question, index) {
  const options = question.options.map((option, position) => ({
    ...option,
    label: String.fromCharCode(65 + position),
    isCorrect: option.label === question.correctAnswer,
  }));
  return {
    questionText: question.questionText,
    questionNumber: index + 1,
    questionType: 'multiple_choice',
    options,
    correctAnswer: options.find(option => option.isCorrect).label,
  };
}
