import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Spinner, Input } from '../ui';
import { X, Link2, ArrowRight } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useEffect } from 'react';

export default function OpenLinkModal({ onClose }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { submitOpenLink } = useSessionStore();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError('');

    try {
      const data = await submitOpenLink(input);
      // Validated successfully. Navigate instantly.
      onClose();
      navigate(`/session/${data.shareCode}/quiz`);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[640px]">
          <Card className="shadow-lg border-zinc-200/40" style={{ padding: 0, overflow: 'hidden' }} role="dialog" aria-modal="true" aria-labelledby="open-shared-link-title">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="open-shared-link-title" className="text-lg font-semibold tracking-tight text-zinc-900">Open Shared Link</h2>
                  <p className="text-xs text-zinc-500">Join a shared workspace using a URL or invite code</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6">
              <p className="text-sm text-zinc-600 mb-4">
                Paste a shared quiz URL or invite code below to instantly join the collaborative workspace.
              </p>

              <div className="space-y-4">
                <div className="relative">
                  <Input
                    label="Link or Code"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setError('');
                    }}
                    placeholder="https://app.com/session/code or just 'code'"
                    disabled={loading}
                    autoFocus
                    error={error}
                    style={{ width: '100%' }}
                    aria-label="Shared link or invite code"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
                <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={!input.trim() || loading} style={{ gap: 8 }}>
                  {loading ? (
                    <span className="flex items-center gap-2"><Spinner size={16} /> Validating...</span>
                  ) : (
                    <span className="flex items-center gap-2">Open Workspace <ArrowRight className="w-4 h-4 opacity-70" /></span>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
