import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Table, SlidersHorizontal, ChevronDown, RefreshCw, Copy, ArrowRight } from 'lucide-react';
import { Card, Button, Badge } from '../../components/ui';
import { useUploadStore } from '../../store/uploadStore';
import api from '../../api/axios';

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
    difficulty: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState(null);
  const [generatedQuizId, setGeneratedQuizId] = useState(null);
  const [duplicateModal, setDuplicateModal] = useState(null);

  // Quiz Rules & Feature Settings
  const [showSettingsAccordion, setShowSettingsAccordion] = useState(false);
  const [timerMode, setTimerMode] = useState('none');
  const [timeLimit, setTimeLimit] = useState(15);
  const [instantFeedback, setInstantFeedback] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);

  useEffect(() => {
    if (!parsedData) {
      // If store is empty (page refresh), fetch preview data
      api.get(`/parser/preview/${uploadId}`).then(res => {
        const data = res.data.data;
        useUploadStore.getState().setParsedData({ headers: data.headers, rowCount: data.rowCount, preview: data.preview });
        if (data.autoMapping) {
          useUploadStore.getState().setAutoMapping(data.autoMapping, data.confidence);
          setMapping(data.autoMapping);
        }
      }).catch(err => {
        setError('Failed to load mapping data');
      });
    } else if (autoMapping) {
      setMapping({
        question: autoMapping.question || '',
        options: autoMapping.options || [],
        answer: autoMapping.answer || '',
        explanation: autoMapping.explanation || '',
        serial: autoMapping.serial || '',
        media: autoMapping.media || '',
        topic: autoMapping.topic || '',
        difficulty: autoMapping.difficulty || ''
      });
    }
  }, [uploadId, parsedData, autoMapping]);

  const handleOptionToggle = (header) => {
    setMapping(prev => {
      const isSelected = prev.options.includes(header);
      return {
        ...prev,
        options: isSelected 
          ? prev.options.filter(o => o !== header)
          : [...prev.options, header]
      };
    });
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
      
      // Generate Quiz with customized rules & settings
      const genRes = await api.post('/quiz/generate', {
        uploadId,
        forceGenerate,
        settings: {
          timerMode,
          timeLimit: timerMode === 'none' ? 0 : Math.max(Number(timeLimit) || 0, 1),
          instantFeedback,
          allowReview,
          showExplanation,
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

  if (!parsedData) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
      Loading mapping data...
    </div>
  );

  return (
    <>
      <div className="qf-mapping-shell">
        
        {/* Duplicate Quiz Detected Modal Overlay */}
        {duplicateModal && (
          <div className="qf-mapping-overlay">
            <Card style={{ width: 540, maxWidth: '90vw', padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: 'rgba(255, 69, 0, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary)'
                }}>
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
                A quiz generated from an identical file already exists: <strong style={{ color: 'var(--color-text)' }}>"{duplicateModal.title}"</strong> ({duplicateModal.questionCount || '—'} questions).
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
                  {parsedData.headers.map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.preview.map((row, i) => (
                  <tr key={i}>
                    {parsedData.headers.map(h => (
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <SlidersHorizontal size={18} style={{ color: 'var(--color-primary)' }} />
              Column Mapping
            </h2>
            {confidence !== null && (
              <Badge variant={confidence > 80 ? 'success' : confidence > 50 ? 'warning' : 'danger'}>
                AI Confidence: {confidence}%
              </Badge>
            )}
          </div>

          {error && <div style={{ color: 'var(--color-danger)', marginBottom: 16, fontSize: 14, padding: '10px 14px', background: 'var(--color-danger-light)', borderRadius: 10 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SelectField 
              label="Question Text *" 
              value={mapping.question} 
              onChange={v => setMapping({...mapping, question: v})} 
              options={parsedData.headers} 
            />
            
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Options * (Select at least 2)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {parsedData.headers.map(h => (
                  <button 
                    key={h}
                    onClick={() => handleOptionToggle(h)}
                    className={`qf-mapping-chip ${mapping.options.includes(h) ? 'active' : ''}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <SelectField label="Correct Answer" value={mapping.answer} onChange={v => setMapping({...mapping, answer: v})} options={parsedData.headers} />
            <SelectField label="Explanation" value={mapping.explanation} onChange={v => setMapping({...mapping, explanation: v})} options={parsedData.headers} />
            <SelectField label="Topic / Tags" value={mapping.topic} onChange={v => setMapping({...mapping, topic: v})} options={parsedData.headers} />
            <SelectField label="Difficulty" value={mapping.difficulty} onChange={v => setMapping({...mapping, difficulty: v})} options={parsedData.headers} />
            
            {/* Quiz Rules & Feature Settings */}
            <div className="qf-mapping-rules-card">
              <div 
                className="qf-mapping-rules-header"
                onClick={() => setShowSettingsAccordion(!showSettingsAccordion)}
                role="button"
                tabIndex={0}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SlidersHorizontal size={16} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Quiz Rules & Mode</h3>
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
                      Timer: {timerMode === 'none' ? 'None' : `${timerMode === 'strict' ? 'Strict' : 'Soft'} (${timeLimit}m)`} • Feedback: {instantFeedback ? 'Enabled' : 'Disabled'} • Review: {allowReview ? 'Allowed' : 'Restricted'}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  style={{
                    color: 'var(--color-text-secondary)',
                    transform: showSettingsAccordion ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
              </div>

              {showSettingsAccordion && (
                <div className="qf-mapping-rules-body">
                  {/* Timer Mode */}
                  <div>
                    <label className="qf-rules-label">Timer Mode</label>
                    <div className="qf-rules-pill-group">
                      {[
                        { id: 'none', label: 'None' },
                        { id: 'soft', label: 'Soft Timer' },
                        { id: 'strict', label: 'Strict Timer' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          className={`qf-rules-pill ${timerMode === mode.id ? 'active' : ''}`}
                          onClick={() => setTimerMode(mode.id)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time limit if timer enabled */}
                  {timerMode !== 'none' && (
                    <div style={{ marginTop: 8 }}>
                      <label className="qf-rules-label">Time Limit (Minutes)</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          max="300"
                          value={timeLimit}
                          onChange={(e) => setTimeLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="qf-mapping-select"
                          style={{ width: 80 }}
                        />
                        <div className="qf-rules-subpill-group">
                          {[10, 15, 30, 45, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              className={`qf-rules-subpill ${timeLimit === mins ? 'active' : ''}`}
                              onClick={() => setTimeLimit(mins)}
                            >
                              {mins}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Toggles Grid */}
                  <div className="qf-rules-toggles">
                    <label className="qf-rules-toggle-item">
                      <input
                        type="checkbox"
                        checked={instantFeedback}
                        onChange={(e) => setInstantFeedback(e.target.checked)}
                      />
                      <div>
                        <strong>Instant Feedback</strong>
                        <span>Reveal answer & explanation immediately on click</span>
                      </div>
                    </label>

                    <label className="qf-rules-toggle-item">
                      <input
                        type="checkbox"
                        checked={allowReview}
                        onChange={(e) => setAllowReview(e.target.checked)}
                      />
                      <div>
                        <strong>Question Review</strong>
                        <span>Allow detailed question review on results page</span>
                      </div>
                    </label>

                    <label className="qf-rules-toggle-item">
                      <input
                        type="checkbox"
                        checked={showExplanation}
                        onChange={(e) => setShowExplanation(e.target.checked)}
                      />
                      <div>
                        <strong>Explanation Reveal</strong>
                        <span>Show answer explanations to takers</span>
                      </div>
                    </label>

                    <div className="qf-rules-toggle-item recovery">
                      <RefreshCw size={15} style={{ color: 'var(--color-primary)' }} />
                      <div>
                        <strong>Recovery: Auto Resume</strong>
                        <span>Session recovery & cloud sync are always active</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <Button onClick={handleConfirm} disabled={isSubmitting} style={{ width: '100%' }}>
                {isSubmitting ? 'Generating Quiz...' : 'Looks Good, Generate Quiz!'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <style>{mappingStyles}</style>
    </>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      <select 
        value={value || ''} 
        onChange={e => onChange(e.target.value)}
        className="qf-mapping-select"
      >
        <option value="">None (Column not present)</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

const mappingStyles = `
  .qf-mapping-shell {
    display: flex;
    gap: 24px;
    height: calc(100vh - 140px);
    position: relative;
  }

  .qf-mapping-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
  }

  .qf-mapping-preview {
    flex: 2;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .qf-mapping-controls {
    flex: 1;
    overflow-y: auto;
  }

  .qf-mapping-table-wrap {
    overflow: auto;
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 10px;
  }

  .qf-mapping-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 13px;
  }

  .qf-mapping-table thead {
    position: sticky;
    top: 0;
    background: var(--color-surface-alt);
    z-index: 1;
  }

  .qf-mapping-table th {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-secondary);
  }

  .qf-mapping-table td {
    padding: 12px 16px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-bottom: 1px solid #f5f5f5;
  }

  .qf-mapping-table tr:hover td {
    background: var(--color-surface-alt);
  }

  .qf-mapping-select {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    outline: none;
    font: inherit;
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .qf-mapping-select:focus {
    border-color: var(--color-primary);
  }

  .qf-mapping-chip {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    transition: all 0.2s;
    font-family: inherit;
  }

  .qf-mapping-chip.active {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  .qf-mapping-chip:hover:not(.active) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .qf-mapping-errors-list {
    flex: 1;
    overflow-y: auto;
    background: var(--color-surface-alt);
    padding: 16px;
    border-radius: 10px;
    margin-bottom: 0;
  }

  .qf-mapping-error-row {
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 8px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .qf-mapping-error-row:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .qf-mapping-rules-card {
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-surface-alt);
    overflow: hidden;
    margin-top: 4px;
  }

  .qf-mapping-rules-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .qf-mapping-rules-header:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  .qf-mapping-rules-body {
    padding: 14px;
    border-top: 1px solid var(--color-border-light);
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--color-surface);
  }

  .qf-rules-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .qf-rules-pill-group {
    display: flex;
    gap: 6px;
  }

  .qf-rules-pill {
    flex: 1;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .qf-rules-pill.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }

  .qf-rules-subpill {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .qf-rules-subpill.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }

  .qf-rules-toggles {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }

  .qf-rules-toggle-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    cursor: pointer;
    font-size: 12px;
  }

  .qf-rules-toggle-item input[type="checkbox"] {
    margin-top: 2px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  .qf-rules-toggle-item div {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .qf-rules-toggle-item strong {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
  }

  .qf-rules-toggle-item span {
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .qf-rules-toggle-item.recovery {
    cursor: default;
    background: rgba(113, 147, 255, 0.06);
    border-color: rgba(113, 147, 255, 0.2);
  }

  @media (max-width: 768px) {
    .qf-mapping-shell {
      flex-direction: column;
      height: auto;
    }
  }
`;
