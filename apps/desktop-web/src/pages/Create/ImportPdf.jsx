import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ArrowLeft, FileText } from 'lucide-react';
import api from '../../api/axios';
import { Button, Input } from '../../components/ui';
import { isCompletePdfQuestion, parsePdfQuestions, toDraftPdfQuestion } from './pdfQuestions';
import './CreateHub.css';

GlobalWorkerOptions.workerSrc = workerUrl;
const maxFileBytes = 20 * 1024 * 1024;
const maxPages = 50;
const maxQuestions = 100;
const maxTextLength = 200000;
const maxTitleLength = 70;

export default function ImportPdf() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const questions = parsePdfQuestions(text);
  const firstIncomplete = questions.findIndex(question => !isCompletePdfQuestion(question));

  async function readPdf(file) {
    if (!file) return;
    setError('');
    if (!/\.pdf$/i.test(file.name) || file.size > maxFileBytes) {
      setError('Choose a PDF up to 20 MB.');
      return;
    }
    setBusy('Reading PDF…');
    let task;
    try {
      task = getDocument({ data: await file.arrayBuffer(), isEvalSupported: false, useSystemFonts: true });
      const pdf = await task.promise;
      if (pdf.numPages > maxPages) throw new Error('Choose a PDF with 50 pages or fewer.');
      const pages = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const content = await (await pdf.getPage(index)).getTextContent();
        pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
      }
      const extracted = pages.join('\n').trim();
      if (!extracted) throw new Error('This PDF has no selectable text. Use a text PDF or paste questions below.');
      if (extracted.length > maxTextLength) throw new Error('This PDF contains too much text. Split it into smaller files.');
      setTitle(file.name.replace(/\.pdf$/i, '').slice(0, maxTitleLength));
      setText(extracted);
    } catch (readError) {
      setError(readError.name === 'PasswordException' ? 'Choose an unlocked PDF.' : readError.message || 'The PDF could not be read.');
    } finally {
      await task?.destroy().catch(() => {});
      setBusy('');
    }
  }

  async function createDraft(event) {
    event.preventDefault();
    setError('');
    if (!questions.length || questions.length > maxQuestions || firstIncomplete !== -1) {
      setError(firstIncomplete !== -1
        ? `Question ${firstIncomplete + 1} needs distinct options and a matching Answer line.`
        : 'Enter between 1 and 100 numbered questions.');
      return;
    }
    setBusy('Creating draft…');
    try {
      const { data } = await api.post('/quiz/manual', {
        title: title.trim(),
        isDraft: true,
        visibility: 'private',
        questions: questions.map(toDraftPdfQuestion),
      });
      const draftId = data.data?.quizId;
      if (!draftId) throw new Error('The draft response was incomplete.');
      navigate(`/create/quiz?draftId=${encodeURIComponent(draftId)}`);
    } catch (saveError) {
      setError(saveError.response?.data?.message || saveError.message || 'Could not create the draft.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="hub-viewport">
      <div className="hub-container">
        <div className="app-page-tools">
          <Link to="/create" className="pdf-import-back"><ArrowLeft size={16} /> Create</Link>
        </div>
        <form className="pdf-import-form" onSubmit={createDraft}>
          <label className="pdf-import-file">
            <FileText size={20} aria-hidden="true" />
            <span>Choose a text PDF</span>
            <small>Up to 20 MB and 50 pages. Review the extracted text before creating a draft.</small>
            <input type="file" accept=".pdf,application/pdf" disabled={Boolean(busy)} onChange={event => {
              readPdf(event.target.files?.[0]);
              event.target.value = '';
            }} />
          </label>
          <Input label="Quiz title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={maxTitleLength} disabled={Boolean(busy)} />
          <label htmlFor="pdf-questions">Extracted questions</label>
          <p id="pdf-format">Use numbered questions, choices such as A. and B., and an Answer: A line for each question.</p>
          <textarea id="pdf-questions" aria-describedby="pdf-format" rows={12} maxLength={maxTextLength} disabled={Boolean(busy)}
            value={text} onChange={event => setText(event.target.value)} placeholder={'1. Which planet is closest to the Sun?\nA. Mercury\nB. Venus\nAnswer: A'} />
          {error && <p role="alert" className="pdf-import-error">{error}</p>}
          <footer><span role="status">{busy || `${questions.length} questions detected`}</span>
            <Button type="submit" disabled={Boolean(busy) || !title.trim() || !text.trim()}>Create quiz draft</Button></footer>
        </form>
      </div>
    </div>
  );
}
