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
import { SettingsInfo, SettingsSection, SettingsRow, SettingsToggle } from './SettingsSection';
import { Button, Input, Label, CustomSelect, showCustomDialog } from '../../../components/ui';
import { compressAvatar, compressImage } from '../../../utils/imageCompressor';
import api from '../../../api/axios';
import { runWithUploadPanel } from '../../../store/uploadPanelStore';
import { MediaService } from '../../../services/media.service';

const PREDEFINED_PLATFORMS = ['Website', 'GitHub', 'LinkedIn', 'Twitter', 'YouTube', 'Other'];

export function AccountSettings() {
  const { user, updateProfile } = useAuthStore();
  const fileRef = useRef(null);
  const bannerFileRef = useRef(null);

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
  const [bannerUploading, setBannerUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
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
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setStatusMessage({ type: '', text: '' });
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
      setFormData((prev) => ({ ...prev, avatar: response.data?.data?.avatar || '' }));
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
    setSocialLinks([...socialLinks, { platform: 'Website', url: '' }]);
  };

  const handleRemoveSocialLink = (index) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const handleSocialLinkChange = (index, field, value) => {
    const updated = [...socialLinks];
    updated[index] = { ...updated[index], [field]: value };
    setSocialLinks(updated);
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    setProfileSaving(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const cleanUsername = formData.username.trim().toLowerCase().replace(/^@/, '');
      if (cleanUsername.length < 3) {
        throw new Error('Username must be at least 3 characters');
      }

      const filteredLinks = socialLinks
        .map((l) => ({ platform: l.platform, url: l.url.trim() }))
        .filter((l) => l.url);

      const payload = {
        name: formData.name.trim(),
        username: cleanUsername,
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        bio: formData.bio.trim(),
        gender: formData.gender,
        avatar: formData.avatar,
        banner: formData.banner,
        socialLinks: filteredLinks,
      };

      await updateProfile(payload);
      setStatusMessage({ type: 'success', text: 'Profile changes saved successfully!' });
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

      {/* 1. Profile Picture & Core Identity */}
      <SettingsSection
        title="Public Profile & Identity"
        description="Your avatar and public details are visible to other learners and creators across QuizFocus."
        icon={User}
      >
        {/* Avatar Row */}
        <SettingsRow
          title="Profile Avatar"
          description="Supports PNG, JPG, or WEBP up to 5MB."
          align="start"
        >
          <div className="settings-avatar-edit-box">
            <input
              type="file"
              ref={fileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleAvatarFile(e.target.files[0]);
              }}
            />
            <div className="settings-avatar-preview-wrap">
              {formData.avatar ? (
                <img
                  src={formData.avatar}
                  alt="Avatar"
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
            <div className="settings-avatar-btn-group">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="settings-btn-upload-avatar"
              >
                <Camera size={14} />
                <span>Upload New</span>
              </Button>
              {formData.avatar && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleInputChange('avatar', '')}
                  className="settings-btn-remove-avatar"
                >
                  <Trash2 size={13} />
                  <span>Remove</span>
                </Button>
              )}
            </div>
          </div>
        </SettingsRow>

        {/* Profile Banner */}
        <SettingsRow
          title="Profile Banner"
          description="Panoramic banner for your profile. 1920x600 recommended."
          align="start"
        >
          <div className="settings-banner-edit-box">
            <input
              type="file"
              ref={bannerFileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleBannerFile(e.target.files[0]);
              }}
            />
            <div className="settings-banner-preview-wrap">
              {formData.banner ? (
                <>
                  <img
                    src={formData.banner}
                    alt="Profile Banner Preview"
                    className="settings-banner-preview-img"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="settings-banner-fade" />
                </>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--color-text-muted)',
                  fontSize: '12px',
                  gap: '6px'
                }}>
                  <Camera size={20} />
                  <span>No banner uploaded</span>
                </div>
              )}
            </div>
            <div className="settings-banner-btn-group">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bannerFileRef.current?.click()}
                disabled={bannerUploading}
                className="settings-btn-upload-avatar"
              >
                <Camera size={14} />
                <span>{bannerUploading ? 'Uploading...' : 'Change Banner'}</span>
              </Button>
              {formData.banner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveBanner}
                  disabled={bannerUploading}
                  className="settings-btn-remove-avatar"
                >
                  <Trash2 size={13} />
                  <span>Remove</span>
                </Button>
              )}
            </div>
          </div>
        </SettingsRow>

        {/* Display Name */}
        <SettingsRow
          title="Display Name"
          description="Your public full name shown on leaderboards and quizzes."
        >
          <Input
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="e.g. Alex Morgan"
            className="settings-input-control"
          />
        </SettingsRow>

        {/* Username */}
        <SettingsRow
          title="Username"
          description="Your unique @handle for profile links and mentions."
        >
          <div className="settings-username-input-wrap">
            <span className="settings-at-prefix">@</span>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="username"
              className="settings-username-input"
            />
          </div>
        </SettingsRow>

        {/* Bio */}
        <SettingsRow
          title="Bio"
          description="Tell the community about your expertise and learning interests (max 2000 chars)."
          align="start"
        >
          <textarea
            value={formData.bio}
            onChange={(e) => handleInputChange('bio', e.target.value)}
            placeholder="Write a brief intro about yourself..."
            rows={3}
            className="settings-textarea-control"
            maxLength={2000}
          />
        </SettingsRow>

        {/* Profile Privacy */}
        <SettingsRow
          title="Profile Privacy"
          description={formData.isPrivate
            ? "Your profile and quizzes are restricted and hidden from public explore."
            : "Your profile is public. Anyone can view your profile and public quizzes."}
        >
          <SettingsToggle
            checked={formData.isPrivate}
            onChange={(checked) => handleInputChange('isPrivate', checked)}
            label={formData.isPrivate ? 'Private Profile' : 'Public Profile'}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 2. Public Links */}
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

        <div className="settings-actions-footer">
          <Button
            variant="primary"
            onClick={handleSaveProfile}
            disabled={profileSaving}
            className="settings-save-btn"
          >
            {profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}
          </Button>
        </div>
      </SettingsSection>

      {/* 3. Password & Security Credentials */}
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
