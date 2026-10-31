import { jest } from '@jest/globals';
import {
  sanitizeMongoInput,
  mongoSanitizer,
  sqlSanitizer,
  sanitizeXssString,
  xssSanitizer,
  hppProtection,
} from '../src/middleware/security.middleware.js';
import { validateObjectId } from '../src/middleware/validation.middleware.js';
import {
  sanitizeQuestionsForClient,
  sanitizeAttemptForClient,
} from '../src/controllers/quiz.controller.js';

describe('Security Layer - NoSQL Injection Prevention', () => {
  it('should strip keys starting with $ or containing dots from request bodies', () => {
    const maliciousPayload = {
      username: 'admin',
      password: { $gt: '' },
      nested: {
        normal: 'safe',
        $where: 'sleep(5000)',
        'evil.key': 'bad',
      },
      list: [
        { normal: 1 },
        { $ne: null },
      ],
    };

    const cleaned = sanitizeMongoInput(maliciousPayload);

    expect(cleaned.username).toBe('admin');
    expect(cleaned.password).toEqual({});
    expect(cleaned.nested).toEqual({ normal: 'safe' });
    expect(cleaned.list[0]).toEqual({ normal: 1 });
    expect(cleaned.list[1]).toEqual({});
  });

  it('middleware should sanitize req.body, req.query, and req.params', () => {
    const req = {
      body: { email: 'user@example.com', $regex: '.*' },
      query: { filter: { $gt: 0 }, category: 'Math' },
      params: { id: 'safe-id' },
    };
    const res = {};
    const next = jest.fn();

    mongoSanitizer(req, res, next);

    expect(req.body).toEqual({ email: 'user@example.com' });
    expect(req.query).toEqual({ filter: {}, category: 'Math' });
    expect(next).toHaveBeenCalledWith();
  });
});

describe('Security Layer - SQL Injection Detection', () => {
  it('should block queries with SQL injection patterns in query params', () => {
    const maliciousReq = {
      query: {
        search: "' OR '1'='1",
      },
    };
    const next = jest.fn();

    sqlSanitizer(maliciousReq, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].message).toContain('Potential SQL/Query injection detected');
  });

  it('should allow legitimate search terms', () => {
    const safeReq = {
      query: {
        search: 'Computer Science Basics',
        category: 'Science',
      },
    };
    const next = jest.fn();

    sqlSanitizer(safeReq, {}, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('Security Layer - XSS Sanitization', () => {
  it('should strip script tags and javascript: links from strings', () => {
    const maliciousInput = '<script>alert("XSS")</script>Hello world<img src="x" onerror="alert(1)">';
    const cleaned = sanitizeXssString(maliciousInput);

    expect(cleaned).not.toContain('<script>');
    expect(cleaned).not.toContain('onerror=');
    expect(cleaned).toContain('Hello world');
  });

  it('middleware should recursively clean req.body', () => {
    const req = {
      body: {
        comment: '<script>alert(1)</script>Great test!',
        title: 'Safe Title',
        tags: ['<script>evil()</script>tag1', 'tag2'],
      },
    };
    const next = jest.fn();

    xssSanitizer(req, {}, next);

    expect(req.body.comment).toBe('Great test!');
    expect(req.body.title).toBe('Safe Title');
    expect(req.body.tags[0]).toBe('tag1');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('Security Layer - HTTP Parameter Pollution (HPP)', () => {
  it('should collapse array query params for singular fields into single values', () => {
    const req = {
      query: {
        sort: ['recent', 'popular'],
        page: ['1', '2'],
        tags: ['science', 'math'], // Array allowed if not in singular set
      },
    };
    const next = jest.fn();

    hppProtection(req, {}, next);

    expect(req.query.sort).toBe('popular');
    expect(req.query.page).toBe('2');
    expect(req.query.tags).toEqual(['science', 'math']);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('Security Layer - ObjectId Validation', () => {
  it('should accept valid 24-character hexadecimal MongoDB ObjectIds', () => {
    const req = { params: { id: '6ace52ace45635ba6afb44a2' } };
    const next = jest.fn();

    validateObjectId('id')(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject invalid ObjectIds', () => {
    const req = { params: { id: 'invalid-id-or-path' } };
    const next = jest.fn();

    validateObjectId('id')(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].message).toBe('Invalid id');
  });
});

describe('Security Layer - Question Delivery & Answer Leakage Prevention', () => {
  const sampleQuestions = [
    {
      _id: 'q1',
      questionNumber: 1,
      questionText: 'What is the capital of France?',
      options: [
        { label: 'A', text: 'London', isCorrect: false },
        { label: 'B', text: 'Paris', isCorrect: true },
        { label: 'C', text: 'Berlin', isCorrect: false },
      ],
      correctAnswer: 'B',
      explanation: 'Paris is the capital of France.',
    },
    {
      _id: 'q2',
      questionNumber: 2,
      questionText: 'Which planet is known as the Red Planet?',
      options: [
        { label: 'A', text: 'Mars', isCorrect: true },
        { label: 'B', text: 'Venus', isCorrect: false },
      ],
      correctAnswer: 'A',
      explanation: 'Mars appears red due to iron oxide.',
    },
  ];

  it('should strip correctAnswer, explanation, and options[].isCorrect for regular participants', () => {
    const sanitized = sanitizeQuestionsForClient(sampleQuestions, {
      isOwner: false,
      isChallenge: false,
    });

    expect(sanitized).toHaveLength(2);
    sanitized.forEach((q) => {
      expect(q.correctAnswer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
      expect(q.options).toBeDefined();
      q.options.forEach((opt) => {
        expect(opt.isCorrect).toBeUndefined();
        expect(opt.label).toBeDefined();
        expect(opt.text).toBeDefined();
      });
    });
  });

  it('should allow owner/creator to view correct answers and explanations for standard quizzes', () => {
    const questions = sanitizeQuestionsForClient(sampleQuestions, {
      isOwner: true,
      isChallenge: false,
    });

    expect(questions[0].correctAnswer).toBe('B');
    expect(questions[0].explanation).toBe('Paris is the capital of France.');
    expect(questions[0].options[1].isCorrect).toBe(true);
  });

  it('for challenges before deadline, should strictly strip answers even for creator or participants', () => {
    const sanitized = sanitizeQuestionsForClient(sampleQuestions, {
      isOwner: true,
      isChallenge: true,
      deadlinePassed: false,
    });

    expect(sanitized[0].correctAnswer).toBeUndefined();
    expect(sanitized[0].explanation).toBeUndefined();
    expect(sanitized[0].options[1].isCorrect).toBeUndefined();
  });

  it('for challenges after deadline, should reveal answers and explanations', () => {
    const questions = sanitizeQuestionsForClient(sampleQuestions, {
      isOwner: false,
      isChallenge: true,
      deadlinePassed: true,
    });

    expect(questions[0].correctAnswer).toBe('B');
    expect(questions[0].explanation).toBe('Paris is the capital of France.');
    expect(questions[0].options[1].isCorrect).toBe(true);
  });
});

describe('Security Layer - Attempt State Sanitization & Quarantine', () => {
  const sampleAttempt = {
    _id: 'att1',
    status: 'in_progress',
    score: 10,
    percentage: 100,
    answers: [
      {
        questionId: 'q1',
        selectedAnswer: 'B',
        correctOptionId: 'opt_b',
        isCorrect: true,
        marksAwarded: 1,
      },
      {
        questionId: 'q2',
        selectedAnswer: null,
        correctOptionId: 'opt_a',
        isCorrect: false,
        marksAwarded: 0,
      },
    ],
  };

  it('should strip correctOptionId from in-progress attempts', () => {
    const sanitized = sanitizeAttemptForClient(sampleAttempt, {
      isChallenge: false,
    });

    sanitized.answers.forEach((ans) => {
      expect(ans.correctOptionId).toBeUndefined();
    });
  });

  it('should quarantine competitive challenge scores and correctness before deadline', () => {
    const completedChallengeAttempt = {
      ...sampleAttempt,
      status: 'completed',
    };

    const quarantined = sanitizeAttemptForClient(completedChallengeAttempt, {
      isChallenge: true,
      deadlinePassed: false,
    });

    expect(quarantined.score).toBeNull();
    expect(quarantined.percentage).toBeNull();
    quarantined.answers.forEach((ans) => {
      expect(ans.isCorrect).toBe(false);
      expect(ans.marksAwarded).toBe(0);
      expect(ans.correctOptionId).toBeUndefined();
    });
  });

  it('should reveal challenge scores and answers once deadline has passed', () => {
    const completedChallengeAttempt = {
      ...sampleAttempt,
      status: 'completed',
    };

    const released = sanitizeAttemptForClient(completedChallengeAttempt, {
      isChallenge: true,
      deadlinePassed: true,
    });

    expect(released.score).toBe(10);
    expect(released.percentage).toBe(100);
    expect(released.answers[0].isCorrect).toBe(true);
    expect(released.answers[0].correctOptionId).toBe('opt_b');
  });
});

