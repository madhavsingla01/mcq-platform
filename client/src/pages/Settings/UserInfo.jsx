import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card, Button, Input, Label } from '../../components/ui';

export default function UserInfo() {
  const { user, updateProfile } = useAuthStore();
  const fileRef = useRef(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    phone: '',
    bio: '',
    avatarPreview: ''
  });
  const [saving, setSaving] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);

  useEffect(() => {
    if (user) {
      const parts = (user.name || '').split(' ');
      setFormData({
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        email: user.email || '',
        username: user.username || '',
        phone: user.phone || '',
        bio: user.bio || '',
        avatarPreview: user.avatar || ''
      });
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUsernameChange = (e) => {
    const val = e.target.value;
    setFormData({ ...formData, username: val });
    // Simulate simple check - in reality this would hit an API
    if (val.length < 3) setUsernameAvailable(false);
    else setUsernameAvailable(true);
  };

  const handleChangeAvatar = (file) => {
    if (file.size > 2 * 1024 * 1024) {
      alert('File size exceeds 2MB limit');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setFormData(prev => ({ ...prev, avatarPreview: e.target.result }));
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      if (!usernameAvailable) {
        alert('Please choose a valid username');
        return;
      }
      const name = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
      await updateProfile({
        name,
        email: formData.email,
        username: formData.username,
        phone: formData.phone,
        bio: formData.bio,
        avatar: formData.avatarPreview
      });
      alert('User info updated successfully!');
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update user info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ padding: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>User Information</h2>
      
      {/* Avatar Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {formData.avatarPreview ? (
            <img src={formData.avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{formData.firstName?.[0] || 'U'}</span>
          )}
        </div>
        <div>
          <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) handleChangeAvatar(e.target.files[0]) }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>Change Avatar</Button>
            {formData.avatarPreview && <Button variant="secondary" style={{ color: 'var(--color-danger)' }} onClick={() => setFormData(prev => ({ ...prev, avatarPreview: '' }))}>Remove</Button>}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>JPG, GIF or PNG. Max size of 2MB.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>First Name</Label>
            <Input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="John" />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Doe" />
          </div>
        </div>

        <div>
          <Label>Username</Label>
          <Input name="username" value={formData.username} onChange={handleUsernameChange} placeholder="johndoe" />
          {!usernameAvailable && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4 }}>Username is too short or unavailable.</p>}
        </div>

        <div>
          <Label>Email Address</Label>
          <Input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="john@example.com" />
        </div>

        <div>
          <Label>Phone Number (Optional)</Label>
          <Input name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 234 567 890" />
        </div>

        <div>
          <Label>Bio</Label>
          <textarea 
            name="bio"
            value={formData.bio} 
            onChange={handleChange} 
            placeholder="Tell us a little about yourself..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 14, minHeight: 100, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </Card>
  );
}
