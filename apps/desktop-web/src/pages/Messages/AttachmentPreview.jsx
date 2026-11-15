import { useEffect, useRef, useState } from 'react';
import { File, FileSpreadsheet, FileText } from 'lucide-react';

export const ATTACHMENT_ACCEPT = '.pdf,.txt,.csv,.xlsx,.jpg,.jpeg,.png,.webp,.gif,.mp3,.wav,.m4a,.ogg,.mp4,.webm';

export function attachmentKind(name, mimeType = '') {
  if (/\.(pdf|txt|csv|xlsx)$/i.test(name)) return 'document';
  if (/\.(jpe?g|png|webp|gif)$/i.test(name) || mimeType.startsWith('image/')) return 'image';
  if (/\.(m4a|mp3|ogg|wav)$/i.test(name) || mimeType.startsWith('audio/')) return 'audio';
  if (/\.(mp4|webm)$/i.test(name) || mimeType.startsWith('video/')) return 'video';
  return null;
}

export function AttachmentDetails({ name, size }) {
  const extension = name?.match(/\.([a-z\d]{1,8})$/i)?.[1]?.toUpperCase();
  const Icon = ['XLSX', 'CSV'].includes(extension) ? FileSpreadsheet
    : ['PDF', 'TXT'].includes(extension) ? FileText : File;
  const bytes = Number.isFinite(size) && size > 0
    ? new Intl.NumberFormat(undefined, { style: 'unit', unit: size >= 1048576 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 })
      .format(size >= 1048576 ? size / 1048576 : Math.max(.1, size / 1024))
    : '';
  return <span className="chat-attachment-details">
    <span className="chat-attachment-icon"><Icon size={21} aria-hidden="true" /></span>
    <span className="chat-attachment-info">
      <strong title={name}>{name || 'Attachment'}</strong>
      <small>{[extension, bytes].filter(Boolean).join(' · ')}</small>
    </span>
  </span>;
}

export function AttachmentPreview({ kind, name, size, source, file }) {
  const [localSource, setLocalSource] = useState('');
  const [text, setText] = useState('');
  const [failedSource, setFailedSource] = useState('');
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLocalSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const url = source || localSource;
  const textFile = /\.(txt|csv)$/i.test(name);
  useEffect(() => {
    if (!url || !textFile) return;
    const controller = new AbortController();
    const read = file ? file.slice(0, 8192).text()
      : fetch(url, { headers: { Range: 'bytes=0-8191' }, credentials: 'same-origin', signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error(); return response.text(); });
    read.then(value => { if (!controller.signal.aborted) setText(value); })
      .catch(() => { if (!controller.signal.aborted) setFailedSource(url); });
    return () => controller.abort();
  }, [url, file, textFile]);
  const failed = url && failedSource === url;
  const onError = () => setFailedSource(url);

  return <div className="chat-preview-body">
    <AttachmentDetails name={name} size={size} />
    {failed ? <p role="status">Preview unavailable.</p>
      : url && kind === 'image' ? <img src={url} alt={name} onError={onError} />
      : url && kind === 'video' ? <video src={url} controls preload="metadata" aria-label={name} onError={onError} />
      : url && kind === 'audio' ? <audio src={url} controls preload="metadata" aria-label={name} onError={onError} />
      : url && textFile ? <pre tabIndex={0}>{text}</pre>
      : url && /\.pdf$/i.test(name) ? <PdfPreview source={url} label={name} />
      : kind === 'document' && /\.xlsx$/i.test(name) ? <p>Download the spreadsheet to open it.</p>
      : <p role="status">Loading preview…</p>}
  </div>;
}

function PdfPreview({ source, label }) {
  const canvas = useRef(null);
  const [status, setStatus] = useState('Loading PDF preview…');
  useEffect(() => {
    let disposed = false;
    let task;
    let rendering;
    async function render() {
      const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
        import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      if (disposed) return;
      GlobalWorkerOptions.workerSrc = workerUrl;
      task = getDocument({ url: source, isEvalSupported: false, disableAutoFetch: true, disableStream: true });
      const document = await task.promise;
      const page = await document.getPage(1);
      const context = canvas.current?.getContext('2d');
      if (disposed || !context) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(760 / Math.max(original.width, original.height), 1.5) });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      rendering = page.render({ canvasContext: context, viewport });
      await rendering.promise;
      if (!disposed) setStatus(`Page 1 of ${document.numPages}`);
    }
    render().catch(() => { if (!disposed) setStatus('PDF preview unavailable.'); });
    return () => { disposed = true; rendering?.cancel(); void task?.destroy().catch(() => {}); };
  }, [source]);
  return <div className="chat-preview-pdf"><canvas ref={canvas} role="img" aria-label={`First page of ${label}`} />
    <small role="status">{status}</small></div>;
}
