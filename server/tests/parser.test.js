import { smartMapColumns } from '../src/services/parser/smartColumnMapper.js';

describe('Smart Column Mapper', () => {
  it('should correctly identify question and answer columns', () => {
    const headers = ['sno', 'question text', 'option a', 'option b', 'option c', 'option d', 'correct answer'];
    const rows = [
      { 'sno': 1, 'question text': 'What is 2+2?', 'option a': '1', 'option b': '2', 'option c': '3', 'option d': '4', 'correct answer': 'd' }
    ];

    const result = smartMapColumns(headers, rows);

    expect(result.mapping.question).toBe('question text');
    expect(result.mapping.options.length).toBe(4);
    expect(result.mapping.answer).toBe('correct answer');
  });

  it('should detect explanation column when present', () => {
    const headers = ['question', 'a', 'b', 'c', 'd', 'answer', 'explanation'];
    const rows = [
      { 'question': 'What is gravity?', 'a': 'Push', 'b': 'Pull', 'c': 'Spin', 'd': 'None', 'answer': 'B', 'explanation': 'Gravity is a pull force.' }
    ];

    const result = smartMapColumns(headers, rows);

    expect(result.mapping.question).toBe('question');
    expect(result.mapping.answer).toBe('answer');
    expect(result.mapping.explanation).toBe('explanation');
  });

  it('should detect serial number column', () => {
    const headers = ['sno', 'question', 'option a', 'option b', 'answer'];
    const rows = [
      { 'sno': 1, 'question': 'Test?', 'option a': 'Yes', 'option b': 'No', 'answer': 'A' }
    ];

    const result = smartMapColumns(headers, rows);

    expect(result.mapping.serial).toBe('sno');
  });

  it('should work with numbered options (option 1, option 2)', () => {
    const headers = ['question', 'option 1', 'option 2', 'option 3', 'option 4', 'correct'];
    const rows = [
      { 'question': 'Capital of France?', 'option 1': 'Berlin', 'option 2': 'Paris', 'option 3': 'London', 'option 4': 'Rome', 'correct': '2' }
    ];

    const result = smartMapColumns(headers, rows);

    expect(result.mapping.question).toBe('question');
    expect(result.mapping.options.length).toBe(4);
  });

  it('should handle minimal 2-option quizzes', () => {
    const headers = ['q', 'a', 'b', 'ans'];
    const rows = [
      { 'q': 'Is sky blue?', 'a': 'Yes', 'b': 'No', 'ans': 'A' }
    ];

    const result = smartMapColumns(headers, rows);

    expect(result.mapping.question).toBe('q');
    expect(result.mapping.options.length).toBeGreaterThanOrEqual(2);
    expect(result.mapping.answer).toBe('ans');
  });

  it('should return mapping with confidence score', () => {
    const headers = ['question', 'option a', 'option b', 'option c', 'option d', 'answer'];
    const rows = [
      { 'question': 'Test?', 'option a': 'A', 'option b': 'B', 'option c': 'C', 'option d': 'D', 'answer': 'A' }
    ];

    const result = smartMapColumns(headers, rows);

    expect(result).toHaveProperty('overallConfidence');
    expect(typeof result.overallConfidence).toBe('number');
  });
});
