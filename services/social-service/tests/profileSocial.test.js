import { jest } from '@jest/globals';

describe('Profile & Social Links Logic', () => {
  it('normalizes and sanitizes social link URLs', () => {
    const rawLinks = [
      { platform: 'GitHub', url: 'https://github.com/developer' },
      { platform: 'Twitter', url: '  https://x.com/tech  ' },
      { platform: 'Invalid Empty', url: '   ' },
      { platform: 'Website', url: 'https://example.com/portfolio' },
    ];

    const sanitized = rawLinks
      .map((link) => ({
        platform: String(link.platform || 'Website').trim().slice(0, 40),
        url: String(link.url || '').trim().slice(0, 500),
      }))
      .filter((link) => link.url);

    expect(sanitized).toHaveLength(3);
    expect(sanitized[0]).toEqual({ platform: 'GitHub', url: 'https://github.com/developer' });
    expect(sanitized[1]).toEqual({ platform: 'Twitter', url: 'https://x.com/tech' });
    expect(sanitized[2]).toEqual({ platform: 'Website', url: 'https://example.com/portfolio' });
  });

  it('limits social links to maximum 12 items', () => {
    const manyLinks = Array.from({ length: 20 }, (_, i) => ({
      platform: `Link ${i}`,
      url: `https://link${i}.com`,
    }));

    const capped = manyLinks
      .map((link) => ({
        platform: String(link.platform).trim().slice(0, 40),
        url: String(link.url).trim().slice(0, 500),
      }))
      .filter((link) => link.url)
      .slice(0, 12);

    expect(capped).toHaveLength(12);
  });

  it('correctly handles profile privacy checks', () => {
    const assertProfileVisible = (user, viewer) => {
      const isOwner = viewer && String(viewer._id) === String(user._id);
      const isAdmin = viewer?.role === 'admin';
      if (user.isProfilePublic === false && !isOwner && !isAdmin) {
        throw new Error('This profile is private');
      }
      return true;
    };

    const privateUser = { _id: 'user1', isProfilePublic: false };
    const stranger = { _id: 'user2', role: 'user' };
    const owner = { _id: 'user1', role: 'user' };
    const admin = { _id: 'user3', role: 'admin' };

    expect(() => assertProfileVisible(privateUser, stranger)).toThrow('This profile is private');
    expect(assertProfileVisible(privateUser, owner)).toBe(true);
    expect(assertProfileVisible(privateUser, admin)).toBe(true);
  });

  it('filters creators: only public users with creator status or published quizzes qualify', () => {
    const isEligibleCreator = (user) => {
      const isPublic = user.isProfilePublic !== false && !user.isPrivate;
      const isCreator = Boolean(user.isCreator) || user.accountType === 'creator' || (user.quizCount || 0) > 0;
      return isPublic && isCreator;
    };

    const regularLearner = { username: 'beta_tester', isProfilePublic: true, isPrivate: false, accountType: 'personal', isCreator: false, quizCount: 0 };
    const verifiedCreator = { username: 'madhav', isProfilePublic: true, isPrivate: false, accountType: 'creator', isCreator: true, quizCount: 5 };
    const quizAuthor = { username: 'author1', isProfilePublic: true, isPrivate: false, accountType: 'personal', isCreator: false, quizCount: 2 };
    const privateCreator = { username: 'secret_creator', isProfilePublic: false, isPrivate: true, accountType: 'creator', isCreator: true, quizCount: 10 };

    expect(isEligibleCreator(regularLearner)).toBe(false);
    expect(isEligibleCreator(verifiedCreator)).toBe(true);
    expect(isEligibleCreator(quizAuthor)).toBe(true);
    expect(isEligibleCreator(privateCreator)).toBe(false);
  });

  it('synchronizes isPrivate and isProfilePublic flags correctly', () => {
    const syncPrivacy = (input) => {
      let isPrivate = input.isPrivate;
      let isProfilePublic = input.isProfilePublic;
      if (input.isPrivate !== undefined) {
        isProfilePublic = !input.isPrivate;
      } else if (input.isProfilePublic !== undefined) {
        isPrivate = !input.isProfilePublic;
      }
      return { isPrivate, isProfilePublic };
    };

    expect(syncPrivacy({ isPrivate: true })).toEqual({ isPrivate: true, isProfilePublic: false });
    expect(syncPrivacy({ isPrivate: false })).toEqual({ isPrivate: false, isProfilePublic: true });
    expect(syncPrivacy({ isProfilePublic: false })).toEqual({ isPrivate: true, isProfilePublic: false });
    expect(syncPrivacy({ isProfilePublic: true })).toEqual({ isPrivate: false, isProfilePublic: true });
  });
});
