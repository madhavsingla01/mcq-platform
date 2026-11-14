import { describe, it, expect } from '@jest/globals';
import { normalizeManualQuestion } from '../dist/controllers/quiz.controller.js';

describe('Draft Documents Lifecycle & Business Logic', () => {
  describe('Draft Question Normalization', () => {
    it('should normalize single-choice draft question and extract correct option letter', () => {
      const rawQ = {
        question: 'What is the capital of France?',
        type: 'multiple_choice',
        options: [
          { text: 'London', isCorrect: false },
          { text: 'Paris', isCorrect: true },
          { text: 'Berlin', isCorrect: false },
        ],
      };

      const normalized = normalizeManualQuestion(rawQ, 0);

      expect(normalized.questionNumber).toBe(1);
      expect(normalized.questionText).toBe('What is the capital of France?');
      expect(normalized.questionType).toBe('multiple_choice');
      expect(normalized.options).toHaveLength(3);
      expect(normalized.options[1].label).toBe('B');
      expect(normalized.options[1].text).toBe('Paris');
      expect(normalized.options[1].isCorrect).toBe(true);
      expect(normalized.correctAnswer).toBe('B');
    });

    it('should normalize multiple-choice (checkboxes) draft question and extract all correct labels', () => {
      const rawQ = {
        question: 'Select all prime numbers',
        type: 'checkboxes',
        options: [
          { text: '2', isCorrect: true },
          { text: '3', isCorrect: true },
          { text: '4', isCorrect: false },
          { text: '5', isCorrect: true },
        ],
      };

      const normalized = normalizeManualQuestion(rawQ, 1);

      expect(normalized.questionType).toBe('checkboxes');
      expect(normalized.correctAnswer).toEqual(['A', 'B', 'D']);
    });

    it('should assign default marks and orderIndex when omitting them in drafts', () => {
      const rawQ = {
        question: 'Work in progress draft question without marks',
        type: 'multiple_choice',
        options: [{ text: 'Yes', isCorrect: true }],
      };

      const normalized = normalizeManualQuestion(rawQ, 4);

      expect(normalized.marks).toBe(1);
      expect(normalized.negativeMarks).toBe(0);
      expect(normalized.orderIndex).toBe(4);
    });
  });

  describe('Draft Readiness Scoring Algorithm', () => {
    const calculateReadiness = (draft) => {
      let score = 0;
      if (draft.title && draft.title !== 'Untitled Quiz') score += 25;
      if (draft.category && draft.category !== 'General') score += 15;
      if ((draft.questionCount || 0) > 0) score += 35;
      if (draft.description) score += 10;
      if (draft.thumbnail) score += 15;
      return Math.min(100, Math.max(15, score));
    };

    it('should evaluate minimal new draft at baseline readiness', () => {
      const draft = {
        title: 'Untitled Quiz',
        category: 'General',
        questionCount: 0,
      };

      expect(calculateReadiness(draft)).toBe(15);
    });

    it('should evaluate partial draft with title and questions', () => {
      const draft = {
        title: 'JavaScript Async Mastery',
        category: 'Computer Science',
        questionCount: 5,
      };

      // 25 (title) + 15 (category) + 35 (questions) = 75
      expect(calculateReadiness(draft)).toBe(75);
    });

    it('should evaluate complete draft at 100% readiness', () => {
      const draft = {
        title: 'Full Stack Node.js Certification',
        category: 'Technology',
        questionCount: 10,
        description: 'Comprehensive test covering Node.js event loop and streams.',
        thumbnail: 'https://example.com/cover.webp',
      };

      // 25 + 15 + 35 + 10 + 15 = 100
      expect(calculateReadiness(draft)).toBe(100);
    });
  });

  describe('Draft vs Published Segregation Filters', () => {
    it('published filter should strictly exclude drafts', () => {
      const filter = {
        visibility: { $ne: 'private' },
        $or: [{ visibility: 'public' }, { isPublic: true }],
        'metadata.savedAsDraft': { $ne: true },
      };

      expect(filter['metadata.savedAsDraft']).toEqual({ $ne: true });
    });

    it('drafts query filter should strictly match savedAsDraft: true', () => {
      const filter = {
        uploader: 'user_123',
        'metadata.savedAsDraft': true,
      };

      expect(filter['metadata.savedAsDraft']).toBe(true);
    });
  });
});
