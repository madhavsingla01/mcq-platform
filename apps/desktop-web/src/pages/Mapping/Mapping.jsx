import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Table,
  SlidersHorizontal,
  ChevronDown,
  RefreshCw,
  Copy,
  ArrowRight,
  Settings,
  Sliders,
  Image as ImageIcon,
  Clock,
  Upload,
  X,
  Trash2,
  Tag,
  Globe,
  Lock,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, Button, Badge } from '../../components/ui';
import { useUploadStore } from '../../store/uploadStore';
import api from '../../api/axios';
import { compressImage } from '../../utils/imageCompressor';
import { fileFromDataUrl } from '../../store/uploadPanelStore';
import { MediaService } from '../../services/media.service';
import './Mapping.css';

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

export default function Mapping() {
  const { uploadId } = useParams();
  const navigate = useNavigate();
  const { parsedData, autoMapping, confidence, setColumnMapping } = useUploadStore();
  const [mapping, setMapping] = useState({
    question: '',
    options: [],
    answer: '',
    explanation: '',
    serial: '',
    media: '',
    topic: '',
    difficulty: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState(null);
  const [generatedQuizId, setGeneratedQuizId] = useState(null);
  const [duplicateModal, setDuplicateModal] = useState(null);

  // â”€â”€ Quiz Settings & Governance Modal State â”€â”€
  const [showFloatingSettings, setShowFloatingSettings] = useState(false);
  const [floatingSettingsTab, setFloatingSettingsTab] = useState('general'); // 'general' | 'timer'

  // General & Cover Settings
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [difficulty, setDifficulty] = useState('All Levels');
  const [visibility, setVisibility] = useState('public');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Timer & Delivery Settings
  const [timerMode, setTimerMode] = useState('none'); // 'none' | 'soft' | 'strict'
  const [timeLimit, setTimeLimit] = useState(15);
  const [instantFeedback, setInstantFeedback] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);

  useEffect(() => {
    if (!parsedData) {
      // If store is empty (page refresh), fetch preview data
      api.get(`/parser/preview/${uploadId}`).then((res) => {
        const data = res.data.data;
        useUploadStore.getState().setParsedData({
          headers: data.headers,
          rowCount: data.rowCount,
          preview: data.preview,
          originalName: data.originalName,
        });
        if (data.originalName && !quizTitle) {
          const clean = data.originalName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          setQuizTitle(clean);
        }
        if (data.autoMapping) {
          useUploadStore.getState().setAutoMapping(data.autoMapping, data.confidence);
          setMapping(data.autoMapping);
        }
      }).catch(() => {
        setError('Failed to load mapping data');
      });
    } else {
      if (autoMapping) {
        setMapping({
          question: autoMapping.question || '',
          options: autoMapping.options || [],
          answer: autoMapping.answer || '',
          explanation: autoMapping.explanation || '',
          serial: autoMapping.serial || '',
          media: autoMapping.media || '',
          topic: autoMapping.topic || '',
          difficulty: autoMapping.difficulty || '',
        });
      }
      const file = useUploadStore.getState().file;
      if (file?.name && !quizTitle) {
        const clean = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setQuizTitle(clean);
      }
    }
  }, [uploadId, parsedData, autoMapping, quizTitle]);

  // Escape key to close settings modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showFloatingSettings) {
        setShowFloatingSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFloatingSettings]);

  const handleOptionToggle = (header) => {
    setMapping((prev) => {
      const isSelected = prev.options.includes(header);
      return {
        ...prev,
        options: isSelected
          ? prev.options.filter((o) => o !== header)
          : [...prev.options, header],
      };
    });
  };

  const processCoverFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (PNG, JPG, WebP).');
      return;
    }
    setCoverUploading(true);
    try {
      const result = await compressImage(file, { maxWidth: 1280, maxHeight: 720, quality: 0.85 });
      const reader = new FileReader();
      reader.onload = (e) => {
        setCoverImage(e.target.result);
        setCoverUploading(false);
        toast.success(`Cover optimized & set! (${Math.round(result.compressedSize / 1024)} KB)`);
      };
      reader.readAsDataURL(result.file);
    } catch {
      setCoverUploading(false);
      toast.error('Failed to process image. You can paste an image URL instead.');
    }
  };

  const validateRemoteImageUrl = async (value) => {
    if (!value?.trim() || value.trim().startsWith('data:image/')) return true;
    try {
      await MediaService.validateImageUrl(value.trim());
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Use a public HTTPS URL for a supported image.');
      return false;
    }
  };

  const applyCustomCoverUrl = async () => {
    if (!customCoverUrl.trim()) return;
    if (!(await validateRemoteImageUrl(customCoverUrl))) return;
    setCoverImage(customCoverUrl.trim());
    setCustomCoverUrl('');
    toast.success('Cover image URL set successfully.');
  };

  const addTag = () => {
    const raw = tagInput.trim().replace(/^#+/, '');
    if (!raw) return;
    if (tags.length >= 8) {
      toast.error('Maximum of 8 tags allowed per quiz.');
      return;
    }
    if (tags.some((t) => t.toLowerCase() === raw.toLowerCase())) {
      setTagInput('');
      return;
    }
    setTags([...tags, raw.toLowerCase()]);
    setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleConfirm = async ({ forceGenerate = false } = {}) => {
    if (!mapping.question) return setError('Question column is required');
    if (mapping.options.length < 2) return setError('At least 2 option columns are required');

    setError('');
    setIsSubmitting(true);
    setDuplicateModal(null);

    try {
      await api.post(`/parser/map/${uploadId}`, mapping);
      setColumnMapping(mapping);

      // Handle cover image upload to media service if it is a data URL
      let finalThumbnail = coverImage || undefined;
      if (coverImage && coverImage.startsWith('data:image/')) {
        try {
          const imageFile = await fileFromDataUrl(coverImage, 'quiz-cover.webp');
          const asset = await MediaService.uploadImage(imageFile, 'quiz-cover');
          finalThumbnail = asset?.url || coverImage;
        } catch (uploadErr) {
          console.warn('Cover upload to media-service failed; using data URL directly', uploadErr);
          finalThumbnail = coverImage;
        }
      }

      // Generate Quiz with customized rules & full settings
      const genRes = await api.post('/quiz/generate', {
        uploadId,
        forceGenerate,
        title: quizTitle.trim() || undefined,
        description: quizDescription.trim() || undefined,
        category,
        difficulty,
        visibility,
        thumbnail: finalThumbnail,
        tags,
        settings: {
          timerMode,
          timeLimit: timerMode === 'none' ? 0 : Math.max(Number(timeLimit) || 0, 1),
          instantFeedback,
          allowReview,
          showExplanation,
          shuffleQuestions,
          shuffleOptions,
        },
      });

      const resData = genRes.data?.data || genRes.data;
      const isDuplicate = genRes.data?.isDuplicate || resData?.isDuplicate;
      const existingQuizId = genRes.data?.existingQuizId || resData?.existingQuizId;
      const quiz = resData?.quiz || genRes.data?.quiz;
      const errors = resData?.errors || genRes.data?.errors;

      if (isDuplicate && existingQuizId) {
        setDuplicateModal({
          quizId: existingQuizId,
          title: quiz?.title || 'Existing Quiz',
          questionCount: quiz?.questionCount,
        });
        setIsSubmitting(false);
        return;
      }

      if (errors && errors.length > 0) {
        setValidationErrors(errors);
        setGeneratedQuizId(quiz._id);
        setIsSubmitting(false);
      } else {
        toast.success('Quiz generated successfully with your customized settings!');
        navigate(`/quiz/${quiz._id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save mapping');
      setIsSubmitting(false);
    }
  };

  const handleProceedWithErrors = () => {
    navigate(`/quiz/${generatedQuizId}`);
  };

  if (!parsedData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
        Loading mapping data...
      </div>
    );
  }

  return (
    <>
      <div className="qf-mapping-shell">
        {/* Duplicate Quiz Detected Modal Overlay */}
        {duplicateModal && (
          <div className="qf-mapping-overlay">
            <Card style={{ width: 540, maxWidth: '90vw', padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'rgba(255, 69, 0, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Copy size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                    Duplicate Quiz Detected
                  </h3>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    SHA-256 fingerprint matched an existing quiz
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
                A quiz generated from an identical file already exists: <strong style={{ color: 'var(--color-text)' }}>"{duplicateModal.title}"</strong> ({duplicateModal.questionCount || 'â€”'} questions).
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button
                  size="lg"
                  variant="primary"
                  onClick={() => navigate(`/quiz/${duplicateModal.quizId}`)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <span>Go to Existing Quiz</span>
                  <ArrowRight size={16} style={{ marginLeft: 6 }} />
                </Button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button
                    variant="outline"
                    onClick={() => handleConfirm({ forceGenerate: true })}
                    style={{ flex: 1, justifyContent: 'center' }}
                    disabled={isSubmitting}
                  >
                    Generate New Copy Anyway
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setDuplicateModal(null)}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Validation Errors Modal overlay */}
        {validationErrors && (
          <div className="qf-mapping-overlay">
            <Card style={{ width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <AlertTriangle size={22} style={{ color: 'var(--color-warning)' }} />
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>Parser Validation Issues</h3>
              </div>
              <p style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 14 }}>
                The quiz was generated, but {validationErrors.length} rows were skipped due to formatting errors.
              </p>
              <div className="qf-mapping-errors-list">
                {validationErrors.map((err, i) => (
                  <div key={i} className="qf-mapping-error-row">
                    <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Row {err.row}:</span> {err.error}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                <Button onClick={() => setValidationErrors(null)} variant="secondary">Go Back</Button>
                <Button onClick={handleProceedWithErrors}>Proceed to Quiz Anyway</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Left: Preview Table */}
        <Card className="qf-mapping-preview">
          <h2 style={{ fontSize: 18, marginBottom: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Table size={18} style={{ color: 'var(--color-primary)' }} />
            Data Preview
          </h2>
          <div className="qf-mapping-table-wrap">
            <table className="qf-mapping-table">
              <thead>
                <tr>
                  {parsedData.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.preview.map((row, i) => (
                  <tr key={i}>
                    {parsedData.headers.map((h) => (
                      <td key={h}>{String(row[h] || '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right: Mapping Controls */}
        <Card className="qf-mapping-controls">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--color-text)' }}>
              <SlidersHorizontal size={18} style={{ color: 'var(--color-primary)' }} />
              Column Mapping
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="qf-top-settings-btn"
                onClick={() => setShowFloatingSettings(true)}
                title="Open Quiz Settings & Rules"
              >
                <Settings size={14} className="qf-spin-icon" />
                <span>Quiz Settings</span>
              </button>
              {confidence !== null && (
                <Badge variant={confidence > 80 ? 'success' : confidence > 50 ? 'warning' : 'danger'}>
                  AI Confidence: {confidence}%
                </Badge>
              )}
            </div>
          </div>

          {error && (
            <div style={{ color: 'var(--color-danger)', marginBottom: 16, fontSize: 14, padding: '10px 14px', background: 'var(--color-danger-light)', borderRadius: 10 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SelectField
              label="Question Text *"
              value={mapping.question}
              onChange={(v) => setMapping({ ...mapping, question: v })}
              options={parsedData.headers}
            />

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Options * (Select at least 2)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {parsedData.headers.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleOptionToggle(h)}
                    className={`qf-mapping-chip ${mapping.options.includes(h) ? 'active' : ''}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <SelectField label="Correct Answer" value={mapping.answer} onChange={(v) => setMapping({ ...mapping, answer: v })} options={parsedData.headers} />
            <SelectField label="Explanation" value={mapping.explanation} onChange={(v) => setMapping({ ...mapping, explanation: v })} options={parsedData.headers} />
            <SelectField label="Topic / Tags" value={mapping.topic} onChange={(v) => setMapping({ ...mapping, topic: v })} options={parsedData.headers} />
            <SelectField label="Difficulty" value={mapping.difficulty} onChange={(v) => setMapping({ ...mapping, difficulty: v })} options={parsedData.headers} />

            {/* â”€â”€ High-Craft Settings Banner Trigger (Replaces old cramped accordion) â”€â”€ */}
            <div className="qf-mapping-settings-banner">
              <div className="qf-settings-banner-left">
                <div className="qf-settings-icon-badge">
                  <Sliders size={18} />
                </div>
                <div className="qf-settings-banner-info">
                  <div className="qf-settings-banner-title-row">
                    <h3 className="qf-settings-banner-title">Quiz Settings & Governance</h3>
                    <span className="qf-settings-chip-mini">
                      {timerMode === 'none' ? 'Untimed' : `${timeLimit}m`}
                    </span>
                  </div>
                  <p className="qf-settings-banner-summary">
                    {visibility.charAt(0).toUpperCase() + visibility.slice(1)} â€¢ {difficulty} â€¢ {category}
                    {instantFeedback ? ' â€¢ Instant Feedback' : ''}
                    {shuffleQuestions ? ' â€¢ Shuffled' : ''}
                    {coverImage ? ' â€¢ Cover set' : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="qf-open-settings-btn"
                onClick={() => setShowFloatingSettings(true)}
              >
                <Settings size={14} className="qf-spin-icon" />
                <span>Configure Settings</span>
              </button>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <Button onClick={handleConfirm} disabled={isSubmitting} style={{ width: '100%', height: 46 }}>
                {isSubmitting ? 'Generating Quiz...' : 'Looks Good, Generate Quiz!'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* â”€â”€ MAIN SETTINGS FLOATING WINDOW / MODAL â”€â”€ */}
      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  <h3 className="window-title">Quiz Settings & Governance</h3>
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
                <Clock size={15} /> Timer & Delivery
              </button>
            </div>

            {/* Hidden File Input for Cover Upload */}
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

            {/* Window Tab Content */}
            <div className="window-body">
              {floatingSettingsTab === 'general' && (
                <div className="tab-pane">
                  {/* Title & Description Settings */}
                  <div className="pane-section">
                    <h4 className="section-title">Quiz Title & Description</h4>
                    <div className="settings-field-group">
                      <div className="setting-field full-width">
                        <label className="field-label">Title</label>
                        <input
                          type="text"
                          className="modal-text-input"
                          placeholder="Give your quiz a compelling title..."
                          value={quizTitle}
                          onChange={(e) => setQuizTitle(e.target.value.slice(0, 70))}
                          maxLength={70}
                        />
                      </div>
                      <div className="setting-field full-width" style={{ marginTop: 10 }}>
                        <label className="field-label">Description (Optional)</label>
                        <textarea
                          className="modal-textarea"
                          placeholder="Add instructions, context, or topic notes for students..."
                          value={quizDescription}
                          onChange={(e) => setQuizDescription(e.target.value.slice(0, 500))}
                          rows={2}
                          maxLength={500}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Cover Upload inside Window */}
                  <div className="pane-section">
                    <h4 className="section-title">Quiz Cover Artwork</h4>
                    <div className="cover-dialog-grid">
                      <div className="cover-drop-mini" onClick={() => fileInputRef.current?.click()}>
                        {coverImage ? (
                          <img src={coverImage} alt="Cover Preview" className="mini-cover-thumb" />
                        ) : (
                          <div className="mini-cover-empty">
                            {coverUploading ? <RefreshCw size={20} className="spinner" /> : <Upload size={20} />}
                            <span>{coverUploading ? 'Uploading...' : 'Click to upload image'}</span>
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
                            onClick={() => setCoverImage('')}
                          >
                            <Trash2 size={13} /> Remove current cover
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Category & Difficulty */}
                  <div className="settings-two-col">
                    <div className="setting-field">
                      <label className="field-label">Category</label>
                      <select className="modal-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="setting-field">
                      <label className="field-label">Default Difficulty</label>
                      <select className="modal-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                        {DIFFICULTIES.map((diff) => (
                          <option key={diff} value={diff}>{diff}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Visibility Section */}
                  <div className="setting-field full-width">
                    <label className="field-label">Visibility</label>
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
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tags input */}
                  <div className="setting-field full-width">
                    <label className="field-label">Quiz Search Tags ({tags.length}/8)</label>
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
              )}

              {floatingSettingsTab === 'timer' && (
                <div className="tab-pane">
                  <div className="pane-section">
                    <h4 className="section-title">Timer Rules</h4>
                    <div className="timer-mode-selector">
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
                          </div>
                        </button>
                      ))}
                    </div>

                    {timerMode !== 'none' && (
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
                      <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={instantFeedback}
                          onChange={(e) => setInstantFeedback(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Instant Answer Feedback</span>
                        </div>
                      </label>

                      <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={allowReview}
                          onChange={(e) => setAllowReview(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Allow Revisiting Questions</span>
                        </div>
                      </label>

                      <label className="toggle-switch-card">
                        <input
                          type="checkbox"
                          checked={showExplanation}
                          onChange={(e) => setShowExplanation(e.target.checked)}
                        />
                        <div className="toggle-info">
                          <span className="toggle-title">Show Explanations</span>
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
                {parsedData?.rowCount || 0} questions â€¢ {difficulty} â€¢ {visibility} â€¢ {timerMode === 'none' ? 'Untimed' : `${timeLimit}m`}
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
    </>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="qf-mapping-select"
      >
        <option value="">None (Column not present)</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
