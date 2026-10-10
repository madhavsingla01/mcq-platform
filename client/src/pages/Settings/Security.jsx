import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card, Button, Input, Label } from '../../components/ui';

export default function Security() {
  const { updateProfile } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!password) {
      alert('Please enter a new password');
      return;
    }
    if (password !== confirmPassword) {
      alert('Password and confirmation do not match');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        password,
        confirmPassword
      });
      alert('Password updated successfully!');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ padding: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Security & Password</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 500 }}>
        <div>
          <Label>New Password</Label>
          <Input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="Enter new password" 
          />
        </div>

        <div>
          <Label>Confirm New Password</Label>
          <Input 
            type="password" 
            value={confirmPassword} 
            onChange={e => setConfirmPassword(e.target.value)} 
            placeholder="Confirm new password" 
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <Button onClick={onSave} disabled={saving || !password}>{saving ? 'Saving...' : 'Update Password'}</Button>
        </div>
      </div>
    </Card>
  );
}
