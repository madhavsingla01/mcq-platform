import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  Zap,
  CheckCircle2,
  FileText,
  Share2,
  Shield,
  Users,
  Eye,
  EyeOff,
  Heart,
  MessageSquare,
  HelpCircle,
  UploadCloud,
  SlidersHorizontal,
  RefreshCw,
  Award,
  ArrowRight,
  Search,
  X,
  LayoutDashboard,
  Compass,
  Settings,
  PlusCircle,
} from 'lucide-react';
import { Card, Badge, Button } from '../../components/ui';

const navItems = [
  { id: 'rules', label: 'Quiz rules', icon: SlidersHorizontal, desc: 'Modes, timers & feedback' },
  { id: 'upload', label: 'Import a quiz', icon: UploadCloud, desc: 'Spreadsheets & mapping' },
  { id: 'create', label: 'Create a quiz', icon: PlusCircle, desc: 'Build, save & publish' },
  { id: 'workspace', label: 'Your workspace', icon: LayoutDashboard, desc: 'Dashboard, drafts & progress' },
  { id: 'discover', label: 'Discover', icon: Compass, desc: 'Explore quizzes & creators' },
  { id: 'privacy', label: 'Privacy', icon: Eye, desc: 'Publishing & visibility' },
  { id: 'community', label: 'Community', icon: Heart, desc: 'Challenges & connections' },
  { id: 'profiles', label: 'Profiles', icon: Users, desc: 'Creator pages & links' },
  { id: 'settings', label: 'Settings', icon: Settings, desc: 'Make QuizFocus yours' },
];

export default function Guide() {
  const [activeSection, setActiveSection] = useState('rules');
  const [query, setQuery] = useState('');
  const [matchingTopics, setMatchingTopics] = useState(navItems.map(({ id }) => id));
  const [resultCount, setResultCount] = useState(0);
  const guideContentRef = useRef(null);

  useEffect(() => {
    const sections = guideContentRef.current?.querySelectorAll('.guide-section');
    if (!sections) return;

    const searchTerm = query.trim().toLocaleLowerCase();
    const nextMatchingTopics = [];
    let nextResultCount = 0;

    sections.forEach((section) => {
      const cards = [...section.querySelectorAll('.guide-rule-card')];
      const intro = section.querySelector('.guide-section-intro')?.textContent?.toLocaleLowerCase() || '';
      const wholeSectionMatches = !searchTerm || intro.includes(searchTerm);
      let sectionMatches = 0;

      cards.forEach((card) => {
        const matches = wholeSectionMatches || card.textContent.toLocaleLowerCase().includes(searchTerm);
        card.hidden = !matches;
        if (matches) sectionMatches += 1;
      });

      section.hidden = sectionMatches === 0;
      if (sectionMatches > 0) {
        nextMatchingTopics.push(section.id);
        nextResultCount += sectionMatches;
      }
    });

    setMatchingTopics(nextMatchingTopics);
    setResultCount(nextResultCount);
  }, [query]);

  const selectTopic = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="guide-page">
      <header className="guide-header consistent-page-header">
        <h1 className="consistent-page-title">Guide</h1>
        <label className="guide-search consistent-page-search consistent-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            className="consistent-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search guide"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </label>
        <span className="guide-search-count" aria-live="polite">
          {query ? `${resultCount} matching ${resultCount === 1 ? 'result' : 'results'}` : ''}
        </span>
      </header>

      <div className="guide-layout">
        <aside className="guide-nav-col">
          <nav className="guide-nav-menu" aria-label="Guide topics">
            {navItems.filter((item) => matchingTopics.includes(item.id)).map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`guide-nav-item ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => selectTopic(item.id)}
                >
                  <div className="guide-nav-icon">
                    <Icon size={18} />
                  </div>
                  <div className="guide-nav-text">
                    <strong>{item.label}</strong>
                    <span>{item.desc}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          <Card className="guide-quick-create">
            <Zap size={22} style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
            <h4>Ready to make a quiz?</h4>
            <p>Start from a spreadsheet or build each question yourself.</p>
            <Link to="/create/upload" style={{ textDecoration: 'none' }}>
              <Button style={{ width: '100%' }}>Create a quiz</Button>
            </Link>
          </Card>
        </aside>

        <main className="guide-content-col" ref={guideContentRef}>
          {query && resultCount === 0 && (
            <div className="guide-empty-state" role="status">
              <Search size={20} />
              <h2>No matches found</h2>
              <p>Try a different search, like “timer”, “draft”, or “privacy”.</p>
              <button type="button" onClick={() => setQuery('')}>Clear search</button>
            </div>
          )}
          {/* SECTION 1: QUIZ RULES & MODES */}
          <section id="rules" className="guide-section">
              <div className="guide-section-intro">
                <h2>Quiz Rules & Modes</h2>
                <p>
                  When creating or editing a quiz in the Mapping screen or Quiz Settings, you can configure 5 core rules. Here is exactly what happens for each setting:
                </p>
              </div>

              <div className="guide-cards-grid">
                {/* 1. Timer Mode */}
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                      <Clock size={20} />
                    </div>
                    <div>
                      <h3>Timer Mode & Time Limits</h3>
                      <span className="guide-rule-target">Configured in Mapping or Quiz Settings</span>
                    </div>
                  </div>

                  <div className="guide-scenarios-list">
                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge>Mode: None</Badge>
                        <strong>No time limit</strong>
                      </div>
                      <p>
                        Learners can take as long as they need. No countdown is displayed and no automated submission occurs.
                      </p>
                    </div>

                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="danger">Mode: Strict</Badge>
                        <strong>Hard countdown cutoff</strong>
                      </div>
                      <p>
                        A prominent timer counts down. <em>The moment the clock reaches 00:00, the quiz is automatically submitted immediately</em>. Unanswered questions are marked as skipped/incorrect.
                      </p>
                    </div>

                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="warning">Mode: Soft</Badge>
                        <strong>Pacing guide (Flexible)</strong>
                      </div>
                      <p>
                        A timer counts down and flashes an alert when time is up, but does <em>not</em> force an instant cutoff. Takers can finish their remaining questions, and total completion time is recorded.
                      </p>
                    </div>
                  </div>
                </Card>

                {/* 2. Instant Feedback */}
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3>Instant Feedback</h3>
                      <span className="guide-rule-target">Practice mode vs Exam mode</span>
                    </div>
                  </div>

                  <div className="guide-scenarios-list">
                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="success">Enabled (Practice Mode)</Badge>
                      </div>
                      <p>
                        Immediately after clicking an option, the button illuminates green (correct) or red (incorrect), showing the right answer and instant explanation right away.
                      </p>
                    </div>

                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge>Disabled (Assessment Mode)</Badge>
                      </div>
                      <p>
                        Options only record your selection without revealing whether you were right or wrong. Answers are kept confidential until the final submission.
                      </p>
                    </div>
                  </div>
                </Card>

                {/* 3. Question Review */}
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <h3>Question Review</h3>
                      <span className="guide-rule-target">Result page accessibility</span>
                    </div>
                  </div>

                  <div className="guide-scenarios-list">
                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="success">Allowed</Badge>
                      </div>
                      <p>
                        After completing the quiz, learners get a full Question Timeline and accordion showing each question, their choice, and the correct answer.
                      </p>
                    </div>

                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="danger">Restricted</Badge>
                      </div>
                      <p>
                        Learners only receive their final score and accuracy tier. Question items are protected to prevent answer key sharing or exam leaks.
                      </p>
                    </div>
                  </div>
                </Card>

                {/* 4. Explanation Reveal */}
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-action-blue-light)', color: 'var(--color-action-blue)' }}>
                      <HelpCircle size={20} />
                    </div>
                    <div>
                      <h3>Explanation Reveal</h3>
                      <span className="guide-rule-target">Detailed pedagogical feedback</span>
                    </div>
                  </div>

                  <div className="guide-scenarios-list">
                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="success">Available</Badge>
                      </div>
                      <p>
                        When review or instant feedback is enabled, the explanation column parsed from your spreadsheet is displayed to help learners understand the concepts.
                      </p>
                    </div>

                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge>Hidden</Badge>
                      </div>
                      <p>
                        Explanations remain concealed from participants even if review is enabled.
                      </p>
                    </div>
                  </div>
                </Card>

                {/* 5. Auto Recovery */}
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <RefreshCw size={20} />
                    </div>
                    <div>
                      <h3>Auto Resume & Cloud Recovery</h3>
                      <span className="guide-rule-target">Built-in resilience</span>
                    </div>
                  </div>

                  <div className="guide-scenarios-list">
                    <div className="guide-scenario">
                      <div className="scenario-label">
                        <Badge variant="success">Always Active</Badge>
                      </div>
                      <p>
                        Every question answer is synchronized in real-time. If you refresh your browser, close the tab, or lose internet connectivity, navigating back instantly resumes from the exact question and remaining timer.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
          </section>

          {/* SECTION 2: SPREADSHEET IMPORT */}
          <section id="upload" className="guide-section">
              <div className="guide-section-intro">
                <h2>Spreadsheet Import & Smart Column Mapping</h2>
                <p>
                  How QuizFocus transforms your Excel files (.xlsx, .xls), CSVs, and JSON files into quizzes automatically.
                </p>
              </div>

              <div className="guide-cards-grid">
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h3>Smart Column Detection</h3>
                      <span className="guide-rule-target">Automated header matching</span>
                    </div>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    Our parser scans your spreadsheet headers and automatically maps fields like:
                  </p>
                  <ul className="guide-feature-list">
                    <li><strong>Question Text</strong>: Matches <code>question</code>, <code>prompt</code>, <code>problem</code>, <code>q_text</code></li>
                    <li><strong>Options A, B, C, D</strong>: Matches separate columns (<code>Option A</code>, <code>A</code>, <code>Choice 1</code>) or pipe-delimited values</li>
                    <li><strong>Correct Answer</strong>: Matches labels (<code>A</code>, <code>B</code>), numeric indexes (<code>1</code>, <code>2</code>), or exact text matching</li>
                    <li><strong>Explanation</strong>: Matches <code>explanation</code>, <code>rationale</code>, <code>solution</code>, <code>notes</code></li>
                  </ul>
                </Card>

                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                      <Shield size={20} />
                    </div>
                    <div>
                      <h3>Security & Attack Protection</h3>
                      <span className="guide-rule-target">Formula & injection safeguards</span>
                    </div>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    All spreadsheet cells are sanitized against CSV formula injection (DDE attacks) and SQL-like pattern exploits. Any leading <code>=</code>, <code>+</code>, <code>-</code>, or <code>@</code> symbols in data cells are safely neutralized.
                  </p>
                </Card>
              </div>
          </section>

          <section id="create" className="guide-section">
            <div className="guide-section-intro">
              <h2>Create a quiz</h2>
              <p>Start from a blank canvas, import a file, or set up a competitive challenge.</p>
            </div>
            <div className="guide-cards-grid">
              <Card className="guide-rule-card">
                <div className="guide-rule-header">
                  <div className="guide-rule-icon"><PlusCircle size={20} /></div>
                  <div>
                    <h3>Choose a creation path</h3>
                    <span className="guide-rule-target">Three ways to get started</span>
                  </div>
                </div>
                <ul className="guide-feature-list">
                  <li><strong>Quiz</strong>: Build a self-paced quiz and write questions, answer choices, and explanations in the editor.</li>
                  <li><strong>Challenge</strong>: Set up a competitive quiz for your community.</li>
                  <li><strong>Import</strong>: Upload a spreadsheet and review the detected columns before creating your quiz.</li>
                  <li>Save your work as a draft and return to it later from your Dashboard.</li>
                </ul>
              </Card>
            </div>
          </section>

          <section id="workspace" className="guide-section">
            <div className="guide-section-intro">
              <h2>Your workspace</h2>
              <p>Pick up where you left off and keep your quizzes organized.</p>
            </div>
            <div className="guide-cards-grid">
              <Card className="guide-rule-card">
                <div className="guide-rule-header">
                  <div className="guide-rule-icon"><LayoutDashboard size={20} /></div>
                  <div>
                    <h3>Dashboard & quiz library</h3>
                    <span className="guide-rule-target">Your personal home base</span>
                  </div>
                </div>
                <ul className="guide-feature-list">
                  <li>Find your quizzes and filter the list by all, public, or private.</li>
                  <li>Search and sort your quiz library to find a specific title.</li>
                  <li>Continue recent attempts, resume drafts, and manage saved bookmarks from their dedicated sections.</li>
                  <li>Duplicate a draft, publish it when it is ready, or remove drafts you no longer need.</li>
                </ul>
              </Card>
              <Card className="guide-rule-card">
                <div className="guide-rule-header">
                  <div className="guide-rule-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <h3>Attempts & results</h3>
                    <span className="guide-rule-target">Review your learning progress</span>
                  </div>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                  After submitting a quiz, check your result and any review information the creator has made available. If an attempt supports resume, return to it from Continue Solving.
                </p>
              </Card>
            </div>
          </section>

          <section id="discover" className="guide-section">
            <div className="guide-section-intro">
              <h2>Discover</h2>
              <p>Find quizzes and creators through search, curated feeds, and topic filters.</p>
            </div>
            <div className="guide-cards-grid">
              <Card className="guide-rule-card">
                <div className="guide-rule-header">
                  <div className="guide-rule-icon"><Compass size={20} /></div>
                  <div>
                    <h3>Explore the community</h3>
                    <span className="guide-rule-target">Find your next study session</span>
                  </div>
                </div>
                <ul className="guide-feature-list">
                  <li>Search for quizzes, creators, or hashtags.</li>
                  <li>Browse For You, Trending, Top Rated, or Newest feeds.</li>
                  <li>Use difficulty filters to narrow down what to practice.</li>
                  <li>Open a quiz to see its details before you start playing.</li>
                </ul>
              </Card>
            </div>
          </section>

          {/* SECTION 3: PRIVACY & PUBLISHING */}
          <section id="privacy" className="guide-section">
              <div className="guide-section-intro">
                <h2>Public vs. Private Quizzes</h2>
                <p>
                  Control who can see and participate in your quizzes with one click.
                </p>
              </div>

              <div className="guide-cards-grid">
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                      <Eye size={20} />
                    </div>
                    <div>
                      <h3>Public Quizzes</h3>
                      <span className="guide-rule-target">Community visible</span>
                    </div>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    Toggling a quiz to <strong>Public</strong> means:
                  </p>
                  <ul className="guide-feature-list">
                    <li>Appears on your public profile page (<code>/@your_username</code>)</li>
                    <li>Searchable by anyone in the global search bar</li>
                    <li>Discoverable under the <strong>Explore Quizzes</strong> page</li>
                    <li>Eligible to receive likes, bookmarks, and comments from other learners</li>
                  </ul>
                </Card>

                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon">
                      <EyeOff size={20} />
                    </div>
                    <div>
                      <h3>Private Quizzes</h3>
                      <span className="guide-rule-target">Creator only</span>
                    </div>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    When a quiz is <strong>Private</strong>:
                  </p>
                  <ul className="guide-feature-list">
                    <li>Visible only to you inside your personal Dashboard</li>
                    <li>Hidden from Explore, Search, and your public profile</li>
                    <li>Direct access by other users is restricted with a 403 Forbidden check</li>
                  </ul>
                </Card>
              </div>
          </section>

          {/* SECTION 4: SOCIAL & FEED */}
          <section id="community" className="guide-section">
              <div className="guide-section-intro">
                <h2>Social Features & Public Challenges</h2>
                <p>
                  Engage with other learners, bookmark materials for later, and share challenges with friends.
                </p>
              </div>

              <div className="guide-cards-grid">
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'rgba(255, 69, 0, 0.1)', color: '#FF4500' }}>
                      <Heart size={20} />
                    </div>
                    <div>
                      <h3>Likes & Bookmarks</h3>
                      <span className="guide-rule-target">Upvoting & saving</span>
                    </div>
                  </div>
                  <ul className="guide-feature-list">
                    <li><strong>Heart / Upvote</strong>: Upvotes the quiz to increase its ranking on the Explore page and community activity feed.</li>
                    <li><strong>Bookmark</strong>: Saves the quiz directly into your personal <em>"Saved Bookmarks"</em> section on your Dashboard for quick study sessions.</li>
                  </ul>
                </Card>

                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-action-blue-light)', color: 'var(--color-action-blue)' }}>
                      <Share2 size={20} />
                    </div>
                    <div>
                      <h3>Challenge Links</h3>
                      <span className="guide-rule-target">Instant sharing</span>
                    </div>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    Clicking <strong>Share</strong> copies a challenge link. Anyone with this link (even logged-out guests) can immediately take the quiz, see their score, and test their skills.
                  </p>
                </Card>

                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                      <Award size={20} />
                    </div>
                    <div>
                      <h3>Challenges & competition</h3>
                      <span className="guide-rule-target">Take part or host your own</span>
                    </div>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    Explore featured and trending challenges, continue an attempt, or create a challenge for others. Challenge settings can control quiz defaults and ranking visibility.
                  </p>
                </Card>

                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon" style={{ background: 'var(--color-action-blue-light)', color: 'var(--color-action-blue)' }}>
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h3>Messages & notifications</h3>
                      <span className="guide-rule-target">Keep up with your community</span>
                    </div>
                  </div>
                  <ul className="guide-feature-list">
                    <li>Send direct messages and share quiz links privately.</li>
                    <li>React to messages, reply in context, and manage conversations from your inbox.</li>
                    <li>Notifications bring together activity such as challenge invites, followers, and comments.</li>
                  </ul>
                </Card>
              </div>
          </section>

          {/* SECTION 5: CREATOR PROFILES */}
          <section id="profiles" className="guide-section">
              <div className="guide-section-intro">
                <h2>Creator Profiles & Social Links</h2>
                <p>
                  Build your educator identity and showcase your public question banks.
                </p>
              </div>

              <div className="guide-cards-grid">
                <Card className="guide-rule-card">
                  <div className="guide-rule-header">
                    <div className="guide-rule-icon">
                      <Users size={20} />
                    </div>
                    <div>
                      <h3>Handle URLs & Social Links</h3>
                      <span className="guide-rule-target">/@username URL namespace</span>
                    </div>
                  </div>
                  <ul className="guide-feature-list">
                    <li><strong>Vanity URL</strong>: Share <code>/@your_username</code> with students or peers.</li>
                    <li><strong>Social Links</strong>: Add badges for GitHub, Twitter, LinkedIn, YouTube, or your personal portfolio in <em>Settings &gt; Public Profile</em>.</li>
                    <li><strong>Follow System</strong>: Other users can follow you to get instant activity notifications when you upload new quizzes.</li>
                  </ul>
                </Card>
              </div>
          </section>

          <section id="settings" className="guide-section">
            <div className="guide-section-intro">
              <h2>Settings</h2>
              <p>Personalize your account, privacy, notifications, and the way QuizFocus feels.</p>
            </div>
            <div className="guide-cards-grid">
              <Card className="guide-rule-card">
                <div className="guide-rule-header">
                  <div className="guide-rule-icon"><Settings size={20} /></div>
                  <div>
                    <h3>Make it yours</h3>
                    <span className="guide-rule-target">Settings are grouped by what you want to manage</span>
                  </div>
                </div>
                <ul className="guide-feature-list">
                  <li><strong>Account & Profile</strong>: update your personal details and account credentials.</li>
                  <li><strong>Privacy & Security</strong>: manage profile visibility and account sessions.</li>
                  <li><strong>Notifications</strong>: choose how you hear about invites, follows, comments, and updates.</li>
                  <li><strong>Competition & Challenges</strong>: manage challenge preferences, quiz defaults, and ranking visibility.</li>
                  <li><strong>Feed & Content</strong>: tune Explore recommendations and difficulty filters.</li>
                  <li><strong>Appearance & Accessibility</strong>: adjust theme, display density, and motion preferences.</li>
                  <li><strong>Your Activity & Data</strong>: review quiz history and available data controls.</li>
                </ul>
              </Card>
            </div>
          </section>
        </main>
      </div>

      <footer className="guide-footer">
        <div className="guide-footer-top">
          <div className="guide-footer-brand">
            <BookOpen size={18} />
            <strong>QuizFocus</strong>
            <span>Learn it. Share it. Keep moving.</span>
          </div>
          <Link to="/create" className="guide-footer-cta">
            Make a quiz <ArrowRight size={15} />
          </Link>
        </div>
        <div className="guide-footer-links">
          <div>
            <h3>Learn</h3>
            <Link to="/explore">Explore quizzes</Link>
            <Link to="/challenges">Challenges</Link>
            <Link to="/dashboard">Your dashboard</Link>
          </div>
          <div>
            <h3>Create</h3>
            <Link to="/create/quiz">Build a quiz</Link>
            <Link to="/create/upload">Import a spreadsheet</Link>
            <Link to="/create/challenge">Host a challenge</Link>
          </div>
          <div>
            <h3>Your account</h3>
            <Link to="/settings">Settings & preferences</Link>
            <Link to="/notifications">Notifications</Link>
            <Link to="/messages">Messages</Link>
          </div>
        </div>
        <div className="guide-footer-bottom">
          <span>Help for every part of QuizFocus.</span>
          <Link to="/settings/help">Help & About</Link>
        </div>
      </footer>

      <style>{guideStyles}</style>
    </div>
  );
}

const guideStyles = `
  .guide-page { padding: 8px 0 0; display: flex; flex-direction: column; gap: 28px; }
  .guide-search button { display: grid; place-items: center; width: 28px; height: 28px; color: var(--color-text-secondary); background: transparent; border-radius: 7px; cursor: pointer; }
  .guide-search button:hover { color: var(--color-text); background: var(--color-surface-hover); }
  .guide-search-count { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  .guide-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); align-items: start; gap: 28px; }
  .guide-nav-col { position: sticky; top: 24px; display: flex; flex-direction: column; gap: 16px; }
  .guide-nav-menu { display: flex; flex-direction: column; gap: 4px; }
  .guide-nav-item { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 9px; color: var(--color-text-secondary); text-align: left; background: transparent; border: 0; border-radius: 9px; cursor: pointer; }
  .guide-nav-item:hover { color: var(--color-text); background: var(--color-surface); }
  .guide-nav-item.active { color: var(--color-primary); background: var(--color-primary-light); }
  .guide-nav-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; }
  .guide-nav-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .guide-nav-text strong { font-size: 12.5px; font-weight: 650; }
  .guide-nav-text span { overflow: hidden; color: var(--color-text-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .guide-quick-create { padding: 16px; border-radius: 12px; }
  .guide-quick-create h4 { margin: 0 0 6px; color: var(--color-text); font-size: 15px; }
  .guide-quick-create p { margin: 0 0 14px; color: var(--color-text-secondary); font-size: 12.5px; line-height: 1.5; }
  .guide-content-col { display: flex; flex-direction: column; gap: 34px; min-width: 0; }
  .guide-section { display: flex; flex-direction: column; gap: 16px; padding-bottom: 28px; border-bottom: 1px solid var(--color-border); scroll-margin-top: 20px; }
  .guide-section[hidden], .guide-rule-card[hidden] { display: none; }
  .guide-section-intro h2 { margin: 0 0 5px; color: var(--color-text); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .guide-section-intro p { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; }
  .guide-cards-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .guide-rule-card { display: flex; flex-direction: column; gap: 14px; min-width: 0; padding: 18px; border-radius: 12px; }
  .guide-rule-header { display: flex; align-items: flex-start; gap: 11px; }
  .guide-rule-icon { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 auto; color: var(--color-primary); background: var(--color-surface-alt); border-radius: 9px; }
  .guide-rule-header h3 { margin: 0; color: var(--color-text); font-size: 14px; font-weight: 650; line-height: 1.35; }
  .guide-rule-target { color: var(--color-text-muted); font-size: 11px; }
  .guide-scenarios-list { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--color-border); }
  .guide-scenario { display: flex; flex-direction: column; gap: 6px; padding: 10px 11px; background: var(--color-surface-alt); border: 1px solid var(--color-border-light); border-radius: 8px; }
  .scenario-label { display: flex; align-items: center; gap: 8px; }
  .scenario-label strong { color: var(--color-text); font-size: 13px; }
  .guide-scenario p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; }
  .guide-feature-list { display: flex; flex-direction: column; gap: 7px; padding-left: 18px; color: var(--color-text-secondary); font-size: 12.5px; line-height: 1.5; }
  .guide-feature-list li::marker { color: var(--color-primary); }
  .guide-feature-list code { padding: 2px 6px; color: var(--color-primary); background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: 4px; font-size: 12px; }
  .guide-empty-state { display: flex; align-items: center; flex-direction: column; gap: 9px; padding: 40px 20px; color: var(--color-text-secondary); text-align: center; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; }
  .guide-empty-state h2 { margin: 0; color: var(--color-text); font-size: 16px; }
  .guide-empty-state p { margin: 0; font-size: 13px; }
  .guide-empty-state button { padding: 8px 12px; color: var(--color-text); background: var(--color-surface-hover); border: 0; border-radius: 8px; cursor: pointer; }
  .guide-footer { margin-top: 4px; padding-top: 24px; border-top: 1px solid var(--color-border); }
  .guide-footer-top, .guide-footer-brand { display: flex; align-items: center; }
  .guide-footer-top { justify-content: space-between; gap: 18px; padding-bottom: 20px; }
  .guide-footer-brand { flex-wrap: wrap; gap: 9px; color: var(--color-text-secondary); font-size: 12px; }
  .guide-footer-brand svg { color: var(--color-primary); }
  .guide-footer-brand strong { color: var(--color-text); font-size: 13px; }
  .guide-footer-cta { display: inline-flex; align-items: center; gap: 7px; padding: 9px 12px; color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 9px; text-decoration: none; font-size: 12px; font-weight: 600; }
  .guide-footer-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; padding: 18px 0; border-top: 1px solid var(--color-border); }
  .guide-footer-links > div { display: flex; flex-direction: column; align-items: flex-start; gap: 9px; }
  .guide-footer-links h3 { margin: 0 0 3px; color: var(--color-text); font-size: 11px; }
  .guide-footer-links a, .guide-footer-bottom a { color: var(--color-text-secondary); text-decoration: none; font-size: 11.5px; }
  .guide-footer-links a:hover, .guide-footer-bottom a:hover { color: var(--color-text); }
  .guide-footer-bottom { display: flex; justify-content: space-between; gap: 12px; padding: 14px 0 4px; color: var(--color-text-muted); border-top: 1px solid var(--color-border); font-size: 11px; }
  @media (max-width: 860px) {
    .guide-layout { grid-template-columns: 1fr; gap: 18px; }
    .guide-nav-col { position: static; }
    .guide-nav-menu { flex-direction: row; overflow-x: auto; }
    .guide-nav-item { flex: 0 0 auto; }
    .guide-nav-text span, .guide-quick-create { display: none; }
  }
  @media (max-width: 600px) {
    .guide-page { padding: 8px 0 0; gap: 20px; }
    .guide-layout { margin: 0 -14px; }
    .guide-nav-menu { padding: 0 8px; }
    .guide-cards-grid { grid-template-columns: 1fr; }
    .guide-footer-links { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .guide-footer-bottom { flex-direction: column; }
  }
`;