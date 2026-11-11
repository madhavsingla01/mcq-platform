import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  Camera,
  Trash2,
  Lock,
  Globe,
  Plus,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { SettingsInfo, SettingsSection, SettingsRow } from './SettingsSection';
import { Button, Input, CustomSelect, showCustomDialog } from '../../../components/ui';
import { compressAvatar, compressImage } from '../../../utils/imageCompressor';
import api from '../../../api/axios';
import { runWithUploadPanel } from '../../../store/uploadPanelStore';
import { MediaService } from '../../../services/media.service';
import { isProfilePrivate, profilePrivacyUpdate } from '../../../utils/profilePrivacy';

const PREDEFINED_PLATFORMS = ['Website', 'GitHub', 'LinkedIn', 'Twitter', 'YouTube', 'Other'];

const normalizeSocialLinks = (links) => {
  if (Array.isArray(links)) {
    return links
      .map((link) => ({ platform: link.platform, url: (link.url || '').trim() }))
      .filter((link) => link.url);
  }
  if (links && typeof links === 'object') {
    return [
      links.website && { platform: 'Website', url: links.website.trim() },
      links.personalId && { platform: 'Other', url: links.personalId.trim() },
    ].filter(Boolean);
  }
  return [];
};

export function AccountSettings() {
  const { user, updateProfile } = useAuthStore();
  const fileRef = useRef(null);
  const bannerFileRef = useRef(null);
  const profileHydratedRef = useRef(false);
  const profileUserIdRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    bio: '',
    gender: 'prefer_not_to_say',
    avatar: '',
    banner: '',
  });

  const [socialLinks, setSocialLinks] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!user) {
      profileHydratedRef.current = false;
      profileUserIdRef.current = null;
      return;
    }

    const userId = user._id || user.id || null;
    if (!profileHydratedRef.current || profileUserIdRef.current !== userId) {
      setFormData({
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        bio: user.bio || '',
        gender: user.gender || 'prefer_not_to_say',
        avatar: user.avatar || '',
        banner: user.banner || '',
      });

      if (Array.isArray(user.socialLinks)) {
        setSocialLinks(user.socialLinks);
      } else if (user.socialLinks && typeof user.socialLinks === 'object') {
        const migrated = [];
        if (user.socialLinks.website) migrated.push({ platform: 'Website', url: user.socialLinks.website });
        if (user.socialLinks.personalId) migrated.push({ platform: 'Other', url: user.socialLinks.personalId });
        setSocialLinks(migrated);
      }
      profileHydratedRef.current = true;
      profileUserIdRef.current = userId;
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setStatusMessage({ type: '', text: '' });
  };

  const handleProfilePrivacyChange = async (isPrivate) => {
    setPrivacySaving(true);
    setStatusMessage({ type: '', text: '' });
    try {
      await updateProfile(profilePrivacyUpdate(isPrivate));
      setStatusMessage({ type: 'success', text: 'Profile privacy updated.' });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error.response?.data?.message || error.message || 'Could not update profile privacy.',
      });
    } finally {
      setPrivacySaving(false);
    }
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showCustomDialog({
        title: 'File Too Large',
        message: 'Avatar image size exceeds the 8MB limit. Please choose a smaller image.',
        type: 'warning',
      });
      return;
    }
    try {
      const compressed = await compressAvatar(file, 320, 0.85);
      const avatarFile = compressed.file || file;
      const response = await runWithUploadPanel(avatarFile, { purpose: 'Profile avatar' }, (onUploadProgress) => (
        MediaService.uploadImage(avatarFile, 'profile-avatar', onUploadProgress)
          .then((asset) => api.post('/auth/me/avatar', { imageUrl: asset.url }))
      ));
      const avatar = response.data?.data?.avatar || '';
      setFormData((prev) => ({ ...prev, avatar }));
      if (user) {
        useAuthStore.setState({ user: { ...user, avatar } });
      }
      setStatusMessage({ type: 'success', text: 'Profile photo updated.' });
    } catch (error) {
      showCustomDialog({
        title: 'Avatar Upload Failed',
        message: error.response?.data?.message || 'Could not upload and sanitize this image.',
        type: 'error',
      });
    }
  };

  const handleBannerFile = async (file) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      showCustomDialog({
        title: 'File Too Large',
        message: 'Banner image size exceeds the 12MB limit. Please choose a smaller image.',
        type: 'warning',
      });
      return;
    }
    try {
      setBannerUploading(true);
      const compressed = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 600,
        quality: 0.85,
        outputFormat: 'image/webp',
      });

      const bannerFile = compressed.file || file;
      const res = await runWithUploadPanel(bannerFile, { purpose: 'Profile banner' }, (onUploadProgress) => (
        MediaService.uploadImage(bannerFile, 'profile-banner', onUploadProgress)
          .then((asset) => api.post('/auth/me/banner', { imageUrl: asset.url }))
      ));

      const newBanner = res.data?.data?.banner;
      setFormData((prev) => ({ ...prev, banner: newBanner }));
      if (user) {
        useAuthStore.setState({ user: { ...user, banner: newBanner } });
      }
      setStatusMessage({ type: 'success', text: 'Profile banner updated successfully!' });
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Failed to upload banner:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to upload profile banner',
      });
    } finally {
      setBannerUploading(false);
      if (bannerFileRef.current) bannerFileRef.current.value = '';
    }
  };

  const handleRemoveBanner = async () => {
    try {
      setBannerUploading(true);
      await api.delete('/auth/me/banner');
      setFormData((prev) => ({ ...prev, banner: '' }));
      if (user) {
        useAuthStore.setState({ user: { ...user, banner: '' } });
      }
      setStatusMessage({ type: 'success', text: 'Profile banner removed.' });
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Failed to remove banner:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to remove banner',
      });
    } finally {
      setBannerUploading(false);
    }
  };

  const handleAddSocialLink = () => {
    if (socialLinks.length >= 8) {
      showCustomDialog({
        title: 'Limit Reached',
        message: 'You can add up to 8 social links.',
        type: 'info',
      });
      return;
    }
    setStatusMessage({ type: '', text: '' });
    setSocialLinks([...socialLinks, { platform: 'Website', url: '' }]);
  };

  const handleRemoveSocialLink = (index) => {
    setStatusMessage({ type: '', text: '' });
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const handleSocialLinkChange = (index, field, value) => {
    setStatusMessage({ type: '', text: '' });
    const updated = [...socialLinks];
    updated[index] = { ...updated[index], [field]: value };
    setSocialLinks(updated);
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    setProfileSaving(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const filteredLinks = normalizeSocialLinks(socialLinks);

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        bio: formData.bio.trim(),
        gender: formData.gender,
        avatar: formData.avatar,
        banner: formData.banner,
        socialLinks: filteredLinks,
      };

      await updateProfile(payload);
      setStatusMessage({ type: 'success', text: 'Profile changes saved automatically.' });
      setTimeout(() => setStatusMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to save profile changes',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  useEffect(() => {
    if (!user || profileSaving || statusMessage.type === 'error') return undefined;

    const hasUnsavedChanges = formData.name.trim() !== (user.name || '').trim()
      || formData.bio.trim() !== (user.bio || '').trim()
      || formData.gender !== (user.gender || 'prefer_not_to_say')
      || formData.avatar !== (user.avatar || '')
      || JSON.stringify(normalizeSocialLinks(socialLinks))
        !== JSON.stringify(normalizeSocialLinks(user.socialLinks));

    if (!hasUnsavedChanges) return undefined;

    const timeoutId = setTimeout(() => {
      handleSaveProfile();
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [formData.name, formData.bio, formData.gender, formData.avatar, socialLinks, user, profileSaving, statusMessage.type]);

  const handleSavePassword = async (e) => {
    e?.preventDefault();
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current (old) password first' });
      return;
    }
    if (!password) {
      setPasswordMessage({ type: 'error', text: 'Please enter a new password' });
      return;
    }
    if (password.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match' });
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage({ type: '', text: '' });

    try {
      await updateProfile({
        currentPassword,
        password,
        confirmPassword,
      });
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setTimeout(() => setPasswordMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Failed to change password:', err);
      setPasswordMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update password',
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Account & Profile</h2>
          <SettingsInfo text="Manage your personal identity, public creator details, and account credentials." />
        </div>
      </div>

      {statusMessage.text && (
        <div className={`settings-alert-banner ${statusMessage.type}`}>
          {statusMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 1. Profile Images */}
      <SettingsSection
        title="Profile images"
        description="Customize the images shown on your public profile."
        icon={User}
        className="settings-profile-images-section"
      >
        <div className="settings-profile-images-grid">
          <div className="settings-profile-image-item">
            <div className="settings-profile-image-copy">
              <span className="settings-profile-image-title">Profile photo</span>
              <span className="settings-profile-image-description">
                PNG, JPG, or WEBP. Up to 8MB.
              </span>
            </div>
            <input
              type="file"
              ref={fileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleAvatarFile(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <div className="settings-profile-image-control">
              <div className="settings-avatar-preview-wrap">
                {formData.avatar ? (
                  <img
                    src={formData.avatar}
                    alt="Profile"
                    className="settings-avatar-preview-img"
                    loading="lazy"
                    decoding="async"
                    width="60"
                    height="60"
                  />
                ) : (
                  <span className="settings-avatar-initial">
                    {(formData.name?.[0] || formData.username?.[0] || 'U').toUpperCase()}
                  </span>
                )}
              </div>
              <div className="settings-profile-image-actions">
                <span className="settings-profile-image-status">
                  {formData.avatar ? 'Photo uploaded' : 'No photo uploaded'}
                </span>
                <div className="settings-banner-btn-group">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="settings-btn-upload-avatar"
                  >
                    <Camera size={14} />
                    <span>{formData.avatar ? 'Change photo' : 'Upload photo'}</span>
                  </Button>
                  {formData.avatar && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleInputChange('avatar', '')}
                      className="settings-btn-remove-avatar"
                      aria-label="Remove profile photo"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="settings-profile-image-item">
            <div className="settings-profile-image-copy">
              <span className="settings-profile-image-title">Profile banner</span>
              <span className="settings-profile-image-description">
                Wide image for your profile. 1920 × 600 recommended.
              </span>
            </div>
            <input
              type="file"
              ref={bannerFileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleBannerFile(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <div className="settings-profile-banner-control">
              <div className="settings-banner-preview-wrap">
                {formData.banner ? (
                  <img
                    src={formData.banner}
                    alt="Profile banner"
                    className="settings-banner-preview-img"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="settings-banner-empty">
                    <Camera size={18} />
                    <span>No banner uploaded</span>
                  </div>
                )}
              </div>
              <div className="settings-profile-banner-actions">
                <span className="settings-profile-image-status">
                  {formData.banner ? 'Banner uploaded' : 'No banner uploaded'}
                </span>
                <div className="settings-banner-btn-group">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => bannerFileRef.current?.click()}
                  disabled={bannerUploading}
                  className="settings-btn-upload-avatar"
                >
                  <Camera size={14} />
                  <span>{bannerUploading ? 'Uploading...' : formData.banner ? 'Change banner' : 'Upload banner'}</span>
                </Button>
                {formData.banner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveBanner}
                    disabled={bannerUploading}
                    className="settings-btn-remove-avatar"
                    aria-label="Remove profile banner"
                  >
                    <Trash2 size={13} />
                    <span>Remove</span>
                  </Button>
                )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 2. Profile Details */}
      <SettingsSection
        title="Edit profile"
        description="Manage the public information shown on your profile."
        icon={User}
        className="settings-edit-profile-section"
      >
        <div className="settings-profile-fields-grid">
          <label className="settings-profile-field">
            <span className="settings-profile-field-label">Display name</span>
            <Input
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="settings-input-control"
            />
          </label>

          <label className="settings-profile-field">
            <span className="settings-profile-field-label">Username</span>
            <div className="settings-username-input-wrap settings-username-readonly">
              <span className="settings-at-prefix">@</span>
              <input
                type="text"
                value={user?.username || ''}
                placeholder="username"
                className="settings-username-input"
                readOnly
                aria-describedby="settings-username-note"
              />
            </div>
            <span id="settings-username-note" className="settings-profile-image-description">
              Usernames are permanent and cannot be changed.
            </span>
          </label>

          <label className="settings-profile-field">
            <span className="settings-profile-field-label">Gender</span>
            <select
              value={formData.gender}
              onChange={(e) => handleInputChange('gender', e.target.value)}
              className="settings-input-control settings-profile-gender-select"
            >
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="settings-profile-field settings-profile-bio-field">
            <span className="settings-profile-field-label">Bio</span>
            <textarea
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder="Write a brief intro about yourself..."
              rows={4}
              className="settings-textarea-control"
              maxLength={2000}
            />
          </label>
        </div>

        <div className="settings-profile-visibility">
          <div>
            <span className="settings-profile-field-label">Profile visibility</span>
            <p className="settings-profile-image-description">
              {isProfilePrivate(user)
                ? 'Your profile and quizzes are hidden from public explore.'
                : 'Anyone can view your profile and public quizzes.'}
            </p>
          </div>
          <div className="settings-profile-visibility-options" role="group" aria-label="Profile visibility">
            <Button
              variant={!isProfilePrivate(user) ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleProfilePrivacyChange(false)}
              disabled={privacySaving || profileSaving || !isProfilePrivate(user)}
              aria-pressed={!isProfilePrivate(user)}
            >
              Public
            </Button>
            <Button
              variant={isProfilePrivate(user) ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleProfilePrivacyChange(true)}
              disabled={privacySaving || profileSaving || isProfilePrivate(user)}
              aria-pressed={isProfilePrivate(user)}
            >
              Private
            </Button>
          </div>
        </div>

        <div className="settings-autosave-status" role="status" aria-live="polite">
          {profileSaving ? 'Saving changes...' : 'Your profile changes save automatically.'}
        </div>
      </SettingsSection>

      {/* 3. Public Links */}
      <SettingsSection
        title="Social & Website Links"
        description="Add links to your portfolio, GitHub, LinkedIn, or social profiles."
        icon={Globe}
        action={
          <Button variant="secondary" size="sm" onClick={handleAddSocialLink}>
            <Plus size={14} />
            <span>Add Link</span>
          </Button>
        }
      >
        {socialLinks.length === 0 ? (
          <div className="settings-empty-links-hint">
            <p>No links added yet. Click &quot;Add Link&quot; to showcase your profiles.</p>
          </div>
        ) : (
          <div className="settings-links-list">
            {socialLinks.map((link, idx) => (
              <div key={idx} className="settings-link-row">
                <CustomSelect
                  value={link.platform}
                  onChange={(val) => handleSocialLinkChange(idx, 'platform', val)}
                  options={PREDEFINED_PLATFORMS}
                  size="sm"
                  style={{ width: 140, flexShrink: 0 }}
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => handleSocialLinkChange(idx, 'url', e.target.value)}
                  placeholder="https://..."
                  className="settings-link-url-input"
                />
                <button
                  type="button"
                  className="settings-link-delete-btn"
                  onClick={() => handleRemoveSocialLink(idx)}
                  title="Remove link"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

      </SettingsSection>

      {/* 4. Password & Security Credentials */}
      <SettingsSection
        title="Change Password"
        description="Update your account login password to keep your profile secure."
        icon={Lock}
      >
        {passwordMessage.text && (
          <div className={`settings-alert-banner ${passwordMessage.type}`}>
            {passwordMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{passwordMessage.text}</span>
          </div>
        )}

        <SettingsRow
          title="Current Password"
          description="Enter your existing account password first to verify your identity."
        >
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password first"
            className="settings-input-control"
          />
        </SettingsRow>

        <SettingsRow
          title="New Password"
          description="Minimum 6 characters with a combination of letters and numbers."
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            className="settings-input-control"
          />
        </SettingsRow>

        <SettingsRow
          title="Confirm New Password"
          description="Re-enter your new password to verify."
        >
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            className="settings-input-control"
          />
        </SettingsRow>

        <div className="settings-actions-footer">
          <Button
            variant="secondary"
            onClick={handleSavePassword}
            disabled={passwordSaving || !password || !currentPassword}
            className="settings-save-btn"
          >
            {passwordSaving ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}

export default AccountSettings;
