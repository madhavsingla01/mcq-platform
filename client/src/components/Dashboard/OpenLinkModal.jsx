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
      navigate(`/session/${data.shareCode}`);
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
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-[480px] pointer-events-auto">
          <div 
            className="rounded-2xl shadow-2xl overflow-hidden relative"
            style={{
              background: 'rgba(28, 28, 30, 0.7)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            role="dialog" 
            aria-modal="true" 
            aria-labelledby="open-shared-link-title"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
              <div className="flex items-center gap-4">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner"
                  style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)', color: '#a855f7' }}
                >
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="open-shared-link-title" className="text-lg font-semibold tracking-tight text-white m-0">Open Quiz Link</h2>
                  <p className="text-xs m-0 mt-0.5" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Join a session using a URL or code</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full transition-colors hover:bg-white/10"
                style={{ color: 'rgba(255, 255, 255, 0.6)' }}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6">
              <p className="text-sm mb-5" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Paste a shared quiz URL or invite code below to join the workspace.
              </p>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    className="w-full px-4 py-3 rounded-xl text-white outline-none transition-all placeholder:text-white/30"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: error ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                    }}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setError('');
                    }}
                    placeholder="e.g., https://app.com/session/code or just 'code'"
                    disabled={loading}
                    autoFocus
                    aria-label="Shared link or invite code"
                  />
                  {error && (
                    <p className="text-sm mt-2 text-red-400">{error}</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={onClose} 
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!input.trim() || loading}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)'
                  }}
                >
                  {loading ? (
                    <><Spinner size={16} /> Validating...</>
                  ) : (
                    <>Open Quiz <ArrowRight className="w-4 h-4 opacity-80" /></>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
