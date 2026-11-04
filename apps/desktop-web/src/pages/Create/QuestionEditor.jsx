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
import './QuestionEditor.css';

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
    </div>
  );
}
