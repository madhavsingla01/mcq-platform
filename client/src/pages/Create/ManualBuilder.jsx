import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Code2,
  FileUp,
  LayoutTemplate,
  Plus,
  Save,
  Send,
  Star,
  UploadCloud,
} from 'lucide-react';
import { Button } from '../../components/ui';
import QuestionEditor, { TYPE_LABELS, makeQuestionDefaults } from './QuestionEditor';
import api from '../../api/axios';

const OBJECTIVE_TYPES = ['multiple_choice', 'checkboxes', 'dropdown'];
const PUBLISHABLE_QUIZ_TYPES = ['multiple_choice', 'dropdown'];

const BUILDER_MODES = [
  {
    id: 'universal',
    kind: 'universal',
    label: 'Universal',
    short: 'All blocks',
    icon: LayoutTemplate,
    accent: '#4f46e5',
    defaultTitle: 'Untitled universal workspace',
    defaultType: 'multiple_choice',
    recommendedTypes: ['multiple_choice', 'short_answer', 'coding_link', 'file_upload', 'rating', 'paragraph'],
    starter: ['multiple_choice', 'short_answer', 'rating'],
  },
  {
    id: 'exam',
    kind: 'quiz',
    label: 'MCQ Quiz',
    short: 'Scored test',
    icon: ClipboardList,
    accent: '#0f766e',
    defaultTitle: 'Untitled quiz',
    defaultType: 'multiple_choice',
    recommendedTypes: ['multiple_choice', 'dropdown', 'checkboxes'],
    starter: ['multiple_choice'],
  },
  {
    id: 'form',
    kind: 'form',
    label: 'Form',
    short: 'Collect data',
    icon: LayoutTemplate,
    accent: '#2563eb',
    defaultTitle: 'Untitled form',
    defaultType: 'short_answer',
    recommendedTypes: ['short_answer', 'paragraph', 'dropdown', 'file_upload', 'date', 'time'],
    starter: ['short_answer', 'paragraph'],
  },
  {
    id: 'coding',
    kind: 'coding',
    label: 'Coding',
    short: 'Problem links',
    icon: Code2,
    accent: '#7c3aed',
    defaultTitle: 'Untitled coding assessment',
    defaultType: 'coding_link',
    recommendedTypes: ['coding_link', 'code', 'paragraph', 'file_upload'],
    starter: ['coding_link', 'paragraph'],
  },
  {
    id: 'upload',
    kind: 'upload',
    label: 'Uploads',
    short: 'Submissions',
    icon: FileUp,
    accent: '#b45309',
    defaultTitle: 'Untitled upload request',
    defaultType: 'file_upload',
    recommendedTypes: ['file_upload', 'short_answer', 'paragraph'],
    starter: ['file_upload', 'short_answer'],
  },
  {
    id: 'rating',
    kind: 'rating',
    label: 'Ratings',
    short: 'Feedback',
    icon: Star,
    accent: '#db2777',
    defaultTitle: 'Untitled rating form',
    defaultType: 'rating',
    recommendedTypes: ['rating', 'linear_scale', 'paragraph'],
    starter: ['rating', 'paragraph'],
  },
  {
    id: 'survey',
    kind: 'survey',
    label: 'Survey',
    short: 'Research',
    icon: BarChart3,
    accent: '#0891b2',
    defaultTitle: 'Untitled survey',
    defaultType: 'linear_scale',
    recommendedTypes: ['multiple_choice', 'checkboxes', 'linear_scale', 'rating', 'multiple_choice_grid', 'tick_box_grid', 'paragraph'],
    starter: ['linear_scale', 'multiple_choice', 'paragraph'],
  },
];

const MODE_BY_ID = BUILDER_MODES.reduce((map, mode) => {
  map[mode.id] = mode;
  return map;
}, {});

const getOptionLabel = (index) => String.fromCharCode(65 + index);

const createQuestion = (id, type, text = '') => ({
  id,
  text,
  ...makeQuestionDefaults(type),
});

const makeStarterQuestions = (modeId) => {
  const mode = MODE_BY_ID[modeId] || MODE_BY_ID.universal;
  return mode.starter.map((type, index) => createQuestion(index + 1, type));
};

const isQuestionEmpty = (question) => {
  const textEmpty = !String(question.text || '').trim();
  const optionsEmpty = (question.options || []).every((option) => !String(option.text || '').trim() || /^Option \d+$/.test(option.text));
  return textEmpty && optionsEmpty;
};

export default function ManualBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode') || 'universal';
  const initialMode = MODE_BY_ID[requestedMode] ? requestedMode : 'universal';

  const [builderMode, setBuilderMode] = useState(initialMode);
  const activeMode = MODE_BY_ID[builderMode] || MODE_BY_ID.universal;
  const [title, setTitle] = useState(activeMode.defaultTitle);
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState(() => makeStarterQuestions(initialMode));
  const [activeQuestion, setActiveQuestion] = useState(1);
  const [saving, setSaving] = useState(false);

  const currentQ = questions.find((question) => question.id === activeQuestion) || questions[0];

  const counts = useMemo(() => {
    const scoreable = questions.filter((question) => PUBLISHABLE_QUIZ_TYPES.includes(question.type)).length;
    const draftOnly = questions.length - scoreable;
    return { scoreable, draftOnly, total: questions.length };
  }, [questions]);

  const publishBlocker = useMemo(() => {
    if (!title.trim()) return 'Add a title before publishing';

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const type = question.type || 'multiple_choice';

      if (!PUBLISHABLE_QUIZ_TYPES.includes(type)) {
        return `Item ${index + 1} is ${TYPE_LABELS[type] || type}, which saves as a workspace draft`;
      }

      if (!String(question.text || '').trim()) {
        return `Item ${index + 1} needs question text`;
      }

      const filledOptions = (question.options || []).filter((option) => String(option.text || '').trim());
      if (filledOptions.length < 2) {
        return `Item ${index + 1} needs at least two options`;
      }

      if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) {
        return `Choose the correct answer for item ${index + 1}`;
      }
    }

    return '';
  }, [questions, title]);

  const publishReady = !publishBlocker;

  const normalizeQuestionForSave = (question, index) => {
    const type = question.type || 'multiple_choice';
    const selectedIds = Array.isArray(question.correctAnswers)
      ? question.correctAnswers.map((id) => String(id))
      : question.correctId
        ? [String(question.correctId)]
        : [];

    const options = OBJECTIVE_TYPES.includes(type)
      ? (question.options || []).map((option, optionIndex) => ({
          label: option.label || getOptionLabel(optionIndex),
          text: String(option.text || '').trim() || `Option ${optionIndex + 1}`,
          isCorrect: selectedIds.includes(String(option.id)) || selectedIds.includes(String(option.label || getOptionLabel(optionIndex))),
        }))
      : [];

    const correctLabels = options.filter((option) => option.isCorrect).map((option) => option.label);

    return {
      questionNumber: index + 1,
      questionText: String(question.text || '').trim() || `${TYPE_LABELS[type] || 'Item'} ${index + 1}`,
      questionType: type,
      options,
      correctAnswer: type === 'checkboxes' ? correctLabels : correctLabels[0] || null,
      explanation: String(question.explanation || '').trim(),
      marks: Number(question.marks ?? (OBJECTIVE_TYPES.includes(type) ? 1 : 0)),
      negativeMarks: Number(question.negativeMarks ?? 0),
      grid: question.grid,
      settings: question.settings || {},
      metadata: {
        required: question.required !== false,
        builderMode,
        contentKind: activeMode.kind,
      },
    };
  };

  const validateBeforeSave = (isDraft) => {
    if (!title.trim()) return 'Please provide a title';
    if (!questions.length) return 'Add at least one item';

    if (!isDraft && publishBlocker) return publishBlocker;

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const type = question.type || 'multiple_choice';

      if (OBJECTIVE_TYPES.includes(type)) {
        const filledOptions = (question.options || []).filter((option) => String(option.text || '').trim());
        if (filledOptions.length < 2) {
          return `Item ${index + 1} needs at least two options`;
        }
      }

      if (type === 'coding_link') {
        const url = question.settings?.url;
        if (!isDraft && !url) return `Add the coding problem URL for item ${index + 1}`;
      }
    }

    return '';
  };

  const handleSave = async (isDraft) => {
    const effectiveDraft = isDraft || !publishReady;
    const validationError = validateBeforeSave(effectiveDraft);
    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description,
        isDraft: effectiveDraft,
        builderMode,
        contentKind: effectiveDraft ? activeMode.kind : 'quiz',
        metadata: {
          createdFrom: 'universal_builder',
          scoreableItems: counts.scoreable,
          draftOnlyItems: counts.draftOnly,
        },
        questions: questions.map(normalizeQuestionForSave),
      };
      await api.post('/quiz/manual', payload);
      alert(effectiveDraft ? 'Workspace saved successfully!' : 'Quiz published successfully!');
      navigate('/dashboard');
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to save workspace');
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = (type = activeMode.defaultType) => {
    const nextId = questions.length > 0 ? Math.max(...questions.map((question) => question.id)) + 1 : 1;
    const nextQuestion = createQuestion(nextId, type);
    setQuestions([...questions, nextQuestion]);
    setActiveQuestion(nextId);
  };

  const handleModeChange = (modeId) => {
    const nextMode = MODE_BY_ID[modeId] || MODE_BY_ID.universal;
    setBuilderMode(nextMode.id);

    const onlyBlankStarter = questions.length <= 3 && questions.every(isQuestionEmpty);
    if (onlyBlankStarter) {
      const starter = makeStarterQuestions(nextMode.id);
      setQuestions(starter);
      setActiveQuestion(starter[0]?.id || 1);
      if (!title.trim() || BUILDER_MODES.some((mode) => mode.defaultTitle === title)) {
        setTitle(nextMode.defaultTitle);
      }
    }
  };

  const modeIcon = activeMode.icon;
  const ActiveIcon = modeIcon;

  return (
    <div className="universal-builder" style={{ '--mode-accent': activeMode.accent }}>
      <header className="ub-topbar">
        <div className="ub-topbar-left">
          <button type="button" className="ub-back" onClick={() => navigate('/create')} title="Back to create">
            <ArrowLeft size={20} />
          </button>
          <div className="ub-brand-mark">
            <ActiveIcon size={17} />
          </div>
          <div>
            <strong>Universal Builder</strong>
            <span>{activeMode.label} workspace</span>
          </div>
        </div>

        <div className="ub-topbar-actions">
          <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving} style={{ gap: 6, padding: '9px 15px', fontSize: 13 }}>
            <Save size={16} /> Save Workspace
          </Button>
          <Button onClick={() => handleSave(false)} disabled={saving || !publishReady} title={publishBlocker || 'Publish quiz'} style={{ gap: 6, padding: '9px 15px', fontSize: 13 }}>
            {saving ? 'Saving...' : 'Publish Quiz'} <Send size={16} />
          </Button>
        </div>
      </header>

      <div className="ub-workspace">
        <aside className="ub-left-panel">
          <div className="ub-mode-list">
            {BUILDER_MODES.map((mode) => {
              const Icon = mode.icon;
              const active = builderMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={`ub-mode-button ${active ? 'active' : ''}`}
                  style={{ '--item-accent': mode.accent }}
                  onClick={() => handleModeChange(mode.id)}
                >
                  <Icon size={17} />
                  <span>{mode.label}</span>
                  <small>{mode.short}</small>
                </button>
              );
            })}
          </div>

          <div className="ub-add-blocks">
            <div className="ub-panel-label">Add block</div>
            {activeMode.recommendedTypes.map((type) => (
              <button key={type} type="button" onClick={() => handleAddQuestion(type)}>
                <Plus size={15} />
                <span>{TYPE_LABELS[type] || type}</span>
              </button>
            ))}
          </div>
        </aside>

        <aside className="ub-question-rail">
          <button type="button" className="ub-add-item" onClick={() => handleAddQuestion()}>
            <Plus size={16} /> Add Item
          </button>
          <div className="ub-item-list">
            {questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                className={`ub-item-card ${activeQuestion === question.id ? 'active' : ''}`}
                onClick={() => setActiveQuestion(question.id)}
              >
                <span>{index + 1}</span>
                <strong>{question.text || 'Empty item'}</strong>
                <small>{TYPE_LABELS[question.type] || question.type}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="ub-canvas">
          <section className="ub-meta">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Workspace title"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description or instructions"
              rows={2}
            />
          </section>

          {currentQ && (
            <QuestionEditor
              question={currentQ}
              index={questions.findIndex((question) => question.id === currentQ.id)}
              recommendedTypes={activeMode.recommendedTypes}
              onChange={(updatedQuestion) => {
                setQuestions(questions.map((question) => question.id === updatedQuestion.id ? updatedQuestion : question));
              }}
              onDelete={() => {
                const nextQuestions = questions.filter((question) => question.id !== currentQ.id);
                setQuestions(nextQuestions);
                setActiveQuestion(nextQuestions[0]?.id);
              }}
              allowDelete={questions.length > 1}
            />
          )}
        </main>

        <aside className="ub-right-panel">
          <div className="ub-summary-card">
            <div className="ub-panel-label">Workspace</div>
            <h2>{activeMode.label}</h2>
            <div className="ub-summary-stats">
              <span><strong>{counts.total}</strong> items</span>
              <span><strong>{counts.scoreable}</strong> quiz-ready</span>
              <span><strong>{counts.draftOnly}</strong> draft blocks</span>
            </div>
          </div>

          <div className="ub-summary-card">
            <div className="ub-panel-label">Share path</div>
            <div className="ub-share-path">
              <UploadCloud size={18} />
              <span>{publishReady ? 'Publishable quiz' : 'Workspace draft'}</span>
            </div>
            <p>{publishReady ? 'This can become a shareable scored quiz.' : publishBlocker}</p>
          </div>

          <div className="ub-summary-card">
            <div className="ub-panel-label">Saved location</div>
            <h2>Workspace</h2>
            <p>Saving from this builder creates a database-backed item in your workspace, where it can be organized into folders.</p>
          </div>
        </aside>
      </div>

      <style>{manualBuilderStyles}</style>
    </div>
  );
}

const manualBuilderStyles = `
  .universal-builder {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f7f7f8;
    color: var(--color-text);
  }

  .ub-topbar {
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 0 18px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .ub-topbar-left,
  .ub-topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ub-back {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ub-back:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .ub-brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--mode-accent) 13%, white);
    color: var(--mode-accent);
  }

  .ub-topbar strong {
    display: block;
    font-size: 14px;
    line-height: 1.1;
  }

  .ub-topbar span {
    display: block;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 650;
  }

  .ub-workspace {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: 190px 250px minmax(0, 1fr) 280px;
    overflow: hidden;
  }

  .ub-left-panel,
  .ub-question-rail,
  .ub-right-panel {
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .ub-left-panel {
    padding: 14px;
  }

  .ub-question-rail {
    background: var(--color-surface-alt);
    padding: 14px;
  }

  .ub-right-panel {
    border-right: none;
    border-left: 1px solid var(--color-border);
    padding: 16px;
  }

  .ub-mode-list,
  .ub-add-blocks,
  .ub-item-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ub-panel-label {
    margin: 12px 0 8px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .ub-mode-button,
  .ub-add-blocks button,
  .ub-add-item,
  .ub-item-card {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .ub-mode-button {
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: 4px 8px;
    padding: 10px;
  }

  .ub-mode-button small {
    grid-column: 2;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 650;
  }

  .ub-mode-button span,
  .ub-add-blocks span {
    font-size: 13px;
    font-weight: 780;
  }

  .ub-mode-button.active {
    border-color: color-mix(in srgb, var(--item-accent) 32%, var(--color-border));
    background: color-mix(in srgb, var(--item-accent) 10%, white);
    color: var(--item-accent);
  }

  .ub-add-blocks {
    margin-top: 18px;
  }

  .ub-add-blocks button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
  }

  .ub-add-blocks button:hover,
  .ub-add-item:hover,
  .ub-item-card:hover {
    border-color: var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .ub-add-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border: 1px dashed var(--color-border);
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 780;
    background: var(--color-surface);
  }

  .ub-item-list {
    margin-top: 12px;
  }

  .ub-item-card {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 3px 10px;
    padding: 11px;
    background: transparent;
  }

  .ub-item-card span {
    grid-row: span 2;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: var(--color-border-light);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 850;
  }

  .ub-item-card strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 780;
  }

  .ub-item-card small {
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .ub-item-card.active {
    border-color: color-mix(in srgb, var(--mode-accent) 35%, var(--color-border));
    background: var(--color-surface);
  }

  .ub-item-card.active span {
    background: var(--mode-accent);
    color: #fff;
  }

  .ub-item-card.active strong {
    color: var(--color-text);
  }

  .ub-canvas {
    min-width: 0;
    overflow-y: auto;
    padding: 28px 34px 44px;
  }

  .ub-meta {
    max-width: 860px;
    margin: 0 auto 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ub-meta input,
  .ub-meta textarea {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    outline: none;
  }

  .ub-meta input {
    font-size: 34px;
    line-height: 1.12;
    font-weight: 850;
  }

  .ub-meta textarea {
    color: var(--color-text-secondary);
    font-size: 15px;
    resize: none;
  }

  .ub-canvas > .ub-editor-card {
    max-width: 860px;
    margin: 0 auto;
  }

  .ub-summary-card {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    padding: 15px;
    margin-bottom: 12px;
  }

  .ub-summary-card h2 {
    margin: 0 0 12px;
    color: var(--color-text);
    font-size: 18px;
    font-weight: 850;
  }

  .ub-summary-stats {
    display: grid;
    gap: 8px;
  }

  .ub-summary-stats span,
  .ub-share-path {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-radius: 8px;
    background: var(--color-surface-alt);
    color: var(--color-text-secondary);
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 750;
  }

  .ub-summary-stats strong {
    color: var(--mode-accent);
    font-size: 16px;
  }

  .ub-share-path {
    justify-content: flex-start;
    color: var(--mode-accent);
  }

  .ub-summary-card p {
    margin: 10px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.45;
    font-weight: 650;
  }

  .ub-panel-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .ub-panel-title-row .ub-panel-label {
    margin-bottom: 8px;
  }

  .ub-panel-title-row button {
    border: none;
    background: transparent;
    color: var(--mode-accent);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 850;
  }

  .ub-bank-controls {
    display: grid;
    grid-template-columns: 1fr 38px;
    gap: 8px;
    margin-bottom: 9px;
  }

  .ub-bank-controls select,
  .ub-bank-search input {
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }

  .ub-bank-controls select {
    height: 38px;
    padding: 0 9px;
  }

  .ub-bank-controls button,
  .ub-bank-save {
    border: none;
    border-radius: 8px;
    background: var(--mode-accent);
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
  }

  .ub-bank-save {
    width: 100%;
    min-height: 38px;
    margin-bottom: 9px;
  }

  .ub-bank-save:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ub-bank-search {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
    padding: 0 9px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-muted);
  }

  .ub-bank-search input {
    width: 100%;
    border: none;
    padding: 0;
  }

  .ub-bank-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 286px;
    overflow-y: auto;
  }

  .ub-bank-list button {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-alt);
    color: var(--color-text);
    cursor: pointer;
    padding: 10px;
    text-align: left;
    font: inherit;
  }

  .ub-bank-list button:hover {
    border-color: color-mix(in srgb, var(--mode-accent) 35%, var(--color-border));
    background: color-mix(in srgb, var(--mode-accent) 7%, white);
  }

  .ub-bank-list strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text);
    font-size: 12px;
    font-weight: 800;
  }

  .ub-bank-list small,
  .ub-bank-empty {
    display: block;
    margin-top: 3px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 750;
  }

  @media (max-width: 1180px) {
    .ub-workspace {
      grid-template-columns: 176px 230px minmax(0, 1fr);
    }

    .ub-right-panel {
      display: none;
    }
  }

  @media (max-width: 880px) {
    .universal-builder {
      height: auto;
      min-height: 100vh;
    }

    .ub-topbar {
      height: auto;
      align-items: stretch;
      flex-direction: column;
      padding: 12px;
    }

    .ub-topbar-actions {
      width: 100%;
      justify-content: stretch;
    }

    .ub-topbar-actions button {
      flex: 1;
    }

    .ub-workspace {
      grid-template-columns: 1fr;
      overflow: visible;
    }

    .ub-left-panel,
    .ub-question-rail {
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }

    .ub-mode-list,
    .ub-add-blocks,
    .ub-item-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ub-canvas {
      padding: 22px 14px 34px;
    }
  }

  @media (max-width: 520px) {
    .ub-mode-list,
    .ub-add-blocks,
    .ub-item-list {
      grid-template-columns: 1fr;
    }

    .ub-meta input {
      font-size: 26px;
    }
  }
`;
