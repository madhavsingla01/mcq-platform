import { useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { Link } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';

const features = [
  {
    icon: 'document_scanner',
    title: 'Smart Parsing',
    desc: 'Automatically detect headers, questions, and potential answers from standard CSV or Excel layouts without manual tagging.',
  },
  {
    icon: 'account_tree',
    title: 'Auto Mapping',
    desc: 'Intelligently link related columns to generate complex question structures, including distractors and hints.',
  },
  {
    icon: 'psychology',
    title: 'AI Explanations',
    desc: 'Generate contextual feedback and detailed explanations for correct and incorrect answers instantly using AI.',
  },
  {
    icon: 'dashboard_customize',
    title: 'Dynamic Quiz UI',
    desc: 'Experience a distraction-free, beautifully crafted testing environment that adapts to your content length and type.',
  },
  {
    icon: 'format_list_bulleted',
    title: 'Multi-format Support',
    desc: 'Support for multiple choice, fill-in-the-blank, and matching questions all derived from a single flat data file.',
  },
  {
    icon: 'analytics',
    title: 'Detailed Results',
    desc: 'Track performance with comprehensive analytics, score breakdowns, and question-by-question review.',
  },
];

export default function Home() {
  const { fetchRecentSessions } = useSessionStore();
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    fetchRecentSessions().then((sessions) => {
      if (sessions?.length) setRecentSessions(sessions);
    });
  }, [fetchRecentSessions]);

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    return `${day}d ago`;
  };

  return (
    <>
      <div className="qf-home-shell">
        {/* Hero Section */}
        <section className="qf-hero">
          <div className="qf-hero-content">
            <h1 className="qf-hero-title">
              Turn Any <span className="gradient-text">Spreadsheet</span> Into An Interactive Quiz Platform
            </h1>
            <p className="qf-hero-subtitle">
              Instantly convert your raw data, vocabulary lists, and Q&A sheets into beautiful, interactive learning experiences. No coding required, just effortless focus.
            </p>
            <div className="qf-hero-ctas">
              <Link to="/upload" style={{ textDecoration: 'none' }}>
                <Button size="lg" style={{ minWidth: 180 }}>Upload Sheet</Button>
              </Link>
              <Link to="/register" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="lg" style={{ minWidth: 180 }}>Create Account</Button>
              </Link>
            </div>
          </div>
          <div className="qf-hero-visual">
            <div className="qf-hero-glow" />
            <div className="qf-hero-mockup">
              <div className="qf-mockup-inner">
                <div className="qf-mockup-header">
                  <div className="qf-mockup-dots">
                    <span /><span /><span />
                  </div>
                </div>
                <div className="qf-mockup-body">
                  <div className="qf-mockup-sidebar">
                    <div className="qf-mockup-line w60" />
                    <div className="qf-mockup-line w40" />
                    <div className="qf-mockup-line w80" />
                    <div className="qf-mockup-line w50" />
                  </div>
                  <div className="qf-mockup-main">
                    <div className="qf-mockup-line w90" />
                    <div className="qf-mockup-line w70" />
                    <div className="qf-mockup-block" />
                    <div className="qf-mockup-block" />
                    <div className="qf-mockup-block active" />
                    <div className="qf-mockup-block" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="qf-features">
          <div className="qf-features-grid">
            {features.map((f) => (
              <div key={f.title} className="qf-feature-card">
                <div className="qf-feature-icon">
                  <span className="material-symbols-outlined">{f.icon}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recently Shared Quizzes */}
        {recentSessions.length > 0 && (
          <section className="qf-recent">
            <h2 className="qf-recent-title">
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--color-primary)' }}>groups</span>
              Recently Shared Quizzes
            </h2>
            <div className="qf-recent-grid">
              {recentSessions.map((s) => (
                <Link key={s._id} to={`/session/${s.shareCode}`} className="qf-recent-card">
                  <div className="qf-recent-card-category">{s.quizId?.category || 'General'}</div>
                  <h3 className="qf-recent-card-title">{s.quizId?.title || 'Untitled'}</h3>
                  <div className="qf-recent-card-meta">
                    <span><strong>{s.creatorId?.name || 'Unknown'}</strong></span>
                    <span>·</span>
                    <span>{s.participantCount || 0} participants</span>
                  </div>
                  <div className="qf-recent-card-footer">
                    <span>{s.quizId?.questionCount || 0} Qs</span>
                    <span>{timeAgo(s.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <style>{homeStyles}</style>
    </>
  );
}

const homeStyles = `
  .qf-home-shell {
    display: flex;
    flex-direction: column;
    gap: 80px;
    padding: 40px 0 60px;
  }

  /* ── Hero ── */
  .qf-hero {
    display: flex;
    align-items: center;
    gap: 64px;
  }

  .qf-hero-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .qf-hero-title {
    font-size: clamp(32px, 5vw, 48px);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: var(--color-text);
  }

  .qf-hero-subtitle {
    font-size: 18px;
    line-height: 1.6;
    color: var(--color-text-secondary);
    max-width: 540px;
    letter-spacing: -0.01em;
  }

  .qf-hero-ctas {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    padding-top: 8px;
  }

  .qf-hero-visual {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .qf-hero-glow {
    position: absolute;
    inset: -20px;
    background: radial-gradient(ellipse at center, rgba(79, 70, 229, 0.08) 0%, transparent 70%);
    border-radius: 24px;
    z-index: -1;
    filter: blur(20px);
  }

  .qf-hero-mockup {
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #f0f0f0;
    box-shadow: 0 8px 40px rgba(0,0,0,0.06);
    background: #fff;
  }

  .qf-mockup-inner {
    display: flex;
    flex-direction: column;
  }

  .qf-mockup-header {
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
  }

  .qf-mockup-dots {
    display: flex;
    gap: 6px;
  }

  .qf-mockup-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5e5ea;
  }

  .qf-mockup-body {
    display: flex;
    min-height: 240px;
  }

  .qf-mockup-sidebar {
    width: 140px;
    padding: 20px 16px;
    border-right: 1px solid #f0f0f0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .qf-mockup-main {
    flex: 1;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .qf-mockup-line {
    height: 10px;
    border-radius: 5px;
    background: #f0f0f0;
  }

  .qf-mockup-line.w40 { width: 40%; }
  .qf-mockup-line.w50 { width: 50%; }
  .qf-mockup-line.w60 { width: 60%; }
  .qf-mockup-line.w70 { width: 70%; }
  .qf-mockup-line.w80 { width: 80%; }
  .qf-mockup-line.w90 { width: 90%; }

  .qf-mockup-block {
    height: 36px;
    border-radius: 10px;
    border: 1px solid #f0f0f0;
    background: #fafafa;
  }

  .qf-mockup-block.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  /* ── Features ── */
  .qf-features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }

  .qf-feature-card {
    background: var(--color-surface);
    border: 1px solid #f0f0f0;
    border-radius: 16px;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: all 0.3s ease;
  }

  .qf-feature-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.04);
    border-color: rgba(79, 70, 229, 0.15);
    transform: translateY(-2px);
  }

  .qf-feature-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--color-surface-alt);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
  }

  .qf-feature-card h3 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .qf-feature-card p {
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }

  @media (max-width: 1024px) {
    .qf-hero {
      flex-direction: column;
      text-align: center;
      gap: 40px;
    }

    .qf-hero-subtitle {
      max-width: 600px;
      margin: 0 auto;
    }

    .qf-hero-ctas {
      justify-content: center;
    }
  }

  @media (max-width: 768px) {
    .qf-features-grid {
      grid-template-columns: 1fr;
    }

    .qf-home-shell {
      gap: 48px;
      padding: 24px 0 40px;
    }
  }

  @media (max-width: 640px) {
    .qf-hero-ctas {
      flex-direction: column;
      width: 100%;
    }

    .qf-hero-ctas a,
    .qf-hero-ctas button {
      width: 100%;
    }

    .qf-mockup-sidebar {
      display: none;
    }
  }

  /* ── Recently Shared ── */
  .qf-recent {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .qf-recent-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .qf-recent-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .qf-recent-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border-light);
    border-radius: 14px;
    padding: 20px;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.2s ease;
  }

  .qf-recent-card:hover {
    border-color: rgba(79, 70, 229, 0.2);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
    transform: translateY(-2px);
  }

  .qf-recent-card-category {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
  }

  .qf-recent-card-title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.01em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .qf-recent-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .qf-recent-card-footer {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: auto;
    padding-top: 4px;
  }

  @media (max-width: 1024px) {
    .qf-recent-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .qf-recent-grid {
      grid-template-columns: 1fr;
    }
  }
`;
