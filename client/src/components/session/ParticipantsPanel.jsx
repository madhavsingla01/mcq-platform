import { useSessionStore } from '../../store/sessionStore';
import { useAuthStore } from '../../store/authStore';
import { Users } from 'lucide-react';

export default function ParticipantsPanel({ creatorId }) {
  const { onlineCount, onlineUsers, session } = useSessionStore();
  const currentUser = useAuthStore((s) => s.user);
  const visibility = session?.settings?.participantVisibility || 'all';

  return (
    <>
      <div className="participants-panel">
        <div className="participants-panel-header">
          <div className="participants-panel-header-left">
            <Users size={16} className="text-indigo-500" />
            <span className="participants-panel-title">Participants</span>
            {visibility !== 'hidden' ? (
              <span className="participants-panel-count">
                <span className="online-indicator" />
                {onlineCount}
              </span>
            ) : null}
          </div>
        </div>

        <div className="participants-panel-list custom-scrollbar">
          {visibility === 'hidden' ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              Participant visibility is disabled for this session.
            </div>
          ) : visibility === 'count_only' ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              Only participant count is visible.
            </div>
          ) : (
            onlineUsers.map((user) => {
              const isMe = user.userId === currentUser?._id;
              const isCreator = user.userId === creatorId;
              return (
                <div key={user.userId} className="participant-item">
                  <div className="participant-avatar-wrap">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="participant-avatar" />
                    ) : (
                      <div className="participant-avatar-placeholder">
                        {user.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="participant-status-dot" />
                  </div>
                  
                  <div className="participant-info">
                    <span className="participant-name">
                      {user.name} {isMe && '(You)'}
                    </span>
                    {isCreator && <span className="participant-role">Creator</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{participantsPanelStyles}</style>
    </>
  );
}

const participantsPanelStyles = `
  .participants-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
  }

  .participants-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-border-light);
    flex-shrink: 0;
  }

  .participants-panel-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .participants-panel-title {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-text);
  }

  .participants-panel-count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-surface-alt);
    padding: 2px 8px;
    border-radius: 12px;
  }

  .online-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    
  }

  .participants-panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .participants-panel-close:hover {
    background: var(--color-surface-alt);
    color: var(--color-text);
  }

  .participants-panel-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .participant-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--color-surface);
    border: 1px solid transparent;
    transition: all 0.2s;
  }

  .participant-item:hover {
    background: var(--color-surface-alt);
    border-color: var(--color-border-light);
  }

  .participant-avatar-wrap {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .participant-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .participant-avatar-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary));
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
  }

  .participant-status-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #22c55e;
    border: 2px solid var(--color-surface);
  }

  .participant-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }

  .participant-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .participant-role {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 2px;
  }
`;
