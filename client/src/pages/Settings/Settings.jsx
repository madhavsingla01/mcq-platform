import { Outlet } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function Settings() {
  const { user } = useAuthStore();

  return (
    <div style={{ maxWidth: 1100, margin: '32px auto', display: 'flex', gap: 24 }}>
      <aside style={{ width: 260, borderRadius: 10, border: '1px solid var(--color-border)', padding: 20, background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {user?.avatar ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontWeight: 700 }}>{user?.name?.[0] || 'U'}</div>}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{user?.email}</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link to="profile" style={{ padding: '10px 12px', borderRadius: 8, textDecoration: 'none', color: 'inherit', background: 'transparent' }}>Profile</Link>
          <Link to="preferences" style={{ padding: '10px 12px', borderRadius: 8, textDecoration: 'none', color: 'inherit', background: 'transparent' }}>Preferences</Link>
        </nav>
      </aside>

      <section style={{ flex: 1 }}>
        <Outlet />
      </section>
    </div>
  );
}
