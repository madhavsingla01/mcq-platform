import { detectAnswerFormat, matchAnswerToOption } from '../src/utils/detectAnswer.js';

describe('detectAnswerFormat', () => {
  it('should detect single letter answers', () => {
    expect(detectAnswerFormat('A')).toEqual({ type: 'letter', value: 'A' });
    expect(detectAnswerFormat('c')).toEqual({ type: 'letter', value: 'C' });
    expect(detectAnswerFormat('D')).toEqual({ type: 'letter', value: 'D' });
  });

  it('should detect single digit answers', () => {
    expect(detectAnswerFormat('1')).toEqual({ type: 'number', value: '1' });
    expect(detectAnswerFormat('4')).toEqual({ type: 'number', value: '4' });
  });

  it('should detect boolean answers', () => {
    expect(detectAnswerFormat('true')).toEqual({ type: 'boolean', value: 'true' });
    expect(detectAnswerFormat('FALSE')).toEqual({ type: 'boolean', value: 'false' });
    expect(detectAnswerFormat('Yes')).toEqual({ type: 'boolean', value: 'yes' });
    expect(detectAnswerFormat('no')).toEqual({ type: 'boolean', value: 'no' });
  });

  it('should detect text answers', () => {
    expect(detectAnswerFormat('Paris')).toEqual({ type: 'text', value: 'Paris' });
    expect(detectAnswerFormat('The Pacific Ocean')).toEqual({ type: 'text', value: 'The Pacific Ocean' });
  });

  it('should handle null/undefined', () => {
    expect(detectAnswerFormat(null)).toEqual({ type: 'unknown', value: '' });
    expect(detectAnswerFormat(undefined)).toEqual({ type: 'unknown', value: '' });
  });

  it('should trim whitespace', () => {
    expect(detectAnswerFormat('  B  ')).toEqual({ type: 'letter', value: 'B' });
  });
});

describe('matchAnswerToOption', () => {
  const options = [
    { label: 'A', text: 'Berlin' },
    { label: 'B', text: 'Madrid' },
    { label: 'C', text: 'Paris' },
    { label: 'D', text: 'Rome' },
  ];

  it('should match letter answer to option index', () => {
    expect(matchAnswerToOption('C', options)).toBe(2);
    expect(matchAnswerToOption('A', options)).toBe(0);
    expect(matchAnswerToOption('D', options)).toBe(3);
  });

  it('should match number answer to option index (1-based)', () => {
    expect(matchAnswerToOption('3', options)).toBe(2);
    expect(matchAnswerToOption('1', options)).toBe(0);
  });

  it('should match text answer exactly', () => {
    expect(matchAnswerToOption('Paris', options)).toBe(2);
    expect(matchAnswerToOption('rome', options)).toBe(3); // case insensitive
  });

  it('should return -1 for no match', () => {
    expect(matchAnswerToOption('Tokyo', options)).toBe(-1);
    expect(matchAnswerToOption('Z', options)).toBe(-1);
  });

  it('should return -1 for empty inputs', () => {
    expect(matchAnswerToOption('', options)).toBe(-1);
    expect(matchAnswerToOption(null, options)).toBe(-1);
    expect(matchAnswerToOption('A', [])).toBe(-1);
    expect(matchAnswerToOption('A', null)).toBe(-1);
  });

  it('should match partial text (option contained in answer)', () => {
    expect(matchAnswerToOption('Option D', [
      { label: 'A', text: 'Yes' },
      { label: 'B', text: 'No' },
      { label: 'C', text: 'Maybe' },
      { label: 'D', text: 'Option D' },
    ])).toBe(3);
  });
});
