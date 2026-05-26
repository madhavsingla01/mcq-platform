import { Badge, Button, Card } from '../ui';
import { getSelectedShareSettings } from '../../utils/shareSettings';

export default function QuizEntryScreen({
  quiz,
  questions = [],
  isStarted,
  isSubmitted,
  recoveryNotice = '',
  collaboration = null,
  actionsExtra = null,
  onStart,
  onResume,
  onStartNew,
}) {
  const questionCount = questions.length || quiz?.questionCount || 0;
  const timeLimit = quiz?.settings?.timeLimit;
  const participantCount = Number(collaboration?.participantCount || 0);
  const creatorName = collaboration?.creatorName || '';
  const shareSettings = collaboration?.settings || null;
  const selectedShareSettings = shareSettings ? getSelectedShareSettings(shareSettings) : [];
  const showParticipantCount = shareSettings?.participantVisibility !== 'hidden';
  const chatLabel = shareSettings?.chatSettings === 'disabled'
    ? 'Chat Disabled'
    : shareSettings?.chatSettings === 'read_only'
      ? 'Announcements'
      : 'Live Chat';

  return (
    <>
      <div className="quiz-entry-shell">
        <Card className="quiz-entry-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="quiz-entry-hero">
            <div>
              <div className="quiz-entry-badges">
                <Badge>{questionCount} Questions</Badge>
                <Badge variant="warning">
                  {timeLimit ? `${timeLimit} min limit` : 'No time limit'}
                </Badge>
                {collaboration ? (
                  <>
                    {showParticipantCount ? (
                      <Badge>
                        <span className="material-symbols-outlined quiz-entry-badge-icon">group</span>
                        {participantCount} participant{participantCount === 1 ? '' : 's'}
                      </Badge>
                    ) : null}
                    {creatorName ? <Badge>Created by {creatorName}</Badge> : null}
                  </>
                ) : null}
              </div>
              <h1 className="quiz-entry-title">{quiz?.title}</h1>
              <p className="quiz-entry-description">
                {quiz?.description || 'Start when ready. Progress is recovered automatically if the session is interrupted.'}
              </p>
            </div>
          </div>

          <div className="quiz-entry-body">
            <div className="quiz-entry-body-grid">
              <div className="entry-left">
                <div className="quiz-entry-grid">
                  <div className="quiz-entry-stat">
                    <span>Timer Mode</span>
                    <strong>{quiz?.settings?.timerMode === 'strict' ? 'Strict' : quiz?.settings?.timerMode === 'soft' ? 'Soft' : 'None'}</strong>
                  </div>
                  <div className="quiz-entry-stat">
                    <span>Instant Feedback</span>
                    <strong>{quiz?.settings?.instantFeedback ? 'Enabled' : 'Disabled'}</strong>
                  </div>
                  <div className="quiz-entry-stat">
                    <span>Question Review</span>
                    <strong>{quiz?.settings?.allowReview === false ? 'Restricted' : 'Allowed'}</strong>
                  </div>
                  <div className="quiz-entry-stat">
                    <span>Explanation Reveal</span>
                    <strong>{quiz?.settings?.showExplanation === false ? 'Hidden' : 'Available'}</strong>
                  </div>
                  <div className="quiz-entry-stat">
                    <span>Recovery</span>
                    <strong>Auto Resume</strong>
                  </div>
                  {collaboration ? (
                    <div className="quiz-entry-stat">
                      <span>Workspace</span>
                      <strong>{chatLabel}</strong>
                    </div>
                  ) : null}
                </div>

                {selectedShareSettings.length ? (
                  <div className="quiz-entry-share-settings">
                    {selectedShareSettings.map(({ label, option }) => (
                      <div key={label} className="quiz-entry-share-row">
                        <span>{label}</span>
                        <strong>{option.title}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                {recoveryNotice ? (
                  <div className="quiz-status-banner info">{recoveryNotice}</div>
                ) : null}
              </div>

              <aside className="entry-actions">
                <div className="entry-actions-card">
                  <div className="quiz-entry-badges compact">
                    <Badge>{questionCount} Questions</Badge>
                    <Badge variant="warning">
                      {timeLimit ? `${timeLimit} min limit` : 'No time limit'}
                    </Badge>
                  </div>
                  <div className="entry-actions-title">{quiz?.title}</div>
                  <div className="entry-actions-desc">
                    {quiz?.description || 'Start when ready. Progress is recovered automatically if the session is interrupted.'}
                  </div>
                </div>

                <div className="entry-actions-buttons">
                  {isStarted && !isSubmitted ? (
                    <>
                      <Button size="lg" onClick={onResume} style={{ width: '100%', fontSize: 18, padding: '16px 20px' }}>
                        Resume Attempt
                      </Button>
                      <Button size="lg" variant="outline" onClick={onStartNew} style={{ width: '100%', fontSize: 18, padding: '16px 20px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>
                        Start New Attempt
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="lg"
                      onClick={onStart}
                      style={{ width: '100%', fontSize: 18, padding: '16px 20px' }}
                    >
                      Start Quiz
                    </Button>
                  )}
                </div>

                {actionsExtra}

                <div className="entry-tip">
                  Tip: Your progress is auto-saved and recoverable across sessions.
                </div>
              </aside>
            </div>
          </div>
        </Card>
      </div>

      <style>{quizEntryScreenStyles}</style>
    </>
  );
}

const quizEntryScreenStyles = `
  .quiz-entry-shell {
    max-width: 860px;
    margin: 32px auto;
    padding: 0 16px;
  }

  .quiz-entry-card {
    background:
      radial-gradient(circle at top right, rgba(91, 80, 214, 0.04), transparent 40%),
      radial-gradient(circle at bottom left, rgba(124, 110, 240, 0.03), transparent 35%),
      var(--color-surface);
  }

  .quiz-entry-hero {
    padding: 32px;
    border-bottom: 1px solid var(--color-border);
  }

  .quiz-entry-badges {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .quiz-entry-badges.compact {
    margin-bottom: 8px;
  }

  .quiz-entry-badge-icon {
    font-size: 14px;
    margin-right: 4px;
  }

  .quiz-entry-title {
    font-size: 32px;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 12px;
    letter-spacing: -0.02em;
  }

  .quiz-entry-description {
    font-size: 16px;
    color: var(--color-text-secondary);
    max-width: 600px;
  }

  .quiz-entry-body {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .quiz-entry-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .quiz-entry-share-settings {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--color-border-light);
    border-radius: 8px;
    background: var(--color-surface-alt);
  }

  .quiz-entry-share-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .quiz-entry-share-row span {
    font-size: 11px;
    font-weight: 750;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .quiz-entry-share-row strong {
    font-size: 13px;
    line-height: 1.35;
    font-weight: 750;
    color: var(--color-text);
    overflow-wrap: anywhere;
  }

  .quiz-entry-stat {
    padding: 16px;
    border-radius: 12px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .quiz-entry-stat span {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .quiz-entry-stat strong {
    font-size: 18px;
    font-weight: 700;
    min-height: 0;
  }

  .quiz-entry-body-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 24px;
    align-items: start;
  }

  .entry-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .entry-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entry-actions-card {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .entry-actions-title {
    font-size: 18px;
    font-weight: 800;
    margin-top: 8px;
  }

  .entry-actions-desc {
    color: var(--color-text-secondary);
    margin-top: 8px;
    font-size: 14px;
    max-height: 120px;
    overflow: auto;
  }

  .entry-actions-buttons {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .entry-tip {
    margin-top: 12px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .quiz-status-banner {
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    font-size: 14px;
  }

  .quiz-status-banner.info {
    background: rgba(79, 70, 229, 0.05);
    border-color: rgba(79, 70, 229, 0.15);
    color: var(--color-text);
  }

  @media (max-width: 768px) {
    .quiz-entry-hero,
    .quiz-entry-body {
      padding: 24px 20px;
    }

    .quiz-entry-grid,
    .quiz-entry-body-grid {
      grid-template-columns: 1fr;
    }

    .entry-actions {
      border-left: none;
    }
  }
`;
