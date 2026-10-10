import { useState, useEffect } from 'react';
import { Plus, Trash2, Globe, Link as LinkIcon } from 'lucide-react';
import { FaGithub, FaTwitter, FaLinkedin, FaYoutube, FaInstagram } from 'react-icons/fa';
import { useAuthStore } from '../../store/authStore';
import { Card, Button, Input, Label } from '../../components/ui';

const PREDEFINED_PLATFORMS = ['Website', 'Twitter', 'GitHub', 'LinkedIn', 'YouTube', 'Instagram', 'Other'];

export default function PublicProfileSettings() {
  const { user, updateProfile } = useAuthStore();
  const [isProfilePublic, setIsProfilePublic] = useState(true);
  const [socialLinks, setSocialLinks] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setIsProfilePublic(user.isProfilePublic !== false);
      if (Array.isArray(user.socialLinks)) {
        setSocialLinks(user.socialLinks);
      } else if (user.socialLinks && typeof user.socialLinks === 'object') {
        // Handle migration from old object structure
        const migrated = [];
        if (user.socialLinks.website) migrated.push({ platform: 'Website', url: user.socialLinks.website });
        if (user.socialLinks.personalId) migrated.push({ platform: 'Other', url: user.socialLinks.personalId });
        setSocialLinks(migrated);
      }
    }
  }, [user]);

  const handleAddLink = () => {
    setSocialLinks([...socialLinks, { platform: 'Website', url: '' }]);
  };

  const handleRemoveLink = (index) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const handleChangeLink = (index, field, value) => {
    const newLinks = [...socialLinks];
    newLinks[index][field] = value;
    setSocialLinks(newLinks);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      // Filter out empty urls
      const validLinks = socialLinks.filter(l => l.url.trim() !== '');
      await updateProfile({
        isProfilePublic,
        socialLinks: validLinks
      });
      alert('Public profile settings updated successfully!');
      setSocialLinks(validLinks); // clean up UI state
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update public profile settings');
    } finally {
      setSaving(false);
    }
  };

  const getPlatformIcon = (platform) => {
    switch ((platform || '').toLowerCase()) {
      case 'twitter': return <FaTwitter size={18} />;
      case 'github': return <FaGithub size={18} />;
      case 'linkedin': return <FaLinkedin size={18} />;
      case 'youtube': return <FaYoutube size={18} />;
      case 'instagram': return <FaInstagram size={18} />;
      case 'website': return <Globe size={18} />;
      default: return <LinkIcon size={18} />;
    }
  };

  return (
    <Card style={{ padding: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Public Profile</h2>
      
      {/* Visibility Toggle */}
      <div style={{ padding: '20px', borderRadius: 12, border: '1px solid var(--color-border)', marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Profile Visibility</h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 400 }}>
            When public, anyone can view your profile at /@username and see your public quizzes and stats.
          </p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
          <input 
            type="checkbox" 
            checked={isProfilePublic}
            onChange={(e) => setIsProfilePublic(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }} 
          />
          <span style={{
            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: isProfilePublic ? 'var(--color-primary)' : 'var(--color-border)',
            transition: '.4s', borderRadius: 34
          }}>
            <span style={{
              position: 'absolute', content: '""', height: 18, width: 18, left: 3, bottom: 3,
              backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
              transform: isProfilePublic ? 'translateX(20px)' : 'translateX(0)'
            }} />
          </span>
        </label>
      </div>

      {/* Social Links Builder */}
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Social Links</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          Add links to your website, portfolio, and social media profiles.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {socialLinks.map((link, index) => (
            <div key={index} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 8, background: 'var(--color-surface-alt)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                {getPlatformIcon(link.platform)}
              </div>
              <select 
                value={link.platform}
                onChange={(e) => handleChangeLink(index, 'platform', e.target.value)}
                style={{
                  height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', width: 140
                }}
              >
                {PREDEFINED_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <Input 
                value={link.url || ''}
                onChange={(e) => handleChangeLink(index, 'url', e.target.value)}
                placeholder="https://"
                style={{ flex: 1, margin: 0 }}
              />
              <button 
                onClick={() => handleRemoveLink(index)}
                style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
                className="hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Remove link"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {socialLinks.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 12, color: 'var(--color-text-muted)', fontSize: 14 }}>
              No social links added yet.
            </div>
          )}
        </div>

        <Button variant="secondary" onClick={handleAddLink} style={{ gap: 6 }}>
          <Plus size={16} /> Add Link
        </Button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--color-border)' }}>
        <Button onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>
    </Card>
  );
}
