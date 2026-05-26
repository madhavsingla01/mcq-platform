import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';

const genderOptions = ['male', 'female', 'other', 'prefer_not_to_say'];

export default function Profile() {
  const { user, updateProfile } = useAuthStore();
  const [firstName, setFirstName] = useState((user?.name || '').split(' ')[0] || '');
  const [lastName, setLastName] = useState(((user?.name || '').split(' ').slice(1).join(' ')) || '');
  const [username, setUsername] = useState(user?.username || '');
  const [usernameError, setUsernameError] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const usernameTimeoutRef = useRef(null);

  const [email, setEmail] = useState(user?.email || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth ? (new Date(user.dateOfBirth)).toISOString().slice(0,10) : '');
  const [gender, setGender] = useState(user?.gender || '');
  const [age, setAge] = useState(user?.age ?? '');
  const [addressStreet, setAddressStreet] = useState(user?.address?.street || '');
  const [addressCity, setAddressCity] = useState(user?.address?.city || '');
  const [addressRegion, setAddressRegion] = useState(user?.address?.region || '');
  const [addressPostalCode, setAddressPostalCode] = useState(user?.address?.postalCode || '');
  const [addressCountry, setAddressCountry] = useState(user?.address?.country || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isProfilePublic, setIsProfilePublic] = useState(user?.isProfilePublic !== false);
  const [website, setWebsite] = useState(user?.socialLinks?.website || '');
  const [personalId, setPersonalId] = useState(user?.socialLinks?.personalId || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  // Username validation effect
  useEffect(() => {
    if (username === user?.username) {
      setUsernameError('');
      setUsernameAvailable(true);
      return;
    }
    
    if (usernameTimeoutRef.current) clearTimeout(usernameTimeoutRef.current);
    
    if (username.length < 3 || username.length > 30 || !/^[a-z0-9_.]+$/.test(username)) {
      setUsernameError('3-30 chars, lowercase, numbers, _, . only');
      setUsernameAvailable(false);
      return;
    }

    setUsernameError('');
    setCheckingUsername(true);
    
    usernameTimeoutRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/check-username?username=${username}`);
        if (!data.available) {
          setUsernameError(data.message || 'Username is already taken');
          setUsernameAvailable(false);
        } else {
          setUsernameAvailable(true);
        }
      } catch (err) {
        setUsernameError('Error checking username');
        setUsernameAvailable(false);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
    
    return () => clearTimeout(usernameTimeoutRef.current);
  }, [username, user?.username]);

  const handleChangeAvatar = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const onChooseFile = () => {
    fileRef.current?.click();
  };

  const onFileSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleChangeAvatar(file);
  };

  const onRemoveAvatar = () => {
    setAvatarPreview('');
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (password && password !== confirmPassword) {
        alert('Password and confirmation do not match');
        setSaving(false);
        return;
      }
      
      if (!usernameAvailable) {
        alert('Please choose a valid and available username');
        setSaving(false);
        return;
      }

      const payload = { name, email, username, avatar: avatarPreview || '' };
      // include optional profile fields
      payload.phone = phone || '';
      if (dateOfBirth) payload.dateOfBirth = dateOfBirth;
      if (gender) payload.gender = gender;
      if (age !== '' && age !== null) payload.age = Number(age);
      const address = {
        street: addressStreet || '',
        city: addressCity || '',
        region: addressRegion || '',
        postalCode: addressPostalCode || '',
        country: addressCountry || '',
      };
      payload.address = address;
      payload.bio = bio || '';
      payload.isProfilePublic = isProfilePublic;
      payload.socialLinks = { website, personalId };
      if (password) {
        payload.password = password;
        payload.confirmPassword = confirmPassword;
      }

      await updateProfile(payload);
      alert('Profile updated');
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-surface)', padding: 24, borderRadius: 10, border: '1px solid var(--color-border)' }}>
      <h2 style={{ marginBottom: 8 }}>Profile</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 18 }}>Update your personal details and public profile.</p>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
        <div style={{ width: 96, height: 96, borderRadius: 999, overflow: 'hidden', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: 28, fontWeight: 700 }}>{(user?.name || 'U')[0]}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onChooseFile} style={{ padding: '8px 12px', borderRadius: 8 }}>Change avatar</button>
          <button onClick={onRemoveAvatar} style={{ padding: '6px 10px', borderRadius: 8, background: 'transparent' }}>Remove</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFileSelected} style={{ display: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>First Name</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Last Name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Username (Special ID)</label>
        <div style={{ position: 'relative' }}>
          <input 
            value={username} 
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} 
            style={{ 
              width: '100%', 
              padding: 10, 
              paddingRight: 40,
              borderRadius: 8, 
              border: `1px solid ${usernameError ? 'var(--color-danger)' : 'var(--color-border)'}` 
            }} 
            placeholder="e.g. madhav_123"
          />
          {checkingUsername && <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>...</div>}
          {!checkingUsername && usernameAvailable && username.length > 2 && <div style={{ position: 'absolute', right: 12, top: 12, color: 'var(--color-success)' }}>✓</div>}
        </div>
        {usernameError && <div style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 4 }}>{usernameError}</div>}
      </div>

      <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Email Address</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
      </div>

      <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Date of Birth</label>
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Gender</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }}>
            <option value="">Select</option>
            {genderOptions.map((g) => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Age</label>
          <input type="number" min="0" value={age} onChange={(e) => setAge(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Country</label>
          <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Address</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input placeholder="Street" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
          <input placeholder="City" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
          <input placeholder="Region" value={addressRegion} onChange={(e) => setAddressRegion(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
          <input placeholder="Postal code" value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
      </div>

      {/* Profile Visibility Toggle */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-background)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--color-border)' }}>
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>Public Profile</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Allow others to view your profile and public quizzes at @{username}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsProfilePublic(v => !v)}
          style={{
            width: 48, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: isProfilePublic ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'var(--color-border)',
            position: 'relative', transition: 'background 0.25s', flexShrink: 0,
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3,
            left: isProfilePublic ? 25 : 3,
            transition: 'left 0.25s cubic-bezier(.4,0,.2,1)',
          }} />
        </button>
      </div>

      {/* Social Links Section */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 }}>Social Links</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Website URL</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourwebsite.com"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Personal ID</label>
            <input
              value={personalId}
              onChange={(e) => setPersonalId(e.target.value)}
              placeholder="Your personal identifier"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>New Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ padding: '8px 14px', borderRadius: 8 }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--color-primary)', color: '#fff' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>

      <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--color-border)' }}>
        <h3 style={{ color: '#ef4444', marginBottom: 8 }}>Danger Zone</h3>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, fontSize: 14 }}>
          Permanently delete your account and all your data (quizzes, attempts, chat messages). This action cannot be undone.
        </p>
        <button 
          onClick={async () => {
            if (window.confirm('Are you absolutely sure you want to delete your account? This will erase EVERYTHING and cannot be undone.')) {
              if (window.confirm('Final warning: Delete account?')) {
                try {
                  await useAuthStore.getState().deleteAccount();
                } catch (err) {
                  alert('Failed to delete account');
                }
              }
            }
          }}
          style={{ padding: '10px 16px', borderRadius: 8, background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', fontWeight: 600, cursor: 'pointer' }}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
