import {
  isFormulaInjection,
  sanitizeFormulaPrefix,
  sanitizeMetadataString,
  sanitizeMetadata,
  sanitizeTabularData,
} from '../src/services/security/formulaSanitizer.service.js';

describe('Feature F7: Formula Injection & Input Sanitization', () => {
  it('F7-1: Neutralizes formula prefix = in CSV/tabular rows with leading single quote', () => {
    const formula = '=SUM(A1:A10)';
    expect(isFormulaInjection(formula)).toBe(true);

    const sanitized = sanitizeFormulaPrefix(formula);
    expect(sanitized).toBe("'=SUM(A1:A10)");
  });

  it('F7-2: Neutralizes formula prefixes +, -, @, \\t, \\r', () => {
    const payloads = [
      { raw: '+5+5', expected: "'+5+5" },
      { raw: '-10+2', expected: "'-10+2" },
      { raw: '@SUM(B1:B5)', expected: "'@SUM(B1:B5)" },
      { raw: '\t=1+1', expected: "'\t=1+1" },
      { raw: '\r+SUM(A1)', expected: "'\r+SUM(A1)" },
    ];

    for (const item of payloads) {
      expect(isFormulaInjection(item.raw)).toBe(true);
      const sanitized = sanitizeFormulaPrefix(item.raw);
      expect(sanitized.startsWith("'")).toBe(true);
      expect(sanitized).toBe(item.expected);
    }
  });

  it('F7-3: Neutralizes command execution payload vectors in tabular data', () => {
    const dde = "=cmd|' /C calc'!A0";
    expect(isFormulaInjection(dde)).toBe(true);

    const sanitized = sanitizeFormulaPrefix(dde);
    expect(sanitized).toBe("'=cmd|' /C calc'!A0");
  });

  it('F7-4: Strips HTML <script> tags from string metadata', () => {
    const malicious = '<script>alert("xss")</script>Syllabus';
    const sanitized = sanitizeMetadataString(malicious);

    expect(sanitized).toBe('alert("xss")Syllabus');
    expect(sanitized).not.toContain('<script>');
  });

  it('F7-5 / F7-B3: Valid negative numbers (-42, -3.14) and positive (+5) are preserved safely', () => {
    const validNumbers = ['-42', '-3.14', '-42.5', '+5', '100', '-0.001', '1e5', '-2.5e3'];

    for (const num of validNumbers) {
      expect(isFormulaInjection(num)).toBe(false);
      expect(sanitizeFormulaPrefix(num)).toBe(num);
    }

    const normalText = 'Introduction to Computer Systems';
    expect(isFormulaInjection(normalText)).toBe(false);
    expect(sanitizeFormulaPrefix(normalText)).toBe(normalText);
  });

  it('F7-B1: Tab character followed by formula (\\t=1+1) is neutralized', () => {
    const tabPayload = '\t=1+1';
    expect(isFormulaInjection(tabPayload)).toBe(true);
    expect(sanitizeFormulaPrefix(tabPayload)).toBe("'\t=1+1");
  });

  it('F7-B2: Carriage return followed by formula (\\r+SUM) is neutralized', () => {
    const crPayload = '\r+SUM(A1)';
    expect(isFormulaInjection(crPayload)).toBe(true);
    expect(sanitizeFormulaPrefix(crPayload)).toBe("'\r+SUM(A1)");
  });

  it('F7-B4: At-symbol formula reference (@SUM(A1:A5)) is neutralized', () => {
    const atFormula = '@SUM(A1:A5)';
    expect(isFormulaInjection(atFormula)).toBe(true);
    expect(sanitizeFormulaPrefix(atFormula)).toBe("'@SUM(A1:A5)");
  });

  it('F7-B5: Exotic full-width equals symbol (\\uFF1D1+1) is neutralized safely', () => {
    const exoticEquals = '\uFF1D1+1';
    expect(isFormulaInjection(exoticEquals)).toBe(true);
    expect(sanitizeFormulaPrefix(exoticEquals)).toBe("'\uFF1D1+1");
  });

  it('F7-Tabular: Sanitizes tabular row objects and 2D arrays', () => {
    const rowObjects = [
      { Question: 'What is 2+2?', OptionA: '=cmd|calc', OptionB: '4', Score: -10 },
      { Question: 'Topic', OptionA: '+5+5', OptionB: '-3.14', Score: 100 },
    ];

    const sanitizedObjects = sanitizeTabularData(rowObjects);
    expect(sanitizedObjects[0].OptionA).toBe("'=cmd|calc");
    expect(sanitizedObjects[0].OptionB).toBe('4');
    expect(sanitizedObjects[0].Score).toBe(-10); // Number preserved
    expect(sanitizedObjects[1].OptionA).toBe("'+5+5");
    expect(sanitizedObjects[1].OptionB).toBe('-3.14'); // Valid negative float preserved!

    const rowArrays = [
      ['Topic', '=SUM(A1:B1)', '-42', '@CMD'],
    ];
    const sanitizedArrays = sanitizeTabularData(rowArrays);
    expect(sanitizedArrays[0][1]).toBe("'=SUM(A1:B1)");
    expect(sanitizedArrays[0][2]).toBe('-42'); // Preserved
    expect(sanitizedArrays[0][3]).toBe("'@CMD");
  });

  it('F7-Metadata: Sanitizes complex nested metadata structures', () => {
    const rawMetadata = {
      title: '<script>alert(1)</script>Exam Preparation',
      description: '<b>High-yield</b> questions with <script src="evil.js"></script>solutions',
      numericField: 42,
      nested: {
        author: '<script>stealCookies()</script>Prof. Alan',
      },
    };

    const sanitized = sanitizeMetadata(rawMetadata);
    expect(sanitized.title).toBe('alert(1)Exam Preparation');
    expect(sanitized.description).toBe('High-yield questions with solutions');
    expect(sanitized.numericField).toBe(42);
    expect(sanitized.nested.author).toBe('stealCookies()Prof. Alan');
  });
});
