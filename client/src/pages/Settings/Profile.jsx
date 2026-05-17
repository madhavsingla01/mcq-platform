import { useState, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';

const genderOptions = ['male', 'female', 'other', 'prefer_not_to_say'];

export default function Profile() {
  const { user, updateProfile } = useAuthStore();
  const [firstName, setFirstName] = useState((user?.name || '').split(' ')[0] || '');
  const [lastName, setLastName] = useState(((user?.name || '').split(' ').slice(1).join(' ')) || '');
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

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

      const payload = { name, email, avatar: avatarPreview || '' };
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
    </div>
  );
}
