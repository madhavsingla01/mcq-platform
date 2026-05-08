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
});
