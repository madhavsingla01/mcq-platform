import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock,
  Zap,
  CheckCircle2,
  RefreshCw,
  Shuffle,
  Save,
  ArrowLeft,
  Play,
  Sliders,
  Shield,
  AlertCircle,
  FileQuestion,
  Trash2,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import {
  SettingsSection,
  SettingsRow,
  SettingsToggle,
  SettingsRadioGroup,
  CustomSelect,
  HashtagInput,
  Button,
  Spinner,
  showCustomDialog,
  ConfirmDeleteModal,
} from '../../components/ui';
import { clearAttemptSnapshot } from '../../utils/quizSession';
import '../Settings/Settings.css';

const TIMER_MODES = [
  {
    value: 'none',
    label: 'Untimed Practice',
    desc: 'No countdown pressure. Answer questions at your own pace without time limits.',
  },
  {
    value: 'soft',
    label: 'Soft Timer',
    desc: 'Displays a live countdown timer with warnings, but allows finishing all questions.',
  },
  {
    value: 'strict',
    label: 'Strict Exam Timer',
    desc: 'Simulates strict exam conditions. Automatically locks and submits when timer hits zero.',
  },
];

const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60];

const CATEGORY_OPTIONS = [
  { value: 'General', label: 'General Knowledge' },
  { value: 'Science', label: 'Science' },
  { value: 'Technology', label: 'Technology & Coding' },
  { value: 'Mathematics', label: 'Mathematics' },
  { value: 'History', label: 'History' },
  { value: 'Languages', label: 'Languages' },
  { value: 'Business', label: 'Business & Finance' },
  { value: 'Medicine', label: 'Medicine & Health' },
  { value: 'Other', label: 'Other Topics' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'All Levels', label: 'All Levels' },
  { value: 'Beginner', label: 'Beginner' },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced', label: 'Advanced' },
];

export default function QuizSettings() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [tags, setTags] = useState([]);
  const [difficulty, setDifficulty] = useState('All Levels');
  const [isPublic, setIsPublic] = useState(true);

  // Feature Settings State
  const [timerMode, setTimerMode] = useState('none');
  const [timeLimit, setTimeLimit] = useState(15);
  const [instantFeedback, setInstantFeedback] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchQuiz = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/quiz/${quizId}`);
        if (cancelled) return;
        const q = data.data.quiz;
        setQuiz(q);

        setTitle(q.title || '');
        setDescription(q.description || '');
        setCategory(q.category || 'General');
        setTags(Array.isArray(q.tags) ? q.tags : []);
        setDifficulty(q.difficulty || 'All Levels');
        setIsPublic(q.visibility === 'public' || q.isPublic === true);

        // Settings
        const s = q.settings || {};
        setTimerMode(s.timerMode || 'none');
        setTimeLimit(Number(s.timeLimit) || 15);
        setInstantFeedback(s.instantFeedback === true);
        setAllowReview(s.allowReview !== false);
        setShowExplanation(s.showExplanation !== false);
        setShuffleQuestions(s.shuffleQuestions === true);
        setShuffleOptions(s.shuffleOptions === true);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load quiz settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQuiz();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const isOwner = Boolean(
    user &&
    quiz &&
    (quiz.uploader === user._id || quiz.uploader?._id === user._id || user.role === 'admin')
  );

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setError('');
    setSaveSuccess(false);

    const settingsPayload = {
      timerMode,
      timeLimit: timerMode === 'none' ? 0 : Math.max(Number(timeLimit) || 0, 1),
      instantFeedback,
      allowReview,
      showExplanation,
      shuffleQuestions,
      shuffleOptions,
    };

    try {
      if (isOwner) {
        const { data } = await api.put(`/quizzes/${quizId}`, {
          title: title.trim() || quiz.title,
          description: description.trim(),
          category,
          tags,
          difficulty,
          visibility: isPublic ? 'public' : 'private',
          settings: settingsPayload,
        });
        setQuiz(data.data.quiz);
      } else {
        localStorage.setItem(`mcq.practice.settings.${quizId}`, JSON.stringify(settingsPayload));
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetAttempt = () => {
    clearAttemptSnapshot({ quizId });
    setResetNotice('Active in-progress attempt cleared. Next launch will begin a fresh attempt.');
    setTimeout(() => setResetNotice(''), 4000);
  };

  const handleDeleteQuiz = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/quizzes/${quizId}`);
      navigate('/dashboard?deleted=true');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete quiz.');
      setIsDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-stacked-shell">
        <div className="settings-stacked-content-card flex items-center justify-center py-24 gap-3">
          <Spinner size={32} />
          <span className="text-gray-400 font-semibold text-sm">Loading quiz configuration...</span>
        </div>
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <div className="settings-stacked-shell">
        <div className="settings-stacked-content-card flex flex-col items-center justify-center py-20 gap-4 text-center">
          <AlertCircle size={36} color="#ef4444" />
          <p className="text-gray-300 font-medium">{error}</p>
          <Link to="/dashboard" className="settings-activity-action-btn primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page-shell">
      <div className="settings-stacked-shell">
        <div className="settings-stacked-content-wrap">
          {/* Deck peek layer for stacked visual depth */}
          <div className="settings-stacked-deck-peek" aria-hidden="true" />

          <main className="settings-stacked-content-card">
            {/* Top Stacked Header with Breadcrumbs & Actions */}
            <div className="settings-stacked-header">
              <nav className="settings-breadcrumbs" aria-label="Settings breadcrumb path">
                <Link to="/dashboard" className="settings-breadcrumb-btn" title="Dashboard">
                  <ArrowLeft size={14} />
                  <span>Dashboard</span>
                </Link>

                <span className="settings-breadcrumb-sep">/</span>

                <Link
                  to={`/quiz/${quizId}`}
                  className="settings-breadcrumb-btn"
                  title="View Quiz Page"
                >
                  <BookOpen size={14} className="text-orange-500" />
                  <span className="max-w-[200px] truncate">{quiz?.title || 'Quiz'}</span>
                </Link>

                <span className="settings-breadcrumb-sep">/</span>

                <span className="settings-breadcrumb-current">
                  <span className="settings-breadcrumb-badge">
                    <Sliders size={13} />
                    <span>Quiz Settings</span>
                  </span>
                </span>
              </nav>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <Link to={`/quiz/${quizId}`} className="settings-activity-action-btn">
                  <Play size={13} fill="currentColor" />
                  <span>Start Quiz</span>
                </Link>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Spinner size={13} /> : <Save size={13} />}
                  <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                </Button>
              </div>
            </div>

            {/* Scrollable Content Body */}
            <form onSubmit={handleSave} className="quiz-settings-content">
              {/* Notifications */}
              {saveSuccess && (
                <div className="settings-alert-banner success">
                  <CheckCircle2 size={16} />
                  <span>Quiz settings successfully updated!</span>
                </div>
              )}

              {resetNotice && (
                <div className="settings-alert-banner success">
                  <CheckCircle2 size={16} />
                  <span>{resetNotice}</span>
                </div>
              )}

              {error && (
                <div className="settings-alert-banner error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {!isOwner && (
                <div className="settings-alert-banner warning">
                  <Shield size={16} />
                  <span>
                    You are viewing a community quiz. Customizations will apply to your personal practice session.
                  </span>
                </div>
              )}

              {/* 1. Quiz Metadata & Details */}
              <SettingsSection
                title="Quiz Details & Classification"
                description="General information, topic classification, and searchable tags."
                icon={FileQuestion}
              >
                <SettingsRow
                  title="Quiz Title"
                  description="Descriptive name displayed in feeds and challenge invitations."
                >
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!isOwner}
                    placeholder="Enter quiz title..."
                    className="settings-input-control text-sm px-3 py-2 bg-[#121215] border border-white/10 rounded-lg text-white outline-none focus:border-orange-500 w-full max-w-[340px]"
                  />
                </SettingsRow>

                <SettingsRow
                  title="Description"
                  description="Summary of concepts covered, syllabus context, or target audience."
                  align="start"
                >
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isOwner}
                    placeholder="Add brief description..."
                    className="settings-textarea-control"
                  />
                </SettingsRow>

                <SettingsRow
                  title="Primary Category"
                  description="Topic taxonomy for discovery on the Explore page."
                >
                  <div style={{ width: 220 }}>
                    <CustomSelect
                      value={category}
                      onChange={setCategory}
                      options={CATEGORY_OPTIONS}
                      disabled={!isOwner}
                      size="sm"
                    />
                  </div>
                </SettingsRow>

                <SettingsRow
                  title="Difficulty Level"
                  description="Assists learners in selecting appropriate practice material."
                >
                  <div style={{ width: 200 }}>
                    <CustomSelect
                      value={difficulty}
                      onChange={setDifficulty}
                      options={DIFFICULTY_OPTIONS}
                      disabled={!isOwner}
                      size="sm"
                    />
                  </div>
                </SettingsRow>

                <SettingsRow
                  title="Subject Hashtags"
                  description="Add relevant keywords for search filtering."
                  align="start"
                >
                  <div className="w-full max-w-[400px]">
                    <HashtagInput
                      tags={tags}
                      onChange={setTags}
                      disabled={!isOwner}
                      placeholder="Add tag and press Enter..."
                    />
                  </div>
                </SettingsRow>
              </SettingsSection>

              {/* 2. Timer & Time Constraints */}
              <SettingsSection
                title="Timer & Examination Constraints"
                description="Control countdown conditions, time limits, and submission rules."
                icon={Clock}
              >
                <div className="py-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                    Timer Mode
                  </span>
                  <SettingsRadioGroup
                    value={timerMode}
                    onChange={setTimerMode}
                    options={TIMER_MODES}
                    layout="horizontal"
                  />
                </div>

                {timerMode !== 'none' && (
                  <SettingsRow
                    title="Time Limit"
                    description="Total duration allocated for completing the entire question set."
                  >
                    <div className="flex flex-col items-end gap-2">
                      <div className="settings-preset-row">
                        {TIME_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`settings-preset-btn ${timeLimit === preset ? 'active' : ''}`}
                            onClick={() => setTimeLimit(preset)}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">Custom Minutes:</span>
                        <input
                          type="number"
                          min={1}
                          max={360}
                          value={timeLimit}
                          onChange={(e) => setTimeLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-16 px-2 py-1 bg-[#121215] border border-white/10 rounded-md text-white text-center text-xs font-bold outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  </SettingsRow>
                )}
              </SettingsSection>

              {/* 3. Question & Solving Mechanics */}
              <SettingsSection
                title="Question & Solving Mechanics"
                description="Configure feedback timing, answer modifications, and question ordering."
                icon={Zap}
              >
                <SettingsRow
                  title="Instant Answer Feedback"
                  description="Reveal solution explanations and correctness immediately upon answering each question."
                >
                  <SettingsToggle
                    id="toggle-instant-feedback"
                    checked={instantFeedback}
                    onChange={setInstantFeedback}
                  />
                </SettingsRow>

                <SettingsRow
                  title="Allow Question Review"
                  description="Permit navigating backward to revise answers before final submission."
                >
                  <SettingsToggle
                    id="toggle-allow-review"
                    checked={allowReview}
                    onChange={setAllowReview}
                  />
                </SettingsRow>

                <SettingsRow
                  title="Show Explanations"
                  description="Display comprehensive learning explanations, notes, and reference links."
                >
                  <SettingsToggle
                    id="toggle-show-explanation"
                    checked={showExplanation}
                    onChange={setShowExplanation}
                  />
                </SettingsRow>

                <SettingsRow
                  title="Shuffle Question Order"
                  description="Randomize question sequence on every attempt to deter rote memorization."
                >
                  <SettingsToggle
                    id="toggle-shuffle-questions"
                    checked={shuffleQuestions}
                    onChange={setShuffleQuestions}
                  />
                </SettingsRow>

                <SettingsRow
                  title="Shuffle Option Sequence"
                  description="Randomize multiple-choice option order (A, B, C, D) per question."
                >
                  <SettingsToggle
                    id="toggle-shuffle-options"
                    checked={shuffleOptions}
                    onChange={setShuffleOptions}
                  />
                </SettingsRow>
              </SettingsSection>

              {/* 4. Visibility & Access */}
              <SettingsSection
                title="Visibility & Community Sharing"
                description="Control whether this quiz is discoverable by the public community."
                icon={Shield}
              >
                <SettingsRow
                  title="Make Quiz Public"
                  description="Public quizzes appear on Explore, feed recommendations, and public creator profiles."
                >
                  <SettingsToggle
                    id="toggle-public-quiz"
                    checked={isPublic}
                    onChange={setIsPublic}
                    disabled={!isOwner}
                  />
                </SettingsRow>
              </SettingsSection>

              {/* 5. In-Progress Session Reset */}
              <SettingsSection
                title="Active Practice Session"
                description="Manage your ongoing attempts and cached answer draft for this quiz."
                icon={RefreshCw}
              >
                <SettingsRow
                  title="Reset In-Progress Attempt Session"
                  description="Clears your local question progress, unsubmitted draft answers, and starts fresh."
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAttempt}
                  >
                    <RefreshCw size={13} />
                    <span>Reset Attempt</span>
                  </Button>
                </SettingsRow>
              </SettingsSection>

              {/* 6. Danger Zone (Owner Only) */}
              {isOwner && (
                <SettingsSection
                  title="Danger Zone"
                  description="Permanent actions regarding this quiz."
                  icon={AlertCircle}
                  dangerZone
                >
                  <SettingsRow
                    title="Permanently Delete Quiz"
                    description="Permanently erase this quiz, questions, social comments, and associated attempts from the database."
                    destructive
                  >
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteModalOpen(true)}
                    >
                      <Trash2 size={13} />
                      <span>Delete Quiz</span>
                    </Button>
                  </SettingsRow>
                </SettingsSection>
              )}

              {/* Bottom Sticky Action Bar */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <Link to={`/quiz/${quizId}`} className="settings-activity-action-btn">
                  Cancel
                </Link>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? <Spinner size={14} /> : <Save size={14} />}
                  <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                </Button>
              </div>
            </form>
          </main>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => !isDeleting && setDeleteModalOpen(false)}
          onConfirm={handleDeleteQuiz}
          title="Delete Quiz Permanently?"
          message={`Are you sure you want to permanently delete "${quiz?.title || 'this quiz'}"?`}
          details="All questions, answers, participant attempt records, comments, and analytics will be destroyed. This cannot be undone."
          confirmText="Yes, Delete Quiz"
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
