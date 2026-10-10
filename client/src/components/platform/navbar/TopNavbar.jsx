import { useMemo, useState } from 'react';
import SubmitConfirmationModal from '../../quiz/SubmitConfirmationModal';
import { CheckCircle, Settings } from 'lucide-react';
import { useQuizStore } from '../../../store/quizStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { getGuestSessionId } from '../../../utils/quizSession';
import api from '../../../api/axios';

export default function TopNavbar() {
  const { questions, answers, submitAttempt, submitting, isSubmitted } = useQuizStore();
  const { toggleDrawer } = useSettingsStore();

  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q._id]?.selectedAnswer)).length,
    [answers, questions]
  );

  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const handleSubmitClick = () => {
    if (localSubmitting || submitting || isSubmitted) return;
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowSubmitModal(false);
    if (typeof submitAttempt === 'function') {
      try { submitAttempt(); } catch {}
      return;
    }
    const attemptId = useQuizStore.getState().attemptId;
    const currentQuiz = useQuizStore.getState().quiz;
    if (!attemptId || !currentQuiz?._id) return;
    try {
      setLocalSubmitting(true);
      await useQuizStore.getState().syncWithBackend({ force: true });
      const sharedSessionId = useQuizStore.getState().sharedSessionId;
      const payload = {
        ...useQuizStore.getState().getSubmitPayload(),
        ...(sharedSessionId ? { sharedSessionId } : {}),
      };
      const sessionId = useQuizStore.getState().sessionId || getGuestSessionId();
      const response = await api.put(
        `/quiz/${currentQuiz._id}/attempt/${attemptId}`,
        payload,
        { headers: { 'x-quiz-session-id': sessionId, ...(sharedSessionId ? { 'x-shared-session-id': sharedSessionId } : {}) } }
      );
      useQuizStore.getState().setResult(response.data.data);
      window.location.href = `/result/${attemptId}`;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit quiz');
      setLocalSubmitting(false);
    }
  };

  return (
    <>
      <header className="ws-navbar-minimal">
        <div className="ws-nav-meta-minimal">
          Question {(useQuizStore.getState().currentIndex || 0) + 1} of {questions.length}
        </div>

        <div className="ws-nav-actions-minimal">
          <button className="ws-settings-btn" onClick={toggleDrawer} title="Settings">
            <Settings className="w-5 h-5" />
          </button>
          
          <button
            onClick={handleSubmitClick}
            disabled={submitting || localSubmitting || isSubmitted}
            className="ws-submit-btn-minimal"
          >
            {submitting || localSubmitting ? 'Submitting...' : 'Submit'}
            {!submitting && !localSubmitting && <CheckCircle className="w-4 h-4 opacity-70" />}
          </button>
        </div>
      </header>

      <SubmitConfirmationModal
        isOpen={showSubmitModal}
        answeredCount={answeredCount}
        totalQuestions={questions.length}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitModal(false)}
      />

      <style>{`
        .ws-navbar-minimal {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: transparent;
          z-index: 50;
        }

        .ws-nav-meta-minimal {
          font-size: 15px;
          font-weight: 600;
          color: #3f3f46;
        }

        .ws-nav-actions-minimal {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ws-settings-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #71717a;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ws-settings-btn:hover {
          background: #f4f4f5;
          color: #18181b;
        }

        .ws-submit-btn-minimal {
          height: 38px;
          padding: 0 20px;
          border-radius: 8px;
          border: none;
          background: #18181b;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ws-submit-btn-minimal:hover:not(:disabled) {
          background: #27272a;
        }
        
        .ws-submit-btn-minimal:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
