import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
  Shield,
  Bell,
  Trophy,
  Sliders,
  Palette,
  History,
  HelpCircle,
  ChevronRight,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import { SettingsInfo } from './SettingsSection';

export const SETTINGS_CATEGORIES = [
  {
    id: 'account',
    title: 'Account & Profile',
    shortTitle: 'Account',
    icon: User,
    description: 'Personal info, username, avatar & security credentials',
    searchTerms: ['avatar', 'profile photo', 'name', 'username', 'email', 'password'],
  },
  {
    id: 'privacy',
    title: 'Privacy & Security',
    shortTitle: 'Privacy',
    icon: Shield,
    description: 'Public/private profile, sessions & security controls',
    searchTerms: ['visibility', 'private', 'public', 'login', 'sessions'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    shortTitle: 'Notifications',
    icon: Bell,
    description: 'Challenge invites, followers, comments & email digests',
    searchTerms: ['alerts', 'email', 'push', 'updates'],
  },
  {
    id: 'challenges',
    title: 'Competition & Challenges',
    shortTitle: 'Challenges',
    icon: Trophy,
    description: 'Challenge invitations, quiz defaults & ranking visibility',
    searchTerms: ['competition', 'leaderboard', 'quiz defaults', 'ranking'],
  },
  {
    id: 'feed',
    title: 'Feed & Content',
    shortTitle: 'Feed',
    icon: Sliders,
    description: 'Explore preferences, difficulty filters & content controls',
    searchTerms: ['explore', 'recommendations', 'difficulty', 'filters'],
  },
  {
    id: 'appearance',
    title: 'Appearance & Accessibility',
    shortTitle: 'Appearance',
    icon: Palette,
    description: 'Dark theme, OLED black, density & motion preferences',
    searchTerms: ['theme', 'dark mode', 'font', 'contrast', 'reduced motion'],
  },
  {
    id: 'activity',
    title: 'Your Activity & Data',
    shortTitle: 'Your Activity',
    icon: History,
    description: 'Quiz history, data export & account deactivation',
    searchTerms: ['history', 'download', 'export', 'delete account'],
  },
  {
    id: 'help',
    title: 'Help & About',
    shortTitle: 'Help',
    icon: HelpCircle,
    description: 'FAQ, problem reporting, terms & platform version',
    searchTerms: ['support', 'contact', 'report a problem', 'legal'],
  },
];

const normalizeSearchText = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const editDistance = (left, right) => {
  const distances = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, column) =>
      row === 0 ? column : column === 0 ? row : 0
    )
  );

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost
      );

      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        distances[row][column] = Math.min(
          distances[row][column],
          distances[row - 2][column - 2] + 1
        );
      }
    }
  }

  return distances[left.length][right.length];
};

const scoreSearchToken = (queryToken, searchableWords) => {
  let bestScore = 0;

  for (const word of searchableWords) {
    if (word === queryToken) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }
    if (word.startsWith(queryToken)) {
      bestScore = Math.max(bestScore, 75);
      continue;
    }
    if (word.includes(queryToken)) {
      bestScore = Math.max(bestScore, 60);
      continue;
    }

    const maxDistance = queryToken.length >= 5 ? 2 : 1;
    if (Math.abs(word.length - queryToken.length) <= maxDistance) {
      const distance = editDistance(queryToken, word);
      if (distance <= maxDistance) {
        bestScore = Math.max(bestScore, 40 - distance * 10);
      }
    }
  }

  return bestScore;
};

export function searchSettingsCategories(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return SETTINGS_CATEGORIES;

  const queryTokens = normalizedQuery.split(/\s+/);

  return SETTINGS_CATEGORIES
    .map((category, index) => {
      const fields = [
        { text: category.title, weight: 1.4 },
        { text: category.shortTitle, weight: 1.5 },
        { text: category.description, weight: 1 },
        { text: (category.searchTerms || []).join(' '), weight: 1.3 },
      ].map(({ text, weight }) => ({
        text: normalizeSearchText(text),
        weight,
      }));
      const searchableText = fields.map(({ text }) => text).join(' ');
      const tokenScores = queryTokens.map((token) =>
        Math.max(
          ...fields.map(({ text, weight }) =>
            scoreSearchToken(token, text.split(/\s+/)) * weight
          )
        )
      );

      if (tokenScores.some((score) => score === 0)) {
        return null;
      }

      const exactPhraseBonus = searchableText.includes(normalizedQuery) ? 50 : 0;
      return {
        category,
        index,
        score: tokenScores.reduce((total, score) => total + score, 0) + exactPhraseBonus,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ category }) => category);
}

export function SettingsSidebar({
  activeCategory,
  onSelectCategory,
  user,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const avatarLetter = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();

  const filteredCategories = useMemo(() => {
    return searchSettingsCategories(searchQuery);
  }, [searchQuery]);

  return (
    <aside className="settings-stacked-sidebar-card">
      {/* Top Title & User Capsule */}
      <div className="settings-sidebar-header">
        <div className="settings-panel-title-row">
          <h2 className="settings-sidebar-heading">Settings</h2>
          <SettingsInfo text="Manage your account and platform preferences." />
        </div>
      </div>

      {/* User Micro Profile Card */}
      <div className="settings-sidebar-user-card">
        <div className="settings-sidebar-avatar-wrap">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || 'User'}
              className="settings-sidebar-avatar-img"
              loading="lazy"
              decoding="async"
              width="40"
              height="40"
            />
          ) : (
            <span className="settings-sidebar-avatar-initial">{avatarLetter}</span>
          )}
        </div>
        <div className="settings-sidebar-user-details">
          <strong className="settings-sidebar-user-name">{user?.name || 'QuizFocus User'}</strong>
          <span className="settings-sidebar-user-meta">
            {user?.username ? `@${user.username}` : user?.email}
          </span>
        </div>
        {user?.username && (
          <Link
            to={`/@${user.username}`}
            className="settings-sidebar-profile-link"
            title="View Public Profile"
          >
            <ExternalLink size={13} />
          </Link>
        )}
      </div>

      {/* Interactive Category Search */}
      <div className="settings-sidebar-search-wrap consistent-search-field">
        <Search size={14} color="#64748b" />
        <input
          type="text"
          className="settings-sidebar-search-input consistent-search-input"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-gray-400 hover:text-white"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Category Nav List with Framer Motion Liquid Active Pill */}
      <nav className="settings-sidebar-nav" aria-label="Settings categories">
        {filteredCategories.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">
            No matching settings
          </div>
        ) : (
          filteredCategories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                className={`settings-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectCategory(cat.id)}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebarActivePill"
                    className="settings-nav-item-active-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <div className="settings-nav-item-icon-box">
                  <Icon size={17} />
                </div>
                <div className="settings-nav-item-text">
                  <span className="settings-nav-item-title">{cat.title}</span>
                </div>
                <ChevronRight size={14} className="settings-nav-chevron" />
              </button>
            );
          })
        )}
      </nav>

      {/* Footer Meta */}
      <div className="settings-sidebar-footer">
        <span>QuizFocus v1.2.0 • 2026</span>
      </div>
    </aside>
  );
}

export default SettingsSidebar;
