import {
  CheckCircle2,
  Circle,
  Code2,
  FileUp,
  Link2,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '../../components/ui';

export const QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Multiple choice', group: 'Scored' },
  { id: 'checkboxes', label: 'Checkboxes', group: 'Scored draft' },
  { id: 'dropdown', label: 'Drop-down', group: 'Scored' },
  { id: 'short_answer', label: 'Short answer', group: 'Form' },
  { id: 'paragraph', label: 'Paragraph', group: 'Form' },
  { id: 'file_upload', label: 'File upload', group: 'Files' },
  { id: 'coding_link', label: 'Coding link', group: 'Coding' },
  { id: 'code', label: 'Code response', group: 'Coding' },
  { id: 'linear_scale', label: 'Linear scale', group: 'Survey' },
  { id: 'rating', label: 'Rating', group: 'Survey' },
  { id: 'multiple_choice_grid', label: 'Multiple-choice grid', group: 'Survey' },
  { id: 'tick_box_grid', label: 'Tick box grid', group: 'Survey' },
  { id: 'date', label: 'Date', group: 'Form' },
  { id: 'time', label: 'Time', group: 'Form' },
];

export const TYPE_LABELS = QUESTION_TYPES.reduce((labels, type) => {
  labels[type.id] = type.label;
  return labels;
}, {});

const OBJECTIVE_TYPES = ['multiple_choice', 'checkboxes', 'dropdown'];
const GRID_TYPES = ['multiple_choice_grid', 'tick_box_grid'];

const getOptionLabel = (index) => String.fromCharCode(65 + index);

export function getDefaultSettingsForType(type) {
  switch (type) {
    case 'linear_scale':
      return { min: 1, max: 5, minLabel: '', maxLabel: '' };
    case 'rating':
      return { max: 5, icon: 'star' };
    case 'code':
      return { language: 'javascript', starterCode: '' };
    case 'coding_link':
      return { provider: 'leetcode', url: '', difficulty: '', tags: '' };
    case 'file_upload':
      return { maxFiles: 1, maxSizeMb: 10, allowedTypes: 'pdf,docx,png,jpg' };
    case 'date':
      return { includeYear: true };
    case 'time':
      return { format: '12h' };
    default:
      return {};
  }
}

export function makeQuestionDefaults(type = 'multiple_choice') {
  return {
    type,
    options: OBJECTIVE_TYPES.includes(type)
      ? [
          { id: 1, text: 'Option 1' },
          { id: 2, text: 'Option 2' },
        ]
      : [],
    grid: GRID_TYPES.includes(type)
      ? {
          rows: [{ id: 1, text: 'Row 1' }],
          cols: [{ id: 1, text: 'Column 1' }],
        }
      : undefined,
    settings: getDefaultSettingsForType(type),
    correctAnswers: [],
    required: true,
    marks: OBJECTIVE_TYPES.includes(type) ? 1 : 0,
    negativeMarks: 0,
    explanation: '',
  };
}

export function normalizeQuestionForType(question, type) {
  const defaults = makeQuestionDefaults(type);
  return {
    ...question,
    type,
    options: defaults.options,
    grid: defaults.grid,
    settings: defaults.settings,
    correctAnswers: [],
    marks: defaults.marks,
    negativeMarks: defaults.negativeMarks,
  };
}

function FieldShell({ children, note }) {
  return (
    <div className="ub-field-shell">
      {children}
      {note && <span className="ub-field-note">{note}</span>}
    </div>
  );
}

export default function QuestionEditor({
  question,
  index,
  onChange,
  onDelete,
  allowDelete,
  recommendedTypes = [],
}) {
  const questionType = question.type || 'multiple_choice';
  const recommendedSet = new Set(recommendedTypes);
  const recommended = QUESTION_TYPES.filter((type) => recommendedSet.has(type.id));
  const remaining = QUESTION_TYPES.filter((type) => !recommendedSet.has(type.id));

  const updateQuestion = (updates) => {
    onChange({ ...question, ...updates });
  };

  const updateSettings = (updates) => {
    updateQuestion({
      settings: {
        ...(question.settings || getDefaultSettingsForType(questionType)),
        ...updates,
      },
    });
  };

  const handleTypeChange = (event) => {
    updateQuestion(normalizeQuestionForType(question, event.target.value));
  };

  const renderOptionsEditor = (type) => {
    const isRadio = type === 'multiple_choice' || type === 'dropdown';
    const isCheckbox = type === 'checkboxes';

    return (
      <div className="ub-option-stack">
        {(question.options || []).map((option, optionIndex) => {
          const selected = (question.correctAnswers || []).includes(option.id);

          return (
            <div key={option.id} className="ub-option-row">
              <button
                type="button"
                className={`ub-answer-toggle ${selected ? 'selected' : ''}`}
                onClick={() => {
                  let nextAnswers = question.correctAnswers || [];
                  if (isRadio) {
                    nextAnswers = [option.id];
                  } else if (isCheckbox) {
                    nextAnswers = selected
                      ? nextAnswers.filter((id) => id !== option.id)
                      : [...nextAnswers, option.id];
                  }
                  updateQuestion({ correctAnswers: nextAnswers });
                }}
                title="Mark correct answer"
              >
                {selected ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>

              <span className="ub-option-label">{getOptionLabel(optionIndex)}</span>

              <input
                type="text"
                value={option.text}
                onChange={(event) => {
                  const nextOptions = (question.options || []).map((item) =>
                    item.id === option.id ? { ...item, text: event.target.value } : item
                  );
                  updateQuestion({ options: nextOptions });
                }}
                placeholder={`Option ${optionIndex + 1}`}
              />

              <button
                type="button"
                className="ub-icon-button"
                onClick={() => {
                  const nextOptions = (question.options || []).filter((item) => item.id !== option.id);
                  const nextAnswers = (question.correctAnswers || []).filter((id) => id !== option.id);
                  updateQuestion({ options: nextOptions, correctAnswers: nextAnswers });
                }}
                title="Delete option"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}

        <Button
          variant="ghost"
          onClick={() => {
            const nextId = question.options?.length
              ? Math.max(...question.options.map((option) => Number(option.id) || 0)) + 1
              : 1;
            updateQuestion({
              options: [...(question.options || []), { id: nextId, text: `Option ${nextId}` }],
            });
          }}
          style={{ width: 'fit-content', padding: '7px 12px' }}
        >
          <Plus size={16} /> Add Option
        </Button>
      </div>
    );
  };

  const renderGridEditor = () => {
    const grid = question.grid || makeQuestionDefaults(questionType).grid;

    const updateGrid = (field, items) => {
      updateQuestion({ grid: { ...grid, [field]: items } });
    };

    return (
      <div className="ub-grid-editor">
        <div>
          <strong>Rows</strong>
          {grid.rows.map((row, rowIndex) => (
            <div key={row.id} className="ub-compact-row">
              <span>{rowIndex + 1}</span>
              <input
                type="text"
                value={row.text}
                onChange={(event) => updateGrid('rows', grid.rows.map((item) =>
                  item.id === row.id ? { ...item, text: event.target.value } : item
                ))}
              />
              <button type="button" className="ub-icon-button" onClick={() => updateGrid('rows', grid.rows.filter((item) => item.id !== row.id))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => updateGrid('rows', [...grid.rows, { id: Date.now(), text: `Row ${grid.rows.length + 1}` }])} style={{ padding: '5px 8px', fontSize: 13, width: 'fit-content' }}>
            <Plus size={14} /> Row
          </Button>
        </div>

        <div>
          <strong>Columns</strong>
          {grid.cols.map((column, columnIndex) => (
            <div key={column.id} className="ub-compact-row">
              <span>{getOptionLabel(columnIndex)}</span>
              <input
                type="text"
                value={column.text}
                onChange={(event) => updateGrid('cols', grid.cols.map((item) =>
                  item.id === column.id ? { ...item, text: event.target.value } : item
                ))}
              />
              <button type="button" className="ub-icon-button" onClick={() => updateGrid('cols', grid.cols.filter((item) => item.id !== column.id))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => updateGrid('cols', [...grid.cols, { id: Date.now(), text: `Column ${grid.cols.length + 1}` }])} style={{ padding: '5px 8px', fontSize: 13, width: 'fit-content' }}>
            <Plus size={14} /> Column
          </Button>
        </div>
      </div>
    );
  };

  const renderLinearScale = () => {
    const settings = { ...getDefaultSettingsForType('linear_scale'), ...(question.settings || {}) };

    return (
      <FieldShell>
        <div className="ub-inline-controls">
          <select value={settings.min} onChange={(event) => updateSettings({ min: Number(event.target.value) })}>
            {[0, 1].map((number) => <option key={number} value={number}>{number}</option>)}
          </select>
          <span>to</span>
          <select value={settings.max} onChange={(event) => updateSettings({ max: Number(event.target.value) })}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((number) => <option key={number} value={number}>{number}</option>)}
          </select>
        </div>
        <div className="ub-two-col">
          <input type="text" placeholder="Low label" value={settings.minLabel} onChange={(event) => updateSettings({ minLabel: event.target.value })} />
          <input type="text" placeholder="High label" value={settings.maxLabel} onChange={(event) => updateSettings({ maxLabel: event.target.value })} />
        </div>
      </FieldShell>
    );
  };

  const renderRating = () => {
    const settings = { ...getDefaultSettingsForType('rating'), ...(question.settings || {}) };

    return (
      <FieldShell>
        <div className="ub-rating-preview">
          {Array.from({ length: settings.max }).map((_, ratingIndex) => (
            <Star key={ratingIndex} size={24} fill="currentColor" />
          ))}
        </div>
        <div className="ub-inline-controls">
          <span>Levels</span>
          <select value={settings.max} onChange={(event) => updateSettings({ max: Number(event.target.value) })}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((number) => <option key={number} value={number}>{number}</option>)}
          </select>
        </div>
      </FieldShell>
    );
  };

  const renderCodeEditor = () => {
    const settings = { ...getDefaultSettingsForType('code'), ...(question.settings || {}) };
    const languages = ['javascript', 'python', 'java', 'cpp', 'typescript', 'html', 'css', 'sql'];

    return (
      <FieldShell>
        <div className="ub-inline-controls">
          <Code2 size={16} />
          <span>Language</span>
          <select value={settings.language} onChange={(event) => updateSettings({ language: event.target.value })}>
            {languages.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
        </div>
        <textarea
          className="ub-code-box"
          placeholder="// Optional starter code"
          value={settings.starterCode || ''}
          onChange={(event) => updateSettings({ starterCode: event.target.value })}
          rows={6}
        />
      </FieldShell>
    );
  };

  const renderCodingLink = () => {
    const settings = { ...getDefaultSettingsForType('coding_link'), ...(question.settings || {}) };

    return (
      <FieldShell note="The respondent gets a clean problem card with an external open button.">
        <div className="ub-two-col">
          <select value={settings.provider} onChange={(event) => updateSettings({ provider: event.target.value })}>
            <option value="leetcode">LeetCode</option>
            <option value="hackerrank">HackerRank</option>
            <option value="codeforces">Codeforces</option>
            <option value="geeksforgeeks">GeeksForGeeks</option>
            <option value="other">Other</option>
          </select>
          <input
            type="text"
            placeholder="Difficulty or tag"
            value={settings.difficulty || ''}
            onChange={(event) => updateSettings({ difficulty: event.target.value })}
          />
        </div>
        <div className="ub-link-input">
          <Link2 size={17} />
          <input
            type="url"
            placeholder="https://leetcode.com/problems/two-sum/"
            value={settings.url || ''}
            onChange={(event) => updateSettings({ url: event.target.value })}
          />
        </div>
      </FieldShell>
    );
  };

  const renderFileUpload = () => {
    const settings = { ...getDefaultSettingsForType('file_upload'), ...(question.settings || {}) };

    return (
      <FieldShell>
        <div className="ub-upload-preview">
          <FileUp size={26} />
          <strong>File upload response</strong>
        </div>
        <div className="ub-two-col">
          <input
            type="number"
            min="1"
            max="10"
            value={settings.maxFiles}
            onChange={(event) => updateSettings({ maxFiles: Number(event.target.value) })}
            aria-label="Maximum files"
          />
          <input
            type="number"
            min="1"
            max="100"
            value={settings.maxSizeMb}
            onChange={(event) => updateSettings({ maxSizeMb: Number(event.target.value) })}
            aria-label="Maximum size in MB"
          />
        </div>
        <input
          type="text"
          placeholder="Allowed types, for example pdf, docx, png"
          value={settings.allowedTypes || ''}
          onChange={(event) => updateSettings({ allowedTypes: event.target.value })}
        />
      </FieldShell>
    );
  };

  const renderBody = () => {
    if (questionType === 'short_answer') {
      return <FieldShell><div className="ub-answer-line">Short answer text</div></FieldShell>;
    }

    if (questionType === 'paragraph') {
      return <FieldShell><div className="ub-paragraph-preview">Long answer text</div></FieldShell>;
    }

    if (OBJECTIVE_TYPES.includes(questionType)) return renderOptionsEditor(questionType);
    if (GRID_TYPES.includes(questionType)) return renderGridEditor();
    if (questionType === 'linear_scale') return renderLinearScale();
    if (questionType === 'rating') return renderRating();
    if (questionType === 'code') return renderCodeEditor();
    if (questionType === 'coding_link') return renderCodingLink();
    if (questionType === 'file_upload') return renderFileUpload();
    if (questionType === 'date') return <FieldShell><div className="ub-date-preview">Month, day, year</div></FieldShell>;
    if (questionType === 'time') return <FieldShell><div className="ub-date-preview">Time</div></FieldShell>;

    return null;
  };

  return (
    <div className="ub-editor-card">
      <div className="ub-editor-header">
        <div className="ub-question-number">Item {index + 1}</div>
        <select value={questionType} onChange={handleTypeChange} className="ub-type-select">
          {recommended.length > 0 && (
            <optgroup label="Recommended">
              {recommended.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </optgroup>
          )}
          <optgroup label="All blocks">
            {remaining.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </optgroup>
        </select>
      </div>

      <textarea
        className="ub-question-title"
        placeholder="Write the question, prompt, task, or instruction"
        value={question.text}
        onChange={(event) => updateQuestion({ text: event.target.value })}
      />

      <div className="ub-editor-body">
        {renderBody()}
      </div>

      <div className="ub-editor-footer">
        <label className="ub-check-row">
          <input
            type="checkbox"
            checked={question.required !== false}
            onChange={(event) => updateQuestion({ required: event.target.checked })}
          />
          Required
        </label>

        {OBJECTIVE_TYPES.includes(questionType) && (
          <>
            <label className="ub-small-field">
              Points
              <input
                type="number"
                min="0"
                value={question.marks ?? 1}
                onChange={(event) => updateQuestion({ marks: Number(event.target.value) })}
              />
            </label>
            <label className="ub-small-field">
              Negative
              <input
                type="number"
                min="0"
                value={question.negativeMarks ?? 0}
                onChange={(event) => updateQuestion({ negativeMarks: Number(event.target.value) })}
              />
            </label>
          </>
        )}

        <input
          className="ub-explanation-input"
          type="text"
          placeholder="Explanation or grading note"
          value={question.explanation || ''}
          onChange={(event) => updateQuestion({ explanation: event.target.value })}
        />

        {allowDelete && (
          <button type="button" className="ub-delete-button" onClick={onDelete}>
            <Trash2 size={16} /> Delete
          </button>
        )}
      </div>

      <style>{questionEditorStyles}</style>
    </div>
  );
}

const questionEditorStyles = `
  .ub-editor-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
    padding: 22px;
  }

  .ub-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .ub-question-number {
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .ub-type-select,
  .ub-inline-controls select,
  .ub-two-col select {
    height: 42px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    padding: 0 12px;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    outline: none;
  }

  .ub-type-select {
    width: min(260px, 100%);
  }

  .ub-question-title {
    width: 100%;
    min-height: 92px;
    padding: 15px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font: inherit;
    font-size: 16px;
    font-weight: 650;
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }

  .ub-editor-body {
    margin-top: 18px;
  }

  .ub-field-shell,
  .ub-option-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ub-field-note {
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 650;
  }

  .ub-option-row,
  .ub-compact-row,
  .ub-link-input {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .ub-answer-toggle,
  .ub-icon-button,
  .ub-delete-button {
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .ub-answer-toggle.selected {
    color: var(--color-success);
  }

  .ub-option-label {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    background: var(--color-surface-alt);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 850;
  }

  .ub-option-row input,
  .ub-compact-row input,
  .ub-link-input input,
  .ub-two-col input,
  .ub-field-shell > input,
  .ub-code-box,
  .ub-explanation-input {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
    outline: none;
    padding: 10px 12px;
  }

  .ub-option-row input,
  .ub-link-input input,
  .ub-compact-row input {
    border: none;
    padding: 0;
  }

  .ub-grid-editor,
  .ub-two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .ub-grid-editor > div {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ub-grid-editor strong {
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  .ub-inline-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--color-text-secondary);
    font-size: 14px;
    font-weight: 750;
    flex-wrap: wrap;
  }

  .ub-rating-preview {
    display: flex;
    gap: 8px;
    color: #f59e0b;
    flex-wrap: wrap;
  }

  .ub-code-box {
    min-height: 150px;
    background: #18181b;
    border-color: #27272a;
    color: #f4f4f5;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    resize: vertical;
  }

  .ub-upload-preview {
    min-height: 110px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-alt);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .ub-answer-line {
    width: min(420px, 100%);
    padding: 14px 0;
    border-bottom: 1px dotted var(--color-border);
    color: var(--color-text-muted);
  }

  .ub-paragraph-preview {
    min-height: 92px;
    padding: 14px 0;
    border-bottom: 1px dotted var(--color-border);
    color: var(--color-text-muted);
  }

  .ub-date-preview {
    width: fit-content;
    padding: 12px 16px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-alt);
    color: var(--color-text-muted);
    font-weight: 700;
  }

  .ub-editor-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--color-border);
    flex-wrap: wrap;
  }

  .ub-check-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 750;
  }

  .ub-small-field {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 750;
  }

  .ub-small-field input {
    width: 68px;
    height: 36px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0 8px;
    color: var(--color-text);
  }

  .ub-explanation-input {
    flex: 1;
    min-width: 220px;
  }

  .ub-delete-button {
    gap: 6px;
    margin-left: auto;
    color: var(--color-danger);
    font-size: 13px;
    font-weight: 750;
  }

  @media (max-width: 760px) {
    .ub-editor-header,
    .ub-editor-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .ub-type-select,
    .ub-grid-editor,
    .ub-two-col {
      width: 100%;
      grid-template-columns: 1fr;
    }

    .ub-delete-button {
      margin-left: 0;
      justify-content: flex-start;
    }
  }
`;
