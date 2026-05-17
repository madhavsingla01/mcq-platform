import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

  const handleConfirm = async () => {
    if (!mapping.question) return setError('Question column is required');
    if (mapping.options.length < 2) return setError('At least 2 option columns are required');
    
    setError('');
    setIsSubmitting(true);
    
    try {
      await api.post(`/parser/map/${uploadId}`, mapping);
      setColumnMapping(mapping);
      
      // Generate Quiz immediately for MVP flow
      const genRes = await api.post('/quiz/generate', { uploadId });
      const { quiz, errors } = genRes.data.data;
      
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
        
        {/* Validation Errors Modal overlay */}
        {validationErrors && (
          <div className="qf-mapping-overlay">
            <Card style={{ width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-warning)', fontSize: 24 }}>warning</span>
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
          <h2 style={{ fontSize: 18, marginBottom: 16, fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 8, color: 'var(--color-primary)' }}>table_chart</span>
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
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 8, color: 'var(--color-primary)' }}>tune</span>
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
            
            <div style={{ marginTop: 'auto', paddingTop: 24 }}>
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

  @media (max-width: 768px) {
    .qf-mapping-shell {
      flex-direction: column;
      height: auto;
    }
  }
`;
