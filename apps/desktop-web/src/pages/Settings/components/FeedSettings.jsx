import React, { useState, useEffect } from 'react';
import { Sliders, Filter, EyeOff, Check, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
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

  const [localBanner, setLocalBanner] = useState('');

  useEffect(() => {
    if (user?.preferences) {
      setFeed((prev) => ({
        ...prev,
        defaultDifficulty: user.preferences.defaultDifficulty || user.preferences.feed?.defaultDifficulty || prev.defaultDifficulty,
        preferredCategory: user.preferences.primaryCategory || user.preferences.feed?.preferredCategory || prev.preferredCategory,
        hideCompletedQuizzes: user.preferences.hideCompletedQuizzes ?? user.preferences.feed?.hideCompletedQuizzes ?? prev.hideCompletedQuizzes,
        filterUnverified: user.preferences.filterUnverified ?? user.preferences.feed?.filterUnverified ?? prev.filterUnverified,
      }));
    }
  }, [user]);

  const showBanner = (msg = 'Feed preferences updated') => {
    setLocalBanner(msg);
    setTimeout(() => setLocalBanner(''), 3000);
  };

  const handleUpdate = async (field, val) => {
    const nextFeed = { ...feed, [field]: val };
    setFeed(nextFeed);

    try {
      await updateProfile({
        preferences: {
          ...user?.preferences,
          defaultDifficulty: nextFeed.defaultDifficulty,
          primaryCategory: nextFeed.preferredCategory,
          hideCompletedQuizzes: nextFeed.hideCompletedQuizzes,
          filterUnverified: nextFeed.filterUnverified,
          feed: nextFeed,
        },
      });
      toast.success('Feed preferences updated');
      showBanner();
    } catch (err) {
      toast.error('Failed to update feed preferences');
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

      {localBanner && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{localBanner}</span>
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
