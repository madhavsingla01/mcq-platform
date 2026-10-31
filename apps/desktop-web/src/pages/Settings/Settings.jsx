import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Sliders,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import {
  searchSettingsCategories,
  SETTINGS_CATEGORIES,
  SettingsSidebar,
} from './components/SettingsSidebar';
import { SettingsInfo } from './components/SettingsSection';

// 8 Dedicated Category Components
import { AccountSettings } from './components/AccountSettings';
import { PrivacySettings } from './components/PrivacySettings';
import { NotificationSettings } from './components/NotificationSettings';
import { CompetitionSettings } from './components/CompetitionSettings';
import { FeedSettings } from './components/FeedSettings';
import { AppearanceSettings } from './components/AppearanceSettings';
import { ActivitySettings } from './components/ActivitySettings';
import { HelpSettings } from './components/HelpSettings';

import './Settings.css';

const CATEGORY_COMPONENTS = {
  account: AccountSettings,
  privacy: PrivacySettings,
  notifications: NotificationSettings,
  challenges: CompetitionSettings,
  feed: FeedSettings,
  appearance: AppearanceSettings,
  activity: ActivitySettings,
  help: HelpSettings,
};

// Aliases mapping older route URLs to the 8 standard categories
const LEGACY_MAP = {
  info: 'account',
  profile: 'account',
  public: 'account',
  security: 'privacy',
  preferences: 'appearance',
  theme: 'appearance',
  data: 'activity',
};

// Framer Motion Spring Configurations
const SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.9,
};

// Desktop Direction-Aware Slide Variants
const desktopPanelVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 36 : -36,
    opacity: 0,
    scale: 0.995,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: SPRING_TRANSITION,
      opacity: { duration: 0.2 },
      scale: { duration: 0.2 },
    },
  },
  exit: (direction) => ({
    x: direction < 0 ? 36 : -36,
    opacity: 0,
    scale: 0.995,
    transition: {
      x: SPRING_TRANSITION,
      opacity: { duration: 0.15 },
    },
  }),
};

// Mobile Multi-Level Sliding Card Variants (Instagram Mobile Pattern)
const mobileRootVariants = {
  active: {
    x: '0%',
    scale: 1,
    opacity: 1,
    filter: 'brightness(1)',
    transition: SPRING_TRANSITION,
  },
  pushed: {
    x: '-24%',
    scale: 0.96,
    opacity: 0.45,
    filter: 'brightness(0.6)',
    transition: SPRING_TRANSITION,
  },
};

const mobileSubPanelVariants = {
  initial: {
    x: '100%',
  },
  animate: {
    x: '0%',
    transition: SPRING_TRANSITION,
  },
  exit: {
    x: '100%',
    transition: {
      type: 'spring',
      stiffness: 380,
      damping: 35,
    },
  },
};

export default function Settings() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [mobileSearchQuery, setMobileSearchQuery] = useState('');

  // Map category IDs to sequential indices for direction detection
  const categoryIndexMap = useMemo(() => {
    const map = {};
    SETTINGS_CATEGORIES.forEach((cat, idx) => {
      map[cat.id] = idx;
    });
    return map;
  }, []);

  // Resolve active category ID from URL parameter or legacy aliases
  const resolvedCategoryId = useMemo(() => {
    if (!tab) return null;
    const key = tab.toLowerCase();
    const mapped = LEGACY_MAP[key] || key;
    const found = SETTINGS_CATEGORIES.some((c) => c.id === mapped);
    return found ? mapped : null;
  }, [tab]);

  // Desktop active category defaults to 'account' if none is in URL
  const desktopActiveId = resolvedCategoryId || 'account';
  const DesktopActiveComponent = CATEGORY_COMPONENTS[desktopActiveId] || AccountSettings;
  const currentCategoryObj = SETTINGS_CATEGORIES.find((c) => c.id === desktopActiveId) || SETTINGS_CATEGORIES[0];
  const currentIndex = categoryIndexMap[desktopActiveId] ?? 0;

  // Direction tracking for smooth directional sliding card animations
  const [direction, setDirection] = useState(1);

  // Mobile active category (null means root category list)
  const mobileActiveCategory = resolvedCategoryId
    ? SETTINGS_CATEGORIES.find((c) => c.id === resolvedCategoryId)
    : null;
  const MobileActiveComponent = resolvedCategoryId ? CATEGORY_COMPONENTS[resolvedCategoryId] : null;

  const handleSelectCategory = (categoryId) => {
    const nextIdx = categoryIndexMap[categoryId] ?? 0;
    setDirection(nextIdx >= currentIndex ? 1 : -1);
    navigate(`/settings/${categoryId}`);
  };

  const handleMobileBack = () => {
    setDirection(-1);
    navigate('/settings');
  };

  const avatarLetter = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();
  const CurrentIcon = currentCategoryObj.icon;

  // Filtered categories for mobile root list
  const filteredMobileCategories = useMemo(() => {
    return searchSettingsCategories(mobileSearchQuery);
  }, [mobileSearchQuery]);

  return (
    <div className="settings-page-shell settings-preferences-shell">
      {/* ========================================================
          DESKTOP VIEW (> 860px)
          Stacked floating cards with depth shadow and slide transitions
          ======================================================== */}
      <div className="settings-stacked-shell">
        <div className="settings-stacked-viewport">
          {/* Left Stack Layer: Settings Sidebar Card */}
          <SettingsSidebar
            activeCategory={desktopActiveId}
            onSelectCategory={handleSelectCategory}
            user={user}
          />

          {/* Right Stack Layer: Content Card with Peek Layer Depth */}
          <div className="settings-stacked-content-wrap">
            {/* Subtle Deck Peek Layer Behind Active Card */}
            <div className="settings-stacked-deck-peek" aria-hidden="true" />

            <main className="settings-stacked-content-card" id="settings-desktop-panel">
              {/* Stacked Header with Interactive Breadcrumbs */}
              <div className="settings-stacked-header">
                <nav className="settings-breadcrumbs" aria-label="Settings breadcrumb path">
                  <button
                    type="button"
                    className="settings-breadcrumb-btn"
                    onClick={() => handleSelectCategory('account')}
                    title="Settings Overview"
                  >
                    <Sliders size={14} className="text-orange-500" />
                    <span>Settings</span>
                  </button>

                  <span className="settings-breadcrumb-sep">/</span>

                  <span className="settings-breadcrumb-current">
                    <span className="settings-breadcrumb-badge">
                      <CurrentIcon size={13} />
                      <span>{currentCategoryObj.title}</span>
                    </span>
                  </span>
                </nav>

              </div>

              {/* Directional Horizontal Sliding Panel */}
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={desktopActiveId}
                  custom={direction}
                  variants={desktopPanelVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="settings-stacked-slide-panel"
                >
                  <DesktopActiveComponent />
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </div>

      {/* ========================================================
          MOBILE VIEW (<= 860px - Instagram Multi-Level Sliding Card Stack)
          Level 0 pushes left with dimming, Level 1 slides over from right
          ======================================================== */}
      <div className="settings-mobile-container">
        <div className="settings-mobile-stack-viewport">
          {/* Level 0: Root Menu Card */}
          <motion.div
            className="settings-mobile-root-card"
            animate={mobileActiveCategory ? 'pushed' : 'active'}
            variants={mobileRootVariants}
          >
            <div className="settings-mobile-root-header consistent-page-header">
              <div className="settings-panel-title-row">
                <h1 className="settings-mobile-root-heading consistent-page-title">Settings</h1>
                <SettingsInfo text="Manage your account and platform preferences." />
              </div>
              <div className="settings-mobile-search-wrap consistent-search-field consistent-page-search">
                <Search size={15} color="#64748b" />
                <input
                  type="text"
                  className="settings-mobile-search-input consistent-search-input"
                  placeholder="Search"
                  value={mobileSearchQuery}
                  onChange={(e) => setMobileSearchQuery(e.target.value)}
                />
                {mobileSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMobileSearchQuery('')}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Mobile User Micro Card */}
            <div className="settings-sidebar-user-card" style={{ marginBottom: 14 }}>
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
                <button
                  type="button"
                  onClick={() => navigate(`/@${user.username}`)}
                  className="settings-sidebar-profile-link"
                  title="View Public Profile"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>

            {/* Instagram-style Grouped Category Rows */}
            <div className="settings-mobile-category-list">
              {filteredMobileCategories.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">
                  No matching settings
                </div>
              ) : (
                filteredMobileCategories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.id} className="settings-mobile-category-item">
                      <button
                        type="button"
                        className="settings-mobile-category-row"
                        onClick={() => handleSelectCategory(cat.id)}
                      >
                        <div className="settings-mobile-row-icon-wrap">
                          <Icon size={18} />
                        </div>
                        <div className="settings-mobile-row-info">
                          <span className="settings-mobile-row-title">{cat.title}</span>
                        </div>
                        <ChevronRight size={18} className="settings-mobile-row-chevron" />
                      </button>
                      <span className="settings-mobile-category-info">
                        <SettingsInfo text={cat.description} />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* Level 1: Subscreen Sliding Card (Instagram Multi-Level Layer) */}
          <AnimatePresence>
            {mobileActiveCategory && (
              <motion.div
                key={mobileActiveCategory.id}
                className="settings-mobile-subpanel-card"
                variants={mobileSubPanelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {/* Sticky Header with Back Button and Breadcrumbs */}
                <div className="settings-mobile-subscreen-header">
                  <button
                    type="button"
                    className="settings-mobile-back-btn"
                    onClick={handleMobileBack}
                    aria-label="Back to settings"
                  >
                    <ChevronLeft size={17} />
                    <span>Settings</span>
                  </button>

                  <div className="settings-mobile-subscreen-title-wrap">
                    <span className="settings-breadcrumb-badge">
                      <CurrentIcon size={12} />
                      <span>{mobileActiveCategory.shortTitle || mobileActiveCategory.title}</span>
                    </span>
                  </div>

                </div>

                {/* Subscreen Scrollable Content */}
                <div className="settings-mobile-subscreen-body">
                  {MobileActiveComponent && <MobileActiveComponent />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
