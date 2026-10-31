import './ManualBuilder.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Check,
  Clock,
  Zap,
  CheckCircle2,
  HelpCircle,
  Sliders,
  ChevronDown,
  ChevronUp,
  Settings,
  Trash2,
  Copy,
  MoveUp,
  MoveDown,
  Image as ImageIcon,
  Upload,
  X,
  Eye,
  Trophy,
  AlertTriangle,
  Sparkles,
  Tag,
  Layers,
  CheckSquare,
  ListFilter,
  Calendar,
  Shield,
  Globe,
  Lock,
  Link as LinkIcon,
  AlertCircle,
  RefreshCw,
  FileText,
  Bookmark,
  ExternalLink,
} from 'lucide-react';
import api from '../../api/axios';
import { compressImage } from '../../utils/imageCompressor';
import { fileFromDataUrl, runWithUploadPanel } from '../../store/uploadPanelStore';
import { MediaService } from '../../services/media.service';
import { useAuthStore } from '../../store/authStore';
import {
  deleteQuizBuilderCheckpoint,
  loadQuizBuilderCheckpoint,
  saveQuizBuilderCheckpoint,
} from '../../utils/quizBuilderRecovery';

const CATEGORIES = [
  'General',
  'Technology',
  'Computer Science',
  'Science',
  'Mathematics',
  'History',
  'Languages',
  'Business',
  'Medicine',
  'Literature',
  'Engineering',
  'Other',
];

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'];

const QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Single Choice', icon: CheckCircle2, desc: 'One correct option' },
  { id: 'checkboxes', label: 'Multiple Select', icon: CheckSquare, desc: 'Multiple correct options' },
  { id: 'dropdown', label: 'Dropdown Selection', icon: ListFilter, desc: 'Select from a dropdown' },
  { id: 'true_false', label: 'True / False', icon: Zap, desc: 'Binary true or false choice' },
  { id: 'short_answer', label: 'Short Answer', icon: FileText, desc: 'Exact text or keyword match' },
];

const toLocalDateTimeValue = (value) => {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function ManualBuilder({ isChallenge: challengeRoute = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const recoveryUserId = user?._id || user?.id;
  const draftIdParam = searchParams.get('draftId');
  const [isChallengeBuilder, setIsChallengeBuilder] = useState(challengeRoute);
  const fileInputRef = useRef(null);

  // ── Draft Tracking State ──
  const [activeDraftId, setActiveDraftId] = useState(draftIdParam || null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const handleSaveRef = useRef(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState('Restoring…');
  const hasUnsavedChangesRef = useRef(false);
  const hasEditorContentRef = useRef(false);
  const isSavingRef = useRef(false);
  const changeRevisionRef = useRef(0);
  const skipDirtyEffectRef = useRef(false);
  const recoveryDisabledRef = useRef(false);
  const recoverySnapshotRef = useRef(null);

  // ── Quiz Basic Metadata ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [coverStats, setCoverStats] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState('');

  // ── Quiz Settings & Governance ──
  const [category, setCategory] = useState(challengeRoute ? 'Technology' : 'General');
  const [difficulty, setDifficulty] = useState(challengeRoute ? 'Intermediate' : 'All Levels');
  const [visibility, setVisibility] = useState('public');
  const [tags, setTags] = useState(challengeRoute ? ['challenge', 'tournament', 'competition'] : ['quiz', 'practice']);
  const [tagInput, setTagInput] = useState('');

  // ── Evaluation & Timer ──
  const [timerMode, setTimerMode] = useState('none');
  const [timeLimit, setTimeLimit] = useState(15);
  const [instantFeedback, setInstantFeedback] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [challengeDuration, setChallengeDuration] = useState(15);
  const [challengeDeadline, setChallengeDeadline] = useState(() => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    deadline.setMinutes(0, 0, 0);
    return toLocalDateTimeValue(deadline);
  });
  const [challengeAccessType, setChallengeAccessType] = useState('public');
  const [challengeInviteAccessType, setChallengeInviteAccessType] = useState('invitation');

  // ── Floating Settings Window State ──
  const [showFloatingSettings, setShowFloatingSettings] = useState(false);
  const [floatingSettingsTab, setFloatingSettingsTab] = useState('general'); // 'general' | 'timer'

  // ── Questions State ──
  const [questions, setQuestions] = useState([
    {
      id: 'q-init-1',
      text: '',
      type: 'multiple_choice',
      options: ['', '', '', ''],
      correctIndex: 0,
      correctIndexes: [0],
      shortAnswer: '',
      marks: 1,
      negativeMarks: 0,
      explanation: '',
      difficulty: 'Inherit',
      category: 'General',
      mediaUrl: '',
      activeTab: 'content', // 'content' | 'settings'
    },
  ]);

  // ── Execution State ──
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const recoverySnapshot = {
    draftId: activeDraftId,
    serverSavedAt: lastSavedAt?.toISOString() || null,
    isChallenge: isChallengeBuilder,
    challengeDuration,
    challengeDeadline,
    challengeAccessType,
    challengeInviteAccessType,
    title,
    description,
    coverImage,
    customCoverUrl,
    category,
    difficulty,
    visibility,
    tags,
    tagInput,
    timerMode,
    timeLimit,
    instantFeedback,
    allowReview,
    showExplanation,
    shuffleQuestions,
    shuffleOptions,
    questions,
  };
  recoverySnapshotRef.current = recoverySnapshot;
  hasEditorContentRef.current = Boolean(
    title.trim() ||
    description.trim() ||
    questions.length > 1 ||
    questions.some((question) => (
      question.text.trim() ||
      question.options.some((option) => option.trim()) ||
      question.shortAnswer.trim() ||
      question.explanation.trim() ||
      question.mediaUrl.trim()
    ))
  );

  const applyLocalCheckpoint = (checkpoint) => {
    hasUnsavedChangesRef.current = true;
    setIsChallengeBuilder(checkpoint.isChallenge === true || challengeRoute);
    setActiveDraftId(checkpoint.draftId || draftIdParam || null);
    setTitle(checkpoint.title || '');
    setDescription(checkpoint.description || '');
    setCoverImage(checkpoint.coverImage || '');
    setCustomCoverUrl(checkpoint.customCoverUrl || '');
    setCategory(checkpoint.category || 'General');
    setDifficulty(checkpoint.difficulty || 'All Levels');
    setVisibility(checkpoint.visibility || 'public');
    setTags(Array.isArray(checkpoint.tags) ? checkpoint.tags : ['quiz', 'practice']);
    setTagInput(checkpoint.tagInput || '');
    setTimerMode(checkpoint.timerMode || 'none');
    setTimeLimit(checkpoint.timeLimit || 15);
    setInstantFeedback(checkpoint.instantFeedback === true);
    setAllowReview(checkpoint.allowReview !== false);
    setShowExplanation(checkpoint.showExplanation !== false);
    setShuffleQuestions(checkpoint.shuffleQuestions === true);
    setShuffleOptions(checkpoint.shuffleOptions === true);
    setChallengeDuration(checkpoint.challengeDuration || 15);
    setChallengeDeadline(checkpoint.challengeDeadline || toLocalDateTimeValue(new Date(Date.now() + 7 * 86400000)));
    setChallengeAccessType(checkpoint.challengeAccessType || 'public');
    setChallengeInviteAccessType(checkpoint.challengeInviteAccessType || 'invitation');
    if (Array.isArray(checkpoint.questions) && checkpoint.questions.length) {
      setQuestions(checkpoint.questions);
    }
    setLastSavedAt(checkpoint.serverSavedAt ? new Date(checkpoint.serverSavedAt) : null);
  };

  // ── Hydrate Draft If Provided in URL ──
  useEffect(() => {
    if (!draftIdParam) {
      let isMounted = true;
      const restoreCheckpoint = async () => {
        try {
          if (recoveryUserId) {
            const checkpoint = await loadQuizBuilderCheckpoint(recoveryUserId);
            if (isMounted && checkpoint) {
              skipDirtyEffectRef.current = true;
              applyLocalCheckpoint(checkpoint);
              setRecoveryStatus('Recovered');
              setFeedback({ type: 'success', text: 'Recovered your latest quiz checkpoint.' });
            }
          } else {
            setRecoveryStatus('Recovery unavailable');
          }
        } catch (error) {
          if (isMounted) {
            setRecoveryStatus('Recovery unavailable');
            setFeedback({ type: 'error', text: error.message || 'Could not load the local quiz checkpoint.' });
          }
        } finally {
          if (isMounted) {
            skipDirtyEffectRef.current = true;
            setRecoveryReady(true);
          }
        }
      };

      restoreCheckpoint();
      return () => {
        isMounted = false;
      };
    }

    let isMounted = true;
    const fetchDraft = async () => {
      setIsLoadingDraft(true);
      try {
        const { data } = await api.get(`/quiz/drafts/${draftIdParam}`);
        if (!isMounted) return;
        const d = data.data?.draft;
        if (d) {
          skipDirtyEffectRef.current = true;
          setActiveDraftId(d._id);
          setIsChallengeBuilder(d.isChallenge === true);
          setTitle(d.title || '');
          setDescription(d.description || '');
          setCoverImage(d.thumbnail || '');
          setCategory(d.category || 'General');
          setDifficulty(d.difficulty || 'All Levels');
          setVisibility(d.visibility || 'public');
          if (d.isChallenge) {
            setChallengeDuration(Number(d.durationMinutes) || 15);
            if (d.deadlineAt) setChallengeDeadline(toLocalDateTimeValue(d.deadlineAt));
            setChallengeAccessType(d.accessType === 'invite_only' ? 'invite_only' : 'public');
            setChallengeInviteAccessType(d.inviteAccessType === 'approval' ? 'approval' : 'invitation');
          }
          if (Array.isArray(d.tags) && d.tags.length > 0) {
            setTags(d.tags);
          }
          if (d.settings) {
            if (d.settings.timerMode) setTimerMode(d.settings.timerMode);
            if (d.settings.timeLimit) setTimeLimit(d.settings.timeLimit);
            if (typeof d.settings.instantFeedback === 'boolean') setInstantFeedback(d.settings.instantFeedback);
            if (typeof d.settings.allowReview === 'boolean') setAllowReview(d.settings.allowReview);
            if (typeof d.settings.showExplanation === 'boolean') setShowExplanation(d.settings.showExplanation);
            if (typeof d.settings.shuffleQuestions === 'boolean') setShuffleQuestions(d.settings.shuffleQuestions);
            if (typeof d.settings.shuffleOptions === 'boolean') setShuffleOptions(d.settings.shuffleOptions);
          }

          if (Array.isArray(d.questions) && d.questions.length > 0) {
            const mappedQuestions = d.questions.map((q, idx) => {
              const qType = q.questionType || 'multiple_choice';
              const isCheckboxes = qType === 'checkboxes';
              const isTrueFalse =
                qType === 'true_false' ||
                (Array.isArray(q.options) &&
                  q.options.length === 2 &&
                  (q.options[0]?.text === 'True' || q.options[0] === 'True'));

              let options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
              let correctIndex = 0;
              let correctIndexes = [0];
              let shortAnswer = '';

              if (isTrueFalse) {
                options = ['True', 'False'];
                correctIndex = q.correctAnswer === 'B' || q.correctAnswer === 'False' ? 1 : 0;
              } else if (isCheckboxes) {
                options =
                  Array.isArray(q.options) && q.options.length
                    ? q.options.map((o) => (typeof o === 'object' && o !== null ? o.text || '' : String(o)))
                    : ['', '', '', ''];
                if (Array.isArray(q.correctAnswer)) {
                  correctIndexes = options
                    .map((_, i) => {
                      const label = String.fromCharCode(65 + i);
                      return q.correctAnswer.includes(label) ? i : -1;
                    })
                    .filter((i) => i !== -1);
                } else if (Array.isArray(q.options)) {
                  correctIndexes = q.options
                    .map((o, i) => (typeof o === 'object' && o?.isCorrect ? i : -1))
                    .filter((i) => i !== -1);
                }
                if (!correctIndexes.length) correctIndexes = [0];
              } else if (qType === 'short_answer') {
                shortAnswer = typeof q.correctAnswer === 'string' ? q.correctAnswer : '';
                options = [];
              } else {
                // single choice or dropdown
                options =
                  Array.isArray(q.options) && q.options.length
                    ? q.options.map((o) => (typeof o === 'object' && o !== null ? o.text || '' : String(o)))
                    : ['', '', '', ''];
                if (typeof q.correctAnswer === 'string') {
                  const code = q.correctAnswer.toUpperCase().charCodeAt(0) - 65;
                  if (code >= 0 && code < options.length) {
                    correctIndex = code;
                  } else {
                    const foundIdx = options.findIndex((opt) => opt.toLowerCase() === q.correctAnswer.toLowerCase());
                    if (foundIdx >= 0) correctIndex = foundIdx;
                  }
                } else if (Array.isArray(q.options)) {
                  const foundIdx = q.options.findIndex((opt) => typeof opt === 'object' && opt?.isCorrect === true);
                  if (foundIdx >= 0) correctIndex = foundIdx;
                }
              }

              return {
                id: q._id ? `q-loaded-${q._id}` : `q-${Date.now()}-${idx}`,
                text: q.questionText || '',
                type: isTrueFalse ? 'true_false' : qType,
                options,
                correctIndex,
                correctIndexes,
                shortAnswer,
                marks: Number(q.marks) || 1,
                negativeMarks: Number(q.negativeMarks) || 0,
                explanation: q.explanation || '',
                difficulty: q.difficulty || 'Inherit',
                category: q.category || 'General',
                mediaUrl: q.media?.url || '',
                activeTab: 'content',
              };
            });
            setQuestions(mappedQuestions);
          }

          if (d.updatedAt) {
            setLastSavedAt(new Date(d.updatedAt));
          }

          if (recoveryUserId) {
            try {
              const checkpoint = await loadQuizBuilderCheckpoint(recoveryUserId);
              const checkpointMatchesDraft = checkpoint?.draftId === String(d._id);
              const checkpointIsNewer = checkpointMatchesDraft && (
                !checkpoint.serverSavedAt ||
                new Date(checkpoint.savedAt).getTime() > new Date(checkpoint.serverSavedAt).getTime()
              );
              if (isMounted && checkpointIsNewer) {
                skipDirtyEffectRef.current = true;
                applyLocalCheckpoint(checkpoint);
                setRecoveryStatus('Recovered');
                setFeedback({ type: 'success', text: 'Recovered newer local changes to this draft.' });
              } else if (isMounted) {
                setRecoveryStatus('Synced');
                setFeedback({ type: 'success', text: `Loaded draft: "${d.title}"` });
              }
            } catch (error) {
              if (isMounted) {
                setRecoveryStatus('Recovery unavailable');
                setFeedback({ type: 'error', text: error.message || 'Could not check for a local quiz checkpoint.' });
              }
            }
          } else {
            setRecoveryStatus('Synced');
            setFeedback({ type: 'success', text: `Loaded draft: "${d.title}"` });
          }
        }
      } catch (err) {
        if (recoveryUserId) {
          try {
            const checkpoint = await loadQuizBuilderCheckpoint(recoveryUserId);
            if (isMounted && checkpoint?.draftId === String(draftIdParam)) {
              skipDirtyEffectRef.current = true;
              applyLocalCheckpoint(checkpoint);
              setRecoveryStatus('Recovered offline');
              setFeedback({ type: 'success', text: 'The server draft is unavailable; recovered your local checkpoint.' });
            } else if (isMounted) {
              setFeedback({
                type: 'error',
                text: 'Failed to load draft data. You can start fresh or return to Dashboard.',
              });
            }
          } catch (recoveryError) {
            if (isMounted) {
              setRecoveryStatus('Recovery unavailable');
              setFeedback({
                type: 'error',
                text: recoveryError.message || err?.response?.data?.message || 'Failed to load draft data.',
              });
            }
          }
        } else {
          setFeedback({
            type: 'error',
            text: 'Failed to load draft data. You can start fresh or return to Dashboard.',
          });
        }
      } finally {
        if (isMounted) {
          skipDirtyEffectRef.current = true;
          setRecoveryReady(true);
          setIsLoadingDraft(false);
        }
      }
    };
    fetchDraft();
    return () => {
      isMounted = false;
    };
  }, [draftIdParam, recoveryUserId]);

  useEffect(() => {
    if (!recoveryReady) return;
    if (skipDirtyEffectRef.current) {
      skipDirtyEffectRef.current = false;
      return;
    }
    changeRevisionRef.current += 1;
    hasUnsavedChangesRef.current = true;
  }, [
    recoveryReady,
    title,
    description,
    coverImage,
    customCoverUrl,
    category,
    difficulty,
    visibility,
    tags,
    tagInput,
    timerMode,
    timeLimit,
    instantFeedback,
    allowReview,
    showExplanation,
    shuffleQuestions,
    shuffleOptions,
    isChallengeBuilder,
    challengeDuration,
    challengeDeadline,
    challengeAccessType,
    challengeInviteAccessType,
    questions,
  ]);

  useEffect(() => {
    if (!recoveryReady || !recoveryUserId) return undefined;
    const timer = window.setTimeout(async () => {
      if (recoveryDisabledRef.current) return;
      setRecoveryStatus('Saving locally…');
      try {
        await saveQuizBuilderCheckpoint(recoveryUserId, recoverySnapshotRef.current);
        setRecoveryStatus('Saved locally');
      } catch (error) {
        setRecoveryStatus('Local checkpoint failed');
        setFeedback({ type: 'error', text: error.message || 'Could not save the local quiz checkpoint.' });
      }
    }, 750);

    return () => window.clearTimeout(timer);
  }, [
    recoveryReady,
    recoveryUserId,
    activeDraftId,
    lastSavedAt,
    title,
    description,
    coverImage,
    customCoverUrl,
    category,
    difficulty,
    visibility,
    tags,
    tagInput,
    timerMode,
    timeLimit,
    instantFeedback,
    allowReview,
    showExplanation,
    shuffleQuestions,
    shuffleOptions,
    isChallengeBuilder,
    challengeDuration,
    challengeDeadline,
    challengeAccessType,
    challengeInviteAccessType,
    questions,
  ]);

  useEffect(() => {
    if (!recoveryReady) return undefined;
    const timer = window.setInterval(() => {
      if (
        !recoveryDisabledRef.current &&
        hasUnsavedChangesRef.current &&
        hasEditorContentRef.current &&
        !isSavingRef.current
      ) {
        handleSaveRef.current?.(true, { auto: true });
      }
    }, 2 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [recoveryReady]);

  useEffect(() => {
    if (!recoveryReady || !recoveryUserId) return undefined;
    const flushCheckpoint = () => {
      if (recoveryDisabledRef.current) return;
      saveQuizBuilderCheckpoint(recoveryUserId, recoverySnapshotRef.current).catch((error) => {
        setRecoveryStatus('Local checkpoint failed');
        setFeedback({ type: 'error', text: error.message || 'Could not save the local quiz checkpoint.' });
      });
    };
    const syncWhenOnline = () => {
      if (
        !recoveryDisabledRef.current &&
        hasUnsavedChangesRef.current &&
        hasEditorContentRef.current &&
        !isSavingRef.current
      ) {
        handleSaveRef.current?.(true, { auto: true });
      }
    };

    window.addEventListener('pagehide', flushCheckpoint);
    window.addEventListener('online', syncWhenOnline);
    return () => {
      window.removeEventListener('pagehide', flushCheckpoint);
      window.removeEventListener('online', syncWhenOnline);
    };
  }, [recoveryReady, recoveryUserId]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape to close floating settings
      if (e.key === 'Escape' && showFloatingSettings) {
        setShowFloatingSettings(false);
      }
      // Ctrl+Enter to add question
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        addQuestion();
      }
      // Ctrl+S / Cmd+S to save draft
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current?.(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFloatingSettings]);

  // Auto-dismiss feedback message after 4s
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // ── Cover Image Processing ──
  const processCoverFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setFeedback({ type: 'error', text: 'Please upload a valid image file (PNG, JPG, WebP).' });
      return;
    }
    setCoverUploading(true);
    try {
      const result = await compressImage(file, { maxWidth: 1280, maxHeight: 720, quality: 0.85 });
      const reader = new FileReader();
      reader.onload = (e) => {
        setCoverImage(e.target.result);
        setCoverStats({
          originalSize: Math.round(result.originalSize / 1024),
          compressedSize: Math.round(result.compressedSize / 1024),
        });
        setCoverUploading(false);
        setFeedback({ type: 'success', text: `Cover optimized & set! (${Math.round(result.compressedSize / 1024)} KB)` });
      };
      reader.readAsDataURL(result.file);
    } catch (err) {
      setCoverUploading(false);
      setFeedback({ type: 'error', text: 'Failed to process image. You can paste an image URL instead.' });
    }
  };

  const handleCoverDrop = (e) => {
    e.preventDefault();
    setIsDraggingCover(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCoverFile(e.dataTransfer.files[0]);
    }
  };

  const validateRemoteImageUrl = async (value) => {
    if (!value?.trim() || value.trim().startsWith('data:image/')) return true;
    try {
      await MediaService.validateImageUrl(value.trim());
      return true;
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error?.response?.data?.message || 'Use a public HTTPS URL for a supported image.',
      });
      return false;
    }
  };

  const applyCustomCoverUrl = async () => {
    if (!customCoverUrl.trim()) return;
    if (!await validateRemoteImageUrl(customCoverUrl)) return;
    setCoverImage(customCoverUrl.trim());
    setCoverStats(null);
    setCustomCoverUrl('');
    setFeedback({ type: 'success', text: 'Cover image URL set successfully.' });
  };

  // ── Tags Management ──
  const addTag = () => {
    const clean = tagInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (clean && !tags.includes(clean)) {
      if (tags.length >= 8) {
        setFeedback({ type: 'error', text: 'Maximum 8 tags allowed.' });
        return;
      }
      setTags([...tags, clean]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // ── Question Operations ──
  const addQuestion = (type = 'multiple_choice') => {
    if (isChallengeBuilder && questions.length >= 10) {
      setFeedback({ type: 'error', text: 'Challenges can include up to 10 questions.' });
      return;
    }
    const newQ = {
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: '',
      type,
      options: type === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
      correctIndex: 0,
      correctIndexes: [0],
      shortAnswer: '',
      marks: 1,
      negativeMarks: 0,
      explanation: '',
      difficulty: 'Inherit',
      category,
      mediaUrl: '',
      activeTab: 'content',
    };
    setQuestions([...questions, newQ]);
  };

  const duplicateQuestion = (index) => {
    if (isChallengeBuilder && questions.length >= 10) {
      setFeedback({ type: 'error', text: 'Challenges can include up to 10 questions.' });
      return;
    }
    const q = questions[index];
    const duplicated = {
      ...q,
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text: `${q.text} (Copy)`,
      options: [...q.options],
      correctIndexes: [...q.correctIndexes],
    };
    const updated = [...questions];
    updated.splice(index + 1, 0, duplicated);
    setQuestions(updated);
    setFeedback({ type: 'success', text: `Question ${index + 1} duplicated.` });
  };

  const deleteQuestion = (index) => {
    if (questions.length <= 1) {
      setFeedback({ type: 'error', text: 'A quiz must contain at least one question.' });
      return;
    }
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const updated = [...questions];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setQuestions(updated);
  };

  const updateQuestionField = (index, field, value) => {
    const updated = [...questions];
    updated[index][field] = value;
    setQuestions(updated);
  };

  const setQuestionType = (index, newType) => {
    const updated = [...questions];
    const q = updated[index];
    q.type = newType;
    if (newType === 'true_false') {
      q.options = ['True', 'False'];
      q.correctIndex = 0;
    } else if (newType === 'short_answer') {
      q.options = [];
    } else {
      if (!q.options || q.options.length < 2) {
        q.options = ['', '', '', ''];
      }
    }
    setQuestions(updated);
  };

  const updateOptionText = (qIndex, oIndex, value) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  };

  const addOptionToQuestion = (qIndex) => {
    const updated = [...questions];
    if (updated[qIndex].options.length >= 8) {
      setFeedback({ type: 'error', text: 'Maximum 8 options allowed per question.' });
      return;
    }
    updated[qIndex].options.push('');
    setQuestions(updated);
  };

  const removeOptionFromQuestion = (qIndex, oIndex) => {
    const updated = [...questions];
    if (updated[qIndex].options.length <= 2) {
      setFeedback({ type: 'error', text: 'Multiple choice questions must have at least 2 options.' });
      return;
    }
    updated[qIndex].options.splice(oIndex, 1);
    // Adjust correctIndex if needed
    if (updated[qIndex].correctIndex >= updated[qIndex].options.length) {
      updated[qIndex].correctIndex = 0;
    }
    updated[qIndex].correctIndexes = updated[qIndex].correctIndexes
      .filter((ci) => ci !== oIndex)
      .map((ci) => (ci > oIndex ? ci - 1 : ci));
    if (!updated[qIndex].correctIndexes.length) {
      updated[qIndex].correctIndexes = [0];
    }
    setQuestions(updated);
  };

  const toggleOptionCorrect = (qIndex, oIndex) => {
    const updated = [...questions];
    const q = updated[qIndex];
    if (q.type === 'checkboxes') {
      const exists = q.correctIndexes.includes(oIndex);
      if (exists) {
        if (q.correctIndexes.length <= 1) {
          setFeedback({ type: 'error', text: 'At least one correct answer must be selected.' });
          return;
        }
        q.correctIndexes = q.correctIndexes.filter((i) => i !== oIndex);
      } else {
        q.correctIndexes = [...q.correctIndexes, oIndex].sort((a, b) => a - b);
      }
    } else {
      q.correctIndex = oIndex;
    }
    setQuestions(updated);
  };

  // ── Calculate Quiz Summary Stats ──
  const totalMarks = questions.reduce((acc, q) => acc + (Number(q.marks) || 1), 0);

  // ── Save & Publish ──
  const handleSave = async (isDraft = false, { auto = false } = {}) => {
    if (isSavingRef.current) return;
    if (!title.trim() && !auto) {
      setFeedback({ type: 'error', text: `Please enter a ${isChallengeBuilder ? 'challenge' : 'quiz'} title before saving.` });
      return;
    }

    if (isChallengeBuilder && !isDraft) {
      const deadline = new Date(challengeDeadline);
      if (!Number.isFinite(challengeDuration) || challengeDuration <= 0) {
        setFeedback({ type: 'error', text: 'Set a valid challenge duration before publishing.' });
        return;
      }
      if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) {
        setFeedback({ type: 'error', text: 'Set a future challenge deadline before publishing.' });
        return;
      }
    }

    if (isChallengeBuilder && questions.length > 10) {
      setFeedback({ type: 'error', text: 'Challenges can include up to 10 questions.' });
      return;
    }

    const imageUrls = [coverImage, ...questions.map((question) => question.mediaUrl)]
      .filter((url) => url?.trim() && !url.trim().startsWith('data:image/'));
    if (!auto) {
      for (const url of imageUrls) {
        if (!await validateRemoteImageUrl(url)) return;
      }
    }

    // Validate questions if publishing
    if (!isDraft) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.text.trim()) {
          setFeedback({ type: 'error', text: `Question ${i + 1} has an empty prompt.` });
          return;
        }
        if (['multiple_choice', 'dropdown', 'checkboxes'].includes(q.type)) {
          const filled = q.options.filter((o) => o.trim());
          if (filled.length < 2) {
            setFeedback({ type: 'error', text: `Question ${i + 1} must have at least 2 non-empty options.` });
            return;
          }
        }
        if (q.type === 'short_answer' && !q.shortAnswer.trim()) {
          setFeedback({ type: 'error', text: `Question ${i + 1} requires an expected short answer keyword.` });
          return;
        }
      }
    }

    const revisionAtSave = changeRevisionRef.current;
    const challengeDeadlineDate = new Date(challengeDeadline);
    isSavingRef.current = true;
    setSaving(true);
    if (auto) setRecoveryStatus('Syncing…');
    try {
      const payload = {
        draftId: activeDraftId,
        title: title.trim() || `Untitled ${isChallengeBuilder ? 'Challenge' : 'Quiz'}`,
        description: description.trim(),
        thumbnail: auto && coverImage.startsWith('data:image/') ? undefined : coverImage.trim(),
        category: category.trim() || 'General',
        difficulty,
        visibility: isChallengeBuilder
          ? challengeAccessType === 'public' ? 'public' : 'private'
          : visibility,
        isDraft,
        isChallenge: isChallengeBuilder,
        durationMinutes: isChallengeBuilder ? Number(challengeDuration) : timerMode === 'none' ? 0 : Number(timeLimit),
        deadlineAt: isChallengeBuilder && Number.isFinite(challengeDeadlineDate.getTime())
          ? challengeDeadlineDate.toISOString()
          : null,
        accessType: isChallengeBuilder ? challengeAccessType : 'public',
        inviteAccessType: isChallengeBuilder && challengeAccessType === 'invite_only'
          ? challengeInviteAccessType
          : null,
        challengeStatus: isChallengeBuilder && isDraft ? 'draft' : 'active',
        builderMode: isChallengeBuilder ? 'challenge' : 'quiz',
        contentKind: 'quiz',
        tags,
        settings: {
          timerMode: isChallengeBuilder ? 'strict' : timerMode,
          timeLimit: isChallengeBuilder ? Number(challengeDuration) : timerMode === 'none' ? 0 : Number(timeLimit),
          instantFeedback: isChallengeBuilder ? false : instantFeedback,
          allowReview: isChallengeBuilder ? false : allowReview,
          showExplanation,
          shuffleQuestions,
          shuffleOptions,
        },
        metadata: {
          createdFrom: isChallengeBuilder ? 'challenge_builder' : 'quiz_builder',
          scoreableItems: questions.length,
          draftOnlyItems: 0,
        },
        questions: questions.map((q, i) => {
          const qType = q.type || 'multiple_choice';
          let opts = [];
          let correctAnswer = null;

          if (qType === 'true_false') {
            opts = [
              { label: 'A', text: 'True', isCorrect: q.correctIndex === 0 },
              { label: 'B', text: 'False', isCorrect: q.correctIndex === 1 },
            ];
            correctAnswer = q.correctIndex === 0 ? 'A' : 'B';
          } else if (qType === 'checkboxes') {
            opts = q.options.map((opt, optIndex) => ({
              label: String.fromCharCode(65 + optIndex),
              text: opt.trim() || `Option ${optIndex + 1}`,
              isCorrect: Array.isArray(q.correctIndexes) ? q.correctIndexes.includes(optIndex) : false,
            }));
            correctAnswer = opts.filter((o) => o.isCorrect).map((o) => o.label);
          } else if (qType === 'short_answer') {
            opts = [];
            correctAnswer = q.shortAnswer ? q.shortAnswer.trim() : '';
          } else {
            // multiple_choice or dropdown
            opts = q.options.map((opt, optIndex) => ({
              label: String.fromCharCode(65 + optIndex),
              text: opt.trim() || `Option ${optIndex + 1}`,
              isCorrect: optIndex === q.correctIndex,
            }));
            correctAnswer = String.fromCharCode(65 + q.correctIndex);
          }

          return {
            questionNumber: i + 1,
            questionText: q.text.trim() || `Question ${i + 1}`,
            questionType: qType === 'true_false' ? 'multiple_choice' : qType,
            options: opts,
            correctAnswer,
            explanation: q.explanation ? q.explanation.trim() : '',
            difficulty: q.difficulty === 'Inherit' ? difficulty : q.difficulty,
            category: q.category || category,
            marks: Number(q.marks) || 1,
            negativeMarks: Number(q.negativeMarks) || 0,
            media: q.mediaUrl ? { type: 'image', url: q.mediaUrl.trim() } : undefined,
          };
        }),
      };

      const { data } = !auto && payload.thumbnail?.startsWith('data:image/')
        ? await (async () => {
          const imageFile = await fileFromDataUrl(payload.thumbnail, 'quiz-cover.webp');
          return runWithUploadPanel(imageFile, { purpose: 'Quiz cover and content' }, async (onUploadProgress) => {
            const asset = await MediaService.uploadImage(imageFile, 'quiz-cover', onUploadProgress);
            payload.thumbnail = asset.url;
            return api.post('/quiz/manual', payload);
          });
        })()
        : await api.post('/quiz/manual', payload);
      const createdQuizId = data.data?.quizId || data.data?.quiz?._id;

      if (isDraft) {
        if (createdQuizId) {
          setActiveDraftId(createdQuizId);
        }
        setLastSavedAt(new Date());
        hasUnsavedChangesRef.current = changeRevisionRef.current !== revisionAtSave;
        if (auto) {
          setRecoveryStatus('Synced');
        } else {
          setFeedback({
            type: 'success',
            text: activeDraftId
              ? `${isChallengeBuilder ? 'Challenge' : 'Quiz'} draft updated in place! (Ctrl+S)`
              : `${isChallengeBuilder ? 'Challenge' : 'Quiz'} draft saved to your workspace! (Ctrl+S)`,
          });
        }
      } else {
        recoveryDisabledRef.current = true;
        hasUnsavedChangesRef.current = false;
        if (recoveryUserId) {
          try {
            await deleteQuizBuilderCheckpoint(recoveryUserId);
          } catch (error) {
            setRecoveryStatus('Cleanup failed');
            setFeedback({ type: 'error', text: error.message || 'Quiz published, but its local recovery checkpoint could not be cleared.' });
          }
        }
        if (createdQuizId) {
          navigate(`/quiz/${createdQuizId}`);
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      if (auto) {
        setRecoveryStatus(
          !navigator.onLine || !err?.response
            ? 'Offline; saved locally'
            : 'Sync failed; saved locally'
        );
      } else {
        setFeedback({
          type: 'error',
          text: err?.response?.data?.message || `Failed to save ${isChallengeBuilder ? 'challenge' : 'quiz'}. Please verify all fields.`,
        });
      }
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  handleSaveRef.current = handleSave;

  return (
    <div className={`builder-viewport ${isChallengeBuilder ? 'challenge-builder' : ''}`}>
      {/* ── Sticky Top Bar ── */}
      <header className="top-header">
        <div className="header-left">
          <button className="nav-back-btn" onClick={() => navigate('/create')} title="Back to Create Hub">
            <ArrowLeft size={18} />
          </button>
          <div className="header-breadcrumbs">
            <span className="crumb-hub" onClick={() => navigate('/create')}>Create</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{isChallengeBuilder ? 'Challenge Builder' : 'Quiz Builder'}</span>
          </div>
        </div>

        <div className="header-stats-pill">
          <span className="stat-item">
            <strong>{questions.length}</strong> {questions.length === 1 ? 'Question' : 'Questions'}
          </span>
          <span className="stat-divider">•</span>
          <span className="stat-item">
            <strong>{totalMarks}</strong> {totalMarks === 1 ? 'Point' : 'Points'}
          </span>
          {activeDraftId && (
            <>
              <span className="stat-divider">•</span>
              <span className="header-draft-pill" title="This document is an unpublished draft">
                <Bookmark size={11} className="draft-pill-icon" />
                <span>Draft</span>
                {lastSavedAt && (
                  <span className="draft-saved-hint">
                    ({lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </span>
                )}
              </span>
            </>
          )}
        </div>
        <span className="recovery-status" role="status" title={recoveryStatus}>
          {recoveryStatus}
        </span>

        <div className="header-actions">
          {/* Main Settings Floating Trigger */}
          <button
            type="button"
            className={`floating-settings-trigger ${showFloatingSettings ? 'active' : ''}`}
            onClick={() => setShowFloatingSettings(!showFloatingSettings)}
          >
            <Settings size={16} className="settings-icon-spin" />
            <span>{isChallengeBuilder ? 'Challenge Settings' : 'Quiz Settings'}</span>
            <span className="settings-trigger-tag">
              {isChallengeBuilder
                ? `${challengeDuration}m`
                : timerMode === 'none' ? 'Untimed' : `${timeLimit}m`}
            </span>
          </button>

          <button
            type="button"
            className="draft-btn"
            onClick={() => handleSave(true)}
            disabled={saving}
            title="Save as draft (Ctrl+S)"
          >
            <Bookmark size={15} />
            <span>{activeDraftId ? 'Update Draft' : 'Save Draft'}</span>
          </button>

          <button
            type="button"
            className="publish-btn"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            {saving ? (
              <>
                <RefreshCw size={15} className="spinner" />
                <span>Publishing {isChallengeBuilder ? 'Challenge' : 'Quiz'}...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>Publish {isChallengeBuilder ? 'Challenge' : 'Quiz'}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Toast Feedback Notification ── */}
      {feedback && (
        <div className={`feedback-toast ${feedback.type}`}>
          {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="toast-close-btn">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Main Canvas Content ── */}
      <main className="canvas-container">
        {/* Quiz Cover Banner */}
        <div
          className={`cover-banner ${coverImage ? 'has-image' : 'empty'} ${isDraggingCover ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingCover(true); }}
          onDragLeave={() => setIsDraggingCover(false)}
          onDrop={handleCoverDrop}
        >
          {coverImage ? (
            <div className="cover-preview-wrapper">
              <img src={coverImage} alt="Quiz Cover Preview" className="cover-img-preview" />
              <div className="cover-overlay">
                <div className="cover-actions-bar">
                  {coverStats && (
                    <span className="cover-badge-size">
                      WebP {coverStats.compressedSize} KB
                    </span>
                  )}
                  <button
                    type="button"
                    className="cover-action-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} /> Change Cover
                  </button>
                  <button
                    type="button"
                    className="cover-action-btn danger"
                    onClick={() => { setCoverImage(''); setCoverStats(null); }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="cover-placeholder" onClick={() => fileInputRef.current?.click()}>
              <div className="cover-icon-circle">
                {coverUploading ? <RefreshCw size={24} className="spinner" /> : <ImageIcon size={24} />}
              </div>
              <div className="cover-text-group">
                <span className="cover-title-text">
                  {coverUploading ? 'Compressing & uploading image...' : 'Add a Cover Image for this Quiz'}
                </span>
                <span className="cover-sub-text">
                  Drag and drop an image here or click to browse. WebP, PNG, JPG supported.
                </span>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                processCoverFile(e.target.files[0]);
              }
            }}
          />
        </div>

        {/* Title & Description Editor Card */}
        <div className="meta-card">
          <div className="title-input-row">
            <input
              className="quiz-title-input"
              placeholder="Give your quiz a compelling title..."
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 70))}
              maxLength={70}
            />
            <span
              className={`meta-char-count ${title.length >= 65 ? 'limit-danger' : title.length >= 50 ? 'limit-warn' : ''}`}
              title={`${70 - title.length} characters remaining`}
            >
              {title.length}/70
            </span>
          </div>
          <textarea
            className="quiz-desc-textarea"
            placeholder="Add an optional description, instructions, or rules for students..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
          />

          <div className="meta-footer-pills">
            <div className="pill-item" onClick={() => { setShowFloatingSettings(true); setFloatingSettingsTab('general'); }}>
              <Layers size={13} />
              <span>Category: <strong>{category}</strong></span>
            </div>
            <div className="pill-item" onClick={() => { setShowFloatingSettings(true); setFloatingSettingsTab('general'); }}>
              <Zap size={13} />
              <span>Difficulty: <strong>{difficulty}</strong></span>
            </div>
            <div className="pill-item" onClick={() => { setShowFloatingSettings(true); setFloatingSettingsTab('general'); }}>
              {visibility === 'public' ? <Globe size={13} /> : <Lock size={13} />}
              <span>Visibility: <strong>{visibility}</strong></span>
            </div>
            <button
              type="button"
              className="pill-settings-link"
              onClick={() => setShowFloatingSettings(true)}
            >
              Configure All Settings →
            </button>
          </div>
        </div>

        {/* ── Questions List ── */}
        <div className="questions-stack">
          {questions.map((q, qIndex) => {
            const currentTypeObj = QUESTION_TYPES.find((t) => t.id === q.type) || QUESTION_TYPES[0];
            const TypeIcon = currentTypeObj.icon;

            return (
              <div key={q.id} className="question-card-shell">
                {/* Question Card Header */}
                <div className="q-card-header">
                  <div className="q-header-meta">
                    <span className="q-index-pill">Question {qIndex + 1}</span>
                    <span className="q-type-badge">
                      <TypeIcon size={13} /> {currentTypeObj.label}
                    </span>
                    <span className="q-points-badge">
                      +{q.marks || 1} {q.negativeMarks > 0 ? `(-${q.negativeMarks})` : ''} pts
                    </span>
                    {q.difficulty !== 'Inherit' && (
                      <span className="q-diff-badge">{q.difficulty}</span>
                    )}
                  </div>

                  <div className="q-header-tools">
                    {/* Card Tab Switcher */}
                    <div className="q-tab-switcher">
                      <button
                        type="button"
                        className={`q-tab-btn ${q.activeTab === 'content' ? 'active' : ''}`}
                        onClick={() => updateQuestionField(qIndex, 'activeTab', 'content')}
                      >
                        <FileText size={13} /> Editor
                      </button>
                      <button
                        type="button"
                        className={`q-tab-btn ${q.activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => updateQuestionField(qIndex, 'activeTab', 'settings')}
                      >
                        <Sliders size={13} /> Settings
                        {(q.explanation || q.negativeMarks > 0 || q.difficulty !== 'Inherit' || q.mediaUrl) && (
                          <span className="tab-indicator-dot" />
                        )}
                      </button>
                    </div>

                    <div className="q-tool-divider" />

                    {/* Reordering */}
                    <button
                      type="button"
                      className="q-tool-btn"
                      onClick={() => moveQuestion(qIndex, -1)}
                      disabled={qIndex === 0}
                      title="Move Up"
                    >
                      <MoveUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="q-tool-btn"
                      onClick={() => moveQuestion(qIndex, 1)}
                      disabled={qIndex === questions.length - 1}
                      title="Move Down"
                    >
                      <MoveDown size={15} />
                    </button>

                    {/* Duplicate */}
                    <button
                      type="button"
                      className="q-tool-btn"
                      onClick={() => duplicateQuestion(qIndex)}
                      disabled={isChallengeBuilder && questions.length >= 10}
                      title="Duplicate Question"
                    >
                      <Copy size={15} />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      className="q-tool-btn danger"
                      onClick={() => deleteQuestion(qIndex)}
                      disabled={questions.length <= 1}
                      title={questions.length <= 1 ? 'Cannot delete the only question' : 'Delete Question'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Question Card Body */}
                <div className="q-card-body">
                  {q.activeTab === 'content' ? (
                    /* ── TAB 1: CONTENT & OPTIONS ── */
                    <div className="q-content-panel">
                      {/* Question Media Banner (if attached) */}
                      {q.mediaUrl && (
                        <div className="q-media-preview-row">
                          <img src={q.mediaUrl} alt="Question Media" className="q-media-img" />
                          <button
                            type="button"
                            className="q-media-remove-btn"
                            onClick={() => updateQuestionField(qIndex, 'mediaUrl', '')}
                            title="Remove Media"
                          >
                            <X size={14} /> Remove Image
                          </button>
                        </div>
                      )}

                      <textarea
                        className="q-prompt-textarea"
                        placeholder={`Enter question ${qIndex + 1} text or prompt here...`}
                        value={q.text}
                        onChange={(e) => updateQuestionField(qIndex, 'text', e.target.value)}
                        rows={2}
                      />

                      {/* Options or Answer Input according to Type */}
                      {q.type === 'short_answer' ? (
                        <div className="short-answer-box">
                          <label className="short-answer-label">Expected Correct Answer / Keyword:</label>
                          <input
                            type="text"
                            className="short-answer-input"
                            placeholder="Enter the exact answer string that students must type..."
                            value={q.shortAnswer}
                            onChange={(e) => updateQuestionField(qIndex, 'shortAnswer', e.target.value)}
                          />
                          <p className="short-answer-hint">
                            Participant answers will be compared case-insensitively against this keyword.
                          </p>
                        </div>
                      ) : q.type === 'true_false' ? (
                        <div className="tf-options-grid">
                          {['True', 'False'].map((label, optIdx) => {
                            const isSelected = q.correctIndex === optIdx;
                            return (
                              <button
                                key={label}
                                type="button"
                                className={`tf-pill-btn ${isSelected ? 'selected' : ''}`}
                                onClick={() => updateQuestionField(qIndex, 'correctIndex', optIdx)}
                              >
                                <span className="tf-indicator">
                                  {isSelected && <Check size={16} strokeWidth={3} />}
                                </span>
                                <span className="tf-text">{label}</span>
                                {isSelected && <span className="tf-correct-tag">Correct Answer</span>}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        /* Multiple Choice, Checkboxes, Dropdown */
                        <div className="options-stack">
                          <div className="options-legend-row">
                            <span className="legend-text">
                              {q.type === 'checkboxes'
                                ? 'Check the boxes next to all correct answers:'
                                : 'Select the circle next to the single correct answer:'}
                            </span>
                            <span className="legend-hint">
                              Letters (A, B, C...) are assigned automatically.
                            </span>
                          </div>

                          {q.options.map((opt, oIndex) => {
                            const letter = String.fromCharCode(65 + oIndex);
                            const isCorrect =
                              q.type === 'checkboxes'
                                ? q.correctIndexes.includes(oIndex)
                                : q.correctIndex === oIndex;

                            return (
                              <div key={oIndex} className={`option-item-row ${isCorrect ? 'is-correct' : ''}`}>
                                <button
                                  type="button"
                                  className={`option-check-btn ${q.type === 'checkboxes' ? 'is-checkbox' : 'is-radio'} ${isCorrect ? 'checked' : ''}`}
                                  onClick={() => toggleOptionCorrect(qIndex, oIndex)}
                                  title={`Mark option ${letter} as ${isCorrect ? 'incorrect' : 'correct'}`}
                                >
                                  {isCorrect && <Check size={14} strokeWidth={3} />}
                                </button>

                                <span className="option-letter-badge">{letter}</span>

                                <input
                                  type="text"
                                  className="option-text-input"
                                  placeholder={`Option ${letter} text...`}
                                  value={opt}
                                  onChange={(e) => updateOptionText(qIndex, oIndex, e.target.value)}
                                />

                                {q.options.length > 2 && (
                                  <button
                                    type="button"
                                    className="option-delete-btn"
                                    onClick={() => removeOptionFromQuestion(qIndex, oIndex)}
                                    title="Delete Option"
                                  >
                                    <X size={15} />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            className="add-option-btn"
                            onClick={() => addOptionToQuestion(qIndex)}
                          >
                            <Plus size={15} /> Add Another Option
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── TAB 2: QUESTION SETTINGS ── */
                    <div className="q-settings-panel">
                      <div className="q-settings-section-title">
                        <Sliders size={15} />
                        <span>Question Specific Settings & Evaluation</span>
                      </div>

                      <div className="q-settings-grid">
                        {/* Question Type */}
                        <div className="setting-field">
                          <label>Question Type</label>
                          <select
                            value={q.type}
                            onChange={(e) => setQuestionType(qIndex, e.target.value)}
                          >
                            {QUESTION_TYPES.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} ({t.desc})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Marks */}
                        <div className="setting-field">
                          <label>Points / Marks Awarded</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={q.marks}
                            onChange={(e) => updateQuestionField(qIndex, 'marks', Math.max(0, parseFloat(e.target.value) || 0))}
                          />
                        </div>

                        {/* Negative Marks */}
                        <div className="setting-field">
                          <label>Negative Penalty Marks</label>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            step="0.25"
                            value={q.negativeMarks}
                            onChange={(e) => updateQuestionField(qIndex, 'negativeMarks', Math.max(0, parseFloat(e.target.value) || 0))}
                          />
                        </div>

                        {/* Difficulty Override */}
                        <div className="setting-field">
                          <label>Difficulty Override</label>
                          <select
                            value={q.difficulty}
                            onChange={(e) => updateQuestionField(qIndex, 'difficulty', e.target.value)}
                          >
                            <option value="Inherit">Inherit from Quiz ({difficulty})</option>
                            <option value="Beginner">Beginner</option>
                            <option value="Intermediate">Intermediate</option>
                            <option value="Advanced">Advanced</option>
                          </select>
                        </div>

                        {/* Topic Tag */}
                        <div className="setting-field full-width">
                          <label>Topic / Sub-Category (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Thermodynamics, Linear Algebra, Grammar"
                            value={q.category}
                            onChange={(e) => updateQuestionField(qIndex, 'category', e.target.value)}
                          />
                        </div>

                        {/* Question Media URL */}
                        <div className="setting-field full-width">
                          <label>Question Image / Diagram URL (Optional)</label>
                          <div className="media-url-input-group">
                            <input
                              type="url"
                              placeholder="https://example.com/diagram.png"
                              value={q.mediaUrl}
                              onChange={(e) => updateQuestionField(qIndex, 'mediaUrl', e.target.value)}
                              onBlur={(e) => validateRemoteImageUrl(e.target.value)}
                            />
                            {q.mediaUrl && (
                              <button
                                type="button"
                                className="media-preview-pill"
                                onClick={() => window.open(q.mediaUrl, '_blank')}
                                title="Open in new tab"
                              >
                                <ExternalLink size={13} /> View
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Explanation */}
                        <div className="setting-field full-width">
                          <label>Explanation & Solution Steps (Revealed in reviews / after submission)</label>
                          <textarea
                            rows={3}
                            placeholder="Explain why the correct answer is right, provide formulas, derivation steps, or references..."
                            value={q.explanation}
                            onChange={(e) => updateQuestionField(qIndex, 'explanation', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="q-settings-footer-actions">
                        <button
                          type="button"
                          className="q-done-settings-btn"
                          onClick={() => updateQuestionField(qIndex, 'activeTab', 'content')}
                        >
                          <Check size={14} /> Done Configuring Question
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Bottom Add Question Bar ── */}
        <div className="bottom-add-bar">
          <button
            type="button"
            className="add-main-btn"
            onClick={() => addQuestion('multiple_choice')}
            disabled={isChallengeBuilder && questions.length >= 10}
          >
            <Plus size={18} />
            <span>Add Question</span>
            <span className="btn-shortcut-hint">Ctrl + Enter</span>
          </button>

          <div className="quick-type-presets">
            <span className="preset-label">Quick Add:</span>
            <button
              type="button"
              className="preset-btn"
              onClick={() => addQuestion('checkboxes')}
              disabled={isChallengeBuilder && questions.length >= 10}
            >
              + Multi-Select
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => addQuestion('true_false')}
              disabled={isChallengeBuilder && questions.length >= 10}
            >
              + True/False
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => addQuestion('short_answer')}
              disabled={isChallengeBuilder && questions.length >= 10}
            >
              + Short Answer
            </button>
          </div>
        </div>
      </main>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── MAIN SETTINGS FLOATING WINDOW / MODAL ── */}
      {/* ────────────────────────────────────────────────────────── */}
      {showFloatingSettings && (
        <div className="floating-settings-backdrop" onClick={() => setShowFloatingSettings(false)}>
          <div
            className="floating-settings-window"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Window Titlebar */}
            <div className="window-header">
              <div className="window-title-group">
                <div className="window-icon-badge">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="window-title">
                    {isChallengeBuilder ? 'Challenge Settings & Rules' : 'Quiz Settings & Governance'}
                  </h3>
                  <p className="window-subtitle">
                    {isChallengeBuilder
                      ? 'Set the challenge schedule, access, and question delivery.'
                      : 'Configure delivery, timer rules, visibility, and cover media.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="window-close-btn"
                onClick={() => setShowFloatingSettings(false)}
                title="Close (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Window Navigation Tabs */}
            <div className="window-tabs-bar">
              <button
                type="button"
                className={`window-tab ${floatingSettingsTab === 'general' ? 'active' : ''}`}
                onClick={() => setFloatingSettingsTab('general')}
              >
                <ImageIcon size={15} /> General & Cover
              </button>
              <button
                type="button"
                className={`window-tab ${floatingSettingsTab === 'timer' ? 'active' : ''}`}
                onClick={() => setFloatingSettingsTab('timer')}
              >
                <Clock size={15} /> {isChallengeBuilder ? 'Rules & Delivery' : 'Timer & Delivery'}
              </button>
            </div>

            {/* Window Tab Content */}
            <div className="window-body">
              {floatingSettingsTab === 'general' && (
                <div className="tab-pane">
                  {/* Cover Upload inside Window */}
                  <div className="pane-section">
                    <h4 className="section-title">{isChallengeBuilder ? 'Challenge' : 'Quiz'} Cover Artwork</h4>
                    <div className="cover-dialog-grid">
                      <div className="cover-drop-mini" onClick={() => fileInputRef.current?.click()}>
                        {coverImage ? (
                          <img src={coverImage} alt="Cover Preview" className="mini-cover-thumb" />
                        ) : (
                          <div className="mini-cover-empty">
                            <Upload size={20} />
                            <span>Click to upload image</span>
                          </div>
                        )}
                      </div>
                      <div className="cover-controls-column">
                        <label className="field-label">Or paste image URL:</label>
                        <div className="input-with-action">
                          <input
                            type="url"
                            placeholder="https://images.unsplash.com/photo-..."
                            value={customCoverUrl}
                            onChange={(e) => setCustomCoverUrl(e.target.value)}
                          />
                          <button
                            type="button"
                            className="apply-url-btn"
                            onClick={applyCustomCoverUrl}
                          >
                            Set URL
                          </button>
                        </div>
                        {coverImage && (
                          <button
                            type="button"
                            className="clear-cover-btn"
                            onClick={() => { setCoverImage(''); setCoverStats(null); }}
                          >
                            <Trash2 size={13} /> Remove current cover
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="settings-two-col">
                    <div className="setting-field">
                      <label>Category</label>
                      <select value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="setting-field">
                      <label>Default Difficulty</label>
                      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                        {DIFFICULTIES.map((diff) => (
                          <option key={diff} value={diff}>{diff}</option>
                        ))}
                      </select>
                    </div>

                    {isChallengeBuilder && (
                      <>
                        <div className="setting-field">
                          <label>Challenge Duration (Minutes)</label>
                          <input
                            type="number"
                            min="1"
                            max="240"
                            value={challengeDuration}
                            onChange={(event) => setChallengeDuration(Number(event.target.value))}
                          />
                        </div>
                        <div className="setting-field">
                          <label>Challenge Deadline</label>
                          <input
                            type="datetime-local"
                            value={challengeDeadline}
                            onChange={(event) => setChallengeDeadline(event.target.value)}
                          />
                        </div>
                        <div className="setting-field full-width">
                          <label>Access</label>
                          <select
                            value={challengeAccessType}
                            onChange={(event) => setChallengeAccessType(event.target.value)}
                          >
                            <option value="public">Public challenge</option>
                            <option value="invite_only">Invite only</option>
                          </select>
                        </div>
                        {challengeAccessType === 'invite_only' && (
                          <div className="setting-field full-width">
                            <label>Invite Policy</label>
                            <select
                              value={challengeInviteAccessType}
                              onChange={(event) => setChallengeInviteAccessType(event.target.value)}
                            >
                              <option value="invitation">Invitation required</option>
                              <option value="approval">Request approval</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}

                    {!isChallengeBuilder && <div className="setting-field full-width">
                      <label>Visibility</label>
                      <div className="visibility-options-grid">
                        {[
                          { id: 'public', label: 'Public', desc: 'Visible on Explore & Search', icon: Globe },
                          { id: 'unlisted', label: 'Unlisted', desc: 'Accessible only via direct link', icon: LinkIcon },
                          { id: 'private', label: 'Private', desc: 'Only you can view and attempt', icon: Lock },
                        ].map((v) => {
                          const VIcon = v.icon;
                          const isSel = visibility === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              className={`vis-card-btn ${isSel ? 'selected' : ''}`}
                              onClick={() => setVisibility(v.id)}
                            >
                              <VIcon size={16} />
                              <div className="vis-card-info">
                                <span className="vis-card-name">{v.label}</span>
                                <span className="vis-card-desc">{v.desc}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>}

                    {/* Tags input */}
                    <div className="setting-field full-width">
                      <label>{isChallengeBuilder ? 'Challenge' : 'Quiz'} Search Tags ({tags.length}/8)</label>
                      <div className="tags-container">
                        <div className="tags-list">
                          {tags.map((tag) => (
                            <span key={tag} className="tag-chip">
                              <Tag size={11} />
                              <span>{tag}</span>
                              <button type="button" onClick={() => removeTag(tag)}>
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="add-tag-row">
                          <input
                            type="text"
                            placeholder="Add a tag and press Enter..."
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTag();
                              }
                            }}
                          />
                          <button type="button" className="btn-add-tag" onClick={addTag}>
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {floatingSettingsTab === 'timer' && (
                <div className="tab-pane">
                  <div className="pane-section">
                    <h4 className="section-title">{isChallengeBuilder ? 'Challenge Timer' : 'Timer Rules'}</h4>
                    {isChallengeBuilder ? (
                      <p className="window-subtitle">
                        Challenges use a strict {challengeDuration}-minute timer. Change the duration in General &amp; Cover.
                      </p>
                    ) : <div className="timer-mode-selector">
                      {[
                        { id: 'none', label: 'Untimed', desc: 'No time pressure. Practice at your own pace.' },
                        { id: 'soft', label: 'Soft Timer', desc: 'Shows elapsed time & gives warning when time expires.' },
                        { id: 'strict', label: 'Strict Timer', desc: 'Auto-submits instantly when time reaches 00:00.' },
                      ].map((tm) => (
                        <button
                          key={tm.id}
                          type="button"
                          className={`timer-choice-card ${timerMode === tm.id ? 'active' : ''}`}
                          onClick={() => setTimerMode(tm.id)}
                        >
                          <div className="timer-radio-circle">
                            {timerMode === tm.id && <div className="inner-dot" />}
                          </div>
                          <div>
                            <div className="timer-mode-title">{tm.label}</div>
                            <div className="timer-mode-desc">{tm.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>}

                    {!isChallengeBuilder && timerMode !== 'none' && (
                      <div className="time-limit-box">
                        <label className="field-label">Time Limit (Minutes):</label>
                        <div className="time-slider-row">
                          <input
                            type="range"
                            min="1"
                            max="180"
                            step="1"
                            value={timeLimit}
                            onChange={(e) => setTimeLimit(Number(e.target.value))}
                            className="time-range-slider"
                          />
                          <div className="time-number-badge">
                            <strong>{timeLimit}</strong> mins
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pane-section">
                    <h4 className="section-title">Delivery & Shuffling Experience</h4>
                    <div className="toggles-list">
                      {!isChallengeBuilder && <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={instantFeedback}
                          onChange={(e) => setInstantFeedback(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Instant Answer Feedback</span>
                          <span className="toggle-desc">Reveal whether the selected answer is correct right after clicking.</span>
                        </div>
                      </label>}

                      {!isChallengeBuilder && <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={allowReview}
                          onChange={(e) => setAllowReview(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Allow Revisiting Questions</span>
                          <span className="toggle-desc">Students can navigate back and change previous answers before submission.</span>
                        </div>
                      </label>}

                      <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={showExplanation}
                          onChange={(e) => setShowExplanation(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Show Explanations</span>
                          <span className="toggle-desc">Display solution notes and explanations upon quiz completion.</span>
                        </div>
                      </label>

                      <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={shuffleQuestions}
                          onChange={(e) => setShuffleQuestions(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Randomize Question Order</span>
                          <span className="toggle-desc">Shuffle questions for each participant to prevent cheating.</span>
                        </div>
                      </label>

                      <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={shuffleOptions}
                          onChange={(e) => setShuffleOptions(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Randomize Options Order</span>
                          <span className="toggle-desc">Shuffle A, B, C, D choices randomly for every question.</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Window Footer Actions */}
            <div className="window-footer">
              <span className="footer-summary-text">
                {questions.length} questions • {totalMarks} total points • {difficulty} • {visibility}
              </span>
              <button
                type="button"
                className="window-done-btn"
                onClick={() => setShowFloatingSettings(false)}
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
