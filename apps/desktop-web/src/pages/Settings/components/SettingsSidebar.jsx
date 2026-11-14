import { rankSearchResults } from '../../../components/search/rankSearchResults';
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  MessageSquare,
} from 'lucide-react';
import { SettingsInfo } from './SettingsSection';

export const SETTINGS_CATEGORIES = [
  {
    id: 'messaging', title: 'Messaging', shortTitle: 'Messaging', icon: MessageSquare,
    description: 'Message composer, read receipts and typing privacy',
    searchTerms: ['chat', 'messages', 'read receipts', 'typing', 'enter'],
  },
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

export function searchSettingsCategories(query) {
  return rankSearchResults(SETTINGS_CATEGORIES, query, category => [
    category.title, category.shortTitle, category.searchTerms || [], category.description,
  ]);
}

export function SettingsSidebar({
  activeCategory,
  onSelectCategory,
  user,
  searchQuery = '',
}) {
  const avatarLetter = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();

  const filteredCategories = useMemo(() => {
    return searchSettingsCategories(searchQuery);
  }, [searchQuery]);

  return (
    <aside className="settings-stacked-sidebar-card">
      {/* Top Title & User Capsule */}
      <div className="settings-sidebar-header">
        <div className="settings-panel-title-row">
          <h2 className="settings-sidebar-heading">Categories</h2>
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
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectCategory(cat.id)}
              >
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
