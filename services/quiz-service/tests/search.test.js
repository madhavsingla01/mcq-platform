import { describe, it, expect } from '@jest/globals';
import { normalizeTags } from '../dist/controllers/search.controller.js';

describe('Search Engine & Hashtag Normalization', () => {
  describe('normalizeTags', () => {
    it('should strip leading # characters and convert to lowercase', () => {
      const input = ['#JavaScript', '#React', '#WebDev'];
      const output = normalizeTags(input);
      expect(output).toEqual(['javascript', 'react', 'webdev']);
    });

    it('should handle comma-separated string input and multiple # prefixes', () => {
      const input = '##DSA, #algorithms, leetcode, #Dynamic_Programming';
      const output = normalizeTags(input);
      expect(output).toEqual(['dsa', 'algorithms', 'leetcode', 'dynamic_programming']);
    });

    it('should deduplicate tags and trim whitespace', () => {
      const input = ['#react', '  React  ', '#REACT', 'nextjs'];
      const output = normalizeTags(input);
      expect(output).toEqual(['react', 'nextjs']);
    });

    it('should filter out invalid characters and empty tokens', () => {
      const input = ['###', '   ', 'valid-tag', 'another_tag!@$'];
      const output = normalizeTags(input);
      expect(output).toEqual(['valid-tag', 'another_tag']);
    });

    it('should limit tag count to a reasonable maximum (12)', () => {
      const input = Array.from({ length: 20 }, (_, i) => `tag${i}`);
      const output = normalizeTags(input);
      expect(output).toHaveLength(12);
      expect(output[0]).toBe('tag0');
      expect(output[11]).toBe('tag11');
    });

    it('should return empty array for null or undefined input', () => {
      expect(normalizeTags(null)).toEqual([]);
      expect(normalizeTags(undefined)).toEqual([]);
      expect(normalizeTags('')).toEqual([]);
    });
  });
});
