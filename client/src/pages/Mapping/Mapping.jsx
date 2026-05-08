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

  if (!parsedData) return <div>Loading mapping data...</div>;

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 140px)', position: 'relative' }}>
      
      {/* Validation Errors Modal overlay */}
      {validationErrors && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Card style={{ width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 20, color: 'var(--color-warning)', marginBottom: 16 }}>⚠️ Parser Validation Issues</h3>
            <p style={{ marginBottom: 16 }}>
              The quiz was generated, but {validationErrors.length} rows were skipped due to formatting errors.
            </p>
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-surface-alt)', padding: 16, borderRadius: 8, marginBottom: 24 }}>
              {validationErrors.map((err, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Row {err.row}:</span> {err.error}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button onClick={() => setValidationErrors(null)} variant="secondary">Go Back</Button>
              <Button onClick={handleProceedWithErrors}>Proceed to Quiz Anyway</Button>
            </div>
          </Card>
        </div>
      )}
      {/* Left: Preview Table */}
      <Card style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <h2 style={{ fontSize: 20, marginBottom: 16 }}>Data Preview</h2>
        <div style={{ overflow: 'auto', flex: 1, border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface-alt)', zIndex: 1 }}>
              <tr>
                {parsedData.headers.map(h => (
                  <th key={h} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedData.preview.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {parsedData.headers.map(h => (
                    <td key={h} style={{ padding: '12px 16px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(row[h] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Right: Mapping Controls */}
      <Card style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20 }}>Column Mapping</h2>
          {confidence !== null && (
            <Badge variant={confidence > 80 ? 'success' : confidence > 50 ? 'warning' : 'danger'}>
              AI Confidence: {confidence}%
            </Badge>
          )}
        </div>

        {error && <div style={{ color: 'var(--color-danger)', marginBottom: 16, fontSize: 14 }}>{error}</div>}

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
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: 'none',
                    background: mapping.options.includes(h) ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                    color: mapping.options.includes(h) ? '#fff' : 'var(--color-text)',
                    transition: 'all 0.2s'
                  }}
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
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      <select 
        value={value || ''} 
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-alt)',
          border: '1px solid var(--color-border)', color: 'var(--color-text)', outline: 'none'
        }}
      >
        <option value="">None (Column not present)</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
