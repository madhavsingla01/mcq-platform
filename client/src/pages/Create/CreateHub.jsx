import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Code2,
  FileText,
  FileUp,
  LayoutTemplate,
  Link2,
  PenTool,
  ShieldCheck,
  Sparkles,
  Star,
  UploadCloud,
  Users,
} from 'lucide-react';
import { Card } from '../../components/ui';

const benefits = [
  'One builder for every content format',
  'Shareable sessions with access controls',
  'Draft-safe forms, uploads, coding and surveys',
  'Scored quiz publishing when answers are ready',
];

const creationPaths = [
  {
    title: 'Universal Builder',
    label: 'Primary workspace',
    description: 'Create MCQ tests, forms, coding links, upload tasks, ratings, and surveys in one editor.',
    icon: LayoutTemplate,
    action: 'Open builder',
    route: '/create/manual?mode=universal',
    accent: '#4f46e5',
  },
  {
    title: 'Upload question bank',
    label: 'Import flow',
    description: 'Bring in CSV, Excel, JSON, or supported files and map columns into a scored quiz.',
    icon: UploadCloud,
    action: 'Start upload',
    route: '/create/upload',
    accent: '#0f766e',
  },
];

const universalBlocks = [
  {
    icon: ClipboardList,
    title: 'MCQ',
    detail: 'Single answer, dropdown, explanations and score rules.',
    route: '/create/manual?mode=exam',
    accent: '#0f766e',
  },
  {
    icon: LayoutTemplate,
    title: 'Forms',
    detail: 'Short text, paragraphs, dates, times and dropdowns.',
    route: '/create/manual?mode=form',
    accent: '#2563eb',
  },
  {
    icon: Code2,
    title: 'Coding links',
    detail: 'LeetCode, HackerRank, Codeforces and custom problem links.',
    route: '/create/manual?mode=coding',
    accent: '#7c3aed',
  },
  {
    icon: FileUp,
    title: 'File uploads',
    detail: 'Collect documents, screenshots or assignment files.',
    route: '/create/manual?mode=upload',
    accent: '#b45309',
  },
  {
    icon: Star,
    title: 'Ratings',
    detail: 'Star ratings and linear scales for feedback loops.',
    route: '/create/manual?mode=rating',
    accent: '#db2777',
  },
  {
    icon: BarChart3,
    title: 'Surveys',
    detail: 'Grids, multi-select, scales and open responses.',
    route: '/create/manual?mode=survey',
    accent: '#0891b2',
  },
];

const growthTools = [
  {
    icon: Users,
    title: 'Collaboration',
    metric: 'Live',
    detail: 'Shared sessions keep people inside the same learning workspace.',
  },
  {
    icon: Link2,
    title: 'Sharing',
    metric: 'Link',
    detail: 'Creators choose link access, participants, chat, expiry and review behavior.',
  },
  {
    icon: ShieldCheck,
    title: 'Retention',
    metric: 'Return',
    detail: 'Drafts, results and reusable sessions give creators a reason to come back.',
  },
  {
    icon: Sparkles,
    title: 'Network effects',
    metric: 'Loop',
    detail: 'Every shared test, form or coding task brings a new participant into the product.',
  },
];

export default function CreateHub() {
  const navigate = useNavigate();

  return (
    <>
      <main className="create-pro-shell">
        <section className="create-pro-hero">
          <div className="create-pro-copy">
            <div className="create-pro-rating" aria-label="Creator strategy">
              <span className="create-pro-stars">
                {[0, 1, 2, 3, 4].map((item) => <Star key={item} size={15} fill="currentColor" />)}
              </span>
              <span>Tier 1 creator system</span>
            </div>

            <h1>Build quizzes, forms, coding tasks and surveys from one place.</h1>
            <p>
              Universal Builder turns creation into the retention engine: one workspace for scored tests,
              data collection, upload tasks, ratings, coding links, sharing and collaboration.
            </p>

            <div className="create-pro-benefits">
              {benefits.map((benefit) => (
                <div key={benefit} className="create-pro-benefit">
                  <CheckCircle2 size={17} />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="create-pro-preview" aria-label="Universal builder preview">
            <div className="preview-window">
              <div className="preview-topbar">
                <span />
                <span />
                <span />
                <strong>Universal Builder</strong>
              </div>
              <div className="preview-body">
                <div className="preview-question">
                  <div className="preview-question-head">
                    <span>Mixed workspace</span>
                    <FileText size={16} />
                  </div>
                  <h2>Choose the best block for this assessment step.</h2>
                  <div className="preview-options">
                    <div className="preview-option active"><span>A</span> MCQ question</div>
                    <div className="preview-option"><span>B</span> Coding link</div>
                    <div className="preview-option"><span>C</span> File upload</div>
                  </div>
                </div>
                <div className="preview-side">
                  <div>
                    <ClipboardList size={15} />
                    <strong>MCQ</strong>
                    <span>score</span>
                  </div>
                  <div>
                    <Code2 size={15} />
                    <strong>Code</strong>
                    <span>links</span>
                  </div>
                  <div>
                    <Users size={15} />
                    <strong>Share</strong>
                    <span>session</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="create-pro-actions" aria-label="Creation options">
          {creationPaths.map((path) => {
            const Icon = path.icon;
            return (
              <Card
                key={path.title}
                className="create-pro-card"
                style={{ '--accent': path.accent }}
                onClick={() => navigate(path.route)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(path.route);
                  }
                }}
              >
                <div className="create-pro-card-icon">
                  <Icon size={24} />
                </div>
                <div className="create-pro-card-body">
                  <div className="create-pro-card-kicker">{path.label}</div>
                  <h2>{path.title}</h2>
                  <p>{path.description}</p>
                </div>
                <div className="create-pro-card-action">
                  <span>{path.action}</span>
                  <ArrowRight size={17} />
                </div>
              </Card>
            );
          })}
        </section>

        <section className="universal-blocks" aria-label="Universal builder blocks">
          <div className="toolkit-heading">
            <span>Universal Builder</span>
            <strong>One editor, six high-retention creation loops.</strong>
          </div>
          <div className="block-grid">
            {universalBlocks.map((block) => {
              const Icon = block.icon;
              return (
                <button
                  key={block.title}
                  type="button"
                  className="block-card"
                  style={{ '--accent': block.accent }}
                  onClick={() => navigate(block.route)}
                >
                  <Icon size={20} />
                  <h3>{block.title}</h3>
                  <p>{block.detail}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="create-pro-toolkit" aria-label="Growth toolkit">
          <div className="toolkit-heading">
            <span>Why this matters</span>
            <strong>Designed around retention, collaboration, sharing and network effects.</strong>
          </div>
          <div className="toolkit-grid">
            {growthTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <div key={tool.title} className="toolkit-card">
                  <div className="toolkit-card-head">
                    <Icon size={20} />
                    <span>{tool.metric}</span>
                  </div>
                  <h3>{tool.title}</h3>
                  <p>{tool.detail}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <style>{createHubStyles}</style>
    </>
  );
}

const createHubStyles = `
  .create-pro-shell {
    width: min(1180px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 28px 0 48px;
  }

  .create-pro-hero {
    min-height: 430px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(340px, 480px);
    gap: 32px;
    align-items: center;
    padding: 36px 0 30px;
  }

  .create-pro-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .create-pro-rating {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: 1px solid #fde68a;
    border-radius: 8px;
    background: #fffbeb;
    color: #92400e;
    font-size: 13px;
    font-weight: 750;
    margin-bottom: 18px;
  }

  .create-pro-stars {
    display: inline-flex;
    gap: 2px;
    color: #f59e0b;
  }

  .create-pro-copy h1 {
    max-width: 780px;
    margin: 0;
    color: #111827;
    font-size: clamp(38px, 5vw, 62px);
    line-height: 1.03;
    font-weight: 850;
    letter-spacing: 0;
  }

  .create-pro-copy p {
    max-width: 700px;
    margin: 18px 0 0;
    color: #4b5563;
    font-size: 17px;
    line-height: 1.65;
  }

  .create-pro-benefits {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 18px;
    margin-top: 26px;
  }

  .create-pro-benefit {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    color: #1f2937;
    font-size: 14px;
    font-weight: 700;
  }

  .create-pro-benefit svg {
    color: #16a34a;
    flex-shrink: 0;
  }

  .create-pro-preview {
    display: flex;
    justify-content: flex-end;
  }

  .preview-window {
    width: min(100%, 480px);
    border: 1px solid #d4d4d8;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.16);
    overflow: hidden;
  }

  .preview-topbar {
    height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    background: #18181b;
    color: #f4f4f5;
  }

  .preview-topbar span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #71717a;
  }

  .preview-topbar span:first-child { background: #f87171; }
  .preview-topbar span:nth-child(2) { background: #fbbf24; }
  .preview-topbar span:nth-child(3) { background: #34d399; }

  .preview-topbar strong {
    margin-left: auto;
    font-size: 12px;
    font-weight: 750;
  }

  .preview-body {
    display: grid;
    grid-template-columns: 1fr 118px;
    gap: 16px;
    padding: 18px;
    background: #f8fafc;
  }

  .preview-question {
    min-width: 0;
    padding: 18px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
  }

  .preview-question-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #6366f1;
    font-weight: 800;
    font-size: 12px;
    margin-bottom: 12px;
  }

  .preview-question h2 {
    margin: 0 0 16px;
    color: #111827;
    font-size: 17px;
    line-height: 1.35;
    font-weight: 800;
    letter-spacing: 0;
  }

  .preview-options {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .preview-option {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
    color: #374151;
    font-size: 13px;
    font-weight: 650;
  }

  .preview-option span {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: #f3f4f6;
    color: #4b5563;
    font-size: 12px;
    font-weight: 850;
  }

  .preview-option.active {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #065f46;
  }

  .preview-option.active span {
    background: #10b981;
    color: #ffffff;
  }

  .preview-side {
    display: grid;
    gap: 10px;
  }

  .preview-side div {
    min-height: 76px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
    color: #6b7280;
  }

  .preview-side svg {
    color: #4f46e5;
  }

  .preview-side strong {
    color: #111827;
    font-size: 18px;
    line-height: 1;
    font-weight: 850;
  }

  .preview-side span {
    font-size: 11px;
    font-weight: 750;
    text-transform: uppercase;
  }

  .create-pro-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-top: 8px;
  }

  .universal-blocks,
  .create-pro-toolkit {
    margin-top: 20px;
    padding: 22px;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    background: #ffffff;
  }

  .toolkit-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .toolkit-heading span {
    color: #4f46e5;
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .toolkit-heading strong {
    color: #18181b;
    font-size: 18px;
    line-height: 1.3;
    font-weight: 850;
    text-align: right;
  }

  .block-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }

  .block-card {
    min-height: 160px;
    padding: 15px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
    color: #18181b;
    text-align: left;
    cursor: pointer;
    font: inherit;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .block-card:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 38%, #e5e7eb);
    background: color-mix(in srgb, var(--accent) 7%, white);
  }

  .block-card svg {
    color: var(--accent);
    margin-bottom: 14px;
  }

  .block-card h3 {
    margin: 0;
    color: #111827;
    font-size: 15px;
    font-weight: 850;
  }

  .block-card p {
    margin: 8px 0 0;
    color: #4b5563;
    font-size: 12px;
    line-height: 1.5;
  }

  .toolkit-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .toolkit-card {
    min-height: 162px;
    padding: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
  }

  .toolkit-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
    color: #4f46e5;
  }

  .toolkit-card-head span {
    padding: 3px 7px;
    border-radius: 7px;
    background: #eef2ff;
    color: #3730a3;
    font-size: 11px;
    font-weight: 850;
  }

  .toolkit-card h3 {
    margin: 0;
    color: #111827;
    font-size: 15px;
    line-height: 1.3;
    font-weight: 850;
  }

  .toolkit-card p {
    margin: 8px 0 0;
    color: #4b5563;
    font-size: 13px;
    line-height: 1.5;
  }

  .create-pro-card {
    min-height: 214px;
    display: grid;
    grid-template-columns: 58px 1fr;
    gap: 18px;
    align-items: start;
    padding: 24px !important;
    border-radius: 8px !important;
    border: 1px solid #e4e4e7 !important;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }

  .create-pro-card::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--accent);
    opacity: 0.95;
  }

  .create-pro-card:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 40%, #e4e4e7) !important;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.1);
  }

  .create-pro-card:focus-visible,
  .block-card:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--accent, #4f46e5) 32%, transparent);
    outline-offset: 3px;
  }

  .create-pro-card-icon {
    width: 58px;
    height: 58px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 12%, white);
    color: var(--accent);
  }

  .create-pro-card-body {
    min-width: 0;
  }

  .create-pro-card-kicker {
    width: fit-content;
    margin-bottom: 8px;
    padding: 3px 8px;
    border-radius: 7px;
    background: #f4f4f5;
    color: #52525b;
    font-size: 11px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .create-pro-card h2 {
    margin: 0;
    color: #18181b;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 850;
    letter-spacing: 0;
  }

  .create-pro-card p {
    margin: 9px 0 0;
    color: #52525b;
    font-size: 14px;
    line-height: 1.55;
  }

  .create-pro-card-action {
    grid-column: 2;
    align-self: end;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    color: var(--accent);
    font-size: 14px;
    font-weight: 800;
  }

  .create-pro-card-action svg {
    transition: transform 0.16s ease;
  }

  .create-pro-card:hover .create-pro-card-action svg {
    transform: translateX(4px);
  }

  @media (max-width: 1100px) {
    .block-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 960px) {
    .create-pro-hero {
      grid-template-columns: 1fr;
    }

    .create-pro-preview {
      justify-content: flex-start;
    }
  }

  @media (max-width: 720px) {
    .create-pro-shell {
      width: min(100vw - 24px, 1180px);
      padding-top: 18px;
    }

    .create-pro-hero {
      min-height: 0;
      padding-top: 18px;
    }

    .create-pro-benefits,
    .create-pro-actions,
    .block-grid {
      grid-template-columns: 1fr;
    }

    .toolkit-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .toolkit-heading strong {
      text-align: left;
    }

    .toolkit-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .preview-body {
      grid-template-columns: 1fr;
    }

    .preview-side {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 520px) {
    .create-pro-copy h1 {
      font-size: 36px;
    }

    .create-pro-copy p {
      font-size: 15px;
    }

    .create-pro-card {
      grid-template-columns: 1fr;
    }

    .create-pro-card-action {
      grid-column: 1;
    }

    .preview-side,
    .toolkit-grid {
      grid-template-columns: 1fr;
    }
  }
`;
