import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import CompetitionStandings from './CompetitionStandings';

export default function CompetitionLeaderboardModal({ isOpen, onClose, challengeId, challengeTitle }) {
  const dialog = useRef(null);
  const titleId = useId();
  const open = isOpen && Boolean(challengeId);
  useEffect(() => {
    if (open) dialog.current.showModal();
    else if (dialog.current.open) dialog.current.close();
  }, [open]);

  return <dialog ref={dialog} className="contest-modal" aria-labelledby={titleId}
    onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
    {open && <div className="contest-modal-content">
      <div className="contest-modal-bar">
        <span id={titleId}>Competition standings</span>
        <button type="button" className="contest-action" aria-label="Close standings" onClick={() => dialog.current.close()}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <CompetitionStandings key={challengeId} challengeId={challengeId} initialTitle={challengeTitle} />
    </div>}
  </dialog>;
}
