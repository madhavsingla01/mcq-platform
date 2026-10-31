import React, { useState, useEffect } from 'react';
import { Sliders, Filter, EyeOff, Check, BookOpen } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { SettingsInfo, SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';

const CATEGORIES = [
  'All Categories',
  'General',
  'Computer Science',
  'Science',
  'Mathematics',
  'History',
  'Languages',
  'Business',
];

export function FeedSettings() {
  const { user, updateProfile } = useAuthStore();

  const [feed, setFeed] = useState({
    defaultDifficulty: 'All Levels',
    preferredCategory: 'All Categories',
    hideCompletedQuizzes: false,
    filterUnverified: false,
  });

  const [toast, setToast] = useState('');

  useEffect(() => {
    if (user?.preferences?.feed) {
      setFeed((prev) => ({
        ...prev,
        ...user.preferences.feed,
      }));
    }
  }, [user]);

  const showToast = (msg = 'Feed preferences updated') => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleUpdate = async (field, val) => {
    const nextFeed = { ...feed, [field]: val };
    setFeed(nextFeed);

    try {
      await updateProfile({
        preferences: {
          feed: nextFeed,
        },
      });
      showToast();
    } catch (err) {
      console.error('Failed to update feed preferences:', err);
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Feed & Content</h2>
          <SettingsInfo text="Customize your discovery feed, set learning priorities, and filter community content." />
        </div>
      </div>

      {toast && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Explore Feed Preferences */}
      <SettingsSection
        title="Explore Recommendations"
        description="Choose what quizzes are prioritized on your Explore page."
        icon={Sliders}
      >
        <SettingsRow
          title="Default Difficulty Focus"
          description="Tailor quiz recommendations to your current skill level."
        >
          <SettingsSelect
            value={feed.defaultDifficulty}
            onChange={(val) => handleUpdate('defaultDifficulty', val)}
            options={[
              { value: 'All Levels', label: 'All Levels (Balanced)' },
              { value: 'Beginner', label: 'Beginner (Introductory)' },
              { value: 'Intermediate', label: 'Intermediate (Practical)' },
              { value: 'Advanced', label: 'Advanced (Mastery)' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Primary Learning Category"
          description="Quizzes from this subject will appear prominently in your personalized feed."
        >
          <SettingsSelect
            value={feed.preferredCategory}
            onChange={(val) => handleUpdate('preferredCategory', val)}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 2. Content Filters */}
      <SettingsSection
        title="Content Filtering"
        description="Hide redundant quizzes or unverified community submissions."
        icon={Filter}
      >
        <SettingsRow
          title="Hide Already Completed Quizzes"
          description="Don't show quizzes in Explore if you have already achieved a passing score."
        >
          <SettingsToggle
            checked={feed.hideCompletedQuizzes}
            onChange={(checked) => handleUpdate('hideCompletedQuizzes', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Verified Quizzes & Answer Keys"
          description="Filter explore results to prioritize community-verified question banks and verified answer keys."
        >
          <SettingsToggle
            checked={feed.filterUnverified}
            onChange={(checked) => handleUpdate('filterUnverified', checked)}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default FeedSettings;
