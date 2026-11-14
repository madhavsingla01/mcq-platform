import { normalizeAnswer } from '../dist/services/parser/answerDetector.js';

describe('answer normalization', () => {
  const options = [
    { label: 'A', text: 'Yes' },
    { label: 'B', text: 'No' },
  ];

  it('maps boolean-style values to the matching option label', () => {
    expect(normalizeAnswer('yes', options)).toBe('A');
    expect(normalizeAnswer('false', options)).toBe('B');
  });

  it('leaves unmatched boolean values identifiable for row validation', () => {
    expect(normalizeAnswer('true', [
      { label: 'A', text: 'Correct' },
      { label: 'B', text: 'Incorrect' },
    ])).toBe('true');
  });
});
