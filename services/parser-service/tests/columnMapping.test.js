import { validateColumnMapping } from '../src/services/parser/validateColumnMapping.js';

const headers = ['Question', 'A', 'B', 'Answer', 'Explanation'];
const validMapping = {
  question: 'Question',
  options: ['A', 'B'],
  answer: 'Answer',
};

describe('column mapping validation', () => {
  it('accepts distinct columns that exist in the parsed file', () => {
    expect(validateColumnMapping(headers, validMapping)).toBeNull();
  });

  it('requires an answer column for quiz imports', () => {
    expect(validateColumnMapping(headers, { ...validMapping, answer: '' }))
      .toBe('Correct answer column mapping is required');
  });

  it('rejects mappings to headers that do not exist', () => {
    expect(validateColumnMapping(headers, { ...validMapping, answer: 'Correct' }))
      .toBe('Every mapped column must match a column in the parsed file');
  });

  it('rejects reusing a column for different question fields', () => {
    expect(validateColumnMapping(headers, { ...validMapping, answer: 'A' }))
      .toBe('Each field must use a different column');
  });

  it('requires an array with at least two option columns', () => {
    expect(validateColumnMapping(headers, { ...validMapping, options: 'A,B' }))
      .toBe('At least 2 option columns are required');
  });
});
